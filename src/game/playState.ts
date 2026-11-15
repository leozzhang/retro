import { CONCEPTS } from '../data/concepts';
import { taggedAssign, type DefCall, type DefPackage, type DefTags, type Disguise, type Front } from '../data/defenses';
import { ROUTES, type PlayDef, type RunScheme } from '../data/plays';
import { passBlockValue } from '../data/ratings';
import { DEF_SLOTS, OFF_SLOTS, type DefSlot, type OffSlot, type RosterPlayer, type Team } from '../data/teams';
import type { Camera } from '../engine/camera';
import { FIELD_LEN, FIELD_W, OPP_GOAL, OWN_GOAL, STEP } from '../engine/constants';
import type { Input } from '../engine/input';
import { add, clamp, dist, gauss, len, lerp, norm, scale, sub, type Rng, type Vec } from '../engine/math';
import { teamUniform } from '../render/sprites';
import { ANTIC, cutKeep, eyesOf, facingQB, FIND, isRusher, KEY, matchZones, PREVENT, readyAt, ROUTE_SIDELINE, receiverFind, returnerAI, thinkDefense, thinkOffense, zoneSpot } from '../sim/ai';
import { hotness, launch, makeBall, passParams, startBounce, THROW_KINDS, THROWS, updateBounce, updateFlight, type Ball, type ThrowKind } from '../sim/ball';
import { CATCH_REACH, catchGrade, HANDOFF_ODDS, PITCH_REACH, pitchOdds, PLACEMENT, reachScore, resolveCatch, type CatchGrade } from '../sim/catching';
import { CELEBRATE, heldBall, releaseVel, spinTurns, startCelebration } from '../sim/celebrate';
import {
  accelOf, breaksInside, endurance, isEligible, JUKE, knockDown, makePlayer, maxSpeed, seek, setPose, startJuke, stepPlayer, tickTimers, leanMul, LEAN_FX, type Lean, type Player,
  startCatch, startGather,
} from '../sim/player';
import { aimLag, aimTarget, MIN_DRAG_PX, MOVE_FULL, stepAimCursor, throwErrorSd, type Aim } from '../sim/passing';
import {
  ARM_LEVERED, armOdds as runArmOdds, assignRunBlocks, CLIMB, POA, getOffWins, pileCap, playSide, pressEdge, RUN_CONTROL, BLOCK_ROLL_SD, DRAW_SET, levered, releaseClimbers, RUN_ENGAGE, runEngagement,
} from '../sim/runBlocking';
import { assignRunFits, onFront } from '../sim/runFits';
import { breakChance, CONTACT, dragSpeed, fallForward, jukeTackleMul, TACKLE_GAP, TACKLE_RANGE, tackleChance } from '../sim/tackling';
import { assignRushRoles, callProtection, inPocket, passEngagement, pocketSpot, PROT, protectStep, protecting, startRep } from '../sim/passPro';
import { matchDefense } from './matchups';
import { alignY, BACKFIELD_DX, personnelOf, resolvePlay, type CoverClass, type ResolvedPlay } from './resolvePlay';
import { anticRoles, expectThrow, rollOf, type AnticRole, type Expect, type ThrowSeen } from './habits';
import { fieldLabel, yardsText, type PlayOutcome } from './rules';

export type Phase = 'presnap' | 'snap' | 'live' | 'air' | 'run' | 'over';

export interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

export interface PlaySetup {
  offTeam: Team;
  defTeam: Team;
  /** The home team's id: it wears the home kit, the other team the away kit. Missing: the offense is home. */
  homeId?: string;
  offRoster: Record<string, RosterPlayer>;
  defRoster: Record<string, RosterPlayer>;
  play: PlayDef;
  defCall: DefCall;
  /** Which corners press this snap (part of the pre-snap look). */
  press: Partial<Record<DefSlot, boolean>>;
  /** The DC's tags on the call (spy, contain). */
  tags?: DefTags;
  /** Each defender's anticipation this snap (game/defBrain.ts); missing is neutral. */
  reads?: Partial<Record<DefSlot, Lean>>;
  /** The user's throws so far (game/habits.ts) and each defender's anticipation of them, 0..1; missing is none. */
  habits?: ThrowSeen[];
  antic?: Partial<Record<DefSlot, number>>;
  los: number;
  ballY: number;
  /** The user mirrored the play at the call. */
  flip?: boolean;
  /** The look the defense shows before the snap, if it's disguising its call (data/defenses.ts). */
  disguise?: Disguise | null;
  /** Extra aim lag (s) from a shaken QB on this snap (data/confidence.ts `shakenAimLag`). */
  aimNerves?: number;
  /** The two-minute drill (`clockOut`): an auto-run carrier gets out of bounds (`OOB_RUN`, sim/ai.ts). */
  clockOut?: boolean;
  /** The user's snap: a called give (`read: 'handoff'` or `'pitch'`) hands off on its own at the mesh (`giveDue`). Reads stay his. */
  autoGive?: boolean;
  /**
   * The harness's ablations (`npm run balance`, RUNFIT): blockers who stand down on a run, to measure what a
   * block is worth. `backside`: that many of the backside-most linemen who stay in; `slots`: by on-field
   * slot. Never set in a game.
   */
  ablate?: { backside?: number; slots?: OffSlot[] };
  /**
   * An audible: the snap this one replaces, before the snap. Everyone starts where he stands in it and goes to
   * his spot in the new play (`AUDIBLE`): a shift if the formation changed, nothing moves on a quiet check.
   */
  from?: Play;
  rng: Rng;
}

/**
 * Audibles (docs/DEFENSE.md, "The presnap"). Personnel can't change once the huddle breaks, so an audible is a
 * quiet check (same formation: nobody moves) or a shift (another formation in the same personnel, or the play
 * flipped). On a shift the offense jogs to its new spots at `jog` of top speed and the defense realigns at
 * `MOTION.trail`; nobody can snap until all eleven on offense are within `setR` yd of their spots and slow, and
 * then `set` s more (the NCAA's shift rule). Each disguiser rolls `spin` × (`DISGUISE.tipPrc` − prc/100) to
 * give it away, as motion makes him.
 */
export const AUDIBLE = { jog: 0.55, set: 1, setR: 0.25, spin: 0.35 };

const HISTORY_LEN = 60;
/** A lead back's path runs this far (yd) playside of the carrier's track (`aimLeads`): he takes the backer's inside-out angle. */
export const LEAD_TRACK = 0.4;
/**
 * The toss and the sweep aim at the edge, not their drawn spot (`aimPerimeter`): the back gets his width on the
 * drawn first step (up to `step` yd wide), then goes for a spot `out` yd outside the edge (`pressEdge`: the last man on the line plus
 * `POA.edge`), reaching it `bend` yd behind the line, and turns up. The gun sweep bends deeper: it runs flat from the
 * mesh, outside an unblocked key (power read) and the pullers (pin-pull). Drawn 12.5 yd out, he ran to the numbers
 * behind the line and the pursuit got there first.
 */
export const PERIMETER_AIM = { out: 1.5, bend: { toss: 1.2, sweep: 2.5 }, step: 3.5 };
/** A blocker leaves a defender to the puller or lead back closing on him as his point-of-attack man inside this (yd). */
const POA_CLAIM = 4;
/** The defense reads a handoff no sooner than this long after the snap (s), an under-center handoff's time (`reactToRun`). */
const RUN_TELL = 0.55;
/** The scripted zone read rides the mesh this long (s) before it gives (`giveDue`). */
export const READ_AT = 0.55;
/** Handoff reach; farther than this (up to PITCH_RANGE) the QB pitches it. */
export const HANDOFF_RANGE = 1.8;
export const PITCH_RANGE = 8;
const PITCH_SPEED = 13;
/** Tackle odds multiplier for a defender still engaged with a blocker (an arm tackle). */
const ARM_TACKLE = 0.5;

/**
 * After a catch: a defender who'd broken on the ball and is within `near` yd of the catch was converging
 * on it the whole way, so he's on the man after `react` s instead of the reaction everyone else needs.
 */
export const CATCH_PURSUIT = { near: 5, react: 0.05 };
/**
 * Who breaks on a throw: a defender within `near` yd of where it's going, or one who could get there
 * before it comes down (his top speed × the flight, plus `slack`). The rest keep their jobs.
 */
export const BREAK_ON = { near: 14, slack: 3 };
/**
 * The diving tackle (`diveAt`): in the open field (the carrier `past` yd beyond the line, the tackler not
 * in front of him), from `range` yd, when he's closing slower than `closing` yd/s, at `odds` of a normal tackle; a miss puts him down for `down` s. Without it a pursuer a step behind a runner as
 * fast as he is chases him the length of the field.
 */
/** A tackle on a receiver still in his catch state (hips not around yet) misses at `miss` of the usual rate. */
export const AT_CATCH = { miss: 0.4 };
/** A backside lineman on his way to a backer picks up a free down lineman this close to him (playside climbers keep their man). */
export const RUN_PICKUP = 1.1;
/**
 * Bodies on a designed run (docs/RUNGAME.md): a free defender can't run through the line. Within `r` yd
 * (centre to centre) of a blocker, or of a lineman engaged on a block (the pile), he's pushed back out to
 * `r`, loses the speed going into the body, and moves at no more than `keep` of his top speed along it: he scrapes around, or
 * finds a gap, instead of sprinting through. Only within `band` yd of the line, and not for a lineman who's
 * beaten his man off the ball (the get-off slip) or anyone on the ball carrier.
 */
export const BODY = { r: 0.6, keep: 0.75, band: 3 };
export const DIVE_TACKLE = { range: 1.7, closing: 1.0, odds: 0.55, down: 1.0, past: 5 };
/**
 * Seconds of full sprint from a full bar, from the least to the most enduring player, eased by
 * `endurance` squared: a pocket QB about 1.5 s, a mobile QB about 2.3, a WR about 2.9.
 */
const SPRINT_TIME = { min: 1.15, max: 3.46 };
/** Stamina regained per second off the sprint, least to most enduring. */
const SPRINT_RECOVER = { min: 0.12, max: 0.18 };
/** A user-controlled player's speed off the sprint, as a share of top speed: the sprint is the gear that hits the hole. */
const JOG_SPEED = 0.74;
/**
 * The user's ball carrier at the line (run phase, less than `zone` yd past the LOS). With no input
 * he coasts at `patience` of top speed on his heading instead of auto-driving downfield, and up or
 * down alone slides him along the line with `slideX` of forward lean. Past it, no input runs downfield.
 */
const RUN_CTRL = { zone: 2, patience: 0.5, slideX: 0.25 };
/** RB this close to the QB early on a play-action call sells the fake. */
const FAKE_RANGE = 2;
/** Chance the zone-read key crashes on the back; otherwise he stays home on the QB. */
const KEY_CRASH = 0.5;
/**
 * Power read's playside key has taken the sweep (`keyCrashing`) once he's `depth` yd into the backfield and still coming upfield
 * at `speed` yd/s, or he's widening with it along the line at `widen` yd/s: either way he's run himself out of the keep's C gap.
 */
const KEY_UPFIELD = { depth: 0.3, speed: 1.5, widen: 2 };
/** Extra reaction time for a read key who guessed wrong (crashed on a keep, stayed home on a give). */
const KEY_FOOLED = 0.35;
/** Zone read: the QB rides the back this far, so the give stays a handoff longer than on a called run. */
const MESH_REACH = 3.2;
/** Zone read keep: the QB aims for the alley this far outside wherever the read key is. */
const KEEP_WIDTH = 3.5;
/** Zone read: the QB pulls it if the back never reaches the mesh this long after the snap. */
const MESH_TIME = 1.2;
/** Speed option: on a keep (the key took the pitch man) the QB turns up this far inside him. */
const OPTION_CUT = 2.5;
/** Designed QB runs wait this long after the snap for the blocking to form, by scheme (QB power lets the guard get there). */
const QB_RUN_WAIT: Partial<Record<RunScheme, number>> = { gap: 0.35, draw: DRAW_SET };
/** A blocker split out wider than this from the ball is a stalk blocker, not a pass protector. */
export const STALK_SPLIT = 6.5;
/** Screens: the line pass-sets this long, then lets its rushers go and releases to block. */
/** Biting on play action: a backer's or safety's odds by his job (`base`, a `robber`, a `deep` safety), less `prc` a point of play recognition over 70. */
export const PA_BITE = { base: 0.8, robber: 0.7, deep: 0.35, prc: 0.01 };

export const SCREEN_SET = 0.8;
/** A box defender with a run-first (`fit`) zone reads the run this much sooner. */
const FIT_EARLY = 0.15;
/**
 * On a draw the backers read pass through the line's set (`DRAW_SET`) and this much longer before they
 * see the run: they've opened to their drops.
 */
const DRAW_FOOLED = 0.25;
/** A spy reacts to his QB taking off this fast. */
const SPY_REACT = 0.05;
/**
 * RPO: the run key is a guess until the mesh. A second-level defender reads whether the back got it
 * `base` + `slow` × (1 − prc/100) s after the snap, longer when he's sitting on the run (`leanMul` of
 * −lean.run); if the QB still has it he stops fitting and plays his assignment. Deep defenders stay home
 * on an RPO: they leave the run fit to the box until the handoff (docs/DEFENSE.md).
 */
export const MESH_READ = { base: 0.4, slow: 0.5 };
/**
 * Disguises (data/defenses.ts `Disguise`). Show spots: `deep` yd for a deep safety, `down` and
 * `downWide` for the safety rolled down in a single-high look, `zero` and `zeroWide` for both safeties
 * walked up. At the snap the AI takes each from there to his real job.
 * - The tells: a disguiser tips it with odds `tip` × (`tipPrc` − prc/100), creeping `tipShare` of the way
 *   to his real spot once the play clock is down to somewhere in `tipClock` (seconds). `walk` is the
 *   presnap walking speed, a share of top speed.
 */
export const DISGUISE = {
  deep: 13, down: 7, downWide: 4.5, zero: 6.5, zeroWide: 5,
  tip: 0.45, tipPrc: 1.3, tipShare: 0.55, tipClock: [4, 14] as [number, number], walk: 0.35,
};
/**
 * Presnap yo-yo motion: the receiver jogs at `speed` of top speed `depth` yd in toward the ball (no
 * closer than `gap`) and back. His man defender travels with him at `trail` speed; on a `bump` call
 * (or `bumpOdds` of trail snaps) the defense bumps over instead. A zone defender within `reach` yd of
 * him slides `bump` of his move, a deep one `deep`. A disguiser rolls `spin` × (`tipPrc` − prc/100)
 * to give it away and rotate early.
 */
export const MOTION = { speed: 0.5, depth: 7, gap: 2.5, trail: 0.8, bumpOdds: 0.2, reach: 11, bump: 0.35, deep: 0.12, spin: 0.35 };
/**
 * The hard count: a fake snap. A disguiser flinches `share` of the way to his real spot for `time` s
 * with odds `flinch` × (`DISGUISE.tipPrc` − prc/100); a walked-up blitzer jumps at the line with
 * odds `jump` × the same. A DL jumps offside with odds `offside` × his line's mean (1 − prc/100).
 * The game caps it at `perDrive` and takes `clock` s off the play clock each time.
 */
export const HARD_COUNT = { share: 0.6, time: 0.55, flinch: 0.55, jump: 0.5, offside: 0.1, perDrive: 2, clock: 1.5 };

