import { describe, expect, it } from 'vitest';
import { buildStaff, ocAdjust } from './data/coaches';
import { DEF_CALLS } from './data/defenses';
import { buildSquad, onField } from './data/depth';
import { defIdentity } from './data/identity';
import { offIdentity, qbLean, targetShares } from './data/offIdentity';
import { ocBook, ocStyle } from './data/offStyles';
import { overall, SLOT_POS } from './data/positions';
import { PLAYBOOK } from './data/plays';
import { teamById, type RosterPlayer } from './data/teams';
import { mulberry32 } from './engine/math';
import { ocCall } from './game/cpuOffense';
import { expectMix, newOcBrain, ocObserve } from './game/ocBrain';
import type { Situation } from './game/situation';

const georgia = teamById('georgia');
const roster = onField(buildSquad(georgia));
const oc = buildStaff(georgia).OC;

describe('offIdentity', () => {
  it('is the OC in the chair: the same coach gives the same identity, another coach another taste', () => {
    const a = offIdentity(oc, roster);
    expect(JSON.stringify(offIdentity(oc, roster))).toBe(JSON.stringify(a));
    const other = offIdentity({ id: `${oc.id}-x` }, roster);
    expect(JSON.stringify(other.fam)).not.toBe(JSON.stringify(a.fam));
    for (const f of a.favorites) expect(ocBook(oc).some((p) => p.id === f)).toBe(true);
  });

  it('feeds the best receiver: a better player at a slot gets a bigger share, and the star is the best non-back', () => {
    const base = targetShares(roster);
    expect(Object.values(base).reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    const boosted: Record<string, RosterPlayer> = { ...roster, Z: { ...roster.Z, r: { ...roster.Z.r, rte: 99, cth: 99, spd: 99, cit: 99, rls: 99 } } };
    expect(targetShares(boosted).Z).toBeGreaterThan(base.Z);
    const id = offIdentity(oc, boosted);
    const best = ['X', 'Z', 'SL', 'TE'].sort((p, q) => overall(boosted[q].r, SLOT_POS[q]) - overall(boosted[p].r, SLOT_POS[p]))[0];
    expect(overall(boosted.Z.r, SLOT_POS.Z)).toBeGreaterThan(overall(boosted.X.r, SLOT_POS.X) + 6);
    expect(id.star).toBe(best);
  });

  it("a fast QB leans to running, a statue doesn't", () => {
    const qb = roster.QB;
    const slow = qbLean({ ...qb, r: { ...qb.r, spd: 66, elu: 60 } }, 'pro');
    const fast = qbLean({ ...qb, r: { ...qb.r, spd: 92, elu: 88 } }, 'spreadOption');
    expect(slow.runLean).toBe(0);
    expect(fast.runLean).toBeGreaterThan(0.8);
  });
});

describe('the CPU OC', () => {
  const sit = (down: number, toGo: number, ytg = 60): Situation => ({ down, toGo, yardsToGoal: ytg, secsLeft: 1200, qSecs: 900, finalHalf: false, lead: 0 });
  const plan = { book: ocBook(oc), style: ocStyle(oc), passShare: 0.5, id: offIdentity(oc, roster) };

  it('leans on his go-to plays, more on money downs', () => {
    const count = (s: Situation) => {
      const r = mulberry32(4);
      let n = 0;
      for (let i = 0; i < 3000; i++) if (plan.id.favorites.includes(ocCall(plan, s, r).id)) n++;
      return n;
    };
    const plain = count(sit(1, 10));
    const noTaste = (() => {
      const r = mulberry32(4);
      let n = 0;
      for (let i = 0; i < 3000; i++) if (plan.id.favorites.includes(ocCall({ ...plan, id: undefined }, sit(1, 10), r).id)) n++;
      return n;
    })();
    expect(plain).toBeGreaterThan(noTaste);
    expect(count(sit(2, 6, 15))).toBeGreaterThan(plain);
  });

  it('learns what the defense calls: his read of their calls moves toward what he sees, faster for a sharp OC', () => {
    const def = defIdentity(teamById('alabama'));
    const c0 = DEF_CALLS.find((c) => c.id === 'c0-blitz')!;
    const play = PLAYBOOK[0];
    const learnt = (adjust: number) => {
      const b = newOcBrain({ adjust, scout: 60, qbPrc: 80, def, seed: 3 });
      b.skill = (adjust - 40) / 45; // no game-day form, for the comparison
      const before = expectMix(b, sit(1, 10))['c0-blitz'] ?? 0;
      for (let i = 0; i < 8; i++) {
        ocObserve(b, { play, call: c0, down: 1, toGo: 10, yardsToGoal: 60, gain: 3, lost: false, handedOff: false, target: null, shown: c0.shell });
      }
      return (expectMix(b, sit(1, 10))['c0-blitz'] ?? 0) - before;
    };
    expect(learnt(45)).toBeGreaterThan(0);
    expect(learnt(85)).toBeGreaterThan(learnt(45));
  });

  it('is deterministic: the same brain and stream call the same plays', () => {
    const def = defIdentity(teamById('alabama'));
    const run = () => {
      const b = newOcBrain({ adjust: ocAdjust(oc), scout: oc.r.scout, qbPrc: 80, def, seed: 9 });
      const r = mulberry32(2);
      return Array.from({ length: 40 }, (_, i) => ocCall(plan, sit(1 + (i % 3), 4 + (i % 7)), r, false, b).id).join(',');
    };
    expect(run()).toBe(run());
  });
});
