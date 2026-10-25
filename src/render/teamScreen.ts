import { archetypeLabel, classLabel, DEV_LABEL, heightLabel, type Athlete } from '../data/athletes';
import { athleteName, healthy, positionOrder, starters, teamRatings, type Squad } from '../data/depth';
import { overall, overallBreakdown, POSITIONS } from '../data/positions';
import { RATING_INFO, RATING_KEYS, type RatingKey } from '../data/ratings';
import { VIEW_W } from '../engine/constants';
import { records, recordText } from '../season/standings';
import type { SeasonState } from '../season/types';
import { drawHint } from './hud';
import { ovrColor, shortName, stars } from './rosterScreen';
import { text } from './text';

/**
 * The team page: a depth chart per position on the left (player tabs you drag to reorder) and the
 * selected player's card on the right (bio, injury, what makes up his overall, what each rating does).
 */

export interface TeamView {
  /** Index into `POSITIONS`. */
  pos: number;
  /** Selected row in the position's depth order. */
  sel: number;
  /** A tab being dragged: the row it came from, and whether the mouse has moved far enough to count as a drag. */
  drag: { from: number; y0: number; moved: boolean } | null;
  mx: number;
  my: number;
}

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const RED = '#ff5a5a';
const GREEN = '#7dff9a';

// Layout, shared with the click handling in game.ts.
const TAB_Y = 32;
const TAB_H = 14;
const TAB_W = VIEW_W / POSITIONS.length;
export const LIST_X = 6;
export const LIST_W = 250;
export const LIST_TOP = 64;
export const ROW_H = 20;
const CARD_X = 264;
const CARD_R = VIEW_W - 6;
const CARD_TOP = 50;
const CARD_BOTTOM = 342;
const RATING_TOP = 142;
const RATING_LINE = 11;
const GRID_COLS = 5;
const GRID_W = 72;
/** The DEPTH: YOURS / STAFF toggle in the header. */
export const DEPTH_BTN = { x: VIEW_W - 136, y: 17, w: 130, h: 11 };

export function tabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  return Math.min(POSITIONS.length - 1, Math.floor(x / TAB_W));
}

/** The depth row under the mouse, or -1. */
export function rowAt(x: number, y: number, rows: number): number {
  if (x < LIST_X || x >= LIST_X + LIST_W || y < LIST_TOP) return -1;
  const i = Math.floor((y - LIST_TOP) / ROW_H);
  return i < rows ? i : -1;
}

/** Where a dragged tab lands: the row index it takes once it's lifted out of `from`. */
export function dropIndex(y: number, from: number, rows: number): number {
  const gap = Math.max(0, Math.min(rows, Math.round((y - LIST_TOP) / ROW_H)));
  return gap > from ? gap - 1 : gap;
}

export function inBox(b: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > n) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

