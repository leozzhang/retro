import { caseHeight, caseTop, deskTop, ROOMS, type RoomTier, type WindowView } from '../data/office';
import { teamById, type Team } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { hashString, mulberry32 } from '../engine/math';
import { achievement, ACHIEVEMENTS, layoutOffice, levelOf, maxLevel, officeTier, toNextLevel } from '../season/achievements';
import type { OfficeItem, SeasonState } from '../season/types';
import { makeCrowd } from './field';
import { drawHint } from './hud';
import { addLink, gameLink, wrapSpans } from './links';
import { itemSprite, micro, shade, type Px } from './officeArt';
import { text } from './text';

/**
 * The coach's office (docs/OFFICE.md): OFFICE draws the room the user has earned with everything in
 * it (hover an item for its card, click one from this season for its game), LIST every achievement,
 * found or not, and the next room. The room is centered and sits on the page's floor, so a small
 * office is a small lit box in the dark.
 */

export const OFFICE_TABS = ['OFFICE', 'LIST'] as const;

export interface OfficeView {
  tab: number;
  scroll: number;
  mx: number;
  my: number;
  /** The dev showroom: these items in this room instead of the save's. */
  show?: { items: OfficeItem[]; tier: number; level: number };
  /** A room just moved into, announced on the page. */
  moved?: number;
}

type Box = { x: number; y: number; w: number; h: number };

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const CARD = '#141b26';
const RULE = '#1f2a3a';

/** The page floor the room stands on. */
const FLOOR_Y = 344;

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

export function officeTabRect(i: number): Box {
  let x = 8;
  for (let j = 0; j < i; j++) x += (OFFICE_TABS[j].length + 2) * 8 + 2;
  return { x, y: 16, w: (OFFICE_TABS[i].length + 2) * 8, h: 14 };
}

export const officeTabAt = (x: number, y: number): number => OFFICE_TABS.findIndex((_, i) => inBox(officeTabRect(i), x, y));

/** The items and room on show. */
function shown(s: SeasonState, v: OfficeView): { items: OfficeItem[]; tier: number } {
  return v.show ?? { items: s.office?.items ?? [], tier: officeTier(s) };
}

export function drawOffice(g: CanvasRenderingContext2D, s: SeasonState, v: OfficeView, t: number): void {
  g.fillStyle = '#07090c';
  g.fillRect(0, 0, VIEW_W, 360);
  const team = teamById(s.config.userTeamId);
  const { items, tier } = shown(s, v);
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, "COACH'S OFFICE", 10, 4);
  text(g, ROOMS[tier].name, VIEW_W - 10, 4, { align: 'right', color: GOLD });
  text(g, `${items.length} ${items.length === 1 ? 'ITEM' : 'ITEMS'}${v.show ? '  (SHOWROOM)' : ''}`, VIEW_W - 10, 19, { align: 'right', color: '#e6e6e6' });
  OFFICE_TABS.forEach((label, i) => {
    const b = officeTabRect(i);
    const on = i === v.tab;
    const hover = !on && inBox(b, v.mx, v.my);
    g.fillStyle = on ? '#07090c' : hover ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)';
    g.fillRect(b.x, b.y, b.w, b.h);
    text(g, label, b.x + b.w / 2, b.y + 4, { align: 'center', color: on ? GOLD : hover ? '#ffffff' : '#d8dde4', shadow: on ? undefined : false });
  });
  if (v.tab === 1) {
    drawList(g, s, v);
    drawHint(g, 'WHEEL: SCROLL   TAB: OFFICE   ESC: BACK');
    return;
  }
  const hover = drawRoom(g, s, team, items, tier, v, t);
  if (v.moved !== undefined) {
    const msg = `NEW OFFICE: ${ROOMS[v.moved].name}`;
    g.fillStyle = 'rgba(7,9,12,0.85)';
    g.fillRect(0, 36, VIEW_W, 16);
    text(g, msg, VIEW_W / 2, 40, { align: 'center', color: GOLD });
  }
  drawHint(g, hover ?? (v.show ? `[ ]: ROOM   L: LEVEL (${showLevel(v.show.level)})   Y: LEAVE   ESC: BACK` : 'HOVER AN ITEM   TAB: LIST   ESC: BACK'));
}

