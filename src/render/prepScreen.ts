import type { Athlete } from '../data/athletes';
import { bangedUp, fitRatings, healthOf, healthy, starters, type Squad } from '../data/depth';
import { PLAYBOOK } from '../data/plays';
import { overall, SLOT_POS } from '../data/positions';
import { DEF_SLOTS, OFF_SLOTS, teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { teamLabel } from '../season/news';
import type { ScoutReport } from '../season/scouting';
import type { SeasonState } from '../season/types';
import { drawHint } from './hud';
import { drawMiniPlay, drawStar, type Box } from './playDiagram';
import { starRect } from './playbookScreen';
import { ovrColor, shortName } from './rosterScreen';
import { CHEVRON, chevron, inBox, wrap } from './teamScreen';
import { text } from './text';

/**
 * The weekly prep page: the next opponent at a glance, their two-deep, and the staff's scouting
 * report with the plays they like this week (star one to put it on the call screen).
 */

export const PREP_TABS = ['OPPONENT', 'ROSTER', 'SCOUTING'] as const;

export interface PrepView {
  tab: number;
  /** SCOUTING: first line shown. ROSTER: 0 starters, 1 backups. */
  scroll: number;
  page: number;
  mx: number;
  my: number;
  /** Built when the page opens; null with no game this week. */
  report: ScoutReport | null;
}

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';
const GREEN = '#7dff9a';
const RED = '#ff7a7a';
const ORANGE = '#ff9f43';

const TAB_Y = 32;
const TAB_H = 14;
const TOP = 54;
const LINE = 11;

// SCOUTING: the report on the left, the suggested plays down the right.
const REPORT_X = 12;
const REPORT_CHARS = 48;
const REPORT_ROWS = Math.floor((338 - TOP) / LINE);
const CARD_X = 424;
const CARD_W = VIEW_W - CARD_X - 6;
const CARD_H = 50;
const CARD_GAP = 3;

export function prepTabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  const i = Math.floor(x / (VIEW_W / PREP_TABS.length));
  return i >= 0 && i < PREP_TABS.length ? i : -1;
}

export function prepCardRect(i: number): Box {
  return { x: CARD_X, y: TOP + 10 + i * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H };
}

/** The report as wrapped lines, for drawing and for the scroll limit. */
export function reportLines(r: ScoutReport): { t: string; c: string }[] {
  const out: { t: string; c: string }[] = [];
  for (const s of r.sections) {
    if (out.length) out.push({ t: '', c: SOFT });
    out.push({ t: `${s.coach}: ${s.title}`, c: ACCENT });
    for (const it of s.items) {
      wrap(it.text, REPORT_CHARS - 2).forEach((t, i) => out.push({ t: `${i ? '  ' : '- '}${t}`, c: it.warn ? ORANGE : '#ffffff' }));
    }
    if (s.note) wrap(s.note, REPORT_CHARS).forEach((t) => out.push({ t, c: DIM }));
  }
  return out;
}

export function maxScroll(r: ScoutReport): number {
  return Math.max(0, reportLines(r).length - REPORT_ROWS);
}

export function drawPrep(g: CanvasRenderingContext2D, s: SeasonState, opp: Squad | null, v: PrepView, starred: Set<string>): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const r = v.report;
  const team = r ? teamById(r.opp) : teamById(s.config.userTeamId);
  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  if (!r || !opp) {
    text(g, 'WEEKLY PREP', 10, 6, { size: 8 });
    text(g, 'NO GAME THIS WEEK', VIEW_W / 2, 160, { align: 'center', color: SOFT });
    drawHint(g, 'ESC: BACK');
    return;
  }
  const site = r.game.neutral ? 'VS' : r.game.home === s.config.userTeamId ? 'VS' : '@';
  text(g, `WEEK ${s.week} PREP: ${site} ${r.rank ? `#${r.rank} ` : ''}${team.school.toUpperCase()} ${team.mascot.toUpperCase()}`, 10, 6, { size: 8 });
  text(g, `${r.record}  (${team.conference.toUpperCase()})${r.game.name ? `  ${r.game.name.toUpperCase()}` : ''}`, 10, 18, { color: '#e6e6e6' });
  text(g, `OVR ${r.ratings.opp.ovr}`, VIEW_W - 10, 12, { align: 'right', color: GOLD });

  const tw = VIEW_W / PREP_TABS.length;
  PREP_TABS.forEach((t, i) => {
    const on = i === v.tab;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * tw, TAB_Y, tw, TAB_H);
    }
    text(g, t, i * tw + tw / 2, TAB_Y + 3, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });

  switch (PREP_TABS[v.tab]) {
    case 'OPPONENT':
      drawOverview(g, r);
      drawHint(g, 'A/D: TAB  ESC: BACK');
      break;
    case 'ROSTER':
      drawRosterTab(g, opp, v.page);
      drawHint(g, `A/D: TAB  W/S: ${v.page ? 'STARTERS' : 'BACKUPS'}  ESC: BACK`);
      break;
    case 'SCOUTING':
      drawScouting(g, r, v, starred);
      drawHint(g, 'A/D: TAB  W/S: SCROLL  CLICK A STAR TO SAVE A PLAY  ESC: BACK');
      break;
  }
}

