import { ENGINE_PAYOFF } from '../data/enginePayoff';
import { FILM_PAYOFF } from '../data/filmPayoff';
import { DEF_CALLS, rushers, type DefCall, type DefTags } from '../data/defenses';
import { CALL_SITUATION, callWeight, OFF_STYLES, type OffStyle } from '../data/offStyles';
import { PLAYBOOK, type PlayDef } from '../data/plays';
import { FAMILIES, type Family } from '../data/playTags';
import type { Ratings } from '../data/ratings';
import { clamp, lerp } from '../engine/math';
import { personnelOf } from './resolvePlay';
import type { ThrowSeen } from './habits';

/**
 * The learning defense's model of your offense (docs/DEFENSE.md, "The ML DC"): what you'll call and who
 * you'll throw to, by situation and by the look you break the huddle in, and how well it has gone for you
 * against each call compared with what the film room says it should.
 *
 * It's a small Bayesian model, not a trained one. Each prediction is decayed counts of what you've run,
 * smoothed toward a prior stacked from the league, your OC's book (public), your roster, and the film of
 * your past games, so a few snaps of evidence mean something. The payoff side is the film table
 * (`data/filmPayoff.ts`, `npm run film`), corrected by residuals: what you actually gained against a kind
 * of call, less what film expects. Plain JSON: it lives in the DC's brain (game/defBrain.ts) for one game.
 */

/** The film table as the game reads it (written by `npm run film`, src/film.ts `payoffSource`). */
export interface FilmPayoff {
  reps: number;
  /** Column ids: a call's id, or `<call>+<tag>`. */
  cols: string[];
  /** By film row (a play id, `:give`/`:pull` for an RPO): success and explosive rate (%) by column (-1: no column), and pass targets' share by slot. */
  rows: Record<string, { s: number[]; e: number[]; t?: Record<string, number> }>;
}

/** The situation as the model bins it. */
export type SitBin = 'early' | 'third' | 'long' | 'short' | 'red';
export const SIT_BINS: SitBin[] = ['early', 'third', 'long', 'short', 'red'];

/**
 * Model tuning. Pseudocounts are how many decayed snaps of evidence weigh as much as the prior.
 * - `decay`: weight left on each older snap.
 * - `trust`: the prior's weight in the overall family shares, from a weak DC (`[0]`) to a sharp one (`[1]`);
 *   `sit` and `look`: how readily he separates a situation's or a look's calls from the overall picture;
 *   `play`: within a family, how readily he picks out one play (a weak DC sees "a quick pass", a sharp
 *   one "the slant"); `tgt`: the same for who the ball goes to.
 * - `styleMin`: how much of the family prior comes from your OC's style (public knowledge) at SCOUT 0;
 *   all of it at 100. `rosterTilt`: pass families × exp(this × the roster's pass edge), by SCOUT.
 *   `qbRun`: QB runs and reads × (1 + this × the QB's mobility).
 * - `tgtTalent`: a receiver's prior share of targets × exp(this × (his quality − 75)), by SCOUT.
 * - `expl`: an explosive play's weight in a play's damage, beside success.
 * - `filmTrust`: how much of the film's difference between calls he believes: each cell is pulled this far
 *   from its row's mean over the plain calls. The film room's QB isn't yours (it reads high to low on a
 *   fixed clock), so the film is a prior, and what you actually do against each call (the residuals)
 *   has to be able to overrule it.
 * - `res`: residual pseudocounts (the call's kind `cls`, the call itself `call`): a snap's success is
 *   about `sd` of noise, so a few snaps move his belief only a little. Each snap he draws from it
 *   (Thompson sampling) at `explore` of its spread, so he tries things and isn't perfectly predictable.
 * - `film`: the film of your past live games (`FilmBook`, kept on your `TeamState`): each snap on it weighs
 *   `w` of a live one, from SCOUT 0 to 100; each older game keeps `keep` of its weight; counts under `min`
 *   are dropped from the save.
 */
export const OFF_MODEL = {
  decay: 0.93,
  trust: [8, 3],
  sit: [10, 2.5],
  look: [10, 2],
  play: [14, 1.2],
  tgt: [10, 2],
  styleMin: 0.5,
  rosterTilt: 0.35,
  qbRun: 1.5,
  tgtTalent: 0.04,
  expl: 0.5,
  filmTrust: 0.5,
  res: { cls: [14, 6], call: [10, 5], sd: 0.45, explore: 0.12 },
  film: { w: [0.04, 0.35], keep: 0.6, min: 0.05 },
};

type Counts = Record<string, number>;
interface Resid {
  n: number;
  d: number;
}

/** What the DC knows of the offense's roster before the game. */
export interface RosterRead {
  /** 0..1, from the QB's speed. */
  qbMob: number;
  /** About -1..1: the passing game's talent (QB, best receivers) against the run game's (RB, line). */
  passEdge: number;
  /** Each receiving slot's quality (catching, routes, speed), by slot. */
  rec: Record<string, number>;
  /** Who plays each slot ("name #num"), for the film across games. */
  who: Record<string, string>;
}

export const REC_SLOTS = ['X', 'Z', 'SL', 'TE', 'RB'] as const;

