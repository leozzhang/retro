import { archetypeLabel, type Athlete } from '../data/athletes';
import { athleteName, generatedAthlete } from '../data/depth';
import { overall, overallBreakdown, type Position } from '../data/positions';
import { prospect } from '../data/recruits';
import { RATING_INFO } from '../data/ratings';
import { joinYear, parseWalkOn } from '../data/rosterGen';
import { careerGains, careerOf, careerRows, careerTotals, jerseyOf } from './career';
import { applyDelta } from './progression';
import type { StatKey } from './stats';
import type { AlumPlaque, AlumSeason, CareerSeason, SeasonState, StoryEvent } from './types';
import { baseRoster } from './world';

/**
 * The Lettermen: every player the user has coached, past and present, as a plaque (docs/ALUMNI.md).
 * Display only, like careers: nothing in the sim reads it and it draws no randomness. A plaque is
 * rebuilt from the career store (season/career.ts) and the generated athlete, and frozen once he's
 * gone, so it outlives roster changes and any later trimming of careers. Only seasons with the
 * user's team count; nothing from before the dynasty exists.
 */

/**
 * - `score`: what a legacy is worth. A season as the starter or in the rotation, each start, each
 *   point of peak overall over `peakFrom`, an award won or a finalist finish, a draft round.
 * - `tier`: the score each frame needs, and the honors that earn one outright (an award, a top-10 pick
 *   for LEGEND; a pick in the first three rounds for STAR).
 * - `lines`: how many story lines a plaque keeps.
 */
export const ALUMNI = {
  score: { starter: 10, rotation: 3, start: 0.6, peakFrom: 75, peak: 1.2, award: 45, finalist: 14, draft: [0, 40, 28, 20, 14, 12, 10, 8] },
  tier: { starter: 30, star: 62, legend: 115, topPick: 10 },
  lines: 6,
};

export type LegacyTier = 'roll' | 'letterman' | 'starter' | 'star' | 'legend' | 'hof';

export const TIER_LABEL: Record<LegacyTier, string> = {
  roll: 'ON THE ROLL', letterman: 'LETTERMAN', starter: 'STARTER', star: 'STAR', legend: 'LEGEND', hof: 'HALL OF FAME',
};

const STORY_RANK: Partial<Record<StoryEvent['kind'], number>> = {
  award: 9, breakout: 8, spark: 6, transfer: 5, start: 4, breakthrough: 3, injury: 2, redshirt: 1,
};

// ------------------------------------------------------------ building

/** His seasons with the user's team as plaque rows: the archived ones, plus this one while it's live. */
function rowsWith(rows: CareerSeason[], team: string, num: number, prev?: AlumPlaque): AlumSeason[] {
  return rows.filter((r) => r.team === team).map((r) => {
    const out: AlumSeason = { year: r.year, cls: r.cls, role: r.role, ovr: r.ovr1 };
    if (r.gp) out.gp = r.gp;
    if (r.gs) out.gs = r.gs;
    if (r.st && Object.keys(r.st).length) out.st = r.st;
    const n = r.num ?? prev?.rows.find((x) => x.year === r.year)?.num ?? num;
    if (n !== num) out.num = n;
    return out;
  });
}

/** His best ratings at his position, as words: "ELITE SPEED". */
function callingCard(a: Athlete, rows: CareerSeason[]): string[] {
  const r = applyDelta(a.r, careerGains(rows));
  return overallBreakdown(r, a.pos).filter((p) => p.share >= 0.08).sort((x, y) => y.value - x.value).slice(0, 2)
    .filter((p) => p.value >= 72).map((p) => `${p.value >= 90 ? 'ELITE' : p.value >= 82 ? 'GREAT' : 'SOLID'} ${RATING_INFO[p.key].label.toUpperCase()}`);
}

/** How he came to the program. */
function originOf(state: SeasonState, id: string, team: string): Pick<AlumPlaque, 'origin' | 'from' | 'rank'> {
  const tr = careerOf(state, id)?.story.find((e) => e.kind === 'transfer' && e.team === team);
  if (tr) return { origin: 'transfer', ...(tr.from ? { from: tr.from } : {}) };
  if (parseWalkOn(id)) return { origin: 'walkon' };
  if (id.startsWith(`${team}-`) && /^\d+$/.test(id.slice(team.length + 1))) return { origin: 'inherited' };
  const rank = prospect(id)?.rank;
  return { origin: 'signed', ...(rank ? { rank } : {}) };
}

