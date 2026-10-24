import { clamp, lerp, norm, scale, sub, type Rng, type Vec } from '../engine/math';
import type { Player } from './player';
import { runBlockValue } from '../data/ratings';

/**
 * Side-agnostic blocking for special teams: `blockers` lock onto `targets`
 * (either side can block) using the same `engaged` / `engagedBy` fields as the
 * scrimmage engagements in `Play`, which keeps its own tuned copy.
 */

export function release(d: Player): void {
  for (const b of d.engagedBy) b.engaged = null;
  d.engagedBy = [];
}

/** Lock any free blocker onto a target within reach. `canBlock` filters pairs (assignments). */
export function formEngagements(blockers: Player[], targets: Player[], canBlock: (b: Player, d: Player) => boolean = () => true): void {
  for (const b of blockers) {
    if (b.down || b.engaged || b.stun > 0) continue;
    for (const d of targets) {
      if (d.down || d.noEngage > 0 || d.engagedBy.length >= 2 || !canBlock(b, d)) continue;
      if (Math.hypot(b.pos.x - d.pos.x, b.pos.y - d.pos.y) < 1.0) {
        b.engaged = d;
        d.engagedBy.push(b);
        break;
      }
    }
  }
}

export interface ShedTuning {
  /** Base shed rate per second for an even matchup. */
  base: number;
  /** Seconds over which blocks go from sticky to their full shed rate. */
  ramp: number;
  /** Time the engagement began counting from (the snap or the kick). */
  since: number;
  /** Blocker advantage, subtracted from the target's power (like `RUN_BLOCK_EDGE` in `Play`). */
  edge?: number;
  /** Targets farther than this from their goal peel off the block to pursue (as on the far side of a run). */
  peel?: number;
}

/** Push and shed: targets drive toward their goal; the better player wins over time. */
export function updateEngagements(targets: Player[], goalOf: (d: Player) => Vec, now: number, dt: number, rng: Rng, t: ShedTuning): void {
  for (const d of targets) {
    if (!d.engagedBy.length) continue;
    d.engagedBy = d.engagedBy.filter((b) => !b.down && b.engaged === d);
    if (!d.engagedBy.length || d.down) {
      release(d);
      continue;
    }
    const n = d.engagedBy.length;
    const dir = norm(sub(goalOf(d), d.pos));
    const blk = d.engagedBy.reduce((s, b) => s + runBlockValue(b.r), 0) / n;
    const power = d.r.bsh * 0.6 + d.r.spd * 0.4 - blk - (n - 1) * 15 - (t.edge ?? 0);
    const push = clamp(0.8 + power * 0.06, -0.8, 2.2);
    d.want = scale(dir, push);
    for (const b of d.engagedBy) b.want = scale(dir, push);
    const ramp = Math.min(1, Math.max(0, now - t.since) / t.ramp) ** 2;
    let shed = (clamp(t.base + power * 0.015, 0.08, 2.5) * (0.25 + 0.75 * ramp)) / Math.pow(n, 1.5);
    if (t.peel !== undefined && Math.hypot(d.pos.x - goalOf(d).x, d.pos.y - goalOf(d).y) > t.peel) shed = Math.max(shed, 2.5);
    if (rng() < shed * dt) {
      for (const b of d.engagedBy) b.stun = 0.35;
      release(d);
      d.noEngage = 1.1;
    }
  }
}

/** Keep each blocker between its target and the target's goal. */
export function anchorBlockers(targets: Player[], goalOf: (d: Player) => Vec): void {
  for (const d of targets) {
    const n = d.engagedBy.length;
    if (!n) continue;
    const dir = norm(sub(goalOf(d), d.pos));
    d.engagedBy.forEach((b, i) => {
      const off = n === 1 ? 0 : i === 0 ? -0.45 : 0.45;
      const ax = d.pos.x + dir.x * 0.85 - dir.y * off;
      const ay = d.pos.y + dir.y * 0.85 + dir.x * off;
      b.pos = { x: lerp(b.pos.x, ax, 0.35), y: lerp(b.pos.y, ay, 0.35) };
      b.facing = d.pos.x >= b.pos.x ? 1 : -1;
    });
    d.facing = d.engagedBy[0].pos.x >= d.pos.x ? 1 : -1;
  }
}
