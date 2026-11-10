import { TEMPLATES } from './athletes';
import { OVR_WEIGHTS, POSITIONS, type Position } from './positions';
import type { RatingKey, Ratings } from './ratings';
import type { RosterPlayer } from './teams';

/**
 * Confidence on the field. A player's confidence (-1 shaken .. +1 rolling; season/confidence.ts moves
 * it) shifts the ratings that take nerve, never the physical ones, and mostly on the snaps that matter:
 * a small edge on an ordinary snap, a real one on third and fourth down, in the red zone, late in a
 * close game and on long field goals. The live game, the drive sim and the grades share this.
 * See docs/CONFIDENCE.md.
 */

/**
 * On-field tuning.
 * - `base`, `clutch`: rating points per unit of confidence on an ordinary snap, plus `clutch` at full
 *   leverage (so ±`base + clutch` at the biggest snaps).
 * - Leverage parts: `third`, `fourth` down, `redZone` (`redZoneYards` from the goal), `lateClose`
 *   (fourth quarter or overtime within `closeMargin` points), `longFg` (from `longFgDist` yards); capped at 1.
 * - `fgPerPoint`: drive-sim make odds per rating point of the kicker's shift.
 * - `shakenLag`: the user's QB, when shaken, plays with his passing ratings (`AIM_NERVE`) unshifted and
 *   this much extra aim lag (seconds) instead, at confidence -1 and full leverage, scaled like the shift
 *   (`confScale`), so a nervous QB's pull-back line drags on fourth down (sim/passing.ts `aimLag`).
 * - `staff`: overall points the staff depth chart gives per unit of confidence, so a slumping starter
 *   can lose his job to a close backup; `incumbent`: the edge last game's starter keeps, so it doesn't
 *   flip-flop.
 */
export const CONF = {
  base: 0.6,
  clutch: 3.4,
  third: 0.5,
  fourth: 0.8,
  redZone: 0.3,
  redZoneYards: 20,
  lateClose: 0.5,
  closeMargin: 8,
  longFg: 0.5,
  longFgDist: 45,
  fgPerPoint: 0.005,
  shakenLag: 0.15,
  staff: 3,
  incumbent: 1.5,
};

/** Ratings confidence never moves: speed, strength, stamina, arm and leg. */
const FIXED = new Set<RatingKey>(['spd', 'acc', 'str', 'sta', 'arm', 'kpw']);

/** Late and close: fourth quarter or overtime, within `closeMargin`. */
export function lateAndClose(quarter: number, margin: number): boolean {
  return quarter >= 4 && Math.abs(margin) <= CONF.closeMargin;
}

/**
 * How much a snap matters, 0..1: the down, the red zone, late and close. A field goal try (`fgDist`)
 * counts its distance instead of the down.
 */
export function leverage(down: number, toGoal: number, late: boolean, fgDist?: number): number {
  let l = 0;
  if (fgDist !== undefined) {
    if (fgDist >= CONF.longFgDist) l += CONF.longFg;
  } else {
    if (down === 3) l += CONF.third;
    else if (down >= 4) l += CONF.fourth;
    if (toGoal <= CONF.redZoneYards) l += CONF.redZone;
  }
  if (late) l += CONF.lateClose;
  return Math.min(1, l);
}

/** Rating points per unit of confidence at a leverage. */
export function confScale(lev: number): number {
  return CONF.base + CONF.clutch * lev;
}

/** His ratings on this snap: the nerve ratings shifted by his confidence at this leverage. */
export function confRatings(r: Ratings, conf: number, lev: number): Ratings {
  const d = conf * confScale(lev);
  if (!d) return r;
  const out = { ...r };
  for (const k of Object.keys(out) as RatingKey[]) if (!FIXED.has(k)) out[k] = Math.max(1, Math.min(99, out[k] + d));
  return out;
}

/** Overall points per rating point of confidence shift, by position (from `OVR_WEIGHTS` and the template slopes). */
export const CONF_OVR: Record<Position, number> = Object.fromEntries(POSITIONS.map((pos) => {
  let moved = 0;
  let norm = 0;
  for (const [k, w] of Object.entries(OVR_WEIGHTS[pos]) as [RatingKey, number][]) {
    norm += w * (TEMPLATES[pos][k]?.[1] ?? 1);
    if (!FIXED.has(k)) moved += w;
  }
  return [pos, moved / norm];
})) as Record<Position, number>;

/** The passing ratings a shaken user QB keeps: his nerves show up as aim lag instead (`shakenLag`). */
export const AIM_NERVE: readonly RatingKey[] = ['sac', 'mac', 'dac', 'pac', 'tup'];

/** Extra aim lag (seconds) for the user's QB: only when shaken, more on a bigger snap. */
export function shakenAimLag(conf: number, lev: number): number {
  return Math.max(0, -conf) * (confScale(lev) / confScale(1)) * CONF.shakenLag;
}

/**
 * The roster as it plays one snap: everyone's ratings shifted by his confidence at this leverage.
 * `aimQb`: the user aims this QB, so when he's shaken his passing ratings stay put (the lag is his nerves).
 */
export function clutchRoster(roster: Record<string, RosterPlayer>, lev: number, aimQb = false): Record<string, RosterPlayer> {
  const out: Record<string, RosterPlayer> = {};
  for (const [slot, p] of Object.entries(roster)) {
    if (!p.conf) {
      out[slot] = p;
      continue;
    }
    const r = confRatings(p.r, p.conf, lev);
    if (aimQb && slot === 'QB' && p.conf < 0) for (const k of AIM_NERVE) r[k] = p.r[k];
    out[slot] = { ...p, r };
  }
  return out;
}

/** A unit's confidence, in overall points per rating point of shift (see `teamConf` in depth.ts). */
export interface UnitConf {
  off: number;
  def: number;
  /** The kicker's own confidence. */
  k: number;
}

export const NO_CONF: UnitConf = { off: 0, def: 0, k: 0 };

/** What a side's confidence is worth on a snap, in overall points (the drive sim's units). */
export function unitEdge(conf: number, lev: number): number {
  return conf * confScale(lev);
}

/** Five steps for the card. */
export function confLabel(c: number): string {
  return c <= -0.6 ? 'SHAKEN' : c <= -0.2 ? 'SHAKY' : c < 0.2 ? 'STEADY' : c < 0.6 ? 'CONFIDENT' : 'ROLLING';
}
