import type { Athlete } from '../data/athletes';
import { lateAndClose, type UnitConf } from '../data/confidence';
import { athleteName, starters, teamConf, teamRatings, type Squad } from '../data/depth';
import { overall, SLOT_POS } from '../data/positions';
import { clamp, gauss, pickWeighted, type Rng } from '../engine/math';
import { advanceSim, newClock, timeLeftInHalf, nextQuarter } from '../game/clock';
import { simulateDrive, userStartAfter, type DriveClock, type DriveConf, type DriveSim, type SimPlay } from '../game/rules';
import { driveMods, type TeamMods } from './emphasis';
import { autoGamePlan, type GamePlan } from './staff';
import type { DriveCredit, GameStory } from './story';
import type { BoxScore, DriveLog, GameResult, LoggedPlay, PlayerLine, TeamLine } from './types';

/**
 * CPU-vs-CPU games: whole drives from `simulateDrive` (the same team ratings the field uses), with the
 * yards and scores credited to the starters for a box score. The credit split is deliberately simple;
 * it's the place to add depth (targets by route, carries by back, defensive stats).
 */

/**
 * Game-level tuning, fit with `DRIVE_SIM` (game/rules.ts) to real 2024-25 FBS scores (docs/SEASON.md).
 * - `homeEdge`: overall points the home side gets on both offense and defense.
 * - `paceSd`: game-to-game spread of time per play, so some games have more possessions than others.
 * - `script`: overall points the offense loses per point of lead (the lead capped at `scriptCap`). A
 *   leading team eases off and a trailing one presses, so favorites often win closer than the talent gap.
 */
export const GAME_SIM = { homeEdge: 1.5, paceSd: 0.12, script: 0.15, scriptCap: 21 };
const HALF_SECS = 1800;
/** Where an overtime possession starts, in yards from the offense's own goal (the opponent's 25). */
const OT_START = 75;
const OT_MAX_ROUNDS = 8;
/** Yards per play on passes vs runs, to split a drive's yards. */
const PASS_YPP = 7;
const RUSH_YPP = 4.5;
const COMPLETION = 0.62;
/** Share of a team's turnovers that are interceptions (the rest are fumbles). */
export const INT_SHARE = 0.55;
/** Base target share by slot, scaled by the receiver's overall. */
export const TARGETS: Record<string, number> = { X: 0.25, Z: 0.21, SL: 0.18, TE: 0.15, RB: 0.11 };
export const QB_RUN_SHARE: Record<string, number> = { pocket: 0.08, dual: 0.2, runner: 0.33 };

interface Side {
  id: string;
  squad: Squad;
  off: number;
  def: number;
  plan: GamePlan;
  qbRun: number;
  on: Record<string, Athlete>;
  conf: UnitConf;
  /** This week's emphases (season/emphasis.ts), if any group isn't on standard. */
  mods?: TeamMods;
  tl: TeamLine;
  lines: Map<string, PlayerLine>;
}

function side(squad: Squad, plan: GamePlan, edge: number, mods?: TeamMods): Side {
  const r = teamRatings(squad);
  return {
    id: squad.team.id, squad, off: r.off + edge, def: r.def + edge, plan, mods,
    qbRun: QB_RUN_SHARE[squad.team.profile.offense.qbStyle] ?? 0.1,
    on: starters(squad),
    conf: teamConf(squad),
    tl: { points: 0, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 },
    lines: new Map(),
  };
}

function lineFor(s: Side, a: Athlete): PlayerLine {
  let l = s.lines.get(a.id);
  if (!l) {
    l = {
      id: a.id, team: s.id, name: athleteName(a), pos: a.pos,
      cmp: 0, att: 0, passYds: 0, passTd: 0, int: 0, rush: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, fgm: 0, fga: 0,
    };
    s.lines.set(a.id, l);
  }
  return l;
}

function receivers(s: Side): [Athlete, number][] {
  return Object.entries(TARGETS)
    .filter(([slot]) => s.on[slot])
    .map(([slot, w]) => [s.on[slot], w * (overall(s.on[slot].r, SLOT_POS[slot]) / 75) ** 2]);
}

