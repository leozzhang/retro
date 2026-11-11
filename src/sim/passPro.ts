import { add, clamp, dist, gauss, len, norm, scale, sub, type Vec } from '../engine/math';
import type { GameKind } from '../data/defenses';
import { passBlockValue } from '../data/ratings';
import type { Play } from '../game/playState';
import { isRusher } from './ai';
import { maxSpeed, seek, type Player } from './player';

/**
 * Pass protection and the pass rush (docs/PROTECTION.md). The pass-pro counterpart of runBlocking.ts.
 * - Every rusher gets a role from where he lines up: the outermost one each side is the edge (any
 *   position), the rest rush the A or B gap. He rolls a rush plan from his ratings, and the DC can
 *   run a game (a stunt) with two of them.
 * - The line calls its protection at the snap: man (big on big), a half slide with the back on the
 *   man side, or a full slide. Zone blockers own a gap and pass off whoever comes through it.
 * - A block is a rep that wears down (`REP`): the rusher always drives at his aim point, and the
 *   blocker slows and steers him rather than parking him, until he's beaten.
 * Only plays that pass-block (`protecting`): a designed run's line, a draw's fake pass set included,
 * keeps the old rules, so the run game is untouched.
 */

/**
 * Rush lanes and paths.
 * - `edgeFrom`: the outermost rusher lined up wider than this from the ball, each side, is the edge.
 * - `arcWidth` (+`wideArc` from a wide-nine spot past `wideFrom`), `arcFront`: the edge's landmark,
 *   outside the QB and level with his upfield shoulder. He turns at the QB within `bendAt` of the QB's
 *   depth, sooner with `acc` (`bendAcc`), at his near shoulder.
 * - Interior rushers line up in the A gap inside `aFrom`, otherwise the B gap; the gaps are `gapA`,
 *   `gapB` and `gapC` from the ball. They rush through it until within `laneClose` of the QB.
 * - `pastAngle`: degrees around the QB from straight in front; past it an edge has been run by him and
 *   comes straight back at him.
 * - `tight`: an edge lined up inside this is head-up on the tackle (bear, 5-tech).
 * - `TURN`: an edge turning at the QB aims at his near shoulder (`near` outside him) when he's free or
 *   winning; a tackle in control keeps him `wide` × control wider and `deep` × control behind the QB.
 */
export const RUSH = {
  edgeFrom: 1.6,
  arcWidth: 3.4,
  wideArc: 0.8,
  wideFrom: 5.5,
  arcFront: 0.5,
  bendAt: 1.4,
  bendAcc: 0.6,
  aFrom: 1.4,
  gapA: 0.75,
  gapB: 2.25,
  gapC: 3.8,
  laneClose: 2.5,
  pastAngle: 105,
  tight: 3.6,
};
export const TURN = { near: 0.6, wide: 2.2, deep: 1.2 };

/**
 * Rush plans, rolled per rusher at the snap.
 * - Edge: `power` (bull or long arm through the tackle's chest) with odds `power` + `powerPer` × (str −
 *   the average of spd and acc), within `powerMin`–`powerMax`, × `wideMul` from a wide-nine spot, +
 *   `tightAdd` head-up. Otherwise speed; `counter` of the speed rushers keep an inside counter ready.
 * - Interior: `bull` with odds `bull` + `bullPer` × (str − acc), within `bullMin`–`bullMax`; otherwise
 *   `quick` (swim or rip through his gap).
 */
export const PLAN = {
  power: 0.25, powerPer: 0.02, powerMin: 0.1, powerMax: 0.7, wideMul: 0.5, tightAdd: 0.25,
  counter: 0.4,
  bull: 0.5, bullPer: 0.02, bullMin: 0.2, bullMax: 0.8,
};

