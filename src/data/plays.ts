import type { OffSlot } from './teams';

/** dx = yards relative to the line of scrimmage (negative = backfield). y is absolute, or relative to the ball. */
export interface Align {
  dx: number;
  y: number;
  mode: 'abs' | 'rel';
}

export interface Formation {
  name: string;
  align: Record<OffSlot, Align>;
}

export type RouteName =
  | 'go' | 'seam' | 'slant' | 'out' | 'in' | 'post' | 'corner' | 'curl' | 'hitch'
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
 * A back lined up on the ball counts +y as inside, so run paths from the
 * pistol and singleback go to the right (the TE side).
 * `cont` = keep running along the final leg after the last waypoint.
 */
export const ROUTES: Record<RouteName, RouteDef> = {
  go: { pts: [[45, 0]], cont: true },
  seam: { pts: [[4, 0.5], [45, 1.5]], cont: true },
  slant: { pts: [[2, 0], [8, 6]], cont: true },
  out: { pts: [[10, 0], [10.5, -12]], cont: true },
  in: { pts: [[12, 0], [12.5, 14]], cont: true },
  post: { pts: [[12, 0], [35, 10]], cont: true },
  corner: { pts: [[12, 0], [30, -11]], cont: true },
  curl: { pts: [[12, 0], [10.5, 1.5]], cont: false },
  hitch: { pts: [[6, 0], [5, 0.5]], cont: false },
  comeback: { pts: [[15, 0], [13, -3]], cont: false },
  flat: { pts: [[2, -3], [4, -12]], cont: true },
  drag: { pts: [[2, 1], [3, 18]], cont: true },
  wheel: { pts: [[1.5, -5], [6, -10], [30, -11]], cont: true },
  swing: { pts: [[-1, -4], [2, -10]], cont: true },
  bubble: { pts: [[-1.5, -2], [-1, -6]], cont: true },
  block: { pts: [], cont: false },
  // Gun: cross in front of the QB (mesh), then the playside B gap.
  iz: { pts: [[0.7, 1.6], [3.8, 3.4], [7, 3.8]], cont: true, run: true },
  // Pistol: mesh, then stretch outside the tight end.
  oz: { pts: [[2.2, 1.2], [5, 6], [8, 8]], cont: true, run: true },
  // Singleback: downhill off the tight end's hip.
  power: { pts: [[3, 1], [6.3, 3.0], [9, 3.4]], cont: true, run: true },
  // Singleback: sprint wide right away; the QB pitches it.
  toss: { pts: [[1, 6], [4, 11], [8, 12.5]], cont: true, run: true },
  paFake: { pts: [[0.7, 1.6], [2.5, 3.2]], cont: false, thenBlock: true },
};

const OL_ALIGN = {
  LT: { dx: -0.6, y: -2.4, mode: 'rel' },
  LG: { dx: -0.6, y: -1.2, mode: 'rel' },
  C: { dx: -0.5, y: 0, mode: 'rel' },
  RG: { dx: -0.6, y: 1.2, mode: 'rel' },
  RT: { dx: -0.6, y: 2.4, mode: 'rel' },
} as const;

export const GUN_DOUBLES: Formation = {
  name: 'Gun Doubles',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: 6, mode: 'abs' },
    SL: { dx: -1.5, y: 14, mode: 'abs' },
    TE: { dx: -0.8, y: 3.8, mode: 'rel' },
    Z: { dx: -1.5, y: 47.3, mode: 'abs' },
  },
};

export const GUN_TRIPS: Formation = {
  name: 'Gun Trips Rt',
  align: {
    ...OL_ALIGN,
    QB: { dx: -5, y: 0, mode: 'rel' },
    RB: { dx: -5, y: -1.6, mode: 'rel' },
    X: { dx: -0.6, y: 6, mode: 'abs' },
    TE: { dx: -0.8, y: 3.8, mode: 'rel' },
    SL: { dx: -1.5, y: 39.5, mode: 'abs' },
    Z: { dx: -0.6, y: 47.3, mode: 'abs' },
  },
};

