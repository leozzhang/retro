import type { Athlete, ClassYear } from '../data/athletes';
import { healthy, positionOrders, starters, type Squad } from '../data/depth';
import { overall } from '../data/positions';
import { BOWL_WINS } from '../data/season/postseason';
import { clamp, gauss, hashString, mulberry32, type Rng } from '../engine/math';
import { newStarters, START_SLOTS } from './confidence';
import { latestPoll, rankIn } from './polls';
import type { Progress, SeasonGame, SeasonState, TeamState } from './types';

/**
 * Morale: how a player feels about his situation, -1 miserable .. +1 fired up. Confidence is how he
 * feels about his own play and moves fast; morale moves slowly toward a target set by his role
 * against what he expected, his team's results, the coach's decisions about him and the locker room,
 * each weighed by a hidden temperament. It never reads game grades, so the two don't track each other.
 * Its effect for now is practice effort: the XP multiplier's morale factor. See docs/MORALE.md.
 */

/**
 * Tuning.
 * - `rate`: how far one team game moves morale toward its target (an EMA); `noise`: SD of a weekly nudge.
 * - `baseMean`/`baseSd`: the spread of temperaments' baselines (clamped to +/-0.3).
 * - Expectations: `classExpect` and, for underclassmen, `starsExpect` set what he feels entitled to (a
 *   walk-on, 1 star, expects `walkOn` of it); `slack` caps that at the role his talent would earn plus
 *   this much; a backup within `close` overall of the weakest starter at his position expects `closeExpect`.
 * - Roles: 1 starting, `package` in a sub package (FB, TE2, WR4, SAM, DIME), then `backups` by rank.
 * - `roleW` per point of role short of expectation (times pride); a role above it lifts by up to `roleUp`.
 * - `teamW` times team mood (times his team trait). Team mood: `formW` on the last four games
 *   (`formWeights`, newest first), `rankW` for an AP rank, `streakW` per straight loss past two (down to
 *   `streakCap`), and fading bumps for rivalry games, bowl eligibility, bowl and playoff games (`events`),
 *   each keeping `eventFade` of itself per game since.
 * - Coach decisions: losing the job costs `benchHit` (times pride), winning it lifts `jobLift`; either
 *   keeps `decisionFade` of itself each team game.
 * - `roomW` times the voice-weighted morale of his teammates. Voice is his leadership times `classVoice`,
 *   halved off the field (`benchVoice`).
 * - `offseason`: share of his distance from his baseline carried into next season.
 */
export const MORALE = {
  rate: 0.15,
  noise: 0.04,
  baseMean: 0.05,
  baseSd: 0.15,
  classExpect: { FR: 0.15, SO: 0.4, JR: 0.7, SR: 0.9 } as Record<ClassYear, number>,
  starsExpect: [0, 0, 0, 0.2, 0.45, 0.7],
  walkOn: 0.5,
  slack: 0.25,
  close: 2,
  closeExpect: 0.8,
  package: 0.7,
  backups: [0.5, 0.25],
  roleW: 1.4,
  roleUp: 0.1,
  teamW: 0.2,
  formW: 0.5,
  formWeights: [0.4, 0.3, 0.2, 0.1],
  rankW: 0.3,
  streakW: 0.1,
  streakCap: 0.2,
  events: { rivalryWin: 0.4, rivalryLoss: -0.3, bowlEligible: 0.25, postseasonWin: 0.4, playoff: 0.2 },
  eventFade: 0.6,
  benchHit: 0.5,
  jobLift: 0.2,
  decisionFade: 0.75,
  roomW: 0.15,
  classVoice: { FR: 0.2, SO: 0.4, JR: 0.7, SR: 1 } as Record<ClassYear, number>,
  benchVoice: 0.5,
  offseason: 0.5,
};

/**
 * His hidden temperament, fixed for his career and drawn from his id (never stored):
 * - `base`: the mood he drifts back to.
 * - `pride`: how personally he takes his role and the coach's decisions.
 * - `team`: how much the team's results move him; loosely the opposite of pride.
 * - `lead`: how much the locker room listens to him, before class and role.
 */