/** Routes that make a receiver the target of a screen (the others stalk-block for him). */
const SCREEN_ROUTES: readonly string[] = ['smoke', 'tunnel', 'screen', 'bubble', 'slip'];

/**
 * In-flight tips (`Play.inFlight`), rolled once per defender at the ball's closest pass by him:
 * - **Into his body:** within `core` yd of him, it's into his chest, helmet or raised hands: `hit` odds
 *   below his `body` height whatever he's looking at, and above it (up to his `reach`) if he's reading
 *   the QB, full `under` yd below his reach. A low ball fired through a lineman or a backer doesn't get
 *   there; it has to be threaded between them.
 * - **Past him:** out to `width` yd (a lineman's arms-up lane is the widest), a defender reading the QB
 *   has up to `odds`, falling off toward the edge, with his `cth` and `prc`.
 * `engaged` scales a lineman on his block: he still reads the QB's eyes and gets his hands up, so a
 * low ball through the line from the pocket gets batted, and one from a QB outside it doesn't. `pick` (×
 * his cth) of tips by an unblocked man are caught; the rest pop `pop.dist` yd on (`pop.dead` off his
 * body or square into his hands: it dies at the line), found `find` s later. Nothing within `clear` yd of the target (that's the catch, `resolveArrival`).
 */
export const TIP = {
  core: 0.55,
  hit: 0.85,
  body: 1.9,
  width: { DL: 1.5, LB: 1.0, DB: 0.75 },
  reach: { DL: 2.8, LB: 2.9, DB: 3.0 },
  under: 0.6,
  odds: { DL: 0.65, LB: 0.45, DB: 0.35 },
  engaged: 0.85,
  pick: 0.35,
  clear: 1.8,
  find: 0.2,
  pop: { dist: 3, dead: 0.8, dur: 0.7, peak: 1.5 },
};

/**
 * The CPU QB's throw types (`cpuThrowKind`): LOB past `lobFrom` yd, BULLET into a defender within `tight`
 * yd of the spot inside `bulletMax`. He leads a receiver by the ball's real flight time to the led spot
 * (`cpuAim`, solved in `leadIters` passes). It used to be distance / 22 s, short of that, which put every
 * deep ball 3+ yd behind the man once placement started to matter (docs/PASSING.md).
 */
export const CPU_THROW = { lobFrom: 30, tight: 2.5, bulletMax: 24, leadIters: 4, shortDepth: 10 };

export type HandoffKind = 'handoff' | 'pitch';

/**
 * Pure handoff legality: the back must still be behind the line. Out of reach of
 * a handoff it's a pitch (or a shovel, if he's ahead of the QB), which needs a
 * yard of cushion behind the line of scrimmage.
 */
export function handoffKind(qb: Vec, rb: Vec, los: number, reach = HANDOFF_RANGE): HandoffKind | null {
  if (rb.x >= los - 0.3) return null;
  const d = dist(qb, rb);
  if (d <= reach) return 'handoff';
  if (d <= PITCH_RANGE && rb.x <= los - 1) return 'pitch';
  return null;
}

export class Play {
  readonly off: Player[] = [];
  readonly def: Player[] = [];
  readonly players: Player[];
  readonly qb: Player;
  /** Extra aim lag (s) from the QB's nerves this snap. */
  readonly aimNerves: number;
  /** The two-minute drill: an auto-run carrier gets out of bounds. */
  readonly clockOut: boolean;
  readonly autoGive: boolean;
  readonly center: Player;
  readonly rb: Player;
  /** Where the run is designed to hit (end of the RB's run path); run fits and blocks key on it. Moves on a QB keep. */
  hole: Vec;
  readonly ball: Ball;
  readonly los: number;
  readonly ballY: number;
  readonly playDef: PlayDef;
  /** The play as laid out for this snap (mirroring, personnel, concept routes). */
  readonly resolved: ResolvedPlay;
  readonly defCall: DefCall;
  /** The defense is in prevent (`DefTags.prevent`): no press, deeper cushions and deep zones (`PREVENT`). */
  readonly prevent: boolean;
  /** The DC's tags on the call (spy, contain, prevent, a line game). */
  readonly tags: DefTags;
  /** The receiver the DC keyed (`DefTags.key`, `KEY` in sim/ai.ts), or null. */
  readonly keyed: Player | null;
  /** The user's throws the defense remembers (game/habits.ts), the look, and the throw it expects now. */
  readonly habits: ThrowSeen[];
  readonly look: string;
  expect: Expect | null = null;
  /** When the QB first got out of the pocket, and the DC's trap side in field terms (+1 larger y; 0 none). */
  rolledAt: number | null = null;
  trapSide = 0;
  /** Who's answering the expected throw this step (`anticRoles`), and the strongest role each played this snap. */
  antic = new Map<Player, { role: AnticRole; s: number }>();
  readonly anticLog = new Map<Player, AnticRole>();
  /** The end playing contain on a rollout he's chasing, or null. */
  rollContain: Player | null = null;
  /** The release: seconds after the snap, and the QB's roll then; the defender nearest the catch. */
  private releasedAt: { t: number; roll: -1 | 0 | 1 } | null = null;
  private nearCatch: Player | null = null;
  /** Defensive personnel for this snap, matched to the offense's. */
  readonly defPackage: DefPackage;
  readonly qbDrop: Vec;
  /** Zone read: the backside end, left unblocked for the QB to read. */
  readonly readKey: Player | null = null;
  readonly rng: Rng;

  phase: Phase = 'presnap';
  time = 0;
  snapTime = 0;
  overTime = 0;
  carrier: Player | null = null;
  /** Only for show: the defender falling on a ball knocked loose after the play (`knockLoose`). */
  recoverer: Player | null = null;
  /** The player the user is steering (QB pre-throw, ball carrier after a catch). */
  controlled: Player | null = null;
  aim: Aim | null = null;
  ballTarget: Vec | null = null;
  intended: Player | null = null;
  scramble = false;
  /** The QB (nobody steering him) has stepped up into the pocket. */
  climbed = false;
  thrown = false;
  /** The last offensive player to hold the ball, and whether a pass was caught: for the box score. */
  ballMan: Player | null = null;
  caught = false;
  /** Who made the tackle that ended the play (the sacker on a sack). */
  tackler: Player | null = null;
  /** How set (facing the QB, 0..1) the receiver was on the last catch attempt. */
  catchSet = 0;
  /** How much of a look at the ball the receiver got on the last catch attempt (0..1, `readyAt`). */
  catchReady = 1;
  /** The throw type picked while aiming (the wheel or 1), TOUCH each snap; and the one in the air. */
  throwKind: ThrowKind = 'touch';
  thrownKind: ThrowKind = 'touch';
  /** The pass was tipped in flight (by `tipper`); it's a free ball now. */
  passTipped = false;
  tipper: Player | null = null;
  /** Defenders already checked for a tip on this throw. */
  private tipChecked = new Set<Player>();
  /** Each defender's closest pass of the ball so far while it's in his lane: distance and the ball's height then. */
  private tipNear = new Map<Player, { d: number; z: number }>();
  outcome: PlayOutcome | null = null;
  popups: Popup[] = [];
  history = new Map<number, Vec[]>();
  /** Ball has been handed or pitched to the RB. */
  handedOff = false;
  /** The ball in the air is a pitch, not a forward pass. */
  pitch = false;
  faked = false;
  /** On the fake: the backers and safeties who could have bitten, and the slots of those who did (what an OC watches on film). */
  paSeen = 0;
  paBit: string[] = [];
  /** Zone read: the read key crashes on the back this snap (decided at the snap). */
  keyCrash = false;
  /** Zone read: the back has reached the mesh. */
  private meshed = false;
  /** Zone read: the QB pulled it. */
  kept = false;
  /** Auto-runner: the lane he's committed to (world y). */
  laneY = NaN;
  /** Screens and bubbles: the receiver the others block for. */
  readonly screenTarget: Player | null = null;
  /** Screen: the line has let its rushers go and is releasing. */
  screenReleased = false;

  /** The look the defense shows before the snap, if it's disguised. */
  readonly disguise: Disguise | null;
  /** Each disguised defender's real spot (where his call lines him up); he shows `start`. */
  private readonly realSpot = new Map<Player, Vec>();
  /** Disguisers who'll tip it, by the play clock they start creeping at. */
  private readonly tipAt = new Map<Player, number>();
  /** Disguisers creeping toward their real spot. */
  private readonly tipped = new Set<Player>();
  /** A flinch on the hard count: where to, and until when. */
  private readonly flinches = new Map<Player, { to: Vec; until: number }>();
  /** Presnap motion under way: the receiver, his spot, the turn, and how the defense answers. */
  motion: { who: Player; home: Vec; turn: Vec; back: boolean; trail: boolean } | null = null;
  /** Receivers sent in motion this snap, for cycling through them. */
  private motions = 0;
  /** Players who moved before the snap: their `start` is reset at the snap. */
  private readonly movedPre = new Set<Player>();
  /** Seconds on the play clock, set by the game each presnap frame (none headless). */
  clockLeft = Infinity;
  /** An audible's shift under way (`AUDIBLE`): when the offense got set, or null until it is. */
  shift: { setAt: number | null } | null = null;

  constructor(s: PlaySetup) {
    this.ablate = s.ablate;
    this.los = s.los;
    this.ballY = s.ballY;
    this.playDef = s.play;
    const rp = (this.resolved = resolvePlay(s.play, s.ballY, s.flip ?? false));
    this.defCall = s.defCall;
    this.rng = s.rng;
    this.aimNerves = s.aimNerves ?? 0;
    this.clockOut = s.clockOut ?? false;
    this.autoGive = s.autoGive ?? false;

    const offHome = s.homeId === undefined || s.homeId === s.offTeam.id;
    const offU = teamUniform(s.offTeam, offHome);
    const defU = teamUniform(s.defTeam, !offHome);
    const bySlot = new Map<string, Player>();

    for (const slot of OFF_SLOTS) {
      const a = rp.align[slot];
      const y = clamp(alignY(a, s.ballY), 1, FIELD_W - 1);
      const p = makePlayer('off', s.offRoster[rp.cast[slot]], offU, { x: s.los + a.dx, y });
      const rn = rp.routes[slot];
      p.routeName = rn ?? null;
      p.isBlocker = p.role === 'OL' || rn === 'block' || !!(rn && ROUTES[rn].lead);
      p.thenBlock = !!(rn && ROUTES[rn].thenBlock);
      p.stalk = p.isBlocker && p.role !== 'OL' && Math.abs(y - s.ballY) > STALK_SPLIT;
      p.routeDelay = (rn && ROUTES[rn].delay) || 0;
      p.delayBlock = !!(rn && ROUTES[rn].delayBlock);
      if (rn && SCREEN_ROUTES.includes(rn) && !this.screenTarget) this.screenTarget = p;
      p.pull = rp.pulls.find((pl) => pl.who === slot)?.job ?? null;
      if (rn && rn !== 'block') this.buildRoute(p, rn);
      this.off.push(p);
      bySlot.set(slot, p);
    }
    this.qb = bySlot.get('QB')!;
    this.center = bySlot.get('C')!;
    this.rb = bySlot.get('RB')!;
    this.qbDrop = { x: this.qb.pos.x - s.play.drop, y: clamp(this.qb.pos.y + rp.dropY, 2, FIELD_W - 2) };
    const rbRoute = rp.routes.RB;
    if (rbRoute === 'paFake') this.buildFake();
    const qbPath = s.play.qbPath;
    this.hole =
      rbRoute && ROUTES[rbRoute].run && this.rb.route.length
        ? { ...this.rb.route[this.rb.route.length - 1] }
        : qbPath
          ? { x: this.los + qbPath[0], y: clamp(this.ballY + qbPath[1] * rp.strongSign, 2, FIELD_W - 2) }
          : { x: this.los + 1.5, y: this.ballY };

    this.aimPerimeter();
    this.aimLeads();

    this.prevent = !!s.tags?.prevent;
    this.tags = s.tags ?? {};
    this.keyed = s.tags?.key ? bySlot.get(s.tags.key) ?? null : null;
    this.habits = s.habits ?? [];
    this.trapSide = s.tags?.trap ? (s.tags.trap === 'strong' ? 1 : -1) * rp.strongSign : 0;
    this.look = `${personnelOf(s.play.formation)} ${s.play.formation.name}`;
    this.disguise = s.disguise ?? null;
    const plan = matchDefense(s.defCall, s.play, rp);
    this.defPackage = plan.pkg;
    const assign = taggedAssign(s.defCall, plan.assign, s.tags);
    for (const slot of DEF_SLOTS) {
      const a = assign[slot];
      const d = makePlayer('def', s.defRoster[plan.cast[slot]], defU, { x: 0, y: 0 });
      d.assign = a;
      const lean = s.reads?.[slot];
      if (lean) d.lean = lean;
      d.antic = s.antic?.[slot] ?? 0;
      d.pos = this.defAlignment(slot, d, bySlot, s.press[slot] ?? false);
      d.start = { ...d.pos };
      this.def.push(d);
    }
    if (this.disguise) {
      for (const d of this.def) {
        const show = this.disguiseSpot(d.slot as DefSlot, d, bySlot);
        if (!show) continue;
        this.realSpot.set(d, d.pos);
        d.pos = show;
        d.start = { ...show };
      }
    }
    // The tells: a disguiser who'll give it away by creeping as the play clock runs down.
    const [lo, hi] = DISGUISE.tipClock;
    for (const d of this.realSpot.keys()) {
      if (this.rng() < DISGUISE.tip * (DISGUISE.tipPrc - d.r.prc / 100)) this.tipAt.set(d, lo + this.rng() * (hi - lo));
    }

    if (s.play.read === 'zoneRead' || s.play.read === 'option') {
      // The read key is the outermost lineman on the backside, away from the hole; on power read
      // and the option it's the playside end.
      const toHole = Math.sign(this.hole.y - this.ballY) || rp.strongSign;
      const side = s.play.read === 'option' || s.play.key === 'play' ? toHole : -toHole;
      const dl = this.def.filter((d) => d.role === 'DL');
      this.readKey = dl.reduce((a, b) => ((b.pos.y - a.pos.y) * side > 0 ? b : a));
    }

    this.players = [...this.off, ...this.def];
    this.ball = makeBall(this.los, this.ballY);
    if (s.from) this.carryPresnap(s.from);
  }

  /**
   * An audible: everyone starts where he stood in `from` (matched by who he is) and goes to his spot in this play.
   * Routes, holes and alignments were all laid out from the new spots. With the same call the disguise's state
   * carries over (who's tipping it and when); an offense that has to move is a shift, which may force its hand.
   */
  private carryPresnap(from: Play): void {
    const key = (p: Player) => `${p.side}|${p.name}|${p.num}`;
    const was = new Map(from.players.map((p) => [key(p), p]));
    this.time = from.time;
    this.motions = from.motions;
    let moves = false;
    for (const p of this.players) {
      const o = was.get(key(p));
      if (!o) continue;
      if (p.side === 'off' && dist(o.pos, p.start) > AUDIBLE.setR) moves = true;
      p.pos = { ...o.pos };
      p.vel = { ...o.vel };
      p.anim = o.anim;
      if (dist(p.pos, p.start) > 0.01) this.movedPre.add(p);
    }
    if (from.shift && from.shift.setAt === null) moves = true; // still shifting from the last one
    if (this.defCall.id === from.defCall.id) {
      const old = new Map(from.def.map((d) => [key(d), d]));
      for (const d of this.realSpot.keys()) {
        const o = old.get(key(d));
        if (!o) continue;
        this.tipAt.delete(d);
        const at = from.tipAt.get(o);
        if (at !== undefined) this.tipAt.set(d, at);
        if (from.tipped.has(o)) this.tipped.add(d);
      }
    }
    if (!moves) return;
    this.shift = { setAt: null };
    for (const d of this.realSpot.keys()) {
      if (this.rng() < AUDIBLE.spin * (DISGUISE.tipPrc - d.r.prc / 100)) this.tipped.add(d);
    }
  }

