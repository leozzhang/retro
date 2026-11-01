import { coachName, GROUPS, type Group } from '../data/coaches';
import { athleteName } from '../data/depth';
import { heightLabel } from '../data/athletes';
import { TEAM_STATE } from '../data/fbs/geo';
import { prospect, WANT_LABEL, type Prospect } from '../data/recruits';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { groupOf } from '../season/emphasis';
import {
  classRanks, coachPipe, evaluation, inHomeOpen, knownWants, marketRank, nextHomeGame, offerCap, pipeLabel, recruitClass, RECRUITING,
  RSTANDING_LABEL, standingOf3, statusOf, topSchools, userNeeds, visitGame, type RStanding,
} from '../season/recruiting';
import type { SeasonState } from '../season/types';
import { staffFor } from '../season/world';
import { drawHint } from './hud';
import { inBox } from './teamScreen';
import { text } from './text';

/**
 * HS recruiting (season/recruiting.ts): the BOARD your position coaches work (stars, rank, your
 * standing, his top schools, and the coach's evaluation in words), SEARCH (the national class), and
 * the CLASS (commits and signees, needs, and the national class rankings). In the offseason's signing
 * stage it's national signing day: Space runs it, then opens the portal.
 */

export const RECRUIT_TABS = ['BOARD', 'SEARCH', 'CLASS'] as const;
export const GROUP_CHIPS: ('ALL' | Group)[] = ['ALL', ...GROUPS];
/** SEARCH filters: everyone, prospects still open, from your state, from your staff's pipelines. */
export const SEARCH_FILTERS = ['ALL', 'OPEN', 'IN-STATE', 'PIPELINE'] as const;

export interface RecruitView {
  tab: number;
  chip: number;
  filter: number;
  sel: number;
  top: number;
  mx: number;
  my: number;
  note: string;
}

export const newRecruitView = (s: SeasonState): RecruitView => ({ tab: s.offseason?.stage === 'signing' && s.offseason.round ? 2 : 0, chip: 0, filter: 1, sel: 0, top: 0, mx: 0, my: 0, note: '' });

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const ORANGE = '#ff9f43';

const TAB_Y = 32;
const TAB_H = 14;
const CHIP_Y = 50;
const CHIP_H = 11;
const LIST_Y = 76;
const LINE = 11;
export const RECRUIT_ROWS = 14;
const CARD_Y = LIST_Y + RECRUIT_ROWS * LINE + 4;

const STANDING_COLOR: Record<RStanding, string> = { high: GREEN, list: ACCENT, luke: ORANGE, not: DIM };

export const RECRUIT_ADVANCE = { x: VIEW_W - 124, y: 5, w: 116, h: 13 };

/** The card's buttons: BOARD and SEARCH. */
export const RECRUIT_ACTIONS = ['OFFER', 'HOST VISIT', 'IN-HOME', 'TOP TARGET', 'BOARD'] as const;

export function recruitActionRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: VIEW_W - 136, y: CARD_Y + 2 + i * 15, w: 130, h: 13 };
}

export function recruitTabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  const i = Math.floor(x / (VIEW_W / RECRUIT_TABS.length));
  return i >= 0 && i < RECRUIT_TABS.length ? i : -1;
}

export function groupChipRect(i: number): { x: number; y: number; w: number; h: number } {
  let x = 8;
  for (let j = 0; j < i; j++) x += GROUP_CHIPS[j].length * 8 + 8 + 3;
  return { x, y: CHIP_Y, w: GROUP_CHIPS[i].length * 8 + 8, h: CHIP_H };
}

export const FILTER_BTN = { x: VIEW_W - 108, y: CHIP_Y, w: 100, h: CHIP_H };

export function recruitRowRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 4, y: LIST_Y + i * LINE - 2, w: VIEW_W - 8, h: LINE };
}

const signing = (s: SeasonState) => s.phase === 'offseason' && s.offseason?.stage === 'signing';
const signed = (s: SeasonState) => signing(s) && (s.offseason?.round ?? 0) > 0;