/** How he left, read off his story and the draft: undefined while he's still on the roster. */
function exitOf(state: SeasonState, id: string, team: string, after: number): AlumPlaque['exit'] {
  const story = (careerOf(state, id)?.story ?? []).filter((e) => e.year >= after);
  const pick = state.history.flatMap((h) => (h.draft ?? []).map((p) => ({ ...p, year: h.year }))).find((p) => p.id === id && p.team === team);
  const draft = pick ? { round: pick.round, pick: pick.pick, city: pick.city } : undefined;
  const tr = story.find((e) => e.kind === 'transfer' && e.from === team);
  if (tr) return { kind: 'transfer', year: tr.year, to: tr.team };
  const gone = story.find((e) => e.team === team && (e.kind === 'graduated' || e.kind === 'declared' || e.kind === 'left'));
  if (!gone) return { kind: 'left', year: after, ...(draft ? { draft } : {}) };
  const kind = gone.kind === 'graduated' ? 'grad' : gone.kind === 'declared' ? 'declare' : 'left';
  return { kind, year: gone.year, ...(draft ? { draft } : {}) };
}

/** His story lines with the user's team, the most telling kept, oldest first. */
function curate(state: SeasonState, id: string, team: string): AlumPlaque['lines'] {
  const story = (careerOf(state, id)?.story ?? []).filter((e) => e.team === team && STORY_RANK[e.kind]);
  // One first-start line is enough; a season-ending injury beats a short one.
  const seen = new Set<string>();
  const picked = story.map((e, i) => ({ e, i, rank: STORY_RANK[e.kind]! + (e.kind === 'injury' && /season/i.test(e.text) ? 2 : 0) }))
    .filter(({ e }) => {
      if (e.kind !== 'start') return true;
      if (seen.has(e.kind)) return false;
      seen.add(e.kind);
      return true;
    })
    .sort((x, y) => y.rank - x.rank || x.i - y.i).slice(0, ALUMNI.lines).sort((x, y) => x.i - y.i);
  return picked.map(({ e }) => ({ year: e.year, ...(e.week !== undefined ? { week: e.week } : {}), kind: e.kind, text: e.text }));
}

/**
 * A plaque frozen with the #0 of a joiner's generated record (freshmen, walk-ons and recruits get their
 * number on joining, and saves from before career rows kept it lost it when they left).
 */
const lostNumber = (p: AlumPlaque) => p.num === 0 && joinYear(p.id) !== undefined && !p.rows.some((r) => r.num !== undefined);

/** A plaque from what the career store knows. `a` is him as he is now, if he's still on a roster. */
export function buildPlaque(state: SeasonState, id: string, team: string, o: { a?: Athlete; prev?: AlumPlaque; live?: boolean } = {}): AlumPlaque | undefined {
  const { a, prev } = o;
  const base = a ?? generatedAthlete(id);
  if (!base) return undefined;
  const all = a && o.live ? careerRows(state, a, team) : careerOf(state, id)?.seasons ?? [];
  const mine = all.filter((r) => r.team === team);
  const num = a?.num ?? (prev && !lostNumber(prev) ? prev.num : undefined) ?? jerseyOf(state, id, team) ?? base.num;
  const rows = rowsWith(all, team, num, prev);
  const first = mine[0];
  const p: AlumPlaque = {
    id, name: athleteName(base), num, pos: base.pos, arch: archetypeLabel(base).toUpperCase(),
    home: `${base.hometown.city}, ${base.hometown.state}`, ht: base.heightIn, wt: base.weightLb, stars: base.stars,
    ...originOf(state, id, team),
    ovr0: first?.ovr0 ?? overall(base.r, base.pos), rows, card: callingCard(generatedAthlete(id) ?? base, all), lines: curate(state, id, team),
    honors: honorsOf(state, id, team), score: 0,
  };
  if (!a) p.exit = exitOf(state, id, team, mine[mine.length - 1]?.year ?? state.year);
  p.score = legacyScore(p);
  return p;
}