/**
 * The rep: a pass block's control (`Player.blockControl`) runs from 1 at contact to 0, when he's off it.
 * - `pace` scales the whole drain and every move's hit (the one dial for how long blocks last).
 * - Control drains every second by `base` + `perPt` × (power + the rep's roll) + `time` × seconds since
 *   the snap, where power is rsh·0.7 + spd·0.3 − pass-block value and the roll is rolled at contact
 *   (their sum capped at ±`edgeCap`, so even a mismatch takes a beat)
 *   (sd `rollSd` rating points: some reps are lost early, some held long), never less than `minDrain`, ÷ blockers^1.5. A speed rusher at the
 *   top of the arc (past `bendFrom`°) drains it × 1 + `bend` × (acc − `bendMid`) / 30.
 * - Every `moveEvery` s (sooner with `acc`) he tries a move: odds `moveWin` + `movePer` × (rsh − pbk),
 *   ÷ blockers. A win takes `moveHit` off (× `quick` for a quick interior rusher); a loss stalls him
 *   `stall` s at `stallSpeed`.
 * - A speed rusher with a counter ready uses it when his tackle oversets (`overset` yd outside him, or
 *   `oversetDeep` deeper): `counterHit` off, and his lane turns to the B gap.
 * - Motion: he drives at his aim point at `drive` × top speed (power and bull: × 0.8 + 0.4·str/100),
 *   and `floor` (`floorIn` for a bull or power rush, growing to it over `pushRamp` s) + (1 − floor) ×
 *   (1 − control) of that gets through. Nobody parks a
 *   rusher. An edge running up the arc keeps `edgeRun` of it at least: the tackle runs with him and
 *   fights the turn, not the depth.
 * - `ride`: a tackle in control (above `rideFrom`) runs an edge speed rusher around behind the QB once
 *   he's within `rideDepth` of the QB's depth.
 */
export const REP = {
  pace: 0.47,
  base: 0.12, perPt: 0.02, edgeCap: 40, time: 0, minDrain: 0.03, rollSd: 30,
  bendFrom: 50, bend: 0.35, bendMid: 80,
  moveEvery: 0.75, moveWin: 0.3, movePer: 0.012, moveHit: 0.25, quick: 1.4, stall: 0.25, stallSpeed: 0.3,
  overset: 0.4, oversetDeep: 1.2, counterHit: 0.3,
  drive: 0.6, floor: 0.22, floorIn: 0.12, pushRamp: 1.5, edgeRun: 0.75,
  ride: 1.6, rideFrom: 0.5, rideDepth: 1,
};

/**
 * Games (stunts, `DefTags.game`). The penetrator crashes across his blocker's face for `crashFor` s,
 * to the next blocker's inside shoulder (`crashTo` out from the ball on a TE, the B gap on an ET),
 * keeping `crashGive` of his speed even on a block: a slant drags the man on him. The looper jabs for
 * `delay` s, then loops tight behind him for `loopFor` s to the gap he left, slippery on the way
 * (`loopGive`). A man blocker the crasher runs into within `pickRange` is picked with odds `pickOdds`
 * + `pickPer` × (75 − pbk), within `pickMin`–`pickMax` (otherwise he saw it and stays on his man):
 * stunned `pick` s (less with `pbk`).
 */
export const GAME = { crashFor: 0.8, crashTo: 3.0, crashGive: 0.7, loopGive: 0.6, delay: 0.35, loopFor: 0.6, pickRange: 1.0, pick: 0.5, pickOdds: 0.35, pickPer: 0.012, pickMin: 0.1, pickMax: 0.7 };

/**
 * The protection call. The center counts the threats each side: the line plus anyone walked up within
 * `threatDepth` of the LOS and `boxWidth` of the ball. A zone blocker owns his gap (anyone within
 * `gapReach` of it, or outside the last one) and passes off a rusher crossing into it after a
 * recognition beat of `passOffMax` down to `passOffMin` (with `pbk` and `acc`). A rusher belongs to the
 * zone gap he's nearest (looking 0.3 s ahead); blockers re-sort only in the first `window` s, when games
 * happen, and after that stay on their man. Only threats within `threatDepth` of the LOS count, the
 * nearer the line the likelier (`depthCost` a yard). A pass blocker gets his hands on his own man from
 * `engage`. A lineman with nobody to block helps within `spareReach` of his spot, across the line.
 */
export const PROT = { threatDepth: 4.5, boxWidth: 8, gapReach: 1.4, passOffMax: 0.45, passOffMin: 0.15, window: 1.3, engage: 1.3, depthCost: 0.4, spareReach: 3 };

/**
 * The QB's feel (no input from the user, the harness, the replay autopilot): once an edge rusher is
 * `climbAngle` around him and nobody is free within `clear` of the spot in front, he climbs `stepUp`
 * into the pocket, after `after` s, but never to within `minDepth` of the LOS (a shallow play-action
 * drop has no room to climb). `box`: the pocket is the QB within this of the ball (the tackle box).
 */
export const POCKET = { stepUp: 1.1, climbAngle: 75, clear: 2.2, after: 0.8, minDepth: 5, box: 4 };

export type RushPlan = 'speed' | 'counter' | 'power' | 'bull' | 'quick';

