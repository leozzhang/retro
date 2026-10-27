import { getItem, removeItem, setItem } from '../engine/storage';
import { STAT_KEYS } from './stats';
import type { PlayerLine, SeasonState } from './types';

/** Bump when `SeasonState` changes shape; older saves are ignored. */
export const SAVE_VERSION = 1;
/** The storage key (engine/storage.ts); `initStore` must load it at boot. */
export const SEASON_KEY = `season-v${SAVE_VERSION}`;

/** Box-score lines are mostly zeros; saves leave them out (a full season is about 2.8 MB with them). */
function mapLines(state: SeasonState, f: (l: PlayerLine) => PlayerLine): SeasonState {
  return {
    ...state,
    games: state.games.map((g) => (g.result ? { ...g, result: { ...g.result, box: { ...g.result.box, players: g.result.box.players.map(f) } } } : g)),
  };
}

export function packSeason(state: SeasonState): string {
  return JSON.stringify(mapLines(state, (l) => {
    const out: Partial<PlayerLine> = { ...l };
    for (const k of STAT_KEYS) if (!out[k]) delete out[k];
    return out as PlayerLine;
  }));
}

export function unpackSeason(raw: string): SeasonState {
  return mapLines(JSON.parse(raw) as SeasonState, (l) => {
    const out = { ...l };
    for (const k of STAT_KEYS) out[k] ??= 0;
    return out;
  });
}

/** Store the season. The write happens in the background; a failure is reported by `onStoreError`. */
export function saveSeason(state: SeasonState): void {
  setItem(SEASON_KEY, packSeason(state));
}

export function loadSeason(): SeasonState | null {
  const raw = getItem(SEASON_KEY);
  if (!raw) return null;
  try {
    const s = unpackSeason(raw);
    return s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}

export function hasSavedSeason(): boolean {
  return getItem(SEASON_KEY) !== null;
}

export function clearSeason(): void {
  removeItem(SEASON_KEY);
}