export function drawTeam(g: CanvasRenderingContext2D, s: SeasonState, squad: Squad, v: TeamView): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const t = squad.team;
  const tr = teamRatings(squad);
  const rec = records(s).get(t.id)!;
  const userDepth = !s.config.delegate.depthChart;

  g.fillStyle = t.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${t.school.toUpperCase()} ${t.mascot.toUpperCase()}`, 10, 6, { size: 8 });
  text(g, `${recordText(rec)}  ${t.conference.toUpperCase()}`, 10, 18, { color: '#e6e6e6' });
  text(g, `OVR ${tr.ovr}  OFF ${tr.off}  DEF ${tr.def}  ST ${tr.st}`, VIEW_W - 10, 6, { align: 'right', color: GOLD });
  const hover = inBox(DEPTH_BTN, v.mx, v.my);
  text(g, `DEPTH: ${userDepth ? 'YOURS' : 'STAFF'}`, VIEW_W - 10, 18, { align: 'right', color: hover ? '#ffffff' : userDepth ? GREEN : '#e6e6e6' });

  // Position tabs; red when someone at the position is hurt.
  const st = starters(squad);
  const slotOf = new Map(Object.entries(st).map(([slot, a]) => [a.id, slot]));
  POSITIONS.forEach((p, i) => {
    const on = i === v.pos;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * TAB_W, TAB_Y, TAB_W, TAB_H);
    }
    const hurt = squad.athletes.some((a) => a.pos === p && !healthy(a));
    text(g, p, i * TAB_W + TAB_W / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : hurt ? '#ff9a5a' : SOFT, shadow: false });
  });

  const pos = POSITIONS[v.pos];
  const order = positionOrder(squad, pos);
  drawDepth(g, order, slotOf, v);
  const sel = order[Math.min(v.sel, order.length - 1)];
  if (sel) drawCard(g, sel, slotOf.get(sel.id), v);

  drawHint(g, 'DRAG: REORDER  A/D: POSITION  W/S: PLAYER  G: STAFF/YOURS  ESC: BACK');
}

function drawDepth(g: CanvasRenderingContext2D, order: Athlete[], slotOf: Map<string, string>, v: TeamView): void {
  const hy = LIST_TOP - 11;
  text(g, 'SLOT', LIST_X + 8, hy, { color: DIM, shadow: false });
  text(g, 'NO', LIST_X + 46, hy, { color: DIM, shadow: false });
  text(g, 'NAME', LIST_X + 78, hy, { color: DIM, shadow: false });
  text(g, 'POS', LIST_X + 196, hy, { color: DIM, shadow: false });
  text(g, 'OVR', LIST_X + LIST_W - 6, hy, { align: 'right', color: DIM, shadow: false });
  const dragging = v.drag?.moved ? v.drag : null;
  order.forEach((a, i) => {
    const y = LIST_TOP + i * ROW_H;
    drawPlayerTab(g, a, i, slotOf.get(a.id), LIST_X, y, {
      selected: i === v.sel,
      ghost: dragging?.from === i,
      hover: !v.drag && rowAt(v.mx, v.my, order.length) === i,
    });
  });
  if (!dragging) return;
  // The insertion line, then the lifted tab under the mouse.
  const to = dropIndex(v.my, dragging.from, order.length);
  const gap = to >= dragging.from ? to + 1 : to;
  g.fillStyle = GOLD;
  g.fillRect(LIST_X, LIST_TOP + gap * ROW_H - 2, LIST_W, 2);
  const y = Math.max(LIST_TOP - ROW_H / 2, Math.min(LIST_TOP + (order.length - 0.5) * ROW_H, v.my - ROW_H / 2));
  drawPlayerTab(g, order[dragging.from], to, undefined, LIST_X + 4, y, { selected: true, ghost: false, hover: false, lifted: true });
}

function drawPlayerTab(
  g: CanvasRenderingContext2D,
  a: Athlete,
  rank: number,
  slot: string | undefined,
  x: number,
  y: number,
  o: { selected: boolean; ghost: boolean; hover: boolean; lifted?: boolean },
): void {
  const h = ROW_H - 2;
  if (o.lifted) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 3, y + 3, LIST_W, h);
  }
  g.globalAlpha = o.ghost ? 0.3 : 1;
  g.fillStyle = o.lifted ? '#2c3b52' : o.selected ? '#22324a' : o.hover ? '#1a2535' : '#151d29';
  g.fillRect(x, y, LIST_W, h);
  if (o.selected) {
    g.strokeStyle = o.lifted ? GOLD : '#4a6a92';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, LIST_W - 1, h - 1);
  }
  // Starters get a colored strip.
  if (slot) {
    g.fillStyle = '#ffd23f';
    g.fillRect(x, y, 3, h);
  }
  const ty = y + 5;
  const hurt = !healthy(a);
  const label = hurt ? 'OUT' : slot ?? String(rank + 1);
  text(g, label, x + 8, ty, { color: hurt ? RED : slot ? GOLD : DIM, shadow: false });
  text(g, `#${a.num}`, x + 46, ty, { color: SOFT, shadow: false });
  text(g, shortName(a, 14), x + 78, ty, { color: hurt ? RED : a.real ? GOLD : '#ffffff' });
  text(g, a.pos, x + 196, ty, { color: SOFT, shadow: false });
  const o2 = overall(a.r, a.pos);
  text(g, String(o2), x + LIST_W - 6, ty, { align: 'right', color: ovrColor(o2) });
  g.globalAlpha = 1;
}