/** Read a roster on the field (slot to player) the way a DC sizes up an offense before the game. */
export function rosterRead(roster: Record<string, { r: Ratings; name?: string; num?: number } | undefined>): RosterRead {
  const r = (s: string) => roster[s]?.r;
  const qb = r('QB');
  const rec: Record<string, number> = {};
  const who: Record<string, string> = {};
  for (const s of REC_SLOTS) {
    const x = r(s);
    if (!x) continue;
    rec[s] = s === 'TE' || s === 'RB' ? (x.cth + x.rte) / 2 : (x.cth + x.rte + x.spd) / 3;
    const p = roster[s];
    if (p?.name) who[s] = `${p.name} #${p.num ?? 0}`;
  }
  const wr = ['X', 'Z', 'SL'].map((s) => rec[s] ?? 70).sort((a, b) => b - a);
  const pass = ((qb ? (qb.sac + qb.mac + qb.arm) / 3 : 70) + (wr[0] + wr[1]) / 2) / 2;
  const rb = r('RB');
  const line = ['LT', 'LG', 'C', 'RG', 'RT'].map((s) => r(s)?.rbk ?? 70);
  const run = ((rb ? (rb.spd + rb.elu + rb.str) / 3 : 70) + line.reduce((a, b) => a + b, 0) / line.length) / 2;
  return { qbMob: clamp(((qb?.spd ?? 70) - 70) / 20, 0, 1), passEdge: clamp((pass - run) / 15, -1, 1), rec, who };
}

/** The model's knobs for one DC: his skill (ADJUST, 0..1) and his scouting (SCOUT, 0..1). */
export interface ModelParams {
  skill: number;
  scout: number;
}

const at = (k: number[], skill: number) => lerp(k[0], k[1], skill);

export interface OffModel {
  /** The plays the offense can call (its OC's book, plus anything it has run). */
  book: string[];
  /** The family prior by situation (sums to 1), and the target prior by play (slot shares). */
  prior: Record<SitBin, Counts>;
  tgtPrior: Record<string, Counts>;
  /** Decayed counts: families overall, what the prior expected of them, by situation, and by look. */
  fam: Counts;
  exp: Counts;
  sit: Record<string, Counts>;
  look: Record<string, Counts>;
  plays: Counts;
  /** Targets by play (slot), over all plays and what the play's prior expected of them, and the RPO's give rate. */
  tgt: Record<string, Counts>;
  tgtAll: Counts;
  tgtExp: Counts;
  give: { n: number; g: number };
  /** Success over the film's expectation by `fam|call` and `fam|cls`; by target slot. */
  res: Record<string, Resid>;
  tres: Record<string, Resid>;
  /** How many snaps it has seen (decayed), for the confidence of the whole picture. */
  n: number;
  /** This game's snaps, undecayed: the film it leaves for next week's DC. */
  raw: FilmBook;
  /** How you throw (`sigOf`): decayed counts overall and by look, and success over film by `sig|call` and `sig|cls`. */
  sig: Counts;
  sigLook: Record<string, Counts>;
  sres: Record<string, Resid>;
  /** The DC's knobs, for the residual of a residual (`learn`). */
  prm: ModelParams;
  /** The payoff table he reads (missing: the film's). */
  table?: PayoffTable;
}

/**
 * The film of an offense's live games (`TeamState.film`): what it called by situation and look, its
 * plays, and who it threw to (by slot, with who played there). Plain JSON, kept small.
 */
export interface FilmBook {
  /** Games on it (each older one weighs less). */
  g: number;
  fam: Counts;
  exp: Counts;
  sit: Record<string, Counts>;
  look: Record<string, Counts>;
  plays: Counts;
  tgtAll: Counts;
  tgtExp: Counts;
  give: { n: number; g: number };
  /** Who played each receiving slot ("name #num"). */
  who: Record<string, string>;
  /** How it went against film, by `fam|call` and `fam|cls`, and by target slot: which calls they beat. */
  res: Record<string, Resid>;
  tres: Record<string, Resid>;
  /** How you throw (`sigOf`) and how it went by call; the latest throws, for the players (game/habits.ts). */
  sig?: Counts;
  sigLook?: Record<string, Counts>;
  sres?: Record<string, Resid>;
  throws?: ThrowSeen[];
}

export const emptyFilm = (): FilmBook => ({
  g: 0, fam: {}, exp: {}, sit: {}, look: {}, plays: {}, tgtAll: {}, tgtExp: {}, give: { n: 0, g: 0 }, who: {}, res: {}, tres: {},
  sig: {}, sigLook: {}, sres: {}, throws: [],
});

/** The binned situation. */
export function sitBin(down: number, toGo: number, yardsToGoal: number): SitBin {
  if ((down >= 3 && toGo <= 2) || yardsToGoal <= 3) return 'short';
  if (down >= 3 && toGo >= 7) return 'long';
  if (down >= 3) return 'third';
  if (yardsToGoal <= 20) return 'red';
  return 'early';
}
const SIT_CALLS: Record<SitBin, keyof typeof CALL_SITUATION> = { early: 'normal', third: 'normal', long: 'long', short: 'short', red: 'normal' };

