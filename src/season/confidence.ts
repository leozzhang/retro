import type { Athlete, DevTrait } from '../data/athletes';
import { healthOf, healthy, HEALTH, starters, type Squad } from '../data/depth';
import { overall, POS_ROLE, SLOT_POS } from '../data/positions';
import { clamp, type Rng } from '../engine/math';
import { DEF_SLOTS, OFF_SLOTS, type GameGrade } from './grades';
import { levelUp } from './progression';
import type { ConfEvent, Progress, RatingDelta, SeasonState, TeamState } from './types';

/**
 * Confidence over a season, next man up, and breakouts. Confidence follows how a player plays against
 * what his matchup expects (his game grades), big moments counting more; it moves his nerve ratings on
 * the field (data/confidence.ts). A backup thrust into the lineup for a reason (the starter hurt,
 * slumping or outplayed) gets a spark that good starts lock in, and a strong run of starts from there
 * is a breakout. See docs/CONFIDENCE.md.
 */

/**
 * Season tuning.
 * - `rate`: how far one full-time game moves confidence toward that game's performance (an EMA).
 * - `snapSd`: the spread of one snap grade, to turn a game's average into a z (`zCap` caps it); the
 *   game's performance is `tanh(z / perfScale)`. A full-time starter's z has an SD of about 1.1.
 * - `spark`: the next-man-up boost; `sparkStarts` it lasts; each start that grades at or above
 *   expectation locks `sparkKeep` of what's left into his confidence, and one below keeps `sparkFade`.
 * - `quietGames`: a sparked starter didn't start the team's last this-many games, and has under
 *   `maxStarts` starts this season.
 * - `slump`: built-up confidence at or under which a benched starter counts as slumping (benching
 *   penalties don't count, so benchings can't manufacture a slump).
 * - `benchHit`: what a healthy, in-form starter loses when the user benches him for a weaker player. It's
 *   a penalty of its own that keeps `benchFade` of itself each team game.
 * - `offseason`: share of confidence carried into next season.
 */
export const CONFIDENCE = {
  rate: 0.45,
  snapSd: 0.45,
  zCap: 3,
  perfScale: 1.2,
  spark: 0.5,
  sparkStarts: 3,
  sparkKeep: 0.5,
  sparkFade: 0.5,
  quietGames: 2,
  maxStarts: 3,
  slump: -0.35,
  benchHit: 0.3,
  benchFade: 0.5,
  offseason: 0.5,
};

/**
 * Breakouts: over a sparked player's first `games` team games, at least `minStarts` starts averaging a
 * performance z of `z` or better. He moves up a dev trait, gains `potential`, and gets a breakthrough.
 */
export const BREAKOUT = { games: 4, minStarts: 3, z: 0.55, potential: 2 };

const DEV_ORDER: DevTrait[] = ['normal', 'impact', 'star', 'elite'];

/** The slots a start counts at: the 11-personnel offense, the nickel defense, the kicker and punter. */
export const START_SLOTS = [...OFF_SLOTS, ...DEF_SLOTS, 'K', 'P'];

/** His confidence on the field: what he's built up, plus any spark, less any benching penalty. */
export function confOf(p: Progress | undefined): number {
  return clamp((p?.c ?? 0) + (p?.sp ?? 0) - (p?.bh ?? 0), -1, 1);
}

