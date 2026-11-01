import {
  anyCoach, COACH_ROLES, coachAs, GROUPS, STAFF, type AnyRole, type Coach, type CoachRole, type Group, type HeadCoach, type RatingName,
  applyCoachDelta, parseCoachId,
} from '../data/coaches';
import { GROUP_POS } from '../data/emphasis';
import { prospect } from '../data/recruits';
import type { Position } from '../data/positions';
import { groupOf } from './emphasis';
import { TEAMS } from '../data/teams';
import { clamp, gauss, hashString, mulberry32 } from '../engine/math';
import { records } from './standings';
import type { CoachCareer, CoachProgress, SeasonState } from './types';
import { baseRoster, gasFor, headCoachFor, seasonRng, staffFor } from './world';
import { CALENDAR } from '../data/season/calendar';

/**
 * The league's coaches over time. A coach keeps his id (`<team>-<role>`, the staff he was generated
 * on, or an outside hire's `<team>-<role>.<year>.<n>`) for life; what has changed about him is in
 * `SeasonState.coaches` by that id, and which chair he sits in is in his team's `TeamState.staff`.
 * `staffFor` and `headCoachFor` (season/world.ts) lay both over the generated staffs. Growth and the
 * head coaches' effects are here; firings, retirements and hiring are the carousel (season/carousel.ts).
 * See docs/COACHES.md.
 */

export function coachCareerOf(state: SeasonState, id: string): CoachCareer | undefined {
  return state.coachCareers?.[id];
}

/** Every chair on a program's staff, the head coach's first. */
function seated(state: SeasonState, teamId: string): { role: AnyRole; c: Coach | HeadCoach }[] {
  const staff = staffFor(state, teamId);
  return [{ role: 'HC' as AnyRole, c: headCoachFor(state, teamId) as Coach | HeadCoach }, ...COACH_ROLES.map((role) => ({ role, c: staff[role] }))];
}

/**
 * The season is over: every coach on every staff gets a row with his chair, his ratings and the team's
 * record. Once a season. History only: nothing in the sim reads it.
 */
export function archiveCoaches(state: SeasonState): void {
  const rec = records(state);
  const careers = (state.coachCareers ??= {});
  for (const t of TEAMS) {
    const r = rec.get(t.id);
    for (const { role, c } of seated(state, t.id)) {
      const career = (careers[c.id] ??= { seasons: [] });
      if (career.seasons.some((x) => x.year === state.year)) continue;
      career.seasons.push({ year: state.year, team: t.id, role, r: { ...c.r }, w: r?.w ?? 0, l: r?.l ?? 0 });
    }
  }
}

/**
 * A coach's hidden arc, from his id: how fast he grows and how far. Young coaches lean riser, old
 * ones fading. Never shown; his career rows give it away.
 * - riser: grows a lot, to a high ceiling
 * - steady: grows a little
 * - plateau: flat from here (he looks like a hire and isn't)
 * - late: flat until a move or a few seasons in, then grows like a riser
 * - fading: slides, and ages faster
 */
export type Arc = 'riser' | 'steady' | 'plateau' | 'late' | 'fading';
export const ARCS: Arc[] = ['riser', 'steady', 'plateau', 'late', 'fading'];

