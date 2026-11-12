import { DEF_CALLS, pickDefCall, type DefCall, type DefTags } from '../data/defenses';
import { defIdentity, preventLevel, situationMix, type DefIdentity } from '../data/identity';
import { callWeight, type OffStyle } from '../data/offStyles';
import { PLAYBOOK, type PlayDef } from '../data/plays';
import { kickDef } from '../data/specialTeams';
import type { RosterPlayer, Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL, STEP } from '../engine/constants';
import { clamp, mulberry32 } from '../engine/math';
import { CALM, METER_HALF, type KickParams } from '../sim/kicking';
import { AUTO_INPUT, autoStep, type AutoPlan } from './autopilot';
import { creditFor, shownGain, type KeyPlay } from './keyPlays';
import { KickPlay } from './kickPlay';
import { Play } from './playState';
import { passOdds, type Situation } from './situation';

/**
 * Key-play replays: the real play engine, with the CPU on both sides, made to show a snap the drive
 * sim already decided ("24-yard catch on 3rd and 7"). Seeds are tried headless until one plays out
 * like the sim's snap; the game then replays that seed step by step. Only for show: nothing here
 * feeds back into the score, the clock or the season, and it never touches the game's own RNG.
 */
export const REPLAY = {
  /** Seeds tried before showing a card instead. */
  maxTries: 300,
  /**
   * Share of the tries after which the match loosens: first any player may have the ball (the
   * caption names whoever the replay gave it to), then the yards may miss by twice as much.
   */
  relaxAt: [0.45, 0.75],
  /** Milliseconds of searching per frame, so the game never hitches. */
  budgetMs: 6,
  /** Longest a replay may run, seconds. */
  maxSecs: 15,
  /** A replay's gain must land within max(tol, tolShare x the gain) of the sim's. */
  tol: 3,
  tolShare: 0.25,
  /** Hold times (s) the CPU QB tries; a sack looks for the long ones. */
  holds: [1.0, 1.4, 1.8, 2.2, 2.6],
  sackHolds: [2.6, 3.0, 3.4],
};

export interface ReplaySide {
  team: Team;
  roster: Record<string, RosterPlayer>;
  /** The home team, which wears the home kit. */
  home?: boolean;
}

/** The home team's id for a replay's kits: whichever side is home, else the offense. */
const homeOf = (off: ReplaySide, def: ReplaySide): string => (def.home ? def.team.id : off.team.id);

export interface ReplayTarget {
  off: ReplaySide;
  def: ReplaySide;
  defIdent: DefIdentity;
  /** The snap, in yards from the offense's own goal. */
  yard: number;
  down: number;
  toGo: number;
  gain: number;
  /** `fumble`: a tackle on the sim's spot, where the show then knocks the ball loose. */
  want: 'td' | 'int' | 'sack' | 'fumble' | 'gain';
  /** Pass or run (undefined: either, by `passShare`). */
  pass?: boolean;
  /** The credited player's slot: the replay's ball goes to him. */
  slot?: string;
  /** The defender credited with an interception: the replay's pick is his. */
  by?: string;
  /** The game situation (clock and score), for the defense's call. */
  sit?: Situation;
  passShare: number;
  /** The offense's OC: the book its plays come from, and how his style calls it (`data/offStyles.ts`). */
  oc?: { book: readonly PlayDef[]; style: OffStyle };
}

export interface ReplaySetup {
  seed: number;
  play: PlayDef;
  call: DefCall;
  tags?: DefTags;
  press: { CB1: boolean; CB2: boolean; NB: boolean };
  plan: AutoPlan;
  /** How loose a match this try needed (`REPLAY.relaxAt`): 0 exact, 1 anyone, 2 also looser yards. */
  relax?: number;
}

