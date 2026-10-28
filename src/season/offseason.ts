import { TEAMS } from '../data/teams';
import { nextSeason } from './season';
import { autoPortal, closePortal, coachesWork, decide, judgePromises, leavingList, listCuts, newPortal, rollEntries } from './portal';
import type { NewsItem, OffseasonStage, SeasonState } from './types';

/**
 * The offseason, between a complete season and the next (open-ended seasons only). Its stages run in
 * order; graduation, the NFL draft, signing day and offseason growth go before the portal later, so the
 * portal reads next year's depth chart. See docs/PORTAL.md.
 */
export const OFFSEASON_STAGES: OffseasonStage[] = ['portal'];

/** The portal's last round: advancing it closes the portal. */
export const LAST_ROUND = 2;

/** Into the offseason: last season's promises are judged, then the portal opens on the leaving list. */
export function startOffseason(state: SeasonState): void {
  if (state.phase !== 'complete' || state.config.length !== 'open') return;
  state.phase = 'offseason';
  state.offseason = { stage: OFFSEASON_STAGES[0], round: 0, promises: judgePromises(state) };
  state.portal = newPortal();
  if (!state.config.delegate.portal) state.portal.leaving = leavingList(state, state.config.userTeamId);
}

/**
 * Advance the offseason one step. Round 0: entries roll and the position coaches work the board.
 * Rounds 1 and 2: the CPU staffs (and a delegated user) pursue, the coaches keep working, and players
 * decide. After the last round the portal closes and the next season starts: that state is returned.
 */
export function advanceOffseason(state: SeasonState): SeasonState {
  const os = state.offseason;
  if (state.phase !== 'offseason' || !os || !state.portal) return state;
  const user = state.config.userTeamId;
  if (os.round === 0) {
    rollEntries(state);
    coachesWork(state, 1);
    os.round = 1;
    return state;
  }
  const cuts = listCuts(state);
  for (const t of TEAMS) if (t.id !== user || state.config.delegate.portal) autoPortal(state, t.id, cuts);
  if (os.round < LAST_ROUND) coachesWork(state, os.round + 1);
  decide(state, os.round);
  state.portal.spent = {};
  if (os.round < LAST_ROUND) {
    os.round++;
    return state;
  }
  closePortal(state);
  const next = nextSeason(state);
  // The user's portal stories open the new year's news.
  const mine: NewsItem[] = state.news.filter((n) => n.kind === 'portal' && n.teams.includes(user)).map((n) => ({ ...n, week: 0 }));
  next.news.push(...mine);
  return next;
}

/** Run a whole offseason with every side automated (for the season report and tests). */
export function simOffseason(state: SeasonState): SeasonState {
  startOffseason(state);
  let s = state;
  while (s.phase === 'offseason') s = advanceOffseason(s);
  return s;
}
