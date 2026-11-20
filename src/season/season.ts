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
import type { Group } from '../data/coaches';
import { athleteName, generatedAthlete, type Squad } from '../data/depth';
import { checkOffice } from './achievements';
import { archiveSeason, storyWeek } from './career';
import { archiveChronicle, seasonRows } from './program';
import { archiveCoaches, programXp, progressCoaches } from './coaching';
import { carryConfidence, confidenceStep, type BreakoutEvent, type SparkReason } from './confidence';
import { emptyEvents, mergeWeek, weekMoments, type WeekEvents } from './moments';
import { storyStep } from './storylines';
import { carryMorale, moraleOf, moraleStep } from './morale';
import { gradeGame, type GameGrade } from './grades';
import { healWeek, injureGame, outText } from './injuries';
import { deltaText, offseasonGrowth, progressTeam, type LevelUpEvent } from './progression';
import { joinYear } from '../data/rosterGen';
import { GAME_SIM, settleTie, simGame, winOdds } from './simGame';
import { emphasisMods, groupOf, type TeamMods } from './emphasis';
import { openRecruiting, recruitWeek } from './recruiting';
import { STANDARD } from '../data/emphasis';
import { autoGamePlan, type GamePlan } from './staff';
import type { GameStory } from './story';
import { engineGame, type EngineTeamIn, type SnapWatch } from './engineGame';
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
    ...(prev?.office ? { office: prev.office } : {}),
    // The staffs grow through the offseason (season/coaching.ts).
    ...(prev ? { coaches: progressCoaches(prev) } : {}),
    ...(prev?.coachCareers ? { coachCareers: prev.coachCareers } : {}),
  };
  // Progression, morale, rosters and staffs carry over, without last season's week marks.
  for (const [id, ts] of Object.entries(prev?.teamState ?? {})) {
    if (!ts.progress && !ts.mo && !ts.roster && !ts.staff && !ts.ga && !ts.pipe) continue;
    const next = JSON.parse(JSON.stringify({ progress: ts.progress, mo: ts.mo, roster: ts.roster, staff: ts.staff, ga: ts.ga, pipe: ts.pipe })) as TeamState;
    for (const p of Object.values(next.progress ?? {})) {
      delete p.up;
      delete p.gp;
      carryConfidence(p);
    }
    carryMorale(next, baseRoster(prev!, id));
    state.teamState[id] = next;
  }
  if (prev?.phase === 'offseason') growOffseason(prev, state);
  if (prev) archiveChronicle(prev, state);
  state.games = generateSchedule(TEAMS, year, seasonRng(state, 'schedule'));
  const pre = apPoll(state, 0).poll;
  state.polls.push(pre);
  state.news.push({ week: 0, kind: 'poll', teams: [pre.ranks[0].team], text: `${teamById(pre.ranks[0].team).school} opens ${year} at No. 1 in the preseason AP poll` });
  // A class only matters with a next season to enroll in.
  if (config.length === 'open') openRecruiting(state);
  return state;
}

/** The user's biggest offseason gainers that make the news. */
const OFFSEASON_NEWS = 3;

/**
 * Offseason growth (season/progression.ts `offseasonGrowth`) for every returning player, from the
 * roster and staff as last season's offseason left them; the incoming freshmen arrive as they are.
 * Only after a real offseason: a season rolled straight over skips it.
 */
function growOffseason(prev: SeasonState, state: SeasonState): void {
  const user = state.config.userTeamId;
  for (const t of TEAMS) {
    const ts = (state.teamState[t.id] ??= {});
    const prog = (ts.progress ??= {});
    const old = prev.teamState[t.id];
    const gains = offseasonGrowth(
      prog, squadFor(prev, t.id), (a) => moraleOf(old, a), seasonRng(state, 'offseason', t.id), programXp(prev, t.id),
      (id) => joinYear(id) === state.year,
    );
    if (t.id !== user) continue;
    for (const g of gains.filter((x) => x.to > x.from).sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, OFFSEASON_NEWS)) {
      state.news.push({
        week: 0, kind: 'progress', teams: [user],
        text: `OFFSEASON: ${athleteName(g.athlete)} (${g.athlete.pos}) comes out of the offseason up ${g.to - g.from} to ${g.to} overall`,
      });
    }
  }
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
  /** Records the user's simulated game drive by drive, for its highlights. */
  userStory?: GameStory;
  /** The user's simulated game's snaps by story play (`record`: on tape), for watching it. */
  userWatch?: { snaps: SnapWatch; record: boolean };
  plans: Map<string, GamePlan>;
  /** Weekly emphases by team: only the user's staff picks any so far (CPU staffs stay on standard). */
  emph: Map<string, TeamMods>;
  /** Each game's drives and the squads that played it, for the progress step. */
  played: Map<string, { drives: DriveLog[]; home: Squad; away: Squad; neutral: boolean }>;
  /** Each game's grades, by game id, from the progress step: injuries read the snaps and hits. */
  grades: Map<string, Map<string, GameGrade>>;
  /** What the steps did this week, for the moments (season/moments.ts). */
  events: WeekEvents;
}

