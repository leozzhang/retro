import { CONFERENCES } from '../data/fbs/profile';
import { teamRatings } from '../data/depth';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { heismanRace } from '../season/awards';
import { teamLabel } from '../season/news';
import { OFFSEASON_STAGES } from '../season/offseason';
import { latestPoll, rankIn } from '../season/polls';
import { phaseLabel, userGameThisWeek } from '../season/season';
import { lastPlayedWeek, upgradedLastWeek } from '../season/progression';
import { records, recordText, standings } from '../season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from '../season/stats';
import type { SeasonGame, SeasonState } from '../season/types';
import { squadFor } from '../season/world';
import { drawHint } from './hud';
import { getSprite, teamUniform } from './sprites';
import { text } from './text';

/**
 * The season hub: the program up top, a sidebar on the left with every place to go, and the
 * selected panel on the right. Sidebar items are panels (shown in place: HOME, the schedule and the
 * national views) or pages (opened as their own screen: roster, playbook, prep, recruiting, stats).
 * The week's main action (play, sim, advance, the offseason stage) is the button under the sidebar.
 */

export type Page = 'team' | 'playbook' | 'prep' | 'recruit' | 'career';

export interface NavItem {
  /** A panel's name, or the page it opens. */
  id: string;
  label: string;
  page?: Page;
  /** The page's hotkey, shown on the item. */
  key?: string;
  /** Shown but not selectable (GAME PREP in the offseason). */
  off?: boolean;
}

export interface SeasonView {
  /** The selected sidebar item's id. */
  nav: string;
  /** Per-panel cycling with A/D: the week on SCORES and NEWS, the conference on STANDINGS, AP/CFP on POLLS. */
  sub: number;
  /** The first line shown of the week's NEWS (mouse wheel, Q/E). */
  scroll: number;
  mx: number;
  my: number;
}

export const newSeasonView = (): SeasonView => ({ nav: 'HOME', sub: 0, scroll: 0, mx: 0, my: 0 });

type Box = { x: number; y: number; w: number; h: number };

/** The panel area, right of the sidebar. */
const SB_W = 136;
const PX = 148;
const PR = VIEW_W - 8;
const PW = PR - PX;
const PCX = PX + PW / 2;
const TOP = 52;
const LINE = 11;
const ROWS = 24;
const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';
const CARD = '#141b26';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

// ------------------------------------------------------------ sidebar

const NAV_Y = 36;
const NAV_H = 14;
const HEAD_H = 16;

function navGroups(s: SeasonState): { head: string; items: NavItem[] }[] {
  const panel = (id: string): NavItem => ({ id, label: id });
  return [
    { head: '', items: [panel('HOME')] },
    {
      head: 'MY PROGRAM',
      items: [
        panel('SCHEDULE'),
        { id: 'team', label: 'ROSTER', page: 'team', key: 'T' },
        { id: 'playbook', label: 'PLAYBOOK', page: 'playbook', key: 'P' },
        { id: 'prep', label: 'GAME PREP', page: 'prep', key: 'O', off: s.phase === 'offseason' },
        ...(s.recruiting ? [{ id: 'recruit', label: 'RECRUITING', page: 'recruit', key: 'R' } as NavItem] : []),
        { id: 'career', label: 'PLAYER STATS', page: 'career', key: 'H' },
      ],
    },
    { head: 'AROUND THE FBS', items: ['SCORES', 'STANDINGS', 'POLLS', 'NEWS', 'LEADERS', 'AWARDS', 'PLAYOFF'].map(panel) },
  ];
}

/** Sidebar items top to bottom, with where each is drawn. */
function navLayout(s: SeasonState): { item: NavItem; y: number }[] {
  const out: { item: NavItem; y: number }[] = [];
  let y = NAV_Y;
  for (const grp of navGroups(s)) {
    if (grp.head) y += HEAD_H;
    for (const item of grp.items) {
      out.push({ item, y });
      y += NAV_H;
    }
  }
  return out;
}

export function navItems(s: SeasonState): NavItem[] {
  return navLayout(s).map((r) => r.item);
}

/** The sidebar item under the mouse. */
export function navAt(s: SeasonState, x: number, y: number): NavItem | undefined {
  if (x >= SB_W) return undefined;
  return navLayout(s).find((r) => y >= r.y && y < r.y + NAV_H)?.item;
}

/** The week's main action, under the sidebar; SIM sits under it when there's a game to play. */
export const PRIMARY_BTN: Box = { x: 4, y: 298, w: 128, h: 22 };
export const SIM_BTN: Box = { x: 4, y: 324, w: 128, h: 16 };

