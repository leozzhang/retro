import {
  FG_BLOCK, FG_UNIT, HOLD_DEPTH, KICKOFF_RETURN, KICKOFF_UNIT, PUNT_RETURN, PUNT_UNIT,
  type KickDef, type KickUnit, type StSpot,
} from '../data/specialTeams';
import { templateValue } from '../data/athletes';
import { SLOT_POS } from '../data/positions';
import type { RosterPlayer, Team } from '../data/teams';
import { FIELD_LEN, FIELD_W, OPP_GOAL, OWN_GOAL, PPY_X, PPY_Y } from '../engine/constants';
import { VIEW_YARDS } from '../engine/camera';
import type { Input } from '../engine/input';
import { add, clamp, dist, lerp, norm, scale, sub, type Rng, type Vec, type Vec3 } from '../engine/math';
import { teamUniform } from '../render/sprites';
import { pursue, returnerAI } from '../sim/ai';
import { launch, makeBall, updateFlight, type Ball } from '../sim/ball';
import { anchorBlockers, formEngagements, release, updateEngagements } from '../sim/blocking';
import {
  applyKickError, applyMistime, fgCheck, fgDistance, kickErrorSd, launchKick, METER_HALF, mistimeAngle, predictKick, stepKick,
  timingGreen,
  type FgResult, type KickFlight, type KickParams, type KickPrediction, type Wind,
} from '../sim/kicking';
import { knockDown, makePlayer, maxSpeed, seek, seekTimed, setPose, stepPlayer, tickTimers, type Player } from '../sim/player';
import { MIN_DRAG_PX, type Aim } from '../sim/passing';
import { returnTackleChance, TACKLE_RANGE } from '../sim/tackling';
import type { Popup } from './playState';
import { fieldLabel, type KickOutcome, type KickResult } from './rules';

export type KickPhase = 'presnap' | 'snap' | 'set' | 'approach' | 'flight' | 'loose' | 'return' | 'over';

export interface KickSetup {
  kickTeam: Team;
  recvTeam: Team;
  kickRoster: Record<string, RosterPlayer>;
  recvRoster: Record<string, RosterPlayer>;
  def: KickDef;
  /** Line of scrimmage, or the kick line for a kickoff. */
  los: number;
  ballY: number;
  wind: Wind;
  rng: Rng;
}

/** Drag length (screen px) for a full-power kick. */
export const KICK_DRAG_PX = 110;
/** Loft change per second holding W/S, and per wheel notch (degrees). */
const LOFT_RATE = 24;
const WHEEL_STEP = 2;
const SNAP_SPEED = 19;
/** Seconds from the punter's drop to foot on ball, when the timing is perfect (the needle starts moving at the drop). */
export const PUNT_GETOFF = METER_HALF;
/** Seconds from the FG/XP release to the ideal strike: the snap (about 0.37 s) plus the kicker's steps into the hold. */
export const FG_STRIKE = 0.9;
/** A rusher this close to the punter (or holder) with the ball still on him blocks the kick. */
const BLOCK_REACH = 1.0;
/** Base chance a field goal gets blocked even when the protection holds (a low kick, a penetrating tackle). */
const FG_BLOCK_BASE = 0.007;
/** Returner calls a fair catch if a cover man is this close as the ball comes down. */
const FAIR_CATCH_RANGE: Record<'punt' | 'kickoff', number> = { punt: 7, kickoff: 11 };
/** Base chance a returner muffs a catch, before hands and traffic. */
const MUFF: Record<'punt' | 'kickoff', number> = { punt: 0.018, kickoff: 0.008 };
/** Tackle odds multiplier for a cover man still engaged with a blocker. */
const ARM_TACKLE = 0.5;
/**
 * Return blockers' edge over cover men: return units are built from defenders
 * with poor blocking ratings, who'd otherwise lose every block at once.
 */
const RETURN_BLOCK_EDGE = 15;
/**
 * Diving tackle: a cover man within this range lunges (lower odds; a miss
 * leaves him on the turf). Without it an AI returner can stay just out of
 * reach of same-speed pursuers all the way to the end zone.
 */
const DIVE_RANGE = 2.2;
const DIVE_ODDS = 0.45;
/**
 * Share of the speed gap between the two units that survives on punts and kickoffs. Each side is
 * measured against its positions' templates, then both are moved toward each other, so players keep
 * their order within the unit and an elite returner keeps his own edge. Without it a slow coverage
 * unit (a weak program's offensive starters) gave up a TD on 8% of returns to a top program.
 */
const ST_SPEED_GAP = 0.5;
/** Returner's top speed with the ball, as a fraction of his max (carrying it and setting up cuts). */
const RETURN_SPEED = 0.95;

const ZERO: Vec = { x: 0, y: 0 };

export class KickPlay {
  readonly kick: Player[] = [];
  readonly recv: Player[] = [];
  readonly players: Player[];
  readonly kicker: Player;
  readonly holder: Player | null;
  readonly center: Player | null;
  readonly def: KickDef;
  readonly unit: KickUnit;
  readonly los: number;
  readonly ballY: number;
  readonly wind: Wind;
  private readonly recvTeam: string;
  readonly ball: Ball;
  /** Hold spot (FG/XP) or tee (kickoff). On punts it follows the punter. */
  kickSpot: Vec3;
  private readonly rng: Rng;

  phase: KickPhase = 'presnap';
  time = 0;
  snapTime = 0;
  releaseTime = 0;
  kickTime = 0;
  overTime = 0;
  aim: Aim | null = null;
  /** Timing meter: when the foot should meet the ball (the green's center), or null before the swing starts. */
  strikeAt: number | null = null;
  /** Where the user stopped the needle (-1 early .. +1 late), or null until then. */
  timing: number | null = null;
  loft: number;
  /** Kick the user released, waiting for the snap / approach to finish. */
  private queued: KickParams | null = null;
  flight: KickFlight | null = null;
  /** The receivers' read of where the kick is going (and the full flight path, for the goal cam). */
  pred: KickPrediction | null = null;
  carrier: Player | null = null;
  readonly controlled: Player | null = null;
  catcher: Player | null = null;
  fairCatch = false;
  private letItGo = false;
  /** Receiving team has touched the kick (starts the clock on kickoffs; a muff makes it a live ball). */
  touched = false;
  private muffed = false;
  private blockedKick = false;
  fg: FgResult | null = null;
  outcome: KickOutcome | null = null;
  private pending: KickOutcome | null = null;
  private endAt = Infinity;
  popups: Popup[] = [];
  /** Where the receiver caught it, for return yardage. */
  private catchX = 0;
  /** Tackles the returner has broken so far (each makes the next one likelier to hold). */
  private broken = 0;

