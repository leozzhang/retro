import { clamp, hashString, mulberry32 } from '../engine/math';
import { parseCoachId, type Coach } from './coaches';
import type { OffScheme, QbStyle } from './fbs/profile';
import { PROFILES } from './fbs/profiles';
import { PLAYBOOK, type PlayDef } from './plays';
import type { Family } from './playTags';

/**
 * Offensive styles: each OC runs one, and his style fixes the book you call from (docs/PLAYBOOKS.md).
 * A style is its book, the personnel that book lines up in, and how it likes to call it.
 * Nothing here is stored: an OC's style comes from his id (`ocStyle`), so saves don't change.
 */
export type OffStyle = 'airRaid' | 'spreadRpo' | 'spreadOption' | 'pro' | 'power';
export const OFF_STYLES: OffStyle[] = ['airRaid', 'spreadRpo', 'spreadOption', 'pro', 'power'];

export interface StyleDef {
  name: string;
  /** The style book's play ids. */
  book: string[];
  /** Share of the book's plays in each personnel group, [min, max] (tested; docs/PLAYBOOKS.md). */
  personnel: Record<string, [number, number]>;
  /** Base weight of each family when the CPU calls from this book (key-play replays, and the defense's prior later). */
  calls: Partial<Record<Family, number>>;
  /** Styles whose books its OCs borrow their signature plays from. */
  near: OffStyle[];
}

/** The 47 legacy plays a spread book keeps: everything from the gun, the pistol and empty, plus the sneak and Duo. */
const SPREAD_LEGACY = [
  // pass
  'four-verts', 'slant-flat', 'smash', 'mesh', 'dagger', 'curl-flat', 'double-slant', 'double-hitch', 'stick',
  'trips-outs', 'empty-spacing', 'smoke', 'tunnel-screen', 'rb-screen', 'drive', 'y-cross', 'mills', 'go-post',
  'flood', 'empty-dig-cross', 'corner-out', 'post-wheel', 'snag', 'go-out', 'texas',
  // run
  'inside-zone', 'outside-zone', 'zone-read', 'split-zone', 'counter', 'pin-pull', 'draw', 'qb-draw',
  'power-read', 'qb-power', 'qb-sneak', 'duo',
  // play action and RPO
  'pa-post', 'pa-boot', 'pa-cross', 'rpo-slant', 'rpo-bubble', 'rpo-glance', 'rpo-stick', 'rpo-pop', 'rpo-smoke', 'power-bubble',
];

const PRO_LEGACY = [
  // run
  'power', 'toss', 'i-stretch', 'power-o', 'duo', 'iso', 'trap', 'lead-toss', 'qb-sneak', 'outside-zone',
  'split-zone', 'inside-zone',
  // pass
  'smash', 'stick', 'curl-flat', 'drive', 'y-cross', 'mills', 'go-post', 'flood', 'dagger', 'corner-out',
  'post-wheel', 'ace-stick', 'double-slant', 'smoke', 'rb-screen', 'four-verts', 'slant-flat',
  // play action
  'pa-post', 'pa-boot', 'pa-cross', 'pa-seams', 'i-boot', 'i-deep-cross', 'ace-boot', 'ace-max', 'counter-boot', 'rpo-pop',
];

/**
 * The Air Raid (batch 7): a small dropback book from 2x2 and 3x1, four wide or with the Y. The spread book's
 * passes, a few runs (IZ, the draw, QB runs), a light RPO menu, and its own four-wide sets.
 */
