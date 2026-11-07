import { coachAs } from '../data/coaches';
import { athleteName } from '../data/depth';
import { TEAM_STATE } from '../data/fbs/geo';
import { prospect } from '../data/recruits';
import { RIVALRIES } from '../data/season/rivalries';
import { TEAMS, teamById } from '../data/teams';
import { count, type Ctx } from './fanPulse';
import { latestPoll, rankIn } from './polls';
import { bowlGame, coachStart, coachTenure, pastSeasons, rivalrySeries, splitRecord } from './program';
import type { SeasonState } from './types';
import { headCoachFor } from './world';

/**
 * The fan pulse's stories (season/fanPulse.ts): what makes a program's talk its own. Its rivals'
 * streaks and seasons, the head coach's long story (steady but no big wins, bowl runs), peers who
 * hired the same winter, the coach who left, the draft, this season's texture, the program's real
 * history and its in-state recruiting. Display only. See docs/PROGRAM.md.
 */

export const STORIES = {
  /** A rivalry run worth talking about. */
  streak: 2,
  /** Big games (against the AP top 25) before the coach's record in them means something, and its bars. */
  bigMin: 5,
  bigBad: 0.3,
  bigGood: 0.65,
  /** Seasons in the coach's run before "steady" is a story, and the win spread that reads as steady. */
  steadyYears: 4,
  steadySpread: 2,
  /** Postseason games in a row, won or lost, under one coach. */
  bowlRun: 3,
  /** Peers (conference mates and rivals) hired within this many seasons of us, the win share and win gap
   * that make it a story, and how long into our coach's run it's news. */
  peerGap: 0,
  peerPct: 0.25,
  peerWins: 3,
  peerYears: 3,
  /** Draft hauls that lead the nation or the conference. */
  haulNation: 5,
  haulConf: 3,
  firstStreak: 3,
  /** This season: one-score games, streaks, and the national scoring ranks that are extremes. */
  closeGames: 3,
  runGames: 4,
  scoringTop: 8,
  /** A bad loss: to a team this many tiers below. */
  badTiers: 2,
  /** History: a national title drought, bowl streaks and droughts, Heismans, all-time win milestones. */
  natYears: 25,
  bowlStreak: 5,
  bowlGap: 4,
  heismans: 3,
  milestone: 100,
  /** The state's top recruit is news when he's this high nationally. */
  inStateRank: 60,
  /** Portal arrivals worth talking about. */
  portalOvr: 85,
};

const S = STORIES;
const school = (id: string) => teamById(id).school.toUpperCase();
const nameOf = (id: string): string => {
  const c = coachAs(id, 'HC') ?? coachAs(id, 'OC');
  return c ? `${c.first[0]}. ${c.last}`.toUpperCase() : 'THE OLD COACH';
};

export function storySignals(c: Ctx): void {
  rivals(c);
  coachStory(c);
  peers(c);
  draft(c);
  texture(c);
  history(c);
  recruiting(c);
}

// ------------------------------------------------------------ rivals

