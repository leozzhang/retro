import { clamp, lerp, type Rng } from '../engine/math';

/** A player contesting the ball. `pos` is 0..1: 1 = exactly under the ball, 0 = at the edge of reach. */
export interface Contender {
  pos: number;
  cth: number;
  /** Receiver: catch in traffic, for his share of a contested ball (defaults to `cth`). */
  cit?: number;
  /** Defender: play recognition, 40% of his ball skills (defaults to `cth`). */
  prc?: number;
  /** Receiver only: 0..1, how set he is (settled and facing the QB on a hitch, curl, comeback or screen). */
  set?: number;
  /**
   * 0..1: how much of a look at the ball he got before it arrived (sim/ai.ts `readyAt`); missing = 1.
   * A receiver who never found it takes it off his back or helmet; a defender who never found it can
   * still get a body on it, but can't pick it.
   */
  ready?: number;
  /** Receiver only: 0..1, a bullet that's hard to hang on to: hot on a short throw, a rope on a deep one (sim/ball.ts `hotness`). */
  hot?: number;
}

/**
 * An unready receiver keeps `hands` of his open-catch odds and `contest` of his share of a contested
 * ball; an unready defender keeps `dContest` of his share and no chance to pick it. `hot` is the share
 * a full-heat bullet takes off a 50-catching receiver's hands (a 100 halves it).
 */
export const READY = { hands: 0.5, contest: 0.5, dContest: 0.6, hot: 0.3 };

/** A set receiver sees the ball all the way in: a little surer hands, and he can shield the defender. */
export const SET_HANDS = 0.04;
export const SET_CONTEST = 0.05;

/**
 * A jump ball: a LOB hangs long enough for both sides to get under it (docs/PASSING.md). `jump` (0..1,
 * the throw type's, sim/ball.ts `THROWS`) flattens how much being a step closer matters to who wins
 * it (the contest's `pos` exponent goes from 0.6 to `pos`), so a covered receiver still has a real shot. His surest
 * hands of any throw (`hands`), a boost to his contest share from `cit` (`contest`, he high-points it),
 * and more of the balls the defense gets to are picks (`int`, × the share of non-catches picked).
 */
export const JUMP = { pos: 0.45, hands: 0.05, contest: 0.2, int: 0.8 };

export type CatchResult = 'catch' | 'int' | 'drop' | 'pbu' | 'miss';

export const CATCH_REACH = 1.7;

/** Probability of a catch by the offense and of an interception, given the best contender on each side. */
export function catchOdds(o: Contender | null, d: Contender | null, jump = 0): { catch: number; int: number } {
  const oPos = o ? Math.pow(clamp(o.pos, 0, 1), 0.6) : 0;
  const dPos = d ? Math.pow(clamp(d.pos, 0, 1), 0.6) : 0;
  // In a jump ball, a step closer matters less to who wins it (not to whether an open man gets there).
  const exp = lerp(0.6, JUMP.pos, jump);
  const oJump = o ? Math.pow(clamp(o.pos, 0, 1), exp) : 0;
  const dJump = d ? Math.pow(clamp(d.pos, 0, 1), exp) : 0;
  const set = o?.set ?? 0;
  const oReady = o?.ready ?? 1;
  const heat = o?.hot ? 1 - READY.hot * o.hot * (1.5 - o.cth / 100) : 1;
  const hands = o ? 0.75 + (0.25 * o.cth) / 100 + SET_HANDS * set + JUMP.hands * jump : 0;
  const open = o ? clamp(0.2 + 0.8 * oPos * hands, 0, 0.98) * lerp(READY.hands, 1, oReady) * heat : 0;
  if (!d) return { catch: open, int: 0 };

  const dReady = d.ready ?? 1;
  const dHands = d.cth * 0.6 + (d.prc ?? d.cth) * 0.4;
  const intBase = clamp(0.08 + 0.5 * dPos * (dHands / 100), 0, 0.7) * dReady;
  if (!o) return { catch: 0, int: intBase };

  const traffic = o.cit === undefined ? hands : 0.75 + (0.25 * o.cit) / 100 + SET_HANDS * set + JUMP.hands * jump;
  const oSkill = oJump * traffic * (1 + SET_CONTEST * set + (JUMP.contest * jump * (o.cit ?? o.cth)) / 100) * lerp(READY.contest, 1, oReady);
  const dSkill = dJump * (0.6 + (0.4 * dHands) / 100) * lerp(READY.dContest, 1, dReady);
  const share = oSkill / (oSkill + dSkill * 0.9 + 1e-6);
  const pc = open * share;
  return { catch: pc, int: (1 - pc) * intBase * 0.4 * (1 + JUMP.int * jump) };
}

export function resolveCatch(o: Contender | null, d: Contender | null, rng: Rng, jump = 0): CatchResult {
  if (!o && !d) return 'miss';
  const odds = catchOdds(o, d, jump);
  const r = rng();
  if (r < odds.catch) return 'catch';
  if (r < odds.catch + odds.int) return 'int';
  return d ? 'pbu' : 'drop';
}

/** 0..1 closeness score for a player `distance` yards from the ball's arrival point; `reach` scales `CATCH_REACH` (the throw type's, sim/ball.ts `THROWS`). */
export function reachScore(distance: number, reach = 1): number {
  return Math.max(0, 1 - distance / (CATCH_REACH * reach));
}

/** Chance a handoff is cleanly exchanged; the rest are fumbles (about one a season). */
export const HANDOFF_ODDS = 0.997;

/** A back can reach back or check up for a pitch farther than a receiver can for a pass. */
export const PITCH_REACH = 2.5;

/**
 * Chance the back hauls in a pitch, given how well he got under it (`pos` as in `Contender`, against
 * `PITCH_REACH`): about 0.5% on the ground when he's right under it, 2-3% at the edge of his reach.
 */
export function pitchOdds(pos: number, cth: number): number {
  if (pos <= 0) return 0;
  return clamp(0.975 + 0.02 * Math.sqrt(pos) + (cth - 70) * 0.0005, 0, 0.995);
}
