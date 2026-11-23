import type { BounceProfile } from '../sim/kicking';

export type KickUnit = 'fg' | 'xp' | 'punt' | 'kickoff';

/**
 * How the CPU kicker aims a punt or kickoff (the user calls the type, the kicker kicks it; game/cpuKicker.ts).
 * - `land`: where he wants it to come down: 'max' (all the leg he has), or yards short of the receivers'
 *   goal line (negative: into the end zone), or `short` yards past the kick line (the onside kick).
 * - `side`: across the field: the middle, the numbers away from the returner (the short side), or the
 *   sideline itself (the coffin corner, aimed just out of bounds).
 * - `cap`: the most power he puts on it.
 */
export interface KickAim {
  land: 'max' | { goal: number } | { short: number };
  side: 'mid' | 'numbers' | 'sideline';
  cap?: number;
}

/** The receiving team's look: a normal return, a punt block, a safe look against a fake, the hands team against an onside kick. */
export type ReturnScheme = 'return' | 'block' | 'safe' | 'hands';

/** A special-teams call: the kick type sets the flight shape and how the ball bounces; the drag (or the CPU kicker's aim) sets power and direction. */
export interface KickDef {
  id: string;
  name: string;
  unit: KickUnit;
  /** Default launch angle (degrees) and the range W/S or the wheel can tilt it through. */
  loft: number;
  loftRange: [number, number];
  bounce: BounceProfile;
  /** Coverage overloads toward the side the ball is kicked (directional kicks). */
  directional?: boolean;
  /** The punter rolls out and kicks on the move (the rugby punt), with the run option on a short 4th down. */
  rollout?: boolean;
  /** An onside kick: the kicking team goes for the ball once it has gone 10 yards. */
  onside?: boolean;
  /** Seconds a receiver loses gathering it off a bounce (the squib's bad hops). */
  gather?: number;
  /** A high ball the cover men arrive under: extra muff odds when one is close at the catch. */
  contested?: number;
  /** The CPU kicker's aim (punts and kickoffs). */
  aim?: KickAim;
  tip: string;
  /** What it's for and what it risks, for the call card. */
  good?: string;
  risk?: string;
}

const NORMAL: BounceProfile = { rest: 0.35, keep: 0.58, erratic: 0.4, backspin: 0, roll: 6.5 };

