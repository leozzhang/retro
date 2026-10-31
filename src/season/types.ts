import type { DevTrait, Injury } from '../data/athletes';
import type { AnyRole, CoachRatings, Group, HeadRatings, RatingName } from '../data/coaches';
import type { DepthChart } from '../data/depth';
import type { Position } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import type { Picks } from './emphasis';
import type { GamePlan } from './staff';

/**
 * The season's state is plain JSON: everything here must survive `JSON.parse(JSON.stringify(state))`.
 * Rosters aren't stored (they regenerate from the team id); only per-team changes are, in `teamState`.
 */

/** Management systems the user can hand to staff. Delegated systems run the same `auto*` code the CPU teams use. */
export interface Delegation {
  depthChart: boolean;
  gamePlan: boolean;
  /** The transfer portal board and the leaving list (season/portal.ts `autoPortal`). Missing means the user runs it. */
  portal?: boolean;
  /** The user's openings in the coaching carousel (season/carousel.ts). Missing means the user hires. */
  carousel?: boolean;
}

export interface SeasonConfig {
  userTeamId: string;
  /** Coach career: job security, firing and offers. Off = dynasty (the job is permanent). */
  coachCareer: boolean;
  /** One season, or keep rolling into the next year. */
  length: 'single' | 'open';
  delegate: Delegation;
  /** How often players get hurt (season/injuries.ts). Missing means normal. */
  injuries?: InjuryLevel;
}

export type InjuryLevel = 'off' | 'light' | 'normal';

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
  kind: 'upset' | 'performance' | 'poll' | 'heisman' | 'postseason' | 'result' | 'coach' | 'progress' | 'injury' | 'portal' | 'carousel';
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
  /** Confidence, -1 shaken .. +1 rolling (season/confidence.ts). Missing is 0. */
  c?: number;
  /** A benching penalty under `c` (the user sat him while in form for a weaker player); it fades. */
  bh?: number;
  /** A next-man-up spark on top of `c`, and the starts it has left. */
  sp?: number;
  spn?: number;
  /** The season he last sparked (once a season). */
  spy?: number;
  /** His breakout window after a spark: team games so far, starts, and their summed performance. */
  sw?: { t: number; n: number; z: number };
  /** Team game number of his last start this season, and his starts this season. */
  ls?: number;
  gs?: number;
  /** The season he broke out (once a career), and what it changed: dev trait and potential. */
  bo?: number;
  dev?: DevTrait;
  pot?: number;
  /** A coach decision under his morale (season/morale.ts): signed, and what it was. It fades. */
  me?: number;
  mk?: 'bench' | 'job';
  /** He transferred in: from where, and the offseason of which year (season/portal.ts). */
  tr?: { from: string; year: number };
  /** A coach's promise (season/portal.ts): a starting job or more snaps in season `year`, judged after it. */
  pr?: CoachPromise;
  /** The year a promise to him was broken: it pushes him toward the portal that offseason. */
  pb?: number;
  /**
   * A coach of his left in the offseason after `year` (season/carousel.ts `reactToDepartures`): which
   * chair, their bond (0-1, from seasons together), and the school he went to if he's still in FBS.
   */
  cl?: { year: number; role: AnyRole; bond: number; to?: string };
}

export interface CoachPromise {
  kind: 'start' | 'snaps';
  year: number;
  /** The team that made it. */
  to: string;
}

/** What changed on a team's roster this season. */
export interface TeamState {
  /** Injured players, by athlete id. */
  injuries?: Record<string, Injury>;
  /** Health below 100, by athlete id (healthy players have no entry). */
  health?: Record<string, number>;
  /** A user-edited depth chart; staff charts are rebuilt each week. */
  depth?: DepthChart;
  /** The user's game plan, when it isn't delegated. */
  plan?: GamePlan;
  /** Progression by athlete id. */
  progress?: Record<string, Progress>;
  /** Last game's starters by slot: the incumbents for the staff chart, and who a new starter replaced. */
  st?: Record<string, string>;
  /** Games played this season. */
  gp?: number;
  /** Morale by athlete id, -1 miserable .. +1 fired up (season/morale.ts). Missing is his baseline. */
  mo?: Record<string, number>;
  /** The user's weekly emphases by position group (season/emphasis.ts); cleared after each week, so missing is `standard`. */
  emph?: Picks;
  /** Level-ups this season, for the program's development record. */
  lu?: number;
  /** This season's work for the staff's offseason growth (season/coaching.ts): level-ups by group, */
  lug?: Partial<Record<Group, number>>;
  /** games each group practiced on an emphasis, */
  eg?: Partial<Record<Group, number>>;
  /** and wins over the pregame odds (won 1 or 0, less the odds), summed over games. */
  xw?: number;
  /** Roster changes laid over the generated roster: who left, and who joined (transfers and walk-ons). */
  roster?: RosterDelta;
  /** Chairs filled by someone other than the generated coach: role to coach id (season/world.ts `staffFor`). */
  staff?: StaffSeats;
  /** The graduate assistants, once they differ from the generated pair (season/world.ts `gasFor`). */
  ga?: string[];
}

