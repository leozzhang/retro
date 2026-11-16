import { FIELD_W, HASH_BOT, HASH_TOP, OPP_GOAL, OWN_GOAL } from '../engine/constants';
import { CONF, leverage, unitEdge, type UnitConf } from '../data/confidence';
import { clamp, gauss, type Rng } from '../engine/math';
import { explosiveFactor, kickEdge, snapEdge, turnoverFactor, type DriveMods } from '../season/emphasis';
import { desperate, fourthDown, kickNow, SITUATION, spikeNow, tempo, type Situation } from './situation';

/** 'fumble' = botched exchange or pitch, recovered by the offense (spotted like a tackle). */
export type OutcomeType = 'tackle' | 'oob' | 'incomplete' | 'td' | 'int' | 'pick6' | 'sack' | 'safety' | 'fumble';

export interface PlayOutcome {
  type: OutcomeType;
  /** Absolute x where the ball is spotted (for 'int': where the returner was downed). */
  spot: number;
  spotY: number;
  text: string;
  sub: string;
  color: string;
}

export interface Drive {
  los: number;
  ballY: number;
  down: number;
  firstDownX: number;
  /** A try after a touchdown (untimed, one play). */
  try?: boolean;
}

export type Change =
  | { kind: 'none' }
  | { kind: 'pat' } // user scored a touchdown: kick the extra point or go for two
  | { kind: 'kickoff' } // user kicks off next (after a field goal or a try)
  | { kind: 'downs'; cpuStart: number }
  | { kind: 'int'; cpuStart: number }
  | { kind: 'cpuBall'; cpuStart: number } // after a punt, a kickoff or a missed field goal
  | { kind: 'safety' }
  | { kind: 'pick6' }
  | { kind: 'returnTd'; sub: string };

export interface Applied {
  drive: Drive;
  userPoints: number;
  cpuPoints: number;
  headline: string;
  change: Change;
}

/** `yards` = distance from the user's own goal line. */
export function startDrive(yards: number): Drive {
  const los = OWN_GOAL + clamp(yards, 1, 99);
  return { los, ballY: FIELD_W / 2, down: 1, firstDownX: Math.min(OPP_GOAL, los + 10) };
}

/**
 * Whether a snap moves the chains, on the exact spot (as `applyOutcome` reads it). Logs round the gain and
 * the distance apart, so they can't tell a 9.3-yard gain on 3rd and 9.4 from a conversion: they keep this.
 */
export function movesChains(drive: Drive, out: PlayOutcome): boolean {
  if (out.type === 'td') return true;
  if (out.type === 'incomplete' || out.type === 'int' || out.type === 'pick6' || out.type === 'safety') return false;
  return out.spot >= drive.firstDownX;
}

/** A logged snap moved the chains: its `first` where it was played on the field, else gain against distance (the drive sim's whole yards). */
export const converted = (p: { gain: number; toGo: number; first?: boolean }): boolean => p.first ?? p.gain >= p.toGo;

export function applyOutcome(drive: Drive, out: PlayOutcome): Applied {
  const base = { drive, userPoints: 0, cpuPoints: 0 };
  switch (out.type) {
    case 'td':
      return { ...base, userPoints: 6, headline: 'TOUCHDOWN', change: { kind: 'pat' } };
    case 'pick6':
      return { ...base, cpuPoints: 7, headline: 'PICK SIX', change: { kind: 'pick6' } };
    case 'safety':
      return { ...base, cpuPoints: 2, headline: 'SAFETY', change: { kind: 'safety' } };
    case 'int':
      return { ...base, headline: 'TURNOVER', change: { kind: 'int', cpuStart: clamp(OPP_GOAL - out.spot, 1, 99) } };
    default:
      break;
  }

  let next: Drive;
  let headline = '';
  if (out.type === 'incomplete') {
    next = { ...drive, down: drive.down + 1 };
  } else {
    const los = clamp(out.spot, OWN_GOAL + 0.5, OPP_GOAL - 0.5);
    const ballY = clamp(out.spotY, HASH_TOP, HASH_BOT);
    if (movesChains(drive, out)) {
      next = { los, ballY, down: 1, firstDownX: Math.min(OPP_GOAL, los + 10) };
      headline = 'FIRST DOWN';
    } else {
      next = { los, ballY, down: drive.down + 1, firstDownX: drive.firstDownX };
    }
  }
  if (next.down > 4) {
    return { ...base, drive: next, headline: 'TURNOVER ON DOWNS', change: { kind: 'downs', cpuStart: clamp(OPP_GOAL - next.los, 1, 99) } };
  }
  return { ...base, drive: next, headline, change: { kind: 'none' } };
}

