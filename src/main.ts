import '@fontsource/press-start-2p/400.css';
import { STEP, VIEW_H, VIEW_W } from './engine/constants';
import { Input } from './engine/input';
import { initStore, onStoreError } from './engine/storage';
import { Game } from './game/game';
import { STARRED_KEY } from './game/starred';
import { text } from './render/text';
import { SEASON_KEY } from './season/save';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;

function resize(): void {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  // Prefer whole-number scaling for crisp pixels when the window is big enough.
  const scale = s >= 2 && s - Math.floor(s) < 0.25 ? Math.floor(s) : s;
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', resize);
resize();

async function boot(): Promise<void> {
  try {
    await document.fonts.load('8px "Press Start 2P"');
  } catch {
    // Fall back to monospace if the font fails to load.
  }
  await initStore([SEASON_KEY, STARRED_KEY]);
  let saveFailed = -Infinity;
  onStoreError(() => {
    saveFailed = performance.now();
  });
  const input = new Input(canvas);
  const game = new Game();
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game; // console debugging
  let acc = 0;
  let last = performance.now();

  const frame = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      game.update(STEP * game.timeScale(), input);
      input.endStep();
      acc -= STEP;
    }
    game.render(g);
    if (now - saveFailed < SAVE_ERROR_MS) drawSaveError(g);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** How long a failed save stays on screen. */
const SAVE_ERROR_MS = 5000;

function drawSaveError(g: CanvasRenderingContext2D): void {
  const y = VIEW_H / 2 - 10;
  g.fillStyle = 'rgba(8,10,14,0.9)';
  g.fillRect(0, y, VIEW_W, 20);
  g.fillStyle = '#ff5a5a';
  g.fillRect(0, y, VIEW_W, 1);
  g.fillRect(0, y + 19, VIEW_W, 1);
  text(g, 'SAVE FAILED: PROGRESS NOT SAVED', VIEW_W / 2, y + 6, { align: 'center', color: '#ff5a5a' });
}

boot();