function drawOverview(g: CanvasRenderingContext2D, r: ScoutReport): void {
  const x = 20;
  let y = TOP;
  text(g, '          YOU   THEM', x, y, { color: DIM, shadow: false });
  for (const k of ['ovr', 'off', 'def', 'st'] as const) {
    y += LINE + 2;
    const us = r.ratings.user[k];
    const them = r.ratings.opp[k];
    text(g, k.toUpperCase(), x, y, { color: SOFT });
    text(g, String(us), x + 104, y, { align: 'right', color: us > them ? GREEN : '#ffffff' });
    text(g, String(them), x + 152, y, { align: 'right', color: them > us ? RED : '#ffffff' });
  }
  y += LINE * 2 + 4;
  text(g, 'THEIR IDENTITY', x, y, { color: ACCENT });
  y += LINE + 2;
  text(g, 'DEFENSE', x, y, { color: SOFT });
  wrap(r.defTag, 26).forEach((t, i) => text(g, t, x + 72, y + i * LINE));
  y += LINE * Math.max(1, wrap(r.defTag, 26).length) + 2;
  text(g, 'OFFENSE', x, y, { color: SOFT });
  wrap(r.offTag, 26).forEach((t, i) => text(g, t, x + 72, y + i * LINE));
  y += LINE * Math.max(1, wrap(r.offTag, 26).length) + LINE + 4;
  const a = r.averages;
  text(g, 'PER GAME', x, y, { color: ACCENT });
  y += LINE + 2;
  if (!a) text(g, 'NO GAMES PLAYED YET', x, y, { color: DIM, shadow: false });
  else {
    text(g, `${a.ppg.toFixed(1)} POINTS FOR, ${a.papg.toFixed(1)} AGAINST`, x, y);
    text(g, `${Math.round(a.ypg)} YARDS: ${Math.round(a.passYpg)} PASS, ${Math.round(a.rushYpg)} RUSH`, x, y + LINE);
    if (a.games < r.recent.length) text(g, `FROM ${a.games} OF THEIR GAMES`, x, y + LINE * 2, { color: DIM, shadow: false });
  }

  const rx = 340;
  y = TOP;
  text(g, 'RECENT GAMES', rx, y, { color: ACCENT });
  if (!r.recent.length) text(g, 'NONE YET', rx, y + LINE + 2, { color: DIM, shadow: false });
  r.recent.forEach((g0, i) => {
    const yy = y + (i + 1) * (LINE + 3);
    const won = g0.us > g0.them;
    text(g, `WK${String(g0.week).padStart(2)}`, rx, yy, { color: SOFT });
    text(g, `${g0.site.padEnd(3)}${teamLabel(g0.opp).toUpperCase().slice(0, 17)}`, rx + 40, yy);
    text(g, `${won ? 'W' : 'L'} ${g0.us}-${g0.them}${g0.ot ? ' OT' : ''}`, VIEW_W - 12, yy, { align: 'right', color: won ? GREEN : RED });
  });

}

