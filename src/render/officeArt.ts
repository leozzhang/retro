import { SLOT_SIZE } from '../data/office';
import { teamById, type Team } from '../data/teams';
import { hashString, mulberry32 } from '../engine/math';
import { achievement, levelOf, maxLevel, STATE_NAME } from '../season/achievements';
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
  '#': '101111101111101', '?': '111001010000010', ':': '000010000010000', '/': '001001010100100', '+': '000010111010000',
  ' ': '000000000000000',
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

/** `lv` is a leveled item's level (1 up), `top` its last; a one-of-a-kind item is 1 of 1. */
type Draw = (P: Px, w: number, h: number, it: OfficeItem, team: Team, lv: number, top: number) => void;

const SILVER = ['#5a5f68', '#8c929c', '#c4c9d1', '#eef1f5'];
const BRONZE = ['#4a2a12', '#7a4a22', '#a86a34', '#d39a5c'];
const CORK = '#b88a55';

/** A leveled frame: wood, then silver, then gold; the top level adds gold corner studs. */
function tierFrame(lv: number, top: number): string[] {
  if (lv >= top && top > 1) return GOLD;
  if (lv >= Math.ceil((top + 1) / 2) && top > 1) return SILVER;
  return WOOD;
}
function studs(P: Px, w: number, h: number, lv: number, top: number): void {
  if (lv < top || top < 2) return;
  for (const [x, y] of [[0, 0], [w - 3, 0], [0, h - 3], [w - 3, h - 3]]) {
    P(x, y, 3, 3, GOLD[3]);
    P(x + 1, y + 1, 1, 1, GOLD[0]);
  }
}
const second = (t: Team) => (t.colors.secondary === t.colors.primary ? '#ffffff' : t.colors.secondary);

/** A small helmet facing right, in a team's colors; `k` scales it. */
function helmet(P0: Px, x0: number, y0: number, t: Team, k = 1): void {
  const P: Px = (x, y, w, h, col) => P0(x0 + (x - x0) * k, y0 + (y - y0) * k, w * k, h * k, col);
  const x = x0, y = y0;
  const c = t.colors;
  P(x + 2, y, 8, 1, c.helmet);
  P(x + 1, y + 1, 10, 1, c.helmet);
  P(x, y + 2, 12, 5, c.helmet);
  P(x + 1, y + 7, 7, 2, c.helmet);
  P(x + 3, y + 1, 6, 1, shade(c.helmet, 0.35));
  P(x + 5, y, 2, 7, c.stripe);
  P(x + 3, y + 4, 2, 2, c.logo);
  // The facemask.
  P(x + 10, y + 4, 4, 1, c.mask);
  P(x + 10, y + 6, 4, 1, c.mask);
  P(x + 13, y + 4, 1, 5, c.mask);
  P(x + 9, y + 8, 3, 1, shade(c.helmet, -0.4));
}

/** A newspaper's front page in a box. */
function page(P: Px, x: number, y: number, w: number, h: number, it: OfficeItem, team: Team, full: boolean): void {
  P(x, y, w, h, PAPER);
  P(x, y, w, 1, '#fff8e6');
  microC(P, full ? 'THE GAZETTE' : 'GAZETTE', x + w / 2, y + 2, INK);
  P(x + 2, y + 8, w - 4, 1, INK);
  const word = Number(it.data?.us) - Number(it.data?.them) >= 40 ? 'BURY!' : 'ROUT!';
  microC(P, word, x + w / 2, y + 11, INK, w >= 44 ? 2 : 1);
  const py = y + h - 13;
  P(x + 2, py, 15, 10, '#6e6a62');
  P(x + 3, py + 4, 13, 6, shade(team.colors.primary, -0.2));
  P(x + 7, py + 1, 5, 4, '#d9c3a0');
  if (w - 21 >= 15) micro(P, `${it.data?.us}-${it.data?.them}`, x + 20, py, INK);
  for (let ly = py + 7; ly < y + h - 2; ly += 2) P(x + 20, ly, w - 22, 1, '#8a8478');
}

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
  P(8, 5, 6, 1, '#f4f1e8');
  for (let x = 8; x < 14; x += 2) P(x, 4, 1, 3, '#f4f1e8');
  P(5, 5, 1, 3, '#f4f1e8');
  P(16, 5, 1, 3, '#f4f1e8');
  P(7, 11, 8, 1, WOOD[0]);
  P(4, 12, 14, 3, WOOD[1]);
  P(4, 12, 14, 1, WOOD[2]);
  P(8, 13, 6, 1, GOLD[2]);
};

