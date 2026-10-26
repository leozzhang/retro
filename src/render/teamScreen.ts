import { archetypeLabel, classLabel, DEV_LABEL, heightLabel, type Athlete } from '../data/athletes';
import { confLabel } from '../data/confidence';
import { athleteName, fitRatings, healthOf, healthy, positionOrder, starters, teamRatings, type Squad } from '../data/depth';
import { overall, overallBreakdown, POSITIONS, type Position } from '../data/positions';
import { RATING_INFO, RATING_KEYS, type RatingKey } from '../data/ratings';
import { VIEW_W } from '../engine/constants';
import { CONFIDENCE, confOf } from '../season/confidence';
import { outText } from '../season/injuries';
import { LEVEL_XP, ratingChange, upgradedLastWeek, xpMultiplier } from '../season/progression';
import { records, recordText } from '../season/standings';
import type { Progress, SeasonState } from '../season/types';
import { drawHint } from './hud';
import { ovrColor, shortName, stars } from './rosterScreen';
import { text } from './text';

/**
 * The team page: a depth chart per position on the left (player tabs you drag to reorder, with the
 * injured below them in their own OUT section) and the selected player's card on the right (bio,
 * health or injury, level and XP, confidence, what makes up his overall and how each rating has grown,
 * what each rating does).
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
const ORANGE = '#ff9a5a';

// Layout, shared with the click handling in game.ts.
const TAB_Y = 32;
const TAB_H = 14;
const TAB_W = VIEW_W / POSITIONS.length;
export const LIST_X = 6;
export const LIST_W = 250;
export const LIST_TOP = 64;
export const ROW_H = 20;
/** Room for the OUT section's header between the available players and the injured. */
const OUT_GAP = 14;
const CARD_X = 264;
const CARD_R = VIEW_W - 6;
const CARD_TOP = 50;
const CARD_BOTTOM = 342;
const RATING_TOP = 153;
/** The confidence row, between the status line and the breakdown. */
const CONF_Y = CARD_TOP + 78;
const RATING_LINE = 11;
const GRID_COLS = 5;
/** The WK column: an up-arrow for a rating raised last week. */
const WK_X = CARD_R - 50;
const GRID_W = 72;
/** The DEPTH: YOURS / STAFF toggle in the header. */
export const DEPTH_BTN = { x: VIEW_W - 136, y: 17, w: 130, h: 11 };

export function tabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  return Math.min(POSITIONS.length - 1, Math.floor(x / TAB_W));
}

/**
 * A position's list as the page shows it: everyone who can play, in depth order, then the injured.
 * `full` maps each row to its index in `positionOrder`, which keeps the injured in their spots for
 * when they come back.
 */
export interface DepthView {
  rows: Athlete[];
  /** Rows before the OUT section. */
  avail: number;
  full: number[];
}

export function depthView(squad: Squad, pos: Position): DepthView {
  const order = positionOrder(squad, pos);
  const idx = order.map((_, i) => i);
  const up = idx.filter((i) => healthy(order[i]));
  const full = [...up, ...idx.filter((i) => !healthy(order[i]))];
  return { rows: full.map((i) => order[i]), avail: up.length, full };
}

/** The top of row `i`. */
export function rowY(i: number, avail: number): number {
  return LIST_TOP + i * ROW_H + (i >= avail ? OUT_GAP : 0);
}

/** The depth row under the mouse, or -1. */
export function rowAt(x: number, y: number, view: DepthView): number {
  if (x < LIST_X || x >= LIST_X + LIST_W || y < LIST_TOP) return -1;
  for (let i = 0; i < view.rows.length; i++) {
    const top = rowY(i, view.avail);
    if (y >= top && y < top + ROW_H) return i;
  }
  return -1;
}

