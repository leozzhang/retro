import { archetypeLabel, classLabel, type Athlete } from '../data/athletes';
import { athleteName, healthy, positionOrder, type Squad } from '../data/depth';
import { overall, overallBreakdown, POSITIONS, type Position } from '../data/positions';
import { RATING_INFO } from '../data/ratings';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { careerGains, careerOf, careerRows, careerTotals, headline } from '../season/career';
import type { StatKey } from '../season/stats';
import type { CareerRole, CareerSeason, SeasonState, StoryEvent } from '../season/types';
import { drawHint } from './hud';
import { ovrColor, shortName } from './rosterScreen';
import { inBox, tabAt, wrap } from './teamScreen';
import { text } from './text';

/**
 * The STATS page: the user's roster by position on the left, the selected player's career on the
 * right. SEASONS shows a row per season (archived, then this one live) and his story, newest first;
 * GROWTH shows all-time gains at each rating in his overall, season by season. History only: see
 * season/career.ts.
 */

export interface CareerView {
  /** Index into `POSITIONS`. */
  pos: number;
  sel: number;
  /** 0 SEASONS, 1 GROWTH. */
  mode: number;
  /** Story lines scrolled past. */
  scroll: number;
  /** Where Esc goes. */
  back: 'season' | 'team';
  mx: number;
  my: number;
}

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff5a5a';

const TAB_Y = 32;
const TAB_H = 14;
const TAB_W = VIEW_W / POSITIONS.length;
const LIST_X = 6;
const LIST_W = 250;
const LIST_TOP = 64;
const ROW_H = 16;
const CARD_X = 264;
const CARD_R = VIEW_W - 6;
const CARD_TOP = 50;
const CARD_BOTTOM = 342;
const LINE = 11;
const TABLE_Y = CARD_TOP + 74;
const STORY_CHARS = 44;
/** The SEASONS / GROWTH toggles. */
export const MODE_BTNS = [
  { x: CARD_X + 8, y: CARD_TOP + 58, w: 72, h: 11 },
  { x: CARD_X + 84, y: CARD_TOP + 58, w: 64, h: 11 },
];
const MODE_LABELS = ['SEASONS', 'GROWTH'];
const ROLE_LABEL: Record<CareerRole, string> = { starter: 'STR', rotation: 'ROT', reserve: 'RES', dnp: 'DNP' };

/** The rows on the left: a position's depth order, the injured included. */
export function careerList(squad: Squad, pos: Position): Athlete[] {
  return positionOrder(squad, pos);
}

/** A fresh view, on a player if one is given (his position, his row). */
export function newCareerView(squad: Squad, back: CareerView['back'], id?: string): CareerView {
  const v: CareerView = { pos: 0, sel: 0, mode: 0, scroll: 0, back, mx: 0, my: 0 };
  const a = id ? squad.athletes.find((x) => x.id === id) : undefined;
  if (a) {
    v.pos = POSITIONS.indexOf(a.pos);
    v.sel = Math.max(0, careerList(squad, a.pos).findIndex((x) => x.id === id));
  }
  return v;
}

export function careerTabAt(x: number, y: number): number {
  return tabAt(x, y);
}

export function careerRowAt(x: number, y: number, n: number): number {
  if (x < LIST_X || x >= LIST_X + LIST_W || y < LIST_TOP) return -1;
  const i = Math.floor((y - LIST_TOP) / ROW_H);
  return i < n ? i : -1;
}

export function modeAt(x: number, y: number): number {
  return MODE_BTNS.findIndex((b) => inBox(b, x, y));
}

/** The stat that tells a season at his position, short: passing, rushing, receiving or kicking. */
function keyStat(pos: Position, st: Partial<Record<StatKey, number>>): string {
  const n = (k: StatKey) => st[k] ?? 0;
  if (pos === 'QB') return n('att') ? `${n('passYds')}Y ${n('passTd')}TD` : '';
  if (pos === 'HB' || pos === 'FB') return n('rush') ? `${n('rushYds')}Y ${n('rushTd')}TD` : '';
  if (pos === 'WR' || pos === 'TE') return n('rec') ? `${n('recYds')}Y ${n('recTd')}TD` : '';
  if (pos === 'K') return n('fga') ? `${n('fgm')}/${n('fga')} FG` : '';
  return '';
}

