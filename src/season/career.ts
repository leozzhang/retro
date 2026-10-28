import { classLabel, DEV_LABEL, type Athlete } from '../data/athletes';
import { athleteName, generatedAthlete } from '../data/depth';
import { overall } from '../data/positions';
import type { RatingKey } from '../data/ratings';
import { teamById, TEAMS } from '../data/teams';
import type { GameGrade } from './grades';
import { outText } from './injuries';
import { applyDelta, deltaText } from './progression';
import { seasonStats, STAT_KEYS, type StatKey } from './stats';
import type { Career, CareerRole, CareerSeason, PlayerLine, Progress, RatingDelta, SeasonState, StoryEvent } from './types';
import { baseRoster } from './world';

/**
 * Careers: every player's history across seasons and teams, kept apart from what drives the sim.
 * Gameplay state (`Progress`, morale, health) is what a player is; a career is what he did: a row per
 * finished season and a story of the moments that made it. The career store reads gameplay state at
 * the end of each week (`storyWeek`) and when a season ends (`archiveSeason`); nothing in the sim
 * reads it back. It draws no randomness. See docs/CAREERS.md.
 */

/**
 * - `starter`: share of the team's games he started to count as the season's starter.
 * - `rotation`: share of the team's games he played in (with no starts) to count as rotation.
 * - `injuryWeeks`: the shortest injury that makes his story (season-ending ones always do).
 */
export const CAREER = { starter: 0.5, rotation: 0.5, injuryWeeks: 2 };

export function careerOf(state: SeasonState, id: string): Career | undefined {
  return state.careers?.[id];
}

function ensure(state: SeasonState, id: string): Career {
  return ((state.careers ??= {})[id] ??= { seasons: [], story: [] });
}

/** Add a line to a player's story. Without `week` it's this year's offseason. */
export function tell(state: SeasonState, id: string, e: Omit<StoryEvent, 'year'> & { year?: number }): void {
  ensure(state, id).story.push({ year: state.year, ...e });
}

const abbr = (team: string) => teamById(team).abbr;
const nameOf = (id: string) => {
  const a = generatedAthlete(id);
  return a ? athleteName(a) : 'a teammate';
};

const SPARK_WHY: Record<string, string> = { injured: 'the injured', slumping: 'a slumping', outplayed: 'an outplayed' };

/**
 * The end of a week, after every other step: games played and starts, then the story's week-to-week
 * lines from what the other steps logged (sparks, benchings, breakouts, breakthroughs, injuries) and
 * from who started (a first start, or winning the job).
 */
export function storyWeek(state: SeasonState, week: number, grades: Iterable<Map<string, GameGrade>>): void {
  const playedTeams = new Set<string>();
  const snapped = new Set<string>();
  for (const game of grades) {
    for (const [id, g] of game) {
      if (!g.snaps) continue;
      playedTeams.add(g.team);
      snapped.add(id);
      const c = ensure(state, id);
      (c.now ??= { gp: 0, gs: 0 }).gp++;
    }
  }
  for (const team of playedTeams) {
    const ts = state.teamState[team];
    const gameNo = ts?.gp ?? 0;
    for (const id of new Set(Object.values(ts?.st ?? {}))) {
      if (!snapped.has(id)) continue;
      const c = ensure(state, id);
      const now = (c.now ??= { gp: 0, gs: 0 });
      if (now.gs === 0) startLine(state, c, id, team, week, gameNo);
      now.gs++;
    }
    for (const [id, p] of Object.entries(ts?.progress ?? {})) {
      if (p.up?.week === week && p.up.big && !state.confLog?.some((e) => e.week === week && e.id === id && e.kind === 'breakout')) {
        tell(state, id, { week, team, kind: 'breakthrough', text: `Breakthrough: ${deltaText(p.up.d)}` });
      }
    }
  }
  for (const e of state.confLog ?? []) {
    if (e.week !== week) continue;
    if (e.kind === 'spark') {
      tell(state, e.id, { week, team: e.team, kind: 'spark', text: `Next man up: starts for ${SPARK_WHY[e.reason ?? 'injured']} ${e.rep ? nameOf(e.rep) : 'starter'}` });
    } else if (e.kind === 'bench') {
      tell(state, e.id, { week, team: e.team, kind: 'bench', text: 'Benched while playing well' });
    } else {
      const p = state.teamState[e.team]?.progress?.[e.id];
      const d = p?.up?.week === week ? ` ${deltaText(p.up.d)}` : '';
      tell(state, e.id, { week, team: e.team, kind: 'breakout', text: `Breakout: now a ${DEV_LABEL[p?.dev ?? 'impact'].toLowerCase()} talent${d}` });
    }
  }
  for (const e of state.injuryLog ?? []) {
    if (e.week !== week || (!e.season && e.weeks < CAREER.injuryWeeks)) continue;
    tell(state, e.id, { week, team: e.team, kind: 'injury', text: `${e.type}, ${outText(e).toLowerCase()}` });
  }
}

