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
export const STARTERS: Record<Position, number> = {
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
export const LEVEL_SD = 5;
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

/**
 * The old jersey draw, kept only so a generated roster consumes its stream exactly as before (every
 * rating and name after it depends on that). The number it picks is thrown away; `assignJerseys`
 * numbers the roster on a stream of its own.
 */
const LEGACY_RANGES: Record<Role, [number, number][]> = {
  QB: [[1, 19]], RB: [[0, 9], [20, 49]], WR: [[0, 19], [80, 89]], TE: [[80, 89], [40, 49]], OL: [[50, 79]],
  DL: [[90, 99], [40, 59]], LB: [[0, 9], [30, 59]], CB: [[0, 39]], S: [[0, 39]],
  K: [[1, 49], [90, 99]], P: [[1, 49], [90, 99]],
};
function legacyDraw(rng: Rng, role: Role, used: Set<number>): void {
  const ranges = LEGACY_RANGES[role];
  for (let i = 0; i < 60; i++) {
    const [lo, hi] = pick(rng, ranges);
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    if (!used.has(n)) {
      used.add(n);
      return;
    }
  }
  rng();
}

type Band = [lo: number, hi: number, weight: number];
/**
 * Jersey numbers the way college programs hand them out, by position: [lo, hi, weight] bands. Single
 * digits and the teens go to quarterbacks, skill players, backers, edge rushers and DBs; the line
 * wears 50-79 and the 90s; backs, tight ends and specialists the 20s-40s and 80s. Bands under 10 are
 * the prestige numbers (zero among them): `prestige` bends them toward a roster's best players.
 */
export const JERSEY = {
  bands: {
    QB: [[1, 9, 0.5], [10, 19, 0.5]],
    HB: [[0, 9, 0.35], [20, 39, 0.55], [40, 49, 0.1]],
    FB: [[30, 49, 0.75], [20, 29, 0.25]],
    WR: [[0, 9, 0.35], [10, 19, 0.4], [80, 89, 0.25]],
    TE: [[80, 89, 0.55], [40, 49, 0.25], [10, 19, 0.2]],
    OT: [[50, 79, 1]], OG: [[50, 79, 1]], C: [[50, 79, 1]],
    DE: [[90, 99, 0.45], [40, 59, 0.3], [10, 19, 0.15], [1, 9, 0.1]],
    DT: [[90, 99, 0.55], [50, 69, 0.35], [40, 49, 0.1]],
    OLB: [[0, 9, 0.25], [10, 19, 0.2], [30, 59, 0.55]],
    MLB: [[0, 9, 0.15], [10, 19, 0.15], [30, 59, 0.7]],
    CB: [[0, 9, 0.35], [10, 29, 0.55], [30, 39, 0.1]],
    FS: [[0, 9, 0.25], [10, 39, 0.75]],
    SS: [[0, 9, 0.25], [10, 39, 0.75]],
    K: [[10, 49, 0.6], [90, 99, 0.3], [1, 9, 0.1]],
    P: [[10, 49, 0.6], [90, 99, 0.3], [1, 9, 0.1]],
  } as Record<Position, Band[]>,
  /** A band under 10's weight at prestige 0 (a walk-on) and 1 (the roster's best player). */
  prestige: [0.25, 2.5] as [number, number],
  /** Draws for a number nobody wears, then for one worn only on the other side of the ball. */
  tries: 40,
};

const SIDE: Record<Position, 'O' | 'D' | 'S'> = {
  QB: 'O', HB: 'O', FB: 'O', WR: 'O', TE: 'O', OT: 'O', OG: 'O', C: 'O',
  DE: 'D', DT: 'D', OLB: 'D', MLB: 'D', CB: 'D', FS: 'D', SS: 'D', K: 'S', P: 'S',
};

/** Who already wears what: a roster's numbers and positions. */
type Worn = Iterable<{ num: number; pos: Position }>;

/**
 * A jersey for a player at `pos` joining `roster`, from his position's bands only. A number nobody
 * wears, drawn by the bands' weights; with none drawn, any free one in his bands; with his bands full,
 * one worn only on the other side of the ball (college rosters share numbers between offense and
 * defense). `want` (his old or high school number) is kept when nobody wears it.
 */
export function pickJersey(rng: Rng, pos: Position, roster: Worn, o: { prestige?: number; want?: number } = {}): number {
  const bands = JERSEY.bands[pos];
  const holders = new Map<number, Position[]>();
  for (const x of roster) {
    const h = holders.get(x.num);
    if (h) h.push(x.pos);
    else holders.set(x.num, [x.pos]);
  }
  const free = (n: number) => !holders.has(n);
  const w = o.want;
  if (w !== undefined && free(w) && bands.some(([lo, hi]) => w >= lo && w <= hi)) return w;
  const [p0, p1] = JERSEY.prestige;
  const lean = p0 + (p1 - p0) * clamp(o.prestige ?? 0.5, 0, 1);
  const odds: [Band, number][] = bands.map((b) => [b, b[2] * (b[1] < 10 ? lean : 1)]);
  const draw = () => {
    const [lo, hi] = weighted(rng, odds);
    return lo + Math.floor(rng() * (hi - lo + 1));
  };
  for (let i = 0; i < JERSEY.tries; i++) {
    const n = draw();
    if (free(n)) return n;
  }
  const all = bands.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k));
  const open = all.filter(free);
  if (open.length) return pick(rng, open);
  const shared = all.filter((n) => holders.get(n)!.every((q) => SIDE[q] !== SIDE[pos]));
  return shared.length ? pick(rng, shared) : draw();
}

