/**
 * The film room (`npm run film`, docs/FILM.md): every play in the library against every defensive call,
 * headless on the reference matchup, as a table of results. A balancing tool for new plays (it flags
 * plays that beat every call or none, and calls nothing beats), and the table the learning defense plays
 * from (docs/DEFENSE.md, "The DC"): a full run writes `src/data/filmPayoff.ts` (`payoffSource`).
 *
 * Rows are plays; an RPO is two rows, the give and the pull. Columns are calls, plus tagged variants
 * where a tag changes the call: the RPO pass-first tag against pulls, the spy against QB runs. Each cell
 * has its own seed (from the row and the column), so adding a play or a call doesn't move the others.
 */
import { holdFor } from './adaptive';
import { DEF_CALLS, rushers, type DefCall, type DefTags } from './data/defenses';
import { OFF_STYLES, STYLES } from './data/offStyles';
import { LEGACY, PLAYBOOK, type PlayDef } from './data/plays';
import { BOX_TAGS, callCovers, COVER_TAGS, type CoverTag, type Family, type PlayConcept } from './data/playTags';
import { OPP_GOAL } from './engine/constants';
import { mulberry32 } from './engine/math';
import { lookOf } from './game/defBrain';
import { featureVector } from './game/playFeatures';
import * as H from './harness';
import { successful } from './season/grades';
import { playTraits, type Trait } from './season/scouting';

/**
 * Film room settings.
 * - `reps`: snaps per cell (`FILM_REPS` overrides); `seed`.
 * - `explosive`: a gain this long is an explosive play.
 * - `hotAt`: against this many rushers or more, every throw is hot, at `hotHold` s: a QB doesn't hold
 *   the ball 2.2 s into an all-out blitz, and the harness otherwise would.
 * - Flags, on success rate against the regular (non-situational) calls:
 *   - `beatsAll`: a play no call holds under this, beating everything (`beatsAllShort` for a short-yardage
 *     play on 3rd and 1, where FBS converts about two in three);
 *   - `beatsNone`: a play that reaches this against no call;
 *   - `noAnswer`: a call that no play reaches this against;
 *   - `tagFrom`: a tag that moves a cell's success this much is worth a line.
 * - The beats check (`beatsChecks`): `beatsSlack` worse than the peers against a tagged look is a miss,
 *   `extraFrom` better against an untagged one is an extra, each widened by `sigmas` standard errors of
 *   the cells it rests on. A look that should stop it (`stops`) is the mirror: `beatsSlack` better than
 *   the peers there is a stop miss.
 * - SITUATIONS (`situations`): a play's success against the looks it beats less its success against the
 *   looks that stop it. Under `spreadFrom` and `spreadYpp` yd a play it doesn't care what the defense shows: a flat play, either a
 *   cheat or filler, and the ML defense has nothing to learn from it. `diffFrom`: a cell that moved this much since `FILM_BASE` gets a line.
 * - `nfl`: the NFL route table the ROUTES section compares against.
 */
export const FILM = {
  reps: 80,
  seed: 31,
  explosive: 15,
  hotAt: 6,
  hotHold: 1.2,
  beatsAll: 0.45,
  beatsAllShort: 0.75,
  beatsNone: 0.3,
  noAnswer: 0.5,
  tagFrom: 0.1,
  beatsSlack: 0.03,
  extraFrom: 0.12,
  sigmas: 2,
  spreadFrom: 0.1,
  spreadYpp: 3,
  diffFrom: 0.1,
  /**
   * NFL catch rate and yards a target by route (docs/TARGETS.md, "Pass results by route"), and which
   * of our routes count as each. The auto-QB throws to the most open man, so ours run a little high.
   */
  nfl: {
    screen: { comp: 0.907, ypt: 5.1, routes: ['smoke', 'tunnel', 'bubble', 'screen', 'slip'] },
    flat: { comp: 0.816, ypt: 5.9, routes: ['flat', 'checkFlat', 'arrow', 'swing'] },
    hitch: { comp: 0.703, ypt: 6.8, routes: ['hitch'] },
    cross: { comp: 0.682, ypt: 8.2, routes: ['cross', 'drag', 'leak'] },
    slant: { comp: 0.661, ypt: 6.9, routes: ['slant', 'whip'] },
    out: { comp: 0.659, ypt: 6.2, routes: ['quickOut', 'deepOut'] },
    in: { comp: 0.572, ypt: 8.2, routes: ['in'] },
    post: { comp: 0.508, ypt: 13.0, routes: ['post', 'glance'] },
    corner: { comp: 0.416, ypt: 9.7, routes: ['corner'] },
    go: { comp: 0.332, ypt: 9.3, routes: ['go', 'seam', 'fade', 'outUp', 'wheel'] },
  } as Record<string, { comp: number; ypt: number; routes: string[] }>,
};

/** How a row's snap is played: a run, a pass (dropback, PA or screen), an RPO handed off or pulled. */
export type FilmMode = 'run' | 'pass' | 'give' | 'pull';

