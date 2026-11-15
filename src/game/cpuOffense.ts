import { personnelOf } from './resolvePlay';
import { CONCEPTS } from '../data/concepts';
import { DEF_CALLS, type DefCall, type Disguise } from '../data/defenses';
import { situationMix, type DefIdentity } from '../data/identity';
import { callWeight, type OffStyle } from '../data/offStyles';
import type { PlayDef } from '../data/plays';
import { PASS_FAMILIES } from '../data/playTags';
import { FIELD_W } from '../engine/constants';
import type { Input } from '../engine/input';
import { clamp, dist, gauss, lerp, mulberry32, norm, type Rng, type Vec } from '../engine/math';
import { autoRun } from '../sim/ai';
import { passParams } from '../sim/ball';
import { aimLag } from '../sim/passing';
import { isEligible, maxSpeed, type Player } from '../sim/player';
import { SCREEN_SET, type Play } from './playState';
import { damage } from './offModel';
import { ML_OC, noteShift, ocCheckSkill, ocLean, shellRead, type OcBrain } from './ocBrain';
import { OFF_ID, qbLean, type OffIdentity } from '../data/offIdentity';
import type { RosterPlayer } from '../data/teams';
import { passOdds, type Situation } from './situation';

/**
 * The CPU on offense, played through the engine (docs/ENGINEDRIVES.md): the OC's call for a snap
 * (`ocCall`) and the QB who runs it (`CpuQb`), a step at a time. The QB decides only from what's on
 * the field (separation, depth, the rush, the clock since the snap), through his ratings: a reader
 * with a low `awr` sees separation that isn't there and holds the ball too long, so a bad QB is
 * visibly worse. Nothing here reads the play's outcome.
 */

// ---------------------------------------------------------------- the call

export type CallSit = 'normal' | 'long' | 'short' | 'hurry';

/** The style's call situation for a snap (`CALL_SITUATION`): the two-minute drill when behind late, else by down and distance. */
export function callSit(down: number, toGo: number, sit?: Situation): CallSit {
  if (sit && sit.secsLeft <= 120 && sit.lead <= 0) return 'hurry';
  if (down >= 3 && toGo >= 7) return 'long';
  if (down >= 3 && toGo <= 2) return 'short';
  return 'normal';
}

/** A play of this kind from the book, weighted by the style's call weights in the situation; null if the book has none. */
export function bookPick(book: readonly PlayDef[], style: OffStyle, keep: (p: PlayDef) => boolean, sit: CallSit, r: () => number): PlayDef | null {
  const mine = book.filter(keep);
  if (!mine.length) return null;
  const w = mine.map((p) => callWeight(style, p.tags.family, sit));
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < mine.length; i++) if ((x -= w[i]) <= 0) return mine[i];
  return mine[mine.length - 1];
}

export interface OcPlan {
  book: readonly PlayDef[];
  style: OffStyle;
  /** The game plan's base pass share (`autoGamePlan`). */
  passShare: number;
  /** The offense's identity (`offIdentity`): his taste, go-to plays, targets and the QB's leans. Missing plays the style alone. */
  id?: OffIdentity;
}

/**
 * The CPU OC on money downs, over the game plan's pass share (`passOdds`, which the season sim's casting reads too):
 * on 3rd and 4th he throws at least `longPass` of the time at 7+ to go and `midPass` at 3-6 (FBS teams throw about
 * 85% on 3rd and long); at a yard or less he goes to his short-yardage call (`short` plays: the sneak) `inches` of the
 * time he runs.
 */
export const CPU_OC = { longPass: 0.85, midPass: 0.6, inches: 0.6 };

const PASS_FAM = new Set<string>(PASS_FAMILIES);
export const isPassCall = (p: PlayDef): boolean => PASS_FAM.has(p.tags.family);

/**
 * The OC's call: pass or run by the situation (`passOdds`), then a play of that kind from his book by
 * his style. Short-yardage plays (the sneak) only on short yardage; a last-snap heave is a shot.
 */
