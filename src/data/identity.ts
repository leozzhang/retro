import { clamp, hashString } from '../engine/math';
import { buildStaff } from './coaches';
import { DEF_CALLS, rushers, type DefCall } from './defenses';
import type { Team } from './teams';

/**
 * A defense's identity: how it likes to play, as a few dials over the whole defensive playbook, plus
 * how much its corners press. Computed from the program, never stored. The live game's CPU defense
 * picks its calls with it (and, in a live game, the DC's adjustments on top: `game/defBrain.ts`),
 * and the weekly scouting report describes it (docs/SCOUTING.md, docs/DEFENSE.md).
 *
 * Dials are log-weights on each call's traits (`callTraits`): a call's weight is its league prior
 * (`IDENTITY.prior`) × exp(Σ dial × trait). Zero dials are the league's own mix.
 */
export type DefStyle = 'aggressive' | 'balanced' | 'soft';

/** The posture dials: more pressure, more man, more two-high, a heavier box. */
export interface Dials {
  blitz: number;
  man: number;
  twoHigh: number;
  box: number;
}

export interface DefIdentity {
  style: DefStyle;
  /** The defense's own dials, before the situation. */
  dials: Dials;
  /** Weight of each call by `DEF_CALLS` id on a normal down, summing to 1. */
  mix: Record<string, number>;
  /** Press odds per corner slot, at the snap. */
  press: Record<string, number>;
  /** Pressure multiplier on third or fourth and `longToGo` or more. */
  longBlitz: number;
}

/**
 * Identity tuning.
 * - `prior`: the league's call mix on a normal down (about 45% man, 21% pressure, 39% two-high). The
 *   situational Goal Line call has its own prior, used only in short yardage.
 * - `styles`: share of programs with each style, and each style's dials, press and third-and-long pressure.
 * - `dlBlitz`: pressure dial per point of the DL unit (`profile.units`), negative: a front that gets
 *   home with four doesn't need to send more. `cbMan`: man dial per point of the CB unit (good corners
 *   can live on an island); `cbPress`: press odds per point of it.
 * - `long*`, `short*`, `red*`: the situation's dials. Third and long adds two-high and multiplies
 *   pressure by the style's `longBlitz`; short yardage (`shortToGo` or less on third or fourth, or at
 *   the goal line) loads the box and opens the Goal Line call; the red zone plays tighter man.
 * - `floor`: the share of each call's prior that's always kept, so nothing is ever off the table.
 */
export const IDENTITY = {
  prior: {
    '2-man': 0.12, 'c1-robber': 0.14, 'c0-blitz': 0.06, c2: 0.1, tampa2: 0.05, c3: 0.16, 'c3-sky': 0.07, c4: 0.12,
    'c1-fire': 0.06, 'fire-zone': 0.05, cat: 0.04, bear: 0.03, goal: 0.25,
  } as Record<string, number>,
  styles: {
    aggressive: { share: 0.3, dials: { blitz: 0.6, man: 0.3, twoHigh: -0.2, box: 0 }, press: 1.3, longBlitz: 1.6 },
    balanced: { share: 0.4, dials: { blitz: 0, man: 0, twoHigh: 0, box: 0 }, press: 1, longBlitz: 1.2 },
    soft: { share: 0.3, dials: { blitz: -0.7, man: -0.3, twoHigh: 0.4, box: 0 }, press: 0.6, longBlitz: 0.7 },
  } as Record<DefStyle, { share: number; dials: Dials; press: number; longBlitz: number }>,
  basePress: { CB1: 0.35, CB2: 0.35, NB: 0.2 } as Record<string, number>,
  dlBlitz: -0.15,
  cbMan: 0.15,
  cbPress: 0.06,
  longToGo: 7,
  longTwoHigh: 0.3,
  shortToGo: 2,
  shortBox: 0.6,
  goalLine: 3,
  redZone: 20,
  redMan: 0.3,
  redTwoHigh: -0.3,
  floor: 0.15,
};

/** A call's traits the dials weigh: extra rushers, man or zone, two-high or not, and box count against 7. */
export function callTraits(c: DefCall): Dials {
  return { blitz: rushers(c) - 4, man: c.coverage === 'man' ? 1 : 0, twoHigh: c.shell === 'two-high' ? 1 : 0, box: c.box - 7 };
}

export const ZERO_DIALS: Dials = { blitz: 0, man: 0, twoHigh: 0, box: 0 };

export function addDials(a: Dials, b: Partial<Dials>): Dials {
  return { blitz: a.blitz + (b.blitz ?? 0), man: a.man + (b.man ?? 0), twoHigh: a.twoHigh + (b.twoHigh ?? 0), box: a.box + (b.box ?? 0) };
}

/** The style a program's DC is generated with (data/coaches.ts), seeded by the program. */
export function defStyle(teamId: string): DefStyle {
  const r = (hashString(`def-style:${teamId}`) % 10000) / 10000;
  const S = IDENTITY.styles;
  return r < S.aggressive.share ? 'aggressive' : r < S.aggressive.share + S.balanced.share ? 'balanced' : 'soft';
}