function rushers(s: Side): [Athlete, number][] {
  const out: [Athlete, number][] = [];
  if (s.on.RB) out.push([s.on.RB, 1 - s.qbRun]);
  if (s.on.QB) out.push([s.on.QB, s.qbRun]);
  return out;
}

/** Split `total` into `n` random parts that sum to it. */
function splitYards(total: number, n: number, rng: Rng): number[] {
  if (n <= 0) return [];
  const w = Array.from({ length: n }, () => 0.2 + rng());
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.round((total * x) / sum));
  out[n - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

function slotOf(s: Side, a: Athlete): string {
  return Object.keys(s.on).find((slot) => s.on[slot] === a) ?? a.pos;
}

/** Credit one drive to the offense's box score; `out` records who got it, for highlights (no extra draws). */
function credit(s: Side, d: DriveSim, rng: Rng, out?: DriveCredit): void {
  const who = (a: Athlete, yds: number) => ({ slot: slotOf(s, a), name: athleteName(a), yds });
  const tl = s.tl;
  tl.plays += d.plays;
  tl.yards += d.yards;
  tl.points += d.points;
  const share = s.plan.passShare;
  const passPlays = Math.round(d.plays * share);
  const rushPlays = d.plays - passPlays;
  const passYds = passPlays && rushPlays
    ? Math.round((d.yards * share * PASS_YPP) / (share * PASS_YPP + (1 - share) * RUSH_YPP))
    : passPlays ? d.yards : 0;
  const rushYds = d.yards - passYds;
  tl.passYds += passYds;
  tl.rushYds += rushYds;

  const qb = s.on.QB;
  const recv = receivers(s);
  if (qb && passPlays) {
    const ql = lineFor(s, qb);
    let cmp = 0;
    for (let i = 0; i < passPlays; i++) if (rng() < COMPLETION) cmp++;
    if (!cmp && passYds > 0) cmp = 1;
    ql.att += passPlays;
    ql.cmp += cmp;
    ql.passYds += passYds;
    const yds = splitYards(passYds, cmp, rng);
    for (let i = 0; i < cmp; i++) {
      const a = pickWeighted(recv, rng);
      const rl = lineFor(s, a);
      rl.rec++;
      rl.recYds += yds[i];
      out?.catches.push(who(a, yds[i]));
    }
  }
  const run = rushers(s);
  if (run.length && rushPlays) {
    const yds = splitYards(rushYds, rushPlays, rng);
    for (let i = 0; i < rushPlays; i++) {
      const a = pickWeighted(run, rng);
      const rl = lineFor(s, a);
      rl.rush++;
      rl.rushYds += yds[i];
      out?.runs.push(who(a, yds[i]));
    }
  }

  switch (d.result) {
    case 'TOUCHDOWN':
      if (qb && recv.length && rng() < share) {
        lineFor(s, qb).passTd++;
        const a = pickWeighted(recv, rng);
        lineFor(s, a).recTd++;
        if (out) out.td = { ...who(a, 0), pass: true };
      } else if (run.length) {
        const a = pickWeighted(run, rng);
        lineFor(s, a).rushTd++;
        if (out) out.td = { ...who(a, 0), pass: false };
      }
      break;
    case 'FIELD GOAL':
    case 'MISSED FG':
      if (s.on.K) {
        const kl = lineFor(s, s.on.K);
        kl.fga++;
        if (d.result === 'FIELD GOAL') kl.fgm++;
      }
      break;
    case 'TURNOVER':
      tl.turnovers++;
      if (qb && rng() < INT_SHARE) {
        lineFor(s, qb).int++;
        if (out) out.int = true;
      } else if (out) out.int = false;
      break;
    default:
      break;
  }
}

/** A simulated drive's snaps as a progression log, with the try and kickoff after a score. */
export function driveLog(off: string, plays: SimPlay[], d: DriveSim, ot = false): DriveLog {
  const out: LoggedPlay[] = plays.map((p) => {
    const l: LoggedPlay = { gain: p.gain, down: p.down, toGo: p.toGo };
    if (p.lev) l.lev = p.lev;
    if (p.em) l.em = p.em;
    if (p.explosive) l.explosive = true;
    if (p.turnover) l.turnover = true;
    if (p.fg) l.kick = { unit: 'fg', good: p.fg.made, dist: p.fg.dist };
    if (p.punt) l.kick = { unit: 'punt', good: true };
    return l;
  });
  // Overtime has no kickoffs.
  if (d.result === 'TOUCHDOWN') out.push({ gain: 0, down: 0, toGo: 0, kick: { unit: 'xp', good: true } });
  if (!ot && (d.result === 'TOUCHDOWN' || d.result === 'FIELD GOAL')) out.push({ gain: 0, down: 0, toGo: 0, kick: { unit: 'kickoff', good: true } });
  return { off, plays: out };
}

/** The confidence a drive is played with: the offense's unit and kicker against the defense's. */
function driveConf(o: Side, dfn: Side, late: boolean): DriveConf {
  return { off: o.conf.off, def: dfn.conf.def, k: o.conf.k, late };
}

/**
 * `simulateDrive` for `o` against `dfn`, logging the drive into `logs` when there are any and its
 * snaps into `seen` (for a story). Watching the snaps draws no random numbers.
 */
function drive(
  o: Side, dfn: Side, offOvr: number, start: number, rng: Rng, clock: DriveClock | undefined, logs: DriveLog[] | undefined, conf: DriveConf, ot = false,
  seen?: SimPlay[],
): DriveSim {
  const mods = driveMods(o.mods, dfn.mods, o.plan.passShare);
  if (!logs && !seen) return simulateDrive(offOvr, dfn.def, start, rng, clock, undefined, conf, mods);
  const plays: SimPlay[] = [];
  const d = simulateDrive(offOvr, dfn.def, start, rng, clock, (p) => plays.push(p), conf, mods);
  logs?.push(driveLog(o.id, plays, d, ot));
  seen?.push(...plays);
  return d;
}

/** Add a drive to the story (the score is the one before it) and return its credit record for `credit` to fill. */
function tell(
  story: GameStory | undefined, o: Side, dfn: Side, d: DriveSim, plays: SimPlay[] | undefined, start: number, half: number, left: number, qSecs: number,
): DriveCredit | undefined {
  if (!story || !plays) return undefined;
  const credit: DriveCredit = { catches: [], runs: [] };
  story.drives.push({
    off: o.id, half, left, qSecs, score: { [o.id]: o.tl.points, [dfn.id]: dfn.tl.points }, start, result: d.result, points: d.points, plays, credit,
  });
  return credit;
}

/** Untimed alternating possessions from the opponent's 25 until one side leads after a round. */
function overtime(first: Side, second: Side, rng: Rng, logs?: DriveLog[], story?: GameStory): number {
  let rounds = 0;
  while (first.tl.points === second.tl.points) {
    rounds++;
    for (const [o, dfn] of [[first, second], [second, first]] as const) {
      const seen = story ? [] : undefined;
      const d = drive(o, dfn, o.off, OT_START, rng, undefined, logs, driveConf(o, dfn, true), true, seen);
      credit(o, d, rng, tell(story, o, dfn, d, seen, OT_START, 2, 0, HALF_SECS / 2));
    }
    if (rounds >= OT_MAX_ROUNDS && first.tl.points === second.tl.points) {
      // Sudden death by coin flip so the sim always ends.
      (rng() < 0.5 ? first : second).tl.points += 2;
    }
  }
  return rounds;
}

export interface SimOptions {
  neutral?: boolean;
  plans?: { home: GamePlan; away: GamePlan };
  /** Collects every drive for the progression grades. Logging draws no random numbers. */
  drives?: DriveLog[];
  /** Each side's weekly emphases (season/emphasis.ts). Missing is standard. */
  emph?: { home?: TeamMods; away?: TeamMods };
  /** Collects the game drive by drive for highlights (season/story.ts). Draws no random numbers. */
  story?: GameStory;
}

export function simGame(home: Squad, away: Squad, rng: Rng, opts: SimOptions = {}): GameResult {
  const edge = opts.neutral ? 0 : GAME_SIM.homeEdge;
  const pace = clamp(1 + gauss(rng) * GAME_SIM.paceSd, 0.7, 1.3);
  const h = side(home, opts.plans?.home ?? autoGamePlan(home, away), edge, opts.emph?.home);
  const a = side(away, opts.plans?.away ?? autoGamePlan(away, home), 0, opts.emph?.away);
  const firstHalf = rng() < 0.5 ? h : a;
  for (let half = 0; half < 2; half++) {
    let off = half === 0 ? firstHalf : firstHalf === h ? a : h;
    let start = 25;
    let left = HALF_SECS;
    while (left > 0) {
      const dfn = off === h ? a : h;
      const lead = off.tl.points - dfn.tl.points;
      const late = left < (half === 1 ? 300 : 120);
      const clock: DriveClock = { timeLeft: left, hurry: lead < 0 && late, milk: lead > 0 && half === 1 && left < 600, pace };
      const script = GAME_SIM.script * clamp(lead, -GAME_SIM.scriptCap, GAME_SIM.scriptCap);
      // The fourth quarter is the last 900 seconds of the second half.
      const close = half === 1 && left <= 900 && lateAndClose(4, lead);
      const seen = opts.story ? [] : undefined;
      const d = drive(off, dfn, off.off - script, start, rng, clock, opts.drives, driveConf(off, dfn, close), false, seen);
      credit(off, d, rng, tell(opts.story, off, dfn, d, seen, start, half, left, HALF_SECS / 2));
      left -= d.secs;
      if (d.result === 'END OF HALF') break;
      start = userStartAfter(d, rng);
      off = dfn;
    }
  }
  const ot = h.tl.points === a.tl.points ? overtime(a, h, rng, opts.drives, opts.story) : 0;
  return {
    home: h.tl.points, away: a.tl.points, ot,
    box: { home: h.tl, away: a.tl, players: [...h.lines.values(), ...a.lines.values()] },
  };
}

/** Where the live game picks up after `simPart`. Yards are from the side with the ball's own goal. */
export type LiveNext =
  /** `mid`: the simulated drive was stopped at the quarter break and goes on from here. */
  | { kind: 'user'; start: number; mid?: boolean }
  | { kind: 'cpu'; start: number; mid?: boolean }
  /** The user just scored: the user kicks off. */
  | { kind: 'userKickoff' }
  /** The first half ran out: halftime, then the user kicks off. */
  | { kind: 'halftime' }
  | { kind: 'final' };

export interface PartResult {
  /** The clock where the live game picks up (2nd quarter 0:00 for halftime). */
  quarter: number;
  time: number;
  user: number;
  cpu: number;
  next: LiveNext;
  /** The simulated stretch's box score. */
  box: BoxScore;
}

export interface PartOptions {
  neutral?: boolean;
  plans: { user: GamePlan; cpu: GamePlan };
  emph?: { user?: TeamMods; cpu?: TeamMods };
  drives?: DriveLog[];
  story?: GameStory;
}

/**
 * The first quarters of a game the user plays: simulated until `toQuarter` starts, then handed to
 * the field. Unlike `simGame` it runs on the live clock (the dynasty's quarter length, `qMin`), so
 * the score is on a played game's scale and the field's quarters follow on. It keeps the field's
 * conventions (the user receives the opening kickoff, the CPU the second half) and the CPU drive's
 * late-game rules, with `simGame`'s home edge, pace and game script. A drive still going at the
 * break before `toQuarter` stops there (`quarterBreak`) and the field picks it up at that spot, so
 * the user always gets the whole quarter.
 */
export function simPart(user: Squad, cpu: Squad, userHome: boolean, qMin: number, toQuarter: number, rng: Rng, opts: PartOptions): PartResult {
  const edge = opts.neutral ? 0 : GAME_SIM.homeEdge;
  const pace = clamp(1 + gauss(rng) * GAME_SIM.paceSd, 0.7, 1.3);
  const u = side(user, opts.plans.user, userHome ? edge : 0, opts.emph?.user);
  const c = side(cpu, opts.plans.cpu, userHome ? 0 : edge, opts.emph?.cpu);
  const clock = newClock(qMin);
  const qSecs = clock.qSecs;
  let off = u;
  let start = 25;
  let scored = false;
  let next: LiveNext | null = null;
  while (!next) {
    if (clock.quarter >= toQuarter) {
      if (off === u) next = { kind: 'user', start };
      else next = scored ? { kind: 'userKickoff' } : { kind: 'cpu', start };
      break;
    }
    const dfn = off === u ? c : u;
    const q = clock.quarter;
    const left = timeLeftInHalf(clock);
    const lead = off.tl.points - dfn.tl.points;
    const late = (q === 4 && left < Math.min(300, qSecs * 0.4)) || (q === 2 && left < 120);
    // The last quarter before the hand-off ends at its break, not at the half.
    const cut = (toQuarter === 2 || toQuarter === 4) && q === toQuarter - 1;
    const dc: DriveClock = { timeLeft: cut ? clock.time : left, hurry: lead < 0 && late, milk: lead > 0 && q === 4, pace, quarterBreak: cut };
    const script = GAME_SIM.script * clamp(lead, -GAME_SIM.scriptCap, GAME_SIM.scriptCap);
    const seen = opts.story ? [] : undefined;
    const d = drive(off, dfn, off.off - script, start, rng, dc, opts.drives, driveConf(off, dfn, lateAndClose(q, lead)), false, seen);
    credit(off, d, rng, tell(opts.story, off, dfn, d, seen, start, q <= 2 ? 0 : 1, left, qSecs));
    if (cut && d.result === 'END OF HALF') {
      advanceSim(clock, d.secs);
      next = { kind: off === u ? 'user' : 'cpu', start: d.endYard, mid: true };
      continue;
    }
    if (advanceSim(clock, d.secs).halfOver) {
      if (clock.quarter === 4) next = { kind: 'final' };
      else if (toQuarter <= 3) next = { kind: 'halftime' };
      else {
        // The CPU takes the second-half kickoff.
        nextQuarter(clock);
        off = c;
        start = 25;
        scored = false;
      }
      continue;
    }
    scored = off === u && (d.result === 'TOUCHDOWN' || d.result === 'FIELD GOAL');
    start = userStartAfter(d, rng);
    off = dfn;
  }
  const lines = [...u.lines.values(), ...c.lines.values()];
  return {
    quarter: clock.quarter, time: clock.time, user: u.tl.points, cpu: c.tl.points, next,
    box: { home: userHome ? u.tl : c.tl, away: userHome ? c.tl : u.tl, players: lines },
  };
}

/**
 * A live game that ended tied (the field has no overtime yet): settle it with simulated overtime,
 * keeping the regulation box score.
 */
export function settleTie(
  result: GameResult, home: Squad, away: Squad, rng: Rng, neutral = false, drives?: DriveLog[], emph?: SimOptions['emph'],
): GameResult {
  if (result.home !== result.away) return result;
  const edge = neutral ? 0 : GAME_SIM.homeEdge;
  const h = side(home, autoGamePlan(home, away), edge, emph?.home);
  const a = side(away, autoGamePlan(away, home), 0, emph?.away);
  h.tl.points = result.home;
  a.tl.points = result.away;
  const ot = overtime(a, h, rng, drives);
  return { ...result, home: h.tl.points, away: a.tl.points, ot, box: { ...result.box, players: [...result.box.players, ...h.lines.values(), ...a.lines.values()] } };
}

/** Rough win probability for the home side from the team overalls, for previews and upset detection. */
export function winOdds(home: Squad, away: Squad, neutral = false): number {
  const gap = teamRatings(home).ovr - teamRatings(away).ovr + (neutral ? 0 : GAME_SIM.homeEdge * 2);
  return clamp(1 / (1 + Math.exp(-gap / 4)), 0.01, 0.99);
}