  constructor(s: KickSetup) {
    this.def = s.def;
    this.unit = s.def.unit;
    this.los = s.los;
    this.ballY = s.ballY;
    this.wind = s.wind;
    this.rng = s.rng;
    this.loft = s.def.loft;
    this.recvTeam = s.recvTeam.abbr;

    const [kickUnit, recvUnit] =
      this.unit === 'punt' ? [PUNT_UNIT, PUNT_RETURN] : this.unit === 'kickoff' ? [KICKOFF_UNIT, KICKOFF_RETURN] : [FG_UNIT, FG_BLOCK];
    const place = (sp: StSpot) => ({
      x: Math.min(s.los + sp.dx, FIELD_LEN - 0.5),
      y: clamp(sp.mode === 'abs' ? sp.y : s.ballY + sp.y, 1, FIELD_W - 1),
    });
    const kU = teamUniform(s.kickTeam, true);
    const rU = teamUniform(s.recvTeam, false);
    for (const sp of kickUnit) {
      const p = makePlayer('off', s.kickRoster[sp.slot], kU, place(sp));
      p.job = sp.job;
      this.kick.push(p);
    }
    for (const sp of recvUnit) {
      const p = makePlayer('def', s.recvRoster[sp.slot], rU, place(sp));
      p.job = sp.job;
      this.recv.push(p);
    }
    if (this.unit === 'punt' || this.unit === 'kickoff') this.squeezeSpeedGap();
    this.players = [...this.kick, ...this.recv];
    this.kicker = this.kick.find((p) => p.job === 'kicker' || p.job === 'punter')!;
    this.holder = this.kick.find((p) => p.job === 'holder') ?? null;
    this.center = this.kick.find((p) => p.slot === 'C') ?? null;

    this.ball = makeBall(s.los, s.ballY);
    if (this.unit === 'kickoff') {
      this.kickSpot = { x: s.los, y: s.ballY, z: 0.15 };
      this.ball.pos = { ...this.kickSpot };
    } else if (this.unit === 'punt') {
      this.kickSpot = { x: this.kicker.pos.x + 0.6, y: this.kicker.pos.y, z: 1.0 };
    } else {
      this.kickSpot = { x: s.los - HOLD_DEPTH, y: s.ballY, z: 0.1 };
    }
    if (this.holder) setPose(this.holder, 'hold', Infinity);
  }

  /** Move both units' speed and acceleration toward each other by `1 - ST_SPEED_GAP` of the gap. */
  private squeezeSpeedGap(): void {
    for (const k of ['spd', 'acc'] as const) {
      const level = (ps: Player[]) => ps.reduce((a, p) => a + p.r[k] - templateValue(SLOT_POS[p.slot], k, 75), 0) / ps.length;
      const shift = ((level(this.recv) - level(this.kick)) * (1 - ST_SPEED_GAP)) / 2;
      for (const p of this.kick) p.r = { ...p.r, [k]: clamp(p.r[k] + shift, 0, 99) };
      for (const p of this.recv) p.r = { ...p.r, [k]: clamp(p.r[k] - shift, 0, 99) };
    }
  }

  // ------------------------------------------------------------ control

  /** The user can be dragging a kick right now. */
  canAim(): boolean {
    if (this.unit === 'punt') return this.phase === 'snap' || this.phase === 'set';
    return this.phase === 'presnap';
  }

  /** Space / click on a punt. FG and kickoffs start from the aim release. */
  snap(): void {
    if (this.phase !== 'presnap' || this.unit === 'kickoff') return;
    this.phase = 'snap';
    this.snapTime = this.time;
    const c = this.center!;
    const tgt = this.unit === 'punt' ? this.kicker : this.holder!;
    const from = { x: c.pos.x + 0.3, y: c.pos.y, z: 0.4 };
    const to = { x: tgt.pos.x + 0.3, y: tgt.pos.y, z: this.unit === 'punt' ? 1.2 : 0.6 };
    launch(this.ball, from, to, dist(from, to) / SNAP_SPEED, 0.3, 'snap');
    if (this.unit === 'fg' || this.unit === 'xp') this.assignFgProtection();
  }

  /**
   * FG/XP protection is gap-sound: each rusher gets his own blocker, matched by
   * how close they line up across the line, so no rusher walks through an
   * unblocked gap while two blockers double his neighbor. The spare blocker
   * picks up whoever comes free.
   */
  private assignFgProtection(): void {
    const blockers = this.kick.filter((o) => o.job === 'protect');
    const rushers = this.recv.filter((d) => d.job === 'rush');
    const pairs: [Player, Player, number][] = [];
    for (const b of blockers) for (const d of rushers) pairs.push([b, d, Math.abs(b.pos.y - d.pos.y)]);
    pairs.sort((x, y) => x[2] - y[2]);
    for (const b of blockers) b.mark = null;
    const taken = new Set<Player>();
    for (const [b, d] of pairs) {
      if (b.mark || taken.has(d)) continue;
      b.mark = d;
      taken.add(d);
    }
  }

  private updateAim(input: Input, dt: number): void {
    const ax = input.axis();
    const [lo, hi] = this.def.loftRange;
    this.loft = clamp(this.loft - ax.y * LOFT_RATE * dt - input.mouse.wheel * WHEEL_STEP, lo, hi);
    const m = input.mouse;
    if (!this.aim && m.pressed) this.aim = { start: { x: m.downX, y: m.downY }, cur: { x: m.x, y: m.y } };
    if (!this.aim) return;
    this.aim.cur = { x: m.x, y: m.y };
    if (m.released || !m.down) {
      const p = this.aimParams();
      this.aim = null;
      if (p) this.release(p);
    }
  }

  /** Kick the current drag would make (no error), or null if it's too short or pointed backward. */
  aimParams(): KickParams | null {
    if (!this.aim) return null;
    const px = this.aim.start.x - this.aim.cur.x;
    const py = this.aim.start.y - this.aim.cur.y;
    if (Math.hypot(px, py) < MIN_DRAG_PX) return null;
    const wx = px / PPY_X;
    const wy = py / PPY_Y;
    if (wx <= 0.05) return null;
    const maxA = this.unit === 'fg' || this.unit === 'xp' ? 0.35 : 0.9;
    const ang = clamp(Math.atan2(wy, wx), -maxA, maxA);
    return { power: clamp(Math.hypot(px, py) / KICK_DRAG_PX, 0, 1), dir: { x: Math.cos(ang), y: Math.sin(ang) }, loft: this.loft };
  }

