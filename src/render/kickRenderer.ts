import type { Camera } from '../engine/camera';
import { OPP_GOAL, PPY_X, PPY_Y, VIEW_W } from '../engine/constants';
import { dist, type Vec3 } from '../engine/math';
import type { KickPlay } from '../game/kickPlay';
import { fieldLabel } from '../game/rules';
import type { Wind } from '../sim/kicking';
import { CROSSBAR_Z, POSTS_X, POSTS_Y, UPRIGHT_HALF } from '../sim/kicking';
import { drawPlayer, drawShadow } from './renderer';
import { getBallSprite, getTeeSprite } from './sprites';
import { text } from './text';

/** Fraction of a field goal's arc the aim preview shows (as in Retro Bowl, you judge the rest). */
const FG_PREVIEW = 0.45;
/** Seconds from the snap a punter has before the rush should get home (for the get-off bar). */
const GETOFF_BAR = 2.0;

/** Index of the first predicted point on the ground (end of the flight). */
function airEnd(pts: Vec3[]): number {
  const i = pts.findIndex((p, k) => k > 1 && p.z <= 0);
  return i > 0 ? i : pts.length;
}

function ballFrame(kp: KickPlay): number {
  const k = kp.flight;
  if (!k || kp.ball.state !== 'kick') return 0;
  if (k.mode === 'rest') return 0;
  if (k.mode === 'roll') return Math.floor(k.t * Math.hypot(k.vel.x, k.vel.y) * 1.5) % 4;
  const rate = kp.def.loft < 20 ? 18 : kp.unit === 'punt' ? 7 : 11;
  return Math.floor(k.t * rate) % 4;
}

export function drawKickPlay(g: CanvasRenderingContext2D, cam: Camera, kp: KickPlay, debug: boolean): void {
  const presnap = kp.phase === 'presnap';
  if (debug) drawDebug(g, cam, kp);

  for (const p of kp.players) {
    const s = cam.toScreen(p.pos.x, p.pos.y);
    drawShadow(g, s.x, s.y, 6);
  }
  const ball = kp.ball;
  const loose = ball.state !== 'held';
  if (loose) {
    const s = cam.toScreen(ball.pos.x, ball.pos.y);
    drawShadow(g, s.x, s.y, 2.5);
  }
  // Kicking tee (stays put once the ball is gone).
  if (kp.unit === 'kickoff') {
    const s = cam.toScreen(kp.kickSpot.x, kp.kickSpot.y);
    if (kp.phase === 'presnap' || kp.phase === 'approach' || dist(ball.pos, kp.kickSpot) > 1) {
      g.drawImage(getTeeSprite(), Math.round(s.x - 3), Math.round(s.y - 2));
    }
  }

  const sorted = [...kp.players].sort((a, b) => a.pos.y - b.pos.y);
  const onTee = (kp.unit === 'kickoff' && (presnap || kp.phase === 'approach')) || ((kp.unit === 'fg' || kp.unit === 'xp') && kp.phase === 'set');
  const frame = onTee ? 2 : ballFrame(kp);
  const bs = getBallSprite(frame);
  for (const p of sorted) {
    drawPlayer(g, cam, p, presnap);
    if (ball.state === 'held' && ball.carrier === p) {
      const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
      g.drawImage(bs, Math.round(s.x - 4), Math.round(s.y - 4));
    }
  }
  if (loose) {
    const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
    g.drawImage(bs, Math.round(s.x - 4), Math.round(s.y - 4));
  }

  if (kp.unit === 'punt' && (kp.phase === 'set' || kp.phase === 'snap' || kp.phase === 'approach')) drawGetOff(g, cam, kp);
  drawPreview(g, cam, kp);

  for (const pp of kp.popups) {
    const s = cam.toScreen(pp.x, pp.y);
    g.globalAlpha = Math.max(0, 1 - pp.t / 1.4);
    text(g, pp.text, s.x, s.y - 34 - pp.t * 14, { size: 8, align: 'center', color: pp.color });
    g.globalAlpha = 1;
  }

  if (kp.unit === 'fg' || kp.unit === 'xp') drawGoalCam(g, kp);
}

function drawGetOff(g: CanvasRenderingContext2D, cam: Camera, kp: KickPlay): void {
  const p = kp.kicker;
  const s = cam.toScreen(p.pos.x, p.pos.y);
  const t = kp.phase === 'snap' ? 0 : Math.min(1, (kp.time - kp.snapTime) / GETOFF_BAR);
  const x = Math.round(s.x) - 10;
  const y = Math.round(s.y) + 5;
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(x, y, 20, 4);
  g.fillStyle = t < 0.6 ? '#5cff7a' : t < 0.85 ? '#ffd23f' : '#ff5a5a';
  g.fillRect(x + 1, y + 1, Math.max(1, Math.round(18 * (1 - t))), 2);
}