/** Throws to one receiver on one route in a cell. */
export interface TargetStat {
  n: number;
  /** Catches, yards (all targets), air yards and yards after the catch (catches), interceptions. */
  catch: number;
  yds: number;
  air: number;
  yac: number;
  int: number;
  /** Mean separation (yd) and the QB's pressure (0-1) at the throw. */
  sep: number;
  pres: number;
}

/** One cell: a row against a call (or a tagged call). */
export interface FilmCell {
  n: number;
  /** Success rate (`successful`, on the row's down and distance). */
  succ: number;
  ypp: number;
  /** Share of snaps gaining `FILM.explosive`+. */
  expl: number;
  /** Share of snaps losing yards: a sack, a loss, a turnover. */
  neg: number;
  /** Share of snaps that are sacks. */
  sack: number;
  /** Passes: throws by `<slot>:<route>`. */
  tgt?: Record<string, TargetStat>;
}

export interface FilmRow {
  /** The play id, with ':give' or ':pull' for an RPO. */
  id: string;
  play: string;
  name: string;
  mode: FilmMode;
  traits: Trait[];
  /** The play's hand tags (`PlayDef.tags`). */
  family: Family;
  concept: PlayConcept;
  beats: CoverTag[];
  /** The looks that should stop it (`PlayTags.stops`; missing in an old FILM_BASE). */
  stops?: CoverTag[];
  /** The style books it's in (`data/offStyles.ts`); `legacy` for the original 62. */
  books: string[];
  /** `featureVector` (`game/playFeatures.ts`), in `FEATURE_KEYS` order. */
  features: number[];
  /** Personnel and formation, the defense's key (`lookOf`). */
  look: string;
  /** Down and distance it's measured on: short-yardage plays on 3rd and 1, the rest 1st and 10. */
  down: number;
  toGo: number;
  /** By column id: a call's id, or `<call>+<tag>`. */
  cells: Record<string, FilmCell>;
}

export interface FilmTable {
  reps: number;
  seed: number;
  /** Column ids of the plain calls, in playbook order, and which are situational. */
  calls: string[];
  situational: string[];
  rows: FilmRow[];
}

/** A column: a call and its tags. */
interface Column {
  id: string;
  call: DefCall;
  tags: DefTags;
}

/** The books a play is in: the built style books, and `legacy`. */
export function booksOf(p: PlayDef): string[] {
  const out = OFF_STYLES.filter((st) => STYLES[st].book?.includes(p.id)) as string[];
  if (LEGACY.includes(p)) out.push('legacy');
  return out;
}

/** The book's rows: each play, an RPO twice. */
export function filmRows(plays: PlayDef[] = PLAYBOOK): Omit<FilmRow, 'cells'>[] {
  const out: Omit<FilmRow, 'cells'>[] = [];
  for (const p of plays) {
    const base = {
      play: p.id, traits: [...playTraits(p)], family: p.tags.family, concept: p.tags.concept, beats: p.tags.beats, stops: p.tags.stops,
      books: booksOf(p), features: featureVector(p), look: lookOf(p), down: p.short ? 3 : 1, toGo: p.short ? 1 : 10,
    };
    if (p.read === 'rpo') {
      out.push({ ...base, id: `${p.id}:give`, name: `${p.name} (give)`, mode: 'give' });
      out.push({ ...base, id: `${p.id}:pull`, name: `${p.name} (pull)`, mode: 'pull' });
    } else out.push({ ...base, id: p.id, name: p.name, mode: p.kind === 'run' ? 'run' : 'pass' });
  }
  return out;
}

/** The columns for a row: every call, plus the tags that change something against it. */
function columnsFor(row: Omit<FilmRow, 'cells'>, p: PlayDef): Column[] {
  const cols: Column[] = DEF_CALLS.map((call) => ({ id: call.id, call, tags: {} }));
  for (const call of DEF_CALLS) {
    // Pass-first takes hook and curl defenders off the run key: only zone calls have them.
    if (row.mode === 'pull' && call.coverage === 'zone') cols.push({ id: `${call.id}+rpo`, call, tags: { rpo: true } });
    if (p.qbRun && call.spyFrom) cols.push({ id: `${call.id}+spy`, call, tags: { spy: true } });
  }
  return cols;
}

