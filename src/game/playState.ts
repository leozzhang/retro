import type { DefCall, DefPackage } from '../data/defenses';
import { ROUTES, type PlayDef, type RunScheme } from '../data/plays';
import { passBlockValue } from '../data/ratings';
import { DEF_SLOTS, OFF_SLOTS, type DefSlot, type RosterPlayer, type Team } from '../data/teams';
import type { Camera } from '../engine/camera';
import { FIELD_LEN, FIELD_W, OPP_GOAL, OWN_GOAL } from '../engine/constants';
import type { Input } from '../engine/input';
import { add, clamp, dist, gauss, len, lerp, norm, scale, sub, type Rng, type Vec } from '../engine/math';
import { teamUniform } from '../render/sprites';
import { cutKeep, facingQB, isRusher, returnerAI, seesThrow, thinkDefense, thinkOffense } from '../sim/ai';
import { launch, makeBall, passParams, startBounce, updateBounce, updateFlight, type Ball } from '../sim/ball';
import { HANDOFF_ODDS, PITCH_REACH, pitchOdds, reachScore, resolveCatch } from '../sim/catching';
import {
  accelOf, endurance, isEligible, knockDown, makePlayer, maxSpeed, seek, setPose, stepPlayer, tickTimers, type Player,
} from '../sim/player';
import { aimTarget, MIN_DRAG_PX, throwErrorSd, type Aim } from '../sim/passing';
import {
  ARM_LEVERED, assignRunBlocks, BLOCK_ROLL_SD, DRAW_SET, levered, releaseClimbers, RUN_ENGAGE, runEngagement,
} from '../sim/runBlocking';
import { fallForward, TACKLE_RANGE, tackleChance } from '../sim/tackling';
import { matchDefense } from './matchups';
import { alignY, resolvePlay, type ResolvedPlay } from './resolvePlay';
import { fieldLabel, yardsText, type PlayOutcome } from './rules';

export type Phase = 'presnap' | 'snap' | 'live' | 'air' | 'run' | 'over';

export interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

export interface PlaySetup {
  offTeam: Team;
  defTeam: Team;
  offRoster: Record<string, RosterPlayer>;
  defRoster: Record<string, RosterPlayer>;
  play: PlayDef;
  defCall: DefCall;
  /** Which corners press this snap (part of the pre-snap look). */
  press: Partial<Record<DefSlot, boolean>>;
  los: number;
  ballY: number;
  /** The user mirrored the play at the call. */
  flip?: boolean;
  rng: Rng;
}

const HISTORY_LEN = 60;
/** Handoff reach; farther than this (up to PITCH_RANGE) the QB pitches it. */
export const HANDOFF_RANGE = 1.8;
export const PITCH_RANGE = 8;
const PITCH_SPEED = 13;
/** Tackle odds multiplier for a defender still engaged with a blocker (an arm tackle). */
const ARM_TACKLE = 0.5;
/**
 * Seconds of full sprint from a full bar, from the least to the most enduring player, eased by
 * `endurance` squared: a pocket QB about 1.5 s, a mobile QB about 2.3, a WR about 2.9.
 */
const SPRINT_TIME = { min: 1.15, max: 3.46 };
/** Stamina regained per second off the sprint, least to most enduring. */
const SPRINT_RECOVER = { min: 0.12, max: 0.18 };
/** RB this close to the QB early on a play-action call sells the fake. */
const FAKE_RANGE = 2;
/** Chance the zone-read key crashes on the back; otherwise he stays home on the QB. */
const KEY_CRASH = 0.5;
/** Extra reaction time for a read key who guessed wrong (crashed on a keep, stayed home on a give). */
const KEY_FOOLED = 0.35;
/** Zone read: the QB rides the back this far, so the give stays a handoff longer than on a called run. */
const MESH_REACH = 3.2;
/** Zone read keep: the QB aims for the alley this far outside wherever the read key is. */
const KEEP_WIDTH = 3.5;
/** Zone read: the QB pulls it if the back never reaches the mesh this long after the snap. */
const MESH_TIME = 1.2;
/** Power read: on a keep the QB cuts this far inside the read key, behind the pulling guard. */
const KEEP_INSIDE = 3;
/** Speed option: on a keep (the key took the pitch man) the QB turns up this far inside him. */
const OPTION_CUT = 2.5;
/** Designed QB runs wait this long after the snap for the blocking to form, by scheme (QB power lets the guard get there). */
const QB_RUN_WAIT: Partial<Record<RunScheme, number>> = { gap: 0.35, draw: DRAW_SET };
/** A blocker split out wider than this from the ball is a stalk blocker, not a pass protector. */
export const STALK_SPLIT = 6.5;
/** Screens: the line pass-sets this long, then lets its rushers go and releases to block. */
export const SCREEN_SET = 0.8;
/** Routes that make a receiver the target of a screen (the others stalk-block for him). */
const SCREEN_ROUTES: readonly string[] = ['smoke', 'tunnel', 'screen', 'bubble'];

export type HandoffKind = 'handoff' | 'pitch';

/**
 * Pure handoff legality: the back must still be behind the line. Out of reach of
 * a handoff it's a pitch (or a shovel, if he's ahead of the QB), which needs a
 * yard of cushion behind the line of scrimmage.
 */
export function handoffKind(qb: Vec, rb: Vec, los: number, reach = HANDOFF_RANGE): HandoffKind | null {
  if (rb.x >= los - 0.3) return null;
  const d = dist(qb, rb);
  if (d <= reach) return 'handoff';
  if (d <= PITCH_RANGE && rb.x <= los - 1) return 'pitch';
  return null;
}

