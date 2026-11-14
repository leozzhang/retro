import { FIELD_W } from '../engine/constants';
import type { DefExtraSlot, DefSlot, OffSlot } from './teams';

/**
 * Underneath zone landmarks, from the ball out: `mid` (the middle hole), `hook` (inside the hashes),
 * `curl` (between the hash and the numbers) and `flat` (outside the numbers). Deep zones are `deep`
 * with the band of the field they own (halves, thirds, quarters).
 */
export type Landmark = 'mid' | 'hook' | 'curl' | 'flat';
export type ZoneSide = -1 | 1 | 'strong' | 'weak';

export type Assign =
  /** `contain`: an edge rusher keeps outside leverage on the QB instead of rushing upfield (a tag). */
  | { kind: 'rush'; contain?: boolean }
  | { kind: 'man'; target: OffSlot }
  | { kind: 'deep'; yMin: number; yMax: number }
  | { kind: 'robber' }
  /**
   * `side`: -1 toward y = 0 (DE1 / CB1's side), +1 toward the far sideline, or toward the formation's
   * strength or away from it (`mid` ignores it). `fit`: play the run first (he's in the box), then drop.
   */
  | { kind: 'zone'; spot: Landmark; side: ZoneSide; fit?: boolean }
  /** Mirror the QB from the second level and take him the moment he runs (a tag). */
  | { kind: 'spy' };

/**
 * How the front lines up: `even` (the base 4-man front), `bear` (tight: tackles in the A gaps, ends
 * over the tackles, backers walked up), `goal` (short yardage: everyone low and close) and `wide`
 * (wide-nine ends for the pass rush).
 */
export type Front = 'even' | 'bear' | 'goal' | 'wide';

/** How many safeties are deep before the snap. */
export type Shell = 'two-high' | 'one-high' | 'zero';

/**
 * A disguise: the look a call shows before the snap, spun out of at the snap. The safeties line up in
 * the `show` shell, and the post-snap AI takes each defender from there to his real job, so a disguise
 * costs the defense a step: the spot a rotating safety left is open for a beat. `corners: 'press'`
 * walks zone corners up into a press-man look (press bail); `'off'` plays man corners off with the
 * zone corners' outside leverage. Execution and the tells are in `Play` (`DISGUISE`, game/playState.ts).
 */
export interface Disguise {
  show: Shell;
  corners?: 'press' | 'off';
  /** Its share of the call's disguised snaps. */
  weight: number;
}

export interface DefCall {
  id: string;
  name: string;
  /** How many safeties are deep pre-snap, played straight: the main tell for reading coverage. */
  shell: Shell;
  /** Default draw weight, used only when no mix is given (the first three calls, as before). */
  weight: number;
  front: Front;
  /** The coverage behind the rush. */
  coverage: 'man' | 'zone';
  /** Defenders committed to the run at the snap: 6 is a light box, 8 a loaded one. */
  box: number;
  /** Only called in short yardage and at the goal line. */
  situational?: boolean;
  /** Forces a personnel package regardless of the offense's (goal line puts the base backer on). */
  pkg?: DefPackage;
  /** The defender a SPY tag turns into the spy (the call's least needed man), if it can spare one. */
  spyFrom?: DefSlot;
  /** Man targets are written against 11 personnel; `matchDefense` re-keys them to whoever lines up there. */
  assign: Record<DefSlot, Assign>;
  /** The looks it can disguise itself as (none: always played straight). How often is the DC's (`DefIdentity.disguise`). */
  disguises?: Disguise[];
  /** Man calls against presnap motion: the man defender travels with him (`trail`, the default) or the defense bumps over (`bump`). */
  motion?: 'trail' | 'bump';
  /** The edge against the kick-out on a run (sim/runFits.ts): box or spill; missing is the league's mix (`RUN_FIT.spill`). */
  runFit?: 'box' | 'spill';
  /** The front two-gaps: head-up linemen control the man over them (sim/runFits.ts). Missing: one-gap. */
  twoGap?: boolean;
}