  /** Aim preview: the flight with no wind and no error, from where the ball will be kicked. */
  preview(): { params: KickParams; pred: KickPrediction; sd: { dir: number; power: number } } | null {
    const params = this.aimParams();
    if (!params) return null;
    const pred = predictKick(this.kickFrom(), params, this.kicker.r.kpw, { mph: 0, dir: ZERO }, this.def.bounce, this.unit === 'kickoff');
    const sd = kickErrorSd(this.kicker.r.kac, this.unit === 'punt' ? this.pressure() : 0);
    return { params, pred, sd };
  }

  private kickFrom(): Vec3 {
    if (this.unit === 'punt') return { x: this.kicker.pos.x + 0.6, y: this.kicker.pos.y, z: 1.0 };
    return { ...this.kickSpot };
  }

  /** Kick with `p` (the user's drag, or a replay's CPU kicker). */
  release(p: KickParams): void {
    this.queued = p;
    this.releaseTime = this.time;
    if (this.unit === 'fg' || this.unit === 'xp') {
      this.snap();
      this.strikeAt = this.time + FG_STRIKE;
    } else if (this.unit === 'kickoff') {
      this.phase = 'approach';
      const runUp = dist(this.kicker.pos, this.kickoffSpot()) / (maxSpeed(this.kicker) * 0.85);
      this.strikeAt = this.time + Math.max(0.6, runUp);
    } else if (this.phase === 'set') {
      this.startPuntSwing();
    }
  }

  private startPuntSwing(): void {
    this.phase = 'approach';
    this.releaseTime = this.time;
    this.strikeAt = this.time + PUNT_GETOFF;
    setPose(this.kicker, 'puntDrop', Infinity);
  }

  /** The timing meter for the HUD: needle position `e` (-1..1), green half-width, and whether it's still waiting for Space. */
  meter(): { e: number; green: number; live: boolean; moving: boolean } | null {
    if (this.strikeAt === null || this.flight || this.blockedKick) return null;
    const e = this.timing ?? clamp((this.time - this.strikeAt) / METER_HALF, -1, 1);
    return { e, green: timingGreen(this.kicker.r.kac), live: this.timing === null, moving: this.time >= this.strikeAt - METER_HALF };
  }

  /** Space: stop the needle. Ignored before it starts moving and after the first press. */
  pressTiming(): void {
    if (this.strikeAt === null || this.timing !== null || !this.queued) return;
    if (this.time < this.strikeAt - METER_HALF) return;
    this.timing = clamp((this.time - this.strikeAt) / METER_HALF, -1, 1);
  }

  /** Foot on ball: the needle is stopped (or ran out) and the kicker is at the ball. */
  private readyToStrike(arrived: boolean): boolean {
    if (this.strikeAt === null || this.timing === null) return false;
    return arrived || this.time >= this.strikeAt + METER_HALF;
  }

  /** 0..1: how close the nearest free rusher is to the punter. */
  pressure(): number {
    let nearest = Infinity;
    for (const d of this.recv) {
      if (!d.down && !d.engagedBy.length) nearest = Math.min(nearest, dist(d.pos, this.kicker.pos));
    }
    return clamp((5 - nearest) / 5, 0, 1);
  }

  // ------------------------------------------------------------ step

  update(dt: number, input: Input): void {
    this.time += dt;
    for (const p of this.players) tickTimers(p, dt);
    if (this.canAim()) this.updateAim(input, dt);
    if (this.strikeAt !== null && this.timing === null && this.queued) {
      if (input.hit('Space')) this.pressTiming();
      // Never pressed: the needle runs off the end, a full late push.
      if (this.timing === null && this.time >= this.strikeAt + METER_HALF) this.timing = 1;
    }

    switch (this.phase) {
      case 'snap':
        if (updateFlight(this.ball, dt)) this.snapArrived();
        break;
      case 'set':
        if (this.unit === 'fg' || this.unit === 'xp') this.fgApproach();
        break;
      case 'approach':
        if (this.unit === 'kickoff') this.kickoffApproach();
        else if (this.readyToStrike(this.time >= this.strikeAt!)) this.kickNow();
        break;
      case 'flight':
      case 'loose':
        this.stepBall(dt);
        break;
      case 'over':
        this.overTime += dt;
        // Let a field goal finish its flight through (or past) the posts.
        if ((this.unit === 'fg' || this.unit === 'xp') && this.flight && this.flight.mode !== 'rest') this.stepBall(dt);
        break;
      default:
        break;
    }
    if (this.pending && this.time >= this.endAt) this.end(this.pending);

    for (const p of this.players) this.think(p);
    this.blocking(dt);
    for (const p of this.players) stepPlayer(p, dt);
    this.anchor();
    this.formBlocks();

    if (this.carrier && this.ball.state === 'held') {
      const c = this.carrier;
      this.ball.pos = { x: c.pos.x + c.facing * 0.25, y: c.pos.y + 0.05, z: c.down ? 0.2 : 1.1 };
    }
    if (this.unit === 'punt' && (this.phase === 'set' || this.phase === 'approach')) {
      this.ball.pos = { x: this.kicker.pos.x + 0.35, y: this.kicker.pos.y + 0.05, z: 1.1 };
      this.checkPuntBlock();
    }
    if (this.phase === 'return') this.checkReturn();

    for (const pp of this.popups) pp.t += dt;
    this.popups = this.popups.filter((pp) => pp.t < 1.4);
  }

  private snapArrived(): void {
    this.phase = 'set';
    if (this.unit === 'punt') {
      this.ball.state = 'held';
      this.ball.carrier = this.kicker;
      setPose(this.kicker, 'catch', 0.2);
      if (this.queued) this.startPuntSwing();
    } else {
      this.ball.state = 'dead';
      this.ball.pos = { ...this.kickSpot };
    }
  }

  /** Kicker's steps into the hold, paced to reach it as the needle crosses the green; he strikes once Space is hit. */
  private fgApproach(): void {
    const k = this.kicker;
    const spot = { x: this.kickSpot.x - 0.45, y: this.kickSpot.y - 0.3 };
    k.want = seekTimed(k, spot, this.strikeAt! - this.time);
    if (this.readyToStrike(dist(k.pos, spot) < 0.3)) this.kickNow();
  }

  /** Where the kicker plants beside the tee. */
  private kickoffSpot(): Vec {
    return { x: this.kickSpot.x - 0.4, y: this.kickSpot.y - 0.25 };
  }

