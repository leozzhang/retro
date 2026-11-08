import type { Athlete } from '../data/athletes';
import { starters, teamRatings, type Squad } from '../data/depth';
import { overall } from '../data/positions';
import { PLAYBOOK, playsOfKind, ROUTES, type PlayDef, type PlayKind, type ReadType, type RouteName, type RunScheme } from '../data/plays';
import type { OffSlot } from '../data/teams';
import { FIELD_W, VIEW_W } from '../engine/constants';
import { clamp } from '../engine/math';
import { alignY, personnelOf, resolvePlay, type ResolvedPlay } from '../game/resolvePlay';
import { drawHint } from './hud';
import { drawMiniPlay, drawStar, pullTurnLat, ROUTE_COLORS, type Box } from './playDiagram';
import { ovrColor } from './rosterScreen';
import { inBox, wrap } from './teamScreen';
import { text } from './text';

/**
 * The playbook page: every play as a card (STARRED, PASS, RUN, PLAY ACTION), and a play's detail
 * view: the user's current starters lined up in the formation, with each one's route or block drawn.
 */

export interface BookView {
  /** Index into `BOOK_TABS`. */
  tab: number;
  page: number;
  /** The play open in the detail view, or null on the card grid. */
  open: string | null;
  /** Detail view drawn mirrored. */
  flip: boolean;
  mx: number;
  my: number;
}

export const BOOK_TABS: { kind: PlayKind | 'starred'; label: string }[] = [
  { kind: 'starred', label: 'STARRED' },
  { kind: 'pass', label: 'PASS' },
  { kind: 'run', label: 'RUN' },
  { kind: 'pa', label: 'PLAY ACTION' },
];

const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const GOLD = '#ffd23f';

// Card grid, shared with the click handling in game.ts.
const TAB_Y = 32;
const TAB_H = 14;
const TAB_W = 120;
const COLS = 4;
const ROWS = 3;
export const BOOK_PAGE = COLS * ROWS;
const CARD_W = 152;
const CARD_H = 88;
const GAP_X = 6;
const GAP_Y = 5;
const GRID_X = (VIEW_W - (COLS * CARD_W + (COLS - 1) * GAP_X)) / 2;
const GRID_Y = 52;

// Detail view: the field on the left (offense moving up), the play and its players on the right.
const FX = 6;
const FY = 34;
const FW = 440;
const FH = 306;
/** Pixels per yard across the field: wide enough that the linemen's numbers don't overlap. */
const LAT = 12;
const PX = 454;
const PR = VIEW_W - 6;
const ROW_TOP = 152;
const ROW_H = 14;
export const STAR_BTN = { x: PX, y: 324, w: PR - PX, h: 15 };
const CHIP_W = 17;
const CHIP_H = 11;

export function bookTabAt(x: number, y: number): number {
  if (y < TAB_Y || y >= TAB_Y + TAB_H) return -1;
  const x0 = (VIEW_W - (BOOK_TABS.length * TAB_W + (BOOK_TABS.length - 1) * 4)) / 2;
  const i = Math.floor((x - x0) / (TAB_W + 4));
  return i >= 0 && i < BOOK_TABS.length && x - x0 - i * (TAB_W + 4) < TAB_W ? i : -1;
}

export function bookCardRect(i: number): Box {
  return { x: GRID_X + (i % COLS) * (CARD_W + GAP_X), y: GRID_Y + Math.floor(i / COLS) * (CARD_H + GAP_Y), w: CARD_W, h: CARD_H };
}

/** The clickable star in a card's top-right corner (the call screen's cards use it too). */
export function starRect(card: Box): Box {
  return { x: card.x + card.w - 15, y: card.y + 3, w: 13, h: 11 };
}

/** The card index on this page under the mouse, or -1. */
export function bookCardAt(x: number, y: number, n: number): number {
  for (let i = 0; i < n; i++) if (inBox(bookCardRect(i), x, y)) return i;
  return -1;
}

/** The plays on a tab: every starred play on STARRED, else that kind in playbook order. */
export function bookPlays(tab: number, starred: Set<string>): PlayDef[] {
  const kind = BOOK_TABS[tab].kind;
  return kind === 'starred' ? PLAYBOOK.filter((p) => starred.has(p.id)) : playsOfKind(kind);
}

export function bookPages(tab: number, starred: Set<string>): number {
  return Math.max(1, Math.ceil(bookPlays(tab, starred).length / BOOK_PAGE));
}