// ------------------------------------------------------------ the room

/** Draws the room and its items; returns the hint for an item under the mouse. */
function drawRoom(g: CanvasRenderingContext2D, s: SeasonState, team: Team, items: OfficeItem[], tier: number, v: OfficeView, t: number): string | undefined {
  const room = ROOMS[tier];
  const ox = Math.round((VIEW_W - room.w) / 2);
  const oy = FLOOR_Y - room.h;
  const P: Px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(ox + x, oy + y, w, h);
  };
  drawWall(P, room, team);
  if (room.window) drawWindow(g, P, ox, oy, room, team, night(s, tier));
  for (const sh of room.shelves) shelf(P, sh.x, sh.y, sh.w);
  if (room.trophyCase) caseBack(P, room);
  drawFloor(P, room);
  drawDesk(P, room, team);

  const lay = layoutOffice(items, tier);
  let hover: OfficeItem | undefined;
  let hoverBox: Box | undefined;
  for (const { item, at } of lay.placed) {
    const spr = itemSprite(item);
    const x = ox + at.x + Math.floor((at.w - spr.width) / 2);
    const y = oy + at.y + at.h - spr.height;
    g.drawImage(spr, x, y);
    const b = { x, y, w: spr.width, h: spr.height };
    const link = item.game && item.year === s.year && !v.show ? gameLink(item.game) : undefined;
    const over = link ? addLink(b.x, b.y, b.w, b.h, link) : inBox(b, v.mx, v.my);
    if (over) {
      hover = item;
      hoverBox = b;
    }
    if (item.fresh && Math.floor(t * 3) % 2 === 0) sparkle(g, b);
  }
  if (room.trophyCase) caseGlass(P, room);
  decorate(P, room, tier, team);
  const box = lay.stored.length ? storage(P, room, lay.stored.length) : undefined;
  const boxHit = box && inBox({ x: ox + box.x, y: oy + box.y, w: box.w, h: box.h }, v.mx, v.my);
  if (tier === 0) closetLight(g, ox, oy, room);

  if (hover && hoverBox) {
    g.strokeStyle = GOLD;
    g.lineWidth = 1;
    g.strokeRect(hoverBox.x - 1.5, hoverBox.y - 1.5, hoverBox.w + 3, hoverBox.h + 3);
    itemCard(g, hover, hoverBox, s);
    return hover.game && hover.year === s.year && !v.show ? 'CLICK: GAME PAGE   ESC: BACK' : 'TAB: LIST   ESC: BACK';
  }
  if (boxHit) {
    const names = [...new Set(lay.stored.map((i) => achievement(i.id)?.name ?? i.id))];
    tooltip(g, v.mx, v.my, 'IN STORAGE', [`${lay.stored.length} more ${lay.stored.length === 1 ? 'item' : 'items'} than this room holds.`, ...names.slice(0, 4)]);
    return 'A BIGGER OFFICE HOLDS MORE   ESC: BACK';
  }
  return undefined;
}

/** The suite's stadium is lit for the postseason and the offseason's nights. */
const night = (s: SeasonState, tier: number) => tier >= 4 && s.phase !== 'regular';

function drawWall(P: Px, room: RoomTier, team: Team): void {
  const { w, wallH } = room;
  P(0, 0, w, wallH, room.wall);
  // The ceiling's shadow.
  P(0, 0, w, 3, shade(room.wall, -0.35));
  P(0, 3, w, 2, shade(room.wall, -0.18));
  if (room.wallKind === 'block') {
    const mortar = shade(room.wall, -0.2);
    for (let y = 9, r = 0; y < wallH; y += 9, r++) {
      P(0, y, w, 1, mortar);
      for (let x = r % 2 ? 9 : 0; x < w; x += 18) P(x, y - 8, 1, 8, mortar);
    }
  } else if (room.wallKind === 'panel') {
    const line = shade(room.wall, -0.12);
    for (let x = 30; x < w; x += 44) {
      P(x, 6, 1, wallH - 6, line);
      P(x + 1, 6, 1, wallH - 6, shade(room.wall, 0.06));
    }
  }
  if (room.accent) {
    const y = wallH - 44;
    P(0, y, w, 26, shade(team.colors.primary, -0.25));
    P(0, y, w, 2, team.colors.secondary === team.colors.primary ? '#ffffff' : team.colors.secondary);
    P(0, y + 24, w, 2, shade(team.colors.primary, -0.5));
  }
  // Baseboard.
  P(0, wallH - 3, w, 3, shade(room.wall, -0.45));
}

