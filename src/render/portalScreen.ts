import { classLabel, DEV_LABEL, type Athlete } from '../data/athletes';
import { coachName, type Staff } from '../data/coaches';
import { athleteName } from '../data/depth';
import { POSITIONS, type Position } from '../data/positions';
import { COMPOSITION } from '../data/rosterGen';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { hashString } from '../engine/math';
import { groupOf } from '../season/emphasis';
import { LAST_ROUND } from '../season/offseason';
import {
  buildBoard, entrant, leaning, MIN_COUNT, MOTIVE_LABEL, offerCap, openSpots, PORTAL, REASON_LABEL, rosterRoom, STANDING_LABEL, standing,
  suitors, topMotives, type Board, type Standing,
} from '../season/portal';
import { SCOUT_TIERS } from '../season/scouting';
import type { PortalEntrant, SeasonState } from '../season/types';
import { drawHint } from './hud';
import { ovrColor, shortName } from './rosterScreen';
import { inBox } from './teamScreen';
import { text } from './text';

/**
 * The transfer portal (docs/PORTAL.md): the BOARD of entrants with your standing with each and his
 * suitors, MY ROOM (open spots, depth against needs, who's coming and going), and LEAVING, the players
 * considering the portal before it opens.
 */

export const PORTAL_TABS = ['BOARD', 'MY ROOM', 'LEAVING'] as const;
export const POS_CHIPS: ('ALL' | Position)[] = ['ALL', ...POSITIONS];

export interface PortalView {
  tab: number;
  chip: number;
  /** BOARD and LEAVING: the selected row, and the first row shown. */
  sel: number;
  top: number;
  mx: number;
  my: number;
  /** The last action's result, shown on the hint bar. */
  note: string;
}

export const newPortalView = (s: SeasonState): PortalView => ({ tab: s.offseason?.round ? 0 : 2, chip: 0, sel: 0, top: 0, mx: 0, my: 0, note: '' });

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';
const ORANGE = '#ff9f43';

const TAB_Y = 32;
const TAB_H = 14;
const CHIP_Y = 50;
const CHIP_H = 11;
const LIST_Y = 76;
const LINE = 11;
export const BOARD_ROWS = 14;
export const LEAVING_ROWS = 14;
const CARD_Y = LIST_Y + BOARD_ROWS * LINE + 4;

const STANDING_COLOR: Record<Standing, string> = { high: GREEN, list: ACCENT, luke: ORANGE, not: DIM };

export function portalTabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  const i = Math.floor(x / (VIEW_W / PORTAL_TABS.length));
  return i >= 0 && i < PORTAL_TABS.length ? i : -1;
}

export function chipRect(i: number): { x: number; y: number; w: number; h: number } {
  let x = 8;
  for (let j = 0; j < i; j++) x += POS_CHIPS[j].length * 8 + 8 + 3;
  return { x, y: CHIP_Y, w: POS_CHIPS[i].length * 8 + 8, h: CHIP_H };
}

export function rowRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 4, y: LIST_Y + i * LINE - 2, w: VIEW_W - 8, h: LINE };
}

/** The card's action buttons: BOARD (offer, promise, call, visit, focus) and LEAVING (meet, promise, let go, encourage). */
export const BOARD_ACTIONS = ['OFFER', 'PROMISE', 'CALL', 'VISIT', 'FOCUS'] as const;
export const LEAVING_ACTIONS = ['MEET', 'PROMISE START', 'PROMISE SNAPS', 'LET GO', 'ENCOURAGE'] as const;

export function actionRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: VIEW_W - 136, y: CARD_Y + 2 + i * 15, w: 130, h: 13 };
}

export const ADVANCE_BTN = { x: VIEW_W - 108, y: 5, w: 100, h: 13 };

/** The board's rows: entrants at the chip's position, best first. */
export function boardRows(s: SeasonState, chip: number): PortalEntrant[] {
  const pos = POS_CHIPS[chip];
  return (s.portal?.entrants ?? []).filter((e) => pos === 'ALL' || e.pos === pos).sort((a, b) => b.ovr - a.ovr);
}

