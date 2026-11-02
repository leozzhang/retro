import type { DriveSim, SimPlay } from '../game/rules';

/**
 * A simulated game told drive by drive, for the key-play highlights (game/keyPlays.ts). It's
 * recorded while `simGame` or `simPart` runs and only observes: filling it draws no random numbers,
 * so a game with a story plays exactly like one without. Plain JSON.
 */

/** One player `credit()` gave part of a drive to: his slot, name and yards on that carry or catch. */
export interface Credited {
  slot: string;
  name: string;
  yds: number;
}

/** Who a drive's box-score credit went to, so a highlight names the same players the box score does. */
export interface DriveCredit {
  catches: Credited[];
  runs: Credited[];
  /** The touchdown's scorer, and whether it was a pass. */
  td?: Credited & { pass: boolean };
  /** A turnover that was an interception (otherwise a fumble). */
  int?: boolean;
}

export interface StoryDrive {
  /** The offense's team id. */
  off: string;
  /** 0 or 1 (2 is overtime), and the seconds left in that half when the drive started. */
  half: number;
  left: number;
  /** Quarter length in seconds (900 in `simGame`, the setting's in `simPart`). */
  qSecs: number;
  /** Points by team id before the drive. */
  score: Record<string, number>;
  /** Yards from the offense's own goal. */
  start: number;
  result: DriveSim['result'];
  points: number;
  plays: SimPlay[];
  credit: DriveCredit;
}

export interface GameStory {
  home: string;
  away: string;
  drives: StoryDrive[];
}

export const newStory = (home: string, away: string): GameStory => ({ home, away, drives: [] });

/** The quarter (1-4, 5 for overtime) and the time left in it, `t` seconds into a drive. */
export function storyClock(d: StoryDrive, t = 0): { quarter: number; time: number } {
  if (d.half >= 2) return { quarter: 5, time: 0 };
  const left = Math.max(0, d.left - t);
  const second = left <= d.qSecs;
  return { quarter: d.half * 2 + (second ? 2 : 1), time: second ? left : left - d.qSecs };
}
