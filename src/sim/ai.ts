import { FIELD_W } from '../engine/constants';
import { add, clamp, dist, lerp, norm, scale, sub, type Vec } from '../engine/math';
import type { Play } from '../game/playState';
import { isEligible, maxSpeed, seek, seekTimed, type Player } from './player';

const ZERO: Vec = { x: 0, y: 0 };

/** Chase a ball carrier, aiming at where they will be rather than where they are. */
export function pursue(p: Player, c: Player, speedMul = 1): void {
  const sp = maxSpeed(p) * speedMul;
  const t = clamp(dist(p.pos, c.pos) / sp, 0, 1.2) * 0.85;
  p.want = seek(p, add(c.pos, scale(c.vel, t)), sp, 0.1);
}

// ---------------------------------------------------------------- offense

export function thinkOffense(play: Play, p: Player): void {
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
    downfieldBlock(play, p, c);
    return;
  }
  if (p.role === 'QB') {
    p.want = play.phase === 'snap' ? seek(p, play.qbDrop, maxSpeed(p) * 0.8, 0.8) : ZERO;
    return;
  }
  if (play.phase === 'air' && p === play.intended && play.ballTarget) {
    p.want = seekTimed(p, play.ballTarget, play.ballTimeLeft());
    return;
  }
  if (p.isBlocker) {
    if (play.playDef.block === 'run') runBlock(play, p);
    else passBlock(play, p);
    return;
  }
  runRoute(play, p);
}

function runRoute(play: Play, p: Player): void {
  let sp = maxSpeed(p) * 0.95;
  if (p.jam > 0) sp *= 0.45;
  while (p.routeIdx < p.route.length && dist(p.pos, p.route[p.routeIdx]) < 0.7) p.routeIdx++;

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
    p.facing = play.qb.pos.x < p.pos.x ? -1 : 1;
  }
}

/**
 * Defender currently attacking the QB: called rushers plus man defenders whose
 * guy stayed in to block from the snap. A back who stays in after a play-action
 * fake doesn't trigger the hug rush; his defender sits underneath instead.
 */
export function isRusher(d: Player): boolean {
  const t = d.manTarget;
  return d.assign?.kind === 'rush' || (d.assign?.kind === 'man' && !!t?.isBlocker && !t.lateBlock);
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
    const tgt = add(r.pos, scale(norm(sub(qb.pos, r.pos)), 0.9));
    p.want = seek(p, tgt, maxSpeed(p) * 0.95, 0.4);
  } else {
    p.want = seek(p, { x: Math.max(qb.pos.x + 1.5, play.los - 2), y: p.start.y }, maxSpeed(p) * 0.6);
  }
}

/** Nearest unblocked defender in front of a run blocker, preferring ones nobody has yet. The zone-read key is left alone. */
function pickRunTarget(play: Play, p: Player): Player | null {
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const d of play.def) {
    if (d.down || d === play.readKey || d.pos.x < p.pos.x - 1) continue;
    const dd = dist(d.pos, p.pos);
    if (dd > 8) continue;
    const helpers = play.off.filter((o) => o !== p && o.mark === d).length;
    const score = dd + helpers * 5;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Puller: run flat behind the line to the playside, then pick up the kick-out
 * (first man outside the hole) or the lead block (first backer in it).
 * Returns false once he has someone, so the normal run block takes over.
 */
function pullBlock(play: Play, p: Player): boolean {
  const hole = play.hole;
  const playSign = Math.sign(hole.y - play.ballY) || play.resolved.strongSign;
  const spotY = hole.y + (p.pull === 'kick' ? playSign * 2.5 : 0);
  if (Math.abs(p.pos.y - spotY) > 1.2) {
    p.want = seek(p, { x: Math.min(p.start.x - 0.8, play.los - 1), y: spotY }, maxSpeed(p) * 0.95, 0.3);
    return true;
  }
  const taken = new Set(play.off.map((o) => o.mark));
  let best: Player | null = null;
  for (const d of play.def) {
    if (d.down || taken.has(d) || dist(d.pos, p.pos) > 7) continue;
    if (p.pull === 'kick' ? (d.pos.y - hole.y) * playSign < -1 : d.role !== 'LB' && d.role !== 'S') continue;
    if (!best || dist(d.pos, p.pos) < dist(best.pos, p.pos)) best = d;
  }
  p.pull = null;
  p.mark = best;
  return false;
}

/** Fire off the ball and wall the defender off from the hole. */
function runBlock(play: Play, p: Player): void {
  const hole = play.hole;
  if (p.pull && !p.mark && pullBlock(play, p)) return;
  if (!p.mark || p.mark.down || p.mark === play.carrier) p.mark = pickRunTarget(play, p);
  if (p.mark) {
    const r = p.mark;
    const tgt = add(r.pos, scale(norm(sub(hole, r.pos)), 0.9));
    p.want = seek(p, tgt, maxSpeed(p) * 0.95, 0.3);
  } else {
    p.want = seek(p, { x: play.los + 2.5, y: lerp(p.start.y, hole.y, 0.3) }, maxSpeed(p) * 0.7);
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
    pursue(d, c);
    return;
  }
  if (play.phase === 'air' && play.ballTarget && play.time >= d.reactAt) {
    d.want = seekTimed(d, play.ballTarget, play.ballTimeLeft());
    return;
  }
  if (play.scramble && c === play.qb && play.time >= d.reactAt) {
    d.goal = c.pos;
    pursue(d, c);
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
  const depth = d.role === 'S' ? 4.5 : d.role === 'CB' ? 3 : 1.8;
  const tgt = { x: play.los + depth, y: lerp(d.start.y, play.hole.y, 0.35) };
  d.goal = tgt;
  d.want = seek(d, tgt, maxSpeed(d) * 0.95, 0.6);
}

/** Zone-read key: crash down the line on the back, or stay home and squeeze, keeping outside leverage on the QB. */
function readKey(play: Play, d: Player): void {
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
      } else if (d.manTarget?.isBlocker) {
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
    pursue(d, play.carrier, 0.9);
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
  // Defenders react to what the receiver did a moment ago; better awareness = shorter lag.
  const lagFrames = Math.round((0.6 - (d.r.awr / 100) * 0.35) * 60);
  const hist = play.history.get(r.id);
  const lp = hist && hist.length ? hist[Math.max(0, hist.length - 1 - lagFrames)] : r.pos;
  const since = play.time - play.snapTime;
  const cushion = d.press ? 0.8 : Math.max(1.0, d.cushion - since * 2.2);
  const inside = Math.sign(play.ballY - lp.y) * 0.6;
  const tgt = { x: lp.x + cushion, y: lp.y + inside };
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
 * harness): hit the hole, then get downfield, sliding away from tacklers.
 */
export function autoRun(play: Play, c: Player): void {
  if (c.down) {
    c.want = ZERO;
    return;
  }
  const h = play.hole;
  const dir =
    c.pos.x < play.los + 1 ? norm(sub({ x: Math.max(h.x, play.los + 1.5), y: h.y }, c.pos)) : { x: 1, y: 0 };
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
