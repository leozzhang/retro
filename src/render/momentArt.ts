import { DEV_LABEL, type DevTrait } from '../data/athletes';
import type { Team } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { hashString, mulberry32 } from '../engine/math';
import type { MomentPlayer, RatingDelta } from '../season/types';
import { getSprite, SPR_H, SPR_W, teamUniform, type Pose } from './sprites';
import { text, textWidth } from './text';

/**
 * The Week Wrap's building blocks (render/momentScreen.ts): backdrops, the big player, his card, rolling
 * numbers, rating bars, confetti and the trophy. Everything is drawn from `t`, the scene's clock, so a
 * scene can be skipped to its end by setting `t`. Display only; the confetti is seeded by the moment.
 */

export const GOLD = '#ffd23f';
export const GREEN = '#7dff9a';
export const RED = '#ff6a6a';
export const SOFT = '#8fa0b8';
export const DIM = '#5d6b80';
export const INK = '#07090d';

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 to 1 over `d` seconds from `a`. */
export const seg = (t: number, a: number, d: number) => clamp01((t - a) / d);
export const ease = (f: number) => 1 - (1 - clamp01(f)) ** 2;
/** A storyline meter's boxes (`Storyline.meter.pips`): each one's fill and its word. */
const PIP: Record<string, [string, string]> = { G: [GREEN, 'GOOD'], S: [GOLD, 'STARTED'], '-': ['#a04848', 'NO START'], '?': [SOFT, 'PLAYED'] };

/**
 * `of` boxes left to right, the first ones filled by `pips` and the rest to come; with `words`, each box
 * names its game (GOOD, STARTED, NO START, GAME 3) when it's tall enough to hold a line of text.
 */
export function drawPips(g: CanvasRenderingContext2D, pips: string, of: number, x: number, y: number, w: number, h: number, f = 1, words = false): void {
  const gap = Math.max(2, Math.round(w / of / 12));
  const bw = (w - gap * (of - 1)) / of;
  for (let i = 0; i < of; i++) {
    const bx = x + i * (bw + gap);
    const pip = i < pips.length && i < Math.ceil(f * of) ? PIP[pips[i]] ?? PIP['?'] : undefined;
    g.fillStyle = pip ? pip[0] : '#1f2a3a';
    g.fillRect(bx, y, bw, h);
    if (!pip) {
      // To come: an outline, so it reads as an empty box.
      g.fillStyle = '#3a4a62';
      g.fillRect(bx, y, bw, 1);
      g.fillRect(bx, y + h - 1, bw, 1);
      g.fillRect(bx, y, 1, h);
      g.fillRect(bx + bw - 1, y, 1, h);
    }
    if (words && h >= 12) text(g, pip ? pip[1] : `GAME ${i + 1}`, bx + bw / 2, y + (h - 8) / 2, { color: pip ? INK : DIM, align: 'center', shadow: false });
  }
}

export const back = (f: number) => {
  // Overshoot a little and settle: a slam.
  const x = clamp01(f);
  return 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;
};

/** The scene's ground: ink, a team-colored band sweeping in on a slant, and a floor line. */
export function backdrop(g: CanvasRenderingContext2D, team: Team, t: number, tone: 'team' | 'gold' | 'red' | 'dark'): void {
  g.fillStyle = tone === 'red' ? '#12070a' : INK;
  g.fillRect(0, 0, VIEW_W, 360);
  const f = ease(seg(t, 0, 0.45));
  const col = tone === 'red' ? '#5a1418' : tone === 'gold' ? '#4a3a0c' : tone === 'dark' ? '#141b26' : team.colors.primary;
  const w = 760 * f;
  g.save();
  g.globalAlpha = tone === 'team' ? 0.55 : 0.8;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-120, 312);
  g.lineTo(-120 + w, 312);
  g.lineTo(-120 + w + 160, 40);
  g.lineTo(-120 + 160, 40);
  g.closePath();
  g.fill();
  g.globalAlpha = 0.9;
  g.fillStyle = tone === 'team' ? team.colors.secondary : GOLD;
  g.fillRect(0, 312, VIEW_W * f, 2);
  g.restore();
  // Scanlines keep it in the game's pixel look.
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < 360; y += 3) g.fillRect(0, y, VIEW_W, 1);
}

