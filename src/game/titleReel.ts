import { RIVALRIES } from '../data/season/rivalries';
import { teamById, type Team } from '../data/teams';
import { REEL, REEL_BALL, REEL_LOOKS, REEL_POSES, type ReelClip, type ReelFile, type ReelKind } from '../data/titleReel';
import { Camera } from '../engine/camera';
import { VIEW_W } from '../engine/constants';
import { drawField, makeCrowd } from '../render/field';
import { drawTape } from '../render/renderer';
import { teamUniform } from '../render/sprites';
import { text } from '../render/text';
import type { Tape, TapeFrame, TapeMan } from './tape';

/**
 * The title screen's highlight reel (data/titleReel.ts): tapes recorded once by `npm run reel`, encoded
 * small, and played back here behind the main menu with no simulation. Display only.
 */

const POSE_IX = new Map(REEL_POSES.map((p, i) => [p, i]));
const LOOK_IX = new Map(REEL_LOOKS.map((l, i) => [l, i]));
const BALL_IX = new Map(REEL_BALL.map((b, i) => [b, i]));

// ------------------------------------------------------------ encoding (the generator)

/** A tape as a clip on file: its snap from the presnap on, at `REEL.fps`. */
export function encodeClip(tape: Tape, home: string, away: string, name: string, kind: ReelKind): ReelClip {
  const s = REEL.scale;
  const q = (v: number) => Math.round(v * s);
  const kit = tape.cast.map((c) => (c.uniform.key.endsWith('-h') ? 'h' : 'a')).join('');
  const men: number[] = [];
  const ball: number[] = [];
  const cam: number[] = [];
  const len = tape.frames[tape.frames.length - 1].t;
  let n = 0;
  for (let t = 0; t <= len + 1e-6; t += 1 / REEL.fps) {
    // The frame on at t (the tape's are 1/30 s apart; ours every other one).
    let f = tape.frames[0];
    for (const g of tape.frames) {
      if (g.t > t + 1e-6) break;
      f = g;
    }
    for (const m of f.men) {
      const pack = (POSE_IX.get(m.pose) ?? 0) | ((LOOK_IX.get(m.look) ?? 0) << 6) | ((m.facing === 1 ? 1 : 0) << 8) | ((m.juke > 0 ? 1 : 0) << 9);
      men.push(q(m.x), q(m.y), pack);
    }
    const b = f.ball;
    ball.push(BALL_IX.get(b.state) ?? 0, q(b.x), q(b.y), q(b.z), b.carrier, b.spin === undefined ? -1 : Math.floor(b.spin));
    cam.push(q(f.focus), Math.round(f.lead * 100));
    n++;
  }
  return { home, away, name, kind, kit, skin: tape.cast.map((c) => c.skin), n, men, ball, cam };
}

// ------------------------------------------------------------ decoding (the title)

interface Clip {
  home: Team;
  away: Team;
  /** The offense (attacking +x, as on every tape) and the defense, whose end zone is the far one. */
  off: Team;
  def: Team;
  name: string;
  tape: Tape;
  /** Seconds from the snap to the end. */
  len: number;
  /** Per frame: x and y of each man, unpacked, for interpolating between frames. */
  xs: Float32Array[];
  ys: Float32Array[];
}

function decodeClip(c: ReelClip, fps: number, scale: number): Clip {
  const home = teamById(c.home);
  const away = teamById(c.away);
  const kits = { h: teamUniform(home, true), a: teamUniform(away, false) };
  const cast = [...c.kit].map((k, i) => ({ uniform: k === 'h' ? kits.h : kits.a, skin: c.skin[i] }));
  const men = cast.length;
  const frames: TapeFrame[] = [];
  const xs: Float32Array[] = [];
  const ys: Float32Array[] = [];
  for (let i = 0; i < c.n; i++) {
    const fx = new Float32Array(men);
    const fy = new Float32Array(men);
    const list: TapeMan[] = [];
    for (let j = 0; j < men; j++) {
      const o = (i * men + j) * 3;
      const pack = c.men[o + 2];
      fx[j] = c.men[o] / scale;
      fy[j] = c.men[o + 1] / scale;
      list.push({
        x: fx[j], y: fy[j], vx: 0, vy: 0, facing: pack & 256 ? 1 : -1,
        pose: REEL_POSES[pack & 63] ?? 'stand', look: REEL_LOOKS[(pack >> 6) & 3] ?? 'fwd', juke: pack & 512 ? 1 : 0,
      });
    }
    const b = c.ball.slice(i * 6, i * 6 + 6);
    frames.push({
      t: i / fps, men: list,
      ball: { state: REEL_BALL[b[0]] ?? 'dead', x: b[1] / scale, y: b[2] / scale, z: b[3] / scale, carrier: b[4], ...(b[5] >= 0 ? { spin: b[5] } : {}) },
      focus: c.cam[i * 2] / scale, lead: c.cam[i * 2 + 1] / 100,
    });
    xs.push(fx);
    ys.push(fy);
  }
  // The juke's ghosts trail along the man's velocity: from the frames either side.
  for (let i = 0; i < frames.length; i++) {
    const a = Math.max(0, i - 1);
    const z = Math.min(frames.length - 1, i + 1);
    const dt = (z - a) / fps || 1;
    frames[i].men.forEach((m, j) => {
      m.vx = (xs[z][j] - xs[a][j]) / dt;
      m.vy = (ys[z][j] - ys[a][j]) / dt;
    });
  }
  // The offense is first in the cast.
  const [off, def] = c.kit[0] === 'h' ? [home, away] : [away, home];
  return { home, away, off, def, name: c.name, tape: { cast, frames }, len: (c.n - 1) / fps, xs, ys };
}

