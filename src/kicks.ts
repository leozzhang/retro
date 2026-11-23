/**
 * The kicking report (`npm run kicks` -> kicks.txt): every punt and kickoff call kicked by the CPU kicker
 * (game/cpuKicker.ts) through the kick play, against the AI return team, across the field, kicker levels,
 * wind, the receivers' looks and returners. It's the balancing tool for docs/KICKING.md: each call should
 * be the best one somewhere (BEST BY SITUATION) and pay for it elsewhere (FLAGS).
 *
 * Every row is scored for the kicking team in expected points (`ep`): the receivers' drive start is worth
 * -EP(start), the kicking team keeping the ball (an onside kick, a muff, a flag, a fake) EP(spot), and a
 * return touchdown -7.
 */
import { KICKS, kickDef, type KickDef, type ReturnScheme } from './data/specialTeams';
import type { RosterPlayer } from './data/teams';
import { OWN_GOAL } from './engine/constants';
import { mulberry32, type Rng } from './engine/math';
import { KickRun, type EngineKick, type KickSide } from './game/engineKick';
import { CALM, type Wind } from './sim/kicking';
import { referenceMatchup, referenceRoster } from './harness';

/** Report tuning: reps per row, and a drive start's expected points (a line through 0.5 at the 25 and 3.9 at the 75). */
export const KICKS_REPORT = { reps: Number(process.env.KICKS_REPS ?? 160), ep0: -1.2, epPerYd: 0.068, td: 7 };

const ep = (yard: number) => KICKS_REPORT.ep0 + KICKS_REPORT.epPerYd * yard;

interface Opts {
  /** Kicker's kpw/kac. */
  leg?: number;
  acc?: number;
  /** The receivers' returner level (Z and RB speed, moves and hands). */
  returner?: number;
  wind?: Wind;
  ret?: ReturnScheme;
  /** 4th-down yards to go (the rugby run option). */
  toGo?: number;
}

interface Row {
  n: number;
  ep: number;
  start: number;
  starts: number;
  gross: number;
  hang: number;
  tb: number;
  fc: number;
  oob: number;
  in10: number;
  in20: number;
  ret: number;
  retYds: number;
  td: number;
  muff: number;
  keep: number;
  blocked: number;
  foul: number;
  shank: number;
  badSnap: number;
  fake: number;
  fakeMade: number;
  /** A return of 30 yards or more, or a score. */
  big: number;
}

const blank = (): Row => ({
  n: 0, ep: 0, start: 0, starts: 0, gross: 0, hang: 0, tb: 0, fc: 0, oob: 0, in10: 0, in20: 0, ret: 0, retYds: 0, td: 0, muff: 0, keep: 0, blocked: 0, foul: 0,
  shank: 0, badSnap: 0, fake: 0, fakeMade: 0, big: 0,
});

const M = referenceMatchup();

function withRatings(base: Record<string, RosterPlayer>, slots: string[], set: Partial<RosterPlayer['r']>): Record<string, RosterPlayer> {
  const out = { ...base };
  for (const s of slots) out[s] = { ...base[s], r: { ...base[s].r, ...set } };
  return out;
}

function sides(o: Opts): { kick: KickSide; recv: KickSide } {
  const leg = o.leg ?? 75;
  const acc = o.acc ?? 75;
  const kickR = withRatings(M.offR, ['K', 'P'], { kpw: leg, kac: acc });
  const lvl = o.returner;
  const recvR = lvl === undefined ? M.defR : withRatings(M.defR, ['Z', 'RB'], { spd: lvl, elu: lvl, cth: lvl });
  return { kick: { team: M.off, roster: kickR }, recv: { team: M.def, roster: recvR } };
}

