import { clamp } from '../engine/math';

/**
 * The game situation around a snap, as both coaches read it: down and distance, the clock and the
 * score. The CPU offense's choices (4th down, tempo, kneeling, last-second shots, pass or run) and
 * the defense's clock-and-score dials (data/identity.ts) all come from here, for the drive sim, the
 * field and the replays alike. Plain functions, no random numbers.
 */
export interface Situation {
  down: number;
  toGo: number;
  yardsToGoal: number;
  /** Seconds left in the half (Infinity in overtime, which is untimed). */
  secsLeft: number;
  /** Quarter length in seconds (900 in `simGame`). */
  qSecs: number;
  /** The 2nd half or overtime: when time runs out there are no more possessions. */
  finalHalf: boolean;
  /** The offense's points minus the defense's. */
  lead: number;
  /** Overtime: whether the offense has the period's first or second possession. */
  ot?: 'first' | 'second';
}

/**
 * Situation tuning.
 * - `fgMax`: the longest field goal the sim tries (yards).
 * - `goShort`, `goWithin`, `goOdds`: a coach's normal 4th-down gamble: 4th and `goShort` or less within
 *   `goWithin` yards of the goal, `goOdds` of the time (the drive sim's old rule, kept).
 * - `cycleSecs`: game time between the offense's own possessions late in a game, for whether a field
 *   goal now leaves time to score the rest.
 * - `twoMinute`: hurry when trailing inside this in either half. `hurryLate`, `hurryShare`: and in the
 *   4th quarter, inside the shorter of `hurryLate` and `hurryShare` of the quarter.
 * - `kneelSecs`: what a kneel takes off the clock (the 40-second play clock); `halfKneel*`: kneel the
 *   1st half out from deep in its own end.
 * - `despSecs`, `despFar`: time for one last snap, beyond field goal range: throw it to the end zone.
 * - `passLong`, `passShort`, `passBehind`, `passAhead`: pass share added on 3rd and long, short
 *   yardage, trailing with the hurry-up on, and milking a lead.
 * - `clockOutSecs`: the hurry-up inside this plays to stop the clock (`clockOut`): sideline throws, out of
 *   bounds, throw it away. `spikeSecs`: with the clock running and `clockOut` on, spike it on 1st or 2nd
 *   down inside this; `spikeKickSecs`: spike to kick a field goal that helps inside this, through 3rd
 *   down. `spikeMin`: no spike with less than this left (one snap is all there is).
 */
export const SITUATION = {
  fgMax: 52,
  goShort: 2,
  goWithin: 55,
  goOdds: 0.5,
  cycleSecs: 120,
  twoMinute: 120,
  hurryLate: 300,
  hurryShare: 0.4,
  kneelSecs: 40,
  halfKneelSecs: 40,
  halfKneelFrom: 70,
  despSecs: 20,
  despFar: 35,
  passLong: 0.25,
  passShort: -0.25,
  passBehind: 0.25,
  passAhead: -0.3,
  clockOutSecs: 120,
  spikeSecs: 45,
  spikeKickSecs: 30,
  spikeMin: 4,
};

/** Field goal distance from the line of scrimmage. */
export const fgDistance = (s: Situation) => s.yardsToGoal + 17;

/** Points the offense needs to tie or go ahead (0 when it isn't behind). */
export const need = (s: Situation) => Math.max(0, -s.lead);

/** The offense's own possessions left after this one, roughly (many in the 1st half; none for the second team in overtime). */
export function possessionsAfter(s: Situation): number {
  if (s.ot === 'second') return 0;
  if (s.ot === 'first') return 1;
  if (!s.finalHalf) return 99;
  return Math.floor(s.secsLeft / SITUATION.cycleSecs);
}

/** Whether three points now does the offense any good: it ties or leads, or there's time to score the rest. */
export function fieldGoalHelps(s: Situation): boolean {
  const n = need(s);
  if (n <= 3) return true;
  return Math.ceil((n - 3) / 8) <= possessionsAfter(s);
}

/** Time for one more snap at most. */
export const lastSnap = (s: Situation) => s.secsLeft <= SITUATION.despSecs;

/** The drive's last chance and a field goal won't do: the offense has to go for it. */
function mustGo(s: Situation): boolean {
  return need(s) > 0 && (s.ot === 'second' || (s.finalHalf && possessionsAfter(s) === 0));
}

/**
 * 4th down: kick when it's in range and the points help; go for it when the game needs it (or on a
 * coach's normal gamble, `roll` drawn only then); punt otherwise. Overtime has no punts.
 */
