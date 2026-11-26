import { GROUPS, parseCoachId, type Group } from '../data/coaches';
import { athleteName } from '../data/depth';
import { CITIES, REGION, TALENT, TEAM_STATE } from '../data/fbs/geo';
import { OVR_WEIGHTS, overall, POSITIONS, type Position } from '../data/positions';
import { prospect, recruitPool, recruitSalt, WANTS, type Prospect, type Want } from '../data/recruits';
import { COMPOSITION, freshmanLevel, pickJersey, STARTERS } from '../data/rosterGen';
import { CALENDAR } from '../data/season/calendar';
import { templateValue } from '../data/athletes';
import type { RatingKey } from '../data/ratings';
import { TEAMS, teamById } from '../data/teams';
import { clamp, gauss, hashString, mulberry32 } from '../engine/math';
import { tell } from './career';
import { headRecruit } from './coaching';
import { groupOf } from './emphasis';
import { temperament } from './morale';
import { latestPoll, rankIn } from './polls';
import type { NewsItem, RecruitingState, SeasonGame, SeasonState } from './types';
import { baseRoster, headCoachFor, seasonRng, squadFor, staffFor } from './world';

/**
 * HS recruiting (docs/RECRUITING.md, phases 3 and 4). Season Y recruits the class that enrolls in Y+1,
 * on a real calendar:
 * - **Summer** (`openRecruiting`, as the season opens): every staff, the user's included, builds a board,
 *   hosts summer official visits and offers; early deciders commit.
 * - **Weeks 1-15** (`recruitWeek`, after each week's results): position coaches work their boards
 *   (contacts), home games host official visits that swing on the result, staffs offer, prospects commit,
 *   decommit and flip. Week 15 closes with the **early signing period** (`earlySigning`).
 * - **Bowls and the playoff:** a dead period for visits; head coaches' in-home visits open.
 * - **Offseason:** the carousel's departures shake loose commits (`recruitsReact`); **national signing
 *   day** (`runSigningDay`, the `signing` stage) settles everyone left, and the signees join their rosters.
 *
 * No currency: a school's pull is the prospect's wants (data/recruits.ts) times what it offers
 * (`recruitAppeal`), plus the interest its staff built. The same comparison picks commits and drives
 * flips. Every school runs the same code (`autoRecruit`); the user's staff run the user's side when
 * it's delegated, and the position coaches always make the contacts.
 *
 * Tuning:
 * - `attrition`: spots a class plans for beyond its seniors (early entrants; portal losses are signing
 *   day's, after the portal); `portalHold` the spots a
 *   staff holds back for the transfer portal (the user sets his own, `RecruitingState.hold`), so the
 *   class signed in the season leaves the portal room. National signing day, after the portal, fills
 *   what's left to the cap. `classMin`/`classMax` bound a class, `overCommit` the commits taken over it
 *   (verbal only: the early period signs at most the class).
 * - `release`: a commit the user lets go to make room for a transfer: his interest in the school falls
 *   to `interest` times what it was, and the program's pipeline in his state loses `pipe`.
 * - `aimBelow`: how far under a school's freshman level (`freshmanLevel`) its board reaches, and `reach`
 *   further per 10 points of prestige it's short of its tier's mean (a weak brand recruits lower);
 *   `board.mult` targets per open spot, `board.rank` how high a school must rank among the schools
 *   that would take him for its staff to bother, `board.drop` when it gives up (`board.flip` on one
 *   committed elsewhere), `board.refresh` the weeks it rebuilds.
 * - `contacts`/`contact`: prospects a position coach works a week and the interest each builds (scaled by
 *   his recruit, the school's appeal and pipelines); `cap` where interest saturates; `decay` a week without contact.
 * - `offer`: interest an offer adds; `offerRank` the market rank a CPU staff offers at; `offerMult` offers
 *   per spot; `pace` the share of its class a staff expects committed by a week, and `paceOffers` extra
 *   offers per commit it's behind; `signingOffers` last offers per open spot on signing day, in up to
 *   `signingRounds` rounds while a staff has room.
 * - `pt`: overall points per logistic unit of making next year's two-deep, `growth` what returners add by then.
 * - `win`, `home`, `nfl`: the wants' factors. `dream`: a dream school's pull; `familiar` a program pipeline's.
 * - `visit`: official visits a home game hosts, a prospect's max, and the result's swing; `inHome` the
 *   head coaches' visits from week 15.
 * - `commit`: the lead over his next choice he needs (from `bar[0]` in the summer to `bar[1]` at week 14,
 *   less `perVisit` per official visit taken, none after the regular season) and the weekly odds once
 *   it's there; `summer` rounds; `interest` what counts a school as working him.
 * - `decommit`: the weekly logit on a commit opening up again (a rival's lead, his firmness, a bad loss,
 *   a losing streak, falling out of the poll, a better commit at his position); `coachLeft` per point of
 *   bond when his recruiter or head coach leaves.
 * - `early`: the odds a commit signs in the early period (by firmness; late deciders mostly wait).
 * - `pipe`: pipelines' effect on contacts and evaluations, and how they grow and fade.
 * - `eval`: a staff's read of a prospect: `bias` (a weak scout's lasting error), `noise` shrinking with
 *   `effort` (contacts, visits), the CPU staffs' assumed effort.
 */
export const RECRUITING = {
  attrition: 1,
  portalHold: 4,
  holdMax: 10,
  release: { interest: 0.3, pipe: 0.1 },
  classMin: 8,
  classMax: 28,
  overCommit: 2,
  aimBelow: 5,
  reach: 2,
  board: { mult: 3, rank: 12, drop: 24, flip: 2, refresh: [3, 6, 9, 12] },
  contacts: 8,
  contact: 0.045,
  cap: 1.2,
  decay: 0.025,
  offer: 0.08,
  offerRank: 6,
  offerMult: 2,
  signingOffers: 3,
  signingRounds: 2,
  pace: (week: number, summer: boolean) => (summer ? 0.1 : 0.15 + 0.55 * clamp(week / 15, 0, 1)),
  paceOffers: 2,
  pt: 3,
  growth: 2,
  win: { season: 0.3, recent: 0.2, brand: 0.5, history: 2 },
  home: { state: 1, region: 0.6, away: 0.3 },
  nfl: { drafts: 3, perPick: 0.25 },
  dream: 0.25,
  familiar: 0.05,
  visit: { n: 4, max: 5, gain: 0.18, atm: 0.6, won: 0.4, margin: 0.3, ranked: 0.2, rivalry: 0.2, lost: -0.3, blowout: -0.4, close: 0.3, vibe: 0.25 },
  inHome: { n: 6, cpu: 4, gain: 0.22 },
  commit: { bar: [0.08, 0.02], perVisit: 0.02, odds: 0.4, summer: 4, interest: 0.15 },
  decommit: { base: -4.8, gap: 6, firm: -1.5, blowout: 0.8, streak: 0.6, unranked: 0.4, crowd: 0.5, coachLeft: 2.5 },
  early: { base: 1.6, firm: 1.5, late: 0.3 },
  pipe: { coach: 0.3, program: 0.3, grow: 0.12, decay: 0.75, eval: 0.3 },
  eval: { bias: 3.5, noise: 6, effort: 2, cpuEffort: 4 },
};

const R = RECRUITING;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const norm = (r: number | undefined) => clamp(((r ?? 50) - 30) / 65, 0, 1);

/** One school as the recruits see it this week. */
export interface RSchool {
  id: string;
  home: string;
  /** Factors by want (PT is per prospect, from the chart). */
  win: number;
  dev: Record<Group, number>;
  nfl: Record<Group, number>;
  coach: Record<Group, number>;
  scout: Record<Group, number>;
  head: number;
  /** Next season's chart: returners' overalls (plus `growth`) and commits' services level, best first. */
  chart: Map<Position, number[]>;
  /** The class it plans: spots, by position, and commits so far (once departures have run, the commits not yet on the roster). */
  target: number;
  need: Map<Position, number>;
  commits: number;
  /** Departures have run: the class is the room under the cap, with no over-commits. */
  late: boolean;
  /** Its freshman level by position: the bottom of its board is `aimBelow` under. */
  aim: Map<Position, number>;
  /** The same, flat for the market's inner loop: by position index the board's floor and the two-deep bar (NaN: open), by group index the factors. */
  floor: Float64Array;
  bar2: Float64Array;
  fg: Float64Array;
  /** Program pipelines, and the position coaches' (seeded plus grown), by state. */
  pipe: Record<string, number>;
  cpipe: Record<Group, Record<string, number>>;
}

// ---------------------------------------------------------------- pipelines

/**
 * A coach's recruiting pipelines (phase 4): one or two states seeded from his id, near where he came up,
 * plus what his signings have grown (`CoachProgress.pipe`). They move with him in the carousel.
 */
export function coachPipe(state: SeasonState, coachId: string): Record<string, number> {
  const out: Record<string, number> = { ...seededPipe(coachId) };
  for (const [st, v] of Object.entries(state.coaches?.[coachId]?.pipe ?? {})) out[st] = clamp((out[st] ?? 0) + v, 0, 1);
  return out;
}

const pipeCache = new Map<string, Record<string, number>>();
const TALENT_STATES = Object.keys(TALENT).filter((s) => CITIES[s]);

