import type { Coach } from '../data/coaches';
import { dcAdjust, ocAdjust } from '../data/coaches';
import { lateAndClose, leverage, unitEdge, type UnitConf } from '../data/confidence';
import { onField, starters, teamConf, twosSquad, type Squad } from '../data/depth';
import type { Athlete } from '../data/athletes';
import { defIdentity } from '../data/identity';
import { offIdentity } from '../data/offIdentity';
import { ocBook, ocStyle } from '../data/offStyles';
import { DEF_SLOTS, type RosterPlayer } from '../data/teams';
import { clamp, gauss, mulberry32, type Rng } from '../engine/math';
import { advanceSim, newClock, nextQuarter, timeLeftInHalf } from '../game/clock';
import { halftime, newBrain, newDrive, teamSmarts, type DefBrain, type DefenseIq } from '../game/defBrain';
import { driveStream, engineDrive, engineTry, type EngineDrive, type EngineSide, type EngineSnap } from '../game/engineDrive';
import { engineKickoff, enginePunt, kickCaption, KICKOFF_FROM, SAFETY_KICK_FROM, type EngineKick } from '../game/engineKick';
import type { Tape } from '../game/tape';
import { newOcBrain, ocHalftime, type OcBrain } from '../game/ocBrain';
import { rosterRead, type FilmBook } from '../game/offModel';
import { OVERTIME, PAT, userStartAfter, xpOdds, type DriveClock, type SimPlay } from '../game/rules';
import { goForTwo, type Situation } from '../game/situation';
import { engineCredit } from './cast';
import { gamePlays, type Against } from './gamePlays';
import { blankTeamLine, creditSnaps, driveLog, GAME_SIM, type BoxSide, type LiveNext, type PartResult } from './simGame';
import { newStory, type Credited, type DriveCredit, type GameStory, type StoryDrive, type StoryKick } from './story';
import type { DriveLog, GameResult } from './types';

/**
 * The user's games played through the engine with nobody at the controls (docs/ENGINEDRIVES.md, phase 4):
 * SIM GAME, the simulated quarters before the user takes over, and the exhibition's SIM GAME. Both
 * offenses are their OC's book called by `ocCall` and run by the reading CPU QB; both defenses are their
 * DC's identity with his learning brain; each OC's brain learns the other defense. Every snap is real, so
 * the box score, the grades and the highlights read the players who made it, with no casting. CPU-vs-CPU
 * games stay on `simGame`.
 *
 * The coaching around the snaps is the engine drive's (the drive sim's rules); the game around the drives
 * is a played game's: the try after a touchdown (the two-point chart, or the kick by the kicker), the
 * defense's scores, FBS overtime. There's no home edge, as on the field.
 */

/**
 * Garbage time: a side that leads by enough for the clock left puts its twos in, offense and defense (K
 * and P stay), and calls a safer game. Real FBS teams empty the bench in a blowout, which is most of why
 * real margins stop growing; the drive sim's `GAME_SIM.script` stands in for it. Decided at each
 * regulation drive's start from the score and clock alone, so it draws no random numbers.
 * - `lead`: the lead that brings the twos in, by the second half's fraction left (1 at the start of the
 *   3rd quarter), linear between points. Never in the first half or in overtime.
 * - `back`: once in, the twos stay until the lead falls this far under the line.
 * - `scale`: the lines scale with the quarter length over 15:00 (shorter games score less), at least `minScale`.
 * - `pass`: the pass share the leader's OC gives up with the twos in.
 */
export const MOPUP = {
  lead: [[1, 30], [0.5, 24], [0.27, 18], [0, 14]] as [number, number][],
  back: 10,
  scale: 900,
  minScale: 0.5,
  pass: 0.2,
};

