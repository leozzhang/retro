import type { Athlete } from '../data/athletes';
import { lateAndClose, type UnitConf } from '../data/confidence';
import { athleteName, starters, teamConf, teamRatings, type Squad } from '../data/depth';
import { clamp, gauss, mulberry32, type Rng } from '../engine/math';
import { advanceSim, newClock, timeLeftInHalf, nextQuarter } from '../game/clock';
import { OVERTIME, simTwoPoint, simulateDrive, userStartAfter, type DriveClock, type DriveConf, type DriveSim, type SimPlay } from '../game/rules';
import { CAST, castDrive, QB_RUN_SHARE, type Lineup } from './cast';
import { driveMods, type TeamMods } from './emphasis';
import { autoGamePlan, type GamePlan } from './staff';
import { gamePlays } from './gamePlays';
import { newStory, type DriveCredit, type GameStory } from './story';
import type { BoxScore, DriveLog, GameResult, LoggedPlay, PlayerLine, TeamLine } from './types';

/**
 * CPU-vs-CPU games: whole drives from `simulateDrive` (the same team ratings the field uses), each
 * snap cast to the players who made it (season/cast.ts) for the box score and the highlights.
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
/** Overtime periods before a coin flip settles it (two-point plays from the 3rd end almost every game first). */
const OT_MAX_ROUNDS = 8;
export { INT_SHARE, QB_RUN_SHARE, TARGETS } from './cast';

/** One team's box score as it's built: its line, its players' lines, and who's on the field. */
export interface BoxSide {
  id: string;
  on: Record<string, Athlete>;
  /** The casting stream (season/cast.ts), apart from the results' stream. */
  cast: Rng;
  tl: TeamLine;
  lines: Map<string, PlayerLine>;
}

interface Side extends BoxSide {
  squad: Squad;
  off: number;
  def: number;
  plan: GamePlan;
  qbRun: number;
  lineup: Lineup;
  conf: UnitConf;
  /** This week's emphases (season/emphasis.ts), if any group isn't on standard. */
  mods?: TeamMods;
}

export function blankTeamLine(): TeamLine {
  return { points: 0, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 };
}

/** A side's players and tendencies, for casting. */
export function lineupOf(squad: Squad, plan: GamePlan): Lineup {
  return { on: starters(squad), passShare: plan.passShare, qbRun: QB_RUN_SHARE[squad.team.profile.offense.qbStyle] ?? 0.1 };
}

function side(squad: Squad, plan: GamePlan, edge: number, cast: Rng, mods?: TeamMods): Side {
  const r = teamRatings(squad);
  const lineup = lineupOf(squad, plan);
  return {
    id: squad.team.id, squad, off: r.off + edge, def: r.def + edge, plan, mods,
    qbRun: lineup.qbRun,
    on: lineup.on,
    lineup,
    cast,
    conf: teamConf(squad),
    tl: blankTeamLine(),
    lines: new Map(),
  };
}

export function lineFor(s: BoxSide, a: Athlete): PlayerLine {
  let l = s.lines.get(a.id);
  if (!l) {
    l = {
      id: a.id, team: s.id, name: athleteName(a), pos: a.pos,
      cmp: 0, att: 0, passYds: 0, passTd: 0, int: 0, rush: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, fgm: 0, fga: 0, sk: 0, defInt: 0,
    };
    s.lines.set(a.id, l);
  }
  return l;
}

/**
 * Credit one drive to the offense's box score, snap by snap as cast (season/cast.ts): `out` keeps the
 * cast for highlights. The casting stream is the game's own, so watching changes nothing.
 */
function credit(s: Side, dfn: Side, d: DriveSim, plays: SimPlay[], clock: DriveClock, out?: DriveCredit): void {
  const snaps = castDrive(plays, s.lineup, dfn.lineup, clock, s.cast);
  if (out) out.snaps = snaps;
  creditSnaps(s, d, plays, snaps, dfn);
}

/**
 * Credit a drive's cast snaps to the offense's box score (also the CPU's drives in a live game), and
 * the defense's sacks and interceptions to `dfn`'s.
 */
