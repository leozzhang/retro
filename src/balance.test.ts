import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { adaptiveRows } from './adaptive';
import { CORE_CALLS, DEF_CALLS, type DefCall } from './data/defenses';
import { PLAYBOOK, type PlayDef, type RouteName } from './data/plays';
import { buildSquad, rosterFor, teamRatings } from './data/depth';
import { kickDef, type KickDef } from './data/specialTeams';
import { teamById } from './data/teams';
import { FIELD_W, STEP } from './engine/constants';
import { add, clamp, dist, mulberry32, scale, type Rng } from './engine/math';
import type { KickPlay } from './game/kickPlay';
import type { Play } from './game/playState';
import { resolvePlay } from './game/resolvePlay';
import { applyKick, startDrive } from './game/rules';
import { newWind } from './game/wind';
import { CALM, type KickParams, type Wind } from './sim/kicking';
import type { Player } from './sim/player';
import * as H from './harness';
import { cam, fakeInput, LOS, median } from './harness';

/** Template players, offense 90 vs defense 88 (`referenceMatchup`), so the rows only move when the sim does. */
const M: H.Matchup = H.referenceMatchup();
const REPS = 120;
/** Runs are cheap and noisy, so they get more reps per row. */
const RUN_REPS = 180;

const newPlay = (playDef: PlayDef, call: DefCall, rng: Rng, los = LOS): Play => H.newPlay(M, playDef, call, rng, los);
const runRep = (playDef: PlayDef, call: DefCall, rng: Rng, los = LOS) => H.runRep(M, playDef, call, rng, los);
const runKick = (kd: KickDef, los: number, params: (kp: KickPlay) => KickParams, wind: Wind, rng: Rng) =>
  H.runKick(M, kd, los, params, wind, rng);

