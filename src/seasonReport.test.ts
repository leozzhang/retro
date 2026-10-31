import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSquad, healthOf, healthy, HEALTH, positionOrder, reorderPosition, starters, teamRatings } from './data/depth';
import { overallRaw, POS_ROLE, POSITIONS } from './data/positions';
import { CALENDAR } from './data/season/calendar';
import { teamById, TEAMS } from './data/teams';
import { latestPoll, rankIn } from './season/polls';
import { champions } from './season/postseason';
import { advanceWeek, defaultConfig, newSeason, nextSeason, seasonOver, simSeason } from './season/season';
import { records, recordText, winner } from './season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from './season/stats';
import type { DriveLog, InjuryLevel, SeasonState, TeamState } from './season/types';
import { headCoachFor, squadFor, staffFor } from './season/world';
import { DEF_SLOTS, OFF_SLOTS } from './season/grades';
import { BREAKOUT, CONFIDENCE, confOf } from './season/confidence';
import { setUserDepth } from './season/staff';
import { actualRole, moraleContext, moraleOf, moraleReason, type MoraleDriver } from './season/morale';
import { anyCoach, buildHeadCoach, buildStaff, COACH_ROLES, coachName, GROUPS, type AnyRole, type Coach, type CoachRole, type Staff } from './data/coaches';
import { ARCS, coachArc, groupXp } from './season/coaching';
import { hire, outsideFor, TREE_SCORE, treeOf, treeScore } from './season/carousel';
import { EMPHASES, GROUP_POS, GROUP_SLOTS } from './data/emphasis';
import { hashString, mulberry32 } from './engine/math';
import { driveMods, emphasisMods, type DriveMods } from './season/emphasis';
import { simulateDrive } from './game/rules';
import { progressTeam } from './season/progression';
import { SCOUT_TIERS } from './season/scouting';
import { simGame } from './season/simGame';
import { SCHEME_PASS } from './season/staff';
import { START_SLOTS } from './season/confidence';
import { actOnLeaving, buildBoard, entryOdds, leavingList, MIN_COUNT, PORTAL } from './season/portal';
import { advanceOffseason, startToPortal } from './season/offseason';
import { baseRoster } from './season/world';
import { overall } from './data/positions';

/**
 * `npm run season`: simulate whole seasons headlessly and write season.txt. SEASONS=n sets the count,
 * INJURIES=off|light|normal the injury setting (default normal).
 */

const pctText = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * Real FBS-vs-FBS references, 2024-25 regular season and postseason (ESPN scores, 1,606 games; ranked
 * losses from the AP rank at kickoff). See docs/SEASON.md.
 */
const REAL = { ppg: 26.5, oneScore: 38.0, by28: 18.9, by35: 10.0, shutout: 1.5, ot: 5.0, homeConf: 55.8, rankedLosses: 5.5, toUnranked: 2.5 };

function aggregate(seasons: SeasonState[]): string[] {
  let games = 0;
  let pts = 0;
  let oneScore = 0;
  let by28 = 0;
  let by35 = 0;
  let shutouts = 0;
  let confHome = 0;
  let confGames = 0;
  let homeWins = 0;
  let nonNeutral = 0;
  let ot = 0;
  let upsets = 0;
  let rankedLosses = 0;
  let yards = 0;
  const tierWins = new Map<number, number[]>();
  for (const s of seasons) {
    for (const g of s.games.filter((x) => x.kind === 'conf' || x.kind === 'nonconf')) {
      const r = g.result!;
      games++;
      pts += r.home + r.away;
      yards += r.box.home.yards + r.box.away.yards;
      if (r.ot) ot++;
      const m = Math.abs(r.home - r.away);
      if (m <= 8) oneScore++;
      if (m >= 28) by28++;
      if (m >= 35) by35++;
      if (!r.home) shutouts++;
      if (!r.away) shutouts++;
      if (g.kind === 'conf') {
        confGames++;
        if (r.home > r.away) confHome++;
      }
      if (!g.neutral) {
        nonNeutral++;
        if (r.home > r.away) homeWins++;
      }
      const before = latestPoll(s, 'ap', g.week);
      const w = winner(g)!;
      const l = w === g.home ? g.away : g.home;
      if (rankIn(before, l)) {
        rankedLosses++;
        if (!rankIn(before, w)) upsets++;
      }
    }
    const recs = records(s);
    for (const t of TEAMS) {
      const list = tierWins.get(t.profile.tier) ?? tierWins.set(t.profile.tier, []).get(t.profile.tier)!;
      list.push(recs.get(t.id)!.w);
    }
  }
  const n = seasons.length;
  return [
    `SEASONS ${n}  (regular-season games only)`,
    '                           sim      real FBS',
    `points per team per game  ${(pts / games / 2).toFixed(1).padStart(6)}   ${REAL.ppg}`,
    `one-score games (<= 8)    ${pctText(oneScore / games).padStart(6)}   ${REAL.oneScore}%`,
    `won by 28+                ${pctText(by28 / games).padStart(6)}   ${REAL.by28}%`,
    `won by 35+                ${pctText(by35 / games).padStart(6)}   ${REAL.by35}%`,
    `team shutouts             ${pctText(shutouts / games / 2).padStart(6)}   ${REAL.shutout}%`,
    `overtime                  ${pctText(ot / games).padStart(6)}   ${REAL.ot}%`,
    `home win %, conference    ${pctText(confHome / confGames).padStart(6)}   ${REAL.homeConf}%`,
    `home win %, all           ${pctText(homeWins / nonNeutral).padStart(6)}   (real non-conference schedules put favorites at home)`,
    `ranked losses per week    ${(rankedLosses / n / 14).toFixed(1).padStart(6)}   ${REAL.rankedLosses}`,
    `  to unranked teams       ${(upsets / n / 14).toFixed(1).padStart(6)}   ${REAL.toUnranked}`,
    `yards per team per game   ${(yards / games / 2).toFixed(0).padStart(6)}   ~390`,
    'average wins by tier (incl. postseason): ' +
      [...tierWins.entries()].sort((a, b) => a[0] - b[0]).map(([t, w]) => `T${t} ${(w.reduce((a, b) => a + b, 0) / w.length).toFixed(1)}`).join('  '),
  ];
}

/**
 * Progression over a season: overall gained by position (starters on the generated depth chart, and
 * everyone else), level-ups per starter and breakthroughs. Positions far off the mean are flagged.
 */