function rivals(c: Ctx): void {
  const { state, id, tier, rank, gp, pre, over, hc, start, ten, say, recs } = c;
  for (const r of RIVALRIES.filter((x) => x.a === id || x.b === id)) {
    const opp = r.a === id ? r.b : r.a;
    const o = school(opp);
    const name = r.name.toUpperCase();
    const played = state.games.some((g) => g.result && g.kind !== 'cfp' && g.kind !== 'bowl' && g.kind !== 'champ' && ((g.home === id && g.away === opp) || (g.home === opp && g.away === id)));
    const series = rivalrySeries(state, id, opp);
    // The run, between meetings (this year's game says it itself).
    if (!played && Math.abs(series.streak) >= S.streak) {
      const n = Math.abs(series.streak);
      if (series.streak > 0) say(`rivalStreak:${opp}`, 0.4 + 0.05 * n, 1.2 + 0.2 * n, [`${count(n)} STRAIGHT WINS OVER ${o}. KEEP IT GOING.`, `${o} HASN'T BEATEN US IN ${count(n)} TRIES.`], [opp]);
      else say(`rivalStreak:${opp}`, -0.4 - 0.05 * n, 1.2 + 0.2 * n, [`${count(n)} STRAIGHT LOSSES TO ${o}. THAT HAS TO END.`, `FANS ARE SICK OF LOSING TO ${o}: ${count(n)} IN A ROW.`], [opp]);
    }
    // The coach's own record in it.
    const mine = rivalrySeries(state, id, opp, start);
    const same = (mine.w === 0 && -series.streak === mine.l) || (mine.l === 0 && series.streak === mine.w);
    if (mine.w + mine.l >= 2 && ten.year >= 2 && !same) {
      if (mine.w === 0) say(`rivalCoach:${opp}`, -0.6, 1.8, [`${hc} IS 0-${mine.l} AGAINST ${o}. NOTHING ELSE MATTERS.`, `0-${mine.l} VS. ${o} UNDER ${hc}. FANS KEEP COUNT.`], [opp]);
      else if (mine.l === 0 && mine.w >= 3) say(`rivalCoach:${opp}`, 0.5, 1.5, [`${hc} IS ${mine.w}-0 AGAINST ${o}. THAT BUYS GOODWILL.`, `UNDEFEATED VS. ${o} UNDER ${hc}: ${mine.w}-0.`], [opp]);
    }
    // Rivalry week.
    const next = state.games.find((g) => !g.result && g.week === state.week && g.kind !== 'bowl' && g.kind !== 'cfp' && ((g.home === id && g.away === opp) || (g.home === opp && g.away === id)));
    if (next && !over) {
      const n = Math.abs(series.streak);
      const tail = n >= S.streak ? (series.streak > 0 ? ` GO FOR ${n + 1} STRAIGHT.` : ` END THE ${n}-GAME SKID.`) : '';
      say(`rivalWeek:${opp}`, n >= S.streak && series.streak < 0 ? -0.2 : 0.2, 2.4, [`${name} WEEK. ALL THAT MATTERS IS BEATING ${o}.${tail}`, `IT'S ${o} WEEK. CIRCLE IT, UNDERLINE IT.${tail}`], [opp]);
    }
    // The rival's season, as we watch it.
    const ot = teamById(opp).profile.tier;
    const or = recs.get(opp)!;
    if (pre || ot > tier + 1) continue;
    const orank = rankIn(latestPoll(state, 'ap'), opp);
    if (state.bracket?.champion === opp) say(`rivalSeason:${opp}`, -0.6, 2, [`${o} WON THE NATIONAL TITLE. FANS WILL HEAR ABOUT IT FOREVER.`, `${o}: NATIONAL CHAMPIONS. THE WORST POSSIBLE NEWS.`], [opp]);
    else if (state.bracket?.seeds.includes(opp) && !state.bracket.seeds.includes(id)) say(`rivalSeason:${opp}`, -0.4, 1.4, [`WATCHING ${o} IN THE PLAYOFF IS PAINFUL.`, `${o} IS IN THE PLAYOFF AND WE'RE NOT. ROUGH.`], [opp]);
    else if (gp >= 5 && orank && orank <= 10 && (!rank || rank > orank + 5)) say(`rivalSeason:${opp}`, -0.3, 1.1, [`${o} AT NO. ${orank} IS HARD TO WATCH.`, `${o} IS ${or.w}-${or.l} AND RANKED NO. ${orank}. GROAN.`], [opp]);
    else if (gp >= 5 && or.l >= or.w + 3) say(`rivalSeason:${opp}`, 0.3, 1, [`${o} IS ${or.w}-${or.l}. FANS ARE ENJOYING EVERY MINUTE.`, `${o} IS ${or.w}-${or.l}. SCHADENFREUDE IS IN THE AIR.`], [opp]);
  }
}

// ------------------------------------------------------------ the head coach's story

function coachStory(c: Ctx): void {
  const { state, id, tier, ten, hc, start, past, rec, gp, over, say } = c;
  // His finished seasons here.
  const rows = past.filter((r) => r.year >= start && r.year < state.year + (over ? 1 : 0));
  if (ten.year >= S.steadyYears && rows.length >= 3 && rows.every((r) => r.w > r.l)) {
    const ws = rows.slice(-4).map((r) => r.w);
    const spread = Math.max(...ws) - Math.min(...ws);
    const titles = rows.some((r) => r.cc || r.nc);
    if (tier <= 3 && spread <= S.steadySpread && !titles) say('steady', -0.3, 1.4, [`${ws.join(', ')} WINS UNDER ${hc}. IS THERE ANOTHER GEAR?`, `${hc} WINS ${Math.round(ws.reduce((a, b) => a + b, 0) / ws.length)} A YEAR, EVERY YEAR. FANS WANT A TITLE.`]);
    else if (tier >= 4) say('steady', 0.4, 1.3, [`${count(rows.length)} STRAIGHT WINNING SEASONS UNDER ${hc}. FANS KNOW HOW RARE THAT IS.`, `${hc} KEEPS WINNING: ${ws.join(', ')}. THIS IS A GOOD RUN.`]);
  }
  const [bw, bl] = splitRecord(state, id, 'big', start);
  if (bw + bl >= S.bigMin && ten.year >= 2) {
    const pct = bw / (bw + bl);
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.w, 0) / rows.length) : rec.w;
    if (pct <= S.bigBad && avg >= 7) say('bigGames', -0.5, 1.8, [`${hc} WINS ${avg} A YEAR, BUT IS ${bw}-${bl} VS. RANKED TEAMS.`, `${bw}-${bl} VS. RANKED TEAMS UNDER ${hc}. BIG ONES GET AWAY.`]);
    else if (pct <= S.bigBad) say('bigGames', -0.4, 1.3, [`${bw}-${bl} AGAINST RANKED TEAMS UNDER ${hc}. NOT GOOD ENOUGH.`]);
    else if (pct >= S.bigGood) say('bigGames', 0.5, 1.5, [`${hc} WINS THE BIG ONES: ${bw}-${bl} AGAINST RANKED TEAMS.`, `BIG-GAME ${hc}: ${bw}-${bl} VS. THE TOP 25.`]);
  }
  // A run of postseason results.
  const bowls = rows.map((r) => bowlGame(r.post)).filter((x): x is 'W' | 'L' => !!x);
  let run = 0;
  for (let i = bowls.length - 1; i >= 0 && bowls[i] === bowls[bowls.length - 1]; i--) run++;
  if (run >= S.bowlRun && gp < 8) {
    if (bowls[bowls.length - 1] === 'L') say('bowlRun', -0.4, 1.2, [`${count(run)} STRAIGHT BOWL LOSSES UNDER ${hc}.`, `${count(run)} BOWL LOSSES IN A ROW. ${hc}'S TEAMS FADE.`]);
    else say('bowlRun', 0.4, 1.2, [`${hc} HAS WON ${count(run)} STRAIGHT BOWLS. THESE TEAMS FINISH.`, `${count(run)} STRAIGHT POSTSEASON WINS UNDER ${hc}.`]);
  }
}

