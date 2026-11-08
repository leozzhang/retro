import { getItem, loadItem, removeItem, setItem } from '../engine/storage';
import { latestPoll, rankIn } from './polls';
import { phaseLabel } from './season';
import { records, recordText } from './standings';
import { STAT_KEYS } from './stats';
import type { PlayerLine, SeasonState } from './types';

/** Bump when `SeasonState` changes shape; older saves are ignored. */
export const SAVE_VERSION = 1;
/** The single save from before dynasty slots; `migrateLegacySave` moves it into slot 1. */
export const SEASON_KEY = `season-v${SAVE_VERSION}`;

/** Dynasty save slots, numbered from 1. */
export const SLOTS = 3;
/** A slot's season: loaded only when it's picked (`loadSlot`). */
const slotKey = (slot: number) => `season-v${SAVE_VERSION}-${slot}`;
/** A slot's summary for the save-slot cards: small, so every slot's is preloaded at boot. */
const metaKey = (slot: number) => `slot-v${SAVE_VERSION}-${slot}`;

/** The storage keys `initStore` must load at boot. */
export const BOOT_KEYS = [SEASON_KEY, ...Array.from({ length: SLOTS }, (_, i) => metaKey(i + 1))];

/** What a save-slot card shows, written with every save. */
export interface SlotMeta {
  teamId: string;
  year: number;
  phase: string;
  record: string;
  rank: number;
  /** Seasons played in this dynasty, counting the current one. */
  seasons: number;
  savedAt: number;
}

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
  const s = mapLines(JSON.parse(raw) as SeasonState, (l) => {
    const out = { ...l };
    // Rounded: saves from before the live game's CPU drives started on a whole yard have fractions.
    for (const k of STAT_KEYS) out[k] = Math.round(out[k] ?? 0);
    return out;
  });
  for (const g of s.games) {
    for (const tl of g.result ? [g.result.box.home, g.result.box.away] : []) {
      for (const k of Object.keys(tl) as (keyof typeof tl)[]) tl[k] = Math.round(tl[k]);
    }
  }
  return s;
}

function parse(raw: string | null): SeasonState | null {
  if (!raw) return null;
  try {
    const s = unpackSeason(raw);
    return s.version === SAVE_VERSION ? s : null;
  } catch {
    return null;
  }
}

export function metaOf(s: SeasonState): SlotMeta {
  const u = s.config.userTeamId;
  return {
    teamId: u, year: s.year, phase: phaseLabel(s), record: recordText(records(s).get(u)!), rank: rankIn(latestPoll(s, 'ap'), u),
    // The current season is in `history` once it's over, so count it once.
    seasons: s.history.filter((h) => h.year !== s.year).length + 1, savedAt: Date.now(),
  };
}

/** Store the season in its slot. The write happens in the background; a failure is reported by `onStoreError`. */
export function saveSlot(slot: number, state: SeasonState): void {
  setItem(slotKey(slot), packSeason(state));
  setItem(metaKey(slot), JSON.stringify(metaOf(state)));
}

export function slotMeta(slot: number): SlotMeta | null {
  const raw = getItem(metaKey(slot));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SlotMeta;
  } catch {
    return null;
  }
}

export async function loadSlot(slot: number): Promise<SeasonState | null> {
  return parse(await loadItem(slotKey(slot)));
}

export function deleteSlot(slot: number): void {
  removeItem(slotKey(slot));
  removeItem(metaKey(slot));
}

/** The slot saved most recently (the main menu's CONTINUE), or 0 if every slot is empty. */
export function latestSlot(): number {
  let best = 0;
  let at = -Infinity;
  for (let i = 1; i <= SLOTS; i++) {
    const m = slotMeta(i);
    if (m && m.savedAt > at) {
      best = i;
      at = m.savedAt;
    }
  }
  return best;
}

/** The first empty slot, or 0 if they're all used. */
export function freeSlot(): number {
  for (let i = 1; i <= SLOTS; i++) if (!slotMeta(i)) return i;
  return 0;
}

/** A save from before slots moves into the first free slot (slot 1 on a fresh install). Call once at boot, after `initStore`. */
export function migrateLegacySave(): void {
  const s = parse(getItem(SEASON_KEY));
  const slot = freeSlot();
  if (!s || !slot) return;
  saveSlot(slot, s);
  removeItem(SEASON_KEY);
}