export class Play {
  readonly off: Player[] = [];
  readonly def: Player[] = [];
  readonly players: Player[];
  readonly qb: Player;
  readonly center: Player;
  readonly rb: Player;
  /** Where the run is designed to hit (end of the RB's run path); run fits and blocks key on it. Moves on a QB keep. */
  hole: Vec;
  readonly ball: Ball;
  readonly los: number;
  readonly ballY: number;
  readonly playDef: PlayDef;
  /** The play as laid out for this snap (mirroring, personnel, concept routes). */
  readonly resolved: ResolvedPlay;
  readonly defCall: DefCall;
  /** Defensive personnel for this snap, matched to the offense's. */
  readonly defPackage: DefPackage;
  readonly qbDrop: Vec;
  /** Zone read: the backside end, left unblocked for the QB to read. */
  readonly readKey: Player | null = null;
  private readonly rng: Rng;

  phase: Phase = 'presnap';
  time = 0;
  snapTime = 0;
  overTime = 0;
  carrier: Player | null = null;
  /** The player the user is steering (QB pre-throw, ball carrier after a catch). */
  controlled: Player | null = null;
  aim: Aim | null = null;
  ballTarget: Vec | null = null;
  intended: Player | null = null;
  scramble = false;
  thrown = false;
  /** How set (facing the QB, 0..1) the receiver was on the last catch attempt. */
  catchSet = 0;
  outcome: PlayOutcome | null = null;
  popups: Popup[] = [];
  history = new Map<number, Vec[]>();
  /** Ball has been handed or pitched to the RB. */
  handedOff = false;
  /** The ball in the air is a pitch, not a forward pass. */
  pitch = false;
  faked = false;
  /** Zone read: the read key crashes on the back this snap (decided at the snap). */
  keyCrash = false;
  /** Zone read: the back has reached the mesh. */
  private meshed = false;
  /** Zone read: the QB pulled it. */
  kept = false;
  /** Auto-runner: the lane he's committed to (world y). */
  laneY = NaN;
  /** Screens and bubbles: the receiver the others block for. */
  readonly screenTarget: Player | null = null;
  /** Screen: the line has let its rushers go and is releasing. */
  screenReleased = false;

  constructor(s: PlaySetup) {
    this.los = s.los;
    this.ballY = s.ballY;
    this.playDef = s.play;
    const rp = (this.resolved = resolvePlay(s.play, s.ballY, s.flip ?? false));
    this.defCall = s.defCall;
    this.rng = s.rng;

    const offU = teamUniform(s.offTeam, true);
    const defU = teamUniform(s.defTeam, false);
    const bySlot = new Map<string, Player>();

    for (const slot of OFF_SLOTS) {
      const a = rp.align[slot];
      const y = clamp(alignY(a, s.ballY), 1, FIELD_W - 1);
      const p = makePlayer('off', s.offRoster[rp.cast[slot]], offU, { x: s.los + a.dx, y });
      const rn = rp.routes[slot];
      p.routeName = rn ?? null;
      p.isBlocker = p.role === 'OL' || rn === 'block' || !!(rn && ROUTES[rn].lead);
      p.thenBlock = !!(rn && ROUTES[rn].thenBlock);
      p.stalk = p.isBlocker && p.role !== 'OL' && Math.abs(y - s.ballY) > STALK_SPLIT;
      p.routeDelay = (rn && ROUTES[rn].delay) || 0;
      p.delayBlock = !!(rn && ROUTES[rn].delayBlock);
      if (rn && SCREEN_ROUTES.includes(rn) && !this.screenTarget) this.screenTarget = p;
      p.pull = rp.pulls.find((pl) => pl.who === slot)?.job ?? null;
      if (rn && rn !== 'block') this.buildRoute(p, rn);
      this.off.push(p);
      bySlot.set(slot, p);
    }
    this.qb = bySlot.get('QB')!;
    this.center = bySlot.get('C')!;
    this.rb = bySlot.get('RB')!;
    this.qbDrop = { x: this.qb.pos.x - s.play.drop, y: clamp(this.qb.pos.y + rp.dropY, 2, FIELD_W - 2) };
    const rbRoute = rp.routes.RB;
    if (rbRoute === 'paFake') this.buildFake();
    const qbPath = s.play.qbPath;
    this.hole =
      rbRoute && ROUTES[rbRoute].run && this.rb.route.length
        ? { ...this.rb.route[this.rb.route.length - 1] }
        : qbPath
          ? { x: this.los + qbPath[0], y: clamp(this.ballY + qbPath[1] * rp.strongSign, 2, FIELD_W - 2) }
          : { x: this.los + 1.5, y: this.ballY };

    const plan = matchDefense(s.defCall, s.play, rp);
    this.defPackage = plan.pkg;
    for (const slot of DEF_SLOTS) {
      const a = plan.assign[slot];
      const d = makePlayer('def', s.defRoster[plan.cast[slot]], defU, { x: 0, y: 0 });
      d.assign = a;
      d.pos = this.defAlignment(slot, d, bySlot, s.press[slot] ?? false);
      d.start = { ...d.pos };
      this.def.push(d);
    }

    if (s.play.read === 'zoneRead' || s.play.read === 'option') {
      // The read key is the outermost lineman on the backside, away from the hole; on power read
      // and the option it's the playside end.
      const toHole = Math.sign(this.hole.y - this.ballY) || rp.strongSign;
      const side = s.play.read === 'option' || s.play.key === 'play' ? toHole : -toHole;
      const dl = this.def.filter((d) => d.role === 'DL');
      this.readKey = dl.reduce((a, b) => ((b.pos.y - a.pos.y) * side > 0 ? b : a));
    }

    this.players = [...this.off, ...this.def];
    this.ball = makeBall(this.los, this.ballY);
  }

  private buildRoute(p: Player, rn: keyof typeof ROUTES): void {
    const r = ROUTES[rn];
    const side = Math.sign(this.ballY - p.pos.y) || this.resolved.strongSign; // +1 means "inside" is +y
    let prev = p.pos;
    let last = p.pos;
    for (const [dn, ins] of r.pts) {
      const pt = { x: Math.min(p.pos.x + dn, 119), y: clamp(p.pos.y + ins * side, 1, FIELD_W - 1) };
      p.route.push(pt);
      prev = last;
      last = pt;
    }
    if (r.cont && p.route.length) p.routeDir = norm(sub(last, prev));

    // Speed carried through each waypoint, from how sharply the route turns there.
    p.passRoute = !r.run && !r.thenBlock && !r.lead;
    p.settle = p.passRoute && !r.cont && p.route.length > 0;
    p.cutKeep = p.route.map((pt, i) => {
      const next = p.route[i + 1];
      if (!next) return r.cont ? 1 : 0;
      const into = norm(sub(pt, i ? p.route[i - 1] : p.pos));
      const out = norm(sub(next, pt));
      const turn = (Math.acos(clamp(into.x * out.x + into.y * out.y, -1, 1)) * 180) / Math.PI;
      return cutKeep(turn, p.r.rte);
    });
  }

