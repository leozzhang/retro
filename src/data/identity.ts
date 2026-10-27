import { clamp, hashString } from '../engine/math';
import { DEF_CALLS } from './defenses';
import type { Team } from './teams';

/**
 * A defense's identity: how often it calls each coverage, how much it presses, and whether it brings
 * the house on third and long. Computed from the program, never stored. The live game's CPU defense
 * picks its calls with it and the weekly scouting report describes it (docs/SCOUTING.md).
 *
 * It only tilts frequencies: every call keeps `floor`, and across all FBS teams the mix averages the
 * old fixed weights (40/40/20), so the league as a whole plays the same defense it always did.
 */
export type DefStyle = 'aggressive' | 'balanced' | 'soft';

export interface DefIdentity {
  style: DefStyle;
  /** Weight of each call by `DEF_CALLS` id, summing to 1. */
  mix: Record<string, number>;
  /** Press odds per corner slot, at the snap. */
  press: Record<string, number>;
  /** Cover 0 multiplier on third or fourth and `longToGo` or more. */
  longBlitz: number;
}

/**
 * Identity tuning.
 * - `styles`: share of programs with each style, and each style's base mix, press and third-and-long blitz.
 * - `dlBlitz`: Cover 0 traded for 2 Man per point of the DL unit (`profile.units`): a front that gets home
 *   with four doesn't need to send six.
 * - `cbMan`: 2 Man traded for Cover 1 per point of the CB unit (good corners can live on an island);
 *   `cbPress`: press odds per point of it.
 * - `floor`: the least any call is ever used.
 */
export const IDENTITY = {
  styles: {
    aggressive: { share: 0.3, mix: { '2-man': 0.32, 'c1-robber': 0.38, 'c0-blitz': 0.3 }, press: 1.3, longBlitz: 1.6 },
    balanced: { share: 0.4, mix: { '2-man': 0.4, 'c1-robber': 0.4, 'c0-blitz': 0.2 }, press: 1, longBlitz: 1.2 },
    soft: { share: 0.3, mix: { '2-man': 0.5, 'c1-robber': 0.4, 'c0-blitz': 0.1 }, press: 0.6, longBlitz: 0.7 },
  } as Record<DefStyle, { share: number; mix: Record<string, number>; press: number; longBlitz: number }>,
  basePress: { CB1: 0.35, CB2: 0.35, NB: 0.2 } as Record<string, number>,
  dlBlitz: 0.03,
  cbMan: 0.03,
  cbPress: 0.06,
  floor: 0.08,
  longToGo: 7,
};

/** The coordinator's style, seeded by the program. TODO: from the DC once coaches exist. */
export function defStyle(teamId: string): DefStyle {
  const r = (hashString(`def-style:${teamId}`) % 10000) / 10000;
  const S = IDENTITY.styles;
  return r < S.aggressive.share ? 'aggressive' : r < S.aggressive.share + S.balanced.share ? 'balanced' : 'soft';
}

/** Raise every weight to the floor, taking the difference from the others in proportion. */
function floorMix(mix: Record<string, number>): Record<string, number> {
  const f = IDENTITY.floor;
  const low = Object.keys(mix).filter((k) => mix[k] < f);
  const need = low.reduce((s, k) => s + f - mix[k], 0);
  const rest = Object.keys(mix).filter((k) => mix[k] >= f);
  const restSum = rest.reduce((s, k) => s + mix[k], 0);
  const out: Record<string, number> = {};
  for (const k of low) out[k] = f;
  for (const k of rest) out[k] = mix[k] - (need * mix[k]) / restSum;
  return out;
}

function normalize(mix: Record<string, number>): Record<string, number> {
  const tot = Object.values(mix).reduce((s, w) => s + Math.max(0, w), 0);
  return Object.fromEntries(Object.entries(mix).map(([k, w]) => [k, Math.max(0, w) / tot]));
}

const cache = new Map<string, DefIdentity>();

export function defIdentity(team: Team): DefIdentity {
  const hit = cache.get(team.id);
  if (hit) return hit;
  const style = defStyle(team.id);
  const S = IDENTITY.styles[style];
  const dl = team.profile.units.DL ?? 0;
  const cb = team.profile.units.CB ?? 0;
  const mix = { ...S.mix };
  mix['c0-blitz'] -= IDENTITY.dlBlitz * dl;
  mix['2-man'] += IDENTITY.dlBlitz * dl - IDENTITY.cbMan * cb;
  mix['c1-robber'] += IDENTITY.cbMan * cb;
  const press: Record<string, number> = {};
  for (const [slot, p] of Object.entries(IDENTITY.basePress)) press[slot] = clamp(p * S.press + IDENTITY.cbPress * cb, 0.05, 0.7);
  const id: DefIdentity = { style, mix: floorMix(normalize(mix)), press, longBlitz: S.longBlitz };
  cache.set(team.id, id);
  return id;
}

/** Third or fourth and long. */
export function longYardage(down: number, toGo: number): boolean {
  return down >= 3 && toGo >= IDENTITY.longToGo;
}

/** The mix for this snap: third and long moves Cover 0 by the identity's `longBlitz` (still floored). */
export function situationMix(id: DefIdentity, down: number, toGo: number): Record<string, number> {
  if (!longYardage(down, toGo)) return id.mix;
  return floorMix(normalize({ ...id.mix, 'c0-blitz': id.mix['c0-blitz'] * id.longBlitz }));
}

/** Share of snaps in each shell, from a mix. */
export function shellShares(mix: Record<string, number>): Record<'two-high' | 'one-high' | 'zero', number> {
  const out = { 'two-high': 0, 'one-high': 0, zero: 0 };
  for (const c of DEF_CALLS) out[c.shell] += mix[c.id] ?? 0;
  return out;
}

/** A short tag for the defense, for the prep page. */
export function defLabel(id: DefIdentity): string {
  const press = (id.press.CB1 + id.press.CB2) / 2;
  const head = id.style === 'aggressive' ? 'BLITZ-HEAVY' : id.style === 'soft' ? "BEND DON'T BREAK" : 'BALANCED';
  return press >= 0.42 ? `${head}, PRESS MAN` : press <= 0.25 ? `${head}, OFF COVERAGE` : head;
}
