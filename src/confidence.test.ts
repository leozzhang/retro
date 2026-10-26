import { describe, expect, it } from 'vitest';
import { CONF, confRatings, leverage, NO_CONF } from './data/confidence';
import { buildDepth, buildSquad, freshSquad, positionOrder, reorderPosition, starters, teamConf } from './data/depth';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { simulateDrive, type SimPlay } from './game/rules';
import {
  BREAKOUT, CONFIDENCE, confidenceStep, confOf, perfZ, sparkReason, START_SLOTS, updateConfidence,
} from './season/confidence';
import { gradeGame, type GameGrade } from './season/grades';
import { advanceWeek, defaultConfig, newSeason } from './season/season';
import { simGame } from './season/simGame';
import { setUserDepth } from './season/staff';
import type { DriveLog, SeasonState } from './season/types';
import { squadFor } from './season/world';

/** A game grade for a full-time starter that comes out at performance `z`. */
function grade(z: number, snaps = 60): GameGrade {
  const sum = z * CONFIDENCE.snapSd * Math.sqrt(snaps);
  return { team: 'georgia', snaps, share: 1, sum, tags: {}, hits: 0, lsum: sum, lw: snaps };
}

/** Georgia plays one game: every starter grades at `z` (or his own entry), then the confidence step runs. */
function play(s: SeasonState, week: number, z: Record<string, number> = {}) {
  const ts = (s.teamState.georgia ??= {});
  const sq = squadFor(s, 'georgia');
  const st = starters(sq);
  const grades = new Map(START_SLOTS.filter((x) => st[x]).map((x) => [st[x].id, grade(z[st[x].id] ?? 0)]));
  const bases = new Map(buildSquad(sq.team).athletes.map((a) => [a.id, a]));
  return { qb: st.QB.id, ...confidenceStep(s, ts, sq, grades, bases, week, mulberry32(week)) };
}

/** A season with Georgia's QB1 starting the first three games, so QB2 has been quiet. */
function settled(): { s: SeasonState; qb1: string; qb2: string } {
  const s = newSeason(defaultConfig('georgia'), 3);
  const [a, b] = positionOrder(squadFor(s, 'georgia'), 'QB');
  for (let w = 1; w <= 3; w++) play(s, w);
  return { s, qb1: a.id, qb2: b.id };
}

const progress = (s: SeasonState, id: string) => s.teamState.georgia.progress![id];

describe('confidence on the field', () => {
  it('leverage: downs, the red zone, late and close, long field goals, capped at 1', () => {
    expect(leverage(1, 60, false)).toBe(0);
    expect(leverage(3, 60, false)).toBe(CONF.third);
    expect(leverage(1, 15, false)).toBe(CONF.redZone);
    expect(leverage(1, 60, true)).toBe(CONF.lateClose);
    expect(leverage(4, 5, true)).toBe(1);
    expect(leverage(4, 30, false, 50)).toBe(CONF.longFg);
    expect(leverage(4, 10, false, 27)).toBe(0);
  });

  it('shifts the nerve ratings, never the physical ones, and most on the biggest snaps', () => {
    const r = freshSquad(teamById('georgia')).athletes[0].r;
    const calm = confRatings(r, 1, 0);
    const big = confRatings(r, 1, 1);
    for (const k of ['spd', 'acc', 'str', 'sta', 'arm', 'kpw'] as const) expect(big[k]).toBe(r[k]);
    expect(calm.pac - r.pac).toBeCloseTo(CONF.base, 5);
    expect(big.pac - r.pac).toBeCloseTo(CONF.base + CONF.clutch, 5);
    expect(confRatings(r, -1, 1).pac).toBeLessThan(r.pac);
    expect(confRatings(r, 0, 1)).toBe(r);
  });

  it('the drive sim with zero confidence matches the drive sim without it', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const clock = { timeLeft: 600, hurry: false, milk: false };
      const a = simulateDrive(82, 78, 25, mulberry32(seed), clock);
      const b = simulateDrive(82, 78, 25, mulberry32(seed), clock, undefined, { ...NO_CONF, late: true });
      expect(b).toEqual(a);
    }
  });

  it('a confident offense gains more on big snaps', () => {
    let calm = 0;
    let hot = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const clock = { timeLeft: 600, hurry: false, milk: false };
      const plays: SimPlay[] = [];
      calm += simulateDrive(80, 80, 25, mulberry32(seed), clock, undefined, { ...NO_CONF, late: true }).points;
      hot += simulateDrive(80, 80, 25, mulberry32(seed), clock, (p) => plays.push(p), { off: 0.8, def: 0, k: 0.8, late: true }).points;
    }
    expect(hot).toBeGreaterThan(calm);
  });

  it('no feedback: a confident team still grades about 0 against what it was expected to do', () => {
    const home = freshSquad(teamById('georgia'));
    const away = freshSquad(teamById('ohiostate'));
    for (const a of Object.values(starters(home))) a.conf = 0.8;
    expect(teamConf(home).off).toBeGreaterThan(0.5);
    const rng = mulberry32(5);
    let sum = 0;
    let snaps = 0;
    for (let i = 0; i < 150; i++) {
      const drives: DriveLog[] = [];
      simGame(home, away, rng, { drives });
      for (const g of gradeGame(home, away, drives, {}, rng, 1.5).values()) {
        if (g.team !== 'georgia' || g.share < 0.8) continue;
        sum += g.sum;
        snaps += g.snaps;
      }
    }
    expect(Math.abs(sum / snaps)).toBeLessThan(0.01);
  });

  it('the staff bench a slumping starter for a close backup, and the incumbent edge stops a flip-flop', () => {
    const sq = freshSquad(teamById('georgia'));
    const [a, b] = positionOrder(sq, 'QB');
    b.r = { ...a.r };
    a.conf = -0.3;
    expect(buildDepth(sq.athletes, { QB: a.id }).QB[0]).toBe(a.id);
    a.conf = -0.7;
    expect(buildDepth(sq.athletes, { QB: a.id }).QB[0]).toBe(b.id);
    // The backup who took over keeps the job when the old starter is merely steady again.
    a.conf = 0;
    expect(buildDepth(sq.athletes, { QB: b.id }).QB[0]).toBe(b.id);
  });
});

