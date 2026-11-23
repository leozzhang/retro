import { ONSIDE_SIDE, type KickDef, type ReturnScheme } from '../data/specialTeams';
import { FIELD_W, OPP_GOAL } from '../engine/constants';
import { clamp, gauss, type Rng, type Vec3 } from '../engine/math';
import {
  applyKickError, applyMistime, applyShank, footBoost, METER_HALF, predictKick, shankOdds, type KickParams, type Wind,
} from '../sim/kicking';
import { PUNT_GETOFF, RUGBY, type KickPlay } from './kickPlay';

/**
 * The kicker on punts and kickoffs. The user (or the CPU's special-teams coach, `kickCall`) calls the
 * kick; the kicker kicks it: he aims it for the call's target (`KickDef.aim`), reading the wind only as
 * well as his accuracy lets him, then stops the timing meter where his accuracy puts the needle. The
 * kick's own error (`applyKickError`), the shank, the rush and the wind do the rest inside `KickPlay`.
 * Field goals and extra points stay the user's (drag and meter).
 */

/**
 * The CPU kicker:
 * - `timing`: the spread of where he stops the needle (-1 early .. 1 late): `base` plus `perKac` a point of
 *   accuracy under 100. A 75 misses the green about a quarter of the time, a 90 one in ten.
 * - `powerSd`, `aimSd`: his intent's spread (the kick's own error by accuracy comes on top).
 * - `windRead`: the share of the wind he plays for: `base` plus `perKac` a point of accuracy.
 * - `puntHold`: seconds from the catch to his drop (with the meter's get-off, a 2.0 s operation).
 * - `maxSecs`: the longest a kick is played headlessly.
 */
export const CPU_KICK = {
  timing: { base: 0.08, perKac: 0.004 },
  powerSd: 0.025,
  aimSd: 0.02,
  windRead: { base: 0.3, perKac: 0.006 },
  puntHold: 0.65,
  maxSecs: 25,
};

/** Where the aim's `side` puts the ball across the field: the numbers, and the sideline (just out, for the coffin corner). */
const NUMBERS = 14;
const CORNER_NUMBERS = 14;
const SIDELINE_OUT = -1.5;

/** Which side of the field a directional kick goes to: the short side of the ball, a coin flip from the middle. */
function shortSide(ballY: number, rng: Rng): number {
  if (Math.abs(ballY - FIELD_W / 2) < 1) return rng() < 0.5 ? -1 : 1;
  return ballY < FIELD_W / 2 ? -1 : 1;
}

/** Where the ball will leave the foot: a rugby punter rolls out first. */
function launchFrom(kp: KickPlay): Vec3 {
  const from = kp.kickFrom();
  if (kp.def.rollout) {
    const t = PUNT_GETOFF + RUGBY.extra;
    return { ...from, x: from.x + RUGBY.rollUp * t * 0.8, y: clamp(from.y + kp.rollSide * RUGBY.rollSpeed * t * 0.8, 2, FIELD_W - 2) };
  }
  return from;
}

/**
 * The kick the kicker means to make for this call (before his error). `side` (-1/+1) overrides the
 * directional side. Deterministic but for `rng`'s side pick and intent spread.
 */
export function kickParams(kp: KickPlay, wind: Wind, rng: Rng, opts: { side?: number; exact?: boolean } = {}): KickParams {
  const d = kp.def;
  const aim = d.aim ?? { land: 'max' as const, side: 'mid' as const };
  const from = launchFrom(kp);
  const k = kp.kicker.r;
  const read = clamp(CPU_KICK.windRead.base + CPU_KICK.windRead.perKac * k.kac, 0, 1);
  const seen: Wind = { mph: wind.mph * read, dir: wind.dir };
  const tee = footBoost(d.unit);
  const cap = aim.cap ?? 1;

  let ty = FIELD_W / 2;
  if (d.onside) ty = FIELD_W / 2 + 11 * ONSIDE_SIDE;
  else if (aim.side !== 'mid') {
    const side = opts.side ?? (d.unit === 'kickoff' ? (rng() < 0.5 ? -1 : 1) : shortSide(kp.ballY, rng));
    const off = aim.side === 'sideline' ? SIDELINE_OUT : d.unit === 'kickoff' ? CORNER_NUMBERS : NUMBERS;
    ty = side < 0 ? off : FIELD_W - off;
  }
  const params = (power: number, tx: number): KickParams => {
    const a = Math.atan2(ty - from.y, Math.max(5, tx - from.x));
    return { power, dir: { x: Math.cos(a), y: Math.sin(a) }, loft: d.loft };
  };
  const landX = (p: KickParams) => predictKick(from, p, k.kpw, seen, d.bounce, tee).land.x;

  let power = cap;
  let tx: number;
  if (aim.land === 'max') {
    tx = from.x + 50;
    for (let i = 0; i < 2; i++) tx = landX(params(cap, tx));
  } else {
    tx = 'goal' in aim.land ? OPP_GOAL - aim.land.goal : kp.los + aim.land.short;
    // Bisect the power for the landing spot; a leg that can't get there gives all it has.
    let lo = 0.05;
    let hi = cap;
    if (landX(params(hi, tx)) < tx) {
      // Out of his range: all he has, aimed where it will come down (a coffin corner from deep goes out there).
      power = hi;
      for (let i = 0; i < 2; i++) tx = landX(params(hi, tx));
    } else {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (landX(params(mid, tx)) < tx) lo = mid;
        else hi = mid;
      }
      power = (lo + hi) / 2;
    }
  }
  const p = params(power, tx);
  if (opts.exact) return p;
  const a = Math.atan2(p.dir.y, p.dir.x) + gauss(rng) * CPU_KICK.aimSd;
  return { power: clamp(p.power + gauss(rng) * CPU_KICK.powerSd, 0.05, cap), dir: { x: Math.cos(a), y: Math.sin(a) }, loft: p.loft };
}