/** A stable seed for a cell from its row and column (FNV-1a). */
function cellSeed(seed: number, row: string, col: string): number {
  let h = 2166136261 ^ seed;
  for (const ch of `${row}|${col}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One cell: `reps` snaps of the row against the column, from the 35. */
function playCell(m: H.Matchup, p: PlayDef, row: Omit<FilmRow, 'cells'>, col: Column, reps: number, seed: number): FilmCell {
  const rng = mulberry32(cellSeed(seed, row.id, col.id));
  const x = { tags: col.tags };
  const ytg = OPP_GOAL - H.LOS;
  const c = { n: 0, succ: 0, yds: 0, expl: 0, neg: 0, sack: 0 };
  const tgt: Record<string, TargetStat> = {};
  for (let i = 0; i < reps; i++) {
    const r =
      row.mode === 'give' || row.mode === 'pull' ? H.rpoRep(m, p, col.call, row.mode === 'give', rng, H.LOS, x, H.RPO_THROW, 'read')
      : row.mode === 'run' ? H.runRep(m, p, col.call, rng, H.LOS, x)
      : H.passRep(m, p, col.call, rushers(col.call) >= FILM.hotAt ? Math.min(FILM.hotHold, holdFor(p)) : holdFor(p), rng, x, H.LOS, 'auto', undefined, 'read');
    const o = r.o;
    if (!o) continue;
    const turnover = o.type === 'int' || o.type === 'pick6' || o.type === 'fumble';
    const sack = o.type === 'sack';
    const gain = o.type === 'td' ? ytg : turnover ? 0 : o.spot - H.LOS;
    c.n++;
    c.yds += gain;
    if (successful({ gain, pass: row.mode !== 'run' && row.mode !== 'give', down: row.down, toGo: row.toGo, ...(sack ? { sack } : {}), ...(turnover ? { turnover } : {}) })) c.succ++;
    if (gain >= FILM.explosive) c.expl++;
    if (gain < 0 || sack || turnover) c.neg++;
    if (sack) c.sack++;
    const tg = 'target' in r ? r.target : undefined;
    const catchX = 'catchX' in r ? r.catchX ?? 0 : 0;
    if (tg) {
      const k = `${tg.slot}:${tg.route}`;
      const e = (tgt[k] ??= { n: 0, catch: 0, yds: 0, air: 0, yac: 0, int: 0, sep: 0, pres: 0 });
      const caught = !!catchX && !turnover;
      e.n++;
      e.sep += tg.sep;
      e.pres += tg.pressure;
      e.yds += gain;
      if (o.type === 'int' || o.type === 'pick6') e.int++;
      if (caught) {
        e.catch++;
        e.air += catchX - H.LOS;
        e.yac += gain - (catchX - H.LOS);
      }
    }
  }
  const d = Math.max(1, c.n);
  const out: FilmCell = { n: c.n, succ: c.succ / d, ypp: c.yds / d, expl: c.expl / d, neg: c.neg / d, sack: c.sack / d };
  if (Object.keys(tgt).length) out.tgt = tgt;
  return out;
}

/** The whole table: `plays` (the book by default) against every call, `reps` snaps a cell. */
export function filmTable(plays: PlayDef[] = PLAYBOOK, reps = FILM.reps, seed = FILM.seed): FilmTable {
  const m = H.referenceMatchup();
  const byId = new Map(plays.map((p) => [p.id, p]));
  const rows: FilmRow[] = filmRows(plays).map((row) => {
    const p = byId.get(row.play)!;
    const cells: Record<string, FilmCell> = {};
    for (const col of columnsFor(row, p)) cells[col.id] = playCell(m, p, row, col, reps, seed);
    return { ...row, cells };
  });
  return { reps, seed, calls: DEF_CALLS.map((c) => c.id), situational: DEF_CALLS.filter((c) => c.situational).map((c) => c.id), rows };
}

// ------------------------------------------------------------ the report

const pct = (x: number) => `${Math.round(x * 100)}`.padStart(3);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** A call's short column head. */
const head = (id: string) => id.replace('c1-', '1').replace('c3-', '3').replace('fire-zone', 'fz').slice(0, 6).padStart(6);

/** What the regular calls do against a row: its mean, the call that stops it best, and the one it beats most. */
export function rowSummary(t: FilmTable, row: FilmRow): { mean: number; ypp: number; best: string; worst: string; min: number; max: number } {
  const reg = t.calls.filter((c) => !t.situational.includes(c));
  const s = reg.map((c) => ({ c, v: row.cells[c].succ }));
  s.sort((a, b) => a.v - b.v);
  return {
    mean: mean(s.map((x) => x.v)), ypp: mean(reg.map((c) => row.cells[c].ypp)),
    best: s[0].c, worst: s[s.length - 1].c, min: s[0].v, max: s[s.length - 1].v,
  };
}

/** The report's lines (film.txt). */
export function filmReport(t: FilmTable): string[] {
  const name = (id: string) => DEF_CALLS.find((c) => c.id === id)?.name ?? id;
  const reg = t.calls.filter((c) => !t.situational.includes(c));
  const out: string[] = [
    `FILM ROOM: every play against every call, ${t.reps} snaps a cell, the reference matchup from the 35 (1st and 10; short-yardage plays 3rd and 1).`,
    `The auto-QB reads high to low at 1.2 s (quick game, screens, and anything against ${FILM.hotAt}+ rushers) or 2.2 s: the deepest man with ${H.READ.open} yd of separation, else the most open (H.READ); an RPO pull reads its tagged routes at 1.3 s. A cell is about +/-${Math.round(50 / Math.sqrt(t.reps) + 0.5)} points of noise.`,
    `Success rate by call (%). "stops it" is the regular call that holds it lowest; "beats" the one it beats most. Situational calls: ${t.situational.map(name).join(', ')}.`,
    '',
  ];
  const grid = (label: string, val: (c: FilmCell) => string) => {
    out.push(`${label.padEnd(30)}|${t.calls.map(head).join('')} |  mean   ypp | stops it  beats`);
    for (const row of t.rows) {
      const s = rowSummary(t, row);
      out.push(
        `${row.name.slice(0, 30).padEnd(30)}|${t.calls.map((c) => val(row.cells[c]).padStart(6)).join('')} | ${pct(s.mean)}% ${s.ypp.toFixed(1).padStart(5)} | ${head(s.best)} ${head(s.worst)}`,
      );
    }
  };
  grid('SUCCESS', (c) => pct(c.succ));
  out.push('');
  grid('YARDS PER PLAY', (c) => c.ypp.toFixed(1));

  // The calls: what they give up on average, and who beats them.
  out.push('', 'CALLS: mean over the book (success, ypp, explosive, negative), and the plays that beat it most');
  for (const c of t.calls) {
    const cells = t.rows.map((r) => ({ r, x: r.cells[c] }));
    cells.sort((a, b) => b.x.succ - a.x.succ);
    const top = cells.slice(0, 3).map((e) => `${e.r.name} ${pct(e.x.succ)}%`).join(', ');
    out.push(
      `CALL ${name(c).padEnd(15)} | succ ${pct(mean(cells.map((e) => e.x.succ)))}% ypp ${mean(cells.map((e) => e.x.ypp)).toFixed(1).padStart(4)} ` +
        `expl ${pct(mean(cells.map((e) => e.x.expl)))}% neg ${pct(mean(cells.map((e) => e.x.neg)))}% | beaten by ${top}`,
    );
  }

  // Families: trait by call, the backoff the in-game model will lean on.
  out.push('', 'FAMILIES: success by play trait (season/scouting.ts `playTraits`) against each call (%)');
  out.push(`${'trait'.padEnd(12)} plays |${t.calls.map(head).join('')}`);
  const traits = [...new Set(t.rows.flatMap((r) => r.traits))].sort();
  for (const tr of traits) {
    const rows = t.rows.filter((r) => r.traits.includes(tr));
    out.push(`${tr.padEnd(12)} ${String(rows.length).padStart(5)} |${t.calls.map((c) => pct(mean(rows.map((r) => r.cells[c].succ))).padStart(6)).join('')}`);
  }

  // Tags: where a tag moves a cell.
  out.push('', `TAGS: tagged cells that move success ${Math.round(FILM.tagFrom * 100)}+ points from the plain call`);
  let tagged = 0;
  for (const row of t.rows) {
    for (const [id, cell] of Object.entries(row.cells)) {
      const [c, tag] = id.split('+');
      if (!tag) continue;
      const d = cell.succ - row.cells[c].succ;
      if (Math.abs(d) < FILM.tagFrom) continue;
      tagged++;
      out.push(`TAG  ${row.name.padEnd(30)} ${name(c).padEnd(15)} +${tag.padEnd(4)} | ${pct(row.cells[c].succ)}% -> ${pct(cell.succ)}%, ypp ${row.cells[c].ypp.toFixed(1)} -> ${cell.ypp.toFixed(1)}`);
    }
  }
  if (!tagged) out.push('TAG  none');

  out.push('', ...beatsReport(t), '', ...situationsReport(t), '', ...routesReport(t), '', ...booksReport(t));

  // Flags: not tuned here, for a person to look at.
  out.push('', 'FLAGS (regular calls only)');
  let flags = 0;
  for (const row of t.rows) {
    const s = rowSummary(t, row);
    if (s.min >= (row.down === 3 ? FILM.beatsAllShort : FILM.beatsAll)) {
      flags++;
      out.push(`FLAG BEATS EVERY CALL  ${row.name}: the best answer, ${name(s.best)}, still allows ${pct(s.min)}%`);
    }
    if (s.max < FILM.beatsNone) {
      flags++;
      out.push(`FLAG BEATS NO CALL     ${row.name}: its best matchup, ${name(s.worst)}, is ${pct(s.max)}%`);
    }
  }
  for (const c of reg) {
    const best = Math.max(...t.rows.map((r) => r.cells[c].succ));
    if (best < FILM.noAnswer) {
      flags++;
      out.push(`FLAG NO ANSWER         ${name(c)}: no play reaches ${pct(FILM.noAnswer)}% against it (best ${pct(best)}%)`);
    }
  }
  if (!flags) out.push('FLAG none');
  return out;
}

// ------------------------------------------------------------ tags, routes, books

const callName = (id: string) => DEF_CALLS.find((c) => c.id === id)?.name ?? id;
const regular = (t: FilmTable) => t.calls.filter((c) => !t.situational.includes(c));
const passy = (r: FilmRow) => r.mode === 'pass' || r.mode === 'pull';

/**
 * The regular calls that answer to a tag (`callCovers`). `clean`: for a coverage tag, only the calls
 * showing it with a normal rush. A look that should stop a play is judged on its plain form: a zone
 * beater "losing to man" shouldn't be measured on Cover 0, where nobody's deep and everything is open.
 */
function callsFor(t: FilmTable, tag: CoverTag, clean = false): string[] {
  return regular(t).filter((id) => {
    const c = DEF_CALLS.find((x) => x.id === id)!;
    const covers = callCovers(c, rushers(c));
    return covers.has(tag) && !(clean && !BOX_TAGS.includes(tag) && covers.has('blitz'));
  });
}

export interface BeatsCheck {
  row: FilmRow;
  tag: CoverTag;
  /** How much better (+) or worse the row does against the tag's calls than its peers do, success points. */
  rel: number;
  kind: 'ok' | 'miss' | 'extra' | 'stopOk' | 'stopMiss';
}

/**
 * The realism check on the hand tags: a play tagged to beat a look should do better against the calls
 * that show it than its peers (passes against passes, runs against runs) do, relative to each one's own
 * mean. `miss`: it does `beatsSlack` worse; `extra`: it does `extraFrom` better against a look it isn't
 * tagged for. RPO gives aren't checked (the give is the run's); `press` is the identity's, not a call's.
 */
export function beatsChecks(t: FilmTable): BeatsCheck[] {
  const out: BeatsCheck[] = [];
  const means = new Map(t.rows.map((r) => [r, rowSummary(t, r).mean]));
  const edge = (r: FilmRow, calls: string[]) => mean(calls.map((c) => r.cells[c].succ)) - means.get(r)!;
  const n = regular(t).length;
  for (const tag of COVER_TAGS) {
    for (const clean of [false, true]) {
      const calls = callsFor(t, tag, clean);
      if (!calls.length || calls.length === n) continue;
      // Peers: passes against passes, runs against runs, and short yardage (3rd and 1) against its own.
      for (const kind of [true, false]) {
        for (const down of [1, 3]) {
          const peers = t.rows.filter((r) => r.mode !== 'give' && passy(r) === kind && r.down === down);
          if (!peers.length) continue;
          const peer = mean(peers.map((r) => edge(r, calls)));
          // A tag shown by one call rests on one cell: the bar widens by the noise (`sigmas` standard errors).
          const noise = FILM.sigmas * Math.sqrt(0.25 / (t.reps * calls.length));
          for (const row of peers) {
            const rel = edge(row, calls) - peer;
            if (clean) {
              if (row.stops?.includes(tag)) out.push({ row, tag, rel, kind: rel > FILM.beatsSlack + noise ? 'stopMiss' : 'stopOk' });
            } else if (row.beats.includes(tag)) out.push({ row, tag, rel, kind: rel < -(FILM.beatsSlack + noise) ? 'miss' : 'ok' });
            else if (!row.stops?.includes(tag) && rel >= FILM.extraFrom + noise) out.push({ row, tag, rel, kind: 'extra' });
          }
        }
      }
    }
  }
  return out;
}

const signedPts = (x: number) => `${x >= 0 ? '+' : '-'}${String(Math.abs(Math.round(x * 100))).padStart(2)}`;

function beatsReport(t: FilmTable): string[] {
  const checks = beatsChecks(t);
  const tagged = checks.filter((c) => c.kind === 'ok' || c.kind === 'miss');
  const stops = checks.filter((c) => c.kind === 'stopOk' || c.kind === 'stopMiss');
  const out = [
    `BEATS: each play against the looks its tags say it attacks (data/playTags.ts), relative to its peers; + is better than the peers do.`,
    `${tagged.length} tags checked: ${tagged.filter((c) => c.kind === 'ok').length} hold, ${tagged.filter((c) => c.kind === 'miss').length} miss (worse than the peers by ${Math.round(FILM.beatsSlack * 100)}+ points). EXTRA: ${Math.round(FILM.extraFrom * 100)}+ points better against a look it isn't tagged for.`,
  ];
  for (const c of checks.filter((x) => x.kind === 'miss').sort((a, b) => a.rel - b.rel)) {
    out.push(`TAG MISS   ${c.row.name.slice(0, 30).padEnd(30)} ${c.tag.padEnd(9)} ${signedPts(c.rel)} (${callsFor(t, c.tag).map(head).join(' ').replace(/ +/g, ' ').trim()})`);
  }
  out.push(`${stops.length} stops checked (the looks that should stop it, STOPS): ${stops.filter((c) => c.kind === 'stopOk').length} hold, ${stops.filter((c) => c.kind === 'stopMiss').length} miss (better than the peers by ${Math.round(FILM.beatsSlack * 100)}+ points).`);
  for (const c of checks.filter((x) => x.kind === 'stopMiss').sort((a, b) => b.rel - a.rel)) {
    out.push(`STOP MISS  ${c.row.name.slice(0, 30).padEnd(30)} ${c.tag.padEnd(9)} ${signedPts(c.rel)} (${callsFor(t, c.tag, true).map(head).join(' ').replace(/ +/g, ' ').trim()})`);
  }
  for (const c of checks.filter((x) => x.kind === 'extra').sort((a, b) => b.rel - a.rel)) {
    out.push(`TAG EXTRA  ${c.row.name.slice(0, 30).padEnd(30)} ${c.tag.padEnd(9)} ${signedPts(c.rel)}`);
  }
  return out;
}