/** A two-point try: a touchdown is worth 2, anything else nothing. A defensive return scores 2 for the CPU (NCAA). */
export function applyTry(drive: Drive, out: PlayOutcome): Applied {
  const base = { drive, userPoints: 0, cpuPoints: 0, change: { kind: 'kickoff' } as Change };
  if (out.type === 'td') return { ...base, userPoints: 2, headline: 'TWO-POINT TRY GOOD' };
  if (out.type === 'pick6') return { ...base, cpuPoints: 2, headline: 'DEFENSIVE TWO POINTS' };
  return { ...base, headline: 'TRY FAILED' };
}

// ---------------------------------------------------------------- kicks

export type KickResult =
  | 'fgGood' | 'fgMiss' | 'xpGood' | 'xpMiss' | 'blocked'
  | 'touchback' | 'fairCatch' | 'downed' | 'oob' | 'returned' | 'returnTd' | 'recovered';

export interface KickOutcome {
  result: KickResult;
  unit: 'fg' | 'xp' | 'punt' | 'kickoff';
  /** World x where the ball ends up (where the receiving team takes over, before touchback rules). */
  spot: number;
  spotY: number;
  text: string;
  sub: string;
  color: string;
}

/** NCAA spots, in yards from the CPU's own goal line. */
export const KICKOFF_TOUCHBACK = 25;
export const PUNT_TOUCHBACK = 20;
export const KICKOFF_OOB = 35;

/** Where the CPU takes over after a kick that ended at world x `spot`. */
function cpuYard(spot: number): number {
  return clamp(Math.round(OPP_GOAL - spot), 1, 99);
}

export function applyKick(drive: Drive, out: KickOutcome): Applied {
  const base = { drive, userPoints: 0, cpuPoints: 0 };
  const cpuBall = (cpuStart: number, headline = ''): Applied => ({ ...base, headline, change: { kind: 'cpuBall', cpuStart } });
  switch (out.result) {
    case 'fgGood':
      return { ...base, userPoints: 3, headline: 'FIELD GOAL', change: { kind: 'kickoff' } };
    case 'xpGood':
      return { ...base, userPoints: 1, headline: '', change: { kind: 'kickoff' } };
    case 'xpMiss':
      return { ...base, headline: '', change: { kind: 'kickoff' } };
    case 'fgMiss':
      // NCAA: the defense takes over at the previous line of scrimmage, or its 20 if that's closer to its goal.
      return cpuBall(Math.max(20, cpuYard(drive.los)), 'NO GOOD');
    case 'returnTd':
      return { ...base, cpuPoints: 7, headline: 'RETURN TOUCHDOWN', change: { kind: 'returnTd', sub: out.sub } };
    case 'recovered': {
      const los = clamp(out.spot, OWN_GOAL + 0.5, OPP_GOAL - 0.5);
      const next = { los, ballY: clamp(out.spotY, HASH_TOP, HASH_BOT), down: 1, firstDownX: Math.min(OPP_GOAL, los + 10) };
      return { ...base, drive: next, headline: 'YOUR BALL', change: { kind: 'none' } };
    }
    case 'blocked':
      if (out.unit === 'xp') return { ...base, headline: '', change: { kind: 'kickoff' } };
      return cpuBall(cpuYard(out.spot), 'BLOCKED');
    case 'touchback':
      return cpuBall(out.unit === 'kickoff' ? KICKOFF_TOUCHBACK : PUNT_TOUCHBACK, 'TOUCHBACK');
    case 'oob':
      return cpuBall(out.unit === 'kickoff' ? KICKOFF_OOB : cpuYard(out.spot));
    case 'fairCatch':
      // A fair catch of a kickoff inside the 25 comes out to the 25.
      return cpuBall(out.unit === 'kickoff' ? Math.max(KICKOFF_TOUCHBACK, cpuYard(out.spot)) : cpuYard(out.spot));
    default:
      return cpuBall(cpuYard(out.spot));
  }
}

