import type { Athlete } from '../data/athletes';
import { GROUPS, type Group } from '../data/coaches';
import { athleteName, generatedAthlete, originTeam } from '../data/depth';
import { REGION, TEAM_STATE } from '../data/fbs/geo';
import { overall, POSITIONS, type Position } from '../data/positions';
import { COMPOSITION, freeNumber, parseWalkOn, STARTERS, walkOnId } from '../data/rosterGen';
import { TEAMS, teamById } from '../data/teams';
import { clamp, gauss, hashString, mulberry32 } from '../engine/math';
import { tell } from './career';
import { CONFIDENCE } from './confidence';
import { groupOf } from './emphasis';
import { moraleOf, temperament } from './morale';
import { latestPoll, rankIn } from './polls';
import type { CoachPromise, LeavingEntry, NewsItem, PortalEntrant, PortalReason, PortalState, Progress, SeasonState, TeamState } from './types';
import { baseRoster, seasonRng, squadFor, staffFor } from './world';

/**
 * The transfer portal, the first offseason system (docs/PORTAL.md). No currency: a school's pull is
 * its reputation, the chance to play, its development record and closeness to home, weighed by each
 * player's hidden motives. The same comparison decides who enters and where he goes. Every team runs
 * the same functions; the user's staff can run the user's side (`Delegation.portal`).
 *
 * Rounds: 0 is the leaving list (the user meets players before anyone enters); advancing it rolls the
 * entries and the position coaches work the board. Rounds 1 and 2 are the head coaches': offers, calls,
 * visits and promises, then each player decides. After round 2 the unplaced go home or leave FBS, and
 * walk-ons refill short rosters (a placeholder until graduation and HS recruiting).
 */

/**
 * Portal tuning.
 * - `ptScale`: overall points per logistic unit of the playing-time factor around the starting bar.
 * - `crackPt`: the PT factor at which a school counts toward his market; `marketPct` the market's percentile.
 * - `win`: this season, the last `history` seasons and the brand (prestige plus `titleBrand` a title).
 *   `lossAversion`: a step down from his current program's WIN counts this much extra.
 * - `signShare`: the share of a school's departures it can replace from the portal; walk-ons take the
 *   rest (a placeholder for the HS class, docs/PORTAL.md).
 * - `dev`: the position coach's teach and the program's development record.
 * - `entry`: the logistic on entering. `k` per point of market over stay; `morale`, `loyal` (the team
 *   trait), `again` (already transferred), `broken` (a broken promise), and class.
 * - `considering`/`leaningOut`: entry odds for the user's leaving list and its LEANING OUT tag.
 * - `meet`, `promise`: the leaving list's meetings and promises; `promise.pt` the PT factor a promise
 *   with an offer guarantees, `kept`/`broken` the morale they leave, `startShare`/`snapsShare` the
 *   share of games he must start for it to be kept.
 * - `coach`, `call`, `visit`: interest per action (scaled by the school's appeal; the coach's by his
 *   `recruit` too). `coachTargets` per position coach a round; `calls`/`visits` per head coach a round.
 * - `threshold`: the score a player needs to sign in rounds 1 and 2, raised by `thrOvr` per 5 overall
 *   over 75 and `thrOffers` per extra offer; `floor` in the last round.
 */
export const PORTAL = {
  rosterMax: 85,
  origin: { win: 0.5, dev: 0.15 },
  lossAversion: 2,
  signShare: 0.5,
  ptScale: 2.5,
  crackPt: 0.5,
  marketPct: 0.85,
  marketMin: 3,
  win: { season: 0.45, recent: 0.3, brand: 0.25, titleBrand: 0.05, history: 2 },
  dev: { teach: 0.6, record: 0.4 },
  home: { state: 1, region: 0.6, away: 0.2 },
  roomW: 0.05,
  securityW: 0.05,
  entry: { base: -2.4, k: 5, morale: -1.5, loyal: -1.2, again: -1.0, broken: 1.2, cls: { FR: 0, SO: 0.2, JR: 0.1, SR: -0.3 } },
  considering: 0.2,
  leaningOut: 0.5,
  meet: { n: 4, base: 0.55, loyal: 0.5, gap: 1.5, lift: 1.5, reason: { buried: -0.15, contender: 0, home: -0.1, develop: 0, morale: 0.05 } as Record<PortalReason, number> },
  promise: { start: 2.5, snaps: 1.5, pt: { start: 0.9, snaps: 0.65 }, kept: 0.15, broken: 0.4, startShare: 0.6, snapsShare: 0.2 },
  freshStart: 0.15,
  returnHit: 0.25,
  coachTargets: 3,
  coach: 0.12,
  call: 0.05,
  visit: 0.15,
  calls: 6,
  visits: 3,
  overOffer: 2,
  focus: 2,
  familiar: 0.05,
  threshold: [0.8, 0.65],
  thrOvr: 0.05,
  thrOffers: 0.04,
  floor: 0.25,
  /** CPU staffs: at-risk starters they meet, and offers per position beyond the first. */
  cpuMeets: 4,
  posOffers: 2,
};

/** The fewest players a roster keeps at each position, so every slot stays playable. */
export const MIN_COUNT: Record<Position, number> = {
  QB: 2, HB: 2, FB: 1, WR: 4, TE: 2, OT: 3, OG: 3, C: 2, DE: 3, DT: 3, OLB: 2, MLB: 2, CB: 4, FS: 1, SS: 1, K: 1, P: 1,
};

