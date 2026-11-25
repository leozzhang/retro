import type { FilmBook } from '../game/offModel';
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
  /** The user's declare watch before the NFL draft (season/departures.ts). Missing means the user meets them. */
  departures?: boolean;
  /** HS recruiting: boards, offers, visits and signing day (season/recruiting.ts `autoRecruit`). Missing means the user recruits. */
  recruiting?: boolean;
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
  /** Quarter length in minutes for the user's live games (game/clock.ts `QUARTER_OPTIONS`). Missing means `DEFAULT_QUARTER` (8). */
  quarter?: number;
  /**
   * Key-play highlights (game/keyPlays.ts): `sim` for simulated games and stretches (missing: off,
   * the result only), `defense` for the CPU's drives in games the user plays (missing: normal; `all` watches every snap).
   */
  keyPlays?: { sim?: KeyLevel; defense?: KeyLevel };
  /** How much the CPU defense learns the user's offense in live games (game/defBrain.ts). Missing means NORMAL. */
  defIq?: 'STATIC' | 'NORMAL' | 'SHARP';
  /** Daylight for the runner in live games (render/renderer.ts `RunAssist`): always, until the handoff, or never. Missing means FULL. */
  runAssist?: 'FULL' | 'LIGHT' | 'OFF';
  /** Punts and kickoffs in live games: watched (SPACE skips) or straight to the result. Missing means watch. */
  kicks?: 'watch' | 'result';
  /** Slow motion while the QB aims a pass in live games. Missing means off. */
  aimSlow?: boolean;
  /** The presnap read line in live games: the shell and the rest of the look, the shell only, or nothing. Missing means FULL. */
  readHelp?: 'FULL' | 'SHELL' | 'OFF';
  /** The CPU defense disguises its coverage before the snap in live games (data/defenses.ts `Disguise`). Missing means on. */
  disguises?: boolean;
  /**
   * Program history on the team pages (season/program.ts): the real history through 2025
   * (data/fbs/history.ts), or every team starting from nothing. Set when the dynasty starts. Missing means real.
   */
  history?: 'real' | 'fresh';
  /** The Week Wrap after each week (season/moments.ts): every moment, the big ones only, or none. Missing means BIG. */
  wrap?: 'all' | 'big' | 'off';
}

/** `all`: every snap of a CPU drive in a played game, watched on the field (the CPU DRIVES setting only). */
export type KeyLevel = 'off' | 'lean' | 'normal' | 'full' | 'all';

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
  /** Defense: sacks and interceptions (as cast, season/cast.ts). Zero in box scores from before they were kept. */
  sk: number;
  defInt: number;
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
  /** A live game's come from the field as it's played (season/liveBox.ts). */
  players: PlayerLine[];
}

export interface GameResult {
  home: number;
  away: number;
  ot: number;
  box: BoxScore;
  /** Played on the field by the user, not simulated. */
  live?: boolean;
  /** Its scoring plays and biggest other plays, in order (season/gamePlays.ts). Missing in games from before they were kept. */
  plays?: GamePlay[];
}

/**
 * One of a game's key plays, for its game page (render/gameScreen.ts). `kind` is the key-play kind
 * (game/keyPlays.ts): 'td', 'fg', 'missedFg', 'int', 'fumble', 'fourthStop', 'fourthConv', 'explosive',
 * 'sack', 'twoPt', 'twoPtStop', 'redZoneStop', ..., or a defensive score in a played game: 'pick6',
 * 'returnTd', 'safety'.
 */
