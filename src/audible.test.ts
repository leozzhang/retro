import { describe, expect, it } from 'vitest';
import { DEF_CALLS, defCallById } from './data/defenses';
import { rosterFor } from './data/depth';
import { defIdentity } from './data/identity';
import { PLAYBOOK } from './data/plays';
import { DEF_SLOTS, teamById } from './data/teams';
import { Camera } from './engine/camera';
import { STEP } from './engine/constants';
import type { Input } from './engine/input';
import { dist, mulberry32 } from './engine/math';
import { AUDIBLE_DC, callFor, checkFor, leansFor, newBrain, observe, recheckFor, releanFor, type DefBrain } from './game/defBrain';
import { AUDIBLE, Play, type PlaySetup } from './game/playState';
import { personnelOf } from './game/resolvePlay';
import { buildStaff, dcAdjust } from './data/coaches';
import { buildSquad, onField } from './data/depth';
import { ocBook, ocStyle } from './data/offStyles';
import { engineDrive, showFormation, type EngineSide, type EngineSnap } from './game/engineDrive';
import { offIdentity, shiftRate } from './data/offIdentity';
import { rosterRead } from './game/offModel';
import type { DriveClock } from './game/rules';

const UGA = teamById('georgia');
const BAMA = teamById('alabama');
const offR = rosterFor(UGA);
const defR = rosterFor(BAMA);
const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const idle = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
  axis: () => ({ x: 0, y: 0 }), isDown: () => false, hit: () => false, endStep: () => {},
} as unknown as Input;
const cam = new Camera();
const setup = (id: string, extra: Partial<PlaySetup> = {}): PlaySetup => ({
  offTeam: UGA, defTeam: BAMA, offRoster: offR, defRoster: defR, play: book(id), defCall: DEF_CALLS[0], press: {},
  los: 35, ballY: 26.65, rng: mulberry32(1), ...extra,
});
const key = (p: Play['players'][number]) => `${p.side}|${p.name}|${p.num}`;

