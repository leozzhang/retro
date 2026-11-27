import { clamp, len, lerp, sub, type Rng, type Vec } from '../engine/math';

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
  /** Receiver only: 0..1, how far he had to stretch for it (`PLACEMENT`: a reach, a dive). */
  lunge?: number;
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

/**
 * Ball placement (docs/PASSING.md). How a catch looks, and what it costs, comes from where the ball was
 * put against where he was going when he found it (`Player.track`):
 * - `adjust`: yards off his path, sideways, plus `behind` × the yards behind him (he has to stop and come
 *   back for it). A ball led ahead of him costs nothing unless he can't get there.
 * - IN STRIDE: `adjust` under `stride` and still moving over `strideSpeed`: only `strideRamp` of the
 *   catch ramp (sim/player.ts `CATCH`), his hips already pointed the way he's going.
 * - REACH: `adjust` over `reach`, or caught at the edge of his reach (`pos` under `edge`): he keeps
 *   `reachKeep` of his speed, his hips twisted back toward the ball (`reachTwist`, more for a ball behind
 *   him), and `hands` × `reachLunge` off his open-catch odds.
 * - Going to the ball (sim/ai.ts `adjustToBall`): with it out ahead of him, within `throughCos` of his line
 *   and him moving over `throughSpeed`, he times it at a steady speed and runs through the catch;
 *   otherwise he sets up under it (`seekTimed`, pulling up on the spot). **Off** (`throughCos` over 1):
 *   on, it took the most-open-receiver YAC from 11.2 to 13.0 yd a catch, a buff to passing
 *   (docs/PASSING.md, measured); it waits until the rest of the YAC is tamed.
 * - DIVE: in the last `diveWindow` s, if he can't get within `diveFrom` of his reach on his feet but can
 *   by laying out, he dives: at least `diveSpeed` yd/s at the spot, `diveReach` more reach, `hands` off
 *   his open-catch odds. Caught, he's down where he lands (the college rule): no yards after the catch.
 */
export const PLACEMENT = {
  stride: 1.2, strideSpeed: 4.5, strideRamp: 0.35, behind: 1, throughSpeed: 2, throughCos: 2,
  reach: 2.6, edge: 0.3, reachKeep: 0.45, reachTwist: 0.45, reachTwistBehind: 0.85, reachLunge: 0.4,
  hands: 0.18, diveWindow: 0.32, diveFrom: 0.45, diveReach: 0.9, diveSpeed: 6.5,
};

export type CatchGrade = 'stride' | 'clean' | 'reach' | 'dive';

/**
 * The catch's grade from the ball's placement: `track` (where he'd have been, and his direction then),
 * the landing spot, his `pos` into his reach, and his speed at the ball. Also the yards behind him.
 */
export function catchGrade(
  track: { at: Vec; dir: Vec | null } | null, land: Vec, pos: number, speed: number, diving: boolean,
): { grade: CatchGrade; behind: number } {
  if (diving) return { grade: 'dive', behind: 0 };
  let adjust = 0;
  let behind = 0;
  if (track) {
    const off = sub(land, track.at);
    if (track.dir) {
      const along = off.x * track.dir.x + off.y * track.dir.y;
      const side = Math.abs(off.x * track.dir.y - off.y * track.dir.x);
      behind = Math.max(0, -along);
      adjust = side + PLACEMENT.behind * behind;
    } else adjust = len(off);
  }
  if (adjust > PLACEMENT.reach || pos < PLACEMENT.edge) return { grade: 'reach', behind };
  if (adjust < PLACEMENT.stride && speed > PLACEMENT.strideSpeed) return { grade: 'stride', behind };
  return { grade: 'clean', behind };
}

export type CatchResult = 'catch' | 'int' | 'drop' | 'pbu' | 'miss';

export const CATCH_REACH = 1.7;

/**
 * More than one defender at the catch point (docs/PASSING.md, crowds). Each defender past the best one
 * counts by how well he's under the ball: `w = pos^posExp`, so one at the edge of his reach adds next to
 * nothing and a ball led away from the crowd stays safe. Each adds `extra` × w of his contest skill to the
 * defense's side, takes `hands` × w off the receiver's open-catch odds (bodies, arms, the hit at the
 * catch point), and is another set of hands for a pick (`pick` × w of his own odds, combined). Every
 * throw type, not just the lob. A touch pass (receiver 0.9 into his reach) into a tight double (0.9, 0.9)
 * is 22% caught and 16% picked, a tight triple 14% and 20%, against 48% and 9% with one man on him; a lob
 * is picked more. Led a step past them (0.5, 0.3, 0.3) it's as good as one defender.
 */
export const CROWD = { posExp: 3, extra: 2.3, hands: 0.28, pick: 0.55, max: 3 };

function defSkill(d: Contender, exp: number): { pos: number; skill: number; intBase: number } {
  const dPos = Math.pow(clamp(d.pos, 0, 1), 0.6);
  const dJump = Math.pow(clamp(d.pos, 0, 1), exp);
  const dReady = d.ready ?? 1;
  const dHands = d.cth * 0.6 + (d.prc ?? d.cth) * 0.4;
  const skill = dJump * (0.6 + (0.4 * dHands) / 100) * lerp(READY.dContest, 1, dReady);
  const intBase = clamp(0.08 + 0.5 * dPos * (dHands / 100), 0, 0.7) * dReady;
  return {
    pos: clamp(d.pos, 0, 1),
    skill,
    intBase,
  };
}

/**
 * Probability of a catch by the offense and of an interception, given the offense's best contender and
 * the defenders at the ball (one, or every one in reach: `CROWD`).
 */