export interface Situation {
  row: FilmRow;
  /** Mean success against the calls showing a look it beats, and against those showing a look that stops it. */
  works: number;
  fails: number;
  spread: number;
  /** The same in yards a play: a shot's checkdown against the look that takes it away is a 1st-down success. */
  worksYpp: number;
  failsYpp: number;
}

/**
 * Where each play works and where it doesn't: its success against the regular calls showing a look it
 * beats, and against those showing a look that should stop it (a call showing both counts for neither).
 * Rows without both sides (the sneak, an RPO give) are left out.
 */
export function situations(t: FilmTable): Situation[] {
  const out: Situation[] = [];
  for (const row of t.rows) {
    if (row.mode === 'give' || !row.stops?.length || !row.beats.length) continue;
    const good = new Set(row.beats.flatMap((g) => callsFor(t, g)));
    const bad = new Set(row.stops.flatMap((g) => callsFor(t, g, true)));
    const works = [...good].filter((c) => !bad.has(c));
    const fails = [...bad].filter((c) => !good.has(c));
    if (!works.length || !fails.length) continue;
    const w = mean(works.map((c) => row.cells[c].succ));
    const f = mean(fails.map((c) => row.cells[c].succ));
    const wy = mean(works.map((c) => row.cells[c].ypp));
    const fy = mean(fails.map((c) => row.cells[c].ypp));
    out.push({ row, works: w, fails: f, spread: w - f, worksYpp: wy, failsYpp: fy });
  }
  return out;
}

