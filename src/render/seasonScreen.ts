import { CONFERENCES } from '../data/fbs/profile';
import { teamRatings } from '../data/depth';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { officeNews } from '../season/achievements';
import { heismanRace } from '../season/awards';
import { teamLabel } from '../season/news';
import { OFFSEASON_STAGES } from '../season/offseason';
import { latestPoll, rankIn } from '../season/polls';
import { phaseLabel, userGameThisWeek } from '../season/season';
import { records, recordText, standings } from '../season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from '../season/stats';
import type { SeasonGame, SeasonState, Storyline } from '../season/types';
import { headlineMoment, lastWeekMoments } from '../season/moments';
import { pendingDecisions } from '../season/storylines';
import { squadFor } from '../season/world';
import { drawHint } from './hud';
import { drawRich, gameLink, linkText, newsRich, playerLink, richText, teamLink, type RichLine } from './links';
import { getSprite, teamUniform } from './sprites';
import { text } from './text';

/**
 * The season hub: the program up top, a sidebar on the left with every place to go, and the
 * selected panel on the right. Sidebar items are panels (shown in place: HOME, the schedule and the
 * national views) or pages (opened as their own screen: the program page, roster, playbook, prep,
 * recruiting). Team names and the user's players' names are links (render/links.ts).
 * The week's main action (play, sim, advance, the offseason stage) is the button under the sidebar.
 */

export type Page = 'team' | 'playbook' | 'prep' | 'recruit' | 'program' | 'office' | 'settings';

export interface NavItem {
  /** A panel's name, or the page it opens. */
  id: string;
  label: string;
  page?: Page;
  /** The page's hotkey, shown on the item. */
  key?: string;
  /** Shown but not selectable (GAME PREP in the offseason). */
  off?: boolean;
  /** Something new on the page: a gold dot (the office's new items). */
  dot?: boolean;
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
  /** PLAY GAME's choices are open, with this one highlighted. */
  playMenu?: number;
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
        { id: 'program', label: 'PROGRAM', page: 'program', key: 'H' },
        { id: 'team', label: 'ROSTER', page: 'team', key: 'T' },
        { id: 'playbook', label: 'PLAYBOOK', page: 'playbook', key: 'P' },
        { id: 'prep', label: 'GAME PREP', page: 'prep', key: 'O', off: s.phase === 'offseason' },
        ...(s.recruiting ? [{ id: 'recruit', label: 'RECRUITING', page: 'recruit', key: 'R' } as NavItem] : []),
        { id: 'office', label: 'OFFICE', page: 'office', key: 'C', dot: officeNews(s) },
        { id: 'settings', label: 'SETTINGS', page: 'settings', key: 'G' },
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
      if (it.dot) {
        g.fillStyle = GOLD;
        g.fillRect(14 + it.label.length * 8, y + 4, 4, 4);
      }
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

/** A line with one name in it linked: `name` at `at` characters in. */
function lineWith(t: string, at: number, len: number, link: ReturnType<typeof teamLink>): RichLine {
  return { t, spans: len > 0 ? [{ start: at, len, link }] : [] };
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
  if (SUB_PANELS.has(v.nav) && (v.nav !== 'POLLS' || latestPoll(s, 'cfp'))) parts.push(`A/D ${v.nav === 'STANDINGS' ? 'CONF' : v.nav === 'POLLS' ? 'POLL' : 'WEEK'}`);
  if (v.nav === 'NEWS') parts.push('Q/E SCROLL');
  if (v.nav === 'HOME' && s.moments?.length) parts.push('M REPLAY  Y STORYLINES');
  if (v.nav === 'STORYLINES') parts.push('CLICK REPLAY  ESC HOME');
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
    case 'STORYLINES':
      drawStorylines(g, s, v);
      break;
    default:
      // HOME (pages open as their own screens).
      drawHome(g, s, v);
  }
  if (v.playMenu !== undefined) {
    drawPlayMenu(g, s, v);
    drawHint(g, '1-4 OR W/S + ENTER: CHOOSE   K: KEY PLAYS   ESC: BACK');
  } else drawHint(g, hintFor(s, v, navItems(s).find((it) => it.id === v.nav)));
}

