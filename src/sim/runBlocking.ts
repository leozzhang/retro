import { STEP } from '../engine/constants';
import { add, clamp, dist, gauss, len, lerp, norm, scale, sub, type Vec } from '../engine/math';

const ZERO: Vec = { x: 0, y: 0 };
import type { Play } from '../game/playState';
import { accelOf, LEAN_FX, maxSpeed, seek, type Player } from './player';
import { templateValue } from '../data/athletes';
import { SLOT_POS } from '../data/positions';
import { runBlockValue, type Ratings } from '../data/ratings';
import { ROUTES, type PoaJob, type RouteName } from '../data/plays';
import { onFront } from './runFits';

/**
 * Run blocking: who blocks whom at the snap (by scheme), how a run block moves
 * the defender once engaged (drive and wash), when he can get off it (leverage),
 * and how the auto-runner picks a lane. Pass pro lives in `ai.ts` / `Play`.
 */

/** Drive-block advantage for the OL on designed runs (subtracted from the defender's power). */
export const RUN_BLOCK_EDGE = 3;
/** Stretch (reach) blocks are the hardest in football: the blocker gives up this much of his edge. */
export const REACH_PENALTY = 2;
/** Spread of each run block's outcome, in rating points, rolled when the block is made. */
export const BLOCK_ROLL_SD = 8;
/** A double team's advantage over a one-on-one, in rating points. */
const DOUBLE_TEAM = 15;
/**
 * The talent part of a run block, squeezed: a defender's rating edge over his blocker counts at `k`
 * near even and flattens out (tanh) past `soft`, measured from what equal-talent players at those two
 * positions would give (so a WR stalking a corner still plays as before). Real lines' run-block
 * win rates span only about ±6 points from the best to the worst (ESPN, TARGETS.md); a linear edge
 * let a 5-point better DL win half his blocks and a 10-point one stuff 43% of runs.
 * `pos`: a defender's edge from position alone over a TE or back (his template's run-block value against the
 * defender's, at the same level) counts at this share; over a receiver's stalk, `posWr`; over a lineman, whole. At full value
 * a TE won 22% of his blocks on an end at equal talent, against ESPN's run-block win rates of about 60% for TEs and 70% for
 * linemen. The talent edge is measured from the full position edge (`runEngagement`), so the shares are what's left of it:
 * measured from the reduced edge, most of the removed edge came back through the tanh (a corner on a receiver at 15.8 for
 * 14), and a bad blocker was barely worse than an average one, the tanh already flat.
 */
export const RUN_GAP = { k: 0.4, soft: 10, pos: 0.5, posWr: 0.85 };
/**
 * How much of a defender his run blocker still has (`Player.blockControl`): 1 at contact, worn down each
 * second while the defender is winning (`base` plus `perPower` a point of power; losing, he still wears it
 * by `losing`, and the blocker wins it back by `regain` a point of his margin), split by a double team.
 * He's off the block at 0. With the ball carrier within `nearDist`, the fight speeds up (`near`, or
 * `nearLevered` when the blocker has him walled off), and even a losing defender fights to get off
 * and make the play, at least `nearFloor` a second (`nearFloorLevered` walled off). A defender still on his block can only reach out:
 * he can reach a carrier within `armReach`, and his arm tackle is `armFloor` plus `arm` times the
 * control he's won back (`armOdds`).
 * A block is a gradient, not a switch: a worse line gets beaten more often and sooner, but a beaten
 * blocker still on his man still slows him and spoils his tackle.
 * A receiver's stalk is a mirror, not a drive block: he only has to stay between his man and the ball, so a defender
 * winning it wears it at most `stalkWear` a second (the near-the-ball fight still applies). At `maxWear` every stalk was gone
 * 0.4 s after contact whatever the matchup, and a slot on the nickel decided every counter to his side (Trey, Split). Slower
 * still (1.2) and the perimeter gained 0.4 yd a carry at every talent gap.
 */
export const RUN_CONTROL = {
  base: 0.5, perPower: 0.25, maxWear: 3.5, stalkWear: 1.6, losing: 0.1, regain: 0.04,
  nearDist: 2.5, near: 2.5, nearLevered: 0.6, nearFloor: 1.2, nearFloorLevered: 0.3,
  arm: 0.5, armFloor: 0.06, armReach: 1.2,
};
/** Yards/s of movement per point of power the blocker wins by. */
const DRIVE_RATE = 0.08;
/** Sideways part of a winning run block's push, relative to the downfield part (moving him off the hole). */
export const WASH_RATE = 1.2;
/** How fast a winning defender works around his blocker toward the ball (per point of power, per second). */
const WORK_RATE = 0.05;
/** Combos: the second blocker comes off the double team for the backer this long after the snap, by scheme. */
export const COMBO_CLIMB: Record<'zone' | 'stretch' | 'gap', number> = { zone: 0.55, stretch: 0.3, gap: 0.5 };
/** Yards a climb target counts as farther per yard he is backside of the climber (`assignRunBlocks`): inside runs, perimeter runs. */
const CLIMB_BACKSIDE = { inside: 0.6, perimeter: 2 };
/** A helper doubles a neighbour no farther than this along the line (yd). */
const COMBO_REACH = 2.5;
/** The partner climbs instead of the helper when he's this much nearer the backer (yd). */
const COMBO_SWAP = 0.5;
/** He also comes off early once the backer declares: this close to him, or this close to the line. */
const CLIMB_TRIGGER = 3;
/**
 * Climbs on control (`releaseClimbers`): the double has him when his power is under −`margin`; else it holds up to `hold` s more.
 * The helper gets a hand on the down man first: he's on the double at least `touch` s (the clock runs from his contact, set in
 * `Play.formEngagements`), and one still closing on him (within `closing` yd) at the combo's time keeps going for `late` s more.
 * Off the snap's clock, the stretch's tackle (0.3 s) climbed before he ever reached the end, and the TE reached him alone.
 */
export const CLIMB = { margin: 2, hold: 0.5, touch: 0.2, closing: 2.5, late: 0.25 };
/**
 * Backside linemen cut off (`runBlock`): a lineman this far backside of the hole takes the angle across his
 * man's path to the ball (`cutOff`), so a backside tackle slanting playside is walled off, not run past.
 */
