import { describe, expect, it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { defIdentity } from './data/identity';
import { LEGACY, PLAYBOOK } from './data/plays';
import { DEF_SLOTS, teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { anticFor, callFor, dcMix, newBrain, observe, type DefBrain } from './game/defBrain';
import { addThrow, expectThrow, rollOf, type ThrowSeen } from './game/habits';
import { mergeFilm, sigOf } from './game/offModel';
import * as H from './harness';

const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const ident = defIdentity(teamById('alabama'));
const c3 = DEF_CALLS.find((c) => c.id === 'c3')!;
const prc = Object.fromEntries(DEF_SLOTS.map((s) => [s, 75]));
const LOOK = '11 Gun Doubles';
/** The boot bullet: rolled to the weak side, the out at 11 yd, 1.7 s. */
const boot = (over: Partial<ThrowSeen> = {}): Omit<ThrowSeen, 'w'> => ({
  look: LOOK, roll: -1, t: 1.7, kind: 'bullet', slot: 'Z', route: 'deepOut', dx: 11, dy: -16, gain: 11, caught: true, beaten: 'CB2', ...over,
});
const cue = (roll: -1 | 0 | 1, look = LOOK) => ({ look, t: 1, roll, los: 35, ballY: 26.6, strong: 1 as const });

function feedBoot(b: DefBrain, n: number, call = c3, gain = 11): void {
  for (let i = 0; i < n; i++) {
    observe(b, {
      play: book('pa-boot'), call, down: 1, toGo: 10, yardsToGoal: 60, gain, success: gain >= 4, scrambled: false, kept: false, air: 11,
      throw: boot({ gain }), target: 'Z',
    });
  }
}

describe('the players learn your throws', () => {
  it('reads the QB rolling to a side against the formation', () => {
    expect(rollOf(26.6, 26.6, 1)).toBe(0);
    expect(rollOf(20, 26.6, 1)).toBe(-1);
    expect(rollOf(20, 26.6, -1)).toBe(1);
  });

  it('a repeated rollout throw predicts its receiver and spot with rising confidence; the pocket barely matches it', () => {
    let recs: ThrowSeen[] = [];
    recs = addThrow(recs, boot());
    const one = expectThrow(recs, cue(-1))!;
    for (let i = 0; i < 5; i++) recs = addThrow(recs, boot());
    const six = expectThrow(recs, cue(-1))!;
    expect(six.slot).toBe('Z');
    expect(six.conf).toBeGreaterThan(one.conf);
    expect(six.spot.x).toBeCloseTo(46, 5);
    expect(six.spot.y).toBeCloseTo(10.6, 5); // 16 yd to the weak side of the ball
    expect(six.bullet).toBe(1);
    expect(six.rollConf).toBeGreaterThan(0.9);
    // Rolled the other way, or from another look: much less sure.
    const other = expectThrow(recs, cue(1))!;
    expect(other.conf).toBeLessThan(six.conf);
    expect(expectThrow(recs, cue(-1, '12 Ace'))!.conf).toBeLessThan(six.conf);
  });

  it('the defender who keeps getting beaten learns fastest, and getting burned jumping it makes him careful', () => {
    const b = newBrain({ iq: 'NORMAL', adjust: 75, scout: 75, qbMobility: 0, seed: 2, book: LEGACY })!;
    expect(anticFor(b, prc)).toEqual({});
    feedBoot(b, 2);
    const a = anticFor(b, prc);
    expect(a.CB2!).toBeGreaterThan(a.CB1!);
    // He jumped it and the ball went over him for 30.
    const before = anticFor(b, prc).CB2!;
    observe(b, {
      play: book('pa-boot'), call: c3, down: 1, toGo: 10, yardsToGoal: 60, gain: 30, success: true, scrambled: false, kept: false, air: 28,
      throw: boot({ slot: 'X', route: 'go', kind: 'lob', dx: 28, gain: 30, beaten: 'FS' }), antic: { CB2: 'jump' },
    });
    expect(b.jumpNerve.CB2!).toBeLessThan(0);
    expect(anticFor(b, prc).CB2!).toBeLessThan(before);
  });

  it('on the field: a strong read puts the defender on the out in the lane, then on the ball before the throw', () => {
    const m = H.referenceMatchup();
    let recs: ThrowSeen[] = [];
    for (let i = 0; i < 8; i++) recs = addThrow(recs, boot());
    const antic = Object.fromEntries(DEF_SLOTS.map((s) => [s, 1]));
    const play = H.newPlay(m, book('pa-boot'), c3, mulberry32(3), H.LOS, { habits: recs, antic });
    play.snap();
    const roles = new Set<string>();
    for (let t = 0; t < 1.9 && play.phase !== 'over'; t += 1 / 60) {
      play.update(1 / 60, H.fakeInput, H.cam);
      for (const a of play.antic.values()) roles.add(a.role);
    }
    expect(play.expect?.route ?? [...play.anticLog.values()].length).toBeTruthy();
    expect(roles.has('lane') || roles.has('jump')).toBe(true);
  });

  it('no throws seen: a snap is exactly the snap without the system', () => {
    const m = H.referenceMatchup();
    const a = H.newPlay(m, book('pa-boot'), c3, mulberry32(5));
    const b = H.newPlay(m, book('pa-boot'), c3, mulberry32(5), H.LOS, { habits: [], antic: {} });
    a.snap();
    b.snap();
    for (let t = 0; t < 2; t += 1 / 60) {
      a.update(1 / 60, H.fakeInput, H.cam);
      b.update(1 / 60, H.fakeInput, H.cam);
    }
    expect(b.def.map((d) => d.pos)).toEqual(a.def.map((d) => d.pos));
  });
});

describe('the DC learns your throws', () => {
  it('rollout bullets that beat Cover 3 move him off it, and bring contain and the trap', () => {
    const b = newBrain({ iq: 'NORMAL', adjust: 85, scout: 85, qbMobility: 0, seed: 4, book: LEGACY })!;
    const c3Share = (x: DefBrain) => {
      let v = 0;
      for (let i = 0; i < 20; i++) v += dcMix(x, ident, 1, 10, 60, mulberry32(i)).mix.c3 / 20;
      return v;
    };
    const fresh = c3Share(b);
    feedBoot(b, 10);
    expect(c3Share(b)).toBeLessThan(fresh);
    expect(b.tags.contain).toBeGreaterThan(0.1);
    expect(b.model.sig[sigOf(boot())]).toBeGreaterThan(1);
    dcMix(b, ident, 1, 10, 60, mulberry32(1));
    // The trap's odds come from the habit's concentration.
    let trapped = 0;
    for (let i = 0; i < 200; i++) {
      const r = mulberry32(i);
      if (callForTrap(b, r)) trapped++;
    }
    expect(trapped).toBeGreaterThan(10);
  });

  it('carries how you throw on film, the throws too', () => {
    const b = newBrain({ iq: 'NORMAL', adjust: 75, scout: 75, qbMobility: 0, seed: 4, book: LEGACY })!;
    feedBoot(b, 6);
    const film = mergeFilm(undefined, { ...b.model.raw, throws: b.habits.slice(0, 12) });
    expect(JSON.parse(JSON.stringify(film))).toEqual(film);
    expect(film.sig![sigOf(boot())]).toBe(6);
    const next = newBrain({ iq: 'NORMAL', adjust: 75, scout: 85, qbMobility: 0, seed: 5, book: LEGACY, film })!;
    expect(next.habits.length).toBe(6);
    expect(anticFor(next, prc).CB2!).toBeGreaterThan(0);
    expect(next.model.sig[sigOf(boot())]).toBeGreaterThan(0);
  });
});

function callForTrap(b: DefBrain, rng: () => number): boolean {
  return !!callFor(b, ident, 1, 10, 60, rng).tags.trap;
}