export const KICKS: KickDef[] = [
  {
    id: 'fg', name: 'Field Goal', unit: 'fg', loft: 38, loftRange: [32, 46], bounce: NORMAL,
    tip: 'Drag back to aim, release to kick. Mind the wind.',
  },
  {
    id: 'punt', name: 'Punt', unit: 'punt', loft: 51, loftRange: [44, 64], bounce: NORMAL,
    aim: { land: 'max', side: 'mid' },
    tip: 'A spiral: all the distance and hang he has.',
    good: 'DISTANCE AND HANG', risk: 'GETS RETURNED',
  },
  {
    id: 'directional', name: 'Directional', unit: 'punt', loft: 52, loftRange: [44, 60], bounce: NORMAL, directional: true,
    aim: { land: 'max', side: 'numbers', cap: 0.98 },
    tip: 'To the numbers on the short side. Takes the returner out of the middle.',
    good: 'SHORT RETURNS', risk: 'LESS DISTANCE',
  },
  {
    id: 'rugby', name: 'Rugby', unit: 'punt', loft: 40, loftRange: [30, 48], rollout: true, gather: 0.6,
    bounce: { rest: 0.42, keep: 0.8, erratic: 0.75, backspin: 0, roll: 4.5 },
    aim: { land: 'max', side: 'mid', cap: 0.92 },
    tip: 'Rolls out, kicks on the move. Hard to block, hard to field. Can run it on a short 4th.',
    good: 'BEATS A BLOCK, CAN RUN', risk: 'LESS AIR, BAD HOPS',
  },
  {
    id: 'line-drive', name: 'Line Drive', unit: 'punt', loft: 34, loftRange: [26, 44],
    bounce: { rest: 0.3, keep: 0.75, erratic: 0.45, backspin: 0, roll: 4 },
    aim: { land: 'max', side: 'mid' },
    tip: 'Low and long with a big roll. Cuts through a headwind; can outkick coverage.',
    good: 'CUTS A HEADWIND', risk: 'OUTKICKS COVERAGE',
  },
  {
    id: 'pooch', name: 'Pooch Punt', unit: 'punt', loft: 64, loftRange: [56, 72],
    bounce: { rest: 0.32, keep: 0.6, erratic: 0.6, backspin: 0.08, roll: 7 },
    aim: { land: { goal: 14 }, side: 'mid' },
    tip: 'High and soft with backspin. Gunners down it inside the 10.',
    good: 'PINS THEM DEEP', risk: 'FAIR CAUGHT IF SHORT',
  },
  {
    id: 'coffin', name: 'Coffin Corner', unit: 'punt', loft: 46, loftRange: [38, 56], bounce: NORMAL, directional: true,
    aim: { land: { goal: 8 }, side: 'sideline' },
    tip: 'Aimed out of bounds near the pylon. No return, all on his accuracy.',
    good: 'NO RETURN, DEEP PIN', risk: 'OUT SHORT, TOUCHBACK',
  },
  {
    id: 'xp', name: 'Extra Point', unit: 'xp', loft: 38, loftRange: [32, 46], bounce: NORMAL,
    tip: 'A 20-yard kick. Do not miss.',
  },
  {
    id: 'ko-deep', name: 'Deep Kick', unit: 'kickoff', loft: 45, loftRange: [36, 55], bounce: NORMAL,
    aim: { land: 'max', side: 'mid' },
    tip: 'Full power at the goal line. A big leg makes it a touchback to the 25.',
    good: 'TOUCHBACK, BIG LEG', risk: 'SHORT LEG: RETURNED',
  },
  {
    id: 'ko-corner', name: 'Corner Kick', unit: 'kickoff', loft: 47, loftRange: [40, 58], bounce: NORMAL, directional: true,
    aim: { land: { goal: 7 }, side: 'numbers' },
    tip: 'High to the numbers at the 5. Pins the returner to a sideline; coverage overloads.',
    good: 'PINS A RETURNER', risk: 'OUT OF BOUNDS: THE 35',
  },
  {
    id: 'ko-squib', name: 'Squib', unit: 'kickoff', loft: 10, loftRange: [6, 22], gather: 1.0,
    bounce: { rest: 0.5, keep: 0.8, erratic: 0.75, backspin: 0, roll: 4 },
    aim: { land: { goal: 22 }, side: 'mid' },
    tip: 'Low skipper. Up-backs have to field it: no big return.',
    good: 'AWAY FROM RETURNER', risk: 'GIVES UP FIELD',
  },
  {
    id: 'ko-sky', name: 'Sky Kick', unit: 'kickoff', loft: 64, loftRange: [54, 70], contested: 0.1,
    bounce: { rest: 0.4, keep: 0.5, erratic: 0.45, backspin: 0.1, roll: 7 },
    aim: { land: { goal: 30 }, side: 'mid' },
    tip: 'A pop-up onto the up-backs. Chaos: a muff is anyone\'s ball.',
    good: 'NO RETURN, MUFFS', risk: 'FAIR CAUGHT AT THE 30',
  },
  {
    id: 'ko-onside', name: 'Onside', unit: 'kickoff', loft: 16, loftRange: [8, 24], onside: true,
    bounce: { rest: 0.62, keep: 0.68, erratic: 0.6, backspin: 0, roll: 4 },
    aim: { land: { short: 7 }, side: 'numbers' },
    tip: 'A hop kick to the overload side. Recover it after 10 yards.',
    good: 'SURPRISE: HALF THE TIME', risk: 'FAILS: A SHORT FIELD',
  },
];

export const kickDef = (id: string): KickDef => KICKS.find((k) => k.id === id)!;

/** Calls shown on the SPECIAL playbook tab on a normal down. */
export const ST_TAB = ['fg', 'punt', 'directional', 'rugby', 'line-drive', 'pooch', 'coffin'].map(kickDef);
export const KICKOFF_CALLS = ['ko-deep', 'ko-corner', 'ko-squib', 'ko-sky', 'ko-onside'].map(kickDef);

