import type { Position } from './positions';
import type { RatingKey, Ratings } from './ratings';

export type ClassYear = 'FR' | 'SO' | 'JR' | 'SR';
export type DevTrait = 'normal' | 'impact' | 'star' | 'elite';

/** A player on a team's full roster. The sim sees only the slim `RosterPlayer` built from this. */
export interface Athlete {
  id: string;
  first: string;
  last: string;
  num: number;
  pos: Position;
  archetype: string;
  year: ClassYear;
  /** Has used his redshirt year ("RS SO"); it adds a year of development, not of eligibility. */
  redshirt: boolean;
  heightIn: number;
  weightLb: number;
  hometown: { city: string; state: string };
  /** Recruiting stars. */
  stars: 1 | 2 | 3 | 4 | 5;
  /** Ceiling overall, for progression later. */
  potential: number;
  dev: DevTrait;
  r: Ratings;
  skin: string;
  injury: { weeks: number } | null;
  /** A real player from the team research (docs/ROSTERS.md). */
  real?: boolean;
}

export const CLASS_YEARS: ClassYear[] = ['FR', 'SO', 'JR', 'SR'];

export function classLabel(a: Pick<Athlete, 'year' | 'redshirt'>): string {
  return a.redshirt ? `RS ${a.year}` : a.year;
}