/** A conference title: a gold cup on a black plinth, the school's ribbon on its stem, the year on the plate. */
const confCup: Draw = (P, w, h, it, team) => {
  const [dk, m, b, hi] = GOLD;
  P(4, 1, 14, 2, b);
  P(4, 1, 14, 1, hi);
  P(5, 3, 12, 3, m);
  P(6, 6, 10, 2, m);
  P(7, 8, 8, 2, m);
  P(8, 10, 6, 1, dk);
  P(6, 3, 2, 5, hi);
  P(2, 3, 2, 1, m);
  P(1, 4, 1, 3, m);
  P(2, 7, 2, 1, m);
  P(18, 3, 2, 1, m);
  P(20, 4, 1, 3, m);
  P(18, 7, 2, 1, m);
  P(9, 11, 4, 5, m);
  P(10, 11, 1, 5, hi);
  P(8, 12, 6, 2, team.colors.primary);
  P(8, 13, 6, 1, shade(team.colors.primary, -0.35));
  P(6, 16, 10, 2, b);
  P(6, 16, 10, 1, hi);
  P(3, 18, 16, 9, '#1b1b1f');
  P(3, 18, 16, 1, '#34343c');
  P(5, 20, 12, 6, GOLD[1]);
  microC(P, `'${String(it.year).slice(2)}`, 11, 20, '#3a2808');
};

/** The national title: a gold ball on a crystal spire, on a walnut base. */
const natty: Draw = (P, w, h, it) => {
  // The ball.
  P(7, 1, 8, 1, GOLD[1]);
  P(5, 2, 12, 1, GOLD[2]);
  P(4, 3, 14, 3, GOLD[2]);
  P(5, 6, 12, 1, GOLD[1]);
  P(7, 7, 8, 1, GOLD[0]);
  P(6, 3, 5, 1, GOLD[3]);
  P(9, 4, 4, 1, GOLD[0]);
  // The spire, crystal.
  P(9, 8, 4, 2, '#cfe8f2');
  P(8, 10, 6, 10, '#a9d6ea');
  P(8, 10, 2, 10, '#eaf7fc');
  P(12, 10, 2, 10, '#6fa9c4');
  P(7, 20, 8, 1, '#cfe8f2');
  // The base and its plate.
  P(3, 21, 16, 6, WOOD[0]);
  P(3, 21, 16, 1, WOOD[2]);
  P(5, 22, 12, 4, GOLD[2]);
  microC(P, `'${String(it.year).slice(2)}`, 11, 22, '#3a2808');
};

/** The Bronze Man: a player's bust on a base with his name. */
const heisman: Draw = (P, w, h, it, team) => {
  const [dk, m, b, hi] = BRONZE;
  // Head and helmet-less hair, shoulders.
  P(7, 2, 6, 1, m);
  P(6, 3, 8, 7, b);
  P(6, 3, 3, 5, hi);
  P(12, 4, 2, 5, m);
  P(8, 10, 4, 2, m);
  P(4, 12, 12, 2, b);
  P(3, 14, 14, 4, m);
  P(3, 14, 4, 4, hi);
  P(13, 14, 4, 4, dk);
  P(8, 6, 1, 1, dk);
  P(11, 6, 1, 1, dk);
  // Base, with the school's band.
  P(2, 18, 16, 8, '#1b1b1f');
  P(2, 18, 16, 1, team.colors.primary);
  P(3, 19, 14, 7, GOLD[1]);
  P(3, 19, 14, 1, GOLD[2]);
  const last = String(it.data?.name ?? '').split(' ').slice(-1)[0].slice(0, 3);
  microC(P, last, 10, 20, '#3a2808');
};

/** Stop the Presses: a framed front page; more pages tucked behind it each level, then gold. */
const paper: Draw = (P, w, h, it, team, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#2a2620', 2);
  const k = Math.min(lv - 1, 3);
  for (let i = k; i > 0; i--) {
    P(2 + i * 2, 3 + (k - i), w - 6 - k * 2, h - 6 - k, shade(PAPER, -0.08 * i));
    P(4 + i * 2, 5 + (k - i), w - 12 - k * 2, 1, '#8a8478');
  }
  page(P, 2, 2 + k, w - 4 - k * 2, h - 4 - k, it, team, k === 0);
  studs(P, w, h, lv, top);
};

/** Giant Killer: a shadow box of No. 1 teams' helmets, up to three across. */
const giant: Draw = (P, w, h, it, _t, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#142033', 3);
  const teams = (it.log ?? []).map((m) => m.v).filter((v): v is string => !!v).slice(-3);
  if (!teams.length) teams.push(String(it.data?.vs));
  const slot = Math.floor((w - 6) / teams.length);
  const k = teams.length === 1 ? 2 : 1;
  teams.forEach((id, i) => {
    const x = 3 + i * slot + Math.floor((slot - 14 * k) / 2);
    const y = k === 2 ? 6 : 10 + (i % 2) * 6;
    helmet(P, x, y, teamById(id), k);
    P(x + k, y + 10 * k + 1, 11 * k, 1, 'rgba(0,0,0,0.35)');
  });
  P(Math.floor(w / 2) - 9, h - 9, 18, 6, GOLD[1]);
  microC(P, 'NO.1', w / 2, h - 9 + 0.5, '#3a2808');
  studs(P, w, h, lv, top);
};