/** The rivalry's name for a matchup, else the two schools. */
export function rivalryName(a: string, b: string): string {
  const r = RIVALRIES.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  return r ? r.name.toUpperCase() : `${teamById(a).school} VS ${teamById(b).school}`.toUpperCase();
}

// ------------------------------------------------------------ the player

let loading: Promise<TitleReel | null> | null = null;

/** The reel, fetched once; null if the file is missing or bad (the title keeps its still field). */
export function loadReel(): Promise<TitleReel | null> {
  loading ??= (typeof fetch === 'undefined' ? Promise.resolve(null) : fetch('title/reel.json')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
    .then((f: ReelFile) => (f.clips?.length ? new TitleReel(f) : null))
    .catch((err) => {
      console.warn('title reel: not loaded', err);
      return null;
    }));
  return loading;
}

export class TitleReel {
  private clips: Clip[];
  private order: number[] = [];
  private clip!: Clip;
  /** Seconds into the clip, from the start of its presnap hold. */
  private t = 0;
  private crowd: HTMLCanvasElement | null = null;
  private crowdKey = '';
  readonly cam = new Camera();

  constructor(f: ReelFile) {
    this.clips = f.clips.map((c) => decodeClip(c, f.fps, f.scale));
    this.next();
  }

  /** A shuffled run through every clip before any repeats, never the same one twice in a row. */
  private next(): void {
    if (!this.order.length) {
      const last = this.clip ? this.clips.indexOf(this.clip) : -1;
      this.order = this.clips.map((_, i) => i).sort(() => Math.random() - 0.5);
      if (this.order.length > 1 && this.order[this.order.length - 1] === last) this.order.reverse();
    }
    this.clip = this.clips[this.order.pop()!];
    this.t = 0;
    this.cam.follow(this.clip.tape.frames[0].focus, this.clip.tape.frames[0].lead);
    this.cam.snap();
  }

  /** Total seconds the clip is on: the hold, the snap to the end, and the fade out. */
  private span(): number {
    return REEL.hold + this.clip.len + REEL.fade;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.t >= this.span()) this.next();
    const f = this.frame();
    this.cam.follow(f.focus, f.lead);
    this.cam.update(dt);
  }

  /** The frame on now: positions between the two frames on file around it, the rest from the earlier one. */
  private frame(): TapeFrame {
    const c = this.clip;
    const fr = c.tape.frames;
    const k = Math.max(0, Math.min(this.t - REEL.hold, c.len)) * (fr.length > 1 ? (fr.length - 1) / c.len : 0);
    const i = Math.min(fr.length - 1, Math.floor(k));
    const j = Math.min(fr.length - 1, i + 1);
    const u = k - i;
    if (u <= 0 || i === j) return fr[i];
    const a = fr[i];
    const b = fr[j];
    const lerp = (p: number, q: number) => p + (q - p) * u;
    return {
      ...a,
      men: a.men.map((m, n) => ({ ...m, x: lerp(c.xs[i][n], c.xs[j][n]), y: lerp(c.ys[i][n], c.ys[j][n]) })),
      // A ball changing hands or state jumps; one in flight glides.
      ball: a.ball.state === b.ball.state && a.ball.carrier === b.ball.carrier
        ? { ...a.ball, x: lerp(a.ball.x, b.ball.x), y: lerp(a.ball.y, b.ball.y), z: lerp(a.ball.z, b.ball.z) }
        : a.ball,
      focus: lerp(a.focus, b.focus),
    };
  }

  draw(g: CanvasRenderingContext2D): void {
    const c = this.clip;
    const key = `${c.home.id}|${c.away.id}`;
    if (!this.crowd || this.crowdKey !== key) {
      this.crowd = makeCrowd(c.home, c.away);
      this.crowdKey = key;
    }
    // drawField paints its first team's end zone at the near end, as the user's on the field.
    drawField(g, this.cam, c.off, c.def, this.crowd);
    drawTape(g, this.cam, c.tape, this.frame());
    // Fade in from black at the start, out at the end.
    const fadeIn = 1 - Math.min(1, this.t / REEL.fade);
    const fadeOut = Math.max(0, (this.t - (this.span() - REEL.fade)) / REEL.fade);
    const black = Math.max(fadeIn, fadeOut);
    g.fillStyle = `rgba(8,10,14,${REEL.dim})`;
    g.fillRect(0, 0, VIEW_W, 360);
    if (black > 0) {
      g.fillStyle = `rgba(0,0,0,${black.toFixed(3)})`;
      g.fillRect(0, 0, VIEW_W, 360);
    }
  }

  /** The caption, drawn over the menu: the rivalry and the play. */
  drawCaption(g: CanvasRenderingContext2D, x: number, y: number): void {
    const fade = Math.min(1, this.t / REEL.fade, Math.max(0, (this.span() - this.t) / REEL.fade));
    g.globalAlpha = 0.75 * fade;
    text(g, this.clip.name, x, y, { color: '#8fa0b8', shadow: false });
    g.globalAlpha = 1;
  }
}
