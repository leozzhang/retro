import type { RouteName } from './plays';

/** Receiver number on one side, counted from the sideline in (1 = widest). */
export type RecNum = 1 | 2 | 3;

export interface Concept {
  name: string;
  routes: Partial<Record<RecNum, RouteName>>;
}

/**
 * Route combos for one side of the formation. A play puts one on the strong
 * side and one on the weak side; receivers a concept doesn't reach block.
 * Routes are inside-relative, so a concept works from either side.
 */
export const CONCEPTS = {
  verts: { name: 'Verts', routes: { 1: 'go', 2: 'seam', 3: 'seam' } },
  smash: { name: 'Smash', routes: { 1: 'hitch', 2: 'corner' } },
  'slant-flat': { name: 'Slant Flat', routes: { 1: 'slant', 2: 'flat' } },
  'slant-drag': { name: 'Slant Drag', routes: { 1: 'slant', 2: 'drag' } },
  mesh: { name: 'Mesh', routes: { 1: 'corner', 2: 'drag', 3: 'curl' } },
  dagger: { name: 'Dagger', routes: { 1: 'in', 2: 'seam', 3: 'flat' } },
  'curl-flat': { name: 'Curl Flat', routes: { 1: 'curl', 2: 'flat', 3: 'seam' } },
  'post-curl': { name: 'Post Curl', routes: { 1: 'post', 2: 'curl' } },
  'go-out': { name: 'Go Out', routes: { 1: 'go', 2: 'deepOut' } },
  'post-drag': { name: 'Post Drag', routes: { 1: 'post', 2: 'drag' } },
  'in-go': { name: 'Dig Go', routes: { 1: 'in', 2: 'go' } },
  'comeback-seam': { name: 'Comeback Seam', routes: { 1: 'comeback', 2: 'seam' } },
  bubble: { name: 'Bubble', routes: { 2: 'bubble' } },
  // Common NFL same-side pairs (analysis/out/concepts.md): #1/#2 by receiver number.
  'double-hitch': { name: 'Double Hitch', routes: { 1: 'hitch', 2: 'hitch' } },
  'double-slant': { name: 'Double Slant', routes: { 1: 'slant', 2: 'slant' } },
  'go-post': { name: 'Go Post', routes: { 1: 'go', 2: 'post' } },
  'go-hitch': { name: 'Go Hitch', routes: { 1: 'go', 2: 'hitch' } },
  'in-cross': { name: 'Dig Cross', routes: { 1: 'in', 2: 'cross', 3: 'hitch' } },
  // Standard concepts
  stick: { name: 'Stick', routes: { 1: 'go', 2: 'hitch', 3: 'flat' } },
  flood: { name: 'Flood', routes: { 1: 'go', 2: 'deepOut', 3: 'flat' } },
  drive: { name: 'Drive', routes: { 1: 'in', 2: 'drag' } },
  mills: { name: 'Mills', routes: { 1: 'in', 2: 'post' } },
  'cross-go': { name: 'Y-Cross', routes: { 1: 'go', 2: 'cross' } },
  'double-out': { name: 'Double Out', routes: { 1: 'quickOut', 2: 'quickOut', 3: 'seam' } },
  // Trips outs: #1 clears the corner deep, #2 and #3 run outs under him (the Cover 3 beater).
  'clear-outs': { name: 'Clear Outs', routes: { 1: 'go', 2: 'quickOut', 3: 'quickOut' } },
  'corner-out': { name: 'Corner Out', routes: { 1: 'corner', 2: 'quickOut' } },
  spacing: { name: 'Spacing', routes: { 1: 'slant', 2: 'hitch', 3: 'quickOut' } },
  // Screens: the receivers a screen doesn't reach stalk-block
  smoke: { name: 'Smoke', routes: { 1: 'smoke' } },
  tunnel: { name: 'Tunnel', routes: { 1: 'tunnel' } },
  // Play action from under center: crossers and corners (NFL I-Form / Singleback route mix)
  'post-cross': { name: 'Post Cross', routes: { 1: 'post', 2: 'cross' } },
  'cross-corner': { name: 'Cross Corner', routes: { 1: 'cross', 2: 'corner' } },
  'cross-drag': { name: 'Cross Drag', routes: { 1: 'cross', 2: 'drag' } },
  'go-corner': { name: 'Go Corner', routes: { 1: 'go', 2: 'corner' } },
  'corner-flat': { name: 'Corner Flat', routes: { 1: 'corner', 2: 'flat' } },
  snag: { name: 'Snag', routes: { 1: 'go', 2: 'corner', 3: 'hitch' } },
  // RPO tag: the #2 (TE) pops up the seam
  pop: { name: 'Pop', routes: { 2: 'seam' } },
  // Runs: the inline TE (#2) slices back across to kick out the backside end (split zone)
  slice: { name: 'Slice', routes: { 2: 'slice' } },
  // Runs: the inline TE (#2) arcs around the read end for the force player (power read)
  arc: { name: 'Arc', routes: { 2: 'arc' } },
  // Batch 6 (docs/PLAYBOOKS.md)
  'fade-out': { name: 'Fade Out', routes: { 1: 'fade', 2: 'quickOut' } },
  // Classic snag from a bunch: corner outside, snag on the point, flat inside.
  'snag-flat': { name: 'Snag Flat', routes: { 1: 'corner', 2: 'hitch', 3: 'flat' } },
  'whip-go': { name: 'Whip', routes: { 1: 'go', 2: 'whip', 3: 'drag' } },
  'out-up-seam': { name: 'Out-and-Up Seam', routes: { 1: 'outUp', 2: 'seam' } },
  'pa-dig': { name: 'PA Dig', routes: { 1: 'in', 2: 'post', 3: 'seam' } },
  'go-flat': { name: 'Go Flat', routes: { 1: 'go', 2: 'flat' } },
  'go-leak': { name: 'Go Leak', routes: { 1: 'go', 2: 'leak' } },
  // RPO tag: the slot's arrow to the flat
  arrow: { name: 'Arrow', routes: { 2: 'arrow' } },
  // Screen: the #2 (TE) slips out behind the line
  slip: { name: 'Slip', routes: { 2: 'slip' } },
  // Batch 7: the Air Raid's Y-Corner from trips: #1 clears, #2 arrows to the flat, #3 (Y) runs the corner over it.
  'y-corner': { name: 'Y-Corner', routes: { 1: 'go', 2: 'arrow', 3: 'corner' } },
  // Backside solo tags
  fade: { name: 'Fade', routes: { 1: 'fade' } },
  go: { name: 'Go', routes: { 1: 'go' } },
  post: { name: 'Post', routes: { 1: 'post' } },
  curl: { name: 'Curl', routes: { 1: 'curl' } },
  drag: { name: 'Drag', routes: { 1: 'drag' } },
  slant: { name: 'Slant', routes: { 1: 'slant' } },
  hitch: { name: 'Hitch', routes: { 1: 'hitch' } },
  glance: { name: 'Glance', routes: { 1: 'glance' } },
  corner: { name: 'Corner', routes: { 1: 'corner' } },
} satisfies Record<string, Concept>;

export type ConceptId = keyof typeof CONCEPTS;
