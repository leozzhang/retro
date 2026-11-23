import type { Look, Pose } from '../render/sprites';
import type { BallState } from '../sim/ball';

/**
 * The title screen's highlight reel: big plays from the great rivalries, played through the engine
 * once by `npm run reel` (src/reel.test.ts) and kept as tapes in public/title/reel.json. The title
 * only plays them back (game/titleReel.ts); nothing here is simulated at runtime. Display only.
 */

/** The games on the reel, home team first; the name is the rivalry's (`RIVALRIES`) unless given. */
export const REEL_GAMES: { home: string; away: string }[] = [
  { home: 'ohiostate', away: 'michigan' },
  { home: 'texas', away: 'oklahoma' },
  { home: 'usc', away: 'ucla' },
  { home: 'alabama', away: 'auburn' },
  { home: 'notredame', away: 'usc' },
  { home: 'georgia', away: 'florida' },
  { home: 'navy', away: 'army' },
  { home: 'floridastate', away: 'florida' },
  { home: 'clemson', away: 'southcarolina' },
  { home: 'oregon', away: 'oregonstate' },
  { home: 'washington', away: 'washingtonstate' },
  { home: 'olemiss', away: 'mississippistate' },
  { home: 'stanford', away: 'california' },
];

/**
 * The generator's knobs. `games`: engine games tried a matchup; `clips`: kept a matchup; `fps`: frames a
 * second on file (played back interpolated); `scale`: positions are stored as integers, x this;
 * `maxSecs`: the longest clip kept. Playback: `fade` seconds to black between clips, `hold` on the
 * presnap, `dim` the overlay's alpha over the reel.
 */
export const REEL = { games: 3, clips: 2, fps: 15, scale: 20, maxSecs: 14, fade: 0.35, hold: 0.6, dim: 0.66 };

/** What a clip shows. */
export type ReelKind = 'passTd' | 'runTd' | 'pick6' | 'int' | 'bigCatch' | 'longRun';

/** Tables the integer codes index into. Append only: reel.json stores the indices. */
export const REEL_POSES: Pose[] = [
  'stand', 'stance', 'run0', 'run1', 'run2', 'run3', 'throw', 'throwEnd', 'catch', 'down', 'reach', 'dive',
  'drive', 'fight', 'stumble', 'drive1', 'drive2', 'fight1', 'fight2', 'set0', 'set1', 'set2',
  'kick', 'hold', 'puntDrop', 'fairCatch', 'spikeUp', 'spikeDown', 'crouch', 'leap', 'cheer', 'spinBall',
];
export const REEL_LOOKS: Look[] = ['fwd', 'back', 'hands', 'backHands'];
export const REEL_BALL: BallState[] = ['held', 'snap', 'air', 'bounce', 'kick', 'dead'];

/** One clip on file. Every number is an integer; positions are x `REEL.scale`. */
export interface ReelClip {
  home: string;
  away: string;
  /** Caption: the rivalry, and the play. */
  name: string;
  kind: ReelKind;
  /** Each man's kit, 'h' (home) or 'a', one character each, in the frames' order; and his skin. */
  kit: string;
  skin: string[];
  /** Frames on file. */
  n: number;
  /** Per frame, per man: x, y, and packed pose | look << 6 | facing (1: +1) << 8 | juke << 9. */
  men: number[];
  /** Per frame: state, x, y, z, carrier (-1 none), the spun ball's quarter turns (-1: none). */
  ball: number[];
  /** Per frame: the camera's focus, and its lead x 100. */
  cam: number[];
}

export interface ReelFile {
  fps: number;
  scale: number;
  clips: ReelClip[];
}
