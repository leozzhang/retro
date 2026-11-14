import type { Athlete } from '../data/athletes';
import { athleteName } from '../data/depth';
import { overall, SLOT_POS } from '../data/positions';
import { pickWeighted, type Rng } from '../engine/math';
import type { EngineSnap } from '../game/engineDrive';
import { snapSituation, type DriveClock, type SimPlay } from '../game/rules';
import { passOdds } from '../game/situation';
import type { Credited } from './story';

/**
 * Casting: who made each simulated snap. The drive sim decides the yards from team ratings; casting
 * gives each snap to real players, weighted by their ratings and by what the snap was. A long gain
 * leans to the fastest, best route-running receiver or the most elusive back, an interception to the
 * corner with the best hands and coverage, a sack to the best rusher. It's a lean, not a lock
 * (`CAST.sharp`). The box score is the sum of the cast snaps (`credit` in simGame.ts), and the
 * key-play replays show the same players (game/replay.ts). Casting never changes a result.
 */

/** Base target share by slot, scaled by the receiver's overall and his fit for the snap. */
export const TARGETS: Record<string, number> = { X: 0.25, Z: 0.21, SL: 0.18, TE: 0.15, RB: 0.11 };
/** Share of designed runs a QB keeps, by his style. */
export const QB_RUN_SHARE: Record<string, number> = { pocket: 0.08, dual: 0.2, runner: 0.33 };
/** Share of a team's turnovers that are interceptions (the rest are fumbles). */
export const INT_SHARE = 0.55;

/**
 * Casting tuning.
 * - `deep`: a gain this long is a deep ball or a long run: receivers by `spd` and `rte`, backs by `spd`
 *   and `elu`. Shorter catches go by `rte` and `cth`.
 * - `sharp`: the exponent on a player's fit (his ratings over 75). 3 gives a +15 receiver about 1.7×
 *   the weight: the stars get more of the big plays, not all of them.
 * - `passDeep`/`runDeep`, `passLoss`: how much likelier a long gain, or a loss of `sackAt` or more, is
 *   on a pass than a run (a long loss on a pass is a sack).
 * - `completion`: the box score's completion rate. The drive sim logs only snaps with yards, so each
 *   catch carries `(1 - completion) / completion` incompletions on average.
 */
export const CAST = {
  deep: 15,
  sharp: 3,
  passDeep: 2.5,
  runDeep: 0.6,
  passLoss: 1.5,
  sackAt: -3,
  completion: 0.62,
  backs: ['CB1', 'CB2', 'NB', 'FS', 'SS'],
  rushers: ['DE1', 'DE2', 'DT1', 'DT2', 'WLB', 'MLB'],
};

/** A side's players by slot and its tendencies. */
export interface Lineup {
  on: Record<string, Athlete>;
  passShare: number;
  qbRun: number;
}

export type SnapKind = 'catch' | 'inc' | 'run' | 'sack' | 'int' | 'fumble' | 'kneel';

/** Who made one snap: the carrier or target (`who`), and the defender who made the play (`by`: the interception or sack). */
export interface SnapCredit {
  kind: SnapKind;
  pass: boolean;
  who?: Credited;
  by?: Credited;
}

const fit = (...xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length / 75) ** CAST.sharp;

function credited(on: Record<string, Athlete>, slot: string, yds: number): Credited {
  return { slot, name: athleteName(on[slot]), yds };
}

/** The receiver a snap of `yds` went to (or at, for an incompletion). */
function receiverFor(off: Lineup, yds: number, rng: Rng): string | null {
  const deep = yds >= CAST.deep;
  const opts = Object.entries(TARGETS)
    .filter(([slot]) => off.on[slot])
    .map(([slot, w]) => {
      const r = off.on[slot].r;
      return [slot, w * (overall(r, SLOT_POS[slot]) / 75) ** 2 * (deep ? fit(r.spd, r.rte) : fit(r.rte, r.cth))] as const;
    });
  return opts.length ? pickWeighted(opts, rng) : null;
}

/** The ball carrier on a run of `yds`. */
function runnerFor(off: Lineup, yds: number, rng: Rng): string | null {
  const long = yds >= CAST.deep;
  const opts: [string, number][] = [];
  for (const [slot, share] of [['RB', 1 - off.qbRun], ['QB', off.qbRun]] as const) {
    const a = off.on[slot];
    if (a) opts.push([slot, share * (long ? fit(a.r.spd, a.r.elu) : 1)]);
  }
  return opts.length ? pickWeighted(opts, rng) : null;
}