/** Roster slot plus alignment: dx from the line (kickoff: the kick line), y absolute or relative to the ball. */
export interface StSpot {
  slot: string;
  dx: number;
  y: number;
  mode: 'abs' | 'rel';
  job: StJob;
}

/**
 * Special-teams jobs.
 * Kicking side: kicker, holder, punter, protect (block, then cover), gunner, cover (kickoff lane), safety.
 * Receiving side: rush (at the kicker), hold (rush, then peel back to block), jam (on a gunner), wall (return blocker), returner.
 */
export type StJob =
  | 'kicker' | 'holder' | 'punter' | 'protect' | 'gunner' | 'cover' | 'safety'
  | 'rush' | 'hold' | 'jam' | 'wall' | 'returner';

const r = (slot: string, dx: number, y: number, job: StJob): StSpot => ({ slot, dx, y, mode: 'rel', job });
const a = (slot: string, dx: number, y: number, job: StJob): StSpot => ({ slot, dx, y, mode: 'abs', job });

const LINE = [r('LT', -0.6, -2.4, 'protect'), r('LG', -0.6, -1.2, 'protect'), r('C', -0.5, 0, 'protect'), r('RG', -0.6, 1.2, 'protect'), r('RT', -0.6, 2.4, 'protect')];

/** The spot 7 yards behind the line; the kicker steps in from the left. */
export const HOLD_DEPTH = 7;
/** Where the holder kneels off the spot (yd back, yd toward the camera), so his hand in the hold pose is on the ball. */
const HOLDER_OFF = { x: 0.45, y: 0.4 };
export const PUNT_DEPTH = 14.5;

export const FG_UNIT: StSpot[] = [
  ...LINE,
  r('TE', -0.7, -3.6, 'protect'), r('SL', -0.7, 3.6, 'protect'),
  r('RB', -1.5, -4.7, 'protect'), r('Z', -1.5, 4.7, 'protect'),
  r('QB', -HOLD_DEPTH - HOLDER_OFF.x, HOLDER_OFF.y, 'holder'), r('K', -HOLD_DEPTH - 2.3, -1.7, 'kicker'),
];

export const FG_BLOCK: StSpot[] = [
  r('DE1', 1.0, -4.3, 'rush'), r('DT1', 1.0, -1.8, 'rush'), r('DT2', 1.0, 0.6, 'rush'), r('DE2', 1.0, 4.3, 'rush'),
  r('WLB', 1.4, -0.6, 'rush'), r('MLB', 1.4, 1.8, 'rush'), r('CB1', 1.2, -6.6, 'rush'), r('NB', 1.2, 6.6, 'rush'),
  r('SS', 6, -4, 'wall'), r('FS', 6, 4, 'wall'), r('CB2', 14, 0, 'wall'),
];

export const PUNT_UNIT: StSpot[] = [
  ...LINE,
  a('X', -0.6, 4.5, 'gunner'), a('Z', -0.6, 48.8, 'gunner'),
  r('RB', -5.5, -1.4, 'protect'), r('SL', -5.5, 1.4, 'protect'), r('TE', -6.5, 0, 'protect'),
  r('P', -PUNT_DEPTH, 0, 'punter'),
];

export const PUNT_RETURN: StSpot[] = [
  r('DE1', 1.0, -3.6, 'rush'), r('DT1', 1.0, -1.2, 'rush'), r('DT2', 1.0, 1.2, 'rush'), r('DE2', 1.0, 3.6, 'rush'),
  r('WLB', 1.2, -5.8, 'hold'), r('MLB', 1.2, 5.8, 'hold'),
  a('CB1', 1.2, 6.3, 'jam'), a('CB2', 1.2, 47.0, 'jam'),
  r('NB', 11, -5, 'wall'), r('SS', 11, 5, 'wall'),
  r('Z', 41, 0, 'returner'),
];

