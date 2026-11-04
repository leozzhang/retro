import { pickDefCall, rushers, type DefCall, type DefTags } from '../data/defenses';
import { addDials, preventLevel, shortYardage, situationMix, ZERO_DIALS, type DefIdentity, type Dials } from '../data/identity';
import type { PlayDef } from '../data/plays';
import type { DefSlot } from '../data/teams';
import { clamp, gauss, lerp, mulberry32, type Rng } from '../engine/math';
import { playTraits } from '../season/scouting';
import { NO_LEAN, type Lean } from '../sim/player';
import type { Situation } from './situation';

/**
 * The CPU defense learns your offense during a live game (docs/DEFENSE.md). Two layers read one book
 * of what you've called and how it went:
 * - **The DC** moves his posture (the identity's dials, data/identity.ts) toward a target built from
 *   your tendencies and from which of his calls have stopped you, and tags calls with a spy or contain.
 *   How fast and how well is his ADJUST rating (`dcAdjust`, data/coaches.ts), times the DEFENSE IQ setting.
 * - **Each defender** leans toward what you've been doing lately (a shorter memory), by his play
 *   recognition, with his own nerve: guessing right makes him bolder, getting burned makes him careful.
 *   Leans are double-edged in the sim (game/playState.ts): sitting on the run means biting on play action.
 *
 * It never sees the call you're about to make: only plays already run, the situation, and a pregame read.
 * Plain JSON, reset each game. STATIC (`iq` 0) has no brain at all, and the game plays as before.
 */
export type Bucket = 'run' | 'qbRun' | 'screen' | 'quick' | 'deep' | 'pa' | 'pass';
const BUCKETS: Bucket[] = ['run', 'qbRun', 'screen', 'quick', 'deep', 'pa', 'pass'];

/**
 * Brain tuning.
 * - `decay`: weight left on each older play in the DC's book; `flow`: the same for the players' shorter memory.
 * - `norm`: a normal offense's share of each bucket (runs include QB runs and scrambles), the baseline
 *   a tendency is measured from.
 * - `trust`: decayed plays before the DC half-believes a tendency, at skill 0 (a sharp DC needs `trustSharp`).
 * - `gain`: dial shift per point of a share above normal; `tag`: spy and contain odds per point; `tagMax`.
 * - `shortRepeat`: box dial per point by which one play's share of your short-yardage snaps passes
 *   `shortFrom`; the same against a run that's `spamAt` or more of your whole book, which also opens
 *   the goal-line front on any down.
 * - `bandit`: dial shift per point of success rate a trait has given up less than its opposite;
 *   `banditMin`: decayed snaps of each before he trusts it; `banditDecay`.
 * - `cap`: the most any dial moves, × the IQ setting.
 * - `rate`: share of the way to the target he closes each snap, from skill 0 to 1 (a weak DC mostly
 *   adjusts at halftime, when he closes it all); `noise`: SD of a weak DC's misread on each dial.
 * - `iq`: the DEFENSE IQ setting's multiplier.
 */
export const DEF_BRAIN = {
  decay: 0.85,
  flow: 0.6,
  norm: { run: 0.45, qbRun: 0.08, screen: 0.07, quick: 0.2, deep: 0.12, pa: 0.12 } as Record<string, number>,
  trust: 7,
  trustSharp: 3,
  gain: { boxRun: 2.2, twoHighRun: -1.4, twoHighDeep: 2.2, blitzQuick: -2, blitzScreen: -2.5, manQuick: 1.2 },
  tag: { spy: 3, contain: 2.5 },
  tagMax: 0.6,
  shortRepeat: 2.5,
  shortFrom: 0.3,
  spamAt: 0.5,
  bandit: 1.5,
  banditMin: 3,
  banditDecay: 0.9,
  cap: 1,
  rate: { min: 0.12, max: 0.6 },
  noise: 0.3,
  iq: { STATIC: 0, NORMAL: 1, SHARP: 1.4 } as Record<DefenseIq, number>,
};

/**
 * Player anticipation tuning.
 * - `scale`: each lean per point of the recent share above normal.
 * - `prc`: how much play recognition decides it: a 0 reader gets `prc.min` of the team's read, a 100 reader all of it.
 * - `jitter`: SD of a defender's own guess each snap.
 * - nerve: `bold` added when his lean was right, `burned` taken when he got beat on it (a 12+ yard
 *   gain on a ball thrown more than `overTop` yards downfield), `nerveDecay` kept each snap, within ±`nerveMax`.
 */
