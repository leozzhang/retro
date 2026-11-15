import { clutchRoster, CONF, leverage, shakenAimLag, unitEdge, type UnitConf } from '../data/confidence';
import { pickDefCall, pickDisguise, rushers, type DefCall, type DefTags } from '../data/defenses';
import { pickLineGame, preventLevel, situationMix, type DefIdentity } from '../data/identity';
import type { PlayDef } from '../data/plays';
import { DEF_SLOTS, type RosterPlayer, type Team } from '../data/teams';
import { Camera } from '../engine/camera';
import type { Input } from '../engine/input';
import { FIELD_W, OPP_GOAL, OWN_GOAL, STEP } from '../engine/constants';
import { clamp, gauss, mulberry32, type Rng } from '../engine/math';
import { successful } from '../season/grades';
import { anticFor, AUDIBLE_DC, callFor, checkFor, laneOf, leansFor, observe, recheckFor, releanFor, type DefBrain } from './defBrain';
import { CpuQb, isPassCall, ocCall, ocCheck, presnapRead, type OcPlan, type QbCtx, type QbLog } from './cpuOffense';
import { defPull, ocObserve, targetPull, type OcBrain } from './ocBrain';
import { Play } from './playState';
import { personnelOf, resolvePlay } from './resolvePlay';
import { newRecorder, recordFrame, TAPE, type Tape } from './tape';
import { applyOutcome, fgOdds, snapSituation, type Drive, type DriveClock, type DriveSim, type PlayOutcome, type SimPlay } from './rules';
import { clockOut, desperate, fourthDown, kickNow, SITUATION, spikeNow, tempo, type Situation } from './situation';
import { TWO_MIN } from './clock';

/**
 * One possession played through the engine, snap by snap (docs/ENGINEDRIVES.md): the offense's OC
 * calls (`ocCall`), the CPU QB runs it (`CpuQb`), the defense calls from its identity and, with a
 * brain, what it's learned (`callFor`, the check, the leans), and the brain watches every snap. The
 * coaching around the snaps (4th down, tempo, the last-second kick, kneeling, spiking) is the drive sim's
 * (`simulateDrive`, game/rules.ts), so the two can be compared drive for drive. Kicks are still
 * the drive sim's: field goals by `fgOdds`, punts by the caller's net.
 */

/** One side as the engine needs it. */
export interface EngineSide {
  team: Team;
  roster: Record<string, RosterPlayer>;
  oc: OcPlan;
  ident: DefIdentity;
  /** The units' confidence (`teamConf`): the kicker's moves a field goal, as in a played game. Missing is none. */
  conf?: UnitConf;
}

/**
 * The engine never loses a fumble on its own (`Play.fumble` is the offense's), so a lost fumble is
 * rolled on each tackle: `carry` per tackled carrier, `sack` per sack (strips), times the tackler's
 * `tkl` over the carrier's `str` (`perPoint` a point, within `range`). FBS teams lose about 0.6 a game.
 * A placeholder until the engine has a fumble mechanic.
 */
export const FUMBLE = { carry: 0.007, sack: 0.05, perPoint: 0.012, range: [0.5, 1.8] };

/**
 * Game-clock seconds a snap takes, by how it ended and the tempo, on the drive sim's scale
 * (`simPlayClock`): a stopped clock (`stop`) is the snap alone; a running clock adds the huddle.
 * Out of bounds stops it only inside two minutes of a half (NCAA); before that the clock starts again on
 * the ready signal, `oobReady` s short of a running snap. `spikeRun`: a running snap with a spike next
 * (the snap and lining up to spike it), and `spike` the spike itself.
 */
export const SNAP_SECS = { stop: [7, 2, 4, 12], run: [32, 6, 14, 45], milk: 38, hurry: [15, 4, 7, 25], oobReady: 7, spikeRun: [10, 2, 7, 14], spike: 1 };
/**
 * A CPU QB's shift (docs/DEFENSE.md, "The presnap"): the play clock the DC has left to re-check on it
 * (`recheckFor`), `clock` s on a huddled snap, `hurry` in the no-huddle (under `AUDIBLE_DC.clock`: no time to);
 * `max` s at most for the offense to get set.
 */