  private kickoffApproach(): void {
    const k = this.kicker;
    const spot = this.kickoffSpot();
    k.want = seekTimed(k, spot, this.strikeAt! - this.time);
    if (this.readyToStrike(dist(k.pos, spot) < 0.3)) this.kickNow();
  }

  private kickNow(): void {
    const p = this.queued!;
    this.queued = null;
    const k = this.kicker;
    const from = this.kickFrom();
    this.kickSpot = from;
    const pressure = this.unit === 'punt' ? this.pressure() : 0;
    const e = this.timing ?? 0;
    this.timingPopup(e);
    const actual = applyKickError(applyMistime(p, e, k.r.kac), k.r.kac, pressure, this.rng);
    setPose(k, 'kick', 0.45);
    if (this.holder) setPose(this.holder, 'hold', 0.6);
    this.kickTime = this.time;
    this.ball.carrier = null;
    this.ball.state = 'kick';

    if ((this.unit === 'fg' || this.unit === 'xp') && this.rng() < this.fgBlockChance()) {
      this.blockKick(from);
      return;
    }
    this.flight = launchKick(from, actual, k.r.kpw, this.unit === 'kickoff');
    this.phase = 'flight';
    for (const d of this.recv) release(d);
    for (const o of this.kick) release(o);
    if (this.unit === 'fg' || this.unit === 'xp') {
      this.pred = predictKick(from, actual, k.r.kpw, this.wind, this.def.bounce);
      return;
    }
    // Receivers read the ball (wind included) and pick who fields it.
    this.pred = predictKick(from, actual, k.r.kpw, this.wind, this.def.bounce, this.unit === 'kickoff');
    const land = this.pred.land;
    let best: Player | null = null;
    let bs = Infinity;
    for (const r of this.recv) {
      if (r.job === 'rush' || r.job === 'hold' || r.job === 'jam') continue;
      const s = dist(r.pos, land) - (r.job === 'returner' ? 6 : 0);
      if (s < bs) {
        bs = s;
        best = r;
      }
    }
    this.catcher = best;
    this.letItGo = this.unit === 'punt' && land.x >= OPP_GOAL - 10 && land.x < OPP_GOAL + 12;
  }

  private timingPopup(e: number): void {
    const miss = Math.abs(mistimeAngle(e, this.kicker.r.kac));
    const at = { x: this.kicker.pos.x, y: this.kicker.pos.y - 1 };
    if (!miss) this.popup('PERFECT!', at, '#5cff7a');
    else this.popup(e < 0 ? 'EARLY' : 'LATE', at, miss > 0.06 ? '#ff5a5a' : '#ffd23f');
  }

  private fgBlockChance(): number {
    const yds = fgDistance(this.los, OPP_GOAL);
    return FG_BLOCK_BASE + (yds > 45 ? 0.008 : 0) + (this.unit === 'xp' ? -0.003 : 0);
  }

  /** Blocked kick: it squirts off a hand, low and short. */
  private blockKick(from: Vec3): void {
    this.blockedKick = true;
    const a = Math.PI + (this.rng() - 0.5) * 2.2;
    this.flight = launchKick(from, { power: 0.05 + this.rng() * 0.15, dir: { x: Math.cos(a) * 0.4 + 0.6, y: Math.sin(a) }, loft: 30 }, 60);
    this.phase = 'loose';
    this.popup('BLOCKED!', from, '#ff5a5a');
    for (const d of this.recv) release(d);
  }

  private checkPuntBlock(): void {
    for (const d of this.recv) {
      if (d.down || d.engagedBy.length) continue;
      if (dist(d.pos, this.kicker.pos) < BLOCK_REACH) {
        setPose(d, 'catch', 0.4);
        this.kicker.pose = null; // drops out of the held punt drop
        this.ball.carrier = null;
        this.ball.state = 'kick';
        this.queued = null;
        this.blockKick({ x: this.kicker.pos.x + 0.5, y: this.kicker.pos.y, z: 1.0 });
        return;
      }
    }
  }

  // ------------------------------------------------------------ ball

  private stepBall(dt: number): void {
    const k = this.flight!;
    for (let i = 0; i < 2; i++) {
      const prev = { ...k.pos };
      stepKick(k, dt / 2, this.wind, this.def.bounce, this.rng);
      if ((this.unit === 'fg' || this.unit === 'xp') && !this.blockedKick && !this.fg && this.phase !== 'over') {
        const r = fgCheck(prev, k.pos);
        if (r) this.judgeFg(r);
      }
    }
    this.ball.pos = { ...k.pos };
    if (this.phase === 'over') return;

    if (this.blockedKick) {
      if (k.mode === 'rest' || k.t > 3) this.endBlocked();
      return;
    }
    if (this.unit === 'fg' || this.unit === 'xp') {
      if (!this.fg && (k.landedAt !== null || k.pos.x > FIELD_LEN + 3)) this.judgeFg('short');
      return;
    }

    const out = k.pos.y < 0 || k.pos.y > FIELD_W;
    if (out) {
      if (this.touched) this.endWith('downed', k.pos, 'DOWNED', 'Out of bounds after a touch');
      else this.endWith('oob', k.pos, 'OUT OF BOUNDS', this.unit === 'kickoff' ? `Kickoff out of bounds. ${this.recvAbbr()} ball at the 35` : `Punt out at the ${fieldLabel(k.pos.x)}`);
      return;
    }
    const grounded = k.landedAt !== null;
    if ((grounded && k.pos.x >= OPP_GOAL) || k.pos.x > FIELD_LEN) {
      if (this.muffed) this.endWith('touchback', k.pos, 'TOUCHBACK', 'Loose ball out of the end zone');
      else this.endWith('touchback', k.pos, 'TOUCHBACK', `${this.recvAbbr()} ball at the ${this.unit === 'kickoff' ? 25 : 20}`);
      return;
    }
    if (this.phase === 'flight' && grounded) this.phase = 'loose';

    if (this.phase === 'flight') this.checkCatch();
    else this.checkLooseBall();
  }

  private recvAbbr(): string {
    return this.recvTeam;
  }