  /** The offense is shifting and not yet set (no snap until it is). */
  shifting(): boolean {
    return !!this.shift && (this.shift.setAt === null || this.time - this.shift.setAt < AUDIBLE.set);
  }

  /**
   * A lead back leads the carrier, wherever he lines up: each step of his `lead` path is put on the
   * back's own track at that depth (`LEAD_TRACK` playside of it), so he's in the hole ahead of him. Drawn as an
   * offset from his alignment, an H offset beside the QB led the C gap while the back hit the A or B.
   */
  private aimLeads(): void {
    const rb = this.rb;
    if (this.playDef.qbRun || !rb.routeName || !ROUTES[rb.routeName].run || !rb.route.length) return;
    const track = [rb.pos, ...rb.route];
    const yAt = (x: number) => {
      for (let i = 1; i < track.length; i++) {
        const a = track[i - 1];
        const b = track[i];
        if (x <= b.x || i === track.length - 1) return a.y + (b.y - a.y) * clamp((x - a.x) / (b.x - a.x || 1), 0, 1);
      }
      return track[track.length - 1].y;
    };
    const side = Math.sign(this.hole.y - this.ballY) || this.resolved.strongSign;
    // The toss's lead (`leadWide`) leads the back's new track to the edge too, not his drawn spot 11 yd out.
    const toss = rb.routeName === 'toss' || rb.routeName === 'sweep';
    for (const p of this.off) {
      if (!(p.routeName === 'lead' || (toss && p.routeName === 'leadWide')) || p === rb || p.pos.x - this.los > BACKFIELD_DX) continue;
      p.route = p.route.map((pt) => ({ x: pt.x, y: clamp(yAt(pt.x) + side * LEAD_TRACK, 2, FIELD_W - 2) }));
    }
  }

  /**
   * The toss and the sweep (`PERIMETER_AIM`): the drawn first step for width, then a spot just outside the edge
   * `bend` yd behind the line, then up. That spot is the play's hole, which the lanes, the edge's spill and the
   * leads key on.
   */
  private aimPerimeter(): void {
    const rb = this.rb;
    if (this.playDef.qbRun || (rb.routeName !== 'toss' && rb.routeName !== 'sweep') || !rb.route.length) return;
    const edge = pressEdge(this);
    if (edge === null) return;
    const side = Math.sign(this.hole.y - this.ballY) || this.resolved.strongSign;
    const y = clamp(this.ballY + side * (edge + PERIMETER_AIM.out), 2, FIELD_W - 2);
    const first = rb.route[0];
    const bend = PERIMETER_AIM.bend[rb.routeName];
    rb.route = [
      // A short first step (the gun sweep's) stays; the toss's 6 yd flat one is cut: he angles from the pitch.
      ...(Math.abs(first.y - rb.pos.y) <= PERIMETER_AIM.step && first.x < this.los - bend ? [first] : []),
      { x: this.los - bend, y },
      { x: this.los + 4, y: clamp(y + side, 2, FIELD_W - 2) },
    ];
    rb.routeDir = norm(sub(rb.route[rb.route.length - 1], rb.route[rb.route.length - 2]));
    rb.cutKeep = rb.route.map(() => 1);
    this.hole = { x: this.los + 1, y };
  }

  private buildRoute(p: Player, rn: keyof typeof ROUTES): void {
    const r = ROUTES[rn];
    // +1 means "inside" is +y. A lead block from the backfield (kick-out, lead, the toss's lead) is drawn
    // for the strong side, so an offset back (Strong I's fullback) goes there too, not toward the ball.
    const leadBack = !!r.lead && p.pos.x - this.los <= BACKFIELD_DX;
    const side = leadBack ? this.resolved.strongSign : Math.sign(this.ballY - p.pos.y) || this.resolved.strongSign;
    let prev = p.pos;
    let last = p.pos;
    for (const [dn, ins] of r.pts) {
      // Waypoints stay `ROUTE_SIDELINE` inside the sideline, so a receiver at speed doesn't carry out of bounds.
      const pt = { x: Math.min(p.pos.x + dn, 119), y: clamp(p.pos.y + ins * side, ROUTE_SIDELINE, FIELD_W - ROUTE_SIDELINE) };
      p.route.push(pt);
      prev = last;
      last = pt;
    }
    if (r.cont && p.route.length) p.routeDir = norm(sub(last, prev));

    // Speed carried through each waypoint, from how sharply the route turns there.
    p.passRoute = !r.run && !r.thenBlock && !r.lead;
    p.settle = p.passRoute && !r.cont && p.route.length > 0;
    p.look = r.lookDepth !== undefined ? Infinity : r.look ?? 1;
    p.lookDepth = r.lookDepth ?? Infinity;
    p.cutKeep = p.route.map((pt, i) => {
      const next = p.route[i + 1];
      if (!next) return r.cont ? 1 : 0;
      const into = norm(sub(pt, i ? p.route[i - 1] : p.pos));
      const out = norm(sub(next, pt));
      const turn = (Math.acos(clamp(into.x * out.x + into.y * out.y, -1, 1)) * 180) / Math.PI;
      return cutKeep(turn, p.r.rte);
    });
  }

  /**
   * Play-action fake: meet the QB just in front of where he'll be about half a
   * second into his drop, carry out the fake across his face, then protect.
   */
  private buildFake(): void {
    const qb = this.qb.pos;
    const rb = this.rb;
    const drop = sub(this.qbDrop, qb);
    const along = Math.min(1, 2.5 / Math.max(len(drop), 0.01));
    const mesh = { x: qb.x + drop.x * along + 0.9, y: qb.y + drop.y * along };
    const side = rb.pos.y <= mesh.y ? 1 : -1;
    rb.route = [mesh, { x: mesh.x + 0.5, y: clamp(mesh.y + side * 1.0, 1, FIELD_W - 1) }];
    rb.routeDir = null;
  }

  private defAlignment(slot: DefSlot, d: Player, off: Map<string, Player>, press: boolean): Vec {
    const los = this.los;
    const by = this.ballY;
    const front = this.defCall.front;
    // DL techniques sit on the OL splits (G 1.5, T 3): DTs shade the guards, DEs outside the tackles.
    const base: Record<DefSlot, Vec> = {
      DE1: { x: los + 1.2, y: by - 4.5 },
      DT1: { x: los + 1.0, y: by - 1.25 },
      DT2: { x: los + 1.0, y: by + 1.5 },
      DE2: { x: los + 1.2, y: by + 4.5 },
      WLB: { x: los + 4.5, y: by - 2.6 },
      MLB: { x: los + 4.5, y: by + 2.6 },
      CB1: { x: los + 6, y: 8 },
      CB2: { x: los + 6, y: FIELD_W - 8 },
      NB: { x: los + 5, y: by },
      FS: { x: los + 13, y: by - 8 },
      SS: { x: los + 13, y: by + 8 },
    };
    if (front !== 'even') Object.assign(base, frontSet(front, los, by, this.resolved.strongSign));
    const a = d.assign!;
    let pos = base[slot];
    if (a.kind === 'man') {
      const t = off.get(a.target)!;
      d.manTarget = t;
      const inside = Math.sign(by - t.pos.y) || 1;
      if (d.role === 'CB') {
        press = press && !this.prevent;
        d.press = press;
        // A corner worried about the deep ball bails deeper.
        d.cushion = press ? 1 : (slot === 'CB1' || slot === 'CB2' ? 6.5 : 4.5) + LEAN_FX.bail * Math.max(0, d.lean.deep) + (this.prevent ? PREVENT.cushion : 0);
        d.turned = press;
        // Sitting on a throw he's seen, he lines up shallower: a tell (`ANTIC.tell`).
        pos = { x: los + d.cushion - (d.antic >= ANTIC.tellFrom && !press ? ANTIC.tell : 0), y: t.pos.y + inside * (0.8 + LEAN_FX.shade * d.lean.inside) };
      } else if (d.role === 'LB') {
        d.cushion = 1.5;
        pos = { x: pos.x, y: lerp(pos.y, t.pos.y, 0.4) };
      } else {
        d.cushion = 3;
        pos = { x: los + 5.5, y: t.pos.y + inside * (1 + LEAN_FX.shade * d.lean.inside) };
      }
    } else if (a.kind === 'deep') {
      // Corners in a deep third or quarter line up over the outside receiver; a backer carrying the
      // middle (Tampa 2) shows his normal spot.
      if (d.role === 'CB') pos = this.overWidest(slot, off, 7, 1);
      else if (d.role === 'S') pos = { x: los + 12.5 + this.rng() * 1.5 + (this.prevent ? PREVENT.deep : 0), y: (a.yMin + a.yMax) / 2 };
    } else if (a.kind === 'robber') {
      pos = { x: los + 9, y: by };
    } else if (a.kind === 'zone') {
      const z = zoneSpot(this, a);
      if (slot === 'NB' || d.role === 'S') pos = { x: los + (a.fit ? 5 : 6), y: z.y };
      else if (d.role === 'CB') pos = this.overWidest(slot, off, a.spot === 'flat' ? 5 : 7, 1);
    } else if (a.kind === 'spy') {
      if (d.role !== 'LB') pos = { x: los + 6, y: by };
    } else if (d.role !== 'DL' && (front === 'even' || front === 'wide')) {
      pos = { x: los + 3, y: pos.y }; // walked-up blitzer: a tell for the QB
    }
    // A backer sitting on the run creeps up: a tell, if you're watching for it.
    if (d.role === 'LB' && d.lean.run > 0) pos = { x: Math.max(los + 1.5, pos.x - LEAN_FX.creep * d.lean.run), y: pos.y };
    return { x: Math.min(pos.x, FIELD_LEN - 0.5), y: clamp(pos.y, 1, FIELD_W - 1) };
  }

  /**
   * Where a disguised defender shows himself, or null if the disguise doesn't move him. Safeties line up
   * in the shown shell; corners walk up into press over a zone, or play off with outside leverage over man.
   */
  private disguiseSpot(slot: DefSlot, d: Player, off: Map<string, Player>): Vec | null {
    const g = this.disguise!;
    const a = d.assign!;
    if (a.kind === 'spy' || this.prevent) return null;
    const { los, ballY: by } = this;
    const D = DISGUISE;
    if (slot === 'FS' || slot === 'SS') {
      // Each safety shows on the side of his real job, so the spin is a rotation, not a sprint across.
      const both = this.def.filter((x) => x.slot === 'FS' || x.slot === 'SS');
      const other = both.find((x) => x !== d);
      const side = !other ? (slot === 'FS' ? -1 : 1) : d.pos.y < other.pos.y || (d.pos.y === other.pos.y && slot === 'FS') ? -1 : 1;
      if (g.show === 'two-high') return { x: los + D.deep, y: side < 0 ? FIELD_W / 4 : (FIELD_W * 3) / 4 };
      if (g.show === 'zero') return { x: los + D.zero, y: clamp(by + side * D.zeroWide, 2, FIELD_W - 2) };
      // Single-high: the safety with the deepest job shows the middle.
      const deep = (x: Player) => (x.assign?.kind === 'deep' ? 2 : x.assign?.kind === 'robber' ? 1 : 0);
      const mid = !other || deep(d) > deep(other) || (deep(d) === deep(other) && slot === 'FS');
      return mid ? { x: los + D.deep, y: FIELD_W / 2 } : { x: los + D.down, y: clamp(by + side * D.downWide, 2, FIELD_W - 2) };
    }
    if ((slot === 'CB1' || slot === 'CB2') && g.corners) {
      if (g.corners === 'press' && a.kind !== 'man') {
        // Press bail: up on the outside receiver with the inside leverage of press man.
        const w = this.overWidest(slot, off, 1, 0);
        d.press = true;
        return { x: w.x, y: w.y + Math.sign(by - w.y) * 0.8 };
      }
      if (g.corners === 'off' && a.kind === 'man') {
        d.press = false;
        d.turned = false;
        d.cushion = 7;
        return this.overWidest(slot, off, 7, 1);
      }
    }
    return null;
  }

  /** The defense's disguise is still on: someone stands away from his real spot. */
  isDisguised(): boolean {
    return this.realSpot.size > 0;
  }

  /** Whether the ball can be snapped: not with a man in motion. */
  canSnap(): boolean {
    return this.phase === 'presnap' && !this.motion && !this.shifting();
  }

  /** Receivers who can go in motion, the slots first, then the wideouts, then the tight ends. */
  private motionMen(): Player[] {
    const RANK: Partial<Record<CoverClass, number>> = { slot: 0, wide: 1, inline: 2 };
    const rank = (o: Player) => RANK[this.resolved.cover[o.slot as OffSlot] ?? 'back'] ?? 3;
    return this.off
      .filter((o) => isEligible(o) && o.role !== 'QB' && rank(o) < 3 && o.pos.x > this.los - 2)
      .sort((a, b) => rank(a) - rank(b) || a.pos.y - b.pos.y);
  }

  /** Yo-yo motion: the next receiver jogs in toward the ball and back. Returns false if no one can go. */
  startMotion(): boolean {
    if (!this.canSnap()) return false;
    const men = this.motionMen();
    if (!men.length) return false;
    const who = men[this.motions++ % men.length];
    const home = { ...who.start };
    const off = home.y - this.ballY;
    let dir = -Math.sign(off) || 1;
    let travel = Math.min(MOTION.depth, Math.abs(off) - MOTION.gap);
    if (travel < 2) {
      dir = -dir; // in tight: motion out and back
      travel = 4;
    }
    const turn = { x: home.x, y: clamp(home.y + dir * travel, 1.5, FIELD_W - 1.5) };
    const trail = this.defCall.motion !== 'bump' && this.rng() >= MOTION.bumpOdds;
    this.motion = { who, home, turn, back: false, trail };
    // Motion can force a disguise's hand: a defender who has to move gives it away.
    for (const d of this.realSpot.keys()) {
      if (this.rng() < MOTION.spin * (DISGUISE.tipPrc - d.r.prc / 100)) this.tipped.add(d);
    }
    return true;
  }

  /**
   * The hard count: a fake snap. Disguisers may flinch toward their real spots and walked-up blitzers
   * may jump. Returns true if a lineman jumped offside (the game takes it from there).
   */
  hardCount(): boolean {
    if (!this.canSnap()) return false;
    const H = HARD_COUNT;
    for (const d of this.def) {
      const real = this.realSpot.get(d);
      const raw = DISGUISE.tipPrc - d.r.prc / 100;
      if (real && this.rng() < H.flinch * raw) {
        this.flinches.set(d, { to: lerp2(this.restSpot(d), real, H.share), until: this.time + H.time });
      } else if (d.role !== 'DL' && d.assign?.kind === 'rush' && this.rng() < H.jump * raw) {
        this.flinches.set(d, { to: { x: this.los + 1.2, y: d.pos.y }, until: this.time + H.time });
      }
    }
    const dl = this.def.filter((d) => d.role === 'DL');
    const loose = dl.reduce((n, d) => n + (1 - d.r.prc / 100), 0) / Math.max(1, dl.length);
    const offside = this.rng() < H.offside * loose;
    if (offside) this.popup('OFFSIDE', { x: this.los + 1, y: this.ballY }, '#ffd23f');
    return offside;
  }