/** Includes `HC`: the head coach's chair. */
export type StaffSeats = Partial<Record<AnyRole, string>>;

/** One coach's changes since he was generated, wherever he coaches (season/coaching.ts). */
export interface CoachProgress {
  /** All-time rating changes, laid over the generated ratings. */
  d?: Partial<Record<RatingName, number>>;
  /** His chair (`team:role`) at the last offseason, and seasons in it; missing before his first offseason. */
  at?: string;
  t?: number;
  /** Offseasons he has grown through. */
  n?: number;
  /** A late bloomer who has bloomed. */
  b?: 1;
  /** Who he has worked under, oldest first: his coaching tree. */
  under?: string[];
  /** A CPU head coach's job security, 0-100 (season/coaching.ts `turnover`); missing is his seeded start. */
  sec?: number;
  /** The offseason (season year) he was hired from outside FBS. */
  hired?: number;
  /** Out of a job: the offseason, and why. A fired or let-go coach can be hired again that offseason. */
  gone?: { year: number; why: 'fired' | 'retired' | 'let go' };
  /** His reputation (season/carousel.ts): what the world thinks he's worth. Missing is his seeded start. */
  rep?: number;
}

/** The coaching carousel (season/carousel.ts). Chairs are `team:role`. */
export interface CarouselState {
  /** Open chairs. */
  open: string[];
  /** The user's offers this round: chair to candidate. */
  offers: Record<string, string>;
  /** Who has turned a chair down: chair to candidates. */
  declined: Record<string, string[]>;
  /** The user's interviews by candidate, and how many are left. */
  talks: Record<string, number>;
  talksLeft: number;
  /** Coaches who changed chairs this offseason: nobody moves twice. */
  moved: string[];
  /** Every hire, in order: the chair, who, and where from (a chair, `free` or `outside`). */
  log: { chair: string; id: string; from: string }[];
  /** Who sat in every chair when the carousel opened, for the players' reactions at the close. */
  was?: Record<string, string>;
}

/** A coach's history (season/coaching.ts): a row per finished season. Nothing in the sim reads it. */
export interface CoachCareer {
  seasons: CoachSeason[];
}

export interface CoachSeason {
  year: number;
  team: string;
  role: AnyRole;
  /** His ratings at the season's end. */
  r: CoachRatings | HeadRatings;
  /** The team's record. */
  w: number;
  l: number;
}

/**
 * A team's roster as a change to its generated one (season/world.ts `baseRoster`). An arrival keeps his
 * id, which names the roster he was generated on, so he's rebuilt from it; `num` is his new jersey.
 */
export interface RosterDelta {
  out?: string[];
  in?: { id: string; num: number }[];
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
  /** How much the snap mattered, 0..1 (`leverage`, data/confidence.ts). Missing is 0. */
  lev?: number;
  /** The weekly emphases' edge the drive sim gave this snap or kick (season/emphasis.ts). Missing is 0. */
  em?: number;
}

/** One possession: the offense's snaps and kicks (the kickoff after a score belongs to the scoring team). */
export interface DriveLog {
  off: string;
  plays: LoggedPlay[];
}

/**
 * A confidence event: a spark (with why the starter lost the job), a benching of an in-form starter
 * for a weaker one (`bench`, the benched player's id), or a breakout. For the season report.
 */
export interface ConfEvent {
  week: number;
  team: string;
  id: string;
  pos: Position;
  kind: 'spark' | 'bench' | 'breakout';
  reason?: 'injured' | 'slumping' | 'outplayed';
  /** A spark's starter who lost the job. */
  rep?: string;
}

/** One injury, as it happened: for the news, the season report and starts lost. */
export interface InjuryEvent {
  week: number;
  team: string;
  id: string;
  name: string;
  pos: Position;
  weeks: number;
  type: string;
  season?: boolean;
  /** He was starting when he got hurt. */
  starter: boolean;
  real?: boolean;
}

/**
 * A player's history (season/career.ts): what he did, not what he is. Gameplay state (`Progress`,
 * morale, health) never reads it. Kept across seasons and transfers; see docs/CAREERS.md.
 */
export interface Career {
  /** Finished seasons, oldest first. */
  seasons: CareerSeason[];
  /** The story so far, oldest first, the current season's included. */
  story: StoryEvent[];
  /** This season so far: games he took a snap in, and starts. Cleared when the season is archived. */
  now?: { gp: number; gs: number };
}

export type CareerRole = 'starter' | 'rotation' | 'reserve' | 'dnp';