function progression(seasons: SeasonState[]): string[] {
  const by = new Map<string, { st: number[]; bk: number[]; lv: number[] }>();
  let breaks = 0;
  const tiers = new Map<number, number[]>();
  for (const s of seasons) {
    for (const t of TEAMS) {
      const base = buildSquad(t);
      const now = new Map(squadFor(s, t.id).athletes.map((a) => [a.id, a]));
      const st = starters(base);
      const first = new Set([...OFF_SLOTS, ...DEF_SLOTS, 'K', 'P'].map((x) => st[x]?.id));
      const prog = s.teamState[t.id]?.progress ?? {};
      for (const a of base.athletes) {
        const e = by.get(a.pos) ?? by.set(a.pos, { st: [], bk: [], lv: [] }).get(a.pos)!;
        const gain = overallRaw(now.get(a.id)!.r, a.pos) - overallRaw(a.r, a.pos);
        (first.has(a.id) ? e.st : e.bk).push(gain);
        if (first.has(a.id)) (tiers.get(t.profile.tier) ?? tiers.set(t.profile.tier, []).get(t.profile.tier)!).push(gain);
        if (first.has(a.id)) e.lv.push(prog[a.id]?.lvl ?? 0);
      }
    }
    breaks += s.news.filter((n) => n.kind === 'progress' && n.text.startsWith('BREAKTHROUGH')).length;
  }
  const avg = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
  const all = POSITIONS.filter((p) => p !== 'FB').map((p) => avg(by.get(p)!.st));
  const mean = avg(all);
  const rows = [
    '', 'PROGRESSION: overall gained over the season. Starters: the 11-personnel offense, nickel defense, K and P',
    'of the generated depth chart. Everyone else (backups and package players) in the last column.', 'pos   starters  levels  others',
  ];
  for (const p of POSITIONS) {
    const e = by.get(p)!;
    const g = avg(e.st);
    const flag = p !== 'FB' && Math.abs(g - mean) > 0.15 * mean ? '  <-- off the mean by more than 15%' : '';
    rows.push(`${p.padEnd(5)} ${g.toFixed(2).padStart(8)} ${avg(e.lv).toFixed(1).padStart(7)} ${avg(e.bk).toFixed(2).padStart(8)}${flag}`);
  }
  rows.push(
    'starter gain by program tier (grades are against the matchup, so this should follow dev traits and potential, not wins): ' +
      [...tiers.entries()].sort((a, b) => a[0] - b[0]).map(([t, g]) => `T${t} ${avg(g).toFixed(2)}`).join('  '),
  );
  rows.push(`mean starter gain ${mean.toFixed(2)}; breakthrough news per season ${(breaks / seasons.length).toFixed(1)} (the user's team and real players)`);
  return rows;
}

/**
 * Real references for injuries (docs/INJURIES.md): share of injuries by position group (NCAA ISP),
 * and the per team-season targets for each setting, scaled down from real FBS (18-20 starts lost).
 */
const ISP_SHARE: Record<string, number> = { DB: 17.8, OL: 15.6, DL: 15.4, LB: 11.7, WR: 11.2, RB: 10.2, TE: 5, QB: 3.7, K: 1 };
const INJURY_TARGETS: Record<string, { startsLost: [number, number]; seasonEnd: [number, number]; qbClean: [number, number] }> = {
  normal: { startsLost: [10, 12], seasonEnd: [0.3, 0.7], qbClean: [0.75, 0.85] },
  light: { startsLost: [5, 6.5], seasonEnd: [0.15, 0.35], qbClean: [0.85, 0.95] },
};
const GROUP: Record<string, string> = { CB: 'DB', S: 'DB', OL: 'OL', DL: 'DL', LB: 'LB', WR: 'WR', RB: 'RB', TE: 'TE', QB: 'QB', K: 'K', P: 'K' };

/** Injuries per team-season against the targets, by position against the ISP shares, and starting QBs. */
function injuries(seasons: SeasonState[], level: string, banged: number[]): string[] {
  let inj = 0;
  let starts = 0;
  let enders = 0;
  let missed = 0;
  const qbMiss: number[] = [];
  const byGroup = new Map<string, number>();
  const teamSeasons = seasons.length * TEAMS.length;
  for (const s of seasons) {
    const log = s.injuryLog ?? [];
    const gamesMissed = (team: string, week: number, weeks: number) =>
      s.games.filter((g) => (g.home === team || g.away === team) && g.week > week && g.week <= week + weeks).length;
    const out = new Map<string, number>();
    for (const e of log) {
      const n = gamesMissed(e.team, e.week, e.weeks);
      inj++;
      if (e.season) enders++;
      if (e.starter) starts += n;
      out.set(e.id, (out.get(e.id) ?? 0) + n);
      const g = GROUP[POS_ROLE[e.pos]];
      byGroup.set(g, (byGroup.get(g) ?? 0) + 1);
    }
    missed += [...out.values()].filter((n) => n > 0).length;
    for (const t of TEAMS) {
      const qb = starters(buildSquad(t)).QB;
      if (qb) qbMiss.push(out.get(qb.id) ?? 0);
    }
  }
  const tgt = INJURY_TARGETS[level];
  const flag = (x: number, [lo, hi]: [number, number]) => (tgt && (x < lo || x > hi) ? `  <-- target ${lo}-${hi}` : '');
  const per = (x: number) => x / teamSeasons;
  const qbClean = qbMiss.filter((n) => n === 0).length / qbMiss.length;
  const rows = [
    '', `INJURIES (setting ${level.toUpperCase()}), per team-season. Real FBS teams lose about 18-20 starts a season.`,
    `injuries that cost a game ${per(inj).toFixed(2)}; players who missed a game ${per(missed).toFixed(2)}; ` +
      `starter-games lost ${per(starts).toFixed(1)}${tgt ? flag(per(starts), tgt.startsLost) : ''}; season-ending ${per(enders).toFixed(2)}${tgt ? flag(per(enders), tgt.seasonEnd) : ''}`,
    `starting QB (generated chart) games missed: none ${pctText(qbClean)}${tgt ? flag(qbClean, tgt.qbClean) : ''}, ` +
      `1-2 ${pctText(qbMiss.filter((n) => n >= 1 && n <= 2).length / qbMiss.length)}, 3+ ${pctText(qbMiss.filter((n) => n >= 3).length / qbMiss.length)}${level === 'normal' ? ' (target about 8%)' : ''}`,
    `starters banged up (health under 90) on a given week: ${pctText(banged.reduce((a, b) => a + b, 0) / Math.max(1, banged.length))}${level === 'normal' ? ' (target 10-20%)' : ''}`,
    'group   share   ISP',
  ];
  for (const [g, real] of Object.entries(ISP_SHARE)) {
    const sh = (byGroup.get(g) ?? 0) / Math.max(1, inj);
    rows.push(`${g.padEnd(6)} ${pctText(sh).padStart(6)} ${`${real.toFixed(1)}%`.padStart(6)}`);
  }
  return rows;
}

/** What the confidence section samples each regular-season week. */
interface ConfSample {
  /** Every team's 22 starters' confidence. */
  conf: number[];
  /** Team-seasons whose starting QB lost the job while healthy and slumping. */
  qbSlumps: number;
}

/** The 22 starters' confidence on every team now, and each team's QB (for slump benchings). */
function confSnapshot(s: SeasonState, out: number[], qbs: Map<string, string>, slumped: Set<string>): void {
  for (const t of TEAMS) {
    const sq = squadFor(s, t.id);
    const st = starters(sq);
    const prog = s.teamState[t.id]?.progress ?? {};
    for (const slot of [...OFF_SLOTS, ...DEF_SLOTS]) if (st[slot]) out.push(confOf(prog[st[slot].id]));
    const qb = st.QB?.id;
    const was = qbs.get(t.id);
    if (qb && was && qb !== was) {
      const old = sq.athletes.find((a) => a.id === was);
      if (old && healthy(old) && healthOf(old) >= HEALTH.restBelow && (prog[was]?.c ?? 0) <= CONFIDENCE.slump) slumped.add(`${s.year}:${t.id}`);
    }
    if (qb) qbs.set(t.id, qb);
  }
}

/**
 * Confidence (docs/CONFIDENCE.md): how starters' confidence spreads, next-man-up sparks per
 * team-season and why, breakouts, benchings, and the slumping QBs the staff sat.
 */
