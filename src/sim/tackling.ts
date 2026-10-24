import { clamp } from '../engine/math';

export const TACKLE_RANGE = 0.9;

/**
 * Chance a tackle attempt brings the carrier down.
 * `juking` = carrier is mid-juke, which makes the first defender likely to whiff.
 */
export function tackleChance(tkl: number, carrierElu: number, carrierStr: number, juking: boolean): number {
  let p = 0.8 + (tkl - (carrierElu * 0.6 + carrierStr * 0.4)) * 0.012;
  if (juking) p -= 0.35;
  return clamp(p, 0.15, 0.97);
}
