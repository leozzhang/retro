import { describe, expect, it } from 'vitest';
import { DEF_CALLS, defCallById, taggedAssign } from './data/defenses';
import { defIdentity } from './data/identity';
import { PLAYBOOK } from './data/plays';
import { DEF_SLOTS, teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import {
  adjustments, callFor, DEF_BRAIN, halftime, headline, leansFor, newBrain, newDrive, observe, type DefBrain, type SnapSeen,
} from './game/defBrain';
import { Play } from './game/playState';
import * as H from './harness';

const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const ident = defIdentity(teamById('alabama'));
const prc = Object.fromEntries(DEF_SLOTS.map((s) => [s, 75]));
const brain = (iq: 'NORMAL' | 'SHARP' = 'NORMAL', adjust = 75) => newBrain({ iq, adjust, scout: adjust, qbMobility: 0, seed: 9 })!;

/** Feed the brain `n` snaps of one play, each gaining `gain` (with a throw `air` yards out) on first and 10. */
function feed(b: DefBrain, id: string, n: number, gain = 3, air = 0, down = 1, toGo = 10): void {
  for (let i = 0; i < n; i++) {
    const call = callFor(b, ident, down, toGo, 60, mulberry32(i)).call;
    leansFor(b, prc, call);
    const s: SnapSeen = { play: book(id), call, down, toGo, yardsToGoal: 60, gain, success: gain >= 4, scrambled: false, kept: false, air };
    observe(b, s);
  }
}

/** Share of `n` calls with `pred`, on a situation. */
function shareOf(b: DefBrain, pred: (c: (typeof DEF_CALLS)[number]) => boolean, down = 1, toGo = 10, ytg = 60, n = 2000): number {
  const rng = mulberry32(3);
  let k = 0;
  for (let i = 0; i < n; i++) if (pred(callFor(b, ident, down, toGo, ytg, rng).call)) k++;
  return k / n;
}

describe('defensive brain', () => {
  it('STATIC has no brain: the game plays the identity alone', () => {
    expect(newBrain({ iq: 'STATIC', adjust: 80, scout: 80, qbMobility: 1, seed: 1 })).toBeNull();
  });

  it('a run called over and over loads the box and brings the goal-line front on any down', () => {
    const b = brain();
    const heavy = (c: (typeof DEF_CALLS)[number]) => c.box >= 8;
    const before = shareOf(b, heavy);
    expect(shareOf(b, (c) => c.id === 'goal')).toBe(0);
    feed(b, 'qb-sneak', 10);
    expect(shareOf(b, heavy)).toBeGreaterThan(before + 0.2);
    expect(shareOf(b, (c) => c.id === 'goal')).toBeGreaterThan(0.05);
    const lean = leansFor(b, prc, DEF_CALLS[0]);
    expect(lean.DT1!.run).toBeGreaterThan(0.4);
    expect(lean.MLB!.run).toBeGreaterThan(0.4);
  });

  it('a varied offense moves the DC only a little', () => {
    const b = brain('SHARP');
    // Half runs; passes short, intermediate and one shot, as a normal offense throws them.
    const mix: [string, number][] = [
      ['inside-zone', 0], ['smash', 5], ['outside-zone', 0], ['mesh', 4], ['power', 0], ['curl-flat', 10], ['iso', 0], ['stick', 6], ['toss', 0], ['pa-post', 22],
    ];
    for (let i = 0; i < 30; i++) feed(b, mix[i % mix.length][0], 1, i % 3 ? 5 : 2, mix[i % mix.length][1]);
    for (const v of Object.values(b.shift)) expect(Math.abs(v)).toBeLessThan(0.45);
    expect(b.tags.spy).toBeLessThan(0.1);
  });

  it('caps every dial and keeps every call on the table', () => {
    const b = brain('SHARP', 95);
    feed(b, 'qb-power', 40, 1);
    for (const v of Object.values(b.shift)) expect(Math.abs(v)).toBeLessThanOrEqual(DEF_BRAIN.cap * DEF_BRAIN.iq.SHARP + 1e-9);
    // Even sold out on the QB run, he still plays every regular call sometimes.
    for (const c of DEF_CALLS.filter((x) => !x.situational)) expect(shareOf(b, (x) => x.id === c.id, 1, 10, 60, 6000), c.id).toBeGreaterThan(0.002);
  });

  it('QB runs bring a spy and contain, and he says so once a drive', () => {
    const b = brain('SHARP', 85);
    feed(b, 'qb-power', 12);
    expect(b.tags.spy).toBeGreaterThan(0.3);
    expect(b.tags.contain).toBeGreaterThan(0.3);
    const name = (id: string) => id.toUpperCase();
    const first = headline(b, name);
    expect(first).toBeTruthy();
    expect(headline(b, name)).toBeNull();
    newDrive(b);
    const second = headline(b, name);
    expect(second).not.toBe(first);
    expect(adjustments(b, name).length).toBeGreaterThan(1);
  });

  it('a weak DC is slower to adjust, and catches up at halftime', () => {
    const weak = brain('NORMAL', 40);
    const sharp = brain('NORMAL', 85);
    feed(weak, 'inside-zone', 6);
    feed(sharp, 'inside-zone', 6);
    expect(sharp.shift.box).toBeGreaterThan(weak.shift.box);
    const was = weak.shift.box;
    halftime(weak);
    expect(weak.shift.box).toBeGreaterThan(was);
  });

  it('is deterministic and survives a JSON round trip', () => {
    const a = brain();
    const b = brain();
    feed(a, 'smash', 5);
    feed(b, 'smash', 5);
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    const c = JSON.parse(JSON.stringify(a)) as DefBrain;
    expect(callFor(c, ident, 3, 8, 50, mulberry32(1)).call.id).toBe(callFor(a, ident, 3, 8, 50, mulberry32(1)).call.id);
  });

  it('getting burned over the top makes a run-leaning defender careful', () => {
    const b = brain();
    feed(b, 'inside-zone', 6);
    const call = DEF_CALLS[1];
    const before = leansFor(b, prc, call).MLB!.run;
    observe(b, { play: book('pa-post'), call, down: 1, toGo: 10, yardsToGoal: 60, gain: 30, success: true, scrambled: false, kept: false, air: 25 });
    expect(b.nerve.MLB!.run).toBeLessThan(0);
    expect(leansFor(b, prc, call).MLB!.run).toBeLessThan(before);
  });
});

describe('defensive playbook', () => {
  it('the original three calls line up exactly as before, and neutral leans change nothing', () => {
    const m = H.referenceMatchup();
    const p = book('smash');
    for (const call of DEF_CALLS.slice(0, 3)) {
      const a = H.newPlay(m, p, call, mulberry32(2));
      const reads = Object.fromEntries(DEF_SLOTS.map((s) => [s, { run: 0, screen: 0, qb: 0, deep: 0 }]));
      const b = H.newPlay(m, p, call, mulberry32(2), H.LOS, { reads, tags: {} });
      expect(b.def.map((d) => d.pos)).toEqual(a.def.map((d) => d.pos));
    }
  });

  it('tags put a spy where the call can spare one and contain on the ends', () => {
    for (const c of DEF_CALLS) {
      const t = taggedAssign(c, c.assign, { spy: true, contain: true });
      if (c.spyFrom) expect(t[c.spyFrom].kind).toBe('spy');
      for (const s of ['DE1', 'DE2'] as const) if (c.assign[s].kind === 'rush') expect(t[s]).toEqual({ kind: 'rush', contain: true });
    }
  });

  it('every call sets up and plays out against every formation', () => {
    const m = H.referenceMatchup();
    const forms = new Map(PLAYBOOK.map((p) => [p.formation.name, p]));
    for (const c of DEF_CALLS) {
      for (const p of forms.values()) {
        const play = H.newPlay(m, p, c, mulberry32(4), H.LOS, { tags: { spy: true, contain: true } });
        expect(play).toBeInstanceOf(Play);
        for (const d of play.def) expect(Number.isFinite(d.pos.x) && Number.isFinite(d.pos.y), `${c.id} ${p.id} ${d.slot}`).toBe(true);
      }
      const r = p0(c.id);
      expect(r.o, c.id).toBeTruthy();
    }
  });

  it('goal line plays the base package and walks everyone down', () => {
    const m = H.referenceMatchup();
    const play = H.newPlay(m, book('qb-sneak'), defCallById('goal'), mulberry32(1));
    expect(play.defPackage).toBe('base');
    expect(play.def.filter((d) => d.pos.x < H.LOS + 6).length).toBeGreaterThanOrEqual(9);
  });
});

/** One rep of IZ against a call, to see it plays to the end. */
function p0(id: string) {
  return H.runRep(H.referenceMatchup(), book('inside-zone'), defCallById(id), mulberry32(7));
}
