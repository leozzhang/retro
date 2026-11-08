import type { SimPlay } from './rules';
import type { SnapCredit } from '../season/cast';
import { storyClock, type GameStory, type StoryDrive } from '../season/story';
import type { KeyLevel } from '../season/types';

/**
 * Which simulated snaps are worth showing: touchdowns, turnovers, fourth downs, big plays, third
 * downs, sacks and stops, picked from a drive or a whole simulated game by the key-play setting.
 * Pure: it reads a story (season/story.ts) and draws no random numbers.
 */

export type { KeyLevel };
export const KEY_LEVELS: KeyLevel[] = ['off', 'lean', 'normal', 'full'];

/** The dynasty's levels, with their defaults for saves from before the setting. */
export function keyLevels(c: { keyPlays?: { sim?: KeyLevel; defense?: KeyLevel } } | undefined): { sim: KeyLevel; defense: KeyLevel } {
  return { sim: c?.keyPlays?.sim ?? 'off', defense: c?.keyPlays?.defense ?? 'normal' };
}

/**
 * - `defense`: a CPU drive in a game the user is playing (the user's stops count for more).
 * - `sim`: a simulated stretch of the user's game, both offenses.
 */
export type KeyView = 'defense' | 'sim';

export type KeyKind =
  | 'td' | 'int' | 'fumble' | 'fourthConv' | 'fourthStop' | 'explosive' | 'thirdConv' | 'thirdStop'
  | 'redZoneStop' | 'sack' | 'fg' | 'missedFg' | 'gain' | 'twoPt' | 'twoPtStop';

export interface KeyPlay {
  drive: StoryDrive;
  /** The snap. A drive sim without the score doesn't log its fourth-down tries, so those are rebuilt here. */
  play: SimPlay;
  /** Who made the snap (season/cast.ts); missing for a rebuilt fourth down or a drive without casting. */
  snap?: SnapCredit;
  kind: KeyKind;
  /** 3 always shows, 2 from NORMAL, 1 only on FULL. */
  priority: number;
}

/**
 * How many key plays each level shows: per drive (a CPU drive in a played game, or a drive of a
 * simulated stretch), and per simulated quarter. Priority-3 plays (scores, turnovers, fourth-down
 * stops) ignore the quarter cap.
 */
export const KEY_PLAYS = {
  perDrive: {
    defense: { off: 0, lean: 1, normal: 2, full: 4 },
    sim: { off: 0, lean: 1, normal: 2, full: 3 },
  },
  perQuarter: { off: 0, lean: 3, normal: 4, full: 7 },
  minPriority: { off: 9, lean: 3, normal: 2, full: 1 },
  /** Yards for a big play, and for a notable one (FULL only). */
  explosive: 20,
  gain: 12,
  /** A loss this big on a snap is shown as a sack. */
  sack: -3,
  /** A drive stopped this close (yards to the goal) is a red-zone stop. */
  redZone: 20,
  /** A third down converted from this far out is a priority play. */
  longThird: 7,
};

const isKick = (p: SimPlay) => !!(p.fg || p.punt);

/** The fourth-down tries `simulateDrive` resolves without a logged snap, rebuilt from the gaps between snaps. */
function withFourthDowns(d: StoryDrive): [SimPlay, SnapCredit | undefined][] {
  const out: [SimPlay, SnapCredit | undefined][] = [];
  const snaps = d.plays;
  for (let i = 0; i < snaps.length; i++) {
    const a = snaps[i];
    out.push([a, d.credit.snaps[i] ?? undefined]);
    // A logged 4th-down snap (a coach going for it) needs no rebuilding, nor does a played drive.
    if (d.live || isKick(a) || a.turnover || a.down === 4 || a.kneel) continue;
    const at = a.yard + a.gain;
    const toGo = a.toGo - a.gain;
    const b = snaps[i + 1];
    const go = { explosive: false, turnover: false, down: 4, toGo, yard: at, lev: 0 };
    if (b && !isKick(b) && b.yard > at && toGo > 0) out.push([{ ...go, gain: b.yard - at, t: b.t }, undefined]);
    else if (!b && d.result === 'DOWNS') out.push([{ ...go, gain: 0, t: a.t + 6 }, undefined]);
  }
  return out;
}

/** What a snap was, and how much it matters from this view (0: nothing to show). */
function classify(d: StoryDrive, p: SimPlay, snap: SnapCredit | undefined, last: boolean, view: KeyView): { kind: KeyKind; priority: number } | null {
  const T = KEY_PLAYS;
  const dfn = view === 'defense';
  // An overtime two-point try always shows: it can decide the game.
  if (d.try) return { kind: d.points ? 'twoPt' : 'twoPtStop', priority: 3 };
  // Field goals are scoring plays, made or missed: always shown.
  if (p.fg) return { kind: p.fg.made ? 'fg' : 'missedFg', priority: 3 };
  if (p.punt || p.kneel) return null;
  if (p.heave && !p.turnover && p.gain < 100 - p.yard) return null;
  if (p.turnover) return { kind: snap?.kind === 'fumble' ? 'fumble' : 'int', priority: 3 };
  if (p.yard + p.gain >= 100) return { kind: 'td', priority: 3 };
  const conv = p.gain >= p.toGo;
  if (p.down === 4) return conv ? { kind: 'fourthConv', priority: 2 } : { kind: 'fourthStop', priority: 3 };
  if (p.explosive || p.gain >= T.explosive) return { kind: 'explosive', priority: 2 };
  if (p.gain <= T.sack) return { kind: 'sack', priority: dfn ? 2 : 1 };
  if (p.down === 3) {
    if (conv) return { kind: 'thirdConv', priority: p.toGo >= T.longThird ? 2 : 1 };
    const redZone = last && 100 - p.yard <= T.redZone && d.result !== 'TOUCHDOWN';
    if (redZone) return { kind: 'redZoneStop', priority: dfn ? 2 : 1 };
    return { kind: 'thirdStop', priority: dfn ? 2 : 1 };
  }
  if (p.gain >= T.gain) return { kind: 'gain', priority: 1 };
  return null;
}

