import type { Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL } from '../engine/constants';
import { drawField } from '../render/field';
import { drawBanner, drawHint, drawScorebug } from '../render/hud';
import { drawKickPlay } from '../render/kickRenderer';
import { drawLines, drawPlay, drawTape } from '../render/renderer';
import { getBallSprite } from '../render/sprites';
import { text } from '../render/text';
import { storyClock } from '../season/story';
import { mmss, quarterName } from './clock';
import { creditFor, downText, KEY_TITLE, shownGain, spotLabel, type KeyKind, type KeyPlay } from './keyPlays';
import type { KickPlay } from './kickPlay';
import type { Play } from './playState';
import { frameAt, shiftAt, shiftLength, tapeLength, type Tape } from './tape';
import {
  FgSearch, fgTargetFor, makeFg, makeReplay, ReplaySearch, stepFg, stepReplay, targetFor, type FgSetup, type ReplaySetup, type ReplaySide, type ReplayTarget,
} from './replay';
import { converted } from './rules';

/**
 * One key play on screen: it finds its replay (a few milliseconds a frame), shows the lineup,
 * plays it with the CPU on both sides (a field goal with the CPU kicker), then holds the caption. With
 * no replay (no seed that matched) it's a card: the ball slides the sim's yards with the same caption.
 * Captions and yards come from the sim, so they agree with the score and the box score. A snap the
 * user played can come with its tape (game/tape.ts): then the real play is shown, nothing searched.
 */

/** Seconds: a scorer running into the end zone before the caption, at most this long for a loose ball to be recovered, at least this long finding the replay, the lineup before the snap, the caption after. */
/** `snapSet`, `snapHold`: the lineup and caption of an ordinary snap when every snap of a CPU drive is shown. */
/** `kickHold`: the caption of an ordinary kick (a kickoff, a punt, an extra point) when every snap is shown. */
export const SHOW = { tdRun: 0.6, fumble: 2.2, find: 0.45, set: 0.8, hold: 2.4, cardMove: 1.1, cardHold: 2.6, prefetchMs: 3, snapSet: 0.5, snapHold: 1.1, kickHold: 1.5 };

/** An ordinary snap or kick of every-snap watching (the shorter lineup and caption). */
const ordinary = (k: KeyPlay) => k.kind === 'snap' || (!!k.kick && k.priority === 0);
const KICKS = new Set<KeyKind>(['kickoff', 'punt']);

/** The two teams on the field for the key plays. */
export interface ShowCtx {
  user: Team;
  cpu: Team;
  userSide: ReplaySide;
  cpuSide: ReplaySide;
  /** Each offense's pass share (game plans), for snaps without box-score credit. */
  userPass: number;
  cpuPass: number;
  /** Each offense's OC book and style, for the replays' play calls. */
  userOc?: ReplayTarget['oc'];
  cpuOc?: ReplayTarget['oc'];
}

export interface KeyShow {
  k: KeyPlay;
  /** The user's team has the ball on it. */
  userBall: boolean;
  search: ReplaySearch | FgSearch | null;
  setup: ReplaySetup | null;
  play: Play | null;
  /** A field goal's replay instead of a snap's. */
  fgSetup: FgSetup | null;
  kick: KickPlay | null;
  phase: 'find' | 'set' | 'run' | 'card';
  /** Seconds in the phase. */
  t: number;
  /** Seconds since the play ended (or the card's ball stopped); the caption shows from then. */
  over: number;
  before: { user: number; cpu: number };
  after: { user: number; cpu: number };
  clock: string;
  /** The show's own camera, mirrored when the CPU has the ball so it attacks left, as in a played game. */
  cam: Camera;
  /** The real play, when the user played it. */
  tape: Tape | null;
  /** The corner label: KEY PLAY, or the postgame's HIGHLIGHT. */
  label: string;
  /** A line under the label: the user's defense's call on a CPU snap played through the engine. */
  note?: string;
}

/** Kinds that are good news for the defense. */
const DEFENSIVE = new Set<KeyKind>(['int', 'fumble', 'fourthStop', 'thirdStop', 'redZoneStop', 'sack', 'missedFg', 'twoPtStop', 'xpMiss']);

