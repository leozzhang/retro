import { teamById, type Team } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import type { Box } from './menuScreen';
import { storyOf } from '../season/storylines';
import type { Moment, MomentPlayer, SeasonState, Storyline } from '../season/types';
import { drawHint } from './hud';
import {
  backdrop, clamp01, confetti, devBadge, DIM, ease, GOLD, GREEN, hero, moveMark, playerCard, rain, ratingBars, RED, rise, rolled, seg,
  slam, SOFT, spotlight, starPips, trophy, wrap,
} from './momentArt';
import type { Pose } from './sprites';
import { text } from './text';

/**
 * The Week Wrap (docs/STORYLINES.md): after a week, its moments one scene at a time. Each scene is a
 * timeline over `t`; a click finishes it, the next click moves on. A decision's card waits for the
 * choice (1/2 or a click) and never blocks: Esc leaves it for HOME.
 */

export interface WrapView {
  list: Moment[];
  i: number;
  t: number;
  /** Watching again from HOME or STORYLINES: nothing is marked seen. */
  replay: boolean;
  mx: number;
  my: number;
}

export const newWrapView = (list: Moment[], replay = false): WrapView => ({ list, i: 0, t: 0, replay, mx: 0, my: 0 });

const CX = VIEW_W / 2;
const FLOOR = 262;

/** The biggest title size (32, 24 or 16) that fits `w` pixels: Press Start 2P is one `size` per character. */
const fit = (s: string, w: number, max = 32) => [32, 24, 16].find((z) => z <= max && s.length * z <= w) ?? 16;

/** How long each kind takes to play in full (seconds); its last lines may add to it. */
export function sceneDur(m: Moment): number {
  const per = 0.25 * m.lines.length;
  switch (m.kind) {
    case 'final': return 1.4 + per;
    case 'breakout': return 2.6 + per;
    case 'breakthrough': return 1.8 + per;
    case 'injury': return m.p ? 2.4 + per : 1.2 + per;
    case 'poll': return 1.2 + 0.12 * (m.rows?.length ?? 0);
    case 'heisman': return 1.4 + 0.12 * (m.rows?.length ?? 0) + per;
    case 'progress':
    case 'around':
    case 'preview': return 0.5 + 0.12 * (m.rows?.length ?? 0);
    case 'decision': return 0.8;
    case 'commit': return 2.8 + per;
    case 'draft': return m.p ? 2.4 + per : 0.6 + 0.12 * (m.rows?.length ?? 0);
    case 'signing': return m.p ? 1.8 + per : 0.6 + 0.06 * (m.rows?.length ?? 0);
    case 'farewell': return 0.6 + 0.06 * (m.rows?.length ?? 0);
    case 'staff':
    case 'portal':
    case 'arrivals': return 0.5 + 0.12 * (m.rows?.length ?? 0);
    case 'opener': return 1.8 + per;
    default: return 1.2 + per;
  }
}

/** The two option panels of a decision card. */
export function decisionRect(i: number): Box {
  return { x: i ? CX + 6 : 24, y: 128, w: CX - 30, h: 190 };
}

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

export function decisionAt(x: number, y: number): number {
  return inBox(decisionRect(0), x, y) ? 0 : inBox(decisionRect(1), x, y) ? 1 : -1;
}

export function drawWrap(g: CanvasRenderingContext2D, s: SeasonState, v: WrapView): void {
  const m = v.list[v.i];
  if (!m) return;
  const team = teamById(m.team);
  const t = v.t;
  const story = storyOf(s, m);
  switch (m.kind) {
    case 'final': drawFinal(g, m, team, t); break;
    case 'breakout': drawBreakout(g, m, team, t); break;
    case 'breakthrough': drawBreakthrough(g, m, team, t); break;
    case 'injury': drawInjury(g, m, team, t); break;
    case 'firstStart': drawFirstStart(g, m, team, t); break;
    case 'poll': drawLadder(g, m, team, t, 'poll'); break;
    case 'heisman': drawLadder(g, m, team, t, 'heisman'); break;
    case 'milestone': drawMilestone(g, m, team, t); break;
    case 'stakes': drawStakes(g, m, team, t); break;
    case 'progress': drawTiles(g, m, team, t); break;
    case 'around': drawAround(g, m, team, t); break;
    case 'preview': drawPreview(g, m, team, t); break;
    case 'decision': drawDecision(g, m, team, t, story, v); break;
    case 'commit': drawCommit(g, m, team, t); break;
    case 'award': drawLadder(g, m, team, t, 'heisman'); break;
    case 'draft': if (m.p) drawDraft(g, m, team, t); else drawList(g, m, team, t); break;
    case 'signing': if (m.p) drawSigning(g, m, team, t); else drawTiles(g, m, team, t); break;
    case 'farewell': drawTiles(g, m, team, t); break;
    case 'staff':
    case 'portal':
    case 'arrivals': drawList(g, m, team, t); break;
    case 'opener': drawOpener(g, m, team, t); break;
    default: drawStory(g, m, team, t, story);
  }
  drawFrame(g, m, v, story);
}