/** The playoff bracket, framed: the run in gold, a trophy at the end for a title, a star per trip. */
const bracket: Draw = (P, w, h, it, team, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#f2efe6', 2);
  const line = '#9a958a';
  const rd = Number(it.data?.rd ?? 0);
  const won = !!Number(it.data?.nc);
  // Eight lines on the left closing to the final in the middle, mirrored on the right.
  for (const side of [0, 1]) {
    const X = (x: number) => (side ? w - 1 - x : x);
    const seg = (x: number, y: number, len: number, col: string) => P(side ? X(x + len - 1) : X(x), y, len, 1, col);
    const run = side === 0;
    for (let i = 0; i < 4; i++) {
      const y = 6 + i * 7;
      const ours = run && i === 0;
      seg(4, y, 6, ours ? GOLD[2] : line);
      if (i % 2 === 0) {
        P(side ? X(10) : X(9), y, 1, 8, ours ? GOLD[2] : line);
        seg(10, y + 3, 6, ours && rd >= 1 ? GOLD[2] : line);
      }
    }
    P(side ? X(16) : X(15), 9, 1, 15, line);
    if (run && rd >= 1) P(X(15), 9, 1, 8, GOLD[2]);
    seg(16, 16, 5, run && rd >= 2 ? GOLD[2] : line);
  }
  P(21, 16, w - 42, 1, rd >= 3 ? GOLD[2] : line);
  if (won) {
    P(w / 2 - 3, 8, 6, 4, GOLD[2]);
    P(w / 2 - 1, 12, 2, 3, GOLD[1]);
    P(w / 2 - 3, 15, 6, 1, GOLD[1]);
  }
  const stars = Math.min(10, it.log?.length ?? 1);
  const x0 = Math.round(w / 2 - (stars * 4 - 1) / 2);
  for (let i = 0; i < stars; i++) {
    P(x0 + i * 4 + 1, h - 7, 1, 3, GOLD[2]);
    P(x0 + i * 4, h - 6, 3, 1, GOLD[2]);
  }
  studs(P, w, h, lv, top);
};

/** One pennant in the school's colors, `len` long, pointing right, with `label` on it. */
function pennant(P: Px, x: number, y: number, len: number, ph: number, team: Team, label: string, gold: boolean): void {
  const body = team.colors.primary;
  const edge = gold ? GOLD[2] : second(team);
  P(x, y - 1, 2, ph + 2, '#3a2a1a');
  for (let i = 0; i < len; i++) {
    const hh = Math.max(1, Math.round(ph * (1 - i / len)));
    const top = y + Math.round((ph - hh) / 2);
    P(x + 2 + i, top, 1, hh, body);
    P(x + 2 + i, top, 1, 1, edge);
    P(x + 2 + i, top + hh - 1, 1, 1, edge);
  }
  P(x + 2, y, 3, ph, edge);
  micro(P, label, x + 6, y + Math.round(ph / 2) - 2, edge);
}

/** Perfect Season: a pennant for each, overlapping down the wall. */
const perfect: Draw = (P, w, h, it, team, lv, top) => {
  const ys = (it.log ?? []).slice(-3);
  const k = Math.max(1, ys.length);
  const ph = k === 1 ? 20 : k === 2 ? 15 : 12;
  const gap = k === 1 ? 0 : Math.floor((h - ph - 2) / (k - 1));
  for (let i = 0; i < k; i++) {
    const label = ys[i]?.t ?? `${it.data?.w}-0`;
    pennant(P, i * 2, 1 + i * gap + (k === 1 ? 10 : 0), w - 4 - i * 2, ph, team, label.toUpperCase(), lv >= top);
  }
};

/** A blob for a state on the poster, seeded by its code: never the real outline, a fair stand-in. */
function stateBlob(P: Px, x: number, y: number, w: number, h: number, st: string, fill: string, edge: string): (u: number, v: number) => boolean {
  const rng = mulberry32(hashString(`state:${st}`));
  const bumps = Array.from({ length: 6 }, () => 0.78 + rng() * 0.22);
  const tilt = rng() * Math.PI;
  const inside = (u: number, v: number) => {
    const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
    const a = Math.atan2(dy, dx) + tilt;
    const r = bumps[Math.floor(((a / (2 * Math.PI)) % 1 + 1) % 1 * 6)];
    return dx * dx + dy * dy <= r * r;
  };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!inside((i + 0.5) / w, (j + 0.5) / h)) continue;
      const rim = !inside((i - 0.5) / w, (j + 0.5) / h) || !inside((i + 1.5) / w, (j + 0.5) / h) || !inside((i + 0.5) / w, (j - 0.5) / h) || !inside((i + 0.5) / w, (j + 1.5) / h);
      P(x + i, y + j, 1, 1, rim ? edge : fill);
    }
  return inside;
}

/** Homegrown: the state on a poster with a pin in every starter's hometown. */
const homegrown: Draw = (P, w, h, it, team, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#efe2c0', 2);
  const st = String(it.data?.st ?? '');
  const name = (STATE_NAME[st] ?? st).toUpperCase();
  microC(P, name.length <= 11 ? name : st, w / 2, 3, INK);
  const bx = 6, by = 10, bw = w - 12, bh = h - 15;
  const inside = stateBlob(P, bx, by, bw, bh, st, '#9cbf7a', '#5e7d45');
  const towns = String(it.data?.towns ?? '').split('|').filter(Boolean);
  for (const town of towns) {
    const r = mulberry32(hashString(`pin:${st}:${town}`));
    let u = 0.5, v = 0.5;
    for (let k = 0; k < 12; k++) {
      u = 0.15 + r() * 0.7;
      v = 0.15 + r() * 0.7;
      if (inside(u, v)) break;
    }
    const px = bx + Math.round(u * bw), py = by + Math.round(v * bh);
    P(px, py, 1, 3, '#4a4a4a');
    P(px - 1, py - 2, 3, 2, team.colors.primary === '#ffffff' ? '#c0392b' : team.colors.primary);
  }
  if (lv >= top) micro(P, '#1', w - 12, h - 8, GOLD[0]);
  studs(P, w, h, lv, top);
};

