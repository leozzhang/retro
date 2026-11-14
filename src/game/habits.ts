import type { DefSlot } from '../data/teams';
import { FIELD_W } from '../engine/constants';
import { clamp, dist, lerp, type Vec } from '../engine/math';
import type { ThrowKind } from '../sim/ball';
import type { Player } from '../sim/player';

/**
 * The players learn your throws (docs/DEFENSE.md, "The players learn your throws"). Every pass the user
 * throws is a record: the look, where the QB threw from (the pocket, or rolled to a side), when, how
 * (bullet, touch, lob), to whom and where the ball came down, and who got beaten. During a snap the
 * defense reads the live cues (the look, the QB leaving the pocket to a side, the clock) against those
 * records (`expectThrow`), and the defenders whose job it is act on it (`anticRoles`): one sits in the
 * throwing lane, jumps the route when it's due, and a backer chases a rolling QB. Each is double-edged
 * (sim/ai.ts `ANTIC`). Plain JSON, kept in the DC's brain for a game and on film between games.
 */

/**
 * Habit tuning.
 * - `decay`: weight left on each older throw, per pass thrown; `keep`: the most records kept.
 * - `otherLook`: a record from another look weighs this much (the look is the strongest cue).
 * - `rollOther`: a record whose QB rolled the other way weighs this much; `rollPocket`: one that rolled
 *   while the QB is still in the pocket (he may yet go); `pocketRoll`: a pocket record when he's rolled.
 * - `trust`: weight of matching records before the read is half believed.
 * - `film`: the most records carried on film.
 */
export const HABIT = { decay: 0.85, keep: 24, otherLook: 0.3, rollOther: 0.1, rollPocket: 0.5, pocketRoll: 0.3, trust: 2, film: 12 };

/** The QB is out of the pocket this far across from where the ball was snapped (yd). */
export const ROLL = { out: 4.5 };

/** One throw, as the defense remembers it. Lateral spots are mirrored (`dy`) so a roll left and a roll right match. */
export interface ThrowSeen {
  look: string;
  /** Where the QB threw from: 0 the pocket, 1 rolled to the formation's strong side, -1 to its weak side. */
  roll: -1 | 0 | 1;
  /** Seconds from the snap to the release. */
  t: number;
  kind: ThrowKind;
  /** The receiver thrown to (slot), and his route. */
  slot: string;
  route?: string;
  /** The catch spot: yd past the line, and yd across from the ball toward the formation's strong side. */
  dx: number;
  dy: number;
  gain: number;
  /** The defender nearest the catch, and whether it was caught. */
  beaten?: DefSlot;
  caught: boolean;
  /** Weight (decayed). */
  w: number;
}

/** The live cues in a snap: the look, the clock since the snap, the QB's side, and the field geometry. */
export interface Cue {
  look: string;
  t: number;
  /** The QB's roll now (0 in the pocket), relative to the formation's strength. */
  roll: -1 | 0 | 1;
  los: number;
  ballY: number;
  /** +1 if the formation's strong side is toward larger y. */
  strong: 1 | -1;
}

/** What the defense expects on this snap. */
export interface Expect {
  slot: string;
  route?: string;
  /** The catch spot (world yards), the release time, the share of those throws that were bullets. */
  spot: Vec;
  t: number;
  bullet: number;
  /** 0..1: the share of the matching weight on that receiver, by how much matching weight there is. */
  conf: number;
  /** The share of matching weight from a QB rolled to this snap's roll side (0 in the pocket). */
  rollConf: number;
  /** The QB's side when he rolls, in the formation's terms. */
  rollSide: -1 | 0 | 1;
}

/** The QB's roll now: out of the pocket to the strong (1) or weak (-1) side, or 0. */
export function rollOf(qbY: number, ballY: number, strong: 1 | -1): -1 | 0 | 1 {
  const dy = qbY - ballY;
  if (Math.abs(dy) < ROLL.out) return 0;
  return (Math.sign(dy) * strong) as -1 | 1;
}

/** Add a throw (decaying the older ones), most recent first, at most `HABIT.keep`. */
export function addThrow(recs: ThrowSeen[], t: Omit<ThrowSeen, 'w'>, w = 1): ThrowSeen[] {
  for (const r of recs) r.w *= HABIT.decay;
  return [{ ...t, w }, ...recs].filter((r) => r.w > 0.02).slice(0, HABIT.keep);
}

/** Each record's weight against the cues now. */
function matchW(r: ThrowSeen, c: Cue): number {
  let w = r.w * (r.look === c.look ? 1 : HABIT.otherLook);
  if (r.roll !== 0) w *= c.roll === r.roll ? 1 : c.roll === 0 ? HABIT.rollPocket : HABIT.rollOther;
  else if (c.roll !== 0) w *= HABIT.pocketRoll;
  return w;
}

/**
 * The throw he expects from these records and cues: the receiver most of the matching weight went to,
 * and where and when that ball came down. Null with no records.
 */