  /** Where a defender stands before the snap if nothing moves him: his shown spot, or partway home once he's tipped it. */
  private restSpot(d: Player): Vec {
    const real = this.realSpot.get(d);
    return real && this.tipped.has(d) ? lerp2(d.start, real, DISGUISE.tipShare) : d.start;
  }

  /** Presnap movement: the motion man and the defense's answer to him, tips and flinches. Each sets `want`. */
  private presnapMoves(): void {
    for (const [d, at] of this.tipAt) if (this.clockLeft <= at) this.tipped.add(d);
    const m = this.motion;
    let dy = 0;
    if (m) {
      const w = m.who;
      if (!m.back && dist(w.pos, m.turn) < 0.4) m.back = true;
      if (m.back && dist(w.pos, m.home) < 0.25 && len(w.vel) < 0.6) {
        this.motion = null;
        w.want = { x: 0, y: 0 };
      } else {
        w.want = seek(w, m.back ? m.home : m.turn, maxSpeed(w) * MOTION.speed, 0.8);
        this.movedPre.add(w);
      }
      dy = w.pos.y - m.home.y;
    }
    // An audible's shift: the offense jogs to its new spots; set once all eleven are there and still.
    const sh = this.shift;
    if (sh) {
      let set = true;
      for (const p of this.off) {
        const far = dist(p.pos, p.start);
        if (far > AUDIBLE.setR || len(p.vel) > 0.6) set = false;
        if (far < 0.05 && len(p.vel) < 0.3) continue;
        p.want = seek(p, p.start, maxSpeed(p) * AUDIBLE.jog, 0.8);
      }
      if (!set) sh.setAt = null;
      else if (sh.setAt === null) sh.setAt = this.time;
    }
    for (const d of this.def) {
      let to = this.restSpot(d);
      let speed = maxSpeed(d) * (sh && dist(d.pos, to) > 1 ? MOTION.trail : DISGUISE.walk);
      const f = this.flinches.get(d);
      if (f && this.time < f.until) {
        to = f.to;
        speed = maxSpeed(d) * 0.7;
      }
      if (m && dy) {
        const k = this.motionShare(d, m);
        if (k === 1) speed = maxSpeed(d) * MOTION.trail;
        to = { x: to.x, y: clamp(to.y + k * dy, 1, FIELD_W - 1) };
      }
      if (dist(to, d.pos) < 0.08 && len(d.vel) < 0.3) continue;
      d.want = seek(d, to, speed, 0.7);
      this.movedPre.add(d);
    }
  }

  /** How much of the motion man's move a defender takes: all of it trailing him in man, a slide in zone. */
  private motionShare(d: Player, m: NonNullable<Play['motion']>): number {
    const a = d.assign;
    if (!a || a.kind === 'rush' || d.role === 'DL') return 0;
    if (a.kind === 'man') return d.manTarget === m.who ? (m.trail ? 1 : MOTION.bump) : 0;
    const near = Math.max(0, 1 - Math.abs(d.start.y - m.home.y) / MOTION.reach);
    return (a.kind === 'deep' ? MOTION.deep : MOTION.bump) * near;
  }

  /** A corner's spot over the outermost receiver on his side, `depth` yards deep with outside leverage. */
  private overWidest(slot: DefSlot, off: Map<string, Player>, depth: number, lev: number): Vec {
    const side = slot === 'CB1' ? -1 : 1;
    let w: Player | null = null;
    for (const o of off.values()) {
      if (!isEligible(o) || o.role === 'OL' || (o.pos.y - this.ballY) * side <= 0) continue;
      if (!w || (o.pos.y - w.pos.y) * side > 0) w = o;
    }
    const y = w ? w.pos.y + side * lev : side < 0 ? 8 : FIELD_W - 8;
    return { x: this.los + depth, y };
  }

  /** The line's run-blocking rules for this play. */
  get runScheme(): RunScheme {
    return this.playDef.scheme?.run ?? 'zone';
  }

  /** Draw: the line is still showing pass. */
  passSet(): boolean {
    return this.runScheme === 'draw' && this.time - this.snapTime < DRAW_SET;
  }

  /** Run blocking rules are in effect for engagements (designed run, ball not thrown, draw set done). */
  runBlocking(): boolean {
    return this.playDef.block === 'run' && !this.thrown && !this.passSet();
  }

  snap(): void {
    if (!this.canSnap()) return;
    for (const p of this.movedPre) p.start = { ...p.pos };
    this.phase = 'snap';
    this.snapTime = this.time;
    const from = { x: this.center.pos.x + 0.3, y: this.center.pos.y, z: 0.4 };
    const to = { x: this.qb.pos.x, y: this.qb.pos.y, z: 1.2 };
    launch(this.ball, from, to, dist(from, to) / 16, 0.15, 'snap');
    if (this.readKey) this.keyCrash = this.rng() < KEY_CRASH;
    if (this.playDef.block === 'run' && this.runScheme !== 'draw') {
      assignRunBlocks(this);
      this.applyAblation();
      assignRunFits(this);
    } else {
      assignRushRoles(this);
      this.assignProtection();
    }
    for (const d of this.def) {
      const r = d.manTarget;
      if (d.press && r && this.rng() < 0.5 + (d.r.prs - r.r.rls) / 100) r.jam = 0.45;
    }
    // Run blocking is a run key: the second level reads it and comes downhill.
    if (this.playDef.block === 'run') {
      // RPO pass-first (the DC's tag): the hook and curl defenders on the tagged route's side play pass.
      const passSide = this.tags.rpo && this.playDef.read === 'rpo' ? this.rpoSide() : 0;
      for (const d of this.def) {
        if (d.role === 'DL') continue;
        const t = d.manTarget;
        // Still has a receiver to mirror; a backer on the back fills on a designed run (he keys him).
        if (t && !t.isBlocker && !(this.playDef.block === 'run' && t === this.rb && d.role === 'LB')) continue;
        const a = d.assign;
        if (passSide && a?.kind === 'zone' && (a.spot === 'hook' || a.spot === 'curl') && Math.sign(zoneSpot(this, a).y - this.ballY) === passSide) {
          d.fitAt = Infinity;
          this.passRead.add(d);
          continue;
        }
        const read =
          0.35 + (1 - d.r.prc / 100) * 0.5 + (a?.kind === 'deep' ? 0.15 : 0) + (this.runScheme === 'draw' ? DRAW_SET + DRAW_FOOLED : 0) -
          (a?.kind === 'zone' && a.fit ? FIT_EARLY : 0);
        d.fitAt = this.snapTime + read * leanMul(d.lean.run);
        d.fitUntil = Infinity;
        if (this.playDef.read === 'rpo') {
          if (a?.kind === 'deep') d.fitAt = Infinity;
          else this.meshRead.set(d, this.snapTime + (MESH_READ.base + (1 - d.r.prc / 100) * MESH_READ.slow) * leanMul(-d.lean.run));
        }
      }
    }
  }

  /** RPO: the side of the ball (±1 across the field) of the tagged route (the play's concept routes), or 0. */
  private rpoSide(): number {
    const tag = new Set<string>();
    for (const c of [this.playDef.strong, this.playDef.weak]) if (c) for (const r of Object.values(CONCEPTS[c].routes)) tag.add(r!);
    const o = this.off.find((p) => p.routeName && tag.has(p.routeName));
    return o ? Math.sign(o.start.y - this.ballY) || 1 : 0;
  }

  /** RPO: second-level defenders who read that the QB pulled it, by the time they read it. */
  private readonly meshRead = new Map<Player, number>();
  /** RPO: defenders who've read the pull and play the pass now (`zoneCover` stops its read step). */
  readonly passRead = new Set<Player>();
  /** Blockers standing down for an ablation (`PlaySetup.ablate`): they block nobody. */
  readonly idle = new Set<Player>();
  private readonly ablate: PlaySetup['ablate'];
  /** Defenders who were blocked at some point this snap, and the ones who got off a block (the RUNFIT rows). */
  readonly wasBlocked = new Set<Player>();
  readonly gotOff = new Set<Player>();
  /** Defensive linemen who've had their get-off roll this snap (one each). */
  private readonly slipped = new Set<Player>();

  /** RPO: each defender's mesh read comes due. The QB still has it: he stops fitting the run. */
  private updateMeshReads(): void {
    for (const [d, at] of this.meshRead) {
      if (this.time < at) continue;
      this.meshRead.delete(d);
      if (this.handedOff || this.carrier !== this.qb) continue;
      this.passRead.add(d);
      d.fitUntil = Math.min(d.fitUntil, this.time);
    }
  }

  /**
   * Linemen slide to the defensive line by alignment; backs and tight ends pick
   * up blitzers. A spare lineman helps or takes any blitzer the backs can't.
   */
  private assignProtection(): void {
    if (protecting(this)) {
      // The line's own call: man, half slide or slide (sim/passPro.ts).
      const s = this.playDef.scheme?.slide;
      const sign = s ? (s === 'strong' ? this.resolved.strongSign : -this.resolved.strongSign) : undefined;
      callProtection(this, sign as 1 | -1 | undefined);
      return;
    }
    const byY = (a: Player, b: Player) => a.pos.y - b.pos.y;
    const rushers = this.def.filter(isRusher);
    const dl = rushers.filter((d) => d.role === 'DL').sort(byY);
    const blitzers = rushers.filter((d) => d.role !== 'DL');
    const ol = this.off.filter((o) => o.role === 'OL');
    const backs = this.off.filter((o) => o.isBlocker && o.role !== 'OL' && !o.stalk);
    const take = (pool: Player[], r: Player, metric: (b: Player) => number) => {
      let best: Player | null = null;
      for (const b of pool) if (!b.mark && (!best || metric(b) < metric(best))) best = b;
      if (best) best.mark = r;
      return !!best;
    };
    const slide = this.playDef.scheme?.slide;
    if (slide) {
      // Slide: each lineman takes the gap toward the slide; a back checks the edge rusher left behind.
      const sign = slide === 'strong' ? this.resolved.strongSign : -this.resolved.strongSign;
      const edge = sign > 0 ? dl[0] : dl[dl.length - 1];
      const backHasEdge = !!edge && take(backs, edge, (b) => dist(b.pos, edge.pos));
      for (const r of dl) {
        if (r === edge && backHasEdge) continue;
        take(ol, r, (b) => Math.abs(b.pos.y + sign * 1.2 - r.pos.y));
      }
    } else {
      for (const r of dl) take(ol, r, (b) => Math.abs(b.pos.y - r.pos.y));
    }
    for (const r of blitzers) {
      if (!take(backs, r, (b) => dist(b.pos, r.pos))) take(ol, r, (b) => dist(b.pos, r.pos));
    }
  }

  update(dt: number, input: Input, cam: Camera): void {
    this.time += dt;
    for (const p of this.players) tickTimers(p, dt);
    if (this.phase !== 'presnap') this.recordHistory();

    switch (this.phase) {
      case 'snap':
        if (updateFlight(this.ball, dt)) {
          this.giveBall(this.qb);
          this.controlled = this.qb;
          this.phase = 'live';
        }
        break;
      case 'live':
        this.updateLive(input, cam);
        if (this.meshRead.size) this.updateMeshReads();
        break;
      case 'air':
        if (updateFlight(this.ball, dt)) this.resolveArrival();
        else if (!this.pitch) this.inFlight();
        break;
      case 'over':
        this.overTime += dt;
        if (this.ball.state === 'bounce') updateBounce(this.ball, dt);
        if (this.recoverer) this.updateRecovery();
        break;
      default:
        break;
    }

    for (const p of this.off) if (p !== this.controlled) thinkOffense(this, p);
    if (this.phase === 'live') matchZones(this);
    if (this.phase === 'live' && this.habits.length) this.readThrow();
    for (const d of this.def) {
      if (d === this.carrier) returnerAI(this, d);
      else thinkDefense(this, d);
    }
    if (this.phase === 'presnap') this.presnapMoves();
    if (this.controlled) this.userControl(input, dt);
    this.pile();
    this.drag(dt);

    if (this.runBlocking()) releaseClimbers(this);
    if (this.playDef.screen && !this.screenReleased && this.phase !== 'presnap' && this.time - this.snapTime >= SCREEN_SET) {
      // Let the rush go: every lineman comes off his man and releases to block for the screen.
      this.screenReleased = true;
      for (const d of this.def) if (d.engagedBy.some((b) => b.role === 'OL')) this.release(d);
      for (const o of this.off) if (o.role === 'OL') o.mark = null;
    }
    protectStep(this);
    this.updateEngagements(dt);
    this.blockCut();
    for (const p of this.players) stepPlayer(p, dt);
    this.bodies();
    this.updateEyes();
    this.anchorBlockers();
    this.formEngagements();

    if (this.ball.state === 'held' && this.carrier) {
      const c = this.carrier;
      const up = heldBall(c);
      this.ball.pos = up
        ? { x: c.pos.x + c.facing * up.dx, y: c.pos.y + 0.05, z: up.z }
        : { x: c.pos.x + c.facing * 0.25, y: c.pos.y + 0.05, z: c.down ? 0.2 : 1.1 };
      if (c.celebrate?.released && c.celebrate.kind === 'spin') {
        // Stood on its tip in front of him, to spin.
        this.ball.state = 'dead';
        this.ball.carrier = null;
        this.ball.pos = { x: c.pos.x + c.facing * CELEBRATE.spin.ball.dx, y: c.pos.y + 0.05, z: CELEBRATE.spin.ball.z };
      } else if (c.celebrate?.released) {
        // Spiked or tossed: the ball bounces free.
        this.ball.state = 'bounce';
        this.ball.carrier = null;
        this.ball.vel = releaseVel(c.celebrate);
      }
    }
    if (this.carrier?.celebrate) this.ball.spin = spinTurns(this.carrier.celebrate) ?? undefined;
    if (this.phase === 'live' || this.phase === 'run') {
      this.checkBounds();
      if ((this.phase as Phase) !== 'over') this.checkTackles(); // checkBounds may have ended the play
    }

    for (const pp of this.popups) pp.t += dt;
    this.popups = this.popups.filter((pp) => pp.t < 1.4);
  }

  private recordHistory(): void {
    for (const p of this.off) {
      if (!isEligible(p)) continue;
      let h = this.history.get(p.id);
      if (!h) this.history.set(p.id, (h = []));
      h.push({ ...p.pos });
      if (h.length > HISTORY_LEN) h.shift();
    }
  }

  private giveBall(p: Player): void {
    if (p.side === 'off') this.ballMan = p;
    this.carrier = p;
    this.ball.state = 'held';
    this.ball.carrier = p;
  }

  // ------------------------------------------------------------ passing