export function ocCall(oc: OcPlan, sit: Situation, r: () => number, desperate = false, brain: OcBrain | null = null): PlayDef {
  const cs = callSit(sit.down, sit.toGo, sit);
  const short = sit.toGo <= 2 || sit.yardsToGoal <= 2;
  const ok = (p: PlayDef) => !p.short || short;
  if (desperate) {
    const shot = bookPick(oc.book, oc.style, (p) => p.tags.family === 'shot' || p.tags.family === 'dropback', cs, r);
    if (shot) return shot;
  }
  // His own taste (`OffIdentity`), and with a brain, his lean against this defense (`ocLean`).
  const money = sit.down >= 3 || sit.yardsToGoal <= 20;
  const taste = (p: PlayDef) => {
    if (!oc.id) return 1;
    const fav = oc.id.favorites.includes(p.id) ? OFF_ID.favW * (money ? OFF_ID.money : 1) : 1;
    return (oc.id.fam[p.tags.family] ?? 1) * fav;
  };
  const cands = oc.book.filter(ok);
  const lean = brain ? ocLean(brain, cands, sit) : null;
  let po = passOdds(oc.passShare + (oc.id?.passLean ?? 0), sit);
  if (lean) {
    // Pass or run by which side of his book this defense gives more to.
    let wp = 0, np = 0, wr = 0, nr = 0;
    for (const p of cands) {
      const w = callWeight(oc.style, p.tags.family, cs) * taste(p);
      if (isPassCall(p)) { wp += w * lean.worth.get(p)!; np += w; } else { wr += w * lean.worth.get(p)!; nr += w; }
    }
    if (np && nr) {
      const lo = Math.log(clamp(po, 0.02, 0.98) / (1 - clamp(po, 0.02, 0.98))) + lean.lam * lean.tilt * (wp / np - wr / nr);
      po = 1 / (1 + Math.exp(-lo));
    }
  }
  if (sit.down >= 3 && sit.toGo >= 7) po = Math.max(po, CPU_OC.longPass);
  else if (sit.down >= 3 && sit.toGo >= 3) po = Math.max(po, CPU_OC.midPass);
  const pass = r() < po;
  // Inches on a money down: the short-yardage call (the sneak, the wedge) if the book has one.
  if (!pass && sit.down >= 3 && sit.toGo <= 1 && r() < CPU_OC.inches) {
    const sneak = bookPick(oc.book, oc.style, (p) => !!p.short, cs, r);
    if (sneak) return sneak;
  }
  if (!oc.id && !lean) {
    return (
      bookPick(oc.book, oc.style, (p) => ok(p) && isPassCall(p) === pass, cs, r) ??
      bookPick(oc.book, oc.style, ok, cs, r) ??
      oc.book[Math.floor(r() * oc.book.length)]
    );
  }
  let mine = cands.filter((p) => isPassCall(p) === pass);
  if (!mine.length) mine = cands.length ? cands : [...oc.book];
  const base = mine.map((p) => callWeight(oc.style, p.tags.family, cs) * taste(p));
  let w = base;
  if (lean) {
    // The DC's form (`dcMix`): his own mix, with `lam` of it handed to the plays this defense gives more to.
    const mean = mine.reduce((a, p, i) => a + base[i] * lean.worth.get(p)!, 0) / (base.reduce((a, b) => a + b, 0) || 1);
    const raw = mine.map((p, i) => base[i] * Math.exp(lean.beta * (lean.worth.get(p)! - mean)));
    const sb = base.reduce((a, b) => a + b, 0) || 1;
    const sr = raw.reduce((a, b) => a + b, 0) || 1;
    w = mine.map((_, i) => (1 - lean.lam) * (base[i] / sb) + (lean.lam * raw[i]) / sr);
    noteShift(brain!, mine, base, w);
  }
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < mine.length; i++) if ((x -= w[i]) <= 0) return mine[i];
  return mine[mine.length - 1];
}

// ---------------------------------------------------------------- the presnap check

/**
 * The QB's presnap check (`ocCheck`, `CPU_CHECK`). He sees the box (a defense can't hide its numbers) and the
 * shell (a disguise shows another one), and weighs every call that could be behind it: the defense's mix for the
 * situation (its identity, which the scouting report has) x how often that call would show this shell (straight,
 * or disguised `ident.disguise` of the time). Against that, each play in the same personnel (nobody subs once the
 * huddle breaks) gets its film damage (`damage`: the film room's success plus explosives, `filmPayoff.ts`), the
 * number the DC reads the other way. He checks to the best when it beats the call by `gain`, with odds by `prc`.
 * - `odds`: from `prc` 40 to 99; he stays in a run on short yardage and in a pass on 3rd and long
 * - `boxSlack`: a call's box counts as seen within this many of the box he sees (a walked-down safety reads as one)
 * - `shift`: what more a play from another formation has to beat the call by: the shift shows it, and the DC may
 *   re-check (`recheckFor`), so he'd rather check in the formation he's in (docs/DEFENSE.md, "The presnap")
 */
export const CPU_CHECK = { odds: [0.2, 0.8], gain: 0.06, boxSlack: 0, give: 0.5, shift: 0.04 };

/**
 * What he may check to (`CHECK_TO`): out of a run, another run or the quick game (a quick throw, a screen, an RPO:
 * "check with me" against a loaded box); out of a pass, the same family (a sibling concept). He doesn't check into
 * a deep shot: the film table measures shots with the harness QB's perfect deep judgment, so it rates them far
 * above what a real passer gets, and checking by it sent a third of the snaps deep.
 */
const CHECK_TO = new Set(['quick', 'screen', 'rpo']);
function checkable(from: PlayDef, to: PlayDef): boolean {
  if (!isPassCall(from)) return !isPassCall(to) || CHECK_TO.has(to.tags.family);
  return to.tags.family === from.tags.family;
}

/** How often a call shows `shell` presnap: straight, or disguised as one (`ident.disguise` of its snaps). */
const showsShell = (ident: DefIdentity) => (c: DefCall, shell: string): number =>
  (c.shell === shell ? 1 - ident.disguise : 0) + (c.disguises?.some((d) => d.show === shell) ? ident.disguise : 0);

