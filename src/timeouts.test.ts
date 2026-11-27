import { describe, expect, it } from 'vitest';
import { buildStaff } from './data/coaches';
import { buildSquad } from './data/depth';
import { teamById } from './data/teams';
import { mulberry32, type Rng } from './engine/math';
import { simulateDrive, type DriveClock, type SimPlay } from './game/rules';
import { kneelBurn, possessionsAfter, tempo, type Situation } from './game/situation';
import { adminOdds, defenseTimeout, halfClock, offenseTimeout, timeoutAt, TIMEOUTS } from './game/timeouts';
import { enginePart } from './season/engineGame';
import { simGame, simPart } from './season/simGame';
import { playRows } from './render/gameScreen';
import type { GamePlay, SeasonGame } from './season/types';
import { autoGamePlan } from './season/staff';

const sit = (o: Partial<Situation>): Situation => ({
  down: 1, toGo: 10, yardsToGoal: 60, secsLeft: 900, qSecs: 900, finalHalf: true, lead: 0, offTO: 3, defTO: 3, ...o,
});

/** Counts its draws. */
function counted(seed: number): Rng & { n: number } {
  const r = mulberry32(seed);
  const f = (() => {
    f.n++;
    return r();
  }) as Rng & { n: number };
  f.n = 0;
  return f;
}

