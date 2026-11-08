import type { PlayerLine, SeasonState } from './types';

/** Season totals are summed from the box scores on demand, never stored. */

export type StatKey = Exclude<keyof PlayerLine, 'id' | 'team' | 'name' | 'pos'>;

export const STAT_KEYS: StatKey[] = ['cmp', 'att', 'passYds', 'passTd', 'int', 'rush', 'rushYds', 'rushTd', 'rec', 'recYds', 'recTd', 'fgm', 'fga', 'sk', 'defInt'];

export interface SeasonLine extends PlayerLine {
  games: number;
}

export function seasonStats(state: SeasonState): Map<string, SeasonLine> {
  const out = new Map<string, SeasonLine>();
  for (const g of state.games) {
    for (const l of g.result?.box.players ?? []) {
      let s = out.get(l.id);
      if (!s) {
        s = { ...l, games: 0 };
        for (const k of STAT_KEYS) s[k] = 0;
        out.set(l.id, s);
      }
      s.games++;
      for (const k of STAT_KEYS) s[k] += l[k];
    }
  }
  return out;
}

/** Categories for the leaders page. */
export const LEADER_CATEGORIES: { key: StatKey; label: string }[] = [
  { key: 'passYds', label: 'PASSING YARDS' },
  { key: 'passTd', label: 'PASSING TD' },
  { key: 'rushYds', label: 'RUSHING YARDS' },
  { key: 'rushTd', label: 'RUSHING TD' },
  { key: 'recYds', label: 'RECEIVING YARDS' },
  { key: 'recTd', label: 'RECEIVING TD' },
];

export function leaders(state: SeasonState, key: StatKey, n = 5, stats = seasonStats(state)): SeasonLine[] {
  return [...stats.values()].filter((s) => s[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, n);
}