const OS_LABEL: Record<NonNullable<Moment['os']>, string> = {
  carousel: 'THE CAROUSEL', departures: 'DEPARTURES', signing: 'SIGNING DAY', portal: 'THE PORTAL', opener: 'A NEW SEASON',
};

/** The strip on top (the week, which card) and the hint bar. */
function drawFrame(g: CanvasRenderingContext2D, m: Moment, v: WrapView, story: Storyline | undefined): void {
  g.fillStyle = 'rgba(5,7,10,0.85)';
  g.fillRect(0, 0, VIEW_W, 18);
  const when = m.os ? OS_LABEL[m.os] : `WEEK ${m.week}`;
  text(g, v.replay ? `REPLAY  -  ${when}` : m.os ? when : `${when} WRAP`, 8, 5, { color: GOLD, shadow: false });
  const n = v.list.length;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i === v.i ? GOLD : i < v.i ? SOFT : '#2a3546';
    g.fillRect(VIEW_W - 10 - (n - i) * 10, 6, 7, 6);
  }
  if (m.arc && m.kind !== 'decision' && story) text(g, `STORYLINE: ${story.title}`.slice(0, 36), CX, 5, { align: 'center', color: SOFT, shadow: false });
  const done = v.t >= sceneDur(m);
  if (m.kind === 'decision' && story?.decision && story.decision.chosen === undefined) drawHint(g, '1 / 2 OR CLICK: CHOOSE   ESC: DECIDE LATER ON HOME');
  else {
    // An offseason stage's reveal goes back to its stage, not HOME.
    const where = m.os && m.os !== 'opener' ? (v.i < n - 1 ? 'SKIP' : 'BACK') : v.i < n - 1 ? 'SKIP TO HOME' : 'HOME';
    drawHint(g, `${done ? 'CLICK OR SPACE: NEXT' : 'CLICK: SKIP AHEAD'}   ESC: ${where}   ${v.i + 1}/${n}`);
  }
}

function titleBlock(g: CanvasRenderingContext2D, m: Moment, t: number, x: number, color: string, align: CanvasTextAlign = 'center', at = 0.25): void {
  const size = fit(m.title, align === 'center' && x === CX ? 600 : 300);
  slam(g, m.title, x, 30, seg(t, at, 0.4), size, color, align);
  rise(g, m.sub.slice(0, align === 'center' ? 76 : 40), x, 36 + size + 6, seg(t, at + 0.3, 0.3), { color: '#ffffff', align });
}

function lines(g: CanvasRenderingContext2D, ls: string[], x: number, y: number, t: number, at: number, align: CanvasTextAlign = 'center', width = 74, color = SOFT): number {
  let row = 0;
  ls.forEach((l, i) => {
    for (const w of wrap(l, width)) {
      rise(g, w, x, y + row * 12, seg(t, at + i * 0.25, 0.3), { color: i === 0 ? '#e6e6e6' : color, align, shadow: false });
      row++;
    }
  });
  return row * 12;
}

/** The rank strip under a final: AP NO. 16 rolling to NO. 9. */
function rankRoll(g: CanvasRenderingContext2D, n: [number, number] | undefined, x: number, y: number, f: number): void {
  if (!n || (n[0] >= 26 && n[1] >= 26)) return;
  const [a, b] = n;
  const now = rolled(a, b, f);
  const label = now >= 26 ? 'NR' : `NO. ${now}`;
  const col = b < a ? GREEN : b > a ? RED : SOFT;
  rise(g, `AP ${a >= 26 ? 'NR' : `NO. ${a}`}  >  ${label}`, x, y, clamp01(f * 3), { color: f >= 1 ? col : '#ffffff', align: 'center' });
}

// ------------------------------------------------------------ scenes

function drawFinal(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  const style = m.style ?? 'win';
  const won = style !== 'loss' && style !== 'stunned';
  const big = style === 'upset' || style === 'champion' || style === 'title';
  backdrop(g, team, t, won ? (big ? 'gold' : 'team') : style === 'stunned' ? 'red' : 'dark');
  if (style === 'stunned') rain(g, m.id, t);
  if (big) confetti(g, m.id, t, [GOLD, '#ffffff', team.colors.primary, team.colors.secondary]);
  const opp = m.opp ? teamById(m.opp) : team;
  const pose = (me: boolean): Pose => (t < 0.9 ? 'stand' : me === won ? (Math.floor(t * 3) % 2 ? 'cheer' : 'spikeUp') : 'stand');
  hero(g, team, m.p?.skin ?? '#c68a5e', 140, FLOOR, 5, pose(true), 1);
  hero(g, opp, '#8d5a3b', VIEW_W - 140, FLOOR, 5, pose(false), -1, { home: false, alpha: won ? 0.7 : 1 });
  titleBlock(g, m, t, CX, won ? GOLD : style === 'stunned' ? RED : '#e6e6e6');
  const [us, them] = m.score ?? [0, 0];
  slam(g, `${us}`, CX - 56, 120, seg(t, 0.45, 0.3), 32, won ? '#ffffff' : SOFT);
  rise(g, '-', CX, 128, seg(t, 0.55, 0.2), { size: 16, color: DIM, align: 'center' });
  slam(g, `${them}`, CX + 56, 120, seg(t, 0.6, 0.3), 32, won ? SOFT : '#ffffff');
  rise(g, team.abbr, CX - 56, 162, seg(t, 0.7, 0.3), { color: team.colors.secondary === '#ffffff' ? '#ffffff' : SOFT, align: 'center' });
  rise(g, opp.abbr, CX + 56, 162, seg(t, 0.7, 0.3), { color: SOFT, align: 'center' });
  rankRoll(g, m.n, CX, 186, seg(t, 0.9, 0.8));
  lines(g, m.lines, CX, 272, t, 1.1);
}

