import { beforeAll, describe, expect, it } from 'vitest';
import { generatedAthlete } from './data/depth';
import { parseRecruit, prospect, recruitPool, recruitSalt } from './data/recruits';
import { freshmanLevel, joinYear } from './data/rosterGen';
import { TEAMS, teamById } from './data/teams';
import { advanceOffseason, startOffseason } from './season/offseason';
import { MIN_COUNT, PORTAL } from './season/portal';
import {
  classRanks, evaluation, nextHomeGame, offerCap, recruitsReact, recruitWeek, toggleOffer, toggleVisit,
} from './season/recruiting';
import { advanceWeek, defaultConfig, newSeason, nextSeason, seasonOver, simSeason } from './season/season';
import type { SeasonState } from './season/types';
import { baseRoster, headCoachFor, squadFor } from './season/world';

/** One played-out open season, shared; each test takes a copy. */
let done: string;
const copy = (): SeasonState => JSON.parse(done);
const config = () => ({ ...defaultConfig('georgia'), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal: true, carousel: true, departures: true } });

/** Through the offseason to the stage given (signing day not yet run). */
function toStage(s: SeasonState, stage: 'signing' | 'portal'): SeasonState {
  startOffseason(s);
  s.config.delegate.recruiting = true;
  while (s.offseason?.stage !== stage) advanceOffseason(s);
  return s;
}

beforeAll(() => {
  const s = newSeason(config(), 21);
  simSeason(s);
  done = JSON.stringify(s);
}, 120_000);

describe('the prospect pool', () => {
  it('ranks a class into 32 five-stars, 398 four-stars and 1,800 three-stars, rebuilt from each id', () => {
    const salt = recruitSalt(5);
    const pool = recruitPool(2027, salt);
    const count = (n: number) => pool.list.filter((p) => p.stars === n).length;
    expect([count(5), count(4), count(3)]).toEqual([32, 398, 1800]);
    expect(pool.list.map((p) => p.rank)).toEqual(pool.list.map((_, i) => i + 1));
    const p = pool.list[40];
    expect(parseRecruit(p.id)).toMatchObject({ cls: 2027, salt });
    expect(joinYear(p.id)).toBe(2027);
    expect(generatedAthlete(p.id)).toBe(p.a);
    expect(p.a.year).toBe('FR');
    // Stars mean something on average, though the services miss.
    const level = (n: number) => pool.list.filter((x) => x.stars === n).reduce((a, x) => a + x.level, 0) / count(n);
    expect(level(5)).toBeGreaterThan(level(4));
    expect(level(4)).toBeGreaterThan(level(3));
    expect(level(3)).toBeGreaterThan(level(2));
    const misses = pool.list.filter((x) => x.stars <= 3 && x.level > level(4)).length;
    expect(misses).toBeGreaterThan(20);
    // Another career's class is someone else.
    expect(recruitPool(2027, recruitSalt(6)).list[0].a.last + recruitPool(2027, recruitSalt(6)).list[1].a.last).not.toBe(pool.list[0].a.last + pool.list[1].a.last);
  });
});