/**
 * Offseason growth, per rating a year: `arc` × age × work, each tuned against the STAFF section of
 * `npm run season` (a league mean drift near 0, the tier gap steady).
 * - `odds`: arc odds for the youngest and oldest generated coach, blended by age
 * - `rate`: points a year from the arc; `bloom` a late bloomer's once bloomed, after `bloomAt` seasons
 *   or a move; `room` how far above his generated rating the arc can take him
 * - `age`: each rating's peak window. Below it he gains `rise` a year; past it he loses `fallBase` +
 *   `fall` a year past the window, up to `fallMax` (`fadeFall` times that for a fading coach). A head
 *   coach's develop ages like teach, his eval like scout
 * - work, as a z-score against the league (within ±`workCap`) times its weight: `teach` from his group's
 *   level-ups, `scout` from wins over the pregame odds, `recruit` from portal signings less misses;
 *   `game` is games on an emphasis over games played (only the user picks emphases). A head coach's
 *   develop works from the program's level-ups, his recruit from its signings. A coach hired this
 *   offseason did none of the season's work
 * - `comfort`: growth × `comfortRate` after this many seasons in one chair; a move restarts it with
 *   `fresh` points of growth
 * - `mentor`: up to this much faster under a coordinator 25 scout over his tier's mean, or slower under a
 *   weak one (against the tier, so mentoring doesn't widen the gap between tiers)
 * - `noise`: SD a year
 */
export const COACH_GROWTH = {
  odds: {
    young: { riser: 0.32, steady: 0.33, plateau: 0.15, late: 0.15, fading: 0.05 },
    old: { riser: 0.05, steady: 0.3, plateau: 0.25, late: 0.05, fading: 0.35 },
  } as Record<'young' | 'old', Record<Arc, number>>,
  rate: { riser: 1.4, steady: 0.3, plateau: 0, late: 0, fading: -0.5 } as Record<Arc, number>,
  bloom: 1.8,
  bloomAt: [2, 6] as [number, number],
  room: { riser: 20, steady: 8, plateau: 2, late: 16, fading: 2 } as Record<Arc, number>,
  age: {
    scout: [48, 68], teach: [40, 58], game: [44, 57], recruit: [34, 50], develop: [40, 58], eval: [48, 68],
  } as Record<RatingName, [number, number]>,
  rise: 0.3,
  fallBase: 0.3,
  fall: 0.06,
  fallMax: 1.5,
  fadeFall: 1.5,
  workCap: 2,
  work: { scout: 0.4, teach: 0.8, game: 1.5, recruit: 0.8, develop: 0.8, eval: 0 } as Record<RatingName, number>,
  comfort: 5,
  comfortRate: 0.5,
  fresh: 1,
  mentor: 0.15,
  noise: 0.7,
};

const G = COACH_GROWTH;

/** Seeded per coach: his arc, when a late bloomer blooms, and his seasons in his chair before the game began. */
export function coachTraits(id: string): { arc: Arc; bloomAt: number; tenure: number } {
  const rng = mulberry32(hashString(`arc:${id}`));
  const [a0, a1] = STAFF.age;
  const old = clamp((anyCoach(id)!.age - a0) / (a1 - a0), 0, 1);
  const odds = ARCS.map((a) => G.odds.young[a] * (1 - old) + G.odds.old[a] * old);
  let x = rng() * odds.reduce((s, v) => s + v, 0);
  let arc: Arc = 'steady';
  for (let i = 0; i < ARCS.length; i++) {
    if ((x -= odds[i]) < 0) {
      arc = ARCS[i];
      break;
    }
  }
  const bloomAt = G.bloomAt[0] + Math.floor(rng() * (G.bloomAt[1] - G.bloomAt[0] + 1));
  return { arc, bloomAt, tenure: Math.floor(rng() * 9) };
}

export const coachArc = (id: string): Arc => coachTraits(id).arc;

/** What a rating loses a year past his peak window (his gains below it are in the growth). */
function ageFall(k: RatingName, age: number, fading: boolean): number {
  const hi = G.age[k][1];
  return age <= hi ? 0 : Math.min(G.fallMax, G.fallBase + G.fall * (age - hi)) * (fading ? G.fadeFall : 1);
}

/** The coordinator over each position group: his mentor, for now. */
const MENTOR: Partial<Record<CoachRole, CoachRole>> = { QB: 'OC', RB: 'OC', WR: 'OC', TE: 'OC', OL: 'OC', DL: 'DC', LB: 'DC', DB: 'DC', ST: 'DC' };