export function catchOdds(o: Contender | null, defs: Contender | Contender[] | null, jump = 0): { catch: number; int: number } {
  const ds = (defs === null ? [] : Array.isArray(defs) ? [...defs] : [defs]).sort((a, b) => b.pos - a.pos).slice(0, CROWD.max);
  const oPos = o ? Math.pow(clamp(o.pos, 0, 1), 0.6) : 0;
  // In a jump ball, a step closer matters less to who wins it (not to whether an open man gets there).
  const exp = lerp(0.6, JUMP.pos, jump);
  const oJump = o ? Math.pow(clamp(o.pos, 0, 1), exp) : 0;
  const set = o?.set ?? 0;
  const oReady = o?.ready ?? 1;
  const heat = o?.hot ? 1 - READY.hot * o.hot * (1.5 - o.cth / 100) : 1;
  const hands = o ? 0.75 + (0.25 * o.cth) / 100 + SET_HANDS * set + JUMP.hands * jump : 0;
  let open = o ? clamp(0.2 + 0.8 * oPos * hands, 0, 0.98) * lerp(READY.hands, 1, oReady) * heat : 0;
  if (o?.lunge) open *= 1 - PLACEMENT.hands * o.lunge;
  if (!ds.length) return { catch: open, int: 0 };

  const best = defSkill(ds[0], exp);
  let dSkill = best.skill;
  let noPick = 1 - best.intBase;
  let crowd = 0;
  for (const d of ds.slice(1)) {
    const s = defSkill(d, exp);
    const w = Math.pow(s.pos, CROWD.posExp);
    crowd += w;
    dSkill += CROWD.extra * w * s.skill;
    noPick *= 1 - s.intBase * w * CROWD.pick;
  }
  const intBase = ds.length > 1 ? 1 - noPick : best.intBase;
  if (!o) return { catch: 0, int: intBase };

  open *= Math.max(0, 1 - CROWD.hands * crowd);
  const traffic = o.cit === undefined ? hands : 0.75 + (0.25 * o.cit) / 100 + SET_HANDS * set + JUMP.hands * jump;
  const oSkill = oJump * traffic * (1 + SET_CONTEST * set + (JUMP.contest * jump * (o.cit ?? o.cth)) / 100) * lerp(READY.contest, 1, oReady);
  const share = oSkill / (oSkill + dSkill * 0.9 + 1e-6);
  const pc = open * share;
  return { catch: pc, int: Math.min(1 - pc, (1 - pc) * intBase * 0.4 * (1 + JUMP.int * jump)) };
}

/**
 * The user's call on the ball (docs/USERDEF.md, PLAY DEFENSE): what a timed PLAY BALL or SWAT is worth by his
 * position at the press (`edge`, -1 trailing to +1 undercutting; `Play.ballEdge`), at average hands and a
 * perfect press. INT and catch at the anchors `good` (edge `at` or more), `even` (0) and `bad` (-`at` or
 * less), linear between; an incompletion is the rest. PLAY BALL is the gamble: picks from a good spot, a coin
 * flip from an even one, caught over him from a bad one. SWAT is the knock-down: an incompletion 3 times in 4
 * even from behind him, and seldom a pick. With a pick worth about 3 catches the better call turns over at
 * about even (`DefBot`'s choice). His hands scale the pick (`intHands`, by `cth` 60% /
 * `prc` 40% from `handsLo` to `handsHi`), the receiver's catch in traffic the catch (`catchHands`), and a
 * receiver who can't get there (`pos` under `oFull`) catches less.
 */
export const USER_CALL = {
  at: 0.5,
  play: { good: { int: 0.5, catch: 0.12 }, even: { int: 0.18, catch: 0.52 }, bad: { int: 0.04, catch: 0.75 } },
  swat: { good: { int: 0.06, catch: 0.05 }, even: { int: 0.03, catch: 0.12 }, bad: { int: 0.01, catch: 0.25 } },
  intHands: [0.75, 1.2], catchHands: [0.8, 1.2], handsLo: 50, handsHi: 95, oFull: 0.5,
};

/** The user's timed call's odds (`USER_CALL`): `d` his hands, `o` the receiver at the ball (null: nobody to catch it), `crowd` the other defenders' weight. */
export function callOdds(kind: 'play' | 'swat', edge: number, d: { cth: number; prc?: number }, o: { pos: number; cth: number; cit?: number } | null, crowd = 0): { catch: number; int: number } {
  const U = USER_CALL;
  const row = U[kind];
  const e = clamp(edge / U.at, -1, 1);
  const pick = (k: 'int' | 'catch') => (e >= 0 ? lerp(row.even[k], row.good[k], e) : lerp(row.even[k], row.bad[k], -e));
  const k = (r: number) => clamp((r - U.handsLo) / (U.handsHi - U.handsLo), 0, 1);
  let int = pick('int') * lerp(U.intHands[0], U.intHands[1], k(d.cth * 0.6 + (d.prc ?? d.cth) * 0.4));
  let pc = o ? pick('catch') * lerp(U.catchHands[0], U.catchHands[1], k(o.cit ?? o.cth)) * Math.min(1, clamp(o.pos, 0, 1) / U.oFull) : 0;
  pc *= Math.max(0, 1 - CROWD.hands * crowd);
  pc = clamp(pc, 0, 1);
  int = clamp(int, 0, 1 - pc);
  return { catch: pc, int };
}

export function resolveCatch(o: Contender | null, d: Contender | Contender[] | null, rng: Rng, jump = 0, override?: { catch: number; int: number }): CatchResult {
  const ds = d === null ? [] : Array.isArray(d) ? d : [d];
  if (!o && !ds.length) return 'miss';
  const odds = override ?? catchOdds(o, ds, jump);
  const r = rng();
  if (r < odds.catch) return 'catch';
  if (r < odds.catch + odds.int) return 'int';
  return ds.length ? 'pbu' : 'drop';
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