const AIR_RAID = [
  // the spread book's passes
  'four-verts', 'slant-flat', 'smash', 'mesh', 'dagger', 'curl-flat', 'double-slant', 'double-hitch', 'stick',
  'trips-outs', 'empty-spacing', 'smoke', 'tunnel-screen', 'rb-screen', 'drive', 'y-cross', 'mills', 'go-post',
  'flood', 'empty-dig-cross', 'corner-out', 'post-wheel', 'snag', 'go-out', 'texas',
  // runs
  'inside-zone', 'zone-read', 'split-zone', 'counter', 'draw', 'qb-draw', 'qb-power', 'qb-sneak',
  // RPOs and play action
  'rpo-slant', 'rpo-glance', 'rpo-stick', 'rpo-smoke', 'pa-post', 'pa-cross',
  // batch 6
  'bunch-snag', 'bunch-whip', 'fade-out', 'out-up', 'trips-bubble', 'trey-smash', 'rpo-fade',
  // its own: four wide
  'spread-mesh', 'spread-y-cross', 'spread-smash', 'spread-mills', 'spread-texas', 'spread-outs',
  'spread-bubble', 'trips4-y-corner', 'trips4-stick', 'trips4-sail',
];

/**
 * The Spread Option (batch 7): the read game. Zone read from four looks, the speed option, the QB runs and
 * the RPOs, with a thinner dropback menu than the Spread RPO's; split backs (20) for its own.
 */
const SPREAD_OPTION = [
  ...SPREAD_LEGACY.filter((id) => !['mills', 'y-cross', 'empty-dig-cross', 'texas', 'go-out', 'snag', 'duo', 'rpo-pop'].includes(id)),
  'speed-option',
  // batch 6
  'trey-iz', 'trey-counter', 'wing-split-zone', 'qb-counter', 'counter-glance', 'trey-glance', 'wing-pop',
  'rpo-arrow', 'trips-bubble', 'trey-pa-dig', 'fade-out',
  // its own
  'split-zone-read', 'split-iz', 'split-counter', 'split-bubble', 'split-post-wheel', 'pistol-zone-read',
  'trey-zone-read', 'wing-zone-read',
];

/**
 * Power (batch 7): downhill from the I. The pro book's gap runs, play action from the I and max
 * protection, without its wide zone and boots; the Weak I and the wing for its own.
 */
const POWER = [
  ...PRO_LEGACY.filter((id) => !['outside-zone', 'split-zone', 'pa-boot', 'ace-boot', 'counter-boot', 'rpo-pop'].includes(id)),
  'counter', 'trey-duo', 'trey-counter', 'y-leak',
  // the pro book's batch 6
  'pistol-duo', 'ace-counter', 'strong-i-power', 'strong-i-toss', 'heavy-iso', 'heavy-power', 'heavy-max',
  'strong-i-cross', 'slip-screen', 'ace-pa-dig', 'ace-out-up', 'sb-quick', 'ace-hitches',
  // its own
  'weak-i-duo', 'weak-i-pa-cross', 'i-smash', 'wing-duo',
  'wing-pa-cross',
];

