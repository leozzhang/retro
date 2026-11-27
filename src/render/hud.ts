import type { Team } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { text, textWidth } from './text';

function readable(bg: string, fg: string): string {
  return bg.toLowerCase() === fg.toLowerCase() ? '#ffffff' : fg;
}

/** Each team's timeouts left (`max` a half, or one an overtime period), as pips on the scorebug. */
export interface TimeoutPips {
  user: number;
  cpu: number;
  max: number;
}

export function drawScorebug(
  g: CanvasRenderingContext2D, user: Team, cpu: Team, score: { user: number; cpu: number }, clock: string, center: string, right: string,
  to?: TimeoutPips,
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
    if (to) {
      // Timeouts left: bright pips, the used ones dim.
      const left = poss ? to.user : to.cpu;
      for (let i = 0; i < to.max; i++) {
        g.fillStyle = i < left ? '#ffd23f' : 'rgba(0,0,0,0.45)';
        g.fillRect(x + 5 + i * 8, 13, 6, 2);
      }
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
  // A hint too wide for the bar closes up its double spaces, then is cut at the edge.
  const max = Math.floor((VIEW_W - 8) / 8);
  const fit = s.length > max ? s.replace(/ {2,}/g, ' ').slice(0, max) : s;
  text(g, fit, VIEW_W / 2, 349, { size: 8, align: 'center', color: '#cfd6df' });
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

/** Tempo tag under the play clock: HUDDLE or HURRY, with the H key on the call screen. */
export function drawTempo(g: CanvasRenderingContext2D, hurry: boolean, key: boolean): void {
  const s = `${key ? 'H ' : ''}${hurry ? 'HURRY' : 'HUDDLE'}`;
  const w = Math.ceil(textWidth(g, s, 8)) + 8;
  const x = VIEW_W - 4 - w;
  g.fillStyle = 'rgba(8,10,14,0.85)';
  g.fillRect(x, 36, w, 12);
  text(g, s, x + w / 2, 38, { align: 'center', color: hurry ? '#ffd23f' : '#cfd6df', shadow: false });
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

/** What the timeout card shows (`drawTimeoutPanel`). */
export interface TimeoutCard {
  /** Who called it: "YOUR TIMEOUT" or the CPU's. */
  title: string;
  color: string;
  /** The quarter and clock, the down, distance and spot, the score. */
  lines: string[];
  /** The coaching line: what the clock and the score say. */
  advice: string;
  you: { abbr: string; left: number };
  them: { abbr: string; left: number };
  max: number;
}

/** A timeout's card over the field, between the scorebug and the play-call panel: the clocks are stopped until play resumes. */
export function drawTimeoutPanel(g: CanvasRenderingContext2D, c: TimeoutCard): void {
  // Clear of the DC's note (just over the call panel) and the play clock (top right).
  const x = 8;
  const y = 18;
  const w = 340;
  const h = 58;
  g.fillStyle = 'rgba(8,10,14,0.9)';
  g.fillRect(x, y, w, h);
  g.fillStyle = c.color;
  g.fillRect(x, y, w, 2);
  text(g, c.title, x + 6, y + 5, { color: c.color });
  text(g, 'CLOCKS STOPPED', x + w - 6, y + 5, { align: 'right', color: '#8fa0b8', shadow: false });
  c.lines.forEach((l, i) => text(g, l, x + 6, y + 16 + i * 10, { color: '#e6e6e6', shadow: false }));
  const py = y + 16 + c.lines.length * 10;
  let px = x + 6;
  for (const t of [c.you, c.them]) {
    const label = `${t.abbr} TIMEOUTS`;
    text(g, label, px, py, { color: '#cfd6df', shadow: false });
    px += Math.ceil(textWidth(g, label, 8)) + 6;
    for (let i = 0; i < c.max; i++) {
      g.fillStyle = i < t.left ? '#ffd23f' : '#2a3446';
      g.fillRect(px + i * 9, py + 2, 7, 4);
    }
    px += c.max * 9 + 16;
  }
  text(g, c.advice, x + 6, py + 11, { color: '#ffd23f', shadow: false });
}