function situationsReport(t: FilmTable): string[] {
  const all = situations(t);
  const flat = all.filter((s) => s.spread < FILM.spreadFrom && s.worksYpp - s.failsYpp < FILM.spreadYpp).sort((a, b) => a.spread - b.spread);
  const out = [
    `SITUATIONS: success against the looks each play beats (its tags) less against the looks that should stop it (STOPS, data/playTags.ts).`,
    `${all.length} plays: median spread ${signedPts(median(all.map((s) => s.spread)))} points; ${flat.length} FLAT (under ${Math.round(FILM.spreadFrom * 100)} points and ${FILM.spreadYpp} yd a play: it doesn't care what the defense shows).`,
  ];
  for (const s of flat) {
    out.push(`FLAT  ${s.row.name.slice(0, 30).padEnd(30)} works ${pct(s.works)}% ${s.worksYpp.toFixed(1)} ypp (${s.row.beats.join(' ')}) | fails ${pct(s.fails)}% ${s.failsYpp.toFixed(1)} ypp (${s.row.stops!.join(' ')}) | spread ${signedPts(s.spread)}`);
  }
  return out;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

interface RouteAgg {
  n: number;
  catch: number;
  yds: number;
  yac: number;
  sep: number;
  int: number;
}

const addTarget = (a: RouteAgg, e: RouteAgg) => {
  a.n += e.n;
  a.catch += e.catch;
  a.yds += e.yds;
  a.yac += e.yac;
  a.sep += e.sep;
  a.int += e.int;
};
const aggLine = (a: RouteAgg) =>
  `${String(a.n).padStart(6)} ${pct(a.catch / Math.max(1, a.n))}% ${(a.yds / Math.max(1, a.n)).toFixed(1).padStart(5)} ${(a.yac / Math.max(1, a.catch)).toFixed(1).padStart(5)} ${(a.sep / Math.max(1, a.n)).toFixed(1).padStart(5)} ${pct(a.int / Math.max(1, a.n))}%`;

/** Every throw in the table by route, against the NFL's catch rate and yards a target (`FILM.nfl`). */
function routesReport(t: FilmTable): string[] {
  const by = new Map<string, RouteAgg>();
  for (const row of t.rows) {
    if (!passy(row)) continue;
    for (const c of regular(t)) {
      for (const [k, e] of Object.entries(row.cells[c].tgt ?? {})) {
        const route = k.split(':')[1];
        addTarget(by.get(route) ?? by.set(route, { n: 0, catch: 0, yds: 0, yac: 0, sep: 0, int: 0 }).get(route)!, e);
      }
    }
  }
  const out = [
    'ROUTES: every throw against the regular calls by route: targets, catch %, yards a target, YAC a catch, separation at the throw (yd), INT %.',
    'The NFL columns are catch % and yards a target (docs/TARGETS.md). The auto-QB throws only to a man who is open and never into a',
    'contested window, so ours run high, deep routes most (the balance report\'s ROUTE rows throw every route and are the fair comparison).',
    `${'route'.padEnd(10)} ${'targets'.padStart(6)} catch   ypt   yac   sep  int | NFL catch  ypt`,
  ];
  for (const [group, nfl] of Object.entries(FILM.nfl)) {
    const a: RouteAgg = { n: 0, catch: 0, yds: 0, yac: 0, sep: 0, int: 0 };
    for (const r of nfl.routes) if (by.has(r)) addTarget(a, by.get(r)!);
    if (a.n) out.push(`${group.toUpperCase().padEnd(10)} ${aggLine(a)} |    ${pct(nfl.comp)}% ${nfl.ypt.toFixed(1).padStart(4)}`);
  }
  for (const [route, a] of [...by.entries()].sort((x, y) => y[1].n - x[1].n)) out.push(`  ${route.padEnd(8)} ${aggLine(a)}`);
  return out;
}

/** Each style book's rows: success against each call, and its families. Flags a call the whole book can't beat. */
function booksReport(t: FilmTable): string[] {
  const books = [...OFF_STYLES.filter((s) => STYLES[s].book), 'legacy'];
  const out = ['BOOKS: each style book against each call (%), and its families (rows, mean success, the call that stops the family best)'];
  out.push(`${'book'.padEnd(14)} rows |${t.calls.map(head).join('')} |  mean`);
  const flags: string[] = [];
  for (const b of books) {
    const rows = t.rows.filter((r) => r.books.includes(b));
    if (!rows.length) continue;
    const label = b === 'legacy' ? 'Legacy' : STYLES[b as keyof typeof STYLES].name;
    out.push(`${label.padEnd(14)} ${String(rows.length).padStart(4)} |${t.calls.map((c) => pct(mean(rows.map((r) => r.cells[c].succ))).padStart(6)).join('')} | ${pct(mean(rows.map((r) => rowSummary(t, r).mean)))}%`);
    const fams = [...new Set(rows.map((r) => r.family))];
    const famLine = fams.map((f) => {
      const fr = rows.filter((r) => r.family === f);
      const byCall = regular(t).map((c) => ({ c, v: mean(fr.map((r) => r.cells[c].succ)) })).sort((a, b) => a.v - b.v);
      if (byCall[0].v >= FILM.beatsAll && f !== 'qbRun') flags.push(`FLAG BOOK FAMILY  ${label}: ${f} beats every call (the best answer, ${callName(byCall[0].c)}, allows ${pct(byCall[0].v)}%)`);
      return `${f} ${fr.length}/${pct(mean(fr.map((r) => rowSummary(t, r).mean))).trim()}%/${head(byCall[0].c).trim()}`;
    });
    out.push(`  ${famLine.join('  ')}`);
    for (const c of regular(t)) {
      const best = Math.max(...rows.map((r) => r.cells[c].succ));
      if (best < FILM.noAnswer) flags.push(`FLAG BOOK HOLE    ${label}: nothing in the book reaches ${pct(FILM.noAnswer)}% against ${callName(c)} (best ${pct(best)}%)`);
    }
  }
  return [...out, ...flags];
}

// ------------------------------------------------------------ explain and diff

/**
 * `FILM_EXPLAIN=id,...`: why a play does what it does. For each column: success, yards, sacks, and its
 * top targets (slot:route, share of throws, catch %, yards a target, air yards and YAC a catch,
 * separation and pressure at the throw); then its throws over the regular calls against the NFL's.
 */
export function explainReport(t: FilmTable, ids: string[]): string[] {
  const out: string[] = [];
  for (const row of t.rows.filter((r) => ids.includes(r.play) || ids.includes(r.id))) {
    const s = rowSummary(t, row);
    out.push('', `EXPLAIN ${row.name} [${row.family}, ${row.concept}; beats ${row.beats.join(' ') || '-'}; ${row.look}; books ${row.books.join(' ')}]`);
    out.push(`  mean ${pct(s.mean)}%, ${s.ypp.toFixed(1)} ypp; stopped best by ${callName(s.best)} (${pct(s.min)}%), beats ${callName(s.worst)} (${pct(s.max)}%)`);
    const all: Record<string, TargetStat> = {};
    for (const [col, cell] of Object.entries(row.cells)) {
      const tg = Object.entries(cell.tgt ?? {}).sort((a, b) => b[1].n - a[1].n);
      const thrown = tg.reduce((a, [, e]) => a + e.n, 0);
      const parts = tg.slice(0, 3).map(([k, e]) =>
        `${k} ${pct(e.n / Math.max(1, thrown)).trim()}% c${pct(e.catch / e.n).trim()} ${(e.yds / e.n).toFixed(1)}y air ${(e.air / Math.max(1, e.catch)).toFixed(1)} yac ${(e.yac / Math.max(1, e.catch)).toFixed(1)} sep ${(e.sep / e.n).toFixed(1)} pr ${(e.pres / e.n).toFixed(2)}`);
      out.push(`  ${col.padEnd(14)} ${pct(cell.succ)}% ${cell.ypp.toFixed(1).padStart(5)} sack ${pct(cell.sack)}%${parts.length ? ' | ' + parts.join(' ; ') : ''}`);
      if (regular(t).includes(col)) {
        for (const [k, e] of tg) {
          const a = (all[k] ??= { n: 0, catch: 0, yds: 0, air: 0, yac: 0, int: 0, sep: 0, pres: 0 });
          a.n += e.n; a.catch += e.catch; a.yds += e.yds; a.air += e.air; a.yac += e.yac; a.int += e.int; a.sep += e.sep; a.pres += e.pres;
        }
      }
    }
    const nflOf = (route: string) => Object.entries(FILM.nfl).find(([, v]) => v.routes.includes(route));
    for (const [k, e] of Object.entries(all).sort((a, b) => b[1].n - a[1].n)) {
      const n = nflOf(k.split(':')[1]);
      out.push(`  TOTAL ${k.padEnd(12)} ${String(e.n).padStart(4)} throws, catch ${pct(e.catch / e.n)}%, ${(e.yds / e.n).toFixed(1)} a target, air ${(e.air / Math.max(1, e.catch)).toFixed(1)}, yac ${(e.yac / Math.max(1, e.catch)).toFixed(1)}, sep ${(e.sep / e.n).toFixed(1)}` +
        (n ? ` | NFL ${n[0]}: ${pct(n[1].comp)}%, ${n[1].ypt.toFixed(1)}` : ''));
    }
  }
  return out;
}

/** `FILM_BASE=film.base.json`: the cells that moved `diffFrom`+ points of success since a saved table, and each row's mean. */
export function filmDiff(base: FilmTable, t: FilmTable): string[] {
  const old = new Map(base.rows.map((r) => [r.id, r]));
  const out = [`DIFF against the base table: cells that moved ${Math.round(FILM.diffFrom * 100)}+ points of success, then rows whose mean moved 3+`];
  const rowsMoved: { name: string; d: number; was: number; now: number }[] = [];
  let added = 0;
  for (const row of t.rows) {
    const b = old.get(row.id);
    if (!b) {
      added++;
      continue;
    }
    for (const [col, cell] of Object.entries(row.cells)) {
      const bc = b.cells[col];
      if (bc && Math.abs(cell.succ - bc.succ) >= FILM.diffFrom) {
        out.push(`DIFF ${row.name.slice(0, 30).padEnd(30)} ${col.padEnd(14)} ${pct(bc.succ)}% -> ${pct(cell.succ)}%, ypp ${bc.ypp.toFixed(1)} -> ${cell.ypp.toFixed(1)}`);
      }
    }
    const was = rowSummary(base, b).mean;
    const now = rowSummary(t, row).mean;
    if (Math.abs(now - was) >= 0.03) rowsMoved.push({ name: row.name, d: now - was, was, now });
  }
  for (const r of rowsMoved.sort((a, b) => a.d - b.d)) out.push(`ROW  ${r.name.slice(0, 30).padEnd(30)} mean ${pct(r.was)}% -> ${pct(r.now)}% (${signedPts(r.d)})`);
  out.push(`${added} new rows, ${base.rows.filter((r) => !t.rows.some((x) => x.id === r.id)).length} rows gone.`);
  return out;
}

// ------------------------------------------------------------ the payoff table the game reads

/**
 * `src/data/filmPayoff.ts`, the film table as the learning defense reads it (game/offModel.ts,
 * docs/DEFENSE.md "The ML DC"): each row's success and explosive rate (%) by column, -1 where a row has
 * no such column, and each pass row's share of throws by slot over the regular calls. Written by
 * `npm run film` on the whole book only, so a FILM_ONLY run never leaves the game a partial table.
 */
export function payoffSource(t: FilmTable): string {
  const cols = [...new Set(t.rows.flatMap((r) => Object.keys(r.cells)))];
  cols.sort((a, b) => (t.calls.indexOf(a.split('+')[0]) - t.calls.indexOf(b.split('+')[0])) || a.localeCompare(b));
  const reg = regular(t);
  const rows: string[] = [];
  for (const r of t.rows) {
    const s = cols.map((c) => (r.cells[c] ? Math.round(r.cells[c].succ * 100) : -1));
    const e = cols.map((c) => (r.cells[c] ? Math.round(r.cells[c].expl * 100) : -1));
    const by: Record<string, number> = {};
    for (const c of reg) for (const [k, st] of Object.entries(r.cells[c]?.tgt ?? {})) by[k.split(':')[0]] = (by[k.split(':')[0]] ?? 0) + st.n;
    const tot = Object.values(by).reduce((a, b) => a + b, 0);
    const tg = tot ? `, t: { ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${Math.round((n / tot) * 100)}`).join(', ')} }` : '';
    rows.push(`  '${r.id}': { s: [${s.join(',')}], e: [${e.join(',')}]${tg} },`);
  }
  return [
    '// Generated by `npm run film` (src/film.ts `payoffSource`). Do not edit by hand.',
    "import type { FilmPayoff } from '../game/offModel';",
    '',
    `export const FILM_PAYOFF: FilmPayoff = {`,
    `  reps: ${t.reps},`,
    `  cols: [${cols.map((c) => `'${c}'`).join(', ')}],`,
    '  rows: {',
    ...rows,
    '  },',
    '};',
    '',
  ].join('\n');
}
