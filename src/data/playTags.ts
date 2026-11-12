import type { DefCall } from './defenses';

/**
 * Every play's hand tags: what a coach would call it. They're the features the learning defense keys on
 * (docs/PLAYBOOKS.md), next to the features derived from the play's data (`game/playFeatures.ts`), and
 * the validation test (`src/playbook.test.ts`) holds each tag to that data.
 *
 * - `family`: the coarse key, about what the defense has to stop. The ML's top backoff level.
 * - `concept`: the named concept, shared across formations (Stick from Trips, from Ace, from the RPO).
 * - `beats`: the looks coaching literature says the concept attacks. The film room checks it
 *   (`TAG MISS`): the play should do better against them than its peers do.
 */
export const FAMILIES = [
  // passes
  'quick', // 3-step or shorter: hitches, slants, outs, stick
  'dropback', // a progression from the pocket: smash, dagger, mesh, flood
  'shot', // a deep shot, held for: four verts, go-post, max protect
  'screen', // behind the line: smoke, tunnel, the RB screen
  'pa', // play action from the pocket
  'boot', // play action with the QB on the move
  'rpo', // a run with a pass tagged on
  // runs
  'insideZone', // zone between the tackles: IZ, split zone
  'outsideZone', // stretch: OZ, wide zone
  'gap', // down blocks and pullers: power, counter, duo, iso, trap
  'perimeter', // around the edge: toss, sweeps
  'read', // a read on a defender: zone read, power read, the option
  'qbRun', // a designed QB carry: the sneak, QB power, the QB draw
  'draw', // show pass, then run
] as const;
export type Family = (typeof FAMILIES)[number];

export const PASS_FAMILIES: readonly Family[] = ['quick', 'dropback', 'shot', 'screen', 'pa', 'boot', 'rpo'];

/** Named concepts. A concept means the same thing from every formation it's run from. */
export const PLAY_CONCEPTS = [
  // quick game
  'slant-flat', 'double-slant', 'double-hitch', 'stick', 'outs', 'spacing', 'fade-out', 'whip',
  // dropback
  'smash', 'mesh', 'dagger', 'curl-flat', 'drive', 'y-cross', 'mills', 'flood', 'dig-cross', 'corner-out',
  'snag', 'go-out', 'texas',
  // shots
  'four-verts', 'go-post', 'post-wheel', 'max-shot', 'out-and-up',
  // screens
  'smoke', 'tunnel', 'rb-screen', 'slip-screen', 'bubble',
  // play action
  'pa-post', 'pa-crossers', 'pa-seams', 'deep-cross', 'pa-dig', 'y-leak', 'boot-flood', 'counter-boot', 'keeper',
  // RPO tags
  'rpo-slant', 'rpo-bubble', 'rpo-glance', 'rpo-stick', 'rpo-pop', 'rpo-smoke', 'rpo-arrow', 'rpo-fade',
  // runs
  'inside-zone', 'split-zone', 'outside-zone', 'power', 'counter', 'duo', 'iso', 'trap', 'toss', 'pin-pull',
  'draw', 'zone-read', 'power-read', 'speed-option', 'qb-draw', 'qb-power', 'qb-counter', 'sneak',
] as const;
export type PlayConcept = (typeof PLAY_CONCEPTS)[number];

/**
 * What a concept attacks.
 * - Coverages: `man` (any man call), `press` (corners pressed: the identity's, not the call's, so the
 *   film room can't check it), `zero` (no deep safety), `cover1`, `cover2` (two-deep zone, Tampa
 *   included), `cover3`, `quarters`.
 * - The front: `blitz` (5+ rushers), `lightBox` (6 in the box), `heavyBox` (8+).
 */
export const COVER_TAGS = ['man', 'press', 'zero', 'cover1', 'cover2', 'cover3', 'quarters', 'blitz', 'lightBox', 'heavyBox'] as const;
export type CoverTag = (typeof COVER_TAGS)[number];
/** Tags about the front: checked on runs and on passes alike. The rest are about the coverage. */
export const BOX_TAGS: readonly CoverTag[] = ['blitz', 'lightBox', 'heavyBox'];

export interface PlayTags {
  family: Family;
  concept: PlayConcept;
  beats: CoverTag[];
}

/** Shorthand for the playbook's entries. */
export const tags = (family: Family, concept: PlayConcept, ...beats: CoverTag[]): PlayTags => ({ family, concept, beats });

/** The coverage family of each zone call, by id; man calls and the shell come from the call itself. */
const ZONE_COVER: Record<string, CoverTag> = {
  c2: 'cover2', tampa2: 'cover2', c3: 'cover3', 'c3-sky': 'cover3', 'fire-zone': 'cover3', c4: 'quarters',
};

/** The tags a defensive call answers to: its coverage, and its front. */
export function callCovers(c: DefCall, rushers: number): Set<CoverTag> {
  const out = new Set<CoverTag>();
  if (c.coverage === 'man') {
    out.add('man');
    if (c.shell === 'zero') out.add('zero');
    else if (c.shell === 'one-high') out.add('cover1');
  } else {
    const z = ZONE_COVER[c.id];
    if (!z) throw new Error(`callCovers: zone call ${c.id} has no coverage family`);
    out.add(z);
  }
  if (rushers >= 5) out.add('blitz');
  if (c.box <= 6) out.add('lightBox');
  if (c.box >= 8) out.add('heavyBox');
  return out;
}