/** Career totals at his position, spelled out. */
function totalsText(pos: Position, st: Partial<Record<StatKey, number>>): string {
  const n = (k: StatKey) => st[k] ?? 0;
  if (pos === 'QB' && n('att')) return `${n('passYds')} YDS ${n('passTd')} TD ${n('int')} INT`;
  if ((pos === 'HB' || pos === 'FB') && n('rush')) return `${n('rush')} CAR ${n('rushYds')} YDS ${n('rushTd')} TD`;
  if ((pos === 'WR' || pos === 'TE') && n('rec')) return `${n('rec')} REC ${n('recYds')} YDS ${n('recTd')} TD`;
  if (pos === 'K' && n('fga')) return `${n('fgm')}/${n('fga')} FIELD GOALS`;
  return '';
}

const when = (e: StoryEvent) => (e.week === undefined ? `${e.year} OFF` : `${e.year} WK${e.week}`);

export function drawCareer(g: CanvasRenderingContext2D, s: SeasonState, squad: Squad, v: CareerView): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const t = squad.team;
  g.fillStyle = t.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${t.school.toUpperCase()} CAREERS`, 10, 6, { size: 8 });
  text(g, 'EVERY SEASON, EVERY STORY', 10, 18, { color: '#e6e6e6' });
  text(g, String(s.year), VIEW_W - 10, 6, { align: 'right', color: GOLD });

  POSITIONS.forEach((p, i) => {
    const on = i === v.pos;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * TAB_W, TAB_Y, TAB_W, TAB_H);
    }
    text(g, p, i * TAB_W + TAB_W / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });

  const list = careerList(squad, POSITIONS[v.pos]);
  const hy = LIST_TOP - 11;
  text(g, 'NAME', LIST_X + 8, hy, { color: DIM, shadow: false });
  text(g, 'CLS', LIST_X + 136, hy, { color: DIM, shadow: false });
  text(g, 'YRS', LIST_X + 200, hy, { align: 'right', color: DIM, shadow: false });
  text(g, 'OVR', LIST_X + LIST_W - 6, hy, { align: 'right', color: DIM, shadow: false });
  list.forEach((a, i) => {
    const y = LIST_TOP + i * ROW_H;
    const sel = i === v.sel;
    const hover = careerRowAt(v.mx, v.my, list.length) === i;
    g.fillStyle = sel ? '#22324a' : hover ? '#1a2535' : '#151d29';
    g.fillRect(LIST_X, y, LIST_W, ROW_H - 2);
    const c = careerOf(s, a.id);
    const ty = y + 3;
    text(g, shortName(a, 14), LIST_X + 8, ty, { color: !healthy(a) ? RED : a.real ? GOLD : '#ffffff', shadow: false });
    text(g, classLabel(a), LIST_X + 136, ty, { color: SOFT, shadow: false });
    const years = (c?.seasons.length ?? 0) + (c?.seasons.some((r) => r.year === s.year) ? 0 : 1);
    text(g, String(years), LIST_X + 200, ty, { align: 'right', color: SOFT, shadow: false });
    if (c?.story.some((e) => e.kind === 'transfer')) text(g, 'TR', LIST_X + 210, ty, { color: ACCENT, shadow: false });
    const o = overall(a.r, a.pos);
    text(g, String(o), LIST_X + LIST_W - 6, ty, { align: 'right', color: ovrColor(o), shadow: false });
  });

  const a = list[Math.min(v.sel, list.length - 1)];
  if (a) drawCard(g, s, a, t.id, v);
  drawHint(g, 'A/D: POSITION  W/S: PLAYER  G: SEASONS/GROWTH  WHEEL: STORY  ESC: BACK');
}

function drawCard(g: CanvasRenderingContext2D, s: SeasonState, a: Athlete, team: string, v: CareerView): void {
  g.fillStyle = '#151d29';
  g.fillRect(CARD_X, CARD_TOP, CARD_R - CARD_X, CARD_BOTTOM - CARD_TOP);
  const x = CARD_X + 8;
  const c = careerOf(s, a.id);
  const rows = careerRows(s, a, team);
  const tot = careerTotals(rows);

  text(g, athleteName(a).toUpperCase().slice(0, 30), x, CARD_TOP + 6, { color: a.real ? GOLD : '#ffffff' });
  text(g, `#${a.num}  ${a.pos}  ${archetypeLabel(a).toUpperCase()}  ${classLabel(a)}`.slice(0, 44), x, CARD_TOP + 18, { color: ACCENT });
  const o = overall(a.r, a.pos);
  text(g, String(o), CARD_R - 10, CARD_TOP + 6, { size: 16, align: 'right', color: ovrColor(o) });
  text(g, headline(c, rows).join(', ').toUpperCase(), x, CARD_TOP + 30, { color: GOLD, shadow: false });
  const totals = totalsText(a.pos, tot.st);
  text(g, `${tot.seasons} SZN  ${tot.gp} GP  ${tot.gs} GS${totals ? `  ${totals}` : ''}`.slice(0, 44), x, CARD_TOP + 42, { color: '#cfd6df', shadow: false });

  MODE_BTNS.forEach((b, i) => {
    const on = v.mode === i;
    g.fillStyle = on ? '#2c3b52' : inBox(b, v.mx, v.my) ? '#1f2a3a' : '#1a2230';
    g.fillRect(b.x, b.y, b.w, b.h);
    text(g, MODE_LABELS[i], b.x + b.w / 2, b.y + 2, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });

  if (v.mode === 1) drawGrowth(g, a, rows, x);
  else drawSeasons(g, s, a, rows, c?.story ?? [], x, v);
}

