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
import { botDrive, BotInput, DefBot, type BotPolicy } from './game/userDefBot';
import { isEligible } from './sim/player';
import { THROWS } from './sim/ball';
import { CATCH_REACH } from './sim/catching';
import type { Play } from './game/playState';
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

/** The first snap of drive `seed` as a `SnapRun`, the user on `slot`, snapped. */
function firstSnap(seed: number, slot: string): SnapRun {
  const q = driveSteps(off, def, 25, mulberry32(seed), clock, opts()).next().value as Exclude<ReturnType<ReturnType<typeof driveSteps>['next']>['value'], EngineDrive>;
  const run = new SnapRun(q.off, q.def, q.drive, q.sit, q.rng, q.brain, q.opts);
  run.play.defControlled = run.play.def.find((p) => p.slot === slot) ?? null;
  run.snap();
  return run;
}

const deg = (v: { x: number; y: number }) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

describe('PLAY DEFENSE, pass 3: manual, assisted, the meter and the dive', () => {
  it('once he has taken the stick, an idle stick stands him still', () => {
    let checked = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = firstSnap(seed, 'FS');
      const d = run.play.defControlled!;
      const inp = new BotInput();
      for (let i = 0; i < 90 && !run.done(); i++) {
        inp.reset();
        if (i < 8) inp.ax = { x: 0, y: 1 };
        run.step(inp.asInput());
        if (i === 89 && !d.down && !d.engagedBy.length && run.play.phase !== 'over' && !run.play.defLunge && !run.play.defCommit) {
          expect(Math.hypot(d.vel.x, d.vel.y)).toBeLessThan(0.3);
          checked++;
        }
      }
      expect(run.play.defManual).toBe(true);
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('the assist bends a key that is near a target onto it, and leaves a key well off it alone', () => {
    const run = firstSnap(3, 'FS');
    const play: Play = run.play;
    const d = play.defControlled!;
    const recv = play.off.filter((o) => isEligible(o) && o !== play.qb);
    for (const o of recv) o.pos = { x: 0, y: 0 };
    const o = recv[0];
    const a = (20 * Math.PI) / 180;
    o.pos = { x: d.pos.x + Math.cos(a) * 6, y: d.pos.y + Math.sin(a) * 6 };
    o.vel = { x: 0, y: 0 };
    d.manTarget = null;
    const assist = (play as unknown as { assist: (d: unknown, s: { x: number; y: number }, sp: number) => { dir: { x: number; y: number } } }).assist.bind(play);
    expect(deg(assist(d, { x: 1, y: 0 }, 7).dir)).toBeCloseTo(20, 0);
    expect(deg(assist(d, { x: 0, y: -1 }, 7).dir)).toBeCloseTo(-90, 5);
    expect(deg(assist(d, { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, 7).dir)).toBeCloseTo(-45, 5);
  });

  it('SPACE and E in flight count only on a ball coming to him (the meter)', () => {
    let far = 0;
    let near = 0;
    for (let seed = 1; seed <= 40 && (far < 3 || near < 3); seed++) {
      for (const where of ['far', 'near'] as const) {
        const run = firstSnap(seed, 'CB1');
        const inp = new BotInput();
        while (!run.done() && run.play.phase !== 'air') run.step(inp.asInput());
        const play = run.play;
        if (play.phase !== 'air' || play.pitch || !play.ballTarget || play.ballTimeLeft() < 0.2) break;
        const d = play.defControlled!;
        d.manTarget = null;
        d.engagedBy = [];
        (play as unknown as { defMeter: boolean }).defMeter = false;
        const land = play.ballTarget;
        d.pos = where === 'near' ? { x: land.x, y: land.y } : { x: land.x - 30, y: land.y > 26 ? land.y - 25 : land.y + 25 };
        if (where === 'far') expect(Math.hypot(d.pos.x - land.x, d.pos.y - land.y)).toBeGreaterThan(CATCH_REACH * THROWS[play.thrownKind].reach + 12);
        inp.hits.add('Space');
        run.step(inp.asInput());
        if (where === 'far') {
          expect(play.defBall).toBeNull();
          expect(play.ballMeter()).toBeNull();
          far++;
        } else {
          expect(play.defBall?.kind).toBe('play');
          near++;
        }
      }
    }
    expect(far).toBeGreaterThanOrEqual(3);
    expect(near).toBeGreaterThanOrEqual(3);
  });

  it('a dive in reach all but always gets to him, and tackles at the CPU contact odds', () => {
    let tries = 0;
    let whiffs = 0;
    let contact = 0;
    let tackles = 0;
    let odds = 0;
    for (let seed = 1; seed <= 120 && contact < 150; seed++) {
      for (const slot of ['MLB', 'FS', 'CB1']) {
        const g = driveSteps(off, def, 25, mulberry32(seed), clock, opts());
        let s = g.next();
        while (!s.done) {
          const q = s.value;
          const run = new SnapRun(q.off, q.def, q.drive, q.sit, q.rng, q.brain, q.opts);
          run.play.defControlled = run.play.def.find((p) => p.slot === slot) ?? null;
          const bot = new DefBot('shadow', 0.2);
          run.snap();
          while (!run.done()) run.step(bot.step(run.play));
          const t = run.play.defDives;
          tries += t.tries;
          whiffs += t.whiffs;
          contact += t.contact;
          tackles += t.tackles;
          odds += t.odds;
          s = g.next({ r: run.result() });
        }
      }
    }
    expect(tries).toBeGreaterThan(50);
    // Of the dives that were decided (not beaten to him by a teammate's tackle), all but a few got to him.
    expect(contact / (contact + whiffs)).toBeGreaterThan(0.95);
    const sd = Math.sqrt(odds * (1 - odds / contact));
    expect(Math.abs(tackles - odds)).toBeLessThan(3.5 * sd);
  });
});