/** A rusher's job this snap (`assignRushRoles`). */
export interface RushRole {
  kind: 'edge' | 'aGap' | 'bGap';
  /** The side of the ball he's on (±1). */
  side: 1 | -1;
  /** His lane, as an offset from the QB's y. */
  gapY: number;
  plan: RushPlan;
  /** A game: crashing across, or looping behind, to `gameY` (offset from the ball). */
  game?: 'crash' | 'loop';
  gameY?: number;
  countered?: boolean;
  /** Seconds after the snap of his next move, and until when a failed one stalls him. */
  moveAt: number;
  stallUntil: number;
}

/** A pass blocker's job: a gap he owns (zone) or a man (`zone` false); a pass-off in progress. */
export interface ProtectJob {
  zone: boolean;
  gapY: number;
  next: Player | null;
  switchAt: number;
  picked?: boolean;
}

/**
 * The line is pass-blocking this play: not a designed run (nor a draw's fake set), and not a screen,
 * whose line sets soft and lets the rush go (it keeps the old rules).
 */
export function protecting(play: Play): boolean {
  return play.playDef.block !== 'run' && !play.playDef.screen;
}

/**
 * The pocket's live: the QB has the ball behind his line (not thrown, not scrambling), inside the tackle
 * box (`POCKET.box` of the ball). A bootleg or a QB rolled out has no pocket: the old rules chase him.
 */
export function inPocket(play: Play): boolean {
  return protecting(play) && play.phase === 'live' && !play.thrown && !play.scramble && inBox(play);
}

function inBox(play: Play): boolean {
  return Math.abs(play.qb.pos.y - play.ballY) <= POCKET.box;
}

/** Degrees around the QB from straight in front of him (0) to straight behind (180). */
export function arcAngle(d: Player, qb: Vec): number {
  const u = sub(d.pos, qb);
  const l = len(u);
  return l < 0.01 ? 0 : (Math.acos(clamp(u.x / l, -1, 1)) * 180) / Math.PI;
}

// ---------------------------------------------------------------- rush roles

function rollPlan(play: Play, d: Player, edge: boolean, out: number): RushPlan {
  const r = play.rng();
  if (edge) {
    let pw = clamp(PLAN.power + PLAN.powerPer * (d.r.str - (d.r.spd + d.r.acc) / 2), PLAN.powerMin, PLAN.powerMax);
    if (out > RUSH.wideFrom) pw *= PLAN.wideMul;
    else if (out < RUSH.tight) pw += PLAN.tightAdd;
    if (r < pw) return 'power';
    return r < pw + (1 - pw) * PLAN.counter ? 'counter' : 'speed';
  }
  return r < clamp(PLAN.bull + PLAN.bullPer * (d.r.str - d.r.acc), PLAN.bullMin, PLAN.bullMax) ? 'bull' : 'quick';
}

/**
 * At the snap: every called rusher's role and plan, and the DC's game if he called one. One random
 * draw per rusher, on pass plays only.
 */
export function assignRushRoles(play: Play): void {
  for (const d of play.def) d.rushRole = null;
  if (!protecting(play)) return;
  const by = play.ballY;
  const rushers = play.def.filter((d) => d.assign?.kind === 'rush').sort((a, b) => a.pos.y - b.pos.y);
  const role = (kind: RushRole['kind'], side: 1 | -1, gapY: number, plan: RushPlan): RushRole => ({ kind, side, gapY, plan, moveAt: 0.4, stallUntil: 0 });
  for (const s of [-1, 1] as const) {
    let edge: Player | null = null;
    for (const d of rushers) {
      const out = (d.pos.y - by) * s;
      if (out > RUSH.edgeFrom && (!edge || out > (edge.pos.y - by) * s)) edge = d;
    }
    if (edge) {
      const out = (edge.pos.y - by) * s;
      edge.rushRole = role('edge', s, s * RUSH.gapC, rollPlan(play, edge, true, out));
    }
  }
  // Inside: linemen first take the gap they line up in; blitzers take what's left on their side.
  const taken = new Set<string>();
  const inside = rushers.filter((d) => !d.rushRole).sort((a, b) => (a.role === 'DL' ? 0 : 1) - (b.role === 'DL' ? 0 : 1));
  for (const d of inside) {
    const dy = d.pos.y - by;
    const side: 1 | -1 = dy < 0 ? -1 : 1;
    let kind: 'aGap' | 'bGap' = Math.abs(dy) < RUSH.aFrom ? 'aGap' : 'bGap';
    if (taken.has(`${kind}${side}`)) kind = kind === 'aGap' ? 'bGap' : 'aGap';
    taken.add(`${kind}${side}`);
    d.rushRole = role(kind, side, side * (kind === 'aGap' ? RUSH.gapA : RUSH.gapB), rollPlan(play, d, false, Math.abs(dy)));
  }
  const g = play.tags.game;
  if (g) applyGame(play, g.kind, g.side);
}

