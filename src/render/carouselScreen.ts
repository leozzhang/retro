import { coachName, COACH_ROLES, parseCoachId, type CoachRole, type RatingName } from '../data/coaches';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import {
  CAROUSEL, chairOf, coachNow, motiveOf, MOTIVE_TEXT, poolFor, repOf, seenRatings, splitChair, titleOf, treeOf, treeScore, userChairs, type Candidate,
} from '../season/carousel';
import type { NewsItem, SeasonState } from '../season/types';
import { gasFor, headCoachFor, staffFor } from '../season/world';
import { drawHint } from './hud';
import { inBox } from './teamScreen';
import { text } from './text';
import { coachPipe, pipeLabel } from '../season/recruiting';

/**
 * The coaching carousel (season/carousel.ts): HIRING (your open chairs and their candidates, ratings
 * blurred by your eval until you interview), MY STAFF (fire a coach to open his chair), and AROUND THE
 * LEAGUE (the offseason's coaching news).
 */

export const CAROUSEL_TABS = ['HIRING', 'MY STAFF', 'AROUND THE LEAGUE'] as const;

export interface CarouselView {
  tab: number;
  /** HIRING: the selected open chair. */
  chair: number;
  sel: number;
  top: number;
  mx: number;
  my: number;
  note: string;
}

export const newCarouselView = (): CarouselView => ({ tab: 0, chair: 0, sel: 0, top: 0, mx: 0, my: 0, note: '' });

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';

const TAB_Y = 32;
const TAB_H = 14;
const CHIP_Y = 50;
const CHIP_H = 11;
const LIST_Y = 76;
const LINE = 11;
export const CAROUSEL_ROWS = 14;
const CARD_Y = LIST_Y + CAROUSEL_ROWS * LINE + 4;

export const CAROUSEL_ADVANCE = { x: VIEW_W - 108, y: 5, w: 100, h: 13 };
export const HIRING_ACTIONS = ['OFFER', 'INTERVIEW'] as const;

const SHORT: Record<RatingName, string> = { scout: 'SCT', teach: 'TCH', game: 'GAM', recruit: 'REC', develop: 'DEV', eval: 'EVL' };

export function carouselTabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  const i = Math.floor(x / (VIEW_W / CAROUSEL_TABS.length));
  return i >= 0 && i < CAROUSEL_TABS.length ? i : -1;
}

export function carouselRowRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 4, y: LIST_Y + i * LINE - 2, w: VIEW_W - 8, h: LINE };
}

export function chairChipRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 8 + i * 70, y: CHIP_Y, w: 66, h: CHIP_H };
}

export function carouselActionRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: VIEW_W - 136, y: CARD_Y + 2 + i * 15, w: 130, h: 13 };
}

/** The open chairs the user can hire for, in staff order. */
export function openChairs(s: SeasonState): string[] {
  const mine = userChairs(s);
  return COACH_ROLES.map((r) => chairOf(s.config.userTeamId, r)).filter((c) => mine.includes(c));
}

let poolMemo: { key: string; rows: Candidate[] } | undefined;

/** The selected chair's candidates, best reputation first (rebuilt only when the market changes). */
export function hiringRows(s: SeasonState, v: CarouselView): Candidate[] {
  const chair = openChairs(s)[v.chair];
  if (!chair) return [];
  const cs = s.carousel!;
  const key = `${s.seed}|${s.year}|${chair}|${s.offseason?.round}|${cs.moved.length}|${cs.open.length}|${cs.declined[chair]?.length ?? 0}`;
  if (poolMemo?.key !== key) poolMemo = { key, rows: poolFor(s, chair).sort((a, b) => b.rep - a.rep) };
  return poolMemo.rows;
}

/** MY STAFF's rows: the user's chairs. */
export const staffRows = (): CoachRole[] => COACH_ROLES;

/** This offseason's coaching news, newest first. */
export function leagueRows(s: SeasonState): NewsItem[] {
  return s.news.filter((n) => n.kind === 'carousel').reverse();
}

