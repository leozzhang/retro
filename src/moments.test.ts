import { describe, expect, it } from 'vitest';
import { starters } from './data/depth';
import { injuredStarters, MOMENTS, unseenWrap, wrapOrder, markSeen } from './season/moments';
import { advanceWeek, defaultConfig, newSeason, WEEK_STEPS } from './season/season';
import { challenger, decide, startingRoles } from './season/storylines';
import type { Moment, SeasonState } from './season/types';
import { squadFor } from './season/world';

const run = (team: string, seed: number, weeks: number, steps = WEEK_STEPS) => {
  const s = newSeason(defaultConfig(team), seed);
  const saved = WEEK_STEPS.splice(0, WEEK_STEPS.length, ...steps);
  try {
    for (let i = 0; i < weeks; i++) advanceWeek(s);
  } finally {
    WEEK_STEPS.splice(0, WEEK_STEPS.length, ...saved);
  }
  return s;
};

const strip = (s: SeasonState) => JSON.stringify({ ...s, moments: undefined, buzz: undefined, stories: undefined });

describe('moments', () => {
  it('watch the season without changing it', () => {
    const on = run('kansas', 5, 7);
    const off = run('kansas', 5, 7, WEEK_STEPS.filter((x) => x.name !== 'moments'));
    expect(on.moments!.length).toBeGreaterThan(10);
    expect(strip(on)).toBe(strip(off));
  });

  it("stage a starter's injury with the next man up, and open his story", () => {
    const s = run('kansas', 5, 8);
    const long = (s.injuryLog ?? []).filter((e) => e.team === 'kansas' && e.starter && (e.season || e.weeks >= 2));
    expect(long.length).toBeGreaterThan(0);
    for (const e of long) {
      const m = s.moments!.find((x) => x.kind === 'injury' && x.q?.id === e.id && x.week === e.week);
      expect(m?.tier).toBe((MOMENTS.posW[e.pos] ?? 0) >= MOMENTS.keyW ? 3 : 2);
      expect(m?.p).toBeDefined();
      const st = s.stories!.find((x) => x.kind === 'nextManUp' && x.other?.id === e.id);
      expect(st?.star?.id).toBe(m!.p!.id);
      expect(m!.arc).toBe(st!.id);
    }
  });

  it('play the final first, keep BIG short, and always show decisions', () => {
    const mk = (kind: Moment['kind'], tier: 1 | 2 | 3, w: number): Moment => ({ id: `${kind}${w}`, week: 1, kind, tier, w, team: 'x', title: '', sub: '', lines: [] });
    const ms = [mk('around', 1, -1), mk('breakthrough', 2, 1), mk('final', 1, 100), mk('injury', 3, 2), mk('milestone', 2, 0.5), mk('firstStart', 2, 3), mk('poll', 2, 2), mk('progress', 1, 0), mk('decision', 3, 10), mk('preview', 1, -0.5)];
    const all = wrapOrder(ms, 'all');
    expect(all[0].kind).toBe('final');
    expect(all.slice(-3).map((m) => m.kind)).toEqual(['progress', 'preview', 'around']);
    const big = wrapOrder(ms, 'big');
    expect(big.map((m) => m.kind)).toEqual(['final', 'decision', 'injury', 'firstStart', 'poll', 'preview', 'around']);
    expect(big.filter((m) => m.tier >= 2 && m.kind !== 'decision').length).toBe(MOMENTS.big);
    expect(wrapOrder(ms, 'off')).toEqual([]);
  });

  it('mark what was shown as seen', () => {
    const s = run('georgia', 3, 4);
    expect(unseenWrap(s).length).toBeGreaterThan(0);
    markSeen(s);
    expect(unseenWrap(s)).toEqual([]);
    advanceWeek(s);
    expect(unseenWrap(s).every((m) => m.week === s.week - 1)).toBe(true);
  });
});

