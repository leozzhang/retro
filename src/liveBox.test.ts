import { describe, expect, it } from 'vitest';
import { freshSquad, starters } from './data/depth';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { simulateDrive, type SimPlay } from './game/rules';
import { castDrive } from './season/cast';
import {
  creditCpuDrive, creditUserFg, creditUserSnap, finishLiveBox, liveGamePlays, newLiveBox, storyAgainst, storyCpuDrive, storyUserPoints, storyUserSnap,
  userCredit, type SnapAt,
} from './season/liveBox';
import { gamePlays, lineScore, playCaption, scorer } from './season/gamePlays';
import { gameStars, impact } from './season/gameStars';
import { lineupOf, simGame } from './season/simGame';
import { autoGamePlan } from './season/staff';
import { newStory } from './season/story';
import type { PlayerLine, SeasonGame } from './season/types';
import { gameSpan, newsRich } from './render/links';

describe('live box score', () => {
  const user = freshSquad(teamById('georgia'));
  const cpu = freshSquad(teamById('alabama'));
  const uOn = starters(user);
  const cOn = starters(cpu);
  const fresh = () => newLiveBox({ id: 'georgia', on: uOn }, { id: 'alabama', on: cOn }, mulberry32(7), { home: 'georgia', away: 'alabama' });

  it('credits passes, runs and sacks NCAA style', () => {
    const box = fresh();
    creditUserSnap(box, { kind: 'catch', qb: uOn.QB, who: uOn.X, yds: 25, td: true });
    creditUserSnap(box, { kind: 'inc', qb: uOn.QB, yds: 0, td: false });
    creditUserSnap(box, { kind: 'int', qb: uOn.QB, yds: 0, td: false, turnover: true });
    creditUserSnap(box, { kind: 'run', who: uOn.RB, yds: 12, td: false });
    creditUserSnap(box, { kind: 'sack', who: uOn.QB, by: cOn.DE1 ?? Object.values(cOn)[0], yds: -7, td: false });
    creditUserFg(box, uOn.K, true);
    const b = finishLiveBox(box, true, 10, 0);
    expect(b.home).toEqual({ points: 10, yards: 30, passYds: 25, rushYds: 5, turnovers: 1, plays: 5 });
    const line = (id: string) => b.players.find((l) => l.id === id)!;
    const qb = line(uOn.QB.id);
    expect([qb.cmp, qb.att, qb.passYds, qb.passTd, qb.int, qb.rush, qb.rushYds]).toEqual([1, 3, 25, 1, 1, 1, -7]);
    expect([line(uOn.X.id).rec, line(uOn.X.id).recYds, line(uOn.X.id).recTd]).toEqual([1, 25, 1]);
    expect([line(uOn.RB.id).rush, line(uOn.RB.id).rushYds]).toEqual([1, 12]);
    expect([line(uOn.K.id).fgm, line(uOn.K.id).fga]).toEqual([1, 1]);
  });

  it("credits the CPU's simulated drives to its players, pass + rush = yards", () => {
    const box = fresh();
    const rng = mulberry32(3);
    const plan = autoGamePlan(cpu, user);
    for (let i = 0; i < 12; i++) {
      const plays: SimPlay[] = [];
      const clock = { timeLeft: 900, hurry: false, milk: false, lead: 0, finalHalf: false, qSecs: 480 };
      const d = simulateDrive(80, 75, 25, rng, clock, (p) => plays.push(p));
      creditCpuDrive(box, d, plays, castDrive(plays, lineupOf(cpu, plan), lineupOf(user, plan), clock, rng));
    }
    const b = finishLiveBox(box, false, 0, 0);
    expect(b.home.yards).toBeGreaterThan(0);
    expect(b.home.passYds + b.home.rushYds).toBe(b.home.yards);
    // The offense's lines are the CPU's; the user's defenders get its sacks and picks.
    expect(b.players.filter((l) => l.att || l.rush || l.rec || l.fga).every((l) => l.team === 'alabama')).toBe(true);
    expect(b.players.filter((l) => l.team === 'georgia').every((l) => l.sk || l.defInt)).toBe(true);
    const qb = b.players.find((l) => l.id === cOn.QB.id)!;
    expect(qb.passYds).toBe(b.home.passYds);
  });

  it('carries the simulated quarters into the live part', () => {
    const box = fresh();
    creditUserSnap(box, { kind: 'run', who: uOn.RB, yds: 10, td: false });
    const half = finishLiveBox(box, true, 7, 3);
    const next = newLiveBox(box.user, box.cpu, box.user.cast, { home: 'georgia', away: 'alabama', from: { user: half.home, cpu: half.away, players: half.players } });
    creditUserSnap(next, { kind: 'run', who: uOn.RB, yds: 5, td: false });
    const b = finishLiveBox(next, true, 14, 3);
    expect(b.home.rushYds).toBe(15);
    expect(b.players.find((l) => l.id === uOn.RB.id)!.rushYds).toBe(15);
  });

  it("credits the CPU defender's sack", () => {
    const box = fresh();
    const sacker = Object.values(cOn).find((a) => a.pos === 'DE' || a.pos === 'OLB')!;
    creditUserSnap(box, { kind: 'sack', who: uOn.QB, by: sacker, yds: -6, td: false });
    const b = finishLiveBox(box, true, 0, 0);
    expect(b.players.find((l) => l.id === sacker.id)!.sk).toBe(1);
  });

  it("tells the user's drives, the CPU's and a pick six, and the plays add up to the score", () => {
    const box = fresh();
    const at = (half: number, left: number, user: number, cpu: number): SnapAt => ({ half, left, qSecs: 480, score: { georgia: user, alabama: cpu } });
    const slotOf = (a: { id: string }) => [...Object.entries(uOn), ...Object.entries(cOn)].find(([, x]) => x.id === a.id)?.[0];
    // A 40-yard catch, then a 35-yard touchdown catch and the kick: 7.
    const snap1 = { kind: 'catch' as const, qb: uOn.QB, who: uOn.X, yds: 40, td: false };
    storyUserSnap(box, at(0, 900, 0, 0), { gain: 40, explosive: true, turnover: false, down: 1, toGo: 10, yard: 25, t: 0, lev: 0.2 }, userCredit(snap1, slotOf, true));
    const snap2 = { kind: 'catch' as const, qb: uOn.QB, who: uOn.X, yds: 35, td: true };
    storyUserSnap(box, at(0, 880, 0, 0), { gain: 35, explosive: true, turnover: false, down: 1, toGo: 10, yard: 65, t: 0, lev: 0.3 }, userCredit(snap2, slotOf, true));
    storyUserPoints(box, 6, 'TOUCHDOWN');
    storyUserPoints(box, 1);
    // The CPU's field goal drive.
    storyCpuDrive(box, {
      off: 'alabama', half: 0, left: 860, qSecs: 480, score: { georgia: 7, alabama: 0 }, start: 25, result: 'FIELD GOAL', points: 3,
      plays: [{ gain: 0, explosive: false, turnover: false, down: 4, toGo: 5, yard: 70, t: 120, lev: 0.2, fg: { dist: 47, made: true } }], credit: { snaps: [null] },
    });
    // A pick six against the user.
    const pick = { gain: 0, explosive: false, turnover: true, down: 2, toGo: 8, yard: 40, t: 0, lev: 0.4 };
    const picker = Object.values(cOn).find((a) => a.pos === 'CB')!;
    storyUserSnap(box, at(1, 600, 7, 3), pick, userCredit({ kind: 'int', qb: uOn.QB, by: picker, yds: 0, td: false, turnover: true }, slotOf, true));
    storyAgainst(box, pick, 7, 'pick6');
    const plays = liveGamePlays(box);
    expect(plays.map((p) => p.kind)).toEqual(['explosive', 'td', 'fg', 'pick6']);
    expect(plays.reduce((t, p) => t + p.pts, 0)).toBe(17);
    expect(plays[3]).toMatchObject({ for: 'alabama', by: picker.id, score: [7, 10], q: 3 });
    expect(scorer(plays[3])).toBe('alabama');
    const ls = lineScore(plays, 'georgia', 0);
    expect(ls).toEqual({ home: [7, 0, 0, 0], away: [3, 0, 7, 0] });
    const names = (id: string) => (id === uOn.X.id ? 'Sam Jones' : id === picker.id ? 'Lee Park' : undefined);
    expect(playCaption(plays[1], names, 'Carson Beck')).toBe('S. JONES 35-YD TD PASS FROM C. BECK');
    expect(playCaption(plays[3], names)).toBe('L. PARK PICK SIX');
  });
});

