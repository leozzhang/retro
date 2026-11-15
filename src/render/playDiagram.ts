import { ROUTES, type PlayDef, type Pull } from '../data/plays';
import { FIELD_W } from '../engine/constants';
import { clamp } from '../engine/math';
import { alignY, resolvePlay, type ResolvedPlay } from '../game/resolvePlay';
import { POA } from '../sim/runBlocking';

/**
 * Where a puller turns up on a diagram (field y), as the sim does it: a lead at the hole, or at the edge
 * (outside the outermost lineman who stays in) on a perimeter play; a kick-out just inside the end, past
 * that lineman; a kick on a perimeter scheme is a force block a couple of yards outside the edge.
 */
export function pullTurnLat(p: PlayDef, rp: ResolvedPlay, by: number, holeY: number, pl: Pull): number {
  const s = Math.sign(holeY - by) || rp.strongSign;
  const pulled = new Set(rp.pulls.map((x) => x.who));
  let edge = 0;
  for (const [slot, a] of Object.entries(rp.align)) {
    if (pulled.has(slot as Pull['who']) || slot === 'QB' || a.mode !== 'rel' || a.dx < -1.5) continue;
    const rn = rp.routes[slot as Pull['who']];
    if (rn && rn !== 'block') continue;
    edge = Math.max(edge, (alignY(a, by) - by) * s);
  }
  const scheme = p.scheme?.run;
  const rb = rp.routes.RB;
  const wide = scheme === 'stretch' || scheme === 'pin' || rb === 'sweep' || rb === 'toss' || rb === 'pitchPath' || rb === 'stretch' || rb === 'oz';
  const edgeY = by + s * (edge + POA.edge);
  if (pl.job === 'kick') return wide ? edgeY + s * 2 : by + s * (edge + 1.2) - s * POA.kickInside;
  return wide ? edgeY : holeY;
}

/**
 * Route colors, handed out to receivers in slot order (run paths are white). Picked to stay apart under
 * red-green and blue-yellow color blindness and on the green turf: yellow, sky blue and vermillion differ
 * in hue and lightness, the fourth is white (no hue, far lighter than the pink), and pink comes last
 * since only a fifth receiver (empty sets) gets it.
 */
export const ROUTE_COLORS = ['#ffd23f', '#56b4e9', '#ff5a1f', '#ffffff', '#ff7aa8'];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 7x7 pixel star.
const STAR = ['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '##...##'];

/** A starred (gold) or unstarred (dim) pixel star with its top-left at x, y. */
export function drawStar(g: CanvasRenderingContext2D, x: number, y: number, on: boolean, hot = false): void {
  g.fillStyle = on ? '#ffd23f' : hot ? '#8fa0b8' : '#3a4658';
  STAR.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1);
  });
}

/**
 * Mini play diagram (offense moving right) inside `b`. Width is squashed like the game view, but each
 * diagram zooms to its own play's spread, so a tight I-Form run reads as well as a four-wide pass.
 */
