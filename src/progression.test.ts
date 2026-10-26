import { describe, expect, it } from 'vitest';
import { ARCHETYPES, templateValue, type Athlete } from './data/athletes';
import { buildSquad, positionOrder, starters, type Squad } from './data/depth';
import { OVR_WEIGHTS, overallRaw, POSITIONS, SLOT_POS, type Position } from './data/positions';
import { RATING_KEYS, type RatingKey, type Ratings } from './data/ratings';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { simulateDrive, type SimPlay } from './game/rules';
import { DEF_SLOTS, expectedSuccess, expectedWin, GRADES, gradeGame, OFF_SLOTS, successful, type GameGrade } from './season/grades';
import {
  ceiling, deltaText, gameXp, LEVEL_XP, levelUp, potentialFactor, PROGRESSION, progressTeam, ratingChange, upgradedLastWeek, xpMultiplier,
} from './season/progression';
import { advanceWeek, defaultConfig, newSeason, userGameThisWeek } from './season/season';
import { simGame } from './season/simGame';
import type { DriveLog, Progress, TeamState } from './season/types';
import { squadFor } from './season/world';

/** Every athlete on the team set to his position's template at `level`, so every matchup is even. */
function templateSquad(id: string, level: number, prefix = ''): Squad {
  const base = buildSquad(teamById(id));
  const pre = (x: string) => prefix + x;
  const depth: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(base.depth)) depth[k] = v.map(pre);
  const athletes = base.athletes.map((a) => {
    const r = {} as Ratings;
    for (const k of RATING_KEYS) r[k] = Math.round(templateValue(a.pos, k, level));
    return { ...a, id: pre(a.id), r };
  });
  return { team: prefix ? { ...base.team, id: prefix + base.team.id } : base.team, athletes, depth };
}

/** A generated player of `pos` set to his template at `level`, with room to grow. */
function prospect(pos: Position, level: number, archetype?: string): Athlete {
  const a = buildSquad(teamById('georgia')).athletes.find((x) => x.pos === pos)!;
  const r = {} as Ratings;
  const arch = archetype ? ARCHETYPES[pos][archetype] : {};
  for (const k of RATING_KEYS) r[k] = Math.round(templateValue(pos, k, level) + (arch[k] ?? 0));
  return { ...a, r, archetype: archetype ?? a.archetype, potential: level + 15, dev: 'impact', year: 'SO', redshirt: false };
}

const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;

