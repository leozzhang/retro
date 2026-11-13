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
  /** The short-yardage section: every short-yardage run against these, 3rd and 1. */
  shortCalls: ['2-man', 'bear', 'goal'],
  shortTarget: { run: '65-70% vs bear and goal', sneak: '83-87% (75-80% into a goal-line front)' },
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
  /** Gained 1+: the 3rd-and-1 conversion. */
  first: number;
  four: number;
  ten: number;
  cutback: number;
  how: Record<H.RunHow, number>;
  /** Who made the tackle, by slot (shares). */
  by: Record<string, number>;
}

const HOWS: H.RunHow[] = ['free', 'shed', 'blocked', 'backside', 'downfield', 'none'];

export function runStats(p: PlayDef, calls: DefCall[], reps: number, seed: number, ablate?: (typeof ABLATIONS)[number]['ablate']): RunStats {
  const m = H.referenceMatchup();
  const rng = mulberry32(seed);
  const yds: number[] = [];
  const how = Object.fromEntries(HOWS.map((h) => [h, 0])) as Record<H.RunHow, number>;
  const by: Record<string, number> = {};
  let cut = 0;
  for (const c of calls) {
    for (let i = 0; i < reps; i++) {
      const r = H.runRep(m, p, c, rng, H.LOS, ablate ? { ablate } : undefined);
      if (!r.o || !r.ran) continue;
      yds.push(r.yds);
      how[r.how]++;
      if (r.cutback) cut++;
      const t = r.play.tackler;
      if (t && r.o.type === 'tackle') by[t.slot] = (by[t.slot] ?? 0) + 1;
    }
  }
  const n = Math.max(1, yds.length);
  const s = [...yds].sort((a, b) => a - b);
  for (const h of HOWS) how[h] /= n;
  for (const k of Object.keys(by)) by[k] /= n;
  return {
    n: yds.length,
    ypc: yds.reduce((a, b) => a + b, 0) / n,
    median: s[s.length >> 1] ?? 0,
    stuff: yds.filter((y) => y <= 0).length / n,
    tfl: yds.filter((y) => y < 0).length / n,
    first: yds.filter((y) => y >= 1).length / n,
    four: yds.filter((y) => y >= 4).length / n,
    ten: yds.filter((y) => y >= 10).length / n,
    cutback: cut / n,
    how,
    by,
  };
}

/** The slots that make the most tackles, with their shares. */
function topTacklers(s: RunStats, k = 3): string {
  return Object.entries(s.by).sort((a, b) => b[1] - a[1]).slice(0, k).map(([slot, x]) => `${slot} ${Math.round(x * 100)}%`).join(' ');
}

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

function line(s: RunStats): string {
  return `ypc ${s.ypc.toFixed(1).padStart(4)} med ${s.median.toFixed(1).padStart(4)} stuff ${pct(s.stuff)} tfl ${pct(s.tfl)} 4+ ${pct(s.four)} 10+ ${pct(s.ten)} cutback ${pct(s.cutback)}`;
}

/** The report's lines. */
export function runfitReport(reps = RUNFIT.reps, seed = RUNFIT.seed, only?: string[], callIds = RUNFIT.calls): string[] {
  const calls = callIds.map((id) => DEF_CALLS.find((c) => c.id === id)!);
  const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
  const out = [
    `RUNFIT: who stops each run, ${reps} snaps a call against ${callIds.join(', ')} (the reference matchup, 1st and 10).`,
    'Tackled by: FREE nobody ever blocked him; SHED he got off a block; BLOCKED still on one (an arm tackle); BACK he lined up on the far side of the play (the chase); DOWN past 5 yd. Targets in RUNGAME.md.',
  ];
  // RUNFIT_ONLY can also name a run outside the fixed list (a new play being balanced); the default report is unchanged.
  const extra = only?.filter((id) => !RUNFIT.plays.includes(id) && PLAYBOOK.find((p) => p.id === id)?.kind === 'run') ?? [];
  for (const id of [...RUNFIT.plays, ...extra]) {
    if (only && !only.includes(id)) continue;
    const s = runStats(book(id), calls, reps, seed);
    out.push(`RUNFIT ${book(id).name.padEnd(17)}| ${line(s)} | free ${pct(s.how.free)} shed ${pct(s.how.shed)} blocked ${pct(s.how.blocked)} back ${pct(s.how.backside)} down ${pct(s.how.downfield)} | ${topTacklers(s)}`);
  }
  out.push('', `SHORT: 3rd and 1 (a gain of 1+) against the short-yardage fronts, and who makes the stop. Targets: runs ${RUNFIT.shortTarget.run}, the sneak ${RUNFIT.shortTarget.sneak} (TARGETS.md).`);
  for (const p of PLAYBOOK.filter((q) => q.short && q.kind === 'run')) {
    if (only && !only.includes(p.id)) continue;
    const cells = RUNFIT.shortCalls.map((cid) => {
      const s = runStats(p, [DEF_CALLS.find((c) => c.id === cid)!], reps, seed);
      return { cid, s };
    });
    out.push(`SHORT ${p.name.padEnd(17)}| ${cells.map(({ cid, s }) => `${cid} ${pct(s.first)} (${s.ypc.toFixed(1)}) ${topTacklers(s, 2)}`).join(' | ')}`);
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