/** The Long Haul: the coach's portrait; grayer every five years, and a better frame. */
const haul: Draw = (P, w, h, it, team, lv, top) => {
  const fr = tierFrame(lv, top);
  frame(P, w, h, fr, '#2a2f3a', 3);
  if (lv >= 3) {
    P(3, 3, w - 6, 1, fr[3]);
    P(3, h - 4, w - 6, 1, fr[0]);
  }
  // Backdrop, then the coach in a school-colored pullover.
  P(4, 4, w - 8, h - 14, shade(team.colors.primary, -0.55));
  const cx = Math.floor(w / 2);
  P(cx - 11, 24, 22, h - 14 - 20, team.colors.primary);
  P(cx - 3, 24, 6, 2, second(team));
  P(cx - 5, 10, 10, 12, '#d9b38c');
  P(cx - 5, 18, 10, 4, '#c79f78');
  const hair = ['#3a2a1a', '#5a4a3a', '#8a8278', '#b8b4ac', '#e8e6e2'][Math.min(4, lv - 1)];
  P(cx - 6, 8, 12, 4, hair);
  P(cx - 6, 8, 2, 7, hair);
  P(cx + 4, 8, 2, 7, hair);
  P(cx - 3, 14, 2, 1, INK);
  P(cx + 1, 14, 2, 1, INK);
  P(cx - 2, 19, 4, 1, '#7a4a3a');
  // The plate with his years.
  P(cx - 10, h - 9, 20, 6, GOLD[1]);
  microC(P, `${it.data?.n} YRS`, cx, h - 9 + 0.5, '#3a2808');
  studs(P, w, h, lv, top);
};

/** To the League: a corkboard of photos, one per pick; the board itself gets nicer. */
const league: Draw = (P, w, h, it, team, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), CORK, 2);
  const rng = mulberry32(7);
  for (let i = 0; i < 40; i++) P(2 + Math.floor(rng() * (w - 4)), 2 + Math.floor(rng() * (h - 4)), 1, 1, shade(CORK, -0.2));
  if (lv >= 3) {
    P(10, 3, w - 20, 6, lv >= top ? GOLD[2] : '#f2efe6');
    microC(P, 'THE LEAGUE', w / 2, 3.5, INK);
  }
  const k = it.log?.length ?? 1;
  const cols = 5, rows = 3;
  const y0 = lv >= 3 ? 11 : 4;
  const cap = cols * rows;
  const shown = Math.min(k, cap);
  for (let i = 0; i < shown; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = 4 + c * 9 + (r % 2), y = y0 + r * 10;
    P(x, y, 7, 8, '#f4f1e8');
    P(x + 1, y + 1, 5, 5, shade(team.colors.primary, (i % 3) * 0.12 - 0.15));
    P(x + 2, y + 1, 3, 2, '#d9b38c');
    P(x + 3, y - 1, 1, 1, ['#d33', '#36c', '#2a2'][i % 3]);
  }
  studs(P, w, h, lv, top);
};

/** Draft Night: the first round's board, a strip in the school's colors for each of them (names on the card). */
const night: Draw = (P, w, h, it, team, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#1c2e22', 1);
  micro(P, 'R1', 3, 2, GOLD[3]);
  P(12, 4, w - 15, 1, '#3e5a46');
  const k = Math.min(4, String(it.data?.names ?? '').split('|').filter(Boolean).length || 3);
  for (let i = 0; i < k; i++) {
    const y = 8 + i * 3 + (k < 4 ? 1 : 0);
    P(3, y, w - 6, 2, i % 2 ? '#f4f1e8' : '#e8e2d0');
    P(3, y, 3, 2, team.colors.primary);
    for (let x = 8; x < w - 5; x += 4) P(x, y + 1, 2, 1, '#6a6a6a');
  }
  studs(P, w, h, lv, top);
};

/** The Comeback: the scoreboard at the low point, framed. */
const comeback: Draw = (P, w, h, it, _t, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#121212', 2);
  P(3, 3, w - 6, h - 6, '#1a1a1a');
  const low = String(it.data?.low ?? '0-21');
  microC(P, low, w / 2, 5, '#ffb43a');
  const q = Number(it.data?.q ?? 3);
  microC(P, q >= 5 ? 'OT' : `Q${q}`, w / 2, 12, '#ff6a3a');
  for (let x = 4; x < w - 4; x += 3) P(x, h - 4, 1, 1, '#ffb43a');
  studs(P, w, h, lv, top);
};