// ------------------------------------------------------------ PLAY GAME's choices

const PLAY_CHOICES = [
  ['PLAY THE WHOLE GAME', 'FROM THE OPENING KICKOFF'],
  ['SIM TO THE 2ND QUARTER', 'TAKE OVER AFTER THE 1ST'],
  ['SIM TO HALFTIME', 'PLAY THE SECOND HALF'],
  ['SIM TO THE 4TH QUARTER', 'PLAY THE FOURTH QUARTER'],
];
const MENU_W = 300;
const MENU_X = (VIEW_W - MENU_W) / 2;
const MENU_Y = 96;

export function playMenuRect(i: number): Box {
  return { x: MENU_X + 10, y: MENU_Y + 30 + i * 30, w: MENU_W - 20, h: 26 };
}

/** The line under the choices that cycles the simulated stretch's key plays. */
export const PLAY_KEYS_BTN: Box = { x: MENU_X + 10, y: MENU_Y + 152, w: MENU_W - 20, h: 16 };

function drawPlayMenu(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  g.fillStyle = 'rgba(5,7,10,0.7)';
  g.fillRect(0, 30, VIEW_W, 316);
  g.fillStyle = '#0a0d12';
  g.fillRect(MENU_X, MENU_Y, MENU_W, 178);
  g.fillStyle = teamById(s.config.userTeamId).colors.primary;
  g.fillRect(MENU_X, MENU_Y, MENU_W, 20);
  text(g, nextGameText(s), MENU_X + MENU_W / 2, MENU_Y + 6, { align: 'center' });
  PLAY_CHOICES.forEach(([label, sub], i) => {
    const r = playMenuRect(i);
    const on = i === v.playMenu;
    const hover = inBox(r, v.mx, v.my);
    g.fillStyle = on ? '#24324a' : hover ? '#1a2230' : CARD;
    g.fillRect(r.x, r.y, r.w, r.h);
    if (on) {
      g.fillStyle = GOLD;
      g.fillRect(r.x, r.y, 3, r.h);
    }
    text(g, `${i + 1}`, r.x + 12, r.y + 9, { color: DIM, shadow: false });
    text(g, label, r.x + 28, r.y + 4, { color: on || hover ? GOLD : '#ffffff', shadow: false });
    text(g, sub, r.x + 28, r.y + 15, { color: SOFT, shadow: false });
  });
  const lv = s.config.keyPlays?.sim ?? 'off';
  const b = PLAY_KEYS_BTN;
  const hot = inBox(b, v.mx, v.my);
  const label = lv === 'off' ? 'RESULT ONLY' : lv === 'all' ? 'EVERY SNAP' : `${lv.toUpperCase()} KEY PLAYS`;
  text(g, `SIMMED QUARTERS: ${label}  (K)`, b.x + b.w / 2, b.y + 4, { align: 'center', color: hot ? GOLD : ACCENT, shadow: false });
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
  drawWeekStory(g, s, v);
  drawConfMini(g, s);
}

const CARD_Y = 36;
const CARD_H = 112;