/** Values as z-scores within ±`workCap` (0 when they don't vary). */
function zScores(xs: Map<string, number>): Map<string, number> {
  const v = [...xs.values()];
  const mean = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, v.length));
  return new Map([...xs].map(([k, x]) => [k, sd ? clamp((x - mean) / sd, -G.workCap, G.workCap) : 0]));
}

/**
 * The season's work, by `team:group` (`team` for scouting and the head coach): level-ups a player in
 * the group (or the program), wins over the pregame odds a game, and portal and HS signings less half
 * the misses (targets he built interest with who signed elsewhere; HS signings weighted by stars), each
 * against the league.
 */
function seasonWork(state: SeasonState) {
  const teach = new Map<string, number>();
  const recruit = new Map<string, number>();
  const scout = new Map<string, number>();
  const develop = new Map<string, number>();
  const signings = new Map<string, number>();
  for (const t of TEAMS) {
    const ts = state.teamState[t.id];
    const roster = baseRoster(state, t.id);
    scout.set(t.id, (ts?.xw ?? 0) / Math.max(1, ts?.gp ?? 0));
    develop.set(t.id, (ts?.lu ?? 0) / Math.max(1, roster.length));
    signings.set(t.id, 0);
    for (const g of GROUPS) {
      const n = roster.filter((a) => GROUP_POS[g].includes(a.pos)).length;
      teach.set(`${t.id}:${g}`, (ts?.lug?.[g] ?? 0) / Math.max(1, n));
      recruit.set(`${t.id}:${g}`, 0);
    }
  }
  const portal = state.portal;
  for (const e of portal?.entrants ?? []) {
    const to = portal!.commits[e.id];
    const g = GROUPS.find((x) => GROUP_POS[x].includes(e.pos))!;
    for (const [school, v] of Object.entries(portal!.interest[e.id] ?? {})) {
      if (school === e.from || !(v > 0)) continue;
      const x = to === school ? 1 : -0.5;
      recruit.set(`${school}:${g}`, recruit.get(`${school}:${g}`)! + x);
      signings.set(school, signings.get(school)! + x);
    }
  }
  // HS signings by stars, less half for targets the staff worked hard who signed elsewhere.
  const rs = state.recruiting;
  const worth = (stars: number) => 0.5 * (stars - 1);
  for (const [id, team] of Object.entries(rs?.signed ?? {})) {
    const p = prospect(id);
    if (!p) continue;
    const g = GROUPS.find((x) => GROUP_POS[x].includes(p.pos))!;
    recruit.set(`${team}:${g}`, recruit.get(`${team}:${g}`)! + worth(p.stars));
    signings.set(team, signings.get(team)! + worth(p.stars));
  }
  for (const [team, ids] of Object.entries(rs?.boards ?? {})) {
    for (const id of ids) {
      const to = rs!.signed[id];
      const p = prospect(id);
      if (!p || !to || to === team || (rs!.interest[id]?.[team] ?? 0) < 0.5) continue;
      const g = GROUPS.find((x) => GROUP_POS[x].includes(p.pos))!;
      recruit.set(`${team}:${g}`, recruit.get(`${team}:${g}`)! - worth(p.stars) / 2);
      signings.set(team, signings.get(team)! - worth(p.stars) / 2);
    }
  }
  // Teach is judged within each group: a QB room levels up at its own rate.
  const teachZ = new Map<string, number>();
  for (const g of GROUPS) {
    for (const [k, z] of zScores(new Map([...teach].filter(([k]) => k.endsWith(`:${g}`))))) teachZ.set(k, z);
  }
  return { teach: teachZ, recruit: zScores(recruit), scout: zScores(scout), develop: zScores(develop), signings: zScores(signings) };
}

/**
 * The offseason after `state`: every seated coach grows by arc × age × work (`COACH_GROWTH`). Returns
 * the next season's coach changes and leaves `state` as it was, so it's the same however often it runs.
 */
