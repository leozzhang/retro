import { kickDef, type KickDef } from '../data/specialTeams';
import type { RosterPlayer, Team } from '../data/teams';
import { FIELD_W, OPP_GOAL, OWN_GOAL, STEP } from '../engine/constants';
import { clamp, gauss, mulberry32, type Rng } from '../engine/math';
import { CALM, METER_HALF, type KickParams } from '../sim/kicking';
import { AUTO_INPUT } from './autopilot';
import { KickPlay } from './kickPlay';
import { applyKick, type KickOutcome } from './rules';
import { newKickRecorder, recordKickFrame, TAPE, type Tape } from './tape';

/**
 * Kickoffs and punts in an engine game (season/engineGame.ts), played by `KickPlay` with the CPU on both
 * sides: the kicker picks the kick and its power and line, stops the timing meter near the green, and the
 * returner and the coverage are the kick play's AI. So the field position after a kick, the returns, the
 * fair catches, the muffs and the return touchdowns are real, and a simulated game's kicks can be watched
 * on tape. Kicks are in calm air (the engine game has no wind, as its field goals don't).
 */

/**
 * The CPU kicker:
 * - `timingSd`: where he stops the meter's needle (-1 early .. 1 late), around the middle of the green.
 * - `powerSd`, `aimSd`: his intent's spread (the kick's own error by accuracy comes on top, `applyKickError`).
 * - `pooch`: yards to the goal at or inside which he pooches, `poochPower` at 40 yards out, `poochPerYd` more a yard.
 * - `corner`: the share of kickoffs angled at a corner.
 * - `maxSecs`: the longest a kick is played.
 */
export const CPU_KICK = { timingSd: 0.22, powerSd: 0.03, aimSd: 0.025, pooch: 52, poochPower: 0.74, poochPerYd: 0.014, corner: 0.12, maxSecs: 25 };

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
  /** The receiving team's ball at this yard (from its own goal); null when it didn't get it (a muff recovered) or scored. */
  recvStart: number | null;
  /** The kicking team kept the ball (a muff recovered) at this yard from its own goal. */
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

/** The kick the CPU calls: a punt from `yard` (from his own goal), or a kickoff. */
function cpuKick(kp: KickPlay, rng: Rng): KickParams {
  const C = CPU_KICK;
  const d = kp.def;
  let power = 1;
  let ang = 0;
  if (d.unit === 'punt' && d.id === 'pooch') {
    const out = OPP_GOAL - kp.los;
    power = clamp(C.poochPower + (out - 40) * C.poochPerYd, 0.5, 0.95);
  } else if (d.unit === 'kickoff' && d.id === 'ko-corner') {
    const side = rng() < 0.5 ? 7 : FIELD_W - 7;
    ang = Math.atan2(side - kp.kickSpot.y, OPP_GOAL - 5 - kp.kickSpot.x);
    power = 0.97;
  }
  power = clamp(power + gauss(rng) * C.powerSd, 0.4, 1);
  ang += gauss(rng) * C.aimSd;
  return { power, dir: { x: Math.cos(ang), y: Math.sin(ang) }, loft: d.loft };
}

/**
 * Play one kick to the end. `kick`'s unit attacks +x from `los` (world x). The kick play runs on a stream
 * of its own from `rng` (one draw), so recording it, and its tail past the whistle, draw nothing more.
 */
function playKick(kick: KickSide, recv: KickSide, def: KickDef, los: number, rng: Rng, opts: { record?: boolean; homeId?: string }): EngineKick {
  const own = mulberry32((rng() * 2 ** 31) >>> 0);
  const kp = new KickPlay({
    kickTeam: kick.team, recvTeam: recv.team, ...(opts.homeId ? { homeId: opts.homeId } : {}), kickRoster: kick.roster, recvRoster: recv.roster,
    def, los, ballY: FIELD_W / 2, wind: CALM, rng: own,
  });
  const params = cpuKick(kp, own);
  const timing = clamp(gauss(own) * CPU_KICK.timingSd, -1, 1);
  const rec = opts.record ? newKickRecorder(kp) : null;
  if (def.unit === 'punt') kp.snap();
  else kp.release(params);
  let released = def.unit !== 'punt';
  let secs = 0;
  let ret: number | null = null;
  const step = () => {
    if (!released && kp.phase === 'set') {
      kp.release(params);
      released = true;
    }
    if (kp.meter()?.live && kp.time >= kp.strikeAt! + timing * METER_HALF) kp.pressTiming();
    kp.update(STEP, AUTO_INPUT);
    if (rec) recordKickFrame(rec, STEP);
  };
  for (let i = 0; i < CPU_KICK.maxSecs / STEP && kp.phase !== 'over'; i++) {
    step();
    if (kp.clockRunning()) secs += STEP;
  }
  const o: KickOutcome = kp.outcome ?? { result: 'downed', unit: def.unit, spot: kp.ball.pos.x, spotY: kp.ball.pos.y, text: 'DEAD BALL', sub: '', color: '#ffffff' };
  const from = kp.returnFrom();
  if (from !== null && (o.result === 'returned' || o.result === 'returnTd')) ret = Math.round(from - Math.max(OWN_GOAL, o.spot));
  const returner = from !== null ? kp.carrier : kp.catcher;
  const recoverer = o.result === 'recovered' ? kp.kick.reduce((b, p) => (!b || Math.hypot(p.pos.x - o.spot, p.pos.y - o.spotY) < Math.hypot(b.pos.x - o.spot, b.pos.y - o.spotY) ? p : b), kp.kick[0]) : null;
  // The tape runs on past the whistle, as a snap's does.
  if (rec) {
    const tail = o.result === 'returnTd' ? TAPE.scoreTail : TAPE.tail;
    for (let i = 0; i < tail / STEP; i++) {
      kp.update(STEP, AUTO_INPUT);
      recordKickFrame(rec, STEP);
    }
  }
  // Where it leaves the ball, from the kicking team's side (`applyKick` reads it as the user's kick).
  const a = applyKick({ los, ballY: FIELD_W / 2, down: 1, firstDownX: los + 10 }, o);
  const recvTd = a.change.kind === 'returnTd';
  const recvStart = a.change.kind === 'cpuBall' ? clamp(Math.round(a.change.cpuStart), 1, 99) : null;
  const kickStart = a.change.kind === 'none' ? clamp(Math.round(a.drive.los - OWN_GOAL), 1, 99) : null;
  const who = (p: typeof returner) => (p ? { slot: p.slot, name: p.name } : null);
  return {
    outcome: o, recvStart, kickStart, recvTd, secs: Math.round(secs * 10) / 10, ret: ret ?? 0,
    returner: who(returner), recoverer: who(recoverer), ...(rec ? { tape: rec.tape } : {}),
  };
}

