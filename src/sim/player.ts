import type { RunJob } from './runFits';
import type { Assign } from '../data/defenses';
import type { PoaJob, RouteName } from '../data/plays';
import type { StJob } from '../data/specialTeams';
import type { Ratings, Role, RosterPlayer } from '../data/teams';
import { add, clamp, len, lerp, limit, norm, scale, sub, type Vec } from '../engine/math';
import type { Pose, Uniform } from '../render/sprites';
import { celebrationPose, tickCelebration, type Celebrating } from './celebrate';
import type { ProtectJob, RushRole } from './passPro';

export type Side = 'off' | 'def';

/**
 * Anticipation, from -1 (cautious) to 1 (sitting on it): the run, screens, the QB taking off, the
 * deep ball, and `inside`: leverage, from -1 (sitting on outside breaks) to 1 (inside breaks: the
 * glance, slant, dig). Set per snap by the CPU defense's brain (game/defBrain.ts); `NO_LEAN` plays as before.
 */
export interface Lean {
  run: number;
  screen: number;
  qb: number;
  deep: number;
  inside: number;
}
export const LEAN_KEYS = ['run', 'screen', 'qb', 'deep', 'inside'] as const;
export const NO_LEAN: Lean = Object.freeze({ run: 0, screen: 0, qb: 0, deep: 0, inside: 0 });

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
 * Leaning inside, a man defender shades `shade` yd more to the inside of his man (pre-snap too: a
 * tell) and an underneath zone defender sinks `sink` yd under the windows inside; on a throw between
 * `shortAir` and `deepAir` he breaks faster on a ball breaking the way he leans and slower the other way.
 */
export const LEAN_FX = {
  fast: 0.45, slow: 0.5, paBite: 0.25, biteLong: 0.6, eyes: 0.15, creep: 0.8, surge: 8, rushSoft: 0.15, shortAir: 3, deepAir: 15, late: 0.4,
  smell: 0.3, bail: 2, shade: 1.0, sink: 1.5,
};

/** A throw broke inside: the ball came down at least a yard closer to the ball's spot across the field than its receiver lined up. */
export function breaksInside(startY: number, ballY: number, targetY: number): boolean {
  return Math.abs(targetY - ballY) < Math.abs(startY - ballY) - 1;
}

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
  /**
   * After a catch (`CATCH`): which way his body faces (a unit vector, turning toward where he wants to go),
   * null once he's squared away and up to speed. Seconds since the catch in `caughtFor`.
   */
  hips: Vec | null;
  caughtFor: number;
  /**
   * The intended receiver, when he found the ball: where he'd have been at its arrival on his own path,
   * and the way he was going (sim/catching.ts `catchGrade`). Null until then.
   */
  track: { at: Vec; dir: Vec | null } | null;
  /** Laid out for a ball he can't get to on his feet (`PLACEMENT`): airborne, no steering. */
  diving: boolean;
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
  /** Pass rush: his role this snap, the edge around the arc or an interior gap, and his plan (sim/passPro.ts `assignRushRoles`). */
  rushRole: RushRole | null;
  /** Pass pro: his gap or his man in the line's protection call (sim/passPro.ts `callProtection`). */
  pro: ProtectJob | null;
  /** Keeps him facing this way whatever he's moving (a lineman's pass set faces upfield); 0 = off. */
  faceLock: 0 | 1 | -1;
  /** Run fit window: from `fitAt` until `fitUntil` the defender attacks the run (run read or PA bite). */
  fitAt: number;
  fitUntil: number;
  /** Designed runs: his run job, his gap's y, whether his call spills, and when he's read his blocker (sim/runFits.ts). */
  runJob: RunJob | null;
  gapY: number;
  spill: boolean;
  readAt: number;

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
    hips: null,
    caughtFor: 0,
    track: null,
    diving: false,
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
    rushRole: null,
    pro: null,
    faceLock: 0,
    fitAt: Infinity,
    fitUntil: 0,
    runJob: null,
    gapY: 0,
    spill: false,
    readAt: 0,
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

/**
 * Out of a catch (docs/PASSING.md): a receiver has to turn his hips to where he's going, and get going.
 * - His hips turn toward his `want` at `turn` rad/s, from `turn.lo` at a turn skill (half `acc`, half
 *   `rte`) of `skill.lo` to `turn.hi` at `skill.hi`. Squared up to the QB, that's a half turn: about 0.5 s
 *   for an average receiver.
 * - With his hips the wrong way, he has `turnAccel` of his acceleration and can't go faster than
 *   `turnCap` yd/s, both easing to full as his hips come around (by alignment, `(1 + cos) / 2`).
 * - For `rampTime` s after any catch, his acceleration is `ramp` of it, easing back to full: securing the
 *   ball. A catch in stride (`startCatch`'s `ramp` 0) skips it.
 * Runs, kick returns and interceptions never get it: only the offense's caught passes.
 */
