import type { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL } from '../engine/constants';
import { add, dist, len, scale, type Vec } from '../engine/math';
import type { Play } from '../game/playState';
import { facingQB } from '../sim/ai';
import { flightPos, passParams, type ThrowKind } from '../sim/ball';
import { CATCH_REACH } from '../sim/catching';
import { endurance, isEligible, poseOf, type Player } from '../sim/player';
import type { Tape, TapeFrame } from '../game/tape';
import { laneScores, levered } from '../sim/runBlocking';
import { ANCHOR_X, ANCHOR_Y, carriesBall, getBallSprite, getSprite, POSE_LIFT, spinFrame, type Look } from './sprites';
import { text } from './text';

const ROUTE_COLORS = ['#ffd23f', '#5ce1ff', '#ff7ad9', '#ff9f43', '#9dff7a'];

/** Daylight on the field for the runner (the RUN ASSIST setting): always, only until the handoff, or never. */
export type RunAssist = 'FULL' | 'LIGHT' | 'OFF';

/**
 * Block reads under each engaged defender: past `even` rating points of edge a block shows as won
 * (green) or lost (red), and a losing block flickers when he's about to get off it (run blocks: his blocker's
 * `blockControl` under `control`; pass pro: power past `shed`).
 * Daylight shows lanes no defender can get to for `laneMin` s, full at `laneFull` s, `laneLen` yd long
 * past the LOS, eased by `laneEase` a frame.
 */
const BLOCK_READ = { even: 3, shed: 8, control: 0.3, laneMin: 0.35, laneFull: 0.8, laneLen: 3, laneEase: 0.25 };

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

/** The runner the daylight is for: the back before the handoff on a run, the user's carrier at the line after it. */
function laneRunner(play: Play, assist: RunAssist): Player | null {
  if (assist === 'OFF') return null;
  if (play.phase === 'live' && play.playDef.block === 'run' && !play.handedOff && play.time - play.snapTime > 0.15) return play.rb;
  if (assist === 'LIGHT') return null;
  const c = play.carrier;
  if (play.phase === 'run' && c && c.side === 'off' && !play.thrown && c.pos.x < play.los + 1) return c;
  return null;
}

/**
 * Who the pullers and lead backs are going for (RUN ASSIST): a faint dotted line from each one still on his
 * way to his man (`poa`). FULL shows them through the run; LIGHT only until the handoff.
 */
function drawAssignments(g: CanvasRenderingContext2D, cam: Camera, play: Play, assist: RunAssist): void {
  if (assist === 'OFF' || !play.runBlocking() || play.phase === 'presnap' || play.phase === 'over') return;
  if (assist === 'LIGHT' && play.handedOff) return;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const o of play.off) {
    const t = o.poa;
    if (!o.poaJob || !t || o.engaged || o.down || t.down) continue;
    const a = cam.toScreen(o.pos.x, o.pos.y);
    const b = cam.toScreen(t.pos.x, t.pos.y);
    const steps = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let k = 1; k < steps; k++) g.fillRect(Math.round(a.x + ((b.x - a.x) * k) / steps), Math.round(a.y + ((b.y - a.y) * k) / steps), 1, 1);
  }
}

/** Smoothed daylight per lane (keyed by half yards across), so lanes fade in and out instead of flickering. */
const laneGlow = new WeakMap<Play, Map<number, number>>();

function drawLanes(g: CanvasRenderingContext2D, cam: Camera, play: Play, assist: RunAssist): void {
  let glow = laneGlow.get(play);
  if (!glow) laneGlow.set(play, (glow = new Map()));
  const runner = laneRunner(play, assist);
  const now = new Map<number, number>();
  if (runner) for (const l of laneScores(play, runner)) now.set(Math.round(l.y * 2), Math.max(0, Math.min(1, (l.open - BLOCK_READ.laneMin) / (BLOCK_READ.laneFull - BLOCK_READ.laneMin))));
  for (const k of new Set([...glow.keys(), ...now.keys()])) {
    const a = (glow.get(k) ?? 0) + ((now.get(k) ?? 0) - (glow.get(k) ?? 0)) * BLOCK_READ.laneEase;
    if (a < 0.02) {
      glow.delete(k);
      continue;
    }
    glow.set(k, a);
    const y = k / 2;
    // A streak from the line downfield, fading out along its length.
    for (let i = 0; i < 3; i++) {
      const x0 = cam.toScreen(play.los + (i * BLOCK_READ.laneLen) / 3, y - 0.25);
      const x1 = cam.toScreen(play.los + ((i + 1) * BLOCK_READ.laneLen) / 3, y + 0.25);
      g.fillStyle = `rgba(190,255,205,${(a * 0.65 * (3 - i)) / 3})`;
      g.fillRect(Math.round(Math.min(x0.x, x1.x)), Math.round(x0.y), Math.round(Math.abs(x1.x - x0.x)), Math.max(2, Math.round(x1.y - x0.y)));
    }
  }
}