function drawFloor(P: Px, room: RoomTier): void {
  const { w, h, wallH } = room;
  P(0, wallH, w, h - wallH, room.floor);
  if (room.floorKind === 'tile') {
    const alt = shade(room.floor, 0.1);
    for (let y = wallH, r = 0; y < h; y += 11, r++) for (let x = (r % 2) * 11; x < w; x += 22) P(x, y, Math.min(11, w - x), Math.min(11, h - y), alt);
  } else if (room.floorKind === 'wood') {
    const seam = shade(room.floor, -0.3);
    for (let y = wallH + 5, r = 0; y < h; y += 6, r++) {
      P(0, y, w, 1, seam);
      for (let x = (r * 37) % 60; x < w; x += 60) P(x, y - 5, 1, 5, seam);
    }
  } else {
    const rng = mulberry32(7);
    const fleck = shade(room.floor, 0.12);
    for (let i = 0; i < (w * (h - wallH)) / 40; i++) P(Math.floor(rng() * w), wallH + Math.floor(rng() * (h - wallH)), 1, 1, fleck);
  }
  // The wall's shadow on the floor.
  P(0, wallH, w, 2, 'rgba(0,0,0,0.3)');
}

function shelf(P: Px, x: number, y: number, w: number): void {
  P(x, y, w, 3, '#6b4a2a');
  P(x, y, w, 1, '#8a6238');
  P(x, y + 3, w, 1, 'rgba(0,0,0,0.35)');
  P(x + 4, y + 3, 2, 4, '#3a3a40');
  P(x + w - 6, y + 3, 2, 4, '#3a3a40');
}

function caseBack(P: Px, room: RoomTier): void {
  const tc = room.trophyCase!;
  const y = caseTop(room);
  const h = caseHeight(room);
  P(tc.x - 3, y - 4, tc.w + 6, h + 4, WOODS[0]);
  P(tc.x - 3, y - 4, tc.w + 6, 2, WOODS[2]);
  P(tc.x, y, tc.w, h - 4, '#1e2a33');
  // A shelf under each row.
  for (let r = 0; r < tc.rows; r++) P(tc.x, y + 6 + (r + 1) * 34, tc.w, 2, '#9fb3bf');
}

function caseGlass(P: Px, room: RoomTier): void {
  const tc = room.trophyCase!;
  const y = caseTop(room);
  const h = caseHeight(room) - 4;
  P(tc.x, y, tc.w, h, 'rgba(170,210,230,0.08)');
  for (let i = 0; i < 3; i++) {
    const x0 = tc.x + 10 + i * Math.floor(tc.w / 3);
    for (let k = 0; k < 12; k++) P(x0 + k, y + 4 + k * 2, 1, 2, 'rgba(255,255,255,0.08)');
  }
  P(tc.x + Math.floor(tc.w / 2), y, 1, h, WOODS[0]);
}

const WOODS = ['#3b2414', '#5a3a1e', '#7a5230'];