/** The rows a tab lists, as prospect ids: the board (your class first on CLASS), or the national class filtered. */
export function recruitRows(s: SeasonState, v: Pick<RecruitView, 'tab' | 'chip' | 'filter'>): string[] {
  const rs = s.recruiting;
  if (!rs) return [];
  const u = s.config.userTeamId;
  const chip = GROUP_CHIPS[v.chip];
  const inChip = (p: Prospect) => chip === 'ALL' || groupOf(p.pos) === chip;
  const tab = RECRUIT_TABS[v.tab];
  if (tab === 'CLASS') {
    return recruitClass(s).filter((p) => rs.commits[p.id] === u && inChip(p)).map((p) => p.id);
  }
  if (tab === 'BOARD') {
    const top = new Set(rs.top);
    return (rs.boards[u] ?? [])
      .map((id) => prospect(id)!)
      .filter((p) => inChip(p) && statusOf(s, p.id).kind !== 'gone')
      .sort((a, b) => Number(top.has(b.id)) - Number(top.has(a.id)) || a.rank - b.rank)
      .map((p) => p.id);
  }
  const f = SEARCH_FILTERS[v.filter];
  const home = TEAM_STATE[u] ?? '';
  const pipes = f === 'PIPELINE' ? userPipes(s) : undefined;
  return recruitClass(s)
    .filter((p) => {
      if (!inChip(p)) return false;
      if (f === 'OPEN') return statusOf(s, p.id).kind === 'open';
      if (f === 'IN-STATE') return p.a.hometown.state === home;
      if (f === 'PIPELINE') return (pipes!.get(groupOf(p.pos))?.[p.a.hometown.state] ?? 0) >= 0.2 || (s.teamState[u]?.pipe?.[p.a.hometown.state] ?? 0) >= 0.2;
      return true;
    })
    .map((p) => p.id);
}


function userPipes(s: SeasonState): Map<Group, Record<string, number>> {
  const staff = staffFor(s, s.config.userTeamId);
  return new Map(GROUPS.map((g) => [g, coachPipe(s, staff[g].id)]));
}

function budget(s: SeasonState): string {
  const rs = s.recruiting!;
  const u = s.config.userTeamId;
  const offers = (rs.offers[u] ?? []).filter((id) => !rs.commits[id] || rs.commits[id] === u).length;
  const g = nextHomeGame(s);
  const visits = g ? `VISITS ${(rs.visits[g.id] ?? []).length}/${RECRUITING.visit.n} VS ${teamById(g.away).abbr} (WK ${g.week})` : 'NO HOME GAMES LEFT';
  const homes = inHomeOpen(s) ? `IN-HOMES ${(rs.homes[u] ?? []).length}/${RECRUITING.inHome.n}` : 'IN-HOMES FROM WK 15';
  return `OFFERS ${offers}/${offerCap(s)}  ${visits}  ${homes}`;
}

