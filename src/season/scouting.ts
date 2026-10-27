import type { Athlete } from '../data/athletes';
import { fitRatings, healthOf, healthy, returnRating, starters, teamRatings, type Squad, type TeamRatings } from '../data/depth';
import { defIdentity, defLabel, shellShares, situationMix, type DefIdentity } from '../data/identity';
import { PLAYBOOK, ROUTES, type PlayDef, type RouteName } from '../data/plays';
import { overall, SLOT_POS } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import { DEF_SLOTS, OFF_SLOTS, TEAMS, teamById } from '../data/teams';
import { FIELD_W } from '../engine/constants';
import { resolvePlay } from '../game/resolvePlay';
import { latestPoll, rankIn } from './polls';
import { QB_RUN_SHARE, TARGETS } from './simGame';
import { SCHEME_PASS } from './staff';
import { records, recordText } from './standings';
import type { SeasonGame, SeasonState } from './types';
import { squadFor } from './world';

/**
 * The weekly scouting report on the user's next opponent: what each coach on the staff tells you.
 * A pure function of the season (identity, rosters, results), built when the prep page opens.
 * Every item has a `tier`: how good a staff has to be to find it. Everything shows for now; once
 * coaches exist, staff quality hides the higher tiers (docs/SCOUTING.md).
 */

export type Tier = 1 | 2 | 3;

export interface ScoutItem {
  text: string;
  tier: Tier;
  /** A warning (their edge) rather than an opportunity (ours). */
  warn?: boolean;
}

export interface ScoutSection {
  coach: string;
  title: string;
  items: ScoutItem[];
  /** A dim line under the section. */
  note?: string;
}

export interface Suggestion {
  id: string;
  why: string;
}

export interface RecentGame {
  week: number;
  opp: string;
  /** 'VS', '@' or 'N' (neutral). */
  site: string;
  us: number;
  them: number;
  ot: boolean;
}

export interface ScoutReport {
  opp: string;
  game: SeasonGame;
  ratings: { user: TeamRatings; opp: TeamRatings };
  record: string;
  rank: number;
  defTag: string;
  offTag: string;
  recent: RecentGame[];
  /** Per-game averages from simulated box scores (the user's live games record only the score). */
  averages: { games: number; ppg: number; papg: number; ypg: number; passYpg: number; rushYpg: number } | null;
  sections: ScoutSection[];
  suggestions: Suggestion[];
}

const OFF_TAG: Record<string, string> = {
  'air-raid': 'AIR RAID', spread: 'SPREAD', pro: 'PRO STYLE', 'power-run': 'POWER RUN', option: 'RUN-FIRST OPTION',
};
const QB_TAG: Record<string, string> = { pocket: 'STAYS IN THE POCKET', dual: 'WILL SCRAMBLE', runner: 'IS A RUNNER FIRST' };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => (x >= 0 ? `+${Math.round(x)}` : String(Math.round(x)));
const short = (a: Athlete) => `${a.first[0]}. ${a.last}`.toUpperCase();
const ovrAt = (a: Athlete, slot: string) => overall(fitRatings(a), SLOT_POS[slot]);
const who = (a: Athlete, slot: string) => `${slot} #${a.num} ${short(a)} (${ovrAt(a, slot)})`;

// ------------------------------------------------------------ play traits

export type Trait = 'quick' | 'screen' | 'deep' | 'manBeater' | 'runInside' | 'runOutside' | 'pa' | 'rpo';

const SCREEN_ROUTES = new Set<RouteName>(['smoke', 'tunnel', 'bubble', 'screen']);
const MAN_BEATERS = new Set<RouteName>(['slant', 'drag', 'cross']);
const OUTSIDE_PATHS = new Set<RouteName>(['toss', 'sweep', 'pitchPath', 'oz', 'stretch']);