export function progressCoaches(state: SeasonState): Record<string, CoachProgress> {
  const out: Record<string, CoachProgress> = structuredClone(state.coaches ?? {});
  const work = seasonWork(state);
  const coordScout = new Map<number, number>();
  for (let tier = 1; tier <= 5; tier++) {
    const cs = TEAMS.filter((t) => t.profile.tier === tier).flatMap((t) => [staffFor(state, t.id).OC, staffFor(state, t.id).DC]);
    coordScout.set(tier, cs.reduce((a, c) => a + c.r.scout, 0) / cs.length);
  }
  for (const t of TEAMS) {
    const staff = staffFor(state, t.id);
    const mid = coordScout.get(t.profile.tier)!;
    const ts = state.teamState[t.id];
    const hc = headCoachFor(state, t.id);
    // The graduate assistants grow too, under the coach of the group they lean to (no work of their own).
    const gas = gasFor(state, t.id).map((id) => {
      const role = parseCoachId(id)!.role;
      const g = coachAs(id, role) as Coach;
      const c: Coach = { ...g, age: g.age + state.year - (g.from ?? CALENDAR.year), r: applyCoachDelta(g.r, state.coaches?.[id]?.d) };
      return { role, c, ga: true };
    });
    for (const { role, c, ga } of [...seated(state, t.id).map((x) => ({ ...x, ga: false })), ...gas]) {
      const p = (out[c.id] ??= {});
      const tr = coachTraits(c.id);
      const chair = ga ? `${t.id}:GA` : `${t.id}:${role}`;
      const moved = p.at !== undefined && p.at !== chair;
      p.t = moved ? 1 : (p.t ?? tr.tenure) + 1;
      p.at = chair;
      p.n = (p.n ?? 0) + 1;
      if (tr.arc === 'late' && !p.b && (moved || p.n >= tr.bloomAt)) p.b = 1;
      const mentorRole = role === 'HC' ? undefined : ga ? role : MENTOR[role as CoachRole];
      const mentor = mentorRole ? staff[mentorRole as CoachRole] : undefined;
      // His tree: everyone he has worked under, his coordinator (or position coach) and his head coach.
      for (const m of [mentor, role === 'HC' ? undefined : hc]) if (m && !p.under?.includes(m.id)) (p.under ??= []).push(m.id);

      const rate = tr.arc === 'late' && p.b ? G.bloom : G.rate[tr.arc];
      const boost = (p.t > G.comfort ? G.comfortRate : 1) * (1 + G.mentor * clamp(((mentor?.r.scout ?? mid) - mid) / 25, -1, 1));
      const base = coachAs(c.id, role)!.r as Partial<Record<RatingName, number>>;
      const age = c.age + 1;
      const rng = seasonRng(state, 'coach', c.id);
      const group = (GROUPS as AnyRole[]).includes(role) ? (role as Group) : undefined;
      const fresh = ga || p.hired === state.year;
      const workOf: Record<RatingName, number> = fresh ? { scout: 0, teach: 0, game: 0, recruit: 0, develop: 0, eval: 0 } : {
        scout: work.scout.get(t.id) ?? 0,
        teach: group ? work.teach.get(`${t.id}:${group}`) ?? 0 : 0,
        game: group ? Math.min(1, (ts?.eg?.[group] ?? 0) / Math.max(1, ts?.gp ?? 0)) : 0,
        recruit: group ? work.recruit.get(`${t.id}:${group}`) ?? 0 : role === 'HC' ? work.signings.get(t.id) ?? 0 : 0,
        develop: work.develop.get(t.id) ?? 0,
        eval: 0,
      };
      const r = c.r as Partial<Record<RatingName, number>>;
      for (const k of Object.keys(r) as RatingName[]) {
        const now = r[k];
        if (now === undefined) continue;
        let grow = (rate + (age < G.age[k][0] ? G.rise : 0) + workOf[k] * G.work[k]) * boost + (moved ? G.fresh : 0);
        // The arc's ceiling: growth slows over the last 6 points under it.
        if (grow > 0) grow *= clamp((base[k]! + G.room[tr.arc] - now) / 6, 0, 1);
        const x = grow - ageFall(k, age, tr.arc === 'fading') + gauss(rng) * G.noise;
        // Whole points, rounded at random so small changes still add up.
        const step = Math.floor(x + rng());
        const next = clamp(now + step, 1, 99);
        if (next === now) continue;
        const d = (p.d ??= {});
        d[k] = (d[k] ?? 0) + next - now;
        if (!d[k]) delete d[k];
      }
    }
  }
  return out;
}

