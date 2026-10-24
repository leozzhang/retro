import { clamp, len, scale, sub, type Vec } from '../engine/math';
import type { Camera } from '../engine/camera';
import { FIELD_W } from '../engine/constants';

/** Screen-space multiplier: the target lands this many times the pull-back distance in front of the QB. */
export const AIM_GAIN = 2.6;
export const MIN_DRAG_PX = 6;

export interface Aim {
  start: Vec;
  cur: Vec;
}

export function maxThrowDist(arm: number): number {
  return 42 + arm * 0.28;
}

/**
 * Slingshot aiming: drag back from where you pressed; the target is projected the
 * opposite way from the QB, in screen space, so you aim at what you see.
 */
export function aimTarget(aim: Aim, qbPos: Vec, cam: Camera, arm: number): Vec {
  const qbScreen = cam.toScreen(qbPos.x, qbPos.y);
  const pull = sub(aim.start, aim.cur);
  const tgtScreen = { x: qbScreen.x + pull.x * AIM_GAIN, y: qbScreen.y + pull.y * AIM_GAIN };
  const w = cam.toWorld(tgtScreen.x, tgtScreen.y);
  let off = sub(w, qbPos);
  const max = maxThrowDist(arm);
  const l = len(off);
  if (l > max) off = scale(off, max / l);
  return { x: qbPos.x + off.x, y: clamp(qbPos.y + off.y, -4, FIELD_W + 4) };
}

/** Standard deviation (yards) of throw error. */
export function throwErrorSd(dist: number, thr: number, pressure: number, moving: number): number {
  return (0.25 + dist * 0.022) * (1.6 - thr / 100) * (1 + pressure * 1.2 + moving * 0.6);
}
