import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { beatsChecks, explainReport, FILM, filmDiff, filmReport, filmRows, filmTable, situations, type FilmTable } from './film';

describe('film room', () => {
  it('an RPO is two rows, the give and the pull; short-yardage plays are measured on 3rd and 1', () => {
    const rows = filmRows();
    expect(rows.filter((r) => r.play === 'rpo-glance').map((r) => r.mode)).toEqual(['give', 'pull']);
    const sneak = rows.find((r) => r.play === 'qb-sneak')!;
    expect([sneak.down, sneak.toGo]).toEqual([3, 1]);
    expect(rows.length).toBe(PLAYBOOK.length + PLAYBOOK.filter((p) => p.read === 'rpo').length);
  });

  it('a small table has every call and the tagged columns, and a cell keeps its numbers when the book around it changes', () => {
    const glance = PLAYBOOK.find((p) => p.id === 'rpo-glance')!;
    const iz = PLAYBOOK.find((p) => p.id === 'inside-zone')!;
    const a = filmTable([glance], 4);
    const b = filmTable([iz, glance], 4);
    const pull = a.rows.find((r) => r.id === 'rpo-glance:pull')!;
    for (const c of DEF_CALLS) expect(pull.cells[c.id].n).toBeGreaterThan(0);
    expect(pull.cells['c3+rpo']).toBeDefined();
    expect(a.rows.find((r) => r.id === 'rpo-glance:give')!.cells['c3+rpo']).toBeUndefined();
    expect(b.rows.find((r) => r.id === 'rpo-glance:pull')!.cells).toEqual(pull.cells);
    expect(filmReport(a).some((l) => l.startsWith('CALL '))).toBe(true);
    expect(pull.family).toBe('rpo');
    expect(pull.books).toContain('legacy');
    expect(Object.values(pull.cells).some((c) => c.tgt && Object.keys(c.tgt).some((k) => k.endsWith(':glance')))).toBe(true);
    expect(explainReport(a, ['rpo-glance']).some((l) => l.startsWith('EXPLAIN'))).toBe(true);
    expect(filmDiff(a, b).at(-1)).toBe('1 new rows, 0 rows gone.');
  });

  it('the beats check holds a tag against its peers', () => {
    const smash = PLAYBOOK.find((p) => p.id === 'smash')!;
    const verts = PLAYBOOK.find((p) => p.id === 'four-verts')!;
    const t = filmTable([smash, verts], 4);
    for (const c of beatsChecks(t)) expect(['ok', 'miss', 'extra', 'stopOk', 'stopMiss']).toContain(c.kind);
    // Smash is stopped by quarters: that's checked as a stop, not a beat.
    expect(beatsChecks(t).some((c) => c.row.play === 'smash' && c.tag === 'quarters' && c.kind.startsWith('stop'))).toBe(true);
    expect(situations(t).every((s) => s.spread === s.works - s.fails)).toBe(true);
    expect(beatsChecks(t).some((c) => c.row.play === 'smash' && c.tag === 'cover2')).toBe(true);
  });
});

// `npm run film`: the whole book, written to film.txt (the report) and film.json (the table).
it.runIf(process.env.npm_lifecycle_event === 'film')('film room report', () => {
  const only = process.env.FILM_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  const plays = only ? PLAYBOOK.filter((p) => only.includes(p.id) || only.includes(p.kind)) : PLAYBOOK;
  const t = filmTable(plays, Number(process.env.FILM_REPS ?? FILM.reps));
  const lines = filmReport(t);
  const explain = process.env.FILM_EXPLAIN?.split(',').map((s) => s.trim()).filter(Boolean);
  if (explain) lines.push(...explainReport(t, explain));
  const basePath = process.env.FILM_BASE;
  if (basePath && existsSync(basePath)) lines.push('', ...filmDiff(JSON.parse(readFileSync(basePath, 'utf8')) as FilmTable, t));
  writeFileSync(process.env.FILM_OUT ?? 'film.txt', lines.join('\n'));
  writeFileSync(process.env.FILM_JSON ?? 'film.json', JSON.stringify(t));
}, 3_600_000);
