import { TEMPLATES } from './athletes';
import type { RatingKey, Ratings } from './ratings';
import type { Role } from './teams';

/** Roster positions. The sim only knows `Role`; positions add the line and back-seven detail. */
export type Position = 'QB' | 'HB' | 'FB' | 'WR' | 'TE' | 'OT' | 'OG' | 'C' | 'DE' | 'DT' | 'OLB' | 'MLB' | 'CB' | 'FS' | 'SS' | 'K' | 'P';

export const POSITIONS: Position[] = ['QB', 'HB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'OLB', 'MLB', 'CB', 'FS', 'SS', 'K', 'P'];

export const POS_ROLE: Record<Position, Role> = {
  QB: 'QB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', OG: 'OL', C: 'OL',
  DE: 'DL', DT: 'DL', OLB: 'LB', MLB: 'LB', CB: 'CB', FS: 'S', SS: 'S', K: 'K', P: 'P',
};

/** The position each on-field slot is rated at. */
export const SLOT_POS: Record<string, Position> = {
  QB: 'QB', RB: 'HB', FB: 'FB', X: 'WR', Z: 'WR', SL: 'WR', WR4: 'WR', TE: 'TE', TE2: 'TE',
  LT: 'OT', RT: 'OT', LG: 'OG', RG: 'OG', C: 'C',
  DE1: 'DE', DE2: 'DE', DT1: 'DT', DT2: 'DT', WLB: 'OLB', SAM: 'OLB', MLB: 'MLB',
  CB1: 'CB', CB2: 'CB', NB: 'CB', DIME: 'CB', FS: 'FS', SS: 'SS', K: 'K', P: 'P',
};

/**
 * Overall weights per position: only ratings that change something for that position on the
 * field, weighted by how much a point of each is worth there (see `npm run ratings` and
 * docs/RATINGS.md). Weights are relative; `overall` normalizes them.
 */
export const OVR_WEIGHTS: Record<Position, Partial<Record<RatingKey, number>>> = {
  // Accuracy and arm are judgment: the auto-QB harness can't measure them (see RATINGS.md).
  QB: { sac: 14, mac: 14, dac: 10, arm: 14, pac: 12, tup: 8, spd: 9, acc: 4, elu: 5, sta: 4, str: 2 },
  HB: { spd: 22, elu: 16, str: 14, acc: 10, cth: 9, cit: 2, rte: 4, sta: 8, pbk: 5 },
  FB: { rbk: 30, pbk: 15, str: 20, spd: 8, acc: 7, cth: 8, elu: 4, sta: 3 },
  WR: { spd: 20, rte: 16, cth: 16, cit: 10, elu: 10, acc: 8, rbk: 6, rls: 6, str: 5, sta: 3 },
  TE: { cth: 14, cit: 10, rte: 10, spd: 12, acc: 6, rbk: 18, pbk: 12, str: 8, rls: 4, elu: 3, sta: 3 },
  // A lineman's strength is 20% of both blocks (ANCHOR_STR): a quarter of pbk's weight plus a quarter of rbk's.
  OT: { pbk: 42, rbk: 30, str: 18, acc: 5, spd: 5 },
  OG: { rbk: 38, pbk: 32, str: 18, acc: 5, spd: 5 },
  C: { rbk: 36, pbk: 34, str: 18, acc: 5, spd: 5 },
  DE: { rsh: 26, bsh: 24, spd: 20, tkl: 14, acc: 6, prc: 4, str: 6 },
  DT: { bsh: 32, rsh: 20, spd: 14, tkl: 16, str: 8, acc: 4, prc: 6 },
  OLB: { tkl: 18, spd: 14, acc: 12, prc: 14, mcv: 12, zcv: 8, bsh: 8, rsh: 8, str: 4, cth: 2 },
  MLB: { tkl: 20, prc: 18, spd: 14, acc: 12, mcv: 10, zcv: 8, bsh: 8, rsh: 4, str: 4, cth: 2 },
  CB: { mcv: 22, spd: 18, acc: 14, tkl: 14, zcv: 10, prs: 6, cth: 6, prc: 6, bsh: 2, str: 2 },
  FS: { spd: 22, tkl: 18, zcv: 18, prc: 12, mcv: 8, acc: 8, cth: 8, str: 3, bsh: 3 },
  SS: { tkl: 22, spd: 18, prc: 14, zcv: 12, mcv: 10, acc: 6, bsh: 8, cth: 6, str: 4 },
  // From 40-55 yards, leg matters most for a weak leg and accuracy for a strong one; even split.
  K: { kpw: 50, kac: 50 },
  P: { kpw: 60, kac: 40 },
};

/**
 * Overall, unrounded. It's relative to the position: each rating is measured against the
 * position's template at a 75 (`TEMPLATES` in athletes.ts), so a pocket QB isn't dragged down by
 * a lineman-slow 40 and a tackle's speed only counts against other tackles. A player exactly on the
 * template at level L rates L. Each point of a rating is worth `w / Σ(w·slope)` overall points.
 */
export function overallRaw(r: Ratings, pos: Position): number {
  let sum = 0;
  let wsum = 0;
  for (const [k, w, v75, slope] of ovrTerms(pos)) {
    sum += (r[k] - v75) * w;
    wsum += w * slope;
  }
  return 75 + sum / wsum;
}

/** Each position's overall terms, [rating, weight, template at 75, slope], built once (overalls are computed constantly). */
const TERMS = new Map<Position, [RatingKey, number, number, number][]>();
function ovrTerms(pos: Position): [RatingKey, number, number, number][] {
  let t = TERMS.get(pos);
  if (!t) {
    t = (Object.entries(OVR_WEIGHTS[pos]) as [RatingKey, number][]).map(([k, w]) => {
      const [v75, slope] = TEMPLATES[pos][k] ?? [75, 1];
      return [k, w, v75, slope];
    });
    TERMS.set(pos, t);
  }
  return t;
}

/** One rating's part in an overall: its share of the weight, and the overall points it adds or costs against a 75. */
export interface OvrPart {
  key: RatingKey;
  value: number;
  share: number;
  delta: number;
}

/** What makes up an overall, heaviest weight first. `75 + Σ delta` is `overallRaw`. */
export function overallBreakdown(r: Ratings, pos: Position): OvrPart[] {
  const entries = Object.entries(OVR_WEIGHTS[pos]) as [RatingKey, number][];
  let wsum = 0;
  let wtot = 0;
  for (const [k, w] of entries) {
    wsum += w * (TEMPLATES[pos][k] ?? [75, 1])[1];
    wtot += w;
  }
  return entries
    .map(([k, w]) => ({ key: k, value: r[k], share: w / wtot, delta: ((r[k] - (TEMPLATES[pos][k] ?? [75, 1])[0]) * w) / wsum }))
    .sort((a, b) => b.share - a.share);
}

/** Overall at a position, 25-99. */
export function overall(r: Ratings, pos: Position): number {
  return Math.round(Math.min(99, Math.max(25, overallRaw(r, pos))));
}
