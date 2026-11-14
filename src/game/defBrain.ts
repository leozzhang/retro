import { DEF_CALLS, packageFor, pickDefCall, type DefCall, type DefTags } from '../data/defenses';
const DEF_CALLS_BY_ID: Record<string, DefCall> = Object.fromEntries(DEF_CALLS.map((c) => [c.id, c]));
import { callTraits, preventLevel, situationMix, ZERO_DIALS, type DefIdentity, type Dials } from '../data/identity';
import type { OffStyle } from '../data/offStyles';
import type { PlayDef } from '../data/plays';
import type { DefSlot, OffSlot } from '../data/teams';
import { clamp, gauss, lerp, mulberry32, type Rng } from '../engine/math';
import { playTraits } from '../season/scouting';
import { breaksInside, LEAN_KEYS, NO_LEAN, type Lean } from '../sim/player';
import {
  damage, famDist, giveRate, layFilm, learn, residSig, rollShare, sigDist, leagueDist, leagueShares, lookKey, newModel, playDist, resid, sitBin, targetDist, type ModelParams, type OffModel, type RosterRead,
  type SitBin, OFF_MODEL, type FilmBook,
} from './offModel';
import { personnelOf } from './resolvePlay';
import type { Situation } from './situation';
import { addThrow, type AnticRole, type ThrowSeen } from './habits';

/**
 * The CPU defense learns your offense during a live game (docs/DEFENSE.md). Two layers:
 * - **The DC** keeps a model of your offense (game/offModel.ts): what you call by situation and look,
 *   who you throw to, and how it has gone against each of his calls next to what the film room says it
 *   should. Each snap he weighs every call by how well it stops what he expects, against how it does
 *   against a normal offense, and leans his identity's mix toward the ones that stop you
 *   (`dcMix`). How sharp and how far is his ADJUST rating (`dcAdjust`, data/coaches.ts), the team's smarts
 *   and the DEFENSE IQ setting (`ML_DC`).
 * - **Each defender** leans toward what you've been doing lately (a shorter memory), by his play
 *   recognition, with his own nerve: guessing right makes him bolder, getting burned makes him careful.
 *   Leans are double-edged in the sim (game/playState.ts): sitting on the run means biting on play action.
 *
 * It never sees the call you're about to make: only plays already run, the situation, the look you break
 * the huddle in, and what he knew before the game (your OC's book, your roster).
 * Plain JSON, reset each game. STATIC (`iq` 0) has no brain at all, and the game plays as before.
 */
export type Bucket = 'run' | 'qbRun' | 'screen' | 'quick' | 'mid' | 'deep' | 'pa' | 'rpo' | 'pass';
const BUCKETS: Bucket[] = ['run', 'qbRun', 'screen', 'quick', 'mid', 'deep', 'pa', 'rpo', 'pass'];

/**
 * Brain tuning: the buckets the players read and the DC's tags.
 * - `decay`: weight left on each older play in the DC's book; `flow`: the same for the players' shorter memory.
 * - `norm`: a normal offense's share of each bucket (runs include QB runs and scrambles), the baseline
 *   a tendency is measured from.
 * - `trust`: decayed plays before the DC half-believes a tendency, at skill 0 (a sharp DC needs `trustSharp`).
 * - `tag`: spy, contain and RPO pass-first odds per point of a share above normal; `tagMax`. Contain and
 *   spy also come from throws on the move (`roll`, `rollSpy` per point of the rollout share past `rollNorm`).
 * - `shortFrom`, `spamAt`, `passSpam`: against a pass play that's `spamAt` or more of the book, the
 *   players' read is `passSpam` stronger per point of share past `shortFrom` (they sit on it).
 * - `rate`: share of the way to his tag odds he closes each snap, from skill 0 to 1 (all of it at halftime).
 * - `iq`: the DEFENSE IQ setting's multiplier.
 */
export const DEF_BRAIN = {
  decay: 0.85,
  flow: 0.6,
  norm: { run: 0.45, qbRun: 0.08, screen: 0.07, quick: 0.2, mid: 0.2, deep: 0.12, pa: 0.12, rpo: 0.06 } as Record<string, number>,
  trust: 7,
  trustSharp: 3,
  tag: { spy: 3, contain: 2.5, rpo: 3, roll: 1.5, rollSpy: 0.5 },
  rollNorm: 0.15,
  tagMax: 0.6,
  shortFrom: 0.3,
  spamAt: 0.5,
  passSpam: 1.2,
  rate: { min: 0.12, max: 0.6 },
  iq: { STATIC: 0, NORMAL: 1, SHARP: 1.4 } as Record<DefenseIq, number>,
};

/**
 * The DC's calls (`dcMix`). Each pair runs from a weak DC (skill 0) to a sharp one (skill 1).
 * - `beta`: how hard he leans toward a call per point of stop rate it gains on you over a normal offense
 *   (× the IQ setting).
 * - `lam`: the most of his mix he hands to that lean; the rest is his identity's own mix. × the team's
 *   execution (`execute`) and the IQ setting (at most 1). This is the difficulty budget: a weak DC on a
 *   weak team barely moves.
 * - `misread`: SD of his error on each call's worth, per snap.
 * - `half`: at halftime every DC studies the first half: his skill for reading you moves this far toward 1.
 * - `heavy`: when the short-yardage plays he expects pass this share, the goal-line call opens on any down.
 * - `say`: the shift (in each trait's share of the mix) that reads as a dial of 1 for the headlines.
 * - `key`: keying a receiver (`DefTags.key`). Of the throws he expects, the top receiver's share past `from`
 *   (a normal offense's top target gets about a third), plus `res` × how far that receiver has beaten the
 *   film's expectation, × `odds`, × his lean budget's share of the most, at most `max`.
 * - `trap`: the trap (`trapRead`): the top habit's concentration past `from`, × `odds`, × his lean budget's share, at most `max`.
 * - `leans`: how far the players' read moves toward the DC's model of this situation and look (`modelRead`),
 *   × the team's smarts: they know this offense throws on 3rd and long from trips.
 */
