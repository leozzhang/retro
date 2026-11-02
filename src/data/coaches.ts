import { clamp, gauss, hashString, mulberry32, pick } from '../engine/math';
import { defStyle, type DefStyle } from './identity';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { TEAMS, type Team } from './teams';

/**
 * Coaching staffs: generated from the team id and never stored, like rosters. For now a coach's
 * ratings do three things (docs/COACHES.md):
 * - `scout`: how much of the weekly scouting report his section finds, and how precisely
 * - `teach` (position coaches): how hard a weekly emphasis steers his players' level-ups
 * - `game` (position coaches): how much a weekly emphasis shows up in simulated play
 * The DC also carries the defense's style (data/identity.ts).
 */

export type CoachRole = 'OC' | 'DC' | 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST' | 'TRAINER';

/** The position coaches, each over one group (data/emphasis.ts). */
export type Group = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST';
export const GROUPS: Group[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];

export const COACH_ROLES: CoachRole[] = ['OC', 'DC', ...GROUPS, 'TRAINER'];

export const COACH_TITLE: Record<CoachRole, string> = {
  OC: 'OFF. COORDINATOR', DC: 'DEF. COORDINATOR', QB: 'QB COACH', RB: 'RB COACH', WR: 'WR COACH', TE: 'TE COACH',
  OL: 'OL COACH', DL: 'DL COACH', LB: 'LB COACH', DB: 'DB COACH', ST: 'ST COACH', TRAINER: 'HEAD TRAINER',
};

export interface CoachRatings {
  scout: number;
  teach?: number;
  game?: number;
  /** Position coaches: how much interest he builds with a portal target each round (season/portal.ts). */
  recruit?: number;
}

export interface Coach {
  id: string;
  role: CoachRole;
  first: string;
  last: string;
  /** His age in season `from` (missing: the first season, `CALENDAR.year`). */
  age: number;
  from?: number;
  r: CoachRatings;
  /** The DC's defensive style. */
  style?: DefStyle;
}

/**
 * A program's head coach (the user is his own team's). Each rating has one job:
 * - `develop`: the program's XP multiplier, against the league (season/coaching.ts `programXp`)
 * - `recruit`: how much interest his portal calls and visits build (season/portal.ts `pursue`)
 * - `eval`: how well he hires: true ratings over reputation (season/coaching.ts `hire`)
 */
export interface HeadRatings {
  develop: number;
  recruit: number;
  eval: number;
}

export interface HeadCoach {
  id: string;
  role: 'HC';
  first: string;
  last: string;
  age: number;
  from?: number;
  r: HeadRatings;
}

export type AnyRole = CoachRole | 'HC';
export type RatingName = keyof CoachRatings | keyof HeadRatings;

export type Staff = Record<CoachRole, Coach>;

/**
 * Staff generation. A program's staff level is `base + perPrestige·prestige` plus a per-program
 * `levelSd`, and each coach's ratings scatter around it by `ratingSd`, within [`min`, `max`]. At the
 * report's tiers (`SCOUT_TIERS`, season/scouting.ts) a top program finds most tier-2 reads and about
 * half the tier-3 ones; a weak one finds a few tier-2 reads.
 */
export const STAFF = { base: 40, perPrestige: 0.4, levelSd: 6, ratingSd: 7, min: 30, max: 95, age: [32, 66] as [number, number] };

/**
 * Head coaches are generated like staffs, at the program's staff level, older (`age`). New hires from
 * outside FBS (season/carousel.ts) come in at the staff level plus `shift` by tier (T1..T5: the FCS is a real
 * pool for a small program, not for a big one), younger (`hireAge`, `hireHcAge`).
 */
export const HEAD = { age: [40, 68] as [number, number], shift: [-9, -7.5, -6, -4, -2], hireAge: [29, 48] as [number, number], hireHcAge: [38, 58] as [number, number] };

/**
 * Graduate assistants (season/carousel.ts): `slots` a program, generated at its staff level plus `shift`,
 * aged `age`, with a position group they lean to. They grow under that group's coach, can be promoted to
 * any position chair at their program, and move on after `years` seasons.
 */
export const GA = { slots: 2, shift: -10, age: [23, 28] as [number, number], years: 3 };

const isGroup = (r: CoachRole): r is Group => (GROUPS as CoachRole[]).includes(r);

const cache = new Map<string, Staff>();