export interface Temperament {
  base: number;
  pride: number;
  team: number;
  lead: number;
}

export function temperament(a: Pick<Athlete, 'id'>): Temperament {
  const hit = temperaments.get(a.id);
  if (hit) return hit;
  const rng = mulberry32(hashString(`morale:${a.id}`));
  const base = clamp(MORALE.baseMean + MORALE.baseSd * gauss(rng), -0.3, 0.3);
  const pride = clamp(1 + 0.3 * gauss(rng), 0.5, 1.5);
  const team = clamp(1 + 0.3 * gauss(rng) - 0.5 * (pride - 1), 0.5, 1.5);
  const t = { base, pride, team, lead: rng() };
  temperaments.set(a.id, t);
  return t;
}

/** Temperaments by athlete id: they never change, so each is drawn once. */
const temperaments = new Map<string, Temperament>();

export type TemperamentLabel = 'LEADER' | 'MOODY' | 'PROUD' | 'LOYAL' | 'MELLOW';

/**
 * The one word the card shows for his temperament, whatever stands out most: a voice in the room
 * (LEADER), a low baseline (MOODY), pride (PROUD), the team first (LOYAL), or nothing much (MELLOW).
 */
export function temperamentLabel(a: Pick<Athlete, 'id' | 'year'>): TemperamentLabel {
  const t = temperament(a);
  if (t.lead >= 0.8 && (a.year === 'JR' || a.year === 'SR')) return 'LEADER';
  if (t.base <= -0.1) return 'MOODY';
  if (t.pride >= 1.3) return 'PROUD';
  if (t.team >= 1.3) return 'LOYAL';
  return 'MELLOW';
}

/** His morale now: what's stored, or his baseline before his team has played. */
export function moraleOf(ts: TeamState | undefined, a: Pick<Athlete, 'id'>): number {
  return ts?.mo?.[a.id] ?? temperament(a).base;
}

