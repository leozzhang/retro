import { athleteName, positionOrder, starters, teamRatings } from '../data/depth';
import { overall } from '../data/positions';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { fanPulse, type Pulse, type Tone } from '../season/fanPulse';
import { latestPoll, rankIn } from '../season/polls';
import { coachTenure, headlines, ordinal, pastSeasons, teamNews, trophies, type Headline, type Trophies } from '../season/program';
import { records, recordText, standings } from '../season/standings';
import { seasonStats, type SeasonLine } from '../season/stats';
import type { SeasonState } from '../season/types';
import { squadFor, staffFor } from '../season/world';
import { CAREER_HINT, drawCareer, type CareerView } from './careerScreen';
import { drawHint } from './hud';
import { drawRich, linkText, newsRich, playerLink, teamLink, wrapSpans, type RichLine } from './links';
import { ovrColor } from './rosterScreen';
import { text } from './text';

/**
 * A program's page, for any team (the user's is PROGRAM on the hub): the header in its colors with
 * the page's tabs, then OVERVIEW (the fan pulse, the trophy case, the last five seasons, the big
 * headlines), SEASON (schedule, standing, leaders, staff), HISTORY (titles, Heismans, every season
 * on record), NEWS (this season's and the chronicle's) and REGISTRY (every player's career).
 * Names are links (render/links.ts). See docs/PROGRAM.md.
 */

export const PROGRAM_TABS = ['OVERVIEW', 'SEASON', 'HISTORY', 'NEWS', 'REGISTRY'] as const;

export interface ProgramView {
  team: string;
  tab: number;
  /** Lines scrolled past on HISTORY and NEWS. */
  scroll: number;
  career: CareerView;
  mx: number;
  my: number;
}

type Box = { x: number; y: number; w: number; h: number };

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';
const CARD = '#141b26';
const RULE = '#1f2a3a';
const TONE: Record<Tone, string> = { hope: GREEN, worry: RED, calm: '#cfd6df' };

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

/** The page tabs, on the header's second line. */
export function programTabRect(i: number): Box {
  let x = 8;
  for (let j = 0; j < i; j++) x += (PROGRAM_TABS[j].length + 2) * 8 + 2;
  return { x, y: 16, w: (PROGRAM_TABS[i].length + 2) * 8, h: 14 };
}

