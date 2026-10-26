import { templateValue, TEMPLATES, type Athlete, type ClassYear, type DevTrait } from '../data/athletes';
import { buildSquad, type Squad } from '../data/depth';
import { OVR_WEIGHTS, overallRaw, POSITIONS, type Position } from '../data/positions';
import { RATING_KEYS, type RatingKey, type Ratings } from '../data/ratings';
import { clamp, pickWeighted, type Rng } from '../engine/math';
import type { GameGrade } from './grades';
import type { Progress, RatingDelta, SeasonState, TeamState } from './types';

/**
 * Player progression: automatic, in season. Each game's grades (season/grades.ts) become XP, scaled by
 * a clamped multiplier; XP rolls into levels; each level-up spends a few attribute points, each drawn
 * by weight so players grow into what matters at their position and keep their identity. CPU teams run
 * the same code. See docs/PROGRESSION.md.
 */

/**
 * XP and level tuning.
 * - `gameXp`: XP for a full-time game at an even grade; `gradeXp` per point of average snap grade.
 * - `xpPerLevel`: XP per level-up.
 * - `multMin`/`multMax`: clamp on the stacked multiplier, so bonuses can't explode growth. Only
 *   `atPotential` goes under it.
 * - `points`: points per level-up at a typical position (scaled by `POS_POINTS`); a breakthrough
 *   (`breakOdds`) gives `breakPoints` instead.
 * - `profileScale`/`profileRange`: how much a rating above or below the position's norm for his overall
 *   tilts the draw toward it.
 * - `perfBoost`/`perfCap`: per tag weight, and the most a tagged rating's draw can grow (×(1 + cap)).
 * - `headroomSoft`: points under his ceiling at which a rating starts slowing; `ceilMargin`: how far
 *   past his potential's shape a rating may go.
 */
export const PROGRESSION = {
  gameXp: 100,
  gradeXp: 300,
  xpPerLevel: 175,
  multMin: 0.5,
  multMax: 2,
  /**
   * At his potential: the multiplier's factor there (`atPotential`), reached from 1 over his last point
   * of room, then halving for every point over (`overHalving`). Applied after the clamp, so a player at
   * or past his potential grows very slowly but never stops: an occasional level-up, rarely a breakthrough.
   */
  atPotential: 0.15,
  overHalving: 1,
  points: [1, 3] as [number, number],
  breakOdds: 0.04,
  breakPoints: [4, 6] as [number, number],
  profileScale: 8,
  profileRange: [0.5, 1.8] as [number, number],
  perfBoost: 0.1,
  perfCap: 1.5,
  headroomSoft: 4,
  ceilMargin: 2,
  /** XP multiplier per unit of confidence (season/confidence.ts): 0.9 shaken to 1.1 rolling. */
  confXp: 0.1,
};

/** XP multiplier by development trait. */
export const DEV_XP: Record<DevTrait, number> = { normal: 0.85, impact: 1, star: 1.2, elite: 1.45 };
/** XP multiplier by class: young players develop fastest. A redshirt year takes off `REDSHIRT_XP`. */
export const YEAR_XP: Record<ClassYear, number> = { FR: 1.2, SO: 1.1, JR: 1, SR: 0.9 };
const REDSHIRT_XP = 0.05;

/**
 * How readily each rating grows in season: speed almost never, strength and stamina slowly, skills
 * fully, and the mental ratings (reads, poise) fastest.
 */
export const GROWTH_RATE: Partial<Record<RatingKey, number>> = { spd: 0.04, acc: 0.12, str: 0.35, sta: 0.4, prc: 1.1, pac: 1.1 };
const growthRate = (k: RatingKey) => GROWTH_RATE[k] ?? 1;

/**
 * Points per level-up, by position, so a level-up is worth about the same overall everywhere. A
 * kicker's overall is two ratings, so each point moves it a lot; a QB's is spread over eleven. The
 * scale is the typical position's overall per point over this one's, from `OVR_WEIGHTS` and
 * `GROWTH_RATE`.
 */
