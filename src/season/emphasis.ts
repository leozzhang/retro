import { GROUPS, type Group, type Staff } from '../data/coaches';
import { TEAM_WEIGHTS } from '../data/depth';
import { emphasisById, GROUP_POS, GROUP_SLOTS, type EffectKind, type EffectWhen, type EmphasisEffect } from '../data/emphasis';
import { OVR_WEIGHTS, type Position } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import { clamp } from '../engine/math';

/**
 * Weekly emphases in play (docs/COACHES.md). A position coach's pick does two things:
 * - **Practice:** his players' level-ups lean toward the emphasis's ratings, through the same
 *   performance tags games add (`practiceTags`, read by `pointWeight` in season/progression.ts).
 * - **Game day, simulated play only:** a small edge in the emphasis's situation, in `simulateDrive`
 *   (the user's sim games, and the user's defense in live games, which is always simulated).
 * The default, `standard`, does neither. CPU staffs stay on it for now.
 */

/** This week's picks by group. A missing group is on `standard`. */
export type Picks = Partial<Record<Group, string>>;

/**
 * Emphasis tuning, fit so an emphasis is worth about +0.2 to +0.9 points a game at an average game-day
 * coach (the COACHES section of `npm run season`; docs/COACHES.md).
 * - `edge`: rating points on a matching snap's gain, for a group that is the whole unit. Each group
 *   counts by `GROUP_WEIGHT`: its share of `TEAM_WEIGHTS` to the `shareExp` power, so big rooms matter
 *   more without the DBs (48% of the defense) drowning out a tight end (6% of the offense).
 * - `explosive`: change in the big-play odds (×), and `turnover` in the takeaway odds, at a whole unit.
 * - `fg`: the kicker's edge in `fgOdds` rating points (the kicker is his whole unit).
 * - `when`: per-snap scale by situation, so an emphasis for rare snaps (short yardage, the red zone)
 *   is worth about as much over a game as one for every snap.
 * - `passDown`: how much more often a passing down is a pass than the game plan's share, and how much
 *   less often 2 or less to go is.
 * - `tag`: practice tags per focused rating for a full-time week (×`coachFactor` of his teaching); each
 *   tag adds `perfBoost` (0.1) to that rating's level-up draw, so a week at teach 50 is about ×1.7.
 */
export const EMPHASIS = {
  edge: 0.85,
  explosive: 0.1,
  turnover: 0.15,
  fg: 10,
  shareExp: 0.5,
  when: { all: 1, passDown: 2, shortYd: 4, redZone: 3, redOrPassDown: 1.5, longFg: 1, shortFg: 1 } as Record<EffectWhen, number>,
  passDown: 0.25,
  tag: 7,
};

/** How much a coach's rating scales his emphasis: 0.8 at 30, 1 at 50, 1.45 at 95. */
export const coachFactor = (rating: number | undefined): number => 0.5 + (rating ?? 50) / 100;

const KIND_BASE: Record<EffectKind, () => number> = {
  edge: () => EMPHASIS.edge, explosive: () => EMPHASIS.explosive, turnover: () => EMPHASIS.turnover, fg: () => EMPHASIS.fg,
};

/** How much a group's emphasis moves its unit: its share of the unit's team weight, compressed by `shareExp`. The kicker is all of his. */
export const GROUP_WEIGHT: Record<Group, number> = Object.fromEntries(GROUPS.map((g) => {
  const { unit, slots } = GROUP_SLOTS[g];
  if (unit === 'st') return [g, 1];
  const w = TEAM_WEIGHTS[unit];
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  return [g, (slots.reduce((s, sl) => s + (w[sl] ?? 0), 0) / tot) ** EMPHASIS.shareExp];
})) as Record<Group, number>;

const POS_GROUP = new Map<Position, Group>(GROUPS.flatMap((g) => GROUP_POS[g].map((p) => [p, g] as [Position, Group])));
export const groupOf = (pos: Position): Group => POS_GROUP.get(pos)!;

/** One emphasis's effect, sized for this staff. */
export interface Effect extends EmphasisEffect {
  size: number;
}

/** A team's emphases: what its offense (and kicker) and its defense bring. */
export interface TeamMods {
  off: Effect[];
  def: Effect[];
}

/** One drive's emphases: the offense's, the defense's, and the offense's pass share. */
export interface DriveMods {
  off: Effect[];
  def: Effect[];
  passShare: number;
}

