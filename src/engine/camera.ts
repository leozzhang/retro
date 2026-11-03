import { FIELD_LEN, FIELD_TOP_PX, PPY_X, PPY_Y, PPY_Z, VIEW_W } from './constants';
import { clamp, type Vec } from './math';

export const VIEW_YARDS = VIEW_W / PPY_X;

export function project(camX: number, x: number, y: number, z = 0): Vec {
  return { x: (x - camX) * PPY_X, y: FIELD_TOP_PX + y * PPY_Y - z * PPY_Z };
}

export function unproject(camX: number, sx: number, sy: number): Vec {
  return { x: sx / PPY_X + camX, y: (sy - FIELD_TOP_PX) / PPY_Y };
}

export function clampCamX(x: number): number {
  return clamp(x, -6, FIELD_LEN + 6 - VIEW_YARDS);
}

export class Camera {
  x = 0;
  private targetX = 0;
  /** Draw the world flipped end to end, so an offense attacking +x goes left on screen (the CPU's key plays). */
  mirror = false;

  /** Keep world x at `lead` fraction of the screen width from the side the play is going away from. */
  follow(worldX: number, lead = 0.35): void {
    this.targetX = this.mirror ? clampCamX(FIELD_LEN - worldX - VIEW_YARDS * (1 - lead)) : clampCamX(worldX - VIEW_YARDS * lead);
  }

  /**
   * Zoom by spreading: positions are drawn `zx` times farther apart along the field and `zy` times
   * across it, about `zoomAt` (a world point kept where it is on screen, easing after the action),
   * while sprites stay their size, so a crowded line comes apart. `toScreen`, `toWorld` and the field
   * (`spreadX`, `spreadY`) all use it.
   */
  zx = 1;
  zy = 1;
  private zoomAt: Vec = { x: 0, y: 0 };
  private zoomGoal: Vec = { x: 0, y: 0 };

  /** Set the spread (`x` along, `y` across) at once, about world point `at`. */
  setZoom(x: number, y: number, at: Vec): void {
    this.zx = x;
    this.zy = y;
    this.zoomAt = { x: at.x, y: at.y };
    this.zoomGoal = { x: at.x, y: at.y };
  }

  /** Ease the zoom point toward world point `at` (the action). */
  zoomFollow(at: Vec): void {
    this.zoomGoal = { x: at.x, y: at.y };
  }

  update(dt: number, rate = 4): void {
    const k = Math.min(1, dt * rate);
    this.x += (this.targetX - this.x) * k;
    this.zoomAt = { x: this.zoomAt.x + (this.zoomGoal.x - this.zoomAt.x) * k, y: this.zoomAt.y + (this.zoomGoal.y - this.zoomAt.y) * k };
  }

  /** The zoom point on screen, unspread. */
  private focus(): Vec {
    return project(this.x, this.mirror ? FIELD_LEN - this.zoomAt.x : this.zoomAt.x, this.zoomAt.y);
  }

  /** Spread an unzoomed screen x (or ground y) about the zoom point. */
  spreadX(sx: number): number {
    if (this.zx === 1) return sx;
    const f = this.focus().x;
    return f + (sx - f) * this.zx;
  }

  spreadY(sy: number): number {
    if (this.zy === 1) return sy;
    const f = this.focus().y;
    return f + (sy - f) * this.zy;
  }

  snap(): void {
    this.x = this.targetX;
  }

  toScreen(x: number, y: number, z = 0): Vec {
    const p = project(this.x, this.mirror ? FIELD_LEN - x : x, y);
    return { x: this.spreadX(p.x), y: this.spreadY(p.y) - z * PPY_Z };
  }

  toWorld(sx: number, sy: number): Vec {
    const f = this.focus();
    const w = unproject(this.x, f.x + (sx - f.x) / this.zx, f.y + (sy - f.y) / this.zy);
    return this.mirror ? { x: FIELD_LEN - w.x, y: w.y } : w;
  }
}
