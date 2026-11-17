import { archetypeLabel, type Athlete } from '../data/athletes';
import { fitRatings, healthOf, healthy, PICK_ORDER, SLOT_CANDIDATES, type Lineup, type Squad } from '../data/depth';
import { overall, SLOT_POS, type Position } from '../data/positions';

/** The user's lineup in a hand-played game, laid over the depth chart for this game only (docs/SUBS.md). */
export { lineupOf, withLineup, type Lineup } from '../data/depth';

export type SubSide = 'off' | 'def' | 'st';

/** Every slot by side, in the order the subs panel lists them. */
export const SIDE_SLOTS: Record<SubSide, readonly string[]> = {
  off: ['QB', 'RB', 'FB', 'X', 'Z', 'SL', 'WR4', 'TE', 'TE2', 'LT', 'LG', 'C', 'RG', 'RT'],
  def: ['DE1', 'DT1', 'DT2', 'DE2', 'WLB', 'MLB', 'SAM', 'CB1', 'CB2', 'NB', 'DIME', 'FS', 'SS'],
  st: ['K', 'P'],
};

export function sideOf(slot: string): SubSide {
  return SIDE_SLOTS.off.includes(slot) ? 'off' : SIDE_SLOTS.def.includes(slot) ? 'def' : 'st';
}

/**
 * Who the coach may put at a slot in a game: the depth chart's candidates (`SLOT_CANDIDATES`) plus a
 * few out-of-position moves a staff would make on game day (a receiver in the backfield, a back split
 * out wide, a tackle as an extra tight end). He plays with his own ratings, so the move costs what it should.
 */
export const SUB_CANDIDATES: Record<string, Position[]> = {
  ...SLOT_CANDIDATES,
  RB: ['HB', 'FB', 'WR'],
  FB: ['FB', 'HB', 'TE'],
  X: ['WR', 'HB', 'TE'], Z: ['WR', 'HB', 'TE'], SL: ['WR', 'HB', 'TE'], WR4: ['WR', 'TE', 'HB'],
  TE: ['TE', 'FB', 'OT'],
};

/** Can he play this slot today: a position the slot takes, healthy, and not ruled out of the game. */
export function canPlay(a: Athlete, slot: string, out: ReadonlySet<string>): boolean {
  return (SUB_CANDIDATES[slot] ?? []).includes(a.pos) && healthy(a) && !out.has(a.id);
}

export interface SubRow {
  a: Athlete;
  /** His overall at this slot, playing hurt if he's banged up. */
  ovr: number;
  /** At one of the slot's depth-chart positions; otherwise he's out of position. */
  natural: boolean;
  /** The slot he's playing now, if any. */
  onAt?: string;
  health: number;
  style: string;
}

/** Everyone who can go in at `slot`, best at the slot first. */
export function subCandidates(squad: Squad, lineup: Lineup, slot: string, out: ReadonlySet<string>): SubRow[] {
  const at = new Map(Object.entries(lineup).map(([s, id]) => [id, s]));
  const side = sideOf(slot);
  const pos = SLOT_POS[slot];
  return squad.athletes
    .filter((a) => canPlay(a, slot, out))
    .filter((a) => !at.has(a.id) || sideOf(at.get(a.id)!) === side) // a two-way swap isn't on the menu
    .map((a): SubRow => {
      const natural = SLOT_CANDIDATES[slot]?.includes(a.pos) ?? false;
      const row: SubRow = { a, ovr: overall(fitRatings(a), pos), natural, health: healthOf(a), style: archetypeLabel(a) };
      const onAt = at.get(a.id);
      if (onAt) row.onAt = onAt;
      return row;
    })
    .sort((x, y) => (x.onAt === slot ? -1 : y.onAt === slot ? 1 : y.ovr - x.ovr));
}

/**
 * The first healthy player on the slot's depth list who isn't in the lineup, then the best player left
 * who can play it. The next man up when a starter goes down.
 */
export function nextManUp(squad: Squad, lineup: Lineup, slot: string, out: ReadonlySet<string>): Athlete | undefined {
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const used = new Set(Object.entries(lineup).filter(([s]) => s !== slot).map(([, id]) => id));
  const gone = lineup[slot];
  const free = (a: Athlete | undefined): a is Athlete => !!a && a.id !== gone && !used.has(a.id) && canPlay(a, slot, out);
  for (const id of squad.depth[slot] ?? []) {
    const a = byId.get(id);
    if (free(a)) return a;
  }
  const pos = SLOT_POS[slot];
  const left = squad.athletes.filter(free);
  return left.length ? left.reduce((b, a) => (overall(fitRatings(a), pos) > overall(fitRatings(b), pos) ? a : b)) : undefined;
}

/**
 * Put `id` in at `slot`. If he's already playing another slot on the same side, the two trade places
 * when the other man can play his old one (X and SL swap); otherwise his old slot takes the next man up.
 */
export function substitute(squad: Squad, lineup: Lineup, slot: string, id: string, out: ReadonlySet<string> = new Set()): Lineup {
  const next: Lineup = { ...lineup };
  const from = Object.entries(lineup).find(([, x]) => x === id)?.[0];
  if (from === slot) return next;
  const displaced = lineup[slot];
  next[slot] = id;
  if (!from) return next;
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const d = displaced ? byId.get(displaced) : undefined;
  if (d && canPlay(d, from, out)) next[from] = d.id;
  else {
    delete next[from];
    const up = nextManUp(squad, next, from, out);
    if (up) next[from] = up.id;
  }
  return next;
}

/** Slots whose player differs between two lineups. */
export function changedSlots(a: Lineup, b: Lineup): string[] {
  return PICK_ORDER.filter((s) => a[s] !== b[s]);
}