function drawCard(g: CanvasRenderingContext2D, a: Athlete, slot: string | undefined, v: TeamView): void {
  g.fillStyle = '#151d29';
  g.fillRect(CARD_X, CARD_TOP, CARD_R - CARD_X, CARD_BOTTOM - CARD_TOP);
  const x = CARD_X + 8;
  const ovr = overall(a.r, a.pos);

  // Bio.
  text(g, athleteName(a).toUpperCase().slice(0, 34), x, CARD_TOP + 6, { color: a.real ? GOLD : '#ffffff' });
  text(g, `#${a.num}  ${a.pos}  ${archetypeLabel(a).toUpperCase()}`, x, CARD_TOP + 18, { color: ACCENT });
  text(g, `${classLabel(a)}   ${heightLabel(a.heightIn)}  ${a.weightLb} LB`, x, CARD_TOP + 30, { color: '#cfd6df' });
  text(g, `${a.hometown.city}, ${a.hometown.state}`.toUpperCase().slice(0, 34), x, CARD_TOP + 42, { color: '#cfd6df' });
  text(g, stars(a.stars), x, CARD_TOP + 54, { color: GOLD, shadow: false });
  text(g, `POT ${a.potential}  DEV ${DEV_LABEL[a.dev].toUpperCase()}`, x + 48, CARD_TOP + 54, { color: '#cfd6df' });
  const status = !healthy(a) ? `OUT ${a.injury!.weeks} WEEK${a.injury!.weeks === 1 ? '' : 'S'}` : slot ? `HEALTHY  STARTING ${slot}` : 'HEALTHY';
  text(g, status, x, CARD_TOP + 66, { color: healthy(a) ? GREEN : RED });

  // The overall, big.
  text(g, String(ovr), CARD_R - 10, CARD_TOP + 8, { size: 16, align: 'right', color: ovrColor(ovr) });
  text(g, `${a.pos} OVR`, CARD_R - 10, CARD_TOP + 28, { align: 'right', color: DIM, shadow: false });
  if (a.real) text(g, 'REAL PLAYER', CARD_R - 10, CARD_TOP + 40, { align: 'right', color: GOLD, shadow: false });

  g.fillStyle = '#2a3647';
  g.fillRect(x, RATING_TOP - 14, CARD_R - CARD_X - 16, 1);

  // What the overall is made of: rating, weight in the overall, overall points against a 75.
  const parts = overallBreakdown(a.r, a.pos);
  text(g, 'OVR BREAKDOWN', x, RATING_TOP - 10, { color: DIM, shadow: false });
  text(g, 'RTG', x + 158, RATING_TOP - 10, { align: 'right', color: DIM, shadow: false });
  text(g, 'WT', x + 288, RATING_TOP - 10, { align: 'right', color: DIM, shadow: false });
  text(g, '+/-', CARD_R - 10, RATING_TOP - 10, { align: 'right', color: DIM, shadow: false });
  let hovered: RatingKey | null = null;
  parts.forEach((p, i) => {
    const y = RATING_TOP + i * RATING_LINE;
    const over = v.mx >= CARD_X && v.mx < CARD_R && v.my >= y - 1 && v.my < y + RATING_LINE - 1;
    if (over) {
      hovered = p.key;
      g.fillStyle = '#1f2a3a';
      g.fillRect(CARD_X + 2, y - 2, CARD_R - CARD_X - 4, RATING_LINE);
    }
    text(g, RATING_INFO[p.key].label.toUpperCase(), x, y, { color: '#ffffff', shadow: false });
    text(g, String(p.value), x + 158, y, { align: 'right', color: ovrColor(p.value), shadow: false });
    g.fillStyle = '#26324a';
    g.fillRect(x + 166, y + 1, 80, 6);
    g.fillStyle = ovrColor(p.value);
    g.fillRect(x + 166, y + 1, Math.round(80 * Math.min(99, p.value) / 99), 6);
    text(g, `${Math.round(p.share * 100)}%`, x + 288, y, { align: 'right', color: SOFT, shadow: false });
    const d = p.delta;
    const ds = `${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
    text(g, ds, CARD_R - 10, y, { align: 'right', color: d >= 0.05 ? GREEN : d <= -0.05 ? '#ff7a7a' : SOFT, shadow: false });
  });

  // Everything else, small: it's real on the field, just not part of this position's overall.
  const inOvr = new Set(parts.map((p) => p.key));
  const rest = RATING_KEYS.filter((k) => !inOvr.has(k));
  const gy = RATING_TOP + parts.length * RATING_LINE + 6;
  text(g, 'OTHER RATINGS (NOT IN OVR)', x, gy, { color: DIM, shadow: false });
  rest.forEach((k, i) => {
    const cx = x + (i % GRID_COLS) * GRID_W;
    const y = gy + 12 + Math.floor(i / GRID_COLS) * RATING_LINE;
    const over = v.mx >= cx - 2 && v.mx < cx + GRID_W - 4 && v.my >= y - 1 && v.my < y + RATING_LINE - 1;
    if (over) {
      hovered = k;
      g.fillStyle = '#1f2a3a';
      g.fillRect(cx - 2, y - 2, GRID_W - 4, RATING_LINE);
    }
    text(g, k.toUpperCase(), cx, y, { color: DIM, shadow: false });
    text(g, String(a.r[k]), cx + 56, y, { align: 'right', color: SOFT, shadow: false });
  });

  // What the hovered (or the heaviest) rating does.
  const key: RatingKey = hovered ?? parts[0].key;
  const info = RATING_INFO[key];
  const lines = wrap(`${info.label.toUpperCase()}: ${info.blurb.toUpperCase()}`, 44).slice(0, 2);
  lines.forEach((l, i) => text(g, l, x, CARD_BOTTOM - 24 + i * 11, { color: hovered ? '#ffffff' : SOFT, shadow: false }));
}
