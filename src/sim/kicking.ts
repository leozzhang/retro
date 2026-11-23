import { FIELD_LEN, FIELD_W } from '../engine/constants';
import { clamp, gauss, type Rng, type Vec, type Vec3 } from '../engine/math';

/**
 * Kicked-ball physics: 3D flight with gravity and air drag (relative to the
 * wind, so wind pushes the ball and adds or cuts distance), then bounces and a
 * roll shaped by the kick type. The same integrator drives the live ball, the
 * aim preview, and the AI's read of where the ball is going.
 */

export const GRAVITY = 10.7; // yd/s^2
/** Quadratic drag coefficient (per yard). Sets how much a kick falls short of the vacuum range. */
export const AIR_DRAG = 0.0105;
/** Gameplay scale on the real wind speed: 1 mph is about 0.49 yd/s. */
export const WIND_SCALE = 0.49 * 1.25;
/** Ball speed off the foot at full power for a 0-rated and a 99-rated leg (yd/s). */
export const LEG_SPEED = { min: 25.5, perRating: 0.088 };
/** Ball speed at zero power, as a fraction of full. */
const MIN_POWER = 0.35;

/** Crossbar height and half the distance between the uprights (NCAA), in yards. */
export const CROSSBAR_Z = 10 / 3;
export const UPRIGHT_HALF = 18.5 / 6;
export const POSTS_X = FIELD_LEN;
export const POSTS_Y = FIELD_W / 2;
const UPRIGHT_HIT = 0.15;

export interface BounceProfile {
  /** Vertical restitution on each bounce. */
  rest: number;
  /** Horizontal speed kept on each bounce. */
  keep: number;
  /** Random spread of bounce direction and height (a football's bad hops). */
  erratic: number;
  /** Extra horizontal speed lost on the first bounce (backspin that checks up). */
  backspin: number;
  /** Rolling deceleration, yd/s^2. */
  roll: number;
}

export interface KickParams {
  /** 0..1 */
  power: number;
  /** Horizontal direction (unit vector, world). */
  dir: Vec;
  /** Launch angle in degrees. */
  loft: number;
}

export type FlightMode = 'air' | 'bounce' | 'roll' | 'rest';

export interface KickFlight {
  pos: Vec3;
  vel: Vec3;
  mode: FlightMode;
  t: number;
  bounces: number;
  /** Time of the first ground contact (hang time), or null while still up. */
  landedAt: number | null;
  landPos: Vec3 | null;
}

export function legSpeed(kpw: number, power: number): number {
  const full = LEG_SPEED.min + kpw * LEG_SPEED.perRating;
  return full * (MIN_POWER + (1 - MIN_POWER) * clamp(power, 0, 1.05));
}

/** Off a tee the kicker gets a full approach and a clean strike. */
export const TEE_BOOST = 1.14;
/** A punter's drop and full swing put more into the ball than a field goal's short approach to the hold. */
export const PUNT_BOOST = 1.05;

/** The leg's boost by unit: the tee on kickoffs, the swing on punts, none on field goals and extra points. */
export function footBoost(unit: string): number {
  return unit === 'kickoff' ? TEE_BOOST : unit === 'punt' ? PUNT_BOOST : 1;
}

/** `tee`: true for a kickoff's tee, or the boost itself (`footBoost`). */
export function launchKick(from: Vec3, p: KickParams, kpw: number, tee: boolean | number = false): KickFlight {
  const v = legSpeed(kpw, p.power) * (tee === true ? TEE_BOOST : tee === false ? 1 : tee);
  const a = (p.loft * Math.PI) / 180;
  const h = v * Math.cos(a);
  return {
    pos: { ...from },
    vel: { x: p.dir.x * h, y: p.dir.y * h, z: v * Math.sin(a) },
    mode: 'air',
    t: 0,
    bounces: 0,
    landedAt: null,
    landPos: null,
  };
}

/** Wind as a world-space velocity (yd/s) from its mph and direction. */
export interface Wind {
  mph: number;
  /** Direction the wind blows toward (unit vector, world). */
  dir: Vec;
}

export const CALM: Wind = { mph: 0, dir: { x: 1, y: 0 } };

export function windVel(w: Wind): Vec {
  return { x: w.dir.x * w.mph * WIND_SCALE, y: w.dir.y * w.mph * WIND_SCALE };
}

const NO_RNG: Rng = () => 0.5;