/** What a play is good for, read off its data (routes, scheme, read) rather than hand tags. */
export function playTraits(p: PlayDef): Set<Trait> {
  const out = new Set<Trait>();
  const rp = resolvePlay(p, FIELD_W / 2, false);
  const routes = Object.values(rp.routes).filter((r): r is RouteName => !!r);
  const pass = routes.filter((r) => r !== 'block' && !ROUTES[r].run && !ROUTES[r].lead && r !== 'paFake');
  const depth = (r: RouteName) => Math.max(0, ...ROUTES[r].pts.map(([dn]) => dn));
  if (p.kind === 'run') {
    const outside = p.scheme?.run === 'stretch' || p.read === 'pitch' || p.read === 'option' || routes.some((r) => OUTSIDE_PATHS.has(r));
    out.add(outside ? 'runOutside' : 'runInside');
    return out;
  }
  if (p.read === 'rpo') out.add('rpo');
  else if (p.kind === 'pa') out.add('pa');
  if (p.screen || pass.some((r) => SCREEN_ROUTES.has(r))) out.add('screen');
  else if (pass.length && Math.max(...pass.map(depth)) <= 8) out.add('quick');
  if (pass.some((r) => depth(r) >= 25)) out.add('deep');
  if (pass.some((r) => MAN_BEATERS.has(r))) out.add('manBeater');
  return out;
}

// ------------------------------------------------------------ the report

/** League averages the report compares against: the zero-blitz share on every snap and on third and long, and press. */
function leagueNorms(): { c0: number; c0Long: number; press: number } {
  let c0 = 0;
  let c0Long = 0;
  let press = 0;
  for (const t of TEAMS) {
    const id = defIdentity(t);
    c0 += id.mix['c0-blitz'];
    c0Long += situationMix(id, 3, 8)['c0-blitz'];
    press += (id.press.CB1 + id.press.CB2) / 2;
  }
  const n = TEAMS.length;
  return { c0: c0 / n, c0Long: c0Long / n, press: press / n };
}

let norms: ReturnType<typeof leagueNorms> | null = null;

function recentGames(s: SeasonState, team: string): RecentGame[] {
  return s.games
    .filter((g) => g.result && (g.home === team || g.away === team))
    .sort((a, b) => b.week - a.week)
    .slice(0, 5)
    .map((g) => {
      const home = g.home === team;
      const r = g.result!;
      return { week: g.week, opp: home ? g.away : g.home, site: g.neutral ? 'N' : home ? 'VS' : '@', us: home ? r.home : r.away, them: home ? r.away : r.home, ot: r.ot > 0 };
    });
}

function averages(s: SeasonState, team: string): ScoutReport['averages'] {
  const games = s.games.filter((g) => g.result && !g.result.live && (g.home === team || g.away === team));
  if (!games.length) return null;
  let pf = 0, pa = 0, yds = 0, pass = 0, rush = 0;
  for (const g of games) {
    const home = g.home === team;
    const r = g.result!;
    const line = home ? r.box.home : r.box.away;
    pf += home ? r.home : r.away;
    pa += home ? r.away : r.home;
    yds += line.yards;
    pass += line.passYds;
    rush += line.rushYds;
  }
  const n = games.length;
  return { games: n, ppg: pf / n, papg: pa / n, ypg: yds / n, passYpg: pass / n, rushYpg: rush / n };
}

