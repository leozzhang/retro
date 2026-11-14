import { CONCEPTS } from '../data/concepts';
import { DEF_CALLS, type DefCall } from '../data/defenses';
import type { Ratings } from '../data/ratings';
import { IDENTITY, mixFor, situationMix, ZERO_DIALS, type DefIdentity } from '../data/identity';
import type { PlayDef } from '../data/plays';
import type { Family } from '../data/playTags';
import { clamp, gauss, lerp, mulberry32, type Rng } from '../engine/math';
import { cell, damage, filmOk, sitBin, type SitBin } from './offModel';
import type { Situation } from './situation';

/**
 * The CPU OC learns the defense during a game (docs/ENGINEDRIVES.md, Phase 2), the DC's brain
 * (game/defBrain.ts) from the other side. He keeps:
 * - **What they call:** decayed counts of the defense's calls by situation (`seen`), over his pregame read of
 *   their identity (the scouting report: `situationMix`, as much of it as his SCOUT got).
 * - **What's working:** each family's success this game over what the film says it should have been against
 *   those calls (`res`), and each receiver's (`tres`). It's how the players show up: a back who keeps
 *   breaking tackles, a corner who can't cover the X.
 *
 * Each snap he weighs every play in his book by the damage it should do against the calls he expects (the engine's
 * payoff table, `enginePayoff.ts`: what each family gets against each call with a CPU QB reading the field),
 * against what it does to a normal defense, plus what's working; and leans his own mix toward the plays
 * that hurt this defense, as the DC leans his calls (`ocLean`). A defense that plays like the league moves
 * nothing; a DC who leans on pressure gets the quick game and screens, a light box gets run at.
 *
 * His ADJUST (`ocAdjust`, data/coaches.ts) sets how fast and how far, with a game-day form around it (`form`):
 * the sharper coordinator wins the battle more often than not, never always. The QB's play recognition
 * sets how much of the plan the offense carries out (`smarts`). Plain JSON, reset each game.
 */
export const ML_OC = {
  /** Weight left on each older snap. */
  decay: 0.9,
  /** His read of their calls: the pregame read weighs as this many snaps, from a weak OC to a sharp one. */
  prior: [14, 5],
  /** How much of their identity's mix (vs the league's) he knows before kickoff, by SCOUT 0..100. */
  scout: [0.3, 1],
  /** How hard he leans toward a play per point of damage it gains on this defense over a normal one, weak to sharp. */
  beta: [5, 14],
  /** The most of his mix he hands that lean, weak to sharp (× `execute`). */
  lam: [0.45, 0.7],
  /** Pass or run: the log-odds shift per point of damage the passes gain over the runs (× his lean budget). */
  tilt: 6,
  /** SD of his error on each play's worth, per snap, weak to sharp. */
  misread: [0.03, 0.01],
  /**
   * His misjudgments for the game: SD of a fixed error on each family's worth (drawn at kickoff), weak to sharp. A weak
   * play-caller carries wrong beliefs through a game ("they can't stop our power"); a sharp one sees it as it is.
   */
  bias: [0.06, 0.005],
  /**
   * Residual pseudocounts (snaps before he believes a family is or isn't working), weak to sharp. A weak OC believes a
   * couple of snaps (he abandons the run after two stuffs); a sharp one waits for enough to tell it from luck.
   */
  res: [2.5, 9],
  resW: 1,
  /** A receiver who's winning: his target share × exp(`tgt` × his residual), shrunk by `res`. */
  tgt: 2,
  /** At halftime his skill moves this far toward 1. */
  half: 0.35,
  /** His presnap check odds × this, from a weak OC to a sharp one (`ocCheckSkill`). */
  check: [0.6, 1.25],
  /** Game-day form: SD on his skill (0..1) for the game. */
  form: 0.12,
  /**
   * Scheming players open from what the defenders do (each 0 turns it off):
   * - `pa`: play action's worth per point of the bite rate (backers and safeties biting on the fake) past `paNorm`;
   *   `paPrior` snaps of `paNorm` before he believes it.
   * - `soft`: the quick game's and screens' worth per point of the corners' off share past `softNorm` (`softPrior` snaps).
   * - `route`: a play's worth per point of success its routes' kind (`routeGroup`) has had against this defense today.
   * - `check`: the presnap check's bonus for a quick throw or a screen per corner playing off this snap.
   * - `free`: the QB's pull (ln units) toward a receiver whose man is off `freeCushion`+ yd and who runs a quick route.
   * - `matchup`: his pull per 10 points his nearest defender's coverage is under the league's (`coverOf`).
   * - `beat`: his pull per point of success that defender has given up on that kind of route today.
   *
   * All off: tested one at a time over 400 games (docs/ENGINEDRIVES.md "Scheming players open") and none moved success
   * past the noise, because the engine's defenders don't give these edges (`OFF_MAN`, `PA_BITE`). Tested values:
   * pa 0.25-0.4, soft 0.15-0.3, route 0.5, check 0.05-0.08, free 0.8, matchup 0.5, beat 1.5.
   */
  x: { pa: 0, paNorm: 0.45, paPrior: 6, soft: 0, softNorm: 0.62, softPrior: 8, route: 0, check: 0, free: 0, freeCushion: 5, matchup: 0, beat: 0 },
  /** How much of the plan an offense with no smarts carries out (all of it at 1); smarts from the QB's `prc`, `lo` to `hi`. */
  execMin: 0.5,
  smarts: [55, 90],
};