const fromText = (from: string) => {
  if (from === 'outside') return 'NON-FBS';
  if (from === 'ga') return 'YOUR GA';
  if (from === 'free') return 'OUT OF JOB';
  const { team, role } = splitChair(from);
  return `${teamById(team).abbr} ${role === 'TRAINER' ? 'TRN' : role}`;
};

function rowBack(g: CanvasRenderingContext2D, i: number, on: boolean, v: CarouselView): void {
  const r = carouselRowRect(i);
  if (on) {
    g.fillStyle = '#1f2a3a';
    g.fillRect(r.x, r.y, r.w, r.h);
  } else if (inBox(r, v.mx, v.my)) {
    g.fillStyle = '#151c27';
    g.fillRect(r.x, r.y, r.w, r.h);
  }
}

function drawButton(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, label: string, v: CarouselView): void {
  g.fillStyle = inBox(r, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
  g.fillRect(r.x, r.y, r.w, r.h);
  text(g, label, r.x + r.w / 2, r.y + 3, { align: 'center', color: '#ffffff', shadow: false });
}

export function drawCarousel(g: CanvasRenderingContext2D, s: SeasonState, v: CarouselView): void {
  const team = teamById(s.config.userTeamId);
  const cs = s.carousel!;
  const round = s.offseason?.round ?? 1;
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${s.year} OFFSEASON: COACHING CAROUSEL`, 10, 6, { size: 8 });
  const ev = headCoachFor(s, s.config.userTeamId).r.eval;
  text(g, `ROUND ${round} OF ${CAROUSEL.rounds}  ${s.config.delegate.carousel ? 'STAFF HIRES' : `INTERVIEWS LEFT ${cs.talksLeft}  YOUR EVAL ${ev}`}`, 10, 18, { color: '#e6e6e6' });
  g.fillStyle = inBox(CAROUSEL_ADVANCE, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
  g.fillRect(CAROUSEL_ADVANCE.x, CAROUSEL_ADVANCE.y, CAROUSEL_ADVANCE.w, CAROUSEL_ADVANCE.h);
  text(g, round >= CAROUSEL.rounds ? 'TO THE PORTAL' : 'ADVANCE', CAROUSEL_ADVANCE.x + CAROUSEL_ADVANCE.w / 2, CAROUSEL_ADVANCE.y + 3, { align: 'center', color: GOLD, shadow: false });
  const tw = VIEW_W / CAROUSEL_TABS.length;
  CAROUSEL_TABS.forEach((t, i) => {
    const on = i === v.tab;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * tw, TAB_Y, tw, TAB_H);
    }
    text(g, t, i * tw + tw / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });
  switch (CAROUSEL_TABS[v.tab]) {
    case 'HIRING':
      drawHiring(g, s, v);
      break;
    case 'MY STAFF':
      drawStaff(g, s, v);
      break;
    default:
      drawLeague(g, s, v);
  }
}

function drawHiring(g: CanvasRenderingContext2D, s: SeasonState, v: CarouselView): void {
  const chairs = openChairs(s);
  const cs = s.carousel!;
  if (!chairs.length) {
    text(g, 'YOUR STAFF IS FULL', VIEW_W / 2, 120, { align: 'center', color: SOFT });
    text(g, 'TO REPLACE A COACH, FIRE HIM ON THE MY STAFF TAB', VIEW_W / 2, 136, { align: 'center', color: DIM });
    drawHint(g, v.note || 'A/D: TAB  SPACE: ADVANCE  F: STAFF HIRES  ESC: HUB');
    return;
  }
  chairs.forEach((c, i) => {
    const r = chairChipRect(i);
    const on = i === v.chair;
    g.fillStyle = on ? '#24324a' : inBox(r, v.mx, v.my) ? '#182232' : '#101620';
    g.fillRect(r.x, r.y, r.w, r.h);
    const role = splitChair(c).role;
    const offered = cs.offers[c] ? '*' : '';
    text(g, `${role}${offered}`, r.x + r.w / 2, r.y + 2, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });
  const chair = chairs[v.chair];
  const role = splitChair(chair).role;
  const rows = hiringRows(s, v);
  const cols = { name: 10, age: 122, from: 156, rep: 252, r: 290, motive: 490, status: 572 };
  const head = LIST_Y - 12;
  text(g, 'NAME', cols.name, head, { color: DIM, shadow: false });
  text(g, 'AGE', cols.age, head, { color: DIM, shadow: false });
  text(g, 'NOW', cols.from, head, { color: DIM, shadow: false });
  text(g, 'REP', cols.rep, head, { color: DIM, shadow: false });
  const keys = rows[0] ? seenRatings(s, rows[0].id, role).map((x) => x.k) : [];
  keys.forEach((k, i) => text(g, SHORT[k], cols.r + i * 50, head, { color: DIM, shadow: false }));
  text(g, 'WANTS', cols.motive, head, { color: DIM, shadow: false });
  rows.slice(v.top, v.top + CAROUSEL_ROWS).forEach((c, i) => {
    const y = LIST_Y + i * LINE;
    rowBack(g, i, v.top + i === v.sel, v);
    const coach = coachNow(s, c.id, role);
    const talked = cs.talks[c.id] ?? 0;
    text(g, coachName(coach), cols.name, y, { color: talked ? ACCENT : '#ffffff', shadow: false });
    text(g, String(coach.age), cols.age, y, { color: SOFT, shadow: false });
    text(g, fromText(c.from), cols.from, y, { color: SOFT, shadow: false });
    text(g, String(Math.round(c.rep)), cols.rep, y, { color: GOLD, shadow: false });
    seenRatings(s, c.id, role).forEach((x, j) => text(g, x.lo === x.hi ? String(x.lo) : `${x.lo}-${x.hi}`, cols.r + j * 50, y, { color: x.lo === x.hi ? '#ffffff' : SOFT, shadow: false }));
    text(g, talked ? motiveOf(c.id).toUpperCase() : '?', cols.motive, y, { color: talked ? ACCENT : DIM, shadow: false });
    const st = cs.offers[chair] === c.id ? ['OFFERED', GREEN] : cs.declined[chair]?.includes(c.id) ? ['DECLINED', RED] : ['', SOFT];
    text(g, st[0], cols.status, y, { color: st[1], shadow: false });
  });
  const c = rows[v.sel];
  if (c) {
    const coach = coachNow(s, c.id, role);
    const talked = cs.talks[c.id] ?? 0;
    g.fillStyle = '#151c27';
    g.fillRect(4, CARD_Y, VIEW_W - 8, 340 - CARD_Y);
    text(g, `${coach.first.toUpperCase()} ${coach.last.toUpperCase()}, ${coach.age}  FOR ${titleOf(role)}`, 10, CARD_Y + 4);
    text(g, `NOW: ${c.from === 'outside' ? 'OUTSIDE FBS' : c.from === 'ga' ? 'YOUR GRADUATE ASSISTANT' : c.from === 'free' ? 'OUT OF A JOB' : `${teamById(splitChair(c.from).team).school.toUpperCase()} ${titleOf(splitChair(c.from).role)}`}  REPUTATION ${Math.round(c.rep)}`, 10, CARD_Y + 16, { color: SOFT });
    text(g, talked ? `INTERVIEWED${talked > 1 ? ' TWICE' : ''}: ${MOTIVE_TEXT[motiveOf(c.id)]}` : 'INTERVIEW HIM TO SHARPEN HIS RATINGS AND LEARN WHAT HE WANTS', 10, CARD_Y + 28, { color: talked ? ACCENT : DIM });
    text(g, 'HE PICKS HIS BEST OFFER WHEN THE ROUND ENDS. A HOT SEAT SCARES ASSISTANTS OFF.', 10, CARD_Y + 44, { color: DIM });
    if (role !== 'HC' && role !== 'OC' && role !== 'DC' && role !== 'TRAINER' && role !== 'ST') text(g, `RECRUITING PIPELINES: ${pipeLabel(coachPipe(s, c.id))}`, 10, CARD_Y + 56, { color: ACCENT });
    if (!s.config.delegate.carousel) {
      drawButton(g, carouselActionRect(0), cs.offers[chair] === c.id ? '1 WITHDRAW' : '1 OFFER', v);
      drawButton(g, carouselActionRect(1), `2 INTERVIEW (${cs.talksLeft})`, v);
    }
  }
  drawHint(g, v.note || 'W/S Q/E: CHAIR  1 OFFER  2 INTERVIEW  F: STAFF HIRES  SPACE: NEXT ROUND  ESC');
}

function drawStaff(g: CanvasRenderingContext2D, s: SeasonState, v: CarouselView): void {
  const u = s.config.userTeamId;
  const staff = staffFor(s, u);
  const open = new Set(userChairs(s));
  const head = LIST_Y - 12;
  const cols = { role: 10, name: 150, age: 262, rep: 302, r: 342 };
  const me = headCoachFor(s, u);
  const tree = treeOf(s, me.id);
  const heads = tree.filter((x) => x.role === 'HC').length;
  text(g, `YOU: DEV ${me.r.develop}  REC ${me.r.recruit}  EVAL ${me.r.eval}   TREE ${treeScore(tree)}: ${heads} HC OF ${tree.length} BRANCHES`, 10, 52, { color: GOLD });
  text(g, 'CHAIR', cols.role, head, { color: DIM, shadow: false });
  text(g, 'COACH', cols.name, head, { color: DIM, shadow: false });
  text(g, 'AGE', cols.age, head, { color: DIM, shadow: false });
  text(g, 'REP', cols.rep, head, { color: DIM, shadow: false });
  text(g, 'RATINGS', cols.r, head, { color: DIM, shadow: false });
  staffRows().forEach((role, i) => {
    const y = LIST_Y + i * LINE;
    rowBack(g, i, i === v.sel, v);
    text(g, titleOf(role), cols.role, y, { color: SOFT, shadow: false });
    if (open.has(chairOf(u, role))) {
      text(g, 'OPEN', cols.name, y, { color: RED, shadow: false });
      return;
    }
    const c = staff[role];
    text(g, coachName(c), cols.name, y, { shadow: false });
    text(g, String(c.age), cols.age, y, { color: SOFT, shadow: false });
    text(g, String(Math.round(repOf(s, c.id, role))), cols.rep, y, { color: GOLD, shadow: false });
    text(g, (Object.entries(c.r) as [RatingName, number][]).map(([k, x]) => `${SHORT[k]} ${x}`).join('  '), cols.r, y, { shadow: false });
  });
  // The graduate assistants: promote one from the HIRING tab.
  gasFor(s, u).forEach((id, i) => {
    const y = LIST_Y + (staffRows().length + i) * LINE;
    const c = coachNow(s, id, parseCoachId(id)!.role);
    text(g, `GRAD ASST (${c.role})`, cols.role, y, { color: DIM, shadow: false });
    text(g, coachName(c), cols.name, y, { color: SOFT, shadow: false });
    text(g, String(c.age), cols.age, y, { color: SOFT, shadow: false });
    text(g, String(Math.round(repOf(s, id, c.role))), cols.rep, y, { color: GOLD, shadow: false });
    text(g, (Object.entries(c.r) as [RatingName, number][]).map(([k, x]) => `${SHORT[k]} ${x}`).join('  '), cols.r, y, { color: SOFT, shadow: false });
  });
  const role = staffRows()[v.sel];
  if (role && !open.has(chairOf(u, role)) && !s.config.delegate.carousel) drawButton(g, carouselActionRect(0), '1 FIRE', v);
  drawHint(g, v.note || 'W/S: COACH  1: FIRE (OPENS HIS CHAIR)  A/D: TAB  SPACE: NEXT ROUND  ESC: HUB');
}

function drawLeague(g: CanvasRenderingContext2D, s: SeasonState, v: CarouselView): void {
  const rows = leagueRows(s);
  if (!rows.length) text(g, 'NO COACHING CHANGES YET', VIEW_W / 2, 120, { align: 'center', color: SOFT });
  const n = 24;
  rows.slice(v.top, v.top + n).forEach((item, i) => {
    const t = item.text.toUpperCase();
    text(g, t.length > 78 ? `${t.slice(0, 77)}.` : t, 10, 54 + i * 11, { color: item.teams.includes(s.config.userTeamId) ? GOLD : '#e6e6e6', shadow: false });
  });
  drawHint(g, v.note || 'W/S: SCROLL  A/D: TAB  SPACE: NEXT ROUND  ESC: HUB');
}