/** The OC on their defense: what they call, when they bring it, and who to account for. */
function ocSection(opp: Squad, id: DefIdentity): ScoutSection {
  const N = (norms ??= leagueNorms());
  const sh = shellShares(id.mix);
  const longC0 = situationMix(id, 3, 8)['c0-blitz'];
  const press = (id.press.CB1 + id.press.CB2) / 2;
  const items: ScoutItem[] = [
    { tier: 1, text: `SHELLS: TWO-HIGH ${pct(sh['two-high'])}, SINGLE-HIGH ${pct(sh['one-high'])}, ZERO BLITZ ${pct(sh.zero)} (FBS ~${pct(N.c0)} ZERO).` },
    {
      tier: 2, warn: longC0 > N.c0Long + 0.04,
      text: `3RD AND 7+: ZERO BLITZ ${pct(longC0)} OF THE TIME (FBS ~${pct(N.c0Long)}).${longC0 > N.c0Long + 0.04 ? ' HAVE A HOT THROW READY.' : ''}`,
    },
    { tier: 2, text: `CORNERS PRESS ${pct(press)} OF SNAPS (FBS ~${pct(N.press)}).${press >= 0.42 ? ' EXPECT JAMS: QUICK BREAKS AND RUBS.' : press <= 0.25 ? ' SOFT CUSHIONS: THE QUICK GAME IS THERE.' : ''}` },
  ];
  const on = starters(opp);
  const defSlots = DEF_SLOTS.filter((sl) => on[sl]);
  const best = [...defSlots].sort((a, b) => ovrAt(on[b], b) - ovrAt(on[a], a)).slice(0, 3);
  for (const sl of best) {
    const a = on[sl];
    const tags = [a.real ? 'STANDOUT' : '', (a.conf ?? 0) >= 0.4 ? 'ROLLING' : ''].filter(Boolean).join(', ');
    items.push({ tier: 1, warn: true, text: `WATCH: ${who(a, sl)}${tags ? ` - ${tags}` : ''}.` });
  }
  const cover = ['CB1', 'CB2', 'NB', 'FS', 'SS'].filter((sl) => on[sl]);
  if (cover.length) {
    const weak = cover.reduce((m, sl) => (ovrAt(on[sl], sl) < ovrAt(on[m], m) ? sl : m));
    items.push({ tier: 2, text: `WEAK LINK IN COVERAGE: ${who(on[weak], weak)}. TEST HIM.` });
  }
  return { coach: 'OC', title: 'THEIR DEFENSE', items };
}

/** The DC on their offense. Information only until weekly emphases exist. */
function dcSection(opp: Squad): ScoutSection {
  const prof = opp.team.profile.offense;
  const passShare = SCHEME_PASS[prof.scheme] ?? 0.5;
  const on = starters(opp);
  const items: ScoutItem[] = [{ tier: 1, text: `${OFF_TAG[prof.scheme] ?? 'BALANCED'} OFFENSE: ABOUT ${pct(passShare)} PASSES.` }];
  if (on.QB) items.push({ tier: 1, text: `QB ${short(on.QB)} (${ovrAt(on.QB, 'QB')}) ${QB_TAG[prof.qbStyle]}: ~${pct(QB_RUN_SHARE[prof.qbStyle] ?? 0.1)} OF THEIR CARRIES.` });
  const targets = Object.entries(TARGETS).filter(([sl]) => on[sl]);
  if (targets.length) {
    const [sl] = targets.reduce((m, t) => (t[1] * (ovrAt(on[t[0]], t[0]) / 75) ** 2 > m[1] * (ovrAt(on[m[0]], m[0]) / 75) ** 2 ? t : m));
    items.push({ tier: 1, warn: true, text: `GO-TO TARGET: ${who(on[sl], sl)}.` });
  }
  if (on.RB) items.push({ tier: 1, text: `FEATURE BACK: ${who(on.RB, 'RB')}.` });
  for (const sl of ['QB', 'RB', 'X', 'Z', 'SL', 'TE']) {
    const a = on[sl];
    const c = a?.conf ?? 0;
    if (a && Math.abs(c) >= 0.4) items.push({ tier: 2, text: `${sl} ${short(a)} IS ${c > 0 ? 'ROLLING' : 'SHAKY'} RIGHT NOW.` });
  }
  return { coach: 'DC', title: 'THEIR OFFENSE', items, note: 'FOR NOW THIS IS INFORMATION ONLY: WEEKLY DEFENSIVE EMPHASES COME WITH THE STAFF.' };
}

interface Edge {
  text: string;
  score: number;
}