/** Where he stops the needle: -1 early .. 1 late, by his accuracy. */
export function cpuTiming(kac: number, rng: Rng): number {
  return clamp(gauss(rng) * (CPU_KICK.timing.base + CPU_KICK.timing.perKac * (100 - kac)), -1, 1);
}

/**
 * Drives one punt or kickoff in a `KickPlay`: `start()` snaps the punt or sends the kicker at the ball;
 * call `step()` before each `kp.update` (it releases the punt once the punter has it and stops the meter).
 */
export class CpuKicker {
  private readonly timing: number;
  private released = false;
  private setAt: number | null = null;
  started = false;

  constructor(readonly kp: KickPlay, private readonly wind: Wind, private readonly rng: Rng, private readonly side?: number) {
    this.timing = cpuTiming(kp.kicker.r.kac, rng);
  }

  private params(): KickParams {
    return kickParams(this.kp, this.wind, this.rng, this.side === undefined ? {} : { side: this.side });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.kp.unit === 'punt') this.kp.snap();
    else {
      this.kp.release(this.params());
      this.released = true;
    }
  }

  step(): void {
    const kp = this.kp;
    if (!this.started) return;
    if (!this.released && kp.phase === 'set') {
      this.setAt ??= kp.time;
      // A rugby punter starts his rollout at once: the roll is his operation time.
      if (kp.def.rollout || kp.time - this.setAt >= CPU_KICK.puntHold) {
        kp.release(this.params());
        this.released = true;
      }
    }
    if (kp.meter()?.live && kp.time >= kp.strikeAt! + this.timing * METER_HALF) kp.pressTiming();
  }
}

// ---------------------------------------------------------------- the calls

/** What a special-teams coach weighs: the score and clock from the kicking team's side, the field, the kicker, the wind, the other side. */
export interface KickContext {
  /** The kicking team's points minus the receivers'. */
  lead: number;
  secsLeft: number;
  finalHalf: boolean;
  /** Punts: yards from the kicking team's own goal, and to go on 4th down. */
  yard?: number;
  toGo?: number;
  kpw: number;
  kac: number;
  /** The receivers' best returner (`returnRating`). */
  returner: number;
  /** Wind along the kick, mph: + at the kicker's back, - in his face. */
  along: number;
  /** The receivers' look, when the kicking team sees it before the call. */
  ret?: ReturnScheme;
  /** Onside kicks the kicking team has already tried this game: the receivers stay alert for another. */
  onsides?: number;
}

/**
 * The CPU special-teams coach's calls.
 * - Kickoffs: `onsideDown`/`onsideSecs`: onside when trailing by this many or less with this little left in
 *   the game; `surprise`: a surprise onside any other time; `squibSecs`: squib it with this little left in a
 *   half, or when ahead with `protectSecs` left in the game; `deepLeg`: kick deep when the leg plus the
 *   tailwind (`tailPerMph` a mph) gets here; `danger`: a returner this good gets the corner or the squib.
 * - Punts: `plusYard`: pin it from here in (coffin with `coffinKac`, else pooch); `headwind`: line drive into
 *   this much wind; `rugbyToGo`, `rugbyFake`: the rugby punt with the run option on a short 4th near midfield;
 *   `directional`: the share of directional punts against an ordinary returner.
 * - Receiving: `blockLate`: block a punt when behind with this little left; `blockShare`, `blockLateShare`;
 *   `safeToGo`, `safeShare`: the safe look when a fake is live; `handsDown`, `handsSecs`: the hands team;
 *   `handsAlert`: the share of kickoffs the hands team stays in for after each onside try this game (to `handsMax`).
 */
export const CPU_KICK_CALL = {
  onsideDown: 16, onsideSecs: 240, surprise: 0.012, squibSecs: 20, protectSecs: 90, deepLeg: 80, tailPerMph: 1.2, danger: 82,
  plusYard: 60, coffinKac: 82, headwind: 9, rugbyToGo: 3, rugbyFake: 0.3, directional: 0.15,
  blockLate: 300, blockShare: 0.1, blockLateShare: 0.5, safeToGo: 3, safeShare: 0.4, handsDown: 16, handsSecs: 300, handsAlert: 0.4, handsMax: 0.85,
};

