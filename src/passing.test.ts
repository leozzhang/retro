import { describe, expect, it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { STEP } from './engine/constants';
import { mulberry32 } from './engine/math';
import * as H from './harness';
import { cam, fakeInput } from './harness';
import { eyesOf, FIND, readyAt, receiverFind } from './sim/ai';
import { hotness, kindSpeed, passParams, THROWS } from './sim/ball';
import { catchGrade, catchOdds, PLACEMENT, reachScore } from './sim/catching';
import { GATHER, hipTurnRate, maxSpeed, startCatch, startGather, stepPlayer } from './sim/player';
import { maxThrowDist, throwErrorSd } from './sim/passing';

const QB = { sac: 85, mac: 82, dac: 78, tup: 80, pac: 80 };

describe('throw types', () => {
  it('touch is the old arc exactly; a bullet is faster and flatter, a lob slower and higher', () => {
    for (const d of [8, 20, 40]) {
      expect(passParams(d, 88, 'touch')).toEqual(passParams(d, 88));
      expect(passParams(d, 88, 'bullet').dur).toBeLessThan(passParams(d, 88).dur);
      expect(passParams(d, 88, 'bullet').peak).toBeLessThan(passParams(d, 88).peak);
      expect(passParams(d, 88, 'lob').dur).toBeGreaterThan(passParams(d, 88).dur);
      expect(passParams(d, 88, 'lob').peak).toBeGreaterThan(passParams(d, 88).peak);
    }
  });
  it('only a big arm throws a real rope', () => {
    expect(kindSpeed('bullet', 95)).toBeCloseTo(THROWS.bullet.speed);
    expect(kindSpeed('bullet', 60)).toBeLessThan(kindSpeed('bullet', 80));
    expect(kindSpeed('bullet', 50)).toBeGreaterThan(1);
    expect(kindSpeed('touch', 50)).toBe(1);
  });
  it('a bullet has less range and more error, most of all under pressure', () => {
    expect(maxThrowDist(85, 'bullet')).toBeLessThan(maxThrowDist(85));
    expect(maxThrowDist(85, 'lob')).toBe(maxThrowDist(85));
    expect(throwErrorSd(15, QB, 0, 0, 'touch')).toBe(throwErrorSd(15, QB, 0, 0));
    expect(throwErrorSd(15, QB, 0, 0, 'bullet')).toBeGreaterThan(throwErrorSd(15, QB, 0, 0));
    const calm = throwErrorSd(15, QB, 0, 0, 'bullet') / throwErrorSd(15, QB, 0, 0);
    const pressed = throwErrorSd(15, QB, 1, 0, 'bullet') / throwErrorSd(15, QB, 1, 0);
    expect(pressed).toBeGreaterThan(calm);
  });
  it('a bullet is hot short and a rope deep, and hardest to adjust to', () => {
    expect(hotness('touch', 5, 95)).toBe(0);
    expect(hotness('lob', 40, 95)).toBe(0);
    expect(hotness('bullet', 5, 95)).toBeGreaterThan(hotness('bullet', 5, 65));
    expect(hotness('bullet', 5, 90)).toBeGreaterThan(hotness('bullet', 16, 90));
    expect(hotness('bullet', 35, 90)).toBeGreaterThan(hotness('bullet', 18, 90));
    expect(catchOdds({ pos: 1, cth: 80, hot: 1 }, null).catch).toBeLessThan(catchOdds({ pos: 1, cth: 80 }, null).catch);
    expect(reachScore(1, THROWS.bullet.reach)).toBeLessThan(reachScore(1));
    expect(reachScore(1, THROWS.lob.reach)).toBeGreaterThan(reachScore(1));
  });
  it('a bullet is a short-to-intermediate throw, even from a cannon', () => {
    expect(maxThrowDist(99, 'bullet')).toBeLessThan(30);
    expect(maxThrowDist(70, 'bullet')).toBeGreaterThan(24);
  });
  it('a bullet has to be gathered: he slows through the catch, less with sure hands', () => {
    const p = H.newPlay(H.referenceMatchup(), PLAYBOOK.find((q) => q.kind === 'pass')!, DEF_CALLS[0], mulberry32(1)).off.find((q) => q.role === 'WR')!;
    p.vel = { x: 8, y: 0 };
    startGather(p, THROWS.touch.gather);
    expect(p.vel.x).toBe(8);
    expect(p.gather).toBe(0);
    p.r = { ...p.r, cth: 60 };
    startGather(p, THROWS.bullet.gather);
    const shaky = { v: p.vel.x, t: p.gather };
    expect(shaky.v).toBeLessThan(8);
    expect(shaky.t).toBeGreaterThan(0);
    expect(shaky.t).toBeLessThanOrEqual(GATHER.time);
    p.vel = { x: 8, y: 0 };
    p.r = { ...p.r, cth: 95 };
    startGather(p, THROWS.bullet.gather);
    expect(p.vel.x).toBeGreaterThan(shaky.v);
    expect(p.gather).toBeLessThan(shaky.t);
  });
  it('a lob is a jump ball: surest hands, more of the contested ones caught, and more picks', () => {
    const o = { pos: 0.6, cth: 80, cit: 80 };
    const d = { pos: 1, cth: 70, prc: 80 };
    const lob = THROWS.lob.jump;
    expect(THROWS.touch.jump).toBe(0);
    expect(catchOdds({ ...o }, null, lob).catch).toBeGreaterThan(catchOdds({ ...o }, null).catch);
    expect(catchOdds(o, d, lob).catch).toBeGreaterThan(catchOdds(o, d).catch);
    expect(catchOdds(o, d, lob).int).toBeGreaterThan(catchOdds(o, d).int);
    expect(catchOdds(o, d, 0)).toEqual(catchOdds(o, d));
  });
});

describe('finding the ball', () => {
  it('missing ready is a full look; a receiver who never found it catches far less', () => {
    expect(catchOdds({ pos: 0.9, cth: 80, ready: 1 }, null)).toEqual(catchOdds({ pos: 0.9, cth: 80 }, null));
    const blind = catchOdds({ pos: 0.9, cth: 80, ready: 0 }, null).catch;
    expect(blind).toBeLessThan(catchOdds({ pos: 0.9, cth: 80 }, null).catch * 0.6);
    const d = { pos: 0.9, cth: 70, prc: 80 };
    expect(catchOdds({ pos: 0.9, cth: 80, ready: 0 }, d).catch).toBeLessThan(catchOdds({ pos: 0.9, cth: 80 }, d).catch);
  });
  it("a defender who never found the ball can knock it down but can't pick it", () => {
    const o = { pos: 0.9, cth: 80 };
    expect(catchOdds(o, { pos: 1, cth: 75, prc: 85, ready: 0 }).int).toBe(0);
    expect(catchOdds(o, { pos: 1, cth: 75, prc: 85 }).int).toBeGreaterThan(0);
    expect(catchOdds(o, { pos: 1, cth: 75, prc: 85, ready: 0 }).catch).toBeLessThan(o.pos);
  });

  const M = H.referenceMatchup();
  const snapAndFollow = (id: string, route: string, call = DEF_CALLS[0]) => {
    const play = H.newPlay(M, PLAYBOOK.find((p) => p.id === id)!, call, mulberry32(3));
    const r = play.off.find((o) => o.routeName === route && o.role !== 'RB')!;
    play.snap();
    return { play, r };
  };

  it('a slant has his head down on the stem and around out of the break', () => {
    const { play, r } = snapAndFollow('slant-flat', 'slant');
    let first = -1;
    let after = -1;
    for (let t = 0; t < 1.3; t += STEP) {
      play.update(STEP, fakeInput, cam);
      if (first < 0) first = r.eyes;
      if (r.routeIdx >= 1 && play.time - r.lookAt > 0.4) after = r.eyes;
    }
    expect(first).toBe(0);
    expect(after).toBe(1);
  });
  it('a go route only looks back once he is well downfield', () => {
    const { play, r } = snapAndFollow('four-verts', 'go');
    for (let t = 0; t < 4 && r.pos.x - r.start.x < 11.5; t += STEP) {
      play.update(STEP, fakeInput, cam);
      expect(r.eyes).toBe(0);
    }
  });
  it('a receiver with his head down finds the ball later, less so with good hands', () => {
    const { r } = snapAndFollow('slant-flat', 'slant');
    r.eyes = 1;
    expect(receiverFind(r, 2)).toBe(2);
    r.eyes = 0;
    const late = receiverFind(r, 2);
    expect(late).toBeGreaterThan(2.3);
    r.r = { ...r.r, cth: 99 };
    expect(receiverFind(r, 2)).toBeLessThan(late);
    r.findAt = 2;
    expect(readyAt(r, 2 + FIND.settle)).toBe(1);
    expect(readyAt(r, 1.9)).toBe(0);
  });
  it('zone defenders read the QB; a man defender trailing with his back turned does not', () => {
    const man = DEF_CALLS.find((c) => c.coverage === 'man' && !c.situational)!;
    const zone = DEF_CALLS.find((c) => c.coverage === 'zone' && !c.situational)!;
    const z = snapAndFollow('four-verts', 'go', zone);
    for (let t = 0; t < 1.5; t += STEP) z.play.update(STEP, fakeInput, cam);
    expect(z.play.def.filter((d) => d.assign?.kind !== 'man').every((d) => eyesOf(z.play, d) === 1)).toBe(true);
    const m = snapAndFollow('four-verts', 'go', man);
    for (let t = 0; t < 2; t += STEP) m.play.update(STEP, fakeInput, cam);
    const trailing = m.play.def.filter((d) => d.assign?.kind === 'man' && d.turned && d.role === 'CB' && !d.manTarget?.isBlocker);
    expect(trailing.length).toBeGreaterThan(0);
    for (const d of trailing) expect(d.eyes).toBe(0);
  });
});

describe('throw types on the field', () => {
  const M = H.referenceMatchup();
  const pass = PLAYBOOK.filter((p) => p.kind === 'pass');
  const zone = DEF_CALLS.filter((c) => c.coverage === 'zone' && !c.situational);
  const reps = (kind: 'bullet' | 'touch' | 'lob', n: number, dl = false) => {
    const rng = mulberry32(21);
    let tips = 0;
    for (let i = 0; i < n; i++) {
      const p = H.passRep(M, pass[i % pass.length], zone[i % zone.length], 1.6, rng, undefined, H.LOS, kind).play;
      if (p.passTipped && (!dl || p.tipper?.role === 'DL')) tips++;
    }
    return tips;
  };
  it('a bullet from the pocket gets batted at the line; a touch pass mostly clears it', () => {
    expect(reps('bullet', 200, true)).toBeGreaterThan(reps('touch', 200, true) * 2);
  });
  it('bullets get tipped by the underneath defenders sometimes; lobs sail over them', () => {
    const bullet = reps('bullet', 200);
    const lob = reps('lob', 200);
    expect(bullet).toBeGreaterThan(0);
    expect(lob).toBeLessThan(bullet);
  });
});

describe('crowds, placement and the turn after the catch', () => {
  const o = { pos: 0.9, cth: 80, cit: 75 };
  const D = (pos: number) => ({ pos, cth: 70, prc: 75 });

  it('one defender in a list plays exactly as one defender', () => {
    for (const jump of [0, 1]) expect(catchOdds(o, [D(0.8)], jump)).toEqual(catchOdds(o, D(0.8), jump));
    expect(catchOdds(o, [], 0)).toEqual(catchOdds(o, null, 0));
  });

  it('every extra defender under the ball costs catches and adds picks, on every throw type', () => {
    for (const jump of [0, 1]) {
      const one = catchOdds(o, [D(0.9)], jump);
      const two = catchOdds(o, [D(0.9), D(0.9)], jump);
      const three = catchOdds(o, [D(0.9), D(0.9), D(0.8)], jump);
      expect(two.catch).toBeLessThan(one.catch * 0.6);
      expect(three.catch).toBeLessThan(two.catch);
      expect(two.int).toBeGreaterThan(one.int * 1.4);
      expect(three.int).toBeGreaterThan(two.int);
    }
    // Into a double, a touch pass is mostly broken up or picked.
    const dbl = catchOdds(o, [D(0.9), D(0.9)]);
    expect(dbl.catch).toBeLessThan(0.3);
    expect(dbl.int).toBeGreaterThan(0.12);
  });

  it('a ball led away from the crowd stays safe: defenders at the edge of their reach barely count', () => {
    const alone = catchOdds(o, [D(0.5)]);
    const crowd = catchOdds(o, [D(0.5), D(0.3), D(0.3)]);
    expect(crowd.catch).toBeGreaterThan(alone.catch - 0.04);
    expect(crowd.int).toBeLessThan(alone.int + 0.02);
  });

  it('grades the catch from placement: in stride, clean, a reach for a ball behind him, a dive', () => {
    const track = { at: { x: 50, y: 20 }, dir: { x: 1, y: 0 } };
    expect(catchGrade(track, { x: 50.5, y: 20.3 }, 0.9, 7, false).grade).toBe('stride');
    expect(catchGrade(track, { x: 50.5, y: 20.3 }, 0.9, 2, false).grade).toBe('clean');
    const behind = catchGrade(track, { x: 47, y: 20 }, 0.9, 5, false);
    expect(behind.grade).toBe('reach');
    expect(behind.behind).toBeCloseTo(3);
    expect(catchGrade(track, { x: 50, y: 20 }, 0.2, 7, false).grade).toBe('reach');
    expect(catchGrade(track, { x: 50, y: 20 }, 0.9, 7, true).grade).toBe('dive');
    expect(catchOdds({ ...o, lunge: 1 }, null).catch).toBeLessThan(catchOdds(o, null).catch);
  });

  it('squared up to the QB he turns before he runs; caught in stride he barely slows', () => {
    const wr = () => {
      const p = H.newPlay(H.referenceMatchup(), PLAYBOOK.find((q) => q.kind === 'pass')!, DEF_CALLS[0], mulberry32(1)).off.find((q) => q.role === 'WR')!;
      p.vel = { x: 0, y: 0 };
      p.want = { x: maxSpeed(p), y: 0 };
      return p;
    };
    const run = (p: ReturnType<typeof wr>, t: number) => {
      for (let s = 0; s < t / STEP; s++) stepPlayer(p, STEP);
      return p.vel.x;
    };
    const squared = wr();
    startCatch(squared, { x: -1, y: 0 });
    const stride = wr();
    stride.vel = { x: maxSpeed(stride), y: 0 };
    startCatch(stride, { x: 1, y: 0 }, PLACEMENT.strideRamp);
    const fresh = wr(); // no catch state: how a back gets going
    expect(run(squared, 0.4)).toBeLessThan(run(fresh, 0.4) * 0.5);
    expect(squared.facing).toBe(1); // turned around by then
    expect(run(stride, 0.4)).toBeGreaterThan(maxSpeed(stride) * 0.97);
    run(squared, 1.5);
    expect(squared.hips).toBeNull();
    expect(hipTurnRate({ ...squared, r: { ...squared.r, acc: 95, rte: 95 } })).toBeGreaterThan(hipTurnRate({ ...squared, r: { ...squared.r, acc: 60, rte: 60 } }));
  });
});