/** How a game went against expectation, as a z: big moments weighted, few snaps trusted less. */
export function perfZ(g: GameGrade): number {
  if (!g.snaps) return 0;
  const avg = g.lw ? g.lsum / g.lw : g.sum / g.snaps;
  return clamp((avg * Math.sqrt(g.snaps)) / CONFIDENCE.snapSd, -CONFIDENCE.zCap, CONFIDENCE.zCap);
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** One game's step: confidence moves toward the game's performance, more for more playing time. */
export function updateConfidence(p: Progress, g: GameGrade): void {
  const perf = Math.tanh(perfZ(g) / CONFIDENCE.perfScale);
  const w = CONFIDENCE.rate * Math.sqrt(clamp(g.share, 0, 1));
  const c = p.c ?? 0;
  p.c = round3(clamp(c + w * (perf - c), -1, 1));
}

export type SparkReason = NonNullable<ConfEvent['reason']>;

export interface SparkEvent {
  team: string;
  athlete: Athlete;
  replaced: Athlete;
  reason: SparkReason;
}

export interface BreakoutEvent {
  team: string;
  athlete: Athlete;
  from: DevTrait;
  to: DevTrait;
  d: RatingDelta;
}

/** A banged-up starter sitting to heal: no spark for his backup, no penalty for him. */
export function restDay(replaced: Athlete): boolean {
  return healthy(replaced) && healthOf(replaced) < HEALTH.restBelow;
}

/**
 * Why a starter lost his job, if for a reason that earns his replacement a spark: he's hurt, slumping
 * (`replacedConf` is his built-up confidence), or the new man is at least as good. Null is a benching
 * that earns nothing. A rest day (`restDay`) is neither, and is checked first.
 */
export function sparkReason(newcomer: Athlete, replaced: Athlete, slot: string, replacedConf: number): SparkReason | null {
  if (!healthy(replaced)) return 'injured';
  if (replacedConf <= CONFIDENCE.slump) return 'slumping';
  const pos = SLOT_POS[slot];
  if (overall(newcomer.r, pos) >= overall(replaced.r, pos)) return 'outplayed';
  return null;
}

/** Could he spark now: quiet lately, few starts, not back from an injury, and not sparked already this season. */
function canSpark(state: SeasonState, a: Athlete, p: Progress | undefined, gameNo: number): boolean {
  if (p?.spy === state.year) return false;
  if ((p?.gs ?? 0) >= CONFIDENCE.maxStarts) return false;
  if (p?.ls !== undefined && p.ls >= gameNo - CONFIDENCE.quietGames) return false;
  return !(state.injuryLog ?? []).some((e) => e.id === a.id);
}

/**
 * Pair each new starter with the starter he replaced: the same position first, then the same role.
 * `newcomers` and `gone` are in slot order.
 */
function pairUp(newcomers: [string, Athlete][], gone: [string, Athlete][]): [string, Athlete, Athlete][] {
  const left = [...gone];
  const out: [string, Athlete, Athlete][] = [];
  for (const match of [(a: Athlete, b: Athlete) => a.pos === b.pos, (a: Athlete, b: Athlete) => POS_ROLE[a.pos] === POS_ROLE[b.pos]]) {
    for (const [slot, n] of newcomers) {
      if (out.some(([, m]) => m === n)) continue;
      const i = left.findIndex(([, d]) => match(n, d));
      if (i < 0) continue;
      out.push([slot, n, left[i][1]]);
      left.splice(i, 1);
    }
  }
  return out;
}

/** A player starting who didn't start last game, the man he replaced, why, and whether it sparks him. */
export interface NewStarter {
  slot: string;
  athlete: Athlete;
  replaced: Athlete;
  reason: SparkReason | null;
  /** He replaced a banged-up starter who's resting: neither a spark nor a benching. */
  rest: boolean;
  spark: boolean;
}

/**
 * This game's new starters against last game's (`ts.st`), before the game: a pure function of the
 * state, so `squadFor` can put the spark on the field for his first start and the progress step can
 * commit the same decision afterwards.
 */
export function newStarters(state: SeasonState, ts: TeamState, squad: Squad): NewStarter[] {
  const prev = ts.st;
  if (!prev || !Object.keys(prev).length) return [];
  const prog = ts.progress ?? {};
  const st = starters(squad);
  const now: [string, Athlete][] = START_SLOTS.filter((s) => st[s]).map((s) => [s, st[s]]);
  const nowIds = new Set(now.map(([, a]) => a.id));
  const prevIds = new Set(Object.values(prev));
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const gone = START_SLOTS.filter((s) => prev[s] && !nowIds.has(prev[s]) && byId.has(prev[s])).map((s) => [s, byId.get(prev[s])!] as [string, Athlete]);
  const gameNo = (ts.gp ?? 0) + 1;
  return pairUp(now.filter(([, a]) => !prevIds.has(a.id)), gone).map(([slot, n, d]) => {
    const rest = restDay(d);
    const reason = rest ? null : sparkReason(n, d, slot, prog[d.id]?.c ?? 0);
    return { slot, athlete: n, replaced: d, reason, rest, spark: reason !== null && canSpark(state, n, prog[n.id], gameNo) };
  });
}

/**
 * The breakout itself: one dev trait up, more potential, and a breakthrough level-up drawn against the
 * raised ceilings. `a` is the player as he took the field, `base` his generated self.
 */
function breakOut(state: SeasonState, p: Progress, a: Athlete, base: Athlete, week: number, rng: Rng): Omit<BreakoutEvent, 'team'> {
  const from = a.dev;
  const to = DEV_ORDER[Math.min(DEV_ORDER.length - 1, DEV_ORDER.indexOf(from) + 1)];
  p.bo = state.year;
  p.dev = to;
  p.pot = (p.pot ?? 0) + BREAKOUT.potential;
  const up = levelUp({ ...a.r }, { ...base, potential: base.potential + p.pot }, {}, rng, true);
  if (Object.keys(up.d).length) {
    p.lvl++;
    if (p.up?.week !== week) p.up = { week, d: {} };
    for (const [k, v] of Object.entries(up.d) as [keyof RatingDelta, number][]) {
      p.d[k] = (p.d[k] ?? 0) + v;
      p.up.d[k] = (p.up.d[k] ?? 0) + v;
    }
    p.up.big = true;
  }
  return { athlete: a, from, to, d: up.d };
}

/**
 * One team's confidence after a game: every player who played moves toward his performance; new
 * starters who earned the job spark, and an in-form starter the user benched for a weaker one takes a
 * penalty; sparks lock in or fade; breakout windows advance. Writes this game's starters to `ts.st`.
 * `squad` is the team as it took the field, `bases` the generated roster (for ceilings).
 */
export function confidenceStep(
  state: SeasonState, ts: TeamState, squad: Squad, grades: Map<string, GameGrade>, bases: Map<string, Athlete>, week: number, rng: Rng,
): { sparks: SparkEvent[]; breakouts: BreakoutEvent[] } {
  const team = squad.team.id;
  const prog = (ts.progress ??= {});
  const entry = (id: string) => (prog[id] ??= { xp: 0, lvl: 0, d: {} });
  // Decided on the state as the game began, like `squadFor` did.
  const fresh = newStarters(state, ts, squad);
  const gameNo = (ts.gp = (ts.gp ?? 0) + 1);
  const gradeOf = (id: string) => {
    const g = grades.get(id);
    return g && g.team === team && g.snaps ? g : undefined;
  };

  // Everyone who played moves toward how he played; benching penalties fade.
  for (const a of squad.athletes) {
    const g = gradeOf(a.id);
    if (g) updateConfidence(entry(a.id), g);
  }
  for (const p of Object.values(prog)) {
    if (!p.bh) continue;
    p.bh = round3(p.bh * CONFIDENCE.benchFade);
    if (p.bh < 0.02) delete p.bh;
  }

  // Next man up: a spark for an earned job. A user's chart that benches an in-form starter for a
  // weaker one costs the starter; the staff never do that (their chart is by the book).
  const log = (state.confLog ??= []);
  const sparks: SparkEvent[] = [];
  for (const f of fresh) {
    if (!f.reason && !f.rest && ts.depth) {
      const pd = entry(f.replaced.id);
      pd.bh = round3((pd.bh ?? 0) + CONFIDENCE.benchHit);
      log.push({ week, team, id: f.replaced.id, pos: f.replaced.pos, kind: 'bench' });
    } else if (f.reason && f.spark) {
      log.push({ week, team, id: f.athlete.id, pos: f.athlete.pos, kind: 'spark', reason: f.reason, rep: f.replaced.id });
      const p = entry(f.athlete.id);
      p.sp = CONFIDENCE.spark;
      p.spn = CONFIDENCE.sparkStarts;
      p.spy = state.year;
      if (p.bo === undefined) p.sw = { t: 0, n: 0, z: 0 };
      sparks.push({ team, athlete: f.athlete, replaced: f.replaced, reason: f.reason });
    }
  }

  // Who started: the main slots, if they took a snap.
  const st = starters(squad);
  const now: [string, Athlete][] = START_SLOTS.filter((s) => st[s] && gradeOf(st[s].id)).map((s) => [s, st[s]]);
  const nowIds = new Set(now.map(([, a]) => a.id));
  for (const [, a] of now) {
    const p = entry(a.id);
    p.ls = gameNo;
    p.gs = (p.gs ?? 0) + 1;
  }

  // Sparks lock in or fade; breakout windows advance.
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const breakouts: BreakoutEvent[] = [];
  for (const [id, p] of Object.entries(prog)) {
    const started = nowIds.has(id);
    const g = gradeOf(id);
    const z = g ? perfZ(g) : 0;
    if (p.sp) {
      if (started) {
        const keep = z >= 0 ? p.sp * CONFIDENCE.sparkKeep : 0;
        p.c = round3(clamp((p.c ?? 0) + keep, -1, 1));
        p.sp = z >= 0 ? p.sp - keep : p.sp * CONFIDENCE.sparkFade;
        p.spn = (p.spn ?? 1) - 1;
      }
      if (!started || !p.spn) {
        delete p.sp;
        delete p.spn;
      } else {
        p.sp = round3(p.sp);
      }
    }
    if (p.sw) {
      p.sw.t++;
      if (started) {
        p.sw.n++;
        p.sw.z = round3(p.sw.z + z);
      }
      if (p.sw.t >= BREAKOUT.games) {
        const a = byId.get(id);
        const hot = p.sw.n >= BREAKOUT.minStarts && p.sw.z / p.sw.n >= BREAKOUT.z;
        delete p.sw;
        if (hot && a && p.bo === undefined) {
          breakouts.push({ team, ...breakOut(state, p, a, bases.get(id) ?? a, week, rng) });
          log.push({ week, team, id, pos: a.pos, kind: 'breakout' });
        }
      }
    }
  }

  ts.st = Object.fromEntries(START_SLOTS.filter((s) => st[s]).map((s) => [s, st[s].id]));
  return { sparks, breakouts };
}

/** Into a new season: confidence carries over at `offseason`; this season's starts, sparks, windows and penalties clear. */
export function carryConfidence(p: Progress): void {
  if (p.c) p.c = round3(p.c * CONFIDENCE.offseason);
  if (!p.c) delete p.c;
  delete p.bh;
  delete p.sp;
  delete p.spn;
  delete p.sw;
  delete p.ls;
  delete p.gs;
}
