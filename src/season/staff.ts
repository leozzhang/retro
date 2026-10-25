import { buildDepth, type DepthChart, type Squad } from '../data/depth';
import type { SeasonState } from './types';

/**
 * Staff automation: each management system has an `auto*` version that the CPU teams always use and
 * the user gets when that system is delegated. Everything must stay playable with all of it automated.
 */

/** How a team wants to play this week. The sim reads it; the user's game plan screen will edit it. */
export interface GamePlan {
  /** Share of plays that are passes, 0..1. */
  passShare: number;
}

const SCHEME_PASS: Record<string, number> = { 'air-raid': 0.62, spread: 0.54, pro: 0.5, 'power-run': 0.4, option: 0.3 };

/** The coordinators' plan: the program's scheme. Opponent-specific adjustments go here later. */
export function autoGamePlan(squad: Squad, _opponent: Squad): GamePlan {
  return { passShare: SCHEME_PASS[squad.team.profile.offense.scheme] ?? 0.5 };
}

/** The position coaches' depth chart: best fit at each slot (injured players are skipped at game time by `starters`). */
export function autoDepthChart(squad: Squad): DepthChart {
  return buildDepth(squad.athletes);
}

/** The user's own depth chart. It takes the job from the staff until the user hands it back. */
export function setUserDepth(state: SeasonState, depth: DepthChart): void {
  const u = state.config.userTeamId;
  (state.teamState[u] ??= {}).depth = depth;
  state.config.delegate.depthChart = false;
}

/** Hand the depth chart back to the staff: their chart from now on. */
export function useStaffDepth(state: SeasonState): void {
  delete state.teamState[state.config.userTeamId]?.depth;
  state.config.delegate.depthChart = true;
}
