import { classLabel, heightLabel, type Athlete } from '../data/athletes';
import { starters, teamRatings, type Squad } from '../data/depth';
import { overall, OVR_WEIGHTS, POSITIONS, SLOT_POS, type Position } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import { VIEW_W } from '../engine/constants';
import { text } from './text';

const OFF_PAGE = ['QB', 'RB', 'FB', 'X', 'Z', 'SL', 'WR4', 'TE', 'TE2', 'LT', 'LG', 'C', 'RG', 'RT'];
const DEF_PAGE = ['DE1', 'DT1', 'DT2', 'DE2', 'WLB', 'MLB', 'SAM', 'CB1', 'CB2', 'NB', 'DIME', 'FS', 'SS', 'K', 'P'];
const PER_PAGE = 24;
const TOP = 62;
const LINE = 11;

/** The four ratings that weigh most in a position's overall. */
function keyRatings(pos: Position): RatingKey[] {
  return (Object.entries(OVR_WEIGHTS[pos]) as [RatingKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
}

export function shortName(a: Athlete, max = 15): string {
  const n = `${a.first[0]}. ${a.last}`.toUpperCase();
  return n.length > max ? n.slice(0, max) : n;
}

export function ovrColor(o: number): string {
  return o >= 90 ? '#ffd23f' : o >= 80 ? '#7dff9a' : o >= 70 ? '#ffffff' : o >= 60 ? '#cfd6df' : '#8fa0b8';
}

export function stars(n: number): string {
  return '*'.repeat(n);
}

export function rosterPages(squad: Squad): number {
  return 2 + Math.ceil(squad.athletes.length / PER_PAGE);
}

/** Team roster screen: starters with the ratings behind their overall, then the full roster with bios. */
export function drawRoster(g: CanvasRenderingContext2D, squad: Squad, page: number): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const t = squad.team;
  const tr = teamRatings(squad);
  g.fillStyle = t.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${t.school.toUpperCase()} ${t.mascot.toUpperCase()}`, 10, 6, { size: 8 });
  text(g, `${t.conference.toUpperCase()}  ${t.profile.record}`, 10, 18, { color: '#e6e6e6' });
  text(g, `OVR ${tr.ovr}  OFF ${tr.off}  DEF ${tr.def}  ST ${tr.st}`, VIEW_W - 10, 12, { align: 'right', color: '#ffd23f' });

  const pages = rosterPages(squad);
  const title = page === 0 ? 'OFFENSE' : page === 1 ? 'DEFENSE & SPECIAL TEAMS' : `ROSTER ${page - 1}/${pages - 2}`;
  text(g, `< ${title} >`, VIEW_W / 2, 38, { align: 'center', color: '#9ad7ff' });

  if (page < 2) {
    const st = starters(squad);
    text(g, 'SLOT  OVR NAME            CLASS  POS  KEY RATINGS', 10, 50, { color: '#5d6b80', shadow: false });
    (page === 0 ? OFF_PAGE : DEF_PAGE).forEach((slot, i) => {
      const a = st[slot];
      const y = TOP + i * LINE + 4;
      if (!a) {
        text(g, `${slot.padEnd(5)} --`, 10, y, { color: '#5d6b80' });
        return;
      }
      const pos = SLOT_POS[slot];
      const o = overall(a.r, pos);
      text(g, slot.padEnd(5), 10, y, { color: '#8fa0b8' });
      text(g, String(o).padStart(3), 50, y, { color: ovrColor(o) });
      text(g, shortName(a), 90, y, { color: a.real ? '#ffd23f' : '#ffffff' });
      text(g, classLabel(a).padEnd(6), 218, y, { color: '#cfd6df' });
      text(g, a.pos === pos ? a.pos : `${a.pos}*`, 274, y, { color: a.pos === pos ? '#cfd6df' : '#ff9a5a' });
      const keys = keyRatings(pos).map((k) => `${k.toUpperCase()} ${a.r[k]}`).join(' ');
      text(g, keys, 314, y, { color: '#9ad7ff' });
    });
    text(g, 'GOLD = REAL PLAYER   * = OUT OF POSITION   KEY = TOP OVR WEIGHTS', VIEW_W / 2, 330, {
      align: 'center', color: '#5d6b80', shadow: false,
    });
  } else {
    const order = [...squad.athletes].sort(
      (a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || overall(b.r, b.pos) - overall(a.r, a.pos),
    );
    const list = order.slice((page - 2) * PER_PAGE, (page - 1) * PER_PAGE);
    text(g, 'POS OVR NAME            CLASS  HT    WT  STARS POT HOMETOWN', 10, 50, { color: '#5d6b80', shadow: false });
    list.forEach((a, i) => {
      const y = TOP + i * LINE;
      const o = overall(a.r, a.pos);
      const hurt = a.injury && a.injury.weeks > 0;
      text(g, a.pos.padEnd(3), 10, y, { color: '#8fa0b8' });
      text(g, String(o).padStart(3), 42, y, { color: ovrColor(o) });
      text(g, shortName(a), 82, y, { color: hurt ? '#ff5a5a' : a.real ? '#ffd23f' : '#ffffff' });
      text(g, classLabel(a).padEnd(6), 210, y, { color: '#cfd6df' });
      text(g, heightLabel(a.heightIn), 266, y, { color: '#cfd6df' });
      text(g, String(a.weightLb), 314, y, { color: '#cfd6df' });
      text(g, stars(a.stars).padEnd(5), 346, y, { color: '#ffd23f' });
      text(g, String(a.potential), 394, y, { color: '#9ad7ff' });
      const home = `${a.hometown.city}, ${a.hometown.state}`.toUpperCase();
      text(g, home.length > 21 ? home.slice(0, 21) : home, 426, y, { color: '#cfd6df' });
    });
    text(g, `${squad.athletes.length} PLAYERS.  RED = INJURED.`, VIEW_W / 2, 330, {
      align: 'center', color: '#5d6b80', shadow: false,
    });
  }
  text(g, 'A / D: PAGE    ESC OR ENTER: BACK', VIEW_W / 2, 344, { align: 'center', color: '#8fa0b8', shadow: false });
}
