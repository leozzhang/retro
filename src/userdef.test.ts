import { describe, expect, it } from 'vitest';
import { buildStaff, dcAdjust } from './data/coaches';
import { buildSquad, onField } from './data/depth';
import { defIdentity } from './data/identity';
import { ocBook, ocStyle } from './data/offStyles';
import { teamById, type Team } from './data/teams';
import { mulberry32 } from './engine/math';
import { newBrain } from './game/defBrain';
import { driveSteps, engineDrive, runDrive, SnapRun, type EngineDrive, type EngineSide } from './game/engineDrive';
import { STEP } from './engine/constants';
import { rosterRead } from './game/offModel';
import type { DriveClock } from './game/rules';
import { bigSnap } from './game/situation';
import { botDrive, DefBot, type BotPolicy } from './game/userDefBot';
import { catchOdds } from './sim/catching';

/** PLAY DEFENSE (docs/USERDEF.md): the user on a defender, played through the same engine. */

function side(t: Team): EngineSide {
  const staff = buildStaff(t);
  return { team: t, roster: onField(buildSquad(t)), oc: { book: ocBook(staff.OC), style: ocStyle(staff.OC), passShare: 0.5 }, ident: defIdentity(t, staff.DC) };
}

const clock: DriveClock = { timeLeft: 1800, hurry: false, milk: false, lead: 0, finalHalf: false, qSecs: 900, timeouts: { off: 3, def: 3 } };
const off = side(teamById('georgia'));
const def = side(teamById('alabama'));
const brain = () => {
  const dc = buildStaff(def.team).DC;
  return newBrain({ iq: 'NORMAL', adjust: dcAdjust(dc), scout: dc.r.scout, qbMobility: 0, seed: 5, book: off.oc.book, style: off.oc.style, roster: rosterRead(off.roster) });
};
const sum = (d: EngineDrive) => JSON.stringify({ ...d, snaps: d.snaps.map((s) => [s.play.id, s.call.id, s.gain, s.type, s.target, s.tackler, s.takeaway, s.secs, s.tape?.frames.length]) });
const opts = () => ({ brain: brain(), record: true });
const drive = (seed: number, slot: string, policy: BotPolicy, latency = 0.25) =>
  botDrive(off, def, 25, mulberry32(seed), clock, opts(), slot, () => new DefBot(policy, latency));

describe('PLAY DEFENSE', () => {
  it('the drive as steps is engineDrive, draw for draw', () => {
    for (const seed of [1, 2, 3, 4]) {
      expect(sum(runDrive(driveSteps(off, def, 25, mulberry32(seed), clock, opts())))).toBe(sum(engineDrive(off, def, 25, mulberry32(seed), clock, opts())));
    }
  });

  it('a user on a defender with the stick idle is the AI: the same drive, tape and all', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const slot of ['CB1', 'FS', 'MLB']) expect(sum(drive(seed, slot, 'assign'))).toBe(sum(engineDrive(off, def, 25, mulberry32(seed), clock, opts())));
    }
  });

  it('steering him changes the snaps', () => {
    let differs = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) if (sum(drive(seed, 'FS', 'shadow')) !== sum(engineDrive(off, def, 25, mulberry32(seed), clock, opts()))) differs++;
    expect(differs).toBeGreaterThan(3);
  });

  it("his picks and tackles are credited to him, as the AI's are", () => {
    let picks = 0;
    let tackles = 0;
    for (let seed = 1; seed <= 300 && !picks; seed++) {
      for (const s of drive(seed, 'FS', 'hawk', 0.15).snaps) {
        if (s.takeaway === 'FS' && (s.type === 'int' || s.type === 'pick6')) picks++;
        if (s.tackler === 'FS') tackles++;
      }
    }
    expect(picks).toBeGreaterThan(0);
    expect(tackles).toBeGreaterThan(0);
  });

  it('stepped in slow motion (a frame at 0.55-0.75 of a step), a snap still plays to its end and the drive adds up', () => {
    for (const seed of [1, 2, 3]) {
      const g = driveSteps(off, def, 25, mulberry32(seed), clock, opts());
      let s = g.next();
      let i = 0;
      while (!s.done) {
        const q = s.value;
        const run = new SnapRun(q.off, q.def, q.drive, q.sit, q.rng, q.brain, q.opts);
        run.play.defControlled = run.play.def.find((p) => p.slot === 'FS') ?? null;
        const bot = new DefBot('hawk', 0.2);
        run.snap();
        while (!run.done()) run.step(bot.step(run.play), STEP * (i++ % 2 ? 0.55 : 0.75));
        expect(run.play.phase).toBe('over');
        s = g.next({ r: run.result() });
      }
      const d = s.value;
      expect(d.snaps.length).toBeGreaterThan(0);
      expect(d.plays).toBeGreaterThanOrEqual(d.snaps.length);
    }
  });

  it('a timed ball call only shifts the contest by its multipliers; none is the AI contest', () => {
    const o = { pos: 0.8, cth: 80 };
    const dd = { pos: 0.7, cth: 70, prc: 70 };
    expect(catchOdds(o, [{ ...dd }])).toEqual(catchOdds(o, [{ ...dd, skillMul: 1, intMul: 1 }]));
    const play = catchOdds(o, [{ ...dd, skillMul: 1, intMul: 2.2 }]);
    const swat = catchOdds(o, [{ ...dd, skillMul: 1.35, intMul: 0.35 }]);
    const ai = catchOdds(o, [dd]);
    expect(play.int).toBeGreaterThan(ai.int);
    expect(swat.catch).toBeLessThan(ai.catch);
    expect(swat.int).toBeLessThan(ai.int);
  });

  it('BIG PLAYS: 3rd and 4th down, the red zone, late, and the first snap of a half', () => {
    const s = { down: 1, toGo: 10, yardsToGoal: 70, secsLeft: 600, qSecs: 900, finalHalf: false, lead: 0 };
    expect(bigSnap(s, 0, false)).toBe(false);
    expect(bigSnap(s, 0, true)).toBe(true);
    expect(bigSnap({ ...s, down: 3 }, 0, false)).toBe(true);
    expect(bigSnap({ ...s, yardsToGoal: 8 }, 0, false)).toBe(true);
    expect(bigSnap({ ...s, secsLeft: 20 }, 0, false)).toBe(true);
    expect(bigSnap(s, 0.6, false)).toBe(true);
  });
});