// ------------------------------------------------------------ peers, the old coach, the coordinators

/** Which program each coach is head coach of now. */
const hcCache = new WeakMap<SeasonState, { key: string; at: Map<string, string> }>();
function headCoaches(state: SeasonState): Map<string, string> {
  const key = `${state.year}:${state.phase}:${state.offseason?.stage ?? ''}:${state.carousel?.log.length ?? 0}`;
  const hit = hcCache.get(state);
  if (hit?.key === key) return hit.at;
  const at = new Map<string, string>();
  for (const t of TEAMS) if (t.id !== state.config.userTeamId) at.set(headCoachFor(state, t.id).id, t.id);
  hcCache.set(state, { key, at });
  return at;
}

/** Who sat in a chair in a finished season: `team:year:role` to coach id. */
const chairCache = new WeakMap<SeasonState, { key: string; at: Map<string, string> }>();
function chairs(state: SeasonState): Map<string, string> {
  const key = `${state.year}:${state.phase}:${state.history.length}`;
  const hit = chairCache.get(state);
  if (hit?.key === key) return hit.at;
  const at = new Map<string, string>();
  for (const [cid, career] of Object.entries(state.coachCareers ?? {})) for (const r of career.seasons) at.set(`${r.team}:${r.year}:${r.role}`, cid);
  chairCache.set(state, { key, at });
  return at;
}

/** A team's wins and losses from `from` on: the finished seasons before this one, and this one's games. */
function winsSince(state: SeasonState, id: string, from: number, rec: { w: number; l: number }): [number, number] {
  let w = rec.w;
  let l = rec.l;
  for (const r of pastSeasons(state, id, false)) if (r.year >= from && r.year < state.year) [w, l] = [w + r.w, l + r.l];
  return [w, l];
}