const BY_ID = new Map(PLAYBOOK.map((p) => [p.id, p]));
export const playById = (id: string) => BY_ID.get(id);
export const lookKey = (p: PlayDef) => `${personnelOf(p.formation)} ${p.formation.name}`;
const famOf = (p: PlayDef): Family => p.tags.family;
const norm = (c: Counts): Counts => {
  const t = Object.values(c).reduce((a, b) => a + Math.max(0, b), 0);
  return t > 0 ? Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.max(0, v) / t])) : c;
};
const total = (c: Counts | undefined) => (c ? Object.values(c).reduce((a, b) => a + b, 0) : 0);

/** A style's family shares in a situation. */
function styleShares(s: OffStyle, sit: SitBin): Counts {
  return norm(Object.fromEntries(FAMILIES.map((f) => [f, callWeight(s, f, SIT_CALLS[sit])])));
}
const leagueCache = new Map<SitBin, Counts>();
/** The league's family shares in a situation: the five styles' mean. */
export function leagueShares(sit: SitBin): Counts {
  let c = leagueCache.get(sit);
  if (!c) {
    const acc: Counts = {};
    for (const s of OFF_STYLES) for (const [f, v] of Object.entries(styleShares(s, sit))) acc[f] = (acc[f] ?? 0) + v / OFF_STYLES.length;
    leagueCache.set(sit, (c = acc));
  }
  return c;
}

const PASSY = new Set<string>(['quick', 'dropback', 'shot', 'screen', 'pa', 'boot']);

/**
 * A new model for one game: the prior from the league, the offense's OC style and book, and its roster.
 * `film` (from past games, `season/film.ts`) is laid on as counts already seen.
 */
export function newModel(o: { book: readonly PlayDef[]; style?: OffStyle; roster?: RosterRead; prm: ModelParams; table?: PayoffTable }): OffModel {
  const M = OFF_MODEL;
  // No book given (an exhibition harness): he expects anything in the library.
  const book = o.book.length ? o.book : PLAYBOOK;
  const fams = new Set(book.map(famOf));
  const ws = lerp(M.styleMin, 1, o.prm.scout);
  const prior = {} as Record<SitBin, Counts>;
  for (const sit of SIT_BINS) {
    const lg = leagueShares(sit);
    const st = o.style ? styleShares(o.style, sit) : lg;
    const raw: Counts = {};
    for (const f of FAMILIES) {
      // Families his book doesn't have are all but off the table.
      let v = ((1 - ws) * lg[f] + ws * st[f]) * (fams.has(f) ? 1 : 0.02);
      if (o.roster) {
        if (PASSY.has(f)) v *= Math.exp(M.rosterTilt * o.prm.scout * o.roster.passEdge);
        if (f === 'qbRun' || f === 'read') v *= 1 + M.qbRun * o.prm.scout * o.roster.qbMob;
      }
      raw[f] = v;
    }
    prior[sit] = norm(raw);
  }
  const tgtPrior: Record<string, Counts> = {};
  for (const p of book) {
    const t = FILM_PAYOFF.rows[p.read === 'rpo' ? `${p.id}:pull` : p.id]?.t;
    if (!t) continue;
    const raw: Counts = {};
    for (const [s, v] of Object.entries(t)) {
      const q = o.roster?.rec[s];
      raw[s] = v * (q === undefined ? 1 : Math.exp(M.tgtTalent * o.prm.scout * (q - 75)));
    }
    tgtPrior[p.id] = norm(raw);
  }
  return {
    book: book.map((p) => p.id), prior, tgtPrior, fam: {}, exp: {}, sit: {}, look: {}, plays: {}, tgt: {}, tgtAll: {}, tgtExp: {},
    give: { n: 0, g: 0 }, res: {}, tres: {}, n: 0, raw: { ...emptyFilm(), g: 1, who: { ...(o.roster?.who ?? {}) } },
    sig: {}, sigLook: {}, sres: {}, prm: o.prm, ...(o.table && o.table !== 'film' ? { table: o.table } : {}),
  };
}

function decayAll(m: OffModel, d: number): void {
  const dc = (c: Counts) => {
    for (const k of Object.keys(c)) c[k] *= d;
  };
  dc(m.fam);
  dc(m.exp);
  dc(m.plays);
  for (const c of Object.values(m.sit)) dc(c);
  for (const c of Object.values(m.look)) dc(c);
  for (const c of Object.values(m.tgt)) dc(c);
  dc(m.tgtAll);
  dc(m.tgtExp);
  dc(m.sig);
  for (const c of Object.values(m.sigLook)) dc(c);
  for (const r of [...Object.values(m.res), ...Object.values(m.tres), ...Object.values(m.sres)]) {
    r.n *= d;
    r.d *= d;
  }
  m.give.n *= d;
  m.give.g *= d;
  m.n *= d;
}

/** The kind of call a residual backs off to: man or zone, and pressure. */
const clsOf = (c: DefCall) => `${c.coverage}${rushers(c) >= 5 ? '+' : ''}`;

/**
 * One snap the model learns from. `target` is the slot thrown to. Its result is graded the way the film
 * room grades that play (`filmOk`), so it compares with the film's cell whatever the down was.
 */
