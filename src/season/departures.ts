import type { Athlete } from '../data/athletes';
import { athleteName, generatedAthlete } from '../data/depth';
import { overall } from '../data/positions';
import { TEAMS, teamById } from '../data/teams';
import { clamp } from '../engine/math';
import { tell } from './career';
import { classIn, outOfEligibility } from './classes';
import { DRAFT_PICKS, draftNoise, draftOrder, draftSchedule, draftValue } from './draft';
import { temperament } from './morale';
import { dropPlayer } from './portal';
import type { DeclareEntry, Departure, DeparturesState, DraftPick, NewsItem, SeasonState } from './types';
import { seasonRng, squadFor } from './world';

/**
 * Departures (docs/RECRUITING_PLAN.md, phase 1), the offseason stage between the coaching carousel and
 * the portal. Round 0 is the declare watch: the user's underclassmen thinking about the NFL, whom he
 * can meet. Advancing it runs the stage: redshirts are taken, underclassmen declare, seniors out of
 * eligibility graduate, the NFL draft takes 257 of them, and they all leave. Round 1 shows who left.
 *
 * Tuning:
 * - `redshirtGames`: games a player can take a snap in and keep his redshirt (the NCAA's 4). A true
 *   freshman takes it automatically; any class does after a season-ending injury (a medical redshirt).
 * - `declare`: the logit on declaring. `byPick` by projected pick (the first that fits), plus `pride`
 *   and `team` per point of his temperament off 1 (the NFL calls the proud; the team-first stay to
 *   finish something), and `last` when he has one season left.
 * - `watch`: the odds that put one of the user's players on the watch.
 * - `meet`: meetings the user gets, and their odds: `base` plus `team` per point of his team trait off
 *   1, less `first`/`second` for a first- or second-round projection. A good talk takes `lift` off his logit.
 * - `cpuMeets`: CPU staffs meet their likeliest declarers too.
 */
export const DEPARTURES = {
  redshirtGames: 4,
  declare: {
    byPick: [[16, 2.6], [32, 1.8], [64, 0.8], [100, -0.4], [160, -1.6], [257, -2.6], [Infinity, -5]] as [number, number][],
    pride: 1.2,
    team: -1.2,
    last: 0.5,
  },
  watch: 0.15,
  meet: { n: 3, base: 0.55, team: 0.4, first: 0.25, second: 0.1, lift: 1.5 },
  cpuMeets: 2,
};

/** Someone who could be drafted this year: a senior out of eligibility, or an underclassman 3+ seasons out of high school. */
interface Prospect {
  a: Athlete;
  team: string;
  grad: boolean;
  value: number;
}

/** Everyone the draft could take, best first, with the redshirts this season's games have earned already taken. */
function draftClass(state: SeasonState): Prospect[] {
  const out: Prospect[] = [];
  for (const t of TEAMS) {
    const prog = state.teamState[t.id]?.progress ?? {};
    for (const a of squadFor(state, t.id).athletes) {
      const gen = generatedAthlete(a.id) ?? a;
      const rs = prog[a.id]?.rs ?? redshirtFor(state, t.id, a);
      const c = classIn(gen, state.year, rs);
      const grad = outOfEligibility(gen, state.year, rs);
      if (!grad && c.seasons < 3) continue;
      const left = grad ? 0 : 3 - c.idx + (rs === state.year ? 1 : 0);
      out.push({ a, team: t.id, grad, value: draftValue(a, left) + draftNoise(state.seed, state.year, a.id) });
    }
  }
  return out.sort((x, y) => y.value - x.value);
}

/** The season he redshirts, if this season earns one: few games, as a true freshman or after a season-ending injury. */
function redshirtFor(state: SeasonState, team: string, a: Athlete): number | undefined {
  const p = state.teamState[team]?.progress?.[a.id];
  if (p?.rs !== undefined || a.redshirt || (p?.gp ?? 0) > DEPARTURES.redshirtGames) return undefined;
  const fresh = a.year === 'FR';
  const medical = (state.injuryLog ?? []).some((e) => e.id === a.id && e.season);
  return fresh || medical ? state.year : undefined;
}

