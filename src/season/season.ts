import { CALENDAR } from '../data/season/calendar';
import { TEAMS, teamById } from '../data/teams';
import { seasonAwards } from './awards';
import { evaluateCoach, newCoach } from './coach';
import { weekNews } from './news';
import { apPoll, cfpRankings, latestPoll } from './polls';
import { bowlGames, bracketGames, bracketRoundDone, confChampGames, newBracket, recordBracket, selectPlayoff } from './postseason';
import { SAVE_VERSION } from './save';
import { generateSchedule } from './schedule';
import { DEV_LABEL } from '../data/athletes';
import { athleteName, generatedAthlete, type Squad } from '../data/depth';
import { archiveSeason, storyWeek } from './career';
import { carryConfidence, confidenceStep, type BreakoutEvent, type SparkReason } from './confidence';
import { carryMorale, moraleStep } from './morale';
import { gradeGame, type GameGrade } from './grades';
import { healWeek, injureGame, outText } from './injuries';
import { deltaText, POS_POINTS, progressTeam, type LevelUpEvent } from './progression';
import { GAME_SIM, settleTie, simGame } from './simGame';
import { emphasisMods, type TeamMods } from './emphasis';
import { autoGamePlan, type GamePlan } from './staff';
import type { DriveLog, GameResult, InjuryEvent, SeasonConfig, SeasonGame, SeasonState, SeasonSummary, TeamState } from './types';
import { baseRoster, seasonRng, squadFor, staffFor } from './world';

/**
 * The season loop. `advanceWeek` runs one week as an ordered list of steps; each step is a plain
 * function of the state, so a step can be filled in or replaced without touching the others.
 */

export function defaultConfig(userTeamId: string): SeasonConfig {
  return { userTeamId, coachCareer: false, length: 'single', delegate: { depthChart: true, gamePlan: true }, injuries: 'normal' };
}

export function newSeason(config: SeasonConfig, seed: number, year: number = CALENDAR.year, prev?: SeasonState): SeasonState {
  const state: SeasonState = {
    version: SAVE_VERSION, seed, year, week: 1, phase: 'regular', config,
    games: [], polls: [], news: [], teamState: {}, awards: [],
    coach: prev?.coach ?? (config.coachCareer ? newCoach(config.userTeamId) : undefined),
    history: prev?.history ?? [],
    careers: prev?.careers ?? {},
  };
  // Progression and morale carry over, without last season's week marks.
  for (const [id, ts] of Object.entries(prev?.teamState ?? {})) {
    if (!ts.progress && !ts.mo && !ts.roster) continue;
    const next = JSON.parse(JSON.stringify({ progress: ts.progress, mo: ts.mo, roster: ts.roster })) as TeamState;
    for (const p of Object.values(next.progress ?? {})) {
      delete p.up;
      carryConfidence(p);
    }
    carryMorale(next, baseRoster(prev!, id));
    state.teamState[id] = next;
  }
  state.games = generateSchedule(TEAMS, year, seasonRng(state, 'schedule'));
  const pre = apPoll(state, 0).poll;
  state.polls.push(pre);
  state.news.push({ week: 0, kind: 'poll', teams: [pre.ranks[0].team], text: `${teamById(pre.ranks[0].team).school} opens ${year} at No. 1 in the preseason AP poll` });
  return state;
}

/** The user's game this week, if any is still to be played. */
export function userGameThisWeek(state: SeasonState): SeasonGame | undefined {
  const u = state.config.userTeamId;
  return state.games.find((g) => g.week === state.week && !g.result && (g.home === u || g.away === u));
}

export function gamesInWeek(state: SeasonState, week: number): SeasonGame[] {
  return state.games.filter((g) => g.week === week);
}

/** What the week's steps share. */
interface WeekContext {
  week: number;
  /** The user's game, played on the field (scores only so far). */
  userResult?: GameResult;
  /** The user's live game as drive logs, for the progression grades. */
  userDrives?: DriveLog[];
  plans: Map<string, GamePlan>;
  /** Weekly emphases by team: only the user's staff picks any so far (CPU staffs stay on standard). */
  emph: Map<string, TeamMods>;
  /** Each game's drives and the squads that played it, for the progress step. */
  played: Map<string, { drives: DriveLog[]; home: Squad; away: Squad; neutral: boolean }>;
  /** Each game's grades, by game id, from the progress step: injuries read the snaps and hits. */
  grades: Map<string, Map<string, GameGrade>>;
}

type WeekStep = (state: SeasonState, ctx: WeekContext) => void;

