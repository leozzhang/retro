import { beforeAll, describe, expect, it } from 'vitest';
import { generatedAthlete } from './data/depth';
import type { RatingKey } from './data/ratings';
import { TEAMS } from './data/teams';
import { careerOf, careerRows, careerTotals, headline, liveSeason, priorGains, seasonGain } from './season/career';
import { simOffseason } from './season/offseason';
import { packSeason, unpackSeason } from './season/save';
import { advanceWeek, defaultConfig, newSeason, simSeason } from './season/season';
import { seasonStats } from './season/stats';
import type { Progress, SeasonState } from './season/types';
import { baseRoster } from './season/world';

const config = { ...defaultConfig('georgia'), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal: true } };

/** One open season played out (before archiving's carry), and the year after its offseason. */
let year1: string;
let year2: string;
/** Every player's progress at the end of year 1, by id, and his starts that season. */
const endProgress = new Map<string, Progress>();

beforeAll(() => {
  const s = newSeason(config, 11);
  simSeason(s);
  for (const t of TEAMS) for (const [id, p] of Object.entries(s.teamState[t.id]?.progress ?? {})) endProgress.set(id, JSON.parse(JSON.stringify(p)));
  year1 = JSON.stringify(s);
  year2 = JSON.stringify(simOffseason(s));
}, 120_000);

const load = (raw: string): SeasonState => JSON.parse(raw);

describe('careers', () => {
  it('a finished season gives every rostered player one row, with his starts and stats', () => {
    const s = load(year1);
    const stats = seasonStats(s);
    for (const t of TEAMS) {
      for (const a of baseRoster(s, t.id)) {
        const c = careerOf(s, a.id)!;
        expect(c.seasons.filter((r) => r.year === s.year)).toHaveLength(1);
        const row = c.seasons[0];
        expect(row.team).toBe(t.id);
        expect(c.now).toBeUndefined();
        expect(row.gs ?? 0).toBe(endProgress.get(a.id)?.gs ?? 0);
        expect(row.st?.passYds ?? 0).toBe(stats.get(a.id)?.passYds ?? 0);
        expect(row.gs ?? 0).toBeLessThanOrEqual(row.gp ?? 0);
        if (row.role === 'dnp') expect(row.gp).toBeUndefined();
      }
    }
  });

  it('season gains are this season only; all-time gains live in the rows', () => {
    const s = load(year1);
    const [id, p] = [...endProgress].find(([, x]) => x.lvl >= 2)!;
    const k = Object.keys(p.d)[0] as RatingKey;
    // After the archive, SZN still shows this season (its own row isn't "prior").
    expect(seasonGain(s, id, p, k)).toBe(p.d[k]);
    expect(careerOf(s, id)!.seasons[0].d?.[k]).toBe(p.d[k]);
    // Next year, the same progress is all prior.
    const n = load(year2);
    expect(seasonGain(n, id, p, k)).toBe(0);
    expect(priorGains(careerOf(n, id), n.year).d[k]).toBe(p.d[k]);
  });

  it('overall runs from start to end within a season and carries into the next', () => {
    const s = load(year1);
    for (const c of Object.values(s.careers!)) {
      const r = c.seasons[0];
      if (r) expect(r.ovr1).toBeGreaterThanOrEqual(r.ovr0);
    }
    const n = load(year2);
    advanceWeek(n);
    const team = TEAMS.find((t) => baseRoster(n, t.id).some((a) => (careerOf(n, a.id)?.seasons[0]?.lvl ?? 0) > 0))!;
    const a = baseRoster(n, team.id).find((x) => (careerOf(n, x.id)?.seasons[0]?.lvl ?? 0) > 0)!;
    const live = liveSeason(n, a, team.id)!;
    expect(live.year).toBe(n.year);
    expect(live.ovr0).toBe(careerOf(n, a.id)!.seasons[0].ovr1);
  });

  it('a transfer brings his history: his old row, a transfer line, and a headline', () => {
    const n = load(year2);
    const moved = Object.entries(n.careers!).find(([, c]) => c.story.some((e) => e.kind === 'transfer'))!;
    const [id, c] = moved;
    const tr = c.story.find((e) => e.kind === 'transfer')!;
    expect(c.seasons[0].team).toBe(tr.from);
    expect(baseRoster(n, tr.team).some((a) => a.id === id)).toBe(true);
    const rows = careerRows(n, generatedAthlete(id)!, tr.team);
    expect(rows.map((r) => r.team)).toEqual([tr.from, tr.team]);
    expect(headline(c, rows)[0]).toMatch(/^Transfer from /);
  });

  it('the story tells sparks, breakouts, first starts and injuries as they happen', () => {
    const s = load(year1);
    const kinds = new Map<string, number>();
    for (const c of Object.values(s.careers!)) for (const e of c.story) kinds.set(e.kind, (kinds.get(e.kind) ?? 0) + 1);
    for (const k of ['start', 'spark', 'breakout', 'breakthrough', 'injury', 'award']) expect(kinds.get(k) ?? 0).toBeGreaterThan(0);
    // Every spark and breakout in the season's log is in the player's story, in the right week.
    for (const e of s.confLog ?? []) {
      if (e.kind === 'bench') continue;
      expect(careerOf(s, e.id)!.story.some((x) => x.kind === e.kind && x.week === e.week)).toBe(true);
    }
    // A spark for an injured starter names who he replaced.
    const sp = s.confLog!.find((e) => e.kind === 'spark' && e.reason === 'injured' && e.rep)!;
    const line = careerOf(s, sp.id)!.story.find((x) => x.kind === 'spark' && x.week === sp.week)!;
    expect(line.text).toContain(generatedAthlete(sp.rep!)!.last);
  });

  it('totals sum the rows', () => {
    const s = load(year1);
    const [id] = [...seasonStats(s)].sort((a, b) => b[1].passYds - a[1].passYds)[0];
    const c = careerOf(s, id)!;
    expect(careerTotals(c.seasons).st.passYds).toBe(seasonStats(s).get(id)!.passYds);
  });

  it('survives a save and continues identically', () => {
    const a = load(year2);
    const b = unpackSeason(packSeason(load(year2)));
    for (let i = 0; i < 3; i++) {
      advanceWeek(a);
      advanceWeek(b);
    }
    expect(JSON.stringify(b.careers)).toBe(JSON.stringify(a.careers));
  });
});