function seededPipe(coachId: string): Record<string, number> {
  const hit = pipeCache.get(coachId);
  if (hit) return hit;
  const rng = mulberry32(hashString(`pipe:${coachId}`));
  const team = parseCoachId(coachId)?.team;
  const home = (team && TEAM_STATE[team.id]) || 'TX';
  const pickState = (pool: string[]) => {
    const total = pool.reduce((s, x) => s + (TALENT[x] ?? 0.3), 0);
    let r = rng() * total;
    for (const x of pool) if ((r -= TALENT[x] ?? 0.3) <= 0) return x;
    return pool[0];
  };
  const out: Record<string, number> = {};
  const near = TALENT_STATES.filter((s) => REGION[s] === REGION[home]);
  const first = rng() < 0.5 ? home : pickState(near.length ? near : [home]);
  out[first] = round3(0.4 + 0.4 * rng());
  if (rng() < 0.5) {
    const second = pickState(TALENT_STATES);
    if (second !== first) out[second] = round3(0.3 + 0.3 * rng());
  }
  pipeCache.set(coachId, out);
  return out;
}

/** The strongest pipeline states, for a card: "GA, FL". */
export function pipeLabel(pipe: Record<string, number>, n = 2): string {
  return Object.entries(pipe).filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([s]) => s).join(', ') || 'NONE';
}

// ---------------------------------------------------------------- schools

/** A season's standing, 0..1: half the AP rank, half the win share (as the portal reads it). */
function standingOf(rank: number, wp: number): number {
  return 0.5 * (rank ? (26 - rank) / 25 : 0) + 0.5 * clamp((wp - 0.25) / 0.65, 0, 1);
}

function winShares(state: SeasonState): Map<string, [number, number]> {
  const w = new Map<string, [number, number]>();
  for (const g of state.games) {
    if (!g.result) continue;
    const homeWon = g.result.home > g.result.away;
    for (const [id, won] of [[g.home, homeWon], [g.away, !homeWon]] as const) {
      const x = w.get(id) ?? [0, 0];
      x[0] += won ? 1 : 0;
      x[1]++;
      w.set(id, x);
    }
  }
  return w;
}

/**
 * The spots a school holds back from its class for the transfer portal: the user's dial, or the
 * staff's `portalHold`.
 */
export function portalHold(state: SeasonState, team: string): number {
  const h = state.recruiting?.hold?.[team];
  return h === undefined ? R.portalHold : clamp(Math.round(h), 0, R.holdMax);
}

/** The user sets the spots his class holds back for the portal (CLASS tab). */
export function setHold(state: SeasonState, n: number): void {
  const rs = state.recruiting;
  if (!rs) return;
  (rs.hold ??= {})[userTeam(state)] = clamp(Math.round(n), 0, R.holdMax);
  dropSchools(state);
}

/** Departures have run: the roster is next year's, so the class fills what's open, with no seniors or attrition left to plan for. */
const lateCycle = (state: SeasonState) => state.phase === 'offseason' && !!state.departures?.gone;

/**
 * The class a school plans, by position. In the season: its seniors and `attrition` out, less the
 * spots it holds for the portal (`hold`). Once departures have run: the room left under the cap
 * (`roster` has the early signees and transfers on it; open commits count against it).
 */
function classPlan(roster: { pos: Position; year: string }[], hold: number, late: boolean): { target: number; need: Map<Position, number> } {
  const count = new Map<Position, number>();
  const leaving = new Map<Position, number>();
  for (const a of roster) {
    count.set(a.pos, (count.get(a.pos) ?? 0) + 1);
    if (!late && a.year === 'SR') leaving.set(a.pos, (leaving.get(a.pos) ?? 0) + 1);
  }
  const out = [...leaving.values()].reduce((a, b) => a + b, 0);
  const attrition = late ? 0 : R.attrition;
  const target = late ? Math.max(0, 85 - roster.length) : clamp(85 - roster.length + out + attrition - hold, R.classMin, R.classMax);
  const need = new Map<Position, number>();
  let sum = 0;
  for (const [p, c] of COMPOSITION) {
    const d = Math.max(0, c + c / 85 * attrition - ((count.get(p) ?? 0) - (leaving.get(p) ?? 0)));
    need.set(p, d);
    sum += d;
  }
  // Scale the deficits to the class; every position keeps a share of its usual count.
  for (const [p, c] of COMPOSITION) need.set(p, Math.max(need.get(p)! * (sum ? target / sum : 0), p === 'K' || p === 'P' || p === 'FB' ? 0 : (c / 85) * target * 0.4));
  return { target, need };
}

const schoolCache = new WeakMap<RecruitingState, { key: string; map: Map<string, RSchool> }>();

/** Every school as recruits see it, cached for the week (commits update its chart in place). */
export function recruitSchools(state: SeasonState): Map<string, RSchool> {
  const rs = state.recruiting!;
  const key = `${state.year}:${state.week}:${state.phase}:${state.offseason?.stage ?? ''}:${state.offseason?.round ?? ''}`;
  const hit = schoolCache.get(rs);
  if (hit?.key === key) return hit.map;
  const wp = winShares(state);
  const ap = latestPoll(state, 'ap');
  const past = state.history.filter((h) => h.year < state.year && h.ap).slice(-R.win.history);
  const drafts = state.history.filter((h) => h.draft).slice(-R.nfl.drafts);
  const picks = new Map<string, number>();
  for (const h of drafts) for (const p of h.draft!) picks.set(`${p.team}:${groupOf(p.pos)}`, (picks.get(`${p.team}:${groupOf(p.pos)}`) ?? 0) + 1);
  const rec = TEAMS.map((t) => {
    const now = (state.teamState[t.id]?.lu ?? 0) / 85;
    const hist = past.map((h) => h.dev?.[t.id] ?? now);
    return { id: t.id, v: (now + hist.reduce((a, b) => a + b, 0)) / (1 + hist.length) };
  }).sort((a, b) => a.v - b.v);
  const devPct = new Map(rec.map((r, i) => [r.id, i / Math.max(1, rec.length - 1)]));
  const commitsBy = new Map<string, { id: string; pos: Position; pub: number }[]>();
  for (const [id, t] of Object.entries(rs.commits)) {
    const p = prospect(id);
    if (!p) continue;
    let x = commitsBy.get(t);
    if (!x) commitsBy.set(t, (x = []));
    x.push({ id, pos: p.pos, pub: p.pub });
  }
  const map = new Map<string, RSchool>();
  const late = lateCycle(state);
  for (const t of TEAMS) {
    const prof = t.profile;
    const w = wp.get(t.id);
    const season = standingOf(rankIn(ap, t.id), w ? w[0] / w[1] : 0.5);
    const recent = past.length ? past.reduce((s, h) => s + standingOf(h.ap!.indexOf(t.id) + 1, h.wp?.[t.id] ?? 0.5), 0) / past.length : season;
    const titles = state.history.filter((h) => h.champion === t.id).length;
    const brand = clamp(prof.prestige / 100 + titles * 0.05, 0, 1);
    const staff = staffFor(state, t.id);
    const dev = {} as Record<Group, number>;
    const nfl = {} as Record<Group, number>;
    const coach = {} as Record<Group, number>;
    const scout = {} as Record<Group, number>;
    const cpipe = {} as Record<Group, Record<string, number>>;
    for (const g of GROUPS) {
      dev[g] = 0.6 * norm(staff[g].r.teach) + 0.4 * (devPct.get(t.id) ?? 0.5);
      const n = picks.get(`${t.id}:${g}`) ?? 0;
      nfl[g] = drafts.length ? 0.5 * brand + 0.5 * clamp((n * R.nfl.perPick * 3) / drafts.length, 0, 1) : brand;
      coach[g] = norm(staff[g].r.recruit);
      scout[g] = norm(staff[g].r.scout);
      cpipe[g] = coachPipe(state, staff[g].id);
    }
    const roster = squadFor(state, t.id).athletes;
    const chart = new Map<Position, number[]>();
    for (const a of roster) {
      if (a.year === 'SR') continue;
      let c = chart.get(a.pos);
      if (!c) chart.set(a.pos, (c = []));
      c.push(overall(a.r, a.pos) + R.growth);
    }
    const plan = classPlan(roster, portalHold(state, t.id), late);
    // Early signees already on the roster are in its chart and count; only the commits still coming count against the class.
    const ids = late ? new Set(roster.map((a) => a.id)) : undefined;
    const mine = (commitsBy.get(t.id) ?? []).filter((c) => !ids?.has(c.id));
    for (const c of mine) {
      let x = chart.get(c.pos);
      if (!x) chart.set(c.pos, (x = []));
      x.push(c.pub);
      plan.need.set(c.pos, Math.max(0, (plan.need.get(c.pos) ?? 0) - 1));
    }
    for (const c of chart.values()) c.sort((x, y) => y - x);
    const aim = new Map<Position, number>(POSITIONS.map((p) => [p, freshmanLevel(prof, p)]));
    const fg = new Float64Array(GROUPS.length * 3);
    GROUPS.forEach((g, i) => {
      fg[i * 3] = dev[g];
      fg[i * 3 + 1] = nfl[g];
      fg[i * 3 + 2] = coach[g];
    });
    const school: RSchool = {
      id: t.id, home: TEAM_STATE[t.id] ?? 'TX', win: R.win.season * season + R.win.recent * recent + R.win.brand * brand,
      dev, nfl, coach, scout, head: headRecruit(state, t.id), chart, target: plan.target, need: plan.need, commits: mine.length, late, aim,
      floor: new Float64Array(POSITIONS.map((p) => aim.get(p)! - R.aimBelow - R.reach * Math.max(0, TIER_PRESTIGE[prof.tier] - prof.prestige) / 10)), bar2: new Float64Array(POSITIONS.length), fg,
      pipe: state.teamState[t.id]?.pipe ?? {}, cpipe,
    };
    for (const p of POSITIONS) setBar(school, p);
    map.set(t.id, school);
  }
  schoolCache.set(rs, { key, map });
  return map;
}

