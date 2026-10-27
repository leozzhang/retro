import { describe, expect, it } from 'vitest';
import { DEF_CALLS, pickDefCall } from './data/defenses';
import { starters } from './data/depth';
import { defIdentity, defStyle, IDENTITY, situationMix } from './data/identity';
import { PLAYBOOK } from './data/plays';
import { TEAMS, teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { playTraits, scoutReport } from './season/scouting';
import { advanceWeek, defaultConfig, newSeason, userGameThisWeek } from './season/season';
import type { SeasonState } from './season/types';
import { squadFor } from './season/world';

const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const allText = (r: ReturnType<typeof scoutReport>) => r.sections.flatMap((s) => s.items.map((i) => i.text)).join('\n');

describe('defensive identity', () => {
  it('is deterministic, sums to 1 and keeps every call at or above the floor', () => {
    for (const t of TEAMS) {
      const id = defIdentity(t);
      expect(defStyle(t.id)).toBe(id.style);
      const total = Object.values(id.mix).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 9);
      for (const c of DEF_CALLS) {
        expect(id.mix[c.id]).toBeGreaterThanOrEqual(IDENTITY.floor - 1e-9);
        expect(situationMix(id, 3, 10)[c.id]).toBeGreaterThanOrEqual(IDENTITY.floor - 1e-9);
      }
      for (const p of Object.values(id.press)) expect(p).toBeGreaterThan(0);
    }
  });

  it('averages the old fixed weights across FBS, so the league plays the same defense overall', () => {
    for (const c of DEF_CALLS) {
      const mean = TEAMS.reduce((s, t) => s + defIdentity(t).mix[c.id], 0) / TEAMS.length;
      expect(Math.abs(mean - c.weight)).toBeLessThan(0.02);
    }
    const styles = new Set(TEAMS.map((t) => defIdentity(t).style));
    expect(styles.size).toBe(3);
  });

  it('aggressive defenses blitz more than soft ones, and more still on third and long', () => {
    const of = (style: string) => TEAMS.map(defIdentity).filter((d) => d.style === style);
    const c0 = (ds: ReturnType<typeof of>) => ds.reduce((s, d) => s + d.mix['c0-blitz'], 0) / ds.length;
    expect(c0(of('aggressive'))).toBeGreaterThan(c0(of('balanced')));
    expect(c0(of('balanced'))).toBeGreaterThan(c0(of('soft')));
    for (const d of of('aggressive')) {
      expect(situationMix(d, 3, 9)['c0-blitz']).toBeGreaterThan(d.mix['c0-blitz']);
      expect(situationMix(d, 1, 10)).toEqual(d.mix);
    }
  });

  it('pickDefCall without a mix draws exactly as before, and a mix uses one draw too', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const r = a();
      let x = r * DEF_CALLS.reduce((s, c) => s + c.weight, 0);
      const want = DEF_CALLS.find((c) => (x -= c.weight) <= 0) ?? DEF_CALLS[0];
      expect(pickDefCall(() => r).id).toBe(want.id);
      pickDefCall(b, defIdentity(TEAMS[i % TEAMS.length]).mix);
    }
    expect(a()).toBe(b());
  });
});

describe('play traits', () => {
  it('reads plays off their data', () => {
    expect(playTraits(book('smoke')).has('screen')).toBe(true);
    expect(playTraits(book('rb-screen')).has('screen')).toBe(true);
    expect(playTraits(book('four-verts')).has('deep')).toBe(true);
    expect(playTraits(book('mesh')).has('manBeater')).toBe(true);
    expect(playTraits(book('inside-zone')).has('runInside')).toBe(true);
    expect(playTraits(book('toss')).has('runOutside')).toBe(true);
    expect(playTraits(book('speed-option')).has('runOutside')).toBe(true);
    expect(playTraits(book('rpo-slant')).has('rpo')).toBe(true);
    expect(playTraits(book('pa-post')).has('pa')).toBe(true);
    for (const p of PLAYBOOK) expect(playTraits(p).size).toBeGreaterThan(0);
  });
});

/** A season for `user` that has reached a week with a game against an opponent of the given style. */
function seasonVs(user: string, style?: string): SeasonState {
  for (let seed = 1; seed < 40; seed++) {
    const s = newSeason(defaultConfig(user), seed);
    for (let w = 0; w < 12; w++) {
      const g = userGameThisWeek(s);
      if (g && (!style || defIdentity(teamById(g.home === user ? g.away : g.home)).style === style)) return s;
      advanceWeek(s);
    }
  }
  throw new Error('no such opponent');
}

describe('scouting report', () => {
  it('builds for every team, survives a JSON round trip and quotes real starters', () => {
    const s = newSeason(defaultConfig('georgia'), 11);
    advanceWeek(s);
    advanceWeek(s);
    for (const t of TEAMS) {
      s.config.userTeamId = t.id;
      const g = userGameThisWeek(s) ?? s.games.find((x) => x.home === t.id || x.away === t.id)!;
      const r = scoutReport(s, g);
      expect(r.sections.length).toBeGreaterThanOrEqual(6);
      expect(r.suggestions.length).toBeGreaterThanOrEqual(3);
      for (const sg of r.suggestions) expect(PLAYBOOK.some((p) => p.id === sg.id)).toBe(true);
      expect(new Set(r.suggestions.map((x) => x.id)).size).toBe(r.suggestions.length);
      if (t.id === 'georgia') {
        const again = scoutReport(JSON.parse(JSON.stringify(s)) as SeasonState, g);
        expect(again.sections).toEqual(r.sections);
        const on = starters(squadFor(s, r.opp));
        const names = Object.values(on).map((a) => `${a.first[0]}. ${a.last}`.toUpperCase());
        expect(allText(r).split('\n').filter((l) => l.startsWith('WATCH:')).every((l) => names.some((n) => l.includes(n)))).toBe(true);
      }
    }
    s.config.userTeamId = 'georgia';
  });

  it('lists an injured opponent starter and who replaces him', () => {
    const s = seasonVs('georgia');
    const g = userGameThisWeek(s)!;
    const opp = g.home === 'georgia' ? g.away : g.home;
    const qb = starters(squadFor(s, opp)).QB;
    (s.teamState[opp] ??= {}).injuries = { ...(s.teamState[opp]?.injuries ?? {}), [qb.id]: { weeks: 3, type: 'Ankle sprain' } };
    const text = allText(scoutReport(s, g));
    expect(text).toContain(`OUT: QB ${`${qb.first[0]}. ${qb.last}`.toUpperCase()} (ANKLE SPRAIN, 3W)`);
  });

  it('against a blitz-heavy defense, the staff picks quick throws or screens', () => {
    const s = seasonVs('georgia', 'aggressive');
    const r = scoutReport(s, userGameThisWeek(s)!);
    expect(r.suggestions.some((x) => ['quick', 'screen'].some((t) => playTraits(book(x.id)).has(t as 'quick')))).toBe(true);
    expect(allText(r)).toContain('ZERO BLITZ');
  });

  it('starred plays come first among equals', () => {
    const s = seasonVs('georgia');
    const g = userGameThisWeek(s)!;
    const plain = scoutReport(s, g).suggestions.map((x) => x.id);
    const last = plain[plain.length - 1];
    const starred = scoutReport(s, g, new Set([last])).suggestions.map((x) => x.id);
    expect(starred.indexOf(last)).toBeLessThanOrEqual(plain.indexOf(last));
  });
});
