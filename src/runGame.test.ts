import { describe, expect, it } from 'vitest';
import { CORE_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { Camera } from './engine/camera';
import { STEP } from './engine/constants';
import type { Input } from './engine/input';
import { len, mulberry32 } from './engine/math';
import { cam, fakeInput, newPlay, referenceMatchup, runRep, type Matchup } from './harness';
import { cutSpeed, maxSpeed } from './sim/player';
import { armOdds, laneScores, PILE, pickLane, pileCap, RUN_CONTROL, RUN_GAP, runEngagement, runTalent } from './sim/runBlocking';
import { jukeTackleMul, tackleChance } from './sim/tackling';

/** The harness input with a held direction and one-step key presses. */
function input(axis = { x: 0, y: 0 }, hits: string[] = []): Input {
  return { ...fakeInput, axis: () => axis, isDown: () => false, hit: (...codes: string[]) => codes.some((c) => hits.includes(c)) } as Input;
}

/** Inside Zone against 2 Man Under, handed off as soon as it's on. */
function handedOff(seed = 7) {
  const play = newPlay(referenceMatchup(), PLAYBOOK.find((p) => p.id === 'inside-zone')!, CORE_CALLS[0], mulberry32(seed));
  play.snap();
  for (let i = 0; i < 300 && !play.handedOff; i++) {
    if (play.handoffOption() === 'handoff') play.handoff();
    else play.update(STEP, fakeInput, cam);
  }
  expect(play.phase).toBe('run');
  return play;
}

describe('camera spread', () => {
  it('round-trips world <-> screen and keeps the zoom point in place', () => {
    const c = new Camera();
    c.follow(30);
    c.snap();
    const at = { x: 36, y: 26 };
    const before = c.toScreen(at.x, at.y);
    c.setZoom(1.3, 1.9, at);
    expect(c.toScreen(at.x, at.y).x).toBeCloseTo(before.x);
    expect(c.toScreen(at.x, at.y).y).toBeCloseTo(before.y);
    const s = c.toScreen(41.5, 19.25);
    const w = c.toWorld(s.x, s.y);
    expect(w.x).toBeCloseTo(41.5);
    expect(w.y).toBeCloseTo(19.25);
    // Across the field spreads more than along it.
    expect(c.toScreen(at.x, at.y + 1).y - before.y).toBeGreaterThan(5.2 * 1.8);
  });
});

describe('cut', () => {
  it('cuts the tackle odds, more for a more elusive back, within bounds', () => {
    expect(jukeTackleMul(95)).toBeLessThan(jukeTackleMul(60));
    expect(jukeTackleMul(100)).toBeGreaterThan(0.4);
    expect(jukeTackleMul(0)).toBeLessThan(1);
  });

  it('cuts him sideways on Space with S, costs the bar, and only once a play', () => {
    const play = handedOff();
    const c = play.carrier!;
    const bar = c.stamina;
    play.update(STEP, input({ x: 1, y: 0 }, ['Space']), cam);
    expect(c.juke).toBe(0); // Space alone does nothing
    play.update(STEP, input({ x: 1, y: 1 }, ['Space']), cam);
    expect(c.juke).toBeGreaterThan(0);
    expect(c.stamina).toBeLessThan(bar);
    for (let i = 0; i < 10; i++) play.update(STEP, input({ x: 1, y: 0 }), cam);
    expect(c.vel.y).toBeGreaterThan(cutSpeed(c) * 0.5);
    for (let i = 0; i < 120 && play.phase === 'run'; i++) play.update(STEP, input({ x: 1, y: 0 }), cam);
    play.update(STEP, input({ x: 1, y: -1 }, ['Space']), cam);
    expect(c.juke).toBe(0); // used up for this play
  });
});

describe('who cuts', () => {
  it('a quicker, more elusive back cuts farther', () => {
    const play = handedOff();
    const c = play.carrier!;
    const fb = { ...c, r: { ...c.r, acc: 80, elu: 65 } };
    const elite = { ...c, r: { ...c.r, acc: 97, elu: 97 } };
    expect(cutSpeed(elite)).toBeGreaterThan(cutSpeed(c));
    expect(cutSpeed(c)).toBeGreaterThan(cutSpeed(fb));
  });

  it('only a back on a called run', () => {
    const play = handedOff();
    expect(play.canCut(play.carrier!)).toBe(true);
    const sneak = newPlay(referenceMatchup(), PLAYBOOK.find((p) => p.id === 'qb-sneak')!, CORE_CALLS[0], mulberry32(3));
    sneak.snap();
    for (let i = 0; i < 60 && sneak.phase !== 'run'; i++) sneak.update(STEP, fakeInput, cam);
    expect(sneak.phase).toBe('run');
    expect(sneak.canCut(sneak.carrier!)).toBe(false);
  });
});

describe('runner at the line', () => {
  it('waits for the hole with no key held', () => {
    const play = handedOff();
    const c = play.carrier!;
    for (let i = 0; i < 30 && play.phase === 'run'; i++) play.update(STEP, input(), cam);
    expect(play.phase).toBe('run');
    expect(c.pos.x).toBeLessThan(play.los + 2);
    expect(len(c.vel)).toBeLessThan(maxSpeed(c) * 0.55);
  });

  it('slides along the line on up or down alone', () => {
    const play = handedOff();
    const c = play.carrier!;
    for (let i = 0; i < 20 && play.phase === 'run'; i++) play.update(STEP, input({ x: 0, y: 1 }), cam);
    expect(play.phase).toBe('run');
    expect(c.pos.x).toBeLessThan(play.los + 2);
    expect(c.vel.y).toBeGreaterThan(Math.abs(c.vel.x) * 2);
  });
});

describe('lanes', () => {
  it('the auto-runner picks from the lanes the renderer shows', () => {
    const play = handedOff(11);
    const c = play.carrier!;
    const lanes = laneScores(play, c);
    expect(lanes.length).toBeGreaterThan(5);
    for (const l of lanes) expect(l.spare).toBeLessThanOrEqual(Math.min(1.5, l.open));
    expect(lanes.map((l) => l.y)).toContain(pickLane(play, c));
  });
});

describe('run blocks and the talent gap', () => {
  it('squeezes the rating edge toward the equal-talent edge, monotonic and bounded', () => {
    const even = -3;
    expect(runTalent(even, even)).toBeCloseTo(even);
    let last = -Infinity;
    for (let raw = -60; raw <= 60; raw += 2) {
      const t = runTalent(raw, even);
      expect(t).toBeGreaterThan(last);
      expect(Math.abs(t - even)).toBeLessThanOrEqual(RUN_GAP.k * RUN_GAP.soft + 1e-9);
      last = t;
    }
    // Near even a rating point counts about `k`.
    expect(runTalent(even + 1, even) - even).toBeCloseTo(RUN_GAP.k, 1);
  });

  it('a block wears down instead of breaking at once, and his arm tackle grows as it does', () => {
    const play = newPlay(referenceMatchup(), PLAYBOOK.find((p) => p.id === 'inside-zone')!, CORE_CALLS[0], mulberry32(3));
    play.snap();
    let d = null as null | (typeof play.def)[number];
    for (let i = 0; i < 60 && !d; i++) {
      play.update(STEP, fakeInput, cam);
      d = play.def.find((x) => x.role === 'DL' && x.engagedBy.length === 1) ?? null;
    }
    expect(d).not.toBeNull();
    d!.blockRoll = 30; // he's winning big
    d!.blockControl = 1;
    const fresh = armOdds(d!);
    let steps = 0;
    while (runEngagement(play, d!) === 0 && steps < 600) steps++;
    // Not off at contact even winning big, but off within a second.
    expect(steps * STEP).toBeGreaterThan(0.2);
    expect(steps * STEP).toBeLessThan(1);
    expect(fresh).toBeCloseTo(RUN_CONTROL.armFloor);
    expect(armOdds(d!)).toBeCloseTo(RUN_CONTROL.armFloor + RUN_CONTROL.arm);
    // Losing, he doesn't wear it down at all.
    d!.blockRoll = -30;
    d!.blockControl = 0.5;
    for (let i = 0; i < 120; i++) expect(runEngagement(play, d!)).toBe(0);
    expect(d!.blockControl).toBeGreaterThan(0.5);
  });

  it('a blocked pair right in front of the carrier is a wall he moves with, not through', () => {
    const play = handedOff();
    const c = play.carrier!;
    const d = play.def.find((x) => x.role === 'DL')!;
    const b = play.off.find((x) => x.role === 'OL')!;
    for (const x of play.def) x.engagedBy = [];
    d.engagedBy = [b];
    b.engaged = d;
    d.pos = { x: c.pos.x + 0.8, y: c.pos.y };
    d.vel = { x: -1, y: 0 }; // he's surging into the backfield
    const cap = pileCap(play, c)!;
    expect(cap).toBeLessThan(0.5);
    expect(cap).toBeGreaterThan(-1);
    d.vel = { x: 1.5, y: 0 }; // the line is driving him: the back rides the push
    expect(pileCap(play, c)!).toBeGreaterThan(1.5);
    d.pos = { x: c.pos.x + 0.8, y: c.pos.y + PILE.width + 0.2 }; // beside him: a lane
    expect(pileCap(play, c)).toBeNull();
  });

  it('scrimmage tackles saturate on a big skill gap', () => {
    expect(tackleChance(80, 80, 80)).toBeCloseTo(0.8);
    expect(tackleChance(50, 99, 90)).toBeGreaterThan(0.6);
    expect(tackleChance(99, 50, 50)).toBeLessThanOrEqual(0.97);
  });

  it('a better defense still wins, but a 10-point edge is not a wall', () => {
    const plays = ['inside-zone', 'outside-zone', 'power', 'toss', 'zone-read'].map((id) => PLAYBOOK.find((p) => p.id === id)!);
    const run = (m: Matchup) => {
      const rng = mulberry32(21);
      const ys: number[] = [];
      for (const call of CORE_CALLS) for (const p of plays) for (let i = 0; i < 16; i++) {
        const r = runRep(m, p, call, rng);
        if (r.o && r.ran) ys.push(r.yds);
      }
      return { ypc: ys.reduce((a, b) => a + b, 0) / ys.length, stuff: ys.filter((y) => y <= 0).length / ys.length };
    };
    const weaker = run(referenceMatchup(70, 60));
    const even = run(referenceMatchup(70, 70));
    const stronger = run(referenceMatchup(70, 80));
    expect(weaker.ypc).toBeGreaterThan(even.ypc);
    expect(even.ypc).toBeGreaterThan(stronger.ypc);
    expect(stronger.stuff).toBeLessThan(0.35);
    expect(stronger.ypc).toBeGreaterThan(1.5);
  });
});