export const ML_DC = {
  beta: [6, 16],
  lam: [0.35, 0.85],
  misread: [0.04, 0.01],
  half: 0.35,
  heavy: 0.35,
  say: 3,
  key: { from: 0.4, odds: 3, res: 1.5, max: 0.7 },
  trap: { from: 0.35, odds: 2, max: 0.6 },
  leans: 0.5,
};

/**
 * Player anticipation tuning.
 * - `scale`: each lean per point of the recent share above normal.
 * - `prc`: how much play recognition decides it: a 0 reader gets `prc.min` of the team's read, a 100 reader all of it.
 * - `jitter`: SD of a defender's own guess each snap.
 * - `inside`: the leverage lean per point of the recent inside share of intermediate throws (`laneOf`) past half;
 *   `laneConf`: lane throws before they half-believe it.
 * - nerve: `bold` added when his lean was right, `burned` taken when he got beat on it (a 12+ yard
 *   gain on a ball thrown more than `overTop` yards downfield, or `laneGain`+ on a throw breaking the other
 *   way from his leverage), `nerveDecay` kept each snap, within ±`nerveMax`.
 */
export const ANTICIPATE = {
  scale: { run: 2.2, screen: 4, qb: 3.5, deep: 3, inside: 2.4 },
  laneConf: 1.5,
  laneGain: 8,
  prc: { min: 0.3 },
  jitter: 0.12,
  bold: 0.15,
  burned: 0.45,
  nerveDecay: 0.7,
  nerveMax: 0.6,
  overTop: 10,
};

/**
 * The presnap check (docs/DEFENSE.md): once the offense breaks the huddle, the DC sees its personnel and
 * formation (never the play) and may check to the call that fits what that look runs.
 * - `min`: decayed snaps from a look before the players read it; `trust` before they half-believe it.
 * - `odds`: the chance he checks when the look changes his mix (`skillMin` of it for a weak DC), × the
 *   team's smarts and the IQ setting, at most `max`; `from`: the smallest change in his mix (total
 *   variation) worth a check.
 * - `lean`: how far the players' read moves toward what the look has shown (`leansFor`), × the
 *   team's smarts and the look's confidence: they know a run formation when they see one.
 */
export const CHECK = { min: 2, trust: 3, odds: 0.6, skillMin: 0.35, max: 0.75, from: 0.15, lean: 0.8 };

/**
 * How smart the whole defense is, 0..1, from the defenders' play recognition (`prc`): a 50 unit is
 * `floor`, 90 is 1. It caps what the staff can get the players to do in-game (the checks), so a weak
 * team is a less smart defense (and the balance holds).
 */
export function teamSmarts(prc: number[]): number {
  const m = prc.reduce((a, b) => a + b, 0) / Math.max(1, prc.length);
  return clamp(lerp(SMARTS.floor, 1, (m - SMARTS.lo) / (SMARTS.hi - SMARTS.lo)), SMARTS.floor, 1);
}
/** `dcMin`: how much of the DC's plan a defense with no smarts carries out (all of it at 1). */
const SMARTS = { lo: 50, hi: 90, floor: 0.25, dcMin: 0.5 };
/** How much of the DC's in-game plan this defense carries out, by its smarts. */
const execute = (b: DefBrain) => lerp(SMARTS.dcMin, 1, b.smarts);

/** The look the defense keys on: personnel and formation. Never the play (audibles keep personnel). */
export function lookOf(p: PlayDef): string {
  return lookKey(p);
}

export type DefenseIq = 'STATIC' | 'NORMAL' | 'SHARP';

/** Decayed snaps by bucket, and a play's own share. */
interface Tally {
  n: Record<Bucket, number>;
  total: number;
  plays: Record<string, number>;
}

export interface DefBrain {
  iq: number;
  /** ADJUST as 0..1, and SCOUT as 0..1. */
  skill: number;
  scout: number;
  /** The defense's smarts as a unit (`teamSmarts`), 0..1. */
  smarts: number;
  /** The DC's model of your offense (game/offModel.ts). */
  model: OffModel;
  /** Past halftime: he has studied the first half. */
  half: boolean;
  /** What he's seen from each look (`lookOf`), long memory. */
  looks: Record<string, Tally>;
  /** The DC's book (long memory) and the players' (short memory). */
  book: Tally;
  flow: Tally;
  /** Short-yardage snaps only (long memory), by play. */
  short: Tally;
  /** How far his last mix leaned from his identity's, as dials (for the headlines); his tag odds. */
  shift: Dials;
  tags: { spy: number; contain: number; rpo: number };
  /** The goal-line call was open on the last snap against a short-yardage play he expects. */
  heavy: string | null;
  /** The receiver he keyed on the last snap (`DefTags.key`), if any; who he'd key and the odds, on the last call. */
  keyed: OffSlot | null;
  keyRead: { slot: OffSlot; odds: number } | null;
  /** Who plays each of the offense's slots ("name #num"), for the headlines. */
  who: Record<string, string>;
  /** The user's throws (game/habits.ts), each defender's experience of being beaten on them, and his nerve for jumping them. */
  habits: ThrowSeen[];
  exp: Partial<Record<DefSlot, number>>;
  jumpNerve: Partial<Record<DefSlot, number>>;
  /** The habit answers on the last snap (who sat in the lane, jumped, chased), for the headlines; the trap's odds. */
  answered: Partial<Record<AnticRole, number>>;
  trapOdds: number;
  /** Intermediate throws breaking inside or outside (`laneOf`), on the players' short memory. */
  lanes: { in: number; out: number };
  /** The players' team read on the last snap (for the headlines). */
  read: Lean;
  /** Each defender's nerve, by slot. */
  nerve: Partial<Record<DefSlot, Lean>>;
  /** Leans and the call on the last snap, for the nerve update. */
  last: { leans: Partial<Record<DefSlot, Lean>>; call: string } | null;
  /** Banner keys announced (cleared when the shift fades) and whether this drive has had one. */
  said: string[];
  saidThisDrive: boolean;
  /** Plays seen that were runs (for `runSpam`). */
  runIds: string[];
  seed: number;
  draws: number;
}

const tally = (): Tally => ({ n: Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>, total: 0, plays: {} });

