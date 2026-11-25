import type { Position } from '../data/positions';
import { latestPoll, rankIn } from './polls';
import { seasonStats, type SeasonLine } from './stats';
import { records } from './standings';
import type { Award, SeasonState } from './types';

/**
 * Awards score players the way each award's voters do (docs/SEASON.md, "Awards"). Each position has a
 * value score from its own stats: a QB's yards and touchdowns scaled by his passing efficiency, a
 * back's rushing with a share of his receiving, a receiver's catches, a kicker's makes scaled by his
 * accuracy. The position awards rank those, scaled a little by team success (the O'Brien most).
 *
 * The Heisman compares positions, so it doesn't add raw totals (the box score's stats run hotter at
 * some positions than others): each candidate is scored by his dominance over his own position (his
 * value over the mean of his position's top `bench` this season), raised to `spread`, times the voters'
 * lean by position (`prior`: QBs win about three Heismans in four) and a steep team factor (winners
 * play for top-10 teams).
 */
export const AWARDS_TUNE = {
  /**
   * A QB's value: yards per point, points per TD and INT, times his efficiency `(rating / the league's
   * median) ^ eff`, clamped, once he has `perGame` attempts a game (the NCAA's qualifier). Relative and
   * capped, since box scores from the engine (the user's games) and the drive sim run at different
   * ratings: a QB's efficiency is worth a little, not a Heisman.
   */
  qb: { passYds: 20, passTd: 4, int: 3, rushYds: 10, rushTd: 6, eff: 1, effMin: 0.85, effMax: 1.15, perGame: 15 },
  /** A back's value: rushing, a `recShare` of his receiving, and a mild YPC factor `(ypc / ypcBase) ^ ypc`, clamped. */
  rb: { rushYds: 10, rushTd: 6, recShare: 0.5, ypcBase: 5, ypc: 0.4, ypcMin: 0.85, ypcMax: 1.2, minRush: 40 },
  /** A receiver's value: yards, touchdowns, catches. */
  wr: { recYds: 10, recTd: 6, rec: 0.3 },
  /**
   * A kicker's value: makes times his accuracy ^ `pctPow`, the accuracy shrunk toward `priorPct` by
   * `prior` phantom kicks, so a 3-for-3 kicker isn't perfect. Fewer than `perGame` attempts a game don't qualify.
   */
  k: { perGame: 1, prior: 3, priorPct: 0.75, pctPow: 3 },
  heisman: {
    bench: 5,
    spread: 2.5,
    prior: { QB: 1, HB: 0.77, FB: 0.77, WR: 0.86, TE: 0.62 } as Partial<Record<Position, number>>,
  },
};