/** The lead that brings the twos in with `frac` of the second half left, for quarters of `qSecs`. */
export function mopupLine(frac: number, qSecs: number): number {
  const pts = MOPUP.lead;
  let line = pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [f0, l0] = pts[i];
    const [f1, l1] = pts[i + 1];
    if (frac <= f0 && frac >= f1) {
      line = l1 + ((frac - f1) / (f0 - f1)) * (l0 - l1);
      break;
    }
  }
  if (frac > pts[0][0]) line = pts[0][1];
  return line * Math.max(MOPUP.minScale, Math.min(1, qSecs / MOPUP.scale));
}

/** One team as the engine game needs it. */
export interface EngineTeamIn {
  squad: Squad;
  oc: Coach;
  dc: Coach;
  /** The OC's pass share this week (the game plan). */
  passShare: number;
  /** This team's DC brain's IQ: the DEFENSE IQ setting for the CPU, NORMAL for the user's DC. */
  iq?: DefenseIq;
  /** Film of this team's offense (`TeamState.film`), the other DC's prior. */
  film?: FilmBook;
  /** This team's defense disguises its shell (missing: yes). */
  disguises?: boolean;
  /** Brains made by the caller and kept going (a live game picking up from simulated quarters). */
  dcBrain?: DefBrain | null;
  ocBrain?: OcBrain | null;
}

/** A kickoff or punt on tape, by its story kick's play (`StoryKick.play`). */
export interface KickSnap {
  kick: true;
  tape?: Tape;
}

/** Each snap the engine played, by the story's play, with its tape when recording, and each kick's: for watching a simulated game. */
export type SnapWatch = Map<SimPlay, EngineSnap | KickSnap>;

/** The watched snap is a snap from scrimmage, not a kick. */
export const isEngineSnap = (s: EngineSnap | KickSnap | undefined): s is EngineSnap => !!s && !('kick' in s);

export interface EngineGameOpts {
  /** Collects every drive for the progression grades. */
  drives?: DriveLog[];
  /** Tells the game drive by drive (season/story.ts). */
  story?: GameStory;
  /** Each snap by its story play (`record`: on tape). Watching draws nothing from the game's streams. */
  watch?: SnapWatch;
  record?: boolean;
  /** Quarter length in minutes (15 for a whole simulated game). */
  qMin?: number;
}

/** Who a side has on the field: its starters, or its twos in garbage time. */
interface Lineup {
  roster: Record<string, RosterPlayer>;
  on: Record<string, Athlete>;
  side: EngineSide;
  conf: UnitConf;
}

interface ESide extends BoxSide, Lineup {
  squad: Squad;
  /** The starters, and the twos (built the first time they're needed). */
  full: Lineup;
  twos: Lineup | null;
  /** The twos are in. */
  mop: boolean;
  /** For building the twos. */
  input: EngineTeamIn;
  /** This team's DC (defending) and OC (on offense) brains. */
  dcBrain: DefBrain | null;
  ocBrain: OcBrain | null;
  noDisguise: boolean;
}

const seedOf = (rng: Rng) => (rng() * 2 ** 31) >>> 0;

/** `t`'s lineup from `squad` (its own, or its twos), with the OC's pass share moved by `passShift`. */
function lineupOf(t: EngineTeamIn, squad: Squad, passShift = 0): Lineup {
  const roster = onField(squad);
  const team = t.squad.team;
  const conf = teamConf(squad);
  return {
    roster, on: starters(squad), conf,
    side: {
      team, roster, conf, ident: defIdentity(team, t.dc),
      oc: { book: ocBook(t.oc), style: ocStyle(t.oc), passShare: passShift ? clamp(t.passShare + passShift, 0.2, 0.8) : t.passShare, id: offIdentity(t.oc, roster) },
    },
  };
}

function sideOf(t: EngineTeamIn): Omit<ESide, 'dcBrain' | 'ocBrain'> {
  const full = lineupOf(t, t.squad);
  return {
    id: t.squad.team.id, squad: t.squad, ...full, full, twos: null, mop: false, input: t,
    cast: mulberry32(0), tl: blankTeamLine(), lines: new Map(),
    noDisguise: t.disguises === false,
  };
}

