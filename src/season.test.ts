import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildSquad, positionOrder, reorderPosition, starters, teamRatings } from './data/depth';
import { CALENDAR } from './data/season/calendar';
import { CONF_RULES } from './data/season/conferences';
import { BOWL_WINS, CFP_FORMAT } from './data/season/postseason';
import { RIVALRIES } from './data/season/rivalries';
import { teamById, TEAMS } from './data/teams';
import { mulberry32 } from './engine/math';
import { heismanRace } from './season/awards';
import { latestPoll, rankIn } from './season/polls';
import { champions, seedOrder } from './season/postseason';
import { generateSchedule } from './season/schedule';
import { advanceWeek, defaultConfig, newSeason, simSeason } from './season/season';
import { settleTie, simGame } from './season/simGame';
import { records, standings, winner } from './season/standings';
import { leaders } from './season/stats';
import { deleteSlot, freeSlot, latestSlot, loadSlot, migrateLegacySave, packSeason, saveSlot, SEASON_KEY, slotMeta, unpackSeason } from './season/save';
import { getItem, setItem } from './engine/storage';
import { setUserDepth, useStaffDepth } from './season/staff';
import { squadFor } from './season/world';
import type { GameResult, SeasonGame, SeasonState } from './season/types';

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const score = (home: number, away: number): GameResult => ({
  home, away, ot: 0, box: { home: { points: home, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 }, away: { points: away, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 }, players: [] },
});

/** One full simulated season, shared by the read-only tests. */
let full: SeasonState | undefined;
function fullSeason(): SeasonState {
  if (!full) {
    full = newSeason(defaultConfig('georgia'), 7);
    simSeason(full);
  }
  return full;
}