  private checkCatch(): void {
    const k = this.flight!;
    const c = this.catcher;
    if (!c || c.down || this.letItGo) return;
    const timeLeft = (this.pred?.hang ?? 0) - (this.time - this.kickTime);
    if (!this.fairCatch && timeLeft < 0.8 && dist(c.pos, this.pred!.land) < 3) {
      let near = Infinity;
      for (const o of this.kick) if (!o.down) near = Math.min(near, dist(o.pos, c.pos));
      const unit = this.unit as 'punt' | 'kickoff';
      const inside25 = this.pred!.land.x > OPP_GOAL - 25;
      if (near < FAIR_CATCH_RANGE[unit] && (unit === 'punt' || inside25)) {
        this.fairCatch = true;
        setPose(c, 'fairCatch', 2);
      }
    }
    if (k.vel.z < 0 && k.pos.z < 2.6 && Math.hypot(c.pos.x - k.pos.x, c.pos.y - k.pos.y) < 1.3) this.field(c, true);
  }

  /** A receiver gets his hands on the ball (`clean` = caught in the air). */
  private field(p: Player, clean: boolean): void {
    const k = this.flight!;
    this.touched = true;
    let near = Infinity;
    for (const o of this.kick) if (!o.down) near = Math.min(near, dist(o.pos, p.pos));
    const unit = this.unit as 'punt' | 'kickoff';
    const muff = MUFF[unit] + (75 - p.r.cth) * 0.001 + (near < 3 ? 0.025 : 0) + (clean ? 0 : 0.03);
    if (!this.muffed && this.rng() < muff) {
      this.muffed = true;
      this.phase = 'loose';
      k.vel = { x: (this.rng() - 0.3) * 4, y: (this.rng() - 0.5) * 5, z: 2.6 };
      k.mode = 'bounce';
      k.landedAt ??= k.t;
      p.stun = 0.5;
      this.popup('MUFFED!', p.pos, '#ffd23f');
      return;
    }
    if (p.pos.x >= OPP_GOAL || (this.fairCatch && clean)) {
      this.carrier = p;
      this.ball.state = 'held';
      this.ball.carrier = p;
    }
    if (p.pos.x >= OPP_GOAL) {
      setPose(p, 'catch', 1);
      this.endWith('touchback', p.pos, 'TOUCHBACK', `Downed in the end zone. ${this.recvAbbr()} ball at the ${unit === 'kickoff' ? 25 : 20}`);
      return;
    }
    if (this.fairCatch && clean) {
      setPose(p, 'catch', 2);
      this.endWith('fairCatch', p.pos, 'FAIR CATCH', `#${p.num} ${p.name} at the ${fieldLabel(p.pos.x)}`);
      return;
    }
    this.carrier = p;
    this.ball.state = 'held';
    this.ball.carrier = p;
    this.catchX = p.pos.x;
    this.phase = 'return';
    setPose(p, 'catch', 0.2);
  }

  private checkLooseBall(): void {
    const k = this.flight!;
    if (k.pos.z > 1.3) return;
    // Kicking team: down a punt (or recover a muff). They leave an untouched kickoff alone.
    if (this.unit === 'punt' || this.touched) {
      for (const o of this.kick) {
        if (o.down || o.stun > 0 || Math.hypot(o.pos.x - k.pos.x, o.pos.y - k.pos.y) > 0.9) continue;
        if (this.muffed) {
          setPose(o, 'catch', 1);
          this.popup('RECOVERED!', o.pos, '#ffd23f');
          this.endWith('recovered', k.pos, 'MUFF RECOVERED!', `#${o.num} ${o.name} falls on it. Your ball`);
        } else {
          this.endWith('downed', k.pos, 'DOWNED', `${this.grossText()}, downed at the ${fieldLabel(k.pos.x)}`);
        }
        return;
      }
    }
    if (!this.letItGo || this.muffed) {
      for (const r of this.recv) {
        if (r.down || r.stun > 0 || Math.hypot(r.pos.x - k.pos.x, r.pos.y - k.pos.y) > 0.8) continue;
        this.field(r, false);
        return;
      }
    }
    if (k.mode === 'rest' && this.unit === 'punt' && !this.muffed) {
      this.endWith('downed', k.pos, 'DEAD BALL', `${this.grossText()}, rolls dead at the ${fieldLabel(k.pos.x)}`);
    }
  }

  private grossText(): string {
    return `${Math.max(0, Math.round((this.flight?.pos.x ?? this.los) - this.los))}-yard punt`;
  }

  private judgeFg(r: FgResult): void {
    const k = this.flight!;
    let good = r === 'good';
    if (r === 'upright') {
      this.popup('DOINK!', k.pos, '#ffd23f');
      good = this.rng() < 0.3;
      k.vel = { x: good ? k.vel.x * 0.3 : -Math.abs(k.vel.x) * 0.3, y: -k.vel.y * 0.6 + (this.rng() - 0.5) * 3, z: k.vel.z * 0.5 };
    }
    this.fg = good ? 'good' : r;
    const yds = fgDistance(this.los, OPP_GOAL);
    const xp = this.unit === 'xp';
    const why = { good: '', upright: 'Off the upright', wideLeft: 'Wide left', wideRight: 'Wide right', short: 'Short' }[r];
    let o: KickOutcome;
    if (good) {
      o = this.outcomeOf(xp ? 'xpGood' : 'fgGood', k.pos, "IT'S GOOD!", xp ? 'Extra point is good' : `${yds}-yard field goal${r === 'upright' ? ' off the upright' : ''}`, '#ffd23f');
      this.popup('GOOD!', k.pos, '#ffd23f');
    } else {
      o = this.outcomeOf(xp ? 'xpMiss' : 'fgMiss', k.pos, 'NO GOOD', `${xp ? 'Extra point' : `${yds}-yard try`}: ${why}`, '#ff5a5a');
    }
    this.pending = o;
    this.endAt = this.time + (r === 'short' ? 0.5 : 0.9);
  }

  private endBlocked(): void {
    const k = this.flight!;
    const spot = k.pos;
    if (this.unit === 'xp') {
      this.endWith('blocked', spot, 'BLOCKED', 'Extra point blocked');
    } else if (spot.x <= OWN_GOAL) {
      this.endWith('returnTd', spot, 'BLOCKED', 'Recovered in the end zone for a touchdown');
    } else {
      this.endWith('blocked', spot, 'BLOCKED', `${this.recvAbbr()} ball at the ${fieldLabel(Math.max(spot.x, OWN_GOAL + 1))}`);
    }
  }

  // ------------------------------------------------------------ return

