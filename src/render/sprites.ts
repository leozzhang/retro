import type { Team } from '../data/teams';

export type Pose =
  | 'stand' | 'stance' | 'run0' | 'run1' | 'run2' | 'run3'
  | 'throw' | 'throwEnd' | 'catch' | 'down';

export interface Uniform {
  key: string;
  helmet: string;
  stripe: string;
  logo: string;
  mask: string;
  jersey: string;
  trim: string;
  pants: string;
  socks: string;
  shoe: string;
}

export const SPR_W = 20;
export const SPR_H = 22;
/** Pixel within the sprite that sits on the player's world position (between the feet). */
export const ANCHOR_X = 10;
export const ANCHOR_Y = 20;

const OUTLINE = '#141414';

export function teamUniform(team: Team, home: boolean): Uniform {
  const c = team.colors;
  return {
    key: `${team.id}-${home ? 'h' : 'a'}`,
    helmet: c.helmet,
    stripe: c.stripe,
    logo: c.logo,
    mask: c.mask,
    jersey: home ? c.jerseyHome : c.jerseyAway,
    trim: home ? c.trimHome : c.trimAway,
    pants: home ? c.pantsHome : c.pantsAway,
    socks: c.socks,
    shoe: '#1b1b1b',
  };
}

type Px = (x: number, y: number, w: number, h: number, col: string) => void;

// All poses are authored facing right in a 16x20 local box, then offset into
// the 20x22 canvas so the outline pass has room.
function drawUpright(P: Px, u: Uniform, skin: string, pose: Pose): void {
  const running = pose.startsWith('run');
  const bob = pose === 'run1' || pose === 'run3' ? -1 : 0;
  const ux = running ? 1 : 0;
  const uy = bob;

  // Legs
  P(5, 12, 6, 2, u.pants);
  switch (pose) {
    case 'run0':
    case 'run2':
      P(9, 14, 2, 1, u.pants); P(10, 15, 2, 1, u.socks); P(11, 16, 2, 2, u.socks); P(12, 18, 2, 1, u.shoe);
      P(5, 14, 2, 1, u.pants); P(4, 15, 2, 1, u.socks); P(3, 16, 2, 1, u.socks); P(1, 17, 3, 1, u.shoe);
      break;
    case 'run1':
      P(7, 14, 2, 1, u.pants); P(7, 15, 2, 3, u.socks); P(7, 18, 3, 1, u.shoe);
      P(9, 13, 2, 2, u.pants); P(10, 15, 2, 2, u.socks); P(10, 17, 3, 1, u.shoe);
      break;
    case 'run3':
      P(8, 14, 2, 1, u.pants); P(8, 15, 2, 3, u.socks); P(8, 18, 3, 1, u.shoe);
      P(5, 14, 2, 1, u.pants); P(4, 15, 2, 1, u.socks); P(3, 15, 1, 1, u.socks); P(2, 14, 2, 1, u.shoe);
      break;
    default:
      P(5, 14, 2, 1, u.pants); P(5, 15, 2, 3, u.socks); P(5, 18, 3, 1, u.shoe);
      P(8, 14, 2, 1, u.pants); P(8, 15, 2, 3, u.socks); P(8, 18, 3, 1, u.shoe);
  }

  // Torso with shoulder pads and a number block
  P(4 + ux, 7 + uy, 8, 2, u.jersey);
  P(5 + ux, 9 + uy, 6, 3, u.jersey);
  P(6 + ux, 9 + uy, 3, 2, u.trim);
  P(7 + ux, 6 + uy, 2, 1, skin);

  // Helmet (side view, facemask on the right)
  P(6 + ux, 1 + uy, 4, 1, u.stripe);
  P(5 + ux, 2 + uy, 6, 1, u.helmet);
  P(5 + ux, 3 + uy, 4, 2, u.helmet);
  P(9 + ux, 3 + uy, 2, 2, skin);
  P(11 + ux, 3 + uy, 1, 3, u.mask);
  P(9 + ux, 5 + uy, 2, 1, u.mask);
  P(5 + ux, 5 + uy, 4, 1, u.helmet);
  P(6 + ux, 3 + uy, 2, 2, u.logo);
  P(7 + ux, 2 + uy, 2, 1, 'rgba(255,255,255,0.55)');

  // Near arm
  switch (pose) {
    case 'run0':
      P(10 + ux, 8 + uy, 2, 2, u.jersey); P(12 + ux, 7 + uy, 2, 2, skin);
      break;
    case 'run2':
      P(4 + ux, 8 + uy, 2, 2, u.jersey); P(2 + ux, 9 + uy, 2, 2, skin);
      break;
    case 'throw':
      P(4, 5, 2, 3, u.jersey); P(3, 3, 2, 2, skin);
      break;
    case 'throwEnd':
      P(10, 7, 2, 1, u.jersey); P(12, 7, 2, 2, skin);
      break;
    case 'catch':
      P(10, 4, 2, 3, u.jersey); P(11, 2, 2, 2, skin);
      break;
    default:
      P(9 + ux, 8 + uy, 2, 2, u.jersey); P(10 + ux, 10 + uy, 2, 2, skin);
  }
}

