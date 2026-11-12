import type { ConceptId } from './concepts';
import { tags, type PlayTags } from './playTags';
import type { ExtraSlot, OffSlot } from './teams';

/**
 * dx = yards relative to the line of scrimmage (negative = backfield). y is the offset from the ball:
 * - 'rel': fixed (linemen, inline TE, backs).
 * - 'split': receivers. y is the split with the ball in the middle of the field; off the middle it scales
 *   with the width of that side, so receivers squeeze into the boundary and spread to the field.
 */
export interface Align {
  dx: number;
  y: number;
  mode: 'split' | 'rel';
}

/** Strong side = the TE / receiver-heavy side of the formation. */
export type Side = 'strong' | 'weak';

export interface Formation {
  name: string;
  align: Record<OffSlot, Align>;
  /** Depth player lined up in an on-field slot (I-Form: SL ← FB). Coverage still keys on the slot. */
  sub?: Partial<Record<OffSlot, ExtraSlot>>;
  /** Strong side in the unflipped formation. 'right' = +y. */
  strong: 'right' | 'left';
}

export type RouteName =
  | 'go' | 'seam' | 'slant' | 'quickOut' | 'deepOut' | 'in' | 'post' | 'corner' | 'curl' | 'hitch'
  | 'comeback' | 'flat' | 'drag' | 'wheel' | 'swing' | 'bubble' | 'block'
  | 'cross' | 'glance' | 'smoke' | 'tunnel'
  | 'fade' | 'whip' | 'arrow' | 'outUp' | 'slip' | 'leak'
  // Back routes
  | 'checkFlat' | 'screen' | 'angle'
  // RB run paths and play-action fakes
  | 'iz' | 'oz' | 'power' | 'toss' | 'paFake'
  | 'izDeep' | 'stretch' | 'counter' | 'trap' | 'draw' | 'iso' | 'sweep' | 'pitchPath'
  // Lead blockers (FB, H, TE): run the path, then run-block
  | 'lead' | 'kickOut' | 'leadWide' | 'slice' | 'qbLead' | 'arc';

/**
 * A puller's or lead back's job on his man (`sim/runBlocking.ts`, `assignRunBlocks`):
 * - kick: the end man on the line, blocked from the inside out (on the perimeter, a kick is a force block)
 * - lead: up through the hole on the playside backer
 * - force: around the edge on the force (alley) defender
 */
export type PoaJob = 'kick' | 'lead' | 'force';

export interface RouteDef {
  pts: [number, number][];
  cont: boolean;
  /** Pass-block once the route is finished (play-action fakes). */
  thenBlock?: boolean;
  /** RB run path: drawn bold on play cards, and its last point marks the hole. */
  run?: boolean;
  /** Seconds after the snap before the route starts (screens, the draw, check-releases). */
  delay?: number;
  /** Pass-block during the delay (screens, check-releases, the draw's fake set). */
  delayBlock?: boolean;
  /**
   * Lead blocker on a run: he's a blocker from the snap, gets his man by `job` at the snap, and uses the
   * path to get there (through the hole, or out to the edge). `away` = his man is on the backside (slice).
   */
  lead?: boolean;
  job?: PoaJob;
  away?: boolean;
  /**
   * Pass routes: the waypoint index past which he turns his head to the QB and expects the ball (default 1,
   * out of the first break); 0 = from the start (screens, swings). Settle routes turn at the top instead.
   */
  look?: number;
  /** Straight-line routes: he looks over his shoulder only this many yards downfield (go, seam). */
  lookDepth?: number;
}

/**
 * Route waypoints as [downfield, inside] yards from the player's alignment.
 * "Inside" points toward the ball, so the same route works from either side.
 * A back lined up on the ball counts the strong side as inside, so run paths
 * from the pistol and singleback go to the TE side (and mirror with the play).
 * `cont` = keep running along the final leg after the last waypoint.
 */
