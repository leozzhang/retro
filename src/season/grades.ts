import type { Athlete } from '../data/athletes';
import { NO_CONF, unitEdge, type UnitConf } from '../data/confidence';
import { fitRatings, healthOf, healthy, lineupOf, starters, teamConf, teamRatings, withLineup, type Squad, type TeamRatings } from '../data/depth';
import { overall, POS_ROLE, SLOT_POS } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import type { Role } from '../data/teams';
import { pickWeighted, type Rng } from '../engine/math';
import { fgOdds } from '../game/rules';
import { QB_RUN_SHARE, TARGETS } from './simGame';
import type { DriveLog, LoggedPlay, RatingDelta } from './types';

/**
 * Game grades for progression. Every snap a player is on the field earns one grade: his result at his
 * job that snap (a win, 1, or a loss, 0) less the win rate expected for him there. The expectation
 * knows both players and both teams: his overall against the man across from him, and how often this
 * offense succeeds against this defense. So grades measure playing above or below what the matchup
 * predicts, never the matchup itself. Beating a weak opponent is expected and grades about 0; holding a
 * block against an elite rusher is unexpected and grades well. Strong teams and stars earn no more XP
 * per snap than anyone else, so winning doesn't compound. See docs/PROGRESSION.md.
 */

export interface GameGrade {
  team: string;
  /** Snaps from scrimmage, or kicks for K and P. */
  snaps: number;
  /**
   * Playing time, 0..1: his snaps against what a full-time player at his slot plays (the unit's snaps
   * less the slot's `ROTATION` and packages), so a starter on a rotating defensive line counts as full
   * time like a tackle.
   */
  share: number;
  /** Sum of his snap grades. */
  sum: number;
  /** Performance tags: weighted counts per rating they boost at his next level-up. */
  tags: RatingDelta;
  /** Contact he took: carries, catches, tackles made, sacks taken (`HITS`). Injuries read it. */
  hits: number;
  /** Snap grades weighted by `1 + leverage`, and the weights: big moments count more for confidence. */
  lsum: number;
  lw: number;
}

