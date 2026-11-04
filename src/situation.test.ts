import { describe, expect, it } from 'vitest';
import { buildSquad } from './data/depth';
import { defIdentity, preventLevel, situationDials, situationMix, shellShares, pressureShare } from './data/identity';
import { teamById } from './data/teams';
import { mulberry32 } from './engine/math';
import { simulateDrive, type SimPlay } from './game/rules';
import { desperate, fourthDown, kickNow, passOdds, tempo, type Situation } from './game/situation';
import { castSnap, type Lineup } from './season/cast';
import { lineupOf } from './season/simGame';
import { autoGamePlan } from './season/staff';

const sit = (o: Partial<Situation>): Situation => ({
  down: 1, toGo: 10, yardsToGoal: 60, secsLeft: 900, qSecs: 900, finalHalf: true, lead: 0, ...o,
});
const never = () => {
  throw new Error('no roll expected');
};

describe('situation: the CPU offense', () => {
  it('overtime, going second: a field goal only when it ties or wins', () => {
    expect(fourthDown(sit({ down: 4, toGo: 5, yardsToGoal: 20, secsLeft: Infinity, lead: -7, ot: 'second' }), never)).toBe('go');
    expect(fourthDown(sit({ down: 4, toGo: 5, yardsToGoal: 20, secsLeft: Infinity, lead: -3, ot: 'second' }), never)).toBe('fg');
    expect(fourthDown(sit({ down: 4, toGo: 5, yardsToGoal: 20, secsLeft: Infinity, lead: 0, ot: 'first' }), never)).toBe('fg');
    // No punts in overtime.
    expect(fourthDown(sit({ down: 4, toGo: 9, yardsToGoal: 45, secsLeft: Infinity, lead: 0, ot: 'first' }), never)).toBe('go');
  });

  it('late in the 4th: kick only if the points help, go when a punt is giving up', () => {
    expect(fourthDown(sit({ down: 4, toGo: 6, yardsToGoal: 20, secsLeft: 90, lead: -7 }), never)).toBe('go');
    expect(fourthDown(sit({ down: 4, toGo: 6, yardsToGoal: 20, secsLeft: 90, lead: -2 }), never)).toBe('fg');
    expect(fourthDown(sit({ down: 4, toGo: 6, yardsToGoal: 20, secsLeft: 400, lead: -7 }), never)).toBe('fg');
    expect(fourthDown(sit({ down: 4, toGo: 8, yardsToGoal: 70, secsLeft: 60, lead: -4 }), never)).toBe('go');
    expect(fourthDown(sit({ down: 4, toGo: 8, yardsToGoal: 70, secsLeft: 60, lead: 3 }), never)).toBe('punt');
  });

  it('the last snap: a kick that ties, a heave that has to score', () => {
    expect(kickNow(sit({ down: 2, yardsToGoal: 25, secsLeft: 8, lead: -3 }))).toBe(true);
    expect(kickNow(sit({ down: 2, yardsToGoal: 25, secsLeft: 8, lead: -7 }))).toBe(false);
    expect(desperate(sit({ down: 1, yardsToGoal: 30, secsLeft: 8, lead: -7 }))).toBe(false);
    expect(desperate(sit({ down: 1, yardsToGoal: 45, secsLeft: 8, lead: -7 }))).toBe(true);
    expect(desperate(sit({ down: 1, yardsToGoal: 45, secsLeft: 8, lead: 7 }))).toBe(false);
  });

  it('tempo: kneel out a lead, hurry when behind, milk ahead in the 4th', () => {
    expect(tempo(sit({ down: 1, secsLeft: 80, lead: 4 }))).toBe('kneel');
    expect(tempo(sit({ down: 1, secsLeft: 300, lead: 4 }))).toBe('milk');
    expect(tempo(sit({ down: 1, secsLeft: 100, lead: -4 }))).toBe('hurry');
    expect(tempo(sit({ down: 1, secsLeft: 100, lead: -4, finalHalf: false }))).toBe('hurry');
    expect(tempo(sit({ down: 1, secsLeft: 1500, lead: -4 }))).toBe('normal');
    expect(passOdds(0.5, sit({ down: 3, toGo: 9 }))).toBeGreaterThan(0.5);
    expect(passOdds(0.5, sit({ down: 1, secsLeft: 400, lead: 7 }))).toBeLessThan(0.5);
  });

  it('a drive in overtime down 7 never settles for a field goal', () => {
    let fgs = 0;
    let goes = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const plays: SimPlay[] = [];
      const d = simulateDrive(80, 80, 75, mulberry32(seed), { timeLeft: Infinity, hurry: false, milk: false, lead: -7, ot: 'second' }, (p) => plays.push(p));
      if (d.result === 'FIELD GOAL' || d.result === 'MISSED FG' || d.result === 'PUNT') fgs++;
      if (plays.some((p) => p.down === 4 && !p.fg)) goes++;
    }
    expect(fgs).toBe(0);
    expect(goes).toBeGreaterThan(20);
  });

  it('a drive with a 4-point lead and a minute left kneels it out', () => {
    const d = simulateDrive(80, 80, 30, mulberry32(3), { timeLeft: 60, hurry: false, milk: false, lead: 4, qSecs: 900 });
    expect(d.result).toBe('END OF HALF');
    expect(d.yards).toBeLessThan(0);
  });
});