export const PISTOL: Formation = {
  name: 'Pistol',
  align: {
    ...OL_ALIGN,
    QB: { dx: -4, y: 0, mode: 'rel' },
    RB: { dx: -7, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: 6, mode: 'abs' },
    SL: { dx: -1.5, y: 14, mode: 'abs' },
    TE: { dx: -0.8, y: 3.8, mode: 'rel' },
    Z: { dx: -1.5, y: 47.3, mode: 'abs' },
  },
};

export const SINGLEBACK: Formation = {
  name: 'Singleback',
  align: {
    ...OL_ALIGN,
    QB: { dx: -1.1, y: 0, mode: 'rel' },
    RB: { dx: -6.5, y: 0, mode: 'rel' },
    X: { dx: -0.6, y: 6, mode: 'abs' },
    SL: { dx: -1.5, y: 14, mode: 'abs' },
    TE: { dx: -0.8, y: 3.8, mode: 'rel' },
    Z: { dx: -1.5, y: 47.3, mode: 'abs' },
  },
};

/** Playbook tab. */
export type PlayKind = 'pass' | 'run' | 'pa';

export const PLAY_TABS: { kind: PlayKind; label: string }[] = [
  { kind: 'pass', label: 'PASS' },
  { kind: 'run', label: 'RUN' },
  { kind: 'pa', label: 'PLAY ACTION' },
];

export interface PlayDef {
  id: string;
  name: string;
  kind: PlayKind;
  formation: Formation;
  routes: Partial<Record<OffSlot, RouteName>>;
  /** OL scheme: pass sets, or firing off the ball to drive block. */
  block: 'pass' | 'run';
  /** QB drop (yards back from his alignment); on runs this is the mesh point. */
  drop: number;
  /** Sideways QB drift on the drop (+ = toward the near sideline), for bootlegs. */
  dropY?: number;
  tip: string;
}

const RUN_BLOCK = { X: 'block', SL: 'block', TE: 'block', Z: 'block' } as const;

