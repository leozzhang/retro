import { describe, expect, it } from 'vitest';
import { CORE_CALLS, DEF_CALLS } from './data/defenses';
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

describe('run fits (sim/runFits.ts)', () => {
  const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
  const snapRun = (id: string, callId = '2-man', seed = 3) => {
    const call = [...CORE_CALLS, ...DEF_CALLS].find((c) => c.id === callId)!;
    const play = newPlay(referenceMatchup(), book(id), call, mulberry32(seed));
    play.snap();
    return play;
  };

  it('every front player on a designed run has a job: an edge, a chase end, gaps, and a cutback backer', () => {
    // Cover 3: zone backers (in 2 Man the WLB is on the back, so he fills and nobody has the cutback).
    const play = snapRun('inside-zone', 'c3');
    const dl = play.def.filter((d) => d.role === 'DL');
    expect(dl.filter((d) => d.runJob === 'edge')).toHaveLength(1);
    expect(dl.filter((d) => d.runJob === 'chase')).toHaveLength(1);
    expect(dl.filter((d) => d.runJob === 'gap').length).toBeGreaterThanOrEqual(2);
    expect(play.def.some((d) => d.runJob === 'cutback')).toBe(true);
    // The edge is on the play side, the chase end on the other.
    const side = Math.sign(play.hole.y - play.ballY);
    const edge = dl.find((d) => d.runJob === 'edge')!;
    const chase = dl.find((d) => d.runJob === 'chase')!;
    expect(Math.sign(edge.pos.y - play.ballY)).toBe(side);
    expect(Math.sign(chase.pos.y - play.ballY)).toBe(-side);
  });

  it('a pass play leaves the front to rush (no run jobs)', () => {
    const play = snapRun('smash');
    expect(play.def.some((d) => d.runJob)).toBe(false);
  });

  it("the defensive line plays its gaps, not the QB: nobody's chasing the QB at the mesh", () => {
    const play = snapRun('inside-zone');
    for (let i = 0; i < 18; i++) play.update(STEP, fakeInput, cam);
    for (const d of play.def.filter((x) => x.role === 'DL' && x.runJob === 'gap' && !x.engagedBy.length)) {
      expect(Math.abs(d.goal!.y - d.gapY)).toBeLessThan(2.5);
    }
  });

  it('a backside lineman takes the cutoff angle: he aims across his man toward the ball, not at him', () => {
    const play = snapRun('inside-zone');
    play.update(STEP, fakeInput, cam);
    const side = Math.sign(play.hole.y - play.ballY);
    const back = play.off.filter((o) => o.role === 'OL').sort((a, b) => (a.pos.y - b.pos.y) * side)[0];
    expect(back.mark).toBeTruthy();
    // He's moving playside (toward the ball's side of his man).
    expect(Math.sign(back.want.y) === side || Math.abs(back.want.y) < 0.5).toBe(true);
  });

  it('a block is worth something: inside zone without its backside blocks loses yards (the ablation)', () => {
    const m = referenceMatchup();
    const iz = book('inside-zone');
    const run = (ablate?: { backside: number }) => {
      const rng = mulberry32(17);
      let y = 0;
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const r = runRep(m, iz, CORE_CALLS[0], rng, undefined, ablate ? { ablate } : undefined);
        if (!r.ran) continue;
        y += r.yds;
        n++;
      }
      return y / n;
    };
    expect(run({ backside: 2 })).toBeLessThan(run() - 1.5);
  });

  it('gap rules: the man over a guard is the guard\'s, and the uncovered tackle helps down on him (counter)', () => {
    const play = snapRun('counter', 'c3');
    play.update(STEP, fakeInput, cam);
    const g = play.off.find((o) => o.slot === 'RG')!;
    const t = play.off.find((o) => o.slot === 'RT')!;
    const dt = g.mark!;
    expect(dt.role).toBe('DL');
    expect(Math.abs(dt.pos.y - g.pos.y)).toBeLessThan(1);
    expect(t.mark).toBe(dt); // the double, down
    // The kick-out takes the end man on the line, head-up on the tight end; the TE climbs.
    const kick = play.off.find((o) => o.poaJob === 'kick')!;
    expect(kick.poa?.role).toBe('DL');
    expect(play.off.find((o) => o.slot === 'TE')!.mark?.role).toBe('LB');
  });

  it('a gun QB holds the backside end home longer (the keep), from under center he chases sooner', () => {
    const ends = (id: string) => {
      const play = snapRun(id, 'c3');
      const chase = play.def.find((d) => d.runJob === 'chase')!;
      const start = { ...chase.pos };
      for (let i = 0; i < 36; i++) play.update(STEP, fakeInput, cam); // 0.6 s
      return Math.abs(chase.pos.y - start.y);
    };
    // At 0.6 s the gun's chase end is still home; under center he's already flattening down the line.
    expect(ends('counter')).toBeLessThan(ends('ace-counter'));
  });

  it("a sneak reads only the A gaps", () => {
    const play = snapRun('qb-sneak', 'goal');
    for (let i = 0; i < 12 && play.phase !== 'run'; i++) play.update(STEP, fakeInput, cam);
    const lanes = laneScores(play, play.qb);
    expect(Math.max(...lanes.map((l) => Math.abs(l.y - play.hole.y)))).toBeLessThanOrEqual(1.3);
  });
});