export type Motive = 'PT' | 'WIN' | 'DEV' | 'HOME';
export const MOTIVES: Motive[] = ['PT', 'WIN', 'DEV', 'HOME'];
export const MOTIVE_LABEL: Record<Motive, string> = { PT: 'PLAYING TIME', WIN: 'A CONTENDER', DEV: 'DEVELOPMENT', HOME: 'CLOSE TO HOME' };
export const REASON_LABEL: Record<PortalReason, string> = {
  buried: 'BURIED ON THE DEPTH CHART', contender: 'WANTS A CONTENDER', home: 'CLOSER TO HOME', develop: 'WANTS TO DEVELOP', morale: 'UNHAPPY HERE',
};
const MOTIVE_REASON: Record<Motive, PortalReason> = { PT: 'buried', WIN: 'contender', DEV: 'develop', HOME: 'home' };

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const motiveCache = new Map<string, Record<Motive, number>>();

/**
 * What he wants from a school, weights summing to 1. Hidden and drawn from his id, never stored, like
 * his temperament: PT runs with his pride, WIN with how much the team's results move him. Where he
 * signed out of high school says something too: a power program's recruit chose a contender and the
 * NFL path (`origin`), a smaller program's chose a place to play.
 */
export function motives(a: Pick<Athlete, 'id'>): Record<Motive, number> {
  let m = motiveCache.get(a.id);
  if (m) return m;
  const t = temperament(a);
  const rng = mulberry32(hashString(`portal:${a.id}`));
  const o = originTeam(a.id);
  const lean = o ? (3 - teamById(o).profile.tier) / 2 : 0;
  const raw: Record<Motive, number> = {
    PT: Math.max(0.1, 1 + (t.pride - 1) + 0.35 * gauss(rng)),
    WIN: Math.max(0.1, 0.8 + 0.8 * (t.team - 1) + PORTAL.origin.win * lean + 0.35 * gauss(rng)),
    DEV: Math.max(0.1, 0.6 + PORTAL.origin.dev * lean + 0.3 * gauss(rng)),
    HOME: Math.max(0.05, 0.45 + 0.3 * gauss(rng)),
  };
  const sum = raw.PT + raw.WIN + raw.DEV + raw.HOME;
  m = { PT: raw.PT / sum, WIN: raw.WIN / sum, DEV: raw.DEV / sum, HOME: raw.HOME / sum };
  motiveCache.set(a.id, m);
  return m;
}

/** His two biggest wants, biggest first. */
export function topMotives(a: Pick<Athlete, 'id'>): Motive[] {
  const m = motives(a);
  return [...MOTIVES].sort((x, y) => m[y] - m[x]).slice(0, 2);
}

/** One school as the portal sees it this round. */
export interface School {
  id: string;
  home: string;
  win: number;
  dev: Record<Group, number>;
  /** The room's mood and the coach's security, as small terms. */
  room: number;
  extra: number;
  /** Overalls at each position, best first: the roster without his players still in the portal. */
  chart: Map<Position, number[]>;
  count: Map<Position, number>;
  size: number;
  /** Players who left it for the portal, and transfers it has signed. */
  left: number;
  signed: number;
}

export interface Board {
  schools: Map<string, School>;
  /** Everyone on a roster, by id: where he is (entrants still at the school they left) and his overall. */
  players: Map<string, { a: Athlete; team: string; ovr: number }>;
}

/** A season's standing, 0..1: half the final AP rank, half the win share. */
function standingOf(rank: number, wp: number): number {
  return 0.5 * (rank ? (26 - rank) / 25 : 0) + 0.5 * clamp((wp - 0.25) / 0.65, 0, 1);
}

function winShares(state: SeasonState): Map<string, number> {
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
  return new Map([...w].map(([id, [a, b]]) => [id, a / b]));
}

/** WIN: this season's finish, the last seasons' from history, and a slow brand from prestige and titles. */
function winFactor(state: SeasonState, id: string, wp: number): number {
  const season = standingOf(rankIn(latestPoll(state, 'ap'), id), wp);
  const past = state.history.filter((h) => h.year < state.year && h.ap).slice(-PORTAL.win.history);
  const recent = past.length ? past.reduce((s, h) => s + standingOf(h.ap!.indexOf(id) + 1, h.wp?.[id] ?? 0.5), 0) / past.length : season;
  const titles = state.history.filter((h) => h.champion === id).length;
  const brand = clamp(teamById(id).profile.prestige / 100 + titles * PORTAL.win.titleBrand, 0, 1);
  return PORTAL.win.season * season + PORTAL.win.recent * recent + PORTAL.win.brand * brand;
}

const boardCache = new WeakMap<PortalState | SeasonState, { key: string; board: Board }>();

const boardKey = (state: SeasonState) =>
  state.portal ? `${state.year}:${state.portal.entrants.length}:${state.portal.entrants.filter((e) => e.out).length}` : `${state.year}:-`;

/**
 * The board: every school's chart and reputation, cached until entries or placements change it.
 * `decide` and `closePortal` update it in place as players sign, then drop it, so the next step always
 * starts from a fresh build: a saved portal continues exactly as an unbroken one.
 */