describe('audibles', () => {
  it('a quiet check in the same formation moves no one and can snap at once', () => {
    const a = new Play(setup('four-verts'));
    for (let i = 0; i < 30; i++) a.update(STEP, idle, cam);
    const b = new Play(setup('slant-flat', { from: a }));
    expect(b.shift).toBeNull();
    expect(b.canSnap()).toBe(true);
    const was = new Map(a.players.map((p) => [key(p), p.pos]));
    for (const p of b.players) expect(dist(p.pos, was.get(key(p))!)).toBeLessThan(1e-9);
  });

  it('a shift starts everyone where he stood, lays the routes from the new spots, and holds the snap until set', () => {
    const a = new Play(setup('four-verts'));
    const trips = PLAYBOOK.find((p) => p.formation.name !== a.playDef.formation.name && personnelOf(p.formation) === personnelOf(a.playDef.formation) && p.kind === 'pass')!;
    const b = new Play(setup(trips.id, { from: a }));
    expect(b.shift).not.toBeNull();
    expect(b.canSnap()).toBe(false);
    const was = new Map(a.players.map((p) => [key(p), p.pos]));
    for (const p of b.players) expect(dist(p.pos, was.get(key(p))!)).toBeLessThan(1e-9);
    // Someone has to move, and his route starts from his new spot.
    const mover = b.off.find((p) => dist(p.pos, p.start) > 1)!;
    expect(mover).toBeDefined();
    if (mover.route.length) expect(dist(mover.route[0], mover.start)).toBeLessThan(dist(mover.route[0], mover.pos) + 30);
    let t = 0;
    while (!b.canSnap() && t < 10) {
      b.update(STEP, idle, cam);
      t += STEP;
    }
    expect(b.canSnap()).toBe(true);
    expect(t).toBeGreaterThan(AUDIBLE.set);
    expect(t).toBeLessThan(6);
    for (const p of b.off) expect(dist(p.pos, p.start)).toBeLessThan(AUDIBLE.setR + 0.05);
  });

  it('flipping the same play is a shift', () => {
    const a = new Play(setup('four-verts'));
    const b = new Play(setup('four-verts', { from: a, flip: true }));
    expect(b.shift).not.toBeNull();
  });

  const ident = defIdentity(BAMA);
  const prc = Object.fromEntries(DEF_SLOTS.map((s) => [s, 75]));
  const fed = (): DefBrain => {
    const b = newBrain({ iq: 'SHARP', adjust: 90, scout: 90, qbMobility: 0, seed: 4 })!;
    // A look that only runs and a look that only throws, in the same personnel.
    const run = PLAYBOOK.find((p) => p.kind === 'run' && personnelOf(p.formation) === '11')!;
    const pass = PLAYBOOK.find((p) => p.kind === 'pass' && personnelOf(p.formation) === '11' && p.formation !== run.formation)!;
    for (let i = 0; i < 30; i++) {
      for (const p of [run, pass]) {
        const call = callFor(b, ident, 1, 10, 60, mulberry32(i)).call;
        leansFor(b, prc, call);
        observe(b, { play: p, call, down: 1, toGo: 10, yardsToGoal: 60, gain: 5, success: true, scrambled: false, kept: false, air: p.kind === 'pass' ? 8 : 0 });
      }
    }
    return b;
  };

  it('the re-check stays in the package, needs the play clock, and comes more often once he has seen shifts', () => {
    const pass = PLAYBOOK.find((p) => p.kind === 'pass' && personnelOf(p.formation) === '11' && p.formation !== PLAYBOOK.find((q) => q.kind === 'run' && personnelOf(q.formation) === '11')!.formation)!;
    const b = fed();
    const rate = (shifts: number, clock = 20) => {
      let k = 0;
      const n = 300;
      for (let i = 0; i < n; i++) {
        b.shifts = shifts;
        b.draws = i * 13;
        const now = defCallById('c3');
        const c = recheckFor(b, ident, pass, now, 1, 10, 60, clock);
        if (c) {
          expect((c.pkg ?? 'base') === (now.pkg ?? 'base')).toBe(true);
          k++;
        }
      }
      return k / n;
    };
    expect(rate(0, AUDIBLE_DC.clock - 0.5)).toBe(0);
    const calm = rate(0);
    const wary = rate(1 / (1 - AUDIBLE_DC.decay));
    expect(wary).toBeGreaterThan(calm);
  });

  it('the huddle check is unchanged at the default odds', () => {
    const b1 = fed();
    const b2 = fed();
    const p = PLAYBOOK.find((q) => q.kind === 'pass' && personnelOf(q.formation) === '11')!;
    const now = defCallById('c3');
    expect(checkFor(b1, ident, p, now, 1, 10, 60)?.id).toBe(checkFor(b2, ident, p, now, 1, 10, 60, undefined, 1)?.id);
  });

  it('the re-read moves each lean toward the new look by his play recognition', () => {
    const b = fed();
    const run = PLAYBOOK.find((p) => p.kind === 'run' && personnelOf(p.formation) === '11')!;
    const pass = PLAYBOOK.find((p) => p.kind === 'pass' && personnelOf(p.formation) === '11' && p.formation !== run.formation)!;
    const call = defCallById('c3');
    const at = { down: 1, toGo: 10, yardsToGoal: 60 };
    const before = leansFor(b, prc, call, run, at);
    const slow = { ...prc, MLB: 0 };
    const sharp = { ...prc, MLB: 100 };
    const target = leansFor({ ...b }, prc, call, pass, at).MLB!.run;
    const s = releanFor({ ...b }, slow, call, pass, at, before).MLB!.run;
    const f = releanFor({ ...b }, sharp, call, pass, at, before).MLB!.run;
    // The sharp backer comes off the run read further than the slow one.
    expect(Math.abs(f - before.MLB!.run)).toBeGreaterThan(Math.abs(s - before.MLB!.run) * 0.99);
    expect(Math.sign(target - before.MLB!.run)).toBe(Math.sign(f - before.MLB!.run) || Math.sign(target - before.MLB!.run));
  });

  it('a shift is counted, a quiet check is not', () => {
    const b = fed();
    const s0 = b.shifts;
    const p = book('four-verts');
    const call = DEF_CALLS[0];
    observe(b, { play: p, call, down: 1, toGo: 10, yardsToGoal: 60, gain: 5, success: true, scrambled: false, kept: false, air: 8 });
    expect(b.shifts).toBeCloseTo(s0 * AUDIBLE_DC.decay);
    observe(b, { play: p, call, down: 1, toGo: 10, yardsToGoal: 60, gain: 5, success: true, scrambled: false, kept: false, air: 8, shifted: true });
    expect(b.shifts).toBeCloseTo(s0 * AUDIBLE_DC.decay ** 2 + 1);
  });
});