export interface GamePlay {
  /** Quarter (5 is the 1st overtime) and the seconds left in it. */
  q: number;
  time: number;
  /** The offense's team id. */
  off: string;
  kind: string;
  /** Yards gained (a touchdown's stop at the goal line), the spot before the snap from the offense's own goal, the down and distance. */
  yds: number;
  yard: number;
  down: number;
  toGo: number;
  pass?: boolean;
  /**
   * Athlete ids: the carrier, receiver or kicker, and the defender on an interception or sack.
   * Their names (and the passer, the offense's line with the most attempts) are on the game's box score.
   */
  who?: string;
  by?: string;
  /** Points the play scored (a touchdown with its kick), and the score after it, home first. */
  pts: number;
  /** The defense's id when it scored them (a pick six, a return, a safety). */
  for?: string;
  score: [number, number];
  /** How much the snap mattered, 0..1. Missing is 0. */
  lev?: number;
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
  kind: 'upset' | 'performance' | 'poll' | 'heisman' | 'postseason' | 'result' | 'coach' | 'progress' | 'injury' | 'portal' | 'carousel' | 'draft' | 'recruiting';
  text: string;
  teams: string[];
  /** The game it's about (`SeasonGame.id`), for a link to its page. */
  game?: string;
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
  /** Games he took a snap in this season: 4 or fewer keeps a redshirt (season/departures.ts). */
  gp?: number;
  /** The season he redshirted: it doesn't count toward his class (season/classes.ts). */
  rs?: number;
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
  /** The program's recruiting pipelines by state, 0-1, from recent classes (season/recruiting.ts). Carried across seasons. */
  pipe?: Record<string, number>;
  /** The user's offense on film from its live games, for the next DC's prior (game/offModel.ts `FilmBook`). User team only. */
  film?: FilmBook;
  /**
   * A storyline decision on a staff chart (season/storylines.ts): the staff start `id` at `slot` while
   * he's healthy, this season. User team only; a user-edited chart takes the decision directly instead.
   */
  pin?: { slot: string; id: string };
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
  /** His recruiting pipelines grown from signings, by state (season/recruiting.ts `coachPipe` adds his seeded ones). */
  pipe?: Record<string, number>;
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
  /** Teams playing their twos this drive (garbage time in an engine game, `MOPUP`): their backups get the snaps. */
  mop?: string[];
  /**
   * The user's subs in a played game (game/lineup.ts): from play `from` of this drive on, `team` plays
   * these slots with these players (only where they differ from its depth chart; empty is back to it).
   */
  subs?: { team: string; from: number; lineup: Record<string, string> }[];
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
  kind: 'start' | 'spark' | 'bench' | 'breakout' | 'breakthrough' | 'injury' | 'award' | 'portal' | 'transfer' | 'left' | 'redshirt' | 'graduated' | 'declared' | 'drafted' | 'signed';
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
  /** The Heisman winner's team. */
  heismanTeam?: string;
  /** The final AP top 25, best first. */
  ap?: string[];
  /** Win share by team, postseason included. */
  wp?: Record<string, number>;
  /** Level-ups per player by team: the development record. */
  dev?: Record<string, number>;
  /** The NFL draft that followed it (season/draft.ts), in pick order. */
  draft?: DraftPick[];
  /** Every team's season, for the program pages (season/program.ts). History only. */
  teams?: Record<string, TeamYear>;
}

/** One team's finished season (season/season.ts `yearRecord`). Missing fields are zero or none. */
export interface TeamYear {
  conf: string;
  w: number;
  l: number;
  cw: number;
  cl: number;
  /** Final AP rank. */
  ap?: number;
  /** Won the conference title game; played in it. */
  cc?: 1;
  cg?: 1;
  /** Playoff seed, and the last round played (0 first round .. 3 the final). */
  seed?: number;
  rd?: number;
  /** National champion. */
  nc?: 1;
  /** A non-playoff bowl: its name, and whether they won it. */
  bowl?: string;
  bw?: 1;
  /** The head coach's name ('YOU' for the user's program). */
  hc?: string;
  /** Rivalry games (regular season), by opponent: 1 won, 0 lost. */
  rv?: Record<string, 1 | 0>;
  /** W-L against teams in the AP top 25 at kickoff, and in one-score games (8 or fewer), postseason included. */
  big?: [number, number];
  close?: [number, number];
}

/** A news item kept past its season for a team's page (season/program.ts `archiveChronicle`). */
export interface ChronItem {
  year: number;
  week: number;
  kind: NewsItem['kind'];
  text: string;
  /** Salience, from `newsWeight`. */
  w: number;
}

/** One NFL draft pick. Name, position and overall are copied in, since he's gone from FBS. */
export interface DraftPick {
  id: string;
  /** His college. */
  team: string;
  name: string;
  pos: Position;
  ovr: number;
  round: number;
  /** Overall pick, from 1. */
  pick: number;
  /** The NFL team, by city. */
  city: string;
  /** An underclassman who declared early. */
  early?: boolean;
}

/** A player leaving after his season: out of eligibility, or declared for the draft. */
export interface Departure {
  id: string;
  team: string;
  name: string;
  pos: Position;
  ovr: number;
  why: 'grad' | 'declare';
}

/** One of the user's underclassmen thinking about the draft, and what the user did about it. */
export interface DeclareEntry {
  /** His odds of declaring before a meeting, and where he projects. */
  p: number;
  proj: number;
  met?: boolean;
  /** The meeting kept him. */
  ok?: boolean;
}

/** The departures stage (season/departures.ts): the declare watch, then who left. */
export interface DeparturesState {
  /** The user's declare watch. */
  watch: Record<string, DeclareEntry>;
  /** Logit shifts on declaring from meetings (every team). */
  adj: Record<string, number>;
  meets: number;
  /** Everyone who left, once the stage has run; and how many left each team (the portal's spots read it). */
  gone?: Departure[];
  left?: Record<string, number>;
}

