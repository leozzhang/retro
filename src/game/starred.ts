import { PLAYBOOK } from '../data/plays';

/**
 * The user's starred plays (play ids). A coaching preference, not season state: it's stored on its
 * own in this browser and applies to every game, season or exhibition.
 */
const KEY = 'saturday-gridiron-starred';

/** Starred ids from a stored string; unknown ids (plays since removed) and junk are dropped. */
export function parseStarred(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const ids: unknown = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set();
    const known = new Set(PLAYBOOK.map((p) => p.id));
    return new Set(ids.filter((id): id is string => typeof id === 'string' && known.has(id)));
  } catch {
    return new Set();
  }
}

export function loadStarred(): Set<string> {
  try {
    return parseStarred(localStorage.getItem(KEY));
  } catch {
    return new Set();
  }
}

/** Star or unstar a play and save. Fails quietly: the game works without storage. */
export function toggleStar(starred: Set<string>, id: string): void {
  if (starred.has(id)) starred.delete(id);
  else starred.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...starred]));
  } catch {
    // not saved
  }
}
