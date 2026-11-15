import type { PlayDef } from '../data/plays';
import { VIEW_H, VIEW_W } from '../engine/constants';
import { drawMiniPlay } from './playDiagram';
import { text } from './text';

/**
 * The audible picker (Esc before the snap), drawn over the live field so the defense can still be read: a strip
 * of the plays in the personnel on the field, the formation he's in first. A card in that formation is a quiet
 * CHECK (nobody moves, the defense can't see it); one in another formation is a SHIFT (everyone moves, and the
 * defense sees it). See docs/DEFENSE.md, "The presnap".
 */
export const AUDIBLE_TABS = [
  { kind: 'all', label: 'ALL' },
  { kind: 'pass', label: 'PASS' },
  { kind: 'run', label: 'RUN' },
  { kind: 'pa', label: 'PA' },
] as const;
export type AudibleKind = (typeof AUDIBLE_TABS)[number]['kind'];

/** Cards on one page of the strip. */
export const AUDIBLE_PAGE = 4;
const W = 150;
const H = 58;
const GAP = 6;
const X0 = (VIEW_W - (AUDIBLE_PAGE * W + (AUDIBLE_PAGE - 1) * GAP)) / 2;
const Y0 = VIEW_H - 24 - H;
const HEAD_Y = Y0 - 12;

export function audibleCardRect(i: number) {
  return { x: X0 + i * (W + GAP), y: Y0, w: W, h: H };
}

export interface AudibleView {
  plays: PlayDef[];
  page: number;
  tab: number;
  hover: number;
  /** The play called now, his flip, and the personnel on the field. */
  now: PlayDef;
  flip: boolean;
  pers: string;
}

const pageCount = (v: AudibleView) => Math.max(1, Math.ceil(v.plays.length / AUDIBLE_PAGE));

/** The cards on the current page. */
export function audiblePage(v: AudibleView): PlayDef[] {
  const page = Math.min(v.page, pageCount(v) - 1);
  return v.plays.slice(page * AUDIBLE_PAGE, page * AUDIBLE_PAGE + AUDIBLE_PAGE);
}

export function drawAudible(g: CanvasRenderingContext2D, v: AudibleView): void {
  // The header: personnel, tabs, paging.
  g.fillStyle = 'rgba(10, 14, 22, 0.82)';
  g.fillRect(X0 - 4, HEAD_Y - 3, VIEW_W - 2 * (X0 - 4), H + 18);
  text(g, `AUDIBLE: ${v.pers} PERSONNEL`, X0, HEAD_Y, { color: '#ffd23f', shadow: false });
  let x = X0 + 186;
  AUDIBLE_TABS.forEach((t, i) => {
    text(g, t.label, x, HEAD_Y, { color: i === v.tab ? '#ffffff' : '#5d6b80', shadow: false });
    x += t.label.length * 8 + 10;
  });
  const pages = pageCount(v);
  text(g, `Q/E TAB  W/S ${Math.min(v.page, pages - 1) + 1}/${pages}  F FLIP  ESC BACK`, VIEW_W - X0, HEAD_Y, { align: 'right', color: '#8fa0b8', shadow: false });

  const cards = audiblePage(v);
  if (!cards.length) text(g, 'NO PLAYS HERE IN THIS PERSONNEL', VIEW_W / 2, Y0 + H / 2 - 4, { align: 'center', color: '#8fa0b8', shadow: false });
  cards.forEach((p, i) => {
    const r = audibleCardRect(i);
    const hot = v.hover === i;
    const called = p === v.now;
    const shift = p.formation !== v.now.formation;
    g.fillStyle = hot ? '#24324a' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = shift ? '#ffb347' : '#5fd38d';
    g.fillRect(r.x, r.y, r.w, 2);
    if (called) {
      g.strokeStyle = '#ffffff';
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    text(g, `${i + 1} ${p.name.toUpperCase()}`.slice(0, 18), r.x + 4, r.y + 5, { color: hot ? '#ffd23f' : '#ffffff', shadow: false });
    const tag = called ? 'CALLED' : shift ? 'SHIFT' : 'CHECK';
    text(g, p.formation.name.toUpperCase().slice(0, 11), r.x + 4, r.y + 15, { color: '#8fa0b8', shadow: false });
    text(g, tag, r.x + r.w - 4, r.y + 15, { align: 'right', color: shift ? '#ffb347' : '#5fd38d', shadow: false });
    drawMiniPlay(g, p, { x: r.x + 6, y: r.y + 25, w: r.w - 12, h: r.h - 28 }, v.flip);
  });
}