export const ANTICIPATE = {
  scale: { run: 2.2, screen: 4, qb: 3.5, deep: 3 },
  prc: { min: 0.3 },
  jitter: 0.12,
  bold: 0.15,
  burned: 0.45,
  nerveDecay: 0.7,
  nerveMax: 0.6,
  overTop: 10,
};

export type DefenseIq = 'STATIC' | 'NORMAL' | 'SHARP';

/** Decayed snaps by bucket, and a play's own share. */
interface Tally {
  n: Record<Bucket, number>;
  total: number;
  plays: Record<string, number>;
}

/** Decayed success the offense had against calls with and without a trait. */
interface Split {
  yes: { n: number; win: number };
  no: { n: number; win: number };
}
type TraitKey = 'blitz' | 'man' | 'box';

export interface DefBrain {
  iq: number;
  /** ADJUST as 0..1. */
  skill: number;
  /** The DC's book (long memory) and the players' (short memory). */
  book: Tally;
  flow: Tally;
  /** Short-yardage snaps only (long memory), by play. */
  short: Tally;
  res: Record<TraitKey, Split>;
  /** The DC's posture shift now, and his tag odds. */
  shift: Dials;
  tags: { spy: number; contain: number };
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
const split = (): Split => ({ yes: { n: 0, win: 0 }, no: { n: 0, win: 0 } });

/**
 * A new brain for one game. `qbMobility` (0..1, from the user QB's speed) seeds the DC's pregame
 * read of how often he'll run, weighted by the DC's scouting (`scout`, 0..99).
 */
export function newBrain(o: { iq: DefenseIq; adjust: number; scout: number; qbMobility: number; seed: number }): DefBrain | null {
  const iq = DEF_BRAIN.iq[o.iq];
  if (!iq) return null;
  const b: DefBrain = {
    iq, skill: clamp((o.adjust - 40) / 45, 0, 1), book: tally(), flow: tally(), short: tally(),
    res: { blitz: split(), man: split(), box: split() }, shift: { ...ZERO_DIALS }, tags: { spy: 0, contain: 0 },
    nerve: {}, last: null, said: [], saidThisDrive: false, runIds: [], seed: o.seed >>> 0, draws: 0,
  };
  // The pregame read: a mobile QB shows up as a couple of QB runs already in the book.
  const prior = clamp((o.scout / 100) * 2 * o.qbMobility, 0, 2);
  if (prior > 0) {
    b.book.n.qbRun += prior;
    b.book.total += prior;
  }
  target(b, true);
  return b;
}

/** The brain's own random stream, so the live game's draws are the same with or without it. */
function rnd(b: DefBrain): Rng {
  const r = mulberry32(b.seed + b.draws * 0x9e3779b1);
  b.draws++;
  return r;
}

/**
 * A play's buckets, as the defense saw it: a run, the QB keeping it or scrambling, a screen or play
 * action (`playTraits`), and where the ball went: `air` yards past the line (0 for no throw) makes it
 * quick (`QUICK_AIR` or less, or a quick-game play) or deep (`DEEP_AIR` or more).
 */
export function bucketsOf(p: PlayDef, scrambled: boolean, kept: boolean, air: number): Bucket[] {
  if (p.qbRun || kept) return ['qbRun'];
  if (p.kind === 'run') return ['run'];
  if (scrambled) return ['qbRun'];
  const t = playTraits(p);
  const out: Bucket[] = ['pass'];
  if (t.has('screen')) out.push('screen');
  else if (t.has('quick') || (air > 0 && air <= QUICK_AIR)) out.push('quick');
  if (air >= DEEP_AIR) out.push('deep');
  if (t.has('pa') || t.has('rpo')) out.push('pa');
  return out;
}
const QUICK_AIR = 6;
const DEEP_AIR = 15;

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
  down: number;
  toGo: number;
  yardsToGoal: number;
  gain: number;
  success: boolean;
  scrambled: boolean;
  kept: boolean;
  /** The ball was thrown past this many yards downfield (0 for none). */
  air: number;
}

