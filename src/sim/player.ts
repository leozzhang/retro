import type { Assign } from '../data/defenses';
import type { PoaJob, RouteName } from '../data/plays';
import type { StJob } from '../data/specialTeams';
import type { Ratings, Role, RosterPlayer } from '../data/teams';
import { add, clamp, len, lerp, limit, scale, sub, type Vec } from '../engine/math';
import type { Pose, Uniform } from '../render/sprites';
import { celebrationPose, tickCelebration, type Celebrating } from './celebrate';

export type Side = 'off' | 'def';

/**
 * Anticipation, from -1 (cautious) to 1 (sitting on it): the run, screens, the QB taking off, the
 * deep ball. Set per snap by the CPU defense's brain (game/defBrain.ts); `NO_LEAN` plays as before.
 */
export interface Lean {
  run: number;
  screen: number;
  qb: number;
  deep: number;
}
export const NO_LEAN: Lean = Object.freeze({ run: 0, screen: 0, qb: 0, deep: 0 });

/**
 * What a defender's lean (`Player.lean`, game/defBrain.ts) does on the field. A lean speeds the read
 * it's on by up to `fast` and a cautious one slows it by up to `slow` (`leanMul`). Leaning run also
 * bites more often and longer on a play-action fake (`paBite`, `biteLong` s), puts a man defender's
 * eyes in the backfield (`eyes` s more lag on his receiver), creeps a backer up pre-snap (`creep`),
 * gives the line a better get-off against a run (`surge`, block power) and a softer pass rush (`rushSoft`). Throws
 * shorter than `shortAir` read off the screen lean, longer than `deepAir` off the deep lean (and are
 * `late` for a defender sitting on the run or screens), and the ones between off the deep lean
 * reversed: a defender who isn't worried about the deep ball squats on the short ones. A corner leaning
 * deep bails up to `bail` yards deeper pre-snap (a tell). Past `smell`, a defender
 * leaning screen comes for the screen as soon as the line lets its rushers go.
 */
export const LEAN_FX = {
  fast: 0.45, slow: 0.5, paBite: 0.25, biteLong: 0.6, eyes: 0.15, creep: 0.8, surge: 8, rushSoft: 0.15, shortAir: 3, deepAir: 15, late: 0.4,
  smell: 0.3, bail: 2,
};

