import { CALENDAR } from '../data/season/calendar';
import { TEAM_HISTORY } from '../data/fbs/history';
import type { PastSeason, ProgramHistory } from '../data/fbs/programHistory';
import { TEAMS, teamById } from '../data/teams';
import { coachTraits } from './coaching';
import { latestPoll, rankIn } from './polls';
import { records } from './standings';
import type { ChronItem, NewsItem, SeasonState, TeamYear } from './types';
import { headCoachFor } from './world';

/**
 * A program's history and story for its team page (render/programScreen.ts): the real history
 * through 2025 (data/fbs/history.ts), the dynasty's seasons (`SeasonSummary.teams`) and its big news
 * kept past each season (`SeasonState.chronicle`). History only: nothing in the sim reads any of it.
 * See docs/PROGRAM.md.
 */

export const PROGRAM = {
  /** Chronicle items kept per team per season, the lowest weight they need, and seasons kept. */
  perYear: 12,
  keepWeight: 3,
  years: 10,
};

/** The real history, unless the dynasty started fresh. */
export function baseline(state: SeasonState, id: string): ProgramHistory | undefined {
  return state.config.history === 'fresh' ? undefined : TEAM_HISTORY[id];
}

// ------------------------------------------------------------ a season's rows

const coachLabel = (state: SeasonState, id: string): string => {
  if (id === state.config.userTeamId) return 'YOU';
  const c = headCoachFor(state, id);
  return `${c.first[0]}. ${c.last}`.toUpperCase();
};

/** Every team's season so far, as the program pages keep it (recorded when the season completes). */
export function seasonRows(state: SeasonState): Record<string, TeamYear> {
  const rec = records(state);
  const ap = latestPoll(state, 'ap');
  const out: Record<string, TeamYear> = {};
  for (const t of TEAMS) {
    const r = rec.get(t.id)!;
    const row: TeamYear = { conf: t.conference, w: r.w, l: r.l, cw: r.cw, cl: r.cl, hc: coachLabel(state, t.id) };
    const rank = rankIn(ap, t.id);
    if (rank) row.ap = rank;
    out[t.id] = row;
  }
  const b = state.bracket;
  b?.seeds.forEach((id, i) => id && out[id] && (out[id].seed = i + 1));
  if (b?.champion && out[b.champion]) out[b.champion].nc = 1;
  for (const g of state.games) {
    if (!g.result) continue;
    const won = g.result.home > g.result.away ? g.home : g.away;
    for (const id of [g.home, g.away]) {
      const row = out[id];
      if (!row) continue;
      if (g.kind === 'champ') {
        row.cg = 1;
        if (id === won) row.cc = 1;
      } else if (g.kind === 'cfp') row.rd = Math.max(row.rd ?? 0, g.round ?? 0);
      else if (g.kind === 'bowl') {
        row.bowl = g.name;
        if (id === won) row.bw = 1;
      }
    }
  }
  return out;
}

const ROUND = ['CFP FIRST ROUND', 'CFP QF', 'CFP SEMI', 'NATIONAL TITLE'];

/** The postseason in a word or three, like the research's: "W SEC TITLE, L CFP QF". */
export function postText(y: TeamYear): string | undefined {
  const parts: string[] = [];
  // A national title says it all (and the line stays short).
  if (y.cc && !y.nc) parts.push(`W ${y.conf.toUpperCase()} TITLE`);
  if (y.seed) {
    const rd = y.rd ?? 0;
    parts.push(y.nc ? 'W NATIONAL TITLE' : `L ${ROUND[Math.min(rd, 3)]}`);
  } else if (y.bowl) parts.push(`${y.bw ? 'W' : 'L'} ${y.bowl.toUpperCase()}`);
  return parts.length ? parts.join(', ') : undefined;
}

export interface SeasonRow extends PastSeason {
  hc?: string;
  /** Played in the dynasty (not the real history). */
  dyn?: boolean;
  /** This season, still being played. */
  live?: boolean;
  nc?: boolean;
  cc?: boolean;
  playoff?: boolean;
}

/** Every season on record, oldest first: the real ones, the dynasty's, and this one while it's played. */
export function pastSeasons(state: SeasonState, id: string, live = true): SeasonRow[] {
  const out: SeasonRow[] = (baseline(state, id)?.recent ?? []).map((r) => ({
    ...r, nc: /W NATIONAL TITLE/.test(r.post ?? ''), cc: /W [A-Z0-9 -]+ TITLE/.test((r.post ?? '').replace(/W NATIONAL TITLE/, '')), playoff: /CFP|NATIONAL TITLE/.test(r.post ?? ''),
  }));
  for (const h of state.history) {
    const y = h.teams?.[id];
    if (!y) continue;
    out.push({ year: h.year, conf: y.conf, w: y.w, l: y.l, cw: y.cw, cl: y.cl, ap: y.ap, post: postText(y), hc: y.hc, dyn: true, nc: !!y.nc, cc: !!y.cc, playoff: !!y.seed });
  }
  if (live && !state.history.some((h) => h.year === state.year) && state.games.some((g) => g.result)) {
    const y = seasonRows(state)[id];
    out.push({ year: state.year, conf: y.conf, w: y.w, l: y.l, cw: y.cw, cl: y.cl, ap: y.ap, post: postText(y), hc: y.hc, dyn: true, live: true, cc: !!y.cc });
  }
  return out;
}