/** The 11-personnel offense and the nickel defense every snap is graded with. */
export const OFF_SLOTS = ['QB', 'RB', 'X', 'Z', 'SL', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'];
export const DEF_SLOTS = ['DE1', 'DE2', 'DT1', 'DT2', 'WLB', 'MLB', 'CB1', 'CB2', 'NB', 'FS', 'SS'];

/** Share of a slot's snaps its backup plays: linemen and backs rotate, quarterbacks and blockers barely. */
export const ROTATION: Record<string, number> = {
  QB: 0.02, RB: 0.3, X: 0.1, Z: 0.1, SL: 0.1, TE: 0.2, LT: 0.03, LG: 0.03, C: 0.03, RG: 0.03, RT: 0.03,
  DE1: 0.3, DE2: 0.3, DT1: 0.3, DT2: 0.3, WLB: 0.15, MLB: 0.15, CB1: 0.1, CB2: 0.1, NB: 0.1, FS: 0.1, SS: 0.1,
};

/**
 * Package players, by the slot they come in for, with their share of its snaps: two backs or two
 * tight ends (21/12 personnel) for the slot receiver, base defense's SAM for the nickel, dime for the MIKE.
 */
export const PACKAGES: Record<string, [string, number][]> = { SL: [['TE2', 0.12], ['FB', 0.08]], NB: [['SAM', 0.2]], MLB: [['DIME', 0.05]] };

/** Extra share of a banged-up starter's snaps his backup takes, per point of health lost (at 70: +15%). */
export const ROTATION_HURT = 0.005;

/** Contact per play, by what he did: carrying, catching (and being tackled), tackling, being sacked, sacking. */
export const HITS = { carry: 1, catch: 0.8, tackle: 0.6, sacked: 1.5, sack: 0.3 };

/** The man across from each slot, for the rating gap. */
const MATCHUP: Record<string, string> = {
  LT: 'DE1', LG: 'DT1', C: 'DT1', RG: 'DT2', RT: 'DE2', DE1: 'LT', DT1: 'LG', DT2: 'RG', DE2: 'RT',
  X: 'CB1', Z: 'CB2', SL: 'NB', TE: 'SS', RB: 'WLB', QB: 'FS', CB1: 'X', CB2: 'Z', NB: 'SL', SS: 'TE', FS: 'QB', WLB: 'RB', MLB: 'RB',
};

/** One-on-one reps: one result per snap, a win for one side being a loss for the other. */
const PAIRS: [string, string][] = [['LT', 'DE1'], ['LG', 'DT1'], ['RG', 'DT2'], ['RT', 'DE2'], ['X', 'CB1'], ['Z', 'CB2'], ['SL', 'NB'], ['TE', 'SS'], ['RB', 'WLB']];

/** Who makes the tackle on a run, by slot. */
const TACKLERS: [string, number][] = [
  ['MLB', 3], ['WLB', 2.5], ['SS', 2], ['NB', 1], ['FS', 1], ['DE1', 1], ['DE2', 1], ['DT1', 1], ['DT2', 1], ['CB1', 0.7], ['CB2', 0.7],
];

/**
 * Grade tuning.
 * - `gapK`: logit per overall point over the man across from him.
 * - `play`: logit a successful snap adds for everyone on the offense and takes from the defense.
 * - `key`: the same for the players the snap went through (passer, target and his cover man, ball
 *   carrier and tackler), whose grade follows the result more closely.
 * - `successBase`, `successPerPoint`: the drive sim's success rate by offense-minus-defense team rating,
 *   `sigmoid(base + perPoint·gap)`, fit on simulated games between real rosters (game script included).
 *   It's the expected result a snap is graded against.
 * - `sackShare`: share of lost-yardage passes in the drive sim that are sacks.
 * - `contested`: share of catches made with a defender on him.
 */
export const GRADES = { gapK: 0.04, play: 0.6, key: 1.4, successBase: 0.254, successPerPoint: 0.0365, sackShare: 0.35, contested: 0.3 };

/** Tag weights: rare plays boost their rating far more than an ordinary won rep. */
export const TAG = { win: 0.2, short: 0.5, medium: 1, deep: 3, catch: 0.5, contested: 3, broken: 2, sack: 3, int: 4, pbu: 2, stop: 1.5, fg: 1.5, longFg: 3, kick: 0.5 };
/** Field goals from here on count as long (`kpw`). */
const LONG_FG = 45;

type Tags = readonly (readonly [RatingKey, number])[];

/** What an ordinary won rep shows, by role and play type. */
const WIN_TAGS: Record<Role, { pass: RatingKey[]; run: RatingKey[] }> = {
  QB: { pass: [], run: [] },
  RB: { pass: ['pbk'], run: ['rbk'] },
  WR: { pass: ['rte'], run: ['rbk'] },
  TE: { pass: ['rte', 'pbk'], run: ['rbk'] },
  OL: { pass: ['pbk'], run: ['rbk'] },
  DL: { pass: ['rsh'], run: ['bsh'] },
  LB: { pass: ['mcv', 'zcv'], run: ['tkl', 'prc'] },
  CB: { pass: ['mcv'], run: ['tkl'] },
  S: { pass: ['zcv'], run: ['tkl'] },
  K: { pass: [], run: [] },
  P: { pass: [], run: [] },
};
const ROLE_TAGS = {} as Record<Role, { pass: Tags; run: Tags }>;
for (const [r, t] of Object.entries(WIN_TAGS) as [Role, { pass: RatingKey[]; run: RatingKey[] }][]) {
  ROLE_TAGS[r] = { pass: t.pass.map((k) => [k, TAG.win] as const), run: t.run.map((k) => [k, TAG.win] as const) };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** How often an offense succeeds against a defense, by offense rating minus defense rating. */
export function expectedSuccess(gap: number): number {
  return sigmoid(GRADES.successBase + GRADES.successPerPoint * gap);
}

/**
 * The win rate expected for a player: `gap` is his overall over the man across from him, `sign` +1
 * on offense and -1 on defense, `q` how closely his result follows the play's, `pSucc` the expected
 * success rate of this offense against this defense. His grade on a snap is his result less this.
 */
export function expectedWin(gap: number, sign: number, q: number, pSucc: number): number {
  const base = GRADES.gapK * gap;
  return pSucc * sigmoid(base + sign * q) + (1 - pSucc) * sigmoid(base - sign * q);
}

/** Successful snap: 40% of the distance on first down, 60% on second, all of it on third and fourth. */
export function successful(p: LoggedPlay): boolean {
  if (p.turnover || p.int || p.sack) return false;
  const need = p.down === 1 ? 0.4 * p.toGo : p.down === 2 ? 0.6 * p.toGo : p.toGo;
  return p.gain >= need;
}

type Unit = 'off' | 'def' | 'k' | 'p';

/** A player in a slot, with his grade for this game. */
interface Man {
  a: Athlete;
  ovr: number;
  g: GameGrade;
  /** His unit, and the share of its snaps a full-time player at his slot plays. */
  unit: Unit;
  full: number;
}

/** A slot: its starter, and who comes in for him (package subs, the rotation backup) with their shares. */
interface Seat {
  starter: Man;
  subs: [Man, number][];
  /** The slot's backup, who has the snaps in garbage time (`DriveLog.mop`). */
  backup?: Man;
}

interface Cast {
  team: string;
  /** Seats in `OFF_SLOTS` and `DEF_SLOTS` order; an empty slot is null. */
  off: (Seat | null)[];
  def: (Seat | null)[];
  k?: Man;
  p?: Man;
  passShare: number;
  qbRun: number;
  /** This team's offense rating minus the other team's defense, home edge included. */
  gap: number;
  /** Each unit's confidence (`teamConf`): it moves the expected success rate on a snap by its leverage. */
  conf: UnitConf;
  men: Man[];
  totals: Record<Unit, number>;
}

function cast(squad: Squad, passShare: number): Cast {
  const st = starters(squad);
  const byId = new Map(squad.athletes.map((a) => [a.id, a]));
  const used = new Set(Object.values(st).map((a) => a.id));
  const team = squad.team.id;
  const men: Man[] = [];
  const man = (a: Athlete, slot: string, unit: Unit, full: number): Man => {
    const m: Man = { a, ovr: overall(fitRatings(a), SLOT_POS[slot]), g: { team, snaps: 0, share: 0, sum: 0, tags: {}, hits: 0, lsum: 0, lw: 0 }, unit, full };
    men.push(m);
    return m;
  };
  const seat = (slot: string, unit: Unit): Seat | null => {
    const a = st[slot];
    if (!a) return null;
    const subs: [Man, number][] = [];
    for (const [ps, share] of PACKAGES[slot] ?? []) if (st[ps]) subs.push([man(st[ps], ps, unit, 1), share]);
    const pkg = subs.reduce((x, [, sh]) => x + sh, 0);
    const rot = Math.min(0.5, (ROTATION[slot] ?? 0) + (100 - healthOf(a)) * ROTATION_HURT);
    // The backup is the next healthy man on the slot's list who isn't starting or backing up elsewhere.
    const bid = (squad.depth[slot] ?? []).find((id) => !used.has(id) && byId.get(id) && healthy(byId.get(id)!));
    let backup: Man | undefined;
    if (bid) {
      used.add(bid);
      backup = man(byId.get(bid)!, slot, unit, 1 - rot - pkg);
      subs.push([backup, rot]);
    }
    return { starter: man(a, slot, unit, 1 - rot - pkg), subs, ...(backup ? { backup } : {}) };
  };
  return {
    team, passShare, men, gap: 0, conf: NO_CONF,
    off: OFF_SLOTS.map((s) => seat(s, 'off')),
    def: DEF_SLOTS.map((s) => seat(s, 'def')),
    k: st.K ? man(st.K, 'K', 'k', 1) : undefined,
    p: st.P ? man(st.P, 'P', 'p', 1) : undefined,
    qbRun: QB_RUN_SHARE[squad.team.profile.offense.qbStyle] ?? 0.1,
    totals: { off: 0, def: 0, k: 0, p: 0 },
  };
}

function credit(m: Man, win: boolean, expected: number, tags: Tags, lev: number): void {
  const g = m.g;
  const x = (win ? 1 : 0) - expected;
  g.snaps++;
  g.sum += x;
  g.lsum += x * (1 + lev);
  g.lw += 1 + lev;
  if (!win) return;
  for (const [k, v] of tags) g.tags[k] = (g.tags[k] ?? 0) + v;
}

/** Who's on the field this snap, into `out`: each seat's starter, or a sub on his share of snaps. */
function fill(out: (Man | null)[], seats: (Seat | null)[], rng: Rng, twos = false): void {
  for (let i = 0; i < seats.length; i++) {
    const s = seats[i];
    if (!s) {
      out[i] = null;
      continue;
    }
    let m = s.starter;
    let x = rng();
    for (const [sub, share] of s.subs) {
      if (x < share) {
        m = sub;
        break;
      }
      x -= share;
    }
    // Garbage time: the twos have it (the draw is still made, so other snaps grade as before).
    out[i] = twos && s.backup ? s.backup : m;
  }
}

const OFF_INDEX = new Map(OFF_SLOTS.map((s, i) => [s, i]));
const DEF_INDEX = new Map(DEF_SLOTS.map((s, i) => [s, i]));
/** The man across from each offensive slot (a defensive index), and from each defensive slot. */
const VS_OFF = OFF_SLOTS.map((s) => DEF_INDEX.get(MATCHUP[s])!);
const VS_DEF = DEF_SLOTS.map((s) => OFF_INDEX.get(MATCHUP[s])!);
/** Each offensive slot's one-on-one partner (a defensive index), or -1. */
const PAIR_OFF = OFF_SLOTS.map((s) => DEF_INDEX.get(PAIRS.find(([o]) => o === s)?.[1] ?? '') ?? -1);
const QB = OFF_INDEX.get('QB')!;
const RB = OFF_INDEX.get('RB')!;
const FS = DEF_INDEX.get('FS')!;
const OL = ['LT', 'LG', 'C', 'RG', 'RT'].map((s) => OFF_INDEX.get(s)!);
const TARGET_IDX = Object.entries(TARGETS).map(([s, w]) => [OFF_INDEX.get(s)!, w] as const);
const TACKLER_IDX = TACKLERS.map(([s, w]) => [DEF_INDEX.get(s)!, w] as const);

/** One player's result on a snap: won or not, the expected win rate, and what a win tags. */
interface Rep {
  win: boolean;
  expected: number;
  tags: Tags;
}

const mirror = (r: Rep, tags: Tags): Rep => ({ win: !r.win, expected: 1 - r.expected, tags });

// Scratch arrays for one snap.
const O: (Man | null)[] = new Array(OFF_SLOTS.length).fill(null);
const D: (Man | null)[] = new Array(DEF_SLOTS.length).fill(null);
const RO: (Rep | null)[] = new Array(OFF_SLOTS.length).fill(null);
const RD: (Rep | null)[] = new Array(DEF_SLOTS.length).fill(null);

function snap(p: LoggedPlay, off: Cast, def: Cast, rng: Rng, mop?: string[]): void {
  const pass = p.pass ?? rng() < off.passShare;
  const s = successful(p) ? 1 : -1;
  const lev = p.lev ?? 0;
  // The weekly emphases' edge is expected too, so an emphasis steers XP only through practice (season/emphasis.ts).
  const pSucc = expectedSuccess(off.gap + unitEdge(off.conf.off - def.conf.def, lev) + (p.em ?? 0));
  fill(O, off.off, rng, !!mop?.includes(off.team));
  fill(D, def.def, rng, !!mop?.includes(def.team));
  RO.fill(null);
  RD.fill(null);
  off.totals.off++;
  def.totals.def++;
  const gapO = (i: number) => (D[VS_OFF[i]] ? O[i]!.ovr - D[VS_OFF[i]]!.ovr : 0);
  const gapD = (j: number) => (O[VS_DEF[j]] ? D[j]!.ovr - O[VS_DEF[j]]!.ovr : 0);
  /** A rep drawn for a player with rating gap `gap` on side `sign`, against what the matchup expects. */
  const draw = (gap: number, sign: number, q: number, tags: Tags): Rep => ({
    win: rng() < sigmoid(GRADES.gapK * gap + sign * q * s),
    expected: expectedWin(gap, sign, q, pSucc),
    tags,
  });
  const kind = pass ? 'pass' : 'run';
  const roleTags = (m: Man) => ROLE_TAGS[POS_ROLE[m.a.pos]][kind];

  const sack = pass && (p.sack ?? (s < 0 && p.gain < 0 && rng() < GRADES.sackShare));
  if (pass) {
    const int = p.int ?? p.turnover === true;
    if (O[QB]) {
      const depth = (p.gain >= 20 ? ['dac', TAG.deep] : p.gain >= 10 ? ['mac', TAG.medium] : ['sac', TAG.short]) as [RatingKey, number];
      RO[QB] = draw(gapO(QB), 1, GRADES.key, s > 0 && !sack ? [depth] : []);
      if (int) RO[QB].win = false;
      if (sack) O[QB].g.hits += HITS.sacked;
    }
    const targets = sack ? [] : TARGET_IDX.filter(([i]) => O[i]).map(([i, w]) => [i, w * (O[i]!.ovr / 75) ** 2] as const);
    if (targets.length) {
      const t = pickWeighted(targets, rng);
      const tags: [RatingKey, number][] = [['cth', TAG.catch], ['rte', TAG.catch]];
      const rep = draw(gapO(t), 1, GRADES.key, tags);
      if (int) rep.win = false;
      if (rep.win && rng() < GRADES.contested) tags.push(['cit', TAG.contested]);
      RO[t] = rep;
      // A catch gets him tackled, usually by his cover man.
      if (rep.win) {
        O[t]!.g.hits += HITS.catch;
        const cm = D[VS_OFF[t]];
        if (cm) cm.g.hits += HITS.tackle;
      }
      // His cover man wins when the ball isn't caught, and deep balls are the free safety's half the time.
      const covers = [VS_OFF[t], ...(p.gain >= 20 && D[FS] && rng() < 0.5 ? [FS] : [])];
      for (const c of covers) {
        const cm = D[c];
        if (!cm || RD[c]) continue;
        const role = POS_ROLE[cm.a.pos];
        const key: RatingKey = role === 'S' || role === 'LB' ? 'zcv' : 'mcv';
        RD[c] = mirror(rep, int ? [['cth', TAG.int], [key, TAG.pbu]] : [[key, TAG.pbu]]);
      }
    }
  } else {
    const carrier = O[QB] && rng() < off.qbRun ? QB : RB;
    if (O[carrier]) {
      const tags: [RatingKey, number][] = [];
      if (s > 0 && p.gain >= 8 && rng() < 0.5) {
        tags.push(['elu', TAG.broken]);
        if (rng() < 0.5) tags.push(['str', TAG.broken]);
      }
      RO[carrier] = draw(gapO(carrier), 1, GRADES.key, tags);
      O[carrier]!.g.hits += HITS.carry;
    }
    const tacklers = TACKLER_IDX.filter(([j]) => D[j]);
    if (tacklers.length) {
      const t = pickWeighted(tacklers, rng);
      // The tackler is graded against the ball carrier.
      const gap = D[t]!.ovr - (O[carrier]?.ovr ?? D[t]!.ovr);
      if (!RD[t]) RD[t] = draw(gap, -1, GRADES.key, [['tkl', TAG.stop]]);
      D[t]!.g.hits += HITS.tackle;
    }
  }

  // One-on-one reps: one draw, the other side's result is its mirror.
  for (let i = 0; i < O.length; i++) {
    const j = PAIR_OFF[i];
    if (j < 0 || !O[i] || !D[j]) continue;
    if (RO[i] && !RD[j]) RD[j] = mirror(RO[i]!, roleTags(D[j]!));
    else if (RD[j] && !RO[i]) RO[i] = mirror(RD[j]!, roleTags(O[i]!));
    else if (!RO[i] && !RD[j]) {
      RO[i] = draw(gapO(i), 1, GRADES.play, roleTags(O[i]!));
      RD[j] = mirror(RO[i]!, roleTags(D[j]!));
    }
  }
  for (let i = 0; i < O.length; i++) if (O[i] && !RO[i]) RO[i] = draw(gapO(i), 1, GRADES.play, roleTags(O[i]!));
  for (let j = 0; j < D.length; j++) if (D[j] && !RD[j]) RD[j] = draw(gapD(j), -1, GRADES.play, roleTags(D[j]!));
  // A sack goes to a rusher who beat his man.
  if (sack) {
    const beaten = OL.filter((i) => RO[i] && !RO[i]!.win && PAIR_OFF[i] >= 0 && D[PAIR_OFF[i]]);
    if (beaten.length) {
      const j = PAIR_OFF[beaten[Math.floor(rng() * beaten.length)]];
      const rusher = RD[j]!;
      rusher.tags = [...rusher.tags, ['rsh', TAG.sack]];
      D[j]!.g.hits += HITS.sack;
    }
  }
  for (let i = 0; i < O.length; i++) if (O[i]) credit(O[i]!, RO[i]!.win, RO[i]!.expected, RO[i]!.tags, lev);
  for (let j = 0; j < D.length; j++) if (D[j]) credit(D[j]!, RD[j]!.win, RD[j]!.expected, RD[j]!.tags, lev);
}

/**
 * A kick: graded against the expectation (the drive sim's FG odds by distance with the kicker's
 * confidence at that kick's leverage and any emphasis edge, or the matchup with the other team's kicker).
 */
function kick(p: LoggedPlay, off: Cast, def: Cast, rng: Rng): void {
  const k = p.kick!;
  const punt = k.unit === 'punt';
  const m = punt ? off.p : off.k;
  if (!m) return;
  const lev = p.lev ?? 0;
  off.totals[punt ? 'p' : 'k']++;
  if (k.unit === 'fg' || k.unit === 'xp') {
    const dist = k.dist ?? 20;
    const tags: [RatingKey, number][] = k.unit === 'fg' ? [['kac', TAG.fg]] : [['kac', TAG.kick]];
    if (k.unit === 'fg' && dist >= LONG_FG) tags.push(['kpw', TAG.longFg]);
    credit(m, k.good, k.unit === 'xp' ? 0.97 : fgOdds(dist, unitEdge(off.conf.k, lev) + (p.em ?? 0)), tags, lev);
    return;
  }
  const vs = punt ? def.p : def.k;
  const odds = sigmoid(GRADES.gapK * (m.ovr - (vs?.ovr ?? m.ovr)));
  credit(m, rng() < odds, odds, [['kpw', TAG.kick], ['kac', TAG.kick]], lev);
}

/**
 * Grade one game from its drive logs. `passShare` is each team's game plan, for drives that don't say
 * whether a snap was a pass; `homeEdge` is the overall points the home side plays with (0 on a neutral
 * field), as the game sim gives it. Uses its own random stream, so grading never changes a score.
 */
export function gradeGame(
  home: Squad, away: Squad, drives: DriveLog[], passShare: Record<string, number>, rng: Rng, homeEdge = 0,
): Map<string, GameGrade> {
  // Each team's cast for its depth chart, and one per lineup the user played with (`DriveLog.subs`), made as needed.
  const sides = new Map<string, Side>();
  for (const [squad, isHome] of [[home, true], [away, false]] as const) {
    const c = cast(squad, passShare[squad.team.id] ?? 0.5);
    c.conf = teamConf(squad);
    const side: Side = { squad, home: isHome, r: teamRatings(squad), base: c, casts: new Map([['', c]]), rOf: new Map() };
    side.rOf.set(c, side.r);
    sides.set(squad.team.id, side);
  }
  const castOf = (side: Side, diff: Record<string, string> | undefined): Cast => {
    const key = diff && Object.keys(diff).length ? JSON.stringify(Object.entries(diff).sort()) : '';
    let c = side.casts.get(key);
    if (!c) {
      // The starters the user benched go to the bottom of every list: they don't rotate back in as backups.
      const chart = lineupOf(side.squad);
      const laid = withLineup(side.squad, { ...chart, ...diff });
      const benched = new Set(Object.values(chart).filter((id) => !Object.values({ ...chart, ...diff }).includes(id)));
      const depth = Object.fromEntries(Object.entries(laid.depth).map(([slot, ids]) => [slot, [...ids.filter((id) => !benched.has(id)), ...ids.filter((id) => benched.has(id))]]));
      const sq = { ...laid, depth };
      c = cast(sq, side.base.passShare);
      c.conf = teamConf(sq);
      side.rOf.set(c, teamRatings(sq));
      side.casts.set(key, c);
    }
    return c;
  };
  /** The lineup a team plays play `i` of a drive with. */
  const lineupAt = (dr: DriveLog, team: string, i: number) => dr.subs?.filter((x) => x.team === team && x.from <= i).pop()?.lineup;
  for (const dr of drives) {
    const offSide = sides.get(dr.off);
    if (!offSide) continue;
    const defSide = [...sides.values()].find((x) => x !== offSide)!;
    dr.plays.forEach((p, i) => {
      const off = dr.subs ? castOf(offSide, lineupAt(dr, offSide.squad.team.id, i)) : offSide.base;
      const def = dr.subs ? castOf(defSide, lineupAt(dr, defSide.squad.team.id, i)) : defSide.base;
      const or = offSide.rOf.get(off)!;
      const dr2 = defSide.rOf.get(def)!;
      // This offense's rating minus that defense's, home edge included.
      off.gap = offSide.home ? or.off + homeEdge - dr2.def : or.off - dr2.def - homeEdge;
      if (p.kick) kick(p, off, def, rng);
      else snap(p, off, def, rng, dr.mop);
    });
  }
  // Playing time: of a full-time player's snaps at his slot, or of the team's kicks.
  const out = new Map<string, GameGrade>();
  for (const side of sides.values()) {
    const casts = [...side.casts.values()];
    if (casts.length === 1) {
      const c = casts[0];
      for (const m of c.men) {
        if (!m.g.snaps) continue;
        const n = c.totals[m.unit] * m.full;
        m.g.share = n ? Math.min(1, m.g.snaps / n) : 0;
        out.set(m.a.id, m.g);
      }
      continue;
    }
    // Played under more than one lineup: one grade a player, his share of all the team's snaps at his slot.
    const byCast = casts.map((c) => new Map(c.men.map((m) => [m.a.id, m] as const)));
    const ids = new Set(casts.flatMap((c) => c.men.filter((m) => m.g.snaps).map((m) => m.a.id)));
    for (const id of ids) {
      const mine = byCast.map((b) => b.get(id));
      const any = mine.find((m) => m)!;
      const full = Math.max(...mine.map((m) => m?.full ?? 0));
      const g: GameGrade = { team: any.g.team, snaps: 0, share: 0, sum: 0, tags: {}, hits: 0, lsum: 0, lw: 0 };
      let n = 0;
      casts.forEach((c, i) => {
        const m = mine[i];
        n += c.totals[any.unit] * (m?.full ?? full);
        if (!m) return;
        g.snaps += m.g.snaps;
        g.sum += m.g.sum;
        g.hits += m.g.hits;
        g.lsum += m.g.lsum;
        g.lw += m.g.lw;
        for (const [k, v] of Object.entries(m.g.tags) as [RatingKey, number][]) g.tags[k] = (g.tags[k] ?? 0) + v;
      });
      g.share = n ? Math.min(1, g.snaps / n) : 0;
      out.set(id, g);
    }
  }
  return out;
}

/** One team in a graded game: its casts by lineup (`''` is its depth chart's) and each cast's team ratings. */
interface Side {
  squad: Squad;
  home: boolean;
  r: TeamRatings;
  base: Cast;
  casts: Map<string, Cast>;
  rOf: Map<Cast, TeamRatings>;
}
