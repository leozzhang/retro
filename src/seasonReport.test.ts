import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildSquad, healthOf, starters } from './data/depth';
import { overallRaw, POS_ROLE, POSITIONS } from './data/positions';
import { teamById, TEAMS } from './data/teams';
import { latestPoll, rankIn } from './season/polls';
import { champions } from './season/postseason';
import { advanceWeek, defaultConfig, newSeason, seasonOver } from './season/season';
import { records, recordText, winner } from './season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from './season/stats';
import type { InjuryLevel, SeasonState } from './season/types';
import { squadFor } from './season/world';
import { DEF_SLOTS, OFF_SLOTS } from './season/grades';

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
    breaks += s.news.filter((n) => n.kind === 'progress').length;
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
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    const s = newSeason({ ...defaultConfig('georgia'), injuries: level }, i);
    while (!seasonOver(s)) {
      advanceWeek(s);
      if (s.phase === 'regular') banged.push(bangedShare(s));
    }
    seasons.push(s);
  }
  const rows = [
    ...aggregate(seasons), `time per season ${((Date.now() - t0) / n / 1000).toFixed(2)} s`, ...progression(seasons),
    ...injuries(seasons, level, banged), ...detail(seasons[0]),
  ];
  writeFileSync(process.env.SEASON_OUT ?? 'season.txt', rows.join('\n'));
}, 600_000);
