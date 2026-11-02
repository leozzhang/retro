import { FIELD_W, OPP_GOAL, STEP } from '../engine/constants';
import { add, clamp, dist, len, lerp, limit, norm, scale, sub, type Vec } from '../engine/math';
import type { Play } from '../game/playState';
import { isEligible, maxSpeed, seek, seekTimed, type Player } from './player';
import { pickLane, runBlock } from './runBlocking';

const ZERO: Vec = { x: 0, y: 0 };
/** Yards a scorer carries on into the end zone after crossing the goal line, before pulling up. Only for show. */
const TD_RUN_THROUGH = 4;
/** A back selling pass before a delayed route steps up to block no more than this far from his spot. */
const DELAY_SET_RANGE = 1.2;
/** Backers fit a run this far past the LOS (they read, then fill; they don't meet the back at the line). */
const LB_FIT_DEPTH = 2.8;
/** A backer or DB in the box this close to a blocker is working through traffic and runs at `TRASH_SPEED`. */
const TRASH_RANGE = 1.6;
const TRASH_SPEED = 0.85;
/** Man coverage on a player still behind the line: hold this deep past the LOS and read him. */
const MAN_DEPTH = 3;

/**
 * How far ahead (seconds) a scrimmage pursuer leads the ball carrier, so deep defenders take an angle
 * instead of chasing. Kick coverage keeps the shorter default lead.
 */
const PURSUIT_LEAD = 2;

/** Chase a ball carrier, aiming at where they will be rather than where they are. */
export function pursue(p: Player, c: Player, speedMul = 1, lead = 1.2): void {
  const sp = maxSpeed(p) * speedMul;
  const t = clamp(dist(p.pos, c.pos) / sp, 0, lead) * 0.85;
  p.want = seek(p, add(c.pos, scale(c.vel, t)), sp, 0.1);
}

// ---------------------------------------------------------------- offense

export function thinkOffense(play: Play, p: Player): void {
  if (play.phase === 'over' && p === play.carrier && play.outcome?.type === 'td' && !p.down) {
    // The scorer runs it through instead of stopping dead on the goal line.
    p.want = p.pos.x < OPP_GOAL + TD_RUN_THROUGH ? { x: Math.max(p.vel.x, 3), y: p.vel.y * 0.5 } : ZERO;
    return;
  }
  if (p.down || p.stun > 0 || play.phase === 'presnap' || play.phase === 'over') {
    p.want = ZERO;
    return;
  }
  if (p.engaged) return; // engagement resolution drives blockers
  const c = play.carrier;

  // Interception: everyone turns into a tackler.
  if (c && c.side === 'def') {
    if (play.time >= p.reactAt) pursue(p, c);
    else p.want = scale(p.vel, 0.5);
    return;
  }
  if (play.phase === 'run' && c === p) {
    autoRun(play, p); // only when the user isn't steering (balance harness)
    return;
  }
  if (play.phase === 'run' && c && c !== p) {
    // Designed runs keep their run-block assignments; after a catch (or a scramble) it's every man for himself.
    if (p.isBlocker && play.runBlocking()) runBlock(play, p);
    else downfieldBlock(play, p, c);
    return;
  }
  if (p.role === 'QB') {
    p.want = play.phase === 'snap' ? seek(p, play.qbDrop, maxSpeed(p) * 0.8, 0.8) : ZERO;
    return;
  }
  if (play.phase === 'air' && p === play.intended && play.ballTarget) {
    // A pitch is led to where the back gets at full tilt, so he runs through the spot rather than timing it.
    const d = sub(play.ballTarget, p.pos);
    if (play.pitch) p.want = len(d) > 0.3 ? scale(norm(d), maxSpeed(p)) : p.vel;
    else p.want = seekTimed(p, play.ballTarget, play.ballTimeLeft());
    return;
  }
  if (p.routeDelay && play.time - play.snapTime < p.routeDelay) {
    // Screens, check-releases, the draw: sell pass (or just wait) before the route starts.
    if (p.delayBlock) passBlock(play, p);
    else p.want = ZERO;
    return;
  }
  if (p.isBlocker) {
    if (play.playDef.block === 'run' && !play.passSet()) runBlock(play, p);
    else if (play.screenReleased && p.role === 'OL') downfieldBlock(play, p, play.screenTarget ?? play.qb);
    else if (p.stalk) downfieldBlock(play, p, play.screenTarget ?? p);
    else passBlock(play, p);
    return;
  }
  runRoute(play, p);
}

