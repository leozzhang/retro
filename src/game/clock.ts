import type { OutcomeType } from './rules';

/**
 * Game clock and play clock, in football seconds, Madden style: the quarter is as long as the
 * setting (a 6-minute game reads 6:00) and every play costs what it would in a real game, so the
 * quarter length alone sets how many possessions there are (about 12 x minutes / 15 a team).
 * Both clocks run 1:1. A snap with the clock running burns the play clock down to `SNAP_AT`
 * (accelerated clock), so a running play costs about 30 s however fast the user calls it.
 */
export const PLAY_CLOCK = 40;
export const PLAY_CLOCK_ADMIN = 25;
export const TWO_MIN = 120;
/** Quarter lengths in minutes, and about how many possessions each team gets (checked by the pacing test in logic.test.ts). */
export const QUARTER_OPTIONS = [4, 6, 8];
export const QUARTER_DRIVES = [4, 5, 7];
export const QUARTER_LABELS = ['SHORT', 'STANDARD', 'LONG'];
/** The default game length (minutes a quarter), for new dynasties, exhibitions and old saves without one. */
export const DEFAULT_QUARTER = 8;
/** Play clock left at the snap when the clock was running: normal tempo huddles, hurry-up only lines up. */
export const SNAP_AT = 14;
export const HURRY_AT = 28;
/**
 * The user's clock plays: a kneel snaps with the play clock run down to `KNEEL_AT` and takes `KNEEL_SECS` off the
 * game clock; a spike snaps as soon as the line is set (`SPIKE_AT` on the play clock) and takes `SPIKE_SECS`.
 */
export const KNEEL_AT = 1;
export const KNEEL_SECS = 2;
export const SPIKE_AT = 36;
export const SPIKE_SECS = 1;

export type Tempo = 'normal' | 'hurry';

/** 'untilReady' restarts when the next play call opens; 'untilSnap' restarts on the snap. */
export type ClockMode = 'run' | 'untilReady' | 'untilSnap';

export interface Clock {
  quarter: number;
  time: number;
  play: number;
  mode: ClockMode;
  /** Quarter length, seconds. */
  qSecs: number;
}

export function newClock(qMin: number): Clock {
  const qSecs = qMin * 60;
  return { quarter: 1, time: qSecs, play: PLAY_CLOCK_ADMIN, mode: 'untilSnap', qSecs };
}

/** Huddle / play call / pre-snap: play clock always counts, game clock only if running. */
export function tickBetween(c: Clock, dt: number): void {
  c.play = Math.max(0, c.play - dt);
  if (c.mode === 'run' && !inOvertime(c)) c.time = Math.max(0, c.time - dt);
}

/**
 * Accelerated clock, just before the snap: with the clock running, the play clock (and the game
 * clock with it) runs down to the tempo's snap mark (or a clock play's, `KNEEL_AT`, `SPIKE_AT`). A
 * stopped clock costs nothing. It always leaves a second, so it never takes away a snap (there are no
 * timeouts yet); a kneel then runs out the rest. Returns the seconds burned.
 */
export function runoffAtSnap(c: Clock, tempo: Tempo | 'kneel' | 'spike'): number {
  if (c.mode !== 'run' || inOvertime(c)) return 0;
  const mark = tempo === 'hurry' ? HURRY_AT : tempo === 'kneel' ? KNEEL_AT : tempo === 'spike' ? SPIKE_AT : SNAP_AT;
  const burn = Math.max(0, Math.min(c.play - mark, c.time - 1));
  c.play -= burn;
  c.time -= burn;
  return burn;
}

export function tickLive(c: Clock, dt: number): void {
  if (inOvertime(c)) return;
  c.time = Math.max(0, c.time - dt);
}

export function snapClock(c: Clock): void {
  c.mode = 'run';
}

export function readyForPlay(c: Clock): void {
  if (c.mode === 'untilReady') c.mode = 'run';
}

/** Quarters past the 4th are overtime periods: untimed, so the game clock never moves (the play clock still runs). */
export function inOvertime(c: Clock): boolean {
  return c.quarter > 4;
}

export function inTwoMinute(c: Clock): boolean {
  return (c.quarter === 2 || c.quarter === 4) && c.time <= TWO_MIN;
}

/** Clock status after the whistle on a user offensive play (NCAA rules). */
export function afterPlay(c: Clock, type: OutcomeType, firstDown: boolean): void {
  c.play = PLAY_CLOCK;
  const late = inTwoMinute(c);
  if (type === 'incomplete') c.mode = 'untilSnap';
  else if (type === 'oob') c.mode = late ? 'untilSnap' : 'untilReady';
  else if (firstDown && late) c.mode = 'untilReady';
  else c.mode = 'run';
}

/** Stop the clock with a 25-second play clock (change of possession, penalty, new period). */
export function adminStop(c: Clock): void {
  c.mode = 'untilSnap';
  c.play = PLAY_CLOCK_ADMIN;
}

export function isHalfEnd(c: Clock): boolean {
  return c.quarter === 2 || c.quarter === 4;
}

/** Seconds left until halftime or the end of the game. */
export function timeLeftInHalf(c: Clock): number {
  return c.time + (c.quarter === 1 || c.quarter === 3 ? c.qSecs : 0);
}

/** Start the next quarter. Returns false if the game is over. */
export function nextQuarter(c: Clock): boolean {
  if (c.quarter >= 4) return false;
  c.quarter++;
  c.time = c.qSecs;
  adminStop(c);
  return true;
}

/**
 * Burn `secs` of simulated (CPU drive) time, rolling Q1->Q2 and Q3->Q4.
 * Stops at 0:00 of Q2/Q4 and reports `halfOver`.
 */
export function advanceSim(c: Clock, secs: number): { halfOver: boolean } {
  let left = secs;
  while (left > 0) {
    const used = Math.min(left, c.time);
    c.time -= used;
    left -= used;
    if (c.time > 0) break;
    if (isHalfEnd(c)) return { halfOver: true };
    nextQuarter(c);
  }
  return { halfOver: c.time <= 0 && isHalfEnd(c) };
}

const QTR = ['1ST', '2ND', '3RD', '4TH'];

export function mmss(secs: number): string {
  const s = Math.ceil(secs);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1ST" to "4TH", then the overtime periods: "OT", "2OT", "3OT"... */
export function quarterName(q: number): string {
  if (q > 4) return q === 5 ? 'OT' : `${q - 4}OT`;
  return QTR[Math.max(0, q - 1)];
}

export function clockText(c: Clock): string {
  return inOvertime(c) ? quarterName(c.quarter) : `${quarterName(c.quarter)} ${mmss(c.time)}`;
}

export function playClockText(c: Clock): string {
  return `:${String(Math.ceil(c.play)).padStart(2, '0')}`;
}

/** Spot after a 5-yard offensive penalty: half the distance when inside the 10. */
export function penaltySpot(los: number, ownGoal: number, yards = 5): number {
  const toGoal = los - ownGoal;
  return los - Math.min(yards, toGoal / 2);
}