/** Prestige from where an overall ranks on a roster: 1 above everyone, 0 below everyone. */
export function prestigeIn(roster: { r: Ratings; pos: Position }[], ovr: number): number {
  if (!roster.length) return 0.5;
  return roster.filter((x) => overallRaw(x.r, x.pos) < ovr).length / roster.length;
}

/** A generated roster's jerseys, on their own stream: the best players choose first and lean to the single digits. */
function assignJerseys(p: TeamProfile, athletes: Athlete[]): void {
  const rng = mulberry32(hashString(`jersey:${p.id}`));
  const order = athletes.map((a) => ({ a, ovr: overallRaw(a.r, a.pos) })).sort((x, y) => y.ovr - x.ovr);
  const worn: { num: number; pos: Position }[] = [];
  order.forEach(({ a }, i) => {
    a.num = pickJersey(rng, a.pos, worn, { prestige: 1 - i / Math.max(1, order.length - 1) });
    worn.push(a);
  });
}

/** A seeded stand-in jersey for a player whose number was never kept (a save from before career rows held it). */
export function jerseyFor(id: string, pos: Position): number {
  return pickJersey(mulberry32(hashString(`jersey:${id}`)), pos, [], { prestige: 0.5 });
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
      num: (legacyDraw(rng, role, used), 0),
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
  assignJerseys(p, athletes);
  return athletes;
}

/** Walk-ons start this far under the position's unit target, give or take `WALK_ON.sd`. */
export const WALK_ON = { under: 16, sd: 3, min: 35 };

/** A walk-on's id: his team, the year he joined, his position and a count. It's all he needs to be rebuilt. */
export function walkOnId(teamId: string, year: number, pos: Position, n: number): string {
  return `${teamId}-w${year}.${pos}.${n}`;
}

/** Parses a walk-on id; undefined for a generated player's id. */
export function parseWalkOn(id: string): { team: string; pos: Position } | undefined {
  const m = /^(.*)-w\d+\.([A-Z]+)\.\d+$/.exec(id);
  return m ? { team: m[1], pos: m[2] as Position } : undefined;
}

/**
 * A walk-on freshman (a placeholder for HS recruiting): seeded by his id on his own stream, so
 * generated rosters are untouched. His jersey is picked when he joins.
 */
export function makeWalkOn(p: TeamProfile, id: string, pos: Position): Athlete {
  const rng = mulberry32(hashString(`walkon:${id}`));
  const level = clamp(unitTargets(p)[POS_UNIT[pos]] - WALK_ON.under + gauss(rng) * WALK_ON.sd, WALK_ON.min, 99);
  const archetype = weighted(rng, archetypeOdds(pos, p));
  const b = BUILD[pos];
  const hz = clamp(gauss(rng), -2.2, 2.2);
  const wz = clamp(gauss(rng) * 0.8 + hz * 0.45, -2.5, 2.5);
  const r = rollRatings(rng, pos, archetype, level, wz, hz);
  const dev = devTrait(rng, level);
  const ovr = overallRaw(r, pos);
  const growth = Math.max(0, GROWTH.FR * DEV_MULT[dev] + gauss(rng) * 3);
  return {
    id,
    first: pick(rng, FIRST_NAMES),
    last: pick(rng, LAST_NAMES),
    num: 0,
    pos,
    archetype,
    year: 'FR',
    redshirt: false,
    heightIn: Math.round(b.h[0] + hz * b.h[1]),
    weightLb: Math.round(b.w[0] + wz * b.w[1]),
    hometown: hometown(rng, p),
    stars: 1,
    potential: Math.round(clamp(ovr + growth, ovr, 99)),
    dev,
    r,
    skin: pick(rng, SKINS),
    injury: null,
  };
}