export function moodLabel(m: number): string {
  return m <= -0.5 ? 'MISERABLE' : m <= -0.2 ? 'FRUSTRATED' : m < 0.2 ? 'CONTENT' : m < 0.5 ? 'HAPPY' : 'FIRED UP';
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** The slots that are packages, not the base 11-personnel offense or nickel defense. */
const PACKAGE_SLOTS = ['FB', 'TE2', 'WR4', 'SAM', 'DIME'];

/** A team's games played this season, in order. */
function gamesOf(state: SeasonState, team: string): SeasonGame[] {
  return state.games.filter((g) => g.result && (g.home === team || g.away === team)).sort((a, b) => a.week - b.week);
}

const won = (g: SeasonGame, team: string) => (g.home === team ? g.result!.home > g.result!.away : g.result!.away > g.result!.home);

export type TeamMoodPart = 'form' | 'rank' | 'streak' | 'rivalryWin' | 'rivalryLoss' | 'bowlEligible' | 'postseasonWin' | 'playoff';

/**
 * How the team's season feels, -1..1: recent form, an AP rank, a losing streak, and fading bumps for
 * rivalry games, reaching bowl eligibility, postseason wins and making the playoff. Computed from the
 * results, never stored. `parts` keeps each piece, for the reason the card shows.
 */
export function teamMood(state: SeasonState, team: string): { value: number; parts: Partial<Record<TeamMoodPart, number>> } {
  const games = gamesOf(state, team);
  const parts: Partial<Record<TeamMoodPart, number>> = {};
  const recent = games.slice(-MORALE.formWeights.length).reverse();
  if (recent.length) {
    let sum = 0;
    let w = 0;
    recent.forEach((g, i) => {
      sum += MORALE.formWeights[i] * (won(g, team) ? 1 : -1);
      w += MORALE.formWeights[i];
    });
    parts.form = (MORALE.formW * sum) / w;
  }
  const rank = rankIn(latestPoll(state, 'ap'), team);
  if (rank) parts.rank = (MORALE.rankW * (26 - rank)) / 25;
  let streak = 0;
  for (let i = games.length - 1; i >= 0 && !won(games[i], team); i--) streak++;
  if (streak > 2) parts.streak = -Math.min(MORALE.streakCap, MORALE.streakW * (streak - 2));
  // Bumps fade by games since. Bowl eligibility lands on the win that reached it.
  let wins = 0;
  const bump = (k: TeamMoodPart, x: number, since: number) => {
    parts[k] = (parts[k] ?? 0) + x * MORALE.eventFade ** since;
  };
  games.forEach((g, i) => {
    const since = games.length - 1 - i;
    const w = won(g, team);
    const post = g.kind === 'bowl' || g.kind === 'cfp';
    if (g.name && !post && g.kind !== 'champ') bump(w ? 'rivalryWin' : 'rivalryLoss', w ? MORALE.events.rivalryWin : MORALE.events.rivalryLoss, since);
    if (w && !post && ++wins === BOWL_WINS) bump('bowlEligible', MORALE.events.bowlEligible, since);
    if (g.kind === 'cfp' && !games.slice(0, i).some((x) => x.kind === 'cfp')) bump('playoff', MORALE.events.playoff, since);
    if (w && post) bump('postseasonWin', MORALE.events.postseasonWin, since);
  });
  const value = clamp(Object.values(parts).reduce((a, b) => a + (b ?? 0), 0), -1, 1);
  return { value, parts };
}

/** What one team shares for every player's drivers: its starters, position groups, team mood and locker room. */
export interface MoraleContext {
  ts: TeamState | undefined;
  /** Starters by athlete id, and the slot each one fills. */
  slotOf: Map<string, string>;
  /** Healthy players' overalls, and each healthy backup's rank among his position's backups. */
  ovr: Map<string, number>;
  backupRank: Map<string, number>;
  /** Each position's healthy players' overalls, and the roles the group has this week, best first. */
  groups: Map<string, { ovrs: number[]; roles: number[]; weakestStarter: number }>;
  mood: ReturnType<typeof teamMood>;
  /** The locker room's voice-weighted morale sums, to take one player out of. */
  room: { w: number; m: number };
}

/** His voice in the locker room: leadership, class, and whether he's on the field. */
export function voice(a: Athlete, starting: boolean): number {
  return temperament(a).lead * MORALE.classVoice[a.year] * (starting ? 1 : MORALE.benchVoice);
}

/** A role's value by where he stands: starting, in a package, or a backup by rank. */
function roleAt(slot: string | undefined, backupRank: number): number {
  if (slot) return PACKAGE_SLOTS.includes(slot) ? MORALE.package : 1;
  return MORALE.backups[backupRank] ?? 0;
}

export function moraleContext(state: SeasonState, squad: Squad): MoraleContext {
  const ts = state.teamState[squad.team.id];
  const slotOf = new Map(Object.entries(starters(squad)).map(([slot, a]) => [a.id, slot]));
  const ovr = new Map<string, number>();
  const backupRank = new Map<string, number>();
  const groups: MoraleContext['groups'] = new Map();
  for (const [pos, all] of positionOrders(squad)) {
    const order = all.filter(healthy);
    const ovrs: number[] = [];
    const roles: number[] = [];
    let weakestStarter = Infinity;
    let backups = 0;
    for (const b of order) {
      const o = overall(b.r, b.pos);
      const slot = slotOf.get(b.id);
      ovr.set(b.id, o);
      ovrs.push(o);
      if (!slot) backupRank.set(b.id, backups++);
      roles.push(roleAt(slot, backupRank.get(b.id) ?? 0));
      if (slot && START_SLOTS.includes(slot)) weakestStarter = Math.min(weakestStarter, o);
    }
    groups.set(pos, { ovrs, roles: roles.sort((x, y) => y - x), weakestStarter });
  }
  const room = { w: 0, m: 0 };
  for (const a of squad.athletes) {
    const v = voice(a, slotOf.has(a.id));
    room.w += v;
    room.m += v * moraleOf(ts, a);
  }
  return { ts, slotOf, ovr, backupRank, groups, mood: teamMood(state, squad.team.id), room };
}

/** His role this week, 0 (buried) .. 1 (starting). Null while he's hurt: he isn't judging it. */
export function actualRole(ctx: MoraleContext, a: Athlete): number | null {
  if (!healthy(a)) return null;
  const slot = ctx.slotOf.get(a.id);
  return roleAt(slot, slot ? 0 : ctx.backupRank.get(a.id) ?? Infinity);
}

/**
 * The role he expects: what his class and (for underclassmen) his stars make him feel entitled to,
 * capped at what his talent would earn plus `slack`. A backup within `close` overall of the weakest
 * starter at his position expects `closeExpect`: nearly as good, and feels buried.
 */
export function expectedRole(ctx: MoraleContext, a: Athlete): { role: number; close: boolean } {
  let entitled = MORALE.classExpect[a.year];
  if (a.year === 'FR' || a.year === 'SO') entitled = Math.max(entitled, MORALE.starsExpect[a.stars]);
  if (a.stars === 1) entitled *= MORALE.walkOn;
  const group = ctx.groups.get(a.pos);
  const ovr = ctx.ovr.get(a.id) ?? overall(a.r, a.pos);
  const talentRank = group ? group.ovrs.filter((o) => o > ovr).length : 0;
  const talent = group?.roles[talentRank] ?? 0;
  let role = Math.min(entitled, talent + MORALE.slack);
  let close = false;
  if (!ctx.slotOf.has(a.id) && group && ovr >= group.weakestStarter - MORALE.close) {
    close = true;
    role = Math.max(role, MORALE.closeExpect);
  }
  return { role, close };
}

export type MoraleDriver = 'role' | 'team' | 'coach' | 'room';

/** The signed pieces of his target, on top of his baseline. */
export interface MoraleDrivers {
  base: number;
  role: number;
  team: number;
  coach: number;
  room: number;
  /** For the reason: his expected and actual role. */
  expected: number;
  actual: number | null;
  close: boolean;
}

export function moraleDrivers(ctx: MoraleContext, a: Athlete): MoraleDrivers {
  const t = temperament(a);
  const actual = actualRole(ctx, a);
  const exp = expectedRole(ctx, a);
  let role = 0;
  if (actual !== null) {
    const gap = actual - exp.role;
    role = gap < 0 ? MORALE.roleW * t.pride * gap : Math.min(MORALE.roleUp, MORALE.roleW * gap);
  }
  const team = MORALE.teamW * t.team * ctx.mood.value;
  const coach = ctx.ts?.progress?.[a.id]?.me ?? 0;
  const v = voice(a, ctx.slotOf.has(a.id));
  const w = ctx.room.w - v;
  const room = w > 0 ? (MORALE.roomW * (ctx.room.m - v * moraleOf(ctx.ts, a))) / w : 0;
  return { base: t.base, role, team, coach, room, expected: exp.role, actual, close: exp.close };
}

/** Where his morale is heading. */
export function moraleTarget(d: MoraleDrivers): number {
  return clamp(d.base + d.role + d.team + d.coach + d.room, -1, 1);
}

const TEAM_TEXT: Record<TeamMoodPart, [string, string]> = {
  form: ['TEAM WINNING', 'TEAM LOSING'],
  rank: ['TEAM RANKED', 'TEAM RANKED'],
  streak: ['LOSING STREAK', 'LOSING STREAK'],
  rivalryWin: ['RIVALRY WIN', 'RIVALRY WIN'],
  rivalryLoss: ['LOST THE RIVALRY', 'LOST THE RIVALRY'],
  bowlEligible: ['BOWL BOUND', 'BOWL BOUND'],
  postseasonWin: ['BOWL WIN', 'BOWL WIN'],
  playoff: ['IN THE PLAYOFF', 'IN THE PLAYOFF'],
};

/** A driver must be at least this big to be the reason; otherwise he's settled. */
const REASON_MIN = 0.05;

/**
 * Why he feels the way he does: the biggest driver pulling the way his morale sits from his baseline.
 * Returns the driver and the text the card shows ("EXPECTS TO START", "TEAM WINNING").
 */
export function moraleReason(ctx: MoraleContext, a: Athlete, m: number): { driver: MoraleDriver | null; text: string } {
  const d = moraleDrivers(ctx, a);
  const sign = m >= d.base ? 1 : -1;
  const pick = (['role', 'team', 'coach', 'room'] as MoraleDriver[])
    .filter((k) => d[k] * sign >= REASON_MIN)
    .sort((x, y) => Math.abs(d[y]) - Math.abs(d[x]))[0];
  if (!pick) return { driver: null, text: 'SETTLED' };
  const up = sign > 0;
  switch (pick) {
    case 'role':
      if (up) return { driver: pick, text: ctx.slotOf.has(a.id) ? 'STARTING' : 'EARNED A ROLE' };
      return { driver: pick, text: d.close ? 'SHOULD BE STARTING' : d.expected >= 0.85 ? 'EXPECTS TO START' : 'WANTS MORE SNAPS' };
    case 'team': {
      const parts = Object.entries(ctx.mood.parts) as [TeamMoodPart, number][];
      const [k] = parts.filter(([, x]) => x * sign > 0).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))[0] ?? ['form'];
      return { driver: pick, text: TEAM_TEXT[k][up ? 0 : 1] };
    }
    case 'coach':
      return { driver: pick, text: up ? 'WON THE JOB' : 'BENCHED' };
    default:
      return { driver: pick, text: up ? 'LOCKER ROOM UPBEAT' : 'UNHAPPY VETERANS' };
  }
}