  private updateLive(input: Input, cam: Camera): void {
    const qb = this.qb;
    if (this.carrier !== qb) return;
    if (this.playDef.read === 'option' && qb.pos.x > this.los - 0.3) {
      this.optionKeep();
      return;
    }
    if (!this.scramble && qb.pos.x > this.los + 0.3) {
      this.scramble = true;
      this.aim = null;
      for (const d of this.def) d.reactAt = this.time + (d.assign?.kind === 'spy' ? SPY_REACT : (0.2 + (1 - d.r.prc / 100) * 0.4) * leanMul(d.lean.qb));
      this.popup('SCRAMBLE', qb.pos, '#9ad7ff');
    }
    if (this.autoGive && this.calledGive() && this.giveDue()) {
      this.handoff();
      return;
    }
    if ((input.mouse.rpressed || input.hit('KeyF')) && this.handoffOption()) {
      this.handoff();
      return;
    }
    if (this.playDef.qbRun) {
      this.startQbRun();
      return;
    }
    if (this.playDef.read === 'zoneRead' && this.updateMesh()) return;
    if (this.playDef.kind === 'pa' && !this.faked && this.time - this.snapTime < 1.3 && dist(this.rb.pos, qb.pos) < FAKE_RANGE) {
      this.sellFake();
    }
    const canThrow = !this.scramble && !qb.down;
    const m = input.mouse;
    // Throw type: the wheel steps it (up = more loft), 1 cycles it (trackpads).
    if (canThrow && (this.aim || m.wheel) && m.wheel) {
      const i = THROW_KINDS.indexOf(this.throwKind) - Math.sign(m.wheel);
      this.throwKind = THROW_KINDS[clamp(i, 0, THROW_KINDS.length - 1)];
    }
    if (canThrow && input.hit('Digit1')) this.throwKind = THROW_KINDS[(THROW_KINDS.indexOf(this.throwKind) + 1) % THROW_KINDS.length];
    if (canThrow && m.pressed) this.aim = { start: { x: m.downX, y: m.downY }, cur: { x: m.downX, y: m.downY } };
    if (!this.aim) return;
    // Aim feel: the line chases the mouse, slower for a worse passer (one real-time step, so SLOW AIM doesn't add to it).
    this.aim.mouse = { x: m.x, y: m.y };
    const { pressure, moving } = this.passContext(true);
    const lag = aimLag(qb.r, pressure, moving, this.aimNerves);
    this.aim.cur = stepAimCursor(this.aim.cur, this.aim.mouse, lag.tau, lag.vmax, STEP);
    if (!canThrow) {
      this.aim = null;
    } else if (input.hit('Space')) {
      // Pull the ball down: drop the aim without throwing. Releasing the button later does nothing.
      this.aim = null;
    } else if (m.released || !m.down) {
      const drag = len(sub(this.aim.start, this.aim.cur));
      const tgt = aimTarget(this.aim, qb.pos, cam, qb.r.arm, this.throwKind);
      this.aim = null;
      if (drag >= MIN_DRAG_PX) this.throwBall(tgt, this.throwKind, true);
    } else {
      // Pulling back to throw turns him to face it, as if stepping into it (D), even on the drop.
      const tgt = aimTarget(this.aim, qb.pos, cam, qb.r.arm, this.throwKind);
      qb.facing = tgt.x < qb.pos.x - 0.5 ? -1 : 1;
      setPose(qb, 'throw', 0.05);
    }
  }

  // ------------------------------------------------------------ handoffs

  /** What a right-click would do right now, or null if the RB can't take it. */
  handoffOption(): HandoffKind | null {
    const qb = this.qb;
    const rb = this.rb;
    if (this.phase !== 'live' || this.carrier !== qb || this.scramble || this.thrown || qb.down) return null;
    if (this.playDef.qbRun || rb.isBlocker || rb.down || rb.engaged || rb.stun > 0) return null;
    return handoffKind(qb.pos, rb.pos, this.los, this.readKey ? MESH_REACH : HANDOFF_RANGE);
  }

  /** A called give, not a read: the QB hands it off (or tosses it) whatever the defense does. */
  calledGive(): boolean {
    return this.playDef.read === 'handoff' || this.playDef.read === 'pitch';
  }

  /**
   * The scripted give, the same for the user's called runs (`autoGive`), the harness and the CPU's autopilot:
   * a handoff as soon as the back is in reach (after the line's pass set on a draw); on a zone read, after
   * riding the mesh `READ_AT` s unless the key crashes; a toss pitches at once; the option pitches once the
   * key is on the QB.
   */
  giveDue(): boolean {
    const opt = this.handoffOption();
    if (!opt) return false;
    const read = this.playDef.read;
    if (read === 'option') return opt === 'pitch' && dist(this.readKey!.pos, this.qb.pos) < 3 && !this.keyCrashing();
    if (opt === 'pitch') return read === 'pitch';
    const since = this.time - this.snapTime;
    const ready = read !== 'zoneRead' || (since >= READ_AT && !this.keyCrashing());
    return ready && (this.runScheme !== 'draw' || since >= DRAW_SET);
  }

  handoff(): void {
    const kind = this.handoffOption();
    if (!kind) return;
    const qb = this.qb;
    const rb = this.rb;
    this.aim = null;
    this.handedOff = true;
    this.reactToRun(this.readKey && !this.keyCrash && this.playDef.read === 'zoneRead' ? this.readKey : null, kind === 'handoff');
    if (kind === 'pitch') {
      // Lead the back to where he'll be at full tilt when it gets there: along his heading if he's
      // moving, along his path if he's just starting off, accelerating from his current speed.
      const next = rb.route[rb.routeIdx];
      const dir = len(rb.vel) >= 3 ? norm(rb.vel) : next ? norm(sub(next, rb.pos)) : { x: 0, y: 0 };
      const v0 = Math.max(0, rb.vel.x * dir.x + rb.vel.y * dir.y);
      const top = maxSpeed(rb);
      const acc = accelOf(rb);
      const tUp = Math.max(0, (top - v0) / acc);
      const reach = (t: number) =>
        t <= tUp ? v0 * t + 0.5 * acc * t * t : v0 * tUp + 0.5 * acc * tUp * tUp + top * (t - tUp);
      let lead = rb.pos;
      for (let i = 0; i < 3; i++) lead = add(rb.pos, scale(dir, reach(dist(qb.pos, lead) / PITCH_SPEED + 0.05)));
      const from = { x: qb.pos.x, y: qb.pos.y, z: 1.1 };
      const to = { x: lead.x, y: lead.y, z: 1.0 };
      launch(this.ball, from, to, dist(from, to) / PITCH_SPEED + 0.05, 0.35);
      this.ballTarget = { x: to.x, y: to.y };
      this.intended = rb;
      rb.findAt = this.time;
      this.pitch = true;
      this.carrier = null;
      this.controlled = null;
      this.phase = 'air';
      setPose(qb, 'throwEnd', 0.3);
      return;
    }
    if (this.rng() >= HANDOFF_ODDS) {
      this.fumble(rb.pos, 'Botched exchange');
      return;
    }
    this.giveBall(rb);
    this.controlled = rb;
    this.phase = 'run';
  }

  /** Designed QB carry: once he has the snap it's a run, and the defense reads it as one. */
  startQbRun(): void {
    if (!this.playDef.qbRun || this.phase !== 'live' || this.carrier !== this.qb) return;
    if (this.time - this.snapTime < (QB_RUN_WAIT[this.runScheme] ?? 0)) return;
    this.aim = null;
    this.reactToRun();
    this.phase = 'run';
  }

  /**
   * Zone read: ride the back through the mesh. Once he's carried past the QB
   * without a give (or never got there), the QB pulls it. Returns true on a keep.
   */
  private updateMesh(): boolean {
    const d = dist(this.rb.pos, this.qb.pos);
    if (d <= MESH_REACH) this.meshed = true;
    else if (this.meshed || this.time - this.snapTime > MESH_TIME) {
      this.keep();
      return true;
    }
    return false;
  }

  /**
   * The read key is going after the back rather than the QB: the cue to pull it. A backside key
   * crashes down the line; a playside key (power read) runs with the sweep.
   */
  keyCrashing(): boolean {
    const k = this.readKey;
    if (!k || len(k.vel) < 1.5) return false;
    // A playside key (power read) is read by depth: the sweep crosses the QB's face toward him, so chasing the back
    // and squeezing the QB point the same way. Taking the sweep, he flies upfield into the backfield; at home he
    // sits on the line. Read by direction, the QB gave it every time. Widening along the line with the sweep (a blitzing end
    // slow-playing it) takes him out of the keep's gap too: read by depth alone, the QB gave it into him.
    if (this.playDef.key === 'play') {
      return (k.pos.x < this.los - KEY_UPFIELD.depth && k.vel.x < -KEY_UPFIELD.speed) || k.vel.y * playSide(this) > KEY_UPFIELD.widen;
    }
    const v = norm(k.vel);
    const at = (p: Player) => {
      const d = norm(sub(p.pos, k.pos));
      return v.x * d.x + v.y * d.y;
    };
    return at(this.rb) > at(this.qb) + 0.15;
  }

  /**
   * Zone read keep: the QB runs for the alley outside wherever the read key is, and the back carries
   * out his fake. On power read he keeps it inside the key instead, behind the pulling guard.
   */
  private keep(): void {
    const key = this.readKey!;
    const out = Math.sign(key.start.y - this.ballY) || -this.resolved.strongSign;
    this.kept = true;
    this.aim = null;
    const y = this.playDef.keep === 'inside' ? key.start.y - out * POA.keepInside : key.pos.y + out * KEEP_WIDTH;
    this.hole = { x: this.los + 1, y: clamp(y, 2, FIELD_W - 2) };
    // He's been riding the mesh, so he pulls it already moving.
    this.qb.vel = scale(norm(sub(this.hole, this.qb.pos)), maxSpeed(this.qb) * 0.5);
    this.reactToRun(this.keyCrash ? key : null);
    this.phase = 'run';
    this.popup('KEEP', this.qb.pos, '#9ad7ff');
  }

  /** Speed option: the QB got to the line without pitching it, so he keeps it and turns up inside the key. */
  private optionKeep(): void {
    const key = this.readKey!;
    const out = Math.sign(key.start.y - this.ballY) || this.resolved.strongSign;
    this.kept = true;
    this.aim = null;
    this.hole = { x: this.los + 1.5, y: clamp(key.pos.y - out * OPTION_CUT, 2, FIELD_W - 2) };
    this.reactToRun(this.keyCrash ? null : key); // a key who took the pitch man is late to the QB
    this.phase = 'run';
    this.popup('KEEP', this.qb.pos, '#9ad7ff');
  }

  /** Defenders key the handoff: front seven fast, defenders turned on receivers slower. A fooled read key is slower still. */
  private reactToRun(fooled: Player | null = null, handoff = false): void {
    // A handoff tells the defense no sooner than an under-center one would (`RUN_TELL` s after the snap): backers read the
    // line's blocks, not the exchange. Timed from the exchange, the pistol's early mesh (0.3 s) had them pursuing 0.3 s
    // sooner on the same run, and every pistol run trailed its under-center twin. A pitch shows at once.
    const from = handoff ? Math.max(this.time, this.snapTime + RUN_TELL) : this.time;
    for (const d of this.def) {
      const slow = 1 - d.r.prc / 100;
      const t = d.manTarget;
      let react: number;
      // Already on the run: a backer fitting it, or a front player past his read step (he's been playing the ball since).
      // A front player chasing the ball pursues from now, not from `RUN_TELL` (held to it, a free backside end chasing the
      // mesh coasted past the back); a backer fitting his gap still waits for the handoff's tell to leave it.
      const onIt = !!d.runJob && onFront(this, d) && this.time >= d.readAt;
      if (onIt || this.time >= d.fitAt) react = 0.05;
      else if (d.role === 'DL' || d.role === 'LB' || t === this.rb || d.assign?.kind === 'spy') react = 0.1 + slow * 0.25;
      else if (t && !t.isBlocker) react = 0.4 + slow * 0.4;
      else react = 0.3 + slow * 0.3;
      d.reactAt = (onIt ? this.time : from) + react * leanMul(d.lean.run) + (d === fooled ? KEY_FOOLED : 0);
    }
  }

  /** Play-action: the second level bites on the fake for a moment. */
  private sellFake(): void {
    this.faked = true;
    this.popup('FAKE', this.rb.pos, '#9ad7ff');
    for (const d of this.def) {
      if ((d.role !== 'LB' && d.role !== 'S') || this.passRead.has(d)) continue;
      const a = d.assign?.kind;
      const chance = (a === 'deep' ? PA_BITE.deep : a === 'robber' ? PA_BITE.robber : PA_BITE.base) - (d.r.prc - 70) * PA_BITE.prc + LEAN_FX.paBite * d.lean.run;
      this.paSeen++;
      if (this.rng() >= chance) continue;
      this.paBit.push(d.slot);
      d.fitAt = this.time;
      d.fitUntil = this.time + 0.35 + (1 - d.r.prc / 100) * 0.6 + LEAN_FX.biteLong * Math.max(0, d.lean.run);
    }
  }

  private fumble(at: Vec, sub: string): void {
    const spot = at.x;
    this.ball.pos = { x: at.x, y: at.y, z: 0 };
    this.ball.state = 'dead';
    this.carrier = null;
    if (spot <= OWN_GOAL) {
      this.end({ type: 'safety', spot, spotY: at.y, text: 'SAFETY', sub: 'Fumble in the end zone', color: '#ff5a5a' });
      return;
    }
    this.end({ type: 'fumble', spot, spotY: at.y, text: 'FUMBLE', sub: `${sub}. Offense recovers`, color: '#ff9a5a' });
  }

  /**
   * Only for show, after the play is over: the ball pops out of the tackled carrier and the nearest
   * defender on his feet goes and falls on it. A key-play replay uses it to show the sim's lost
   * fumble, which the play engine itself never produces. The outcome is already set, so nothing changes.
   */
  knockLoose(): void {
    const c = this.carrier;
    if (this.phase !== 'over' || !c || this.recoverer) return;
    const at = this.ball.pos;
    const up = this.def.filter((d) => !d.down && !d.engaged);
    this.recoverer = (up.length ? up : this.def).reduce((a, b) => (dist(b.pos, at) < dist(a.pos, at) ? b : a));
    this.carrier = null;
    this.ball.carrier = null;
    this.ball.state = 'bounce';
    const ang = this.rng() * Math.PI * 2;
    this.ball.vel = { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3, z: 4 };
    this.ball.pos = { ...at, z: Math.max(0.6, at.z) };
  }

  private updateRecovery(): void {
    const r = this.recoverer!;
    if (this.carrier === r || this.ball.pos.z > 0.8 || dist(r.pos, this.ball.pos) > 1) return;
    knockDown(r);
    this.carrier = r;
    this.ball.carrier = r;
    this.ball.state = 'held';
  }

  /** Current aim point while dragging, for the trajectory preview. */
  aimPoint(cam: Camera): Vec | null {
    return this.aim ? aimTarget(this.aim, this.qb.pos, cam, this.qb.r.arm, this.throwKind) : null;
  }

  /**
   * The CPU QB's throw type to `target` (replays, the harness; docs/PASSING.md): a deep shot is a LOB; a
   * window with a reading defender under the line is thrown over him (TOUCH, or LOB if he'd get TOUCH
   * too); a tight window short of `CPU_THROW.bulletMax` with a clean lane is a BULLET; the rest TOUCH.
   */
  cpuThrowKind(target: Vec): ThrowKind {
    const qb = this.qb.pos;
    const d = dist(qb, target);
    if (d > CPU_THROW.lobFrom) return 'lob';
    const under = (kind: ThrowKind) => {
      const { peak } = passParams(d, this.qb.r.arm, kind);
      return this.def.some((x) => {
        if (x.down || x.eyes <= 0 || dist(x.pos, target) < TIP.clear) return false;
        const s = clamp(((x.pos.x - qb.x) * (target.x - qb.x) + (x.pos.y - qb.y) * (target.y - qb.y)) / (d * d), 0, 1);
        const at = { x: lerp(qb.x, target.x, s), y: lerp(qb.y, target.y, s) };
        const z = lerp(2.0, 1.2, s) + 4 * peak * s * (1 - s);
        const unit = x.role === 'DL' ? 'DL' : x.role === 'LB' ? 'LB' : 'DB';
        return s > 0 && s < 1 && dist(x.pos, at) < TIP.width[unit] + 0.3 && z < TIP.reach[unit];
      });
    };
    if (under('bullet')) return under('touch') ? 'lob' : 'touch';
    const tight = this.def.some((x) => !x.down && dist(x.pos, target) < CPU_THROW.tight);
    // Short throws go on a line, open or not (the quick out, the slant): only a deeper open man gets touch.
    const short = target.x - this.los <= CPU_THROW.shortDepth;
    return (tight || short) && d < CPU_THROW.bulletMax ? 'bullet' : 'touch';
  }