export function stepKick(k: KickFlight, dt: number, wind: Wind, b: BounceProfile, rng: Rng = NO_RNG): void {
  if (k.mode === 'rest') return;
  k.t += dt;
  const v = k.vel;
  if (k.mode === 'roll') {
    const sp = Math.hypot(v.x, v.y);
    const ns = Math.max(0, sp - b.roll * dt);
    if (ns <= 0.05) {
      v.x = v.y = 0;
      k.mode = 'rest';
      return;
    }
    v.x *= ns / sp;
    v.y *= ns / sp;
    k.pos.x += v.x * dt;
    k.pos.y += v.y * dt;
    return;
  }
  const w = windVel(wind);
  const rx = v.x - w.x;
  const ry = v.y - w.y;
  const rz = v.z;
  const rs = Math.hypot(rx, ry, rz);
  v.x -= AIR_DRAG * rs * rx * dt;
  v.y -= AIR_DRAG * rs * ry * dt;
  v.z -= (AIR_DRAG * rs * rz + GRAVITY) * dt;
  k.pos.x += v.x * dt;
  k.pos.y += v.y * dt;
  k.pos.z += v.z * dt;
  if (k.pos.z > 0) return;

  // Ground contact
  k.pos.z = 0;
  if (k.landedAt === null) {
    k.landedAt = k.t;
    k.landPos = { ...k.pos };
  }
  const first = k.bounces === 0;
  k.bounces++;
  const spread = (rng() - 0.5) * 2 * b.erratic;
  const keep = clamp(b.keep * (1 + spread * 0.5) - (first ? b.backspin : 0), 0, 1);
  const turn = spread * 0.6; // radians of sideways kick off the bounce
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const hx = (v.x * c - v.y * s) * keep;
  const hy = (v.x * s + v.y * c) * keep;
  v.x = hx;
  v.y = hy;
  v.z = Math.abs(v.z) * clamp(b.rest * (1 + spread), 0, 0.9);
  k.mode = 'bounce';
  if (v.z < 1.2) {
    v.z = 0;
    k.mode = 'roll';
  }
}

export interface KickPrediction {
  /** Sampled positions every `PRED_DT` seconds until the ball stops (or crosses the end line). */
  pts: Vec3[];
  apex: number;
  /** Hang time: seconds to first contact with the ground. */
  hang: number;
  land: Vec3;
  rest: Vec3;
}

export const PRED_DT = 1 / 30;

/** Run the kick forward without bounce randomness. Stops at the far end line or a sideline. */
export function predictKick(
  from: Vec3, p: KickParams, kpw: number, wind: Wind, b: BounceProfile, tee: boolean | number = false, maxT = 12,
): KickPrediction {
  const k = launchKick(from, p, kpw, tee);
  const pts: Vec3[] = [{ ...k.pos }];
  let apex = k.pos.z;
  const sub = 4;
  while (k.mode !== 'rest' && k.t < maxT) {
    for (let i = 0; i < sub; i++) stepKick(k, PRED_DT / sub, wind, b);
    pts.push({ ...k.pos });
    apex = Math.max(apex, k.pos.z);
    const out = k.pos.y < 0 || k.pos.y > FIELD_W || k.pos.x > FIELD_LEN + 4 || k.pos.x < -4;
    if (out && k.pos.z <= 0) break;
  }
  return {
    pts,
    apex,
    hang: k.landedAt ?? k.t,
    land: k.landPos ?? { ...k.pos },
    rest: { ...k.pos },
  };
}

/** Standard deviations of a kick's mistakes: direction (radians), power (fraction) and loft (degrees). */
export function kickErrorSd(kac: number, pressure: number): { dir: number; power: number; loft: number } {
  const skill = 1.55 - kac / 100;
  const p = 1 + pressure * 1.5;
  return { dir: 0.094 * skill * p, power: 0.05 * skill * p, loft: 2.2 * skill * p };
}

export function applyKickError(p: KickParams, kac: number, pressure: number, rng: Rng): KickParams {
  const sd = kickErrorSd(kac, pressure);
  const a = Math.atan2(p.dir.y, p.dir.x) + gauss(rng) * sd.dir;
  return {
    dir: { x: Math.cos(a), y: Math.sin(a) },
    power: clamp(p.power * (1 + gauss(rng) * sd.power), 0, 1.05),
    loft: p.loft + gauss(rng) * sd.loft,
  };
}