export function kickoffCall(c: KickContext, rng: Rng): string {
  const C = CPU_KICK_CALL;
  const behind = -c.lead;
  if (c.finalHalf && behind > 0 && behind <= C.onsideDown && c.secsLeft <= C.onsideSecs) return 'ko-onside';
  if (c.ret !== 'hands' && rng() < C.surprise) return 'ko-onside';
  if (c.secsLeft <= C.squibSecs || (c.finalHalf && c.lead > 0 && c.secsLeft <= C.protectSecs)) return 'ko-squib';
  if (c.kpw + Math.max(0, c.along) * C.tailPerMph >= C.deepLeg) return 'ko-deep';
  if (c.returner >= C.danger) return rng() < 0.6 ? 'ko-corner' : 'ko-squib';
  return rng() < 0.4 ? 'ko-corner' : 'ko-deep';
}

export function puntCall(c: KickContext, rng: Rng): string {
  const C = CPU_KICK_CALL;
  const yard = c.yard ?? 30;
  if (yard >= C.plusYard) return c.kac >= C.coffinKac ? 'coffin' : 'pooch';
  if (c.ret === 'block') return 'rugby';
  if (c.along <= -C.headwind) return 'line-drive';
  if ((c.toGo ?? 10) <= C.rugbyToGo && yard >= 35 && c.ret !== 'safe' && rng() < C.rugbyFake) return 'rugby';
  if (c.returner >= C.danger) return 'directional';
  return rng() < C.directional ? 'directional' : 'punt';
}

/** The receivers' look, from the kicking team's situation (`lead` is the kicking team's). */
export function returnCall(unit: 'punt' | 'kickoff', c: KickContext, rng: Rng): ReturnScheme {
  const C = CPU_KICK_CALL;
  if (unit === 'kickoff') {
    const behind = -c.lead;
    if (c.finalHalf && behind > 0 && behind <= C.handsDown && c.secsLeft <= C.handsSecs) return 'hands';
    return rng() < Math.min(C.handsMax, (c.onsides ?? 0) * C.handsAlert) ? 'hands' : 'return';
  }
  const yard = c.yard ?? 30;
  if ((c.toGo ?? 10) <= C.safeToGo && yard >= 35 && yard <= 65 && rng() < C.safeShare) return 'safe';
  const late = c.finalHalf && c.lead > 0 && c.secsLeft <= C.blockLate;
  return rng() < (late ? C.blockLateShare : C.blockShare) ? 'block' : 'return';
}

/** Wind along the kick (+x is the kicking team's way), mph. */
export function windAlong(w: Wind): number {
  return w.mph * w.dir.x;
}

// ---------------------------------------------------------------- the forecast

export interface KickForecast {
  /** Median yards from the receivers' goal where it comes down (negative: in the end zone). */
  land: number;
  hang: number;
  /**
   * Shares: a touchback, out of bounds, inside the 20 (punts). A kickoff is a touchback when it comes down in
   * the end zone (one that rolls there is fielded); a punt also when it rolls in.
   */
  tb: number;
  oob: number;
  in20: number;
}

/**
 * The call card's forecast: the kicker's aim for this call, then `n` kicks with his timing, error and
 * shanks in the live wind, ball flight only (no returns, no rush).
 */
export function forecast(kp: KickPlay, wind: Wind, rng: Rng, n = 30): KickForecast {
  const d: KickDef = kp.def;
  const k = kp.kicker.r;
  const from = launchFrom(kp);
  const lands: number[] = [];
  let hang = 0;
  let tb = 0;
  let oob = 0;
  let in20 = 0;
  for (let i = 0; i < n; i++) {
    let p = applyKickError(applyMistime(kickParams(kp, wind, rng), cpuTiming(k.kac, rng), k.kac), k.kac, 0, rng);
    if (rng() < shankOdds(k.kac, 0, wind.mph)) p = applyShank(p, rng);
    const pr = predictKick(from, p, k.kpw, wind, d.bounce, footBoost(d.unit));
    lands.push(OPP_GOAL - pr.land.x);
    hang += pr.hang;
    const end = pr.rest;
    const out = pr.pts.some((q) => (q.y < 0 || q.y > FIELD_W) && q.x < OPP_GOAL);
    if (out) oob++;
    else if (pr.land.x >= OPP_GOAL || (d.unit === 'punt' && end.x >= OPP_GOAL)) tb++;
    else if (d.unit === 'punt' && pr.land.x >= OPP_GOAL - 20) in20++;
  }
  lands.sort((a, b) => a - b);
  return { land: lands[Math.floor(n / 2)], hang: hang / n, tb: tb / n, oob: oob / n, in20: in20 / n };
}
