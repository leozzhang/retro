import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { lineScore, playCaption, shortName } from '../season/gamePlays';
import { playSize, seasonGameStars, type StarCard } from '../season/gameStars';
import type { GamePlay, PlayerLine, SeasonGame, SeasonState } from '../season/types';
import { drawHint } from './hud';
import { linkText, playerLink, teamLink, wrapSpans } from './links';
import { text } from './text';

/**
 * A finished game's page, for any game in the league: the header with the final, then SUMMARY (the
 * score by quarter, the team stats, the stars of the game and the top plays), BOX SCORE (each team's
 * passing, rushing, receiving, defense and kicking) and PLAYS (the scoring plays and the biggest
 * others, in order). Opened from a score (render/links.ts), and after the user's games. See
 * docs/GAMES.md.
 */

export const GAME_TABS = ['SUMMARY', 'BOX SCORE', 'PLAYS'] as const;

export interface GameView {
  game: string;
  tab: number;
  /** Lines scrolled past on PLAYS. */
  scroll: number;
  /** Shown right after the user's game: Space goes on to the hub. */
  postgame: boolean;
  mx: number;
  my: number;
}

type Box = { x: number; y: number; w: number; h: number };

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const CARD = '#141b26';
const RULE = '#1f2a3a';

const L_X = 6;
const L_W = 312;
const R_X = 324;
const R_W = VIEW_W - 6 - R_X;
const TOP = 36;
const BOTTOM = 344;
const PLAY_ROWS = Math.floor((BOTTOM - TOP - 24) / 11);

/** The postgame highlights' thumbnails, in the SUMMARY's bottom right corner. */
const REEL = { w: 120, h: 68, gap: 6, cardH: 92 };

/** A highlight on the game page: its opening frame (null while it's being set up) and what it is. */
export interface ReelThumb {
  still: HTMLCanvasElement | null;
  clock: string;
  title: string;
}

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

export function gameTabRect(i: number): Box {
  let x = 8;
  for (let j = 0; j < i; j++) x += (GAME_TABS[j].length + 2) * 8 + 2;
  return { x, y: 16, w: (GAME_TABS[i].length + 2) * 8, h: 14 };
}

export function gameTabAt(x: number, y: number): number {
  return GAME_TABS.findIndex((_, i) => inBox(gameTabRect(i), x, y));
}

/** Highlight `i` of `n`'s thumbnail, right-aligned in the card at the bottom of the right column. */
export function gameReelRect(i: number, n: number): Box {
  const x = R_X + R_W - 8 - (n - i) * REEL.w - (n - 1 - i) * REEL.gap;
  return { x, y: BOTTOM - REEL.cardH + 19, w: REEL.w, h: REEL.h };
}

export function gameReelAt(x: number, y: number, n: number): number {
  for (let i = 0; i < n; i++) if (inBox(gameReelRect(i, n), x, y)) return i;
  return -1;
}

export const gameOf = (s: SeasonState, id: string): SeasonGame | undefined => s.games.find((g) => g.id === id);

export function gameScrollMax(s: SeasonState, v: GameView): number {
  const n = gameOf(s, v.game)?.result?.plays?.length ?? 0;
  return v.tab === 2 ? Math.max(0, n - PLAY_ROWS) : 0;
}

function card(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, right?: string): void {
  g.fillStyle = CARD;
  g.fillRect(x, y, w, h);
  g.fillStyle = RULE;
  g.fillRect(x, y + 14, w, 1);
  text(g, title, x + 8, y + 4, { color: ACCENT, shadow: false });
  if (right) text(g, right, x + w - 8, y + 4, { align: 'right', color: DIM, shadow: false });
}

const plain = (t: string, n: number): string[] => wrapSpans(t, [], n).map((l) => l.t);

/** "Q3 4:12", "OT", "2OT". */
export function playClock(p: GamePlay): string {
  if (p.q > 4) return p.q === 5 ? 'OT' : `${p.q - 4}OT`;
  return `Q${p.q} ${Math.floor(p.time / 60)}:${String(p.time % 60).padStart(2, '0')}`;
}