export function leavingRows(s: SeasonState): string[] {
  const l = s.portal?.leaving ?? {};
  return Object.keys(l).sort((a, b) => l[b].p - l[a].p);
}

/** What the user's position coach can see of him: potential as a range, and his dev trait if sharp enough. */
function scouted(a: Athlete, staff: Staff): { pot: string; dev: string; wants: string } {
  const scout = staff[groupOf(a.pos)].r.scout;
  const w = Math.round(Math.max(1, Math.min(8, (95 - scout) / 6)));
  const lo = a.potential - (hashString(`pot:${a.id}`) % (w + 1));
  const sharp = scout >= SCOUT_TIERS[2];
  const wants = topMotives(a).slice(0, sharp ? 2 : 1);
  return {
    pot: `${lo}-${Math.min(99, lo + w)}`,
    dev: sharp ? DEV_LABEL[a.dev].toUpperCase() : '?',
    wants: wants.map((m) => (m === 'HOME' ? 'HM' : m)).join(' '),
  };
}

function roundLabel(s: SeasonState): string {
  const r = s.offseason?.round ?? 0;
  return r === 0 ? 'BEFORE IT OPENS' : `ROUND ${r} OF ${LAST_ROUND}`;
}

function statusOf(s: SeasonState, e: PortalEntrant): { t: string; c: string } {
  const u = s.config.userTeamId;
  if (e.out === 'commit') {
    const to = s.portal!.commits[e.id];
    return { t: to === e.from ? 'STAYED' : `TO ${teamById(to).abbr}`, c: to === u ? GOLD : SOFT };
  }
  if (e.out === 'return') return { t: 'BACK HOME', c: DIM };
  if (e.out === 'gone') return { t: 'LEFT FBS', c: DIM };
  if (s.portal!.offers[u]?.includes(e.id)) return { t: s.portal!.promises[`${u}:${e.id}`] ? 'OFFER+PR' : 'OFFERED', c: GREEN };
  return { t: '', c: SOFT };
}

export function budgetText(s: SeasonState, board: Board): string {
  const u = s.config.userTeamId;
  const p = s.portal!;
  if ((s.offseason?.round ?? 0) === 0) return `MEETINGS ${p.meets}/${PORTAL.meet.n}`;
  const sp = p.spent[u] ?? { calls: [], visits: [] };
  return `OFFERS ${p.offers[u]?.length ?? 0}/${offerCap(board, u)}  VISITS ${sp.visits.length}/${PORTAL.visits}  CALLS ${sp.calls.length}/${PORTAL.calls}`;
}

