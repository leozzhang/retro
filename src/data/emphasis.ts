import type { Group } from './coaches';
import type { Position } from './positions';
import type { RatingKey } from './ratings';

/**
 * Weekly emphases: what each position coach can have his group practice this week (docs/COACHES.md).
 * `standard` (every group's default) is the normal practice week: the usual level-up draws and no
 * effect on the field. Anything else steers the group's level-ups toward `ratings` and, in simulated
 * play, gives a small edge in its situation (season/emphasis.ts). Plain data.
 */

/** What a simulated snap gets: rating points on the gain (`edge`), big-play odds, takeaway odds, or field goal odds. */
export type EffectKind = 'edge' | 'explosive' | 'turnover' | 'fg';
/** Pass effects are worth more on likely pass snaps (and against pass-heavy offenses), run effects on run snaps. */
export type EffectPhase = 'pass' | 'run' | 'any';
/**
 * Which snaps it applies on: every snap, passing downs (3rd/4th and 5+, 2nd and 8+), 2 or less to go,
 * inside the 20, inside the 20 or a passing down, or field goals of 45+ / under 45.
 */
export type EffectWhen = 'all' | 'passDown' | 'shortYd' | 'redZone' | 'redOrPassDown' | 'longFg' | 'shortFg';

export interface EmphasisEffect {
  kind: EffectKind;
  phase: EffectPhase;
  when: EffectWhen;
  /** Snaps where it counts double. */
  double?: EffectWhen;
}

export interface EmphasisDef {
  id: string;
  group: Group;
  label: string;
  /** What the players practice, for the staff page. */
  blurb: string;
  /** What it does on game day, a few words. */
  game: string;
  ratings: RatingKey[];
  effect?: EmphasisEffect;
}

export const STANDARD = 'standard';

/** The positions each position coach works with. */
export const GROUP_POS: Record<Group, Position[]> = {
  QB: ['QB'], RB: ['HB', 'FB'], WR: ['WR'], TE: ['TE'], OL: ['OT', 'OG', 'C'],
  DL: ['DE', 'DT'], LB: ['OLB', 'MLB'], DB: ['CB', 'FS', 'SS'], ST: ['K', 'P'],
};

/** The group's slots in its unit's `TEAM_WEIGHTS` (data/depth.ts): how much of the unit it is. */
export const GROUP_SLOTS: Record<Group, { unit: 'off' | 'def' | 'st'; slots: string[] }> = {
  QB: { unit: 'off', slots: ['QB'] },
  RB: { unit: 'off', slots: ['RB'] },
  WR: { unit: 'off', slots: ['X', 'Z', 'SL'] },
  TE: { unit: 'off', slots: ['TE'] },
  OL: { unit: 'off', slots: ['LT', 'LG', 'C', 'RG', 'RT'] },
  DL: { unit: 'def', slots: ['DE1', 'DE2', 'DT1', 'DT2'] },
  LB: { unit: 'def', slots: ['WLB', 'MLB'] },
  DB: { unit: 'def', slots: ['CB1', 'CB2', 'NB', 'FS', 'SS'] },
  ST: { unit: 'st', slots: ['K'] },
};

const e = (kind: EffectKind, phase: EffectPhase, when: EffectWhen, double?: EffectWhen): EmphasisEffect => ({ kind, phase, when, ...(double ? { double } : {}) });

