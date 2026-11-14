/**
 * `npm run drives`: CPU possessions played through the engine against the drive sim on the same
 * matchups (docs/ENGINEDRIVES.md). Real generated rosters, every program's real OC (style, book,
 * pass share) and DC (identity, ADJUST, SCOUT), with each defense's learning brain on. The drive sim
 * is the control: it's fit to real FBS scores, so the engine has to land on its rows before it
 * replaces it in the user's games.
 */
import { buildStaff, dcAdjust, ocAdjust, type Coach } from './data/coaches';
import { offIdentity } from './data/offIdentity';
import { coverOf, ML_OC, newOcBrain, ocHalftime, type OcBrain } from './game/ocBrain';
import { buildSquad, onField, teamConf, teamRatings, type Squad } from './data/depth';
import { defIdentity } from './data/identity';
import { ocBook, ocStyle, type OffStyle } from './data/offStyles';
import { DEF_SLOTS, TEAMS, type RosterPlayer, type Team } from './data/teams';
import { clamp, gauss, mulberry32, type Rng } from './engine/math';
import { halftime, newBrain, newDrive, teamSmarts, type DefBrain } from './game/defBrain';
import { driveStream, engineDrive, type EngineSide, type EngineSnap } from './game/engineDrive';
import { rosterRead } from './game/offModel';
import { simulateDrive, userStartAfter, type DriveClock, type DriveSim, type SimPlay } from './game/rules';
import { GAME_SIM } from './season/simGame';
import { autoGamePlan } from './season/staff';
import { successful } from './season/grades';
import { writeFileSync } from 'node:fs';
import { OFF_MAN } from './sim/ai';
import { PA_BITE } from './game/playState';
import { cell, filmOk, sitBin } from './game/offModel';
import { DEF_CALLS } from './data/defenses';
import { overall, SLOT_POS } from './data/positions';
import { rushers } from './data/defenses';

export const DRIVES = {
  /** Games per run (`DRIVES_GAMES`); each is played by both the engine and the drive sim. */
  games: 60,
  /** The matchups' seed (`DRIVES_SEED` for another set: an out-of-sample check of the payoff table). */
  seed: Number(process.env.DRIVES_SEED ?? 20261114),
  halfSecs: 1800,
};

/** The acceptance bands (docs/ENGINEDRIVES.md): the engine against the drive sim, and absolute targets. */
export const BANDS = {
  ptsPerDrive: 0.15,
  winPct: 5,
  big20: [4, 7],
  turnoverPct: [1.6, 2.6],
  comp: [58, 66],
  sackPct: [5, 8],
  ypc: [4.5, 5.5],
};

interface Ctx {
  team: Team;
  squad: Squad;
  roster: Record<string, RosterPlayer>;
  off: number;
  def: number;
  ovr: number;
  side: EngineSide;
  style: OffStyle;
  dc: Coach;
  dcStyle: string;
  oc: Coach;
}

const ctxCache = new Map<string, Ctx>();
function ctxOf(team: Team): Ctx {
  let c = ctxCache.get(team.id);
  if (!c) {
    const squad = buildSquad(team);
    const roster = onField(squad);
    const tr = teamRatings(squad);
    const staff = buildStaff(team);
    const ident = defIdentity(team, staff.DC);
    const book = ocBook(staff.OC);
    const style = ocStyle(staff.OC);
    const passShare = autoGamePlan(squad, squad, staff.OC).passShare;
    const id = process.env.DRIVES_ID === '0' ? undefined : offIdentity(staff.OC, roster);
    c = { team, squad, roster, off: tr.off, def: tr.def, ovr: tr.ovr, side: { team, roster, oc: { book, style, passShare, id }, ident, conf: teamConf(squad) }, style, dc: staff.DC, dcStyle: ident.style, oc: staff.OC };
    ctxCache.set(team.id, c);
  }
  return c;
}

/** The defense's brain for a game against `off`: what its DC knows before kickoff (`Game` builds the CPU's the same way). */
function brainFor(def: Ctx, off: Ctx, seed: number): DefBrain | null {
  const qbSpd = off.roster.QB?.r.spd ?? 70;
  return newBrain({
    iq: (process.env.DRIVES_IQ as 'STATIC' | 'NORMAL' | 'SHARP' | undefined) ?? 'NORMAL', adjust: dcAdjust(def.dc), scout: def.dc.r.scout, qbMobility: clamp((qbSpd - 70) / 20, 0, 1), seed,
    smarts: teamSmarts(DEF_SLOTS.map((sl) => def.roster[sl]?.r.prc ?? 60)),
    book: off.side.oc.book, style: off.style, roster: rosterRead(off.roster), table: 'engine',
  });
}

interface DriveRec {
  gap: number;
  /** The offense's OC's ADJUST minus the defense's DC's, and each. */
  adj: number;
  ocAdj: number;
  dcAdj: number;
  /** The offense and the defense. */
  off: Ctx;
  def: Ctx;
  style: OffStyle;
  dcStyle: string;
  sim: DriveSim;
  defPoints: number;
  plays: SimPlay[];
  snaps: EngineSnap[];
  half: number;
}

interface GameRec {
  gap: number;
  /** Points of the team with the better overall, and of the other. */
  fav: number;
  dog: number;
  drives: DriveRec[];
}

if (process.env.DRIVES_ML_OC) Object.assign(ML_OC, JSON.parse(process.env.DRIVES_ML_OC));
// Engine mechanics on trial (DRIVES_MECH='{"OFF_MAN":{...},"PA_BITE":{...}}'): the report only.
if (process.env.DRIVES_MECH) {
  const m = JSON.parse(process.env.DRIVES_MECH);
  if (m.OFF_MAN) Object.assign(OFF_MAN, m.OFF_MAN);
  if (m.PA_BITE) Object.assign(PA_BITE, m.PA_BITE);
}
/** The offense's OC brain for a game against `def` (`DRIVES_OC=0`: none). */
function ocBrainFor(off: Ctx, def: Ctx, seed: number): OcBrain | null {
  if (process.env.DRIVES_OC === '0') return null;
  return newOcBrain({ adjust: ocAdjust(off.oc), scout: off.oc.r.scout, qbPrc: off.roster.QB?.r.prc ?? 60, def: def.side.ident, seed, defRoster: def.roster });
}

/** Which learners are on: the defense's DC brain and the offense's OC brain. */
interface Arm {
  dc: boolean;
  oc: boolean;
}

/** One game, simGame's loop (halves, pace, the next start), with each drive from the engine or the drive sim. */
function playGame(h: Ctx, a: Ctx, kind: 'engine' | 'sim', rng: Rng, arm: Arm = { dc: true, oc: true }): GameRec {
  const pace = clamp(1 + gauss(rng) * GAME_SIM.paceSd, 0.7, 1.3);
  const pts = new Map<Ctx, number>([[h, 0], [a, 0]]);
  const brains = new Map<Ctx, DefBrain | null>();
  const ocs = new Map<Ctx, OcBrain | null>();
  if (kind === 'engine') {
    const s1 = (rng() * 2 ** 31) >>> 0;
    const s2 = (rng() * 2 ** 31) >>> 0;
    brains.set(h, arm.dc ? brainFor(h, a, s1) : null);
    brains.set(a, arm.dc ? brainFor(a, h, s2) : null);
    ocs.set(h, arm.oc ? ocBrainFor(h, a, s1 ^ 0x3c6ef372) : null);
    ocs.set(a, arm.oc ? ocBrainFor(a, h, s2 ^ 0x3c6ef372) : null);
  }
  const drives: DriveRec[] = [];
  const firstHalf = rng() < 0.5 ? h : a;
  for (let half = 0; half < 2; half++) {
    if (half === 1) {
      for (const b of brains.values()) if (b) halftime(b);
      for (const b of ocs.values()) if (b) ocHalftime(b);
    }
    let off = half === 0 ? firstHalf : firstHalf === h ? a : h;
    let start = 25;
    let left = DRIVES.halfSecs;
    while (left > 0) {
      const dfn = off === h ? a : h;
      const lead = pts.get(off)! - pts.get(dfn)!;
      const clock: DriveClock = { timeLeft: left, hurry: false, milk: false, pace, lead, finalHalf: half === 1, qSecs: DRIVES.halfSecs / 2 };
      const plays: SimPlay[] = [];
      let d: DriveSim;
      let defPoints = 0;
      let snaps: EngineSnap[] = [];
      if (kind === 'sim') {
        const script = GAME_SIM.script * clamp(lead, -GAME_SIM.scriptCap, GAME_SIM.scriptCap);
        d = simulateDrive(off.off - script, dfn.def, start, rng, clock, (p) => plays.push(p));
      } else {
        const b = brains.get(dfn) ?? null;
        if (b) newDrive(b);
        const e = engineDrive(off.side, dfn.side, start, driveStream(rng), clock, { brain: b, ocBrain: ocs.get(off) ?? null, onPlay: (p) => plays.push(p), pace, noCheck: process.env.DRIVES_CHECK === '0' });
        d = e;
        defPoints = e.defPoints;
        snaps = e.snaps;
      }
      drives.push({ gap: off.off - dfn.def, adj: ocAdjust(off.oc) - dcAdjust(dfn.dc), ocAdj: ocAdjust(off.oc), dcAdj: dcAdjust(dfn.dc), off, def: dfn, style: off.style, dcStyle: dfn.dcStyle, sim: d, defPoints, plays, snaps, half });
      pts.set(off, pts.get(off)! + d.points);
      pts.set(dfn, pts.get(dfn)! + defPoints);
      left -= d.secs;
      if (d.result === 'END OF HALF') break;
      if (defPoints === 7) {
        start = 25; // a pick six: the scored-on offense gets the kickoff back
        continue;
      }
      start = defPoints === 2 ? 40 : userStartAfter(d, rng);
      off = dfn;
    }
  }
  const favH = h.ovr >= a.ovr;
  return { gap: Math.abs(h.ovr - a.ovr), fav: pts.get(favH ? h : a)!, dog: pts.get(favH ? a : h)!, drives };
}