/**
 * A new brain for one game. `qbMobility` (0..1, from the user QB's speed) seeds the DC's pregame
 * read of how often he'll run, weighted by the DC's scouting (`scout`, 0..99). `book` and `style` are
 * the offense's OC's (public); `roster` is the DC's read of the offense's players (`rosterRead`); `film`,
 * the offense's past live games (`TeamState.film`).
 */
export function newBrain(o: {
  iq: DefenseIq; adjust: number; scout: number; qbMobility: number; seed: number; smarts?: number;
  book?: readonly PlayDef[]; style?: OffStyle; roster?: RosterRead; film?: FilmBook;
}): DefBrain | null {
  const iq = DEF_BRAIN.iq[o.iq];
  if (!iq) return null;
  const skill = clamp((o.adjust - 40) / 45, 0, 1);
  const scout = clamp(o.scout / 100, 0, 1);
  const b: DefBrain = {
    iq, skill, scout, smarts: o.smarts ?? 1, half: false,
    model: newModel({ book: o.book ?? [], style: o.style, roster: o.roster, prm: { skill, scout } }),
    looks: {}, book: tally(), flow: tally(), short: tally(),
    shift: { ...ZERO_DIALS }, tags: { spy: 0, contain: 0, rpo: 0 }, heavy: null, keyed: null, keyRead: null, who: o.roster?.who ?? {}, habits: [], exp: {}, jumpNerve: {}, answered: {}, trapOdds: 0,
    lanes: { in: 0, out: 0 }, read: { ...NO_LEAN },
    nerve: {}, last: null, said: [], saidThisDrive: false, runIds: [], seed: o.seed >>> 0, draws: 0,
  };
  // The pregame read: a mobile QB shows up as a couple of QB runs already in the book.
  const prior = clamp(scout * 2 * o.qbMobility, 0, 2);
  if (prior > 0) {
    b.book.n.qbRun += prior;
    b.book.total += prior;
  }
  // The film of your past games, as much as his scouting got out of it.
  if (o.film) {
    layFilm(b.model, o.film, { skill, scout });
    // The players watched it too: last week's throws, as much as the staff got out of it.
    const w = lerp(OFF_MODEL.film.w[0], OFF_MODEL.film.w[1], scout);
    b.habits = (o.film.throws ?? []).map((t) => ({ ...t, w: t.w * w }));
  }
  target(b, true);
  return b;
}

/** The model's knobs for this DC now: after halftime he reads you better. */
export function paramsOf(b: DefBrain): ModelParams {
  return { skill: b.half ? lerp(b.skill, 1, ML_DC.half) : b.skill, scout: b.scout };
}

/** The brain's own random stream, so the live game's draws are the same with or without it. */
function rnd(b: DefBrain): Rng {
  const r = mulberry32(b.seed + b.draws * 0x9e3779b1);
  b.draws++;
  return r;
}

/**
 * A play's buckets, as the defense saw it: a run (an RPO the QB gave is a run, and an RPO), the QB
 * keeping it or scrambling, a screen or play action (`playTraits`), and where the ball went: `air` yards
 * past the line (0 for no throw) makes it quick (`QUICK_AIR` or less, or a quick-game play), deep
 * (`DEEP_AIR` or more) or in between (`mid`).
 */
export function bucketsOf(p: PlayDef, scrambled: boolean, kept: boolean, air: number, handedOff = false): Bucket[] {
  if (p.qbRun || kept) return ['qbRun'];
  if (p.kind === 'run') return ['run'];
  if (scrambled) return ['qbRun'];
  const rpo = p.read === 'rpo';
  if (rpo && handedOff) return ['run', 'rpo'];
  const t = playTraits(p);
  const out: Bucket[] = ['pass'];
  if (t.has('screen')) out.push('screen');
  else if (t.has('quick') || (air > 0 && air <= QUICK_AIR)) out.push('quick');
  if (air > QUICK_AIR && air < DEEP_AIR) out.push('mid');
  if (air >= DEEP_AIR) out.push('deep');
  if (t.has('pa') || t.has('rpo')) out.push('pa');
  if (rpo) out.push('rpo');
  return out;
}
const QUICK_AIR = 6;
const DEEP_AIR = 15;
/** Throws this far downfield (from `LANE_AIR[0]` to `[1]` yd) count for leverage (`laneOf`). */
const LANE_AIR = [4, 20];

/**
 * Which way a thrown ball broke, for the leverage read: 'in' when it came down inside where its
 * receiver lined up (`breaksInside`), 'out' otherwise; null for no throw, a short one or a deep one.
 */
export function laneOf(p: {
  thrown: boolean; intended: { start: { y: number } } | null; ballTarget: { x: number; y: number } | null; ballY: number; los: number;
}): 'in' | 'out' | null {
  if (!p.thrown || !p.intended || !p.ballTarget) return null;
  const air = p.ballTarget.x - p.los;
  if (air < LANE_AIR[0] || air > LANE_AIR[1]) return null;
  return breaksInside(p.intended.start.y, p.ballY, p.ballTarget.y) ? 'in' : 'out';
}

function add(t: Tally, decay: number, buckets: Bucket[], playId: string): void {
  for (const k of BUCKETS) t.n[k] *= decay;
  for (const k of Object.keys(t.plays)) t.plays[k] *= decay;
  t.total = t.total * decay + 1;
  for (const k of buckets) t.n[k] += 1;
  t.plays[playId] = (t.plays[playId] ?? 0) + 1;
}

/** A bucket's share of the book; runs count QB runs. */
function share(t: Tally, k: Bucket | 'allRun'): number {
  if (!t.total) return 0;
  return (k === 'allRun' ? t.n.run + t.n.qbRun : t.n[k]) / t.total;
}

/** One snap the user ran, as the defense saw it. */
export interface SnapSeen {
  play: PlayDef;
  call: DefCall;
  /** The call's tags (the film has columns for some). */
  tags?: DefTags;
  down: number;
  toGo: number;
  yardsToGoal: number;
  gain: number;
  success: boolean;
  scrambled: boolean;
  kept: boolean;
  /** The ball was thrown past this many yards downfield (0 for none). */
  air: number;
  /** An RPO the QB handed off. */
  handedOff?: boolean;
  /** Which way an intermediate throw broke (`laneOf`). */
  lane?: 'in' | 'out' | null;
  /** The slot the ball was thrown to (X, Z, SL, TE, RB), if it was thrown. */
  target?: string | null;
  /** A sack or a turnover. */
  lost?: boolean;
  /** The throw as the defense remembers it (`Play.throwRecord`), and who answered it how (`Play.anticLog`). */
  throw?: Omit<ThrowSeen, 'w'> | null;
  antic?: Partial<Record<DefSlot, AnticRole>>;
}