/** Auto-QB throws to the receiver with the most separation after a fixed hold time. */
function passLine(plays: PlayDef[], call: DefCall, holdTime: number, reps: number, rng: Rng): string {
  const stats = { n: 0, comp: 0, int: 0, sack: 0, yards: 0, sackT: 0, pbu: 0, yac: 0, td: 0 };
  for (let i = 0; i < reps; i++) {
    const { play, catchX } = H.passRep(M, plays[i % plays.length], call, holdTime, rng);
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
  return (
    `comp ${((stats.comp / att) * 100).toFixed(0)}% ` +
    `int ${((stats.int / att) * 100).toFixed(1)}% pbu ${stats.pbu} sack ${stats.sack}` +
    `${stats.sack ? ` (avg ${(stats.sackT / stats.sack).toFixed(1)}s)` : ''} | ypp ${(stats.yards / stats.n).toFixed(1)} yac ${(stats.yac / Math.max(1, stats.comp)).toFixed(1)} td ${stats.td}`
  );
}

function passRows(label: string, plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  for (const call of CORE_CALLS) {
    for (const holdTime of [1.2, 2.2, 3.2]) {
      rows.push(`${label} ${call.name.padEnd(15)} hold ${holdTime}s | ${passLine(plays, call, holdTime, REPS, rng)}`);
    }
  }
  return rows;
}

/** One row per pass/PA play, so a change to one route shows up on the plays that run it. */
function perPlayRows(plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  for (const p of plays) {
    for (const call of CORE_CALLS) {
      for (const holdTime of [1.2, 2.2]) {
        rows.push(`PLAY ${p.name.padEnd(14)} ${call.name.padEnd(15)} hold ${holdTime}s | ${passLine([p], call, holdTime, REPS, rng)}`);
      }
    }
  }
  return rows;
}

/**
 * Targeted by route: throw to the receiver (not a back) running `route`, `ROUTE_THROW_AFTER` after
 * his break (the NFL time to break plus that for routes with no real break: go, post, corner).
 * NFL comp % vs man and median separation (TARGETS.md) ride along for comparison. A sanity check on
 * route running, not a tuning target.
 */
const ROUTE_CHECKS: [RouteName, number, number, number][] = [
  // route, NFL time to break (s), NFL comp % vs man, NFL median separation (yd)
  ['hitch', 1.7, 58.8, 3.7],
  ['curl', 2.7, 58.8, 3.7],
  ['comeback', 2.9, 59.5, 3.2],
  ['slant', 1.6, 63.3, 2.4],
  ['quickOut', 1.9, 59.5, 3.2],
  ['deepOut', 2.9, 59.5, 3.2],
  ['in', 3.1, 50.0, 2.8],
  ['post', 2.7, 47.5, 2.7],
  ['corner', 2.8, 35.5, 2.6],
  ['go', 2.1, 31.3, 1.5],
  ['drag', 1.5, 63.9, 3.5],
];
const ROUTE_THROW_AFTER = 0.3;

function routeRows(rng: Rng): string[] {
  const rows: string[] = [];
  const nearest = (play: Play, p: Player) => Math.min(...play.def.map((d) => dist(d.pos, p.pos)));
  for (const [route, brk, nflComp, nflSep] of ROUTE_CHECKS) {
    const plays = PLAYBOOK.filter((pd) => {
      if (pd.kind === 'run') return false;
      const r = resolvePlay(pd, 26.6, false).routes;
      return Object.entries(r).some(([slot, rn]) => rn === route && slot !== 'RB' && slot !== 'FB');
    });
    if (!plays.length) continue;
    for (const call of CORE_CALLS) {
      const s = { att: 0, comp: 0, int: 0, set: 0, sepT: [] as number[], sepA: [] as number[], yds: 0 };
      for (let i = 0; i < REPS; i++) {
        const play = newPlay(plays[i % plays.length], call, rng);
        play.snap();
        const tgt = play.off.find((o) => o.routeName === route && o.role !== 'RB' && !o.isBlocker);
        if (!tgt) continue;
        // The break is his sharpest turn (a settle route's stop doesn't count); the throw comes out of it.
        const keep = tgt.cutKeep.slice(0, tgt.settle ? -1 : undefined);
        const sharpest = Math.min(...keep);
        const bi = keep.length && sharpest < 0.97 ? keep.indexOf(sharpest) : -1;
        let brokeAt = Infinity;
        let thrown = false;
        for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
          if (bi >= 0 && brokeAt === Infinity && tgt.routeIdx > bi) brokeAt = play.time;
          const due = bi >= 0 ? play.time >= brokeAt + ROUTE_THROW_AFTER : play.time - play.snapTime >= brk + ROUTE_THROW_AFTER;
          if (!thrown && play.phase === 'live' && due) {
            const lead = dist(play.qb.pos, tgt.pos) / 22;
            const aim = add(tgt.pos, scale(tgt.vel, lead));
            (play as any).throwBall({ x: Math.min(aim.x, 119), y: clamp(aim.y, 1.5, FIELD_W - 1.5) });
            s.sepT.push(nearest(play, tgt));
            thrown = true;
          }
          const before = play.phase;
          play.update(STEP, fakeInput, cam);
          if (before === 'air' && play.phase !== 'air') {
            s.sepA.push(nearest(play, tgt));
            if (play.catchSet > 0.5 && play.carrier === tgt) s.set++;
          }
        }
        const o = play.outcome;
        if (!o || !thrown) continue;
        s.att++;
        if (o.type === 'int' || o.type === 'pick6') s.int++;
        else s.yds += o.spot - LOS;
        if (['tackle', 'oob', 'td'].includes(o.type)) s.comp++;
      }
      const n = Math.max(1, s.att);
      rows.push(
        `ROUTE ${route.padEnd(9)} ${call.name.padEnd(15)} | att ${String(s.att).padStart(3)} comp ${((s.comp / n) * 100).toFixed(0)}% int ${((s.int / n) * 100).toFixed(1)}% ` +
          `ypt ${(s.yds / n).toFixed(1)} sep throw ${median(s.sepT).toFixed(1)} arrive ${median(s.sepA).toFixed(1)} ` +
          `set ${((s.set / Math.max(1, s.comp)) * 100).toFixed(0)}% | NFL vs man ${nflComp}% sep ${nflSep}`,
      );
    }
  }
  return rows;
}