export const ENGINE_SHIFT = { clock: 15, hurry: AUDIBLE_DC.clock - 1, max: 6 };

export interface EngineSnap {
  play: PlayDef;
  call: DefCall;
  tags: DefTags;
  down: number;
  toGo: number;
  /** Yards from the offense's own goal before the snap. */
  yard: number;
  gain: number;
  type: PlayOutcome['type'];
  pass: boolean;
  /** A throw left his hand (a throwaway too). */
  thrown: boolean;
  complete: boolean;
  /** Air yards of the throw, past the line. */
  air: number;
  target: string | null;
  carrier: string | null;
  tackler: string | null;
  /** A defender's interception or recovered fumble. */
  takeaway: string | null;
  lostFumble: boolean;
  qb: QbLog | null;
  secs: number;
  /** The QB checked to this play at the line; it was a shift (another formation), and the DC re-checked on it. */
  checked: boolean;
  shifted: boolean;
  rechecked: boolean;
  /** How much the snap mattered (`leverage`): confidence shifts by it. */
  lev: number;
  /** The defense showed another shell before the snap. */
  disguised: boolean;
  /** Corners off this snap (of two); play action's chances and bites; the defender beaten on the throw. */
  soft: number;
  paSeen: number;
  paBit: string[];
  beaten: string | null;
  /** The snap on tape (`EngineOpts.record`), for watching it and its key plays. */
  tape?: Tape;
}

export interface EngineDrive extends DriveSim {
  /** Points the defense scored (a pick six, a safety). */
  defPoints: number;
  snaps: EngineSnap[];
}

export interface EngineOpts {
  /** The defense's learning brain (kept across the defense's drives); null plays the identity's mix. */
  brain: DefBrain | null;
  /** The offense's learning OC (kept across its drives); missing or null calls his book as it is. */
  ocBrain?: OcBrain | null;
  /** Called for each snap as the drive sim calls `onPlay`, for the logs the season reads; `snap` is the engine's (none on a kick, punt, kneel or spike). */
  onPlay?: (p: SimPlay, snap?: EngineSnap) => void;
  /** Keep each snap on tape (`EngineSnap.tape`). Watching draws nothing from the drive's stream. */
  record?: boolean;
  /** The home team, which wears the home kit on tape. */
  homeId?: string;
  /** Disguises off (the dynasty setting). */
  noDisguise?: boolean;
  /** No presnap checks (the A/B). */
  noCheck?: boolean;
  /** The snap's clock pace (`DriveClock.pace` also works). */
  pace?: number;
}

const cam = new Camera();
const MAX_SECS = 15;
/** No keys: the presnap of a CPU snap (the QB only acts after it). */
const IDLE = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
  axis: () => ({ x: 0, y: 0 }), isDown: () => false, hit: () => false, endStep: () => {},
} as unknown as Input;

/** Seconds off the game clock for a snap that ended this way (`SNAP_SECS`). */
function snapSecs(o: PlayOutcome, tmp: string | null, pace: number, rng: Rng, twoMin: boolean): number {
  const S = SNAP_SECS;
  const draw = ([m, sd, lo, hi]: number[], k = 1) => clamp((m + gauss(rng) * sd) * k, lo, hi);
  if (clockStopped(o, twoMin)) return draw(S.stop);
  if (tmp === 'hurry') return draw(S.hurry);
  const run = draw([tmp === 'milk' ? S.milk : S.run[0], S.run[1], S.run[2], S.run[3]], pace);
  return o.type === 'oob' ? Math.max(S.stop[2], run - S.oobReady) : run;
}

