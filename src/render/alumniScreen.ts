import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { noteHit } from '../engine/clicks';
import type { Input } from '../engine/input';
import {
  alumniList, epithet, isHof, legacyTier, LINE_GROUPS, numberLineage, numbersOf, peakOf, RECORD_CATS, recordBook,
  startersIn, TIER_LABEL, toggleHof, totalsOf, yearsText, type LegacyTier,
} from '../season/alumni';
import type { AlumPlaque, CareerRole, SeasonState } from '../season/types';
import { ovrColor } from './rosterScreen';
import { wrap } from './teamScreen';
import { text } from './text';

/**
 * THE LETTERMEN: the ALUMNI tab of the user's program page. Every player the user has coached, past
 * and present (season/alumni.ts). ROLL is the list with its filters and a plaque framed by his
 * legacy; RECORDS the program's leaders since the user arrived; NUMBERS each jersey's lineage;
 * TIMELINE the starters at each position, year by year. Display only. See docs/ALUMNI.md.
 */

export interface AlumniView {
  /** 0 ROLL, 1 RECORDS, 2 NUMBERS, 3 TIMELINE. */
  mode: number;
  show: number;
  /** Index into `LINE_GROUPS`, or -1 for all. */
  group: number;
  /** A season, or 0 for all. */
  year: number;
  /** Index into `ORIGINS`, 0 for all. */
  origin: number;
  hofOnly: boolean;
  sort: number;
  search: string;
  typing: boolean;
  /** The dropdown open on the filter bar, and the option under the keys in it. */
  open?: Pick;
  pick: number;
  sel?: string;
  /** Rows scrolled past; -1 scrolls to `sel` on the first draw. */
  scroll: number;
  cat: number;
  num: number;
  /** The timeline's first year column, from the first season. */
  col: number;
  mx: number;
  my: number;
  /** Last frame's clickable boxes. */
  hits: Hit[];
}

type Act =
  | { k: 'mode'; i: number } | { k: 'drop'; f: Pick } | { k: 'opt'; f: Pick; i: number } | { k: 'hofOnly' }
  | { k: 'row'; id: string } | { k: 'hof'; id: string } | { k: 'cat'; i: number } | { k: 'num'; n: number }
  | { k: 'open'; id: string } | { k: 'search' } | { k: 'clear' } | { k: 'menu' };
type Hit = { x: number; y: number; w: number; h: number; act: Act };
/** The filter bar's dropdowns. */
type Pick = 'show' | 'group' | 'year' | 'origin' | 'sort';

const MODES = ['ROLL', 'RECORDS', 'NUMBERS', 'TIMELINE'];
const SHOWS = ['PLAYED', 'FORMER', 'CURRENT', 'EVERYONE'];
const ORIGINS = ['ANY', 'SIGNED', 'INHERITED', 'TRANSFER', 'WALK-ON'] as const;
const ORIGIN_KEY = [undefined, 'signed', 'inherited', 'transfer', 'walkon'] as const;
const SORTS = ['LEGACY', 'PEAK', 'STARTS', 'NEWEST', 'YARDS', 'NAME'];

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';
const PANEL = '#151d29';
const ROW = '#151d29';

export const TIER_COLOR: Record<LegacyTier, string> = {
  roll: '#3a4556', letterman: '#8fa0b8', starter: '#d08a52', star: '#dfe6f0', legend: GOLD, hof: GOLD,
};

const TOP = 34;
const BAR_Y = 51;
const BAR_H = 12;
const BODY = 68;
const BOTTOM = 342;
const L_X = 6;
const L_W = 246;
const R_X = 258;
const R_W = VIEW_W - 6 - R_X;
const LINE = 11;
const ROW_H = 13;
const LIST_ROWS = Math.floor((BOTTOM - BODY - 24) / ROW_H);

/** A fresh view; on a player (from a link), the roll shows everyone so he's on it. */
export function newAlumniView(sel?: string): AlumniView {
  return {
    mode: 0, show: sel ? 3 : 0, group: -1, year: 0, origin: 0, hofOnly: false, sort: 0, search: '', typing: false, pick: 0, sel, scroll: sel ? -1 : 0,
    cat: 0, num: -1, col: -1, mx: 0, my: 0, hits: [],
  };
}

export const ALUMNI_HINT = 'V VIEW  W/S PLAYER  / SEARCH  F HALL OF FAME  CLICK A FILTER TO PICK  ESC BACK';
const TYPING_HINT = 'TYPE A NAME OR HOMETOWN  BACKSPACE DELETE  ENTER OR ESC DONE';
const MENU_HINT = 'CLICK OR W/S AND ENTER: PICK  ESC OR CLICK AWAY: CLOSE';

export function alumniHint(v: AlumniView): string {
  if (v.typing) return TYPING_HINT;
  if (v.open) return MENU_HINT;
  return v.mode === 0 ? ALUMNI_HINT : v.mode === 1 ? 'V VIEW  W/S CATEGORY  CLICK A NAME: HIS PLAQUE  ESC BACK'
    : v.mode === 2 ? 'V VIEW  WASD OR CLICK: NUMBER  CLICK A NAME: HIS PLAQUE  ESC BACK'
    : 'V VIEW  A/D OR WHEEL: YEARS  CLICK A NAME: HIS PLAQUE  ESC BACK';
}

/** True while the tab takes every key (a search being typed, a dropdown open), Esc included. */
export function alumniCaptures(v: AlumniView): boolean {
  return v.typing || !!v.open;
}

// ------------------------------------------------------------ the list

const lastYear = (p: AlumPlaque) => p.rows[p.rows.length - 1]?.year ?? 0;
const yards = (p: AlumPlaque) => {
  const t = totalsOf(p).st;
  return (t.passYds ?? 0) + (t.rushYds ?? 0) + (t.recYds ?? 0);
};
const played = (p: AlumPlaque) => p.rows.some((r) => r.gp);

function seasonsOf(list: AlumPlaque[]): number[] {
  return [...new Set(list.flatMap((p) => p.rows.map((r) => r.year)))].sort((a, b) => a - b);
}

