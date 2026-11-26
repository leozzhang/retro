import { beforeAll, describe, expect, it } from 'vitest';
import { alumniList, buildPlaque, epithet, isHof, legacyTier, numberLineage, recordBook, syncAlumni, toggleHof } from './season/alumni';
import { simOffseason } from './season/offseason';
import { packSeason, unpackSeason } from './season/save';
import { defaultConfig, newSeason, simSeason } from './season/season';
import type { SeasonState } from './season/types';
import { baseRoster } from './season/world';
import { JERSEY, joinYear } from './data/rosterGen';
import { TEAMS } from './data/teams';

const config = { ...defaultConfig('georgia'), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal: true } };
const USER = 'georgia';

/** Two seasons and the offseasons after them: graduates, early entrants, transfers both ways. */
let raw: string;

beforeAll(() => {
  let s = newSeason(config, 7);
  simSeason(s);
  s = simOffseason(s);
  simSeason(s);
  s = simOffseason(s);
  raw = JSON.stringify(s);
}, 300_000);

const load = (): SeasonState => JSON.parse(raw);

describe('alumni', () => {
  it('keeps every player who played a season for the user, with how he left', () => {
    const s = load();
    const on = new Set(baseRoster(s, USER).map((a) => a.id));
    const store = Object.values(s.alumni!);
    const gone = store.filter((p) => p.exit);
    expect(gone.length).toBeGreaterThan(20);
    for (const p of gone) {
      expect(on.has(p.id)).toBe(false);
      expect(p.rows.length).toBeGreaterThan(0);
    }
    // Everyone with a season for the user is on the roster or frozen.
    for (const [id, c] of Object.entries(s.careers!)) {
      if (!c.seasons.some((r) => r.team === USER)) continue;
      expect(on.has(id) || !!s.alumni![id]?.exit).toBe(true);
    }
    const kinds = new Set(gone.map((p) => p.exit!.kind));
    expect(kinds.has('grad')).toBe(true);
    // Draft picks carry their round.
    const picks = s.history.flatMap((h) => h.draft ?? []).filter((d) => d.team === USER);
    for (const d of picks) expect(s.alumni![d.id]?.exit?.draft?.round).toBe(d.round);
    // Only the user's seasons.
    for (const p of store) for (const r of p.rows) expect(s.careers![p.id].seasons.some((x) => x.year === r.year && x.team === USER)).toBe(true);
  });

  it('the origins: inherited, signed, transfers and walk-ons', () => {
    const s = load();
    const list = alumniList(s);
    const origins = new Set(list.map((p) => p.origin));
    expect(origins.has('inherited')).toBe(true);
    expect(origins.has('signed')).toBe(true);
    for (const p of list.filter((x) => x.origin === 'transfer')) expect(p.from).toBeTruthy();
  });

  it('jerseys: joiners keep their number after they leave, and a plaque that lost it to #0 is repaired', () => {
    const s = load();
    const ts = s.teamState[USER];
    // A joiner with an archived season leaves (as a transfer out would).
    const e = ts.roster!.in!.find((x) => joinYear(x.id) !== undefined && s.careers![x.id]?.seasons.some((r) => r.team === USER))!;
    expect(e).toBeDefined();
    ts.roster!.in = ts.roster!.in!.filter((x) => x.id !== e.id);
    delete s.alumni![e.id];
    syncAlumni(s);
    expect(s.alumni![e.id].num).toBe(e.num);
    // A save from before rows kept numbers: the backfill froze him at the generated record's 0.
    const p = s.alumni![e.id];
    p.num = 0;
    p.exit ??= { kind: 'transfer', year: s.year };
    for (const r of p.rows) delete r.num;
    for (const r of s.careers![e.id].seasons) delete r.num;
    syncAlumni(s);
    expect(s.alumni![e.id].num).not.toBe(0);
    expect(JERSEY.bands[p.pos].some(([lo, hi]) => s.alumni![e.id].num >= lo && s.alumni![e.id].num <= hi)).toBe(true);
  });

  it('jerseys: every number in its position bands, almost no same-side duplicates', () => {
    const s = load();
    const OFF = new Set(['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C']);
    let same = 0;
    for (const t of TEAMS) {
      const seen = new Map<number, string[]>();
      for (const a of baseRoster(s, t.id)) {
        expect(JERSEY.bands[a.pos].some(([lo, hi]) => a.num >= lo && a.num <= hi)).toBe(true);
        (seen.get(a.num) ?? seen.set(a.num, []).get(a.num)!).push(a.pos);
      }
      for (const ps of seen.values()) {
        const o = ps.filter((x) => OFF.has(x)).length;
        if (o > 1 || ps.length - o > 1) same++;
      }
    }
    expect(same).toBeLessThan(TEAMS.length / 10);
  });

  it('sync is idempotent and backfills a save from before the store', () => {
    const s = load();
    const before = JSON.stringify(s.alumni);
    syncAlumni(s);
    expect(JSON.stringify(s.alumni)).toBe(before);
    delete s.alumni;
    syncAlumni(s);
    const back = s.alumni!;
    const old = JSON.parse(before);
    // A backfill rebuilds the same plaques (numbers from the generated roster may differ for transfers).
    expect(Object.keys(back).sort()).toEqual(Object.keys(old).sort());
    for (const id of Object.keys(old)) expect(back[id].rows.map((r) => r.year)).toEqual(old[id].rows.map((r: { year: number }) => r.year));
  });

  it('the live list lays this season over the roster, and tiers and words follow the legacy', () => {
    const s = load();
    const list = alumniList(s);
    const on = baseRoster(s, USER);
    expect(list.filter((p) => !p.exit).length).toBe(on.length);
    const tiers: Record<string, number> = {};
    for (const p of list) tiers[legacyTier(s, p)] = (tiers[legacyTier(s, p)] ?? 0) + 1;
    // Legends are rare: fewer than the starters.
    expect(tiers.legend ?? 0).toBeLessThan(tiers.starter ?? 0);
    for (const p of list) {
      const t = legacyTier(s, p);
      expect(!!epithet(s, p)).toBe(t === 'star' || t === 'legend' || t === 'hof');
    }
    const rb = recordBook(list, 'rushYds');
    expect(rb.season.length).toBeGreaterThan(0);
    for (let i = 1; i < rb.career.length; i++) expect(rb.career[i].value).toBeLessThanOrEqual(rb.career[i - 1].value);
    expect(numberLineage(list).size).toBeGreaterThan(30);
  });

  it('the Hall of Fame toggle survives a save', () => {
    const s = load();
    const p = Object.values(s.alumni!).find((x) => x.exit)!;
    expect(toggleHof(s, p.id)).toBe(true);
    expect(legacyTier(s, p)).toBe('hof');
    const back = unpackSeason(packSeason(s));
    expect(isHof(back, p.id)).toBe(true);
    expect(back.alumni![p.id]).toEqual(s.alumni![p.id]);
    toggleHof(back, p.id);
    expect(isHof(back, p.id)).toBe(false);
  });

  it('a plaque builds from a career alone', () => {
    const s = load();
    const p = Object.values(s.alumni!).find((x) => x.exit)!;
    const again = buildPlaque(s, p.id, USER, { prev: p })!;
    expect(again).toEqual(p);
  });
});
