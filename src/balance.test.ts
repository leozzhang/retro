import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { generateRoster, TEAMS } from './data/teams';
import { Camera } from './engine/camera';
import { STEP } from './engine/constants';
import type { Input } from './engine/input';
import { add, dist, mulberry32, scale } from './engine/math';
import { Play } from './game/playState';
import { isEligible } from './sim/player';

const fakeInput = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false },
  axis: () => ({ x: 0, y: 0 }),
  isDown: () => false,
  hit: () => false,
  endStep: () => {},
} as unknown as Input;

// AI balance harness: an auto-QB throws to the most open receiver after a fixed hold time.
// Run with `npm run balance`; results go to balance.txt.
it.runIf(process.env.npm_lifecycle_event === 'balance')('balance report', () => {
  const rng = mulberry32(42);
  const off = TEAMS[0];
  const def = TEAMS[1];
  const offR = generateRoster(off);
  const defR = generateRoster(def);
  const cam = new Camera();
  const rows: string[] = [];
  for (const call of DEF_CALLS) {
    for (const holdTime of [1.2, 2.2, 3.2]) {
      const stats = { n: 0, comp: 0, int: 0, sack: 0, yards: 0, sackT: 0, pbu: 0, yac: 0, td: 0 };
      for (let i = 0; i < 120; i++) {
        const playDef = PLAYBOOK[i % PLAYBOOK.length];
        const play = new Play({
          offTeam: off, defTeam: def, offRoster: offR, defRoster: defR, play: playDef, defCall: call,
          press: { CB1: rng() < 0.35, CB2: rng() < 0.35 }, los: 35, ballY: 26.6, rng,
        });
        play.snap();
        let thrown = false;
        let catchX = 0;
        for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
          if (!thrown && play.phase === 'live' && play.time - play.snapTime >= holdTime) {
            // throw to the receiver with the most separation, leading him
            let best = null as null | { p: (typeof play.off)[number]; sep: number };
            for (const o of play.off) {
              if (!isEligible(o) || o.isBlocker) continue;
              let sep = Infinity;
              for (const d of play.def) sep = Math.min(sep, dist(d.pos, o.pos));
              if (!best || sep > best.sep) best = { p: o, sep };
            }
            if (best) {
              const lead = dist(play.qb.pos, best.p.pos) / 22;
              (play as any).throwBall(add(best.p.pos, scale(best.p.vel, lead)));
              thrown = true;
            }
          }
          const before = play.phase;
          play.update(STEP, fakeInput, cam);
          if (before === 'air' && play.phase === 'run') catchX = play.carrier!.pos.x;
        }
        const o = play.outcome;
        if (!o) continue;
        stats.n++;
        if (o.type === 'sack') {
          stats.sack++;
          stats.sackT += play.time - play.snapTime;
        }
        if (o.type === 'int' || o.type === 'pick6') stats.int++;
        if (o.type === 'incomplete' && o.sub.startsWith('Broken')) stats.pbu++;
        if (play.thrown && ['tackle', 'oob', 'td'].includes(o.type)) {
          stats.comp++;
          stats.yac += o.spot - catchX;
          if (o.type === 'td') stats.td++;
        }
        if (o.type !== 'int' && o.type !== 'pick6') stats.yards += o.spot - 35;
      }
      const att = stats.n - stats.sack;
      rows.push(
        `${call.name.padEnd(15)} hold ${holdTime}s | comp ${((stats.comp / att) * 100).toFixed(0)}% ` +
          `int ${((stats.int / att) * 100).toFixed(1)}% pbu ${stats.pbu} sack ${stats.sack}` +
          `${stats.sack ? ` (avg ${(stats.sackT / stats.sack).toFixed(1)}s)` : ''} | ypp ${(stats.yards / stats.n).toFixed(1)} yac ${(stats.yac / Math.max(1, stats.comp)).toFixed(1)} td ${stats.td}`,
      );
    }
  }
  writeFileSync(process.env.BAL_OUT ?? 'balance.txt', rows.join('\n'));
});