/** Lays a game on the two rushers it uses on `side`; does nothing if they aren't both rushing. */
function applyGame(play: Play, kind: GameKind, side: 1 | -1): void {
  const roles = play.def.filter((d) => d.rushRole);
  const edge = roles.find((d) => d.rushRole!.kind === 'edge' && d.rushRole!.side === side);
  const tackles = roles.filter((d) => d.rushRole!.kind !== 'edge' && d.role === 'DL');
  const near = tackles.filter((d) => d.rushRole!.side === side).sort((a, b) => Math.abs(b.pos.y - play.ballY) - Math.abs(a.pos.y - play.ballY))[0];
  const far = tackles.find((d) => d.rushRole!.side !== side);
  const set = (d: Player, game: 'crash' | 'loop', gy: number) => {
    const r = d.rushRole!;
    r.game = game;
    r.gameY = gy;
    r.kind = 'bGap';
    r.gapY = gy;
    if (r.plan === 'speed' || r.plan === 'counter' || r.plan === 'power') r.plan = game === 'crash' ? 'bull' : 'quick';
  };
  if (kind === 'TE' && edge && near) {
    set(near, 'crash', side * GAME.crashTo);
    set(edge, 'loop', side * RUSH.gapB);
  } else if (kind === 'ET' && edge && near) {
    set(edge, 'crash', side * RUSH.gapB);
    set(near, 'loop', side * RUSH.gapC);
  } else if (kind === 'TT' && near && far) {
    set(near, 'crash', far.rushRole!.gapY);
    set(far, 'loop', near.rushRole!.gapY);
  }
}

// ---------------------------------------------------------------- the protection call

/**
 * The line's call at the snap. With a back in protection: a half slide toward the side showing more
 * threats (a tie slides away from the back), the back on the man side. Five-man: man (big on big), the
 * spare helping or taking a blitzer, so no edge is left free on purpose (a play-action QB with his back
 * turned can't throw hot); a play's `scheme.slide` forces a full slide its way, the back checking the
 * backside edge (with no back, that edge is the QB's). Man blockers take the
 * lineman across; zone blockers own a gap (`zoneTargets` matches their men each step). Backs take the
 * blitzers. Returns the slide side (0 for man).
 */