/** A kickoff from `from` yards (the 35, or the 20 after a safety). */
export function engineKickoff(kick: KickSide, recv: KickSide, rng: Rng, opts: { from?: number; record?: boolean; homeId?: string } = {}): EngineKick {
  const def = kickDef(rng() < CPU_KICK.corner ? 'ko-corner' : 'ko-deep');
  return playKick(kick, recv, def, OWN_GOAL + (opts.from ?? KICKOFF_FROM), rng, opts);
}

/** A punt from `yard` (from the punting team's goal): a pooch from close enough in. */
export function enginePunt(kick: KickSide, recv: KickSide, yard: number, rng: Rng, opts: { record?: boolean; homeId?: string } = {}): EngineKick {
  const def = kickDef(100 - yard <= CPU_KICK.pooch ? 'pooch' : 'punt');
  return playKick(kick, recv, def, OWN_GOAL + clamp(yard, 1, 99), rng, opts);
}

/** The kick's caption: a title and a line, from its outcome. `abbr` is the receiving team's. */
export function kickCaption(k: EngineKick, unit: 'kickoff' | 'punt', yard: number): { title: string; line: string } {
  const o = k.outcome;
  const who = k.returner ? shortName(k.returner.name) : '';
  const by = (s: string) => (who ? `${who} ${s}` : s);
  const gross = Math.max(0, Math.round(o.spot - OWN_GOAL - yard + k.ret));
  const kind = unit === 'punt' ? `${gross}-YARD PUNT` : 'THE KICKOFF';
  switch (o.result) {
    case 'returnTd':
      return { title: unit === 'punt' && !k.returner ? 'BLOCKED, TOUCHDOWN' : `${unit === 'punt' ? 'PUNT' : 'KICKOFF'} RETURN TOUCHDOWN`, line: k.returner ? by(`${k.ret}-YARD RETURN FOR A TOUCHDOWN`) : 'RECOVERED IN THE END ZONE' };
    case 'recovered':
      return { title: 'MUFFED, AND RECOVERED', line: k.recoverer ? `${shortName(k.recoverer.name)} FALLS ON IT FOR THE KICKING TEAM` : 'THE KICKING TEAM FALLS ON IT' };
    case 'blocked':
      return { title: 'BLOCKED', line: 'THE PUNT IS BLOCKED' };
    case 'touchback':
      return { title: 'TOUCHBACK', line: unit === 'punt' ? `${kind} INTO THE END ZONE` : 'INTO THE END ZONE, OUT TO THE 25' };
    case 'fairCatch':
      return { title: 'FAIR CATCH', line: by(unit === 'punt' ? `CALLS FOR IT ON A ${kind}` : 'CALLS FOR IT') };
    case 'oob':
      return { title: 'OUT OF BOUNDS', line: unit === 'punt' ? `${kind}, OUT OF BOUNDS` : 'KICKOFF OUT OF BOUNDS, BALL AT THE 35' };
    case 'downed':
      return { title: 'DOWNED', line: unit === 'punt' ? `${kind}, DOWNED` : 'DOWNED' };
    default:
      return { title: k.ret >= 25 ? 'BIG RETURN' : unit === 'punt' ? 'PUNT' : 'KICKOFF', line: by(`${Math.max(0, k.ret)}-YARD RETURN${unit === 'punt' ? ` OF A ${kind}` : ''}`) };
  }
}

/** "J. SMITH" from "John Smith". */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(' ')}`).toUpperCase();
}