/** The clock stays stopped after this snap until the next one (out of bounds only inside two minutes of a half). */
const clockStopped = (o: PlayOutcome, twoMin: boolean): boolean =>
  o.type === 'incomplete' || o.type === 'td' || o.type === 'int' || o.type === 'pick6' || (o.type === 'oob' && twoMin);

/** The defense's call for a snap, as the CPU defense calls it on the user (`Game.toCall`): brain or identity, a line game, press, a disguise. */
function defCall(def: EngineSide, brain: DefBrain | null, sit: Situation, rng: Rng, noDisguise: boolean) {
  const ytg = sit.yardsToGoal;
  let call: DefCall;
  let tags: DefTags;
  if (brain) {
    ({ call, tags } = callFor(brain, def.ident, sit.down, sit.toGo, ytg, rng, sit));
  } else {
    call = pickDefCall(rng, situationMix(def.ident, sit.down, sit.toGo, ytg, undefined, false, sit));
    tags = preventLevel(sit) ? { prevent: true } : {};
  }
  if (!tags.prevent && rushers(call) === 4) {
    const game = pickLineGame(rng, def.ident);
    if (game) tags = { ...tags, game };
  }
  const pr = def.ident.press;
  const press = { CB1: rng() < pr.CB1, CB2: rng() < pr.CB2, NB: rng() < pr.NB };
  const disguise = !noDisguise && !tags.prevent && rng() < def.ident.disguise ? pickDisguise(rng, call) : null;
  return { call, tags, press, disguise };
}

/**
 * The look a designed shift breaks the huddle in: another formation of the called play's personnel in his book,
 * by how many of his plays line up in it (a play of it, for the alignment). None if the personnel has one formation.
 */
export function showFormation(book: readonly PlayDef[], play: PlayDef, rng: Rng): PlayDef | null {
  const pers = personnelOf(play.formation);
  const by = new Map<string, PlayDef[]>();
  for (const p of book) {
    if (p.formation.name === play.formation.name || personnelOf(p.formation) !== pers) continue;
    const l = by.get(p.formation.name);
    if (l) l.push(p);
    else by.set(p.formation.name, [p]);
  }
  const all = [...by.values()];
  const n = all.reduce((t, l) => t + l.length, 0);
  if (!n) return null;
  let x = rng() * n;
  for (const l of all) if ((x -= l.length) < 0) return l[0];
  return all[all.length - 1][0];
}

/** The defenders' play recognition by slot, for their leans. */
const prcOf = (r: Record<string, RosterPlayer>) => Object.fromEntries(DEF_SLOTS.map((sl) => [sl, r[sl]?.r.prc ?? 60]));