// ------------------------------------------------------------ the trophy case

export interface Trophies {
  nat: number[];
  fcs: number[];
  conf: number;
  lastConf: number | null;
  playoffs: number[];
  bowls: { apps: number; w: number; l: number; t: number; last: number | null };
  heisman: { name: string; year: number }[];
  allTime: { w: number; l: number; t: number };
  /** First-round NFL picks in the dynasty's drafts. */
  firstRound: { name: string; pos: string; year: number; pick: number }[];
}

/** The real history plus the dynasty's finished seasons. */
export function trophies(state: SeasonState, id: string): Trophies {
  const b = baseline(state, id);
  const t: Trophies = {
    nat: [...(b?.natTitles ?? [])], fcs: [...(b?.fcsTitles ?? [])], conf: b?.confTitles ?? 0, lastConf: b?.lastConf ?? null,
    playoffs: [...(b?.playoffs ?? [])], bowls: { ...(b?.bowls ?? { apps: 0, w: 0, l: 0, t: 0, last: null }) },
    heisman: [...(b?.heisman ?? [])], allTime: { ...(b?.allTime ?? { w: 0, l: 0, t: 0 }) }, firstRound: [],
  };
  for (const h of state.history) {
    const y = h.teams?.[id];
    if (y) {
      if (y.nc) t.nat.push(h.year);
      if (y.cc) {
        t.conf++;
        t.lastConf = h.year;
      }
      if (y.seed) t.playoffs.push(h.year);
      // Bowls the way the record books count them: every playoff game is one.
      const games = (y.bowl ? 1 : 0) + (y.seed ? (y.rd ?? 0) + 1 - (y.seed <= 4 && (y.rd ?? 0) > 0 ? 1 : 0) : 0);
      if (games) {
        const lost = y.nc || (y.bowl && y.bw) ? 0 : 1;
        t.bowls.apps += games;
        t.bowls.w += games - lost;
        t.bowls.l += lost;
        t.bowls.last = h.year;
      }
      t.allTime.w += y.w;
      t.allTime.l += y.l;
    } else if (h.champion === id) t.nat.push(h.year);
    if (h.heisman && h.heismanTeam === id) t.heisman.push({ name: h.heisman, year: h.year });
    for (const p of h.draft ?? []) if (p.team === id && p.round === 1) t.firstRound.push({ name: p.name, pos: p.pos, year: h.year + 1, pick: p.pick });
  }
  return t;
}

// ------------------------------------------------------------ the head coach

export interface Tenure {
  name: string;
  /** This is his nth season in charge. */
  year: number;
  /** The user's program: the user is its head coach. */
  user: boolean;
  /** His record here in the seasons the game has seen (the dynasty's, this one's included). */
  w: number;
  l: number;
}

export function coachTenure(state: SeasonState, id: string): Tenure {
  const done = state.history.some((h) => h.year === state.year);
  const live = done ? 0 : 1;
  const rec = records(state).get(id)!;
  if (id === state.config.userTeamId) {
    // The user took over when the dynasty began.
    const w = state.history.reduce((n, h) => n + (h.teams?.[id]?.w ?? 0), 0);
    const l = state.history.reduce((n, h) => n + (h.teams?.[id]?.l ?? 0), 0);
    const year = state.coach?.teamId === id ? state.coach.seasons + live : state.history.length + live;
    return { name: 'YOU', year: Math.max(1, year), user: true, w: w + (live ? rec.w : 0), l: l + (live ? rec.l : 0) };
  }
  const c = headCoachFor(state, id);
  const rows = state.coachCareers?.[c.id]?.seasons ?? [];
  // His unbroken run at this school, newest back.
  let here = 0;
  let w = 0;
  let l = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].team !== id || rows[i].role !== 'HC') break;
    here++;
    w += rows[i].w;
    l += rows[i].l;
  }
  // The generated head coach was already there when the game began.
  let before = 0;
  if (c.id === `${id}-hc` && here === rows.length) {
    const b = baseline(state, id);
    before = b ? Math.max(0, CALENDAR.year - b.coachSince) : coachTraits(c.id).tenure;
  }
  return { name: `${c.first[0]}. ${c.last}`.toUpperCase(), year: before + here + live, user: false, w: w + (live ? rec.w : 0), l: l + (live ? rec.l : 0) };
}

export const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;

// ------------------------------------------------------------ the news that lasts

/**
 * How much a news item matters to a program's fans, 0-10; most weekly news is 0-2 and fades with
 * the week. Kept in the chronicle at `PROGRAM.keepWeight` and up.
 */