/** One side of the matchup card; `facing` turns the player toward the other side. */
function teamSide(g: CanvasRenderingContext2D, s: SeasonState, id: string, cx: number, home: boolean, facing: 1 | -1 = 1): void {
  const t = teamById(id);
  const ap = latestPoll(s, 'ap');
  const rank = rankIn(ap, id);
  const rec = records(s).get(id)!;
  const ovr = teamRatings(squadFor(s, id)).ovr;
  g.drawImage(getSprite(teamUniform(t, home), '#c68a5e', 'stand', facing), cx - 30, CARD_Y + 18, 60, 66);
  linkText(g, `${rank ? `#${rank} ` : ''}${t.school.toUpperCase()}`, cx, CARD_Y + 88, { align: 'center', color: '#ffffff' }, teamLink(id));
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
  teamSide(g, s, u, PX + 96, game.home === u || !!game.neutral, 1);
  teamSide(g, s, opp, PR - 96, game.home === opp && !game.neutral, -1);
  text(g, vsText(game, u), PCX, CARD_Y + 44, { size: 16, align: 'center', color: '#ffffff' });
  const where = game.neutral ? 'NEUTRAL SITE' : game.home === u ? 'HOME' : 'AWAY';
  text(g, where, PCX, CARD_Y + 62, { align: 'center', color: SOFT, shadow: false });
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
  linkText(g, t.school.toUpperCase(), PCX, CARD_Y + 88, { align: 'center', color: '#ffffff' }, teamLink(champ));
  const next = s.config.length === 'open' ? 'SPACE: START THE OFFSEASON' : 'THIS SEASON IS OVER';
  text(g, next, PCX, CARD_Y + 99, { align: 'center', color: SOFT, shadow: false });
}

const LOW_Y = CARD_Y + CARD_H + 8;
const LOW_H = 326 - LOW_Y;
const HALF_W = 236;

/** HOME's buttons in THE WEEK'S STORY: replay the week's moments, take a pending decision, all storylines. */
export const REPLAY_BTN: Box = { x: PX + 8, y: LOW_Y + LOW_H - 20, w: 108, h: 14 };
export const STORIES_BTN: Box = { x: PX + 120, y: LOW_Y + LOW_H - 20, w: 108, h: 14 };
export const DECIDE_BTN: Box = { x: PX + 6, y: LOW_Y + 32, w: HALF_W - 12, h: 30 };

function smallBtn(g: CanvasRenderingContext2D, b: Box, label: string, v: SeasonView, on = true): void {
  const hot = on && inBox(b, v.mx, v.my);
  g.fillStyle = hot ? '#24324a' : '#1a2230';
  g.fillRect(b.x, b.y, b.w, b.h);
  text(g, label, b.x + b.w / 2, b.y + 3, { align: 'center', color: !on ? DIM : hot ? GOLD : ACCENT, shadow: false });
}

/**
 * THE WEEK'S STORY: last game's result, a decision waiting on the user, the week's top moment with its
 * player, and the storylines in progress; the moments replay from here (M), all storylines open (Y).
 */
function drawWeekStory(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  const u = s.config.userTeamId;
  box(g, PX, LOW_Y, HALF_W, LOW_H, "THE WEEK'S STORY");
  let y = LOW_Y + 20;
  const last = s.games.filter((x) => x.result && (x.home === u || x.away === u)).sort((a, b) => b.week - a.week)[0];
  if (last) {
    const res = resultText(last, u);
    const oppId = last.home === u ? last.away : last.home;
    const head = `${res} ${vsText(last, u)} `;
    const abbr = teamById(oppId).abbr;
    drawRich(g, lineWith(head + abbr, head.length, abbr.length, teamLink(oppId)), PX + 8, y, { color: res.startsWith('W') ? GREEN : res.startsWith('L') ? RED : '#ffffff', shadow: false });
  } else text(g, 'NO GAMES PLAYED YET', PX + 8, y, { color: DIM, shadow: false });
  y += 12;
  const pend = pendingDecisions(s)[0];
  if (pend?.decision) {
    const b = DECIDE_BTN;
    const hot = inBox(b, v.mx, v.my);
    g.fillStyle = hot ? '#3a3010' : '#2a240c';
    g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = GOLD;
    g.fillRect(b.x, b.y, 2, b.h);
    text(g, 'YOUR CALL (ENTER)', b.x + 8, b.y + 4, { color: GOLD, shadow: false });
    const about = storyTag(s, pend, 27);
    text(g, about.t, b.x + 8, b.y + 17, { color: '#ffffff', shadow: false });
    y = b.y + b.h + 6;
  }
  const m = headlineMoment(s);
  if (m && m.kind !== 'final') {
    const team = teamById(m.team);
    if (m.p) g.drawImage(getSprite(teamUniform(team, true), m.p.skin, m.kind === 'injury' ? 'stand' : 'cheer', 1), PX + 8, y, 40, 44);
    const tx = m.p ? PX + 54 : PX + 8;
    const n = Math.floor((PX + HALF_W - 8 - tx) / 8);
    text(g, m.title.slice(0, n), tx, y + 2, { color: m.kind === 'injury' ? RED : GOLD, shadow: false });
    const teams = [m.team, ...(m.opp ? [m.opp] : [])];
    newsRich(s, { text: m.sub, teams }, n).slice(0, 3).forEach((l, i) => drawRich(g, l, tx, y + 14 + i * 10, { color: '#ffffff', shadow: false }));
    y += 48;
  }
  // The storylines running, one line each; their stakes and beats are on the STORYLINES page.
  const open = (s.stories ?? []).filter((st) => st.status === 'open' && st.stakes);
  const room = Math.floor((REPLAY_BTN.y - 2 - (y + 11)) / 11);
  if (open.length && room > 0) {
    text(g, 'STORYLINES', PX + 8, y, { color: ACCENT, shadow: false });
    y += 11;
    const shown = open.length > room ? open.slice(0, room - 1) : open;
    for (const st of shown) {
      const tail = storyTail(s, st);
      const row = storyTag(s, st, 27 - (tail ? tail.length + 1 : 0));
      drawRich(g, row, PX + 8, y, { color: '#ffffff', shadow: false });
      if (tail) text(g, tail, PX + HALF_W - 8, y, { align: 'right', color: st.decision && st.decision.chosen === undefined ? GOLD : SOFT, shadow: false });
      y += 11;
    }
    if (shown.length < open.length) text(g, `+${open.length - shown.length} MORE (Y)`, PX + 8, y, { color: DIM, shadow: false });
  }
  smallBtn(g, REPLAY_BTN, 'M: REPLAY WEEK', v, lastWeekMoments(s).length > 0);
  smallBtn(g, STORIES_BTN, 'Y: STORYLINES', v, (s.stories ?? []).length > 0);
}

/** A storyline's short name for HOME. */
const STORY_SHORT: Record<Storyline['kind'], string> = {
  nextManUp: 'NEXT UP', breakoutWatch: 'BREAKOUT', slump: 'SLUMP', heisman: 'HEISMAN', unbeaten: 'UNBEATEN',
  bowlChase: 'BOWL CHASE', rivalry: 'RIVALRY', reunion: 'REUNION', homecoming: 'HOMECOMING',
  recruitment: 'RECRUIT', recruitClass: 'THE CLASS', confRace: 'CONF RACE', bubble: 'PLAYOFF', award: 'AWARD',
  transferRisk: 'UNHAPPY', phenom: 'PHENOM', seniorDay: 'SENIOR DAY', draftStock: 'DRAFT', newFace: 'NEW FACE',
};

/** "SLUMP QB SMITH": a storyline's short name and its player (position, last name, linked), in `n` characters. */
function storyTag(s: SeasonState, st: Storyline, n: number): RichLine {
  const head = STORY_SHORT[st.kind] ?? st.title;
  if (!st.star) return { t: head.slice(0, n), spans: [] };
  const pre = `${head} ${st.star.pos} `;
  const last = (st.star.name.split(' ').pop() ?? st.star.name).slice(0, Math.max(1, n - pre.length));
  return { t: pre + last, spans: [{ start: pre.length, len: last.length, link: playerLink(st.team, st.star.id) }] };
}

/** What's on the line, in a word or two: YOUR CALL, a record, starts toward a breakout, the game. */
function storyTail(s: SeasonState, st: Storyline): string {
  if (st.decision && st.decision.chosen === undefined) return 'YOUR CALL';
  const game = st.game ? s.games.find((x) => x.id === st.game) : undefined;
  if (game) return `VS ${teamById(game.home === st.team ? game.away : game.home).abbr}`;
  switch (st.kind) {
    case 'breakoutWatch': return st.meter ? `${st.meter.at}/${st.meter.of}` : '';
    case 'unbeaten': return recordText(records(s).get(st.team)!);
    case 'bowlChase': return /NEED \d+/.exec(st.stakes)?.[0] ?? '';
    case 'heisman': {
      const at = (s.buzz?.[s.buzz.length - 1]?.top ?? []).findIndex((x) => x.id === st.star?.id);
      return at >= 0 ? `NO. ${at + 1}` : '';
    }
    case 'recruitment': return st.meter?.label === 'YOU LEAD' ? 'LEAD' : st.k?.rank ? `NO. ${st.k.rank}` : '';
    case 'recruitClass': return st.k?.rank ? `NO. ${st.k.rank}` : '';
    case 'confRace': return st.k?.clinched ? 'IN' : st.k?.place ? `${st.k.place}${['TH', 'ST', 'ND', 'RD'][st.k.place] ?? 'TH'}` : '';
    case 'bubble': return st.k?.seed ? `SEED ${st.k.seed}` : 'OUT';
    case 'award': return st.k?.at !== undefined ? `NO. ${st.k.at + 1}` : '';
    case 'draftStock': return st.k?.round && st.k.round < 99 ? `RD ${st.k.round}` : '';
    case 'transferRisk': return 'RISK';
    case 'newFace':
    case 'phenom': return st.k?.starts ? `${st.k.starts} GS` : '';
    case 'nextManUp': {
      const due = (st.k?.due as number | undefined) ?? 0;
      return due >= 99 ? 'SEASON' : due > s.week ? `${due - s.week} WK` : '';
    }
    default: return '';
  }
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
    const abbr = teamById(row.team).abbr;
    drawRich(g, lineWith(`${String(i + 1).padStart(2)} ${abbr}`, 3, abbr.length, teamLink(row.team)), x + 8, y, { color: me ? GOLD : '#ffffff', shadow: false });
    text(g, `${`${r.cw}-${r.cl}`.padEnd(5)} ${recordText(r).padStart(5)}`, x + HALF_W - 8, y, { align: 'right', color: me ? GOLD : SOFT, shadow: false });
  });
}

