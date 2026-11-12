import { FIELD_W } from '../engine/constants';
import { add, clamp, dist, lerp, scale, type Vec } from '../engine/math';
import type { Play } from '../game/playState';
import { maxSpeed, seek, type Player } from './player';
import { playSide } from './runBlocking';

/**
 * The defense's run jobs (docs/RUNGAME.md): on a designed run, every front player has a job from the
 * snap instead of rushing the QB. Gaps come from where the blockers line up; a lineman's job from where he
 * lines up against them, and the call's fit (box or spill, one gap or two).
 *
 * - `gap`: a one-gap lineman attacks his gap and plays the ball from it.
 * - `twoGap`: a two-gap lineman (head-up, on a call that two-gaps: `DefCall.twoGap`) controls the man
 *   over him and plays either side. College 4-3 fronts one-gap, so it's opt-in.
 * - `edge`: the playside end man. Box keeps his outside arm free and turns the ball back inside; spill
 *   wrong-arms the kick-out and pushes the ball wide to the pursuit.
 * - `chase`: the backside end. He stays home a beat for the QB's keep or a boot, then flattens down
 *   the line behind the ball: the chase that a slow-developing run (counter, split zone) has to block.
 * - `fill`: a backer playside of the ball fits the hole once he's read the flow.
 * - `cutback`: the backside backer holds the cutback lane until the ball crosses the line.
 *
 * The line reads its blocker first (`readAt`, by `prc`): before then he plays his gap; after it he knows
 * where the ball is going.
 */
export type RunJob = 'gap' | 'twoGap' | 'edge' | 'chase' | 'fill' | 'cutback';

/**
 * Run-fit tuning.
 * - `read`: the read step, `base` + (1 − prc/100) × `slow` s.
 * - `gapDepth`: a one-gap lineman's landmark in the backfield (behind the LOS, the offense's side); `gapWidth`
 *   how far off his blocker's shoulder.
 * - `headUp`: within this of a blocker's nose, he's head-up: a two-gap player.
 * - `edgeOut`: the edge sets this far outside the end blocker.
 * - `chaseHome`: the backside end stays home this long after the snap (the QB's keep, the boot); from the
 *   gun `gunHome` longer: the QB's keep is a real threat there (the read game), and he carries the fake out;
 *   `chaseDepth`: then he flattens down the line this deep in the backfield, at `chaseSpeed` of his top speed
 *   (squeezing through the bodies behind the line).
 * - `spill`: the league's share of calls that spill the kick-out (the rest box).
 * - `cutbackOff`: the backside backer's lane, this far backside of the ball; `fillFlow`: how far a fill
 *   backer flows from his alignment to the hole once he's read it.
 * - `keyTime`: how long a fill backer takes to find the real hole after his read (× 1.6 − prc/100), flowing
 *   with the back's heading (`keyLead` s ahead) until then.
 * - `squeeze`: a lineman whose blocker leaves him (blocks down, pulls) closes this far toward the ball.
 * - `standUp`: a rusher who lined up this close to the line is on the front (a stand-up end, a blitzer) and gets a line job.
 */
export const RUN_FIT = {
  read: { base: 0.12, slow: 0.3 },
  gapDepth: 1.0,
  gapWidth: 0.9,
  headUp: 0.45,
  edgeOut: 1.2,
  chaseHome: 0.45,
  gunHome: 0.3,
  chaseSpeed: 0.85,
  chaseDepth: 0.4,
  spill: 0.4,
  cutbackOff: 1.5,
  fillFlow: 0.5,
  keyTime: 0.5,
  keyLead: 0.6,
  squeeze: 1.5,
  standUp: 6,
};

/** The blockers' y at the snap (the line and attached ends), sorted across the field. */
function blockerYs(play: Play): number[] {
  return play.off
    .filter((o) => o.role === 'OL' || (o.isBlocker && o.role !== 'QB' && o.pos.x > play.los - 1.6 && Math.abs(o.pos.y - play.ballY) < 6.5))
    .map((o) => o.pos.y)
    .sort((a, b) => a - b);
}

/**
 * On the front: a down lineman, or anyone rushing: a stand-up end, the goal line's walked-up backer, a
 * blitzer. A blitz is called before the snap, so on a run he still attacks his gap (and the bodies in front
 * of him decide whether he gets through), instead of reading it like a backer. Within `standUp` yd of the
 * line at the snap.
 */
function onFront(play: Play, d: Player): boolean {
  return d.role === 'DL' || (d.assign?.kind === 'rush' && d.start.x <= play.los + RUN_FIT.standUp);
}