function drawSeasons(
  g: CanvasRenderingContext2D, s: SeasonState, a: Athlete, rows: CareerSeason[], story: StoryEvent[], x: number, v: CareerView,
): void {
  const hy = TABLE_Y;
  const col = { team: x + 40, cls: x + 80, role: x + 128, gp: x + 188, gs: x + 212, ovr: x + 222 };
  text(g, 'YEAR', x, hy, { color: DIM, shadow: false });
  text(g, 'TEAM', col.team, hy, { color: DIM, shadow: false });
  text(g, 'CLS', col.cls, hy, { color: DIM, shadow: false });
  text(g, 'ROLE', col.role, hy, { color: DIM, shadow: false });
  text(g, 'GP', col.gp, hy, { align: 'right', color: DIM, shadow: false });
  text(g, 'GS', col.gs, hy, { align: 'right', color: DIM, shadow: false });
  text(g, 'OVR', col.ovr, hy, { color: DIM, shadow: false });
  const shown = rows.slice(-6);
  shown.forEach((r, i) => {
    const y = hy + LINE + 2 + i * LINE;
    const live = r.year === s.year && !careerOf(s, a.id)?.seasons.some((x) => x.year === s.year);
    text(g, String(r.year), x, y, { color: live ? GREEN : '#ffffff', shadow: false });
    text(g, teamById(r.team).abbr, col.team, y, { color: SOFT, shadow: false });
    text(g, r.cls, col.cls, y, { color: SOFT, shadow: false });
    text(g, ROLE_LABEL[r.role], col.role, y, { color: r.role === 'starter' ? GOLD : SOFT, shadow: false });
    text(g, String(r.gp ?? 0), col.gp, y, { align: 'right', color: SOFT, shadow: false });
    text(g, String(r.gs ?? 0), col.gs, y, { align: 'right', color: SOFT, shadow: false });
    text(g, `${r.ovr0}>${r.ovr1}`, col.ovr, y, { color: r.ovr1 > r.ovr0 ? GREEN : SOFT, shadow: false });
    text(g, keyStat(a.pos, r.st ?? {}), CARD_R - 10, y, { align: 'right', color: '#cfd6df', shadow: false });
  });

  // The story, newest first, wrapped; the wheel scrolls it.
  const sy = hy + LINE + 2 + 6 * LINE + 6;
  g.fillStyle = '#2a3647';
  g.fillRect(x, sy - 3, CARD_R - CARD_X - 16, 1);
  text(g, 'STORY', x, sy, { color: DIM, shadow: false });
  const lines: { s: string; c: string }[] = [];
  for (const e of [...story].reverse()) {
    const head = `${when(e)} ${teamById(e.team).abbr} `;
    wrap(`${head}${e.text.toUpperCase()}`, STORY_CHARS).forEach((l, i) => lines.push({ s: i ? `  ${l}` : l, c: STORY_COLOR[e.kind] ?? '#cfd6df' }));
  }
  if (!lines.length) lines.push({ s: 'NOTHING YET: HIS STORY STARTS ON THE FIELD.', c: DIM });
  const fit = Math.floor((CARD_BOTTOM - 6 - (sy + LINE + 2)) / LINE);
  v.scroll = Math.max(0, Math.min(v.scroll, lines.length - fit));
  lines.slice(v.scroll, v.scroll + fit).forEach((l, i) => text(g, l.s, x, sy + LINE + 2 + i * LINE, { color: l.c, shadow: false }));
  if (lines.length > fit) text(g, `${v.scroll + 1}-${Math.min(lines.length, v.scroll + fit)}/${lines.length}`, CARD_R - 10, sy, { align: 'right', color: DIM, shadow: false });
}

