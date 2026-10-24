import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEF_CALLS, type DefCall } from './data/defenses';
import { PLAYBOOK, type PlayDef } from './data/plays';
import { generateRoster, TEAMS } from './data/teams';
import { Camera } from './engine/camera';
import { STEP } from './engine/constants';
import type { Input } from './engine/input';
import { add, dist, mulberry32, scale, type Rng } from './engine/math';
import { Play } from './game/playState';
import { isEligible } from './sim/player';

const fakeInput = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false },
  axis: () => ({ x: 0, y: 0 }),
  isDown: () => false,
  hit: () => false,
  endStep: () => {},
} as unknown as Input;

const off = TEAMS[0];
const def = TEAMS[1];
const offR = generateRoster(off);
const defR = generateRoster(def);
const cam = new Camera();
const LOS = 35;
const REPS = 120;

function newPlay(playDef: PlayDef, call: DefCall, rng: Rng): Play {
  return new Play({
    offTeam: off, defTeam: def, offRoster: offR, defRoster: defR, play: playDef, defCall: call,
    press: { CB1: rng() < 0.35, CB2: rng() < 0.35 }, los: LOS, ballY: 26.6, rng,
  });
}

/** Auto-QB throws to the receiver with the most separation after a fixed hold time. */
function passRows(label: string, plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  for (const call of DEF_CALLS) {
    for (const holdTime of [1.2, 2.2, 3.2]) {
      const stats = { n: 0, comp: 0, int: 0, sack: 0, yards: 0, sackT: 0, pbu: 0, yac: 0, td: 0 };
      for (let i = 0; i < REPS; i++) {
        const play = newPlay(plays[i % plays.length], call, rng);
        play.snap();
        let thrown = false;
        let catchX = 0;
        for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
          if (!thrown && play.phase === 'live' && play.time - play.snapTime >= holdTime) {
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
        if (o.type !== 'int' && o.type !== 'pick6') stats.yards += o.spot - LOS;
      }
      const att = stats.n - stats.sack;
      rows.push(
        `${label} ${call.name.padEnd(15)} hold ${holdTime}s | comp ${((stats.comp / att) * 100).toFixed(0)}% ` +
          `int ${((stats.int / att) * 100).toFixed(1)}% pbu ${stats.pbu} sack ${stats.sack}` +
          `${stats.sack ? ` (avg ${(stats.sackT / stats.sack).toFixed(1)}s)` : ''} | ypp ${(stats.yards / stats.n).toFixed(1)} yac ${(stats.yac / Math.max(1, stats.comp)).toFixed(1)} td ${stats.td}`,
      );
    }
  }
  return rows;
}

/** Auto-QB hands off (or pitches on the toss) as soon as it's on; `autoRun` carries the ball. */
function runRows(plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  const all = { n: 0, yards: 0, stuff: 0, boom: 0, list: [] as number[] };
  for (const playDef of plays) {
    for (const call of DEF_CALLS) {
      const s = { n: 0, yards: 0, stuff: 0, boom: 0, fum: 0, td: 0, none: 0 };
      for (let i = 0; i < REPS / 2; i++) {
        const play = newPlay(playDef, call, rng);
        play.snap();
        for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
          const opt = play.handoffOption();
          if (opt === 'handoff' || (opt === 'pitch' && playDef.id === 'toss')) play.handoff();
          if (play.handedOff) play.controlled = null;
          play.update(STEP, fakeInput, cam);
        }
        const o = play.outcome;
        if (!o) continue;
        if (!play.handedOff) {
          s.none++;
          continue;
        }
        const yds = o.spot - LOS;
        s.n++;
        s.yards += yds;
        all.list.push(yds);
        if (yds <= 0) s.stuff++;
        if (yds >= 10) s.boom++;
        if (o.type === 'fumble') s.fum++;
        if (o.type === 'td') s.td++;
      }
      all.n += s.n;
      all.yards += s.yards;
      all.stuff += s.stuff;
      all.boom += s.boom;
      const pct = (k: number) => `${((k / Math.max(1, s.n)) * 100).toFixed(0)}%`;
      rows.push(
        `RUN  ${playDef.name.padEnd(13)} ${call.name.padEnd(15)} | ypc ${(s.yards / Math.max(1, s.n)).toFixed(1)} ` +
          `stuff ${pct(s.stuff)} 10+ ${pct(s.boom)} fum ${s.fum} td ${s.td}${s.none ? ` no-handoff ${s.none}` : ''}`,
      );
    }
  }
  const sorted = [...all.list].sort((a, b) => a - b);
  rows.push(
    `RUN  ALL | ypc ${(all.yards / all.n).toFixed(1)} median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ` +
      `stuff ${((all.stuff / all.n) * 100).toFixed(0)}% 10+ ${((all.boom / all.n) * 100).toFixed(0)}%`,
  );
  return rows;
}

// Run with `npm run balance`; results go to balance.txt.
it.runIf(process.env.npm_lifecycle_event === 'balance')('balance report', () => {
  const rng = mulberry32(42);
  const pass = PLAYBOOK.filter((p) => p.kind === 'pass');
  const pa = PLAYBOOK.filter((p) => p.kind === 'pa' && p.block === 'pass');
  const runs = PLAYBOOK.filter((p) => p.kind === 'run' && p.id !== 'qb-sneak');
  const rows = [...passRows('PASS', pass, rng), '', ...passRows('PA  ', pa, rng), '', ...runRows(runs, rng)];
  writeFileSync(process.env.BAL_OUT ?? 'balance.txt', rows.join('\n'));
});
