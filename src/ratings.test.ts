import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { RATING_INFO, RATING_KEYS, type RatingKey } from './data/ratings';
import { kickDef } from './data/specialTeams';
import type { RosterPlayer } from './data/teams';
import { clamp, mulberry32 } from './engine/math';
import { CALM } from './sim/kicking';
import * as H from './harness';

/**
 * Ratings sensitivity: what is each rating worth at each position? For every group of starters
 * and every rating, lower it by `DROP` and replay the same seeded plays (lowering, because good
 * starters already sit near the 99 cap). The gain is what those points were worth. A rating with no effect at
 * a position doesn't belong in that position's overall (`OVR_WEIGHTS`). Run with `npm run ratings`;
 * results go to ratings.txt. `RAT_ONLY=QB,WR` limits the groups.
 */
const DROP = 15;
const PASS_N = 720;
const RUN_N = 720;
const KICK_N = 400;
/** Yards an interception costs, for the combined value column. */
const INT_YARDS = 45;

const GROUPS: { name: string; side: 'off' | 'def'; slots: string[] }[] = [
  { name: 'QB', side: 'off', slots: ['QB'] },
  { name: 'RB', side: 'off', slots: ['RB'] },
  { name: 'WR', side: 'off', slots: ['X', 'Z', 'SL'] },
  { name: 'TE', side: 'off', slots: ['TE'] },
  { name: 'OL', side: 'off', slots: ['LT', 'LG', 'C', 'RG', 'RT'] },
  { name: 'DL', side: 'def', slots: ['DE1', 'DT1', 'DT2', 'DE2'] },
  { name: 'LB', side: 'def', slots: ['WLB', 'MLB', 'SAM'] },
  { name: 'CB', side: 'def', slots: ['CB1', 'CB2', 'NB'] },
  { name: 'S', side: 'def', slots: ['FS', 'SS'] },
];

/** Ratings that only act on a user-controlled player, so the auto-players can't measure them. */
const USER_ONLY: RatingKey[] = ['sta'];

type Roster = Record<string, RosterPlayer>;

function bumped(roster: Roster, slots: string[], k: RatingKey | null): Roster {
  const out: Roster = {};
  for (const [s, p] of Object.entries(roster)) {
    out[s] = { ...p, r: { ...p.r } };
    if (k && slots.includes(s)) out[s].r[k] = clamp(out[s].r[k] - DROP, 0, 99);
  }
  return out;
}

const pass = PLAYBOOK.filter((p) => p.kind === 'pass' || (p.kind === 'pa' && p.block === 'pass'));
const runs = PLAYBOOK.filter((p) => p.kind === 'run');

/** Per-rep results, indexed by rep so a variant pairs with the base rep for rep (null: no outcome). */
interface Sample {
  comp: number;
  att: number;
  int: number;
  sack: number;
  pass: (number | null)[];
  run: (number | null)[];
}

/** Each rep gets its own seed, so a change on one rep doesn't reshuffle every rep after it. */
const repRng = (seed: number, i: number) => mulberry32(seed * 100_003 + i);