export const CATCH = {
  turn: { lo: 5, hi: 8 },
  skill: { lo: 60, hi: 95 },
  turnAccel: 0.3,
  turnCap: 2.5,
  ramp: 0.6,
  rampTime: 0.8,
};

/** Start the catch state: `hips` the way his body faces at the catch, `ramp` 0..1 of `CATCH.ramp`'s cut. */
export function startCatch(p: Player, hips: Vec, ramp = 1): void {
  p.hips = len(hips) > 0.01 ? norm(hips) : { x: 1, y: 0 };
  p.caughtFor = (1 - clamp(ramp, 0, 1)) * CATCH.rampTime;
}

/** His hips' turn rate (rad/s) out of a catch. */
export function hipTurnRate(p: Player): number {
  const t = clamp(((p.r.acc + p.r.rte) / 2 - CATCH.skill.lo) / (CATCH.skill.hi - CATCH.skill.lo), 0, 1);
  return lerp(CATCH.turn.lo, CATCH.turn.hi, t);
}

/**
 * One step of the catch state: turn his hips toward his `want`; returns his acceleration multiplier and
 * caps his `want`. Clears it once he's squared away and the ramp is done.
 */
function catchStep(p: Player, want: Vec, dt: number): { mul: number; want: Vec } {
  const hips = p.hips!;
  p.caughtFor += dt;
  const w = len(want);
  let align = 1;
  if (w > 0.3) {
    const dir = scale(want, 1 / w);
    const cur = Math.atan2(hips.y, hips.x);
    let d = Math.atan2(dir.y, dir.x) - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const step = hipTurnRate(p) * dt;
    const a = cur + clamp(d, -step, step);
    p.hips = { x: Math.cos(a), y: Math.sin(a) };
    align = (1 + Math.cos(d - clamp(d, -step, step))) / 2;
  }
  const ramp = lerp(CATCH.ramp, 1, clamp(p.caughtFor / CATCH.rampTime, 0, 1));
  if (align > 0.999 && p.caughtFor >= CATCH.rampTime) p.hips = null;
  const cap = lerp(CATCH.turnCap, maxSpeed(p), align * align);
  return { mul: lerp(CATCH.turnAccel, 1, align) * ramp, want: w > cap ? scale(want, cap / w) : want };
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
  let want = p.down ? { x: 0, y: 0 } : p.want;
  let caught = 1;
  if (p.hips && !p.down) ({ mul: caught, want } = catchStep(p, want, dt));
  const decel = p.down ? 18 : accelOf(p) * (p.juke > 0 ? JUKE.accel : 1) * (p.gather > 0 ? GATHER.accel : 1) * caught;
  if (p.gather > 0) p.gather = Math.max(0, p.gather - dt);
  const dv = limit(sub(want, p.vel), decel * dt);
  p.vel = add(p.vel, dv);
  p.pos = add(p.pos, scale(p.vel, dt));
  // A QB winding up or following through keeps facing his throw, even drifting back.
  const throwing = (p.pose === 'throw' || p.pose === 'throwEnd') && p.poseTimer > 0;
  // Turning out of a catch, he faces the way his hips do.
  if (p.hips && !p.down && Math.abs(p.hips.x) > 0.2) p.facing = p.hips.x > 0 ? 1 : -1;
  else if (p.faceLock && !p.down) p.facing = p.faceLock;
  else if (!p.down && !throwing) {
    if (p.vel.x > 0.3) p.facing = 1;
    else if (p.vel.x < -0.3) p.facing = -1;
  }
  p.anim += len(p.vel) * dt;
}

/** Steps on a block or a pass set: moving faster than `moving` yd/s, a step every 1 / `rate` yd. */
const BLOCK_STEP = { moving: 0.5, rate: 2.4 };

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
  // Moving on a block or in a pass set, his feet keep stepping (`BLOCK_STEP`).
  const step = len(p.vel) > BLOCK_STEP.moving ? Math.floor(p.anim * BLOCK_STEP.rate) % 2 : -1;
  const fightingFor = p.engaged ? -p.engaged.blockPower : p.engagedBy.length ? p.blockPower : null;
  if (fightingFor !== null) {
    const base = fightingFor > BLOCK_POSE_WIN ? 'drive' : 'fight';
    return step < 0 ? base : (`${base}${step + 1}` as Pose);
  }
  if (p.stun > 0 && p.side === 'off') return 'stumble';
  // A lineman in his pass set: hands up, shuffling (the kick slide) while he moves.
  if (p.faceLock && p.role === 'OL') return step < 0 ? 'set0' : step ? 'set2' : 'set1';
  if (len(p.vel) < 0.6) return 'stand';
  const frames: Pose[] = ['run0', 'run1', 'run2', 'run3'];
  return frames[Math.floor(p.anim * 1.1) % 4];
}