export function buildBoard(state: SeasonState): Board {
  const portal = state.portal;
  const owner = portal ?? state;
  const key = boardKey(state);
  const hit = boardCache.get(owner);
  if (hit && hit.key === key) return hit.board;
  const pending = new Set(portal?.entrants.filter((e) => !e.out).map((e) => e.id));
  const left = new Map<string, number>();
  const signed = new Map<string, number>();
  for (const e of portal?.entrants ?? []) {
    left.set(e.from, (left.get(e.from) ?? 0) + 1);
    const to = e.out === 'commit' ? portal!.commits[e.id] : undefined;
    if (to && to !== e.from) signed.set(to, (signed.get(to) ?? 0) + 1);
  }
  const wp = winShares(state);
  // Development record: level-ups per player this season and the last two, as a percentile.
  const rec = TEAMS.map((t) => {
    const now = (state.teamState[t.id]?.lu ?? 0) / Math.max(1, baseRoster(state, t.id).length);
    const past = state.history.filter((h) => h.year < state.year && h.dev).slice(-2).map((h) => h.dev![t.id] ?? now);
    return { id: t.id, v: (now + past.reduce((a, b) => a + b, 0)) / (1 + past.length) };
  }).sort((a, b) => a.v - b.v);
  const devPct = new Map(rec.map((r, i) => [r.id, i / Math.max(1, rec.length - 1)]));
  const schools = new Map<string, School>();
  const players: Board['players'] = new Map();
  const user = state.config.userTeamId;
  for (const t of TEAMS) {
    const sq = squadFor(state, t.id);
    const staff = staffFor(state, t.id);
    const ts = state.teamState[t.id];
    const chart = new Map<Position, number[]>();
    const count = new Map<Position, number>();
    let size = 0;
    let mood = 0;
    for (const a of sq.athletes) {
      const ovr = overall(a.r, a.pos);
      players.set(a.id, { a, team: t.id, ovr });
      mood += moraleOf(ts, a);
      if (pending.has(a.id)) continue;
      size++;
      count.set(a.pos, (count.get(a.pos) ?? 0) + 1);
      let c = chart.get(a.pos);
      if (!c) chart.set(a.pos, (c = []));
      c.push(ovr);
    }
    for (const c of chart.values()) c.sort((x, y) => y - x);
    const dev = {} as Record<Group, number>;
    for (const g of GROUPS) dev[g] = PORTAL.dev.teach * clamp(((staff[g].r.teach ?? 50) - 30) / 65, 0, 1) + PORTAL.dev.record * (devPct.get(t.id) ?? 0.5);
    const security = t.id === user && state.config.coachCareer && state.coach ? (state.coach.security - 50) / 50 : 0;
    schools.set(t.id, {
      id: t.id, home: TEAM_STATE[t.id] ?? 'TX', win: winFactor(state, t.id, wp.get(t.id) ?? 0.5), dev,
      room: PORTAL.roomW * (mood / Math.max(1, sq.athletes.length)), extra: PORTAL.securityW * security,
      chart, count, size, left: left.get(t.id) ?? 0, signed: signed.get(t.id) ?? 0,
    });
  }
  const board = { schools, players };
  boardCache.set(owner, { key, board });
  return board;
}

/**
 * PT: where his overall projects on the school's chart at his position. A logistic on his overall
 * against the bar, the overall of the last starter he'd have to beat (`self`: he's on this chart, so
 * skip him). A promise of snaps or a starting shot sets a floor.
 */
export function ptFactor(s: School, pos: Position, ovr: number, self?: number, promise?: CoachPromise['kind']): number {
  const chart = s.chart.get(pos) ?? [];
  const n = STARTERS[pos];
  let bar: number | undefined;
  let skipped = self === undefined;
  let k = 0;
  for (const o of chart) {
    if (!skipped && o === self) {
      skipped = true;
      continue;
    }
    if (++k === n) {
      bar = o;
      break;
    }
  }
  const f = bar === undefined ? 1 : sigmoid((ovr - bar) / PORTAL.ptScale);
  return promise ? Math.max(f, PORTAL.promise.pt[promise]) : f;
}

function homeFactor(a: Athlete, s: School): number {
  const st = a.hometown.state;
  if (st === s.home) return PORTAL.home.state;
  return REGION[st] && REGION[st] === REGION[s.home] ? PORTAL.home.region : PORTAL.home.away;
}

/** `ref`: his current program's WIN, so a step down from it costs extra (`lossAversion`). */
export function factors(s: School, a: Athlete, ovr: number, self?: number, promise?: CoachPromise['kind'], ref?: number): Record<Motive, number> {
  const win = ref === undefined ? s.win : s.win - PORTAL.lossAversion * Math.max(0, ref - s.win);
  return { PT: ptFactor(s, a.pos, ovr, self, promise), WIN: win, DEV: s.dev[groupOf(a.pos)], HOME: homeFactor(a, s) };
}

/** A school's appeal to him: his motives times its factors, plus the room's mood and the coach's security. */
export function appeal(
  s: School, a: Athlete, ovr: number, opts: { self?: number; promise?: CoachPromise['kind']; familiar?: boolean; ref?: number } = {},
): number {
  const m = motives(a);
  const f = factors(s, a, ovr, opts.self, opts.promise, opts.ref);
  return m.PT * f.PT + m.WIN * f.WIN + m.DEV * f.DEV + m.HOME * f.HOME + s.room + s.extra + (opts.familiar ? PORTAL.familiar : 0);
}

export interface EntryOdds {
  /** Odds of entering, and the logit before any meeting or promise. */
  p: number;
  logit: number;
  stay: number;
  market: number;
  reason: PortalReason;
}

/**
 * Whether he'd enter: a logistic on how much better his market looks than staying. `stay` is his
 * school's appeal with PT from his own chart; `market` a high percentile of his appeal over the schools
 * whose chart he'd crack. Low morale pushes him out; loyalty, a past transfer and class hold him.
 */