  /**
   * Where the CPU QB throws to `p`, and with what: he picks the type for where `p` is (`cpuThrowKind`),
   * then leads him by that ball's flight time along `dir` (his velocity unless given) at `speed`.
   */
  cpuAim(p: Player, kind?: ThrowKind, dir?: Vec, speed?: number): { aim: Vec; kind: ThrowKind } {
    const v = dir ? scale(dir, speed ?? len(p.vel)) : p.vel;
    const ahead = (t: number) => add(p.pos, scale(v, t));
    const k = kind ?? this.cpuThrowKind(p.pos);
    // Led by the ball's real flight time to where he'll be (the flight is to the led spot, so solve for it):
    // with placement deciding the catch (sim/catching.ts `PLACEMENT`), an under-led ball is a reach.
    let t = passParams(dist(this.qb.pos, p.pos), this.qb.r.arm, k).dur;
    for (let i = 0; i < CPU_THROW.leadIters; i++) t = passParams(dist(this.qb.pos, ahead(t)), this.qb.r.arm, k).dur;
    const aim = ahead(t);
    return { aim: { x: Math.min(aim.x, 119), y: clamp(aim.y, 1.5, FIELD_W - 1.5) }, kind: k };
  }

  /**
   * The QB's pressure (a free rusher inside 4 yd) and movement, 0-1, for throw error and aim feel.
   * `aimed`: the user is pulling back, which slows him to a jog, so that jog (`MOVE_FULL`) is fully on
   * the move; otherwise (the CPU QB, the harness) movement is full at 6 yd/s.
   */
  passContext(aimed = false): { pressure: number; moving: number } {
    const qb = this.qb;
    let nearest = Infinity;
    for (const d of this.def) {
      if (!d.down && !d.engagedBy.length) nearest = Math.min(nearest, dist(d.pos, qb.pos));
    }
    return { pressure: clamp((4 - nearest) / 4, 0, 1), moving: clamp(len(qb.vel) / (aimed ? MOVE_FULL : 6), 0, 1) };
  }

  /** Throw to `target` (the user's aim, or the CPU's on a replay) with the given throw type; `aimed` for the user's (`passContext`). */
  /**
   * The defense reads the throw it expects (game/habits.ts): the look, the clock, and the QB out of the
   * pocket to a side. Then who answers it this step, and the end who plays contain on a rollout being chased.
   */
  private readThrow(): void {
    const strong = (this.resolved.strongSign >= 0 ? 1 : -1) as 1 | -1;
    const roll = rollOf(this.qb.pos.y, this.ballY, strong);
    if (roll !== 0 && this.rolledAt === null) this.rolledAt = this.time;
    const holding = this.carrier === this.qb && !this.thrown && !this.scramble;
    this.expect = holding ? expectThrow(this.habits, { look: this.look, t: this.time - this.snapTime, roll, los: this.los, ballY: this.ballY, strong }) : null;
    this.antic = anticRoles(this, ANTIC);
    const rank = { lane: 1, plus: 2, jump: 3 } as const;
    for (const [d, a] of this.antic) {
      const was = this.anticLog.get(d);
      if (!was || rank[a.role] > rank[was]) this.anticLog.set(d, a.role);
    }
    this.rollContain = null;
    if ([...this.antic.values()].some((a) => a.role === 'plus')) {
      const side = Math.sign(this.qb.pos.y - this.ballY);
      let w = -1;
      for (const d of this.def) {
        const off = (d.start.y - this.ballY) * side;
        if (d.role === 'DL' && d.assign?.kind === 'rush' && !d.down && off > w) {
          w = off;
          this.rollContain = d;
        }
      }
    }
  }

  /**
   * This snap's throw as the defense remembers it (game/habits.ts), once the play is over: null with no
   * throw. `gain` is the play's yards.
   */
  throwRecord(gain: number): Omit<ThrowSeen, 'w'> | null {
    if (!this.thrown || !this.releasedAt || !this.ballTarget || this.pitch) return null;
    const strong = this.resolved.strongSign >= 0 ? 1 : -1;
    const o = this.outcome;
    const caught = !!o && o.type !== 'incomplete' && o.type !== 'int' && o.type !== 'pick6';
    const tgt = this.intended;
    return {
      look: this.look, roll: this.releasedAt.roll, t: this.releasedAt.t, kind: this.thrownKind, slot: tgt?.slot ?? '?',
      ...(tgt?.routeName ? { route: tgt.routeName } : {}),
      dx: Math.round((this.ballTarget.x - this.los) * 10) / 10, dy: Math.round((this.ballTarget.y - this.ballY) * strong * 10) / 10,
      gain, caught, ...(this.nearCatch ? { beaten: this.nearCatch.slot as DefSlot } : {}),
    };
  }