function peers(c: Ctx): void {
  const { state, id, t, tier, ten, start, rec, recs, gp, pre, over, say } = c;
  const lastDone = state.history.some((h) => h.year === state.year) ? state.year : state.year - 1;
  const at = headCoaches(state);
  const seats = chairs(state);

  // The peers who hired the same winter: the coach we could have had, or the one we're glad we didn't.
  if (!pre && ten.year <= S.peerYears) {
    const rivalIds = new Set(RIVALRIES.flatMap((r) => (r.a === id ? [r.b] : r.b === id ? [r.a] : [])));
    let best: { p: string; diff: number; theirs: [number, number]; mine: [number, number]; name: string; ps: number } | undefined;
    for (const p of TEAMS) {
      if (p.id === id || Math.abs(p.profile.tier - tier) > 1) continue;
      if (!((t.conference !== 'Independent' && p.conference === t.conference) || rivalIds.has(p.id))) continue;
      const pt = coachTenure(state, p.id);
      const ps = coachStart(state, p.id, pt);
      if (Math.abs(ps - start) > S.peerGap || ps > state.year) continue;
      const from = Math.max(ps, start);
      const theirs = winsSince(state, p.id, from, recs.get(p.id)!);
      const mine = winsSince(state, id, from, rec);
      if (theirs[0] + theirs[1] < 4 || mine[0] + mine[1] < 4) continue;
      const pct = (x: [number, number]) => x[0] / (x[0] + x[1]);
      const diff = pct(theirs) - pct(mine);
      // Regret needs a struggling program; gloating, a winning one against a struggling peer.
      const story = (diff >= S.peerPct && pct(mine) < 0.55 && pct(theirs) >= 0.6) || (-diff >= S.peerPct && pct(mine) >= 0.6 && pct(theirs) < 0.4);
      if (story && Math.abs(theirs[0] - mine[0]) >= S.peerWins && (!best || Math.abs(diff) > Math.abs(best.diff))) best = { p: p.id, diff, theirs, mine, name: pt.user ? '' : `COACH ${pt.name}`, ps };
    }
    if (best) {
      const o = school(best.p);
      const yr = Math.max(best.ps, start);
      const them = `${best.theirs[0]}-${best.theirs[1]}`;
      const we = `${best.mine[0]}-${best.mine[1]}`;
      // The user's staff has no name to envy: the fans envy the program.
      const envy = best.name ? [`FANS KEEP LOOKING AT WHAT ${best.name} IS DOING AT ${o}: ${them}.`, `WHAT IF WE'D HIRED ${best.name}? ${o} IS ${them} SINCE ${yr}.`] : [`${o}'S NEW STAFF IS ${them} SINCE ${yr}. WHY NOT US?`];
      if (best.diff > 0) say('peer', -0.55, 1.8, [`BOTH HIRED IN ${yr}. ${o} IS ${them} SINCE; WE'RE ${we}.`, ...envy], [best.p]);
      else say('peer', 0.4, 1.3, [`BOTH HIRED IN ${yr}: WE'RE ${we}, ${o} IS ${them}. RIGHT CALL.`, `${we} TO ${o}'S ${them} SINCE BOTH HIRES. FANS ARE GLOATING.`], [best.p]);
    }
  }

  // The coach before this one, wherever he is now.
  const prev = seats.get(`${id}:${start - 1}:HC`);
  if (prev && ten.year <= 4) {
    const now = at.get(prev);
    const pname = `COACH ${nameOf(prev)}`;
    if (now && now !== id) {
      const o = school(now);
      const r = recs.get(now)!;
      const left = state.coachCareers?.[prev]?.seasons.find((x) => x.year === start && x.team === now);
      const there = gp >= 4 ? r : undefined;
      if (left && teamById(now).profile.tier < tier && ten.year <= 2) say('oldCoach', -0.35, 1.4, [`STILL BITTER THAT ${pname} BOLTED FOR ${o}.`, `${pname} LEFT FOR ${o}. FANS HAVEN'T FORGOTTEN.`], [now]);
      else if (there && there.w >= there.l + 4) say('oldCoach', -0.3, 1.2, [`${pname} IS ${there.w}-${there.l} AT ${o}. MAYBE HE WASN'T THE PROBLEM.`, `${pname} IS WINNING AT ${o}: ${there.w}-${there.l}. AWKWARD.`], [now]);
      else if (there && there.l >= there.w + 4) say('oldCoach', 0.3, 1, [`${pname} IS ${there.w}-${there.l} AT ${o}. FANS FEEL VINDICATED.`, `${pname} IS STRUGGLING AT ${o} TOO: ${there.w}-${there.l}.`], [now]);
    }
  }

  // A coordinator hired away to run his own program.
  if (pre || over || state.week <= 3) {
    for (const role of ['OC', 'DC'] as const) {
      const cid = seats.get(`${id}:${lastDone}:${role}`);
      const now = cid && at.get(cid);
      if (!now || now === id) continue;
      const o = school(now);
      say('poached', -0.25, 1.2, [`LOST ${role} ${nameOf(cid)} TO ${o}. GOOD FOR HIM, BAD FOR US.`, `${o} HIRED AWAY OUR ${role}, ${nameOf(cid)}. IT STINGS.`], [now]);
      break;
    }
  }
}

// ------------------------------------------------------------ the draft