export function buildStaff(team: Team): Staff {
  const hit = cache.get(team.id);
  if (hit) return hit;
  const rng = mulberry32(hashString(`staff:${team.id}`));
  const level = levelDraw(team, rng);
  const rating = () => Math.round(clamp(level + gauss(rng) * STAFF.ratingSd, STAFF.min, STAFF.max));
  const [a0, a1] = STAFF.age;
  const staff = {} as Staff;
  for (const role of COACH_ROLES) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const age = a0 + Math.floor(rng() * (a1 - a0 + 1));
    const r: CoachRatings = { scout: rating() };
    if (isGroup(role)) {
      r.teach = rating();
      r.game = rating();
    }
    const c: Coach = { id: `${team.id}-${role.toLowerCase()}`, role, first, last, age, r };
    if (role === 'DC') c.style = defStyle(team.id);
    staff[role] = c;
  }
  // Recruiting is drawn on its own stream, so the ratings above are the same as before it existed.
  const rr = mulberry32(hashString(`staff-recruit:${team.id}`));
  for (const g of GROUPS) staff[g].r.recruit = Math.round(clamp(level + gauss(rr) * STAFF.ratingSd, STAFF.min, STAFF.max));
  cache.set(team.id, staff);
  return staff;
}

const levelDraw = (team: Team, rng: () => number) => STAFF.base + STAFF.perPrestige * team.profile.prestige + gauss(rng) * STAFF.levelSd;

/** A program's staff level: the first draw of its staff's stream, so the same level `buildStaff` used. */
export function staffLevel(team: Team): number {
  return levelDraw(team, mulberry32(hashString(`staff:${team.id}`)));
}

const hcCache = new Map<string, HeadCoach>();

/** The program's generated head coach, `<team>-hc`, on his own stream. */
export function buildHeadCoach(team: Team): HeadCoach {
  const hit = hcCache.get(team.id);
  if (hit) return hit;
  const hc = headCoachFrom(`${team.id}-hc`, staffLevel(team), HEAD.age, mulberry32(hashString(`hc:${team.id}`)));
  hcCache.set(team.id, hc);
  return hc;
}

function headCoachFrom(id: string, level: number, [a0, a1]: [number, number], rng: () => number, from?: number): HeadCoach {
  const rating = () => Math.round(clamp(level + gauss(rng) * STAFF.ratingSd, STAFF.min, STAFF.max));
  const first = pick(rng, FIRST_NAMES);
  const last = pick(rng, LAST_NAMES);
  const age = a0 + Math.floor(rng() * (a1 - a0 + 1));
  return { id, role: 'HC', first, last, age, ...(from ? { from } : {}), r: { develop: rating(), recruit: rating(), eval: rating() } };
}

/**
 * A coach id, read back: `<team>-<role>` for the staff he was generated on, `<team>-<role>.<year>.<n>`
 * for candidate `n` from outside FBS for that chair in the offseason after `year`, or
 * `<team>-<group>.<year>.ga<n>` for a graduate assistant who joined that offseason, leaning to `group`.
 * Ids are his for life, wherever he coaches later, like an athlete's.
 */
export function parseCoachId(id: string): { team: Team; role: AnyRole; year?: number; n?: number; ga?: boolean } | undefined {
  const cut = id.lastIndexOf('-');
  const [r, year, n] = id.slice(cut + 1).split('.');
  const role = ([...COACH_ROLES, 'HC'] as AnyRole[]).find((x) => x.toLowerCase() === r);
  const team = TEAMS.find((t) => t.id === id.slice(0, cut));
  if (!role || !team) return undefined;
  if (year === undefined) return { team, role };
  const ga = n?.startsWith('ga');
  return { team, role, year: Number(year), n: Number(ga ? n.slice(2) : n), ...(ga ? { ga } : {}) };
}

const hireCache = new Map<string, Coach | HeadCoach>();

/** A candidate from outside FBS, from his id: a little under the program's staff level, and younger. */
function hireFrom(id: string, team: Team, role: AnyRole, year: number, ga = false): Coach | HeadCoach {
  const hit = hireCache.get(id);
  if (hit) return hit;
  const rng = mulberry32(hashString(`hire:${id}`));
  const level = staffLevel(team) + (ga ? GA.shift : HEAD.shift[team.profile.tier - 1]);
  let c: Coach | HeadCoach;
  if (role === 'HC') c = headCoachFrom(id, level, HEAD.hireHcAge, rng, year + 1);
  else {
    const rating = () => Math.round(clamp(level + gauss(rng) * STAFF.ratingSd, STAFF.min, STAFF.max));
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const [a0, a1] = ga ? GA.age : HEAD.hireAge;
    const age = a0 + Math.floor(rng() * (a1 - a0 + 1));
    const r: CoachRatings = { scout: rating() };
    if (isGroup(role)) {
      r.teach = rating();
      r.game = rating();
      r.recruit = rating();
    }
    // A new DC runs the program's defense for now, so identities stay the program's (docs/COACHES.md).
    c = { id, role, first, last, age, from: year + 1, r, ...(role === 'DC' ? { style: defStyle(team.id) } : {}) };
  }
  hireCache.set(id, c);
  return c;
}