export const ROUTES: Record<RouteName, RouteDef> = {
  // Shapes follow NFL tracking medians (analysis/out/route_compare.md).
  // Go: drift ~15° toward the numbers, then straighten so it keeps some room on the sideline.
  go: { pts: [[18, -4.8], [45, -5.5]], cont: true, lookDepth: 12 },
  seam: { pts: [[4, 0.5], [45, 1.5]], cont: true, lookDepth: 12 },
  slant: { pts: [[2, 0], [8, 6]], cont: true },
  // Quick out: the common NFL out. Leaves the 5.5-yd break at about -65°, then flattens.
  quickOut: { pts: [[5.5, 0], [7.5, -4.3], [8, -12]], cont: true },
  deepOut: { pts: [[10, 0], [10.5, -12]], cont: true },
  // Dig: climbs at about 60° off the break, then flattens.
  in: { pts: [[12, 0], [15, 5.2], [16, 14]], cont: true },
  post: { pts: [[12, 0], [35, 10]], cont: true },
  corner: { pts: [[12, 0], [30, -11]], cont: true },
  curl: { pts: [[12, 0], [10.5, 1.5]], cont: false },
  hitch: { pts: [[6, 0], [5, 0.5]], cont: false },
  comeback: { pts: [[15, 0], [13, -3]], cont: false },
  flat: { pts: [[2, -3], [4, -12]], cont: true },
  // Drag: climbs at about 73° to 5-6 yd, then flattens.
  drag: { pts: [[2, 1], [5.5, 12.5], [6, 24]], cont: true },
  wheel: { pts: [[1.5, -5], [6, -10], [30, -11]], cont: true },
  swing: { pts: [[-1, -4], [2, -10]], cont: true, look: 0 },
  bubble: { pts: [[-1.5, -2], [-1, -6]], cont: true, look: 0 },
  block: { pts: [], cont: false },
  // Gun: cross in front of the QB (mesh), then the playside B gap.
  iz: { pts: [[0.7, 1.6], [3.8, 3.85], [7, 4.35]], cont: true, run: true },
  // Pistol: mesh, then stretch outside the tight end.
  oz: { pts: [[2.2, 1.2], [5, 6], [8, 8]], cont: true, run: true },
  // Singleback: downhill off the tight end's hip.
  power: { pts: [[3, 1.2], [6.3, 3.5], [9, 3.9]], cont: true, run: true },
  // Singleback: sprint wide right away; the QB pitches it.
  toss: { pts: [[1, 6], [4, 11], [8, 12.5]], cont: true, run: true },
  paFake: { pts: [[0.7, 1.6], [2.5, 3.2]], cont: false, thenBlock: true },

  // Deep over: climbs to about 11 yd while crossing the field (Y-cross, PA crossers from under center).
  cross: { pts: [[3, 1], [8, 5], [11, 13], [12, 30]], cont: true },
  // Glance: a skinny post off a 5-yd stem (the RPO post).
  glance: { pts: [[5, 0], [14, 4.5]], cont: true },
  // Smoke: one step up, then back toward the QB for a quick screen.
  smoke: { pts: [[1, 0], [0, 0.4]], cont: false },
  // Tunnel: come inside behind the line, then turn up behind the linemen.
  tunnel: { pts: [[0.3, 2], [-0.8, 6], [1, 8.5]], cont: true, look: 0 },
  // Backs
  // Check-release: block, then leak to the flat and get just past the line.
  checkFlat: { pts: [[1.5, -3], [5.5, -9]], cont: true, delay: 0.7, delayBlock: true, look: 0 },
  screen: { pts: [[1.5, -3.5], [1.8, -6]], cont: false, delay: 0.9, delayBlock: true, look: 0 },
  angle: { pts: [[1, -3], [4, -2], [6.5, 5]], cont: true },
  // Run paths. Under center / pistol inside zone: downhill at the playside B gap, free to cut back.
  izDeep: { pts: [[2.5, 0.8], [5.6, 2.6], [9, 3]], cont: true, run: true },
  // Under-center stretch: aim at the tight end's outside hip, then bend it up.
  stretch: { pts: [[3, 1.8], [5.5, 6], [8.5, 8.5]], cont: true, run: true },
  // Gun counter: a real counter step away (a yard), then back across behind the pullers to the off-tackle
  // hole. The step is the timing: the pullers need 1.1–1.3 s to get there, and the back mustn't beat them.
  counter: { pts: [[-0.2, -1.1], [0.4, 1.2], [4, 5], [8, 5.8]], cont: true, run: true },
  // Trap: a quick hitter just inside the trapped lineman.
  trap: { pts: [[3, 0.8], [6.5, 1], [9, 1.2]], cont: true, run: true },
  // Draw: sell pass, then step up beside the QB and hit the A gap.
  draw: { pts: [[-0.6, 1.4], [3, 2.4], [7, 2.8]], cont: true, run: true, delay: 0.6, delayBlock: true },
  // Iso: downhill behind the fullback into the playside B gap.
  iso: { pts: [[3, 0.8], [7, 2.2], [10, 2.4]], cont: true, run: true },
  // Gun sweep: get to the edge fast (power read, pin-pull).
  sweep: { pts: [[0.5, 3], [2.5, 9], [6, 12.5]], cont: true, run: true },
  // Speed option: stay in a pitch relationship, about 4 yd outside and 1.5 behind the QB.
  pitchPath: { pts: [[1, 4.5], [3, 10], [7, 13.5]], cont: true, run: true },
  // Lead blockers
  // Iso: the fullback through the hole on the playside backer.
  lead: { pts: [[3.6, 2.4], [5.5, 2.6]], cont: false, lead: true, job: 'lead' },
  kickOut: { pts: [[3.2, 4.5], [4, 6]], cont: false, lead: true, job: 'kick' },
  // Out to the edge for the force player (I-Form stretch, lead toss).
  leadWide: { pts: [[2, 6], [4, 11]], cont: false, lead: true, job: 'force' },
  // Slice: the tight end comes back across behind the line to kick out the backside end.
  slice: { pts: [[-0.7, 3], [-0.4, 9.8]], cont: false, lead: true, job: 'kick', away: true },
  // QB power: the back leads through the hole for the QB.
  qbLead: { pts: [[1.5, 2.5], [5, 4.8]], cont: false, lead: true, job: 'lead' },
  // Arc: the inline tight end releases outside the end (left alone to read) for the force player (power read).
  arc: { pts: [[0.6, -2.2], [3, -4.5]], cont: false, lead: true, job: 'force' },

  // Batch 6 (docs/PLAYBOOKS.md). No NFL tracking sample for these; shapes follow the coaching texts.
  // Fade: release outside, then up along the sideline, looking early (the back-shoulder window).
  fade: { pts: [[6, -2.5], [45, -4.5]], cont: true, lookDepth: 8 },
  // Whip: three steps in, then pivot back out: beats a defender who jumps the in.
  whip: { pts: [[3, 0], [4.5, 2.5], [4.5, -10]], cont: true, look: 2 },
  // Arrow: the slot's angled flat, climbing to 5 yd.
  arrow: { pts: [[1, -1], [5, -8], [6, -14]], cont: true },
  // Out-and-up: sell the quick out at 6, then turn it up the sideline.
  outUp: { pts: [[6, 0], [7, -3], [12, -4], [45, -4.5]], cont: true, look: 2 },
  // Slip: block for a count, then slip out behind the line for a screen.
  slip: { pts: [[0.5, -2.5], [1, -6]], cont: false, delay: 0.8, delayBlock: true, look: 0 },
  // Leak: block on the fake, then release late across the field behind the flow (the boot's Y-leak).
  leak: { pts: [[3, 1], [8, 6], [14, 14], [16, 30]], cont: true, delay: 0.9, delayBlock: true },
};

// Line splits near the NFL medians (G 1.55, T 3.1, inline TE 4.9; analysis/out/splits.md).
const OL_ALIGN = {
  LT: { dx: -0.6, y: -3, mode: 'rel' },
  LG: { dx: -0.6, y: -1.5, mode: 'rel' },
  C: { dx: -0.5, y: 0, mode: 'rel' },
  RG: { dx: -0.6, y: 1.5, mode: 'rel' },
  RT: { dx: -0.6, y: 3, mode: 'rel' },
} as const;

// Receiver splits at a mid-field ball. 15.7 puts the outside WR 11 yd from the sideline (NFL: on the
// numbers); the 2x2 slot at 8 lands ~6 from the ball to the boundary and ~10 to the field (NFL 7 / 9).
const WIDE = 15.7;
const SLOT = 8;
const TRIPS_SLOT = 9.5;

export const GUN_DOUBLES: Formation = {
  name: 'Gun Doubles',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -1.5, y: -SLOT, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

export const GUN_TRIPS: Formation = {
  name: 'Gun Trips Rt',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    SL: { dx: -1.5, y: TRIPS_SLOT, mode: 'split' },
    Z: { dx: -0.6, y: WIDE, mode: 'split' },
  },
};

