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
  /** What it does, in plain words, for the player card. */
  blurb: string;
  /** What it changes on the field. */
  effect: string;
  /** Where the formula lives. */
  where: string;
}

export const RATING_INFO: Record<RatingKey, RatingInfo> = {
  spd: { label: 'Speed', blurb: 'Top speed. Also helps a defender fight through blocks.', effect: 'Top speed (4.8 + 4.2·spd/100 yd/s); 30% of a defender\'s power against blocks', where: 'sim/player.ts maxSpeed' },
  acc: { label: 'Acceleration', blurb: 'How quickly he hits full speed off the snap and out of cuts.', effect: 'How fast he reaches top speed', where: 'sim/player.ts accelOf' },
  str: { label: 'Strength', blurb: 'Breaking tackles, falling forward, and anchoring blocks.', effect: 'Breaking tackles (40% of the carrier side), falling forward, and 20% of a blocker\'s anchor', where: 'sim/tackling.ts, blockValue' },
  sta: { label: 'Stamina', blurb: 'How long he can hold a full sprint, and how fast it comes back.', effect: 'How long a full sprint lasts and how fast it recovers', where: 'sim/player.ts endurance' },
  elu: { label: 'Elusiveness', blurb: 'Making tacklers miss when he has the ball.', effect: 'Making tacklers miss (60% of the carrier side)', where: 'sim/tackling.ts tackleChance' },
  cth: { label: 'Catching', blurb: 'Hands on catches, pitches and kicks. On defense, ball skills.', effect: 'Hands on open catches, pitches and kicks; a defender\'s ball skills on interceptions', where: 'sim/catching.ts' },
  cit: { label: 'Catch in Traffic', blurb: 'Winning the ball when a defender is right there with him.', effect: 'Share of a contested ball', where: 'sim/catching.ts catchOdds' },
  rte: { label: 'Route Running', blurb: 'Sharp breaks: bursting out of cuts and settling open.', effect: 'Burst off the line and out of breaks, speed kept through cuts, settling to face the QB', where: 'sim/ai.ts runRoute, cutKeep' },
  rls: { label: 'Release', blurb: 'Getting off the line cleanly when a corner presses him.', effect: 'Beating the press jam at the snap', where: 'game/playState.ts snap' },
  arm: { label: 'Throw Power', blurb: 'How far and how fast he can throw it.', effect: 'Max throw distance and ball speed', where: 'sim/passing.ts, sim/ball.ts' },
  sac: { label: 'Short Accuracy', blurb: 'Accuracy on short throws, out to about 10 yards.', effect: 'Throw error to about 10 yd', where: 'sim/passing.ts throwErrorSd' },
  mac: { label: 'Medium Accuracy', blurb: 'Accuracy on intermediate throws, about 14 to 20 yards.', effect: 'Throw error at about 14-20 yd', where: 'sim/passing.ts throwErrorSd' },
  dac: { label: 'Deep Accuracy', blurb: 'Accuracy on deep shots, 28 yards and beyond.', effect: 'Throw error at 28+ yd', where: 'sim/passing.ts throwErrorSd' },
  tup: { label: 'Throw on the Run', blurb: 'Keeping his accuracy when throwing on the move.', effect: 'Extra throw error while moving (80 = baseline)', where: 'sim/passing.ts throwErrorSd' },
  pac: { label: 'Poise', blurb: 'Keeping his accuracy with a pass rusher in his face.', effect: 'Extra throw error under pressure (80 = baseline)', where: 'sim/passing.ts throwErrorSd' },
  pbk: { label: 'Pass Block', blurb: 'Holding up against pass rushers in protection.', effect: 'The blocker\'s side of pass-pro engagements', where: 'game/playState.ts updateEngagements' },
  rbk: { label: 'Run Block', blurb: 'Clearing the hole on runs, and blocking on returns.', effect: 'The blocker\'s side of run blocks and special-teams blocks', where: 'sim/runBlocking.ts, sim/blocking.ts' },
  tkl: { label: 'Tackle', blurb: 'Bringing the ball carrier down when he gets his hands on him.', effect: 'Chance to bring the carrier down on contact', where: 'sim/tackling.ts tackleChance' },
  rsh: { label: 'Pass Rush', blurb: 'Beating pass blockers to get after the quarterback.', effect: '70% of a defender\'s power against pass blocks: push and shed rate', where: 'game/playState.ts updateEngagements' },
  bsh: { label: 'Block Shedding', blurb: 'Getting off run blocks to make the play.', effect: '70% of a defender\'s power against run blocks and special-teams blocks', where: 'sim/runBlocking.ts, sim/blocking.ts' },
  mcv: { label: 'Man Coverage', blurb: 'Staying with his man in man coverage, and jumping the throw.', effect: 'Reaction lag trailing a receiver in man; reaction to the throw in man', where: 'sim/ai.ts cover, Play.throwBall' },
  zcv: { label: 'Zone Coverage', blurb: 'Reacting to the throw when playing a zone.', effect: 'Reaction to the throw from a zone', where: 'Play.throwBall' },
  prs: { label: 'Press', blurb: 'Jamming a receiver at the line to throw off his route.', effect: 'Winning the jam at the line', where: 'game/playState.ts snap' },
  prc: { label: 'Play Recognition', blurb: 'Reading runs, play action and tendencies; jumping throws.', effect: 'Reading run, play action and pitches; run-fit timing; 40% of interception ball skills; how much of the offense\'s tendencies a defender leans on in a game', where: 'game/playState.ts reactToRun, sellFake; game/defBrain.ts leansFor' },
  kpw: { label: 'Kick Power', blurb: 'Leg strength: distance on field goals, punts and kickoffs.', effect: 'Leg speed: distance on kicks and punts', where: 'sim/kicking.ts legSpeed' },
  kac: { label: 'Kick Accuracy', blurb: 'Kicking accuracy, and a wider sweet spot on the timing meter.', effect: 'Kick error and the width of the timing meter\'s green', where: 'sim/kicking.ts' },
};

/** Share of a blocker's value that comes from strength (his anchor); the rest is the block rating. */
export const ANCHOR_STR = 0.2;

export function passBlockValue(r: Ratings): number {
  return r.pbk * (1 - ANCHOR_STR) + r.str * ANCHOR_STR;
}

export function runBlockValue(r: Ratings): number {
  return r.rbk * (1 - ANCHOR_STR) + r.str * ANCHOR_STR;
}