describe('game pages', () => {
  const home = freshSquad(teamById('georgia'));
  const away = freshSquad(teamById('alabama'));

  it("keeps a simulated game's scoring plays, adding up to the final by quarter", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = simGame(home, away, mulberry32(seed));
      const plays = r.plays!;
      expect(plays.reduce((t, p) => t + p.pts, 0)).toBe(r.home + r.away);
      const ls = lineScore(plays, 'georgia', r.ot);
      expect(ls.home.reduce((a, b) => a + b, 0)).toBe(r.home);
      expect(ls.away.reduce((a, b) => a + b, 0)).toBe(r.away);
      // Kept in order: quarters never go back.
      plays.forEach((p, i) => i && expect(p.q).toBeGreaterThanOrEqual(plays[i - 1].q));
    }
  });

  it("credits the defenders' sacks and picks the way the snaps were cast", () => {
    const story = newStory('georgia', 'alabama');
    const r = simGame(home, away, mulberry32(5), { story });
    let sk = 0;
    let picks = 0;
    for (const d of story.drives) for (const c of d.credit.snaps) {
      if (c?.kind === 'sack' && c.by) sk++;
      if (c?.kind === 'int' && c.by) picks++;
    }
    expect(r.box.players.reduce((t, l) => t + l.sk, 0)).toBe(sk);
    expect(r.box.players.reduce((t, l) => t + l.defInt, 0)).toBe(picks);
    // Watching changes nothing.
    expect(simGame(home, away, mulberry32(5))).toEqual(r);
    expect(gamePlays(story, { georgia: lineupOf(home, autoGamePlan(home, away)).on, alabama: lineupOf(away, autoGamePlan(away, home)).on })).toEqual(r.plays);
  });

  const line = (id: string, team: string, pos: PlayerLine['pos'], st: Partial<PlayerLine>): PlayerLine => ({
    id, team, name: id, pos, cmp: 0, att: 0, passYds: 0, passTd: 0, int: 0, rush: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0,
    fgm: 0, fga: 0, sk: 0, defInt: 0, ...st,
  });

  it('picks a receiver with the standout day over a routine quarterback, and no one twice', () => {
    const qb = line('qb', 'georgia', 'QB', { cmp: 20, att: 31, passYds: 240, passTd: 1 });
    const wr = line('wr', 'georgia', 'WR', { rec: 9, recYds: 182, recTd: 2 });
    const rb = line('rb', 'georgia', 'HB', { rush: 18, rushYds: 70 });
    const de = line('de', 'alabama', 'DE', { sk: 1 });
    expect(impact(wr)).toBeGreaterThan(impact(qb));
    const g: SeasonGame = {
      id: 'g1', week: 1, home: 'georgia', away: 'alabama', kind: 'nonconf', neutral: false,
      result: {
        home: 24, away: 10, ot: 0,
        box: { home: { points: 24, yards: 310, passYds: 240, rushYds: 70, turnovers: 0, plays: 60 }, away: { points: 10, yards: 250, passYds: 150, rushYds: 100, turnovers: 1, plays: 55 }, players: [qb, wr, rb, de] },
        plays: [{ q: 4, time: 100, off: 'georgia', kind: 'td', yds: 50, yard: 50, down: 3, toGo: 4, pass: true, who: 'wr', pts: 7, score: [24, 10], lev: 0.6 }],
      },
    };
    const stars = gameStars(g, () => 70);
    expect(stars[0]).toMatchObject({ kind: 'pog', id: 'wr' });
    expect(new Set(stars.map((c) => c.id)).size).toBe(stars.length);
  });

  it("links a news item's score to its game", () => {
    expect(gameSpan('UPSET: TULANE STUNS #8 OLE MISS 31-28 (OT)', 'w5-x')).toMatchObject({ start: 32, len: 10, link: { kind: 'game', id: 'w5-x' } });
    expect(gameSpan('J. DOE (UGA): 212 RUSHING YARDS AND 2 TD', 'w5-y')).toMatchObject({ start: 14 });
    expect(gameSpan('NO GAME HERE 3-1', undefined)).toBeNull();
    expect(typeof newsRich).toBe('function');
  });
});