describe('timeouts: the decisions', () => {
  it('a trailing defense saves the clock late in the final half, and only then', () => {
    expect(defenseTimeout(sit({ lead: 4, secsLeft: 200 }))).toBe(true);
    expect(defenseTimeout(sit({ lead: 12, secsLeft: 200 }))).toBe(true);
    // Too far behind, ahead, too early, none left, overtime.
    expect(defenseTimeout(sit({ lead: 17, secsLeft: 200 }))).toBe(false);
    expect(defenseTimeout(sit({ lead: -3, secsLeft: 200 }))).toBe(false);
    expect(defenseTimeout(sit({ lead: 4, secsLeft: 600 }))).toBe(false);
    expect(defenseTimeout(sit({ lead: 4, secsLeft: 200, defTO: 0 }))).toBe(false);
    expect(defenseTimeout(sit({ lead: 4, secsLeft: 200, ot: 'first' }))).toBe(false);
    // The kneel ends it anyway: don't bother.
    expect(defenseTimeout(sit({ lead: 4, secsLeft: 6, down: 3 }))).toBe(false);
    // Short quarters shrink the window.
    expect(defenseTimeout(sit({ lead: 4, secsLeft: 200, qSecs: 240 }))).toBe(false);
  });

  it('a defense gets the ball back before the half from an offense backed up and running it out', () => {
    expect(defenseTimeout(sit({ finalHalf: false, secsLeft: 80, yardsToGoal: 75, lead: 3 }))).toBe(true);
    expect(defenseTimeout(sit({ finalHalf: false, secsLeft: 80, yardsToGoal: 40, lead: 3 }))).toBe(false);
    expect(defenseTimeout(sit({ finalHalf: false, secsLeft: 400, yardsToGoal: 75, lead: 3 }))).toBe(false);
  });

  it('the two-minute drill: a timeout on 3rd and 4th down and inside 0:40, a spike before that', () => {
    expect(offenseTimeout(sit({ lead: -4, secsLeft: 100, down: 3, toGo: 4 }))).toBe(true);
    expect(offenseTimeout(sit({ lead: -4, secsLeft: 100, down: 2, toGo: 4 }))).toBe(false);
    expect(offenseTimeout(sit({ lead: -4, secsLeft: 35, down: 2, toGo: 4 }))).toBe(true);
    expect(offenseTimeout(sit({ lead: -4, secsLeft: 35, down: 2, offTO: 0 }))).toBe(false);
    // Ahead or milking: never.
    expect(offenseTimeout(sit({ lead: 4, secsLeft: 100, down: 3 }))).toBe(false);
    // The end of the 1st half in range.
    expect(offenseTimeout(sit({ finalHalf: false, secsLeft: 50, yardsToGoal: 40 }))).toBe(true);
    expect(offenseTimeout(sit({ finalHalf: false, secsLeft: 50, yardsToGoal: 70 }))).toBe(false);
  });

  it("the defense's timeouts push the kneel back; held timeouts count as time", () => {
    expect(kneelBurn(1, 0)).toBe(3 * 40 + 5);
    expect(kneelBurn(1, 3)).toBeLessThan(kneelBurn(1, 1));
    expect(tempo(sit({ lead: 4, secsLeft: 100, defTO: 0 }))).toBe('kneel');
    expect(tempo(sit({ lead: 4, secsLeft: 100, defTO: 3 }))).toBe('milk');
    expect(tempo({ ...sit({ lead: 4, secsLeft: 100 }), defTO: undefined })).toBe('kneel');
    expect(possessionsAfter(sit({ secsLeft: 100, offTO: 3 }))).toBeGreaterThan(possessionsAfter(sit({ secsLeft: 100, offTO: 0 })));
  });

  it('timeouts not about the clock: rare, bigger on 3rd and short, never late or with the last one', () => {
    const o = adminOdds(sit({ down: 3, toGo: 2, secsLeft: 1500 }));
    expect(o.off).toBe(TIMEOUTS.admin.offBig);
    expect(adminOdds(sit({ down: 1, secsLeft: 1500 })).off).toBeLessThan(o.off);
    expect(adminOdds(sit({ down: 3, toGo: 2, secsLeft: 200 })).off).toBe(0);
    expect(adminOdds(sit({ down: 3, toGo: 2, secsLeft: 1500, offTO: 1 })).off).toBe(0);
    expect(adminOdds(sit({ down: 3, toGo: 2, secsLeft: 1500, ot: 'first' }))).toEqual({ off: 0, def: 0 });
    // Nothing to draw: no draw.
    const r = counted(1);
    expect(timeoutAt(sit({ secsLeft: 100, offTO: 1, defTO: 1 }), false, r)).toBeNull();
    expect(r.n).toBe(0);
  });

  // A timeout comes after its snap's whistle, so one at a play's clock follows it.
  it('the game page lays timeouts in among the key plays, by quarter and clock', () => {
    const play = (q: number, time: number): GamePlay => ({ q, time, off: 'georgia', kind: 'td', yds: 10, yard: 90, down: 1, toGo: 10, pts: 7, score: [7, 0] });
    const game = {
      id: 'g', week: 1, home: 'georgia', away: 'alabama',
      result: { home: 7, away: 0, ot: 0, box: { home: {}, away: {}, players: [] }, plays: [play(1, 600), play(4, 300), play(4, 30)], tos: [[4, 100, 1], [2, 20, 0], [4, 300, 0]] },
    } as unknown as SeasonGame;
    const rows = playRows(game).map((r) => ('side' in r ? `T${r.q}:${r.time}` : `P${r.q}:${r.time}`));
    expect(rows).toEqual(['P1:600', 'T2:20', 'P4:300', 'T4:300', 'T4:100', 'P4:30']);
  });

  it('the clock in the record', () => {
    expect(halfClock(0, 1200, 900)).toEqual([1, 300]);
    expect(halfClock(1, 72.4, 900)).toEqual([4, 72]);
  });
});

