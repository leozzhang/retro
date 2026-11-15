import type { Camera } from '../engine/camera';
import type { Play } from '../game/playState';
import { isEligible, type Player } from '../sim/player';
import { text, textWidth } from './text';

/**
 * Jersey-number tags (display only). Before the snap every skill player and the defense's back seven wear
 * a small chip under his feet: his number in his own trim on his jersey color. An eligible receiver's chip
 * is ringed in his route's preview color, so "#11 runs the yellow one" reads at a glance. Linemen stand too
 * close together for chips; hovering anyone (lineman too) shows his position and name over his head.
 * Once the ball's snapped each receiver's chip shrinks to a dot of his route color until the ball's caught or run.
 */
const TAGS = {
  /** Chip top below the player's feet (view px). */
  below: 3,
  /** Chip alpha before the snap: the user's side, the defense. */
  presnapOff: 1,
  presnapDef: 0.8,
  /** Receivers' route-color dots during the play. */
  live: 0.9,
  /** Hover: how near the mouse must be to the middle of his sprite (view px). */
  hoverR: 9,
};

/** 3x5 digits, rows top to bottom, bit 2 the left column. */
const DIGITS: number[][] = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 3, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 2, 2], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];

const NO_TAG = new Set(['OL', 'DL', 'K', 'P']);

/** The route preview's colors by receiver, in the preview's order (renderer.ts `drawRoutePreview`). */
export function routeColors(play: Play, colors: string[]): Map<Player, string> {
  const out = new Map<Player, string>();
  let i = 0;
  for (const p of play.off) if (isEligible(p)) out.set(p, colors[i++ % colors.length]);
  return out;
}

function drawChip(g: CanvasRenderingContext2D, x: number, y: number, p: Player, ring: string | undefined): void {
  const ds = String(p.num).split('').map(Number);
  const w = ds.length * 4 + 1;
  const h = 7;
  const left = Math.round(x - w / 2);
  const top = Math.round(y);
  g.fillStyle = ring ?? 'rgba(0,0,0,0.7)';
  g.fillRect(left - 1, top - 1, w + 2, h + 2);
  g.fillStyle = p.uniform.jersey;
  g.fillRect(left, top, w, h);
  g.fillStyle = p.uniform.trim;
  ds.forEach((d, k) => {
    const rows = DIGITS[d];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (rows[r] & (4 >> c)) g.fillRect(left + 1 + k * 4 + c, top + 1 + r, 1, 1);
    }
  });
}

/** The player under the mouse, if any. */
function hovered(cam: Camera, play: Play, mouse: { x: number; y: number }): Player | null {
  let best: Player | null = null;
  let bestD: number = TAGS.hoverR;
  for (const p of play.players) {
    const s = cam.toScreen(p.pos.x, p.pos.y);
    const d = Math.hypot(mouse.x - s.x, mouse.y - (s.y - 9));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.toUpperCase();
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`.toUpperCase();
}

/** `ctl`: the user's controlled player, who wears the ring and stamina bar instead of a chip once it's live. */
export function drawNumberTags(
  g: CanvasRenderingContext2D, cam: Camera, play: Play, colors: Map<Player, string>,
  mouse: { x: number; y: number } | undefined, ctl: Player | null,
): void {
  const presnap = play.phase === 'presnap';
  const live = play.phase === 'snap' || play.phase === 'live' || play.phase === 'air';
  if (!presnap && !live) return;
  const hover = presnap && mouse ? hovered(cam, play, mouse) : null;
  for (const p of play.players) {
    if (p === hover) continue;
    if (presnap ? NO_TAG.has(p.role) : !colors.has(p) || p.isBlocker || p === ctl) continue;
    const s = cam.toScreen(p.pos.x, p.pos.y);
    if (live) {
      // After the snap the chip shrinks to a dot of his route color: still his, much quieter.
      const x = Math.round(s.x);
      const y = Math.round(s.y + TAGS.below + 1);
      g.globalAlpha = TAGS.live;
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.fillRect(x - 2, y - 1, 4, 4);
      g.fillStyle = colors.get(p)!;
      g.fillRect(x - 1, y, 2, 2);
      continue;
    }
    g.globalAlpha = p.side === 'off' ? TAGS.presnapOff : TAGS.presnapDef;
    drawChip(g, s.x, s.y + TAGS.below, p, colors.get(p));
  }
  g.globalAlpha = 1;
  if (!hover) return;
  // The hovered player's card: his chip, then the position and name above his helmet.
  const s = cam.toScreen(hover.pos.x, hover.pos.y);
  drawChip(g, s.x, s.y + TAGS.below, hover, colors.get(hover) ?? '#ffffff');
  const label = `${hover.role} ${shortName(hover.name)}`;
  const w = textWidth(g, label, 6) + 6;
  const bx = Math.round(s.x - w / 2);
  const by = Math.round(s.y - 34);
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.fillRect(bx, by, w, 10);
  g.fillStyle = colors.get(hover) ?? hover.uniform.jersey;
  g.fillRect(bx, by + 9, w, 1);
  text(g, label, s.x, by + 2, { size: 6, align: 'center', shadow: false });
}
