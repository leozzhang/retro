import { describe, expect, it } from 'vitest';
import { buildStaff } from './data/coaches';
import { DEF_CALLS, rushers } from './data/defenses';
import { OFF_STYLES, ocBook, ocIdentity, ocStyle, signatures, STYLES, styleBook, styleOfProfile } from './data/offStyles';
import { LEGACY, PLAYBOOK, ROUTES, type PlayDef, type RouteName } from './data/plays';
import { callCovers, COVER_TAGS, FAMILIES, PLAY_CONCEPTS, STOPS, type Family } from './data/playTags';
import { TEAMS } from './data/teams';
import { featureVector, FEATURE_KEYS, playFeatures } from './game/playFeatures';
import { personnelOf } from './game/resolvePlay';

/**
 * The playbook's rules (docs/PLAYBOOKS.md): every play's hand tags agree with what its data says, and
 * every style book can be played a whole game with.
 */

const RUN_FAMILIES: Family[] = ['insideZone', 'outsideZone', 'gap', 'perimeter', 'read', 'draw', 'qbRun'];
const SIDELINE = new Set<RouteName>(['quickOut', 'deepOut', 'corner', 'fade', 'comeback', 'outUp', 'wheel']);

/** What each family has to look like in the data. Returns why not, or null. */
function familyMismatch(p: PlayDef): string | null {
  const f = playFeatures(p);
  const pass = p.block === 'pass';
  switch (p.tags.family) {
    case 'quick': return pass && !f.screen && p.drop <= 1.5 && p.kind !== 'run' ? null : 'quick: a pass, no screen, drop 1.5 or less';
    case 'dropback': return p.kind === 'pass' && pass && !f.screen && p.drop >= 1.5 ? null : 'dropback: a pass from the pocket, drop 1.5+';
    case 'shot': return pass && f.deep && p.drop >= 2.5 && !f.screen ? null : 'shot: a 25+ yd route, drop 2.5+';
    case 'screen': return p.kind === 'pass' && f.screen ? null : 'screen: a pass with a screen';
    case 'pa': return p.kind === 'pa' && p.read === 'none' && !f.boot && pass ? null : 'pa: play action from the pocket';
    case 'boot': return p.kind === 'pa' && p.read === 'none' && f.boot ? null : 'boot: play action with dropY';
    case 'rpo': return p.read === 'rpo' && p.block === 'run' ? null : 'rpo: read rpo, run blocking';
    case 'insideZone': return p.kind === 'run' && f.run === 'zone' && f.runDir === 'inside' && !f.qbRun ? null : 'insideZone: zone, inside';
    case 'outsideZone': return p.kind === 'run' && f.run === 'stretch' && p.read === 'handoff' ? null : 'outsideZone: stretch, handoff';
    case 'gap': return p.kind === 'run' && (f.run === 'gap' || f.run === 'trap') && p.read === 'handoff' ? null : 'gap: gap or trap, handoff';
    case 'perimeter': return p.kind === 'run' && f.runDir === 'outside' && (p.read === 'handoff' || p.read === 'pitch') ? null : 'perimeter: outside, handoff or pitch';
    case 'read': return p.kind === 'run' && (p.read === 'zoneRead' || p.read === 'option') ? null : 'read: zone read or option';
    case 'qbRun': return p.kind === 'run' && f.qbRun ? null : 'qbRun: a designed QB run';
    case 'draw': return p.kind === 'run' && f.run === 'draw' && !f.qbRun ? null : 'draw: draw blocking, a back carries';
  }
}