export function creditSnaps(s: BoxSide, d: DriveSim, plays: SimPlay[], snaps: DriveCredit['snaps'], dfn?: BoxSide, played = false): void {
  const tl = s.tl;
  tl.plays += d.plays;
  tl.yards += d.yards;
  tl.points += d.points;
  const ql = s.on.QB ? lineFor(s, s.on.QB) : null;
  const extraInc = (1 - CAST.completion) / CAST.completion;
  let passYds = 0;
  snaps.forEach((c, i) => {
    if (!c) return;
    const p = plays[i];
    const yds = Math.min(p.gain, 100 - p.yard);
    const td = !p.turnover && p.yard + p.gain >= 100;
    const who = c.who && s.on[c.who.slot] ? lineFor(s, s.on[c.who.slot]) : null;
    const by = dfn && c.by && dfn.on[c.by.slot] ? lineFor(dfn, dfn.on[c.by.slot]) : null;
    if (by && c.kind === 'sack') by.sk++;
    if (by && c.kind === 'int') by.defInt++;
    switch (c.kind) {
      case 'catch':
        passYds += yds;
        if (ql) {
          ql.att++;
          ql.cmp++;
          ql.passYds += yds;
          if (td) ql.passTd++;
          // The incompletions the drive sim doesn't log as snaps (a played drive logs every one).
          if (!played && s.cast() < extraInc) ql.att++;
        }
        if (who) {
          who.rec++;
          who.recYds += yds;
          if (td) who.recTd++;
        }
        break;
      case 'inc':
        if (ql) ql.att++;
        break;
      case 'int':
        if (ql) {
          ql.att++;
          ql.int++;
        }
        break;
      case 'run':
      case 'sack':
      case 'kneel':
        // NCAA: sacks and kneels are rushes.
        if (who) {
          who.rush++;
          who.rushYds += yds;
          if (td) who.rushTd++;
        }
        break;
      default:
        break;
    }
  });
  tl.passYds += passYds;
  tl.rushYds += d.yards - passYds;
  if ((d.result === 'FIELD GOAL' || d.result === 'MISSED FG') && s.on.K) {
    const kl = lineFor(s, s.on.K);
    kl.fga++;
    if (d.result === 'FIELD GOAL') kl.fgm++;
  }
  if (d.result === 'TURNOVER') tl.turnovers++;
}

/**
 * A simulated drive's snaps as a progression log, with the try and kickoff after a score. A drive played
 * through the engine passes its credit (`engineCredit`), so each snap says what it was: pass, sack, pick.
 */