/**
 * Pass routes: burst off the line and out of a cut at `BURST` yd/s² (scaled by `acc`), easing off by
 * `BURST_TAPER` as he nears top speed (`accelOf` still caps it), so the last few yd/s come gradually.
 */
const BURST = 19;
const BURST_TAPER = 0.6;
/** Braking into a break (yd/s²), down to `cutKeep` of top speed at the waypoint. */
const PLANT_DECEL = 14;
/** Seconds to turn and square up to the QB at the top of a settle route, less with `acc`. */
const TURN_TIME = 0.35;
/** A set receiver moving faster than this (yd/s) has to be coming back to the QB to stay set. */
const SET_MAX_SPEED = 3;

/** Share of top speed a receiver carries through a turn of `turnDeg`; sharper route runners (`rte`) keep more. */
export function cutKeep(turnDeg: number, rte: number): number {
  if (turnDeg < 20) return 1;
  return clamp(1 - (0.7 * (turnDeg - 20)) / 160 + (rte - 75) * 0.004, 0.25, 1);
}

function turnTime(p: Player): number {
  return TURN_TIME - (0.15 * p.r.rte) / 100;
}

/**
 * 0..1: how set a receiver is to catch, squared up to the QB at the top of a settle route.
 * Zero on routes caught in stride, during the turn's start, and once he drifts away from the QB.
 */
export function facingQB(p: Player, qb: Player, time: number): number {
  if (!p.settle || time < p.turnAt) return 0;
  const v = len(p.vel);
  if (v > SET_MAX_SPEED) {
    const toQb = norm(sub(qb.pos, p.pos));
    if ((p.vel.x * toQb.x + p.vel.y * toQb.y) / v < 0.3) return 0;
  }
  return clamp((time - p.turnAt) / turnTime(p), 0, 1);
}

function runRoute(play: Play, p: Player): void {
  let sp = maxSpeed(p) * 0.95;
  if (p.jam > 0) sp *= 0.45;
  while (p.routeIdx < p.route.length && dist(p.pos, p.route[p.routeIdx]) < 0.7) p.routeIdx++;

  if (p.passRoute) {
    // Burst: strong from a standstill (the release, out of a plant), gentle near top speed.
    const v = len(p.vel);
    const burst = BURST * (0.8 + (0.4 * p.r.rte) / 100) * (1 - (BURST_TAPER * v) / sp);
    sp = Math.min(sp, v + burst * STEP);
    // Plant: brake into a sharp break so it's cut tight rather than rounded off at full speed.
    if (p.routeIdx < p.route.length) {
      const vb = maxSpeed(p) * 0.95 * p.cutKeep[p.routeIdx];
      sp = Math.min(sp, Math.sqrt(vb * vb + 2 * PLANT_DECEL * dist(p.pos, p.route[p.routeIdx])));
    }
    // A settle route turns to the QB as he comes back down the final leg, or once he stops.
    if (p.settle && p.turnAt === Infinity) {
      const n = p.route.length;
      const comesBack = n >= 2 && p.route[n - 1].x < p.route[n - 2].x;
      if (p.routeIdx >= n || (comesBack && p.routeIdx === n - 1)) p.turnAt = play.time;
    }
  }

  if (p.pos.x > 118.5) {
    p.want = ZERO; // back of the end zone: sit down
  } else if (p.routeIdx < p.route.length) {
    p.want = scale(norm(sub(p.route[p.routeIdx], p.pos)), sp);
  } else if (p.routeDir) {
    let d = p.routeDir;
    if ((p.pos.y < 1.5 && d.y < 0) || (p.pos.y > FIELD_W - 1.5 && d.y > 0)) d = { x: 1, y: 0 };
    p.want = scale(d, sp);
  } else if (p.thenBlock) {
    // Play-action fake carried out: stay in and protect, starting with the man who was covering him.
    p.isBlocker = true;
    p.thenBlock = false;
    p.lateBlock = true;
    p.mark = play.def.find((d) => d.manTarget === p && !d.down) ?? null;
    passBlock(play, p);
  } else {
    p.want = ZERO; // settled in a curl/hitch window
    if (!p.settle || play.time >= p.turnAt + turnTime(p)) p.facing = play.qb.pos.x < p.pos.x ? -1 : 1;
  }
}

