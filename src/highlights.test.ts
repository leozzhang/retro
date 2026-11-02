import { describe, expect, it } from 'vitest';
import { buildSquad, onField, teamRatings } from './data/depth';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { QUARTER_DRIVES, QUARTER_OPTIONS } from './game/clock';
import { KEY_LEVELS, KEY_PLAYS, pickDrive, pickGame, type KeyPlay } from './game/keyPlays';
import { FgSearch, fgTargetFor, matches, ReplaySearch, runFg, runReplay, targetFor } from './game/replay';
import { advanceWeek, defaultConfig, newSeason } from './season/season';
import { simGame, simPart } from './season/simGame';
import { autoGamePlan } from './season/staff';
import { newStory, storyClock } from './season/story';

const uga = buildSquad(teamById('georgia'));
const bama = buildSquad(teamById('alabama'));
const plans = { user: autoGamePlan(uga, bama), cpu: autoGamePlan(bama, uga) };

describe('highlights', () => {
  it('a story only watches: a week with one plays exactly like a week without', () => {
    const a = newSeason(defaultConfig('georgia'), 21);
    const b = newSeason(defaultConfig('georgia'), 21);
    let told = 0;
    for (let w = 0; w < 4; w++) {
      const story = newStory('', '');
      advanceWeek(a);
      advanceWeek(b, undefined, undefined, story);
      told += story.drives.length;
    }
    expect(told).toBeGreaterThan(30);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('simGame with a story gives the same result, and the story adds up to it', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const story = newStory('georgia', 'alabama');
      const plain = simGame(uga, bama, mulberry32(seed), { drives: [] });
      const told = simGame(uga, bama, mulberry32(seed), { drives: [], story });
      expect(told).toEqual(plain);
      const pts = (id: string) => story.drives.filter((d) => d.off === id).reduce((s, d) => s + d.points, 0);
      expect(pts('georgia')).toBe(told.home);
      expect(pts('alabama')).toBe(told.away);
      for (const d of story.drives) {
        // Snaps start where the last one ended.
        const snaps = d.plays.filter((p) => !p.fg && !p.punt);
        if (snaps.length) expect(snaps[0].yard).toBe(d.start);
        if (d.result === 'TOUCHDOWN') expect(d.credit.td).toBeDefined();
      }
    }
  });

  it('simPart stops at the quarter asked for, with a consistent hand-off', () => {
    for (const to of [2, 3, 4]) {
      for (let seed = 1; seed <= 60; seed++) {
        const story = newStory('georgia', 'alabama');
        const r = simPart(uga, bama, seed % 2 === 0, 6, to, mulberry32(seed), { plans, story, drives: [] });
        const pts = (id: string) => story.drives.filter((d) => d.off === id).reduce((s, d) => s + d.points, 0);
        expect(r.user).toBe(pts('georgia'));
        expect(r.cpu).toBe(pts('alabama'));
        expect(r.time).toBeGreaterThanOrEqual(0);
        expect(r.time).toBeLessThanOrEqual(360);
        if (r.next.kind === 'halftime') expect([r.quarter, r.time]).toEqual([2, 0]);
        else if (r.next.kind !== 'final') expect(r.quarter).toBeGreaterThanOrEqual(to);
        if (to === 3) expect(r.next.kind).toBe('halftime');
        // A quarter taken over mid-half is always the whole quarter.
        else expect([r.quarter, r.time]).toEqual([to, 360]);
        // The user takes the opening kickoff; the CPU the second half's.
        expect(story.drives[0].off).toBe('georgia');
        const second = story.drives.find((d) => d.half === 1);
        if (second) expect(second.off).toBe('alabama');
        if (r.next.kind === 'user' || r.next.kind === 'cpu') expect(r.next.start).toBeGreaterThan(0);
      }
    }
  });

  it('simPart simmed to the end has about the possessions a played game does', () => {
    QUARTER_OPTIONS.forEach((q, i) => {
      let drives = 0;
      const n = 200;
      for (let seed = 1; seed <= n; seed++) {
        const story = newStory('georgia', 'alabama');
        simPart(uga, bama, true, q, 5, mulberry32(seed), { plans, story });
        drives += story.drives.length;
      }
      expect(Math.abs(drives / n / 2 - QUARTER_DRIVES[i])).toBeLessThan(0.75);
    });
  });

  it('key plays: levels nest, caps hold, scores and turnovers always show', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const story = newStory('georgia', 'alabama');
      simGame(uga, bama, mulberry32(seed), { story });
      let prev = -1;
      for (const level of KEY_LEVELS) {
        const picks = pickGame(story, level);
        expect(picks.length).toBeGreaterThanOrEqual(prev);
        prev = picks.length;
        if (level === 'off') expect(picks).toEqual([]);
        for (const d of story.drives) {
          const dp = pickDrive(d, level, 'defense');
          expect(dp.length).toBeLessThanOrEqual(KEY_PLAYS.perDrive.defense[level]);
          if (level !== 'off' && (d.result === 'TOUCHDOWN' || d.result === 'TURNOVER')) {
            expect(dp.some((k) => k.kind === 'td' || k.kind === 'int' || k.kind === 'fumble')).toBe(true);
          }
        }
        // Each quarter: no more than the cap beyond its must-shows.
        const byQ = new Map<number, KeyPlay[]>();
        for (const k of picks) {
          const q = storyClock(k.drive, k.play.t).quarter;
          byQ.set(q, [...(byQ.get(q) ?? []), k]);
        }
        for (const list of byQ.values()) {
          const must = list.filter((k) => k.priority >= 3).length;
          expect(list.length).toBeLessThanOrEqual(Math.max(must, KEY_PLAYS.perQuarter[level]));
        }
      }
    }
  });

  it('replays: most key plays find a matching replay, which replays identically and leaves the rosters alone', () => {
    const sides = { georgia: { team: uga.team, roster: onField(uga) }, alabama: { team: bama.team, roster: onField(bama) } };
    const before = JSON.stringify(sides);
    let tried = 0;
    let found = 0;
    const kinds: Record<string, [number, number]> = {};
    for (let seed = 1; seed <= 6; seed++) {
      const story = newStory('georgia', 'alabama');
      simGame(uga, bama, mulberry32(seed), { story });
      for (const k of pickGame(story, 'full')) {
        const off = k.drive.off as 'georgia' | 'alabama';
        const def = off === 'georgia' ? 'alabama' : 'georgia';
        const t = targetFor(k, sides[off], sides[def], 0.5);
        if (!t) continue;
        const search = new ReplaySearch(t, 1000 + tried);
        while (!search.done) search.step(1000);
        tried++;
        const row = (kinds[k.kind] ??= [0, 0]);
        row[1]++;
        if (!search.found) continue;
        found++;
        row[0]++;
        // The same setup plays out the same way again.
        const again = runReplay(t, search.found);
        expect(matches(t, again)).toBe(true);
      }
    }
    expect(JSON.stringify(sides)).toBe(before);
    console.log(`replays matched ${found}/${tried}`, Object.entries(kinds).map(([k, [f, n]]) => `${k} ${f}/${n}`).join('  '));
    expect(found / tried).toBeGreaterThan(0.85);
  }, 120_000);

  it('field goals: always key plays, and replayed as a kick that is good or no good like the sim', () => {
    const sides = { georgia: { team: uga.team, roster: onField(uga) }, alabama: { team: bama.team, roster: onField(bama) } };
    let tried = 0;
    let found = 0;
    let missed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const story = newStory('georgia', 'alabama');
      simGame(uga, bama, mulberry32(seed), { story });
      const kicks = story.drives.flatMap((d) => d.plays.filter((p) => p.fg));
      const picks = pickGame(story, 'lean').filter((k) => k.play.fg);
      expect(picks.length).toBe(kicks.length);
      for (const k of picks) {
        const off = k.drive.off as 'georgia' | 'alabama';
        const t = fgTargetFor(k, sides[off], sides[off === 'georgia' ? 'alabama' : 'georgia'])!;
        const search = new FgSearch(t, 500 + tried);
        while (!search.done) search.step(1000);
        tried++;
        if (!t.made) missed++;
        if (!search.found) continue;
        found++;
        expect(runFg(t, search.found).outcome?.result).toBe(t.made ? 'fgGood' : 'fgMiss');
      }
    }
    console.log(`field goals matched ${found}/${tried} (${missed} misses)`);
    expect(missed).toBeGreaterThan(0);
    expect(found / tried).toBeGreaterThan(0.9);
  }, 120_000);

  it('the teams in these tests are close enough to be a fair sample', () => {
    expect(Math.abs(teamRatings(uga).ovr - teamRatings(bama).ovr)).toBeLessThan(10);
  });
});