export interface ModelSnap {
  play: PlayDef;
  call: DefCall;
  tags?: DefTags;
  sit: SitBin;
  gain: number;
  /** A sack or a turnover. */
  lost?: boolean;
  yardsToGoal: number;
  handedOff?: boolean;
  target?: string | null;
  /** The throw, as the players remember it (game/habits.ts): its signature (`sigOf`) is how you throw. */
  throw?: Omit<ThrowSeen, 'w'> | null;
  /** Weight of this snap (1 a live snap; less for film). */
  w?: number;
  /** Decay before it (false for a film snap laid in at the start). */
  decay?: boolean;
}

export function learn(m: OffModel, s: ModelSnap): void {
  const w = s.w ?? 1;
  if (s.decay !== false) decayAll(m, OFF_MODEL.decay);
  const p = s.play;
  if (!m.book.includes(p.id)) m.book.push(p.id);
  m.n += w;
  tallySnap(m, p, s.sit, s.handedOff, s.target, w);
  tallySnap(m.raw, p, s.sit, s.handedOff, s.target, 1, m.tgtPrior, m.prior);
  const f = famOf(p);
  const rpo = p.read === 'rpo';
  if (s.target) {
    const t = (m.tgt[p.id] ??= {});
    t[s.target] = (t[s.target] ?? 0) + w;
  }
  // What it was worth against film: success less what this call should have given up.
  const row = rpo ? `${p.id}:${s.handedOff ? 'give' : 'pull'}` : p.id;
  const e = cell(row, f, s.call, s.tags, OFF_MODEL.filmTrust, m.table).s;
  const d = (filmOk(p, s.gain, s.yardsToGoal, s.lost) ? 1 : 0) - e;
  const bump = (to: Record<string, Resid>, k: string, x: number) => {
    const r = (to[k] ??= { n: 0, d: 0 });
    r.n += x;
    r.d += x * d;
  };
  for (const k of [`${f}|${s.call.id}`, `${f}|${clsOf(s.call)}`]) {
    bump(m.res, k, w);
    bump(m.raw.res, k, 1);
  }
  if (s.target) {
    bump(m.tres, s.target, w);
    bump(m.raw.tres, s.target, 1);
  }
  // How you threw it: the signature's count, and what's left of the result once the family's residual has
  // had its share (so the same snap isn't counted twice).
  if (s.throw) {
    const g = sigOf(s.throw);
    const look = lookKey(p);
    for (const [to, x] of [[m, w], [m.raw, 1]] as const) {
      to.sig![g] = (to.sig![g] ?? 0) + x;
      const sl = (to.sigLook![look] ??= {});
      sl[g] = (sl[g] ?? 0) + x;
    }
    const d2 = d - resid(m, m.prm, f, s.call);
    for (const k of [`${g}|${s.call.id}`, `${g}|${clsOf(s.call)}`]) {
      for (const [to, x] of [[m.sres, w], [m.raw.sres!, 1]] as const) {
        const r = (to[k] ??= { n: 0, d: 0 });
        r.n += x;
        r.d += x * d2;
      }
    }
  }
}

/**
 * A throw's signature, how the DC buckets the way you throw: where the QB threw from (the pocket, or rolled
 * to the formation's strong or weak side), how deep it came down (behind the line, under 8, under 15, deeper),
 * inside or outside (12+ yd across from the ball), and the throw type: "RW|M|out|bullet".
 */
export function sigOf(t: Pick<ThrowSeen, 'roll' | 'dx' | 'dy' | 'kind'>): string {
  const where = t.roll === 0 ? 'P' : t.roll > 0 ? 'RS' : 'RW';
  const band = t.dx < 0 ? 'B' : t.dx < 8 ? 'S' : t.dx < 15 ? 'M' : 'D';
  return `${where}|${band}|${Math.abs(t.dy) >= 12 ? 'out' : 'in'}|${t.kind}`;
}

/**
 * The coaching prior on a throw signature against a call (success over film), before he's seen it work or
 * fail: a rolling QB beats man and Cover 3 and is walled by a hard flat (Cover 2, Tampa 2, Sky's strong
 * side); the quick out is the Cover 2 corner's; the deep ball wants two high (`HABIT_PRIOR`).
 */
export const HABIT_PRIOR = {
  roll: { c2: -0.06, tampa2: -0.06, 'c3-sky': -0.03, c3: 0.03, man: 0.04 } as Record<string, number>,
  quickOut: { c2: -0.06, tampa2: -0.04, man: 0.03 } as Record<string, number>,
  deep: { twoHigh: -0.05, oneHigh: 0.05 },
};
function priorResid(sig: string, call: DefCall): number {
  const [where, band, side] = sig.split('|');
  const H = HABIT_PRIOR;
  const man = call.coverage === 'man' ? 'man' : '';
  let v = 0;
  if (where !== 'P' && band !== 'D') v += H.roll[call.id] ?? H.roll[man] ?? 0;
  if (band === 'S' && side === 'out') v += H.quickOut[call.id] ?? H.quickOut[man] ?? 0;
  if (band === 'D') v += call.shell === 'two-high' ? H.deep.twoHigh : H.deep.oneHigh;
  return v;
}