function drawPreview(g: CanvasRenderingContext2D, cam: Camera, kp: KickPlay): void {
  if (!kp.aim) return;
  // Pull-back band
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(kp.aim.start.x, kp.aim.start.y);
  g.lineTo(kp.aim.cur.x, kp.aim.cur.y);
  g.stroke();

  const pv = kp.preview();
  if (!pv) {
    text(g, 'DRAG BACK TOWARD YOUR END ZONE', VIEW_W / 2, 40, { size: 8, align: 'center', color: '#ffb3b3' });
    return;
  }
  const { pred, sd, params } = pv;
  const fg = kp.unit === 'fg' || kp.unit === 'xp';
  const touch = airEnd(pred.pts);
  const n = fg ? Math.max(2, Math.floor(touch * FG_PREVIEW)) : touch;
  g.fillStyle = '#ffffff';
  for (let i = 1; i < n; i += 2) {
    const s = cam.toScreen(pred.pts[i].x, pred.pts[i].y, pred.pts[i].z);
    g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2);
  }
  if (!fg) {
    // Bounces and roll, fainter.
    g.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = touch; i < pred.pts.length; i += 3) {
      const s = cam.toScreen(pred.pts[i].x, pred.pts[i].y, pred.pts[i].z);
      g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
  }
  // Power meter by the kicker.
  const ks = cam.toScreen(kp.kicker.pos.x, kp.kicker.pos.y);
  g.fillStyle = 'rgba(0,0,0,0.65)';
  g.fillRect(Math.round(ks.x) - 14, Math.round(ks.y) - 34, 4, 22);
  g.fillStyle = params.power > 0.92 ? '#ff9a5a' : '#ffd23f';
  const ph = Math.round(20 * Math.min(1, params.power));
  g.fillRect(Math.round(ks.x) - 13, Math.round(ks.y) - 13 - ph, 2, ph);

  if (fg) {
    text(g, `POWER ${Math.round(params.power * 100)}  LOFT ${Math.round(params.loft)}   W/S OR WHEEL: LOFT`, VIEW_W / 2, 40, {
      size: 8, align: 'center', color: '#ffffff',
    });
    return;
  }
  const land = pred.land;
  const c = cam.toScreen(land.x, land.y);
  const d = Math.hypot(land.x - kp.kickSpot.x, land.y - kp.kickSpot.y);
  const rx = Math.max(5, sd.power * d * 1.3 * PPY_X);
  const ry = Math.max(2.5, sd.dir * d * PPY_Y);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(Math.round(c.x), Math.round(c.y), rx, ry, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffd23f';
  g.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 2, 2);
  const roll = pred.rest.x - land.x;
  if (Math.abs(roll) > 1.5) {
    const r = cam.toScreen(pred.rest.x, pred.rest.y);
    g.fillStyle = 'rgba(255,210,63,0.6)';
    g.fillRect(Math.round(r.x) - 2, Math.round(r.y), 5, 1);
    g.fillRect(Math.round(r.x), Math.round(r.y) - 2, 1, 5);
  }
  const lands = land.x >= OPP_GOAL ? 'END ZONE' : fieldLabel(land.x);
  const yds = Math.round(land.x - kp.los);
  text(
    g,
    `${kp.unit === 'punt' ? 'PUNT' : 'KICK'} ${yds}  HANG ${pred.hang.toFixed(1)}S  LANDS ${lands}  ROLL ${roll >= 0 ? '+' : ''}${Math.round(roll)}  LOFT ${Math.round(params.loft)}`,
    VIEW_W / 2, 40, { size: 8, align: 'center', color: '#ffffff' },
  );
}