  /**
   * Play-action fake: meet the QB just in front of where he'll be about half a
   * second into his drop, carry out the fake across his face, then protect.
   */
  private buildFake(): void {
    const qb = this.qb.pos;
    const rb = this.rb;
    const drop = sub(this.qbDrop, qb);
    const along = Math.min(1, 2.5 / Math.max(len(drop), 0.01));
    const mesh = { x: qb.x + drop.x * along + 0.9, y: qb.y + drop.y * along };
    const side = rb.pos.y <= mesh.y ? 1 : -1;
    rb.route = [mesh, { x: mesh.x + 0.5, y: clamp(mesh.y + side * 1.0, 1, FIELD_W - 1) }];
    rb.routeDir = null;
  }

  private defAlignment(slot: DefSlot, d: Player, off: Map<string, Player>, press: boolean): Vec {
    const los = this.los;
    const by = this.ballY;
    // DL techniques sit on the OL splits (G 1.5, T 3): DTs shade the guards, DEs outside the tackles.
    const base: Record<DefSlot, Vec> = {
      DE1: { x: los + 1.2, y: by - 4.5 },
      DT1: { x: los + 1.0, y: by - 1.25 },
      DT2: { x: los + 1.0, y: by + 1.5 },
      DE2: { x: los + 1.2, y: by + 4.5 },
      WLB: { x: los + 4.5, y: by - 2.6 },
      MLB: { x: los + 4.5, y: by + 2.6 },
      CB1: { x: los + 6, y: 8 },
      CB2: { x: los + 6, y: FIELD_W - 8 },
      NB: { x: los + 5, y: by },
      FS: { x: los + 13, y: by - 8 },
      SS: { x: los + 13, y: by + 8 },
    };
    const a = d.assign!;
    let pos = base[slot];
    if (a.kind === 'man') {
      const t = off.get(a.target)!;
      d.manTarget = t;
      const inside = Math.sign(by - t.pos.y) || 1;
      if (d.role === 'CB') {
        d.press = press;
        d.cushion = press ? 1 : slot === 'CB1' || slot === 'CB2' ? 6.5 : 4.5;
        d.turned = press;
        pos = { x: los + d.cushion, y: t.pos.y + inside * 0.8 };
      } else if (d.role === 'LB') {
        d.cushion = 1.5;
        pos = { x: pos.x, y: lerp(pos.y, t.pos.y, 0.4) };
      } else {
        d.cushion = 3;
        pos = { x: los + 5.5, y: t.pos.y + inside };
      }
    } else if (a.kind === 'deep') {
      pos = { x: los + 12.5 + this.rng() * 1.5, y: (a.yMin + a.yMax) / 2 };
    } else if (a.kind === 'robber') {
      pos = { x: los + 9, y: by };
    } else if (d.role !== 'DL') {
      pos = { x: los + 3, y: pos.y }; // walked-up blitzer: a tell for the QB
    }
    return { x: Math.min(pos.x, FIELD_LEN - 0.5), y: clamp(pos.y, 1, FIELD_W - 1) };
  }

  /** The line's run-blocking rules for this play. */
  get runScheme(): RunScheme {
    return this.playDef.scheme?.run ?? 'zone';
  }

  /** Draw: the line is still showing pass. */
  passSet(): boolean {
    return this.runScheme === 'draw' && this.time - this.snapTime < DRAW_SET;
  }

  /** Run blocking rules are in effect for engagements (designed run, ball not thrown, draw set done). */
  runBlocking(): boolean {
    return this.playDef.block === 'run' && !this.thrown && !this.passSet();
  }

  snap(): void {
    if (this.phase !== 'presnap') return;
    this.phase = 'snap';
    this.snapTime = this.time;
    const from = { x: this.center.pos.x + 0.3, y: this.center.pos.y, z: 0.4 };
    const to = { x: this.qb.pos.x, y: this.qb.pos.y, z: 1.2 };
    launch(this.ball, from, to, dist(from, to) / 16, 0.15, 'snap');
    if (this.readKey) this.keyCrash = this.rng() < KEY_CRASH;
    if (this.playDef.block === 'run' && this.runScheme !== 'draw') assignRunBlocks(this);
    else this.assignProtection();
    for (const d of this.def) {
      const r = d.manTarget;
      if (d.press && r && this.rng() < 0.5 + (d.r.prs - r.r.rls) / 100) r.jam = 0.45;
    }
    // Run blocking is a run key: the second level reads it and comes downhill.
    if (this.playDef.block === 'run') {
      for (const d of this.def) {
        if (d.role === 'DL') continue;
        const t = d.manTarget;
        if (t && !t.isBlocker) continue; // still has a receiver (or the back) to mirror
        const read =
          0.35 + (1 - d.r.prc / 100) * 0.5 + (d.assign?.kind === 'deep' ? 0.15 : 0) + (this.runScheme === 'draw' ? DRAW_SET + 0.25 : 0);
        d.fitAt = this.snapTime + read;
        d.fitUntil = Infinity;
      }
    }
  }