/** The roll as the filters, the search and the sort leave it. */
export function filtered(s: SeasonState, v: AlumniView): AlumPlaque[] {
  const q = v.search.trim().toUpperCase();
  const out = alumniList(s).filter((p) => {
    if (v.show === 0 && !played(p)) return false;
    if (v.show === 1 && (!p.exit || !played(p))) return false;
    if (v.show === 2 && p.exit) return false;
    if (v.group >= 0 && !LINE_GROUPS[v.group].pos.includes(p.pos)) return false;
    if (v.year && !p.rows.some((r) => r.year === v.year)) return false;
    if (v.origin && p.origin !== ORIGIN_KEY[v.origin]) return false;
    if (v.hofOnly && !isHof(s, p.id)) return false;
    if (q && !`${p.name} ${p.home} ${epithet(s, p)}`.toUpperCase().includes(q)) return false;
    return true;
  });
  const by: ((a: AlumPlaque, b: AlumPlaque) => number)[] = [
    (a, b) => b.score - a.score,
    (a, b) => peakOf(b).ovr - peakOf(a).ovr,
    (a, b) => totalsOf(b).gs - totalsOf(a).gs,
    (a, b) => lastYear(b) - lastYear(a),
    (a, b) => yards(b) - yards(a),
    (a, b) => a.name.localeCompare(b.name),
  ];
  // The Hall of Fame leads a legacy sort.
  const hof = (p: AlumPlaque) => (v.sort === 0 && isHof(s, p.id) ? 1 : 0);
  return out.sort((a, b) => hof(b) - hof(a) || by[v.sort](a, b) || b.score - a.score || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------ input

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * The tab's input. Returns true when something saved needs writing (the Hall of Fame). Search typing
 * takes every key; otherwise W/S step the list, V the view, F the Hall of Fame, the wheel scrolls.
 */
export function updateAlumni(s: SeasonState, v: AlumniView, input: Input): boolean {
  const { x, y } = input.mouse;
  v.mx = x;
  v.my = y;
  if (v.typing) {
    if (input.hit('Enter', 'Escape', 'NumpadEnter')) v.typing = false;
    else if (input.hit('Backspace')) v.search = v.search.slice(0, -1);
    else {
      for (const L of LETTERS) if (input.hit(`Key${L}`) && v.search.length < 18) v.search += L;
      if (input.hit('Space') && v.search.length < 18) v.search += ' ';
      if (input.hit('Minus', 'Quote') && v.search.length < 18) v.search += input.hit('Minus') ? '-' : "'";
    }
    v.scroll = 0;
    if (!input.mouse.pressed) return false;
  }
  if (v.open) {
    const n = options(s, v, v.open).labels.length;
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0);
    if (step) v.pick = (v.pick + step + n) % n;
    if (input.hit('Enter', 'NumpadEnter', 'Space')) {
      choose(s, v, v.open, v.pick);
      return false;
    }
    if (input.hit('Escape', 'Backspace')) {
      v.open = undefined;
      return false;
    }
    if (!input.mouse.pressed && !input.mouse.rpressed) return false;
    const h = noteHit(x, y, [...v.hits].reverse().find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h));
    // A click on an option picks it; anywhere else closes the menu (its own field included).
    if (h?.act.k === 'opt') choose(s, v, h.act.f, h.act.i);
    else if (h?.act.k !== 'menu') v.open = undefined;
    return false;
  }
  if (input.hit('KeyV')) setMode(v, (v.mode + 1) % MODES.length);
  if (input.hit('Slash')) {
    setMode(v, 0);
    v.typing = true;
  }
  let saved = false;
  if (v.mode === 0) {
    const list = filtered(s, v);
    const at = Math.max(0, list.findIndex((p) => p.id === v.sel));
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0);
    if (step && list.length) {
      const i = (at + step + list.length) % list.length;
      v.sel = list[i].id;
      if (i < v.scroll) v.scroll = i;
      if (i >= v.scroll + LIST_ROWS) v.scroll = i - LIST_ROWS + 1;
    }
    if (input.mouse.wheel) v.scroll = Math.max(0, Math.min(Math.max(0, list.length - LIST_ROWS), v.scroll + input.mouse.wheel * 3));
    if (input.hit('KeyF')) {
      const p = list.find((q) => q.id === v.sel) ?? list[0];
      if (p) {
        toggleHof(s, p.id);
        saved = true;
      }
    }
  } else if (v.mode === 1) {
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0);
    if (step) v.cat = (v.cat + step + RECORD_CATS.length) % RECORD_CATS.length;
  } else if (v.mode === 2) {
    const step = (input.hit('KeyD', 'ArrowRight') ? 1 : 0) - (input.hit('KeyA', 'ArrowLeft') ? 1 : 0)
      + ((input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0)) * 10;
    if (step) v.num = ((v.num < 0 ? 0 : v.num) + step + 100) % 100;
  } else if (v.mode === 3) {
    const step = (input.hit('KeyD', 'ArrowRight') ? 1 : 0) - (input.hit('KeyA', 'ArrowLeft') ? 1 : 0) + input.mouse.wheel;
    if (step) v.col = Math.max(0, v.col + step);
  }
  if (!input.mouse.pressed) return saved;
  const h = noteHit(x, y, [...v.hits].reverse().find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h));
  if (!h) return saved;
  const a = h.act;
  if (a.k !== 'search') v.typing = false;
  if (a.k === 'mode') setMode(v, a.i);
  else if (a.k === 'drop') {
    v.open = a.f;
    v.pick = options(s, v, a.f).at;
  } else if (a.k === 'hofOnly') {
    v.hofOnly = !v.hofOnly;
    v.scroll = 0;
  } else if (a.k === 'clear') {
    v.search = '';
    v.scroll = 0;
  }
  else if (a.k === 'row') v.sel = a.id;
  else if (a.k === 'hof') {
    toggleHof(s, a.id);
    saved = true;
  } else if (a.k === 'cat') v.cat = a.i;
  else if (a.k === 'num') v.num = a.n;
  else if (a.k === 'search') v.typing = true;
  else if (a.k === 'open') openOn(s, v, a.id);
  return saved;
}

function setMode(v: AlumniView, i: number): void {
  v.mode = i;
  v.typing = false;
  v.open = undefined;
}

/** The roll on one player, the filters cleared so he's on it. */
function openOn(s: SeasonState, v: AlumniView, id: string): void {
  Object.assign(v, { mode: 0, show: 3, group: -1, year: 0, origin: 0, hofOnly: false, search: '', sel: id, typing: false, open: undefined });
  const i = filtered(s, v).findIndex((p) => p.id === id);
  v.scroll = Math.max(0, i - Math.floor(LIST_ROWS / 2));
}

