import { describe, expect, it } from 'vitest';
import { buildSquad, onField, PICK_ORDER, starters } from './data/depth';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { lineupOf, nextManUp, subCandidates, substitute, withLineup } from './game/lineup';
import { gradeGame } from './season/grades';
import { simGame } from './season/simGame';
import type { DriveLog } from './season/types';

const squad = buildSquad(teamById('georgia'));
const away = buildSquad(teamById('texas'));
const ids = (sq = squad) => Object.fromEntries(Object.entries(starters(sq)).map(([s, a]) => [s, a.id]));

describe('in-game lineup (docs/SUBS.md)', () => {
  it('the depth chart laid over itself is the depth chart', () => {
    expect(ids(withLineup(squad, lineupOf(squad)))).toEqual(ids());
  });

  it('swaps two receivers who trade slots', () => {
    const l = lineupOf(squad);
    const next = substitute(squad, l, 'SL', l.X);
    expect(next.SL).toBe(l.X);
    expect(next.X).toBe(l.SL);
    const on = ids(withLineup(squad, next));
    expect(on.SL).toBe(l.X);
    expect(on.X).toBe(l.SL);
  });

  it('puts a halfback at fullback, and the field reads him there', () => {
    const l = lineupOf(squad);
    const hb = squad.athletes.find((a) => a.pos === 'HB' && a.id !== l.RB)!;
    const next = substitute(squad, l, 'FB', hb.id);
    const on = onField(withLineup(squad, next));
    expect(on.FB.name).toBe(`${hb.first} ${hb.last}`);
    expect(subCandidates(squad, l, 'FB', new Set()).find((r) => r.a.id === hb.id)?.natural).toBe(true);
  });

  it('nobody plays two slots', () => {
    let l = lineupOf(squad);
    for (const slot of ['X', 'Z', 'SL', 'RB', 'FB', 'TE']) {
      const c = subCandidates(squad, l, slot, new Set()).filter((r) => r.onAt !== slot);
      if (c.length) l = substitute(squad, l, slot, c[c.length - 1].a.id);
    }
    const on = Object.values(ids(withLineup(squad, l)));
    expect(new Set(on).size).toBe(on.length);
    expect(Object.keys(l).every((s) => PICK_ORDER.includes(s))).toBe(true);
  });

  it('a player ruled out is never a candidate, and the next man up skips the lineup', () => {
    const l = lineupOf(squad);
    const out = new Set([l.QB]);
    expect(subCandidates(squad, l, 'QB', out).some((r) => r.a.id === l.QB)).toBe(false);
    const up = nextManUp(squad, l, 'QB', out)!;
    expect(up.id).not.toBe(l.QB);
    expect(Object.values(l)).not.toContain(up.id);
  });

  it('grades credit the man the user put in, and leave the depth chart game unchanged', () => {
    const drives: DriveLog[] = [];
    simGame(squad, away, mulberry32(3), { neutral: true, drives });
    const share = { [squad.team.id]: 0.5, [away.team.id]: 0.5 };
    const plain = gradeGame(squad, away, drives, share, mulberry32(4));
    const marked = gradeGame(squad, away, drives.map((d) => ({ ...d, subs: [{ team: squad.team.id, from: 0, lineup: {} }] })), share, mulberry32(4));
    expect([...marked.entries()]).toEqual([...plain.entries()]);

    const l = lineupOf(squad);
    const backup = subCandidates(squad, l, 'QB', new Set()).find((r) => !r.onAt)!.a;
    const subbed = drives.map((d) => ({ ...d, subs: [{ team: squad.team.id, from: 0, lineup: { QB: backup.id } }] }));
    const g = gradeGame(squad, away, subbed, share, mulberry32(4));
    expect(g.get(backup.id)?.snaps ?? 0).toBeGreaterThan(plain.get(backup.id)?.snaps ?? 0);
    expect(g.get(l.QB)?.snaps ?? 0).toBe(0);
  });
});
