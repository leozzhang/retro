import { CROWD } from '../data/audio';
import { len } from '../engine/math';
import { sfx } from '../engine/sfx';
import { crowd } from './crowd';
import type { KickPlay } from './kickPlay';
import type { Play } from './playState';

/**
 * The field's sounds, read off the play on screen. A `Play` or `KickPlay` never makes a sound
 * itself (it also runs headless: the reports, engine drives, simulated games); this watches
 * one from the outside each frame, its phase, the ball, its popups and its outcome, and plays
 * what changed. See docs/AUDIO.md for the event map.
 */

export interface FieldCtx {
  /** The user's team has the ball (on a kick: is kicking). */
  userBall: boolean;
  /** The user's team is the home team (the crowd is theirs). */
  userHome: boolean;
  /** The down before the snap (1..4), for the big-down rise. */
  down?: number;
}

/** Who a play was good for, in the crowd's eyes: +1 the home team, -1 the visitors. */
const forHome = (ctx: FieldCtx, goodForBall: boolean): 1 | -1 => ((goodForBall === ctx.userBall) === ctx.userHome ? 1 : -1);

/** The crowd's reaction to something good (`big`: a roar) for one side. */
function react(side: 1 | -1, big: boolean): void {
  if (side > 0) crowd.react(big ? 'roar' : 'cheer');
  else {
    crowd.react('cheer', CROWD.awayShare * (big ? 1.4 : 1));
    crowd.hush();
  }
}

interface Watch {
  play: Play;
  ctx: FieldCtx;
  phase: string;
  thrown: boolean;
  handedOff: boolean;
  popups: number;
  ended: boolean;
  /** Crossed into a big gain on this run already. */
  swelled: boolean;
  /** The carrier's speed a frame ago (the hit's weight at the whistle). */
  speed: number;
}

interface KickWatch {
  kick: KickPlay;
  ctx: FieldCtx;
  phase: string;
  popups: number;
  ended: boolean;
}

class FieldSounds {
  private w: Watch | null = null;
  private k: KickWatch | null = null;

  /** Watch this snap (or nothing). The same play again is a no-op. */
  play(p: Play | null, ctx: FieldCtx): void {
    if (p === this.w?.play) return;
    this.w = p
      ? { play: p, ctx, phase: p.phase, thrown: p.thrown, handedOff: p.handedOff, popups: p.popups.length, ended: !!p.outcome, swelled: false, speed: 0 }
      : null;
    if (p && p.phase === 'presnap') crowd.level((ctx.down ?? 1) >= 3);
  }

  kick(k: KickPlay | null, ctx: FieldCtx): void {
    if (k === this.k?.kick) return;
    this.k = k ? { kick: k, ctx, phase: k.phase, popups: k.popups.length, ended: !!k.outcome } : null;
    if (k) crowd.level(k.unit === 'fg' || k.unit === 'kickoff');
  }

  /** Once a frame, after the field updated. */
  update(): void {
    if (this.w) this.updatePlay(this.w);
    if (this.k) this.updateKick(this.k);
    crowd.update();
  }

  private updatePlay(w: Watch): void {
    const p = w.play;
    if (p.phase !== w.phase) {
      if (w.phase === 'presnap' && p.phase !== 'presnap') {
        sfx('hike');
        crowd.level(false);
      }
      w.phase = p.phase;
    }
    if (p.thrown && !w.thrown) {
      const v = len(p.ball.vel);
      // Faster balls whistle higher; a pitch or a lob is softer.
      sfx('throw', { rate: Math.max(0.7, Math.min(1.5, v / 18)), gain: p.pitch ? 0.5 : 1 });
    }
    w.thrown = p.thrown;
    if (p.handedOff && !w.handedOff && !p.pitch) sfx('catch', { gain: 0.5, rate: 0.75 });
    w.handedOff = p.handedOff;
    for (let i = w.popups; i < p.popups.length; i++) this.popup(p.popups[i].text, w);
    w.popups = p.popups.length;
    const c = p.carrier;
    if (c && !p.outcome) {
      w.speed = len(c.vel);
      if (!w.swelled && p.phase === 'run' && c.pos.x - p.los >= CROWD.bigYards) {
        w.swelled = true;
        react(forHome(w.ctx, true), true);
      }
    }
    if (p.outcome && !w.ended) {
      w.ended = true;
      this.outcome(w);
    }
  }