export function entryOdds(state: SeasonState, board: Board, id: string): EntryOdds {
  const pl = board.players.get(id)!;
  const { a, team, ovr } = pl;
  const own = board.schools.get(team)!;
  const m = motives(a);
  const fs = factors(own, a, ovr, ovr);
  const stay = m.PT * fs.PT + m.WIN * fs.WIN + m.DEV * fs.DEV + m.HOME * fs.HOME + own.room + own.extra;
  const all: { v: number; f: Record<Motive, number> }[] = [];
  const crack: typeof all = [];
  for (const s of board.schools.values()) {
    if (s.id === team) continue;
    const f = factors(s, a, ovr, undefined, undefined, own.win);
    const x = { v: m.PT * f.PT + m.WIN * f.WIN + m.DEV * f.DEV + m.HOME * f.HOME + s.room + s.extra, f };
    all.push(x);
    if (f.PT >= PORTAL.crackPt) crack.push(x);
  }
  const pool = (crack.length >= PORTAL.marketMin ? crack : all).sort((x, y) => y.v - x.v);
  const pick = pool[Math.floor((1 - PORTAL.marketPct) * (pool.length - 1))];
  const market = pick.v;
  const ts = state.teamState[team];
  const prog = ts?.progress?.[id];
  const t = temperament(a);
  const mo = moraleOf(ts, a);
  const E = PORTAL.entry;
  const logit = E.base + E.k * (market - stay) + E.morale * mo + E.loyal * (t.team - 1)
    + (prog?.tr ? E.again : 0) + (prog?.pb === state.year ? E.broken : 0) + E.cls[a.year];
  let best: Motive = 'PT';
  let gap = -Infinity;
  for (const k of MOTIVES) {
    const d = m[k] * (pick.f[k] - fs[k]);
    if (d > gap) [best, gap] = [k, d];
  }
  const reason = mo < -0.3 && E.morale * mo > E.k * gap ? 'morale' : MOTIVE_REASON[best];
  return { p: walkOn(id) ? 0 : sigmoid(logit), logit, stay, market, reason };
}

const walkOn = (id: string) => !!parseWalkOn(id);

/** He's back on a school's chart (signed, or home again): the board in place, re-keyed. */
function onChart(state: SeasonState, board: Board, id: string, team: string): void {
  const pl = board.players.get(id)!;
  const s = board.schools.get(team)!;
  if (pl.team !== team) s.signed++;
  pl.team = team;
  s.size++;
  s.count.set(pl.a.pos, (s.count.get(pl.a.pos) ?? 0) + 1);
  const c = s.chart.get(pl.a.pos) ?? [];
  c.push(pl.ovr);
  c.sort((x, y) => y - x);
  s.chart.set(pl.a.pos, c);
  boardCache.set(state.portal ?? state, { key: boardKey(state), board });
}

const dropBoard = (state: SeasonState) => boardCache.delete(state.portal ?? state);

const entrantIndex = new WeakMap<PortalEntrant[], { n: number; map: Map<string, PortalEntrant> }>();

export function newPortal(): PortalState {
  return { entrants: [], interest: {}, offers: {}, commits: {}, promises: {}, adj: {}, forced: [], leaving: {}, meets: 0, spent: {}, focus: [], drop: [] };
}

/** The user's players considering the portal: odds before anything is done, and why. */
export function leavingList(state: SeasonState, team: string): Record<string, LeavingEntry> {
  const board = buildBoard(state);
  const out: Record<string, LeavingEntry> = {};
  for (const [id, pl] of board.players) {
    if (pl.team !== team || walkOn(id)) continue;
    const o = entryOdds(state, board, id);
    if (o.p >= PORTAL.considering) out[id] = { p: Math.round(o.p * 1000) / 1000, reason: o.reason };
  }
  return out;
}

export const leaning = (e: LeavingEntry) => (e.p >= PORTAL.leaningOut ? 'LEANING OUT' : 'TORN');

/** Meeting odds: his reason, his loyalty and how far his market beats staying. */
export function meetOdds(state: SeasonState, id: string): number {
  const board = buildBoard(state);
  const o = entryOdds(state, board, id);
  const t = temperament(board.players.get(id)!.a);
  const M = PORTAL.meet;
  return clamp(M.base + M.loyal * (t.team - 1) - M.gap * Math.max(0, o.market - o.stay) + M.reason[o.reason], 0.1, 0.9);
}

function meet(state: SeasonState, id: string): boolean {
  const ok = seasonRng(state, 'portal', 'meet', id)() < meetOdds(state, id);
  if (ok) state.portal!.adj[id] = (state.portal!.adj[id] ?? 0) - PORTAL.meet.lift;
  return ok;
}

/** A promise on his progress: judged after next season (`judgePromises`). */
function promiseOn(state: SeasonState, team: string, id: string, kind: CoachPromise['kind']): void {
  const ts = (state.teamState[team] ??= {});
  const p = ((ts.progress ??= {})[id] ??= { xp: 0, lvl: 0, d: {} });
  p.pr = { kind, year: state.year + 1, to: team };
}

export type LeavingAction = 'meet' | 'promise' | 'go' | 'encourage';

/**
 * The user acts on a player considering the portal (round 0). MEET (limited) may talk him into
 * staying; PROMISE a start or snaps holds him harder, but is judged next season; ENCOURAGE sends him.
 * Returns false when the action isn't allowed.
 */
export function actOnLeaving(state: SeasonState, id: string, act: LeavingAction, kind: CoachPromise['kind'] = 'start'): boolean {
  const portal = state.portal;
  const e = portal?.leaving[id];
  if (!portal || !e || state.offseason?.round !== 0) return false;
  if (e.act && e.act !== 'go') return false;
  const team = state.config.userTeamId;
  if (act === 'meet') {
    if (portal.meets >= PORTAL.meet.n) return false;
    portal.meets++;
    e.ok = meet(state, id);
  } else if (act === 'promise') {
    portal.adj[id] = (portal.adj[id] ?? 0) - PORTAL.promise[kind];
    promiseOn(state, team, id, kind);
    e.kind = kind;
  } else if (act === 'encourage') {
    portal.forced.push(id);
  }
  e.act = act;
  return true;
}