// ---------------------------------------------------------------- the rows

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-');
const pad = (s: string, n: number) => s.padStart(n);

interface Agg {
  drives: number;
  pts: number;
  td: number;
  fg: number;
  punt: number;
  to: number;
  downs: number;
  plays: number;
  yards: number;
  big20: number;
  third: number;
  thirdConv: number;
  // engine only
  dropbacks: number;
  att: number;
  comp: number;
  passYds: number;
  ints: number;
  sacks: number;
  scrambles: number;
  away: number;
  carries: number;
  rushYds: number;
  fumbles: number;
}

const blank = (): Agg => ({
  drives: 0, pts: 0, td: 0, fg: 0, punt: 0, to: 0, downs: 0, plays: 0, yards: 0, big20: 0, third: 0, thirdConv: 0,
  dropbacks: 0, att: 0, comp: 0, passYds: 0, ints: 0, sacks: 0, scrambles: 0, away: 0, carries: 0, rushYds: 0, fumbles: 0,
});

function add(a: Agg, d: DriveRec): void {
  a.drives++;
  a.pts += d.sim.points - d.defPoints;
  const r = d.sim.result;
  if (r === 'TOUCHDOWN') a.td++;
  else if (r === 'FIELD GOAL') a.fg++;
  else if (r === 'PUNT') a.punt++;
  else if (r === 'TURNOVER') a.to++;
  else if (r === 'DOWNS') a.downs++;
  for (const p of d.plays) {
    if (p.kneel || p.fg || p.punt) continue;
    a.plays++;
    a.yards += p.gain;
    if (p.gain >= 20) a.big20++;
    if (p.down === 3) {
      a.third++;
      if (!p.turnover && p.gain >= p.toGo) a.thirdConv++;
    }
  }
  for (const s of d.snaps) {
    if (s.pass) {
      a.dropbacks++;
      if (s.type === 'sack') a.sacks++;
      if (s.qb?.scrambled && s.qb.runWhy !== 'rpo' && s.type !== 'sack') a.scrambles++;
      if (s.qb?.why === 'away') a.away++;
      if (s.thrown) {
        a.att++;
        if (s.complete) {
          a.comp++;
          a.passYds += s.gain;
        }
        if (s.type === 'int' || s.type === 'pick6') a.ints++;
      } else if (s.type !== 'sack') {
        a.carries++;
        a.rushYds += s.gain;
      }
    } else {
      a.carries++;
      a.rushYds += s.gain;
    }
    if (s.lostFumble) a.fumbles++;
  }
}

const driveHead = `${'group'.padEnd(16)}${pad('n', 6)}${pad('pts/dr', 8)}${pad('TD%', 6)}${pad('FG%', 6)}${pad('punt%', 7)}${pad('TO%', 6)}${pad('dwn%', 6)}${pad('pl/dr', 7)}${pad('ypp', 6)}${pad('20+%', 6)}${pad('TO/pl', 7)}${pad('3rd%', 6)}`;
function driveRow(label: string, a: Agg): string {
  const tos = a.to; // turnovers end drives
  return `${label.padEnd(16)}${pad(String(a.drives), 6)}${pad(f2(a.pts / a.drives), 8)}${pad(f1(pct(a.td, a.drives)), 6)}${pad(f1(pct(a.fg, a.drives)), 6)}${pad(f1(pct(a.punt, a.drives)), 7)}${pad(f1(pct(a.to, a.drives)), 6)}${pad(f1(pct(a.downs, a.drives)), 6)}${pad(f1(a.plays / a.drives), 7)}${pad(f1(a.yards / a.plays), 6)}${pad(f1(pct(a.big20, a.plays)), 6)}${pad(f1(pct(tos, a.plays)), 7)}${pad(f1(pct(a.thirdConv, a.third)), 6)}`;
}

const passHead = `${'group'.padEnd(16)}${pad('drop%', 7)}${pad('comp%', 7)}${pad('ypa', 6)}${pad('int%', 6)}${pad('sack%', 7)}${pad('scr%', 6)}${pad('away%', 7)}${pad('ypc', 6)}${pad('fum%', 6)}`;
function passRow(label: string, a: Agg): string {
  return `${label.padEnd(16)}${pad(f1(pct(a.dropbacks, a.plays)), 7)}${pad(f1(pct(a.comp, a.att)), 7)}${pad(f1(a.passYds / a.att), 6)}${pad(f1(pct(a.ints, a.att)), 6)}${pad(f1(pct(a.sacks, a.dropbacks)), 7)}${pad(f1(pct(a.scrambles, a.dropbacks)), 6)}${pad(f1(pct(a.away, a.att)), 7)}${pad(f1(a.rushYds / a.carries), 6)}${pad(f2(pct(a.fumbles, a.plays)), 6)}`;
}

const GAP_BUCKETS: [string, (g: number) => boolean][] = [
  ['gap <= -8', (g) => g <= -8],
  ['gap -8..-3', (g) => g > -8 && g <= -3],
  ['gap -3..3', (g) => g > -3 && g < 3],
  ['gap 3..8', (g) => g >= 3 && g < 8],
  ['gap >= 8', (g) => g >= 8],
];
const GAME_BUCKETS: [string, number, number][] = [['0-4', 0, 4], ['4-8', 4, 8], ['8-14', 8, 14], ['14+', 14, 99]];

/** Points a drive (and ypp) for `off` against `def` from the 25 on a neutral clock, `n` drives, no brains. */
function drivePts(off: EngineSide, def: EngineSide, n: number, seed: number): { pts: number; ypp: number } {
  let pts = 0, yds = 0, plays = 0;
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const e = engineDrive(off, def, 25, driveStream(rng), { timeLeft: 900, hurry: false, milk: false, lead: 0, finalHalf: false, qSecs: 900 }, { brain: null });
    pts += e.points - e.defPoints;
    for (const s of e.snaps) {
      yds += s.gain;
      plays++;
    }
  }
  return { pts: pts / n, ypp: yds / Math.max(1, plays) };
}

/** Units for the swap ablation, by on-field slot. */
const UNITS: Record<string, string[]> = {
  QB: ['QB'], OL: ['LT', 'LG', 'C', 'RG', 'RT'], REC: ['X', 'Z', 'SL', 'TE', 'TE2', 'WR4'], RB: ['RB', 'FB'],
  DL: ['DE1', 'DT1', 'DT2', 'DE2'], LB: ['WLB', 'MLB', 'SAM'], DB: ['CB1', 'CB2', 'NB', 'FS', 'SS', 'DIME'],
};

/**
 * The unit swap (DRIVES_UNITS=1): in lopsided pairs, the weaker side gets the stronger team's players in one unit
 * at a time; how many points a drive each unit's gap is worth, on offense and on defense.
 */
