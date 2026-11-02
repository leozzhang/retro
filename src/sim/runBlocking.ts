import { add, clamp, dist, lerp, norm, scale, sub, type Vec } from '../engine/math';
import type { Play } from '../game/playState';
import { LEAN_FX, maxSpeed, seek, type Player } from './player';
import { runBlockValue } from '../data/ratings';

/**
 * Run blocking: who blocks whom at the snap (by scheme), how a run block moves
 * the defender once engaged (drive and wash), when he can get off it (leverage),
 * and how the auto-runner picks a lane. Pass pro lives in `ai.ts` / `Play`.
 */

/** Drive-block advantage for the OL on designed runs (subtracted from the defender's power). */
export const RUN_BLOCK_EDGE = 3;
/** Stretch (reach) blocks are the hardest in football: the blocker gives up this much of his edge. */
export const REACH_PENALTY = 4;
/** Spread of each run block's outcome, in rating points, rolled when the block is made. */
export const BLOCK_ROLL_SD = 8;
/** A double team's advantage over a one-on-one, in rating points. */
const DOUBLE_TEAM = 15;
/** Yards/s of movement per point of power the blocker wins by. */
const DRIVE_RATE = 0.08;
/** Sideways part of a winning run block's push, relative to the downfield part (moving him off the hole). */
export const WASH_RATE = 1.2;
/** How fast a winning defender works around his blocker toward the ball (per point of power, per second). */
const WORK_RATE = 0.05;
/** Combos: the second blocker comes off the double team for the backer this long after the snap, by scheme. */
export const COMBO_CLIMB: Record<'zone' | 'stretch' | 'gap', number> = { zone: 0.55, stretch: 0.3, gap: 0.5 };
/** He also comes off early once the backer declares: this close to him, or this close to the line. */
const CLIMB_TRIGGER = 3;
/** Blocker counts as between his man and the ball (leverage) above this alignment (cosine). */
export const LEVERAGE_DOT = 0.35;
/** Shed rate (per second) for a defender winning his run block, before his margin. */
export const SHED_WIN = 0.4;
/** Shed rate (per second) for a levered defender the ball carrier runs past. */
export const SHED_LEVERED = 0.6;
/** Arm-tackle odds multiplier for a defender his blocker still has leverage on. */
export const ARM_LEVERED = 0.3;
/** A run blocker gets his hands on his assigned man from this far (pass pro and loose blocks use 1 yd). */
export const RUN_ENGAGE = 1.4;
/** A lead blocker on his path takes the first unclaimed defender this close in front of him. */
const LEAD_PICKUP = 1.8;
/** A hinging tackle holds his spot this long (seconds after the snap) before working up to the next threat. */
const HINGE_HOLD = 1;
/** A puller turns up into the hole this far (sideways) before he gets to it. */
const PULL_TURN = 1;
/** Draw: the line shows pass for this long, then turns its men away from the back. */
export const DRAW_SET = 0.7;
/** A blocked defender this far from the carrier on the backside of the play (or behind him) peels off to pursue. */
const PEEL_DIST = 8;
/** He counts as backside once he's this far behind the carrier, across the field or downfield. */
const PEEL_BACKSIDE = 2;
/** Auto-runner lane scan: how far either side of the designed hole a zone run reads (cutbacks). */
export const ZONE_READ_W = 6;
/** Gap runs stay this close to the designed hole. */
const GAP_READ_W = 2.5;

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;

/** Defenders some blocker already has, or is climbing to. */
function claimed(play: Play): Set<Player | null> {
  return new Set(play.off.flatMap((o) => [o.mark, o.climb]));
}

/** +1 if the play hits toward +y. */
export function playSide(play: Play): 1 | -1 {
  return (Math.sign(play.hole.y - play.ballY) || play.resolved.strongSign) as 1 | -1;
}