/** One-on-one matchups the position coaches care about, best and worst. */
interface Matchups {
  wr: Edge[];
  ol: Edge[];
  /** Our side of the line with the clear run-blocking edge. */
  runSide: { side: string; edge: number } | null;
  /** Our receiver with the biggest speed edge, and the one with the biggest route-vs-coverage edge. */
  deep: { slot: string; edge: number } | null;
  routes: { slot: string; edge: number } | null;
}

function matchups(user: Squad, opp: Squad): Matchups {
  const us = starters(user);
  const them = starters(opp);
  const val = (a: Athlete, k: RatingKey) => fitRatings(a)[k];
  const wr: Edge[] = [];
  let deep: Matchups['deep'] = null;
  let routes: Matchups['routes'] = null;
  for (const [o, d] of [['X', 'CB1'], ['Z', 'CB2'], ['SL', 'NB'], ['TE', 'SS']] as const) {
    const a = us[o];
    const b = them[d];
    if (!a || !b) continue;
    const spd = val(a, 'spd') - val(b, 'spd');
    const rte = val(a, 'rte') - val(b, 'mcv');
    const verdict = spd >= 5 ? 'TAKE SHOTS' : rte >= 6 ? 'HE WINS HIS ROUTES' : spd + rte <= -8 ? 'TOUGH DRAW' : 'EVEN';
    wr.push({ score: spd + rte, text: `${o} ${short(a)} VS ${d} ${short(b)}: ${signed(spd)} SPEED, ${signed(rte)} ROUTES VS COVERAGE. ${verdict}.` });
    if (o !== 'TE' && spd >= 5 && (!deep || spd > deep.edge)) deep = { slot: o, edge: spd };
    if (rte >= 6 && (!routes || rte > routes.edge)) routes = { slot: o, edge: rte };
  }
  const ol: Edge[] = [];
  for (const [o, d] of [['LT', 'DE1'], ['LG', 'DT1'], ['RG', 'DT2'], ['RT', 'DE2']] as const) {
    const a = us[o];
    const b = them[d];
    if (!a || !b) continue;
    const pass = val(a, 'pbk') - val(b, 'rsh');
    ol.push({ score: pass, text: `${o} ${short(a)} VS ${d} ${short(b)}: ${signed(pass)} PASS BLOCK VS RUSH.${pass <= -8 ? ' HELP HIM: CHIP OR SLIDE.' : ''}` });
  }
  const side = (os: string[], ds: string[]) => {
    const pairs = os.map((o, i) => [us[o], them[ds[i]]] as const).filter(([a, b]) => a && b);
    return pairs.length ? pairs.reduce((s, [a, b]) => s + val(a!, 'rbk') - val(b!, 'bsh'), 0) / pairs.length : 0;
  };
  const left = side(['LT', 'LG'], ['DE1', 'DT1']);
  const right = side(['RT', 'RG'], ['DE2', 'DT2']);
  const runSide = Math.abs(left - right) >= 4 ? { side: left > right ? 'LEFT' : 'RIGHT', edge: Math.max(left, right) } : null;
  return { wr, ol, runSide, deep, routes };
}