describe('timeouts: the drive sim', () => {
  const base: DriveClock = { timeLeft: 240, hurry: false, milk: false, lead: -4, finalHalf: true, qSecs: 900 };

  it('without timeouts a drive plays exactly as before', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = counted(seed);
      const b = counted(seed);
      const da = simulateDrive(80, 80, 25, a, base);
      const db = simulateDrive(80, 80, 25, b, { ...base });
      expect(db).toEqual(da);
      expect(da.timeouts).toBeUndefined();
      expect(b.n).toBe(a.n);
    }
  });

  it('counts never go below zero, and every flagged snap is in the list', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const plays: SimPlay[] = [];
      const lead = (seed % 5) * 4 - 8;
      const d = simulateDrive(80, 80, 25, mulberry32(seed), { ...base, lead, timeLeft: 60 + (seed % 10) * 30, timeouts: { off: 3, def: 3 } }, (p) => plays.push(p));
      expect(d.timeouts!.off).toBeGreaterThanOrEqual(0);
      expect(d.timeouts!.def).toBeGreaterThanOrEqual(0);
      const flagged = plays.filter((p) => p.timeout);
      expect(flagged.length).toBe(d.tos!.length);
      expect(6 - d.timeouts!.off - d.timeouts!.def).toBe(d.tos!.length);
    }
  });

  it("a trailing defense's timeouts leave it more time after the leader's drive", () => {
    let withTo = 0;
    let without = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const c: DriveClock = { ...base, lead: 4, timeLeft: 200 };
      const a = simulateDrive(80, 80, 25, mulberry32(seed), { ...c, timeouts: { off: 3, def: 3 } });
      const b = simulateDrive(80, 80, 25, mulberry32(seed), { ...c, timeouts: { off: 3, def: 0 } });
      withTo += c.timeLeft - a.secs;
      without += c.timeLeft - b.secs;
    }
    expect(withTo / n).toBeGreaterThan(without / n + 20);
  });
});

describe('timeouts: whole games and the hand-off', () => {
  const team = (id: string) => {
    const t = teamById(id);
    const st = buildStaff(t);
    return { squad: buildSquad(t), oc: st.OC, dc: st.DC, passShare: 0.5 };
  };

  it('a simulated game keeps a record, at most three a team a half', () => {
    let any = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = simGame(buildSquad(teamById('georgia')), buildSquad(teamById('alabama')), mulberry32(seed));
      const tos = r.tos ?? [];
      any += tos.length;
      for (const side of [0, 1]) {
        for (const half of [[1, 2], [3, 4]]) expect(tos.filter((t) => t[2] === side && half.includes(t[0])).length).toBeLessThanOrEqual(3);
      }
      for (const [q, secs] of tos) {
        expect(q).toBeGreaterThanOrEqual(1);
        expect(q).toBeLessThanOrEqual(4);
        expect(secs).toBeGreaterThanOrEqual(0);
        expect(secs).toBeLessThanOrEqual(900);
      }
    }
    expect(any).toBeGreaterThan(0);
  });

  it('simming to the 4th hands over what the 2nd half has left; halftime hands over three each', { timeout: 120000 }, () => {
    let used = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r4 = enginePart(team('texas'), team('oklahoma'), true, 4, 4, mulberry32(seed));
      for (const n of [r4.timeouts.user, r4.timeouts.cpu]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(3);
      }
      used += 6 - r4.timeouts.user - r4.timeouts.cpu;
      // What the record says the 3rd quarter used is what's gone.
      expect(r4.tos.filter((t) => t[0] === 3).length).toBe(6 - r4.timeouts.user - r4.timeouts.cpu);
    }
    for (let seed = 1; seed <= 3; seed++) {
      const r3 = enginePart(team('texas'), team('oklahoma'), true, 4, 3, mulberry32(seed));
      expect(r3.next.kind).toBe('halftime');
    }
    expect(used).toBeGreaterThanOrEqual(0);
  });

  it('simmed to the 4th on 8:00 quarters, some hand-offs have fewer than three left', () => {
    const uga = buildSquad(teamById('georgia'));
    const bama = buildSquad(teamById('alabama'));
    const plans = { user: autoGamePlan(uga, bama), cpu: autoGamePlan(bama, uga) };
    let short = 0;
    const n = 200;
    for (let seed = 1; seed <= n; seed++) {
      const r = simPart(uga, bama, true, 8, 4, mulberry32(seed), { plans });
      if (r.timeouts.user < 3 || r.timeouts.cpu < 3) short++;
      expect(r.tos.filter((t) => t[0] === 3).length).toBe(6 - r.timeouts.user - r.timeouts.cpu);
    }
    expect(short / n).toBeGreaterThan(0.1);
    expect(short / n).toBeLessThan(0.8);
  });
});