/** Learn from a snap: the model, the players' books, each defender's nerve, then the tag odds. */
export function observe(b: DefBrain, s: SnapSeen): void {
  const bk = bucketsOf(s.play, s.scrambled, s.kept, s.air, s.handedOff);
  if (s.play.kind === 'run' && !b.runIds.includes(s.play.id)) b.runIds.push(s.play.id);
  b.lanes.in *= DEF_BRAIN.flow;
  b.lanes.out *= DEF_BRAIN.flow;
  if (s.lane) b.lanes[s.lane] += 1;
  add(b.book, DEF_BRAIN.decay, bk, s.play.id);
  add(b.flow, DEF_BRAIN.flow, bk, s.play.id);
  add((b.looks[lookOf(s.play)] ??= tally()), DEF_BRAIN.decay, bk, s.play.id);
  const sit = sitBin(s.down, s.toGo, s.yardsToGoal);
  if (sit === 'short') add(b.short, DEF_BRAIN.decay, bk, s.play.id);
  learn(b.model, {
    play: s.play, call: s.call, tags: s.tags, sit, gain: s.gain, lost: s.lost, yardsToGoal: s.yardsToGoal, handedOff: s.handedOff, target: s.target,
    throw: s.throw,
  });
  nerve(b, s, bk);
  learnThrow(b, s);
  target(b, false);
}

/**
 * Habit tuning for the players (`anticFor`, `learnThrow`).
 * - `team`: the team's read at full smarts; × each defender's play recognition (`prc.min` of it for a 0
 *   reader, all of it at 100), the DC's film and the team's smarts (`teamSmarts`): a weak defense learns less.
 * - `exp`: anticipation per point of a defender's own experience (beaten on a throw `beatenGain`+ yd), × his
 *   play recognition the same way,
 *   which keeps `expDecay` a pass.
 * - `bold`/`burned`: nerve for jumping, from a ball he got to, or a gain of `burnedGain`+ while he
 *   sat in the lane or jumped; keeps `nerveDecay` a pass, within ±`nerveMax`.
 */
export const HABIT_PLAYERS = { team: 0.75, prc: { min: 0.3 }, exp: 0.2, beatenGain: 6, expDecay: 0.85, bold: 0.1, burned: 0.35, burnedGain: 15, nerveDecay: 0.7, nerveMax: 0.5 };

/** Remember the throw; the beaten defender learns from it, and those who jumped it win or lose nerve. */
function learnThrow(b: DefBrain, s: SnapSeen): void {
  const H = HABIT_PLAYERS;
  const t = s.throw;
  if (!t) return;
  b.habits = addThrow(b.habits, t);
  for (const k of Object.keys(b.exp) as DefSlot[]) b.exp[k]! *= H.expDecay;
  for (const k of Object.keys(b.jumpNerve) as DefSlot[]) b.jumpNerve[k]! *= H.nerveDecay;
  if (t.caught && t.gain >= H.beatenGain && t.beaten) b.exp[t.beaten] = (b.exp[t.beaten] ?? 0) + 1;
  b.answered = {};
  for (const [slot, role] of Object.entries(s.antic ?? {}) as [DefSlot, AnticRole][]) {
    b.answered[role] = (b.answered[role] ?? 0) + 1;
    if (role === 'plus') continue;
    const bump = (v: number) => (b.jumpNerve[slot] = clamp((b.jumpNerve[slot] ?? 0) + v, -H.nerveMax, H.nerveMax));
    if (s.gain >= H.burnedGain) bump(-H.burned);
    else if (!t.caught || s.lost) bump(H.bold);
  }
}

/**
 * Each defender's anticipation of the user's throws this snap (0..1): the team's read by his play
 * recognition, the DC's film and the team's smarts, plus his own experience and nerve. Zero with no throws seen.
 */
export function anticFor(b: DefBrain, prc: Partial<Record<DefSlot, number>>): Partial<Record<DefSlot, number>> {
  if (!b.habits.length) return {};
  const H = HABIT_PLAYERS;
  const film = H.team * b.iq * lerp(0.6, 1, b.skill) * b.smarts;
  const out: Partial<Record<DefSlot, number>> = {};
  for (const [slot, p] of Object.entries(prc) as [DefSlot, number][]) {
    const read = lerp(H.prc.min, 1, p / 100);
    out[slot] = clamp(read * film + H.exp * read * (b.exp[slot] ?? 0) + (b.jumpNerve[slot] ?? 0), 0, 1);
  }
  return out;
}

/** Nerve: right guesses embolden, getting beaten on a guess makes a defender careful for a few snaps. */
function nerve(b: DefBrain, s: SnapSeen, bk: Bucket[]): void {
  const A = ANTICIPATE;
  for (const n of Object.values(b.nerve)) for (const k of LEAN_KEYS) n![k] *= A.nerveDecay;
  const leans = b.last?.leans ?? {};
  const run = bk.includes('run') || bk.includes('qbRun');
  // Burned: a big gain on a ball thrown over the top of him.
  const bigPass = !run && s.gain >= 12 && s.air > ANTICIPATE.overTop;
  for (const [slot, l] of Object.entries(leans) as [DefSlot, Lean][]) {
    const n = (b.nerve[slot] ??= { ...NO_LEAN });
    const bump = (k: keyof Lean, v: number) => (n[k] = clamp(n[k] + v, -A.nerveMax, A.nerveMax));
    if (l.run > 0.2) {
      if (run && s.gain <= 1) bump('run', A.bold);
      if (bigPass) bump('run', -A.burned); // sat on the run and the ball went over him
    }
    if (l.screen > 0.2) {
      if (bk.includes('screen') && s.gain <= 2) bump('screen', A.bold);
      if (bigPass && !bk.includes('screen')) bump('screen', -A.burned);
    }
    if (l.deep > 0.2 && run && s.gain >= 6) bump('deep', -A.burned);
    if (run && bk.includes('qbRun') && s.gain >= 8) bump('qb', A.bold);
    // Leverage: beaten the other way, he plays it straighter for a while; right on an inside break, bolder.
    if (s.lane) {
      const lean = s.lane === 'in' ? l.inside : -l.inside;
      if (lean < -0.2 && s.gain >= A.laneGain) bump('inside', s.lane === 'in' ? A.burned : -A.burned);
      if (lean > 0.2 && s.gain <= 3) bump('inside', s.lane === 'in' ? A.bold : -A.bold);
    }
  }
}