/** The league's defense, for "what a normal defense gives up": the balanced style with no dials. */
const LEAGUE: DefIdentity = {
  style: 'balanced', dials: { ...ZERO_DIALS }, mix: mixFor(ZERO_DIALS), press: {}, longBlitz: IDENTITY.styles.balanced.longBlitz, disguise: 0,
};

const FAMS: Family[] = ['quick', 'dropback', 'shot', 'screen', 'pa', 'boot', 'rpo', 'insideZone', 'outsideZone', 'gap', 'perimeter', 'read', 'qbRun', 'draw'];
const CALL: Record<string, DefCall> = Object.fromEntries(DEF_CALLS.map((c) => [c.id, c]));

interface Resid {
  n: number;
  d: number;
}

export interface OcBrain {
  /** ADJUST as 0..1 with his form for the game, and SCOUT as 0..1. */
  skill: number;
  scout: number;
  /** The offense's smarts (the QB's play recognition), 0..1. */
  smarts: number;
  half: boolean;
  /** The defense he's facing (the scouting report's identity). */
  def: DefIdentity;
  /** Decayed calls seen by situation, and their totals. */
  seen: Partial<Record<SitBin, Record<string, number>>>;
  /** What hid behind each shell they showed: decayed calls by the shell shown presnap (a disguise shows another). */
  shells: Record<string, Record<string, number>>;
  /** What's working: by family, and by receiver slot. */
  res: Partial<Record<Family, Resid>>;
  tres: Record<string, Resid>;
  /** The defenders on film: play-action bites (of chances), corners off (of looks), success by route kind, and by defender and route kind. */
  pa: { n: number; b: number };
  soft: { n: number; off: number };
  groups: Record<string, Resid>;
  beat: Record<string, Resid>;
  /** The defense's coverage players before kickoff (`coverOf`), from the scouting report. */
  cover: Record<string, number>;
  /** His misjudgment of each family for the game (`bias`, scaled by his skill when used). */
  bias: Partial<Record<Family, number>>;
  /** The last snap's lean by group (his mix's shift from his own), for the headlines. */
  shift: { run: number; quick: number; deep: number };
  seed: number;
  draws: number;
}

/**
 * A new OC brain for one game. `adjust` and `scout` are his ratings (0..99), `qbPrc` his QB's play
 * recognition, `def` the defense he's facing (its identity).
 */
