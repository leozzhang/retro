import { clamp, lerp, type Vec3 } from '../engine/math';
import type { Player } from './player';

export type BallState = 'held' | 'snap' | 'air' | 'bounce' | 'kick' | 'dead';

export interface Ball {
  state: BallState;
  carrier: Player | null;
  pos: Vec3;
  from: Vec3;
  to: Vec3;
  t: number;
  dur: number;
  peak: number;
  vel: Vec3;
  /** A ball spun on the turf after a score (`sim/celebrate.ts`): quarter turns so far; drawn flat, twirling. */
  spin?: number;
}

export function makeBall(x: number, y: number): Ball {
  const p = { x, y, z: 0.3 };
  return { state: 'dead', carrier: null, pos: { ...p }, from: { ...p }, to: { ...p }, t: 0, dur: 1, peak: 0, vel: { x: 0, y: 0, z: 0 } };
}

/** Parabolic flight between two points with an extra `peak` of height at the midpoint. */
export function flightPos(from: Vec3, to: Vec3, peak: number, s: number): Vec3 {
  return {
    x: lerp(from.x, to.x, s),
    y: lerp(from.y, to.y, s),
    z: lerp(from.z, to.z, s) + 4 * peak * s * (1 - s),
  };
}

/**
 * Throw types (docs/PASSING.md). TOUCH is the old single arc. BULLET is a line drive: faster off the
 * hand (`speed`, on the arm's ball speed; `release` seconds instead of 0.18), a flat `peak`, `range` of
 * the arm's max distance, and error × `errShort` out to 8 yd blending to `errDeep` at 28, its pressure
 * part × `pressure` (a bullet needs his feet set and a step into it). `reach` scales
 * the catch radius (sim/catching.ts `CATCH_REACH`) for everyone: there's no adjusting to a rope, and all
 * the time in the world under a floater. On short
 * throws it's `hot`, and deep it's a rope over his shoulder (`hotness`, sim/catching.ts `READY.hot`); and
 * he has to `gather` it before he runs (sim/player.ts `GATHER`). LOB floats it high and slow over the
 * underneath defenders and comes down as a `jump` ball (sim/catching.ts `JUMP`).
 */
export type ThrowKind = 'bullet' | 'touch' | 'lob';
export const THROW_KINDS: ThrowKind[] = ['bullet', 'touch', 'lob'];
export const THROWS: Record<ThrowKind, { speed: number; release: number; peak: number; range: number; errShort: number; errDeep: number; pressure: number; reach: number; jump: number; gather: number }> = {
  bullet: { speed: 1.4, release: 0.12, peak: 0.3, range: 0.42, errShort: 1.25, errDeep: 1.6, pressure: 1.5, reach: 0.8, jump: 0, gather: 1 },
  touch: { speed: 1, release: 0.18, peak: 1, range: 1, errShort: 1, errDeep: 1, pressure: 1, reach: 1, jump: 0, gather: 0 },
  lob: { speed: 0.78, release: 0.22, peak: 1.6, range: 1, errShort: 1.3, errDeep: 1.05, pressure: 1.2, reach: 1.15, jump: 1, gather: 0 },
};
export const HOT = { to: 18, armFrom: 60, armBase: 0.4, deepFrom: 20, deepSpan: 15, deep: 0.8 };

/**
 * 0..1: how hard a bullet of `dist` yards from this arm is to catch (0 for touch and lob). Short, it's
 * hot (out to `HOT.to` yd, more with a big arm). Deep (from `deepFrom`, full `deep` over `deepSpan` more),
 * it's a rope coming over his shoulder instead of dropping in.
 */
export function hotness(kind: ThrowKind, dist: number, arm: number): number {
  if (kind !== 'bullet') return 0;
  const armHeat = HOT.armBase + (1 - HOT.armBase) * clamp((arm - HOT.armFrom) / (100 - HOT.armFrom), 0, 1);
  const short = clamp(1 - dist / HOT.to, 0, 1) * armHeat;
  const deep = clamp((dist - HOT.deepFrom) / HOT.deepSpan, 0, 1) * HOT.deep;
  return Math.min(1, short + deep);
}