/** Where a dragged tab lands among the available players: the row it takes once lifted out of `from`. */
export function dropIndex(y: number, from: number, avail: number): number {
  const gap = Math.max(0, Math.min(avail, Math.round((y - LIST_TOP) / ROW_H)));
  return gap > from ? gap - 1 : gap;
}

/**
 * A drag among the available rows as a move in the full position order (`reorderPosition`): the
 * player goes just ahead of whoever he was dropped on, or just behind the last available player.
 */
export function fullMove(view: DepthView, from: number, to: number): [number, number] {
  const f = view.full[from];
  const ups = view.full.slice(0, view.avail).filter((i) => i !== f).map((i) => (i > f ? i - 1 : i));
  const t = to < ups.length ? ups[to] : ups.length ? ups[ups.length - 1] + 1 : 0;
  return [f, t];
}

export function inBox(b: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function wrap(s: string, n: number): string[] {
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
    text(g, p, i * TAB_W + TAB_W / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : hurt ? ORANGE : SOFT, shadow: false });
  });

  const pos = POSITIONS[v.pos];
  const view = depthView(squad, pos);
  const prog = s.teamState[t.id]?.progress ?? {};
  const upped = new Set(view.rows.filter((a) => upgradedLastWeek(s, prog[a.id])).map((a) => a.id));
  drawDepth(g, view, slotOf, upped, v);
  const sel = view.rows[Math.min(v.sel, view.rows.length - 1)];
  const winPct = rec.w + rec.l ? rec.w / (rec.w + rec.l) : 0.5;
  if (sel) drawCard(g, s, sel, prog[sel.id], slotOf.get(sel.id), winPct, v);

  drawHint(g, 'DRAG: REORDER  A/D: POSITION  W/S: PLAYER  G: STAFF/YOURS  ESC: BACK');
}

function drawDepth(g: CanvasRenderingContext2D, view: DepthView, slotOf: Map<string, string>, upped: Set<string>, v: TeamView): void {
  const hy = LIST_TOP - 11;
  text(g, 'SLOT', LIST_X + 8, hy, { color: DIM, shadow: false });
  text(g, 'NO', LIST_X + 46, hy, { color: DIM, shadow: false });
  text(g, 'NAME', LIST_X + 78, hy, { color: DIM, shadow: false });
  text(g, 'POS', LIST_X + 196, hy, { color: DIM, shadow: false });
  text(g, 'OVR', LIST_X + LIST_W - 6, hy, { align: 'right', color: DIM, shadow: false });
  const dragging = v.drag?.moved ? v.drag : null;
  const { rows, avail } = view;
  rows.forEach((a, i) => {
    drawPlayerTab(g, a, i, slotOf.get(a.id), LIST_X, rowY(i, avail), {
      up: upped.has(a.id),
      selected: i === v.sel,
      ghost: dragging?.from === i,
      hover: !v.drag && rowAt(v.mx, v.my, view) === i,
    });
  });
  if (avail < rows.length) {
    const y = rowY(avail, avail) - OUT_GAP + 3;
    g.fillStyle = '#3a2228';
    g.fillRect(LIST_X + 104, y + 3, LIST_W - 104, 1);
    text(g, 'INJURED: OUT', LIST_X + 8, y, { color: RED, shadow: false });
  }
  if (!dragging) return;
  // The insertion line, then the lifted tab under the mouse.
  const to = dropIndex(v.my, dragging.from, avail);
  const gap = to >= dragging.from ? to + 1 : to;
  g.fillStyle = GOLD;
  g.fillRect(LIST_X, LIST_TOP + gap * ROW_H - 2, LIST_W, 2);
  const y = Math.max(LIST_TOP - ROW_H / 2, Math.min(LIST_TOP + (avail - 0.5) * ROW_H, v.my - ROW_H / 2));
  drawPlayerTab(g, rows[dragging.from], to, undefined, LIST_X + 4, y, { selected: true, ghost: false, hover: false, lifted: true });
}