function drawStance(P: Px, u: Uniform, skin: string): void {
  // Three-point stance: hips high, flat back, hand in the dirt.
  P(4, 13, 2, 2, u.pants); P(4, 15, 2, 3, u.socks); P(4, 18, 3, 1, u.shoe);
  P(7, 14, 2, 1, u.pants); P(8, 15, 2, 3, u.socks); P(8, 18, 3, 1, u.shoe);
  P(3, 10, 4, 4, u.pants);
  P(6, 9, 6, 4, u.jersey);
  P(7, 10, 3, 2, u.trim);
  P(11, 12, 2, 2, u.jersey); P(11, 14, 2, 4, skin);
  P(11, 6, 4, 1, u.stripe);
  P(10, 7, 6, 1, u.helmet);
  P(10, 8, 4, 2, u.helmet);
  P(14, 8, 1, 2, skin);
  P(15, 8, 1, 3, u.mask);
  P(10, 10, 4, 1, u.helmet);
  P(11, 8, 2, 2, u.logo);
}

function drawDown(P: Px, u: Uniform, skin: string): void {
  // Lying face down after a tackle, head to the right.
  P(-1, 17, 1, 2, u.shoe);
  P(0, 17, 4, 2, u.socks);
  P(4, 16, 4, 3, u.pants);
  P(8, 15, 5, 4, u.jersey);
  P(9, 16, 3, 2, u.trim);
  P(12, 19, 2, 1, skin);
  P(13, 15, 4, 4, u.helmet);
  P(14, 14, 2, 1, u.stripe);
  P(14, 16, 2, 2, u.logo);
  P(17, 16, 1, 2, u.mask);
}

function outline(g: CanvasRenderingContext2D, w: number, h: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
    }
  }
  g.fillStyle = OUTLINE;
  for (const [x, y] of edge) g.fillRect(x, y, 1, 1);
}

function paint(u: Uniform, skin: string, pose: Pose): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPR_W;
  c.height = SPR_H;
  const g = c.getContext('2d')!;
  const ox = 2;
  const oy = 1;
  const P: Px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x + ox, y + oy, w, h);
  };
  if (pose === 'down') drawDown(P, u, skin);
  else if (pose === 'stance') drawStance(P, u, skin);
  else drawUpright(P, u, skin, pose);
  outline(g, SPR_W, SPR_H);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

export function getSprite(u: Uniform, skin: string, pose: Pose, facing: 1 | -1): HTMLCanvasElement {
  const key = `${u.key}|${skin}|${pose}|${facing}`;
  let s = cache.get(key);
  if (s) return s;
  if (facing === 1) {
    s = paint(u, skin, pose);
  } else {
    const base = getSprite(u, skin, pose, 1);
    s = document.createElement('canvas');
    s.width = SPR_W;
    s.height = SPR_H;
    const g = s.getContext('2d')!;
    g.translate(SPR_W, 0);
    g.scale(-1, 1);
    g.drawImage(base, 0, 0);
  }
  cache.set(key, s);
  return s;
}

let ballSprite: HTMLCanvasElement | null = null;

export function getBallSprite(): HTMLCanvasElement {
  if (ballSprite) return ballSprite;
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 5;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a3e14';
  g.fillRect(2, 1, 4, 3);
  g.fillRect(1, 2, 6, 1);
  g.fillStyle = '#a65a24';
  g.fillRect(2, 1, 3, 1);
  g.fillStyle = '#ffffff';
  g.fillRect(3, 2, 2, 1);
  outline(g, 8, 5);
  ballSprite = c;
  return c;
}
