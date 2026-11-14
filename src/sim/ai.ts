import { FIELD_W, STEP } from '../engine/constants';
import { add, clamp, dist, len, lerp, limit, norm, scale, sub, type Vec } from '../engine/math';
import type { Assign } from '../data/defenses';
import type { Play } from '../game/playState';
import { lanePoint, type AnticRole } from '../game/habits';
import { engagedGoal, fitSpot, runLeverage, runTechnique } from './runFits';
import { accelOf, isEligible, LEAN_FX, maxSpeed, seek, seekTimed, setPose, startJuke, type Player } from './player';
import { CATCH_REACH, PLACEMENT } from './catching';
import { THROWS } from './ball';
import { pickLane, playSide, pressEdge, runBlock } from './runBlocking';
import { passSet, PROT, protecting, rushPath } from './passPro';
import { celebrateWant } from './celebrate';

const ZERO: Vec = { x: 0, y: 0 };
/** Yards a scorer carries on into the end zone after crossing the goal line, before pulling up. Only for show. */
/** A back selling pass before a delayed route steps up to block no more than this far from his spot. */
const DELAY_SET_RANGE = 1.2;
/** The draw's back sets this close to his spot: he sells pass beside the QB and takes the ball there. */
const DRAW_SET_RANGE = 0.6;
/** Backers fit a run this far past the LOS (they read, then fill; they don't meet the back at the line). */
const LB_FIT_DEPTH = 2.8;
/** A backer's fit is this much shallower than his alignment (`runFit`), and no shallower than `LB_FIT_MIN`. */
const LB_FIT_STEP = 0.8;
const LB_FIT_MIN = 1.0;
/** A backer or DB in the box this close to a blocker is working through traffic and runs at `TRASH_SPEED`. */
const TRASH_RANGE = 1.6;
const TRASH_SPEED = 0.85;
/** Man coverage on a player still behind the line: hold this deep past the LOS and read him. */
const MAN_DEPTH = 3;
/**
 * A man defender plays the receiver as he saw him a reaction lag ago (`cover`, by `mcv`), carried `lead` of the
 * lag along the way the receiver was going then. 0 aims at the lagged spot itself, which left him trailing a
 * straight vertical by speed x lag (1.5-2.5 yd) the whole way; 1 trails only on a change of direction.
 */
export const MAN_TRAIL = { lead: 0.5 };

/**
 * How far ahead (seconds) a scrimmage pursuer leads the ball carrier, so deep defenders take an angle
 * instead of chasing. Kick coverage keeps the shorter default lead.
 */
const PURSUIT_LEAD = 2;
/** Past this far beyond the LOS the carrier is in the open field, and pursuers take the intercept angle. */
const OPEN_FIELD = 5;
/** How far inside the sideline route waypoints stop (`buildRoute`), and a continuing route turns upfield. */
export const ROUTE_SIDELINE = 2;

/**
 * Underneath zones (`zoneCover`): each landmark's depth past the LOS, its distance out from the ball
 * (the flat is set from the sideline instead), how far across from it the defender looks for a
 * receiver to sit on, and how much deeper than the landmark he'll carry (sink under) one before
 * letting him go to the deep zone.
 */
const ZONE = {
  mid: { depth: 8, out: 0, area: 7, carry: 6 },
  hook: { depth: 6, out: 4.5, area: 7, carry: 5 },
  curl: { depth: 9, out: 10, area: 9, carry: 6 },
  flat: { depth: 4, out: 7, area: 9, carry: 7 },
};
/**
 * A zone defender with nobody in his area works toward the nearest receiver within `ZONE_HELP` × his
 * area, but no farther than `ZONE_LEASH` from his landmark: he squeezes the hole next to him.
 */
const ZONE_HELP = 1.8;
/**
 * A curl defender widens to the flat: lateral distance outside his landmark counts `ZONE_WIDEN` (inside
 * it, double), and a receiver running out toward the sideline scores `ZONE_OUTSIDE` closer.
 */
const ZONE_WIDEN = 0.5;
const ZONE_OUTSIDE = 3;
/** The receiver a zone defender is already on scores this much closer. */
const ZONE_STICK = 1.5;
const ZONE_LEASH = 5;
/** A deep third or quarter stays this far over the deepest receiver in his band (halves: 5). */
const DEEP_OVER_NARROW = 3;
/** A zone defender sits this far under (QB side of) the receiver in his area. */
const ZONE_UNDER = 1.5;
/**
 * Prevent (`DefTags.prevent`, late with a lead to protect): corners in man start `cushion` yards
 * deeper, and deep zones sit `deep` yards deeper and stay that much farther over the top.
 */
