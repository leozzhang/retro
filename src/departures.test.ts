import { beforeAll, describe, expect, it } from 'vitest';
import { generatedAthlete } from './data/depth';
import { overall } from './data/positions';
import { freshmanId, joinYear, parseFreshman, walkOnId } from './data/rosterGen';
import { TEAMS } from './data/teams';
import { classIn, outOfEligibility } from './season/classes';
import { DEPARTURES, meetOnWatch } from './season/departures';
import { DRAFT_PICKS, NFL_CITIES, roundOf } from './season/draft';
import { advanceOffseason, simOffseason, startOffseason } from './season/offseason';
import { PORTAL } from './season/portal';
import { offseasonGrowth } from './season/progression';
import { defaultConfig, newSeason, simSeason } from './season/season';
import type { SeasonState } from './season/types';
import { baseRoster, seasonRng, squadFor } from './season/world';

/** One played-out open season, shared; each test takes a copy. */
let done: string;
const copy = (): SeasonState => JSON.parse(done);
const config = () => ({ ...defaultConfig('georgia'), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal: true, carousel: true } });

/** Through the carousel to the departures stage's declare watch. */
function toWatch(s: SeasonState): SeasonState {
  startOffseason(s);
  while (s.offseason?.stage === 'carousel') advanceOffseason(s);
  return s;
}

beforeAll(() => {
  const s = newSeason(config(), 11);
  simSeason(s);
  done = JSON.stringify(s);
}, 60_000);

describe('class years', () => {
  it('a class moves a year a season, and a redshirt year holds it back once', () => {
    const fr = { id: 'x-1', year: 'FR' as const, redshirt: false };
    expect(classIn(fr, 2026)).toMatchObject({ year: 'FR', redshirt: false, seasons: 1 });
    expect(classIn(fr, 2027)).toMatchObject({ year: 'SO', redshirt: false, seasons: 2 });
    expect(classIn(fr, 2027, 2026)).toMatchObject({ year: 'FR', redshirt: true, seasons: 2 });
    expect(classIn(fr, 2030, 2026)).toMatchObject({ year: 'SR', redshirt: true, seasons: 5 });
    // The redshirt season itself still counts as his class.
    expect(classIn(fr, 2026, 2026)).toMatchObject({ year: 'FR', redshirt: false });
    expect(outOfEligibility({ ...fr, year: 'SR' }, 2026)).toBe(true);
    expect(outOfEligibility({ ...fr, year: 'SR' }, 2026, 2026)).toBe(false);
    expect(outOfEligibility(fr, 2029)).toBe(true);
    expect(outOfEligibility(fr, 2029, 2027)).toBe(false);
  });

  it('walk-ons and freshmen start as freshmen in the season their id names', () => {
    const w = walkOnId('ohiostate', 2028, 'WR', 0);
    const f = freshmanId('ohiostate', 2028, 'CB', 3);
    expect(joinYear(w)).toBe(2028);
    expect(joinYear(f)).toBe(2028);
    expect(joinYear('ohiostate-12')).toBeUndefined();
    expect(parseFreshman(f)).toEqual({ team: 'ohiostate', pos: 'CB' });
    const a = generatedAthlete(f)!;
    expect(a).toEqual(generatedAthlete(f));
    expect(a.pos).toBe('CB');
    expect(classIn(a, 2028).year).toBe('FR');
    expect(classIn(a, 2029).year).toBe('SO');
  });

  it('a placeholder freshman starts near his team\'s generated freshmen, and a power\'s above a small program\'s', () => {
    const mean = (team: string, f: (i: number) => string) => {
      let sum = 0;
      for (let i = 0; i < 60; i++) {
        const a = generatedAthlete(f(i))!;
        sum += overall(a.r, a.pos);
      }
      return sum / 60;
    };
    const gen = (team: string) => {
      const fr = baseRoster(newSeason(defaultConfig(team), 1), team).filter((a) => a.year === 'FR' && !a.redshirt && !a.real);
      return fr.reduce((s, a) => s + overall(a.r, a.pos), 0) / fr.length;
    };
    for (const team of ['georgia', 'kentstate']) {
      const made = mean(team, (i) => freshmanId(team, 2027, (['WR', 'CB', 'OT', 'DE', 'HB', 'MLB'] as const)[i % 6], i));
      expect(Math.abs(made - gen(team))).toBeLessThan(3);
    }
    expect(mean('georgia', (i) => freshmanId('georgia', 2027, 'WR', i))).toBeGreaterThan(mean('kentstate', (i) => freshmanId('kentstate', 2027, 'WR', i)) + 10);
  });

  it('next season\'s roster shows everyone a class older', () => {
    const s = copy();
    const before = new Map(baseRoster(s, 'georgia').map((a) => [a.id, a]));
    const next = simOffseason(s);
    for (const a of baseRoster(next, 'georgia')) {
      const was = before.get(a.id);
      if (!was) continue;
      const rs = next.teamState.georgia.progress?.[a.id]?.rs === s.year;
      const step = rs ? 0 : 1;
      expect(['FR', 'SO', 'JR', 'SR'].indexOf(a.year) - ['FR', 'SO', 'JR', 'SR'].indexOf(was.year)).toBe(step);
      if (rs) expect(a.redshirt).toBe(true);
    }
  }, 60_000);
});

