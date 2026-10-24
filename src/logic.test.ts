import { describe, expect, it } from 'vitest';
import { project, unproject } from './engine/camera';
import { mulberry32 } from './engine/math';
import {
  advanceSim, afterPlay, clockText, newClock, penaltySpot, playClockText, readyForPlay, tickBetween, tickLive, type Clock,
} from './game/clock';
import { handoffKind } from './game/playState';
import { applyOutcome, downDistance, fieldLabel, simulateDrive, startDrive, type PlayOutcome } from './game/rules';
import { flightPos, passParams } from './sim/ball';
import { catchOdds } from './sim/catching';
import { tackleChance } from './sim/tackling';

const out = (type: PlayOutcome['type'], spot: number): PlayOutcome => ({ type, spot, spotY: 26, text: '', sub: '', color: '' });

describe('camera', () => {
  it('round-trips world <-> screen', () => {
    const s = project(30, 47.5, 12.25);
    const w = unproject(30, s.x, s.y);
    expect(w.x).toBeCloseTo(47.5);
    expect(w.y).toBeCloseTo(12.25);
  });
  it('lifts airborne objects up the screen', () => {
    expect(project(0, 10, 10, 3).y).toBeLessThan(project(0, 10, 10, 0).y);
  });
});

describe('ball flight', () => {
  it('starts and ends on the endpoints, peaking in the middle', () => {
    const from = { x: 30, y: 20, z: 2 };
    const to = { x: 60, y: 30, z: 1.2 };
    expect(flightPos(from, to, 5, 0)).toEqual(from);
    const end = flightPos(from, to, 5, 1);
    expect(end.x).toBeCloseTo(60);
    expect(end.z).toBeCloseTo(1.2);
    expect(flightPos(from, to, 5, 0.5).z).toBeCloseTo(1.6 + 5);
  });
  it('longer throws hang longer and higher; stronger arms are faster', () => {
    const short = passParams(10, 85);
    const deep = passParams(45, 85);
    expect(deep.dur).toBeGreaterThan(short.dur);
    expect(deep.peak).toBeGreaterThan(short.peak);
    expect(passParams(40, 95).dur).toBeLessThan(passParams(40, 70).dur);
  });
});

describe('catching', () => {
  it('wide-open receiver under the ball almost always catches it', () => {
    expect(catchOdds({ pos: 1, cth: 90 }, null).catch).toBeGreaterThan(0.9);
  });
  it('nobody near the ball means no catch and no pick', () => {
    expect(catchOdds(null, null)).toEqual({ catch: 0, int: 0 });
  });
  it('a lone defender under the ball has a real interception chance', () => {
    const o = catchOdds(null, { pos: 1, cth: 70, awr: 85 });
    expect(o.catch).toBe(0);
    expect(o.int).toBeGreaterThan(0.3);
  });
  it('contested balls are roughly coin flips, worse than open ones', () => {
    const open = catchOdds({ pos: 1, cth: 85 }, null).catch;
    const contested = catchOdds({ pos: 1, cth: 85 }, { pos: 1, cth: 65, awr: 80 }).catch;
    expect(contested).toBeLessThan(open);
    expect(contested).toBeGreaterThan(0.35);
    expect(contested).toBeLessThan(0.7);
  });
});

describe('tackling', () => {
  it('jukes and elusive backs cause misses', () => {
    expect(tackleChance(80, 80, 70, true)).toBeLessThan(tackleChance(80, 80, 70, false));
    expect(tackleChance(80, 95, 70, false)).toBeLessThan(tackleChance(80, 60, 70, false));
  });
});

describe('rules', () => {
  it('moves the chains on a first down', () => {
    const d = startDrive(25); // los = 35
    const a = applyOutcome(d, out('tackle', 47));
    expect(a.drive.down).toBe(1);
    expect(a.drive.firstDownX).toBe(57);
    expect(a.headline).toBe('FIRST DOWN');
  });
  it('advances the down when short', () => {
    const a = applyOutcome(startDrive(25), out('tackle', 39));
    expect(a.drive.down).toBe(2);
    expect(downDistance(a.drive)).toBe('2ND & 6');
  });
  it('incomplete keeps the spot', () => {
    const a = applyOutcome(startDrive(25), out('incomplete', 35));
    expect(a.drive.los).toBe(35);
    expect(a.drive.down).toBe(2);
  });
  it('turnover on downs after 4th down fails', () => {
    const d = { ...startDrive(25), down: 4 };
    const a = applyOutcome(d, out('incomplete', 35));
    expect(a.change.kind).toBe('downs');
  });
  it('touchdown scores 7', () => {
    const a = applyOutcome(startDrive(25), out('td', 110));
    expect(a.userPoints).toBe(7);
    expect(a.change.kind).toBe('score');
  });
  it('goal to go inside the 10', () => {
    expect(downDistance(startDrive(95))).toBe('1ST & GOAL');
  });
  it('labels field position from the user perspective', () => {
    expect(fieldLabel(35)).toBe('OWN 25');
    expect(fieldLabel(60)).toBe('MIDFIELD');
    expect(fieldLabel(84)).toBe('OPP 26');
  });
  it('CPU drives end with a sensible result', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const s = simulateDrive(90, 85, 25, rng);
      expect([0, 3, 7]).toContain(s.points);
      expect(s.plays).toBeGreaterThan(0);
    }
  });
});