export function spotlight(g: CanvasRenderingContext2D, cx: number, floor: number, a: number): void {
  if (a <= 0) return;
  g.save();
  g.globalAlpha = a;
  const grd = g.createLinearGradient(cx, 0, cx, floor);
  grd.addColorStop(0, 'rgba(255,248,220,0)');
  grd.addColorStop(1, 'rgba(255,248,220,0.22)');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(cx - 20, 0);
  g.lineTo(cx + 20, 0);
  g.lineTo(cx + 90, floor);
  g.lineTo(cx - 90, floor);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,248,220,0.25)';
  g.beginPath();
  g.ellipse(cx, floor, 90, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The big player: his sprite scaled, feet at (`x`, `floor`), lifted `lift` view pixels for a leap. */
export function hero(
  g: CanvasRenderingContext2D, team: Team, skin: string, x: number, floor: number, scale: number, pose: Pose, facing: 1 | -1,
  o: { lift?: number; alpha?: number; tint?: string; home?: boolean } = {},
): void {
  const spr = getSprite(teamUniform(team, o.home ?? true), skin, pose, facing);
  const w = SPR_W * scale;
  const h = SPR_H * scale;
  g.save();
  g.globalAlpha = o.alpha ?? 1;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath();
  g.ellipse(x, floor - scale, w * 0.32 * (1 - Math.min(0.5, (o.lift ?? 0) / 120)), scale * 2, 0, 0, Math.PI * 2);
  g.fill();
  const px = Math.round(x - w / 2);
  const py = Math.round(floor - h + scale * 2 - (o.lift ?? 0));
  g.drawImage(spr, px, py, w, h);
  if (o.tint) {
    // A tint over just the sprite's pixels.
    g.globalAlpha = (o.alpha ?? 1) * 0.5;
    g.drawImage(tintCanvas(spr, o.tint), px, py, w, h);
  }
  g.restore();
}

const tints = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function tintCanvas(spr: HTMLCanvasElement, col: string): HTMLCanvasElement {
  let m = tints.get(spr);
  if (!m) tints.set(spr, (m = new Map()));
  let c = m.get(col);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = spr.width;
  c.height = spr.height;
  const x = c.getContext('2d')!;
  x.drawImage(spr, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.fillStyle = col;
  x.fillRect(0, 0, c.width, c.height);
  m.set(col, c);
  return c;
}

/** Five pips, the recruit's stars filled. */
export function starPips(g: CanvasRenderingContext2D, n: number, x: number, y: number): void {
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i < n ? GOLD : '#2a3546';
    const px = x + i * 9;
    g.fillRect(px + 2, y, 3, 7);
    g.fillRect(px, y + 2, 7, 3);
  }
}

/** The player's card: number and name, position and class, stars, hometown, overall. Returns its height. */
export function playerCard(g: CanvasRenderingContext2D, p: MomentPlayer, x: number, y: number, w: number, team: Team, a = 1): number {
  const h = 58;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = 'rgba(10,13,18,0.92)';
  g.fillRect(x, y, w, h);
  g.fillStyle = team.colors.primary;
  g.fillRect(x, y, 3, h);
  text(g, `#${p.num} ${p.name}`.slice(0, Math.floor((w - 60) / 8)), x + 10, y + 7, { color: '#ffffff' });
  text(g, `${p.pos}  ${p.cls}  ${DEV_LABEL[p.dev].toUpperCase()}`, x + 10, y + 21, { color: SOFT, shadow: false });
  starPips(g, p.stars, x + 10, y + 34);
  text(g, p.home.slice(0, Math.floor((w - 120) / 8)), x + 62, y + 34, { color: DIM, shadow: false });
  g.fillStyle = '#1f2a3a';
  g.fillRect(x + w - 46, y + 8, 38, 40);
  text(g, `${p.ovr}`, x + w - 27, y + 14, { size: 16, align: 'center', color: p.ovr >= 90 ? GOLD : p.ovr >= 80 ? GREEN : '#ffffff' });
  text(g, 'OVR', x + w - 27, y + 36, { align: 'center', color: DIM, shadow: false, size: 8 });
  g.restore();
  return h;
}

/** A number rolling from `from` to `to` as `f` runs 0..1. */
export function rolled(from: number, to: number, f: number): number {
  return Math.round(from + (to - from) * ease(f));
}

/** Rating bars: each rating the moment raised, pips filling in one by one over `f`. */
export function ratingBars(g: CanvasRenderingContext2D, d: RatingDelta, f: number, x: number, y: number): number {
  const rows = Object.entries(d).filter(([, v]) => v).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 5) as [string, number][];
  const total = rows.reduce((t, [, v]) => t + v, 0);
  let shown = Math.floor(total * clamp01(f) + 0.0001);
  rows.forEach(([k, v], i) => {
    const ry = y + i * 14;
    text(g, k.toUpperCase(), x, ry, { color: SOFT, shadow: false });
    const n = Math.min(v, shown);
    shown -= n;
    for (let j = 0; j < v; j++) {
      g.fillStyle = j < n ? GREEN : '#1f2a3a';
      g.fillRect(x + 36 + j * 12, ry, 10, 8);
    }
    if (n === v) text(g, `+${v}`, x + 40 + v * 12, ry, { color: GREEN });
  });
  return rows.length * 14;
}

