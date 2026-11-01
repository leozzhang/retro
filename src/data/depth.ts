import type { Athlete } from './athletes';
import { CONF, CONF_OVR, type UnitConf } from './confidence';
import { overall, POS_ROLE, SLOT_POS, type Position } from './positions';
import type { RatingKey, Ratings } from './ratings';
import { generateAthletes, makeFreshman, makeWalkOn, parseFreshman, parseWalkOn } from './rosterGen';
import { SLOT_ROLE, TEAMS, teamById, type RosterPlayer, type Team } from './teams';

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

/**
 * Playing hurt. Below full health a player loses `phys` rating points per point of health on his
 * physical ratings and `skill` on the rest (at 75: about -5 and -2). The staff sit a starter below
 * `restBelow` when his backup is within `restPenalty` overall of his health-adjusted overall.
 */
export const HEALTH = { phys: 0.2, skill: 0.08, restBelow: 80, restPenalty: 4 };
const PHYSICAL = new Set<RatingKey>(['spd', 'acc', 'str', 'sta']);

export function healthOf(a: Athlete): number {
  return a.health ?? 100;
}

/** The ratings he plays with: his own, less what playing hurt costs. */
export function fitRatings(a: Athlete): Ratings {
  const h = healthOf(a);
  if (h >= 100) return a.r;
  const out = { ...a.r };
  for (const k of Object.keys(out) as RatingKey[]) {
    out[k] = Math.max(1, Math.round(out[k] - (100 - h) * (PHYSICAL.has(k) ? HEALTH.phys : HEALTH.skill)));
  }
  return out;
}

/**
 * His fit at a slot as the staff see it: health-adjusted, with a hurt player pushed down to rest, a
 * slumping one down and a confident one up (`CONF.staff`), and last game's starter there (`incumbent`)
 * keeping a small edge so the chart doesn't flip-flop.
 */
export function slotScore(a: Athlete, slot: string, incumbent = false): number {
  const pos = SLOT_POS[slot];
  const rest = healthOf(a) < HEALTH.restBelow ? HEALTH.restPenalty : 0;
  const form = (a.conf ?? 0) * CONF.staff + (incumbent ? CONF.incumbent : 0);
  return overall(fitRatings(a), pos) - (a.pos === pos ? 0 : OUT_OF_POSITION) - rest + form;
}

/** Auto depth chart: everyone who can play each slot, best fit first. `incumbents` are last game's starters by slot. */
export function buildDepth(athletes: Athlete[], incumbents?: Record<string, string>): DepthChart {
  const depth: DepthChart = {};
  for (const slot of PICK_ORDER) {
    const inc = incumbents?.[slot];
    depth[slot] = athletes
      .filter((a) => SLOT_CANDIDATES[slot].includes(a.pos))
      .map((a) => [a.id, slotScore(a, slot, a.id === inc)] as const)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }
  return depth;
}

/**
 * A position's depth order, as the depth chart screen shows it: the players of that natural
 * position in the order of the first slot it fills (X for WR, LT for OT, CB1 for CB).
 */
export function positionOrder(squad: Squad, pos: Position): Athlete[] {
  return orderOf(squad, pos, new Map(squad.athletes.map((a) => [a.id, a])));
}

/** Every position's depth order (`positionOrder`), from one pass over the roster. */
export function positionOrders(squad: Squad): Map<Position, Athlete[]> {
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const out = new Map<Position, Athlete[]>();
  for (const a of squad.athletes) if (!out.has(a.pos)) out.set(a.pos, orderOf(squad, a.pos, byId));
  return out;
}

function orderOf(squad: Squad, pos: Position, byId: Map<string, Athlete>): Athlete[] {
  const slot = PICK_ORDER.find((s) => SLOT_POS[s] === pos)!;
  const listed = (squad.depth[slot] ?? []).map((id) => byId.get(id)).filter((a): a is Athlete => a?.pos === pos);
  // Anyone missing from the list (a chart saved before a roster change) goes to the bottom.
  const seen = new Set(listed.map((a) => a.id));
  return [...listed, ...squad.athletes.filter((a) => a.pos === pos && !seen.has(a.id))];
}

/**
 * Move one player within his position's order, and rebuild every slot that position can fill: each
 * slot lists its candidate positions' orders back to back, natural position first. `starters` fills
 * slots in `PICK_ORDER` and skips anyone already starting, so WR #1-#4 land on X, Z, SL and WR4.
 */