function honorsOf(state: SeasonState, id: string, team: string): string[] {
  return (careerOf(state, id)?.story ?? []).filter((e) => e.kind === 'award' && e.team === team)
    .map((e) => `${e.year} ${e.text.replace(/^Wins the /, '').toUpperCase()}`);
}

/** Won it (not a finalist). */
export const isWin = (honor: string) => !/FINALIST$/.test(honor);

// ------------------------------------------------------------ the store

/**
 * Bring the store up to date: every player on the user's roster refreshed, and every player who has
 * played a season for the user and is gone frozen with his exit. Idempotent; it backfills a save from
 * before the store existed the first time it runs. Called as the season ends, through the offseason,
 * and when the user opens the page.
 */
export function syncAlumni(state: SeasonState): void {
  const team = state.config.userTeamId;
  const store = (state.alumni ??= {});
  const on = new Set<string>();
  for (const a of baseRoster(state, team)) {
    on.add(a.id);
    // Current players keep only archived rows here; the page lays the live season on top.
    const p = buildPlaque(state, a.id, team, { a, prev: store[a.id] });
    if (p?.rows.length) store[a.id] = p;
    else delete store[a.id];
  }
  // Repair the frozen plaques that lost their number.
  for (const p of Object.values(store)) if (p.exit && lostNumber(p)) p.num = jerseyOf(state, p.id, team) ?? p.num;
  for (const [id, c] of Object.entries(state.careers ?? {})) {
    if (on.has(id) || store[id]?.exit || !c.seasons.some((r) => r.team === team)) continue;
    const p = buildPlaque(state, id, team, { prev: store[id] });
    if (p) store[id] = p;
  }
}

const listKey = (s: SeasonState) => `${s.year}|${s.week}|${s.phase}|${s.offseason?.stage ?? ''}|${s.offseason?.round ?? ''}|${s.portal?.commits ? Object.keys(s.portal.commits).length : ''}`;
const listCache = new WeakMap<SeasonState, { key: string; list: AlumPlaque[] }>();

/**
 * Everyone, for the page: the frozen plaques of former players and fresh ones for the current roster
 * (this season's live row included). Cached by week and phase.
 */
export function alumniList(state: SeasonState): AlumPlaque[] {
  const hit = listCache.get(state);
  if (hit?.key === listKey(state)) return hit.list;
  syncAlumni(state);
  const team = state.config.userTeamId;
  const store = state.alumni ?? {};
  const list: AlumPlaque[] = Object.values(store).filter((p) => p.exit);
  for (const a of baseRoster(state, team)) {
    const p = buildPlaque(state, a.id, team, { a, prev: store[a.id], live: true });
    if (p) list.push(p);
  }
  listCache.set(state, { key: listKey(state), list });
  return list;
}

// ------------------------------------------------------------ hall of fame

export const isHof = (state: SeasonState, id: string) => !!state.hof?.includes(id);

/** The user's free toggle: on any player, current or former. */
export function toggleHof(state: SeasonState, id: string): boolean {
  const hof = (state.hof ??= []);
  const i = hof.indexOf(id);
  if (i >= 0) hof.splice(i, 1);
  else hof.push(id);
  return i < 0;
}

// ------------------------------------------------------------ legacy

export const peakOf = (p: AlumPlaque): { ovr: number; year: number } =>
  p.rows.reduce((b, r) => (r.ovr > b.ovr ? { ovr: r.ovr, year: r.year } : b), { ovr: p.ovr0, year: p.rows[0]?.year ?? 0 });

export function legacyScore(p: AlumPlaque): number {
  const S = ALUMNI.score;
  let s = 0;
  for (const r of p.rows) {
    if (r.role === 'starter') s += S.starter;
    else if (r.role === 'rotation') s += S.rotation;
    s += (r.gs ?? 0) * S.start;
  }
  s += Math.max(0, peakOf(p).ovr - S.peakFrom) * S.peak;
  for (const h of p.honors) s += isWin(h) ? S.award : S.finalist;
  if (p.exit?.draft) s += S.draft[Math.min(S.draft.length - 1, p.exit.draft.round)];
  return Math.round(s);
}

