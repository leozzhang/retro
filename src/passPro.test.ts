import { describe, expect, it } from 'vitest';
import { CORE_CALLS, defCallById } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { STEP } from './engine/constants';
import { dist, mulberry32 } from './engine/math';
import * as H from './harness';
import { arcAngle, protecting } from './sim/passPro';

const M = H.referenceMatchup();
const play = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const roles = (call = CORE_CALLS[0], tags = {}) => {
  const p = H.newPlay(M, play('four-verts'), call, mulberry32(1), H.LOS, { tags });
  p.snap();
  return p;
};

describe('pass rush roles and protection', () => {
  it('the outermost rusher each side is the edge; the tackles rush the A and B gaps', () => {
    const p = roles();
    const of = (slot: string) => p.def.find((d) => d.slot === slot)!.rushRole!;
    expect(of('DE1').kind).toBe('edge');
    expect(of('DE2').kind).toBe('edge');
    expect(of('DE1').side).not.toBe(of('DE2').side);
    expect([of('DT1').kind, of('DT2').kind].sort()).toEqual(['aGap', 'bGap']);
  });

  it('on a fire zone the end drops and the blitzing backer is the edge on his side', () => {
    const p = roles(defCallById('fire-zone'));
    expect(p.def.find((d) => d.slot === 'DE1')!.rushRole).toBeNull();
    expect(p.def.find((d) => d.slot === 'WLB')!.rushRole!.kind).toBe('edge');
  });

  it('a TE game: the tackle crashes and the end loops on that side', () => {
    const p = roles(CORE_CALLS[0], { game: { kind: 'TE', side: 1 } });
    const by = p.ballY;
    const crash = p.def.find((d) => d.rushRole?.game === 'crash')!;
    const loop = p.def.find((d) => d.rushRole?.game === 'loop')!;
    expect(crash.role).toBe('DL');
    expect(crash.slot.startsWith('DT')).toBe(true);
    expect(loop.slot.startsWith('DE')).toBe(true);
    expect(crash.pos.y - by).toBeGreaterThan(0);
  });

  it('every lineman gets a protection job, and every lineman rushing at the snap is somebody\'s man', () => {
    const p = roles();
    const ol = p.off.filter((o) => o.role === 'OL');
    expect(ol.every((o) => o.pro)).toBe(true);
    for (const d of p.def.filter((d) => d.role === 'DL' && d.rushRole)) expect(p.off.some((o) => o.mark === d)).toBe(true);
  });

  it('designed runs keep the old rules: no roles, no protection call', () => {
    const p = H.newPlay(M, play('inside-zone'), CORE_CALLS[0], mulberry32(1));
    p.snap();
    expect(protecting(p)).toBe(false);
    expect(p.def.some((d) => d.rushRole)).toBe(false);
    expect(p.off.some((o) => o.pro)).toBe(false);
  });
});

describe('the pocket', () => {
  it('forms a connected cup: tackles deeper than the interior, edges coming around but not past the QB', () => {
    const rng = mulberry32(5);
    let cup = 0;
    let edge = 0;
    let n = 0;
    for (let i = 0; i < 20; i++) {
      const r = H.pocketRep(M, play('four-verts'), CORE_CALLS[0], rng, 2.0, 2.1);
      if (Number.isNaN(r.shape.qb)) continue;
      n++;
      cup += r.shape.tackles - r.shape.interior;
      edge += r.shape.edges.reduce((a, b) => a + b, 0) / Math.max(1, r.shape.edges.length);
    }
    expect(n).toBeGreaterThan(15);
    expect(cup / n).toBeGreaterThan(1.5);
    expect(cup / n).toBeLessThan(4.5);
    expect(edge / n).toBeGreaterThan(35);
    expect(edge / n).toBeLessThan(100);
  });

  it('a blocked rusher keeps working toward a QB who stands still', () => {
    const p = H.newPlay(M, play('four-verts'), CORE_CALLS[0], mulberry32(2));
    p.snap();
    const de = p.def.find((d) => d.slot === 'DE1')!;
    const at: number[] = [];
    for (let t = 0; t < 3 && p.phase !== 'over'; t += STEP) {
      p.update(STEP, H.fakeInput, H.cam);
      const since = p.time - p.snapTime;
      if (Math.abs(since - 1) < STEP / 2 || Math.abs(since - 2) < STEP / 2 || Math.abs(since - 2.8) < STEP / 2) at.push(dist(de.pos, p.qb.pos));
    }
    expect(at.length).toBe(3);
    expect(at[1]).toBeLessThan(at[0]);
    expect(at[2]).toBeLessThan(at[1]);
  });

  it('arcAngle runs from 0 in front of the QB to 180 behind him', () => {
    const p = H.newPlay(M, play('four-verts'), CORE_CALLS[0], mulberry32(1));
    const d = p.def[0];
    const qb = { x: 30, y: 26 };
    d.pos = { x: 33, y: 26 };
    expect(arcAngle(d, qb)).toBeCloseTo(0);
    d.pos = { x: 30, y: 30 };
    expect(arcAngle(d, qb)).toBeCloseTo(90);
    d.pos = { x: 27, y: 26 };
    expect(arcAngle(d, qb)).toBeCloseTo(180);
  });
});
