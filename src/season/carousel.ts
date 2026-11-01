import {
  applyCoachDelta, coachAs, coachName, COACH_ROLES, COACH_TITLE, GA, GROUPS, staffLevel, type AnyRole, type Coach, type CoachRole, type HeadCoach, type RatingName,
} from '../data/coaches';
import { CALENDAR } from '../data/season/calendar';
import { REGION, TEAM_STATE } from '../data/fbs/geo';
import { GROUP_POS as GROUP_POS_OF } from '../data/emphasis';
import type { Position } from '../data/positions';
import { teamById, TEAMS } from '../data/teams';
import { clamp, gauss, hashString, mulberry32 } from '../engine/math';
import { expectedWins, HOT_SEAT, SECURITY_PER_WIN, START_SECURITY } from './coach';
import { coachTraits } from './coaching';
import { records } from './standings';
import type { CarouselState, SeasonState } from './types';
import { moraleOf } from './morale';
import { baseRoster, gasFor, headCoachFor, seasonRng, staffFor } from './world';

/**
 * The coaching carousel, the offseason's first stage (docs/COACHES.md, docs/CAROUSEL_PLAN.md):
 * 1. `openCarousel`: reputations move with the season; CPU head coaches are fired off the hot seat and
 *    coaches retire; CPU head coaches fire coordinators after a bad year for their unit. Then the head
 *    coach openings fill, best program first, from FBS head coaches and coordinators, coaches out of a
 *    job, and outside candidates. A hire empties his old chair, and an emptied head coach chair joins the
 *    chain. A new head coach keeps some of his staff and brings his loyalists.
 * 2. `carouselRound`, `CAROUSEL.rounds` times: every open assistant chair gets an offer (the user's from
 *    the screen, unless delegated), then every candidate takes his best offer if his motive likes it.
 *    A move empties his old chair for the next round.
 * 3. `closeCarousel`: chairs still open go to outside candidates, and the portal opens.
 * The market reads reputation, not ratings: a head coach's eval sets how much he sees past it (`hire`).
 */

export const CAROUSEL = {
  rounds: 5,
  /**
   * Reputation: a seeded start (`startSd` around his worth), then each offseason it moves `lag` of the
   * way to what the world saw: his program's staff level plus `perZ` per SD of his unit's results
   * (points scored for offense, allowed for defense, wins against expectations for a head coach, wins
   * otherwise). A stacked roster makes its coaches look good. Losing a job costs `fired`; an outside
   * candidate is an unknown quantity, `outside` from where his worth would put him.
   */
  rep: { startSd: 8, lag: 0.3, perZ: 6, fired: 4, outside: -3 },
  /** A CPU head coach fires his coordinator at `odds` after a season `z` SD under the league on his side of the ball. */
  unitFire: { z: -1, odds: 0.5 },
  /** A new head coach keeps each assistant at these odds. */
  keep: 0.3,
  /**
   * Who's a candidate from FBS: the same chair at a program `gap` prestige under; a coordinator for a
   * head coach job at a program no more than `coordReach` over his; a position coach for his side's
   * coordinator job within `groupReach`; the best `pool` by reputation. Promotions in house count too.
   */
  gap: 5,
  coordReach: 30,
  groupReach: 20,
  pool: 12,
  /** Out-of-work coaches in a pool, best reputation first. */
  free: 4,
  /** The user's interviews per open chair. */
  talks: 2,
};

/** Firings, retirements and outside candidates (as in step 3 of the plan, now the carousel's opening). */
export const TURNOVER = {
  startSec: [30, 85] as [number, number],
  grace: 2,
  fire: 0.5,
  retireAge: 60,
  retireBase: 0.03,
  retirePerYear: 0.025,
  retireMax: 0.5,
  retireAll: 76,
  onTopWins: 3,
  onTop: 0.12,
  candidates: 3,
  /** How much of an athletic director's pick is true worth (the rest is reputation). */
  adTruth: 0.3,
};

const C = CAROUSEL;
const T = TURNOVER;

// ------------------------------------------------------------ motives

/**
 * What a coach wants from a move, seeded from his id and hidden until an interview:
 * - climber: the next title up
 * - lifer: rarely leaves
 * - mercenary: the money (a bigger program)
 * - homebody: his home region (where he was first on staff)
 * - loyalist: follows his head coach
 * - winner: a contender
 */
export type Motive = 'climber' | 'lifer' | 'mercenary' | 'homebody' | 'loyalist' | 'winner';
export const MOTIVES: Motive[] = ['climber', 'lifer', 'mercenary', 'homebody', 'loyalist', 'winner'];
export const MOTIVE_TEXT: Record<Motive, string> = {
  climber: 'WANTS THE NEXT TITLE UP', lifer: 'HAPPY WHERE HE IS', mercenary: 'FOLLOWS THE MONEY',
  homebody: 'WANTS TO STAY CLOSE TO HOME', loyalist: 'LOYAL TO HIS HEAD COACH', winner: 'WANTS A CONTENDER',
};
const MOTIVE_ODDS: Record<Motive, number> = { climber: 0.25, lifer: 0.15, mercenary: 0.15, homebody: 0.15, loyalist: 0.15, winner: 0.15 };

