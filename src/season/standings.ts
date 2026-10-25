import type { Conference } from '../data/fbs/profile';
import { TEAMS } from '../data/teams';
import { hashString } from '../engine/math';
import type { SeasonGame, SeasonState } from './types';

/**
 * Records and standings are computed from the game results every time they're needed, never stored.
 * Conference records count regular-season conference games only (not the championship game).
 */

export interface TeamRecord {
  w: number;
  l: number;
  /** Conference wins and losses. */
  cw: number;
  cl: number;
  pf: number;
  pa: number;
  /** Margin in conference games. */
  cMargin: number;
}

const empty = (): TeamRecord => ({ w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, cMargin: 0 });

export function winner(g: SeasonGame): string | undefined {
  if (!g.result) return undefined;
  return g.result.home > g.result.away ? g.home : g.away;
}

export function loser(g: SeasonGame): string | undefined {
  const w = winner(g);
  return w && (w === g.home ? g.away : g.home);
}

export function played(state: SeasonState): SeasonGame[] {
  return state.games.filter((g) => g.result);
}

/** Every team's record from the games played so far. */
export function records(state: SeasonState): Map<string, TeamRecord> {
  const out = new Map(TEAMS.map((t) => [t.id, empty()]));
  for (const g of played(state)) {
    const r = g.result!;
    for (const [id, pf, pa] of [[g.home, r.home, r.away], [g.away, r.away, r.home]] as const) {
      const rec = out.get(id) ?? out.set(id, empty()).get(id)!;
      const won = pf > pa;
      rec.pf += pf;
      rec.pa += pa;
      if (won) rec.w++;
      else rec.l++;
      if (g.kind === 'conf') {
        if (won) rec.cw++;
        else rec.cl++;
        rec.cMargin += pf - pa;
      }
    }
  }
  return out;
}

export function recordText(r: TeamRecord): string {
  return `${r.w}-${r.l}`;
}

const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0);

export interface TiebreakContext {
  state: SeasonState;
  recs: Map<string, TeamRecord>;
  /** Every team tied with these two on conference record. */
  tied: string[];
}

/** Positive when `a` should rank ahead of `b`. */
export type Tiebreaker = (a: string, b: string, ctx: TiebreakContext) => number;

/** Win % in conference games among the tied teams. */
const headToHead: Tiebreaker = (a, b, ctx) => {
  const inGroup = new Set(ctx.tied);
  const tally = (id: string) => {
    let w = 0;
    let l = 0;
    for (const g of played(ctx.state)) {
      if (g.kind !== 'conf' || (g.home !== id && g.away !== id)) continue;
      const opp = g.home === id ? g.away : g.home;
      if (!inGroup.has(opp)) continue;
      if (winner(g) === id) w++;
      else l++;
    }
    return pct(w, l);
  };
  return tally(a) - tally(b);
};

const overallPct: Tiebreaker = (a, b, { recs }) => pct(recs.get(a)!.w, recs.get(a)!.l) - pct(recs.get(b)!.w, recs.get(b)!.l);
const confMargin: Tiebreaker = (a, b, { recs }) => recs.get(a)!.cMargin - recs.get(b)!.cMargin;
/** A seeded coin flip, so the order is stable within a season. */
const coinFlip: Tiebreaker = (a, b, { state }) =>
  hashString(`${state.seed}:${state.year}:${b}`) - hashString(`${state.seed}:${state.year}:${a}`);

/** Applied in order until one separates the teams. Real conference rules can replace this list. */
export const TIEBREAKERS: { name: string; cmp: Tiebreaker }[] = [
  { name: 'head-to-head', cmp: headToHead },
  { name: 'overall record', cmp: overallPct },
  { name: 'conference margin', cmp: confMargin },
  { name: 'coin flip', cmp: coinFlip },
];

export interface StandingRow {
  team: string;
  rec: TeamRecord;
}

export function standings(state: SeasonState, conference: Conference): StandingRow[] {
  const recs = records(state);
  const ids = TEAMS.filter((t) => t.conference === conference).map((t) => t.id);
  const confPct = (id: string) => pct(recs.get(id)!.cw, recs.get(id)!.cl);
  const sorted = [...ids].sort((a, b) => {
    const d = confPct(b) - confPct(a);
    if (Math.abs(d) > 1e-9) return d;
    const ctx = { state, recs, tied: ids.filter((id) => Math.abs(confPct(id) - confPct(a)) < 1e-9) };
    for (const tb of TIEBREAKERS) {
      const v = tb.cmp(a, b, ctx);
      if (Math.abs(v) > 1e-9) return -v;
    }
    return 0;
  });
  return sorted.map((team) => ({ team, rec: recs.get(team)! }));
}