export function driveLog(off: string, plays: SimPlay[], d: DriveSim, ot = false, credit?: DriveCredit['snaps']): DriveLog {
  const out: LoggedPlay[] = plays.map((p, i) => {
    const l: LoggedPlay = { gain: p.gain, down: p.down, toGo: p.toGo };
    const c = credit?.[i];
    if (c && c.kind !== 'kneel') l.pass = c.pass;
    if (c?.kind === 'sack') l.sack = true;
    if (c?.kind === 'int') l.int = true;
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
 * `simulateDrive` for `o` against `dfn`, logging the drive into `logs` when there are any; returns its
 * snaps too (for the credit and a story). Watching the snaps draws no random numbers.
 */
function drive(
  o: Side, dfn: Side, offOvr: number, start: number, rng: Rng, clock: DriveClock, logs: DriveLog[] | undefined, conf: DriveConf, ot = false,
): [DriveSim, SimPlay[]] {
  const mods = driveMods(o.mods, dfn.mods, o.plan.passShare);
  const plays: SimPlay[] = [];
  const d = simulateDrive(offOvr, dfn.def, start, rng, clock, (p) => plays.push(p), conf, mods);
  logs?.push(driveLog(o.id, plays, d, ot));
  return [d, plays];
}

/** Add a drive to the story (the score is the one before it) and return its credit record for `credit` to fill. */
function tell(
  story: GameStory | undefined, o: Side, dfn: Side, d: DriveSim, plays: SimPlay[], start: number, half: number, left: number, qSecs: number,
): DriveCredit | undefined {
  if (!story) return undefined;
  const credit: DriveCredit = { snaps: [] };
  story.drives.push({
    off: o.id, half, left, qSecs, score: { [o.id]: o.tl.points, [dfn.id]: dfn.tl.points }, start, result: d.result, points: d.points, plays, credit,
  });
  return credit;
}

/** A two-point try (`simTwoPoint`), told as its own one-snap drive from the 3. */
function twoPoint(o: Side, dfn: Side, rng: Rng, story: GameStory | undefined, half: number): void {
  const good = simTwoPoint(o.off, dfn.def, rng);
  const plays: SimPlay[] = [{ gain: good ? 3 : 0, explosive: false, turnover: false, down: 1, toGo: 3, yard: 97, t: 0, lev: 1 }];
  // Cast whether or not there's a story, so the casting stream doesn't depend on watching.
  const snaps = castDrive(plays, o.lineup, dfn.lineup, { timeLeft: Infinity, hurry: false, milk: false, lead: o.tl.points - dfn.tl.points, ot: 'second' }, o.cast);
  story?.drives.push({
    off: o.id, half, left: 0, qSecs: HALF_SECS / 2, score: { [o.id]: o.tl.points, [dfn.id]: dfn.tl.points }, start: 97,
    result: good ? 'TOUCHDOWN' : 'DOWNS', points: good ? 2 : 0, try: true, credit: { snaps }, plays,
  });
  if (good) o.tl.points += 2;
}

/**
 * FBS overtime (`OVERTIME`, game/rules.ts) until one side leads after a period: possessions from the
 * opponent's 25, then two-point plays from the 3rd period. `first` has the ball first in odd periods.
 * Returns the periods played.
 */
function overtime(first: Side, second: Side, rng: Rng, logs?: DriveLog[], story?: GameStory): number {
  const O = OVERTIME;
  let period = 0;
  while (first.tl.points === second.tl.points) {
    period++;
    const half = period + 1;
    const order = period % 2 ? [first, second] : [second, first];
    for (let i = 0; i < 2; i++) {
      const [o, dfn] = [order[i], order[1 - i]];
      if (period >= O.shootout) {
        twoPoint(o, dfn, rng, story, half);
        continue;
      }
      const otClock: DriveClock = { timeLeft: Infinity, hurry: false, milk: false, lead: o.tl.points - dfn.tl.points, ot: i === 0 ? 'first' : 'second' };
      const [d, plays] = drive(o, dfn, o.off, O.start, rng, otClock, logs, driveConf(o, dfn, true), true);
      // The drive sim's touchdown has the kick in it. Going second, a lead after the six ends the game
      // at once; otherwise kick in the 1st overtime (unless only two ties it) and go for two after that.
      const td = d.result === 'TOUCHDOWN';
      const six = o.tl.points + 6;
      const walkOff = td && i === 1 && six > dfn.tl.points;
      const kick = td && !walkOff && period < O.mustGoForTwo && !(i === 1 && dfn.tl.points - six === 2);
      const scored = td ? { ...d, points: kick ? 7 : 6 } : d;
      credit(o, dfn, scored, plays, otClock, tell(story, o, dfn, scored, plays, O.start, half, 0, HALF_SECS / 2));
      if (td && !walkOff && !kick) twoPoint(o, dfn, rng, story, half);
    }
    if (period >= OT_MAX_ROUNDS && first.tl.points === second.tl.points) {
      // Sudden death by coin flip so the sim always ends.
      (rng() < 0.5 ? first : second).tl.points += 2;
    }
  }
  return period;
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

/** The game's casting stream, forked once from its results' stream. */
const castStream = (rng: Rng): Rng => mulberry32(Math.floor(rng() * 2 ** 32));

export function simGame(home: Squad, away: Squad, rng: Rng, opts: SimOptions = {}): GameResult {
  const edge = opts.neutral ? 0 : GAME_SIM.homeEdge;
  const pace = clamp(1 + gauss(rng) * GAME_SIM.paceSd, 0.7, 1.3);
  const cast = castStream(rng);
  const h = side(home, opts.plans?.home ?? autoGamePlan(home, away), edge, cast, opts.emph?.home);
  const a = side(away, opts.plans?.away ?? autoGamePlan(away, home), 0, cast, opts.emph?.away);
  // Always told, for the game page's plays: telling draws no random numbers.
  const story = opts.story ?? newStory(h.id, a.id);
  const firstHalf = rng() < 0.5 ? h : a;
  for (let half = 0; half < 2; half++) {
    let off = half === 0 ? firstHalf : firstHalf === h ? a : h;
    let start = 25;
    let left = HALF_SECS;
    while (left > 0) {
      const dfn = off === h ? a : h;
      const lead = off.tl.points - dfn.tl.points;
      const clock: DriveClock = { timeLeft: left, hurry: false, milk: false, pace, lead, finalHalf: half === 1, qSecs: HALF_SECS / 2 };
      const script = GAME_SIM.script * clamp(lead, -GAME_SIM.scriptCap, GAME_SIM.scriptCap);
      // The fourth quarter is the last 900 seconds of the second half.
      const close = half === 1 && left <= 900 && lateAndClose(4, lead);
      const [d, plays] = drive(off, dfn, off.off - script, start, rng, clock, opts.drives, driveConf(off, dfn, close));
      credit(off, dfn, d, plays, clock, tell(story, off, dfn, d, plays, start, half, left, HALF_SECS / 2));
      left -= d.secs;
      if (d.result === 'END OF HALF') break;
      start = userStartAfter(d, rng);
      off = dfn;
    }
  }
  const ot = h.tl.points === a.tl.points ? overtime(a, h, rng, opts.drives, story) : 0;
  return {
    home: h.tl.points, away: a.tl.points, ot,
    box: { home: h.tl, away: a.tl, players: [...h.lines.values(), ...a.lines.values()] },
    // By the game's own ids (a caller's story may not name them).
    plays: gamePlays({ ...story, home: h.id, away: a.id }, { [h.id]: h.on, [a.id]: a.on }),
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
  /** The simulated stretch drive by drive (`opts.story` when given), for the live game's to go on from. */
  story: GameStory;
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
  const cast = castStream(rng);
  const u = side(user, opts.plans.user, userHome ? edge : 0, cast, opts.emph?.user);
  const c = side(cpu, opts.plans.cpu, userHome ? 0 : edge, cast, opts.emph?.cpu);
  const story = opts.story ?? (userHome ? newStory(u.id, c.id) : newStory(c.id, u.id));
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
    // The last quarter before the hand-off ends at its break, not at the half.
    const cut = (toQuarter === 2 || toQuarter === 4) && q === toQuarter - 1;
    const dc: DriveClock = {
      timeLeft: cut ? clock.time : left, hurry: false, milk: false, pace, quarterBreak: cut, pastBreak: cut ? left - clock.time : 0, lead, finalHalf: q >= 3, qSecs,
    };
    const script = GAME_SIM.script * clamp(lead, -GAME_SIM.scriptCap, GAME_SIM.scriptCap);
    const [d, plays] = drive(off, dfn, off.off - script, start, rng, dc, opts.drives, driveConf(off, dfn, lateAndClose(q, lead)));
    credit(off, dfn, d, plays, dc, tell(story, off, dfn, d, plays, start, q <= 2 ? 0 : 1, left, qSecs));
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
    story,
  };
}

/**
 * A live game that ended tied: settle it with simulated overtime, keeping the regulation box score.
 * The field plays its own overtime, so this is only a guard (and for results from before it did).
 */
export function settleTie(
  result: GameResult, home: Squad, away: Squad, rng: Rng, neutral = false, drives?: DriveLog[], emph?: SimOptions['emph'],
): GameResult {
  if (result.home !== result.away) return result;
  const edge = neutral ? 0 : GAME_SIM.homeEdge;
  const cast = castStream(rng);
  const h = side(home, autoGamePlan(home, away), edge, cast, emph?.home);
  const a = side(away, autoGamePlan(away, home), 0, cast, emph?.away);
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
