import { kickDef, type KickDef, type ReturnScheme } from '../data/specialTeams';
import type { RosterPlayer, Team } from '../data/teams';
import { FIELD_W, OWN_GOAL, STEP } from '../engine/constants';
import { clamp, mulberry32, type Rng } from '../engine/math';
import { CALM, type Wind } from '../sim/kicking';
import { AUTO_INPUT } from './autopilot';
import { CPU_KICK, CpuKicker, kickoffCall, puntCall, returnCall, windAlong, type KickContext } from './cpuKicker';
import { KickPlay } from './kickPlay';
import { applyKick, type KickOutcome } from './rules';
import { newKickRecorder, recordKickFrame, TAPE, type KickRecorder, type Tape } from './tape';

/**
 * Kickoffs and punts with the CPU kicking (game/cpuKicker.ts), played by `KickPlay` with the AI on both
 * sides: the kicking team's special-teams coach calls the kick (`kickoffCall`, `puntCall`) against the
 * receivers' look (`returnCall`), the kicker kicks it, and the returner and the coverage are the kick
 * play's AI. So the field position after a kick, the returns, the fair catches, the muffs, the onside
 * kicks and the return touchdowns are real, and a simulated game's kicks can be watched on tape. Engine
 * games kick in calm air (they have no wind, as their field goals don't); a played game's live CPU kicks
 * (`KickRun`, stepped by the game) get the game's wind.
 */

export { CPU_KICK };

/** The kickoff line (yards from the kicking team's goal), and after a safety the free kick's. */
export const KICKOFF_FROM = 35;
export const SAFETY_KICK_FROM = 20;

/** One side's kick units. */
export interface KickSide {
  team: Team;
  roster: Record<string, RosterPlayer>;
}

export interface EngineKick {
  outcome: KickOutcome;
  /** The kick's call and the receivers' look. */
  call: string;
  look: ReturnScheme;
  /** The receiving team's ball at this yard (from its own goal); null when it didn't get it or scored. */
  recvStart: number | null;
  /** The kicking team kept the ball (a muff or onside kick recovered, a foul on the receivers) at this yard from its own goal. */
  kickStart: number | null;
  /** The receivers scored (a return touchdown, or a blocked punt recovered in the end zone). */
  recvTd: boolean;
  /** Game-clock seconds it ran (a kickoff from the receivers' touch, a punt from the snap). */
  secs: number;
  /** Yards it was run back, and by whom (slot, name, athlete id). */
  ret: number;
  returner: { slot: string; name: string } | null;
  /** The kicking team's man who fell on a muff. */
  recoverer: { slot: string; name: string } | null;
  tape?: Tape;
}

/** The receivers' best returner: speed, moves and hands (data/depth.ts `returnRating`, on the roster's ratings). */
export function returnerOf(roster: Record<string, RosterPlayer>): number {
  let best = 0;
  for (const s of ['Z', 'RB']) {
    const r = roster[s]?.r;
    if (r) best = Math.max(best, r.spd * 0.4 + r.elu * 0.3 + r.cth * 0.3);
  }
  return best;
}

export interface KickRunOpts {
  record?: boolean;
  homeId?: string;
  wind?: Wind;
  ret?: ReturnScheme;
  /** A punt's 4th-down yards to go (the rugby punter's run option). */
  fake?: { toGo: number };
}

/**
 * One kick with the CPU kicking, stepped one `STEP` at a time (`step`), so a played game can show it live
 * and an engine game can run it headlessly. `kick`'s unit attacks +x from `los` (world x). The kick play
 * runs on a stream of its own from `rng` (one draw), so recording it, and its tail past the whistle, draw
 * nothing more.
 */
export class KickRun {
  readonly kp: KickPlay;
  readonly kicker: CpuKicker;
  secs = 0;
  private readonly rec: KickRecorder | null;
  private readonly los: number;
  private readonly fake: { toGo: number } | null;

  constructor(kick: KickSide, recv: KickSide, def: KickDef, los: number, rng: Rng, opts: KickRunOpts = {}) {
    const own = mulberry32((rng() * 2 ** 31) >>> 0);
    const wind = opts.wind ?? CALM;
    this.los = los;
    this.fake = opts.fake ?? null;
    this.kp = new KickPlay({
      kickTeam: kick.team, recvTeam: recv.team, ...(opts.homeId ? { homeId: opts.homeId } : {}), kickRoster: kick.roster, recvRoster: recv.roster,
      def, los, ballY: FIELD_W / 2, wind, rng: own, ret: opts.ret ?? 'return', ...(opts.fake ? { fake: opts.fake } : {}),
    });
    this.kicker = new CpuKicker(this.kp, wind, own);
    this.rec = opts.record ? newKickRecorder(this.kp) : null;
  }

