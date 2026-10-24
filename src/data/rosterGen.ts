import { clamp, gauss, hashString, mulberry32, pick, type Rng } from '../engine/math';
import { ARCHETYPES, BUILD, buildNudge, templateValue, TEMPLATES, type Athlete, type ClassYear, type DevTrait } from './athletes';
import { CITIES, REGION, TALENT, TEAM_STATE } from './fbs/geo';
import type { Standout, TeamProfile, Unit } from './fbs/profile';
import { FIRST_NAMES, LAST_NAMES, SKINS } from './names';
import { OVR_WEIGHTS, overallRaw, POS_ROLE, type Position } from './positions';
import { RATING_KEYS, type RatingKey, type Ratings } from './ratings';
import type { Role } from './teams';

/** Players per position on an 85-man roster. */
export const COMPOSITION: [Position, number][] = [
  ['QB', 4], ['HB', 5], ['FB', 1], ['WR', 10], ['TE', 4], ['OT', 6], ['OG', 7], ['C', 3],
  ['DE', 8], ['DT', 7], ['OLB', 6], ['MLB', 4], ['CB', 10], ['FS', 3], ['SS', 3], ['K', 2], ['P', 2],
];

/** How many play on a typical snap: the unit target is the average of these. */
const STARTERS: Record<Position, number> = {
  QB: 1, HB: 1, FB: 1, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, DE: 2, DT: 2, OLB: 2, MLB: 1, CB: 3, FS: 1, SS: 1, K: 1, P: 1,
};

const POS_UNIT: Record<Position, Unit> = {
  QB: 'QB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL',
  DE: 'DL', DT: 'DL', OLB: 'LB', MLB: 'LB', CB: 'CB', FS: 'S', SS: 'S', K: 'K', P: 'P',
};

const UNIT_SIDE: Record<Unit, 'off' | 'def' | 'st'> = {
  QB: 'off', RB: 'off', WR: 'off', TE: 'off', OL: 'off', DL: 'def', LB: 'def', CB: 'def', S: 'def', K: 'st', P: 'st',
};

/** Points a +1 in `units` adds to that unit's target. */
const UNIT_STEP = 2.5;
/** How much each unit counts toward its side (as in `TEAM_WEIGHTS`), to keep `units` relative. */
const UNIT_WEIGHT: Partial<Record<Unit, number>> = { QB: 30, RB: 8, WR: 21, TE: 6, OL: 35, DL: 36, LB: 16, CB: 28, S: 20 };

/**
 * Unit targets: the side's target plus the unit's strength or weakness, re-centered so the side
 * still averages its target (the research's `units` are relative to the team's own level).
 */
function unitTargets(p: TeamProfile): Record<Unit, number> {
  const out = {} as Record<Unit, number>;
  for (const side of ['off', 'def', 'st'] as const) {
    const units = (Object.keys(UNIT_SIDE) as Unit[]).filter((u) => UNIT_SIDE[u] === side);
    let wsum = 0;
    let adj = 0;
    for (const u of units) {
      const w = UNIT_WEIGHT[u] ?? 0;
      wsum += w;
      adj += w * (p.units[u] ?? 0) * UNIT_STEP;
    }
    const center = wsum ? adj / wsum : 0;
    for (const u of units) out[u] = p.target[side] + (p.units[u] ?? 0) * UNIT_STEP - center;
  }
  return out;
}
/** Level by class: upperclassmen have developed; a redshirt year adds a bit more. */
const CLASS_ADJ: Record<ClassYear, number> = { FR: -8, SO: -3, JR: 1, SR: 3 };
const REDSHIRT_ADJ = 1.5;
const CLASS_SHARE: [ClassYear, number][] = [['FR', 0.28], ['SO', 0.26], ['JR', 0.24], ['SR', 0.22]];
const REDSHIRT_ODDS: Record<ClassYear, number> = { FR: 0.35, SO: 0.4, JR: 0.45, SR: 0.5 };
/** Spread of talent within a position group, before calibration. */
const LEVEL_SD = 5;
/** Researched standouts by tier: [floor, points over the unit target, cap]. */
const STANDOUT_LEVEL: Record<Standout['tier'], [number, number, number]> = {
  elite: [84, 7, 97],
  star: [76, 3, 93],
  good: [0, 0, 90],
};
/** The generated starters next to standouts aim no lower than this under the unit target. */
const STANDOUT_ROOM = 6;
/** Generated backups at a one-starter position held by a standout aim this far under the target. */
const BACKUP_GAP = 4;
/** Overall growth still to come, by class; scaled by the development trait. */
const GROWTH: Record<ClassYear, number> = { FR: 10, SO: 6, JR: 3, SR: 1 };
const DEV_MULT: Record<DevTrait, number> = { normal: 0.8, impact: 1.1, star: 1.45, elite: 1.9 };
const RATING_SD = 2.5;