  private checkReturn(): void {
    const c = this.carrier!;
    if (c.down) return;
    if (c.pos.x <= OWN_GOAL) {
      setPose(c, 'catch', 5);
      this.endWith('returnTd', c.pos, 'RETURN TD', `#${c.num} ${c.name} takes it to the house`);
      return;
    }
    if (c.pos.y < 0 || c.pos.y > FIELD_W) {
      this.endReturn(c, 'Out of bounds');
      return;
    }
    for (const t of this.kick) {
      if (t.down || t.tackleCd > 0 || t.engaged) continue;
      const arm = t.engagedBy.length > 0;
      const d = dist(t.pos, c.pos);
      // Only a man who can't close (trailing at the same speed) lays out.
      const closing = (c.vel.x - t.vel.x) * (c.pos.x - t.pos.x) + (c.vel.y - t.vel.y) * (c.pos.y - t.pos.y) < -0.5 * d;
      if (!arm && !closing && d > TACKLE_RANGE && d < DIVE_RANGE) {
        t.tackleCd = 1.2;
        if (this.rng() < returnTackleChance(t.r.tkl, c.r.elu, c.r.str, this.broken) * DIVE_ODDS) {
          knockDown(c);
          knockDown(t);
          this.endReturn(c, `Diving stop by #${t.num} ${t.name}`);
          return;
        }
        knockDown(t, 0.8);
        continue;
      }
      if (d > (arm ? TACKLE_RANGE * 0.8 : TACKLE_RANGE)) continue;
      if (this.rng() < returnTackleChance(t.r.tkl, c.r.elu, c.r.str, this.broken) * (arm ? ARM_TACKLE : 1)) {
        knockDown(c);
        knockDown(t);
        this.endReturn(c, `Tackled by #${t.num} ${t.name}`);
        return;
      }
      if (arm) {
        t.tackleCd = 1.0;
        continue;
      }
      knockDown(t, 0.9);
      t.tackleCd = 1.6;
      this.broken++;
      c.vel = scale(c.vel, 0.55);
      this.popup('BROKEN TACKLE!', c.pos, '#ff9a5a');
    }
  }

  private endReturn(c: Player, why: string): void {
    const spot = c.pos;
    if (spot.x >= OPP_GOAL) {
      this.endWith('touchback', spot, 'TOUCHBACK', `${why} in the end zone`);
      return;
    }
    const yds = Math.round(this.catchX - spot.x);
    const net = this.unit === 'punt' ? `. Net ${Math.round(spot.x - this.los)}-yard punt` : '';
    this.endWith('returned', spot, `${yds > 0 ? yds : 0}-YARD RETURN`, `${why} at the ${fieldLabel(spot.x)}${net}`);
  }

  // ------------------------------------------------------------ AI

  private think(p: Player): void {
    if (p.down || p.stun > 0 || p.engaged) {
      if (!p.engaged) p.want = ZERO;
      return;
    }
    if (p.engagedBy.length) return; // blocked: the engagement drives him
    if (this.phase === 'over') {
      p.want = scale(p.vel, 0.9);
      return;
    }
    if (p === this.carrier) {
      this.returner(p);
      return;
    }
    if (p === this.kicker && (this.phase === 'presnap' || this.phase === 'snap' || this.phase === 'set' || this.phase === 'approach')) {
      if (this.unit === 'punt') p.want = this.phase === 'approach' ? { x: 2.2, y: 0 } : ZERO;
      else if (this.phase !== 'set' && this.phase !== 'approach') p.want = ZERO;
      return; // FG and kickoff approaches are driven by the phase code
    }
    const preKick = this.phase === 'presnap' || this.phase === 'snap' || this.phase === 'set' || this.phase === 'approach';
    if (p.side === 'off') {
      if (preKick) this.kickingTeamPreKick(p);
      else this.cover(p);
    } else if (preKick) {
      this.receivingTeamPreKick(p);
    } else {
      this.returnTeam(p);
    }
  }

  private kickingTeamPreKick(p: Player): void {
    if (this.phase === 'presnap') {
      p.want = ZERO;
      return;
    }
    if (p.job === 'holder') {
      p.want = ZERO;
      return;
    }
    if (p.job === 'cover') {
      // Kickoff: time the run so nobody crosses the kick line before the ball is kicked.
      const left = Math.max(0.15, (this.strikeAt ?? this.time) - this.time);
      const tgt = { x: this.los - 0.4, y: p.start.y };
      p.want = seek(p, tgt, Math.min(maxSpeed(p), dist(p.pos, tgt) / left), 0.3);
      return;
    }
    if (p.job === 'gunner') {
      p.want = seek(p, { x: p.pos.x + 10, y: p.start.y }, maxSpeed(p));
      return;
    }
    // Protection: take the nearest free rusher, staying between him and the kick point.
    const spot = this.unit === 'punt' ? this.kicker.pos : this.kickSpot;
    if (!p.mark || p.mark.down || p.mark.engagedBy.length >= 2) {
      let best: Player | null = null;
      for (const d of this.recv) {
        if (d.down || (d.job !== 'rush' && d.job !== 'hold') || d.engagedBy.length >= 2) continue;
        if (dist(d.pos, p.pos) > 6) continue;
        if (!best || dist(d.pos, p.pos) < dist(best.pos, p.pos)) best = d;
      }
      p.mark = best;
    }
    if (p.mark) p.want = seek(p, add(p.mark.pos, scale(norm(sub(spot, p.mark.pos)), 0.9)), maxSpeed(p) * 0.95, 0.4);
    else p.want = seek(p, { x: p.start.x - 0.8, y: p.start.y }, maxSpeed(p) * 0.6);
  }

  /** Kicking team after the kick: lanes to the ball, then pursue with contain. */
  private cover(p: Player): void {
    const c = this.carrier;
    const k = this.flight;
    const safety = p.job === 'kicker' || p.job === 'punter' || p.job === 'holder' || p.job === 'safety';
    if (this.unit === 'fg' || this.unit === 'xp') {
      p.want = ZERO;
      return;
    }
    if (c) {
      if (safety && dist(p.pos, c.pos) > 14) {
        p.want = seek(p, { x: c.pos.x - 12, y: lerp(c.pos.y, FIELD_W / 2, 0.3) }, maxSpeed(p) * 0.8);
        return;
      }
      const outside = p.start.y < 8 || p.start.y > FIELD_W - 8 || p.job === 'gunner';
      pursue(p, c);
      if (outside) {
        // Contain: keep outside leverage instead of chasing inside.
        const side = p.start.y < FIELD_W / 2 ? -1 : 1;
        if ((c.pos.y - p.pos.y) * side > -1) p.want = add(p.want, { x: 0, y: side * 1.8 });
      }
      return;
    }
    if (!k) return;
    const land = this.phase === 'loose' ? k.pos : this.pred?.land ?? k.pos;
    if (safety) {
      p.want = seek(p, { x: land.x - 20, y: lerp(p.pos.y, land.y, 0.4) }, maxSpeed(p) * 0.7);
      return;
    }
    // Down a rolling punt (but stay out of the end zone).
    if (this.phase === 'loose' && this.unit === 'punt' && (!this.letItGo || this.muffed || k.mode === 'roll' || k.mode === 'rest')) {
      if (k.pos.x < OPP_GOAL - 1 && this.nearestTo(this.kick, k.pos) === p) {
        p.want = seek(p, k.pos, maxSpeed(p), 0.2);
        return;
      }
    }
    let squeeze = p.job === 'gunner' ? 0.8 : p.job === 'protect' ? 0.5 : 0.3;
    if (this.def.directional) squeeze += 0.25;
    const stop = this.unit === 'kickoff' && !this.touched ? 5 : 3;
    p.want = seek(p, { x: Math.min(land.x - stop, OPP_GOAL - 1), y: lerp(p.start.y, land.y, squeeze) }, maxSpeed(p), 1);
  }

