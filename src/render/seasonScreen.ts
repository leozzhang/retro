import { CONFERENCES } from '../data/fbs/profile';
import { teamById } from '../data/teams';
import { VIEW_W } from '../engine/constants';
import { heismanRace } from '../season/awards';
import { teamLabel } from '../season/news';
import { latestPoll, rankIn } from '../season/polls';
import { phaseLabel, userGameThisWeek } from '../season/season';
import { records, recordText, standings } from '../season/standings';
import { LEADER_CATEGORIES, leaders, seasonStats } from '../season/stats';
import type { SeasonGame, SeasonState } from '../season/types';
import { drawHint } from './hud';
import { text } from './text';

/**
 * The season hub: the essentials up top (record, rank, next game), one tab per system below.
 * Deeper views (box scores, full recruiting boards) go one level further down later.
 */

export const SEASON_TABS = ['SCHEDULE', 'SCORES', 'STANDINGS', 'POLLS', 'NEWS', 'LEADERS', 'AWARDS', 'PLAYOFF'] as const;

export interface SeasonView {
  tab: number;
  /** Per-tab cycling with W/S: the week on SCORES, the conference on STANDINGS, AP/CFP on POLLS, the scroll on NEWS. */
  sub: number;
}

const TOP = 56;
const LINE = 11;
const ROWS = 24;
const DIM = '#5d6b80';
const SOFT = '#8fa0b8';
const ACCENT = '#9ad7ff';
const GOLD = '#ffd23f';

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The button to the team page (depth chart and player cards), bottom right. */
export const TEAM_BTN = { x: VIEW_W - 76, y: 328, w: 70, h: 15 };

function resultText(g: SeasonGame, team: string): string {
  const r = g.result;
  if (!r) return '';
  const us = g.home === team ? r.home : r.away;
  const them = g.home === team ? r.away : r.home;
  return `${us > them ? 'W' : 'L'} ${us}-${them}${r.ot ? ' OT' : ''}`;
}

function vsText(g: SeasonGame, team: string): string {
  if (g.neutral) return 'VS';
  return g.home === team ? 'VS' : '@';
}

/** The line under the header: this week's game, or what Space does instead. */
export function nextGameText(s: SeasonState): string {
  if (s.phase === 'complete') {
    const champ = `CHAMPION: ${teamById(s.bracket!.champion!).school.toUpperCase()}`;
    return s.config.length === 'open' ? `${champ}  -  SPACE: NEXT SEASON` : champ;
  }
  const g = userGameThisWeek(s);
  const u = s.config.userTeamId;
  if (!g) return 'NO GAME THIS WEEK  -  SPACE: ADVANCE';
  const opp = g.home === u ? g.away : g.home;
  const ap = latestPoll(s, 'ap');
  return `${g.name ? `${g.name.toUpperCase()}: ` : ''}${vsText(g, u)} ${teamLabel(opp, ap).toUpperCase()}`;
}

