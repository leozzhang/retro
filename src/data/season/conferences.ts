import type { Conference } from '../fbs/profile';

export interface ConferenceRules {
  /** Conference games per team. An odd-sized league can't always hit it exactly; see `generateSchedule`. */
  confGames: number;
  /** Plays a championship game between its top two in the standings. */
  champGame: boolean;
}

/** 2026 scheduling rules by conference. Divisions (Sun Belt) aren't modeled yet. */
export const CONF_RULES: Record<Conference, ConferenceRules> = {
  SEC: { confGames: 9, champGame: true },
  'Big Ten': { confGames: 9, champGame: true },
  ACC: { confGames: 8, champGame: true },
  'Big 12': { confGames: 9, champGame: true },
  // Eight teams in 2026: a full round robin.
  'Pac-12': { confGames: 7, champGame: true },
  American: { confGames: 8, champGame: true },
  'Mountain West': { confGames: 8, champGame: true },
  'Sun Belt': { confGames: 8, champGame: true },
  MAC: { confGames: 8, champGame: true },
  'C-USA': { confGames: 8, champGame: true },
  Independent: { confGames: 0, champGame: false },
};
