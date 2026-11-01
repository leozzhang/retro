import { applyCoachDelta, buildHeadCoach, buildStaff, COACH_ROLES, coachAs, GA, GROUPS, type Coach, type HeadCoach, type Staff } from '../data/coaches';
import { CALENDAR } from '../data/season/calendar';
import type { Athlete } from '../data/athletes';
import { buildDepth, buildSquad, generatedAthlete, type Squad } from '../data/depth';
import { teamById } from '../data/teams';
import { clamp, hashString, mulberry32, type Rng } from '../engine/math';
import { CONFIDENCE, confOf, newStarters } from './confidence';
import { applyDelta } from './progression';
import { withClass } from './classes';
import type { SeasonState, TeamState } from './types';

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
  const base = baseSquad(state, teamId);
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
  const key = `${levels}|${JSON.stringify(inj)}|${JSON.stringify(hp)}|${form}|${JSON.stringify(ts.st ?? null)}|${ts.gp ?? 0}|${(state.injuryLog ?? []).length}|${rosterKey(ts)}`;
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
 * A team's roster this season before anything is laid over it: the generated roster, less the players
 * who left, plus the ones who joined (each rebuilt from the roster he was generated on, in his new
 * jersey), each in his class this season (season/classes.ts). With no changes it's the generated roster itself.
 */
export function baseRoster(state: SeasonState, teamId: string): Athlete[] {
  return baseSquad(state, teamId).athletes;
}

/** `baseRoster` as a squad, with the staff chart built for it. */
export function baseSquad(state: SeasonState, teamId: string): Squad {
  const gen = buildSquad(teamById(teamId));
  const ts = state.teamState[teamId];
  const r = ts?.roster;
  const moved = !!(r && (r.out?.length || r.in?.length));
  const rs = redshirts(ts, state.year);
  if (!moved && state.year === CALENDAR.year && !rs.size) return gen;
  const key = `${state.year}|${rosterKey(ts)}|${[...rs].join(',')}`;
  const hit = rosterCache.get(teamId);
  if (hit?.key === key) return hit.squad;
  const out = new Set(r?.out);
  const athletes = gen.athletes.filter((a) => !out.has(a.id));
  for (const e of r?.in ?? []) {
    const a = generatedAthlete(e.id);
    if (a) athletes.push({ ...a, num: e.num });
  }
  const now = athletes.map((a) => withClass(a, state.year, rs.get(a.id)));
  const squad = { team: gen.team, athletes: now, depth: buildDepth(now) };
  rosterCache.set(teamId, { key, squad });
  return squad;
}

/** The roster's redshirt seasons by id (`Progress.rs`), for the ones already taken by season `year`. */
function redshirts(ts: TeamState | undefined, year: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, p] of Object.entries(ts?.progress ?? {})) if (p.rs !== undefined && p.rs < year) out.set(id, p.rs);
  return out;
}

function rosterKey(ts: { roster?: unknown } | undefined): string {
  return ts?.roster ? JSON.stringify(ts.roster) : '';
}

const rosterCache = new Map<string, { key: string; squad: Squad }>();

/**
 * A team's coaching staff this season: the generated staff (data/coaches.ts) with the carousel's
 * changes laid over it, the way `squadFor` does for rosters. Each chair holds its generated coach unless
 * `TeamState.staff` seats someone else; every coach carries his rating changes (`SeasonState.coaches`)
 * and ages a year a season. With no changes it's the generated staff itself.
 */
export function staffFor(state: SeasonState, teamId: string): Staff {
  const gen = buildStaff(teamById(teamId));
  const seats = state.teamState[teamId]?.staff;
  const years = state.year - CALENDAR.year;
  const ids = COACH_ROLES.map((role) => seats?.[role] ?? gen[role].id);
  const deltas = ids.map((id) => state.coaches?.[id]?.d);
  if (!seats && !years && deltas.every((d) => !d)) return gen;
  const key = `${years}|${ids.join(',')}|${JSON.stringify(deltas)}`;
  const hit = staffCache.get(teamId);
  if (hit?.key === key) return hit.staff;
  const staff = {} as Staff;
  COACH_ROLES.forEach((role, i) => {
    const c = (coachAs(ids[i], role) as Coach | undefined) ?? gen[role];
    staff[role] = { ...c, role, ...(role === 'DC' ? { style: c.style ?? gen.DC.style } : {}), age: c.age + state.year - (c.from ?? CALENDAR.year), r: applyCoachDelta(c.r, deltas[i]) };
  });
  staffCache.set(teamId, { key, staff });
  return staff;
}

const staffCache = new Map<string, { key: string; staff: Staff }>();

/** The program's graduate assistants: its own list, or the generated pair who joined before the first season. */
export function gasFor(state: SeasonState, teamId: string): string[] {
  return state.teamState[teamId]?.ga ?? Array.from({ length: GA.slots }, (_, n) => {
    const g = GROUPS[hashString(`ga:${teamId}:${n}`) % GROUPS.length];
    return `${teamId}-${g.toLowerCase()}.${CALENDAR.year - 1}.ga${n}`;
  });
}

/** The program's head coach this season: its `HC` chair (or the generated one) with his changes, his age this year. */
export function headCoachFor(state: SeasonState, teamId: string): HeadCoach {
  const id = state.teamState[teamId]?.staff?.HC;
  const c = (id && (coachAs(id, 'HC') as HeadCoach | undefined)) || buildHeadCoach(teamById(teamId));
  return { ...c, age: c.age + state.year - (c.from ?? CALENDAR.year), r: applyCoachDelta(c.r, state.coaches?.[c.id]?.d) };
}

/**
 * Squads by team state, rebuilt when what shapes them changes: level-ups (ratings only change on a
 * level-up), confidence, injuries, health, last game's starters, or the user's depth chart. Callers
 * treat squads as read-only.
 */
const cache = new WeakMap<object, { key: string; depth: unknown; squad: Squad }>();