/**
 * How a move scores for him, by motive: a base, per level up the ladder (position coach, coordinator,
 * head coach), per 20 prestige up, per win share up, and plus or minus `home` for his home region or
 * not. Minus `hot` for a job under a hot-seat head coach. He takes it over `accept`, with `noise`.
 */
export const WILL = {
  motive: {
    climber: { base: 0, step: 1.2, prestige: 0.6, win: 0.3, home: 0 },
    lifer: { base: -1.2, step: 0.8, prestige: 0.3, win: 0.2, home: 0.2 },
    mercenary: { base: 0, step: 0.5, prestige: 1.6, win: 0.2, home: 0 },
    homebody: { base: -0.2, step: 0.6, prestige: 0.45, win: 0.2, home: 0.8 },
    loyalist: { base: -0.7, step: 0.6, prestige: 0.45, win: 0.2, home: 0 },
    winner: { base: -0.1, step: 0.5, prestige: 0.45, win: 2, home: 0 },
  } as Record<Motive, { base: number; step: number; prestige: number; win: number; home: number }>,
  hot: 0.8,
  accept: 0.1,
  noise: 0.3,
  /** Out of a job: he takes nearly anything, less `down` per 20 prestige down from his last job. */
  free: 1,
  down: 0.5,
};

export function motiveOf(id: string): Motive {
  let x = mulberry32(hashString(`motive:${id}`))();
  for (const m of MOTIVES) if ((x -= MOTIVE_ODDS[m]) < 0) return m;
  return 'climber';
}

// ------------------------------------------------------------ chairs and coaches

export const chairOf = (team: string, role: AnyRole) => `${team}:${role}`;
export const titleOf = (role: AnyRole) => (role === 'HC' ? 'HEAD COACH' : COACH_TITLE[role]);
export const splitChair = (chair: string) => {
  const i = chair.lastIndexOf(':');
  return { team: chair.slice(0, i), role: chair.slice(i + 1) as AnyRole };
};

const LEVEL: Record<AnyRole, number> = { HC: 3, OC: 2, DC: 2, ...Object.fromEntries([...GROUPS, 'TRAINER'].map((g) => [g, 1])) } as Record<AnyRole, number>;
const SIDE: Partial<Record<AnyRole, 'OC' | 'DC'>> = { QB: 'OC', RB: 'OC', WR: 'OC', TE: 'OC', OL: 'OC', DL: 'DC', LB: 'DC', DB: 'DC' };

/** A coach as he'd be in a chair this season: his ratings for it with his changes, his age this year. */
export function coachNow(state: SeasonState, id: string, role: AnyRole): Coach | HeadCoach {
  const c = coachAs(id, role)!;
  return { ...c, age: c.age + state.year - (c.from ?? CALENDAR.year), r: applyCoachDelta(c.r, state.coaches?.[id]?.d) } as Coach | HeadCoach;
}

/** His ratings' mean: what he's really worth in a chair. */
export const coachWorth = (c: Coach | HeadCoach) => {
  const v = Object.values(c.r) as number[];
  return v.reduce((a, b) => a + b, 0) / v.length;
};

/** The team he was first on staff with: home, for a homebody. */
const homeTeam = (id: string) => id.slice(0, id.lastIndexOf('-'));
const regionOf = (team: string) => REGION[TEAM_STATE[team]];

/** His reputation: stored once the carousel has run, else his seeded start. */
export function repOf(state: SeasonState, id: string, role: AnyRole): number {
  const r = state.coaches?.[id]?.rep;
  if (r !== undefined) return r;
  return coachWorth(coachNow(state, id, role)) + gauss(mulberry32(hashString(`rep:${id}`))) * C.rep.startSd;
}

/** Everyone in a chair, by id (open chairs left out: whoever is listed there has gone). */
function seatedMap(state: SeasonState): Map<string, { team: string; role: AnyRole }> {
  const open = new Set(state.carousel?.open ?? []);
  const out = new Map<string, { team: string; role: AnyRole }>();
  for (const t of TEAMS) {
    const staff = staffFor(state, t.id);
    for (const role of ['HC', ...COACH_ROLES] as AnyRole[]) {
      if (open.has(chairOf(t.id, role))) continue;
      out.set(role === 'HC' ? headCoachFor(state, t.id).id : staff[role as Exclude<AnyRole, 'HC'>].id, { team: t.id, role });
    }
  }
  return out;
}

// ------------------------------------------------------------ retirement and firing

export function retireOdds(age: number, bigYear = false): number {
  if (age >= T.retireAll) return 1;
  const base = age < T.retireAge ? 0.004 : Math.min(T.retireMax, T.retireBase + T.retirePerYear * (age - T.retireAge));
  return Math.min(1, base + (bigYear && age >= T.retireAge - 4 ? T.onTop : 0));
}