/** The share of each throw signature he expects (from that look, when he has it); empty with no throws seen. */
export function sigDist(m: OffModel, prm: ModelParams, look?: string): Counts {
  const all = norm({ ...m.sig });
  if (!look || !m.sigLook[look]) return all;
  const lc = m.sigLook[look];
  const n = total(lc);
  const A = at(OFF_MODEL.look, prm.skill);
  const out: Counts = {};
  for (const k of new Set([...Object.keys(all), ...Object.keys(lc)])) out[k] = ((lc[k] ?? 0) + A * (all[k] ?? 0)) / (n + A);
  return out;
}

/** What he believes a throw signature does against a call over film (and the family's residual): `z` draws from its spread. */
export function residSig(m: OffModel, prm: ModelParams, sig: string, call: DefCall, z = 0): number {
  const R = OFF_MODEL.res;
  const kc = at(R.cls, prm.skill);
  const kk = at(R.call, prm.skill);
  const pr = priorResid(sig, call);
  const cl = m.sres[`${sig}|${clsOf(call)}`];
  const rc = ((cl?.d ?? 0) + kc * pr) / ((cl?.n ?? 0) + kc);
  const cc = m.sres[`${sig}|${call.id}`];
  const n = cc?.n ?? 0;
  return ((cc?.d ?? 0) + kk * rc) / (n + kk) + (z * R.sd * R.explore) / Math.sqrt(n + (cl?.n ?? 0) + kk);
}

/** The share of the throws he's seen thrown on the move (out of the pocket). */
export function rollShare(m: OffModel): number {
  const n = total(m.sig);
  return n ? Object.entries(m.sig).reduce((a, [k, v]) => a + (k.startsWith('R') ? v : 0), 0) / n : 0;
}

/**
 * A snap's success as the film room grades the play (src/film.ts, `successful`): 4 yards, as on 1st and
 * 10, or 1 for a short-yardage play, as on 3rd and 1 (a score always counts); never on a sack or a turnover.
 */
export function filmOk(p: PlayDef, gain: number, yardsToGoal: number, lost = false): boolean {
  return !lost && gain >= Math.min(p.short ? 1 : 4, yardsToGoal);
}

/** Count a snap into a model's or a film's tallies. */
function tallySnap(
  m: Omit<FilmBook, 'g' | 'who'>, p: PlayDef, sit: SitBin, handedOff: boolean | undefined, target: string | null | undefined, w: number,
  tgtPrior = (m as OffModel).tgtPrior, prior = (m as OffModel).prior,
): void {
  const f = famOf(p);
  m.fam[f] = (m.fam[f] ?? 0) + w;
  for (const [k, v] of Object.entries(prior[sit])) m.exp[k] = (m.exp[k] ?? 0) + w * v;
  const sc = (m.sit[sit] ??= {});
  sc[f] = (sc[f] ?? 0) + w;
  const lc = (m.look[lookKey(p)] ??= {});
  lc[f] = (lc[f] ?? 0) + w;
  m.plays[p.id] = (m.plays[p.id] ?? 0) + w;
  if (p.read === 'rpo') {
    m.give.n += w;
    if (handedOff) m.give.g += w;
  }
  if (target) {
    m.tgtAll[target] = (m.tgtAll[target] ?? 0) + w;
    for (const [k, v] of Object.entries(tgtPrior[p.id] ?? {})) m.tgtExp[k] = (m.tgtExp[k] ?? 0) + w * v;
  }
}

// ------------------------------------------------------------ film across games

/** Each count of a film × `k`, dropping the ones under `OFF_MODEL.film.min` and rounding the rest. */
function scaleCounts(c: Counts, k: number): Counts {
  const out: Counts = {};
  for (const [key, v] of Object.entries(c)) {
    const x = Math.round(v * k * 100) / 100;
    if (x >= OFF_MODEL.film.min) out[key] = x;
  }
  return out;
}
function addCounts(a: Counts, b: Counts): Counts {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.round(((out[k] ?? 0) + v) * 100) / 100;
  return out;
}
function mapCounts(a: Record<string, Counts>, b: Record<string, Counts>, k: number): Record<string, Counts> {
  const out: Record<string, Counts> = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const c = addCounts(scaleCounts(a[key] ?? {}, k), scaleCounts(b[key] ?? {}, 1));
    if (Object.keys(c).length) out[key] = c;
  }
  return out;
}

/**
 * The film after another game: the old film at `keep` of its weight, plus this game's snaps. A receiving
 * slot whose player changed loses its old targets (they were someone else's).
 */