/** One finished season. Zero counts and empty deltas are left out. */
export interface CareerSeason {
  year: number;
  team: string;
  /** His class that season, as `classLabel` prints it ('RS SO'). */
  cls: string;
  role: CareerRole;
  gp?: number;
  gs?: number;
  /** His overall at the start and end of the season. */
  ovr0: number;
  ovr1: number;
  /** The season's rating gains and level-ups. */
  d?: RatingDelta;
  lvl?: number;
  /** Stat totals from the box scores. */
  st?: Partial<Record<Exclude<keyof PlayerLine, 'id' | 'team' | 'name' | 'pos'>, number>>;
}

/** One line of a player's story. Its text is written when it happens, since names and rosters change later. */
export interface StoryEvent {
  year: number;
  /** The week it happened; missing means the offseason after `year`'s season. */
  week?: number;
  team: string;
  kind: 'start' | 'spark' | 'bench' | 'breakout' | 'breakthrough' | 'injury' | 'award' | 'portal' | 'transfer' | 'left';
  text: string;
  /** A transfer's old school (`team` is the new one). */
  from?: string;
}

export interface CoachState {
  teamId: string;
  /** 0..100; low means the hot seat. */
  security: number;
  seasons: number;
}

export type Phase = 'regular' | 'confChamp' | 'postseason' | 'complete' | 'offseason';

/** A finished year, kept when an open-ended season rolls over. */
export interface SeasonSummary {
  year: number;
  champion: string;
  heisman?: string;
  /** The final AP top 25, best first. */
  ap?: string[];
  /** Win share by team, postseason included. */
  wp?: Record<string, number>;
  /** Level-ups per player by team: the development record. */
  dev?: Record<string, number>;
}

/** Offseason stages, in order (season/offseason.ts). Graduation, the draft and signing day go before the portal. */
export type OffseasonStage = 'carousel' | 'portal';

export interface OffseasonState {
  stage: OffseasonStage;
  /**
   * Carousel: the hiring round, 1 to `CAROUSEL.rounds` (season/carousel.ts). Portal: 0 the leaving list,
   * before anyone enters; 1 and 2 the head coaches' rounds.
   */
  round: number;
  /** Last season's promises, judged when the offseason opened. */
  promises?: { kept: number; broken: number };
}

/** A player in the portal: where from, and his overall and position when he entered. */
export interface PortalEntrant {
  id: string;
  from: string;
  pos: Position;
  ovr: number;
  /** How it ended: committed (to `commits`), back to his old school, or out of FBS. */
  out?: 'commit' | 'return' | 'gone';
}

/** One of the user's players considering the portal, and what the user did about it. */
export interface LeavingEntry {
  /** His odds of entering before anything is done, and why he's thinking about it. */
  p: number;
  reason: PortalReason;
  act?: 'meet' | 'promise' | 'go' | 'encourage';
  /** A meeting's result; a promise's kind. */
  ok?: boolean;
  kind?: CoachPromise['kind'];
}

export type PortalReason = 'buried' | 'contender' | 'home' | 'develop' | 'morale' | 'coach';

export interface PortalState {
  entrants: PortalEntrant[];
  /** Interest by player, then school. */
  interest: Record<string, Record<string, number>>;
  /** Open offers by school. */
  offers: Record<string, string[]>;
  /** Player to the school he signed with. */
  commits: Record<string, string>;
  /** Promises made with offers, keyed `school:player`. One becomes `Progress.pr` if he signs there. */
  promises: Record<string, CoachPromise['kind']>;
  /** Logit shifts on entering from meetings and promises (every team), and players encouraged to go. */
  adj: Record<string, number>;
  forced: string[];
  /** The user's leaving list. */
  leaving: Record<string, LeavingEntry>;
  meets: number;
  /** What the user has spent this round, by school (CPU staffs spend the same budgets). */
  spent: Record<string, { calls: string[]; visits: string[] }>;
  /** The user's coaches' focus and dropped targets. */
  focus: string[];
  drop: string[];
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
  /** Every injury this season that cost a game, in order. */
  injuryLog?: InjuryEvent[];
  /** Next man up this season (season/confidence.ts): sparks, benchings that earned nothing, and breakouts. */
  confLog?: ConfEvent[];
  /** Every player's history by athlete id (season/career.ts). Kept across seasons; nothing in the sim reads it. */
  careers?: Record<string, Career>;
  /** Coaches' changes by coach id, kept across seasons and jobs (season/coaching.ts). */
  coaches?: Record<string, CoachProgress>;
  /** Every coach's history by coach id. Kept across seasons; nothing in the sim reads it. */
  coachCareers?: Record<string, CoachCareer>;
  /** The offseason after this season (open-ended seasons only), and its transfer portal. */
  offseason?: OffseasonState;
  portal?: PortalState;
  carousel?: CarouselState;
}