function drawBreakout(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'dark');
  const p = m.p!;
  spotlight(g, 170, FLOOR, ease(seg(t, 0.1, 0.5)));
  const pose: Pose = t < 0.55 ? 'stance' : t < 0.9 ? 'crouch' : t < 1.5 ? 'leap' : Math.floor(t * 2.5) % 2 ? 'cheer' : 'spikeUp';
  const lift = t >= 0.9 && t < 1.5 ? Math.sin(((t - 0.9) / 0.6) * Math.PI) * 46 : 0;
  hero(g, team, p.skin, 170, FLOOR, 6, pose, 1, { lift });
  // The flash as he lands the leap.
  const fl = 1 - seg(t, 1.0, 0.45);
  if (t >= 1.0 && fl > 0) {
    g.fillStyle = `rgba(255,246,210,${0.65 * fl})`;
    g.fillRect(0, 0, VIEW_W, 360);
  }
  if (t >= 1.0) confetti(g, m.id, t - 1.0, [GOLD, '#ffffff', team.colors.primary], 50);
  const x = 310;
  slam(g, 'BREAKOUT', x, 30, seg(t, 1.0, 0.4), 32, GOLD, 'left');
  rise(g, `#${p.num} ${p.name}  ${p.pos}`, x, 74, seg(t, 1.2, 0.3), { color: '#ffffff' });
  if (m.dev) devBadge(g, m.dev[0], m.dev[1], seg(t, 1.4, 0.8), x, 96);
  if (m.n) {
    rise(g, 'OVR', x + 200, 96, seg(t, 1.5, 0.3), { color: DIM });
    text(g, t >= 1.5 ? `${rolled(m.n[0], m.n[1], seg(t, 1.5, 0.9))}` : '', x + 236, 92, { size: 16, color: GREEN });
  }
  if (m.d && t >= 1.6) ratingBars(g, m.d, seg(t, 1.6, 0.9), x, 124);
  lines(g, m.lines, x, 206, t, 2.2, 'left', 40);
}

function drawBreakthrough(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'team');
  const p = m.p!;
  spotlight(g, 170, FLOOR, 0.6 * ease(seg(t, 0.1, 0.5)));
  hero(g, team, p.skin, 170, FLOOR, 6, t < 0.8 ? 'stand' : 'cheer', 1);
  const x = 310;
  slam(g, 'BREAKTHROUGH', x, 30, seg(t, 0.3, 0.4), 24, GREEN, 'left');
  rise(g, `#${p.num} ${p.name}  ${p.pos}`, x, 66, seg(t, 0.5, 0.3), { color: '#ffffff' });
  if (m.n) {
    rise(g, `OVR ${m.n[0]}  >`, x, 90, seg(t, 0.6, 0.3), { color: SOFT });
    if (t >= 0.7) text(g, `${rolled(m.n[0], m.n[1], seg(t, 0.7, 0.8))}`, x + 112, 86, { size: 16, color: GREEN });
  }
  if (m.d && t >= 0.8) ratingBars(g, m.d, seg(t, 0.8, 0.8), x, 118);
  lines(g, m.lines.slice(0, 1), x, 200, t, 1.6, 'left', 40);
}

function drawInjury(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'red');
  const q = m.q!;
  hero(g, team, q.skin, 170, FLOOR - 10, 6, 'down', 1, { tint: '#ff3030', alpha: 1 - 0.4 * seg(t, 1.2, 0.5) });
  titleBlock(g, m, t, 170, RED, 'center', 0.1);
  rise(g, m.lines[0] ?? '', 170, 278, seg(t, 0.5, 0.3), { color: '#e6e6e6', align: 'center' });
  if (!m.p) return;
  // The next man up runs in from the right.
  const f = ease(seg(t, 1.0, 0.7));
  const x = VIEW_W + 60 - (VIEW_W + 60 - 570) * f;
  const pose: Pose = f < 1 ? (['run0', 'run1', 'run2', 'run3'] as Pose[])[Math.floor(t * 10) % 4] : 'stand';
  hero(g, team, m.p.skin, x, FLOOR, 5, pose, -1);
  slam(g, 'NEXT MAN UP', 470, 30, seg(t, 1.6, 0.35), 24, GOLD);
  if (t >= 1.7) playerCard(g, m.p, 330, 74, 280, team, seg(t, 1.7, 0.3));
  lines(g, m.lines.slice(2), 330, 144, t, 1.9, 'left', 24, '#e6e6e6');
}