export function programTabAt(x: number, y: number): number {
  return PROGRAM_TABS.findIndex((_, i) => inBox(programTabRect(i), x, y));
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

/** How many lines of HISTORY's or NEWS's list there are, and how many show, for the scroll. */
export function programScrollMax(s: SeasonState, v: ProgramView): number {
  if (v.tab === 2) return Math.max(0, pastSeasons(s, v.team).length - HIST_ROWS);
  if (v.tab === 3) return Math.max(0, newsList(s, v.team).length - NEWS_ROWS);
  return 0;
}

export function drawProgram(g: CanvasRenderingContext2D, s: SeasonState, v: ProgramView): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const t = teamById(v.team);
  const rec = records(s).get(v.team)!;
  const rank = rankIn(latestPoll(s, 'ap'), v.team);
  const tr = teamRatings(squadFor(s, v.team));
  const ten = coachTenure(s, v.team);

  g.fillStyle = t.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${rank ? `#${rank} ` : ''}${t.school.toUpperCase()} ${t.mascot.toUpperCase()}`, 10, 4, { size: 8 });
  text(g, `${recordText(rec)} (${rec.cw}-${rec.cl} ${t.conference.toUpperCase()})  OVR ${tr.ovr}`, VIEW_W - 10, 4, { align: 'right', color: GOLD });
  text(g, `HC ${ten.name}, ${ordinal(ten.year)} YR`, VIEW_W - 10, 19, { align: 'right', color: '#e6e6e6' });
  PROGRAM_TABS.forEach((label, i) => {
    const b = programTabRect(i);
    const on = i === v.tab;
    const hover = !on && inBox(b, v.mx, v.my);
    g.fillStyle = on ? '#0d1117' : hover ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.25)';
    g.fillRect(b.x, b.y, b.w, b.h);
    text(g, label, b.x + b.w / 2, b.y + 4, { align: 'center', color: on ? GOLD : hover ? '#ffffff' : '#d8dde4', shadow: on ? undefined : false });
  });

  switch (v.tab) {
    case 1:
      drawSeasonTab(g, s, v);
      break;
    case 2:
      drawHistoryTab(g, s, v);
      break;
    case 3:
      drawNewsTab(g, s, v);
      break;
    case 4:
      drawCareer(g, s, squadFor(s, v.team), v.career);
      break;
    default:
      drawOverview(g, s, v);
  }
  const keys = '1-5 OR CLICK: PAGE';
  drawHint(g, v.tab === 4 ? CAREER_HINT : v.tab === 2 || v.tab === 3 ? `${keys}  WHEEL OR W/S: SCROLL  CLICK A NAME  ESC: BACK` : `${keys}  CLICK A NAME TO OPEN IT  ESC: BACK`);
}

// ------------------------------------------------------------ OVERVIEW

const L_X = 6;
const L_W = 312;
const R_X = 324;
const R_W = VIEW_W - 6 - R_X;
const TOP = 36;
const BOTTOM = 344;

/** The mood's color: red through gold to green. */
function moodColor(m: number): string {
  return m <= -0.38 ? RED : m <= -0.07 ? '#ffae5a' : m <= 0.07 ? '#e6e6e6' : m <= 0.25 ? '#c8f07a' : GREEN;
}

const pulseCache = new WeakMap<SeasonState, Map<string, Pulse>>();

/** The pulse, once per team per week and phase (it reads the whole season). */
function pulseOf(s: SeasonState, id: string): Pulse {
  let m = pulseCache.get(s);
  if (!m) pulseCache.set(s, (m = new Map()));
  const key = `${id}:${s.week}:${s.phase}:${s.offseason?.stage ?? ''}:${s.offseason?.round ?? ''}:${s.games.filter((g) => g.result).length}`;
  let p = m.get(key);
  if (!p) m.set(key, (p = fanPulse(s, id)));
  return p;
}

function drawOverview(g: CanvasRenderingContext2D, s: SeasonState, v: ProgramView): void {
  drawPulse(g, s, v.team);
  drawTrophies(g, trophies(s, v.team));
  drawLastFive(g, s, v.team);
  drawHeadlines(g, s, v.team);
}

function drawPulse(g: CanvasRenderingContext2D, s: SeasonState, id: string): void {
  const p = pulseOf(s, id);
  card(g, L_X, TOP, L_W, BOTTOM - TOP, 'FAN PULSE', `EXPECTATION: ${p.expect}`);
  const x = L_X + 8;
  const w = L_W - 16;
  text(g, p.label, x, TOP + 24, { size: 16, color: moodColor(p.mood) });
  // The meter: five bands from red to green, and where the fans are.
  const my = TOP + 48;
  const bands = [RED, '#ffae5a', '#e6e6e6', '#c8f07a', GREEN];
  bands.forEach((c, i) => {
    g.fillStyle = c;
    g.globalAlpha = 0.35;
    g.fillRect(x + (i * w) / 5, my, w / 5 - 1, 6);
  });
  g.globalAlpha = 1;
  const at = x + ((p.mood + 1) / 2) * w;
  g.fillStyle = '#ffffff';
  g.fillRect(Math.round(at) - 1, my - 3, 3, 12);
  text(g, 'ANGRY', x, my + 10, { color: DIM, shadow: false });
  text(g, 'THRILLED', x + w, my + 10, { align: 'right', color: DIM, shadow: false });

  g.fillStyle = RULE;
  g.fillRect(x, TOP + 78, w, 1);
  text(g, 'WHAT THE FANS ARE SAYING', x, TOP + 84, { color: SOFT, shadow: false });
  let y = TOP + 100;
  const chars = Math.floor((w - 12) / 8);
  for (const pt of p.points) {
    const lines = newsRich(s, { text: pt.text, teams: [id] }, chars);
    if (y + lines.length * 11 > BOTTOM - 4) break;
    g.fillStyle = TONE[pt.tone];
    g.fillRect(x, y + 2, 4, 4);
    lines.forEach((l, i) => drawRich(g, { t: l.t.trimStart(), spans: l.spans.map((sp) => ({ ...sp, start: sp.start - (l.t.length - l.t.trimStart().length) })) }, x + 12, y + i * 11, { color: i === 0 ? '#ffffff' : '#e6e6e6', shadow: false }));
    y += lines.length * 11 + 8;
  }
}

function drawTrophies(g: CanvasRenderingContext2D, t: Trophies): void {
  const h = 86;
  card(g, R_X, TOP, R_W, h, 'TROPHY CASE', 'LAST');
  const x = R_X + 8;
  const right = R_X + R_W - 8;
  const last = (ys: number[]) => (ys.length ? String(ys[ys.length - 1]) : '-');
  const b = t.bowls;
  const rows: [string, string, string][] = [
    ['NATIONAL TITLES', String(t.nat.length), last(t.nat)],
    ...(t.fcs.length ? [['FCS/DII TITLES', String(t.fcs.length), last(t.fcs)] as [string, string, string]] : []),
    ['CONF TITLES', String(t.conf), t.lastConf ? String(t.lastConf) : '-'],
    ['PLAYOFF TRIPS', String(t.playoffs.length), last(t.playoffs)],
    ['BOWL RECORD', `${b.w}-${b.l}${b.t ? `-${b.t}` : ''}`, b.last ? String(b.last) : '-'],
    ['HEISMANS', String(t.heisman.length), last(t.heisman.map((x) => x.year))],
  ];
  rows.slice(0, 6).forEach(([label, n, yr], i) => {
    const y = TOP + 20 + i * 11;
    const big = label === 'NATIONAL TITLES' && t.nat.length > 0;
    text(g, label, x, y, { color: big ? GOLD : '#cfd6df', shadow: false });
    text(g, n, x + 196, y, { align: 'right', color: n === '0' || n === '0-0' ? DIM : big ? GOLD : '#ffffff', shadow: false });
    text(g, yr, right, y, { align: 'right', color: DIM, shadow: false });
  });
}

const FIVE_Y = TOP + 92;
const FIVE_H = 92;

function drawLastFive(g: CanvasRenderingContext2D, s: SeasonState, id: string): void {
  const rows = pastSeasons(s, id).slice(-5);
  card(g, R_X, FIVE_Y, R_W, FIVE_H, 'LAST FIVE SEASONS');
  if (!rows.length) {
    text(g, 'NO SEASONS ON RECORD YET', R_X + R_W / 2, FIVE_Y + 46, { align: 'center', color: DIM, shadow: false });
    return;
  }
  const col = R_W / 5;
  const base = FIVE_Y + FIVE_H - 14;
  const maxH = 44;
  rows.forEach((r, i) => {
    const cx = R_X + col * i + col / 2;
    const h = Math.max(2, Math.round((r.w / 15) * maxH));
    g.fillStyle = r.nc ? GOLD : r.playoff ? GREEN : r.w > r.l ? '#4f8f62' : '#8a4a4a';
    if (r.live) g.globalAlpha = 0.55;
    g.fillRect(Math.round(cx - 9), base - h, 18, h);
    g.globalAlpha = 1;
    text(g, `${r.w}-${r.l}`, cx, base - h - 10, { align: 'center', color: '#ffffff', shadow: false });
    text(g, r.live ? 'NOW' : `'${String(r.year).slice(2)}`, cx, base + 3, { align: 'center', color: r.live ? ACCENT : SOFT, shadow: false });
  });
}

