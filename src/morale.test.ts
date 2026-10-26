import { describe, expect, it } from 'vitest';
import { positionOrder, reorderPosition, starters, type Squad } from './data/depth';
import { TEAMS } from './data/teams';
import { mulberry32, type Rng } from './engine/math';
import { START_SLOTS } from './season/confidence';
import {
  carryMorale, expectedRole, MORALE, moraleContext, moraleDrivers, moraleOf, moraleReason, moraleStep, moraleTarget,
  temperament, temperamentLabel, teamMood, voice, type MoraleDriver,
} from './season/morale';
import { xpMultiplier } from './season/progression';
import { advanceWeek, defaultConfig, newSeason } from './season/season';
import { setUserDepth } from './season/staff';
import type { GameResult, SeasonState, TeamState } from './season/types';
import { squadFor } from './season/world';

const score = (home: number, away: number): GameResult => ({
  home, away, ot: 0, box: { home: { points: home, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 }, away: { points: away, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 }, players: [] },
});

/** No weekly nudge: `gauss` of a constant 0.5 is 0, so a step is exactly `rate` of the way to the target. */
const still: Rng = () => 0.5;

/** A fresh Georgia season with last game's starters recorded, as if a game had been played. */
function georgia(): { s: SeasonState; ts: TeamState; sq: Squad } {
  const s = newSeason(defaultConfig('georgia'), 3);
  const sq = squadFor(s, 'georgia');
  const st = starters(sq);
  const ts = (s.teamState.georgia ??= {});
  ts.st = Object.fromEntries(START_SLOTS.filter((x) => st[x]).map((x) => [x, st[x].id]));
  return { s, ts, sq };
}

/** Georgia's games so far: the first `results.length` on its schedule, won (true) or lost. */
function results(s: SeasonState, outcomes: boolean[]): void {
  const games = s.games.filter((g) => g.home === 'georgia' || g.away === 'georgia').sort((a, b) => a.week - b.week);
  outcomes.forEach((w, i) => {
    const g = games[i];
    const home = g.home === 'georgia';
    g.result = w === home ? score(30, 10) : score(10, 30);
  });
}

describe('morale: temperament and expectations', () => {
  it('temperament is fixed per player, inside its ranges, and every word turns up', () => {
    const labels = new Set<string>();
    for (const t of TEAMS.slice(0, 6)) {
      for (const a of squadFor(newSeason(defaultConfig(t.id), 1), t.id).athletes) {
        const m = temperament(a);
        expect(temperament({ id: a.id })).toEqual(m);
        expect(Math.abs(m.base)).toBeLessThanOrEqual(0.3);
        for (const x of [m.pride, m.team]) expect(x >= 0.5 && x <= 1.5).toBe(true);
        expect(m.lead >= 0 && m.lead < 1).toBe(true);
        labels.add(temperamentLabel(a));
      }
    }
    expect([...labels].sort()).toEqual(['LEADER', 'LOYAL', 'MELLOW', 'MOODY', 'PROUD']);
  });

  it('a 5-star freshman expects more than a walk-on, a senior starter expects to start, a close backup feels buried', () => {
    const { s, sq } = georgia();
    const ctx = moraleContext(s, sq);
    const [qb1, qb2] = positionOrder(sq, 'QB');
    expect(expectedRole(ctx, { ...qb2, year: 'FR', stars: 5 }).role).toBeGreaterThan(expectedRole(ctx, { ...qb2, year: 'FR', stars: 1 }).role);
    expect(expectedRole(ctx, { ...qb1, year: 'SR' }).role).toBeGreaterThanOrEqual(0.85);
    // Nearly as good as the starter.
    ctx.ovr.set(qb2.id, ctx.groups.get('QB')!.weakestStarter - 1);
    const close = expectedRole(ctx, { ...qb2, year: 'FR', stars: 2 });
    expect(close.close).toBe(true);
    expect(close.role).toBe(MORALE.closeExpect);
  });

  it('the role term is the gap below expectation times his pride', () => {
    const { s, sq } = georgia();
    const ctx = moraleContext(s, sq);
    const qb2 = { ...positionOrder(sq, 'QB')[1], year: 'SR' as const };
    const d = moraleDrivers(ctx, qb2);
    expect(d.actual).toBe(MORALE.backups[0]);
    expect(d.role).toBeCloseTo(MORALE.roleW * temperament(qb2).pride * (d.actual! - d.expected), 10);
    expect(d.role).toBeLessThan(0);
  });
});