const STAGE_LABEL = { carousel: 'COACH HIRING', departures: 'DEPARTURES', signing: 'SIGNING DAY', portal: 'TRANSFER PORTAL' } as const;
const STAGE_SHORT = { carousel: 'CAROUSEL', departures: 'DRAFT', signing: 'SIGNING', portal: 'PORTAL' } as const;

/** What Space (or the button) does this week. */
export function primaryAction(s: SeasonState): { label: string; off?: boolean } {
  if (s.phase === 'offseason') return { label: STAGE_LABEL[s.offseason?.stage ?? 'portal'] };
  if (s.phase === 'complete') return s.config.length === 'open' ? { label: 'START OFFSEASON' } : { label: 'SEASON OVER', off: true };
  return { label: userGameThisWeek(s) ? 'PLAY GAME' : 'ADVANCE WEEK' };
}

function drawSidebar(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  const team = teamById(s.config.userTeamId);
  g.fillStyle = '#0a0d12';
  g.fillRect(0, 30, SB_W, 316);
  g.fillStyle = '#1f2a3a';
  g.fillRect(SB_W, 30, 1, 316);
  let y = NAV_Y;
  for (const grp of navGroups(s)) {
    if (grp.head) {
      text(g, grp.head, 8, y + 6, { color: DIM, shadow: false });
      y += HEAD_H;
    }
    for (const it of grp.items) {
      const on = it.id === v.nav;
      const hover = !on && !it.off && v.mx < SB_W && v.my >= y && v.my < y + NAV_H;
      if (on || hover) {
        g.fillStyle = on ? team.colors.primary : '#1a2230';
        g.fillRect(0, y, SB_W, NAV_H);
      }
      if (on) {
        g.fillStyle = GOLD;
        g.fillRect(0, y, 3, NAV_H);
      }
      const color = it.off ? DIM : on ? '#ffffff' : hover ? GOLD : '#cfd6df';
      text(g, it.label, 12, y + 3, { color, shadow: on ? undefined : false });
      if (it.key) text(g, it.key, SB_W - 8, y + 3, { align: 'right', color: on ? '#e6e6e6' : DIM, shadow: false });
      y += NAV_H;
    }
  }
  const act = primaryAction(s);
  const hot = !act.off && inBox(PRIMARY_BTN, v.mx, v.my);
  const b = PRIMARY_BTN;
  g.fillStyle = act.off ? '#1a2230' : hot ? '#ffe680' : GOLD;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = act.off ? DIM : '#7a3e14';
  g.fillRect(b.x, b.y + b.h - 2, b.w, 2);
  text(g, act.label, b.x + b.w / 2, b.y + 7, { align: 'center', color: act.off ? SOFT : '#1a1206', shadow: false });
  if (userGameThisWeek(s)) {
    const sb = SIM_BTN;
    const sh = inBox(sb, v.mx, v.my);
    g.fillStyle = sh ? '#24324a' : CARD;
    g.fillRect(sb.x, sb.y, sb.w, sb.h);
    text(g, 'SIM GAME  X', sb.x + sb.w / 2, sb.y + 4, { align: 'center', color: sh ? GOLD : '#cfd6df', shadow: false });
  }
}

// ------------------------------------------------------------ the hub

/** The clickable < > beside a panel's header (the week, conference or poll). */
export const SUB_PREV: Box = { x: PCX - 134, y: TOP - 9, w: 24, h: 14 };
export const SUB_NEXT: Box = { x: PCX + 110, y: TOP - 9, w: 24, h: 14 };

/** Panels with a sub-view A/D steps through. */
export const SUB_PANELS = new Set(['SCORES', 'NEWS', 'STANDINGS', 'POLLS']);

function drawSubHeader(g: CanvasRenderingContext2D, label: string, v: SeasonView): void {
  for (const [b, c] of [[SUB_PREV, '<'], [SUB_NEXT, '>']] as const) {
    text(g, c, b.x + b.w / 2, TOP - 6, { align: 'center', color: inBox(b, v.mx, v.my) ? GOLD : ACCENT });
  }
  text(g, label, PCX, TOP - 6, { align: 'center', color: ACCENT });
}

function resultText(g: SeasonGame, team: string): string {
  const r = g.result;
  if (!r) return '';
  const us = g.home === team ? r.home : r.away;
  const them = g.home === team ? r.away : r.home;
  return `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}${r.ot ? ' OT' : ''}`;
}

