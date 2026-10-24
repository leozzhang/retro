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
  | 'comeback' | 'flat' | 'drag' | 'wheel' | 'swing' | 'block';

/**
 * Route waypoints as [downfield, inside] yards from the player's alignment.
 * "Inside" points toward the ball, so the same route works from either side.
 * `cont` = keep running along the final leg after the last waypoint.
 */
export const ROUTES: Record<RouteName, { pts: [number, number][]; cont: boolean }> = {
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
  block: { pts: [], cont: false },
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

export interface PlayDef {
  id: string;
  name: string;
  formation: Formation;
  routes: Partial<Record<OffSlot, RouteName>>;
  /** Extra QB drop (yards) from the shotgun alignment. */
  drop: number;
  tip: string;
}

// Seed playbook. The full playbook system will grow from this data format.
export const PLAYBOOK: PlayDef[] = [
  {
    id: 'four-verts', name: 'Four Verts', formation: GUN_DOUBLES, drop: 2.5,
    routes: { X: 'go', SL: 'seam', TE: 'seam', Z: 'go', RB: 'flat' },
    tip: 'Beats single-high. Hit the seam.',
  },
  {
    id: 'slant-flat', name: 'Slant Flat', formation: GUN_DOUBLES, drop: 1,
    routes: { X: 'slant', SL: 'flat', Z: 'slant', TE: 'drag', RB: 'block' },
    tip: 'Quick game vs press man.',
  },
  {
    id: 'smash', name: 'Smash', formation: GUN_DOUBLES, drop: 2,
    routes: { X: 'hitch', SL: 'corner', Z: 'hitch', TE: 'corner', RB: 'flat' },
    tip: 'Corner over the top of Cover 2.',
  },
  {
    id: 'mesh', name: 'Mesh', formation: GUN_TRIPS, drop: 1.5,
    routes: { X: 'drag', SL: 'drag', Z: 'corner', TE: 'curl', RB: 'flat' },
    tip: 'Crossers rub man coverage.',
  },
  {
    id: 'dagger', name: 'Dagger', formation: GUN_TRIPS, drop: 2.5,
    routes: { X: 'post', SL: 'seam', Z: 'in', TE: 'flat', RB: 'block' },
    tip: 'Seam clears, dig sits behind.',
  },
  {
    id: 'curl-flat', name: 'Curl Flat', formation: GUN_TRIPS, drop: 2,
    routes: { X: 'curl', SL: 'flat', Z: 'curl', TE: 'seam', RB: 'block' },
    tip: 'Safe completions vs off coverage.',
  },
];