function drawDesk(P: Px, room: RoomTier, team: Team): void {
  const { x, w, kind } = room.desk;
  const top = deskTop(room);
  const cx = x + w / 2;
  // The chair, behind it.
  const leather = kind === 'executive' ? '#3a1f16' : kind === 'wood' ? '#2f4a6a' : '#6a6e75';
  const cw = kind === 'executive' ? 30 : 22;
  const ch = kind === 'executive' ? 30 : 20;
  const cx0 = Math.round(cx - cw / 2);
  P(cx0 + 2, top - ch, cw - 4, 2, leather);
  P(cx0, top - ch + 2, cw, ch - 2, leather);
  P(cx0 + 2, top - ch, cw - 4, 1, shade(leather, 0.3));
  // Tufted or stitched.
  for (let k = 4; k < cw - 2; k += 6) P(cx0 + k, top - ch + 4, 1, ch - 6, shade(leather, -0.3));
  if (kind === 'folding') {
    P(x, top, w, 3, '#9a9ea6');
    P(x, top + 3, w, 1, '#6c7078');
    P(x + 6, top + 4, 2, room.h - top - 8, '#55595f');
    P(x + w - 8, top + 4, 2, room.h - top - 8, '#55595f');
    return;
  }
  const wood = kind === 'executive' ? '#3a2214' : '#6b4a2a';
  P(x - 2, top, w + 4, 4, shade(wood, 0.25));
  P(x, top + 4, w, room.h - top - 8, wood);
  // Drawers, and the executive desk's plate in the school's colors.
  const dk = shade(wood, -0.3);
  P(x + 6, top + 9, 26, 1, dk);
  P(x + 6, top + 17, 26, 1, dk);
  P(x + 17, top + 6, 4, 1, GOLD);
  P(x + 17, top + 12, 4, 1, GOLD);
  if (kind === 'executive') {
    P(cx - 14, top + 9, 28, 14, team.colors.primary);
    P(cx - 14, top + 9, 28, 1, shade(team.colors.primary, 0.3));
    micro(P, team.abbr.slice(0, 4), cx - 14 + Math.floor((28 - (team.abbr.slice(0, 4).length * 4 - 1)) / 2), top + 14, team.colors.secondary === team.colors.primary ? '#ffffff' : team.colors.secondary);
  }
  P(x, room.h - 4, w, 1, 'rgba(0,0,0,0.4)');
}

/** The furniture's own clutter: a closet's bulb and mop bucket, a lamp, papers, a mug. */
function decorate(P: Px, room: RoomTier, tier: number, team: Team): void {
  const top = deskTop(room);
  const cx = room.desk.x + room.desk.w / 2;
  // Papers and a mug in the middle of the desk.
  P(cx - 12, top - 2, 14, 2, '#e8e4da');
  P(cx - 11, top - 3, 12, 1, '#f4f1e8');
  P(cx + 5, top - 6, 5, 6, '#f4f1e8');
  P(cx + 6, top - 5, 3, 3, team.colors.primary);
  P(cx + 10, top - 5, 1, 3, '#f4f1e8');
  if (tier === 0) {
    // The bare bulb, and the mop bucket in the corner.
    P(room.w / 2, 0, 1, 26, '#222');
    P(room.w / 2 - 2, 26, 5, 6, '#fff3b0');
    P(room.w / 2 - 1, 32, 3, 1, '#c9b860');
    const bx = room.w - 34;
    const by = room.h - 22;
    P(bx, by, 20, 16, '#c9a227');
    P(bx, by, 20, 2, '#e8c34a');
    P(bx + 13, by - 26, 2, 28, '#8a6a3a');
    P(bx + 9, by - 2, 10, 4, '#cfcfcf');
    return;
  }
  // A desk lamp.
  const lx = cx - 26;
  P(lx, top - 2, 8, 2, '#2a2a2a');
  P(lx + 3, top - 12, 2, 10, '#2a2a2a');
  P(lx - 1, top - 16, 10, 4, '#2f5d3a');
  P(lx, top - 12, 8, 1, '#fff3b0');
}

/** The boxes in the corner when the room's full; returns their box in room coordinates. */
function storage(P: Px, room: RoomTier, n: number): Box {
  const x = 6;
  const y = room.h - 30;
  const b = (bx: number, by: number) => {
    P(bx, by, 22, 14, '#a07a44');
    P(bx, by, 22, 2, '#c19457');
    P(bx + 9, by, 4, 14, '#c9b48a');
  };
  b(x, y + 12);
  b(x + 23, y + 12);
  if (n > 3) b(x + 11, y - 2);
  micro(P, String(n), x + 16, y + 18, '#3b2414');
  return { x, y: y - 2, w: 45, h: 30 };
}

