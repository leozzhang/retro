import { teamById } from '../data/teams';
import { clamp } from '../engine/math';
import { records } from './standings';
import type { CoachState, NewsItem, SeasonState } from './types';

/**
 * Coach career (only when `config.coachCareer` is on). For now, job security moves with wins against
 * what the program expects. Firing, the hot seat's consequences and job offers come later.
 */

export const START_SECURITY = 60;
/** Security per win above or below expectations. */
const SECURITY_PER_WIN = 6;
export const HOT_SEAT = 25;

/** Wins a program expects in a 12-game season, from its prestige. */
export function expectedWins(teamId: string): number {
  return 3 + (teamById(teamId).profile.prestige / 100) * 7;
}

export function newCoach(teamId: string): CoachState {
  return { teamId, security: START_SECURITY, seasons: 0 };
}

/** End-of-season review. Returns news for the feed. */
export function evaluateCoach(state: SeasonState): NewsItem[] {
  const c = state.coach;
  if (!c) return [];
  const r = records(state).get(c.teamId)!;
  c.security = clamp(Math.round(c.security + (r.w - expectedWins(c.teamId)) * SECURITY_PER_WIN), 0, 100);
  c.seasons++;
  const school = teamById(c.teamId).school;
  const text = c.security < HOT_SEAT
    ? `${school}'s coach is on the hot seat after a ${r.w}-${r.l} season`
    : `${school} administration reviews the season: job security ${c.security}`;
  return [{ week: state.week, kind: 'coach', text, teams: [c.teamId] }];
}