describe('playbook tags', () => {
  it('ids are unique, and the legacy book is the original 62', () => {
    expect(new Set(PLAYBOOK.map((p) => p.id)).size).toBe(PLAYBOOK.length);
    expect(LEGACY).toHaveLength(62);
    expect(PLAYBOOK.slice(0, 62)).toEqual([...LEGACY]);
  });

  it('every tag is known, and beats has no repeats', () => {
    for (const p of PLAYBOOK) {
      expect(FAMILIES, p.id).toContain(p.tags.family);
      expect(PLAY_CONCEPTS, p.id).toContain(p.tags.concept);
      for (const b of p.tags.beats) expect(COVER_TAGS, p.id).toContain(b);
      expect(new Set(p.tags.beats).size, p.id).toBe(p.tags.beats.length);
      // What stops it: known looks, and never one it's also tagged to beat.
      for (const s of p.tags.stops) expect(COVER_TAGS, p.id).toContain(s);
      expect(p.tags.stops.filter((s) => p.tags.beats.includes(s)), p.id).toEqual([]);
    }
  });

  it('every concept says what stops it (STOPS), except the sneak', () => {
    for (const c of PLAY_CONCEPTS) if (c !== 'sneak') expect(STOPS[c].length, c).toBeGreaterThan(0);
  });

  it("every play's family agrees with its data", () => {
    const bad = PLAYBOOK.map((p) => [p.id, familyMismatch(p)]).filter(([, why]) => why);
    expect(bad).toEqual([]);
  });

  it('every defensive call maps to its coverage tags', () => {
    for (const c of DEF_CALLS) expect(callCovers(c, rushers(c)).size, c.id).toBeGreaterThan(0);
    const c3 = callCovers(DEF_CALLS.find((c) => c.id === 'c3')!, 4);
    expect([...c3].sort()).toEqual(['cover3']);
    const c0 = callCovers(DEF_CALLS.find((c) => c.id === 'c0-blitz')!, 6);
    expect(c0.has('man') && c0.has('zero') && c0.has('blitz') && c0.has('heavyBox')).toBe(true);
  });

  it('the feature vector is the length of its keys, for every play', () => {
    for (const p of PLAYBOOK) expect(featureVector(p)).toHaveLength(FEATURE_KEYS.length);
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it('features read the backfield and the run off the data', () => {
    const f = (id: string) => playFeatures(PLAYBOOK.find((p) => p.id === id)!);
    expect(f('inside-zone').backfield).toBe('gun');
    expect(f('outside-zone').backfield).toBe('pistol');
    expect(f('power').backfield).toBe('under');
    expect(f('empty-spacing').backfield).toBe('empty');
    expect(f('toss').runDir).toBe('outside');
    expect(f('rpo-glance').run).toBe('zone');
    expect(f('heavy-max').extraBlockers).toBeGreaterThanOrEqual(3);
  });

  it('every route the book runs has a shape', () => {
    for (const p of PLAYBOOK) for (const r of playFeatures(p).routes) expect(ROUTES[r], `${p.id} ${r}`).toBeDefined();
  });
});

describe('style books', () => {
  const built = OFF_STYLES;

  it('every play is in a style book, and every book id is a play', () => {
    const ids = new Set(PLAYBOOK.map((p) => p.id));
    const inBook = new Set(built.flatMap((s) => STYLES[s].book));
    for (const s of built) for (const id of STYLES[s].book) expect(ids.has(id), `${s}: ${id}`).toBe(true);
    // The legacy plays too: nothing in the library is dead weight that no OC can call.
    expect(PLAYBOOK.filter((p) => !inBook.has(p.id)).map((p) => p.id)).toEqual([]);
    for (const s of built) expect(new Set(STYLES[s].book).size, s).toBe(STYLES[s].book.length);
  });

  for (const s of OFF_STYLES) {
    it(`${s}: a whole game's worth of calls`, () => {
      const book = styleBook(s);
      const fam = (f: Family) => book.filter((p) => p.tags.family === f).length;
      expect(book.length).toBeGreaterThanOrEqual(55);
      expect(book.length).toBeLessThanOrEqual(75);
      expect(book.some((p) => p.tags.concept === 'sneak'), 'a sneak').toBe(true);
      expect(book.filter((p) => p.short).length, 'short yardage').toBeGreaterThanOrEqual(2);
      expect(fam('screen'), 'screens').toBeGreaterThanOrEqual(3);
      expect(fam('quick'), 'quick game').toBeGreaterThanOrEqual(4);
      expect(fam('shot'), 'shots').toBeGreaterThanOrEqual(2);
      expect(RUN_FAMILIES.filter((f) => fam(f) > 0).length, 'run families').toBeGreaterThanOrEqual(2);
      expect(book.filter((p) => playFeatures(p).routes.some((r) => SIDELINE.has(r))).length, 'two-minute').toBeGreaterThanOrEqual(4);
    });
  }

  for (const s of built) {
    it(`${s}: personnel inside the style's targets`, () => {
      const book = styleBook(s);
      const share = (g: string) => book.filter((p) => personnelOf(p.formation) === g).length / book.length;
      for (const [g, [lo, hi]] of Object.entries(STYLES[s].personnel)) {
        expect(share(g), `${g} personnel`).toBeGreaterThanOrEqual(lo);
        expect(share(g), `${g} personnel`).toBeLessThanOrEqual(hi);
      }
      const listed = new Set(Object.keys(STYLES[s].personnel));
      expect(book.filter((p) => !listed.has(personnelOf(p.formation))).map((p) => p.id), 'unlisted personnel').toEqual([]);
    });
  }
});

describe('the OC carries the style', () => {
  it("a program's own OC runs its profile's style", () => {
    for (const t of TEAMS.slice(0, 40)) {
      const oc = buildStaff(t).OC;
      expect(ocStyle(oc)).toBe(styleOfProfile(t.profile.offense.scheme, t.profile.offense.qbStyle));
      expect(ocIdentity(oc).scheme).toBe(t.profile.offense.scheme);
    }
  });

  it('a hire keeps his style for life, and hires bring a mix', () => {
    const t = TEAMS[0];
    const ids = Array.from({ length: 60 }, (_, i) => `${t.id}-oc.2026.${i}`);
    const styles = ids.map((id) => ocStyle({ id }));
    expect(styles).toEqual(ids.map((id) => ocStyle({ id })));
    expect(new Set(styles).size).toBeGreaterThanOrEqual(3);
    const own = styleOfProfile(t.profile.offense.scheme, t.profile.offense.qbStyle);
    expect(styles.filter((x) => x === own).length / styles.length).toBeGreaterThan(0.5);
  });

  it("each OC's book is his style's plus a few signature plays", () => {
    const t = TEAMS.find((x) => x.profile.offense.scheme === 'pro')!;
    const oc = buildStaff(t).OC;
    const book = ocBook(oc);
    const sig = signatures(oc);
    expect(sig.length).toBeGreaterThanOrEqual(2);
    expect(sig.length).toBeLessThanOrEqual(3);
    expect(book.length).toBe(styleBook('pro').length + sig.length);
    expect(sig.every((p) => !p.short)).toBe(true);
    expect(ocBook(oc)).toBe(book);
  });
});
