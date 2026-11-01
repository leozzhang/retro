import { classLabel } from '../data/athletes';
import { athleteName } from '../data/depth';
import { overall } from '../data/positions';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { DEPARTURES, meetOdds, seniorsLeaving } from '../season/departures';
import { projLabel } from '../season/draft';
import type { DraftPick, SeasonState } from '../season/types';
import { squadFor } from '../season/world';
import { drawHint } from './hud';
import { ovrColor, shortName } from './rosterScreen';
import { inBox } from './teamScreen';
import { text } from './text';

/**
 * Departures (season/departures.ts), the offseason stage before the portal: the DECLARE WATCH (the
 * user's underclassmen thinking about the NFL, whom he can meet), SENIORS (who's out of eligibility)
 * and the DRAFT. Round 0 is before anyone leaves; advancing it runs the stage, and round 1 shows the results.
 */

export const DEPARTURE_TABS = ['DECLARE WATCH', 'SENIORS', 'DRAFT'] as const;

export interface DeparturesView {
  tab: number;
  sel: number;
  top: number;
  mx: number;
  my: number;
  note: string;
}

export const newDeparturesView = (s: SeasonState): DeparturesView => ({ tab: s.offseason?.round ? 2 : 0, sel: 0, top: 0, mx: 0, my: 0, note: '' });

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';
const ORANGE = '#ff9f43';

const TAB_Y = 32;
const TAB_H = 14;
const LIST_Y = 64;
const LINE = 11;
export const DEPARTURE_ROWS = 18;
const CARD_Y = LIST_Y + 14 * LINE + 4;

export const DEPARTURES_ADVANCE = { x: VIEW_W - 108, y: 5, w: 100, h: 13 };
export const MEET_BTN = { x: VIEW_W - 136, y: CARD_Y + 2, w: 130, h: 13 };

export function departuresTabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  const i = Math.floor(x / (VIEW_W / DEPARTURE_TABS.length));
  return i >= 0 && i < DEPARTURE_TABS.length ? i : -1;
}

export function departuresRowRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 4, y: LIST_Y + i * LINE - 2, w: VIEW_W - 8, h: LINE };
}

/** The watch's rows: likeliest to go first. */
export function watchRows(s: SeasonState): string[] {
  const w = s.departures?.watch ?? {};
  return Object.keys(w).sort((a, b) => w[b].p - w[a].p);
}

/** How many rows the tab has, for scrolling. */
export function departureRowCount(s: SeasonState, tab: number): number {
  const u = s.config.userTeamId;
  if (DEPARTURE_TABS[tab] === 'DECLARE WATCH') return watchRows(s).length;
  if (DEPARTURE_TABS[tab] === 'SENIORS') return s.offseason?.round ? (s.departures?.gone ?? []).filter((g) => g.team === u).length : seniorsLeaving(s, u).length;
  return draftOf(s).length;
}

function draftOf(s: SeasonState): DraftPick[] {
  return s.history.find((h) => h.year === s.year)?.draft ?? [];
}

const done = (s: SeasonState) => (s.offseason?.round ?? 0) > 0;

