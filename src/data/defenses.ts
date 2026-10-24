import { FIELD_W } from '../engine/constants';
import type { DefExtraSlot, DefSlot, OffSlot } from './teams';

export type Assign =
  | { kind: 'rush' }
  | { kind: 'man'; target: OffSlot }
  | { kind: 'deep'; yMin: number; yMax: number }
  | { kind: 'robber' };

export interface DefCall {
  id: string;
  name: string;
  /** How many safeties are deep pre-snap: the main tell for reading coverage. */
  shell: 'two-high' | 'one-high' | 'zero';
  weight: number;
  /** Man targets are written against 11 personnel; `matchDefense` re-keys them to whoever lines up there. */
  assign: Record<DefSlot, Assign>;
}

const RUSH4 = {
  DE1: { kind: 'rush' }, DT1: { kind: 'rush' }, DT2: { kind: 'rush' }, DE2: { kind: 'rush' },
} as const;

export const DEF_CALLS: DefCall[] = [
  {
    id: '2-man', name: '2 Man Under', shell: 'two-high', weight: 0.4,
    assign: {
      ...RUSH4,
      WLB: { kind: 'man', target: 'RB' },
      MLB: { kind: 'man', target: 'TE' },
      CB1: { kind: 'man', target: 'X' },
      CB2: { kind: 'man', target: 'Z' },
      NB: { kind: 'man', target: 'SL' },
      FS: { kind: 'deep', yMin: 0, yMax: FIELD_W / 2 },
      SS: { kind: 'deep', yMin: FIELD_W / 2, yMax: FIELD_W },
    },
  },
  {
    id: 'c1-robber', name: 'Cover 1 Robber', shell: 'one-high', weight: 0.4,
    assign: {
      ...RUSH4,
      WLB: { kind: 'man', target: 'RB' },
      MLB: { kind: 'man', target: 'TE' },
      CB1: { kind: 'man', target: 'X' },
      CB2: { kind: 'man', target: 'Z' },
      NB: { kind: 'man', target: 'SL' },
      FS: { kind: 'deep', yMin: 0, yMax: FIELD_W },
      SS: { kind: 'robber' },
    },
  },
  {
    id: 'c0-blitz', name: 'Cover 0 Blitz', shell: 'zero', weight: 0.2,
    assign: {
      ...RUSH4,
      WLB: { kind: 'rush' },
      MLB: { kind: 'rush' },
      CB1: { kind: 'man', target: 'X' },
      CB2: { kind: 'man', target: 'Z' },
      NB: { kind: 'man', target: 'SL' },
      FS: { kind: 'man', target: 'RB' },
      SS: { kind: 'man', target: 'TE' },
    },
  },
];

export function pickDefCall(rng: () => number): DefCall {
  const total = DEF_CALLS.reduce((s, c) => s + c.weight, 0);
  let r = rng() * total;
  for (const c of DEF_CALLS) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return DEF_CALLS[0];
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