function runRows(plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  const all: number[] = [];
  for (const playDef of plays) {
    for (const call of CORE_CALLS) {
      const s = { fum: 0, td: 0, none: 0, keep: 0, keepY: 0, contact: 0, list: [] as number[] };
      for (let i = 0; i < RUN_REPS; i++) {
        const { play, o, ran, yds, contact } = runRep(playDef, call, rng);
        if (!o) continue;
        if (!ran) {
          s.none++;
          continue;
        }
        if (play.kept) {
          s.keep++;
          s.keepY += yds;
        }
        s.list.push(yds);
        s.contact += contact;
        if (o.type === 'fumble') s.fum++;
        if (o.type === 'td') s.td++;
      }
      all.push(...s.list);
      rows.push(
        `RUN  ${playDef.name.padEnd(13)} ${call.name.padEnd(15)} | ${runLine(s.list)} contact ${(s.contact / Math.max(1, s.list.length)).toFixed(1)} ` +
          `fum ${s.fum} td ${s.td}${s.none ? ` no-handoff ${s.none}` : ''}` +
          `${s.keep ? ` keep ${s.keep} (${(s.keepY / s.keep).toFixed(1)} ypc)` : ''}`,
      );
    }
  }
  rows.push(`RUN  ALL | ${runLine(all)}`);
  return rows;
}

/** YPC, median, stuffs (0 or less), opportunity rate (4+) and explosive runs (10+). */
function runLine(list: number[]): string {
  const n = Math.max(1, list.length);
  const pct = (k: number) => `${((k / n) * 100).toFixed(0)}%`;
  const sum = list.reduce((a, b) => a + b, 0);
  return (
    `ypc ${(sum / n).toFixed(1)} median ${median(list).toFixed(1)} stuff ${pct(list.filter((y) => y <= 0).length)} ` +
    `4+ ${pct(list.filter((y) => y >= 4).length)} 10+ ${pct(list.filter((y) => y >= 10).length)}`
  );
}

/** The core runs (and the harness's core calls) that the TALENT GAP rows measure. */
const CORE_RUNS = ['inside-zone', 'outside-zone', 'power', 'toss', 'zone-read'];
const GAP_REPS = 24;

/**
 * TALENT GAP: the core runs as the defense gets better or worse than the offense (reference rosters,
 * offense 70; level alone doesn't move the run game, the gap does), then real generated rosters.
 * Targets in TARGETS.md (run game vs. talent gap).
 */
function gapRows(rng: Rng): string[] {
  const plays = CORE_RUNS.map((id) => PLAYBOOK.find((p) => p.id === id)!);
  const cell = (m: H.Matchup) => {
    const list: number[] = [];
    let contact = 0;
    for (const call of CORE_CALLS) {
      for (const playDef of plays) {
        for (let i = 0; i < GAP_REPS; i++) {
          const r = H.runRep(m, playDef, call, rng);
          if (!r.o || !r.ran) continue;
          list.push(r.yds);
          contact += r.contact;
        }
      }
    }
    return `${runLine(list)} contact ${(contact / Math.max(1, list.length)).toFixed(1)}`;
  };
  const rows: string[] = [];
  for (const gap of [-20, -10, -5, 0, 5, 10, 20]) {
    const label = `off 70 def ${70 + gap} (${gap > 0 ? '+' : ''}${gap})`;
    rows.push(`GAP  ${label.padEnd(26)} | ${cell(H.referenceMatchup(70, 70 + gap))}`);
  }
  const real = (o: string, d: string) => {
    const off = teamById(o);
    const def = teamById(d);
    return { off, def, offR: rosterFor(off), defR: rosterFor(def) };
  };
  for (const [o, d] of [['northernillinois', 'kentstate'], ['kentstate', 'northernillinois'], ['georgia', 'alabama'], ['georgia', 'kentstate'], ['northernillinois', 'georgia']]) {
    const m = real(o, d);
    const label = `${m.off.abbr} ${teamRatings(buildSquad(m.off)).off} v ${m.def.abbr} ${teamRatings(buildSquad(m.def)).def}`;
    rows.push(`GAP  ${label.padEnd(26)} | ${cell(m)}`);
  }
  return rows;
}

