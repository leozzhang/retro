import type { Input } from '../engine/input';
import { dist } from '../engine/math';
import { isEligible, type Player } from '../sim/player';
import { DRAW_SET } from '../sim/runBlocking';
import type { Play } from './playState';

/**
 * The CPU playing offense on the field, for key-play replays (game/replay.ts): a per-step QB and
 * ball carrier, called before each `play.update`. It follows the balance harness's auto-QB and
 * auto-runner (harness.ts, left as it is so the reports don't move), with a planned target and
 * hold time, and `autoRun` carrying the ball after every catch or handoff. Decisions read only the
 * play and the plan, so a replay stepped at `STEP` plays out the same every time.
 */

/** Nobody touching anything. */
export const AUTO_INPUT = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
  axis: () => ({ x: 0, y: 0 }),
  isDown: () => false,
  hit: () => false,
  endStep: () => {},
} as unknown as Input;

export interface AutoPlan {
  kind: 'pass' | 'run';
  /** Seconds after the snap before throwing. */
  hold: number;
  /** Throw to this slot ('tight': the most closely covered receiver, 'open': the most open). */
  target: string;
}

/** Zone read: ride the back this long before reading the key (as the harness does). */
const READ_AT = 0.55;

function separation(play: Play, o: Player): number {
  let sep = Infinity;
  for (const d of play.def) sep = Math.min(sep, dist(d.pos, o.pos));
  return sep;
}

function receiver(play: Play, plan: AutoPlan): Player | null {
  const since = play.time - play.snapTime;
  const ready = play.off.filter((o) => isEligible(o) && !o.isBlocker && !o.down && since >= o.routeDelay);
  if (plan.target !== 'open' && plan.target !== 'tight') return ready.find((o) => o.slot === plan.target) ?? null;
  let best: Player | null = null;
  let score = 0;
  for (const o of ready) {
    const s = plan.target === 'open' ? separation(play, o) : -separation(play, o);
    if (!best || s > score) {
      best = o;
      score = s;
    }
  }
  return best;
}

/** One step of the CPU's QB and carrier. */
export function autoStep(play: Play, plan: AutoPlan): void {
  const def = play.playDef;
  const since = play.time - play.snapTime;
  if (plan.kind === 'pass') {
    if (!play.thrown && play.phase === 'live' && play.carrier === play.qb && !play.scramble && since >= plan.hold) {
      const r = receiver(play, plan);
      if (r) {
        const { aim, kind } = play.cpuAim(r);
        play.throwBall(aim, kind);
      }
    }
  } else {
    const opt = play.handoffOption();
    if (def.read === 'option') {
      const k = play.readKey!;
      if (opt === 'pitch' && dist(k.pos, play.qb.pos) < 3 && !play.keyCrashing()) play.handoff();
    } else {
      const zr = def.read === 'zoneRead';
      const ready = (!zr || (since >= READ_AT && !play.keyCrashing())) && (play.runScheme !== 'draw' || since >= DRAW_SET);
      if ((opt === 'handoff' && ready) || (opt === 'pitch' && def.read === 'pitch')) play.handoff();
    }
  }
  // Whoever has it after a catch, handoff or keep runs on the AI.
  if (play.phase === 'run' && play.carrier?.side === 'off') play.controlled = null;
  if (plan.kind === 'run' && (play.handedOff || play.kept || (def.qbRun && play.phase === 'run'))) play.controlled = null;
}
