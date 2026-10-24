import type { Vec } from './math';

const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1', 'Tab', 'Backquote']);

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  /** `downX/downY` = where the current/last press started, captured at event time. */
  /** `rpressed` = right button went down this step (hand off / pitch). */
  mouse = { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (BLOCKED.has(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.mouse.rpressed = true;
      if (e.button !== 0) return;
      this.updatePos(e);
      this.mouse.downX = this.mouse.x;
      this.mouse.downY = this.mouse.y;
      this.mouse.down = true;
      this.mouse.pressed = true;
    });
    window.addEventListener('mousemove', (e) => this.updatePos(e));
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.updatePos(e);
      if (this.mouse.down) this.mouse.released = true;
      this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private updatePos(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) * this.canvas.width) / r.width;
    this.mouse.y = ((e.clientY - r.top) * this.canvas.height) / r.height;
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  hit(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** WASD / arrow movement axis in world orientation (+x downfield, +y toward near sideline). */
  axis(): Vec {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    return { x, y };
  }

  /** Call after each fixed update step so one-shot events are consumed once. */
  endStep(): void {
    this.pressed.clear();
    this.mouse.pressed = false;
    this.mouse.released = false;
    this.mouse.rpressed = false;
  }
}