export function unitsReport(): string[] {
  const out: string[] = [];
  const pairs: [Ctx, Ctx][] = [];
  const ctxs = TEAMS.map(ctxOf).sort((a, b) => b.ovr - a.ovr);
  const pick = mulberry32(DRIVES.seed + 1);
  while (pairs.length < Number(process.env.DRIVES_PAIRS ?? 12)) {
    const a = ctxs[Math.floor(pick() * 30)];
    const b = ctxs[ctxs.length - 1 - Math.floor(pick() * 40)];
    if (a.ovr - b.ovr >= 10) pairs.push([a, b]);
  }
  const n = Number(process.env.DRIVES_N ?? 40);
  const swap = (side: EngineSide, from: Ctx, slots: string[], keys?: string[]): EngineSide => {
    const roster = { ...side.roster };
    for (const sl of slots) {
      const f = from.roster[sl];
      if (!f) continue;
      if (!keys || !roster[sl]) roster[sl] = f;
      else roster[sl] = { ...roster[sl], r: { ...roster[sl].r, ...Object.fromEntries(keys.map((k) => [k, f.r[k as keyof typeof f.r]])) } };
    }
    return { ...side, roster };
  };
  // A unit's ratings by group, for the defense-side split (DRIVES_SPLIT=1).
  const SPLIT: [string, string[], string[]][] = [
    ['DB speed', UNITS.DB, ['spd', 'acc']], ['DB cover', UNITS.DB, ['mcv', 'zcv', 'prc', 'prs']], ['DB hands', UNITS.DB, ['cth', 'cit']], ['DB tackle', UNITS.DB, ['tkl', 'str', 'bsh']],
    ['DL speed', UNITS.DL, ['spd', 'acc']], ['DL rush', UNITS.DL, ['rsh']], ['DL shed/str', UNITS.DL, ['bsh', 'str']], ['DL tackle', UNITS.DL, ['tkl', 'prc']],
    ['LB speed', UNITS.LB, ['spd', 'acc']], ['LB tackle', UNITS.LB, ['tkl', 'bsh', 'str']], ['LB cover/read', UNITS.LB, ['mcv', 'zcv', 'prc']],
  ];
  out.push(`UNIT SWAP: ${pairs.length} lopsided pairs (overall gap 10+), ${n} drives each from the 25; the weak side borrows one strong unit`);
  const base = { so: 0, wo: 0 };
  const rows: Record<string, { def: number; off: number }> = {};
  for (const [i, [st, wk]] of pairs.entries()) {
    const so = drivePts(st.side, wk.side, n, i * 31 + 1).pts;
    const wo = drivePts(wk.side, st.side, n, i * 31 + 2).pts;
    base.so += so / pairs.length;
    base.wo += wo / pairs.length;
    for (const [u, slots] of Object.entries(UNITS)) {
      const r = (rows[u] ??= { def: 0, off: 0 });
      r.def += (drivePts(st.side, swap(wk.side, st, slots), n, i * 31 + 1).pts - so) / pairs.length;
      r.off += (drivePts(swap(wk.side, st, slots), st.side, n, i * 31 + 2).pts - wo) / pairs.length;
    }
  }
  if (process.env.DRIVES_SPLIT === '1') {
    out.push('weak D borrows only these ratings of the strong unit (points a drive allowed, change):');
    for (const [label, slots, keys] of SPLIT) {
      let dlt = 0;
      for (const [i, [st, wk]] of pairs.entries()) {
        const so = drivePts(st.side, wk.side, n, i * 31 + 1).pts;
        dlt += (drivePts(st.side, swap(wk.side, st, slots, keys), n, i * 31 + 1).pts - so) / pairs.length;
      }
      out.push(`  ${label.padEnd(16)}${pad(f2(dlt), 8)}`);
    }
  }
  out.push(`strong offense vs weak defense: ${f2(base.so)} pts/drive;  weak offense vs strong defense: ${f2(base.wo)}`);
  out.push(`${'unit'.padEnd(6)}${pad('weak D borrows it', 20)}${pad('weak O borrows it', 20)}`);
  for (const [u, r] of Object.entries(rows)) out.push(`${u.padEnd(6)}${pad(f2(r.def), 20)}${pad(f2(r.off), 20)}`);
  return out;
}

