import { teamRatings } from '../data/depth';
import { TEAMS } from '../data/teams';
import { clamp, gauss } from '../engine/math';
import { played, records, type TeamRecord } from './standings';
import type { Poll, SeasonState } from './types';
import { seasonRng, squadFor } from './world';

/**
 * Polls by simulated voters. Each voter scores every team on its resume (record, strength of schedule,
 * margin), a preseason prior that fades, and inertia toward last week's rank, plus a personal bias,
 * then ranks its top 25. Ballots are counted Borda style (25 points for 1st, 1 for 25th).
 */

export interface VoterWeights {
  voters: number;
  /** Per win, and the cost of a loss in wins. */
  win: number;
  loss: number;
  /** Per game played, times (average opponent win % - 0.5). */
  sos: number;
  /** Times the average margin, capped at `MARGIN_CAP` and scaled to -1..1. */
  margin: number;
  /** Times the preseason strength z-score; fades to 0 by week `priorFade`. */
  prior: number;
  priorFade: number;
  /** Times (26 - last rank) / 25 for teams ranked last week. */
  inertia: number;
  /** Per-voter noise on each team, in score units. */
  noise: number;
}

export const AP_WEIGHTS: VoterWeights = {
  voters: 62, win: 1, loss: 2, sos: 1.5, margin: 1.2, prior: 3, priorFade: 9, inertia: 2.5, noise: 0.6,
};

/** The committee: no preseason prior, more weight on schedule, little inertia, and 13 members who mostly agree. */
export const CFP_WEIGHTS: VoterWeights = {
  voters: 13, win: 1, loss: 1.8, sos: 2.5, margin: 0.8, prior: 0, priorFade: 1, inertia: 0.8, noise: 0.25,
};

const MARGIN_CAP = 21;
/** Preseason strength: the roster's overall and the program's prestige. */
const PRIOR_OVR = 0.75;
const PRIOR_PRESTIGE = 0.25;
const TOP = 25;

function priorZ(state: SeasonState): Map<string, number> {
  const raw = TEAMS.map((t) => {
    const ovr = teamRatings(squadFor(state, t.id)).ovr;
    return [t.id, ovr * PRIOR_OVR + t.profile.prestige * PRIOR_PRESTIGE] as const;
  });
  const mean = raw.reduce((s, [, v]) => s + v, 0) / raw.length;
  const sd = Math.sqrt(raw.reduce((s, [, v]) => s + (v - mean) ** 2, 0) / raw.length) || 1;
  return new Map(raw.map(([id, v]) => [id, (v - mean) / sd]));
}

/** Average win % of the opponents played, not counting their games against this team. */
function sosOf(state: SeasonState, id: string, recs: Map<string, TeamRecord>): number {
  const opps: number[] = [];
  for (const g of played(state)) {
    if (g.home !== id && g.away !== id) continue;
    const opp = g.home === id ? g.away : g.home;
    const r = recs.get(opp)!;
    const lostToUs = g.home === id ? g.result!.home > g.result!.away : g.result!.away > g.result!.home;
    const w = r.w - (lostToUs ? 0 : 1);
    const l = r.l - (lostToUs ? 1 : 0);
    opps.push(w + l > 0 ? w / (w + l) : 0.5);
  }
  return opps.length ? opps.reduce((a, b) => a + b, 0) / opps.length : 0.5;
}

function marginOf(state: SeasonState, id: string): number {
  const m: number[] = [];
  for (const g of played(state)) {
    if (g.home !== id && g.away !== id) continue;
    const d = g.home === id ? g.result!.home - g.result!.away : g.result!.away - g.result!.home;
    m.push(clamp(d, -MARGIN_CAP, MARGIN_CAP) / MARGIN_CAP);
  }
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
}

/** Every team's resume score before voter noise. */
function baseScores(state: SeasonState, week: number, w: VoterWeights, prev?: Poll): Map<string, number> {
  const recs = records(state);
  const prior = w.prior ? priorZ(state) : undefined;
  const fade = Math.max(0, 1 - week / w.priorFade);
  const prevRank = new Map(prev?.ranks.map((r, i) => [r.team, i + 1]));
  const out = new Map<string, number>();
  for (const t of TEAMS) {
    const r = recs.get(t.id)!;
    const gp = r.w + r.l;
    let s = w.win * (r.w - w.loss * r.l);
    s += w.sos * (sosOf(state, t.id, recs) - 0.5) * gp;
    s += w.margin * marginOf(state, t.id);
    if (prior) s += w.prior * prior.get(t.id)! * fade;
    const pr = prevRank.get(t.id);
    if (pr) s += w.inertia * (TOP + 1 - pr) / TOP;
    out.set(t.id, s);
  }
  return out;
}

export interface Ballots {
  /** Every team, best first: by points, then by average score. */
  order: string[];
  poll: Poll;
}

function vote(state: SeasonState, week: number, kind: Poll['kind'], w: VoterWeights, prev?: Poll): Ballots {
  const base = baseScores(state, week, w, prev);
  const rng = seasonRng(state, 'poll', kind, week);
  const points = new Map<string, number>();
  const firsts = new Map<string, number>();
  const mean = new Map<string, number>();
  for (let v = 0; v < w.voters; v++) {
    const ballot = TEAMS.map((t) => {
      const s = base.get(t.id)! + gauss(rng) * w.noise;
      mean.set(t.id, (mean.get(t.id) ?? 0) + s / w.voters);
      return [t.id, s] as const;
    }).sort((a, b) => b[1] - a[1]);
    ballot.slice(0, TOP).forEach(([id], i) => points.set(id, (points.get(id) ?? 0) + TOP - i));
    firsts.set(ballot[0][0], (firsts.get(ballot[0][0]) ?? 0) + 1);
  }
  const order = TEAMS.map((t) => t.id).sort(
    (a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0) || mean.get(b)! - mean.get(a)!,
  );
  const ranks = order.slice(0, TOP).map((team) => ({ team, points: points.get(team) ?? 0, firstPlace: firsts.get(team) ?? 0 }));
  return { order, poll: { week, kind, ranks } };
}

export function latestPoll(state: SeasonState, kind: Poll['kind'], beforeWeek = Infinity): Poll | undefined {
  for (let i = state.polls.length - 1; i >= 0; i--) {
    const p = state.polls[i];
    if (p.kind === kind && p.week < beforeWeek) return p;
  }
  return undefined;
}

/** 1-based rank in a poll, or 0 when unranked. */
export function rankIn(poll: Poll | undefined, team: string): number {
  if (!poll) return 0;
  return poll.ranks.findIndex((r) => r.team === team) + 1;
}

/** The AP poll after `week` (week 0 = preseason: the prior alone). */
export function apPoll(state: SeasonState, week: number): Ballots {
  return vote(state, week, 'ap', AP_WEIGHTS, latestPoll(state, 'ap', week));
}

/** The committee's rankings after `week`. `order` ranks every team, for playoff selection and bowls. */
export function cfpRankings(state: SeasonState, week: number): Ballots {
  return vote(state, week, 'cfp', CFP_WEIGHTS, latestPoll(state, 'cfp', week));
}