/** One call from `yard` (the kicking team's yards from its own goal; kickoffs from the 35), `reps` times. */
export function kickRow(def: KickDef, yard: number, o: Opts, rng: Rng, reps = KICKS_REPORT.reps): Row {
  const s = blank();
  const { kick, recv } = sides(o);
  for (let i = 0; i < reps; i++) {
    const run = new KickRun(kick, recv, def, OWN_GOAL + yard, rng, {
      wind: o.wind ?? CALM, ret: o.ret ?? 'return', ...(def.unit === 'punt' && o.toGo !== undefined ? { fake: { toGo: o.toGo } } : {}),
    });
    run.finishPlay();
    const k: EngineKick = run.finish();
    const kp = run.kp;
    const out = k.outcome;
    s.n++;
    if (kp.shanked) s.shank++;
    if (kp.badSnap) s.badSnap++;
    if (out.foul) s.foul++;
    if (out.result === 'fakeRun') {
      s.fake++;
      if (k.kickStart !== null) s.fakeMade++;
    }
    if (out.result === 'blocked') s.blocked++;
    if (out.result === 'touchback') s.tb++;
    if (out.result === 'fairCatch') s.fc++;
    if (out.result === 'oob') s.oob++;
    if (out.result === 'returned' || out.result === 'returnTd') {
      s.ret++;
      s.retYds += k.ret;
    }
    if (out.result === 'recovered') s.muff++;
    s.hang += kp.pred?.hang ?? 0;
    // Gross: where the kick itself ended (a return's catch spot), from the line.
    const caught = kp.returnFrom();
    const end = caught !== null && (out.result === 'returned' || out.result === 'returnTd') ? caught : Math.min(110, out.spot);
    s.gross += end - (OWN_GOAL + yard);
    if (k.recvTd || k.ret >= 30) s.big++;
    if (k.recvTd) {
      s.td++;
      s.ep -= KICKS_REPORT.td;
    } else if (k.kickStart !== null) {
      s.keep++;
      s.ep += ep(k.kickStart);
    } else if (k.recvStart !== null) {
      s.start += k.recvStart;
      s.starts++;
      s.ep -= ep(k.recvStart);
      if (k.recvStart <= 10) s.in10++;
      if (k.recvStart <= 20) s.in20++;
    } else if (out.result === 'fakeRun' && out.spot >= 110) {
      s.ep += KICKS_REPORT.td;
    }
  }
  return s;
}

const pct = (k: number, n: number) => `${((k / Math.max(1, n)) * 100).toFixed(0).padStart(3)}%`;
const f1 = (x: number) => x.toFixed(1).padStart(5);

function fmt(label: string, s: Row, unit: 'punt' | 'kickoff'): string {
  const n = s.n;
  const base =
    `${label.padEnd(34)} | ep ${(s.ep / n).toFixed(2).padStart(5)}  start ${f1(s.start / Math.max(1, s.starts))}  ` +
    (unit === 'punt' ? `gross ${f1(s.gross / n)}  ` : '') + `hang ${(s.hang / n).toFixed(1)}  ` +
    `tb ${pct(s.tb, n)} fc ${pct(s.fc, n)} oob ${pct(s.oob, n)} ` + (unit === 'punt' ? `in10 ${pct(s.in10, n)} in20 ${pct(s.in20, n)} ` : '') +
    `ret ${pct(s.ret, n)} (${f1(s.retYds / Math.max(1, s.ret))}) big ${pct(s.big, n)} td ${s.td} keep ${pct(s.keep, n)}`;
  const ev = [
    s.shank ? `shank ${pct(s.shank, n)}` : '', s.blocked ? `blk ${s.blocked}` : '', s.foul ? `flag ${s.foul}` : '', s.badSnap ? `badsnap ${s.badSnap}` : '',
    s.fake ? `fake ${s.fake} (${s.fakeMade} made)` : '',
  ].filter(Boolean).join(' ');
  return ev ? `${base}  ${ev}` : base;
}

const PUNTS = KICKS.filter((k) => k.unit === 'punt');
const KICKOFFS = KICKS.filter((k) => k.unit === 'kickoff');
const KO_YARD = 35;
const wind = (mph: number, x: number, y: number): Wind => ({ mph, dir: { x, y } });
const WINDS: [string, Wind][] = [['calm', CALM], ['head 12', wind(12, -1, 0)], ['tail 12', wind(12, 1, 0)], ['cross 12', wind(12, 0, 1)]];
const SPOTS: [string, number][] = [['own 10', 10], ['own 30', 30], ['midfield', 50], ['opp 40', 60], ['opp 35', 65]];

export interface Situation {
  label: string;
  unit: 'punt' | 'kickoff';
  yard: number;
  o: Opts;
  /** The calls a coach would weigh here (default: all of the unit's but the onside kick). */
  calls?: string[];
  /** What the moment wants: field position (`ep`), no big return (`safe`: fewest return yards, returns of 30+ and scores), the ball back (`keep`). */
  goal?: 'ep' | 'safe' | 'keep';
}

function score(s: Row, goal: Situation['goal']): number {
  if (goal === 'safe') return -(s.big * 2 + s.retYds / 25) / s.n;
  if (goal === 'keep') return s.keep / s.n;
  return s.ep / s.n;
}

