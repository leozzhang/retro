import { clamp } from '../engine/math';

export const TACKLE_RANGE = 0.9;

/**
 * Scrimmage tackles: 80% at even, 1.2 points per rating point near even (`scale / soft`), squeezed
 * through a tanh so a big skill gap saturates: an elite back against a weak defense still breaks
 * about a third of tackles, not 60% (the old linear curve), which made 25+ YPC runs against weak teams.
 */
export const TACKLE_GAP = { base: 0.8, scale: 0.18, soft: 15 };

/** Chance a tackle attempt brings the carrier down. */
export function tackleChance(tkl: number, carrierElu: number, carrierStr: number): number {
  const gap = tkl - (carrierElu * 0.6 + carrierStr * 0.4);
  const p = TACKLE_GAP.base + TACKLE_GAP.scale * Math.tanh(gap / TACKLE_GAP.soft);
  return clamp(p, 0.15, 0.97);
}

/**
 * Contact on a designed run (docs/RUNGAME.md "Contact"). A missed tackle is mostly not a clean escape: the
 * tackler gets a piece of him and hangs on. With odds `breakChance` the carrier breaks it clean (the old
 * broken tackle); otherwise he's wrapped for `time` s, dragging the tackler forward at `drag` yd/s (more for
 * a strong back, `dragStr`), and any other defender who gets to him finishes it (`finish`). If nobody comes,
 * the tackler brings him down at the end with odds `hold`, else he spins out at `out` of his speed.
 * - `breakBase` at even, `breakPerPt` a point of the carrier's edge (elusiveness and strength against the
 *   tackle rating), within `breakMin`–`breakMax`.
 */
export const CONTACT = { breakBase: 0.06, breakPerPt: 0.004, breakMin: 0.03, breakMax: 0.45, time: 0.5, drag: 1.0, dragStr: 1.0, finish: 0.92, hold: 0.85, out: 0.5 };

/** A carrier who beat the tackle roll breaks it clean with these odds; otherwise he's wrapped (`CONTACT`). */
export function breakChance(tkl: number, carrierElu: number, carrierStr: number): number {
  const edge = carrierElu * 0.6 + carrierStr * 0.4 - tkl;
  return clamp(CONTACT.breakBase + CONTACT.breakPerPt * edge, CONTACT.breakMin, CONTACT.breakMax);
}

/** How fast a wrapped carrier drags his tackler forward (yd/s), by his strength against the tackler's. */
export function dragSpeed(carrierStr: number, tacklerStr: number): number {
  return Math.max(0.3, CONTACT.drag + CONTACT.dragStr * (carrierStr - tacklerStr) / 50 + 0.4 * (carrierStr / 100));
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