/** A dropdown's choices and the one in force. */
function options(s: SeasonState, v: AlumniView, f: Pick): { labels: string[]; at: number } {
  if (f === 'show') return { labels: SHOWS, at: v.show };
  if (f === 'group') return { labels: ['ALL', ...LINE_GROUPS.map((x) => x.label)], at: v.group + 1 };
  if (f === 'origin') return { labels: [...ORIGINS], at: v.origin };
  if (f === 'sort') return { labels: SORTS, at: v.sort };
  const yrs = seasonsOf(alumniList(s));
  return { labels: ['ALL', ...yrs.map(String)], at: v.year ? yrs.indexOf(v.year) + 1 : 0 };
}

/** Picks a dropdown's option and closes it. */
function choose(s: SeasonState, v: AlumniView, f: Pick, i: number): void {
  if (f === 'show') v.show = i;
  else if (f === 'group') v.group = i - 1;
  else if (f === 'origin') v.origin = i;
  else if (f === 'sort') v.sort = i;
  else v.year = i ? seasonsOf(alumniList(s))[i - 1] : 0;
  v.open = undefined;
  v.scroll = 0;
}

// ------------------------------------------------------------ drawing

function hit(v: AlumniView, x: number, y: number, w: number, h: number, act: Act): void {
  v.hits.push({ x, y, w, h, act });
}

const over = (v: AlumniView, x: number, y: number, w: number, h: number) => v.mx >= x && v.mx < x + w && v.my >= y && v.my < y + h;

/** The views: tabs on a rule, the open one gold and underlined. */
function tabs(g: CanvasRenderingContext2D, v: AlumniView): void {
  g.fillStyle = '#1f2a3a';
  g.fillRect(L_X, TOP + 13, VIEW_W - 12, 1);
  let x = L_X;
  MODES.forEach((m, i) => {
    const w = m.length * 8 + 12;
    const on = v.mode === i;
    const hov = !on && over(v, x, TOP, w, 14);
    if (hov) {
      g.fillStyle = '#18202c';
      g.fillRect(x, TOP, w, 13);
    }
    text(g, m, x + w / 2, TOP + 3, { align: 'center', color: on ? GOLD : hov ? '#ffffff' : SOFT, shadow: on ? undefined : false });
    if (on) {
      g.fillStyle = GOLD;
      g.fillRect(x + 2, TOP + 12, w - 4, 2);
    }
    hit(v, x, TOP, w, 14, { k: 'mode', i });
    x += w + 4;
  });
}

/** A small down arrow, 5 wide. */
function caretDown(g: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x, y, 5, 1);
  g.fillRect(x + 1, y + 1, 3, 1);
  g.fillRect(x + 2, y + 2, 1, 1);
}

