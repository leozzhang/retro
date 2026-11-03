import { clamp } from '../engine/math';

export const TACKLE_RANGE = 0.9;

/** Chance a tackle attempt brings the carrier down. */
export function tackleChance(tkl: number, carrierElu: number, carrierStr: number): number {
  const p = 0.8 + (tkl - (carrierElu * 0.6 + carrierStr * 0.4)) * 0.012;
  return clamp(p, 0.15, 0.97);
}

/**
 * A tackler who closes during the carrier's juke (sim/player.ts `JUKE`) and isn't coming from behind:
 * his odds are cut by up to `JUKE_WHIFF`, more by a more elusive carrier.
 */
export const JUKE_WHIFF = 0.55;

export function jukeTackleMul(carrierElu: number): number {
  return 1 - JUKE_WHIFF * clamp(0.3 + (0.7 * carrierElu) / 100, 0, 1);
}

/**
 * Open-field tackles in the kick return game. The skill gap is squeezed through a tanh, so an elite
 * returner gets a small edge, not a linear one: cover units are mostly offensive starters with
 * low tackle ratings, and the linear curve let elite returners shed them nearly every time.
 * Each tackle he's already broken on the return adds `BROKEN_TOLL` (balance and speed lost,
 * pursuit converging), so a long chain of misses stays rare.
 */
export const RETURN_TACKLE_BASE = 0.84;
export const RETURN_GAP_SCALE = 0.25;
export const RETURN_GAP_SOFT = 25;
export const BROKEN_TOLL = 0.12;

export function returnTackleChance(tkl: number, carrierElu: number, carrierStr: number, broken: number): number {
  const gap = tkl - (carrierElu * 0.6 + carrierStr * 0.4);
  const p = RETURN_TACKLE_BASE + RETURN_GAP_SCALE * Math.tanh(gap / RETURN_GAP_SOFT) + BROKEN_TOLL * broken;
  return clamp(p, 0.3, 0.97);
}

/** Yards a tackled ball carrier falls forward per yd/s of forward speed (plus a strength edge). */
export const FALL_FORWARD = 0.2;

/** How far past the contact point a tackled carrier going forward ends up. Never backward, at most 2.2. */
export function fallForward(velX: number, carrierStr: number, tacklerStr: number): number {
  if (velX <= 0) return 0;
  return clamp(velX * FALL_FORWARD + (carrierStr - tacklerStr) * 0.02, 0, 2.2);
}