  private popup(text: string, w: Watch): void {
    switch (text) {
      case 'CATCH!':
      case 'IN STRIDE!':
      case 'FINGERTIPS!':
        sfx('catch');
        break;
      case 'DIVING CATCH!':
        sfx('catch');
        sfx('ground', { delay: 0.15 });
        react(forHome(w.ctx, true), false);
        break;
      case 'PICKED OFF!':
        sfx('catch', { rate: 0.9 });
        break;
      case 'TIPPED!':
        sfx('hitLight', { rate: 1.6, gain: 0.8 });
        break;
      case 'BROKEN TACKLE!':
      case 'SPUN OUT!':
        sfx('hit', { gain: 0.9 });
        react(forHome(w.ctx, true), false);
        break;
      case 'MADE HIM MISS!':
        sfx('throw', { rate: 0.6, gain: 0.5 });
        break;
      case 'OFFSIDE':
        sfx('whistle');
        break;
    }
  }

  private outcome(w: Watch): void {
    const p = w.play;
    const o = p.outcome!;
    const yards = o.spot - p.los;
    // The hit's weight: how fast the carrier was going into it.
    const hit = () => (w.speed > 6 ? sfx('hitHeavy') : w.speed > 2.5 ? sfx('hit') : sfx('hitLight'));
    const whistle = (delay = 0.45) => sfx('whistle', { delay });
    switch (o.type) {
      case 'tackle':
        hit();
        whistle();
        if (yards >= CROWD.bigYards && !w.swelled) react(forHome(w.ctx, true), true);
        else if (yards >= CROWD.goodYards) react(forHome(w.ctx, true), false);
        else if (yards < 0) react(forHome(w.ctx, false), false);
        break;
      case 'sack':
        sfx('hitHeavy');
        sfx('ground', { delay: 0.1 });
        whistle();
        react(forHome(w.ctx, false), true);
        break;
      case 'oob':
        whistle(0.25);
        if (yards >= CROWD.goodYards && !w.swelled) react(forHome(w.ctx, true), yards >= CROWD.bigYards);
        break;
      case 'incomplete':
        sfx('ground');
        whistle(0.35);
        break;
      case 'td':
        sfx('jingleTd', { delay: 0.1 });
        sfx('whistleLong', { delay: 0.6 });
        react(forHome(w.ctx, true), true);
        break;
      case 'int':
      case 'fumble':
        if (o.type === 'fumble') hit();
        sfx('jingleTurnover', { delay: 0.2 });
        whistle(0.5);
        react(forHome(w.ctx, false), true);
        break;
      case 'pick6':
        sfx('jingleTurnover', { delay: 0.1 });
        react(forHome(w.ctx, false), true);
        break;
      case 'safety':
        hit();
        whistle();
        react(forHome(w.ctx, false), true);
        break;
    }
  }

  private updateKick(k: KickWatch): void {
    const kp = k.kick;
    if (kp.phase !== k.phase) {
      if (kp.phase === 'flight') {
        sfx('kick');
        sfx('kickThump');
      }
      if (kp.phase === 'return') sfx('catch');
      k.phase = kp.phase;
    }
    for (let i = k.popups; i < kp.popups.length; i++) {
      const t = kp.popups[i].text;
      if (t === 'DOINK!') sfx('doink');
      else if (t === 'BLOCKED!') sfx('hitHeavy');
      else if (t === 'MUFFED!') sfx('hitLight', { rate: 1.3 });
      else if (t === 'BROKEN TACKLE!') sfx('hit');
    }
    k.popups = kp.popups.length;
    if (kp.outcome && !k.ended) {
      k.ended = true;
      const r = kp.outcome.result;
      // `userBall` on a kick: the user's team is kicking.
      if (r === 'fgGood' || r === 'xpGood') {
        sfx('jingleFg');
        react(forHome(k.ctx, true), r === 'fgGood');
      } else if (r === 'fgMiss' || r === 'xpMiss' || r === 'blocked') {
        sfx('jingleMiss');
        react(forHome(k.ctx, false), r === 'blocked');
      } else if (r === 'returnTd') {
        sfx('jingleTd', { delay: 0.1 });
        react(forHome(k.ctx, false), true);
      } else if (r === 'returned') {
        sfx('hit');
        sfx('whistle', { delay: 0.45 });
      } else if (r === 'recovered') {
        sfx('jingleTurnover');
        react(forHome(k.ctx, true), true);
      } else sfx('whistle', { delay: 0.3 });
    }
  }
}

export const fieldSounds = new FieldSounds();