export function drawSeason(g: CanvasRenderingContext2D, s: SeasonState, v: SeasonView): void {
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, VIEW_W, 360);
  const u = s.config.userTeamId;
  const team = teamById(u);
  const recs = records(s);
  const r = recs.get(u)!;
  const ap = latestPoll(s, 'ap');
  const rank = rankIn(ap, u);

  g.fillStyle = team.colors.primary;
  g.fillRect(0, 0, VIEW_W, 30);
  text(g, `${rank ? `#${rank} ` : ''}${team.school.toUpperCase()} ${team.mascot.toUpperCase()}`, 10, 6, { size: 8 });
  text(g, `${recordText(r)}  (${r.cw}-${r.cl} ${team.conference.toUpperCase()})`, 10, 18, { color: '#e6e6e6' });
  text(g, `${s.year}  ${phaseLabel(s)}`, VIEW_W - 10, 6, { align: 'right', color: GOLD });
  text(g, nextGameText(s), VIEW_W - 10, 18, { align: 'right', color: '#ffffff' });

  const tw = VIEW_W / SEASON_TABS.length;
  SEASON_TABS.forEach((t, i) => {
    const on = i === v.tab;
    if (on) {
      g.fillStyle = '#1f2a3a';
      g.fillRect(i * tw, 32, tw, 14);
    }
    text(g, t, i * tw + tw / 2, 35, { align: 'center', color: on ? GOLD : SOFT, shadow: false });
  });

  switch (SEASON_TABS[v.tab]) {
    case 'SCHEDULE':
      drawSchedule(g, s);
      break;
    case 'SCORES':
      drawScores(g, s, v.sub);
      break;
    case 'STANDINGS':
      drawStandings(g, s, v.sub);
      break;
    case 'POLLS':
      drawPolls(g, s, v.sub);
      break;
    case 'NEWS':
      drawNews(g, s, v.sub);
      break;
    case 'LEADERS':
      drawLeaders(g, s);
      break;
    case 'AWARDS':
      drawAwards(g, s);
      break;
    case 'PLAYOFF':
      drawPlayoff(g, s);
      break;
  }
  g.fillStyle = team.colors.primary;
  g.fillRect(TEAM_BTN.x, TEAM_BTN.y, TEAM_BTN.w, TEAM_BTN.h);
  text(g, 'TEAM', TEAM_BTN.x + TEAM_BTN.w / 2, TEAM_BTN.y + 4, { align: 'center' });
  const play = userGameThisWeek(s) ? 'SPACE: PLAY  X: SIM' : s.phase === 'complete' ? '' : 'SPACE: ADVANCE';
  drawHint(g, `${play}   A/D: TAB  W/S: PAGE  T: TEAM  ESC: TITLE`);
}

function drawSchedule(g: CanvasRenderingContext2D, s: SeasonState): void {
  const u = s.config.userTeamId;
  const ap = latestPoll(s, 'ap');
  const games = s.games.filter((x) => x.home === u || x.away === u).sort((a, b) => a.week - b.week);
  text(g, 'WK  OPPONENT                     RESULT', 20, TOP - 4, { color: DIM, shadow: false });
  games.forEach((x, i) => {
    const y = TOP + 8 + i * LINE;
    const opp = x.home === u ? x.away : x.home;
    const cur = x.week === s.week && !x.result;
    text(g, String(x.week).padStart(2), 20, y, { color: cur ? GOLD : SOFT });
    text(g, `${vsText(x, u).padEnd(3)}${teamLabel(opp, ap).toUpperCase()}`, 52, y, { color: cur ? GOLD : '#ffffff' });
    const res = resultText(x, u);
    text(g, res, 268, y, { color: res.startsWith('W') ? '#7dff9a' : '#ff7a7a' });
    if (x.name) text(g, x.name.toUpperCase(), 380, y, { color: ACCENT });
  });
}

/** Results around the country for one week (W/S steps back through the weeks), ranked games first. */
function drawScores(g: CanvasRenderingContext2D, s: SeasonState, sub: number): void {
  const last = Math.max(1, s.games.filter((x) => x.result).reduce((m, x) => Math.max(m, x.week), 1));
  const week = mod(last - 1 - sub, last) + 1;
  const before = latestPoll(s, 'ap', week);
  const best = (x: SeasonGame) => Math.min(rankIn(before, x.home) || 99, rankIn(before, x.away) || 99);
  const games = s.games.filter((x) => x.week === week && x.result).sort((a, b) => best(a) - best(b));
  text(g, `< WEEK ${week} >`, VIEW_W / 2, TOP - 4, { align: 'center', color: ACCENT });
  const col = (x: SeasonGame, i: number) => {
    const cx = i < ROWS ? 20 : 330;
    const y = TOP + 10 + (i % ROWS) * LINE;
    const r = x.result!;
    const hw = r.home > r.away;
    const label = (id: string) => teamLabel(id, before).toUpperCase().slice(0, 15);
    text(g, `${label(x.away).padEnd(15)} ${String(r.away).padStart(2)}`, cx, y, { color: hw ? SOFT : '#ffffff' });
    text(g, `@ ${label(x.home).padEnd(15)} ${String(r.home).padStart(2)}${r.ot ? ' OT' : ''}`, cx + 152, y, { color: hw ? '#ffffff' : SOFT });
  };
  games.slice(0, ROWS).forEach(col);
}