/** NCAA passer efficiency rating. */
export function passerRating(s: SeasonLine): number {
  return s.att ? (8.4 * s.passYds + 330 * s.passTd + 100 * s.cmp - 200 * s.int) / s.att : 0;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const qualified = (s: SeasonLine) => s.att > 0 && s.att >= AWARDS_TUNE.qb.perGame * s.games;

/** The season's context a score reads: the median passer rating among qualified QBs. */
export interface AwardCtx {
  rating: number;
}

export function awardCtx(lines: Iterable<SeasonLine>): AwardCtx {
  const r = [...lines].filter((s) => s.pos === 'QB' && qualified(s)).map(passerRating).sort((a, b) => a - b);
  return { rating: r.length ? r[Math.floor(r.length / 2)] : 0 };
}

export function qbValue(s: SeasonLine, ctx: AwardCtx): number {
  const T = AWARDS_TUNE.qb;
  const raw = s.passYds / T.passYds + s.passTd * T.passTd - s.int * T.int + s.rushYds / T.rushYds + s.rushTd * T.rushTd;
  const eff = qualified(s) && ctx.rating > 0 ? clamp((passerRating(s) / ctx.rating) ** T.eff, T.effMin, T.effMax) : 1;
  return Math.max(0, raw) * eff;
}

export function rbValue(s: SeasonLine): number {
  const T = AWARDS_TUNE.rb;
  const raw = s.rushYds / T.rushYds + s.rushTd * T.rushTd + T.recShare * (s.recYds / T.rushYds + s.recTd * T.rushTd);
  const ypc = s.rush >= T.minRush ? clamp((s.rushYds / s.rush / T.ypcBase) ** T.ypc, T.ypcMin, T.ypcMax) : 1;
  return Math.max(0, raw) * ypc;
}

export function wrValue(s: SeasonLine): number {
  const T = AWARDS_TUNE.wr;
  return Math.max(0, s.recYds / T.recYds + s.recTd * T.recTd + s.rec * T.rec);
}

export function kValue(s: SeasonLine): number {
  const T = AWARDS_TUNE.k;
  if (!s.fga || s.fga < T.perGame * s.games) return 0;
  const pct = (s.fgm + T.prior * T.priorPct) / (s.fga + T.prior);
  return s.fgm * pct ** T.pctPow * 10;
}

/** The value score a player's position is judged by, or null for positions no award here reads. */
function valueFor(s: SeasonLine, ctx: AwardCtx): number | null {
  switch (s.pos) {
    case 'QB': return qbValue(s, ctx);
    case 'HB': case 'FB': return rbValue(s);
    case 'WR': case 'TE': return wrValue(s);
    default: return null;
  }
}

/** Positions that share a Heisman benchmark. */
const GROUP: Partial<Record<Position, string>> = { QB: 'QB', HB: 'RB', FB: 'RB', WR: 'REC', TE: 'REC' };

/**
 * Team success: `1 + win * (win% - 0.5) + rank * (26 - AP rank) / 25`, less `unranked` outside the
 * top 25, floored at `floor`.
 */
export interface TeamFactor {
  win: number;
  rank: number;
  unranked: number;
  floor: number;
}

export interface AwardDef {
  id: string;
  name: string;
  /** Eligible positions; empty means everyone the Heisman's groups cover. */
  pos: Position[];
  /** The value score (the Heisman's is its dominance, computed in `awardRace`). */
  score: (s: SeasonLine, ctx: AwardCtx) => number;
  /** How team success scales the score; null for none. */
  team: TeamFactor | null;
  /** Shown as points: the score times this. */
  show: number;
}

export const AWARDS: AwardDef[] = [
  { id: 'heisman', name: 'Heisman Trophy', pos: [], score: (s, ctx) => valueFor(s, ctx) ?? 0, team: { win: 1, rank: 0.9, unranked: 0.35, floor: 0.2 }, show: 1000 },
  { id: 'obrien', name: "Davey O'Brien Award", pos: ['QB'], score: qbValue, team: { win: 0.5, rank: 0.3, unranked: 0.1, floor: 0.5 }, show: 1 },
  { id: 'walker', name: 'Doak Walker Award', pos: ['HB', 'FB'], score: rbValue, team: { win: 0.3, rank: 0.15, unranked: 0, floor: 0.7 }, show: 1 },
  { id: 'biletnikoff', name: 'Biletnikoff Award', pos: ['WR', 'TE'], score: wrValue, team: { win: 0.3, rank: 0.15, unranked: 0, floor: 0.7 }, show: 1 },
  { id: 'groza', name: 'Lou Groza Award', pos: ['K'], score: kValue, team: null, show: 1 },
];

export function awardRace(state: SeasonState, def: AwardDef, n = 5): Award {
  const recs = records(state);
  const ap = latestPoll(state, 'ap');
  const all = [...seasonStats(state).values()];
  const ctx = awardCtx(all);
  const lines = all.filter((s) => (def.pos.length ? def.pos.includes(s.pos) : GROUP[s.pos]));
  const base = new Map(lines.map((s) => [s.id, def.score(s, ctx)]));
  if (def.id === 'heisman') {
    // Dominance over the position's best this season.
    const T = AWARDS_TUNE.heisman;
    const bench = new Map<string, number>();
    for (const g of new Set(Object.values(GROUP))) {
      const top = lines.filter((s) => GROUP[s.pos] === g).map((s) => base.get(s.id)!).sort((a, b) => b - a).slice(0, T.bench);
      bench.set(g, top.length ? top.reduce((a, b) => a + b, 0) / top.length : 1);
    }
    for (const s of lines) {
      const b = bench.get(GROUP[s.pos]!)! || 1;
      base.set(s.id, (base.get(s.id)! / b) ** T.spread * (T.prior[s.pos] ?? 0));
    }
  }
  const scored = lines
    .map((s) => {
      let score = base.get(s.id)!;
      const t = def.team;
      if (t) {
        const r = recs.get(s.team)!;
        const winPct = r.w + r.l ? r.w / (r.w + r.l) : 0;
        const rank = rankIn(ap, s.team);
        score *= Math.max(t.floor, 1 + t.win * (winPct - 0.5) + (rank ? (t.rank * (26 - rank)) / 25 : -t.unranked));
      }
      return { id: s.id, team: s.team, name: s.name, pos: s.pos, score: score * def.show };
    })
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((f) => ({ ...f, score: Math.round(f.score) }));
  return { id: def.id, name: def.name, finalists: scored.slice(0, n) };
}

export function heismanRace(state: SeasonState, n = 5): Award {
  return awardRace(state, AWARDS[0], n);
}

export function seasonAwards(state: SeasonState): Award[] {
  return AWARDS.map((d) => awardRace(state, d));
}