function drawFirstStart(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'team');
  const p = m.p!;
  const pose: Pose = t < 1.0 ? (['run0', 'run1', 'run2', 'run3'] as Pose[])[Math.floor(t * 10) % 4] : m.sub.includes('WINNER') ? 'cheer' : 'stand';
  hero(g, team, p.skin, 60 + 110 * ease(seg(t, 0, 1.0)), FLOOR, 6, pose, 1);
  const x = 320;
  slam(g, 'FIRST START', x, 30, seg(t, 0.3, 0.4), 24, GOLD, 'left');
  rise(g, m.sub.split(': ')[1] ?? '', x, 64, seg(t, 0.5, 0.3), { color: '#ffffff' });
  if (t >= 0.6) playerCard(g, p, x, 84, 292, team, seg(t, 0.6, 0.3));
  lines(g, m.lines.slice(1), x, 156, t, 0.9, 'left', 36, '#e6e6e6');
}

function drawLadder(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number, kind: 'poll' | 'heisman'): void {
  backdrop(g, team, t, kind === 'heisman' ? 'gold' : 'team');
  if (kind === 'heisman') {
    spotlight(g, 110, FLOOR, ease(seg(t, 0.1, 0.5)));
    trophy(g, 110, FLOOR, 4);
    if (m.p) hero(g, team, m.p.skin, 220, FLOOR, 5, t < 1 ? 'stand' : 'cheer', -1);
    if (m.title === 'HEISMAN TROPHY' || m.kind === 'award') confetti(g, m.id, t, [GOLD, '#e2b070', '#ffffff']);
  } else if (m.n) {
    const now = rolled(m.n[0], m.n[1], seg(t, 0.3, 1.0));
    rise(g, 'NO.', 150, 104, seg(t, 0.2, 0.3), { color: SOFT, align: 'center' });
    text(g, now >= 26 ? 'NR' : `${now}`, 150, 124, { size: 32, color: t >= 1.3 ? GOLD : '#ffffff', align: 'center' });
    rise(g, m.lines[0] ?? '', 150, 176, seg(t, 1.0, 0.3), { color: SOFT, align: 'center' });
    hero(g, team, m.p?.skin ?? '#c68a5e', 150, FLOOR + 40, 3, t < 1.3 ? 'stand' : 'cheer', 1);
  }
  const x = 300;
  slam(g, m.title, x, 26, seg(t, 0.15, 0.35), fit(m.title, 330), GOLD, 'left');
  rise(g, m.sub.slice(0, 40), x, 64, seg(t, 0.35, 0.3), { color: '#ffffff' });
  (m.rows ?? []).forEach((r, i) => {
    const f = ease(seg(t, 0.5 + i * 0.12, 0.35));
    if (f <= 0) return;
    const y = 90 + i * 26;
    const rx = x + (1 - f) * 120;
    g.save();
    g.globalAlpha = f;
    g.fillStyle = r.me ? 'rgba(255,210,63,0.18)' : 'rgba(10,13,18,0.85)';
    g.fillRect(rx, y, 320, 22);
    g.fillStyle = r.team ? teamById(r.team).colors.primary : DIM;
    g.fillRect(rx, y, 3, 22);
    text(g, r.text.slice(0, 22), rx + 10, y + 7, { color: r.me ? GOLD : '#ffffff', shadow: false });
    if (r.val) text(g, r.val, rx + 270, y + 7, { color: SOFT, align: 'right', shadow: false });
    if (r.mv !== undefined) moveMark(g, r.mv, rx + 284, y + 7);
    g.restore();
  });
  if (kind === 'heisman') lines(g, m.lines, x, 240, t, 1.2, 'left', 40);
}

function drawMilestone(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'team');
  const p = m.p!;
  hero(g, team, p.skin, 150, FLOOR, 6, t < 1.0 ? 'stand' : 'cheer', 1);
  const x = 300;
  slam(g, 'MILESTONE', x, 30, seg(t, 0.2, 0.4), 32, GOLD, 'left');
  rise(g, `#${p.num} ${p.name}  ${p.pos}`, x, 72, seg(t, 0.4, 0.3), { color: '#ffffff' });
  if (m.n) text(g, t >= 0.5 ? rolled(m.n[0], m.n[1], seg(t, 0.5, 0.8)).toLocaleString('en-US') : '', x, 96, { size: 32, color: t >= 1.3 ? GOLD : '#ffffff' });
  rise(g, m.sub.replace(/^[\d,]+ /, ''), x, 138, seg(t, 0.9, 0.3), { color: GOLD });
  lines(g, m.lines, x, 168, t, 1.1, 'left', 40);
}