function drawStandings(g: CanvasRenderingContext2D, s: SeasonState, sub: number): void {
  const home = CONFERENCES.indexOf(teamById(s.config.userTeamId).conference);
  const conf = CONFERENCES[mod(home + sub, CONFERENCES.length)];
  const ap = latestPoll(s, 'ap');
  text(g, `< ${conf.toUpperCase()} >`, VIEW_W / 2, TOP - 4, { align: 'center', color: ACCENT });
  text(g, '    TEAM                    CONF   ALL    PF   PA', 20, TOP + 8, { color: DIM, shadow: false });
  standings(s, conf).forEach((row, i) => {
    const y = TOP + 20 + i * LINE;
    const me = row.team === s.config.userTeamId;
    const r = row.rec;
    text(g, `${String(i + 1).padStart(2)}. ${teamLabel(row.team, ap).toUpperCase().padEnd(22)} ${`${r.cw}-${r.cl}`.padEnd(6)} ${recordText(r).padEnd(5)} ${String(r.pf).padStart(4)} ${String(r.pa).padStart(4)}`, 20, y, {
      color: me ? GOLD : '#ffffff',
    });
  });
}

function drawPolls(g: CanvasRenderingContext2D, s: SeasonState, sub: number): void {
  const cfp = latestPoll(s, 'cfp');
  const kind = cfp && mod(sub, 2) === 1 ? 'cfp' : 'ap';
  const poll = latestPoll(s, kind)!;
  const recs = records(s);
  const title = kind === 'cfp' ? 'CFP RANKINGS' : poll.week === 0 ? 'AP PRESEASON POLL' : 'AP TOP 25';
  text(g, `< ${title}  (AFTER WEEK ${poll.week}) >`, VIEW_W / 2, TOP - 4, { align: 'center', color: ACCENT });
  const prev = latestPoll(s, kind, poll.week);
  poll.ranks.forEach((e, i) => {
    const cx = i < 13 ? 20 : 330;
    const y = TOP + 12 + (i % 13) * (LINE + 6);
    const was = rankIn(prev, e.team);
    const move = !prev ? '' : !was ? 'NEW' : was === i + 1 ? '' : was > i + 1 ? `+${was - i - 1}` : `-${i + 1 - was}`;
    const me = e.team === s.config.userTeamId;
    text(g, `${String(i + 1).padStart(2)}. ${teamById(e.team).school.toUpperCase().slice(0, 17)}`, cx, y, { color: me ? GOLD : '#ffffff' });
    text(g, recordText(recs.get(e.team)!), cx + 176, y, { color: me ? GOLD : '#ffffff' });
    if (kind === 'ap') text(g, String(e.points), cx + 254, y, { align: 'right', color: DIM, shadow: false });
    text(g, move, cx + 262, y, { color: move.startsWith('-') ? '#ff7a7a' : '#7dff9a' });
  });
  if (cfp) text(g, 'W/S: AP / CFP', VIEW_W / 2, 330, { align: 'center', color: DIM, shadow: false });
}