/** Ice Water: the tees on a plaque, one for each walk-off kick (four at most). */
const ice: Draw = (P, w, h, it, _t, lv, top) => {
  const fr = lv >= top ? GOLD : WOOD;
  P(1, 1, w - 2, h - 2, fr[1]);
  P(1, 1, w - 2, 1, fr[2]);
  P(1, h - 2, w - 2, 1, fr[0]);
  P(3, 3, w - 6, h - 9, '#14324a');
  const k = Math.min(4, it.log?.length ?? 1);
  const slot = Math.floor((w - 6) / k);
  for (let i = 0; i < k; i++) {
    const x = 3 + i * slot + Math.floor(slot / 2) - 2;
    P(x, 8, 5, 1, '#ff7a1a');
    P(x + 1, 9, 3, 3, '#ff7a1a');
    P(x, 12, 5, 1, '#d45a0a');
    P(x + 1, 7, 1, 1, '#ffa45a');
    P(x + 3, 7, 1, 1, '#ffa45a');
  }
  P(6, h - 6, w - 12, 3, GOLD[2]);
};

/** Air Show: the whiteboard play: routes in marker, more of them at each level. */
const airshow: Draw = (P, w, h, it, _t, lv, top) => {
  frame(P, w, h, lv >= top ? GOLD : SILVER, '#f6f6f2', 1);
  const line = '#2f6fd8';
  P(4, 14, w - 8, 1, '#8a8a8a');
  for (const x of [8, 11, 14, 17]) {
    P(x, 15, 2, 2, '#c02020');
  }
  micro(P, 'X', 12, 9, INK);
  const routes = 1 + lv;
  const ends = [[4, 3], [21, 3], [7, 2], [18, 5], [12, 2]];
  for (let i = 0; i < Math.min(routes, ends.length); i++) {
    const [ex, ey] = ends[i];
    const sx = [5, 20, 8, 18, 13][i];
    P(sx, ey + 2, 1, 12 - ey, line);
    P(Math.min(sx, ex), ey + 2, Math.abs(ex - sx) + 1, 1, line);
    P(ex, ey + 1, 1, 1, line);
  }
  micro(P, `${it.data?.td ?? 6}`, w - 6, h - 7, '#c02020');
};

/** Prove 'Em Wrong: the preseason magazine that left you out, a red X across its cover; more stacked at each level. */
const prove: Draw = (P, w, h, it, team, lv, top) => {
  const k = Math.min(lv, 3);
  for (let i = k - 1; i >= 0; i--) {
    const x = 2 + i * 2, y = 1 + (k - 1 - i);
    const cw = w - 4 - (k - 1) * 2, ch = h - 2 - (k - 1);
    P(x, y, cw, ch, i ? shade('#e8e2d0', -0.1 * i) : '#f4f1e8');
    if (i) continue;
    P(x, y, cw, 5, '#c0392b');
    microC(P, cw >= 21 ? 'PICKS' : 'POLL', x + cw / 2, y, '#ffffff');
    P(x + 2, y + 7, cw - 4, ch - 9, shade(team.colors.primary, -0.1));
    P(x + cw / 2 - 2, y + 8, 4, 4, '#d9b38c');
    for (let j = 0; j < Math.min(cw, ch) - 9; j++) {
      P(x + 3 + j, y + 7 + j, 2, 1, '#e02a2a');
      P(x + cw - 5 - j, y + 7 + j, 2, 1, '#e02a2a');
    }
  }
  if (lv >= top) P(w - 4, 1, 3, 3, GOLD[2]);
};

/** Turnaround: before (gray, a frown) and after (color, a grin). */
const turnaround: Draw = (P, w, h, _it, team, lv, top) => {
  const fr = tierFrame(lv, top);
  const face = (x: number, col: string, skin: string, happy: boolean) => {
    P(x, 2, 11, h - 4, fr[1]);
    P(x + 1, 3, 9, h - 6, col);
    P(x + 3, 6, 5, 6, skin);
    P(x + 4, 8, 1, 1, INK);
    P(x + 6, 8, 1, 1, INK);
    if (happy) {
      P(x + 4, 10, 3, 1, INK);
      P(x + 3, 9, 1, 1, INK);
      P(x + 7, 9, 1, 1, INK);
    } else {
      P(x + 4, 10, 3, 1, INK);
      P(x + 3, 11, 1, 1, INK);
      P(x + 7, 11, 1, 1, INK);
    }
    P(x + 2, 13, 7, h - 16, happy ? team.colors.primary : '#7a7a7a');
  };
  face(1, '#9a9a9a', '#b8b8b8', false);
  face(w - 12, '#7fb6e8', '#d9b38c', true);
  P(12, 10, 2, 1, GOLD[2]);
  P(13, 9, 1, 3, GOLD[2]);
};

/** The Awards Wall: a plaque with a brass plate per award, six across two rows; gold and a ribbon at the top. */
const plaques: Draw = (P, w, h, it, team, lv, top) => {
  const fr = lv >= top ? GOLD : lv >= 3 ? ['#2a1a10', '#3a2416', '#5a3a22'] : WOOD;
  P(1, 1, w - 2, h - 2, fr[1]);
  P(1, 1, w - 2, 1, fr[2]);
  P(1, h - 2, w - 2, 1, fr[0]);
  const k = Math.min(6, it.log?.length ?? 1);
  for (let i = 0; i < k; i++) {
    const c = i % 3, r = Math.floor(i / 3);
    P(4 + c * 7, 4 + r * 7, 5, 5, GOLD[2]);
    P(4 + c * 7, 4 + r * 7, 5, 1, GOLD[3]);
    P(5 + c * 7, 6 + r * 7, 3, 1, GOLD[0]);
  }
  if (lv >= 4) {
    P(w / 2 - 2, h - 7, 4, 4, team.colors.primary);
    P(w / 2 - 3, h - 4, 2, 3, team.colors.primary);
    P(w / 2 + 1, h - 4, 2, 3, team.colors.primary);
  }
};

