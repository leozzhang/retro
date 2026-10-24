import type { DefCall } from '../data/defenses';
import { ROUTES, type PlayDef } from '../data/plays';
import { DEF_SLOTS, OFF_SLOTS, type DefSlot, type RosterPlayer, type Team } from '../data/teams';
import type { Camera } from '../engine/camera';
import { FIELD_LEN, FIELD_W, OPP_GOAL, OWN_GOAL } from '../engine/constants';
import type { Input } from '../engine/input';
import { add, clamp, dist, gauss, len, lerp, norm, scale, sub, type Rng, type Vec } from '../engine/math';
import { teamUniform } from '../render/sprites';
import { isRusher, returnerAI, seesThrow, thinkDefense, thinkOffense } from '../sim/ai';
import { launch, makeBall, passParams, startBounce, updateBounce, updateFlight, type Ball } from '../sim/ball';
import { reachScore, resolveCatch } from '../sim/catching';
import {
  isEligible, knockDown, makePlayer, maxSpeed, seek, setPose, stepPlayer, tickTimers, type Player,
} from '../sim/player';
import { aimTarget, MIN_DRAG_PX, throwErrorSd, type Aim } from '../sim/passing';
import { TACKLE_RANGE, tackleChance } from '../sim/tackling';
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
  rng: Rng;
}

const HISTORY_LEN = 60;

export class Play {
  readonly off: Player[] = [];
  readonly def: Player[] = [];
  readonly players: Player[];
  readonly qb: Player;
  readonly center: Player;
  readonly ball: Ball;
  readonly los: number;
  readonly ballY: number;
  readonly playDef: PlayDef;
  readonly defCall: DefCall;
  readonly qbDrop: Vec;
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
  outcome: PlayOutcome | null = null;
  popups: Popup[] = [];
  history = new Map<number, Vec[]>();
  jukeTimer = 0;
  private jukeCd = 0;

  constructor(s: PlaySetup) {
    this.los = s.los;
    this.ballY = s.ballY;
    this.playDef = s.play;
    this.defCall = s.defCall;
    this.rng = s.rng;

    const offU = teamUniform(s.offTeam, true);
    const defU = teamUniform(s.defTeam, false);
    const bySlot = new Map<string, Player>();

    for (const slot of OFF_SLOTS) {
      const a = s.play.formation.align[slot];
      const y = clamp(a.mode === 'abs' ? a.y : s.ballY + a.y, 1, FIELD_W - 1);
      const p = makePlayer('off', s.offRoster[slot], offU, { x: s.los + a.dx, y });
      const rn = s.play.routes[slot];
      p.isBlocker = p.role === 'OL' || rn === 'block';
      if (rn && rn !== 'block') this.buildRoute(p, rn);
      this.off.push(p);
      bySlot.set(slot, p);
    }
    this.qb = bySlot.get('QB')!;
    this.center = bySlot.get('C')!;
    this.qbDrop = { x: this.qb.pos.x - s.play.drop, y: this.qb.pos.y };

    for (const slot of DEF_SLOTS) {
      const a = s.defCall.assign[slot];
      const d = makePlayer('def', s.defRoster[slot], defU, { x: 0, y: 0 });
      d.assign = a;
      d.pos = this.defAlignment(slot, d, bySlot, s.press[slot] ?? false);
      d.start = { ...d.pos };
      this.def.push(d);
    }

    this.players = [...this.off, ...this.def];
    this.ball = makeBall(this.los, this.ballY);
  }

  private buildRoute(p: Player, rn: keyof typeof ROUTES): void {
    const r = ROUTES[rn];
    const side = Math.sign(this.ballY - p.pos.y) || 1; // +1 means "inside" is +y
    let prev = p.pos;
    let last = p.pos;
    for (const [dn, ins] of r.pts) {
      const pt = { x: Math.min(p.pos.x + dn, 119), y: clamp(p.pos.y + ins * side, 1, FIELD_W - 1) };
      p.route.push(pt);
      prev = last;
      last = pt;
    }
    if (r.cont && p.route.length) p.routeDir = norm(sub(last, prev));
  }