function closetLight(g: CanvasRenderingContext2D, ox: number, oy: number, room: RoomTier): void {
  const cx = ox + room.w / 2;
  const grad = g.createRadialGradient(cx, oy + 30, 20, cx, oy + 90, room.w * 0.75);
  grad.addColorStop(0, 'rgba(255,240,170,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = grad;
  g.fillRect(ox, oy, room.w, room.h);
}

function sparkle(g: CanvasRenderingContext2D, b: Box): void {
  g.fillStyle = GOLD;
  const x = b.x + b.w - 2;
  const y = b.y - 2;
  g.fillRect(x, y - 2, 1, 5);
  g.fillRect(x - 2, y, 5, 1);
}

// ------------------------------------------------------------ the window

const crowds = new Map<string, HTMLCanvasElement>();

function drawWindow(g: CanvasRenderingContext2D, P: Px, ox: number, oy: number, room: RoomTier, team: Team, dark: boolean): void {
  const win = room.window!;
  P(win.x - 4, win.y - 4, win.w + 8, win.h + 8, '#2a2a2e');
  P(win.x - 4, win.y + win.h + 2, win.w + 8, 3, '#d8d8d8');
  g.save();
  g.beginPath();
  g.rect(ox + win.x, oy + win.y, win.w, win.h);
  g.clip();
  view(g, ox + win.x, oy + win.y, win.w, win.h, win.view, team, dark);
  g.restore();
  // Mullions, and the glass.
  const panes = Math.max(2, Math.round(win.w / 64));
  for (let i = 1; i < panes; i++) P(win.x + Math.round((i * win.w) / panes) - 1, win.y, 2, win.h, '#2a2a2e');
  P(win.x + 6, win.y + 4, 1, 12, 'rgba(255,255,255,0.25)');
  P(win.x + 8, win.y + 4, 1, 6, 'rgba(255,255,255,0.18)');
}

function view(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: WindowView, team: Team, dark: boolean): void {
  const P = (px: number, py: number, pw: number, ph: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x + px, y + py, pw, ph);
  };
  const rng = mulberry32(hashString(team.id + kind));
  const sky = dark ? ['#0b1026', '#141b3a'] : ['#7fb6e8', '#a9d1f2'];
  const skyH = Math.round(h * (kind === 'stadium' ? 0.3 : 0.45));
  P(0, 0, w, skyH, sky[0]);
  P(0, Math.round(skyH / 2), w, skyH - Math.round(skyH / 2), sky[1]);
  if (dark) for (let i = 0; i < w / 6; i++) P(Math.floor(rng() * w), Math.floor(rng() * skyH * 0.8), 1, 1, '#d8e0ff');
  else for (let i = 0; i < 2; i++) {
    const cx = Math.floor(rng() * (w - 30));
    const cy = 3 + Math.floor(rng() * (skyH / 2));
    P(cx, cy, 24, 4, '#f2f6fa');
    P(cx + 5, cy - 3, 12, 3, '#f2f6fa');
  }
  if (kind === 'lot') {
    P(0, skyH - 12, w, 12, '#8a8f99');
    for (let wx = 4; wx < w; wx += 10) P(wx, skyH - 9, 4, 3, '#cfe3f2');
    P(0, skyH, w, h - skyH, '#4a4d54');
    for (let sx = 6; sx < w; sx += 18) P(sx, skyH + 6, 1, h - skyH - 6, '#d8d8d8');
    const cars = ['#9a9ea6', team.colors.primary, '#2d3a5a', '#e8e4da'];
    for (let i = 0; i < 4; i++) {
      if (rng() < 0.3) continue;
      const cx = 9 + i * 18 * 1 + Math.floor(rng() * 2);
      P(cx, skyH + 12, 12, 7, cars[i]);
      P(cx + 2, skyH + 10, 8, 3, shade(cars[i], -0.25));
    }
    return;
  }
  if (kind === 'practice') {
    for (let tx = -4; tx < w; tx += 9) P(tx, skyH - 6 - Math.floor(rng() * 5), 12, 12, '#2c5a2e');
    P(0, skyH, w, h - skyH, '#3d8b37');
    for (let fy = skyH; fy < h; fy += 8) P(0, fy, w, 4, '#46973f');
    for (let fx = 8; fx < w; fx += 16) P(fx, skyH + 2, 1, h - skyH, 'rgba(255,255,255,0.75)');
    P(w - 18, skyH + 4, 1, 14, '#ffd23f');
    P(w - 26, skyH + 4, 17, 1, '#ffd23f');
    P(w - 26, skyH - 6, 1, 10, '#ffd23f');
    P(w - 10, skyH - 6, 1, 10, '#ffd23f');
    // A blocking sled.
    P(20, h - 12, 18, 3, '#6a6e75');
    P(22, h - 18, 4, 6, team.colors.primary);
    P(32, h - 18, 4, 6, team.colors.primary);
    return;
  }
  // The stadium: the far stands, the wall in the school's colors, the field.
  const key = team.id;
  let crowd = crowds.get(key);
  if (!crowd) crowds.set(key, (crowd = makeCrowd(team, team)));
  const standH = Math.round(h * 0.32);
  g.drawImage(crowd, 300, 0, w, crowd.height, x, y + skyH, w, standH);
  if (dark) {
    g.fillStyle = 'rgba(255,240,200,0.10)';
    g.fillRect(x, y + skyH, w, standH);
    for (const lx of [Math.round(w * 0.12), Math.round(w * 0.88)]) {
      P(lx, 6, 2, skyH, '#3a3a44');
      P(lx - 6, 4, 14, 5, '#fff8d8');
    }
  }
  const wallY = skyH + standH;
  P(0, wallY, w, 4, team.colors.primary);
  P(0, wallY + 4, w, 1, shade(team.colors.primary, -0.4));
  const fy = wallY + 5;
  P(0, fy, w, h - fy, dark ? '#4aa042' : '#3d8b37');
  for (let by = fy; by < h; by += 7) P(0, by, w, 3, dark ? '#55ad4c' : '#46973f');
  for (let lx = 6; lx < w; lx += 22) P(lx, fy, 1, h - fy, 'rgba(255,255,255,0.8)');
  const gx = w - 22;
  const gy = fy + Math.round((h - fy) * 0.45);
  P(gx, gy, 1, 10, '#ffd23f');
  P(gx - 9, gy, 19, 1, '#ffd23f');
  P(gx - 9, gy - 14, 1, 14, '#ffd23f');
  P(gx + 9, gy - 14, 1, 14, '#ffd23f');
}