/** Prep: depth charts and game plans. Staff handle every CPU team and whatever the user delegated. */
const prep: WeekStep = (state, ctx) => {
  const user = state.config.userTeamId;
  if (state.config.delegate.depthChart && state.teamState[user]?.depth) delete state.teamState[user].depth;
  for (const g of gamesInWeek(state, ctx.week)) {
    for (const [id, opp] of [[g.home, g.away], [g.away, g.home]]) {
      const own = id === user && !state.config.delegate.gamePlan ? state.teamState[user]?.plan : undefined;
      ctx.plans.set(id, own ?? autoGamePlan(squadFor(state, id), squadFor(state, opp)));
    }
  }
  const mods = emphasisMods(staffFor(state, user), state.teamState[user]?.emph);
  if (mods) ctx.emph.set(user, mods);
};

/** Play: the user's game takes its live result; every other game is simulated. */
const play: WeekStep = (state, ctx) => {
  const user = state.config.userTeamId;
  for (const g of gamesInWeek(state, ctx.week)) {
    if (g.result) continue;
    const home = squadFor(state, g.home);
    const away = squadFor(state, g.away);
    const rng = seasonRng(state, 'game', g.id);
    const drives: DriveLog[] = [];
    const emph = { home: ctx.emph.get(g.home), away: ctx.emph.get(g.away) };
    if (ctx.userResult && (g.home === user || g.away === user)) {
      drives.push(...(ctx.userDrives ?? []));
      g.result = { ...settleTie(ctx.userResult, home, away, rng, g.neutral, drives, emph), live: true };
    } else {
      g.result = simGame(home, away, rng, { neutral: g.neutral, plans: { home: ctx.plans.get(g.home)!, away: ctx.plans.get(g.away)! }, drives, emph });
    }
    ctx.played.set(g.id, { drives, home, away, neutral: g.neutral });
  }
};

/** Breakthroughs by real players on other teams that make the news each week. */
const BREAKTHROUGH_NEWS = 2;

/** How the news says why the next man is up. */
const SPARK_TEXT: Record<SparkReason, string> = { injured: 'the injured', slumping: 'a slumping', outplayed: 'an outplayed' };

/**
 * Progress: every player who played earns XP from his game grades and may level up
 * (season/progression.ts), then the whole roster's morale moves (season/morale.ts) and confidence moves, new starters spark and breakouts land
 * (season/confidence.ts). Breakthroughs and breakouts on the user's team make the news, and the
 * biggest few by real players elsewhere; so does the user's next man up.
 */
const progress: WeekStep = (state, ctx) => {
  const user = state.config.userTeamId;
  const elsewhere: LevelUpEvent[] = [];
  const breakouts: BreakoutEvent[] = [];
  const told = (e: LevelUpEvent) =>
    state.news.push({
      week: ctx.week, kind: 'progress', teams: [e.team],
      text: `BREAKTHROUGH: ${athleteName(e.athlete)} (${teamById(e.team).abbr} ${e.athlete.pos}) ${deltaText(e.d)}`,
    });
  const toldBreakout = (e: BreakoutEvent) =>
    state.news.push({
      week: ctx.week, kind: 'progress', teams: [e.team],
      text: `BREAKOUT: ${athleteName(e.athlete)} (${teamById(e.team).abbr} ${e.athlete.pos}) ${DEV_LABEL[e.from].toUpperCase()} TO ${DEV_LABEL[e.to].toUpperCase()} ${deltaText(e.d)}`.trim(),
    });
  for (const [id, { drives, home, away, neutral }] of ctx.played) {
    if (!drives.length) continue;
    const share: Record<string, number> = {};
    for (const sq of [home, away]) share[sq.team.id] = ctx.plans.get(sq.team.id)?.passShare ?? 0.5;
    const grades = gradeGame(home, away, drives, share, seasonRng(state, 'grade', id), neutral ? 0 : GAME_SIM.homeEdge);
    ctx.grades.set(id, grades);
    for (const sq of [home, away]) {
      const t = sq.team.id;
      const ts = (state.teamState[t] ??= {});
      const focus = t === user && ts.emph ? { staff: staffFor(state, t), picks: ts.emph } : undefined;
      const events = progressTeam(ts, sq, grades, ctx.week, seasonRng(state, 'progress', t, ctx.week), focus);
      if (events.length) ts.lu = (ts.lu ?? 0) + events.length;
      for (const e of events) {
        if (!e.big) continue;
        if (t === user) told(e);
        else if (e.athlete.real) elsewhere.push(e);
      }
      // Morale first: it reads last game's starters, which the confidence step moves on.
      moraleStep(state, ts, sq, seasonRng(state, 'morale', t, ctx.week));
      const bases = new Map(baseRoster(state, t).map((a) => [a.id, generatedAthlete(a.id) ?? a]));
      const conf = confidenceStep(state, ts, sq, grades, bases, ctx.week, seasonRng(state, 'confidence', t, ctx.week));
      if (t === user) {
        for (const e of conf.sparks) {
          state.news.push({
            week: ctx.week, kind: 'progress', teams: [t],
            text: `NEXT MAN UP: ${athleteName(e.athlete)} (${e.athlete.pos}) starts for ${SPARK_TEXT[e.reason]} ${athleteName(e.replaced)}`,
          });
        }
      }
      for (const e of conf.breakouts) {
        if (t === user) toldBreakout(e);
        else breakouts.push(e);
      }
    }
  }
  // Real players first: breakouts are mostly backups, so they can't be the only ones told.
  for (const e of breakouts.sort((a, b) => Number(!!b.athlete.real) - Number(!!a.athlete.real)).slice(0, BREAKTHROUGH_NEWS)) toldBreakout(e);
  // Biggest by overall, not raw points (a QB level-up spends more points than a tackle's).
  const pts = (e: LevelUpEvent) => Object.values(e.d).reduce((a, b) => a + (b ?? 0), 0) / POS_POINTS[e.athlete.pos];
  for (const e of elsewhere.sort((a, b) => pts(b) - pts(a)).slice(0, BREAKTHROUGH_NEWS)) told(e);
};

