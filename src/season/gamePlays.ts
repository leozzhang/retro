import type { Athlete } from '../data/athletes';
import type { SimPlay } from '../game/rules';
import { byImportance, driveEvents, shownGain, type KeyPlay } from '../game/keyPlays';
import type { Credited } from './story';
import { storyClock, type GameStory, type StoryDrive } from './story';
import type { GamePlay } from './types';

/**
 * A game's key plays for its game page (render/gameScreen.ts), from its story (season/story.ts):
 * every scoring play, turnover and stop that the key-play rules always show, plus the biggest of
 * the rest. Pure: it reads the story and draws no random numbers. Docs: docs/GAMES.md.
 */

/** `extra`: plays kept beyond the scores, turnovers and stops, by importance. */
export const GAME_PLAYS = { extra: 3 };

const SCORING = new Set(['td', 'fg', 'twoPt']);

/** Each team's players on the field by slot, to put ids on the story's credited names. */
export type OnField = Record<string, Record<string, Athlete>>;

/** A played game's snaps the defense scored on (a pick six, a return, a safety): its points and the play's kind. */
export type Against = Map<SimPlay, { pts: number; kind: 'pick6' | 'returnTd' | 'safety' }>;

/** The team a play's points went to. */
export const scorer = (p: GamePlay): string => p.for ?? p.off;

const idOf = (on: Record<string, Athlete> | undefined, c: Credited | undefined): string | undefined => (c ? on?.[c.slot]?.id : undefined);

/** Points a play scored: a touchdown or try carries the drive's points, a field goal 3. */
function pointsOf(k: KeyPlay): number {
  if (k.kind === 'td' || k.kind === 'twoPt') return k.drive.points;
  return k.kind === 'fg' ? 3 : 0;
}

function toPlay(story: GameStory, on: OnField, k: KeyPlay, against?: Against): GamePlay {
  const d = k.drive;
  const def = d.off === story.home ? story.away : story.home;
  const c = storyClock(d, k.play.t);
  const ag = against?.get(k.play);
  const pts = ag ? ag.pts : pointsOf(k);
  // Points before the snap: the drive's start. A defensive score ends a drive, after anything the
  // offense scored on it (a return of the kickoff after its touchdown).
  const before = [d.score[story.home] ?? 0, d.score[story.away] ?? 0];
  if (ag) before[d.off === story.home ? 0 : 1] += d.points;
  const home = (ag ? def : d.off) === story.home;
  const s = k.snap;
  const fg = k.play.fg;
  const out: GamePlay = {
    q: c.quarter, time: Math.round(c.time), off: d.off, kind: ag ? ag.kind : k.kind,
    yds: fg ? fg.dist : Math.round(shownGain(k.play)), yard: Math.round(k.play.yard), down: k.play.down, toGo: Math.round(k.play.toGo),
    pts, score: [before[0] + (home ? pts : 0), before[1] + (home ? 0 : pts)],
  };
  if (ag) out.for = def;
  const lev = Math.round((k.play.lev ?? 0) * 100) / 100;
  if (lev) out.lev = lev;
  if (s?.pass) out.pass = true;
  const who = fg ? on[d.off]?.K?.id : idOf(on[d.off], s?.who);
  if (who) out.who = who;
  const by = idOf(on[def], s?.by);
  if (by) out.by = by;
  return out;
}

/** A scoring drive whose score the key plays missed (an unlogged fourth-down score): its last snap, as the score. */
function missedScore(d: StoryDrive): KeyPlay | null {
  if (d.points <= 0 || !d.plays.length) return null;
  const i = d.plays.length - 1;
  const p = d.plays[i];
  const kind = d.try ? 'twoPt' : d.result === 'FIELD GOAL' ? 'fg' : 'td';
  const snap = d.credit.snaps[i] ?? undefined;
  return { drive: d, play: { ...p, gain: Math.max(p.gain, 100 - p.yard) }, ...(snap ? { snap } : {}), kind, priority: 3 };
}