// ------------------------------------------------------------ cards

const showLevel = (lv: number) => (lv === Infinity ? 'TOP' : lv === -1 ? 'MIXED' : String(lv));

function itemCard(g: CanvasRenderingContext2D, it: OfficeItem, b: Box, s: SeasonState): void {
  const def = achievement(it.id);
  const lines = def ? def.desc(it) : [];
  const school = it.team !== s.config.userTeamId ? [`At ${teamById(it.team).school}.`] : [];
  if (!def?.levels) {
    tooltip(g, b.x + b.w / 2, b.y, def?.name ?? it.id, [...lines, ...school], String(it.year));
    return;
  }
  // A leveled item: its level, what's next, and the latest of its log.
  const next = toNextLevel(it);
  const more = next === undefined ? 'Fully upgraded.' : `${next} more to level ${levelOf(it) + 1}.`;
  const log = (it.log ?? []).slice(-3).reverse().filter((m) => m.t).map((m) => `${m.y}: ${m.t}`);
  tooltip(g, b.x + b.w / 2, b.y, def.name, [...lines, ...school, more], `LV ${levelOf(it)}/${maxLevel(it.id)}`, log);
}

/** A card next to (cx, cy), kept on screen. */
function tooltip(g: CanvasRenderingContext2D, cx: number, cy: number, title: string, body: string[], right?: string, foot: string[] = []): void {
  const w = 240;
  const n = (w - 16) / 8;
  const lines = body.flatMap((l) => wrapSpans(l, [], n).map((x) => x.t));
  const feet = foot.flatMap((l) => wrapSpans(l, [], n).map((x) => x.t));
  const h = 24 + lines.length * 11 + (feet.length ? 6 + feet.length * 11 : 0);
  let x = Math.round(cx - w / 2);
  x = Math.max(4, Math.min(VIEW_W - w - 4, x));
  let y = cy - h - 6;
  if (y < 34) y = cy + 50;
  y = Math.max(34, Math.min(344 - h, y));
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(x + 2, y + 2, w, h);
  g.fillStyle = CARD;
  g.fillRect(x, y, w, h);
  g.fillStyle = GOLD;
  g.fillRect(x, y, w, 1);
  text(g, title, x + 8, y + 6, { color: GOLD, shadow: false });
  if (right) text(g, right, x + w - 8, y + 6, { align: 'right', color: DIM, shadow: false });
  g.fillStyle = RULE;
  g.fillRect(x, y + 17, w, 1);
  lines.forEach((l, i) => text(g, l, x + 8, y + 22 + i * 11, { color: '#d8dde4', shadow: false }));
  if (!feet.length) return;
  const fy = y + 22 + lines.length * 11 + 2;
  g.fillStyle = RULE;
  g.fillRect(x, fy, w, 1);
  feet.forEach((l, i) => text(g, l, x + 8, fy + 4 + i * 11, { color: SOFT, shadow: false }));
}

