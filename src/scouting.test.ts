import { describe, expect, it } from 'vitest';
import { CORE_CALLS, DEF_CALLS, pickDefCall } from './data/defenses';
import { starters } from './data/depth';
import { defIdentity, defStyle, IDENTITY, manShare, pressureShare, shellShares, situationMix } from './data/identity';
import { PLAYBOOK } from './data/plays';
import { TEAMS, teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { playTraits, scoutReport } from './season/scouting';
import { advanceWeek, defaultConfig, newSeason, userGameThisWeek } from './season/season';
import type { SeasonState } from './season/types';
import { squadFor, staffFor } from './season/world';
import { buildStaff, dcAdjust } from './data/coaches';

const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const allText = (r: ReturnType<typeof scoutReport>) => r.sections.flatMap((s) => s.items.map((i) => i.text)).join('\n');

describe('defensive identity', () => {
  it('follows the DC in the chair: a DC hired from another program brings his style and his disguises', () => {
    const s = newSeason(defaultConfig('georgia'), 5);
    const home = teamById('alabama');
    const own = buildStaff(home).DC;
    // A DC from a program whose style differs (and so whose ADJUST does too).
    const from = TEAMS.find((t) => buildStaff(t).DC.style !== own.style)!;
    const hired = buildStaff(from).DC;
    expect(defIdentity(home, staffFor(s, home.id).DC)).toEqual(defIdentity(home));
    (s.teamState[home.id] ??= {}).staff = { DC: hired.id };
    const now = defIdentity(home, staffFor(s, home.id).DC);
    expect(now.style).toBe(hired.style);
    expect(now.style).not.toBe(defIdentity(home).style);
    if (dcAdjust(hired) !== dcAdjust(own)) expect(now.disguise).not.toBe(defIdentity(home).disguise);
  });

  it('is deterministic, sums to 1 and keeps every call at or above its floor', () => {
    for (const t of TEAMS) {
      const id = defIdentity(t);
      expect(defStyle(t.id)).toBe(id.style);
      for (const mix of [id.mix, situationMix(id, 3, 10), situationMix(id, 3, 1, 2), situationMix(id, 1, 10, 50, { blitz: 3, man: -3 })]) {
        expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        const short = 'goal' in mix;
        const priors = DEF_CALLS.filter((c) => short || !c.situational);
        const total = priors.reduce((s, c) => s + IDENTITY.prior[c.id], 0);
        for (const c of priors) expect(mix[c.id]).toBeGreaterThanOrEqual((IDENTITY.floor * IDENTITY.prior[c.id]) / total - 1e-9);
      }
      for (const p of Object.values(id.press)) expect(p).toBeGreaterThan(0);
    }
  });

  it('plays the league prior on average, with every shell and both coverages well used', () => {
    const mean = (f: (m: Record<string, number>) => number) => TEAMS.reduce((s, t) => s + f(defIdentity(t).mix), 0) / TEAMS.length;
    expect(mean(manShare)).toBeGreaterThan(0.38);
    expect(mean(manShare)).toBeLessThan(0.55);
    expect(mean(pressureShare)).toBeGreaterThan(0.15);
    expect(mean(pressureShare)).toBeLessThan(0.3);
    for (const sh of ['two-high', 'one-high', 'zero'] as const) expect(mean((m) => shellShares(m)[sh])).toBeGreaterThan(0.05);
    expect(new Set(TEAMS.map((t) => defIdentity(t).style)).size).toBe(3);
  });

  it('aggressive defenses bring more pressure than soft ones, and more still on third and long', () => {
    const of = (style: string) => TEAMS.map((t) => defIdentity(t)).filter((d) => d.style === style);
    const p = (ds: ReturnType<typeof of>) => ds.reduce((s, d) => s + pressureShare(d.mix), 0) / ds.length;
    expect(p(of('aggressive'))).toBeGreaterThan(p(of('balanced')));
    expect(p(of('balanced'))).toBeGreaterThan(p(of('soft')));
    for (const d of of('aggressive')) {
      expect(pressureShare(situationMix(d, 3, 9))).toBeGreaterThan(pressureShare(d.mix));
      expect(situationMix(d, 1, 10)).toBe(d.mix);
    }
  });

  it('only calls Goal Line in short yardage, and loads the box there', () => {
    const d = defIdentity(TEAMS[0]);
    expect(d.mix.goal).toBeUndefined();
    const sy = situationMix(d, 3, 1);
    expect(sy.goal).toBeGreaterThan(0.1);
    const heavy = (m: Record<string, number>) => DEF_CALLS.reduce((s, c) => s + (c.box >= 8 ? m[c.id] ?? 0 : 0), 0);
    expect(heavy(sy)).toBeGreaterThan(heavy(d.mix) + 0.1);
    expect(situationMix(d, 1, 10, 2).goal).toBeGreaterThan(0.1);
  });

  it('pickDefCall without a mix draws exactly as before, and a mix uses one draw too', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const r = a();
      let x = r * CORE_CALLS.reduce((s, c) => s + c.weight, 0);
      const want = CORE_CALLS.find((c) => (x -= c.weight) <= 0) ?? CORE_CALLS[0];
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
    expect(allText(r)).toContain('PRESSURE (5+ RUSHERS)');
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