const CUTOFF_FROM = 1;
/** Blocker counts as between his man and the ball (leverage) above this alignment (cosine). */
export const LEVERAGE_DOT = 0.35;
/** Shed rate (per second) for a blocked defender on the far side of the play, peeling off to pursue. */
const PEEL_RATE = 2.5;
/** Arm-tackle odds multiplier for a defender his blocker still has leverage on. */
export const ARM_LEVERED = 0.3;
/** A run blocker gets his hands on his assigned man from this far (pass pro and loose blocks use 1 yd). */
export const RUN_ENGAGE = 1.4;
/** A lead blocker takes a free defender who crosses his path this close in front of him, if he's nearer the ball than his man. */
const LEAD_PICKUP = 1.8;
/**
 * Point-of-attack blocks (pullers and lead backs, `assignRunBlocks`):
 * - `edge`: on the perimeter the edge is this far outside the outermost lineman who stays in; leads and
 *   force blocks turn up there.
 * - `kickInside`: a kick-out turns up this far inside his man, to hit his inside shoulder and wash him out.
 * - `forceWidth`, `forceDepth`: the force player is a defender up to this far outside the edge and this deep.
 * - `onLine`: an end man on the line is no deeper than this; `kickOutside`: a man off the ball is the
 *   kick-out's only if he's at least this far outside the last blocker who stays in. On the line, `kickHeadUp`:
 *   head-up on that blocker is the kick-out's too (the end man on the line; the TE or tackle blocks down
 *   inside him). Further inside, the line has him.
 * - `meet`: he turns up early when his man comes to him this close.
 * - `attack`: a lead back leaves his path for his man this close to him.
 * - `lost`: he gives up on a man this far from the play and takes the most dangerous free defender.
 * - `lead`: cutting his man off, he aims for the carrier's spot up to this many seconds ahead (`cutOff`).
 * - `keepInside`: power read's keep hits this far inside the read key (the C gap), and the pulling guard leads
 *   there, not at the sweep's edge: led at the edge, he left the keep to a filling MIKE.
 */
export const POA = { keepInside: 1.5, edge: 1.5, kickInside: 0.8, forceWidth: 10, forceDepth: 7, onLine: 1.8, kickOutside: 0.3, kickHeadUp: 0.5, meet: 2.2, attack: 3, lost: 10, lead: 1 };
/** Back paths that attack the perimeter: the line's edge is the turn-up point and the runner reads wide. */
const PERIMETER_PATHS = new Set<RouteName>(['sweep', 'toss', 'pitchPath', 'stretch', 'oz']);
/** A hinging tackle holds his spot this long (seconds after the snap) before working up to the next threat. */
const HINGE_HOLD = 1;
/** He takes the backside end from this long after the snap (s), if nobody's come through the gap first. */
const HINGE_CHASE = 0.3;
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
/** A sneak's lanes: the A gaps. */
const SNEAK_READ_W = 1.2;
/** How far ahead (s) the lane read projects a free defender who's moving (a backside chaser closing the cutback). */
const LANE_LEAD = 0.35;

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;


/** A perimeter run: an outside scheme, or the back's path goes for the edge. */
export function perimeter(play: Play): boolean {
  const s = play.runScheme;
  const rn = play.rb.routeName;
  return s === 'stretch' || s === 'pin' || (!!rn && PERIMETER_PATHS.has(rn));
}

/**
 * The edge for a perimeter run's back (`PRESS`): this far (yd, along the play) outside the last blocker who
 * started on the line, or null on an inside run. Past it he stops pressing his path and reads.
 */
export function pressEdge(play: Play): number | null {
  if (!perimeter(play)) return null;
  const side = playSide(play);
  const along = play.off
    .filter((o) => o.role === 'OL' || (o.role === 'TE' && o.start.x > play.los - 1.5 && Math.abs(o.start.y - play.ballY) < 6.5))
    .map((o) => (o.start.y - play.ballY) * side);
  return Math.max(...along) + POA.edge;
}

/**
 * Where the line blocks to: the hole, except on a read that keeps inside (power read), where the line blocks power for the
 * keep's C gap (`POA.keepInside` inside the key) while the sweep is the read's other half. Blocked to the sweep's spot 9 yd
 * out, the center's back block on the 1-technique cut off a spot 3 yd playside of him and never touched him.
 */
export function lineHole(play: Play): Vec {
  const k = play.readKey;
  if (play.playDef.keep !== 'inside' || !k || play.kept) return play.hole;
  return { x: play.hole.x, y: k.start.y - playSide(play) * POA.keepInside };
}

/** Where the play is going: the ball carrier once it's a run, else the hole. */
function playRef(play: Play): Vec {
  const c = play.carrier;
  return c && c.side === 'off' && play.phase === 'run' ? c.pos : play.hole;
}

/** Nobody else has him, and he isn't on someone else's block. */
function freeFor(play: Play, p: Player, d: Player): boolean {
  if (d.down || d === play.readKey || d === play.carrier) return false;
  if (d.engagedBy.length && !d.engagedBy.includes(p)) return false;
  // Someone else has him only if he's on him, or on his way to him (not tied up on another block).
  return !play.off.some((o) => o !== p && !o.down && (o.engaged ? o.engaged === d : o.mark === d || o.climb === d || o.poa === d));
}

/**
 * A puller's or lead back's man, still worth blocking; if he's gone (down, on someone else's block, or
 * out of the play) he takes the most dangerous free defender near the ball instead.
 */