/** CPU staffs (and a delegated user) meet their at-risk starters, best first. */
function autoLeaving(state: SeasonState, board: Board, team: string, odds: Map<string, EntryOdds>): void {
  const s = board.schools.get(team)!;
  const risk = [...board.players.values()]
    .filter((pl) => pl.team === team && (odds.get(pl.a.id)?.p ?? 0) >= PORTAL.considering && ptFactor(s, pl.a.pos, pl.ovr, pl.ovr) >= 0.5)
    .sort((x, y) => y.ovr - x.ovr)
    .slice(0, PORTAL.cpuMeets);
  for (const pl of risk) meet(state, pl.a.id);
}

/** Roster room: the cap less everyone on the roster who isn't in the portal. */
export function rosterRoom(board: Board, team: string): number {
  return PORTAL.rosterMax - board.schools.get(team)!.size;
}

/** Spots open to transfers: roster room, within `signShare` of the school's departures. */
export function openSpots(board: Board, team: string): number {
  const s = board.schools.get(team)!;
  return Math.min(rosterRoom(board, team), Math.ceil(PORTAL.signShare * s.left) - s.signed);
}

/** Spots the school still needs for positions under their minimum, once a player at `pos` joins. */
function needAfter(board: Board, team: string, pos: Position): number {
  const s = board.schools.get(team)!;
  let need = 0;
  for (const p of POSITIONS) need += Math.max(0, MIN_COUNT[p] - (s.count.get(p) ?? 0) - (p === pos ? 1 : 0));
  return need;
}

/** Whether he'd fit: a spot left after him for every position still under its minimum. */
export function canSign(board: Board, team: string, pos: Position): boolean {
  const open = openSpots(board, team);
  return open >= 1 && needAfter(board, team, pos) <= Math.min(open, rosterRoom(board, team)) - 1;
}

/** The cap on a school's open offers: its open spots plus a small over-offer margin. */
export function offerCap(board: Board, team: string): number {
  return Math.max(0, openSpots(board, team)) + PORTAL.overOffer;
}

export function entrant(portal: PortalState, id: string): PortalEntrant | undefined {
  let ix = entrantIndex.get(portal.entrants);
  if (!ix || ix.n !== portal.entrants.length) {
    ix = { n: portal.entrants.length, map: new Map(portal.entrants.map((e) => [e.id, e])) };
    entrantIndex.set(portal.entrants, ix);
  }
  return ix.map.get(id);
}

const pendingEntrants = (portal: PortalState) => portal.entrants.filter((e) => !e.out);

/** How much he likes a school right now: its appeal (with any promise it made him) plus the interest it built. */
export function score(state: SeasonState, board: Board, id: string, team: string): number {
  const portal = state.portal!;
  const pl = board.players.get(id)!;
  const s = board.schools.get(team)!;
  const from = entrant(portal, id)?.from;
  const ref = from ? board.schools.get(from)!.win : undefined;
  return appeal(s, pl.a, pl.ovr, { promise: portal.promises[`${team}:${id}`], familiar: from === team, ref }) + (portal.interest[id]?.[team] ?? 0);
}

export type Standing = 'high' | 'list' | 'luke' | 'not';
export const STANDING_LABEL: Record<Standing, string> = { high: 'RATES YOU HIGH', list: 'ON HIS LIST', luke: 'LUKEWARM', not: 'NOT INTERESTED' };

/** Every school's score for him, best first. */
export function rankings(state: SeasonState, board: Board, id: string): { team: string; v: number }[] {
  return TEAMS.map((t) => ({ team: t.id, v: score(state, board, id, t.id) })).sort((a, b) => b.v - a.v);
}

/** Each entrant's sixth-best score: a school at or above it is on his list. For the CPU staffs, once a round. */
export function listCuts(state: SeasonState): Map<string, number> {
  const board = buildBoard(state);
  return new Map(pendingEntrants(state.portal!).map((e) => [e.id, rankings(state, board, e.id)[5].v]));
}

/** Where a school stands with him: top 3, top 6, top 20, or not at all. */
export function standing(state: SeasonState, board: Board, id: string, team: string): { tag: Standing; rank: number; v: number } {
  const r = rankings(state, board, id);
  const rank = r.findIndex((x) => x.team === team) + 1;
  const tag: Standing = rank <= 3 ? 'high' : rank <= 6 ? 'list' : rank <= 20 ? 'luke' : 'not';
  return { tag, rank, v: r[rank - 1].v };
}

/** The schools working on him: interest or an offer, best first. */
export function suitors(state: SeasonState, board: Board, id: string): string[] {
  const portal = state.portal!;
  const s = new Set(Object.keys(portal.interest[id] ?? {}));
  for (const [t, ids] of Object.entries(portal.offers)) if (ids.includes(id)) s.add(t);
  return [...s].map((t) => ({ t, v: score(state, board, id, t) })).sort((a, b) => b.v - a.v).map((x) => x.t);
}

const addInterest = (portal: PortalState, id: string, team: string, x: number) => {
  const m = (portal.interest[id] ??= {});
  m[team] = Math.round(((m[team] ?? 0) + x) * 1000) / 1000;
};

const spentBy = (portal: PortalState, team: string) => (portal.spent[team] ??= { calls: [], visits: [] });