type WeekStep = (state: SeasonState, ctx: WeekContext) => void;

/** Prep: depth charts and game plans. Staff handle every CPU team and whatever the user delegated. */
const prep: WeekStep = (state, ctx) => {
  const user = state.config.userTeamId;
  if (state.config.delegate.depthChart && state.teamState[user]?.depth) delete state.teamState[user].depth;
  for (const g of gamesInWeek(state, ctx.week)) {
    for (const [id, opp] of [[g.home, g.away], [g.away, g.home]]) {
      const own = id === user && !state.config.delegate.gamePlan ? state.teamState[user]?.plan : undefined;
      ctx.plans.set(id, own ?? autoGamePlan(squadFor(state, id), squadFor(state, opp), staffFor(state, id).OC));
    }
  }
  const mods = emphasisMods(staffFor(state, user), state.teamState[user]?.emph);
  if (mods) ctx.emph.set(user, mods);
};

/**
 * A team in the user's engine game: its staff in the chair and plan; the CPU's DC plays the DEFENSE IQ
 * setting and the disguises setting, with the user's film as his prior; the user's DC is himself.
 */
export function engineTeam(state: SeasonState, id: string, squad: Squad, plan: GamePlan): EngineTeamIn {
  const user = id === state.config.userTeamId;
  const st = staffFor(state, id);
  return {
    squad, oc: st.OC, dc: st.DC, passShare: plan.passShare,
    ...(user ? { film: state.teamState[id]?.film } : { iq: state.config.defIq ?? 'NORMAL', disguises: state.config.disguises !== false }),
  };
}

/** Play: the user's game takes its live result, or is played through the engine; every other game is simulated. */
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
    } else if (g.home === user || g.away === user) {
      // The user's game is played through the engine, both sides (docs/ENGINEDRIVES.md, phase 4).
      const w = ctx.userWatch;
      g.result = engineGame(engineTeam(state, g.home, home, ctx.plans.get(g.home)!), engineTeam(state, g.away, away, ctx.plans.get(g.away)!), rng, {
        drives, story: ctx.userStory, watch: w?.snaps, record: w?.record,
      });
    } else {
      g.result = simGame(home, away, rng, { neutral: g.neutral, plans: { home: ctx.plans.get(g.home)!, away: ctx.plans.get(g.away)! }, drives, emph });
    }
    ctx.played.set(g.id, { drives, home, away, neutral: g.neutral });
    // Wins over the pregame odds, for the staffs' scouting growth.
    const odds = winOdds(home, away, g.neutral);
    const homeWon = g.result.home > g.result.away ? 1 : 0;
    for (const [t, x] of [[g.home, homeWon - odds], [g.away, odds - homeWon]] as const) {
      const ts = (state.teamState[t] ??= {});
      ts.xw = Math.round(((ts.xw ?? 0) + x) * 1000) / 1000;
    }
  }
};

/** Breakouts on other teams that make the news each week. */
const BREAKOUT_NEWS = 2;

/** How the news says why the next man is up. */
const SPARK_TEXT: Record<SparkReason, string> = { injured: 'the injured', slumping: 'a slumping', outplayed: 'an outplayed' };

/**
 * Progress: every player who played earns XP from his game grades and may level up
 * (season/progression.ts), then the whole roster's morale moves (season/morale.ts) and confidence moves, new starters spark and breakouts land
 * (season/confidence.ts). Breakthroughs and breakouts on the user's team make the news, plus a few
 * breakouts elsewhere; so does the user's next man up.
 */
