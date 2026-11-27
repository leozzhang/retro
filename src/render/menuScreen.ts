import { teamRatings, buildSquad } from '../data/depth';
import { teamById, type Team } from '../data/teams';
import type { Camera } from '../engine/camera';
import { VIEW_W } from '../engine/constants';
import type { SlotMeta } from '../season/save';
import { drawField } from './field';
import { drawHint } from './hud';
import { getSprite, teamUniform } from './sprites';
import { text } from './text';

/**
 * The screens before a game or a dynasty: the main menu, the exhibition setup, the dynasty save
 * slots, choosing a school and the dynasty settings. All share the title backdrop: the field and
 * crowd in the two teams' colors, dimmed. Input is in game/game.ts.
 */

export type Box = { x: number; y: number; w: number; h: number };

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const RED = '#ff5a5a';
const CARD = '#141b26';
const CARD_HOT = '#24324a';

export const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** The field and crowd behind every menu, dimmed, with an optional title. */
export function drawBackdrop(
  g: CanvasRenderingContext2D, cam: Camera, user: Team, cpu: Team, crowd: HTMLCanvasElement, title?: string, sub?: string,
): void {
  drawField(g, cam, user, cpu, crowd);
  g.fillStyle = 'rgba(8,10,14,0.72)';
  g.fillRect(0, 0, VIEW_W, 360);
  if (!title) return;
  text(g, title, VIEW_W / 2, 26, { size: 16, align: 'center', color: GOLD, shadow: '#7a3e14' });
  if (sub) text(g, sub, VIEW_W / 2, 50, { align: 'center', color: '#cfd6df' });
}

function button(g: CanvasRenderingContext2D, b: Box, label: string, hot: boolean, color = GOLD): void {
  g.fillStyle = hot ? CARD_HOT : CARD;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = hot ? color : DIM;
  g.fillRect(b.x, b.y, b.w, 1);
  g.fillRect(b.x, b.y + b.h - 1, b.w, 1);
  g.fillRect(b.x, b.y, 1, b.h);
  g.fillRect(b.x + b.w - 1, b.y, 1, b.h);
  text(g, label, b.x + b.w / 2, b.y + Math.round((b.h - 8) / 2), { align: 'center', color: hot ? color : '#ffffff' });
}

/** The big button at the foot of the setup screens: KICK OFF, NEXT, START DYNASTY. */
export const GO_BTN: Box = { x: VIEW_W / 2 - 90, y: 290, w: 180, h: 20 };

/** The exhibition's SIM GAME, beside KICK OFF: the game played through the engine, watched at the DRIVES level. */
export const SIM_GAME_BTN: Box = { x: VIEW_W / 2 + 100, y: 290, w: 100, h: 20 };

/** The gold GO button, like the hub's main action. */
function goButton(g: CanvasRenderingContext2D, label: string, hot: boolean): void {
  const b = GO_BTN;
  g.fillStyle = hot ? '#ffe680' : GOLD;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = '#7a3e14';
  g.fillRect(b.x, b.y + b.h - 2, b.w, 2);
  text(g, label, b.x + b.w / 2, b.y + 6, { align: 'center', color: '#1a1206', shadow: false });
}

// ------------------------------------------------------------ main menu

export interface MenuItem {
  id: 'continue' | 'dynasty' | 'exhibition' | 'sound';
  label: string;
  desc: string;
}

const MENU_W = 280;
const MENU_H = 32;
const MENU_Y = 104;
const MENU_STEP = 40;

export function menuRect(i: number): Box {
  return { x: VIEW_W / 2 - MENU_W / 2, y: MENU_Y + i * MENU_STEP, w: MENU_W, h: MENU_H };
}