// The full playbook system will grow from this data format.
export const PLAYBOOK: PlayDef[] = [
  // ---------------------------------------------------------------- pass
  {
    id: 'four-verts', name: 'Four Verts', kind: 'pass', block: 'pass', formation: GUN_DOUBLES, drop: 2.5,
    routes: { X: 'go', SL: 'seam', TE: 'seam', Z: 'go', RB: 'flat' },
    tip: 'Beats single-high. Hit the seam.',
  },
  {
    id: 'slant-flat', name: 'Slant Flat', kind: 'pass', block: 'pass', formation: GUN_DOUBLES, drop: 1,
    routes: { X: 'slant', SL: 'flat', Z: 'slant', TE: 'drag', RB: 'block' },
    tip: 'Quick game vs press man.',
  },
  {
    id: 'smash', name: 'Smash', kind: 'pass', block: 'pass', formation: GUN_DOUBLES, drop: 2,
    routes: { X: 'hitch', SL: 'corner', Z: 'hitch', TE: 'corner', RB: 'flat' },
    tip: 'Corner over the top of Cover 2.',
  },
  {
    id: 'mesh', name: 'Mesh', kind: 'pass', block: 'pass', formation: GUN_TRIPS, drop: 1.5,
    routes: { X: 'drag', SL: 'drag', Z: 'corner', TE: 'curl', RB: 'flat' },
    tip: 'Crossers rub man coverage.',
  },
  {
    id: 'dagger', name: 'Dagger', kind: 'pass', block: 'pass', formation: GUN_TRIPS, drop: 2.5,
    routes: { X: 'post', SL: 'seam', Z: 'in', TE: 'flat', RB: 'block' },
    tip: 'Seam clears, dig sits behind.',
  },
  {
    id: 'curl-flat', name: 'Curl Flat', kind: 'pass', block: 'pass', formation: GUN_TRIPS, drop: 2,
    routes: { X: 'curl', SL: 'flat', Z: 'curl', TE: 'seam', RB: 'block' },
    tip: 'Safe completions vs off coverage.',
  },

  // ---------------------------------------------------------------- run
  {
    id: 'inside-zone', name: 'Inside Zone', kind: 'run', block: 'run', formation: GUN_DOUBLES, drop: 0.5,
    routes: { ...RUN_BLOCK, RB: 'iz' },
    tip: 'R-click at the mesh. Find the B gap.',
  },
  {
    id: 'outside-zone', name: 'Outside Zone', kind: 'run', block: 'run', formation: PISTOL, drop: 0.6,
    routes: { ...RUN_BLOCK, RB: 'oz' },
    tip: 'Stretch the edge, cut up behind blocks.',
  },
  {
    id: 'power', name: 'Power', kind: 'run', block: 'run', formation: SINGLEBACK, drop: 2.4,
    routes: { ...RUN_BLOCK, RB: 'power' },
    tip: 'Downhill off tackle. Good in short yardage.',
  },
  {
    id: 'toss', name: 'Toss', kind: 'run', block: 'run', formation: SINGLEBACK, drop: 1,
    routes: { ...RUN_BLOCK, RB: 'toss' },
    tip: 'R-click right away to pitch. Beat them wide.',
  },
  {
    id: 'zone-read', name: 'Zone Read', kind: 'run', block: 'run', formation: GUN_DOUBLES, drop: 0.5,
    routes: { ...RUN_BLOCK, RB: 'iz' },
    tip: 'R-click to give, or keep it and run the QB.',
  },
  {
    id: 'qb-sneak', name: 'QB Sneak', kind: 'run', block: 'run', formation: SINGLEBACK, drop: 0,
    routes: { ...RUN_BLOCK, RB: 'block' },
    tip: 'Short yardage. Hold D and push the pile.',
  },

  // ---------------------------------------------------------------- play action / RPO
  {
    id: 'pa-post', name: 'PA Post', kind: 'pa', block: 'pass', formation: GUN_DOUBLES, drop: 2,
    routes: { X: 'post', SL: 'curl', TE: 'block', Z: 'go', RB: 'paFake' },
    tip: 'Sell the run, hit the post behind the LBs.',
  },
  {
    id: 'pa-boot', name: 'PA Boot Flood', kind: 'pa', block: 'pass', formation: GUN_DOUBLES, drop: 1.5, dropY: -7,
    routes: { X: 'go', SL: 'out', TE: 'drag', Z: 'post', RB: 'paFake' },
    tip: 'Fake right, boot left. Three levels.',
  },
  {
    id: 'pa-cross', name: 'PA Crossers', kind: 'pa', block: 'pass', formation: PISTOL, drop: 2,
    routes: { X: 'in', SL: 'go', TE: 'drag', Z: 'post', RB: 'paFake' },
    tip: 'Dig and drag open up when LBs bite.',
  },
  {
    id: 'pa-seams', name: 'PA Seams', kind: 'pa', block: 'pass', formation: SINGLEBACK, drop: 3,
    routes: { X: 'go', SL: 'seam', TE: 'seam', Z: 'comeback', RB: 'paFake' },
    tip: 'Hold the safeties with the fake.',
  },
  {
    id: 'rpo-slant', name: 'RPO Slant', kind: 'pa', block: 'run', formation: GUN_DOUBLES, drop: 0.5,
    routes: { ...RUN_BLOCK, X: 'slant', RB: 'iz' },
    tip: 'R-click to give, or pull and throw the slant.',
  },
  {
    id: 'rpo-bubble', name: 'RPO Bubble', kind: 'pa', block: 'run', formation: GUN_TRIPS, drop: 0.5,
    routes: { ...RUN_BLOCK, SL: 'bubble', RB: 'iz' },
    tip: 'Numbers outside? Throw the bubble.',
  },
];

export function playsOfKind(kind: PlayKind): PlayDef[] {
  return PLAYBOOK.filter((p) => p.kind === kind);
}