const ORD = ['1ST', '2ND', '3RD', '4TH'];

export function downDistance(d: Drive): string {
  if (d.try) return 'TRY';
  const ord = ORD[Math.min(3, d.down - 1)];
  if (d.firstDownX >= OPP_GOAL) return `${ord} & GOAL`;
  const toGo = d.firstDownX - d.los;
  return `${ord} & ${toGo < 0.6 ? 'INCHES' : Math.max(1, Math.round(toGo))}`;
}

/** Yard line label from the user's perspective. */
export function fieldLabel(x: number): string {
  const yd = Math.round(x - OWN_GOAL);
  if (yd === 50) return 'MIDFIELD';
  if (yd <= 0) return 'OWN END ZONE';
  if (yd >= 100) return 'END ZONE';
  return yd < 50 ? `OWN ${yd}` : `OPP ${100 - yd}`;
}

export function yardsText(yards: number): string {
  const r = Math.round(yards);
  if (r === 0) return 'NO GAIN';
  const unit = Math.abs(r) === 1 ? 'YARD' : 'YARDS';
  return r > 0 ? `+${r} ${unit}` : `${r} ${unit}`;
}

// ---------------------------------------------------------------- CPU drives

export interface DriveSim {
  points: number;
  result: 'TOUCHDOWN' | 'FIELD GOAL' | 'MISSED FG' | 'PUNT' | 'TURNOVER' | 'DOWNS' | 'END OF HALF';
  plays: number;
  yards: number;
  /** Where the drive ended, in yards from the CPU's own goal line. */
  endYard: number;
  /** Game-clock seconds the drive used. */
  secs: number;
}

export interface DriveClock {
  /** Seconds until halftime / end of game. */
  timeLeft: number;
  /** Trailing late: no-huddle, clock-stopping plays. */
  hurry: boolean;
  /** Leading late: huddle up and run the play clock down. */
  milk: boolean;
  /** Time per play multiplier: a fast-tempo game is under 1 (more possessions). */
  pace?: number;
  /**
   * `timeLeft` ends at a quarter break, not the half (a partial sim handing the game to the field):
   * no last-second field goal, the drive just stops and is played on from there.
   */
  quarterBreak?: boolean;
  /** With `quarterBreak`: the half's seconds after the break, so the coaching reads the real clock. */
  pastBreak?: number;
  /**
   * The offense's points minus the defense's when the drive starts. With it, the offense coaches the
   * situation (game/situation.ts): 4th downs and last-second kicks by whether the points help, tempo
   * by the clock and score snap by snap (in place of `hurry` and `milk`), kneeling out a lead, and a
   * heave to the end zone on the last snap. Without it the drive runs as it always has.
   */
  lead?: number;
  /** The 2nd half (or overtime): no possessions after the clock runs out. Missing is the 2nd half. */
  finalHalf?: boolean;
  /** Quarter length in seconds, for the 4th-quarter tempo (missing: 900). */
  qSecs?: number;
  /** Overtime: the offense has the period's first or second possession. */
  ot?: 'first' | 'second';
}

const NO_CLOCK: DriveClock = { timeLeft: Infinity, hurry: false, milk: false };

