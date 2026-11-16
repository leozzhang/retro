import type { DriveSim, SimPlay } from '../game/rules';
import type { SnapCredit } from './cast';

/**
 * A simulated game told drive by drive, for the key-play highlights (game/keyPlays.ts). It's
 * recorded while `simGame` or `simPart` runs and only observes: filling it draws no random numbers,
 * so a game with a story plays exactly like one without. Plain JSON.
 */

/** A player credited with a snap: his slot, name and yards on that carry or catch. */
export interface Credited {
  slot: string;
  /** The player's id: the lineup can change during a game (garbage time), so the slot alone may not name him. */
  id?: string;
  name: string;
  yds: number;
}

/** Who made each snap (season/cast.ts), aligned with the drive's `plays`, so a highlight names the players the box score does. */
export interface DriveCredit {
  snaps: (SnapCredit | null)[];
}

export interface StoryDrive {
  /** The offense's team id. */
  off: string;
  /** 0 or 1, or 1 + the overtime period (2 is the 1st overtime), and the seconds left in that half when the drive started. */
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
  /** A two-point try (overtime): one snap from the 3, good for `points` 2 or none. */
  try?: boolean;
  /** Played on the field: every snap is logged (fourth downs too), so none are rebuilt. */
  live?: boolean;
}

/**
 * A kick between the drives of an engine game (season/engineGame.ts): a kickoff, a punt or an extra
 * point, for watching and the game page. A punt's snap is on its drive too (`SimPlay.punt`).
 */
export interface StoryKick {
  unit: 'kickoff' | 'punt' | 'xp';
  /** The kicking team, and how many drives were told before it (it comes after `drives[at - 1]`). */
  team: string;
  at: number;
  /** The kick as a snap for the captions and clock: its spot (`yard`, from the kicker's own goal), down, distance and leverage; `t` is 0. */
  play: SimPlay;
  half: number;
  left: number;
  qSecs: number;
  /** Points by team id before the kick. */
  score: Record<string, number>;
  /** How it ended (an extra point: 'xpGood' or 'xpMiss'). */
  result: string;
  /** Points it scored by team id: a return touchdown with its try, an extra point. */
  pts?: Record<string, number>;
  /** It went the kicking team's way. */
  good: boolean;
  /** The caption. */
  title: string;
  line: string;
  /** The returner (a return touchdown's star) and the player who fell on a muff. */
  returner?: Credited;
  recoverer?: Credited;
  /** Yards it was run back. */
  ret?: number;
}

export interface GameStory {
  home: string;
  away: string;
  drives: StoryDrive[];
  /** The engine game's kicks (missing elsewhere). */
  kicks?: StoryKick[];
}

export const newStory = (home: string, away: string): GameStory => ({ home, away, drives: [] });

/** The quarter (1-4, then 5 for the 1st overtime, 6 for the 2nd...) and the time left in it, `t` seconds into a drive. */
export function storyClock(d: StoryDrive, t = 0): { quarter: number; time: number } {
  if (d.half >= 2) return { quarter: d.half + 3, time: 0 };
  const left = Math.max(0, d.left - t);
  const second = left <= d.qSecs;
  return { quarter: d.half * 2 + (second ? 2 : 1), time: second ? left : left - d.qSecs };
}