export function callProtection(play: Play, forced?: 1 | -1): 1 | -1 | 0 {
  const by = play.ballY;
  const ol = play.off.filter((o) => o.role === 'OL').sort((a, b) => a.pos.y - b.pos.y);
  const backs = play.off.filter((o) => o.isBlocker && o.role !== 'OL' && !o.stalk);
  for (const o of play.off) o.pro = null;
  const threats = play.def.filter((d) => d.role === 'DL' || (d.pos.x < play.los + PROT.threatDepth && Math.abs(d.pos.y - by) < PROT.boxWidth));
  const count = (s: number) => threats.filter((d) => (d.pos.y - by) * s > 0.5).length;
  const backSide = backs.length ? Math.sign(backs.reduce((t, b) => t + b.pos.y - by, 0)) : 0;
  let slide: 1 | -1 | 0 = forced ?? 0;
  if (!slide) {
    const diff = count(1) - count(-1);
    if (backs.length) slide = diff > 0 ? 1 : diff < 0 ? -1 : backSide > 0 ? -1 : 1;
  }
  const gaps = [-RUSH.gapC, -RUSH.gapB, -RUSH.gapA, RUSH.gapA, RUSH.gapB, RUSH.gapC];
  const zone = (o: Player, gapY: number) => (o.pro = { zone: true, gapY, next: null, switchAt: 0 });
  const manOL: Player[] = [];
  if (slide && (forced || !backs.length)) {
    // Full slide: everyone takes the gap toward the slide; the far edge is the QB's (throw hot).
    const order = slide > 0 ? ol : [...ol].reverse();
    const gs = slide > 0 ? gaps.slice(1) : [...gaps].reverse().slice(1);
    order.forEach((o, i) => zone(o, gs[i]));
  } else if (slide) {
    // Half slide: the center and the slide side zone their gaps; the man side takes the men across.
    for (const o of ol) {
      const s = (o.pos.y - by) * slide;
      if (s > 2.2) zone(o, slide * RUSH.gapC);
      else if (s > 0.8) zone(o, slide * RUSH.gapB);
      else if (s > -0.8) zone(o, slide * RUSH.gapA);
      else manOL.push(o);
    }
  } else {
    manOL.push(...ol);
  }
  for (const o of manOL) o.pro = { zone: false, gapY: o.pos.y - by, next: null, switchAt: 0 };
  // Man blockers: the linemen across from them, by alignment.
  const rushers = play.def.filter(isRusher);
  const take = (pool: Player[], r: Player, metric: (b: Player) => number) => {
    let best: Player | null = null;
    for (const b of pool) if (!b.mark && (!best || metric(b) < metric(best))) best = b;
    if (best) best.mark = r;
    return !!best;
  };
  const zoned = (r: Player) =>
    r.pos.x <= play.los + PROT.threatDepth && ol.some((o) => o.pro?.zone && Math.abs(r.pos.y - (by + o.pro.gapY)) < PROT.gapReach);
  for (const r of rushers.filter((d) => d.role === 'DL').sort((a, b) => a.pos.y - b.pos.y)) {
    if (manOL.length && !zoned(r)) take(manOL, r, (b) => Math.abs(b.pos.y - r.pos.y));
  }
  // A called slide: the back checks the backside edge the line slid away from.
  if (forced && backs.length) {
    const edge = rushers.filter((r) => (r.pos.y - by) * -forced > RUSH.edgeFrom).sort((a, b) => (a.pos.y - b.pos.y) * forced)[0];
    if (edge) take(backs, edge, (b) => dist(b.pos, edge.pos));
  }
  // Backs: blitzers first, the man side's before the rest; then whoever no lineman has.
  const loose = rushers.filter((r) => !play.off.some((o) => o.mark === r) && !zoned(r));
  loose.sort((a, b) => (slide ? (b.pos.y - by) * -slide - (a.pos.y - by) * -slide : 0));
  for (const r of loose) take(backs, r, (b) => dist(b.pos, r.pos));
  const targets = zoneTargets(play);
  for (const o of ol) if (o.pro?.zone) zoneMark(play, o, targets, true);
  return slide;
}

/** How long a zone blocker takes to see a rusher crossing into his gap and pass his man off. */
function passOffLag(p: Player): number {
  return PROT.passOffMax - (PROT.passOffMax - PROT.passOffMin) * clamp((p.r.pbk + p.r.acc) / 200, 0, 1);
}

/** How far a rusher at `y` is from a zone blocker's gap (anything outside the last gap is in it). */
function gapOff(play: Play, o: Player, y: number): number {
  const g = o.pro!.gapY;
  const out = (y - (play.ballY + g)) * Math.sign(g || 1);
  return Math.abs(g) >= RUSH.gapC - 0.01 && out > 0 ? 0 : Math.abs(y - (play.ballY + g));
}

/**
 * The zone blockers' men this step, matched one to one like the zone coverage's pattern match: every
 * (blocker, rusher) pair within `gapReach` of the gap, nearest gap and nearest the line first
 * (`depthCost`), each rusher to one blocker. Only threats within `threatDepth` of the LOS count (a deep
 * safety whose man stayed in isn't one yet), and not a man blocker's man he's already on.
 */
function zoneTargets(play: Play): Map<Player, Player> {
  const zones = play.off.filter((o) => o.role === 'OL' && o.pro?.zone && !o.down);
  const pairs: { o: Player; d: Player; sc: number }[] = [];
  for (const d of play.def) {
    if (d.down || !isRusher(d) || d.pos.x > play.los + PROT.threatDepth) continue;
    if (play.off.some((o) => o.pro && !o.pro.zone && o.mark === d && o.engaged === d)) continue;
    const y = d.pos.y + d.vel.y * 0.3;
    for (const o of zones) {
      const off = gapOff(play, o, y);
      if (off > PROT.gapReach) continue;
      pairs.push({ o, d, sc: off + PROT.depthCost * Math.max(0, d.pos.x - play.los) + (o.mark === d ? -0.3 : 0) });
    }
  }
  pairs.sort((a, b) => a.sc - b.sc);
  const out = new Map<Player, Player>();
  const taken = new Set<Player>();
  for (const pr of pairs) {
    if (out.has(pr.o) || taken.has(pr.d)) continue;
    out.set(pr.o, pr.d);
    taken.add(pr.d);
  }
  return out;
}

/**
 * A zone blocker's man this step: his match (`zoneTargets`), passed off after a recognition beat. He
 * stays on a man he's engaged with who's still in his gap and nobody else has; with no match he stays
 * on (or helps with) the man he has.
 */