/** Kickoff: the kicker 6 yards behind the tee, ten cover men in lanes just behind the kick line. */
export const KICKOFF_UNIT: StSpot[] = [
  a('CB1', -4.5, 4.5, 'cover'), a('NB', -4.5, 10, 'cover'), a('WLB', -4.5, 15.5, 'cover'), a('DE1', -4.5, 21, 'cover'),
  a('SS', -4.5, 24.6, 'cover'), a('FS', -4.5, 28.8, 'cover'), a('DE2', -4.5, 32.4, 'cover'), a('MLB', -4.5, 37.8, 'cover'),
  a('RB', -4.5, 43.3, 'cover'), a('CB2', -4.5, 48.8, 'cover'),
  r('K', -6, -1.8, 'kicker'),
];

export const KICKOFF_RETURN: StSpot[] = [
  a('DE1', 15, 8, 'wall'), a('WLB', 15, 17.5, 'wall'), a('DT1', 15, 26.6, 'wall'), a('MLB', 15, 36, 'wall'), a('DE2', 15, 45.3, 'wall'),
  a('SS', 32, 12, 'wall'), a('CB1', 32, 22, 'wall'), a('CB2', 32, 31.3, 'wall'), a('FS', 32, 41.3, 'wall'),
  a('Z', 61, 20.5, 'returner'), a('RB', 61, 32.8, 'returner'),
];

/** Punt block: nine come (one more than the shield can block, overloaded to one edge), the gunners run free, one drops to the wall. */
export const PUNT_BLOCK: StSpot[] = [
  r('DE1', 1.0, -3.6, 'rush'), r('DT1', 1.0, -1.2, 'rush'), r('DT2', 1.0, 1.2, 'rush'), r('DE2', 1.0, 3.6, 'rush'),
  r('WLB', 1.0, -5.6, 'rush'), r('MLB', 1.0, 5.6, 'rush'), r('NB', 1.4, -7.6, 'rush'), r('SS', 1.4, 7.6, 'rush'),
  r('CB1', 1.6, -9.4, 'rush'), a('CB2', 9, 41.3, 'wall'),
  r('Z', 41, 0, 'returner'),
];

/** Safe look (they smell a fake): nobody comes, the front plays the line and holds up the gunners. */
export const PUNT_SAFE: StSpot[] = [
  r('DE1', 1.0, -3.6, 'hold'), r('DT1', 1.0, -1.2, 'hold'), r('DT2', 1.0, 1.2, 'hold'), r('DE2', 1.0, 3.6, 'hold'),
  r('WLB', 4.5, -3, 'hold'), r('MLB', 4.5, 3, 'hold'),
  a('CB1', 1.2, 6.3, 'jam'), a('CB2', 1.2, 47.0, 'jam'),
  r('NB', 11, -5, 'wall'), r('SS', 11, 5, 'wall'),
  r('Z', 41, 0, 'returner'),
];

/** Hands team: the sure hands up close for an onside kick, one man deep. */
export const KICKOFF_HANDS: StSpot[] = [
  a('X', 11, 8, 'wall'), a('Z', 11, 14.5, 'wall'), a('SL', 11, 21, 'wall'), a('TE', 11, 27, 'wall'),
  a('CB1', 11, 33, 'wall'), a('CB2', 11, 39.5, 'wall'), a('NB', 11, 46, 'wall'),
  a('FS', 19, 14, 'wall'), a('SS', 19, 27, 'wall'), a('MLB', 19, 40, 'wall'),
  a('RB', 40, 26.6, 'returner'),
];

/** Onside kick: seven bunched to the near side (high y), three to the far side, the kicker behind the tee. */
export const KICKOFF_ONSIDE: StSpot[] = [
  a('CB1', -6, 8, 'cover'), a('NB', -6, 14, 'cover'), a('WLB', -6, 20, 'cover'),
  a('DE1', -6, 30, 'cover'), a('SS', -6, 33.5, 'cover'), a('FS', -6, 37, 'cover'), a('DE2', -6, 40.5, 'cover'),
  a('MLB', -6, 44, 'cover'), a('RB', -6, 47.5, 'cover'), a('CB2', -6, 51, 'cover'),
  r('K', -6, -1.8, 'kicker'),
];

/** The overload side of the onside kick (high y). */
export const ONSIDE_SIDE = 1;