function draft(c: Ctx): void {
  const { state, id, t, tier, pre, over, say } = c;
  if (!(pre || over || state.week <= 3)) return;
  const drafts = state.history.filter((h) => h.draft?.length);
  const dh = drafts[drafts.length - 1];
  if (!dh || dh.year < state.year - 1) return;
  const ours = dh.draft!.filter((p) => p.team === id);
  const firsts = ours.filter((p) => p.round === 1);
  const top = ours[0];
  if (top?.pick === 1) say('firstPick', 0.8, 3, [`${top.name.toUpperCase()} WENT FIRST OVERALL TO ${top.city.toUpperCase()}!`, `THE NO. 1 PICK, ${top.name.toUpperCase()}, CAME FROM HERE.`]);
  else if (top && top.round === 1 && tier >= 3) say('firstRounder', 0.65, 2.2, [`${top.name.toUpperCase()} WENT NO. ${top.pick} TO ${top.city.toUpperCase()}. A FIRST-ROUNDER FROM HERE!`, `${top.city.toUpperCase()} TOOK ${top.name.toUpperCase()} IN ROUND ONE.`]);
  else if (top && top.pick <= 10) say('firstRounder', 0.4, 1.2, [`${top.name.toUpperCase()} WENT NO. ${top.pick} TO ${top.city.toUpperCase()}.`, `A TOP-10 PICK: ${top.name.toUpperCase()} TO ${top.city.toUpperCase()}.`]);
  // The haul against the nation and the conference.
  const by = new Map<string, number>();
  for (const p of dh.draft!) by.set(p.team, (by.get(p.team) ?? 0) + 1);
  const most = Math.max(...by.values());
  const confMost = Math.max(...[...by].filter(([k]) => teamById(k).conference === t.conference).map(([, n]) => n));
  if (ours.length >= S.haulNation && ours.length === most) say('draftHaul', 0.5, 1.6, [`LED THE NATION WITH ${ours.length} DRAFT PICKS.`, `${ours.length} PLAYERS DRAFTED, MORE THAN ANYONE. RECRUITS NOTICE.`]);
  else if (ours.length >= S.haulConf && ours.length === confMost && t.conference !== 'Independent') say('draftHaul', 0.35, 1.1, [`THE MOST DRAFT PICKS IN THE ${t.conference.toUpperCase()}: ${ours.length}.`, `${ours.length} PICKS, THE MOST IN THE ${t.conference.toUpperCase()}.`]);
  else if (firsts.length >= 2) say('draft', 0.35, 1, [`${count(firsts.length)} FIRST-ROUND PICKS. THE NFL PIPELINE IS REAL.`, `${count(firsts.length)} FIRST-ROUNDERS. THE PROGRAM BUILDS PROS.`]);
  // First-rounders draft after draft.
  let run = 0;
  for (let i = drafts.length - 1; i >= 0 && drafts[i].draft!.some((p) => p.team === id && p.round === 1); i--) run++;
  if (run >= S.firstStreak) say('draftStreak', 0.35, 1.1, [`A FIRST-ROUNDER IN ${count(run)} STRAIGHT DRAFTS.`, `${count(run)} STRAIGHT DRAFTS WITH A FIRST-ROUNDER. THAT'S A FACTORY.`]);
  // An early entrant who went late.
  const early = ours.filter((p) => p.early && p.round >= 4)[0];
  if (early) say('early', -0.3, 1, [`${early.name.toUpperCase()} LEFT EARLY AND WENT IN ROUND ${early.round}. FANS WISH HE'D STAYED.`, `${early.name.toUpperCase()} COULD HAVE USED ONE MORE YEAR. ROUND ${early.round}.`]);
  if (tier === 1 && ours.length <= 1) say('noPicks', -0.4, 1.3, [ours.length ? `ONE DRAFT PICK? AT A PLACE LIKE THIS?` : `NOBODY DRAFTED? AT A PLACE LIKE THIS?`, `A THIN DRAFT FOR A PROGRAM THAT SELLS NFL DREAMS.`]);
}

// ------------------------------------------------------------ this season's texture

/** Every team's points for and against, and games, this season. */
const scoreCache = new WeakMap<SeasonState, { n: number; at: Map<string, { pf: number; pa: number; g: number }> }>();
function scoring(state: SeasonState): Map<string, { pf: number; pa: number; g: number }> {
  const done = state.games.filter((g) => g.result);
  const hit = scoreCache.get(state);
  if (hit?.n === done.length) return hit.at;
  const at = new Map<string, { pf: number; pa: number; g: number }>();
  for (const g of done) {
    for (const [me, us, them] of [[g.home, g.result!.home, g.result!.away], [g.away, g.result!.away, g.result!.home]] as const) {
      const x = at.get(me) ?? { pf: 0, pa: 0, g: 0 };
      at.set(me, { pf: x.pf + us, pa: x.pa + them, g: x.g + 1 });
    }
  }
  scoreCache.set(state, { n: done.length, at });
  return at;
}