function livePoa(play: Play, p: Player): Player | null {
  const ref = playRef(play);
  const t = p.poa;
  const near = Math.min(dist(t?.pos ?? ref, ref), dist(t?.pos ?? ref, play.hole));
  if (t && !t.down && t !== play.carrier && !(t.engagedBy.length && !t.engagedBy.includes(p)) && near < POA.lost) return t;
  let best: Player | null = null;
  let bestScore = Infinity;
  // A playside block's new man is playside too (the slice's is backside): before the handoff the backside
  // end is the hinge's and the chase's, not the lead's.
  const s = playSide(play) * (p.routeName && ROUTES[p.routeName].away ? -1 : 1);
  for (const d of play.def) {
    if (!freeFor(play, p, d) || d.pos.x < p.pos.x - 1 || dist(d.pos, ref) > 8) continue;
    if (play.phase !== 'run' && (d.pos.y - play.ballY) * s < -1 && !flows(play, d)) continue;
    const score = dist(d.pos, ref) + 0.5 * dist(d.pos, p.pos);
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  p.poa = best;
  return best;
}

/**
 * A defender who ends up playside whatever his alignment: a backer in man on the ball carrier follows him
 * across. The playside blocks don't treat him as a backside man.
 */
function flows(play: Play, d: Player): boolean {
  return d.manTarget === play.rb || (!!play.playDef.qbRun && d.manTarget === play.qb);
}

/** +1 if the play hits toward +y. */
export function playSide(play: Play): 1 | -1 {
  return (Math.sign(play.hole.y - play.ballY) || play.resolved.strongSign) as 1 | -1;
}

/** Defenders in the box who aren't down linemen: the backers a climbing lineman looks for. */
function boxDefenders(play: Play): Player[] {
  return play.def.filter(
    (d) => !onFront(play, d) && d !== play.readKey && d.pos.x <= play.los + 7 && Math.abs(d.pos.y - play.ballY) <= 7.5,
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
    // The line: linemen and attached ends. A receiver in a tight slot (Empty's) stalks; he isn't a gap blocker.
    (o.role === 'OL' || (o.role !== 'WR' && o.pos.x > play.los - 1.5 && Math.abs(o.pos.y - play.ballY) < 6.5));
  let line = play.off.filter(isLine).sort((a, b) => along(b) - along(a));
  // The front: the down linemen and any blitzer rushing from near the line (`onFront`, the run fits' rule). A
  // blitzing backer is a gap to block at the snap, not a backer to climb to half a second later, by when he's in
  // the backfield: the line left him free and doubled a down man with nobody to climb to.
  let dl = play.def.filter((d) => onFront(play, d) && d !== play.readKey);
  const down = scheme === 'gap' || scheme === 'trap';
  const wide = perimeter(play);

  // Point-of-attack jobs: pullers by their pull, lead backs by their path. On an outside scheme the line
  // pins the end, so a kick-out becomes a block on the force player.
  for (const o of play.off) {
    const r = o.routeName ? ROUTES[o.routeName] : null;
    let job: PoaJob | null = o.pull ?? (r?.lead ? r.job ?? 'lead' : null);
    if (job === 'kick' && (scheme === 'stretch' || scheme === 'pin') && !r?.away) job = 'force';
    o.poaJob = job;
  }
  // The edge: outside the outermost lineman who stays in.
  const edgeAlong = Math.max(...line.map(along)) + POA.edge;
  const edgeY = play.ballY + side * edgeAlong;
  const reserved = new Set<Player>();
  const noKick = new Set<Player>();

  // Kick-outs get the first man outside the last blocker who stays in on their side (the slice's is the
  // backside), reserved before the line assigns: the end man on the line if he's outside that blocker
  // (a man head-up or inside is the line's: gap, down, backer), else the next man out, off the ball.
  for (const o of play.off) {
    if (o.poaJob !== 'kick' || (scheme === 'trap' && o.pull)) continue;
    const s = o.routeName && ROUTES[o.routeName].away ? -side : side;
    const out = (d: Player) => (d.pos.y - play.ballY) * s;
    const last = Math.max(...line.map(out));
    const free = play.def.filter((d) => !reserved.has(d) && d !== play.readKey);
    const outside = free.filter((d) => out(d) > last + POA.kickOutside);
    const onLine = free.filter((d) => (d.role === 'DL' || d.role === 'LB') && d.pos.x <= play.los + POA.onLine && out(d) > last - POA.kickHeadUp);
    const off = outside.filter((d) => d.role !== 'DL' && d.pos.x <= play.los + POA.forceDepth && out(d) < last + POA.forceWidth);
    const near = (a: Player, b: Player) => out(a) - out(b) || a.pos.x - b.pos.x;
    const end = onLine.sort(near)[0] ?? off.sort((a, b) => dist(a.pos, { x: play.los, y: play.ballY + s * last }) - dist(b.pos, { x: play.los, y: play.ballY + s * last }))[0];
    if (end) {
      o.poa = end;
      reserved.add(end);
    } else {
      // Nobody to kick out: he turns up through the hole like a lead and takes whoever shows (no backer is
      // held for him, so the line still climbs to all of them).
      o.poaJob = 'lead';
      noKick.add(o);
    }
  }
  dl = dl.filter((d) => !reserved.has(d));

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
      puller.poa = trapped;
      reserved.add(trapped);
      dl = dl.filter((d) => d !== trapped);
    }
  }

  // Leads get the playside backer nearest where they turn up (the hole, or the edge on the perimeter),
  // before the line's combos pick who they climb to.
  // Power read's guard leads the keep inside the key (`POA.keepInside`), whatever the sweep does outside.
  const keepY = play.playDef.keep === 'inside' && play.readKey ? play.readKey.pos.y - side * POA.keepInside : null;
  const turnAt = keepY !== null ? { x: play.los + 2, y: keepY } : wide ? { x: play.los + 2, y: edgeY } : play.hole;
  for (const o of play.off) {
    if (o.poaJob !== 'lead') continue;
    if (keepY !== null) o.turnY = keepY;
    else if (wide) o.turnY = edgeY;
    if (noKick.has(o)) continue;
    let best: Player | null = null;
    let bestScore = Infinity;
    for (const d of boxDefenders(play)) {
      // A lead goes playside: with the playside backers taken (two leads), he turns up through the hole and
      // takes whoever shows, not a backside backer across the ball (QB Power's guard led on the WLB).
      if (reserved.has(d) || (along(d) < -1 && !flows(play, d))) continue;
      const score = dist(d.pos, turnAt) + (d.role === 'LB' ? 0 : 2);
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (best) {
      o.poa = best;
      reserved.add(best);
    }
  }

  // Offsets (playside +) of the defender relative to the blocker that count as "his man", and the ideal one.
  const [lo, hi, pref] = down ? [-2.2, 0.7, -0.6] : [-0.7, 2.1, 0.4]; // zone, stretch and pin: man over or playside
  const covered = new Map<Player, Player>();
  const taken = new Set<Player>();
  const cover = (b: Player, d: Player) => {
    b.mark = d;
    covered.set(b, d);
    taken.add(d);
  };
  if (down) {
    // Gap rules (gap, on, down): the best fits across the whole line first, so the man over a guard is
    // the guard's, not the tackle's two yards away who can't reach him down the line.
    const pairs: { b: Player; d: Player; fit: number }[] = [];
    for (const b of line) {
      // Inside is toward the play on the backside: there the range mirrors (Duo's backside tackle took the end outside him,
      // over the TE, and the TE had to climb to the SAM from outside).
      const back = along(b) < -0.3 ? -1 : 1;
      for (const d of dl) {
        const o = (along(d) - along(b)) * back;
        if (o >= lo && o <= hi) pairs.push({ b, d, fit: Math.abs(o - pref) });
      }
    }
    pairs.sort((x, y) => x.fit - y.fit);
    for (const { b, d } of pairs) if (!covered.has(b) && !taken.has(d)) cover(b, d);
  } else {
    for (const b of line) {
      let best: Player | null = null;
      for (const d of dl) {
        if (taken.has(d)) continue;
        const o = along(d) - along(b);
        if (o < lo || o > hi) continue;
        if (!best || Math.abs(o - pref) < Math.abs(along(best) - along(b) - pref)) best = d;
      }
      if (best) cover(b, best);
    }
  }

  // Cut-off: a down lineman nobody has yet goes to the nearest uncovered lineman (preferring the one playside of him).
  // With a puller, linemen well backside of the line are left to chase from behind (the hinge has the gap he
  // left); a gap run with nobody pulling (duo) blocks its backside like any other.
  const lastLine = Math.min(...line.map(along));
  for (const d of dl) {
    if (taken.has(d) || (down && puller && along(d) < lastLine - 1)) continue;
    let best: Player | null = null;
    const cost = (b: Player) => Math.abs(along(d) - along(b)) + (along(b) < along(d) ? 1.5 : 0);
    for (const b of line) if (!b.mark && b.role === 'OL' && (!best || cost(b) < cost(best))) best = b;
    if (best) {
      best.mark = d;
      covered.set(best, d);
      taken.add(d);
    }
  }

  // A corner isn't a backer to climb to, even pressed on a wing inside the box: he's the wing's (Wing Duo's tackle climbed
  // to him past the MIKE).
  const backers = boxDefenders(play).filter((d) => !reserved.has(d) && d.role !== 'CB');
  const climbTaken = new Set<Player>(reserved);
  // Prefer playside backers: a yard backside of the blocker costs `CLIMB_BACKSIDE` yd, more on the perimeter, where
  // the whole line works playside and the backside backer is left to chase (against a Bear, the center climbed to
  // the WILL and left the MIKE free over the toss).
  const backCost = wide && !down ? CLIMB_BACKSIDE.perimeter : CLIMB_BACKSIDE.inside;
  let climber: Player;
  const climbScore = (d: Player) => dist(d.pos, climber.pos) + Math.max(0, -(along(d) - along(climber))) * backCost;
  const nearestBacker = (b: Player) => {
    climber = b;
    let best: Player | null = null;
    for (const d of backers) {
      if (climbTaken.has(d) || d.pos.x < b.pos.x) continue;
      // A playside end or back doesn't climb across the formation to a backside backer (linemen do: the double to the backside backer).
      if (b.role !== 'OL' && along(b) > 1 && along(d) < -1 && !flows(play, d)) continue;
      if (!best || climbScore(d) < climbScore(best)) best = d;
    }
    if (best) climbTaken.add(best);
    return best;
  };
  const helped = new Set<Player>();
  const wedge = play.playDef.tags.concept === 'sneak';
  // On the perimeter (stretch, pin, the toss) the outermost man on the line, uncovered, arcs for the force: the
  // first man outside who isn't a down lineman (`forceMan`). Helping inside and climbing to the MIKE, the TE left
  // the walked-up safety to set the edge alone against a Bear.
  const arc = !down && wide && line[0] && !line[0].mark && line[0].role !== 'OL' ? line[0] : null;
  if (arc) {
    const f = forceMan(play, along, edgeAlong, new Set([...reserved, ...climbTaken]));
    if (f) {
      arc.mark = f;
      climbTaken.add(f);
    }
  }
  line.forEach((b, i) => {
    if (b.mark) return;
    // Help a neighbour who has his man; each covered blocker takes one helper. Zone helps playside first;
    // a gap scheme blocks down, so it helps toward the center first: inside on the playside (the line runs
    // playside to backside), but playside on the backside (Duo's backside double is the guard with the
    // center on the nose, up to the backer, not the guard with the tackle on the end).
    // A gap scheme only doubles toward the center: with nobody free inside him he climbs straight to his backer (Duo's
    // backside tackle doubled out on the end with the TE, then climbed from 5 yd outside the SAM).
    const toCenter = along(b) > -0.3 ? [line[i + 1]] : [line[i - 1]];
    const order = down ? toCenter : [line[i - 1], line[i + 1]];
    // On a trap the uncovered linemen release straight to the backers (the man they'd help on is let in for
    // the trapper, and the center blocks back alone): joining a double first, the playside guard was released
    // at its clock as he arrived, with his momentum going the wrong way.
    // A double is two neighbours: across the gap a puller or a hinge left (Heavy Power's backside TE and the center, 4 yd
    // apart) the helper never got there, and the climb left the down man free.
    const partner = scheme === 'trap' ? undefined : order.find((n) => n && covered.has(n) && !helped.has(n) && Math.abs(along(n) - along(b)) < COMBO_REACH);
    // A sneak is a wedge (it fires on the count, `RUN_GETOFF.count`): its doubles drive the down men and nobody climbs; the
    // backers are what the QB's yard head start has to beat. Climbing at the snap to a goal-line backer 2 yd off the ball, the
    // center left the guard alone on the nose, and the stalled pile held the QB behind the line 18% of the time.
    const climb = wedge && partner ? null : nearestBacker(b);
    if (partner) {
      helped.add(partner);
      b.mark = covered.get(partner)!;
      // Whichever of the two is nearer the backer comes off for him; the other keeps the down man. The helper climbing
      // from outside, Pistol Duo's backside TE started 3 yd behind a SAM flowing away from him.
      const up = climb && dist(partner.pos, climb.pos) < dist(b.pos, climb.pos) - COMBO_SWAP ? partner : b;
      up.climb = climb;
      up.comboUntil = play.snapTime + COMBO_CLIMB[down ? 'gap' : scheme === 'stretch' || scheme === 'pin' ? 'stretch' : 'zone'];
    } else {
      b.mark = climb;
    }
  });

  // Receivers and backs stalk the nearest defender in front of them; uncovered linemen with nobody left take a backer.
  // A lineman's climb counts: a back doesn't take the backer the double is coming off to (Wing Duo's FB and LG both had the WILL).
  const marked = () => new Set(play.off.flatMap((o) => [o.mark, o.poa, o.climb]).filter(Boolean));
  for (const b of play.off) {
    if (b.mark || !b.isBlocker || b.pull || b.hinge || b.route.length || b.role === 'QB') continue;
    const tk = marked();
    let best: Player | null = null;
    for (const d of play.def) {
      // A receiver who released past a squatting corner (the draw's release) can still turn back for him.
      if (tk.has(d) || d === play.readKey || d.pos.x < b.pos.x - (b.role === 'WR' ? 3 : 1) || d.role === 'DL') continue;
      if (b.role === 'OL' && d.role !== 'LB') continue;
      // A playside end or back doesn't cross the formation for a backside man: the force player outside him is
      // his (Counter GT's TE took the backside WLB and left the nickel, the force, free).
      if (b.role !== 'OL' && along(b) > 1 && along(d) < -1 && !flows(play, d)) continue;
      if (!best || dist(d.pos, b.pos) < dist(best.pos, b.pos)) best = d;
    }
    b.mark = best;
  }

  // Force blocks get the playside force or alley defender nobody has: outside the edge, near the alley.
  for (const o of play.off) {
    if (o.poaJob !== 'force') continue;
    o.turnY = edgeY;
    const tk = marked();
    const best = forceMan(play, along, edgeAlong, tk);
    o.poa = best;
    // Nobody in the alley for him: he leads on the playside backer nearest the edge instead.
    if (!best) {
      const lb = boxDefenders(play)
        .filter((d) => !tk.has(d) && d.role === 'LB' && along(d) > 0)
        .sort((a, b) => dist(a.pos, { x: play.los, y: edgeY }) - dist(b.pos, { x: play.los, y: edgeY }))[0];
      if (lb) {
        o.poaJob = 'lead';
        o.poa = lb;
      }
    }
  }
}

/**
 * The playside force or alley defender nobody has (`taken`): not a down lineman, within `POA.forceDepth` of the
 * line, from 2.5 yd inside the edge to `POA.forceWidth` outside it, nearest the alley.
 */
function forceMan(play: Play, along: (p: Player) => number, edgeAlong: number, taken: Set<Player | null>): Player | null {
  const alley = { x: play.los + 1, y: play.ballY + playSide(play) * (edgeAlong + 2) };
  let best: Player | null = null;
  for (const d of play.def) {
    if (taken.has(d) || d === play.readKey || d.role === 'DL' || onFront(play, d) || d.pos.x > play.los + POA.forceDepth) continue;
    const a = along(d);
    if (a < edgeAlong - 2.5 || a > edgeAlong + POA.forceWidth) continue;
    if (!best || dist(d.pos, alley) < dist(best.pos, alley)) best = d;
  }
  return best;
}

/** Nearest unblocked defender in front of a run blocker, preferring ones nobody has yet. The zone-read key is left alone. */
function pickRunTarget(play: Play, p: Player): Player | null {
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const d of play.def) {
    if (d.down || d === play.readKey || d.pos.x < p.pos.x - 1) continue;
    const dd = dist(d.pos, p.pos);
    if (dd > 8) continue;
    const helpers = play.off.filter((o) => o !== p && (o.mark === d || o.poa === d)).length;
    const score = dd + helpers * 5;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Where a puller turns up: inside his man on a kick-out, at the edge on the perimeter, else the hole. */
export function pullTurnY(play: Play, p: Player, t: Player | null): number {
  const s = playSide(play);
  const at = p.turnY ?? play.hole.y;
  if (t && p.poaJob === 'kick') return t.pos.y - s * POA.kickInside;
  if (t && p.poaJob === 'force' && (t.pos.y - at) * s > POA.kickInside) return t.pos.y - s * POA.kickInside;
  return at;
}

/** He's done pulling: block this man (the normal run block takes over). */
function turnUp(p: Player, t: Player | null): false {
  p.pull = null;
  p.mark = t;
  return false;
}

/** A lead blocker's pickup (anyone's, with no man left): a free defender crossing his path, closer to the ball than his own man. */
function pickup(play: Play, p: Player, t: Player | null): Player | null {
  if (p.poaJob !== 'lead' && t) return null;
  const ref = playRef(play);
  for (const d of play.def) {
    if (d === t || !freeFor(play, p, d) || d.pos.x < p.pos.x - 0.5 || dist(d.pos, p.pos) > LEAD_PICKUP) continue;
    if (!t || dist(d.pos, ref) < dist(t.pos, ref)) return d;
  }
  return null;
}

/**
 * Puller: run flat behind the line to his turn-up point (`pullTurnY`), then up onto the man he got at the
 * snap (`poa`): the end on a kick-out, the playside backer on a lead, the force player on the perimeter.
 * He turns up early if his man comes to him, and a lead takes a free defender who crosses his path first.
 * Returns false once he's turned up, so the normal run block takes over.
 */
function pullBlock(play: Play, p: Player): boolean {
  const t = livePoa(play, p);
  const d = pickup(play, p, t);
  if (d) {
    p.poa = d;
    return turnUp(p, d);
  }
  if (t && dist(t.pos, p.pos) < POA.meet) return turnUp(p, t);
  const y = pullTurnY(play, p, t);
  // He gathers to turn up before he gets there, by how far his sideways speed carries him.
  const s = playSide(play);
  const carry = Math.max(0, p.vel.y * s) ** 2 / (2 * accelOf(p));
  if ((y - p.pos.y) * s > PULL_TURN + carry) {
    // Skip-pull tight to the line so he gets to the hole ahead of the back.
    p.want = seek(p, { x: play.los - 1, y }, maxSpeed(p), 0.3);
    return true;
  }
  return turnUp(p, t);
}

/** Hinge: hold the spot inside and take the first defender who comes through it; with nobody by `HINGE_HOLD`, work out to the end. */
function hingeBlock(play: Play, p: Player): boolean {
  const spot = p.hinge!;
  if (play.time - play.snapTime > HINGE_HOLD) {
    // Nobody came: work up to the nearest threat like any run blocker.
    p.hinge = null;
    return false;
  }
  const taken = new Set(play.off.filter((o) => o !== p).flatMap((o) => [o.mark, o.climb, o.poa]));
  let best: Player | null = null;
  // The gap first, then the end: the backside end (the chase) is his from `HINGE_CHASE` s, and anyone coming through the
  // gap comes before him. He keeps reading until he has his hands on someone, so a blitzer who shows late still takes him
  // off the end. Taking the first body near the spot at the snap, he trailed the end upfield and a blitzing WILL came
  // through the gap untouched (Trap vs Cover 0); ignoring the end until `HINGE_HOLD`, the end ran down short-yardage runs.
  const score = (q: Player) => dist(q.pos, spot) + (q.runJob === 'chase' ? 3 : 0);
  for (const d of play.def) {
    const chase = d.runJob === 'chase';
    if (d.down || taken.has(d) || d.pos.x > play.los + 2.5 || (chase && play.time - play.snapTime < HINGE_CHASE)) continue;
    if (dist(d.pos, spot) < 3 && (!best || score(d) < score(best))) best = d;
  }
  p.mark = best;
  if (best) return false;
  p.want = seek(p, spot, maxSpeed(p) * 0.8, 0.4);
  return true;
}

/**
 * Lead blocker (FB, H-back, slicing or arcing TE): run the path (through the hole, or out to the edge) and
 * leave it for his man (`poa`) once he's close or the path is done. A lead takes a free defender who
 * crosses his path first. Returns false once he has someone.
 */
function leadBlock(play: Play, p: Player): boolean {
  while (p.routeIdx < p.route.length && dist(p.pos, p.route[p.routeIdx]) < 0.7) p.routeIdx++;
  const t = p.poaJob ? livePoa(play, p) : null;
  const d = pickup(play, p, t);
  if (d) {
    p.poa = d;
    p.mark = d;
    return false;
  }
  // Off the path once his man is close, or closer than where the path goes next. A lead on a backer
  // goes straight at him after his first step.
  const next = p.route[p.routeIdx];
  // A kick-out on a man on the line goes straight for his inside shoulder from the snap: on the drawn path
  // (an offset from where he lined up) Gun Split's H ran wide while the end squeezed inside him.
  const kickLine = p.poaJob === 'kick' && !!t && t.pos.x <= play.los + POA.onLine && !ROUTES[p.routeName!]?.away;
  const on = t && (kickLine || dist(p.pos, t.pos) < POA.attack || dist(p.pos, t.pos) < dist(p.pos, next ?? p.pos) || (p.poaJob === 'lead' && p.routeIdx >= 1));
  if (!next || on) {
    p.mark = t;
    return false;
  }
  p.want = seek(p, p.route[p.routeIdx], maxSpeed(p) * 0.95, 0.3);
  return true;
}

/** Fire off the ball and wall the defender off from the hole. */
export function runBlock(play: Play, p: Player): void {
  if (play.idle.has(p)) {
    p.want = ZERO; // standing down for the harness's ablation
    return;
  }
  const hole = lineHole(play);
  if (!p.mark && p.route.length && leadBlock(play, p)) return;
  if (p.pull && !p.mark && pullBlock(play, p)) return;
  if (p.hinge && hingeBlock(play, p)) return;
  // Still closing on a man he can get his hands on (not slipping a block, not already doubled).
  const m = p.mark;
  const closing = !!m && !m.down && m.noEngage <= 0 && m.engagedBy.length < 2 && dist(p.pos, m.pos) < CLIMB.closing;
  if (p.climb && (play.time >= p.comboUntil + (closing ? CLIMB.late : 0) || p.climb.down)) {
    // Never got onto the double team: go straight to the backer.
    p.mark = p.climb.down ? null : p.climb;
    p.climb = null;
  }
  // A puller or lead back whose man is taken or gone finds the most dangerous free defender.
  if (p.poaJob && !p.engaged && p.mark && p.mark === p.poa) p.mark = livePoa(play, p);
  if (!p.mark || p.mark.down || p.mark === play.carrier) {
    if (p.poaJob) {
      // No man for him: up through the hole (the edge on the perimeter) to take the first free defender who shows.
      p.mark = livePoa(play, p) ?? pickup(play, p, null);
      if (!p.mark) {
        p.want = seek(p, { x: play.los + 2.5, y: p.turnY ?? hole.y }, maxSpeed(p) * 0.9);
        return;
      }
    } else p.mark = pickRunTarget(play, p);
  }
  if (p.mark) {
    // Take the angle to where he's going (a backer filling fast), and get between him and the ball:
    // the hole until the handoff, then the ball carrier.
    const r = p.mark;
    const sp = maxSpeed(p) * 0.95;
    const c = play.carrier;
    const ref = c && c.side === 'off' && play.phase === 'run' ? c.pos : hole;
    // A puller or lead back steps into his man's path to the ball, and so does a backside lineman (the
    // cutoff, the scoop); everyone else leads his man's movement.
    // A man already on a teammate's block is a double team to join, not a path to cut off: cutting him off,
    // the helper ran to a spot in front of the ball and stood there (Duo's backside double never formed).
    // A TE cuts off only on the far side of the ball (Pistol Duo's backside TE): measured from an outside zone's hole 8 yd out,
    // the playside TE played his reach as a cutoff and never got his hands on the end.
    const side = playSide(play);
    const backside =
      (p.start.y - hole.y) * side < -CUTOFF_FROM && (p.role === 'OL' || (p.role === 'TE' && (p.start.y - play.ballY) * side < -CUTOFF_FROM)) &&
      !r.engagedBy.some((b) => b !== p);
    // A lineman climbing to a backer steps into the backer's path to the ball too: leading where a filling
    // backer will be, his target swung behind him and he stood still while the backer made the tackle.
    // An inline TE climbing off a double does the same (Pistol Duo's backside TE trailed the SAM across the formation).
    const climbing = (p.role === 'OL' || p.role === 'TE') && r.role === 'LB' && !r.engagedBy.length;
    const at = p.poaJob || backside || climbing ? cutOff(p, r, c && ref === c.pos ? c : null, ref, sp) : add(r.pos, scale(r.vel, clamp(dist(p.pos, r.pos) / sp, 0, 0.6)));
    const tgt = { x: at.x - 0.25, y: at.y + Math.sign(ref.y - at.y) * 0.75 };
    p.want = seek(p, tgt, sp, 0.3);
  } else {
    p.want = seek(p, { x: play.los + 2.5, y: lerp(p.start.y, hole.y, 0.3) }, maxSpeed(p) * 0.7);
  }
}

/**
 * The first spot on defender `d`'s line to the ball that blocker `p` gets to before him, at speed `sp`.
 * The ball is where the carrier `c` will be when the defender gets there (he leads him the way a
 * pursuer does, `POA.lead` s at most), or `ref` (the hole) before the handoff.
 */
function cutOff(p: Player, d: Player, c: Player | null, ref: Vec, sp: number): Vec {
  const dv = Math.max(len(d.vel), maxSpeed(d) * 0.8);
  if (c) ref = add(c.pos, scale(c.vel, clamp(dist(d.pos, c.pos) / dv, 0, POA.lead)));
  const run = dist(d.pos, ref);
  for (let u = 0; u <= 1.0001; u += 0.1) {
    const at = lerp2(d.pos, ref, u);
    if (dist(p.pos, at) / sp <= (u * run) / dv + 0.05) return at;
  }
  return ref;
}

const lerp2 = (a: Vec, b: Vec, u: number): Vec => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });

