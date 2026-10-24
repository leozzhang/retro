import type { OutcomeType } from './rules';

/**
 * Game clock and play clock, in football seconds. A 15:00 quarter always reads
 * 15:00; shorter "quarter length" settings make the between-play time (huddle,
 * play call, pre-snap) run faster so a game takes less real time.
 * Live plays always run 1:1.
 */
export const QUARTER_SECS = 15 * 60;
export const PLAY_CLOCK = 40;
export const PLAY_CLOCK_ADMIN = 25;
export const TWO_MIN = 120;
export const QUARTER_OPTIONS = [3, 5, 8, 15];

/** 'untilReady' restarts when the next play call opens; 'untilSnap' restarts on the snap. */
export type ClockMode = 'run' | 'untilReady' | 'untilSnap';

export interface Clock {
  quarter: number;
  time: number;
  play: number;
  mode: ClockMode;
  /** Real minutes a quarter's between-play time is compressed into. */
  qMin: number;
}

export function newClock(qMin: number): Clock {
  return { quarter: 1, time: QUARTER_SECS, play: PLAY_CLOCK_ADMIN, mode: 'untilSnap', qMin };
}

export function betweenRate(c: Clock): number {
  return 15 / c.qMin;
}

/** Huddle / play call / pre-snap: play clock always counts, game clock only if running. */
export function tickBetween(c: Clock, dt: number): void {
  const d = dt * betweenRate(c);
  c.play = Math.max(0, c.play - d);
  if (c.mode === 'run') c.time = Math.max(0, c.time - d);
}

export function tickLive(c: Clock, dt: number): void {
  c.time = Math.max(0, c.time - dt);
}

export function snapClock(c: Clock): void {
  c.mode = 'run';
}

export function readyForPlay(c: Clock): void {
  if (c.mode === 'untilReady') c.mode = 'run';
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
  return c.time + (c.quarter === 1 || c.quarter === 3 ? QUARTER_SECS : 0);
}

/** Start the next quarter. Returns false if the game is over. */
export function nextQuarter(c: Clock): boolean {
  if (c.quarter >= 4) return false;
  c.quarter++;
  c.time = QUARTER_SECS;
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

export function quarterName(q: number): string {
  return QTR[Math.min(3, q - 1)];
}

export function clockText(c: Clock): string {
  return `${quarterName(c.quarter)} ${mmss(c.time)}`;
}

export function playClockText(c: Clock): string {
  return `:${String(Math.ceil(c.play)).padStart(2, '0')}`;
}

/** Spot after a 5-yard offensive penalty: half the distance when inside the 10. */
export function penaltySpot(los: number, ownGoal: number, yards = 5): number {
  const toGoal = los - ownGoal;
  return los - Math.min(yards, toGoal / 2);
}