/** A generated head coach's security when the game begins. */
const startSec = (id: string) => T.startSec[0] + Math.floor(mulberry32(hashString(`sec:${id}`))() * (T.startSec[1] - T.startSec[0] + 1));

/** A program's head coach's job security: the user's own (career mode) or a CPU head coach's. */
export function securityOf(state: SeasonState, team: string): number {
  if (team === state.config.userTeamId) return state.coach?.security ?? START_SECURITY;
  const hc = headCoachFor(state, team);
  const p = state.coaches?.[hc.id];
  return p?.sec ?? (p?.hired ? START_SECURITY : startSec(hc.id));
}

// ------------------------------------------------------------ candidates and hiring

export interface Candidate {
  id: string;
  /** Where he is: a chair, `free` (out of a job) or `outside` FBS. */
  from: string;
  /** His worth in this chair, and his reputation. */
  worth: number;
  rep: number;
}

/** The outside candidates for a chair in the offseason after `year`, built from their ids. */
export function outsideFor(state: SeasonState, team: string, role: AnyRole): Candidate[] {
  return Array.from({ length: T.candidates }, (_, n) => {
    const id = `${team}-${role.toLowerCase()}.${state.year}.${n}`;
    return { id, from: 'outside', worth: coachWorth(coachNow(state, id, role)), rep: repOf(state, id, role) + C.rep.outside };
  });
}

/** Could he take the chair: a step up, a promotion in house, or a job for a coach out of work. */
function eligible(state: SeasonState, at: { team: string; role: AnyRole } | undefined, lastRole: AnyRole, team: string, role: AnyRole): boolean {
  if (!at) {
    // Out of a job: his own chair, a coordinator job for a head coach, his side's position chairs for a coordinator.
    return lastRole === role || (lastRole === 'HC' && LEVEL[role] === 2) || (LEVEL[lastRole] === 2 && SIDE[role] === lastRole);
  }
  if (at.team === state.config.userTeamId && at.role === 'HC') return false;
  const pT = teamById(team).profile.prestige;
  const pF = teamById(at.team).profile.prestige;
  if (at.team === team) return LEVEL[role] > LEVEL[at.role] && (role === 'HC' || SIDE[at.role] === role);
  if (role === 'HC') return (at.role === 'HC' && pF < pT - C.gap) || (LEVEL[at.role] === 2 && pF >= pT - C.coordReach);
  if (LEVEL[role] === 2) return (at.role === role && pF < pT - C.gap) || (SIDE[at.role] === role && pF >= pT - C.groupReach);
  return at.role === role && pF < pT - C.gap;
}

/** A chair's candidates: FBS coaches who'd see it as a step up, coaches out of work, and the outside ones. */
export function poolFor(state: SeasonState, chair: string, seated = seatedMap(state)): Candidate[] {
  const { team, role } = splitChair(chair);
  const moved = new Set(state.carousel?.moved ?? []);
  const declined = new Set(state.carousel?.declined[chair] ?? []);
  const fbs: Candidate[] = [];
  for (const [id, at] of seated) {
    if (moved.has(id) || declined.has(id) || !eligible(state, at, at.role, team, role)) continue;
    fbs.push({ id, from: chairOf(at.team, at.role), worth: 0, rep: repOf(state, id, at.role) });
  }
  const free: Candidate[] = [];
  for (const [id, p] of Object.entries(state.coaches ?? {})) {
    if (p.gone?.year !== state.year || p.gone.why === 'retired' || moved.has(id) || declined.has(id) || !p.at) continue;
    const last = splitChair(p.at).role;
    // Not back to the program that just let him go.
    if (splitChair(p.at).team === team) continue;
    if (eligible(state, undefined, last, team, role)) free.push({ id, from: 'free', worth: 0, rep: repOf(state, id, last) });
  }
  // His program's graduate assistants, for any position chair: a promotion from within.
  const gas: Candidate[] = (GROUPS as AnyRole[]).includes(role)
    ? gasFor(state, team).filter((id) => !moved.has(id) && !declined.has(id)).map((id) => ({ id, from: 'ga', worth: 0, rep: repOf(state, id, role) }))
    : [];
  const best = (xs: Candidate[], n: number) => xs.sort((a, b) => b.rep - a.rep || (a.id < b.id ? -1 : 1)).slice(0, n);
  const out = [...best(fbs, C.pool), ...gas, ...best(free, C.free), ...outsideFor(state, team, role).filter((c) => !declined.has(c.id))];
  for (const c of out) c.worth = coachWorth(coachNow(state, c.id, role));
  return out;
}

/**
 * The pick: true worth weighted by the hirer's eval (30 → 0, 95 → 1), the rest reputation. An athletic
 * director (no eval) weighs `adTruth`.
 */
export function hire(cands: Candidate[], evalRating?: number): Candidate | undefined {
  const w = evalRating === undefined ? T.adTruth : clamp((evalRating - 30) / 65, 0, 1);
  const score = (x: Candidate) => w * x.worth + (1 - w) * x.rep;
  return cands.reduce<Candidate | undefined>((best, x) => (!best || score(x) > score(best) ? x : best), undefined);
}