/** One snap through the engine, from the offense's `drive` (in world x, the offense attacking +x). */
export function engineSnap(
  off: EngineSide, def: EngineSide, drive: Drive, sit: Situation, rng: Rng, brain: DefBrain | null,
  opts: { noDisguise?: boolean; heave?: boolean; noCheck?: boolean; lev?: number; ocBrain?: OcBrain | null; record?: boolean; homeId?: string; hurry?: boolean } = {},
) {
  let { call, tags, press, disguise } = defCall(def, brain, sit, rng, !!opts.noDisguise);
  let playDef = ocCall(off.oc, sit, rng, opts.heave, opts.ocBrain ?? null);
  // A designed shift (`OffIdentity.shift`): he breaks the huddle in another formation of the personnel and
  // shifts into the called one. Not with the clock running out on him. The defense reads the look it's shown.
  const shows = !!off.oc.id && !opts.heave && !opts.hurry && !clockOut(sit) && rng() < off.oc.id.shift ? showFormation(off.oc.book, playDef, rng) : null;
  const huddle = shows ?? playDef;
  if (brain) {
    const c = checkFor(brain, def.ident, huddle, call, sit.down, sit.toGo, sit.yardsToGoal, sit);
    if (c) {
      call = c;
      disguise = null;
      if (tags.game && rushers(c) !== 4) tags = { ...tags, game: undefined };
    }
  }
  // The QB reads what they show and may check out of a bad look (`ocCheck`), on the play stream.
  let checked: PlayDef | null = null;
  const ob = opts.ocBrain ?? null;
  const read = presnapRead(def.ident, call, disguise, sit, ob);
  const qbPrc = off.roster.QB?.r.prc ?? 60;
  if (!opts.heave && !opts.noCheck) {
    checked = ocCheck(off.oc, playDef, read, sit, qbPrc, rng, ob, softCorners(press, tags));
    if (checked) playDef = checked;
  }
  const prc = prcOf(def.roster);
  // Everyone plays the snap with his confidence at its leverage, as in a played game (`Game.startPlay`): ratings
  // shift by it (`clutchRoster`), and a shaken QB's nerves are aim lag rather than lost accuracy (`shakenAimLag`).
  const lev = opts.lev ?? 0;
  const at = { down: sit.down, toGo: sit.toGo, yardsToGoal: sit.yardsToGoal };
  // A designed shift, or a check to another formation, is a shift: the defense sees it and may answer. The huddle's look comes first.
  const shifted = playDef.formation.name !== huddle.formation.name;
  const offRoster = clutchRoster(off.roster, lev, true);
  const defRoster = clutchRoster(def.roster, lev);
  const antic = brain ? anticFor(brain, prc) : undefined;
  let reads = brain ? leansFor(brain, prc, call, shifted ? huddle : playDef, at) : undefined;
  let flip = rng() < 0.5;
  const setup = (p: PlayDef, f: boolean, from?: Play) => new Play({
    offTeam: off.team, defTeam: def.team, offRoster, defRoster,
    aimNerves: shakenAimLag(off.roster.QB?.conf ?? 0, lev), play: p, defCall: call, press, tags,
    habits: brain ? brain.habits : undefined, antic, reads,
    los: drive.los, ballY: drive.ballY, flip: f, disguise, rng, ...(opts.homeId ? { homeId: opts.homeId } : {}),
    ...(clockOut(sit) ? { clockOut: true } : {}), ...(from ? { from } : {}),
  });
  let rechecked = false;
  let play: Play;
  if (shifted) {
    const lined = setup(huddle, flip);
    if (brain) {
      const c = recheckFor(brain, def.ident, playDef, call, sit.down, sit.toGo, sit.yardsToGoal, opts.hurry ? ENGINE_SHIFT.hurry : ENGINE_SHIFT.clock, sit);
      if (c) {
        call = c;
        disguise = null; // a late check is played straight
        if (tags.game && rushers(c) !== 4) tags = { ...tags, game: undefined };
        rechecked = true;
      }
      reads = releanFor(brain, prc, call, playDef, at, reads);
    }
    // The strength stays where it lined up (its own flip rule would mirror it).
    flip = resolvePlay(playDef, drive.ballY, false).mirrored !== lined.resolved.mirrored;
    play = setup(playDef, flip, lined);
  } else {
    play = setup(playDef, flip);
  }
  const qb = new CpuQb(play, (rng() * 2 ** 31) >>> 0, { ...qbCtx(off, sit, ob), defPull: off.oc.id ? (d, rt) => defPull(ob, d, rt) : null });
  const rec = opts.record ? newRecorder(play) : null;
  if (rec) recordFrame(rec, 0);
  // The shift: everyone to his new spot, set, then the snap.
  let shiftSecs = 0;
  while (shifted && !play.canSnap() && shiftSecs < ENGINE_SHIFT.max) {
    play.update(STEP, IDLE, cam);
    shiftSecs += STEP;
    if (rec) recordFrame(rec, STEP);
  }
  play.snap();
  for (let i = 0; i < MAX_SECS / STEP && play.phase !== 'over'; i++) {
    qb.step();
    play.update(STEP, qb.input, cam);
    if (rec) recordFrame(rec, STEP);
  }
  const o: PlayOutcome = play.outcome ?? { type: 'tackle', spot: play.carrier?.pos.x ?? drive.los, spotY: drive.ballY, text: '', sub: '', color: '' };
  return { play, o, qb: qb.log, checked: !!checked, shifted, rechecked, shiftSecs, shown: disguise?.show ?? call.shell, soft: softCorners(press, tags),
    /** The snap's tape, run on past the whistle: call it once the snap has been read. */
    tape: (): Tape | undefined => (rec ? (tapeTail(play, qb, rec), rec.tape) : undefined),
  };
}