/** The title's menu, over the backdrop or the highlight reel (game/titleReel.ts). */
export function drawMainMenu(g: CanvasRenderingContext2D, items: MenuItem[], sel: number): void {
  text(g, 'SATURDAY GRIDIRON', VIEW_W / 2, 40, { size: 24, align: 'center', color: GOLD, shadow: '#7a3e14' });
  text(g, 'COLLEGE FOOTBALL', VIEW_W / 2, 76, { align: 'center', color: '#cfd6df' });
  items.forEach((it, i) => {
    const r = menuRect(i);
    const hot = i === sel;
    g.fillStyle = hot ? CARD_HOT : 'rgba(20,27,38,0.85)';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = hot ? GOLD : '#2a3546';
    g.fillRect(r.x, r.y, 3, r.h);
    text(g, `${hot ? '> ' : ''}${it.label}`, r.x + 14, r.y + 6, { size: 8, color: hot ? GOLD : '#ffffff' });
    text(g, it.desc, r.x + 14, r.y + 19, { color: hot ? '#cfd6df' : SOFT, shadow: false });
  });
  text(g, 'W/S: SELECT   ENTER OR CLICK: GO', VIEW_W / 2, 316, { align: 'center', color: ACCENT });
  text(g, 'DRAG + RELEASE TO PASS.  R-CLICK HAND OFF.  WASD MOVE.  SHIFT SPRINT.', VIEW_W / 2, 334, { align: 'center', color: SOFT });
}

// ------------------------------------------------------------ team panels (exhibition, choosing a school)

/** One team: its player, the < > arrows, school, conference and ratings. Clicks: y 150-222 team, 222-238 conference. */
export function drawTeamPanel(g: CanvasRenderingContext2D, t: Team, cx: number, label: string, keys: string, home: boolean): void {
  text(g, label, cx, 92, { align: 'center', color: SOFT });
  g.drawImage(getSprite(teamUniform(t, home), '#c68a5e', 'stand', home ? 1 : -1), cx - 40, 112, 80, 88);
  text(g, '<', cx - 70, 152, { size: 16, align: 'center', color: GOLD });
  text(g, '>', cx + 70, 152, { size: 16, align: 'center', color: GOLD });
  text(g, t.school.toUpperCase(), cx, 206, { size: t.school.length > 13 ? 8 : 12, align: 'center', color: '#ffffff' });
  text(g, `< ${t.conference.toUpperCase()} >`, cx, 224, { align: 'center', color: ACCENT });
  const r = teamRatings(buildSquad(t));
  text(g, `OVR ${r.ovr}  OFF ${r.off}  DEF ${r.def}`, cx, 238, { align: 'center', color: '#cfd6df' });
  text(g, keys, cx, 252, { align: 'center', color: DIM, shadow: false });
}

/** Rows the team panels' clicks use. */
export const PANEL_TEAM_Y = [110, 218] as const;
export const PANEL_CONF_Y = [218, 234] as const;

/** The exhibition's second options line, under the buttons (PLAY DEFENSE): its rows for clicks. */
export const EXHIBITION_LINE2_Y = [316, 328] as const;

export function drawExhibition(g: CanvasRenderingContext2D, user: Team, cpu: Team, quarter: string, keys: string, mx: number, my: number, keys2 = ''): void {
  drawTeamPanel(g, user, 160, 'YOUR TEAM', 'A/D TEAM  W/S CONF', true);
  drawTeamPanel(g, cpu, 480, 'OPPONENT', 'ARROW KEYS', false);
  text(g, 'VS', VIEW_W / 2, 152, { size: 16, align: 'center', color: '#ffffff' });
  text(g, `<  ${quarter}  >   (Q / E)`, VIEW_W / 2, 266, { align: 'center', color: ACCENT });
  text(g, keys, VIEW_W / 2, 280, { align: 'center', color: my >= 280 && my < 290 ? GOLD : SOFT, shadow: false });
  goButton(g, 'KICK OFF', inBox(GO_BTN, mx, my));
  const b = SIM_GAME_BTN;
  const hot = inBox(b, mx, my);
  g.fillStyle = hot ? '#2c3d58' : '#1f2a3a';
  g.fillRect(b.x, b.y, b.w, b.h);
  text(g, 'SIM GAME', b.x + b.w / 2, b.y + 6, { align: 'center', color: hot ? GOLD : '#ffffff', shadow: false });
  if (keys2) {
    const [y0, y1] = EXHIBITION_LINE2_Y;
    text(g, keys2, VIEW_W / 2, y0 + 2, { align: 'center', color: my >= y0 && my < y1 ? GOLD : SOFT, shadow: false });
  }
  drawHint(g, 'ENTER: KICK OFF   X: SIM GAME   R / T: ROSTERS   ESC: BACK');
}