function positionSections(user: Squad, opp: Squad, m: Matchups, id: DefIdentity): ScoutSection[] {
  const byScore = (xs: Edge[]) => [...xs].sort((a, b) => b.score - a.score);
  const wr = byScore(m.wr);
  const ol = byScore(m.ol);
  const out: ScoutSection[] = [];
  const pick = (xs: Edge[]) => (xs.length <= 3 ? xs : [...xs.slice(0, 2), xs[xs.length - 1]]);
  out.push({ coach: 'WR COACH', title: 'OUTSIDE MATCHUPS', items: pick(wr).map((e) => ({ tier: 2 as Tier, text: e.text, warn: e.score < -4 })) });
  const olItems: ScoutItem[] = [ol[ol.length - 1], ol[0]].filter(Boolean).map((e) => ({ tier: 2 as Tier, text: e.text, warn: e.score < -4 }));
  if (m.runSide) olItems.push({ tier: 3, text: `RUN BLOCKING: OUR ${m.runSide.side} SIDE HAS THE EDGE (${signed(m.runSide.edge)} BLOCK VS SHED). RUN TO IT.` });
  out.push({ coach: 'OL COACH', title: 'IN THE TRENCHES', items: olItems });
  const us = starters(user);
  if (us.QB) {
    const pac = fitRatings(us.QB).pac;
    const blitzy = id.mix['c0-blitz'] >= 0.25;
    const quiet = id.mix['c0-blitz'] <= 0.12;
    out.push({
      coach: 'QB COACH', title: 'UNDER CENTER',
      items: [{
        tier: 2, warn: blitzy && pac < 75,
        text: blitzy
          ? `THEY WILL BLITZ. ${short(us.QB)}'S POISE IS ${pac}: ${pac < 75 ? 'GET IT OUT FAST, DON\'T HOLD IT.' : 'HE CAN STAND IN, BUT KNOW YOUR HOT READ.'}`
          : quiet
            ? `A QUIETER RUSH PLAN THAN MOST. ${short(us.QB)} SHOULD HAVE TIME: READ THE SHELL AND TAKE WHAT IT GIVES.`
            : `AN ORDINARY PRESSURE PLAN. WHEN THE SAFETIES WALK DOWN, ${short(us.QB)} NEEDS HIS HOT READ.`,
      }],
    });
  }
  return out;
}

/** The 22 every-down starters (no kickers or package players). */
const MAIN_SLOTS: string[] = [...OFF_SLOTS, ...DEF_SLOTS];

function medicalSection(opp: Squad): ScoutSection {
  const items: ScoutItem[] = [];
  const byId = new Map(opp.athletes.map((a) => [a.id, a]));
  const on = starters(opp);
  const seen = new Set<string>();
  for (const [slot, ids] of Object.entries(opp.depth)) {
    if (!MAIN_SLOTS.includes(slot)) continue;
    const top = byId.get(ids[0]);
    if (!top || healthy(top) || seen.has(top.id)) continue;
    seen.add(top.id);
    const inj = top.injury!;
    const next = on[slot];
    items.push({ tier: 1, text: `OUT: ${slot} ${short(top)} (${inj.type.toUpperCase()}${inj.season ? ', SEASON' : `, ${inj.weeks}W`})${next ? `. ${short(next)} STARTS.` : '.'}` });
  }
  for (const [slot, a] of Object.entries(on)) {
    if (MAIN_SLOTS.includes(slot) && healthOf(a) < 90) items.push({ tier: 2, text: `BANGED UP: ${slot} ${short(a)} AT ${Math.round(healthOf(a))}% HEALTH.` });
  }
  if (!items.length) items.push({ tier: 1, text: 'NO STARTERS ON THE INJURY REPORT.' });
  return { coach: 'TRAINER', title: 'THEIR INJURY REPORT', items: items.slice(0, 6) };
}

function stSection(opp: Squad): ScoutSection {
  const on = starters(opp);
  const items: ScoutItem[] = [];
  if (on.K) {
    const r = fitRatings(on.K);
    items.push({ tier: 1, text: `K ${short(on.K)} (${ovrAt(on.K, 'K')}): POWER ${r.kpw}, ACCURACY ${r.kac}.` });
  }
  const ret = [on.Z, on.RB].filter(Boolean).sort((a, b) => returnRating(b) - returnRating(a))[0];
  if (ret) {
    const spd = fitRatings(ret).spd;
    items.push({ tier: 2, warn: spd >= 92, text: `RETURNER ${short(ret)}: SPEED ${spd}${spd >= 92 ? '. DANGEROUS: KICK AWAY FROM HIM OR OUT OF THE END ZONE.' : '.'}` });
  }
  return { coach: 'ST COACH', title: 'SPECIAL TEAMS', items };
}

/**
 * Plays the staff likes this week, from their tendencies and our matchups. Starred plays come first
 * among equals, and no trait fills the whole list.
 */