/** Injuries of 2+ weeks to real players elsewhere that make the news each week. */
const INJURY_NEWS = 3;

/**
 * Results: last week's injuries heal and health recovers, then this week's games hand out knocks and
 * injuries (season/injuries.ts). Every injury on the user's team makes the news, and the worst few to
 * real players elsewhere.
 */
const results: WeekStep = (state, ctx) => {
  const played = new Set<string>();
  for (const grades of ctx.grades.values()) for (const [id, g] of grades) if (g.snaps) played.add(id);
  healWeek(state, played);
  const user = state.config.userTeamId;
  const events: InjuryEvent[] = [];
  for (const [id, { home, away }] of ctx.played) {
    const grades = ctx.grades.get(id);
    if (grades) events.push(...injureGame(state, id, ctx.week, [home, away], grades));
  }
  if (!events.length) return;
  (state.injuryLog ??= []).push(...events);
  const told = (e: InjuryEvent) =>
    state.news.push({
      week: ctx.week, kind: 'injury', teams: [e.team],
      text: `INJURY: ${e.name} (${teamById(e.team).abbr} ${e.pos}) ${outText(e).toLowerCase()}, ${e.type.toLowerCase()}`,
    });
  for (const e of events) if (e.team === user) told(e);
  const worst = events.filter((e) => e.team !== user && e.real && e.weeks >= 2).sort((a, b) => b.weeks - a.weeks);
  for (const e of worst.slice(0, INJURY_NEWS)) told(e);
};

/** Rankings: the AP poll every week; the committee's rankings from `cfpStartWeek` until selection. */
/** Story: games, starts and this week's moments go into each player's career (season/career.ts). */
const story: WeekStep = (state, ctx) => {
  storyWeek(state, ctx.week, ctx.grades.values());
};

const rankings: WeekStep = (state, ctx) => {
  state.polls.push(apPoll(state, ctx.week).poll);
  if (state.phase !== 'postseason' && ctx.week >= CALENDAR.cfpStartWeek) state.polls.push(cfpRankings(state, ctx.week).poll);
};

const news: WeekStep = (state, ctx) => {
  state.news.push(...weekNews(state, ctx.week));
};

/** Selection: the final committee rankings set the playoff field and the bowls. */
function selection(state: SeasonState, week: number): void {
  const { order } = cfpRankings(state, week);
  const field = selectPlayoff(state, order);
  state.bracket = newBracket(field);
  const next = week + 1;
  const bowls = bowlGames(state, order, field, next);
  state.games.push(...bracketGames(state, next), ...bowls);
  state.awards = seasonAwards(state);
  const heisman = state.awards.find((a) => a.id === 'heisman')?.finalists[0];
  state.news.push({ week, kind: 'postseason', teams: field, text: `PLAYOFF FIELD: ${field.map((id, i) => `${i + 1}. ${teamById(id).abbr}`).join(' ')}` });
  state.news.push({ week, kind: 'postseason', teams: [], text: `${bowls.length} bowl games set` });
  if (heisman) state.news.push({ week, kind: 'heisman', teams: [heisman.team], text: `${heisman.name} (${teamById(heisman.team).school}) wins the Heisman Trophy` });
}

