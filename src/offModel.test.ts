import { describe, expect, it } from 'vitest';
import { FILM_PAYOFF } from './data/filmPayoff';
import { DEF_CALLS } from './data/defenses';
import { defIdentity } from './data/identity';
import { LEGACY, PLAYBOOK } from './data/plays';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { dcMix, newBrain, observe } from './game/defBrain';
import { famDist, filmOk, filmSummary, layFilm, learn, mergeFilm, newModel, sitBin, targetDist, type ModelParams } from './game/offModel';

const book = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
const sharp: ModelParams = { skill: 1, scout: 1 };
const call = DEF_CALLS[0];
const ident = defIdentity(teamById('alabama'));
const RUNS = ['insideZone', 'outsideZone', 'gap', 'perimeter', 'read', 'qbRun', 'draw'];
const runShare = (d: Record<string, number>) => RUNS.reduce((a, f) => a + (d[f] ?? 0), 0);

describe('the offense model', () => {
  it('has a film row for every play in the library, an RPO twice', () => {
    for (const p of PLAYBOOK) {
      if (p.read === 'rpo') {
        expect(FILM_PAYOFF.rows[`${p.id}:give`], p.id).toBeDefined();
        expect(FILM_PAYOFF.rows[`${p.id}:pull`], p.id).toBeDefined();
      } else expect(FILM_PAYOFF.rows[p.id], p.id).toBeDefined();
    }
    for (const c of DEF_CALLS) expect(FILM_PAYOFF.cols).toContain(c.id);
  });

  it('grades a snap the way the film room grades the play', () => {
    expect(filmOk(book('inside-zone'), 4, 60)).toBe(true);
    expect(filmOk(book('inside-zone'), 3, 60)).toBe(false);
    expect(filmOk(book('qb-sneak'), 1, 60)).toBe(true);
    expect(filmOk(book('inside-zone'), 2, 2)).toBe(true); // a score
    expect(filmOk(book('smash'), 20, 60, true)).toBe(false); // a turnover
  });

  it('learns what an offense calls by situation', () => {
    const m = newModel({ book: LEGACY, prm: sharp });
    const before = { early: runShare(famDist(m, sharp, 'early')), long: runShare(famDist(m, sharp, 'long')) };
    for (let i = 0; i < 12; i++) {
      learn(m, { play: book('inside-zone'), call, sit: 'early', gain: 4, yardsToGoal: 60 });
      learn(m, { play: book('smash'), call, sit: 'long', gain: 8, yardsToGoal: 60, target: 'Z' });
    }
    expect(runShare(famDist(m, sharp, 'early'))).toBeGreaterThan(before.early + 0.3);
    expect(runShare(famDist(m, sharp, 'long'))).toBeLessThan(before.long);
    expect(sitBin(3, 9, 60)).toBe('long');
    expect(sitBin(3, 1, 60)).toBe('short');
  });

  it('pools a favorite receiver across plays', () => {
    const m = newModel({ book: LEGACY, prm: sharp });
    const p = book('curl-flat');
    const before = targetDist(m, sharp, p.id).X ?? 0;
    for (const id of ['smash', 'stick', 'mesh', 'dagger', 'slant-flat', 'smash', 'stick', 'mesh']) {
      learn(m, { play: book(id), call, sit: 'early', gain: 9, yardsToGoal: 60, target: 'X' });
    }
    // Never thrown on curl-flat, but he's their guy on everything else.
    expect(targetDist(m, sharp, p.id).X ?? 0).toBeGreaterThan(before + 0.15);
  });

  it('carries film to next week: plain JSON, weighed by scouting, and a new man in a slot loses the old targets', () => {
    const roster = { qbMob: 0, passEdge: 0, rec: {}, who: { X: 'A #1', Z: 'B #2' } };
    const m = newModel({ book: LEGACY, roster, prm: sharp });
    for (let i = 0; i < 20; i++) learn(m, { play: book('inside-zone'), call, sit: 'early', gain: 5, yardsToGoal: 60 });
    for (let i = 0; i < 10; i++) learn(m, { play: book('smash'), call, sit: 'long', gain: 9, yardsToGoal: 60, target: 'X' });
    const film = mergeFilm(undefined, m.raw);
    expect(JSON.parse(JSON.stringify(film))).toEqual(film);
    expect(JSON.stringify(film).length).toBeLessThan(4000);
    expect(filmSummary(film).early).toBeCloseTo(1, 5);
    expect(filmSummary(film).top?.slot).toBe('X');
    const fresh = (scout: number) => newModel({ book: LEGACY, roster, prm: { skill: 1, scout } });
    const weak = fresh(0);
    const good = fresh(1);
    layFilm(weak, film, { skill: 1, scout: 0 });
    layFilm(good, film, { skill: 1, scout: 1 });
    expect(runShare(famDist(good, sharp, 'early'))).toBeGreaterThan(runShare(famDist(weak, sharp, 'early')));
    // Next season a new X: his targets are gone, the Z's stay.
    const next = mergeFilm(film, { ...newModel({ book: LEGACY, roster: { ...roster, who: { X: 'C #9', Z: 'B #2' } }, prm: sharp }).raw });
    expect(next.tgtAll.X).toBeUndefined();
    expect(next.who.X).toBe('C #9');
  });

  it('keys the receiver who keeps getting the ball', () => {
    const b = newBrain({ iq: 'NORMAL', adjust: 85, scout: 85, qbMobility: 0, seed: 3, book: LEGACY })!;
    expect(dcMix(b, ident, 1, 10, 60, mulberry32(1)).key?.slot ?? null).not.toBe('X');
    for (let i = 0; i < 12; i++) {
      const id = ['smash', 'stick', 'mesh', 'dagger'][i % 4];
      observe(b, { play: book(id), call, down: 1, toGo: 10, yardsToGoal: 60, gain: 12, success: true, scrambled: false, kept: false, air: 10, target: 'X' });
    }
    const k = dcMix(b, ident, 1, 10, 60, mulberry32(1)).key;
    expect(k?.slot).toBe('X');
    expect(k!.odds).toBeGreaterThan(0.3);
  });
});