/** His first start of the season: his first ever, the opener's job, or a job won from last year. */
function startLine(state: SeasonState, c: Career, id: string, team: string, week: number, gameNo: number): void {
  const pos = generatedAthlete(id)?.pos ?? '';
  const prior = c.seasons.filter((r) => r.year < state.year);
  const started = prior.some((r) => r.gs);
  const last = prior[prior.length - 1];
  let text = '';
  if (!prior.length) text = gameNo <= 1 ? `Opens ${state.year} as the starting ${pos}` : 'First start';
  else if (!started) text = gameNo <= 1 ? `Wins the starting ${pos} job` : 'First career start';
  else if (gameNo <= 1 && last?.role !== 'starter') text = `Wins the starting ${pos} job`;
  if (text) tell(state, id, { week, team, kind: 'start', text });
}

/** His rating gains and level-ups before `year`: the sum of his earlier seasons' rows. */
export function priorGains(c: Career | undefined, year: number): { d: RatingDelta; lvl: number } {
  const d: RatingDelta = {};
  let lvl = 0;
  for (const r of c?.seasons ?? []) {
    if (r.year >= year) continue;
    lvl += r.lvl ?? 0;
    for (const [k, v] of Object.entries(r.d ?? {}) as [RatingKey, number][]) d[k] = (d[k] ?? 0) + v;
  }
  return { d, lvl };
}

/** His gain at a rating this season: his all-time change less what earlier seasons gave. */
export function seasonGain(state: SeasonState, id: string, p: Progress | undefined, k: RatingKey): number {
  return (p?.d[k] ?? 0) - (priorGains(careerOf(state, id), state.year).d[k] ?? 0);
}

/** One player's stat totals this season from his team's box scores. */
function playerStats(state: SeasonState, id: string, team: string): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const g of state.games) {
    if (g.home !== team && g.away !== team) continue;
    const l = g.result?.box.players.find((x) => x.id === id);
    if (l) addStats(out, l);
  }
  return out;
}

function addStats(out: Partial<Record<StatKey, number>>, l: Partial<Record<StatKey, number>>): void {
  for (const k of STAT_KEYS) if (l[k]) out[k] = (out[k] ?? 0) + l[k]!;
}

/** His season as a row: from his progress, his counts and his stats. */
function seasonRow(state: SeasonState, a: Athlete, team: string, st: Partial<Record<StatKey, number>>): CareerSeason {
  const c = careerOf(state, a.id);
  const ts = state.teamState[team];
  const p = ts?.progress?.[a.id];
  const prior = priorGains(c, state.year);
  const base = generatedAthlete(a.id) ?? a;
  const d: RatingDelta = {};
  for (const [k, v] of Object.entries(p?.d ?? {}) as [RatingKey, number][]) {
    const x = v - (prior.d[k] ?? 0);
    if (x) d[k] = x;
  }
  const gp = c?.now?.gp ?? 0;
  const gs = c?.now?.gs ?? 0;
  const games = Math.max(1, ts?.gp ?? 0);
  const role: CareerRole = gs >= games * CAREER.starter ? 'starter' : gs || gp >= games * CAREER.rotation ? 'rotation' : gp ? 'reserve' : 'dnp';
  const row: CareerSeason = {
    year: state.year, team, cls: classLabel(base), role,
    ovr0: overall(applyDelta(base.r, prior.d), base.pos), ovr1: overall(applyDelta(base.r, p?.d ?? {}), base.pos),
  };
  if (gp) row.gp = gp;
  if (gs) row.gs = gs;
  if (Object.keys(d).length) row.d = d;
  const lvl = (p?.lvl ?? 0) - prior.lvl;
  if (lvl) row.lvl = lvl;
  if (Object.keys(st).length) row.st = st;
  return row;
}