/** From Nowhere: his letter, framed; more letters stacked behind at each level. */
const nowhere: Draw = (P, w, h, _it, _t, lv, top) => {
  frame(P, w, h, tierFrame(lv, top), '#2a2620', 1);
  const k = Math.min(lv, 3);
  for (let i = k - 1; i >= 0; i--) {
    const x = 2 + i * 2, y = 2 + (k - 1 - i);
    const lw = w - 4 - (k - 1) * 2, lh = h - 4 - (k - 1);
    P(x, y, lw, lh, i ? shade(PAPER, -0.08 * i) : PAPER);
    if (i) continue;
    P(x + 2, y + 2, 5, 4, '#23407a');
    P(x + 3, y + 3, 3, 2, '#c0392b');
    for (let ly = y + 8; ly < y + lh - 4; ly += 2) P(x + 2, ly, lw - 4, 1, '#9a948a');
    P(x + lw - 9, y + lh - 3, 6, 1, '#23407a');
    P(x + lw - 8, y + lh - 4, 2, 1, '#23407a');
  }
};

/** Ground and Pound: the muddy cleats; a second pair at level 2, bronzed at the top. */
const cleats: Draw = (P, w, h, _it, _t, lv, top) => {
  const pair = (y: number, body: string, mud: string) => {
    for (const x of [1, 10]) {
      P(x + 1, y, 5, 4, body);
      P(x + 1, y + 4, 8, 3, body);
      P(x, y + 7, 9, 1, shade(body, -0.4));
      for (let k = 1; k < 9; k += 3) P(x + k, y + 8, 1, 1, '#c8c8c8');
      P(x + 3, y + 1, 2, 3, '#f4f1e8');
      P(x + 2, y + 5, 3, 1, mud);
      P(x + 6, y + 6, 2, 1, mud);
    }
  };
  const gold = lv >= top;
  if (lv >= 2) pair(4, gold ? BRONZE[2] : '#2a2a2a', gold ? BRONZE[0] : '#6a4a2a');
  pair(14, gold ? GOLD[2] : '#1c1c1c', gold ? GOLD[0] : '#7a5a32');
  if (gold) {
    P(2, h - 3, w - 4, 3, WOOD[1]);
    P(2, h - 3, w - 4, 1, WOOD[2]);
  }
};

/** Bowl trophies: a small cup, then flanked by two more, silver, then gold with a wreath. */
const bowl: Draw = (P, w, h, it, team, lv) => {
  const metal = lv >= 3 ? GOLD : lv >= 2 ? SILVER : BRONZE;
  const cup = (cx: number, top: number, s: number, m: string[]) => {
    P(cx - 3 * s, top, 6 * s, s, m[2]);
    P(cx - 3 * s, top, 6 * s, 1, m[3]);
    P(cx - 2 * s, top + s, 4 * s, 2 * s, m[1]);
    P(cx - s, top + 3 * s, 2 * s, s, m[0]);
    P(cx - 1, top + 4 * s, 2, 2 * s, m[1]);
    P(cx - 2 * s, top + 4 * s + 2 * s, 4 * s, 1, m[2]);
  };
  if (lv >= 2) {
    cup(4, 9, 1, metal);
    cup(16, 9, 1, metal);
  }
  cup(10, lv >= 2 ? 3 : 6, 2, metal);
  P(6, 18, 8, 2, team.colors.primary);
  if (lv >= 4) {
    for (let i = 0; i < 5; i++) {
      P(1 + i, 12 - i * 2, 1, 2, '#3f8a3a');
      P(w - 2 - i, 12 - i * 2, 1, 2, '#3f8a3a');
    }
  }
  P(2, 20, 16, 5, '#1b1b1f');
  P(2, 20, 16, 1, '#34343c');
  micro(P, String(Math.min(99, it.log?.length ?? 1)), it.log && it.log.length >= 10 ? 7 : 9, 20, metal[3]);
};

/** Marathon: a cracked stopwatch; one more watch at each level. */
const marathon: Draw = (P, w, h, it, _t, lv) => {
  const watch = (x: number, y: number) => {
    P(x + 3, y, 3, 1, SILVER[1]);
    P(x + 4, y + 1, 1, 1, SILVER[1]);
    P(x + 1, y + 2, 7, 1, SILVER[2]);
    P(x, y + 3, 9, 6, SILVER[2]);
    P(x + 1, y + 9, 7, 1, SILVER[1]);
    P(x + 1, y + 3, 7, 6, '#f4f6f8');
    P(x + 4, y + 4, 1, 3, INK);
    P(x + 4, y + 6, 3, 1, INK);
    P(x + 2, y + 3, 1, 1, '#9aa');
    P(x + 3, y + 4, 1, 1, '#9aa');
    P(x + 6, y + 7, 1, 1, '#9aa');
    P(x + 7, y + 8, 1, 1, '#9aa');
  };
  const k = Math.min(3, lv);
  for (let i = 0; i < k; i++) watch(1 + i * 6, h - 11 - (i % 2) * 3);
  micro(P, `${it.data?.ot ?? 3}OT`, w - 11, 0, '#c02020');
};