export const STYLES: Record<OffStyle, StyleDef> = {
  airRaid: {
    name: 'Air Raid',
    book: AIR_RAID,
    personnel: { 10: [0.1, 0.5], 11: [0.5, 0.9] },
    calls: { quick: 3, dropback: 3, shot: 1.2, screen: 1.5, insideZone: 1.5, draw: 1, rpo: 0.8, pa: 0.4 },
    near: ['spreadRpo'],
  },
  spreadRpo: {
    name: 'Spread RPO',
    book: [
      ...SPREAD_LEGACY,
      'trey-iz', 'trey-duo', 'trey-counter', 'wing-split-zone', 'qb-counter', 'counter-glance', 'rpo-arrow',
      'rpo-fade', 'trey-glance', 'wing-pop', 'trey-smash', 'trey-dagger', 'bunch-snag', 'bunch-whip', 'fade-out',
      'out-up', 'trips-bubble', 'trey-pa-dig', 'pistol-duo',
    ],
    personnel: { 10: [0.02, 0.15], 11: [0.65, 0.95], 12: [0.02, 0.2] },
    calls: { rpo: 3, insideZone: 2, gap: 1.5, quick: 1.5, dropback: 1.2, screen: 1, shot: 0.6, pa: 0.6, read: 0.6, qbRun: 0.4, perimeter: 0.4, draw: 0.4, outsideZone: 0.4, boot: 0.3 },
    near: ['airRaid', 'spreadOption'],
  },
  spreadOption: {
    name: 'Spread Option',
    book: SPREAD_OPTION,
    personnel: { 10: [0, 0.1], 11: [0.6, 0.95], 20: [0.03, 0.2] },
    calls: { read: 3, qbRun: 1.5, insideZone: 1.5, rpo: 2, gap: 1.2, quick: 1, dropback: 0.8, pa: 0.8, screen: 0.6, shot: 0.5 },
    near: ['spreadRpo'],
  },
  pro: {
    name: 'Pro Style',
    book: [
      ...PRO_LEGACY,
      'ace-wide-zone', 'pistol-ace-oz', 'pistol-duo', 'ace-counter', 'strong-i-power', 'strong-i-toss', 'heavy-iso',
      'heavy-power', 'ace-pa-dig', 'strong-i-cross', 'y-leak', 'wing-boot', 'zone-keeper', 'heavy-max',
      'ace-out-up', 'slip-screen', 'sb-quick', 'ace-hitches',
    ],
    personnel: { 11: [0.4, 0.65], 12: [0.18, 0.4], 21: [0.1, 0.3], 22: [0, 0.1] },
    calls: { outsideZone: 2, gap: 2, insideZone: 1.2, pa: 2, boot: 1.2, dropback: 1.5, quick: 1, shot: 0.8, perimeter: 0.6, screen: 0.6, rpo: 0.3 },
    near: ['power', 'spreadRpo'],
  },
  power: {
    name: 'Power',
    book: POWER,
    personnel: { 11: [0.25, 0.55], 12: [0.15, 0.4], 21: [0.15, 0.4], 22: [0.02, 0.15] },
    calls: { gap: 3, insideZone: 1, outsideZone: 1, perimeter: 1, pa: 2, boot: 1, shot: 1, quick: 0.8, dropback: 0.8, screen: 0.4 },
    near: ['pro'],
  },
};

/** A program's style from its profile: the scheme, and for the spread, whether its QB runs. */
export function styleOfProfile(scheme: OffScheme, qb: QbStyle): OffStyle {
  switch (scheme) {
    case 'air-raid': return 'airRaid';
    case 'pro': return 'pro';
    case 'power-run': return 'power';
    case 'option': return 'spreadOption';
    default: return qb === 'pocket' ? 'spreadRpo' : 'spreadOption';
  }
}

/**
 * Hired OCs: `fit` of them run the hiring program's style (programs hire for fit); the rest bring a style
 * drawn from the league's programs, so a candidate pool has a mix. Signature plays: `sigMin` to `sigMax`.
 */
export const OC_STYLE = { fit: 0.6, sigMin: 2, sigMax: 3 };

export interface OcIdentity {
  style: OffStyle;
  /** The profile scheme he runs: the season sim's pass share key (`season/staff.ts`). */
  scheme: OffScheme;
}

const idCache = new Map<string, OcIdentity>();

/**
 * An OC's style, from his id. A program's own coach runs its profile's style; a hire draws his
 * (`OC_STYLE`). He keeps it wherever he goes, like a DC's style. Any coach can be asked: a position
 * coach promoted to OC runs the style of the program that first hired him.
 */
export function ocIdentity(c: Pick<Coach, 'id'>): OcIdentity {
  const hit = idCache.get(c.id);
  if (hit) return hit;
  const p = parseCoachId(c.id);
  let prof = p?.team.profile ?? PROFILES[0];
  if (p && p.year !== undefined) {
    const rng = mulberry32(hashString(`oc-style:${c.id}`));
    if (rng() >= OC_STYLE.fit) prof = PROFILES[Math.floor(rng() * PROFILES.length)];
  }
  const out = { style: styleOfProfile(prof.offense.scheme, prof.offense.qbStyle), scheme: prof.offense.scheme };
  idCache.set(c.id, out);
  return out;
}

export const ocStyle = (c: Pick<Coach, 'id'>): OffStyle => ocIdentity(c).style;

