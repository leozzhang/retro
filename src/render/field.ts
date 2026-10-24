import type { Team } from '../data/teams';
import { VIEW_YARDS, type Camera } from '../engine/camera';
import {
  FIELD_LEN, FIELD_TOP_PX, FIELD_W, HASH_BOT, HASH_TOP, OPP_GOAL, OWN_GOAL, PPY_X, PPY_Y, VIEW_H, VIEW_W,
} from '../engine/constants';
import { mulberry32, pick } from '../engine/math';
import { CROSSBAR_Z, POSTS_Y, UPRIGHT_HALF } from '../sim/kicking';
import { text } from './text';

const GRASS_A = '#3d8b37';
const GRASS_B = '#46973f';
const SIDELINE = '#2b6a2a';
const LINE = '#f2f2ea';

const CROWD_X0 = -14;
const CROWD_W_YARDS = FIELD_LEN + 28;
const CROWD_TOP = 17;
const CROWD_H = 28;

/** Pre-rendered stadium crowd strip, colored mostly in the home team's colors. */
export function makeCrowd(home: Team, away: Team): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(CROWD_W_YARDS * PPY_X);
  c.height = CROWD_H;
  const g = c.getContext('2d')!;
  const rng = mulberry32(1234);
  g.fillStyle = '#23232b';
  g.fillRect(0, 0, c.width, c.height);
  const homeCols = [home.colors.primary, home.colors.primary, home.colors.secondary, '#f4f4f4'];
  const awayCols = [away.colors.primary, '#f4f4f4'];
  const misc = ['#c9c9c9', '#8a8a8a', '#e8d2b0', '#5a5a66', '#f4f4f4'];
  for (let y = 1; y < CROWD_H - 2; y += 3) {
    g.fillStyle = '#1a1a20';
    g.fillRect(0, y + 2, c.width, 1);
    for (let x = (y % 2) * 1; x < c.width; x += 2) {
      if (rng() > 0.82) continue;
      const r = rng();
      g.fillStyle = r < 0.55 ? pick(rng, homeCols) : r < 0.68 ? pick(rng, awayCols) : pick(rng, misc);
      g.fillRect(x, y, 2, 2);
    }
  }
  return c;
}

export function drawField(g: CanvasRenderingContext2D, cam: Camera, home: Team, away: Team, crowd: HTMLCanvasElement): void {
  const sx = (x: number) => Math.round((x - cam.x) * PPY_X);
  const sy = (y: number) => Math.round(FIELD_TOP_PX + y * PPY_Y);
  const top = sy(0);
  const bot = sy(FIELD_W);

  g.fillStyle = SIDELINE;
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  // Stands + padded wall in team color
  g.drawImage(crowd, sx(CROWD_X0), CROWD_TOP);
  g.fillStyle = home.colors.primary;
  g.fillRect(0, CROWD_TOP + CROWD_H, VIEW_W, 4);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, CROWD_TOP + CROWD_H + 4, VIEW_W, 2);

  const x0 = Math.max(0, Math.floor(cam.x) - 1);
  const x1 = Math.min(FIELD_LEN, Math.ceil(cam.x + VIEW_YARDS) + 1);

  // Grass stripes every 5 yards
  for (let s = Math.floor(Math.max(OWN_GOAL, x0) / 5) * 5; s < Math.min(OPP_GOAL, x1); s += 5) {
    g.fillStyle = (s / 5) % 2 === 0 ? GRASS_A : GRASS_B;
    g.fillRect(sx(s), top, sx(s + 5) - sx(s), bot - top);
  }

  // End zones
  drawEndZone(g, sx(0), sx(OWN_GOAL), top, bot, home, -Math.PI / 2);
  drawEndZone(g, sx(OPP_GOAL), sx(FIELD_LEN), top, bot, away, Math.PI / 2);

  // Midfield logo
  if (x0 <= 66 && x1 >= 54) {
    const cx = sx(60);
    const cy = sy(FIELD_W / 2);
    g.fillStyle = home.colors.primary;
    g.beginPath();
    g.ellipse(cx, cy, 44, 20, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = home.colors.secondary;
    g.lineWidth = 2;
    g.stroke();
    text(g, home.abbr, cx, cy - 6, { size: 12, align: 'center', color: home.colors.secondary === '#000000' ? '#ffffff' : home.colors.secondary });
  }

  g.fillStyle = LINE;
  // Yard lines
  for (let x = OWN_GOAL; x <= OPP_GOAL; x += 5) {
    if (x < x0 - 1 || x > x1 + 1) continue;
    const w = x === OWN_GOAL || x === OPP_GOAL ? 2 : 1;
    g.fillRect(sx(x), top, w, bot - top);
  }
  // Hash marks and sideline ticks every yard
  for (let x = Math.max(OWN_GOAL + 1, x0); x < Math.min(OPP_GOAL, x1); x++) {
    if (x % 5 === 0) continue;
    const px = sx(x);
    g.fillRect(px, top + 3, 1, 3);
    g.fillRect(px, sy(HASH_TOP) - 1, 1, 3);
    g.fillRect(px, sy(HASH_BOT) - 1, 1, 3);
    g.fillRect(px, bot - 5, 1, 3);
  }
  // Boundary
  g.fillRect(sx(0), top - 2, sx(FIELD_LEN) - sx(0), 2);
  g.fillRect(sx(0), bot, sx(FIELD_LEN) - sx(0), 2);
  g.fillRect(sx(0) - 2, top - 2, 2, bot - top + 4);
  g.fillRect(sx(FIELD_LEN), top - 2, 2, bot - top + 4);

  // Yard numbers
  for (let k = 1; k <= 9; k++) {
    const x = OWN_GOAL + k * 10;
    if (x < x0 - 3 || x > x1 + 3) continue;
    const n = String((k <= 5 ? k : 10 - k) * 10);
    const px = sx(x);
    for (const yy of [8, FIELD_W - 10]) {
      text(g, n[0], px - 2, sy(yy), { size: 8, align: 'right', color: LINE, shadow: false });
      text(g, n[1], px + 3, sy(yy), { size: 8, align: 'left', color: LINE, shadow: false });
    }
  }

  drawGoalPosts(g, cam, FIELD_LEN, 1);
  drawGoalPosts(g, cam, 0, -1);
}