/** Every snap of a drive worth showing at some level, in order. */
export function driveEvents(d: StoryDrive, view: KeyView): KeyPlay[] {
  const plays = withFourthDowns(d);
  // The last snap before the drive's kick or end, for red-zone stops.
  let lastSnap = -1;
  plays.forEach(([p], i) => {
    if (!isKick(p)) lastSnap = i;
  });
  const out: KeyPlay[] = [];
  plays.forEach(([p, snap], i) => {
    const c = classify(d, p, snap, i === lastSnap, view);
    if (c) out.push({ drive: d, play: p, ...(snap ? { snap } : {}), ...c });
  });
  return out;
}

export const byImportance = (a: KeyPlay, b: KeyPlay) => b.priority - a.priority || Math.abs(b.play.gain) - Math.abs(a.play.gain);
const inOrder = (a: KeyPlay, b: KeyPlay) => a.play.t - b.play.t;

/** A drive's key plays at `level`, in order. */
export function pickDrive(d: StoryDrive, level: KeyLevel, view: KeyView): KeyPlay[] {
  const T = KEY_PLAYS;
  const ev = driveEvents(d, view).filter((k) => k.priority >= T.minPriority[level]);
  return ev.sort(byImportance).slice(0, T.perDrive[view][level]).sort(inOrder);
}

/** A simulated stretch's key plays at `level`, in order: each drive's picks, then each quarter's cap. */
export function pickGame(story: GameStory, level: KeyLevel): KeyPlay[] {
  const cap = KEY_PLAYS.perQuarter[level];
  const byQuarter = new Map<number, KeyPlay[]>();
  for (const d of story.drives) {
    for (const k of pickDrive(d, level, 'sim')) {
      const q = storyClock(d, k.play.t).quarter;
      const list = byQuarter.get(q) ?? [];
      list.push(k);
      byQuarter.set(q, list);
    }
  }
  const out: KeyPlay[] = [];
  for (const q of [...byQuarter.keys()].sort((a, b) => a - b)) {
    const list = byQuarter.get(q)!.sort(byImportance);
    const must = list.filter((k) => k.priority >= 3);
    const rest = list.filter((k) => k.priority < 3).slice(0, Math.max(0, cap - must.length));
    out.push(...[...must, ...rest].sort((a, b) => story.drives.indexOf(a.drive) - story.drives.indexOf(b.drive) || inOrder(a, b)));
  }
  return out;
}

// ------------------------------------------------------------ captions

export const KEY_TITLE: Record<KeyKind, string> = {
  td: 'TOUCHDOWN', int: 'INTERCEPTION', fumble: 'FUMBLE', fourthConv: '4TH DOWN CONVERSION', fourthStop: 'STOPPED ON 4TH DOWN',
  explosive: 'BIG PLAY', thirdConv: '3RD DOWN CONVERSION', thirdStop: 'STOPPED ON 3RD DOWN', redZoneStop: 'RED ZONE STOP',
  sack: 'SACK', fg: 'FIELD GOAL', missedFg: 'FIELD GOAL NO GOOD', gain: 'NICE GAIN', twoPt: 'TWO-POINT TRY GOOD', twoPtStop: 'TWO-POINT TRY STOPPED',
};

const ORD = ['1ST', '2ND', '3RD', '4TH'];

/** The spot from the offense's side: its own half by its abbreviation, the other half by the defense's. */
export function spotLabel(yard: number, offAbbr: string, defAbbr: string): string {
  const y = Math.round(yard);
  if (y === 50) return 'MIDFIELD';
  return y < 50 ? `${offAbbr} ${y}` : `${defAbbr} ${100 - y}`;
}

/** "3RD & 7" (or "& GOAL"), for a snap. */
export function downText(p: SimPlay): string {
  const ord = ORD[Math.min(3, Math.max(1, p.down) - 1)];
  if (p.yard + p.toGo >= 100) return `${ord} & GOAL`;
  return `${ord} & ${Math.max(1, Math.round(p.toGo))}`;
}

/** Yards the snap is shown for (a touchdown stops at the goal line). */
export function shownGain(p: SimPlay): number {
  return Math.min(p.gain, 100 - p.yard);
}

/** Who made the play, as cast: the carrier or target and, for an interception or sack, the defender. */
export function creditFor(k: KeyPlay): SnapCredit | undefined {
  return k.snap;
}