const HEAD_Y = FIVE_Y + FIVE_H + 6;

const when = (s: SeasonState, h: Pick<Headline, 'year' | 'week'>) =>
  `${h.year}${h.year === s.year && h.week > 0 ? ` WEEK ${h.week}` : h.week === 0 ? ' OFFSEASON' : ''}`;

function drawHeadlines(g: CanvasRenderingContext2D, s: SeasonState, id: string): void {
  card(g, R_X, HEAD_Y, R_W, BOTTOM - HEAD_Y, 'BIG HEADLINES');
  const x = R_X + 8;
  const chars = Math.floor((R_W - 16) / 8);
  let y = HEAD_Y + 20;
  const list = headlines(s, id, 4);
  if (!list.length) text(g, 'NOTHING BIG YET', x, y, { color: DIM, shadow: false });
  for (const h of list) {
    const lines = newsRich(s, h, chars).slice(0, 3);
    if (y + 9 + lines.length * 10 > BOTTOM - 2) break;
    text(g, when(s, h), x, y, { color: DIM, shadow: false });
    lines.forEach((l, i) => drawRich(g, l, x, y + 9 + i * 10, { color: h.w >= 8 ? GOLD : '#ffffff', shadow: false }));
    y += 9 + lines.length * 10 + 5;
  }
}

