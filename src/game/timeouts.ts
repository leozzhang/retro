import type { Rng } from '../engine/math';
import { clockOut, fgDistance, fieldGoalHelps, SITUATION, tempo, type Situation } from './situation';

/**
 * Timeouts, FBS rules: three a team each half, one each overtime period (unused ones don't carry). A
 * timeout stops the clock after a snap and it starts again on the next snap. Both sides' choices come
 * from here, for the drive sim, engine drives, the live game's CPU and the user's staff on defense alike.
 * Plain functions, no random numbers. docs/TIMEOUTS.md.
 *
 * - `perHalf`, `perOt`: timeouts a team gets each half and each overtime period.
 * - `playSecs`: game time a snap takes, whistle to whistle, when a timeout stops the clock after it.
 * - `offLate`: in the two-minute drill (`clockOut`), the offense takes a timeout on any down inside this
 *   (before it, it spikes on 1st and 2nd down and saves them, and takes one on 3rd and 4th).
 * - `defWindow`, `defShare`: a trailing defense saves the clock inside the shorter of `defWindow` and
 *   `defShare` of a quarter, in the final half, when the offense leads by 1 to `defMaxDeficit`.
 * - `halfOffSecs`, `halfOffFrom`: the end of the 1st half: an offense within `halfOffFrom` of the goal
 *   uses its timeouts inside `halfOffSecs`.
 * - `halfDefSecs`, `halfDefFrom`: and a defense calls them inside `halfDefSecs` on an offense at least
 *   `halfDefFrom` from the goal that's playing it normally, to get the ball back before the half.
 * - `admin`: timeouts that aren't about the clock (the play clock running down, the wrong personnel, a
 *   look to sort out before a big snap), as odds a snap: the offense's on 3rd and 4th down and
 *   `bigToGo` or less (`offBig`), at the goal line inside `goalLine` (`offGoal`), any other snap (`off`);
 *   the defense's on 3rd and 4th down (`defBig`), any other (`def`). Only with `keep` or more left, and
 *   never inside `lateSecs` of the 2nd half or `halfLateSecs` of the 1st, when the clock rules decide.
 */
export const TIMEOUTS = {
  perHalf: 3,
  perOt: 1,
  playSecs: 6,
  offLate: 40,
  defWindow: 240,
  defShare: 0.3,
  defMaxDeficit: 16,
  halfOffSecs: 60,
  halfOffFrom: 50,
  halfDefSecs: 90,
  halfDefFrom: 65,
  admin: { offBig: 0.05, bigToGo: 3, offGoal: 0.03, goalLine: 5, off: 0.004, defBig: 0.01, def: 0.002, keep: 2, lateSecs: 300, halfLateSecs: 120 },
};

/** Timeouts left, the offense's and the defense's. */
export interface TimeoutPair {
  off: number;
  def: number;
}

/** A timeout called in a drive: by which side, and the drive's seconds when the clock stopped. */
export interface DriveTimeout {
  side: 'off' | 'def';
  t: number;
}

/**
 * With the clock running after an in-bounds snap (`s`, the situation at the whistle with `offTO` set):
 * does the offense call a timeout? In the two-minute drill on 3rd and 4th down, inside `offLate`, or to
 * kick a field goal that helps; at the end of the 1st half in range. Never kneeling or milking a lead.
 */
export function offenseTimeout(s: Situation): boolean {
  const T = TIMEOUTS;
  if (s.ot || !((s.offTO ?? 0) > 0) || s.down > 4 || s.secsLeft <= 0) return false;
  const t = tempo(s);
  if (t === 'kneel' || t === 'milk') return false;
  if (!s.finalHalf && s.secsLeft <= T.halfOffSecs && s.yardsToGoal <= T.halfOffFrom) return true;
  if (!clockOut(s)) return false;
  if (s.down >= 3 || s.secsLeft <= T.offLate) return true;
  return s.secsLeft <= SITUATION.spikeKickSecs && fgDistance(s) <= SITUATION.fgMax && fieldGoalHelps(s);
}