describe('progression', () => {
  it('logging a simulated drive changes nothing about it', () => {
    for (let seed = 0; seed < 40; seed++) {
      const plays: SimPlay[] = [];
      const a = simulateDrive(82, 78, 25, mulberry32(seed), { timeLeft: 600, hurry: false, milk: false });
      const b = simulateDrive(82, 78, 25, mulberry32(seed), { timeLeft: 600, hurry: false, milk: false }, (p) => plays.push(p));
      expect(b).toEqual(a);
      expect(plays.filter((p) => !p.fg && !p.punt).length).toBeGreaterThan(0);
    }
  });

  it('fair: full-time starters earn the same XP per game at every position in even games', () => {
    const home = templateSquad('georgia', 80);
    const away = templateSquad('georgia', 80, 'm-');
    const st = starters(home);
    const slots = [...OFF_SLOTS, ...DEF_SLOTS, 'K', 'P'];
    const xp = new Map<string, number[]>();
    const side = { off: [] as number[], def: [] as number[] };
    for (let i = 0; i < 200; i++) {
      const drives: DriveLog[] = [];
      simGame(home, away, mulberry32(i), { neutral: true, drives });
      const grades = gradeGame(home, away, drives, { [home.team.id]: 0.5, [away.team.id]: 0.5 }, mulberry32(9000 + i));
      for (const slot of slots) {
        const g = grades.get(st[slot].id) as GameGrade;
        const pos = SLOT_POS[slot];
        (xp.get(pos) ?? xp.set(pos, []).get(pos)!).push(gameXp(g));
        if (OFF_SLOTS.includes(slot)) side.off.push(gameXp(g));
        if (DEF_SLOTS.includes(slot)) side.def.push(gameXp(g));
      }
    }
    const means = [...xp.entries()].map(([pos, x]) => [pos, avg(x)] as const);
    const mean = avg(means.map(([, m]) => m));
    for (const [pos, m] of means) expect(Math.abs(m / mean - 1), `${pos} ${m.toFixed(1)} vs ${mean.toFixed(1)}`).toBeLessThan(0.1);
    expect(Math.abs(avg(side.off) / avg(side.def) - 1)).toBeLessThan(0.05);
  });

  it("grades don't reward winning: a strong team beating a weak one earns no more XP than the weak team", () => {
    const strong = templateSquad('georgia', 88);
    const weak = templateSquad('georgia', 68, 'w-');
    const unit = (sq: Squad) => {
      const st = starters(sq);
      return [...OFF_SLOTS, ...DEF_SLOTS].map((slot) => st[slot].id);
    };
    const xp = { strong: [] as number[], weak: [] as number[] };
    const grade = { strong: [0, 0], weak: [0, 0] };
    let wins = 0;
    for (let i = 0; i < 150; i++) {
      const drives: DriveLog[] = [];
      const r = simGame(strong, weak, mulberry32(i), { neutral: true, drives });
      if (r.home > r.away) wins++;
      const g = gradeGame(strong, weak, drives, { [strong.team.id]: 0.5, [weak.team.id]: 0.5 }, mulberry32(500 + i));
      for (const [k, sq] of [['strong', strong], ['weak', weak]] as const) {
        for (const id of unit(sq)) {
          const gg = g.get(id)!;
          xp[k].push(gameXp(gg));
          grade[k][0] += gg.sum;
          grade[k][1] += gg.snaps;
        }
      }
    }
    expect(wins).toBeGreaterThan(140);
    expect(Math.abs(avg(xp.strong) / avg(xp.weak) - 1)).toBeLessThan(0.05);
    expect(Math.abs(grade.strong[0] / grade.strong[1])).toBeLessThan(0.01);
    expect(Math.abs(grade.weak[0] / grade.weak[1])).toBeLessThan(0.01);
  });

  it('a snap is graded against what the matchup expects', () => {
    // Holding a block against an elite rusher is worth more than against a weak one; losing it costs less.
    const even = expectedSuccess(0);
    const vsElite = expectedWin(-15, 1, GRADES.play, even);
    const vsWeak = expectedWin(15, 1, GRADES.play, even);
    expect(1 - vsElite).toBeGreaterThan(1 - vsWeak);
    expect(0 - vsElite).toBeGreaterThan(0 - vsWeak);
    // The defense's expectation mirrors the offense's.
    expect(expectedWin(-15, -1, GRADES.play, even)).toBeCloseTo(1 - expectedWin(15, 1, GRADES.play, even), 10);
    // A better offense is expected to succeed more often.
    expect(expectedSuccess(20)).toBeGreaterThan(expectedSuccess(0));
    expect(expectedSuccess(0)).toBeGreaterThan(expectedSuccess(-20));
  });

  it('beating the expected result grades above 0, falling short below', () => {
    const home = templateSquad('georgia', 80);
    const away = templateSquad('georgia', 80, 'm-');
    const offense = (good: boolean): DriveLog[] => [{
      off: home.team.id,
      plays: Array.from({ length: 70 }, (_, i) => ({ gain: good ? 12 : 1, pass: i % 2 === 0, down: 1, toGo: 10 })),
    }];
    const avgGrade = (drives: DriveLog[]) => {
      const g = gradeGame(home, away, drives, {}, mulberry32(2));
      const st = starters(home);
      return avg(OFF_SLOTS.map((slot) => { const x = g.get(st[slot].id)!; return x.sum / x.snaps; }));
    };
    expect(offense(true)[0].plays.every((p) => successful(p))).toBe(true);
    expect(avgGrade(offense(true))).toBeGreaterThan(0.05);
    expect(avgGrade(offense(false))).toBeLessThan(-0.05);
  });

  it('fair: a level-up is worth about the same overall per XP at every position', () => {
    const per: [Position, number][] = POSITIONS.map((pos) => {
      const rng = mulberry32(5);
      const gains: number[] = [];
      for (let i = 0; i < 400; i++) {
        const a = prospect(pos, 72);
        const r = { ...a.r };
        levelUp(r, a, {}, rng);
        gains.push(overallRaw(r, pos) - overallRaw(a.r, pos));
      }
      return [pos, avg(gains) / LEVEL_XP[pos]];
    });
    const mean = avg(per.map(([, v]) => v));
    for (const [pos, v] of per) expect(Math.abs(v / mean - 1), pos).toBeLessThan(0.15);
  });

  it('the XP multiplier is clamped, however the bonuses stack', () => {
    const hot = { ...prospect('WR', 50), potential: 99, dev: 'elite', year: 'FR' } as Athlete;
    const hotProg: Progress = { xp: 0, lvl: 0, d: {}, c: 1 };
    const m = xpMultiplier(hot, hotProg, 1, true);
    expect(m.headroom * m.dev * m.confidence * m.morale * m.year).toBeGreaterThan(PROGRESSION.multMax);
    expect(m.total).toBe(PROGRESSION.multMax);
    // Below potential, the floor holds however the penalties stack.
    const cold = { ...prospect('WR', 80), potential: 82, dev: 'normal', year: 'SR', redshirt: true } as Athlete;
    const coldProg: Progress = { xp: 0, lvl: 0, d: {}, c: -1 };
    expect(xpMultiplier(cold, coldProg, 0, false).total).toBeCloseTo(PROGRESSION.multMin, 10);
  });

  it('at his potential a player grows very slowly, and past it slower still, but never stops', () => {
    expect(potentialFactor(3)).toBe(1);
    expect(potentialFactor(1)).toBe(1);
    expect(potentialFactor(0)).toBe(PROGRESSION.atPotential);
    expect(potentialFactor(0.5)).toBeGreaterThan(PROGRESSION.atPotential);
    expect(potentialFactor(-2)).toBeCloseTo(PROGRESSION.atPotential / 4, 10);
    expect(potentialFactor(-6)).toBeGreaterThan(0);
    const a = { ...prospect('WR', 80), potential: 80, dev: 'elite', year: 'FR' } as Athlete;
    const m = xpMultiplier(a, undefined, 1, true);
    expect(m.total).toBeLessThan(PROGRESSION.multMin);
    expect(m.total).toBeGreaterThan(0);
  });

  it('a level-up that lands nothing is no level and no breakthrough', () => {
    // Every rating already at its ceiling.
    const base = buildSquad(teamById('georgia')).athletes.find((x) => x.pos === 'OT')!;
    const r = { ...base.r };
    for (const k of RATING_KEYS) r[k] = Math.ceil(ceiling(base, k));
    const rng = mulberry32(1);
    for (let i = 0; i < 300; i++) {
      const up = levelUp({ ...r }, base, {}, rng);
      expect(up.d).toEqual({});
      expect(up.big).toBe(false);
    }
    const squad = buildSquad(teamById('georgia'));
    const grown = { ...squad, athletes: squad.athletes.map((x) => (x.id === base.id ? { ...x, r } : x)) };
    const ts: TeamState = { progress: { [base.id]: { xp: 10_000, lvl: 0, d: {} } } };
    const g: GameGrade = { team: 'georgia', snaps: 70, share: 1, sum: 0, tags: {}, hits: 0, lsum: 0, lw: 70 };
    const events = progressTeam(ts, grown, new Map([[base.id, g]]), 3, 0.5, rng);
    expect(events.filter((e) => e.athlete.id === base.id)).toEqual([]);
    expect(ts.progress![base.id].lvl).toBe(0);
    expect(ts.progress![base.id].up).toBeUndefined();
  });

  it('level-ups give 1-3 points, a rare breakthrough 4-6, and never pass a ceiling', () => {
    const rng = mulberry32(3);
    let big = 0;
    for (let i = 0; i < 3000; i++) {
      const a = prospect('HB', 75);
      const r = { ...a.r };
      const up = levelUp(r, a, {}, rng);
      const n = Object.values(up.d).reduce((x, y) => x + (y ?? 0), 0);
      if (up.big) {
        big++;
        expect(n).toBeGreaterThanOrEqual(4);
        expect(n).toBeLessThanOrEqual(6);
      } else {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
    expect(big / 3000).toBeGreaterThan(0.02);
    expect(big / 3000).toBeLessThan(0.07);
    // A player near his ceiling stops growing at it.
    const a = { ...prospect('OT', 90), potential: 91 };
    const r = { ...a.r };
    for (let i = 0; i < 300; i++) levelUp(r, a, {}, rng);
    for (const k of RATING_KEYS) {
      expect(r[k]).toBeLessThanOrEqual(Math.max(a.r[k], Math.ceil(ceiling(a, k))));
      expect(r[k]).toBeLessThanOrEqual(99);
    }
  });

  it('speed almost never rises; skills take most of the points', () => {
    const rng = mulberry32(8);
    const got: Partial<Record<RatingKey, number>> = {};
    for (let i = 0; i < 1000; i++) {
      const a = prospect('WR', 72);
      const up = levelUp({ ...a.r }, a, {}, rng);
      for (const [k, v] of Object.entries(up.d) as [RatingKey, number][]) got[k] = (got[k] ?? 0) + v;
    }
    const total = Object.values(got).reduce((x, y) => x + (y ?? 0), 0);
    expect((got.spd ?? 0) / total).toBeLessThan(0.02);
    expect(((got.rte ?? 0) + (got.cth ?? 0) + (got.cit ?? 0)) / total).toBeGreaterThan(0.5);
  });

  it('players keep their identity: a pocket passer stays a pocket passer', () => {
    const grow = (arch: string) => {
      const a = prospect('QB', 72, arch);
      const r = { ...a.r };
      const rng = mulberry32(4);
      for (let i = 0; i < 30; i++) levelUp(r, a, {}, rng);
      return { a, r };
    };
    const pocket = grow('pocket');
    const dual = grow('dual');
    expect(pocket.r.spd).toBeLessThan(dual.r.spd);
    expect(pocket.r.elu).toBeLessThan(dual.r.elu);
    const gain = (x: { a: Athlete; r: Ratings }, k: RatingKey) => x.r[k] - x.a.r[k];
    const passing = (['sac', 'mac', 'dac', 'arm', 'pac'] as RatingKey[]).reduce((s, k) => s + gain(pocket, k), 0);
    const legs = (['spd', 'acc', 'elu', 'sta'] as RatingKey[]).reduce((s, k) => s + gain(pocket, k), 0);
    expect(passing).toBeGreaterThan(legs * 4);
    expect(pocket.r.sac - pocket.r.spd).toBeGreaterThan(dual.r.sac - dual.r.spd);
  });

  it('performance tags steer the next level-up', () => {
    const share = (tags: Partial<Record<RatingKey, number>>) => {
      const rng = mulberry32(6);
      let dac = 0;
      let all = 0;
      for (let i = 0; i < 1500; i++) {
        const a = prospect('QB', 75);
        const up = levelUp({ ...a.r }, a, tags, rng);
        dac += up.d.dac ?? 0;
        all += Object.values(up.d).reduce((x, y) => x + (y ?? 0), 0);
      }
      return dac / all;
    };
    expect(share({ dac: 15 })).toBeGreaterThan(share({}) * 1.8);
  });

  it('progress reaches the squad: ratings rise, and the staff chart re-sorts', () => {
    const s = newSeason(defaultConfig('georgia'), 3);
    const wrs = positionOrder(squadFor(s, 'georgia'), 'WR');
    const backup = wrs[4];
    expect(starters(squadFor(s, 'georgia')).X.id).not.toBe(backup.id);
    const d = Object.fromEntries((Object.keys(OVR_WEIGHTS.WR) as RatingKey[]).map((k) => [k, 15]));
    s.teamState.georgia = { progress: { [backup.id]: { xp: 0, lvl: 1, d } } };
    const sq = squadFor(s, 'georgia');
    expect(sq.athletes.find((a) => a.id === backup.id)!.r.rte).toBe(Math.min(99, backup.r.rte + 15));
    expect(starters(sq).X.id).toBe(backup.id);
  });

  it('a season week gives XP and levels, and marks last week\'s upgrades', () => {
    const s = newSeason(defaultConfig('georgia'), 12);
    for (let i = 0; i < 4; i++) advanceWeek(s);
    const prog = s.teamState.georgia.progress!;
    const qb = starters(buildSquad(teamById('georgia'))).QB;
    expect(prog[qb.id].lvl + prog[qb.id].xp).toBeGreaterThan(0);
    const leveled = Object.values(s.teamState).flatMap((t) => Object.values(t.progress ?? {})).filter((p) => p.lvl > 0);
    expect(leveled.length).toBeGreaterThan(500);
    const fresh = leveled.find((p) => upgradedLastWeek(s, p))!;
    const k = Object.keys(fresh.up!.d)[0] as RatingKey;
    expect(upgradedLastWeek(s, fresh, k)).toBe(true);
    expect(ratingChange(fresh, k)).toBeGreaterThanOrEqual(fresh.up!.d[k]!);
    expect(deltaText({ sac: 1, dac: 2 })).toBe('+2 DAC +1 SAC');
  });

  it('a live game feeds progression only through its drives', () => {
    const play = (drives?: DriveLog[]) => {
      const s = newSeason(defaultConfig('georgia'), 2);
      while (!userGameThisWeek(s)) advanceWeek(s);
      delete s.teamState.georgia?.progress;
      const score = { points: 0, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 };
      advanceWeek(s, { home: 28, away: 10, ot: 0, box: { home: score, away: score, players: [] } }, drives);
      return s.teamState.georgia?.progress ?? ({} as Record<string, Progress>);
    };
    const qb = starters(buildSquad(teamById('georgia'))).QB;
    expect(play()[qb.id]).toBeUndefined();
    const plays = Array.from({ length: 60 }, (_, i) => ({ gain: (i * 7) % 13 - 2, pass: i % 2 === 0, down: 1 + (i % 3), toGo: 10 }));
    const p = play([{ off: 'georgia', plays }])[qb.id];
    expect(p.xp + p.lvl).toBeGreaterThan(0);
  });
});
