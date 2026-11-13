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
  'snag', 'go-out', 'texas', 'y-corner',
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
  /** The looks that should stop it (`STOPS`, by concept): the other half of where it works. */
  stops: CoverTag[];
}

/**
 * What stops each concept: the looks it should do worse against than its peers do (the film room's
 * `STOP MISS`, and the SITUATIONS spread between its `beats` and its `stops`; docs/PLAYBOOKS.md). A
 * concept with no answer in coaching literature has none here (the sneak). Kept apart from `beats` because
 * the answer is a property of the concept: Smash is beaten by quarters from every formation it's run from.
 */
export const STOPS: Record<PlayConcept, CoverTag[]> = {
  // Quick game: a hard (cover 2) corner sits on the flat and the hitch, the hooks wall the slants.
  'slant-flat': ['cover2'], 'double-slant': ['cover2'], 'double-hitch': ['cover2', 'man'], stick: ['cover2'],
  outs: ['cover2'], spacing: ['man'], 'fade-out': ['cover2'], whip: ['cover2'],
  // Dropback: the zone beaters lose to man, the man beaters to zone; Smash to quarters' corner carrying the
  // corner route, the dig and the crossers to the Tampa middle, the post off the single-high safety.
  smash: ['quarters'], mesh: ['cover2'], dagger: ['cover2'], 'curl-flat': ['man'], drive: ['cover2'],
  'y-cross': ['cover2'], mills: ['cover3', 'cover1'], flood: ['man'], 'dig-cross': ['cover2'],
  'corner-out': ['quarters'], snag: ['man'], 'go-out': ['cover2'], texas: ['cover2'],
  // Y-Corner high-lows the flat defender; the quarters safety on #3 carries the corner.
  'y-corner': ['quarters'],
  // Shots: four deep defenders match the verticals.
  'four-verts': ['quarters'], 'go-post': ['quarters'], 'post-wheel': ['quarters'], 'max-shot': ['quarters'],
  'out-and-up': ['cover3'],
  // Screens: the hard corner and the rolled-up flat defender are on top of the throw.
  smoke: ['cover2'], tunnel: ['cover2'], 'rb-screen': ['cover2'], 'slip-screen': ['cover2'], bubble: ['cover2'],
  // Play action wants a single-high, run-fitting defense: two deep safeties who don't bite take the shot
  // away (quarters' safeties read the run, Cover 2's stay deep). The boot's flood is a Cover 2 problem:
  // the cloud corner sits on the flat and the half safety is over the corner route.
  'pa-post': ['quarters'], 'pa-crossers': ['quarters'], 'pa-seams': ['quarters'], 'deep-cross': ['quarters'],
  'pa-dig': ['cover2'], 'y-leak': ['quarters'], 'boot-flood': ['cover2'], 'counter-boot': ['cover2'], keeper: ['cover2'],
  // RPOs: the pull answers the box, so the look that stops one is the coverage its throw can't beat.
  'rpo-slant': ['cover2'], 'rpo-bubble': ['cover2'], 'rpo-glance': ['quarters'], 'rpo-stick': ['cover2'],
  'rpo-pop': ['quarters'], 'rpo-smoke': ['cover2'], 'rpo-arrow': ['cover2'], 'rpo-fade': ['cover2'],
  // Runs: a loaded box, and for the slow-developing and perimeter runs, penetration (the blitz).
  'inside-zone': ['heavyBox'], 'split-zone': ['heavyBox'], 'outside-zone': ['blitz'], power: ['heavyBox'],
  counter: ['blitz', 'heavyBox'], duo: ['heavyBox'], iso: ['heavyBox'], trap: ['heavyBox'], toss: ['blitz'],
  'pin-pull': ['blitz'], draw: ['heavyBox'], 'zone-read': ['heavyBox'], 'power-read': ['blitz', 'heavyBox'],
  'speed-option': ['heavyBox'], 'qb-draw': ['heavyBox'], 'qb-power': ['heavyBox'], 'qb-counter': ['blitz', 'heavyBox'],
  sneak: [],
};

/** Shorthand for the playbook's entries; what stops it comes from its concept (`STOPS`). */
export const tags = (family: Family, concept: PlayConcept, ...beats: CoverTag[]): PlayTags => ({
  family, concept, beats, stops: STOPS[concept].filter((t) => !beats.includes(t)),
});

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