export function mergeFilm(old: FilmBook | undefined, game: FilmBook): FilmBook {
  const o = old ?? emptyFilm();
  const k = OFF_MODEL.film.keep;
  const changed = Object.keys(o.who).filter((sl) => game.who[sl] && game.who[sl] !== o.who[sl]);
  const drop = (c: Counts) => Object.fromEntries(Object.entries(c).filter(([sl]) => !changed.includes(sl)));
  return {
    g: Math.round((o.g * k + 1) * 100) / 100,
    fam: addCounts(scaleCounts(o.fam, k), scaleCounts(game.fam, 1)),
    exp: addCounts(scaleCounts(o.exp, k), scaleCounts(game.exp, 1)),
    sit: mapCounts(o.sit, game.sit, k),
    look: mapCounts(o.look, game.look, k),
    plays: addCounts(scaleCounts(o.plays, k), scaleCounts(game.plays, 1)),
    tgtAll: addCounts(scaleCounts(drop(o.tgtAll), k), scaleCounts(game.tgtAll, 1)),
    tgtExp: addCounts(scaleCounts(drop(o.tgtExp), k), scaleCounts(game.tgtExp, 1)),
    give: { n: Math.round((o.give.n * k + game.give.n) * 100) / 100, g: Math.round((o.give.g * k + game.give.g) * 100) / 100 },
    who: { ...o.who, ...game.who },
    res: mergeRes(o.res ?? {}, game.res, k),
    sig: addCounts(scaleCounts(o.sig ?? {}, k), scaleCounts(game.sig ?? {}, 1)),
    sigLook: mapCounts(o.sigLook ?? {}, game.sigLook ?? {}, k),
    sres: mergeRes(o.sres ?? {}, game.sres ?? {}, k),
    throws: [...(game.throws ?? []), ...(o.throws ?? []).map((r) => ({ ...r, w: Math.round(r.w * k * 100) / 100 }))].filter((r) => r.w >= OFF_MODEL.film.min).slice(0, 12),
    tres: mergeRes(Object.fromEntries(Object.entries(o.tres ?? {}).filter(([sl]) => !changed.includes(sl))), game.tres, k),
  };
}
function mergeRes(a: Record<string, Resid>, b: Record<string, Resid>, k: number): Record<string, Resid> {
  const out: Record<string, Resid> = {};
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const n = r2((a[key]?.n ?? 0) * k + (b[key]?.n ?? 0));
    if (n >= OFF_MODEL.film.min) out[key] = { n, d: r2((a[key]?.d ?? 0) * k + (b[key]?.d ?? 0)) };
  }
  return out;
}

/**
 * Lay the film into a new model as snaps already seen, each weighing `OFF_MODEL.film.w` by the DC's
 * SCOUT. Targets count only for a slot still played by the same man. Live snaps decay it as the game goes.
 */
export function layFilm(m: OffModel, film: FilmBook, prm: ModelParams): void {
  const w = at(OFF_MODEL.film.w, prm.scout);
  const same = (sl: string) => !film.who[sl] || !m.raw.who[sl] || film.who[sl] === m.raw.who[sl];
  const lay = (to: Counts, from: Counts, keep: (k: string) => boolean = () => true) => {
    for (const [k, v] of Object.entries(from)) if (keep(k)) to[k] = (to[k] ?? 0) + v * w;
  };
  lay(m.fam, film.fam);
  lay(m.exp, film.exp);
  for (const [k, c] of Object.entries(film.sit)) lay((m.sit[k] ??= {}), c);
  for (const [k, c] of Object.entries(film.look)) lay((m.look[k] ??= {}), c);
  // Plays he could call (a film play from an old book is still a play he might run).
  for (const id of Object.keys(film.plays)) if (BY_ID.has(id) && !m.book.includes(id)) m.book.push(id);
  lay(m.plays, film.plays);
  lay(m.tgtAll, film.tgtAll, same);
  lay(m.tgtExp, film.tgtExp, same);
  m.give.n += film.give.n * w;
  m.give.g += film.give.g * w;
  const layRes = (to: Record<string, Resid>, from: Record<string, Resid> | undefined, keep: (k: string) => boolean = () => true) => {
    for (const [k, r] of Object.entries(from ?? {})) {
      if (!keep(k)) continue;
      const t = (to[k] ??= { n: 0, d: 0 });
      t.n += r.n * w;
      t.d += r.d * w;
    }
  };
  layRes(m.res, film.res);
  layRes(m.tres, film.tres, same);
  layRes(m.sres, film.sres);
  lay(m.sig, film.sig ?? {});
  for (const [k, c] of Object.entries(film.sigLook ?? {})) lay((m.sigLook[k] ??= {}), c);
  m.n += Object.values(film.fam).reduce((a, b) => a + b, 0) * w;
}

const RUN_FAMS = new Set<string>(['insideZone', 'outsideZone', 'gap', 'perimeter', 'read', 'qbRun', 'draw']);
/**
 * What a film shows, for the prep page: the run share on early downs, the pass share on third and long
 * (null with under `min` snaps there), and the go-to receiver's share of the throws.
 */
export function filmSummary(f: FilmBook, min = 3): { early: number | null; long: number | null; top: { slot: string; who?: string; share: number } | null } {
  const runShare = (c: Counts | undefined) => {
    const n = total(c);
    return c && n >= min ? Object.entries(c).reduce((a, [k, v]) => a + (RUN_FAMS.has(k) ? v : 0), 0) / n : null;
  };
  const early = runShare(addCounts(f.sit.early ?? {}, f.sit.red ?? {}));
  const lr = runShare(f.sit.long);
  const t = Object.entries(f.tgtAll).sort((a, b) => b[1] - a[1])[0];
  const n = total(f.tgtAll);
  return { early, long: lr === null ? null : 1 - lr, top: t && n >= min ? { slot: t[0], who: f.who[t[0]], share: t[1] / n } : null };
}