/** The DC's tag odds (spy, contain, RPO pass-first) from the book, a step toward them (all the way at halftime or the first read). */
function target(b: DefBrain, snap: boolean): void {
  const B = DEF_BRAIN;
  const N = B.norm;
  const t = b.book;
  const trust = lerp(B.trust, B.trustSharp, b.skill);
  const conf = t.total / (t.total + trust);
  const qb = share(t, 'qbRun') - N.qbRun;
  const rpo = share(t, 'rpo') - N.rpo;
  // A QB who throws on the move: contain the edge he rolls to, and a little more spy.
  const roll = Math.max(0, rollShare(b.model) - B.rollNorm) * Math.min(1, share(t, 'pass') * 2);
  const k = conf * b.iq * execute(b);
  const tag = (v: number) => clamp(v * k, 0, B.tagMax);
  const step = snap ? 1 : lerp(B.rate.min, B.rate.max, b.skill);
  b.tags.spy = lerp(b.tags.spy, tag(B.tag.spy * qb + B.tag.rollSpy * roll), step);
  b.tags.contain = lerp(b.tags.contain, tag(B.tag.contain * qb + B.tag.roll * roll), step);
  b.tags.rpo = lerp(b.tags.rpo, tag(B.tag.rpo * rpo), step);
}

/** Halftime: every DC studies the first half (`ML_DC.half`) and closes the gap on his tags. */
export function halftime(b: DefBrain): void {
  b.half = true;
  target(b, true);
}

/** A play the user keeps calling on any down, run or pass: its share of the book, once it passes `spamAt`. */
function playSpam(b: DefBrain): { id: string; share: number; run: boolean } | null {
  const t = b.book;
  if (t.total < 3) return null;
  let best: { id: string; share: number } | null = null;
  for (const [id, n] of Object.entries(t.plays)) if (!best || n > best.share * t.total) best = { id, share: n / t.total };
  return best && best.share >= DEF_BRAIN.spamAt ? { ...best, run: b.runIds.includes(best.id) } : null;
}
/** A pass he's seen over and over. */
function passSpam(b: DefBrain): { id: string; share: number } | null {
  const s = playSpam(b);
  return s && !s.run ? s : null;
}

// ------------------------------------------------------------ the DC's calls

/** What `dcMix` worked out, for the call, the check and the debug overlay. */
export interface DcRead {
  mix: Record<string, number>;
  /** The identity's own mix for the snap, and each call's stop rate over a normal offense's. */
  base: Record<string, number>;
  gain: Record<string, number>;
  /** The plays he expects, most likely first. */
  expect: { id: string; w: number }[];
  /** His lean budget this snap (`ML_DC.lam`, executed). */
  lam: number;
  /** The receiver he'd key, the odds he does, and that receiver's share of the throws he expects. */
  key: { slot: OffSlot; odds: number; share: number } | null;
}

/**
 * The DC's mix for a snap. For each call in the identity's mix: the damage he expects (each play he
 * expects × its film damage against the call, plus what you've done against that kind of call over
 * film, drawn from its spread), against the damage a normal offense does to it. He leans the identity's
 * mix toward the calls that stop you better than they stop a normal offense, by `beta`, and hands that
 * lean `lam` of the mix. A varied offense that looks like the league moves nothing; a book or a habit he
 * can read does. `look` (the presnap check) narrows what he expects to the plays from that look.
 */
export function dcMix(
  b: DefBrain, id: DefIdentity, down: number, toGo: number, yardsToGoal: number, r: Rng, late?: Situation, look?: string,
): DcRead {
  const prm = paramsOf(b);
  const sit: SitBin = sitBin(down, toGo, yardsToGoal);
  const expect = playDist(b.model, prm, sit, look);
  // A short-yardage play he expects: the goal-line call opens on any down.
  const shortShare = expect.reduce((a, x) => a + (x.p.short ? x.w : 0), 0);
  const heavyNow = sit !== 'short' && shortShare >= ML_DC.heavy;
  b.heavy = heavyNow ? [...expect].sort((x, y) => (y.p.short ? y.w : 0) - (x.p.short ? x.w : 0))[0].p.id : null;
  const base = situationMix(id, down, toGo, yardsToGoal, undefined, heavyNow, late);
  const give = giveRate(b.model);
  const ids = Object.keys(base);
  const at = (k: number[]) => lerp(k[0], k[1], prm.skill);
  const misread = at(ML_DC.misread);
  const gain: Record<string, number> = {};
  // How you throw (the habit signatures), on the share of the plays he expects that are throws.
  const sd = sigDist(b.model, prm, look);
  const passShare = expect.reduce((a, x) => a + x.w * (x.p.kind === 'run' ? (x.p.read === 'rpo' ? 1 - give : 0) : 1), 0);
  for (const cid of ids) {
    const c = DEF_CALLS_BY_ID[cid];
    const z = gauss(r);
    let habit = 0;
    for (const [g, w] of Object.entries(sd)) habit += w * residSig(b.model, prm, g, c, z);
    const res = new Map<string, number>();
    let mine = 0;
    for (const x of expect) {
      const f = x.p.tags.family;
      let rf = res.get(f);
      if (rf === undefined) res.set(f, (rf = resid(b.model, prm, f, c, z)));
      mine += x.w * (damage(x.p, c, give) + rf);
    }
    gain[cid] = leagueDamage(sit, c) - mine - passShare * habit + gauss(r) * misread;
  }
  const beta = at(ML_DC.beta) * b.iq;
  const lam = at(ML_DC.lam) * execute(b) * Math.min(1, b.iq);
  const mean = ids.reduce((a, k) => a + base[k] * gain[k], 0);
  const raw: Record<string, number> = {};
  for (const k of ids) raw[k] = base[k] * Math.exp(beta * (gain[k] - mean));
  const tot = Object.values(raw).reduce((a, v) => a + v, 0) || 1;
  const mix: Record<string, number> = {};
  for (const k of ids) mix[k] = (1 - lam) * base[k] + (lam * raw[k]) / tot;
  // Who he expects the ball to go to: the throws over the plays he expects.
  const slots: Record<string, number> = {};
  let passes = 0;
  for (const x of expect) {
    const td = targetDist(b.model, prm, x.p.id);
    const pass = x.p.read === 'rpo' ? 1 - give : 1;
    for (const [sl, v] of Object.entries(td)) {
      slots[sl] = (slots[sl] ?? 0) + x.w * pass * v;
      passes += x.w * pass * v;
    }
  }
  let key: DcRead['key'] = null;
  const top = Object.entries(slots).sort((a, b2) => b2[1] - a[1])[0];
  if (top && passes > 0) {
    const K = ML_DC.key;
    const share = top[1] / passes;
    const tr = b.model.tres[top[0]];
    const beat = tr ? Math.max(0, tr.d / (tr.n + at(OFF_MODEL.res.call))) : 0;
    const odds = clamp(K.odds * (Math.max(0, share - K.from) + K.res * beat) * Math.min(1, passes * 2) * (lam / ML_DC.lam[1]), 0, K.max);
    if (odds > 0) key = { slot: top[0] as OffSlot, odds, share };
  }
  return { mix, base, gain, lam, expect: expect.sort((x, y) => y.w - x.w).slice(0, 8).map((x) => ({ id: x.p.id, w: x.w })), key };
}

