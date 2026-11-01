import { beforeAll, describe, expect, it } from 'vitest';
import { generatedAthlete, starters } from './data/depth';
import { overall, type Position } from './data/positions';
import { parseWalkOn, walkOnId } from './data/rosterGen';
import { TEAMS, teamById } from './data/teams';
import { advanceOffseason, simOffseason, startOffseason, startToPortal } from './season/offseason';
import {
  actOnLeaving, appeal, buildBoard, entryOdds, judgePromises, leavingList, MIN_COUNT, motives, offer, offerCap, PORTAL, ptFactor, type School,
} from './season/portal';
import { defaultConfig, newSeason, simSeason } from './season/season';
import type { SeasonState } from './season/types';
import { baseRoster, squadFor } from './season/world';

/** One played-out open season, shared; each test takes a copy. */
let done: string;
const copy = (): SeasonState => JSON.parse(done);
const config = (portal: boolean) => ({ ...defaultConfig('georgia'), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal } });

beforeAll(() => {
  const s = newSeason(config(true), 7);
  simSeason(s);
  done = JSON.stringify(s);
}, 60_000);

describe('roster deltas', () => {
  it('a player laid onto another roster shows up there, with his progress, and leaves the old one', () => {
    const s = newSeason(defaultConfig('georgia'), 3);
    const id = 'alabama-3';
    const a = generatedAthlete(id)!;
    expect(a.id).toBe(id);
    s.teamState.alabama = { roster: { out: [id] } };
    s.teamState.georgia = { roster: { in: [{ id, num: 98 }] }, progress: { [id]: { xp: 0, lvl: 1, d: { spd: 3 } } } };
    const uga = squadFor(s, 'georgia');
    const moved = uga.athletes.find((x) => x.id === id)!;
    expect(moved.num).toBe(98);
    expect(moved.r.spd).toBe(a.r.spd + 3);
    expect(uga.athletes.length).toBe(86);
    expect(squadFor(s, 'alabama').athletes.some((x) => x.id === id)).toBe(false);
    expect(Object.values(uga.depth).flat()).toContain(id);
  });

  it('walk-ons rebuild from their id alone', () => {
    const id = walkOnId('michigan', 2027, 'QB', 0);
    expect(parseWalkOn(id)).toEqual({ team: 'michigan', pos: 'QB' });
    const a = generatedAthlete(id)!;
    expect(a).toEqual(generatedAthlete(id));
    expect(a.pos).toBe('QB');
    expect(a.stars).toBe(1);
    expect(a.year).toBe('FR');
  });
});

describe('who enters', () => {
  it('a star at a weak program is likelier to enter than one at a power', () => {
    const s = copy();
    startToPortal(s);
    const board = buildBoard(s);
    const topOdds = (tier: number) => {
      const ps: number[] = [];
      for (const t of TEAMS.filter((x) => x.profile.tier === tier)) {
        const best = [...board.players.values()].filter((p) => p.team === t.id).sort((x, y) => y.ovr - x.ovr).slice(0, 3);
        for (const p of best) ps.push(entryOdds(s, board, p.a.id).p);
      }
      return ps.reduce((a, b) => a + b, 0) / ps.length;
    };
    expect(topOdds(5)).toBeGreaterThan(topOdds(1));
  });

  it('a buried gem at a power program looks to leave, and more than its starters', () => {
    const s = copy();
    startToPortal(s);
    const board = buildBoard(s);
    const gems: number[] = [];
    const starts: number[] = [];
    for (const [id, p] of board.players) {
      if (teamById(p.team).profile.tier !== 1) continue;
      const pt = ptFactor(board.schools.get(p.team)!, p.a.pos, p.ovr, p.ovr);
      const o = entryOdds(s, board, id);
      if (pt < 0.3 && p.ovr >= 78) gems.push(o.p);
      if (pt > 0.7) starts.push(o.p);
    }
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    expect(gems.length).toBeGreaterThan(10);
    // Seniors have graduated by now, so the charts are next year's and the buried are underclassmen.
    expect(mean(gems)).toBeGreaterThan(1.5 * mean(starts));
    expect(Math.max(...gems)).toBeGreaterThan(0.3);
  });

  it('a playing-time-first player picks a start over prestige', () => {
    const s = copy();
    const board = buildBoard(s);
    const pl = [...board.players.values()].find((p) => motives(p.a).PT >= 0.45 && p.a.pos === 'WR')!;
    const school = (win: number, chart: number[]): School => ({
      id: 'x', home: 'ZZ', win, dev: board.schools.get('georgia')!.dev, room: 0, extra: 0,
      chart: new Map<Position, number[]>([['WR', chart]]), count: new Map(), size: 80, left: 0, gone: 0, signed: 0,
    });
    const blueBlood = school(0.9, [pl.ovr + 6, pl.ovr + 5, pl.ovr + 4, pl.ovr + 3]);
    const startsHere = school(0.4, [pl.ovr - 5, pl.ovr - 6, pl.ovr - 7]);
    expect(appeal(startsHere, pl.a, pl.ovr)).toBeGreaterThan(appeal(blueBlood, pl.a, pl.ovr));
  });
});