  /** Snap it (a punt) or send the kicker at the ball (a kickoff). */
  start(): void {
    this.kicker.start();
  }

  done(): boolean {
    return this.kp.phase === 'over' || this.kp.time >= CPU_KICK.maxSecs;
  }

  step(): void {
    this.kicker.step();
    this.kp.update(STEP, AUTO_INPUT);
    if (this.rec) recordKickFrame(this.rec, STEP);
    if (this.kp.clockRunning()) this.secs += STEP;
  }

  /** Run it to the whistle. */
  finishPlay(): void {
    this.start();
    while (!this.done()) this.step();
  }

  /** Where it leaves the ball and who did what (call once, after the whistle). */
  finish(): EngineKick {
    const kp = this.kp;
    const def = kp.def;
    const o: KickOutcome = kp.outcome ?? { result: 'downed', unit: def.unit, spot: kp.ball.pos.x, spotY: kp.ball.pos.y, text: 'DEAD BALL', sub: '', color: '#ffffff' };
    const from = kp.returnFrom();
    let ret: number | null = null;
    if (from !== null && (o.result === 'returned' || o.result === 'returnTd')) ret = Math.round(from - Math.max(OWN_GOAL, o.spot));
    const returner = from !== null ? kp.carrier : kp.catcher;
    const recoverer = o.result === 'recovered' ? kp.kick.reduce((b, p) => (!b || Math.hypot(p.pos.x - o.spot, p.pos.y - o.spotY) < Math.hypot(b.pos.x - o.spot, b.pos.y - o.spotY) ? p : b), kp.kick[0]) : null;
    // The tape runs on past the whistle, as a snap's does.
    if (this.rec) {
      const tail = o.result === 'returnTd' ? TAPE.scoreTail : TAPE.tail;
      for (let i = 0; i < tail / STEP; i++) {
        kp.update(STEP, AUTO_INPUT);
        recordKickFrame(this.rec, STEP);
      }
    }
    // Where it leaves the ball, from the kicking team's side (`applyKick` reads it as the user's kick).
    const toGo = this.fake?.toGo ?? 10;
    const a = applyKick({ los: this.los, ballY: FIELD_W / 2, down: def.unit === 'punt' ? 4 : 1, firstDownX: this.los + toGo }, o);
    const recvTd = a.change.kind === 'returnTd';
    const recvStart = a.change.kind === 'cpuBall' ? clamp(Math.round(a.change.cpuStart), 1, 99) : null;
    const kickStart = a.change.kind === 'none' ? clamp(Math.round(a.drive.los - OWN_GOAL), 1, 99) : null;
    const who = (p: typeof returner) => (p ? { slot: p.slot, name: p.name } : null);
    return {
      outcome: o, call: def.id, look: kp.ret, recvStart, kickStart, recvTd, secs: Math.round(this.secs * 10) / 10, ret: ret ?? 0,
      returner: who(returner), recoverer: who(recoverer), ...(this.rec ? { tape: this.rec.tape } : {}),
    };
  }
}

/** The kicking team's situation for its special-teams coach (missing: an ordinary moment in the 1st half). */
export type KickSituation = Partial<Pick<KickContext, 'lead' | 'secsLeft' | 'finalHalf' | 'toGo'>>;

function context(kick: KickSide, recv: KickSide, wind: Wind, sit: KickSituation, yard?: number): KickContext {
  const unit = kick.roster[yard === undefined ? 'K' : 'P']?.r;
  return {
    lead: sit.lead ?? 0, secsLeft: sit.secsLeft ?? 1800, finalHalf: sit.finalHalf ?? false, ...(yard !== undefined ? { yard } : {}),
    ...(sit.toGo !== undefined ? { toGo: sit.toGo } : {}),
    kpw: unit?.kpw ?? 70, kac: unit?.kac ?? 70, returner: returnerOf(recv.roster), along: windAlong(wind),
  };
}

/** The kickoff's call and look, then the run (not started). */
export function kickoffRun(kick: KickSide, recv: KickSide, rng: Rng, opts: KickRunOpts & { from?: number; sit?: KickSituation } = {}): KickRun {
  const c = context(kick, recv, opts.wind ?? CALM, opts.sit ?? {});
  const ret = opts.ret ?? returnCall('kickoff', c, rng);
  const def = kickDef(kickoffCall({ ...c, ret }, rng));
  return new KickRun(kick, recv, def, OWN_GOAL + (opts.from ?? KICKOFF_FROM), rng, { ...opts, ret });
}

