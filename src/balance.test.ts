import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { DEF_CALLS, type DefCall } from './data/defenses';
import { PLAYBOOK, type PlayDef } from './data/plays';
import { kickDef, type KickDef } from './data/specialTeams';
import { generateRoster, TEAMS } from './data/teams';
import { Camera } from './engine/camera';
import { STEP } from './engine/constants';
import type { Input } from './engine/input';
import { add, clamp, dist, mulberry32, scale, type Rng } from './engine/math';
import { KickPlay } from './game/kickPlay';
import { Play } from './game/playState';
import { applyKick, startDrive } from './game/rules';
import { newWind } from './game/wind';
import { CALM, type KickParams, type Wind } from './sim/kicking';
import { isEligible } from './sim/player';

const fakeInput = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
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
function passLine(plays: PlayDef[], call: DefCall, holdTime: number, reps: number, rng: Rng): string {
  const stats = { n: 0, comp: 0, int: 0, sack: 0, yards: 0, sackT: 0, pbu: 0, yac: 0, td: 0 };
  for (let i = 0; i < reps; i++) {
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
  return (
    `comp ${((stats.comp / att) * 100).toFixed(0)}% ` +
    `int ${((stats.int / att) * 100).toFixed(1)}% pbu ${stats.pbu} sack ${stats.sack}` +
    `${stats.sack ? ` (avg ${(stats.sackT / stats.sack).toFixed(1)}s)` : ''} | ypp ${(stats.yards / stats.n).toFixed(1)} yac ${(stats.yac / Math.max(1, stats.comp)).toFixed(1)} td ${stats.td}`
  );
}

function passRows(label: string, plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  for (const call of DEF_CALLS) {
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
    for (const call of DEF_CALLS) {
      for (const holdTime of [1.2, 2.2]) {
        rows.push(`PLAY ${p.name.padEnd(14)} ${call.name.padEnd(15)} hold ${holdTime}s | ${passLine([p], call, holdTime, REPS, rng)}`);
      }
    }
  }
  return rows;
}

/** Zone read: the auto-QB rides the back this long after the snap before reading the key. */
const READ_AT = 0.55;

/**
 * Auto-QB hands off (or pitches on the toss) as soon as it's on; `autoRun` carries the ball.
 * On a zone read it rides the mesh, then gives unless the key is crashing (then the QB keeps).
 */
function runRows(plays: PlayDef[], rng: Rng): string[] {
  const rows: string[] = [];
  const all = { n: 0, yards: 0, stuff: 0, boom: 0, list: [] as number[] };
  for (const playDef of plays) {
    for (const call of DEF_CALLS) {
      const s = { n: 0, yards: 0, stuff: 0, boom: 0, fum: 0, td: 0, none: 0, keep: 0, keepY: 0 };
      for (let i = 0; i < REPS / 2; i++) {
        const play = newPlay(playDef, call, rng);
        play.snap();
        for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
          const opt = play.handoffOption();
          const zr = playDef.read === 'zoneRead';
          const ready = !zr || (play.time - play.snapTime >= READ_AT && !play.keyCrashing());
          if ((opt === 'handoff' && ready) || (opt === 'pitch' && playDef.read === 'pitch')) play.handoff();
          if (play.handedOff || play.kept) play.controlled = null;
          play.update(STEP, fakeInput, cam);
        }
        const o = play.outcome;
        if (!o) continue;
        if (!play.handedOff && !play.kept) {
          s.none++;
          continue;
        }
        const yds = o.spot - LOS;
        if (play.kept) {
          s.keep++;
          s.keepY += yds;
        }
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
          `stuff ${pct(s.stuff)} 10+ ${pct(s.boom)} fum ${s.fum} td ${s.td}${s.none ? ` no-handoff ${s.none}` : ''}` +
          `${s.keep ? ` keep ${s.keep} (${(s.keepY / s.keep).toFixed(1)} ypc)` : ''}`,
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

// ---------------------------------------------------------------- special teams

const KREPS = 200;
const OWN = (yd: number) => 10 + yd;
const fieldLbl = (x: number) => (x - 10 <= 50 ? `own ${x - 10}` : `opp ${110 - x}`);

/** Auto-kicker: release `params` at the first chance (punts: as soon as the punter has the ball). */
function runKick(kd: KickDef, los: number, params: (kp: KickPlay) => KickParams, wind: Wind, rng: Rng) {
  const kp = new KickPlay({ kickTeam: off, recvTeam: def, kickRoster: offR, recvRoster: defR, def: kd, los, ballY: 26.6, wind, rng });
  const release = (p: KickParams) => (kp as any).release(p);
  if (kd.unit === 'punt') kp.snap();
  else release(params(kp));
  let released = kd.unit !== 'punt';
  let catchX: number | null = null;
  for (let t = 0; t < 25 && kp.phase !== 'over'; t += STEP) {
    if (!released && kp.phase === 'set') {
      release(params(kp));
      released = true;
    }
    kp.update(STEP, fakeInput);
    if (catchX === null && kp.phase === 'return') catchX = kp.carrier!.pos.x;
  }
  return { kp, o: kp.outcome, catchX };
}

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

// Run with `npm run balance`; results go to balance.txt.
it.runIf(process.env.npm_lifecycle_event === 'balance')('balance report', () => {
  const rng = mulberry32(42);
  const pass = PLAYBOOK.filter((p) => p.kind === 'pass');
  const pa = PLAYBOOK.filter((p) => p.kind === 'pa' && p.block === 'pass');
  const runs = PLAYBOOK.filter((p) => p.kind === 'run' && !p.qbRun);
  const rows = [...passRows('PASS', pass, rng), '', ...passRows('PA  ', pa, rng), '', ...runRows(runs, rng)];
  // Kicks use their own RNG so they don't shift the scrimmage rows.
  const krng = mulberry32(7);
  rows.push('', ...puntRows(krng), '', ...kickoffRows(krng), '', ...fgRows(krng));
  // Per-play rows also get their own RNG, after everything else.
  rows.push('', ...perPlayRows([...pass, ...pa], mulberry32(11)));
  writeFileSync(process.env.BAL_OUT ?? 'balance.txt', rows.join('\n'));
}, 600_000);