export function newOcBrain(o: { adjust: number; scout: number; qbPrc: number; def: DefIdentity; seed: number; defRoster?: Record<string, { r: Ratings } | undefined> }): OcBrain {
  const r = mulberry32(o.seed ^ 0x5bd1e995);
  const skill = clamp((o.adjust - 40) / 45 + gauss(r) * ML_OC.form, 0, 1);
  const bias: Partial<Record<Family, number>> = {};
  for (const f of FAMS) bias[f] = gauss(r);
  return {
    bias,
    pa: { n: 0, b: 0 }, soft: { n: 0, off: 0 }, groups: {}, beat: {},
    cover: coverMap(o.defRoster),
    skill, scout: clamp(o.scout / 100, 0, 1), smarts: clamp((o.qbPrc - ML_OC.smarts[0]) / (ML_OC.smarts[1] - ML_OC.smarts[0]), 0, 1),
    half: false, def: o.def, seen: {}, shells: {}, res: {}, tres: {}, shift: { run: 0, quick: 0, deep: 0 }, seed: o.seed >>> 0, draws: 0,
  };
}

const skillOf = (b: OcBrain) => (b.half ? lerp(b.skill, 1, ML_OC.half) : b.skill);
const at = (k: number[], s: number) => lerp(k[0], k[1], s);
const execute = (b: OcBrain) => lerp(ML_OC.execMin, 1, b.smarts);

function rnd(b: OcBrain): Rng {
  const r = mulberry32(b.seed + b.draws * 0x9e3779b1);
  b.draws++;
  return r;
}

/** One snap the OC learns from: the call they were in, and what his play got against it. */
export interface OcSnap {
  play: PlayDef;
  call: DefCall;
  down: number;
  toGo: number;
  yardsToGoal: number;
  gain: number;
  /** A sack or a turnover. */
  lost: boolean;
  handedOff: boolean;
  target: string | null;
  /** The shell they showed before the snap. */
  shown: string;
  /** Play action: backers and safeties who could have bitten, and how many did. */
  paSeen?: number;
  paBit?: number;
  /** Corners (CB1, CB2) off this snap, of two; the defender beaten on the throw and the target's route. */
  softCorners?: number;
  beaten?: string | null;
  route?: string | null;
}

/** A route's kind, for what beats a defender: breaking back, out, in, vertical, or behind the line. */
export function routeGroup(r: string | null | undefined): string | null {
  if (!r) return null;
  return ROUTE_GROUP[r] ?? null;
}
const ROUTE_GROUP: Record<string, string> = {
  hitch: 'back', curl: 'back', comeback: 'back',
  quickOut: 'out', deepOut: 'out', corner: 'out', flat: 'out', arrow: 'out', whip: 'out',
  slant: 'in', in: 'in', drag: 'in', cross: 'in', glance: 'in', post: 'in', angle: 'in',
  go: 'vert', seam: 'vert', fade: 'vert', wheel: 'vert', outUp: 'vert',
  smoke: 'screen', bubble: 'screen', tunnel: 'screen', screen: 'screen', swing: 'screen', checkFlat: 'screen', slip: 'screen', leak: 'screen',
};

/** A defender's coverage as the OC rates it: man or zone, recognition, speed (a DB about 75). */
export function coverOf(r: Ratings): number {
  return 0.6 * Math.max(r.mcv, r.zcv) + 0.2 * r.prc + 0.2 * (r.spd - 14);
}
/** The defensive backs the matchups are measured against: a defender's pull is how far he covers under their mean. */
const DB_SLOTS = ['CB1', 'CB2', 'NB', 'FS', 'SS'];

