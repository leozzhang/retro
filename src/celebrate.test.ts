import { describe, expect, it } from 'vitest';
import { STEP } from './engine/constants';
import { rosterFor } from './data/depth';
import { TEAMS } from './data/teams';
import { makePlayer, poseOf, stepPlayer, tickTimers } from './sim/player';
import { CELEBRATE, celebrateWant, spinTurns, startCelebration, type Celebration } from './sim/celebrate';
import type { Pose, Uniform } from './render/sprites';

const UNI = { key: 't' } as Uniform;

/** A scorer crossing at full speed: run him through the celebration and return what he did. */
function score(kind: Celebration, dir: 1 | -1 = 1) {
  const rp = Object.values(rosterFor(TEAMS[0])).find((r) => r.role === 'WR')!;
  const p = makePlayer('off', rp, UNI, { x: 110, y: 20 });
  p.vel = { x: dir * 8.5, y: 0.5 };
  startCelebration(p, [kind]);
  const poses: Pose[] = [];
  let stoppedAt = Infinity;
  for (let t = 0; t < 2.6; t += STEP) {
    tickTimers(p, STEP);
    p.want = celebrateWant(p);
    stepPlayer(p, STEP);
    const pose = poseOf(p, false);
    if (poses[poses.length - 1] !== pose) poses.push(pose);
    if (p.celebrate!.t > 0 && stoppedAt === Infinity) stoppedAt = t;
  }
  return { p, poses, stoppedAt };
}

describe('touchdown celebrations', () => {
  it('runs it out with running frames, stops a few yards deep, then celebrates', () => {
    const { p, poses, stoppedAt } = score('spike');
    expect(poses[0]).toMatch(/^run/);
    expect(Math.abs(p.pos.x - 110)).toBeLessThan(CELEBRATE.depth + 1.5);
    expect(stoppedAt).toBeLessThan(1.2);
    const cel = poses.filter((q) => !q.startsWith('run') && q !== 'stand');
    expect(cel).toEqual(['spikeUp', 'spikeDown', 'cheer']);
    expect(p.celebrate!.released).toBe(true);
  });

  it('leaps twice, and spins the ball, either way down the field', () => {
    expect(score('leap', -1).poses.filter((q) => q === 'leap')).toHaveLength(2);
    const sp = score('spin', -1);
    expect(sp.p.pos.x).toBeLessThan(110);
    expect(sp.poses.filter((q) => !q.startsWith('run') && q !== 'stand')).toEqual(['spinBall', 'cheer']);
    // The ball turns fast, then eases off.
    const c = sp.p.celebrate!;
    const at = (t: number) => spinTurns({ ...c, t })!;
    expect(at(0.6) - at(0.4)).toBeGreaterThan(2 * (at(2.2) - at(2.0)));
    expect(at(2.4)).toBeGreaterThan(8);
  });
});