// ------------------------------------------------------------ jobs

const ROUTE_LABEL: Record<RouteName, string> = {
  go: 'GO', seam: 'SEAM', slant: 'SLANT', quickOut: 'OUT', deepOut: 'DEEP OUT', in: 'IN', post: 'POST',
  corner: 'CORNER', curl: 'CURL', hitch: 'HITCH', comeback: 'COMEBACK', flat: 'FLAT', drag: 'DRAG',
  wheel: 'WHEEL', swing: 'SWING', bubble: 'BUBBLE', block: 'BLOCK', cross: 'CROSS', glance: 'GLANCE',
  smoke: 'SMOKE', tunnel: 'TUNNEL', checkFlat: 'CHK FLAT', screen: 'SCREEN', angle: 'ANGLE',
  iz: 'CARRY', oz: 'CARRY', power: 'CARRY', toss: 'CARRY', paFake: 'PA FAKE', izDeep: 'CARRY',
  stretch: 'CARRY', counter: 'CARRY', trap: 'CARRY', draw: 'CARRY', iso: 'CARRY', sweep: 'CARRY',
  pitchPath: 'PITCH', lead: 'LEAD', kickOut: 'KICK OUT', leadWide: 'LEAD', slice: 'SLICE', qbLead: 'LEAD', arc: 'ARC',
};

const QB_JOB: Record<ReadType, string> = {
  none: 'PASS', handoff: 'HANDOFF', pitch: 'TOSS', zoneRead: 'READ', option: 'OPTION', rpo: 'RPO',
};

const LINE_JOB: Record<RunScheme, string> = { zone: 'ZONE', stretch: 'REACH', gap: 'DOWN', trap: 'DOWN', draw: 'DRAW', pin: 'PIN' };

const SCHEME_LABEL: Record<RunScheme, string> = { zone: 'ZONE', stretch: 'OUTSIDE ZONE', gap: 'GAP', trap: 'TRAP', draw: 'DRAW', pin: 'PIN AND PULL' };

const READ_LABEL: Record<ReadType, string> = {
  none: '', handoff: 'HANDOFF', pitch: 'TOSS', zoneRead: 'ZONE READ', option: 'SPEED OPTION', rpo: 'RPO',
};

/** One player's job on a play, in at most 8 characters: his route, or how he blocks. */
export function jobOf(p: PlayDef, rp: ResolvedPlay, slot: OffSlot): string {
  if (slot === 'QB') return p.qbRun ? 'KEEP' : p.kind === 'pa' && p.read === 'none' ? 'PA PASS' : QB_JOB[p.read];
  if (rp.pulls.some((pl) => pl.who === slot)) return 'PULL';
  const rn = rp.routes[slot];
  if (!rn || rn === 'block') {
    if (p.block === 'run') return rn ? 'BLOCK' : LINE_JOB[p.scheme?.run ?? 'zone'];
    return p.screen && !rn ? 'SCREEN' : 'PROTECT';
  }
  return ROUTE_LABEL[rn];
}

/** The line's scheme and the QB's read, e.g. "GAP RUN, PULL LG / RPO". */
export function schemeText(p: PlayDef, rp: ResolvedPlay): string {
  const parts: string[] = [];
  if (p.block === 'run') {
    const pulls = rp.pulls.length ? `, PULL ${rp.pulls.map((pl) => pl.who).join('+')}` : '';
    parts.push(`${SCHEME_LABEL[p.scheme?.run ?? 'zone']} BLOCKING${pulls}`);
  } else {
    const slide = p.scheme?.slide ? `, SLIDE ${p.scheme.slide.toUpperCase()}` : '';
    parts.push(p.screen ? 'SCREEN' : `${p.kind === 'pa' ? 'PLAY ACTION' : 'DROPBACK'}${slide}`);
  }
  if (p.qbRun) parts.push('QB RUN');
  else if (READ_LABEL[p.read]) parts.push(READ_LABEL[p.read]);
  return parts.join(' / ');
}

/** Panel order: passer and back, receivers left to right as drawn, then the line. */
const PANEL_SLOTS: OffSlot[] = ['QB', 'RB', 'X', 'SL', 'TE', 'Z', 'LT', 'LG', 'C', 'RG', 'RT'];

// ------------------------------------------------------------ draw