function confidence(seasons: SeasonState[], sample: ConfSample): string[] {
  const c = sample.conf;
  const mean = c.reduce((a, b) => a + b, 0) / c.length;
  const sd = Math.sqrt(c.reduce((a, b) => a + (b - mean) ** 2, 0) / c.length);
  const beyond = c.filter((x) => Math.abs(x) > 0.6).length / c.length;
  const teamSeasons = seasons.length * TEAMS.length;
  const log = seasons.flatMap((s) => s.confLog ?? []);
  const sparks = log.filter((e) => e.kind === 'spark');
  const by = (r: string) => sparks.filter((e) => e.reason === r).length / teamSeasons;
  const outs = log.filter((e) => e.kind === 'breakout');
  const sparkedOut = outs.length / Math.max(1, sparks.length);
  return [
    '', 'CONFIDENCE (docs/CONFIDENCE.md). Targets: starters SD about 0.3, about 5% beyond +/-0.6; 2-4 sparks per team-season (most after injuries);',
    'about 1 in 10 sparks break out; a starting QB sat for a slump in 5-10% of team-seasons.',
    `starters' confidence (every regular week): mean ${mean.toFixed(3)}, SD ${sd.toFixed(3)}, beyond +/-0.6 ${pctText(beyond)}`,
    `sparks per team-season ${(sparks.length / teamSeasons).toFixed(2)}: injured ${by('injured').toFixed(2)}, ` +
      `slumping ${by('slumping').toFixed(2)}, outplayed ${by('outplayed').toFixed(2)}`,
    `breakouts per season ${(outs.length / seasons.length).toFixed(1)} (${pctText(sparkedOut)} of sparks; window ${BREAKOUT.games} games, z ${BREAKOUT.z})`,
    `in-form starters the user benched for weaker players per season ${(log.filter((e) => e.kind === 'bench').length / seasons.length).toFixed(2)}`,
    `team-seasons with a slumping QB benched ${pctText(sample.qbSlumps / teamSeasons)}`,
  ];
}

/**
 * The farming check: the user swaps QB1 and QB2 every week (a healthy, in-form starter benched for a
 * weaker one) against the staff chart with QB1 hurt for three weeks. Swapping should never spark the
 * backup and should cost QB1 confidence; the injury should spark him once.
 */
function farming(level: InjuryLevel): string[] {
  const run = (swap: boolean) => {
    const s = newSeason({ ...defaultConfig('georgia'), injuries: level }, 101);
    const qb1 = positionOrder(squadFor(s, 'georgia'), 'QB')[0].id;
    while (!seasonOver(s) && s.phase === 'regular') {
      if (swap && s.week >= 2) {
        // QB1 starts the odd weeks, QB2 the even ones.
        const sq = squadFor(s, 'georgia');
        const order = positionOrder(sq, 'QB');
        const want = s.week % 2 ? qb1 : order.find((a) => a.id !== qb1)!.id;
        if (order[0].id !== want) setUserDepth(s, reorderPosition(sq, 'QB', order.findIndex((a) => a.id === want), 0));
      }
      if (!swap && s.week === 4) (s.teamState.georgia ??= {}).injuries = { ...(s.teamState.georgia?.injuries ?? {}), [qb1]: { weeks: 3, type: 'TEST' } };
      advanceWeek(s);
    }
    const log = (s.confLog ?? []).filter((e) => e.team === 'georgia' && e.pos === 'QB');
    const sparks = log.filter((e) => e.kind === 'spark').map((e) => `wk${e.week} ${e.reason}`).join(', ') || 'none';
    const p = s.teamState.georgia?.progress?.[qb1];
    return `sparks: ${sparks}; benchings ${log.filter((e) => e.kind === 'bench').length}; QB1 built-up ${(p?.c ?? 0).toFixed(2)}, on the field ${confOf(p).toFixed(2)}`;
  };
  return ['', 'FARMING CHECK (Georgia QBs, regular season)', `  swap QB1/QB2 every week: ${run(true)}`, `  QB1 hurt weeks 4-6:      ${run(false)}`];
}

interface MoraleSample {
  all: number[];
  starters: number[];
  /** Starters' morale and confidence, paired: they shouldn't track each other. */
  pairs: [number, number][];
  /** Each team-week's unhappy players, and each week's total and the part of it on its worst 10% of teams. */
  unhappy: number[];
  worst: number;
  total: number;
  tiers: Map<number, number[]>;
  roles: Map<string, number[]>;
  /** Why the unhappy are unhappy, at the end of each regular season. */
  why: Map<string, number>;
}

/** Morale at or under this counts as unhappy (the team page's frown). */
const UNHAPPY = -0.4;