  /**
   * Linemen slide to the defensive line by alignment; backs and tight ends pick
   * up blitzers. A spare lineman helps or takes any blitzer the backs can't.
   */
  private assignProtection(): void {
    const byY = (a: Player, b: Player) => a.pos.y - b.pos.y;
    const rushers = this.def.filter(isRusher);
    const dl = rushers.filter((d) => d.role === 'DL').sort(byY);
    const blitzers = rushers.filter((d) => d.role !== 'DL');
    const ol = this.off.filter((o) => o.role === 'OL');
    const backs = this.off.filter((o) => o.isBlocker && o.role !== 'OL' && !o.stalk);
    const take = (pool: Player[], r: Player, metric: (b: Player) => number) => {
      let best: Player | null = null;
      for (const b of pool) if (!b.mark && (!best || metric(b) < metric(best))) best = b;
      if (best) best.mark = r;
      return !!best;
    };
    const slide = this.playDef.scheme?.slide;
    if (slide) {
      // Slide: each lineman takes the gap toward the slide; a back checks the edge rusher left behind.
      const sign = slide === 'strong' ? this.resolved.strongSign : -this.resolved.strongSign;
      const edge = sign > 0 ? dl[0] : dl[dl.length - 1];
      const backHasEdge = !!edge && take(backs, edge, (b) => dist(b.pos, edge.pos));
      for (const r of dl) {
        if (r === edge && backHasEdge) continue;
        take(ol, r, (b) => Math.abs(b.pos.y + sign * 1.2 - r.pos.y));
      }
    } else {
      for (const r of dl) take(ol, r, (b) => Math.abs(b.pos.y - r.pos.y));
    }
    for (const r of blitzers) {
      if (!take(backs, r, (b) => dist(b.pos, r.pos))) take(ol, r, (b) => dist(b.pos, r.pos));
    }
  }

  update(dt: number, input: Input, cam: Camera): void {
    this.time += dt;
    for (const p of this.players) tickTimers(p, dt);
    if (this.phase !== 'presnap') this.recordHistory();

    switch (this.phase) {
      case 'snap':
        if (updateFlight(this.ball, dt)) {
          this.giveBall(this.qb);
          this.controlled = this.qb;
          this.phase = 'live';
        }
        break;
      case 'live':
        this.updateLive(input, cam);
        break;
      case 'air':
        if (updateFlight(this.ball, dt)) this.resolveArrival();
        break;
      case 'over':
        this.overTime += dt;
        if (this.ball.state === 'bounce') updateBounce(this.ball, dt);
        break;
      default:
        break;
    }

    for (const p of this.off) if (p !== this.controlled) thinkOffense(this, p);
    for (const d of this.def) {
      if (d === this.carrier) returnerAI(this, d);
      else thinkDefense(this, d);
    }
    if (this.controlled) this.userControl(input, dt);

    if (this.runBlocking()) releaseClimbers(this);
    if (this.playDef.screen && !this.screenReleased && this.phase !== 'presnap' && this.time - this.snapTime >= SCREEN_SET) {
      // Let the rush go: every lineman comes off his man and releases to block for the screen.
      this.screenReleased = true;
      for (const d of this.def) if (d.engagedBy.some((b) => b.role === 'OL')) this.release(d);
      for (const o of this.off) if (o.role === 'OL') o.mark = null;
    }
    this.updateEngagements(dt);
    for (const p of this.players) stepPlayer(p, dt);
    this.anchorBlockers();
    this.formEngagements();

    if (this.ball.state === 'held' && this.carrier) {
      const c = this.carrier;
      this.ball.pos = { x: c.pos.x + c.facing * 0.25, y: c.pos.y + 0.05, z: c.down ? 0.2 : 1.1 };
    }
    if (this.phase === 'live' || this.phase === 'run') {
      this.checkBounds();
      if ((this.phase as Phase) !== 'over') this.checkTackles(); // checkBounds may have ended the play
    }

    for (const pp of this.popups) pp.t += dt;
    this.popups = this.popups.filter((pp) => pp.t < 1.4);
  }

  private recordHistory(): void {
    for (const p of this.off) {
      if (!isEligible(p)) continue;
      let h = this.history.get(p.id);
      if (!h) this.history.set(p.id, (h = []));
      h.push({ ...p.pos });
      if (h.length > HISTORY_LEN) h.shift();
    }
  }

  private giveBall(p: Player): void {
    this.carrier = p;
    this.ball.state = 'held';
    this.ball.carrier = p;
  }

  // ------------------------------------------------------------ passing

  private updateLive(input: Input, cam: Camera): void {
    const qb = this.qb;
    if (this.carrier !== qb) return;
    if (this.playDef.read === 'option' && qb.pos.x > this.los - 0.3) {
      this.optionKeep();
      return;
    }
    if (!this.scramble && qb.pos.x > this.los + 0.3) {
      this.scramble = true;
      this.aim = null;
      for (const d of this.def) d.reactAt = this.time + 0.2 + (1 - d.r.prc / 100) * 0.4;
      this.popup('SCRAMBLE', qb.pos, '#9ad7ff');
    }
    if ((input.mouse.rpressed || input.hit('KeyF')) && this.handoffOption()) {
      this.handoff();
      return;
    }
    if (this.playDef.qbRun) {
      this.startQbRun();
      return;
    }
    if (this.playDef.read === 'zoneRead' && this.updateMesh()) return;
    if (this.playDef.kind === 'pa' && !this.faked && this.time - this.snapTime < 1.3 && dist(this.rb.pos, qb.pos) < FAKE_RANGE) {
      this.sellFake();
    }
    const canThrow = !this.scramble && !qb.down;
    const m = input.mouse;
    if (canThrow && m.pressed) this.aim = { start: { x: m.downX, y: m.downY }, cur: { x: m.x, y: m.y } };
    if (!this.aim) return;
    this.aim.cur = { x: m.x, y: m.y };
    if (!canThrow) {
      this.aim = null;
    } else if (input.hit('Space')) {
      // Pull the ball down: drop the aim without throwing. Releasing the button later does nothing.
      this.aim = null;
    } else if (m.released || !m.down) {
      const drag = len(sub(this.aim.start, this.aim.cur));
      const tgt = aimTarget(this.aim, qb.pos, cam, qb.r.arm);
      this.aim = null;
      if (drag >= MIN_DRAG_PX) this.throwBall(tgt);
    } else {
      setPose(qb, 'throw', 0.05);
    }
  }

  // ------------------------------------------------------------ handoffs

