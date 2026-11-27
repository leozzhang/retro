import { buildStaff, dcAdjust } from './data/coaches';
import { buildSquad, onField, teamConf } from './data/depth';
import { defIdentity } from './data/identity';
import { offIdentity } from './data/offIdentity';
import { ocBook, ocStyle } from './data/offStyles';
import { TEAMS, type Team } from './data/teams';
import { mulberry32 } from './engine/math';
import { newBrain, newDrive } from './game/defBrain';
import { driveStream, type EngineDrive, type EngineSide } from './game/engineDrive';
import { rosterRead } from './game/offModel';
import type { DriveClock } from './game/rules';
import { botDrive, DefBot, type BotPolicy } from './game/userDefBot';
import { autoGamePlan } from './season/staff';

/**
 * `npm run userdef` (docs/USERDEF.md): the user's defender played by an oracle (perfect information, a reaction
 * time) against the AI on the same snaps. The AI row is the bot with its hands off (`assign`), which is the AI to
 * the draw. What a perfect user is worth, by slot, policy and reaction time, and the FLAGS against the targets.
 */
export const USERDEF = {
  /** Matchups (`USERDEF_PAIRS`) and drives each from the 25 (`USERDEF_DRIVES`). */
  pairs: Number(process.env.USERDEF_PAIRS ?? 16),
  drives: Number(process.env.USERDEF_DRIVES ?? 12),
  seed: 20261126,
  slots: ['CB1', 'FS', 'MLB'],
  policies: ['hawk', 'jump', 'shadow'] as BotPolicy[],
  latencies: [0.15, 0.25, 0.35],
  /** FLAGS: a perfect user at the human `at` reaction time picks more than `intX` × the AI's rate on the team, or takes more than `ptsDrop` points a drive. */
  flag: { at: 0.25, intX: 2, ptsDrop: 0.3, statX: 2.5 },
};

function side(t: Team): EngineSide {
  const squad = buildSquad(t);
  const roster = onField(squad);
  const staff = buildStaff(t);
  return {
    team: t, roster, ident: defIdentity(t, staff.DC), conf: teamConf(squad),
    oc: { book: ocBook(staff.OC), style: ocStyle(staff.OC), passShare: autoGamePlan(squad, squad, staff.OC).passShare, id: offIdentity(staff.OC, roster) },
  };
}

interface Row {
  drives: number;
  pts: number;
  throws: number;
  comp: number;
  passYds: number;
  ints: number;
  /** His: picks, tackles, picks + tackles (the stats his grade reads). */
  hisInt: number;
  hisTkl: number;
}

const zero = (): Row => ({ drives: 0, pts: 0, throws: 0, comp: 0, passYds: 0, ints: 0, hisInt: 0, hisTkl: 0 });

function add(r: Row, d: EngineDrive, slot: string): void {
  r.drives++;
  r.pts += d.points - d.defPoints;
  for (const s of d.snaps) {
    if (s.thrown) {
      r.throws++;
      if (s.complete) r.comp++;
      r.passYds += s.gain;
    }
    const pick = s.type === 'int' || s.type === 'pick6';
    if (pick) r.ints++;
    if (pick && s.takeaway === slot) r.hisInt++;
    if (s.tackler === slot) r.hisTkl++;
  }
}

