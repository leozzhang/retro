import { TEAMS } from '../data/teams';
import { checkOffice } from './achievements';
import { nextSeason } from './season';
import { carouselRound, openCarousel } from './carousel';
import { openDepartures, runDepartures } from './departures';
import { joinRosters, openSigning, recruitsReact, runSigningDay } from './recruiting';
import { autoPortal, closePortal, coachesWork, decide, judgePromises, leavingList, listCuts, newPortal, overCap, refillFreshmen, rollEntries } from './portal';
import type { NewsItem, OffseasonStage, SeasonState } from './types';
import { stageMoments, userCards } from './offseasonMoments';

/**
 * The offseason, between a complete season and the next (open-ended seasons only). Its stages run in
 * the real calendar's order: the coaching carousel (season/carousel.ts), then departures
 * (season/departures.ts: redshirts, graduation, early declarations and the NFL draft), then the
 * transfer portal, then national signing day (season/recruiting.ts). A player can react to a coach
 * leaving; the portal reads next year's depth chart with the early signees on it, and their open
 * commits holding spots; signing day fills what the portal left. Offseason growth runs as the next
 * season opens. See docs/PORTAL.md and docs/RECRUITING.md.
 */
export const OFFSEASON_STAGES: OffseasonStage[] = ['carousel', 'departures', 'portal', 'signing'];

/** The portal's last round: advancing it closes the portal. */
export const LAST_ROUND = 2;

/** Into the offseason: last season's promises are judged, then the coaching carousel opens. */
export function startOffseason(state: SeasonState): void {
  if (state.phase !== 'complete' || state.config.length !== 'open') return;
  state.phase = 'offseason';
  state.offseason = { stage: OFFSEASON_STAGES[0], round: 1, promises: judgePromises(state) };
  openCarousel(state);
}

/**
 * The portal opens on the leaving list. The early signees join their rosters first, so the portal reads
 * them on the chart; a roster they put over the cap sends its lowest players.
 */
function openPortal(state: SeasonState): void {
  joinRosters(state);
  state.portal = newPortal();
  state.portal.forced = overCap(state);
  if (!state.config.delegate.portal) state.portal.leaving = leavingList(state, state.config.userTeamId);
}

/**
 * Advance the offseason one step. In the carousel, a hiring round; after its last, recruits react to
 * the coaching changes and departures open on the declare watch. Departures: round 0 runs the stage,
 * round 1 (who left) opens the portal.
 * In the portal, round 0: entries roll and the position coaches work the board. Rounds 1 and 2: the CPU
 * staffs (and a delegated user) pursue, the coaches keep working, and players decide. After the last
 * round the portal closes and signing day opens. Signing: round 0 runs national signing day; round 1
 * (the class) fills the rosters and the next season starts: that state is returned.
 */
export function advanceOffseason(state: SeasonState): SeasonState {
  if (migrateOffseason(state)) return state;
  const os = state.offseason;
  if (state.phase !== 'offseason' || !os) return state;
  if (os.stage === 'carousel') {
    carouselRound(state);
    if (state.offseason!.stage === 'departures') {
      checkOffice(state, 'carousel');
      recruitsReact(state);
      openDepartures(state);
      stageMoments(state, 'carousel');
    }
    return state;
  }
  if (os.stage === 'departures') {
    if (os.round === 0) {
      const cards = userCards(state);
      runDepartures(state);
      checkOffice(state, 'draft');
      stageMoments(state, 'departures', cards);
      os.round = 1;
    } else {
      os.stage = 'portal';
      os.round = 0;
      openPortal(state);
    }
    return state;
  }
  if (os.stage === 'signing') {
    if (os.round === 0) {
      runSigningDay(state);
      checkOffice(state, 'signing');
      stageMoments(state, 'signing');
      os.round = 1;
      return state;
    }
    return toNextSeason(state);
  }
  if (!state.portal) return state;
  const user = state.config.userTeamId;
  if (os.round === 0) {
    rollEntries(state);
    coachesWork(state, 1);
    stageMoments(state, 'portal');
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
  // An old save that signed its class before the portal (the old order) goes straight on.
  if (state.recruiting?.gone) return toNextSeason(state);
  os.stage = 'signing';
  os.round = 0;
  openSigning(state);
  return state;
}

/** Placeholder freshmen fill what signing day left, and the next season starts. */
function toNextSeason(state: SeasonState): SeasonState {
  const user = state.config.userTeamId;
  refillFreshmen(state);
  const next = nextSeason(state);
  // The coaching changes, the draft, signing day and the user's portal stories open the new year's news.
  const mine: NewsItem[] = state.news
    .filter((n) => n.kind === 'carousel' || n.kind === 'draft' || (n.kind === 'portal' && n.teams.includes(user)) || (n.kind === 'recruiting' && n.teams.includes(user) && n.week === state.week))
    .map((n) => ({ ...n, week: 0 }));
  next.news.push(...mine);
  return next;
}

/**
 * A save from before the portal moved ahead of signing day, sitting at signing day with no portal
 * yet: the portal opens first (its class, if signed already, is on the rosters; the portal's close
 * then goes straight to the next season).
 */
export function migrateOffseason(state: SeasonState): boolean {
  const os = state.offseason;
  if (state.phase !== 'offseason' || os?.stage !== 'signing' || state.portal) return false;
  os.stage = 'portal';
  os.round = 0;
  openPortal(state);
  return true;
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