export function drawPlaybook(g: CanvasRenderingContext2D, squad: Squad, v: BookView, starred: Set<string>): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const t = squad.team;
  g.fillStyle = t.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${t.school.toUpperCase()} PLAYBOOK`, 10, 6, { size: 8 });
  text(g, `${PLAYBOOK.length} PLAYS  ${starred.size} STARRED`, 10, 18, { color: '#e6e6e6' });
  const tr = teamRatings(squad);
  text(g, `OFF ${tr.off}`, VIEW_W - 10, 6, { align: 'right', color: GOLD });

  const open = v.open ? PLAYBOOK.find((p) => p.id === v.open) : undefined;
  if (open) {
    const list = bookPlays(v.tab, starred);
    const at = list.findIndex((p) => p.id === open.id);
    text(g, `${BOOK_TABS[v.tab].label} ${at + 1}/${list.length}`, VIEW_W - 10, 18, { align: 'right', color: '#e6e6e6' });
    drawDetail(g, squad, open, v, starred.has(open.id));
    drawHint(g, `A/D: PREV/NEXT  SPACE: STAR  F: FLIP${v.flip ? ' (ON)' : ''}  ESC: PLAYBOOK`);
    return;
  }
  drawGrid(g, v, starred, t.colors.primary);
  drawHint(g, 'CLICK: OPEN PLAY  CLICK THE STAR TO SAVE IT  A/D: TAB  W/S: PAGE  ESC: BACK');
}

function drawGrid(g: CanvasRenderingContext2D, v: BookView, starred: Set<string>, primary: string): void {
  const x0 = (VIEW_W - (BOOK_TABS.length * TAB_W + (BOOK_TABS.length - 1) * 4)) / 2;
  BOOK_TABS.forEach((tb, i) => {
    const x = x0 + i * (TAB_W + 4);
    const on = i === v.tab;
    g.fillStyle = on ? primary : '#141b26';
    g.fillRect(x, TAB_Y, TAB_W, TAB_H);
    if (on) {
      g.fillStyle = GOLD;
      g.fillRect(x, TAB_Y + TAB_H - 2, TAB_W, 2);
    }
    const star = tb.kind === 'starred';
    text(g, tb.label, x + TAB_W / 2 + (star ? 5 : 0), TAB_Y + 3, { align: 'center', color: on ? '#ffffff' : SOFT, shadow: on ? undefined : false });
    if (star) drawStar(g, x + 18, TAB_Y + 3, on || starred.size > 0);
  });
  const pages = bookPages(v.tab, starred);
  const page = Math.min(v.page, pages - 1);
  if (pages > 1) text(g, `${page + 1}/${pages}`, VIEW_W - 8, TAB_Y + 3, { align: 'right', color: SOFT, shadow: false });

  const plays = bookPlays(v.tab, starred).slice(page * BOOK_PAGE, page * BOOK_PAGE + BOOK_PAGE);
  if (!plays.length) {
    text(g, 'NO STARRED PLAYS YET', VIEW_W / 2, 150, { size: 8, align: 'center', color: '#ffffff' });
    text(g, 'CLICK THE STAR ON ANY PLAY CARD TO ADD IT HERE.', VIEW_W / 2, 168, { align: 'center', color: SOFT, shadow: false });
    text(g, 'STARRED PLAYS GET THEIR OWN TAB IN THE GAME\'S PLAY CALLER.', VIEW_W / 2, 182, { align: 'center', color: SOFT, shadow: false });
    return;
  }
  const hover = bookCardAt(v.mx, v.my, plays.length);
  plays.forEach((p, i) => {
    const r = bookCardRect(i);
    const hot = hover === i;
    g.fillStyle = hot ? '#24324a' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = hot ? GOLD : primary;
    g.fillRect(r.x, r.y, r.w, 2);
    text(g, p.name.toUpperCase().slice(0, 16), r.x + 5, r.y + 5, { color: hot ? GOLD : '#ffffff' });
    text(g, `${p.formation.name.toUpperCase()} ${personnelOf(p.formation)}`.slice(0, 18), r.x + 5, r.y + 16, { color: SOFT, shadow: false });
    const sb = starRect(r);
    drawStar(g, sb.x + 3, sb.y + 2, starred.has(p.id), inBox(sb, v.mx, v.my));
    drawMiniPlay(g, p, { x: r.x + 6, y: r.y + 28, w: r.w - 14, h: r.h - 32 }, false);
  });
}

interface Layout {
  rp: ResolvedPlay;
  /** Screen x of a world y (across the field), screen y of a yard line relative to the ball. */
  sx: (lat: number) => number;
  sy: (dx: number) => number;
  /** Deepest yard line the field shows; routes are cut off there. */
  maxDx: number;
  /** Pixels per yard downfield. */
  down: number;
  holeLat: number;
  playSign: number;
  color: Partial<Record<OffSlot, string>>;
}

function layout(p: PlayDef, flip: boolean): Layout {
  const by = FIELD_W / 2;
  const rp = resolvePlay(p, by, flip);
  let minDx = rp.align.QB.dx - p.drop;
  let deep = 8;
  for (const [slot, a] of Object.entries(rp.align) as [OffSlot, (typeof rp.align)[OffSlot]][]) {
    minDx = Math.min(minDx, a.dx);
    const rn = rp.routes[slot];
    if (rn) for (const [dn] of ROUTES[rn].pts) deep = Math.max(deep, a.dx + dn);
  }
  if (p.qbPath) deep = Math.max(deep, p.qbPath[0]);
  const maxDx = Math.min(deep + 3, 30);
  const down = clamp(FH / (maxDx - minDx + 2.5), 6, 14);
  const margin = (FH - (maxDx - minDx + 2.5) * down) / 2; // short plays sit in the middle of the field
  const sx = (lat: number) => FX + FW / 2 + (lat - by) * LAT;
  const sy = (dx: number) => FY + FH - margin - (dx - minDx + 1.5) * down;

  // The hole: the end of the back's run path, or the QB's.
  let holeLat = by + rp.strongSign * 2;
  const rb = rp.routes.RB;
  if (rb && ROUTES[rb].run) {
    const ry = alignY(rp.align.RB, by);
    const last = ROUTES[rb].pts[ROUTES[rb].pts.length - 1];
    holeLat = ry + last[1] * (Math.sign(by - ry) || rp.strongSign);
  } else if (p.qbPath) holeLat = by + p.qbPath[1] * rp.strongSign;
  const playSign = Math.sign(holeLat - by) || rp.strongSign;

  const color: Partial<Record<OffSlot, string>> = {};
  let ci = 0;
  for (const slot of Object.keys(rp.align) as OffSlot[]) {
    const rn = rp.routes[slot];
    if (!rn || slot === 'QB' || rn === 'block') continue;
    color[slot] = ROUTES[rn].run ? '#ffffff' : ROUTE_COLORS[ci++ % ROUTE_COLORS.length];
  }
  return { rp, sx, sy, maxDx, down, holeLat, playSign, color };
}

type End = 'arrow' | 'tee' | 'dot' | 'none';

function path(g: CanvasRenderingContext2D, pts: { x: number; y: number }[], color: string, width: number, end: End, dash?: number[]): void {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.setLineDash(dash ?? []);
  g.beginPath();
  pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
  g.stroke();
  g.setLineDash([]);
  const b = pts[pts.length - 1];
  const a = pts[pts.length - 2] ?? b;
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / l;
  const uy = (b.y - a.y) / l;
  if (end === 'arrow') {
    g.beginPath();
    g.moveTo(b.x + ux * 4, b.y + uy * 4);
    g.lineTo(b.x - ux * 2 - uy * 4, b.y - uy * 2 + ux * 4);
    g.lineTo(b.x - ux * 2 + uy * 4, b.y - uy * 2 - ux * 4);
    g.closePath();
    g.fill();
  } else if (end === 'tee') {
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(b.x - uy * 5, b.y + ux * 5);
    g.lineTo(b.x + uy * 5, b.y - ux * 5);
    g.stroke();
  } else if (end === 'dot') {
    g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 4, 4);
  }
  g.lineWidth = 1;
}

function drawDetail(g: CanvasRenderingContext2D, squad: Squad, p: PlayDef, v: BookView, isStarred: boolean): void {
  const L = layout(p, v.flip);
  const { rp, sx, sy } = L;
  const by = FIELD_W / 2;
  const st = starters(squad);
  const who = (slot: OffSlot): Athlete | undefined => st[rp.cast[slot]];
  // A QB under center is drawn a chip's height behind the center so both numbers show.
  const qbDx = Math.min(rp.align.QB.dx, rp.align.C.dx - (CHIP_H + 3) / L.down);
  const at = (slot: OffSlot) => ({ lat: clamp(alignY(rp.align[slot], by), 1, FIELD_W - 1), dx: slot === 'QB' ? qbDx : rp.align[slot].dx });

  // The field: grass, a line every 5 yards, the line of scrimmage.
  g.fillStyle = '#1f4d2a';
  g.fillRect(FX, FY, FW, FH);
  g.save();
  g.beginPath();
  g.rect(FX, FY, FW, FH);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let d = -20; d <= 40; d += 5) {
    const y = Math.round(sy(d));
    if (d !== 0) g.fillRect(FX, y, FW, 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (const hash of [FIELD_W / 2 - 3.1, FIELD_W / 2 + 3.1]) {
    for (let d = -20; d <= 40; d++) g.fillRect(Math.round(sx(hash)), Math.round(sy(d)), 1, 1);
  }
  g.fillStyle = '#5ca8ff';
  g.fillRect(FX, Math.round(sy(0)), FW, 1);

  // Hover: a chip on the field or a row in the panel.
  let hover: OffSlot | null = null;
  for (const slot of PANEL_SLOTS) {
    const q = at(slot);
    if (Math.abs(v.mx - sx(q.lat)) <= CHIP_W / 2 && Math.abs(v.my - sy(q.dx)) <= CHIP_H / 2) hover = slot;
  }
  PANEL_SLOTS.forEach((slot, i) => {
    const y = ROW_TOP + i * ROW_H;
    if (v.mx >= PX && v.mx < PR && v.my >= y - 3 && v.my < y + ROW_H - 3) hover = slot;
  });

  const P = (dx: number, lat: number) => ({ x: sx(lat), y: sy(dx) });
  const pulled = new Set(rp.pulls.map((pl) => pl.who));
  const slideSign = p.scheme?.slide === 'weak' ? -rp.strongSign : p.scheme?.slide ? rp.strongSign : 0;
  const scheme = p.scheme?.run ?? 'zone';
  /** A short block from the player's spot: forward on runs (angled by the scheme), back on pass sets. */
  const blockMark = (slot: OffSlot, line: boolean) => {
    const q = at(slot);
    let dDown: number;
    let dLat: number;
    if (p.block === 'pass' || (line && scheme === 'draw')) {
      dDown = -1.4;
      dLat = slideSign * 0.8;
    } else if (!line) {
      dDown = 1.6;
      dLat = 0;
    } else {
      dDown = scheme === 'stretch' ? 1.1 : 1.6;
      dLat = (scheme === 'gap' || scheme === 'trap' ? -0.9 : scheme === 'stretch' ? 1.4 : 0.9) * L.playSign;
    }
    path(g, [P(q.dx, q.lat), P(q.dx + dDown, q.lat + dLat)], '#c9d3df', 1, 'tee');
  };

  for (const slot of PANEL_SLOTS) {
    if (slot === 'QB') continue;
    const q = at(slot);
    const rn = rp.routes[slot];
    if (pulled.has(slot)) {
      // Pull: flat behind the line to where he turns up (`pullTurnLat`), then up onto his man.
      const pl = rp.pulls.find((x) => x.who === slot)!;
      const ty = pullTurnLat(p, rp, by, L.holeLat, pl);
      const up = pl.job === 'kick' ? 0.8 : 2.5;
      path(g, [P(q.dx, q.lat), P(q.dx - 1, q.lat), P(q.dx - 1, ty), P(q.dx + up, ty)], '#ffffff', 1, 'tee', [3, 2]);
      continue;
    }
    if (!rn) {
      blockMark(slot, true);
      continue;
    }
    if (rn === 'block') {
      blockMark(slot, false);
      continue;
    }
    const def = ROUTES[rn];
    const side = Math.sign(by - q.lat) || rp.strongSign;
    const pts = [P(q.dx, q.lat), ...def.pts.map(([dn, ins]) => P(Math.min(q.dx + dn, L.maxDx + 2), clamp(q.lat + ins * side, 0, FIELD_W)))];
    const end: End = def.lead || def.thenBlock ? 'tee' : def.cont ? 'arrow' : 'dot';
    const col = L.color[slot] ?? '#ffffff';
    path(g, pts, col, def.run || hover === slot ? 2 : 1, end);
  }
  // The QB: a designed run's path, or his drop (the mesh point on handoffs).
  const qb = at('QB');
  if (p.qbPath) {
    path(g, [P(qb.dx, qb.lat), P(qb.dx - p.drop, qb.lat + rp.dropY), P(p.qbPath[0], L.holeLat)], '#ffffff', 2, 'arrow');
  } else if (p.drop > 0) {
    path(g, [P(qb.dx, qb.lat), P(qb.dx - p.drop, clamp(qb.lat + rp.dropY, 1, FIELD_W - 1))], '#ffffff', 1, 'dot', [2, 2]);
  }

  // The players: a chip with his number, in team colors (route color on the edge).
  for (const slot of PANEL_SLOTS) {
    const q = at(slot);
    const a = who(slot);
    const x = Math.round(sx(q.lat) - CHIP_W / 2);
    const y = Math.round(sy(q.dx) - CHIP_H / 2);
    g.fillStyle = hover === slot ? GOLD : L.color[slot] ?? (slot === 'QB' ? '#ffffff' : '#7d8796');
    g.fillRect(x - 1, y - 1, CHIP_W + 2, CHIP_H + 2);
    g.fillStyle = squad.team.colors.primary;
    g.fillRect(x, y, CHIP_W, CHIP_H);
    text(g, a ? String(a.num) : '--', x + CHIP_W / 2 + 1, y + 2, { align: 'center', color: '#ffffff', shadow: false });
  }
  // The ball.
  g.fillStyle = '#7a3e14';
  g.fillRect(Math.round(sx(by)) - 2, Math.round(sy(0)) - 9, 4, 3);
  g.restore();

  // Panel: the play, then each player's job.
  const x = PX;
  text(g, p.name.toUpperCase().slice(0, 20), x, FY + 2, { color: GOLD });
  text(g, `${p.formation.name.toUpperCase()}  ${personnelOf(p.formation)}`.slice(0, 22), x, FY + 14, { color: '#ffffff', shadow: false });
  const sch = wrap(schemeText(p, rp), 22).slice(0, 2);
  sch.forEach((l, i) => text(g, l, x, FY + 26 + i * 10, { color: '#9ad7ff', shadow: false }));
  const tip = wrap(p.tip.toUpperCase(), 22).slice(0, 5);
  tip.forEach((l, i) => text(g, l, x, FY + 50 + i * 10, { color: SOFT, shadow: false }));

  g.fillStyle = '#2a3647';
  g.fillRect(x, ROW_TOP - 14, PR - PX, 1);
  text(g, 'POS', x, ROW_TOP - 11, { color: DIM, shadow: false });
  text(g, 'NO', x + 32, ROW_TOP - 11, { color: DIM, shadow: false });
  text(g, 'NAME', x + 52, ROW_TOP - 11, { color: DIM, shadow: false });
  text(g, 'JOB', PR, ROW_TOP - 11, { align: 'right', color: DIM, shadow: false });
  PANEL_SLOTS.forEach((slot, i) => {
    const y = ROW_TOP + i * ROW_H;
    const a = who(slot);
    if (hover === slot) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(PX - 2, y - 3, PR - PX + 4, ROW_H);
    }
    text(g, rp.cast[slot], x, y, { color: SOFT, shadow: false });
    text(g, a ? String(a.num) : '--', x + 32, y, { color: DIM, shadow: false });
    if (a) text(g, a.last.toUpperCase().slice(0, 7), x + 52, y, { color: a.real ? GOLD : '#ffffff', shadow: false });
    text(g, jobOf(p, rp, slot), PR, y, { align: 'right', color: L.color[slot] ?? '#c9d3df', shadow: false });
  });
  // The hovered player's overall, under the list.
  const h = hover ? who(hover) : undefined;
  if (h) {
    const o = overall(h.r, h.pos);
    text(g, `${h.first[0]}. ${h.last}`.toUpperCase().slice(0, 15), x, ROW_TOP + 11 * ROW_H + 2, { color: '#ffffff', shadow: false });
    text(g, `${h.pos} ${o}`, PR, ROW_TOP + 11 * ROW_H + 2, { align: 'right', color: ovrColor(o), shadow: false });
  }

  const sb = STAR_BTN;
  const hot = inBox(sb, v.mx, v.my);
  g.fillStyle = isStarred ? '#3a3216' : hot ? '#24324a' : '#141b26';
  g.fillRect(sb.x, sb.y, sb.w, sb.h);
  drawStar(g, sb.x + 6, sb.y + 4, isStarred, hot);
  text(g, isStarred ? 'STARRED' : 'STAR THIS PLAY', sb.x + 18, sb.y + 4, { color: isStarred ? GOLD : hot ? '#ffffff' : SOFT, shadow: false });
}