/** A double-team's second blocker comes off for the backer on time, or early if the backer comes to him. */
export function releaseClimbers(play: Play): void {
  for (const b of play.off) {
    const lb = b.climb;
    const d = b.engaged;
    if (!lb || !d) continue;
    const declared = dist(lb.pos, b.pos) < CLIMB_TRIGGER || lb.pos.x < play.los + CLIMB_TRIGGER;
    // Off the double on control, not a clock: once the down man is being moved (the double is winning)
    // after the combo's time, or the backer declares; a down man still winning keeps him on it up to
    // `CLIMB.hold` s longer.
    const controlled = (d.blockPower ?? 0) < -CLIMB.margin;
    // On the perimeter (stretch, pin, the toss) the climb is on the clock: the ball's outside fast.
    const hold = perimeter(play) ? 0 : CLIMB.hold;
    const due = play.time >= b.comboUntil && (controlled || play.time >= b.comboUntil + hold);
    if (!due && !declared && !lb.down) continue;
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

const defPower = (r: Ratings) => r.bsh * 0.7 + r.spd * 0.3;

/**
 * The get-off (docs/RUNGAME.md): the first contact of a run block, in the first `window` s. A one-gap
 * lineman or the edge who beats his blocker off the ball slips him into his gap, penetration, instead
 * of being engaged: a roll of `sd` plus `perTalent` × (his power − the block) against `win` (`edge` adds
 * to it for the edge, `short` in the goal-line and bear fronts, and a sneak takes off `count`: the line fires
 * on the count; a two-gap player never slips, he's there to control his man). The pass rush
 * (`passPro.ts`) is untouched.
 */
export const RUN_GETOFF = { window: 0.6, sd: 9, perTalent: 0.2, win: 11, edge: 0, short: 7, count: 12 };

export function getOffWins(play: Play, d: Player, b: Player): boolean {
  if (play.time - play.snapTime > RUN_GETOFF.window || (d.runJob !== 'gap' && d.runJob !== 'edge')) return false;
  // The short-yardage fronts (goal line, bear) play low, one-gap, attack: `short` more get-off.
  const front = play.defCall.front === 'goal' || play.defCall.front === 'bear' ? RUN_GETOFF.short : 0;
  // A sneak is a wedge on the count: the line knows when the ball's snapped and fires first.
  const count = play.playDef.tags.concept === 'sneak' ? RUN_GETOFF.count : 0;
  const roll = gauss(play.rng) * RUN_GETOFF.sd + RUN_GETOFF.perTalent * (defPower(d.r) - runBlockValue(b.r)) + (d.runJob === 'edge' ? RUN_GETOFF.edge : 0) + front - count;
  return roll > RUN_GETOFF.win;
}
const evenCache = new Map<string, number>();

/** What a defender's raw edge over a blocker would be with both players at the same level (position templates). */
function evenEdge(d: Player, b: Player): number {
  const dp = SLOT_POS[d.slot];
  const bp = SLOT_POS[b.slot];
  if (!dp || !bp) return 0;
  const key = `${dp}|${bp}`;
  let v = evenCache.get(key);
  if (v === undefined) {
    const t = (pos: typeof dp) => Object.fromEntries(['bsh', 'spd', 'rbk', 'str'].map((k) => [k, templateValue(pos, k as any, 75)])) as unknown as Ratings;
    v = defPower(t(dp)) - runBlockValue(t(bp));
    evenCache.set(key, v);
  }
  return v;
}

/** The position part of a run block's edge (`RUN_GAP`): a share of a defender's edge over a TE or a back (`pos`) or a receiver's stalk (`posWr`); whole over a lineman. */
function posEdge(d: Player, b: Player): number {
  const e = evenEdge(d, b);
  if (e <= 0 || b.role === 'OL') return e;
  return e * (b.role === 'WR' ? RUN_GAP.posWr : RUN_GAP.pos);
}

/** The squeezed talent part of a run block: the raw rating edge, pulled toward the equal-talent edge (`RUN_GAP`). */
export function runTalent(raw: number, even: number): number {
  return even + RUN_GAP.k * RUN_GAP.soft * Math.tanh((raw - even) / RUN_GAP.soft);
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
  // The edge a defender has over a non-lineman just from position counts at `RUN_GAP.pos` (`posEdge`).
  const even = d.engagedBy.reduce((s, b) => s + posEdge(d, b), 0) / n;
  // The talent edge is his rating edge past what equal-talent players at those positions would give (`full`), laid on the share
  // of the position edge that counts (`even`).
  const full = d.engagedBy.reduce((s, b) => s + evenEdge(d, b), 0) / n;
  const talent = runTalent(defPower(d.r) - blk - full + even, even);
  const edge = RUN_BLOCK_EDGE - (play.runScheme === 'stretch' ? REACH_PENALTY : 0);
  // A lineman sitting on the run gets off the ball into it (`LEAN_FX.surge`).
  const surge = d.role === 'DL' ? Math.max(0, d.lean.run) * LEAN_FX.surge : 0;
  const power = talent - (n - 1) * DOUBLE_TEAM - edge + d.blockRoll + surge;
  d.blockPower = power;
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

  // A defender who's winning wears the block down; one who's losing mostly stays on it (`RUN_CONTROL`).
  const k = RUN_CONTROL;
  // Winning, he wears it by his margin (`perPower`), at most `maxWear` a second: even a rout takes a beat to get off.
  const cap = d.engagedBy.every((b) => b.role === 'WR') ? k.stalkWear : k.maxWear;
  let wear = (power > 0 ? Math.min(cap, k.base + power * k.perPower) : k.losing + power * k.regain) / Math.pow(n, 1.5);
  const c = play.carrier;
  if (c && c.side === 'off' && play.phase === 'run') {
    const dc = dist(d.pos, c.pos);
    // The far side of the play peels off to pursue. Playside perimeter blocks (WRs on DBs) are far from
    // the back too while he gets to the edge, but they hold or break on the matchup.
    const backside = (d.pos.y - c.pos.y) * playSide(play) < -PEEL_BACKSIDE || d.pos.x < c.pos.x - PEEL_BACKSIDE;
    if (dc > PEEL_DIST && backside) return PEEL_RATE;
    // At the point of attack he fights to get off and make the play.
    if (dc < k.nearDist) {
      const lev = levered(d, c.pos);
      wear = Math.max(Math.max(0, wear) * (lev ? k.nearLevered : k.near), (lev ? k.nearFloorLevered : k.nearFloor) / n);
    }
  }
  d.blockControl = clamp(d.blockControl - wear * STEP, 0, 1);
  return d.blockControl <= 0 ? Infinity : 0;
}

/** A blocked defender's arm-tackle odds: the more of his block he's won back, the better (`RUN_CONTROL`). */
export function armOdds(d: Player): number {
  return RUN_CONTROL.armFloor + RUN_CONTROL.arm * (1 - d.blockControl);
}

/**
 * The pile: a blocked defender and his blocker are bodies, not ghosts. A ball carrier near the line with
 * an engaged pair right in front of him (`depth` ahead, `width` across) moves forward no faster than
 * the pile does, plus his own push (`push`, by strength: `strBase` + the rest by `str`). Where the line
 * drives its man back he rides the push; where the defender surges (short yardage, a beaten block) he's
 * held up or driven back, and can bounce to another lane. Only within `zone` of the LOS. A lane with a
 * pile in it reads as all but shut (`lane` s of time to spare at most): holes are the gaps between blocks.
 */
export const PILE = { zone: 3, depth: 1.0, width: 0.7, push: 0.9, strBase: 0.4, lane: 0.15 };

/** The cap the pile in front of carrier `c` puts on his forward speed (yd/s), or null with nothing there. */
export function pileCap(play: Play, c: Player): number | null {
  if (c.pos.x > play.los + PILE.zone) return null;
  let cap: number | null = null;
  const push = PILE.push * (PILE.strBase + (1 - PILE.strBase) * (c.r.str / 100));
  for (const d of play.def) {
    if (d.down || !d.engagedBy.length) continue;
    const ahead = d.pos.x - c.pos.x;
    if (ahead <= 0 || ahead > PILE.depth || Math.abs(d.pos.y - c.pos.y) > PILE.width) continue;
    const v = d.vel.x + push;
    if (cap === null || v < cap) cap = v;
  }
  return cap;
}

/** His blocker is between him and `at` (the ball carrier, or a spot the carrier is heading for). */
export function levered(d: Player, at: Vec): boolean {
  return !!d.blockDir && d.engagedBy.length > 0 && dot(d.blockDir, norm(sub(at, d.pos))) > LEVERAGE_DOT;
}

/**
 * A spot just past the LOS: `open`, how long until the first defender can get there (s), and `spare`,
 * how much sooner the back gets there than that, capped at 1.5.
 */
export interface Lane {
  y: number;
  open: number;
  spare: number;
}

/**
 * Lanes near the designed hole for carrier `c`: spots just past the LOS every half yard, each with
 * the time to spare there (how long the nearest defender needs to get there, with blocked defenders
 * taking longer and levered ones much longer, minus how long the back needs). The auto-runner picks
 * from these (`pickLane`); the renderer shows them as daylight.
 */
export function laneScores(play: Play, c: Player): Lane[] {
  const h = play.hole;
  // Gap runs stay near the hole, except a back on a perimeter path (power read's sweep), who reads wide.
  const outside = c === play.rb && !!c.routeName && PERIMETER_PATHS.has(c.routeName);
  // A sneak reads the A gaps only: there's nowhere else to go.
  const sneak = play.playDef.tags.concept === 'sneak';
  const w = sneak ? SNEAK_READ_W : (play.runScheme === 'gap' || play.runScheme === 'trap') && !outside ? GAP_READ_W : ZONE_READ_W;
  const lx = play.los + 0.5;
  const sp = maxSpeed(c);
  const lanes: Lane[] = [];
  for (let y = h.y - w; y <= h.y + w + 1e-6; y += 0.5) {
    if (y < 2 || y > 51.3) continue;
    const at = { x: lx, y };
    const mine = dist(c.pos, at) / sp;
    let open = Infinity;
    for (const d of play.def) {
      if (d.down) continue;
      const slow = d.engagedBy.length ? (levered(d, at) ? 3.5 : 1.5) : 1;
      // A free defender closing on the lane is nearer than he looks: where he'll be in `LANE_LEAD` s counts.
      const dd = d.engagedBy.length ? dist(d.pos, at) : Math.min(dist(d.pos, at), dist(add(d.pos, scale(d.vel, LANE_LEAD)), at));
      open = Math.min(open, (dd * slow) / maxSpeed(d));
      // A blocked pair standing in the lane is a wall, not daylight (`PILE`).
      if (d.engagedBy.length && Math.abs(d.pos.y - y) < PILE.width && d.pos.x > lx - 1.5 && d.pos.x < lx + 1) open = Math.min(open, PILE.lane);
    }
    lanes.push({ y, open, spare: Math.min(1.5, open - mine) });
  }
  return lanes;
}

/** Auto-runner lane: the one with the most time to spare, less a small lateral cost, sticking with the last pick on a tie. */
export function pickLane(play: Play, c: Player): number {
  const h = play.hole;
  let bestY = h.y;
  let bestScore = -Infinity;
  for (const { y, spare } of laneScores(play, c)) {
    const score = spare - Math.abs(y - h.y) * 0.02 + (Math.abs(y - play.laneY) < 0.01 ? 0.05 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }
  return bestY;
}