export const EMPHASES: EmphasisDef[] = [
  { id: 'qb-poise', group: 'QB', label: 'POCKET POISE', blurb: 'STAND IN AGAINST PRESSURE', game: 'PASSING DOWNS', ratings: ['pac', 'tup'], effect: e('edge', 'pass', 'passDown') },
  { id: 'qb-accuracy', group: 'QB', label: 'ACCURACY', blurb: 'SHORT AND MID-RANGE PLACEMENT', game: 'EVERY PASS', ratings: ['sac', 'mac'], effect: e('edge', 'pass', 'all') },
  { id: 'qb-deep', group: 'QB', label: 'DEEP BALL', blurb: 'DRIVE THE BALL DOWNFIELD', game: 'MORE BIG PASS PLAYS', ratings: ['dac', 'arm'], effect: e('explosive', 'pass', 'all') },
  { id: 'rb-tackles', group: 'RB', label: 'BREAK TACKLES', blurb: 'MAKE THE FIRST MAN MISS', game: 'MORE BIG RUNS', ratings: ['elu', 'str'], effect: e('explosive', 'run', 'all') },
  { id: 'rb-protect', group: 'RB', label: 'PASS PRO', blurb: 'PICK UP THE BLITZ', game: 'PASSING DOWNS', ratings: ['pbk'], effect: e('edge', 'pass', 'passDown') },
  { id: 'rb-short', group: 'RB', label: 'SHORT YARDAGE', blurb: 'LOWER THE PAD LEVEL', game: '2 OR LESS TO GO', ratings: ['str', 'rbk'], effect: e('edge', 'run', 'shortYd') },
  { id: 'wr-routes', group: 'WR', label: 'ROUTE RUNNING', blurb: 'SHARP BREAKS, BEAT THE JAM', game: 'EVERY PASS', ratings: ['rte', 'rls'], effect: e('edge', 'pass', 'all') },
  { id: 'wr-contested', group: 'WR', label: 'CONTESTED CATCHES', blurb: 'WIN THE BALL IN TRAFFIC', game: 'RED ZONE, PASSING DOWNS', ratings: ['cit', 'cth'], effect: e('edge', 'pass', 'redOrPassDown') },
  { id: 'wr-blocking', group: 'WR', label: 'PERIMETER BLOCKING', blurb: 'STALK THE CORNERS ON RUNS', game: 'MORE BIG RUNS', ratings: ['rbk'], effect: e('explosive', 'run', 'all') },
  { id: 'te-blocking', group: 'TE', label: 'BLOCKING', blurb: 'SEAL THE EDGE, PROTECT', game: 'EVERY RUN', ratings: ['rbk', 'pbk'], effect: e('edge', 'run', 'all') },
  { id: 'te-receiving', group: 'TE', label: 'RECEIVING', blurb: 'SEAMS AND HANDS', game: 'RED ZONE PASSES', ratings: ['rte', 'cth', 'cit'], effect: e('edge', 'pass', 'redZone') },
  { id: 'ol-pass', group: 'OL', label: 'PASS PRO', blurb: 'SETS, HANDS AND ANCHOR', game: 'PASSING DOWNS', ratings: ['pbk', 'str'], effect: e('edge', 'pass', 'passDown') },
  { id: 'ol-run', group: 'OL', label: 'RUN BLOCKING', blurb: 'COMBOS AND MOVING BODIES', game: 'RUNS, MOST ON SHORT YDS', ratings: ['rbk', 'str'], effect: e('edge', 'run', 'all', 'shortYd') },
  { id: 'dl-rush', group: 'DL', label: 'PASS RUSH', blurb: 'GET AFTER THE QUARTERBACK', game: 'PASSING DOWNS', ratings: ['rsh'], effect: e('edge', 'pass', 'passDown') },
  { id: 'dl-run', group: 'DL', label: 'STOP THE RUN', blurb: 'SHED BLOCKS, TAKE ON DOUBLES', game: 'EVERY RUN', ratings: ['bsh', 'tkl'], effect: e('edge', 'run', 'all') },
  { id: 'lb-fits', group: 'LB', label: 'RUN FITS', blurb: 'READ IT AND FILL YOUR GAP', game: 'EVERY RUN', ratings: ['prc', 'bsh', 'tkl'], effect: e('edge', 'run', 'all') },
  { id: 'lb-coverage', group: 'LB', label: 'COVERAGE', blurb: 'DROPS AND RUNNING WITH BACKS', game: 'EVERY PASS', ratings: ['zcv', 'mcv'], effect: e('edge', 'pass', 'all') },
  { id: 'db-press', group: 'DB', label: 'PRESS MAN', blurb: 'JAM AND MIRROR', game: 'EVERY PASS', ratings: ['mcv', 'prs'], effect: e('edge', 'pass', 'all') },
  { id: 'db-ball', group: 'DB', label: 'BALL SKILLS', blurb: 'PLAY THE BALL, FINISH PICKS', game: 'MORE TAKEAWAYS', ratings: ['cth', 'zcv'], effect: e('turnover', 'pass', 'all') },
  { id: 'db-tackling', group: 'DB', label: 'TACKLING', blurb: 'OPEN-FIELD TACKLES', game: 'FEWER BIG RUNS ALLOWED', ratings: ['tkl'], effect: e('explosive', 'run', 'all') },
  { id: 'st-leg', group: 'ST', label: 'LEG', blurb: 'DISTANCE ON KICKS AND PUNTS', game: 'FIELD GOALS OF 45+', ratings: ['kpw'], effect: e('fg', 'any', 'longFg') },
  { id: 'st-accuracy', group: 'ST', label: 'ACCURACY', blurb: 'HIT YOUR SPOT', game: 'FIELD GOALS UNDER 45', ratings: ['kac'], effect: e('fg', 'any', 'shortFg') },
];

const BY_ID = new Map(EMPHASES.map((x) => [x.id, x]));

export function emphasisById(id: string | undefined): EmphasisDef | undefined {
  return id && id !== STANDARD ? BY_ID.get(id) : undefined;
}

/** A group's choices, `standard` first. */
export function groupEmphases(g: Group): string[] {
  return [STANDARD, ...EMPHASES.filter((x) => x.group === g).map((x) => x.id)];
}