/** The situation `secs` into a drive on `clock`, at this down, distance and spot (yards from the offense's goal). */
export function snapSituation(clock: DriveClock, down: number, toGo: number, yard: number, secs: number): Situation {
  return {
    down, toGo, yardsToGoal: 100 - yard, secsLeft: clock.timeLeft + (clock.pastBreak ?? 0) - secs, qSecs: clock.qSecs ?? 900,
    finalHalf: clock.finalHalf ?? true, lead: clock.lead ?? 0, ot: clock.ot,
  };
}

/** One simulated play, for whoever wants to grade it (progression). Reading it draws no random numbers. */
export interface SimPlay {
  gain: number;
  explosive: boolean;
  turnover: boolean;
  /** The down and distance before the snap. */
  down: number;
  toGo: number;
  /** The spot before the snap, yards from the offense's own goal, and the drive's seconds before it (for highlights). */
  yard: number;
  t: number;
  /** A field goal try ends the drive: its distance and whether it was good. */
  fg?: { dist: number; made: boolean };
  punt?: boolean;
  /** How much the snap mattered, 0..1 (`leverage` in data/confidence.ts). */
  lev: number;
  /** The weekly emphases' edge on this snap or kick, in rating points (season/emphasis.ts). */
  em?: number;
  /** A kneel-down running out the clock. */
  kneel?: boolean;
  /** A last-snap throw to the end zone (`desperate`). */
  heave?: boolean;
  /** A spike to stop the clock (`spikeNow`): a down for the time. */
  spike?: boolean;
  /**
   * The snap moved the chains (`movesChains`), set where it was played on the field: its gain and distance
   * are rounded apart, so `gain >= toGo` can be wrong by a fraction of a yard. Read it with `converted`.
   */
  first?: boolean;
}

/** Confidence for one drive: the offense's and defense's units and the kicker (`teamConf`), and whether it's late and close. */
export interface DriveConf extends UnitConf {
  late: boolean;
}

/** Drive-sim field goal odds by distance, plus the kicker's confidence edge (`kEdge`, rating points). */
export function fgOdds(dist: number, kEdge = 0): number {
  return clamp(0.97 - (dist - 20) * 0.017 + kEdge * CONF.fgPerPoint, 0.3, 0.97);
}

/**
 * Game-clock cost of one simulated play, whistle to whistle plus the runoff before the next snap, and whether the clock was stopped at the whistle. With `split` (the situation path), the hurry-up's
 * snaps are an incompletion or out of bounds (`hurryStop` of them: the two-minute drill plays to stop the clock)
 * or in bounds with the clock running; without it the hurry-up is one draw as it always was.
 */
function simPlayClock(hurry: boolean, milk: boolean, pace: number, rng: Rng, split: boolean): { secs: number; stopped: boolean } {
  const D = DRIVE_SIM;
  const draw = ([m, sd, lo, hi]: number[]) => clamp(m + gauss(rng) * sd, lo, hi);
  if (hurry && split) {
    const stopped = rng() < D.hurryStop;
    return { secs: draw(stopped ? D.hurryStopSecs : D.hurryRunSecs), stopped };
  }
  if (hurry) return { secs: clamp(15 + gauss(rng) * 4, 7, 25), stopped: false };
  if (rng() < 0.3) return { secs: clamp(7 + gauss(rng) * 2, 4, 12), stopped: true }; // incompletion / out of bounds
  return { secs: clamp(((milk ? 38 : 32) + gauss(rng) * 6) * pace, 14, 45), stopped: false };
}

/**
 * The drive sim's play model, tuned so simulated FBS games match real 2024-25 score distributions
 * (scoring, close games and blowouts; see docs/SEASON.md). A play gains a normal "grind" draw shifted
 * by the rating gap, or with `explosive` odds a big play with a long tail. Big plays are what let
 * underdogs score and keep luck large enough that favorites lose about as often as real ones.
 */