/** Every player's morale on every team now. `why` also tallies the unhappy players' reasons. */
function moraleSnapshot(s: SeasonState, out: MoraleSample, why: boolean): void {
  const counts: number[] = [];
  for (const t of TEAMS) {
    const sq = squadFor(s, t.id);
    const ts = s.teamState[t.id];
    const ctx = moraleContext(s, sq);
    const st = starters(sq);
    const first = new Set([...OFF_SLOTS, ...DEF_SLOTS].map((x) => st[x]?.id));
    const tier = out.tiers.get(t.profile.tier) ?? out.tiers.set(t.profile.tier, []).get(t.profile.tier)!;
    let unhappy = 0;
    for (const a of sq.athletes) {
      const m = moraleOf(ts, a);
      out.all.push(m);
      tier.push(m);
      const r = actualRole(ctx, a);
      const role = r === null ? 'hurt' : r >= 1 ? 'starting' : r >= 0.7 ? 'package' : r > 0 ? 'backup' : 'buried';
      (out.roles.get(role) ?? out.roles.set(role, []).get(role)!).push(m);
      if (first.has(a.id)) {
        out.starters.push(m);
        out.pairs.push([m, confOf(ts?.progress?.[a.id])]);
      }
      if (m > UNHAPPY) continue;
      unhappy++;
      if (why) {
        const k: MoraleDriver | 'none' = moraleReason(ctx, a, m).driver ?? 'none';
        out.why.set(k, (out.why.get(k) ?? 0) + 1);
      }
    }
    counts.push(unhappy);
  }
  out.unhappy.push(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const worst = counts.sort((a, b) => b - a).slice(0, Math.ceil(TEAMS.length / 10)).reduce((a, b) => a + b, 0);
  out.worst += worst;
  out.total += total;
}

/**
 * Morale (docs/MORALE.md): its spread (it shouldn't sit at the extremes), unhappy players per team
 * and how spread out they are, morale by tier and role, why the unhappy are unhappy, and how little it
 * tracks confidence.
 */
function morale(sample: MoraleSample): string[] {
  const avg = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
  const sd = (x: number[]) => {
    const m = avg(x);
    return Math.sqrt(avg(x.map((v) => (v - m) ** 2)));
  };
  const share = (x: number[], f: (v: number) => boolean) => x.filter(f).length / Math.max(1, x.length);
  const xs = sample.pairs.map(([m]) => m);
  const ys = sample.pairs.map(([, c]) => c);
  const mx = avg(xs);
  const my = avg(ys);
  const r = avg(sample.pairs.map(([m, c]) => (m - mx) * (c - my))) / (sd(xs) * sd(ys) || 1);
  const worst = sample.worst / Math.max(1, sample.total);
  const whyTotal = [...sample.why.values()].reduce((a, b) => a + b, 0) || 1;
  return [
    '', 'MORALE (docs/MORALE.md). Targets: SD about 0.25, under 5% beyond +/-0.6 and about 0 at the extremes (beyond +/-0.9);',
    `about 3-8 unhappy (<= ${UNHAPPY}) a team, spread out: the worst 10% of teams hold under 30% of them; |r| with confidence under 0.3.`,
    `everyone (every regular week): mean ${avg(sample.all).toFixed(3)}, SD ${sd(sample.all).toFixed(3)}, ` +
      `beyond +/-0.6 ${pctText(share(sample.all, (v) => Math.abs(v) > 0.6))}, beyond +/-0.9 ${pctText(share(sample.all, (v) => Math.abs(v) > 0.9))}`,
    `starters: mean ${avg(sample.starters).toFixed(3)}, SD ${sd(sample.starters).toFixed(3)}`,
    `unhappy per team: mean ${avg(sample.unhappy).toFixed(1)}, max ${Math.max(...sample.unhappy)}, ` +
      `teams with none ${pctText(share(sample.unhappy, (v) => v === 0))}; worst 10% of teams hold ${pctText(worst)} of them` +
      (worst > 0.3 ? '  <-- clustered' : ''),
    'by role: ' + ['starting', 'package', 'backup', 'buried', 'hurt'].map((k) => `${k} ${avg(sample.roles.get(k) ?? []).toFixed(2)}`).join('  '),
    'by program tier: ' + [...sample.tiers.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => `T${t} ${avg(v).toFixed(2)}`).join('  '),
    'why the unhappy are unhappy (end of the regular season): ' +
      [...sample.why.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pctText(n / whyTotal)}`).join('  '),
    `starters' morale vs confidence: r = ${r.toFixed(3)}` + (Math.abs(r) > 0.3 ? '  <-- tracking each other' : ''),
  ];
}

/** Mean starter overall (the 11-personnel and nickel lineups, K and P) by program tier. */
function tierStarters(s: SeasonState): number[] {
  return [1, 2, 3, 4, 5].map((tier) => {
    let sum = 0;
    let n = 0;
    for (const t of TEAMS.filter((x) => x.profile.tier === tier)) {
      const st = starters(squadFor(s, t.id));
      for (const slot of START_SLOTS) {
        const a = st[slot];
        if (!a) continue;
        sum += overall(a.r, a.pos);
        n++;
      }
    }
    return sum / n;
  });
}

/**
 * The transfer portal (docs/PORTAL.md): an open-ended career of `n` seasons with every portal side
 * automated, paired with a control on the same seeds that skips the offseason. Volume and who enters,
 * where they go, net talent by tier, starter talent by tier against the control, and promises (the
 * user's staff promises a start to every starter and snaps to every backup on the leaving list, so the
 * spam is measured).
 */
function portalReport(n: number): string[] {
  const cfg = { ...defaultConfig('georgia'), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal: true } };
  let s = newSeason(cfg, 1);
  let c = newSeason(cfg, 1);
  const tierOf = (id: string) => teamById(id).profile.tier;
  const per: number[] = [];
  const roles = { starter: 0, backup: 0 };
  const outs = { commit: 0, return: 0, gone: 0 };
  const flows = new Map<string, number>();
  const net = [0, 0, 0, 0, 0];
  const promises = { kept: 0, broken: 0, made: 0 };
  // Players whose coach left (docs/CAROUSEL_PLAN.md step 5): entrants among them, coach-left reasons, followers.
  const react = { left: 0, followed: 0, reason: 0, shaken: 0, players: 0 };
  let walkOns = 0;
  let maxRoster = 0;
  let minPos = Infinity;
  const talent: string[] = [];
  const fmt = (x: number[]) => x.map((v) => v.toFixed(2)).join(' ');
  const t0 = Date.now();
  let gapDrift = 0;
  const market: Market = { heads: 0, chairs: 0, fbs: 0, outside: 0, free: 0, ga: 0, promoted: 0, flows: [0, 0, 0], why: new Map(), teach: [] };
  for (let y = 1; y <= n; y++) {
    simSeason(s);
    simSeason(c);
    // Step 6: each group's level-ups this season against its position coach's teach (as a share of the multiplier).
    for (const t of TEAMS) {
      const roster = baseRoster(s, t.id);
      for (const g of GROUPS) {
        const n = roster.filter((a) => GROUP_POS[g].includes(a.pos)).length;
        if (n && g !== 'ST') market.teach.push([groupXp(s, t.id, g), (s.teamState[t.id]?.lug?.[g] ?? 0) / n]);
      }
    }
    const chairsBefore = allChairs(s);
    startToPortal(s);
    carouselStats(s, chairsBefore, allChairs(s), market);
    if (y > 1) {
      promises.kept += s.offseason!.promises!.kept;
      promises.broken += s.offseason!.promises!.broken;
    }
    const user = s.config.userTeamId;
    const startersNow = new Set<string>();
    for (const t of TEAMS) for (const a of Object.values(starters(squadFor(s, t.id)))) startersNow.add(a.id);
    // The user's leaving list, as the staff would see it, then promise spam.
    s.portal!.leaving = leavingList(s, user);
    {
      const board = buildBoard(s);
      for (const t of TEAMS) {
        for (const [id, p] of Object.entries(s.teamState[t.id]?.progress ?? {})) {
          if (p.cl?.year !== s.year || !board.players.has(id)) continue;
          react.shaken++;
          if (entryOdds(s, board, id).reason === 'coach') react.reason++;
        }
        react.players += baseRoster(s, t.id).length;
      }
    }
    for (const id of Object.keys(s.portal!.leaving)) {
      if (actOnLeaving(s, id, 'promise', startersNow.has(id) ? 'start' : 'snaps')) promises.made++;
    }
    const old = s;
    while (s.phase === 'offseason') s = advanceOffseason(s);
    const portal = old.portal!;
    const count = new Map<string, number>();
    for (const e of portal.entrants) {
      const to = portal.commits[e.id];
      const cl = (old.teamState[e.from]?.progress?.[e.id] ?? (to ? old.teamState[to]?.progress?.[e.id] : undefined))?.cl;
      if (cl?.year === old.year) {
        react.left++;
        if (cl.to && to === cl.to) react.followed++;
      }
      count.set(e.from, (count.get(e.from) ?? 0) + 1);
      roles[startersNow.has(e.id) ? 'starter' : 'backup']++;
      outs[e.out as keyof typeof outs]++;
      if (e.out === 'commit') {
        const to = portal.commits[e.id];
        if (to === e.from) continue;
        const d = tierOf(to) - tierOf(e.from);
        const band = e.ovr >= 85 ? '85+' : e.ovr >= 75 ? '75-84' : e.ovr >= 65 ? '65-74' : '<65';
        const k = `${band} ${d < 0 ? 'up' : d > 0 ? 'down' : 'same'}`;
        flows.set(k, (flows.get(k) ?? 0) + 1);
        net[tierOf(to) - 1] += e.ovr;
        net[tierOf(e.from) - 1] -= e.ovr;
      } else if (e.out === 'gone') net[tierOf(e.from) - 1] -= e.ovr;
    }
    for (const t of TEAMS) {
      per.push(count.get(t.id) ?? 0);
      const r = baseRoster(s, t.id);
      maxRoster = Math.max(maxRoster, r.length);
      walkOns += (s.teamState[t.id]?.roster?.in ?? []).filter((e) => e.id.includes(`-w${old.year + 1}.`)).length;
      const byPos = new Map<string, number>();
      for (const a of r) byPos.set(a.pos, (byPos.get(a.pos) ?? 0) + 1);
      for (const [pos, min] of Object.entries(MIN_COUNT)) minPos = Math.min(minPos, (byPos.get(pos) ?? 0) - min);
    }
    c = nextSeason(c);
    const a = tierStarters(s);
    const b = tierStarters(c);
    const diff = a.map((v, i) => v - b[i]);
    gapDrift = diff[0] - diff[4];
    talent.push(`  year ${y}: portal ${fmt(a)}  control ${fmt(b)}  diff ${fmt(diff)}` + (Math.max(...diff.map(Math.abs)) > 1 ? '  <-- drift' : ''));
  }
  const avg = per.reduce((x, y) => x + y, 0) / per.length;
  const sd = Math.sqrt(per.reduce((x, y) => x + (y - avg) ** 2, 0) / per.length);
  const total = roles.starter + roles.backup;
  const tierTeams = [1, 2, 3, 4, 5].map((t) => TEAMS.filter((x) => x.profile.tier === t).length);
  const judged = promises.kept + promises.broken;
  const careers = Object.values(s.careers ?? {});
  const rostered = TEAMS.flatMap((t) => baseRoster(s, t.id));
  const withRows = rostered.filter((a) => s.careers?.[a.id]?.seasons.length).length;
  const story = new Map<string, number>();
  for (const c of careers) for (const e of c.story) story.set(e.kind, (story.get(e.kind) ?? 0) + 1);
  const perTeam = (k: string) => ((story.get(k) ?? 0) / TEAMS.length / n).toFixed(1);
  const bands = ['85+', '75-84', '65-74', '<65'];
  return [
    '', `PORTAL (docs/PORTAL.md), ${n} offseasons of one career, every side automated. Targets: about 10-15 entrants a team`,
    'with real spread, mostly backups; starter overall by tier within about 1 of a no-portal control over 5 seasons.',
    `time per offseason ${((Date.now() - t0) / n / 1000).toFixed(2)} s (with the paired seasons)`,
    `entrants per team: mean ${avg.toFixed(1)}, SD ${sd.toFixed(1)}, min ${Math.min(...per)}, max ${Math.max(...per)}` + (avg < 10 || avg > 15 ? '  <-- off target' : ''),
    `who enters: starters ${pctText(roles.starter / total)}, backups ${pctText(roles.backup / total)}`,
    `outcomes: signed ${pctText(outs.commit / total)}, back home ${pctText(outs.return / total)} (placeholder), out of FBS ${pctText(outs.gone / total)}`,
    'flows by overall band (tier up/same/down): ' + bands.map((b) => `${b} ${flows.get(`${b} up`) ?? 0}/${flows.get(`${b} same`) ?? 0}/${flows.get(`${b} down`) ?? 0}`).join('  '),
    'net talent per team-offseason by tier (overall points in less out): ' + net.map((v, i) => `T${i + 1} ${(v / tierTeams[i] / n).toFixed(0)}`).join('  '),
    `walk-ons per team-offseason ${(walkOns / TEAMS.length / n).toFixed(1)} (placeholder); largest roster ${maxRoster}` +
      (maxRoster > PORTAL.rosterMax ? '  <-- over the cap' : '') +
      `; tightest position ${minPos >= 0 ? `+${minPos}` : minPos} over its minimum` + (minPos < 0 ? '  <-- under' : ''),
    'starter overall by tier (T1..T5), after each offseason:', ...talent,
    `  T1-T5 gap change vs control after ${n}: ${gapDrift.toFixed(2)}` + (Math.abs(gapDrift) > 1 ? '  <-- gap drift' : ''),
    `coach departures: ${pctText(react.shaken / react.players)} of players had a coach leave; of them ${pctText(react.reason / Math.max(1, react.shaken))} ` +
      `would give it as the reason to go; ${pctText(react.left / Math.max(1, per.reduce((x, y) => x + y, 0)))} of entrants had a coach leave, ` +
      `${(react.followed / n).toFixed(1)} a year followed him to his new school`,
    `promises (the user's staff promises everyone on the leaving list): ${promises.made} made, ${judged} judged, ` +
      `kept ${pctText(promises.kept / Math.max(1, judged))}, broken ${pctText(promises.broken / Math.max(1, judged))}`,
    '', `CAREERS (docs/CAREERS.md), the same career after ${n} seasons. History only: nothing in the sim reads it.`,
    `${careers.length} players, ${(JSON.stringify(s.careers ?? {}).length / n / 1e6).toFixed(2)} MB of JSON per season; ` +
      `rostered players with a past season ${pctText(withRows / rostered.length)}`,
    'story lines per team-season: ' + [...story.keys()].sort().map((k) => `${k} ${perTeam(k)}`).join('  '),
    ...staffReport(s, n, market),
  ];
}