const RUSH4 = {
  DE1: { kind: 'rush' }, DT1: { kind: 'rush' }, DT2: { kind: 'rush' }, DE2: { kind: 'rush' },
} as const;

const W = FIELD_W;
const half = (lo: 0 | 1) => ({ kind: 'deep', yMin: lo ? W / 2 : 0, yMax: lo ? W : W / 2 }) as const;
const third = (i: 0 | 1 | 2) => ({ kind: 'deep', yMin: (W / 3) * i, yMax: (W / 3) * (i + 1) }) as const;
const quarter = (i: 0 | 1 | 2 | 3) => ({ kind: 'deep', yMin: (W / 4) * i, yMax: (W / 4) * (i + 1) }) as const;
const zone = (spot: Landmark, side: ZoneSide, fit = false): Assign => ({ kind: 'zone', spot, side, ...(fit ? { fit } : {}) });
const man = (target: OffSlot): Assign => ({ kind: 'man', target });
const MAN5 = { CB1: man('X'), CB2: man('Z'), NB: man('SL') } as const;

/**
 * The CPU defense's playbook. The first three are the original calls, unchanged (the balance report's
 * core rows); the rest are zones, pressures and run fronts. How often each is called is the DC's
 * business: `data/identity.ts` and, in a live game, `game/defBrain.ts`.
 */