describe('storyline decisions', () => {
  it('pin the choice on a staff chart, and edit a user chart', () => {
    const s = run('kansas', 5, 3);
    const sq = squadFor(s, 'kansas');
    const qb = sq.depth.QB.filter((id) => sq.athletes.find((a) => a.id === id && !a.injury));
    expect(starters(sq).QB.id).toBe(qb[0]);
    s.stories = [{
      id: 'test', kind: 'slump', team: 'kansas', title: '', opened: 3, status: 'open', beats: [], stakes: '', slot: 'QB',
      decision: { prompt: '', slot: 'QB', week: 3, options: [{ id: qb[0], label: 'A', sub: '' }, { id: qb[1], label: 'B', sub: '' }] },
    }];
    decide(s, 'test', qb[1]);
    expect(s.teamState.kansas.pin).toEqual({ slot: 'QB', id: qb[1] });
    expect(starters(squadFor(s, 'kansas')).QB.id).toBe(qb[1]);
    expect(s.stories[0].status).toBe('resolved');

    // A user's own chart takes the decision directly.
    const t = run('kansas', 5, 3);
    t.config.delegate.depthChart = false;
    t.teamState.kansas.depth = JSON.parse(JSON.stringify(squadFor(t, 'kansas').depth));
    t.stories = [{ ...s.stories[0], status: 'open', decision: { ...s.stories[0].decision!, chosen: undefined } }];
    decide(t, 'test', qb[1]);
    expect(t.teamState.kansas.pin).toBeUndefined();
    expect(t.teamState.kansas.depth!.QB[0]).toBe(qb[1]);
  });
});

describe('storyline continuity', () => {
  it("never offers a starter, a hurt starter or a slumping player as a slump's replacement", () => {
    const s = run('kansas', 5, 3);
    const ts = s.teamState.kansas;
    const sq0 = squadFor(s, 'kansas');
    const st = starters(sq0);
    const wr1 = st.X;
    const slot = st.SL;
    // WR1 sits hurt: he keeps his role, and isn't the slot receiver's replacement.
    ts.injuries = { ...(ts.injuries ?? {}), [wr1.id]: { weeks: 1, type: 'TEST' } };
    const sq = squadFor(s, 'kansas');
    const roles = startingRoles(s, sq);
    expect(roles.has(wr1.id)).toBe(true);
    const alt = challenger(s, sq, 'SL', slot, roles);
    if (alt) {
      expect(roles.has(alt.id)).toBe(false);
      // A slumping backup isn't offered either.
      ((ts.progress ??= {})[alt.id] ??= { xp: 0, lvl: 0, d: {} }).c = -0.6;
      const next = challenger(s, squadFor(s, 'kansas'), 'SL', slot, startingRoles(s, squadFor(s, 'kansas')));
      expect(next?.id).not.toBe(alt.id);
    }
    for (const a of Object.values(st)) expect(challenger(s, sq, 'SL', slot, roles)?.id).not.toBe(a.id);
  });
});

describe('next man up', () => {
  it('is a bench player now starting, never a starter who slid over or came back; a package player gets none', () => {
    const s = run('kansas', 5, 4);
    const ts = s.teamState.kansas;
    const week = s.week - 1;
    const st = starters(squadFor(s, 'kansas'));
    const [wr1, slot, wr4] = [st.X, st.SL, st.WR4];
    // WR1 missed last game (he's not in last game's lineup) but has started all season.
    ts.st = { ...ts.st };
    for (const [k, v] of Object.entries(ts.st)) if (v === wr1.id) delete ts.st[k];
    ((ts.progress ??= {})[wr1.id] ??= { xp: 0, lvl: 0, d: {} }).gs = ts.gp;
    // The slot receiver is out for the season, and so is the WR4 (a package player).
    ts.injuries = { ...(ts.injuries ?? {}), [slot.id]: { weeks: 99, type: 'TEST', season: true }, ...(wr4 ? { [wr4.id]: { weeks: 99, type: 'TEST', season: true } } : {}) };
    const ev = (a: typeof slot) => ({ week, team: 'kansas', id: a.id, name: a.last, pos: a.pos, weeks: 99, type: 'TEST', season: true, starter: true });
    s.injuryLog = [...(s.injuryLog ?? []), ev(slot), ...(wr4 ? [ev(wr4)] : [])];
    const out = injuredStarters(s, week);
    const ids = out.map((x) => x.e.id);
    expect(ids).toContain(slot.id);
    if (wr4) expect(ids).not.toContain(wr4.id);
    const up = out.find((x) => x.e.id === slot.id)!.up;
    expect(up).toBeDefined();
    expect(up!.athlete.id).not.toBe(wr1.id);
    expect(Object.values(ts.st)).not.toContain(up!.athlete.id);
    expect(ts.progress?.[up!.athlete.id]?.gs ?? 0).toBeLessThan((ts.gp ?? 0) / 2);
  });
});