export function newsWeight(n: Pick<NewsItem, 'kind' | 'text' | 'teams'>, team: string): number {
  const t = n.text;
  if (!n.teams.includes(team)) return 0;
  switch (n.kind) {
    case 'postseason':
      if (/national championship/.test(t)) return 10;
      return /PLAYOFF FIELD/.test(t) ? 6 : 2;
    case 'heisman':
      return /wins the Heisman/.test(t) ? 9 : n.teams[0] === team ? 2 : 1;
    case 'carousel':
      if (/^(FIRED|HIRED|RETIRED)/.test(t) || /head coach/i.test(t)) return 8;
      return /coordinator/.test(t) ? 3 : 1;
    case 'coach':
      return 6;
    case 'draft':
      if (/first overall/.test(t)) return 8;
      return /round 1,/.test(t) ? 5 : /DEPARTURES/.test(t) ? 2 : 1;
    case 'upset':
      return n.teams[0] === team ? 4 : 3;
    case 'result':
      return /Championship|Bowl|CFP/.test(t) ? 6 : /#\d+ .* beats #\d+/.test(t) ? 2 : 1;
    case 'poll':
      return /No\. 1/.test(t) ? 5 : 1;
    case 'injury':
      return /out for season/.test(t) ? 3 : 1;
    case 'progress':
      return /BREAKOUT/.test(t) ? 3 : 1;
    case 'portal': {
      const ovr = Number(/, (\d+)\)/.exec(t)?.[1] ?? 0);
      return ovr >= 88 ? 4 : ovr >= 82 ? 2 : 1;
    }
    case 'recruiting':
      if (/No\. ([1-9]|1\d|2[0-5]) /.test(t) && /COMMIT|SIGN/.test(t)) return 4;
      return /class/i.test(t) ? 3 : 1;
    case 'performance':
      return 2;
    default:
      return 1;
  }
}

/**
 * The season is over and the next begins: keep each team's big news from it. The offseason's news
 * that `advanceOffseason` copies forward is kept once, under the season it followed.
 */
export function archiveChronicle(prev: SeasonState, next: SeasonState): void {
  const out: Record<string, ChronItem[]> = {};
  for (const [id, items] of Object.entries(prev.chronicle ?? {})) {
    const kept = items.filter((x) => x.year > prev.year - PROGRAM.years);
    if (kept.length) out[id] = kept;
  }
  const by = new Map<string, ChronItem[]>();
  for (const n of prev.news) {
    for (const id of new Set(n.teams)) {
      const w = newsWeight(n, id);
      if (w < PROGRAM.keepWeight) continue;
      let x = by.get(id);
      if (!x) by.set(id, (x = []));
      x.push({ year: prev.year, week: n.week, kind: n.kind, text: n.text, w });
    }
  }
  for (const [id, items] of by) {
    const have = new Set((out[id] ?? []).map((x) => x.text));
    const fresh = items.filter((x) => !have.has(x.text) && have.add(x.text));
    // The heaviest, then back in the order they happened.
    const keep = new Set(fresh.slice().sort((a, b) => b.w - a.w).slice(0, PROGRAM.perYear));
    const kept = fresh.filter((x) => keep.has(x));
    if (kept.length) out[id] = [...(out[id] ?? []), ...kept];
  }
  next.chronicle = out;
}

export interface Headline {
  year: number;
  week: number;
  text: string;
  w: number;
  kind: NewsItem['kind'];
  teams: string[];
}

/**
 * A team's news this season and from the chronicle, newest first. `ranked` sorts by salience, faded
 * by age: this week's upset outranks last year's.
 */
export function teamNews(state: SeasonState, id: string, ranked = false): Headline[] {
  const now: Headline[] = state.news
    .filter((n) => n.teams.includes(id))
    .map((n) => ({ year: state.year, week: n.week, text: n.text, w: newsWeight(n, id), kind: n.kind, teams: n.teams }));
  const seen = new Set(now.map((h) => h.text));
  const old: Headline[] = (state.chronicle?.[id] ?? [])
    .filter((c) => !seen.has(c.text))
    .map((c) => ({ year: c.year, week: c.week, text: c.text, w: c.w, kind: c.kind, teams: [id] }));
  const all = [...now.reverse(), ...old.reverse()];
  // The newest first: this season's in reverse order, then each past season's latest first.
  all.sort((a, b) => b.year - a.year || b.week - a.week);
  if (!ranked) return all;
  const age = (h: Headline) => (state.year - h.year) * 1.5 + Math.max(0, state.week - h.week) * 0.08;
  return all.filter((h) => h.w >= 3).sort((a, b) => b.w - age(b) - (a.w - age(a)));
}

/** A team's big headlines, best first, at most `n`. */
export const headlines = (state: SeasonState, id: string, n: number): Headline[] => teamNews(state, id, true).slice(0, n);

/** "UGA" or "Georgia" for links: a team's school name. */
export const schoolOf = (id: string): string => teamById(id).school;
