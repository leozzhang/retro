import { teamRatings } from '../data/depth';
import { TEAMS } from '../data/teams';
import { clamp, gauss } from '../engine/math';
import { played } from './standings';
import type { Poll, SeasonGame, SeasonState } from './types';
import { seasonRng, squadFor } from './world';

/**
 * Polls by simulated voters. Each voter scores every team on its resume, game by game: a win is worth more
 * the better the opponent, a loss costs more the worse the opponent and the wider the margin, and every game
 * is judged by the opponent's standing now, so a loss to a team that later climbs into the top 25 costs less
 * each week. Opponents are judged by a power rating (`powerRatings`: capped margins and the opponents' own
 * ratings, so a conference's strength reaches all of its teams) blended with their rank in last week's poll.
 * On top: schedule strength, average margin, a preseason prior that fades (AP), and inertia toward last
 * week's rank, plus a personal bias, then each voter ranks a top 25. Ballots are counted Borda style.
 */

export interface VoterWeights {
  voters: number;
  /** A win: `winBase + winQual * quality(opp)`, quality 1 for the best team and about 0.37 for the 26th. */
  winBase: number;
  winQual: number;
  /**
   * A loss: `-(lossBase + lossBad * (1 - quality(opp)) + lossWorst * badness(opp)) * closeness`. The first share
   * is a voter's "was it to a good team" (it saturates past the top 40 or so), the second keeps a loss to the
   * 120th worse than one to the 50th; badness runs from 0 for the best team to 1 for the worst.
   */
  lossBase: number;
  lossBad: number;
  lossWorst: number;
  /** Per loss past the `PILE_FROM`th, whoever it was to: voters don't rank a 5-loss team however good its schedule. */
  lossPile: number;
  /**
   * How much of a loss a close one forgives: closeness runs from 1 - closeCredit (a tie at a neutral site against
   * the best team; half that against the worst) to 1 (`MARGIN_CAP`+).
   */
  closeCredit: number;
  /** Per game, times (quality(opp) - the league's mean quality): credit for playing good teams, win or lose. */
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
  voters: 62, winBase: 0.6, winQual: 1.8, lossBase: 0.8, lossBad: 3, lossWorst: 1.6, closeCredit: 0.6, sos: 0.5, margin: 1,
  lossPile: 2, prior: 3, priorFade: 9, inertia: 4.5, noise: 0.6,
};

/** The committee: no preseason prior, more weight on who you played and lost to, little inertia, and 13 members who mostly agree. */
export const CFP_WEIGHTS: VoterWeights = {
  voters: 13, winBase: 0.8, winQual: 2, lossBase: 0.7, lossBad: 3.4, lossWorst: 1.8, closeCredit: 0.6, sos: 0.8, margin: 0.6,
  lossPile: 1, prior: 0, priorFade: 1, inertia: 0.8, noise: 0.25,
};

const MARGIN_CAP = 21;
/** Preseason strength: the roster's overall and the program's prestige. */
const PRIOR_OVR = 0.75;
const PRIOR_PRESTIGE = 0.25;
const TOP = 25;
const PILE_FROM = 3;

/**
 * The power rating behind every opponent's quality, in points of margin: like SRS, each team is its capped,
 * home-adjusted margin plus its opponents' ratings, pulled toward the preseason prior as if it were `priorGames`
 * games. `priorPts` points per preseason z-score.
 */
export const POWER = { priorGames: 3, priorPts: 11, homeEdge: 2.5, iterations: 30, qualDecay: 25, pollBlend: 0.5 };

function priorZ(state: SeasonState): Map<string, number> {
  const raw = TEAMS.map((t) => {
    const ovr = teamRatings(squadFor(state, t.id)).ovr;
    return [t.id, ovr * PRIOR_OVR + t.profile.prestige * PRIOR_PRESTIGE] as const;
  });
  const mean = raw.reduce((s, [, v]) => s + v, 0) / raw.length;
  const sd = Math.sqrt(raw.reduce((s, [, v]) => s + (v - mean) ** 2, 0) / raw.length) || 1;
  return new Map(raw.map(([id, v]) => [id, (v - mean) / sd]));
}

/** A game's margin for `id`, capped and with the home edge taken out (positive: played better than an even opponent). */
function adjMargin(g: SeasonGame, id: string): number {
  const home = g.home === id;
  const d = home ? g.result!.home - g.result!.away : g.result!.away - g.result!.home;
  const edge = g.neutral ? 0 : home ? -POWER.homeEdge : POWER.homeEdge;
  return clamp(d, -MARGIN_CAP, MARGIN_CAP) + edge;
}