function texture(c: Ctx): void {
  const { state, id, tier, gp, over, was, say } = c;
  if (gp < 3) return;
  const games = state.games.filter((g) => g.result && (g.home === id || g.away === id)).sort((a, b) => a.week - b.week);
  const res = games.map((g) => {
    const us = g.home === id ? g.result!.home : g.result!.away;
    const them = g.home === id ? g.result!.away : g.result!.home;
    const opp = g.home === id ? g.away : g.home;
    return { g, us, them, opp, won: us > them, home: g.home === id && !g.neutral, orank: rankIn(latestPoll(state, 'ap', g.week), opp) };
  });
  const closeL = res.filter((r) => !r.won && r.them - r.us <= 8).length;
  const closeW = res.filter((r) => r.won && r.us - r.them <= 8).length;
  if (closeL >= S.closeGames + (gp >= 10 ? 1 : 0)) say('close', -0.45, 1.6, [`${count(closeL)} LOSSES BY ONE SCORE. SO CLOSE, SO OFTEN.`, `${count(closeL)} ONE-SCORE LOSSES. A FEW PLAYS FROM A DIFFERENT SEASON.`]);
  else if (closeW >= S.closeGames && closeL <= 1) say('close', 0.3, 1.2, [`${count(closeW)} WINS BY ONE SCORE. LIVING DANGEROUSLY.`, `${count(closeW)} NAIL-BITERS, ALL WINS. FANS' NERVES ARE SHOT.`]);
  // The run they're on.
  let run = 0;
  const lastWon = res[res.length - 1].won;
  for (let i = res.length - 1; i >= 0 && res[i].won === lastWon; i--) run++;
  if (run >= S.runGames && run < res.length) {
    if (lastWon) say('streak', 0.5, 1.6, over ? [`FINISHED ON A ${run}-GAME WINNING STREAK.`, `WON THE LAST ${count(run)}. THE OFFSEASON CAN'T END FAST ENOUGH.`] : [`${count(run)} STRAIGHT WINS. THE BANDWAGON IS FILLING UP.`, `WINNERS OF ${count(run)} STRAIGHT. NOBODY WANTS TO PLAY THEM.`]);
    else say('streak', -0.6, 1.8, over ? [`LOST THE LAST ${count(run)}. A BAD WAY TO END IT.`, `A ${run}-GAME LOSING STREAK TO FINISH. LONG WINTER.`] : [`${count(run)} STRAIGHT LOSSES. FANS ARE TUNING OUT.`, `LOSERS OF ${count(run)} STRAIGHT. SOMETHING HAS TO CHANGE.`]);
  } else if (run === res.length && run >= 6 && lastWon && !over) say('streak', 0.45, 1.2, [`STILL UNBEATEN AFTER ${count(run)}. FANS DARE TO DREAM.`]);
  // The scoreboard against the nation.
  const all = [...scoring(state)].filter(([, x]) => x.g >= 3).map(([k, x]) => ({ k, pf: x.pf / x.g, pa: x.pa / x.g }));
  const me = all.find((x) => x.k === id);
  if (me) {
    const off = all.filter((x) => x.pf > me.pf).length + 1;
    const def = all.filter((x) => x.pa < me.pa).length + 1;
    const n = all.length;
    const pf = Math.round(me.pf);
    const pa = Math.round(me.pa);
    const opts: [number, number, string[]][] = [
      [off, 0.4, [`AVERAGING ${pf} POINTS A GAME, NO. ${off} IN THE COUNTRY.`, `THE OFFENSE ${was} ELECTRIC: ${pf} A GAME.`]],
      [def, 0.4, [`THE DEFENSE ALLOWS ${pa} A GAME, NO. ${def} NATIONALLY.`, `POINTS ARE HARD TO COME BY AGAINST THIS DEFENSE: ${pa} A GAME.`]],
      [n + 1 - off, -0.4, [`ONLY ${pf} POINTS A GAME. THE OFFENSE IS STUCK.`, `${pf} POINTS A GAME. FANS WANT A NEW PLAY CALLER.`]],
      [n + 1 - def, -0.4, [`THE DEFENSE GIVES UP ${pa} A GAME.`, `${pa} POINTS ALLOWED A GAME. THE DEFENSE ${was} A SIEVE.`]],
    ];
    const ex = opts.filter(([r]) => r <= S.scoringTop).sort((a, b) => a[0] - b[0])[0];
    if (ex) say('scoring', ex[1], 1.3, ex[2]);
  }
  // Home.
  const home = res.filter((r) => r.home);
  if (home.length >= 4 && home.every((r) => r.won)) say('home', 0.35, 1, [`UNBEATEN AT HOME. THE STADIUM IS A FORTRESS.`, `${count(home.length)}-0 AT HOME. NOBODY WINS HERE.`]);
  // The loss that lingers, and the win that does.
  const bad = res.find((r) => !r.won && teamById(r.opp).profile.tier >= tier + S.badTiers);
  if (bad && bad.g.week < state.week - 1) say('badLoss', -0.5, tier === 1 ? 2 : 1.5, [`THE LOSS TO ${school(bad.opp)} STILL HAUNTS.`, `NOBODY HAS FORGOTTEN LOSING TO ${school(bad.opp)}.`], [bad.opp]);
  const big = res.filter((r) => r.won && r.orank && r.orank <= 5).sort((a, b) => a.orank - b.orank)[0];
  if (big && big.g.week < state.week - 1) say('bigWin', 0.55, 1.6, [`BEATING NO. ${big.orank} ${school(big.opp)} IS THE MEMORY OF THE YEAR.`, `FANS STILL REPLAY THE WIN OVER NO. ${big.orank} ${school(big.opp)}.`], [big.opp]);
}

