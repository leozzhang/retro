import { CONCEPTS, type Concept, type RecNum } from '../data/concepts';
import type { Align, Formation, PlayDef, RouteName } from '../data/plays';
import { OFF_SLOTS, type OffSlot, type RosterOffSlot } from '../data/teams';
import { FIELD_W } from '../engine/constants';

/** Players lined up this deep (or deeper) are backs; everyone else at a skill slot is a receiver. */
export const BACKFIELD_DX = -2.5;
/** Ball within this far of the middle has no field side, so auto flips don't fire. */
const MID_HASH = 0.5;

const OL_SLOTS: readonly OffSlot[] = ['LT', 'LG', 'C', 'RG', 'RT'];
const SKILL_SLOTS = OFF_SLOTS.filter((s) => s !== 'QB' && !OL_SLOTS.includes(s));

/** A play laid out for one snap: mirrored as needed, with every skill slot's job spelled out. */
export interface ResolvedPlay {
  align: Record<OffSlot, Align>;
  /** Which roster player fills each on-field slot. */
  cast: Record<OffSlot, RosterOffSlot>;
  /** Every skill slot gets a route ('block' if nothing else); the QB and OL have none. */
  routes: Partial<Record<OffSlot, RouteName>>;
  /** +1 = the strong side is +y. */
  strongSign: 1 | -1;
  dropY: number;
  mirrored: boolean;
}

export function castOf(f: Formation): Record<OffSlot, RosterOffSlot> {
  const cast = {} as Record<OffSlot, RosterOffSlot>;
  for (const s of OFF_SLOTS) cast[s] = f.sub?.[s] ?? s;
  return cast;
}

/** Personnel grouping: backs then tight ends ('11', '12', '21', '10'). */
export function personnelOf(f: Formation): string {
  const cast = Object.values(castOf(f));
  const backs = cast.filter((s) => s === 'RB' || s === 'FB').length;
  const tes = cast.filter((s) => s === 'TE' || s === 'TE2').length;
  return `${backs}${tes}`;
}

const mirrorAlign = (a: Align): Align => ({ ...a, y: -a.y });

/** World y of an alignment with the ball at `ballY`. Splits scale with the width of their side of the field. */
export function alignY(a: Align, ballY: number): number {
  if (a.mode === 'rel') return ballY + a.y;
  const side = a.y < 0 ? ballY : FIELD_W - ballY;
  return ballY + a.y * (side / (FIELD_W / 2));
}

/** Whether the play's flip rule mirrors it with the ball at `ballY`. */
function autoMirror(play: PlayDef, ballY: number): boolean {
  if (play.flip === 'fixed' || Math.abs(ballY - FIELD_W / 2) < MID_HASH) return false;
  const fieldSign = ballY < FIELD_W / 2 ? 1 : -1; // the wide side
  const strong = play.formation.strong === 'right' ? 1 : -1;
  return play.flip === 'field' ? strong !== fieldSign : strong === fieldSign;
}

/**
 * Lays a play out for the snap. Receivers are numbered from the sideline in on
 * each side, and the strong/weak concepts hand out their routes by number.
 * Throws if a concept reaches nobody or a backfield assignment isn't a back.
 */
export function resolvePlay(play: PlayDef, ballY: number, userFlip: boolean): ResolvedPlay {
  const f = play.formation;
  const mirrored = autoMirror(play, ballY) !== userFlip;
  const base = f.strong === 'right' ? 1 : -1;
  const strongSign = (mirrored ? -base : base) as 1 | -1;

  const align = {} as Record<OffSlot, Align>;
  for (const s of OFF_SLOTS) align[s] = mirrored ? mirrorAlign(f.align[s]) : f.align[s];

  // Number receivers at a nominal mid-field ball: splits scale evenly on each side, so the order holds on any hash.
  const mid = FIELD_W / 2;
  const yAt = (s: OffSlot) => alignY(align[s], mid);
  const backs = SKILL_SLOTS.filter((s) => align[s].dx <= BACKFIELD_DX);
  const sides = { strong: [] as OffSlot[], weak: [] as OffSlot[] };
  for (const s of SKILL_SLOTS) {
    if (backs.includes(s)) continue;
    const side = Math.sign(yAt(s) - mid) || strongSign;
    sides[side === strongSign ? 'strong' : 'weak'].push(s);
  }

  const routes: Partial<Record<OffSlot, RouteName>> = {};
  for (const side of ['strong', 'weak'] as const) {
    const id = play[side];
    if (!id) continue;
    const recs = [...sides[side]].sort((a, b) => Math.abs(yAt(b) - mid) - Math.abs(yAt(a) - mid));
    // A concept covers as many receivers as the side has (3x1 verts gets a third seam, 2x2 doesn't).
    let reached = 0;
    for (const [n, rn] of Object.entries((CONCEPTS[id] as Concept).routes)) {
      const slot = recs[Number(n as unknown as RecNum) - 1];
      if (!slot) continue;
      routes[slot] = rn;
      reached++;
    }
    if (!reached) throw new Error(`${play.id}: ${id} reaches no receiver on the ${side} side of ${f.name}`);
  }
  for (const [slot, rn] of Object.entries(play.backs ?? {}) as [OffSlot, RouteName][]) {
    if (!backs.includes(slot)) throw new Error(`${play.id}: ${slot} isn't in the backfield in ${f.name}`);
    routes[slot] = rn;
  }
  for (const s of SKILL_SLOTS) routes[s] ??= 'block';

  const dropY = play.dropY ?? 0;
  return { align, cast: castOf(f), routes, strongSign, dropY: mirrored ? -dropY : dropY, mirrored };
}