describe('situation: the defense', () => {
  const id = defIdentity(teamById('georgia'));
  it('no clock and score: the same dials as before', () => {
    expect(situationDials(id, 1, 10, 60)).toEqual(situationDials(id, 1, 10, 60, sit({ secsLeft: 1500 })));
    expect(situationMix(id, 1, 10)).toBe(id.mix);
  });

  it('prevent against a late score: two-high, little pressure', () => {
    const late = sit({ secsLeft: 30, lead: -5, yardsToGoal: 60 });
    expect(preventLevel(late)).toBeGreaterThan(0.5);
    expect(preventLevel(sit({ secsLeft: 30, lead: 5 }))).toBe(0);
    expect(preventLevel(sit({ secsLeft: 30, lead: -5, yardsToGoal: 15 }))).toBe(0);
    const prev = situationMix(id, 1, 10, 60, undefined, false, late);
    expect(shellShares(prev)['two-high']).toBeGreaterThan(shellShares(id.mix)['two-high'] + 0.15);
    expect(pressureShare(prev)).toBeLessThan(pressureShare(id.mix));
  });

  it('inches: a heavier box than 3rd and 2', () => {
    expect(situationDials(id, 4, 0.4, 50).box).toBeGreaterThan(situationDials(id, 4, 2, 50).box);
  });
});

describe('casting', () => {
  const uga = buildSquad(teamById('georgia'));
  const bama = buildSquad(teamById('alabama'));
  const base = lineupOf(uga, autoGamePlan(uga, bama));
  const def = lineupOf(bama, autoGamePlan(bama, uga));
  const snap = (gain: number, o: Partial<SimPlay> = {}): SimPlay => ({ gain, explosive: gain >= 20, turnover: false, down: 1, toGo: 10, yard: 30, t: 0, lev: 0, ...o });
  const tune = (l: Lineup, slot: string, d: Partial<Record<'spd' | 'rte' | 'cth' | 'mcv' | 'zcv', number>>): Lineup => ({
    ...l, on: { ...l.on, [slot]: { ...l.on[slot], r: { ...l.on[slot].r, ...d } } },
  });

  it('a faster, sharper X gets more of the long catches, not all of them', () => {
    const r = base.on.Z.r;
    const even = tune(tune(base, 'X', { spd: r.spd, rte: r.rte, cth: r.cth }), 'Z', {});
    const star = tune(even, 'X', { spd: r.spd + 15, rte: r.rte + 15 });
    const share = (l: Lineup) => {
      const rng = mulberry32(5);
      let x = 0;
      let n = 0;
      for (let i = 0; i < 4000; i++) {
        const c = castSnap(snap(30), l, def, 0.5, rng);
        if (c?.kind !== 'catch') continue;
        n++;
        if (c.who?.slot === 'X') x++;
      }
      return x / n;
    };
    const a = share(even);
    const b = share(star);
    expect(b).toBeGreaterThan(a * 1.3);
    expect(b).toBeLessThan(0.7);
  });

  it('interceptions lean to the corner with the best hands and coverage', () => {
    const good = tune(tune(def, 'CB1', { cth: 90, mcv: 92, zcv: 92 }), 'CB2', { cth: 60, mcv: 70, zcv: 70 });
    const rng = mulberry32(9);
    const by: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const c = castSnap(snap(0, { turnover: true, heave: true }), base, good, 0.5, rng);
      if (c?.by) by[c.by.slot] = (by[c.by.slot] ?? 0) + 1;
    }
    expect(by.CB1).toBeGreaterThan(by.CB2 * 1.8);
  });

  it('long gains lean to the pass, losses of 3+ on a pass are sacks', () => {
    const rng = mulberry32(2);
    let deepPass = 0;
    let sacks = 0;
    for (let i = 0; i < 2000; i++) {
      if (castSnap(snap(35), base, def, 0.5, rng)?.pass) deepPass++;
      const c = castSnap(snap(-6), base, def, 0.5, rng);
      if (c?.pass) {
        expect(c.kind).toBe('sack');
        sacks++;
      }
    }
    expect(deepPass / 2000).toBeGreaterThan(0.7);
    expect(sacks).toBeGreaterThan(0);
  });
});