export function drawRecruit(g: CanvasRenderingContext2D, s: SeasonState, v: RecruitView): void {
  const team = teamById(s.config.userTeamId);
  const rs = s.recruiting;
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  if (!rs) {
    text(g, 'NO RECRUITING CYCLE', 10, 6, { size: 8 });
    drawHint(g, 'ESC: HUB');
    return;
  }
  const title = signing(s) ? `${rs.cls} CLASS: NATIONAL SIGNING DAY` : `RECRUITING THE CLASS OF ${rs.cls}`;
  text(g, title, 10, 6, { size: 8 });
  const sub = s.config.delegate.recruiting ? 'YOUR STAFF IS RECRUITING (F: TAKE IT BACK)' : signed(s) ? 'THE CLASS IS IN. NEXT: THE TRANSFER PORTAL' : budget(s);
  text(g, sub, 10, 18, { color: '#e6e6e6' });
  if (signing(s)) {
    g.fillStyle = inBox(RECRUIT_ADVANCE, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
    g.fillRect(RECRUIT_ADVANCE.x, RECRUIT_ADVANCE.y, RECRUIT_ADVANCE.w, RECRUIT_ADVANCE.h);
    text(g, signed(s) ? 'TO THE PORTAL' : 'RUN SIGNING DAY', RECRUIT_ADVANCE.x + RECRUIT_ADVANCE.w / 2, RECRUIT_ADVANCE.y + 3, { align: 'center', color: GOLD, shadow: false });
  }
  const tw = VIEW_W / RECRUIT_TABS.length;
  RECRUIT_TABS.forEach((t, i) => {
    const on = i === v.tab;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * tw, TAB_Y, tw, TAB_H);
    }
    text(g, t, i * tw + tw / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });
  GROUP_CHIPS.forEach((c, i) => {
    const r = groupChipRect(i);
    const on = i === v.chip;
    g.fillStyle = on ? '#2a3a52' : inBox(r, v.mx, v.my) ? '#1a2433' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    text(g, c, r.x + 4, r.y + 2, { color: on ? GOLD : SOFT, shadow: false });
  });
  if (RECRUIT_TABS[v.tab] === 'SEARCH') {
    g.fillStyle = inBox(FILTER_BTN, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
    g.fillRect(FILTER_BTN.x, FILTER_BTN.y, FILTER_BTN.w, FILTER_BTN.h);
    text(g, `R: ${SEARCH_FILTERS[v.filter]}`, FILTER_BTN.x + FILTER_BTN.w / 2, FILTER_BTN.y + 2, { align: 'center', color: ACCENT, shadow: false });
  }
  if (RECRUIT_TABS[v.tab] === 'CLASS') drawClass(g, s, v);
  else drawList(g, s, v);
}

const cols = { stars: 8, rk: 54, name: 84, pos: 204, home: 236, stand: 348, status: 466, flag: 586 };

function drawList(g: CanvasRenderingContext2D, s: SeasonState, v: RecruitView): void {
  const rs = s.recruiting!;
  const u = s.config.userTeamId;
  const ids = recruitRows(s, v);
  const heads: Record<keyof typeof cols, string> = { stars: 'STAR', rk: 'RK', name: 'NAME', pos: 'POS', home: 'HOMETOWN', stand: 'YOUR STANDING', status: 'STATUS', flag: '' };
  for (const [k, x] of Object.entries(cols)) text(g, heads[k as keyof typeof cols], x, LIST_Y - 12, { color: DIM, shadow: false });
  if (!ids.length) {
    const msg = RECRUIT_TABS[v.tab] === 'BOARD' ? 'NOBODY ON THE BOARD HERE. SEARCH TO ADD, OR G: STAFF FILL' : 'NOBODY MATCHES';
    text(g, msg, VIEW_W / 2, 120, { align: 'center', color: SOFT });
  }
  const offered = new Set(rs.offers[u] ?? []);
  const top = new Set(rs.top);
  ids.slice(v.top, v.top + RECRUIT_ROWS).forEach((id, i) => {
    const p = prospect(id)!;
    const y = LIST_Y + i * LINE;
    const r = recruitRowRect(i);
    if (v.top + i === v.sel) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(r.x, r.y, r.w, r.h);
    } else if (inBox(r, v.mx, v.my)) {
      g.fillStyle = '#151c27';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    text(g, '*'.repeat(p.stars), cols.stars, y, { color: p.stars >= 5 ? GOLD : p.stars === 4 ? GREEN : SOFT, shadow: false });
    text(g, String(p.rank), cols.rk, y, { color: SOFT, shadow: false });
    text(g, `${p.a.first[0]}. ${p.a.last}`.toUpperCase().slice(0, 14), cols.name, y, { color: top.has(id) ? GOLD : '#ffffff', shadow: false });
    text(g, p.pos, cols.pos, y, { color: SOFT, shadow: false });
    text(g, `${p.a.hometown.city.toUpperCase().slice(0, 9)}, ${p.a.hometown.state}`, cols.home, y, { color: SOFT, shadow: false });
    const st = statusOf(s, id);
    if (st.kind === 'open' || (st.kind === 'committed' && st.team !== u)) {
      const tag = standingOf3(marketRank(s, p, u));
      text(g, RSTANDING_LABEL[tag], cols.stand, y, { color: STANDING_COLOR[tag], shadow: false });
    }
    const [t, c] = st.kind === 'signed' ? [`SIGNED ${teamById(st.team!).abbr}`, st.team === u ? GOLD : DIM]
      : st.kind === 'committed' ? [`COMMIT ${teamById(st.team!).abbr}`, st.team === u ? GOLD : ORANGE]
      : st.kind === 'gone' ? ['UNSIGNED', DIM] : ['OPEN', GREEN];
    text(g, t.slice(0, 13), cols.status, y, { color: c, shadow: false });
    const flags = `${offered.has(id) ? 'O' : ''}${visitGame(s, id) ? 'V' : ''}${rs.homes[u]?.includes(id) ? 'H' : ''}`;
    text(g, flags, cols.flag, y, { color: ACCENT, shadow: false });
  });
  const id = ids[v.sel];
  if (id) drawCard(g, s, v, id);
  const delegated = s.config.delegate.recruiting;
  const base = RECRUIT_TABS[v.tab] === 'BOARD'
    ? `W/S  1-5: ACTIONS  G: STAFF FILL  F: ${delegated ? 'TAKE BACK' : 'STAFF'}`
    : `W/S  Q/E: GROUP  R: FILTER  1-5: ACTIONS`;
  drawHint(g, v.note || `A/D: TAB  ${base}${signing(s) ? '  SPACE: SIGNING DAY' : ''}  ESC`);
}

function drawCard(g: CanvasRenderingContext2D, s: SeasonState, v: RecruitView, id: string): void {
  const rs = s.recruiting!;
  const u = s.config.userTeamId;
  const p = prospect(id)!;
  const a = p.a;
  g.fillStyle = '#151c27';
  g.fillRect(4, CARD_Y, VIEW_W - 8, 342 - CARD_Y);
  const line = (i: number) => CARD_Y + 4 + i * 11;
  text(g, `${athleteName(a).toUpperCase()}  ${p.pos}  ${heightLabel(a.heightIn)} ${a.weightLb}`, 10, line(0));
  text(g, `${'*'.repeat(p.stars)}  NO. ${p.rank} NATIONALLY, NO. ${p.posRank} ${p.pos}  ${a.hometown.city.toUpperCase()}, ${a.hometown.state}`, 10, line(1), { color: SOFT, shadow: false });
  const coach = staffFor(s, u)[groupOf(p.pos)];
  const ev = evaluation(s, id);
  text(g, `${coachName(coach).toUpperCase()} (${groupOf(p.pos)}):`, 10, line(2), { color: DIM, shadow: false });
  if (ev) {
    text(g, `${ev.ready}, ${ev.ceiling}`, 10, line(3), { color: GREEN, shadow: false });
    text(g, `${ev.sure}${ev.notes.length ? ': ' + ev.notes.join(', ') : ''}`.slice(0, 60), 10, line(4), { color: ev.sure === 'HUNCH' ? ORANGE : ACCENT, shadow: false });
  } else text(g, 'NOT EVALUATED YET: PUT HIM ON THE BOARD', 10, line(3), { color: DIM, shadow: false });
  const wants = knownWants(s, id);
  text(g, `WANTS: ${wants.length ? wants.map((w) => WANT_LABEL[w]).join(', ') : '?'}`, 10, line(5), { color: SOFT, shadow: false });
  const tops = topSchools(s, p, 4);
  const st = statusOf(s, id);
  const rank = marketRank(s, p, u);
  text(g, `TOP SCHOOLS: ${tops.length ? tops.map((t) => teamById(t).abbr).join(', ') : 'NONE YET'}`.slice(0, 60), 10, line(6), { color: SOFT, shadow: false });
  const visits = rs.ov[id] ?? [];
  const vg = visitGame(s, id);
  const vibe = rs.vibe[id];
  const vibeText = vibe === undefined ? '' : vibe >= 0.25 ? '  LOVED HIS VISIT' : vibe >= -0.05 ? '  LIKED HIS VISIT' : '  COOL ON HIS VISIT';
  text(g, `OFFICIAL VISITS ${visits.length}/${RECRUITING.visit.max}${vg ? `  VISITS YOU WK ${vg.week}` : ''}${vibeText}`, 10, line(7), { color: SOFT, shadow: false });
  const status = st.kind === 'signed' ? `SIGNED WITH ${teamById(st.team!).school.toUpperCase()}` : st.kind === 'committed' ? `COMMITTED TO ${teamById(st.team!).school.toUpperCase()}`
    : st.kind === 'gone' ? 'WENT UNSIGNED' : `${RSTANDING_LABEL[standingOf3(rank)]} (NO. ${rank} FOR HIM)`;
  text(g, status, 10, line(8), { color: st.team === u ? GOLD : st.kind === 'open' ? STANDING_COLOR[standingOf3(rank)] : ORANGE, shadow: false });
  if (s.config.delegate.recruiting || signed(s)) return;
  const onBoard = (rs.boards[u] ?? []).includes(id);
  const labels: Record<(typeof RECRUIT_ACTIONS)[number], string> = {
    OFFER: (rs.offers[u] ?? []).includes(id) ? 'WITHDRAW OFFER' : 'OFFER',
    'HOST VISIT': vg ? 'CANCEL VISIT' : nextHomeGame(s) ? `HOST WK ${nextHomeGame(s)!.week}` : 'HOST VISIT',
    'IN-HOME': 'IN-HOME VISIT',
    'TOP TARGET': rs.top.includes(id) ? 'UNMARK TARGET' : 'TOP TARGET',
    BOARD: onBoard ? 'DROP' : 'ADD TO BOARD',
  };
  RECRUIT_ACTIONS.forEach((k, i) => {
    const r = recruitActionRect(i);
    const off = (k === 'IN-HOME' && (!inHomeOpen(s) || rs.homes[u]?.includes(id))) || (k === 'HOST VISIT' && !nextHomeGame(s));
    g.fillStyle = off ? '#111722' : inBox(r, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
    g.fillRect(r.x, r.y, r.w, r.h);
    text(g, `${i + 1} ${labels[k]}`, r.x + 4, r.y + 3, { color: off ? DIM : GOLD, shadow: false });
  });
}

function drawClass(g: CanvasRenderingContext2D, s: SeasonState, v: RecruitView): void {
  const rs = s.recruiting!;
  const u = s.config.userTeamId;
  const ids = recruitRows(s, v);
  const ranks = classRanks(s);
  const mine = ranks.findIndex((r) => r.team === u);
  const c = { stars: 8, rk: 54, name: 84, pos: 204, home: 236, status: 336 };
  for (const [k, x] of Object.entries(c)) text(g, ({ stars: 'STAR', rk: 'RK', name: 'NAME', pos: 'POS', home: 'FROM', status: '' } as Record<string, string>)[k], x, LIST_Y - 12, { color: DIM, shadow: false });
  if (!ids.length) text(g, 'NO COMMITS YET', 170, 120, { align: 'center', color: SOFT });
  ids.slice(v.top, v.top + 22).forEach((id, i) => {
    const p = prospect(id)!;
    const y = LIST_Y + i * LINE;
    if (v.top + i === v.sel) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(4, y - 2, 420, LINE);
    }
    text(g, '*'.repeat(p.stars), c.stars, y, { color: p.stars >= 5 ? GOLD : p.stars === 4 ? GREEN : SOFT, shadow: false });
    text(g, String(p.rank), c.rk, y, { color: SOFT, shadow: false });
    text(g, `${p.a.first[0]}. ${p.a.last}`.toUpperCase().slice(0, 14), c.name, y, { color: '#ffffff', shadow: false });
    text(g, p.pos, c.pos, y, { color: SOFT, shadow: false });
    text(g, p.a.hometown.state, c.home, y, { color: SOFT, shadow: false });
    text(g, rs.signed[id] ? 'SIGNED' : 'COMMIT', c.status, y, { color: rs.signed[id] ? GOLD : ORANGE, shadow: false });
  });
  // Right panel: the class's rank, needs left, and the national top 10.
  const x = 430;
  const me = ranks[mine];
  text(g, `CLASS: NO. ${mine + 1}, ${me.n} COMMITS`, x, LIST_Y - 12, { color: GOLD, shadow: false });
  text(g, `5*${me.stars[5]} 4*${me.stars[4]} 3*${me.stars[3]} 2*${me.stars[2]}`, x, LIST_Y, { color: SOFT, shadow: false });
  const need = [...userNeeds(s)].filter(([, n]) => n >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 8);
  text(g, 'STILL NEEDS', x, LIST_Y + 16, { color: DIM, shadow: false });
  text(g, need.length ? need.map(([p, n]) => `${p} ${Math.round(n)}`).join(' ').slice(0, 25) : 'NOTHING', x, LIST_Y + 27, { color: SOFT, shadow: false });
  if (need.length > 4) text(g, need.slice(4).map(([p, n]) => `${p} ${Math.round(n)}`).join(' '), x, LIST_Y + 38, { color: SOFT, shadow: false });
  text(g, 'NATIONAL TOP 10', x, LIST_Y + 56, { color: DIM, shadow: false });
  ranks.slice(0, 10).forEach((r, i) => {
    text(g, `${String(i + 1).padStart(2)} ${teamById(r.team).abbr.padEnd(5)} ${String(r.n).padStart(2)} ${r.pts}`, x, LIST_Y + 68 + i * 11, { color: r.team === u ? GOLD : SOFT, shadow: false });
  });
  const pipes = userPipes(s);
  const best = new Map<string, number>();
  for (const pp of pipes.values()) for (const [st, val] of Object.entries(pp)) best.set(st, Math.max(best.get(st) ?? 0, val));
  for (const [st, val] of Object.entries(s.teamState[u]?.pipe ?? {})) best.set(st, Math.max(best.get(st) ?? 0, val));
  text(g, `PIPELINES: ${pipeLabel(Object.fromEntries(best), 4)}`, x, LIST_Y + 184, { color: ACCENT, shadow: false });
  drawHint(g, v.note || `A/D: TAB  Q/E: GROUP  W/S: SCROLL${signing(s) ? `  SPACE: ${signed(s) ? 'TO THE PORTAL' : 'SIGNING DAY'}` : ''}  ESC: HUB`);
}