describe('confidence over a season', () => {
  it('moves toward how he plays, more for a starter than a part-timer, and holds when he sits', () => {
    const p = { xp: 0, lvl: 0, d: {} };
    updateConfidence(p, grade(1.5));
    const up = confOf(p);
    expect(up).toBeGreaterThan(0.2);
    const q = { xp: 0, lvl: 0, d: {} };
    updateConfidence(q, { ...grade(1.5, 10), share: 0.15 });
    expect(confOf(q)).toBeLessThan(up / 2);
    updateConfidence(p, grade(-1.5));
    expect(confOf(p)).toBeLessThan(up);
    expect(perfZ(grade(1.2))).toBeCloseTo(1.2, 5);

    const { s, qb1 } = settled();
    const c = progress(s, qb1).c;
    // He doesn't play a game (his team has a bye): nothing changes.
    expect(progress(s, qb1).c).toBe(c);
  });

  it('next man up: the injured starter\'s backup sparks, on the field from his first start', () => {
    const { s, qb1, qb2 } = settled();
    s.teamState.georgia.injuries = { [qb1]: { weeks: 2, type: 'TEST' } };
    // Before the game: the spark is already on him.
    const before = squadFor(s, 'georgia').athletes.find((a) => a.id === qb2)!;
    expect(before.conf ?? 0).toBeCloseTo(confOf(progress(s, qb2)) + CONFIDENCE.spark, 5);
    const r = play(s, 4, { [qb2]: 1 });
    expect(r.qb).toBe(qb2);
    expect(r.sparks.map((e) => [e.athlete.id, e.reason])).toEqual([[qb2, 'injured']]);
    // A good start locks half of it in.
    const p = progress(s, qb2);
    expect(p.sp).toBeCloseTo(CONFIDENCE.spark * (1 - CONFIDENCE.sparkKeep), 5);
    expect(p.c!).toBeGreaterThan(CONFIDENCE.spark * CONFIDENCE.sparkKeep);
    expect(s.confLog!.some((e) => e.kind === 'spark' && e.id === qb2)).toBe(true);
  });

  it('a bad start fades the spark instead', () => {
    const { s, qb1, qb2 } = settled();
    s.teamState.georgia.injuries = { [qb1]: { weeks: 2, type: 'TEST' } };
    play(s, 4, { [qb2]: -1 });
    const p = progress(s, qb2);
    expect(p.sp).toBeCloseTo(CONFIDENCE.spark * CONFIDENCE.sparkFade, 5);
    expect(p.c ?? 0).toBeLessThan(0);
  });

  it('benching a healthy, in-form, better starter sparks nothing and costs him', () => {
    const { s, qb1, qb2 } = settled();
    const sq = squadFor(s, 'georgia');
    setUserDepth(s, reorderPosition(sq, 'QB', 1, 0));
    const r = play(s, 4);
    expect(r.qb).toBe(qb2);
    expect(r.sparks).toEqual([]);
    expect(progress(s, qb2).sp).toBeUndefined();
    expect(progress(s, qb1).bh).toBeCloseTo(CONFIDENCE.benchHit, 5);
    expect(confOf(progress(s, qb1))).toBeLessThan(progress(s, qb1).c ?? 0);
  });

  it("repeated benchings can't make a slump: the penalty isn't counted as one", () => {
    const { s, qb1, qb2 } = settled();
    for (let w = 4; w <= 9; w++) {
      const sq = squadFor(s, 'georgia');
      const order = positionOrder(sq, 'QB');
      const want = w % 2 ? qb1 : qb2;
      if (order[0].id !== want) setUserDepth(s, reorderPosition(sq, 'QB', order.findIndex((a) => a.id === want), 0));
      play(s, w);
    }
    expect((s.confLog ?? []).filter((e) => e.kind === 'spark')).toEqual([]);
    expect((s.confLog ?? []).filter((e) => e.kind === 'bench').length).toBeGreaterThanOrEqual(3);
  });

  it('a slumping starter benched sparks his backup; a rest day is neither a spark nor a penalty', () => {
    const slump = settled();
    slump.s.teamState.georgia.progress![slump.qb1].c = -0.5;
    setUserDepth(slump.s, reorderPosition(squadFor(slump.s, 'georgia'), 'QB', 1, 0));
    expect(play(slump.s, 4).sparks.map((e) => e.reason)).toEqual(['slumping']);

    const rest = settled();
    rest.s.teamState.georgia.health = { [rest.qb1]: 60 };
    setUserDepth(rest.s, reorderPosition(squadFor(rest.s, 'georgia'), 'QB', 1, 0));
    const r = play(rest.s, 4);
    expect(r.sparks).toEqual([]);
    expect(progress(rest.s, rest.qb1).bh).toBeUndefined();
  });

  it('outplayed: a backup at least as good earns it; a weaker one does not', () => {
    const sq = freshSquad(teamById('georgia'));
    const [a, b] = positionOrder(sq, 'QB');
    expect(sparkReason({ ...b, r: { ...a.r } }, a, 'QB', 0)).toBe('outplayed');
    expect(sparkReason(b, a, 'QB', 0)).toBeNull();
    expect(sparkReason(b, a, 'QB', CONFIDENCE.slump)).toBe('slumping');
  });

  it('no spark for a starter back from injury, or a second time in a season', () => {
    const { s, qb1, qb2 } = settled();
    s.teamState.georgia.injuries = { [qb1]: { weeks: 2, type: 'TEST' } };
    (s.injuryLog ??= []).push({ week: 3, team: 'georgia', id: qb1, name: 'QB1', pos: 'QB', weeks: 2, type: 'TEST', starter: true });
    play(s, 4);
    play(s, 5);
    delete s.teamState.georgia.injuries;
    const back = play(s, 6);
    expect(back.qb).toBe(qb1);
    expect(back.sparks).toEqual([]);
    // QB2 sits two games, then QB1 goes down again: QB2 already sparked this season.
    play(s, 7);
    play(s, 8);
    s.teamState.georgia.injuries = { [qb1]: { weeks: 1, type: 'TEST' } };
    const again = play(s, 9);
    expect(again.qb).toBe(qb2);
    expect(again.sparks).toEqual([]);
  });

  it('a strong run from a spark is a breakout: dev up, potential, a breakthrough, once a career', () => {
    const { s, qb1, qb2 } = settled();
    const base = squadFor(s, 'georgia').athletes.find((a) => a.id === qb2)!;
    s.teamState.georgia.injuries = { [qb1]: { weeks: 9, type: 'TEST' } };
    const outs = [];
    for (let w = 4; w < 4 + BREAKOUT.games; w++) outs.push(...play(s, w, { [qb2]: 1.5 }).breakouts);
    expect(outs).toHaveLength(1);
    const p = progress(s, qb2);
    expect(p.bo).toBe(s.year);
    expect(p.pot).toBe(BREAKOUT.potential);
    expect(p.dev).not.toBe(base.dev === 'elite' ? undefined : base.dev);
    expect(p.up?.big).toBe(true);
    const now = squadFor(s, 'georgia').athletes.find((a) => a.id === qb2)!;
    expect(now.potential).toBe(base.potential + BREAKOUT.potential);
    expect(Object.values(outs[0].d).reduce((x, y) => x + (y ?? 0), 0)).toBeGreaterThan(0);
    expect(p.sw).toBeUndefined();
  });

  it('carries on identically from a save mid-season', () => {
    const a = newSeason(defaultConfig('georgia'), 11);
    for (let i = 0; i < 4; i++) advanceWeek(a);
    const b = JSON.parse(JSON.stringify(a)) as SeasonState;
    for (let i = 0; i < 3; i++) {
      advanceWeek(a);
      advanceWeek(b);
    }
    expect(b.confLog).toEqual(a.confLog);
    expect(JSON.stringify(b.teamState)).toBe(JSON.stringify(a.teamState));
    expect((a.confLog ?? []).some((e) => e.kind === 'spark')).toBe(true);
  });
});