describe('a whole offseason', () => {
  let a: SeasonState;
  let old: SeasonState;
  beforeAll(() => {
    old = copy();
    a = simOffseason(old);
  }, 60_000);

  it('rolls into next season with rosters at the cap, everyone on one team, positions filled', () => {
    expect(a.year).toBe(old.year + 1);
    expect(a.phase).toBe('regular');
    const seen = new Set<string>();
    for (const t of TEAMS) {
      const r = baseRoster(a, t.id);
      expect(r.length).toBe(PORTAL.rosterMax);
      const byPos = new Map<string, number>();
      for (const x of r) {
        expect(seen.has(x.id)).toBe(false);
        seen.add(x.id);
        byPos.set(x.pos, (byPos.get(x.pos) ?? 0) + 1);
      }
      for (const [pos, min] of Object.entries(MIN_COUNT)) expect(byPos.get(pos) ?? 0).toBeGreaterThanOrEqual(min);
      expect(Object.keys(starters(squadFor(a, t.id))).length).toBeGreaterThan(20);
    }
  });

  it('entrants come at about the target rate, and transfers carry their progress and a fresh mood', () => {
    const p = old.portal!;
    const per = p.entrants.length / TEAMS.length;
    expect(per).toBeGreaterThan(8);
    expect(per).toBeLessThan(18);
    const moved = p.entrants.filter((e) => e.out === 'commit' && p.commits[e.id] !== e.from);
    expect(moved.length).toBeGreaterThan(200);
    for (const e of moved.slice(0, 50)) {
      const to = p.commits[e.id];
      const prog = a.teamState[to].progress![e.id];
      expect(prog.tr).toEqual({ from: e.from, year: old.year });
      expect(a.teamState[e.from]?.progress?.[e.id]).toBeUndefined();
      expect(a.teamState[to].mo![e.id]).toBeDefined();
      // He arrives as he left, then grows in the offseason like everyone else.
      const sq = squadFor(a, to).athletes.find((x) => x.id === e.id)!;
      expect(overall(sq.r, sq.pos)).toBeGreaterThanOrEqual(e.ovr);
    }
  });

  it('is deterministic, and a save mid-carousel or mid-portal continues identically', () => {
    const b = simOffseason(copy());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    let c = copy();
    startOffseason(c);
    c = advanceOffseason(JSON.parse(JSON.stringify(c)));
    while (c.offseason?.stage === 'carousel') c = advanceOffseason(c);
    c = advanceOffseason(c);
    c = advanceOffseason(JSON.parse(JSON.stringify(c)));
    c = JSON.parse(JSON.stringify(c));
    while (c.phase === 'offseason') c = advanceOffseason(c);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  }, 60_000);

  it('only open-ended seasons have an offseason', () => {
    const s = copy();
    s.config.length = 'single';
    startToPortal(s);
    expect(s.phase).toBe('complete');
  });
});