/**
 * One team's morale after a game, for every player on the roster: new coach decisions (who lost or won
 * a starting job, from last game's starters; a rest day is neither), then each player moves `rate` of
 * the way to his target, plus a small nudge. Decisions fade. Reads no grades: performance never feeds
 * morale. Runs before the confidence step, which moves last game's starters (`ts.st`) on.
 */
export function moraleStep(state: SeasonState, ts: TeamState, squad: Squad, rng: Rng): void {
  const prog = (ts.progress ??= {});
  const entry = (id: string): Progress => (prog[id] ??= { xp: 0, lvl: 0, d: {} });
  for (const p of Object.values(prog)) {
    if (!p.me) continue;
    p.me = round2(p.me * MORALE.decisionFade);
    if (Math.abs(p.me) < 0.02) {
      delete p.me;
      delete p.mk;
    }
  }
  for (const f of newStarters(state, ts, squad)) {
    if (f.rest) continue;
    if (healthy(f.replaced)) {
      const p = entry(f.replaced.id);
      p.me = round2(-MORALE.benchHit * temperament(f.replaced).pride);
      p.mk = 'bench';
    }
    const p = entry(f.athlete.id);
    p.me = MORALE.jobLift;
    p.mk = 'job';
  }
  const ctx = moraleContext(state, squad);
  const mo: Record<string, number> = {};
  for (const a of squad.athletes) {
    const m = moraleOf(ts, a);
    const target = moraleTarget(moraleDrivers(ctx, a));
    mo[a.id] = round2(clamp(m + MORALE.rate * (target - m) + MORALE.noise * gauss(rng), -1, 1));
  }
  ts.mo = mo;
}

/** Into a new season: morale carries `offseason` of its distance from his baseline; coach decisions clear. */
export function carryMorale(ts: TeamState, athletes: Athlete[]): void {
  if (ts.mo) {
    const mo: Record<string, number> = {};
    for (const a of athletes) {
      const m = ts.mo[a.id];
      if (m === undefined) continue;
      const base = temperament(a).base;
      mo[a.id] = round2(base + MORALE.offseason * (m - base));
    }
    ts.mo = mo;
  }
  for (const p of Object.values(ts.progress ?? {})) {
    delete p.me;
    delete p.mk;
  }
}
