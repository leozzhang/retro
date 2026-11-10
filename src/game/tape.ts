import type { GameStory } from '../season/story';
import type { BallState } from '../sim/ball';
import { DEFENSIVE } from '../season/gameStars';
import { driveEvents, type KeyPlay } from './keyPlays';
import type { SimPlay } from './rules';
import { poseOf } from '../sim/player';
import type { Look, Pose, Uniform } from '../render/sprites';
import { lookOf } from '../render/renderer';
import type { Play } from './playState';

/**
 * A tape of a snap the user played: what the field showed, frame by frame, so a postgame highlight
 * replays the real play rather than a re-enactment (game/highlights.ts). Only kept in memory, for
 * the game it was played in. Recording reads the play and changes nothing. Docs: docs/GAMES.md.
 */

/** `fps`: frames a second of play time; `maxSecs`: the longest snap kept; `keep`: tapes kept a game, the best by `tapeScore`. */
/** `tail`: seconds kept after the whistle; `scoreTail` after a touchdown, for the celebration. */
export const TAPE = { fps: 30, maxSecs: 20, keep: 6, tail: 0.8, scoreTail: 2.4 };

/**
 * The postgame highlights: `reel` plays, the biggest by `reelScore` among those the key plays rate
 * `minPriority` or more; a play on tape (the user's own, as played) scores `tapeBonus` more, and one
 * that went the user's way `userGood` more.
 */
export const POSTGAME = { reel: 2, minPriority: 2, tapeBonus: 0.5, userGood: 0.6, lead: 0.8 };

/** How much a snap is worth keeping on tape: touchdowns, turnovers, big gains, sacks and fourth downs; 0 is not at all. */
export function tapeScore(p: SimPlay): number {
  const td = p.yard + p.gain >= 100;
  const worth = td || p.turnover || p.gain >= 20 || p.gain <= -3 || p.down === 4;
  return worth ? (p.lev ?? 0) + Math.abs(p.gain) / 50 + (td || p.turnover ? 1 : 0) : 0;
}

const BIG = new Set(['td', 'int', 'fumble', 'fourthStop', 'twoPt', 'fg']);

/** A score that ties the game or takes the lead, either way: the game turning, worth seeing whoever won. */
function leadChange(k: KeyPlay): boolean {
  if (k.kind !== 'td' && k.kind !== 'fg' && k.kind !== 'twoPt') return false;
  const d = k.drive;
  const other = Object.keys(d.score).find((id) => id !== d.off);
  const before = (d.score[d.off] ?? 0) - (other ? d.score[other] ?? 0 : 0);
  return before <= 0 && before + (k.kind === 'fg' ? 3 : d.points) >= 0;
}

/**
 * How much a key play belongs in the reel: its leverage and yards, the game turning, and the user's
 * side of it. A tape only counts when it went the user's way: nobody wants their own stop replayed.
 */
function reelScore(k: KeyPlay, onTape: boolean, user: string): number {
  const good = DEFENSIVE.has(k.kind) !== (k.drive.off === user);
  const big = BIG.has(k.kind) && good;
  return (k.play.lev ?? 0) + (big ? 0.3 : 0) + Math.abs(k.play.gain) / 150 + (leadChange(k) ? POSTGAME.lead : 0) +
    (good ? POSTGAME.userGood + (onTape ? POSTGAME.tapeBonus : 0) : 0);
}

/** The postgame highlights from a game's story, in the order they happened, the user's team's way. */
export function pickReel(story: GameStory, onTape: (p: SimPlay) => boolean, user: string): KeyPlay[] {
  const all = story.drives.flatMap((d) => driveEvents(d, 'sim')).filter((k) => k.priority >= POSTGAME.minPriority);
  const score = (k: KeyPlay) => reelScore(k, onTape(k.play), user);
  const best = all.sort((a, b) => score(b) - score(a)).slice(0, POSTGAME.reel);
  const order = new Map(story.drives.map((d, i) => [d, i]));
  return best.sort((a, b) => order.get(a.drive)! - order.get(b.drive)! || a.play.t - b.play.t);
}

export interface TapeMan {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  pose: Pose;
  look: Look;
  juke: number;
}

export interface TapeFrame {
  /** Seconds since the snap (the first frame is the presnap, at 0). */
  t: number;
  men: TapeMan[];
  ball: { state: BallState; x: number; y: number; z: number; carrier: number; spin?: number };
  /** Where the camera looks, and its lead. */
  focus: number;
  lead: number;
}

export interface Tape {
  /** Each man's sprite: uniform and skin, in the order of a frame's `men`. */
  cast: { uniform: Uniform; skin: string }[];
  frames: TapeFrame[];
}

export interface TapeRecorder {
  play: Play;
  tape: Tape;
  /** The last presnap frame, until the snap. */
  pre: TapeFrame | null;
  t: number;
  next: number;
}

export function newRecorder(play: Play): TapeRecorder {
  return { play, tape: { cast: play.players.map((p) => ({ uniform: p.uniform, skin: p.skin })), frames: [] }, pre: null, t: 0, next: 0 };
}

function frame(play: Play, t: number): TapeFrame {
  const presnap = play.phase === 'presnap';
  const lead = play.phase === 'run' ? 0.4 : play.phase === 'air' ? 0.45 : 0.35;
  const b = play.ball;
  return {
    t,
    men: play.players.map((p) => ({
      x: p.pos.x, y: p.pos.y, vx: p.vel.x, vy: p.vel.y, facing: p.facing, pose: poseOf(p, presnap), look: lookOf(play, p), juke: p.juke,
    })),
    ball: { state: b.state, x: b.pos.x, y: b.pos.y, z: b.pos.z, carrier: b.carrier ? play.players.indexOf(b.carrier) : -1, spin: b.spin },
    focus: play.focusX(),
    lead,
  };
}

/** One step of the play (`dt` seconds of play time): a frame every 1/fps. */
export function recordFrame(r: TapeRecorder, dt: number): void {
  const play = r.play;
  if (play.phase === 'presnap') {
    r.pre = frame(play, 0);
    return;
  }
  if (r.t > TAPE.maxSecs) return;
  if (!r.tape.frames.length && r.pre) r.tape.frames.push(r.pre);
  r.t += dt;
  if (r.t < r.next) return;
  r.next += 1 / TAPE.fps;
  r.tape.frames.push(frame(play, r.t));
}

/** The frame on at `t` seconds of the tape. */
export function frameAt(tape: Tape, t: number): TapeFrame {
  const f = tape.frames;
  let i = 0;
  while (i + 1 < f.length && f[i + 1].t <= t) i++;
  return f[i];
}

/** The tape's length in seconds. */
export const tapeLength = (tape: Tape): number => tape.frames[tape.frames.length - 1]?.t ?? 0;