/** Offer a spot, optionally with a promise. Capped by open spots plus the margin, and by position minimums. */
export function offer(state: SeasonState, team: string, id: string, promise?: CoachPromise['kind']): boolean {
  const portal = state.portal;
  const round = state.offseason?.round ?? 0;
  const e = portal && entrant(portal, id);
  if (!portal || !e || e.out || round < 1) return false;
  const board = buildBoard(state);
  const mine = (portal.offers[team] ??= []);
  if (mine.includes(id)) {
    if (promise) portal.promises[`${team}:${id}`] = promise;
    return true;
  }
  if (mine.length >= offerCap(board, team) || !canSign(board, team, e.pos)) return false;
  mine.push(id);
  if (promise) portal.promises[`${team}:${id}`] = promise;
  return true;
}

export function withdraw(state: SeasonState, team: string, id: string): void {
  const portal = state.portal;
  if (!portal) return;
  portal.offers[team] = (portal.offers[team] ?? []).filter((x) => x !== id);
  delete portal.promises[`${team}:${id}`];
}

/** A head coach's call (small) or visit (big): interest scaled by his school's appeal. Limited per round. */
export function pursue(state: SeasonState, team: string, id: string, kind: 'call' | 'visit'): boolean {
  const portal = state.portal;
  const round = state.offseason?.round ?? 0;
  const e = portal && entrant(portal, id);
  if (!portal || !e || e.out || round < 1) return false;
  const sp = spentBy(portal, team);
  const list = kind === 'call' ? sp.calls : sp.visits;
  if (list.includes(id) || list.length >= (kind === 'call' ? PORTAL.calls : PORTAL.visits)) return false;
  list.push(id);
  const board = buildBoard(state);
  const pl = board.players.get(id)!;
  const ap = appeal(board.schools.get(team)!, pl.a, pl.ovr, { familiar: e.from === team, ref: board.schools.get(e.from)!.win });
  const r = seasonRng(state, 'portal', kind, round, team, id)();
  addInterest(portal, id, team, PORTAL[kind] * (0.5 + ap) * (0.75 + 0.5 * r));
  return true;
}

/** The user's position coaches: work a target harder, or stop working one. */
export function setTarget(state: SeasonState, id: string, how: 'focus' | 'drop' | 'none'): void {
  const portal = state.portal;
  if (!portal) return;
  portal.focus = portal.focus.filter((x) => x !== id);
  portal.drop = portal.drop.filter((x) => x !== id);
  if (how !== 'none') portal[how].push(id);
}

/** The starting bar at a position: the overall of the last starter on the chart (`deep` 2: the two-deep's). */
function barAt(s: School, pos: Position, deep = 1): number {
  return s.chart.get(pos)?.[STARTERS[pos] * deep - 1] ?? -Infinity;
}

/**
 * Each position coach works the entrants who'd improve his chart: a fixed number a round, the best
 * first (with a lean toward the gettable). Interest grows with his `recruit` and the school's appeal.
 * The user's focused targets get extra work; dropped ones none. Returns each school's targets.
 */
export function coachesWork(state: SeasonState, round: number): Map<string, string[]> {
  const portal = state.portal!;
  const board = buildBoard(state);
  const user = state.config.userTeamId;
  const pending = pendingEntrants(portal);
  const out = new Map<string, string[]>();
  for (const t of TEAMS) {
    const s = board.schools.get(t.id)!;
    const staff = staffFor(state, t.id);
    const mine: string[] = [];
    for (const g of GROUPS) {
      const rec = clamp(((staff[g].r.recruit ?? 50) - 30) / 65, 0, 1);
      const rng = seasonRng(state, 'portal', 'coach', round, t.id, g);
      const cands = pending
        .filter((e) => groupOf(e.pos) === g && e.ovr > barAt(s, e.pos) - 1 && !(t.id === user && portal.drop.includes(e.id)))
        .map((e) => {
          const pl = board.players.get(e.id)!;
          return { e, ap: appeal(s, pl.a, pl.ovr, { familiar: e.from === t.id, ref: board.schools.get(e.from)!.win }), focus: t.id === user && portal.focus.includes(e.id) };
        })
        .sort((x, y) => Number(y.focus) - Number(x.focus) || y.e.ovr + 10 * y.ap - (x.e.ovr + 10 * x.ap));
      for (const c of cands.filter((c, i) => c.focus || i < PORTAL.coachTargets)) {
        const gain = PORTAL.coach * (0.5 + rec) * (0.5 + c.ap) * (0.75 + 0.5 * rng()) * (c.focus ? PORTAL.focus : 1);
        addInterest(portal, c.e.id, t.id, gain);
        mine.push(c.e.id);
      }
    }
    out.set(t.id, mine);
  }
  return out;
}

/**
 * A CPU head coach's round (and a delegated user's): offers to the entrants who'd improve his chart and
 * have him on their list, best first, up to the cap and a few per position; then visits to the best
 * he's offered and calls to the next.
 */
export function autoPortal(state: SeasonState, team: string, cuts: Map<string, number>): void {
  const portal = state.portal!;
  const board = buildBoard(state);
  const s = board.schools.get(team)!;
  const offered = (portal.offers[team] ??= []);
  const byPos = new Map<Position, number>();
  for (const id of offered) {
    const e = entrant(portal, id)!;
    byPos.set(e.pos, (byPos.get(e.pos) ?? 0) + 1);
  }
  // Starters first; with spots to fill, players who'd make the two-deep too.
  const cands = pendingEntrants(portal)
    .filter((e) => !offered.includes(e.id) && e.ovr > barAt(s, e.pos, 2))
    .map((e) => ({ e, v: score(state, board, e.id, team), starts: e.ovr > barAt(s, e.pos) - 1 }))
    .filter((c) => c.v >= (cuts.get(c.e.id) ?? Infinity))
    .sort((x, y) => Number(y.starts) - Number(x.starts) || y.e.ovr - x.e.ovr || y.v - x.v);
  for (const { e } of cands) {
    if (offered.length >= offerCap(board, team)) break;
    const n = byPos.get(e.pos) ?? 0;
    if (n >= PORTAL.posOffers + (STARTERS[e.pos] >= 3 ? 1 : 0)) continue;
    if (!canSign(board, team, e.pos)) continue;
    offered.push(e.id);
    byPos.set(e.pos, n + 1);
  }
  const best = [...offered].sort((x, y) => (entrant(portal, y)?.ovr ?? 0) - (entrant(portal, x)?.ovr ?? 0));
  for (const id of best.slice(0, PORTAL.visits)) pursue(state, team, id, 'visit');
  for (const id of best.slice(PORTAL.visits, PORTAL.visits + PORTAL.calls)) pursue(state, team, id, 'call');
}

