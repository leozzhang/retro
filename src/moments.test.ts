import { describe, expect, it } from 'vitest';
import { starters } from './data/depth';
import { injuredStarters, MOMENTS, unseenWrap, wrapOrder, markSeen } from './season/moments';
import { advanceWeek, defaultConfig, newSeason, WEEK_STEPS } from './season/season';
import { challenger, decide, startingRoles } from './season/storylines';
import type { Moment, SeasonState } from './season/types';
import { squadFor } from './season/world';
import { advanceOffseason, startOffseason } from './season/offseason';
import { STAGE_MOMENTS } from './season/offseasonMoments';
import { nextHomeGame, openRecruiting } from './season/recruiting';
import { RSTORY } from './season/recruitStories';

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

// ---------------------------------------------------------------- part 2: recruiting, races, the offseason

const openRun = (team: string, seed: number, delegate = false) => {
  const c = { ...defaultConfig(team), length: 'open' as const };
  c.delegate = { ...c.delegate, recruiting: delegate };
  const s = newSeason(c, seed);
  for (let i = 0; i < 30 && s.phase !== 'complete'; i++) advanceWeek(s);
  return s;
};

/** A season, its offseason and the next season's start, with the stage reveals and the opener on or off. */
const throughOffseason = (on: boolean) => {
  STAGE_MOMENTS.on = on;
  try {
    const s = openRun('georgia', 3);
    startOffseason(s);
    for (let i = 0; i < 40; i++) {
      const next = advanceOffseason(s);
      if (next !== s) return { prev: s, next };
    }
    throw new Error('the offseason never ended');
  } finally {
    STAGE_MOMENTS.on = true;
  }
};

const stripAll = (s: SeasonState) => JSON.stringify({ ...s, moments: undefined, buzz: undefined, stories: undefined, seenMoments: undefined, lineup: undefined });

describe('recruiting, races and the offseason as storylines', () => {
  it('change nothing in a season with user recruiting, and follow the user recruits', { timeout: 120000 }, () => {
    const c = { ...defaultConfig('georgia'), length: 'open' as const };
    const go = (steps = WEEK_STEPS) => {
      const s = newSeason(c, 3);
      const saved = WEEK_STEPS.splice(0, WEEK_STEPS.length, ...steps);
      try {
        for (let i = 0; i < 9; i++) advanceWeek(s);
      } finally {
        WEEK_STEPS.splice(0, WEEK_STEPS.length, ...saved);
      }
      return s;
    };
    const on = go();
    expect(strip(on)).toBe(strip(go(WEEK_STEPS.filter((x) => x.name !== 'moments'))));
    expect(on.stories!.some((x) => x.kind === 'recruitment')).toBe(true);
  });

  it('a recruiting decision acts through the visit and in-home levers; staff recruiting never asks', { timeout: 120000 }, () => {
    const s = openRun('georgia', 3);
    const asked = s.stories!.filter((x) => x.kind === 'recruitment' && x.decision);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThanOrEqual(RSTORY.asks);
    expect(openRun('georgia', 3, true).stories!.some((x) => x.kind === 'recruitment' && x.decision)).toBe(false);

    // Hosting: the decision puts him on the next home game's visit list.
    const t = run('kansas', 5, 3);
    t.config.length = 'open';
    const home = nextHomeGame(t)!;
    const rs = t.recruiting ?? (openRecruiting(t), t.recruiting!);
    const id = Object.keys(rs.interest).find((x) => !rs.commits[x] && !(rs.ov[x]?.length))!;
    t.stories = [{ id: 'r', kind: 'recruitment', team: 'kansas', title: '', opened: 3, status: 'open', beats: [], stakes: '', decision: { prompt: '', slot: '', act: 'visit', week: 3, options: [{ id, label: 'HOST', sub: '' }, { id: '', label: 'NO', sub: '' }] } }];
    decide(t, 'r', id);
    expect(rs.visits[home.id]).toContain(id);
    expect(t.stories[0].status).toBe('open');
  });

  it('the conference race never calls a clinch or an elimination the title game contradicts', { timeout: 120000 }, () => {
    for (const [team, seed] of [['georgia', 3], ['smu', 7]] as const) {
      const s = openRun(team, seed);
      const inIt = s.games.some((g) => g.kind === 'champ' && (g.home === team || g.away === team));
      const race = s.stories!.find((x) => x.kind === 'confRace');
      if (!race) continue;
      if (race.k?.clinched) expect(inIt).toBe(true);
      if (race.outcome === 'ELIMINATED') expect(inIt).toBe(false);
    }
  });

  it('the offseason reveals and the opener change nothing, and tell it straight', () => {
    const on = throughOffseason(true);
    const off = throughOffseason(false);
    expect(stripAll(on.prev)).toBe(stripAll(off.prev));
    expect(stripAll(on.next)).toBe(stripAll(off.next));
    const u = 'georgia';
    const stages = new Set(on.prev.moments!.filter((m) => m.os).map((m) => m.os));
    for (const st of ['carousel', 'departures', 'signing'] as const) expect(stages.has(st)).toBe(true);
    // A draft card reads his class as it was this season (three seasons out of high school at least), not his generated freshman self.
    for (const m of on.prev.moments!.filter((x) => x.kind === 'draft' && x.p)) expect(m.p!.cls).not.toMatch(/^(RS )?FR/);
    // The opener lists every transfer in, and every new starter says whom he replaces.
    const arrivals = on.next.moments!.find((m) => m.title === 'NEW ARRIVALS');
    const tin = Object.entries(on.prev.portal?.commits ?? {}).filter(([, t]) => t === u).length;
    if (tin) expect(arrivals!.rows!.filter((r) => r.val?.includes('TRANSFER')).length).toBe(Math.min(tin, 8));
    const st = starters(squadFor(on.next, u));
    const was = on.prev.lineup ?? {};
    const newQb = was.QB && was.QB !== st.QB.id;
    const rows = on.next.moments!.find((m) => m.title === 'NEW STARTERS')?.rows ?? [];
    if (newQb) expect(rows.some((r) => r.text.startsWith('QB:') && r.val!.includes('REPLACES'))).toBe(true);
    // A transfer risk closes with the portal: entered if he's an entrant, stayed if not.
    const entrants = new Set((on.prev.portal?.entrants ?? []).filter((e) => e.from === u).map((e) => e.id));
    for (const s of on.prev.stories!.filter((x) => x.kind === 'transferRisk')) {
      expect(s.status).toBe('resolved');
      if (s.outcome === 'ENTERED THE PORTAL') expect(entrants.has(s.star!.id)).toBe(true);
      if (s.outcome === 'STAYED') expect(entrants.has(s.star!.id)).toBe(false);
    }
  }, 120000);
});