/**
 * The calls that could be behind what he sees, by weight. Without a brain: the defense's mix for the situation
 * (its identity, which the scouting report has) × how often each call shows that shell. With his OC's brain:
 * what the OC expects and what he's seen hide behind that shell today (`shellRead`).
 */
export function presnapRead(ident: DefIdentity, call: DefCall, disguise: Disguise | null, sit: Situation, brain: OcBrain | null = null): [DefCall, number][] {
  const shell = disguise?.show ?? call.shell;
  if (brain) {
    const out = shellRead(brain, sit, shell, call.box, CPU_CHECK.boxSlack, showsShell(ident));
    return out.length ? out : [[call, 1]];
  }
  const mix = situationMix(ident, sit.down, sit.toGo, sit.yardsToGoal, undefined, false, sit);
  const shows = showsShell(ident);
  const out: [DefCall, number][] = [];
  for (const c of DEF_CALLS) {
    const w = mix[c.id] ?? 0;
    if (w <= 0 || Math.abs(c.box - call.box) > CPU_CHECK.boxSlack) continue;
    const v = shows(c, shell);
    if (v > 0) out.push([c, w * v]);
  }
  return out.length ? out : [[call, 1]];
}

/** A play's expected damage over the read, on the engine's table (what each family gets against each call with this QB). */
export function readDamage(p: PlayDef, read: [DefCall, number][]): number {
  let d = 0;
  let w = 0;
  for (const [c, cw] of read) {
    d += cw * damage(p, c, CPU_CHECK.give, undefined, 'engine');
    w += cw;
  }
  return d / w;
}