// ------------------------------------------------------------ panels

/** Words split to `n`-character lines. */
function wrapWords(t: string, n: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of t.split(' ')) {
    if (cur && cur.length + 1 + w.length > n) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out.flatMap((l) => (l.length > n ? [l.slice(0, n)] : [l]));
}

/** The user's games; the columns fit the longest opponent and result, and a long game name wraps under itself. */
function drawSchedule(g: CanvasRenderingContext2D, s: SeasonState): void {
  const u = s.config.userTeamId;
  const ap = latestPoll(s, 'ap');
  const games = s.games.filter((x) => x.home === u || x.away === u).sort((a, b) => a.week - b.week);
  const oppOf = (x: SeasonGame) => (x.home === u ? x.away : x.home);
  const oppW = Math.max(8, ...games.map((x) => 3 + teamLabel(oppOf(x), ap).length));
  const resW = Math.max(6, ...games.map((x) => resultText(x, u).length));
  const oppX = PX + 32;
  const resX = oppX + (oppW + 2) * 8;
  const nameX = resX + (resW + 2) * 8;
  const nameN = Math.floor((PR - nameX) / 8);
  text(g, 'WK', PX, TOP - 6, { color: DIM, shadow: false });
  text(g, 'OPPONENT', oppX, TOP - 6, { color: DIM, shadow: false });
  text(g, 'RESULT', resX, TOP - 6, { color: DIM, shadow: false });
  let y = TOP + 6;
  for (const x of games) {
    const opp = oppOf(x);
    const cur = x.week === s.week && !x.result;
    text(g, String(x.week).padStart(2), PX, y, { color: cur ? GOLD : SOFT });
    const label = teamLabel(opp, ap).toUpperCase();
    const school = teamById(opp).school.toUpperCase();
    drawRich(g, lineWith(`${vsText(x, u).padEnd(3)}${label}`, 3 + label.length - school.length, school.length, teamLink(opp)), oppX, y, { color: cur ? GOLD : '#ffffff' });
    const res = resultText(x, u);
    linkText(g, res, resX, y, { color: res.startsWith('W') ? GREEN : RED }, x.result ? gameLink(x.id) : undefined);
    const full = x.name?.toUpperCase() ?? '';
    const name = full ? wrapWords(full.length > nameN ? full.replace(/CHAMPIONSHIP$/, 'CHAMP') : full, nameN) : [];
    name.forEach((l, i) => text(g, l, nameX, y + i * 9, { color: ACCENT }));
    y += LINE + Math.max(0, name.length - 1) * 9;
  }
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
    // The school after any "#5 " in front.
    const span = (id: string, off: number) => {
      const l = label(id);
      const at = l.startsWith('#') ? l.indexOf(' ') + 1 : 0;
      return lineWith('', off + at, l.length - at, teamLink(id)).spans;
    };
    // The scores open the game's page.
    const score = (start: number, len: number) => ({ start, len, link: gameLink(x.id) });
    drawRich(g, { t: `${label(x.away).padEnd(15)} ${String(r.away).padStart(2)}`, spans: [...span(x.away, 0), score(16, 2)] }, PX + 40, y, { color: hw ? SOFT : '#ffffff' });
    drawRich(g, { t: `@ ${label(x.home).padEnd(15)} ${String(r.home).padStart(2)}${r.ot ? ' OT' : ''}`, spans: [...span(x.home, 2), score(18, r.ot ? 5 : 2)] }, PX + 192, y, { color: hw ? '#ffffff' : SOFT });
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
    const label = teamLabel(row.team, ap).toUpperCase();
    const line = `${String(i + 1).padStart(2)}. ${label.padEnd(22)} ${`${r.cw}-${r.cl}`.padEnd(6)} ${recordText(r).padEnd(5)} ${String(r.pf).padStart(4)} ${String(r.pa).padStart(4)}`;
    drawRich(g, lineWith(line, 4, Math.min(22, label.length), teamLink(row.team)), PX + 20, y, { color: me ? GOLD : '#ffffff' });
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
  const x = PX + 48;
  poll.ranks.forEach((e, i) => {
    const y = TOP + 6 + i * LINE;
    const was = rankIn(prev, e.team);
    const move = !prev ? '' : !was ? 'NEW' : was === i + 1 ? '' : was > i + 1 ? `+${was - i - 1}` : `-${i + 1 - was}`;
    const me = e.team === s.config.userTeamId;
    const school = teamById(e.team).school.toUpperCase();
    drawRich(g, lineWith(`${String(i + 1).padStart(2)}. ${school}`, 4, school.length, teamLink(e.team)), x, y, { color: me ? GOLD : '#ffffff' });
    text(g, recordText(recs.get(e.team)!), x + 184, y, { color: me ? GOLD : '#ffffff' });
    if (kind === 'ap') text(g, String(e.points), x + 294, y, { align: 'right', color: DIM, shadow: false });
    text(g, move, x + 304, y, { color: move.startsWith('-') ? RED : GREEN });
  });
}