export const DRIVE_SIM = {
  /** Mean and spread of an ordinary play, yards. */
  base: 4.6,
  sd: 5,
  /** Yards per play per point of offense-minus-defense overall. */
  edgePerPoint: 0.12,
  /** Odds of an explosive play (20+ yards about 6% of plays, like FBS offenses). */
  explosive: 0.06,
  /** An explosive play gains `explosiveMin` plus an exponential tail with this mean. */
  explosiveMin: 15,
  explosiveTail: 12,
  turnover: 0.022,
  /** A last-snap heave to the end zone: touchdown odds (plus `heaveTdPerPoint` per point of gap, within `heaveTdRange`) and interception odds; the rest fall incomplete. */
  heaveTd: 0.07,
  heaveTdPerPoint: 0.003,
  heaveTdRange: [0.02, 0.15],
  heaveInt: 0.15,
  heaveSecs: 8,
  /**
   * The hurry-up on the situation path: `hurryStop` of its snaps stop the clock (an incompletion, out of
   * bounds), costing `hurryStopSecs`; the rest run it, costing `hurryRunSecs` (the snap and the no-huddle
   * line-up), or `spikeRunSecs` when the next snap is a spike (the snap and lining up to spike it). [mean, sd, lo, hi]
   */
  hurryStop: 0.5,
  hurryStopSecs: [7, 2, 4, 12],
  hurryRunSecs: [22, 5, 12, 32],
  spikeRunSecs: [10, 2, 7, 14],
};

/** Yards on one simulated play; `xf` scales the big-play odds (weekly emphases). */
function simGain(diff: number, rng: Rng, xf = 1): [number, boolean] {
  const T = DRIVE_SIM;
  if (rng() < T.explosive * xf) return [Math.round(T.explosiveMin - Math.log(1 - rng()) * T.explosiveTail), true];
  return [Math.max(-6, Math.round(T.base + diff * T.edgePerPoint + gauss(rng) * T.sd)), false];
}

/**
 * Abstract simulation of an opponent possession (the user only plays offense for now).
 * `start` is in yards from the CPU's own goal line. With `conf`, each snap's rating gap moves by the
 * two units' confidence at that snap's leverage. With `mods`, the two teams' weekly emphases move
 * the gain, big-play and takeaway odds and field goals in their situations (season/emphasis.ts).
 * Neither draws extra random numbers, so without them a drive plays exactly as before.
 */
