import { SLOT_SIZE } from '../data/office';
import { teamById, type Team } from '../data/teams';
import { achievement } from '../season/achievements';
import type { OfficeItem } from '../season/types';
import { outline } from './sprites';

/**
 * The coach's office items, drawn in code like the player sprites (render/sprites.ts): each item is
 * painted once onto a small canvas of its slot's size, outlined and cached by its key. The school it
 * was earned at gives its colors. A 3x5 micro font writes the scores, names and headlines that fit.
 * See docs/OFFICE.md.
 */

export type Px = (x: number, y: number, w: number, h: number, col: string) => void;

// ------------------------------------------------------------ micro font

const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '-': '000000111000000', '.': '000000000000010', '!': '010010010000010', "'": '010010000000000',
  '#': '101111101111101', ' ': '000000000000000',
};

/** Width of `s` in the micro font at `scale`. */
export const microWidth = (s: string, scale = 1): number => Math.max(0, s.length * 4 * scale - scale);

/** Write `s` in the 3x5 micro font; returns the width. Unknown characters are blanks. */
export function micro(P: Px, s: string, x: number, y: number, col: string, scale = 1): number {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const bits = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') P(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale, col);
    cx += 4 * scale;
  }
  return cx - x - scale;
}

/** `micro` centered on `cx`. */
export const microC = (P: Px, s: string, cx: number, y: number, col: string, scale = 1): number =>
  micro(P, s, Math.round(cx - microWidth(s, scale) / 2), y, col, scale);

// ------------------------------------------------------------ palette

const GOLD = ['#7a5410', '#b8860b', '#e8b923', '#ffe27a'];
const WOOD = ['#3b2414', '#5a3a1e', '#7a5230'];
const PAPER = '#efe6cf';
const INK = '#1c1c1c';

/** Darker or lighter by `k` (-1..1). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** A picture frame filling the canvas, `t` thick, and its mat inside. */
function frame(P: Px, w: number, h: number, cols: string[], mat?: string, t = 2): void {
  P(0, 0, w, h, cols[1]);
  P(0, 0, w, 1, cols[2]);
  P(0, 0, 1, h, cols[2]);
  P(0, h - 1, w, 1, cols[0]);
  P(w - 1, 0, 1, h, cols[0]);
  if (mat) P(t, t, w - 2 * t, h - 2 * t, mat);
}

// ------------------------------------------------------------ items

type Draw = (P: Px, w: number, h: number, it: OfficeItem, team: Team) => void;

/** The first win's ball on its stand. */
const gameball: Draw = (P) => {
  const B = '#7a3f1c', D = '#5b2c12', L = '#a45a2c';
  P(8, 2, 6, 1, B);
  P(5, 3, 12, 1, B);
  P(4, 4, 14, 1, B);
  P(3, 5, 16, 3, B);
  P(4, 8, 14, 1, D);
  P(5, 9, 12, 1, D);
  P(8, 10, 6, 1, D);
  P(6, 4, 8, 1, L);
  // Laces and the end stripes.
  P(8, 5, 6, 1, '#f4f1e8');
  for (let x = 8; x < 14; x += 2) P(x, 4, 1, 3, '#f4f1e8');
  P(5, 5, 1, 3, '#f4f1e8');
  P(16, 5, 1, 3, '#f4f1e8');
  // The stand.
  P(7, 11, 8, 1, WOOD[0]);
  P(4, 12, 14, 3, WOOD[1]);
  P(4, 12, 14, 1, WOOD[2]);
  P(8, 13, 6, 1, GOLD[2]);
};