/** Put `s`'s twos in (`on`) or its starters back. */
function setTwos(s: ESide, on: boolean): void {
  if (s.mop === on) return;
  s.mop = on;
  if (on && !s.twos) s.twos = lineupOf(s.input, twosSquad(s.squad), -MOPUP.pass);
  const l = on ? s.twos! : s.full;
  s.roster = l.roster;
  s.on = l.on;
  s.side = l.side;
  s.conf = l.conf;
}

/** `t`'s DC brain against `opp`'s offense: what he knows at kickoff (as `Game` builds the CPU's), on the engine's payoff table. */
export function engineDcBrain(t: EngineTeamIn, opp: EngineTeamIn, seed: number): DefBrain | null {
  const roster = onField(t.squad);
  const oppRoster = onField(opp.squad);
  return newBrain({
    iq: t.iq ?? 'NORMAL', adjust: dcAdjust(t.dc), scout: t.dc.r.scout, qbMobility: clamp(((oppRoster.QB?.r.spd ?? 70) - 70) / 20, 0, 1), seed,
    smarts: teamSmarts(DEF_SLOTS.map((sl) => roster[sl]?.r.prc ?? 60)),
    book: ocBook(opp.oc), style: ocStyle(opp.oc), roster: rosterRead(oppRoster), film: opp.film, table: 'engine',
  });
}

/** `t`'s OC brain against `opp`'s defense. */
export function engineOcBrain(t: EngineTeamIn, opp: EngineTeamIn, seed: number): OcBrain {
  const roster = onField(t.squad);
  return newOcBrain({ adjust: ocAdjust(t.oc), scout: t.oc.r.scout, qbPrc: roster.QB?.r.prc ?? 60, def: defIdentity(opp.squad.team, opp.dc), seed, defRoster: onField(opp.squad) });
}

/** The two sides with their brains (the caller's, else new ones from `rng`). */
function sides(a: EngineTeamIn, b: EngineTeamIn, rng: Rng): [ESide, ESide] {
  const s = [seedOf(rng), seedOf(rng), seedOf(rng), seedOf(rng)];
  const sa: ESide = { ...sideOf(a), dcBrain: a.dcBrain !== undefined ? a.dcBrain : engineDcBrain(a, b, s[0]), ocBrain: a.ocBrain !== undefined ? a.ocBrain : engineOcBrain(a, b, s[1]) };
  const sb: ESide = { ...sideOf(b), dcBrain: b.dcBrain !== undefined ? b.dcBrain : engineDcBrain(b, a, s[2]), ocBrain: b.ocBrain !== undefined ? b.ocBrain : engineOcBrain(b, a, s[3]) };
  return [sa, sb];
}

/** One game's run: its sides, streams and records. */
class Run {
  readonly story: GameStory;
  readonly against: Against = new Map();
  constructor(
    readonly rng: Rng, readonly home: ESide, readonly away: ESide, readonly opts: EngineGameOpts, story: GameStory, readonly qSecs: number,
  ) {
    this.story = story;
  }

  private score(o: ESide, d: ESide) {
    return { [o.id]: o.tl.points, [d.id]: d.tl.points };
  }

  private watch(plays: SimPlay[], snaps: (EngineSnap | undefined)[]): void {
    const w = this.opts.watch;
    if (w) plays.forEach((p, i) => snaps[i] && w.set(p, snaps[i]!));
  }

