/**
 * The coach's office (docs/OFFICE.md): the room tiers it grows through and where things go in each.
 * Plain data. Coordinates are logical pixels inside the room, (0, 0) at its top-left; the wall runs
 * from 0 to `wallH` and the floor below it to `h`. Items stand with their bottom on their anchor's
 * bottom edge. The achievements that fill it are in season/achievements.ts, the art in render/.
 */

/** Where an item goes: on the wall (large frames, small plaques, framed jerseys), on a shelf, in the trophy case, on the desk, or on the floor. */
export type SlotKind = 'wall-lg' | 'wall-sm' | 'jersey' | 'shelf' | 'case' | 'desk' | 'floor';

export interface Anchor {
  kind: SlotKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each kind's item size. */
export const SLOT_SIZE: Record<SlotKind, { w: number; h: number }> = {
  'wall-lg': { w: 50, h: 42 },
  'wall-sm': { w: 26, h: 22 },
  jersey: { w: 36, h: 42 },
  shelf: { w: 20, h: 26 },
  case: { w: 22, h: 28 },
  desk: { w: 22, h: 16 },
  floor: { w: 30, h: 40 },
};

/**
 * Where an item goes when its own kind is full or the room has none: a trophy waits on a shelf
 * before there's a case, a jersey hangs as a large frame before there's a jersey wall. Past the end,
 * storage boxes.
 */
export const SLOT_FALLBACK: Record<SlotKind, SlotKind[]> = {
  'wall-lg': ['wall-lg'],
  'wall-sm': ['wall-sm', 'wall-lg'],
  jersey: ['jersey', 'wall-lg'],
  shelf: ['shelf', 'case', 'desk'],
  case: ['case', 'shelf'],
  desk: ['desk', 'shelf'],
  floor: ['floor'],
};

export type WindowView = 'lot' | 'practice' | 'stadium';

export interface RoomTier {
  name: string;
  /** What gets the user here, for the LIST page. */
  how: string;
  w: number;
  h: number;
  wallH: number;
  wall: string;
  /** Cinderblock courses on the closet wall, wood panels or none above it. */
  wallKind: 'block' | 'paint' | 'panel';
  floor: string;
  floorKind: 'tile' | 'wood' | 'carpet';
  /** A wainscot band in the school's colors. */
  accent?: boolean;
  window?: { x: number; y: number; w: number; h: number; view: WindowView };
  desk: { x: number; w: number; kind: 'folding' | 'wood' | 'executive' };
  /** Shelf planks; each holds a row of shelf items standing on it. */
  shelves: { x: number; y: number; w: number }[];
  /** The glass trophy case, standing on the floor, with this many rows. */
  trophyCase?: { x: number; w: number; rows: number };
  /** Explicit wall and floor spots. Shelf, case and desk spots come from the furniture (`anchorsOf`). */
  spots: Anchor[];
}

const at = (kind: SlotKind, x: number, y: number): Anchor => ({ kind, x, y, ...SLOT_SIZE[kind] });
const row = (kind: SlotKind, x: number, y: number, n: number, gap = 6): Anchor[] =>
  Array.from({ length: n }, (_, i) => at(kind, x + i * (SLOT_SIZE[kind].w + gap), y));

/**
 * The rooms, smallest first. Each is centered on the page with its bottom on the page's floor, so
 * an early office sits small in the dark and the later ones fill the screen.
 */
export const ROOMS: RoomTier[] = [
  {
    name: 'THE BROOM CLOSET',
    how: 'Where everyone starts.',
    w: 280, h: 220, wallH: 176, wall: '#5a5f66', wallKind: 'block', floor: '#3b3a36', floorKind: 'tile',
    desk: { x: 96, w: 88, kind: 'folding' },
    shelves: [{ x: 18, y: 84, w: 56 }],
    spots: [at('wall-lg', 206, 46), at('wall-sm', 96, 64), at('wall-sm', 158, 64), at('floor', 8, 176)],
  },
  {
    name: "POSITION COACH'S OFFICE",
    how: 'A winning season or a bowl win.',
    w: 360, h: 250, wallH: 206, wall: '#7b6a55', wallKind: 'paint', floor: '#4a3524', floorKind: 'wood',
    window: { x: 244, y: 30, w: 92, h: 62, view: 'lot' },
    desk: { x: 120, w: 120, kind: 'wood' },
    shelves: [{ x: 22, y: 120, w: 84 }],
    spots: [
      at('wall-lg', 130, 40), ...row('wall-sm', 24, 44, 2), ...row('wall-sm', 246, 110, 3), at('wall-lg', 40, 150),
      at('floor', 6, 206), at('floor', 322, 206),
    ],
  },
  {
    name: "HEAD COACH'S OFFICE",
    how: 'A conference title or three bowl wins.',
    w: 450, h: 280, wallH: 236, wall: '#d8d0c0', wallKind: 'paint', floor: '#2c3a52', floorKind: 'carpet', accent: true,
    window: { x: 298, y: 28, w: 126, h: 74, view: 'practice' },
    desk: { x: 170, w: 132, kind: 'wood' },
    shelves: [{ x: 298, y: 140, w: 126 }],
    trophyCase: { x: 18, w: 112, rows: 3 },
    spots: [
      ...row('wall-lg', 150, 34, 2, 12), at('wall-lg', 49, 50), ...row('wall-sm', 300, 160, 4, 7),
      at('floor', 136, 236), at('floor', 412, 236), at('floor', 376, 236),
    ],
  },
  {
    name: 'THE CORNER OFFICE',
    how: 'Two conference titles or a playoff berth.',
    w: 540, h: 300, wallH: 256, wall: '#e4dccb', wallKind: 'panel', floor: '#30251c', floorKind: 'wood', accent: true,
    window: { x: 318, y: 24, w: 200, h: 104, view: 'stadium' },
    desk: { x: 200, w: 150, kind: 'executive' },
    shelves: [{ x: 318, y: 168, w: 200 }],
    trophyCase: { x: 16, w: 146, rows: 4 },
    spots: [
      ...row('jersey', 176, 26, 3, 8), ...row('wall-lg', 172, 90, 2, 32), ...row('wall-lg', 22, 44, 2, 34), ...row('wall-sm', 320, 192, 6, 9),
      at('floor', 168, 256), at('floor', 502, 256), at('floor', 466, 256),
    ],
  },
  {
    name: 'THE SUITE',
    how: 'A national title and five conference titles.',
    w: 624, h: 312, wallH: 268, wall: '#2b2f38', wallKind: 'panel', floor: '#1c1a20', floorKind: 'carpet', accent: true,
    window: { x: 196, y: 18, w: 268, h: 134, view: 'stadium' },
    desk: { x: 236, w: 164, kind: 'executive' },
    shelves: [{ x: 200, y: 186, w: 260 }],
    trophyCase: { x: 12, w: 172, rows: 5 },
    spots: [
      ...row('jersey', 476, 22, 3, 8), ...row('jersey', 476, 74, 3, 8), ...row('wall-lg', 478, 128, 2, 14),
      ...row('wall-sm', 204, 208, 8, 8), at('wall-lg', 478, 176), at('wall-lg', 542, 176), ...row('wall-lg', 14, 40, 3, 10),
      at('floor', 192, 268), at('floor', 500, 268), at('floor', 588, 268), at('floor', 420, 268),
    ],
  },
];

/** Gap between items on a shelf or in the case. */
const PACK = 4;

/** Every spot in a room, in fill order: the explicit spots, then the shelves, the case and the desk. */
export function anchorsOf(room: RoomTier): Anchor[] {
  const out = [...room.spots];
  for (const sh of room.shelves) {
    const { w, h } = SLOT_SIZE.shelf;
    const n = Math.floor((sh.w - PACK) / (w + PACK));
    const x0 = sh.x + Math.floor((sh.w - (n * (w + PACK) - PACK)) / 2);
    for (let i = 0; i < n; i++) out.push({ kind: 'shelf', x: x0 + i * (w + PACK), y: sh.y - h, w, h });
  }
  const tc = room.trophyCase;
  if (tc) {
    const { w, h } = SLOT_SIZE.case;
    const n = Math.floor((tc.w - 8) / (w + PACK));
    const x0 = tc.x + Math.floor((tc.w - (n * (w + PACK) - PACK)) / 2);
    // The top row first, so a few trophies sit at eye level.
    for (let r = 0; r < tc.rows; r++) {
      const base = caseTop(room) + 6 + (r + 1) * (h + 6);
      for (let i = 0; i < n; i++) out.push({ kind: 'case', x: x0 + i * (w + PACK), y: base - h, w, h });
    }
  }
  const d = room.desk;
  const top = deskTop(room);
  const { w, h } = SLOT_SIZE.desk;
  // Either end of the desk; the middle is the coach's own clutter.
  const n = Math.max(1, Math.floor((d.w - 40) / (w + PACK) / 2));
  for (let i = 0; i < n; i++) {
    out.push({ kind: 'desk', x: d.x + 4 + i * (w + PACK), y: top - h, w, h });
    out.push({ kind: 'desk', x: d.x + d.w - 4 - w - i * (w + PACK), y: top - h, w, h });
  }
  return out;
}

/** The trophy case's height from its rows; it stands on the floor against the wall. */
export function caseHeight(room: RoomTier): number {
  const tc = room.trophyCase;
  return tc ? 6 + tc.rows * (SLOT_SIZE.case.h + 6) + 6 : 0;
}

export const caseTop = (room: RoomTier): number => room.wallH + 6 - caseHeight(room);

/** The desk's top surface. */
export const deskTop = (room: RoomTier): number => room.h - 34;