const leagueCache = new Map<string, number>();
/** What a normal offense does to a call in a situation (film damage over the league's plays). */
function leagueDamage(sit: SitBin, c: DefCall): number {
  const k = `${sit}|${c.id}`;
  let v = leagueCache.get(k);
  if (v === undefined) {
    v = 0;
    for (const x of leagueDist(sit)) v += x.w * damage(x.p, c, 0.5);
    leagueCache.set(k, v);
  }
  return v;
}

/**
 * The trap (`DefTags.trap`): when the user's throws pile up on one receiver from one side (the habit
 * records, game/habits.ts), the DC calls the corner and flat defender to that side to sit on it. Odds by
 * how concentrated the habit is past `ML_DC.trap.from`, × `odds` × his lean budget's share, at most `max`.
 */
function trapRead(b: DefBrain, read: DcRead): { side: 'strong' | 'weak'; odds: number } | null {
  if (!b.habits.length) return null;
  const T = ML_DC.trap;
  const by = new Map<string, { w: number; dy: number }>();
  let tot = 0;
  for (const h of b.habits) {
    tot += h.w;
    const k = `${h.slot}|${h.roll}`;
    const e = by.get(k) ?? { w: 0, dy: 0 };
    e.w += h.w;
    e.dy += h.w * (h.roll !== 0 ? h.roll : Math.sign(h.dy));
    by.set(k, e);
  }
  const top = [...by.values()].sort((x, y) => y.w - x.w)[0];
  const conc = (top.w / tot) * (tot / (tot + 2));
  const lam = read.lam;
  const odds = clamp(T.odds * (conc - T.from) * (lam / ML_DC.lam[1]), 0, T.max);
  return odds > 0 && top.dy !== 0 ? { side: top.dy > 0 ? 'strong' : 'weak', odds } : null;
}

/** How far a mix leans from another, as the identity's dials (scaled by `ML_DC.say`), for the headlines. */
function leanOf(mix: Record<string, number>, base: Record<string, number>): Dials {
  const d: Dials = { ...ZERO_DIALS };
  for (const [k, w] of Object.entries(mix)) {
    const t = callTraits(DEF_CALLS_BY_ID[k]);
    const dw = w - (base[k] ?? 0);
    d.blitz += dw * Math.min(1, t.blitz);
    d.man += dw * t.man;
    d.twoHigh += dw * t.twoHigh;
    d.box += dw * Math.min(1, Math.max(-1, t.box));
  }
  for (const k of Object.keys(d) as (keyof Dials)[]) d[k] *= ML_DC.say;
  return d;
}

/** The DC's last read, for the debug overlay. */
export let lastRead: DcRead | null = null;

/** The DC's call for this snap: one draw from the game's stream for the call, the rest from the brain's own. */
export function callFor(
  b: DefBrain, id: DefIdentity, down: number, toGo: number, yardsToGoal: number, rng: Rng, late?: Situation,
): { call: DefCall; tags: DefTags } {
  const r = rnd(b);
  const read = dcMix(b, id, down, toGo, yardsToGoal, r, late);
  lastRead = read;
  b.shift = leanOf(read.mix, read.base);
  const call = pickDefCall(rng, read.mix);
  const tags: DefTags = {};
  if (call.spyFrom && r() < b.tags.spy) tags.spy = true;
  if (r() < b.tags.contain) tags.contain = true;
  if (r() < b.tags.rpo) tags.rpo = true;
  if (preventLevel(late)) tags.prevent = true;
  // A trap to the side the user's habit throws to: the corner and flat defender there sit on it.
  const trap = trapRead(b, read);
  b.trapOdds = trap?.odds ?? 0;
  if (trap && !tags.prevent && r() < trap.odds) tags.trap = trap.side;
  // Keying the receiver he expects the ball to go to (never in prevent: everyone's deep).
  b.keyed = null;
  b.keyRead = read.key ? { slot: read.key.slot, odds: read.key.odds } : null;
  if (read.key && !tags.prevent && r() < read.key.odds) {
    tags.key = read.key.slot;
    b.keyed = read.key.slot;
  }
  return { call, tags };
}

/**
 * The presnap check: the offense broke the huddle in `play`'s look. He works out his mix again with only
 * the plays he expects from that look; if it moved by `CHECK.from` or more, he may check to a call drawn
 * from it, in the same package (the personnel on the field doesn't change). Null to stay in the call.
 * Draws only from the brain's own stream.
 */