/** The season so far as a row, before it's archived (built on demand, never stored). */
export function liveSeason(state: SeasonState, a: Athlete, team: string): CareerSeason | undefined {
  if (careerOf(state, a.id)?.seasons.some((r) => r.year === state.year)) return undefined;
  return seasonRow(state, a, team, playerStats(state, a.id, team));
}

/** Every season of his: the archived rows, then this one while it's live. */
export function careerRows(state: SeasonState, a: Athlete, team: string): CareerSeason[] {
  const live = liveSeason(state, a, team);
  return [...(careerOf(state, a.id)?.seasons ?? []), ...(live ? [live] : [])];
}

/**
 * The season is over: every player on every roster gets his row, and the award winners and finalists
 * their story lines. Once a season; this season's counts clear.
 */
export function archiveSeason(state: SeasonState): void {
  const stats = seasonStats(state);
  for (const t of TEAMS) {
    for (const a of baseRoster(state, t.id)) {
      const c = ensure(state, a.id);
      if (c.seasons.some((r) => r.year === state.year)) continue;
      const st: Partial<Record<StatKey, number>> = {};
      const l: PlayerLine | undefined = stats.get(a.id);
      if (l) addStats(st, l);
      c.seasons.push(seasonRow(state, a, t.id, st));
      delete c.now;
    }
  }
  for (const aw of state.awards) {
    aw.finalists.slice(0, 3).forEach((f, i) => {
      tell(state, f.id, { team: f.team, kind: 'award', text: i === 0 ? `Wins the ${aw.name}` : `${aw.name} finalist` });
    });
  }
}

export interface CareerTotals {
  seasons: number;
  gp: number;
  gs: number;
  st: Partial<Record<StatKey, number>>;
}

export function careerTotals(rows: CareerSeason[]): CareerTotals {
  const st: Partial<Record<StatKey, number>> = {};
  let gp = 0;
  let gs = 0;
  for (const r of rows) {
    gp += r.gp ?? 0;
    gs += r.gs ?? 0;
    addStats(st, r.st ?? {});
  }
  return { seasons: rows.length, gp, gs, st };
}

/** His all-time rating gains, every season's summed. */
export function careerGains(rows: CareerSeason[]): RatingDelta {
  const d: RatingDelta = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.d ?? {}) as [RatingKey, number][]) d[k] = (d[k] ?? 0) + v;
  return d;
}

/**
 * His career in a few words, the most telling first: a transfer, a breakout (from the bench if he
 * didn't start before it), a next man up who kept the job, years as a starter, or waiting his turn.
 */
export function headline(c: Career | undefined, rows: CareerSeason[]): string[] {
  const out: string[] = [];
  const story = c?.story ?? [];
  const tr = [...story].reverse().find((e) => e.kind === 'transfer');
  if (tr?.from) out.push(`Transfer from ${abbr(tr.from)}`);
  const bo = story.find((e) => e.kind === 'breakout');
  const starts = rows.filter((r) => r.role === 'starter').length;
  if (bo) {
    // From the bench: no season as the starter before it, and he didn't open that season starting.
    const opened = story.some((e) => e.kind === 'start' && e.year === bo.year && e.text.startsWith('Opens'));
    const benched = !rows.some((r) => r.year < bo.year && r.role === 'starter') && !opened;
    out.push(benched ? 'Bench to breakout' : 'Breakout star');
  } else if (story.some((e) => e.kind === 'spark') && rows[rows.length - 1]?.role === 'starter') out.push('Next man up');
  if (starts >= 2) out.push(`${starts}-year starter`);
  else if (starts === 1 && out.length === 0) out.push('Starter');
  if (!out.length) out.push(rows.every((r) => r.role === 'dnp' || r.role === 'reserve') ? 'Waiting his turn' : 'Rotation player');
  return out.slice(0, 2);
}