/** The mix for a set of dials: each allowed call's prior × exp(dials · traits), with `floor` of the prior kept. */
export function mixFor(dials: Dials, short = false): Record<string, number> {
  const raw: Record<string, number> = {};
  const prior: Record<string, number> = {};
  for (const c of DEF_CALLS) {
    if (c.situational && !short) continue;
    const t = callTraits(c);
    const p = IDENTITY.prior[c.id] ?? 0;
    prior[c.id] = p;
    raw[c.id] = p * Math.exp(dials.blitz * t.blitz + dials.man * t.man + dials.twoHigh * t.twoHigh + dials.box * t.box);
  }
  const w = normalize(raw);
  const pr = normalize(prior);
  const f = IDENTITY.floor;
  return Object.fromEntries(Object.keys(w).map((k) => [k, (1 - f) * w[k] + f * pr[k]]));
}

function normalize(mix: Record<string, number>): Record<string, number> {
  const tot = Object.values(mix).reduce((s, w) => s + Math.max(0, w), 0);
  return Object.fromEntries(Object.entries(mix).map(([k, w]) => [k, Math.max(0, w) / tot]));
}

const cache = new Map<string, DefIdentity>();

export function defIdentity(team: Team): DefIdentity {
  const hit = cache.get(team.id);
  if (hit) return hit;
  // The DC owns the style.
  const style = buildStaff(team).DC.style ?? defStyle(team.id);
  const S = IDENTITY.styles[style];
  const dl = team.profile.units.DL ?? 0;
  const cb = team.profile.units.CB ?? 0;
  const dials = addDials(S.dials, { blitz: IDENTITY.dlBlitz * dl, man: IDENTITY.cbMan * cb });
  const press: Record<string, number> = {};
  for (const [slot, p] of Object.entries(IDENTITY.basePress)) press[slot] = clamp(p * S.press + IDENTITY.cbPress * cb, 0.05, 0.7);
  const id: DefIdentity = { style, dials, mix: mixFor(dials), press, longBlitz: S.longBlitz };
  cache.set(team.id, id);
  return id;
}

/** Third or fourth and long. */
export function longYardage(down: number, toGo: number): boolean {
  return down >= 3 && toGo >= IDENTITY.longToGo;
}

/** Third or fourth and short, or a yard or two from the goal line. */
export function shortYardage(down: number, toGo: number, yardsToGoal = 99): boolean {
  return (down >= 3 && toGo <= IDENTITY.shortToGo) || yardsToGoal <= IDENTITY.goalLine;
}

/** The situation's dials for this snap. */
export function situationDials(id: DefIdentity, down: number, toGo: number, yardsToGoal = 99): Dials {
  let d = id.dials;
  if (longYardage(down, toGo)) d = addDials(d, { blitz: Math.log(id.longBlitz), twoHigh: IDENTITY.longTwoHigh });
  if (shortYardage(down, toGo, yardsToGoal)) d = addDials(d, { box: IDENTITY.shortBox });
  if (yardsToGoal <= IDENTITY.redZone) d = addDials(d, { man: IDENTITY.redMan, twoHigh: IDENTITY.redTwoHigh });
  return d;
}

/**
 * The mix for this snap: the identity's dials, the situation's, and any in-game shift from the DC
 * (`game/defBrain.ts`). `heavy` opens the short-yardage calls on any down (a DC selling out against a
 * run you keep calling). With no situation and no shift it's `id.mix`.
 */
export function situationMix(
  id: DefIdentity, down: number, toGo: number, yardsToGoal = 99, shift?: Partial<Dials>, heavy = false,
): Record<string, number> {
  const d = situationDials(id, down, toGo, yardsToGoal);
  if (d === id.dials && !shift && !heavy) return id.mix;
  return mixFor(shift ? addDials(d, shift) : d, heavy || shortYardage(down, toGo, yardsToGoal));
}

/** Share of snaps in each shell, from a mix. */
export function shellShares(mix: Record<string, number>): Record<'two-high' | 'one-high' | 'zero', number> {
  const out = { 'two-high': 0, 'one-high': 0, zero: 0 };
  for (const c of DEF_CALLS) out[c.shell] += mix[c.id] ?? 0;
  return out;
}

/** Share of snaps with five or more rushers, and in man coverage, from a mix. */
export function pressureShare(mix: Record<string, number>): number {
  return DEF_CALLS.reduce((s, c) => s + (rushers(c) >= 5 ? mix[c.id] ?? 0 : 0), 0);
}
export function manShare(mix: Record<string, number>): number {
  return DEF_CALLS.reduce((s, c) => s + (c.coverage === 'man' ? mix[c.id] ?? 0 : 0), 0);
}

/** A short tag for the defense, for the prep page. */
export function defLabel(id: DefIdentity): string {
  const press = (id.press.CB1 + id.press.CB2) / 2;
  const head = id.style === 'aggressive' ? 'BLITZ-HEAVY' : id.style === 'soft' ? "BEND DON'T BREAK" : 'BALANCED';
  const cover = manShare(id.mix) >= 0.5 ? 'MAN' : 'ZONE';
  return press >= 0.42 ? `${head}, PRESS MAN` : press <= 0.25 ? `${head}, OFF ${cover}` : `${head}, ${cover}`;
}
