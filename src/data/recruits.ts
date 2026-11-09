import type { Athlete } from './athletes';
import { CITIES, REGION, TALENT, TEAM_STATE } from './fbs/geo';
import { overallRaw, type Position } from './positions';
import { COMPOSITION, LEVEL_SD, rollFreshman } from './rosterGen';
import { TEAMS } from './teams';
import { clamp, gauss, hashString, mulberry32 } from '../engine/math';

/**
 * The high school class (docs/RECRUITING.md, phase 2): every prospect a season's recruiting cycle can
 * sign. Data only: nothing here reads the season.
 *
 * Each prospect is rolled at one FBS program's generated-freshman level (`rollFreshman`), so the class
 * as a whole holds the talent the generated rosters were built with, plus `extra` prospects under FBS
 * level who mostly end up at FCS schools. Which program he was rolled from is never shown; the
 * recruiting market decides where he goes. His id, `r{class}.{salt}.{n}`, is all he needs to be
 * rebuilt: the class (the season he enrolls), a salt from the career's seed, and his number.
 *
 * What the user sees is the services' composite: stars, national and position rank, from his level
 * and upside plus noise. The noise is bigger in states that produce few FBS players and outside the big
 * metro (`noise`), and late bloomers (an elite or star development trait) are underrated (`late`).
 *
 * Tuning:
 * - `perTeam`: prospects rolled per FBS program; `extra` under FBS level, `extraUnder` points below a tier-5 class.
 * - `tierShift`: points added to a program-tier's prospects, and `spread` their spread against the
 *   generator's (`LEVEL_SD`). The market sorts the class into contiguous bands by tier, where generated
 *   rosters overlap, so a narrower spread keeps each tier's signees at its generated-freshman level.
 * - `upside`: share of his growth room the composite counts.
 * - `noise`: the composite's SD, `base` plus `thin` in a state with little talent (scaled by `TALENT`), plus `town` off the big metro.
 * - `stars`: national ranks that earn 5, 4 and 3 stars (the rest are 2-stars).
 * - Personality: `timeline` odds (early commits in the summer, late ones wait for signing day), `dream`
 *   the share with a dream school.
 */
export const RECRUITS = {
  perTeam: 23,
  extra: 350,
  extraUnder: 6,
  tierShift: [0, 0.5, 0, -2.5, -5] as number[],
  spread: 0.6,
  upside: 0.6,
  noise: { base: 2.2, thin: 2.5, town: 0.8, late: { elite: 4, star: 2, impact: 0, normal: 0 } },
  stars: [32, 430, 2230],
  timeline: { early: 0.45, late: 0.15, topLate: 0.05 },
  dream: 0.15,
};

export type Want = 'PT' | 'WIN' | 'DEV' | 'HOME' | 'NFL' | 'COACH';
export const WANTS: Want[] = ['PT', 'WIN', 'DEV', 'HOME', 'NFL', 'COACH'];
export const WANT_LABEL: Record<Want, string> = {
  PT: 'EARLY PLAYING TIME', WIN: 'A WINNER', DEV: 'DEVELOPMENT', HOME: 'CLOSE TO HOME', NFL: 'THE NFL PATH', COACH: 'HIS RECRUITER',
};

/** A recruit's own makeup, hidden and drawn from his id. */
export interface Makeup {
  /** When he wants to decide: in the summer, during the season (from `week`), or on signing day. */
  timeline: 'early' | 'normal' | 'late';
  week: number;
  /** Resistance to flips and decommits, about 0.4-1.6. */
  firm: number;
  /** How much a visit's atmosphere and result move him, about 0.3-1.8. */
  spotlight: number;
  /** A dream school, for about one in seven. */
  dream?: string;
  /** What he wants from a school, summing to 1. */
  wants: Record<Want, number>;
}

export interface Prospect {
  id: string;
  /** The truth: his ratings as an incoming freshman, potential and development trait. Never shown before he enrolls. */
  a: Athlete;
  pos: Position;
  /** His true overall as a freshman. */
  level: number;
  /** The services' read: the level they think he is (`pub`), the composite score it ranks on, and the ranks. */
  pub: number;
  comp: number;
  rank: number;
  posRank: number;
  stars: Athlete['stars'];
  m: Makeup;
}

export interface Pool {
  cls: number;
  salt: string;
  list: Prospect[];
  byId: Map<string, Prospect>;
}

/** The career's salt for recruit ids: a short code from its seed. */
export function recruitSalt(seed: number): string {
  return (hashString(`recruits:${seed}`) % 36 ** 4).toString(36);
}

export function recruitId(cls: number, salt: string, n: number): string {
  return `r${cls}.${salt}.${n}`;
}

export function parseRecruit(id: string): { cls: number; salt: string; n: number } | undefined {
  const m = /^r(\d+)\.([a-z0-9]+)\.(\d+)$/.exec(id);
  return m ? { cls: Number(m[1]), salt: m[2], n: Number(m[3]) } : undefined;
}

const COMP_TOTAL = COMPOSITION.reduce((s, [, c]) => s + c, 0);
const FBS = TEAMS.length * RECRUITS.perTeam;
const TIER5 = TEAMS.filter((t) => t.profile.tier === 5);

function pickPos(r: number): Position {
  let x = r * COMP_TOTAL;
  for (const [p, c] of COMPOSITION) {
    x -= c;
    if (x <= 0) return p;
  }
  return 'WR';
}

