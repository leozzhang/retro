import { len, type Vec } from '../engine/math';
import type { Pose } from '../render/sprites';
import type { Player } from './player';

/**
 * Touchdown celebrations: display only. The scorer runs on and eases to a stop a few yards deep in the
 * end zone, then celebrates. Nothing here draws from a play's rng or touches anything the sim reads, so
 * every report stays the same.
 */
export type Celebration = 'spike' | 'leap' | 'spin';

export interface Celebrating {
  kind: Celebration;
  /** Seconds since he came to a stop (0 while he's still running it out). */
  t: number;
  /** Where he stops, and which way he was going. */
  stopX: number;
  dir: 1 | -1;
  /** The ball has left his hands (spiked or tossed). */
  released: boolean;
}

export const CELEBRATE = {
  /** Yards past where he scored that he eases to a stop. */
  depth: 4,
  /** How fast he closes on the stop, per yard left (yd/s per yd). */
  ease: 2.2,
  /** Below this speed (yd/s) he's stopped and the celebration starts. */
  still: 1.2,
  /** The spike: ball raised overhead, slammed down, then both arms up. */
  spike: { windup: 0.4, slam: 0.3, ball: { x: 2, y: 0, z: -10 }, overhead: { dx: 0.33, z: 2.1 } },
  /** The leap: a crouch, a jump with both arms up, the landing; `hops` times. The ball is tossed aside first. */
  leap: { crouch: 0.16, air: 0.3, land: 0.14, hops: 2, toss: { x: -2.5, y: 1.5, z: 3.5 } },
  /**
   * The spin: a quick dip to stand the ball on its tip in front of him and spin it like a top, then up with
   * both arms raised while it twirls. The ball goes down `place` into the `dip`. `rate` is the spin's start
   * (quarter turns a second), `decay` how fast it dies (per second); `ball` is where it stands, yards ahead
   * of him, its middle `z` off the turf.
   */
  spin: { place: 0.08, dip: 0.3, rate: 20, decay: 0.6, ball: { dx: 0.5, z: 0.35 } },
};

const KINDS: Celebration[] = ['spike', 'leap', 'spin'];

/** He's scored: start the run-out. The kind is a hash of his number and where he crossed, not a roll. */
export function startCelebration(p: Player, kinds: Celebration[] = KINDS): void {
  const dir: 1 | -1 = p.vel.x < 0 ? -1 : p.vel.x > 0 ? 1 : p.facing;
  const kind = kinds[(p.num * 7 + Math.floor(Math.abs(p.pos.y) * 3)) % kinds.length];
  p.celebrate = { kind, t: 0, stopX: p.pos.x + dir * CELEBRATE.depth, released: false, dir };
  p.pose = null;
  p.poseTimer = 0;
}

/** His desired velocity: keep running, slowing as the stop nears, then stand. */
export function celebrateWant(p: Player): Vec {
  const c = p.celebrate!;
  const left = (c.stopX - p.pos.x) * c.dir;
  if (left <= 0.05) return { x: 0, y: 0 };
  const sp = Math.min(Math.max(Math.abs(p.vel.x), 2), left * CELEBRATE.ease);
  return { x: c.dir * sp, y: p.vel.y * 0.5 };
}

/** Each step: the clock starts once he's stopped, and the ball leaves his hands on cue. */
export function tickCelebration(p: Player, dt: number): void {
  const c = p.celebrate;
  if (!c || p.down) return;
  if (c.t <= 0 && len(p.vel) >= CELEBRATE.still) return;
  c.t += dt;
  if (c.kind === 'spike' && c.t >= CELEBRATE.spike.windup) c.released = true;
  if (c.kind === 'leap' && c.t > 0) c.released = true;
  if (c.kind === 'spin' && c.t >= CELEBRATE.spin.place) c.released = true;
}

/** The pose for this moment of the celebration; null while he's still running it out. */
export function celebrationPose(p: Player): Pose | null {
  const c = p.celebrate!;
  if (c.t <= 0) return null;
  const t = c.t;
  switch (c.kind) {
    case 'spike': {
      const s = CELEBRATE.spike;
      return t < s.windup ? 'spikeUp' : t < s.windup + s.slam ? 'spikeDown' : 'cheer';
    }
    case 'leap': {
      const l = CELEBRATE.leap;
      const hop = l.crouch + l.air + l.land;
      if (t >= hop * l.hops) return 'cheer';
      const u = t % hop;
      return u < l.crouch ? 'crouch' : u < l.crouch + l.air ? 'leap' : 'crouch';
    }
    case 'spin': {
      const n = CELEBRATE.spin;
      return t < n.dip ? 'spinBall' : 'cheer';
    }
  }
}

/** Where the ball he's holding sits when the celebration moves it: up in his raised hand for the spike's windup. */
export function heldBall(p: Player): { dx: number; z: number } | null {
  const c = p.celebrate;
  if (c && c.kind === 'spike' && c.t > 0 && !c.released) return CELEBRATE.spike.overhead;
  return null;
}

/**
 * How far the spun ball has turned, in quarter turns (the ball sprite's spin frames), easing to a stop; null
 * unless he's set it spinning.
 */
export function spinTurns(c: Celebrating): number | null {
  if (c.kind !== 'spin' || !c.released) return null;
  const n = CELEBRATE.spin;
  const s = Math.max(0, c.t - n.place);
  return (n.rate * (1 - Math.exp(-n.decay * s))) / n.decay;
}

/** The ball's velocity as it leaves his hands: spiked into the turf, or tossed back over his shoulder. */
export function releaseVel(c: Celebrating): { x: number; y: number; z: number } {
  const v = c.kind === 'spike' ? CELEBRATE.spike.ball : CELEBRATE.leap.toss;
  return { x: v.x * c.dir, y: v.y, z: v.z };
}
