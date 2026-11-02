import type { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL } from '../engine/constants';
import { add, len, scale, type Vec } from '../engine/math';
import type { Play } from '../game/playState';
import { facingQB } from '../sim/ai';
import { flightPos, passParams } from '../sim/ball';
import { CATCH_REACH } from '../sim/catching';
import { endurance, isEligible, poseOf, type Player } from '../sim/player';
import { ANCHOR_X, ANCHOR_Y, getBallSprite, getSprite } from './sprites';
import { text } from './text';

const ROUTE_COLORS = ['#ffd23f', '#5ce1ff', '#ff7ad9', '#ff9f43', '#9dff7a'];

export function drawLines(g: CanvasRenderingContext2D, cam: Camera, los: number, firstDownX: number): void {
  const top = cam.toScreen(0, 0).y;
  const bot = cam.toScreen(0, FIELD_W).y;
  const lx = Math.round(cam.toScreen(los, 0).x);
  g.fillStyle = 'rgba(60,130,255,0.85)';
  g.fillRect(lx, top, 2, bot - top);
  if (firstDownX < OPP_GOAL) {
    const fx = Math.round(cam.toScreen(firstDownX, 0).x);
    g.fillStyle = 'rgba(255,220,40,0.9)';
    g.fillRect(fx, top, 2, bot - top);
  }
}

function drawRoutePreview(g: CanvasRenderingContext2D, cam: Camera, play: Play): void {
  let i = 0;
  g.lineWidth = 1;
  for (const p of play.off) {
    if (!isEligible(p)) continue;
    const col = ROUTE_COLORS[i++ % ROUTE_COLORS.length];
    g.strokeStyle = col;
    g.globalAlpha = 0.75;
    if (p.isBlocker) {
      const s = cam.toScreen(p.pos.x, p.pos.y);
      const dir = play.playDef.block === 'run' ? 1 : -1; // run blocks fire forward, pass sets drop back
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x + dir * 6, s.y);
      g.stroke();
      g.fillStyle = col;
      g.fillRect(Math.round(s.x + dir * 7) - 1, Math.round(s.y - 3), 2, 6);
      g.globalAlpha = 1;
      continue;
    }
    const pts: Vec[] = [p.pos, ...p.route];
    if (p.routeDir) pts.push(add(pts[pts.length - 1], scale(p.routeDir, 6)));
    g.beginPath();
    pts.forEach((pt, k) => {
      const s = cam.toScreen(pt.x, pt.y);
      if (k === 0) g.moveTo(s.x, s.y);
      else g.lineTo(s.x, s.y);
    });
    g.stroke();
    const end = cam.toScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
    g.fillStyle = col;
    g.fillRect(Math.round(end.x) - 2, Math.round(end.y) - 2, 4, 4);
    g.globalAlpha = 1;
  }
}

function drawDebug(g: CanvasRenderingContext2D, cam: Camera, play: Play): void {
  g.lineWidth = 1;
  for (const d of play.def) {
    const a = cam.toScreen(d.pos.x, d.pos.y);
    if (d.manTarget) {
      const b = cam.toScreen(d.manTarget.pos.x, d.manTarget.pos.y);
      g.strokeStyle = 'rgba(255,80,80,0.7)';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    if (d.assign?.kind === 'deep') {
      const y0 = cam.toScreen(0, d.assign.yMin).y;
      const y1 = cam.toScreen(0, d.assign.yMax).y;
      g.strokeStyle = 'rgba(120,180,255,0.6)';
      g.strokeRect(a.x - 20, y0, 40, y1 - y0);
    }
    for (const b of d.engagedBy) {
      const s = cam.toScreen(b.pos.x, b.pos.y);
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(s.x, s.y);
      g.stroke();
    }
  }
  // Route runners: current speed (yd/s), and SET once squared up to the QB on a settle route.
  for (const o of play.off) {
    if (!o.passRoute || o.isBlocker || play.carrier === o) continue;
    const a = cam.toScreen(o.pos.x, o.pos.y);
    const set = facingQB(o, play.qb, play.time);
    text(g, set >= 1 ? 'SET' : len(o.vel).toFixed(1), a.x, a.y + 6, { size: 6, color: set >= 1 ? '#7dff7d' : '#ffffff', align: 'center' });
  }
  if (play.ballTarget && play.phase === 'air') {
    const c = cam.toScreen(play.ballTarget.x, play.ballTarget.y);
    g.strokeStyle = 'rgba(255,255,0,0.8)';
    g.beginPath();
    g.ellipse(c.x, c.y, CATCH_REACH * 12, CATCH_REACH * 5.2, 0, 0, Math.PI * 2);
    g.stroke();
  }
  text(g, `DEF: ${play.defCall.name} (${play.defPackage.toUpperCase()})`, 6, 330, { size: 8, color: '#ffb3b3' });
}

export function drawShadow(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), w, w * 0.35, 0, 0, Math.PI * 2);
  g.fill();
}