function drawPlayerTab(
  g: CanvasRenderingContext2D,
  a: Athlete,
  rank: number,
  slot: string | undefined,
  x: number,
  y: number,
  o: { selected: boolean; ghost: boolean; hover: boolean; lifted?: boolean; up?: boolean },
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
  const hp = healthOf(a);
  const label = hurt ? (a.injury!.season ? 'SZN' : `${a.injury!.weeks}W`) : slot ?? String(rank + 1);
  text(g, label, x + 8, ty, { color: hurt ? RED : slot ? GOLD : DIM, shadow: false });
  text(g, `#${a.num}`, x + 46, ty, { color: SOFT, shadow: false });
  text(g, shortName(a, 14), x + 78, ty, { color: hurt ? RED : a.real ? GOLD : '#ffffff' });
  // Banged up: his health where his position goes.
  if (!hurt && hp < 100) text(g, `${hp}%`, x + 196, ty, { color: ORANGE, shadow: false });
  else text(g, a.pos, x + 196, ty, { color: SOFT, shadow: false });
  const o2 = overall(a.r, a.pos);
  text(g, String(o2), x + LIST_W - 6, ty, { align: 'right', color: hurt ? DIM : ovrColor(o2) });
  // Confidence: a chevron up (green) or down (red) when it's strong either way.
  const c = a.conf ?? 0;
  if (!hurt && Math.abs(c) >= CHEVRON) chevron(g, x + 189, ty + 2, c > 0);
  // Leveled up last week.
  if (o.up) upArrow(g, x + LIST_W - 30, ty);
  g.globalAlpha = 1;
}

/** A small green up-arrow, 7 px wide, its top-left at (x, y). */
function upArrow(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = GREEN;
  g.fillRect(x + 3, y, 1, 1);
  g.fillRect(x + 2, y + 1, 3, 1);
  g.fillRect(x + 1, y + 2, 5, 1);
  g.fillRect(x, y + 3, 7, 1);
  g.fillRect(x + 2, y + 4, 3, 4);
}

/** Confidence that earns a chevron on the depth list. */
const CHEVRON = 0.35;

/** A 5 px chevron, its top-left at (x, y): green pointing up, or red pointing down. */
function chevron(g: CanvasRenderingContext2D, x: number, y: number, up: boolean): void {
  g.fillStyle = up ? GREEN : RED;
  const rows = up ? [[2, 1], [1, 3], [0, 5]] : [[0, 5], [1, 3], [2, 1]];
  rows.forEach(([dx, w], i) => g.fillRect(x + dx, y + i, w, 1));
}

/**
 * The confidence row: a bar from -1 to +1 centered on 0, his label, and tags for a next-man-up spark
 * (on the field until it fades or locks in) and a breakout.
 */
function drawConf(g: CanvasRenderingContext2D, a: Athlete, p: Progress | undefined, x: number, y: number): void {
  const c = a.conf ?? 0;
  const color = c >= 0.2 ? GREEN : c <= -0.2 ? RED : '#cfd6df';
  text(g, 'CONF', x, y, { color: DIM, shadow: false });
  const bx = x + 40;
  const bw = 64;
  g.fillStyle = '#26324a';
  g.fillRect(bx, y + 1, bw, 6);
  const mid = bx + bw / 2;
  const len = Math.round((Math.abs(c) * bw) / 2);
  g.fillStyle = color;
  g.fillRect(c >= 0 ? mid : mid - len, y + 1, len, 6);
  g.fillStyle = '#cfd6df';
  g.fillRect(mid, y, 1, 8);
  text(g, confLabel(c), bx + bw + 6, y, { color, shadow: false });
  // A spark not yet in his stored confidence is the pending next-man-up spark for this game.
  const spark = (p?.sp ?? 0) > 0 || c - confOf(p) >= CONFIDENCE.spark / 2;
  let tx = bx + bw + 92;
  if (spark) {
    text(g, 'SPARK', tx, y, { color: GOLD, shadow: false });
    tx += 48;
  }
  if (p?.bo) text(g, `BREAKOUT ${p.bo}`, tx, y, { color: GOLD, shadow: false });
}