// ------------------------------------------------------------ predicting

/**
 * The family shares for a situation, and a look when he has it. The overall picture tilts the prior by
 * what's been seen against what the prior expected; the situation's own snaps and then the look's are
 * laid on top, each smoothed toward the level above.
 */
export function famDist(m: OffModel, prm: ModelParams, sit: SitBin, look?: string): Counts {
  const M = OFF_MODEL;
  const A = at(M.trust, prm.skill);
  const pr = m.prior[sit];
  const base: Counts = {};
  for (const f of FAMILIES) {
    const q = pr[f] ?? 0;
    const tilt = ((m.fam[f] ?? 0) + A * q) / ((m.exp[f] ?? 0) + A * q || 1);
    base[f] = q * tilt;
  }
  const b = norm(base);
  const sc = m.sit[sit];
  const As = at(M.sit, prm.skill);
  const ns = total(sc);
  const ps: Counts = {};
  for (const f of FAMILIES) ps[f] = ((sc?.[f] ?? 0) + As * b[f]) / (ns + As);
  if (!look) return ps;
  const lc = m.look[look];
  const Al = at(M.look, prm.skill);
  const nl = total(lc);
  const pl: Counts = {};
  for (const f of FAMILIES) pl[f] = ((lc?.[f] ?? 0) + Al * ps[f]) / (nl + Al);
  return pl;
}

/** The plays he expects, with their odds: each family's share split over its plays (from that look, if given). */
export function playDist(m: OffModel, prm: ModelParams, sit: SitBin, look?: string): { p: PlayDef; w: number }[] {
  const fd = famDist(m, prm, sit, look);
  const Ap = at(OFF_MODEL.play, prm.skill);
  const byFam = new Map<Family, PlayDef[]>();
  for (const id of m.book) {
    const p = BY_ID.get(id);
    if (!p || (look && lookKey(p) !== look)) continue;
    // Short-yardage plays are called there; elsewhere they're all but off the table.
    if (p.short && sit !== 'short' && !(m.plays[id] > 0.5)) continue;
    const f = famOf(p);
    byFam.set(f, [...(byFam.get(f) ?? []), p]);
  }
  const out: { p: PlayDef; w: number }[] = [];
  for (const [f, ps] of byFam) {
    const seen = ps.reduce((a, p) => a + (m.plays[p.id] ?? 0), 0);
    for (const p of ps) out.push({ p, w: (fd[f] ?? 0) * ((m.plays[p.id] ?? 0) + Ap / ps.length) / (seen + Ap) });
  }
  const t = out.reduce((a, x) => a + x.w, 0);
  if (t > 0) for (const x of out) x.w /= t;
  return out;
}

/** The league's plays in a situation: the baseline a call's worth is measured against. */
const leaguePlays = new Map<SitBin, { p: PlayDef; w: number }[]>();
export function leagueDist(sit: SitBin): { p: PlayDef; w: number }[] {
  let d = leaguePlays.get(sit);
  if (!d) {
    const sh = leagueShares(sit);
    const byFam = new Map<Family, PlayDef[]>();
    for (const p of PLAYBOOK) {
      if (p.short && sit !== 'short') continue;
      byFam.set(famOf(p), [...(byFam.get(famOf(p)) ?? []), p]);
    }
    d = [];
    for (const [f, ps] of byFam) for (const p of ps) d.push({ p, w: (sh[f] ?? 0) / ps.length });
    const t = d.reduce((a, x) => a + x.w, 0);
    for (const x of d) x.w /= t;
    leaguePlays.set(sit, d);
  }
  return d;
}

/**
 * Who he expects the ball to go to on a play (slot shares): the play's prior, tilted by who you've thrown
 * to on every play against who those plays' priors expected (your favorite), then this play's own throws.
 */
export function targetDist(m: OffModel, prm: ModelParams, playId: string): Counts {
  const base = m.tgtPrior[playId];
  if (!base) return {};
  const At = at(OFF_MODEL.tgt, prm.skill);
  const pr = norm(Object.fromEntries(Object.entries(base).map(([s, q]) => {
    const e = m.tgtExp[s] ?? 0;
    return [s, q * ((m.tgtAll[s] ?? 0) + At * q) / (e + At * q || 1)];
  })));
  const c = m.tgt[playId] ?? {};
  const n = total(c);
  const out: Counts = {};
  for (const s of new Set([...Object.keys(pr), ...Object.keys(c)])) out[s] = ((c[s] ?? 0) + At * (pr[s] ?? 0)) / (n + At);
  return out;
}

/** The RPO's give rate he expects. */
export const giveRate = (m: OffModel) => (m.give.g + 1) / (m.give.n + 2);

// ------------------------------------------------------------ the payoff

