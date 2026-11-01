import { TEAMS } from '../data/teams';
import { nextSeason } from './season';
import { carouselRound, openCarousel } from './carousel';
import { openDepartures, runDepartures } from './departures';
import { autoPortal, closePortal, coachesWork, decide, judgePromises, leavingList, listCuts, newPortal, rollEntries } from './portal';
import type { NewsItem, OffseasonStage, SeasonState } from './types';

/**
 * The offseason, between a complete season and the next (open-ended seasons only). Its stages run in
 * order: the coaching carousel (season/carousel.ts), then departures (season/departures.ts: redshirts,
 * graduation, early declarations and the NFL draft), then the transfer portal, so a player can react to
 * a coach leaving and the portal reads next year's depth chart. Signing day goes before the portal
 * later; offseason growth runs as the next season opens. See docs/PORTAL.md and docs/RECRUITING_PLAN.md.
 */
export const OFFSEASON_STAGES: OffseasonStage[] = ['carousel', 'departures', 'portal'];

/** The portal's last round: advancing it closes the portal. */
export const LAST_ROUND = 2;

/** Into the offseason: last season's promises are judged, then the coaching carousel opens. */
export function startOffseason(state: SeasonState): void {
  if (state.phase !== 'complete' || state.config.length !== 'open') return;
  state.phase = 'offseason';
  state.offseason = { stage: OFFSEASON_STAGES[0], round: 1, promises: judgePromises(state) };
  openCarousel(state);
}

/** The portal opens on the leaving list. */
function openPortal(state: SeasonState): void {
  state.portal = newPortal();
  if (!state.config.delegate.portal) state.portal.leaving = leavingList(state, state.config.userTeamId);
}

/**
 * Advance the offseason one step. In the carousel, a hiring round; after its last, departures open on
 * the declare watch. Departures: round 0 runs the stage, round 1 (who left) opens the portal.
 * In the portal, round 0: entries roll and the position coaches work the board. Rounds 1 and 2: the CPU
 * staffs (and a delegated user) pursue, the coaches keep working, and players decide. After the last
 * round the portal closes and the next season starts: that state is returned.
 */
export function advanceOffseason(state: SeasonState): SeasonState {
  const os = state.offseason;
  if (state.phase !== 'offseason' || !os) return state;
  if (os.stage === 'carousel') {
    carouselRound(state);
    if (state.offseason!.stage === 'departures') openDepartures(state);
    return state;
  }
  if (os.stage === 'departures') {
    if (os.round === 0) {
      runDepartures(state);
      os.round = 1;
    } else {
      os.stage = 'portal';
      os.round = 0;
      openPortal(state);
    }
    return state;
  }
  if (!state.portal) return state;
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
  // The coaching changes and the user's portal stories open the new year's news.
  const mine: NewsItem[] = state.news
    .filter((n) => n.kind === 'carousel' || n.kind === 'draft' || (n.kind === 'portal' && n.teams.includes(user)))
    .map((n) => ({ ...n, week: 0 }));
  next.news.push(...mine);
  return next;
}

/**
 * Into the offseason and through the carousel and departures (the user's side handled as the staff
 * would), to the portal.
 */
export function startToPortal(state: SeasonState): void {
  startOffseason(state);
  const own = { carousel: state.config.delegate.carousel, departures: state.config.delegate.departures };
  Object.assign(state.config.delegate, { carousel: true, departures: true });
  while (state.phase === 'offseason' && state.offseason?.stage !== 'portal') advanceOffseason(state);
  Object.assign(state.config.delegate, own);
}

/** Run a whole offseason with every side automated (for the season report and tests). */
export function simOffseason(state: SeasonState): SeasonState {
  startOffseason(state);
  let s = state;
  while (s.phase === 'offseason') s = advanceOffseason(s);
  return s;
}
