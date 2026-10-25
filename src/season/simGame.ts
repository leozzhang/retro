import type { Athlete } from '../data/athletes';
import { athleteName, starters, teamRatings, type Squad } from '../data/depth';
import { overall, SLOT_POS } from '../data/positions';
import { clamp, gauss, type Rng } from '../engine/math';
import { simulateDrive, userStartAfter, type DriveClock, type DriveSim } from '../game/rules';
import { autoGamePlan, type GamePlan } from './staff';
import type { GameResult, PlayerLine, TeamLine } from './types';

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
const INT_SHARE = 0.55;
/** Base target share by slot, scaled by the receiver's overall. */
const TARGETS: Record<string, number> = { X: 0.25, Z: 0.21, SL: 0.18, TE: 0.15, RB: 0.11 };
const QB_RUN_SHARE: Record<string, number> = { pocket: 0.08, dual: 0.2, runner: 0.33 };

interface Side {
  id: string;
  squad: Squad;
  off: number;
  def: number;
  plan: GamePlan;
  qbRun: number;
  on: Record<string, Athlete>;
  tl: TeamLine;
  lines: Map<string, PlayerLine>;
}

function side(squad: Squad, plan: GamePlan, edge: number): Side {
  const r = teamRatings(squad);
  return {
    id: squad.team.id, squad, off: r.off + edge, def: r.def + edge, plan,
    qbRun: QB_RUN_SHARE[squad.team.profile.offense.qbStyle] ?? 0.1,
    on: starters(squad),
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

function pickWeighted<T>(items: [T, number][], rng: Rng): T {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let x = rng() * tot;
  for (const [it, w] of items) {
    x -= w;
    if (x <= 0) return it;
  }
  return items[items.length - 1][0];
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

/** Credit one drive to the offense's box score. */
function credit(s: Side, d: DriveSim, rng: Rng): void {
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
      const rl = lineFor(s, pickWeighted(recv, rng));
      rl.rec++;
      rl.recYds += yds[i];
    }
  }
  const run = rushers(s);
  if (run.length && rushPlays) {
    const yds = splitYards(rushYds, rushPlays, rng);
    for (let i = 0; i < rushPlays; i++) {
      const rl = lineFor(s, pickWeighted(run, rng));
      rl.rush++;
      rl.rushYds += yds[i];
    }
  }

  switch (d.result) {
    case 'TOUCHDOWN':
      if (qb && recv.length && rng() < share) {
        lineFor(s, qb).passTd++;
        lineFor(s, pickWeighted(recv, rng)).recTd++;
      } else if (run.length) {
        lineFor(s, pickWeighted(run, rng)).rushTd++;
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
      if (qb && rng() < INT_SHARE) lineFor(s, qb).int++;
      break;
    default:
      break;
  }
}

/** Untimed alternating possessions from the opponent's 25 until one side leads after a round. */
function overtime(first: Side, second: Side, rng: Rng): number {
  let rounds = 0;
  while (first.tl.points === second.tl.points) {
    rounds++;
    for (const [o, dfn] of [[first, second], [second, first]] as const) {
      const d = simulateDrive(o.off, dfn.def, OT_START, rng);
      credit(o, d, rng);
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
}

export function simGame(home: Squad, away: Squad, rng: Rng, opts: SimOptions = {}): GameResult {
  const edge = opts.neutral ? 0 : GAME_SIM.homeEdge;
  const pace = clamp(1 + gauss(rng) * GAME_SIM.paceSd, 0.7, 1.3);
  const h = side(home, opts.plans?.home ?? autoGamePlan(home, away), edge);
  const a = side(away, opts.plans?.away ?? autoGamePlan(away, home), 0);
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
      const d = simulateDrive(off.off - script, dfn.def, start, rng, clock);
      left -= d.secs;
      credit(off, d, rng);
      if (d.result === 'END OF HALF') break;
      start = userStartAfter(d, rng);
      off = dfn;
    }
  }
  const ot = h.tl.points === a.tl.points ? overtime(a, h, rng) : 0;
  return {
    home: h.tl.points, away: a.tl.points, ot,
    box: { home: h.tl, away: a.tl, players: [...h.lines.values(), ...a.lines.values()] },
  };
}

/**
 * A live game that ended tied (the field has no overtime yet): settle it with simulated overtime,
 * keeping the regulation box score.
 */
export function settleTie(result: GameResult, home: Squad, away: Squad, rng: Rng, neutral = false): GameResult {
  if (result.home !== result.away) return result;
  const edge = neutral ? 0 : GAME_SIM.homeEdge;
  const h = side(home, autoGamePlan(home, away), edge);
  const a = side(away, autoGamePlan(away, home), 0);
  h.tl.points = result.home;
  a.tl.points = result.away;
  const ot = overtime(a, h, rng);
  return { ...result, home: h.tl.points, away: a.tl.points, ot, box: { ...result.box, players: [...result.box.players, ...h.lines.values(), ...a.lines.values()] } };
}

/** Rough win probability for the home side from the team overalls, for previews and upset detection. */
export function winOdds(home: Squad, away: Squad, neutral = false): number {
  const gap = teamRatings(home).ovr - teamRatings(away).ovr + (neutral ? 0 : GAME_SIM.homeEdge * 2);
  return clamp(1 / (1 + Math.exp(-gap / 4)), 0.01, 0.99);
}
