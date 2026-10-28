import { clamp, gauss, hashString, mulberry32, pick } from '../engine/math';
import { defStyle, type DefStyle } from './identity';
import { FIRST_NAMES, LAST_NAMES } from './names';
import type { Team } from './teams';

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
  age: number;
  r: CoachRatings;
  /** The DC's defensive style. */
  style?: DefStyle;
}

export type Staff = Record<CoachRole, Coach>;

/**
 * Staff generation. A program's staff level is `base + perPrestige·prestige` plus a per-program
 * `levelSd`, and each coach's ratings scatter around it by `ratingSd`, within [`min`, `max`]. At the
 * report's tiers (`SCOUT_TIERS`, season/scouting.ts) a top program finds most tier-2 reads and about
 * half the tier-3 ones; a weak one finds a few tier-2 reads.
 */
export const STAFF = { base: 40, perPrestige: 0.4, levelSd: 6, ratingSd: 7, min: 30, max: 95, age: [32, 66] as [number, number] };

const isGroup = (r: CoachRole): r is Group => (GROUPS as CoachRole[]).includes(r);

const cache = new Map<string, Staff>();

export function buildStaff(team: Team): Staff {
  const hit = cache.get(team.id);
  if (hit) return hit;
  const rng = mulberry32(hashString(`staff:${team.id}`));
  const level = STAFF.base + STAFF.perPrestige * team.profile.prestige + gauss(rng) * STAFF.levelSd;
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

export function coachName(c: Coach): string {
  return `${c.first[0]}. ${c.last}`.toUpperCase();
}
