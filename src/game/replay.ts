import { DEF_CALLS, pickDefCall, type DefCall } from '../data/defenses';
import { defIdentity, situationMix, type DefIdentity } from '../data/identity';
import { PLAYBOOK, type PlayDef } from '../data/plays';
import type { RosterPlayer, Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL, STEP } from '../engine/constants';
import { mulberry32 } from '../engine/math';
import { AUTO_INPUT, autoStep, type AutoPlan } from './autopilot';
import { CARD_ONLY, creditFor, shownGain, type KeyPlay } from './keyPlays';
import { Play } from './playState';

/**
 * Key-play replays: the real play engine, with the CPU on both sides, made to show a snap the drive
 * sim already decided ("24-yard catch on 3rd and 7"). Seeds are tried headless until one plays out
 * like the sim's snap; the game then replays that seed step by step. Only for show: nothing here
 * feeds back into the score, the clock or the season, and it never touches the game's own RNG.
 */
export const REPLAY = {
  /** Seeds tried before showing a card instead. */
  maxTries: 300,
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
}

export interface ReplayTarget {
  off: ReplaySide;
  def: ReplaySide;
  defIdent: DefIdentity;
  /** The snap, in yards from the offense's own goal. */
  yard: number;
  down: number;
  toGo: number;
  gain: number;
  want: 'td' | 'int' | 'sack' | 'gain';
  /** Pass or run (undefined: either, by `passShare`). */
  pass?: boolean;
  /** The credited player's slot: the replay's ball goes to him. */
  slot?: string;
  passShare: number;
}

export interface ReplaySetup {
  seed: number;
  play: PlayDef;
  call: DefCall;
  press: { CB1: boolean; CB2: boolean; NB: boolean };
  plan: AutoPlan;
}

const isPass = (p: PlayDef) => (p.kind === 'pass' || p.kind === 'pa') && !p.screen && !p.qbRun && p.read !== 'rpo' && p.block === 'pass';
const PASS_POOL = PLAYBOOK.filter(isPass);
const RB_RUNS = PLAYBOOK.filter((p) => p.kind === 'run' && !p.qbRun && (p.read === 'none' || p.read === 'handoff' || p.read === 'pitch'));
const QB_RUNS = PLAYBOOK.filter((p) => p.qbRun);

export function makeReplay(t: ReplayTarget, s: ReplaySetup): Play {
  return new Play({
    offTeam: t.off.team, defTeam: t.def.team, offRoster: t.off.roster, defRoster: t.def.roster,
    play: s.play, defCall: s.call, press: s.press, los: OWN_GOAL + t.yard, ballY: FIELD_W / 2, rng: mulberry32(s.seed),
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
export function matches(t: ReplayTarget, play: Play): boolean {
  const o = play.outcome;
  if (!o) return false;
  const slotOk = (p: { slot: string } | null) => !t.slot || p?.slot === t.slot;
  switch (t.want) {
    case 'td':
      return o.type === 'td' && slotOk(play.carrier);
    case 'int':
      return o.type === 'int';
    case 'sack':
      return o.type === 'sack' && Math.abs(replayGain(play) - t.gain) <= REPLAY.tol + 1;
    default: {
      if (o.type !== 'tackle' && o.type !== 'oob' && o.type !== 'incomplete' && o.type !== 'sack') return false;
      if (o.type === 'sack' && t.gain >= 0) return false;
      const g = replayGain(play);
      if (Math.abs(g - t.gain) > Math.max(REPLAY.tol, REPLAY.tolShare * Math.abs(t.gain))) return false;
      if (g >= t.toGo !== t.gain >= t.toGo) return false;
      return slotOk(o.type === 'incomplete' ? play.intended : play.carrier);
    }
  }
}

/**
 * What a key play's replay has to show, with `off` and `def` on the field; null for the kinds that
 * are only ever cards (kicks, lost fumbles). The ball goes to whoever the box score credited.
 */
export function targetFor(k: KeyPlay, off: ReplaySide, def: ReplaySide, passShare: number): ReplayTarget | null {
  if (CARD_ONLY.has(k.kind)) return null;
  const p = k.play;
  const cr = creditFor(k);
  const want = k.kind === 'td' ? 'td' : k.kind === 'int' ? 'int' : k.kind === 'sack' ? 'sack' : 'gain';
  return {
    off, def, defIdent: defIdentity(def.team), yard: p.yard, down: p.down, toGo: p.toGo, gain: shownGain(p), want,
    pass: cr?.pass, slot: cr?.who?.slot, passShare,
  };
}

/** The setup for one try: drawn from its own seed, so a found try can be rebuilt exactly. */
function setupFor(t: ReplayTarget, seed: number): ReplaySetup {
  const pick = mulberry32(seed ^ 0x5eed);
  const any = <T>(xs: T[]) => xs[Math.floor(pick() * xs.length)];
  const qbRun = t.slot === 'QB' && t.pass === false;
  const pass = t.want === 'int' || t.want === 'sack' || (t.pass ?? (t.gain >= 20 ? pick() < 0.8 : pick() < t.passShare));
  const play = qbRun ? any(QB_RUNS) : pass ? any(PASS_POOL) : any(RB_RUNS);
  const call = pickDefCall(pick, situationMix(t.defIdent, t.down, t.toGo)) ?? DEF_CALLS[0];
  const pr = t.defIdent.press;
  const press = { CB1: pick() < pr.CB1, CB2: pick() < pr.CB2, NB: pick() < pr.NB };
  const hold = any(t.want === 'sack' ? REPLAY.sackHolds : REPLAY.holds);
  const target = t.want === 'int' ? 'tight' : pass && t.slot && t.slot !== 'QB' ? t.slot : 'open';
  return { seed, play, call, press, plan: { kind: pass ? 'pass' : 'run', hold, target } };
}

/**
 * Looks for a replay a few milliseconds at a time (`step` each frame). `found` is set on a match;
 * `done` with no `found` means show a card instead.
 */
export class ReplaySearch {
  tries = 0;
  found: ReplaySetup | null = null;
  done = false;

  constructor(readonly target: ReplayTarget, private readonly seed: number) {}

  step(budgetMs = REPLAY.budgetMs): void {
    const until = now() + budgetMs;
    while (!this.done && now() < until) {
      const s = setupFor(this.target, (this.seed + this.tries * 7919) >>> 0);
      this.tries++;
      if (matches(this.target, runReplay(this.target, s))) this.found = s;
      if (this.found || this.tries >= REPLAY.maxTries) this.done = true;
    }
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
