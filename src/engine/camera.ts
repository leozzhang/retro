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

  update(dt: number, rate = 4): void {
    this.x += (this.targetX - this.x) * Math.min(1, dt * rate);
  }

  snap(): void {
    this.x = this.targetX;
  }

  toScreen(x: number, y: number, z = 0): Vec {
    return project(this.x, this.mirror ? FIELD_LEN - x : x, y, z);
  }

  toWorld(sx: number, sy: number): Vec {
    const w = unproject(this.x, sx, sy);
    return this.mirror ? { x: FIELD_LEN - w.x, y: w.y } : w;
  }
}