/** A box's outline. */
function outline(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/** Where each dropdown sits on the bar, for the menu to open under it. */
const fieldAt: Partial<Record<Pick, { x: number; w: number }>> = {};

/**
 * One dropdown: a dim label, then a box with the choice and an arrow. Gold when it narrows the roll
 * (or changes the order). Returns the next x.
 */
function field(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView, f: Pick, label: string, x: number, live: boolean): number {
  text(g, label, x, BAR_Y + 2, { color: over(v, x, BAR_Y, label.length * 8, BAR_H) ? SOFT : DIM, shadow: false });
  const bx = x + label.length * 8 + 3;
  const { labels, at } = options(s, v, f);
  const chars = Math.max(...(f === 'year' ? ['ALL', '2026'] : labels).map((l) => l.length));
  const w = chars * 8 + 20;
  const open = v.open === f;
  const hov = over(v, x, BAR_Y, bx + w - x, BAR_H);
  g.fillStyle = open ? '#22324a' : hov ? '#1f2a3a' : '#121922';
  g.fillRect(bx, BAR_Y, w, BAR_H);
  outline(g, bx, BAR_Y, w, BAR_H, open ? ACCENT : live ? '#6b5a1e' : '#2a3648');
  text(g, labels[at], bx + 5, BAR_Y + 2, { color: live ? GOLD : '#ffffff', shadow: false });
  caretDown(g, bx + w - 10, BAR_Y + 5, open ? ACCENT : SOFT);
  // The label opens it too.
  hit(v, x, BAR_Y, bx + w - x, BAR_H, open ? { k: 'menu' } : { k: 'drop', f });
  fieldAt[f] = { x: bx, w };
  return bx + w + 9;
}

/** The open dropdown's list, over everything, in columns when it runs long. */
function drawMenu(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView): void {
  const f = v.open;
  const at = f && fieldAt[f];
  if (!f || !at) return;
  const { labels, at: cur } = options(s, v, f);
  const RH = 13;
  const per = Math.max(1, Math.floor((BOTTOM - BAR_Y - BAR_H - 8) / RH));
  const cols = Math.ceil(labels.length / per);
  const rows = Math.ceil(labels.length / cols);
  const cw = Math.max(at.w, Math.max(...labels.map((l) => l.length)) * 8 + 22);
  const w = cols * cw + 4;
  const x = Math.min(at.x, VIEW_W - 6 - w);
  const y = BAR_Y + BAR_H + 1;
  const h = rows * RH + 4;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = '#0f1620';
  g.fillRect(x, y, w, h);
  outline(g, x, y, w, h, ACCENT);
  hit(v, x, y, w, h, { k: 'menu' });
  labels.forEach((l, i) => {
    const ox = x + 2 + Math.floor(i / rows) * cw;
    const oy = y + 2 + (i % rows) * RH;
    const hov = over(v, ox, oy, cw, RH);
    if (hov || i === v.pick) {
      g.fillStyle = hov ? '#2c3b52' : '#1f2a3a';
      g.fillRect(ox, oy, cw, RH);
    }
    if (i === cur) {
      g.fillStyle = GOLD;
      g.fillRect(ox + 4, oy + 5, 3, 3);
    }
    text(g, l, ox + 12, oy + 3, { color: i === cur ? GOLD : hov ? '#ffffff' : '#cfd6df', shadow: false });
    hit(v, ox, oy, cw, RH, { k: 'opt', f, i });
  });
}

/** The roll's bar: the filters on the left, the sort on the right. */
function filterBar(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView): void {
  let x = L_X;
  x = field(g, s, v, 'show', 'SHOW', x, v.show !== 0);
  x = field(g, s, v, 'group', 'POS', x, v.group >= 0);
  x = field(g, s, v, 'year', 'YEAR', x, !!v.year);
  x = field(g, s, v, 'origin', 'FROM', x, !!v.origin);
  // The Hall of Fame only: a checkbox.
  const hw = 4 * 8 + 15;
  const hov = over(v, x, BAR_Y, hw, BAR_H);
  g.fillStyle = hov ? '#1f2a3a' : '#121922';
  g.fillRect(x, BAR_Y, 11, BAR_H);
  outline(g, x, BAR_Y, 11, BAR_H, v.hofOnly ? '#6b5a1e' : '#2a3648');
  if (v.hofOnly) star(g, x + 2, BAR_Y + 3, GOLD);
  text(g, 'HALL', x + 15, BAR_Y + 2, { color: v.hofOnly ? GOLD : hov ? '#ffffff' : SOFT, shadow: false });
  hit(v, x, BAR_Y, hw, BAR_H, { k: 'hofOnly' });
  // The sort, set apart at the right.
  const sw = 'SORT'.length * 8 + 3 + 6 * 8 + 20;
  const sx = VIEW_W - 6 - sw;
  g.fillStyle = '#2a3648';
  g.fillRect(sx - 8, BAR_Y, 1, BAR_H);
  field(g, s, v, 'sort', 'SORT', sx, false);
}

/** The search box: / or a click to type, the X to clear it. */
function searchBox(g: CanvasRenderingContext2D, v: AlumniView, x: number, w: number): void {
  const y = TOP;
  const h = 12;
  g.fillStyle = v.typing ? '#22324a' : over(v, x, y, w, h) ? '#1f2a3a' : '#121922';
  g.fillRect(x, y, w, h);
  outline(g, x, y, w, h, v.typing ? ACCENT : '#2a3648');
  const caret = v.typing && Math.floor(Date.now() / 400) % 2 === 0 ? '_' : '';
  text(g, v.search || v.typing ? `${v.search}${caret}` : '/ SEARCH NAME, TOWN', x + 5, y + 2, { color: v.search || v.typing ? '#ffffff' : DIM, shadow: false });
  hit(v, x, y, w, h, { k: 'search' });
  if (v.search) {
    const cx = x + w - 12;
    text(g, 'X', cx + 2, y + 2, { color: over(v, cx, y, 12, h) ? RED : SOFT, shadow: false });
    hit(v, cx, y, 12, h, { k: 'clear' });
  }
}

/** A five-point star in pixels, 7 wide. */
function star(g: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  g.fillStyle = col;
  const rows = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'];
  rows.forEach((r, j) => [...r].forEach((c, i) => c === '#' && g.fillRect(x + i, y + j, 1, 1)));
}

export function drawAlumni(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView): void {
  v.hits = [];
  const list = alumniList(s);
  if (v.mode !== 0) v.open = undefined;
  tabs(g, v);
  if (v.mode === 0) searchBox(g, v, VIEW_W - 6 - 196, 196);
  else {
    const former = list.filter((p) => p.exit && played(p)).length;
    const legends = list.filter((p) => legacyTier(s, p) === 'legend').length;
    const hof = list.filter((p) => isHof(s, p.id)).length;
    text(g, `${former} LETTERMEN GONE  ${legends} LEGENDS  ${hof} IN THE HALL`, VIEW_W - 8, TOP + 3, { align: 'right', color: SOFT, shadow: false });
  }
  if (v.mode === 1) drawRecords(g, s, v, list);
  else if (v.mode === 2) drawNumbers(g, s, v, list);
  else if (v.mode === 3) drawTimeline(g, s, v, list);
  else {
    drawRoll(g, s, v);
    drawMenu(g, s, v);
  }
}

// ------------------------------------------------------------ ROLL

function drawRoll(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView): void {
  filterBar(g, s, v);

  const list = filtered(s, v);
  if (!list.some((p) => p.id === v.sel)) v.sel = list[0]?.id;
  // Opened on a player: his row in the middle of the list.
  if (v.scroll < 0) v.scroll = Math.max(0, list.findIndex((p) => p.id === v.sel) - Math.floor(LIST_ROWS / 2));
  v.scroll = Math.max(0, Math.min(v.scroll, Math.max(0, list.length - LIST_ROWS)));
  const hy = BODY;
  text(g, 'NO', L_X + 30, hy, { align: 'right', color: DIM, shadow: false });
  text(g, 'NAME', L_X + 36, hy, { color: DIM, shadow: false });
  text(g, 'POS', L_X + 152, hy, { color: DIM, shadow: false });
  text(g, 'YRS', L_X + 182, hy, { color: DIM, shadow: false });
  text(g, 'PK', L_X + L_W - 4, hy, { align: 'right', color: DIM, shadow: false });
  list.slice(v.scroll, v.scroll + LIST_ROWS).forEach((p, i) => {
    const y = BODY + 12 + i * ROW_H;
    const sel = p.id === v.sel;
    const tier = legacyTier(s, p);
    g.fillStyle = sel ? '#22324a' : over(v, L_X, y, L_W, ROW_H - 1) ? '#1a2535' : ROW;
    g.fillRect(L_X, y, L_W, ROW_H - 1);
    g.fillStyle = TIER_COLOR[tier];
    g.fillRect(L_X, y, tier === 'roll' || tier === 'letterman' ? 1 : 3, ROW_H - 1);
    const ty = y + 2;
    const now = !p.exit;
    text(g, String(p.num), L_X + 30, ty, { align: 'right', color: SOFT, shadow: false });
    text(g, p.name.toUpperCase().slice(0, 14), L_X + 36, ty, { color: tier === 'legend' || tier === 'hof' ? GOLD : now ? '#ffffff' : '#cfd6df', shadow: false });
    text(g, p.pos, L_X + 152, ty, { color: SOFT, shadow: false });
    const yrs = yearsText(p);
    text(g, yrs.slice(2), L_X + 182, ty, { color: now ? GREEN : SOFT, shadow: false });
    const pk = peakOf(p).ovr;
    text(g, String(pk), L_X + L_W - 4, ty, { align: 'right', color: ovrColor(pk), shadow: false });
    if (isHof(s, p.id)) star(g, L_X + 5, y + 3, GOLD);
    hit(v, L_X, y, L_W, ROW_H - 1, { k: 'row', id: p.id });
  });
  if (!list.length) text(g, alumniList(s).some((p) => p.exit) ? 'NOBODY FITS THOSE FILTERS.' : 'YOUR FIRST CLASS IS STILL HERE.', L_X + 8, BODY + 16, { color: DIM, shadow: false });
  else text(g, `${v.scroll + 1}-${Math.min(list.length, v.scroll + LIST_ROWS)} OF ${list.length}  GREEN: ON THE ROSTER`, L_X, BOTTOM - 9, { color: DIM, shadow: false });

  const p = list.find((q) => q.id === v.sel);
  if (p) drawPlaque(g, s, v, p, R_X, BODY - 2, R_W, BOTTOM - BODY + 2);
}

// ------------------------------------------------------------ the plaque

/** The frame by tier: a plain border, bronze, silver with rivets, gold with studs, and the Hall's shimmer. */
function frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tier: LegacyTier, team: string): void {
  const tc = teamById(team).colors;
  g.fillStyle = tier === 'hof' ? '#0a0b0e' : PANEL;
  g.fillRect(x, y, w, h);
  const ring = (inset: number, col: string, t = 1) => {
    g.fillStyle = col;
    g.fillRect(x + inset, y + inset, w - inset * 2, t);
    g.fillRect(x + inset, y + h - inset - t, w - inset * 2, t);
    g.fillRect(x + inset, y + inset, t, h - inset * 2);
    g.fillRect(x + w - inset - t, y + inset, t, h - inset * 2);
  };
  const corners = (inset: number, col: string, sz: number) => {
    g.fillStyle = col;
    for (const [cx, cy] of [[x + inset, y + inset], [x + w - inset - sz, y + inset], [x + inset, y + h - inset - sz], [x + w - inset - sz, y + h - inset - sz]]) g.fillRect(cx, cy, sz, sz);
  };
  if (tier === 'roll') ring(0, '#2a3647');
  else if (tier === 'letterman') ring(0, tc.primary, 2);
  else if (tier === 'starter') {
    ring(0, '#8a5530', 3);
    ring(1, '#d08a52');
    ring(5, '#5a3a22');
  } else if (tier === 'star') {
    ring(0, '#7d8796', 3);
    ring(1, '#eef3fa');
    ring(6, '#9aa5b4');
    corners(2, '#ffffff', 3);
    corners(8, '#9aa5b4', 2);
  } else {
    ring(0, '#a87a10', 4);
    ring(1, GOLD, 2);
    ring(7, '#c99a1e');
    ring(9, '#5a440c');
    // Studs along the top and the bottom.
    g.fillStyle = '#fff2a8';
    for (let sx = x + 14; sx < x + w - 14; sx += 16) {
      g.fillRect(sx, y + 2, 2, 2);
      g.fillRect(sx, y + h - 4, 2, 2);
    }
    corners(1, '#fff2a8', 5);
    corners(2, '#a87a10', 3);
    if (tier === 'hof') {
      // A glint that runs the border.
      const per = 2 * (w + h);
      const t = (Date.now() / 1000) * 140;
      for (let k = 0; k < 2; k++) {
        const d = (t + k * per / 2) % per;
        for (let j = -10; j <= 10; j++) {
          const q = (d + j + per) % per;
          const a = 1 - Math.abs(j) / 11;
          g.fillStyle = `rgba(255,255,240,${a.toFixed(2)})`;
          if (q < w) g.fillRect(x + q, y, 1, 4);
          else if (q < w + h) g.fillRect(x + w - 4, y + q - w, 4, 1);
          else if (q < 2 * w + h) g.fillRect(x + w - (q - w - h), y + h - 4, 1, 4);
          else g.fillRect(x, y + h - (q - 2 * w - h), 4, 1);
        }
      }
    }
  }
}