/** Last season's win share by team. */
function winShares(state: SeasonState): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, r] of records(state)) out.set(id, (r.w + 0.5) / (r.w + r.l + 1));
  return out;
}

/** How a move scores for a candidate (over `WILL.accept` he'd take it). */
export function willing(state: SeasonState, c: Candidate, chair: string, salt: string | number = 0, wins = winShares(state)): number {
  if (c.from === 'outside' || c.from === 'ga') return 2;
  const noise = gauss(seasonRng(state, 'will', salt, c.id, chair)) * WILL.noise;
  if (c.from === 'free') {
    // Out of a job he takes nearly anything, but not a big step down from where he was.
    const was = state.coaches?.[c.id]?.at;
    const dp = was ? (teamById(splitChair(chair).team).profile.prestige - teamById(splitChair(was).team).profile.prestige) / 20 : 0;
    return WILL.free + WILL.down * Math.min(0, dp) + noise;
  }
  const to = splitChair(chair);
  const at = splitChair(c.from);
  const w = WILL.motive[motiveOf(c.id)];
  const step = LEVEL[to.role] - LEVEL[at.role];
  const dp = (teamById(to.team).profile.prestige - teamById(at.team).profile.prestige) / 20;
  const win = (wins.get(to.team) ?? 0.5) - (wins.get(at.team) ?? 0.5);
  const home = regionOf(homeTeam(c.id)) === regionOf(to.team) ? w.home : -w.home;
  const hot = to.role !== 'HC' && securityOf(state, to.team) < HOT_SEAT ? WILL.hot : 0;
  return w.base + w.step * step + w.prestige * dp + w.win * win + home - hot + noise;
}

// ------------------------------------------------------------ the user's view: fog and interviews

/**
 * What the user sees of a candidate's ratings for a chair: a range per rating, as wide as his head
 * coach's eval leaves it (`(100 - eval) / 4`, 2 to 14) and halved by each interview, exact after two.
 */
export function seenRatings(state: SeasonState, id: string, role: AnyRole): { k: RatingName; lo: number; hi: number }[] {
  const ev = headCoachFor(state, state.config.userTeamId).r.eval;
  const talks = state.carousel?.talks[id] ?? 0;
  const w0 = Math.round(clamp((100 - ev) / 4, 2, 14));
  const w = talks >= 2 ? 0 : talks === 1 ? Math.floor(w0 / 2) : w0;
  const c = coachNow(state, id, role);
  return (Object.entries(c.r) as [RatingName, number][]).map(([k, v]) => {
    const lo = clamp(v - (hashString(`fog:${id}:${k}`) % (w + 1)), 1, 99);
    return { k, lo, hi: Math.min(99, lo + w) };
  });
}

/** An interview: sharper ratings, and the first one reveals his motive. */
export function interview(state: SeasonState, id: string): boolean {
  const cs = state.carousel;
  if (!cs || cs.talksLeft <= 0 || (cs.talks[id] ?? 0) >= 2) return false;
  cs.talks[id] = (cs.talks[id] ?? 0) + 1;
  cs.talksLeft--;
  return true;
}

export const userChairs = (state: SeasonState) => (state.carousel?.open ?? []).filter((c) => splitChair(c).team === state.config.userTeamId);

/** The user's offer for an open chair this round (one per chair; a new one replaces it). */
export function offerChair(state: SeasonState, chair: string, id: string): boolean {
  const cs = state.carousel;
  if (!cs || !userChairs(state).includes(chair) || !poolFor(state, chair).some((c) => c.id === id)) return false;
  if (Object.entries(cs.offers).some(([ch, x]) => x === id && ch !== chair)) return false;
  cs.offers[chair] = id;
  return true;
}

/** The user fires one of his assistants during the carousel: the chair opens, with its interviews. */
export function fireAssistant(state: SeasonState, role: CoachRole): boolean {
  const chair = chairOf(state.config.userTeamId, role);
  if (state.offseason?.stage !== 'carousel' || !state.carousel || state.carousel.open.includes(chair)) return false;
  const c = staffFor(state, state.config.userTeamId)[role];
  leave(state, chair, c.id, 'fired');
  news(state, [state.config.userTeamId], `STAFF: you fire your ${titleOf(role).toLowerCase()} ${coachName(c)}`);
  return true;
}

export function withdrawOffer(state: SeasonState, chair: string): void {
  if (state.carousel) delete state.carousel.offers[chair];
}

// ------------------------------------------------------------ the carousel

function news(state: SeasonState, teams: string[], text: string): void {
  state.news.push({ week: state.week, kind: 'carousel', teams, text });
}

const where = (chair: string) => {
  const { team, role } = splitChair(chair);
  return `${teamById(team).school} ${role === 'HC' ? 'head coach' : role === 'TRAINER' ? 'trainer' : LEVEL[role] === 2 ? role : `${role} coach`}`;
};