  /** A possession: the drive, its credit, its log and its story. A touchdown counts six here; the try is the caller's. */
  drive(o: ESide, d: ESide, start: number, clock: DriveClock, half: number, left: number, ot = false): { e: EngineDrive; told: StoryDrive; log: DriveLog } {
    if (d.dcBrain) newDrive(d.dcBrain);
    const plays: SimPlay[] = [];
    const snaps: (EngineSnap | undefined)[] = [];
    const e = engineDrive(o.side, d.side, start, driveStream(this.rng), clock, {
      brain: d.dcBrain, ocBrain: o.ocBrain, record: this.opts.record, homeId: this.home.id, noDisguise: d.noDisguise,
      onPlay: (p, s) => {
        plays.push(p);
        snaps.push(s);
      },
    });
    const credit: DriveCredit = { snaps: plays.map((p, i) => engineCredit(p, snaps[i], o.on, d.on)) };
    const points = e.result === 'TOUCHDOWN' ? 6 : e.points;
    const told: StoryDrive = { off: o.id, half, left, qSecs: this.qSecs, score: this.score(o, d), start, result: e.result, points, plays, credit, live: true };
    this.story.drives.push(told);
    creditSnaps(o, { ...e, points }, plays, credit.snaps, d, true);
    const log = driveLog(o.id, plays, e, ot, credit.snaps);
    const mop = [o, d].filter((s) => s.mop).map((s) => s.id);
    if (mop.length) log.mop = mop;
    this.opts.drives?.push(log);
    this.watch(plays, snaps);
    return { e, told, log };
  }

  /** A two-point try by `o`, told as its own one-snap drive from the 3. */
  twoPoint(o: ESide, d: ESide, sit: Situation, half: number, left: number): boolean {
    const r = engineTry(o.side, d.side, sit, driveStream(this.rng), {
      brain: d.dcBrain, ocBrain: o.ocBrain, record: this.opts.record, homeId: this.home.id, noDisguise: d.noDisguise,
    });
    this.story.drives.push({
      off: o.id, half, left, qSecs: this.qSecs, score: this.score(o, d), start: 97, result: r.good ? 'TOUCHDOWN' : 'DOWNS', points: r.good ? 2 : 0,
      try: true, plays: [r.play], credit: { snaps: [engineCredit(r.play, r.snap, o.on, d.on)] }, live: true,
    });
    this.watch([r.play], [r.snap]);
    if (r.good) o.tl.points += 2;
    return r.good;
  }

  /** `s`'s kick units: the lineup on the field (its twos in garbage time; the K and P stay). */
  private kickSide(s: ESide) {
    return { team: s.side.team, roster: s.roster };
  }

  /** A player on a kick as the story credits him: his slot, athlete id and name. */
  private credited(s: ESide, p: { slot: string; name: string } | null, yds: number): Credited | undefined {
    if (!p) return undefined;
    const id = s.on[p.slot]?.id;
    return { slot: p.slot, ...(id ? { id } : {}), name: p.name, yds };
  }

  /** Tell a kickoff or a punt, and keep its tape for watching. */
  private tellKick(k: ESide, r: ESide, ek: EngineKick, unit: 'kickoff' | 'punt', play: SimPlay, half: number, left: number): StoryKick {
    const o = ek.outcome;
    const cap = kickCaption(ek, unit, play.yard);
    const good = o.result === 'recovered' || (!ek.recvTd && o.result !== 'blocked' && ek.ret < 25);
    const returner = this.credited(r, ek.returner, ek.ret);
    const recoverer = this.credited(k, ek.recoverer, 0);
    const sk: StoryKick = {
      unit, team: k.id, at: this.story.drives.length, play, half, left, qSecs: this.qSecs, score: this.score(k, r),
      result: o.result, good, title: cap.title, line: cap.line, ret: ek.ret,
      ...(returner ? { returner } : {}), ...(recoverer ? { recoverer } : {}),
    };
    (this.story.kicks ??= []).push(sk);
    this.opts.watch?.set(play, { kick: true, ...(ek.tape ? { tape: ek.tape } : {}) });
    return sk;
  }

  /**
   * `r` ran `k`'s kick back for a touchdown: its six and its try. `p` is the kick's snap in the story, which
   * the game page reads the score off (`Against`, as a pick six's).
   */
  private kickTd(r: ESide, k: ESide, p: SimPlay, sk: StoryKick, half: number, left: number): void {
    r.tl.points += 6;
    sk.pts = { [r.id]: 6 };
    const kick = this.tryAfter(r, k, null, null, half, left);
    this.against.set(p, { pts: 6 + kick, kind: 'returnTd' });
  }