function drawStakes(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, m.tier >= 3 ? 'gold' : 'team');
  if (m.tier >= 3) confetti(g, m.id, t, [GOLD, '#ffffff', team.colors.primary, team.colors.secondary], 70);
  hero(g, team, '#c68a5e', CX, FLOOR + 30, 6, t < 0.8 ? 'stand' : Math.floor(t * 3) % 2 ? 'cheer' : 'spikeUp', 1);
  titleBlock(g, m, t, CX, GOLD);
  lines(g, m.lines, CX, 112, t, 0.7);
}

function drawTiles(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'dark');
  const lvl = m.kind === 'progress';
  slam(g, m.title, CX, 26, seg(t, 0.05, 0.3), fit(m.title, 600, 24), lvl ? GREEN : GOLD);
  rise(g, m.sub, CX, 58, seg(t, 0.2, 0.3), { color: '#ffffff', align: 'center' });
  const rows = m.rows ?? [];
  const cols = 3;
  const w = 196;
  const shown = rows.slice(0, 18);
  shown.forEach((r, i) => {
    const f = ease(seg(t, 0.3 + i * 0.06, 0.25));
    if (f <= 0) return;
    const x = 18 + (i % cols) * (w + 8);
    const y = 78 + Math.floor(i / cols) * 40;
    g.save();
    g.globalAlpha = f;
    g.fillStyle = r.me ? 'rgba(255,210,63,0.16)' : 'rgba(20,27,38,0.95)';
    g.fillRect(x, y + (1 - f) * 10, w, 34);
    g.fillStyle = r.me ? GOLD : GREEN;
    g.fillRect(x, y + (1 - f) * 10, 2, 34);
    const [name, pos] = [r.text.slice(0, r.text.lastIndexOf(' ')), r.text.slice(r.text.lastIndexOf(' ') + 1)];
    text(g, name.slice(0, 17), x + 8, y + 6, { color: '#ffffff', shadow: false });
    text(g, pos + (r.me && lvl ? '  BREAKTHROUGH' : ''), x + 8, y + 20, { color: r.me ? GOLD : SOFT, shadow: false });
    text(g, r.val ?? '', x + w - 8, y + 10, { size: lvl || /^\d+\*?$/.test(r.val ?? '') ? 16 : 8, color: lvl ? GREEN : r.me ? GOLD : '#ffffff', align: 'right' });
    g.restore();
  });
  if (rows.length > shown.length) rise(g, `AND ${rows.length - shown.length} MORE`, CX, 322, seg(t, 1.4, 0.3), { color: SOFT, align: 'center' });
}

function drawAround(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'dark');
  slam(g, m.title, CX, 26, seg(t, 0.05, 0.3), 24, '#9ad7ff');
  rise(g, m.sub, CX, 58, seg(t, 0.2, 0.3), { color: SOFT, align: 'center' });
  (m.rows ?? []).forEach((r, i) => {
    const f = ease(seg(t, 0.3 + i * 0.12, 0.35));
    if (f <= 0) return;
    const y = 84 + i * 34;
    const x = 60 + (1 - f) * 200;
    g.save();
    g.globalAlpha = f;
    g.fillStyle = r.me ? 'rgba(255,210,63,0.16)' : 'rgba(20,27,38,0.95)';
    g.fillRect(x, y, 520, 28);
    if (r.team) {
      const tm = teamById(r.team);
      g.fillStyle = tm.colors.primary;
      g.fillRect(x, y, 22, 28);
      g.fillStyle = tm.colors.secondary;
      g.fillRect(x + 22, y, 2, 28);
    }
    const hot = r.text.startsWith('UPSET') ? '#ff9a5a' : r.text.startsWith('HEISMAN') ? '#9ad7ff' : r.text.startsWith('BREAKOUT') ? GOLD : '#ffffff';
    text(g, r.text.slice(0, 50), x + 34, y + 10, { color: r.me ? GOLD : hot, shadow: false });
    if (r.val) text(g, r.val, x + 508, y + 10, { color: SOFT, align: 'right', shadow: false });
    else if (r.mv !== undefined) moveMark(g, r.mv, x + 490, y + 10);
    g.restore();
  });
}