function vsText(g: SeasonGame, team: string): string {
  if (g.neutral) return 'VS';
  return g.home === team ? 'VS' : '@';
}

/** The header's second line: this week's game, or where the season stands. */
export function nextGameText(s: SeasonState): string {
  if (s.phase === 'offseason') return `NEXT: THE ${s.year + 1} SEASON`;
  if (s.phase === 'complete') return `CHAMPION: ${teamById(s.bracket!.champion!).school.toUpperCase()}`;
  const g = userGameThisWeek(s);
  const u = s.config.userTeamId;
  if (!g) return 'NO GAME THIS WEEK';
  const opp = g.home === u ? g.away : g.home;
  const ap = latestPoll(s, 'ap');
  return `${g.name ? `${g.name.toUpperCase()}: ` : ''}${vsText(g, u)} ${teamLabel(opp, ap).toUpperCase()}`;
}

function hintFor(s: SeasonState, v: SeasonView, item: NavItem | undefined): string {
  const parts = ['W/S MENU'];
  if (item?.page) parts.push('ENTER OPEN');
  if (SUB_PANELS.has(v.nav) && (v.nav !== 'POLLS' || latestPoll(s, 'cfp'))) parts.push(`A/D ${v.nav === 'STANDINGS' ? 'CONF' : v.nav === 'POLLS' ? 'POLL' : 'WEEK'}`);
  if (v.nav === 'NEWS') parts.push('Q/E SCROLL');
  const act = primaryAction(s);
  if (!act.off) parts.push(`SPACE ${act.label}`);
  if (userGameThisWeek(s)) parts.push('X SIM');
  parts.push('ESC MAIN MENU');
  return parts.join('  ');
}