/** One recruiting move, for the news, the board and the season report. */
export interface RecruitEvent {
  week: number;
  id: string;
  team: string;
  kind: 'commit' | 'decommit' | 'sign';
  /** A commit that flipped from another school. */
  from?: string;
}

/**
 * The HS recruiting cycle (season/recruiting.ts) for the class that enrolls next season. Kept sparse:
 * interest only where a school has worked a prospect, boards only for what each staff is tracking.
 */
export interface RecruitingState {
  /** The class (the season it enrolls) and the career's salt for its ids (data/recruits.ts). */
  cls: number;
  salt: string;
  /** Interest by prospect, then school. */
  interest: Record<string, Record<string, number>>;
  /** Open offers by school. */
  offers: Record<string, string[]>;
  /** Prospect to the school he's committed to (signed or not), and to the one he signed with (binding). */
  commits: Record<string, string>;
  signed: Record<string, string>;
  /** Each school's board. */
  boards: Record<string, string[]>;
  /** The user's top targets, and his staff's evaluation effort by prospect. */
  top: string[];
  effort: Record<string, number>;
  /** Official visitors by home game id; the schools each prospect has visited (5 at most). */
  visits: Record<string, string[]>;
  ov: Record<string, string[]>;
  /** The head coaches' in-home visits by school. */
  homes: Record<string, string[]>;
  /** How the user's visitors took their last visit, -1..1. */
  vibe: Record<string, number>;
  /** Prospects who went unsigned (to FCS or JUCO) after signing day. */
  gone?: string[];
  log: RecruitEvent[];
  /** Spots a school's class holds back for the transfer portal (the user's dial; `portalHold` otherwise). */
  hold?: Record<string, number>;
  /** The signees have started joining rosters (the early signees, as the portal opens). */
  joined?: boolean;
  /** Each school's planned class at the early signing period: its commits within it hold spots through the portal. */
  plan?: Record<string, number>;
}

/** Offseason stages, in order (season/offseason.ts). */
export type OffseasonStage = 'carousel' | 'departures' | 'portal' | 'signing';

export interface OffseasonState {
  stage: OffseasonStage;
  /**
   * Carousel: the hiring round, 1 to `CAROUSEL.rounds` (season/carousel.ts). Departures: 0 the declare
   * watch, 1 who left and the draft. Portal: 0 the leaving list, before anyone enters; 1 and 2 the head
   * coaches' rounds. Signing (after the portal): 0 before national signing day, 1 the class.
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
  /** HS commits the user released to make room (season/recruiting.ts `releaseCommit`). */
  released?: number;
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
  departures?: DeparturesState;
  /** This season's HS recruiting cycle, through national signing day in its offseason. */
  recruiting?: RecruitingState;
  /** Each team's big news from past seasons, newest year last (season/program.ts). History only. */
  chronicle?: Record<string, ChronItem[]>;
  /** The coach's office: what the user has earned (season/achievements.ts). Kept across seasons; nothing in the sim reads it. */
  office?: OfficeState;
  /** This season's moments for the Week Wrap (season/moments.ts), oldest first. Display only. */
  moments?: Moment[];
  /** How many of `moments` the user has seen. */
  seenMoments?: number;
  /** The Heisman race each week from the watch week on, top 10 (season/moments.ts). Display only. */
  buzz?: { week: number; top: { id: string; team: string; name: string; pos: Position; score: number }[] }[];
  /** The user's storylines this season (season/storylines.ts). Only their decisions reach the sim, through the depth chart. */
  stories?: Storyline[];
  /** The user's starting lineup as the season ended (slot to id), kept for the new season's opener (season/offseasonMoments.ts). Display only. */
  lineup?: Record<string, string>;
}

/** A player as a moment shows him, copied in so the card survives roster changes. */
export interface MomentPlayer {
  id: string;
  team: string;
  name: string;
  num: number;
  pos: Position;
  /** Class label: "RS SO". */
  cls: string;
  stars: number;
  home: string;
  ovr: number;
  skin: string;
  dev: DevTrait;
  /** A recruit's national rank. */
  rank?: number;
  /** A transfer's old school (a team id). */
  from?: string;
}

export type MomentKind =
  | 'final' | 'breakout' | 'breakthrough' | 'injury' | 'firstStart' | 'poll' | 'heisman' | 'milestone'
  | 'stakes' | 'progress' | 'around' | 'story' | 'decision' | 'preview'
  // Recruiting, awards, and the offseason's reveals and the season opener (season/offseasonMoments.ts).
  | 'commit' | 'award' | 'staff' | 'draft' | 'farewell' | 'signing' | 'portal' | 'opener' | 'arrivals';

/** How a game's final card plays: a win or loss, or the bigger versions of one. */
export type FinalStyle = 'win' | 'loss' | 'upset' | 'stunned' | 'rivalry' | 'title' | 'champion';