/** Reaction-time factor for a lean: under 1 when he's sitting on it, over 1 when he's wary of it. */
export function leanMul(l: number): number {
  return l >= 0 ? 1 - LEAN_FX.fast * l : 1 - LEAN_FX.slow * l;
}

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
  /** A scorer celebrating in the end zone (display only, `sim/celebrate.ts`). */
  celebrate: Celebrating | null;
  down: boolean;
  downTimer: number;
  tackleCd: number;
  stamina: number;
  reactAt: number;

  // Offense
  start: Vec;
  /** The route he was given this snap (null for linemen and the QB). */
  routeName: RouteName | null;
  route: Vec[];
  routeIdx: number;
  routeDir: Vec | null;
  /** A pass route (not a run path, fake or lead path): it gets the burst-and-plant speed profile. */
  passRoute: boolean;
  /** Per waypoint: the share of top speed he carries through it (0 = stop there). */
  cutKeep: number[];
  /** The route ends with him settling (hitch, curl, comeback, smoke, screen): he turns to face the QB. */
  settle: boolean;
  /** When his turn toward the QB started (Infinity until then). */
  turnAt: number;
  /** Receivers: the waypoint index past which he turns his head to the QB (`RouteDef.look`), or the depth for routes without a break. */
  look: number;
  lookDepth: number;
  /** When his head came around to the QB (Infinity until then). */
  lookAt: number;
  /**
   * 0..1: how much he has the QB in view right now (sim/ai.ts `eyesOf`). Receivers: head turned to the QB.
   * Defenders: facing the backfield rather than trailing his man with his back turned.
   */
  eyes: number;
  /** When he locates a thrown ball (Infinity until there's one, or if it isn't near him). */
  findAt: number;
  /** Seconds left gathering a bullet he just caught: his acceleration is cut (`GATHER`). */
  gather: number;
  isBlocker: boolean;
  /** Turns into a pass blocker once the route (a play-action fake) is done. */
  thenBlock: boolean;
  /** Became a blocker mid-play (after a fake), so his man defender doesn't hug rush. */
  lateBlock: boolean;
  /** A detached receiver who blocks (stalks a DB): his man defender plays him rather than rushing. */
  stalk: boolean;
  /** Seconds after the snap before the route starts, and whether he pass-blocks until then. */
  routeDelay: number;
  delayBlock: boolean;
  /** Pulling on a run: still working behind the line toward his kick-out or lead block. */
  pull: 'kick' | 'lead' | null;
  engaged: Player | null;
  /** Rusher this blocker is responsible for. */
  mark: Player | null;
  /** Zone combo: the backer this blocker leaves the double team for at `comboUntil`. */
  climb: Player | null;
  comboUntil: number;
  /** Gap-scheme backside tackle: the spot he hinges to, taking whoever comes through it. */
  hinge: Vec | null;
  /**
   * Point of attack: the man a puller or lead back is assigned at the snap (`assignRunBlocks`), his job on
   * him (kick him out, lead up on a backer, or take the force player on the perimeter), and on the
   * perimeter the spot along the line where he turns up (the edge). The trap's trapped lineman is one too.
   */
  poa: Player | null;
  poaJob: PoaJob | null;
  turnY: number | null;
  stun: number;
  jam: number;
  manual: boolean;
  /** Ball carrier: seconds left in a cut (`JUKE`), its velocity, and the cooldown until the next (the rest of the play). */
  juke: number;
  jukeVel: Vec;
  jukeCd: number;

  // Defense
  assign: Assign | null;
  manTarget: Player | null;
  /** Zone coverage: the receiver he's sitting on (kept a while, so he doesn't flip between two). */
  zoneMark: Player | null;
  /** A defender's anticipation this snap, from the game so far (game/defBrain.ts); zero is neutral. */
  lean: Lean;
  press: boolean;
  cushion: number;
  turned: boolean;
  engagedBy: Player[];
  noEngage: number;
  /** Run blocks: unit vector from this defender to the side his blocker has him (set at contact). */
  blockDir: Vec | null;
  /** Run blocks: this block's luck, in rating points, rolled at contact. */
  blockRoll: number;
  /** Run blocks: how much of him his blocker still has, 1 at contact down to 0 when he's off it (`RUN_CONTROL`). */
  blockControl: number;
  /** Run blocks: the defender's edge over his blockers last step (negative = the blockers are winning), for the renderer. */
  blockPower: number;
  goal: Vec | null;
  /** Run fit window: from `fitAt` until `fitUntil` the defender attacks the run (run read or PA bite). */
  fitAt: number;
  fitUntil: number;

  /** Special-teams job on kicking plays. */
  job: StJob | null;
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
    celebrate: null,
    down: false,
    downTimer: 0,
    tackleCd: 0,
    stamina: 1,
    reactAt: Infinity,
    start: { ...pos },
    routeName: null,
    route: [],
    routeIdx: 0,
    routeDir: null,
    passRoute: false,
    cutKeep: [],
    settle: false,
    turnAt: Infinity,
    look: 1,
    lookDepth: Infinity,
    lookAt: Infinity,
    eyes: 0,
    findAt: Infinity,
    gather: 0,
    isBlocker: false,
    thenBlock: false,
    lateBlock: false,
    stalk: false,
    routeDelay: 0,
    delayBlock: false,
    pull: null,
    engaged: null,
    mark: null,
    climb: null,
    comboUntil: 0,
    hinge: null,
    poa: null,
    poaJob: null,
    turnY: null,
    stun: 0,
    jam: 0,
    manual: false,
    juke: 0,
    jukeVel: { x: 0, y: 0 },
    jukeCd: 0,
    assign: null,
    manTarget: null,
    zoneMark: null,
    lean: NO_LEAN,
    press: false,
    cushion: 0,
    turned: true,
    engagedBy: [],
    noEngage: 0,
    blockDir: null,
    blockRoll: 0,
    blockControl: 1,
    blockPower: 0,
    goal: null,
    fitAt: Infinity,
    fitUntil: 0,
    job: null,
  };
}

/** Top speed in yards/second. A 90-speed player tops out around 8.6 yd/s. */
export function maxSpeed(p: Player): number {
  return 4.8 + (p.r.spd / 100) * 4.2;
}

/**
 * Sprint endurance, 0..1, from stamina: a pocket QB is about 0.4, a TE about 0.5,
 * backs and receivers about 0.85. It sets how long the sprint bar lasts.
 */
export function endurance(p: Player): number {
  return clamp((p.r.sta - 60) / 35, 0, 1);
}

/**
 * A back's cut on a called run (the user's Space with W or S): a near-instant dash sideways for `time`
 * s, keeping `keep` of his forward speed, with `accel` times his acceleration so he's at full dash at
 * once. Its speed runs from `speed.min` to `speed.max` yd/s over a cut skill (half `acc`, half `elu`)
 * of `speed.lo` to `speed.hi`: about 1.5 yd for a fullback, 2 for an average back, 2.5 for an elite
 * elusive one. When it ends he plants: his sideways speed drops to `exit` of it. It stops short
 * against anyone within `bump` yd in its path (`Play.blockCut`). It costs `cost` of the sprint bar
 * and can't come again for `cd` s (the rest of the play: one a play). A tackler who closes on him
 * during it is fooled (`jukeTackleMul`, sim/tackling.ts); a cut with nobody there just loses ground.
 */