describe('season', () => {
  it('schedule: 12 games each, one a week, conference counts, rivalries, deterministic', () => {
    const games = generateSchedule(TEAMS, 2026, mulberry32(3));
    const byTeam = new Map(TEAMS.map((t) => [t.id, [] as SeasonGame[]]));
    for (const g of games) {
      byTeam.get(g.home)!.push(g);
      byTeam.get(g.away)!.push(g);
      expect(g.week).toBeGreaterThanOrEqual(1);
      expect(g.week).toBeLessThanOrEqual(CALENDAR.regularWeeks);
      if (g.kind === 'conf') expect(teamById(g.home).conference).toBe(teamById(g.away).conference);
    }
    const pairs = new Set<string>();
    for (const g of games) {
      expect(pairs.has(key(g.home, g.away))).toBe(false);
      pairs.add(key(g.home, g.away));
    }
    for (const t of TEAMS) {
      const list = byTeam.get(t.id)!;
      expect(list.length).toBe(CALENDAR.games);
      expect(new Set(list.map((g) => g.week)).size).toBe(list.length);
      const members = TEAMS.filter((x) => x.conference === t.conference).length;
      const k = Math.min(CONF_RULES[t.conference].confGames, members - 1);
      const conf = list.filter((g) => g.kind === 'conf').length;
      expect(conf).toBeGreaterThanOrEqual(k - 1);
      expect(conf).toBeLessThanOrEqual(k);
    }
    for (const r of RIVALRIES) {
      const g = games.find((x) => key(x.home, x.away) === key(r.a, r.b));
      expect(g, r.name).toBeDefined();
      if (r.rivalryWeek) expect(g!.week).toBe(CALENDAR.rivalryWeek);
    }
    expect(generateSchedule(TEAMS, 2026, mulberry32(3)).map((g) => g.id)).toEqual(games.map((g) => g.id));
  });

  it('simGame: no ties, deterministic, talent wins, box score adds up to the score', () => {
    const uga = buildSquad(teamById('georgia'));
    const sac = buildSquad(teamById('sacramentostate'));
    const bama = buildSquad(teamById('alabama'));
    expect(simGame(uga, bama, mulberry32(5))).toEqual(simGame(uga, bama, mulberry32(5)));
    let ugaWins = 0;
    for (let i = 0; i < 200; i++) {
      const r = simGame(i % 2 ? uga : sac, i % 2 ? sac : uga, mulberry32(100 + i));
      expect(r.home).not.toBe(r.away);
      if ((i % 2 ? r.home : r.away) > (i % 2 ? r.away : r.home)) ugaWins++;
    }
    expect(ugaWins).toBeGreaterThan(170);
    for (let i = 0; i < 100; i++) {
      const r = simGame(uga, bama, mulberry32(500 + i));
      if (r.ot >= 8) continue; // the coin-flip safety valve
      for (const side of ['home', 'away'] as const) {
        const team = side === 'home' ? 'georgia' : 'alabama';
        const lines = r.box.players.filter((p) => p.team === team);
        const tds = lines.reduce((s, p) => s + p.passTd + p.rushTd, 0);
        const fgs = lines.reduce((s, p) => s + p.fgm, 0);
        expect(r[side]).toBe(tds * 7 + fgs * 3);
        expect(r.box[side].points).toBe(r[side]);
      }
    }
  });

  it('a live tie is settled in overtime', () => {
    const r = settleTie(score(21, 21), buildSquad(teamById('georgia')), buildSquad(teamById('alabama')), mulberry32(1));
    expect(r.home).not.toBe(r.away);
    expect(r.ot).toBeGreaterThan(0);
  });

  it('standings: conference record first, then head-to-head', () => {
    const s = newSeason(defaultConfig('georgia'), 1);
    const g = (home: string, away: string, h: number, a: number): SeasonGame => ({
      id: `${home}-${away}`, week: 1, home, away, kind: 'conf', neutral: false, result: score(h, a),
    });
    // LSU 1-0; Alabama and Georgia 1-1, Alabama won their game; Auburn 0-1.
    s.games = [g('alabama', 'georgia', 24, 20), g('lsu', 'alabama', 30, 3), g('georgia', 'auburn', 40, 0)];
    const rows = standings(s, 'SEC').map((r) => r.team);
    expect(rows.slice(0, 3)).toEqual(['lsu', 'alabama', 'georgia']);
    expect(rows.indexOf('auburn')).toBeGreaterThan(2);
  });

  it('polls: 25 unique teams; ranked losers drop; a winning No. 1 stays near the top', () => {
    const s = newSeason(defaultConfig('georgia'), 11);
    expect(new Set(s.polls[0].ranks.map((r) => r.team)).size).toBe(25);
    const drops: number[] = [];
    for (let w = 1; w <= 6; w++) {
      const before = latestPoll(s, 'ap')!;
      advanceWeek(s);
      const after = latestPoll(s, 'ap')!;
      expect(after.week).toBe(w);
      expect(new Set(after.ranks.map((r) => r.team)).size).toBe(25);
      for (const g of s.games.filter((x) => x.week === w)) {
        const l = g.home === winner(g) ? g.away : g.home;
        if (rankIn(before, l) && !rankIn(before, winner(g)!)) drops.push((rankIn(after, l) || 26) - rankIn(before, l));
      }
      const top = before.ranks[0].team;
      const played = s.games.find((x) => x.week === w && (x.home === top || x.away === top));
      if (played && winner(played) === top) expect(rankIn(after, top)).toBeLessThanOrEqual(3);
    }
    // A loss to an unranked team costs a lot on average, though a chaotic week can leave one in place.
    expect(drops.length).toBeGreaterThan(5);
    expect(drops.reduce((a, b) => a + b, 0) / drops.length).toBeGreaterThan(5);
    expect(drops.filter((d) => d < 0).length).toBe(0);
  });

  it('seed order: the standard bracket', () => {
    expect(seedOrder(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  });

  it('a full simulated season: championships, playoff, bowls, awards', () => {
    const s = fullSeason();
    expect(s.phase).toBe('complete');
    const b = s.bracket!;
    expect(b.seeds.length).toBe(CFP_FORMAT.size);
    expect(new Set(b.seeds).size).toBe(CFP_FORMAT.size);
    expect(b.seeds).toContain(b.champion);
    // The top conference champions by the final committee order all got in.
    const cfp = latestPoll(s, 'cfp')!;
    const champs = [...champions(s).values()];
    for (const c of champs.filter((id) => rankIn(cfp, id) && rankIn(cfp, id) <= CFP_FORMAT.size)) expect(b.seeds).toContain(c);
    const bowls = s.games.filter((g) => g.kind === 'bowl');
    expect(bowls.length).toBeGreaterThan(10);
    const recs = records(s);
    const inBowl = bowls.flatMap((g) => [g.home, g.away]);
    expect(new Set(inBowl).size).toBe(inBowl.length);
    for (const id of inBowl) {
      expect(b.seeds).not.toContain(id);
      // Eligibility was decided before the bowl, so take a bowl win back out.
      const bowl = bowls.find((g) => g.home === id || g.away === id)!;
      expect(recs.get(id)!.w - (winner(bowl) === id ? 1 : 0)).toBeGreaterThanOrEqual(BOWL_WINS);
    }
    expect(s.games.filter((g) => g.kind === 'champ').length).toBe(Object.values(CONF_RULES).filter((c) => c.champGame).length);
    expect(s.games.every((g) => g.result)).toBe(true);
    expect(leaders(s, 'passYds', 1)[0].passYds).toBeGreaterThan(1500);
    expect(heismanRace(s).finalists.length).toBe(5);
    expect(s.awards.find((a) => a.id === 'heisman')?.finalists.length).toBe(5);
    expect(s.history).toMatchObject([{ year: 2026, champion: b.champion, heisman: s.awards[0].finalists[0].name }]);
    expect(s.history[0].ap).toHaveLength(25);
  }, 20_000);

  it('state is plain JSON: a saved season continues identically', () => {
    const a = newSeason(defaultConfig('texas'), 21);
    for (let i = 0; i < 5; i++) advanceWeek(a);
    const b = JSON.parse(JSON.stringify(a)) as SeasonState;
    simSeason(a);
    simSeason(b);
    expect(JSON.parse(JSON.stringify(b))).toEqual(JSON.parse(JSON.stringify(a)));
  }, 20_000);

  it('a user depth chart survives the week and a save; handing it back restores the staff chart', () => {
    const s = newSeason(defaultConfig('georgia'), 11);
    const base = squadFor(s, 'georgia');
    const qbs = positionOrder(base, 'QB');
    // Promote the worst QB: the team gets worse, and stays that way through a simulated week.
    setUserDepth(s, reorderPosition(base, 'QB', qbs.length - 1, 0));
    expect(s.config.delegate.depthChart).toBe(false);
    expect(starters(squadFor(s, 'georgia')).QB.id).toBe(qbs[qbs.length - 1].id);
    expect(teamRatings(squadFor(s, 'georgia')).off).toBeLessThan(teamRatings(base).off);
    advanceWeek(s);
    expect(starters(squadFor(s, 'georgia')).QB.id).toBe(qbs[qbs.length - 1].id);
    const back = JSON.parse(JSON.stringify(s)) as SeasonState;
    expect(starters(squadFor(back, 'georgia')).QB.id).toBe(qbs[qbs.length - 1].id);
    useStaffDepth(s);
    expect(s.config.delegate.depthChart).toBe(true);
    expect(starters(squadFor(s, 'georgia')).QB.id).toBe(qbs[0].id);
  });

  it('saves drop zero stats and restore them', () => {
    const s = fullSeason();
    const packed = packSeason(s);
    // Box scores shrink by about half; progression (about 0.9 MB) and careers (about 2.4 MB a season)
    // don't pack. Saves are stored gzipped (engine/storage.ts): about 0.9 MB for a season.
    const boxes = (x: unknown) => JSON.stringify((x as typeof s).games).length;
    expect(boxes(JSON.parse(packed))).toBeLessThan(boxes(s) * 0.6);
    expect(gzipSync(packed).length).toBeLessThan(1.5e6);
    expect(JSON.parse(JSON.stringify(unpackSeason(packed)))).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('keeps dynasties in save slots, with a summary for each card', async () => {
    const a = newSeason({ ...defaultConfig('georgia'), length: 'open' }, 3);
    const b = newSeason({ ...defaultConfig('texas'), length: 'open' }, 4);
    // An old single save moves into the first free slot.
    setItem(SEASON_KEY, packSeason(a));
    migrateLegacySave();
    expect(getItem(SEASON_KEY)).toBeNull();
    expect(slotMeta(1)).toMatchObject({ teamId: 'georgia', year: a.year, phase: 'WEEK 1', record: '0-0', seasons: 1 });
    expect(freeSlot()).toBe(2);
    saveSlot(2, b);
    expect(latestSlot()).toBe(2);
    expect((await loadSlot(1))?.config.userTeamId).toBe('georgia');
    expect((await loadSlot(2))?.config.userTeamId).toBe('texas');
    deleteSlot(2);
    expect(slotMeta(2)).toBeNull();
    expect(await loadSlot(2)).toBeNull();
    expect(latestSlot()).toBe(1);
    deleteSlot(1);
    expect(latestSlot()).toBe(0);
  });
});