/**
 * The tape runs on past the whistle (`TAPE.tail`, `scoreTail` after a score) as a played snap's does. The
 * play's own stream is swapped for one of its own first, so the tail draws nothing from the drive's.
 */
function tapeTail(play: Play, qb: CpuQb, rec: ReturnType<typeof newRecorder>): void {
  if (play.phase !== 'over') return;
  const outcome = play.outcome;
  (play as unknown as { rng: Rng }).rng = mulberry32(0x7a9e);
  const tail = outcome?.type === 'td' || outcome?.type === 'pick6' ? TAPE.scoreTail : TAPE.tail;
  for (let i = 0; i < tail / STEP; i++) {
    qb.step();
    play.update(STEP, qb.input, cam);
    recordFrame(rec, STEP);
  }
  play.outcome = outcome;
}

/** Corners (CB1, CB2) playing off this snap: not pressed, and not in prevent (everyone's deep). */
const softCorners = (press: Record<string, boolean>, tags: DefTags) => (tags.prevent ? 0 : (press.CB1 ? 0 : 1) + (press.CB2 ? 0 : 1));

/** The QB's side of the identity for a snap: his targets (pulled by what's working this game) and his leans. */
function qbCtx(off: EngineSide, sit: Situation, brain: OcBrain | null): QbCtx {
  const id = off.oc.id;
  if (!id) return sit;
  const favor: Record<string, number> = {};
  for (const [sl, v] of Object.entries(id.targets)) favor[sl] = v * targetPull(brain, sl);
  const tot = Object.values(favor).reduce((a, b) => a + b, 0) || 1;
  for (const sl of Object.keys(favor)) favor[sl] /= tot;
  return { down: sit.down, toGo: sit.toGo, yardsToGoal: sit.yardsToGoal, favor, runLean: id.qb.runLean, aggression: id.qb.aggression };
}

/** Yards a finished snap gained from `los` (an incompletion or interception none). */
const gainOf = (o: PlayOutcome, los: number): number =>
  Math.round((o.type === 'td' ? OPP_GOAL : o.type === 'incomplete' || o.type === 'int' || o.type === 'pick6' ? los : o.spot) - los);

/** A finished snap as the logs and the box score read it. */
function readSnap(
  play: Play, o: PlayOutcome, drive: Drive, sit: Situation,
  r: { qb: QbLog | null; checked: boolean; shifted?: boolean; rechecked?: boolean; shown: string; soft: number; secs: number; lev: number; fumbled: boolean },
): EngineSnap {
  // Rounded, a snap stopped short of the goal line can't reach it: only a touchdown gets to 100.
  const yard = clamp(Math.round(drive.los - OWN_GOAL), 1, 99);
  const gain = o.type === 'td' ? gainOf(o, drive.los) : Math.min(gainOf(o, drive.los), 99 - yard);
  const pass = isPassCall(play.playDef) && !play.handedOff && !(play.kept && play.playDef.kind === 'run');
  const takeaway = o.type === 'int' || o.type === 'pick6' ? play.carrier?.slot ?? null : r.fumbled ? play.tackler?.slot ?? null : null;
  return {
    play: play.playDef, call: play.defCall, tags: play.tags ?? {}, down: drive.down, toGo: sit.toGo, yard, gain, type: o.type, pass,
    thrown: play.thrown, complete: play.thrown && !!play.ballMan && play.ballMan !== play.qb && o.type !== 'incomplete' && o.type !== 'int' && o.type !== 'pick6',
    air: play.thrown && play.ballTarget ? Math.round(play.ballTarget.x - drive.los) : 0, target: play.thrown ? play.intended?.slot ?? null : null,
    carrier: play.ballMan?.slot ?? null, tackler: play.tackler?.slot ?? null, takeaway, lostFumble: r.fumbled, qb: r.qb, secs: r.secs, checked: r.checked, shifted: !!r.shifted, rechecked: !!r.rechecked, lev: r.lev,
    disguised: r.shown !== play.defCall.shell, soft: r.soft, paSeen: play.paSeen, paBit: [...play.paBit],
    beaten: play.thrown ? play.throwRecord(gain)?.beaten ?? null : null,
  };
}