function measure(m: H.Matchup, seed: number): Sample {
  const s: Sample = { comp: 0, att: 0, int: 0, sack: 0, pass: [], run: [] };
  for (let i = 0; i < PASS_N; i++) {
    const call = DEF_CALLS[i % DEF_CALLS.length];
    const hold = Math.floor(i / DEF_CALLS.length) % 2 ? 2.2 : 1.2;
    const { play, o } = H.passRep(m, pass[i % pass.length], call, hold, repRng(seed, i));
    if (!o) {
      s.pass.push(null);
      continue;
    }
    if (o.type === 'sack') s.sack++;
    else s.att++;
    if (o.type === 'int' || o.type === 'pick6') {
      s.int++;
      s.pass.push(-INT_YARDS);
    } else s.pass.push(o.spot - H.LOS);
    if (play.thrown && ['tackle', 'oob', 'td'].includes(o.type)) s.comp++;
  }
  for (let i = 0; i < RUN_N; i++) {
    const r = H.runRep(m, runs[i % runs.length], DEF_CALLS[i % DEF_CALLS.length], repRng(seed + 1, i));
    s.run.push(r.o && r.ran ? r.yds : null);
  }
  return s;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const vals = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
/** Combined value: yards per play across pass and run reps, an interception counted as -INT_YARDS. */
const value = (s: Sample) => mean(vals([...s.pass, ...s.run]));

/** Mean and standard error of the rep-by-rep difference b - a. */
function paired(a: Sample, b: Sample): { d: number; se: number } {
  const ds: number[] = [];
  const xa = [...a.pass, ...a.run];
  const xb = [...b.pass, ...b.run];
  for (let i = 0; i < xa.length; i++) if (xa[i] !== null && xb[i] !== null) ds.push(xb[i]! - xa[i]!);
  return { d: mean(ds), se: sd(ds) / Math.sqrt(Math.max(1, ds.length)) };
}

function fmt(d: number, digits = 1): string {
  const t = d.toFixed(digits);
  return (d >= 0 ? '+' : '') + t;
}

it.runIf(process.env.npm_lifecycle_event === 'ratings')('ratings sensitivity', () => {
  const only = process.env.RAT_ONLY?.split(',').map((x) => x.trim());
  // Template players (the balance report's reference matchup), so the gains don't depend on who the generator rolled.
  const { off, def, offR, defR } = H.referenceMatchup();
  const SEED = 101;
  const base = measure({ off, def, offR, defR }, SEED);
  const rows: string[] = [
    `Ratings sensitivity: -${DROP} to the starters of one group, same seeds; gain = what those ${DROP} points are worth. ${PASS_N} pass reps (pass+PA, 3 calls, 1.2/2.2s) and ${RUN_N} run reps.`,
    `Value = yards per play over all reps, an INT counted as -${INT_YARDS}. For a defensive group the gain is the yards per play it takes away.`,
    `Base: comp ${((base.comp / base.att) * 100).toFixed(1)}% int ${base.int} sack ${base.sack} ypp ${mean(vals(base.pass)).toFixed(2)} ypc ${mean(vals(base.run)).toFixed(2)} value ${value(base).toFixed(2)}`,
    `Reps are paired by seed. "*" = the gain is more than 2 standard errors of the paired difference (shown as +-).`,
    '',
  ];
  for (const g of GROUPS) {
    if (only && !only.includes(g.name)) continue;
    rows.push(`== ${g.name} (${g.slots.join(' ')})`);
    const res: { k: RatingKey; gain: number; sig: boolean; line: string }[] = [];
    for (const k of RATING_KEYS) {
      if (k === 'kpw' || k === 'kac') continue;
      const m: H.Matchup = {
        off, def,
        offR: g.side === 'off' ? bumped(offR, g.slots, k) : offR,
        defR: g.side === 'def' ? bumped(defR, g.slots, k) : defR,
      };
      const s = measure(m, SEED);
      const { d, se } = paired(base, s);
      const gain = g.side === 'off' ? -d : d;
      const line =
        `${k} ${RATING_INFO[k].label.padEnd(17)} gain ${fmt(gain, 2).padStart(6)} +-${se.toFixed(2)} | ` +
        `with ${DROP} more: comp ${fmt((base.comp / base.att - s.comp / s.att) * 100)}pt int ${fmt(base.int - s.int, 0)} sack ${fmt(base.sack - s.sack, 0)} ` +
        `ypp ${fmt(mean(vals(base.pass)) - mean(vals(s.pass)), 2)} ypc ${fmt(mean(vals(base.run)) - mean(vals(s.run)), 2)}` +
        `${USER_ONLY.includes(k) ? '  (user-controlled only)' : ''}`;
      res.push({ k, gain, sig: Math.abs(gain) > 2 * se, line });
    }
    res.sort((a, b) => b.gain - a.gain);
    rows.push(...res.map((r) => (r.sig ? '* ' : '  ') + r.line));
    rows.push('');
  }

  if (!only || only.includes('K')) {
    rows.push(`== K / P (kicking team): what ${DROP} points are worth`);
    const kick = (roster: Roster) => {
      const m: H.Matchup = { off, def, offR: roster, defR };
      const rng = mulberry32(SEED + 7);
      let made = 0;
      for (let i = 0; i < KICK_N; i++) {
        const yds = 40 + Math.floor(rng() * 16);
        const power = clamp(0.62 + (yds - 20) * 0.011, 0.62, 1);
        const { o } = H.runKick(m, kickDef('fg'), 110 - (yds - 17), () => ({ power, dir: { x: 1, y: 0 }, loft: 38 }), CALM, rng);
        if (o?.result === 'fgGood') made++;
      }
      let net = 0;
      const prng = mulberry32(SEED + 8);
      for (let i = 0; i < KICK_N; i++) {
        const { o, catchX } = H.runKick(m, kickDef('punt'), 40, () => ({ power: 1, dir: { x: 1, y: 0 }, loft: 54 }), CALM, prng);
        if (!o) continue;
        net += (o.result === 'touchback' ? 90 : o.result === 'returned' && catchX !== null ? o.spot : o.spot) - 40;
      }
      return { fg: made / KICK_N, net: net / KICK_N };
    };
    const kb = kick(offR);
    rows.push(`base: FG 40-55 ${(kb.fg * 100).toFixed(1)}% punt net ${kb.net.toFixed(1)}`);
    for (const slot of ['K', 'P']) {
      for (const k of ['kpw', 'kac'] as RatingKey[]) {
        const kv = kick(bumped(offR, [slot], k));
        rows.push(`${slot} ${k} FG ${fmt((kb.fg - kv.fg) * 100)}pt punt net ${fmt(kb.net - kv.net)}`);
      }
    }
  }
  writeFileSync(process.env.RAT_OUT ?? 'ratings.txt', rows.join('\n'));
}, 3_600_000);