/** Learn from a snap: both books, the call's result, each defender's nerve, then step toward the target. */
export function observe(b: DefBrain, s: SnapSeen): void {
  const bk = bucketsOf(s.play, s.scrambled, s.kept, s.air);
  if (s.play.kind === 'run' && !b.runIds.includes(s.play.id)) b.runIds.push(s.play.id);
  add(b.book, DEF_BRAIN.decay, bk, s.play.id);
  add(b.flow, DEF_BRAIN.flow, bk, s.play.id);
  if (shortYardage(s.down, s.toGo, s.yardsToGoal)) add(b.short, DEF_BRAIN.decay, bk, s.play.id);
  const traits: Record<TraitKey, boolean> = { blitz: rushers(s.call) >= 5, man: s.call.coverage === 'man', box: s.call.box >= 8 };
  for (const k of Object.keys(traits) as TraitKey[]) {
    const sp = b.res[k];
    for (const side of [sp.yes, sp.no]) {
      side.n *= DEF_BRAIN.banditDecay;
      side.win *= DEF_BRAIN.banditDecay;
    }
    const side = traits[k] ? sp.yes : sp.no;
    side.n += 1;
    side.win += s.success ? 1 : 0;
  }
  nerve(b, s, bk);
  target(b, false);
}

/** Nerve: right guesses embolden, getting beaten on a guess makes a defender careful for a few snaps. */
function nerve(b: DefBrain, s: SnapSeen, bk: Bucket[]): void {
  const A = ANTICIPATE;
  for (const n of Object.values(b.nerve)) for (const k of ['run', 'screen', 'qb', 'deep'] as const) n![k] *= A.nerveDecay;
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
  }
}

/** The DC's target posture from the book, and a step toward it (all the way at halftime or the first read). */
function target(b: DefBrain, snap: boolean): void {
  const B = DEF_BRAIN;
  const N = B.norm;
  const t = b.book;
  const trust = lerp(B.trust, B.trustSharp, b.skill);
  const conf = t.total / (t.total + trust);
  const run = share(t, 'allRun') - N.run;
  const qb = share(t, 'qbRun') - N.qbRun;
  const quick = share(t, 'quick') - N.quick;
  const screen = share(t, 'screen') - N.screen;
  const deep = share(t, 'deep') - N.deep;
  const g = B.gain;
  const want: Dials = {
    box: g.boxRun * run,
    twoHigh: g.twoHighRun * run + g.twoHighDeep * deep,
    blitz: g.blitzQuick * quick + g.blitzScreen * screen,
    man: g.manQuick * quick,
  };
  // What has worked: more of the trait that's given up less success, once he's seen enough of both.
  for (const k of ['blitz', 'man', 'box'] as const) {
    const sp = b.res[k];
    const seen = Math.min(1, sp.yes.n / B.banditMin) * Math.min(1, sp.no.n / B.banditMin);
    if (!seen) continue;
    const rate = (x: { n: number; win: number }) => (x.win + 0.5) / (x.n + 1);
    want[k] += B.bandit * seen * (rate(sp.no) - rate(sp.yes));
  }
  const r = rnd(b);
  const cap = B.cap * b.iq;
  const noise = B.noise * (1 - b.skill);
  const k = conf * b.iq;
  for (const d of ['box', 'twoHigh', 'blitz', 'man'] as const) {
    const aim = clamp(want[d] * k + gauss(r) * noise * conf, -cap, cap);
    b.shift[d] = snap ? aim : lerp(b.shift[d], aim, lerp(B.rate.min, B.rate.max, b.skill));
  }
  const tag = (v: number) => clamp(v * k, 0, B.tagMax);
  const spy = tag(B.tag.spy * qb);
  const contain = tag(B.tag.contain * qb);
  const step = snap ? 1 : lerp(B.rate.min, B.rate.max, b.skill);
  b.tags.spy = lerp(b.tags.spy, spy, step);
  b.tags.contain = lerp(b.tags.contain, contain, step);
}

/** Halftime: every DC closes the gap to his read. */
export function halftime(b: DefBrain): void {
  target(b, true);
}

/** The top play's share of short-yardage snaps, and which play it is. */
function shortTop(b: DefBrain): { id: string; share: number } | null {
  const t = b.short;
  if (t.total < 1.5) return null;
  let best: { id: string; share: number } | null = null;
  for (const [id, n] of Object.entries(t.plays)) if (!best || n > best.share * t.total) best = { id, share: n / t.total };
  return best;
}

/** This snap's extra box in short yardage, against a play the user keeps running there. */
function shortBox(b: DefBrain): number {
  const top = shortTop(b);
  if (!top) return 0;
  const conf = b.short.total / (b.short.total + lerp(3, 1.5, b.skill));
  return clamp(DEF_BRAIN.shortRepeat * (top.share - DEF_BRAIN.shortFrom) * conf * b.iq, 0, DEF_BRAIN.cap * b.iq);
}