/** The weeks with news, newest first; `sub` steps back through them. */
function newsWeek(s: SeasonState, sub: number): number | undefined {
  const weeks = [...new Set(s.news.map((n) => n.week))].sort((a, b) => b - a);
  return weeks.length ? weeks[mod(sub, weeks.length)] : undefined;
}

/** Characters per NEWS line, inside the panel and clear of the scrollbar. */
const NEWS_CHARS = Math.floor((PW - 12) / 8);

/** One week's news as wrapped lines with their names linked, newest first. */
function newsLines(s: SeasonState, sub: number): { l: RichLine; c: string }[] {
  const week = newsWeek(s, sub);
  const lines: { l: RichLine; c: string }[] = [];
  const u = s.config.userTeamId;
  for (const n of [...s.news].reverse()) {
    if (n.week !== week) continue;
    const c = n.teams.includes(u) ? GOLD : n.kind === 'upset' ? '#ff9a5a' : n.kind === 'heisman' ? ACCENT : n.kind === 'injury' ? RED : n.kind === 'portal' ? '#c9a0ff' : n.kind === 'carousel' ? '#8fd4ff' : '#ffffff';
    newsRich(s, n, NEWS_CHARS).forEach((l) => lines.push({ l, c }));
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
  lines.slice(top, top + NEWS_ROWS).forEach((l, i) => drawRich(g, l.l, PX, TOP + 8 + i * LINE, { color: l.c }));
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
      const name = l.name.toUpperCase().slice(0, 18);
      const abbr = teamById(l.team).abbr;
      drawRich(g, { t: `${name.padEnd(18)} ${abbr.padEnd(5)} ${l[c.key]}`, spans: [{ start: 0, len: name.length, link: playerLink(l.team, l.id) }, { start: 19, len: abbr.length, link: teamLink(l.team) }] }, cx, y0 + (j + 1) * LINE, {
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
      const name = f.name.toUpperCase().slice(0, 21);
      const school = teamById(f.team).school.toUpperCase().slice(0, 18);
      const spans = [{ start: 3, len: name.length, link: playerLink(f.team, f.id) }, { start: 29, len: school.length, link: teamLink(f.team) }];
      drawRich(g, { t: `${i + 1}. ${name.padEnd(21)} ${f.pos.padEnd(3)} ${school.padEnd(18)} ${f.score}`, spans }, PX + 8, y, {
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
    cfp.ranks.slice(0, 12).forEach((e, i) => {
      const school = teamById(e.team).school.toUpperCase();
      drawRich(g, lineWith(`${String(i + 1).padStart(2)}. ${school}`, 4, school.length, teamLink(e.team)), PCX - 90, TOP + 26 + i * LINE, {});
    });
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
      const abbr = teamById(id).abbr;
      drawRich(g, lineWith(`${String(seed).padStart(2)} ${abbr}`, 3, abbr.length, teamLink(id)), cx, y, {
        color: id === s.config.userTeamId ? GOLD : won || id === b.champion ? '#ffffff' : SOFT,
      });
    });
  });
  const u = s.config.userTeamId;
  const bowl = s.games.find((x) => x.kind === 'bowl' && (x.home === u || x.away === u));
  if (bowl) text(g, `${bowl.name!.toUpperCase()}: ${vsText(bowl, u)} ${teamById(bowl.home === u ? bowl.away : bowl.home).abbr}  ${resultText(bowl, u)}`.slice(0, 60), PCX, 330, { align: 'center', color: GOLD });
}

// ------------------------------------------------------------ STORYLINES

const STORY_ROW = 40;
const STORY_TOP = 50;

function storyRows(s: SeasonState): Storyline[] {
  const all = [...(s.stories ?? [])];
  return [...all.filter((x) => x.status === 'open').reverse(), ...all.filter((x) => x.status !== 'open').reverse()];
}

export function storiesMaxScroll(s: SeasonState): number {
  return Math.max(0, storyRows(s).length - Math.floor((326 - STORY_TOP) / STORY_ROW));
}

/** The storyline under the mouse on the STORYLINES panel. */
export function storyAt(s: SeasonState, v: SeasonView, x: number, y: number): Storyline | undefined {
  if (x < PX || x >= PR || y < STORY_TOP) return undefined;
  return storyRows(s)[v.scroll + Math.floor((y - STORY_TOP) / STORY_ROW)];
}

/** `t` in `n` characters, cut at a word with ".." when it doesn't fit. */
function clip(t: string, n: number): string {
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 2);
  const at = cut.lastIndexOf(' ');
  return `${(at > n / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.]+$/, '')}..`;
}

