import type { BounceProfile } from '../sim/kicking';

export type KickUnit = 'fg' | 'xp' | 'punt' | 'kickoff';

/** A special-teams call: the kick type sets the flight shape and how the ball bounces; the drag sets power and direction. */
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
  tip: string;
}

const NORMAL: BounceProfile = { rest: 0.35, keep: 0.58, erratic: 0.4, backspin: 0, roll: 6.5 };

export const KICKS: KickDef[] = [
  {
    id: 'fg', name: 'Field Goal', unit: 'fg', loft: 38, loftRange: [32, 46], bounce: NORMAL,
    tip: 'Drag back to aim, release to kick. Mind the wind.',
  },
  {
    id: 'punt', name: 'Punt', unit: 'punt', loft: 54, loftRange: [44, 64], bounce: NORMAL,
    tip: 'Snap, then drag + release before the rush gets home.',
  },
  {
    id: 'pooch', name: 'Pooch Punt', unit: 'punt', loft: 64, loftRange: [56, 72],
    bounce: { rest: 0.22, keep: 0.4, erratic: 0.3, backspin: 0.28, roll: 10 },
    tip: 'High and soft with backspin. Pin them inside the 10.',
  },
  {
    id: 'coffin', name: 'Coffin Corner', unit: 'punt', loft: 46, loftRange: [38, 56], bounce: NORMAL, directional: true,
    tip: 'Angle it out of bounds near the pylon.',
  },
  {
    id: 'line-drive', name: 'Line Drive', unit: 'punt', loft: 34, loftRange: [26, 44],
    bounce: { rest: 0.3, keep: 0.75, erratic: 0.45, backspin: 0, roll: 4 },
    tip: 'Low and long with a big roll. Can outkick coverage.',
  },
  {
    id: 'xp', name: 'Extra Point', unit: 'xp', loft: 38, loftRange: [32, 46], bounce: NORMAL,
    tip: 'A 20-yard kick. Do not miss.',
  },
  {
    id: 'ko-deep', name: 'Deep Kick', unit: 'kickoff', loft: 45, loftRange: [36, 55], bounce: NORMAL,
    tip: 'Full power into the end zone for a touchback.',
  },
  {
    id: 'ko-sky', name: 'Sky Kick', unit: 'kickoff', loft: 62, loftRange: [54, 70],
    bounce: { rest: 0.4, keep: 0.5, erratic: 0.45, backspin: 0.1, roll: 7 },
    tip: 'Hang time. Land it outside the 25 and cover.',
  },
  {
    id: 'ko-squib', name: 'Squib', unit: 'kickoff', loft: 12, loftRange: [6, 22],
    bounce: { rest: 0.55, keep: 0.88, erratic: 0.7, backspin: 0, roll: 3 },
    tip: 'Low skipper. Makes the up-backs field it.',
  },
  {
    id: 'ko-corner', name: 'Corner Kick', unit: 'kickoff', loft: 42, loftRange: [34, 52], bounce: NORMAL, directional: true,
    tip: 'Pin the returner to a sideline. Coverage overloads.',
  },
];

export const kickDef = (id: string): KickDef => KICKS.find((k) => k.id === id)!;

/** Calls shown on the SPECIAL playbook tab on a normal down. */
export const ST_TAB = ['fg', 'punt', 'pooch', 'coffin', 'line-drive'].map(kickDef);
export const KICKOFF_CALLS = ['ko-deep', 'ko-sky', 'ko-squib', 'ko-corner'].map(kickDef);

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

/** Holder 7 yards behind the line; the kicker steps in from the left. */
export const HOLD_DEPTH = 7;
export const PUNT_DEPTH = 14.5;

export const FG_UNIT: StSpot[] = [
  ...LINE,
  r('TE', -0.7, -3.6, 'protect'), r('SL', -0.7, 3.6, 'protect'),
  r('RB', -1.5, -4.7, 'protect'), r('Z', -1.5, 4.7, 'protect'),
  r('QB', -HOLD_DEPTH, 0, 'holder'), r('K', -HOLD_DEPTH - 2.3, -1.7, 'kicker'),
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