/**
 * Seat a coach. From another chair, it opens behind him; from outside or out of work he's new to the
 * chair. Nobody moves twice in an offseason.
 */
function seat(state: SeasonState, chair: string, c: Candidate): void {
  const cs = state.carousel!;
  const { team, role } = splitChair(chair);
  ((state.teamState[team] ??= {}).staff ??= {})[role] = c.id;
  cs.open = cs.open.filter((x) => x !== chair);
  cs.moved.push(c.id);
  cs.log.push({ chair, id: c.id, from: c.from });
  const coaches = (state.coaches ??= {});
  if (c.from === 'outside') coaches[c.id] = { at: chair, t: 0, hired: state.year };
  else {
    const p = (coaches[c.id] ??= {});
    // His old chair stays in `at`, so his growth sees the move (season/coaching.ts).
    p.at ??= c.from === 'free' ? chair : c.from === 'ga' ? `${team}:GA` : c.from;
    p.hired = state.year;
    delete p.gone;
    delete p.sec;
  }
  if (c.from === 'ga') (state.teamState[team] ??= {}).ga = gasFor(state, team).filter((x) => x !== c.id);
  else if (c.from !== 'outside' && c.from !== 'free') vacate(state, c.from);
  treeNews(state, chair, c.id);
}

// ------------------------------------------------------------ coaching trees and graduate assistants

/**
 * A coach's tree: everyone who has worked under him (`CoachProgress.under`) and now sits in a chair
 * at another program.
 */
export function treeOf(state: SeasonState, root: string): { id: string; team: string; role: AnyRole }[] {
  const seated = seatedMap(state);
  const home = seated.get(root)?.team;
  return [...seated].filter(([id, at]) => id !== root && at.team !== home && state.coaches?.[id]?.under?.includes(root))
    .map(([id, at]) => ({ id, ...at }));
}

/** A tree's score, the user's legacy: 3 for each head coach on it, 1 for each coordinator. */
export const TREE_SCORE: Partial<Record<AnyRole, number>> = { HC: 3, OC: 1, DC: 1 };
export const treeScore = (tree: { role: AnyRole }[]) => tree.reduce((a, x) => a + (TREE_SCORE[x.role] ?? 0), 0);

/** A hire from the user's tree to a head coach or coordinator job elsewhere makes the news. */
function treeNews(state: SeasonState, chair: string, id: string): void {
  const user = state.config.userTeamId;
  const { team, role } = splitChair(chair);
  const root = headCoachFor(state, user).id;
  if (team === user || !TREE_SCORE[role] || !state.coaches?.[id]?.under?.includes(root)) return;
  const n = treeOf(state, root).filter((x) => x.role === role).length;
  const c = coachNow(state, id, role);
  const th = n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  news(state, [user, team], `TREE: ${coachName(c)}, who coached under you, is ${teamById(team).school}'s new ${role === 'HC' ? 'head coach' : role}: your ${th} ${role === 'HC' ? 'head coach' : 'coordinator'} branch`);
}

/** The graduate assistants: those `GA.years` in move on, and new ones fill the open slots. */
function refreshGAs(state: SeasonState): void {
  for (const t of TEAMS) {
    const now = gasFor(state, t.id);
    const stay = now.filter((id) => (state.coaches?.[id]?.n ?? 0) < GA.years);
    if (stay.length === GA.slots && stay.length === now.length) continue;
    const rng = seasonRng(state, 'ga', t.id);
    const out = [...stay];
    for (let n = 0; out.length < GA.slots; n++) {
      const id = `${t.id}-${GROUPS[Math.floor(rng() * GROUPS.length)].toLowerCase()}.${state.year}.ga${n}`;
      if (!out.includes(id)) out.push(id);
    }
    (state.teamState[t.id] ??= {}).ga = out;
  }
}

function vacate(state: SeasonState, chair: string): void {
  const cs = state.carousel!;
  if (!cs.open.includes(chair)) cs.open.push(chair);
  if (splitChair(chair).team === state.config.userTeamId) cs.talksLeft += C.talks;
}

function leave(state: SeasonState, chair: string, id: string, why: 'fired' | 'retired' | 'let go'): void {
  const p = ((state.coaches ??= {})[id] ??= {});
  if (why !== 'retired') p.rep = Math.round((repOf(state, id, splitChair(chair).role) - C.rep.fired) * 10) / 10;
  p.gone = { year: state.year, why };
  p.at ??= chair;
  vacate(state, chair);
}

/** Points scored and allowed a game, as z-scores against the league. */
function unitZ(state: SeasonState): { off: Map<string, number>; def: Map<string, number> } {
  const pts = new Map<string, [number, number, number]>();
  for (const g of state.games) {
    if (!g.result) continue;
    for (const [t, f, a] of [[g.home, g.result.home, g.result.away], [g.away, g.result.away, g.result.home]] as const) {
      const x = pts.get(t) ?? [0, 0, 0];
      pts.set(t, [x[0] + f, x[1] + a, x[2] + 1]);
    }
  }
  const z = (f: (x: [number, number, number]) => number) => {
    const v = TEAMS.map((t) => [t.id, f(pts.get(t.id) ?? [0, 0, 1])] as const);
    const mean = v.reduce((a, [, x]) => a + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, [, x]) => a + (x - mean) ** 2, 0) / v.length) || 1;
    return new Map(v.map(([id, x]) => [id, (x - mean) / sd]));
  };
  return { off: z((x) => x[0] / x[2]), def: z((x) => -x[1] / x[2]) };
}

