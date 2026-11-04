import type { Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL } from '../engine/constants';
import { drawField } from '../render/field';
import { drawBanner, drawHint, drawScorebug } from '../render/hud';
import { drawKickPlay } from '../render/kickRenderer';
import { drawLines, drawPlay } from '../render/renderer';
import { getBallSprite } from '../render/sprites';
import { text } from '../render/text';
import { storyClock } from '../season/story';
import { mmss, quarterName } from './clock';
import { creditFor, downText, KEY_TITLE, shownGain, spotLabel, type KeyKind, type KeyPlay } from './keyPlays';
import type { KickPlay } from './kickPlay';
import type { Play } from './playState';
import {
  FgSearch, fgTargetFor, makeFg, makeReplay, ReplaySearch, stepFg, stepReplay, targetFor, type FgSetup, type ReplaySetup, type ReplaySide,
} from './replay';

/**
 * One key play on screen: it finds its replay (a few milliseconds a frame), shows the lineup,
 * plays it with the CPU on both sides (a field goal with the CPU kicker), then holds the caption. With
 * no replay (no seed that matched) it's a card: the ball slides the sim's yards with the same caption.
 * Captions and yards come from the sim, so they agree with the score and the box score.
 */

/** Seconds: a scorer running into the end zone before the caption, at most this long for a loose ball to be recovered, at least this long finding the replay, the lineup before the snap, the caption after. */
export const SHOW = { tdRun: 0.6, fumble: 2.2, find: 0.45, set: 0.8, hold: 2.4, cardMove: 1.1, cardHold: 2.6, prefetchMs: 3 };

/** The two teams on the field for the key plays. */
export interface ShowCtx {
  user: Team;
  cpu: Team;
  userSide: ReplaySide;
  cpuSide: ReplaySide;
  /** Each offense's pass share (game plans), for snaps without box-score credit. */
  userPass: number;
  cpuPass: number;
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
}

/** Kinds that are good news for the defense. */
const DEFENSIVE = new Set<KeyKind>(['int', 'fumble', 'fourthStop', 'thirdStop', 'redZoneStop', 'sack', 'missedFg', 'twoPtStop']);

export function keyShow(k: KeyPlay, ctx: ShowCtx, seed: number): KeyShow {
  const d = k.drive;
  const userBall = d.off === ctx.user.id;
  const [off, def] = userBall ? [ctx.userSide, ctx.cpuSide] : [ctx.cpuSide, ctx.userSide];
  const fg = fgTargetFor(k, off, def);
  const target = fg ? null : targetFor(k, off, def, userBall ? ctx.userPass : ctx.cpuPass);
  const search = fg ? new FgSearch(fg, seed) : target ? new ReplaySearch(target, seed) : null;
  const before = { user: d.score[ctx.user.id] ?? 0, cpu: d.score[ctx.cpu.id] ?? 0 };
  const pts = k.kind === 'td' || k.kind === 'twoPt' ? d.points : k.kind === 'fg' ? 3 : 0;
  const after = { user: before.user + (userBall ? pts : 0), cpu: before.cpu + (userBall ? 0 : pts) };
  const c = storyClock(d, k.play.t);
  // Cut straight to the new spot: the camera starts there rather than panning from the last play.
  const cam = new Camera();
  cam.mirror = !userBall;
  cam.follow(OWN_GOAL + k.play.yard, 0.4);
  cam.snap();
  return {
    k, userBall, search, setup: null, play: null, fgSetup: null, kick: null,
    phase: 'find', t: 0, over: 0, before, after, clock: c.quarter > 4 ? quarterName(c.quarter) : `${quarterName(c.quarter)} ${mmss(c.time)}`, cam,
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
      cam.follow(los, 0.35);
      if (sh.t >= SHOW.set) {
        if (sh.kick) sh.kick.release(sh.fgSetup!.kick);
        else sh.play!.snap();
        sh.phase = 'run';
        sh.t = 0;
      }
      return false;
    case 'run': {
      if (sh.kick) {
        stepFg(sh.kick, sh.fgSetup!);
        const f = sh.kick.focus();
        cam.follow(f.x, f.lead);
        if (sh.kick.phase === 'over') sh.over += dt;
        return sh.over >= SHOW.hold;
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
  const still = k === 'fg' || k === 'missedFg' || k === 'int' || k === 'fumble';
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
  const who = (ball?.name ?? credit?.who?.name ?? '').toUpperCase();
  const pass = sh.play ? sh.play.thrown : credit?.pass ?? false;
  const by = (s: string) => (who ? `${who} ${s}` : s);
  switch (k.kind) {
    case 'td':
      return by(`${yardsWord(yds)} TOUCHDOWN ${pass ? 'CATCH' : 'RUN'}`);
    case 'twoPt':
      return by(`IN ON THE TWO-POINT ${pass ? 'CATCH' : 'RUN'}`);
    case 'twoPtStop':
      return o?.type === 'incomplete' ? 'TWO-POINT PASS FALLS INCOMPLETE' : by('STOPPED SHORT ON THE TWO-POINT TRY');
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
    default:
      if (o?.type === 'incomplete') return 'PASS FALLS INCOMPLETE';
      if (yds <= 0) return by(yds === 0 ? 'STOPPED FOR NO GAIN' : `STOPPED FOR A ${yardsWord(yds)} LOSS`);
      return by(`${yardsWord(yds)} ${pass ? 'CATCH' : 'RUN'}`);
  }
}

export function drawShow(g: CanvasRenderingContext2D, sh: KeyShow, ctx: ShowCtx, crowd: HTMLCanvasElement, debug: boolean): void {
  const p = sh.k.play;
  const cam = sh.cam;
  const [off, def] = sh.userBall ? [ctx.user, ctx.cpu] : [ctx.cpu, ctx.user];
  // The field as in a played game, the user's end zone on the left: the replay attacks +x, and the
  // mirrored camera turns the CPU's snaps around so they go left.
  drawField(g, cam, ctx.user, ctx.cpu, crowd);
  const los = OWN_GOAL + p.yard;
  drawLines(g, cam, los, Math.min(OPP_GOAL, los + p.toGo));
  if (sh.kick) drawKickPlay(g, cam, sh.kick, debug, true);
  else if (sh.play) drawPlay(g, cam, sh.play, debug, true);
  else {
    const s = cam.toScreen(cardX(sh), FIELD_W / 2, 0.2);
    g.drawImage(getBallSprite(), Math.round(s.x - 4), Math.round(s.y - 4));
  }
  const captioned = sh.over > 0;
  const situation = `${sh.k.drive.try ? 'TWO-POINT TRY' : downText(p)}  ${spotLabel(p.yard, off.abbr, def.abbr)}`;
  drawScorebug(g, ctx.user, ctx.cpu, captioned ? sh.after : sh.before, sh.clock, situation, `${off.abbr} OFFENSE`);
  text(g, 'KEY PLAY', 8, 40, { size: 8, color: '#ffd23f' });
  if (captioned) {
    const good = DEFENSIVE.has(sh.k.kind) !== sh.userBall;
    drawBanner(g, KEY_TITLE[sh.k.kind], playLine(sh), good ? '#ffd23f' : '#ff5a5a', situation);
  }
  drawHint(g, 'SPACE: NEXT   ESC: SKIP THE KEY PLAYS');
}