/** At the snap of a designed run: every front player's job, gap and read step. */
export function assignRunFits(play: Play): void {
  const side = playSide(play);
  const along = (p: { pos: Vec } | Vec) => (('pos' in p ? p.pos.y : p.y) - play.ballY) * side;
  const ys = blockerYs(play);
  if (!ys.length) return;
  const spill = !!play.defCall.runFit ? play.defCall.runFit === 'spill' : play.rng() < RUN_FIT.spill;
  // The front: the down linemen, and a backer standing on the line as a rusher (a stand-up end, the goal
  // line's walked-up backer). The end man on the line has the edge whether he's down or standing.
  const dl = play.def.filter((d) => d !== play.readKey && onFront(play, d));
  // The end man on the line each side: the widest down lineman (in a bear or a wide 9, an end).
  const play1 = dl.reduce<Player | null>((a, d) => (!a || along(d) > along(a) ? d : a), null);
  const back1 = dl.reduce<Player | null>((a, d) => (!a || along(d) < along(a) ? d : a), null);
  for (const d of dl) {
    d.readAt = play.snapTime + RUN_FIT.read.base + (1 - d.r.prc / 100) * RUN_FIT.read.slow;
    d.spill = spill;
    // His blocker by alignment: the nearest one across, and which shoulder he's on.
    const near = ys.reduce((a, y) => (Math.abs(y - d.pos.y) < Math.abs(a - d.pos.y) ? y : a), ys[0]);
    const shade = d.pos.y - near;
    const outside = d.pos.y < ys[0] - 0.3 || d.pos.y > ys[ys.length - 1] + 0.3;
    if (d === play1 && (outside || along(d) > along({ y: ys[ys.length - 1] } as Vec) - 1)) {
      d.runJob = 'edge';
      const end = side > 0 ? ys[ys.length - 1] : ys[0];
      d.gapY = clamp(end + side * RUN_FIT.edgeOut, 1, FIELD_W - 1);
    } else if (d === back1 && d !== play1) {
      d.runJob = 'chase';
      d.gapY = d.pos.y;
    } else if (play.defCall.twoGap && Math.abs(shade) < RUN_FIT.headUp) {
      d.runJob = 'twoGap';
      d.gapY = near;
    } else {
      // One gap: the shoulder he's on; head-up, the A gap if he's the inner tackle, else the B.
      const inner = Math.abs(d.pos.y - play.ballY) < 1.6;
      const dir = Math.abs(shade) >= RUN_FIT.headUp ? Math.sign(shade) : (inner ? -1 : 1) * (Math.sign(d.pos.y - play.ballY) || 1);
      d.runJob = 'gap';
      d.gapY = near + dir * RUN_FIT.gapWidth;
    }
  }
  // Backers: the backside-most one has the cutback lane, the rest fill.
  const lbs = play.def.filter((d) => d.role === 'LB' && !dl.includes(d) && (!d.manTarget || d.manTarget.isBlocker || d.manTarget === play.rb));
  const back = lbs.reduce<Player | null>((a, d) => (!a || along(d) < along(a) ? d : a), null);
  // A fill is a gap in the box, not the perimeter: on a toss or a sweep the alley is the force player's.
  const boxY = clamp(play.hole.y, ys[0] - 1, ys[ys.length - 1] + 1);
  for (const d of lbs) {
    // A backer in man on the back keys him and fills wherever he goes; only a zone backer has the cutback.
    d.runJob = lbs.length > 1 && d === back && d.manTarget !== play.rb ? 'cutback' : 'fill';
    // The cutback lane is backside of the center (the backside A and B gaps), wherever the hole is.
    d.gapY = d.runJob === 'cutback' ? play.ballY - side * RUN_FIT.cutbackOff : boxY;
  }
}

/** Where he aims along the line: his gap until he's read it, then by his job and the play. */
function lineGoal(play: Play, d: Player): Vec {
  const side = playSide(play);
  const read = play.time >= d.readAt;
  const los = play.los;
  switch (d.runJob) {
    case 'edge':
      // Set the edge: outside the end blocker, at the depth of the mesh; box squeezes from outside in.
      return { x: los - RUN_FIT.gapDepth * 0.5, y: read && d.spill ? lerp(d.gapY, play.hole.y, 0.4) : d.gapY };
    case 'chase': {
      // Home for the keep or the boot, then flat down the line behind the ball.
      const home = RUN_FIT.chaseHome + (play.qb.start.x < los - 3 ? RUN_FIT.gunHome : 0);
      if (play.time - play.snapTime < home) return { x: los - RUN_FIT.chaseDepth, y: d.pos.y };
      const ball = play.carrier ?? play.rb;
      return { x: Math.min(ball.pos.x, los - RUN_FIT.chaseDepth), y: ball.pos.y };
    }
    case 'twoGap':
      // Control the man over him: hold the line, square, then fall back toward the hole once he's read it.
      return { x: los + 0.2, y: read ? lerp(d.gapY, play.hole.y, 0.3) : d.gapY };
    default: {
      // One gap: attack it; read away from it, he squeezes toward the ball.
      const away = read && (play.hole.y - d.gapY) * side * Math.sign(d.gapY - play.ballY || 1) * side < 0;
      const y = read ? lerp(d.gapY, play.hole.y, away ? 0.25 : 0.45) : d.gapY;
      return { x: los - RUN_FIT.gapDepth, y };
    }
  }
}