function heightText(inches: number): string {
  return `${Math.floor(inches / 12)}-${inches % 12}`;
}

function arrived(p: AlumPlaque): string {
  if (p.origin === 'transfer') return `TRANSFER FROM ${p.from ? teamById(p.from).abbr : 'THE PORTAL'}`;
  if (p.origin === 'walkon') return 'WALK-ON';
  if (p.origin === 'inherited') return `${p.stars}-STAR, ON THE ROSTER YOU INHERITED`;
  return `${p.stars}-STAR SIGNEE${p.rank ? ` (NO. ${p.rank} NATL)` : ''}`;
}

function left(p: AlumPlaque, cls?: string): { t: string; c: string } {
  const e = p.exit;
  if (!e) return { t: `ON THE ROSTER${cls ? `: ${cls}` : ''}`, c: GREEN };
  if (e.draft) return { t: `DRAFTED: RD ${e.draft.round}, NO. ${e.draft.pick}, ${e.draft.city.toUpperCase()}`, c: GOLD };
  if (e.kind === 'grad') return { t: `GRADUATED ${e.year}`, c: '#cfd6df' };
  if (e.kind === 'declare') return { t: `DECLARED ${e.year}, UNDRAFTED`, c: '#cfd6df' };
  if (e.kind === 'transfer') return { t: `TRANSFERRED TO ${e.to ? teamById(e.to).abbr : '?'} (${e.year})`, c: RED };
  return { t: `LEFT FBS (${e.year})`, c: RED };
}

const ROLE: Record<CareerRole, string> = { starter: 'STR', rotation: 'ROT', reserve: 'RES', dnp: 'DNP' };

/** The stat that tells his season. */
function keyStat(p: AlumPlaque, st: Partial<Record<string, number>>): string {
  const n = (k: string) => st[k] ?? 0;
  if (p.pos === 'QB' && n('att')) return `${n('passYds')}Y ${n('passTd')}TD`;
  if ((p.pos === 'HB' || p.pos === 'FB') && n('rush')) return `${n('rushYds')}Y ${n('rushTd')}TD`;
  if ((p.pos === 'WR' || p.pos === 'TE') && n('rec')) return `${n('rec')}C ${n('recYds')}Y`;
  if (p.pos === 'K' && n('fga')) return `${n('fgm')}/${n('fga')} FG`;
  if (n('sk') || n('defInt')) return [n('sk') ? `${n('sk')} SK` : '', n('defInt') ? `${n('defInt')} INT` : ''].filter(Boolean).join(' ');
  return '';
}

function totalsLine(p: AlumPlaque): string {
  const t = totalsOf(p);
  const n = (k: string) => (t.st as Record<string, number>)[k] ?? 0;
  const parts = [`${t.gp} GP`, `${t.gs} GS`];
  if (n('passYds')) parts.push(`${n('passYds')} PASS YDS`, `${n('passTd')} TD`);
  else if (n('rushYds') > 200) parts.push(`${n('rushYds')} RUSH YDS`, `${n('rushTd')} TD`);
  else if (n('recYds')) parts.push(`${n('rec')} REC`, `${n('recYds')} YDS`);
  else if (n('fga')) parts.push(`${n('fgm')}/${n('fga')} FG`);
  if (n('sk')) parts.push(`${n('sk')} SACKS`);
  if (n('defInt')) parts.push(`${n('defInt')} INT`);
  return parts.join('  ');
}