// ------------------------------------------------------------ SEASON

function drawSeasonTab(g: CanvasRenderingContext2D, s: SeasonState, v: ProgramView): void {
  const id = v.team;
  const ap = latestPoll(s, 'ap');
  const games = s.games.filter((x) => x.home === id || x.away === id).sort((a, b) => a.week - b.week);
  card(g, L_X, TOP, L_W, BOTTOM - TOP, `${s.year} SCHEDULE`);
  text(g, 'WK', L_X + 8, TOP + 20, { color: DIM, shadow: false });
  text(g, 'OPPONENT', L_X + 32, TOP + 20, { color: DIM, shadow: false });
  text(g, 'RESULT', L_X + L_W - 8, TOP + 20, { align: 'right', color: DIM, shadow: false });
  games.slice(0, 22).forEach((x, i) => {
    const y = TOP + 32 + i * 11;
    const opp = x.home === id ? x.away : x.home;
    const cur = x.week === s.week && !x.result;
    const vs = x.neutral ? 'VS' : x.home === id ? 'VS' : '@';
    const school = teamById(opp).school.toUpperCase().slice(0, 16);
    const r = rankIn(ap, opp);
    const head = `${vs.padEnd(3)}${r ? `#${r} ` : ''}`;
    text(g, String(x.week).padStart(2), L_X + 8, y, { color: cur ? GOLD : SOFT, shadow: false });
    drawRich(g, { t: head + school, spans: [{ start: head.length, len: school.length, link: teamLink(opp) }] }, L_X + 32, y, { color: cur ? GOLD : '#ffffff', shadow: false });
    if (x.result) {
      const us = x.home === id ? x.result.home : x.result.away;
      const them = x.home === id ? x.result.away : x.result.home;
      const res = `${us > them ? 'W' : 'L'} ${us}-${them}${x.result.ot ? ' OT' : ''}`;
      text(g, res, L_X + L_W - 8, y, { align: 'right', color: us > them ? GREEN : RED, shadow: false });
    } else if (x.name) text(g, x.name.toUpperCase().slice(0, 12), L_X + L_W - 8, y, { align: 'right', color: ACCENT, shadow: false });
  });
  if (!games.length) text(g, 'NO GAMES ON THE SCHEDULE', L_X + 8, TOP + 32, { color: DIM, shadow: false });

  // The standing.
  const t = teamById(id);
  const sh = 56;
  card(g, R_X, TOP, R_W, sh, 'WHERE THEY STAND');
  const x = R_X + 8;
  const rows = t.conference === 'Independent' ? [] : standings(s, t.conference);
  const place = rows.findIndex((r) => r.team === id);
  const rec = records(s).get(id)!;
  const high = s.polls.filter((p) => p.kind === 'ap').map((p) => rankIn(p, id)).filter((r) => r > 0);
  const cfp = rankIn(latestPoll(s, 'cfp'), id);
  text(g, place >= 0 ? `${ordinal(place + 1)} IN THE ${t.conference.toUpperCase()} (${rec.cw}-${rec.cl})` : 'INDEPENDENT', x, TOP + 20, { color: '#ffffff', shadow: false });
  const rank = rankIn(latestPoll(s, 'ap'), id);
  text(g, `AP: ${rank ? `NO. ${rank}` : 'UNRANKED'}${high.length ? `  HIGH: NO. ${Math.min(...high)}` : ''}`, x, TOP + 31, { color: '#cfd6df', shadow: false });
  text(g, `CFP: ${cfp ? `NO. ${cfp}` : latestPoll(s, 'cfp') ? 'UNRANKED' : 'NOT OUT YET'}  PF ${rec.pf} PA ${rec.pa}`, x, TOP + 42, { color: '#cfd6df', shadow: false });

  drawLeaders(g, s, id, TOP + sh + 6);
}

