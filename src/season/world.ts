import { buildStaff, type Staff } from '../data/coaches';
import { buildDepth, buildSquad, type Squad } from '../data/depth';
import { teamById } from '../data/teams';
import { clamp, hashString, mulberry32, type Rng } from '../engine/math';
import { CONFIDENCE, confOf, newStarters } from './confidence';
import { applyDelta } from './progression';
import type { SeasonState } from './types';

/** A random stream for one thing in one season, so results don't depend on the order things are simulated in. */
export function seasonRng(state: Pick<SeasonState, 'seed' | 'year'>, ...parts: (string | number)[]): Rng {
  return mulberry32(hashString([state.seed, state.year, ...parts].join(':')));
}

/**
 * A team's squad this season: the generated roster (shared and never mutated) with this season's
 * progression, confidence, injuries, health and depth chart laid over it. Once anyone has progressed,
 * is banged up or has confidence, the staff chart is rebuilt (with last game's starters as incumbents),
 * so a player who passes a teammate moves up, a hurt one can rest and a slumping one can sit. A new
 * starter who earned the job carries his next-man-up spark (season/confidence.ts) into the game.
 */
export function squadFor(state: SeasonState, teamId: string): Squad {
  const base = buildSquad(teamById(teamId));
  const ts = state.teamState[teamId];
  if (!ts) return base;
  const inj = ts.injuries ?? {};
  const hp = ts.health ?? {};
  const prog = ts.progress ?? {};
  let levels = 0;
  let form = '';
  for (const [id, p] of Object.entries(prog)) {
    levels += p.lvl;
    if (p.c || p.sp || p.bh || p.dev || p.pot) form += `${id}:${p.c ?? 0}:${p.sp ?? 0}:${p.bh ?? 0}:${p.dev ?? ''}:${p.pot ?? 0},`;
  }
  const key = `${levels}|${JSON.stringify(inj)}|${JSON.stringify(hp)}|${form}|${JSON.stringify(ts.st ?? null)}|${ts.gp ?? 0}|${(state.injuryLog ?? []).length}`;
  const hit = cache.get(ts);
  if (hit && hit.key === key && hit.depth === ts.depth) return hit.squad;
  const hurt = Object.keys(hp).length > 0;
  const changed = levels || hurt || form || Object.keys(inj).length;
  let athletes = changed
    ? base.athletes.map((a) => {
      const p = prog[a.id];
      const d = p?.lvl ? p.d : undefined;
      const w = inj[a.id];
      const h = hp[a.id];
      const c = confOf(p);
      if (!w && !d && h === undefined && !c && !p?.dev && !p?.pot) return a;
      return {
        ...a,
        ...(d ? { r: applyDelta(a.r, d) } : {}),
        ...(w ? { injury: { ...w } } : {}),
        ...(h !== undefined ? { health: h } : {}),
        ...(c ? { conf: c } : {}),
        ...(p?.dev ? { dev: p.dev } : {}),
        ...(p?.pot ? { potential: a.potential + p.pot } : {}),
      };
    })
    : base.athletes;
  // The staff chart reads ratings, health and confidence, so it's rebuilt when any has changed.
  const depth = ts.depth ?? (levels || hurt || form ? buildDepth(athletes, ts.st) : base.depth);
  // Next man up: the spark is on the field from his first start. The chart is built without it.
  const sparked = new Set(newStarters(state, ts, { team: base.team, athletes, depth }).filter((f) => f.spark).map((f) => f.athlete.id));
  if (sparked.size) {
    athletes = athletes.map((a) => (sparked.has(a.id) ? { ...a, conf: clamp((a.conf ?? 0) + CONFIDENCE.spark, -1, 1) } : a));
  }
  const squad = { team: base.team, athletes, depth };
  cache.set(ts, { key, depth: ts.depth, squad });
  return squad;
}

/**
 * A team's coaching staff this season: the generated staff (data/coaches.ts). Hires, firings and the
 * coaching carousel will lay their changes over it here, the way `squadFor` does for rosters.
 */
export function staffFor(_state: SeasonState, teamId: string): Staff {
  return buildStaff(teamById(teamId));
}

/**
 * Squads by team state, rebuilt when what shapes them changes: level-ups (ratings only change on a
 * level-up), confidence, injuries, health, last game's starters, or the user's depth chart. Callers
 * treat squads as read-only.
 */
const cache = new WeakMap<object, { key: string; depth: unknown; squad: Squad }>();