describe('the cycle', () => {
  it('opens with the season: every staff has a board, early deciders commit; a one-season game has none', () => {
    const s = newSeason(config(), 3);
    const rs = s.recruiting!;
    expect(rs.cls).toBe(s.year + 1);
    for (const t of TEAMS) expect((rs.boards[t.id] ?? []).length).toBeGreaterThan(5);
    expect(Object.keys(rs.commits).length).toBeGreaterThan(150);
    expect(newSeason(defaultConfig('georgia'), 3).recruiting).toBeUndefined();
  });

  it('a saved cycle continues identically', () => {
    const s = newSeason(config(), 4);
    for (let i = 0; i < 6; i++) advanceWeek(s);
    const c = JSON.parse(JSON.stringify(s)) as SeasonState;
    for (let i = 0; i < 4; i++) {
      advanceWeek(s);
      advanceWeek(c);
    }
    expect(JSON.stringify(c.recruiting)).toBe(JSON.stringify(s.recruiting));
  }, 60_000);

  it('the user offers within a cap and hosts visitors at the next home game, who react to it', () => {
    const s = newSeason({ ...config(), delegate: { depthChart: true, gamePlan: true } }, 8);
    const rs = s.recruiting!;
    const u = s.config.userTeamId;
    const open = recruitPool(rs.cls, rs.salt).list.filter((p) => !rs.commits[p.id] && !(rs.offers[u] ?? []).includes(p.id));
    let i = 0;
    while ((rs.offers[u] ?? []).filter((id) => !rs.commits[id] || rs.commits[id] === u).length < offerCap(s)) expect(toggleOffer(s, open[i++].id)).toBe('offered');
    expect(toggleOffer(s, open[i].id)).toBe('full');
    expect(toggleOffer(s, open[0].id)).toBe('withdrawn');
    const g = nextHomeGame(s)!;
    const guests = open.slice(1).filter((p) => !rs.ov[p.id]?.includes(u) && (rs.ov[p.id]?.length ?? 0) < 5).slice(0, 3);
    for (const p of guests) expect(toggleVisit(s, p.id)).toBe('hosted');
    while (s.week <= g.week) advanceWeek(s);
    for (const p of guests) {
      if (rs.signed[p.id]) continue;
      expect(rs.ov[p.id]).toContain(u);
      expect(rs.vibe[p.id]).toBeDefined();
    }
    expect(s.news.some((n) => n.kind === 'recruiting' && n.text.startsWith('VISIT:'))).toBe(true);
  }, 60_000);

  it("the position coach's evaluation is words only, and only after he's spent time on a prospect", () => {
    const s = copy();
    const rs = s.recruiting!;
    const u = s.config.userTeamId;
    const board = rs.boards[u] ?? [];
    expect(board.length).toBeGreaterThan(10);
    for (const id of board) {
      const ev = evaluation(s, id);
      if (!rs.effort[id]) {
        expect(ev).toBeUndefined();
        continue;
      }
      expect(['WILL PLAY EARLY', 'NEEDS A YEAR', 'DEVELOPMENTAL PROJECT']).toContain(ev!.ready);
      expect(['SPECIAL', 'ALL-CONFERENCE TALENT', 'STARTER', 'DEPTH PIECE']).toContain(ev!.ceiling);
      expect(['HUNCH', 'FAIRLY SURE', 'CONVINCED']).toContain(ev!.sure);
      for (const n of ev!.notes) expect(n).not.toMatch(/\d/);
    }
  });

  it('commits sign early mostly, some decommit and flip; the early period is binding', () => {
    const rs = copy().recruiting!;
    const commits = rs.log.filter((e) => e.kind === 'commit').length;
    const decommits = rs.log.filter((e) => e.kind === 'decommit').length;
    expect(decommits / commits).toBeGreaterThan(0.05);
    expect(decommits / commits).toBeLessThan(0.25);
    expect(rs.log.some((e) => e.kind === 'commit' && e.from)).toBe(true);
    const early = Object.keys(rs.signed).length;
    expect(early / Object.keys(rs.commits).length).toBeGreaterThan(0.6);
    for (const [id, t] of Object.entries(rs.signed)) expect(rs.commits[id]).toBe(t);
  });
});