/**
 * Who's winning each block: a ring under the defender (green: the blocking is winning, gold: even,
 * red: he's beating it, flickering when he's about to shed; two rings for a double team), and on run
 * blocks a bar on the blocker's side of him, bright when the runner is on that side (he's walled off).
 */
function drawBlocks(g: CanvasRenderingContext2D, cam: Camera, play: Play): void {
  const run = play.runBlocking() || play.phase === 'run';
  const c = play.carrier?.side === 'off' && play.carrier !== play.qb ? play.carrier : play.rb;
  g.lineWidth = 1;
  for (const d of play.def) {
    const n = d.engagedBy.length;
    if (!n || d.down) continue;
    const s = cam.toScreen(d.pos.x, d.pos.y);
    const pw = d.blockPower;
    const col = pw < -BLOCK_READ.even ? '92,255,122' : pw > BLOCK_READ.even ? '255,90,90' : '255,210,63';
    // About to get off it: on a run block, once he's won most of it back (`blockControl`); in pass pro, by power.
    const aboutOff = play.runBlocking() ? d.blockControl < BLOCK_READ.control : pw > BLOCK_READ.shed;
    const fade = aboutOff && Math.floor(play.time * 8) % 2 === 0 ? 0.3 : 0.85;
    g.strokeStyle = `rgba(${col},${fade})`;
    for (let i = 0; i < Math.min(n, 2); i++) {
      g.beginPath();
      g.ellipse(Math.round(s.x), Math.round(s.y), 6 + i * 2.5, 2.2 + i, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (run && d.blockDir) {
      const bd = d.blockDir;
      const m = { x: d.pos.x + bd.x * 0.55, y: d.pos.y + bd.y * 0.55 };
      const a = cam.toScreen(m.x - bd.y * 0.6, m.y + bd.x * 0.6);
      const b = cam.toScreen(m.x + bd.y * 0.6, m.y - bd.x * 0.6);
      g.strokeStyle = levered(d, c.pos) ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(Math.round(a.x), Math.round(a.y));
      g.lineTo(Math.round(b.x), Math.round(b.y));
      g.stroke();
      g.lineWidth = 1;
    }
  }
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
  const { peak } = passParams(Math.hypot(to.x - from.x, to.y - from.y), qb.r.arm, play.throwKind);

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
  // The throw type, by the reticle only while aiming (the wheel or 1 changes it).
  text(g, THROW_LABEL[play.throwKind], Math.round(c.x) + 12, Math.round(c.y) - 3, { size: 6, color: '#ffd23f' });
}

const THROW_LABEL: Record<ThrowKind, string> = { bullet: 'BULLET', touch: 'TOUCH', lob: 'LOB' };

/** Hands go up for a found ball this close (yd) to where it's coming down. */
const HANDS_RANGE = 5;

/**
 * Where an upright player is looking (docs/PASSING.md): a route runner's head comes back to the QB once
 * he's looking for the ball (`eyes`), and anyone's hands come up once he's found a ball coming down near
 * him. A receiver the ball's thrown to before he looks keeps running head down: he never saw it.
 */
export function lookOf(play: Play, p: Player): Look {
  if (p.down || p.pose || p === play.carrier || p.engaged || p.engagedBy.length) return 'fwd';
  const behind = (play.qb.pos.x - p.pos.x) * p.facing < 0;
  const head = p.side === 'off' && p.passRoute && !p.isBlocker && p.eyes > 0.5 && behind;
  const air = play.phase === 'air' && play.ballTarget && !play.pitch;
  const found = p.side === 'off' ? play.time >= p.findAt : play.time >= p.reactAt;
  const hands = !!air && found && dist(p.pos, play.ballTarget!) < HANDS_RANGE;
  if (hands) return (play.ballTarget!.x - p.pos.x) * p.facing < -0.5 ? 'backHands' : 'hands';
  return head && play.phase !== 'presnap' && play.phase !== 'run' && play.phase !== 'over' ? 'back' : 'fwd';
}

/**
 * `ball`: he has it. Returns whether his sprite drew it in his hands; if not, the caller draws it at the
 * ball's spot.
 */
export function drawPlayer(g: CanvasRenderingContext2D, cam: Camera, p: Player, presnap: boolean, look: Look = 'fwd', ball = false): boolean {
  const s = cam.toScreen(p.pos.x, p.pos.y);
  const pose = poseOf(p, presnap);
  const spr = getSprite(p.uniform, p.skin, pose, (cam.mirror ? -p.facing : p.facing) as 1 | -1, look, ball);
  const lift = POSE_LIFT[pose] ?? 0;
  if (p.juke > 0) {
    // A cut leaves fading afterimages behind him.
    for (let i = 3; i >= 1; i--) {
      const gs = cam.toScreen(p.pos.x - p.vel.x * i * 0.05, p.pos.y - p.vel.y * i * 0.05);
      g.globalAlpha = 0.6 - i * 0.15;
      g.drawImage(spr, Math.round(gs.x - ANCHOR_X), Math.round(gs.y - ANCHOR_Y));
    }
    g.globalAlpha = 1;
  }
  g.drawImage(spr, Math.round(s.x - ANCHOR_X), Math.round(s.y - ANCHOR_Y - lift));
  return ball && carriesBall(pose, look);
}

/** One frame of a tape of a played snap (game/tape.ts): the men as they were, then the ball. */
export function drawTape(g: CanvasRenderingContext2D, cam: Camera, tape: Tape, f: TapeFrame): void {
  for (const m of f.men) {
    const s = cam.toScreen(m.x, m.y);
    drawShadow(g, s.x, s.y, 6);
  }
  const b = f.ball;
  const airborne = b.state === 'air' || b.state === 'snap' || b.state === 'bounce';
  if (airborne) {
    const s = cam.toScreen(b.x, b.y);
    drawShadow(g, s.x, s.y, 2.5);
  }
  const bs = getBallSprite();
  const order = f.men.map((_, i) => i).sort((i, j) => f.men[i].y - f.men[j].y);
  for (const i of order) {
    const m = f.men[i];
    const c = tape.cast[i];
    const held = b.state === 'held' && b.carrier === i;
    const spr = getSprite(c.uniform, c.skin, m.pose, (cam.mirror ? -m.facing : m.facing) as 1 | -1, m.look, held);
    const s = cam.toScreen(m.x, m.y);
    if (m.juke > 0) {
      for (let k = 3; k >= 1; k--) {
        const gs = cam.toScreen(m.x - m.vx * k * 0.05, m.y - m.vy * k * 0.05);
        g.globalAlpha = 0.6 - k * 0.15;
        g.drawImage(spr, Math.round(gs.x - ANCHOR_X), Math.round(gs.y - ANCHOR_Y));
      }
      g.globalAlpha = 1;
    }
    g.drawImage(spr, Math.round(s.x - ANCHOR_X), Math.round(s.y - ANCHOR_Y - (POSE_LIFT[m.pose] ?? 0)));
    if (held && !carriesBall(m.pose, m.look)) {
      const bp = cam.toScreen(b.x, b.y, b.z);
      g.drawImage(bs, Math.round(bp.x - 4), Math.round(bp.y - 4));
    }
  }
  if ((b.state === 'dead' && b.carrier < 0) || airborne) {
    const s = cam.toScreen(b.x, b.y, b.z);
    g.drawImage(getBallSprite(spinFrame(b.spin)), Math.round(s.x - 4), Math.round(s.y - 4));
  }
}

/**
 * `replay`: a key-play replay, the CPU on both sides, so none of the user's aids (routes, ring, handoff
 * hint, daylight). `assist` is the RUN ASSIST setting.
 */
export function drawPlay(g: CanvasRenderingContext2D, cam: Camera, play: Play, debug: boolean, replay = false, assist: RunAssist = 'FULL'): void {
  const presnap = play.phase === 'presnap';
  if (presnap && !replay) drawRoutePreview(g, cam, play);
  if (!replay) drawLanes(g, cam, play, assist);
  if (!replay) drawAssignments(g, cam, play, assist);
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
    const held = ball.state === 'held' && ball.carrier === p;
    if (!drawPlayer(g, cam, p, presnap, lookOf(play, p), held) && held) {
      const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
      g.drawImage(bs, Math.round(s.x - 4), Math.round(s.y - 4));
    }
  }
  drawBlocks(g, cam, play);
  if (ball.state === 'dead' && !ball.carrier) {
    const s = cam.toScreen(ball.pos.x, ball.pos.y, ball.pos.z);
    g.drawImage(getBallSprite(spinFrame(ball.spin)), Math.round(s.x - 4), Math.round(s.y - 4));
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