/** A team's emphases this week, or undefined when every group is on `standard`. */
export function emphasisMods(staff: Staff, picks: Picks | undefined): TeamMods | undefined {
  if (!picks) return undefined;
  const out: TeamMods = { off: [], def: [] };
  for (const g of GROUPS) {
    const fx = emphasisById(picks[g])?.effect;
    if (!fx) continue;
    const size = KIND_BASE[fx.kind]() * EMPHASIS.when[fx.when] * GROUP_WEIGHT[g] * coachFactor(staff[g].r.game);
    (GROUP_SLOTS[g].unit === 'def' ? out.def : out.off).push({ ...fx, size });
  }
  return out.off.length || out.def.length ? out : undefined;
}

/** The mods for one drive, or undefined when neither side brings any. */
export function driveMods(off: TeamMods | undefined, def: TeamMods | undefined, passShare: number): DriveMods | undefined {
  if (!off?.off.length && !def?.def.length) return undefined;
  return { off: off?.off ?? [], def: def?.def ?? [], passShare };
}

export const passingDown = (down: number, toGo: number) => (down >= 3 && toGo >= 5) || (down === 2 && toGo >= 8);

/** How likely a snap is a pass: the plan's share, more on passing downs, less at 2 or less to go. */
export function passOdds(share: number, down: number, toGo: number): number {
  const shift = passingDown(down, toGo) ? EMPHASIS.passDown : toGo <= 2 ? -EMPHASIS.passDown : 0;
  return clamp(share + shift, 0.1, 0.9);
}

function applies(w: EffectWhen, down: number, toGo: number, yard: number): boolean {
  switch (w) {
    case 'all':
      return true;
    case 'passDown':
      return passingDown(down, toGo);
    case 'shortYd':
      return toGo <= 2;
    case 'redZone':
      return yard >= 80;
    case 'redOrPassDown':
      return yard >= 80 || passingDown(down, toGo);
    default:
      return false;
  }
}

/** An effect's weight on a snap: 0 outside its situation, scaled by how likely the snap is its phase. */
function weight(fx: Effect, down: number, toGo: number, yard: number, p: number): number {
  if (!applies(fx.when, down, toGo, yard)) return 0;
  const phase = fx.phase === 'pass' ? p / 0.5 : fx.phase === 'run' ? (1 - p) / 0.5 : 1;
  return phase * (fx.double && applies(fx.double, down, toGo, yard) ? 2 : 1);
}

function sum(fxs: Effect[], kind: EffectKind, down: number, toGo: number, yard: number, p: number): number {
  let s = 0;
  for (const fx of fxs) if (fx.kind === kind) s += fx.size * weight(fx, down, toGo, yard, p);
  return s;
}

/**
 * One snap's emphasis edge in rating points (offense minus defense). `yard` is the offense's yards
 * from its own goal. The drive sim adds it to the gain; the grades add it to the expected success.
 */
export function snapEdge(m: DriveMods, down: number, toGo: number, yard: number): number {
  const p = passOdds(m.passShare, down, toGo);
  return sum(m.off, 'edge', down, toGo, yard, p) - sum(m.def, 'edge', down, toGo, yard, p);
}

/** The big-play odds multiplier on a snap. */
export function explosiveFactor(m: DriveMods, down: number, toGo: number, yard: number): number {
  const p = passOdds(m.passShare, down, toGo);
  return Math.max(0, 1 + sum(m.off, 'explosive', down, toGo, yard, p) - sum(m.def, 'explosive', down, toGo, yard, p));
}

/** The takeaway odds multiplier on a snap (only the defense has one). */
export function turnoverFactor(m: DriveMods, down: number, toGo: number, yard: number): number {
  return 1 + sum(m.def, 'turnover', down, toGo, yard, passOdds(m.passShare, down, toGo));
}

/** The kicker's edge on a field goal of `dist` yards, in `fgOdds` rating points. */
export function kickEdge(m: DriveMods, dist: number): number {
  let s = 0;
  for (const fx of m.off) if (fx.kind === 'fg' && (fx.when === 'longFg' ? dist >= 45 : dist < 45)) s += fx.size;
  return s;
}

/**
 * Practice tags for one player this week: each of the emphasis's ratings that counts at his position
 * gets `tag × playing share × coachFactor(teach)`. Empty on `standard`.
 */
export function practiceTags(pos: Position, share: number, staff: Staff, picks: Picks | undefined): [RatingKey, number][] {
  const g = groupOf(pos);
  const em = emphasisById(picks?.[g]);
  if (!em || share <= 0) return [];
  const t = EMPHASIS.tag * share * coachFactor(staff[g].r.teach);
  return em.ratings.filter((k) => OVR_WEIGHTS[pos][k]).map((k) => [k, t]);
}