function drawLeaders(g: CanvasRenderingContext2D, s: SeasonState, id: string, y0: number): void {
  const squad = squadFor(s, id);
  const stats = [...seasonStats(s).values()].filter((l) => l.team === id);
  const lh = 78;
  card(g, R_X, y0, R_W, lh, 'TEAM LEADERS');
  const x = R_X + 8;
  const best = (k: keyof SeasonLine) => stats.filter((l) => (l[k] as number) > 0).sort((a, b) => (b[k] as number) - (a[k] as number))[0];
  const lines: [string, SeasonLine | undefined, (l: SeasonLine) => string][] = [
    ['PASS', best('passYds'), (l) => `${l.passYds} YDS ${l.passTd} TD`],
    ['RUSH', best('rushYds'), (l) => `${l.rushYds} YDS ${l.rushTd} TD`],
    ['REC', best('recYds'), (l) => `${l.recYds} YDS ${l.recTd} TD`],
    ['KICK', best('fgm'), (l) => `${l.fgm}/${l.fga} FG`],
  ];
  lines.forEach(([label, l], i) => {
    const y = y0 + 20 + i * 13;
    text(g, label, x, y, { color: DIM, shadow: false });
    if (!l) {
      text(g, '-', x + 44, y, { color: DIM, shadow: false });
      return;
    }
    const on = squad.athletes.some((a) => a.id === l.id);
    linkText(g, l.name.toUpperCase().slice(0, 18), x + 44, y, { color: '#ffffff', shadow: false }, on ? playerLink(id, l.id) : undefined);
    text(g, lines[i][2](l), R_X + R_W - 8, y, { align: 'right', color: '#cfd6df', shadow: false });
  });
  if (!stats.length) text(g, 'NO STATS YET', x + 44, y0 + 20, { color: DIM, shadow: false });

  // The staff, and the best players.
  const y1 = y0 + lh + 6;
  card(g, R_X, y1, R_W, BOTTOM - y1, 'STAFF AND STARS');
  const ten = coachTenure(s, id);
  const staff = staffFor(s, id);
  const nm = (c: { first: string; last: string }) => `${c.first[0]}. ${c.last}`.toUpperCase();
  text(g, `HC  ${ten.name}`, x, y1 + 20, { color: '#ffffff', shadow: false });
  text(g, `${ordinal(ten.year)} YEAR${ten.w + ten.l ? `, ${ten.w}-${ten.l}` : ''}`, R_X + R_W - 8, y1 + 20, { align: 'right', color: SOFT, shadow: false });
  text(g, `OC  ${nm(staff.OC)}`, x, y1 + 31, { color: '#cfd6df', shadow: false });
  text(g, `DC  ${nm(staff.DC)}`, x + 148, y1 + 31, { color: '#cfd6df', shadow: false });
  const st = Object.values(starters(squad));
  const stars = [...new Map(st.map((a) => [a.id, a])).values()].sort((a, b) => overall(b.r, b.pos) - overall(a.r, a.pos));
  const qb = positionOrder(squad, 'QB')[0];
  const shown = [...(qb ? [qb] : []), ...stars.filter((a) => a.id !== qb?.id)].slice(0, Math.floor((BOTTOM - y1 - 48) / 11));
  shown.forEach((a, i) => {
    const y = y1 + 46 + i * 11;
    const o = overall(a.r, a.pos);
    text(g, a.pos, x, y, { color: SOFT, shadow: false });
    linkText(g, athleteName(a).toUpperCase().slice(0, 22), x + 32, y, { color: a.real ? GOLD : '#ffffff', shadow: false }, playerLink(id, a.id));
    text(g, String(o), R_X + R_W - 8, y, { align: 'right', color: ovrColor(o), shadow: false });
  });
}

// ------------------------------------------------------------ HISTORY

const CONF_SHORT: Record<string, string> = { 'Mountain West': 'MWC', American: 'AAC', Independent: 'IND' };

const HIST_TABLE_Y = TOP + 104;
const HIST_ROWS = Math.floor((BOTTOM - HIST_TABLE_Y - 24) / 11);