export function drawNewTeam(g: CanvasRenderingContext2D, t: Team, slot: number, mx: number, my: number): void {
  drawTeamPanel(g, t, VIEW_W / 2, `SLOT ${slot}`, '', true);
  goButton(g, 'NEXT', inBox(GO_BTN, mx, my));
  drawHint(g, 'A/D: TEAM   W/S: CONFERENCE   ENTER: NEXT   ESC: BACK');
}

// ------------------------------------------------------------ save slots

const SLOT_W = 180;
const SLOT_H = 214;
const SLOT_GAP = 16;
const SLOT_Y = 72;

export function slotRect(i: number): Box {
  const x0 = (VIEW_W - (3 * SLOT_W + 2 * SLOT_GAP)) / 2;
  return { x: x0 + i * (SLOT_W + SLOT_GAP), y: SLOT_Y, w: SLOT_W, h: SLOT_H };
}

/** The small DELETE button on a used slot. */
export function slotDeleteRect(i: number): Box {
  const r = slotRect(i);
  return { x: r.x + r.w / 2 - 34, y: r.y + r.h - 22, w: 68, h: 14 };
}

/** The confirm and cancel buttons once DELETE is pressed. */
export function slotConfirmRects(i: number): { yes: Box; no: Box } {
  const r = slotRect(i);
  return {
    yes: { x: r.x + 14, y: r.y + 130, w: 70, h: 18 },
    no: { x: r.x + r.w - 84, y: r.y + 130, w: 70, h: 18 },
  };
}

export interface SlotsView {
  sel: number;
  /** The slot asking "DELETE?", or -1. */
  confirm: number;
  /** The slot whose save is loading, or -1. */
  loading: number;
  mx: number;
  my: number;
}