/** Third and 1: how often each short-yardage run (`short`) gets the yard. */
function shortRows(plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  for (const playDef of plays) {
    const conv = CORE_CALLS.map((call) => {
      let n = 0;
      let made = 0;
      for (let i = 0; i < RUN_REPS; i++) {
        const r = runRep(playDef, call, rng);
        if (!r.o || !r.ran) continue;
        n++;
        if (r.yds >= 1) made++;
      }
      return `${call.name.trim()} ${((made / Math.max(1, n)) * 100).toFixed(0)}%`;
    });
    rows.push(`SHORT ${playDef.name.padEnd(12)} 3rd & 1 | ${conv.join('  ')}`);
  }
  return rows;
}

/**
 * The whole defensive playbook, one block per call: the pass book at a quick and a normal hold, the
 * PA book, every run, and the short-yardage runs on 3rd and 1. The core rows above stay on the
 * original three calls so they compare against the baseline.
 */
function defenseRows(pass: PlayDef[], pa: PlayDef[], runs: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  const short = PLAYBOOK.filter((p) => p.short);
  for (const call of DEF_CALLS) {
    const tag = `DEF  ${call.name.padEnd(15)}`;
    rows.push(`${tag} pass 1.2s | ${passLine(pass, call, 1.2, REPS, rng)}`);
    rows.push(`${tag} pass 2.2s | ${passLine(pass, call, 2.2, REPS, rng)}`);
    rows.push(`${tag} PA   2.2s | ${passLine(pa, call, 2.2, REPS, rng)}`);
    const all: number[] = [];
    for (let i = 0; i < RUN_REPS * 4; i++) {
      const r = runRep(runs[i % runs.length], call, rng);
      if (r.o && r.ran) all.push(r.yds);
    }
    rows.push(`${tag} runs      | ${runLine(all)}`);
    const conv = short.map((p) => {
      const ys: number[] = [];
      for (let i = 0; i < RUN_REPS / 2; i++) {
        const r = runRep(p, call, rng);
        if (r.o && r.ran) ys.push(r.yds);
      }
      const made = ys.filter((y) => y >= 1).length;
      return `${p.name} ${((made / Math.max(1, ys.length)) * 100).toFixed(0)}% ${(ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length)).toFixed(1)}y`;
    });
    rows.push(`${tag} short     | ${conv.join('  ')}`);
  }
  return rows;
}

// ---------------------------------------------------------------- special teams

const KREPS = 200;
const OWN = (yd: number) => 10 + yd;
const fieldLbl = (x: number) => (x - 10 <= 50 ? `own ${x - 10}` : `opp ${110 - x}`);

/** Direction from the kick spot to a target point on the field. */
function toward(from: { x: number; y: number }, x: number, y: number) {
  const l = Math.hypot(x - from.x, y - from.y);
  return { x: (x - from.x) / l, y: (y - from.y) / l };
}