/**
 * Coaches over time (docs/COACHES.md), the portal report's career after `n` offseasons: rating change
 * by hidden arc and by age, the league's drift a year, and staff level by tier.
 */
/** What each carousel did, summed over the career's offseasons. */
interface Market {
  /** Head coach chairs and assistant chairs with someone new. */
  heads: number;
  chairs: number;
  /** Where the new assistants and head coaches came from. */
  fbs: number;
  outside: number;
  free: number;
  /** Moves up the ladder (position coach, coordinator, head coach). */
  promoted: number;
  /** FBS moves by tier: up, same, down. */
  flows: [number, number, number];
  /** Why the old coach left his chair. */
  why: Map<string, number>;
  /** Graduate assistants promoted. */
  ga: number;
  /** Each season's position groups: their coach's teach z against his tier and group, and level-ups a player. */
  teach: [number, number][];
}

function allChairs(s: SeasonState): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of TEAMS) {
    out.set(`${t.id}:HC`, headCoachFor(s, t.id).id);
    for (const [role, c] of Object.entries(staffFor(s, t.id))) out.set(`${t.id}:${role}`, c.id);
  }
  return out;
}

function carouselStats(s: SeasonState, before: Map<string, string>, after: Map<string, string>, m: Market): void {
  const level = (role: string) => (role === 'HC' ? 3 : role === 'OC' || role === 'DC' ? 2 : 1);
  for (const [chair, id] of after) {
    const was = before.get(chair)!;
    if (was === id) continue;
    if (chair.endsWith(':HC')) m.heads++;
    else m.chairs++;
    const why = s.coaches?.[was]?.gone?.why ?? 'moved';
    m.why.set(why, (m.why.get(why) ?? 0) + 1);
  }
  for (const h of s.carousel?.log ?? []) {
    if (h.from === 'outside') m.outside++;
    else if (h.from === 'free') m.free++;
    else if (h.from === 'ga') m.ga++;
    else {
      m.fbs++;
      const [ft, fr] = h.from.split(':');
      const [tt, tr] = h.chair.split(':');
      if (level(tr) > level(fr)) m.promoted++;
      const d = teamById(tt).profile.tier - teamById(ft).profile.tier;
      m.flows[d < 0 ? 0 : d === 0 ? 1 : 2]++;
    }
  }
}