export const PREVENT = { cushion: 3, deep: 4 };
/** A man defender playing off: the cushion he gives closes `close` yd a second from the snap (his backpedal against the stem). */
export const OFF_MAN = { close: 2.2 };
/**
 * Keying a receiver (`DefTags.key`, the DC's read of who's beating him; game/defBrain.ts). On the keyed man:
 * his man defender reacts `lag` sooner to his moves and plays `cushion` yd tighter; underneath zones score
 * him `zone` yd closer, so they rally to him first; a robber within `robber` yd of him takes him; a deep
 * defender with him in his band shades `shade` of the way toward him (help over the top); every defender
 * breaks `react` sooner on a ball to him. The cost: the deep help leaves the other side thinner, and a ball thrown `deepAir`+ yd to him beats his
 * tight man (`deep` slower), and every defender is `others` slower on a ball to anyone else.
 */
/**
 * Anticipating a throw the defense has seen before (game/habits.ts `anticRoles`; docs/DEFENSE.md, "The players
 * learn your throws"). A defender's strength `s` is his `antic` × the read's confidence.
 * - `laneFrom`: from this he sits in the lane: his goal moves `laneW` × s (at most `laneMax`) toward the
 *   point `ahead` yd in front of the expected catch, on the line to the QB, with his eyes on the QB (so a
 *   flat bullet through him can be tipped or picked, `TIP`). The cost: his trail is `lag` × s s later.
 * - `jumpFrom`: from this, within `lead` s of the expected release, he drives to the catch spot before the throw.
 * - `plusFrom`: a backer to a rolling QB's side chases him from this, `plusReact` s after the roll (more with
 *   less play recognition, less the surer he is); the end to that side plays contain.
 * - On the throw: `react` × s faster to the expected throw (to his man, within `near` yd of the spot),
 *   `wrong` × s slower to anything else.
 * - `trap`: the DC's trap (`DefTags.trap`) gives the corner and flat defenders to its side at least this.
 * - `tell`: a corner sitting on it lines up this many yd shallower before the snap (`antic` from `tellFrom`).
 */
export const ANTIC = {
  laneFrom: 0.12, jumpFrom: 0.42, lead: 0.35, plusFrom: 0.2, plusReact: 0.25, trap: 0.8,
  ahead: 2.5, laneW: 1.2, laneMax: 0.85, lag: 0.25, react: 0.35, wrong: 0.3, near: 4, tell: 1, tellFrom: 0.45,
};

export const KEY = { lag: 0.35, cushion: 1, zone: 4, robber: 14, react: 0.3, deep: 0.35, others: 0.12, shade: 0.4 };
/** A spy sits this deep, mirroring the QB across the field. */
const SPY_DEPTH = 5;
/** A contain rusher works to this far outside the QB and doesn't take the inside lane until he's this close. */
const CONTAIN_WIDTH = 2.5;
const CONTAIN_CLOSE = 2.6;
/** A defender sitting on a screen, not in man on someone else, comes for it from this close. */
const SMELL_RANGE = 10;

/**
 * Chase a ball carrier, aiming at where they will be rather than where they are. In the open field
 * (`intercept`), the intercept point: the first spot on his line he can reach in time (`interceptTime`), led
 * at most `lead` s. In the box, and with no intercept (he's behind, or slower), the lead is a fraction of his
 * distance: a runner there is still cutting, and a perfect angle on his last step would overplay him.
 */
export function pursue(p: Player, c: Player, speedMul = 1, lead = 1.2, intercept = false): void {
  const sp = maxSpeed(p) * speedMul;
  const hit = intercept ? interceptTime(p.pos, c.pos, c.vel, sp * PURSUIT_ANGLE) : null;
  const t = hit !== null ? Math.min(hit, lead) : clamp(dist(p.pos, c.pos) / sp, 0, lead) * 0.85;
  p.want = seek(p, add(c.pos, scale(c.vel, t)), sp, 0.1);
}
/** The intercept is solved for this share of his top speed, so he takes an angle he can hold. */
const PURSUIT_ANGLE = 0.92;

/** Seconds until a chaser from `from` at `speed` can meet a target at `at` moving at `vel`; null if never. */
export function interceptTime(from: Vec, at: Vec, vel: Vec, speed: number): number | null {
  const rx = at.x - from.x;
  const ry = at.y - from.y;
  const a = vel.x * vel.x + vel.y * vel.y - speed * speed;
  const b = 2 * (rx * vel.x + ry * vel.y);
  const c = rx * rx + ry * ry;
  if (Math.abs(a) < 1e-6) return b < 0 ? -c / b : null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const q = Math.sqrt(disc);
  const t1 = (-b - q) / (2 * a);
  const t2 = (-b + q) / (2 * a);
  const ts = [t1, t2].filter((t) => t > 0);
  return ts.length ? Math.min(...ts) : null;
}

// ---------------------------------------------------------------- offense