function drawPreview(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'dark');
  const opp = m.opp ? teamById(m.opp) : team;
  hero(g, team, '#c68a5e', 80, 178, 4, 'stand', 1);
  hero(g, opp, '#8d5a3b', VIEW_W - 80, 178, 4, 'stand', -1, { home: false });
  slam(g, 'UP NEXT', CX, 26, seg(t, 0.05, 0.3), 32, GOLD);
  rise(g, m.sub, CX, 70, seg(t, 0.2, 0.3), { color: '#ffffff', align: 'center', size: 16 });
  rise(g, m.lines[0] ?? '', CX, 96, seg(t, 0.3, 0.3), { color: SOFT, align: 'center' });
  (m.rows ?? []).forEach((r, i) => {
    const f = ease(seg(t, 0.4 + i * 0.12, 0.3));
    if (f <= 0) return;
    const y = 190 + i * 30;
    g.save();
    g.globalAlpha = f;
    g.fillStyle = r.me ? 'rgba(255,210,63,0.16)' : 'rgba(20,27,38,0.95)';
    g.fillRect(40, y, VIEW_W - 80, 26);
    g.fillStyle = r.me ? GOLD : team.colors.primary;
    g.fillRect(40, y, 3, 26);
    text(g, r.text.slice(0, 34), 52, y + 4, { color: r.me ? GOLD : '#ffffff', shadow: false });
    text(g, (r.val ?? '').slice(0, 70), 52, y + 15, { color: SOFT, shadow: false, size: 8 });
    g.restore();
  });
}

function drawStory(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number, story: Storyline | undefined): void {
  const last = story?.beats[story.beats.length - 1];
  const down = last?.tone === 'down';
  backdrop(g, team, t, down ? 'dark' : 'team');
  const p = m.p;
  if (p) hero(g, team, p.skin, 150, FLOOR, 6, t < 0.8 ? 'stand' : down ? 'stand' : 'cheer', 1, { alpha: down ? 0.85 : 1 });
  const x = p ? 300 : CX;
  const align: CanvasTextAlign = p ? 'left' : 'center';
  rise(g, 'STORYLINE', x, 24, seg(t, 0.05, 0.3), { color: SOFT, align });
  slam(g, m.title, x, 38, seg(t, 0.15, 0.35), fit(m.title, p ? 330 : 600, 24), down ? RED : GOLD, align);
  let y = 78;
  for (const w of wrap(m.sub, p ? 40 : 70)) {
    rise(g, w, x, y, seg(t, 0.4, 0.3), { color: '#ffffff', align });
    y += 12;
  }
  y += lines(g, m.lines.filter(Boolean), x, y + 6, t, 0.6, align, p ? 40 : 70) + 14;
  if (story?.meter) {
    const f = seg(t, 0.8, 0.5);
    const mw = 300;
    const mx = p ? x : CX - mw / 2;
    g.fillStyle = '#1f2a3a';
    g.fillRect(mx, y, mw, 8);
    g.fillStyle = GOLD;
    g.fillRect(mx, y, mw * (story.meter.at / story.meter.of) * ease(f), 8);
    rise(g, story.meter.label, mx, y + 12, f, { color: SOFT, shadow: false });
    y += 30;
  }
  // The story so far.
  const bx = x - (p ? 0 : 150);
  let row = 0;
  (story?.beats ?? []).slice(-4).forEach((b, i) => {
    const f = seg(t, 0.9 + i * 0.1, 0.3);
    const col = b.tone === 'up' ? GREEN : b.tone === 'down' ? RED : SOFT;
    rise(g, `WK ${b.week}`, bx, y + row * 11, f, { color: DIM, shadow: false });
    for (const w of wrap(b.text, p ? 33 : 50).slice(0, 2)) {
      if (y + row * 11 > 300) return;
      rise(g, w, bx + 48, y + row * 11, f, { color: col, shadow: false });
      row++;
    }
  });
}

function drawDecision(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number, story: Storyline | undefined, v: WrapView): void {
  backdrop(g, team, t, 'dark');
  slam(g, 'YOUR CALL', CX, 26, seg(t, 0.05, 0.35), 32, GOLD);
  const d = story?.decision;
  wrap(m.sub, 70).forEach((w, i) => rise(g, w, CX, 70 + i * 12, seg(t, 0.3, 0.3), { color: '#ffffff', align: 'center' }));
  if (!d || !story) return;
  const people: (MomentPlayer | undefined)[] = [story.star, story.other];
  d.options.forEach((o, i) => {
    const r = decisionRect(i);
    const f = ease(seg(t, 0.4 + i * 0.15, 0.35));
    if (f <= 0) return;
    const chosen = d.chosen === o.id;
    const other = d.chosen !== undefined && !chosen;
    const hot = d.chosen === undefined && inBox(r, v.mx, v.my);
    g.save();
    g.globalAlpha = f * (other ? 0.45 : 1);
    g.fillStyle = chosen ? 'rgba(255,210,63,0.16)' : hot ? '#1a2230' : 'rgba(20,27,38,0.95)';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = chosen || hot ? GOLD : team.colors.primary;
    g.fillRect(r.x, r.y, r.w, 2);
    text(g, `${i + 1}`, r.x + 10, r.y + 10, { color: DIM, shadow: false });
    wrap(o.label, 32).slice(0, 2).forEach((w, j) => text(g, w, r.x + 26, r.y + 10 + j * 11, { color: chosen || hot ? GOLD : '#ffffff', shadow: false }));
    const p = people.find((x) => x?.id === o.id);
    if (p) {
      hero(g, team, p.skin, r.x + 52, r.y + 128, 4, chosen ? 'cheer' : 'stand', 1);
      text(g, `#${p.num} ${p.pos}`, r.x + 100, r.y + 40, { color: '#ffffff', shadow: false });
      text(g, `${p.cls}  ${p.stars}-STAR`, r.x + 100, r.y + 54, { color: SOFT, shadow: false });
      text(g, `${p.ovr}`, r.x + 100, r.y + 70, { size: 16, color: p.ovr >= 80 ? GREEN : '#ffffff' });
      text(g, 'OVR', r.x + 140, r.y + 76, { color: DIM, shadow: false });
    }
    wrap(o.sub, 32).slice(0, 4).forEach((w, j) => text(g, w, r.x + 12, r.y + 140 + j * 11, { color: SOFT, shadow: false }));
    if (chosen) text(g, 'YOUR DECISION', r.x + r.w / 2, r.y + r.h - 14, { color: GOLD, align: 'center' });
    g.restore();
  });
}

