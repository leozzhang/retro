import { clamp, len, scale, sub, type Vec } from '../engine/math';
import type { Camera } from '../engine/camera';
import { FIELD_W } from '../engine/constants';
import type { Ratings } from '../data/ratings';
import { THROWS, type ThrowKind } from './ball';

/** Screen-space multiplier: the target lands this many times the pull-back distance in front of the QB. */
export const AIM_GAIN = 2.6;
/** A QB moving this fast (yd/s) is fully on the move for throw error and aim lag: the jog he aims at (about 3.4). */
export const MOVE_FULL = 3.4;
export const MIN_DRAG_PX = 6;

export interface Aim {
  start: Vec;
  /** The aim's pull point: trails the mouse by the QB's aim feel (AIM_FEEL). */
  cur: Vec;
  /** The raw mouse, which `cur` chases. */
  mouse?: Vec;
}

export function maxThrowDist(arm: number, kind: ThrowKind = 'touch'): number {
  return (42 + arm * 0.28) * THROWS[kind].range;
}

/**
 * Slingshot aiming: drag back from where you pressed; the target is projected the
 * opposite way from the QB, in screen space, so you aim at what you see.
 */
export function aimTarget(aim: Aim, qbPos: Vec, cam: Camera, arm: number, kind: ThrowKind = 'touch'): Vec {
  const qbScreen = cam.toScreen(qbPos.x, qbPos.y);
  const pull = sub(aim.start, aim.cur);
  const tgtScreen = { x: qbScreen.x + pull.x * AIM_GAIN, y: qbScreen.y + pull.y * AIM_GAIN };
  const w = cam.toWorld(tgtScreen.x, tgtScreen.y);
  let off = sub(w, qbPos);
  const max = maxThrowDist(arm, kind);
  const l = len(off);
  if (l > max) off = scale(off, max / l);
  return { x: qbPos.x + off.x, y: clamp(qbPos.y + off.y, -4, FIELD_W + 4) };
}

export type PasserRatings = Pick<Ratings, 'sac' | 'mac' | 'dac' | 'tup' | 'pac'>;

/** Accuracy blends short -> medium over 8-14 yd and medium -> deep over 20-28 yd. */
export const ACC_BANDS = { shortEnd: 8, medStart: 14, medEnd: 20, deepStart: 28 };

/** The QB's accuracy rating for a throw of `dist` yards. */
export function accuracyAt(dist: number, r: PasserRatings): number {
  const b = ACC_BANDS;
  if (dist <= b.shortEnd) return r.sac;
  if (dist < b.medStart) return r.sac + ((r.mac - r.sac) * (dist - b.shortEnd)) / (b.medStart - b.shortEnd);
  if (dist <= b.medEnd) return r.mac;
  if (dist < b.deepStart) return r.mac + ((r.dac - r.mac) * (dist - b.medEnd)) / (b.deepStart - b.medEnd);
  return r.dac;
}

/** Scales the pressure (`pac`) and on-the-run (`tup`) penalties: 1 at 80, 1.5 at 55, 0.7 at 95. */
export function composure(rating: number): number {
  return Math.max(0.4, 1 + (80 - rating) / 50);
}

/** The throw type's error multiplier at `dist` yards: `errShort` to 8 yd, blending to `errDeep` at 28. */
export function kindError(kind: ThrowKind, dist: number): number {
  const k = THROWS[kind];
  const t = Math.min(1, Math.max(0, (dist - 8) / 20));
  return k.errShort + (k.errDeep - k.errShort) * t;
}

/** Standard deviation (yards) of throw error. */
export function throwErrorSd(dist: number, r: PasserRatings, pressure: number, moving: number, kind: ThrowKind = 'touch'): number {
  return (
    kindError(kind, dist) *
    (0.25 + dist * 0.022) *
    (1.6 - accuracyAt(dist, r) / 100) *
    (1 + pressure * 1.2 * composure(r.pac) * THROWS[kind].pressure + moving * 0.6 * composure(r.tup))
  );
}

/**
 * Aim feel: a worse passer's pull-back line trails the mouse. The lag `tau` (s) is three costs added up,
 * each from its own rating, so QB types feel different: a pocket passer is crisp set in the pocket and
 * heavy rolling out; a scrambler is a bit heavy everywhere but keeps it on the move.
 * - set: `(accTop - A) * accPer`, `A` the short/medium/deep accuracy average
 * - pressure (0-1): `(pacTop - pac) * pacPer`
 * - moving (0-1, his speed over `MOVE_FULL`): `(tupTop - tup) * tupPer`
 * - plus `nerves` (a shaken QB on a big snap, data/confidence.ts), worse under pressure.
 * `vmax` caps how fast the line can move, in view px per second. The ball goes where the line is.
 */
export const AIM_FEEL = {
  on: true,
  accTop: 95, accPer: 0.0036,
  pacTop: 92, pacPer: 0.0045,
  tupTop: 92, tupPer: 0.0055,
  vBase: 600, vPer: 40,
};

/** `moving`: 0-1 (`Play.passContext`); `nerves`: extra seconds from a shaken QB on a big snap (`shakenAimLag`). */
export function aimLag(r: PasserRatings, pressure: number, moving: number, nerves = 0): { tau: number; vmax: number } {
  const f = AIM_FEEL;
  if (!f.on) return { tau: 0, vmax: Infinity };
  const a = (r.sac + r.mac + r.dac) / 3;
  const tau =
    Math.max(0, f.accTop - a) * f.accPer +
    pressure * Math.max(0, f.pacTop - r.pac) * f.pacPer +
    moving * Math.max(0, f.tupTop - r.tup) * f.tupPer +
    nerves * (1 + pressure);
  return { tau, vmax: Math.max(200, f.vBase + (a - 50) * f.vPer) };
}
/** One real-time step of the lagged aim point toward the mouse. */
export function stepAimCursor(cur: Vec, mouse: Vec, tau: number, vmax: number, step: number): Vec {
  if (tau <= 0 && vmax === Infinity) return { x: mouse.x, y: mouse.y };
  const k = tau > 0 ? 1 - Math.exp(-step / tau) : 1;
  let d = scale(sub(mouse, cur), k);
  const l = len(d);
  const cap = vmax * step;
  if (l > cap) d = scale(d, cap / l);
  return { x: cur.x + d.x, y: cur.y + d.y };
}