/** Projected pick by id among this year's draft class (everyone eligible, as if all declared). */
function projections(pool: Prospect[]): Map<string, number> {
  return new Map(pool.map((x, i) => [x.a.id, i + 1]));
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** His logit on declaring, before any meeting. */
function declareLogit(a: Athlete, proj: number, last: boolean): number {
  const D = DEPARTURES.declare;
  const t = temperament(a);
  const base = D.byPick.find(([n]) => proj <= n)![1];
  return base + D.pride * (t.pride - 1) + D.team * (t.team - 1) + (last ? D.last : 0);
}

interface Odds {
  p: number;
  proj: number;
}

/** Declare odds for every underclassman in the draft class. */
function declareOdds(state: SeasonState, pool: Prospect[]): Map<string, Odds> {
  const proj = projections(pool);
  const adj = state.departures?.adj ?? {};
  const out = new Map<string, Odds>();
  for (const x of pool) {
    if (x.grad) continue;
    const last = x.a.year === 'JR' || x.a.year === 'SR';
    const pr = proj.get(x.a.id)!;
    out.set(x.a.id, { p: sigmoid(declareLogit(x.a, pr, last) + (adj[x.a.id] ?? 0)), proj: pr });
  }
  return out;
}

/** The stage opens on the declare watch: the user's underclassmen with real odds of leaving. */
export function openDepartures(state: SeasonState): void {
  const d: DeparturesState = { watch: {}, adj: {}, meets: 0 };
  state.departures = d;
  if (state.config.delegate.departures) return;
  const user = state.config.userTeamId;
  const pool = draftClass(state);
  const odds = declareOdds(state, pool);
  for (const x of pool) {
    const o = odds.get(x.a.id);
    if (x.team === user && o && o.p >= DEPARTURES.watch) d.watch[x.a.id] = { p: o.p, proj: o.proj };
  }
}

/** A team's seniors out of eligibility this year (a senior taking a medical redshirt stays), best first. */
export function seniorsLeaving(state: SeasonState, team: string): Athlete[] {
  const prog = state.teamState[team]?.progress ?? {};
  return squadFor(state, team).athletes
    .filter((a) => outOfEligibility(generatedAthlete(a.id) ?? a, state.year, prog[a.id]?.rs ?? redshirtFor(state, team, a)))
    .sort((a, b) => overall(b.r, b.pos) - overall(a.r, a.pos));
}

/** The odds a meeting keeps him: his team trait, against how high he'd go. */
export function meetOdds(a: Pick<Athlete, 'id'>, proj: number): number {
  const M = DEPARTURES.meet;
  return clamp(M.base + M.team * (temperament(a).team - 1) - (proj <= 32 ? M.first : proj <= 64 ? M.second : 0), 0.05, 0.95);
}

function meet(state: SeasonState, id: string, proj: number): boolean {
  const ok = seasonRng(state, 'declare', 'meet', id)() < meetOdds({ id }, proj);
  if (ok) state.departures!.adj[id] = -DEPARTURES.meet.lift;
  return ok;
}

/** The user meets one of his players on the watch. False when he can't (no meetings left, or already met). */
export function meetOnWatch(state: SeasonState, id: string): boolean {
  const d = state.departures;
  const e: DeclareEntry | undefined = d?.watch[id];
  if (!d || !e || e.met || d.meets >= DEPARTURES.meet.n || state.offseason?.round) return false;
  d.meets++;
  e.met = true;
  e.ok = meet(state, id, e.proj);
  return true;
}

/**
 * The stage runs: redshirts, declarations, graduation and the draft, then everyone leaving is taken off
 * his roster. CPU staffs (and a delegated user) meet their likeliest declarers first.
 */
export function runDepartures(state: SeasonState): void {
  const d = (state.departures ??= { watch: {}, adj: {}, meets: 0 });
  const user = state.config.userTeamId;
  // Redshirts first: a senior's medical redshirt keeps him.
  for (const t of TEAMS) {
    const ts = (state.teamState[t.id] ??= {});
    for (const a of squadFor(state, t.id).athletes) {
      const rs = redshirtFor(state, t.id, a);
      if (rs === undefined) continue;
      const p = ((ts.progress ??= {})[a.id] ??= { xp: 0, lvl: 0, d: {} });
      p.rs = rs;
      tell(state, a.id, { team: t.id, kind: 'redshirt', text: 'Takes a redshirt year' });
    }
  }
  let pool = draftClass(state);
  let odds = declareOdds(state, pool);
  for (const t of TEAMS) {
    if (t.id === user && !state.config.delegate.departures) continue;
    const risk = pool.filter((x) => x.team === t.id && !x.grad).map((x) => ({ id: x.a.id, o: odds.get(x.a.id)! }))
      .filter((x) => x.o.p >= DEPARTURES.watch).sort((a, b) => b.o.p - a.o.p).slice(0, DEPARTURES.cpuMeets);
    for (const x of risk) meet(state, x.id, x.o.proj);
  }
  odds = declareOdds(state, pool);
  pool = pool.filter((x) => x.grad || seasonRng(state, 'declare', x.a.id)() < odds.get(x.a.id)!.p);
  const rng = seasonRng(state, 'draft', 'order');
  const slots = draftSchedule(draftOrder(rng), rng);
  const picks: DraftPick[] = pool.slice(0, DRAFT_PICKS).map((x, n) => ({
    id: x.a.id, team: x.team, name: athleteName(x.a), pos: x.a.pos, ovr: overall(x.a.r, x.a.pos), ...slots[n], ...(x.grad ? {} : { early: true }),
  }));
  const taken = new Map(picks.map((p) => [p.id, p]));
  const gone: Departure[] = [];
  const left: Record<string, number> = {};
  for (const x of pool) {
    gone.push({ id: x.a.id, team: x.team, name: athleteName(x.a), pos: x.a.pos, ovr: overall(x.a.r, x.a.pos), why: x.grad ? 'grad' : 'declare' });
    left[x.team] = (left[x.team] ?? 0) + 1;
    tell(state, x.a.id, { team: x.team, kind: x.grad ? 'graduated' : 'declared', text: x.grad ? 'Out of eligibility: his college career is over' : 'Declares for the NFL draft' });
    const pk = taken.get(x.a.id);
    if (pk) tell(state, x.a.id, { team: x.team, kind: 'drafted', text: `Drafted by ${pk.city}: round ${pk.round}, pick ${pk.pick}` });
    else if (!x.grad) tell(state, x.a.id, { team: x.team, kind: 'drafted', text: 'Goes undrafted' });
    dropPlayer(state, x.a.id, x.team);
  }
  d.gone = gone;
  d.left = left;
  const h = state.history.find((s) => s.year === state.year);
  if (h) h.draft = picks;
  state.news.push(...draftNews(state, picks, gone));
}

function draftNews(state: SeasonState, picks: DraftPick[], gone: Departure[]): NewsItem[] {
  const user = state.config.userTeamId;
  const news = (text: string, teams: string[]): NewsItem => ({ week: 0, kind: 'draft', text, teams });
  const out: NewsItem[] = [];
  const grads = gone.filter((g) => g.why === 'grad').length;
  out.push(news(`DEPARTURES: ${grads} seniors run out of eligibility and ${gone.length - grads} underclassmen declare for the NFL draft`, []));
  const mine = gone.filter((g) => g.team === user);
  if (mine.length) {
    const dec = mine.filter((g) => g.why === 'declare').length;
    out.push(news(`DEPARTURES: ${teamById(user).school} loses ${mine.length - dec} seniors and ${dec} early entrants`, [user]));
  }
  const first = picks[0];
  if (first) out.push(news(`DRAFT: ${first.city} takes ${first.name} (${teamById(first.team).abbr} ${first.pos}) first overall`, [first.team]));
  const byConf = new Map<string, number>();
  for (const p of picks) {
    const c = teamById(p.team).conference;
    byConf.set(c, (byConf.get(c) ?? 0) + 1);
  }
  const top = [...byConf].sort((a, b) => b[1] - a[1])[0];
  if (top) out.push(news(`DRAFT: the ${top[0]} leads all conferences with ${top[1]} picks`, []));
  for (const p of picks.filter((x) => x.team === user)) {
    out.push(news(`DRAFT: ${p.name} (${p.pos}) goes to ${p.city} in round ${p.round}, pick ${p.pick}`, [user]));
  }
  return out;
}
