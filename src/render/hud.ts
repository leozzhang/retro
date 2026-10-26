import type { Team } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { text, textWidth } from './text';

function readable(bg: string, fg: string): string {
  return bg.toLowerCase() === fg.toLowerCase() ? '#ffffff' : fg;
}

export function drawScorebug(
  g: CanvasRenderingContext2D, user: Team, cpu: Team, score: { user: number; cpu: number }, clock: string, center: string, right: string,
): void {
  g.fillStyle = 'rgba(8,10,14,0.88)';
  g.fillRect(0, 0, VIEW_W, 16);
  let x = 0;
  for (const [team, pts, poss] of [[user, score.user, true], [cpu, score.cpu, false]] as const) {
    g.fillStyle = team.colors.primary;
    g.fillRect(x, 0, 78, 16);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + 54, 0, 24, 16);
    text(g, team.abbr, x + 5, 4, { color: readable(team.colors.primary, '#ffffff') });
    text(g, String(pts), x + 66, 4, { align: 'center' });
    if (poss) {
      g.fillStyle = '#ffd23f';
      g.fillRect(x + 46, 6, 3, 3);
    }
    x += 80;
  }
  g.fillStyle = '#222b38';
  g.fillRect(160, 0, 78, 16);
  text(g, clock, 199, 4, { align: 'center' });
  text(g, center, 246, 4, { color: '#ffd23f' });
  text(g, right, VIEW_W - 6, 4, { align: 'right', color: '#cfd6df' });
}

export function drawBanner(g: CanvasRenderingContext2D, title: string, sub: string, color: string, extra = ''): void {
  const y = 118;
  g.fillStyle = 'rgba(8,10,14,0.78)';
  g.fillRect(0, y, VIEW_W, extra ? 70 : 58);
  g.fillStyle = color;
  g.fillRect(0, y, VIEW_W, 2);
  text(g, title, VIEW_W / 2, y + 12, { size: 16, align: 'center', color });
  if (sub) text(g, sub, VIEW_W / 2, y + 36, { size: 8, align: 'center', color: '#e6e6e6' });
  if (extra) text(g, extra, VIEW_W / 2, y + 52, { size: 8, align: 'center', color: '#ffd23f' });
}

export function drawHint(g: CanvasRenderingContext2D, s: string): void {
  g.fillStyle = 'rgba(8,10,14,0.65)';
  g.fillRect(0, 346, VIEW_W, 14);
  text(g, s, VIEW_W / 2, 349, { size: 8, align: 'center', color: '#cfd6df' });
}

/** Play clock box under the scorebug's right edge: red at 10, flashing at 5. */
export function drawPlayClock(g: CanvasRenderingContext2D, s: string, secs: number, t: number): void {
  const x = VIEW_W - 44;
  g.fillStyle = 'rgba(8,10,14,0.85)';
  g.fillRect(x, 18, 40, 16);
  const urgent = secs <= 10;
  const flash = secs <= 5 && Math.floor(t * 4) % 2 === 0;
  g.fillStyle = urgent ? '#ff5a5a' : '#5d6b80';
  g.fillRect(x, 32, 40, 2);
  text(g, s, x + 20, 22, { align: 'center', color: flash ? '#ffffff' : urgent ? '#ff5a5a' : '#ffffff' });
}

/**
 * A big snap (data/confidence.ts): a CLUTCH tag left of the play clock with the key man's confidence,
 * green when he's confident, red when he's shaky.
 */
export function drawClutch(g: CanvasRenderingContext2D, who: string, label: string, conf: number): void {
  const s = `CLUTCH  ${who} ${label}`;
  const w = Math.ceil(textWidth(g, s, 8)) + 10;
  const x = VIEW_W - 48 - w;
  g.fillStyle = 'rgba(8,10,14,0.85)';
  g.fillRect(x, 18, w, 16);
  g.fillStyle = '#ffd23f';
  g.fillRect(x, 32, w, 2);
  text(g, s, x + 5, 22, { size: 8, color: conf >= 0.2 ? '#7dff9a' : conf <= -0.2 ? '#ff5a5a' : '#ffffff' });
}