function puntRows(rng: Rng): string[] {
  const rows: string[] = [];
  const cases: [string, number, (kp: KickPlay) => KickParams][] = [
    ['punt', OWN(30), () => ({ power: 1, dir: { x: 1, y: 0 }, loft: 54 })],
    ['pooch', OWN(60), () => ({ power: 0.74, dir: { x: 1, y: 0 }, loft: 64 })],
    ['coffin', OWN(62), (kp) => ({ power: 0.85, dir: toward(kp.kicker.pos, 104, 52), loft: 46 })],
    ['line-drive', OWN(30), () => ({ power: 1, dir: { x: 1, y: 0 }, loft: 34 })],
  ];
  for (const [id, los, params] of cases) {
    const kd = kickDef(id);
    const s = { n: 0, gross: 0, net: 0, tb: 0, fc: 0, ret: 0, retY: 0, blk: 0, i20: 0, td: 0, oob: 0, downed: 0, muff: 0 };
    for (let i = 0; i < KREPS; i++) {
      const { o, catchX } = runKick(kd, los, params, newWind(rng), rng);
      if (!o) continue;
      s.n++;
      const a = applyKick(startDrive(los - 10), o);
      const cpuStart = a.change.kind === 'cpuBall' ? a.change.cpuStart : null;
      if (o.result === 'blocked') s.blk++;
      if (o.result === 'returnTd') s.td++;
      if (o.result === 'recovered') s.muff++;
      if (o.result === 'touchback') s.tb++;
      if (o.result === 'fairCatch') s.fc++;
      if (o.result === 'oob') s.oob++;
      if (o.result === 'downed') s.downed++;
      if (o.result === 'returned' && catchX !== null) {
        s.ret++;
        s.retY += catchX - o.spot;
      }
      const end = o.result === 'returned' && catchX !== null ? catchX : o.result === 'touchback' ? 110 : o.spot;
      s.gross += Math.min(110, end) - los;
      if (cpuStart !== null) {
        s.net += 110 - los - cpuStart;
        if (cpuStart <= 20) s.i20++;
      }
    }
    const pct = (k: number) => `${((k / s.n) * 100).toFixed(0)}%`;
    rows.push(
      `PUNT ${kd.name.padEnd(14)} from ${fieldLbl(los)} | gross ${(s.gross / s.n).toFixed(1)} net ${(s.net / s.n).toFixed(1)} ` +
        `in20 ${pct(s.i20)} tb ${pct(s.tb)} fc ${pct(s.fc)} oob ${pct(s.oob)} downed ${pct(s.downed)} ` +
        `ret ${pct(s.ret)} (${(s.retY / Math.max(1, s.ret)).toFixed(1)} avg) blk ${s.blk} td ${s.td} muff-rec ${s.muff}`,
    );
  }
  return rows;
}

function kickoffRows(rng: Rng): string[] {
  const rows: string[] = [];
  const tee = { x: 45, y: 26.6 };
  const cases: [string, (kp: KickPlay) => KickParams][] = [
    ['ko-deep', () => ({ power: 1, dir: { x: 1, y: 0 }, loft: 45 })],
    ['ko-sky', () => ({ power: 0.62, dir: { x: 1, y: 0 }, loft: 62 })],
    ['ko-squib', () => ({ power: 1, dir: { x: 1, y: 0 }, loft: 12 })],
    ['ko-corner', () => ({ power: 0.97, dir: toward(tee, 105, 46), loft: 42 })],
  ];
  for (const [id, params] of cases) {
    const kd = kickDef(id);
    const s = { n: 0, start: 0, tb: 0, fc: 0, ret: 0, retY: 0, oob: 0, td: 0, rec: 0 };
    for (let i = 0; i < KREPS; i++) {
      const { o, catchX } = runKick(kd, 45, params, newWind(rng), rng);
      if (!o) continue;
      s.n++;
      const a = applyKick(startDrive(25), o);
      if (a.change.kind === 'cpuBall') s.start += a.change.cpuStart;
      if (o.result === 'touchback') s.tb++;
      if (o.result === 'fairCatch') s.fc++;
      if (o.result === 'oob') s.oob++;
      if (o.result === 'returnTd') s.td++;
      if (o.result === 'recovered') s.rec++;
      if (o.result === 'returned' && catchX !== null) {
        s.ret++;
        s.retY += catchX - o.spot;
      }
    }
    const pct = (k: number) => `${((k / s.n) * 100).toFixed(0)}%`;
    const owned = s.n - s.td - s.rec;
    rows.push(
      `KO   ${kd.name.padEnd(14)} | cpu start ${(s.start / Math.max(1, owned)).toFixed(1)} tb ${pct(s.tb)} fc ${pct(s.fc)} oob ${pct(s.oob)} ` +
        `ret ${pct(s.ret)} (${(s.retY / Math.max(1, s.ret)).toFixed(1)} avg) td ${s.td} muff-rec ${s.rec}`,
    );
  }
  return rows;
}