/**
 * A bullet's extra speed over touch (`THROWS.bullet.speed`, minus 1) is all there from a 90 arm, and
 * fades to `ROPE.floor` of it at 60: only a big arm really throws a rope.
 */
export const ROPE = { full: 90, from: 60, floor: 0.4 };

/** The throw type's speed multiplier for this arm. */
export function kindSpeed(kind: ThrowKind, arm: number): number {
  const k = THROWS[kind].speed;
  if (kind !== 'bullet') return k;
  const t = clamp((arm - ROPE.from) / (ROPE.full - ROPE.from), 0, 1);
  return 1 + (k - 1) * (ROPE.floor + (1 - ROPE.floor) * t);
}

/** Air time and arc height for a pass of `dist` yards by a QB with the given arm rating. */
export function passParams(dist: number, arm: number, kind: ThrowKind = 'touch'): { dur: number; peak: number } {
  const k = THROWS[kind];
  const speed = (17 + arm * 0.1) * kindSpeed(kind, arm);
  const dur = k.release + (dist / speed) * 1.08;
  const peak = (0.6 + dist * 0.13 + Math.max(0, dist - 30) * 0.08) * k.peak;
  return { dur, peak };
}

export function launch(ball: Ball, from: Vec3, to: Vec3, dur: number, peak: number, state: BallState = 'air'): void {
  ball.state = state;
  ball.carrier = null;
  ball.from = { ...from };
  ball.to = { ...to };
  ball.t = 0;
  ball.dur = dur;
  ball.peak = peak;
  ball.pos = { ...from };
}

/** Advances an in-flight ball. Returns true on the step it arrives. */
export function updateFlight(ball: Ball, dt: number): boolean {
  ball.t += dt;
  const s = Math.min(1, ball.t / ball.dur);
  ball.pos = flightPos(ball.from, ball.to, ball.peak, s);
  return s >= 1;
}

/** Incomplete pass: skid and bounce along the turf. */
export function startBounce(ball: Ball): void {
  const dx = ball.to.x - ball.from.x;
  const dy = ball.to.y - ball.from.y;
  const l = Math.hypot(dx, dy) || 1;
  ball.state = 'bounce';
  ball.vel = { x: (dx / l) * 5, y: (dy / l) * 5, z: 3.5 };
}

/** A ball knocked away at the catch point: off the defender who got a hand on it (`from`), popped up a little. */
export function startDeflect(ball: Ball, from: { x: number; y: number }): void {
  let dx = ball.pos.x - from.x;
  let dy = ball.pos.y - from.y;
  if (Math.hypot(dx, dy) < 0.2) {
    // Square on it: it goes back the way it came, off to one side.
    dx = ball.from.x - ball.to.x;
    dy = ball.from.y - ball.to.y + 0.6 * (ball.to.x - ball.from.x >= 0 ? 1 : -1);
  }
  const l = Math.hypot(dx, dy) || 1;
  ball.state = 'bounce';
  ball.vel = { x: (dx / l) * 4, y: (dy / l) * 4, z: 4.5 };
}

export function updateBounce(ball: Ball, dt: number): void {
  ball.vel.z -= 22 * dt;
  ball.pos.x += ball.vel.x * dt;
  ball.pos.y += ball.vel.y * dt;
  ball.pos.z += ball.vel.z * dt;
  if (ball.pos.z <= 0) {
    ball.pos.z = 0;
    ball.vel.z = Math.abs(ball.vel.z) * 0.45;
    ball.vel.x *= 0.6;
    ball.vel.y *= 0.6;
    if (ball.vel.z < 0.6) ball.state = 'dead';
  }
}