describe('signing day and arrival', () => {
  it('a coach leaving shakes his commits loose, and his new school picks up interest', () => {
    const s = copy();
    startOffseason(s);
    const rs = s.recruiting!;
    // Pretend the user's head coach left for Texas: his unsigned commits react.
    const u = s.config.userTeamId;
    const open = Object.entries(rs.commits).filter(([id, t]) => t === u && !rs.signed[id]).map(([id]) => id);
    for (const [id, t] of Object.entries(rs.commits)) if (!rs.signed[id] && t !== u && open.length < 12) {
      rs.commits[id] = u;
      open.push(id);
    }
    s.carousel = { ...(s.carousel ?? { open: [], offers: {}, declined: {}, talks: {}, talksLeft: 0, moved: [], log: [] }), was: { [`${u}:HC`]: headCoachFor(s, 'texas').id } };
    const before = open.map((id) => rs.interest[id]?.texas ?? 0);
    recruitsReact(s);
    const gone = open.filter((id) => rs.commits[id] !== u).length;
    expect(gone).toBeGreaterThan(0);
    open.forEach((id, i) => expect(rs.interest[id]?.texas ?? 0).toBeGreaterThan(before[i]));
  });

  it('signing day settles the class: signees join their rosters as freshmen next season, rosters fit', () => {
    const s = toStage(copy(), 'signing');
    advanceOffseason(s);
    const rs = s.recruiting!;
    const signed = Object.entries(rs.signed);
    expect(signed.length).toBeGreaterThan(TEAMS.length * 15);
    expect(Object.keys(rs.commits).length).toBe(signed.length);
    const seen = new Set<string>();
    for (const [id, team] of signed) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      expect(baseRoster(s, team).some((a) => a.id === id)).toBe(true);
    }
    expect(classRanks(s)[0].n).toBeGreaterThan(15);
    // The portal and the placeholder fill: every roster to the cap, minimums met; no signee transfers.
    let next = s;
    while (next.phase === 'offseason') next = advanceOffseason(next);
    for (const t of TEAMS) {
      const roster = baseRoster(next, t.id);
      expect(roster.length).toBe(PORTAL.rosterMax);
      for (const [pos, min] of Object.entries(MIN_COUNT)) expect(roster.filter((a) => a.pos === pos).length).toBeGreaterThanOrEqual(min);
    }
    for (const e of s.portal!.entrants) expect(joinYear(e.id)).not.toBe(s.year + 1);
    const [id, team] = signed.find(([, t]) => t === 'georgia') ?? signed[0];
    const a = squadFor(next, team).athletes.find((x) => x.id === id)!;
    expect(a.year).toBe('FR');
    expect(next.careers?.[id]?.story.some((e) => e.kind === 'signed')).toBe(true);
    // And the next season opens a new cycle for the class after.
    expect(next.recruiting!.cls).toBe(next.year + 1);
  }, 120_000);

  it('each tier signs near its generated-freshman level', () => {
    const s = toStage(copy(), 'signing');
    advanceOffseason(s);
    const rs = s.recruiting!;
    const gap = [0, 0, 0, 0, 0];
    const n = [0, 0, 0, 0, 0];
    for (const [id, team] of Object.entries(rs.signed)) {
      const p = prospect(id)!;
      const tier = teamById(team).profile.tier - 1;
      gap[tier] += p.level - freshmanLevel(teamById(team).profile, p.pos);
      n[tier]++;
    }
    const off = gap.map((g, i) => g / n[i]);
    // Tiers 1-4 within 2.5 in any one cycle (the season report checks 1.5 over a career); tier 5 signs tier 4's leftovers (docs/RECRUITING.md flags it).
    for (const x of off.slice(0, 4)) expect(Math.abs(x), off.map((v) => v.toFixed(2)).join(' ')).toBeLessThan(2.5);
    expect(Math.abs(off[4])).toBeLessThan(4.5);
  }, 120_000);
});

describe('weeks', () => {
  it('a week without a cycle does nothing', () => {
    const s = newSeason(defaultConfig('georgia'), 2);
    expect(() => recruitWeek(s, 1)).not.toThrow();
    expect(s.recruiting).toBeUndefined();
  });

  it('a whole career rolls a new class each season', () => {
    const s = copy();
    expect(seasonOver(s)).toBe(true);
    const n = nextSeason(s);
    expect(n.recruiting!.cls).toBe(s.recruiting!.cls + 1);
  });
});
