import type { Input } from '../engine/input';
import type { Rng } from '../engine/math';
import type { DriveClock } from './rules';
import { driveSteps, SnapRun, type EngineDrive, type EngineOpts, type EngineSide } from './engineDrive';
import { dist, type Vec } from '../engine/math';
import { isEligible, type Player } from '../sim/player';
import { USER_DEF, type Play } from './playState';
import { callOdds } from '../sim/catching';

/**
 * Scripted users for PLAY DEFENSE (docs/USERDEF.md): an input that a script fills (`BotInput`), and the oracle
 * that drives the user's defender through it with perfect information and a reaction time (`DefBot`). The
 * `userdef` report holds these against the AI on the same snaps; the tests use them for the plumbing.
 */

/** A scripted `Input`: the stick, held keys, and keys hit this step. */
export class BotInput {
  ax: Vec = { x: 0, y: 0 };
  held = new Set<string>();
  hits = new Set<string>();
  readonly mouse = { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 };
  axis(): Vec {
    return this.ax;
  }
  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }
  hit(...codes: string[]): boolean {
    return codes.some((c) => this.hits.has(c));
  }
  endStep(): void {
    this.hits.clear();
  }
  reset(): void {
    this.ax = { x: 0, y: 0 };
    this.held.clear();
    this.hits.clear();
  }
  asInput(): Input {
    return this as unknown as Input;
  }
}

/**
 * How the oracle plays him:
 * - `assign`: hands off, the AI's snap (the plumbing check: identical to no user at all)
 * - `hawk`: his assignment until the throw, then `latency` s later to the ball's landing spot, eyes on it,
 *   and on the sweet spot PLAY BALL or SWAT, whichever is worth more from where he is (a pick `pickWorth`
 *   catches; only counted with the ball meter up: a ball coming to him)
 * - every policy, once it has steered (`Play.defManual`), chases a carrier and dives the moment he's in reach
 * - `jump`: sits on the receiver nearest him from the snap (where he'll be, `jumpLead` s on), eyes on the QB,
 *   then the hawk's ball
 * - `shadow`: runs with the receiver nearest him (as he was `latency` s ago), then the hawk's ball
 */
export type BotPolicy = 'assign' | 'hawk' | 'jump' | 'shadow';
export const BOT = { jumpLead: 0.6, stop: 0.4, pickWorth: 3 };

/** An 8-way stick toward `v`, as keys give it. */
function stick(v: Vec): Vec {
  const l = Math.hypot(v.x, v.y);
  if (l < BOT.stop) return { x: 0, y: 0 };
  const a = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4);
  const r = (x: number) => (Math.abs(x) < 1e-9 ? 0 : Math.sign(x));
  return { x: r(Math.cos(a)), y: r(Math.sin(a)) };
}

export class DefBot {
  private readonly input = new BotInput();
  private thrownAt = -1;
  private pressed = false;
  private seen: { t: number; pos: Map<Player, Vec> }[] = [];

  constructor(private readonly policy: BotPolicy, private readonly latency: number) {}

  /** This step's input for the user's defender on `play`. */
  step(play: Play): Input {
    const inp = this.input;
    inp.reset();
    const d = play.defControlled;
    if (!d || this.policy === 'assign' || play.phase === 'presnap' || play.phase === 'over') return inp.asInput();
    // What he saw `latency` ago.
    const now = new Map<Player, Vec>();
    for (const o of play.off) now.set(o, { ...o.pos });
    this.seen.push({ t: play.time, pos: now });
    while (this.seen.length > 1 && this.seen[1].t <= play.time - this.latency) this.seen.shift();
    const then = this.seen[0].pos;
    if (play.phase === 'air' && play.ballTarget) {
      if (this.thrownAt < 0) this.thrownAt = play.time;
      if (play.time - this.thrownAt < this.latency) return inp.asInput();
      inp.held.add('ShiftLeft');
      const to = play.ballTarget;
      inp.ax = stick({ x: to.x - d.pos.x, y: to.y - d.pos.y });
      if (!this.pressed && play.ballTimeLeft() <= USER_DEF.lead + 1 / 120) {
        this.pressed = true;
        // The better call from where he is (`BOT.pickWorth` a pick against a catch): the oracle's ceiling.
        const edge = play.ballEdge(d);
        const o = { pos: 1, cth: 70 };
        const worth = (k: 'play' | 'swat') => {
          const r = callOdds(k, edge, { cth: d.r.cth, prc: d.r.prc }, o);
          return r.int * BOT.pickWorth - r.catch;
        };
        inp.hits.add(worth('play') > worth('swat') ? 'Space' : 'KeyE');
      }
      return inp.asInput();
    }
    if (play.phase === 'run') {
      // Once he's his, he's the bot's to the whistle: after the carrier (the assist takes the angle), SPACE in reach.
      const c = play.carrier;
      if (!play.defManual || !c || c.side !== 'off' || c === d) return inp.asInput();
      inp.ax = stick({ x: c.pos.x - d.pos.x, y: c.pos.y - d.pos.y });
      if (play.diveReach()) inp.hits.add('Space');
      return inp.asInput();
    }
    if (play.phase !== 'live' && play.phase !== 'snap') return inp.asInput();
    if (this.policy === 'hawk') return inp.asInput();
    // The receiver nearest him (as he saw it).
    let best: Player | null = null;
    let bd = Infinity;
    for (const o of play.off) {
      if (!isEligible(o) || o.down || o === play.qb) continue;
      const p = then.get(o) ?? o.pos;
      const dd = dist(p, d.pos);
      if (dd < bd) {
        bd = dd;
        best = o;
      }
    }
    if (!best) return inp.asInput();
    const at = then.get(best) ?? best.pos;
    const to = this.policy === 'jump' ? { x: at.x + best.vel.x * BOT.jumpLead, y: at.y + best.vel.y * BOT.jumpLead } : at;
    if (this.policy === 'jump') inp.held.add('ShiftLeft');
    inp.ax = stick({ x: to.x - d.pos.x, y: to.y - d.pos.y });
    return inp.asInput();
  }
}

/**
 * A possession with a bot on the user's defender at `slot` on every snap (`driveSteps`, each snap a `SnapRun`):
 * the drive, and for each snap the slot he played (when he was on the field).
 */
export function botDrive(
  off: EngineSide, def: EngineSide, start: number, rng: Rng, clock: DriveClock, opts: EngineOpts, slot: string, bot: () => DefBot,
): EngineDrive {
  const g = driveSteps(off, def, start, rng, clock, opts);
  let s = g.next();
  while (!s.done) {
    const q = s.value;
    const run = new SnapRun(q.off, q.def, q.drive, q.sit, q.rng, q.brain, q.opts);
    run.play.defControlled = run.play.def.find((p) => p.slot === slot) ?? null;
    const b = bot();
    run.snap();
    while (!run.done()) run.step(b.step(run.play));
    s = g.next({ r: run.result() });
  }
  return s.value;
}