/** The situations each call is meant to win somewhere (docs/KICKING.md). */
export const SITUATIONS: Situation[] = [
  { label: 'punt own 30, calm', unit: 'punt', yard: 30, o: {} },
  { label: 'punt own 10, backed up', unit: 'punt', yard: 10, o: {} },
  { label: 'punt own 30, 15 mph headwind', unit: 'punt', yard: 30, o: { wind: wind(15, -1, 0) } },
  { label: 'punt own 30, elite returner', unit: 'punt', yard: 30, o: { returner: 97 } },
  { label: 'punt own 35, block look', unit: 'punt', yard: 35, o: { ret: 'block' } },
  { label: 'punt own 45, 4th & 2, block look', unit: 'punt', yard: 45, o: { ret: 'block', toGo: 2 } },
  { label: 'punt opp 40, 75 accuracy', unit: 'punt', yard: 60, o: {} },
  { label: 'punt opp 40, 92 accuracy', unit: 'punt', yard: 60, o: { acc: 92 } },
  { label: 'punt own 45, 4th & 2', unit: 'punt', yard: 45, o: { toGo: 2 } },
  { label: 'kickoff, 90 leg', unit: 'kickoff', yard: KO_YARD, o: { leg: 90 } },
  { label: 'kickoff, 65 leg', unit: 'kickoff', yard: KO_YARD, o: { leg: 65 } },
  { label: 'kickoff, 65 leg, elite returner', unit: 'kickoff', yard: KO_YARD, o: { leg: 65, returner: 97 } },
  { label: 'kickoff, 75 leg, 15 mph headwind', unit: 'kickoff', yard: KO_YARD, o: { wind: wind(15, -1, 0) } },
  { label: 'kickoff safe, 90 leg, elite returner', unit: 'kickoff', yard: KO_YARD, o: { leg: 90, returner: 97 }, goal: 'safe' },
  { label: 'kickoff safe, 65 leg, elite returner', unit: 'kickoff', yard: KO_YARD, o: { leg: 65, returner: 97 }, goal: 'safe' },
  { label: 'punt, protect a lead (safe)', unit: 'punt', yard: 40, o: { returner: 97 }, goal: 'safe' },
  { label: 'need it back vs a return (keep)', unit: 'kickoff', yard: KO_YARD, o: {}, calls: ['ko-onside', 'ko-sky', 'ko-squib'], goal: 'keep' },
  { label: 'need it back vs hands (keep)', unit: 'kickoff', yard: KO_YARD, o: { ret: 'hands' }, calls: ['ko-onside', 'ko-sky', 'ko-squib'], goal: 'keep' },
];