/** A dim flat line where an arrow would be: no change. */
function flatLine(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = DIM;
  g.fillRect(x, y + 3, 7, 2);
}

const CONF_BLURB = 'CONFIDENCE: HIS PLAY VS EXPECTATION LATELY. A SMALL EDGE, A BIGGER ONE ON KEY SNAPS.';

function drawCard(
  g: CanvasRenderingContext2D, s: SeasonState, a: Athlete, p: Progress | undefined, slot: string | undefined, winPct: number, v: TeamView,
): void {
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
  const h = healthOf(a);
  const sore = healthy(a) && h < 100;
  const playing = overall(fitRatings(a), a.pos);
  const start = slot ? `  STARTING ${slot}` : '';
  // Kept short of the XP bar; a banged-up starter's slot is on his tab.
  const status = !healthy(a) ? `${outText(a.injury!)}: ${a.injury!.type}` : sore ? `BANGED UP: ${h}% HEALTH` : `HEALTHY${start}`;
  text(g, status.slice(0, 30), x, CARD_TOP + 66, { color: !healthy(a) ? RED : sore ? ORANGE : GREEN });
  drawConf(g, a, p, x, CONF_Y);
  const overConf = v.mx >= CARD_X && v.mx < CARD_R && v.my >= CONF_Y - 1 && v.my < CONF_Y + 10;

  // The overall, big: what he plays at when he's banged up, with his healthy overall under it.
  text(g, String(sore ? playing : ovr), CARD_R - 10, CARD_TOP + 8, { size: 16, align: 'right', color: sore ? ORANGE : ovrColor(ovr) });
  text(g, sore ? `${a.pos} OVR (${ovr} HEALTHY)` : `${a.pos} OVR`, CARD_R - 10, CARD_TOP + 28, { align: 'right', color: DIM, shadow: false });
  if (a.real) text(g, 'REAL PLAYER', CARD_R - 10, CARD_TOP + 40, { align: 'right', color: GOLD, shadow: false });

  // Level, XP toward the next one, and the XP multiplier (hover for its parts).
  const mult = xpMultiplier(a, p, winPct, slot !== undefined);
  const lvlY = CARD_TOP + 54;
  text(g, `LVL ${p?.lvl ?? 0}  XP x${mult.total.toFixed(2)}`, CARD_R - 10, lvlY, { align: 'right', color: upgradedLastWeek(s, p) ? GREEN : '#cfd6df' });
  const barW = 96;
  g.fillStyle = '#26324a';
  g.fillRect(CARD_R - 10 - barW, lvlY + 12, barW, 5);
  g.fillStyle = ACCENT;
  g.fillRect(CARD_R - 10 - barW, lvlY + 12, Math.round((barW * Math.min(1, (p?.xp ?? 0) / LEVEL_XP[a.pos]))), 5);
  const overLvl = v.mx >= CARD_R - 10 - barW && v.mx < CARD_R && v.my >= lvlY - 1 && v.my < lvlY + 18;

  g.fillStyle = '#2a3647';
  g.fillRect(x, RATING_TOP - 14, CARD_R - CARD_X - 16, 1);

  // What the overall is made of: rating, weight in the overall, overall points against a 75.
  const parts = overallBreakdown(a.r, a.pos);
  text(g, 'OVR BREAKDOWN', x, RATING_TOP - 10, { color: DIM, shadow: false });
  text(g, 'RTG', x + 158, RATING_TOP - 10, { align: 'right', color: DIM, shadow: false });
  text(g, 'WT', x + 288, RATING_TOP - 10, { align: 'right', color: DIM, shadow: false });
  text(g, 'WK', WK_X - 4, RATING_TOP - 10, { color: DIM, shadow: false });
  text(g, 'ALL', CARD_R - 10, RATING_TOP - 10, { align: 'right', color: DIM, shadow: false });
  let hovered: RatingKey | null = null;
  parts.forEach((part, i) => {
    const y = RATING_TOP + i * RATING_LINE;
    const over = v.mx >= CARD_X && v.mx < CARD_R && v.my >= y - 1 && v.my < y + RATING_LINE - 1;
    if (over) {
      hovered = part.key;
      g.fillStyle = '#1f2a3a';
      g.fillRect(CARD_X + 2, y - 2, CARD_R - CARD_X - 4, RATING_LINE);
    }
    text(g, RATING_INFO[part.key].label.toUpperCase(), x, y, { color: '#ffffff', shadow: false });
    text(g, String(part.value), x + 158, y, { align: 'right', color: ovrColor(part.value), shadow: false });
    g.fillStyle = '#26324a';
    g.fillRect(x + 166, y + 1, 80, 6);
    g.fillStyle = ovrColor(part.value);
    g.fillRect(x + 166, y + 1, Math.round(80 * Math.min(99, part.value) / 99), 6);
    text(g, `${Math.round(part.share * 100)}%`, x + 288, y, { align: 'right', color: SOFT, shadow: false });
    // Up last week, and the all-time change.
    if (upgradedLastWeek(s, p, part.key)) upArrow(g, WK_X, y);
    else flatLine(g, WK_X, y);
    const all = ratingChange(p, part.key);
    text(g, all ? `+${all}` : '-', CARD_R - 10, y, { align: 'right', color: all ? GREEN : DIM, shadow: false });
  });

  // Everything else, small: it's real on the field, just not part of this position's overall.
  const inOvr = new Set(parts.map((p) => p.key));
  const rest = RATING_KEYS.filter((k) => !inOvr.has(k));
  const gy = RATING_TOP + parts.length * RATING_LINE + 3;
  text(g, 'OTHER RATINGS (NOT IN OVR)', x, gy, { color: DIM, shadow: false });
  rest.forEach((k, i) => {
    const cx = x + (i % GRID_COLS) * GRID_W;
    const y = gy + 11 + Math.floor(i / GRID_COLS) * RATING_LINE;
    const over = v.mx >= cx - 2 && v.mx < cx + GRID_W - 4 && v.my >= y - 1 && v.my < y + RATING_LINE - 1;
    if (over) {
      hovered = k;
      g.fillStyle = '#1f2a3a';
      g.fillRect(cx - 2, y - 2, GRID_W - 4, RATING_LINE);
    }
    text(g, k.toUpperCase(), cx, y, { color: DIM, shadow: false });
    text(g, String(a.r[k]), cx + 56, y, { align: 'right', color: ratingChange(p, k) ? GREEN : SOFT, shadow: false });
  });

  // What the hovered (or the heaviest) rating does, or what makes up the XP multiplier.
  const key: RatingKey = hovered ?? parts[0].key;
  const info = RATING_INFO[key];
  const blurb = overConf
    ? CONF_BLURB
    : overLvl
    ? `XP x${mult.total.toFixed(2)}: ROOM ${mult.headroom.toFixed(2)}  DEV ${mult.dev.toFixed(2)}  CONF ${mult.confidence.toFixed(2)}  MORALE ${mult.morale.toFixed(2)}  CLASS ${mult.year.toFixed(2)}${mult.potential < 1 ? `  AT POT ${mult.potential.toFixed(2)}` : ''}`
    : `${info.label.toUpperCase()}: ${info.blurb.toUpperCase()}`;
  const lines = wrap(blurb, 44).slice(0, 2);
  lines.forEach((l, i) => text(g, l, x, CARD_BOTTOM - 22 + i * 11, { color: hovered || overLvl || overConf ? '#ffffff' : SOFT, shadow: false }));
}