/** One row of a moment's list: the poll or Heisman ladder, level-up tiles, around the FBS. */
export interface MomentRow {
  text: string;
  /** Right-hand value: "+3", "12-0", a rank. */
  val?: string;
  /** Places moved (ladders). */
  mv?: number;
  /** The user's team or player. */
  me?: boolean;
  team?: string;
}

/**
 * Something worth stopping for after a week (docs/STORYLINES.md): its text is written when it
 * happens, like the news. `tier` 3 is the biggest; `w` orders moments within a tier.
 */
export interface Moment {
  id: string;
  week: number;
  kind: MomentKind;
  tier: 1 | 2 | 3;
  w: number;
  team: string;
  opp?: string;
  game?: string;
  title: string;
  sub: string;
  lines: string[];
  /** The player it's about, and a second one (the injured starter, the man he replaced). */
  p?: MomentPlayer;
  q?: MomentPlayer;
  /** A number that rolls: rank or overall, from and to. */
  n?: [number, number];
  d?: RatingDelta;
  dev?: [DevTrait, DevTrait];
  rows?: MomentRow[];
  /** A final's score (user first) and style. */
  score?: [number, number];
  style?: FinalStyle;
  /** The storyline it's a beat of. */
  arc?: string;
  /** The offseason stage it closed (its reveal), or 'opener' for the new season's opener. */
  os?: OffseasonStage | 'opener';
}

export type StoryKind = 'nextManUp' | 'breakoutWatch' | 'slump' | 'heisman' | 'unbeaten' | 'bowlChase' | 'rivalry' | 'reunion' | 'homecoming'
  | 'recruitment' | 'recruitClass' | 'confRace' | 'bubble' | 'award' | 'transferRisk' | 'phenom' | 'seniorDay' | 'draftStock' | 'newFace';

export interface StoryBeat {
  week: number;
  text: string;
  tone: 'up' | 'down' | 'flat';
}

/**
 * A choice at a storyline's turning point, through a lever the game already has: who starts at `slot`
 * (`depth`, the default), host a recruit on an official visit (`visit`), or send the staff for an
 * in-home (`inhome`). A recruiting option's id is the prospect's, or '' to pass.
 */
export interface StoryDecision {
  prompt: string;
  slot: string;
  act?: 'depth' | 'visit' | 'inhome';
  options: { label: string; sub: string; id: string }[];
  /** The option taken (an id), once decided. */
  chosen?: string;
  /** The week it was offered. */
  week: number;
}

/**
 * A storyline (season/storylines.ts): a run of weeks about one player or the team, with what's at
 * stake next and how it ended. `star` is the player it's about, `other` the second one.
 */
export interface Storyline {
  id: string;
  kind: StoryKind;
  team: string;
  title: string;
  star?: MomentPlayer;
  other?: MomentPlayer;
  /** A game it's about (rivalry, reunion, homecoming). */
  game?: string;
  /** The depth chart slot it's about (next man up, slump). */
  slot?: string;
  opened: number;
  status: 'open' | 'resolved';
  beats: StoryBeat[];
  /** What the next game decides. */
  stakes: string;
  meter?: { at: number; of: number; label: string };
  decision?: StoryDecision;
  outcome?: string;
  /** Kind-specific counters: starts, wins as the starter, the week the starter is due back. */
  k?: Record<string, number>;
}

/** One thing in the coach's office (docs/OFFICE.md). */
export interface OfficeItem {
  /** The achievement it's for (season/achievements.ts `ACHIEVEMENTS`). */
  id: string;
  /** Unique per item, so finding it again adds nothing: `paper:2027:w6`. */
  key: string;
  year: number;
  week?: number;
  /** The game it came from, for a link while that season's games are kept. */
  game?: string;
  /** The school it was earned at: its colors are drawn into it. */
  team: string;
  /** What its art and card need, kept at unlock: games and rosters don't last. */
  data?: Record<string, string | number>;
  /** Unlock order (`OfficeState.rev` at the time). */
  rev: number;
  /** Not seen on the office page yet. */
  fresh?: 1;
  /** A leveled item's finds, oldest first: its level is how many (`AchievementDef.levels`). `data` is the latest's. */
  log?: OfficeMark[];
  /** `OfficeState.rev` when it last leveled up, for the toast. */
  up?: number;
}

/** One find folded into a leveled item: its key, year, card line and an optional value its art reads (a team, a role). */
export interface OfficeMark {
  k: string;
  y: number;
  t: string;
  v?: string;
}

export interface OfficeState {
  items: OfficeItem[];
  /** Bumped by every unlock. */
  rev: number;
  /** The room tier last shown, to announce a move. */
  tier: number;
}
