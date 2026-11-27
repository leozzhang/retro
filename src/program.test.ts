import { describe, expect, it } from 'vitest';
import { athleteName, starters } from './data/depth';
import { TEAM_HISTORY } from './data/fbs/history';
import { RIVALRIES } from './data/season/rivalries';
import { TEAMS, teamById } from './data/teams';
import { findSpans, wrapSpans } from './render/links';
import { fanBar, fanPulse, PULSE, pulseLabel } from './season/fanPulse';
import { simOffseason, startToPortal } from './season/offseason';
import { bowlGame, coachStart, coachTenure, newsWeight, newsYears, pastSeasons, rivalrySeries, teamNews, trophies } from './season/program';
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

  it('keeps each season\'s rivalry results, big games and close games', () => {
    const s = done();
    const y = s.history[s.history.length - 1].teams!;
    for (const g of s.games.filter((x) => x.result && x.kind !== 'bowl' && x.kind !== 'cfp' && x.kind !== 'champ')) {
      const a = y[g.home].rv?.[g.away];
      if (a === undefined) continue;
      expect(y[g.away].rv?.[g.home]).toBe(a ? 0 : 1);
      expect(a).toBe(g.result!.home > g.result!.away ? 1 : 0);
    }
    expect(Object.values(y).some((row) => row.rv)).toBe(true);
    for (const row of Object.values(y)) {
      const n = row.w + row.l;
      expect((row.big?.[0] ?? 0) + (row.big?.[1] ?? 0)).toBeLessThanOrEqual(n);
      expect((row.close?.[0] ?? 0) + (row.close?.[1] ?? 0)).toBeLessThanOrEqual(n);
      expect(row.big?.[0] ?? 0).toBeLessThanOrEqual(row.w);
    }
    expect(bowlGame('W SEC TITLE, L CFP QF')).toBe('L');
    expect(bowlGame('W B1G TITLE')).toBeUndefined();
    expect(bowlGame('W NATIONAL TITLE')).toBe('W');
    expect(bowlGame('L FCS SEMIFINAL')).toBeUndefined();
  }, LONG);

  it('counts a rivalry streak across seasons and the fans talk about it', () => {
    const s = season();
    simSeason(s);
    const next = simOffseason(s);
    const row = (w: number) => ({ conf: 'SEC', w, l: 12 - w, cw: 4, cl: 4 });
    // Alabama lost the last two to Auburn.
    next.history[0].teams!.alabama.rv = { auburn: 0 };
    next.history[0].teams!.auburn.rv = { alabama: 1 };
    next.history.unshift({ year: next.year - 2, champion: 'x', teams: { alabama: { ...row(9), rv: { auburn: 0 } }, auburn: { ...row(8), rv: { alabama: 1 } } } });
    expect(rivalrySeries(next, 'alabama', 'auburn')).toMatchObject({ w: 0, l: 2, streak: -2 });
    expect(rivalrySeries(next, 'auburn', 'alabama').streak).toBe(2);
    expect(rivalrySeries(next, 'alabama', 'auburn', next.year - 1).l).toBe(1);
    const a = fanPulse(next, 'alabama').all.find((p) => p.key === 'rivalStreak:auburn');
    expect(a?.tone).toBe('worry');
    expect(a?.teams).toEqual(['auburn']);
    expect(fanPulse(next, 'auburn').all.find((p) => p.key === 'rivalStreak:alabama')?.tone).toBe('hope');
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

describe('offseason news carried forward', () => {
  it('keeps one draft a year: last offseason\'s copies are dated and dropped when the next opens', () => {
    const s = season();
    simSeason(s);
    const next = simOffseason(s);
    const carried = next.news.filter((n) => n.kind === 'draft');
    expect(carried.length).toBeGreaterThan(0);
    expect(carried.every((n) => n.year === s.year)).toBe(true);
    // An old save's copies have no year: its carousel and draft news reads the same.
    const years = newsYears(next);
    const legacy = newsYears({ ...next, news: next.news.map(({ year: _, ...n }) => n) });
    next.news.forEach((n, i) => (n.kind === 'draft' || n.kind === 'carousel') && expect(legacy[i]).toBe(years[i]));
    const first = carried.find((n) => /first overall/.test(n.text))!;
    const label = teamNews(next, first.teams[0]).filter((h) => /first overall/.test(h.text));
    expect(label.map((h) => h.year)).toEqual([s.year]);
    simSeason(next);
    startToPortal(next);
    const ys = newsYears(next);
    expect(ys.every((y) => y === next.year)).toBe(true);
    expect(next.news.filter((n) => /first overall/.test(n.text)).length).toBe(1);
    // The program page: this offseason's pick, and last year's from the chronicle, each once.
    for (const id of new Set([first.teams[0], next.news.find((n) => /first overall/.test(n.text))!.teams[0]])) {
      const firsts = teamNews(next, id).filter((h) => /first overall/.test(h.text));
      expect(new Set(firsts.map((h) => h.year)).size).toBe(firsts.length);
    }
  }, LONG);
});

describe('fan pulse', () => {
  it('holds a program that keeps winning to its own standard', () => {
    const row = (w: number, l: number) => ({ year: 0, conf: 'ACC', w, l, cw: 0, cl: 0 });
    const rec = { w: 11, l: 1 } as Parameters<typeof fanBar>[1];
    // Three wins over the odds alone would be a shock; after 11-2 and 11-1 it's what fans expected.
    expect(fanBar([], rec, 3).fx).toBeGreaterThanOrEqual(PULSE.wayAhead);
    const bar = fanBar([row(11, 2), row(11, 1)], rec, 3);
    expect(bar.fx).toBeLessThan(PULSE.wayAhead);
    expect(bar.recent).toBeGreaterThan(PULSE.standard);
    // The same 11-1 after losing seasons is a surprise.
    expect(fanBar([row(4, 8), row(5, 7)], rec, 3).fx).toBeGreaterThan(bar.fx);
  });

  it('sours on a hot start that falls apart, and on a fresh upset', () => {
    const s = season();
    for (let i = 0; i < 11; i++) advanceWeek(s);
    const mine = s.games.filter((g) => g.result && (g.home === USER || g.away === USER)).sort((a, b) => a.week - b.week);
    expect(mine.length).toBeGreaterThanOrEqual(9);
    const set = (g: (typeof mine)[number], won: boolean) => {
      const r = g.result!;
      const [hi, lo] = [Math.max(r.home, r.away), Math.min(r.home, r.away)];
      const homeWins = (g.home === USER) === won;
      [r.home, r.away] = homeWins ? [hi, lo] : [lo, hi];
      if (r.home === r.away) r.home += homeWins ? 3 : -3;
    };
    const n = mine.length;
    mine.forEach((g, i) => set(g, i < n - 4));
    const p = fanPulse(s, USER);
    const fade = p.all.find((x) => x.key === 'fade');
    expect(fade?.tone).toBe('worry');
    expect(p.points.some((x) => x.key === 'fade')).toBe(true);
    expect(p.all.some((x) => x.key === 'results' && x.tone === 'hope')).toBe(false);
    expect(p.mood).toBeLessThan(0);
    // An upset last week leads the talk.
    mine.forEach((g, i) => set(g, i !== n - 1));
    s.teamState[USER].xw = 0;
    const last = mine[n - 1];
    const q = fanPulse(s, USER).all.find((x) => x.key === 'last');
    const opp = last.home === USER ? last.away : last.home;
    if (teamById(opp).profile.tier > teamById(USER).profile.tier) expect(q?.tone).toBe('worry');
  }, LONG);


  it('is deterministic and worded', () => {
    const s = season();
    for (let i = 0; i < 5; i++) advanceWeek(s);
    const a = fanPulse(s, 'texas');
    expect(fanPulse(s, 'texas')).toEqual(a);
    expect(a.points.length).toBeGreaterThan(0);
    expect(a.points.length).toBeLessThanOrEqual(PULSE.points);
    expect(a.label).toBe(pulseLabel(a.mood));
  }, LONG);

  it('turns on a first-year coach who is losing, and lifts for a QB who broke out', () => {
    // A fresh start: no past seasons, so the fans' bar is the odds alone.
    const s = season('fresh');
    for (let i = 0; i < 6; i++) advanceWeek(s);
    s.teamState[USER].xw = -2.2;
    const bad = fanPulse(s, USER);
    expect(bad.all.find((p) => p.key === 'coach')?.tone).toBe('worry');
    expect(bad.all.find((p) => p.key === 'results')?.tone).toBe('worry');
    expect(bad.mood).toBeLessThan(0);
    s.teamState[USER].xw = 2.2;
    const qb = starters(squadFor(s, USER)).QB;
    s.confLog = [...(s.confLog ?? []), { week: 6, team: USER, id: qb.id, pos: 'QB', kind: 'breakout' }];
    const good = fanPulse(s, USER);
    expect(good.all.find((p) => p.key === 'coach')?.tone).toBe('hope');
    expect(good.mood).toBeGreaterThan(bad.mood);
    const qbPoint = good.all.find((p) => p.key === 'qb');
    if (qbPoint) expect(qbPoint.tone).toBe('hope');
  }, LONG);
  it('shows one point per group while other groups have something to say', () => {
    const s = done();
    for (const t of TEAMS) {
      const p = fanPulse(s, t.id);
      const shown = new Set(p.points.map((x) => x.group));
      const twice = p.points.some((x, i) => p.points.findIndex((y) => y.group === x.group) !== i);
      // (The calm "about as expected" line is filler, left out on purpose.)
      if (twice) for (const x of p.all) if (!(x.key === 'results' && x.tone === 'calm')) expect(shown.has(x.group)).toBe(true);
      for (const g of shown) expect(p.points.filter((x) => x.group === g).length).toBeLessThanOrEqual(2);
    }
  }, LONG);

  it('tells each program its own story', () => {
    const s = done();
    const sets = new Set<string>();
    const freq = new Map<string, number>();
    for (const t of TEAMS) {
      const keys = fanPulse(s, t.id).points.map((x) => x.key.split(':')[0]);
      sets.add(keys.slice().sort().join(','));
      for (const k of new Set(keys)) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    expect(sets.size / TEAMS.length).toBeGreaterThan(0.7);
    // The record and the QB are everyone's talk; no story should be.
    for (const [k, n] of freq) if (k !== 'results' && k !== 'qb') expect(n / TEAMS.length, k).toBeLessThanOrEqual(0.5);
  }, LONG);

  it('compares a program only with a peer who hired the same winter', () => {
    const s = done();
    let n = 0;
    for (const t of TEAMS) {
      const p = fanPulse(s, t.id).all.find((x) => x.key === 'peer');
      if (!p) continue;
      n++;
      const peer = p.teams![0];
      expect(coachStart(s, peer)).toBe(coachStart(s, t.id));
      const rival = RIVALRIES.some((r) => (r.a === t.id && r.b === peer) || (r.b === t.id && r.a === peer));
      expect(rival || teamById(peer).conference === t.conference).toBe(true);
    }
    expect(n).toBeGreaterThan(0);
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