export const DEF_CALLS: DefCall[] = [
  {
    id: '2-man', name: '2 Man Under', shell: 'two-high', weight: 0.4, front: 'even', coverage: 'man', box: 6, spyFrom: 'MLB',
    assign: { ...RUSH4, WLB: man('RB'), MLB: man('TE'), ...MAN5, FS: half(0), SS: half(1) },
    disguises: [{ show: 'one-high', weight: 1 }, { show: 'two-high', corners: 'off', weight: 1 }],
  },
  {
    id: 'c1-robber', name: 'Cover 1 Robber', shell: 'one-high', weight: 0.4, front: 'even', coverage: 'man', box: 7, spyFrom: 'SS',
    assign: { ...RUSH4, WLB: man('RB'), MLB: man('TE'), ...MAN5, FS: { kind: 'deep', yMin: 0, yMax: W }, SS: { kind: 'robber' } },
    disguises: [{ show: 'one-high', corners: 'off', weight: 1 }],
    motion: 'bump',
  },
  {
    id: 'c0-blitz', name: 'Cover 0 Blitz', shell: 'zero', weight: 0.2, front: 'even', coverage: 'man', box: 8,
    assign: { ...RUSH4, WLB: { kind: 'rush' }, MLB: { kind: 'rush' }, ...MAN5, FS: man('RB'), SS: man('TE') },
  },
  {
    id: 'c2', name: 'Cover 2', shell: 'two-high', weight: 0, front: 'even', coverage: 'zone', box: 6, spyFrom: 'NB',
    assign: { ...RUSH4, WLB: zone('curl', -1), MLB: zone('curl', 1), CB1: zone('flat', -1), CB2: zone('flat', 1), NB: zone('mid', 'strong'), FS: half(0), SS: half(1) },
    disguises: [{ show: 'one-high', weight: 2 }, { show: 'two-high', corners: 'press', weight: 1 }],
  },
  {
    id: 'tampa2', name: 'Tampa 2', shell: 'two-high', weight: 0, front: 'even', coverage: 'zone', box: 6, spyFrom: 'WLB',
    assign: {
      ...RUSH4, WLB: zone('curl', -1), NB: zone('curl', 1), MLB: { kind: 'deep', yMin: W / 2 - 7, yMax: W / 2 + 7 },
      CB1: zone('flat', -1), CB2: zone('flat', 1), FS: half(0), SS: half(1),
    },
    disguises: [{ show: 'one-high', weight: 1 }],
  },
  {
    id: 'c3', name: 'Cover 3', shell: 'one-high', weight: 0, front: 'even', coverage: 'zone', box: 7, spyFrom: 'MLB',
    assign: { ...RUSH4, WLB: zone('hook', -1), MLB: zone('hook', 1), NB: zone('curl', 'strong'), SS: zone('curl', 'weak'), CB1: third(0), FS: third(1), CB2: third(2) },
    disguises: [{ show: 'two-high', weight: 2 }, { show: 'one-high', corners: 'press', weight: 1 }],
  },
  {
    id: 'c3-sky', name: 'Cover 3 Sky', shell: 'one-high', weight: 0, front: 'even', coverage: 'zone', box: 8, spyFrom: 'MLB',
    assign: { ...RUSH4, WLB: zone('hook', -1), MLB: zone('hook', 1), NB: zone('curl', 'weak'), SS: zone('curl', 'strong', true), CB1: third(0), FS: third(1), CB2: third(2) },
  },
  {
    id: 'c4', name: 'Cover 4', shell: 'two-high', weight: 0, front: 'even', coverage: 'zone', box: 7, spyFrom: 'NB',
    assign: { ...RUSH4, WLB: zone('curl', 'weak'), MLB: zone('mid', 'strong'), NB: zone('curl', 'strong'), CB1: quarter(0), FS: quarter(1), SS: quarter(2), CB2: quarter(3) },
    disguises: [{ show: 'one-high', weight: 1 }],
  },
  {
    id: 'c1-fire', name: 'Cover 1 Fire', shell: 'one-high', weight: 0, front: 'even', coverage: 'man', box: 7,
    assign: { ...RUSH4, WLB: man('RB'), MLB: { kind: 'rush' }, ...MAN5, FS: { kind: 'deep', yMin: 0, yMax: W }, SS: man('TE') },
    disguises: [{ show: 'two-high', weight: 1 }],
  },
  {
    id: 'fire-zone', name: 'Fire Zone', shell: 'one-high', weight: 0, front: 'even', coverage: 'zone', box: 7,
    assign: {
      DE1: zone('flat', -1), DT1: { kind: 'rush' }, DT2: { kind: 'rush' }, DE2: { kind: 'rush' }, WLB: { kind: 'rush' }, MLB: { kind: 'rush' },
      NB: zone('hook', 'strong'), SS: zone('curl', 1), CB1: third(0), FS: third(1), CB2: third(2),
    },
    disguises: [{ show: 'two-high', weight: 1 }, { show: 'zero', corners: 'press', weight: 1 }],
  },
  {
    id: 'cat', name: 'Nickel Cat', shell: 'one-high', weight: 0, front: 'even', coverage: 'man', box: 7,
    assign: { ...RUSH4, WLB: man('RB'), MLB: man('TE'), CB1: man('X'), CB2: man('Z'), NB: { kind: 'rush' }, SS: man('SL'), FS: { kind: 'deep', yMin: 0, yMax: W } },
    motion: 'bump',
  },
  {
    id: 'bear', name: 'Bear Cover 1', shell: 'one-high', weight: 0, front: 'bear', coverage: 'man', box: 8,
    assign: { ...RUSH4, WLB: man('RB'), MLB: man('TE'), ...MAN5, FS: { kind: 'deep', yMin: 0, yMax: W }, SS: zone('hook', 'strong', true) },
  },
  {
    id: 'goal', name: 'Goal Line', shell: 'zero', weight: 0, front: 'goal', coverage: 'man', box: 9, situational: true, pkg: 'base',
    assign: {
      ...RUSH4, NB: { kind: 'rush', contain: true }, WLB: man('RB'), MLB: zone('hook', 'strong', true),
      CB1: man('X'), CB2: man('Z'), SS: man('SL'), FS: man('TE'),
    },
  },
];

/** The original three calls: the balance and ratings reports' core rows are measured against these. */
export const CORE_CALLS = DEF_CALLS.slice(0, 3);

export function defCallById(id: string): DefCall {
  const c = DEF_CALLS.find((x) => x.id === id);
  if (!c) throw new Error(`no defensive call ${id}`);
  return c;
}

/** Rushers the call sends at the snap (before tags). */
export function rushers(c: DefCall): number {
  return Object.values(c.assign).filter((a) => a.kind === 'rush').length;
}

