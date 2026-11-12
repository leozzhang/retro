/**
 * RUNFIT (`npm run runfit`, also in `npm run balance`; docs/RUNGAME.md): how the run game is stopped.
 * For each run, who made the tackle (a free man, one who got off a block, one still on it, the backside
 * chase, or downfield), stuffs and TFLs, and the cutback share. Then the ablations: the same run with one
 * block taken away (`PlaySetup.ablate`), which is what that block is worth.
 */
import { DEF_CALLS, type DefCall } from './data/defenses';
import { PLAYBOOK, type PlayDef } from './data/plays';
import type { OffSlot } from './data/teams';
import { mulberry32 } from './engine/math';
import * as H from './harness';

export const RUNFIT = {
  reps: 60,
  seed: 71,
  /** The calls each run is measured against: the light boxes, the base zones, a loaded box and the short-yardage fronts. */
  calls: ['2-man', 'c1-robber', 'c3', 'c4', 'c3-sky', 'bear'],
  plays: [
    'inside-zone', 'split-zone', 'outside-zone', 'duo', 'power', 'power-o', 'counter', 'trey-counter', 'ace-counter',
    'iso', 'trap', 'toss', 'lead-toss', 'strong-i-toss', 'pin-pull', 'draw',
  ],
};

/** The ablations: a play, and the blockers who stand down. */
export const ABLATIONS: { play: string; label: string; ablate: { backside?: number; slots?: OffSlot[] } }[] = [
  { play: 'power', label: 'no hinge (backside tackle)', ablate: { backside: 1 } },
  { play: 'power-o', label: 'no hinge (backside tackle)', ablate: { backside: 1 } },
  { play: 'inside-zone', label: 'no backside cutoff (2 OL)', ablate: { backside: 2 } },
  { play: 'outside-zone', label: 'no backside cutoff (2 OL)', ablate: { backside: 2 } },
  { play: 'duo', label: 'no backside block (1 OL)', ablate: { backside: 1 } },
  { play: 'counter', label: 'no backside block (1 OL)', ablate: { backside: 1 } },
  { play: 'split-zone', label: 'no slice (TE)', ablate: { slots: ['TE'] } },
];

export interface RunStats {
  n: number;
  ypc: number;
  median: number;
  stuff: number;
  tfl: number;
  four: number;
  ten: number;
  cutback: number;
  how: Record<H.RunHow, number>;
}

const HOWS: H.RunHow[] = ['free', 'shed', 'blocked', 'backside', 'downfield', 'none'];

export function runStats(p: PlayDef, calls: DefCall[], reps: number, seed: number, ablate?: (typeof ABLATIONS)[number]['ablate']): RunStats {
  const m = H.referenceMatchup();
  const rng = mulberry32(seed);
  const yds: number[] = [];
  const how = Object.fromEntries(HOWS.map((h) => [h, 0])) as Record<H.RunHow, number>;
  let cut = 0;
  for (const c of calls) {
    for (let i = 0; i < reps; i++) {
      const r = H.runRep(m, p, c, rng, H.LOS, ablate ? { ablate } : undefined);
      if (!r.o || !r.ran) continue;
      yds.push(r.yds);
      how[r.how]++;
      if (r.cutback) cut++;
    }
  }
  const n = Math.max(1, yds.length);
  const s = [...yds].sort((a, b) => a - b);
  for (const h of HOWS) how[h] /= n;
  return {
    n: yds.length,
    ypc: yds.reduce((a, b) => a + b, 0) / n,
    median: s[s.length >> 1] ?? 0,
    stuff: yds.filter((y) => y <= 0).length / n,
    tfl: yds.filter((y) => y < 0).length / n,
    four: yds.filter((y) => y >= 4).length / n,
    ten: yds.filter((y) => y >= 10).length / n,
    cutback: cut / n,
    how,
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

function line(s: RunStats): string {
  return `ypc ${s.ypc.toFixed(1).padStart(4)} med ${s.median.toFixed(1).padStart(4)} stuff ${pct(s.stuff)} tfl ${pct(s.tfl)} 4+ ${pct(s.four)} 10+ ${pct(s.ten)} cutback ${pct(s.cutback)}`;
}

/** The report's lines. */
export function runfitReport(reps = RUNFIT.reps, seed = RUNFIT.seed, only?: string[]): string[] {
  const calls = RUNFIT.calls.map((id) => DEF_CALLS.find((c) => c.id === id)!);
  const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
  const out = [
    `RUNFIT: who stops each run, ${reps} snaps a call against ${RUNFIT.calls.join(', ')} (the reference matchup, 1st and 10).`,
    'Tackled by: FREE nobody ever blocked him; SHED he got off a block; BLOCKED still on one (an arm tackle); BACK he lined up on the far side of the play (the chase); DOWN past 5 yd. Targets in RUNGAME.md.',
  ];
  for (const id of RUNFIT.plays) {
    if (only && !only.includes(id)) continue;
    const s = runStats(book(id), calls, reps, seed);
    out.push(`RUNFIT ${book(id).name.padEnd(17)}| ${line(s)} | free ${pct(s.how.free)} shed ${pct(s.how.shed)} blocked ${pct(s.how.blocked)} back ${pct(s.how.backside)} down ${pct(s.how.downfield)}`);
  }
  out.push('', 'ABLATE: the same run with one block taken away (it stands down). What the block is worth: the drop from the first line to the second.');
  for (const a of ABLATIONS) {
    if (only && !only.includes(a.play)) continue;
    const base = runStats(book(a.play), calls, reps, seed);
    const cut = runStats(book(a.play), calls, reps, seed, a.ablate);
    out.push(`ABLATE ${book(a.play).name.padEnd(17)} ${'full'.padEnd(27)}| ${line(base)} back ${pct(base.how.backside)}`);
    out.push(`ABLATE ${book(a.play).name.padEnd(17)} ${a.label.padEnd(27)}| ${line(cut)} back ${pct(cut.how.backside)} | ypc ${(cut.ypc - base.ypc).toFixed(1)}, 4+ ${Math.round((cut.four - base.four) * 100)} pts`);
  }
  return out;
}
