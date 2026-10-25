import { CALENDAR } from '../data/season/calendar';
import { TEAMS, teamById } from '../data/teams';
import { seasonAwards } from './awards';
import { evaluateCoach, newCoach } from './coach';
import { weekNews } from './news';
import { apPoll, cfpRankings } from './polls';
import { bowlGames, bracketGames, bracketRoundDone, confChampGames, newBracket, recordBracket, selectPlayoff } from './postseason';
import { SAVE_VERSION } from './save';
import { generateSchedule } from './schedule';
import { settleTie, simGame } from './simGame';
import { autoGamePlan, type GamePlan } from './staff';
import type { GameResult, SeasonConfig, SeasonGame, SeasonState } from './types';
import { seasonRng, squadFor } from './world';

/**
 * The season loop. `advanceWeek` runs one week as an ordered list of steps; each step is a plain
 * function of the state, so a step can be filled in or replaced without touching the others.
 */

export function defaultConfig(userTeamId: string): SeasonConfig {
  return { userTeamId, coachCareer: false, length: 'single', delegate: { depthChart: true, gamePlan: true } };
}

export function newSeason(config: SeasonConfig, seed: number, year: number = CALENDAR.year, prev?: SeasonState): SeasonState {
  const state: SeasonState = {
    version: SAVE_VERSION, seed, year, week: 1, phase: 'regular', config,
    games: [], polls: [], news: [], teamState: {}, awards: [],
    coach: prev?.coach ?? (config.coachCareer ? newCoach(config.userTeamId) : undefined),
    history: prev?.history ?? [],
  };
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
  plans: Map<string, GamePlan>;
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
};

/** Play: the user's game takes its live result; every other game is simulated. */
const play: WeekStep = (state, ctx) => {
  const user = state.config.userTeamId;
  for (const g of gamesInWeek(state, ctx.week)) {
    if (g.result) continue;
    const home = squadFor(state, g.home);
    const away = squadFor(state, g.away);
    const rng = seasonRng(state, 'game', g.id);
    if (ctx.userResult && (g.home === user || g.away === user)) {
      g.result = { ...settleTie(ctx.userResult, home, away, rng, g.neutral), live: true };
    } else {
      g.result = simGame(home, away, rng, { neutral: g.neutral, plans: { home: ctx.plans.get(g.home)!, away: ctx.plans.get(g.away)! } });
    }
  }
};

/** Results: injuries heal. New injuries from games come later. */
const results: WeekStep = (state) => {
  for (const ts of Object.values(state.teamState)) {
    if (!ts.injuries) continue;
    for (const [id, w] of Object.entries(ts.injuries)) {
      if (w <= 1) delete ts.injuries[id];
      else ts.injuries[id] = w - 1;
    }
  }
};

/** Rankings: the AP poll every week; the committee's rankings from `cfpStartWeek` until selection. */
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
      state.history.push({ year: state.year, champion: champ, heisman: state.awards.find((a) => a.id === 'heisman')?.finalists[0]?.name });
      if (state.config.coachCareer) state.news.push(...evaluateCoach(state));
    } else if (bracketRoundDone(state)) {
      state.games.push(...bracketGames(state, week + 1));
    }
  }
};

export const WEEK_STEPS: { name: string; run: WeekStep }[] = [
  { name: 'prep', run: prep },
  { name: 'play', run: play },
  { name: 'results', run: results },
  { name: 'rankings', run: rankings },
  { name: 'news', run: news },
  { name: 'transition', run: transition },
];

/**
 * Play out the current week: the user's game with `userResult` if they played it on the field,
 * everything else simulated. Does nothing once the season is complete.
 */
export function advanceWeek(state: SeasonState, userResult?: GameResult): void {
  if (seasonOver(state)) return;
  const ctx: WeekContext = { week: state.week, userResult, plans: new Map() };
  for (const step of WEEK_STEPS) step.run(state, ctx);
  if (!seasonOver(state)) state.week++;
}

export function seasonOver(state: SeasonState): boolean {
  return state.phase === 'complete';
}

/** Sim to the end of the season. */
export function simSeason(state: SeasonState): void {
  while (!seasonOver(state)) advanceWeek(state);
}

/**
 * An open-ended season rolls into the next year. Rosters don't change yet: graduation, progression
 * from `potential`/`dev`, and recruiting belong in the offseason here.
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
    default:
      return 'SEASON OVER';
  }
}