/** The game's names by id, and each offense's passer (its line with the most attempts), for captions. */
function namer(g: SeasonGame): { name: (id: string) => string | undefined; passer: (team: string) => string | undefined } {
  const lines = g.result?.box.players ?? [];
  const byId = new Map(lines.map((l) => [l.id, l.name]));
  const passer = (team: string) => lines.filter((l) => l.team === team && l.att > 0).sort((a, b) => b.att - a.att)[0]?.name;
  return { name: (id) => byId.get(id), passer };
}

export function captionOf(g: SeasonGame, p: GamePlay): string {
  const n = namer(g);
  return playCaption(p, n.name, n.passer(p.off));
}

export function drawGame(g: CanvasRenderingContext2D, s: SeasonState, v: GameView, reel: ReelThumb[] = []): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const game = gameOf(s, v.game);
  if (!game?.result) {
    text(g, 'THIS GAME HAS NOT BEEN PLAYED', VIEW_W / 2, 170, { align: 'center', color: SOFT });
    drawHint(g, v.postgame ? 'SPACE: CONTINUE' : 'ESC: BACK');
    return;
  }
  const r = game.result;
  const home = teamById(game.home);
  const away = teamById(game.away);

  // The header: the away side on the left in its colors, the home side on the right in its.
  g.fillStyle = away.colors.primary;
  g.fillRect(0, 0, VIEW_W / 2, 30);
  g.fillStyle = home.colors.primary;
  g.fillRect(VIEW_W / 2, 0, VIEW_W / 2, 30);
  const final = r.ot ? `FINAL/${r.ot > 1 ? `${r.ot}OT` : 'OT'}` : 'FINAL';
  const aw = r.away > r.home;
  const hw = r.home > r.away;
  linkText(g, away.school.toUpperCase(), 10, 4, { size: 8 }, teamLink(away.id));
  text(g, String(r.away), VIEW_W / 2 - 56, 4, { align: 'right', color: aw ? GOLD : '#ffffff' });
  text(g, final, VIEW_W / 2, 4, { align: 'center', color: '#e6e6e6' });
  text(g, String(r.home), VIEW_W / 2 + 56, 4, { color: hw ? GOLD : '#ffffff' });
  linkText(g, home.school.toUpperCase(), VIEW_W - 10, 4, { size: 8, align: 'right' }, teamLink(home.id));
  const where = game.neutral ? 'NEUTRAL SITE' : `AT ${home.abbr.toUpperCase()}`;
  const label = `${game.name ? `${game.name.toUpperCase().slice(0, 22)}  ` : ''}WEEK ${game.week}  ${where}`;
  text(g, label, VIEW_W - 10, 19, { align: 'right', color: '#e6e6e6' });
  GAME_TABS.forEach((t, i) => {
    const b = gameTabRect(i);
    const on = i === v.tab;
    const hover = !on && inBox(b, v.mx, v.my);
    g.fillStyle = on ? '#0d1117' : hover ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)';
    g.fillRect(b.x, b.y, b.w, b.h);
    text(g, t, b.x + b.w / 2, b.y + 4, { align: 'center', color: on ? GOLD : hover ? '#ffffff' : '#d8dde4', shadow: on ? undefined : false });
  });

  if (v.tab === 1) drawBox(g, game);
  else if (v.tab === 2) drawPlays(g, game, v);
  else drawSummary(g, s, game, v, reel);

  const keys = v.tab === 0 && reel.length ? '1-3: PAGE  H: HIGHLIGHTS' : '1-3 OR CLICK: PAGE';
  const scroll = v.tab === 2 ? '  WHEEL OR W/S: SCROLL' : '';
  drawHint(g, v.postgame ? `${keys}${scroll}  CLICK A NAME  SPACE: CONTINUE` : `${keys}${scroll}  CLICK A NAME TO OPEN IT  ESC: BACK`);
}

// ------------------------------------------------------------ SUMMARY

