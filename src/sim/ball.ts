import { lerp, type Vec3 } from '../engine/math';
import type { Player } from './player';

export type BallState = 'held' | 'snap' | 'air' | 'bounce' | 'dead';

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

/** Air time and arc height for a pass of `dist` yards by a QB with the given arm rating. */
export function passParams(dist: number, arm: number): { dur: number; peak: number } {
  const speed = 17 + arm * 0.1;
  const dur = 0.18 + (dist / speed) * 1.08;
  const peak = 0.6 + dist * 0.13 + Math.max(0, dist - 30) * 0.08;
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