  throwBall(target: Vec, kind: ThrowKind = this.throwKind, aimed = false): void {
    const qb = this.qb;
    const rng = this.rng;
    this.releasedAt = { t: this.time - this.snapTime, roll: rollOf(qb.pos.y, this.ballY, (this.resolved.strongSign >= 0 ? 1 : -1) as 1 | -1) };
    const { pressure, moving } = this.passContext(aimed);
    const sd = throwErrorSd(dist(qb.pos, target), qb.r, pressure, moving, kind);
    const to = { x: target.x + gauss(rng) * sd, y: target.y + gauss(rng) * sd * 0.8, z: 1.2 };
    const from = { x: qb.pos.x + qb.facing * 0.3, y: qb.pos.y, z: 2.0 };
    const { dur, peak } = passParams(dist(from, to), qb.r.arm, kind);
    launch(this.ball, from, to, dur, peak);
    this.thrownKind = kind;

    this.ballTarget = { x: to.x, y: to.y };
    this.carrier = null;
    this.controlled = null;
    this.thrown = true;
    this.phase = 'air';
    setPose(qb, 'throwEnd', 0.35);
    // He follows through toward his throw (display only: the release point is set above).
    qb.facing = to.x < qb.pos.x - 0.5 ? -1 : 1;

    let best: Player | null = null;
    let bd = 15;
    // The ball's for whoever's headed there: nearest to it where he'll be when it comes down, on his way.
    for (const o of this.off) {
      if (!isEligible(o) || o.down) continue;
      const dd = Math.min(dist(o.pos, this.ballTarget), dist(add(o.pos, scale(o.vel, dur)), this.ballTarget));
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    this.intended = best;
    // Receivers find the ball soon with their heads around, late with them still downfield.
    for (const o of this.off) o.findAt = isEligible(o) && !o.down ? receiverFind(o, this.time) : Infinity;

    // Defenders facing the QB break on the throw; trailing man defenders only find the ball late
    // in its flight (FIND.trail of it), and the ones in between, in between.
    for (const d of this.def) {
      d.reactAt = Infinity;
      d.findAt = Infinity;
      if (d.down) continue;
      const isMan = !!best && d.manTarget === best;
      // He breaks on any ball he can get to while it's in the air (a deep safety on the deep ball), not
      // just one landing near him.
      const reach = Math.max(BREAK_ON.near, maxSpeed(d) * dur + BREAK_ON.slack);
      if (dist(d.pos, this.ballTarget) < reach || isMan) {
        const cov = d.assign?.kind === 'man' ? d.r.mcv : d.r.zcv;
        // Sitting on screens jumps a throw behind the line and is late to one downfield; leaning deep, the
        // reverse; not worried about the deep ball, he squats on the ones in between.
        const air = this.ballTarget.x - this.los;
        const lean =
          air < LEAN_FX.shortAir ? leanMul(d.lean.screen)
          : air > LEAN_FX.deepAir ? leanMul(d.lean.deep) * (1 + LEAN_FX.late * Math.max(0, d.lean.screen, d.lean.run))
          : leanMul(-d.lean.deep) * (best ? leanMul(breaksInside(best.start.y, this.ballY, this.ballTarget.y) ? d.lean.inside : -d.lean.inside) : 1);
        // The keyed receiver: everyone's on a ball to him (but his tight man is beaten deep); a beat slow to the rest.
        const k = this.keyed;
        const key = !k ? 1 : best !== k ? 1 + KEY.others : air > LEAN_FX.deepAir && d.manTarget === k ? 1 + KEY.deep : 1 - KEY.react;
        // Sitting on the throw he expected: on it if that's the throw, a step wrong if it isn't.
        const an = this.antic.get(d);
        const e = this.expect;
        const on = an && an.role !== 'plus' && e && best?.slot === e.slot && dist(this.ballTarget, e.spot) < ANTIC.near;
        const guess = !an || an.role === 'plus' ? 1 : on ? 1 - ANTIC.react * an.s : 1 + ANTIC.wrong * an.s;
        const react = (0.5 - (cov / 100) * 0.35 + rng() * 0.1) * lean * key * guess;
        d.reactAt = this.time + lerp(Math.max(react, dur * FIND.trail, dur - FIND.trailLeft), react + 0.1, d.eyes);
        d.findAt = d.reactAt;
      }
    }
  }

  /**
   * The catch state (sim/player.ts `CATCH`) by how the ball was placed: in stride, his hips already go his
   * way and he skips most of the ramp; squared up to the QB (a settle route) or coming back to the ball,
   * his hips face the QB; a reach twists them back toward the ball and costs most of his speed.
   */
  private startCatchState(p: Player, grade: CatchGrade, behind: number): void {
    const v = len(p.vel);
    const dir = v > 0.5 ? scale(p.vel, 1 / v) : { x: 1, y: 0 };
    const toQb = norm(sub(this.ball.from, p.pos));
    if (grade === 'stride') {
      startCatch(p, dir, PLACEMENT.strideRamp);
      return;
    }
    if (grade === 'reach') {
      p.vel = scale(p.vel, PLACEMENT.reachKeep);
      const twist = behind > 0.3 ? PLACEMENT.reachTwistBehind : PLACEMENT.reachTwist;
      startCatch(p, add(scale(dir, 1 - twist), scale(toQb, twist)));
      return;
    }
    const squared = this.catchSet > 0.3 || v < 1 || dir.x * toQb.x + dir.y * toQb.y > 0.3;
    startCatch(p, squared ? toQb : dir);
  }

  /** Caught laid out: down where he lands (the college rule), or a touchdown if that's in the end zone. */
  private divingCatch(p: Player, land: Vec): void {
    p.pos = { x: land.x, y: land.y };
    knockDown(p);
    this.popup('DIVING CATCH!', p.pos, '#ffd23f');
    if (land.x >= OPP_GOAL) {
      this.end({ type: 'td', spot: OPP_GOAL, spotY: land.y, text: 'TOUCHDOWN!', sub: `#${p.num} ${p.name}, diving`, color: '#ffd23f' });
      return;
    }
    const yards = land.x - this.los;
    this.end({ type: 'tackle', spot: land.x, spotY: land.y, text: yardsText(yards), sub: `Diving catch by #${p.num} ${p.name}`, color: yards >= 0 ? '#ffffff' : '#ff9a5a' });
  }

  private resolveArrival(): void {
    const land = this.ballTarget!;
    let nd = Infinity;
    for (const d of this.def) {
      const dd = dist(d.pos, land);
      if (!d.down && dd < nd) {
        nd = dd;
        this.nearCatch = d;
      }
    }
    if (this.pitch) {
      const rb = this.rb;
      if (!rb.down && this.rng() < pitchOdds(Math.max(0, 1 - dist(rb.pos, land) / PITCH_REACH), rb.r.cth)) {
        this.giveBall(rb);
        this.controlled = rb;
        this.phase = 'run';
        setPose(rb, 'catch', 0.15);
      } else {
        this.fumble(land, 'Pitch on the ground');
      }
      return;
    }
    const oob = land.y < 0 || land.y > FIELD_W || land.x > FIELD_LEN || land.x < 0;
    let bestO: Player | null = null;
    let bestD: Player | null = null;
    let so = 0;
    let sd = 0;
    // Every defender in reach contests it (sim/catching.ts `CROWD`), the best one first.
    const defs: { p: Player; s: number }[] = [];
    for (const p of this.players) {
      if (p.down || p.engaged || p.engagedBy.length) continue;
      const reach = this.passTipped ? 1 : THROWS[this.thrownKind].reach;
      // A diving receiver has his full length to reach with (sim/catching.ts `PLACEMENT`).
      const s = p.diving ? Math.max(0, 1 - dist(p.pos, land) / (CATCH_REACH * reach + PLACEMENT.diveReach)) : reachScore(dist(p.pos, land), reach);
      if (s <= 0) continue;
      if (isEligible(p) && s > so) {
        so = s;
        bestO = p;
      } else if (p.side === 'def') {
        defs.push({ p, s });
        if (s > sd) {
          sd = s;
          bestD = p;
        }
      }
    }
    this.catchSet = bestO ? facingQB(bestO, this.qb, this.time) : 0;
    this.catchReady = bestO ? readyAt(bestO, this.time) : 1;
    // A bullet on a short throw comes in hot (a tipped ball has none of that left).
    const hot = this.passTipped ? 0 : hotness(this.thrownKind, dist(this.ball.from, this.ball.to), this.qb.r.arm);
    // How the ball was placed for him: in stride, a reach, a dive (`PLACEMENT`). A tipped ball is a scramble for it.
    const graded = bestO && !this.passTipped ? catchGrade(bestO === this.intended ? bestO.track : null, land, so, len(bestO.vel), bestO.diving) : null;
    const grade = graded?.grade ?? 'clean';
    const lunge = grade === 'dive' ? 1 : grade === 'reach' ? PLACEMENT.reachLunge : 0;
    const res = oob
      ? 'miss'
      : resolveCatch(
          bestO ? { pos: so, cth: bestO.r.cth, cit: bestO.r.cit, set: this.catchSet, ready: this.catchReady, hot, lunge } : null,
          defs.map(({ p, s }) => ({ pos: s, cth: p.r.cth, prc: p.r.prc, ready: readyAt(p, this.time) })),
          this.rng,
          this.passTipped ? 0 : THROWS[this.thrownKind].jump,
        );

    if (res === 'catch' && bestO) {
      this.caught = true;
      this.giveBall(bestO);
      this.controlled = bestO;
      this.phase = 'run';
      if (grade === 'dive') {
        this.divingCatch(bestO, land);
        return;
      }
      setPose(bestO, grade === 'reach' ? 'reach' : 'catch', grade === 'reach' ? 0.4 : 0.25);
      if (!this.passTipped) startGather(bestO, THROWS[this.thrownKind].gather);
      this.startCatchState(bestO, grade, graded?.behind ?? 0);
      for (const d of this.def) {
        const onIt = this.time >= d.reactAt && dist(d.pos, land) < CATCH_PURSUIT.near;
        d.reactAt = this.time + (onIt ? CATCH_PURSUIT.react : 0.12 + (1 - d.r.prc / 100) * 0.35);
      }
      if (grade === 'reach') this.popup('FINGERTIPS!', bestO.pos, '#9ad8ff');
      else if (grade === 'stride' && len(bestO.vel) > PLACEMENT.strideSpeed + 1) this.popup('IN STRIDE!', bestO.pos, '#7dff7d');
      else this.popup('CATCH!', bestO.pos, '#ffffff');
      return;
    }
    if (res === 'int' && bestD) {
      this.giveBall(bestD);
      this.phase = 'run';
      setPose(bestD, 'catch', 0.25);
      for (const d of this.def) this.release(d);
      for (const o of this.off) o.reactAt = this.time + 0.3 + this.rng() * 0.2;
      this.popup('PICKED OFF!', bestD.pos, '#ff5a5a');
      return;
    }

    let sub = this.passTipped && this.tipper ? `Tipped by #${this.tipper.num} ${this.tipper.name}` : 'Nobody home';
    if (oob) sub = 'Out of bounds';
    else if (res === 'pbu' && bestD) {
      setPose(bestD, 'catch', 0.4);
      sub = `Broken up by #${bestD.num} ${bestD.name}`;
    } else if (res === 'drop' && bestO) {
      setPose(bestO, 'catch', 0.3);
      sub = `Dropped by #${bestO.num} ${bestO.name}`;
    }
    // A diver who didn't come up with it ends up on the turf all the same.
    for (const p of this.off) if (p.diving) knockDown(p, 0.9);
    startBounce(this.ball);
    this.end({ type: 'incomplete', spot: this.los, spotY: this.ballY, text: 'INCOMPLETE', sub, color: '#ffffff' });
  }

  // ------------------------------------------------------------ user control

  private userControl(input: Input, dt: number): void {
    const c = this.controlled!;
    if (c.down) return;
    let ax = input.axis();
    const pocket = this.phase === 'live' && c === this.qb;
    if (ax.x || ax.y) c.manual = true;
    if (pocket && !c.manual) {
      // Nobody steering: his drop, and a step up once the edge is ridden past (sim/passPro.ts `POCKET`).
      const { spot, climbed } = pocketSpot(this, this.climbed);
      this.climbed = climbed;
      c.want = seek(c, spot, maxSpeed(c) * 0.8, 0.8);
      return;
    }
    // Space with W or S held: a back's hard cut up or down the screen on a called run (once a play).
    if (this.canCut(c) && ax.y && input.hit('Space')) startJuke(c, Math.sign(ax.y));
    // At the line a runner (not a receiver after the catch) can wait for a hole or slide along it;
    // after that he keeps running downfield unless told otherwise.
    const atLine = this.phase === 'run' && c === this.carrier && !this.thrown && c.pos.x < this.los + RUN_CTRL.zone;
    let patient = false;
    if (this.phase === 'run' && ax.x === 0) {
      if (atLine && ax.y === 0) patient = true;
      else ax = { x: atLine ? RUN_CTRL.slideX : 1, y: ax.y };
    }

    const moving = ax.x !== 0 || ax.y !== 0;
    const sprint = moving && input.isDown('ShiftLeft', 'ShiftRight') && c.stamina > 0.02;
    const e = endurance(c);
    const drain = 1 / lerp(SPRINT_TIME.min, SPRINT_TIME.max, e * e);
    const recover = lerp(SPRINT_RECOVER.min, SPRINT_RECOVER.max, e);
    c.stamina = sprint ? Math.max(0, c.stamina - dt * drain) : Math.min(1, c.stamina + dt * recover);
    if (c.juke > 0) {
      c.want = c.jukeVel;
      return;
    }
    if (patient) {
      const heading = len(c.vel) > 0.5 ? norm(c.vel) : { x: 1, y: 0 };
      c.want = scale(heading, maxSpeed(c) * RUN_CTRL.patience);
      return;
    }
    const sp = maxSpeed(c) * (sprint ? 1 : JOG_SPEED) * (this.aim ? 0.6 : 1);
    c.want = scale(norm(ax), sp);
  }

  // ------------------------------------------------------------ blocking

  private formEngagements(): void {
    if (this.phase === 'presnap' || this.phase === 'over') return;
    const downfield = this.phase === 'run' && this.carrier?.side === 'off';
    for (const b of this.off) {
      // Pullers don't stop to block on the way, except on the man they're pulling for.
      if (b.down || b.engaged || b.stun > 0 || b === this.carrier || b.role === 'QB' || (b.pull && !b.poa) || this.idle.has(b)) continue;
      if (!b.isBlocker && !downfield) continue;
      for (const d of this.def) {
        if (d.down || d === this.carrier || d.noEngage > 0 || d.engagedBy.length >= 2) continue;
        // Away from the ball only a blocker's own run-block assignment is worth locking onto (a WR on his DB).
        if (downfield && dist(d.pos, this.carrier!.pos) > 10 && !(b.mark === d && this.runBlocking())) continue;
        // Left unblocked on purpose; after the mesh too for a puller or lead, who goes on to his man (the scrape on a give).
        if (d === this.readKey && (!downfield || b.poaJob)) continue;
        if (b.pull && d !== b.poa) continue;
        // Blockers with an assignment (a puller or lead back on his way: his point-of-attack man) work to
        // their man rather than grabbing whoever they bump into. On runs too, as long as their man is
        // still close enough to matter.
        const man = b.mark ?? (b.poaJob ? b.poa : null);
        if (d.engagedBy.length === 1 && man !== d) continue;
        // A lineman headed for a backer still takes a free down lineman who crosses his face (bodies: the
        // backside tackle slanting across a climbing guard is picked up, not run through).
        const pickup =
          this.runBlocking() && b.role === 'OL' && d.role === 'DL' && !d.engagedBy.length && !!man && man.role !== 'DL' &&
          dist(b.pos, d.pos) < RUN_PICKUP && (b.start.y - this.hole.y) * playSide(this) < 0;
        if (b.isBlocker && man && !man.down && man !== d && !pickup && (!downfield || dist(b.pos, man.pos) < 4)) continue;
        // Someone else's point-of-attack man, with that blocker closing on him (a kick-out, a lead): leave him to
        // him. A slot crossing for his backer grabbed the end the guard was pulling to kick, then lost him.
        if (man !== d && this.runBlocking() && this.off.some((o) => o !== b && o.poaJob && o.poa === d && !o.down && !o.engaged && dist(o.pos, d.pos) < POA_CLAIM)) continue;
        const reach = man === d && this.runBlocking() ? RUN_ENGAGE : man === d && inPocket(this) ? PROT.engage : 1.0;
        if (dist(b.pos, d.pos) < reach) {
          // Off the ball on a run: a one-gap lineman who beats his man slips into his gap (sim/runBlocking.ts).
          if (!d.engagedBy.length && this.runBlocking() && d.role === 'DL' && !this.slipped.has(d)) {
            this.slipped.add(d);
            if (getOffWins(this, d, b)) {
              d.noEngage = 0.7;
              b.stun = 0.25;
              this.gotOff.add(d);
              continue;
            }
          }
          if (b.pull) b.pull = null;
          if (!b.mark && b.poaJob) b.mark = d;
          if (!d.engagedBy.length && inPocket(this)) startRep(this, d);
          if (!d.engagedBy.length && this.runBlocking()) {
            // A new run block: note which side the blocker has him from, and roll how it goes.
            d.blockDir = norm(sub(b.pos, d.pos));
            d.blockRoll = gauss(this.rng) * BLOCK_ROLL_SD;
            d.blockControl = 1;
          }
          b.engaged = d;
          d.engagedBy.push(b);
          this.wasBlocked.add(d);
          // A double team's helper gets a hand on him before he climbs (`CLIMB.touch`).
          if (b.climb && this.runBlocking()) b.comboUntil = Math.max(b.comboUntil, this.time + CLIMB.touch);
          break;
        }
      }
    }
  }

  /** Free defenders work around the line's bodies on a designed run, not through them (`BODY`). */
  private bodies(): void {
    if (this.playDef.block !== 'run' || this.thrown || this.phase === 'presnap' || this.phase === 'over') return;
    const c = this.carrier;
    const walls = [
      // A blocker standing down for an ablation isn't there at all: the ablation measures his whole block.
      ...this.off.filter((o) => o.isBlocker && o.role !== 'QB' && o !== c && !o.down && !this.idle.has(o)),
      ...this.def.filter((d) => d.engagedBy.length && !d.down),
    ];
    for (const d of this.def) {
      if (d.down || d.engagedBy.length || this.slipped.has(d) || Math.abs(d.pos.x - this.los) > BODY.band) continue;
      if (c && c.side === 'off' && dist(d.pos, c.pos) < BODY.r + 0.4) continue; // he's on the ball
      for (const w of walls) {
        if (w === d) continue;
        const gap = sub(d.pos, w.pos);
        const g = len(gap);
        if (g >= BODY.r || g < 1e-6) continue;
        const n = scale(gap, 1 / g);
        d.pos = add(w.pos, scale(n, BODY.r));
        const into = d.vel.x * n.x + d.vel.y * n.y;
        if (into < 0) d.vel = sub(d.vel, scale(n, into));
        const cap = BODY.keep * maxSpeed(d);
        if (len(d.vel) > cap) d.vel = scale(norm(d.vel), cap);
      }
    }
  }

  /** The ball carrier can't run through a blocked pair in front of him (`PILE`): he moves with the pile. */
  private pile(): void {
    const c = this.carrier;
    if (!c || c.side !== 'off' || this.phase !== 'run' || !this.runBlocking() || c.juke > 0) return;
    const cap = pileCap(this, c);
    if (cap !== null && c.want.x > cap) c.want = { x: cap, y: c.want.y };
  }

  /** Contact (`CONTACT`) applies to the carrier of a designed run: the handoff, the keep, a designed QB run. */
  private contactRun(c: Player): boolean {
    return c.side === 'off' && c === this.carrier && this.phase === 'run' && !this.thrown && (this.handedOff || this.kept || !!this.playDef.qbRun);
  }

  /** A wrapped carrier drags his tackler forward at `dragSpeed`; at the end of it he goes down or spins out (`CONTACT`). */
  private drag(dt: number): void {
    const c = this.carrier;
    if (!c || c.wrap <= 0) return;
    const t = c.wrapBy;
    if (c.down || !t || t.down) {
      c.wrap = 0;
      c.wrapBy = null;
      return;
    }
    const v = dragSpeed(c.r.str, t.r.str);
    c.want = { x: Math.min(c.want.x, v), y: clamp(c.want.y, -0.5 * v, 0.5 * v) };
    if (c.vel.x > v) c.vel = { x: v, y: c.vel.y * 0.5 };
    t.want = c.vel;
    t.pos = { x: lerp(t.pos.x, c.pos.x + 0.45, 0.3), y: lerp(t.pos.y, c.pos.y, 0.3) };
    c.wrap -= dt;
    if (c.wrap > 0) return;
    c.wrapBy = null;
    if (this.rng() < (CONTACT.hold * tackleChance(t.r.tkl, c.r.elu, c.r.str)) / TACKLE_GAP.base) {
      this.tackled(c, t);
      return;
    }
    knockDown(t, 0.9);
    t.tackleCd = 1.6;
    c.vel = scale(c.vel, CONTACT.out);
    this.popup('SPUN OUT!', c.pos, '#ffd23f');
  }

  /** Only a back carrying on a called run can cut. */
  canCut(c: Player): boolean {
    return c === this.carrier && c.role === 'RB' && this.phase === 'run' && this.playDef.kind === 'run';
  }

  /** A cut stops short against anyone in its path: he can't dash through bodies (a collision, so it sets his velocity). */
  private blockCut(): void {
    const c = this.carrier;
    if (!c || c.juke <= 0) return;
    const dir = Math.sign(c.jukeVel.y);
    for (const p of this.players) {
      if (p === c || p.down) continue;
      const ahead = (p.pos.y - c.pos.y) * dir;
      if (ahead > 0 && ahead < JUKE.bump && Math.abs(p.pos.x - c.pos.x) < JUKE.bump * 0.8) {
        c.juke = 0;
        c.vel = { x: c.vel.x, y: c.vel.y * JUKE.exit };
        return;
      }
    }
  }

  private release(d: Player): void {
    for (const b of d.engagedBy) b.engaged = null;
    d.engagedBy = [];
    d.blockDir = null;
  }

  private updateEngagements(dt: number): void {
    for (const d of this.def) {
      if (!d.engagedBy.length) continue;
      d.engagedBy = d.engagedBy.filter((b) => !b.down && b.engaged === d);
      if (!d.engagedBy.length || d.down) {
        this.release(d);
        continue;
      }
      if (this.runBlocking()) {
        if (this.rng() < runEngagement(this, d) * dt) this.shed(d);
        continue;
      }
      // In the pocket a block is a rep that wears down (sim/passPro.ts `REP`).
      if (inPocket(this)) {
        if (passEngagement(this, d, dt)) this.shed(d);
        continue;
      }
      const n = d.engagedBy.length;
      const dir = norm(sub(d.goal ?? this.qb.pos, d.pos));
      const blk = d.engagedBy.reduce((s, b) => s + passBlockValue(b.r), 0) / n;
      const power = d.r.rsh * 0.7 + d.r.spd * 0.3 - blk - (n - 1) * 15;
      d.blockPower = power;
      const push = clamp(0.8 + power * 0.06, -0.8, 2.2);
      d.want = scale(dir, push);
      for (const b of d.engagedBy) b.want = scale(dir, push);
      // Blocks hold early and break down the longer the QB holds the ball.
      const ramp = Math.min(1, (this.time - this.snapTime) / 2.5) ** 2;
      let shedRate = (clamp(0.22 + power * 0.012, 0.05, 0.7) * ramp) / Math.pow(n, 1.5);
      // Once the ball is gone, blocks away from it dissolve as the defender peels off to pursue.
      if (this.thrown && dist(d.pos, d.goal ?? this.qb.pos) > 6) shedRate = 2.5;
      // Runs: the far side of the play peels off to pursue; the defender at the point of attack fights to make the tackle.
      const c = this.carrier;
      if (c && c.side === 'off' && (this.phase === 'run' || this.scramble)) {
        const dc = dist(d.pos, c.pos);
        if (dc > 8) shedRate = 2.5;
        else if (dc < 2.2) shedRate = Math.max(shedRate, clamp(2.2 + power * 0.05, 0.8, 5));
      }
      if (this.rng() < shedRate * dt) this.shed(d);
    }
  }

  /** The harness's ablation: the named blockers stand down (`PlaySetup.ablate`). */
  private applyAblation(): void {
    const a = this.ablate;
    if (!a) return;
    const side = playSide(this);
    const line = this.off.filter((o) => o.role === 'OL' && !o.pull).sort((x, y) => (x.pos.y - y.pos.y) * side);
    for (const o of line.slice(0, a.backside ?? 0)) this.idle.add(o);
    for (const o of this.off) if (a.slots?.includes(o.slot as OffSlot)) this.idle.add(o);
    for (const o of this.idle) {
      o.mark = null;
      o.climb = null;
      o.hinge = null;
      o.poa = null;
      o.poaJob = null;
    }
  }

  private shed(d: Player): void {
    this.gotOff.add(d);
    for (const b of d.engagedBy) b.stun = 0.35;
    this.release(d);
    d.noEngage = 1.3;
  }

  /** Keep each blocker locked between its defender and the defender's goal. */
  private anchorBlockers(): void {
    for (const d of this.def) {
      const n = d.engagedBy.length;
      if (!n) continue;
      const dir = this.runBlocking() && d.blockDir ? d.blockDir : norm(sub(d.goal ?? this.qb.pos, d.pos));
      d.engagedBy.forEach((b, i) => {
        const off = n === 1 ? 0 : i === 0 ? -0.45 : 0.45;
        const ax = d.pos.x + dir.x * 0.85 - dir.y * off;
        const ay = d.pos.y + dir.y * 0.85 + dir.x * off;
        b.pos = { x: lerp(b.pos.x, ax, 0.35), y: lerp(b.pos.y, ay, 0.35) };
        b.facing = d.pos.x >= b.pos.x ? 1 : -1;
      });
      d.facing = d.engagedBy[0].pos.x >= d.pos.x ? 1 : -1;
    }
  }

  // ------------------------------------------------------------ tackles & bounds

  private checkTackles(): void {
    const c = this.carrier;
    if (!c || c.down) return;
    const tacklers = c.side === 'off' ? this.def : this.off;
    for (const t of tacklers) {
      if (t.down || t.tackleCd > 0 || t.engaged || t.role === 'QB') continue;
      const arm = t.engagedBy.length > 0;
      const d = dist(t.pos, c.pos);
      if (!arm && d > TACKLE_RANGE && d <= DIVE_TACKLE.range && this.diveAt(t, c, d)) return;
      if (d > (!arm ? TACKLE_RANGE : this.runBlocking() ? RUN_CONTROL.armReach : TACKLE_RANGE * 0.8)) continue;
      // A run-blocked defender's reach depends on how much of the block he's won (`armOdds`); pass pro's is flat.
      const armOdds = arm ? (this.runBlocking() ? runArmOdds(t) : ARM_TACKLE) * (levered(t, c.pos) ? ARM_LEVERED : 1) : 1;
      // Caught mid-cut by a man in front of him (or level): he bit on it.
      const juked = !arm && c.juke > 0 && (t.pos.x - c.pos.x) * (c.side === 'off' ? 1 : -1) > -0.5;
      // A receiver still turning out of his catch (`hips`) is the easiest man to wrap up: he misses less often.
      const base = tackleChance(t.r.tkl, c.r.elu, c.r.str);
      const odds = !arm && c.hips ? 1 - (1 - base) * AT_CATCH.miss : base;
      // Wrapped up: anyone else who gets to him finishes it (`CONTACT.finish`).
      if (c.wrap > 0 && t !== c.wrapBy) {
        if (this.rng() < CONTACT.finish * armOdds) {
          this.tackled(c, t);
          return;
        }
        continue;
      }
      if (this.rng() < odds * armOdds * (juked ? jukeTackleMul(c.r.elu) : 1)) {
        this.tackled(c, t);
        return;
      }
      if (arm) {
        t.tackleCd = 1.0; // slipped the arm tackle; the blocker still has him
        continue;
      }
      if (juked) {
        // He whiffs and stumbles past, and the carrier keeps his legs.
        knockDown(t, 0.6);
        t.tackleCd = 1.6;
        c.juke = 0;
        this.popup('MADE HIM MISS!', c.pos, '#7dff7d');
        continue;
      }
      // On a designed run most misses are a piece of him, not a clean escape: he's wrapped and dragging (`CONTACT`).
      if (this.contactRun(c) && c.wrap <= 0 && this.rng() >= breakChance(t.r.tkl, c.r.elu, c.r.str)) {
        c.wrap = CONTACT.time;
        c.wrapBy = t;
        t.tackleCd = CONTACT.time + 0.3;
        continue;
      }
      knockDown(t, 0.9);
      t.tackleCd = 1.6;
      c.vel = scale(c.vel, 0.55);
      this.popup('BROKEN TACKLE!', c.pos, '#ffd23f');
    }
  }

  /**
   * A chase he isn't winning: a free defender just out of reach and not gaining on the carrier (closing
   * slower than `DIVE_TACKLE.closing`) lays out for his legs, once. He brings him down at `odds` of a
   * normal tackle; a miss leaves him on the ground. True when the carrier went down.
   */
  private diveAt(t: Player, c: Player, d: number): boolean {
    // Only a chase in the open field: past the line, from behind or level. In the box it's a tackle or nothing.
    if (c.side !== 'off' || this.phase !== 'run' || c.pos.x < this.los + DIVE_TACKLE.past || t.pos.x > c.pos.x + 0.3) return false;
    const ux = (c.pos.x - t.pos.x) / d;
    const uy = (c.pos.y - t.pos.y) / d;
    const closing = (t.vel.x - c.vel.x) * ux + (t.vel.y - c.vel.y) * uy;
    if (closing >= DIVE_TACKLE.closing) return false;
    if (this.rng() < tackleChance(t.r.tkl, c.r.elu, c.r.str) * DIVE_TACKLE.odds) {
      this.tackled(c, t);
      return true;
    }
    knockDown(t, DIVE_TACKLE.down);
    t.tackleCd = DIVE_TACKLE.down + 0.6;
    return false;
  }

  private tackled(c: Player, t: Player): void {
    c.wrap = 0;
    c.wrapBy = null;
    // Carriers going forward fall forward (yards after contact); returners and sacks don't.
    if (c.side === 'off') c.pos = { x: Math.min(c.pos.x + fallForward(c.vel.x, c.r.str, t.r.str), OPP_GOAL - 0.01), y: c.pos.y };
    knockDown(c);
    knockDown(t);
    this.tackler = t;
    const spot = c.pos.x;
    const spotY = c.pos.y;
    if (c.side === 'def') {
      const touchback = spot >= OPP_GOAL;
      this.end({
        type: 'int', spot: touchback ? OPP_GOAL - 25 : spot, spotY, text: 'INTERCEPTED',
        sub: touchback ? 'Touchback' : `Returned to the ${fieldLabel(spot)}`, color: '#ff5a5a',
      });
      return;
    }
    const yards = spot - this.los;
    if (spot <= OWN_GOAL) {
      this.end({ type: 'safety', spot, spotY, text: 'SAFETY', sub: `Tackled in the end zone`, color: '#ff5a5a' });
    } else if (c === this.qb && !this.thrown && this.playDef.block === 'pass' && spot < this.los) {
      this.end({ type: 'sack', spot, spotY, text: 'SACKED', sub: `#${t.num} ${t.name}  ${yardsText(yards)}`, color: '#ff5a5a' });
    } else {
      this.end({
        type: 'tackle', spot, spotY, text: yardsText(yards),
        sub: `Tackled by #${t.num} ${t.name}`, color: yards >= 0 ? '#ffffff' : '#ff9a5a',
      });
    }
  }

  private checkBounds(): void {
    const c = this.carrier;
    if (!c || c.down) return;
    const out = c.pos.y < 0 || c.pos.y > FIELD_W;
    if (c.side === 'off') {
      if (c.pos.x >= OPP_GOAL) {
        startCelebration(c);
        this.end({ type: 'td', spot: OPP_GOAL, spotY: c.pos.y, text: 'TOUCHDOWN!', sub: `#${c.num} ${c.name}`, color: '#ffd23f' });
      } else if (out || c.pos.x < 0) {
        const spot = c.pos.x;
        if (spot <= OWN_GOAL) this.end({ type: 'safety', spot, spotY: c.pos.y, text: 'SAFETY', sub: 'Out of the end zone', color: '#ff5a5a' });
        else this.end({ type: 'oob', spot, spotY: c.pos.y, text: yardsText(spot - this.los), sub: 'Out of bounds', color: '#ffffff' });
      }
    } else if (c.pos.x <= OWN_GOAL) {
      startCelebration(c);
      this.end({ type: 'pick6', spot: OWN_GOAL, spotY: c.pos.y, text: 'PICK SIX', sub: `#${c.num} ${c.name} takes it to the house`, color: '#ff5a5a' });
    } else if (out || c.pos.x > FIELD_LEN) {
      const touchback = c.pos.x >= OPP_GOAL;
      this.end({
        type: 'int', spot: touchback ? OPP_GOAL - 25 : c.pos.x, spotY: c.pos.y, text: 'INTERCEPTED',
        sub: touchback ? 'Touchback' : `Returned to the ${fieldLabel(c.pos.x)}`, color: '#ff5a5a',
      });
    }
  }

  private end(o: PlayOutcome): void {
    this.outcome = o;
    this.phase = 'over';
    this.overTime = 0;
    this.controlled = null;
    this.aim = null;
  }

  private popup(text: string, at: Vec, color: string): void {
    this.popups.push({ text, x: at.x, y: at.y, t: 0, color });
  }

  /**
   * Each player's eyes this step (`eyesOf`). Defenders reading the QB face him (a backpedal or a shuffle,
   * not the way they're moving) until they break on a throw; in flight, a receiver whose head comes
   * around finds the ball then.
   */
  private updateEyes(): void {
    const reading = this.phase === 'snap' || this.phase === 'live' || this.phase === 'air';
    for (const p of this.players) {
      p.eyes = eyesOf(this, p);
      if (!reading || p.down) continue;
      if (p.side === 'def') {
        const broke = this.phase === 'air' && this.time >= p.reactAt;
        if (!broke && p.eyes > 0.5 && !p.engagedBy.length && !this.scramble) p.facing = this.qb.pos.x < p.pos.x ? -1 : 1;
      } else if (this.phase === 'air' && p.eyes >= 1) {
        p.findAt = Math.min(p.findAt, this.time + FIND.base);
      }
    }
  }

  /**
   * A pass in flight (docs/PASSING.md): a defender with his eyes on the QB can get a hand on a ball that
   * passes within `TIP.width` of him below his reach, on the way to somebody else. A tip is a pick
   * (`TIP.pick`, with his hands) or a free ball popped up `TIP.pop` yards on. Linemen on their blocks
   * still bat balls at the line, `TIP.engaged` as often. Lobs sail over everyone.
   */
  /** Odds `d` gets a piece of a ball passing `at` yd from him at height `z` (`TIP`). */
  private tipOdds(d: Player, unit: 'DL' | 'LB' | 'DB', at: number, z: number): number {
    const reach = TIP.reach[unit];
    if (z > reach) return 0;
    const low = Math.min(1, (reach - z) / TIP.under);
    const block = d.engagedBy.length ? TIP.engaged : 1;
    if (at <= TIP.core) return TIP.hit * (z < TIP.body ? 1 : d.eyes * low) * block;
    if (d.eyes <= 0) return 0;
    const skill = (d.r.cth * 0.5 + d.r.prc * 0.5) / 100;
    const close = 1 - (at - TIP.core) / (TIP.width[unit] - TIP.core);
    return TIP.odds[unit] * d.eyes * (0.5 + close * 0.5) * low * (0.5 + skill * 0.5) * block;
  }

  private inFlight(): void {
    if (this.passTipped) return;
    const b = this.ball;
    const land = this.ballTarget!;
    if (dist(b.pos, land) < TIP.clear) return;
    for (const d of this.def) {
      if (d.down || d.stun > 0 || this.tipChecked.has(d) || dist(d.pos, land) < TIP.clear) continue;
      const unit = d.role === 'DL' ? 'DL' : d.role === 'LB' ? 'LB' : 'DB';
      const now = dist(d.pos, b.pos);
      const closest = this.tipNear.get(d);
      // Wait for the closest pass: roll once the ball starts away from him (or out of his lane).
      if (now <= TIP.width[unit] && (!closest || now < closest.d)) {
        this.tipNear.set(d, { d: now, z: b.pos.z });
        continue;
      }
      if (!closest) continue;
      this.tipChecked.add(d);
      if (this.rng() >= this.tipOdds(d, unit, closest.d, closest.z)) continue;
      const square = closest.d <= TIP.core;
      this.passTipped = true;
      this.tipper = d;
      if (!d.engagedBy.length && this.rng() < TIP.pick * d.r.cth / 100) {
        this.giveBall(d);
        this.phase = 'run';
        setPose(d, 'catch', 0.25);
        for (const x of this.def) this.release(x);
        for (const o of this.off) o.reactAt = this.time + 0.3 + this.rng() * 0.2;
        this.popup('PICKED OFF!', d.pos, '#ff5a5a');
        return;
      }
      // Popped up: everyone near it goes for the free ball.
      setPose(d, 'catch', 0.3);
      // Off his fingertips it carries on toward the target; square into him it dies where he is.
      const dir = norm(sub(land, { x: b.pos.x, y: b.pos.y }));
      const carry = (square ? TIP.pop.dead : TIP.pop.dist) * (0.4 + this.rng());
      const spot = { x: b.pos.x + dir.x * carry, y: b.pos.y + dir.y * carry + gauss(this.rng) * (square ? 0.6 : 1) };
      launch(this.ball, { ...b.pos }, { x: spot.x, y: spot.y, z: 1.0 }, TIP.pop.dur, TIP.pop.peak);
      this.ballTarget = spot;
      let near: Player | null = null;
      for (const o of this.off) if (isEligible(o) && !o.down && (!near || dist(o.pos, spot) < dist(near.pos, spot))) near = o;
      this.intended = near && dist(near.pos, spot) < 8 ? near : null;
      for (const p of this.players) {
        p.findAt = this.time + TIP.find;
        if (p.side === 'def') p.reactAt = dist(p.pos, spot) < 8 && p !== d ? this.time + TIP.find : Infinity;
      }
      this.popup('TIPPED!', d.pos, '#ffd34d');
      return;
    }
  }

  ballTimeLeft(): number {
    return Math.max(0, this.ball.dur - this.ball.t);
  }

  /** World x the camera should track this frame. */
  focusX(): number {
    switch (this.phase) {
      case 'presnap':
      case 'snap':
      case 'live':
        return this.scramble ? this.qb.pos.x : Math.min(this.qb.pos.x + 3, this.los);
      case 'air':
        return this.ball.pos.x;
      default:
        return this.carrier ? this.carrier.pos.x : this.ball.pos.x;
    }
  }
}

/**
 * Where a front other than `even` lines up its line and backers (`bear`, `goal`, `wide`). The
 * goal-line front also brings the base backer (in the NB slot) down on the strong edge.
 */
function frontSet(front: Front, los: number, by: number, strong: number): Partial<Record<DefSlot, Vec>> {
  switch (front) {
    case 'bear':
      return {
        DE1: { x: los + 1.0, y: by - 3.2 }, DT1: { x: los + 0.9, y: by - 0.9 }, DT2: { x: los + 0.9, y: by + 0.9 },
        DE2: { x: los + 1.0, y: by + 3.2 }, WLB: { x: los + 3.2, y: by - 2.2 }, MLB: { x: los + 3.2, y: by + 2.2 },
      };
    case 'goal':
      return {
        DE1: { x: los + 0.7, y: by - 3.6 }, DT1: { x: los + 0.6, y: by - 0.8 }, DT2: { x: los + 0.6, y: by + 0.8 },
        DE2: { x: los + 0.7, y: by + 3.6 }, WLB: { x: los + 2.2, y: by - 1.8 }, MLB: { x: los + 2.2, y: by + 1.8 },
        NB: { x: los + 1.2, y: by + strong * 5.8 },
      };
    case 'wide':
      return { DE1: { x: los + 1.3, y: by - 6.2 }, DE2: { x: los + 1.3, y: by + 6.2 } };
    default:
      return {};
  }
}

/** A point `t` of the way from `a` to `b`. */
function lerp2(a: Vec, b: Vec, t: number): Vec {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