  private defAlignment(slot: DefSlot, d: Player, off: Map<string, Player>, press: boolean): Vec {
    const los = this.los;
    const by = this.ballY;
    const base: Record<DefSlot, Vec> = {
      DE1: { x: los + 1.2, y: by - 3.9 },
      DT1: { x: los + 1.0, y: by - 1.0 },
      DT2: { x: los + 1.0, y: by + 1.2 },
      DE2: { x: los + 1.2, y: by + 3.9 },
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
        d.cushion = press ? 1 : slot === 'NB' ? 4.5 : 6.5;
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
    } else if (d.role === 'LB') {
      pos = { x: los + 3, y: pos.y }; // walked-up blitzer: a tell for the QB
    }
    return { x: Math.min(pos.x, FIELD_LEN - 0.5), y: clamp(pos.y, 1, FIELD_W - 1) };
  }

  snap(): void {
    if (this.phase !== 'presnap') return;
    this.phase = 'snap';
    this.snapTime = this.time;
    const from = { x: this.center.pos.x + 0.3, y: this.center.pos.y, z: 0.4 };
    const to = { x: this.qb.pos.x, y: this.qb.pos.y, z: 1.2 };
    launch(this.ball, from, to, dist(from, to) / 16, 0.15, 'snap');
    this.assignProtection();
    for (const d of this.def) {
      const r = d.manTarget;
      if (d.press && r && this.rng() < 0.5 + (d.r.str - r.r.str) / 100) r.jam = 0.45;
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
    const backs = this.off.filter((o) => o.isBlocker && o.role !== 'OL');
    const take = (pool: Player[], r: Player, metric: (b: Player) => number) => {
      let best: Player | null = null;
      for (const b of pool) if (!b.mark && (!best || metric(b) < metric(best))) best = b;
      if (best) best.mark = r;
      return !!best;
    };
    for (const r of dl) take(ol, r, (b) => Math.abs(b.pos.y - r.pos.y));
    for (const r of blitzers) {
      if (!take(backs, r, (b) => dist(b.pos, r.pos))) take(ol, r, (b) => dist(b.pos, r.pos));
    }
  }

  update(dt: number, input: Input, cam: Camera): void {
    this.time += dt;
    this.jukeTimer -= dt;
    this.jukeCd -= dt;
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
    if (!this.scramble && qb.pos.x > this.los + 0.3) {
      this.scramble = true;
      this.aim = null;
      for (const d of this.def) d.reactAt = this.time + 0.2 + (1 - d.r.awr / 100) * 0.4;
      this.popup('SCRAMBLE', qb.pos, '#9ad7ff');
    }
    const canThrow = !this.scramble && !qb.down;
    const m = input.mouse;
    if (canThrow && m.pressed) this.aim = { start: { x: m.downX, y: m.downY }, cur: { x: m.x, y: m.y } };
    if (!this.aim) return;
    this.aim.cur = { x: m.x, y: m.y };
    if (!canThrow) {
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
    const sd = throwErrorSd(dist(qb.pos, target), qb.r.thr, pressure, moving);
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
        const react = 0.5 - (d.r.awr / 100) * 0.35 + rng() * 0.1;
        d.reactAt = this.time + (seesThrow(d) ? react + 0.1 : Math.max(react, dur * 0.6));
      }
    }
  }