function drawHistoryTab(g: CanvasRenderingContext2D, s: SeasonState, v: ProgramView): void {
  const id = v.team;
  const t = trophies(s, id);
  const h = 98;
  card(g, L_X, TOP, L_W, h, 'ALL-TIME');
  const x = L_X + 8;
  const at = t.allTime;
  const games = at.w + at.l + at.t;
  text(g, `RECORD ${at.w}-${at.l}${at.t ? `-${at.t}` : ''}${games ? `  (${((at.w + at.t / 2) / games).toFixed(3).replace(/^0/, '')})` : ''}`, x, TOP + 20, { color: '#ffffff', shadow: false });
  const chars = Math.floor((L_W - 16) / 8);
  const lines: { t: string; c: string }[] = [];
  const add = (label: string, ys: number[], c: string) => {
    if (!ys.length) return;
    plain(`${label}: ${ys.join(' ')}`, chars).forEach((l) => lines.push({ t: l, c }));
  };
  add('NATIONAL TITLES', t.nat, GOLD);
  add('FCS/DII TITLES', t.fcs, GOLD);
  add('PLAYOFFS', t.playoffs, GREEN);
  if (t.conf) lines.push({ t: `CONF TITLES: ${t.conf}${t.lastConf ? `, LAST ${t.lastConf}` : ''}`, c: '#cfd6df' });
  const b = t.bowls;
  if (b.apps) lines.push({ t: `BOWLS: ${b.apps} GAMES, ${b.w}-${b.l}${b.t ? `-${b.t}` : ''}`, c: '#cfd6df' });
  if (!lines.length) lines.push({ t: 'NO TITLES OR BOWLS ON RECORD YET', c: DIM });
  lines.slice(0, 6).forEach((l, i) => text(g, l.t, x, TOP + 32 + i * 10, { color: l.c, shadow: false }));

  card(g, R_X, TOP, R_W, h, 'HEISMANS AND FIRST ROUNDERS');
  const rx = R_X + 8;
  const names = [
    ...t.heisman.map((p) => ({ t: `${p.year} ${p.name.toUpperCase()}`, c: GOLD })),
    ...t.firstRound.map((p) => ({ t: `${p.year} #${p.pick} ${p.name.toUpperCase()} ${p.pos}`, c: '#cfd6df' })),
  ];
  const fit = 7;
  names.slice(-fit).forEach((l, i) => text(g, l.t.slice(0, 37), rx, TOP + 20 + i * 10, { color: l.c, shadow: false }));
  if (names.length > fit) text(g, `+${names.length - fit} MORE`, R_X + R_W - 8, TOP + 4, { align: 'right', color: DIM, shadow: false });
  if (!names.length) text(g, 'NONE YET', rx, TOP + 20, { color: DIM, shadow: false });

  // Every season on record, newest first.
  const rows = pastSeasons(s, id).slice().reverse();
  const ty = HIST_TABLE_Y;
  card(g, L_X, ty, VIEW_W - 12, BOTTOM - ty, 'SEASON BY SEASON', s.config.history === 'fresh' ? 'FRESH START' : 'REAL HISTORY TO 2025');
  const cols = { year: x, conf: x + 44, wl: x + 140, cwl: x + 196, ap: x + 248, post: x + 280, hc: VIEW_W - 14 };
  const hy = ty + 18;
  text(g, 'YEAR', cols.year, hy, { color: DIM, shadow: false });
  text(g, 'CONF', cols.conf, hy, { color: DIM, shadow: false });
  text(g, 'W-L', cols.wl, hy, { color: DIM, shadow: false });
  text(g, 'CONF', cols.cwl, hy, { color: DIM, shadow: false });
  text(g, 'AP', cols.ap, hy, { color: DIM, shadow: false });
  text(g, 'POSTSEASON', cols.post, hy, { color: DIM, shadow: false });
  text(g, 'COACH', cols.hc, hy, { align: 'right', color: DIM, shadow: false });
  v.scroll = Math.max(0, Math.min(v.scroll, rows.length - HIST_ROWS));
  rows.slice(v.scroll, v.scroll + HIST_ROWS).forEach((r, i) => {
    const y = hy + 12 + i * 11;
    const c = r.nc ? GOLD : r.live ? ACCENT : '#ffffff';
    text(g, String(r.year), cols.year, y, { color: c, shadow: false });
    text(g, (CONF_SHORT[r.conf] ?? r.conf).toUpperCase().slice(0, 11), cols.conf, y, { color: SOFT, shadow: false });
    text(g, `${r.w}-${r.l}`, cols.wl, y, { color: r.w > r.l ? '#ffffff' : '#cfd6df', shadow: false });
    text(g, r.conf === 'Independent' ? '-' : `${r.cw}-${r.cl}`, cols.cwl, y, { color: SOFT, shadow: false });
    text(g, r.ap ? String(r.ap) : '-', cols.ap, y, { color: r.ap ? '#ffffff' : DIM, shadow: false });
    text(g, (r.live ? 'IN PROGRESS' : r.post ?? '-').slice(0, 26), cols.post, y, { color: r.nc ? GOLD : r.playoff ? GREEN : r.post ? '#cfd6df' : DIM, shadow: false });
    text(g, (r.hc ?? '').slice(0, 14), cols.hc, y, { align: 'right', color: SOFT, shadow: false });
  });
  if (!rows.length) text(g, 'NO SEASONS ON RECORD YET', x, hy + 12, { color: DIM, shadow: false });
  if (rows.length > HIST_ROWS) text(g, `${v.scroll + 1}-${Math.min(rows.length, v.scroll + HIST_ROWS)}/${rows.length}`, VIEW_W - 14, ty + 4, { align: 'right', color: DIM, shadow: false });
}