export function fourthDown(s: Situation, roll: () => number): 'go' | 'fg' | 'punt' {
  const inRange = fgDistance(s) <= SITUATION.fgMax;
  if (inRange && fieldGoalHelps(s)) return 'fg';
  if (mustGo(s) || s.ot) return 'go';
  if (inRange) return 'go';
  if (s.toGo <= SITUATION.goShort && s.yardsToGoal < SITUATION.goWithin && roll() < SITUATION.goOdds) return 'go';
  return 'punt';
}

/** Out of time before 4th down: kick now if a field goal is in range and helps. */
export function kickNow(s: Situation): boolean {
  return lastSnap(s) && fgDistance(s) <= SITUATION.fgMax && fieldGoalHelps(s);
}

/**
 * The two-point chart, by the margin after the touchdown's six: go for two when ahead by `ahead` (to
 * lead by 3, 7, 14, 17 or 21, or by 6 so a touchdown and kick can't beat you) or behind by `behind` (to
 * tie, need only a field goal, a touchdown and kick, a touchdown and field goal, or two touchdowns and
 * kicks). Coaches use it from `fromSecs` left in the game; before that they kick.
 */
export const TWO_POINT = { ahead: [1, 4, 5, 12, 15, 19], behind: [2, 5, 9, 12, 16], fromSecs: 900 };

/** After a touchdown (`s.lead` counts the six, `s.secsLeft` is what the drive left): go for two? Regulation only; overtime has its own rules. */
export function goForTwo(s: Situation): boolean {
  if (s.ot || !s.finalHalf || s.secsLeft > Math.min(TWO_POINT.fromSecs, s.qSecs)) return false;
  return s.lead > 0 ? TWO_POINT.ahead.includes(s.lead) : TWO_POINT.behind.includes(-s.lead);
}

/** The offense's tempo this snap. Overtime is untimed. */
export function tempo(s: Situation): 'normal' | 'hurry' | 'milk' | 'kneel' {
  if (s.ot) return 'normal';
  const S = SITUATION;
  if (s.finalHalf && s.lead > 0) {
    // Snaps left before a turnover on downs, each running the play clock out.
    if (s.secsLeft <= (4 - s.down) * S.kneelSecs + 5) return 'kneel';
    if (s.secsLeft <= s.qSecs) return 'milk';
    return 'normal';
  }
  if (!s.finalHalf && s.secsLeft <= S.halfKneelSecs && s.yardsToGoal >= S.halfKneelFrom) return 'kneel';
  if (s.lead < 0 && (s.secsLeft <= S.twoMinute || (s.finalHalf && s.secsLeft <= Math.min(S.hurryLate, s.qSecs * S.hurryShare)))) return 'hurry';
  return 'normal';
}

/** One snap left, beyond field goal range, and points are needed (or it's the end of the 1st half): a throw to the end zone. */
export function desperate(s: Situation): boolean {
  if (s.ot || !lastSnap(s) || s.yardsToGoal <= SITUATION.despFar) return false;
  return !s.finalHalf || need(s) > 0;
}

/** The share of passes this snap, from the plan's `base`, by down and distance and the clock. */
export function passOdds(base: number, s: Situation): number {
  if (desperate(s)) return 1;
  const S = SITUATION;
  let p = base;
  if (s.down >= 3 && s.toGo >= 7) p += S.passLong;
  else if (s.down >= 3 && s.toGo <= 2) p += S.passShort;
  const t = tempo(s);
  if (t === 'hurry') p += S.passBehind;
  else if (t === 'milk') p += S.passAhead;
  return clamp(p, 0.05, 0.95);
}

/** The hurry-up late in a half: the offense plays to stop the clock (sideline throws, out of bounds, throw it away). */
export function clockOut(s: Situation): boolean {
  return tempo(s) === 'hurry' && s.secsLeft <= SITUATION.clockOutSecs;
}

/**
 * With the clock running after an in-bounds snap (`s` is the situation after it): spike it? To kick a field
 * goal that helps through 3rd down, or in the hurry-up on 1st or 2nd down to save the time a no-huddle
 * call takes. Never on 4th down, in overtime, when kneeling or milking, or with one snap left.
 */
export function spikeNow(s: Situation): boolean {
  const S = SITUATION;
  if (s.ot || s.down >= 4 || s.secsLeft <= S.spikeMin) return false;
  const t = tempo(s);
  if (t === 'kneel' || t === 'milk') return false;
  if (s.down <= 3 && s.secsLeft <= S.spikeKickSecs && fgDistance(s) <= S.fgMax && fieldGoalHelps(s)) return true;
  return s.down <= 2 && s.secsLeft <= S.spikeSecs && clockOut(s);
}