/** Mean prestige by tier: a program with less of a brand than its tier reaches lower (`reach`). */
const TIER_PRESTIGE = [0, 1, 2, 3, 4, 5].map((tier) => {
  const ts = TEAMS.filter((t) => t.profile.tier === tier);
  return ts.length ? ts.reduce((a, t) => a + t.profile.prestige, 0) / ts.length : 0;
});

const POS_IX = new Map<Position, number>(POSITIONS.map((p, i) => [p, i]));
const GROUP_IX = new Map<Group, number>(GROUPS.map((g, i) => [g, i]));

/** The chart at a position changed: its two-deep bar for the market. */
function setBar(s: RSchool, pos: Position): void {
  s.bar2[POS_IX.get(pos)!] = s.chart.get(pos)?.[STARTERS[pos] * 2 - 1] ?? NaN;
}

/** Drop the week's schools (a commit moved a chart in a way a fresh build should see). */
const dropSchools = (state: SeasonState) => state.recruiting && schoolCache.delete(state.recruiting);

/**
 * Read the recruiting world without leaving a trace: the school cache is put back as it was, so a
 * display-only reader (storylines) never changes what the next recruiting step sees.
 */
export function peekRecruiting<T>(state: SeasonState, f: () => T): T {
  const rs = state.recruiting;
  const hit = rs && schoolCache.get(rs);
  try {
    return f();
  } finally {
    if (rs) {
      if (hit) schoolCache.set(rs, hit);
      else schoolCache.delete(rs);
    }
  }
}

// ---------------------------------------------------------------- appeal

/** A school's appeal to him: his wants times its factors, his dream school, and the program's pipeline in his state. */
export function recruitAppeal(s: RSchool, p: Prospect): number {
  const w = p.m.wants;
  const st = p.a.hometown.state;
  const bar = s.bar2[POS_IX.get(p.pos)!];
  const pt = Number.isNaN(bar) ? 1 : sigmoid((p.pub - bar) / R.pt);
  const home = st === s.home ? R.home.state : REGION[st] && REGION[st] === REGION[s.home] ? R.home.region : R.home.away;
  const gi = GROUP_IX.get(groupOf(p.pos))! * 3;
  return w.PT * pt + w.WIN * s.win + w.DEV * s.fg[gi] + w.HOME * home + w.NFL * s.fg[gi + 1] + w.COACH * s.fg[gi + 2]
    + (p.m.dream === s.id ? R.dream : 0) + R.familiar * (s.pipe[st] ?? 0);
}

/** How much he likes a school right now: its appeal plus the interest its staff built. */
export function recruitScore(state: SeasonState, s: RSchool, p: Prospect): number {
  return recruitAppeal(s, p) + (state.recruiting!.interest[p.id]?.[s.id] ?? 0);
}

/** Whether a school's board would reach him: his services level no lower than its floor (`aimBelow` under its freshman level, and `reach`). */
const inWindow = (s: RSchool, p: Prospect) => p.pub >= s.floor[POS_IX.get(p.pos)!];

/**
 * Every open prospect's market: the schools whose boards reach him, by how much he likes them, his
 * top `board.drop` kept; and inverted, each school's prospects with its rank. Built once per step that
 * needs it (boards and offers), so a staff's question "would he have us?" is a lookup.
 */
interface Markets {
  /** His kept market: school to rank. */
  rank: Map<string, Map<string, number>>;
  /** By school, the prospects who keep it in their market, with its rank: its board candidates. */
  byTeam: Map<string, { id: string; rank: number }[]>;
}

function buildMarkets(state: SeasonState, schools: Map<string, RSchool>): Markets {
  const rs = state.recruiting!;
  const rank = new Map<string, Map<string, number>>();
  const byTeam = new Map<string, { id: string; rank: number }[]>([...schools.keys()].map((t) => [t, []]));
  const list = [...schools.values()];
  const K = R.board.drop;
  const topV = new Float64Array(K);
  const topS: RSchool[] = new Array(K);
  for (const p of recruitClass(state)) {
    if (!open(rs, p.id)) continue;
    const intr = rs.interest[p.id];
    const w = p.m.wants;
    const st = p.a.hometown.state;
    const reg = REGION[st];
    const pi = POS_IX.get(p.pos)!;
    const gi = GROUP_IX.get(groupOf(p.pos))! * 3;
    let n = 0;
    for (const s of list) {
      if (p.pub < s.floor[pi]) continue;
      const bar = s.bar2[pi];
      const pt = Number.isNaN(bar) ? 1 : 1 / (1 + Math.exp(-(p.pub - bar) / R.pt));
      const home = st === s.home ? R.home.state : reg && reg === REGION[s.home] ? R.home.region : R.home.away;
      let v = w.PT * pt + w.WIN * s.win + w.DEV * s.fg[gi] + w.HOME * home + w.NFL * s.fg[gi + 1] + w.COACH * s.fg[gi + 2]
        + (p.m.dream === s.id ? R.dream : 0) + R.familiar * (s.pipe[st] ?? 0);
      if (intr) v += intr[s.id] ?? 0;
      // Keep the top K, best first.
      if (n < K) n++;
      else if (v <= topV[K - 1]) continue;
      let i = n - 1;
      while (i > 0 && topV[i - 1] < v) {
        topV[i] = topV[i - 1];
        topS[i] = topS[i - 1];
        i--;
      }
      topV[i] = v;
      topS[i] = s;
    }
    const r = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      r.set(topS[i].id, i + 1);
      byTeam.get(topS[i].id)!.push({ id: p.id, rank: i + 1 });
    }
    rank.set(p.id, r);
  }
  return { rank, byTeam };
}

/** A school's rank in his market, or past the kept list. */
const rankOf = (mk: Markets, id: string, team: string) => mk.rank.get(id)?.get(team) ?? R.board.drop + 1;

/** Where a school ranks in his market (1 = his favorite). */
export function marketRank(state: SeasonState, p: Prospect, team: string): number {
  const schools = recruitSchools(state);
  const v = recruitScore(state, schools.get(team)!, p);
  let rank = 1;
  for (const s of schools.values()) if (s.id !== team && inWindow(s, p) && recruitScore(state, s, p) > v) rank++;
  return rank;
}

export type RStanding = 'high' | 'list' | 'luke' | 'not';
export const RSTANDING_LABEL: Record<RStanding, string> = { high: 'RATES YOU HIGH', list: 'ON HIS LIST', luke: 'LUKEWARM', not: 'NOT INTERESTED' };

export function standingOf3(rank: number): RStanding {
  return rank <= 3 ? 'high' : rank <= 8 ? 'list' : rank <= 20 ? 'luke' : 'not';
}

/** His top schools: the ones working him (interest or an offer), best first. */
export function topSchools(state: SeasonState, p: Prospect, n = 3): string[] {
  const rs = state.recruiting!;
  const schools = recruitSchools(state);
  const set = new Set(Object.keys(rs.interest[p.id] ?? {}));
  for (const [t, ids] of Object.entries(rs.offers)) if (ids.includes(p.id)) set.add(t);
  return [...set].map((t) => ({ t, v: recruitScore(state, schools.get(t)!, p) })).sort((a, b) => b.v - a.v).slice(0, n).map((x) => x.t);
}

// ---------------------------------------------------------------- evaluation

const estCache = new Map<string, { lvl: number; pot: number }>();

/**
 * A staff's read of a prospect: his level and ceiling as its position coach sees them. A lasting `bias`
 * for a weak scout (a bad one can be confidently wrong), plus noise that shrinks with `effort` and a
 * pipeline in his state. Fixed draws per school and prospect, so a read sharpens instead of re-rolling.
 */
export function estimate(state: SeasonState, s: RSchool, p: Prospect, effort: number): { lvl: number; pot: number } {
  const g = groupOf(p.pos);
  // The pipeline sharpens the read, so it's in the key (it grows as signees join).
  const pipe = s.cpipe[g][p.a.hometown.state] ?? 0;
  const key = `${state.seed}:${s.id}:${p.id}:${effort}:${s.scout[g]}:${pipe}`;
  const hit = estCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(hashString(`est:${state.seed}:${s.id}:${p.id}`));
  const E = R.eval;
  const bias = gauss(rng) * E.bias * (1 - s.scout[g]);
  const sd = (E.noise / Math.sqrt(1 + effort / E.effort)) * (1 - R.pipe.eval * pipe);
  const z1 = gauss(rng);
  const z2 = gauss(rng);
  const out = { lvl: p.level + bias + z1 * sd, pot: p.a.potential + bias + (0.7 * z1 + 0.7 * z2) * sd };
  if (estCache.size > 200000) estCache.clear();
  estCache.set(key, out);
  return out;
}

/** What a CPU staff thinks he's worth: his level now plus some of the upside it sees. */
function value(state: SeasonState, s: RSchool, p: Prospect): number {
  const e = estimate(state, s, p, R.eval.cpuEffort);
  return e.lvl + 0.4 * (e.pot - e.lvl);
}

export interface Evaluation {
  ready: 'WILL PLAY EARLY' | 'NEEDS A YEAR' | 'DEVELOPMENTAL PROJECT';
  ceiling: 'SPECIAL' | 'ALL-CONFERENCE TALENT' | 'STARTER' | 'DEPTH PIECE';
  sure: 'HUNCH' | 'FAIRLY SURE' | 'CONVINCED';
  notes: string[];
}