const isPass = (p: PlayDef) => (p.kind === 'pass' || p.kind === 'pa') && !p.screen && !p.qbRun && p.read !== 'rpo' && p.block === 'pass';
const PASS_POOL = PLAYBOOK.filter(isPass);
const RB_RUNS = PLAYBOOK.filter((p) => p.kind === 'run' && !p.qbRun && (p.read === 'none' || p.read === 'handoff' || p.read === 'pitch'));
// Designed QB runs, and the reads the QB can keep.
const isQbRun = (p: PlayDef) => !!p.qbRun || (p.kind === 'run' && (p.read === 'zoneRead' || p.read === 'option'));
const QB_RUNS = PLAYBOOK.filter(isQbRun);
const isRbRun = (p: PlayDef) => RB_RUNS.includes(p);

/** The style's call situation for a replay's snap (`CALL_SITUATION`). */
function callSit(t: ReplayTarget): 'normal' | 'long' | 'short' | 'hurry' {
  if (t.sit && t.sit.secsLeft <= 120 && t.sit.lead <= 0) return 'hurry';
  if (t.down >= 3 && t.toGo >= 7) return 'long';
  if (t.down >= 3 && t.toGo <= 2) return 'short';
  return 'normal';
}

/** A play of this kind from the offense's book, weighted by its OC's style; the whole library without one. */
function bookPick(t: ReplayTarget, pool: PlayDef[], keep: (p: PlayDef) => boolean, r: () => number): PlayDef {
  const mine = t.oc ? t.oc.book.filter(keep) : [];
  if (!t.oc || !mine.length) return pool[Math.floor(r() * pool.length)];
  const sit = callSit(t);
  const w = mine.map((p) => callWeight(t.oc!.style, p.tags.family, sit));
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < mine.length; i++) if ((x -= w[i]) <= 0) return mine[i];
  return mine[mine.length - 1];
}

export function makeReplay(t: ReplayTarget, s: ReplaySetup): Play {
  return new Play({
    offTeam: t.off.team, defTeam: t.def.team, homeId: homeOf(t.off, t.def), offRoster: t.off.roster, defRoster: t.def.roster,
    play: s.play, defCall: s.call, tags: s.tags, press: s.press, los: OWN_GOAL + t.yard, ballY: FIELD_W / 2, rng: mulberry32(s.seed),
  });
}

const cam = new Camera();

/** One step of a replay: the CPU's offense decides, then the play moves. The game calls this each frame. */
export function stepReplay(play: Play, s: ReplaySetup): void {
  autoStep(play, s.plan);
  play.update(STEP, AUTO_INPUT, cam);
}

/** A replay played out headless. */
export function runReplay(t: ReplayTarget, s: ReplaySetup): Play {
  const play = makeReplay(t, s);
  play.snap();
  for (let i = 0; i < REPLAY.maxSecs / STEP && play.phase !== 'over'; i++) stepReplay(play, s);
  return play;
}

/** Yards a finished replay gained (an incompletion is none). */
export function replayGain(play: Play): number {
  const o = play.outcome!;
  if (o.type === 'incomplete') return 0;
  if (o.type === 'td') return OPP_GOAL - play.los;
  return o.spot - play.los;
}

/** Whether a finished replay shows the sim's snap. */
export function matches(t: ReplayTarget, play: Play, relax = 0): boolean {
  const o = play.outcome;
  if (!o) return false;
  const slotOk = (p: { slot: string } | null) => relax >= 1 || !t.slot || p?.slot === t.slot;
  const loose = relax >= 2 ? 2 : 1;
  switch (t.want) {
    case 'td':
      return o.type === 'td' && slotOk(play.carrier);
    case 'int':
      return o.type === 'int' && (relax >= 1 || !t.by || play.carrier?.slot === t.by);
    case 'sack':
      return o.type === 'sack' && Math.abs(replayGain(play) - t.gain) <= (REPLAY.tol + 1) * loose;
    case 'fumble':
      return o.type === 'tackle' && Math.abs(replayGain(play) - t.gain) <= REPLAY.tol * loose;
    default: {
      if (o.type !== 'tackle' && o.type !== 'oob' && o.type !== 'incomplete' && o.type !== 'sack') return false;
      if (o.type === 'sack' && t.gain >= 0) return false;
      const g = replayGain(play);
      if (Math.abs(g - t.gain) > loose * Math.max(REPLAY.tol, REPLAY.tolShare * Math.abs(t.gain))) return false;
      if (g >= t.toGo !== t.gain >= t.toGo) return false;
      return slotOk(o.type === 'incomplete' ? play.intended : play.carrier);
    }
  }
}

