import type { ConceptId } from './concepts';
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
  // RB run paths and play-action fakes
  | 'iz' | 'oz' | 'power' | 'toss' | 'paFake';

export interface RouteDef {
  pts: [number, number][];
  cont: boolean;
  /** Pass-block once the route is finished (play-action fakes). */
  thenBlock?: boolean;
  /** RB run path: drawn bold on play cards, and its last point marks the hole. */
  run?: boolean;
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
  go: { pts: [[18, -4.8], [45, -5.5]], cont: true },
  seam: { pts: [[4, 0.5], [45, 1.5]], cont: true },
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
  swing: { pts: [[-1, -4], [2, -10]], cont: true },
  bubble: { pts: [[-1.5, -2], [-1, -6]], cont: true },
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

// Personnel formations: no plays use these yet.

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

export const FORMATIONS: Formation[] = [GUN_DOUBLES, GUN_TRIPS, PISTOL, SINGLEBACK, I_FORM, ACE, EMPTY];

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
  | 'zoneRead' // give, or keep off the backside end
  | 'rpo'; // give, or pull and throw the tagged route

/** Auto-mirror at the snap: keep as drawn, or put the strong side to the wide (field) or short (boundary) side. */
export type FlipRule = 'fixed' | 'field' | 'boundary';

export interface Pull {
  who: OffSlot;
  /** 'kick' = block the first defender outside the hole out; 'lead' = turn up through the hole for a backer. */
  job: 'kick' | 'lead';
}

export interface BlockScheme {
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
  /** Designed QB carry: no handoff option, and it's left out of RB run stats. */
  qbRun?: boolean;
  flip: FlipRule;
  /** QB drop (yards back from his alignment); on runs this is the mesh point. */
  drop: number;
  /** Sideways QB drift on the drop (+ = toward the near sideline), for bootlegs. Mirrors with the play. */
  dropY?: number;
  tip: string;
}

export const PLAYBOOK: PlayDef[] = [
  // ---------------------------------------------------------------- pass
  {
    id: 'four-verts', name: 'Four Verts', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'verts', weak: 'verts', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tip: 'Beats single-high. Hit the seam.',
  },
  {
    id: 'slant-flat', name: 'Slant Flat', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'slant-drag', weak: 'slant-flat', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1,
    tip: 'Quick game vs press man.',
  },
  {
    id: 'smash', name: 'Smash', kind: 'pass', formation: GUN_DOUBLES,
    strong: 'smash', weak: 'smash', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tip: 'Corner over the top of Cover 2.',
  },
  {
    id: 'mesh', name: 'Mesh', kind: 'pass', formation: GUN_TRIPS,
    strong: 'mesh', weak: 'drag', backs: { RB: 'flat' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1.5,
    tip: 'Crossers rub man coverage.',
  },
  {
    id: 'dagger', name: 'Dagger', kind: 'pass', formation: GUN_TRIPS,
    strong: 'dagger', weak: 'post', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2.5,
    tip: 'Seam clears, dig sits behind.',
  },
  {
    id: 'curl-flat', name: 'Curl Flat', kind: 'pass', formation: GUN_TRIPS,
    strong: 'curl-flat', weak: 'curl', backs: { RB: 'block' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tip: 'Safe completions vs off coverage.',
  },

  // ---------------------------------------------------------------- run
  {
    id: 'inside-zone', name: 'Inside Zone', kind: 'run', formation: GUN_DOUBLES,
    backs: { RB: 'iz' }, block: 'run', read: 'handoff', flip: 'fixed', drop: 0.5,
    tip: 'R-click at the mesh. Find the B gap.',
  },
  {
    id: 'outside-zone', name: 'Outside Zone', kind: 'run', formation: PISTOL,
    backs: { RB: 'oz' }, block: 'run', read: 'handoff', flip: 'fixed', drop: 0.6,
    tip: 'Stretch the edge, cut up behind blocks.',
  },
  {
    id: 'power', name: 'Power', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'power' }, block: 'run', scheme: { pulls: [{ who: 'LG', job: 'lead' }] },
    read: 'handoff', flip: 'fixed', drop: 2.4,
    tip: 'Downhill off tackle. Good in short yardage.',
  },
  {
    id: 'toss', name: 'Toss', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'toss' }, block: 'run', read: 'pitch', flip: 'fixed', drop: 1,
    tip: 'R-click right away to pitch. Beat them wide.',
  },
  {
    id: 'zone-read', name: 'Zone Read', kind: 'run', formation: GUN_DOUBLES,
    backs: { RB: 'iz' }, block: 'run', read: 'zoneRead', flip: 'fixed', drop: 0.5,
    tip: 'R-click to give, or keep it and run the QB.',
  },
  {
    id: 'qb-sneak', name: 'QB Sneak', kind: 'run', formation: SINGLEBACK,
    backs: { RB: 'block' }, block: 'run', read: 'none', qbRun: true, flip: 'fixed', drop: 0,
    tip: 'Short yardage. Hold D and push the pile.',
  },

  // ---------------------------------------------------------------- play action / RPO
  {
    id: 'pa-post', name: 'PA Post', kind: 'pa', formation: GUN_DOUBLES,
    strong: 'go', weak: 'post-curl', backs: { RB: 'paFake' }, // TE stays in to block
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tip: 'Sell the run, hit the post behind the LBs.',
  },
  {
    id: 'pa-boot', name: 'PA Boot Flood', kind: 'pa', formation: GUN_DOUBLES,
    strong: 'post-drag', weak: 'go-out', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 1.5, dropY: -7,
    tip: 'Fake right, boot left. Three levels.',
  },
  {
    id: 'pa-cross', name: 'PA Crossers', kind: 'pa', formation: PISTOL,
    strong: 'post-drag', weak: 'in-go', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 2,
    tip: 'Dig and drag open up when LBs bite.',
  },
  {
    id: 'pa-seams', name: 'PA Seams', kind: 'pa', formation: SINGLEBACK,
    strong: 'comeback-seam', weak: 'verts', backs: { RB: 'paFake' },
    block: 'pass', read: 'none', flip: 'fixed', drop: 3,
    tip: 'Hold the safeties with the fake.',
  },
  {
    id: 'rpo-slant', name: 'RPO Slant', kind: 'pa', formation: GUN_DOUBLES,
    weak: 'slant', backs: { RB: 'iz' },
    block: 'run', read: 'rpo', flip: 'fixed', drop: 0.5,
    tip: 'R-click to give, or pull and throw the slant.',
  },
  {
    id: 'rpo-bubble', name: 'RPO Bubble', kind: 'pa', formation: GUN_TRIPS,
    strong: 'bubble', backs: { RB: 'iz' },
    block: 'run', read: 'rpo', flip: 'fixed', drop: 0.5,
    tip: 'Numbers outside? Throw the bubble.',
  },
];

export function playsOfKind(kind: PlayKind): PlayDef[] {
  return PLAYBOOK.filter((p) => p.kind === kind);
}
