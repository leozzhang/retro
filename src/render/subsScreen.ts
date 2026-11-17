import { fitRatings, healthOf, type Lineup, type Squad } from '../data/depth';
import { overall, SLOT_POS } from '../data/positions';
import type { Team } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { SIDE_SLOTS, subCandidates, type SubSide } from '../game/lineup';
import { ovrColor } from './rosterScreen';
import { inBox } from './teamScreen';
import { text, textWidth } from './text';

/**
 * The subs panel over the call screen (docs/SUBS.md): the side's slots laid out like a formation on top,
 * the chosen slot's candidates below. The play clock keeps running behind it.
 */

export interface SubsView {
  side: SubSide;
  slot: string;
  scroll: number;
  mx: number;
  my: number;
}

export function newSubsView(side: SubSide = 'off'): SubsView {
  return { side, slot: SIDE_SLOTS[side][0], scroll: 0, mx: -1, my: -1 };
}

export function setSubsTab(v: SubsView, side: SubSide): void {
  v.side = side;
  v.slot = SIDE_SLOTS[side][0];
  v.scroll = 0;
}

const SLOT_LABEL: Record<string, string> = { SL: 'SLOT' };
export function slotLabel(slot: string): string {
  return SLOT_LABEL[slot] ?? slot;
}

const PANEL = { x: 10, y: 20, w: 620, h: 326 };
const TABS: { side: SubSide; label: string }[] = [
  { side: 'off', label: 'OFFENSE' }, { side: 'def', label: 'DEFENSE' }, { side: 'st', label: 'SPECIAL' },
];
export function subsTabRect(i: number) {
  return { x: 232 + i * 60, y: 24, w: 56, h: 12 };
}

/** The "U SUBS" chip under the tempo marker on the call screen. */
export const SUBS_CHIP = { x: VIEW_W - 60, y: 50, w: 56, h: 12 };
export const SUBS_DONE = { x: 556, y: 328, w: 66, h: 14 };

const CHIP_W = 80;
const CHIP_H = 22;
const PKG_Y = 148;
/** Each slot's chip center, by side: the line across the top, the backs or second level, then the packages. */
const SPOTS: Record<SubSide, Record<string, [number, number]>> = {
  off: {
    X: [62, 56], LT: [152, 56], LG: [236, 56], C: [320, 56], RG: [404, 56], RT: [488, 56], Z: [578, 56],
    SL: [110, 84], QB: [320, 84], TE: [530, 84], RB: [320, 112],
    FB: [220, PKG_Y], TE2: [320, PKG_Y], WR4: [420, PKG_Y],
  },
  def: {
    CB1: [62, 56], DE1: [194, 56], DT1: [278, 56], DT2: [362, 56], DE2: [446, 56], CB2: [578, 56],
    NB: [110, 84], WLB: [278, 84], MLB: [362, 84], FS: [236, 112], SS: [404, 112],
    SAM: [270, PKG_Y], DIME: [370, PKG_Y],
  },
  st: { K: [270, 84], P: [370, 84] },
};
const PACKAGES = new Set(['FB', 'TE2', 'WR4', 'SAM', 'DIME']);

function chipRect(side: SubSide, slot: string) {
  const [cx, y] = SPOTS[side][slot];
  return { x: cx - CHIP_W / 2, y, w: CHIP_W, h: CHIP_H };
}

export function slotAt(side: SubSide, x: number, y: number): string | undefined {
  return SIDE_SLOTS[side].find((s) => SPOTS[side][s] && inBox(chipRect(side, s), x, y));
}

const LIST_Y = 198;
const ROW_H = 11;
export const SUB_ROWS = 11;
export function subRowAt(x: number, y: number): number {
  if (x < PANEL.x + 4 || x > PANEL.x + PANEL.w - 4 || y < LIST_Y) return -1;
  const i = Math.floor((y - LIST_Y) / ROW_H);
  return i < SUB_ROWS ? i : -1;
}

