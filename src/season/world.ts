import { buildDepth, buildSquad, type Squad } from '../data/depth';
import { teamById } from '../data/teams';
import { hashString, mulberry32, type Rng } from '../engine/math';
import { applyDelta } from './progression';
import type { SeasonState } from './types';

/** A random stream for one thing in one season, so results don't depend on the order things are simulated in. */
export function seasonRng(state: Pick<SeasonState, 'seed' | 'year'>, ...parts: (string | number)[]): Rng {
  return mulberry32(hashString([state.seed, state.year, ...parts].join(':')));
}

/**
 * A team's squad this season: the generated roster (shared and never mutated) with this season's
 * progression, injuries and depth chart laid over it. Once anyone has progressed, the staff chart is
 * rebuilt from the new ratings, so a player who passes a teammate moves up.
 */
export function squadFor(state: SeasonState, teamId: string): Squad {
  const base = buildSquad(teamById(teamId));
  const ts = state.teamState[teamId];
  if (!ts) return base;
  const inj = ts.injuries ?? {};
  const prog = ts.progress ?? {};
  let levels = 0;
  for (const p of Object.values(prog)) levels += p.lvl;
  const key = `${levels}|${JSON.stringify(inj)}`;
  const hit = cache.get(ts);
  if (hit && hit.key === key && hit.depth === ts.depth) return hit.squad;
  const athletes = levels || Object.keys(inj).length
    ? base.athletes.map((a) => {
      const d = prog[a.id]?.lvl ? prog[a.id].d : undefined;
      const w = inj[a.id];
      if (!w && !d) return a;
      return { ...a, ...(d ? { r: applyDelta(a.r, d) } : {}), ...(w ? { injury: { weeks: w } } : {}) };
    })
    : base.athletes;
  const squad = { team: base.team, athletes, depth: ts.depth ?? (levels ? buildDepth(athletes) : base.depth) };
  cache.set(ts, { key, depth: ts.depth, squad });
  return squad;
}

/**
 * Squads by team state, rebuilt when what shapes them changes: level-ups (ratings only change on a
 * level-up), injuries, or the user's depth chart. Callers treat squads as read-only.
 */
const cache = new WeakMap<object, { key: string; depth: unknown; squad: Squad }>();
