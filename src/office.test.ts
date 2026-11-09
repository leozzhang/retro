import { describe, expect, it } from 'vitest';
import { anchorsOf, ROOMS, SLOT_SIZE } from './data/office';
import { ACHIEVEMENTS, achievement, checkOffice, layoutOffice, levelOf, newOffice, officeTier, sampleOffice, toNextLevel } from './season/achievements';
import { drawnIds, paintItem } from './render/officeArt';
import { simOffseason } from './season/offseason';
import { defaultConfig, newSeason, simSeason } from './season/season';
import type { GamePlay, OfficeItem, SeasonGame, SeasonState, TeamYear } from './season/types';

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

  it('the office carries into the next season, and the draft hangs first-rounders and fills the board', () => {
    const s = done();
    const next = simOffseason(JSON.parse(JSON.stringify(s)));
    const prior = next.history.find((h) => h.year === s.year)!;
    const mine = (prior.draft ?? []).filter((p) => p.team === USER);
    const firsts = mine.filter((p) => p.round === 1);
    const jerseys = next.office!.items.filter((i) => i.id === 'jersey');
    expect(jerseys).toHaveLength(firsts.length);
    for (const j of jerseys) expect(Number(j.data!.num)).toBeGreaterThan(0);
    // Every pick on one board, not one item each.
    const board = next.office!.items.filter((i) => i.id === 'league');
    expect(board).toHaveLength(mine.length ? 1 : 0);
    if (mine.length) expect(board[0].log).toHaveLength(mine.length);
    // What the season found is still there.
    for (const it of s.office!.items) expect(next.office!.items.some((i) => i.key === it.key)).toBe(true);
  }, LONG);

  it('every achievement has a name, hint, unique id and its own art', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name && a.hint).toBeTruthy();
      expect(drawnIds()).toContain(a.id);
      if (a.levels) expect(a.levels[0]).toBe(1);
    }
  });

  it('every item draws inside its slot at every level', () => {
    const s = newSeason(defaultConfig(USER), 3);
    for (const lv of [1, 2, 3, 4, 5, 6, 7, 8, Infinity]) {
      for (const it of sampleOffice(s, lv)) {
        let bad = '';
        const sz = SLOT_SIZE[achievement(it.id)!.slot];
        paintItem((x, y, w, h) => {
          const [rx, ry] = [Math.round(x), Math.round(y)];
          if (rx < 0 || ry < 0 || rx + w > sz.w || ry + h > sz.h || w < 0 || h < 0) bad ||= `${it.id} lv ${levelOf(it)}: ${rx},${ry} ${w}x${h}`;
        }, it);
        expect(bad, bad).toBe('');
      }
    }
  });

  it('a full office fits the suite, but for the jerseys past its wall', () => {
    const s = newSeason(defaultConfig(USER), 3);
    const lay = layoutOffice(sampleOffice(s), ROOMS.length - 1);
    expect(lay.stored.filter((i) => i.id !== 'jersey').map((i) => i.id)).toEqual([]);
  });
});

/** The user's earliest game of a fresh season, played with this score from his side. */
function played(s: SeasonState, us: number, them: number, plays?: GamePlay[]): SeasonGame {
  const g = s.games.filter((x) => x.home === USER || x.away === USER).sort((a, b) => a.week - b.week)[0];
  const home = g.home === USER;
  g.result = { home: home ? us : them, away: home ? them : us, ot: 0, box: box(), plays };
  return g;
}

const play = (q: number, time: number, off: string, kind: string, pts: number, score: [number, number]): GamePlay =>
  ({ q, time, off, kind, yds: 0, yard: 50, down: 1, toGo: 10, pts, score });