/** Reputations move toward what the season showed (`CAROUSEL.rep`). */
function moveReps(state: SeasonState): void {
  const units = unitZ(state);
  const rec = records(state);
  const winZ = new Map<string, number>();
  for (const t of TEAMS) winZ.set(t.id, ((rec.get(t.id)?.w ?? 0) - expectedWins(t.id)) / 2.5);
  const wins = winShares(state);
  const share = [...wins.values()];
  const wm = share.reduce((a, b) => a + b, 0) / share.length;
  const wsd = Math.sqrt(share.reduce((a, b) => a + (b - wm) ** 2, 0) / share.length) || 1;
  const coaches = (state.coaches ??= {});
  for (const [id, at] of seatedMap(state)) {
    const z = at.role === 'HC' ? winZ.get(at.team)! : at.role === 'OC' || SIDE[at.role] === 'OC' ? units.off.get(at.team)!
      : at.role === 'DC' || SIDE[at.role] === 'DC' ? units.def.get(at.team)! : ((wins.get(at.team) ?? wm) - wm) / wsd;
    const seen = staffLevel(teamById(at.team)) + C.rep.perZ * clamp(z, -2.5, 2.5);
    const was = repOf(state, id, at.role);
    (coaches[id] ??= {}).rep = Math.round((was + C.rep.lag * (seen - was)) * 10) / 10;
  }
}

/** Open the carousel: reputations, firings and retirements, then the head coach chain. */
export function openCarousel(state: SeasonState): void {
  const user = state.config.userTeamId;
  const cs: CarouselState = { open: [], offers: {}, declined: {}, talks: {}, talksLeft: 0, moved: [], log: [] };
  state.carousel = cs;
  cs.was = Object.fromEntries([...seatedMap(state)].map(([id, at]) => [chairOf(at.team, at.role), id]));
  moveReps(state);
  const rec = records(state);
  const units = unitZ(state);
  const coaches = state.coaches!;
  for (const t of TEAMS) {
    const rng = seasonRng(state, 'turnover', t.id);
    const r = rec.get(t.id);
    const w = r?.w ?? 0;
    const school = t.school;
    if (t.id !== user) {
      const hc = headCoachFor(state, t.id);
      const p = (coaches[hc.id] ??= {});
      const exp = expectedWins(t.id);
      p.sec = clamp(Math.round(securityOf(state, t.id) + (w - exp) * SECURITY_PER_WIN), 0, 100);
      const tenure = p.t ?? coachTraits(hc.id).tenure;
      const fired = p.sec < HOT_SEAT && tenure >= T.grace && rng() < T.fire;
      const retired = !fired && rng() < retireOdds(hc.age, w >= exp + T.onTopWins);
      if (fired || retired) {
        leave(state, chairOf(t.id, 'HC'), hc.id, fired ? 'fired' : 'retired');
        news(state, [t.id], fired
          ? `FIRED: ${school} parts ways with head coach ${coachName(hc)} after a ${w}-${r?.l ?? 0} season`
          : `RETIRED: ${school} head coach ${coachName(hc)} retires at ${hc.age}`);
      }
    }
    const staff = staffFor(state, t.id);
    for (const role of COACH_ROLES) {
      const c = staff[role];
      const unit = role === 'OC' ? units.off.get(t.id)! : role === 'DC' ? units.def.get(t.id)! : 0;
      const fired = t.id !== user && unit < C.unitFire.z && rng() < C.unitFire.odds;
      const why = rng() < retireOdds(c.age) ? 'retired' : fired ? 'fired' : undefined;
      if (!why) continue;
      leave(state, chairOf(t.id, role), c.id, why);
      if (t.id === user) news(state, [t.id], `STAFF: your ${titleOf(role).toLowerCase()} ${coachName(c)} retires`);
      else if (why === 'fired') news(state, [t.id], `${school} fires ${role === 'OC' ? 'offensive' : 'defensive'} coordinator ${coachName(c)}`);
    }
  }
  headChain(state);
  cs.talksLeft = C.talks * userChairs(state).length;
  state.offseason = { ...state.offseason!, stage: 'carousel', round: 1 };
}

/**
 * The head coach openings, best program first. The athletic director picks from everyone willing; a
 * coach hired from another head coach job opens it, and the chain goes on. Then the new head coach's
 * staff: he keeps each assistant at `keep` odds, and his loyalists on his old staff follow him into the
 * chairs he opened.
 */