function drawPlaque(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView, p: AlumPlaque, x: number, y: number, w: number, h: number): void {
  const team = s.config.userTeamId;
  const tc = teamById(team).colors;
  const tier = legacyTier(s, p);
  frame(g, x, y, w, h, tier, team);
  const ix = x + 14;
  const right = x + w - 14;
  const hall = tier === 'hof';

  // The jersey: his number in the home colors.
  g.fillStyle = tc.jerseyHome;
  g.fillRect(ix, y + 14, 52, 42);
  g.fillStyle = tc.trimHome;
  g.fillRect(ix, y + 14, 52, 3);
  g.fillRect(ix + 18, y + 14, 16, 5);
  text(g, String(p.num), ix + 26, y + 25, { size: 16, align: 'center', color: tc.trimHome === tc.jerseyHome ? '#ffffff' : tc.trimHome, shadow: 'rgba(0,0,0,0.45)' });
  const nums = numbersOf(p).filter((n) => n !== p.num);
  if (nums.length) text(g, `ALSO #${nums.join(' #')}`, ix + 26, y + 59, { align: 'center', color: DIM, shadow: false });

  const nx = ix + 62;
  const parts = p.name.toUpperCase().split(' ');
  const first = parts.length > 1 ? parts[0] : '';
  const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
  text(g, first, nx, y + 15, { color: SOFT, shadow: false });
  const big = last.length * 16 <= right - nx;
  text(g, last, nx, y + 26, { size: big ? 16 : 8, color: tier === 'legend' || hall ? GOLD : '#ffffff' });
  const ep = epithet(s, p);
  if (ep) text(g, `"${ep}"`, nx, y + 46, { color: GOLD, shadow: false });
  text(g, TIER_LABEL[tier], right, y + 15, { align: 'right', color: TIER_COLOR[tier], shadow: false });

  let ly = y + 68;
  const live = !p.exit ? p.rows[p.rows.length - 1]?.cls : undefined;
  text(g, `${p.pos}  ${p.arch}  ${heightText(p.ht)} ${p.wt}`.slice(0, 44), ix, ly, { color: ACCENT, shadow: false });
  ly += LINE;
  text(g, `${p.home.toUpperCase()}  ${yearsText(p)}`.slice(0, 44), ix, ly, { color: '#cfd6df', shadow: false });
  ly += LINE;
  text(g, `IN:  ${arrived(p)}`.slice(0, 42), ix, ly, { color: SOFT, shadow: false });
  ly += LINE;
  const out = left(p, live);
  text(g, `OUT: ${out.t}`.slice(0, 42), ix, ly, { color: out.c, shadow: false });
  ly += LINE + 5;

  // The arc: his overall season by season, the peak in gold.
  const aw = 128;
  const ah = 40;
  g.fillStyle = hall ? '#15161b' : '#10161f';
  g.fillRect(ix, ly, aw, ah);
  const pts = [p.ovr0, ...p.rows.map((r) => r.ovr)];
  const lo = Math.min(...pts) - 3;
  const hi = Math.max(...pts) + 3;
  const px = (i: number) => ix + 6 + (pts.length > 1 ? (i * (aw - 12)) / (pts.length - 1) : (aw - 12) / 2);
  const py = (o: number) => ly + ah - 6 - ((o - lo) / Math.max(1, hi - lo)) * (ah - 14);
  g.fillStyle = '#2f4058';
  for (let i = 1; i < pts.length; i++) {
    const steps = 24;
    for (let k = 0; k <= steps; k++) g.fillRect(Math.round(px(i - 1) + ((px(i) - px(i - 1)) * k) / steps), Math.round(py(pts[i - 1]) + ((py(pts[i]) - py(pts[i - 1])) * k) / steps), 1, 1);
  }
  const peak = peakOf(p);
  pts.forEach((o, i) => {
    g.fillStyle = i > 0 && o === peak.ovr ? GOLD : i === 0 ? SOFT : '#9ad7ff';
    g.fillRect(Math.round(px(i)) - 1, Math.round(py(o)) - 1, 3, 3);
  });
  text(g, 'ARC', ix + 3, ly + 2, { color: DIM, shadow: false });
  text(g, `${p.ovr0}>${pts[pts.length - 1]}`, ix + aw - 3, ly + 2, { align: 'right', color: ovrColor(pts[pts.length - 1]), shadow: false });

  // Beside it: the calling card, the totals, the honors.
  const cx = ix + aw + 10;
  let cy = ly;
  text(g, `PEAK ${peak.ovr} IN ${peak.year}`, cx, cy, { color: ovrColor(peak.ovr), shadow: false });
  cy += LINE;
  for (const c of p.card) {
    text(g, c.slice(0, 26), cx, cy, { color: GREEN, shadow: false });
    cy += LINE;
  }
  for (const l of wrap(totalsLine(p), 26).slice(0, 2)) {
    text(g, l, cx, cy, { color: '#cfd6df', shadow: false });
    cy += LINE;
  }
  ly = Math.max(ly + ah + 6, cy + 3);
  const honors = p.honors.slice(0, 3);
  honors.forEach((hn) => {
    star(g, ix, ly + 1, /FINALIST/.test(hn) ? SOFT : GOLD);
    text(g, hn.slice(0, 42), ix + 10, ly, { color: /FINALIST/.test(hn) ? SOFT : GOLD, shadow: false });
    ly += LINE;
  });
  if (honors.length) ly += 3;

  // His seasons with the program.
  const col = { cls: ix + 40, role: ix + 88, gs: ix + 140, ovr: ix + 172 };
  const fit = Math.max(1, Math.min(4, Math.floor((y + h - 56 - ly) / LINE) - 1));
  text(g, 'YEAR', ix, ly, { color: DIM, shadow: false });
  text(g, 'CLS', col.cls, ly, { color: DIM, shadow: false });
  text(g, 'ROLE', col.role, ly, { color: DIM, shadow: false });
  text(g, 'GS', col.gs, ly, { align: 'right', color: DIM, shadow: false });
  text(g, 'OVR', col.ovr, ly, { color: DIM, shadow: false });
  ly += LINE;
  const rows = p.rows.slice(-fit);
  for (const r of rows) {
    const nowRow = !p.exit && r === p.rows[p.rows.length - 1] && r.year === s.year;
    text(g, String(r.year), ix, ly, { color: nowRow ? GREEN : '#ffffff', shadow: false });
    text(g, r.cls, col.cls, ly, { color: SOFT, shadow: false });
    text(g, ROLE[r.role], col.role, ly, { color: r.role === 'starter' ? GOLD : SOFT, shadow: false });
    text(g, String(r.gs ?? 0), col.gs, ly, { align: 'right', color: SOFT, shadow: false });
    text(g, String(r.ovr), col.ovr, ly, { color: ovrColor(r.ovr), shadow: false });
    text(g, keyStat(p, r.st ?? {}), right, ly, { align: 'right', color: '#cfd6df', shadow: false });
    ly += LINE;
  }
  if (p.rows.length > rows.length) text(g, `+${p.rows.length - rows.length} EARLIER`, right, ly - LINE * (rows.length + 1), { align: 'right', color: DIM, shadow: false });
  ly += 4;

  // His moments: the story lines the plaque kept.
  const bottom = y + h - 26;
  const lines: string[] = [];
  for (const e of p.lines) wrap(`'${String(e.year).slice(2)} ${e.text.toUpperCase()}`, 44).forEach((l, i) => lines.push(i ? `    ${l}` : l));
  for (const l of lines.slice(0, Math.max(0, Math.floor((bottom - ly) / 10)))) {
    text(g, l, ix, ly, { color: '#cfd6df', shadow: false });
    ly += 10;
  }

  // The Hall of Fame toggle.
  const on = isHof(s, p.id);
  const label = on ? 'IN THE HALL OF FAME' : 'ADD TO HALL OF FAME';
  const bw = label.length * 8 + 24;
  const bx = right - bw;
  const by = y + h - 22;
  const hov = over(v, bx, by, bw, 12);
  g.fillStyle = on ? '#3a2e08' : hov ? '#1f2a3a' : '#18202c';
  g.fillRect(bx, by, bw, 12);
  star(g, bx + 5, by + 3, on ? GOLD : hov ? '#ffffff' : DIM);
  text(g, label, bx + 16, by + 2, { color: on ? GOLD : hov ? '#ffffff' : SOFT, shadow: false });
  hit(v, bx, by, bw, 12, { k: 'hof', id: p.id });
}