const byId = new Map(PLAYBOOK.map((p) => [p.id, p]));
export const playById = (id: string): PlayDef | undefined => byId.get(id);

const styleCache = new Map<OffStyle, readonly PlayDef[]>();

/** A style's book, in its listed order. */
export function styleBook(s: OffStyle): readonly PlayDef[] {
  let out = styleCache.get(s);
  if (!out) {
    out = STYLES[s].book.map((id) => {
      const p = byId.get(id);
      if (!p) throw new Error(`styleBook: ${s} lists unknown play ${id}`);
      return p;
    });
    styleCache.set(s, out);
  }
  return out;
}

/** Plays in a nearby style's book that his own book doesn't have: where his signature plays come from. */
function signaturePool(s: OffStyle): PlayDef[] {
  const own = new Set(styleBook(s));
  const out: PlayDef[] = [];
  for (const n of STYLES[s].near) for (const p of styleBook(n)) if (!own.has(p) && !out.includes(p) && !p.short) out.push(p);
  return out;
}

const bookCache = new Map<string, readonly PlayDef[]>();

/**
 * The OC's book: his style's book plus a few signature plays from nearby styles, drawn from his id.
 * It's what the user calls from (game/game.ts) and what a CPU team's replays draw from.
 */
export function ocBook(c: Pick<Coach, 'id'>): readonly PlayDef[] {
  const hit = bookCache.get(c.id);
  if (hit) return hit;
  const s = ocStyle(c);
  const base = styleBook(s);
  const pool = signaturePool(s);
  const rng = mulberry32(hashString(`oc-book:${c.id}`));
  const n = Math.min(pool.length, OC_STYLE.sigMin + Math.floor(rng() * (OC_STYLE.sigMax - OC_STYLE.sigMin + 1)));
  const sig: PlayDef[] = [];
  while (sig.length < n) {
    const p = pool[Math.floor(rng() * pool.length)];
    if (!sig.includes(p)) sig.push(p);
  }
  // Library order, so the call screen's pages read like the book's.
  const set = new Set([...base, ...sig]);
  const out = PLAYBOOK.filter((p) => set.has(p));
  bookCache.set(c.id, out);
  return out;
}

/** The plays in his book that his style's book doesn't have. */
export function signatures(c: Pick<Coach, 'id'>): PlayDef[] {
  const base = new Set(styleBook(ocStyle(c)));
  return ocBook(c).filter((p) => !base.has(p));
}

/**
 * How the CPU weighs a family by the situation, on top of the style's `calls`: third and long throws
 * downfield, short yardage runs at people, the two-minute drill gets out of bounds.
 */
export const CALL_SITUATION: Record<'normal' | 'long' | 'short' | 'hurry', Partial<Record<Family, number>>> = {
  normal: {},
  long: { dropback: 1.6, shot: 1.4, quick: 1.2, screen: 1.3, draw: 1.5, insideZone: 0.4, outsideZone: 0.4, gap: 0.4, perimeter: 0.4, read: 0.5, rpo: 0.5, pa: 0.6, boot: 0.6, qbRun: 0.5 },
  short: { gap: 1.8, qbRun: 1.8, insideZone: 1.4, read: 1.3, rpo: 1.2, quick: 0.8, shot: 0.4, screen: 0.5, dropback: 0.5, draw: 0.5 },
  hurry: { quick: 1.5, dropback: 1.4, shot: 1.2, screen: 1.1, insideZone: 0.5, outsideZone: 0.5, gap: 0.4, perimeter: 0.5, read: 0.5, pa: 0.4, boot: 0.4, rpo: 0.8, draw: 0.6, qbRun: 0.5 },
};

/** A family's call weight in this style and situation. */
export function callWeight(s: OffStyle, f: Family, sit: keyof typeof CALL_SITUATION = 'normal'): number {
  return clamp((STYLES[s].calls[f] ?? 0.2) * (CALL_SITUATION[sit][f] ?? 1), 0, 10);
}