/** A punt from `yard` (from the punting team's goal): the call and look, then the run (not started). */
export function puntRun(kick: KickSide, recv: KickSide, yard: number, rng: Rng, opts: KickRunOpts & { sit?: KickSituation } = {}): KickRun {
  const c = context(kick, recv, opts.wind ?? CALM, opts.sit ?? {}, yard);
  const ret = opts.ret ?? returnCall('punt', c, rng);
  const def = kickDef(puntCall({ ...c, ret }, rng));
  return new KickRun(kick, recv, def, OWN_GOAL + clamp(yard, 1, 99), rng, { ...opts, ret });
}

/** A kickoff from `from` yards (the 35, or the 20 after a safety), played to the end. */
export function engineKickoff(kick: KickSide, recv: KickSide, rng: Rng, opts: KickRunOpts & { from?: number; sit?: KickSituation } = {}): EngineKick {
  const r = kickoffRun(kick, recv, rng, opts);
  r.finishPlay();
  return r.finish();
}

/** A punt from `yard` (from the punting team's goal), played to the end. */
export function enginePunt(kick: KickSide, recv: KickSide, yard: number, rng: Rng, opts: KickRunOpts & { sit?: KickSituation } = {}): EngineKick {
  const r = puntRun(kick, recv, yard, rng, opts);
  r.finishPlay();
  return r.finish();
}

/** The kick's caption: a title and a line, from its outcome. `abbr` is the receiving team's. */
export function kickCaption(k: EngineKick, unit: 'kickoff' | 'punt', yard: number): { title: string; line: string } {
  const o = k.outcome;
  const who = k.returner ? shortName(k.returner.name) : '';
  const by = (s: string) => (who ? `${who} ${s}` : s);
  const gross = Math.max(0, Math.round(o.spot - OWN_GOAL - yard + k.ret));
  const kind = unit === 'punt' ? `${gross}-YARD PUNT` : 'THE KICKOFF';
  if (o.foul && k.kickStart !== null) {
    return { title: o.foul.kind === 'roughing' ? 'ROUGHING THE KICKER' : 'RUNNING INTO THE KICKER', line: 'A FLAG ON THE RETURN TEAM: FIRST DOWN, PUNT TEAM' };
  }
  switch (o.result) {
    case 'returnTd':
      return { title: unit === 'punt' && !k.returner ? 'BLOCKED, TOUCHDOWN' : `${unit === 'punt' ? 'PUNT' : 'KICKOFF'} RETURN TOUCHDOWN`, line: k.returner ? by(`${k.ret}-YARD RETURN FOR A TOUCHDOWN`) : 'RECOVERED IN THE END ZONE' };
    case 'recovered':
      if (unit === 'kickoff' && k.call === 'ko-onside') return { title: 'ONSIDE KICK RECOVERED', line: k.recoverer ? `${shortName(k.recoverer.name)} COMES UP WITH IT` : 'THE KICKING TEAM HAS IT' };
      return { title: 'MUFFED, AND RECOVERED', line: k.recoverer ? `${shortName(k.recoverer.name)} FALLS ON IT FOR THE KICKING TEAM` : 'THE KICKING TEAM FALLS ON IT' };
    case 'blocked':
      return { title: 'BLOCKED', line: 'THE PUNT IS BLOCKED' };
    case 'fakeRun':
      return { title: k.kickStart !== null ? 'FAKE PUNT: FIRST DOWN' : 'FAKE PUNT STOPPED', line: 'THE PUNTER TAKES OFF' };
    case 'touchback':
      return { title: 'TOUCHBACK', line: unit === 'punt' ? `${kind} INTO THE END ZONE` : 'INTO THE END ZONE, OUT TO THE 25' };
    case 'fairCatch':
      return { title: 'FAIR CATCH', line: by(unit === 'punt' ? `CALLS FOR IT ON A ${kind}` : 'CALLS FOR IT') };
    case 'oob':
      return { title: 'OUT OF BOUNDS', line: unit === 'punt' ? `${kind}, OUT OF BOUNDS` : 'KICKOFF OUT OF BOUNDS, BALL AT THE 35' };
    case 'downed':
      return { title: 'DOWNED', line: unit === 'punt' ? `${kind}, DOWNED` : 'DOWNED' };
    default:
      if (unit === 'kickoff' && k.call === 'ko-onside') return { title: 'ONSIDE KICK FAILS', line: by('HAS IT FOR THE RETURN TEAM') };
      return { title: k.ret >= 25 ? 'BIG RETURN' : unit === 'punt' ? 'PUNT' : 'KICKOFF', line: by(`${Math.max(0, k.ret)}-YARD RETURN${unit === 'punt' ? ` OF A ${kind}` : ''}`) };
  }
}

/** "J. SMITH" from "John Smith". */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(' ')}`).toUpperCase();
}