export function kicksReport(only?: string[]): string[] {
  const rng = mulberry32(20261123);
  const rows: string[] = [];
  const want = (d: KickDef) => !only || only.includes(d.id);
  const section = (t: string) => rows.push('', `== ${t}`);

  section('PUNTS BY SPOT (75/75 punter, calm, a return look)');
  for (const d of PUNTS.filter(want)) {
    for (const [lbl, yd] of SPOTS) rows.push(fmt(`${d.name} from ${lbl}`, kickRow(d, yd, {}, rng), 'punt'));
  }
  section('KICKOFFS BY LEG (accuracy 75, calm, a return look)');
  for (const d of KICKOFFS.filter(want)) {
    for (const leg of [60, 75, 90]) rows.push(fmt(`${d.name} leg ${leg}`, kickRow(d, KO_YARD, { leg }, rng), 'kickoff'));
  }
  section('ACCURACY (leg 75)');
  for (const id of ['punt', 'directional', 'coffin', 'ko-corner']) {
    const d = kickDef(id);
    if (!want(d)) continue;
    const yd = d.unit === 'kickoff' ? KO_YARD : id === 'coffin' ? 60 : 30;
    for (const acc of [60, 75, 92]) rows.push(fmt(`${d.name} acc ${acc}`, kickRow(d, yd, { acc }, rng), d.unit as 'punt' | 'kickoff'));
  }
  section('WIND (75/75)');
  for (const id of ['punt', 'line-drive', 'rugby', 'ko-deep', 'ko-corner']) {
    const d = kickDef(id);
    if (!want(d)) continue;
    const yd = d.unit === 'kickoff' ? KO_YARD : 30;
    for (const [lbl, w] of WINDS) rows.push(fmt(`${d.name} ${lbl}`, kickRow(d, yd, { wind: w }, rng), d.unit as 'punt' | 'kickoff'));
  }
  section('LOOKS: the receivers\' scheme');
  for (const id of ['punt', 'directional', 'rugby']) {
    const d = kickDef(id);
    if (!want(d)) continue;
    for (const ret of ['return', 'block', 'safe'] as ReturnScheme[]) rows.push(fmt(`${d.name} vs ${ret}`, kickRow(d, 35, { ret }, rng), 'punt'));
  }
  for (const id of ['ko-onside', 'ko-sky', 'ko-squib']) {
    const d = kickDef(id);
    if (!want(d)) continue;
    for (const ret of ['return', 'hands'] as ReturnScheme[]) rows.push(fmt(`${d.name} vs ${ret}`, kickRow(d, KO_YARD, { ret }, rng), 'kickoff'));
  }
  section('RETURNERS (75 returner vs 97)');
  for (const id of ['punt', 'directional', 'line-drive', 'ko-deep', 'ko-corner', 'ko-squib']) {
    const d = kickDef(id);
    if (!want(d)) continue;
    const yd = d.unit === 'kickoff' ? KO_YARD : 30;
    for (const lvl of [75, 97]) rows.push(fmt(`${d.name} returner ${lvl}`, kickRow(d, yd, { returner: lvl, ...(d.unit === 'kickoff' ? { leg: 70 } : {}) }, rng), d.unit as 'punt' | 'kickoff'));
  }
  section('RUN OPTION (rugby, 4th and short)');
  if (want(kickDef('rugby'))) {
    for (const ret of ['return', 'block'] as ReturnScheme[]) {
      for (const toGo of [1, 3, 6]) rows.push(fmt(`Rugby 4th & ${toGo} own 45 vs ${ret}`, kickRow(kickDef('rugby'), 45, { toGo, ret }, rng), 'punt'));
    }
  }

  // Each situation: every call it weighs, ranked by ep.
  section('BEST BY SITUATION (ep for the kicking team, or the share safe/kept; best first)');
  const wins = new Map<string, number>();
  const flags: string[] = [];
  for (const sit of SITUATIONS) {
    const calls = (sit.calls ?? (sit.unit === 'punt' ? PUNTS : KICKOFFS.filter((k) => !k.onside)).map((k) => k.id)).map(kickDef);
    const scored = calls.map((d) => ({ d, s: kickRow(d, sit.yard, sit.o, rng) })).map((x) => ({ ...x, v: score(x.s, sit.goal) }));
    scored.sort((a, b) => b.v - a.v);
    wins.set(scored[0].d.id, (wins.get(scored[0].d.id) ?? 0) + 1);
    rows.push(`${sit.label.padEnd(34)} | ${scored.map((x) => `${x.d.name} ${x.v.toFixed(2)}`).join('  ')}`);
  }
  for (const d of [...PUNTS, ...KICKOFFS]) {
    const w = wins.get(d.id) ?? 0;
    if (w === 0) flags.push(`${d.name}: best in no situation`);
    if (w >= Math.ceil(SITUATIONS.filter((s) => s.unit === d.unit).length * 0.6)) flags.push(`${d.name}: best in ${w} situations (too strong?)`);
  }

  // Targets: the standard punt and the deep kick against FBS (docs/KICKING.md).
  const std = kickRow(kickDef('punt'), 30, {}, rng, 300);
  const g = std.gross / std.n;
  const netStart = std.start / Math.max(1, std.starts);
  const net = 100 - 30 - netStart;
  const fc = std.fc / std.n;
  const retAvg = std.retYds / Math.max(1, std.ret);
  if (g < 41 || g > 45) flags.push(`standard punt gross ${g.toFixed(1)} (target 41-45)`);
  if (net < 36 || net > 41) flags.push(`standard punt net ${net.toFixed(1)} (target 36-41)`);
  if (fc < 0.3 || fc > 0.5) flags.push(`standard punt fair catches ${(fc * 100).toFixed(0)}% (target 30-50%)`);
  if (retAvg < 6 || retAvg > 12) flags.push(`standard punt return ${retAvg.toFixed(1)} yds (target 6-12)`);
  const deep = kickRow(kickDef('ko-deep'), KO_YARD, {}, rng, 300);
  const tb = deep.tb / deep.n;
  const kr = deep.retYds / Math.max(1, deep.ret);
  if (tb < 0.35 || tb > 0.6) flags.push(`deep kickoff touchbacks ${(tb * 100).toFixed(0)}% at leg 75 (target 35-60%)`);
  if (deep.ret > 10 && (kr < 17 || kr > 25)) flags.push(`kickoff return ${kr.toFixed(1)} yds (target 17-25)`);
  rows.push(`TARGETS: punt gross ${g.toFixed(1)} net ${net.toFixed(1)} fc ${(fc * 100).toFixed(0)}% ret ${retAvg.toFixed(1)}; deep ko tb ${(tb * 100).toFixed(0)}% ret ${kr.toFixed(1)}`);
  section('FLAGS');
  rows.push(...(flags.length ? flags : ['none']));
  return rows;
}

/** The reference kicker's level, for the report's header. */
export const REF_KICKER = referenceRoster(90).K.r;