const COL = new Map(FILM_PAYOFF.cols.map((c, i) => [c, i]));
/** Family means by column, the backoff for a play the film room hasn't measured. */
let famMeans: Map<string, { s: number[]; e: number[] }> | null = null;
function famMean(f: Family): { s: number[]; e: number[] } | undefined {
  if (!famMeans) {
    famMeans = new Map();
    const acc = new Map<string, { s: number[]; e: number[]; n: number[] }>();
    for (const [id, r] of Object.entries(FILM_PAYOFF.rows)) {
      const p = BY_ID.get(id.split(':')[0]);
      if (!p) continue;
      const a = acc.get(famOf(p)) ?? { s: r.s.map(() => 0), e: r.e.map(() => 0), n: r.s.map(() => 0) };
      r.s.forEach((v, i) => {
        if (v < 0) return;
        a.s[i] += v;
        a.e[i] += r.e[i];
        a.n[i]++;
      });
      acc.set(famOf(p), a);
    }
    for (const [k, a] of acc) famMeans.set(k, { s: a.s.map((v, i) => (a.n[i] ? v / a.n[i] : -1)), e: a.e.map((v, i) => (a.n[i] ? v / a.n[i] : -1)) });
  }
  return famMeans.get(f);
}

/**
 * Which payoff table a learner reads: the film room's (`filmPayoff.ts`, the user's games: his passing is closer to
 * the film room's QB) or the engine's (`enginePayoff.ts`, engine drives: the CPU QB reading the field).
 */
export type PayoffTable = 'film' | 'engine';

const ECOL = new Map((ENGINE_PAYOFF?.cols ?? []).map((c, i) => [c, i]));
/** An engine cell as rates (0..1): the family against the call; the film's family mean before the table exists. */
function engineCell(f: Family, call: DefCall): { s: number; e: number } | null {
  const r = ENGINE_PAYOFF?.rows[f];
  const i = ECOL.get(call.id);
  if (!r || i === undefined || r.s[i] < 0) return null;
  return { s: r.s[i] / 100, e: r.e[i] / 100 };
}

/** A film cell as rates (0..1): the row against the call with its tags, falling back to the plain call, then the family. */
export function cell(row: string, f: Family, call: DefCall, tags?: DefTags, trust = 1, table: PayoffTable = 'film'): { s: number; e: number } {
  if (table === 'engine') {
    const c = engineCell(f, call);
    if (c) return c;
  }
  const r = FILM_PAYOFF.rows[row] ?? famMean(f);
  if (!r) return { s: 0.45, e: 0.1 };
  const tagged = tags?.rpo ? `${call.id}+rpo` : tags?.spy ? `${call.id}+spy` : null;
  for (const c of tagged ? [tagged, call.id] : [call.id]) {
    const i = COL.get(c);
    if (i === undefined || r.s[i] < 0) continue;
    const m = rowMean(r);
    return { s: (m.s + trust * (r.s[i] - m.s)) / 100, e: (m.e + trust * (r.e[i] - m.e)) / 100 };
  }
  return { s: 0.45, e: 0.1 };
}
const PLAIN = FILM_PAYOFF.cols.map((c, i) => (c.includes('+') ? -1 : i)).filter((i) => i >= 0);
const MEANS = new WeakMap<object, { s: number; e: number }>();
/** A film row's mean over the plain calls it has. */
function rowMean(r: { s: number[]; e: number[] }): { s: number; e: number } {
  let m = MEANS.get(r);
  if (!m) {
    const ix = PLAIN.filter((i) => r.s[i] >= 0);
    m = { s: ix.reduce((a, i) => a + r.s[i], 0) / Math.max(1, ix.length), e: ix.reduce((a, i) => a + r.e[i], 0) / Math.max(1, ix.length) };
    MEANS.set(r, m);
  }
  return m;
}

/** A play's film damage against a call (success plus `expl` × explosives); an RPO by the give rate. */
export function damage(p: PlayDef, call: DefCall, give: number, tags?: DefTags, table: PayoffTable = 'film'): number {
  const f = famOf(p);
  const one = (row: string) => {
    const k = `${table}|${row}|${call.id}|${tags?.rpo ? 'r' : ''}${tags?.spy ? 's' : ''}`;
    let v = DAMAGE.get(k);
    if (v === undefined) {
      const c = cell(row, f, call, tags, OFF_MODEL.filmTrust, table);
      DAMAGE.set(k, (v = c.s + OFF_MODEL.expl * c.e));
    }
    return v;
  };
  return p.read === 'rpo' ? give * one(`${p.id}:give`) + (1 - give) * one(`${p.id}:pull`) : one(p.id);
}
/** Film damage is fixed for the session: cached by row, call and tags. */
const DAMAGE = new Map<string, number>();

/** The residual (success over film) he believes for a family against a call; `z` draws from its spread. */
export function resid(m: OffModel, prm: ModelParams, f: Family, call: DefCall, z = 0): number {
  const R = OFF_MODEL.res;
  const kc = at(R.cls, prm.skill);
  const kk = at(R.call, prm.skill);
  const cl = m.res[`${f}|${clsOf(call)}`];
  const rc = cl ? cl.d / (cl.n + kc) : 0;
  const cc = m.res[`${f}|${call.id}`];
  const n = cc?.n ?? 0;
  const mean = ((cc?.d ?? 0) + kk * rc) / (n + kk);
  return mean + (z * R.sd * R.explore) / Math.sqrt(n + (cl?.n ?? 0) + kk);
}

/** Every call by id. */
export const CALLS_BY_ID: Record<string, DefCall> = Object.fromEntries(DEF_CALLS.map((c) => [c.id, c]));