/**
 * Defender currently attacking the QB: called rushers plus man defenders whose
 * guy stayed in to block from the snap. A back who stays in after a play-action
 * fake doesn't trigger the hug rush; his defender sits underneath instead.
 */
export function isRusher(d: Player): boolean {
  const t = d.manTarget;
  return d.assign?.kind === 'rush' || (d.assign?.kind === 'man' && !!t?.isBlocker && !t.lateBlock && !t.stalk);
}

/** Defenders who are facing the QB when he throws and can break on the ball right away. */
export function seesThrow(d: Player): boolean {
  return d.assign?.kind !== 'man' || !d.turned || d.role === 'LB' || !!d.manTarget?.isBlocker;
}

function pickRusher(play: Play, p: Player): Player | null {
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const d of play.def) {
    if (d.down || !isRusher(d)) continue;
    const dd = dist(d.pos, p.pos);
    if (dd > 8) continue;
    const helpers = play.off.filter((o) => o.mark === d).length;
    const score = dd + helpers * 6;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function passBlock(play: Play, p: Player): void {
  const qb = play.qb;
  if (!p.mark || p.mark.down || p.mark === play.carrier) p.mark = pickRusher(play, p);
  if (p.mark) {
    const r = p.mark;
    let tgt = add(r.pos, scale(norm(sub(qb.pos, r.pos)), 0.9));
    // A back who's only selling pass before his route (screen, draw, check-release) stays near his spot.
    if (!p.isBlocker) tgt = add(p.start, limit(sub(tgt, p.start), DELAY_SET_RANGE));
    p.want = seek(p, tgt, maxSpeed(p) * 0.95, 0.4);
  } else {
    p.want = seek(p, { x: Math.max(qb.pos.x + 1.5, play.los - 2), y: p.start.y }, maxSpeed(p) * 0.6);
  }
}

function downfieldBlock(play: Play, p: Player, c: Player): void {
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const d of play.def) {
    if (d.down || d.engagedBy.length) continue;
    const dc = dist(d.pos, c.pos);
    const dp = dist(d.pos, p.pos);
    if (dc > 12 || dp > 9) continue;
    const score = dp + dc * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  if (best) {
    p.want = seek(p, add(best.pos, scale(norm(sub(c.pos, best.pos)), 0.8)), maxSpeed(p) * 0.95, 0.3);
  } else {
    p.want = seek(p, add(c.pos, { x: 4, y: p.pos.y < c.pos.y ? -3 : 3 }), maxSpeed(p) * 0.8, 1);
  }
}

// ---------------------------------------------------------------- defense

export function thinkDefense(play: Play, d: Player): void {
  if (play.phase === 'over' && d === play.recoverer && !d.down) {
    // A ball knocked loose after the play (a key-play replay): go fall on it.
    d.want = seek(d, play.ball.pos, maxSpeed(d), 0.3);
    return;
  }
  if (d.down || d.stun > 0 || play.phase === 'presnap' || play.phase === 'over') {
    d.want = ZERO;
    return;
  }
  const c = play.carrier;
  if (d.engagedBy.length) {
    d.goal = c ? c.pos : play.ballTarget ?? play.qb.pos;
    return;
  }
  // Interception return: escort the returner.
  if (c && c.side === 'def') {
    d.want = seek(d, add(c.pos, { x: -4, y: 0 }), maxSpeed(d) * 0.8);
    return;
  }
  if (play.phase === 'run' && c && play.time >= d.reactAt) {
    d.goal = c.pos;
    // Running through the line's bodies (blocked or not) costs speed: pursuit has to work through trash.
    // Linemen are the trash, and a defender closing on the carrier has already got through it.
    const trash =
      c.side === 'off' && d.role !== 'DL' && d.pos.x < play.los + 3 && dist(d.pos, c.pos) > 2 &&
      play.off.some((o) => o.isBlocker && !o.down && o !== c && dist(o.pos, d.pos) < TRASH_RANGE);
    pursue(d, c, trash ? TRASH_SPEED : 1, PURSUIT_LEAD);
    return;
  }
  if (play.phase === 'air' && play.ballTarget && play.time >= d.reactAt) {
    d.want = seekTimed(d, play.ballTarget, play.ballTimeLeft());
    return;
  }
  if (play.scramble && c === play.qb && play.time >= d.reactAt) {
    d.goal = c.pos;
    pursue(d, c, 1, PURSUIT_LEAD);
    return;
  }
  if (d === play.readKey && (play.phase === 'snap' || (play.phase === 'live' && c === play.qb))) {
    readKey(play, d);
    return;
  }
  if (play.phase === 'live' && play.time >= d.fitAt && play.time < d.fitUntil) {
    runFit(play, d);
    return;
  }
  runAssignment(play, d);
}

/**
 * Read run (or bite on the fake): come downhill into the defender's own gap,
 * shading toward the play side. Fitting the exact hole would make every
 * linebacker clairvoyant; the back has to find the crease.
 */
function runFit(play: Play, d: Player): void {
  const depth = d.role === 'S' ? 4 : d.role === 'CB' ? 3 : LB_FIT_DEPTH;
  const tgt = { x: play.los + depth, y: lerp(d.start.y, play.hole.y, 0.35) };
  d.goal = tgt;
  d.want = seek(d, tgt, maxSpeed(d) * 0.95, 0.6);
}

/**
 * Zone-read key: crash down the line on the back, or stay home and squeeze, keeping outside leverage on the QB.
 * Option key: take the QB ("crash"), or widen with the pitch man.
 */
function readKey(play: Play, d: Player): void {
  if (play.playDef.read === 'option') {
    if (play.keyCrash) {
      d.goal = play.qb.pos;
      pursue(d, play.qb, 0.9);
      return;
    }
    // Take the pitch: widen along the line with the pitch man, staying just outside him.
    const out = Math.sign(d.start.y - play.ballY) || 1;
    const tgt = { x: play.los + 0.6, y: play.rb.pos.y + out };
    d.goal = tgt;
    d.want = seek(d, tgt, maxSpeed(d) * 0.9, 0.5);
    return;
  }
  if (play.keyCrash) {
    d.goal = play.rb.pos;
    pursue(d, play.rb, 0.95);
    return;
  }
  const tgt = { x: play.los + 0.8, y: lerp(d.start.y, play.qb.pos.y, 0.25) };
  d.goal = tgt;
  d.want = seek(d, tgt, maxSpeed(d) * 0.5, 0.5);
}

function runAssignment(play: Play, d: Player): void {
  const a = d.assign;
  if (!a) {
    d.want = ZERO;
    return;
  }
  switch (a.kind) {
    case 'rush':
      rush(play, d);
      break;
    case 'man':
      // Man defender whose guy stays in to block: "hug" rush after a beat.
      if (d.manTarget?.lateBlock) {
        robber(play, d);
      } else if (d.manTarget?.isBlocker && !d.manTarget.stalk) {
        if (play.time - play.snapTime > 0.6) rush(play, d);
        else d.want = ZERO;
      } else {
        cover(play, d);
      }
      break;
    case 'deep':
      deepZone(play, d, a.yMin, a.yMax);
      break;
    case 'robber':
      robber(play, d);
      break;
  }
}

function rush(play: Play, d: Player): void {
  if (play.phase === 'air' && play.ballTarget) {
    d.want = seek(d, play.ballTarget, maxSpeed(d) * 0.75);
    return;
  }
  if (play.phase === 'run' && play.carrier) {
    pursue(d, play.carrier, 0.9, PURSUIT_LEAD);
    return;
  }
  if (d.role !== 'DL' && play.time - play.snapTime < 0.4) {
    d.want = ZERO; // blitzers time their run
    return;
  }
  d.goal = play.qb.pos;
  pursue(d, play.qb, 0.95);
}

function cover(play: Play, d: Player): void {
  const r = d.manTarget;
  if (!r) {
    d.want = ZERO;
    return;
  }
  // Defenders react to what the receiver did a moment ago; better man coverage = shorter lag.
  const lagFrames = Math.round((0.6 - (d.r.mcv / 100) * 0.35) * 60);
  const hist = play.history.get(r.id);
  const lp = hist && hist.length ? hist[Math.max(0, hist.length - 1 - lagFrames)] : r.pos;
  const since = play.time - play.snapTime;
  const cushion = d.press ? 0.8 : Math.max(1.0, d.cushion - since * 2.2);
  const inside = Math.sign(play.ballY - lp.y) * 0.6;
  // A man still behind the line gets played from just past it: read him, don't chase him into the backfield.
  const tgt = { x: Math.max(lp.x + cushion, play.los + MAN_DEPTH), y: lp.y + inside };
  let sp = maxSpeed(d);
  if (!d.turned) {
    if (r.pos.x > d.pos.x - 2.5 || since > 1.2) d.turned = true;
    else sp *= 0.72; // backpedal
  }
  d.want = seek(d, tgt, sp, 0.8);
}

function deepZone(play: Play, d: Player, yMin: number, yMax: number): void {
  const mid = (yMin + yMax) / 2;
  let deepest: Player | null = null;
  for (const o of play.off) {
    if (!isEligible(o) || o.isBlocker || o.down) continue;
    if (o.pos.y < yMin || o.pos.y > yMax || o.pos.x < play.los + 4) continue;
    if (!deepest || o.pos.x > deepest.pos.x) deepest = o;
  }
  let tx = play.los + 12;
  let ty = mid;
  if (deepest) {
    tx = Math.max(tx, deepest.pos.x + 5);
    ty = lerp(mid, deepest.pos.y, deepest.pos.x > play.los + 10 ? 0.75 : 0.35);
  }
  d.want = seek(d, { x: Math.min(tx, 119), y: ty }, maxSpeed(d) * 0.92, 1.5);
}

function robber(play: Play, d: Player): void {
  const home = { x: play.los + 8, y: play.ballY };
  let best: Player | null = null;
  let bd = Infinity;
  for (const o of play.off) {
    if (!isEligible(o) || o.isBlocker || o.down) continue;
    const dd = dist(o.pos, home);
    if (dd < 10 && dd < bd) {
      bd = dd;
      best = o;
    }
  }
  const tgt = best ? { x: best.pos.x + 1.5, y: best.pos.y } : home;
  d.want = seek(d, tgt, maxSpeed(d) * 0.9, 1);
}

/**
 * Simple ball-carrier AI (used when no human is steering, e.g. the balance
 * harness): read the line for the best crease near the designed hole, hit it,
 * then get downfield, sliding away from tacklers.
 */
export function autoRun(play: Play, c: Player): void {
  if (c.down) {
    c.want = ZERO;
    return;
  }
  let dir: Vec = { x: 1, y: 0 };
  if (c.pos.x < play.los + 1) {
    if (c.pos.x < play.los - 0.5 || Number.isNaN(play.laneY)) play.laneY = pickLane(play, c); // commit at the line
    dir = norm(sub({ x: Math.max(c.pos.x + 2, play.los + 1.5), y: play.laneY }, c.pos));
  }
  for (const d of play.def) {
    if (d.down || d.pos.x < c.pos.x - 1) continue;
    const dd = dist(d.pos, c.pos);
    if (dd < 5) {
      const away = norm(sub(c.pos, d.pos));
      dir.y += away.y * ((5 - dd) / 5) * (d.engagedBy.length ? 0.6 : 1.1); // blocked defenders still grab
    }
  }
  if (c.pos.y < 3) dir.y += 0.6;
  if (c.pos.y > FIELD_W - 3) dir.y -= 0.6;
  dir.x = Math.max(dir.x, 0.3);
  c.want = scale(norm(dir), maxSpeed(c) * 0.95);
}

/** Returner (interceptions and kick returns): run for the user's end zone, slipping away from nearby tacklers. */
export function returnerAI(play: { off: Player[]; phase: string }, c: Player): void {
  if (c.down || play.phase === 'over') {
    c.want = ZERO;
    return;
  }
  const dir = { x: -1, y: 0 };
  for (const o of play.off) {
    if (o.down) continue;
    const dd = dist(o.pos, c.pos);
    if (dd < 7) {
      const away = norm(sub(c.pos, o.pos));
      const w = (7 - dd) / 7;
      dir.x += away.x * w * 0.6;
      dir.y += away.y * w * 1.4;
    }
  }
  if (c.pos.y < 3) dir.y += 0.6;
  if (c.pos.y > FIELD_W - 3) dir.y -= 0.6;
  dir.x = Math.min(dir.x, -0.3);
  c.want = scale(norm(dir), maxSpeed(c));
}
