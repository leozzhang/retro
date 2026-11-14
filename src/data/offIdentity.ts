import { gauss, hashString, mulberry32 } from '../engine/math';
import { TARGETS } from '../season/cast';
import type { Coach } from './coaches';
import { callWeight, ocBook, ocStyle, type OffStyle } from './offStyles';
import type { PlayDef } from './plays';
import type { Family } from './playTags';
import { overall, SLOT_POS } from './positions';
import type { RosterPlayer } from './teams';

/**
 * An offense's identity (docs/ENGINEDRIVES.md, Phase 2): the offense's counterpart of `defIdentity`. It's
 * built from the OC in the chair and the players on the field, and never stored, so a new OC or a new
 * star changes it. The engine's CPU offense plays it (`ocCall`, `CpuQb`), the drive report measures it
 * (TENDENCIES), and the scouting report can describe it.
 *
 * - **The OC's own lean:** his style's call weights (`STYLES.calls`), times his own taste for each family
 *   (`fam`, drawn from his id), plus a couple of go-to plays (`favorites`) he leans on more on money downs.
 * - **Who gets the ball:** each receiver's prior share of the targets (`targets`): the casting share for his
 *   slot (`TARGETS`) times his overall at the slot over 75, to the `sharp` power. The QB looks for his best
 *   man first, more on money downs. The slot's share (`TARGETS`) is how often its routes get looked at; talent moves it.
 * - **The QB:** `runLean`, 0..1, how readily he tucks it and runs when the pocket breaks down rather than
 *   buying time to throw (his speed and elusiveness, and the style); `aggression`, -1..1, how tight a window
 *   he'll throw into downfield (his arm and deep accuracy against his read of the field).
 */
export const OFF_ID = {
  /** Target shares: casting's `TARGETS` for the slot (how often it runs a route that gets looked at) × exp(`talent` × his overall over the team's best receiver's). */
  talent: 0.09,
  /** The QB's run lean from his speed: 0 at `run[0]`, 1 at `run[1]`; elusiveness adds `elu` a point over 75; the style adds `style`. */
  run: [74, 96],
  elu: 0.01,
  style: { spreadOption: 0.15, spreadRpo: 0.05, airRaid: -0.1, pro: -0.05, power: 0 } as Record<OffStyle, number>,
  /** Aggression from arm and deep accuracy (each a point past `aggFrom`, × `aggPer`) less play recognition's. */
  aggFrom: 80,
  aggPer: 0.025,
  /** The OC's taste: each family's weight × exp(sd × z) from his id; `passSd`, his pass share's spread; `favorites` go-to plays at `favW`× (×`money` more on 3rd and 4th down and in the red zone). */
  famSd: 0.3,
  passSd: 0.035,
  passMax: 0.07,
  favorites: 2,
  favW: 1.8,
  money: 1.6,
};

export interface OffIdentity {
  style: OffStyle;
  /** The OC's taste for each family (× the style's weight). */
  fam: Partial<Record<Family, number>>;
  /** His pass share's own lean, added to the game plan's. */
  passLean: number;
  /** His go-to plays by id. */
  favorites: string[];
  /** The prior share of targets by slot (sums to 1 over the receivers on the field), and the best receiver. */
  targets: Record<string, number>;
  star: string | null;
  qb: { runLean: number; aggression: number };
}

const FAMILIES: Family[] = ['quick', 'dropback', 'shot', 'screen', 'pa', 'boot', 'rpo', 'insideZone', 'outsideZone', 'gap', 'perimeter', 'read', 'qbRun', 'draw'];
export const REC_SLOTS = ['X', 'Z', 'SL', 'TE', 'RB'];

/** The OC's own lean (his id's draws), the same wherever he goes. */
function ocTaste(oc: Pick<Coach, 'id'>, book: readonly PlayDef[], style: OffStyle): Pick<OffIdentity, 'fam' | 'passLean' | 'favorites'> {
  const rng = mulberry32(hashString(`oc-taste:${oc.id}`));
  const fam: Partial<Record<Family, number>> = {};
  for (const f of FAMILIES) fam[f] = Math.exp(gauss(rng) * OFF_ID.famSd);
  const passLean = Math.max(-OFF_ID.passMax, Math.min(OFF_ID.passMax, gauss(rng) * OFF_ID.passSd));
  // Go-to plays: drawn from his book by how much he likes their family, never a short-yardage play.
  const pool = book.filter((p) => !p.short);
  const w = pool.map((p) => callWeight(style, p.tags.family) * (fam[p.tags.family] ?? 1));
  const favorites: string[] = [];
  for (let k = 0; k < OFF_ID.favorites && favorites.length < pool.length; k++) {
    let x = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      if ((x -= w[i]) > 0) continue;
      if (!favorites.includes(pool[i].id)) favorites.push(pool[i].id);
      w[i] = 0;
      break;
    }
  }
  return { fam, passLean, favorites };
}

/** The prior target shares for the receivers on the field. */
export function targetShares(roster: Record<string, RosterPlayer | undefined>): Record<string, number> {
  const raw: Record<string, number> = {};
  const ovr: Record<string, number> = {};
  for (const sl of REC_SLOTS) if (roster[sl]) ovr[sl] = overall(roster[sl]!.r, SLOT_POS[sl]);
  const best = Math.max(...Object.values(ovr));
  for (const [sl, o] of Object.entries(ovr)) raw[sl] = (TARGETS[sl] ?? 0.1) * Math.exp(OFF_ID.talent * (o - best));
  const tot = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / tot]));
}

/** The QB's tendencies from his ratings and the style. */
export function qbLean(qb: RosterPlayer | undefined, style: OffStyle): OffIdentity['qb'] {
  if (!qb) return { runLean: 0, aggression: 0 };
  const r = qb.r;
  const [lo, hi] = OFF_ID.run;
  const runLean = Math.max(0, Math.min(1, (r.spd - lo) / (hi - lo) + OFF_ID.elu * (r.elu - 75) + (OFF_ID.style[style] ?? 0)));
  const aggression = Math.max(-1, Math.min(1, OFF_ID.aggPer * ((r.arm - OFF_ID.aggFrom) + (r.dac - OFF_ID.aggFrom) / 2 - (r.prc - OFF_ID.aggFrom) / 2)));
  return { runLean, aggression };
}

/** The offense with `oc` calling it and `roster` on the field. */
export function offIdentity(oc: Pick<Coach, 'id'>, roster: Record<string, RosterPlayer | undefined>): OffIdentity {
  const style = ocStyle(oc);
  const targets = targetShares(roster);
  const star = Object.entries(targets).filter(([sl]) => sl !== 'RB').sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { style, ...ocTaste(oc, ocBook(oc), style), targets, star, qb: qbLean(roster.QB, style) };
}