/** Behind-the-kicker inset: you can't see the uprights edge-on from the main camera. */
function drawGoalCam(g: CanvasRenderingContext2D, kp: KickPlay): void {
  // Bottom right, clear of the ball's flight path across the top of the screen.
  const W = 150;
  const H = 92;
  const X = VIEW_W - W - 6;
  const Y = 360 - 16 - H - 4;
  // A raised camera well behind the hold, with heights compressed so the whole arc stays in frame.
  const C = { x: kp.kickSpot.x - 10, y: POSTS_Y, z: 4 };
  const D = POSTS_X - C.x;
  const F = (24 * D) / UPRIGHT_HALF;
  const FZ = F * 0.32;
  const cx = X + W / 2;
  const hy = Y + 48;
  const proj = (p: Vec3) => {
    const d = p.x - C.x;
    if (d < 0.5) return null;
    return { x: cx + (F * (p.y - C.y)) / d, y: hy - (FZ * (p.z - C.z)) / d, d };
  };

  g.save();
  g.fillStyle = '#141b26';
  g.fillRect(X - 2, Y - 2, W + 4, H + 4);
  g.beginPath();
  g.rect(X, Y, W, H);
  g.clip();
  // Sky, stands, then turf from the far end of the stadium toward the camera.
  const far = proj({ x: POSTS_X + 12, y: POSTS_Y, z: 0 })!.y;
  g.fillStyle = '#1d2b44';
  g.fillRect(X, Y, W, H);
  g.fillStyle = '#2c2c36';
  g.fillRect(X, Math.round(far) - 14, W, 14);
  g.fillStyle = '#2b6a2a';
  g.fillRect(X, Math.round(far), W, Y + H - Math.round(far));
  const el = proj({ x: POSTS_X, y: POSTS_Y - 30, z: 0 });
  const er = proj({ x: POSTS_X, y: POSTS_Y + 30, z: 0 });
  if (el && er) {
    g.fillStyle = '#f2f2ea';
    g.fillRect(Math.round(el.x), Math.round(el.y), Math.round(er.x - el.x), 1);
  }

  const seg = (a: Vec3, b: Vec3, col: string, w: number) => {
    const pa = proj(a);
    const pb = proj(b);
    if (!pa || !pb) return;
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(pa.x, pa.y);
    g.lineTo(pb.x, pb.y);
    g.stroke();
  };
  const L = POSTS_Y - UPRIGHT_HALF;
  const R = POSTS_Y + UPRIGHT_HALF;
  for (const [col, w] of [['#9c7a12', 3], ['#ffd23f', 1.5]] as const) {
    seg({ x: POSTS_X + 0.8, y: POSTS_Y, z: 0 }, { x: POSTS_X + 0.8, y: POSTS_Y, z: CROSSBAR_Z }, col, w);
    seg({ x: POSTS_X, y: L, z: CROSSBAR_Z }, { x: POSTS_X, y: R, z: CROSSBAR_Z }, col, w);
    seg({ x: POSTS_X, y: L, z: CROSSBAR_Z }, { x: POSTS_X, y: L, z: 9 }, col, w);
    seg({ x: POSTS_X, y: R, z: CROSSBAR_Z }, { x: POSTS_X, y: R, z: 9 }, col, w);
  }

  // Aim preview (the first part of the arc only) or the ball itself.
  const pv = kp.aim ? kp.preview() : null;
  if (pv) {
    const pts = pv.pred.pts;
    const n = Math.max(2, Math.floor(airEnd(pts) * FG_PREVIEW));
    g.fillStyle = '#ffffff';
    for (let i = 1; i < n; i += 2) {
      const s = proj(pts[i]);
      if (s) g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2);
    }
  } else if (kp.ball.state === 'kick' && kp.ball.pos.x < POSTS_X + 0.5) {
    const s = proj(kp.ball.pos);
    if (s) {
      const r = Math.max(1, Math.min(6, (0.35 * F) / s.d));
      const sh = proj({ ...kp.ball.pos, z: 0 });
      if (sh) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(Math.round(sh.x - r), Math.round(sh.y), Math.round(r * 2), 1);
      }
      g.fillStyle = '#7a3e14';
      g.beginPath();
      g.ellipse(s.x, s.y, r, r * 0.75, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
  text(g, 'GOAL CAM', X + 4, Y + H - 11, { size: 8, color: '#cfd6df' });
}

/** Wind sock: arrow in screen orientation plus speed and head/tail label. */
export function drawWind(g: CanvasRenderingContext2D, w: Wind, label: string): void {
  const x = 4;
  const y = 20;
  g.fillStyle = 'rgba(8,10,14,0.8)';
  g.fillRect(x, y, 128, 14);
  const cx = x + 9;
  const cy = y + 7;
  if (w.mph >= 1) {
    // Screen y is squashed relative to x; keep the arrow readable.
    const l = Math.hypot(w.dir.x * PPY_X, w.dir.y * PPY_Y) || 1;
    const ax = ((w.dir.x * PPY_X) / l) * 5;
    const ay = ((w.dir.y * PPY_Y) / l) * 5;
    g.strokeStyle = '#9ad7ff';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx - ax, cy - ay);
    g.lineTo(cx + ax, cy + ay);
    g.stroke();
    g.fillStyle = '#9ad7ff';
    g.fillRect(Math.round(cx + ax) - 1, Math.round(cy + ay) - 1, 3, 3);
  }
  text(g, `WIND ${label}`, x + 20, y + 3, { size: 8, color: '#ffffff' });
}

function drawDebug(g: CanvasRenderingContext2D, cam: Camera, kp: KickPlay): void {
  g.lineWidth = 1;
  for (const d of kp.players) {
    const a = cam.toScreen(d.pos.x, d.pos.y);
    for (const b of d.engagedBy) {
      const s = cam.toScreen(b.pos.x, b.pos.y);
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(s.x, s.y);
      g.stroke();
    }
  }
  if (kp.pred && kp.unit !== 'fg' && kp.unit !== 'xp') {
    const c = cam.toScreen(kp.pred.land.x, kp.pred.land.y);
    g.strokeStyle = 'rgba(255,80,80,0.8)';
    g.strokeRect(Math.round(c.x) - 4, Math.round(c.y) - 2, 8, 4);
  }
  if (kp.catcher) {
    const s = cam.toScreen(kp.catcher.pos.x, kp.catcher.pos.y);
    g.strokeStyle = '#ff5a5a';
    g.beginPath();
    g.ellipse(Math.round(s.x), Math.round(s.y), 9, 3.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
  text(g, `KICK: ${kp.def.name}  PHASE ${kp.phase}`, 6, 330, { size: 8, color: '#ffb3b3' });
}