/** Hate Mail: a pile of letters that grows; at the top it overflows a mail bin. */
const hatemail: Draw = (P, w, h, _it, _t, lv, top) => {
  const k = 2 + lv * 2;
  const rng = mulberry32(13);
  if (lv >= top) {
    P(1, h - 7, w - 2, 7, '#5a6a7a');
    P(1, h - 7, w - 2, 1, '#7a8a9a');
    micro(P, 'MAIL', 4, h - 5, '#e8e8e8');
  }
  const base = lv >= top ? h - 7 : h;
  for (let i = 0; i < k; i++) {
    const x = 2 + Math.floor(rng() * (w - 12));
    const y = base - 3 - Math.floor(i * Math.min(1.4, (base - 4) / k));
    P(x, y, 9, 3, i % 3 ? '#f4f1e8' : '#e8d9b0');
    P(x, y, 9, 1, '#d8d2c4');
    if (i % 4 === 1) P(x + 7, y + 1, 1, 1, '#c02020');
  }
  P(w - 7, 0, 2, 5, '#c02020');
  P(w - 7, 6, 2, 2, '#c02020');
};

/** The Coaching Tree: a bonsai on the desk; it grows a branch per level and a leaf per coach, blossoms for head coaches. */
const bonsai: Draw = (P, w, h, it, team, lv) => {
  P(5, h - 4, 12, 4, '#8a4a2a');
  P(4, h - 5, 14, 1, '#a65a32');
  P(6, h - 1, 10, 1, '#5a2a1a');
  const trunk = '#5a3a1e';
  P(10, h - 9, 2, 4, trunk);
  if (lv >= 2) P(8, h - 11, 3, 2, trunk);
  if (lv >= 3) P(12, h - 12, 3, 2, trunk);
  if (lv >= 4) P(9, h - 14, 2, 3, trunk);
  const spots: [number, number][] = [[10, h - 11], [6, h - 12], [14, h - 13], [8, h - 14], [12, h - 15], [4, h - 10], [16, h - 10], [10, h - 14], [2, h - 12], [18, h - 12], [6, h - 15], [14, h - 15]];
  const log = it.log ?? [];
  const n = Math.min(spots.length, Math.max(1, log.length));
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[i];
    const hc = log[i]?.v === 'HC';
    P(x - 1, y, 4, 2, '#3f8a3a');
    P(x, y - 1, 2, 1, '#5aa850');
    if (hc) P(x + 1, y, 1, 1, '#ff9ac8');
  }
  P(1, h - 2, 3, 2, team.colors.primary);
};

/** The Ball Rack: a ball per career-wins milestone; painted ones for 100 and up, gold for 200. */
const ballrack: Draw = (P, w, h, it, _t, lv, top) => {
  const wood = lv >= top ? GOLD : WOOD;
  P(2, 8, 2, h - 8, wood[1]);
  P(w - 4, 8, 2, h - 8, wood[1]);
  P(1, 7, w - 2, 2, wood[2]);
  const rows = [h - 26, h - 15, h - 4];
  for (const y of rows) P(2, y, w - 4, 2, wood[0]);
  const marks = (it.log ?? []).map((m) => Number(m.v));
  marks.slice(0, 9).forEach((m, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    const x = 5 + c * 7, y = rows[2 - r] - 5;
    const col = m >= 200 ? GOLD[2] : m >= 100 ? '#e8e4da' : '#7a3f1c';
    P(x + 1, y, 5, 1, col);
    P(x, y + 1, 7, 3, col);
    P(x + 1, y + 4, 5, 1, shade(col, -0.3));
    P(x + 2, y + 2, 3, 1, m >= 100 ? '#7a3f1c' : '#f4f1e8');
  });
  P(7, 0, w - 14, 7, '#f4f1e8');
  microC(P, String(it.data?.wins ?? ''), w / 2, 1, INK);
};

/** The Doormat: in the rival's colors, by the door. It gets their name, then their colors trimmed in gold. */
const doormat: Draw = (P, w, h, it, _t, lv, top) => {
  const r = teamById(String(it.data?.vs ?? it.team));
  const y = h - 14;
  P(0, y, w, 13, '#6a5a3a');
  P(1, y + 1, w - 2, 11, r.colors.primary);
  if (lv >= 2) {
    P(1, y + 2, w - 2, 1, second(r));
    P(1, y + 10, w - 2, 1, second(r));
  }
  microC(P, lv >= 3 ? r.abbr.slice(0, 5) : 'WIPE', w / 2, y + 4, lv >= 3 ? second(r) : '#e8e2d0');
  if (lv >= top) for (let x = 0; x < w; x += 2) {
    P(x, y - 1, 1, 1, GOLD[2]);
    P(x, y + 13, 1, 1, GOLD[2]);
  }
  // Muddy prints across it.
  P(3, y + 8, 2, 2, '#3a2a1a');
  P(6, y + 6, 2, 2, '#3a2a1a');
  P(w - 6, y + 3, 2, 2, '#3a2a1a');
};

