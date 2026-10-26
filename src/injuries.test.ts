import { describe, expect, it } from 'vitest';
import { buildDepth, fitRatings, freshSquad, HEALTH, positionOrder, starters, teamRatings, type Squad } from './data/depth';
import { teamById } from './data/teams';
import { depthView, fullMove } from './render/teamScreen';
import { healWeek, INJURY, injuryRisk } from './season/injuries';
import { advanceWeek, defaultConfig, newSeason } from './season/season';
import { setUserDepth } from './season/staff';
import type { InjuryLevel, SeasonState } from './season/types';
import { squadFor } from './season/world';

function season(level: InjuryLevel, seed: number, weeks: number): SeasonState {
  const s = newSeason({ ...defaultConfig('georgia'), injuries: level }, seed);
  for (let i = 0; i < weeks; i++) advanceWeek(s);
  return s;
}

/** A squad whose two best QBs are `qb1` and `qb2`, the rest as generated. */
function qbPair(): { sq: Squad; qb1: string; qb2: string } {
  const sq = freshSquad(teamById('georgia'));
  const [a, b] = positionOrder(sq, 'QB');
  return { sq, qb1: a.id, qb2: b.id };
}

describe('injuries', () => {
  it('OFF: a season with no injuries and everyone at full health', () => {
    const s = season('off', 4, 8);
    expect(s.injuryLog ?? []).toEqual([]);
    for (const ts of Object.values(s.teamState)) {
      expect(Object.keys(ts.injuries ?? {})).toEqual([]);
      expect(Object.keys(ts.health ?? {})).toEqual([]);
    }
  });

  it('NORMAL: injuries and knocks happen, the same seed gives the same ones, and a save continues identically', () => {
    const a = season('normal', 9, 6);
    const b = season('normal', 9, 3);
    const c = JSON.parse(JSON.stringify(b)) as SeasonState;
    for (let i = 0; i < 3; i++) {
      advanceWeek(b);
      advanceWeek(c);
    }
    expect(a.injuryLog!.length).toBeGreaterThan(50);
    expect(Object.values(a.teamState).some((ts) => Object.keys(ts.health ?? {}).length)).toBe(true);
    expect(b.injuryLog).toEqual(a.injuryLog);
    expect(c.injuryLog).toEqual(a.injuryLog);
    expect(JSON.stringify(c.teamState)).toBe(JSON.stringify(b.teamState));
    expect(a.news.some((n) => n.kind === 'injury')).toBe(true);
  });

  it('an injured player sits until his weeks run out, then comes back banged up', () => {
    const s = newSeason(defaultConfig('georgia'), 1);
    const qb = starters(squadFor(s, 'georgia')).QB;
    s.teamState.georgia = { injuries: { [qb.id]: { weeks: 2, type: 'ANKLE SPRAIN' } } };
    expect(starters(squadFor(s, 'georgia')).QB.id).not.toBe(qb.id);
    healWeek(s, new Set());
    expect(s.teamState.georgia.injuries![qb.id].weeks).toBe(1);
    healWeek(s, new Set());
    expect(s.teamState.georgia.injuries![qb.id]).toBeUndefined();
    expect(s.teamState.georgia.health![qb.id]).toBe(INJURY.returnHealth);
    // Banged up but (with a clear lead over his backup) starting again; rest heals the rest.
    expect(starters(squadFor(s, 'georgia')).QB.id).toBe(qb.id);
    healWeek(s, new Set());
    expect(s.teamState.georgia.health?.[qb.id]).toBeUndefined();
  });

  it('playing hurt costs ratings, most of all the physical ones, and shows in the team ratings', () => {
    const sq = freshSquad(teamById('georgia'));
    const qb = starters(sq).QB;
    const base = teamRatings(sq).off;
    qb.health = 75;
    const r = fitRatings(qb);
    expect(qb.r.spd - r.spd).toBe(Math.round(25 * HEALTH.phys));
    expect(qb.r.sac - r.sac).toBe(Math.round(25 * HEALTH.skill));
    expect(teamRatings(sq).off).toBeLessThan(base);
  });

  it('the staff rest a hurt starter for a close backup, not for a much worse one', () => {
    const { sq, qb1, qb2 } = qbPair();
    const a = sq.athletes.find((x) => x.id === qb1)!;
    const b = sq.athletes.find((x) => x.id === qb2)!;
    b.r = { ...a.r };
    a.health = HEALTH.restBelow - 1;
    expect(buildDepth(sq.athletes).QB[0]).toBe(qb2);
    for (const k of Object.keys(b.r) as (keyof typeof b.r)[]) b.r[k] = a.r[k] - 15;
    expect(buildDepth(sq.athletes).QB[0]).toBe(qb1);
  });

  it("the user's own chart isn't reshuffled for health", () => {
    const s = newSeason(defaultConfig('georgia'), 2);
    const chart = { ...squadFor(s, 'georgia').depth };
    setUserDepth(s, chart);
    const qb = chart.QB[0];
    s.teamState.georgia.health = { [qb]: 50 };
    expect(squadFor(s, 'georgia').depth).toBe(chart);
    expect(starters(squadFor(s, 'georgia')).QB.id).toBe(qb);
  });

  it('a pocket QB takes less risk than a feature back', () => {
    expect(injuryRisk('QB', { snaps: 70, hits: 4 })).toBeLessThan(injuryRisk('RB', { snaps: 50, hits: 25 }) / 2);
  });

  it('team page: the injured sit below the available players, and drags map to the full order', () => {
    const sq = freshSquad(teamById('georgia'));
    const order = positionOrder(sq, 'WR');
    order[1].injury = { weeks: 3, type: 'TURF TOE' };
    const v = depthView(sq, 'WR');
    expect(v.rows[v.rows.length - 1].id).toBe(order[1].id);
    expect(v.avail).toBe(order.length - 1);
    // Drag the third available (full index 3) to the top: full move 3 -> 0.
    expect(fullMove(v, 2, 0)).toEqual([3, 0]);
    // Drag the top one below the last available: he lands after it, ahead of nobody injured.
    const [f, t] = fullMove(v, 0, v.avail - 1);
    expect(f).toBe(0);
    expect(t).toBe(order.length - 1);
  });
});