  /** What a right-click would do right now, or null if the RB can't take it. */
  handoffOption(): HandoffKind | null {
    const qb = this.qb;
    const rb = this.rb;
    if (this.phase !== 'live' || this.carrier !== qb || this.scramble || this.thrown || qb.down) return null;
    if (this.playDef.qbRun || rb.isBlocker || rb.down || rb.engaged || rb.stun > 0) return null;
    return handoffKind(qb.pos, rb.pos, this.los, this.readKey ? MESH_REACH : HANDOFF_RANGE);
  }

  handoff(): void {
    const kind = this.handoffOption();
    if (!kind) return;
    const qb = this.qb;
    const rb = this.rb;
    this.aim = null;
    this.handedOff = true;
    this.reactToRun(this.readKey && !this.keyCrash && this.playDef.read === 'zoneRead' ? this.readKey : null);
    if (kind === 'pitch') {
      // Lead the back to where he'll be at full tilt when it gets there: along his heading if he's
      // moving, along his path if he's just starting off, accelerating from his current speed.
      const next = rb.route[rb.routeIdx];
      const dir = len(rb.vel) >= 3 ? norm(rb.vel) : next ? norm(sub(next, rb.pos)) : { x: 0, y: 0 };
      const v0 = Math.max(0, rb.vel.x * dir.x + rb.vel.y * dir.y);
      const top = maxSpeed(rb);
      const acc = accelOf(rb);
      const tUp = Math.max(0, (top - v0) / acc);
      const reach = (t: number) =>
        t <= tUp ? v0 * t + 0.5 * acc * t * t : v0 * tUp + 0.5 * acc * tUp * tUp + top * (t - tUp);
      let lead = rb.pos;
      for (let i = 0; i < 3; i++) lead = add(rb.pos, scale(dir, reach(dist(qb.pos, lead) / PITCH_SPEED + 0.05)));
      const from = { x: qb.pos.x, y: qb.pos.y, z: 1.1 };
      const to = { x: lead.x, y: lead.y, z: 1.0 };
      launch(this.ball, from, to, dist(from, to) / PITCH_SPEED + 0.05, 0.35);
      this.ballTarget = { x: to.x, y: to.y };
      this.intended = rb;
      this.pitch = true;
      this.carrier = null;
      this.controlled = null;
      this.phase = 'air';
      setPose(qb, 'throwEnd', 0.3);
      return;
    }
    if (this.rng() >= HANDOFF_ODDS) {
      this.fumble(rb.pos, 'Botched exchange');
      return;
    }
    this.giveBall(rb);
    this.controlled = rb;
    this.phase = 'run';
  }

  /** Designed QB carry: once he has the snap it's a run, and the defense reads it as one. */
  startQbRun(): void {
    if (!this.playDef.qbRun || this.phase !== 'live' || this.carrier !== this.qb) return;
    if (this.time - this.snapTime < (QB_RUN_WAIT[this.runScheme] ?? 0)) return;
    this.aim = null;
    this.reactToRun();
    this.phase = 'run';
  }

  /**
   * Zone read: ride the back through the mesh. Once he's carried past the QB
   * without a give (or never got there), the QB pulls it. Returns true on a keep.
   */
  private updateMesh(): boolean {
    const d = dist(this.rb.pos, this.qb.pos);
    if (d <= MESH_REACH) this.meshed = true;
    else if (this.meshed || this.time - this.snapTime > MESH_TIME) {
      this.keep();
      return true;
    }
    return false;
  }

  /**
   * The read key is going after the back rather than the QB: the cue to pull it. A backside key
   * crashes down the line; a playside key (power read) runs with the sweep.
   */
  keyCrashing(): boolean {
    const k = this.readKey;
    if (!k || len(k.vel) < 1.5) return false;
    const v = norm(k.vel);
    const at = (p: Player) => {
      const d = norm(sub(p.pos, k.pos));
      return v.x * d.x + v.y * d.y;
    };
    return at(this.rb) > at(this.qb) + 0.15;
  }

  /**
   * Zone read keep: the QB runs for the alley outside wherever the read key is, and the back carries
   * out his fake. On power read he keeps it inside the key instead, behind the pulling guard.
   */
  private keep(): void {
    const key = this.readKey!;
    const out = Math.sign(key.start.y - this.ballY) || -this.resolved.strongSign;
    this.kept = true;
    this.aim = null;
    const y = this.playDef.keep === 'inside' ? key.start.y - out * KEEP_INSIDE : key.pos.y + out * KEEP_WIDTH;
    this.hole = { x: this.los + 1, y: clamp(y, 2, FIELD_W - 2) };
    // He's been riding the mesh, so he pulls it already moving.
    this.qb.vel = scale(norm(sub(this.hole, this.qb.pos)), maxSpeed(this.qb) * 0.5);
    this.reactToRun(this.keyCrash ? key : null);
    this.phase = 'run';
    this.popup('KEEP', this.qb.pos, '#9ad7ff');
  }

  /** Speed option: the QB got to the line without pitching it, so he keeps it and turns up inside the key. */
  private optionKeep(): void {
    const key = this.readKey!;
    const out = Math.sign(key.start.y - this.ballY) || this.resolved.strongSign;
    this.kept = true;
    this.aim = null;
    this.hole = { x: this.los + 1.5, y: clamp(key.pos.y - out * OPTION_CUT, 2, FIELD_W - 2) };
    this.reactToRun(this.keyCrash ? null : key); // a key who took the pitch man is late to the QB
    this.phase = 'run';
    this.popup('KEEP', this.qb.pos, '#9ad7ff');
  }

  /** Defenders key the handoff: front seven fast, defenders turned on receivers slower. A fooled read key is slower still. */
  private reactToRun(fooled: Player | null = null): void {
    for (const d of this.def) {
      const slow = 1 - d.r.prc / 100;
      const t = d.manTarget;
      let react: number;
      if (this.time >= d.fitAt) react = 0.05;
      else if (d.role === 'DL' || d.role === 'LB' || t === this.rb) react = 0.1 + slow * 0.25;
      else if (t && !t.isBlocker) react = 0.4 + slow * 0.4;
      else react = 0.3 + slow * 0.3;
      d.reactAt = this.time + react + (d === fooled ? KEY_FOOLED : 0);
    }
  }