// ------------------------------------------------------------ recruiting and the offseason

/** A plain practice look for a recruit before he picks (its own id: sprites cache by it). */
const NEUTRAL = {
  ...teamById('smu'), id: 'recruit',
  colors: {
    ...teamById('smu').colors, primary: '#3a4456', secondary: '#c9d2df', helmet: '#c9d2df', stripe: '#c9d2df', logo: '#c9d2df', mask: '#8a93a3',
    jerseyHome: '#3a4456', jerseyAway: '#3a4456', trimHome: '#c9d2df', trimAway: '#c9d2df', pantsHome: '#8a93a3', pantsAway: '#8a93a3', socks: '#3a4456',
  },
} as Team;

/** A recruit's commitment: his card, then his top schools' plates flicker and one locks in. */
function drawCommit(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  const p = m.p!;
  const plates = m.rows ?? [];
  const pick = plates.find((r) => r.me);
  const ours = pick?.team === m.team;
  const to = pick?.team ? teamById(pick.team) : team;
  const locked = t >= 1.9;
  backdrop(g, locked ? to : team, t, locked && ours ? 'gold' : 'dark');
  if (locked && ours) confetti(g, m.id, t - 1.9, [GOLD, '#ffffff', team.colors.primary, team.colors.secondary]);
  spotlight(g, 130, FLOOR, ease(seg(t, 0.1, 0.5)));
  // In plain colors until he picks: then his school's.
  hero(g, locked ? to : NEUTRAL, p.skin, 130, FLOOR, 6, locked && ours ? 'cheer' : 'stand', 1);
  const x = 260;
  rise(g, m.lines[0] ?? '', x, 24, seg(t, 0.05, 0.3), { color: SOFT });
  rise(g, `${p.pos} ${p.name}`.slice(0, 22), x, 40, seg(t, 0.15, 0.3), { color: '#ffffff', size: 16 });
  if (t >= 0.25) starPips(g, p.stars, x, 64);
  rise(g, p.rank ? `NO. ${p.rank} NATIONALLY` : '', x + 54, 64, seg(t, 0.3, 0.3), { color: GOLD });
  rise(g, p.home, x, 80, seg(t, 0.35, 0.3), { color: DIM });
  // The plates: the light runs across them, then stops on his choice.
  const w = 104;
  const gap = 10;
  const px = x + (360 - plates.length * w - (plates.length - 1) * gap) / 2;
  const hot = t < 1.9 ? Math.floor(t * 9) % Math.max(1, plates.length) : plates.findIndex((r) => r.me);
  plates.forEach((r, i) => {
    const f = ease(seg(t, 0.4 + i * 0.12, 0.3));
    if (f <= 0) return;
    const tm = teamById(r.team!);
    const bx = px + i * (w + gap);
    const out = locked && !r.me;
    g.save();
    g.globalAlpha = f * (out ? 0.35 : 1);
    g.fillStyle = tm.colors.primary;
    g.fillRect(bx, 110, w, 70);
    g.fillStyle = tm.colors.secondary;
    g.fillRect(bx, 170, w, 10);
    if (t >= 0.8 && i === hot) {
      g.strokeStyle = GOLD;
      g.lineWidth = 3;
      g.strokeRect(bx - 2, 108, w + 4, 74);
    }
    text(g, tm.abbr, bx + w / 2, 132, { size: 16, align: 'center', color: '#ffffff' });
    g.restore();
  });
  if (locked) {
    slam(g, m.title, x + 180, 206, seg(t, 1.9, 0.4), fit(m.title, 360), ours ? GOLD : RED);
    rise(g, `TO ${to.school.toUpperCase()}`, x + 180, 244, seg(t, 2.2, 0.3), { color: '#ffffff', align: 'center' });
    lines(g, m.lines.slice(1, 2), x + 180, 262, t, 2.4, 'center', 44);
  }
}