export const JUKE = {
  time: 0.17, speed: { min: 9, max: 15, lo: 65, hi: 97 }, keep: 0.75, accel: 8, exit: 0.25, bump: 1, cost: 0.12, cd: Infinity,
};

/** His cut's sideways speed (yd/s), from his acceleration and elusiveness. */
export function cutSpeed(p: Player): number {
  const { min, max, lo, hi } = JUKE.speed;
  return lerp(min, max, clamp(((p.r.acc + p.r.elu) / 2 - lo) / (hi - lo), 0, 1));
}

/** Start a cut to `dir` (-1 up the screen, 1 down) if he hasn't used it and has the legs. */
export function startJuke(p: Player, dir: number): boolean {
  if (p.down || p.jukeCd > 0 || p.stamina < JUKE.cost) return false;
  p.juke = JUKE.time;
  p.jukeVel = { x: Math.max(0, p.vel.x) * JUKE.keep, y: dir * cutSpeed(p) };
  p.jukeCd = JUKE.cd;
  p.stamina -= JUKE.cost;
  return true;
}

/**
 * Gathering a bullet (docs/PASSING.md): a ball on a rope comes into his body, not his hands in stride.
 * He keeps `keep` of his speed through the catch and has `accel` of his acceleration for `time` s.
 * Sure hands ease both: a 100 `cth` takes `ease` off the hit, a 50 takes none. His `acc` still sets
 * how fast he gets going again.
 */
export const GATHER = { time: 0.35, keep: 0.75, accel: 0.6, ease: 0.5 };

/** Start gathering a bullet he just caught (sim/ball.ts `THROWS.gather` = 1 at full). */
export function startGather(p: Player, amount: number): void {
  if (amount <= 0) return;
  const hit = amount * (1 - GATHER.ease * clamp((p.r.cth - 50) / 50, 0, 1));
  p.vel = scale(p.vel, 1 - (1 - GATHER.keep) * hit);
  p.gather = GATHER.time * hit;
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
  if (p.celebrate) tickCelebration(p, dt);
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
  if (p.juke > 0 && p.juke <= dt) p.vel = { x: p.vel.x, y: p.vel.y * JUKE.exit }; // the plant
  p.juke = Math.max(0, p.juke - dt);
  p.jukeCd = Math.max(0, p.jukeCd - dt);
}

export function stepPlayer(p: Player, dt: number): void {
  const want = p.down ? { x: 0, y: 0 } : p.want;
  const decel = p.down ? 18 : accelOf(p) * (p.juke > 0 ? JUKE.accel : 1) * (p.gather > 0 ? GATHER.accel : 1);
  if (p.gather > 0) p.gather = Math.max(0, p.gather - dt);
  const dv = limit(sub(want, p.vel), decel * dt);
  p.vel = add(p.vel, dv);
  p.pos = add(p.pos, scale(p.vel, dt));
  // A QB winding up or following through keeps facing his throw, even drifting back.
  const throwing = (p.pose === 'throw' || p.pose === 'throwEnd') && p.poseTimer > 0;
  if (!p.down && !throwing) {
    if (p.vel.x > 0.3) p.facing = 1;
    else if (p.vel.x < -0.3) p.facing = -1;
  }
  p.anim += len(p.vel) * dt;
}

/** Block power (rating points) past which the winning side of a block shows the drive pose. */
const BLOCK_POSE_WIN = 4;

export function poseOf(p: Player, presnap: boolean): Pose {
  if (p.down) return 'down';
  if (p.celebrate) {
    const c = celebrationPose(p);
    if (c) return c;
  }
  if (p.pose) return p.pose;
  if (presnap && (p.role === 'OL' || p.role === 'DL')) return 'stance';
  // Blocks: whoever's winning drives, an even block is locked up, a blocker who just got shed stumbles.
  const fightingFor = p.engaged ? -p.engaged.blockPower : p.engagedBy.length ? p.blockPower : null;
  if (fightingFor !== null) return fightingFor > BLOCK_POSE_WIN ? 'drive' : 'fight';
  if (p.stun > 0 && p.side === 'off') return 'stumble';
  if (len(p.vel) < 0.6) return 'stand';
  const frames: Pose[] = ['run0', 'run1', 'run2', 'run3'];
  return frames[Math.floor(p.anim * 1.1) % 4];
}