export function ocObserve(b: OcBrain, s: OcSnap): void {
  const D = ML_OC.decay;
  const sit = sitBin(s.down, s.toGo, s.yardsToGoal);
  for (const t of Object.values(b.seen)) for (const k of Object.keys(t!)) t![k] *= D;
  const t = (b.seen[sit] ??= {});
  t[s.call.id] = (t[s.call.id] ?? 0) + 1;
  for (const m of Object.values(b.shells)) for (const k of Object.keys(m)) m[k] *= D;
  const sh = (b.shells[s.shown] ??= {});
  sh[s.call.id] = (sh[s.call.id] ?? 0) + 1;
  // What it was worth against film, graded as the DC grades it (`learn`, game/offModel.ts).
  const f = s.play.tags.family;
  const row = s.play.read === 'rpo' ? `${s.play.id}:${s.handedOff ? 'give' : 'pull'}` : s.play.id;
  const d = (filmOk(s.play, s.gain, s.yardsToGoal, s.lost) ? 1 : 0) - cell(row, f, s.call, undefined, 1, 'engine').s;
  for (const r of Object.values(b.res)) {
    r!.n *= D;
    r!.d *= D;
  }
  for (const r of Object.values(b.tres)) {
    r.n *= D;
    r.d *= D;
  }
  const fr = (b.res[f] ??= { n: 0, d: 0 });
  fr.n += 1;
  fr.d += d;
  // The defenders on film (not decayed: who they are doesn't change in a game).
  if (s.paSeen) {
    b.pa.n += s.paSeen;
    b.pa.b += s.paBit ?? 0;
  }
  if (s.softCorners !== undefined) {
    b.soft.n += 2;
    b.soft.off += s.softCorners;
  }
  const g = routeGroup(s.route);
  if (g && s.target) {
    const gr = (b.groups[g] ??= { n: 0, d: 0 });
    gr.n += 1;
    gr.d += d;
    if (s.beaten) {
      const br = (b.beat[`${s.beaten}|${g}`] ??= { n: 0, d: 0 });
      br.n += 1;
      br.d += d;
    }
  }
  if (s.target) {
    const tr = (b.tres[s.target] ??= { n: 0, d: 0 });
    tr.n += 1;
    tr.d += d;
  }
}

/** Halftime: he studies the first half. */
export function ocHalftime(b: OcBrain): void {
  b.half = true;
}

/** The calls he expects this snap: his pregame read of their identity, then what they've called in this situation. */
export function expectMix(b: OcBrain, sit: Situation): Record<string, number> {
  const s = skillOf(b);
  const own = situationMix(b.def, sit.down, sit.toGo, sit.yardsToGoal, undefined, false, sit);
  const lg = situationMix(LEAGUE, sit.down, sit.toGo, sit.yardsToGoal, undefined, false, sit);
  const know = at(ML_OC.scout, b.scout);
  const seen = b.seen[sitBin(sit.down, sit.toGo, sit.yardsToGoal)] ?? {};
  const n = Object.values(seen).reduce((a, v) => a + v, 0);
  const k = at(ML_OC.prior, s);
  const out: Record<string, number> = {};
  for (const id of new Set([...Object.keys(own), ...Object.keys(seen)])) {
    const prior = know * (own[id] ?? 0) + (1 - know) * (lg[id] ?? 0);
    out[id] = (k * prior + (seen[id] ?? 0)) / (k + n);
  }
  return out;
}

/**
 * The calls that could be behind the shell he sees, by weight: what he expects in the situation (`expectMix`)
 * × how often each shows that shell (straight, or disguised as often as his scouting says they disguise), then
 * what's actually been behind that shell today (`shells`), believed by `ML_OC.prior` as his read of their calls is.
 */
export function shellRead(b: OcBrain, sit: Situation, shown: string, box: number, boxSlack: number, shows: (c: DefCall, shell: string) => number): [DefCall, number][] {
  const mix = expectMix(b, sit);
  const seen = b.shells[shown] ?? {};
  const n = Object.values(seen).reduce((a, v) => a + v, 0);
  const k = at(ML_OC.prior, skillOf(b));
  const prior: Record<string, number> = {};
  let pt = 0;
  for (const c of DEF_CALLS) {
    if (Math.abs(c.box - box) > boxSlack) continue;
    const w = (mix[c.id] ?? 0) * shows(c, shown);
    if (w > 0) pt += prior[c.id] = w;
  }
  const out: [DefCall, number][] = [];
  for (const c of DEF_CALLS) {
    if (Math.abs(c.box - box) > boxSlack) continue;
    const w = (k * (pt ? (prior[c.id] ?? 0) / pt : 0) + (seen[c.id] ?? 0)) / (k + n);
    if (w > 0) out.push([c, w]);
  }
  return out;
}