/** Draft night: the pick rolls in, the city, his card. */
function drawDraft(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'dark');
  const p = m.p!;
  spotlight(g, 160, FLOOR, ease(seg(t, 0.1, 0.5)));
  hero(g, team, p.skin, 160, FLOOR, 6, t < 1.4 ? 'stand' : Math.floor(t * 2.5) % 2 ? 'cheer' : 'spikeUp', 1);
  if (t >= 1.4) confetti(g, m.id, t - 1.4, [GOLD, '#ffffff', team.colors.primary], 60);
  const x = 300;
  rise(g, 'THE PICK IS IN', x, 26, seg(t, 0.05, 0.3), { color: SOFT });
  rise(g, 'ROUND 1', x, 46, seg(t, 0.3, 0.3), { color: '#ffffff', size: 16 });
  if (m.n) text(g, t >= 0.5 ? `PICK ${rolled(60, m.n[1], seg(t, 0.5, 0.9))}` : '', x, 70, { size: 32, color: t >= 1.4 ? GOLD : '#ffffff' });
  rise(g, (m.lines[0] ?? '').split(': ')[1] ?? '', x, 112, seg(t, 1.4, 0.3), { color: GOLD, size: 16 });
  if (t >= 1.6) playerCard(g, p, x, 140, 300, team, seg(t, 1.6, 0.3));
  lines(g, m.lines.slice(1), x, 212, t, 1.9, 'left', 36);
}

/** A signee: in the user's colors, his stars, rank and hometown. */
function drawSigning(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, m.tier >= 3 ? 'gold' : 'team');
  const p = m.p!;
  spotlight(g, 160, FLOOR, ease(seg(t, 0.1, 0.5)));
  hero(g, team, p.skin, 160, FLOOR, 6, t < 0.8 ? 'stand' : 'cheer', 1);
  if (m.tier >= 3 && t >= 0.8) confetti(g, m.id, t - 0.8, [GOLD, '#ffffff', team.colors.primary], 60);
  const x = 300;
  slam(g, m.title, x, 26, seg(t, 0.2, 0.4), 32, GOLD, 'left');
  rise(g, `${p.pos} ${p.name}`.slice(0, 20), x, 70, seg(t, 0.5, 0.3), { color: '#ffffff', size: 16 });
  if (t >= 0.6) starPips(g, p.stars, x, 96);
  lines(g, m.lines, x, 122, t, 0.9, 'left', 40);
}

/** Rows with a second line each: the staff, arrivals, new starters, the games circled. */
function drawList(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'dark');
  slam(g, m.title, CX, 26, seg(t, 0.05, 0.3), fit(m.title, 600, 24), GOLD);
  rise(g, m.sub, CX, 58, seg(t, 0.2, 0.3), { color: '#ffffff', align: 'center' });
  (m.rows ?? []).slice(0, 8).forEach((r, i) => {
    const f = ease(seg(t, 0.3 + i * 0.12, 0.3));
    if (f <= 0) return;
    const y = 78 + i * 30;
    const x = 40 + (1 - f) * 120;
    g.save();
    g.globalAlpha = f;
    g.fillStyle = r.me ? 'rgba(255,210,63,0.14)' : 'rgba(20,27,38,0.95)';
    g.fillRect(x, y, VIEW_W - 80, 26);
    g.fillStyle = teamById(r.team ?? m.team).colors.primary;
    g.fillRect(x, y, 6, 26);
    const ls = r.val ? [r.text, r.val] : wrap(r.text, 66).slice(0, 2);
    ls.forEach((w, j) => text(g, w.slice(0, 66), x + 14, y + (ls.length > 1 ? 4 + j * 11 : 9), { color: j === 0 ? (r.me ? GOLD : '#ffffff') : r.val ? SOFT : '#ffffff', shadow: false }));
    g.restore();
  });
}

/** The new season's title card: the school, then the year slams in over a team-color wipe. */
function drawOpener(g: CanvasRenderingContext2D, m: Moment, team: Team, t: number): void {
  backdrop(g, team, t, 'team');
  const f = ease(seg(t, 0, 0.6));
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 150, VIEW_W * f, 26);
  g.fillStyle = team.colors.secondary;
  g.fillRect(VIEW_W * (1 - f), 176, VIEW_W * f, 4);
  ['#c68a5e', '#8d5a3b', '#e0b48a'].forEach((skin, i) => hero(g, team, skin, CX + (i - 1) * 170, FLOOR + 40, 4, t < 1.2 ? 'stand' : 'cheer', 1, { alpha: ease(seg(t, 0.3 + i * 0.1, 0.4)) }));
  slam(g, team.school.toUpperCase(), CX, 40, seg(t, 0.2, 0.4), fit(team.school, 600, 24), '#ffffff');
  slam(g, m.title, CX, 80, seg(t, 0.5, 0.4), fit(m.title, 600), GOLD);
  rise(g, m.sub, CX, 156, seg(t, 0.9, 0.3), { color: '#ffffff', align: 'center', size: 16 });
  lines(g, m.lines, CX, 196, t, 1.1);
}