// ------------------------------------------------------------ RECORDS

function drawRecords(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView, list: AlumPlaque[]): void {
  const since = seasonsOf(list)[0];
  text(g, since ? `THE PROGRAM'S RECORDS SINCE YOU ARRIVED IN ${since}` : 'NO SEASONS ON THE BOOKS YET', L_X, BAR_Y + 2, { color: SOFT, shadow: false });
  RECORD_CATS.forEach((c, i) => {
    const y = BODY + i * 24;
    const sel = i === v.cat;
    g.fillStyle = sel ? '#22324a' : over(v, L_X, y, L_W, 22) ? '#1a2535' : ROW;
    g.fillRect(L_X, y, L_W, 22);
    text(g, c.label, L_X + 6, y + 2, { color: sel ? GOLD : '#ffffff', shadow: false });
    const top = recordBook(list, c.key, 1).season[0];
    text(g, top ? `${top.name.toUpperCase().slice(0, 16)} ${top.value} '${top.when.slice(2)}` : '-', L_X + 6, y + 12, { color: SOFT, shadow: false });
    hit(v, L_X, y, L_W, 22, { k: 'cat', i });
  });
  const c = RECORD_CATS[v.cat];
  const book = recordBook(list, c.key, 10);
  const table = (title: string, rows: typeof book.season, y0: number) => {
    text(g, `${title}: ${c.label}`, R_X, y0, { color: ACCENT, shadow: false });
    rows.forEach((r, i) => {
      const y = y0 + 12 + i * LINE;
      const p = list.find((q) => q.id === r.id);
      const tier = p ? legacyTier(s, p) : 'roll';
      const hov = over(v, R_X, y - 1, R_W, LINE);
      if (hov) {
        g.fillStyle = '#1a2535';
        g.fillRect(R_X, y - 1, R_W, LINE);
      }
      text(g, `${i + 1}.`, R_X + 26, y, { align: 'right', color: DIM, shadow: false });
      text(g, r.name.toUpperCase().slice(0, 20), R_X + 32, y, { color: i === 0 ? GOLD : tier === 'legend' || tier === 'hof' ? '#ffe98a' : '#ffffff', shadow: false });
      text(g, r.pos, R_X + 196, y, { color: SOFT, shadow: false });
      text(g, String(r.value), R_X + 290, y, { align: 'right', color: '#ffffff', shadow: false });
      text(g, r.when, R_X + R_W - 2, y, { align: 'right', color: SOFT, shadow: false });
      hit(v, R_X, y - 1, R_W, LINE, { k: 'open', id: r.id });
    });
    if (!rows.length) text(g, 'NOBODY YET', R_X + 24, y0 + 12, { color: DIM, shadow: false });
  };
  table('SEASON', book.season, BODY);
  table('CAREER', book.career, BODY + 12 + 10 * LINE + 12);
}

// ------------------------------------------------------------ NUMBERS