// ------------------------------------------------------------ NEWS

const NEWS_ROWS = Math.floor((BOTTOM - TOP - 22) / 11);
const NEWS_CHARS = Math.floor((VIEW_W - 12 - 16) / 8);

const newsCache = new WeakMap<SeasonState, Map<string, { l: RichLine; c: string }[]>>();

/** The team's news, newest first, as wrapped lines under season and week headers. */
function newsList(s: SeasonState, id: string): { l: RichLine; c: string }[] {
  let m = newsCache.get(s);
  if (!m) newsCache.set(s, (m = new Map()));
  const key = `${id}:${s.news.length}:${s.week}:${s.phase}`;
  const hit = m.get(key);
  if (hit) return hit;
  const out: { l: RichLine; c: string }[] = [];
  let head = '';
  for (const h of teamNews(s, id)) {
    const label = when(s, h);
    if (label !== head) {
      if (out.length) out.push({ l: { t: '', spans: [] }, c: DIM });
      out.push({ l: { t: label, spans: [] }, c: ACCENT });
      head = label;
    }
    const c = h.w >= 8 ? GOLD : h.kind === 'upset' ? '#ff9a5a' : h.kind === 'injury' ? RED : h.kind === 'portal' ? '#c9a0ff' : h.kind === 'carousel' ? '#8fd4ff' : '#ffffff';
    for (const l of newsRich(s, h, NEWS_CHARS)) out.push({ l, c });
  }
  m.set(key, out);
  return out;
}

function drawNewsTab(g: CanvasRenderingContext2D, s: SeasonState, v: ProgramView): void {
  card(g, L_X, TOP, VIEW_W - 12, BOTTOM - TOP, 'PROGRAM NEWS', 'THIS SEASON, THEN THE BIG STORIES OF PAST SEASONS');
  const lines = newsList(s, v.team);
  v.scroll = Math.max(0, Math.min(v.scroll, lines.length - NEWS_ROWS));
  lines.slice(v.scroll, v.scroll + NEWS_ROWS).forEach((l, i) => drawRich(g, l.l, L_X + 8, TOP + 20 + i * 11, { color: l.c, shadow: false }));
  if (!lines.length) text(g, 'NO NEWS YET', L_X + 8, TOP + 20, { color: DIM, shadow: false });
  if (lines.length > NEWS_ROWS) {
    const h = NEWS_ROWS * 11;
    g.fillStyle = RULE;
    g.fillRect(VIEW_W - 10, TOP + 20, 3, h);
    g.fillStyle = SOFT;
    g.fillRect(VIEW_W - 10, TOP + 20 + (v.scroll / lines.length) * h, 3, Math.max(6, (NEWS_ROWS / lines.length) * h));
  }
}