// ------------------------------------------------------------ the program's history

function history(c: Ctx): void {
  const { state, id, t, tier, tro, rec, gp, pre, over, say } = c;
  const prior = c.past.filter((r) => r.year < state.year);
  const field = state.bracket?.seeds.includes(id);
  // National titles and the playoff.
  const lastNat = tro.nat[tro.nat.length - 1];
  if (tier <= 2 && !field && state.bracket?.champion !== id) {
    if (!lastNat && tier === 1) say('natDrought', -0.25, 1, [`STILL CHASING A FIRST NATIONAL TITLE.`, `ALL THIS TALENT AND NO NATIONAL TITLE. EVER.`]);
    else if (lastNat && state.year - lastNat >= S.natYears) say('natDrought', -0.3, 1.1, [`NO NATIONAL TITLE SINCE ${lastNat}. FANS ARE TIRED OF WAITING.`, `${lastNat} WAS THE LAST NATIONAL TITLE. TOO LONG AGO.`]);
  }
  if (field && !tro.playoffs.some((y) => y < state.year)) say('firstPlayoff', 0.9, 3, [`THE FIRST PLAYOFF BERTH IN SCHOOL HISTORY!`, `HISTORY: THE PROGRAM'S FIRST PLAYOFF TRIP.`]);
  else if (tier <= 2 && !tro.playoffs.length && !field) say('playoffWait', -0.3, 1.1, [`STILL WAITING ON A FIRST PLAYOFF TRIP.`, `EVERY RIVAL HAS BEEN TO THE PLAYOFF, IT FEELS LIKE. NOT US.`]);
  // A new conference.
  const conf = t.conference;
  let years = 1;
  for (let i = prior.length - 1; i >= 0 && prior[i].conf === conf; i--) years++;
  if (years <= 3 && years <= prior.length && conf !== 'Independent') {
    const C = conf.toUpperCase();
    const from = prior[prior.length - years]?.conf.toUpperCase();
    if (gp >= 3 && rec.cw + rec.cl >= 2 && rec.cw > rec.cl) say('newConf', 0.4, 1.3, [`YEAR ${count(years)} IN THE ${C}, AND PROVING WE BELONG.`, `${rec.cw}-${rec.cl} IN THE ${C}. THE MOVE FROM THE ${from} WAS RIGHT.`]);
    else if (gp >= 3 && rec.cl >= rec.cw + 2) say('newConf', -0.4, 1.3, [`YEAR ${count(years)} IN THE ${C}. THE STEP UP HAS BEEN HARD.`, `${rec.cw}-${rec.cl} IN ${C} PLAY. SOME MISS THE ${from}.`]);
    else if (pre) say('newConf', 0.15, 1, [`YEAR ${count(years)} IN THE ${C}. NEW ROAD TRIPS, NEW RIVALS.`]);
  }
  // Bowls.
  let streak = 0;
  for (let i = prior.length - 1; i >= 0 && bowlGame(prior[i].post); i--) streak++;
  const lastBowl = tro.bowls.last;
  if (pre && streak >= S.bowlStreak) say('bowlStreak', 0.3, tier >= 3 ? 1.3 : 0.8, [`${count(streak)} STRAIGHT BOWL TRIPS. THE STREAK HAS TO CONTINUE.`, `A BOWL IN EACH OF THE LAST ${count(streak)} YEARS.`]);
  else if (!pre && rec.w >= 6 && lastBowl && state.year - lastBowl >= S.bowlGap && !field) say('bowlDrought', 0.6, 2, [`BOWL ELIGIBLE FOR THE FIRST TIME SINCE ${lastBowl}.`, `THE FIRST BOWL SINCE ${lastBowl}. THE WAIT IS OVER.`]);
  else if (pre && tier >= 3 && lastBowl && state.year - lastBowl >= S.bowlGap + 1) say('bowlDrought', -0.3, 1, [`NO BOWL SINCE ${lastBowl}. FANS JUST WANT THE POSTSEASON.`]);
  // The best (or worst) season in a long time.
  if (prior.length >= 3 && (over || gp >= 8)) {
    const better = prior.filter((r) => r.w >= rec.w).pop();
    const worse = prior.filter((r) => r.l >= rec.l).pop();
    if (rec.w >= 8 && (!better || state.year - better.year >= 4)) say('best', 0.55, 1.6, [better ? `${rec.w} WINS: THE MOST SINCE ${better.year}.` : `${rec.w} WINS: THE BEST SEASON IN OVER ${prior.length} YEARS.`]);
    else if (rec.l >= 7 && (!worse || state.year - worse.year >= 4)) say('best', -0.5, 1.4, [worse ? `${rec.l} LOSSES: THE MOST SINCE ${worse.year}.` : `${rec.l} LOSSES: THE WORST IN OVER ${prior.length} YEARS.`]);
  }
  // Heismans in the case.
  const h = tro.heisman;
  if (pre && h.length >= S.heismans) say('heismanLore', 0.2, 0.9, [`${count(h.length)} HEISMANS IN THE CASE. WHO'S NEXT?`, `${count(h.length)} HEISMANS, THE LAST ${h[h.length - 1].name.toUpperCase()}. FANS WANT ANOTHER.`]);
  else if (pre && h.length && state.year - h[h.length - 1].year <= 5) say('heismanLore', 0.2, 0.9, [`STILL TALKING ABOUT ${h[h.length - 1].name.toUpperCase()}'S HEISMAN YEAR.`]);
  // All-time wins.
  if (tro.allTime.w >= 300) {
    const sofar = tro.allTime.w + (over ? 0 : rec.w);
    const mark = Math.floor(sofar / S.milestone) * S.milestone;
    const nextMark = mark + S.milestone;
    // Crossed this season.
    if (!over && sofar - rec.w < mark) say('milestone', 0.3, 1.1, [`WIN NO. ${mark.toLocaleString('en-US')} IN SCHOOL HISTORY IS IN THE BOOKS.`]);
    else if (nextMark - sofar <= (over || pre ? 12 : 3)) say('milestone', 0.2, 0.9, [`${nextMark - sofar} WINS FROM NO. ${nextMark.toLocaleString('en-US')} ALL TIME.`, `CLOSING IN ON WIN NO. ${nextMark.toLocaleString('en-US')}.`]);
  }
}