export function drawSeason(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const u = s.config.userTeamId;
  const team = teamById(u);
  const r = records(s).get(u)!;
  const rank = rankIn(latestPoll(s, 'ap'), u);

  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${rank ? `#${rank} ` : ''}${team.school.toUpperCase()} ${team.mascot.toUpperCase()}`, 10, 6, { size: 8 });
  text(g, `${recordText(r)}  (${r.cw}-${r.cl} ${team.conference.toUpperCase()})`, 10, 18, { color: '#e6e6e6' });
  text(g, `${s.year}  ${phaseLabel(s)}`, VIEW_W - 10, 6, { align: 'right', color: GOLD });
  text(g, nextGameText(s), VIEW_W - 10, 18, { align: 'right', color: '#ffffff' });

  drawSidebar(g, s, v);
  switch (v.nav) {
    case 'SCHEDULE':
      drawSchedule(g, s);
      break;
    case 'SCORES':
      drawScores(g, s, v);
      break;
    case 'STANDINGS':
      drawStandings(g, s, v);
      break;
    case 'POLLS':
      drawPolls(g, s, v);
      break;
    case 'NEWS':
      drawNews(g, s, v);
      break;
    case 'LEADERS':
      drawLeaders(g, s);
      break;
    case 'AWARDS':
      drawAwards(g, s);
      break;
    case 'PLAYOFF':
      drawPlayoff(g, s);
      break;
    default:
      // HOME, and the pages' items (their panel is HOME until Enter opens them).
      drawHome(g, s, v);
  }
  drawHint(g, hintFor(s, v, navItems(s).find((it) => it.id === v.nav)));
}

// ------------------------------------------------------------ HOME

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
  g.fillStyle = CARD;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#1f2a3a';
  g.fillRect(x, y + 14, w, 1);
  text(g, title, x + 8, y + 4, { color: ACCENT, shadow: false });
}

/** HOME: this week's game (or the offseason's stages), last week, and the conference race. */
function drawHome(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  if (s.phase === 'offseason') drawStages(g, s);
  else if (s.phase === 'complete') drawChampion(g, s);
  else drawMatchup(g, s);
  drawLastWeek(g, s);
  drawConfMini(g, s);
  if (navItems(s).find((it) => it.id === v.nav)?.page) {
    // A page's item is selected: say what Enter opens.
    const it = navItems(s).find((x) => x.id === v.nav)!;
    text(g, `ENTER: OPEN ${it.label}`, PCX, 332, { align: 'center', color: GOLD });
  }
}

const CARD_Y = 36;
const CARD_H = 112;

function teamSide(g: CanvasRenderingContext2D, s: SeasonState, id: string, cx: number, home: boolean): void {
  const t = teamById(id);
  const ap = latestPoll(s, 'ap');
  const rank = rankIn(ap, id);
  const rec = records(s).get(id)!;
  const ovr = teamRatings(squadFor(s, id)).ovr;
  g.drawImage(getSprite(teamUniform(t, home), '#c68a5e', 'stand', home ? 1 : -1), cx - 30, CARD_Y + 18, 60, 66);
  text(g, `${rank ? `#${rank} ` : ''}${t.school.toUpperCase()}`.slice(0, 19), cx, CARD_Y + 88, { align: 'center', color: '#ffffff' });
  text(g, `${recordText(rec)}  OVR ${ovr}`, cx, CARD_Y + 99, { align: 'center', color: SOFT, shadow: false });
}

function drawMatchup(g: CanvasRenderingContext2D, s: SeasonState): void {
  const u = s.config.userTeamId;
  const game = userGameThisWeek(s);
  g.fillStyle = CARD;
  g.fillRect(PX, CARD_Y, PW, CARD_H);
  const team = teamById(u);
  g.fillStyle = team.colors.primary;
  g.fillRect(PX, CARD_Y, PW, 2);
  const kind = !game ? 'BYE WEEK'
    : game.name ? game.name.toUpperCase()
    : game.kind === 'conf' ? `${team.conference.toUpperCase()} GAME` : 'NON-CONFERENCE';
  text(g, `${phaseLabel(s)}  -  ${kind}`.slice(0, 58), PCX, CARD_Y + 6, { align: 'center', color: GOLD });
  if (!game) {
    teamSide(g, s, u, PCX, true);
    return;
  }
  const opp = game.home === u ? game.away : game.home;
  teamSide(g, s, u, PX + 96, game.home === u || !!game.neutral);
  teamSide(g, s, opp, PR - 96, game.home === opp && !game.neutral);
  text(g, vsText(game, u), PCX, CARD_Y + 44, { size: 16, align: 'center', color: '#ffffff' });
  const where = game.neutral ? 'NEUTRAL SITE' : game.home === u ? 'HOME' : 'AWAY';
  text(g, where, PCX, CARD_Y + 66, { align: 'center', color: SOFT, shadow: false });
}

function drawStages(g: CanvasRenderingContext2D, s: SeasonState): void {
  const os = s.offseason!;
  g.fillStyle = CARD;
  g.fillRect(PX, CARD_Y, PW, CARD_H);
  text(g, `THE ${s.year} OFFSEASON`, PCX, CARD_Y + 8, { align: 'center', color: GOLD });
  const at = OFFSEASON_STAGES.indexOf(os.stage);
  const w = 100;
  const gap = (PW - 4 * w) / 5;
  OFFSEASON_STAGES.forEach((st, i) => {
    const x = PX + gap + i * (w + gap);
    const y = CARD_Y + 30;
    const done = i < at;
    const now = i === at;
    g.fillStyle = now ? '#2a3546' : '#0d1117';
    g.fillRect(x, y, w, 30);
    g.fillStyle = now ? GOLD : done ? GREEN : DIM;
    g.fillRect(x, y + 28, w, 2);
    text(g, `${i + 1}`, x + w / 2, y + 5, { align: 'center', color: now ? GOLD : done ? GREEN : DIM, shadow: false });
    text(g, STAGE_SHORT[st], x + w / 2, y + 16, { align: 'center', color: now ? '#ffffff' : done ? GREEN : DIM, shadow: false });
    if (i < 3) text(g, '>', x + w + gap / 2, y + 11, { align: 'center', color: DIM, shadow: false });
  });
  const detail =
    os.stage === 'carousel' ? `HIRING ROUND ${os.round}: FILL YOUR STAFF`
    : os.stage === 'departures' ? (os.round ? 'WHO LEFT, AND THE NFL DRAFT' : 'THE DECLARE WATCH: WHO MIGHT LEAVE')
    : os.stage === 'signing' ? (os.round ? 'YOUR SIGNING CLASS IS IN' : 'NATIONAL SIGNING DAY')
    : os.round ? `PORTAL ROUND ${os.round}` : 'WHO WANTS TO LEAVE: THE PORTAL OPENS';
  text(g, detail, PCX, CARD_Y + 74, { align: 'center', color: '#ffffff' });
  text(g, `SPACE OR THE BUTTON: OPEN ${STAGE_LABEL[os.stage]}`, PCX, CARD_Y + 92, { align: 'center', color: SOFT, shadow: false });
}

function drawChampion(g: CanvasRenderingContext2D, s: SeasonState): void {
  const champ = s.bracket?.champion;
  g.fillStyle = CARD;
  g.fillRect(PX, CARD_Y, PW, CARD_H);
  text(g, `${s.year} NATIONAL CHAMPION`, PCX, CARD_Y + 6, { align: 'center', color: GOLD });
  if (!champ) return;
  const t = teamById(champ);
  g.drawImage(getSprite(teamUniform(t, true), '#c68a5e', 'stand', 1), PCX - 30, CARD_Y + 18, 60, 66);
  text(g, t.school.toUpperCase(), PCX, CARD_Y + 88, { align: 'center', color: '#ffffff' });
  const next = s.config.length === 'open' ? 'SPACE: START THE OFFSEASON' : 'THIS SEASON IS OVER';
  text(g, next, PCX, CARD_Y + 99, { align: 'center', color: SOFT, shadow: false });
}

/**
 * Last week on the user's team: its level-ups, and the biggest story among a breakout, a
 * breakthrough or a next man up.
 */
function progressLine(s: SeasonState): string {
  const u = s.config.userTeamId;
  const week = lastPlayedWeek(s);
  const prog = Object.values(s.teamState[u]?.progress ?? {});
  const ups = prog.filter((p) => upgradedLastWeek(s, p)).length;
  const items = s.news.filter((n) => n.kind === 'progress' && n.week === week && n.teams.includes(u)).map((n) => n.text);
  const pick = (tag: string) => items.filter((t) => t.startsWith(tag)).pop();
  const name = (t: string) => t.slice(t.indexOf(': ') + 2).split(' (')[0].toUpperCase();
  let tail = '';
  const bo = pick('BREAKOUT:');
  const bt = pick('BREAKTHROUGH:');
  const nm = pick('NEXT MAN UP:');
  if (bo) tail = `BREAKOUT: ${name(bo)}`;
  else if (bt) {
    // "BREAKTHROUGH: Name (UGA QB) +2 SAC +2 MAC" becomes "BREAKTHROUGH: NAME +4".
    const pts = [...bt.matchAll(/\+(\d+)/g)].reduce((x, m) => x + Number(m[1]), 0);
    tail = `BREAKTHROUGH: ${name(bt)} +${pts}`;
  } else if (nm) tail = `NEXT MAN UP: ${name(nm)}`;
  const head = ups ? `${ups} LEVEL-UP${ups === 1 ? '' : 'S'}` : '';
  return [head, tail].filter(Boolean).join('  ');
}

const LOW_Y = CARD_Y + CARD_H + 8;
const LOW_H = 326 - LOW_Y;
const HALF_W = 236;

function drawLastWeek(g: CanvasRenderingContext2D, s: SeasonState): void {
  const u = s.config.userTeamId;
  box(g, PX, LOW_Y, HALF_W, LOW_H, 'LAST GAME');
  const chars = Math.floor((HALF_W - 16) / 8);
  const lines: { t: string; c: string }[] = [];
  const last = s.games.filter((x) => x.result && (x.home === u || x.away === u)).sort((a, b) => b.week - a.week)[0];
  if (last) {
    const res = resultText(last, u);
    const opp = teamById(last.home === u ? last.away : last.home);
    lines.push({ t: `${res} ${vsText(last, u)} ${opp.abbr}`, c: res.startsWith('W') ? GREEN : res.startsWith('L') ? RED : '#ffffff' });
  } else lines.push({ t: 'NO GAMES PLAYED YET', c: DIM });
  const prog = progressLine(s);
  if (prog) wrap(prog, chars).forEach((t) => lines.push({ t, c: GREEN }));
  // The newest week of news about the user's team, apart from the progress items above.
  const mine = s.news.filter((n) => n.teams.includes(u) && n.kind !== 'progress');
  const week = mine.length ? mine[mine.length - 1].week : undefined;
  if (week !== undefined) {
    lines.push({ t: '', c: DIM });
    lines.push({ t: week === 0 ? 'PRESEASON NEWS' : `WEEK ${week} NEWS`, c: ACCENT });
  }
  const max = Math.floor((LOW_H - 22) / 10);
  // Whole items only: one that doesn't fit is left for the NEWS panel.
  for (const n of [...mine].reverse().filter((x) => x.week === week)) {
    const w = wrap(n.text.toUpperCase(), chars);
    if (lines.length + w.length > max) break;
    w.forEach((t) => lines.push({ t, c: '#ffffff' }));
  }
  lines.slice(0, max).forEach((l, i) => text(g, l.t, PX + 8, LOW_Y + 20 + i * 10, { color: l.c, shadow: false }));
}

function drawConfMini(g: CanvasRenderingContext2D, s: SeasonState): void {
  const u = s.config.userTeamId;
  const conf = teamById(u).conference;
  const x = PR - HALF_W;
  box(g, x, LOW_Y, HALF_W, LOW_H, `${conf.toUpperCase()} STANDINGS`.slice(0, 28));
  text(g, 'CONF  ALL', x + HALF_W - 8, LOW_Y + 20, { align: 'right', color: DIM, shadow: false });
  const rows = standings(s, conf).map((row, i) => ({ row, i }));
  const max = Math.floor((LOW_H - 34) / 10);
  // Our row always shows: below the cut, it takes the last line.
  const shown = rows.slice(0, max);
  const me = rows.find((x) => x.row.team === u);
  if (me && me.i >= max) shown[max - 1] = me;
  shown.forEach(({ row, i }, k) => {
    const me = row.team === u;
    const y = LOW_Y + 32 + k * 10;
    const r = row.rec;
    text(g, `${String(i + 1).padStart(2)} ${teamById(row.team).abbr}`, x + 8, y, { color: me ? GOLD : '#ffffff', shadow: false });
    text(g, `${`${r.cw}-${r.cl}`.padEnd(5)} ${recordText(r).padStart(5)}`, x + HALF_W - 8, y, { align: 'right', color: me ? GOLD : SOFT, shadow: false });
  });
}

// ------------------------------------------------------------ panels

function drawSchedule(g: CanvasRenderingContext2D, s: SeasonState): void {
  const u = s.config.userTeamId;
  const ap = latestPoll(s, 'ap');
  const games = s.games.filter((x) => x.home === u || x.away === u).sort((a, b) => a.week - b.week);
  text(g, 'WK  OPPONENT                     RESULT', PX, TOP - 6, { color: DIM, shadow: false });
  games.forEach((x, i) => {
    const y = TOP + 6 + i * LINE;
    const opp = x.home === u ? x.away : x.home;
    const cur = x.week === s.week && !x.result;
    text(g, String(x.week).padStart(2), PX, y, { color: cur ? GOLD : SOFT });
    text(g, `${vsText(x, u).padEnd(3)}${teamLabel(opp, ap).toUpperCase()}`, PX + 32, y, { color: cur ? GOLD : '#ffffff' });
    const res = resultText(x, u);
    text(g, res, PX + 262, y, { color: res.startsWith('W') ? GREEN : RED });
    if (x.name) text(g, x.name.toUpperCase().slice(0, 16), PX + 352, y, { color: ACCENT });
  });
}

/** Results around the country for one week (A/D steps back through the weeks), ranked games first. */
function drawScores(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  const last = Math.max(1, s.games.filter((x) => x.result).reduce((m, x) => Math.max(m, x.week), 1));
  const week = mod(last - 1 - v.sub, last) + 1;
  const before = latestPoll(s, 'ap', week);
  const best = (x: SeasonGame) => Math.min(rankIn(before, x.home) || 99, rankIn(before, x.away) || 99);
  const games = s.games.filter((x) => x.week === week && x.result).sort((a, b) => best(a) - best(b));
  drawSubHeader(g, `WEEK ${week}`, v);
  games.slice(0, ROWS).forEach((x, i) => {
    const y = TOP + 8 + i * LINE;
    const r = x.result!;
    const hw = r.home > r.away;
    const label = (id: string) => teamLabel(id, before).toUpperCase().slice(0, 15);
    text(g, `${label(x.away).padEnd(15)} ${String(r.away).padStart(2)}`, PX + 40, y, { color: hw ? SOFT : '#ffffff' });
    text(g, `@ ${label(x.home).padEnd(15)} ${String(r.home).padStart(2)}${r.ot ? ' OT' : ''}`, PX + 192, y, { color: hw ? '#ffffff' : SOFT });
  });
}

function drawStandings(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  const home = CONFERENCES.indexOf(teamById(s.config.userTeamId).conference);
  const conf = CONFERENCES[mod(home + v.sub, CONFERENCES.length)];
  const ap = latestPoll(s, 'ap');
  drawSubHeader(g, conf.toUpperCase(), v);
  text(g, '    TEAM                    CONF   ALL    PF   PA', PX + 20, TOP + 6, { color: DIM, shadow: false });
  standings(s, conf).forEach((row, i) => {
    const y = TOP + 18 + i * LINE;
    const me = row.team === s.config.userTeamId;
    const r = row.rec;
    text(g, `${String(i + 1).padStart(2)}. ${teamLabel(row.team, ap).toUpperCase().padEnd(22)} ${`${r.cw}-${r.cl}`.padEnd(6)} ${recordText(r).padEnd(5)} ${String(r.pf).padStart(4)} ${String(r.pa).padStart(4)}`, PX + 20, y, {
      color: me ? GOLD : '#ffffff',
    });
  });
}

function drawPolls(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  const cfp = latestPoll(s, 'cfp');
  const kind = cfp && mod(v.sub, 2) === 1 ? 'cfp' : 'ap';
  const poll = latestPoll(s, kind)!;
  const recs = records(s);
  const title = kind === 'cfp' ? `CFP RANKINGS - WEEK ${poll.week}` : poll.week === 0 ? 'AP PRESEASON POLL' : `AP TOP 25 - WEEK ${poll.week}`;
  if (cfp) drawSubHeader(g, title, v);
  else text(g, title, PCX, TOP - 6, { align: 'center', color: ACCENT });
  const prev = latestPoll(s, kind, poll.week);
  const x = PX + 60;
  poll.ranks.forEach((e, i) => {
    const y = TOP + 6 + i * LINE;
    const was = rankIn(prev, e.team);
    const move = !prev ? '' : !was ? 'NEW' : was === i + 1 ? '' : was > i + 1 ? `+${was - i - 1}` : `-${i + 1 - was}`;
    const me = e.team === s.config.userTeamId;
    text(g, `${String(i + 1).padStart(2)}. ${teamById(e.team).school.toUpperCase().slice(0, 17)}`, x, y, { color: me ? GOLD : '#ffffff' });
    text(g, recordText(recs.get(e.team)!), x + 176, y, { color: me ? GOLD : '#ffffff' });
    if (kind === 'ap') text(g, String(e.points), x + 294, y, { align: 'right', color: DIM, shadow: false });
    text(g, move, x + 304, y, { color: move.startsWith('-') ? RED : GREEN });
  });
}

function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > n) {
      out.push(line);
      line = `  ${w}`;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** The weeks with news, newest first; `sub` steps back through them. */
function newsWeek(s: SeasonState, sub: number): number | undefined {
  const weeks = [...new Set(s.news.map((n) => n.week))].sort((a, b) => b - a);
  return weeks.length ? weeks[mod(sub, weeks.length)] : undefined;
}

/** Characters per NEWS line, inside the panel and clear of the scrollbar. */
const NEWS_CHARS = Math.floor((PW - 12) / 8);

/** One week's news as wrapped lines, newest first. */
function newsLines(s: SeasonState, sub: number): { t: string; c: string }[] {
  const week = newsWeek(s, sub);
  const lines: { t: string; c: string }[] = [];
  const u = s.config.userTeamId;
  for (const n of [...s.news].reverse()) {
    if (n.week !== week) continue;
    const c = n.teams.includes(u) ? GOLD : n.kind === 'upset' ? '#ff9a5a' : n.kind === 'heisman' ? ACCENT : n.kind === 'injury' ? RED : n.kind === 'portal' ? '#c9a0ff' : n.kind === 'carousel' ? '#8fd4ff' : '#ffffff';
    wrap(n.text.toUpperCase(), NEWS_CHARS).forEach((t) => lines.push({ t, c }));
  }
  return lines;
}

const NEWS_ROWS = ROWS;

/** How far the week's NEWS can scroll. */
export function newsMaxScroll(s: SeasonState, sub: number): number {
  return Math.max(0, newsLines(s, sub).length - NEWS_ROWS);
}

/** One week's news (A/D or the arrows step through the weeks), scrolled by the wheel or Q/E when it runs long. */
function drawNews(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  const week = newsWeek(s, v.sub);
  if (week === undefined) {
    text(g, 'NO NEWS YET', PCX, TOP + 40, { align: 'center', color: DIM, shadow: false });
    return;
  }
  drawSubHeader(g, week === 0 ? 'PRESEASON' : `WEEK ${week}`, v);
  const lines = newsLines(s, v.sub);
  const top = Math.min(v.scroll, Math.max(0, lines.length - NEWS_ROWS));
  lines.slice(top, top + NEWS_ROWS).forEach((l, i) => text(g, l.t, PX, TOP + 8 + i * LINE, { color: l.c }));
  if (lines.length > NEWS_ROWS) {
    // The scrollbar: the track, and the thumb for the lines in view.
    const h = NEWS_ROWS * LINE;
    g.fillStyle = '#1f2a3a';
    g.fillRect(PR - 4, TOP + 8, 4, h);
    g.fillStyle = SOFT;
    g.fillRect(PR - 4, TOP + 8 + (top / lines.length) * h, 4, Math.max(6, (NEWS_ROWS / lines.length) * h));
  }
}

function drawLeaders(g: CanvasRenderingContext2D, s: SeasonState): void {
  const stats = seasonStats(s);
  LEADER_CATEGORIES.forEach((c, i) => {
    const cx = i % 2 === 0 ? PX : PX + 248;
    const y0 = TOP - 6 + Math.floor(i / 2) * (LINE * 7);
    text(g, c.label, cx, y0, { color: ACCENT });
    leaders(s, c.key, 5, stats).forEach((l, j) => {
      text(g, `${l.name.toUpperCase().slice(0, 18).padEnd(18)} ${teamById(l.team).abbr.padEnd(5)} ${l[c.key]}`, cx, y0 + (j + 1) * LINE, {
        color: l.team === s.config.userTeamId ? GOLD : '#ffffff',
      });
    });
  });
  text(g, 'YOUR LIVE GAMES DON\'T RECORD PLAYER STATS YET', PCX, 326, { align: 'center', color: DIM, shadow: false });
}

function drawAwards(g: CanvasRenderingContext2D, s: SeasonState): void {
  const list = s.awards.length ? s.awards : [heismanRace(s)];
  text(g, s.awards.length ? 'SEASON AWARDS' : 'HEISMAN WATCH', PCX, TOP - 6, { align: 'center', color: ACCENT });
  let y = TOP + 6;
  for (const a of list) {
    text(g, a.name.toUpperCase(), PX, y, { color: GOLD });
    y += LINE;
    for (const [i, f] of a.finalists.slice(0, s.awards.length ? 3 : 10).entries()) {
      text(g, `${i + 1}. ${f.name.toUpperCase().slice(0, 21).padEnd(21)} ${f.pos.padEnd(3)} ${teamById(f.team).school.toUpperCase().slice(0, 18).padEnd(18)} ${f.score}`, PX + 8, y, {
        color: f.team === s.config.userTeamId ? GOLD : '#ffffff',
      });
      y += LINE;
    }
    y += 4;
  }
}

function drawPlayoff(g: CanvasRenderingContext2D, s: SeasonState): void {
  const b = s.bracket;
  if (!b) {
    const cfp = latestPoll(s, 'cfp');
    text(g, 'THE FIELD IS SET AFTER CHAMPIONSHIP WEEK', PCX, TOP - 6, { align: 'center', color: ACCENT });
    if (!cfp) return;
    text(g, `CURRENT CFP TOP 12 (WEEK ${cfp.week})`, PCX, TOP + 10, { align: 'center', color: SOFT });
    cfp.ranks.slice(0, 12).forEach((e, i) => text(g, `${String(i + 1).padStart(2)}. ${teamById(e.team).school.toUpperCase()}`, PCX - 90, TOP + 26 + i * LINE));
    return;
  }
  const cw = PW / (Math.log2(b.rounds[0].length) + 1);
  const names: Record<number, string> = { 1: 'CHAMPION', 2: 'FINAL', 4: 'SEMIS', 8: 'QUARTERS' };
  b.rounds.forEach((round, r) => {
    const cx = PX + r * cw;
    text(g, names[round.length] ?? 'FIRST ROUND', cx, TOP - 6, { color: ACCENT, shadow: false });
    const step = (ROWS * LINE) / round.length;
    round.forEach((id, i) => {
      const y = TOP + 6 + i * step + step / 2 - 4;
      if (!id) {
        text(g, r === 0 ? 'BYE' : '--', cx, y, { color: DIM, shadow: false });
        return;
      }
      const seed = b.seeds.indexOf(id) + 1;
      const won = r + 1 < b.rounds.length && b.rounds[r + 1][Math.floor(i / 2)] === id;
      text(g, `${String(seed).padStart(2)} ${teamById(id).abbr}`, cx, y, {
        color: id === s.config.userTeamId ? GOLD : won || id === b.champion ? '#ffffff' : SOFT,
      });
    });
  });
  const u = s.config.userTeamId;
  const bowl = s.games.find((x) => x.kind === 'bowl' && (x.home === u || x.away === u));
  if (bowl) text(g, `${bowl.name!.toUpperCase()}: ${vsText(bowl, u)} ${teamById(bowl.home === u ? bowl.away : bowl.home).abbr}  ${resultText(bowl, u)}`.slice(0, 60), PCX, 330, { align: 'center', color: GOLD });
}