/** The Hat Rack: a stand with a cap for each five-star, ten at most; brass at the top. */
const hats: Draw = (P, w, h, it, team, lv, top) => {
  const pole = lv >= top ? GOLD : WOOD;
  const cx = Math.floor(w / 2);
  P(cx - 1, 3, 2, h - 5, pole[1]);
  P(cx - 1, 3, 1, h - 5, pole[2]);
  P(cx - 7, h - 2, 14, 2, pole[0]);
  P(cx - 2, 1, 4, 2, pole[2]);
  const c = team.colors;
  const k = Math.min(10, it.log?.length ?? 1);
  const pegs: [number, number, number][] = [[-1, 4, 0], [1, 4, 1], [-1, 11, 2], [1, 11, 3], [-1, 18, 4], [1, 18, 5], [-1, 25, 6], [1, 25, 7], [0, 0, 8], [0, 31, 9]];
  for (let i = 0; i < k; i++) {
    const [side, y, j] = pegs[i];
    const x = side < 0 ? cx - 12 : side > 0 ? cx + 3 : cx - 4;
    const crown = j % 3 === 2 ? second(team) : c.primary;
    const logo = j % 3 === 2 ? c.primary : second(team);
    // A dome with a button, the logo, and the brim out toward the room.
    P(x + 3, y, 3, 1, shade(crown, -0.3));
    P(x + 2, y + 1, 5, 1, crown);
    P(x + 1, y + 2, 7, 2, crown);
    P(x + 2, y + 1, 2, 1, shade(crown, 0.25));
    P(x + 4, y + 2, 2, 1, logo);
    const bx = side < 0 ? x - 3 : x + 5;
    P(side < 0 ? x + 1 : x + 1, y + 4, 7, 1, shade(crown, -0.25));
    P(bx, y + 4, 5, 1, shade(crown, -0.45));
  }
};

/** For Sale: the yard sign a fan left; a rider for each year after. */
const forsale: Draw = (P, w, h, _it, _t, lv) => {
  P(4, 6, 2, h - 6, '#6b4a2a');
  P(w - 6, 6, 2, h - 6, '#6b4a2a');
  P(2, 6, w - 4, 2, '#6b4a2a');
  P(3, 10, w - 6, 15, '#f4f1e8');
  P(3, 10, w - 6, 2, '#c0392b');
  microC(P, 'FOR', w / 2, 13, '#c0392b');
  microC(P, 'SALE', w / 2, 19, '#c0392b');
  if (lv >= 2) {
    P(3, 26, w - 6, 7, '#ffd23f');
    microC(P, 'CHEAP', w / 2, 27, INK);
  }
  if (lv >= 3) {
    P(3, 34, w - 6, 6, '#ffffff');
    microC(P, 'OBO', w / 2, 34.5, '#c0392b');
  }
};

/** A first-round pick's jersey in a gold frame: name across the shoulders, number on the back. */
const jersey: Draw = (P, w, h, it, team) => {
  frame(P, w, h, GOLD, '#10141c', 2);
  const c = team.colors;
  const body = c.jerseyHome, trim = c.trimHome, dark = shade(c.jerseyHome, -0.3);
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
  P(12, h - 5, 12, 3, GOLD[2]);
};

/** Anything without its own art yet. */
const crate: Draw = (P, w, h) => {
  P(1, 1, w - 2, h - 2, '#9a7a4a');
  P(1, 1, w - 2, 2, '#b8955e');
  microC(P, '?', w / 2, Math.floor(h / 2) - 2, '#3b2414');
};

const DRAW: Record<string, Draw> = {
  gameball, conf: confCup, natty, heisman, jersey, paper, giant, bracket, perfect, homegrown, haul, league, night,
  comeback, ice, airshow, prove, turnaround, plaques, nowhere, cleats, bowl, marathon, hatemail, bonsai, ballrack, doormat,
  hats, forsale,
};

/** Every achievement drawn. For the tests. */
export const drawnIds = (): string[] => Object.keys(DRAW);

/** Paint an item with `P` at its slot's size; returns the size. `itemSprite` paints onto a canvas, the tests onto a checker. */
export function paintItem(P: Px, it: OfficeItem): { w: number; h: number } {
  const size = SLOT_SIZE[achievement(it.id)?.slot ?? 'shelf'];
  (DRAW[it.id] ?? crate)(P, size.w, size.h, it, teamById(it.team), levelOf(it), maxLevel(it.id));
  return size;
}

const cache = new Map<string, HTMLCanvasElement>();

/** An item's picture at its slot's size (where it's placed may be a fallback spot, so it's drawn to its own). */
export function itemSprite(it: OfficeItem): HTMLCanvasElement {
  const key = `${it.key}|${it.log?.length ?? 0}|${it.year}|${it.team}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = SLOT_SIZE[achievement(it.id)?.slot ?? 'shelf'];
  const c = document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  const g = c.getContext('2d')!;
  const P: Px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  };
  paintItem(P, it);
  outline(g, size.w, size.h);
  cache.set(key, c);
  return c;
}