function headChain(state: SeasonState): void {
  const cs = state.carousel!;
  const wins = winShares(state);
  for (;;) {
    const openHeads = cs.open.filter((c) => splitChair(c).role === 'HC')
      .sort((a, b) => teamById(splitChair(b).team).profile.prestige - teamById(splitChair(a).team).profile.prestige || (a < b ? -1 : 1));
    const chair = openHeads[0];
    if (!chair) return;
    const team = splitChair(chair).team;
    const pick = hire(poolFor(state, chair).filter((c) => willing(state, c, chair, 'hc', wins) > WILL.accept))!;
    const from = pick.from;
    seat(state, chair, pick);
    const hc = coachNow(state, pick.id, 'HC');
    news(state, [team, ...(from.includes(':') ? [splitChair(from).team] : [])],
      `HIRED: ${teamById(team).school} names ${from === 'outside' ? '' : from === 'free' ? 'former coach ' : `${where(from)} `}${coachName(hc)} head coach`);
    // His staff.
    const rng = seasonRng(state, 'housecleaning', team);
    const staff = staffFor(state, team);
    const user = state.config.userTeamId;
    const opened: CoachRole[] = [];
    for (const role of COACH_ROLES) {
      const ch = chairOf(team, role);
      if (cs.open.includes(ch)) {
        opened.push(role);
        continue;
      }
      if (rng() < C.keep) continue;
      leave(state, ch, staff[role].id, 'let go');
      opened.push(role);
    }
    if (from.includes(':')) {
      const old = splitChair(from).team;
      const oldStaff = staffFor(state, old);
      for (const role of opened) {
        const c = oldStaff[role];
        const ch = chairOf(old, role);
        if (cs.open.includes(ch) || cs.moved.includes(c.id) || motiveOf(c.id) !== 'loyalist') continue;
        seat(state, chairOf(team, role), { id: c.id, from: ch, worth: 0, rep: 0 });
        if (old === user) news(state, [old, team], `STAFF: your ${titleOf(role).toLowerCase()} ${coachName(c)} follows ${coachName(hc)} to ${teamById(team).school}`);
      }
    }
  }
}

/**
 * One hiring round: offers for every open assistant chair (the CPU's, the delegated user's, or the
 * user's from the screen), then each candidate takes his best one if he'd move for it. Chairs a move
 * empties are open next round. After the last round the carousel closes.
 */
export function carouselRound(state: SeasonState): void {
  const cs = state.carousel!;
  const user = state.config.userTeamId;
  const round = state.offseason!.round;
  const wins = winShares(state);
  const seated = seatedMap(state);
  const offers = new Map<string, { chair: string; c: Candidate }[]>();
  // The best programs call first, and a staff doesn't offer a coach another CPU staff already has
  // an offer out to. The user's offers can compete with anyone's.
  const prestige = (chair: string) => teamById(splitChair(chair).team).profile.prestige;
  const claimed = new Set<string>();
  for (const chair of [...cs.open].sort((a, b) => prestige(b) - prestige(a) || (a < b ? -1 : 1))) {
    const team = splitChair(chair).team;
    let pick: Candidate | undefined;
    if (team === user && !state.config.delegate.carousel) {
      const id = cs.offers[chair];
      pick = id ? poolFor(state, chair, seated).find((c) => c.id === id) : undefined;
    } else {
      // A CPU staff calls around first: it offers the best candidate who'd listen.
      const pool = poolFor(state, chair, seated).filter((c) => !claimed.has(c.id) && willing(state, c, chair, `call${round}`, wins) > WILL.accept);
      pick = hire(pool, headCoachFor(state, team).r.eval);
      if (pick) claimed.add(pick.id);
    }
    if (pick) {
      if (!offers.has(pick.id)) offers.set(pick.id, []);
      offers.get(pick.id)!.push({ chair, c: pick });
    }
  }
  for (const id of [...offers.keys()].sort()) {
    const list = offers.get(id)!;
    const scored = list.map((o) => ({ ...o, s: willing(state, o.c, o.chair, round, wins) })).sort((a, b) => b.s - a.s || (a.chair < b.chair ? -1 : 1));
    const best = scored[0].s > WILL.accept ? scored[0] : undefined;
    for (const o of scored) {
      if (o === best) continue;
      (cs.declined[o.chair] ??= []).push(id);
      if (splitChair(o.chair).team === user) news(state, [user], `STAFF: ${coachName(coachNow(state, id, splitChair(o.chair).role))} turns down your ${splitChair(o.chair).role} job`);
    }
    if (!best) continue;
    const from = best.c.from;
    if (cs.moved.includes(id) || (from.includes(':') && cs.open.includes(from))) continue;
    seat(state, best.chair, best.c);
    const { team, role } = splitChair(best.chair);
    const c = coachNow(state, id, role);
    const fromTeam = from.includes(':') ? splitChair(from).team : undefined;
    if (team === user) news(state, [user], `STAFF: you ${from === 'ga' ? 'promote graduate assistant' : 'hire'} ${from === 'outside' || from === 'ga' ? '' : from === 'free' ? 'former coach ' : `${where(from)} `}${coachName(c)} ${from === 'ga' ? 'to' : 'as'} ${titleOf(role).toLowerCase()}`);
    else if (fromTeam === user) news(state, [user, team], `STAFF: ${teamById(team).school} hires away your ${titleOf(splitChair(from).role).toLowerCase()} ${coachName(c)}`);
  }
  cs.offers = {};
  if (round < C.rounds) state.offseason!.round++;
  else closeCarousel(state);
}