/** Every team's power rating from the games played so far, in points over an average team. */
export function powerRatings(state: SeasonState, prior = priorZ(state)): Map<string, number> {
  const games = played(state).filter((g) => prior.has(g.home) && prior.has(g.away));
  const r = new Map(TEAMS.map((t) => [t.id, prior.get(t.id)! * POWER.priorPts]));
  for (let it = 0; it < POWER.iterations; it++) {
    const sum = new Map(TEAMS.map((t) => [t.id, POWER.priorGames * prior.get(t.id)! * POWER.priorPts]));
    const n = new Map(TEAMS.map((t) => [t.id, POWER.priorGames]));
    for (const g of games) {
      for (const [id, opp] of [[g.home, g.away], [g.away, g.home]] as const) {
        sum.set(id, sum.get(id)! + adjMargin(g, id) + r.get(opp)!);
        n.set(id, n.get(id)! + 1);
      }
    }
    for (const t of TEAMS) r.set(t.id, sum.get(t.id)! / n.get(t.id)!);
  }
  return r;
}

/**
 * Each team's rank as an opponent on a resume: its power rating's rank, blended with its rank in last week's
 * poll when it was ranked there, so a loss to a team now in the top 25 reads as a loss to a ranked team.
 */
export function opponentRanks(state: SeasonState, prev?: Poll, prior?: Map<string, number>): Map<string, number> {
  const power = powerRatings(state, prior);
  const byPower = TEAMS.map((t) => t.id).sort((a, b) => power.get(b)! - power.get(a)!);
  return new Map(byPower.map((id, i) => {
    const pr = rankIn(prev, id);
    return [id, pr ? POWER.pollBlend * pr + (1 - POWER.pollBlend) * (i + 1) : i + 1];
  }));
}

/** 1 for the best opponent, falling fast: about 0.7 for the 10th, 0.37 for the 26th, 0.14 for the 50th. */
const quality = (rank: number) => Math.exp(-(rank - 1) / POWER.qualDecay);
/** 0 for the best opponent, 1 for the worst. */
const badness = (rank: number) => (rank - 1) / (TEAMS.length - 1);
const MEAN_QUALITY = TEAMS.reduce((s, _, i) => s + quality(i + 1), 0) / TEAMS.length;

/** What one played game adds to `id`'s resume, judged by the opponent's rank now. */
export function gameValue(w: VoterWeights, g: SeasonGame, id: string, oppRank: number): number {
  const m = adjMargin(g, id);
  const won = (g.home === id ? g.result!.home - g.result!.away : g.result!.away - g.result!.home) > 0;
  let v = w.sos * (quality(oppRank) - MEAN_QUALITY);
  if (won) v += w.winBase + w.winQual * quality(oppRank);
  else {
    // Close losses are forgiven most against good teams: a one-score loss at No. 1 is a near miss, at No. 90 it's still a loss.
    const closeness = 1 - w.closeCredit * (1 - clamp(-m, 0, MARGIN_CAP) / MARGIN_CAP) * (0.5 + 0.5 * quality(oppRank));
    v -= (w.lossBase + w.lossBad * (1 - quality(oppRank)) + w.lossWorst * badness(oppRank)) * closeness;
  }
  return v;
}

/** Every team's resume score before voter noise. */
export function baseScores(state: SeasonState, week: number, w: VoterWeights, prev?: Poll): Map<string, number> {
  const prior = priorZ(state);
  const opp = opponentRanks(state, prev, prior);
  const fade = Math.max(0, 1 - week / w.priorFade);
  const prevRank = new Map(prev?.ranks.map((r, i) => [r.team, i + 1]));
  const resume = new Map(TEAMS.map((t) => [t.id, 0]));
  const margin = new Map(TEAMS.map((t) => [t.id, { sum: 0, n: 0, l: 0 }]));
  for (const g of played(state)) {
    for (const [id, o] of [[g.home, g.away], [g.away, g.home]] as const) {
      if (!resume.has(id) || !opp.has(o)) continue;
      resume.set(id, resume.get(id)! + gameValue(w, g, id, opp.get(o)!));
      const mg = margin.get(id)!;
      const d = g.home === id ? g.result!.home - g.result!.away : g.result!.away - g.result!.home;
      mg.sum += clamp(d, -MARGIN_CAP, MARGIN_CAP) / MARGIN_CAP;
      mg.n++;
      if (d < 0) mg.l++;
    }
  }
  const out = new Map<string, number>();
  for (const t of TEAMS) {
    const mg = margin.get(t.id)!;
    let s = resume.get(t.id)!;
    s += w.margin * (mg.n ? mg.sum / mg.n : 0);
    s -= w.lossPile * Math.max(0, mg.l - PILE_FROM);
    if (w.prior) s += w.prior * prior.get(t.id)! * fade;
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