/**
 * The intended receiver going to the ball: first where he'd have been on his own path (`Player.track`,
 * for the catch's grade), then timing his way to it, and laying out for it if he can't get there on his
 * feet (sim/catching.ts `PLACEMENT`).
 */
function adjustToBall(play: Play, p: Player, land: Vec): void {
  const left = play.ballTimeLeft();
  if (!p.track) {
    const v = len(p.vel);
    p.track = { at: add(p.pos, scale(p.vel, left)), dir: v > 1 ? scale(p.vel, 1 / v) : null };
  }
  if (p.diving) {
    p.want = p.vel; // in the air: no steering
    return;
  }
  const gap = dist(p.pos, land);
  if (!play.passTipped && left < PLACEMENT.diveWindow && left > 0) {
    // What he can still cover on his feet, against his reach and what a dive adds.
    const v = len(p.vel);
    const run = Math.min(maxSpeed(p) * left, v * left + 0.5 * accelOf(p) * left * left);
    const reach = CATCH_REACH * THROWS[play.thrownKind].reach;
    const short = gap - run - reach * (1 - PLACEMENT.diveFrom);
    if (short > 0 && gap - Math.max(v, PLACEMENT.diveSpeed) * left < reach + PLACEMENT.diveReach) {
      p.diving = true;
      const dir = scale(sub(land, p.pos), 1 / gap);
      p.vel = scale(dir, Math.max(v, Math.min(PLACEMENT.diveSpeed, (gap - reach * 0.4) / left)));
      p.want = p.vel;
      setPose(p, 'dive', left + 0.6);
      return;
    }
  }
  // A ball out ahead of him on his line he runs through, on time, instead of pulling up on the spot: the
  // catch in stride. Anything behind him or off to the side he sets up for.
  const v = len(p.vel);
  if (v > PLACEMENT.throughSpeed && gap > 0.05 && (p.vel.x * (land.x - p.pos.x) + p.vel.y * (land.y - p.pos.y)) / (v * gap) > PLACEMENT.throughCos) {
    p.want = onTime(p, land, left);
    return;
  }
  p.want = seekTimed(p, land, left);
}

/** Velocity that gets him to `target` in `timeLeft` s at a steady speed (capped at his top speed), not pulling up there. */
function onTime(p: Player, target: Vec, timeLeft: number): Vec {
  const d = sub(target, p.pos);
  const l = len(d);
  if (l < 0.05) return p.vel;
  return scale(d, Math.min(maxSpeed(p), l / Math.max(timeLeft, STEP)) / l);
}