export function drivesReport(): string[] {
  const games = Number(process.env.DRIVES_GAMES ?? DRIVES.games);
  const pick = mulberry32(DRIVES.seed);
  const pairs: [Team, Team][] = [];
  for (let i = 0; i < games; i++) {
    const h = TEAMS[Math.floor(pick() * TEAMS.length)];
    let a = TEAMS[Math.floor(pick() * TEAMS.length)];
    while (a === h) a = TEAMS[Math.floor(pick() * TEAMS.length)];
    pairs.push([h, a]);
  }
  const out: string[] = [];
  const recs: Record<'engine' | 'sim', GameRec[]> = { engine: [], sim: [] };
  const t0 = Date.now();
  let engineMs = 0;
  for (const [i, [h, a]] of pairs.entries()) {
    const hc = ctxOf(h);
    const ac = ctxOf(a);
    recs.sim.push(playGame(hc, ac, 'sim', mulberry32(DRIVES.seed ^ (i * 7919))));
    const e0 = Date.now();
    recs.engine.push(playGame(hc, ac, 'engine', mulberry32(DRIVES.seed ^ (i * 104729))));
    engineMs += Date.now() - e0;
  }
  out.push(`DRIVES: ${games} games, each played by the engine and by the drive sim (real rosters, OCs and DCs, brains on). ${((Date.now() - t0) / 1000).toFixed(0)} s; engine ${(engineMs / games).toFixed(0)} ms a game.`);
  out.push('');

  out.push('BY GAP (offense overall minus defense overall), per drive');
  out.push(driveHead);
  for (const [label, inB] of [['ALL', () => true] as [string, (g: number) => boolean], ...GAP_BUCKETS]) {
    for (const kind of ['sim', 'engine'] as const) {
      const a = blank();
      for (const g of recs[kind]) for (const d of g.drives) if (inB(d.gap)) add(a, d);
      if (a.drives) out.push(driveRow(`${label} ${kind === 'sim' ? 'SIM' : 'ENG'}`, a));
    }
  }
  out.push('');

  out.push('ENGINE PASS AND RUN, by gap');
  out.push(passHead);
  for (const [label, inB] of [['ALL', () => true] as [string, (g: number) => boolean], ...GAP_BUCKETS]) {
    const a = blank();
    for (const g of recs.engine) for (const d of g.drives) if (inB(d.gap)) add(a, d);
    if (a.drives) out.push(passRow(label, a));
  }
  out.push(`targets: comp ${BANDS.comp.join('-')}%, sacks ${BANDS.sackPct.join('-')}% of dropbacks, ypc ${BANDS.ypc.join('-')}, turnovers ${BANDS.turnoverPct.join('-')}% a play, 20+ ${BANDS.big20.join('-')}% (docs/ENGINEDRIVES.md)`);
  out.push('');

  out.push('GAMES, by team overall gap: favorite win % and points per team');
  out.push(`${'gap'.padEnd(8)}${pad('n', 5)}${pad('SIM win%', 10)}${pad('ENG win%', 10)}${pad('SIM fav-dog', 13)}${pad('ENG fav-dog', 13)}${pad('SIM pts', 9)}${pad('ENG pts', 9)}`);
  for (const [label, lo, hi] of [['all', 0, 99] as [string, number, number], ...GAME_BUCKETS]) {
    const row = (kind: 'sim' | 'engine') => {
      const gs = recs[kind].filter((g) => g.gap >= lo && g.gap < hi);
      const win = gs.reduce((s, g) => s + (g.fav > g.dog ? 1 : g.fav === g.dog ? 0.5 : 0), 0);
      const fav = gs.reduce((s, g) => s + g.fav, 0) / (gs.length || 1);
      const dog = gs.reduce((s, g) => s + g.dog, 0) / (gs.length || 1);
      return { n: gs.length, win: pct(win, gs.length), fav, dog };
    };
    const s = row('sim');
    const e = row('engine');
    if (!s.n) continue;
    out.push(`${label.padEnd(8)}${pad(String(s.n), 5)}${pad(f1(s.win), 10)}${pad(f1(e.win), 10)}${pad(`${f1(s.fav)}-${f1(s.dog)}`, 13)}${pad(`${f1(e.fav)}-${f1(e.dog)}`, 13)}${pad(f1((s.fav + s.dog) / 2), 9)}${pad(f1((e.fav + e.dog) / 2), 9)}`);
  }
  out.push('');

  out.push('ENGINE BY OC STYLE (offense) and BY DC STYLE (defense), per drive');
  out.push(driveHead);
  const styles = [...new Set(recs.engine.flatMap((g) => g.drives.map((d) => d.style)))].sort();
  for (const st of styles) {
    const a = blank();
    for (const g of recs.engine) for (const d of g.drives) if (d.style === st) add(a, d);
    out.push(driveRow(`OC ${st}`, a));
  }
  const dcs = [...new Set(recs.engine.flatMap((g) => g.drives.map((d) => d.dcStyle)))].sort();
  for (const st of dcs) {
    const a = blank();
    for (const g of recs.engine) for (const d of g.drives) if (d.dcStyle === st) add(a, d);
    out.push(driveRow(`DC ${st}`, a));
  }
  out.push(passHead);
  for (const st of styles) {
    const a = blank();
    for (const g of recs.engine) for (const d of g.drives) if (d.style === st) add(a, d);
    out.push(passRow(`OC ${st}`, a));
  }
  out.push('');

  out.push('ENGINE BY HALF (the brains learn): points per drive');
  for (const half of [0, 1]) {
    const a = blank();
    for (const g of recs.engine) for (const d of g.drives) if (d.half === half) add(a, d);
    const s = blank();
    for (const g of recs.sim) for (const d of g.drives) if (d.half === half) add(s, d);
    out.push(`half ${half + 1}: ENG ${f2(a.pts / a.drives)}  SIM ${f2(s.pts / s.drives)}`);
  }
  out.push('');

  // Boom or bust: what each kind of snap is worth, the success rate (40% of the distance on 1st down, 60% on 2nd,
  // all of it on 3rd and 4th: `successful`, season/grades.ts), against rough FBS numbers.
  {
    const kindOf = (s: EngineSnap): string => {
      if (s.type === 'sack') return 'sack';
      if (s.qb?.why === 'away') return 'throwaway';
      if (s.thrown) return s.air < 0 ? 'pass behind' : s.air < 10 ? 'pass 0-9' : s.air < 20 ? 'pass 10-19' : 'pass 20+';
      if (s.pass) return s.qb?.scrambled ? 'scramble' : 'pass, no throw';
      return s.carrier === 'QB' ? 'QB carry' : 'run';
    };
    const ok = (s: EngineSnap) => successful({ gain: s.gain, down: s.down, toGo: s.toGo, pass: s.pass, ...(s.type === 'sack' ? { sack: true } : {}), ...(s.type === 'int' || s.type === 'pick6' || s.lostFumble ? { turnover: true } : {}) });
    const snaps = recs.engine.flatMap((g) => g.drives.flatMap((d) => d.snaps.filter((s) => s.qb?.why !== undefined || true)));
    const kinds = new Map<string, EngineSnap[]>();
    for (const s of snaps) kinds.set(kindOf(s), [...(kinds.get(kindOf(s)) ?? []), s]);
    out.push('ENGINE SUCCESS by kind of snap (success: 40% of the distance on 1st, 60% on 2nd, all on 3rd/4th)');
    out.push(`  ${'kind'.padEnd(16)}${pad('share', 7)}${pad('succ%', 7)}${pad('ypp', 6)}${pad('<=0%', 6)}${pad('10+%', 6)}`);
    for (const [k, ss] of [...kinds].sort((a, b) => b[1].length - a[1].length)) {
      out.push(`  ${k.padEnd(16)}${pad(f1(pct(ss.length, snaps.length)), 7)}${pad(f1(pct(ss.filter(ok).length, ss.length)), 7)}${pad(f1(ss.reduce((a, x) => a + x.gain, 0) / ss.length), 6)}${pad(f1(pct(ss.filter((x) => x.gain <= 0).length, ss.length)), 6)}${pad(f1(pct(ss.filter((x) => x.gain >= 10).length, ss.length)), 6)}`);
    }
    const all = snaps.filter(ok).length;
    const runs = snaps.filter((x) => !x.pass);
    const passes = snaps.filter((x) => x.pass);
    const ck = snaps.filter((x) => x.checked);
    // The red zone and the field: drives that got inside the 20 and what they came away with; where drives started.
    for (const kind of ['engine', 'sim'] as const) {
      const ds = recs[kind].flatMap((g) => g.drives);
      const rz = ds.filter((d) => d.sim.endYard >= 80 || d.sim.result === 'TOUCHDOWN' || (d.plays.some((p) => p.yard >= 80)));
      const td = rz.filter((d) => d.sim.result === 'TOUCHDOWN').length;
      const fg = rz.filter((d) => d.sim.result === 'FIELD GOAL').length;
      const st = ds.map((d) => d.sim.endYard - d.sim.yards);
      out.push(`  ${kind === 'engine' ? 'ENG' : 'SIM'} red zone trips ${f1(pct(rz.length, ds.length))}% of drives: TD ${f1(pct(td, rz.length))}%, FG ${f1(pct(fg, rz.length))}%   start own ${f1(st.reduce((a, b) => a + b, 0) / st.length)}   (FBS about 30% / 60% / 22%, start about 29)`);
    }
    out.push(`  presnap checks ${f1(pct(ck.length, snaps.length))}% of snaps, success ${f1(pct(ck.filter(ok).length, ck.length))}%, ypp ${f1(ck.reduce((a, x) => a + x.gain, 0) / (ck.length || 1))}`);
    out.push(`  ALL success ${f1(pct(all, snaps.length))}%  runs ${f1(pct(runs.filter(ok).length, runs.length))}%  dropbacks ${f1(pct(passes.filter(ok).length, passes.length))}%   (FBS about 42 / 42 / 42)`);
    // The drive sim's success rate, for scale.
    const simPlays = recs.sim.flatMap((g) => g.drives.flatMap((d) => d.plays.filter((p) => !p.kneel && !p.fg && !p.punt)));
    out.push(`  SIM success ${f1(pct(simPlays.filter((p) => successful({ gain: p.gain, down: p.down, toGo: p.toGo, pass: false, ...(p.turnover ? { turnover: true } : {}) })).length, simPlays.length))}%`);
    // By down: success, the average gain, and how far 3rd downs are.
    for (const dn of [1, 2, 3]) {
      const ss = snaps.filter((x) => x.down === dn);
      const sp = simPlays.filter((p) => p.down === dn);
      out.push(`  down ${dn}: ENG success ${pad(f1(pct(ss.filter(ok).length, ss.length)), 5)}%  gain ${pad(f1(ss.reduce((a, x) => a + x.gain, 0) / ss.length), 4)}  to go ${pad(f1(ss.reduce((a, x) => a + x.toGo, 0) / ss.length), 4)}   SIM gain ${pad(f1(sp.reduce((a, p) => a + p.gain, 0) / sp.length), 4)}  to go ${pad(f1(sp.reduce((a, p) => a + p.toGo, 0) / sp.length), 4)}`);
    }
    // 3rd down by distance: conversion and what was called (FBS about 1-2: 65-70%, 3-5: 50%, 6-9: 35%, 10+: 20-25%).
    const conv = (x: EngineSnap) => !x.lostFumble && x.type !== 'int' && x.type !== 'pick6' && x.gain >= x.toGo;
    const thirds = snaps.filter((x) => x.down === 3);
    const simThirds = simPlays.filter((p) => p.down === 3);
    out.push('  3rd down by distance:' + [[1, 2], [3, 5], [6, 9], [10, 99]].map(([lo, hi]) => {
      const t = thirds.filter((x) => x.toGo >= lo && x.toGo <= hi);
      const st = simThirds.filter((p) => p.toGo >= lo && p.toGo <= hi);
      return `  ${lo}-${hi === 99 ? '' : hi}: ENG ${f1(pct(t.filter(conv).length, t.length))}% (run ${f1(pct(t.filter((x) => !x.pass).length, t.length))}%, n ${t.length}) SIM ${f1(pct(st.filter((p) => !p.turnover && p.gain >= p.toGo).length, st.length))}%`;
    }).join(''));
    {
      const t = thirds.filter((x) => x.toGo <= 2);
      const by = new Map<string, EngineSnap[]>();
      for (const x of t) {
        const k = x.play.short ? 'short call' : x.pass ? (x.thrown ? 'throw' : 'dropback, no throw') : x.play.tags.family;
        by.set(k, [...(by.get(k) ?? []), x]);
      }
      out.push('  3rd and 1-2 by call:' + [...by].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => `  ${k} ${xs.length} ${f1(pct(xs.filter(conv).length, xs.length))}%`).join(''));
      const calls = new Map<string, number>();
      for (const x of t) if (!x.pass) calls.set(x.call.id, (calls.get(x.call.id) ?? 0) + 1);
      out.push('  the defense on them:' + [...calls].sort((a, b) => b[1] - a[1]).map(([k, n]) => ` ${k} ${f1(pct(n, t.filter((x) => !x.pass).length))}%`).join(''));
    }
    // The designed runs' gains in bands, against FBS (TARGETS.md light box: stuffs 15-22%, 4+ 45-50%, 10+ 10-14%).
    const rb = runs.filter((x) => x.carrier !== 'QB');
    const band = (lo: number, hi: number) => f1(pct(rb.filter((x) => x.gain >= lo && x.gain <= hi).length, rb.length));
    // By the overall gap: is it the mismatches or every game?
    for (const [label, inB] of GAP_BUCKETS) {
      const rr = recs.engine.flatMap((g) => g.drives.filter((d) => inB(d.gap)).flatMap((d) => d.snaps.filter((x) => !x.pass && x.carrier !== 'QB')));
      const bd = (lo: number, hi: number) => f1(pct(rr.filter((x) => x.gain >= lo && x.gain <= hi).length, rr.length));
      out.push(`  RB runs ${label.padEnd(11)}: <=0 ${bd(-99, 0)}%  1-3 ${bd(1, 3)}%  4-6 ${bd(4, 6)}%  7-9 ${bd(7, 9)}%  10+ ${bd(10, 999)}%  ypc ${f1(rr.reduce((a, x) => a + x.gain, 0) / rr.length)}`);
    }
    out.push(`  RB runs: <=0 ${band(-99, 0)}%  1-3 ${band(1, 3)}%  4-6 ${band(4, 6)}%  7-9 ${band(7, 9)}%  10+ ${band(10, 999)}%   (FBS about 18 / 32 / 25 / 12 / 12)`);
    const th = snaps.filter((x) => x.thrown && x.qb?.why !== 'away');
    const ab = (lo: number, hi: number) => f1(pct(th.filter((x) => x.air >= lo && x.air <= hi).length, th.length));
    out.push(`  attempts by air: behind ${ab(-99, -1)}%  0-9 ${ab(0, 9)}%  10-19 ${ab(10, 19)}%  20+ ${ab(20, 999)}%   (FBS about 20 / 45 / 22 / 13)`);
    out.push('');
  }

  // The runs by family: carries, ypc, median, stuffs, 10+.
  out.push('ENGINE RUNS by family (designed runs and RPO gives; QB keeps and scrambles counted to the call)');
  const fams = new Map<string, number[]>();
  for (const g of recs.engine) for (const d of g.drives) for (const s of d.snaps) {
    if (s.pass || s.type === 'sack') continue;
    const f = s.play.tags.family;
    fams.set(f, [...(fams.get(f) ?? []), s.gain]);
  }
  for (const [f, gs] of [...fams].sort((a, b) => b[1].length - a[1].length)) {
    const so = [...gs].sort((x, y) => x - y);
    out.push(`  ${f.padEnd(12)}${pad(String(gs.length), 6)} carries  ypc ${pad(f1(gs.reduce((a, b) => a + b, 0) / gs.length), 5)}  median ${pad(f1(so[Math.floor(so.length / 2)]), 4)}  stuff ${pad(f1(pct(gs.filter((x) => x <= 0).length, gs.length)), 5)}%  10+ ${pad(f1(pct(gs.filter((x) => x >= 10).length, gs.length)), 5)}%`);
  }
  out.push('');

  // Why the QB threw: the read, the checkdown, hot, screens, RPOs, throwaways.
  const why = new Map<string, number>();
  let thrown = 0;
  for (const g of recs.engine) for (const d of g.drives) for (const s of d.snaps) if (s.qb?.why) {
    why.set(s.qb.why, (why.get(s.qb.why) ?? 0) + 1);
    thrown++;
  }
  out.push(`ENGINE QB: why he threw  ${[...why].map(([k, n]) => `${k} ${f1(pct(n, thrown))}%`).join('  ')}`);
  // Throws by why and by air depth: completion, interceptions, yards an attempt.
  const throwRows = (label: string, keep: (s: EngineSnap) => boolean) => {
    let n = 0, c = 0, i = 0, y = 0, air = 0;
    for (const g of recs.engine) for (const d of g.drives) for (const s of d.snaps) if (s.thrown && keep(s)) {
      n++;
      if (s.complete) { c++; y += s.gain; air += s.air; }
      if (s.type === 'int' || s.type === 'pick6') i++;
    }
    if (n) out.push(`  ${label.padEnd(14)}${pad(String(n), 6)} att  comp ${pad(f1(pct(c, n)), 5)}%  int ${pad(f1(pct(i, n)), 5)}%  ypa ${pad(f1(y / n), 5)}  per catch: air ${pad(f1(air / (c || 1)), 5)} yac ${pad(f1((y - air) / (c || 1)), 5)}`);
  };
  for (const w of why.keys()) throwRows(`why ${w}`, (s) => s.qb?.why === w);
  for (const [label, lo, hi] of [['air < 0', -99, 0], ['air 0-9', 0, 10], ['air 10-19', 10, 20], ['air 20+', 20, 999]] as [string, number, number][]) {
    throwRows(label, (s) => s.qb?.why !== 'away' && s.air >= lo && s.air < hi);
  }
  // The deep ball: by the call it was thrown against and the route, with the window and separation at the throw.
  if (process.env.DRIVES_DEEP !== '0') {
    out.push('');
    out.push('ENGINE DEEP THROWS (air 20+): by call, then by route; win = the window at the throw, sep = nearest defender at the throw');
    const deep = recs.engine.flatMap((g) => g.drives.flatMap((d) => d.snaps.filter((s) => s.thrown && s.qb?.why !== 'away' && s.air >= 20)));
    const all = recs.engine.flatMap((g) => g.drives.flatMap((d) => d.snaps.filter((s) => s.thrown && s.qb?.why !== 'away')));
    const by = (key: (s: EngineSnap) => string) => {
      const m = new Map<string, EngineSnap[]>();
      for (const s of deep) m.set(key(s), [...(m.get(key(s)) ?? []), s]);
      const tot = new Map<string, number>();
      for (const s of all) tot.set(key(s), (tot.get(key(s)) ?? 0) + 1);
      for (const [k, ss] of [...m].sort((a, b) => b[1].length - a[1].length)) {
        const c = ss.filter((s) => s.complete).length;
        const i = ss.filter((s) => s.type === 'int' || s.type === 'pick6').length;
        const y = ss.reduce((a, s) => a + (s.complete ? s.gain : 0), 0);
        const mean = (f: (s: EngineSnap) => number) => ss.reduce((a, s) => a + f(s), 0) / ss.length;
        out.push(`  ${k.padEnd(18)}${pad(String(ss.length), 5)} (${pad(f1(pct(ss.length, tot.get(k) ?? 1)), 4)}% of its throws)  comp ${pad(f1(pct(c, ss.length)), 5)}%  int ${pad(f1(pct(i, ss.length)), 4)}%  ypa ${pad(f1(y / ss.length), 5)}  win ${pad(f1(mean((s) => s.qb?.win ?? 0)), 5)}  sep ${pad(f1(mean((s) => s.qb?.sep ?? 0)), 4)}  at ${f2(mean((s) => s.qb?.at ?? 0))}s`);
      }
    };
    by((s) => s.call.id);
    out.push('');
    by((s) => s.qb?.route ?? '?');
  }
  const at = recs.engine.flatMap((g) => g.drives.flatMap((d) => d.snaps.filter((s) => s.qb?.at != null && s.qb.why !== 'screen').map((s) => s.qb!.at!)));
  at.sort((x, y) => x - y);
  if (process.env.DRIVES_PAYOFF === '1') out.push(writePayoff(recs.engine, games));
  if (process.env.DRIVES_DUMP) {
    const rows = recs.engine.flatMap((g) => g.drives.flatMap((d) => d.snaps.map((x) => ({
      id: x.play.id, fam: x.play.tags.family, call: x.call.id, down: x.down, toGo: x.toGo, yard: x.yard, gain: x.gain, type: x.type, pass: x.pass,
      gap: d.gap, adj: d.adj, oc: d.style, dc: d.dcStyle, soft: x.soft, paSeen: x.paSeen, paBit: x.paBit.length, route: x.qb?.route ?? null, target: x.target,
      beaten: x.beaten, beatenCover: x.beaten && d.def.roster[x.beaten] ? coverOf(d.def.roster[x.beaten].r) : null, defTeam: d.def.team.id, complete: x.complete, thrown: x.thrown, air: x.air,
      recOvr: x.target && d.off.roster[x.target] ? overall(d.off.roster[x.target].r, SLOT_POS[x.target]) : null, ok: filmOk(x.play, x.gain, 100 - x.yard, x.type === 'sack' || x.type === 'int' || x.type === 'pick6' || x.lostFumble),
      film: cell(x.play.read === 'rpo' ? `${x.play.id}:${x.carrier === 'RB' && !x.thrown ? 'give' : 'pull'}` : x.play.id, x.play.tags.family, x.call).s,
    }))));
    writeFileSync(process.env.DRIVES_DUMP, JSON.stringify(rows));
  }
  out.push('');
  out.push(...filmCheck(recs.engine));
  out.push('');
  out.push(...tendencies(recs.engine));
  if (at.length) out.push(`ENGINE QB: release time median ${f2(at[Math.floor(at.length / 2)])} s, p25 ${f2(at[Math.floor(at.length / 4)])}, p75 ${f2(at[Math.floor((at.length * 3) / 4)])}`);
  return out;
}