export function drawSubsChip(g: CanvasRenderingContext2D, hover: boolean): void {
  const r = SUBS_CHIP;
  g.fillStyle = hover ? 'rgba(40,52,70,0.95)' : 'rgba(8,10,14,0.85)';
  g.fillRect(r.x, r.y, r.w, r.h);
  text(g, 'U SUBS', r.x + r.w / 2, r.y + 2, { align: 'center', color: hover ? '#ffd23f' : '#cfd6df', shadow: false });
}

export interface SubsDraw {
  v: SubsView;
  squad: Squad;
  lineup: Lineup;
  /** The lineup when the huddle formed: slots that differ are marked as changed. */
  huddle: Lineup;
  out: ReadonlySet<string>;
  team: Team;
  /** The play clock, or null when it isn't running (a kickoff). */
  clock: { text: string; secs: number } | null;
  /** The user's defense is on the field next (a kickoff, or the panel's DEFENSE tab between plays). */
  note: string;
}

export function drawSubs(g: CanvasRenderingContext2D, d: SubsDraw): void {
  const { v, squad, lineup } = d;
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, VIEW_W, 360);
  g.fillStyle = 'rgba(10,14,20,0.96)';
  g.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  g.fillStyle = d.team.colors.primary;
  g.fillRect(PANEL.x, PANEL.y, PANEL.w, 2);

  text(g, 'SUBSTITUTIONS', PANEL.x + 8, 26, { color: '#ffffff' });
  TABS.forEach((t, i) => {
    const r = subsTabRect(i);
    const on = t.side === v.side;
    g.fillStyle = on ? d.team.colors.primary : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (on) {
      g.fillStyle = '#ffd23f';
      g.fillRect(r.x, r.y + r.h - 2, r.w, 2);
    }
    text(g, t.label, r.x + r.w / 2, r.y + 3, { size: 6, align: 'center', color: on ? '#ffffff' : '#8fa0b8', shadow: false });
  });
  const clock = d.clock ? `PLAY CLOCK ${d.clock.text}` : 'NO PLAY CLOCK';
  text(g, clock, PANEL.x + PANEL.w - 8, 26, { align: 'right', color: d.clock && d.clock.secs <= 10 ? '#ff5a5a' : '#cfd6df' });

  // The formation: the field behind it, the packages' row below a rule.
  g.fillStyle = '#16301f';
  g.fillRect(PANEL.x + 4, 42, PANEL.w - 8, 130);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  if (v.side !== 'st') {
    g.fillRect(PANEL.x + 4, PKG_Y - 8, PANEL.w - 8, 1);
    text(g, 'PACKAGES', PANEL.x + 10, PKG_Y + 2, { size: 6, color: '#8fa0b8', shadow: false });
  }
  const hoverSlot = slotAt(v.side, v.mx, v.my);
  for (const slot of SIDE_SLOTS[v.side]) {
    if (!SPOTS[v.side][slot]) continue;
    const r = chipRect(v.side, slot);
    const a = byId.get(lineup[slot] ?? '');
    const sel = slot === v.slot;
    const changed = lineup[slot] !== d.huddle[slot];
    g.fillStyle = changed ? '#1f4a2c' : hoverSlot === slot ? '#25324a' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    if (sel) {
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    const label = `${slotLabel(slot)}${a ? ` #${a.num}` : ''}`;
    text(g, label, r.x + 3, r.y + 3, { size: 6, color: PACKAGES.has(slot) ? '#9ad7ff' : '#8fa0b8', shadow: false });
    if (!a) {
      text(g, '---', r.x + 3, r.y + 12, { color: '#ff5a5a', shadow: false });
      continue;
    }
    const ovr = overall(fitRatings(a), SLOT_POS[slot]);
    text(g, String(ovr), r.x + r.w - 3, r.y + 3, { size: 6, align: 'right', color: ovrColor(ovr), shadow: false });
    text(g, fit(g, a.last.toUpperCase(), r.w - 12, 8), r.x + 3, r.y + 12, { color: '#ffffff', shadow: false });
    if (healthOf(a) < 100) {
      g.fillStyle = '#ff9f43';
      g.fillRect(r.x + r.w - 6, r.y + r.h - 6, 3, 3);
    }
  }

  // The chosen slot's candidates.
  const now = byId.get(lineup[v.slot] ?? '');
  const head = `${slotLabel(v.slot)}${PACKAGES.has(v.slot) ? ' (PACKAGE)' : ''}: ${now ? `#${now.num} ${now.first[0]}. ${now.last}`.toUpperCase() : 'NOBODY'}`;
  text(g, head, PANEL.x + 8, 178, { color: '#ffd23f' });
  const cols = { num: 18, name: 46, pos: 186, style: 220, ovr: 380, hp: 414, tag: 452 };
  for (const [k, s] of [['num', '#'], ['name', 'NAME'], ['pos', 'POS'], ['style', 'STYLE'], ['ovr', 'OVR'], ['hp', 'HEALTH']] as const) {
    text(g, s, cols[k], 189, { size: 6, color: '#8fa0b8', shadow: false });
  }
  const rows = subCandidates(squad, lineup, v.slot, d.out);
  const hoverRow = subRowAt(v.mx, v.my);
  rows.slice(v.scroll, v.scroll + SUB_ROWS).forEach((row, i) => {
    const y = LIST_Y + i * ROW_H;
    const here = row.onAt === v.slot;
    if (i === hoverRow && !here) {
      g.fillStyle = '#25324a';
      g.fillRect(PANEL.x + 4, y - 1, PANEL.w - 8, ROW_H);
    }
    const dim = row.natural ? '#ffffff' : '#8fa0b8';
    text(g, String(row.a.num), cols.num, y, { color: dim, shadow: false });
    text(g, fit(g, `${row.a.first[0]}. ${row.a.last}`.toUpperCase(), cols.pos - cols.name - 6, 8), cols.name, y, { color: dim, shadow: false });
    text(g, row.a.pos, cols.pos, y, { color: dim, shadow: false });
    text(g, fit(g, row.style.toUpperCase(), cols.ovr - cols.style - 6, 8), cols.style, y, { color: dim, shadow: false });
    text(g, String(row.ovr), cols.ovr, y, { color: ovrColor(row.ovr), shadow: false });
    if (row.health < 100) text(g, String(row.health), cols.hp, y, { color: '#ff9f43', shadow: false });
    const tag = here ? 'ON FIELD' : row.onAt ? `IN AT ${slotLabel(row.onAt)}: SWAP` : row.natural ? '' : 'OUT OF POSITION';
    if (tag) text(g, tag, cols.tag, y + 1, { size: 6, color: here ? '#7dff9a' : row.onAt ? '#9ad7ff' : '#ff9f43', shadow: false });
  });
  if (rows.length > SUB_ROWS) {
    text(g, `${v.scroll + 1}-${Math.min(rows.length, v.scroll + SUB_ROWS)} OF ${rows.length}  WHEEL TO SCROLL`, PANEL.x + PANEL.w - 8, 178, {
      size: 6, align: 'right', color: '#8fa0b8', shadow: false,
    });
  }

  text(g, `CLICK A SLOT, THEN WHO GOES IN.  Q/E SIDE  ESC DONE.  ${d.note}`, PANEL.x + 8, 332, { size: 6, color: '#8fa0b8', shadow: false });
  const b = SUBS_DONE;
  g.fillStyle = inBox(b, v.mx, v.my) ? '#ffd23f' : d.team.colors.primary;
  g.fillRect(b.x, b.y, b.w, b.h);
  text(g, 'DONE', b.x + b.w / 2, b.y + 3, { align: 'center', color: inBox(b, v.mx, v.my) ? '#000000' : '#ffffff', shadow: false });
}

/** `s` cut to fit `w` pixels at `size`. */
function fit(g: CanvasRenderingContext2D, s: string, w: number, size: number): string {
  let out = s;
  while (out.length > 1 && textWidth(g, out, size) > w) out = out.slice(0, -1);
  return out;
}