export function simulateDrive(
  offOvr: number, defOvr: number, start: number, rng: Rng, clock: DriveClock = NO_CLOCK, onPlay?: (p: SimPlay) => void, conf?: DriveConf,
  mods?: DriveMods,
): DriveSim {
  const diff = offOvr - defOvr;
  const edge = diff * DRIVE_SIM.edgePerPoint;
  let yard = start;
  let down = 1;
  let toGo = 10;
  let plays = 0;
  let secs = 0;
  const done = (points: number, result: DriveSim['result'], end = yard): DriveSim => ({
    points, result, plays, yards: end - start, endYard: end, secs: Math.min(secs, clock.timeLeft),
  });
  // The situation this snap, when the offense knows the score (`clock.lead`).
  const sitNow = (): Situation | null => clock.lead === undefined ? null : snapSituation(clock, down, toGo, yard, secs);
  const pace = clock.pace ?? 1;
  while (plays < 25) {
    if (secs >= clock.timeLeft) return done(0, 'END OF HALF');
    const sit = sitNow();
    const tmp = sit ? tempo(sit) : null;
    if (tmp === 'kneel' && !clock.quarterBreak) {
      // Victory formation: kneel until the clock runs out.
      while (secs < clock.timeLeft) {
        plays++;
        onPlay?.({ gain: -1, explosive: false, turnover: false, down, toGo, yard, t: secs, lev: 0, kneel: true });
        yard -= 1;
        toGo += 1;
        down++;
        secs += SITUATION.kneelSecs;
      }
      return done(0, 'END OF HALF');
    }
    if (sit && desperate(sit) && !clock.quarterBreak) {
      // One snap left and a field goal won't do: throw it to the end zone.
      plays++;
      const at = { yard, t: secs };
      secs += DRIVE_SIM.heaveSecs;
      const lev = leverage(down, 100 - yard, conf?.late ?? false);
      const [lo, hi] = DRIVE_SIM.heaveTdRange;
      const r = rng();
      if (r < clamp(DRIVE_SIM.heaveTd + diff * DRIVE_SIM.heaveTdPerPoint, lo, hi)) {
        onPlay?.({ gain: 100 - yard, explosive: true, turnover: false, down, toGo, ...at, lev, heave: true });
        return done(7, 'TOUCHDOWN', 100);
      }
      if (r > 1 - DRIVE_SIM.heaveInt) {
        onPlay?.({ gain: 0, explosive: false, turnover: true, down, toGo, ...at, lev, heave: true });
        return done(0, 'TURNOVER');
      }
      onPlay?.({ gain: 0, explosive: false, turnover: false, down, toGo, ...at, lev, heave: true });
      if (++down > 4) return done(0, 'DOWNS');
      continue;
    }
    plays++;
    const at = { yard, t: secs };
    const cost = sit ? simPlayClock(tmp === 'hurry', tmp === 'milk', pace, rng, true) : simPlayClock(clock.hurry, clock.milk, pace, rng, false);
    secs += cost.secs;
    // In bounds with the clock running: spike the next snap if the clock has to stop (`spikeNow`), lining up
    // to spike in place of a no-huddle call. Decided on the mean line-up, so only a spike draws.
    const spike = (): void => {
      if (!sit || cost.stopped || clock.quarterBreak || plays >= 25) return;
      const S = DRIVE_SIM.spikeRunSecs;
      const after = sitNow()!;
      if (!spikeNow({ ...after, secsLeft: after.secsLeft + cost.secs - S[0] })) return;
      secs += clamp(S[0] + gauss(rng) * S[1], S[2], S[3]) - cost.secs;
      plays++;
      onPlay?.({ gain: 0, explosive: false, turnover: false, down, toGo, yard, t: secs, lev: 0, spike: true });
      secs += 1;
      down++;
    };
    const lev = leverage(down, 100 - yard, conf?.late ?? false);
    const em = mods ? snapEdge(mods, down, toGo, yard) : 0;
    const emp = em ? { em } : {};
    if (rng() < DRIVE_SIM.turnover * (mods ? turnoverFactor(mods, down, toGo, yard) : 1)) {
      onPlay?.({ gain: 0, explosive: false, turnover: true, down, toGo, ...at, lev, ...emp });
      return done(0, 'TURNOVER');
    }
    const [gain, explosive] = simGain((conf ? diff + unitEdge(conf.off - conf.def, lev) : diff) + em, rng, mods ? explosiveFactor(mods, down, toGo, yard) : 1);
    onPlay?.({ gain, explosive, turnover: false, down, toGo, ...at, lev, ...emp });
    yard += gain;
    toGo -= gain;
    if (yard >= 100) return done(7, 'TOUCHDOWN', 100);
    if (toGo <= 0) {
      down = 1;
      toGo = Math.min(10, 100 - yard);
      spike();
      if (down === 1) continue;
    } else {
      down++;
      spike();
    }
    const fgDist = 100 - yard + 17;
    const kick = (): DriveSim => {
      const fgLev = leverage(down, 100 - yard, conf?.late ?? false, fgDist);
      const kEm = mods ? kickEdge(mods, fgDist) : 0;
      const made = rng() < fgOdds(fgDist, (conf ? unitEdge(conf.k, fgLev) : 0) + kEm);
      onPlay?.({ gain: 0, explosive: false, turnover: false, down, toGo, yard, t: secs, fg: { dist: fgDist, made }, lev: fgLev, ...(kEm ? { em: kEm } : {}) });
      return done(made ? 3 : 0, made ? 'FIELD GOAL' : 'MISSED FG');
    };
    const punt = (): DriveSim => {
      onPlay?.({ gain: 0, explosive: false, turnover: false, down, toGo, yard, t: secs, punt: true, lev: 0 });
      return done(0, 'PUNT');
    };
    const next = sitNow();
    if (next) {
      // The coach reads the situation: 4th down, or out of time before it.
      if (down > 4) return done(0, 'DOWNS');
      if (!clock.quarterBreak && kickNow(next)) return kick();
      if (down < 4) continue;
      const call = fourthDown(next, rng);
      if (call === 'fg') return kick();
      if (call === 'punt') return punt();
      continue; // go for it: play the snap
    }
    // Out of time with a makeable kick: line up for the field goal now.
    const lastPlay = !clock.quarterBreak && secs + 20 >= clock.timeLeft && fgDist <= 52;
    if (down === 4 || lastPlay) {
      if (fgDist <= 52) return kick();
      if (toGo <= 2 && yard > 45 && rng() < 0.5) {
        const conv = rng() < 0.55 + edge * 0.02;
        if (conv) {
          yard += toGo;
          down = 1;
          toGo = 10;
          continue;
        }
        return done(0, 'DOWNS');
      }
      return punt();
    }
  }
  onPlay?.({ gain: 0, explosive: false, turnover: false, down, toGo, yard, t: secs, punt: true, lev: 0 });
  return done(0, 'PUNT');
}