  /**
   * `k` kicks off to `r` from `from` yards: where `r` gets the ball, or `k` keeps it (a muff), or `r`
   * scores. Told as a kick of its own; a return touchdown gets a drive of the kicking team's in the story,
   * holding the kick's snap the game page reads the score off.
   */
  kickoff(k: ESide, r: ESide, from: number, half: number, left: number): EngineKick {
    const ek = engineKickoff(this.kickSide(k), this.kickSide(r), driveStream(this.rng), {
      from, record: this.opts.record, homeId: this.home.id, sit: { lead: k.tl.points - r.tl.points, secsLeft: left, finalHalf: half >= 1 },
    });
    const play: SimPlay = { gain: 0, explosive: false, turnover: ek.kickStart !== null, down: 1, toGo: 0, yard: from, t: 0, lev: 0, punt: true };
    const sk = this.tellKick(k, r, ek, 'kickoff', play, half, left);
    if (ek.recvTd) {
      this.story.drives.push({
        off: k.id, half, left, qSecs: this.qSecs, score: this.score(k, r), start: from, result: 'TURNOVER', points: 0, plays: [play], credit: { snaps: [null] }, live: true,
      });
      this.kickTd(r, k, play, sk, half, Math.max(0, left - ek.secs));
    }
    return ek;
  }

  /** `o` punts to `d` from where its drive (`told`) ended: as `kickoff`, on the punt's snap. */
  punt(o: ESide, d: ESide, e: EngineDrive, told: StoryDrive, half: number, left: number): EngineKick {
    const ek = enginePunt(this.kickSide(o), this.kickSide(d), e.endYard, driveStream(this.rng), {
      record: this.opts.record, homeId: this.home.id, sit: { lead: o.tl.points - d.tl.points, secsLeft: left, finalHalf: half >= 1 },
    });
    const last = told.plays.at(-1);
    const play: SimPlay = last?.punt ? last : { gain: 0, explosive: false, turnover: false, down: 4, toGo: 1, yard: e.endYard, t: e.secs, lev: 0, punt: true };
    if (play !== last) told.plays.push(play);
    const sk = this.tellKick(o, d, ek, 'punt', play, half, left);
    if (ek.recvTd) this.kickTd(d, o, play, sk, half, Math.max(0, left - ek.secs));
    return ek;
  }

  /** Tell an extra point (it's shown as a replay of the kick, by `made`). */
  private tellXp(o: ESide, d: ESide, made: boolean, lev: number, half: number, left: number): void {
    const play: SimPlay = { gain: 0, explosive: false, turnover: false, down: 1, toGo: 3, yard: 97, t: 0, lev, fg: { dist: PAT.dist, made } };
    (this.story.kicks ??= []).push({
      unit: 'xp', team: o.id, at: this.story.drives.length, play, half, left, qSecs: this.qSecs, score: this.score(o, d),
      result: made ? 'xpGood' : 'xpMiss', good: made, title: made ? 'EXTRA POINT' : 'EXTRA POINT NO GOOD', line: made ? 'THE EXTRA POINT IS GOOD' : 'THE EXTRA POINT IS NO GOOD',
      ...(made ? { pts: { [o.id]: 1 } } : {}),
    });
  }

  /**
   * The try after `o`'s regulation touchdown (`told`, already counting six): the two-point chart, or the
   * kick by the kicker's accuracy and confidence. `log` is the drive's log, whose kick it settles.
   * Returns the kick's point (a two-point try is told as its own drive).
   */
  tryAfter(o: ESide, d: ESide, told: StoryDrive | null, log: DriveLog | null, half: number, left: number): number {
    const lead = o.tl.points - d.tl.points;
    const sit: Situation = { down: 1, toGo: 3, yardsToGoal: 3, secsLeft: left, qSecs: this.qSecs, finalHalf: half === 1, lead };
    const xpAt = log ? log.plays.findIndex((p) => p.kick?.unit === 'xp') : -1;
    if (goForTwo(sit)) {
      if (xpAt >= 0) log!.plays.splice(xpAt, 1);
      this.twoPoint(o, d, sit, half, left);
      return 0;
    }
    const late = half === 1 && left <= this.qSecs && lateAndClose(4, lead);
    const lev = leverage(1, 3, late, PAT.dist);
    const made = this.rng() < xpOdds(o.on.K?.r.kac ?? PAT.mid, unitEdge(o.conf.k, lev));
    if (xpAt >= 0) log!.plays[xpAt].kick!.good = made;
    this.tellXp(o, d, made, lev, half, left);
    if (made) {
      o.tl.points += 1;
      if (told) told.points += 1;
    }
    return made ? 1 : 0;
  }