export function keyShow(k: KeyPlay, ctx: ShowCtx, seed: number, opts: { tape?: Tape; label?: string; note?: string } = {}): KeyShow {
  const d = k.drive;
  const userBall = d.off === ctx.user.id;
  const [off, def] = userBall ? [ctx.userSide, ctx.cpuSide] : [ctx.cpuSide, ctx.userSide];
  const tape = opts.tape && opts.tape.frames.length ? opts.tape : null;
  const fg = tape ? null : fgTargetFor(k, off, def);
  // A kickoff or punt off tape has no replay to search for: it's a card.
  const target = fg || tape || KICKS.has(k.kind) ? null : targetFor(k, off, def, userBall ? ctx.userPass : ctx.cpuPass, userBall ? ctx.userOc : ctx.cpuOc);
  const search = fg ? new FgSearch(fg, seed) : target ? new ReplaySearch(target, seed) : null;
  const before = { user: d.score[ctx.user.id] ?? 0, cpu: d.score[ctx.cpu.id] ?? 0 };
  const pts = k.kind === 'td' || k.kind === 'twoPt' ? d.points : k.kind === 'fg' ? 3 : k.kind === 'xp' ? 1 : 0;
  const kp = k.kick?.pts;
  const after = kp
    ? { user: before.user + (kp[ctx.user.id] ?? 0), cpu: before.cpu + (kp[ctx.cpu.id] ?? 0) }
    : { user: before.user + (userBall ? pts : 0), cpu: before.cpu + (userBall ? 0 : pts) };
  const c = storyClock(d, k.play.t);
  // Cut straight to the new spot: the camera starts there rather than panning from the last play.
  const cam = new Camera();
  cam.mirror = !userBall;
  cam.follow(OWN_GOAL + k.play.yard, 0.4);
  cam.snap();
  return {
    k, userBall, search, setup: null, play: null, fgSetup: null, kick: null,
    phase: tape ? 'set' : 'find', t: 0, over: 0, before, after, clock: c.quarter > 4 ? quarterName(c.quarter) : `${quarterName(c.quarter)} ${mmss(c.time)}`, cam,
    tape, label: opts.label ?? (ordinary(k) ? 'LIVE' : 'KEY PLAY'), ...(opts.note ? { note: opts.note } : {}),
  };
}

/** Search a little for a show that's coming up, so it's ready when it's on. */
export function prefetchShow(sh: KeyShow): void {
  if (sh.search && !sh.search.done) sh.search.step(SHOW.prefetchMs);
}

/** One fixed step of the show on screen; true once it's finished. */
export function updateShow(sh: KeyShow, dt: number): boolean {
  sh.t += dt;
  const cam = sh.cam;
  cam.update(dt);
  const los = OWN_GOAL + sh.k.play.yard;
  switch (sh.phase) {
    case 'find':
      cam.follow(los, 0.4);
      sh.search?.step();
      if ((!sh.search || sh.search.done) && sh.t >= SHOW.find) {
        const s = sh.search;
        if (s instanceof FgSearch && s.found) {
          sh.fgSetup = s.found;
          sh.kick = makeFg(s.target, s.found);
        } else if (s instanceof ReplaySearch && s.found) {
          sh.setup = s.found;
          sh.play = makeReplay(s.target, s.found);
        }
        sh.phase = sh.play || sh.kick ? 'set' : 'card';
        sh.t = 0;
      }
      return false;
    case 'set':
      cam.follow(sh.tape ? sh.tape.frames[0].focus : los, 0.35);
      // A tape with a shift plays it in the lineup, then holds the set.
      if (sh.t >= (ordinary(sh.k) ? SHOW.snapSet : SHOW.set) + (sh.tape ? shiftLength(sh.tape) : 0)) {
        // A tape just runs (from 0, as `t` restarts).
        if (sh.kick) sh.kick.release(sh.fgSetup!.kick);
        else sh.play?.snap();
        sh.phase = 'run';
        sh.t = 0;
      }
      return false;
    case 'run': {
      if (sh.tape) {
        const f = frameAt(sh.tape, sh.t);
        cam.follow(f.focus, f.lead);
        if (sh.t >= tapeLength(sh.tape)) sh.over += dt;
        return sh.over >= (sh.k.kind === 'snap' ? SHOW.snapHold : ordinary(sh.k) ? SHOW.kickHold : SHOW.hold);
      }
      if (sh.kick) {
        stepFg(sh.kick, sh.fgSetup!);
        const f = sh.kick.focus();
        cam.follow(f.x, f.lead);
        if (sh.kick.phase === 'over') sh.over += dt;
        return sh.over >= (ordinary(sh.k) ? SHOW.kickHold : SHOW.hold);
      }
      const play = sh.play!;
      stepReplay(play, sh.setup!);
      const lead = play.phase === 'run' ? 0.4 : play.phase === 'air' ? 0.45 : 0.35;
      cam.follow(play.focusX(), lead);
      if (play.phase === 'over' && sh.k.kind === 'fumble') play.knockLoose();
      const settled =
        play.outcome?.type === 'td' ? play.overTime >= SHOW.tdRun
        : play.recoverer ? play.carrier === play.recoverer || play.overTime >= SHOW.fumble
        : true;
      if (play.phase === 'over' && settled) sh.over += dt;
      return sh.over >= SHOW.hold;
    }
    case 'card':
      cam.follow(cardX(sh), 0.4);
      if (sh.t >= SHOW.cardMove) sh.over += dt;
      return sh.over >= SHOW.cardHold;
  }
}