export function drawMiniPlay(g: CanvasRenderingContext2D, p: PlayDef, b: Box, flip: boolean): void {
  const dh = b.h;
  const dy0 = b.y;
  const by = FIELD_W / 2;
  const rp = resolvePlay(p, by, flip);
  const ys: number[] = [];
  const xs: number[] = [];
  for (const [slot, a] of Object.entries(rp.align)) {
    const y0 = alignY(a, by);
    const rn = rp.routes[slot as keyof typeof rp.routes];
    xs.push(a.dx);
    if (rn === 'block' && a.mode === 'split') continue; // a split-out blocker is pinned to the edge instead
    ys.push(y0);
    const side = Math.sign(by - y0) || rp.strongSign;
    if (rn) for (const [dn, ins] of ROUTES[rn].pts) {
      ys.push(y0 + ins * side);
      xs.push(Math.min(a.dx + dn, 40));
    }
  }
  const half = clamp(Math.max(...ys.map((y) => Math.abs(y - by))) + 2, 8, FIELD_W / 2);
  const minX = Math.min(...xs) - 1;
  const xScale = Math.min(8, b.w / (Math.max(...xs) + 2 - minX));
  const sx = (x: number) => b.x + (x - minX) * xScale;
  const sy = (y: number) => clamp(dy0 + dh / 2 + ((y - by) / (2 * half)) * dh, dy0, dy0 + dh);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(Math.round(sx(0)), dy0, 1, dh);
  let ci = 0;
  for (const [slot, a] of Object.entries(rp.align)) {
    const x0 = a.dx;
    const y0 = clamp(alignY(a, by), 1, FIELD_W - 1);
    const route = rp.routes[slot as keyof typeof rp.routes];
    if (!route || slot === 'QB') {
      g.fillStyle = slot === 'QB' ? '#ffffff' : '#7d8796';
      g.fillRect(Math.round(sx(x0)) - 1, Math.round(sy(y0)) - 1, 2, 2);
      // Run blocking: linemen fire forward.
      if (slot !== 'QB' && p.block === 'run') g.fillRect(Math.round(sx(x0)) + 1, Math.round(sy(y0)) - 2, 1, 4);
      continue;
    }
    const def = ROUTES[route];
    const col = def.run ? '#ffffff' : ROUTE_COLORS[ci++ % ROUTE_COLORS.length];
    g.fillStyle = col;
    g.fillRect(Math.round(sx(x0)) - 1, Math.round(sy(y0)) - 1, 3, 3);
    if (route === 'block') {
      if (p.block === 'run') {
        g.fillStyle = '#7d8796';
        g.fillRect(Math.round(sx(x0)) + 2, Math.round(sy(y0)) - 2, 1, 5);
      }
      continue;
    }
    const side = Math.sign(by - y0) || rp.strongSign;
    g.strokeStyle = col;
    g.lineWidth = def.run ? 2 : 1;
    g.beginPath();
    g.moveTo(sx(x0), sy(y0));
    let px = x0;
    let py = y0;
    let lx = x0;
    let ly = y0;
    for (const [dn, ins] of def.pts) {
      lx = px;
      ly = py;
      px = Math.min(x0 + dn, 40);
      py = clamp(y0 + ins * side, 1, FIELD_W - 1);
      g.lineTo(sx(px), sy(py));
    }
    g.stroke();
    g.lineWidth = 1;
    if (def.cont) {
      const vx = px - lx;
      const vy = py - ly;
      const l = Math.hypot(vx, vy) || 1;
      const s = def.run ? 4 : 3;
      g.fillRect(Math.round(sx(px + (vx / l) * 0.8)) - 1, Math.round(sy(py + (vy / l) * 0.8)) - 1, s, s);
    }
  }

  // Pullers: a dotted path flat behind the line to where he turns up (`pullTurnLat`).
  const rbRoute = rp.routes.RB;
  if (rp.pulls.length && rbRoute && ROUTES[rbRoute].run) {
    const ry = clamp(alignY(rp.align.RB, by), 1, FIELD_W - 1);
    const last = ROUTES[rbRoute].pts[ROUTES[rbRoute].pts.length - 1];
    const holeY = ry + last[1] * (Math.sign(by - ry) || rp.strongSign);
    g.fillStyle = '#ffffff';
    for (const pl of rp.pulls) {
      const a = rp.align[pl.who];
      const oy = alignY(a, by);
      const ty = pullTurnLat(p, rp, by, holeY, pl);
      const steps = Math.ceil(Math.abs(ty - oy) / 0.9);
      for (let k = 1; k <= steps; k++) {
        g.fillRect(Math.round(sx(a.dx - 0.8)), Math.round(sy(oy + ((ty - oy) * k) / steps)), 1, 1);
      }
      g.fillRect(Math.round(sx(a.dx - 0.8)) + 1, Math.round(sy(ty)) - 1, 2, 1);
      g.fillRect(Math.round(sx(a.dx - 0.8)) + 3, Math.round(sy(ty)) - 1, 1, 1);
    }
  }
}