/**
 * What a key play's replay has to show, with `off` and `def` on the field; null for field goals
 * (`fgTargetFor`). The ball goes to whoever the box score credited; a lost fumble isn't credited, so anyone.
 */
export function targetFor(k: KeyPlay, off: ReplaySide, def: ReplaySide, passShare: number, oc?: ReplayTarget['oc']): ReplayTarget | null {
  if (k.play.fg) return null;
  const p = k.play;
  const want = k.kind === 'td' || k.kind === 'twoPt' ? 'td' : k.kind === 'int' ? 'int' : k.kind === 'sack' ? 'sack' : k.kind === 'fumble' ? 'fumble' : 'gain';
  const cr = want === 'fumble' ? undefined : creditFor(k);
  const d = k.drive;
  const lead = Object.entries(d.score).reduce((s, [id, pts]) => s + (id === d.off ? pts : -pts), 0);
  const sit: Situation = {
    down: p.down, toGo: p.toGo, yardsToGoal: 100 - p.yard, secsLeft: d.half >= 2 ? Infinity : d.left - p.t, qSecs: d.qSecs,
    finalHalf: d.half >= 1, lead, ...(d.half >= 2 ? { ot: 'first' as const } : {}),
  };
  return {
    off, def, defIdent: defIdentity(def.team), yard: p.yard, down: p.down, toGo: p.toGo, gain: shownGain(p), want,
    pass: cr?.pass, slot: cr?.who?.slot, by: want === 'int' ? cr?.by?.slot : undefined, sit, passShare, ...(oc ? { oc } : {}),
  };
}

/** The setup for one try: drawn from its own seed, so a found try can be rebuilt exactly. */
function setupFor(t: ReplayTarget, seed: number, relax = 0): ReplaySetup {
  const pick = mulberry32(seed ^ 0x5eed);
  const any = <T>(xs: T[]) => xs[Math.floor(pick() * xs.length)];
  const share = t.sit ? passOdds(t.passShare, t.sit) : t.passShare;
  // Loosest, the credit's pass or run goes too: a long gain may come on either.
  const credited = relax >= 2 ? undefined : t.pass;
  const pass = t.want === 'int' || t.want === 'sack' || (credited ?? (t.gain >= 20 ? pick() < 0.8 : pick() < share));
  // Loosened, a QB's run may be anyone's: half the tries hand it to the back.
  const qbRun = t.slot === 'QB' && credited === false && (relax === 0 || pick() < 0.5);
  const play = qbRun ? bookPick(t, QB_RUNS, isQbRun, pick) : pass ? bookPick(t, PASS_POOL, isPass, pick) : bookPick(t, RB_RUNS, isRbRun, pick);
  // The defense calls the situation too: prevent late against a score, a loaded box against the clock.
  const call = pickDefCall(pick, situationMix(t.defIdent, t.down, t.toGo, 100 - t.yard, undefined, false, t.sit)) ?? DEF_CALLS[0];
  const tags: DefTags = preventLevel(t.sit) ? { prevent: true } : {};
  const pr = t.defIdent.press;
  const press = { CB1: pick() < pr.CB1, CB2: pick() < pr.CB2, NB: pick() < pr.NB };
  const hold = any(t.want === 'sack' ? REPLAY.sackHolds : REPLAY.holds);
  const target = t.want === 'int' ? 'tight' : pass && t.slot && t.slot !== 'QB' && relax === 0 ? t.slot : 'open';
  return { seed, play, call, tags, press, plan: { kind: pass ? 'pass' : 'run', hold, target }, ...(relax ? { relax } : {}) };
}

/**
 * Looks for a replay a few milliseconds at a time (`step` each frame). `found` is set on a match;
 * `done` with no `found` means show a card instead.
 */
abstract class SeedSearch<S> {
  tries = 0;
  found: S | null = null;
  done = false;

  constructor(private readonly seed: number) {}