/** The carousel closes: chairs still open go to outside candidates (the user's staff picks his). */
export function closeCarousel(state: SeasonState): void {
  const cs = state.carousel!;
  const user = state.config.userTeamId;
  for (const chair of [...cs.open].sort()) {
    const { team, role } = splitChair(chair);
    const pick = hire(outsideFor(state, team, role), role === 'HC' ? undefined : headCoachFor(state, team).r.eval)!;
    seat(state, chair, pick);
    if (team === user) news(state, [user], `STAFF: the staff fills your ${titleOf(role).toLowerCase()} job with ${coachName(coachNow(state, pick.id, role))}`);
  }
  refreshGAs(state);
  reactToDepartures(state);
  delete cs.was;
  state.offseason!.stage = 'departures';
  state.offseason!.round = 0;
}

// ------------------------------------------------------------ players react

/**
 * Players react to the coaches who left (step 5 of docs/CAROUSEL_PLAN.md):
 * - morale drops by `group` for his position coach, `coord` for his side's coordinator and `head` for
 *   a head coach, times their bond (the biggest one counts)
 * - bond is seasons together over `bondYears`, at least one season's worth: a coach who recruited him
 *   and coached him for years hurts most. Together is the shorter of his seasons on the team (since
 *   he transferred in, else his class) and the coach's seasons in the chair
 * - in the portal (season/portal.ts): `entry` per bond on his odds of entering, and `follow` per bond
 *   on the appeal of the school his coach went to
 */
export const REACT = { group: 0.3, coord: 0.12, head: 0.2, bondYears: 3, entry: 0.9, follow: 0.15 };

const CLASS_SEASONS: Record<string, number> = { FR: 1, SO: 2, JR: 3, SR: 4 };

/** The chair over a player: his position coach, and his side's coordinator. */
function chairsOver(pos: Position): AnyRole[] {
  const g = GROUPS.find((x) => GROUP_POS_OF[x].includes(pos));
  if (!g) return ['HC'];
  return SIDE[g] ? [g, SIDE[g]!, 'HC'] : [g, 'HC'];
}

export function reactToDepartures(state: SeasonState): void {
  const cs = state.carousel!;
  if (!cs.was) return;
  const seated = seatedMap(state);
  const user = state.config.userTeamId;
  for (const t of TEAMS) {
    const left = new Map<AnyRole, { id: string; to?: string }>();
    for (const role of ['HC', ...COACH_ROLES] as AnyRole[]) {
      const chair = chairOf(t.id, role);
      const was = cs.was[chair];
      const now = role === 'HC' ? headCoachFor(state, t.id).id : staffFor(state, t.id)[role as CoachRole].id;
      if (!was || was === now) continue;
      const at = seated.get(was);
      left.set(role, { id: was, to: at && at.team !== t.id ? at.team : undefined });
    }
    if (!left.size) continue;
    const ts = (state.teamState[t.id] ??= {});
    const prog = (ts.progress ??= {});
    let shaken = 0;
    for (const a of baseRoster(state, t.id)) {
      let best: { role: AnyRole; bond: number; hit: number; to?: string } | undefined;
      for (const role of chairsOver(a.pos)) {
        const l = left.get(role);
        if (!l) continue;
        const p = prog[a.id];
        const mine = p?.tr ? state.year - p.tr.year : CLASS_SEASONS[a.year] ?? 1;
        const theirs = (state.coaches?.[l.id]?.t ?? coachTraits(l.id).tenure) + 1;
        const bond = clamp(Math.min(mine, theirs) / REACT.bondYears, 1 / REACT.bondYears, 1);
        const hit = bond * (role === 'HC' ? REACT.head : LEVEL[role] === 2 ? REACT.coord : REACT.group);
        if (!best || hit > best.hit) best = { role, bond: Math.round(bond * 100) / 100, hit, to: l.to };
      }
      if (!best) continue;
      const e = (prog[a.id] ??= { xp: 0, lvl: 0, d: {} });
      e.cl = { year: state.year, role: best.role, bond: best.bond, ...(best.to ? { to: best.to } : {}) };
      (ts.mo ??= {})[a.id] = Math.round(clamp(moraleOf(ts, a) - best.hit, -1, 1) * 100) / 100;
      if (best.role !== 'HC' && LEVEL[best.role] === 1) shaken++;
    }
    if (t.id === user && shaken) {
      news(state, [user], `STAFF: ${shaken} player${shaken > 1 ? 's' : ''} took a position coach's departure hard`);
    }
  }
}