/** A QB's type for the TENDENCIES rows, by his speed (the archetypes: a pocket passer about 70, a dual threat about 84, a scrambler about 88). */
export const qbType = (spd: number): 'pocket' | 'dual' | 'runner' => (spd < 78 ? 'pocket' : spd < 86 ? 'dual' : 'runner');

/**
 * TENDENCIES: does each offense play like itself? By OC style, the call mix; by team, who gets the ball
 * against how good he is; by QB type, what he does when the pocket breaks down.
 */
export function tendencies(games: GameRec[]): string[] {
  const out: string[] = ['TENDENCIES (engine): does each offense play like itself?'];
  const drives = games.flatMap((g) => g.drives);
  // By OC style: the call mix.
  out.push(`  ${'style'.padEnd(14)}${pad('pass%', 7)}${pad('1st/2nd', 8)}${pad('3rd', 6)}${pad('deep%', 7)}${pad('scrn%', 7)}${pad('rpo%', 6)}${pad('qbRun%', 8)}${pad('pa/bt%', 8)}`);
  const styles = [...new Set(drives.map((d) => d.style))].sort();
  for (const st of styles) {
    const ss = drives.filter((d) => d.style === st).flatMap((d) => d.snaps);
    const callPass = (x: EngineSnap) => x.pass;
    const early = ss.filter((x) => x.down <= 2);
    const third = ss.filter((x) => x.down === 3);
    const th = ss.filter((x) => x.thrown && x.qb?.why !== 'away');
    const fam = (f: string) => pct(ss.filter((x) => x.play.tags.family === f).length, ss.length);
    out.push(`  ${st.padEnd(14)}${pad(f1(pct(ss.filter(callPass).length, ss.length)), 7)}${pad(f1(pct(early.filter(callPass).length, early.length)), 8)}${pad(f1(pct(third.filter(callPass).length, third.length)), 6)}${pad(f1(pct(th.filter((x) => x.air >= 20).length, th.length)), 7)}${pad(f1(fam('screen')), 7)}${pad(f1(fam('rpo')), 6)}${pad(f1(pct(ss.filter((x) => x.play.qbRun || x.play.tags.family === 'read' || x.carrier === 'QB' && !x.pass).length, ss.length)), 8)}${pad(f1(fam('pa') + fam('boot')), 8)}`);
  }
  // Who gets the ball: each team's receivers ranked by their overall at the slot; the share of targets each rank gets.
  const REC = ['X', 'Z', 'SL', 'TE', 'RB'];
  const byTeam = new Map<Ctx, EngineSnap[]>();
  for (const d of drives) byTeam.set(d.off, [...(byTeam.get(d.off) ?? []), ...d.snaps]);
  const rankShare = [0, 0, 0, 0, 0];
  const slotShare: Record<string, number> = {};
  let teams = 0;
  let third1 = 0;
  let thirdN = 0;
  let rz1 = 0;
  let rzN = 0;
  for (const [c, ss] of byTeam) {
    const tg = ss.filter((x) => x.target && x.qb?.why !== 'away');
    if (tg.length < 15) continue;
    teams++;
    const ranked = REC.filter((sl) => c.roster[sl]).sort((a, b) => overall(c.roster[b].r, SLOT_POS[b]) - overall(c.roster[a].r, SLOT_POS[a]));
    ranked.forEach((sl, i) => (rankShare[i] += tg.filter((x) => x.target === sl).length / tg.length));
    for (const sl of REC) slotShare[sl] = (slotShare[sl] ?? 0) + tg.filter((x) => x.target === sl).length / tg.length;
    const top = ranked.find((sl) => sl !== 'RB');
    const t3 = tg.filter((x) => x.down >= 3);
    third1 += t3.filter((x) => x.target === top).length;
    thirdN += t3.length;
    const rz = tg.filter((x) => x.yard >= 80);
    rz1 += rz.filter((x) => x.target === top).length;
    rzN += rz.length;
  }
  out.push(`  targets by the receiver's rank on his team (overall at his slot), ${teams} offenses: ${rankShare.map((v, i) => `#${i + 1} ${f1((100 * v) / teams)}%`).join('  ')}   (FBS: the top target about 25-28%)`);
  out.push(`  targets by slot: ${REC.map((sl) => `${sl} ${f1((100 * (slotShare[sl] ?? 0)) / teams)}%`).join('  ')}   (FBS: RB about 10-12%, TE 12-15%)`);
  out.push(`  the top receiver's share on 3rd/4th down ${f1(pct(third1, thirdN))}%, in the red zone ${f1(pct(rz1, rzN))}%`);
  // The QB by type: what he does when the pocket breaks down.
  out.push(`  ${'QB type'.padEnd(14)}${pad('n', 6)}${pad('spd', 5)}${pad('scr%', 6)}${pad('scr yd', 8)}${pad('sack%', 7)}${pad('away%', 7)}${pad('moving%', 9)}${pad('ypa', 6)}${pad('designed', 10)}`);
  for (const ty of ['pocket', 'dual', 'runner'] as const) {
    const ds = drives.filter((d) => qbType(d.off.roster.QB?.r.spd ?? 70) === ty);
    const ss = ds.flatMap((d) => d.snaps);
    const db = ss.filter((x) => x.pass);
    const scr = db.filter((x) => x.qb?.scrambled && x.qb.runWhy !== 'rpo' && x.type !== 'sack');
    const att = db.filter((x) => x.thrown);
    const comp = att.filter((x) => x.complete);
    const spd = ds.reduce((a, d) => a + (d.off.roster.QB?.r.spd ?? 0), 0) / (ds.length || 1);
    const designed = ss.filter((x) => !x.pass && x.carrier === 'QB');
    out.push(`  ${ty.padEnd(14)}${pad(String(db.length), 6)}${pad(f1(spd), 5)}${pad(f1(pct(scr.length, db.length)), 6)}${pad(f1(scr.reduce((a, x) => a + x.gain, 0) / (scr.length || 1)), 8)}${pad(f1(pct(db.filter((x) => x.type === 'sack').length, db.length)), 7)}${pad(f1(pct(att.filter((x) => x.qb?.why === 'away').length, att.length)), 7)}${pad(f1(pct(att.filter((x) => x.qb?.moved).length, att.length)), 9)}${pad(f1(comp.reduce((a, x) => a + x.gain, 0) / (att.length || 1)), 6)}${pad(f1(pct(designed.length, ss.length)), 10)}`);
  }
  {
    const db = drives.flatMap((d) => d.snaps.filter((x) => x.pass && x.qb?.scrambled && x.type !== 'sack'));
    const by = new Map<string, number>();
    for (const x of db) by.set(x.qb?.runWhy ?? '?', (by.get(x.qb?.runWhy ?? '?') ?? 0) + 1);
    const tg = drives.flatMap((d) => d.snaps.filter((x) => x.target && x.qb?.why !== 'away'));
    const why = new Map<string, [number, number]>();
    for (const x of tg) {
      const e = why.get(x.qb?.why ?? '?') ?? [0, 0];
      e[0]++;
      if (x.target === 'RB') e[1]++;
      why.set(x.qb?.why ?? '?', e);
    }
    out.push(`  scrambles by why: ${[...by].map(([k, n]) => `${k} ${f1(pct(n, db.length))}%`).join('  ')};  targets to the back by why: ${[...why].map(([k, [n, r]]) => `${k} ${f1(pct(r, n))}% of ${n}`).join('  ')}`);
  }
  out.push('  (FBS scrambles, RPO keeps not counted: a pocket passer about 3-5% of dropbacks, a dual threat 7-9%, a runner 10-14%; moving = thrown on the move after leaving the pocket)');
  // The defense's style, as it shows on the field.
  out.push(`  ${'DC style'.padEnd(14)}${pad('blitz%', 8)}${pad('man%', 6)}${pad('2-high', 7)}${pad('sack%', 7)}${pad('comp%', 7)}${pad('ypa', 6)}${pad('ypc', 6)}${pad('20+%', 6)}${pad('pl/dr', 7)}${pad('3&out', 7)}${pad('TO%', 6)}${pad('pts/dr', 8)}`);
  for (const st of ['aggressive', 'balanced', 'soft']) {
    const ds = drives.filter((d) => d.dcStyle === st);
    const ss = ds.flatMap((d) => d.snaps);
    if (!ss.length) continue;
    const a = blank();
    for (const d of ds) add(a, d);
    const calls = ss.filter((x) => !x.tags.prevent);
    const three = ds.filter((d) => d.sim.result === 'PUNT' && d.snaps.length <= 3).length;
    out.push(`  ${st.padEnd(14)}${pad(f1(pct(calls.filter((x) => rushers(x.call) >= 5).length, calls.length)), 8)}${pad(f1(pct(calls.filter((x) => x.call.coverage === 'man').length, calls.length)), 6)}${pad(f1(pct(calls.filter((x) => x.call.shell === 'two-high').length, calls.length)), 7)}${pad(f1(pct(a.sacks, a.dropbacks)), 7)}${pad(f1(pct(a.comp, a.att)), 7)}${pad(f1(a.passYds / a.att), 6)}${pad(f1(a.rushYds / a.carries), 6)}${pad(f1(pct(a.big20, a.plays)), 6)}${pad(f1(a.plays / a.drives), 7)}${pad(f1(pct(three, ds.length)), 7)}${pad(f1(pct(a.to, a.drives)), 6)}${pad(f2(a.pts / a.drives), 8)}`);
  }
  return out;
}

/**
 * DRIVES_ADAPT=1: the coordinators' battle. The same matchups four ways (no learners, the DC's brain only, the
 * OC's only, both), and how the points a drive move with the offense's OC's ADJUST minus the defense's DC's.
 */
export function adaptReport(): string[] {
  const games = Number(process.env.DRIVES_GAMES ?? DRIVES.games);
  const pick = mulberry32(DRIVES.seed);
  const pairs: [Team, Team][] = [];
  for (let i = 0; i < games; i++) {
    const h = TEAMS[Math.floor(pick() * TEAMS.length)];
    let a = TEAMS[Math.floor(pick() * TEAMS.length)];
    while (a === h) a = TEAMS[Math.floor(pick() * TEAMS.length)];
    pairs.push([h, a]);
  }
  const all: [string, Arm][] = [['none', { dc: false, oc: false }], ['DC only', { dc: true, oc: false }], ['OC only', { dc: false, oc: true }], ['both', { dc: true, oc: true }]];
  // DRIVES_ARMS=none,OC only: a subset (the battle rows need all four).
  const want = process.env.DRIVES_ARMS?.split(',');
  const arms = want ? all.filter(([n]) => want.includes(n)) : all;
  const recs = new Map<string, GameRec[]>();
  for (const [name, arm] of arms) recs.set(name, pairs.map(([h, a], i) => playGame(ctxOf(h), ctxOf(a), 'engine', mulberry32(DRIVES.seed ^ (i * 104729)), arm)));
  const out: string[] = [`ADAPT: ${games} games each way; points a drive by which learners are on`];
  const ppd = (ds: DriveRec[]) => ds.reduce((s, d) => s + d.sim.points - d.defPoints, 0) / (ds.length || 1);
  const okOf = (x: EngineSnap) => successful({ gain: x.gain, down: x.down, toGo: x.toGo, pass: x.pass, ...(x.type === 'sack' ? { sack: true } : {}), ...(x.type === 'int' || x.type === 'pick6' || x.lostFumble ? { turnover: true } : {}) });
  const succ = (ds: DriveRec[]) => {
    const ss = ds.flatMap((d) => d.snaps);
    return pct(ss.filter(okOf).length, ss.length);
  };
  out.push(`  ${'arm'.padEnd(10)}${pad('pts/dr', 8)}${pad('half 1', 8)}${pad('half 2', 8)}${pad('ypp', 6)}${pad('succ%', 7)}${pad('blitz%', 8)}${pad('quick/scrn%', 13)}${pad('run%', 6)}`);
  for (const [name] of arms) {
    const ds = recs.get(name)!.flatMap((g) => g.drives);
    const a = blank();
    for (const d of ds) add(a, d);
    const ss = ds.flatMap((d) => d.snaps);
    out.push(`  ${name.padEnd(10)}${pad(f2(ppd(ds)), 8)}${pad(f2(ppd(ds.filter((d) => d.half === 0))), 8)}${pad(f2(ppd(ds.filter((d) => d.half === 1))), 8)}${pad(f1(a.yards / a.plays), 6)}${pad(f1(succ(ds)), 7)}${pad(f1(pct(ss.filter((x) => rushers(x.call) >= 5).length, ss.length)), 8)}${pad(f1(pct(ss.filter((x) => x.play.tags.family === 'quick' || x.play.tags.family === 'screen').length, ss.length)), 13)}${pad(f1(pct(ss.filter((x) => !x.pass).length, ss.length)), 6)}`);
  }
  out.push('  the battle: points a drive over the no-learner arm, by the offense\'s OC ADJUST minus the defense\'s DC ADJUST');
  out.push(`  ${'adj gap'.padEnd(12)}${pad('drives', 8)}${pad('none', 7)}${pad('DC only', 9)}${pad('OC only', 9)}${pad('both', 7)}   success % over none: ${['DC only', 'OC only', 'both'].join(' / ')}`);
  const B: [string, (g: number) => boolean][] = [['<= -12', (g) => g <= -12], ['-12..-4', (g) => g > -12 && g <= -4], ['-4..4', (g) => g > -4 && g < 4], ['4..12', (g) => g >= 4 && g < 12], ['>= 12', (g) => g >= 12]];
  // Over talent: each drive's points (and each snap's success) less the arm's mean at its talent gap (2-point bins),
  // so a coordinator gap that comes with a talent gap isn't read as the coordinators.
  out.push('  over talent: points a drive (success %) above what the talent gap gives, by the coordinator gap; each arm on its own');
  out.push(`  ${'drives'.padEnd(14)}${arms.map(([n]) => pad(n, 16)).join('')}`);
  const resid = new Map<string, { d: Map<DriveRec, number>; s: Map<EngineSnap, number> }>();
  for (const [name] of arms) {
    const ds = recs.get(name)!.flatMap((g) => g.drives);
    const bin = (g: number) => Math.round(g / 2);
    const m = new Map<number, [number, number, number, number]>();
    for (const d of ds) {
      const e = m.get(bin(d.gap)) ?? [0, 0, 0, 0];
      e[0] += d.sim.points - d.defPoints;
      e[1]++;
      for (const x of d.snaps) { e[2] += okOf(x) ? 1 : 0; e[3]++; }
      m.set(bin(d.gap), e);
    }
    const r = { d: new Map<DriveRec, number>(), s: new Map<EngineSnap, number>() };
    for (const d of ds) {
      const e = m.get(bin(d.gap))!;
      r.d.set(d, d.sim.points - d.defPoints - e[0] / e[1]);
      for (const x of d.snaps) r.s.set(x, (okOf(x) ? 1 : 0) - e[2] / e[3]);
    }
    resid.set(name, r);
  }
  const A: [string, (d: DriveRec) => boolean][] = [
    ...B.map(([l, f]) => [`gap ${l}`, (d: DriveRec) => f(d.adj)] as [string, (d: DriveRec) => boolean]),
    ['OC adj < 50', (d) => d.ocAdj < 50], ['OC adj 50-64', (d) => d.ocAdj >= 50 && d.ocAdj < 65], ['OC adj 65+', (d) => d.ocAdj >= 65],
    ['DC adj < 50', (d) => d.dcAdj < 50], ['DC adj 50-64', (d) => d.dcAdj >= 50 && d.dcAdj < 65], ['DC adj 65+', (d) => d.dcAdj >= 65],
  ];
  for (const [label, inB] of A) {
    const cells = arms.map(([name]) => {
      const r = resid.get(name)!;
      const ds = [...r.d.keys()].filter(inB);
      const pd = ds.reduce((a, d) => a + r.d.get(d)!, 0) / (ds.length || 1);
      const ss = ds.flatMap((d) => d.snaps);
      const sc = ss.reduce((a, x) => a + r.s.get(x)!, 0) / (ss.length || 1);
      return pad(`${f2(pd)} (${f1(100 * sc)})`, 16);
    });
    out.push(`  ${label.padEnd(14)}${cells.join('')}`);
  }
  for (const [label, inB] of want ? [] : B) {
    const by = (name: string) => recs.get(name)!.flatMap((g) => g.drives.filter((d) => inB(d.adj)));
    const none = ppd(by('none'));
    const sn = succ(by('none'));
    out.push(`  ${label.padEnd(12)}${pad(String(by('both').length), 8)}${pad(f2(none), 7)}${pad(f2(ppd(by('DC only')) - none), 9)}${pad(f2(ppd(by('OC only')) - none), 9)}${pad(f2(ppd(by('both')) - none), 7)}   ${['DC only', 'OC only', 'both'].map((k) => f1(succ(by(k)) - sn)).join(' / ')}`);
  }
  return out;
}

/**
 * FILM CHECK: the learners choose by the film room's payoff (`damage`, filmPayoff.ts). Does it predict what
 * happens on engine snaps? The slope of engine success on film success, across all snaps, within a play
 * (which call hurts it: the DC's question) and within a call (which play beats it: the OC's question).
 */
export function filmCheck(games: GameRec[]): string[] {
  const out = ['FILM CHECK: engine success on each table\'s success for the same play and call (slope 1 = the table is right; 0 = it says nothing)'];
  for (const table of ['film', 'engine'] as const) {
    const xs: { play: string; call: string; f: number; y: number }[] = [];
    for (const g of games) for (const d of g.drives) for (const s of d.snaps) {
      const row = s.play.read === 'rpo' ? `${s.play.id}:${s.carrier === 'RB' && !s.thrown ? 'give' : 'pull'}` : s.play.id;
      const f = cell(row, s.play.tags.family, s.call, undefined, 1, table).s;
      const lost = s.type === 'sack' || s.type === 'int' || s.type === 'pick6' || s.lostFumble;
      xs.push({ play: s.play.id, call: s.call.id, f, y: filmOk(s.play, s.gain, 100 - s.yard, lost) ? 1 : 0 });
    }
    const slope = (key: ((x: (typeof xs)[0]) => string) | null) => {
      const mf = new Map<string, [number, number, number]>();
      if (key) for (const x of xs) {
        const e = mf.get(key(x)) ?? [0, 0, 0];
        e[0] += x.f; e[1] += x.y; e[2]++;
        mf.set(key(x), e);
      }
      let sxy = 0, sxx = 0, syy = 0;
      const mF = xs.reduce((a, x) => a + x.f, 0) / xs.length;
      const mY = xs.reduce((a, x) => a + x.y, 0) / xs.length;
      for (const x of xs) {
        const e = key ? mf.get(key(x))! : null;
        const cf = x.f - (e ? e[0] / e[2] : mF);
        const cy = x.y - (e ? e[1] / e[2] : mY);
        sxy += cf * cy; sxx += cf * cf; syy += cy * cy;
      }
      return { b: sxy / (sxx || 1), r: sxy / Math.sqrt((sxx || 1) * (syy || 1)), sd: Math.sqrt(sxx / xs.length) };
    };
    for (const [label, k] of [['all snaps', null], ['within a play', (x: (typeof xs)[0]) => x.play], ['within a call', (x: (typeof xs)[0]) => x.call]] as const) {
      const r = slope(k);
      out.push(`  ${table.padEnd(7)}${label.padEnd(16)} slope ${f2(r.b)}  r ${f2(r.r)}  table spread (sd) ${f2(r.sd)}`);
    }
  }
  return out;
}

/**
 * The engine's payoff table (`src/data/enginePayoff.ts`, `DRIVES_PAYOFF=1`): success (`filmOk`) and explosive rate
 * (15+) of each family against each call on engine snaps, from an additive fit that takes out the situation
 * (`sitBin`) and the talent gap (bucketed), so a call that's mostly called on the goal line isn't read as a
 * stop. Each effect is shrunk by `PAYOFF_K` snaps; a family's row is the league mean plus its effect, the
 * call's and their interaction, at an early down and an even matchup.
 */
const PAYOFF_K = { main: 20, inter: 40 };
function writePayoff(games: GameRec[], n: number): string {
  type Snap = { f: string; c: string; sit: string; g: string; y: number; e: number };
  const xs: Snap[] = [];
  const gapB = (g: number) => (g <= -8 ? 'a' : g <= -3 ? 'b' : g < 3 ? 'c' : g < 8 ? 'd' : 'e');
  for (const gm of games) for (const d of gm.drives) for (const x of d.snaps) {
    const lost = x.type === 'sack' || x.type === 'int' || x.type === 'pick6' || x.lostFumble;
    xs.push({ f: x.play.tags.family, c: x.call.id, sit: sitBin(x.down, x.toGo, 100 - x.yard), g: gapB(d.gap), y: filmOk(x.play, x.gain, 100 - x.yard, lost) ? 1 : 0, e: !lost && x.gain >= 15 ? 1 : 0 });
  }
  const fit = (val: (x: Snap) => number) => {
    const keys: [string, (x: Snap) => string, number][] = [
      ['sit', (x) => x.sit, PAYOFF_K.main], ['gap', (x) => x.g, PAYOFF_K.main], ['f', (x) => x.f, PAYOFF_K.main], ['c', (x) => x.c, PAYOFF_K.main],
      ['fc', (x) => `${x.f}|${x.c}`, PAYOFF_K.inter],
    ];
    const eff: Record<string, Map<string, number>> = Object.fromEntries(keys.map(([k]) => [k, new Map<string, number>()]));
    const mean = xs.reduce((a, x) => a + val(x), 0) / xs.length;
    const pred = (x: Snap, skip: string) => mean + keys.reduce((a, [k, key]) => a + (k === skip ? 0 : eff[k].get(key(x)) ?? 0), 0);
    for (let it = 0; it < 12; it++) {
      for (const [k, key, K] of keys) {
        const sum = new Map<string, [number, number]>();
        for (const x of xs) {
          const e = sum.get(key(x)) ?? [0, 0];
          e[0] += val(x) - pred(x, k);
          e[1]++;
          sum.set(key(x), e);
        }
        eff[k] = new Map([...sum].map(([kk, [r, m]]) => [kk, r / (m + K)]));
      }
    }
    // At an early down and an even matchup.
    const base = mean + (eff.sit.get('early') ?? 0) + (eff.gap.get('c') ?? 0);
    return (f: string, c: string) => base + (eff.f.get(f) ?? 0) + (eff.c.get(c) ?? 0) + (eff.fc.get(`${f}|${c}`) ?? 0);
  };
  const S = fit((x) => x.y);
  const E = fit((x) => x.e);
  const cols = DEF_CALLS.map((c) => c.id);
  const fams = [...new Set(xs.map((x) => x.f))].sort();
  const pctR = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10;
  const rows = Object.fromEntries(fams.map((f) => [f, { s: cols.map((c) => pctR(S(f, c))), e: cols.map((c) => pctR(E(f, c))) }]));
  const body = [
    "// Generated by `DRIVES_PAYOFF=1 npm run drives` (src/drives.ts `writePayoff`): don't edit by hand.",
    "import type { Payoff } from './enginePayoffType';",
    '',
    `export const ENGINE_PAYOFF: Payoff | null = ${JSON.stringify({ games: n, cols, rows })};`,
    '',
  ].join('\n');
  writeFileSync('src/data/enginePayoff.ts', body);
  return `ENGINE PAYOFF: wrote src/data/enginePayoff.ts from ${xs.length} snaps (${fams.length} families x ${cols.length} calls)`;
}
