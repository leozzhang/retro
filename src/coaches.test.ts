import { describe, expect, it } from 'vitest';
import { buildStaff, COACH_ROLES, GROUPS, type Staff } from './data/coaches';
import { freshSquad } from './data/depth';
import { EMPHASES, emphasisById, groupEmphases, GROUP_POS, STANDARD } from './data/emphasis';
import { defStyle } from './data/identity';
import { overallRaw, OVR_WEIGHTS, POSITIONS } from './data/positions';
import { TEAMS, teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { simulateDrive, type SimPlay } from './game/rules';
import { driveMods, emphasisMods, explosiveFactor, groupOf, passOdds, snapEdge, type Picks } from './season/emphasis';
import { gradeGame } from './season/grades';
import { progressTeam } from './season/progression';
import { pctAt, SCOUT_TIERS, scoutReport } from './season/scouting';
import { advanceWeek, defaultConfig, newSeason, userGameThisWeek } from './season/season';
import { simGame } from './season/simGame';
import type { DriveLog, SeasonState, TeamState } from './season/types';
import { squadFor, staffFor } from './season/world';

/** A copy of a team's staff with every rating set to `n`. */
function staffAt(teamId: string, n: number): Staff {
  const st = structuredClone(buildStaff(teamById(teamId)));
  for (const c of Object.values(st)) c.r = { scout: n, ...(c.r.teach !== undefined ? { teach: n, game: n } : {}) };
  return st;
}

const CLOCK = { timeLeft: 900, hurry: false, milk: false };

describe('coaching staffs', () => {
  it('every team has a full, deterministic, plain-JSON staff', () => {
    for (const t of TEAMS) {
      const st = buildStaff(t);
      expect(Object.keys(st).sort()).toEqual([...COACH_ROLES].sort());
      expect(JSON.parse(JSON.stringify(st))).toEqual(st);
      for (const c of Object.values(st)) {
        for (const v of Object.values(c.r)) expect(v).toBeGreaterThanOrEqual(30);
        expect(c.age).toBeGreaterThanOrEqual(32);
      }
      for (const g of GROUPS) expect(st[g].r.teach).toBeDefined();
      expect(st.OC.r.teach).toBeUndefined();
    }
  });

  it('better programs have better staffs, and every DC keeps the style the program had', () => {
    const mean = (tier: number) => {
      const ts = TEAMS.filter((t) => t.profile.tier === tier);
      return ts.reduce((s, t) => s + Object.values(buildStaff(t)).reduce((a, c) => a + c.r.scout, 0) / COACH_ROLES.length, 0) / ts.length;
    };
    expect(mean(1)).toBeGreaterThan(mean(3) + 5);
    expect(mean(3)).toBeGreaterThan(mean(5));
    for (const t of TEAMS) expect(buildStaff(t).DC.style).toBe(defStyle(t.id));
  });
});

describe('scouting by staff quality', () => {
  const season = () => {
    const s = newSeason(defaultConfig('georgia'), 3);
    advanceWeek(s);
    return s;
  };

  it('a weak staff sees only basic film and counts what it missed; an elite one sees everything', () => {
    const s = season();
    const g = userGameThisWeek(s) ?? s.games.find((x) => x.home === 'georgia' || x.away === 'georgia')!;
    const weak = scoutReport(s, g, new Set(), staffAt('georgia', 40));
    const elite = scoutReport(s, g, new Set(), staffAt('georgia', 95));
    for (const sec of weak.sections) for (const it of sec.items) expect(it.tier).toBe(1);
    expect(weak.sections.reduce((n, x) => n + (x.hidden ?? 0), 0)).toBeGreaterThan(3);
    expect(elite.sections.every((x) => !x.hidden)).toBe(true);
    const count = (r: typeof weak) => r.sections.reduce((n, x) => n + x.items.length + (x.hidden ?? 0), 0);
    expect(count(weak)).toBe(count(elite));
    // Without the reads, there are no emphasis ideas, and the picks can't cite them.
    expect(Object.keys(weak.emphasis)).toHaveLength(0);
    expect(Object.keys(elite.emphasis).sort()).toEqual([...GROUPS].sort());
    for (const sg of weak.suggestions) expect(sg.why).not.toMatch(/PRESS|SPEED EDGE|WINS HIS ROUTES|BEHIND OUR|CUSHIONS/);
    for (const [g, sg] of Object.entries(elite.emphasis)) expect(emphasisById(sg!.id)!.group).toBe(g);
  });

  it('tendencies get vaguer with a weaker scout', () => {
    expect(pctAt(0.237, 80)).toBe('24%');
    expect(pctAt(0.237, 60)).toBe('~20%');
    expect(pctAt(0.237, 40)).toBe('SOMETIMES');
    expect(pctAt(0.05, 40)).toBe('RARELY');
    expect(SCOUT_TIERS[1]).toBe(0);
  });

  it('a staff from the season matches the generated one', () => {
    const s = season();
    expect(staffFor(s, 'georgia')).toBe(buildStaff(teamById('georgia')));
  });
});

describe('weekly emphases', () => {
  it('every emphasis practices ratings its positions can grow, and every group has standard plus choices', () => {
    for (const e of EMPHASES) {
      expect(e.blurb.length).toBeLessThanOrEqual(30);
      expect(e.game.length).toBeLessThanOrEqual(24);
      expect(e.ratings.some((k) => GROUP_POS[e.group].some((p) => OVR_WEIGHTS[p][k]))).toBe(true);
    }
    for (const g of GROUPS) {
      expect(groupEmphases(g)[0]).toBe(STANDARD);
      expect(groupEmphases(g).length).toBeGreaterThanOrEqual(3);
    }
    for (const p of POSITIONS) expect(GROUP_POS[groupOf(p)]).toContain(p);
  });

  it('standard changes nothing: no mods, and the drive plays exactly as before', () => {
    const st = buildStaff(teamById('georgia'));
    expect(emphasisMods(st, undefined)).toBeUndefined();
    expect(emphasisMods(st, { DL: STANDARD, QB: STANDARD })).toBeUndefined();
    expect(driveMods(undefined, undefined, 0.5)).toBeUndefined();
    for (let seed = 0; seed < 40; seed++) {
      const a = simulateDrive(82, 78, 25, mulberry32(seed), CLOCK);
      const b = simulateDrive(82, 78, 25, mulberry32(seed), CLOCK, undefined, undefined, driveMods(undefined, emphasisMods(st, {}), 0.5));
      expect(b).toEqual(a);
    }
  });

  it('pass rush helps only on passing downs, and more against a passing team', () => {
    const def = emphasisMods(staffAt('georgia', 70), { DL: 'dl-rush' })!;
    const air = driveMods(undefined, def, 0.62)!;
    const option = driveMods(undefined, def, 0.3)!;
    expect(snapEdge(air, 1, 10, 30)).toBe(0);
    expect(snapEdge(air, 2, 4, 30)).toBe(0);
    expect(snapEdge(air, 3, 8, 30)).toBeLessThan(0);
    expect(snapEdge(air, 3, 8, 30)).toBeLessThan(snapEdge(option, 3, 8, 30));
    expect(passOdds(0.5, 3, 8)).toBeGreaterThan(passOdds(0.5, 1, 10));
    expect(passOdds(0.5, 3, 1)).toBeLessThan(passOdds(0.5, 1, 10));
    // A better game-day coach makes it count more.
    const better = driveMods(undefined, emphasisMods(staffAt('georgia', 90), { DL: 'dl-rush' }), 0.62)!;
    expect(snapEdge(better, 3, 8, 30)).toBeLessThan(snapEdge(air, 3, 8, 30));
  });

  it('a group counts by its share of the unit: the DL moves more than the TE', () => {
    const st = staffAt('georgia', 70);
    const dl = driveMods(undefined, emphasisMods(st, { DL: 'dl-run' }), 0.5)!;
    const te = driveMods(emphasisMods(st, { TE: 'te-blocking' }), undefined, 0.5)!;
    expect(-snapEdge(dl, 1, 10, 30)).toBeGreaterThan(2 * snapEdge(te, 1, 10, 30));
    expect(snapEdge(te, 1, 10, 30)).toBeGreaterThan(0);
  });

  it('tackling cuts big plays allowed, and the deep ball adds them', () => {
    const st = staffAt('georgia', 70);
    const tackle = driveMods(undefined, emphasisMods(st, { DB: 'db-tackling' }), 0.5)!;
    const deep = driveMods(emphasisMods(st, { QB: 'qb-deep' }), undefined, 0.5)!;
    expect(explosiveFactor(tackle, 1, 10, 30)).toBeLessThan(1);
    expect(explosiveFactor(deep, 2, 9, 30)).toBeGreaterThan(explosiveFactor(deep, 3, 1, 30));
    let free = 0;
    let held = 0;
    for (let seed = 0; seed < 3000; seed++) {
      const count = (mods?: ReturnType<typeof driveMods>) => {
        let n = 0;
        simulateDrive(80, 80, 25, mulberry32(seed), CLOCK, (p: SimPlay) => { if (p.explosive) n++; }, undefined, mods);
        return n;
      };
      free += count();
      held += count(tackle);
    }
    expect(held).toBeLessThan(free * 0.95);
  });

  it('an emphasized team still grades about 0: the edge is expected', () => {
    const home = freshSquad(teamById('georgia'));
    const away = freshSquad(teamById('ohiostate'));
    const picks: Picks = { QB: 'qb-accuracy', OL: 'ol-pass', WR: 'wr-routes', DL: 'dl-run', LB: 'lb-fits', DB: 'db-press', ST: 'st-accuracy' };
    const mods = emphasisMods(staffAt('georgia', 95), picks)!;
    const rng = mulberry32(8);
    let sum = 0;
    let snaps = 0;
    let em = 0;
    for (let i = 0; i < 150; i++) {
      const drives: DriveLog[] = [];
      simGame(home, away, rng, { drives, emph: { home: mods } });
      em += drives.flatMap((d) => d.plays).filter((p) => p.em).length;
      for (const g of gradeGame(home, away, drives, {}, rng, 1.5).values()) {
        if (g.team !== 'georgia' || g.share < 0.8) continue;
        sum += g.sum;
        snaps += g.snaps;
      }
    }
    expect(em).toBeGreaterThan(1000);
    expect(Math.abs(sum / snaps)).toBeLessThan(0.01);
  });

  it('practice steers level-ups toward the emphasis, and a better teacher steers harder', () => {
    const team = teamById('georgia');
    const squad = freshSquad(team);
    // Linemen with room to grow, so every rating can still take points.
    const dl = squad.athletes.filter((a) => (a.pos === 'DE' || a.pos === 'DT') && a.potential - overallRaw(a.r, a.pos) >= 6);
    expect(dl.length).toBeGreaterThanOrEqual(4);
    const share = (staff?: Staff) => {
      let rsh = 0;
      let all = 0;
      for (let rep = 0; rep < 60; rep++) {
        const ts: TeamState = {};
        const grades = new Map(dl.map((a) => [a.id, { team: team.id, snaps: 60, share: 1, sum: 0, tags: {}, hits: 0, lsum: 0, lw: 0 }]));
        for (let w = 1; w <= 6; w++) progressTeam(ts, squad, grades, w, mulberry32(rep * 100 + w), staff ? { staff, picks: { DL: 'dl-rush' } } : undefined);
        for (const p of Object.values(ts.progress ?? {})) {
          for (const [k, v] of Object.entries(p.d)) {
            all += v ?? 0;
            if (k === 'rsh') rsh += v ?? 0;
          }
        }
      }
      return rsh / all;
    };
    const base = share();
    const mid = share(staffAt('georgia', 50));
    const top = share(staffAt('georgia', 95));
    expect(mid).toBeGreaterThan(base * 1.3);
    expect(top).toBeGreaterThan(mid);
  });
});

describe('emphases in the season', () => {
  /** A season for Georgia at a week with a game. */
  function ready(): SeasonState {
    const s = newSeason(defaultConfig('georgia'), 5);
    while (!userGameThisWeek(s)) advanceWeek(s);
    return s;
  }

  it("don't reach the user's game, played through the engine, and reset to standard", () => {
    const plain = ready();
    const picked = ready();
    picked.teamState.georgia = { ...picked.teamState.georgia, emph: { DL: 'dl-rush', DB: 'db-tackling', QB: 'qb-accuracy' } };
    const g = userGameThisWeek(picked)!;
    advanceWeek(plain);
    advanceWeek(picked);
    expect(picked.teamState.georgia?.emph).toBeUndefined();
    const res = (s: SeasonState) => s.games.find((x) => x.id === g.id)!.result!;
    // The game-day edge is the drive sim's: the user's game is the engine's (ENGINEDRIVES.md phase 4).
    expect(res(picked)).toEqual(res(plain));
    // Other games are untouched.
    const other = plain.games.find((x) => x.week === g.week && x.id !== g.id && x.result)!;
    expect(picked.games.find((x) => x.id === other.id)!.result).toEqual(other.result);
  });

  it('a week with picks survives a save mid-week and plays the same', () => {
    const s = ready();
    s.teamState.georgia = { ...s.teamState.georgia, emph: { OL: 'ol-run', LB: 'lb-fits' } };
    const copy = JSON.parse(JSON.stringify(s)) as SeasonState;
    advanceWeek(s);
    advanceWeek(copy);
    expect(copy.games).toEqual(s.games);
    expect(copy.teamState.georgia?.progress).toEqual(s.teamState.georgia?.progress);
    expect(squadFor(copy, 'georgia').athletes.length).toBe(85);
  });
});