export const PISTOL: Formation = {
  name: 'Pistol',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -4, y: 0, mode: 'rel' },
    RB: { dx: -7, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -1.5, y: -SLOT, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

export const SINGLEBACK: Formation = {
  name: 'Singleback',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    RB: { dx: -6.5, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -1.5, y: -SLOT, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

// Personnel formations.

/** 21 personnel: the fullback lines up in the SL slot. */
export const I_FORM: Formation = {
  name: 'I-Form',
  strong: 'right',
  sub: { SL: 'FB' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    SL: { dx: -4.2, y: 0, mode: 'rel' },
    RB: { dx: -7, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

/** 12 personnel: a second tight end inline on the left. */
export const ACE: Formation = {
  name: 'Ace',
  strong: 'right',
  sub: { SL: 'TE2' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    RB: { dx: -6.5, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -0.8, y: -4.8, mode: 'rel' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

/** 10 personnel, 2x3: the back splits out left and a fourth receiver takes the TE slot. */
export const EMPTY: Formation = {
  name: 'Gun Empty',
  strong: 'right',
  sub: { TE: 'WR4' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    RB: { dx: -1.5, y: -SLOT, mode: 'split' },
    TE: { dx: -1.5, y: 6.5, mode: 'split' },
    SL: { dx: -1.5, y: 11, mode: 'split' },
    Z: { dx: -0.6, y: WIDE, mode: 'split' },
  },
};

// Batch 6 formations (docs/PLAYBOOKS.md). Personnel is fixed per formation.

/** 11, 3x1 with the TE attached as #3 to the trips side. */
export const GUN_TREY: Formation = {
  name: 'Gun Trey',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    SL: { dx: -1.5, y: SLOT, mode: 'split' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

/** 11, a tight three-man bunch to the field: Z outside, the slot on the point, the TE inside. */
export const GUN_BUNCH: Formation = {
  name: 'Gun Bunch',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -0.6, y: 9.5, mode: 'split' },
    Z: { dx: -1.8, y: 11, mode: 'split' },
    TE: { dx: -1.8, y: 8, mode: 'split' },
  },
};

/** 11, 2x2 with the TE off the line as a wing (H-back) outside the right tackle. */
export const GUN_WING: Formation = {
  name: 'Gun Wing',
  strong: 'right',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -1.5, y: -SLOT, mode: 'split' },
    TE: { dx: -1.5, y: 4.5, mode: 'rel' },
    Z: { dx: -0.6, y: WIDE, mode: 'split' },
  },
};

/** 12 from the pistol: a TE inline on each side. */
export const PISTOL_ACE: Formation = {
  name: 'Pistol Ace',
  strong: 'right',
  sub: { SL: 'TE2' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -4, y: 0, mode: 'rel' },
    RB: { dx: -7, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -0.8, y: -4.8, mode: 'rel' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

/** 12 under center with TE2 as a wing off the left tackle. */
export const ACE_WING: Formation = {
  name: 'Ace Wing',
  strong: 'right',
  sub: { SL: 'TE2' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    RB: { dx: -6.5, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    SL: { dx: -1.5, y: -4.5, mode: 'rel' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

/** 21, the fullback offset to the TE side. */
export const STRONG_I: Formation = {
  name: 'Strong I',
  strong: 'right',
  sub: { SL: 'FB' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    SL: { dx: -4.2, y: 1.8, mode: 'rel' },
    RB: { dx: -7, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
    Z: { dx: -1.5, y: WIDE, mode: 'split' },
  },
};

/** 22, the I with a TE on each side and one receiver: short yardage and max protection. */
export const HEAVY_I: Formation = {
  name: 'Heavy I',
  strong: 'right',
  sub: { SL: 'FB', Z: 'TE2' },
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    SL: { dx: -4.2, y: 0, mode: 'rel' },
    RB: { dx: -7, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: -WIDE, mode: 'split' },
    Z: { dx: -0.8, y: -4.8, mode: 'rel' },
    TE: { dx: -0.8, y: 4.8, mode: 'rel' },
  },
};

export const FORMATIONS: Formation[] = [
  GUN_DOUBLES, GUN_TRIPS, PISTOL, SINGLEBACK, I_FORM, ACE, EMPTY,
  GUN_TREY, GUN_BUNCH, GUN_WING, PISTOL_ACE, ACE_WING, STRONG_I, HEAVY_I,
];

/** Playbook tab. 'st' (special teams) holds kick calls from `data/specialTeams.ts` rather than plays. */
export type PlayKind = 'pass' | 'run' | 'pa' | 'st';

export const PLAY_TABS: { kind: PlayKind; label: string }[] = [
  { kind: 'pass', label: 'PASS' },
  { kind: 'run', label: 'RUN' },
  { kind: 'pa', label: 'PLAY ACTION' },
  { kind: 'st', label: 'SPECIAL' },
];

/** What the QB does with the ball after the snap. */
export type ReadType =
  | 'none' // dropback or play-action pass
  | 'handoff' // called give
  | 'pitch' // toss: pitch it right away
  | 'zoneRead' // give, or keep off the read key (the backside end, or the playside end on power read)
  | 'option' // speed option: attack the playside end, pitch it or keep it
  | 'rpo'; // give, or pull and throw the tagged route

/** Auto-mirror at the snap: keep as drawn, or put the strong side to the wide (field) or short (boundary) side. */
export type FlipRule = 'fixed' | 'field' | 'boundary';

export interface Pull {
  who: OffSlot;
  /**
   * 'kick' = kick out the end man on the line (on a perimeter scheme, the force player); 'lead' = turn up
   * through the hole (on the perimeter, at the edge) for the playside backer.
   */
  job: 'kick' | 'lead';
}

/**
 * Run-blocking scheme (`sim/runBlocking.ts`):
 * - zone: take the man over you or in your playside gap; uncovered linemen double, then climb.
 * - stretch: zone, reaching for the playside shoulder (outside zone, toss).
 * - gap: block down; pullers lead or kick out; the backside tackle hinges (power, counter).
 * - trap: gap, but the first lineman playside of the center is left for the pulling guard.
 * - pin: the linemen who stay pin the man over or playside of them (zone rules, no reach penalty) while
 *   the pullers get around them to the edge (pin-pull sweep).
 * - draw: show pass for `DRAW_SET`, then run block.
 */
export type RunScheme = 'zone' | 'stretch' | 'gap' | 'trap' | 'draw' | 'pin';

export interface BlockScheme {
  /** Runs: the line's rules (default zone). */
  run?: RunScheme;
  /** Pass pro: the line slides its gaps toward this side and the back checks the other edge. */
  slide?: Side;
  /** Runs: players who pull behind the line instead of blocking down. */
  pulls?: Pull[];
}

export interface PlayDef {
  id: string;
  name: string;
  kind: PlayKind;
  formation: Formation;
  /** Route combo for each side's receivers (`data/concepts.ts`). Receivers a concept doesn't reach block. */
  strong?: ConceptId;
  weak?: ConceptId;
  /** Assignments for the slots the formation puts in the backfield. */
  backs?: Partial<Record<OffSlot, RouteName>>;
  /** OL scheme: pass sets, or firing off the ball to drive block. */
  block: 'pass' | 'run';
  /** Optional pulls and slides on top of the base scheme. */
  scheme?: BlockScheme;
  read: ReadType;
  /** Zone read: which end is the key ('back' = the backside end, the default; 'play' = power read), and where the QB keeps it. */
  key?: 'back' | 'play';
  keep?: 'outside' | 'inside';
  /** Designed QB runs: the hole, as [downfield, toward the strong side] yards from the ball. Mirrors with the play. */
  qbPath?: [number, number];
  /** Pass plays: the line pass-sets, then releases to block for a screen. */
  screen?: boolean;
  /** Designed QB carry: no handoff option, and it's left out of RB run stats. */
  qbRun?: boolean;
  /** Short-yardage call: gets a 3rd-and-1 row in `npm run balance`. */
  short?: boolean;
  flip: FlipRule;
  /** QB drop (yards back from his alignment); on runs this is the mesh point. */
  drop: number;
  /** Sideways QB drift on the drop (+ = toward the near sideline), for bootlegs. Mirrors with the play. */
  dropY?: number;
  /** What a coach would call it: family, concept, and what it beats (`data/playTags.ts`; docs/PLAYBOOKS.md). */
  tags: PlayTags;
  tip: string;
}

/** The original 62 plays (batches 1-5): the balance report's aggregate rows run over these, unchanged. */
const LEGACY_PLAYS: PlayDef[] = [
  // ---------------------------------------------------------------- pass
  {
    id: 'four-verts', name: 'Four Verts', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'verts', weak: 'verts', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tags: tags('shot', 'four-verts', 'cover3', 'cover1'),
    tip: 'Beats single-high. Hit the seam.',
  },
  {
    id: 'slant-flat', name: 'Slant Flat', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'slant-drag', weak: 'slant-flat', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1,
    tags: tags('quick', 'slant-flat', 'cover3', 'man'),
    tip: 'Quick game vs press man.',
  },
  {
    id: 'smash', name: 'Smash', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'smash', weak: 'smash', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('dropback', 'smash', 'cover2'),
    tip: 'Corner over the top of Cover 2.',
  },
  {
    id: 'mesh', name: 'Mesh', kind: 'pass', formation: GUN_TRIPS,
    strong: 'mesh', weak: 'drag', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1.5,
    tags: tags('dropback', 'mesh', 'man', 'cover1'),
    tip: 'Crossers rub man coverage.',
  },
  {
    id: 'dagger', name: 'Dagger', kind: 'pass', formation: GUN_TRIPS,
    strong: 'dagger', weak: 'post', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tags: tags('dropback', 'dagger', 'cover3', 'quarters'),
    tip: 'Seam clears, dig sits behind.',
  },
  {
    id: 'curl-flat', name: 'Curl Flat', kind: 'pass', formation: GUN_TRIPS,
    strong: 'curl-flat', weak: 'curl', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('dropback', 'curl-flat', 'cover3'),
    tip: 'Safe completions vs off coverage.',
  },

  // Quick game and screens (batch 1)
  {
    id: 'double-slant', name: 'Double Slant', kind: 'pass', formation: GUN_TRIPS,
    strong: 'double-slant', weak: 'hitch', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'field', drop: 1,
    tags: tags('quick', 'double-slant', 'man', 'blitz'),
    tip: 'Two slants to the field vs press man. Throw it on the break.',
  },
  {
    id: 'double-hitch', name: 'Double Hitch', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'double-hitch', weak: 'double-hitch', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1,
    tags: tags('quick', 'double-hitch', 'cover3', 'quarters'),
    tip: 'Corners off? Four hitches at 6. Take the free yards.',
  },
  {
    id: 'stick', name: 'Stick', kind: 'pass', formation: GUN_TRIPS,
    strong: 'stick', weak: 'slant', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 1,
    tags: tags('quick', 'stick', 'cover3', 'quarters'),
    tip: 'Read the flat defender: he takes the flat, throw the stick.',
  },
  {
    id: 'trips-outs', name: 'Trips Outs', kind: 'pass', formation: GUN_TRIPS,
    strong: 'clear-outs', weak: 'go', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 1,
    tags: tags('quick', 'outs', 'cover3'),
    tip: 'Z clears the corner deep; the slot and TE run outs under him. Throw early.',
  },
  {
    id: 'empty-spacing', name: 'Empty Spacing', kind: 'pass', formation: EMPTY,
    strong: 'spacing', weak: 'go-hitch', block: 'pass', read: 'none', flip: 'field', drop: 1,
    tags: tags('quick', 'spacing', 'blitz', 'cover3'),
    tip: 'Five out, ball out fast. Beats the blitz if you read it.',
  },
  {
    id: 'smoke', name: 'Smoke', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'go', weak: 'smoke', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 0.5,
    tags: tags('screen', 'smoke', 'cover3', 'quarters'),
    tip: 'Boundary corner off? Throw it now, slot blocks him.',
  },
  {
    id: 'tunnel-screen', name: 'Tunnel Screen', kind: 'pass', formation: GUN_TRIPS,
    strong: 'tunnel', weak: 'go', backs: { RB: 'block' },
    block: 'pass', screen: true, read: 'none', flip: 'field', drop: 1.5,
    tags: tags('screen', 'tunnel', 'blitz', 'man'),
    tip: 'Let them rush. Z comes inside behind the linemen.',
  },
  {
    id: 'rb-screen', name: 'RB Screen', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'verts', weak: 'verts', backs: { RB: 'screen' },
    block: 'pass', screen: true, read: 'none', flip: 'fixed', drop: 3,
    tags: tags('screen', 'rb-screen', 'blitz'),
    tip: 'Vs the blitz. Drift back, let them come, dump it to the RB.',
  },

  // Intermediate and shots (batch 2)
  {
    id: 'drive', name: 'Drive', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'drive', weak: 'go-hitch', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('dropback', 'drive', 'man', 'cover3'),
    tip: 'Shallow drag under the backers, dig behind them. Man or zone.',
  },
  {
    id: 'y-cross', name: 'Y-Cross', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'cross-go', weak: 'curl-flat', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tags: tags('dropback', 'y-cross', 'cover3', 'cover1'),
    tip: 'Air Raid staple: Y crosses at 12 while Z clears. Read it high to low.',
  },
  {
    id: 'mills', name: 'Mills', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'mills', weak: 'double-slant', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tags: tags('dropback', 'mills', 'quarters', 'cover2'),
    tip: 'Post over the dig. Safety jumps the dig? The post is behind him.',
  },
  {
    id: 'go-post', name: 'Go Post', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'go-post', weak: 'go-post', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('shot', 'go-post', 'cover2', 'cover1'),
    tip: 'Shot play. Posts split two-high; the go beats a lone safety.',
  },
  {
    id: 'flood', name: 'Flood', kind: 'pass', formation: GUN_TRIPS,
    strong: 'flood', weak: 'curl', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 2.5,
    tags: tags('dropback', 'flood', 'cover3'),
    tip: 'Three levels to the field: go, out, flat. Read the corner.',
  },
  {
    id: 'empty-dig-cross', name: 'Empty Dig Cross', kind: 'pass', formation: EMPTY,
    strong: 'in-cross', weak: 'double-slant', block: 'pass', read: 'none', flip: 'field', drop: 2,
    tags: tags('dropback', 'dig-cross', 'man'),
    tip: 'Dig over the crosser, hitch underneath. Five out, no help for the D.',
  },
  {
    id: 'corner-out', name: 'Corner Out', kind: 'pass', formation: PISTOL,
    strong: 'corner-out', weak: 'double-slant', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('dropback', 'corner-out', 'cover2'),
    tip: 'Corner over the quick out: high-low the flat defender.',
  },
  {
    id: 'post-wheel', name: 'Post Wheel', kind: 'pass', formation: PISTOL,
    strong: 'post', weak: 'go-hitch', backs: { RB: 'wheel' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tags: tags('shot', 'post-wheel', 'man'),
    tip: 'RB wheel up the sideline under the post. A backer on the RB loses.',
  },
  {
    id: 'ace-stick', name: 'Ace Y-Stick', kind: 'pass', formation: ACE,
    strong: 'stick', weak: 'slant-flat', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1.5,
    tags: tags('quick', 'stick', 'cover3'),
    tip: 'Two tight ends vs base D: Y sits at 6, the flat holds the backer.',
  },
  {
    id: 'snag', name: 'Snag', kind: 'pass', formation: GUN_TRIPS,
    strong: 'snag', weak: 'slant', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 2,
    tags: tags('dropback', 'snag', 'cover3', 'quarters'),
    tip: 'Triangle on the flat defender: snag at 5, corner over it. Go clears.',
  },
  {
    id: 'go-out', name: 'Go Out', kind: 'pass', formation: GUN_TRIPS,
    strong: 'go-out', weak: 'slant', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'field', drop: 2.5,
    tags: tags('dropback', 'go-out', 'cover3'),
    tip: "The NFL's most common pair: go clears, the deep out sits under it.",
  },
  {
    id: 'texas', name: 'Texas', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'post-curl', weak: 'double-slant', backs: { RB: 'angle' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('dropback', 'texas', 'man', 'cover1'),
    tip: 'RB angle route: out, then back inside. A backer on the RB loses.',
  },

  // ---------------------------------------------------------------- run
  {
    id: 'inside-zone', name: 'Inside Zone', kind: 'run', formation: GUN_DOUBLES,
    backs: { RB: 'iz' }, block: 'run', read: 'handoff', flip: 'fixed', drop: 0.5,
    tags: tags('insideZone', 'inside-zone', 'lightBox'),
    tip: 'R-click at the mesh. Find the B gap.',
  },
  {
    id: 'outside-zone', name: 'Outside Zone', kind: 'run', formation: PISTOL,
    backs: { RB: 'oz' }, block: 'run', scheme: { run: 'stretch' }, read: 'handoff', flip: 'fixed', drop: 0.6,
    tags: tags('outsideZone', 'outside-zone', 'lightBox'),
    tip: 'Stretch the edge, cut up behind blocks.',
  },
  {
    id: 'power', name: 'Power', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'power' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'handoff', short: true, flip: 'fixed', drop: 2.4,
    tags: tags('gap', 'power', 'lightBox'),
    tip: 'Downhill off tackle. Good in short yardage.',
  },
  {
    id: 'toss', name: 'Toss', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'toss' }, block: 'run', scheme: { run: 'stretch' }, read: 'pitch', flip: 'fixed', drop: 1,
    tags: tags('perimeter', 'toss', 'heavyBox'),
    tip: 'R-click right away to pitch. Beat them wide.',
  },
  {
    id: 'zone-read', name: 'Zone Read', kind: 'run', formation: GUN_DOUBLES,
    backs: { RB: 'iz' }, block: 'run', read: 'zoneRead', flip: 'fixed', drop: 0.5,
    tags: tags('read', 'zone-read', 'man'),
    tip: 'R-click to give, or keep it and run the QB.',
  },
  // Zone and gap runs (batch 3)
  {
    id: 'split-zone', name: 'Split Zone', kind: 'run', formation: PISTOL,
    strong: 'slice', backs: { RB: 'izDeep' }, block: 'run', read: 'handoff', flip: 'fixed', drop: 0.8,
    tags: tags('insideZone', 'split-zone', 'lightBox'),
    tip: 'Zone to the TE side; the TE slices back on the end. Cutback lane.',
  },
  {
    id: 'i-stretch', name: 'I-Form Stretch', kind: 'run', formation: I_FORM,
    backs: { SL: 'leadWide', RB: 'stretch' }, block: 'run', scheme: { run: 'stretch' },
    read: 'handoff', flip: 'field', drop: 2.5, dropY: 1.5,
    tags: tags('outsideZone', 'outside-zone', 'lightBox'),
    tip: 'Stretch to the field behind the FB. Press the edge, then cut up.',
  },
  {
    id: 'power-o', name: 'Power O', kind: 'run', formation: I_FORM,
    backs: { SL: 'kickOut', RB: 'power' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'handoff', flip: 'boundary', drop: 2.2,
    tags: tags('gap', 'power', 'lightBox'),
    tip: 'FB kicks out the end, guard leads through. Downhill, 21 personnel.',
  },
  {
    id: 'counter', name: 'Counter GT', kind: 'run', formation: GUN_DOUBLES,
    backs: { RB: 'counter' }, block: 'run',
    scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'kick' }, { who: 'LT', job: 'lead' }] },
    read: 'handoff', flip: 'boundary', drop: 0.5,
    tags: tags('gap', 'counter', 'lightBox'),
    tip: 'Jab away, then follow the guard and tackle off tackle. Beats flow.',
  },
  {
    id: 'duo', name: 'Duo', kind: 'run', formation: ACE,
    backs: { RB: 'izDeep' }, block: 'run', scheme: { run: 'gap' }, read: 'handoff', flip: 'boundary', drop: 1.2,
    tags: tags('gap', 'duo', 'lightBox'),
    tip: 'Two double teams, no pullers. Downhill; read the MIKE.',
  },
  {
    id: 'iso', name: 'Iso', kind: 'run', formation: I_FORM,
    backs: { SL: 'lead', RB: 'iso' }, block: 'run', scheme: { run: 'gap' }, read: 'handoff', short: true,
    flip: 'boundary', drop: 1.2,
    tags: tags('gap', 'iso', 'lightBox'),
    tip: 'FB isolates the MIKE. Short yardage: hit it hard behind him.',
  },
  {
    id: 'trap', name: 'Trap', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'trap' }, block: 'run', scheme: { run: 'trap', pulls: [{ who: 'LG', job: 'kick' }] },
    read: 'handoff', flip: 'fixed', drop: 1,
    tags: tags('gap', 'trap', 'blitz'),
    tip: 'Let the 3-tech in, the guard traps him. Quick hitter vs penetration.',
  },
  // Perimeter, draw, option and QB runs (batch 4)
  {
    id: 'lead-toss', name: 'Lead Toss', kind: 'run', formation: I_FORM,
    backs: { SL: 'leadWide', RB: 'toss' }, block: 'run', scheme: { run: 'stretch' }, read: 'pitch',
    flip: 'field', drop: 1,
    tags: tags('perimeter', 'toss', 'heavyBox'),
    tip: 'R-click right away to pitch. FB leads the edge; follow him.',
  },
  {
    id: 'pin-pull', name: 'Pin-Pull Sweep', kind: 'run', formation: GUN_TRIPS,
    backs: { RB: 'sweep' }, block: 'run',
    scheme: { run: 'pin', pulls: [{ who: 'RG', job: 'lead' }, { who: 'RT', job: 'kick' }] },
    read: 'handoff', flip: 'field', drop: 0.5,
    tags: tags('perimeter', 'pin-pull', 'heavyBox'),
    tip: 'Tackle logs the force, guard leads up on the backer. Stay on their hips.',
  },
  {
    id: 'draw', name: 'Draw', kind: 'run', formation: GUN_DOUBLES,
    backs: { RB: 'draw' }, block: 'run', scheme: { run: 'draw' }, read: 'handoff', flip: 'fixed', drop: 1.2,
    tags: tags('draw', 'draw', 'blitz', 'lightBox'),
    tip: 'Show pass, then hand it off. Beats a hard rush and two-high.',
  },
  {
    id: 'qb-draw', name: 'Empty QB Draw', kind: 'run', formation: EMPTY,
    block: 'run', scheme: { run: 'draw' }, read: 'none', qbRun: true, qbPath: [1.5, 0.8],
    flip: 'field', drop: 1,
    tags: tags('qbRun', 'qb-draw', 'man', 'lightBox'),
    tip: 'Five wide empties the box. Sell pass, then the QB runs it.',
  },
  {
    id: 'power-read', name: 'Power Read', kind: 'run', formation: GUN_DOUBLES,
    strong: 'arc', backs: { RB: 'sweep' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'zoneRead', key: 'play', keep: 'inside', flip: 'field', drop: 0.5,
    tags: tags('read', 'power-read', 'man'),
    tip: 'Read the playside end. He widens with the sweep? Keep it inside.',
  },
  {
    id: 'speed-option', name: 'Speed Option', kind: 'run', formation: PISTOL,
    backs: { RB: 'pitchPath' }, block: 'run', scheme: { run: 'stretch' }, read: 'option',
    flip: 'field', drop: -5, dropY: 8,
    tags: tags('read', 'speed-option', 'heavyBox'),
    tip: 'Attack the end. He takes you? R-click to pitch. He takes the pitch? Keep.',
  },
  {
    id: 'qb-power', name: 'QB Power', kind: 'run', formation: GUN_TRIPS,
    backs: { RB: 'qbLead' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'none', qbRun: true, qbPath: [1, 3.2], short: true, flip: 'field', drop: 0.3,
    tags: tags('qbRun', 'qb-power', 'man'),
    tip: 'QB keeps it behind the back and the pulling guard. Goal-line hammer.',
  },
  {
    id: 'qb-sneak', name: 'QB Sneak', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'block' }, block: 'run', read: 'none', qbRun: true, short: true, flip: 'fixed', drop: 0,
    tags: tags('qbRun', 'sneak'),
    tip: 'Short yardage. Hold D and push the pile.',
  },

  // ---------------------------------------------------------------- play action / RPO
  {
    id: 'pa-post', name: 'PA Post', kind: 'pa', formation: GUN_DOUBLES,
    strong: 'go', weak: 'post-curl', backs: { RB: 'paFake' }, // TE stays in to block
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('pa', 'pa-post', 'cover1', 'cover3'),
    tip: 'Sell the run, hit the post behind the LBs.',
  },
  {
    id: 'pa-boot', name: 'PA Boot Flood', kind: 'pa', formation: GUN_DOUBLES,
    strong: 'post-drag', weak: 'go-out', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1.5, dropY: -7,
    tags: tags('boot', 'boot-flood', 'cover3'),
    tip: 'Fake right, boot left. Three levels.',
  },
  {
    id: 'pa-cross', name: 'PA Crossers', kind: 'pa', formation: PISTOL,
    strong: 'post-drag', weak: 'in-go', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tags: tags('pa', 'pa-crossers', 'man', 'cover3'),
    tip: 'Dig and drag open up when LBs bite.',
  },
  {
    id: 'pa-seams', name: 'PA Seams', kind: 'pa', formation: SINGLEBACK,
    strong: 'comeback-seam', weak: 'verts', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('pa', 'pa-seams', 'cover3'),
    tip: 'Hold the safeties with the fake.',
  },
  // Play action from under center (batch 5): boots and floods with crossers and corners
  {
    id: 'i-boot', name: 'I-Form Boot', kind: 'pa', formation: I_FORM,
    strong: 'post-cross', weak: 'corner', backs: { SL: 'flat', RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'boundary', drop: 1.5, dropY: -7,
    tags: tags('boot', 'boot-flood', 'cover3'),
    tip: 'Fake it, boot back to the field: corner, TE crosser, FB in the flat.',
  },
  {
    id: 'i-deep-cross', name: 'I-Form Deep Cross', kind: 'pa', formation: I_FORM,
    strong: 'cross-corner', weak: 'go', backs: { SL: 'flat', RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('pa', 'deep-cross', 'cover3', 'cover1'),
    tip: 'Sell the run; Z crosses deep under a TE corner. Hit it on the move.',
  },
  {
    id: 'ace-boot', name: 'Ace Boot', kind: 'pa', formation: ACE,
    strong: 'post-drag', weak: 'go-corner', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'boundary', drop: 1.5, dropY: -7,
    tags: tags('boot', 'boot-flood', 'cover3'),
    tip: 'Two TEs: one drags across, one runs the corner. RB leaks to the flat.',
  },
  {
    id: 'ace-max', name: 'Ace Max Shot', kind: 'pa', formation: ACE,
    strong: 'go', weak: 'post', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('shot', 'max-shot', 'cover1', 'zero'),
    tip: 'Seven-man protection, two shots: Z go, X post. Take the one-on-one.',
  },
  {
    id: 'counter-boot', name: 'Counter Boot', kind: 'pa', formation: SINGLEBACK,
    strong: 'cross-drag', weak: 'corner-flat', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'boundary', drop: 1.5, dropY: -7,
    tags: tags('boot', 'counter-boot', 'cover3'),
    tip: 'Boot away from the fake: deep cross, drag, corner and slot flat.',
  },
  {
    id: 'rpo-slant', name: 'RPO Slant', kind: 'pa', formation: GUN_DOUBLES,
    weak: 'slant', backs: { RB: 'iz' },
    block: 'run', read: 'rpo', flip: 'fixed', drop: 0.5,
    tags: tags('rpo', 'rpo-slant', 'heavyBox', 'cover3'),
    tip: 'R-click to give, or pull and throw the slant.',
  },
  {
    id: 'rpo-bubble', name: 'RPO Bubble', kind: 'pa', formation: GUN_TRIPS,
    strong: 'bubble', backs: { RB: 'iz' },
    block: 'run', read: 'rpo', flip: 'fixed', drop: 0.5,
    tags: tags('rpo', 'rpo-bubble', 'heavyBox'),
    tip: 'Numbers outside? Throw the bubble.',
  },
  // RPO tags (batch 5): still give-or-pull, no read on a defender yet
  {
    id: 'rpo-glance', name: 'RPO Glance', kind: 'pa', formation: GUN_DOUBLES,
    weak: 'glance', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'fixed', drop: 0.5,
    tags: tags('rpo', 'rpo-glance', 'heavyBox', 'cover1'),
    tip: 'R-click to give, or pull it and throw the glance behind the backers.',
  },
  {
    id: 'rpo-stick', name: 'RPO Stick', kind: 'pa', formation: GUN_TRIPS,
    strong: 'stick', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'field', drop: 0.5,
    tags: tags('rpo', 'rpo-stick', 'heavyBox', 'cover3'),
    tip: 'Give it, or pull and hit the stick if the flat defender bites on the run.',
  },
  {
    id: 'rpo-pop', name: 'RPO Pop', kind: 'pa', formation: ACE,
    strong: 'pop', backs: { RB: 'izDeep' }, block: 'run', read: 'rpo', flip: 'fixed', drop: 1.5,
    tags: tags('rpo', 'rpo-pop', 'heavyBox', 'cover3'),
    tip: 'Inside zone look; the TE pops up the seam behind the backers.',
  },
  {
    id: 'rpo-smoke', name: 'RPO Smoke', kind: 'pa', formation: GUN_DOUBLES,
    weak: 'smoke', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'field', drop: 0.5,
    tags: tags('rpo', 'rpo-smoke', 'heavyBox', 'quarters'),
    tip: 'Boundary corner off? Pull it and throw the smoke. Else give it.',
  },
  {
    id: 'power-bubble', name: 'Power Bubble', kind: 'pa', formation: GUN_TRIPS,
    strong: 'bubble', backs: { RB: 'iz' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'rpo', flip: 'field', drop: 0.5,
    tags: tags('rpo', 'rpo-bubble', 'heavyBox'),
    tip: 'Power with a pulling guard; the bubble punishes a box that fills fast.',
  },
];

/**
 * Batch 6 (docs/PLAYBOOKS.md): the Spread RPO and Pro style books' own plays. Every play is in at least
 * one style book (`data/offStyles.ts`).
 */
const BATCH_6: PlayDef[] = [
  // ---------------------------------------------------------------- Spread RPO
  {
    id: 'trey-iz', name: 'Trey Inside Zone', kind: 'run', formation: GUN_TREY,
    backs: { RB: 'iz' }, block: 'run', read: 'handoff', flip: 'field', drop: 0.5,
    tags: tags('insideZone', 'inside-zone', 'lightBox'),
    tip: 'Zone to the trey side: the TE is a sixth blocker. Find the B gap.',
  },
  {
    id: 'trey-duo', name: 'Trey Duo', kind: 'run', formation: GUN_TREY,
    backs: { RB: 'iz' }, block: 'run', scheme: { run: 'gap' }, read: 'handoff', flip: 'field', drop: 0.5,
    tags: tags('gap', 'duo', 'lightBox'),
    tip: 'Two double teams from the gun. Read the MIKE and hit it downhill.',
  },
  {
    id: 'trey-counter', name: 'Trey Counter', kind: 'run', formation: GUN_TREY,
    backs: { RB: 'counter' }, block: 'run',
    scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'kick' }, { who: 'LT', job: 'lead' }] },
    read: 'handoff', flip: 'boundary', drop: 0.5,
    tags: tags('gap', 'counter', 'lightBox'),
    tip: 'Jab away, then follow the guard and tackle back to the trey side.',
  },
  {
    id: 'wing-split-zone', name: 'Wing Split Zone', kind: 'run', formation: GUN_WING,
    strong: 'slice', backs: { RB: 'iz' }, block: 'run', read: 'handoff', flip: 'fixed', drop: 0.5,
    tags: tags('insideZone', 'split-zone', 'lightBox'),
    tip: 'Zone one way, the wing slices back on the end. Cutback lane.',
  },
  {
    id: 'qb-counter', name: 'QB Counter', kind: 'run', formation: GUN_WING,
    backs: { RB: 'qbLead' }, block: 'run',
    scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'kick' }, { who: 'LT', job: 'lead' }] },
    read: 'none', qbRun: true, qbPath: [1, 3.5], flip: 'boundary', drop: 0.3,
    tags: tags('qbRun', 'qb-counter', 'man'),
    tip: 'The QB keeps it behind the guard and tackle. Man coverage turns its back.',
  },
  {
    id: 'counter-glance', name: 'Counter Glance RPO', kind: 'pa', formation: GUN_TREY,
    weak: 'glance', backs: { RB: 'counter' }, block: 'run',
    scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'kick' }, { who: 'LT', job: 'lead' }] },
    read: 'rpo', flip: 'boundary', drop: 0.5,
    tags: tags('rpo', 'rpo-glance', 'heavyBox', 'cover1'),
    tip: 'Counter to the trey side. The backers fit it? Pull it, throw the glance.',
  },
  {
    id: 'rpo-arrow', name: 'RPO Arrow', kind: 'pa', formation: GUN_TREY,
    strong: 'arrow', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'field', drop: 0.5,
    tags: tags('rpo', 'rpo-arrow', 'heavyBox', 'cover3'),
    tip: 'Zone to the trey side; the slot arrows to the flat. The apex fits? Throw it.',
  },
  {
    id: 'rpo-fade', name: 'RPO Fade', kind: 'pa', formation: GUN_DOUBLES,
    weak: 'fade', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'field', drop: 0.5,
    tags: tags('rpo', 'rpo-fade', 'heavyBox', 'cover1'),
    tip: 'Boundary X one-on-one with no help? Pull it and throw the fade.',
  },
  {
    id: 'trey-glance', name: 'Trey Glance RPO', kind: 'pa', formation: GUN_TREY,
    weak: 'glance', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'field', drop: 0.5,
    tags: tags('rpo', 'rpo-glance', 'heavyBox', 'cover1'),
    tip: 'Zone to the trey side, the backside X runs the glance behind the backers.',
  },
  {
    id: 'wing-pop', name: 'Wing Pop RPO', kind: 'pa', formation: GUN_WING,
    strong: 'pop', backs: { RB: 'iz' }, block: 'run', read: 'rpo', flip: 'fixed', drop: 0.5,
    tags: tags('rpo', 'rpo-pop', 'heavyBox', 'cover3'),
    tip: 'Zone look; the wing pops up the seam when the backers step up.',
  },
  {
    id: 'trey-smash', name: 'Trey Smash', kind: 'pass', formation: GUN_TREY,
    strong: 'smash', weak: 'slant', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'field', drop: 2,
    tags: tags('dropback', 'smash', 'cover2'),
    tip: 'Hitch under the corner, the slot over the top. The TE stays in.',
  },
  {
    id: 'trey-dagger', name: 'Trey Dagger', kind: 'pass', formation: GUN_TREY,
    strong: 'dagger', weak: 'go', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 2.5,
    tags: tags('dropback', 'dagger', 'cover3', 'quarters'),
    tip: 'The slot clears the seam, Z digs behind it, the TE leaks to the flat.',
  },
  {
    id: 'bunch-snag', name: 'Bunch Snag', kind: 'pass', formation: GUN_BUNCH,
    strong: 'snag-flat', weak: 'slant', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 1.5,
    tags: tags('dropback', 'snag', 'cover3', 'quarters'),
    tip: 'Triangle on the flat defender: corner, snag, flat. Bunch rubs man.',
  },
  {
    id: 'bunch-whip', name: 'Bunch Whip', kind: 'pass', formation: GUN_BUNCH,
    strong: 'whip-go', weak: 'hitch', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'field', drop: 1,
    tags: tags('quick', 'whip', 'man', 'press'),
    tip: 'The point man fakes in and whips out. Man defender jumps it? Gone.',
  },
  {
    id: 'fade-out', name: 'Fade Out', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'fade-out', weak: 'fade-out', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1,
    tags: tags('quick', 'fade-out', 'cover2', 'man'),
    tip: 'Corner sinks under the fade? Throw the out. He squats? Throw the fade.',
  },
  {
    id: 'out-up', name: 'Out and Up', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'out-up-seam', weak: 'hitch', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('shot', 'out-and-up', 'cover1', 'man'),
    tip: 'Shot play. Sell the quick out, then up the sideline past a jumping corner.',
  },
  {
    id: 'trips-bubble', name: 'Trips Bubble', kind: 'pass', formation: GUN_TRIPS,
    strong: 'bubble', weak: 'go', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'field', drop: 0.5,
    tags: tags('screen', 'bubble', 'heavyBox', 'cover3'),
    tip: 'Three to the field, two block. Throw it now if they are outnumbered.',
  },
  {
    id: 'trey-pa-dig', name: 'Trey PA Dig', kind: 'pa', formation: GUN_TREY,
    strong: 'pa-dig', weak: 'go', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'field', drop: 2,
    tags: tags('pa', 'pa-dig', 'cover3', 'quarters'),
    tip: 'Sell zone; the TE seam and slot post hold the safeties, Z digs under.',
  },

  // ---------------------------------------------------------------- Pro
  {
    id: 'ace-wide-zone', name: 'Ace Wide Zone', kind: 'run', formation: ACE,
    backs: { RB: 'stretch' }, block: 'run', scheme: { run: 'stretch' }, read: 'handoff',
    flip: 'field', drop: 2.5, dropY: 1.5,
    tags: tags('outsideZone', 'outside-zone', 'lightBox'),
    tip: 'Under center wide zone: press the edge, one cut, get downhill.',
  },
  {
    id: 'pistol-ace-oz', name: 'Pistol Ace Zone', kind: 'run', formation: PISTOL_ACE,
    backs: { RB: 'oz' }, block: 'run', scheme: { run: 'stretch' }, read: 'handoff', flip: 'field', drop: 0.6,
    tags: tags('outsideZone', 'outside-zone', 'lightBox'),
    tip: 'Two tight ends, stretch to the field. Cut up behind the reach blocks.',
  },
  {
    id: 'pistol-duo', name: 'Pistol Duo', kind: 'run', formation: PISTOL_ACE,
    backs: { RB: 'izDeep' }, block: 'run', scheme: { run: 'gap' }, read: 'handoff', flip: 'boundary', drop: 0.8,
    tags: tags('gap', 'duo', 'lightBox'),
    tip: 'Double teams at the point, two tight ends. Downhill; read the MIKE.',
  },
  {
    id: 'ace-counter', name: 'Ace Wing Counter', kind: 'run', formation: ACE_WING,
    backs: { RB: 'power' }, block: 'run',
    scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'kick' }, { who: 'LT', job: 'lead' }] },
    read: 'handoff', flip: 'boundary', drop: 2.2,
    tags: tags('gap', 'counter', 'lightBox'),
    tip: 'Counter from under center: the guard and tackle pull across, follow them.',
  },
  {
    id: 'strong-i-power', name: 'Strong I Power', kind: 'run', formation: STRONG_I,
    backs: { SL: 'kickOut', RB: 'power' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'handoff', flip: 'boundary', drop: 2.2,
    tags: tags('gap', 'power', 'lightBox'),
    tip: 'The offset FB kicks out the end, the guard leads up. Downhill.',
  },
  {
    id: 'strong-i-toss', name: 'Strong I Toss', kind: 'run', formation: STRONG_I,
    backs: { SL: 'leadWide', RB: 'toss' }, block: 'run', scheme: { run: 'stretch' }, read: 'pitch',
    flip: 'field', drop: 1,
    tags: tags('perimeter', 'toss', 'heavyBox'),
    tip: 'R-click right away to pitch. The FB is already on the edge: follow him.',
  },
  {
    id: 'heavy-iso', name: 'Heavy Iso', kind: 'run', formation: HEAVY_I,
    backs: { SL: 'lead', RB: 'iso' }, block: 'run', scheme: { run: 'gap' }, read: 'handoff', short: true,
    flip: 'boundary', drop: 1.2,
    tags: tags('gap', 'iso', 'lightBox'),
    tip: 'Two tight ends and a fullback. Short yardage: follow the FB into the hole.',
  },
  {
    id: 'heavy-power', name: 'Heavy Power', kind: 'run', formation: HEAVY_I,
    backs: { SL: 'kickOut', RB: 'power' }, block: 'run', scheme: { run: 'gap', pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'handoff', short: true, flip: 'boundary', drop: 2.2,
    tags: tags('gap', 'power', 'lightBox'),
    tip: 'Goal line power: the FB kicks out, the guard leads. Get a yard.',
  },
  {
    id: 'ace-pa-dig', name: 'Ace PA Dig', kind: 'pa', formation: ACE,
    strong: 'pa-dig', weak: 'go-flat', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tags: tags('pa', 'pa-dig', 'cover3', 'quarters'),
    tip: 'Sell the zone; the TE post holds the safety and Z digs behind the backers.',
  },
  {
    id: 'strong-i-cross', name: 'Strong I Deep Over', kind: 'pa', formation: STRONG_I,
    strong: 'cross-go', weak: 'post', backs: { SL: 'flat', RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('pa', 'deep-cross', 'cover3', 'cover1'),
    tip: 'Hard fake; the TE crosses deep under the Z go. FB in the flat to check it.',
  },
  {
    id: 'y-leak', name: 'Boot Y-Leak', kind: 'pa', formation: ACE_WING,
    strong: 'go-leak', weak: 'corner-flat', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'boundary', drop: 1.5, dropY: -7,
    tags: tags('boot', 'y-leak', 'cover3', 'man'),
    tip: 'Boot away; the TE blocks, then leaks back across behind the flow.',
  },
  {
    id: 'wing-boot', name: 'Wing Boot Flood', kind: 'pa', formation: GUN_WING,
    strong: 'post-drag', weak: 'go-out', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'boundary', drop: 1.5, dropY: -7,
    tags: tags('boot', 'boot-flood', 'cover3'),
    tip: 'Boot to the twins side: go, out, the RB in the flat, the wing drags across.',
  },
  {
    id: 'zone-keeper', name: 'Naked Keeper', kind: 'pa', formation: ACE,
    strong: 'post-drag', weak: 'corner-flat', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'boundary', drop: 1.5, dropY: -8,
    tags: tags('boot', 'keeper', 'cover3', 'man'),
    tip: 'Naked boot: nobody blocks the edge. He bites on the fake? Run it.',
  },
  {
    id: 'heavy-max', name: 'Heavy Max Shot', kind: 'pa', formation: HEAVY_I,
    strong: 'go', weak: 'post', backs: { SL: 'block', RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('shot', 'max-shot', 'cover1', 'zero'),
    tip: 'Eight-man protection off a run look: X post, the TE up the seam.',
  },
  {
    id: 'ace-out-up', name: 'Ace Out and Up', kind: 'pa', formation: ACE,
    strong: 'out-up-seam', weak: 'post', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tags: tags('shot', 'out-and-up', 'cover1', 'man'),
    tip: 'Play action shot: Z sells the out and goes. The TE seam holds the safety.',
  },
  {
    id: 'slip-screen', name: 'TE Slip Screen', kind: 'pass', formation: ACE,
    strong: 'slip', weak: 'go', backs: { RB: 'block' },
    block: 'pass', screen: true, read: 'none', flip: 'field', drop: 1.5,
    tags: tags('screen', 'slip-screen', 'blitz', 'man'),
    tip: 'The TE blocks, then slips out behind the line. Let them rush past him.',
  },
  {
    id: 'sb-quick', name: 'Singleback Quick', kind: 'pass', formation: SINGLEBACK,
    strong: 'slant-flat', weak: 'fade-out', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1,
    tags: tags('quick', 'fade-out', 'cover2', 'man'),
    tip: 'Three-step from under center: fade-out to the twins, slant-flat to the TE.',
  },
  {
    id: 'ace-hitches', name: 'Ace Hitches', kind: 'pass', formation: ACE,
    strong: 'double-hitch', weak: 'double-hitch', backs: { RB: 'checkFlat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1,
    tags: tags('quick', 'double-hitch', 'cover3', 'quarters'),
    tip: 'Base D off the ball? Four hitches at 6 from two tight ends.',
  },
];

export const LEGACY: readonly PlayDef[] = LEGACY_PLAYS;
/** Every play: the library the style books draw from (`data/offStyles.ts`). */
export const PLAYBOOK: PlayDef[] = [...LEGACY_PLAYS, ...BATCH_6];

export function playsOfKind(kind: PlayKind, book: readonly PlayDef[] = PLAYBOOK): PlayDef[] {
  return book.filter((p) => p.kind === kind);
}