function fgRows(rng: Rng): string[] {
  const rows: string[] = [];
  const kd = kickDef('fg');
  for (const windy of [false, true]) {
    const bands: string[] = [];
    for (const [lo, hi] of [[20, 29], [30, 39], [40, 49], [50, 59]]) {
      let made = 0;
      let blk = 0;
      for (let i = 0; i < KREPS; i++) {
        const yds = lo + Math.floor(rng() * (hi - lo + 1));
        const los = 110 - (yds - 17);
        const power = clamp(0.62 + (yds - 20) * 0.011, 0.62, 1);
        const { o } = runKick(kd, los, () => ({ power, dir: { x: 1, y: 0 }, loft: 38 }), windy ? newWind(rng) : CALM, rng);
        if (o?.result === 'fgGood') made++;
        if (o?.result === 'blocked') blk++;
      }
      bands.push(`${lo}-${hi}: ${((made / KREPS) * 100).toFixed(0)}%${blk ? ` (${blk} blk)` : ''}`);
    }
    rows.push(`FG   ${windy ? 'wind' : 'calm'} straight aim | ${bands.join('  ')}`);
  }
  return rows;
}

/**
 * `BAL_ONLY=a,b` limits the per-play rows (RUN, SHORT, PLAY) to plays whose id or kind is listed,
 * for checking one family at a time. The aggregate PASS / PA rows always use the whole book.
 */
const only = process.env.BAL_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
const picked = (p: PlayDef) => !only || only.includes(p.id) || only.includes(p.kind);

// Run with `npm run balance`; results go to balance.txt.
it.runIf(process.env.npm_lifecycle_event === 'balance')('balance report', () => {
  const rng = mulberry32(42);
  const pass = PLAYBOOK.filter((p) => p.kind === 'pass');
  const pa = PLAYBOOK.filter((p) => p.kind === 'pa' && p.block === 'pass');
  // RPOs ride along as runs: the auto-QB always gives, so their rows measure the run half only.
  const runs = PLAYBOOK.filter((p) => (p.kind === 'run' || p.read === 'rpo') && picked(p));
  const rows = [...passRows('PASS', pass, rng), '', ...passRows('PA  ', pa, rng), '', ...runRows(runs, rng)];
  // Kicks use their own RNG so they don't shift the scrimmage rows.
  const krng = mulberry32(7);
  rows.push('', ...puntRows(krng), '', ...kickoffRows(krng), '', ...fgRows(krng));
  // Per-play rows also get their own RNG, after everything else.
  rows.push('', ...perPlayRows([...pass, ...pa].filter(picked), mulberry32(11)));
  rows.push('', ...shortRows(PLAYBOOK.filter((p) => p.short && picked(p)), mulberry32(13)));
  if (!only || only.includes('gap')) rows.push('', ...gapRows(mulberry32(23)));
  if (!only || only.includes('route')) rows.push('', ...routeRows(mulberry32(17)));
  if (!only || only.includes('defense')) rows.push('', ...defenseRows(pass, pa, runs, mulberry32(19)));
  if (!only || only.includes('adaptive')) rows.push('', ...adaptiveRows());
  writeFileSync(process.env.BAL_OUT ?? 'balance.txt', rows.join('\n'));
}, 1_200_000);