/** Where the card's ball is now: on the spot until the card is on, then sliding the sim's yards. */
function cardX(sh: KeyShow): number {
  const from = OWN_GOAL + sh.k.play.yard;
  if (sh.phase !== 'card') return from;
  const k = sh.k.kind;
  const still = k === 'fg' || k === 'missedFg' || k === 'xp' || k === 'xpMiss' || k === 'int' || k === 'fumble' || KICKS.has(k);
  const to = still ? from : k === 'td' || k === 'twoPt' ? OPP_GOAL + 3 : Math.min(OPP_GOAL, from + shownGain(sh.k.play));
  const f = Math.min(1, sh.t / SHOW.cardMove);
  return from + (to - from) * (1 - (1 - f) * (1 - f));
}

const yardsWord = (y: number) => `${Math.abs(y)}-YARD`;

/** The caption's play line: who did what, with the sim's yards. */
function playLine(sh: KeyShow): string {
  const k = sh.k;
  const p = k.play;
  const yds = Math.round(shownGain(p));
  const o = sh.play?.outcome;
  const credit = creditFor(k);
  const ball = sh.play ? (o?.type === 'incomplete' ? sh.play.intended : sh.play.carrier) : null;
  const inc = o?.type === 'incomplete' || (!sh.play && credit?.kind === 'inc');
  const who = (ball?.name ?? credit?.who?.name ?? '').toUpperCase();
  const pass = sh.play ? sh.play.thrown : credit?.pass ?? false;
  const by = (s: string) => (who ? `${who} ${s}` : s);
  switch (k.kind) {
    case 'td':
      return by(`${yardsWord(yds)} TOUCHDOWN ${pass ? 'CATCH' : 'RUN'}`);
    case 'twoPt':
      return by(`IN ON THE TWO-POINT ${pass ? 'CATCH' : 'RUN'}`);
    case 'twoPtStop':
      return inc ? 'TWO-POINT PASS FALLS INCOMPLETE' : by('STOPPED SHORT ON THE TWO-POINT TRY');
    case 'int': {
      const picker = sh.play ? who : (credit?.by?.name ?? '').toUpperCase();
      return picker ? `PICKED OFF BY ${picker}` : 'PICKED OFF';
    }
    case 'fumble': {
      const rec = sh.play?.recoverer?.name.toUpperCase();
      return rec ? `FUMBLE, RECOVERED BY ${rec}` : 'FUMBLE, AND THE DEFENSE HAS IT';
    }
    case 'sack': {
      const sacker = o?.type === 'sack' ? o.sub.split('  ')[0].toUpperCase() : (credit?.by?.name ?? '').toUpperCase();
      return `${sacker ? `SACKED BY ${sacker}` : 'SACKED'}, ${yardsWord(yds)} LOSS`;
    }
    case 'fg':
    case 'missedFg':
      return `${p.fg?.dist ?? ''}-YARD TRY ${k.kind === 'fg' ? 'IS GOOD' : 'IS NO GOOD'}`;
    case 'xp':
    case 'xpMiss':
      return `THE EXTRA POINT ${k.kind === 'xp' ? 'IS GOOD' : 'IS NO GOOD'}`;
    default:
      if (inc) return who ? `PASS FOR ${who} FALLS INCOMPLETE` : 'PASS FALLS INCOMPLETE';
      if (yds <= 0) return by(yds === 0 ? 'STOPPED FOR NO GAIN' : `STOPPED FOR A ${yardsWord(yds)} LOSS`);
      return by(`${yardsWord(yds)} ${pass ? 'CATCH' : 'RUN'}`);
  }
}

/**
 * Get a show to its opening frame without playing it: the search runs and the snap is set up. True
 * once it's there (or the search found nothing and it's down to the card). For the postgame's
 * thumbnails (`drawShowStill`).
 */
export function cueShow(sh: KeyShow, dt: number): boolean {
  if (sh.phase === 'find') updateShow(sh, dt);
  return sh.phase !== 'find';
}