function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > n) {
      out.push(line);
      line = `  ${w}`;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

function drawNews(g: CanvasRenderingContext2D, s: SeasonState, sub: number): void {
  const lines: { t: string; c: string }[] = [];
  const u = s.config.userTeamId;
  for (const n of [...s.news].reverse()) {
    const c = n.teams.includes(u) ? GOLD : n.kind === 'upset' ? '#ff9a5a' : n.kind === 'heisman' ? ACCENT : '#ffffff';
    wrap(`WK ${n.week}  ${n.text.toUpperCase()}`, 74).forEach((t) => lines.push({ t, c }));
  }
  const start = mod(sub, Math.max(1, Math.ceil(lines.length / ROWS))) * ROWS;
  lines.slice(start, start + ROWS).forEach((l, i) => text(g, l.t, 20, TOP + i * LINE, { color: l.c }));
}

function drawLeaders(g: CanvasRenderingContext2D, s: SeasonState): void {
  const stats = seasonStats(s);
  LEADER_CATEGORIES.forEach((c, i) => {
    const cx = i % 2 === 0 ? 20 : 330;
    const y0 = TOP + Math.floor(i / 2) * (LINE * 7);
    text(g, c.label, cx, y0, { color: ACCENT });
    leaders(s, c.key, 5, stats).forEach((l, j) => {
      text(g, `${l.name.toUpperCase().slice(0, 18).padEnd(18)} ${teamById(l.team).abbr.padEnd(5)} ${l[c.key]}`, cx, y0 + (j + 1) * LINE, {
        color: l.team === s.config.userTeamId ? GOLD : '#ffffff',
      });
    });
  });
  text(g, 'YOUR LIVE GAMES DON\'T RECORD PLAYER STATS YET', VIEW_W / 2, 330, { align: 'center', color: DIM, shadow: false });
}

function drawAwards(g: CanvasRenderingContext2D, s: SeasonState): void {
  const list = s.awards.length ? s.awards : [heismanRace(s)];
  text(g, s.awards.length ? 'SEASON AWARDS' : 'HEISMAN WATCH', VIEW_W / 2, TOP - 4, { align: 'center', color: ACCENT });
  let y = TOP + 10;
  for (const a of list) {
    text(g, a.name.toUpperCase(), 20, y, { color: GOLD });
    y += LINE;
    for (const [i, f] of a.finalists.slice(0, s.awards.length ? 3 : 10).entries()) {
      text(g, `${i + 1}. ${f.name.toUpperCase().padEnd(22)} ${f.pos.padEnd(3)} ${teamById(f.team).school.toUpperCase().padEnd(20)} ${f.score}`, 32, y, {
        color: f.team === s.config.userTeamId ? GOLD : '#ffffff',
      });
      y += LINE;
    }
    y += 4;
  }
}

function drawPlayoff(g: CanvasRenderingContext2D, s: SeasonState): void {
  const b = s.bracket;
  if (!b) {
    const cfp = latestPoll(s, 'cfp');
    text(g, 'THE FIELD IS SET AFTER CHAMPIONSHIP WEEK', VIEW_W / 2, TOP, { align: 'center', color: ACCENT });
    if (!cfp) return;
    text(g, `CURRENT CFP TOP 12 (WEEK ${cfp.week})`, VIEW_W / 2, TOP + 16, { align: 'center', color: SOFT });
    cfp.ranks.slice(0, 12).forEach((e, i) => text(g, `${String(i + 1).padStart(2)}. ${teamById(e.team).school.toUpperCase()}`, 240, TOP + 32 + i * LINE));
    return;
  }
  const cw = VIEW_W / (Math.log2(b.rounds[0].length) + 1);
  const names: Record<number, string> = { 1: 'CHAMPION', 2: 'FINAL', 4: 'SEMIS', 8: 'QUARTERS' };
  b.rounds.forEach((round, r) => {
    const cx = r * cw + 8;
    text(g, names[round.length] ?? 'FIRST ROUND', cx, TOP - 4, { color: ACCENT, shadow: false });
    const step = (ROWS * LINE) / round.length;
    round.forEach((id, i) => {
      const y = TOP + 10 + i * step + step / 2 - 4;
      if (!id) {
        text(g, r === 0 ? 'BYE' : '--', cx, y, { color: DIM, shadow: false });
        return;
      }
      const seed = b.seeds.indexOf(id) + 1;
      const won = r + 1 < b.rounds.length && b.rounds[r + 1][Math.floor(i / 2)] === id;
      text(g, `${String(seed).padStart(2)} ${teamById(id).abbr}`, cx, y, {
        color: id === s.config.userTeamId ? GOLD : won || id === b.champion ? '#ffffff' : SOFT,
      });
    });
  });
  const u = s.config.userTeamId;
  const bowl = s.games.find((x) => x.kind === 'bowl' && (x.home === u || x.away === u));
  if (bowl) text(g, `${bowl.name!.toUpperCase()}: ${vsText(bowl, u)} ${teamById(bowl.home === u ? bowl.away : bowl.home).school.toUpperCase()}  ${resultText(bowl, u)}`, VIEW_W / 2, 330, { align: 'center', color: GOLD });
}