export function drawPortal(g: CanvasRenderingContext2D, s: SeasonState, v: PortalView, staff: Staff): void {
  const u = s.config.userTeamId;
  const team = teamById(u);
  const board = buildBoard(s);
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${s.year} OFFSEASON: TRANSFER PORTAL`, 10, 6, { size: 8 });
  text(g, `${roundLabel(s)}  ${s.config.delegate.portal ? 'STAFF RUNS IT' : budgetText(s, board)}`, 10, 18, { color: '#e6e6e6' });
  const last = (s.offseason?.round ?? 0) >= LAST_ROUND;
  g.fillStyle = inBox(ADVANCE_BTN, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
  g.fillRect(ADVANCE_BTN.x, ADVANCE_BTN.y, ADVANCE_BTN.w, ADVANCE_BTN.h);
  text(g, last ? 'CLOSE PORTAL' : 'ADVANCE', ADVANCE_BTN.x + ADVANCE_BTN.w / 2, ADVANCE_BTN.y + 3, { align: 'center', color: GOLD, shadow: false });

  const tw = VIEW_W / PORTAL_TABS.length;
  PORTAL_TABS.forEach((t, i) => {
    const on = i === v.tab;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * tw, TAB_Y, tw, TAB_H);
    }
    text(g, t, i * tw + tw / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });

  switch (PORTAL_TABS[v.tab]) {
    case 'BOARD':
      drawBoard(g, s, board, v, staff);
      break;
    case 'MY ROOM':
      drawRoom(g, s, board);
      drawHint(g, v.note || 'A/D: TAB  SPACE: ADVANCE  F: STAFF RUNS IT  ESC: HUB');
      break;
    case 'LEAVING':
      drawLeaving(g, s, board, v);
      break;
  }
}

function drawChips(g: CanvasRenderingContext2D, v: PortalView): void {
  POS_CHIPS.forEach((c, i) => {
    const r = chipRect(i);
    const on = i === v.chip;
    g.fillStyle = on ? '#24324a' : inBox(r, v.mx, v.my) ? '#182232' : '#101620';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (on) {
      g.fillStyle = GOLD;
      g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    }
    text(g, c, r.x + r.w / 2, r.y + 2, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });
}

function drawBoard(g: CanvasRenderingContext2D, s: SeasonState, board: Board, v: PortalView, staff: Staff): void {
  const u = s.config.userTeamId;
  if ((s.offseason?.round ?? 0) === 0) {
    text(g, 'NOBODY IS IN THE PORTAL YET', VIEW_W / 2, 120, { align: 'center', color: SOFT });
    text(g, 'SEE WHO IS CONSIDERING IT ON THE LEAVING TAB, THEN ADVANCE', VIEW_W / 2, 136, { align: 'center', color: DIM });
    drawHint(g, v.note || 'A/D: TAB  SPACE: OPEN THE PORTAL  ESC: HUB');
    return;
  }
  drawChips(g, v);
  const rows = boardRows(s, v.chip);
  const head = LIST_Y - 12;
  const cols = { name: 10, pos: 126, ovr: 158, pot: 190, cls: 236, from: 286, wants: 324, stand: 386, suit: 462, status: 548 };
  for (const [k, x] of Object.entries(cols)) {
    text(g, { name: 'NAME', pos: 'POS', ovr: 'OVR', pot: 'POT', cls: 'CLASS', from: 'FROM', wants: 'WANTS', stand: 'STANDING', suit: 'SUITORS', status: '' }[k]!, x, head, { color: DIM, shadow: false });
  }
  if (!rows.length) text(g, 'NO ONE AT THIS POSITION', VIEW_W / 2, LIST_Y + 30, { align: 'center', color: SOFT });
  rows.slice(v.top, v.top + BOARD_ROWS).forEach((e, i) => {
    const pl = board.players.get(e.id);
    if (!pl) return;
    const a = pl.a;
    const y = LIST_Y + i * LINE;
    const r = rowRect(i);
    if (v.top + i === v.sel) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(r.x, r.y, r.w, r.h);
    } else if (inBox(r, v.mx, v.my)) {
      g.fillStyle = '#151c27';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    const sc = scouted(a, staff);
    const mine = e.from === u;
    text(g, shortName(a, 13), cols.name, y, { color: a.real ? GOLD : mine ? ACCENT : '#ffffff', shadow: false });
    text(g, e.pos, cols.pos, y, { color: SOFT, shadow: false });
    text(g, String(e.ovr), cols.ovr, y, { color: ovrColor(e.ovr), shadow: false });
    text(g, sc.pot, cols.pot, y, { color: SOFT, shadow: false });
    text(g, classLabel(a), cols.cls, y, { color: SOFT, shadow: false });
    text(g, teamById(e.from).abbr, cols.from, y, { color: mine ? ACCENT : SOFT, shadow: false });
    text(g, sc.wants, cols.wants, y, { color: SOFT, shadow: false });
    if (!e.out) {
      const st = standing(s, board, e.id, u);
      g.fillStyle = '#26303f';
      g.fillRect(cols.stand, y + 1, 30, 5);
      g.fillStyle = STANDING_COLOR[st.tag];
      g.fillRect(cols.stand, y + 1, Math.round(30 * Math.max(0.05, 1 - (st.rank - 1) / 30)), 5);
      text(g, { high: 'HIGH', list: 'LIST', luke: 'LUKE', not: 'NO' }[st.tag], cols.stand + 36, y, { color: STANDING_COLOR[st.tag], shadow: false });
      const su = suitors(s, board, e.id).filter((t) => t !== u).slice(0, 2).map((t) => teamById(t).abbr);
      text(g, su.join(' '), cols.suit, y, { color: DIM, shadow: false });
    }
    const status = statusOf(s, e);
    text(g, status.t, cols.status, y, { color: status.c, shadow: false });
  });
  const e = rows[v.sel];
  if (e) drawBoardCard(g, s, board, e, v, staff);
  drawHint(g, v.note || 'W/S Q/E  1 OFFER 2 PROMISE 3 CALL 4 VISIT 5 FOCUS  F STAFF  SPACE NEXT');
}

function drawBoardCard(g: CanvasRenderingContext2D, s: SeasonState, board: Board, e: PortalEntrant, v: PortalView, staff: Staff): void {
  const u = s.config.userTeamId;
  const pl = board.players.get(e.id);
  if (!pl) return;
  const a = pl.a;
  const sc = scouted(a, staff);
  const coach = staff[groupOf(a.pos)];
  g.fillStyle = '#151c27';
  g.fillRect(4, CARD_Y, VIEW_W - 8, 340 - CARD_Y);
  text(g, `${athleteName(a).toUpperCase()}  ${e.pos} #${a.num}  ${classLabel(a)}  ${a.hometown.city.toUpperCase()}, ${a.hometown.state}`, 10, CARD_Y + 4, { color: a.real ? GOLD : '#ffffff' });
  text(g, `FROM ${teamById(e.from).school.toUpperCase()}  OVR ${e.ovr}  POT ${sc.pot}  DEV ${sc.dev}`, 10, CARD_Y + 16, { color: SOFT });
  const wants = topMotives(a).slice(0, sc.wants.includes(' ') ? 2 : 1).map((m) => MOTIVE_LABEL[m]).join(' / ');
  text(g, `WANTS: ${wants}  (${coachName(coach)}, SCOUT ${coach.r.scout})`, 10, CARD_Y + 28, { color: ACCENT });
  if (!e.out) {
    const st = standing(s, board, e.id, u);
    const su = suitors(s, board, e.id).slice(0, 5).map((t) => (t === u ? 'YOU' : teamById(t).abbr));
    text(g, `${STANDING_LABEL[st.tag]} (NO. ${st.rank})  SUITORS: ${su.join(' ') || 'NONE YET'}`, 10, CARD_Y + 40, { color: STANDING_COLOR[st.tag] });
    const pr = s.portal!.promises[`${u}:${e.id}`];
    const focus = s.portal!.focus.includes(e.id) ? 'FOCUS' : s.portal!.drop.includes(e.id) ? 'DROPPED' : '';
    const cl = s.teamState[e.from]?.progress?.[e.id]?.cl;
    const left = cl?.year === s.year ? `HIS ${cl.role === 'HC' ? 'HEAD COACH' : `${cl.role} COACH`} LEFT${cl.to ? ` FOR ${teamById(cl.to).abbr}` : ''}  ` : '';
    text(g, `${left}${pr ? `PROMISED ${pr === 'start' ? 'A START' : 'SNAPS'}  ` : ''}${focus}`, 10, CARD_Y + 52, { color: GOLD });
  } else {
    text(g, statusOf(s, e).t, 10, CARD_Y + 40, { color: SOFT });
  }
  if (e.out || s.config.delegate.portal) return;
  const offered = s.portal!.offers[u]?.includes(e.id);
  const sp = s.portal!.spent[u];
  const labels: string[] = [
    offered ? 'WITHDRAW' : 'OFFER',
    s.portal!.promises[`${u}:${e.id}`] === 'start' ? 'NO PROMISE' : s.portal!.promises[`${u}:${e.id}`] ? 'PROMISE START' : 'PROMISE SNAPS',
    sp?.calls.includes(e.id) ? 'CALLED' : 'CALL',
    sp?.visits.includes(e.id) ? 'VISITED' : 'VISIT',
    s.portal!.focus.includes(e.id) ? 'DROP' : s.portal!.drop.includes(e.id) ? 'CLEAR' : 'FOCUS',
  ];
  labels.forEach((l, i) => drawButton(g, actionRect(i), `${i + 1} ${l}`, v));
}

