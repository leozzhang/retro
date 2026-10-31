import { describe, expect, it } from 'vitest';
import { anyCoach, applyCoachDelta, buildHeadCoach, buildStaff, COACH_ROLES, GA, generatedCoach, generatedHeadCoach, parseCoachId } from './data/coaches';
import { TEAMS, teamById } from './data/teams';
import {
  ARCS, archiveCoaches, coachArc, coachCareerOf, programXp, progressCoaches, type Arc,
} from './season/coaching';
import {
  coachNow, fireAssistant, hire, interview, offerChair, outsideFor, poolFor, retireOdds, seenRatings, treeOf, treeScore, userChairs,
} from './season/carousel';
import { advanceOffseason, startOffseason, startToPortal } from './season/offseason';
import { defaultConfig, newSeason, nextSeason, simSeason } from './season/season';
import type { SeasonState } from './season/types';
import { baseRoster, gasFor, headCoachFor, staffFor } from './season/world';
import { buildBoard, entryOdds } from './season/portal';
import { moraleOf } from './season/morale';

const season = (): SeasonState => newSeason({ ...defaultConfig('georgia'), length: 'open' }, 7);

describe('coaches over time', () => {
  it('every coach is rebuilt from his id', () => {
    for (const t of TEAMS) {
      for (const c of Object.values(buildStaff(t))) expect(generatedCoach(c.id)).toBe(c);
    }
    expect(generatedCoach('georgia-xx')).toBeUndefined();
    expect(generatedCoach('nowhere-oc')).toBeUndefined();
    for (const t of TEAMS) {
      expect(t.id).not.toContain('.');
      expect(generatedHeadCoach(`${t.id}-hc`)).toBe(buildHeadCoach(t));
    }
    // An outside hire: rebuilt from his id, the same every time, younger, a year on from the offseason.
    const h = generatedCoach('georgia-wr.2026.2')!;
    expect(parseCoachId(h.id)).toMatchObject({ role: 'WR', year: 2026, n: 2 });
    expect(generatedCoach('georgia-wr.2026.2')).toBe(h);
    expect(h).toMatchObject({ role: 'WR', from: 2027 });
    expect(h.r.teach).toBeDefined();
    expect(anyCoach('georgia-hc.2026.0')!.role).toBe('HC');
    expect(generatedCoach('georgia-hc')).toBeUndefined();
  });

  it('rating changes stay in range and skip ratings he lacks', () => {
    expect(applyCoachDelta({ scout: 97 }, { scout: 5, teach: 3 })).toEqual({ scout: 99 });
    expect(applyCoachDelta({ scout: 50, teach: 2 }, { teach: -9 })).toEqual({ scout: 50, teach: 1 });
  });

  it('a seat and a rating change lay over the generated staff, and survive a save', () => {
    const s = season();
    const alabamaDc = buildStaff(teamById('alabama')).DC;
    (s.teamState.georgia ??= {}).staff = { DC: alabamaDc.id };
    s.coaches = { [alabamaDc.id]: { d: { scout: 4 } } };
    const st = staffFor(s, 'georgia');
    expect(st.DC.id).toBe(alabamaDc.id);
    expect(st.DC.role).toBe('DC');
    expect(st.DC.style).toBe(alabamaDc.style);
    expect(st.DC.r.scout).toBe(alabamaDc.r.scout + 4);
    expect(st.OC).toEqual(buildStaff(teamById('georgia')).OC);
    // His changes go with him: Alabama's chair is still his generated one until it's filled.
    expect(staffFor(s, 'alabama').DC.r.scout).toBe(alabamaDc.r.scout + 4);
    const copy = JSON.parse(JSON.stringify(s)) as SeasonState;
    expect(staffFor(copy, 'georgia')).toEqual(st);
    expect(buildStaff(teamById('georgia')).DC.id).toBe('georgia-dc');
  });

  it('a finished season archives a row for every coach, and staffs carry into the next year a year older', () => {
    const s = season();
    // A swap, so nobody is on two staffs.
    (s.teamState.georgia ??= {}).staff = { WR: 'texas-wr' };
    (s.teamState.texas ??= {}).staff = { WR: 'georgia-wr' };
    simSeason(s);
    const rows = Object.values(s.coachCareers ?? {});
    // Every chair, the head coach's included.
    expect(rows.length).toBe(TEAMS.length * (COACH_ROLES.length + 1));
    const wr = coachCareerOf(s, 'texas-wr')!.seasons[0];
    expect(wr).toMatchObject({ year: s.year, team: 'georgia', role: 'WR' });
    expect(wr.w + wr.l).toBeGreaterThan(0);
    expect(coachCareerOf(s, 'georgia-wr')!.seasons[0].team).toBe('texas');
    archiveCoaches(s);
    expect(coachCareerOf(s, 'texas-wr')!.seasons.length).toBe(1);

    // The season's work for the staffs' growth: level-ups by group add up, and wins over the odds net out.
    for (const t of TEAMS) {
      const ts = s.teamState[t.id]!;
      expect(Object.values(ts.lug ?? {}).reduce((a, b) => a + b, 0)).toBe(ts.lu ?? 0);
    }
    expect(Math.abs(TEAMS.reduce((a, t) => a + (s.teamState[t.id]!.xw ?? 0), 0))).toBeLessThan(0.5);

    const n = nextSeason(s);
    expect(n.coaches).toEqual(progressCoaches(s));
    expect(n.coachCareers).toBe(s.coachCareers);
    const st = staffFor(n, 'georgia');
    expect(st.WR.id).toBe('texas-wr');
    expect(st.OC.age).toBe(buildStaff(teamById('georgia')).OC.age + 1);
  }, 30_000);

  it('coaches grow by arc and age, the same however often it runs', () => {
    let s = season();
    const before = JSON.stringify(s);
    expect(progressCoaches(s)).toEqual(progressCoaches(s));
    expect(JSON.stringify(s)).toBe(before);
    // Eight offseasons with no work: arcs and ages alone.
    for (let y = 0; y < 8; y++) {
      s = { ...s, coaches: progressCoaches(s), year: s.year + 1 };
    }
    const sum = new Map<Arc, [number, number]>();
    for (const t of TEAMS) {
      for (const c of Object.values(staffFor(s, t.id))) {
        for (const v of Object.values(c.r)) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(99);
        }
        const d = Object.values(s.coaches![c.id].d ?? {}).reduce((a, b) => a + b, 0) / Object.keys(c.r).length;
        const x = sum.get(coachArc(c.id)) ?? [0, 0];
        sum.set(coachArc(c.id), [x[0] + d, x[1] + 1]);
      }
    }
    const mean = (a: Arc) => sum.get(a)![0] / sum.get(a)![1];
    for (const a of ARCS) expect(sum.get(a)?.[1]).toBeGreaterThan(30);
    expect(mean('riser')).toBeGreaterThan(mean('steady') + 3);
    expect(mean('steady')).toBeGreaterThan(mean('fading') + 3);
    expect(mean('late')).toBeGreaterThan(mean('plateau'));
    // His tree: a position coach has worked under his coordinator.
    expect(s.coaches!['georgia-qb'].under).toEqual(['georgia-oc', 'georgia-hc']);
    expect(s.coaches!['georgia-oc'].under).toEqual(['georgia-hc']);
    expect(s.coaches!['georgia-qb'].n).toBe(8);
  }, 30_000);

  it('a hirer with high eval picks on worth, one with low eval on reputation', () => {
    let sharp = 0;
    let blind = 0;
    const s = season();
    for (const t of TEAMS) {
      const c = outsideFor(s, t.id, 'OC');
      const best = Math.max(...c.map((x) => x.worth));
      sharp += best - hire(c, 95)!.worth;
      blind += best - hire(c, 30)!.worth;
    }
    expect(sharp).toBe(0);
    expect(blind).toBeGreaterThan(TEAMS.length);
    expect(retireOdds(50)).toBeLessThan(0.01);
    expect(retireOdds(70)).toBeGreaterThan(retireOdds(62));
    expect(retireOdds(80)).toBe(1);
  });

  it('head coach develop and position coach teach set a zero-mean XP multiplier', () => {
    const s = season();
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    for (const pos of ['QB', 'WR', 'DT', 'CB'] as const) expect(mean(TEAMS.map((t) => programXp(s, t.id)(pos)))).toBeCloseTo(1, 2);
    const best = TEAMS.reduce((a, t) => (headCoachFor(s, t.id).r.develop > headCoachFor(s, a.id).r.develop ? t : a));
    expect(mean((['QB', 'HB', 'WR', 'TE', 'OT', 'DE', 'OLB', 'CB'] as const).map((p) => programXp(s, best.id)(p)))).toBeGreaterThan(1.04);
    // A better QB coach lifts the QBs, and only them.
    const better = season();
    better.coaches = { 'georgia-qb': { d: { teach: 25 } } };
    expect(programXp(better, 'georgia')('QB')).toBeGreaterThan(programXp(s, 'georgia')('QB'));
    expect(programXp(better, 'georgia')('WR')).toBeCloseTo(programXp(s, 'georgia')('WR'), 6);
  });

  it('the offseason fires, retires and refills: staffs stay full, nobody on two, the user keeps his job', () => {
    const s = newSeason({ ...defaultConfig('georgia'), length: 'open', delegate: { depthChart: true, gamePlan: true, portal: true } }, 3);
    simSeason(s);
    const copy = JSON.parse(JSON.stringify(s)) as SeasonState;
    startToPortal(s);
    startToPortal(copy);
    expect(JSON.stringify(copy.teamState)).toBe(JSON.stringify(s.teamState));
    const gone = Object.entries(s.coaches ?? {}).filter(([, p]) => p.gone);
    expect(gone.length).toBeGreaterThan(20);
    const heads = gone.filter(([id]) => parseCoachId(id)!.role === 'HC');
    expect(heads.length).toBeGreaterThan(4);
    expect(heads.length).toBeLessThan(40);
    expect(headCoachFor(s, 'georgia').id).toBe('georgia-hc');
    const seen = new Set<string>();
    for (const t of TEAMS) {
      const chairs = [headCoachFor(s, t.id), ...Object.values(staffFor(s, t.id))];
      expect(chairs.length).toBe(COACH_ROLES.length + 1);
      for (const c of chairs) {
        expect(seen.has(c.id)).toBe(false);
        expect(s.coaches?.[c.id]?.gone).toBeUndefined();
        seen.add(c.id);
      }
    }
    expect(s.news.some((n) => n.kind === 'carousel')).toBe(true);
    expect(s.offseason?.stage).toBe('portal');
    // The market moved FBS coaches between programs, not only outside hires, and the head coach chain made the news.
    const movers = [...seen].filter((id) => !id.includes('.') && !s.coaches?.[id]?.at?.startsWith(`${parseCoachId(id)!.team}:`));
    expect(movers.length).toBeGreaterThan(10);
    expect(s.news.some((n) => n.text.startsWith('HIRED:'))).toBe(true);
    for (const id of seen) if (!id.includes('.')) expect(s.coaches?.[id]?.rep).toBeDefined();
    // Turnover runs once: opening the offseason again does nothing.
    const once = JSON.stringify(s.coaches);
    startToPortal(s);
    expect(JSON.stringify(s.coaches)).toBe(once);
  }, 30_000);

  it('the user hires: fog that interviews clear, a motive revealed, an offer, and a full staff at the close', () => {
    const s = newSeason({ ...defaultConfig('georgia'), length: 'open', delegate: { depthChart: true, gamePlan: true, portal: true } }, 5);
    simSeason(s);
    startOffseason(s);
    expect(s.offseason).toMatchObject({ stage: 'carousel', round: 1 });
    expect(fireAssistant(s, 'WR')).toBe(true);
    expect(fireAssistant(s, 'WR')).toBe(false);
    const chair = 'georgia:WR';
    expect(userChairs(s)).toContain(chair);
    const pool = poolFor(s, chair);
    expect(pool.length).toBeGreaterThan(4);
    const c = pool[0];
    const wide = seenRatings(s, c.id, 'WR');
    expect(wide.every((x) => x.hi - x.lo >= 2)).toBe(true);
    const left = s.carousel!.talksLeft;
    expect(interview(s, c.id)).toBe(true);
    expect(interview(s, c.id)).toBe(true);
    expect(interview(s, c.id)).toBe(false);
    expect(s.carousel!.talksLeft).toBe(left - 2);
    const sharp = seenRatings(s, c.id, 'WR');
    const truth = coachNow(s, c.id, 'WR').r as unknown as Record<string, number>;
    for (const x of sharp) expect(x.lo === x.hi && x.lo === truth[x.k]).toBe(true);
    // An outside candidate always takes the job.
    const outside = pool.find((x) => x.from === 'outside')!;
    expect(offerChair(s, chair, outside.id)).toBe(true);
    let n = s;
    while (n.offseason?.stage === 'carousel') n = advanceOffseason(n);
    expect(staffFor(n, 'georgia').WR.id).toBe(outside.id);
    expect(userChairs(n)).toEqual([]);
    expect(n.portal).toBeDefined();
  }, 30_000);

  it('players react when their coach leaves: morale drops and the portal pulls', () => {
    const base = newSeason({ ...defaultConfig('georgia'), length: 'open', delegate: { depthChart: true, gamePlan: true, portal: true } }, 9);
    simSeason(base);
    const run = (fire: boolean) => {
      const s = JSON.parse(JSON.stringify(base)) as SeasonState;
      startOffseason(s);
      if (fire) fireAssistant(s, 'WR');
      s.config.delegate.carousel = true;
      while (s.offseason?.stage === 'carousel') advanceOffseason(s);
      return s;
    };
    const kept = run(false);
    const fired = run(true);
    const wrs = baseRoster(fired, 'georgia').filter((a) => a.pos === 'WR');
    const board = buildBoard(fired);
    const keptBoard = buildBoard(kept);
    let up = 0;
    for (const a of wrs) {
      const cl = fired.teamState.georgia.progress?.[a.id]?.cl;
      expect(cl).toMatchObject({ year: fired.year, role: 'WR' });
      expect(cl!.bond).toBeGreaterThan(0.3);
      expect(moraleOf(fired.teamState.georgia, a)).toBeLessThan(moraleOf(kept.teamState.georgia, a));
      if (entryOdds(fired, board, a.id).p > entryOdds(kept, keptBoard, a.id).p) up++;
    }
    expect(up).toBe(wrs.length);
    expect(fired.carousel!.was).toBeUndefined();
    expect(fired.news.some((n) => n.text.includes("position coach's departure"))).toBe(true);
  }, 60_000);

  it('graduate assistants: generated, growing, promoted from within, and replaced', () => {
    const s0 = season();
    const gas = gasFor(s0, 'georgia');
    expect(gas.length).toBe(GA.slots);
    for (const id of gas) {
      const p = parseCoachId(id)!;
      expect(p.ga).toBe(true);
      const c = generatedCoach(id)!;
      expect(c.age).toBeLessThanOrEqual(GA.age[1]);
      expect(c.r.teach).toBeDefined();
    }
    const grown = progressCoaches(s0);
    for (const id of gas) expect(grown[id].under).toEqual([staffFor(s0, 'georgia')[parseCoachId(id)!.role as 'QB'].id, 'georgia-hc']);

    const s = newSeason({ ...defaultConfig('georgia'), length: 'open', delegate: { depthChart: true, gamePlan: true, portal: true } }, 5);
    simSeason(s);
    startOffseason(s);
    fireAssistant(s, 'WR');
    const ga = poolFor(s, 'georgia:WR').find((c) => c.from === 'ga')!;
    expect(ga).toBeDefined();
    expect(offerChair(s, 'georgia:WR', ga.id)).toBe(true);
    let n = s;
    while (n.offseason?.stage === 'carousel') n = advanceOffseason(n);
    expect(staffFor(n, 'georgia').WR.id).toBe(ga.id);
    const after = gasFor(n, 'georgia');
    expect(after.length).toBe(GA.slots);
    expect(after).not.toContain(ga.id);
    expect(after.some((id) => id.includes(`.${n.year}.ga`))).toBe(true);
  }, 60_000);

  it('a coaching tree: coaches who worked under you, scored by where they are now', () => {
    const s = season();
    s.coaches = progressCoaches(s);
    expect(treeOf(s, 'georgia-hc')).toEqual([]);
    // Georgia's OC takes the Texas job, its DC Alabama's defense.
    (s.teamState.texas ??= {}).staff = { HC: 'georgia-oc' };
    (s.teamState.alabama ??= {}).staff = { DC: 'georgia-dc' };
    (s.teamState.georgia ??= {}).staff = { OC: 'texas-hc', DC: 'alabama-dc' };
    const tree = treeOf(s, 'georgia-hc');
    expect(tree.map((x) => x.id).sort()).toEqual(['georgia-dc', 'georgia-oc']);
    expect(treeScore(tree)).toBe(4);
  });

  it('a move restarts his years in the chair', () => {
    const s = season();
    s.coaches = progressCoaches(s);
    (s.teamState.georgia ??= {}).staff = { WR: 'texas-wr' };
    (s.teamState.texas ??= {}).staff = { WR: 'georgia-wr' };
    const next = progressCoaches(s);
    expect(next['texas-wr']).toMatchObject({ at: 'georgia:WR', t: 1, n: 2 });
    expect(next['texas-oc'].t).toBe(s.coaches['texas-oc'].t! + 1);
  });
});