describe('the user side', () => {
  /** The user coaches a mid-table program: a power's roster may have no one thinking of leaving. */
  const user = TEAMS.find((t) => t.profile.tier === 3)!.id;
  const opened = () => {
    const s = copy();
    s.config.userTeamId = user;
    s.config.delegate.portal = false;
    startToPortal(s);
    return s;
  };

  it('lists the players considering the portal, and meetings are limited', () => {
    const s = opened();
    const ids = Object.keys(s.portal!.leaving);
    expect(ids.length).toBeGreaterThan(1);
    for (const e of Object.values(s.portal!.leaving)) expect(e.p).toBeGreaterThanOrEqual(PORTAL.considering);
    let met = 0;
    for (const id of ids) if (actOnLeaving(s, id, 'meet')) met++;
    expect(met).toBe(Math.min(ids.length, PORTAL.meet.n));
  });

  it('an encouraged player enters; a promised one gets the promise on his record', () => {
    const s = opened();
    const [go, stay] = Object.keys(s.portal!.leaving);
    actOnLeaving(s, go, 'encourage');
    actOnLeaving(s, stay, 'promise', 'start');
    expect(s.teamState[user].progress![stay].pr).toEqual({ kind: 'start', year: s.year + 1, to: user });
    advanceOffseason(s);
    expect(s.portal!.entrants.some((e) => e.id === go)).toBe(true);
  });

  it('offers are capped by open spots plus the margin', () => {
    const s = opened();
    advanceOffseason(s);
    const board = buildBoard(s);
    const cap = offerCap(board, user);
    let n = 0;
    for (const e of s.portal!.entrants) if (offer(s, user, e.id)) n++;
    expect(n).toBe(cap);
    expect(s.portal!.offers[user].length).toBe(cap);
    const sch = board.schools.get(user)!;
    expect(cap).toBeLessThanOrEqual(Math.ceil(PORTAL.signShare * sch.left + PORTAL.departShare * sch.gone) + PORTAL.overOffer);
  });

  it('a kept promise lifts morale; a broken one hurts and pushes him toward the portal', () => {
    const s = copy();
    const ts = s.teamState.georgia;
    // Starters who'll still be there after departures: seniors graduate before the portal.
    const st = Object.values(starters(squadFor(s, 'georgia'))).filter((x) => x.year !== 'SR' && x.year !== 'JR');
    const kept = st[0].id;
    const broken = st.find((x) => x.id !== kept && (ts.progress?.[x.id]?.gs ?? 0) > 0)!.id;
    const gp = ts.gp!;
    for (const [id, gs] of [[kept, gp], [broken, 0]] as const) {
      const p = (ts.progress![id] ??= { xp: 0, lvl: 0, d: {} });
      p.gs = gs;
      p.pr = { kind: 'start', year: s.year, to: 'georgia' };
    }
    const before = { kept: ts.mo![kept], broken: ts.mo![broken] };
    startToPortal(s);
    expect(s.offseason!.promises).toEqual({ kept: 1, broken: 1 });
    expect(ts.mo![kept]).toBeGreaterThan(before.kept);
    expect(ts.mo![broken]).toBeLessThan(before.broken);
    expect(ts.progress![broken].pb).toBe(s.year);
    expect(ts.progress![kept].pr).toBeUndefined();
    const board = buildBoard(s);
    const was = entryOdds(s, board, broken).logit;
    delete ts.progress![broken].pb;
    expect(was).toBeGreaterThan(entryOdds(s, board, broken).logit);
    expect(judgePromises(s)).toEqual({ kept: 0, broken: 0 });
  });

  it('the leaving list only holds the user\'s own players', () => {
    const s = opened();
    const roster = new Set(baseRoster(s, user).map((x) => x.id));
    for (const id of Object.keys(leavingList(s, user))) expect(roster.has(id)).toBe(true);
  });
});
