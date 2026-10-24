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
  // Backside solo tags
  go: { name: 'Go', routes: { 1: 'go' } },
  post: { name: 'Post', routes: { 1: 'post' } },
  curl: { name: 'Curl', routes: { 1: 'curl' } },
  drag: { name: 'Drag', routes: { 1: 'drag' } },
  slant: { name: 'Slant', routes: { 1: 'slant' } },
} satisfies Record<string, Concept>;

export type ConceptId = keyof typeof CONCEPTS;