/** A staff coach rebuilt from his id, as he was generated (see `parseCoachId`). */
export function generatedCoach(id: string): Coach | undefined {
  const p = parseCoachId(id);
  if (!p || p.role === 'HC') return undefined;
  return p.year === undefined ? buildStaff(p.team)[p.role] : (hireFrom(id, p.team, p.role, p.year, p.ga) as Coach);
}

/** A head coach rebuilt from his id. */
export function generatedHeadCoach(id: string): HeadCoach | undefined {
  const p = parseCoachId(id);
  if (!p || p.role !== 'HC') return undefined;
  return p.year === undefined ? buildHeadCoach(p.team) : (hireFrom(id, p.team, 'HC', p.year) as HeadCoach);
}

/** Any coach, staff or head, from his id. */
export const anyCoach = (id: string): Coach | HeadCoach | undefined => generatedCoach(id) ?? generatedHeadCoach(id);

/**
 * A DC's in-game adjustments (ADJUST): how fast and how well his defense learns your offense during
 * a game (game/defBrain.ts). It follows his scouting (film study is the same skill) with his own
 * spread around it, seeded by his id, so it isn't stored and doesn't touch his other ratings or his
 * worth in the carousel. It grows with his scouting.
 */
export function dcAdjust(c: Coach): number {
  const g = gauss(mulberry32(hashString(`dc-adjust:${c.id}`)));
  return Math.round(clamp(c.r.scout + g * STAFF.ratingSd * ADJUST_SPREAD, STAFF.min, STAFF.max));
}
/** How far ADJUST strays from SCOUT, as a share of the rating SD. */
const ADJUST_SPREAD = 0.8;

/** The ratings each chair uses. */
export const ROLE_KEYS: Record<AnyRole, RatingName[]> = {
  HC: ['develop', 'recruit', 'eval'],
  OC: ['scout'], DC: ['scout'], TRAINER: ['scout'],
  ...(Object.fromEntries(GROUPS.map((g) => [g, ['scout', 'teach', 'game', 'recruit']])) as Record<Group, RatingName[]>),
};

/** How far a coach's ratings for another chair stray from his own level (SD). */
const LATENT_SD = 5;

const asCache = new Map<string, Coach | HeadCoach>();

/**
 * A coach as he'd be in a chair, before any changes: his generated ratings for the ones he has, and
 * for the rest (a coordinator made head coach, a head coach taking a coordinator job) seeded ratings
 * around his own level. Age and `from` are his own; a DC keeps his style if he has one.
 */
export function coachAs(id: string, role: AnyRole): Coach | HeadCoach | undefined {
  const key = `${id}|${role}`;
  const hit = asCache.get(key);
  if (hit) return hit;
  const base = anyCoach(id);
  if (!base) return undefined;
  if (base.role === role) return base;
  const own = base.r as Partial<Record<RatingName, number>>;
  const vals = Object.values(own) as number[];
  const level = vals.reduce((a, b) => a + b, 0) / vals.length;
  const r: Partial<Record<RatingName, number>> = {};
  for (const k of ROLE_KEYS[role]) {
    r[k] = own[k] ?? Math.round(clamp(level + gauss(mulberry32(hashString(`latent:${id}:${k}`))) * LATENT_SD, STAFF.min, STAFF.max));
  }
  const { first, last, age, from } = base;
  const c = role === 'HC'
    ? ({ id, role, first, last, age, ...(from ? { from } : {}), r: r as unknown as HeadRatings } satisfies HeadCoach)
    : ({ id, role, first, last, age, ...(from ? { from } : {}), r: r as unknown as CoachRatings, ...('style' in base && base.style ? { style: base.style } : {}) } satisfies Coach);
  asCache.set(key, c);
  return c;
}

/** Rating changes laid over a coach's generated ratings, within [1, 99]. */
export function applyCoachDelta<R extends object>(r: R, d: Partial<Record<RatingName, number>> | undefined): R {
  if (!d) return r;
  const out = { ...r } as Record<string, number | undefined>;
  for (const [k, v] of Object.entries(d)) {
    if (out[k] !== undefined && v !== undefined) out[k] = clamp(out[k]! + v, 1, 99);
  }
  return out as R;
}

export function coachName(c: { first: string; last: string }): string {
  return `${c.first[0]}. ${c.last}`.toUpperCase();
}