  /** The defense scored on `e` (a pick six: then its try; a safety). */
  defScore(o: ESide, d: ESide, e: EngineDrive, half: number, left: number): void {
    const last = e.result === 'TURNOVER' ? this.story.drives[this.story.drives.length - 1].plays.at(-1) : undefined;
    if (e.defPoints === 7) {
      d.tl.points += 6;
      // The defense's try: with no log of its own (the grades have the snap that scored). Its kick counts
      // on the pick six, as a touchdown drive's does.
      const kick = this.tryAfter(d, o, null, null, half, left);
      if (last) this.against.set(last, { pts: 6 + kick, kind: 'pick6' });
    } else if (e.defPoints === 2) {
      d.tl.points += 2;
      if (last) this.against.set(last, { pts: 2, kind: 'safety' });
    }
  }

  /** Garbage time (`MOPUP`): the leader's twos in when the lead is big enough for the clock left, its starters back when it isn't. */
  garbage(a: ESide, b: ESide, half: number, left: number): void {
    const line = half === 1 ? mopupLine(left / (2 * this.qSecs), this.qSecs) : Infinity;
    for (const [s, o] of [[a, b], [b, a]] as const) {
      const lead = s.tl.points - o.tl.points;
      setTwos(s, s.mop ? lead >= line - MOPUP.back : lead >= line);
    }
  }

  /** Halftime: every brain adjusts. */
  halftime(): void {
    for (const s of [this.home, this.away]) {
      if (s.dcBrain) halftime(s.dcBrain);
      if (s.ocBrain) ocHalftime(s.ocBrain);
    }
  }