/** Defenders in the box who aren't down linemen: the backers a climbing lineman looks for. */
function boxDefenders(play: Play): Player[] {
  return play.def.filter(
    (d) => d.role !== 'DL' && d !== play.readKey && d.pos.x <= play.los + 7 && Math.abs(d.pos.y - play.ballY) <= 7.5,
  );
}

/**
 * Snap-time run blocking. The line (OL plus inline blockers) is ordered playside first.
 * - zone / stretch: each lineman takes the man over him or in his playside gap.
 * - gap / trap: each lineman blocks down (the man over him or in his inside gap).
 * Uncovered linemen double a neighbour's man (playside first) and climb to a backer at
 * `COMBO_CLIMB`. On gap schemes the backside tackle hinges into the gap a puller left.
 * On a trap the first lineman playside of the center is left for the pulling guard.
 * Everyone else (receivers, backs) stalks the nearest defender in front of him.
 */
export function assignRunBlocks(play: Play): void {
  const scheme = play.runScheme;
  const side = playSide(play);
  const along = (p: Player) => (p.pos.y - play.ballY) * side; // + = playside
  const isLine = (o: Player) =>
    o.isBlocker && !o.pull && !o.route.length && o.role !== 'QB' &&
    (o.role === 'OL' || (o.pos.x > play.los - 1.5 && Math.abs(o.pos.y - play.ballY) < 6.5));
  let line = play.off.filter(isLine).sort((a, b) => along(b) - along(a));
  let dl = play.def.filter((d) => d.role === 'DL' && d !== play.readKey);
  const down = scheme === 'gap' || scheme === 'trap';

  // Gap scheme with a puller: the backside tackle hinges to the gap the puller left and takes whoever
  // comes through it. The backside end is left alone; he's chasing from behind.
  const puller = play.off.find((o) => o.pull);
  const ol = line.filter((o) => o.role === 'OL');
  const backside = ol[ol.length - 1];
  if (down && puller && backside && (backside.slot === 'LT' || backside.slot === 'RT')) {
    backside.hinge = { x: play.los - 0.6, y: lerp(backside.pos.y, puller.pos.y, 0.7) };
    line = line.filter((o) => o !== backside);
    const end = dl.filter((d) => along(d) < along(backside) + 0.7).sort((a, b) => along(a) - along(b))[0];
    if (end) dl = dl.filter((d) => d !== end);
  }

  if (scheme === 'trap') {
    const trapped = dl.filter((d) => along(d) >= -0.3 && along(d) <= 2.8).sort((a, b) => along(a) - along(b))[0];
    if (trapped && puller) {
      puller.pullTarget = trapped;
      dl = dl.filter((d) => d !== trapped);
    }
  }

  // Offsets (playside +) of the defender relative to the blocker that count as "his man", and the ideal one.
  const [lo, hi, pref] = down ? [-2.2, 0.7, -0.6] : [-0.7, 2.1, 0.4];
  const covered = new Map<Player, Player>();
  const taken = new Set<Player>();
  for (const b of line) {
    let best: Player | null = null;
    for (const d of dl) {
      if (taken.has(d)) continue;
      const o = along(d) - along(b);
      if (o < lo || o > hi) continue;
      if (!best || Math.abs(o - pref) < Math.abs(along(best) - along(b) - pref)) best = d;
    }
    if (best) {
      b.mark = best;
      covered.set(b, best);
      taken.add(best);
    }
  }

  // Cut-off: a down lineman nobody has yet goes to the nearest uncovered lineman (preferring the one playside of him).
  // On gap schemes, linemen well backside of the line (after the pulls) are left to chase from behind.
  const lastLine = Math.min(...line.map(along));
  for (const d of dl) {
    if (taken.has(d) || (down && along(d) < lastLine - 1)) continue;
    let best: Player | null = null;
    const cost = (b: Player) => Math.abs(along(d) - along(b)) + (along(b) < along(d) ? 1.5 : 0);
    for (const b of line) if (!b.mark && b.role === 'OL' && (!best || cost(b) < cost(best))) best = b;
    if (best) {
      best.mark = d;
      covered.set(best, d);
      taken.add(d);
    }
  }

  const backers = boxDefenders(play);
  const climbTaken = new Set<Player>();
  const nearestBacker = (b: Player) => {
    let best: Player | null = null;
    for (const d of backers) {
      if (climbTaken.has(d) || d.pos.x < b.pos.x) continue;
      const score = dist(d.pos, b.pos) + Math.max(0, -(along(d) - along(b))) * 0.6; // prefer playside backers
      if (!best || score < dist(best.pos, b.pos) + Math.max(0, -(along(best) - along(b))) * 0.6) best = d;
    }
    if (best) climbTaken.add(best);
    return best;
  };
  const helped = new Set<Player>();
  line.forEach((b, i) => {
    if (b.mark) return;
    // Help a neighbour (playside first) who has his man; each covered blocker takes one helper.
    const partner = [line[i - 1], line[i + 1]].find((n) => n && covered.has(n) && !helped.has(n));
    const climb = nearestBacker(b);
    if (partner) {
      helped.add(partner);
      b.mark = covered.get(partner)!;
      b.climb = climb;
      b.comboUntil = play.snapTime + COMBO_CLIMB[down ? 'gap' : scheme === 'stretch' ? 'stretch' : 'zone'];
    } else {
      b.mark = climb;
    }
  });

  // Receivers and backs stalk the nearest defender in front of them; uncovered linemen with nobody left take a backer.
  const marked = () => new Set(play.off.map((o) => o.mark).filter(Boolean));
  for (const b of play.off) {
    if (b.mark || !b.isBlocker || b.pull || b.hinge || b.route.length || b.role === 'QB') continue;
    const tk = marked();
    let best: Player | null = null;
    for (const d of play.def) {
      if (tk.has(d) || d === play.readKey || d.pos.x < b.pos.x - 1 || d.role === 'DL') continue;
      if (b.role === 'OL' && d.role !== 'LB') continue;
      if (!best || dist(d.pos, b.pos) < dist(best.pos, b.pos)) best = d;
    }
    b.mark = best;
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
 * (first man outside the hole), the lead block (first backer in it), or on a
 * trap the lineman left for him. Returns false once he has someone, so the
 * normal run block takes over.
 */
function pullBlock(play: Play, p: Player): boolean {
  const hole = play.hole;
  const playSign = playSide(play);
  const trap = p.pullTarget && !p.pullTarget.down ? p.pullTarget : null;
  const spotY = trap ? trap.pos.y - playSign * 0.8 : hole.y + (p.pull === 'kick' ? playSign * 2.5 : 0);
  if (Math.abs(p.pos.y - spotY) > PULL_TURN) {
    // Skip-pull tight to the line so he gets to the hole ahead of the back.
    p.want = seek(p, { x: play.los - 1, y: spotY }, maxSpeed(p), 0.3);
    return true;
  }
  const job = p.pull;
  p.pull = null;
  if (trap) {
    p.mark = trap;
    return false;
  }
  const taken = claimed(play);
  let best: Player | null = null;
  // The man nearest the hole: outside it for a kick-out, a backer for a lead.
  for (const d of play.def) {
    if (d.down || taken.has(d) || dist(d.pos, hole) > 8) continue;
    if (job === 'kick' ? (d.pos.y - hole.y) * playSign < -1 : d.role !== 'LB' && d.role !== 'S') continue;
    if (!best || dist(d.pos, hole) < dist(best.pos, hole)) best = d;
  }
  p.mark = best;
  return false;
}

/** Hinge: hold the spot inside and take the first defender who comes through it. */
function hingeBlock(play: Play, p: Player): boolean {
  const spot = p.hinge!;
  const taken = claimed(play);
  let best: Player | null = null;
  for (const d of play.def) {
    if (d.down || taken.has(d) || d.pos.x > play.los + 2.5) continue;
    const dd = dist(d.pos, spot);
    if (dd < 3 && (!best || dd < dist(best.pos, spot))) best = d;
  }
  if (best || play.time - play.snapTime > HINGE_HOLD) {
    // Nobody came: work up to the nearest threat like any run blocker.
    p.mark = best;
    p.hinge = null;
    return false;
  }
  p.want = seek(p, spot, maxSpeed(p) * 0.8, 0.4);
  return true;
}

/**
 * Lead blocker (FB, H-back, slicing TE): run the path and take the first defender who shows up in
 * front of him. Returns false once he has someone, or at the end of the path.
 */
function leadBlock(play: Play, p: Player): boolean {
  while (p.routeIdx < p.route.length && dist(p.pos, p.route[p.routeIdx]) < 0.7) p.routeIdx++;
  if (p.routeIdx >= p.route.length) return false;
  const taken = claimed(play);
  for (const d of play.def) {
    if (d.down || taken.has(d) || d.pos.x < p.pos.x - 0.5 || dist(d.pos, p.pos) > LEAD_PICKUP) continue;
    p.mark = d;
    return false;
  }
  p.want = seek(p, p.route[p.routeIdx], maxSpeed(p) * 0.95, 0.3);
  return true;
}

/** Fire off the ball and wall the defender off from the hole. */
export function runBlock(play: Play, p: Player): void {
  const hole = play.hole;
  if (!p.mark && p.route.length && leadBlock(play, p)) return;
  if (p.pull && !p.mark && pullBlock(play, p)) return;
  if (p.hinge && !p.mark && hingeBlock(play, p)) return;
  if (p.climb && (play.time >= p.comboUntil || p.climb.down)) {
    // Never got onto the double team: go straight to the backer.
    p.mark = p.climb.down ? null : p.climb;
    p.climb = null;
  }
  if (!p.mark || p.mark.down || p.mark === play.carrier) p.mark = pickRunTarget(play, p);
  if (p.mark) {
    // Take the angle to where he's going (a backer filling fast), and get between him and the ball:
    // the hole until the handoff, then the ball carrier.
    const r = p.mark;
    const sp = maxSpeed(p) * 0.95;
    const at = add(r.pos, scale(r.vel, clamp(dist(p.pos, r.pos) / sp, 0, 0.6)));
    const c = play.carrier;
    const ref = c && c.side === 'off' && play.phase === 'run' ? c.pos : hole;
    const tgt = { x: at.x - 0.25, y: at.y + Math.sign(ref.y - at.y) * 0.75 };
    p.want = seek(p, tgt, sp, 0.3);
  } else {
    p.want = seek(p, { x: play.los + 2.5, y: lerp(p.start.y, hole.y, 0.3) }, maxSpeed(p) * 0.7);
  }
}

/** A double-team's second blocker comes off for the backer on time, or early if the backer comes to him. */
export function releaseClimbers(play: Play): void {
  for (const b of play.off) {
    const lb = b.climb;
    const d = b.engaged;
    if (!lb || !d) continue;
    const declared = dist(lb.pos, b.pos) < CLIMB_TRIGGER || lb.pos.x < play.los + CLIMB_TRIGGER;
    if (play.time < b.comboUntil && !declared && !lb.down) continue;
    d.engagedBy = d.engagedBy.filter((o) => o !== b);
    b.engaged = null;
    b.mark = lb.down ? null : lb;
    b.climb = null;
  }
}

/** Which way a winning block pushes the defender sideways: away from the hole (or away from the blocker if he's on it). */
function washSign(play: Play, d: Player): number {
  const off = d.pos.y - play.hole.y;
  if (Math.abs(off) > 0.5) return Math.sign(off);
  return -Math.sign(d.blockDir?.y ?? 0) || 1;
}

/**
 * One step of a run block. The blocker's edge over the defender (`power`, negative = the
 * blocker is winning) sets where the pile goes: a winning block drives the defender back
 * and washes him off the hole, a losing one gets pushed back toward the ball while the
 * defender works around it. Returns the defender's shed rate (per second) this step.
 */
export function runEngagement(play: Play, d: Player): number {
  const n = d.engagedBy.length;
  const goal = d.goal ?? play.qb.pos;
  const toGoal = norm(sub(goal, d.pos));
  const blk = d.engagedBy.reduce((s, b) => s + runBlockValue(b.r), 0) / n;
  const edge = RUN_BLOCK_EDGE - (play.runScheme === 'stretch' ? REACH_PENALTY : 0);
  // A lineman sitting on the run gets off the ball into it (`LEAN_FX.surge`).
  const surge = d.role === 'DL' ? Math.max(0, d.lean.run) * LEAN_FX.surge : 0;
  const power = d.r.bsh * 0.7 + d.r.spd * 0.3 - blk - (n - 1) * DOUBLE_TEAM - edge + d.blockRoll + surge;
  d.blockDir ??= norm(sub(d.engagedBy[0].pos, d.pos));
  let move: Vec;
  if (power > 0) {
    d.blockDir = norm(sub(d.blockDir, scale(toGoal, power * WORK_RATE * (1 / 60))));
    move = scale(toGoal, clamp(0.5 + power * 0.09, 0, 2.5));
  } else {
    move = scale(norm({ x: 1, y: washSign(play, d) * WASH_RATE }), Math.min(-power * DRIVE_RATE, 1.6));
  }
  d.want = move;
  for (const b of d.engagedBy) b.want = move;

  // A defender who's winning gets off the block; one who's losing mostly stays on it.
  let shed = (power > 0 ? SHED_WIN + power * 0.06 : 0.08) / Math.pow(n, 1.5);
  const c = play.carrier;
  if (c && c.side === 'off' && play.phase === 'run') {
    const dc = dist(d.pos, c.pos);
    // The far side of the play peels off to pursue. Playside perimeter blocks (WRs on DBs) are far from
    // the back too while he gets to the edge, but they hold or break on the matchup.
    const backside = (d.pos.y - c.pos.y) * playSide(play) < -PEEL_BACKSIDE || d.pos.x < c.pos.x - PEEL_BACKSIDE;
    if (dc > PEEL_DIST && backside) shed = 2.5;
    else if (dc < 2.5) shed = levered(d, c.pos) ? (SHED_LEVERED * (power > 0 ? 2 : 1)) / n : clamp(2.2 + power * 0.05, 0.8, 5);
  }
  return shed;
}

/** His blocker is between him and `at` (the ball carrier, or a spot the carrier is heading for). */
export function levered(d: Player, at: Vec): boolean {
  return !!d.blockDir && d.engagedBy.length > 0 && dot(d.blockDir, norm(sub(at, d.pos))) > LEVERAGE_DOT;
}

/**
 * Auto-runner lane: scan spots just past the LOS near the designed hole and take the one with
 * the most time to spare: how long the nearest defender needs to get there (blocked defenders
 * take longer, levered ones much longer) minus how long the back needs. Lateral cost is built in.
 */
export function pickLane(play: Play, c: Player): number {
  const h = play.hole;
  const w = play.runScheme === 'gap' || play.runScheme === 'trap' ? GAP_READ_W : ZONE_READ_W;
  const lx = play.los + 0.5;
  const sp = maxSpeed(c);
  let bestY = h.y;
  let bestScore = -Infinity;
  for (let y = h.y - w; y <= h.y + w + 1e-6; y += 0.5) {
    if (y < 2 || y > 51.3) continue;
    const at = { x: lx, y };
    const mine = dist(c.pos, at) / sp;
    let spare = 1.5;
    for (const d of play.def) {
      if (d.down) continue;
      const slow = d.engagedBy.length ? (levered(d, at) ? 3.5 : 1.5) : 1;
      spare = Math.min(spare, (dist(d.pos, at) * slow) / maxSpeed(d) - mine);
    }
    const score = spare - Math.abs(y - h.y) * 0.02 + (Math.abs(y - play.laneY) < 0.01 ? 0.05 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  return bestY;
}