describe('leveled items', () => {
  it('folds each find into one item, levels it up and marks it fresh', () => {
    const s = newSeason(defaultConfig(USER), 3);
    const o = (s.office = newOffice());
    const g = played(s, 30, 3);
    const vs = g.home === USER ? g.away : g.home;
    g.result!.ot = 3;
    const first = checkOffice(s, 'game', g.week);
    const mara = first.find((i) => i.id === 'marathon')!;
    expect(mara.log).toHaveLength(1);
    expect(levelOf(mara)).toBe(1);
    expect(toNextLevel(mara)).toBe(1);
    delete mara.fresh;
    // A second marathon the same season, another game: level 2.
    const g2 = s.games.filter((x) => (x.home === USER || x.away === USER) && x.id !== g.id).sort((a, b) => a.week - b.week)[0];
    g2.result = { home: 40, away: 37, ot: 4, box: box() };
    if (g2.away === USER) g2.result = { home: 37, away: 40, ot: 4, box: box() };
    const again = checkOffice(s, 'game', g2.week);
    expect(again).toContain(mara);
    expect(o.items.filter((i) => i.id === 'marathon')).toHaveLength(1);
    expect(levelOf(mara)).toBe(2);
    expect(mara.fresh).toBe(1);
    expect(mara.up).toBeGreaterThan(mara.rev);
    expect(mara.data!.ot).toBe(4);
    // Running it again adds nothing.
    expect(checkOffice(s, 'game', g2.week)).toEqual([]);
    expect(mara.log).toHaveLength(2);
    expect(vs).toBeTruthy();
  });

  it('old saves fold their one-per-find items into the leveled one', () => {
    const s = newSeason(defaultConfig(USER), 3);
    s.office = {
      rev: 2, tier: 0, items: [1, 2].map((i) => ({ id: 'paper', key: `paper:2026:g${i}`, year: 2026, team: USER, rev: i, data: { head: `H${i}`, us: 45, them: 10, vs: 'auburn', rank: 5 } })),
    };
    checkOffice(s, 'season');
    const papers = s.office.items.filter((i) => i.id === 'paper');
    expect(papers).toHaveLength(1);
    expect(papers[0].log!.map((m) => m.k)).toEqual(['paper:2026:g1', 'paper:2026:g2']);
    expect(papers[0].data!.head).toBe('H2');
    expect(levelOf(papers[0])).toBe(2);
  });

  it('a comeback from 21 down, and a walk-off field goal', () => {
    const s = newSeason(defaultConfig(USER), 3);
    s.office = newOffice();
    const g = s.games.filter((x) => x.home === USER || x.away === USER).sort((a, b) => a.week - b.week)[0];
    const home = g.home === USER;
    const vs = home ? g.away : g.home;
    const sc = (us: number, them: number): [number, number] => (home ? [us, them] : [them, us]);
    played(s, 31, 28, [
      play(1, 300, vs, 'td', 7, sc(0, 7)), play(2, 200, vs, 'td', 7, sc(0, 14)), play(2, 20, vs, 'td', 7, sc(0, 21)), play(3, 600, vs, 'td', 7, sc(0, 28)),
      play(3, 300, USER, 'td', 7, sc(7, 28)), play(4, 400, USER, 'td', 7, sc(14, 28)), play(4, 200, USER, 'td', 7, sc(21, 28)), play(4, 60, USER, 'td', 7, sc(28, 28)),
      play(4, 3, USER, 'fg', 3, sc(31, 28)),
    ]);
    const got = checkOffice(s, 'game', g.week);
    const cb = got.find((i) => i.id === 'comeback')!;
    expect(cb.data!.low).toBe('0-28');
    expect(cb.data!.q).toBe(3);
    expect(got.some((i) => i.id === 'ice')).toBe(true);
    // A kick to go up 10 isn't ice water.
    const s2 = newSeason(defaultConfig(USER), 3);
    s2.office = newOffice();
    const g2 = played(s2, 31, 21, [play(4, 3, USER, 'fg', 3, sc(31, 21))]);
    expect(checkOffice(s2, 'game', g2.week).some((i) => i.id === 'ice')).toBe(false);
  });

  it('a rout by a rival makes hate mail; beating No. 1 hangs their helmet', () => {
    const s = newSeason(defaultConfig(USER), 3);
    s.office = newOffice();
    const rg = s.games.find((x) => (x.home === USER && x.away === 'georgiatech') || (x.away === USER && x.home === 'georgiatech'))!;
    const home = rg.home === USER;
    rg.result = { home: home ? 3 : 38, away: home ? 38 : 3, ot: 0, box: box() };
    expect(checkOffice(s, 'game', rg.week).map((i) => i.id)).toContain('hatemail');
    const g = played(s, 24, 21);
    const vs = g.home === USER ? g.away : g.home;
    s.polls[0].ranks = [{ team: vs, points: 1500, firstPlace: 60 }, ...s.polls[0].ranks.filter((r) => r.team !== vs)];
    const giant = checkOffice(s, 'game', g.week).find((i) => i.id === 'giant')!;
    expect(giant.log![0].v).toBe(vs);
  });

  it('season finds: a perfect season, its bowl or bracket, the portrait at five years', () => {
    const s = newSeason(defaultConfig(USER), 3);
    s.office = newOffice();
    const rows = (ys: Partial<TeamYear>[]) => ys.map((r, i) => ({ year: s.year - ys.length + 1 + i, champion: 'x', teams: { [USER]: year(r) } }));
    s.history = rows([{ w: 4, l: 8 }, { w: 3, l: 9 }, { w: 5, l: 7 }, { w: 6, l: 6 }, { w: 13, l: 0, seed: 2, rd: 3, nc: 1, cc: 1 }]);
    const ids = checkOffice(s, 'season').map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['natty', 'perfect', 'bracket', 'haul']));
    expect(ids).not.toContain('bowl');
    expect(ids).not.toContain('forsale');
    // Three losing seasons in a row is a yard sign.
    const s2 = newSeason(defaultConfig(USER), 3);
    s2.office = newOffice();
    s2.history = rows([{ w: 4, l: 8 }, { w: 3, l: 9 }, { w: 5, l: 7 }]).map((h) => ({ ...h, year: h.year - s.year + s2.year }));
    expect(checkOffice(s2, 'season').map((i) => i.id)).toContain('forsale');
  });

  it('every leveled def has art for each level and a next-level count that ends', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.levels)) {
      const it: OfficeItem = { id: a.id, key: a.id, year: 2026, team: USER, rev: 1, log: [] };
      for (let k = 1; k <= a.levels![a.levels!.length - 1]; k++) {
        it.log!.push({ k: String(k), y: 2026, t: '' });
        expect(levelOf(it)).toBe(a.levels!.filter((x) => x <= k).length);
      }
      expect(toNextLevel(it)).toBeUndefined();
      expect(achievement(a.id)).toBe(a);
    }
  });
});
