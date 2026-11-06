import { describe, expect, it } from 'vitest';
import { athleteName, starters } from './data/depth';
import { TEAM_HISTORY } from './data/fbs/history';
import { findSpans, wrapSpans } from './render/links';
import { fanPulse, pulseLabel } from './season/fanPulse';
import { simOffseason } from './season/offseason';
import { coachTenure, newsWeight, pastSeasons, trophies } from './season/program';
import { records } from './season/standings';
import { advanceWeek, defaultConfig, newSeason, simSeason } from './season/season';
import type { SeasonState } from './season/types';
import { squadFor } from './season/world';

const USER = 'georgia';

function season(history?: 'real' | 'fresh'): SeasonState {
  return newSeason({ ...defaultConfig(USER), length: 'open', history }, 11);
}

const done = (() => {
  let s: SeasonState | undefined;
  return () => {
    if (!s) {
      s = season();
      simSeason(s);
    }
    return s;
  };
})();

const LONG = 120_000;

describe('program history', () => {
  it('records every team season when the season completes', () => {
    const s = done();
    const h = s.history[s.history.length - 1];
    const rec = records(s);
    for (const [id, y] of Object.entries(h.teams!)) {
      expect(y.w).toBe(rec.get(id)!.w);
      expect(y.l).toBe(rec.get(id)!.l);
    }
    expect(h.teams![h.champion].nc).toBe(1);
    expect(h.teams![h.champion].seed).toBeGreaterThan(0);
    const champGames = s.games.filter((g) => g.kind === 'champ');
    for (const g of champGames) {
      const won = g.result!.home > g.result!.away ? g.home : g.away;
      expect(h.teams![won].cc).toBe(1);
    }
    const bowl = s.games.find((g) => g.kind === 'bowl')!;
    expect(h.teams![bowl.home].bowl).toBe(bowl.name);
    expect(h.teams![USER].hc).toBe('YOU');
  }, LONG);

  it('adds the dynasty to the real history, and a fresh start has none', () => {
    const s = done();
    const champ = s.history[0].champion;
    const t = trophies(s, champ);
    const base = TEAM_HISTORY[champ];
    expect(t.nat.length).toBe((base?.natTitles.length ?? 0) + 1);
    expect(t.nat).toContain(s.year);
    expect(pastSeasons(s, champ).length).toBe((base?.recent.length ?? 0) + 1);
    const f = season('fresh');
    simSeason(f);
    const ft = trophies(f, f.history[0].champion);
    expect(ft.nat).toEqual([f.year]);
    expect(pastSeasons(f, USER).length).toBe(1);
  }, LONG);

  it('keeps the big news past the season', () => {
    const s = season();
    simSeason(s);
    const next = simOffseason(s);
    expect(next.year).toBe(s.year + 1);
    const champ = s.history[0].champion;
    const kept = next.chronicle?.[champ] ?? [];
    expect(kept.some((c) => /national championship/.test(c.text))).toBe(true);
    expect(kept.every((c) => c.w >= 3 && c.year === s.year)).toBe(true);
    expect(newsWeight({ kind: 'result', text: 'x', teams: ['a'] }, 'b')).toBe(0);
  }, LONG);

  it('counts a head coach\'s years', () => {
    const s = season();
    expect(coachTenure(s, USER)).toMatchObject({ name: 'YOU', year: 1, user: true });
    const base = TEAM_HISTORY.alabama;
    const t = coachTenure(s, 'alabama');
    if (base) expect(t.year).toBe(s.year - base.coachSince + 1);
    expect(t.year).toBeGreaterThanOrEqual(1);
  });
});

describe('fan pulse', () => {
  it('is deterministic and worded', () => {
    const s = season();
    for (let i = 0; i < 5; i++) advanceWeek(s);
    const a = fanPulse(s, 'texas');
    expect(fanPulse(s, 'texas')).toEqual(a);
    expect(a.points.length).toBeGreaterThan(0);
    expect(a.points.length).toBeLessThanOrEqual(4);
    expect(a.label).toBe(pulseLabel(a.mood));
  }, LONG);

  it('turns on a first-year coach who is losing, and lifts for a QB who broke out', () => {
    const s = season();
    for (let i = 0; i < 6; i++) advanceWeek(s);
    s.teamState[USER].xw = -2.2;
    const bad = fanPulse(s, USER);
    expect(bad.points.find((p) => p.key === 'coach')?.tone).toBe('worry');
    expect(bad.points.find((p) => p.key === 'results')?.tone).toBe('worry');
    expect(bad.mood).toBeLessThan(0);
    s.teamState[USER].xw = 2.2;
    const qb = starters(squadFor(s, USER)).QB;
    s.confLog = [...(s.confLog ?? []), { week: 6, team: USER, id: qb.id, pos: 'QB', kind: 'breakout' }];
    const good = fanPulse(s, USER);
    expect(good.points.find((p) => p.key === 'coach')?.tone).toBe('hope');
    expect(good.mood).toBeGreaterThan(bad.mood);
    const qbPoint = good.points.find((p) => p.key === 'qb') ?? fanPulse(s, USER).points.find((p) => p.key === 'qb');
    if (qbPoint) expect(qbPoint.tone).toBe('hope');
  }, LONG);
});

describe('links in text', () => {
  it('matches the longest name and keeps names whole', () => {
    const s = season();
    const up = 'GEORGIA TECH STUNS #3 GEORGIA 24-21';
    const spans = findSpans(s, up, ['georgiatech', 'georgia']);
    expect(spans.map((x) => [up.slice(x.start, x.start + x.len), x.link])).toEqual([
      ['GEORGIA TECH', { kind: 'team', id: 'georgiatech' }],
      ['GEORGIA', { kind: 'team', id: 'georgia' }],
    ]);
    const a = squadFor(s, USER).athletes[0];
    const name = athleteName(a).toUpperCase();
    const line = `BREAKOUT: AN EXTRA LONG LEAD IN ${name} (UGA ${a.pos}) GOES OFF`;
    const sp = findSpans(s, line, [USER]);
    expect(sp.some((x) => x.link.kind === 'player' && x.link.id === a.id)).toBe(true);
    for (let n = 14; n <= 40; n += 3) {
      const lines = wrapSpans(line, sp, n);
      const linked = lines.flatMap((l) => l.spans.map((x) => l.t.slice(x.start, x.start + x.len)));
      expect(linked).toContain(name);
      expect(lines.map((l) => l.t.trim()).join(' ')).toBe(line);
    }
  });
});