function drawSummary(g: CanvasRenderingContext2D, s: SeasonState, game: SeasonGame, v: GameView, reel: ReelThumb[]): void {
  const r = game.result!;
  const home = teamById(game.home);
  const away = teamById(game.away);
  const plays = r.plays ?? [];
  const x = L_X + 8;

  // The score by quarter.
  card(g, L_X, TOP, L_W, 50, 'SCORING');
  const ls = plays.length ? lineScore(plays, game.home, r.ot) : null;
  const cols = ls ? ls.home.length : 0;
  const colX = (i: number) => L_X + 120 + i * 28;
  const totX = L_X + L_W - 10;
  if (ls) for (let i = 0; i < cols; i++) text(g, i < 4 ? String(i + 1) : 'OT', colX(i), TOP + 20, { align: 'right', color: DIM, shadow: false });
  text(g, 'T', totX, TOP + 20, { align: 'right', color: DIM, shadow: false });
  ([[away, ls?.away, r.away, r.away > r.home], [home, ls?.home, r.home, r.home > r.away]] as const).forEach(([t, q, pts, won], row) => {
    const y = TOP + 30 + row * 10;
    linkText(g, t.abbr.toUpperCase(), x, y, { shadow: false }, teamLink(t.id));
    q?.forEach((n, i) => text(g, String(n), colX(i), y, { align: 'right', color: SOFT, shadow: false }));
    text(g, String(pts), totX, y, { align: 'right', color: won ? GOLD : '#ffffff', shadow: false });
  });

  // The team stats.
  const sy = TOP + 54;
  card(g, L_X, sy, L_W, 76, 'TEAM STATS');
  const ax = L_X + 222;
  const hx = L_X + L_W - 10;
  text(g, away.abbr.toUpperCase(), ax, sy + 20, { align: 'right', color: DIM, shadow: false });
  text(g, home.abbr.toUpperCase(), hx, sy + 20, { align: 'right', color: DIM, shadow: false });
  const tl = { a: r.box.away, h: r.box.home };
  const rows: [string, number, number][] = [
    ['TOTAL YARDS', tl.a.yards, tl.h.yards],
    ['PASSING', tl.a.passYds, tl.h.passYds],
    ['RUSHING', tl.a.rushYds, tl.h.rushYds],
    ['TURNOVERS', tl.a.turnovers, tl.h.turnovers],
  ];
  rows.forEach(([name, a, h], i) => {
    const y = sy + 31 + i * 10;
    text(g, name, x, y, { color: SOFT, shadow: false });
    text(g, String(Math.round(a)), ax, y, { align: 'right', shadow: false });
    text(g, String(Math.round(h)), hx, y, { align: 'right', shadow: false });
  });

  // The top plays.
  const py = sy + 80;
  card(g, L_X, py, L_W, BOTTOM - py, 'TOP PLAYS');
  if (!plays.length) {
    text(g, 'NO PLAY-BY-PLAY FOR THIS GAME', x, py + 22, { color: DIM, shadow: false });
  } else {
    const top = [...plays].sort((a, b) => playSize(b, game.home) - playSize(a, game.home)).slice(0, 4);
    top.sort((a, b) => plays.indexOf(a) - plays.indexOf(b));
    let y = py + 22;
    for (const p of top) {
      const lines = plain(captionOf(game, p), 37).slice(0, 2);
      if (y + 10 + lines.length * 10 > BOTTOM - 2) break;
      playHead(g, game, p, x, L_X + L_W - 10, y);
      lines.forEach((l, i) => text(g, l, x, y + 10 + i * 10, { shadow: false }));
      y += 14 + lines.length * 10;
    }
  }

  // The stars, above the highlights when there are any.
  const starsEnd = reel.length ? BOTTOM - REEL.cardH - 4 : BOTTOM;
  card(g, R_X, TOP, R_W, starsEnd - TOP, 'STARS OF THE GAME');
  const stars = seasonGameStars(s, game);
  let y = TOP + 22;
  for (const c of stars) {
    if (y + 24 > starsEnd) break;
    y = drawStar(g, game, c, R_X + 8, y, starsEnd - 4) + (reel.length ? 7 : 10);
  }
  if (reel.length) drawReel(g, reel, v);
}