/** The check: a better play for what he sees in the same personnel (another formation is a shift), or null to run the call. */
export function ocCheck(oc: OcPlan, play: PlayDef, read: [DefCall, number][], sit: Situation, prc: number, r: () => number, brain: OcBrain | null = null, soft = 0): PlayDef | null {
  // Corners playing off this snap: the quick game and screens are there for the taking (`ML_OC.x.check`).
  const free = (p: PlayDef) => (p.tags.family === 'quick' || p.tags.family === 'screen' ? ML_OC.x.check * soft : 0);
  if (r() >= Math.min(0.95, lerp(CPU_CHECK.odds[0], CPU_CHECK.odds[1], clamp((prc - 40) / 59, 0, 1)) * ocCheckSkill(brain))) return null;
  const pass = isPassCall(play);
  const keepKind = (sit.down >= 3 && sit.toGo >= 7) || sit.toGo <= 2 || sit.yardsToGoal <= 2;
  const now = readDamage(play, read) + free(play);
  let best: PlayDef | null = null;
  let bestD = now + CPU_CHECK.gain;
  for (const p of oc.book) {
    if (p === play || personnelOf(p.formation) !== personnelOf(play.formation) || (p.short && sit.toGo > 2) || (keepKind && isPassCall(p) !== pass)) continue;
    if (!checkable(play, p)) continue;
    const d = readDamage(p, read) + free(p) - (p.formation.name !== play.formation.name ? CPU_CHECK.shift : 0);
    if (d > bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------- the QB

/**
 * The CPU QB's read (`CpuQb`):
 * - `window`: when his read opens (s after the snap) by family; `windowSd` jitters it
 * - `scan`: seconds per look at the field, for `awr` 40 → 99
 * - `open`: the window (yd, `seen`: how far the nearest defender is from the catch spot when the ball gets there, each closing
 *   after `react` s) that's open on a short throw, plus `openPerYd` for each yard deeper (depth counted to `cap`)
 * - `eyes`: a receiver is a target once he's looking for the ball this much (`Player.eyes`)
 * - `noise`: how far off his read of separation is (sd, yd) for `awr` 40 → 99
 * - `hold`: seconds past the window before he takes what's there, for `awr` 40 → 99
 * - `check`: the window he'll throw a checkdown into (caught no deeper than `checkDepth` yd); `pressure`: a rush this close (`passContext`, 0..1) makes him decide now
 * - `away`: seconds past the hold before he'll throw it away without a rush on him; on each scan after that, or with a rusher
 *   on him, he throws it away with odds `awayAwr` (by `awr`) x `awayPerScan`, else he hangs in (and may take the sack)
 * - `scramble`: he takes off with `spd` past `spd`, when the space `room` yd ahead of him is free, or always past `forced` pressure
 * - `rpoPull`: on an RPO he gives when the box has no more defenders than his blockers (line and TEs) plus this
 * - `rpoHold`: when an RPO's pulled throw goes (to the tagged route if it's open, else he reads the rest)
 * - `floor`, `fall`: high to low, by where the ball would be caught. A dropback or a shot reads deep first and comes down to the checkdown; on
 *   3rd and 4th down he looks past the sticks until his hold runs out
 */
export const CPU_QB = {
  window: { quick: 0.8, dropback: 1.45, shot: 2.0, screen: 0.55, pa: 2.0, boot: 1.8, rpo: 1.0 } as Record<string, number>,
  windowSd: 0.1,
  /** A line-release screen (`screen`) goes this long after the line lets its rushers go (`SCREEN_SET`). */
  screenAfter: 1.0,
  /** ... and waits up to this much longer for the screen man to look for it. */
  screenWait: 0.6,
  scan: [0.3, 0.12],
  open: 1.0,
  openPerYd: 0.11,
  react: 0.35,
  eyes: 0.5,
  cap: 24,
  noise: [1.8, 0.35],
  hold: [0.45, 1.05],
  check: 0.3,
  checkDepth: 12,
  pressure: 0.6,
  away: 0.6,
  awayAwr: [0.35, 0.85],
  awayPerScan: 0.1,
  scramble: { spd: 74, room: 5, forced: 0.85 },
  rpoPull: 0,
  rpoHold: 1.3,
  rpoTuck: 0.4,
  /** A throw caught short of `behindFrom` yd needs `behind` yd more window: the catch is where his run starts, behind the line. */
  behind: 2,
  behindFrom: 1,
  /** The progression: the shallowest depth (yd) he'll throw to when his read opens, by family; it comes down `fall` yd a second. */
  floor: { quick: 0, dropback: 8, shot: 18, screen: 0, pa: 12, boot: 7, rpo: 0 } as Record<string, number>,
  fall: 8,
  /** How deep (yd past the line, where the ball would meet him) a call's read counts depth; past it he takes the most open (`preferOpen` a yard of window). */
  reach: { quick: 8, dropback: 16, shot: 30, screen: 0, pa: 22, boot: 16, rpo: 10 } as Record<string, number>,
  preferOpen: 1,
  /** ... counting at most `openCap` yd of window past what he needs: an open man is open, and the progression and his guys decide. */
  openCap: 3,
  /** His aim trails a moving receiver as a user's line does: `aimLag`'s tau x his speed x this (mean, sd). */
  lag: [1, 0.6],
  /**
   * His judgment on a long throw (a user's is the mouse): past `from` yd, his placement misses by `per` yd a yard
   * x (`top` - `dac`/100), along the throw (over or under) and `across` of that sideways. On top of throw error.
   */
  far: { from: 12, per: 0.25, top: 1.4, across: 0.6 },
  /**
   * His eyes go to his guys first (`OffIdentity.targets`, times what's working this game): a receiver scores
   * `score` yd a unit of ln(his share / an even share) in the read, and gets `trust` yd of window forgiven a
   * unit; × `money` on 3rd and 4th down and in the red zone.
   */
  favor: { score: 5, trust: 0.8, money: 1.4 },
  /**
   * Tuck it and run (`OffIdentity.qb.runLean`, 0..1): his odds on each decision with room ahead, `forced` with a
   * rusher on him, `open` when his time's up and nobody's open, `lane` a scan when his read comes up empty with a wide
   * lane in front of him; from a lean of 0 to 1. Room is a spot `scramble.room` yd ahead (or angled off) with no free
   * defender within 0.8 of that: a rusher on a block doesn't close a lane.
   */
  run: { forced: [0.12, 0.9], open: [0.04, 0.45], lane: [0.015, 0.1] },
  /**
   * Buying time: a passer with the rush on him slides away from it outside the pocket, `depth` yd behind the line,
   * once a rusher is `at` close (`passContext`), and keeps reading on the move (his `tup` and the moving aim lag). After `extend` s out there he runs if he can,
   * else throws it away with odds `away` × his `awayAwr` a scan.
   */
  escape: { extend: 1.1, depth: 1.5, away: 0.5, at: 0.35 },
  /** A gunslinger's deep windows: `openPerYd` × (1 - `aggr` × aggression). */
  aggr: 0.25,
};

/**
 * The two-minute drill (`Play.clockOut`): a catch spot within `edge` yd of a sideline scores `sideline` yd more
 * in his read (the out, the comeback, the corner: the catch that gets out of bounds), and his odds of throwing it
 * away on each look are `away` x (at most certain), rather than take a sack with the clock running.
 */
export const CLOCK_OUT = { sideline: 3, edge: 9, away: 3 };

/** What the QB brings to a snap beyond the play: the down, his targets and his leans (`OffIdentity`). */
export interface QbCtx {
  down: number;
  toGo: number;
  yardsToGoal?: number;
  /** Prior target shares by slot (already pulled by what's working); missing is even. */
  favor?: Record<string, number>;
  runLean?: number;
  aggression?: number;
  /** Who's on each receiver (`defPull`): his man playing off, a weak cover man, one who's been beaten on that route; null turns it off. */
  defPull?: ((def: Player, route: string | null) => number) | null;
}

/** Routes that are thrown behind the line: a screen's target. */
const SCREEN_ROUTES = new Set(['screen', 'smoke', 'bubble', 'tunnel', 'swing']);

const lerpAwr = (pair: number[], awr: number) => lerp(pair[0], pair[1], clamp((awr - 40) / 59, 0, 1));

/** An input with nobody touching anything, except a steer and the sprint. */
function steerInput(ax: Vec | null): Input {
  return {
    mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
    axis: () => ax ?? { x: 0, y: 0 },
    isDown: (...codes: string[]) => !!ax && codes.includes('ShiftLeft'),
    hit: () => false,
    endStep: () => {},
  } as unknown as Input;
}
const IDLE = steerInput(null);

export interface QbLog {
  /** Seconds after the snap the ball went (or the scramble started). */
  at: number | null;
  /** Why he threw: 'read' (an open man on the progression), 'check' (the checkdown), 'hot', 'screen', 'rpo', 'away' (thrown away). */
  why: 'read' | 'check' | 'hot' | 'screen' | 'rpo' | 'away' | null;
  scrambled: boolean;
  /** Why he ran: an RPO pull he tucked, the rush on him, nobody open, or out of the pocket with his time bought. */
  runWhy?: 'rpo' | 'forced' | 'open' | 'outside' | 'lane';
  /** He left the pocket to buy time (`escape`) and stayed a passer. */
  escaped?: boolean;
  /** The throw went on the move, outside the pocket. */
  moved?: boolean;
  /** An RPO's give (true) or pull (false); null on anything else. */
  rpoGive: boolean | null;
  /** At the throw (diagnostics): the true window (`window`), the nearest defender to the receiver, and his route. */
  win?: number;
  sep?: number;
  route?: string | null;
}

/**
 * The CPU QB on one snap. Call `step` before each `play.update(STEP, qb.input, cam)`. His own stream
 * (from `seed`) drives his misreads, so the play's stream isn't touched by how he reads.
 */
export class CpuQb {
  readonly log: QbLog = { at: null, why: null, scrambled: false, rpoGive: null };
  input: Input = IDLE;
  private readonly r: Rng;
  private readonly window: number;
  private readonly hold: number;
  private readonly scan: number;
  private readonly noise: number;
  private nextScan = 0;
  private rpoRead = false;
  private hotAt = 0;
  private screenGone = false;
  private readonly rpoGive: boolean | null;
  private readonly tagged: Set<string>;
  private readonly floor: number;
  /** Yards to the sticks on 3rd and 4th down (0 otherwise). */
  private readonly need: number;
  /** His pull toward each receiver (yd of score, by slot), his run lean, how much tighter he'll throw deep. */
  private readonly pull: Record<string, number> = {};
  private readonly runLean: number;
  private readonly perYd: number;
  /** Outside the pocket buying time: since when, and to which side. */
  private escapeAt: number | null = null;
  private escapeSide = 0;

  constructor(private readonly play: Play, seed: number, at: QbCtx = { down: 1, toGo: 10 }) {
    this.r = mulberry32(seed);
    const p = play.playDef;
    const awr = play.qb.r.prc;
    const fam = p.tags.family;
    this.window = Math.max(0.3, (CPU_QB.window[fam] ?? CPU_QB.window.dropback) + gauss(this.r) * CPU_QB.windowSd);
    // A screen behind the line (the line releases at `SCREEN_SET`) goes once his blockers are out in front.
    if (p.screen) this.window = SCREEN_SET + CPU_QB.screenAfter + Math.abs(gauss(this.r)) * CPU_QB.windowSd;
    this.hold = lerpAwr(CPU_QB.hold, awr);
    this.scan = lerpAwr(CPU_QB.scan, awr);
    this.noise = lerpAwr(CPU_QB.noise, awr);
    this.nextScan = this.window;
    this.floor = CPU_QB.floor[fam] ?? 0;
    this.need = at.down >= 3 ? at.toGo : 0;
    const lean = qbLean(play.qb.slot ? { r: play.qb.r } as RosterPlayer : undefined, 'power');
    this.runLean = at.runLean ?? lean.runLean;
    this.perYd = CPU_QB.openPerYd * (1 - CPU_QB.aggr * (at.aggression ?? lean.aggression));
    if (at.favor) {
      const n = Object.keys(at.favor).length || 1;
      const money = at.down >= 3 || (at.yardsToGoal ?? 99) <= 20 ? CPU_QB.favor.money : 1;
      for (const [sl, v] of Object.entries(at.favor)) this.pull[sl] = Math.log(Math.max(0.02, v * n)) * money;
    }
    // Who's lined up on each receiver: the nearest defender before the snap.
    if (at.defPull) {
      for (const o of play.off) {
        if (!isEligible(o) || o.isBlocker || !o.routeName) continue;
        let near: Player | null = null;
        let nd = Infinity;
        for (const d of play.def) {
          const dd = dist(d.pos, o.pos);
          if (dd < nd) { nd = dd; near = d; }
        }
        if (near) this.pull[o.slot] = (this.pull[o.slot] ?? 0) + at.defPull(near, o.routeName);
      }
    }
    this.tagged = new Set();
    if (p.read === 'rpo') {
      for (const c of [p.strong, p.weak]) if (c) for (const rt of Object.values(CONCEPTS[c].routes)) this.tagged.add(rt!);
      // The presnap read: a box with more defenders than blockers gets the pass.
      const blockers = play.off.filter((o) => o.role === 'OL' || o.role === 'TE').length;
      this.rpoGive = play.defCall.box <= blockers + CPU_QB.rpoPull;
    } else {
      this.rpoGive = null;
    }
    this.log.rpoGive = this.rpoGive;
  }

  /** One step: the handoff, the throw, the scramble, or the throwaway; then whoever has the ball runs on the AI. */
  step(): void {
    const play = this.play;
    const p = play.playDef;
    const qb = play.qb;
    const since = play.time - play.snapTime;
    this.input = IDLE;
    if (play.phase === 'live' && play.carrier === qb && !play.thrown) {
      if (play.scramble || this.log.scrambled) {
        this.steerScramble();
      } else if ((p.kind === 'run' && this.rpoGive !== false) || (p.read === 'rpo' && this.rpoGive)) {
        // A run, or an RPO he's giving (RPOs are `kind: 'pa'`): the handoff at the mesh.
        if (play.giveDue()) play.handoff();
      } else if (p.read === 'rpo' && this.rpoGive === false) {
        if (since < CPU_QB.rpoHold) return;
        const tag = this.pick((o) => !!o.routeName && this.tagged.has(o.routeName));
        if (!this.rpoRead && tag && this.seen(tag) >= this.openAt(this.windowAt(tag).depth)) this.throwTo(tag, 'rpo');
        else if (since >= CPU_QB.rpoHold + CPU_QB.rpoTuck) {
          // Nothing there behind a run-blocking line: tuck it and run.
          this.log.scrambled = true;
          this.log.runWhy = 'rpo';
          this.steerScramble();
        } else this.read(since);
        this.rpoRead = true;
      } else if (p.kind !== 'run' && !p.qbRun) {
        if (this.escapeAt !== null) this.steerEscape();
        this.read(since);
      }
    }
    // Whoever has it after a catch, handoff or keep runs on the AI.
    if (play.phase === 'run' && play.carrier?.side === 'off') play.controlled = null;
    if (p.kind === 'run' && (play.handedOff || play.kept || (p.qbRun && play.phase === 'run'))) play.controlled = null;
  }

  /** The pocket: screens at once, then the progression on his scans, then what's there, then away or a sack. */
  private read(since: number): void {
    const play = this.play;
    const qb = play.qb;
    const pressure = play.passContext().pressure;
    if (play.playDef.screen && !this.screenGone) {
      if (since < this.window) return;
      // The designed throw: the screen man, once his head is around (`eyes`), or at the latest `screenWait` past
      // the window. Nobody there: he reads it out.
      const man = play.off.find((o) => isEligible(o) && !o.isBlocker && !o.down && !!o.routeName && SCREEN_ROUTES.has(o.routeName) && since >= o.routeDelay);
      if (man && man.eyes < CPU_QB.eyes && since < this.window + CPU_QB.screenWait) return;
      this.screenGone = true;
      if (man) {
        this.throwTo(man, 'screen');
        return;
      }
    }
    // Hot: a free rusher in his face before the read opens (looked at as often as he scans).
    if (since < this.window) {
      if (pressure >= CPU_QB.scramble.forced && since >= this.hotAt) {
        this.hotAt = since + this.scan;
        const hot = this.pick((o) => o.pos.x - play.los < 8);
        if (hot && this.seen(hot) >= CPU_QB.check) this.throwTo(hot, 'hot');
        else if (!this.tryScramble(pressure)) this.startEscape();
      }
      return;
    }
    // He decides on his scans (`scan`): a look at the field, not a fresh misread every step.
    if (since < this.nextScan) return;
    // A rusher on him speeds his clock up.
    this.nextScan = since + (pressure >= CPU_QB.scramble.forced ? this.scan / 2 : this.scan);
    // High to low: of the men open enough for their depth and no shallower than where his progression is,
    // the deepest up to how deep this call looks (`reach`), then the most open.
    const past = since - this.window;
    const late = past >= this.hold;
    let floor = late ? 0 : Math.max(0, this.floor - past * CPU_QB.fall);
    if (this.need && !late) floor = Math.max(floor, Math.min(this.need - 1, CPU_QB.cap));
    const reach = CPU_QB.reach[play.playDef.tags.family] ?? CPU_QB.reach.dropback;
    let best: Player | null = null;
    let score = -Infinity;
    for (const o of this.ready()) {
      const at = this.windowAt(o);
      const d = clamp(at.depth, 0, CPU_QB.cap);
      if (d + 0.5 < floor) continue;
      const w = at.w + gauss(this.r) * this.noise;
      const pull = this.pull[o.slot] ?? 0;
      const need = this.openAt(at.depth) - CPU_QB.favor.trust * pull;
      const sc = Math.min(d, reach) + CPU_QB.preferOpen * Math.min(w - need, CPU_QB.openCap) + CPU_QB.favor.score * pull + this.sidelineBonus(o);
      if (w >= need && sc > score) {
        best = o;
        score = sc;
      }
    }
    if (best) {
      this.throwTo(best, 'read');
      return;
    }
    // Nobody open and a wide lane: a runner sees it.
    if (this.escapeAt === null && this.tryScramble(pressure, false, true)) return;
    if (!late && pressure < CPU_QB.pressure) {
      // The pocket's closing and nobody's open yet: a runner may take off, anyone else slides out and keeps looking.
      if (pressure >= CPU_QB.escape.at && this.escapeAt === null && !this.tryScramble(pressure)) this.startEscape();
      return;
    }
    // Out of time or under pressure: the checkdown, then his feet, then away (a smarter QB sees it sooner), else he hangs in.
    const o = this.pick((r) => this.windowAt(r).depth <= CPU_QB.checkDepth);
    if (o && this.seen(o) >= CPU_QB.check) {
      this.throwTo(o, 'check');
      return;
    }
    const awayOdds = lerpAwr(CPU_QB.awayAwr, qb.r.prc);
    const k = play.clockOut ? CLOCK_OUT.away : 1;
    if (this.escapeAt !== null) {
      // Out of the pocket: once he's bought what time there is, he runs if he can, else throws it away.
      if (since - this.escapeAt < CPU_QB.escape.extend) return;
      if (this.tryScramble(pressure, true)) return;
      if (this.r() < Math.min(1, awayOdds * CPU_QB.escape.away * k)) this.throwAway();
      return;
    }
    if (this.tryScramble(pressure)) return;
    if (pressure >= CPU_QB.escape.at && this.startEscape()) return;
    const out = since >= this.window + this.hold + CPU_QB.away;
    if ((pressure >= CPU_QB.scramble.forced || out) && this.r() < Math.min(1, awayOdds * CPU_QB.awayPerScan * k)) this.throwAway();
  }

  /**
   * The window as he reads it: where the ball would meet `o` (`cpuAim`), and how far short of that spot
   * the nearest defender still is when it gets there (each closes at his top speed after `react` s), plus
   * his misread. Negative: someone's there first.
   */
  private seen(o: Player): number {
    return this.windowAt(o).w + gauss(this.r) * this.noise;
  }

  /** In the two-minute drill, a catch near a sideline (`CLOCK_OUT`): yards of read score. */
  private sidelineBonus(o: Player): number {
    if (!this.play.clockOut) return 0;
    const y = this.play.cpuAim(o).aim.y;
    return Math.min(y, FIELD_W - y) <= CLOCK_OUT.edge ? CLOCK_OUT.sideline : 0;
  }

  /** The true window on a throw to `o` now (`seen` without the misread), and how deep past the line the ball would meet him. */
  private windowAt(o: Player): { w: number; depth: number } {
    const play = this.play;
    const { aim, kind } = play.cpuAim(o);
    const t = passParams(dist(play.qb.pos, aim), play.qb.r.arm, kind).dur;
    let sep = Infinity;
    for (const d of play.def) if (!d.down) sep = Math.min(sep, dist(d.pos, aim) - maxSpeed(d) * Math.max(0, t - CPU_QB.react));
    return { w: sep, depth: aim.x - play.los };
  }

  /** Receivers out on their routes, in bounds, with their heads around to him (`eyes`, sim/ai.ts): he throws on the break, not before it. */
  private ready(): Player[] {
    const play = this.play;
    const since = play.time - play.snapTime;
    return play.off.filter(
      (o) => isEligible(o) && !o.isBlocker && !o.down && since >= o.routeDelay && o.eyes >= CPU_QB.eyes && o.pos.y > 0.5 && o.pos.y < FIELD_W - 0.5,
    );
  }

  /** The most open receiver (as he reads it), of those `keep` allows. */
  /** The window he wants for a throw caught `depth` yd past the line: more for deeper, and room to run for one caught behind it. */
  private openAt(depth: number): number {
    return CPU_QB.open + this.perYd * clamp(depth, 0, CPU_QB.cap) + (depth < CPU_QB.behindFrom ? CPU_QB.behind : 0);
  }

  private pick(keep: (o: Player) => boolean = () => true): Player | null {
    let best: Player | null = null;
    let sep = -Infinity;
    for (const o of this.ready()) {
      if (!keep(o)) continue;
      const s = this.seen(o) + CPU_QB.favor.trust * (this.pull[o.slot] ?? 0);
      if (s > sep) {
        best = o;
        sep = s;
      }
    }
    return best;
  }

  private throwTo(o: Player | null, why: QbLog['why']): void {
    if (!o) return;
    this.log.win = Math.round(this.windowAt(o).w * 10) / 10;
    let sep = Infinity;
    for (const d of this.play.def) if (!d.down) sep = Math.min(sep, dist(d.pos, o.pos));
    this.log.sep = Math.round(sep * 10) / 10;
    this.log.route = o.routeName;
    const { aim, kind } = this.play.cpuAim(o);
    // He aims as a user does (`aimLag`): his line trails a moving target by about its speed x the lag, his nerves included.
    const { pressure, moving } = this.play.passContext();
    const { tau } = aimLag(this.play.qb.r, pressure, moving, this.play.aimNerves); // a shaken QB's nerves too (`shakenAimLag`)
    const trail = tau * (CPU_QB.lag[0] + gauss(this.r) * CPU_QB.lag[1]);
    // Judging a long throw: the farther it goes, the worse his read of where to put it (`far`, by deep accuracy).
    const qb = this.play.qb;
    const sd = CPU_QB.far.per * Math.max(0, dist(qb.pos, aim) - CPU_QB.far.from) * (CPU_QB.far.top - qb.r.dac / 100);
    const to = {
      x: Math.min(119, aim.x - o.vel.x * trail + gauss(this.r) * sd),
      y: clamp(aim.y - o.vel.y * trail + gauss(this.r) * sd * CPU_QB.far.across, 1.5, FIELD_W - 1.5),
    };
    this.play.throwBall(to, kind);
    this.log.at = this.play.time - this.play.snapTime;
    this.log.why = why;
    if (this.escapeAt !== null) this.log.moved = true;
  }

  /** Out of bounds past the nearer sideline, short of anyone. */
  private throwAway(): void {
    const play = this.play;
    const y = play.qb.pos.y < FIELD_W / 2 ? -4 : FIELD_W + 4;
    play.throwBall({ x: play.los + 6, y }, 'touch');
    this.log.at = play.time - play.snapTime;
    this.log.why = 'away';
  }

  /**
   * He takes off with room ahead, by his run lean (`CPU_QB.run`): readily with the rush on him (`forced`, or out
   * of the pocket with his time bought), now and then when nobody's open (`open`).
   */
  private tryScramble(pressure: number, outside = false, lane = false): boolean {
    const play = this.play;
    if (!this.room(lane ? 1.4 : 1)) return false;
    const R = CPU_QB.run;
    const odds = lerp(...((lane ? R.lane : outside || pressure >= CPU_QB.scramble.forced ? R.forced : R.open) as [number, number]), this.runLean);
    if (this.r() >= odds) return false;
    this.log.scrambled = true;
    this.log.runWhy = outside ? 'outside' : lane ? 'lane' : pressure >= CPU_QB.scramble.forced ? 'forced' : 'open';
    this.log.at = play.time - play.snapTime;
    this.steerScramble();
    return true;
  }

  /** A lane: a spot `scramble.room` (× `k`) yd ahead of him, straight or angled off, that no free defender is near. */
  private room(k = 1): boolean {
    const qb = this.play.qb;
    const R = CPU_QB.scramble.room * k;
    for (const ang of [0, 0.6, -0.6, 1.0, -1.0]) {
      const spot = { x: qb.pos.x + Math.cos(ang) * R, y: qb.pos.y + Math.sin(ang) * R };
      if (spot.y < 2 || spot.y > FIELD_W - 2) continue;
      if (this.play.def.every((d) => d.down || d.engagedBy.length > 0 || dist(d.pos, spot) > R * 0.8)) return true;
    }
    return false;
  }

  /** Out of the pocket to buy time, away from the rush (once a snap). False when there's no side to slide to. */
  private startEscape(): boolean {
    if (this.escapeAt !== null || this.log.scrambled) return false;
    const play = this.play;
    const qb = play.qb;
    let near: Player | null = null;
    let nd = Infinity;
    for (const d of play.def) {
      if (d.down || d.engagedBy.length) continue;
      const dd = dist(d.pos, qb.pos);
      if (dd < nd) { nd = dd; near = d; }
    }
    let side = near ? Math.sign(qb.pos.y - near.pos.y) : 0;
    if (!side) side = qb.pos.y < FIELD_W / 2 ? 1 : -1;
    // Pinned to a sideline: the other way.
    if ((side < 0 && qb.pos.y < 8) || (side > 0 && qb.pos.y > FIELD_W - 8)) side = -side;
    this.escapeSide = side;
    this.escapeAt = play.time - play.snapTime;
    this.log.escaped = true;
    this.steerEscape();
    return true;
  }

  /** Sliding outside the pocket, behind the line, sprinting (a user holding shift). */
  private steerEscape(): void {
    const play = this.play;
    const qb = play.qb;
    const behind = play.los - CPU_QB.escape.depth - qb.pos.x;
    let side = this.escapeSide;
    if ((side < 0 && qb.pos.y < 4) || (side > 0 && qb.pos.y > FIELD_W - 4)) side = 0;
    const ax = { x: clamp(behind * 0.6, -0.7, 0.4), y: side };
    this.input = steerInput(ax.x || ax.y ? norm(ax) : { x: -1, y: 0 });
  }

  /** The scramble: the auto-runner's line for him, steered as a user would (sprint held). */
  private steerScramble(): void {
    const play = this.play;
    const qb = play.qb;
    const want = qb.want;
    autoRun(play, qb);
    const ax = qb.want.x || qb.want.y ? norm(qb.want) : { x: 1, y: 0 };
    qb.want = want;
    this.input = steerInput(ax);
  }
}