/**
 * With the clock running after an in-bounds snap (`s` is the offense's situation at the whistle, with
 * `defTO` set): does the defense call a timeout? Trailing late in the final half, to get the ball back with
 * time, unless the offense can kneel it out anyway; or to get it back before halftime from an offense deep
 * in its own end.
 */
export function defenseTimeout(s: Situation): boolean {
  const T = TIMEOUTS;
  if (s.ot || !((s.defTO ?? 0) > 0) || s.down > 4 || s.secsLeft <= 0) return false;
  if (s.finalHalf) {
    if (s.lead < 1 || s.lead > T.defMaxDeficit) return false;
    if (s.secsLeft > Math.min(T.defWindow, s.qSecs * T.defShare)) return false;
    return tempo(s) !== 'kneel';
  }
  return s.secsLeft <= T.halfDefSecs && s.yardsToGoal >= T.halfDefFrom && tempo(s) === 'normal';
}

/**
 * Who calls a timeout after an in-bounds snap with the clock running: the offense first (it's their
 * ball), then the defense. `s` is the situation at the whistle.
 */
export function timeoutAfter(s: Situation): 'off' | 'def' | null {
  if (offenseTimeout(s)) return 'off';
  if (defenseTimeout(s)) return 'def';
  return null;
}

/** The odds a timeout not about the clock comes after this snap, for the offense and for the defense (`TIMEOUTS.admin`). */
export function adminOdds(s: Situation): { off: number; def: number } {
  const A = TIMEOUTS.admin;
  if (s.ot || s.down > 4 || s.secsLeft <= (s.finalHalf ? A.lateSecs : A.halfLateSecs)) return { off: 0, def: 0 };
  const big = s.down >= 3;
  const off = (s.offTO ?? 0) < A.keep ? 0 : big && s.toGo <= A.bigToGo ? A.offBig : s.yardsToGoal <= A.goalLine ? A.offGoal : A.off;
  const def = (s.defTO ?? 0) < A.keep ? 0 : big ? A.defBig : A.def;
  return { off, def };
}

/**
 * After a snap (`s` at the whistle), who calls a timeout: the clock rules first when the clock is running
 * (`timeoutAfter`), else a timeout not about the clock (`adminOdds`, one draw when either could).
 */
export function timeoutAt(s: Situation, running: boolean, rng: Rng): 'off' | 'def' | null {
  const clock = running ? timeoutAfter(s) : null;
  if (clock) return clock;
  const o = adminOdds(s);
  if (o.off + o.def <= 0) return null;
  const r = rng();
  return r < o.off ? 'off' : r < o.off + o.def ? 'def' : null;
}

/** A fresh pair for a half or an overtime period. */
export const freshTimeouts = (ot = false): TimeoutPair => {
  const n = ot ? TIMEOUTS.perOt : TIMEOUTS.perHalf;
  return { off: n, def: n };
};

/** A timeout in a game's record (`GameResult.tos`): the quarter, the seconds left in it, and the side, 0 home or 1 away. */
export type GameTimeout = [q: number, secs: number, side: 0 | 1];

/** The quarter and its seconds left with `halfLeft` seconds left in half `half` (0 the 1st, 1 the 2nd). */
export function halfClock(half: number, halfLeft: number, qSecs: number): [number, number] {
  const early = halfLeft > qSecs;
  return [half * 2 + (early ? 1 : 2), Math.max(0, Math.round(early ? halfLeft - qSecs : halfLeft))];
}

/**
 * After a drive on a clock with `timeouts`: write what each side has left back (`o` had the ball), and add
 * the drive's timeouts to the game's record. `left` is the half's seconds when the drive started.
 */
export function afterDrive(
  d: { timeouts?: TimeoutPair; tos?: DriveTimeout[] }, o: { to: number }, dfn: { to: number }, oHome: boolean,
  half: number, left: number, qSecs: number, log: GameTimeout[],
): void {
  if (!d.timeouts) return;
  o.to = d.timeouts.off;
  dfn.to = d.timeouts.def;
  for (const t of d.tos ?? []) {
    const [q, secs] = halfClock(half, left - t.t, qSecs);
    log.push([q, secs, (t.side === 'off') === oHome ? 0 : 1]);
  }
}