/**
 * A two-point try through the engine: one snap from the 3 in `sit`, good on a touchdown. The brains
 * don't learn from it. `play` is the snap as the story logs it.
 */
export function engineTry(
  off: EngineSide, def: EngineSide, sit: Situation, rng: Rng,
  opts: { brain: DefBrain | null; ocBrain?: OcBrain | null; record?: boolean; homeId?: string; noDisguise?: boolean },
): { good: boolean; snap: EngineSnap; play: SimPlay } {
  const drive: Drive = { los: OPP_GOAL - 3, ballY: FIELD_W / 2, down: 1, firstDownX: OPP_GOAL };
  const r = engineSnap(off, def, drive, sit, rng, opts.brain, { lev: 1, ocBrain: opts.ocBrain, record: opts.record, homeId: opts.homeId, noDisguise: opts.noDisguise });
  const snap = readSnap(r.play, r.o, drive, sit, { qb: r.qb, checked: r.checked, shifted: r.shifted, rechecked: r.rechecked, shown: r.shown, soft: r.soft, secs: 0, lev: 1, fumbled: false });
  const tape = r.tape();
  if (tape) snap.tape = tape;
  const good = r.o.type === 'td';
  const turnover = r.o.type === 'int' || r.o.type === 'pick6';
  return { good, snap, play: { gain: good ? 3 : turnover ? 0 : Math.min(2, snap.gain), explosive: false, turnover, down: 1, toGo: 3, yard: 97, t: 0, lev: 1 } };
}

/** A lost fumble on this tackle (`FUMBLE`), rolled on the drive's stream. */
function lostFumble(play: Play, o: PlayOutcome, rng: Rng): boolean {
  if (o.type !== 'tackle' && o.type !== 'sack') return false;
  const c = play.ballMan;
  const t = play.tackler;
  if (!c || !t) return false;
  const [lo, hi] = FUMBLE.range;
  const k = clamp(1 + (t.r.tkl - c.r.str) * FUMBLE.perPoint, lo, hi);
  return rng() < (o.type === 'sack' ? FUMBLE.sack : FUMBLE.carry) * k;
}

/**
 * A possession from `start` (yards from the offense's own goal), with the drive sim's coaching on
 * `clock`. `clock.lead` should be set: the engine's offense always reads the score.
 */