export function drawDepartures(g: CanvasRenderingContext2D, s: SeasonState, v: DeparturesView): void {
  const team = teamById(s.config.userTeamId);
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${s.year} OFFSEASON: DEPARTURES AND THE NFL DRAFT`, 10, 6, { size: 8 });
  const sub = done(s)
    ? 'THEY HAVE LEFT. NEXT: THE TRANSFER PORTAL'
    : s.config.delegate.departures ? 'STAFF MEETS THE DECLARE WATCH' : `BEFORE ANYONE LEAVES  MEETINGS ${s.departures?.meets ?? 0}/${DEPARTURES.meet.n}`;
  text(g, sub, 10, 18, { color: '#e6e6e6' });
  g.fillStyle = inBox(DEPARTURES_ADVANCE, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
  g.fillRect(DEPARTURES_ADVANCE.x, DEPARTURES_ADVANCE.y, DEPARTURES_ADVANCE.w, DEPARTURES_ADVANCE.h);
  text(g, done(s) ? 'TO THE PORTAL' : 'RUN THE DRAFT', DEPARTURES_ADVANCE.x + DEPARTURES_ADVANCE.w / 2, DEPARTURES_ADVANCE.y + 3, { align: 'center', color: GOLD, shadow: false });

  const tw = VIEW_W / DEPARTURE_TABS.length;
  DEPARTURE_TABS.forEach((t, i) => {
    const on = i === v.tab;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * tw, TAB_Y, tw, TAB_H);
    }
    text(g, t, i * tw + tw / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });
  switch (DEPARTURE_TABS[v.tab]) {
    case 'DECLARE WATCH':
      drawWatch(g, s, v);
      break;
    case 'SENIORS':
      drawSeniors(g, s, v);
      break;
    case 'DRAFT':
      drawDraft(g, s, v);
      break;
  }
}

function rowBg(g: CanvasRenderingContext2D, v: DeparturesView, i: number): void {
  const r = departuresRowRect(i);
  if (v.top + i === v.sel) {
    g.fillStyle = '#1f2a3a';
    g.fillRect(r.x, r.y, r.w, r.h);
  } else if (inBox(r, v.mx, v.my)) {
    g.fillStyle = '#151c27';
    g.fillRect(r.x, r.y, r.w, r.h);
  }
}

function heads(g: CanvasRenderingContext2D, cols: Record<string, number>, labels: Record<string, string>): void {
  for (const [k, x] of Object.entries(cols)) text(g, labels[k], x, LIST_Y - 12, { color: DIM, shadow: false });
}

function drawWatch(g: CanvasRenderingContext2D, s: SeasonState, v: DeparturesView): void {
  const u = s.config.userTeamId;
  const ids = watchRows(s);
  const d = s.departures;
  const gone = new Set((d?.gone ?? []).map((x) => x.id));
  const picks = new Map(draftOf(s).map((p) => [p.id, p]));
  const roster = new Map(squadFor(s, u).athletes.map((a) => [a.id, a]));
  const cols = { name: 10, pos: 132, ovr: 164, cls: 192, proj: 240, odds: 310, lean: 360, act: 466 };
  heads(g, cols, { name: 'NAME', pos: 'POS', ovr: 'OVR', cls: 'CLASS', proj: 'PROJECTS', odds: 'ODDS', lean: 'LEAN', act: '' });
  if (!ids.length) {
    text(g, s.config.delegate.departures ? 'YOUR STAFF IS HANDLING IT (F: TAKE IT BACK)' : 'NOBODY ON YOUR ROSTER IS THINKING ABOUT THE NFL', VIEW_W / 2, 120, { align: 'center', color: SOFT });
  }
  ids.slice(v.top, v.top + 14).forEach((id, i) => {
    const e = d!.watch[id];
    // Once he's declared he's off the roster: the departure keeps his line.
    const a = roster.get(id);
    const left = d?.gone?.find((x) => x.id === id);
    const y = LIST_Y + i * LINE;
    rowBg(g, v, i);
    text(g, a ? shortName(a, 14) : (left?.name ?? id).toUpperCase().slice(0, 14), cols.name, y, { color: '#ffffff', shadow: false });
    const pos = a?.pos ?? left?.pos ?? '';
    const ovr = a ? overall(a.r, a.pos) : left?.ovr ?? 0;
    text(g, pos, cols.pos, y, { color: SOFT, shadow: false });
    text(g, String(ovr), cols.ovr, y, { color: ovrColor(ovr), shadow: false });
    if (a) text(g, classLabel(a), cols.cls, y, { color: SOFT, shadow: false });
    text(g, projLabel(e.proj), cols.proj, y, { color: e.proj <= 64 ? GOLD : SOFT, shadow: false });
    text(g, `${Math.round(e.p * 100)}%`, cols.odds, y, { color: e.p >= 0.5 ? RED : ORANGE, shadow: false });
    text(g, e.p >= 0.5 ? 'LEANING NFL' : 'TORN', cols.lean, y, { color: e.p >= 0.5 ? RED : ORANGE, shadow: false });
    let act = '';
    let c = GREEN;
    if (done(s)) {
      const pk = picks.get(id);
      act = gone.has(id) ? (pk ? `NFL: RD ${pk.round} ${pk.city.toUpperCase()}` : 'NFL: UNDRAFTED') : 'STAYS';
      c = gone.has(id) ? RED : GREEN;
    } else if (e.met) {
      act = e.ok ? 'MET: LEANING BACK' : 'MET: NOT SWAYED';
      c = e.ok ? GREEN : RED;
    }
    text(g, act, cols.act, y, { color: c, shadow: false });
  });
  const id = ids[v.sel];
  const e = id ? d?.watch[id] : undefined;
  const a = id ? roster.get(id) : undefined;
  if (e && a) {
    g.fillStyle = '#151c27';
    g.fillRect(4, CARD_Y, VIEW_W - 8, 340 - CARD_Y);
    text(g, `${athleteName(a).toUpperCase()}  ${a.pos}  ${classLabel(a)}  PROJECTS ${projLabel(e.proj)}`, 10, CARD_Y + 4);
    [
      'MEET: A TALK MAY BRING HIM BACK FOR ANOTHER SEASON.',
      'THE HIGHER HE PROJECTS, THE HARDER HE IS TO KEEP.',
      'A PLAYER WHO PUTS THE TEAM FIRST LISTENS MORE.',
    ].forEach((t, i) => text(g, t, 10, CARD_Y + 20 + i * 10, { color: DIM }));
    if (!done(s) && !s.config.delegate.departures && !e.met && (d?.meets ?? 0) < DEPARTURES.meet.n) {
      g.fillStyle = inBox(MEET_BTN, v.mx, v.my) ? '#2a3a52' : '#1f2a3a';
      g.fillRect(MEET_BTN.x, MEET_BTN.y, MEET_BTN.w, MEET_BTN.h);
      text(g, `1 MEET (${Math.round(meetOdds(a, e.proj) * 100)}% TO LAND)`, MEET_BTN.x + 4, MEET_BTN.y + 3, { color: GOLD, shadow: false });
    }
  }
  drawHint(g, v.note || (done(s) ? 'A/D: TAB  W/S: PLAYER  SPACE: TO THE PORTAL  ESC: HUB' : `W/S: PLAYER  1: MEET (${DEPARTURES.meet.n - (d?.meets ?? 0)} LEFT)  F: STAFF  SPACE: RUN THE DRAFT`));
}

function drawSeniors(g: CanvasRenderingContext2D, s: SeasonState, v: DeparturesView): void {
  const u = s.config.userTeamId;
  const cols = { name: 10, pos: 132, ovr: 164, cls: 192, why: 200, draft: 330 };
  heads(g, cols, { name: 'NAME', pos: 'POS', ovr: 'OVR', cls: done(s) ? '' : 'CLASS', why: done(s) ? 'WHY' : '', draft: done(s) ? 'DRAFT' : '' });
  const picks = new Map(draftOf(s).map((p) => [p.id, p]));
  if (done(s)) {
    const gone = (s.departures?.gone ?? []).filter((x) => x.team === u).sort((a, b) => b.ovr - a.ovr);
    if (!gone.length) text(g, 'NOBODY LEFT', VIEW_W / 2, 120, { align: 'center', color: SOFT });
    gone.slice(v.top, v.top + DEPARTURE_ROWS).forEach((x, i) => {
      const y = LIST_Y + i * LINE;
      rowBg(g, v, i);
      const pk = picks.get(x.id);
      text(g, x.name.toUpperCase().slice(0, 14), cols.name, y, { color: '#ffffff', shadow: false });
      text(g, x.pos, cols.pos, y, { color: SOFT, shadow: false });
      text(g, String(x.ovr), cols.ovr, y, { color: ovrColor(x.ovr), shadow: false });
      text(g, x.why === 'grad' ? 'GRADUATED' : 'DECLARED EARLY', cols.why, y, { color: x.why === 'grad' ? SOFT : ORANGE, shadow: false });
      text(g, pk ? `RD ${pk.round}, NO. ${pk.pick}: ${pk.city.toUpperCase()}` : 'UNDRAFTED', cols.draft, y, { color: pk ? GOLD : DIM, shadow: false });
    });
    drawHint(g, v.note || 'A/D: TAB  W/S: SCROLL  SPACE: TO THE PORTAL  ESC: HUB');
    return;
  }
  const sr = seniorsLeaving(s, u);
  text(g, `${sr.length} SENIORS ARE OUT OF ELIGIBILITY AFTER THIS SEASON`, VIEW_W - 10, LIST_Y - 12, { align: 'right', color: SOFT, shadow: false });
  sr.slice(v.top, v.top + DEPARTURE_ROWS).forEach((a, i) => {
    const y = LIST_Y + i * LINE;
    rowBg(g, v, i);
    const ovr = overall(a.r, a.pos);
    text(g, shortName(a, 14), cols.name, y, { color: a.real ? GOLD : '#ffffff', shadow: false });
    text(g, a.pos, cols.pos, y, { color: SOFT, shadow: false });
    text(g, String(ovr), cols.ovr, y, { color: ovrColor(ovr), shadow: false });
    text(g, classLabel(a), cols.cls, y, { color: SOFT, shadow: false });
  });
  drawHint(g, v.note || 'A/D: TAB  W/S: SCROLL  SPACE: RUN THE DRAFT  ESC: HUB');
}

function drawDraft(g: CanvasRenderingContext2D, s: SeasonState, v: DeparturesView): void {
  const u = s.config.userTeamId;
  const picks = draftOf(s);
  if (!picks.length) {
    text(g, 'THE DRAFT COMES ONCE THE STAGE RUNS', VIEW_W / 2, 120, { align: 'center', color: SOFT });
    text(g, 'SEE WHO IS THINKING ABOUT LEAVING ON THE DECLARE WATCH', VIEW_W / 2, 136, { align: 'center', color: DIM });
    drawHint(g, v.note || 'A/D: TAB  SPACE: RUN THE DRAFT  ESC: HUB');
    return;
  }
  const cols = { pick: 10, rd: 46, city: 82, name: 206, pos: 358, school: 392, ovr: 540 };
  heads(g, cols, { pick: 'PICK', rd: 'RD', city: 'TEAM', name: 'PLAYER', pos: 'POS', school: 'SCHOOL', ovr: 'OVR' });
  const mine = picks.filter((p) => p.team === u).length;
  text(g, `${picks.length} PICKS, ${picks.filter((p) => p.early).length} EARLY ENTRANTS.  YOURS: ${mine}`, 10, LIST_Y + DEPARTURE_ROWS * LINE + 4, { color: mine ? GOLD : SOFT, shadow: false });
  picks.slice(v.top, v.top + DEPARTURE_ROWS).forEach((p, i) => {
    const y = LIST_Y + i * LINE;
    rowBg(g, v, i);
    const c = p.team === u ? GOLD : '#ffffff';
    text(g, String(p.pick), cols.pick, y, { color: c, shadow: false });
    text(g, String(p.round), cols.rd, y, { color: SOFT, shadow: false });
    text(g, p.city.toUpperCase(), cols.city, y, { color: SOFT, shadow: false });
    text(g, `${p.name.toUpperCase().slice(0, 17)}${p.early ? '*' : ''}`, cols.name, y, { color: c, shadow: false });
    text(g, p.pos, cols.pos, y, { color: SOFT, shadow: false });
    text(g, teamById(p.team).school.toUpperCase().slice(0, 16), cols.school, y, { color: c, shadow: false });
    text(g, String(p.ovr), cols.ovr, y, { color: ovrColor(p.ovr), shadow: false });
  });
  drawHint(g, v.note || 'A/D: TAB  W/S: SCROLL  * EARLY ENTRANT  SPACE: TO THE PORTAL  ESC: HUB');
}
