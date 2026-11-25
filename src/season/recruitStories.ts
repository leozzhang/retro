import { athleteName } from '../data/depth';
import { prospect, type Prospect } from '../data/recruits';
import { teamById } from '../data/teams';
import { hashString } from '../engine/math';
import { pick } from './moments';
import {
  classRanks, classRoom, inHomeOpen, marketRank, nextHomeGame, peekRecruiting, RECRUITING, topSchools,
} from './recruiting';
import { decisionMoment, had, type StoryKit } from './storylines';
import type { Moment, MomentPlayer, MomentRow, SeasonState, Storyline } from './types';

/**
 * Recruiting as storylines (docs/STORYLINES.md): the prospects who matter to the user's class, week by
 * week, from what the recruiting step logged. Display only: it reads `state.recruiting` through
 * `peekRecruiting` (so its caches are left as they were) and changes nothing but `stories` and
 * `moments`. With the user recruiting, a turning point can ask for an official visit or an in-home,
 * which act through `toggleVisit` and `inHome` (`decide`).
 */

/**
 * - `asks`: recruiting decisions a season (4-stars and better only, one a week).
 * - `open`: recruitments followed at once (the most valuable first).
 * - `stars` / `top`: who's worth a story: a 4-star or better, a national top `top`, or a top target.
 * - `enter`: the user's place in his market that opens it (his top 3).
 * - `out`, `outWeeks`: out of his top `out` for `outWeeks` straight weeks closes it.
 * - `homeRank`: the market place where an in-home is worth asking about.
 * - `bigRank`: a national rank whose commitment is a tier-3 moment (5-stars always are).
 * - `classJump`: class-rank places gained in a week that make a moment.
 */
export const RSTORY = { asks: 3, open: 4, stars: 4, top: 150, enter: 3, out: 5, outWeeks: 2, homeRank: 2, bigRank: 100, classJump: 5 };

const ABBR = (id: string) => teamById(id).abbr;
const SCHOOL = (id: string) => teamById(id).school.toUpperCase();

/** "4* QB JALEN SMITH". */
export const recruitTag = (p: Pick<Prospect, 'stars' | 'pos' | 'a'>): string => `${p.stars}* ${p.pos} ${athleteName(p.a).toUpperCase()}`;

/** A recruit as a moment card shows him: his stars, rank and hometown, the services' read for an overall. */
export function recruitPlayer(p: Prospect, team: string): MomentPlayer {
  return {
    id: p.id, team, name: athleteName(p.a).toUpperCase(), num: p.a.num, pos: p.pos, cls: 'RECRUIT', stars: p.stars,
    home: `${p.a.hometown.city.toUpperCase()}, ${p.a.hometown.state}`, ovr: Math.round(p.pub), skin: p.a.skin, dev: 'normal', rank: p.rank,
  };
}

/** Worth a story: a 4-star or better, a national top `top`, or one of the user's top targets. */
function followed(state: SeasonState, p: Prospect): boolean {
  return p.stars >= RSTORY.stars || p.rank <= RSTORY.top || state.recruiting!.top.includes(p.id);
}

/** How much a prospect is worth following: stars, then national rank, a top target first. */
function worth(state: SeasonState, p: Prospect): number {
  return p.stars * 1000 - p.rank + (state.recruiting!.top.includes(p.id) ? 2000 : 0);
}

/** "YOU LEAD. TEXAS IS NO. 2" / "YOU'RE NO. 3. ALABAMA LEADS". */
function marketText(state: SeasonState, p: Prospect, rank: number, u: string): string {
  const top = topSchools(state, p, 2).filter((t) => t !== u);
  if (rank === 1) return top[0] ? `YOU LEAD. ${SCHOOL(top[0])} IS NO. 2` : 'YOU LEAD';
  return top[0] ? `YOU'RE NO. ${rank}. ${SCHOOL(top[0])} LEADS` : `YOU'RE NO. ${rank} FOR HIM`;
}

/** The plates a commitment scene shows: his school and the others in his top 3. */
function plates(state: SeasonState, p: Prospect, chosen: string, u: string): MomentRow[] {
  const others = topSchools(state, p, 4).filter((t) => t !== chosen).slice(0, 2);
  // His school lands in a spot drawn from his id (no rng), so the order never gives it away.
  const order = [...others];
  order.splice(hashString(`plate:${p.id}`) % (others.length + 1), 0, chosen);
  return order.map((t) => ({ text: ABBR(t), team: t, me: t === chosen, val: t === u ? 'YOU' : '' }));
}

export function recruitStories(k: StoryKit): void {
  const { state } = k;
  if (!state.recruiting || state.phase === 'offseason') return;
  peekRecruiting(state, () => run(k));
}