export function thinkOffense(play: Play, p: Player): void {
  if (p.celebrate && !p.down) {
    // The scorer runs it through instead of stopping dead on the goal line, then celebrates.
    p.want = celebrateWant(p);
    return;
  }
  p.faceLock = 0; // a pass set turns it back on (sim/passPro.ts `passSet`)
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
  // He keeps running his route until he finds the ball.
  if (play.phase === 'air' && p === play.intended && play.ballTarget && (play.pitch || play.time >= p.findAt)) {
    // A pitch is led to where the back gets at full tilt, so he runs through the spot rather than timing it.
    const d = sub(play.ballTarget, p.pos);
    if (play.pitch) p.want = len(d) > 0.3 ? scale(norm(d), maxSpeed(p)) : p.vel;
    else adjustToBall(play, p, play.ballTarget);
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

/**
 * Finding the ball (docs/PASSING.md). At the throw, each player's `eyes` turn into `findAt`, when he
 * locates the ball:
 * - a receiver: at the throw with his head around, up to `blind` later (less with `cth`) with it still
 *   downfield; if his head comes around in flight, `base` after that
 * - a defender: his break on the throw (`react`) facing the QB; trailing his man, `trail` of the flight,
 *   and no sooner than `trailLeft` before it comes down (he plays the receiver's hands on a long ball)
 * `settle` is the look he needs before it arrives to play it cleanly (`Contender.ready`).
 * Defenders' `eyes`: `backpedal` for a man defender still facing the QB, `lbMan` for a backer in man,
 * 0 trailing his man with his back turned, 1 for everyone else (zones, spies, rushers).
 */
export const FIND = { base: 0.08, blind: 0.6, settle: 0.25, trail: 0.6, trailLeft: 0.8, backpedal: 0.8, lbMan: 0.7 };

/** 0..1: how much `p` has the QB in view right now (see `Player.eyes`). */
export function eyesOf(play: Play, p: Player): number {
  if (p.side === 'off') {
    if (!p.passRoute || p.isBlocker) return 0;
    if (p.settle) return facingQB(p, play.qb, play.time);
    return clamp((play.time - p.lookAt) / turnTime(p), 0, 1);
  }
  if (p.assign?.kind !== 'man' || p.manTarget?.isBlocker) return 1;
  // Sitting on the throw he expects, he's reading the QB, not his man.
  if (play.antic.get(p)) return 1;
  if (!p.turned) return FIND.backpedal;
  return p.role === 'LB' ? FIND.lbMan : 0;
}

/**
 * When a receiver with `eyes` locates a ball thrown at `time`: looking at the QB, he sees it leave his
 * hand; with his head still downfield, up to `blind` later, less with good hands.
 */
export function receiverFind(p: Player, time: number): number {
  return time + (1 - p.eyes) * FIND.blind * (1.25 - (0.5 * p.r.cth) / 100);
}

/** 0..1: how much of a look he got before the ball arrived at `time` (see `Contender.ready`). */
export function readyAt(p: Player, time: number): number {
  return clamp((time - p.findAt) / FIND.settle, 0, 1);
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
    // His head comes around once he's out of his break (or deep enough on a straight route).
    if (!p.settle && p.lookAt === Infinity && (p.routeIdx >= p.look || p.pos.x - p.start.x >= p.lookDepth)) p.lookAt = play.time;
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
    // Near the sideline the route turns upfield, early enough that his momentum keeps him in bounds.
    const edge = ROUTE_SIDELINE + 0.5;
    if ((p.pos.y < edge && d.y < 0) || (p.pos.y > FIELD_W - edge && d.y > 0)) d = { x: 1, y: 0 };
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

function pickRusher(play: Play, p: Player): Player | null {
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const d of play.def) {
    if (d.down || !isRusher(d)) continue;
    const dd = dist(d.pos, p.pos);
    if (dd > 8) continue;
    // In the pocket a lineman with no man helps on his side; he doesn't cross the formation (`PROT.spareReach`).
    if (p.role === 'OL' && protecting(play) && Math.abs(d.pos.y - p.start.y) > PROT.spareReach) continue;
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
    // On a draw he sells it from beside the QB, so the mesh is there when the delay's up (`DRAW_SET_RANGE`).
    if (!p.isBlocker) tgt = add(p.start, limit(sub(tgt, p.start), play.runScheme === 'draw' ? DRAW_SET_RANGE : DELAY_SET_RANGE));
    // Linemen take their pass sets (sim/passPro.ts): the tackles vertical on the edge, the interior short.
    p.want = passSet(play, p, r) ?? seek(p, tgt, maxSpeed(p) * 0.95, 0.4);
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
    d.goal = c ? engagedGoal(play, d, c.pos) : play.ballTarget ?? play.qb.pos;
    return;
  }
  // Interception return: escort the returner.
  if (c && c.side === 'def') {
    d.want = seek(d, add(c.pos, { x: -4, y: 0 }), maxSpeed(d) * 0.8);
    return;
  }
  if (play.phase === 'run' && c && play.time >= d.reactAt) {
    if (runLeverage(play, d, c)) return;
    d.goal = c.pos;
    // Running through the line's bodies (blocked or not) costs speed: pursuit has to work through trash.
    // Linemen are the trash, and a defender closing on the carrier has already got through it.
    // A chasing backside end flattening behind the line goes through the pullers and the back's path too.
    const trash =
      c.side === 'off' && (d.role !== 'DL' || d.runJob === 'chase') && d.pos.x < play.los + 3 && dist(d.pos, c.pos) > 2 &&
      play.off.some((o) => o.isBlocker && !o.down && o !== c && dist(o.pos, d.pos) < TRASH_RANGE);
    pursue(d, c, trash ? TRASH_SPEED : 1, PURSUIT_LEAD, c.side === 'off' && c.pos.x > play.los + OPEN_FIELD);
    return;
  }
  if (play.phase === 'air' && play.ballTarget && play.time >= d.reactAt) {
    // Broken on the ball, he gets there on time and at speed, through the catch point: he's there to
    // hit the man, not to stop on the spot (a receiver who runs through his catch would leave him standing).
    d.want = onTime(d, play.ballTarget, play.ballTimeLeft());
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
  // He's been sitting on the screen: when the line lets its rushers go, he goes for the target. A
  // lineman, the target's own man, or a defender near him with nobody else to cover.
  const st = play.screenTarget;
  if (
    play.screenReleased && play.phase === 'live' && st && d.lean.screen > LEAN_FX.smell &&
    (d.role === 'DL' || d.manTarget === st || (!d.manTarget && dist(d.pos, st.pos) < SMELL_RANGE))
  ) {
    d.goal = st.pos;
    pursue(d, st, 0.9);
    return;
  }
  // The throw he's seen before: sit in the lane, jump it, or chase the rolling QB (game/habits.ts).
  const an = play.antic.get(d);
  if (an && play.phase === 'live' && play.expect && anticipate(play, d, an)) return;
  runAssignment(play, d);
}

/** Act on the expected throw (`ANTIC`); false leaves him to his assignment. */
function anticipate(play: Play, d: Player, an: { role: AnticRole; s: number }): boolean {
  const e = play.expect!;
  if (an.role === 'jump') {
    d.goal = e.spot;
    d.want = seek(d, e.spot, maxSpeed(d), 0.5);
    return true;
  }
  if (an.role === 'plus') {
    d.goal = play.qb.pos;
    pursue(d, play.qb, 1, PURSUIT_LEAD);
    return true;
  }
  runAssignment(play, d);
  const lp = lanePoint(e.spot, play.qb.pos, ANTIC.ahead);
  const w = Math.min(ANTIC.laneMax, an.s * ANTIC.laneW);
  const to = seek(d, lp, maxSpeed(d) * 0.95, 0.6);
  d.want = { x: lerp(d.want.x, to.x, w), y: lerp(d.want.y, to.y, w) };
  return true;
}

/**
 * Read run (or bite on the fake): come downhill into the defender's own gap,
 * shading toward the play side. Fitting the exact hole would make every
 * linebacker clairvoyant; the back has to find the crease.
 */
function runFit(play: Play, d: Player): void {
  // On a designed run a backer fits a step in front of where he lined up, no deeper than `LB_FIT_DEPTH`: a
  // goal-line or bear backer walked up to 2–3 yd plays downhill from there, not back to the regular fit.
  // (Play action's bite keeps the regular fit.)
  const lbDepth = play.playDef.kind === 'run' ? clamp(d.start.x - play.los - LB_FIT_STEP, LB_FIT_MIN, LB_FIT_DEPTH) : LB_FIT_DEPTH;
  const depth = d.role === 'S' ? 4 : d.role === 'CB' ? 3 : lbDepth;
  const tgt = fitSpot(play, d, depth);
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
    case 'zone':
      zoneCover(play, d, a);
      break;
    case 'spy':
      spy(play, d);
      break;
  }
}

/** Where a zone's landmark is this snap: `side` resolved against the formation's strength. */
export function zoneSpot(play: Play, a: Extract<Assign, { kind: 'zone' }>): Vec {
  const z = ZONE[a.spot];
  const strong = play.resolved.strongSign;
  const side = a.side === 'strong' ? strong : a.side === 'weak' ? -strong : a.side;
  const y = a.spot === 'flat' ? (side < 0 ? z.out : FIELD_W - z.out) : play.ballY + side * z.out;
  return { x: play.los + z.depth, y: clamp(y, 2, FIELD_W - 2) };
}

/** How well a zone defender fits a receiver: lower is better. */
function zoneScore(play: Play, d: Player, a: Extract<Assign, { kind: 'zone' }>, spot: Vec, o: Player): { sc: number; dd: number } {
  const z = ZONE[a.spot];
  const dy = o.pos.y - spot.y;
  const outward = Math.sign(spot.y - play.ballY);
  const curl = a.spot === 'curl';
  const outside = curl && Math.sign(dy) === outward;
  // Across the zone counts fully, short of the landmark counts too, deeper doesn't (he sinks). A curl
  // defender widens to a threat outside him and walls off one breaking inside (that's the hook's).
  const across = Math.abs(dy) * (outside ? ZONE_WIDEN : curl ? 2 : 1);
  const dd = across + Math.max(0, spot.x - o.pos.x) * 0.4;
  // A receiver running out to the flat is the threat he widens for; the man he's already on scores
  // closer, so he commits instead of flipping; anyone in the area comes before one he'd only lean toward.
  const flat = outside && o.vel.y * outward > 2 ? ZONE_OUTSIDE : 0;
  const sc = dd - flat - (o === d.zoneMark ? ZONE_STICK : 0) - (o === play.keyed ? KEY.zone : 0) + (dd > z.area ? 10 : 0);
  return { sc, dd };
}

/**
 * Pattern match the underneath zones as a unit, once a step: pair defenders and receivers lowest
 * score first, each receiver to one defender, so the hook takes the slant and frees the curl for the
 * flat. Unpaired defenders sit (`zoneCover`).
 */
export function matchZones(play: Play): void {
  const zs = play.def.filter((d) => d.assign?.kind === 'zone' && !d.down);
  if (!zs.length) return;
  const recv = play.off.filter((o) => isEligible(o) && !o.isBlocker && !o.down && o.pos.x >= play.los - 1);
  const pairs: { d: Player; o: Player; sc: number }[] = [];
  for (const d of zs) {
    const a = d.assign as Extract<Assign, { kind: 'zone' }>;
    const spot = zoneSpot(play, a);
    for (const o of recv) {
      const { sc, dd } = zoneScore(play, d, a, spot, o);
      if (dd <= ZONE[a.spot].area * ZONE_HELP) pairs.push({ d, o, sc });
    }
  }
  pairs.sort((p, q) => p.sc - q.sc);
  const taken = new Set<Player>();
  const done = new Set<Player>();
  for (const d of zs) d.zoneMark = null;
  for (const p of pairs) {
    if (done.has(p.d) || taken.has(p.o)) continue;
    p.d.zoneMark = p.o;
    done.add(p.d);
    taken.add(p.o);
  }
}

/**
 * Underneath zone: drop to the landmark, then play the receiver `matchZones` gave him: under one past
 * the landmark (sinking as far as `carry`), on top of one short of it, or leaning toward one just
 * outside his area. With nobody, sit and shade toward the QB. On run blocking he takes a read step
 * instead of bailing, until the run fit or the throw takes over.
 */
function zoneCover(play: Play, d: Player, a: Extract<Assign, { kind: 'zone' }>): void {
  if (play.runBlocking() && play.phase !== 'air' && !play.passRead.has(d)) {
    d.want = ZERO;
    return;
  }
  const z = ZONE[a.spot];
  const base = zoneSpot(play, a);
  // Leaning inside, a hook or curl defender sinks under the windows inside (the glance, the dig).
  const sink = a.spot !== 'flat' ? LEAN_FX.sink * Math.max(0, d.lean.inside) : 0;
  const spot = sink ? { x: base.x + sink, y: base.y } : base;
  const qb = play.qb.pos;
  const m = d.zoneMark;
  let tgt: Vec;
  if (m && zoneScore(play, d, a, spot, m).dd > z.area) {
    tgt = add(spot, limit(sub(m.pos, spot), ZONE_LEASH));
  } else if (m) {
    // Short of the landmark: the faster he's coming upfield, the more he holds the landmark instead.
    const bx = m.pos.x;
    const x =
      bx >= spot.x
        ? clamp(bx - ZONE_UNDER, spot.x, spot.x + z.carry)
        : lerp(Math.max(bx + 1, play.los + 1), spot.x, clamp(m.vel.x / 4, 0, 1));
    tgt = { x, y: m.pos.y + Math.sign(qb.y - m.pos.y) * 0.5 };
  } else {
    tgt = { x: spot.x, y: lerp(spot.y, qb.y, 0.2) };
  }
  // A flat defender (the Cover 2 corner) squats: he walls #1 off inside only so far, handing a slant
  // to the curl, and stays where a throw to the flat lands on him.
  if (a.spot === 'flat') {
    const inward = Math.sign(play.ballY - spot.y) || 1;
    if ((tgt.y - spot.y) * inward > FLAT_INSIDE) tgt = { x: tgt.x, y: spot.y + inward * FLAT_INSIDE };
  }
  d.goal = tgt;
  d.want = seek(d, tgt, maxSpeed(d) * 0.92, 1);
}
/** How far inside his landmark a flat defender follows a receiver before handing him off. */
const FLAT_INSIDE = 3;

/** Spy: mirror the QB from the second level. The scramble and run branches take over when he goes. */
function spy(play: Play, d: Player): void {
  const tgt = { x: Math.max(play.los + SPY_DEPTH, play.qb.pos.x + SPY_DEPTH), y: play.qb.pos.y };
  d.goal = tgt;
  d.want = seek(d, tgt, maxSpeed(d) * 0.8, 0.8);
}

function rush(play: Play, d: Player): void {
  if (play.phase === 'air' && play.ballTarget) {
    d.want = seek(d, play.ballTarget, maxSpeed(d) * 0.75);
    return;
  }
  if (play.phase === 'run' && play.carrier) {
    // On a designed run he hasn't reacted to the ball yet (`reactAt`): he carries on with what he was doing. Chasing
    // the carrier here, a lineman's reaction never counted, nor a read key's for guessing wrong (`KEY_FOOLED`).
    if (play.runBlocking() && play.time < d.reactAt) {
      d.want = d.vel;
      return;
    }
    pursue(d, play.carrier, 0.9, PURSUIT_LEAD);
    return;
  }
  // A designed run: the front plays its run technique, not the QB (sim/runFits.ts).
  if (runTechnique(play, d)) return;
  if (d.role !== 'DL' && play.time - play.snapTime < 0.4) {
    d.want = ZERO; // blitzers time their run
    return;
  }
  const a = d.assign;
  if (a?.kind === 'rush' && (a.contain || d === play.rollContain) && dist(d.pos, play.qb.pos) > CONTAIN_CLOSE) {
    // Contain: work to the QB's outside shoulder and stay level with him, so he can't escape that way.
    const out = Math.sign(d.start.y - play.ballY) || 1;
    const tgt = { x: play.qb.pos.x + 0.5, y: play.qb.pos.y + out * CONTAIN_WIDTH };
    d.goal = tgt;
    d.want = seek(d, tgt, maxSpeed(d) * 0.95, 0.3);
    return;
  }
  // Sitting on the run or a screen, he rushes the passer a step slower.
  const soft = 0.95 * (1 - LEAN_FX.rushSoft * Math.max(0, d.lean.run, d.lean.screen));
  // A lineman rushes his lane: the edge around the arc, the interior through his gap (sim/passPro.ts).
  const path = rushPath(play, d, maxSpeed(d) * soft);
  if (path) {
    d.want = path;
    return;
  }
  d.goal = play.qb.pos;
  pursue(d, play.qb, soft);
}

function cover(play: Play, d: Player): void {
  const r = d.manTarget;
  if (!r) {
    d.want = ZERO;
    return;
  }
  // Defenders react to what the receiver did a moment ago; better man coverage = shorter lag.
  // Eyes in the backfield on a run he's expecting: a step late on his man.
  const keyed = r === play.keyed;
  const an = play.antic.get(d);
  const peek = an && an.role === 'lane' ? ANTIC.lag * an.s : 0;
  const lagFrames = Math.round(((0.6 - (d.r.mcv / 100) * 0.35 + LEAN_FX.eyes * Math.max(0, d.lean.run)) * (keyed ? 1 - KEY.lag : 1) + peek) * 60);
  const hist = play.history.get(r.id);
  const at = hist && hist.length ? Math.max(0, hist.length - 1 - lagFrames) : -1;
  // What he saw a moment ago, carried along the way the man was going then (`MAN_TRAIL`): the lag costs him
  // on a break, not on a straight line.
  const seen = at >= 0 ? hist![at] : r.pos;
  const was = at >= 1 ? hist![at - 1] : seen;
  const ahead = (lagFrames / 60) * MAN_TRAIL.lead;
  const lp = { x: seen.x + (seen.x - was.x) * 60 * ahead, y: seen.y + (seen.y - was.y) * 60 * ahead };
  const since = play.time - play.snapTime;
  const cushion = d.press ? 0.8 : Math.max(1.0, d.cushion - since * OFF_MAN.close - (keyed ? KEY.cushion : 0));
  // Inside leverage, more (or outside) as he leans on the routes his man has been running.
  const inside = Math.sign(play.ballY - lp.y) * (0.6 + LEAN_FX.shade * d.lean.inside);
  // A man still behind the line gets played from just past it: read him, don't chase him into the backfield.
  // On a designed run, a backer walked up closer than that (the goal line) holds his depth instead of
  // backing out of the box.
  const floor = d.role === 'LB' && play.playDef.kind === 'run' ? Math.min(MAN_DEPTH, d.start.x - play.los) : MAN_DEPTH;
  const tgt = { x: Math.max(lp.x + cushion, play.los + floor), y: lp.y + inside };
  let sp = maxSpeed(d);
  if (!d.turned) {
    if (r.pos.x > d.pos.x - 2.5 || since > 1.2) d.turned = true;
    else sp *= 0.72; // backpedal
  }
  d.want = seek(d, tgt, sp, 0.8);
}

function deepZone(play: Play, d: Player, yMin: number, yMax: number): void {
  // Help over the top of a keyed receiver in his band.
  const k = play.keyed;
  const mid = k && !k.down && k.pos.y >= yMin && k.pos.y <= yMax ? lerp((yMin + yMax) / 2, k.pos.y, KEY.shade) : (yMin + yMax) / 2;
  let deepest: Player | null = null;
  for (const o of play.off) {
    if (!isEligible(o) || o.isBlocker || o.down) continue;
    if (o.pos.y < yMin || o.pos.y > yMax || o.pos.x < play.los + 4) continue;
    if (!deepest || o.pos.x > deepest.pos.x) deepest = o;
  }
  const soft = play.prevent ? PREVENT.deep : 0;
  let tx = play.los + 12 + soft;
  let ty = mid;
  // A third or a quarter plays tighter over the top than a half or the whole field.
  const over = (yMax - yMin < FIELD_W / 2 - 1 ? DEEP_OVER_NARROW : 5) + soft;
  if (deepest) {
    tx = Math.max(tx, deepest.pos.x + over);
    ty = lerp(mid, deepest.pos.y, deepest.pos.x > play.los + 10 ? 0.75 : 0.35);
  }
  d.want = seek(d, { x: Math.min(tx, 119), y: ty }, maxSpeed(d) * 0.92, 1.5);
}

function robber(play: Play, d: Player): void {
  const home = { x: play.los + 8, y: play.ballY };
  // A keyed receiver near enough is his.
  const k = play.keyed;
  if (k && !k.down && dist(k.pos, home) < KEY.robber) {
    d.want = seek(d, { x: k.pos.x + 1.5, y: k.pos.y }, maxSpeed(d) * 0.9, 1);
    return;
  }
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
/**
 * The auto-runner's cut (a back on a called run, one a play, like the user's): a free defender in front closing inside
 * `range` yd draws it with odds `chance` (a fair user, not a perfect one); a pass on it waits `retry`
 * s before the next look. From `behind` yd behind the line he cuts a defender closing on him (one who beat his block),
 * toward the side with room (`cutSide`, `look`); before, he couldn't cut until the line, so a shed lineman stuffed him.
 */
export const AUTO_JUKE = { range: 2, chance: 0.5, retry: 0.5, behind: 3, look: 2.5 };

/**
 * Which way the auto-runner cuts: away from the man on him, unless the space that way (the nearest other free
 * defender to a spot `look` yd over and a yard upfield) is clearly worse than the other way.
 */
function cutSide(play: Play, c: Player, d: Player): 1 | -1 {
  const away = (Math.sign(c.pos.y - d.pos.y) || 1) as 1 | -1;
  const room = (side: number) => {
    const spot = { x: c.pos.x + 1, y: c.pos.y + side * AUTO_JUKE.look };
    if (spot.y < 1 || spot.y > FIELD_W - 1) return 0;
    let near = Infinity;
    for (const o of play.def) if (o !== d && !o.down && !o.engagedBy.length) near = Math.min(near, dist(o.pos, spot));
    return near;
  };
  return room(-away) > room(away) + 1.5 ? (-away as 1 | -1) : away;
}

/**
 * Pressing the design: a back on a called run (or a QB carrying: his hole) follows his drawn path (the aiming point: the B gap on inside
 * zone, the pullers' hips on a counter, the edge on a toss) until he's `until` yd from the line (or, on a
 * perimeter run, outside the edge: `pressEdge`), then reads
 * it (`pickLane`). Reading lanes from the mesh, he cut up the first crease before the blocks formed and
 * outran his own pullers.
 */
export const PRESS = { until: 1.2, reach: 0.8 };

/** The next point on his path while he's pressing it, or null once he's reading the line. */
function pressPoint(play: Play, c: Player): Vec | null {
  // A QB carrying on a designed run (QB power, the QB draw, a read's keep) presses his hole the same way: reading
  // lanes from 5 yd deep, power read's keep took the A gap into the filling MIKE instead of the C gap behind the guard.
  if (c === play.qb && (play.playDef.qbRun || play.kept) && play.playDef.read !== 'option') {
    return c.pos.x < play.los - PRESS.until ? play.hole : null;
  }
  // Not after an option pitch: his path is the pitch relationship, not a track to the line.
  if (c !== play.rb || play.playDef.kind !== 'run' || play.playDef.read === 'option' || !c.route.length || c.pos.x >= play.los - PRESS.until) return null;
  // A wide zone presses to the edge, then reads (one cut, downhill). The toss and the sweep keep their path:
  // their hole is the drawn spot outside, and pressing to the edge then reading lost them the corner.
  const edge = c.routeName === 'stretch' || c.routeName === 'oz' ? pressEdge(play) : null;
  if (edge !== null && (c.pos.y - play.ballY) * playSide(play) >= edge) return null;
  while (c.routeIdx < c.route.length && (dist(c.pos, c.route[c.routeIdx]) < PRESS.reach || c.route[c.routeIdx].x < c.pos.x - 0.2)) c.routeIdx++;
  const next = c.route[c.routeIdx];
  return next && next.x > c.pos.x - 0.2 ? next : null;
}

export function autoRun(play: Play, c: Player): void {
  if (c.down) {
    c.want = ZERO;
    return;
  }
  if (c.juke > 0) {
    c.want = c.jukeVel;
    return;
  }
  if (c.jukeCd <= 0 && c.pos.x > play.los - AUTO_JUKE.behind && play.canCut(c)) {
    for (const d of play.def) {
      if (d.down || d.engagedBy.length || d.tackleCd > 0 || d.pos.x < c.pos.x - 0.5 || dist(d.pos, c.pos) > AUTO_JUKE.range) continue;
      // Behind the line only against a man closing on him (one who's beaten his block into the backfield).
      if (c.pos.x <= play.los - 1 && (d.vel.x * (c.pos.x - d.pos.x) + d.vel.y * (c.pos.y - d.pos.y)) <= 0) continue;
      if (play.rng() < AUTO_JUKE.chance) startJuke(c, cutSide(play, c, d));
      else c.jukeCd = AUTO_JUKE.retry;
      if (c.juke > 0) {
        c.want = c.jukeVel;
        return;
      }
      break;
    }
  }
  let dir: Vec = { x: 1, y: 0 };
  const press = pressPoint(play, c);
  if (press) {
    dir = norm(sub(press, c.pos));
  } else if (c.pos.x < play.los + 1 && !play.thrown) {
    // A runner reads the line for his crease. A receiver who caught it behind the line (a bubble, a screen)
    // doesn't: the line's creases are the run's, and reading them turned him back inside into the front.
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
  if (c.celebrate && !c.down) {
    c.want = celebrateWant(c); // a pick six or return TD: run it out, then celebrate
    return;
  }
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