  /**
   * Regulation on the clock from `first`'s opening possession (the other team takes the second-half
   * kickoff) until quarter `toQuarter` starts (5: the whole game). A drive still going at the break before
   * `toQuarter` stops there. `kickedBy` is who kicked off for the possession that's next, if anyone did.
   */
  regulation(first: ESide, qMin: number, toQuarter: number): { next: LiveNext; quarter: number; time: number; off: ESide; kickedBy: ESide | null } {
    const clock = newClock(qMin);
    const pace = clamp(1 + gauss(this.rng) * GAME_SIM.paceSd, 0.7, 1.3);
    const other = (s: ESide) => (s === this.home ? this.away : this.home);
    let off = first;
    let start = 25;
    let kickedBy: ESide | null = other(first);
    /** The kickoff's line: the 35, or the 20 for the free kick after a safety. */
    let kickFrom = KICKOFF_FROM;
    let next: LiveNext | null = null;
    const part = toQuarter <= 4;
    /** The half ran out: the final, the hand-off at halftime, or on to the second half's kickoff. True to stop. */
    const halfDone = (): boolean => {
      if (clock.quarter >= 4) {
        next = { kind: 'final' };
        return true;
      }
      if (toQuarter <= 3) {
        next = { kind: 'halftime' };
        return true;
      }
      this.halftime();
      nextQuarter(clock);
      off = other(first);
      start = 25;
      kickedBy = first;
      kickFrom = KICKOFF_FROM;
      return false;
    };
    while (!next) {
      if (clock.quarter >= toQuarter) {
        next = { kind: 'cpu', start }; // the caller reads `off` and `kickedBy`
        break;
      }
      const q = clock.quarter;
      const half = q <= 2 ? 0 : 1;
      if (kickedBy) {
        // The kickoff, played: where the receivers start, a muff the kickers keep, or a return touchdown.
        const k: ESide = kickedBy;
        const ek = this.kickoff(k, off, kickFrom, half, timeLeftInHalf(clock));
        kickedBy = null;
        kickFrom = KICKOFF_FROM;
        const { halfOver } = advanceSim(clock, ek.secs);
        if (ek.recvTd) {
          // The returners kick off back to the kickers.
          kickedBy = off;
          off = k;
          start = 25;
        } else if (ek.kickStart !== null) {
          off = k;
          start = ek.kickStart;
        } else start = ek.recvStart ?? 25;
        if (halfOver && halfDone()) break;
        continue;
      }
      const dfn = other(off);
      const left = timeLeftInHalf(clock);
      const lead = off.tl.points - dfn.tl.points;
      const cut = part && (toQuarter === 2 || toQuarter === 4) && q === toQuarter - 1;
      this.garbage(off, dfn, half, left);
      const dc: DriveClock = {
        timeLeft: cut ? clock.time : left, hurry: false, milk: false, pace, quarterBreak: cut, pastBreak: cut ? left - clock.time : 0, lead, finalHalf: q >= 3, qSecs: clock.qSecs,
      };
      const { e, told, log } = this.drive(off, dfn, start, dc, half, left);
      if (cut && e.result === 'END OF HALF') {
        advanceSim(clock, e.secs);
        next = { kind: 'cpu', start: e.endYard, mid: true };
        kickedBy = null;
        break;
      }
      const { halfOver } = advanceSim(clock, e.secs);
      const leftAfter = timeLeftInHalf(clock);
      // A touchdown that wins the game on its last play needs no try.
      if (e.result === 'TOUCHDOWN' && !(halfOver && clock.quarter >= 4 && off.tl.points > dfn.tl.points)) this.tryAfter(off, dfn, told, log, half, leftAfter);
      if (e.defPoints) this.defScore(off, dfn, e, half, leftAfter);
      if (halfOver) {
        if (halfDone()) break;
        continue;
      }
      if (e.defPoints === 7) {
        // The defense kicks off after its try: the same offense gets the ball back.
        start = 25;
        kickedBy = dfn;
        continue;
      }
      if (e.result === 'PUNT') {
        // The punt, played: the return, a muff the punting team keeps, or a return touchdown.
        const ek = this.punt(off, dfn, e, told, half, leftAfter);
        const after = advanceSim(clock, ek.secs);
        if (ek.recvTd) {
          // The returners kick off to the punting team.
          kickedBy = dfn;
          start = 25;
        } else if (ek.kickStart !== null) start = ek.kickStart;
        else {
          start = ek.recvStart ?? 20;
          off = dfn;
        }
        if (after.halfOver && halfDone()) break;
        continue;
      }
      if (e.result === 'TOUCHDOWN' || e.result === 'FIELD GOAL' || e.defPoints === 2) {
        // The scorers kick off; after a safety, the team that gave it up free-kicks from its 20.
        kickedBy = off;
        kickFrom = e.defPoints === 2 ? SAFETY_KICK_FROM : KICKOFF_FROM;
        start = 25;
        off = dfn;
        continue;
      }
      start = userStartAfter(e, this.rng);
      off = dfn;
    }
    return { next: next!, quarter: clock.quarter, time: clock.time, off, kickedBy };
  }