export function checkFor(
  b: DefBrain, id: DefIdentity, play: PlayDef, now: DefCall, down: number, toGo: number, yardsToGoal: number, late?: Situation,
): DefCall | null {
  const t = b.looks[lookOf(play)];
  if (!t || t.total < CHECK.min || preventLevel(late)) return null;
  const r = rnd(b);
  const huddle = dcMix(b, id, down, toGo, yardsToGoal, mulberry32(b.seed ^ (b.draws * 7919)), late);
  const here = dcMix(b, id, down, toGo, yardsToGoal, mulberry32(b.seed ^ (b.draws * 7919)), late, lookOf(play));
  const pkg = (c: DefCall) => c.pkg ?? packageFor(personnelOf(play.formation));
  const mix = { ...here.mix };
  for (const k of Object.keys(mix)) if (pkg(DEF_CALLS_BY_ID[k]) !== pkg(now)) mix[k] = 0;
  // How far the look moved his mix within the package (total variation).
  const sum = (m: Record<string, number>) => Object.entries(m).reduce((a, [k, v]) => a + (pkg(DEF_CALLS_BY_ID[k]) === pkg(now) ? v : 0), 0) || 1;
  const hs = sum(huddle.mix);
  const ms = sum(mix);
  let tv = 0;
  for (const k of Object.keys(mix)) if (pkg(DEF_CALLS_BY_ID[k]) === pkg(now)) tv += Math.abs(mix[k] / ms - (huddle.mix[k] ?? 0) / hs) / 2;
  const odds = clamp(CHECK.odds * lerp(CHECK.skillMin, 1, b.skill) * b.smarts * b.iq, 0, CHECK.max);
  if (tv < CHECK.from || r() >= odds) return null;
  // Only to a call the look says is better than the one he's in.
  const call = pickDefCall(r, mix);
  return call.id === now.id || pkg(call) !== pkg(now) || here.gain[call.id] <= (here.gain[now.id] ?? -Infinity) ? null : call;
}

/**
 * Each defender's lean this snap: the players' recent read of the offense, by his play recognition
 * (`prc`, by slot), plus his nerve and a guess of his own. Remembered for the nerve update.
 */
export function leansFor(
  b: DefBrain, prc: Partial<Record<DefSlot, number>>, call: DefCall, look?: PlayDef, at?: { down: number; toGo: number; yardsToGoal: number },
): Partial<Record<DefSlot, Lean>> {
  const A = ANTICIPATE;
  const ln = b.lanes.in + b.lanes.out;
  // A pass he keeps seeing: they sit on it harder.
  const ps = passSpam(b);
  const sit = ps ? 1 + DEF_BRAIN.passSpam * (ps.share - DEF_BRAIN.shortFrom) : 1;
  const team = { ...readOf(b.flow, 1.5, sit), inside: ln ? clamp(A.scale.inside * (b.lanes.in / ln - 0.5) * (ln / (ln + A.laneConf)) * sit, -1, 1) : 0 };
  // The look in front of them: what it has shown, on top of what they've seen lately.
  const lt = look ? b.looks[lookOf(look)] : undefined;
  if (lt && lt.total >= CHECK.min) {
    const here = readOf(lt, CHECK.trust, sit);
    const w = CHECK.lean * b.smarts * (lt.total / (lt.total + CHECK.trust));
    for (const k of ['run', 'screen', 'qb', 'deep'] as const) team[k] = lerp(team[k], here[k], w);
  }
  // The DC's model: what this offense calls in this situation from this look, against what the league does there.
  if (at && look) {
    const here = modelRead(b, sitBin(at.down, at.toGo, at.yardsToGoal), lookOf(look));
    const w = ML_DC.leans * b.smarts;
    for (const k of ['run', 'screen', 'qb', 'deep'] as const) team[k] = lerp(team[k], here[k] * sit, w);
  }
  b.read = team;
  const r = rnd(b);
  const film = b.iq * lerp(0.6, 1, b.skill);
  const out: Partial<Record<DefSlot, Lean>> = {};
  for (const [slot, p] of Object.entries(prc) as [DefSlot, number][]) {
    const read = lerp(A.prc.min, 1, p / 100) * film;
    const n = b.nerve[slot] ?? NO_LEAN;
    const one = (k: keyof Lean) => clamp(team[k] * read + n[k] + gauss(r) * A.jitter * film, -1, 1);
    out[slot] = { run: one('run'), screen: one('screen'), qb: one('qb'), deep: one('deep'), inside: one('inside') };
  }
  b.last = { leans: out, call: call.id };
  return out;
}

/** The family's weight in each lean: the runs (a read and an RPO half a run), QB runs, screens, the deep ball. */
const LEAN_FAM: Record<string, Partial<Record<'run' | 'qb' | 'screen' | 'deep', number>>> = {
  insideZone: { run: 1 }, outsideZone: { run: 1 }, gap: { run: 1 }, perimeter: { run: 1 }, draw: { run: 1 },
  read: { run: 0.5, qb: 0.5 }, rpo: { run: 0.5 }, qbRun: { qb: 1, run: 1 }, screen: { screen: 1 }, shot: { deep: 1 }, pa: { deep: 0.5 }, boot: {},
};
/** The model's read for a situation and look: each lean by its share past the league's there, by how much the DC has seen. */
function modelRead(b: DefBrain, sit: SitBin, look: string): Omit<Lean, 'inside'> {
  const A = ANTICIPATE;
  const prm = paramsOf(b);
  const mine = famDist(b.model, prm, sit, look);
  const lg = leagueShares(sit);
  const d = { run: 0, qb: 0, screen: 0, deep: 0 };
  for (const [f, ws] of Object.entries(LEAN_FAM)) {
    for (const [k, w] of Object.entries(ws) as ['run' | 'qb' | 'screen' | 'deep', number][]) d[k] += w * ((mine[f] ?? 0) - (lg[f] ?? 0));
  }
  const conf = b.model.n / (b.model.n + lerp(DEF_BRAIN.trust, DEF_BRAIN.trustSharp, prm.skill));
  return {
    run: clamp(A.scale.run * d.run * conf, -1, 1), qb: clamp(A.scale.qb * d.qb * conf, -1, 1),
    screen: clamp(A.scale.screen * d.screen * conf, -1, 1), deep: clamp(A.scale.deep * d.deep * conf, -1, 1),
  };
}