const NUM_RANGES: Record<Role, [number, number][]> = {
  QB: [[1, 19]], RB: [[0, 9], [20, 49]], WR: [[0, 19], [80, 89]], TE: [[80, 89], [40, 49]], OL: [[50, 79]],
  DL: [[90, 99], [40, 59]], LB: [[0, 9], [30, 59]], CB: [[0, 39]], S: [[0, 39]],
  K: [[1, 49], [90, 99]], P: [[1, 49], [90, 99]],
};

function pickNumber(rng: Rng, role: Role, used: Set<number>): number {
  const ranges = NUM_RANGES[role];
  for (let i = 0; i < 60; i++) {
    const [lo, hi] = pick(rng, ranges);
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  // College rosters share numbers between offense and defense; take any.
  return Math.floor(rng() * 100);
}

function weighted<T>(rng: Rng, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

/** Archetype odds for a position, bent by the team's offense. The first archetype is the most common. */
function archetypeOdds(pos: Position, p: TeamProfile): [string, number][] {
  const names = Object.keys(ARCHETYPES[pos]);
  const odds: [string, number][] = names.map((n, i) => [n, [0.5, 0.3, 0.2][i] ?? 0.2]);
  const bump = (name: string, w: number) => {
    const o = odds.find(([n]) => n === name);
    if (o) o[1] += w;
  };
  const s = p.offense.scheme;
  if (pos === 'QB' && (s === 'option' || p.offense.qbStyle !== 'pocket')) bump('dual', 0.3), bump('scrambler', s === 'option' ? 0.4 : 0.1);
  if (pos === 'HB' && (s === 'power-run' || s === 'pro' || s === 'option')) bump('power', 0.4);
  if (pos === 'HB' && s === 'air-raid') bump('receiving', 0.3);
  if (pos === 'WR' && s === 'air-raid') bump('deep', 0.2), bump('slot', 0.2);
  if (pos === 'TE' && (s === 'pro' || s === 'power-run' || s === 'option')) bump('blocking', 0.5);
  if (pos === 'TE' && (s === 'air-raid' || s === 'spread')) bump('receiving', 0.2);
  return odds;
}

const QB_STYLE_ARCH = { pocket: 'pocket', dual: 'dual', runner: 'scrambler' } as const;

function hometown(rng: Rng, p: TeamProfile): { city: string; state: string } {
  const home = TEAM_STATE[p.id] ?? 'TX';
  const region = REGION[home];
  // Bigger programs recruit nationally; smaller ones stay close to home.
  const homeOdds = [0, 0.28, 0.36, 0.46, 0.54, 0.6][p.tier];
  const regionOdds = 0.3;
  const r = rng();
  let state: string;
  if (r < homeOdds) state = home;
  else if (r < homeOdds + regionOdds) {
    const near = Object.keys(REGION).filter((s) => REGION[s] === region && s !== home && CITIES[s]);
    state = near.length ? weighted(rng, near.map((s) => [s, TALENT[s] ?? 0.3])) : home;
  } else state = weighted(rng, Object.keys(TALENT).filter((s) => CITIES[s]).map((s) => [s, TALENT[s]]));
  const cities = CITIES[state];
  const city = rng() < 1 / (cities.length + 1) ? cities[0] : pick(rng, cities);
  return { city, state };
}

function devTrait(rng: Rng, level: number): DevTrait {
  const r = rng() - (level - 75) * 0.004;
  return r < 0.03 ? 'elite' : r < 0.12 ? 'star' : r < 0.36 ? 'impact' : 'normal';
}

/** Recruiting stars from what he was as a recruit: his ceiling, less a little for late bloomers. */
function starsFor(potential: number, dev: DevTrait): Athlete['stars'] {
  const s = potential - (dev === 'elite' ? 4 : dev === 'star' ? 2 : 0);
  return s >= 95 ? 5 : s >= 86 ? 4 : s >= 72 ? 3 : s >= 58 ? 2 : 1;
}

/** Skill ratings: the ones that scale with level. They carry calibration; physical limits stay put. */
function skillKeys(pos: Position): RatingKey[] {
  return RATING_KEYS.filter((k) => (TEMPLATES[pos][k]?.[1] ?? 0) >= 0.8);
}

/** Moves a player's overall by about `delta` by shifting his skill ratings together. */
function shiftOverall(r: Ratings, pos: Position, delta: number): void {
  const skill = skillKeys(pos);
  let wSkill = 0;
  let wSlope = 0;
  for (const [k, w] of Object.entries(OVR_WEIGHTS[pos]) as [RatingKey, number][]) {
    wSlope += w * (TEMPLATES[pos][k]?.[1] ?? 1);
    if (skill.includes(k)) wSkill += w;
  }
  const step = wSkill ? (delta * wSlope) / wSkill : 0;
  for (const k of skill) r[k] = Math.round(clamp(r[k] + step, 20, 99));
}

/**
 * Ratings for a player at `level` in `pos` with `archetype`: template, archetype shift, build nudge
 * and noise, then the skill ratings are shifted together until his overall lands on `level`.
 */
export function rollRatings(rng: Rng, pos: Position, archetype: string, level: number, wz: number, hz: number): Ratings {
  const arch = ARCHETYPES[pos][archetype] ?? {};
  const nudge = buildNudge(pos, wz, hz);
  const raw = {} as Ratings;
  for (const k of RATING_KEYS) {
    raw[k] = templateValue(pos, k, level) + (arch[k] ?? 0) + (nudge[k] ?? 0) + gauss(rng) * RATING_SD;
  }
  const skill = skillKeys(pos);
  const r = { ...raw };
  for (let i = 0; i < 3; i++) {
    for (const k of RATING_KEYS) r[k] = clamp(r[k], 20, 99);
    const miss = level - overallRaw(r, pos);
    if (Math.abs(miss) < 0.3) break;
    for (const k of skill) raw[k] += miss;
    Object.assign(r, raw);
  }
  for (const k of RATING_KEYS) r[k] = Math.round(clamp(r[k], 20, 99));
  return r;
}

interface Seed {
  pos: Position;
  year: ClassYear;
  redshirt: boolean;
  level: number;
  standout?: Standout;
}

/** The full roster for a team: seeded by its id, so the same team always gets the same players. */
export function generateAthletes(p: TeamProfile): Athlete[] {
  const rng = mulberry32(hashString(p.id + '/roster'));
  const seeds: Seed[] = [];
  /** Per position: the overall the generated starters should average, and how many of them start. */
  const aims = new Map<Position, { aim: number; k: number }>();
  const targets = unitTargets(p);
  for (const [pos, count] of COMPOSITION) {
    const target = targets[POS_UNIT[pos]];
    const stars = p.standouts.filter((s) => s.pos === pos);
    const group: Seed[] = stars.map((s) => {
      const [floor, over, cap] = STANDOUT_LEVEL[s.tier];
      return { pos, year: s.year, redshirt: s.redshirt, level: clamp(Math.max(floor, target + over) + gauss(rng) * 1.5, 40, cap), standout: s };
    });
    const made: Seed[] = [];
    for (let i = stars.length; i < count; i++) {
      const year = weighted(rng, CLASS_SHARE);
      const redshirt = rng() < REDSHIRT_ODDS[year];
      made.push({ pos, year, redshirt, level: CLASS_ADJ[year] + (redshirt ? REDSHIRT_ADJ : 0) + gauss(rng) * LEVEL_SD });
    }
    // Calibrate: the position's starters, standouts included, average the unit target. With every
    // starting spot held by standouts, the generated players are backups a step below.
    if (made.length) {
      made.sort((a, b) => b.level - a.level);
      const n = STARTERS[pos];
      const starting = group.map((g) => g.level).sort((a, b) => b - a).slice(0, n);
      const open = n - starting.length;
      const k = Math.max(1, Math.min(made.length, open));
      const top = made.slice(0, k).reduce((s, x) => s + x.level, 0) / k;
      const aim =
        open > 0
          ? clamp((target * n - starting.reduce((a, b) => a + b, 0)) / open, target - STANDOUT_ROOM, target)
          : target - BACKUP_GAP;
      for (const m of made) m.level = clamp(m.level + aim - top, 35, 99);
      aims.set(pos, { aim, k });
    }
    seeds.push(...group, ...made);
  }

  const used = new Set<number>();
  const athletes: Athlete[] = [];
  const byPos = new Map<Position, number>();
  const qbStandout = p.standouts.some((x) => x.pos === 'QB');
  /** Overall each player still has to grow, set at creation; potential is fixed after calibration. */
  const growth: number[] = [];
  for (const s of seeds) {
    const role = POS_ROLE[s.pos];
    const nth = byPos.get(s.pos) ?? 0;
    byPos.set(s.pos, nth + 1);
    let archetype: string;
    if (s.standout) archetype = s.standout.archetype;
    // With no researched QB, the starter (the best generated one) plays the team's QB style.
    else if (s.pos === 'QB' && !qbStandout && nth === 0) archetype = QB_STYLE_ARCH[p.offense.qbStyle];
    else archetype = weighted(rng, archetypeOdds(s.pos, p));
    const b = BUILD[s.pos];
    const hz = clamp(gauss(rng), -2.2, 2.2);
    const wz = clamp(gauss(rng) * 0.8 + hz * 0.45, -2.5, 2.5);
    const r = rollRatings(rng, s.pos, archetype, s.level, wz, hz);
    const dev = devTrait(rng, s.level);
    growth.push(Math.max(0, GROWTH[s.year] * DEV_MULT[dev] + gauss(rng) * 3));
    let first: string;
    let last: string;
    if (s.standout) {
      const parts = s.standout.name.split(' ');
      first = parts[0];
      last = parts.slice(1).join(' ') || parts[0];
    } else {
      first = pick(rng, FIRST_NAMES);
      last = pick(rng, LAST_NAMES);
    }
    athletes.push({
      id: `${p.id}-${athletes.length}`,
      first,
      last,
      num: pickNumber(rng, role, used),
      pos: s.pos,
      archetype,
      year: s.year,
      redshirt: s.redshirt,
      heightIn: Math.round(b.h[0] + hz * b.h[1]),
      weightLb: Math.round(b.w[0] + wz * b.w[1]),
      hometown: hometown(rng, p),
      stars: 1,
      potential: 0,
      dev,
      r,
      skin: pick(rng, SKINS),
      injury: null,
      ...(s.standout ? { real: true } : {}),
    });
  }
  // Starters are picked by overall from a noisy pool, which beats the levels they were rolled at.
  // Calibrate the rolled overalls so a position's generated starters really average its aim.
  for (const [pos, { aim, k }] of aims) {
    const made = athletes.filter((a) => a.pos === pos && !a.real);
    const top = made.map((a) => overallRaw(a.r, pos)).sort((a, b) => b - a).slice(0, k);
    const delta = aim - top.reduce((x, y) => x + y, 0) / top.length;
    for (const a of made) shiftOverall(a.r, pos, delta);
  }
  // A researched player starts: lift any standout who fell outside his position's starters.
  for (const a of athletes) {
    if (!a.real) continue;
    const others = athletes.filter((x) => x.pos === a.pos && !x.real).map((x) => overallRaw(x.r, a.pos)).sort((x, y) => y - x);
    const bar = others[STARTERS[a.pos] - 1];
    const mine = overallRaw(a.r, a.pos);
    if (bar !== undefined && mine < bar + 1) shiftOverall(a.r, a.pos, bar + 1 - mine);
  }
  athletes.forEach((a, i) => {
    const ovr = overallRaw(a.r, a.pos);
    a.potential = Math.round(clamp(ovr + growth[i], ovr, 99));
    a.stars = starsFor(a.potential, a.dev);
  });
  return athletes;
}

