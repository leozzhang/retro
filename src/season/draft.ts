import { templateValue, type Athlete } from '../data/athletes';
import { overall, type Position } from '../data/positions';
import { clamp, gauss, hashString, mulberry32, type Rng } from '../engine/math';

/**
 * The NFL draft (docs/RECRUITING_PLAN.md, phase 1): every senior out of eligibility and every
 * underclassman who declared, ranked by what the NFL values: 7 rounds of 32 plus compensatory picks at
 * the end of rounds 3 to 7 (`comp`), 257 in all. NFL teams are only cities. Nothing about the NFL is
 * simulated beyond the order.
 *
 * Tuning:
 * - `posValue`: points added to his overall by position (the NFL pays for passers, tackles, rushers and corners).
 * - `athletic`: per point of speed and acceleration (and strength on the lines) over his position's
 *   template at his overall: the combine.
 * - `room`: per point of potential over overall, capped at `roomCap`; `youth` per season of
 *   eligibility he gives up: the league drafts upside.
 * - `noise`: SD of each team's read of him, drawn once per player and year.
 */
export const DRAFT = {
  rounds: 7,
  teams: 32,
  /** Compensatory picks at the end of each round. */
  comp: [0, 0, 7, 7, 7, 6, 6],
  posValue: {
    QB: 4, OT: 2.5, DE: 2.5, CB: 1.5, WR: 1.5, DT: 0.5, OLB: 0.5, TE: -0.5, OG: -1, FS: -0.5, SS: -1, MLB: -1, HB: -1.5,
    C: -2, FB: -9, K: -9, P: -10,
  } as Record<Position, number>,
  athletic: { spd: 0.25, acc: 0.1, str: 0.12 },
  room: 0.15,
  roomCap: 8,
  youth: 0.6,
  noise: 2.5,
};

/** NFL teams by their market, as the draft names them. */
export const NFL_CITIES = [
  'Arizona', 'Atlanta', 'Baltimore', 'Buffalo', 'Carolina', 'Chicago', 'Cincinnati', 'Cleveland', 'Dallas', 'Denver', 'Detroit',
  'Green Bay', 'Houston', 'Indianapolis', 'Jacksonville', 'Kansas City', 'Las Vegas', 'Los Angeles', 'San Diego', 'Miami', 'Minnesota',
  'New England', 'New Orleans', 'New York', 'New Jersey', 'Philadelphia', 'Pittsburgh', 'San Francisco', 'Seattle', 'Tampa Bay',
  'Tennessee', 'Washington',
];

const LINES = new Set<Position>(['OT', 'OG', 'C', 'DE', 'DT']);

/**
 * What the NFL thinks of him, before its noise: overall plus position value, athleticism over his
 * position's template, and upside (potential room and the eligibility he leaves on the table).
 */
export function draftValue(a: Athlete, yearsLeft: number): number {
  const ovr = overall(a.r, a.pos);
  const over = (k: 'spd' | 'acc' | 'str') => a.r[k] - templateValue(a.pos, k, ovr);
  const athletic = DRAFT.athletic.spd * over('spd') + DRAFT.athletic.acc * over('acc') + (LINES.has(a.pos) ? DRAFT.athletic.str * over('str') : 0);
  const room = DRAFT.room * clamp(a.potential - ovr, 0, DRAFT.roomCap);
  return ovr + DRAFT.posValue[a.pos] + athletic + room + DRAFT.youth * yearsLeft;
}

/** The league's read of him this year: a fixed draw per player, so a projection and the draft agree on him. */
export function draftNoise(seed: number, year: number, id: string): number {
  return gauss(mulberry32(hashString(`draft:${seed}:${year}:${id}`))) * DRAFT.noise;
}

/** This year's order: the 32 cities shuffled, the same in every round. */
export function draftOrder(rng: Rng): string[] {
  const order = [...NFL_CITIES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The last overall pick of each round. */
export const ROUND_ENDS = DRAFT.comp.reduce<number[]>((ends, c) => [...ends, (ends.at(-1) ?? 0) + DRAFT.teams + c], []);
export const DRAFT_PICKS = ROUND_ENDS.at(-1)!;

/** The round an overall pick (from 1) falls in. */
export const roundOf = (pick: number): number => ROUND_ENDS.findIndex((e) => pick <= e) + 1;

/**
 * Every pick's round and team: each round in `order`, then that round's compensatory picks to teams
 * drawn from `rng` (no team twice in a round's comp picks).
 */
export function draftSchedule(order: string[], rng: Rng): { round: number; pick: number; city: string }[] {
  const out: { round: number; pick: number; city: string }[] = [];
  for (let r = 0; r < DRAFT.rounds; r++) {
    const comp = draftOrder(rng).slice(0, DRAFT.comp[r]);
    for (const city of [...order, ...comp]) out.push({ round: r + 1, pick: out.length + 1, city });
  }
  return out;
}

/** Where a projected pick lands, for the declare watch: "RD 1" to "RD 7", or "UNDRAFTED". */
export function projLabel(proj: number): string {
  return proj <= DRAFT_PICKS ? `RD ${roundOf(proj)}` : 'UNDRAFTED';
}