  /** Play-action: the second level bites on the fake for a moment. */
  private sellFake(): void {
    this.faked = true;
    this.popup('FAKE', this.rb.pos, '#9ad7ff');
    for (const d of this.def) {
      if (d.role !== 'LB' && d.role !== 'S') continue;
      const a = d.assign?.kind;
      const chance = (a === 'deep' ? 0.35 : a === 'robber' ? 0.7 : 0.8) - (d.r.prc - 70) * 0.01;
      if (this.rng() >= chance) continue;
      d.fitAt = this.time;
      d.fitUntil = this.time + 0.35 + (1 - d.r.prc / 100) * 0.6;
    }
  }

  private fumble(at: Vec, sub: string): void {
    const spot = at.x;
    this.ball.pos = { x: at.x, y: at.y, z: 0 };
    this.ball.state = 'dead';
    this.carrier = null;
    if (spot <= OWN_GOAL) {
      this.end({ type: 'safety', spot, spotY: at.y, text: 'SAFETY', sub: 'Fumble in the end zone', color: '#ff5a5a' });
      return;
    }
    this.end({ type: 'fumble', spot, spotY: at.y, text: 'FUMBLE', sub: `${sub}. Offense recovers`, color: '#ff9a5a' });
  }

  /** Current aim point while dragging, for the trajectory preview. */
  aimPoint(cam: Camera): Vec | null {
    return this.aim ? aimTarget(this.aim, this.qb.pos, cam, this.qb.r.arm) : null;
  }