/**
 * The shank: a punt or kickoff off the side of the foot, the heavy tail the Gaussian error doesn't have.
 * - `base`: the odds for a kicker at `goodKac` or better in calm air with no rush.
 * - `perKac`: more for each point of accuracy under `goodKac`.
 * - `pressure`: the odds multiply by 1 + this x the rush's pressure (0..1).
 * - `perMph`: more for each mph of wind.
 * - `dir`: how far off line it goes (radians, a uniform draw in the range, either way).
 * - `power`: the share of the leg that gets into it.
 * Field goals and extra points don't shank: their misses are the meter's and the aim's.
 */
export const SHANK = { base: 0.005, goodKac: 90, perKac: 0.0008, pressure: 2, perMph: 0.0006, dir: [0.22, 0.55], power: [0.5, 0.78] };

export function shankOdds(kac: number, pressure: number, windMph: number): number {
  const S = SHANK;
  return (S.base + Math.max(0, S.goodKac - kac) * S.perKac + windMph * S.perMph) * (1 + pressure * S.pressure);
}

/** The kick off the side of his foot. */
export function applyShank(p: KickParams, rng: Rng): KickParams {
  const [d0, d1] = SHANK.dir;
  const [p0, p1] = SHANK.power;
  const off = (d0 + rng() * (d1 - d0)) * (rng() < 0.5 ? -1 : 1);
  const a = Math.atan2(p.dir.y, p.dir.x) + off;
  return { dir: { x: Math.cos(a), y: Math.sin(a) }, power: p.power * (p0 + rng() * (p1 - p0)), loft: p.loft * (0.7 + rng() * 0.4) };
}

/**
 * Timing meter: after the release a needle sweeps the bar and the user hits
 * Space as the foot meets the ball. `e` runs -1 (bar's left end, early) to +1
 * (right end, late); 0 is the green's center.
 */
/** Seconds from the green's center to either end of the bar. */
export const METER_HALF = 0.45;
/** Pull (early) or push (late) at the very end of the bar, radians (about 10°). */
export const MISTIME_DIR = 0.18;
/** Exponent on how far past the green the needle was: under 1 makes a near miss already cost real direction. */
export const MISTIME_CURVE = 0.85;
/** Green half-width in meter units: a base plus a share for kick accuracy. */
export const GREEN_BASE = 0.12;
export const GREEN_KAC = 0.12;

export function timingGreen(kac: number): number {
  return GREEN_BASE + (GREEN_KAC * kac) / 100;
}

/** Direction error from mistiming (radians): 0 on the green; early pulls left (-y), late pushes right (+y). */
export function mistimeAngle(e: number, kac: number): number {
  const g = timingGreen(kac);
  const a = Math.abs(clamp(e, -1, 1));
  if (a <= g) return 0;
  return Math.sign(e) * MISTIME_DIR * ((a - g) / (1 - g)) ** MISTIME_CURVE;
}

export function applyMistime(p: KickParams, e: number, kac: number): KickParams {
  const da = mistimeAngle(e, kac);
  if (!da) return p;
  const a = Math.atan2(p.dir.y, p.dir.x) + da;
  return { ...p, dir: { x: Math.cos(a), y: Math.sin(a) } };
}

export type FgResult ='good' | 'wideLeft' | 'wideRight' | 'short' | 'upright';

/**
 * Judge a field goal as the ball crosses the plane of the goal posts (between
 * two integration samples). "Left" is from the kicker's view facing +x: low y.
 */
export function fgCheck(prev: Vec3, cur: Vec3): FgResult | null {
  if (prev.x >= POSTS_X || cur.x < POSTS_X) return null;
  const s = (POSTS_X - prev.x) / Math.max(1e-6, cur.x - prev.x);
  const y = prev.y + (cur.y - prev.y) * s;
  const z = prev.z + (cur.z - prev.z) * s;
  const off = y - POSTS_Y;
  if (z > CROSSBAR_Z && Math.abs(Math.abs(off) - UPRIGHT_HALF) < UPRIGHT_HIT) return 'upright';
  if (z <= CROSSBAR_Z) return 'short';
  if (off < -UPRIGHT_HALF) return 'wideLeft';
  if (off > UPRIGHT_HALF) return 'wideRight';
  return 'good';
}

/** Yards of a field goal attempt from a line of scrimmage at world x `los`. */
export function fgDistance(los: number, opGoal: number): number {
  return Math.round(opGoal - los + 17);
}