function suggest(id: DefIdentity, m: Matchups, starred: Set<string>): Suggestion[] {
  const sh = shellShares(id.mix);
  const press = (id.press.CB1 + id.press.CB2) / 2;
  const rules: { trait: Trait; w: number; why: string }[] = [];
  if (sh.zero >= 0.25) {
    rules.push({ trait: 'quick', w: 2, why: 'BEATS THEIR BLITZ' });
    rules.push({ trait: 'screen', w: 2, why: 'SCREEN VS THE BLITZ' });
  }
  if (sh['two-high'] >= 0.45) rules.push({ trait: 'runInside', w: 2, why: 'LIGHT BOX VS TWO-HIGH' });
  if (sh['one-high'] >= 0.42) rules.push({ trait: 'deep', w: 1.5, why: 'SEAMS VS SINGLE-HIGH' });
  if (press >= 0.42) rules.push({ trait: 'manBeater', w: 2, why: 'BEATS PRESS MAN' });
  if (sh.zero <= 0.12) rules.push({ trait: 'pa', w: 1.5, why: 'SELL RUN, THEY SIT BACK' });
  if (m.deep) rules.push({ trait: 'deep', w: 2, why: `${m.deep.slot} HAS THE SPEED EDGE` });
  if (m.runSide) rules.push({ trait: 'runInside', w: 1, why: `RUN BEHIND OUR ${m.runSide.side} SIDE` });
  if (press <= 0.25) rules.push({ trait: 'quick', w: 1.5, why: 'SOFT CUSHIONS: GO QUICK' });
  if (m.routes) rules.push({ trait: 'manBeater', w: 1, why: `${m.routes.slot} WINS HIS ROUTES` });
  // Low-weight staples, so a quiet week still fills the list.
  rules.push({ trait: 'quick', w: 0.4, why: 'STAY ON SCHEDULE' }, { trait: 'runInside', w: 0.3, why: 'KEEP THEM HONEST' });
  const scored = PLAYBOOK.filter((p) => p.kind !== 'st' && !p.short).map((p, i) => {
    const t = playTraits(p);
    let score = 0;
    let top: { w: number; why: string } | null = null;
    for (const r of rules) {
      if (!t.has(r.trait)) continue;
      score += r.w;
      if (!top || r.w > top.w) top = r;
    }
    return { p, i, score: score + (starred.has(p.id) ? 0.5 : 0), why: top?.why ?? '', trait: [...t][0] };
  }).filter((x) => x.why);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const out: Suggestion[] = [];
  const perWhy = new Map<string, number>();
  for (const x of scored) {
    const n = perWhy.get(x.why) ?? 0;
    if (n >= 2) continue;
    perWhy.set(x.why, n + 1);
    out.push({ id: x.p.id, why: x.why });
    if (out.length >= 5) break;
  }
  return out;
}

export function scoutReport(s: SeasonState, game: SeasonGame, starred: Set<string> = new Set()): ScoutReport {
  const u = s.config.userTeamId;
  const oppId = game.home === u ? game.away : game.home;
  const user = squadFor(s, u);
  const opp = squadFor(s, oppId);
  const id = defIdentity(teamById(oppId));
  const m = matchups(user, opp);
  const prof = opp.team.profile.offense;
  return {
    opp: oppId,
    game,
    ratings: { user: teamRatings(user), opp: teamRatings(opp) },
    record: recordText(records(s).get(oppId)!),
    rank: rankIn(latestPoll(s, 'ap'), oppId),
    defTag: defLabel(id),
    offTag: `${OFF_TAG[prof.scheme] ?? 'BALANCED'}, ${prof.qbStyle.toUpperCase()} QB`,
    recent: recentGames(s, oppId),
    averages: averages(s, oppId),
    sections: [ocSection(opp, id), dcSection(opp), ...positionSections(user, opp, m, id), medicalSection(opp), stSection(opp)],
    suggestions: suggest(id, m, starred),
  };
}