const portalNews = (state: SeasonState, text: string, teams: string[]): NewsItem => ({ week: state.week, kind: 'portal', text, teams });

/** Move a player between rosters, with his progression, morale and health. A transfer keeps his id. */
function moveAthlete(state: SeasonState, id: string, from: string, to: string): void {
  const a = generatedAthlete(id)!;
  const fr = (state.teamState[from] ??= {});
  const tt = (state.teamState[to] ??= {});
  const taken = baseRoster(state, to).map((x) => x.num);
  dropFrom(fr, id);
  const r2 = (tt.roster ??= {});
  if (r2.out?.includes(id)) r2.out = r2.out.filter((x) => x !== id);
  else (r2.in ??= []).push({ id, num: freeNumber(seasonRng(state, 'portal', 'num', id), a.pos, taken) });
  // Progress and health travel; confidence halves and morale starts fresh.
  const p: Progress = fr.progress?.[id] ?? { xp: 0, lvl: 0, d: {} };
  delete fr.progress?.[id];
  if (p.c) p.c = Math.round(p.c * CONFIDENCE.offseason * 1000) / 1000;
  p.tr = { from, year: state.year };
  (tt.progress ??= {})[id] = p;
  const h = fr.health?.[id];
  if (h !== undefined) (tt.health ??= {})[id] = h;
  delete fr.health?.[id];
  const inj = fr.injuries?.[id];
  if (inj) (tt.injuries ??= {})[id] = inj;
  delete fr.injuries?.[id];
  delete fr.mo?.[id];
  (tt.mo ??= {})[id] = Math.round(clamp(temperament(a).base + PORTAL.freshStart, -1, 1) * 1000) / 1000;
  delete tt.depth;
  tell(state, id, { team: to, from, kind: 'transfer', text: `Transfers from ${teamById(from).school} to ${teamById(to).school}` });
}

/** Take him off a roster (and its week marks and the user's chart). */
function dropFrom(ts: TeamState, id: string): void {
  const r = (ts.roster ??= {});
  if (r.in?.some((e) => e.id === id)) r.in = r.in.filter((e) => e.id !== id);
  else (r.out ??= []).push(id);
  for (const [slot, x] of Object.entries(ts.st ?? {})) if (x === id) delete ts.st![slot];
  delete ts.depth;
}

/** He leaves FBS: off his roster, and his records with him. */
function leaveFbs(state: SeasonState, id: string, from: string): void {
  const ts = (state.teamState[from] ??= {});
  dropFrom(ts, id);
  delete ts.progress?.[id];
  delete ts.mo?.[id];
  delete ts.health?.[id];
  delete ts.injuries?.[id];
  tell(state, id, { team: from, kind: 'left', text: 'Leaves FBS' });
}

function sign(state: SeasonState, board: Board, e: PortalEntrant, team: string): void {
  const portal = state.portal!;
  const user = state.config.userTeamId;
  if (team !== e.from) moveAthlete(state, e.id, e.from, team);
  else tell(state, e.id, { team, kind: 'portal', text: `Returns to ${teamById(team).school}` });
  e.out = 'commit';
  onChart(state, board, e.id, team);
  portal.commits[e.id] = team;
  for (const ids of Object.values(portal.offers)) {
    const i = ids.indexOf(e.id);
    if (i >= 0) ids.splice(i, 1);
  }
  const kind = portal.promises[`${team}:${e.id}`];
  if (kind) promiseOn(state, team, e.id, kind);
  for (const k of Object.keys(portal.promises)) if (k.endsWith(`:${e.id}`)) delete portal.promises[k];
  if (openSpots(board, team) <= 0) portal.offers[team] = [];
  const a = board.players.get(e.id)!.a;
  if (team === user || e.from === user || a.real || e.ovr >= 85) {
    const verb = team === e.from ? `returns to ${teamById(team).school}` : `commits to ${teamById(team).school}`;
    state.news.push(portalNews(state, `PORTAL: ${athleteName(a)} (${teamById(e.from).abbr} ${e.pos}, ${e.ovr}) ${verb}`, [team, e.from]));
  }
}

/** Each player with offers picks his best if it clears his bar; stars first, so a filled roster closes. */
export function decide(state: SeasonState, round: number): void {
  const portal = state.portal!;
  const final = round >= 2;
  const order = pendingEntrants(portal).sort((a, b) => b.ovr - a.ovr);
  for (const e of order) {
    const board = buildBoard(state);
    const teams = Object.entries(portal.offers).filter(([t, ids]) => ids.includes(e.id) && canSign(board, t, e.pos)).map(([t]) => t);
    if (!teams.length) continue;
    const best = teams.map((t) => ({ t, v: score(state, board, e.id, t) })).sort((a, b) => b.v - a.v)[0];
    const thr = final ? PORTAL.floor : PORTAL.threshold[round - 1] + (PORTAL.thrOvr * (e.ovr - 75)) / 5 + PORTAL.thrOffers * (teams.length - 1);
    if (best.v >= thr) sign(state, board, e, best.t);
  }
  dropBoard(state);
}