// ---------------------------------------------------------------- overtime

/**
 * FBS overtime (the 2021 rules): untimed periods with no kickoffs, each team getting the ball at the
 * opponent's 25 (`start`, yards from the offense's own goal), the order alternating every period.
 * After a touchdown the try is a kick or two in the 1st overtime and must be two from the 2nd
 * (`mustGoForTwo`); from the 3rd (`shootout`) each team only runs a two-point play from the 3. A
 * defensive score ends it, and so does the team going second taking the lead.
 * - `twoPt`: a simulated two-point try's odds (FBS teams convert about 45%), plus `twoPtPerPoint`
 *   per point of offense-minus-defense overall, within `twoPtRange`.
 */
export const OVERTIME = { start: 75, mustGoForTwo: 2, shootout: 3, twoPt: 0.45, twoPtPerPoint: 0.012, twoPtRange: [0.25, 0.7] };

/**
 * A simulated extra point (the CPU's, in a played game): FBS kickers make about 97% from the 3 (a
 * 20-yard kick, `dist`). `base` is the odds for a kicker of `mid` accuracy (the median FBS starter),
 * plus `perPoint` per point of kick accuracy (and of the kicker's confidence edge), within `range`:
 * the weakest starters (55) make about 91%, the best (95+) nearly all. Blocks are among the misses.
 */
export const PAT = { dist: 20, base: 0.97, mid: 77, perPoint: 0.0025, range: [0.85, 0.99] };

export function xpOdds(kac: number, kEdge = 0): number {
  const [lo, hi] = PAT.range;
  return clamp(PAT.base + (kac + kEdge - PAT.mid) * PAT.perPoint, lo, hi);
}

/** Whether a simulated two-point try is good. */
export function simTwoPoint(offOvr: number, defOvr: number, rng: Rng): boolean {
  const [lo, hi] = OVERTIME.twoPtRange;
  return rng() < clamp(OVERTIME.twoPt + (offOvr - defOvr) * OVERTIME.twoPtPerPoint, lo, hi);
}

/** Where the user's next drive starts (yards from own goal) after a CPU possession. */
export function userStartAfter(sim: DriveSim, rng: Rng): number {
  switch (sim.result) {
    case 'TOUCHDOWN':
    case 'FIELD GOAL':
      return 25;
    case 'PUNT':
      return clamp(Math.round(100 - (sim.endYard + 40 + gauss(rng) * 5)), 5, 40);
    case 'MISSED FG':
      return clamp(100 - sim.endYard, 20, 99);
    default:
      return clamp(100 - sim.endYard, 1, 99);
  }
}
