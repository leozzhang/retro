import { clamp } from '../engine/math';

export const TACKLE_RANGE = 0.9;

/** Chance a tackle attempt brings the carrier down. */
export function tackleChance(tkl: number, carrierElu: number, carrierStr: number): number {
  const p = 0.8 + (tkl - (carrierElu * 0.6 + carrierStr * 0.4)) * 0.012;
  return clamp(p, 0.15, 0.97);
}

/** Yards a tackled ball carrier falls forward per yd/s of forward speed (plus a strength edge). */
export const FALL_FORWARD = 0.2;

/** How far past the contact point a tackled carrier going forward ends up. Never backward, at most 2.2. */
export function fallForward(velX: number, carrierStr: number, tacklerStr: number): number {
  if (velX <= 0) return 0;
  return clamp(velX * FALL_FORWARD + (carrierStr - tacklerStr) * 0.02, 0, 2.2);
}