describe('clock', () => {
  const at = (quarter: number, time: number, qMin = 15): Clock => ({ ...newClock(qMin), quarter, time });

  it('incompletions stop the clock until the snap', () => {
    const c = at(1, 600);
    afterPlay(c, 'incomplete', false);
    expect(c.mode).toBe('untilSnap');
    expect(c.play).toBe(40);
  });
  it('first downs only stop the clock inside two minutes of a half', () => {
    const early = at(2, 300);
    afterPlay(early, 'tackle', true);
    expect(early.mode).toBe('run');
    const late = at(2, 90);
    afterPlay(late, 'tackle', true);
    expect(late.mode).toBe('untilReady');
    readyForPlay(late);
    expect(late.mode).toBe('run');
  });
  it('out of bounds restarts on the ready, except late in a half', () => {
    const q1 = at(1, 100);
    afterPlay(q1, 'oob', false);
    expect(q1.mode).toBe('untilReady');
    const q4 = at(4, 60);
    afterPlay(q4, 'oob', false);
    expect(q4.mode).toBe('untilSnap');
  });
  it('between plays runs faster with shorter quarters; live plays run 1:1', () => {
    const c: Clock = { ...at(1, 600, 5), mode: 'run', play: 40 };
    tickBetween(c, 1);
    expect(c.play).toBeCloseTo(37);
    expect(c.time).toBeCloseTo(597);
    c.mode = 'untilSnap';
    tickBetween(c, 1);
    expect(c.time).toBeCloseTo(597);
    tickLive(c, 2);
    expect(c.time).toBeCloseTo(595);
  });
  it('simulated time rolls into the next quarter and stops at halftime', () => {
    const c = at(1, 60);
    expect(advanceSim(c, 90).halfOver).toBe(false);
    expect(c.quarter).toBe(2);
    expect(c.time).toBeCloseTo(870);
    const h = at(2, 30);
    expect(advanceSim(h, 60).halfOver).toBe(true);
    expect(h.time).toBe(0);
    expect(at(4, 10).quarter).toBe(4);
    expect(advanceSim(at(4, 10), 20).halfOver).toBe(true);
  });
  it('formats the clock', () => {
    expect(clockText(at(2, 462))).toBe('2ND 7:42');
    expect(playClockText({ ...at(1, 900), play: 9.2 })).toBe(':10');
  });
  it('delay of game is 5 yards, or half the distance near the goal', () => {
    expect(penaltySpot(35, 10)).toBe(30);
    expect(penaltySpot(16, 10)).toBe(13);
  });
  it('CPU drives never run past the half', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const s = simulateDrive(85, 85, 25, rng, { timeLeft: 75, hurry: false, milk: false });
      expect(s.secs).toBeLessThanOrEqual(75);
      if (s.result === 'END OF HALF') expect(s.points).toBe(0);
    }
  });
});

describe('handoffs', () => {
  const qb = { x: 30, y: 26 };
  it('hands off close, pitches wider', () => {
    expect(handoffKind(qb, { x: 30.5, y: 27 }, 35)).toBe('handoff');
    expect(handoffKind(qb, { x: 29, y: 31 }, 35)).toBe('pitch');
  });
  it('shovels to a back releasing ahead of the QB, but nothing once he reaches the line', () => {
    expect(handoffKind(qb, { x: 33, y: 30 }, 35)).toBe('pitch');
    expect(handoffKind(qb, { x: 34.5, y: 29 }, 35)).toBeNull();
    expect(handoffKind(qb, { x: 34.9, y: 26 }, 35)).toBeNull();
    expect(handoffKind(qb, { x: 20, y: 26 }, 35)).toBeNull();
  });
  it('a fumble recovered by the offense is spotted like a tackle', () => {
    const a = applyOutcome(startDrive(25), out('fumble', 33));
    expect(a.drive.los).toBe(33);
    expect(a.drive.down).toBe(2);
  });
});