  private nearestTo(list: Player[], at: Vec): Player | null {
    let best: Player | null = null;
    for (const p of list) if (!p.down && (!best || dist(p.pos, at) < dist(best.pos, at))) best = p;
    return best;
  }

  private receivingTeamPreKick(p: Player): void {
    if (this.phase === 'presnap' || this.unit === 'kickoff') {
      p.want = ZERO;
      return;
    }
    const since = this.time - this.snapTime;
    const spot = this.unit === 'punt' ? this.kicker.pos : this.kickSpot;
    switch (p.job) {
      case 'rush':
        p.goal = spot;
        p.want = seek(p, spot, maxSpeed(p) * 0.95, 0.1);
        break;
      case 'hold':
        if (since < 0.7) p.want = seek(p, spot, maxSpeed(p) * 0.9, 0.1);
        else p.want = seek(p, { x: this.los + 8, y: p.start.y }, maxSpeed(p) * 0.8);
        break;
      case 'jam': {
        const g = this.kick.find((o) => o.job === 'gunner' && Math.abs(o.start.y - p.start.y) < 6);
        p.want = g ? seek(p, { x: g.pos.x + 1.2, y: g.pos.y }, maxSpeed(p), 0.3) : ZERO;
        break;
      }
      case 'wall':
        p.want = this.unit === 'punt' ? seek(p, { x: p.start.x + 6, y: p.start.y }, maxSpeed(p) * 0.4) : ZERO;
        break;
      default:
        p.want = ZERO;
    }
  }

  /** Receiving team after the kick: field it, set up the wall, then block for the returner. */
  private returnTeam(p: Player): void {
    const k = this.flight;
    if (!k) return;
    const c = this.carrier;
    if (this.unit === 'fg' || this.unit === 'xp') {
      p.want = ZERO;
      return;
    }
    if (c) {
      this.leadBlock(p, c.pos);
      return;
    }
    const land = this.pred?.land ?? k.pos;
    if (this.phase === 'loose' && (!this.letItGo || this.muffed)) {
      // Loose ball: the nearest man goes to pick it up.
      if (this.nearestTo(this.recv, k.pos) === p) {
        p.want = seek(p, add(k.pos, scale(k.vel, 0.25)), maxSpeed(p), 0.2);
        return;
      }
    }
    if (p === this.catcher) {
      if (this.letItGo) p.want = seek(p, { x: Math.min(land.x - 4, OPP_GOAL - 12), y: p.pos.y }, maxSpeed(p) * 0.6);
      else p.want = seek(p, { x: land.x, y: land.y }, maxSpeed(p), 0.6);
      return;
    }
    // Wall: form up in front of the catch and pick up whoever gets close.
    const threat = this.threatTo(p, land, 7);
    if (threat) {
      p.want = seek(p, add(threat.pos, scale(norm(sub(land, threat.pos)), 0.9)), maxSpeed(p) * 0.95, 0.3);
      return;
    }
    const depth = p.job === 'returner' ? 4 : p.start.x > this.los + 25 ? 9 : 16;
    p.want = seek(p, { x: land.x - depth, y: lerp(p.start.y, land.y, 0.35) }, maxSpeed(p) * 0.9, 1.5);
  }

  /** The cover man closest to `p` who is heading for `at` and not yet blocked. */
  private threatTo(p: Player, at: Vec, range: number): Player | null {
    let best: Player | null = null;
    let bs = Infinity;
    for (const o of this.kick) {
      if (o.down || o.engagedBy.length) continue;
      const dp = dist(o.pos, p.pos);
      if (dp > range) continue;
      const s = dp + dist(o.pos, at) * 0.5;
      if (s < bs) {
        bs = s;
        best = o;
      }
    }
    return best;
  }

  /**
   * Kick returner: hunt for the running lane with the fewest free cover men in
   * front of him (blocked ones count a little), then make the late cut away
   * from whoever is closest.
   */
  private returner(c: Player): void {
    if (c.down) {
      c.want = ZERO;
      return;
    }
    const ahead = this.kick.filter((o) => !o.down && o.pos.x < c.pos.x + 1.5);
    let bestY = c.pos.y;
    let bestS = Infinity;
    for (let y = 3; y <= FIELD_W - 3; y += 2) {
      let s = Math.abs(y - c.pos.y) * 0.06;
      for (const o of ahead) {
        const dx = Math.max(1.5, c.pos.x - o.pos.x);
        const spread = 2 + dx * 0.3;
        const dy = o.pos.y - y;
        s += (Math.exp(-(dy * dy) / (2 * spread * spread)) * (o.engagedBy.length ? 0.25 : 1) * 10) / dx;
      }
      if (s < bestS) {
        bestS = s;
        bestY = y;
      }
    }
    const lane = { x: -1, y: clamp((bestY - c.pos.y) * 0.25, -0.55, 0.55) };
    returnerAI({ off: this.kick, phase: this.phase }, c);
    // Blend the lane choice with the late-cut evasion from returnerAI.
    const near = this.nearestTo(this.kick, c.pos);
    const w = near ? clamp((dist(near.pos, c.pos) - 2) / 5, 0, 1) : 1;
    const dir = norm(add(scale(norm(lane), w), scale(norm(c.want), 1 - w)));
    c.want = scale(dir, maxSpeed(c) * RETURN_SPEED);
  }

