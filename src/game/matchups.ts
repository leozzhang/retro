import { PACKAGE_SUBS, packageFor, type Assign, type DefCall, type DefPackage } from '../data/defenses';
import type { PlayDef } from '../data/plays';
import { DEF_SLOTS, SLOT_ROLE, type DefSlot, type OffSlot, type Role, type RosterDefSlot } from '../data/teams';
import { FIELD_W } from '../engine/constants';
import { alignY, personnelOf, SKILL_SLOTS, type CoverClass, type ResolvedPlay } from './resolvePlay';

/** The defense for one snap: its package, who's on the field, and assignments matched to the formation. */
export interface DefensePlan {
  pkg: DefPackage;
  cast: Record<DefSlot, RosterDefSlot>;
  assign: Record<DefSlot, Assign>;
}

/** What a call's man target means in the 11 personnel it's written against. */
const BASE_CLASS: Partial<Record<OffSlot, CoverClass>> = { X: 'wide', Z: 'wide', SL: 'slot', TE: 'inline', RB: 'back' };

/** Who a defender takes when his called man isn't lined up where the call expects: DBs stay on receivers, backers on backs and ends. */
const FALLBACK: Partial<Record<Role, CoverClass[]>> = {
  CB: ['slot', 'wide', 'inline', 'back'],
  S: ['slot', 'inline', 'back', 'wide'],
  LB: ['back', 'inline', 'slot', 'wide'],
};
const ORDER: Partial<Record<Role, number>> = { CB: 0, S: 1, LB: 2 };

/**
 * Sets the defense against the offense on the field. The package follows personnel, then each man
 * defender keeps his called target if that player lines up where the call expects (the X is still
 * wide, the SL still in the slot). Otherwise he takes the nearest uncovered player of the same kind,
 * or his role's next choice. A defender with nobody left to cover plays the hole as a robber.
 */
export function matchDefense(call: DefCall, play: PlayDef, rp: ResolvedPlay): DefensePlan {
  const pkg = packageFor(personnelOf(play.formation));
  const cast = {} as Record<DefSlot, RosterDefSlot>;
  for (const s of DEF_SLOTS) cast[s] = PACKAGE_SUBS[pkg][s] ?? s;

  const assign = { ...call.assign };
  const taken = new Set<OffSlot>();
  const redo: DefSlot[] = [];
  for (const s of DEF_SLOTS) {
    const a = assign[s];
    if (a.kind !== 'man') continue;
    if (rp.cover[a.target] === BASE_CLASS[a.target]) taken.add(a.target);
    else redo.push(s);
  }
  const role = (s: DefSlot) => SLOT_ROLE[cast[s]];
  redo.sort((a, b) => (ORDER[role(a)] ?? 3) - (ORDER[role(b)] ?? 3));
  const yAt = (s: OffSlot) => alignY(rp.align[s], FIELD_W / 2);
  for (const s of redo) {
    const called = (assign[s] as { target: OffSlot }).target;
    const prefs = [BASE_CLASS[called], ...(FALLBACK[role(s)] ?? [])];
    let pick: OffSlot | null = null;
    for (const cls of prefs) {
      const open = SKILL_SLOTS.filter((o) => !taken.has(o) && rp.cover[o] === cls);
      open.sort((a, b) => Math.abs(yAt(a) - yAt(called)) - Math.abs(yAt(b) - yAt(called)));
      if ((pick = open[0] ?? null)) break;
    }
    if (pick) taken.add(pick);
    assign[s] = pick ? { kind: 'man', target: pick } : { kind: 'robber' };
  }
  return { pkg, cast, assign };
}