/** Scouting notes by rating: what a coach says when it stands out, and when it lags. */
const NOTES: Partial<Record<RatingKey, [string, string]>> = {
  spd: ['TRUE SPEED', 'LACKS LONG SPEED'], acc: ['EXPLOSIVE FIRST STEP', 'SLOW OFF THE MARK'], str: ['STRONG AT THE POINT', 'NEEDS TO GET STRONGER'],
  elu: ['MAKES PEOPLE MISS', 'GOES DOWN EASY'], cth: ['NATURAL HANDS', 'RAW HANDS'], cit: ['WINS IN TRAFFIC', 'BODIED UP EASILY'],
  rte: ['POLISHED ROUTES', 'ROUNDS HIS BREAKS'], rls: ['QUICK RELEASE', 'STRUGGLES WITH PRESS'], arm: ['BIG ARM', 'ARM IS A QUESTION'],
  sac: ['ACCURATE SHORT', 'SPRAYS THE SHORT GAME'], mac: ['THROWS WITH TOUCH', 'INCONSISTENT MID-RANGE'], dac: ['DROPS IT IN DEEP', 'MISSES DEEP'],
  tup: ['THROWS ON THE MOVE', 'NEEDS A CLEAN POCKET'], pac: ['POISED UNDER PRESSURE', 'RATTLED BY PRESSURE'], pbk: ['SMOOTH PASS SETS', 'LEAKY IN PASS PRO'],
  rbk: ['MAULER IN THE RUN GAME', 'SOFT RUN BLOCKER'], tkl: ['SURE TACKLER', 'MISSES TACKLES'], rsh: ['BENDS THE EDGE', 'NO PASS RUSH PLAN'],
  bsh: ['SHEDS BLOCKS', 'GETS WASHED OUT'], mcv: ['STICKY IN MAN', 'GRABBY IN MAN'], zcv: ['READS ZONES WELL', 'LOST IN ZONE'],
  prs: ['PHYSICAL AT THE LINE', 'SOFT JAM'], prc: ['INSTINCTIVE', 'SLOW TO DIAGNOSE'], kpw: ['BIG LEG', 'SHORT LEG'], kac: ['ACCURATE', 'SCATTERSHOT'],
};

/**
 * The user's position coach's evaluation, in words only: when he'll play, his ceiling here, how sure
 * the coach is, and two notes. Nothing until the staff has spent time on him.
 */