  private leadBlock(p: Player, c: Vec): void {
    let best: Player | null = null;
    let bs = Infinity;
    for (const o of this.kick) {
      if (o.down || o.engagedBy.length) continue;
      // One blocker per cover man: leave him to whoever already has him.
      if (this.recv.some((r) => r !== p && r.mark === o && !r.down && r !== this.carrier)) continue;
      // Pick up cover men well before they reach the returner, or the wall just jogs back to him.
      const dc = dist(o.pos, c);
      const dp = dist(o.pos, p.pos);
      if (dc > 26 || dp > 12) continue;
      const s = dp + dc * 0.3;
      if (s < bs) {
        bs = s;
        best = o;
      }
    }
    p.mark = best;
    if (best) p.want = seek(p, add(best.pos, scale(norm(sub(c, best.pos)), 0.8)), maxSpeed(p) * 0.95, 0.3);
    else p.want = seek(p, add(c, { x: -6, y: p.pos.y < c.y ? -3 : 3 }), maxSpeed(p) * 0.85, 1);
  }

  // ------------------------------------------------------------ blocking

  private preKick(): boolean {
    return this.phase === 'snap' || this.phase === 'set' || this.phase === 'approach';
  }

  private formBlocks(): void {
    if (this.phase === 'presnap' || this.phase === 'over') return;
    if (this.preKick()) {
      if (this.unit === 'kickoff') return;
      formEngagements(this.kick.filter((o) => o.job === 'protect'), this.recv, (b, d) => (d.job === 'rush' || d.job === 'hold') && (!b.mark || b.mark === d || b.mark.down));
      formEngagements(this.recv.filter((d) => d.job === 'jam'), this.kick, (_b, o) => o.job === 'gunner');
      return;
    }
    if (this.unit === 'fg' || this.unit === 'xp') return;
    // After the kick only the receiving team blocks; nobody blocks before the ball comes down near them.
    const focus = this.ballFocus();
    if (!focus) return;
    formEngagements(
      this.recv.filter((r) => r !== this.carrier && r !== this.catcher),
      this.kick,
      (_b, o) => dist(o.pos, focus) < 18,
    );
  }

  private blocking(dt: number): void {
    if (this.phase === 'presnap') return;
    const pre = this.preKick();
    const recvGoal = (): Vec => (this.unit === 'punt' ? this.kicker.pos : this.kickSpot);
    const coverGoal = (o: Player): Vec => this.ballFocus() ?? o.pos;
    if (pre) {
      // Rushers vs the shield: blocks hold early and leak the longer the punter holds it.
      updateEngagements(this.recv, recvGoal, this.time, dt, this.rng, { base: 0.18, ramp: 2.2, since: this.snapTime });
      updateEngagements(this.kick, (o) => ({ x: o.pos.x + 10, y: o.pos.y }), this.time, dt, this.rng, { base: 1.6, ramp: 0.3, since: this.snapTime });
    } else {
      updateEngagements(this.kick, coverGoal, this.time, dt, this.rng, {
        base: 0.35, ramp: 1.2, since: this.kickTime, edge: RETURN_BLOCK_EDGE, peel: this.carrier ? 9 : undefined,
      });
    }
  }

  private anchor(): void {
    if (this.preKick()) {
      anchorBlockers(this.recv, () => (this.unit === 'punt' ? this.kicker.pos : this.kickSpot));
      anchorBlockers(this.kick, (o) => ({ x: o.pos.x + 10, y: o.pos.y }));
    } else {
      anchorBlockers(this.kick, (o) => this.ballFocus() ?? o.pos);
    }
  }

  /** Where the cover men are trying to get: the returner, the loose ball, or where the kick will come down. */
  private ballFocus(): Vec | null {
    if (this.carrier) return this.carrier.pos;
    if (this.phase === 'loose' && this.flight) return this.flight.pos;
    return this.pred?.land ?? null;
  }

  // ------------------------------------------------------------ results

  private outcomeOf(result: KickResult, at: Vec, text: string, sub: string, color = '#ffffff'): KickOutcome {
    return { result, unit: this.unit, spot: at.x, spotY: at.y, text, sub, color };
  }

  private endWith(result: KickResult, at: Vec, text: string, sub: string): void {
    const bad = result === 'returnTd' || result === 'blocked';
    const good = result === 'recovered' || result === 'downed' || result === 'touchback' || result === 'oob' && this.unit === 'punt';
    this.end(this.outcomeOf(result, at, text, sub, bad ? '#ff5a5a' : good ? '#9ad7ff' : '#ffffff'));
  }

  private end(o: KickOutcome): void {
    if (this.phase === 'over') return;
    this.outcome = o;
    this.pending = null;
    this.phase = 'over';
    this.overTime = 0;
    this.aim = null;
  }

  private popup(text: string, at: Vec, color: string): void {
    this.popups.push({ text, x: at.x, y: at.y, t: 0, color });
  }

  /** The clock runs on FGs and punts from the snap; on kickoffs only once the receivers touch it. Tries are untimed. */
  clockRunning(): boolean {
    if (this.unit === 'xp' || this.phase === 'presnap' || this.phase === 'over') return false;
    if (this.unit === 'kickoff') return this.touched;
    return true;
  }

  /** World x and screen lead for the camera this frame. */
  focus(): { x: number; lead: number } {
    const k = this.flight;
    switch (this.phase) {
      case 'presnap':
      case 'snap':
      case 'set':
      case 'approach': {
        if (this.unit === 'fg' || this.unit === 'xp') return { x: Math.min(this.kickSpot.x - 4, FIELD_LEN - 50), lead: 0 };
        // Punts: stay on the punter so the rush (and the get-off bar) stay in view while aiming.
        if (this.unit === 'punt') return { x: this.kicker.pos.x - 2, lead: 0.1 };
        const pv = this.aim ? this.preview() : null;
        if (pv) return { x: Math.max(pv.pred.land.x, this.kicker.pos.x + 20), lead: 0.72 };
        return { x: this.los, lead: 0.3 };
      }
      case 'flight':
      case 'loose': {
        // Follow the ball, but never pan back behind where the camera sat for the kick.
        const fg = this.unit === 'fg' || this.unit === 'xp';
        const before = fg ? Math.min(this.kickSpot.x - 4, FIELD_LEN - 50) : this.los - VIEW_YARDS * 0.3;
        const x = k ? k.pos.x : this.ball.pos.x;
        return { x: Math.max(x, before + VIEW_YARDS * 0.35), lead: 0.35 };
      }
      default:
        return { x: this.carrier ? this.carrier.pos.x : this.ball.pos.x, lead: this.carrier ? 0.6 : 0.5 };
    }
  }
}