/**
 * A free front player on a designed run before the ball's handed off: his technique, instead of rushing
 * the QB. False for anyone without a job (blitzers keep their rush) or once it's a pass.
 */
export function runTechnique(play: Play, d: Player): boolean {
  if (!d.runJob || !onFront(play, d) || !play.runBlocking()) return false;
  const tgt = lineGoal(play, d);
  // Free and through his gap with the mesh in front of him: he's in the backfield, go get the ball.
  const ball = play.playDef.qbRun || !play.rb ? play.qb : play.rb;
  // Free after his read (nobody on him, nobody about to be): he's a free man, and goes and gets the ball.
  // Through his gap with the ball near, the same. This is what an unblocked backside man does to a run.
  const blocker = play.off.some((o) => o.isBlocker && o.role !== 'QB' && !o.down && !play.idle.has(o) && (o.mark === d || o.poa === d) && dist(o.pos, d.pos) < 3);
  const through = d.pos.x <= play.los + 0.2 && dist(d.pos, ball.pos) < 3.5;
  if (d.runJob !== 'chase' && ((play.time >= d.readAt && !blocker) || through)) {
    d.goal = ball.pos;
    d.want = seek(d, add(ball.pos, scale(ball.vel, 0.3)), maxSpeed(d), 0.2);
    return true;
  }
  d.goal = tgt;
  d.want = seek(d, tgt, maxSpeed(d) * (d.runJob === 'chase' ? RUN_FIT.chaseSpeed : 0.9), 0.3);
  return true;
}

/**
 * What a blocked front player works toward (`runEngagement` pushes him that way): the edge keeps his
 * outside arm free (box) or fights inside the kick-out (spill); a two-gap player squares up over his man
 * until the ball shows; everyone else fights to the ball.
 */
export function engagedGoal(play: Play, d: Player, carrier: Vec): Vec {
  if (!d.runJob || (!play.runBlocking() && play.phase !== 'run')) return carrier;
  // Before the handoff the ball is going to the back, not staying with the QB.
  const ball = play.phase !== 'run' && !play.playDef.qbRun ? play.rb.pos : carrier;
  const side = playSide(play);
  if (d.runJob === 'edge') return { x: ball.x, y: ball.y + side * (d.spill ? -1.5 : 1.5) };
  if (d.runJob === 'twoGap' && play.phase !== 'run') return { x: play.los - 0.5, y: d.gapY };
  return ball;
}

/**
 * After the handoff, near the line: the edge keeps leverage (box: outside the ball, turning it back in;
 * spill: inside it, pushing it wide), and the cutback backer holds his lane until the ball crosses the line.
 * False once the ball's past them, or for anyone else: they pursue.
 */
export function runLeverage(play: Play, d: Player, c: Player): boolean {
  if (!d.runJob || c.side !== 'off' || c.pos.x > play.los + 1.5) return false;
  const side = playSide(play);
  if (d.runJob === 'edge' && Math.abs(c.pos.y - d.pos.y) > 1.2 && dist(c.pos, d.pos) < 8) {
    const tgt = { x: Math.max(play.los + 0.5, c.pos.x + 1), y: c.pos.y + side * (d.spill ? -0.8 : 0.8) };
    d.goal = tgt;
    d.want = seek(d, tgt, maxSpeed(d), 0.3);
    return true;
  }
  if (d.runJob === 'cutback' && (c.pos.y - play.hole.y) * side > -1) {
    const tgt = { x: play.los + 2.5, y: d.gapY };
    d.goal = tgt;
    d.want = seek(d, tgt, maxSpeed(d) * 0.9, 0.5);
    return true;
  }
  return false;
}

/**
 * A backer's fit spot once he's read the run: the hole (fill), or the cutback lane. A fill backer first
 * flows with the back's first steps (where he's headed: the jab of a counter, the zone track of a boot),
 * and only finds the real hole over `keyTime` s, faster with `prc`: the misdirection a counter is built on.
 */
export function fitSpot(play: Play, d: Player, depth: number): Vec {
  if (d.runJob === 'cutback') return { x: play.los + depth + 0.5, y: d.gapY };
  if (d.runJob === 'fill') {
    const rb = play.carrier && play.carrier.side === 'off' ? play.carrier : play.rb;
    const flow = rb ? rb.pos.y + rb.vel.y * RUN_FIT.keyLead : d.gapY;
    const read = clamp((play.time - d.fitAt) / (RUN_FIT.keyTime * (1.6 - d.r.prc / 100)), 0, 1);
    return { x: play.los + depth, y: lerp(d.start.y, lerp(flow, d.gapY, read), RUN_FIT.fillFlow) };
  }
  return { x: play.los + depth, y: lerp(d.start.y, play.hole.y, 0.35) };
}