export function evaluation(state: SeasonState, id: string): Evaluation | undefined {
  const rs = state.recruiting;
  const p = prospect(id);
  const effort = rs?.effort[id] ?? 0;
  if (!rs || !p || effort <= 0) return undefined;
  const user = state.config.userTeamId;
  const s = recruitSchools(state).get(user)!;
  const e = estimate(state, s, p, effort);
  const c = s.chart.get(p.pos) ?? [];
  const bar = c[STARTERS[p.pos] - 1] ?? 0;
  const ready = e.lvl >= bar - 3 ? 'WILL PLAY EARLY' : e.lvl >= bar - 10 ? 'NEEDS A YEAR' : 'DEVELOPMENTAL PROJECT';
  const target = s.aim.get(p.pos)! + 9;
  const ceiling = e.pot >= target + 10 ? 'SPECIAL' : e.pot >= target + 4 ? 'ALL-CONFERENCE TALENT' : e.pot >= target - 3 ? 'STARTER' : 'DEPTH PIECE';
  const sure = effort < 3 ? 'HUNCH' : effort < 8 ? 'FAIRLY SURE' : 'CONVINCED';
  // Notes: his ratings against his position's template at his level, read with the same noise.
  const rng = mulberry32(hashString(`notes:${state.seed}:${user}:${id}`));
  const sd = 5 / Math.sqrt(1 + effort / R.eval.effort);
  const keys = (Object.entries(OVR_WEIGHTS[p.pos]) as [RatingKey, number][]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
  const devs = keys.map((k) => ({ k, d: p.a.r[k] - templateValue(p.pos, k, p.level) + gauss(rng) * sd })).sort((a, b) => b.d - a.d);
  const notes: string[] = [];
  const best = devs[0];
  const worst = devs[devs.length - 1];
  if (best && NOTES[best.k]) notes.push(NOTES[best.k]![0]);
  if (worst && worst.d < -1 && NOTES[worst.k]) notes.push(NOTES[worst.k]![1]);
  return { ready, ceiling, sure, notes };
}

/** His wants the staff has learned: the top one after a couple of contacts, the top two after more. */
export function knownWants(state: SeasonState, id: string): Want[] {
  const p = prospect(id);
  const effort = state.recruiting?.effort[id] ?? 0;
  if (!p) return [];
  const n = effort >= 5 ? 2 : effort >= 2 ? 1 : 0;
  return [...WANTS].sort((a, b) => p.m.wants[b] - p.m.wants[a]).slice(0, n);
}

// ---------------------------------------------------------------- state

/** The cycle's class: the one that enrolls next season. */
export function recruitClass(state: SeasonState): Prospect[] {
  const rs = state.recruiting;
  return rs ? recruitPool(rs.cls, rs.salt).list : [];
}

const userTeam = (state: SeasonState) => state.config.userTeamId;
/** The summer runs every staff, the user's included. */
let summerAll = false;
const auto = (state: SeasonState, team: string) => summerAll || team !== userTeam(state) || !!state.config.delegate.recruiting;

function addInterest(rs: RecruitingState, id: string, team: string, x: number): void {
  const m = (rs.interest[id] ??= {});
  const now = m[team] ?? 0;
  // Saturates toward `cap`; a negative visit can push it under zero.
  const next = x > 0 ? now + x * Math.max(0, 1 - now / R.cap) : now + x;
  m[team] = Math.round(next * 100) / 100;
}

const open = (rs: RecruitingState, id: string) => !rs.signed[id] && !rs.gone?.includes(id);

/** Room left in a school's class for another commit. */
export function classRoom(state: SeasonState, team: string): number {
  const s = recruitSchools(state).get(team)!;
  return s.target + (s.late ? 0 : R.overCommit) - s.commits;
}

const news = (state: SeasonState, text: string, teams: string[]): NewsItem => ({ week: state.phase === 'offseason' ? state.week : state.week, kind: 'recruiting', text, teams });

const starText = (n: number) => '*'.repeat(n);

/** "4* QB Jalen Smith (Atlanta, GA)". */
export function recruitLabel(p: Prospect): string {
  return `${starText(p.stars)} ${p.pos} ${athleteName(p.a)} (${p.a.hometown.city}, ${p.a.hometown.state})`;
}

// ---------------------------------------------------------------- the cycle

/**
 * The season opens its cycle for next year's class: every staff builds a board, then a summer of
 * contacts, official visits and offers (`commit.summer` rounds) in which early deciders commit.
 */
export function openRecruiting(state: SeasonState): void {
  state.recruiting = {
    cls: state.year + 1, salt: recruitSalt(state.seed), interest: {}, offers: {}, commits: {}, signed: {}, boards: {}, top: [],
    effort: {}, visits: {}, ov: {}, homes: {}, vibe: {}, log: [],
  };
  summerAll = true;
  try {
    refreshBoards(state);
    for (let round = 0; round < R.commit.summer; round++) {
      contacts(state, `summer${round}`);
      for (const t of TEAMS) summerVisits(state, t.id, round);
      const mk = round % 2 === 1 ? refreshBoards(state) : buildMarkets(state, recruitSchools(state));
      offers(state, mk, true);
      decide(state, 0, `summer${round}`);
    }
  } finally {
    summerAll = false;
  }
  const user = userTeam(state);
  const mine = Object.values(state.recruiting.commits).filter((t) => t === user).length;
  state.news.push({ ...news(state, `RECRUITING: You open the ${state.year + 1} cycle with ${mine} commit${mine === 1 ? '' : 's'}${state.config.delegate.recruiting ? '' : ' (R on the hub; F there hands it to your staff)'}`, [user]), week: 0 });
}

/** Every staff (re)builds its board; returns the markets it read. */
function refreshBoards(state: SeasonState): Markets {
  const schools = recruitSchools(state);
  const mk = buildMarkets(state, schools);
  for (const t of TEAMS) buildBoard(state, schools, mk, t.id, true);
  return mk;
}

/**
 * A school's staff (re)builds its board for each position it still needs: prospects its board reaches,
 * where it ranks well enough among the schools that would take him, by its own read of them. Prospects
 * gone elsewhere or out of reach come off (the user's board is only cleaned, unless delegated).
 */
function buildBoard(state: SeasonState, schools: Map<string, RSchool>, mk: Markets, team: string, fill: boolean): void {
  const rs = state.recruiting!;
  const board = rs.boards[team] ?? [];
  rs.boards[team] = board.filter((id) => {
    if (!open(rs, id)) return false;
    if (rs.commits[id] === team || !auto(state, team)) return true;
    // Committed elsewhere: worth keeping only as a real flip chance.
    return rankOf(mk, id, team) <= (rs.commits[id] ? R.board.flip : R.board.drop);
  });
  if (fill && auto(state, team)) staffFillBoard(state, schools, mk, team);
}

/** Fill the board's open slots the way the staff would: by position need, best reads first among prospects who'd have it. */
function staffFillBoard(state: SeasonState, schools: Map<string, RSchool>, mk: Markets, team: string): void {
  const rs = state.recruiting!;
  const s = schools.get(team)!;
  const board = (rs.boards[team] ??= []);
  const on = new Set(board);
  const byPos = new Map<Position, number>();
  for (const id of board) {
    if (rs.commits[id] && rs.commits[id] !== team) continue;
    const p = prospect(id)!;
    byPos.set(p.pos, (byPos.get(p.pos) ?? 0) + 1);
  }
  // Prospects who rank it within `board.rank` first; a board still short reaches to the rest of his market.
  const cands = new Map<Position, { p: Prospect; v: number; far: boolean }[]>();
  for (const { id, rank } of mk.byTeam.get(team) ?? []) {
    const p = prospect(id)!;
    if (on.has(p.id) || (rs.commits[p.id] && rs.commits[p.id] !== team)) continue;
    let x = cands.get(p.pos);
    if (!x) cands.set(p.pos, (x = []));
    x.push({ p, v: value(state, s, p), far: rank > R.board.rank });
  }
  for (const pos of POSITIONS) {
    const want = Math.ceil((s.need.get(pos) ?? 0) * R.board.mult);
    let have = byPos.get(pos) ?? 0;
    for (const c of (cands.get(pos) ?? []).sort((a, b) => Number(a.far) - Number(b.far) || b.v - a.v)) {
      if (have >= want) break;
      board.push(c.p.id);
      have++;
    }
  }
}

/**
 * Contacts: each position coach works his part of the board, top targets first, then offers he's
 * waiting on, then the best reads. Interest grows with his recruit, the school's appeal and pipelines;
 * every contact sharpens the user's evaluation. Interest a school isn't working fades.
 */
function contacts(state: SeasonState, tag: string | number): void {
  const rs = state.recruiting!;
  const schools = recruitSchools(state);
  const user = userTeam(state);
  const touched = new Set<string>();
  for (const t of TEAMS) {
    const s = schools.get(t.id)!;
    const board = rs.boards[t.id] ?? [];
    const offered = new Set(rs.offers[t.id] ?? []);
    const top = t.id === user ? new Set(rs.top) : new Set<string>();
    for (const g of GROUPS) {
      const list = board
        .map((id) => prospect(id)!)
        .filter((p) => groupOf(p.pos) === g && open(rs, p.id))
        .map((p) => ({ p, pri: (top.has(p.id) ? 3 : 0) + (offered.has(p.id) && rs.commits[p.id] !== t.id ? 2 : 0) + (rs.commits[p.id] === t.id ? 1 : 0), v: p.comp }))
        .sort((a, b) => b.pri - a.pri || b.v - a.v)
        .slice(0, R.contacts);
      const rng = seasonRng(state, 'recruit', 'contact', tag, t.id, g);
      for (const { p } of list) {
        const st = p.a.hometown.state;
        const pipe = 1 + R.pipe.coach * (s.cpipe[g][st] ?? 0) + R.pipe.program * (s.pipe[st] ?? 0);
        const ap = recruitAppeal(s, p);
        const elsewhere = rs.commits[p.id] && rs.commits[p.id] !== t.id ? 0.5 : 1;
        addInterest(rs, p.id, t.id, R.contact * (0.5 + s.coach[g]) * (0.5 + ap) * (0.75 + 0.5 * rng()) * pipe * elsewhere);
        touched.add(`${p.id}:${t.id}`);
        if (t.id === user) rs.effort[p.id] = (rs.effort[p.id] ?? 0) + 1;
      }
    }
  }
  for (const [id, m] of Object.entries(rs.interest)) {
    for (const [t, v] of Object.entries(m)) {
      if (touched.has(`${id}:${t}`) || v <= 0) continue;
      const next = Math.round(v * (1 - R.decay) * 100) / 100;
      if (next < 0.02) delete m[t];
      else m[t] = next;
    }
  }
}

/** Summer official visits: no game, just the campus (a brand's atmosphere). */
function summerVisits(state: SeasonState, team: string, round: number): void {
  const s = recruitSchools(state).get(team)!;
  const rng = seasonRng(state, 'recruit', 'summer-visit', round, team);
  const atm = R.visit.atm + 0.4 * (teamById(team).profile.prestige / 100);
  for (const p of visitorsFor(state, team, Math.ceil(R.visit.n / 2))) visitOn(state, s, p, atm + gauss(rng) * R.visit.vibe);
}

/** The best prospects a staff would bring in: on its board, not its commits, with visits left and not here before. */
function visitorsFor(state: SeasonState, team: string, n: number): Prospect[] {
  const rs = state.recruiting!;
  const s = recruitSchools(state).get(team)!;
  return (rs.boards[team] ?? [])
    .map((id) => prospect(id)!)
    .filter((p) => open(rs, p.id) && rs.commits[p.id] !== team && (rs.ov[p.id]?.length ?? 0) < R.visit.max && !rs.ov[p.id]?.includes(team))
    .map((p) => ({ p, v: value(state, s, p) + ((rs.offers[team] ?? []).includes(p.id) ? 5 : 0) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.p);
}

/** One official visit: interest scaled by appeal, by how the day went (`mood`) and how much it moves him. */
function visitOn(state: SeasonState, s: RSchool, p: Prospect, mood: number): number {
  const rs = state.recruiting!;
  (rs.ov[p.id] ??= []).push(s.id);
  const swing = 1 + (mood - 1) * p.m.spotlight;
  addInterest(rs, p.id, s.id, R.visit.gain * (0.5 + recruitAppeal(s, p)) * swing);
  if (s.id === userTeam(state)) {
    rs.effort[p.id] = (rs.effort[p.id] ?? 0) + 2;
    rs.vibe[p.id] = round3(clamp(swing - 1, -1, 1));
  }
  return swing;
}

/** How a game day went for the home team's visitors: the atmosphere, then the result. */
function gameMood(state: SeasonState, g: SeasonGame, rng: () => number): number {
  const V = R.visit;
  const res = g.result!;
  const margin = res.home - res.away;
  const ap = latestPoll(state, 'ap');
  const ranked = rankIn(ap, g.away) > 0;
  let m = V.atm + 0.4 * (teamById(g.home).profile.prestige / 100);
  if (margin > 0) m += V.won + V.margin * Math.min(1, margin / 21) + (ranked ? V.ranked : 0) + (g.name ? V.rivalry : 0);
  else m += V.lost + V.blowout * Math.min(1, -margin / 21) + (-margin <= 7 && ranked ? V.close : 0);
  return m + gauss(rng) * V.vibe;
}

/** This week's home games host their official visitors: the user's picks, and the staffs' for everyone else. */
function gameVisits(state: SeasonState, week: number): void {
  const rs = state.recruiting!;
  const schools = recruitSchools(state);
  const user = userTeam(state);
  for (const g of state.games) {
    if (g.week !== week || !g.result || g.neutral || g.kind === 'bowl' || g.kind === 'cfp') continue;
    const list = auto(state, g.home) ? visitorsFor(state, g.home, R.visit.n).map((p) => p.id) : (rs.visits[g.id] ?? []);
    rs.visits[g.id] = list;
    const rng = seasonRng(state, 'recruit', 'visit', g.id);
    const s = schools.get(g.home)!;
    for (const id of list) {
      const p = prospect(id)!;
      if (!open(rs, id) || rs.ov[id]?.includes(g.home)) continue;
      const swing = visitOn(state, s, p, gameMood(state, g, rng));
      if (g.home === user) {
        const word = swing >= 1.25 ? 'LOVED IT' : swing >= 0.95 ? 'LIKED IT' : swing >= 0.6 ? 'LUKEWARM' : 'LEFT COLD';
        state.news.push(news(state, `VISIT: ${recruitLabel(p)} ${word}`, [user]));
      }
    }
  }
}

/**
 * Offers: a CPU staff (and a delegated user's) offers board prospects it ranks high with, best reads
 * first, within its offer budget and a few a position; a full class takes its offers back.
 */
function offers(state: SeasonState, mk: Markets, summer: boolean): void {
  const rs = state.recruiting!;
  const schools = recruitSchools(state);
  for (const t of TEAMS) {
    if (!auto(state, t.id)) continue;
    const s = schools.get(t.id)!;
    const mine = (rs.offers[t.id] ??= []).filter((id) => open(rs, id) && (!rs.commits[id] || rs.commits[id] === t.id || !summer));
    rs.offers[t.id] = mine;
    if (s.target + (s.late ? 0 : R.overCommit) - s.commits <= 0) {
      rs.offers[t.id] = mine.filter((id) => rs.commits[id] === t.id);
      continue;
    }
    // Offers to prospects committed elsewhere stand (a flip is possible) but don't count against the budget.
    const live = (id: string) => !rs.commits[id] || rs.commits[id] === t.id;
    // Behind pace (commits against the share of the class a staff expects by now), it offers more.
    const pace = Math.max(0, Math.round(R.pace(state.week, summer) * s.target) - s.commits);
    const cap = Math.ceil(s.target * R.offerMult) + R.paceOffers * pace;
    let n = mine.filter(live).length;
    if (n >= cap) continue;
    const byPos = new Map<Position, number>();
    for (const id of mine) if (live(id)) byPos.set(prospect(id)!.pos, (byPos.get(prospect(id)!.pos) ?? 0) + 1);
    const cands = (rs.boards[t.id] ?? [])
      .filter((id) => !mine.includes(id) && open(rs, id) && rs.commits[id] !== t.id)
      .map((id) => prospect(id)!)
      .map((p) => ({ p, v: value(state, s, p) }))
      .sort((a, b) => b.v - a.v);
    for (const { p } of cands) {
      if (n >= cap) break;
      const k = byPos.get(p.pos) ?? 0;
      if (k >= Math.ceil((s.need.get(p.pos) ?? 0) * R.offerMult) + 1) continue;
      if (rankOf(mk, p.id, t.id) > R.offerRank) continue;
      makeOffer(state, s, p);
      byPos.set(p.pos, k + 1);
      if (live(p.id)) n++;
    }
  }
}

function makeOffer(state: SeasonState, s: RSchool, p: Prospect): void {
  const rs = state.recruiting!;
  (rs.offers[s.id] ??= []).push(p.id);
  addInterest(rs, p.id, s.id, R.offer * s.head);
}

/**
 * The lead he needs over his next choice to commit: higher in the summer, falling through the season
 * and with each official visit he's taken, none after the regular season or on signing day.
 */
function commitBar(week: number, visits: number, final: boolean): number {
  if (final || week > CALENDAR.champWeek) return -Infinity;
  const [a, b] = R.commit.bar;
  return a + (b - a) * clamp(week / 14, 0, 1) - R.commit.perVisit * visits;
}

/** His timeline lets him decide now. */
function due(p: Prospect, week: number, summer: boolean): boolean {
  if (p.m.timeline === 'early') return true;
  if (summer) return false;
  return p.m.timeline === 'normal' ? week >= p.m.week : week > CALENDAR.champWeek;
}

/** Every school working him, scored: offers (that have room) and interest, best first. */
function suitors(state: SeasonState, schools: Map<string, RSchool>, p: Prospect, offered: Map<string, string[]>): { team: string; v: number; offer: boolean }[] {
  const rs = state.recruiting!;
  const set = new Map<string, boolean>();
  for (const [t, v] of Object.entries(rs.interest[p.id] ?? {})) if (v >= R.commit.interest) set.set(t, false);
  for (const t of offered.get(p.id) ?? []) set.set(t, true);
  return [...set].map(([t, offer]) => ({ team: t, v: recruitScore(state, schools.get(t)!, p), offer })).sort((a, b) => b.v - a.v);
}

/** Schools with an open offer, by prospect. */
function offerIndex(rs: RecruitingState): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [t, ids] of Object.entries(rs.offers)) {
    for (const id of ids) {
      let x = out.get(id);
      if (!x) out.set(id, (x = []));
      x.push(t);
    }
  }
  return out;
}

/** He commits: on the school's chart and in its class, in the log and the news. */
function commitTo(state: SeasonState, p: Prospect, team: string, from?: string): void {
  const rs = state.recruiting!;
  rs.commits[p.id] = team;
  const s = recruitSchools(state).get(team)!;
  s.commits++;
  s.need.set(p.pos, Math.max(0, (s.need.get(p.pos) ?? 0) - 1));
  const c = s.chart.get(p.pos) ?? [];
  c.push(p.pub);
  c.sort((x, y) => y - x);
  s.chart.set(p.pos, c);
  setBar(s, p.pos);
  rs.log.push({ week: state.week, id: p.id, team, kind: 'commit', ...(from ? { from } : {}) });
  const user = userTeam(state);
  if (team === user || from === user) {
    const verb = from ? `flips from ${teamById(from).school} to ${teamById(team).school}` : `commits to ${teamById(team).school}`;
    state.news.push(news(state, `COMMIT: ${recruitLabel(p)} ${verb}`, [team]));
  } else if (p.rank <= 25) {
    state.news.push(news(state, `COMMIT: No. ${p.rank} ${recruitLabel(p)} ${from ? `flips to ${teamById(team).school}` : `commits to ${teamById(team).school}`}`, [team]));
  }
}

/** He opens his recruitment back up. */
function decommit(state: SeasonState, p: Prospect, why: string): void {
  const rs = state.recruiting!;
  const team = rs.commits[p.id];
  delete rs.commits[p.id];
  const s = recruitSchools(state).get(team)!;
  s.commits--;
  s.need.set(p.pos, (s.need.get(p.pos) ?? 0) + 1);
  const c = s.chart.get(p.pos) ?? [];
  const i = c.indexOf(p.pub);
  if (i >= 0) c.splice(i, 1);
  setBar(s, p.pos);
  rs.log.push({ week: state.week, id: p.id, team, kind: 'decommit' });
  if (team === userTeam(state)) state.news.push(news(state, `DECOMMIT: ${recruitLabel(p)} reopens his recruitment${why}`, [team]));
}

/**
 * Commits a school's roster keeps a spot for through the portal: committed, not on the roster yet,
 * within the class it planned at the early period (`RecruitingState.plan`). Over-commits past the plan
 * don't hold one; signing day lets them go if the roster has filled. The portal counts these against
 * its room (season/portal.ts).
 */
export function heldSpots(state: SeasonState, team: string): number {
  const rs = state.recruiting;
  if (!rs || rs.gone) return 0;
  const { open, joined } = commitsOf(state, team);
  const plan = rs.plan?.[team];
  return plan === undefined ? open : Math.min(open, Math.max(0, plan - joined));
}

/** A school's commits: still to join, and on the roster already (the early signees). */
export function commitsOf(state: SeasonState, team: string): { open: number; joined: number } {
  const rs = state.recruiting;
  const have = new Set((state.teamState[team]?.roster?.in ?? []).map((x) => x.id));
  let open = 0;
  let joined = 0;
  for (const [id, t] of Object.entries(rs?.commits ?? {})) if (t === team) have.has(id) ? joined++ : open++;
  return { open, joined };
}

/** The user's commits not signed yet: the ones he can release to make room for a transfer. */
export function releasable(state: SeasonState): string[] {
  const rs = state.recruiting;
  if (!rs || rs.gone) return [];
  const u = userTeam(state);
  return Object.entries(rs.commits).filter(([id, t]) => t === u && !rs.signed[id]).map(([id]) => id).sort((a, b) => prospect(a)!.rank - prospect(b)!.rank);
}

/**
 * The user lets a commit go to free his spot for a transfer: he reopens his recruitment, his interest in
 * the school falls (`release.interest`), the program's pipeline in his state takes a hit
 * (`release.pipe`), and the spot joins the class's hold for the portal. Signed commits are binding.
 */
export function releaseCommit(state: SeasonState, id: string): boolean {
  const rs = state.recruiting;
  const p = prospect(id);
  const u = userTeam(state);
  if (!rs || !p || rs.commits[id] !== u || rs.signed[id] || rs.gone) return false;
  dropSchools(state);
  decommit(state, p, ': released to make room');
  const m = (rs.interest[id] ??= {});
  m[u] = Math.round((m[u] ?? 0) * R.release.interest * 100) / 100;
  rs.offers[u] = (rs.offers[u] ?? []).filter((x) => x !== id);
  const ts = (state.teamState[u] ??= {});
  const st = p.a.hometown.state;
  if (ts.pipe?.[st]) ts.pipe[st] = round3(Math.max(0, ts.pipe[st] - R.release.pipe));
  (rs.hold ??= {})[u] = clamp(portalHold(state, u) + 1, 0, R.holdMax);
  dropSchools(state);
  return true;
}

/** How a school's week went for its commits' nerves: a blowout loss, a losing streak, falling out of the poll. */
function slump(state: SeasonState, team: string, week: number): number {
  const D = R.decommit;
  const games = state.games.filter((g) => g.result && g.week <= week && (g.home === team || g.away === team)).sort((a, b) => a.week - b.week);
  const last = games.at(-1);
  if (!last || last.week !== week) return 0;
  const lost = (g: SeasonGame) => (g.home === team ? g.result!.home < g.result!.away : g.result!.away < g.result!.home);
  const margin = (g: SeasonGame) => Math.abs(g.result!.home - g.result!.away);
  let x = 0;
  if (lost(last) && margin(last) >= 17) x += D.blowout;
  if (games.length >= 3 && games.slice(-3).every(lost)) x += D.streak;
  const polls = state.polls.filter((p) => p.kind === 'ap');
  const prev = polls.at(-2);
  if (prev && rankIn(prev, team) > 0 && rankIn(polls.at(-1), team) === 0) x += D.unranked;
  return x;
}

/**
 * Decisions: commits weigh decommitting (a rival's lead, his firmness, a bad week for his school, a
 * better commit at his position), then everyone due and open picks his best offer if it leads his next
 * choice by the week's bar. A decommit can flip the same week.
 */
function decide(state: SeasonState, week: number, tag: string | number, final = false): void {
  const rs = state.recruiting!;
  const schools = recruitSchools(state);
  const summer = typeof tag === 'string' && tag.startsWith('summer');
  const D = R.decommit;
  const offered = offerIndex(rs);
  const slumps = new Map<string, number>();
  if (!summer && !final) for (const t of TEAMS) slumps.set(t.id, slump(state, t.id, week));
  for (const p of recruitClass(state)) {
    if (!open(rs, p.id)) continue;
    const rng = seasonRng(state, 'recruit', 'decide', tag, p.id);
    const cur = rs.commits[p.id];
    const sui = suitors(state, schools, p, offered);
    let flipFrom: string | undefined;
    if (cur) {
      if (final) continue;
      const own = sui.find((x) => x.team === cur)?.v ?? recruitScore(state, schools.get(cur)!, p);
      const rival = sui.find((x) => x.team !== cur && x.offer);
      const gap = rival ? Math.max(0, rival.v - own) : 0;
      const s = schools.get(cur)!;
      const chart = s.chart.get(p.pos) ?? [];
      const crowd = chart.filter((x) => x > p.pub + 3).length >= STARTERS[p.pos] * 2 ? D.crowd : 0;
      const logit = D.base + D.gap * gap + D.firm * (p.m.firm - 1) + (slumps.get(cur) ?? 0) + crowd;
      if (rng() >= sigmoid(logit)) continue;
      decommit(state, p, slumps.get(cur) ? ' after a rough stretch' : '');
      flipFrom = cur;
    }
    if (!final && !due(p, week, summer)) continue;
    const options = sui.filter((x) => x.offer && x.team !== flipFrom && classRoom(state, x.team) > 0);
    if (!options.length) continue;
    const best = options[0];
    const next = sui.find((x) => x.team !== best.team && x.team !== flipFrom);
    const lead = best.v - (next?.v ?? 0);
    if (lead < commitBar(week, rs.ov[p.id]?.length ?? 0, final)) continue;
    if (!final && !flipFrom && rng() >= R.commit.odds) continue;
    commitTo(state, p, best.team, flipFrom);
  }
}

/** One regular-season or postseason week of recruiting, after the week's results. */
export function recruitWeek(state: SeasonState, week: number): void {
  const rs = state.recruiting;
  if (!rs) return;
  dropSchools(state);
  const dead = state.phase === 'postseason' || week > CALENDAR.champWeek;
  if (!dead) gameVisits(state, week);
  contacts(state, week);
  const mk = R.board.refresh.includes(week) ? refreshBoards(state) : buildMarkets(state, recruitSchools(state));
  if (week >= CALENDAR.champWeek) for (const t of TEAMS) if (auto(state, t.id)) autoInHomes(state, t.id, R.inHome.cpu / 2);
  offers(state, mk, false);
  decide(state, week, week);
  if (week === CALENDAR.champWeek) earlySigning(state);
}

/**
 * The early signing period, at the end of championship week: commits sign (binding) by their
 * firmness; late deciders mostly wait for signing day. A school signs at most its class (`target`):
 * its over-commits stay verbal, holding a spot through the portal.
 */
export function earlySigning(state: SeasonState): void {
  const rs = state.recruiting!;
  const E = R.early;
  const schools = recruitSchools(state);
  rs.plan = Object.fromEntries(TEAMS.map((t) => [t.id, schools.get(t.id)!.target]));
  const room = new Map<string, number>();
  for (const [id, team] of Object.entries(rs.commits)) if (rs.signed[id]) room.set(team, (room.get(team) ?? 0) + 1);
  let n = 0;
  const order = Object.entries(rs.commits).sort((a, b) => prospect(a[0])!.rank - prospect(b[0])!.rank);
  for (const [id, team] of order) {
    if (rs.signed[id]) continue;
    if ((room.get(team) ?? 0) >= schools.get(team)!.target) continue;
    const p = prospect(id)!;
    const odds = sigmoid(E.base + E.firm * (p.m.firm - 1)) * (p.m.timeline === 'late' ? E.late : 1);
    if (seasonRng(state, 'recruit', 'early', id)() >= odds) continue;
    rs.signed[id] = team;
    rs.log.push({ week: state.week, id, team, kind: 'sign' });
    room.set(team, (room.get(team) ?? 0) + 1);
    n++;
  }
  const user = userTeam(state);
  const mine = Object.values(rs.signed).filter((t) => t === user).length;
  const rank = classRanks(state).findIndex((r) => r.team === user) + 1;
  state.news.push(news(state, `EARLY SIGNING: ${n} prospects sign. Your class: ${mine} signed, No. ${rank} nationally`, [user]));
}

/** A head coach's in-home visit: a big boost, scaled by his recruit. Limited per school (`inHome.n`). */
export function inHome(state: SeasonState, team: string, id: string): boolean {
  const rs = state.recruiting;
  const p = prospect(id);
  if (!rs || !p || !open(rs, id)) return false;
  const mine = (rs.homes[team] ??= []);
  if (mine.includes(id) || mine.length >= R.inHome.n || !inHomeOpen(state)) return false;
  mine.push(id);
  const s = recruitSchools(state).get(team)!;
  const r = seasonRng(state, 'recruit', 'inhome', team, id)();
  addInterest(rs, id, team, R.inHome.gain * (0.5 + recruitAppeal(s, p)) * (0.75 + 0.5 * r) * s.head);
  if (team === userTeam(state)) rs.effort[id] = (rs.effort[id] ?? 0) + 3;
  return true;
}

/** In-home visits open after the regular season (championship week on) and through signing day. */
export function inHomeOpen(state: SeasonState): boolean {
  return state.phase === 'offseason' ? state.offseason?.stage !== 'portal' : state.week >= CALENDAR.champWeek;
}

/** A staff's in-homes: its best offered targets not yet committed to it. */
function autoInHomes(state: SeasonState, team: string, n: number): void {
  const rs = state.recruiting!;
  const s = recruitSchools(state).get(team)!;
  const done = rs.homes[team]?.length ?? 0;
  const left = Math.min(n, R.inHome.n - done);
  if (left <= 0) return;
  const targets = (rs.offers[team] ?? [])
    .map((id) => prospect(id)!)
    .filter((p) => open(rs, p.id) && rs.commits[p.id] !== team && !rs.homes[team]?.includes(p.id))
    .sort((a, b) => value(state, s, b) - value(state, s, a))
    .slice(0, left);
  for (const p of targets) inHome(state, team, p.id);
}

// ---------------------------------------------------------------- offseason

/**
 * The carousel's departures reach recruits: a commit (not yet signed) whose head coach or position
 * coach left rolls on decommitting, and the coach's new school picks up interest with him.
 */
export function recruitsReact(state: SeasonState): void {
  const rs = state.recruiting;
  const was = state.carousel?.was;
  if (!rs || !was) return;
  const now = new Map<string, string>();
  for (const t of TEAMS) {
    const staff = staffFor(state, t.id);
    for (const g of GROUPS) now.set(staff[g].id, `${t.id}:${g}`);
    now.set(headCoachFor(state, t.id).id, `${t.id}:HC`);
  }
  dropSchools(state);
  for (const [id, team] of Object.entries(rs.commits)) {
    if (rs.signed[id]) continue;
    const p = prospect(id)!;
    const g = groupOf(p.pos);
    for (const role of ['HC', g] as const) {
      const coach = was[`${team}:${role}`];
      if (!coach || now.get(coach) === `${team}:${role}`) continue;
      const to = now.get(coach)?.split(':')[0];
      const bond = role === 'HC' ? 0.6 : clamp((rs.interest[id]?.[team] ?? 0) / R.cap, 0.2, 1);
      if (to && to !== team) addInterest(rs, id, to, bond * 0.4);
      const logit = R.decommit.base + R.decommit.coachLeft * bond + R.decommit.firm * (p.m.firm - 1) + 2;
      if (rs.commits[id] && seasonRng(state, 'recruit', 'react', id, role)() < sigmoid(logit)) {
        decommit(state, p, role === 'HC' ? ' after the coaching change' : ' after his recruiter left');
      }
    }
  }
}

/** The signing stage opens: the CPU staffs make their last in-homes. */
export function openSigning(state: SeasonState): void {
  if (!state.recruiting) return;
  dropSchools(state);
  for (const t of TEAMS) if (auto(state, t.id)) autoInHomes(state, t.id, R.inHome.n);
}

/**
 * National signing day, after the portal: staffs with room under the cap make last offers to whoever's
 * left, everyone open decides (no bar: his best offer with room), every commit signs, and the unsigned
 * go to FCS or JUCO. The signees join their rosters as freshmen. A school whose commits no longer fit
 * (its roster filled since) lets its lowest go first.
 */
export function runSigningDay(state: SeasonState): void {
  const rs = state.recruiting;
  if (!rs) return;
  joinRosters(state);
  dropSchools(state);
  let schools = recruitSchools(state);
  let cut = false;
  for (const t of TEAMS) {
    const s = schools.get(t.id)!;
    if (s.commits <= s.target) continue;
    const mine = Object.entries(rs.commits).filter(([id, team]) => team === t.id && !rs.signed[id]).map(([id]) => prospect(id)!).sort((a, b) => b.rank - a.rank);
    for (const p of mine.slice(0, s.commits - s.target)) {
      decommit(state, p, ': the roster had no room left');
      cut = true;
    }
  }
  if (cut) {
    dropSchools(state);
    schools = recruitSchools(state);
  }
  // Last offers in rounds: open prospects a staff's board reaches who rank it in their top schools,
  // until its room under the cap is filled or `signingRounds` run out.
  for (let round = 0; round < R.signingRounds; round++) {
    if (round) schools = recruitSchools(state);
    const left = recruitClass(state).filter((p) => open(rs, p.id) && !rs.commits[p.id]);
    let offered = 0;
    for (const t of TEAMS) {
      if (!auto(state, t.id)) continue;
      const s = schools.get(t.id)!;
      const room = s.target - s.commits;
      if (room <= 0) continue;
      // Positions it still needs first, then anyone its board would reach (or nearly).
      const mine = new Set(rs.offers[t.id] ?? []);
      const cands = left
        .filter((p) => !mine.has(p.id) && p.pub >= s.floor[POS_IX.get(p.pos)!] - R.aimBelow * 2)
        .map((p) => ({ p, v: value(state, s, p) + ((s.need.get(p.pos) ?? 0) > 0.3 ? 10 : 0) }))
        .sort((a, b) => b.v - a.v)
        .slice(0, Math.ceil(room * R.signingOffers));
      for (const { p } of cands) makeOffer(state, s, p);
      offered += cands.length;
    }
    decide(state, CALENDAR.champWeek + 1, round ? `signing${round}` : 'signing', true);
    if (!offered) break;
  }
  const user = userTeam(state);
  for (const [id, team] of Object.entries(rs.commits)) {
    if (rs.signed[id]) continue;
    rs.signed[id] = team;
    rs.log.push({ week: state.week, id, team, kind: 'sign' });
  }
  rs.gone = recruitClass(state).filter((p) => !rs.signed[p.id]).map((p) => p.id);
  joinRosters(state);
  const ranks = classRanks(state);
  const mine = ranks.findIndex((r) => r.team === user) + 1;
  const n = Object.values(rs.signed).filter((t) => t === user).length;
  state.news.push(news(state, `SIGNING DAY: ${teamById(ranks[0].team).school} signs the No. 1 class. Yours: ${n} signees, No. ${mine}`, [ranks[0].team, user]));
}

/**
 * The signees join their rosters as freshmen (they enroll next season, so they don't grow this
 * offseason), with a career line. Programs' and recruiters' pipelines grow with each state they signed from.
 * Runs when the portal opens (the early signees, so the portal reads them on the chart) and on signing
 * day (the rest); a signee already on his roster is skipped.
 */
export function joinRosters(state: SeasonState): void {
  if (!state.recruiting) return;
  const rs = state.recruiting!;
  const fade = !rs.joined;
  rs.joined = true;
  const by = new Map<string, Prospect[]>();
  for (const [id, team] of Object.entries(rs.signed)) {
    const p = prospect(id)!;
    let x = by.get(team);
    if (!x) by.set(team, (x = []));
    x.push(p);
  }
  for (const t of TEAMS) {
    const ts = (state.teamState[t.id] ??= {});
    const have = new Set((ts.roster?.in ?? []).map((x) => x.id));
    const signees = (by.get(t.id) ?? []).filter((p) => !have.has(p.id)).sort((a, b) => a.rank - b.rank);
    if (!signees.length && !fade) continue;
    // Pipelines: the program's fade a little each year (at the first join) and grow with each signee from a state.
    const pipe: Record<string, number> = {};
    for (const [st, v] of Object.entries(ts.pipe ?? {})) if (!fade) pipe[st] = v;
    else if (v * R.pipe.decay >= 0.02) pipe[st] = round3(v * R.pipe.decay);
    const staff = staffFor(state, t.id);
    const taken: { num: number; pos: Position }[] = [...baseRoster(state, t.id)];
    const r = (ts.roster ??= {});
    for (const p of signees) {
      const st = p.a.hometown.state;
      pipe[st] = round3(Math.min(1, (pipe[st] ?? 0) + R.pipe.grow));
      const coach = staff[groupOf(p.pos)].id;
      const cp = ((state.coaches ??= {})[coach] ??= {});
      (cp.pipe ??= {})[st] = round3(Math.min(1, (cp.pipe[st] ?? 0) + R.pipe.grow / 2));
      // Five-stars choose first among the class's numbers; his high school number if it's free.
      const num = pickJersey(seasonRng(state, 'recruit', 'num', p.id), p.pos, taken, { prestige: (p.stars - 1) / 4, want: p.a.num });
      taken.push({ num, pos: p.pos });
      (r.in ??= []).push({ id: p.id, num });
      (ts.mo ??= {})[p.id] = round3(temperament(p.a).base);
      tell(state, p.id, { team: t.id, kind: 'signed', text: `Signs with ${t.school} as a ${p.stars}-star ${p.pos} from ${p.a.hometown.city}, ${p.a.hometown.state}` });
    }
    if (Object.keys(pipe).length) ts.pipe = pipe;
    delete ts.depth;
  }
}

// ---------------------------------------------------------------- classes

/** Points a commit adds to a class by stars (the class rank sums them, each later one counting less). */
const STAR_POINTS: Record<number, number> = { 5: 100, 4: 60, 3: 30, 2: 12, 1: 5 };

/** Every school's class (commits and signees), ranked by its star points. */
export function classRanks(state: SeasonState): { team: string; n: number; pts: number; stars: number[] }[] {
  const rs = state.recruiting;
  const by = new Map<string, Prospect[]>();
  for (const [id, t] of Object.entries(rs?.commits ?? {})) {
    const p = prospect(id)!;
    let x = by.get(t);
    if (!x) by.set(t, (x = []));
    x.push(p);
  }
  return TEAMS.map((t) => {
    const ps = (by.get(t.id) ?? []).sort((a, b) => a.rank - b.rank);
    const stars = [0, 0, 0, 0, 0, 0];
    let pts = 0;
    ps.forEach((p, i) => {
      stars[p.stars]++;
      pts += STAR_POINTS[p.stars] * 0.94 ** i;
    });
    return { team: t.id, n: ps.length, pts: Math.round(pts), stars };
  }).sort((a, b) => b.pts - a.pts);
}

// ---------------------------------------------------------------- the user's side

/** Add a prospect to the user's board (the position coach of his group works it). */
export function addToBoard(state: SeasonState, id: string): boolean {
  const rs = state.recruiting;
  if (!rs || !prospect(id) || !open(rs, id)) return false;
  const board = (rs.boards[userTeam(state)] ??= []);
  if (board.includes(id)) return false;
  board.push(id);
  return true;
}

export function dropFromBoard(state: SeasonState, id: string): void {
  const rs = state.recruiting;
  if (!rs) return;
  const u = userTeam(state);
  rs.boards[u] = (rs.boards[u] ?? []).filter((x) => x !== id);
  rs.top = rs.top.filter((x) => x !== id);
}

export function toggleTop(state: SeasonState, id: string): boolean {
  const rs = state.recruiting;
  if (!rs) return false;
  if (rs.top.includes(id)) rs.top = rs.top.filter((x) => x !== id);
  else {
    addToBoard(state, id);
    rs.top.push(id);
  }
  return rs.top.includes(id);
}

/** The user's offer cap: twice the class. Offers to prospects committed elsewhere don't count. */
export function offerCap(state: SeasonState): number {
  return Math.ceil(recruitSchools(state).get(userTeam(state))!.target * R.offerMult);
}

/** Offer a scholarship (or take it back). Capped by `offerCap`. */
export function toggleOffer(state: SeasonState, id: string): 'offered' | 'withdrawn' | 'full' | 'no' {
  const rs = state.recruiting;
  const p = prospect(id);
  if (!rs || !p || !open(rs, id)) return 'no';
  const u = userTeam(state);
  const mine = (rs.offers[u] ??= []);
  if (mine.includes(id)) {
    if (rs.commits[id] === u) return 'no';
    rs.offers[u] = mine.filter((x) => x !== id);
    return 'withdrawn';
  }
  if (mine.filter((x) => !rs.commits[x] || rs.commits[x] === u).length >= offerCap(state)) return 'full';
  addToBoard(state, id);
  makeOffer(state, recruitSchools(state).get(u)!, p);
  return 'offered';
}

/** The user's next home game not yet played, for official visits. */
export function nextHomeGame(state: SeasonState): SeasonGame | undefined {
  if (state.phase !== 'regular' && state.phase !== 'confChamp') return undefined;
  const u = userTeam(state);
  return state.games.filter((g) => g.home === u && !g.neutral && !g.result && g.kind !== 'bowl' && g.kind !== 'cfp').sort((a, b) => a.week - b.week)[0];
}

/** Host him on an official visit at the next home game (or cancel). Up to `visit.n` a game. */
export function toggleVisit(state: SeasonState, id: string): 'hosted' | 'cancelled' | 'full' | 'used' | 'none' | 'no' {
  const rs = state.recruiting;
  if (!rs || !prospect(id) || !open(rs, id)) return 'no';
  const g = nextHomeGame(state);
  if (!g) return 'none';
  const list = (rs.visits[g.id] ??= []);
  if (list.includes(id)) {
    rs.visits[g.id] = list.filter((x) => x !== id);
    return 'cancelled';
  }
  const u = userTeam(state);
  if ((rs.ov[id]?.length ?? 0) >= R.visit.max || rs.ov[id]?.includes(u)) return 'used';
  if (list.length >= R.visit.n) return 'full';
  addToBoard(state, id);
  list.push(id);
  return 'hosted';
}

/** Which of the user's home games he's coming to, if any. */
export function visitGame(state: SeasonState, id: string): SeasonGame | undefined {
  const rs = state.recruiting;
  if (!rs) return undefined;
  return state.games.find((g) => !g.result && rs.visits[g.id]?.includes(id));
}

/** The user's staff fills the board's empty slots, the way `autoRecruit` would. */
export function staffFill(state: SeasonState): number {
  const rs = state.recruiting;
  if (!rs) return 0;
  const u = userTeam(state);
  const before = (rs.boards[u] ??= []).length;
  const schools = recruitSchools(state);
  staffFillBoard(state, schools, buildMarkets(state, schools), u);
  return rs.boards[u].length - before;
}

/** A delegated user's week: the staff refresh the board, offer and pick visitors like a CPU staff. Nothing extra: `auto`. */
export const autoRecruit = (state: SeasonState): boolean => !!state.config.delegate.recruiting;

/** Where a prospect stands now: signed, committed (where), or open. */
export function statusOf(state: SeasonState, id: string): { kind: 'signed' | 'committed' | 'open' | 'gone'; team?: string } {
  const rs = state.recruiting;
  if (!rs) return { kind: 'open' };
  if (rs.signed[id]) return { kind: 'signed', team: rs.signed[id] };
  if (rs.commits[id]) return { kind: 'committed', team: rs.commits[id] };
  if (rs.gone?.includes(id)) return { kind: 'gone' };
  return { kind: 'open' };
}

/** The user's class needs by position: planned spots less commits. */
export function userNeeds(state: SeasonState): Map<Position, number> {
  return recruitSchools(state).get(userTeam(state))!.need;
}

