import { athleteName } from '../data/depth';
import { teamById } from '../data/teams';
import type { NewsItem, SeasonState } from '../season/types';
import { squadFor } from '../season/world';
import { text, type TextOpts } from './text';

/**
 * Clickable names: team names open the team's program page, player names his card, scores the
 * game's page (render/gameScreen.ts). Screens draw a
 * link with `linkText` (or `drawRich` for a line of news), which registers its box for the frame;
 * `Game.render` clears them first, and a click in the next update reads them with `linkAt`.
 * The pixel font is monospaced: every character is `size` px wide.
 */

export type Link = { kind: 'team'; id: string } | { kind: 'player'; team: string; id: string } | { kind: 'game'; id: string };

interface LinkBox {
  x: number;
  y: number;
  w: number;
  h: number;
  link: Link;
}

const GOLD = '#ffd23f';
let boxes: LinkBox[] = [];
let mx = -1;
let my = -1;

/** A new frame: forget last frame's links, and where the mouse is now. */
export function beginLinks(x: number, y: number): void {
  boxes = [];
  mx = x;
  my = y;
}

const inside = (b: LinkBox, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** The link under (x, y) from the frame last drawn: the one drawn last wins. */
export function linkAt(x: number, y: number): Link | undefined {
  for (let i = boxes.length - 1; i >= 0; i--) if (inside(boxes[i], x, y)) return boxes[i].link;
  return undefined;
}

/** The mouse is over a link (the canvas shows a pointer). */
export const overLink = (): boolean => !!linkAt(mx, my);

/** Register a link's box without drawing; true when the mouse is over it. */
export function addLink(x: number, y: number, w: number, h: number, link: Link): boolean {
  const b = { x, y: y - 1, w, h: h + 2, link };
  boxes.push(b);
  return inside(b, mx, my);
}

/** A line of text that's a link: gold and underlined under the mouse. */
export function linkText(g: CanvasRenderingContext2D, s: string, x: number, y: number, o: TextOpts, link: Link | undefined): void {
  if (!link) {
    text(g, s, x, y, o);
    return;
  }
  const size = o.size ?? 8;
  const w = s.length * size;
  const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  const hot = addLink(x0, y, w, size, link);
  text(g, s, x, y, hot ? { ...o, color: GOLD } : o);
  if (hot) {
    g.fillStyle = GOLD;
    g.fillRect(Math.round(x0), Math.round(y) + size + 1, w, 1);
  }
}

export const teamLink = (id: string): Link => ({ kind: 'team', id });
export const playerLink = (team: string, id: string): Link => ({ kind: 'player', team, id });
export const gameLink = (id: string): Link => ({ kind: 'game', id });

/** A score in a line of news ("31-28", "31-28 (2OT)"). */
const SCORE = /\b\d+-\d+(?: \((?:\d*OT)\))?/;

/**
 * The span a news item's game links from: its score, or for a line with no score (a big game by a
 * player) what comes after the colon.
 */
export function gameSpan(s: string, game: string | undefined): Span | null {
  if (!game) return null;
  const m = SCORE.exec(s);
  if (m) return { start: m.index, len: m[0].length, link: gameLink(game) };
  const at = s.lastIndexOf(': ');
  return at >= 0 && at + 2 < s.length ? { start: at + 2, len: s.length - at - 2, link: gameLink(game) } : null;
}

// ------------------------------------------------------------ rich text: news with names in it

export interface Span {
  start: number;
  len: number;
  link: Link;
}

export interface RichLine {
  t: string;
  spans: Span[];
}

/** Stands in for a space inside a name while wrapping, so a name never breaks across lines. */
const NBSP = '\u0001';

/**
 * Every name in a line of news that can be a link: its teams' school names and abbreviations, and
 * its teams' players' full names. Longest first, so GEORGIA never matches inside GEORGIA TECH and
 * a player's name wins over his school's. Matched in upper case.
 */
export function findSpans(state: SeasonState, s: string, teams: string[]): Span[] {
  const up = s.toUpperCase();
  const cands: { name: string; link: Link }[] = [];
  for (const id of new Set(teams)) {
    const t = teamById(id);
    cands.push({ name: t.school.toUpperCase(), link: teamLink(id) });
    if (t.abbr.length >= 2) cands.push({ name: t.abbr.toUpperCase(), link: teamLink(id) });
    for (const a of squadFor(state, id).athletes) cands.push({ name: athleteName(a).toUpperCase(), link: playerLink(id, a.id) });
  }
  cands.sort((a, b) => b.name.length - a.name.length);
  const taken = new Uint8Array(up.length);
  const out: Span[] = [];
  const isWord = (c: string | undefined) => !!c && /[A-Z0-9]/.test(c);
  for (const c of cands) {
    if (!c.name) continue;
    let at = up.indexOf(c.name);
    while (at >= 0) {
      const end = at + c.name.length;
      // Whole words only, and not inside a longer match.
      if (!isWord(up[at - 1]) && !isWord(up[end]) && !taken.subarray(at, end).some((x) => x)) {
        taken.fill(1, at, end);
        out.push({ start: at, len: c.name.length, link: c.link });
      }
      at = up.indexOf(c.name, at + 1);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Wrap `s` to `n` characters per line (later lines indented two), keeping each span whole. */
export function wrapSpans(s: string, spans: Span[], n: number): RichLine[] {
  const chars = [...s];
  for (const sp of spans) for (let i = sp.start; i < sp.start + sp.len; i++) if (chars[i] === ' ') chars[i] = NBSP;
  const glued = chars.join('');
  // Where each word starts in the original.
  const words: { w: string; at: number }[] = [];
  let i = 0;
  for (const w of glued.split(' ')) {
    words.push({ w, at: i });
    i += w.length + 1;
  }
  const out: RichLine[] = [];
  let line = '';
  let map: number[] = [];
  const flush = () => {
    const spansIn: Span[] = [];
    for (const sp of spans) {
      const j = map.indexOf(sp.start);
      if (j >= 0) spansIn.push({ start: j, len: sp.len, link: sp.link });
    }
    out.push({ t: line.split(NBSP).join(' '), spans: spansIn });
  };
  for (const { w, at } of words) {
    if (line && (line + ' ' + w).length > n) {
      flush();
      line = '  ';
      map = [-1, -1];
    } else if (line) {
      line += ' ';
      map.push(-1);
    }
    for (let k = 0; k < w.length; k++) map.push(at + k);
    line += w;
  }
  if (line.trim()) flush();
  return out;
}

const cache = new WeakMap<SeasonState, Map<string, RichLine[]>>();

/** A news item as wrapped lines with its names linked (memoized per season state and text). */
export function newsRich(state: SeasonState, n: Pick<NewsItem, 'text' | 'teams' | 'game'>, width: number): RichLine[] {
  let m = cache.get(state);
  if (!m) cache.set(state, (m = new Map()));
  const key = `${width}|${n.teams.join(',')}|${n.game ?? ''}|${n.text}`;
  let lines = m.get(key);
  if (!lines) {
    const up = n.text.toUpperCase();
    const spans = findSpans(state, up, n.teams);
    const g = gameSpan(up, n.game);
    // The score's span, unless a name already covers it.
    if (g && !spans.some((sp) => sp.start < g.start + g.len && g.start < sp.start + sp.len)) {
      spans.push(g);
      spans.sort((a, b) => a.start - b.start);
    }
    lines = wrapSpans(up, spans, width);
    m.set(key, lines);
  }
  return lines;
}

const lineCache = new WeakMap<SeasonState, Map<string, RichLine>>();

/** One line of text, unwrapped, with its teams' and players' names linked (memoized). */
export function richText(state: SeasonState, t: string, teams: string[]): RichLine {
  let m = lineCache.get(state);
  if (!m) lineCache.set(state, (m = new Map()));
  const up = t.toUpperCase();
  const key = `${teams.join(',')}|${up}`;
  let l = m.get(key);
  if (!l) m.set(key, (l = { t: up, spans: findSpans(state, up, teams) }));
  return l;
}

/** A rich line at (x, y): its text, and its links (gold and underlined under the mouse). */
export function drawRich(g: CanvasRenderingContext2D, l: RichLine, x: number, y: number, o: TextOpts): void {
  text(g, l.t, x, y, o);
  const size = o.size ?? 8;
  for (const sp of l.spans) {
    const x0 = x + sp.start * size;
    const w = sp.len * size;
    if (!addLink(x0, y, w, size, sp.link)) continue;
    text(g, l.t.slice(sp.start, sp.start + sp.len), x0, y, { ...o, color: GOLD });
    g.fillStyle = GOLD;
    g.fillRect(Math.round(x0), Math.round(y) + size + 1, w, 1);
  }
}