/** The share of his check odds he keeps, from a weak OC (`check[0]`) to a sharp one: the menu he gives his QB, and how much he trusts him. */
export const ocCheckSkill = (b: OcBrain | null | undefined): number => (b ? at(ML_OC.check, skillOf(b)) : 1);

const leagueCache = new Map<string, Record<string, number>>();
function leagueMix(sit: Situation): Record<string, number> {
  const key = `${sitBin(sit.down, sit.toGo, sit.yardsToGoal)}|${sit.down >= 3 && sit.toGo >= 7}`;
  let m = leagueCache.get(key);
  if (!m) leagueCache.set(key, (m = situationMix(LEAGUE, sit.down, sit.toGo, sit.yardsToGoal)));
  return m;
}

/** A family's residual this game, as much as he believes it. */
function resOf(b: OcBrain, f: Family): number {
  const r = b.res[f];
  return r ? r.d / (r.n + at(ML_OC.res, skillOf(b))) : 0;
}

/** His lean this snap: each play's worth (damage over a normal defense, plus what's working), the lean's weight, and the pass/run tilt. */
export interface OcLean {
  worth: Map<PlayDef, number>;
  beta: number;
  lam: number;
  tilt: number;
}

/** What each play in `plays` is worth against this defense now. Misreads come from the brain's own stream. */
export function ocLean(b: OcBrain, plays: readonly PlayDef[], sit: Situation): OcLean {
  const s = skillOf(b);
  const r = rnd(b);
  const mix = expectMix(b, sit);
  const lg = leagueMix(sit);
  const mis = at(ML_OC.misread, s);
  const worth = new Map<PlayDef, number>();
  for (const p of plays) {
    let mine = 0;
    let base = 0;
    for (const [id, w] of Object.entries(mix)) if (w > 0) mine += w * damage(p, CALL[id], 0.5, undefined, 'engine');
    for (const [id, w] of Object.entries(lg)) if (w > 0) base += w * damage(p, CALL[id], 0.5, undefined, 'engine');
    const bias = (b.bias[p.tags.family] ?? 0) * at(ML_OC.bias, s);
    worth.set(p, mine - base + ML_OC.resW * resOf(b, p.tags.family) + bias + scheme(b, p) + gauss(r) * mis);
  }
  return { worth, beta: at(ML_OC.beta, s), lam: at(ML_OC.lam, s) * execute(b), tilt: ML_OC.tilt };
}

const X = () => ML_OC.x;

/** Each defender's coverage (`coverOf`), and `db`, the backs' mean. */
function coverMap(roster: Record<string, { r: Ratings } | undefined> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [sl, p] of Object.entries(roster ?? {})) if (p) out[sl] = coverOf(p.r);
  const dbs = DB_SLOTS.filter((sl) => out[sl] !== undefined);
  out.db = dbs.reduce((a, sl) => a + out[sl], 0) / (dbs.length || 1);
  return out;
}
/** The bite rate he believes, and the corners' off share. */
export const biteRate = (b: OcBrain) => (b.pa.b + X().paNorm * X().paPrior) / (b.pa.n + X().paPrior);
export const softShare = (b: OcBrain) => (b.soft.off + X().softNorm * X().softPrior) / (b.soft.n + X().softPrior);

/**
 * What the defenders have shown him, as a play's worth: play action against backers who bite, the quick game and
 * screens against corners who play off, and plays whose routes are the kind that's been beating this defense.
 */
function scheme(b: OcBrain, p: PlayDef): number {
  const x = X();
  const f = p.tags.family;
  let v = 0;
  if (f === 'pa' || f === 'boot') v += x.pa * (biteRate(b) - x.paNorm);
  if (f === 'quick' || f === 'screen') v += x.soft * (softShare(b) - x.softNorm);
  if (x.route) {
    const rs = [p.strong, p.weak].flatMap((c) => (c ? Object.values(CONCEPTS[c].routes) : []));
    let sum = 0;
    let n = 0;
    for (const rt of rs) {
      const g = routeGroup(rt);
      const gr = g ? b.groups[g] : undefined;
      if (!g) continue;
      sum += gr ? gr.d / (gr.n + at(ML_OC.res, skillOf(b))) : 0;
      n++;
    }
    if (n) v += x.route * (sum / n);
  }
  return v;
}