export function heightLabel(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

/**
 * Rating template per position: [value at level 75, slope with level]. A player at level L gets
 * `v75 + slope·(L − 75)` before archetype, build and noise. Skill ratings track the level (slope ~1);
 * physical limits barely move (an elite tackle is still slow). Unlisted ratings use `REST`.
 * Anchored so a level-88 player matches the ratings the playbook was balanced with (the old
 * 89-overall team templates). `bsh` and `rbk` off a player's own side of the ball are for
 * special-teams coverage and return blocks; an offensive player sheds with his strength profile,
 * and his `tkl` is his coverage tackle (it carries no weight in his overall).
 */
type Template = Partial<Record<RatingKey, [number, number]>>;
const REST: [number, number] = [32, 0.1];

export const TEMPLATES: Record<Position, Template> = {
  QB: {
    spd: [74, 0.4], acc: [78, 0.4], str: [63, 0.3], sta: [77, 0.4], elu: [66, 0.5], cth: [50, 0.1],
    arm: [80, 1], sac: [79, 1], mac: [77, 1], dac: [74, 1], tup: [68, 1], pac: [69, 1], prc: [65, 0.5],
    bsh: [63, 0.3], tkl: [35, 0],
  },
  HB: {
    spd: [89, 0.5], acc: [89, 0.5], str: [75, 0.6], sta: [88, 0.5], elu: [80, 1], cth: [67, 0.8], cit: [60, 0.6],
    rte: [62, 0.6], rls: [60, 0.4], pbk: [52, 0.8], rbk: [50, 0.6], tkl: [55, 0.3], prc: [55, 0.3], bsh: [75, 0.6],
  },
  FB: {
    spd: [83, 0.4], acc: [83, 0.4], str: [79, 0.8], sta: [75, 0.4], elu: [65, 0.4], cth: [62, 0.6], cit: [58, 0.5],
    rte: [55, 0.4], rls: [58, 0.3], pbk: [62, 1], rbk: [64, 1], tkl: [62, 0.3], bsh: [79, 0.8],
  },
  WR: {
    spd: [91, 0.5], acc: [90, 0.5], str: [57, 0.4], sta: [90, 0.5], elu: [79, 0.8], cth: [79, 1], cit: [77, 1],
    rte: [83, 1], rls: [56, 0.5], rbk: [45, 0.5], pbk: [38, 0.3], tkl: [50, 0.3], bsh: [57, 0.4],
  },
  TE: {
    spd: [79, 0.5], acc: [77, 0.5], str: [75, 0.6], sta: [78, 0.5], elu: [66, 0.5], cth: [73, 1], cit: [71, 1],
    rte: [71, 1], rls: [70, 0.5], rbk: [64, 1], pbk: [62, 1], tkl: [60, 0.3], bsh: [75, 0.6],
  },
  OT: { spd: [55, 0.3], acc: [58, 0.4], str: [83, 0.8], sta: [55, 0.3], pbk: [78, 1], rbk: [76, 1], tkl: [55, 0.3], bsh: [83, 0.8], cth: [37, 0] },
  OG: { spd: [53, 0.3], acc: [57, 0.4], str: [84, 0.8], sta: [55, 0.3], pbk: [76, 1], rbk: [78, 1], tkl: [55, 0.3], bsh: [84, 0.8], cth: [37, 0] },
  C: { spd: [53, 0.3], acc: [58, 0.4], str: [82, 0.8], sta: [55, 0.3], pbk: [77, 1], rbk: [77, 1], tkl: [55, 0.3], bsh: [82, 0.8], cth: [37, 0] },
  DE: {
    spd: [72, 0.6], acc: [76, 0.6], str: [80, 0.7], sta: [62, 0.3], elu: [42, 0.2], cth: [45, 0.2], tkl: [72, 1],
    rsh: [81, 1], bsh: [77, 1], mcv: [42, 0.3], zcv: [44, 0.3], prs: [50, 0.3], prc: [66, 0.8], rbk: [42, 0.3],
  },
  DT: {
    spd: [68, 0.5], acc: [72, 0.5], str: [85, 0.7], sta: [58, 0.3], cth: [42, 0.2], tkl: [72, 1],
    rsh: [76, 1], bsh: [81, 1], mcv: [34, 0.2], zcv: [36, 0.2], prs: [45, 0.2], prc: [66, 0.8], rbk: [42, 0.3],
  },
  OLB: {
    spd: [80, 0.6], acc: [81, 0.6], str: [75, 0.6], sta: [68, 0.4], elu: [48, 0.3], cth: [60, 0.5], tkl: [79, 1],
    rsh: [70, 1], bsh: [70, 1], mcv: [72, 1], zcv: [72, 1], prs: [55, 0.5], prc: [72, 1], rbk: [47, 0.3],
  },
  MLB: {
    spd: [78, 0.6], acc: [80, 0.6], str: [75, 0.6], sta: [68, 0.4], elu: [48, 0.3], cth: [60, 0.5], tkl: [79, 1],
    rsh: [66, 0.8], bsh: [72, 1], mcv: [70, 1], zcv: [72, 1], prs: [52, 0.4], prc: [74, 1], rbk: [47, 0.3],
  },
  CB: {
    spd: [92, 0.5], acc: [91, 0.5], str: [57, 0.4], sta: [78, 0.4], elu: [72, 0.4], cth: [63, 0.8], cit: [58, 0.4],
    tkl: [63, 0.8], rsh: [45, 0.3], bsh: [55, 0.5], mcv: [74, 1], zcv: [74, 1], prs: [56, 0.5], prc: [74, 1], rbk: [40, 0.2],
  },
  FS: {
    spd: [89, 0.5], acc: [88, 0.5], str: [65, 0.5], sta: [76, 0.4], elu: [65, 0.4], cth: [63, 0.8], cit: [58, 0.4],
    tkl: [72, 1], rsh: [48, 0.3], bsh: [62, 0.6], mcv: [72, 1], zcv: [78, 1], prs: [60, 0.5], prc: [76, 1], rbk: [42, 0.2],
  },
  SS: {
    spd: [87, 0.5], acc: [86, 0.5], str: [69, 0.5], sta: [76, 0.4], elu: [62, 0.4], cth: [60, 0.8], cit: [55, 0.4],
    tkl: [76, 1], rsh: [52, 0.5], bsh: [66, 0.8], mcv: [72, 1], zcv: [74, 1], prs: [60, 0.5], prc: [76, 1], rbk: [42, 0.2],
  },
  K: { spd: [60, 0.1], acc: [62, 0.1], str: [48, 0.1], sta: [60, 0.1], kpw: [76, 1], kac: [75, 1], tkl: [35, 0], bsh: [40, 0.1] },
  P: { spd: [62, 0.1], acc: [62, 0.1], str: [50, 0.1], sta: [60, 0.1], cth: [70, 0.4], kpw: [76, 1], kac: [73, 1], tkl: [35, 0], bsh: [40, 0.1] },
};

export function templateValue(pos: Position, k: RatingKey, level: number): number {
  const [v, slope] = TEMPLATES[pos][k] ?? REST;
  return v + slope * (level - 75);
}

/** Archetypes per position: rating shifts on top of the template. The first is the most common. */
export const ARCHETYPES: Record<Position, Record<string, Partial<Record<RatingKey, number>>>> = {
  QB: {
    pocket: { sac: 3, mac: 3, dac: 3, pac: 3, arm: 2, spd: -6, acc: -4, elu: -6, sta: -3 },
    dual: { spd: 8, acc: 6, elu: 8, sta: 8, tup: 4, sac: -1, dac: -3 },
    scrambler: { spd: 12, acc: 8, elu: 12, sta: 10, tup: 6, sac: -4, mac: -4, dac: -5, pac: -3 },
  },
  HB: {
    elusive: { elu: 6, spd: 3, acc: 3, str: -5 },
    power: { str: 8, elu: -4, spd: -3, pbk: 4 },
    receiving: { cth: 10, cit: 6, rte: 10, str: -3 },
  },
  FB: { blocking: {} },
  WR: {
    possession: { cth: 5, cit: 5, rte: 4, spd: -4 },
    deep: { spd: 5, acc: 2, cit: 2, rte: -2, cth: -2 },
    slot: { acc: 4, rte: 5, elu: 4, cit: -4, str: -4, spd: -1 },
  },
  TE: {
    receiving: { cth: 5, cit: 4, rte: 6, spd: 3, rbk: -6, pbk: -5 },
    blocking: { rbk: 8, pbk: 6, str: 4, cth: -6, cit: -4, rte: -6, spd: -4 },
  },
  OT: { pass: { pbk: 5, rbk: -3 }, run: { rbk: 5, pbk: -3, str: 2 } },
  OG: { run: { rbk: 5, pbk: -3, str: 2 }, pass: { pbk: 5, rbk: -3 } },
  C: { run: { rbk: 5, pbk: -3, str: 2 }, pass: { pbk: 5, rbk: -3 } },
  DE: { speed: { spd: 5, acc: 5, rsh: 5, bsh: -4, str: -5 }, power: { str: 6, bsh: 5, rsh: 1, spd: -4 } },
  DT: { power: { bsh: 6, str: 5, rsh: -3, spd: -3 }, quick: { rsh: 6, acc: 5, spd: 3, bsh: -3, str: -3 } },
  OLB: {
    run: { tkl: 4, bsh: 6, str: 3, mcv: -4, zcv: -3 },
    coverage: { mcv: 6, zcv: 6, spd: 3, bsh: -5, rsh: -6 },
    rusher: { rsh: 12, spd: 2, mcv: -6, zcv: -6 },
  },
  MLB: { run: { tkl: 4, bsh: 5, str: 3, zcv: -4, mcv: -4 }, coverage: { zcv: 6, mcv: 5, spd: 3, bsh: -5 } },
  CB: { man: { mcv: 5, prs: 6, zcv: -4 }, zone: { zcv: 6, prc: 4, mcv: -4, prs: -4 } },
  FS: { coverage: { zcv: 5, mcv: 5, tkl: -3, bsh: -5 }, hybrid: {}, box: { tkl: 5, bsh: 6, str: 3, zcv: -5, mcv: -4 } },
  SS: { hybrid: {}, box: { tkl: 5, bsh: 6, str: 3, zcv: -5, mcv: -4 }, coverage: { zcv: 5, mcv: 5, tkl: -3, bsh: -5 } },
  K: { accurate: { kac: 5, kpw: -4 }, power: { kpw: 6, kac: -3 } },
  P: { power: { kpw: 6, kac: -3 }, accurate: { kac: 5, kpw: -3 } },
};

/** Archetype names for the player card, where the key alone doesn't say it ("run" means a different thing for a guard and a linebacker). */
const ARCHETYPE_LABEL: Partial<Record<Position, Record<string, string>>> = {
  QB: { pocket: 'Pocket Passer', dual: 'Dual Threat', scrambler: 'Scrambler' },
  HB: { elusive: 'Elusive Back', power: 'Power Back', receiving: 'Receiving Back' },
  FB: { blocking: 'Blocking Back' },
  WR: { possession: 'Possession', deep: 'Deep Threat', slot: 'Slot' },
  TE: { receiving: 'Receiving', blocking: 'Blocking' },
  OT: { pass: 'Pass Protector', run: 'Run Blocker' },
  OG: { pass: 'Pass Protector', run: 'Run Blocker' },
  C: { pass: 'Pass Protector', run: 'Run Blocker' },
  DE: { speed: 'Speed Rusher', power: 'Power Rusher' },
  DT: { power: 'Run Stuffer', quick: 'Interior Rusher' },
  OLB: { run: 'Run Stopper', coverage: 'Coverage', rusher: 'Edge Rusher' },
  MLB: { run: 'Run Stopper', coverage: 'Coverage' },
  CB: { man: 'Man Corner', zone: 'Zone Corner' },
  FS: { coverage: 'Centerfielder', hybrid: 'Hybrid', box: 'Box Safety' },
  SS: { coverage: 'Coverage', hybrid: 'Hybrid', box: 'Box Safety' },
  K: { accurate: 'Accurate', power: 'Big Leg' },
  P: { accurate: 'Accurate', power: 'Big Leg' },
};

export function archetypeLabel(a: Pick<Athlete, 'pos' | 'archetype'>): string {
  return ARCHETYPE_LABEL[a.pos]?.[a.archetype] ?? a.archetype;
}

export const DEV_LABEL: Record<DevTrait, string> = { normal: 'Normal', impact: 'Impact', star: 'Star', elite: 'Elite' };

/** Height (in) and weight (lb): mean and spread per position. */
export const BUILD: Record<Position, { h: [number, number]; w: [number, number] }> = {
  QB: { h: [74.5, 1.6], w: [215, 12] },
  HB: { h: [70.5, 1.6], w: [205, 12] },
  FB: { h: [72.5, 1.2], w: [240, 10] },
  WR: { h: [72.5, 2.2], w: [192, 13] },
  TE: { h: [76.5, 1.2], w: [245, 11] },
  OT: { h: [77.5, 1.1], w: [310, 13] },
  OG: { h: [76, 1.1], w: [312, 13] },
  C: { h: [75.5, 1], w: [302, 11] },
  DE: { h: [76, 1.3], w: [262, 14] },
  DT: { h: [75, 1.2], w: [302, 15] },
  OLB: { h: [74.5, 1.3], w: [232, 11] },
  MLB: { h: [73.5, 1.1], w: [234, 9] },
  CB: { h: [71.5, 1.6], w: [186, 9] },
  FS: { h: [72.5, 1.4], w: [198, 9] },
  SS: { h: [72.5, 1.3], w: [205, 9] },
  K: { h: [72, 1.8], w: [190, 14] },
  P: { h: [74, 1.8], w: [205, 14] },
};

/**
 * How a player's build bends his ratings, per standard deviation of weight (wz) and height (hz).
 * The sim never reads height or weight; they only shape the ratings here.
 */
export function buildNudge(pos: Position, wz: number, hz: number): Partial<Record<RatingKey, number>> {
  const n: Partial<Record<RatingKey, number>> = { str: 3 * wz, spd: -1.5 * wz, acc: -1.5 * wz, sta: -1.5 * wz };
  if (pos === 'WR' || pos === 'TE' || pos === 'HB') n.cit = 2.5 * hz;
  if (pos === 'WR' || pos === 'CB') n.elu = -1.5 * hz;
  if (pos === 'CB' || pos === 'FS' || pos === 'SS') n.prs = 2 * hz;
  if (pos === 'DE' || pos === 'OLB') n.bsh = 2 * wz;
  if (pos === 'QB') n.dac = 1.5 * hz;
  return n;
}