function staffReport(s: SeasonState, n: number, m: Market): string[] {
  const keys = ['scout', 'teach', 'game', 'recruit'] as const;
  type K = (typeof keys)[number];
  const seated = TEAMS.flatMap((t) => Object.values(staffFor(s, t.id)).map((c) => ({ c, t })));
  const delta = (id: string, k: K) => s.coaches?.[id]?.d?.[k] ?? 0;
  const has = (c: Coach, k: K) => c.r[k] !== undefined;
  const signed = (x: number, dp = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const meanOf = (cs: Coach[], k: K) => mean(cs.filter((c) => has(c, k)).map((c) => delta(c.id, k)));
  const meanRow = (cs: Coach[]) => keys.map((k) => `${k} ${signed(meanOf(cs, k))}`).join('  ');
  const total = (c: Coach) => keys.reduce((a, k) => a + delta(c.id, k), 0) / keys.filter((k) => has(c, k)).length;
  // Growth is read on the coaches who were there from the start and still are.
  const stayed = seated.map((x) => x.c).filter((c) => !c.from && s.coaches?.[c.id]?.n === n);
  const rows = [
    '', `STAFF (docs/COACHES.md), the same career after ${n} offseasons.`,
    `Mean rating change of the ${stayed.length} assistants seated all ${n} offseasons, by hidden arc, then by age at the start:`,
  ];
  for (const arc of ARCS) {
    const cs = stayed.filter((c) => coachArc(c.id) === arc);
    const up = cs.filter((c) => total(c) >= 4).length;
    const down = cs.filter((c) => total(c) <= -4).length;
    rows.push(`  ${arc.padEnd(8)} ${String(cs.length).padStart(4)}  ${meanRow(cs)}   up 4+ ${pctText(up / Math.max(1, cs.length))}, down 4+ ${pctText(down / Math.max(1, cs.length))}`);
  }
  for (const [lo, hi] of [[30, 39], [40, 49], [50, 59], [60, 70]]) {
    const cs = stayed.filter((c) => c.age - n >= lo && c.age - n <= hi);
    rows.push(`  age ${lo}-${hi} ${String(cs.length).padStart(4)}  ${meanRow(cs)}`);
  }
  const drift = keys.map((k) => meanOf(stayed, k) / n);
  rows.push('  their drift a year: ' + keys.map((k, i) => `${k} ${signed(drift[i], 2)}`).join('  '));

  // Turnover, a year, from every chair before and after each carousel.
  const chairs = TEAMS.length * COACH_ROLES.length;
  const hires = m.fbs + m.outside + m.free + m.ga;
  const why = ['fired', 'retired', 'let go', 'moved'].map((k) => `${k} ${pctText((m.why.get(k) ?? 0) / Math.max(1, m.heads + m.chairs))}`).join(', ');
  rows.push(
    `head coach changes a year ${(m.heads / n).toFixed(1)} (real FBS about 20-25)` + (m.heads / n < 15 || m.heads / n > 30 ? '  <-- off target' : ''),
    `assistant turnover a year ${pctText(m.chairs / n / chairs)} (real about 30-40%)` + (m.chairs / n / chairs < 0.2 || m.chairs / n / chairs > 0.45 ? '  <-- off target' : ''),
    `why the chair opened: ${why}`,
    `who filled it: FBS ${pctText(m.fbs / hires)} (promotions ${pctText(m.promoted / hires)}), out of a job ${pctText(m.free / hires)}, outside FBS ${pctText(m.outside / hires)}, ` +
      `graduate assistants ${pctText(m.ga / hires)} (${(m.ga / n).toFixed(1)} a year)`,
    `FBS moves by tier: up ${m.flows[0]}, same ${m.flows[1]}, down ${m.flows[2]}` + (m.flows[0] < m.flows[2] ? '  <-- talent should flow up' : ''),
  );
  const ages = (cs: { age: number }[]) => mean(cs.map((c) => c.age));
  const heads0 = TEAMS.map((t) => buildHeadCoach(t));
  const headsNow = TEAMS.map((t) => headCoachFor(s, t.id));
  rows.push(`mean age: assistants ${ages(TEAMS.flatMap((t) => Object.values(buildStaff(t)))).toFixed(1)} -> ${ages(seated.map((x) => x.c)).toFixed(1)}, ` +
    `head coaches ${ages(heads0).toFixed(1)} -> ${ages(headsNow).toFixed(1)}`);

  // Staff level by tier: everyone seated now against the generated staffs.
  const level = (cs: Coach[]) => mean(cs.flatMap((c) => keys.filter((k) => has(c, k)).map((k) => c.r[k]!)));
  const tiers = [1, 2, 3, 4, 5];
  const start = tiers.map((tier) => level(TEAMS.filter((t) => t.profile.tier === tier).flatMap((t) => Object.values(buildStaff(t)))));
  const end = tiers.map((tier) => level(seated.filter((x) => x.t.profile.tier === tier).map((x) => x.c)));
  const gap = end[0] - end[4] - (start[0] - start[4]);
  const shift = mean(end) - mean(start);
  rows.push('staff level by tier (T1..T5), start then now: ' + start.map((v) => v.toFixed(1)).join(' ') + '  ->  ' + end.map((v) => v.toFixed(1)).join(' '),
    `  league change ${signed(shift, 2)}` + (Math.abs(shift) > 2.5 ? '  <-- drift' : '') + `, T1-T5 gap change ${signed(gap, 2)}` + (Math.abs(gap) > 1.5 ? '  <-- gap drift' : ''));

  // Head coaches' ratings at work: hiring by eval, development by develop.
  const regret = new Map<string, number[]>();
  for (const t of TEAMS) {
    const ev = headCoachFor(s, t.id).r.eval;
    const band = ev >= 70 ? '70+' : ev >= 55 ? '55-69' : '<55';
    for (const role of COACH_ROLES) {
      const c = outsideFor(s, t.id, role);
      if (!regret.has(band)) regret.set(band, []);
      regret.get(band)!.push(Math.max(...c.map((x) => x.worth)) - hire(c, ev)!.worth);
    }
  }
  const adRegret = mean(TEAMS.map((t) => {
    const c = outsideFor(s, t.id, 'HC');
    return Math.max(...c.map((x) => x.worth)) - hire(c)!.worth;
  }));
  rows.push('EVAL: worth given up against the best candidate, by the hiring head coach\'s eval: ' +
    ['<55', '55-69', '70+'].map((b) => `${b} ${mean(regret.get(b) ?? []).toFixed(2)} (${regret.get(b)?.length ?? 0})`).join('  ') +
    ` (an AD picking a head coach ${adRegret.toFixed(2)})`);
  const byDev: [number, number][] = [];
  const headRows = Object.values(s.coachCareers ?? {}).flatMap((c) => c.seasons.filter((x) => x.role === 'HC'));
  for (const h of s.history) {
    for (const row of headRows.filter((x) => x.year === h.year)) {
      const dev = (row.r as { develop?: number }).develop;
      if (dev !== undefined && h.dev?.[row.team] !== undefined) byDev.push([dev, h.dev[row.team]]);
    }
  }
  byDev.sort((a, b) => a[0] - b[0]);
  const third = Math.floor(byDev.length / 3);
  const thirds = [byDev.slice(0, third), byDev.slice(third, 2 * third), byDev.slice(2 * third)];
  rows.push('DEVELOP: level-ups a player by the head coach\'s develop (mean develop: rate), bottom/middle/top third: ' +
    thirds.map((x) => `${mean(x.map((y) => y[0])).toFixed(0)}: ${mean(x.map((y) => y[1])).toFixed(3)}`).join('  '));

  // Step 6: position coaches' teach, as the multiplier it gives his group relative to the program's.
  const tm = [...m.teach].sort((a, b) => a[0] - b[0]);
  const t3 = Math.floor(tm.length / 3);
  rows.push("TEACH: level-ups a player by his position coach's teach multiplier (mean: rate), bottom/middle/top third: " +
    [tm.slice(0, t3), tm.slice(t3, 2 * t3), tm.slice(2 * t3)].map((x) => `${mean(x.map((y) => y[0])).toFixed(3)}: ${mean(x.map((y) => y[1])).toFixed(3)}`).join('  '));
  // Step 7: coaching trees. A branch is a coach now in a head coach (3) or coordinator (1) job at another program.
  const roots = new Map<string, number>();
  const seatedNow = TEAMS.flatMap((t) => [{ id: headCoachFor(s, t.id).id, team: t.id, role: 'HC' as AnyRole }, { id: staffFor(s, t.id).OC.id, team: t.id, role: 'OC' as AnyRole }, { id: staffFor(s, t.id).DC.id, team: t.id, role: 'DC' as AnyRole }]);
  for (const x of seatedNow) for (const r of s.coaches?.[x.id]?.under ?? []) roots.set(r, (roots.get(r) ?? 0) + (TREE_SCORE[x.role] ?? 0));
  const top = [...roots].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const mine = treeOf(s, headCoachFor(s, s.config.userTeamId).id);
  rows.push(`trees: the user's ${treeScore(mine)} (${mine.length} branches); the league's biggest: ` +
    top.map(([id, v]) => `${coachName(anyCoach(id)!)} ${v}`).join(', ') + ` (a root counts every branch, his own program's included)`);
  rows.push(`${s.config.userTeamId} staff (arc hidden in the game):`);
  for (const c of Object.values(staffFor(s, s.config.userTeamId))) {
    const d = keys.filter((k) => has(c, k)).map((k) => `${k} ${c.r[k]} (${signed(delta(c.id, k), 0)})`).join(' ');
    rows.push(`  ${c.role.padEnd(7)} age ${c.age}  ${coachArc(c.id).padEnd(8)} ${c.from ? 'hired ' : '      '}${d}`);
  }
  return rows;
}

/** Share of the 22 starters on every team below 90 health right now. */
function bangedShare(s: SeasonState): number {
  let n = 0;
  let hurt = 0;
  for (const t of TEAMS) {
    const st = starters(squadFor(s, t.id));
    for (const slot of [...OFF_SLOTS, ...DEF_SLOTS]) {
      const a = st[slot];
      if (!a) continue;
      n++;
      if (healthOf(a) < 90) hurt++;
    }
  }
  return hurt / n;
}

/** A copy of a team's staff with every coach's ratings set to `n`. */
function staffAt(teamId: string, n: number): Staff {
  const st = structuredClone(buildStaff(teamById(teamId)));
  for (const c of Object.values(st)) c.r = { scout: n, ...(c.r.teach !== undefined ? { teach: n, game: n } : {}) };
  return st;
}

/**
 * Coaching staffs (docs/COACHES.md): staff level and report coverage by program tier, then each
 * emphasis in paired sims (a mid-table team against every FBS team on a neutral field, the same seeds
 * with and without it), and how hard a season of practice steers level-ups toward its ratings.
 */
function coaches(): string[] {
  const rows = ['', '== COACHES ==', '', 'STAFF BY TIER: mean scout, share of section coaches who find tier-2 / tier-3 reads'];
  const sectionRoles: CoachRole[] = ['OC', 'DC', 'WR', 'OL', 'QB', 'TRAINER', 'ST'];
  for (let tier = 1; tier <= 5; tier++) {
    const ts = TEAMS.filter((t) => t.profile.tier === tier);
    let scout = 0;
    let t2 = 0;
    let t3 = 0;
    for (const t of ts) {
      const st = buildStaff(t);
      scout += Object.values(st).reduce((a, c) => a + c.r.scout, 0) / COACH_ROLES.length;
      t2 += sectionRoles.filter((r) => st[r].r.scout >= SCOUT_TIERS[2]).length / sectionRoles.length;
      t3 += sectionRoles.filter((r) => st[r].r.scout >= SCOUT_TIERS[3]).length / sectionRoles.length;
    }
    rows.push(`  T${tier} (${String(ts.length).padStart(2)} teams)  scout ${(scout / ts.length).toFixed(1)}  tier 2 ${pctText(t2 / ts.length)}  tier 3 ${pctText(t3 / ts.length)}`);
  }

  // The median team by overall, against everyone. Whole games are too noisy to pair (a changed gain
  // reshuffles the rest of the game's draws), so each emphasis is measured per drive on the same seeds:
  // the team's offensive drives for offense and kicking emphases, the opponents' drives for defense.
  const byOvr = [...TEAMS].sort((a, b) => teamRatings(buildSquad(a)).ovr - teamRatings(buildSquad(b)).ovr);
  const team = byOvr[Math.floor(byOvr.length / 2)];
  const us = teamRatings(buildSquad(team));
  const opps = TEAMS.filter((t) => t.id !== team.id).map((t) => ({ t, r: teamRatings(buildSquad(t)), pass: SCHEME_PASS[t.profile.offense.scheme] ?? 0.5 }));
  const ourPass = SCHEME_PASS[team.profile.offense.scheme] ?? 0.5;
  const reps = Number(process.env.EMPH_DRIVES ?? 300);
  let drives = 0;
  for (let k = 0; k < 200; k++) {
    const log: DriveLog[] = [];
    simGame(buildSquad(team), buildSquad(opps[k % opps.length].t), mulberry32(k), { neutral: true, drives: log });
    drives += log.length / 2;
  }
  const perGame = drives / 200;
  rows.push('', `EMPHASES: ${team.school} (OVR ${us.ovr}) vs all ${opps.length} FBS teams, ${reps} paired drives each, x ${perGame.toFixed(1)} drives a game`);
  rows.push('  margin change per game at game-day 50 (95); for defense, against pass-heavy (55%+) and run-heavy (45%-) offenses at 50.');
  rows.push('  practice: odds of a level-up point landing on the focused ratings over a season of it, against the standard week (target 1.5-2.2; K/P run higher)');
  rows.push('  emphasis              margin @50    @95    vs pass  vs run   practice');
  const points = (off: number, def: number, seed: number, mods?: DriveMods) => simulateDrive(off, def, 25, mulberry32(seed), undefined, undefined, undefined, mods).points;
  const flags: string[] = [];
  for (const e of EMPHASES) {
    const defense = GROUP_SLOTS[e.group].unit === 'def';
    const delta = (n: number, keep: (pass: number) => boolean = () => true) => {
      const mods = emphasisMods(staffAt(team.id, n), { [e.group]: e.id });
      let sum = 0;
      let cnt = 0;
      for (const o of opps) {
        if (!keep(o.pass)) continue;
        for (let k = 0; k < reps; k++) {
          const seed = hashString(`emph:${o.t.id}:${k}`);
          const d = defense
            ? points(o.r.off, us.def, seed) - points(o.r.off, us.def, seed, driveMods(undefined, mods, o.pass))
            : points(us.off, o.r.def, seed, driveMods(mods, undefined, ourPass)) - points(us.off, o.r.def, seed);
          sum += d;
          cnt++;
        }
      }
      return cnt ? (sum / cnt) * perGame : 0;
    };
    const d50 = delta(50);
    const d95 = delta(95);
    const steer = practiceSteer(team.id, e.id);
    // The split is by the opponent's offense, so it only means something for a defensive emphasis.
    const split = defense ? `${delta(50, (p) => p >= 0.55).toFixed(2).padStart(9)} ${delta(50, (p) => p <= 0.45).toFixed(2).padStart(7)}` : `${'-'.padStart(9)} ${'-'.padStart(7)}`;
    rows.push(`  ${e.id.padEnd(20)} ${d50.toFixed(2).padStart(8)} ${d95.toFixed(2).padStart(6)} ${split}   x${steer.toFixed(2)}`);
    if (d95 > 1.5) flags.push(`${e.id}: ${d95.toFixed(2)} at game-day 95, over the 1.5 cap`);
    if (d50 < 0.1) flags.push(`${e.id}: ${d50.toFixed(2)} at game-day 50, barely felt`);
    // Kickers level about half as often, so a season of the same practice piles up toward `perfCap`.
    if (e.group !== 'ST' && (steer < 1.5 || steer > 2.2)) flags.push(`${e.id}: practice x${steer.toFixed(2)}, outside 1.5-2.2`);
  }
  rows.push(flags.length ? `  FLAGS: ${flags.join('; ')}` : '  no flags');
  return rows;
}

/**
 * A 12-week season of one emphasis for a team's players at its positions who have room to grow (full
 * time, average grades, teach 50): the odds of a level-up point landing on the focused ratings, over the
 * standard week's. Odds, not shares, because a group whose focus already takes most of its points (an
 * OL's pbk and str) can't double its share.
 */
function practiceSteer(teamId: string, emphasisId: string): number {
  const em = EMPHASES.find((x) => x.id === emphasisId)!;
  const team = teamById(teamId);
  const squad = buildSquad(team);
  const staff = staffAt(teamId, 50);
  const players = squad.athletes.filter((a) => GROUP_POS[em.group].includes(a.pos) && a.potential - overallRaw(a.r, a.pos) >= 4);
  const share = (focus: boolean) => {
    let hit = 0;
    let all = 0;
    for (let rep = 0; rep < 20; rep++) {
      const ts: TeamState = {};
      const grades = new Map(players.map((a) => [a.id, { team: team.id, snaps: 60, share: 1, sum: 0, tags: {}, hits: 0, lsum: 0, lw: 0 }]));
      for (let w = 1; w <= 12; w++) progressTeam(ts, squad, grades, w, mulberry32(rep * 100 + w), focus ? { staff, picks: { [em.group]: em.id } } : undefined);
      for (const p of Object.values(ts.progress ?? {})) {
        for (const [k, v] of Object.entries(p.d)) {
          all += v ?? 0;
          if ((em.ratings as string[]).includes(k)) hit += v ?? 0;
        }
      }
    }
    return all ? hit / all : 0;
  };
  const odds = (x: number) => x / Math.max(1e-9, 1 - x);
  const before = share(false);
  return before ? odds(share(true)) / odds(before) : 0;
}

function detail(s: SeasonState): string[] {
  const rows: string[] = [];
  const recs = records(s);
  const rec = (id: string) => recordText(recs.get(id)!);
  const name = (id: string) => teamById(id).school;

  rows.push('', `== ${s.year} SEASON (seed ${s.seed}) ==`, '', 'FINAL AP TOP 25');
  latestPoll(s, 'ap')!.ranks.forEach((r, i) => rows.push(`${String(i + 1).padStart(3)}. ${name(r.team).padEnd(22)} ${rec(r.team).padEnd(6)} ${r.points} pts (${r.firstPlace})`));

  rows.push('', 'CONFERENCE CHAMPIONS');
  for (const [c, id] of champions(s)) rows.push(`  ${c.padEnd(14)} ${name(id)} (${rec(id)})`);

  rows.push('', 'PLAYOFF');
  const b = s.bracket!;
  rows.push(`  seeds: ${b.seeds.map((id, i) => `${i + 1} ${teamById(id).abbr}`).join(', ')}`);
  for (const g of s.games.filter((x) => x.kind === 'cfp')) {
    rows.push(`  ${g.name!.padEnd(26)} ${name(g.home)} ${g.result!.home} - ${g.result!.away} ${name(g.away)}${g.result!.ot ? ' (OT)' : ''}`);
  }
  rows.push(`  CHAMPION: ${name(b.champion!)} (${rec(b.champion!)})`);

  rows.push('', 'BOWLS');
  for (const g of s.games.filter((x) => x.kind === 'bowl')) {
    rows.push(`  ${g.name!.padEnd(22)} ${name(g.home)} ${g.result!.home} - ${g.result!.away} ${name(g.away)}`);
  }

  rows.push('', 'LEADERS');
  const stats = seasonStats(s);
  for (const c of LEADER_CATEGORIES) {
    const top = leaders(s, c.key, 3, stats).map((l) => `${l.name} (${teamById(l.team).abbr}) ${l[c.key]}`).join(', ');
    rows.push(`  ${c.label.padEnd(16)} ${top}`);
  }

  rows.push('', 'AWARDS');
  for (const a of s.awards) {
    rows.push(`  ${a.name}: ${a.finalists.slice(0, 3).map((f) => `${f.name} (${teamById(f.team).abbr}, ${f.pos}) ${f.score}`).join(', ')}`);
  }
  return rows;
}

it.runIf(process.env.npm_lifecycle_event === 'season')('season report', () => {
  const n = Number(process.env.SEASONS ?? 5);
  const level = (process.env.INJURIES ?? 'normal') as InjuryLevel;
  const seasons: SeasonState[] = [];
  const banged: number[] = [];
  const conf: ConfSample = { conf: [], qbSlumps: 0 };
  const slumped = new Set<string>();
  const mor: MoraleSample = { all: [], starters: [], pairs: [], unhappy: [], worst: 0, total: 0, tiers: new Map(), roles: new Map(), why: new Map() };
  const t0 = Date.now();
  let simMs = 0;
  for (let i = 1; i <= n; i++) {
    const s = newSeason({ ...defaultConfig('georgia'), injuries: level }, i);
    const qbs = new Map<string, string>();
    while (!seasonOver(s)) {
      const w0 = Date.now();
      advanceWeek(s);
      simMs += Date.now() - w0;
      if (s.phase === 'regular') {
        banged.push(bangedShare(s));
        confSnapshot(s, conf.conf, qbs, slumped);
        moraleSnapshot(s, mor, s.week === CALENDAR.regularWeeks);
      }
    }
    seasons.push(s);
  }
  conf.qbSlumps = slumped.size;
  const rows = [
    ...aggregate(seasons), `time per season ${(simMs / n / 1000).toFixed(2)} s simulating (${((Date.now() - t0) / n / 1000).toFixed(2)} s with the report's sampling)`,
    ...progression(seasons), ...injuries(seasons, level, banged), ...confidence(seasons, conf), ...farming(level), ...morale(mor),
    ...portalReport(n), ...coaches(), ...detail(seasons[0]),
  ];
  writeFileSync(process.env.SEASON_OUT ?? 'season.txt', rows.join('\n'));
}, 600_000);
