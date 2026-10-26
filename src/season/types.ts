import type { DepthChart } from '../data/depth';
import type { Position } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import type { GamePlan } from './staff';

/**
 * The season's state is plain JSON: everything here must survive `JSON.parse(JSON.stringify(state))`.
 * Rosters aren't stored (they regenerate from the team id); only per-team changes are, in `teamState`.
 */

/** Management systems the user can hand to staff. Delegated systems run the same `auto*` code the CPU teams use. */
export interface Delegation {
  depthChart: boolean;
  gamePlan: boolean;
}

export interface SeasonConfig {
  userTeamId: string;
  /** Coach career: job security, firing and offers. Off = dynasty (the job is permanent). */
  coachCareer: boolean;
  /** One season, or keep rolling into the next year. */
  length: 'single' | 'open';
  delegate: Delegation;
}

export type GameKind = 'conf' | 'nonconf' | 'champ' | 'bowl' | 'cfp';

/** One player's game line. Name and position are copied in so stats don't need the roster. */
export interface PlayerLine {
  id: string;
  team: string;
  name: string;
  pos: Position;
  cmp: number;
  att: number;
  passYds: number;
  passTd: number;
  int: number;
  rush: number;
  rushYds: number;
  rushTd: number;
  rec: number;
  recYds: number;
  recTd: number;
  fgm: number;
  fga: number;
}

export interface TeamLine {
  points: number;
  yards: number;
  passYds: number;
  rushYds: number;
  turnovers: number;
  plays: number;
}

export interface BoxScore {
  home: TeamLine;
  away: TeamLine;
  /** Empty for the user's live games until the on-field game records stats. */
  players: PlayerLine[];
}

export interface GameResult {
  home: number;
  away: number;
  ot: number;
  box: BoxScore;
  /** Played on the field by the user, not simulated. */
  live?: boolean;
}

export interface SeasonGame {
  id: string;
  week: number;
  home: string;
  away: string;
  kind: GameKind;
  neutral: boolean;
  /** Rivalry or bowl name. */
  name?: string;
  /** Playoff round (0 = first) and slot in the bracket. */
  round?: number;
  slot?: number;
  result?: GameResult;
}

export interface PollEntry {
  team: string;
  points: number;
  firstPlace: number;
}

export interface Poll {
  week: number;
  kind: 'ap' | 'cfp';
  /** Top 25, best first. */
  ranks: PollEntry[];
}

export interface NewsItem {
  week: number;
  kind: 'upset' | 'performance' | 'poll' | 'heisman' | 'postseason' | 'result' | 'coach' | 'progress';
  text: string;
  teams: string[];
}

/**
 * The playoff bracket. `rounds[0]` holds the seeded slots in bracket order (`''` is a bye); each later
 * round holds the winners of the round before it, `''` until decided.
 */
export interface Bracket {
  seeds: string[];
  rounds: string[][];
  champion?: string;
}

export interface Award {
  id: string;
  name: string;
  /** Top finishers, winner first. */
  finalists: { id: string; team: string; name: string; pos: Position; score: number }[];
}

export type RatingDelta = Partial<Record<RatingKey, number>>;

/** One player's progression (season/progression.ts). Players who haven't earned XP have no entry. */
export interface Progress {
  /** XP toward the next level. */
  xp: number;
  /** Level-ups so far. */
  lvl: number;
  /** All-time rating changes, laid over the generated ratings. */
  d: RatingDelta;
  /** The most recent week he leveled up, and what it raised. `big` marks a breakthrough. */
  up?: { week: number; d: RatingDelta; big?: boolean };
  /** Performance tags since his last level-up: weighted counts per rating they boost. */
  tags?: RatingDelta;
  /** His last few game grades (average grade per snap), newest last. */
  g?: number[];
}

/** What changed on a team's roster this season. */
export interface TeamState {
  /** Weeks out, by athlete id. */
  injuries?: Record<string, number>;
  /** A user-edited depth chart; staff charts are rebuilt each week. */
  depth?: DepthChart;
  /** The user's game plan, when it isn't delegated. */
  plan?: GamePlan;
  /** Progression by athlete id. */
  progress?: Record<string, Progress>;
}

/**
 * One snap as the progression grades see it (season/grades.ts). Logs are never saved: they live for
 * one week's progress step. Simulated drives leave `pass` out; the grader draws it from the game plan.
 */
export interface LoggedPlay {
  gain: number;
  pass?: boolean;
  sack?: boolean;
  /** Interception (a turnover on a pass). */
  int?: boolean;
  turnover?: boolean;
  explosive?: boolean;
  /** Down and distance before the snap. */
  down: number;
  toGo: number;
  /** A kick instead of a snap from scrimmage. `dist` for field goals. */
  kick?: { unit: 'fg' | 'xp' | 'punt' | 'kickoff'; good: boolean; dist?: number };
}

/** One possession: the offense's snaps and kicks (the kickoff after a score belongs to the scoring team). */
export interface DriveLog {
  off: string;
  plays: LoggedPlay[];
}

export interface CoachState {
  teamId: string;
  /** 0..100; low means the hot seat. */
  security: number;
  seasons: number;
}

export type Phase = 'regular' | 'confChamp' | 'postseason' | 'complete';

/** A finished year, kept when an open-ended season rolls over. */
export interface SeasonSummary {
  year: number;
  champion: string;
  heisman?: string;
}

export interface SeasonState {
  version: number;
  seed: number;
  year: number;
  /** The next week to be played. Starts at 1; the preseason poll is week 0. */
  week: number;
  phase: Phase;
  config: SeasonConfig;
  games: SeasonGame[];
  polls: Poll[];
  news: NewsItem[];
  teamState: Record<string, TeamState>;
  bracket?: Bracket;
  awards: Award[];
  coach?: CoachState;
  history: SeasonSummary[];
}