describe('departures', () => {
  let a: SeasonState;
  let old: SeasonState;
  beforeAll(() => {
    old = copy();
    a = simOffseason(old);
  }, 60_000);

  it('every senior out of eligibility leaves, and nobody who left is on a roster', () => {
    const gone = old.departures!.gone!;
    expect(gone.length / TEAMS.length).toBeGreaterThan(12);
    expect(gone.length / TEAMS.length).toBeLessThan(30);
    const out = new Set(gone.map((g) => g.id));
    const onRoster = new Set(TEAMS.flatMap((t) => baseRoster(a, t.id).map((x) => x.id)));
    for (const id of out) expect(onRoster.has(id)).toBe(false);
    for (const t of TEAMS) {
      for (const x of baseRoster(a, t.id)) {
        const gen = generatedAthlete(x.id)!;
        expect(outOfEligibility(gen, old.year, a.teamState[t.id].progress?.[x.id]?.rs)).toBe(false);
      }
    }
  });

  it('true freshmen who barely played keep a year; ones who played more don\'t', () => {
    let kept = 0;
    let lost = 0;
    const pre = copy();
    for (const t of TEAMS) {
      // His team's true freshmen at season's end, still there (a transfer's progress moved with him).
      const still = new Set(baseRoster(old, t.id).map((x) => x.id));
      for (const x of squadFor(pre, t.id).athletes) {
        if (x.year !== 'FR' || x.redshirt || !still.has(x.id)) continue;
        const p = old.teamState[t.id].progress?.[x.id];
        if ((p?.gp ?? 0) <= DEPARTURES.redshirtGames) {
          expect(p?.rs).toBe(old.year);
          kept++;
        } else {
          expect(p?.rs).toBeUndefined();
          lost++;
        }
      }
    }
    expect(kept).toBeGreaterThan(200);
    expect(lost).toBeGreaterThan(50);
  });

  it('the draft takes 257 different players, in order, by city, and they leave', () => {
    const picks = a.history.find((h) => h.year === old.year)!.draft!;
    expect(picks.length).toBe(DRAFT_PICKS);
    expect(new Set(picks.map((p) => p.id)).size).toBe(DRAFT_PICKS);
    expect(DRAFT_PICKS).toBe(257);
    picks.forEach((p, i) => {
      expect(p.pick).toBe(i + 1);
      expect(p.round).toBe(roundOf(p.pick));
      expect(NFL_CITIES).toContain(p.city);
    });
    // Each round opens in the same order; compensatory picks close rounds 3-7.
    for (let r = 2; r <= 7; r++) {
      const first = picks.filter((p) => p.round === r).slice(0, 32);
      expect(first.map((p) => p.city)).toEqual(picks.slice(0, 32).map((p) => p.city));
    }
    expect(picks.filter((p) => p.round === 1).length).toBe(32);
    expect(picks.filter((p) => p.round === 7).length).toBe(38);
    const early = picks.filter((p) => p.early).length;
    expect(early).toBeGreaterThan(20);
    expect(early).toBeLessThan(140);
    // The first round leans toward the best players.
    const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    expect(mean(picks.slice(0, 32).map((p) => p.ovr))).toBeGreaterThan(mean(picks.slice(-32).map((p) => p.ovr)));
    expect(a.careers![picks[0].id].story.some((e) => e.kind === 'drafted')).toBe(true);
    expect(a.news.some((n) => n.kind === 'draft')).toBe(true);
  });

  it('rosters refill to the cap with freshmen, and returning players grow while the freshmen don\'t', () => {
    for (const t of TEAMS) expect(baseRoster(a, t.id).length).toBe(PORTAL.rosterMax);
    const fresh = baseRoster(a, 'georgia').filter((x) => joinYear(x.id) === a.year);
    expect(fresh.length).toBeGreaterThan(5);
    for (const x of fresh) expect(a.teamState.georgia.progress?.[x.id]?.lvl ?? 0).toBe(0);
    const prog = JSON.parse(JSON.stringify(a.teamState.georgia.progress ?? {}));
    const gains = offseasonGrowth(prog, squadFor(old, 'georgia'), () => 0, seasonRng(a, 'test'));
    const grew = gains.filter((g) => g.to > g.from).length;
    expect(grew / gains.length).toBeGreaterThan(0.7);
    const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const by = (y: string) => mean(gains.filter((g) => g.athlete.year === y).map((g) => g.to - g.from));
    expect(by('FR')).toBeGreaterThan(by('JR'));
  });

  it('is deterministic, and a save at the declare watch continues identically', () => {
    let c = toWatch(copy());
    c = JSON.parse(JSON.stringify(c));
    c = advanceOffseason(c);
    c = JSON.parse(JSON.stringify(c));
    while (c.phase === 'offseason') c = advanceOffseason(c);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  }, 60_000);
});

describe('the declare watch', () => {
  it('lists the user\'s likely early entrants, meetings are limited, and a good talk keeps a player', () => {
    // A power program has underclassmen the NFL wants.
    const s = copy();
    s.config.delegate.departures = false;
    toWatch(s);
    const ids = Object.keys(s.departures!.watch);
    expect(ids.length).toBeGreaterThan(0);
    const roster = new Set(baseRoster(s, 'georgia').map((x) => x.id));
    for (const id of ids) {
      expect(roster.has(id)).toBe(true);
      expect(s.departures!.watch[id].p).toBeGreaterThanOrEqual(DEPARTURES.watch);
    }
    let met = 0;
    for (const id of ids) if (meetOnWatch(s, id)) met++;
    expect(met).toBe(Math.min(ids.length, DEPARTURES.meet.n));
    for (const id of ids) {
      const e = s.departures!.watch[id];
      if (e.ok) expect(s.departures!.adj[id]).toBe(-DEPARTURES.meet.lift);
    }
    expect(meetOnWatch(s, ids[0])).toBe(false);
  }, 60_000);
});