// ------------------------------------------------------------ LIST

const LIST_TOP = 74;
const LIST_ROW = 26;
const LIST_ROWS = 10;

export function officeScrollMax(): number {
  return Math.max(0, ACHIEVEMENTS.length - LIST_ROWS);
}

function drawList(g: CanvasRenderingContext2D, s: SeasonState, v: OfficeView): void {
  const { items, tier } = shown(s, v);
  const next = ROOMS[tier + 1];
  g.fillStyle = CARD;
  g.fillRect(8, 36, VIEW_W - 16, 30);
  text(g, `ROOM: ${ROOMS[tier].name}`, 16, 41, { color: ACCENT, shadow: false });
  text(g, next ? `NEXT: ${next.name} - ${next.how.toUpperCase()}` : 'THE BEST OFFICE IN THE COUNTRY.', 16, 54, { color: SOFT, shadow: false });
  const found = new Set(items.map((i) => i.id));
  text(g, `${found.size}/${ACHIEVEMENTS.length} FOUND`, VIEW_W - 16, 41, { align: 'right', color: GOLD, shadow: false });
  ACHIEVEMENTS.slice(v.scroll, v.scroll + LIST_ROWS).forEach((a, i) => {
    const y = LIST_TOP + i * LIST_ROW;
    const mine = items.filter((it) => it.id === a.id);
    const last = mine[mine.length - 1];
    g.fillStyle = i % 2 ? '#0b0f15' : '#0e131b';
    g.fillRect(8, y, VIEW_W - 16, LIST_ROW - 2);
    if (last) {
      const spr = itemSprite(last);
      const k = Math.min(1, 22 / spr.width, 22 / spr.height);
      const w = Math.round(spr.width * k), h = Math.round(spr.height * k);
      g.drawImage(spr, 23 - Math.round(w / 2), y + 12 - Math.round(h / 2), w, h);
    }
    else {
      g.fillStyle = '#1a2230';
      g.fillRect(14, y + 3, 18, 18);
      text(g, '?', 23, y + 8, { align: 'center', color: DIM, shadow: false });
    }
    text(g, a.name, 42, y + 3, { color: last ? GOLD : a.bad ? '#c98a8a' : '#cfd6df', shadow: false });
    if (last && a.levels) {
      const lv = levelOf(last), top = a.levels.length;
      text(g, `LV ${lv}/${top}`, VIEW_W - 16, y + 3, { align: 'right', color: lv >= top ? GOLD : ACCENT, shadow: false });
      // Pips for the levels.
      for (let k = 0; k < top; k++) {
        g.fillStyle = k < lv ? GOLD : '#2a3444';
        g.fillRect(VIEW_W - 16 - 64 - (top - k) * 6, y + 5, 4, 4);
      }
    } else if (mine.length > 1) text(g, `x${mine.length}`, VIEW_W - 16, y + 3, { align: 'right', color: GOLD, shadow: false });
    else if (!last && a.levels) text(g, `${a.levels.length} LEVELS`, VIEW_W - 16, y + 3, { align: 'right', color: DIM, shadow: false });
    const line = last ? (a.levels ? a.desc(last)[0] : `${last.year}: ${a.desc(last)[0]}`) : a.hint;
    text(g, line.length > 70 ? line.slice(0, 69) + '.' : line, 42, y + 14, { color: last ? SOFT : DIM, shadow: false });
  });
}