/** The team's read of a book: each lean by its bucket's share past normal (`ANTICIPATE.scale`), `trust` snaps to believe it. */
function readOf(t: Tally, trust: number, sit: number): Omit<Lean, 'inside'> {
  const A = ANTICIPATE;
  const N = DEF_BRAIN.norm;
  const conf = t.total / (t.total + trust);
  return {
    run: clamp(A.scale.run * (share(t, 'allRun') - N.run) * conf, -1, 1),
    screen: clamp(A.scale.screen * (share(t, 'screen') - N.screen) * conf * sit, -1, 1),
    qb: clamp(A.scale.qb * (share(t, 'qbRun') - N.qbRun) * conf, -1, 1),
    deep: clamp(A.scale.deep * (share(t, 'deep') - N.deep) * conf * sit, -1, 1),
  };
}

// ------------------------------------------------------------ what the user is told

const SAY: { key: string; on: (b: DefBrain) => number; text: (b: DefBrain, name: (id: string) => string) => string }[] = [
  { key: 'short', on: (b) => (b.heavy ? 1 : 0), text: (b, name) => `THEY'RE SELLING OUT FOR THE ${name(b.heavy!)}` },
  { key: 'passSpam', on: (b) => (passSpam(b) ? passSpam(b)!.share + 0.2 : 0), text: (b, name) => `THEY'RE SITTING ON THE ${name(passSpam(b)!.id)}` },
  { key: 'rpo', on: (b) => b.tags.rpo * 1.6, text: () => "THEY'RE PLAYING THE RPO PASS FIRST" },
  { key: 'jump', on: (b) => ((b.answered.jump ?? 0) + (b.answered.lane ?? 0) * 0.5 + b.trapOdds) * 0.6, text: (b) => `THEY'RE SITTING ON YOUR THROW TO ${habitName(b)}` },
  { key: 'plus', on: (b) => (b.answered.plus ?? 0) * 0.7, text: () => 'THEIR BACKERS ARE CHASING THE ROLLOUT' },
  { key: 'key', on: (b) => (b.keyRead?.odds ?? 0) * 1.4, text: (b) => `THEY'RE KEYING ${keyName(b)}: HELP OVER THE TOP` },
  { key: 'inside', on: (b) => b.read.inside, text: () => "THEY'RE SITTING ON YOUR INSIDE ROUTES" },
  { key: 'outside', on: (b) => -b.read.inside, text: () => "THEY'RE TAKING AWAY THE OUTSIDE" },
  { key: 'box+', on: (b) => b.shift.box, text: () => "THEY'RE LOADING THE BOX" },
  { key: 'spy', on: (b) => b.tags.spy * 1.6, text: () => "THEY'RE SPYING YOUR QB" },
  { key: 'contain', on: (b) => b.tags.contain * 1.4, text: () => 'THEIR ENDS ARE PLAYING CONTAIN' },
  { key: 'twoHigh+', on: (b) => b.shift.twoHigh, text: () => "TWO DEEP: THEY WON'T LET YOU GO OVER THE TOP" },
  { key: 'twoHigh-', on: (b) => -b.shift.twoHigh, text: () => 'SAFETIES ARE CREEPING DOWN' },
  { key: 'blitz+', on: (b) => b.shift.blitz, text: () => "THEY'RE SENDING MORE PRESSURE" },
  { key: 'blitz-', on: (b) => -b.shift.blitz, text: () => "THEY'VE STOPPED BLITZING AND SIT IN COVERAGE" },
  { key: 'man+', on: (b) => b.shift.man, text: () => "THEY'RE PRESSING AND PLAYING MAN" },
  { key: 'man-', on: (b) => -b.shift.man, text: () => 'THEY\'RE DROPPING INTO ZONES' },
];
const SLOT_WORD: Record<string, string> = { X: 'YOUR X', Z: 'YOUR Z', SL: 'YOUR SLOT', TE: 'YOUR TIGHT END', RB: 'YOUR BACK' };
/** The receiver the user's throw habit goes to, by name, or his slot. */
function habitName(b: DefBrain): string {
  const by = new Map<string, number>();
  for (const h of b.habits) by.set(h.slot, (by.get(h.slot) ?? 0) + h.w);
  const s = [...by.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
  return (b.who[s]?.toUpperCase() ?? SLOT_WORD[s] ?? s).replace(/ #\d+$/, '');
}

/** The keyed receiver by name, or his slot. */
function keyName(b: DefBrain): string {
  const s = b.keyRead?.slot ?? '';
  return (b.who[s]?.toUpperCase() ?? SLOT_WORD[s] ?? s).replace(/ #\d+$/, '');
}

/** A shift is worth saying at `SAY_AT`; it can be said again once it has faded under `SAY_RESET`. */
const SAY_AT = 0.5;
const SAY_RESET = 0.25;

/** At most one line a drive, when an adjustment crosses `SAY_AT` for the first time. */
export function headline(b: DefBrain, name: (id: string) => string): string | null {
  b.said = b.said.filter((k) => (SAY.find((s) => s.key === k)?.on(b) ?? 0) >= SAY_RESET);
  if (b.saidThisDrive) return null;
  const fresh = SAY.map((s) => ({ s, v: s.on(b) })).filter((x) => x.v >= SAY_AT && !b.said.includes(x.s.key)).sort((x, y) => y.v - x.v)[0];
  if (!fresh) return null;
  b.said.push(fresh.s.key);
  b.saidThisDrive = true;
  return fresh.s.text(b, name);
}

/** A new drive: one more line allowed. */
export function newDrive(b: DefBrain): void {
  b.saidThisDrive = false;
}

/** Their adjustments so far, biggest first (the halftime card). */
export function adjustments(b: DefBrain, name: (id: string) => string): string[] {
  return SAY.map((s) => ({ s, v: s.on(b) })).filter((x) => x.v >= SAY_RESET).sort((x, y) => y.v - x.v).map((x) => x.s.text(b, name));
}