describe('morale over weeks', () => {
  it('a senior backup sours over weeks; a walk-on freshman in the same spot does not', () => {
    const run = (year: 'SR' | 'FR', stars: 1 | 3) => {
      const { s, ts, sq } = georgia();
      const qb2 = positionOrder(sq, 'QB')[1];
      const squad = { ...sq, athletes: sq.athletes.map((a) => (a.id === qb2.id ? { ...a, year, stars } : a)) };
      for (let w = 0; w < 10; w++) moraleStep(s, ts, squad, still);
      return moraleOf(ts, qb2) - temperament(qb2).base;
    };
    const senior = run('SR', 3);
    expect(senior).toBeLessThan(-0.1);
    expect(senior).toBeLessThan(run('FR', 1) - 0.1);
  });

  it('moves slowly: one week goes `rate` of the way to the target, and many weeks settle on it', () => {
    const { s, ts, sq } = georgia();
    const a = starters(sq).QB;
    ts.mo = { [a.id]: -0.8 };
    const target = moraleTarget(moraleDrivers(moraleContext(s, sq), a));
    moraleStep(s, ts, sq, still);
    expect(moraleOf(ts, a)).toBeCloseTo(-0.8 + MORALE.rate * (target + 0.8), 1);
    // Stored to 0.01, a step under half a point rounds away: it settles within 0.5 / 100 / rate of the target.
    for (let w = 0; w < 60; w++) moraleStep(s, ts, sq, still);
    expect(Math.abs(moraleOf(ts, a) - moraleTarget(moraleDrivers(moraleContext(s, sq), a)))).toBeLessThan(0.005 / MORALE.rate + 0.005);
  });

  it('winning lifts the whole roster; a losing streak drags it, and a rivalry win counts extra', () => {
    const { s: up } = georgia();
    results(up, [true, true, true, true]);
    const { s: down } = georgia();
    results(down, [false, false, false, false]);
    expect(teamMood(up, 'georgia').value).toBeGreaterThan(0);
    expect(teamMood(down, 'georgia').value).toBeLessThan(0);
    expect(teamMood(down, 'georgia').parts.streak).toBeLessThan(0);
    for (const [s, sign] of [[up, 1], [down, -1]] as const) {
      const sq = squadFor(s, 'georgia');
      const ctx = moraleContext(s, sq);
      for (const a of sq.athletes) expect(Math.sign(moraleDrivers(ctx, a).team)).toBe(sign);
    }
    const { s: rival } = georgia();
    const g = rival.games.find((x) => (x.home === 'georgia' || x.away === 'georgia') && x.name && (x.kind === 'conf' || x.kind === 'nonconf'))!;
    g.result = g.home === 'georgia' ? score(30, 10) : score(10, 30);
    expect(teamMood(rival, 'georgia').parts.rivalryWin).toBe(MORALE.events.rivalryWin);
  });
});

describe('morale: coach decisions and the locker room', () => {
  it('losing the job hurts (on any chart), winning it lifts, and both fade', () => {
    const { s, ts, sq } = georgia();
    const [qb1, qb2] = positionOrder(sq, 'QB');
    // A staff-style chart: no user depth chart, the order changed directly.
    const swapped = { ...sq, depth: reorderPosition(sq, 'QB', 1, 0) };
    moraleStep(s, ts, swapped, still);
    expect(ts.progress![qb1.id].mk).toBe('bench');
    expect(ts.progress![qb1.id].me).toBeCloseTo(-MORALE.benchHit * temperament(qb1).pride, 2);
    expect(ts.progress![qb2.id]).toMatchObject({ mk: 'job', me: MORALE.jobLift });
    // Next game, with the new starters as last game's: no new decision, and the old ones fade.
    const st = starters(swapped);
    ts.st = Object.fromEntries(START_SLOTS.filter((x) => st[x]).map((x) => [x, st[x].id]));
    const hit = ts.progress![qb1.id].me!;
    moraleStep(s, ts, swapped, still);
    expect(ts.progress![qb1.id].me).toBeCloseTo(hit * MORALE.decisionFade, 2);
  });

  it('no benching when the starter is hurt or resting', () => {
    for (const why of ['hurt', 'rest'] as const) {
      const { s, ts } = georgia();
      const qb1 = positionOrder(squadFor(s, 'georgia'), 'QB')[0];
      if (why === 'hurt') ts.injuries = { [qb1.id]: { weeks: 3, type: 'TEST' } };
      else {
        ts.health = { [qb1.id]: 70 };
        setUserDepth(s, reorderPosition(squadFor(s, 'georgia'), 'QB', 1, 0));
      }
      moraleStep(s, ts, squadFor(s, 'georgia'), still);
      expect(ts.progress?.[qb1.id]?.mk, why).toBeUndefined();
    }
  });

  it('an unhappy leader drags his teammates down', () => {
    const { s, ts, sq } = georgia();
    const st = new Set(Object.values(starters(sq)).map((a) => a.id));
    const leader = [...sq.athletes].sort((a, b) => voice(b, st.has(b.id)) - voice(a, st.has(a.id)))[0];
    const other = sq.athletes.find((a) => a.id !== leader.id)!;
    const room = (m: number) => {
      ts.mo = { [leader.id]: m };
      return moraleDrivers(moraleContext(s, sq), other).room;
    };
    expect(room(-1)).toBeLessThan(room(1) - 0.01);
  });
});