export function drawSlots(g: CanvasRenderingContext2D, metas: (SlotMeta | null)[], v: SlotsView): void {
  metas.forEach((m, i) => {
    const r = slotRect(i);
    const hot = i === v.sel;
    g.fillStyle = hot ? CARD_HOT : 'rgba(20,27,38,0.9)';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (!m) {
      text(g, `SLOT ${i + 1}`, r.x + r.w / 2, r.y + 10, { align: 'center', color: DIM, shadow: false });
      text(g, '+', r.x + r.w / 2, r.y + 80, { size: 24, align: 'center', color: hot ? GOLD : SOFT });
      text(g, 'NEW DYNASTY', r.x + r.w / 2, r.y + 120, { align: 'center', color: hot ? GOLD : '#ffffff' });
      text(g, 'EMPTY', r.x + r.w / 2, r.y + 136, { align: 'center', color: DIM, shadow: false });
    } else {
      const t = teamById(m.teamId);
      g.fillStyle = t.colors.primary;
      g.fillRect(r.x, r.y, r.w, 24);
      text(g, `SLOT ${i + 1}`, r.x + 8, r.y + 8);
      text(g, `${m.seasons} SEASON${m.seasons === 1 ? '' : 'S'}`, r.x + r.w - 8, r.y + 8, { align: 'right', color: '#e6e6e6' });
      g.drawImage(getSprite(teamUniform(t, true), '#c68a5e', 'stand', 1), r.x + r.w / 2 - 30, r.y + 30, 60, 66);
      text(g, `${m.rank ? `#${m.rank} ` : ''}${t.school.toUpperCase()}`.slice(0, 20), r.x + r.w / 2, r.y + 104, { align: 'center', color: '#ffffff' });
      text(g, t.mascot.toUpperCase().slice(0, 20), r.x + r.w / 2, r.y + 116, { align: 'center', color: SOFT, shadow: false });
      if (v.confirm === i) {
        g.fillStyle = '#3c0a0e';
        g.fillRect(r.x, r.y + 96, r.w, r.h - 96);
        text(g, 'DELETE THIS', r.x + r.w / 2, r.y + 104, { align: 'center', color: RED });
        text(g, 'DYNASTY?', r.x + r.w / 2, r.y + 116, { align: 'center', color: RED });
        const c = slotConfirmRects(i);
        button(g, c.yes, 'DELETE', inBox(c.yes, v.mx, v.my), RED);
        button(g, c.no, 'KEEP', inBox(c.no, v.mx, v.my));
        text(g, 'CAN\'T BE UNDONE', r.x + r.w / 2, r.y + 160, { align: 'center', color: SOFT, shadow: false });
      } else {
        // "OFFSEASON: SIGNING DAY" splits over the two lines.
        const off = m.phase.startsWith('OFFSEASON: ');
        text(g, `${m.year}${off ? ' OFFSEASON' : ''}`, r.x + r.w / 2, r.y + 136, { align: 'center', color: GOLD });
        text(g, (off ? m.phase.slice(11) : m.phase).slice(0, 21), r.x + r.w / 2, r.y + 148, { align: 'center', color: '#cfd6df', shadow: false });
        text(g, m.record, r.x + r.w / 2, r.y + 164, { align: 'center', color: '#ffffff' });
        if (v.loading === i) text(g, 'LOADING...', r.x + r.w / 2, r.y + 180, { align: 'center', color: GOLD });
        const d = slotDeleteRect(i);
        const dh = inBox(d, v.mx, v.my);
        text(g, 'DELETE', d.x + d.w / 2, d.y + 3, { align: 'center', color: dh ? RED : DIM, shadow: false });
      }
    }
    // The selected slot's outline.
    g.fillStyle = hot ? GOLD : '#2a3546';
    g.fillRect(r.x, r.y + r.h - 2, r.w, 2);
    if (hot) {
      g.fillRect(r.x, r.y, 2, r.h);
      g.fillRect(r.x + r.w - 2, r.y, 2, r.h);
      g.fillRect(r.x, r.y, r.w, 2);
    }
  });
  const used = metas[v.sel];
  drawHint(g, v.confirm >= 0 ? 'ENTER: DELETE   ESC: KEEP IT' : `A/D: SLOT   ENTER: ${used ? 'PLAY' : 'NEW DYNASTY'}${used ? '   DEL: DELETE' : ''}   ESC: BACK`);
}

// ------------------------------------------------------------ dynasty settings

export interface SettingRow {
  label: string;
  value: string;
  help: string;
  /** The header over the rows from here on (the dynasty settings' groups). */
  section?: string;
  /** Drawn dim: the setting has no effect as the others stand (PLAY DEFENSE under a SUMMARY of CPU DRIVES). */
  dim?: boolean;
}

const SET_X = 120;
const SET_W = VIEW_W - 2 * SET_X;
const SET_Y = 88;
const SET_H = 15;
const SET_STEP = 17;
/** A section's header in the dynasty settings' list. */
const SET_HEAD = 13;
/** The dynasty settings' scrolling window: the rows scroll inside it, the help line and button stay put below. */
const SET_VIEW = { y: SET_Y, h: 158 };

/** A row of the sound page (a fixed list, no scrolling). */
export function settingRect(i: number): Box {
  return { x: SET_X, y: SET_Y + i * SET_STEP, w: SET_W, h: SET_H };
}

/** The < and > on a setting row (`settingRect`, or a dynasty settings row's `settingRowRect`). */
export function settingArrows(i: number | Box): { prev: Box; next: Box } {
  const r = typeof i === 'number' ? settingRect(i) : i;
  return { prev: { x: r.x + r.w - 196, y: r.y, w: 20, h: r.h }, next: { x: r.x + r.w - 24, y: r.y, w: 20, h: r.h } };
}

/** Each row's top in the list (a header goes before the first row of each section), and the list's height. */
function settingLayout(rows: SettingRow[]): { ys: number[]; heads: { y: number; label: string }[]; height: number } {
  const ys: number[] = [];
  const heads: { y: number; label: string }[] = [];
  let y = 0;
  rows.forEach((r, i) => {
    if (r.section && r.section !== rows[i - 1]?.section) {
      heads.push({ y, label: r.section });
      y += SET_HEAD;
    }
    ys.push(y);
    y += SET_STEP;
  });
  return { ys, heads, height: y - (SET_STEP - SET_H) };
}

/** How far the dynasty settings' list scrolls at most. */
export function settingMaxScroll(rows: SettingRow[]): number {
  return Math.max(0, settingLayout(rows).height - SET_VIEW.h);
}

/** The scroll that shows row `sel` (with its section's header when it's the first row), moving as little as it can. */
export function settingScrollTo(rows: SettingRow[], sel: number, scroll: number): number {
  const L = settingLayout(rows);
  const y = L.ys[sel] ?? 0;
  const head = L.heads.find((h) => h.y + SET_HEAD === y);
  const top = head ? head.y : y;
  let s = scroll;
  if (top < s) s = top;
  if (y + SET_H > s + SET_VIEW.h) s = y + SET_H - SET_VIEW.h;
  return Math.max(0, Math.min(settingMaxScroll(rows), s));
}

/** A dynasty settings row on screen at `scroll`, or null when it's out of the window (a click there misses it). */
export function settingRowRect(rows: SettingRow[], i: number, scroll: number): Box | null {
  const y = SET_VIEW.y + settingLayout(rows).ys[i] - scroll;
  if (y + SET_H <= SET_VIEW.y || y >= SET_VIEW.y + SET_VIEW.h) return null;
  return { x: SET_X, y, w: SET_W, h: SET_H };
}

/** Whether a point is in the dynasty settings' scrolling window. */
export function inSettingView(x: number, y: number): boolean {
  return x >= SET_X && x < SET_X + SET_W + 10 && y >= SET_VIEW.y && y < SET_VIEW.y + SET_VIEW.h;
}

/**
 * `hub`: the dynasty's SETTINGS page (changes save as they're made) instead of a new dynasty's. The rows are
 * grouped under section headers and scroll in a window (`scroll`, kept on the picked row by `settingScrollTo`);
 * `note` is a line under the help (a setting another one pulled down).
 */
export function drawSettings(
  g: CanvasRenderingContext2D, t: Team, slot: number, rows: SettingRow[], sel: number, mx: number, my: number, hub = false, scroll = 0, note = '',
): void {
  g.fillStyle = t.colors.primary;
  g.fillRect(SET_X, 64, SET_W, 20);
  text(g, `${t.school.toUpperCase()} ${t.mascot.toUpperCase()}`.slice(0, 40), SET_X + 8, 70);
  text(g, `SLOT ${slot}`, SET_X + SET_W - 8, 70, { align: 'right', color: '#e6e6e6' });
  const L = settingLayout(rows);
  g.save();
  g.beginPath();
  g.rect(SET_X - 2, SET_VIEW.y, SET_W + 14, SET_VIEW.h);
  g.clip();
  for (const h of L.heads) {
    const y = SET_VIEW.y + h.y - scroll;
    text(g, h.label, SET_X + 2, y + 3, { size: 6, color: ACCENT, shadow: false });
    g.fillStyle = '#2a3546';
    g.fillRect(SET_X + 4 + h.label.length * 6 + 4, y + 5, SET_W - (h.label.length * 6 + 10), 1);
  }
  rows.forEach((row, i) => {
    const r = { x: SET_X, y: SET_VIEW.y + L.ys[i] - scroll, w: SET_W, h: SET_H };
    if (r.y + SET_H <= SET_VIEW.y || r.y >= SET_VIEW.y + SET_VIEW.h) return;
    const hot = i === sel;
    const live = inSettingView(mx, my);
    g.fillStyle = hot ? CARD_HOT : 'rgba(20,27,38,0.9)';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (hot) {
      g.fillStyle = GOLD;
      g.fillRect(r.x, r.y, 3, r.h);
    }
    text(g, row.label, r.x + 12, r.y + 4, { color: row.dim ? DIM : hot ? GOLD : '#ffffff' });
    const a = settingArrows(r);
    text(g, '<', a.prev.x + 10, r.y + 4, { align: 'center', color: live && inBox(a.prev, mx, my) ? GOLD : row.dim ? DIM : ACCENT });
    text(g, row.value, (a.prev.x + a.next.x + 20) / 2, r.y + 4, { align: 'center', color: row.dim ? DIM : '#ffffff' });
    text(g, '>', a.next.x + 10, r.y + 4, { align: 'center', color: live && inBox(a.next, mx, my) ? GOLD : row.dim ? DIM : ACCENT });
  });
  g.restore();
  // The scrollbar, and fades where there's more above or below.
  const max = settingMaxScroll(rows);
  if (max > 0) {
    const bx = SET_X + SET_W + 6;
    g.fillStyle = '#1a2230';
    g.fillRect(bx, SET_VIEW.y, 3, SET_VIEW.h);
    const th = Math.max(16, Math.round((SET_VIEW.h * SET_VIEW.h) / L.height));
    g.fillStyle = SOFT;
    g.fillRect(bx, SET_VIEW.y + Math.round(((SET_VIEW.h - th) * scroll) / max), 3, th);
    // A little arrow (drawn: the pixel font has none) where there's more above or below.
    const arrow = (y: number, up: boolean) => {
      g.fillStyle = SOFT;
      for (let k = 0; k < 3; k++) g.fillRect(bx + 1 - k, y + (up ? k : 2 - k), 1 + 2 * k, 1);
    };
    if (scroll > 0) arrow(SET_VIEW.y - 5, true);
    if (scroll < max) arrow(SET_VIEW.y + SET_VIEW.h + 2, false);
  }
  // The picked row's help: a line, and a second after a newline (what another setting does to it).
  const y = SET_VIEW.y + SET_VIEW.h + 10;
  const [help, more] = (rows[sel]?.help ?? '').split('\n');
  text(g, help, VIEW_W / 2, y, { align: 'center', color: SOFT, shadow: false });
  if (more) text(g, more, VIEW_W / 2, y + 11, { align: 'center', color: ACCENT, shadow: false });
  if (note) text(g, note, VIEW_W / 2, y + 22, { align: 'center', color: GOLD, shadow: false });
  if (hub) {
    goButton(g, 'DONE', inBox(GO_BTN, mx, my));
    drawHint(g, 'W/S: SETTING   A/D: CHANGE   WHEEL: SCROLL   V: SOUND   ESC: BACK');
    return;
  }
  goButton(g, 'START DYNASTY', inBox(GO_BTN, mx, my));
  drawHint(g, 'W/S: SETTING   A/D: CHANGE   WHEEL: SCROLL   ENTER: START   ESC: BACK');
}

// ------------------------------------------------------------ sound (the title's SETTINGS)

/** The sound page: a row for each volume (as a setting row, 0-10 with a bar), then the credits. */
export function drawAudioSettings(g: CanvasRenderingContext2D, rows: { label: string; value: number; help: string }[], sel: number, credits: { line: string; sub: string }[], mx: number, my: number): void {
  g.fillStyle = 'rgba(20,27,38,0.9)';
  g.fillRect(SET_X, 64, SET_W, 20);
  text(g, 'SOUND', SET_X + 8, 70, { color: GOLD });
  text(g, 'APPLIES TO EVERY GAME', SET_X + SET_W - 8, 70, { align: 'right', color: SOFT, shadow: false });
  rows.forEach((row, i) => {
    const r = settingRect(i);
    const hot = i === sel;
    g.fillStyle = hot ? CARD_HOT : 'rgba(20,27,38,0.9)';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (hot) {
      g.fillStyle = GOLD;
      g.fillRect(r.x, r.y, 3, r.h);
    }
    text(g, row.label, r.x + 12, r.y + 4, { color: hot ? GOLD : '#ffffff' });
    const a = settingArrows(i);
    text(g, '<', a.prev.x + 10, r.y + 4, { align: 'center', color: inBox(a.prev, mx, my) ? GOLD : ACCENT });
    text(g, '>', a.next.x + 10, r.y + 4, { align: 'center', color: inBox(a.next, mx, my) ? GOLD : ACCENT });
    // Ten pips between the arrows.
    const x0 = a.prev.x + 26;
    const span = a.next.x - 6 - x0;
    for (let k = 0; k < 10; k++) {
      g.fillStyle = k < row.value ? (hot ? GOLD : '#cfd6df') : '#2a3546';
      g.fillRect(Math.round(x0 + (k * span) / 10), r.y + 4, Math.floor(span / 10) - 3, 7);
    }
  });
  let y = SET_Y + rows.length * SET_STEP + 6;
  if (rows[sel]) text(g, rows[sel].help, VIEW_W / 2, y, { align: 'center', color: SOFT, shadow: false });
  y += 20;
  text(g, 'CREDITS', VIEW_W / 2, y, { align: 'center', color: GOLD });
  y += 14;
  for (const c of credits) {
    text(g, c.line, VIEW_W / 2, y, { align: 'center', color: '#ffffff', shadow: false });
    text(g, c.sub, VIEW_W / 2, y + 10, { align: 'center', color: DIM, shadow: false });
    y += 22;
  }
  goButton(g, 'DONE', inBox(GO_BTN, mx, my));
  drawHint(g, 'W/S: ROW   A/D: VOLUME   ENTER / ESC: BACK');
}