function run(k: StoryKit): void {
  const { state, u, week, add, beat, resolve, out } = k;
  const rs = state.recruiting!;
  const stories = state.stories!;
  const log = rs.log.filter((e) => e.week === week);
  const mine = !state.config.delegate.recruiting;
  const g = k.g;
  const visitors = g && g.home === u ? new Set(rs.visits[g.id] ?? []) : new Set<string>();
  let asked = stories.some((s) => s.kind === 'recruitment' && s.decision && s.decision.chosen === undefined);

  // A commit of ours walks: his story opens back up.
  for (const e of log.filter((x) => x.kind === 'decommit' && x.team === u)) {
    const p = prospect(e.id);
    let s = stories.find((x) => x.kind === 'recruitment' && x.star?.id === e.id);
    if (!p || (!s && !followed(state, p))) continue;
    if (s) {
      s.status = 'open';
      delete s.outcome;
    } else {
      s = add({ id: `recruitment:${e.id}`, kind: 'recruitment', team: u, title: 'RECRUITING', star: recruitPlayer(p, u), stakes: '', k: {} });
    }
    s.title = 'WAVERING';
    (s.k ??= {}).waver = 1;
    s.stakes = 'HE COULD FLIP';
    beat(s, `${recruitTag(p)} DECOMMITS`, 'down', { tier: 2, w: 2, sub: `${recruitTag(p)} DECOMMITS`, lines: ['HE REOPENS HIS RECRUITMENT', 'WIN HIM BACK BEFORE SIGNING DAY'] });
  }

  // ---- The ones running.
  for (const s of stories.filter((x) => x.kind === 'recruitment' && x.status === 'open')) {
    const p = prospect(s.star!.id);
    if (!p) continue;
    const kk = (s.k ??= {});
    const ev = log.filter((e) => e.id === p.id && e.kind !== 'decommit');
    const commit = ev.find((e) => e.kind === 'commit');
    const signed = ev.find((e) => e.kind === 'sign');
    if (commit) {
      const ours = commit.team === u;
      const flip = commit.from ? ` (FLIPPED FROM ${SCHOOL(commit.from)})` : '';
      out.push(commitMoment(state, week, p, commit.team, u, s.id, flip));
      s.beats.push({ week, text: ours ? `COMMITS TO YOU${flip}` : `PICKS ${SCHOOL(commit.team)}`, tone: ours ? 'up' : 'down' });
      resolve(s, ours ? `COMMITTED${kk.waver ? ' AGAIN' : ''}` : `PICKED ${SCHOOL(commit.team)}`);
      continue;
    }
    if (signed) {
      const ours = signed.team === u;
      beat(s, ours ? 'SIGNS WITH YOU' : `SIGNS WITH ${SCHOOL(signed.team)}`, ours ? 'up' : 'down');
      resolve(s, ours ? 'SIGNED' : `SIGNED WITH ${SCHOOL(signed.team)}`);
      continue;
    }
    if (rs.signed[p.id] || rs.gone?.includes(p.id)) {
      resolve(s, rs.signed[p.id] ? `SIGNED WITH ${SCHOOL(rs.signed[p.id])}` : 'UNSIGNED');
      continue;
    }
    // The visit: how the day went (`vibe`), and who chose to host him.
    if (visitors.has(p.id) && rs.ov[p.id]?.includes(u) && !kk.visit) {
      kk.visit = 1;
      const v = rs.vibe[p.id] ?? 0;
      const opp = g!.away;
      const word = v >= 0.25 ? `LOVED THE ${ABBR(opp)} GAME` : v >= -0.05 ? `LIKED HIS VISIT` : v >= -0.4 ? 'LUKEWARM ON HIS VISIT' : 'LEFT HIS VISIT COLD';
      const staff = mine ? '' : 'THE STAFF HOSTED HIM. ';
      beat(s, `${staff}${word}`, v >= -0.05 ? 'up' : 'down', Math.abs(v) >= 0.25
        ? { tier: 2, w: 1 + p.stars / 5, sub: `${recruitTag(p)} ${word}`, lines: [`OFFICIAL VISIT: ${k.won ? 'A WIN' : 'A LOSS'} VS ${SCHOOL(opp)}`] }
        : undefined);
    }
    if ((rs.homes[u] ?? []).includes(p.id) && !kk.home) {
      kk.home = 1;
      beat(s, mine ? 'YOUR IN-HOME VISIT' : 'THE STAFF SITS IN HIS LIVING ROOM', 'flat');
    }
    const rank = marketRank(state, p, u);
    const was = kk.rank ?? rank;
    kk.rank = rank;
    const committed = rs.commits[p.id];
    if (rank > RSTORY.out) {
      kk.out = (kk.out ?? 0) + 1;
      if (kk.out >= RSTORY.outWeeks) {
        beat(s, `FALLS OUT OF HIS TOP ${RSTORY.out}`, 'down', { tier: 1, sub: `${recruitTag(p)}: YOU'VE FALLEN OUT OF HIS TOP ${RSTORY.out}` });
        resolve(s, 'FELL OUT OF HIS TOP 5');
        continue;
      }
    } else kk.out = 0;
    if (rank !== was) {
      const up = rank < was;
      beat(s, rank === 1 && up ? 'YOU MOVE INTO THE LEAD' : `${up ? 'UP' : 'DOWN'} TO NO. ${rank} FOR HIM`, up ? 'up' : 'down',
        rank === 1 && up && p.stars >= 4 ? { tier: 2, w: 1 + p.stars / 5, sub: `${recruitTag(p)}: YOU'RE THE LEADER NOW`, lines: [marketText(state, p, rank, u)] } : undefined);
    }
    s.stakes = committed && committed !== u ? `COMMITTED TO ${SCHOOL(committed)}. ${rank <= 2 ? 'A FLIP IS IN PLAY' : 'A LONG SHOT'}` : marketText(state, p, rank, u);
    s.meter = { at: Math.max(0, RSTORY.out + 1 - rank), of: RSTORY.out, label: rank === 1 ? 'YOU LEAD' : `NO. ${rank} FOR HIM` };
    // A turning point the user can act on.
    const askedYet = stories.filter((x) => x.kind === 'recruitment' && x.decision).length;
    if (mine && !asked && !committed && askedYet < RSTORY.asks && p.stars >= RSTORY.stars) asked = ask(k, s, p, rank);
  }

  // ---- New ones: the user climbs into a prospect's top 3.
  const running = () => stories.filter((x) => x.kind === 'recruitment' && x.status === 'open').length;
  if (running() < RSTORY.open) {
    const cands = Object.keys(rs.interest)
      .filter((id) => (rs.interest[id][u] ?? 0) > 0 && !rs.commits[id] && !rs.signed[id] && !had(state, 'recruitment', id))
      .map((id) => prospect(id)!)
      .filter((p) => p && followed(state, p))
      .sort((a, b) => worth(state, b) - worth(state, a));
    for (const p of cands) {
      if (running() >= RSTORY.open) break;
      const rank = marketRank(state, p, u);
      if (rank > RSTORY.enter) continue;
      const stakes = marketText(state, p, rank, u);
      const s = add({
        id: `recruitment:${p.id}`, kind: 'recruitment', team: u, title: 'RECRUITING', star: recruitPlayer(p, u), stakes,
        meter: { at: RSTORY.out + 1 - rank, of: RSTORY.out, label: rank === 1 ? 'YOU LEAD' : `NO. ${rank} FOR HIM` }, k: { rank },
      });
      const why = p.rank <= 100 ? `NO. ${p.rank} IN THE NATION` : `FROM ${s.star!.home}`;
      beat(s, `YOU'RE IN HIS TOP 3`, 'up', {
        tier: p.stars >= 5 || p.rank <= RSTORY.bigRank ? 2 : 1, w: p.stars / 5,
        sub: `${recruitTag(p)} HAS YOU IN HIS TOP 3`, lines: [why, stakes],
      });
    }
  }

  // ---- The class: its national rank, from the first commit to signing day.
  const ranks = classRanks(state);
  const at = ranks.findIndex((r) => r.team === u) + 1;
  const n = ranks[at - 1]?.n ?? 0;
  let cls = stories.find((x) => x.kind === 'recruitClass' && x.status === 'open');
  if (!cls && n > 0 && !had(state, 'recruitClass', `${rs.cls}`)) {
    cls = add({ id: `recruitClass:${rs.cls}`, kind: 'recruitClass', team: u, title: `THE CLASS OF ${rs.cls}`, stakes: '', k: { rank: at } });
    cls.beats.push({ week, text: `THE FIRST COMMIT. NO. ${at} NATIONALLY`, tone: 'up' });
  }
  if (cls) {
    const was = cls.k?.rank ?? at;
    (cls.k ??= {}).rank = at;
    const room = Math.max(0, classRoom(state, u));
    cls.stakes = `NO. ${at} NATIONALLY. ${n} COMMIT${n === 1 ? '' : 'S'}, ${room} SPOT${room === 1 ? '' : 'S'} LEFT`;
    cls.meter = { at: n, of: n + room, label: `${n} COMMITS` };
    const into = (cut: number) => was > cut && at <= cut;
    // A move worth a scene: into the top 25, the top 10 or No. 1, or a big jump inside the top 25.
    if (at < was && (into(25) || into(10) || into(1) || (at <= 25 && was - at >= RSTORY.classJump))) {
      const sub = at === 1 ? 'THE NO. 1 CLASS IN THE NATION' : into(10) ? 'A TOP 10 CLASS' : into(25) ? 'INTO THE TOP 25' : `UP ${was - at} SPOTS`;
      cls.beats.push({ week, text: `UP TO NO. ${at}`, tone: 'up' });
      out.push({
        id: `${state.year}:${week}:class`, week, kind: 'poll', tier: at <= 10 ? 3 : 2, w: 2 + (25 - Math.min(25, at)) / 10, team: u, arc: cls.id,
        title: 'CLASS RANKINGS', sub, lines: [`${n} COMMITS`], n: [was, at], ranked: true,
        rows: ranks.slice(Math.max(0, at - 3), Math.max(0, at - 3) + 5).map((r, i) => ({
          text: `${Math.max(0, at - 3) + i + 1}. ${SCHOOL(r.team)}`, val: `${r.n} / ${r.pts}`, me: r.team === u, team: r.team,
        })),
      });
    }
  }
}