function zoneMark(play: Play, p: Player, targets: Map<Player, Player>, now = false): void {
  const pro = p.pro!;
  const best = targets.get(p) ?? null;
  const cur = p.mark;
  const live = (d: Player | null): d is Player => !!d && !d.down && isRusher(d);
  if (!best) {
    pro.next = null;
    if (cur && !live(cur)) p.mark = null;
    return;
  }
  if (best === cur) {
    pro.next = null;
    return;
  }
  // A new threat doesn't pull him off the man on him (that rusher is someone else's, or the QB's hot
  // read); he passes off a man only when he's left the gap or another blocker has him (a game).
  if (live(cur) && p.engaged === cur && gapOff(play, p, cur.pos.y + cur.vel.y * 0.3) <= PROT.gapReach) {
    const othersHave = [...targets].some(([o, d]) => o !== p && d === cur);
    if (!othersHave) {
      pro.next = null;
      return;
    }
  }
  if (now || !live(cur)) {
    p.mark = best;
    pro.next = null;
    return;
  }
  if (pro.next !== best) {
    pro.next = best;
    pro.switchAt = play.time + passOffLag(p);
  } else if (play.time >= pro.switchAt) {
    if (p.engaged) p.engaged = null; // `updateEngagements` drops him from the old man
    p.mark = best;
    pro.next = null;
  }
}