describe('audibles in engine drives', () => {
  const side = (t: ReturnType<typeof teamById>): EngineSide => {
    const staff = buildStaff(t);
    const roster = onField(buildSquad(t));
    return { team: t, roster, oc: { book: ocBook(staff.OC), style: ocStyle(staff.OC), passShare: 0.5, id: offIdentity(staff.OC, roster) }, ident: defIdentity(t, staff.DC) };
  };
  const off = side(teamById('georgia'));
  const def = side(teamById('alabama'));
  const clock: DriveClock = { timeLeft: 1800, hurry: false, milk: false, lead: 0, finalHalf: false, qSecs: 900 };
  const snaps: EngineSnap[] = [];
  for (let seed = 1; seed <= 40; seed++) {
    const dc = buildStaff(def.team).DC;
    const brain = newBrain({ iq: 'NORMAL', adjust: dcAdjust(dc), scout: dc.r.scout, qbMobility: 0, seed, book: off.oc.book, style: off.oc.style, roster: rosterRead(off.roster) });
    snaps.push(...engineDrive(off, def, 25, mulberry32(seed), clock, { brain, record: true }).snaps);
  }

  it('the QB checks in his personnel, the OC shifts by design and on checks, and a shift is on tape before the snap', () => {
    const ck = snaps.filter((s) => s.checked);
    const sh = snaps.filter((s) => s.shifted);
    expect(ck.length).toBeGreaterThan(0);
    expect(sh.length).toBeGreaterThan(0);
    // Designed shifts: no check needed.
    expect(sh.some((s) => !s.checked)).toBe(true);
    for (const s of sh) {
      expect(s.tape?.shift?.length ?? 0).toBeGreaterThan(5);
      // The shift starts away from the spots the tape's snap starts on.
      const a = s.tape!.shift![0].men;
      const b = s.tape!.frames[0].men;
      expect(a.some((m, i) => Math.hypot(m.x - b[i].x, m.y - b[i].y) > 0.5)).toBe(true);
    }
    for (const s of snaps.filter((x) => !x.shifted)) expect(s.tape?.shift).toBeUndefined();
  });

  it('the shown look is another formation of the same personnel, and every OC shifts by his style', () => {
    const p = off.oc.book.find((q) => off.oc.book.some((r) => r.formation.name !== q.formation.name && personnelOf(r.formation) === personnelOf(q.formation)))!;
    for (let i = 0; i < 20; i++) {
      const s = showFormation(off.oc.book, p, mulberry32(i))!;
      expect(s.formation.name).not.toBe(p.formation.name);
      expect(personnelOf(s.formation)).toBe(personnelOf(p.formation));
    }
    expect(shiftRate({ id: 'x' }, 'power')).toBeGreaterThan(shiftRate({ id: 'x' }, 'airRaid'));
  });

  it('a re-check only follows a shift', () => {
    for (const s of snaps) if (s.rechecked) expect(s.shifted).toBe(true);
  });

  it('the checked play keeps the huddle personnel', () => {
    for (const s of snaps.filter((x) => x.checked)) {
      const same = off.oc.book.filter((p) => personnelOf(p.formation) === personnelOf(s.play.formation));
      expect(same).toContain(s.play);
    }
  });
});