function drawButton(g: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, label: string, v: PortalView): void {
  g.fillStyle = inBox(r, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
  g.fillRect(r.x, r.y, r.w, r.h);
  text(g, label, r.x + r.w / 2, r.y + 3, { align: 'center', color: '#ffffff', shadow: false });
}

function drawRoom(g: CanvasRenderingContext2D, s: SeasonState, board: Board): void {
  const u = s.config.userTeamId;
  const school = board.schools.get(u)!;
  const p = s.portal!;
  const round = s.offseason?.round ?? 0;
  const y0 = 54;
  text(g, `ROSTER ${school.size}/${PORTAL.rosterMax}  ROOM ${rosterRoom(board, u)}  OPEN TO TRANSFERS ${round ? Math.max(0, openSpots(board, u)) : '-'}`, 10, y0, { color: GOLD });
  text(g, `TRANSFERS CAN FILL ${Math.round(PORTAL.signShare * 100)}% OF DEPARTURES; WALK-ONS FILL THE REST`, 10, y0 + 12, { color: DIM });
  // Depth by position against its usual count and minimum.
  text(g, 'POS  HAVE/USUAL  TOP  OUT  IN', 10, y0 + 28, { color: DIM, shadow: false });
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  for (const e of p.entrants) {
    if (e.from === u && !(e.out === 'commit' && p.commits[e.id] === u) && e.out !== 'return') out.set(e.pos, (out.get(e.pos) ?? 0) + 1);
    if (e.out === 'commit' && p.commits[e.id] === u && e.from !== u) inn.set(e.pos, (inn.get(e.pos) ?? 0) + 1);
  }
  COMPOSITION.forEach(([pos, usual], i) => {
    const y = y0 + 40 + i * 10;
    const have = school.count.get(pos) ?? 0;
    const top = school.chart.get(pos)?.[0];
    const c = have < MIN_COUNT[pos] ? RED : have < usual ? ORANGE : '#ffffff';
    text(g, pos.padEnd(4), 10, y, { color: SOFT, shadow: false });
    text(g, `${have}/${usual}`, 50, y, { color: c, shadow: false });
    text(g, top ? String(top) : '-', 106, y, { color: top ? ovrColor(top) : DIM, shadow: false });
    text(g, String(out.get(pos) ?? ''), 146, y, { color: RED, shadow: false });
    text(g, String(inn.get(pos) ?? ''), 178, y, { color: GREEN, shadow: false });
  });
  // Who's coming and going.
  const x = 256;
  text(g, 'SIGNED', x, y0 + 28, { color: GREEN, shadow: false });
  const signed = p.entrants.filter((e) => e.out === 'commit' && p.commits[e.id] === u && e.from !== u).sort((a, b) => b.ovr - a.ovr);
  signed.slice(0, 11).forEach((e, i) => {
    const a = board.players.get(e.id)?.a;
    if (a) text(g, `${e.pos} ${shortName(a, 13)} ${e.ovr} ${teamById(e.from).abbr}`, x, y0 + 40 + i * 10, { shadow: false });
  });
  if (!signed.length) text(g, 'NONE YET', x, y0 + 40, { color: DIM, shadow: false });
  const x2 = 452;
  text(g, 'LEAVING', x2, y0 + 28, { color: RED, shadow: false });
  const gone = p.entrants.filter((e) => e.from === u).sort((a, b) => b.ovr - a.ovr);
  gone.slice(0, 22).forEach((e, i) => {
    const a = board.players.get(e.id)?.a;
    const st = statusOf(s, e);
    if (a) text(g, `${e.pos} ${shortName(a, 10)} ${e.ovr} ${st.t}`, x2, y0 + 40 + i * 10, { color: e.out ? SOFT : '#ffffff', shadow: false });
  });
  if (!gone.length) text(g, round ? 'NO ONE ENTERED' : 'NOT OPEN YET', x2, y0 + 40, { color: DIM, shadow: false });
}

function drawLeaving(g: CanvasRenderingContext2D, s: SeasonState, board: Board, v: PortalView): void {
  const p = s.portal!;
  const round = s.offseason?.round ?? 0;
  const ids = leavingRows(s);
  text(g, round ? 'CONSIDERED THE PORTAL' : 'CONSIDERING THE PORTAL', 10, 52, { color: GOLD });
  if (!ids.length) {
    text(g, s.config.delegate.portal ? 'YOUR STAFF IS HANDLING IT' : 'EVERYONE PLANS TO STAY', VIEW_W / 2, 120, { align: 'center', color: SOFT });
    drawHint(g, v.note || 'A/D: TAB  SPACE: ADVANCE  ESC: HUB');
    return;
  }
  const head = LIST_Y - 12;
  const cols = { name: 10, pos: 132, ovr: 164, cls: 192, reason: 240, lean: 456, act: 556 };
  for (const [k, x] of Object.entries(cols)) {
    text(g, { name: 'NAME', pos: 'POS', ovr: 'OVR', cls: 'CLASS', reason: 'WHY', lean: 'LEAN', act: '' }[k]!, x, head, { color: DIM, shadow: false });
  }
  ids.slice(v.top, v.top + LEAVING_ROWS).forEach((id, i) => {
    const e = p.leaving[id];
    const pl = board.players.get(id);
    const ent = entrant(p, id);
    const a = pl?.a;
    if (!a) return;
    const y = LIST_Y + i * LINE;
    const r = rowRect(i);
    if (v.top + i === v.sel) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(r.x, r.y, r.w, r.h);
    } else if (inBox(r, v.mx, v.my)) {
      g.fillStyle = '#151c27';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    text(g, shortName(a, 14), cols.name, y, { color: a.real ? GOLD : '#ffffff', shadow: false });
    text(g, a.pos, cols.pos, y, { color: SOFT, shadow: false });
    text(g, String(pl.ovr), cols.ovr, y, { color: ovrColor(pl.ovr), shadow: false });
    text(g, classLabel(a), cols.cls, y, { color: SOFT, shadow: false });
    text(g, REASON_LABEL[e.reason], cols.reason, y, { color: SOFT, shadow: false });
    const lean = leaning(e);
    text(g, lean, cols.lean, y, { color: lean === 'TORN' ? ORANGE : RED, shadow: false });
    const act = round ? (ent ? 'ENTERED' : 'STAYED') : e.act === 'meet' ? (e.ok ? 'MET: OK' : 'MET: NO') : e.act === 'promise' ? (e.kind === 'start' ? 'PROMISED START' : 'PROMISED SNAPS') : e.act === 'go' ? 'LET GO' : e.act === 'encourage' ? 'SENT' : '';
    text(g, act, cols.act, y, { color: round ? (ent ? RED : GREEN) : e.ok === false ? RED : GREEN, shadow: false });
  });
  const id = ids[v.sel];
  const e = id ? p.leaving[id] : undefined;
  const a = id ? board.players.get(id)?.a : undefined;
  if (e && a) {
    g.fillStyle = '#151c27';
    g.fillRect(4, CARD_Y, VIEW_W - 8, 340 - CARD_Y);
    text(g, `${athleteName(a).toUpperCase()}  ${a.pos}  ${classLabel(a)}`, 10, CARD_Y + 4);
    text(g, `${REASON_LABEL[e.reason]}  ${leaning(e)}`, 10, CARD_Y + 16, { color: SOFT });
    [
      'MEET: A TALK MAY KEEP HIM.',
      'PROMISE: A START OR SNAPS NEXT SEASON. A BROKEN',
      'PROMISE HURTS HIM AND SENDS HIM TO NEXT PORTAL.',
      'ENCOURAGE: HE ENTERS, WITH NO HARD FEELINGS.',
    ].forEach((t, i) => text(g, t, 10, CARD_Y + 32 + i * 10, { color: DIM }));
    if (!round && !s.config.delegate.portal && (!e.act || e.act === 'go')) {
      LEAVING_ACTIONS.forEach((l, i) => drawButton(g, actionRect(i), `${i + 1} ${l}`, v));
    }
  }
  drawHint(g, v.note || (round ? 'A/D: TAB  W/S: PLAYER  SPACE: ADVANCE  ESC: HUB' : `W/S: PLAYER  1 MEET (${PORTAL.meet.n - p.meets} LEFT)  2/3 PROMISE  4 LET GO  5 SEND  SPACE: OPEN`));
}