/** The game's key plays, in order. `against`: a played game's defensive scores, always kept. */
export function gamePlays(story: GameStory, on: OnField, against?: Against): GamePlay[] {
  const keep: KeyPlay[] = [];
  const rest: KeyPlay[] = [];
  for (const d of story.drives) {
    const ev = driveEvents(d, 'sim');
    for (const k of ev) (k.priority >= 3 || against?.has(k.play) ? keep : rest).push(k);
    d.plays.forEach((p, i) => {
      if (!against?.has(p) || ev.some((k) => k.play === p)) return;
      const snap = d.credit.snaps[i] ?? undefined;
      keep.push({ drive: d, play: p, ...(snap ? { snap } : {}), kind: 'sack', priority: 3 });
    });
    if (d.points > 0 && !ev.some((k) => SCORING.has(k.kind))) {
      const m = missedScore(d);
      if (m) keep.push(m);
    }
  }
  keep.push(...rest.sort(byImportance).slice(0, GAME_PLAYS.extra));
  const order = new Map(story.drives.map((d, i) => [d, i]));
  keep.sort((a, b) => order.get(a.drive)! - order.get(b.drive)! || a.play.t - b.play.t);
  return keep.map((k) => toPlay(story, on, k, against));
}

/** Points by quarter for (home, away), from a game's scoring plays: four quarters, then one total for overtime when there was any. */
export function lineScore(plays: GamePlay[], home: string, ot: number): { home: number[]; away: number[] } {
  const n = ot ? 5 : 4;
  const out = { home: Array<number>(n).fill(0), away: Array<number>(n).fill(0) };
  for (const p of plays) {
    if (!p.pts) continue;
    const i = Math.min(n, p.q) - 1;
    (scorer(p) === home ? out.home : out.away)[i] += p.pts;
  }
  return out;
}

/** "J. SMITH" from "John Smith". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.toUpperCase();
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`.toUpperCase();
}

/**
 * A play's line on the game page: "J. SMITH 34-YD TD PASS FROM C. JONES". `name` gives a player's
 * name by id (from the box score); `passer` the offense's passer.
 */
export function playCaption(p: GamePlay, name: (id: string) => string | undefined, passer?: string): string {
  const who = p.who ? name(p.who) : undefined;
  const by = p.by ? name(p.by) : undefined;
  const w = who ? shortName(who) : '';
  const b = by ? shortName(by) : '';
  const qb = passer ? shortName(passer) : '';
  const yd = `${Math.abs(p.yds)}-YD`;
  const lead = (s: string) => (w ? `${w} ${s}` : s);
  switch (p.kind) {
    case 'td':
      return p.pass ? `${lead(`${yd} TD PASS`)}${qb && qb !== w ? ` FROM ${qb}` : ''}` : lead(`${yd} TD RUN`);
    case 'fg':
      return lead(`${yd} FIELD GOAL`);
    case 'missedFg':
      return lead(`${yd} FIELD GOAL NO GOOD`);
    case 'int':
      return b ? `INTERCEPTED BY ${b}` : 'INTERCEPTED';
    case 'pick6':
      return b ? `${b} PICK SIX` : 'PICK SIX';
    case 'returnTd':
      return 'RETURNED FOR A TOUCHDOWN';
    case 'safety':
      return 'SAFETY';
    case 'fumble':
      return lead('FUMBLES, DEFENSE RECOVERS');
    case 'sack':
      return `${b ? `SACK BY ${b}` : 'SACK'}, ${yd} LOSS`;
    case 'fourthStop':
      return `STOPPED ON 4TH & ${Math.max(1, p.toGo)}`;
    case 'fourthConv':
      return lead(`CONVERTS 4TH & ${Math.max(1, p.toGo)}`);
    case 'thirdConv':
      return lead(`CONVERTS 3RD & ${Math.max(1, p.toGo)}`);
    case 'thirdStop':
      return `STOPPED ON 3RD & ${Math.max(1, p.toGo)}`;
    case 'redZoneStop':
      return 'RED ZONE STOP';
    case 'twoPt':
      return lead('TWO-POINT TRY GOOD');
    case 'twoPtStop':
      return 'TWO-POINT TRY FAILS';
    default:
      return lead(`${yd} ${p.pass ? 'CATCH' : 'RUN'}`);
  }
}