/**
 * The QB's pull toward a receiver from who's on him (ln units, added to his target pull): his man playing off
 * on a quick route (`free`), a defender who covers worse than the league's (`matchup`), one who's been beaten on
 * that kind of route today (`beat`).
 */
export function defPull(b: OcBrain | null | undefined, def: { slot: string; cushion: number; press: boolean }, route: string | null): number {
  const x = X();
  let v = 0;
  const g = routeGroup(route);
  if (x.free && !def.press && def.cushion >= x.freeCushion && (g === 'back' || g === 'screen' || route === 'quickOut' || route === 'slant')) v += x.free;
  if (!b) return v;
  const c = b.cover[def.slot];
  if (x.matchup && c !== undefined) v += (x.matchup * (b.cover.db - c)) / 10;
  const br = g ? b.beat[`${def.slot}|${g}`] : undefined;
  if (x.beat && br) v += x.beat * (br.d / (br.n + at(ML_OC.res, skillOf(b))));
  return v;
}

/** A receiver's pull on the QB this game: × exp(`tgt` × his residual). */
export function targetPull(b: OcBrain | null | undefined, slot: string): number {
  const r = b?.tres[slot];
  if (!b || !r) return 1;
  return Math.exp(ML_OC.tgt * (r.d / (r.n + at(ML_OC.res, skillOf(b)))));
}

/** Groups for the headlines. */
const GROUP: Partial<Record<Family, 'run' | 'quick' | 'deep'>> = {
  insideZone: 'run', outsideZone: 'run', gap: 'run', perimeter: 'run', read: 'run', qbRun: 'run', draw: 'run',
  quick: 'quick', screen: 'quick', rpo: 'quick', shot: 'deep', pa: 'deep',
};

/** Record how far his mix leaned from his own, by group (`OcBrain.shift`). */
export function noteShift(b: OcBrain, plays: readonly PlayDef[], base: number[], leaned: number[]): void {
  const sb = base.reduce((a, v) => a + v, 0) || 1;
  const sl = leaned.reduce((a, v) => a + v, 0) || 1;
  const d = { run: 0, quick: 0, deep: 0 };
  plays.forEach((p, i) => {
    const g = GROUP[p.tags.family];
    if (g) d[g] += leaned[i] / sl - base[i] / sb;
  });
  const k = 0.7;
  b.shift = { run: lerp(b.shift.run, d.run, k), quick: lerp(b.shift.quick, d.quick, k), deep: lerp(b.shift.deep, d.deep, k) };
}

/** Their adjustments, for the halftime card and the scouting report (the defense's view of the OC). */
export function ocAdjustments(b: OcBrain, star?: string): string[] {
  const out: [number, string][] = [];
  if (b.shift.run > 0.04) out.push([b.shift.run, "THEY'RE RUNNING AT YOUR FRONT"]);
  if (b.shift.run < -0.04) out.push([-b.shift.run, "THEY'VE STOPPED RUNNING INTO YOUR BOX"]);
  if (b.shift.quick > 0.04) out.push([b.shift.quick, 'THEY\'RE GETTING THE BALL OUT QUICK']);
  if (b.shift.deep > 0.04) out.push([b.shift.deep, "THEY'RE TAKING SHOTS OVER THE TOP"]);
  const hot = Object.entries(b.tres).map(([sl, r]) => [sl, r.d / (r.n + 3)] as const).sort((x, y) => y[1] - x[1])[0];
  if (hot && hot[1] > 0.15) out.push([hot[1], `THEY'RE FEEDING ${hot[0] === star ? 'THEIR TOP TARGET' : `THE ${hot[0]}`}`]);
  return out.sort((x, y) => y[0] - x[0]).map((x) => x[1]);
}