/** A defender from `slots`, weighted by `score` of his ratings. */
function defenderFor(def: Lineup, slots: string[], score: (a: Athlete) => number, rng: Rng): string | null {
  const opts = slots.filter((s) => def.on[s]).map((s) => [s, score(def.on[s])] as const);
  return opts.length ? pickWeighted(opts, rng) : null;
}

/**
 * Cast one snap. `p` is the sim's snap, `sitPass` the pass share for its situation (`passOdds`).
 * Kicks and punts have no cast (null).
 */
export function castSnap(p: SimPlay, off: Lineup, def: Lineup, sitPass: number, rng: Rng): SnapCredit | null {
  if (p.fg || p.punt) return null;
  const yds = Math.min(p.gain, 100 - p.yard);
  if (p.kneel) return { kind: 'kneel', pass: false, ...(off.on.QB ? { who: credited(off.on, 'QB', yds) } : {}) };
  if (p.turnover) {
    if (p.heave || rng() < INT_SHARE) {
      const by = defenderFor(def, CAST.backs, (a) => fit(a.r.cth, Math.max(a.r.mcv, a.r.zcv)), rng);
      return { kind: 'int', pass: true, ...(by ? { by: credited(def.on, by, 0) } : {}) };
    }
    const who = runnerFor(off, 0, rng);
    return { kind: 'fumble', pass: false, ...(who ? { who: credited(off.on, who, 0) } : {}) };
  }
  let pass = !!p.heave;
  if (!pass) {
    const [lp, lr] = yds >= CAST.deep ? [CAST.passDeep, CAST.runDeep] : yds <= CAST.sackAt ? [CAST.passLoss, 1] : [1, 1];
    pass = rng() < (sitPass * lp) / (sitPass * lp + (1 - sitPass) * lr);
  }
  if (pass && yds <= CAST.sackAt) {
    const by = defenderFor(def, CAST.rushers, (a) => fit(a.r.rsh, a.r.spd), rng);
    return { kind: 'sack', pass, ...(off.on.QB ? { who: credited(off.on, 'QB', yds) } : {}), ...(by ? { by: credited(def.on, by, 0) } : {}) };
  }
  if (pass) {
    const slot = receiverFor(off, yds, rng);
    return { kind: yds === 0 ? 'inc' : 'catch', pass, ...(slot ? { who: credited(off.on, slot, yds) } : {}) };
  }
  const slot = runnerFor(off, yds, rng);
  return { kind: 'run', pass, ...(slot ? { who: credited(off.on, slot, yds) } : {}) };
}

/** Cast a drive's snaps, each in its situation on `clock` (the score as the drive started). Aligned with `plays`. */
export function castDrive(plays: SimPlay[], off: Lineup, def: Lineup, clock: DriveClock, rng: Rng): (SnapCredit | null)[] {
  return plays.map((p) => castSnap(p, off, def, passOdds(off.passShare, snapSituation(clock, p.down, p.toGo, p.yard, p.t)), rng));
}

/**
 * Who made a snap played through the engine (game/engineDrive.ts): no casting, the players who did it.
 * The thrower's target on a pass, the carrier on a run or scramble, the sacker and the picker. Kicks and
 * punts have none (null); a kneel is the QB's.
 */
export function engineCredit(p: SimPlay, s: EngineSnap | undefined, off: Record<string, Athlete>, def: Record<string, Athlete>): SnapCredit | null {
  if (p.fg || p.punt) return null;
  const who = (slot: string | null, yds: number) => (slot && off[slot] ? { who: credited(off, slot, yds) } : {});
  const by = (slot: string | null) => (slot && def[slot] ? { by: credited(def, slot, 0) } : {});
  if (p.kneel || !s) return { kind: 'kneel', pass: false, ...who('QB', p.gain) };
  const yds = Math.min(s.gain, 100 - s.yard);
  if (s.type === 'int' || s.type === 'pick6') return { kind: 'int', pass: true, ...by(s.takeaway) };
  if (s.lostFumble) return { kind: 'fumble', pass: s.thrown, ...who(s.carrier, 0), ...by(s.takeaway) };
  if (s.type === 'sack') return { kind: 'sack', pass: true, ...who('QB', yds), ...by(s.tackler) };
  if (s.thrown && !s.complete) return { kind: 'inc', pass: true, ...who(s.target, 0) };
  if (s.thrown) return { kind: 'catch', pass: true, ...who(s.carrier, yds) };
  return { kind: 'run', pass: false, ...who(s.carrier ?? 'QB', yds) };
}