/** Each step in the pocket: zone blockers re-mark, and a crashing penetrator picks man blockers. */
export function protectStep(play: Play): void {
  if (!inPocket(play)) return;
  const t = play.time - play.snapTime;
  const targets = zoneTargets(play);
  for (const o of play.off) {
    if (o.role !== 'OL' || !o.pro?.zone || o.down || o.stun > 0) continue;
    if (t < PROT.window || !o.mark || o.mark.down) zoneMark(play, o, targets);
  }
  for (const d of play.def) {
    const r = d.rushRole;
    if (!r || r.game !== 'crash' || t > GAME.crashFor || d.down) continue;
    for (const o of play.off) {
      if (o.role !== 'OL' || !o.pro || o.pro.zone || o.pro.picked || o.mark === d || o.engaged === d) continue;
      if (dist(o.pos, d.pos) < GAME.pickRange) {
        o.pro.picked = true; // one chance: either he's picked or he sees it coming
        if (play.rng() < clamp(GAME.pickOdds + GAME.pickPer * (75 - o.r.pbk), GAME.pickMin, GAME.pickMax)) {
          o.stun = Math.max(o.stun, GAME.pick * (1.2 - (0.4 * o.r.pbk) / 100));
          if (o.engaged) o.engaged = null;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- paths

/** Where a rusher is driving right now (the same point free or blocked). */
export function rusherAim(play: Play, d: Player): Vec {
  const qb = play.qb.pos;
  const r = d.rushRole;
  if (!r) return qb;
  const t = play.time - play.snapTime;
  if (r.game === 'crash' && t < GAME.crashFor) return { x: d.pos.x - 1, y: play.ballY + r.gameY! };
  if (r.game === 'loop' && t < GAME.delay) return { x: d.pos.x - 0.3, y: d.pos.y };
  if (r.game === 'loop' && t < GAME.delay + GAME.loopFor) return { x: play.los - 1, y: play.ballY + r.gameY! };
  const a = d.assign;
  if (a?.kind === 'rush' && a.contain) return { x: qb.x + 0.5, y: qb.y + r.side * 2.5 };
  if (r.kind === 'edge' && !r.countered) {
    if (arcAngle(d, qb) >= RUSH.pastAngle) return qb; // run past: back at him
    if (r.plan === 'power') return { x: qb.x + 0.6, y: qb.y + r.side * 1.0 };
    const bend = RUSH.bendAt * (1 - RUSH.bendAcc / 2 + (RUSH.bendAcc * d.r.acc) / 100);
    if (d.pos.x - qb.x > bend) {
      const wide = Math.abs(d.start.y - play.ballY) > RUSH.wideFrom ? RUSH.wideArc : 0;
      return { x: qb.x + RUSH.arcFront, y: qb.y + r.side * (RUSH.arcWidth + wide) };
    }
    // Turning at him: a tackle with control keeps him wide and runs him deep; one losing gives up the
    // near shoulder (`TURN`).
    const ctl = d.engagedBy.length ? clamp(d.blockControl, 0, 1) : 0;
    return { x: qb.x - TURN.deep * ctl, y: qb.y + r.side * (TURN.near + TURN.wide * ctl) };
  }
  if (dist(d.pos, qb) < RUSH.laneClose) return qb;
  return { x: qb.x, y: qb.y + r.gapY };
}

/** A rusher's path before contact, or null to rush as before (no role: hug rushers, run plays). */
export function rushPath(play: Play, d: Player, speed: number): Vec | null {
  if (!d.rushRole || !protecting(play) || !inBox(play)) return null;
  const aim = rusherAim(play, d);
  d.goal = aim;
  const t = play.time - play.snapTime;
  if (d.rushRole.game === 'loop' && t < GAME.delay) return seek(d, aim, speed * 0.25, 0.3);
  if (aim === play.qb.pos) return null; // close: run him down (leading him)
  return seek(d, aim, speed, 0.3);
}

/**
 * A lineman's pass set on his man before contact, or null for the old seek (backs, runs). The tackle
 * on an edge kick-slides, a half-man deeper than him on his inside shoulder; the interior sets short in
 * front of his man's gap (no more than `gapStep` off his spot) and mirrors him inside `mirrorFrom`.
 * Nobody sets upfield of his stance, and each eases into his spot over the last `arrive` yd.
 */
export const PASS_PRO = { lead: 0.6, insideShade: 0.35, kick: 0.7, tackleDepth: 4, floor: 1.2, interiorDepth: 1.1, mirrorFrom: 2.2, gapStep: 1.6, arrive: 1 };

export function passSet(play: Play, p: Player, r: Player): Vec | null {
  if (p.role !== 'OL' || !protecting(play)) return null;
  p.faceLock = 1;
  const qb = play.qb.pos;
  const role = r.rushRole;
  if (role?.kind === 'edge') {
    // Never upfield of his stance: a pass set waits for the rusher (a walked-up blitzer too).
    const x = Math.min(p.start.x, Math.max(r.pos.x - PASS_PRO.lead, qb.x + PASS_PRO.floor, p.start.x - PASS_PRO.tackleDepth));
    const tgt = { x, y: r.pos.y - role.side * PASS_PRO.insideShade };
    return seek(p, tgt, maxSpeed(p) * PASS_PRO.kick * (0.8 + (0.4 * p.r.pbk) / 100), PASS_PRO.arrive);
  }
  // Interior: set short in front of the gap he's coming through, then stay on the line from him to the QB
  // once he's close (`mirrorFrom`). Mirroring a backer out in space would open the gap he cuts back to.
  if (role && dist(r.pos, p.pos) > PASS_PRO.mirrorFrom) {
    const y = clamp(qb.y + role.gapY, p.start.y - PASS_PRO.gapStep, p.start.y + PASS_PRO.gapStep);
    return seek(p, { x: p.start.x - PASS_PRO.interiorDepth, y }, maxSpeed(p) * 0.9, PASS_PRO.arrive);
  }
  const toQb = norm(sub(qb, r.pos));
  const onLine = { x: r.pos.x + toQb.x * 0.9, y: r.pos.y + toQb.y * 0.9 };
  const tgt = { x: Math.min(p.start.x, Math.max(onLine.x, Math.min(p.start.x - PASS_PRO.interiorDepth, onLine.x + 0.6))), y: onLine.y };
  return seek(p, tgt, maxSpeed(p) * 0.9, PASS_PRO.arrive);
}

// ---------------------------------------------------------------- the rep

/** A new pass block: full control, and his first move a beat away. */
export function startRep(play: Play, d: Player): void {
  d.blockControl = 1;
  d.blockRoll = gauss(play.rng) * REP.rollSd;
  const r = d.rushRole;
  if (r) r.moveAt = Math.max(r.moveAt, play.time - play.snapTime + REP.moveEvery * 0.5);
}

/**
 * One step of a pass block in the pocket (`REP`): drain the blocker's control, maybe a move or a
 * counter, and move the pair, the rusher driving at his aim point with the blocker slowing and steering
 * him. True when the rusher is off the block.
 */
export function passEngagement(play: Play, d: Player, dt: number): boolean {
  const bs = d.engagedBy;
  const n = bs.length;
  const blk = bs.reduce((s, b) => s + passBlockValue(b.r), 0) / n;
  const pbk = bs.reduce((s, b) => s + b.r.pbk, 0) / n;
  const power = d.r.rsh * 0.7 + d.r.spd * 0.3 - blk - (n - 1) * 15;
  d.blockPower = power;
  const t = play.time - play.snapTime;
  const qb = play.qb.pos;
  const r = d.rushRole;
  const plan = r?.plan ?? 'bull';
  const ang = arcAngle(d, qb);
  const speedRush = r?.kind === 'edge' && (plan === 'speed' || plan === 'counter') && !r.countered;

  let drain = Math.max(REP.minDrain, REP.base + REP.perPt * clamp(power + d.blockRoll, -REP.edgeCap, REP.edgeCap) + REP.time * t);
  if (speedRush && ang >= REP.bendFrom) drain *= Math.max(0.3, 1 + (REP.bend * (d.r.acc - REP.bendMid)) / 30);
  d.blockControl -= (REP.pace * drain * dt) / Math.pow(n, 1.5);
  if (r) {
    if (t >= r.moveAt) {
      r.moveAt = t + REP.moveEvery * (1.2 - (0.4 * d.r.acc) / 100);
      if (play.rng() < clamp(REP.moveWin + REP.movePer * (d.r.rsh - pbk), 0.05, 0.85) / n) {
        d.blockControl -= REP.pace * REP.moveHit * (plan === 'quick' ? REP.quick : 1);
      } else {
        r.stallUntil = t + REP.stall;
      }
    }
    if (plan === 'counter' && !r.countered && r.kind === 'edge') {
      const b = bs[0];
      if ((b.pos.y - d.pos.y) * r.side > REP.overset || d.pos.x - b.pos.x > REP.oversetDeep) {
        r.countered = true;
        r.gapY = r.side * RUSH.gapB;
        d.blockControl -= REP.counterHit;
      }
    }
  }
  if (d.blockControl <= 0) return true;

  const aim = rusherAim(play, d);
  d.goal = aim;
  const ctl = clamp(d.blockControl, 0, 1);
  let sp = maxSpeed(d) * REP.drive * (plan === 'power' || plan === 'bull' ? 0.8 + (0.4 * d.r.str) / 100 : 1);
  if (r && t < r.stallUntil) sp *= REP.stallSpeed;
  // A bull or power rush (inside, or a power edge) builds its push over the rep (`pushRamp`): the wall
  // is firm off the snap. A speed rusher gets the edge's floor.
  const floor = speedRush || (r?.kind === 'edge' && r.countered) ? REP.floor : REP.floorIn * clamp(t / REP.pushRamp, 0, 1);
  let give = floor + (1 - floor) * (1 - ctl);
  const upTheArc = speedRush && d.pos.x - qb.x > RUSH.bendAt && arcAngle(d, qb) < RUSH.pastAngle;
  if (upTheArc) give = Math.max(give, REP.edgeRun);
  if (r?.game === 'crash' && t < GAME.crashFor) give = Math.max(give, GAME.crashGive);
  if (r?.game === 'loop' && t >= GAME.delay && t < GAME.delay + GAME.loopFor) give = Math.max(give, GAME.loopGive);
  let vel = scale(norm(sub(aim, d.pos)), sp * give);
  if (speedRush && ctl > REP.rideFrom && ang < RUSH.pastAngle && d.pos.x - qb.x < REP.rideDepth) {
    // The tackle uses his momentum: around behind the QB.
    const u = norm(sub(d.pos, qb));
    const tan = { x: -u.y * r!.side, y: u.x * r!.side };
    vel = add(vel, scale(tan, (REP.ride * (ctl - REP.rideFrom)) / (1 - REP.rideFrom)));
  }
  d.want = vel;
  for (const b of bs) b.want = vel;
  return false;
}

// ---------------------------------------------------------------- the QB

/**
 * Where the QB sets up with nobody steering him: his drop, and a step up into the pocket once an edge
 * rusher is around him and the spot in front is clear.
 */
export function pocketSpot(play: Play, climbed: boolean): { spot: Vec; climbed: boolean } {
  const drop = play.qbDrop;
  const up = { x: drop.x + POCKET.stepUp, y: drop.y };
  if (climbed) return { spot: up, climbed };
  if (!protecting(play) || play.time - play.snapTime < POCKET.after || up.x > play.los - POCKET.minDepth || !inBox(play)) return { spot: drop, climbed };
  const qb = play.qb.pos;
  const edge = play.def.some((d) => d.rushRole?.kind === 'edge' && !d.down && arcAngle(d, qb) >= POCKET.climbAngle && dist(d.pos, qb) < 5);
  if (!edge) return { spot: drop, climbed };
  const clear = !play.def.some((d) => !d.down && !d.engagedBy.length && dist(d.pos, up) < POCKET.clear);
  return clear ? { spot: up, climbed: true } : { spot: drop, climbed };
}