/** Roll who enters, after meetings and promises. CPU staffs meet their at-risk starters first. */
export function rollEntries(state: SeasonState): void {
  const portal = state.portal!;
  const user = state.config.userTeamId;
  const board = buildBoard(state);
  const odds = new Map<string, EntryOdds>();
  for (const id of board.players.keys()) odds.set(id, entryOdds(state, board, id));
  for (const t of TEAMS) if (t.id !== user || state.config.delegate.portal) autoLeaving(state, board, t.id, odds);
  const forced = new Set(portal.forced);
  for (const [id, pl] of board.players) {
    if (walkOn(id)) continue;
    const o = odds.get(id)!;
    const p = sigmoid(o.logit + (portal.adj[id] ?? 0));
    if (forced.has(id) || seasonRng(state, 'portal', 'enter', id)() < p) {
      portal.entrants.push({ id, from: pl.team, pos: pl.a.pos, ovr: pl.ovr });
      tell(state, id, { team: pl.team, kind: 'portal', text: 'Enters the transfer portal' });
    }
  }
  const top = [...portal.entrants].sort((a, b) => b.ovr - a.ovr);
  state.news.push(portalNews(state, `PORTAL: ${portal.entrants.length} players enter the transfer portal`, []));
  const told = new Set<string>();
  for (const e of [...top.slice(0, 5), ...top.filter((e) => e.from === user)]) {
    if (told.has(e.id)) continue;
    told.add(e.id);
    const a = board.players.get(e.id)!.a;
    state.news.push(portalNews(state, `PORTAL: ${athleteName(a)} (${teamById(e.from).abbr} ${e.pos}, ${e.ovr}) enters the portal`, [e.from]));
  }
}

/**
 * The portal closes: the unplaced go back to their old school if it has a spot (unhappy about it), or
 * leave FBS; then walk-ons refill every roster below the cap, short positions first. Both are
 * placeholders until graduation and HS recruiting.
 */
export function closePortal(state: SeasonState): void {
  const portal = state.portal!;
  const board = buildBoard(state);
  for (const e of pendingEntrants(portal).sort((a, b) => b.ovr - a.ovr)) {
    if (rosterRoom(board, e.from) - 1 >= needAfter(board, e.from, e.pos)) {
      e.out = 'return';
      tell(state, e.id, { team: e.from, kind: 'portal', text: `No offer to his liking: back to ${teamById(e.from).school}` });
      onChart(state, board, e.id, e.from);
      const ts = (state.teamState[e.from] ??= {});
      const a = board.players.get(e.id)!.a;
      (ts.mo ??= {})[e.id] = Math.round(clamp(moraleOf(ts, a) - PORTAL.returnHit, -1, 1) * 1000) / 1000;
    } else {
      e.out = 'gone';
      leaveFbs(state, e.id, e.from);
    }
  }
  dropBoard(state);
  refillWalkOns(state);
  const placed = portal.entrants.filter((e) => e.out === 'commit').length;
  state.news.push(portalNews(state, `PORTAL CLOSES: ${placed} of ${portal.entrants.length} entrants signed with a new school`, []));
}

/** Walk-ons fill each roster to the cap: positions under their minimum first, then the furthest under its usual count. */
export function refillWalkOns(state: SeasonState): void {
  for (const t of TEAMS) {
    const roster = baseRoster(state, t.id);
    if (roster.length >= PORTAL.rosterMax) continue;
    const count = new Map<Position, number>();
    for (const a of roster) count.set(a.pos, (count.get(a.pos) ?? 0) + 1);
    const taken = roster.map((a) => a.num);
    const ts = (state.teamState[t.id] ??= {});
    const r = (ts.roster ??= {});
    const rng = seasonRng(state, 'portal', 'walkon', t.id);
    for (let n = 0, size = roster.length; size < PORTAL.rosterMax; n++, size++) {
      const short = POSITIONS.find((p) => (count.get(p) ?? 0) < MIN_COUNT[p]);
      const pos = short ?? COMPOSITION.map(([p, c]) => [p, c - (count.get(p) ?? 0)] as const).sort((a, b) => b[1] - a[1])[0][0];
      const id = walkOnId(t.id, state.year + 1, pos, n);
      const num = freeNumber(rng, pos, taken);
      taken.push(num);
      (r.in ??= []).push({ id, num });
      count.set(pos, (count.get(pos) ?? 0) + 1);
    }
  }
}

/**
 * Last season's promises: kept lifts his morale; broken drops it hard and pushes him toward this
 * portal. A promise from a team he's since left is void.
 */
export function judgePromises(state: SeasonState): { kept: number; broken: number } {
  let kept = 0;
  let broken = 0;
  for (const [team, ts] of Object.entries(state.teamState)) {
    for (const [id, p] of Object.entries(ts.progress ?? {})) {
      if (!p.pr || p.pr.year !== state.year) continue;
      const pr = p.pr;
      delete p.pr;
      if (pr.to !== team) continue;
      const gp = ts.gp ?? 0;
      const gs = p.gs ?? 0;
      const ok = pr.kind === 'start' ? gs >= PORTAL.promise.startShare * gp : gs >= Math.max(1, PORTAL.promise.snapsShare * gp);
      const a = { id };
      const m = moraleOf(ts, a) + (ok ? PORTAL.promise.kept : -PORTAL.promise.broken);
      (ts.mo ??= {})[id] = Math.round(clamp(m, -1, 1) * 1000) / 1000;
      if (ok) kept++;
      else {
        broken++;
        p.pb = state.year;
      }
    }
  }
  return { kept, broken };
}