  /** One seed: its setup if the replay matches. `relax` loosens the match as the tries run out (`REPLAY.relaxAt`). */
  protected abstract attempt(seed: number, relax: number): S | null;

  step(budgetMs = REPLAY.budgetMs): void {
    const until = now() + budgetMs;
    while (!this.done && now() < until) {
      const f = this.tries / REPLAY.maxTries;
      const relax = REPLAY.relaxAt.filter((at) => f >= at).length;
      this.found = this.attempt((this.seed + this.tries * 7919) >>> 0, relax);
      this.tries++;
      if (this.found || this.tries >= REPLAY.maxTries) this.done = true;
    }
  }
}

export class ReplaySearch extends SeedSearch<ReplaySetup> {
  constructor(readonly target: ReplayTarget, seed: number) {
    super(seed);
  }

  protected attempt(seed: number, relax: number): ReplaySetup | null {
    const s = setupFor(this.target, seed, relax);
    return matches(this.target, runReplay(this.target, s), relax) ? s : null;
  }
}

// ------------------------------------------------------------ field goals

/** A field goal the sim decided: the kick unit on the field, its distance and whether it was good. */
export interface FgTarget {
  off: ReplaySide;
  def: ReplaySide;
  dist: number;
  made: boolean;
}

/** The CPU kicker's try: its seed, the kick, and where on the meter he stops the needle (-1 early to 1 late). */
export interface FgSetup {
  seed: number;
  kick: KickParams;
  timing: number;
}

export function fgTargetFor(k: KeyPlay, off: ReplaySide, def: ReplaySide): FgTarget | null {
  const fg = k.play.fg;
  return fg ? { off, def, dist: fg.dist, made: fg.made } : null;
}

/** The kick lined up, not yet snapped (the snap is `release`). Calm air: the sim's kicks have no wind. */
export function makeFg(t: FgTarget, s: FgSetup): KickPlay {
  return new KickPlay({
    kickTeam: t.off.team, recvTeam: t.def.team, homeId: homeOf(t.off, t.def), kickRoster: t.off.roster, recvRoster: t.def.roster,
    def: kickDef('fg'), los: OPP_GOAL - (t.dist - 17), ballY: FIELD_W / 2, wind: CALM, rng: mulberry32(s.seed),
  });
}

/** One step of a field goal replay: the CPU kicker stops the needle at his spot, then the kick moves. */
export function stepFg(kp: KickPlay, s: FgSetup): void {
  if (kp.meter()?.live && kp.time >= kp.strikeAt! + s.timing * METER_HALF) kp.pressTiming();
  kp.update(STEP, AUTO_INPUT);
}

export function runFg(t: FgTarget, s: FgSetup): KickPlay {
  const kp = makeFg(t, s);
  kp.release(s.kick);
  for (let i = 0; i < REPLAY.maxSecs / STEP && kp.phase !== 'over'; i++) stepFg(kp, s);
  return kp;
}

/** The kick for one try, drawn from its own seed: a make is struck cleanly, a miss is off line or mistimed. */
function fgSetupFor(t: FgTarget, seed: number): FgSetup {
  const pick = mulberry32(seed ^ 0xf6);
  const timing = t.made ? (pick() - 0.5) * 0.4 : (pick() < 0.5 ? -1 : 1) * (0.3 + pick() * 0.7);
  const ang = (pick() - 0.5) * (t.made ? 0.04 : 0.14);
  // The harness's power for the distance, give or take: a long miss may come up short.
  const power = clamp(0.62 + (t.dist - 20) * 0.011 + (pick() - 0.5) * (t.made ? 0.04 : 0.12), 0.5, 1);
  return { seed, kick: { power, dir: { x: Math.cos(ang), y: Math.sin(ang) }, loft: kickDef('fg').loft }, timing };
}

export class FgSearch extends SeedSearch<FgSetup> {
  constructor(readonly target: FgTarget, seed: number) {
    super(seed);
  }

  protected attempt(seed: number): FgSetup | null {
    const s = fgSetupFor(this.target, seed);
    const o = runFg(this.target, s).outcome;
    return o?.result === (this.target.made ? 'fgGood' : 'fgMiss') ? s : null;
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