/** A conference title: a gold cup on a black plinth, the school's ribbon on its stem, the year on the plate. */
const confCup: Draw = (P, w, h, it, team) => {
  const [d, m, b, hi] = GOLD;
  P(4, 1, 14, 2, b);
  P(4, 1, 14, 1, hi);
  P(5, 3, 12, 3, m);
  P(6, 6, 10, 2, m);
  P(7, 8, 8, 2, m);
  P(8, 10, 6, 1, d);
  P(6, 3, 2, 5, hi);
  // Handles.
  P(2, 3, 2, 1, m);
  P(1, 4, 1, 3, m);
  P(2, 7, 2, 1, m);
  P(18, 3, 2, 1, m);
  P(20, 4, 1, 3, m);
  P(18, 7, 2, 1, m);
  // Stem with the school's ribbon, then the foot.
  P(9, 11, 4, 5, m);
  P(10, 11, 1, 5, hi);
  P(8, 12, 6, 2, team.colors.primary);
  P(8, 13, 6, 1, shade(team.colors.primary, -0.35));
  P(6, 16, 10, 2, b);
  P(6, 16, 10, 1, hi);
  // Plinth and plate.
  P(3, 18, 16, 9, '#1b1b1f');
  P(3, 18, 16, 1, '#34343c');
  P(5, 20, 12, 6, GOLD[1]);
  microC(P, `'${String(it.year).slice(2)}`, 11, 20, '#3a2808');
};

/** Stop the Presses: the front page, framed. */
const paper: Draw = (P, w, h, it, team) => {
  frame(P, w, h, WOOD, PAPER, 2);
  microC(P, 'THE GAZETTE', w / 2, 4, INK);
  P(4, 10, w - 8, 1, INK);
  P(4, 12, w - 8, 1, '#8a8478');
  const word = Number(it.data?.us) - Number(it.data?.them) >= 40 ? 'BURY!' : 'ROUT!';
  microC(P, word, w / 2, 14, INK, 2);
  // The photo in the school's colors, the score beside it and the column.
  const py = h - 15;
  P(4, py, 17, 11, '#6e6a62');
  P(5, py + 4, 15, 7, shade(team.colors.primary, -0.2));
  P(10, py + 1, 5, 5, '#d9c3a0');
  micro(P, `${it.data?.us}-${it.data?.them}`, 24, py, INK);
  for (let y = py + 7; y < h - 3; y += 2) P(24, y, w - 28, 1, '#8a8478');
};

/** A first-round pick's jersey in a gold frame: name across the shoulders, number on the back. */
const jersey: Draw = (P, w, h, it, team) => {
  frame(P, w, h, GOLD, '#10141c', 2);
  const c = team.colors;
  const body = c.jerseyHome, trim = c.trimHome, dark = shade(c.jerseyHome, -0.3);
  // Sleeves, shoulders, body.
  P(4, 8, 6, 8, body);
  P(26, 8, 6, 8, body);
  P(4, 14, 6, 2, trim);
  P(26, 14, 6, 2, trim);
  P(8, 6, 20, 4, body);
  P(9, 10, 18, 26, body);
  P(9, 34, 18, 2, dark);
  P(15, 6, 6, 1, dark);
  const name = String(it.data?.name ?? '').split(' ').slice(-1)[0].slice(0, 5);
  microC(P, name, 18, 9, trim);
  const num = String(it.data?.num ?? '');
  microC(P, num, 18, 17, trim, 2);
  // The plate under it.
  P(12, h - 5, 12, 3, GOLD[2]);
};

/** Anything without its own art yet. */
const crate: Draw = (P, w, h) => {
  P(1, 1, w - 2, h - 2, '#9a7a4a');
  P(1, 1, w - 2, 2, '#b8955e');
  microC(P, '?', w / 2, Math.floor(h / 2) - 2, '#3b2414');
};

const DRAW: Record<string, Draw> = { gameball, conf: confCup, paper, jersey };

const cache = new Map<string, HTMLCanvasElement>();

/** An item's picture at its slot's size (where it's placed may be a fallback spot, so it's drawn to its own). */
export function itemSprite(it: OfficeItem): HTMLCanvasElement {
  const hit = cache.get(it.key);
  if (hit) return hit;
  const def = achievement(it.id);
  const size = SLOT_SIZE[def?.slot ?? 'shelf'];
  const c = document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  const g = c.getContext('2d')!;
  const P: Px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  (DRAW[it.id] ?? crate)(P, size.w, size.h, it, teamById(it.team));
  outline(g, size.w, size.h);
  cache.set(it.key, c);
  return c;
}