export function reorderPosition(squad: Squad, pos: Position, from: number, to: number): DepthChart {
  const orders = new Map<Position, Athlete[]>();
  const order = (p: Position) => {
    if (!orders.has(p)) orders.set(p, positionOrder(squad, p));
    return orders.get(p)!;
  };
  const list = [...order(pos)];
  const [moved] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, to)), 0, moved);
  orders.set(pos, list);
  const depth: DepthChart = { ...squad.depth };
  for (const slot of PICK_ORDER) {
    if (!SLOT_CANDIDATES[slot].includes(pos)) continue;
    depth[slot] = SLOT_CANDIDATES[slot].flatMap((p) => order(p).map((a) => a.id));
  }
  return depth;
}

export function healthy(a: Athlete): boolean {
  return !a.injury || a.injury.weeks <= 0;
}

/** Healthy enough to play but not at full health. */
export function bangedUp(a: Athlete): boolean {
  return healthy(a) && healthOf(a) < 100;
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
    out[slot] = { slot, role: SLOT_ROLE[slot] ?? POS_ROLE[a.pos], name: athleteName(a), num: a.num, r: fitRatings(a), skin: a.skin };
    if (a.conf) out[slot].conf = a.conf;
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

/** Team overalls from whoever is healthy and starting now, playing hurt included, so an injury shows up right away. */
export function teamRatings(squad: Squad): TeamRatings {
  const s = starters(squad);
  const unit = (w: Record<string, number>) => {
    let sum = 0;
    let tot = 0;
    for (const [slot, wt] of Object.entries(w)) {
      const a = s[slot];
      if (!a) continue;
      sum += overall(fitRatings(a), SLOT_POS[slot]) * wt;
      tot += wt;
    }
    return { sum, tot };
  };
  const o = unit(TEAM_WEIGHTS.off);
  const d = unit(TEAM_WEIGHTS.def);
  const k = unit(TEAM_WEIGHTS.st);
  // Kick returners are the Z and the back (see `specialTeams.ts`).
  const ret = [s.Z, s.RB].filter(Boolean).map((a) => returnRating({ ...a, r: fitRatings(a) }));
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

/**
 * Each unit's confidence, as the drive sim and the grades use it: the starters' confidence weighted
 * like the team overalls (`TEAM_WEIGHTS`, so the QB counts most), in overall points per rating point
 * of shift (`CONF_OVR`). The kicker's is his own.
 */
export function teamConf(squad: Squad): UnitConf {
  const s = starters(squad);
  const unit = (w: Record<string, number>) => {
    let sum = 0;
    let tot = 0;
    for (const [slot, wt] of Object.entries(w)) {
      const a = s[slot];
      if (!a) continue;
      sum += (a.conf ?? 0) * CONF_OVR[SLOT_POS[slot]] * wt;
      tot += wt;
    }
    return tot ? sum / tot : 0;
  };
  return { off: unit(TEAM_WEIGHTS.off), def: unit(TEAM_WEIGHTS.def), k: s.K?.conf ?? 0 };
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

/** The team a player was generated on (recruited by), from his id. */
export function originTeam(id: string): string | undefined {
  const wo = parseWalkOn(id) ?? parseFreshman(id);
  if (wo) return wo.team;
  const t = id.slice(0, id.lastIndexOf('-'));
  return TEAM_IDS.has(t) ? t : undefined;
}

/**
 * Any player by id as he was generated: `${team}-${i}` from his team's roster, or a walk-on or
 * placeholder freshman rebuilt from his id. A transfer is always one of these, whatever roster he's on now.
 */
export function generatedAthlete(id: string): Athlete | undefined {
  const wo = parseWalkOn(id);
  const fr = wo ? undefined : parseFreshman(id);
  if (wo || fr) {
    let a = walkOns.get(id);
    if (!a) walkOns.set(id, (a = wo ? makeWalkOn(teamById(wo.team).profile, id, wo.pos) : makeFreshman(teamById(fr!.team).profile, id, fr!.pos)));
    return a;
  }
  const cut = id.lastIndexOf('-');
  const team = TEAM_IDS.has(id.slice(0, cut)) ? teamById(id.slice(0, cut)) : undefined;
  return team && buildSquad(team).athletes[Number(id.slice(cut + 1))];
}

const TEAM_IDS = new Set(TEAMS.map((t) => t.id));
const walkOns = new Map<string, Athlete>();

/** The on-field roster for a team's current depth chart. */
export function rosterFor(team: Team): Record<string, RosterPlayer> {
  return onField(buildSquad(team));
}

/** A fresh, uncached copy (for tests and anything that mutates injuries). */
export function freshSquad(team: Team): Squad {
  const athletes = generateAthletes(team.profile);
  return { team, athletes, depth: buildDepth(athletes) };
}