  private resolveArrival(): void {
    const land = this.ballTarget!;
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
    const res = oob
      ? 'miss'
      : resolveCatch(
          bestO ? { pos: so, cth: bestO.r.cth } : null,
          bestD ? { pos: sd, cth: bestD.r.cth, awr: bestD.r.awr } : null,
          this.rng,
        );

    if (res === 'catch' && bestO) {
      this.giveBall(bestO);
      this.controlled = bestO;
      this.phase = 'run';
      setPose(bestO, 'catch', 0.25);
      for (const d of this.def) d.reactAt = this.time + 0.12 + (1 - d.r.awr / 100) * 0.35;
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
    c.stamina = sprint ? Math.max(0, c.stamina - dt * 0.35) : Math.min(1, c.stamina + dt * 0.15);
    const sp = maxSpeed(c) * (sprint ? 1 : 0.86) * (this.aim ? 0.6 : 1);
    c.want = scale(norm(ax), sp);

    if (input.hit('Space') && this.jukeCd <= 0 && !this.aim) {
      let dy = ax.y;
      if (!dy) {
        let nearest: Player | null = null;
        for (const d of this.def) if (!d.down && (!nearest || dist(d.pos, c.pos) < dist(nearest.pos, c.pos))) nearest = d;
        dy = nearest && nearest.pos.y < c.pos.y ? 1 : -1;
      }
      c.vel = add(c.vel, { x: 0, y: dy * 5.5 });
      this.jukeTimer = 0.35;
      this.jukeCd = 1.1;
    }
  }

  // ------------------------------------------------------------ blocking

  private formEngagements(): void {
    if (this.phase === 'presnap' || this.phase === 'over') return;
    const runBlocking = this.phase === 'run' && this.carrier?.side === 'off';
    for (const b of this.off) {
      if (b.down || b.engaged || b.stun > 0 || b === this.carrier || b.role === 'QB') continue;
      if (!b.isBlocker && !runBlocking) continue;
      for (const d of this.def) {
        if (d.down || d === this.carrier || d.noEngage > 0 || d.engagedBy.length >= 2) continue;
        if (runBlocking && dist(d.pos, this.carrier!.pos) > 10) continue;
        if (d.engagedBy.length === 1 && b.mark !== d) continue;
        if (dist(b.pos, d.pos) < 1.0) {
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
  }

  private updateEngagements(dt: number): void {
    for (const d of this.def) {
      if (!d.engagedBy.length) continue;
      d.engagedBy = d.engagedBy.filter((b) => !b.down && b.engaged === d);
      if (!d.engagedBy.length || d.down) {
        this.release(d);
        continue;
      }
      const n = d.engagedBy.length;
      const dir = norm(sub(d.goal ?? this.qb.pos, d.pos));
      const blk = d.engagedBy.reduce((s, b) => s + b.r.blk, 0) / n;
      const power = d.r.str * 0.7 + d.r.spd * 0.3 - blk - (n - 1) * 15;
      const push = clamp(0.8 + power * 0.06, -0.8, 2.2);
      d.want = scale(dir, push);
      for (const b of d.engagedBy) b.want = scale(dir, push);
      // Blocks hold early and break down the longer the QB holds the ball.
      const ramp = Math.min(1, (this.time - this.snapTime) / 2.5) ** 2;
      let shedRate = (clamp(0.22 + power * 0.012, 0.05, 0.7) * ramp) / Math.pow(n, 1.5);
      // Once the ball is gone, blocks away from it dissolve as the defender peels off to pursue.
      if (this.thrown && dist(d.pos, d.goal ?? this.qb.pos) > 6) shedRate = 2.5;
      if (this.rng() < shedRate * dt) {
        for (const b of d.engagedBy) b.stun = 0.35;
        this.release(d);
        d.noEngage = 1.3;
      }
    }
  }

  /** Keep each blocker locked between its defender and the defender's goal. */
  private anchorBlockers(): void {
    for (const d of this.def) {
      const n = d.engagedBy.length;
      if (!n) continue;
      const dir = norm(sub(d.goal ?? this.qb.pos, d.pos));
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
      if (t.down || t.tackleCd > 0 || t.engaged || t.engagedBy.length || t.role === 'QB') continue;
      if (dist(t.pos, c.pos) > TACKLE_RANGE) continue;
      const juking = this.jukeTimer > 0 && c === this.controlled;
      if (this.rng() < tackleChance(t.r.tkl, c.r.elu, c.r.str, juking)) {
        this.tackled(c, t);
        return;
      }
      knockDown(t, 0.9);
      t.tackleCd = 1.6;
      c.vel = scale(c.vel, 0.55);
      this.popup(juking ? 'JUKED HIM!' : 'BROKEN TACKLE!', c.pos, '#ffd23f');
    }
  }

  private tackled(c: Player, t: Player): void {
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
    } else if (c === this.qb && !this.thrown) {
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