export function userdefReport(): string[] {
  const t0 = Date.now();
  const pick = mulberry32(USERDEF.seed);
  const pairs: [EngineSide, EngineSide][] = [];
  for (let i = 0; i < USERDEF.pairs; i++) {
    const o = TEAMS[Math.floor(pick() * TEAMS.length)];
    let d = TEAMS[Math.floor(pick() * TEAMS.length)];
    while (d === o) d = TEAMS[Math.floor(pick() * TEAMS.length)];
    pairs.push([side(o), side(d)]);
  }
  const clock: DriveClock = { timeLeft: 900, hurry: false, milk: false, lead: 0, finalHalf: false, qSecs: 900 };
  const run = (slot: string, policy: BotPolicy, latency: number): Row => {
    const r = zero();
    for (const [i, [off, def]] of pairs.entries()) {
      const dc = buildStaff(def.team).DC;
      const brain = newBrain({ iq: 'NORMAL', adjust: dcAdjust(dc), scout: dc.r.scout, qbMobility: 0, seed: i, book: off.oc.book, style: off.oc.style, roster: rosterRead(off.roster) });
      const rng = mulberry32(USERDEF.seed ^ (i * 7919));
      for (let k = 0; k < USERDEF.drives; k++) {
        if (brain) newDrive(brain);
        add(r, botDrive(off, def, 25, driveStream(rng), clock, { brain }, slot, () => new DefBot(policy, latency)), slot);
      }
    }
    return r;
  };
  const pct = (a: number, b: number) => (b ? (100 * a) / b : 0);
  const f1 = (x: number) => x.toFixed(1);
  const f2 = (x: number) => x.toFixed(2);
  const line = (name: string, r: Row, ai?: Row) => {
    const d = ai ? ` (${r.pts / r.drives - ai.pts / ai.drives >= 0 ? '+' : ''}${f2(r.pts / r.drives - ai.pts / ai.drives)})` : '';
    return `  ${name.padEnd(16)} pts/drive ${f2(r.pts / r.drives)}${d.padEnd(8)}  comp ${f1(pct(r.comp, r.throws)).padStart(5)}%  yd/att ${f1(r.passYds / Math.max(1, r.throws)).padStart(4)}  INT% ${f2(pct(r.ints, r.throws))}  HIS: INT/100 drives ${f1(pct(r.hisInt, r.drives)).padStart(5)}  TKL/drive ${f2(r.hisTkl / r.drives)}`;
  };
  const out: string[] = [];
  const flags: string[] = [];
  out.push(`USERDEF: the user's defender played by an oracle (perfect information, a reaction time) vs the AI on the same snaps.`);
  out.push(`${USERDEF.pairs} matchups x ${USERDEF.drives} drives from the 25, the user's DC brain on. AI = the bot's hands off (the AI to the draw).`);
  const F = USERDEF.flag;
  const better: Record<string, number> = {};
  for (const slot of USERDEF.slots) {
    out.push('');
    out.push(`${slot}`);
    const ai = run(slot, 'assign', 0);
    out.push(line('AI', ai));
    for (const policy of USERDEF.policies) {
      for (const lat of USERDEF.latencies) {
        const r = run(slot, policy, lat);
        out.push(line(`${policy} ${lat.toFixed(2)}s`, r, ai));
        const drop = ai.pts / ai.drives - r.pts / r.drives;
        if (drop > 0) better[policy] = (better[policy] ?? 0) + 1;
        if (lat !== F.at) continue;
        const intX = pct(r.ints, r.throws) / Math.max(1e-9, pct(ai.ints, ai.throws));
        if (intX > F.intX) flags.push(`${slot} ${policy} at ${lat}s: team INT rate ${f2(pct(r.ints, r.throws))}% is ${f1(intX)}x the AI's (${f2(pct(ai.ints, ai.throws))}%), over ${F.intX}x`);
        if (drop > F.ptsDrop) flags.push(`${slot} ${policy} at ${lat}s: ${f2(drop)} points a drive under the AI, over ${F.ptsDrop}`);
        // The farm check: his box score (what his grades and XP read) against the AI's at his slot.
        const his = (x: Row) => (x.hisInt * 5 + x.hisTkl) / x.drives;
        const statX = his(r) / Math.max(1e-9, his(ai));
        if (statX > F.statX) flags.push(`${slot} ${policy} at ${lat}s: his box score (5 x INT + TKL) ${f1(statX)}x the AI's at his slot, over ${F.statX}x (XP farming)`);
      }
    }
  }
  const all = USERDEF.slots.length * USERDEF.latencies.length;
  for (const p of USERDEF.policies) if ((better[p] ?? 0) === all) flags.push(`${p} beats the AI at every slot and reaction time: no policy should dominate`);
  out.push('');
  out.push('FLAGS');
  out.push(...(flags.length ? flags.map((f) => `  ${f}`) : ['  none']));
  out.push('');
  out.push(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return out;
}