/** His makeup: personality and wants, drawn from his id. Top prospects take their time more often. */
function makeup(id: string, home: string, stars: number): Makeup {
  const rng = mulberry32(hashString(`makeup:${id}`));
  const T = RECRUITS.timeline;
  const r = rng();
  const early = T.early - (stars >= 4 ? T.topLate : 0);
  const timeline = r < early ? 'early' : r < early + T.late + (stars >= 4 ? T.topLate : 0) ? 'late' : 'normal';
  const week = 1 + Math.floor(rng() * 14);
  const firm = clamp(1 + 0.3 * gauss(rng), 0.4, 1.6);
  const spotlight = clamp(1 + 0.35 * gauss(rng), 0.3, 1.8);
  let dream: string | undefined;
  if (rng() < RECRUITS.dream) {
    // Usually a school from home or a big brand.
    const opts = TEAMS.map((t) => {
      const st = TEAM_STATE[t.id];
      const near = st === home ? 3 : REGION[st] === REGION[home] ? 1.2 : 0.3;
      return [t.id, near * (t.profile.prestige / 50) ** 3] as const;
    });
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let x = rng() * total;
    for (const [t, w] of opts) {
      x -= w;
      if (x <= 0) {
        dream = t;
        break;
      }
    }
  }
  const raw: Record<Want, number> = {
    PT: Math.max(0.05, 0.4 + 0.25 * gauss(rng)),
    WIN: Math.max(0.05, 1.1 + 0.35 * gauss(rng)),
    DEV: Math.max(0.05, 0.6 + 0.3 * gauss(rng)),
    HOME: Math.max(0.05, 0.55 + 0.35 * gauss(rng)),
    NFL: Math.max(0.05, 0.25 + 0.12 * stars + 0.25 * gauss(rng)),
    COACH: Math.max(0.05, 0.35 + 0.2 * gauss(rng)),
  };
  const sum = WANTS.reduce((s, k) => s + raw[k], 0);
  const wants = Object.fromEntries(WANTS.map((k) => [k, raw[k] / sum])) as Record<Want, number>;
  return { timeline, week, firm, spotlight, dream, wants };
}

/** One prospect's truth and the composite's noise, before the class is ranked. */
function rollProspect(cls: number, salt: string, n: number): { id: string; a: Athlete; level: number; pub: number; comp: number } {
  const id = recruitId(cls, salt, n);
  const rng = mulberry32(hashString(`prospect:${id}`));
  const fbs = n < FBS;
  const team = fbs ? TEAMS[n % TEAMS.length] : TIER5[n % TIER5.length];
  const shift = fbs ? RECRUITS.tierShift[team.profile.tier - 1] : -RECRUITS.extraUnder;
  const pos = pickPos(rng());
  const a = rollFreshman(team.profile, id, pos, 'recruit', shift, LEVEL_SD * RECRUITS.spread);
  const level = overallRaw(a.r, pos);
  const N = RECRUITS.noise;
  const st = a.hometown.state;
  const thin = 1 - Math.min(1, (TALENT[st] ?? 0.3) / 8);
  const town = a.hometown.city === CITY0[st] ? 0 : N.town;
  const noise = gauss(rng) * (N.base + N.thin * thin + town);
  const pub = level + noise;
  const comp = level + RECRUITS.upside * (a.potential - level) + noise - N.late[a.dev];
  return { id, a, level, pub, comp };
}

const CITY0: Record<string, string> = Object.fromEntries(Object.entries(CITIES).map(([s, c]) => [s, c[0]]));

const pools = new Map<string, Pool>();
/**
 * Pools kept at once, least recently used out first. Rosters hold up to five classes (redshirts stay a
 * fifth year), plus the class just signed and the one being recruited. Fewer than the live classes and a
 * roster walk rebuilds a pool on nearly every player (a 26 s freeze at a dynasty's fifth signing day).
 */
const POOL_CACHE = 8;

/** The class of `cls` for a career, ranked by the services. Cached (`POOL_CACHE` classes at a time). */
export function recruitPool(cls: number, salt: string): Pool {
  const key = `${cls}.${salt}`;
  const hit = pools.get(key);
  if (hit) {
    pools.delete(key);
    pools.set(key, hit);
    return hit;
  }
  const rolled = Array.from({ length: FBS + RECRUITS.extra }, (_, n) => rollProspect(cls, salt, n));
  rolled.sort((x, y) => y.comp - x.comp);
  const posN = new Map<Position, number>();
  const [five, four, three] = RECRUITS.stars;
  const list: Prospect[] = rolled.map((r, i) => {
    const rank = i + 1;
    const stars: Athlete['stars'] = rank <= five ? 5 : rank <= four ? 4 : rank <= three ? 3 : 2;
    const posRank = (posN.get(r.a.pos) ?? 0) + 1;
    posN.set(r.a.pos, posRank);
    r.a.stars = stars;
    return { id: r.id, a: r.a, pos: r.a.pos, level: r.level, pub: r.pub, comp: r.comp, rank, posRank, stars, m: makeup(r.id, r.a.hometown.state, stars) };
  });
  const pool = { cls, salt, list, byId: new Map(list.map((p) => [p.id, p])) };
  if (pools.size >= POOL_CACHE) {
    const old = pools.values().next().value!;
    for (const id of old.byId.keys()) known.delete(id);
    pools.delete(pools.keys().next().value!);
  }
  pools.set(key, pool);
  for (const p of list) known.set(p.id, p);
  return pool;
}

/** Prospects of the cached classes by id: `prospect` is called in every inner loop. */
const known = new Map<string, Prospect>();

/** A prospect by id, from his class. */
export function prospect(id: string): Prospect | undefined {
  const hit = known.get(id);
  if (hit) return hit;
  const r = parseRecruit(id);
  return r ? recruitPool(r.cls, r.salt).byId.get(id) : undefined;
}

/** A recruit as an athlete (rebuilt from his id), as he arrives as a freshman. */
export function recruitAthlete(id: string): Athlete | undefined {
  return prospect(id)?.a;
}
