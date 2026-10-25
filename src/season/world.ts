import { buildSquad, type Squad } from '../data/depth';
import { teamById } from '../data/teams';
import { hashString, mulberry32, type Rng } from '../engine/math';
import type { SeasonState } from './types';

/** A random stream for one thing in one season, so results don't depend on the order things are simulated in. */
export function seasonRng(state: Pick<SeasonState, 'seed' | 'year'>, ...parts: (string | number)[]): Rng {
  return mulberry32(hashString([state.seed, state.year, ...parts].join(':')));
}

/**
 * A team's squad this season: the generated roster (shared and never mutated) with this season's
 * injuries and depth chart laid over it.
 */
export function squadFor(state: SeasonState, teamId: string): Squad {
  const base = buildSquad(teamById(teamId));
  const ts = state.teamState[teamId];
  if (!ts) return base;
  const inj = ts.injuries ?? {};
  const hurt = Object.keys(inj).length > 0;
  return {
    team: base.team,
    athletes: hurt ? base.athletes.map((a) => (inj[a.id] ? { ...a, injury: { weeks: inj[a.id] } } : a)) : base.athletes,
    depth: ts.depth ?? base.depth,
  };
}
