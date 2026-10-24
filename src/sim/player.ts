import type { Assign } from '../data/defenses';
import type { Ratings, Role, RosterPlayer } from '../data/teams';
import { add, len, limit, scale, sub, type Vec } from '../engine/math';
import type { Pose, Uniform } from '../render/sprites';

export type Side = 'off' | 'def';

export interface Player {
  id: number;
  side: Side;
  slot: string;
  role: Role;
  name: string;
  num: number;
  r: Ratings;
  skin: string;
  uniform: Uniform;

  pos: Vec;
  vel: Vec;
  /** Desired velocity set by AI / user each step; physics accelerates toward it. */
  want: Vec;
  facing: 1 | -1;
  anim: number;
  pose: Pose | null;
  poseTimer: number;
  down: boolean;
  downTimer: number;
  tackleCd: number;
  stamina: number;
  reactAt: number;

  // Offense
  start: Vec;
  route: Vec[];
  routeIdx: number;
  routeDir: Vec | null;
  isBlocker: boolean;
  engaged: Player | null;
  /** Rusher this blocker is responsible for. */
  mark: Player | null;
  stun: number;
  jam: number;
  manual: boolean;

  // Defense
  assign: Assign | null;
  manTarget: Player | null;
  press: boolean;
  cushion: number;
  turned: boolean;
  engagedBy: Player[];
  noEngage: number;
  goal: Vec | null;
}

let nextId = 1;

export function makePlayer(side: Side, rp: RosterPlayer, uniform: Uniform, pos: Vec): Player {
  return {
    id: nextId++,
    side,
    slot: rp.slot,
    role: rp.role,
    name: rp.name,
    num: rp.num,
    r: rp.r,
    skin: rp.skin,
    uniform,
    pos: { ...pos },
    vel: { x: 0, y: 0 },
    want: { x: 0, y: 0 },
    facing: side === 'off' ? 1 : -1,
    anim: Math.random() * 4,
    pose: null,
    poseTimer: 0,
    down: false,
    downTimer: 0,
    tackleCd: 0,
    stamina: 1,
    reactAt: Infinity,
    start: { ...pos },
    route: [],
    routeIdx: 0,
    routeDir: null,
    isBlocker: false,
    engaged: null,
    mark: null,
    stun: 0,
    jam: 0,
    manual: false,
    assign: null,
    manTarget: null,
    press: false,
    cushion: 0,
    turned: true,
    engagedBy: [],
    noEngage: 0,
    goal: null,
  };
}

/** Top speed in yards/second. A 90-speed player tops out around 8.6 yd/s. */
export function maxSpeed(p: Player): number {
  return 4.8 + (p.r.spd / 100) * 4.2;
}

export function accelOf(p: Player): number {
  return 10 + (p.r.acc / 100) * 10;
}

export function isEligible(p: Player): boolean {
  return p.side === 'off' && p.role !== 'OL' && p.role !== 'QB';
}

/** Velocity toward `target` at `speed`, easing off within `arriveR` yards. */
export function seek(p: Player, target: Vec, speed: number, arriveR = 1.2): Vec {
  const d = sub(target, p.pos);
  const l = len(d);
  if (l < 0.05) return { x: 0, y: 0 };
  const s = l < arriveR ? (speed * l) / arriveR : speed;
  return scale(d, s / l);
}

/**
 * Run to `target` so as to arrive in `timeLeft` seconds (catching in stride),
 * never faster than top speed and never too fast to stop on the spot.
 */
export function seekTimed(p: Player, target: Vec, timeLeft: number): Vec {
  const d = sub(target, p.pos);
  const l = len(d);
  if (l < 0.05) return { x: 0, y: 0 };
  const sp = Math.min(maxSpeed(p), l / Math.max(timeLeft, 0.05), Math.sqrt(2 * accelOf(p) * 0.8 * l));
  return scale(d, sp / l);
}

export function setPose(p: Player, pose: Pose, time: number): void {
  p.pose = pose;
  p.poseTimer = time;
}

export function knockDown(p: Player, time = Infinity): void {
  p.down = true;
  p.downTimer = time;
  p.want = { x: 0, y: 0 };
}

export function tickTimers(p: Player, dt: number): void {
  if (p.poseTimer > 0) {
    p.poseTimer -= dt;
    if (p.poseTimer <= 0) p.pose = null;
  }
  if (p.down && p.downTimer !== Infinity) {
    p.downTimer -= dt;
    if (p.downTimer <= 0) p.down = false;
  }
  p.tackleCd = Math.max(0, p.tackleCd - dt);
  p.stun = Math.max(0, p.stun - dt);
  p.jam = Math.max(0, p.jam - dt);
  p.noEngage = Math.max(0, p.noEngage - dt);
}

export function stepPlayer(p: Player, dt: number): void {
  const want = p.down ? { x: 0, y: 0 } : p.want;
  const decel = p.down ? 18 : accelOf(p);
  const dv = limit(sub(want, p.vel), decel * dt);
  p.vel = add(p.vel, dv);
  p.pos = add(p.pos, scale(p.vel, dt));
  if (!p.down) {
    if (p.vel.x > 0.3) p.facing = 1;
    else if (p.vel.x < -0.3) p.facing = -1;
  }
  p.anim += len(p.vel) * dt;
}

export function poseOf(p: Player, presnap: boolean): Pose {
  if (p.down) return 'down';
  if (p.pose) return p.pose;
  if (presnap && (p.role === 'OL' || p.role === 'DL')) return 'stance';
  if (len(p.vel) < 0.6) return 'stand';
  const frames: Pose[] = ['run0', 'run1', 'run2', 'run3'];
  return frames[Math.floor(p.anim * 1.1) % 4];
}
