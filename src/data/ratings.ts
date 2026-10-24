/**
 * Player ratings, 0-99. Every rating feeds one or more sim formulas; `RATING_INFO` says which.
 * See docs/RATINGS.md for the full table, the position overalls and the evidence behind them.
 */
export interface Ratings {
  // physical
  spd: number; // top speed
  acc: number; // acceleration
  str: number; // strength: breaking tackles, falling forward, a blocker's anchor
  sta: number; // stamina: how long the sprint lasts
  // ball carrier
  elu: number; // elusiveness: making tacklers miss
  // receiving
  cth: number; // catching (open catches, pitches, muffs); a defender's ball skills
  cit: number; // catch in traffic: winning a contested ball
  rte: number; // route running: burst out of breaks, keeping speed through cuts, settling
  rls: number; // release: beating the press jam
  // quarterback
  arm: number; // throw power: max distance and ball speed
  sac: number; // short accuracy (to about 10 yd)
  mac: number; // medium accuracy (about 14-20 yd)
  dac: number; // deep accuracy (28+ yd)
  tup: number; // throwing on the run
  pac: number; // poise: accuracy under pressure
  // blocking
  pbk: number; // pass blocking
  rbk: number; // run blocking (also special-teams blocks)
  // defense
  tkl: number; // tackling
  rsh: number; // pass rush: beating pass blocks
  bsh: number; // block shedding: beating run blocks and special-teams blocks
  mcv: number; // man coverage: trailing a receiver, reacting to the throw in man
  zcv: number; // zone coverage: reacting to the throw in a zone
  prs: number; // press: jamming a receiver at the line
  prc: number; // play recognition: reading run, play action and pitches; anticipating throws
  // kicking
  kpw: number; // kick power
  kac: number; // kick accuracy
}

export type RatingKey = keyof Ratings;

export const RATING_KEYS: RatingKey[] = [
  'spd', 'acc', 'str', 'sta', 'elu', 'cth', 'cit', 'rte', 'rls', 'arm', 'sac', 'mac', 'dac', 'tup', 'pac',
  'pbk', 'rbk', 'tkl', 'rsh', 'bsh', 'mcv', 'zcv', 'prs', 'prc', 'kpw', 'kac',
];

export interface RatingInfo {
  label: string;
  /** What it changes on the field. */
  effect: string;
  /** Where the formula lives. */
  where: string;
}

export const RATING_INFO: Record<RatingKey, RatingInfo> = {
  spd: { label: 'Speed', effect: 'Top speed (4.8 + 4.2·spd/100 yd/s); 30% of a defender\'s power against blocks', where: 'sim/player.ts maxSpeed' },
  acc: { label: 'Acceleration', effect: 'How fast he reaches top speed', where: 'sim/player.ts accelOf' },
  str: { label: 'Strength', effect: 'Breaking tackles (40% of the carrier side), falling forward, and 20% of a blocker\'s anchor', where: 'sim/tackling.ts, blockValue' },
  sta: { label: 'Stamina', effect: 'How long a full sprint lasts and how fast it recovers', where: 'sim/player.ts endurance' },
  elu: { label: 'Elusiveness', effect: 'Making tacklers miss (60% of the carrier side)', where: 'sim/tackling.ts tackleChance' },
  cth: { label: 'Catching', effect: 'Hands on open catches, pitches and kicks; a defender\'s ball skills on interceptions', where: 'sim/catching.ts' },
  cit: { label: 'Catch in Traffic', effect: 'Share of a contested ball', where: 'sim/catching.ts catchOdds' },
  rte: { label: 'Route Running', effect: 'Burst off the line and out of breaks, speed kept through cuts, settling to face the QB', where: 'sim/ai.ts runRoute, cutKeep' },
  rls: { label: 'Release', effect: 'Beating the press jam at the snap', where: 'game/playState.ts snap' },
  arm: { label: 'Throw Power', effect: 'Max throw distance and ball speed', where: 'sim/passing.ts, sim/ball.ts' },
  sac: { label: 'Short Accuracy', effect: 'Throw error to about 10 yd', where: 'sim/passing.ts throwErrorSd' },
  mac: { label: 'Medium Accuracy', effect: 'Throw error at about 14-20 yd', where: 'sim/passing.ts throwErrorSd' },
  dac: { label: 'Deep Accuracy', effect: 'Throw error at 28+ yd', where: 'sim/passing.ts throwErrorSd' },
  tup: { label: 'Throw on the Run', effect: 'Extra throw error while moving (80 = baseline)', where: 'sim/passing.ts throwErrorSd' },
  pac: { label: 'Poise', effect: 'Extra throw error under pressure (80 = baseline)', where: 'sim/passing.ts throwErrorSd' },
  pbk: { label: 'Pass Block', effect: 'The blocker\'s side of pass-pro engagements', where: 'game/playState.ts updateEngagements' },
  rbk: { label: 'Run Block', effect: 'The blocker\'s side of run blocks and special-teams blocks', where: 'sim/runBlocking.ts, sim/blocking.ts' },
  tkl: { label: 'Tackle', effect: 'Chance to bring the carrier down on contact', where: 'sim/tackling.ts tackleChance' },
  rsh: { label: 'Pass Rush', effect: '70% of a defender\'s power against pass blocks: push and shed rate', where: 'game/playState.ts updateEngagements' },
  bsh: { label: 'Block Shedding', effect: '70% of a defender\'s power against run blocks and special-teams blocks', where: 'sim/runBlocking.ts, sim/blocking.ts' },
  mcv: { label: 'Man Coverage', effect: 'Reaction lag trailing a receiver in man; reaction to the throw in man', where: 'sim/ai.ts cover, Play.throwBall' },
  zcv: { label: 'Zone Coverage', effect: 'Reaction to the throw from a zone', where: 'Play.throwBall' },
  prs: { label: 'Press', effect: 'Winning the jam at the line', where: 'game/playState.ts snap' },
  prc: { label: 'Play Recognition', effect: 'Reading run, play action and pitches; run-fit timing; 40% of interception ball skills', where: 'game/playState.ts reactToRun, sellFake' },
  kpw: { label: 'Kick Power', effect: 'Leg speed: distance on kicks and punts', where: 'sim/kicking.ts legSpeed' },
  kac: { label: 'Kick Accuracy', effect: 'Kick error and the width of the timing meter\'s green', where: 'sim/kicking.ts' },
};

/** Share of a blocker's value that comes from strength (his anchor); the rest is the block rating. */
export const ANCHOR_STR = 0.2;

export function passBlockValue(r: Ratings): number {
  return r.pbk * (1 - ANCHOR_STR) + r.str * ANCHOR_STR;
}

export function runBlockValue(r: Ratings): number {
  return r.rbk * (1 - ANCHOR_STR) + r.str * ANCHOR_STR;
}