/** Their starters (or their next man at each slot), offense on the left and defense on the right. */
function drawRosterTab(g: CanvasRenderingContext2D, opp: Squad, page: number): void {
  const on = starters(opp);
  const used = new Set(Object.values(on).map((a) => a.id));
  const byId = new Map(opp.athletes.map((a) => [a.id, a]));
  const backup = (slot: string): Athlete | undefined => {
    for (const id of opp.depth[slot] ?? []) {
      const a = byId.get(id);
      if (a && healthy(a) && !used.has(id)) return a;
    }
    return undefined;
  };
  const col = (slots: readonly string[], x: number, head: string) => {
    text(g, `${head} ${page ? 'BACKUPS' : 'STARTERS'}`, x, TOP, { color: ACCENT });
    text(g, 'SLOT  #  NAME              OVR', x, TOP + LINE + 2, { color: DIM, shadow: false });
    slots.forEach((slot, i) => {
      const a = page ? backup(slot) : on[slot];
      const y = TOP + (i + 2) * (LINE + 3);
      text(g, slot, x, y, { color: SOFT });
      if (!a) {
        text(g, '--', x + 48, y, { color: DIM, shadow: false });
        return;
      }
      const ovr = overall(fitRatings(a), SLOT_POS[slot]);
      text(g, String(a.num).padStart(2), x + 36, y, { color: SOFT });
      text(g, shortName(a, 16), x + 64, y, { color: a.real ? GOLD : '#ffffff' });
      text(g, String(ovr), x + 216, y, { align: 'right', color: ovrColor(ovr) });
      if (bangedUp(a)) text(g, `${Math.round(healthOf(a))}%`, x + 224, y, { color: ORANGE });
      else if (Math.abs(a.conf ?? 0) >= CHEVRON) chevron(g, x + 224, y + 2, (a.conf ?? 0) > 0);
    });
  };
  col([...OFF_SLOTS, 'K'], 12, 'OFFENSE');
  col([...DEF_SLOTS, 'P'], 332, 'DEFENSE');
  const out = opp.athletes.filter((a) => !healthy(a) && (Object.values(opp.depth).some((ids) => ids[0] === a.id)));
  if (out.length) {
    const names = out.slice(0, 5).map((a) => `${a.pos} ${shortName(a, 14)}`).join(', ');
    text(g, `OUT: ${names}`.slice(0, 78), 12, 324, { color: RED });
  }
}

function drawScouting(g: CanvasRenderingContext2D, r: ScoutReport, v: PrepView, starred: Set<string>): void {
  const lines = reportLines(r);
  lines.slice(v.scroll, v.scroll + REPORT_ROWS).forEach((l, i) => text(g, l.t, REPORT_X, TOP + i * LINE, { color: l.c }));
  if (lines.length > REPORT_ROWS) {
    // Scroll bar.
    const h = 338 - TOP;
    g.fillStyle = '#1f2a3a';
    g.fillRect(CARD_X - 10, TOP, 3, h);
    g.fillStyle = SOFT;
    const bh = Math.max(10, (h * REPORT_ROWS) / lines.length);
    g.fillRect(CARD_X - 10, TOP + ((h - bh) * v.scroll) / Math.max(1, lines.length - REPORT_ROWS), 3, bh);
  }
  text(g, 'STAFF PICKS THIS WEEK', CARD_X, TOP, { color: ACCENT });
  r.suggestions.forEach((sg, i) => {
    const p = PLAYBOOK.find((x) => x.id === sg.id)!;
    const b = prepCardRect(i);
    const hot = inBox(b, v.mx, v.my);
    g.fillStyle = hot ? '#1f2a3a' : '#151c27';
    g.fillRect(b.x, b.y, b.w, b.h);
    text(g, p.name.toUpperCase().slice(0, 16), b.x + 4, b.y + 4, { color: '#ffffff' });
    const star = starRect(b);
    drawStar(g, star.x + 3, star.y + 2, starred.has(p.id), inBox(star, v.mx, v.my));
    text(g, sg.why.slice(0, 25), b.x + 4, b.y + b.h - 11, { color: GOLD, shadow: false });
    drawMiniPlay(g, p, { x: b.x + 4, y: b.y + 15, w: b.w - 8, h: b.h - 28 }, false);
  });
}
