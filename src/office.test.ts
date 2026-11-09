import { describe, expect, it } from 'vitest';
import { anchorsOf, ROOMS, SLOT_SIZE } from './data/office';
import { ACHIEVEMENTS, checkOffice, layoutOffice, officeTier } from './season/achievements';
import { simOffseason } from './season/offseason';
import { defaultConfig, newSeason, simSeason } from './season/season';
import type { OfficeItem, SeasonState, TeamYear } from './season/types';

const USER = 'georgia';
const LONG = 180_000;

const done = (() => {
  let s: SeasonState | undefined;
  return () => {
    if (!s) {
      s = newSeason({ ...defaultConfig(USER), length: 'open' }, 11);
      simSeason(s);
    }
    return s;
  };
})();

const box = () => ({
  home: { points: 0, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 },
  away: { points: 0, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 },
  players: [],
});

const year = (y: Partial<TeamYear>): TeamYear => ({ conf: 'SEC', w: 6, l: 6, cw: 4, cl: 4, hc: 'YOU', ...y });

describe('coach office', () => {
  it('a season earns the game ball and every conference title it won', () => {
    const s = done();
    const items = s.office!.items;
    expect(items.filter((i) => i.id === 'gameball')).toHaveLength(1);
    const cc = s.history[s.history.length - 1].teams![USER].cc;
    expect(items.filter((i) => i.id === 'conf')).toHaveLength(cc ? 1 : 0);
    for (const it of items) expect(it.fresh).toBe(1);
  }, LONG);

  it('finding again adds nothing', () => {
    const s = done();
    const n = s.office!.items.length;
    for (let w = 1; w <= s.week; w++) checkOffice(s, 'game', w);
    checkOffice(s, 'season');
    expect(s.office!.items.length).toBe(n);
  }, LONG);

  it('an unranked rout of a ranked team makes the paper', () => {
    const s = newSeason(defaultConfig(USER), 3);
    const g = s.games.filter((x) => x.home === USER || x.away === USER).sort((a, b) => a.week - b.week)[0];
    const vs = g.home === USER ? g.away : g.home;
    s.polls[0].ranks = [{ team: vs, points: 1500, firstPlace: 60 }, ...s.polls[0].ranks.filter((r) => r.team !== vs && r.team !== USER)];
    const home = g.home === USER;
    g.result = { home: home ? 45 : 14, away: home ? 14 : 45, ot: 0, box: box() };
    const got = checkOffice(s, 'game', g.week);
    const paper = got.find((i) => i.id === 'paper')!;
    expect(paper).toBeDefined();
    expect(String(paper.data!.head)).toContain('NO. 1');
    // A 29-point win doesn't.
    const s2 = newSeason(defaultConfig(USER), 3);
    const g2 = s2.games.find((x) => x.id === g.id)!;
    s2.polls[0].ranks = s.polls[0].ranks;
    g2.result = { home: home ? 43 : 14, away: home ? 14 : 43, ot: 0, box: box() };
    expect(checkOffice(s2, 'game', g.week).some((i) => i.id === 'paper')).toBe(false);
  });

  it('the room follows the finished seasons', () => {
    const s = newSeason(defaultConfig(USER), 3);
    const at = (rows: Partial<TeamYear>[]) => {
      s.history = rows.map((r, i) => ({ year: 2026 + i, champion: 'x', teams: { [USER]: year(r) } }));
      return officeTier(s);
    };
    expect(at([])).toBe(0);
    expect(at([{ w: 5, l: 7 }])).toBe(0);
    expect(at([{ w: 8, l: 4 }])).toBe(1);
    expect(at([{ cc: 1 }])).toBe(2);
    expect(at([{ bw: 1 }, { bw: 1 }, { bw: 1 }])).toBe(2);
    expect(at([{ seed: 7 }])).toBe(3);
    expect(at([{ cc: 1 }, { cc: 1 }, { cc: 1 }, { cc: 1 }, { cc: 1, nc: 1 }])).toBe(4);
    // Seasons another coach ran don't count.
    expect(at([{ cc: 1, hc: 'SMITH' }])).toBe(0);
  });

  it('places items deterministically and stores what does not fit', () => {
    const items: OfficeItem[] = Array.from({ length: 40 }, (_, i) => ({ id: 'conf', key: `conf:${i}`, year: 2026 + i, team: USER, rev: i + 1, data: { conf: 'SEC', us: 1, them: 0, vs: 'auburn' } }));
    for (let t = 0; t < ROOMS.length; t++) {
      const a = layoutOffice(items, t);
      const b = layoutOffice([...items].reverse(), t);
      expect(a.placed.map((p) => p.item.key)).toEqual(b.placed.map((p) => p.item.key));
      expect(a.placed.length + a.stored.length).toBe(items.length);
      expect(new Set(a.placed.map((p) => p.at)).size).toBe(a.placed.length);
      // Bigger rooms hold more.
      if (t) expect(a.placed.length).toBeGreaterThan(layoutOffice(items, t - 1).placed.length);
    }
  });

  it('every spot fits in its room and no two overlap', () => {
    for (const room of ROOMS) {
      const all = anchorsOf(room);
      for (const a of all) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(room.w);
        expect(a.y + a.h).toBeLessThanOrEqual(room.h);
        expect([a.w, a.h]).toEqual([SLOT_SIZE[a.kind].w, SLOT_SIZE[a.kind].h]);
      }
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i], b = all[j];
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(hit, `${room.name}: ${a.kind}@${a.x},${a.y} vs ${b.kind}@${b.x},${b.y}`).toBe(false);
        }
    }
  });

  it('the office carries into the next season, and the draft hangs first-rounders', () => {
    const s = done();
    const before = s.office!.items.length;
    const next = simOffseason(JSON.parse(JSON.stringify(s)));
    const prior = next.history.find((h) => h.year === s.year)!;
    const firsts = (prior.draft ?? []).filter((p) => p.team === USER && p.round === 1);
    const jerseys = next.office!.items.filter((i) => i.id === 'jersey');
    expect(jerseys).toHaveLength(firsts.length);
    expect(next.office!.items.length).toBe(before + firsts.length);
    for (const j of jerseys) expect(Number(j.data!.num)).toBeGreaterThan(0);
  }, LONG);

  it('every achievement has a name, hint and unique id', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.name && a.hint).toBeTruthy();
  });
});