export function engineDrive(off: EngineSide, def: EngineSide, start: number, rng: Rng, clock: DriveClock, opts: EngineOpts): EngineDrive {
  const brain = opts.brain;
  const pace = opts.pace ?? clock.pace ?? 1;
  let drive: Drive = { los: OWN_GOAL + clamp(start, 1, 99), ballY: FIELD_W / 2, down: 1, firstDownX: Math.min(OPP_GOAL, OWN_GOAL + clamp(start, 1, 99) + 10) };
  const snaps: EngineSnap[] = [];
  let secs = 0;
  let plays = 0;
  /** The clock is stopped until the next snap (it starts on the snap after a kick). */
  let stopped = true;
  // Rounded, a live ball is between the 1 and the 99 (inches from the goal line is still short of it).
  const yardOf = (d: Drive) => clamp(Math.round(d.los - OWN_GOAL), 1, 99);
  const startYard = yardOf(drive);
  const done = (points: number, result: DriveSim['result'], end: number, defPoints = 0): EngineDrive => ({
    points, result, plays, yards: end - startYard, endYard: end, secs: Math.min(secs, clock.timeLeft), defPoints, snaps,
  });
  // Late and close, as `lateAndClose` reads a played game's clock: the 4th quarter (or overtime) within `CONF.closeMargin`.
  const late = (): boolean =>
    (!!clock.ot || ((clock.finalHalf ?? true) && clock.timeLeft - secs <= (clock.qSecs ?? 900))) && Math.abs(clock.lead ?? 0) <= CONF.closeMargin;
  const sitNow = (): Situation => snapSituation(clock, drive.down, Math.max(1, Math.round(drive.firstDownX - drive.los)), yardOf(drive), secs);

  while (plays < 30) {
    if (secs >= clock.timeLeft) return done(0, 'END OF HALF', yardOf(drive));
    const sit = sitNow();
    const tmp = tempo(sit);
    const yard = yardOf(drive);
    const lev = leverage(drive.down, 100 - yard, late());
    if (tmp === 'kneel' && !clock.quarterBreak) {
      while (secs < clock.timeLeft) {
        plays++;
        opts.onPlay?.({ gain: -1, explosive: false, turnover: false, down: drive.down, toGo: sit.toGo, yard: yardOf(drive), t: secs, lev: 0, kneel: true });
        drive = { ...drive, los: drive.los - 1, down: drive.down + 1 };
        secs += SITUATION.kneelSecs;
      }
      return done(0, 'END OF HALF', yardOf(drive));
    }
    const heave = desperate(sit) && !clock.quarterBreak;
    plays++;
    const at = { yard, t: secs };
    const { play, o, qb, checked, shifted, rechecked, shiftSecs, shown, soft, tape: tapeOf } = engineSnap(off, def, drive, sit, rng, brain, {
      noDisguise: opts.noDisguise, heave, noCheck: opts.noCheck, lev, ocBrain: opts.ocBrain, record: opts.record, homeId: opts.homeId,
      ...(tmp === 'hurry' ? { hurry: true } : {}),
    });
    const twoMin = sit.secsLeft <= TWO_MIN;
    // A shift on a running clock runs it that much longer before the snap.
    const cost = (heave ? 8 : snapSecs(o, tmp, pace, rng, twoMin)) + (stopped ? 0 : shiftSecs);
    secs += cost;
    stopped = clockStopped(o, twoMin);
    const fumbled = lostFumble(play, o, rng);
    const snap = readSnap(play, o, drive, sit, { qb, checked, shifted, rechecked, shown, soft, secs, lev, fumbled });
    const { gain } = snap;
    snaps.push(snap);
    const turnover = o.type === 'int' || o.type === 'pick6' || fumbled;
    opts.onPlay?.({ gain: turnover ? 0 : gain, explosive: gain >= 15 && !turnover, turnover, down: drive.down, toGo: sit.toGo, ...at, lev, ...(heave ? { heave: true } : {}) }, snap);
    if (brain) {
      const success = successful({ gain, pass: play.playDef.kind !== 'run', down: drive.down, toGo: sit.toGo, ...(o.type === 'sack' ? { sack: true } : {}), ...(turnover ? { turnover: true } : {}) });
      observe(brain, {
        play: play.playDef, call: play.defCall, down: drive.down, toGo: sit.toGo, yardsToGoal: OPP_GOAL - drive.los, gain, success,
        scrambled: play.scramble, kept: play.kept, air: play.ballTarget && play.thrown ? play.ballTarget.x - drive.los : 0,
        handedOff: play.handedOff, lane: laneOf(play), tags: play.tags, target: play.thrown ? play.intended?.slot ?? null : null,
        lost: turnover || o.type === 'sack',
        throw: play.throwRecord(gain), antic: Object.fromEntries([...play.anticLog].map(([d, r]) => [d.slot, r])),
        ...(shifted ? { shifted: true } : {}),
      });
    }
    if (opts.ocBrain && !heave) {
      ocObserve(opts.ocBrain, {
        play: play.playDef, call: play.defCall, down: drive.down, toGo: sit.toGo, yardsToGoal: OPP_GOAL - drive.los, gain,
        lost: turnover || o.type === 'sack', handedOff: play.handedOff, target: play.thrown ? play.intended?.slot ?? null : null, shown,
        paSeen: play.paSeen, paBit: play.paBit.length, softCorners: isPassCall(play.playDef) ? soft : undefined,
        beaten: play.thrown ? play.throwRecord(gain)?.beaten ?? null : null, route: qb?.route ?? null,
      });
    }
    // The tape runs on past the whistle only now, with the snap read and learned from.
    const tape = tapeOf();
    if (tape) snap.tape = tape;
    if (fumbled) return done(0, 'TURNOVER', Math.round(clamp(o.spot, OWN_GOAL + 1, OPP_GOAL - 1) - OWN_GOAL));
    const ap = applyOutcome(drive, o);
    switch (ap.change.kind) {
      case 'pat':
        return done(7, 'TOUCHDOWN', 100);
      case 'pick6':
        return done(0, 'TURNOVER', yard, 7);
      case 'safety':
        return done(0, 'TURNOVER', 0, 2);
      case 'int':
        return done(0, 'TURNOVER', Math.round(100 - ap.change.cpuStart));
      case 'downs':
        return done(0, 'DOWNS', yardOf(ap.drive));
      default:
        break;
    }
    drive = ap.drive;
    // In bounds with the clock running: spike the next snap if the clock has to stop (`spikeNow`), lining up to
    // spike in place of the no-huddle call (decided on the mean line-up, so only a spike draws).
    if (!heave && !clockStopped(o, twoMin) && !clock.quarterBreak) {
      const S = SNAP_SECS.spikeRun;
      const after = sitNow();
      if (spikeNow({ ...after, secsLeft: after.secsLeft + cost - S[0] })) {
        secs += clamp(S[0] + gauss(rng) * S[1], S[2], S[3]) - cost;
        plays++;
        opts.onPlay?.({ gain: 0, explosive: false, turnover: false, down: drive.down, toGo: after.toGo, yard: yardOf(drive), t: secs, lev: 0, spike: true });
        secs += SNAP_SECS.spike;
        stopped = true;
        drive = { ...drive, down: drive.down + 1 };
      }
    }
    if (drive.down === 1) continue;
    // The coach reads the situation: 4th down, or out of time before it (the drive sim's rules).
    const next = sitNow();
    const fgDist = 100 - yardOf(drive) + 17;
    const kick = (): EngineDrive => {
      // The drive sim's kick, with the kicker's confidence at the kick's leverage (as a played game's CPU kicks).
      const fgLev = leverage(drive.down, next.yardsToGoal, late(), fgDist);
      const made = rng() < fgOdds(fgDist, off.conf ? unitEdge(off.conf.k, fgLev) : 0);
      opts.onPlay?.({ gain: 0, explosive: false, turnover: false, down: drive.down, toGo: next.toGo, yard: yardOf(drive), t: secs, fg: { dist: fgDist, made }, lev: fgLev });
      return done(made ? 3 : 0, made ? 'FIELD GOAL' : 'MISSED FG', yardOf(drive));
    };
    if (!clock.quarterBreak && kickNow(next)) return kick();
    if (drive.down < 4) continue;
    const c = fourthDown(next, rng);
    if (c === 'fg') return kick();
    if (c === 'punt') {
      opts.onPlay?.({ gain: 0, explosive: false, turnover: false, down: drive.down, toGo: next.toGo, yard: yardOf(drive), t: secs, punt: true, lev: 0 });
      return done(0, 'PUNT', yardOf(drive));
    }
  }
  return done(0, 'PUNT', yardOf(drive));
}

/** A fresh stream for a drive, from the game's (so a game's drives don't share draws with its other systems). */
export const driveStream = (rng: Rng): Rng => mulberry32((rng() * 2 ** 31) >>> 0);