/**
 * Coaches' effects on development and recruiting, each against his peers in the program's tier this
 * season (z-scores within ±2), so the league and its tiers are unchanged and only programs within a tier
 * spread apart (docs/CAROUSEL_PLAN.md §4):
 * - `devXp`: the program's XP multiplier per SD of its head coach's develop
 * - `teachXp`: a position group's XP multiplier per SD of its position coach's teach, against the same
 *   group's coaches in the tier (a great QB coach lifts his QBs)
 * - `recruit`: interest from the head coach's portal calls and visits per SD of recruit (season/portal.ts `pursue`)
 * Both XP effects multiply into `progressTeam` (season/progression.ts) through `programXp`.
 */
export const HEAD_EFFECT = { devXp: 0.06, teachXp: 0.05, recruit: 0.15 };

interface TierZ {
  head: Map<string, { develop: number; recruit: number }>;
  /** By `team:group`. */
  teach: Map<string, number>;
}

const tierCache = new WeakMap<SeasonState, { key: string; coaches: unknown; z: TierZ }>();

/** Cached by the chairs and the coaches' changes (which only move between seasons, so by reference). */
function tierZ(state: SeasonState): TierZ {
  const key = `${state.year}|${TEAMS.map((t) => JSON.stringify(state.teamState[t.id]?.staff ?? '')).join(',')}`;
  let hit = tierCache.get(state);
  if (hit?.key !== key || hit.coaches !== state.coaches) {
    const z: TierZ = { head: new Map(), teach: new Map() };
    // Against his own tier: a better staff at a bigger program is already in its rosters and appeal.
    for (let tier = 1; tier <= 5; tier++) {
      const teams = TEAMS.filter((t) => t.profile.tier === tier);
      const hcs = teams.map((t) => [t.id, headCoachFor(state, t.id)] as const);
      const of = (k: 'develop' | 'recruit') => zScores(new Map(hcs.map(([id, c]) => [id, c.r[k]])));
      const dev = of('develop');
      const rec = of('recruit');
      for (const [id] of hcs) z.head.set(id, { develop: dev.get(id)!, recruit: rec.get(id)! });
      for (const g of GROUPS) {
        for (const [k, v] of zScores(new Map(teams.map((t) => [`${t.id}:${g}`, staffFor(state, t.id)[g].r.teach ?? 50])))) z.teach.set(k, v);
      }
    }
    hit = { key, coaches: state.coaches, z };
    tierCache.set(state, hit);
  }
  return hit.z;
}

/** A position group's XP multiplier from its position coach's teach. */
export const groupXp = (state: SeasonState, teamId: string, g: Group): number => 1 + HEAD_EFFECT.teachXp * (tierZ(state).teach.get(`${teamId}:${g}`) ?? 0);

/** The program's XP multiplier by position: its head coach's develop times the group's position coach's teach. */
export function programXp(state: SeasonState, teamId: string): (pos: Position) => number {
  const head = 1 + HEAD_EFFECT.devXp * tierZ(state).head.get(teamId)!.develop;
  return (pos) => head * groupXp(state, teamId, groupOf(pos));
}

/** The head coach's portal pull from his recruit. */
export const headRecruit = (state: SeasonState, teamId: string): number => 1 + HEAD_EFFECT.recruit * tierZ(state).head.get(teamId)!.recruit;