/** A placeholder freshman's id: his team, the season he joins, his position and a count. */
export function freshmanId(teamId: string, year: number, pos: Position, n: number): string {
  return `${teamId}-f${year}.${pos}.${n}`;
}

/** Parses a placeholder freshman's id; undefined for any other id. */
export function parseFreshman(id: string): { team: string; pos: Position } | undefined {
  const m = /^(.*)-f\d+\.([A-Z]+)\.\d+$/.exec(id);
  return m ? { team: m[1], pos: m[2] as Position } : undefined;
}

/** The season a walk-on, freshman or HS recruit joined as a freshman (from his id); undefined for a generated player. */
export function joinYear(id: string): number | undefined {
  const m = /-[wf](\d+)\.[A-Z]+\.\d+$/.exec(id) ?? /^r(\d+)\.[a-z0-9]+\.\d+$/.exec(id);
  return m ? Number(m[1]) : undefined;
}

/**
 * How far a team's generated true freshmen sit from their units' targets, on average: the level a
 * placeholder freshman starts at, so an incoming class matches the one the roster was generated with.
 */
const freshmanOffsets = new Map<string, number>();
function freshmanOffset(p: TeamProfile): number {
  let off = freshmanOffsets.get(p.id);
  if (off !== undefined) return off;
  const targets = unitTargets(p);
  const fr = generateAthletes(p).filter((a) => a.year === 'FR' && !a.redshirt && !a.real);
  off = fr.length ? fr.reduce((s, a) => s + overallRaw(a.r, a.pos) - targets[POS_UNIT[a.pos]], 0) / fr.length : CLASS_ADJ.FR;
  freshmanOffsets.set(p.id, off);
  return off;
}

/** The level a team's generated true freshmen sit at, at a position: where its incoming class starts. */
export function freshmanLevel(p: TeamProfile, pos: Position): number {
  return unitTargets(p)[POS_UNIT[pos]] + freshmanOffset(p);
}

/**
 * A placeholder freshman, standing in for a recruiting class until HS recruiting: rolled at his team's
 * generated-freshman level (`freshmanOffset`, spread `LEVEL_SD`), with growth and potential as the
 * generator gives a freshman. Seeded by his id on his own stream; his jersey is picked when he joins.
 */
export function makeFreshman(p: TeamProfile, id: string, pos: Position): Athlete {
  return rollFreshman(p, id, pos, 'freshman', 0, LEVEL_SD);
}

/**
 * An incoming freshman rolled at `p`'s generated-freshman level plus `shift`, spread `sd`, on the
 * stream `${key}:${id}`. Placeholder freshmen and HS recruits (data/recruits.ts) are both made here.
 */
export function rollFreshman(p: TeamProfile, id: string, pos: Position, key: string, shift: number, sd: number): Athlete {
  const rng = mulberry32(hashString(`${key}:${id}`));
  const level = clamp(freshmanLevel(p, pos) + shift + gauss(rng) * sd, 35, 99);
  const archetype = weighted(rng, archetypeOdds(pos, p));
  const b = BUILD[pos];
  const hz = clamp(gauss(rng), -2.2, 2.2);
  const wz = clamp(gauss(rng) * 0.8 + hz * 0.45, -2.5, 2.5);
  const r = rollRatings(rng, pos, archetype, level, wz, hz);
  const dev = devTrait(rng, level);
  const ovr = overallRaw(r, pos);
  const potential = Math.round(clamp(ovr + Math.max(0, GROWTH.FR * DEV_MULT[dev] + gauss(rng) * 3), ovr, 99));
  return {
    id,
    first: pick(rng, FIRST_NAMES),
    last: pick(rng, LAST_NAMES),
    num: 0,
    pos,
    archetype,
    year: 'FR',
    redshirt: false,
    heightIn: Math.round(b.h[0] + hz * b.h[1]),
    weightLb: Math.round(b.w[0] + wz * b.w[1]),
    hometown: hometown(rng, p),
    stars: starsFor(potential, dev),
    potential,
    dev,
    r,
    skin: pick(rng, SKINS),
    injury: null,
  };
}


