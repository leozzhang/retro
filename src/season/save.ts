import { STAT_KEYS } from './stats';
import type { PlayerLine, SeasonState } from './types';

/** Bump when `SeasonState` changes shape; older saves are ignored. */
export const SAVE_VERSION = 1;
const KEY = `saturday-gridiron-season-v${SAVE_VERSION}`;

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

/** Store the season in this browser. Fails quietly: the game works without storage. */
export function saveSeason(state: SeasonState): boolean {
  try {
    localStorage.setItem(KEY, packSeason(state));
    return true;
  } catch {
    return false;
  }
}

export function loadSeason(): SeasonState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = unpackSeason(raw);
    return s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}

export function hasSavedSeason(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSeason(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing stored
  }
}