  /** FBS overtime (`OVERTIME`) until a side leads after a period; `first` has the ball first in odd periods. */
  overtime(first: ESide, second: ESide): number {
    const O = OVERTIME;
    setTwos(first, false);
    setTwos(second, false);
    let period = 0;
    while (first.tl.points === second.tl.points) {
      period++;
      const half = period + 1;
      const order = period % 2 ? [first, second] : [second, first];
      for (let i = 0; i < 2; i++) {
        const [o, d] = [order[i], order[1 - i]];
        const lead = o.tl.points - d.tl.points;
        const otSit: Situation = { down: 1, toGo: 3, yardsToGoal: 3, secsLeft: 0, qSecs: this.qSecs, finalHalf: true, lead, ot: i === 0 ? 'first' : 'second' };
        if (period >= O.shootout) {
          this.twoPoint(o, d, otSit, half, 0);
          continue;
        }
        const clock: DriveClock = { timeLeft: Infinity, hurry: false, milk: false, lead, ot: i === 0 ? 'first' : 'second' };
        const { e, told } = this.drive(o, d, O.start, clock, half, 0, true);
        if (e.defPoints) {
          // A defensive score ends it.
          d.tl.points += e.defPoints === 7 ? 6 : 2;
          const last = told.plays.at(-1);
          if (last) this.against.set(last, { pts: e.defPoints === 7 ? 6 : 2, kind: e.defPoints === 7 ? 'pick6' : 'safety' });
          return period;
        }
        const td = e.result === 'TOUCHDOWN';
        const six = o.tl.points;
        const walkOff = td && i === 1 && six > d.tl.points;
        const kick = td && !walkOff && period < O.mustGoForTwo && !(i === 1 && d.tl.points - six === 2);
        if (kick) {
          this.tellXp(o, d, true, 1, half, 0);
          o.tl.points += 1;
          told.points += 1;
        }
        if (walkOff) return period;
        if (td && !kick) this.twoPoint(o, d, { ...otSit, lead: o.tl.points - d.tl.points }, half, 0);
      }
      if (period >= 8 && first.tl.points === second.tl.points) (this.rng() < 0.5 ? first : second).tl.points += 2;
    }
    return period;
  }

  box() {
    return { home: this.home.tl, away: this.away.tl, players: [...this.home.lines.values(), ...this.away.lines.values()] };
  }
}

/** A whole game through the engine, on 15:00 quarters (or `qMin`). */
export function engineGame(home: EngineTeamIn, away: EngineTeamIn, rng: Rng, opts: EngineGameOpts = {}): GameResult {
  const [h, a] = sides(home, away, rng);
  const story = opts.story ?? newStory(h.id, a.id);
  const qMin = opts.qMin ?? 15;
  const run = new Run(rng, h, a, opts, story, qMin * 60);
  const first = rng() < 0.5 ? h : a;
  run.regulation(first, qMin, 5);
  const ot = h.tl.points === a.tl.points ? run.overtime(a, h) : 0;
  return {
    home: h.tl.points, away: a.tl.points, ot, box: run.box(),
    plays: gamePlays({ ...story, home: h.id, away: a.id }, { [h.id]: h.on, [a.id]: a.on }, run.against),
  };
}

/**
 * The first quarters of a game the user plays, through the engine (as `simPart`): the user receives the
 * opening kickoff, the CPU the second half's, and a drive going at the break before `toQuarter` stops
 * there. The brains the caller passes in (`dcBrain`, `ocBrain`) go on learning into the live game.
 */
export function enginePart(
  user: EngineTeamIn, cpu: EngineTeamIn, userHome: boolean, qMin: number, toQuarter: number, rng: Rng, opts: EngineGameOpts = {},
): PartResult & { against: Against } {
  const [u, c] = sides(user, cpu, rng);
  const story = opts.story ?? (userHome ? newStory(u.id, c.id) : newStory(c.id, u.id));
  const run = new Run(rng, userHome ? u : c, userHome ? c : u, opts, story, qMin * 60);
  const r = run.regulation(u, qMin, toQuarter);
  let next = r.next;
  if (next.kind === 'cpu') {
    // Regulation stopped at the hand-off: whose ball, or the user's kickoff after a user score.
    if (r.off === u) next = { kind: 'user', start: next.start, ...(next.mid ? { mid: true } : {}) };
    else if (r.kickedBy === u && !next.mid) next = { kind: 'userKickoff' };
  }
  return {
    quarter: r.quarter, time: r.time, user: u.tl.points, cpu: c.tl.points, next, box: run.box(),
    story, against: run.against,
  };
}