function drawNumbers(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView, list: AlumPlaque[]): void {
  const lin = numberLineage(list);
  if (v.num < 0) v.num = [...lin.entries()].sort((a, b) => Math.max(...b[1].map((x) => x.p.score)) - Math.max(...a[1].map((x) => x.p.score)))[0]?.[0] ?? 0;
  text(g, 'EVERY NUMBER AND WHO WORE IT', L_X, BAR_Y + 2, { color: SOFT, shadow: false });
  const cw = 24;
  const ch = 26;
  const rank: Record<LegacyTier, number> = { roll: 0, letterman: 1, starter: 2, star: 3, legend: 4, hof: 5 };
  for (let n = 0; n < 100; n++) {
    const x = L_X + (n % 10) * cw;
    const y = BODY + Math.floor(n / 10) * ch;
    const who = lin.get(n) ?? [];
    const best = who.reduce<LegacyTier | undefined>((b, w) => {
      const t = legacyTier(s, w.p);
      return !b || rank[t] > rank[b] ? t : b;
    }, undefined);
    const sel = n === v.num;
    g.fillStyle = sel ? '#2c3b52' : over(v, x, y, cw - 2, ch - 2) ? '#1f2a3a' : who.length ? '#18202c' : '#10141b';
    g.fillRect(x, y, cw - 2, ch - 2);
    if (best && best !== 'roll' && best !== 'letterman') {
      g.fillStyle = TIER_COLOR[best];
      g.fillRect(x, y + ch - 4, cw - 2, 2);
    }
    text(g, String(n), x + (cw - 2) / 2, y + 5, { align: 'center', color: sel ? GOLD : who.length ? '#ffffff' : '#2f3a4a', shadow: false });
    if (who.length) text(g, String(who.length), x + (cw - 2) / 2, y + 14, { align: 'center', color: DIM, shadow: false, size: 8 });
    hit(v, x, y, cw - 2, ch - 2, { k: 'num', n });
  }
  // The lineage of the picked number.
  const who = lin.get(v.num) ?? [];
  const tc = teamById(s.config.userTeamId).colors;
  g.fillStyle = PANEL;
  g.fillRect(R_X, BODY - 2, R_W, BOTTOM - BODY + 2);
  g.fillStyle = tc.jerseyHome;
  g.fillRect(R_X + 10, BODY + 6, 44, 34);
  g.fillStyle = tc.trimHome;
  g.fillRect(R_X + 10, BODY + 6, 44, 3);
  text(g, String(v.num), R_X + 32, BODY + 16, { size: 16, align: 'center', color: tc.trimHome === tc.jerseyHome ? '#ffffff' : tc.trimHome, shadow: 'rgba(0,0,0,0.45)' });
  text(g, `NO. ${v.num}`, R_X + 64, BODY + 10, { color: '#ffffff' });
  text(g, who.length ? `${who.length} ${who.length === 1 ? 'PLAYER' : 'PLAYERS'} HAVE WORN IT` : 'NOBODY HAS WORN IT FOR YOU YET', R_X + 64, BODY + 24, { color: SOFT, shadow: false });
  who.slice(-18).forEach((w, i) => {
    const y = BODY + 50 + i * 15;
    const tier = legacyTier(s, w.p);
    const hov = over(v, R_X + 6, y - 2, R_W - 12, 14);
    g.fillStyle = hov ? '#1f2a3a' : '#18202c';
    g.fillRect(R_X + 6, y - 2, R_W - 12, 14);
    g.fillStyle = TIER_COLOR[tier];
    g.fillRect(R_X + 6, y - 2, 3, 14);
    const yrs = w.from === w.to ? String(w.from) : `${w.from}-${String(w.to).slice(2)}`;
    text(g, yrs, R_X + 14, y + 1, { color: SOFT, shadow: false });
    text(g, w.p.name.toUpperCase().slice(0, 18), R_X + 80, y + 1, { color: tier === 'legend' || tier === 'hof' ? GOLD : '#ffffff', shadow: false });
    text(g, w.p.pos, R_X + 232, y + 1, { color: SOFT, shadow: false });
    text(g, TIER_LABEL[tier], R_X + R_W - 10, y + 1, { align: 'right', color: TIER_COLOR[tier], shadow: false });
    hit(v, R_X + 6, y - 2, R_W - 12, 14, { k: 'open', id: w.p.id });
  });
}

// ------------------------------------------------------------ TIMELINE

function lastName(name: string): string {
  const w = name.toUpperCase().split(' ').filter((x) => !/^(JR|SR|II|III|IV|V)\.?$/.test(x));
  return w[w.length - 1] ?? name.toUpperCase();
}

function drawTimeline(g: CanvasRenderingContext2D, s: SeasonState, v: AlumniView, list: AlumPlaque[]): void {
  const years = seasonsOf(list);
  const lx = L_X + 34;
  const cw = 78;
  const cols = Math.floor((VIEW_W - 6 - lx) / cw);
  if (v.col < 0) v.col = Math.max(0, years.length - cols);
  v.col = Math.min(v.col, Math.max(0, years.length - cols));
  const shown = years.slice(v.col, v.col + cols);
  text(g, 'THE STARTERS, YEAR BY YEAR', L_X, BAR_Y + 2, { color: SOFT, shadow: false });
  if (years.length > cols) text(g, `A/D OR WHEEL: ${shown[0]}-${shown[shown.length - 1]} OF ${years[0]}-${years[years.length - 1]}`, VIEW_W - 8, BAR_Y + 2, { align: 'right', color: DIM, shadow: false });
  shown.forEach((yr, j) => text(g, String(yr), lx + j * cw + cw / 2, BODY, { align: 'center', color: yr === s.year && s.phase !== 'offseason' ? GREEN : ACCENT, shadow: false }));
  const rh = 26;
  LINE_GROUPS.forEach((grp, i) => {
    const y = BODY + 12 + i * rh;
    g.fillStyle = i % 2 ? '#121922' : '#151d29';
    g.fillRect(L_X, y, VIEW_W - 12, rh - 1);
    text(g, grp.label, L_X + 4, y + 8, { color: SOFT, shadow: false });
    shown.forEach((yr, j) => {
      const st = startersIn(list, grp.pos, yr);
      const x = lx + j * cw;
      const prev = j > 0 || v.col > 0 ? new Set(startersIn(list, grp.pos, years[v.col + j - 1]).map((p) => p.id)) : new Set<string>();
      st.slice(0, 2).forEach((p, k) => {
        const ty = y + 3 + k * 11;
        const tier = legacyTier(s, p);
        const name = lastName(p.name).slice(0, 8);
        // A new starter's name is bright; a returning one is softer.
        const col = tier === 'legend' || tier === 'hof' ? GOLD : tier === 'star' ? '#ffffff' : prev.has(p.id) ? SOFT : '#cfd6df';
        if (over(v, x + 2, ty - 1, cw - 4, 11)) {
          g.fillStyle = '#22324a';
          g.fillRect(x + 2, ty - 1, cw - 4, 11);
        }
        g.fillStyle = TIER_COLOR[tier];
        g.fillRect(x + 3, ty + 2, 2, 5);
        text(g, name, x + 8, ty, { color: col, shadow: false });
        hit(v, x + 2, ty - 1, cw - 4, 11, { k: 'open', id: p.id });
      });
      // More starters than shown: a dot each down the cell's edge.
      g.fillStyle = DIM;
      for (let k = 0; k < Math.min(6, st.length - 2); k++) g.fillRect(x + cw - 5, y + 4 + k * 3, 2, 2);
    });
  });
}