const STORY_COLOR: Partial<Record<StoryEvent['kind'], string>> = {
  breakout: GOLD, breakthrough: GREEN, award: GOLD, spark: GREEN, injury: RED, transfer: ACCENT, portal: ACCENT, left: RED, start: '#ffffff',
};

/** All-time gains at each rating in his overall, and each of his last four seasons' share. */
function drawGrowth(g: CanvasRenderingContext2D, a: Athlete, rows: CareerSeason[], x: number): void {
  const hy = TABLE_Y;
  const recent = rows.slice(-4);
  const all = careerGains(rows);
  text(g, 'RATING', x, hy, { color: DIM, shadow: false });
  text(g, 'NOW', x + 150, hy, { align: 'right', color: DIM, shadow: false });
  text(g, 'ALL', x + 190, hy, { align: 'right', color: DIM, shadow: false });
  recent.forEach((r, i) => text(g, `'${String(r.year).slice(2)}`, x + 230 + i * 34, hy, { align: 'right', color: DIM, shadow: false }));
  overallBreakdown(a.r, a.pos).forEach((part, i) => {
    const y = hy + LINE + 2 + i * LINE;
    text(g, RATING_INFO[part.key].label.toUpperCase(), x, y, { color: '#ffffff', shadow: false });
    text(g, String(part.value), x + 150, y, { align: 'right', color: ovrColor(part.value), shadow: false });
    const n = all[part.key] ?? 0;
    text(g, n ? `+${n}` : '-', x + 190, y, { align: 'right', color: n ? GREEN : DIM, shadow: false });
    recent.forEach((r, j) => {
      const d = r.d?.[part.key] ?? 0;
      text(g, d ? `+${d}` : '-', x + 230 + j * 34, y, { align: 'right', color: d ? GREEN : DIM, shadow: false });
    });
  });
  const y = hy + LINE + 2 + (overallBreakdown(a.r, a.pos).length + 1) * LINE;
  const ovrs = rows.map((r) => r.ovr0);
  if (rows.length) text(g, `OVERALL ${ovrs[0]} > ${rows[rows.length - 1].ovr1}  LEVEL-UPS ${rows.reduce((s, r) => s + (r.lvl ?? 0), 0)}`, x, y, { color: '#cfd6df', shadow: false });
}