export const POS_POINTS: Record<Position, number> = (() => {
  const per = (pos: Position) => {
    const ws = Object.entries(OVR_WEIGHTS[pos]) as [RatingKey, number][];
    const norm = ws.reduce((s, [k, w]) => s + w * (TEMPLATES[pos][k]?.[1] ?? 1), 0);
    const draw = ws.reduce((s, [k, w]) => s + w * growthRate(k), 0);
    return ws.reduce((s, [k, w]) => s + ((w * growthRate(k)) / draw) * (w / norm), 0);
  };
  const vals = POSITIONS.map(per);
  const median = [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  return Object.fromEntries(POSITIONS.map((p, i) => [p, median / vals[i]])) as Record<Position, number>;
})();

/** Points for a roll at a position: scaled, rounded at random so the average holds, never under `min`. */
function scaledPoints(roll: number, pos: Position, min: number, rng: Rng): number {
  const x = roll * POS_POINTS[pos];
  return Math.max(min, Math.floor(x) + (rng() < x - Math.floor(x) ? 1 : 0));
}

/**
 * XP per level-up at a position. A level-up is never worth less than one point, which is more than a
 * lineman's or kicker's scaled share, so those positions need this much more XP per level to stay
 * even. Everyone else levels at `xpPerLevel`.
 */
export const LEVEL_XP: Record<Position, number> = Object.fromEntries(POSITIONS.map((pos) => {
  const [lo, hi] = PROGRESSION.points;
  let got = 0;
  for (let r = lo; r <= hi; r++) got += Math.max(1, r * POS_POINTS[pos]);
  const want = ((lo + hi) / 2) * POS_POINTS[pos] * (hi - lo + 1);
  return [pos, Math.round(PROGRESSION.xpPerLevel * Math.max(1, got / want))];
})) as Record<Position, number>;

export function applyDelta(r: Ratings, d: RatingDelta): Ratings {
  const out = { ...r };
  for (const [k, v] of Object.entries(d) as [RatingKey, number][]) out[k] = Math.min(99, out[k] + v);
  return out;
}

/** His ceiling at a rating: his generated shape around the template, carried up to his potential. */
export function ceiling(base: Athlete, k: RatingKey): number {
  const ovr0 = overallRaw(base.r, base.pos);
  const lift = templateValue(base.pos, k, Math.max(base.potential, ovr0)) - templateValue(base.pos, k, ovr0);
  return Math.min(99, base.r[k] + lift + PROGRESSION.ceilMargin);
}

export interface Multiplier {
  headroom: number;
  dev: number;
  confidence: number;
  morale: number;
  year: number;
  /** 1 with a point or more of room; `atPotential` at his potential, and less past it. */
  potential: number;
  total: number;
}

/** The multiplier's factor at a player's potential, by room left (potential minus overall). */
export function potentialFactor(room: number): number {
  const at = PROGRESSION.atPotential;
  if (room >= 1) return 1;
  if (room >= 0) return at + (1 - at) * room;
  return at * 0.5 ** (-room / PROGRESSION.overHalving);
}

/**
 * The XP multiplier and its parts: room to his potential, dev trait, confidence (`confOf`),
 * morale (his team's record and whether he starts) and class. The product is clamped to
 * [`multMin`, `multMax`], then scaled by `potentialFactor`: a player at his potential grows very slowly.
 */
export function xpMultiplier(a: Athlete, p: Progress | undefined, winPct: number, starter: boolean): Multiplier {
  const room = a.potential - overallRaw(a.r, a.pos);
  const headroom = clamp(0.6 + room * 0.08, 0.6, 1.4);
  const dev = DEV_XP[a.dev];
  const confidence = 1 + PROGRESSION.confXp * clamp((p?.c ?? 0) + (p?.sp ?? 0), -1, 1);
  const morale = clamp(0.94 + 0.12 * winPct + (starter ? 0.02 : -0.02), 0.9, 1.1);
  const year = YEAR_XP[a.year] - (a.redshirt ? REDSHIRT_XP : 0);
  const potential = potentialFactor(room);
  const total = clamp(headroom * dev * confidence * morale * year, PROGRESSION.multMin, PROGRESSION.multMax) * potential;
  return { headroom, dev, confidence, morale, year, potential, total };
}

/** XP from one game before the multiplier: playing time, plus the average snap grade. */
export function gameXp(g: GameGrade): number {
  const avg = g.snaps ? g.sum / g.snaps : 0;
  return Math.max(0, g.share * (PROGRESSION.gameXp + PROGRESSION.gradeXp * avg));
}

/**
 * One rating point's draw weight: position weight × profile × performance × growth rate × headroom
 * × practice focus (always 1 until practice exists).
 */
export function pointWeight(r: Ratings, base: Athlete, k: RatingKey, tags: RatingDelta, ovr: number): number {
  const w = OVR_WEIGHTS[base.pos][k] ?? 0;
  if (!w) return 0;
  const [lo, hi] = PROGRESSION.profileRange;
  const profile = clamp(1 + (r[k] - templateValue(base.pos, k, ovr)) / PROGRESSION.profileScale, lo, hi);
  const perf = 1 + Math.min(PROGRESSION.perfCap, (tags[k] ?? 0) * PROGRESSION.perfBoost);
  const headroom = clamp((ceiling(base, k) - r[k]) / PROGRESSION.headroomSoft, 0, 1);
  const focus = 1;
  return w * profile * perf * growthRate(k) * headroom * focus;
}

/**
 * One level-up: a few points (or a breakthrough's more), each drawn by `pointWeight` and re-weighted
 * after it lands. `r` is his current ratings and is raised in place; returns what changed. With every
 * rating at its ceiling nothing lands, and it's no breakthrough. `force` makes it a breakthrough (a breakout's).
 */
export function levelUp(r: Ratings, base: Athlete, tags: RatingDelta, rng: Rng, force = false): { d: RatingDelta; big: boolean } {
  const big = force || rng() < PROGRESSION.breakOdds;
  const [lo, hi] = big ? PROGRESSION.breakPoints : PROGRESSION.points;
  const roll = lo + Math.floor(rng() * (hi - lo + 1));
  const n = scaledPoints(roll, base.pos, big ? 2 : 1, rng);
  const d: RatingDelta = {};
  const keys = RATING_KEYS.filter((k) => OVR_WEIGHTS[base.pos][k]);
  for (let i = 0; i < n; i++) {
    const ovr = overallRaw(r, base.pos);
    const ws = keys.map((k) => [k, pointWeight(r, base, k, tags, ovr)] as [RatingKey, number]).filter(([, w]) => w > 0);
    if (!ws.length) break;
    const k = pickWeighted(ws, rng);
    r[k]++;
    d[k] = (d[k] ?? 0) + 1;
  }
  return { d, big: big && Object.keys(d).length > 0 };
}

export interface LevelUpEvent {
  team: string;
  athlete: Athlete;
  d: RatingDelta;
  big: boolean;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Apply one game to a team: XP from each player's grade, then any level-ups. `squad` is the team as it
 * took the field (progress applied); the generated roster gives each player's ceilings.
 */
export function progressTeam(ts: TeamState, squad: Squad, grades: Map<string, GameGrade>, week: number, winPct: number, rng: Rng): LevelUpEvent[] {
  const base = new Map(buildSquad(squad.team).athletes.map((a) => [a.id, a]));
  const prog = (ts.progress ??= {});
  const events: LevelUpEvent[] = [];
  for (const a of squad.athletes) {
    const g = grades.get(a.id);
    if (!g || g.team !== squad.team.id || !g.snaps) continue;
    const p = (prog[a.id] ??= { xp: 0, lvl: 0, d: {} });
    const mult = xpMultiplier(a, p, winPct, g.share >= 0.5).total;
    p.xp += Math.round(gameXp(g) * mult);
    const tags = (p.tags ??= {});
    for (const [k, v] of Object.entries(g.tags) as [RatingKey, number][]) tags[k] = round1((tags[k] ?? 0) + v);
    const r = { ...a.r };
    // A breakout raised his potential, and his ceilings with it.
    const b = base.get(a.id) ?? a;
    const ceil = p.pot ? { ...b, potential: b.potential + p.pot } : b;
    while (p.xp >= LEVEL_XP[a.pos]) {
      p.xp -= LEVEL_XP[a.pos];
      const up = levelUp(r, ceil, p.tags ?? {}, rng);
      // Every rating at its ceiling: the XP is spent, but nothing grew, so it isn't a level.
      if (!Object.keys(up.d).length) continue;
      p.lvl++;
      delete p.tags;
      if (p.up?.week !== week) p.up = { week, d: {} };
      for (const [k, v] of Object.entries(up.d) as [RatingKey, number][]) {
        p.d[k] = (p.d[k] ?? 0) + v;
        p.up.d[k] = (p.up.d[k] ?? 0) + v;
      }
      if (up.big) p.up.big = true;
      events.push({ athlete: a, team: squad.team.id, d: up.d, big: up.big });
    }
  }
  return events;
}

/** The last week that's been played: the week before the current one, or the last one once the season is over. */
export function lastPlayedWeek(state: SeasonState): number {
  return state.phase === 'complete' ? state.week : state.week - 1;
}

/** A player's progress this season, if any. */
export function progressOf(state: SeasonState, teamId: string, athleteId: string): Progress | undefined {
  return state.teamState[teamId]?.progress?.[athleteId];
}

/** Did this rating go up in the last week played? */
export function upgradedLastWeek(state: SeasonState, p: Progress | undefined, k?: RatingKey): boolean {
  if (!p?.up || p.up.week !== lastPlayedWeek(state)) return false;
  return k ? (p.up.d[k] ?? 0) > 0 : Object.keys(p.up.d).length > 0;
}

/** All-time change at a rating. */
export function ratingChange(p: Progress | undefined, k: RatingKey): number {
  return p?.d[k] ?? 0;
}

/** "+2 SAC +1 PAC", biggest first. */
export function deltaText(d: RatingDelta): string {
  return (Object.entries(d) as [RatingKey, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `+${v} ${k.toUpperCase()}`)
    .join(' ');
}