/** One call, by the default weights or a defense's own mix (by call id; see `data/identity.ts`). One random draw either way. */
export function pickDefCall(rng: () => number, mix?: Record<string, number>): DefCall {
  const w = (c: DefCall) => (mix ? mix[c.id] ?? 0 : c.weight);
  const total = DEF_CALLS.reduce((s, c) => s + w(c), 0);
  let r = rng() * total;
  for (const c of DEF_CALLS) {
    if (w(c) <= 0) continue;
    r -= w(c);
    if (r <= 0) return c;
  }
  return DEF_CALLS[0];
}

/** One of the call's disguises by weight, with one random draw. */
export function pickDisguise(rng: () => number, call: DefCall): Disguise | null {
  const ds = call.disguises;
  if (!ds?.length) return null;
  let r = rng() * ds.reduce((n, d) => n + d.weight, 0);
  for (const d of ds) if ((r -= d.weight) <= 0) return d;
  return ds[ds.length - 1];
}

export const SHELL_NAME: Record<Shell, string> = { 'two-high': 'TWO HIGH', 'one-high': 'SINGLE HIGH', zero: 'NO DEEP SAFETY' };

/** What a disguise shows, in words: "TWO HIGH", "SINGLE HIGH, PRESSED". */
export function disguiseName(d: Disguise): string {
  return `${SHELL_NAME[d.show]}${d.corners === 'press' ? ', PRESS' : d.corners === 'off' ? ', OFF CORNERS' : ''}`;
}

/** Tags the DC can put on any call that has the defender for it. */
export interface DefTags {
  spy?: boolean;
  contain?: boolean;
  /** Prevent: late, with a lead to protect, play soft and deep (`PREVENT`, sim/ai.ts). */
  prevent?: boolean;
  /** A game up front (a stunt) on one side of the ball (`GAME`, sim/passPro.ts). */
  game?: { kind: GameKind; side: 1 | -1 };
  /** RPO pass-first: on an RPO, the hook and curl defenders to the tagged route's side ignore the run key (`Play.snap`). */
  rpo?: boolean;
  /**
   * A receiver the DC keys (`KEY`, sim/ai.ts): his man plays him tighter, the zones rally to him, the robber
   * takes him, and everyone breaks faster on a ball to him; the rest of the coverage is a beat slower.
   */
  key?: OffSlot;
}

/**
 * Line games (stunts): TE, the tackle crashes out and the end loops inside behind him; ET, the end
 * crashes in and the tackle loops out; TT, the two tackles exchange.
 */
export type GameKind = 'TE' | 'ET' | 'TT';

/** The call's assignments with its tags laid on: the spy comes from `spyFrom`, contain goes to the ends. */
export function taggedAssign(call: DefCall, assign: Record<DefSlot, Assign>, tags: DefTags | undefined): Record<DefSlot, Assign> {
  if (!tags?.spy && !tags?.contain) return assign;
  const out = { ...assign };
  if (tags.spy && call.spyFrom) out[call.spyFrom] = { kind: 'spy' };
  if (tags.contain) for (const s of ['DE1', 'DE2'] as const) if (out[s].kind === 'rush') out[s] = { kind: 'rush', contain: true };
  return out;
}

/** Defensive personnel, chosen from the offense's personnel at the snap. */
export type DefPackage = 'base' | 'nickel' | 'dime';

/** Depth players each package subs in: base trades the nickel for a SAM backer, dime trades the MIKE for a sixth DB. */
export const PACKAGE_SUBS: Record<DefPackage, Partial<Record<DefSlot, DefExtraSlot>>> = {
  base: { NB: 'SAM' },
  nickel: {},
  dime: { MLB: 'DIME' },
};

/** Three or more backs and tight ends (21, 12, 22) get base; one or fewer (10) gets dime; 11 and 20 get nickel. */
export function packageFor(personnel: string): DefPackage {
  const big = Number(personnel[0]) + Number(personnel[1]);
  return big >= 3 ? 'base' : big <= 1 ? 'dime' : 'nickel';
}