const progress: WeekStep = (state, ctx) => {
  const user = state.config.userTeamId;
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
      const events = progressTeam(ts, sq, grades, ctx.week, seasonRng(state, 'progress', t, ctx.week), focus, programXp(state, t));
      if (events.length) ts.lu = (ts.lu ?? 0) + events.length;
      // The staff's work this season (season/coaching.ts): level-ups by group, games on an emphasis.
      for (const e of events) {
        const g = groupOf(e.athlete.pos);
        (ts.lug ??= {})[g] = (ts.lug[g] ?? 0) + 1;
      }
      for (const [g, pick] of Object.entries(focus?.picks ?? {}) as [Group, string][]) {
        if (pick !== STANDARD) (ts.eg ??= {})[g] = (ts.eg[g] ?? 0) + 1;
      }
      if (t === user) {
        for (const e of events) if (e.big) told(e);
        ctx.events.levelUps.push(...events);
      }
      // Morale first: it reads last game's starters, which the confidence step moves on.
      moraleStep(state, ts, sq, seasonRng(state, 'morale', t, ctx.week));
      const bases = new Map(baseRoster(state, t).map((a) => [a.id, generatedAthlete(a.id) ?? a]));
      // What the game looked like: the box score, and the result against the pregame odds.
      const game = state.games.find((x) => x.id === id);
      const won = game?.result ? (game.result.home === game.result.away ? 0.5 : (game.result.home > game.result.away) === (t === game.home) ? 1 : 0) : undefined;
      const odds = winOdds(home, away, neutral);
      const seen = game?.result && won !== undefined
        ? { lines: new Map(game.result.box.players.filter((l) => l.team === t).map((l) => [l.id, l])), edge: won - (t === game.home ? odds : 1 - odds) }
        : undefined;
      const conf = confidenceStep(state, ts, sq, grades, bases, ctx.week, seasonRng(state, 'confidence', t, ctx.week), seen);
      ctx.events.sparks.push(...conf.sparks);
      ctx.events.breakouts.push(...conf.breakouts);
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
  for (const e of breakouts.sort((a, b) => Number(!!b.athlete.real) - Number(!!a.athlete.real)).slice(0, BREAKOUT_NEWS)) toldBreakout(e);
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

/** Recruiting (season/recruiting.ts): contacts, this week's official visitors, offers, commits and flips; the early signing period at week 15. */
const recruit: WeekStep = (state, ctx) => {
  recruitWeek(state, ctx.week);
};

/** Story: games, starts and this week's moments go into each player's career (season/career.ts). */
const story: WeekStep = (state, ctx) => {
  storyWeek(state, ctx.week, ctx.grades.values());
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
    ctx.events.selection = true;
    state.phase = 'postseason';
  } else if (state.phase === 'postseason') {
    recordBracket(state);
    const champ = state.bracket?.champion;
    if (champ) {
      state.phase = 'complete';
      state.news.push({ week, kind: 'postseason', teams: [champ], text: `${teamById(champ).school} wins the ${state.year} national championship` });
      const heisman = state.awards.find((a) => a.id === 'heisman')?.finalists[0];
      state.history.push({
        year: state.year, champion: champ, heisman: heisman?.name, heismanTeam: heisman?.team,
        ...yearRecord(state), teams: seasonRows(state),
      });
      archiveSeason(state);
      archiveCoaches(state);
      if (state.config.coachCareer) state.news.push(...evaluateCoach(state));
    } else if (bracketRoundDone(state)) {
      state.games.push(...bracketGames(state, week + 1));
    }
  }
};

/** The coach's office (season/achievements.ts): what this week's games earned, and the season's end. Display only. */
const office: WeekStep = (state, ctx) => {
  checkOffice(state, 'game', ctx.week);
  if (state.phase === 'complete') checkOffice(state, 'season', ctx.week);
};

/**
 * Story (display only, no randomness): the user's storylines open, move and close (season/storylines.ts),
 * then the week's moments for the Week Wrap (season/moments.ts). Last, so they see everything the week did.
 */
const moments: WeekStep = (state, ctx) => {
  const beats = storyStep(state, ctx.week, ctx.events);
  (state.moments ??= []).push(...mergeWeek([...weekMoments(state, ctx.week, ctx.events), ...beats], state.stories));
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
  { name: 'recruit', run: recruit },
  { name: 'news', run: news },
  { name: 'transition', run: transition },
  { name: 'office', run: office },
  { name: 'moments', run: moments },
];

/**
 * Play out the current week: the user's game with `userResult` (and its drives, for progression) if
 * they played it on the field, everything else simulated. Does nothing once the season is complete.
 * The user's weekly emphases are spent: every week starts on standard. A simulated user game is played
 * through the engine (`engineGame`) and fills `userStory` (season/story.ts) and `userWatch` (its snaps,
 * on tape when asked) as it goes; that only watches, so the week plays the same without them.
 */
export function advanceWeek(
  state: SeasonState, userResult?: GameResult, userDrives?: DriveLog[], userStory?: GameStory, userWatch?: WeekContext['userWatch'],
): void {
  if (seasonOver(state)) return;
  const ctx: WeekContext = { week: state.week, userResult, userDrives, userStory, userWatch, plans: new Map(), emph: new Map(), played: new Map(), grades: new Map(), events: emptyEvents() };
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
 * An open-ended season rolls into the next year. Players keep their progression, and after a real
 * offseason they grow (`growOffseason`); class years follow from the year (season/classes.ts).
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
      return `OFFSEASON: ${({ carousel: 'CAROUSEL', departures: 'DEPARTURES', signing: 'SIGNING DAY', portal: 'PORTAL' } as const)[state.offseason?.stage ?? 'portal']}`;
    default:
      return 'SEASON OVER';
  }
}