/** A run the user keeps calling on any down: its share of the book, once it passes `spamAt`. */
function runSpam(b: DefBrain): { id: string; share: number } | null {
  const t = b.book;
  if (t.total < 3) return null;
  let best: { id: string; share: number } | null = null;
  for (const [id, n] of Object.entries(t.plays)) if (!best || n > best.share * t.total) best = { id, share: n / t.total };
  const isRun = !!best && (b.runIds.includes(best.id));
  return best && isRun && best.share >= DEF_BRAIN.spamAt ? best : null;
}

/** Extra box against a run he's seen over and over, on any down. */
function spamBox(b: DefBrain): number {
  const s = runSpam(b);
  if (!s) return 0;
  const conf = b.book.total / (b.book.total + lerp(DEF_BRAIN.trust, DEF_BRAIN.trustSharp, b.skill));
  return clamp(DEF_BRAIN.shortRepeat * (s.share - DEF_BRAIN.shortFrom) * conf * b.iq, 0, DEF_BRAIN.cap * b.iq);
}

/** The DC's call for this snap: one draw from the game's stream for the call, tags from the brain's own. */
export function callFor(
  b: DefBrain, id: DefIdentity, down: number, toGo: number, yardsToGoal: number, rng: Rng, late?: Situation,
): { call: DefCall; tags: DefTags } {
  const short = shortYardage(down, toGo, yardsToGoal);
  const spam = spamBox(b);
  const box = Math.max(short ? shortBox(b) : 0, spam);
  const shift = box ? addDials(b.shift, { box }) : b.shift;
  const call = pickDefCall(rng, situationMix(id, down, toGo, yardsToGoal, shift, spam > 0, late));
  const r = rnd(b);
  const tags: DefTags = {};
  if (call.spyFrom && r() < b.tags.spy) tags.spy = true;
  if (r() < b.tags.contain) tags.contain = true;
  if (preventLevel(late)) tags.prevent = true;
  return { call, tags };
}

/**
 * Each defender's lean this snap: the players' recent read of the offense, by his play recognition
 * (`prc`, by slot), plus his nerve and a guess of his own. Remembered for the nerve update.
 */
export function leansFor(b: DefBrain, prc: Partial<Record<DefSlot, number>>, call: DefCall): Partial<Record<DefSlot, Lean>> {
  const A = ANTICIPATE;
  const N = DEF_BRAIN.norm;
  const f = b.flow;
  const conf = f.total / (f.total + 1.5);
  const team: Lean = {
    run: clamp(A.scale.run * (share(f, 'allRun') - N.run) * conf, -1, 1),
    screen: clamp(A.scale.screen * (share(f, 'screen') - N.screen) * conf, -1, 1),
    qb: clamp(A.scale.qb * (share(f, 'qbRun') - N.qbRun) * conf, -1, 1),
    deep: clamp(A.scale.deep * (share(f, 'deep') - N.deep) * conf, -1, 1),
  };
  const r = rnd(b);
  const film = b.iq * lerp(0.6, 1, b.skill);
  const out: Partial<Record<DefSlot, Lean>> = {};
  for (const [slot, p] of Object.entries(prc) as [DefSlot, number][]) {
    const read = lerp(A.prc.min, 1, p / 100) * film;
    const n = b.nerve[slot] ?? NO_LEAN;
    const one = (k: keyof Lean) => clamp(team[k] * read + n[k] + gauss(r) * A.jitter * film, -1, 1);
    out[slot] = { run: one('run'), screen: one('screen'), qb: one('qb'), deep: one('deep') };
  }
  b.last = { leans: out, call: call.id };
  return out;
}

// ------------------------------------------------------------ what the user is told

const SAY: { key: string; on: (b: DefBrain) => number; text: (b: DefBrain, name: (id: string) => string) => string }[] = [
  { key: 'short', on: (b) => (shortTop(b)?.share ?? 0) >= 0.5 && b.short.total >= 2 ? shortBox(b) + 0.5 : 0, text: (b, name) => `THEY'RE SELLING OUT FOR THE ${name(shortTop(b)!.id)}` },
  { key: 'spam', on: (b) => (spamBox(b) > 0 ? spamBox(b) + 0.5 : 0), text: (b, name) => `THEY'RE SELLING OUT FOR THE ${name(runSpam(b)!.id)}` },
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
