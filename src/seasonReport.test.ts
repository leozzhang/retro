import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { teamById, TEAMS } from './data/teams';
import { latestPoll, rankIn } from './season/polls';
import { champions } from './season/postseason';
import { defaultConfig, newSeason, simSeason } from './season/season';
import { records, recordText, winner } from './season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from './season/stats';
import type { SeasonState } from './season/types';

/** `npm run season`: simulate whole seasons headlessly and write season.txt. SEASONS=n sets the count. */

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
  const seasons: SeasonState[] = [];
  const t0 = Date.now();
  for (let i = 1; i <= n; i++) {
    const s = newSeason(defaultConfig('georgia'), i);
    simSeason(s);
    seasons.push(s);
  }
  const rows = [...aggregate(seasons), `time per season ${((Date.now() - t0) / n / 1000).toFixed(2)} s`, ...detail(seasons[0])];
  writeFileSync(process.env.SEASON_OUT ?? 'season.txt', rows.join('\n'));
}, 600_000);