/** Where the ball is now on a show (the snap's spot before it's set up), in world yards: the thumbnail's center. */
export function showFocus(sh: KeyShow): { x: number; y: number } {
  const b = sh.tape?.frames[0].ball ?? sh.play?.ball.pos ?? sh.kick?.ball.pos;
  return b ? { x: b.x, y: b.y } : { x: OWN_GOAL + sh.k.play.yard, y: FIELD_W / 2 };
}

/** The show's field and players as they are now, with no scorebug, label or caption. */
export function drawShowStill(g: CanvasRenderingContext2D, sh: KeyShow, ctx: ShowCtx, crowd: HTMLCanvasElement): void {
  drawShowField(g, sh, ctx, crowd, false);
}

function drawShowField(g: CanvasRenderingContext2D, sh: KeyShow, ctx: ShowCtx, crowd: HTMLCanvasElement, debug: boolean): void {
  const p = sh.k.play;
  const cam = sh.cam;
  // The field as in a played game, the user's end zone on the left: the replay attacks +x, and the
  // mirrored camera turns the CPU's snaps around so they go left.
  drawField(g, cam, ctx.user, ctx.cpu, crowd);
  const los = OWN_GOAL + p.yard;
  drawLines(g, cam, los, Math.min(OPP_GOAL, los + p.toGo));
  if (sh.tape) drawTape(g, cam, sh.tape, sh.phase === 'run' ? frameAt(sh.tape, sh.t) : sh.tape.shift?.length ? shiftAt(sh.tape, sh.t) : sh.tape.frames[0]);
  else if (sh.kick) drawKickPlay(g, cam, sh.kick, debug, true);
  else if (sh.play) drawPlay(g, cam, sh.play, debug, true);
  else {
    const s = cam.toScreen(cardX(sh), FIELD_W / 2, 0.2);
    g.drawImage(getBallSprite(), Math.round(s.x - 4), Math.round(s.y - 4));
  }
}

export function drawShow(g: CanvasRenderingContext2D, sh: KeyShow, ctx: ShowCtx, crowd: HTMLCanvasElement, debug: boolean): void {
  const p = sh.k.play;
  const [off, def] = sh.userBall ? [ctx.user, ctx.cpu] : [ctx.cpu, ctx.user];
  drawShowField(g, sh, ctx, crowd, debug);
  const captioned = sh.over > 0;
  const kind = sh.k.kind;
  const down = sh.k.drive.try ? 'TWO-POINT TRY' : kind === 'kickoff' ? 'KICKOFF' : kind === 'xp' || kind === 'xpMiss' ? 'EXTRA POINT' : kind === 'punt' ? `PUNT ON ${downText(p)}` : downText(p);
  const situation = `${down}  ${spotLabel(p.yard, off.abbr, def.abbr)}`;
  drawScorebug(g, ctx.user, ctx.cpu, captioned ? sh.after : sh.before, sh.clock, situation, `${off.abbr} ${sh.k.kick ? 'KICKING' : 'OFFENSE'}`);
  text(g, sh.label, 8, 40, { size: 8, color: '#ffd23f' });
  if (sh.note) text(g, sh.note, 8, 52, { size: 8, color: '#9ad7ff' });
  if (captioned) {
    const k = sh.k;
    const stop = k.kind === 'snap' && !converted(k.play) && !k.play.turnover;
    // A kick's caption is its own, and it went the kicking team's way or not.
    if (k.kick && KICKS.has(k.kind)) {
      drawBanner(g, k.kick.title, k.kick.line, k.kick.good === sh.userBall ? '#ffd23f' : '#ff5a5a', situation);
      drawHint(g, sh.label === 'HIGHLIGHT' ? 'SPACE: NEXT   ESC: BACK TO THE GAME' : 'SPACE: NEXT   ESC: SKIP THE KEY PLAYS');
      return;
    }
    const good = (DEFENSIVE.has(k.kind) || stop) !== sh.userBall;
    const title = k.kind !== 'snap' ? KEY_TITLE[k.kind] : converted(k.play) ? 'FIRST DOWN' : `${downText({ ...k.play, yard: k.play.yard + k.play.gain, down: Math.min(4, k.play.down + 1), toGo: k.play.toGo - k.play.gain })} NEXT`;
    drawBanner(g, title, playLine(sh), good ? '#ffd23f' : '#ff5a5a', situation);
  }
  drawHint(g, sh.label === 'HIGHLIGHT' ? 'SPACE: NEXT   ESC: BACK TO THE GAME' : 'SPACE: NEXT   ESC: SKIP THE KEY PLAYS');
}
