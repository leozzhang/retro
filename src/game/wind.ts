import { clamp, gauss, type Rng } from '../engine/math';
import type { Wind } from '../sim/kicking';

/** Per-game wind: 0-15 mph from a random direction. */
export function newWind(rng: Rng): Wind {
  const mph = Math.round(clamp(Math.abs(gauss(rng)) * 6, 0, 15));
  const a = rng() * Math.PI * 2;
  return { mph, dir: { x: Math.cos(a), y: Math.sin(a) } };
}

/**
 * Teams switch ends each quarter, but the user always attacks +x on screen, so
 * the wind flips along the field. It also drifts a little.
 */
export function nextQuarterWind(w: Wind, rng: Rng): Wind {
  const a = Math.atan2(w.dir.y, -w.dir.x) + gauss(rng) * 0.25;
  const mph = Math.round(clamp(w.mph + gauss(rng) * 2, 0, 18));
  return { mph, dir: { x: Math.cos(a), y: Math.sin(a) } };
}

/** HUD label: "8 MPH" plus whether it helps or hurts the user's kicks. */
export function windLabel(w: Wind): string {
  if (w.mph < 1) return 'CALM';
  const along = w.dir.x;
  const kind = along > 0.5 ? 'TAIL' : along < -0.5 ? 'HEAD' : 'CROSS';
  return `${w.mph} MPH ${kind}`;
}
