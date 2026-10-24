import { clamp, type Rng } from '../engine/math';

/** A player contesting the ball. `pos` is 0..1: 1 = exactly under the ball, 0 = at the edge of reach. */
export interface Contender {
  pos: number;
  cth: number;
  awr?: number;
}

export type CatchResult = 'catch' | 'int' | 'drop' | 'pbu' | 'miss';

export const CATCH_REACH = 1.7;

/** Probability of a catch by the offense and of an interception, given the best contender on each side. */
export function catchOdds(o: Contender | null, d: Contender | null): { catch: number; int: number } {
  const oPos = o ? Math.pow(clamp(o.pos, 0, 1), 0.6) : 0;
  const dPos = d ? Math.pow(clamp(d.pos, 0, 1), 0.6) : 0;
  const open = o ? clamp(0.2 + 0.8 * oPos * (0.75 + (0.25 * o.cth) / 100), 0, 0.98) : 0;
  if (!d) return { catch: open, int: 0 };

  const dHands = d.cth * 0.6 + (d.awr ?? d.cth) * 0.4;
  const intBase = clamp(0.08 + 0.5 * dPos * (dHands / 100), 0, 0.7);
  if (!o) return { catch: 0, int: intBase };

  const oSkill = oPos * (0.75 + (0.25 * o.cth) / 100);
  const dSkill = dPos * (0.6 + (0.4 * dHands) / 100);
  const share = oSkill / (oSkill + dSkill * 0.9 + 1e-6);
  const pc = open * share;
  return { catch: pc, int: (1 - pc) * intBase * 0.4 };
}

export function resolveCatch(o: Contender | null, d: Contender | null, rng: Rng): CatchResult {
  if (!o && !d) return 'miss';
  const odds = catchOdds(o, d);
  const r = rng();
  if (r < odds.catch) return 'catch';
  if (r < odds.catch + odds.int) return 'int';
  return d ? 'pbu' : 'drop';
}

/** 0..1 closeness score for a player `distance` yards from the ball's arrival point. */
export function reachScore(distance: number): number {
  return Math.max(0, 1 - distance / CATCH_REACH);
}

/** Chance a handoff is cleanly exchanged; the rest are fumbles. */
export const HANDOFF_ODDS = 0.99;

/** Chance the back hauls in a pitch, given how well he got under it (`pos` as in `Contender`). */
export function pitchOdds(pos: number, cth: number): number {
  if (pos <= 0) return 0;
  return clamp(0.93 + 0.06 * Math.sqrt(pos) + (cth - 70) * 0.001, 0, 0.99);
}