/** Phase changes and next week's postseason games. */
const transition: WeekStep = (state, ctx) => {
  const week = ctx.week;
  if (state.phase === 'regular' && week >= CALENDAR.regularWeeks) {
    state.games.push(...confChampGames(state, week + 1));
    state.phase = 'confChamp';
  } else if (state.phase === 'confChamp') {
    selection(state, week);
    state.phase = 'postseason';
  } else if (state.phase === 'postseason') {
    recordBracket(state);
    const champ = state.bracket?.champion;
    if (champ) {
      state.phase = 'complete';
      state.news.push({ week, kind: 'postseason', teams: [champ], text: `${teamById(champ).school} wins the ${state.year} national championship` });
      state.history.push({
        year: state.year, champion: champ, heisman: state.awards.find((a) => a.id === 'heisman')?.finalists[0]?.name,
        ...yearRecord(state),
      });
      archiveSeason(state);
      if (state.config.coachCareer) state.news.push(...evaluateCoach(state));
    } else if (bracketRoundDone(state)) {
      state.games.push(...bracketGames(state, week + 1));
    }
  }
};

/** The year's final AP top 25, win shares and development records, for next years' reputations. */
function yearRecord(state: SeasonState): Pick<SeasonSummary, 'ap' | 'wp' | 'dev'> {
  const ap = latestPoll(state, 'ap')?.ranks.map((r) => r.team) ?? [];
  const w: Record<string, [number, number]> = {};
  for (const g of state.games) {
    if (!g.result) continue;
    const homeWon = g.result.home > g.result.away;
    for (const [id, won] of [[g.home, homeWon], [g.away, !homeWon]] as const) {
      const x = (w[id] ??= [0, 0]);
      x[0] += won ? 1 : 0;
      x[1]++;
    }
  }
  const wp: Record<string, number> = {};
  const dev: Record<string, number> = {};
  for (const t of TEAMS) {
    const x = w[t.id];
    if (x) wp[t.id] = Math.round((x[0] / x[1]) * 1000) / 1000;
    dev[t.id] = Math.round(((state.teamState[t.id]?.lu ?? 0) / baseRoster(state, t.id).length) * 1000) / 1000;
  }
  return { ap, wp, dev };
}

export const WEEK_STEPS: { name: string; run: WeekStep }[] = [
  { name: 'prep', run: prep },
  { name: 'play', run: play },
  { name: 'progress', run: progress },
  { name: 'results', run: results },
  { name: 'story', run: story },
  { name: 'rankings', run: rankings },
  { name: 'news', run: news },
  { name: 'transition', run: transition },
];

/**
 * Play out the current week: the user's game with `userResult` (and its drives, for progression) if
 * they played it on the field, everything else simulated. Does nothing once the season is complete.
 * The user's weekly emphases are spent: every week starts on standard.
 */
export function advanceWeek(state: SeasonState, userResult?: GameResult, userDrives?: DriveLog[]): void {
  if (seasonOver(state)) return;
  const ctx: WeekContext = { week: state.week, userResult, userDrives, plans: new Map(), emph: new Map(), played: new Map(), grades: new Map() };
  for (const step of WEEK_STEPS) step.run(state, ctx);
  delete state.teamState[state.config.userTeamId]?.emph;
  if (!seasonOver(state)) state.week++;
}

/** The season is played out: complete, or into its offseason. */
export function seasonOver(state: SeasonState): boolean {
  return state.phase === 'complete' || state.phase === 'offseason';
}

/** Sim to the end of the season. */
export function simSeason(state: SeasonState): void {
  while (!seasonOver(state)) advanceWeek(state);
}

/**
 * An open-ended season rolls into the next year. Players keep their progression; class years don't
 * change yet: graduation, offseason growth and recruiting belong in the offseason here.
 */
export function nextSeason(state: SeasonState): SeasonState {
  return newSeason(state.config, state.seed, state.year + 1, state);
}

export function phaseLabel(state: SeasonState): string {
  switch (state.phase) {
    case 'regular':
      return `WEEK ${state.week}`;
    case 'confChamp':
      return 'CHAMPIONSHIP WEEK';
    case 'postseason':
      return 'BOWLS AND PLAYOFF';
    case 'offseason':
      return 'OFFSEASON: PORTAL';
    default:
      return 'SEASON OVER';
  }
}