// ------------------------------------------------------------ recruiting and the portal

function recruiting(c: Ctx): void {
  const { state, id, tier, say } = c;
  const rs = state.recruiting;
  if (rs) {
    const home = TEAM_STATE[id];
    const rivalIds = new Set(RIVALRIES.flatMap((r) => (r.a === id ? [r.b] : r.b === id ? [r.a] : [])));
    let top: { pid: string; rank: number; to: string } | undefined;
    const mine: { pid: string; rank: number }[] = [];
    for (const [pid, to] of Object.entries(rs.commits)) {
      const p = prospect(pid);
      if (!p) continue;
      if (to === id && p.stars >= 5) mine.push({ pid, rank: p.rank });
      if (p.a.hometown.state === home && p.rank <= S.inStateRank && (!top || p.rank < top.rank)) top = { pid, rank: p.rank, to };
    }
    if (mine.length) {
      const best = prospect(mine.sort((a, b) => a.rank - b.rank)[0].pid)!;
      const nm = athleteName(best.a).toUpperCase();
      say('fiveStar', 0.45 + 0.05 * Math.min(3, mine.length - 1), 1.4, mine.length > 1 ? [`${count(mine.length)} FIVE-STAR COMMITS, LED BY ${best.pos} ${nm}.`] : [`LANDED A FIVE-STAR: ${best.pos} ${nm}.`, `FIVE-STAR ${best.pos} ${nm} IS COMING. FANS ARE HYPED.`]);
    }
    // The state's best, and where he went.
    if (top && tier <= 3) {
      const p = prospect(top.pid)!;
      const nm = athleteName(p.a).toUpperCase();
      // A five-star who stayed home is already the five-star line.
      const told = mine.some((m) => m.pid === top!.pid);
      if (top.to === id) {
        if (!told) say('inState', 0.4, 1.2, [`KEPT THE STATE'S TOP RECRUIT HOME: ${p.pos} ${nm}.`, `${nm}, THE BEST PLAYER IN THE STATE, STAYED HOME.`]);
      } else if (rivalIds.has(top.to) || (TEAM_STATE[top.to] === home && teamById(top.to).profile.tier <= tier)) say('inState', -0.4, 1.3, [`THE STATE'S TOP RECRUIT, ${p.pos} ${nm}, PICKED ${school(top.to)}.`, `LOSING ${nm} TO ${school(top.to)} STINGS.`], [top.to]);
    }
  }
  const arrivals = Object.entries(state.portal?.commits ?? {}).filter(([, to]) => to === id).map(([pid]) => state.portal!.entrants.find((e) => e.id === pid)).filter((e) => e && e.ovr >= S.portalOvr && e.from !== id).sort((a, b) => b!.ovr - a!.ovr);
  const a = arrivals[0];
  if (a) say('portalIn', 0.35, 1.1, [`PORTAL PICKUP: A ${a.ovr} OVR ${a.pos} FROM ${school(a.from)}.`, `THE ${a.pos} FROM ${school(a.from)} (${a.ovr} OVR) COULD START RIGHT AWAY.`], [a.from]);
}