export function expectThrow(recs: ThrowSeen[], c: Cue): Expect | null {
  if (!recs.length) return null;
  const by = new Map<string, number>();
  let tot = 0;
  const ws = recs.map((r) => {
    const w = matchW(r, c);
    tot += w;
    by.set(r.slot, (by.get(r.slot) ?? 0) + w);
    return w;
  });
  if (tot <= 0) return null;
  const [slot, sw] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  let x = 0, y = 0, t = 0, bullet = 0, roll = 0, rollW = 0, side = 0;
  let route: string | undefined;
  let rw = 0;
  recs.forEach((r, i) => {
    if (r.slot !== slot) return;
    const w = ws[i];
    x += w * r.dx;
    y += w * r.dy;
    t += w * r.t;
    if (r.kind === 'bullet') bullet += w;
    if (r.roll !== 0) {
      rollW += w;
      side += w * r.roll;
    }
    if (c.roll !== 0 && r.roll === c.roll) roll += w;
    if (w > rw) {
      rw = w;
      route = r.route;
    }
  });
  const spot = { x: c.los + x / sw, y: clamp(c.ballY + (y / sw) * c.strong, 1, FIELD_W - 1) };
  return {
    slot, route, spot, t: t / sw, bullet: bullet / sw, conf: (sw / tot) * (tot / (tot + HABIT.trust)),
    rollConf: c.roll !== 0 ? roll / tot : 0, rollSide: rollW / sw > 0.5 ? (Math.sign(side) as -1 | 1) : 0,
  };
}

// ------------------------------------------------------------ the answers on the field

/** What a defender is doing about the expected throw this step. */
export type AnticRole = 'lane' | 'jump' | 'plus';

/** The play's view the roles need (kept narrow so the sim can call it without the Play class). */
export interface AnticPlay {
  time: number;
  snapTime: number;
  qb: Player;
  def: Player[];
  off: Player[];
  thrown: boolean;
  expect: Expect | null;
  /** When the QB first got out of the pocket this snap (s), or null. */
  rolledAt: number | null;
  /** The DC's trap (`DefTags.trap`): its side in field terms (+1 larger y), or 0. */
  trapSide: number;
}

/**
 * Who answers the expected throw this step, and how strongly (0..1, his `antic` × the read's confidence):
 * - the defender responsible for the spot (the man on the expected receiver, else the underneath zone
 *   defender nearest it) sits in the lane (`lane`), and once the throw is due jumps it (`jump`);
 * - with the QB rolled to the side he rolls to, one second-level defender there who isn't on that
 *   receiver chases him (`plus`), after his reaction.
 * A trapping DC (`trapSide`) gives the corner and flat defender to that side `ANTIC.trap` at least.
 */
export function anticRoles(p: AnticPlay, A: { laneFrom: number; jumpFrom: number; lead: number; plusFrom: number; trap: number; plusReact: number }): Map<Player, { role: AnticRole; s: number }> {
  const out = new Map<Player, { role: AnticRole; s: number }>();
  const e = p.expect;
  if (!e || p.thrown) return out;
  const tgt = p.off.find((o) => o.slot === e.slot && !o.down);
  if (!tgt) return out;
  const since = p.time - p.snapTime;
  const trapped = (d: Player) => p.trapSide !== 0 && Math.sign(d.pos.y - p.qb.pos.y) === p.trapSide && (d.role === 'CB' || d.assign?.kind === 'zone');
  const strength = (d: Player) => Math.max(d.antic, trapped(d) ? A.trap : 0) * e.conf;
  // The man on him, else the underneath zone defender nearest the spot, else the nearest DB or backer.
  let r = p.def.find((d) => !d.down && d.manTarget === tgt && d.assign?.kind === 'man') ?? null;
  if (!r) {
    let bd = 12;
    for (const d of p.def) {
      if (d.down || d.role === 'DL' || d.assign?.kind === 'deep' || d.assign?.kind === 'rush') continue;
      const dd = dist(d.pos, e.spot);
      if (dd < bd) {
        bd = dd;
        r = d;
      }
    }
  }
  if (r) {
    const s = strength(r);
    if (s >= A.jumpFrom && since >= e.t - A.lead) out.set(r, { role: 'jump', s });
    else if (s >= A.laneFrom) out.set(r, { role: 'lane', s });
  }
  // The rollout: a backer to that side who isn't on the receiver flows to the QB.
  const roll = rollOfPlay(p);
  if (roll !== 0 && p.rolledAt !== null && e.rollConf > 0 && since >= p.rolledAt - p.snapTime) {
    let best: Player | null = null;
    let bs = 0;
    for (const d of p.def) {
      if (d === r || d.down || d.manTarget === tgt || d.role === 'DL' || d.role === 'CB' || d.assign?.kind === 'deep') continue;
      if (Math.sign(d.pos.y - p.qb.pos.y) * Math.sign(p.qb.pos.y - p.qb.start.y) < -0.5 && Math.abs(d.pos.y - p.qb.pos.y) > 6) continue; // the far side
      const s = d.antic * e.rollConf;
      if (s > bs) {
        bs = s;
        best = d;
      }
    }
    if (best && bs >= A.plusFrom) {
      const react = (A.plusReact + (1 - best.r.prc / 100) * A.plusReact) * (1 - 0.5 * bs);
      if (p.time >= p.rolledAt + react) out.set(best, { role: 'plus', s: bs });
    }
  }
  return out;
}

/** The QB's roll in field terms (+1 toward larger y), from where he started. */
function rollOfPlay(p: AnticPlay): number {
  const dy = p.qb.pos.y - p.qb.start.y;
  return Math.abs(dy) >= ROLL.out ? Math.sign(dy) : 0;
}

/** A point `ahead` yd in front of the catch spot on the line to the QB: where a defender sits in the lane. */
export function lanePoint(spot: Vec, qb: Vec, ahead: number): Vec {
  const d = dist(spot, qb) || 1;
  const k = Math.min(ahead, d * 0.5) / d;
  return { x: lerp(spot.x, qb.x, k), y: lerp(spot.y, qb.y, k) };
}