const POST = '#ffd23f';
const POST_DARK = '#9c7a12';
/**
 * Screen-x skew per yard across the field. The top-down projection would stack
 * both uprights on one vertical line, so they're drawn slightly oblique.
 */
const POST_SKEW = 1.4;
const UPRIGHT_TOP = 10;

/** Goal posts on the end line at world x `x`; the gooseneck sits behind it (`back` = +1 at the far end). */
function drawGoalPosts(g: CanvasRenderingContext2D, cam: Camera, x: number, back: 1 | -1): void {
  const at = (y: number, z: number, dx = 0) => {
    const s = cam.toScreen(x + dx, y, z);
    return { x: Math.round(s.x + (y - POSTS_Y) * POST_SKEW), y: Math.round(s.y) };
  };
  const base = at(POSTS_Y, 0, back * 0.8);
  if (base.x < -40 || base.x > VIEW_W + 40) return;
  const neck = at(POSTS_Y, CROSSBAR_Z, back * 0.8);
  const bar = at(POSTS_Y, CROSSBAR_Z);
  const l0 = at(POSTS_Y - UPRIGHT_HALF, CROSSBAR_Z);
  const l1 = at(POSTS_Y - UPRIGHT_HALF, UPRIGHT_TOP);
  const r0 = at(POSTS_Y + UPRIGHT_HALF, CROSSBAR_Z);
  const r1 = at(POSTS_Y + UPRIGHT_HALF, UPRIGHT_TOP);
  const line = (a: { x: number; y: number }, b: { x: number; y: number }, col: string, w: number) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(a.x + 0.5, a.y + 0.5);
    g.lineTo(b.x + 0.5, b.y + 0.5);
    g.stroke();
  };
  // Shadow on the turf, then the post itself.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(base.x - 2, base.y - 1, 5, 2);
  for (const [col, w] of [[POST_DARK, 3], [POST, 1]] as const) {
    line(base, neck, col, w);
    line(neck, bar, col, w);
    line(l0, r0, col, w);
    line(l0, l1, col, w);
    line(r0, r1, col, w);
  }
  g.lineWidth = 1;
}

function drawEndZone(
  g: CanvasRenderingContext2D, xa: number, xb: number, top: number, bot: number, team: Team, rot: number,
): void {
  if (xb < 0 || xa > VIEW_W) return;
  g.fillStyle = team.colors.primary;
  g.fillRect(xa, top, xb - xa, bot - top);
  g.save();
  g.translate((xa + xb) / 2, (top + bot) / 2);
  g.rotate(rot);
  const col = team.colors.secondary === team.colors.primary ? '#ffffff' : team.colors.secondary;
  text(g, team.school.toUpperCase(), 0, -8, { size: 16, align: 'center', color: col, shadow: 'rgba(0,0,0,0.4)' });
  g.restore();
}