function drawAim(g: CanvasRenderingContext2D, cam: Camera, play: Play): void {
  const tgt = play.aimPoint(cam);
  if (!tgt || !play.aim) return;
  const qb = play.qb;
  const from = { x: qb.pos.x, y: qb.pos.y, z: 2 };
  const to = { x: tgt.x, y: tgt.y, z: 1.2 };
  const { peak } = passParams(Math.hypot(to.x - from.x, to.y - from.y), qb.r.arm);

  // Pull-back band
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(play.aim.start.x, play.aim.start.y);
  g.lineTo(play.aim.cur.x, play.aim.cur.y);
  g.stroke();

  // Dotted arc
  g.fillStyle = '#ffffff';
  const n = 22;
  for (let i = 1; i < n; i++) {
    const p = flightPos(from, to, peak, i / n);
    const s = cam.toScreen(p.x, p.y, p.z);
    g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 1, 2, 2);
  }
  // Landing reticle
  const c = cam.toScreen(tgt.x, tgt.y);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(Math.round(c.x), Math.round(c.y), 9, 4, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffd23f';
  g.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 2, 2);
}

export function drawPlayer(g: CanvasRenderingContext2D, cam: Camera, p: Player, presnap: boolean): void {
  const s = cam.toScreen(p.pos.x, p.pos.y);
  const spr = getSprite(p.uniform, p.skin, poseOf(p, presnap), p.facing);
  g.drawImage(spr, Math.round(s.x - ANCHOR_X), Math.round(s.y - ANCHOR_Y));
}

/** `replay`: a key-play replay, the CPU on both sides, so none of the user's aids (routes, ring, handoff hint). */
export function drawPlay(g: CanvasRenderingContext2D, cam: Camera, play: Play, debug: boolean, replay = false): void {
  const presnap = play.phase === 'presnap';
  if (presnap && !replay) drawRoutePreview(g, cam, play);
  if (debug) drawDebug(g, cam, play);

  // Controlled player ring
  const ctl = replay ? null : play.controlled;
  if (ctl) {
    const s = cam.toScreen(ctl.pos.x, ctl.pos.y);
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(Math.round(s.x), Math.round(s.y), 8, 3, 0, 0, Math.PI * 2);
    g.stroke();
  }

  // Handoff window: the back can take it right now.
  const ho = replay ? null : play.handoffOption();
  if (ho) {
    const s = cam.toScreen(play.rb.pos.x, play.rb.pos.y);
    g.strokeStyle = '#9ad7ff';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(Math.round(s.x), Math.round(s.y), 9, 3.5, 0, 0, Math.PI * 2);
    g.stroke();
  }

  for (const p of play.players) {
    const s = cam.toScreen(p.pos.x, p.pos.y);
    drawShadow(g, s.x, s.y, 6);
  }
  const ball = play.ball;
  const airborne = ball.state === 'air' || ball.state === 'snap' || ball.state === 'bounce';
  if (airborne) {
    const s = cam.toScreen(ball.pos.x, ball.pos.y);
    drawShadow(g, s.x, s.y, 2.5);
  }

  const sorted = [...play.players].sort((a, b) => a.pos.y - b.pos.y);
  const bs = getBallSprite();
  for (const p of sorted) {
    drawPlayer(g, cam, p, presnap);
    if (ball.state === 'held' && ball.carrier === p) {
      const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
      g.drawImage(bs, Math.round(s.x - 4), Math.round(s.y - 4));
    }
  }
  if (ball.state === 'dead' && !ball.carrier) {
    const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
    g.drawImage(bs, Math.round(s.x - 4), Math.round(s.y - 4));
  }
  if (airborne) {
    const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
    g.drawImage(bs, Math.round(s.x - 4), Math.round(s.y - 4));
  }

  if (ctl) {
    const s = cam.toScreen(ctl.pos.x, ctl.pos.y);
    const x = Math.round(s.x);
    const y = Math.round(s.y - 27);
    g.fillStyle = '#ffd23f';
    g.fillRect(x - 3, y, 7, 1);
    g.fillRect(x - 2, y + 1, 5, 1);
    g.fillRect(x - 1, y + 2, 3, 1);
    g.fillRect(x, y + 3, 1, 1);
    if (ctl.stamina < 0.999) {
      // The bar's length shows how much sprint he has in him: shorter for a pocket QB than a receiver.
      const w = Math.round(10 + 8 * endurance(ctl));
      const bx = x - Math.round(w / 2) - 1;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(bx, Math.round(s.y) + 4, w + 2, 3);
      g.fillStyle = ctl.stamina > 0.3 ? '#5cff7a' : '#ff5a5a';
      g.fillRect(bx + 1, Math.round(s.y) + 5, Math.round(w * ctl.stamina), 1);
    }
  }

  if (ho) {
    const s = cam.toScreen(play.rb.pos.x, play.rb.pos.y);
    text(g, ho === 'pitch' ? 'R-CLICK PITCH' : 'R-CLICK', s.x, s.y + 6, { size: 8, align: 'center', color: '#9ad7ff' });
  }

  drawAim(g, cam, play);

  for (const pp of play.popups) {
    const s = cam.toScreen(pp.x, pp.y);
    const a = 1 - pp.t / 1.4;
    g.globalAlpha = Math.max(0, a);
    text(g, pp.text, s.x, s.y - 34 - pp.t * 14, { size: 8, align: 'center', color: pp.color });
    g.globalAlpha = 1;
  }
}