/**
 * At most one recruiting question a week: host him on an official visit for the next home game (the
 * user's next game), or, from championship week, send the staff for an in-home. Each asked once.
 */
function ask(k: StoryKit, s: Storyline, p: Prospect, rank: number): boolean {
  const { state, u, week, next, out } = k;
  const rs = state.recruiting!;
  const kk = s.k!;
  const home = nextHomeGame(state);
  const R = RECRUITING;
  if (!kk.askV && home && home.id === next?.id && rank <= RSTORY.enter && !(rs.visits[home.id] ?? []).includes(p.id)
    && (rs.visits[home.id]?.length ?? 0) < R.visit.n && (rs.ov[p.id]?.length ?? 0) < R.visit.max && !rs.ov[p.id]?.includes(u)) {
    kk.askV = 1;
    const opp = SCHOOL(home.away);
    s.decision = {
      prompt: `HOST ${recruitTag(p)} ON AN OFFICIAL VISIT FOR THE ${opp} GAME?`, slot: '', act: 'visit', week,
      options: [
        { id: p.id, label: 'HOST HIM', sub: `AN OFFICIAL VISIT (${(rs.ov[p.id]?.length ?? 0) + 1} OF ${R.visit.max}). A BIG WIN SELLS IT; A LOSS CAN COST YOU` },
        { id: '', label: 'NOT THIS WEEK', sub: 'SAVE THE VISIT FOR ANOTHER GAME' },
      ],
    };
    out.push(decisionMoment(state, week, s));
    return true;
  }
  if (!kk.askH && inHomeOpen(state) && (rank <= RSTORY.homeRank || kk.waver) && !(rs.homes[u] ?? []).includes(p.id) && (rs.homes[u]?.length ?? 0) < R.inHome.n) {
    kk.askH = 1;
    s.decision = {
      prompt: `SEND THE STAFF INTO ${recruitTag(p)}'S LIVING ROOM?`, slot: '', act: 'inhome', week,
      options: [
        { id: p.id, label: 'IN-HOME VISIT', sub: `ONE OF YOUR ${R.inHome.n}: ${(rs.homes[u]?.length ?? 0)} USED. THE HEAD COACH SELLS IT` },
        { id: '', label: 'NOT NOW', sub: 'SAVE IT FOR ANOTHER TARGET' },
      ],
    };
    out.push(decisionMoment(state, week, s));
    return true;
  }
  return false;
}

/** A recruit's commitment: the hat pick. Tier 3 for one of the user's 5-stars or national top 100s. */
export function commitMoment(state: SeasonState, week: number, p: Prospect, to: string, u: string, arc: string | undefined, flip = ''): Moment {
  const ours = to === u;
  const big = p.stars >= 5 || p.rank <= RSTORY.bigRank;
  const why = pick(['THE HAT PICK', 'DECISION DAY', 'HE MADE HIS CALL'], p.id);
  return {
    id: `${state.year}:${week}:commit:${p.id}`, week, kind: 'commit', tier: ours ? (big ? 3 : 2) : 2, w: 2 + p.stars / 2 + (ours ? 1 : 0), team: u, opp: to,
    title: ours ? 'COMMITTED' : `PICKS ${teamById(to).abbr}`, sub: `${recruitTag(p)}${flip}`,
    lines: [why, `NO. ${p.rank} NATIONALLY, NO. ${p.posRank} ${p.pos}`, `FROM ${p.a.hometown.city.toUpperCase()}, ${p.a.hometown.state}`],
    p: recruitPlayer(p, u), rows: plates(state, p, to, u), arc,
  };
}