/** Every storyline this season: the running ones first, then how the others ended. A click replays one. */
function drawStorylines(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  g.fillStyle = CARD;
  g.fillRect(PX, 36, PW, 290);
  text(g, `${s.year} STORYLINES`, PCX, 40, { align: 'center', color: GOLD });
  const rows = storyRows(s);
  if (!rows.length) {
    text(g, 'NO STORYLINES YET: PLAY A WEEK', PCX, 120, { align: 'center', color: DIM, shadow: false });
    return;
  }
  const fit = Math.floor((326 - STORY_TOP) / STORY_ROW);
  rows.slice(v.scroll, v.scroll + fit).forEach((st, i) => {
    const y = STORY_TOP + i * STORY_ROW;
    const open = st.status === 'open';
    const hot = inBox({ x: PX, y, w: PW, h: STORY_ROW - 2 }, v.mx, v.my);
    g.fillStyle = hot ? '#1f2a3a' : open ? '#18202c' : '#11161e';
    g.fillRect(PX + 4, y, PW - 8, STORY_ROW - 3);
    g.fillStyle = st.decision && st.decision.chosen === undefined ? GOLD : open ? ACCENT : DIM;
    g.fillRect(PX + 4, y, 2, STORY_ROW - 3);
    const teams = [st.team, ...(st.game ? [s.games.find((x) => x.id === st.game)].flatMap((x) => (x ? [x.home, x.away] : [])) : [])];
    if (st.star) {
      const pre = `${st.title}: ${st.star.pos} `;
      const nm = st.star.name.slice(0, Math.max(1, 44 - pre.length));
      drawRich(g, { t: pre + nm, spans: [{ start: pre.length, len: nm.length, link: playerLink(st.team, st.star.id) }] }, PX + 12, y + 4, { color: open ? '#ffffff' : SOFT, shadow: false });
    } else text(g, st.title.slice(0, 44), PX + 12, y + 4, { color: open ? '#ffffff' : SOFT, shadow: false });
    text(g, `WK ${st.opened}${open ? '' : `-${st.beats[st.beats.length - 1]?.week ?? st.opened}`}`, PR - 12, y + 4, { align: 'right', color: DIM, shadow: false });
    const now = open ? st.stakes : st.outcome ?? '';
    // The newest beats that fit whole, oldest first (not one that says the same as the outcome).
    const beats: string[] = [];
    const all = st.beats.map((b) => b.text).filter((b) => b !== now);
    for (const bt of [...all].reverse()) {
      if ([bt, ...beats].join('  /  ').length > 58) break;
      beats.unshift(bt);
    }
    const trail = beats.length ? beats.join('  /  ') : clip(all[all.length - 1] ?? '', 58);
    // How it ended takes both lines when it needs them; the meter sits right of the stakes.
    const ls = open ? [clip(now, st.meter ? 46 : 58)] : wrapWords(now, 58);
    const lines = ls.length > 1 ? [ls[0], clip(ls.slice(1).join(' '), 58)] : [ls[0] ?? '', trail];
    drawRich(g, richText(s, lines[0], teams), PX + 12, y + 15, { color: open ? GOLD : SOFT, shadow: false });
    drawRich(g, richText(s, lines[1], teams), PX + 12, y + 26, { color: ls.length > 1 ? SOFT : DIM, shadow: false });
    if (st.meter && open) {
      g.fillStyle = '#2a3546';
      g.fillRect(PR - 92, y + 18, 80, 4);
      g.fillStyle = GOLD;
      g.fillRect(PR - 92, y + 18, 80 * Math.min(1, st.meter.at / st.meter.of), 4);
    }
  });
}