describe('morale: what it reads and what it does', () => {
  it('never reads performance: confidence (built from grades) leaves morale alone', () => {
    const run = (conf: boolean) => {
      const { s, ts, sq } = georgia();
      if (conf) {
        const rng = mulberry32(9);
        ts.progress = Object.fromEntries(sq.athletes.map((a) => [a.id, { xp: 0, lvl: 0, d: {}, c: rng() * 2 - 1 }]));
      }
      for (let w = 0; w < 5; w++) moraleStep(s, ts, sq, mulberry32(w));
      return ts.mo;
    };
    expect(run(true)).toEqual(run(false));
  });

  it('sets practice effort: the XP multiplier moves 0.9..1.1 with morale', () => {
    const a = squadFor(newSeason(defaultConfig('georgia'), 1), 'georgia').athletes[10];
    expect(xpMultiplier(a, undefined, 1).morale).toBeCloseTo(1.1, 10);
    expect(xpMultiplier(a, undefined, -1).morale).toBeCloseTo(0.9, 10);
    expect(xpMultiplier(a, undefined, 0).morale).toBe(1);
    expect(xpMultiplier(a, undefined, 0.5).total).toBeGreaterThan(xpMultiplier(a, undefined, -0.5).total);
  });

  it('the reason is the biggest driver pulling the way he leans', () => {
    const s = newSeason(defaultConfig('georgia'), 4);
    for (let w = 0; w < 8; w++) advanceWeek(s);
    const sq = squadFor(s, 'georgia');
    const ctx = moraleContext(s, sq);
    let told = 0;
    for (const a of sq.athletes) {
      const m = moraleOf(ctx.ts, a);
      const r = moraleReason(ctx, a, m);
      expect(r.text.length).toBeLessThanOrEqual(18);
      if (!r.driver) continue;
      told++;
      const d = moraleDrivers(ctx, a);
      const sign = m >= d.base ? 1 : -1;
      expect(d[r.driver] * sign).toBeGreaterThan(0);
      for (const k of ['role', 'team', 'coach', 'room'] as MoraleDriver[]) if (d[k] * sign > 0) expect(Math.abs(d[k])).toBeLessThanOrEqual(Math.abs(d[r.driver]));
    }
    expect(told).toBeGreaterThan(sq.athletes.length / 2);
  });

  it('a saved season continues identically, and a new season carries half the distance from his baseline', () => {
    const s = newSeason(defaultConfig('georgia'), 5);
    for (let w = 0; w < 4; w++) advanceWeek(s);
    const copy = JSON.parse(JSON.stringify(s)) as SeasonState;
    for (let w = 0; w < 2; w++) {
      advanceWeek(s);
      advanceWeek(copy);
    }
    expect(copy.teamState.georgia.mo).toEqual(s.teamState.georgia.mo);
    expect(Object.keys(s.teamState.georgia.mo!).length).toBe(squadFor(s, 'georgia').athletes.length);

    const ts: TeamState = JSON.parse(JSON.stringify(s.teamState.georgia));
    const athletes = squadFor(s, 'georgia').athletes;
    carryMorale(ts, athletes);
    for (const a of athletes.slice(0, 20)) {
      const base = temperament(a).base;
      expect(ts.mo![a.id]).toBeCloseTo(base + MORALE.offseason * (s.teamState.georgia.mo![a.id] - base), 1);
    }
    expect(Object.values(ts.progress ?? {}).some((p) => p.me || p.mk)).toBe(false);
  });
});