  private throwBall(target: Vec): void {
    const qb = this.qb;
    const rng = this.rng;
    let nearest = Infinity;
    for (const d of this.def) {
      if (!d.down && !d.engagedBy.length) nearest = Math.min(nearest, dist(d.pos, qb.pos));
    }
    const pressure = clamp((4 - nearest) / 4, 0, 1);
    const moving = clamp(len(qb.vel) / 6, 0, 1);
    const sd = throwErrorSd(dist(qb.pos, target), qb.r, pressure, moving);
    const to = { x: target.x + gauss(rng) * sd, y: target.y + gauss(rng) * sd * 0.8, z: 1.2 };
    const from = { x: qb.pos.x + qb.facing * 0.3, y: qb.pos.y, z: 2.0 };
    const { dur, peak } = passParams(dist(from, to), qb.r.arm);
    launch(this.ball, from, to, dur, peak);

    this.ballTarget = { x: to.x, y: to.y };
    this.carrier = null;
    this.controlled = null;
    this.thrown = true;
    this.phase = 'air';
    setPose(qb, 'throwEnd', 0.35);

    let best: Player | null = null;
    let bd = 15;
    for (const o of this.off) {
      if (!isEligible(o) || o.down) continue;
      const dd = dist(o.pos, this.ballTarget);
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    this.intended = best;

    // Defenders facing the QB break on the throw; trailing man defenders only
    // find the ball late in its flight.
    for (const d of this.def) {
      d.reactAt = Infinity;
      if (d.down) continue;
      const isMan = !!best && d.manTarget === best;
      if (dist(d.pos, this.ballTarget) < 14 || isMan) {
        const cov = d.assign?.kind === 'man' ? d.r.mcv : d.r.zcv;
        const react = 0.5 - (cov / 100) * 0.35 + rng() * 0.1;
        d.reactAt = this.time + (seesThrow(d) ? react + 0.1 : Math.max(react, dur * 0.6));
      }
    }
  }

  private resolveArrival(): void {
    const land = this.ballTarget!;
    if (this.pitch) {
      const rb = this.rb;
      if (!rb.down && this.rng() < pitchOdds(Math.max(0, 1 - dist(rb.pos, land) / PITCH_REACH), rb.r.cth)) {
        this.giveBall(rb);
        this.controlled = rb;
        this.phase = 'run';
        setPose(rb, 'catch', 0.15);
      } else {
        this.fumble(land, 'Pitch on the ground');
      }
      return;
    }
    const oob = land.y < 0 || land.y > FIELD_W || land.x > FIELD_LEN || land.x < 0;
    let bestO: Player | null = null;
    let bestD: Player | null = null;
    let so = 0;
    let sd = 0;
    for (const p of this.players) {
      if (p.down || p.engaged || p.engagedBy.length) continue;
      const s = reachScore(dist(p.pos, land));
      if (s <= 0) continue;
      if (isEligible(p) && s > so) {
        so = s;
        bestO = p;
      } else if (p.side === 'def' && s > sd) {
        sd = s;
        bestD = p;
      }
    }
    this.catchSet = bestO ? facingQB(bestO, this.qb, this.time) : 0;
    const res = oob
      ? 'miss'
      : resolveCatch(
          bestO ? { pos: so, cth: bestO.r.cth, cit: bestO.r.cit, set: this.catchSet } : null,
          bestD ? { pos: sd, cth: bestD.r.cth, prc: bestD.r.prc } : null,
          this.rng,
        );

    if (res === 'catch' && bestO) {
      this.giveBall(bestO);
      this.controlled = bestO;
      this.phase = 'run';
      setPose(bestO, 'catch', 0.25);
      for (const d of this.def) d.reactAt = this.time + 0.12 + (1 - d.r.prc / 100) * 0.35;
      this.popup('CATCH!', bestO.pos, '#ffffff');
      return;
    }
    if (res === 'int' && bestD) {
      this.giveBall(bestD);
      this.phase = 'run';
      setPose(bestD, 'catch', 0.25);
      for (const d of this.def) this.release(d);
      for (const o of this.off) o.reactAt = this.time + 0.3 + this.rng() * 0.2;
      this.popup('PICKED OFF!', bestD.pos, '#ff5a5a');
      return;
    }

    let sub = 'Nobody home';
    if (oob) sub = 'Out of bounds';
    else if (res === 'pbu' && bestD) {
      setPose(bestD, 'catch', 0.4);
      sub = `Broken up by #${bestD.num} ${bestD.name}`;
    } else if (res === 'drop' && bestO) {
      setPose(bestO, 'catch', 0.3);
      sub = `Dropped by #${bestO.num} ${bestO.name}`;
    }
    startBounce(this.ball);
    this.end({ type: 'incomplete', spot: this.los, spotY: this.ballY, text: 'INCOMPLETE', sub, color: '#ffffff' });
  }

  // ------------------------------------------------------------ user control

  private userControl(input: Input, dt: number): void {
    const c = this.controlled!;
    if (c.down) return;
    let ax = input.axis();
    const pocket = this.phase === 'live' && c === this.qb;
    if (ax.x || ax.y) c.manual = true;
    if (pocket && !c.manual) {
      c.want = seek(c, this.qbDrop, maxSpeed(c) * 0.8, 0.8);
      return;
    }
    // After the catch the carrier keeps running downfield unless told otherwise.
    if (this.phase === 'run' && ax.x === 0) ax = { x: 1, y: ax.y };

    const moving = ax.x !== 0 || ax.y !== 0;
    const sprint = moving && input.isDown('ShiftLeft', 'ShiftRight') && c.stamina > 0.02;
    const e = endurance(c);
    const drain = 1 / lerp(SPRINT_TIME.min, SPRINT_TIME.max, e * e);
    const recover = lerp(SPRINT_RECOVER.min, SPRINT_RECOVER.max, e);
    c.stamina = sprint ? Math.max(0, c.stamina - dt * drain) : Math.min(1, c.stamina + dt * recover);
    const sp = maxSpeed(c) * (sprint ? 1 : 0.86) * (this.aim ? 0.6 : 1);
    c.want = scale(norm(ax), sp);
  }

  // ------------------------------------------------------------ blocking

  private formEngagements(): void {
    if (this.phase === 'presnap' || this.phase === 'over') return;
    const downfield = this.phase === 'run' && this.carrier?.side === 'off';
    for (const b of this.off) {
      if (b.down || b.engaged || b.stun > 0 || b === this.carrier || b.role === 'QB' || b.pull) continue; // pullers don't stop to block on the way
      if (!b.isBlocker && !downfield) continue;
      for (const d of this.def) {
        if (d.down || d === this.carrier || d.noEngage > 0 || d.engagedBy.length >= 2) continue;
        // Away from the ball only a blocker's own run-block assignment is worth locking onto (a WR on his DB).
        if (downfield && dist(d.pos, this.carrier!.pos) > 10 && !(b.mark === d && this.runBlocking())) continue;
        if (!downfield && d === this.readKey) continue; // left unblocked on purpose
        if (d.engagedBy.length === 1 && b.mark !== d) continue;
        // Blockers with an assignment work to their man rather than grabbing whoever they bump into.
        // On runs too, as long as their man is still close enough to matter.
        if (b.isBlocker && b.mark && !b.mark.down && b.mark !== d && (!downfield || dist(b.pos, b.mark.pos) < 4)) continue;
        if (dist(b.pos, d.pos) < (b.mark === d && this.runBlocking() ? RUN_ENGAGE : 1.0)) {
          if (!d.engagedBy.length && this.runBlocking()) {
            // A new run block: note which side the blocker has him from, and roll how it goes.
            d.blockDir = norm(sub(b.pos, d.pos));
            d.blockRoll = gauss(this.rng) * BLOCK_ROLL_SD;
          }
          b.engaged = d;
          d.engagedBy.push(b);
          break;
        }
      }
    }
  }

  private release(d: Player): void {
    for (const b of d.engagedBy) b.engaged = null;
    d.engagedBy = [];
    d.blockDir = null;
  }

  private updateEngagements(dt: number): void {
    for (const d of this.def) {
      if (!d.engagedBy.length) continue;
      d.engagedBy = d.engagedBy.filter((b) => !b.down && b.engaged === d);
      if (!d.engagedBy.length || d.down) {
        this.release(d);
        continue;
      }
      if (this.runBlocking()) {
        if (this.rng() < runEngagement(this, d) * dt) this.shed(d);
        continue;
      }
      const n = d.engagedBy.length;
      const dir = norm(sub(d.goal ?? this.qb.pos, d.pos));
      const blk = d.engagedBy.reduce((s, b) => s + passBlockValue(b.r), 0) / n;
      const power = d.r.rsh * 0.7 + d.r.spd * 0.3 - blk - (n - 1) * 15;
      const push = clamp(0.8 + power * 0.06, -0.8, 2.2);
      d.want = scale(dir, push);
      for (const b of d.engagedBy) b.want = scale(dir, push);
      // Blocks hold early and break down the longer the QB holds the ball.
      const ramp = Math.min(1, (this.time - this.snapTime) / 2.5) ** 2;
      let shedRate = (clamp(0.22 + power * 0.012, 0.05, 0.7) * ramp) / Math.pow(n, 1.5);
      // Once the ball is gone, blocks away from it dissolve as the defender peels off to pursue.
      if (this.thrown && dist(d.pos, d.goal ?? this.qb.pos) > 6) shedRate = 2.5;
      // Runs: the far side of the play peels off to pursue; the defender at the point of attack fights to make the tackle.
      const c = this.carrier;
      if (c && c.side === 'off' && (this.phase === 'run' || this.scramble)) {
        const dc = dist(d.pos, c.pos);
        if (dc > 8) shedRate = 2.5;
        else if (dc < 2.2) shedRate = Math.max(shedRate, clamp(2.2 + power * 0.05, 0.8, 5));
      }
      if (this.rng() < shedRate * dt) this.shed(d);
    }
  }

  private shed(d: Player): void {
    for (const b of d.engagedBy) b.stun = 0.35;
    this.release(d);
    d.noEngage = 1.3;
  }

  /** Keep each blocker locked between its defender and the defender's goal. */
  private anchorBlockers(): void {
    for (const d of this.def) {
      const n = d.engagedBy.length;
      if (!n) continue;
      const dir = this.runBlocking() && d.blockDir ? d.blockDir : norm(sub(d.goal ?? this.qb.pos, d.pos));
      d.engagedBy.forEach((b, i) => {
        const off = n === 1 ? 0 : i === 0 ? -0.45 : 0.45;
        const ax = d.pos.x + dir.x * 0.85 - dir.y * off;
        const ay = d.pos.y + dir.y * 0.85 + dir.x * off;
        b.pos = { x: lerp(b.pos.x, ax, 0.35), y: lerp(b.pos.y, ay, 0.35) };
        b.facing = d.pos.x >= b.pos.x ? 1 : -1;
      });
      d.facing = d.engagedBy[0].pos.x >= d.pos.x ? 1 : -1;
    }
  }

  // ------------------------------------------------------------ tackles & bounds

  private checkTackles(): void {
    const c = this.carrier;
    if (!c || c.down) return;
    const tacklers = c.side === 'off' ? this.def : this.off;
    for (const t of tacklers) {
      if (t.down || t.tackleCd > 0 || t.engaged || t.role === 'QB') continue;
      const arm = t.engagedBy.length > 0;
      if (dist(t.pos, c.pos) > (arm ? TACKLE_RANGE * 0.8 : TACKLE_RANGE)) continue;
      const armOdds = arm ? ARM_TACKLE * (levered(t, c.pos) ? ARM_LEVERED : 1) : 1;
      if (this.rng() < tackleChance(t.r.tkl, c.r.elu, c.r.str) * armOdds) {
        this.tackled(c, t);
        return;
      }
      if (arm) {
        t.tackleCd = 1.0; // slipped the arm tackle; the blocker still has him
        continue;
      }
      knockDown(t, 0.9);
      t.tackleCd = 1.6;
      c.vel = scale(c.vel, 0.55);
      this.popup('BROKEN TACKLE!', c.pos, '#ffd23f');
    }
  }

  private tackled(c: Player, t: Player): void {
    // Carriers going forward fall forward (yards after contact); returners and sacks don't.
    if (c.side === 'off') c.pos = { x: Math.min(c.pos.x + fallForward(c.vel.x, c.r.str, t.r.str), OPP_GOAL - 0.01), y: c.pos.y };
    knockDown(c);
    knockDown(t);
    const spot = c.pos.x;
    const spotY = c.pos.y;
    if (c.side === 'def') {
      const touchback = spot >= OPP_GOAL;
      this.end({
        type: 'int', spot: touchback ? OPP_GOAL - 25 : spot, spotY, text: 'INTERCEPTED',
        sub: touchback ? 'Touchback' : `Returned to the ${fieldLabel(spot)}`, color: '#ff5a5a',
      });
      return;
    }
    const yards = spot - this.los;
    if (spot <= OWN_GOAL) {
      this.end({ type: 'safety', spot, spotY, text: 'SAFETY', sub: `Tackled in the end zone`, color: '#ff5a5a' });
    } else if (c === this.qb && !this.thrown && this.playDef.block === 'pass' && spot < this.los) {
      this.end({ type: 'sack', spot, spotY, text: 'SACKED', sub: `#${t.num} ${t.name}  ${yardsText(yards)}`, color: '#ff5a5a' });
    } else {
      this.end({
        type: 'tackle', spot, spotY, text: yardsText(yards),
        sub: `Tackled by #${t.num} ${t.name}`, color: yards >= 0 ? '#ffffff' : '#ff9a5a',
      });
    }
  }

  private checkBounds(): void {
    const c = this.carrier;
    if (!c || c.down) return;
    const out = c.pos.y < 0 || c.pos.y > FIELD_W;
    if (c.side === 'off') {
      if (c.pos.x >= OPP_GOAL) {
        setPose(c, 'catch', 5);
        this.end({ type: 'td', spot: OPP_GOAL, spotY: c.pos.y, text: 'TOUCHDOWN!', sub: `#${c.num} ${c.name}`, color: '#ffd23f' });
      } else if (out || c.pos.x < 0) {
        const spot = c.pos.x;
        if (spot <= OWN_GOAL) this.end({ type: 'safety', spot, spotY: c.pos.y, text: 'SAFETY', sub: 'Out of the end zone', color: '#ff5a5a' });
        else this.end({ type: 'oob', spot, spotY: c.pos.y, text: yardsText(spot - this.los), sub: 'Out of bounds', color: '#ffffff' });
      }
    } else if (c.pos.x <= OWN_GOAL) {
      setPose(c, 'catch', 5);
      this.end({ type: 'pick6', spot: OWN_GOAL, spotY: c.pos.y, text: 'PICK SIX', sub: `#${c.num} ${c.name} takes it to the house`, color: '#ff5a5a' });
    } else if (out || c.pos.x > FIELD_LEN) {
      const touchback = c.pos.x >= OPP_GOAL;
      this.end({
        type: 'int', spot: touchback ? OPP_GOAL - 25 : c.pos.x, spotY: c.pos.y, text: 'INTERCEPTED',
        sub: touchback ? 'Touchback' : `Returned to the ${fieldLabel(c.pos.x)}`, color: '#ff5a5a',
      });
    }
  }

  private end(o: PlayOutcome): void {
    this.outcome = o;
    this.phase = 'over';
    this.overTime = 0;
    this.controlled = null;
    this.aim = null;
  }

  private popup(text: string, at: Vec, color: string): void {
    this.popups.push({ text, x: at.x, y: at.y, t: 0, color });
  }

  ballTimeLeft(): number {
    return Math.max(0, this.ball.dur - this.ball.t);
  }

  /** World x the camera should track this frame. */
  focusX(): number {
    switch (this.phase) {
      case 'presnap':
      case 'snap':
      case 'live':
        return this.scramble ? this.qb.pos.x : Math.min(this.qb.pos.x + 3, this.los);
      case 'air':
        return this.ball.pos.x;
      default:
        return this.carrier ? this.carrier.pos.x : this.ball.pos.x;
    }
  }
}
