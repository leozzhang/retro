import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSquad, healthOf, healthy, HEALTH, positionOrder, reorderPosition, starters } from './data/depth';
import { overallRaw, POS_ROLE, POSITIONS } from './data/positions';
import { CALENDAR } from './data/season/calendar';
import { teamById, TEAMS } from './data/teams';
import { latestPoll, rankIn } from './season/polls';
import { champions } from './season/postseason';
import { advanceWeek, defaultConfig, newSeason, seasonOver } from './season/season';
import { records, recordText, winner } from './season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from './season/stats';
import type { InjuryLevel, SeasonState } from './season/types';
import { squadFor } from './season/world';
import { DEF_SLOTS, OFF_SLOTS } from './season/grades';
import { BREAKOUT, CONFIDENCE, confOf } from './season/confidence';
import { setUserDepth } from './season/staff';
import { actualRole, moraleContext, moraleOf, moraleReason, type MoraleDriver } from './season/morale';

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
    ...progression(seasons), ...injuries(seasons, level, banged), ...confidence(seasons, conf), ...farming(level), ...morale(mor), ...detail(seasons[0]),
  ];
  writeFileSync(process.env.SEASON_OUT ?? 'season.txt', rows.join('\n'));
}, 600_000);