export function legacyTier(state: SeasonState, p: AlumPlaque): LegacyTier {
  const T = ALUMNI.tier;
  if (isHof(state, p.id)) return 'hof';
  if (p.score >= T.legend || p.honors.some(isWin) || (p.exit?.draft?.pick ?? 99) <= T.topPick) return 'legend';
  // A frame for starting needs a season as the starter: a deep roster's backups rate high too.
  const started = p.rows.some((r) => r.role === 'starter');
  if ((p.exit?.draft && p.exit.draft.round <= 3) || (started && (p.score >= T.star || (p.score >= T.starter && p.lines.some((l) => l.kind === 'breakout'))))) return 'star';
  if (started && p.score >= T.starter) return 'starter';
  return p.rows.some((r) => r.gp) ? 'letterman' : 'roll';
}

// ------------------------------------------------------------ the words

const NOUNS: Record<string, string[]> = {
  QB: ['GUNSLINGER', 'GENERAL', 'RIFLE', 'MAESTRO', 'SURGEON', 'COMMANDER'],
  RB: ['EXPRESS', 'BULLDOZER', 'TORNADO', 'HAMMER', 'BULLET', 'TRAIN', 'CYCLONE'],
  WR: ['FLASH', 'MAGNET', 'ROCKET', 'JET', 'GLUE', 'COMET', 'STREAK'],
  OL: ['WALL', 'MOUNTAIN', 'ANVIL', 'FORTRESS', 'BOULDER', 'BULLDOG', 'TANK'],
  DL: ['HAMMER', 'TERROR', 'MENACE', 'WRECKER', 'BUZZSAW', 'TWISTER', 'BRUISER'],
  LB: ['HEADHUNTER', 'MENACE', 'BULLDOG', 'ENFORCER', 'HAMMER', 'WRECKER'],
  DB: ['BLANKET', 'HAWK', 'THIEF', 'VAULT', 'LOCKSMITH', 'BANDIT', 'SHADOW'],
  K: ['TOE', 'LEG', 'CANNON', 'BOOT'],
};
const GROUP: Record<Position, string> = {
  QB: 'QB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'WR', OT: 'OL', OG: 'OL', C: 'OL', DE: 'DL', DT: 'DL',
  OLB: 'LB', MLB: 'LB', CB: 'DB', FS: 'DB', SS: 'DB', K: 'K', P: 'K',
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A star's nickname, from his hometown, position and path: "THE TYLER TORNADO". A noun that starts
 * with his town's letter wins. Stars and up only; fixed by his id, so it never changes.
 */
export function epithet(state: SeasonState, p: AlumPlaque): string {
  const tier = legacyTier(state, p);
  if (tier !== 'star' && tier !== 'legend' && tier !== 'hof') return '';
  const city = p.home.split(',')[0].toUpperCase();
  if (p.origin === 'walkon') return 'THE WALK-ON WONDER';
  if (p.stars <= 2 && p.origin === 'signed') return `THE ${city.length <= 12 ? city : 'SMALL-TOWN'} SLEEPER`;
  const nouns = NOUNS[GROUP[p.pos]];
  const same = nouns.filter((n) => n[0] === city[0]);
  const pool = same.length ? same : nouns;
  const noun = pool[hash(p.id) % pool.length];
  if (city.length <= 13) return `THE ${city} ${noun}`;
  const last = p.name.split(' ').filter((w) => !/^(JR|SR|II|III|IV|V)\.?$/i.test(w)).pop()!.toUpperCase();
  const own = nouns.filter((n) => n[0] === last[0]);
  return `${last} THE ${(own.length ? own : nouns)[hash(p.id) % (own.length || nouns.length)]}`;
}

/** His years with the program: "2026-29". */
export function yearsText(p: AlumPlaque): string {
  if (!p.rows.length) return '';
  const a = p.rows[0].year;
  const b = p.rows[p.rows.length - 1].year;
  return a === b ? String(a) : `${a}-${String(b).slice(2)}`;
}

/** Every jersey number he wore with the program. */
export function numbersOf(p: AlumPlaque): number[] {
  return [...new Set(p.rows.map((r) => r.num ?? p.num))];
}

export function totalsOf(p: AlumPlaque): ReturnType<typeof careerTotals> {
  return careerTotals(p.rows.map((r) => ({ ...r, team: '', ovr0: r.ovr, ovr1: r.ovr })));
}

// ------------------------------------------------------------ the record book

export interface RecordCat {
  key: StatKey | 'gs';
  label: string;
}

export const RECORD_CATS: RecordCat[] = [
  { key: 'passYds', label: 'PASSING YARDS' }, { key: 'passTd', label: 'PASSING TDS' },
  { key: 'rushYds', label: 'RUSHING YARDS' }, { key: 'rushTd', label: 'RUSHING TDS' },
  { key: 'rec', label: 'RECEPTIONS' }, { key: 'recYds', label: 'RECEIVING YARDS' }, { key: 'recTd', label: 'RECEIVING TDS' },
  { key: 'sk', label: 'SACKS' }, { key: 'defInt', label: 'INTERCEPTIONS' }, { key: 'fgm', label: 'FIELD GOALS' },
  { key: 'gs', label: 'STARTS' },
];

export interface RecordRow {
  id: string;
  name: string;
  pos: Position;
  value: number;
  /** The season, for a single-season record; the span, for a career. */
  when: string;
}

const statOf = (r: AlumSeason, k: RecordCat['key']) => (k === 'gs' ? r.gs ?? 0 : r.st?.[k] ?? 0);

/** A category's leaders since the user arrived: the best seasons and the best careers. */
export function recordBook(list: AlumPlaque[], k: RecordCat['key'], n = 10): { season: RecordRow[]; career: RecordRow[] } {
  const season: RecordRow[] = [];
  const career: RecordRow[] = [];
  for (const p of list) {
    let tot = 0;
    for (const r of p.rows) {
      const v = statOf(r, k);
      tot += v;
      if (v > 0) season.push({ id: p.id, name: p.name, pos: p.pos, value: v, when: String(r.year) });
    }
    if (tot > 0) career.push({ id: p.id, name: p.name, pos: p.pos, value: tot, when: yearsText(p) });
  }
  const by = (a: RecordRow, b: RecordRow) => b.value - a.value || a.when.localeCompare(b.when);
  return { season: season.sort(by).slice(0, n), career: career.sort(by).slice(0, n) };
}

/** Each jersey number and who wore it, oldest first. */
export function numberLineage(list: AlumPlaque[]): Map<number, { p: AlumPlaque; from: number; to: number }[]> {
  const out = new Map<number, { p: AlumPlaque; from: number; to: number }[]>();
  for (const p of list) {
    for (const n of numbersOf(p)) {
      const yrs = p.rows.filter((r) => (r.num ?? p.num) === n).map((r) => r.year);
      if (!yrs.length) continue;
      const arr = out.get(n) ?? [];
      arr.push({ p, from: Math.min(...yrs), to: Math.max(...yrs) });
      out.set(n, arr);
    }
  }
  for (const arr of out.values()) arr.sort((a, b) => a.from - b.from || b.p.score - a.p.score);
  return out;
}

/** The succession chart's position groups, in depth chart order. */
export const LINE_GROUPS: { label: string; pos: Position[] }[] = [
  { label: 'QB', pos: ['QB'] }, { label: 'RB', pos: ['HB', 'FB'] }, { label: 'WR', pos: ['WR'] }, { label: 'TE', pos: ['TE'] },
  { label: 'OL', pos: ['OT', 'OG', 'C'] }, { label: 'DL', pos: ['DE', 'DT'] }, { label: 'LB', pos: ['OLB', 'MLB'] },
  { label: 'CB', pos: ['CB'] }, { label: 'S', pos: ['FS', 'SS'] }, { label: 'K/P', pos: ['K', 'P'] },
];

/** A group's starters in a season, the most starts first. */
export function startersIn(list: AlumPlaque[], group: Position[], year: number): AlumPlaque[] {
  return list.map((p) => ({ p, r: p.rows.find((r) => r.year === year) }))
    .filter((x) => x.r && group.includes(x.p.pos) && x.r.role === 'starter')
    .sort((a, b) => (b.r!.gs ?? 0) - (a.r!.gs ?? 0) || b.p.score - a.p.score).map((x) => x.p);
}
