import type { Athlete } from './athletes';
import { overall, POS_ROLE, SLOT_POS, type Position } from './positions';
import { generateAthletes } from './rosterGen';
import { SLOT_ROLE, type RosterPlayer, type Team } from './teams';

/**
 * Who can fill each on-field slot, in order of fit. A player out of his natural position rates at
 * the slot's position, less `OUT_OF_POSITION`, so he only plays there when it's thin.
 */
export const SLOT_CANDIDATES: Record<string, Position[]> = {
  QB: ['QB'], RB: ['HB', 'FB'], FB: ['FB', 'HB', 'TE'], X: ['WR'], Z: ['WR'], SL: ['WR'], WR4: ['WR', 'TE'],
  TE: ['TE'], TE2: ['TE', 'OT'], LT: ['OT', 'OG'], RT: ['OT', 'OG'], LG: ['OG', 'OT', 'C'], RG: ['OG', 'OT', 'C'], C: ['C', 'OG'],
  DE1: ['DE', 'OLB', 'DT'], DE2: ['DE', 'OLB', 'DT'], DT1: ['DT', 'DE'], DT2: ['DT', 'DE'],
  WLB: ['OLB', 'MLB'], SAM: ['OLB', 'MLB'], MLB: ['MLB', 'OLB'],
  CB1: ['CB'], CB2: ['CB'], NB: ['CB', 'FS', 'SS'], DIME: ['CB', 'FS', 'SS'], FS: ['FS', 'SS', 'CB'], SS: ['SS', 'FS'],
  K: ['K', 'P'], P: ['P', 'K'],
};
const OUT_OF_POSITION = 4;

/**
 * Slots in the order starters are picked, so the best player at a group takes its first slot
 * (X before Z before SL) and nobody plays two slots.
 */
export const PICK_ORDER = [
  'QB', 'RB', 'X', 'Z', 'SL', 'TE', 'LT', 'RT', 'LG', 'RG', 'C', 'FB', 'TE2', 'WR4',
  'DE1', 'DE2', 'DT1', 'DT2', 'MLB', 'WLB', 'SAM', 'CB1', 'CB2', 'FS', 'SS', 'NB', 'DIME', 'K', 'P',
];

export type DepthChart = Record<string, string[]>;

/** A team's full roster and depth chart. */
export interface Squad {
  team: Team;
  athletes: Athlete[];
  depth: DepthChart;
}

export function slotScore(a: Athlete, slot: string): number {
  const pos = SLOT_POS[slot];
  return overall(a.r, pos) - (a.pos === pos ? 0 : OUT_OF_POSITION);
}

/** Auto depth chart: everyone who can play each slot, best fit first. */
export function buildDepth(athletes: Athlete[]): DepthChart {
  const depth: DepthChart = {};
  for (const slot of PICK_ORDER) {
    depth[slot] = athletes
      .filter((a) => SLOT_CANDIDATES[slot].includes(a.pos))
      .sort((a, b) => slotScore(b, slot) - slotScore(a, slot))
      .map((a) => a.id);
  }
  return depth;
}

export function healthy(a: Athlete): boolean {
  return !a.injury || a.injury.weeks <= 0;
}

/** The player in each slot right now: the first healthy one on its depth list not already starting elsewhere. */
export function starters(squad: Squad): Record<string, Athlete> {
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const used = new Set<string>();
  const out: Record<string, Athlete> = {};
  for (const slot of PICK_ORDER) {
    for (const id of squad.depth[slot] ?? []) {
      const a = byId.get(id);
      if (!a || used.has(id) || !healthy(a)) continue;
      used.add(id);
      out[slot] = a;
      break;
    }
  }
  return out;
}

export function athleteName(a: Athlete): string {
  return `${a.first} ${a.last}`;
}

/** The sim's view of the players on the field, keyed by slot. */
export function onField(squad: Squad): Record<string, RosterPlayer> {
  const out: Record<string, RosterPlayer> = {};
  for (const [slot, a] of Object.entries(starters(squad))) {
    out[slot] = { slot, role: SLOT_ROLE[slot] ?? POS_ROLE[a.pos], name: athleteName(a), num: a.num, r: a.r, skin: a.skin };
  }
  return out;
}

/**
 * Unit weights for the team overalls. Offense and defense use the 11-personnel / nickel lineup
 * (the most common snap): QB 30%, line 35%, receivers 21%; front 36%, backers 16%, corners 28%,
 * safeties 20%. Special teams: kicker 50%, punter 35%, returners 15%.
 */
export const TEAM_WEIGHTS = {
  off: { QB: 30, RB: 8, X: 8, Z: 7, SL: 6, TE: 6, LT: 8, LG: 6.5, C: 7, RG: 6.5, RT: 7 } as Record<string, number>,
  def: { DE1: 10, DE2: 10, DT1: 8, DT2: 8, WLB: 8, MLB: 8, CB1: 11, CB2: 10, NB: 7, FS: 10, SS: 10 } as Record<string, number>,
  st: { K: 50, P: 35 } as Record<string, number>,
};
const RETURN_WEIGHT = 15;

/** A returner's value: speed, elusiveness and hands. */
export function returnRating(a: Athlete): number {
  return a.r.spd * 0.4 + a.r.elu * 0.3 + a.r.cth * 0.3;
}

export interface TeamRatings {
  off: number;
  def: number;
  st: number;
  ovr: number;
}

/** Team overalls from whoever is healthy and starting now, so an injury shows up right away. */
export function teamRatings(squad: Squad): TeamRatings {
  const s = starters(squad);
  const unit = (w: Record<string, number>) => {
    let sum = 0;
    let tot = 0;
    for (const [slot, wt] of Object.entries(w)) {
      const a = s[slot];
      if (!a) continue;
      sum += overall(a.r, SLOT_POS[slot]) * wt;
      tot += wt;
    }
    return { sum, tot };
  };
  const o = unit(TEAM_WEIGHTS.off);
  const d = unit(TEAM_WEIGHTS.def);
  const k = unit(TEAM_WEIGHTS.st);
  // Kick returners are the Z and the back (see `specialTeams.ts`).
  const ret = [s.Z, s.RB].filter(Boolean).map(returnRating);
  const retAvg = ret.length ? ret.reduce((a, b) => a + b, 0) / ret.length : 0;
  const off = o.sum / o.tot;
  const def = d.sum / d.tot;
  const st = (k.sum + retAvg * RETURN_WEIGHT) / (k.tot + (ret.length ? RETURN_WEIGHT : 0));
  return {
    off: Math.round(off),
    def: Math.round(def),
    st: Math.round(st),
    ovr: Math.round(off * 0.45 + def * 0.45 + st * 0.1),
  };
}

const cache = new Map<string, Squad>();

/** The team's squad, generated once per id (deterministic, so the cache is only a speed-up). */
export function buildSquad(team: Team): Squad {
  let sq = cache.get(team.id);
  if (!sq) {
    const athletes = generateAthletes(team.profile);
    sq = { team, athletes, depth: buildDepth(athletes) };
    cache.set(team.id, sq);
  }
  return sq;
}

/** The on-field roster for a team's current depth chart. */
export function rosterFor(team: Team): Record<string, RosterPlayer> {
  return onField(buildSquad(team));
}

/** A fresh, uncached copy (for tests and anything that mutates injuries). */
export function freshSquad(team: Team): Squad {
  const athletes = generateAthletes(team.profile);
  return { team, athletes, depth: buildDepth(athletes) };
}