/** The highlights card: each one's opening frame, to click and watch. */
function drawReel(g: CanvasRenderingContext2D, reel: ReelThumb[], v: GameView): void {
  const y0 = BOTTOM - REEL.cardH;
  card(g, R_X, y0, R_W, REEL.cardH, 'HIGHLIGHTS', 'CLICK TO WATCH');
  reel.forEach((r, i) => {
    const b = gameReelRect(i, reel.length);
    const hover = inBox(b, v.mx, v.my);
    g.fillStyle = '#05080c';
    g.fillRect(b.x, b.y, b.w, b.h);
    if (r.still) {
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(r.still, b.x, b.y, b.w, b.h);
      g.restore();
    } else text(g, 'LOADING', b.x + b.w / 2, b.y + b.h / 2 - 4, { align: 'center', color: DIM, shadow: false });
    // The clock on top, what it was along the bottom, and a play button.
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(b.x, b.y, b.w, 11);
    g.fillRect(b.x, b.y + b.h - 11, b.w, 11);
    text(g, r.clock, b.x + 3, b.y + 2, { color: '#e6e6e6', shadow: false });
    text(g, r.title.slice(0, 14), b.x + 3, b.y + b.h - 9, { color: GOLD, shadow: false });
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    g.fillStyle = hover ? 'rgba(255,210,63,0.9)' : 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.arc(cx, cy, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hover ? '#0d1117' : '#ffffff';
    g.beginPath();
    g.moveTo(cx - 3, cy - 5);
    g.lineTo(cx - 3, cy + 5);
    g.lineTo(cx + 5, cy);
    g.closePath();
    g.fill();
    g.strokeStyle = hover ? GOLD : RULE;
    g.lineWidth = 1;
    g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  });
}

/** A play's first line: clock and offense, and the score after it when it scored. */
function playHead(g: CanvasRenderingContext2D, game: SeasonGame, p: GamePlay, x: number, right: number, y: number): void {
  text(g, `${playClock(p)}  ${teamById(p.off).abbr.toUpperCase()}`, x, y, { color: DIM, shadow: false });
  if (p.pts) {
    const a = teamById(game.away).abbr.toUpperCase();
    const h = teamById(game.home).abbr.toUpperCase();
    text(g, `${a} ${p.score[1]}-${p.score[0]} ${h}`, right, y, { align: 'right', color: GOLD, shadow: false });
  }
}

function drawStar(g: CanvasRenderingContext2D, game: SeasonGame, c: StarCard, x: number, y: number, maxY: number): number {
  text(g, c.title, x, y, { color: GOLD, shadow: false });
  const name = c.name.toUpperCase().slice(0, 22);
  linkText(g, name, x, y + 12, { shadow: false }, c.id ? playerLink(c.team, c.id) : undefined);
  text(g, `${c.pos} ${teamById(c.team).abbr.toUpperCase()}`, x + R_W - 16, y + 12, { align: 'right', color: SOFT, shadow: false });
  let yy = y + 24;
  const fits = () => yy + 8 <= maxY;
  if (c.play) {
    text(g, playClock(c.play), x, yy, { color: DIM, shadow: false });
    yy += 10;
    for (const l of plain(captionOf(game, c.play), 37).slice(0, 2)) {
      if (!fits()) return yy;
      text(g, l, x, yy, { shadow: false });
      yy += 10;
    }
  }
  for (const l of c.text ? plain(c.text.replace('  ', ', '), 37).slice(0, 2) : []) {
    if (!fits()) return yy;
    text(g, l, x, yy, { color: c.kind === 'play' ? SOFT : '#ffffff', shadow: false });
    yy += 10;
  }
  if (c.kind === 'over' && c.ovr && fits()) {
    text(g, `WELL ABOVE HIS ${c.ovr} OVERALL`, x, yy, { color: GREEN, shadow: false });
    yy += 10;
  }
  return yy;
}

// ------------------------------------------------------------ BOX SCORE

function drawBox(g: CanvasRenderingContext2D, game: SeasonGame): void {
  const r = game.result!;
  const sides = [
    { id: game.away, x: L_X, w: L_W, tl: r.box.away },
    { id: game.home, x: R_X, w: R_W, tl: r.box.home },
  ];
  for (const sd of sides) {
    const t = teamById(sd.id);
    card(g, sd.x, TOP, sd.w, BOTTOM - TOP, t.school.toUpperCase().slice(0, 22), `${sd.tl.yards} YDS`);
    const lines = r.box.players.filter((l) => l.team === sd.id);
    const x = sd.x + 8;
    const sx = sd.x + 8 + 15 * 8;
    let y = TOP + 20;
    text(g, `${sd.tl.passYds} PASS  ${sd.tl.rushYds} RUSH  ${sd.tl.turnovers} TO`, x, y, { color: SOFT, shadow: false });
    y += 14;
    const section = (title: string, head: string, rows: PlayerLine[], cells: (l: PlayerLine) => string) => {
      if (!rows.length || y > BOTTOM - 24) return;
      text(g, title, x, y, { color: ACCENT, shadow: false });
      text(g, head, sx, y, { color: DIM, shadow: false });
      y += 11;
      for (const l of rows) {
        if (y > BOTTOM - 12) break;
        linkText(g, shortName(l.name).slice(0, 14), x, y, { shadow: false }, playerLink(l.team, l.id));
        text(g, cells(l), sx, y, { shadow: false });
        y += 10;
      }
      y += 4;
    };
    const n = (v: number, w: number) => String(v).padStart(w);
    section('PASSING', 'C/ATT  YDS TD INT', lines.filter((l) => l.att > 0).sort((a, b) => b.att - a.att).slice(0, 2),
      (l) => `${`${l.cmp}/${l.att}`.padEnd(5)} ${n(l.passYds, 4)} ${n(l.passTd, 2)} ${n(l.int, 3)}`);
    section('RUSHING', 'CAR  YDS TD', lines.filter((l) => l.rush > 0).sort((a, b) => b.rushYds - a.rushYds).slice(0, 4),
      (l) => `${n(l.rush, 3)} ${n(l.rushYds, 4)} ${n(l.rushTd, 2)}`);
    section('RECEIVING', 'REC  YDS TD', lines.filter((l) => l.rec > 0).sort((a, b) => b.recYds - a.recYds).slice(0, 5),
      (l) => `${n(l.rec, 3)} ${n(l.recYds, 4)} ${n(l.recTd, 2)}`);
    section('DEFENSE', ' SK INT', lines.filter((l) => l.sk || l.defInt).sort((a, b) => b.sk + b.defInt - a.sk - a.defInt).slice(0, 4),
      (l) => `${n(l.sk, 3)} ${n(l.defInt, 3)}`);
    section('KICKING', ' FG', lines.filter((l) => l.fga > 0).slice(0, 1), (l) => `${l.fgm}/${l.fga}`);
    if (!lines.length) text(g, 'NO PLAYER STATS FOR THIS GAME', x, y, { color: DIM, shadow: false });
  }
}

// ------------------------------------------------------------ PLAYS

function drawPlays(g: CanvasRenderingContext2D, game: SeasonGame, v: GameView): void {
  const plays = game.result!.plays ?? [];
  const W = VIEW_W - 12;
  card(g, L_X, TOP, W, BOTTOM - TOP, 'SCORING AND KEY PLAYS', plays.length > PLAY_ROWS ? `${v.scroll + 1}-${Math.min(plays.length, v.scroll + PLAY_ROWS)} OF ${plays.length}` : '');
  if (!plays.length) {
    text(g, 'NO PLAY-BY-PLAY FOR THIS GAME', L_X + 8, TOP + 22, { color: DIM, shadow: false });
    return;
  }
  const a = teamById(game.away).abbr.toUpperCase();
  const h = teamById(game.home).abbr.toUpperCase();
  plays.slice(v.scroll, v.scroll + PLAY_ROWS).forEach((p, i) => {
    const y = TOP + 22 + i * 11;
    const off = teamById(p.off).abbr.toUpperCase();
    text(g, playClock(p), L_X + 8, y, { color: DIM, shadow: false });
    text(g, off, L_X + 80, y, { color: SOFT, shadow: false });
    // The score takes the right edge; a caption too long to sit beside it drops the score's team names.
    const full = captionOf(game, p);
    const room = (n: string) => Math.floor((W - 136 - (n ? n.length * 8 + 8 : 0)) / 8);
    const long = p.pts ? `${a} ${p.score[1]}-${p.score[0]} ${h}` : '';
    const score = long && full.length > room(long) ? `${p.score[1]}-${p.score[0]}` : long;
    const cap = full.slice(0, room(score));
    const color = p.pts ? '#ffffff' : p.for || ['int', 'fumble', 'fourthStop', 'sack', 'redZoneStop', 'twoPtStop', 'missedFg'].includes(p.kind) ? ACCENT : SOFT;
    text(g, cap, L_X + 128, y, { color, shadow: false });
    if (score) text(g, score, L_X + W - 8, y, { align: 'right', color: GOLD, shadow: false });
  });
}