/** NORMAL struck through, then the new trait in gold with a flash. */
export function devBadge(g: CanvasRenderingContext2D, from: DevTrait, to: DevTrait, f: number, x: number, y: number): void {
  const a = DEV_LABEL[from].toUpperCase();
  const b = DEV_LABEL[to].toUpperCase();
  text(g, a, x, y, { color: f > 0 ? DIM : '#ffffff' });
  if (f <= 0) return;
  const aw = textWidth(g, a, 8);
  g.fillStyle = RED;
  g.fillRect(x - 2, y + 3, (aw + 4) * clamp01(f * 3), 2);
  if (f < 0.35) return;
  text(g, '>', x + aw + 10, y, { color: SOFT });
  const k = back(seg(f, 0.35, 0.4));
  g.save();
  g.translate(x + aw + 30, y + 8);
  g.scale(k, k);
  text(g, b, 0, -8, { size: 16, color: GOLD });
  g.restore();
}

/** Falling confetti in `cols`, seeded so it's the same every replay. */
export function confetti(g: CanvasRenderingContext2D, seed: string, t: number, cols: string[], n = 90): void {
  const r = mulberry32(hashString(seed));
  for (let i = 0; i < n; i++) {
    const x0 = r() * VIEW_W;
    const sp = 40 + r() * 70;
    const off = r() * 400;
    const sway = r() * 6;
    const col = cols[Math.floor(r() * cols.length)];
    const start = r() * 0.6;
    if (t < start) continue;
    const y = ((t - start) * sp + off - 40) % 400 - 20;
    const x = x0 + Math.sin((t + i) * 2.2) * sway;
    g.fillStyle = col;
    const flip = Math.floor((t * 6 + i) % 2);
    g.fillRect(Math.round(x), Math.round(y), flip ? 3 : 2, flip ? 2 : 4);
  }
}

/** Rain for a bad day. */
export function rain(g: CanvasRenderingContext2D, seed: string, t: number): void {
  const r = mulberry32(hashString(seed));
  g.fillStyle = 'rgba(150,170,200,0.35)';
  for (let i = 0; i < 70; i++) {
    const x = (r() * (VIEW_W + 100) - t * 60) % (VIEW_W + 100);
    const y = (r() * 400 + t * (260 + r() * 80)) % 400 - 20;
    g.fillRect(Math.round(x < 0 ? x + VIEW_W + 100 : x), Math.round(y), 1, 6);
  }
}

/** A bronze trophy on a base: a runner with the ball, one arm out. `k` is the pixel size. */
export function trophy(g: CanvasRenderingContext2D, x: number, floor: number, k: number): void {
  const B = ['#5a3a1c', '#8a5a2a', '#b98042', '#e2b070'];
  const P = (px: number, py: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x + px * k), Math.round(floor - 40 * k + py * k), Math.round(w * k), Math.round(h * k));
  };
  // Base.
  P(-8, 32, 16, 8, '#1b1b1f');
  P(-8, 32, 16, 1, GOLD);
  P(-6, 34, 12, 2, '#3a2808');
  // Legs, striding.
  P(-4, 22, 3, 10, B[1]);
  P(1, 22, 3, 6, B[2]);
  P(3, 27, 4, 3, B[2]);
  // Body, ball tucked, the arm straight out.
  P(-4, 12, 8, 11, B[2]);
  P(-4, 12, 3, 11, B[3]);
  P(-10, 13, 7, 3, B[2]);
  P(-12, 12, 3, 5, B[3]);
  P(3, 15, 4, 4, B[0]);
  // Head.
  P(-2, 6, 5, 6, B[2]);
  P(-2, 6, 2, 6, B[3]);
}

/** Wrap text to lines of at most `n` characters. */
export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if ((line ? line.length + 1 : 0) + w.length > n && line) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** Text that fades and rises in over `f`. */
export function rise(g: CanvasRenderingContext2D, s: string, x: number, y: number, f: number, o: Parameters<typeof text>[4] = {}): void {
  if (f <= 0) return;
  g.save();
  g.globalAlpha = clamp01(f);
  text(g, s, x, y + (1 - ease(f)) * 8, o);
  g.restore();
}

/** Text that slams in from big. */
export function slam(g: CanvasRenderingContext2D, s: string, x: number, y: number, f: number, size: number, color: string, align: CanvasTextAlign = 'center'): void {
  if (f <= 0) return;
  const k = 1 + (1 - back(f)) * 1.6;
  g.save();
  g.globalAlpha = clamp01(f * 2);
  g.translate(x, y + size / 2);
  g.scale(k, k);
  text(g, s, 0, -size / 2, { size, color, align });
  g.restore();
}

/** A movement arrow: green up, red down, with the places. */
export function moveMark(g: CanvasRenderingContext2D, mv: number | undefined, x: number, y: number): void {
  if (mv === undefined || mv === 0) {
    text(g, '-', x, y, { color: DIM, shadow: false });
    return;
  }
  const up = mv > 0;
  g.fillStyle = up ? GREEN : RED;
  for (let i = 0; i < 4; i++) {
    const r = up ? i : 3 - i;
    g.fillRect(x + 3 - r, y + 1 + i, 2 * r + 1, 1);
  }
  text(g, `${Math.abs(mv)}`, x + 10, y, { color: up ? GREEN : RED, shadow: false });
}
