import { describe, expect, it } from 'vitest';
import { buildStaff, dcAdjust } from './data/coaches';
import { buildSquad, onField } from './data/depth';
import { defIdentity } from './data/identity';
import { ocBook, ocStyle } from './data/offStyles';
import { teamById, type Team } from './data/teams';
import { mulberry32 } from './engine/math';
import { ocCall } from './game/cpuOffense';
import { newBrain } from './game/defBrain';
import { engineDrive, engineSnap, engineTry, type EngineSide, type EngineSnap } from './game/engineDrive';
import { engineCredit } from './season/cast';
import { creditCpuDrive, newLiveBox } from './season/liveBox';
import { starters } from './data/depth';
import { ourLine } from './game/defBrain';
import type { SimPlay } from './game/rules';
import { clutchRoster, leverage, shakenAimLag } from './data/confidence';
import { FIELD_W } from './engine/constants';
import { rosterRead } from './game/offModel';
import type { DriveClock } from './game/rules';
import type { Situation } from './game/situation';
import { engineDcBrain, engineGame, enginePart, mopupLine, MOPUP, type SnapWatch } from './season/engineGame';
import { twosSquad } from './data/depth';
import { newStory } from './season/story';
import { pickGame } from './game/keyPlays';
import type { DriveLog } from './season/types';

function side(t: Team): EngineSide {
  const staff = buildStaff(t);
  return { team: t, roster: onField(buildSquad(t)), oc: { book: ocBook(staff.OC), style: ocStyle(staff.OC), passShare: 0.5 }, ident: defIdentity(t, staff.DC) };
}

const clock: DriveClock = { timeLeft: 1800, hurry: false, milk: false, lead: 0, finalHalf: false, qSecs: 900 };

describe('engineDrive', () => {
  const off = side(teamById('georgia'));
  const def = side(teamById('alabama'));
  const brain = () => {
    const dc = buildStaff(def.team).DC;
    return newBrain({ iq: 'NORMAL', adjust: dcAdjust(dc), scout: dc.r.scout, qbMobility: 0, seed: 5, book: off.oc.book, style: off.oc.style, roster: rosterRead(off.roster) });
  };
  const summary = (seed: number) => {
    const d = engineDrive(off, def, 25, mulberry32(seed), clock, { brain: brain() });
    return { ...d, snaps: d.snaps.map((s) => [s.play.id, s.call.id, s.gain, s.type, s.target, s.secs]) };
  };

  it('plays the same drive for the same seed', () => {
    for (const seed of [1, 2, 3]) expect(JSON.stringify(summary(seed))).toBe(JSON.stringify(summary(seed)));
  });

  it("adds up: the snaps' gains make the drive's yards, and a touchdown is 7", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = engineDrive(off, def, 25, mulberry32(seed), clock, { brain: brain() });
      expect(d.snaps.length).toBeGreaterThan(0);
      expect(d.plays).toBe(d.snaps.length);
      if (d.result === 'TOUCHDOWN') expect(d.points).toBe(7);
      else expect(d.points).toBe(d.result === 'FIELD GOAL' ? 3 : 0);
      if (d.result === 'TURNOVER' || d.defPoints) continue;
      const sum = d.snaps.reduce((s, x) => s + x.gain, 0);
      // Each snap's gain is rounded from the spot, so the sum can drift by a yard here and there.
      expect(Math.abs(sum - d.yards)).toBeLessThanOrEqual(1 + d.snaps.length / 2);
    }
  });
});

describe('engine drives in a played game (Phase 3)', () => {
  const off = side(teamById('georgia'));
  const def = side(teamById('alabama'));
  const offOn = starters(buildSquad(off.team));
  const defOn = starters(buildSquad(def.team));
  const brain = () => {
    const dc = buildStaff(def.team).DC;
    return newBrain({ iq: 'NORMAL', adjust: dcAdjust(dc), scout: dc.r.scout, qbMobility: 0, seed: 5, book: off.oc.book, style: off.oc.style, roster: rosterRead(off.roster) });
  };
  const run = (seed: number, record: boolean) => {
    const plays: SimPlay[] = [];
    const snaps: (EngineSnap | undefined)[] = [];
    const d = engineDrive(off, def, 25, mulberry32(seed), clock, { brain: brain(), record, onPlay: (p, s) => (plays.push(p), snaps.push(s)) });
    return { d, plays, snaps };
  };

  it('watching changes nothing: a drive on tape plays exactly as one off it, and every snap has its tape', () => {
    for (const seed of [1, 4, 9, 12]) {
      const a = run(seed, false);
      const b = run(seed, true);
      const key = (r: ReturnType<typeof run>) => JSON.stringify([r.d.result, r.d.points, r.d.secs, r.plays]);
      expect(key(b)).toBe(key(a));
      for (const s of b.d.snaps) expect(s.tape?.frames.length).toBeGreaterThan(10);
      for (const s of a.d.snaps) expect(s.tape).toBeUndefined();
    }
  });

  it("credits the players who made each snap: the box score's catches, picks and sacks are the engine's", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { d, plays, snaps } = run(seed, false);
      expect(snaps.filter(Boolean).length).toBe(d.snaps.length);
      plays.forEach((p, i) => {
        const s = snaps[i];
        const c = engineCredit(p, s, offOn, defOn);
        if (p.fg || p.punt) return expect(c).toBeNull();
        if (!s) return expect(c?.kind).toBe('kneel');
        if (s.type === 'int' || s.type === 'pick6') expect(c?.kind).toBe('int');
        else if (s.lostFumble) expect(c?.kind).toBe('fumble');
        else if (s.type === 'sack') expect([c?.kind, c?.who?.slot]).toEqual(['sack', 'QB']);
        else if (s.complete) expect([c?.kind, c?.who?.slot]).toEqual(['catch', s.carrier]);
        else if (s.thrown) expect(c?.kind).toBe('inc');
        else expect([c?.kind, c?.who?.slot]).toEqual(['run', s.carrier]);
      });
    }
  });

  it("the box score is the snaps': every throw an attempt, no made-up incompletions, the yards add up", () => {
    const box = newLiveBox({ id: def.team.id, on: defOn }, { id: off.team.id, on: offOn }, mulberry32(1), { home: off.team.id, away: def.team.id });
    let att = 0, cmp = 0, passYds = 0, yards = 0, sacks = 0, ints = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { d, plays, snaps } = run(seed, false);
      creditCpuDrive(box, d, plays, plays.map((p, i) => engineCredit(p, snaps[i], offOn, defOn)));
      yards += d.yards;
      for (const s of d.snaps) {
        if (s.type === 'int' || s.type === 'pick6') (att++, ints++);
        else if (s.type === 'sack') sacks++;
        else if (s.thrown && !s.lostFumble) {
          att++;
          if (s.complete) (cmp++, (passYds += Math.min(s.gain, 100 - s.yard)));
        }
      }
    }
    const qb = [...box.cpu.lines.values()].find((l) => l.pos === 'QB')!;
    expect([qb.att, qb.cmp, qb.int, qb.passYds]).toEqual([att, cmp, ints, passYds]);
    expect(box.cpu.tl.yards).toBe(yards);
    expect([...box.user.lines.values()].reduce((a, l) => a + l.sk, 0)).toBeLessThanOrEqual(sacks);
  });

  it('a two-point try is one snap from the 3, the same for the same stream, good only on a score', () => {
    const sit: Situation = { down: 1, toGo: 3, yardsToGoal: 3, secsLeft: 600, qSecs: 900, finalHalf: true, lead: -2 };
    let good = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const a = engineTry(off, def, sit, mulberry32(seed), { brain: null });
      const b = engineTry(off, def, sit, mulberry32(seed), { brain: null });
      expect(JSON.stringify(b.play)).toBe(JSON.stringify(a.play));
      expect(a.good).toBe(a.snap.type === 'td');
      expect(a.play.yard).toBe(97);
      if (a.good) good++;
    }
    expect(good).toBeGreaterThan(3);
    expect(good).toBeLessThan(22);
  });

  it("the user's DC speaks for his own defense", () => {
    expect(ourLine("THEY'RE SITTING ON YOUR THROW TO YOUR X")).toBe("WE'RE SITTING ON THEIR THROW TO THEIR X");
    expect(ourLine("TWO DEEP: THEY WON'T LET YOU GO OVER THE TOP")).toBe("TWO DEEP: WE WON'T LET THEM GO OVER THE TOP");
    expect(ourLine('THEIR ENDS ARE PLAYING CONTAIN')).toBe('OUR ENDS ARE PLAYING CONTAIN');
  });
});

describe('engine snaps play like a played game', () => {
  it("a shaken QB's 3rd down: his nerves are aim lag, everyone's ratings shift by confidence at the leverage", () => {
    const off = side(teamById('georgia'));
    const def = side(teamById('alabama'));
    const shaken = { ...off, roster: { ...off.roster, QB: { ...off.roster.QB, conf: -0.8 }, X: { ...off.roster.X, conf: 0.8 } } };
    const lev = leverage(3, 60, true);
    const sit = { down: 3, toGo: 7, yardsToGoal: 60, secsLeft: 300, qSecs: 900, finalHalf: true, lead: -3 };
    const { play } = engineSnap(shaken, def, { los: 50, ballY: FIELD_W / 2, down: 3, firstDownX: 57 }, sit, mulberry32(3), null, { lev });
    expect(play.aimNerves).toBeCloseTo(shakenAimLag(-0.8, lev));
    expect(play.aimNerves).toBeGreaterThan(0);
    const want = clutchRoster(shaken.roster, lev, true);
    const x = play.off.find((p) => p.slot === 'X')!;
    expect(x.r.spd).toBe(want.X.r.spd);
    expect(want.X.r.rte).toBeGreaterThan(off.roster.X.r.rte);
  });
});

describe('ocCall', () => {
  const t = teamById('georgia');
  const staff = buildStaff(t);
  const oc = { book: ocBook(staff.OC), style: ocStyle(staff.OC), passShare: 0.5 };
  const sit = (down: number, toGo: number): Situation => ({ down, toGo, yardsToGoal: 60, secsLeft: 1200, qSecs: 900, finalHalf: false, lead: 0 });

  it('calls from his book, and short-yardage plays only on short yardage', () => {
    const r = mulberry32(9);
    const book = new Set(oc.book);
    for (let i = 0; i < 400; i++) {
      const p = ocCall(oc, sit(1, 10), r);
      expect(book.has(p)).toBe(true);
      expect(p.short).toBeFalsy();
    }
  });

  it('throws more on 3rd and long than on 3rd and 1', () => {
    const r = mulberry32(11);
    const passes = (down: number, toGo: number) => {
      let n = 0;
      for (let i = 0; i < 600; i++) if (['quick', 'dropback', 'shot', 'screen', 'pa', 'boot', 'rpo'].includes(ocCall(oc, sit(down, toGo), r).tags.family)) n++;
      return n;
    };
    expect(passes(3, 9)).toBeGreaterThan(passes(3, 1));
  });
});

describe('the engine game: the user\'s simulated games (Phase 4)', () => {
  const team = (id: string) => {
    const t = teamById(id);
    const st = buildStaff(t);
    return { squad: buildSquad(t), oc: st.OC, dc: st.DC, passShare: 0.5 };
  };

  it('watching changes nothing; the box score and the story add up to the final', () => {
    for (const seed of [1, 2, 3, 4]) {
      const plain = engineGame(team('georgia'), team('alabama'), mulberry32(seed));
      const story = newStory('georgia', 'alabama');
      const watch: SnapWatch = new Map();
      const drives: DriveLog[] = [];
      const r = engineGame(team('georgia'), team('alabama'), mulberry32(seed), { story, watch, record: true, drives });
      expect(JSON.stringify(r)).toBe(JSON.stringify(plain));
      expect(r.home).toBe(r.box.home.points);
      expect(r.away).toBe(r.box.away.points);
      expect(r.home).not.toBe(r.away);
      // Every snap the story tells is the engine's, on tape.
      const snaps = story.drives.flatMap((d) => d.plays.filter((p) => !p.fg && !p.punt && !p.kneel));
      expect(snaps.every((p) => watch.get(p)?.tape)).toBe(true);
      // The game page's scoring plays add up to the final, the last one's score is it, and only a score reaches the goal.
      const last = r.plays!.filter((p) => p.pts).at(-1)!;
      expect(last.score).toEqual([r.home, r.away]);
      expect(r.plays!.reduce((t, p) => t + p.pts, 0)).toBe(r.home + r.away);
      for (const d of story.drives) d.plays.forEach((p, i) => p.yard + p.gain >= 100 && !d.try && expect((i === d.plays.length - 1 && d.result === 'TOUCHDOWN') || p.turnover).toBe(true));
      // Every pass is a real snap: attempts are the passes the story logs (a try is no stat).
      const att = r.box.players.reduce((n, l) => n + l.att, 0);
      const thrown = story.drives.filter((d) => !d.try).reduce((n, d) => n + d.credit.snaps.filter((c) => c && (c.kind === 'catch' || c.kind === 'inc' || c.kind === 'int')).length, 0);
      expect(att).toBe(thrown);
      expect(drives.length).toBeGreaterThan(15);
      // EVERY SNAP picks them all.
      expect(pickGame(story, 'all').length).toBe(story.drives.reduce((n, d) => n + d.plays.filter((p) => !p.punt && !p.kneel).length, 0));
    }
  });

  it('a part hands the field the right quarter, and the brains it was given go on learning', () => {
    for (const to of [2, 3, 4]) {
      const u = team('texas');
      const c = team('oklahoma');
      const brain = engineDcBrain(c, u, 5);
      const before = JSON.stringify(brain);
      const r = enginePart(u, { ...c, dcBrain: brain }, true, 15, to, mulberry32(to));
      expect(JSON.stringify(brain)).not.toBe(before);
      if (to === 3) expect(r.next.kind).toBe('halftime');
      else {
        expect(r.quarter).toBe(to);
        expect(r.time).toBe(900);
      }
      expect(r.user).toBe(r.box.home.points);
      expect(r.cpu).toBe(r.box.away.points);
    }
  });
});

describe('garbage time (MOPUP)', () => {
  const team = (id: string) => {
    const t = teamById(id);
    const st = buildStaff(t);
    return { squad: buildSquad(t), oc: st.OC, dc: st.DC, passShare: 0.5 };
  };

  it('the line falls as the second half runs, and shorter quarters scale it down', () => {
    let last = Infinity;
    for (let f = 1; f >= 0; f -= 0.05) {
      const l = mopupLine(f, 900);
      expect(l).toBeLessThanOrEqual(last + 1e-9);
      last = l;
    }
    expect(mopupLine(1, 900)).toBe(MOPUP.lead[0][1]);
    expect(mopupLine(0.5, 480)).toBeLessThan(mopupLine(0.5, 900));
  });

  it('the twos are everyone but the kicker and punter', () => {
    const sq = buildSquad(teamById('georgia'));
    const a = starters(sq);
    const b = starters(twosSquad(sq));
    for (const slot of Object.keys(a)) {
      if (slot === 'K' || slot === 'P') expect(b[slot].id).toBe(a[slot].id);
      else expect(b[slot].id).not.toBe(a[slot].id);
    }
  });

  it('a blowout puts the twos in: they get the stats and the grades, and it draws nothing', async () => {
    const { gradeGame } = await import('./season/grades');
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const drives: DriveLog[] = [];
      const plain = engineGame(team('georgia'), team('kentstate'), mulberry32(seed));
      const r = engineGame(team('georgia'), team('kentstate'), mulberry32(seed), { drives, story: newStory('georgia', 'kentstate'), record: true });
      expect(JSON.stringify(r)).toBe(JSON.stringify(plain));
      const mop = drives.filter((d) => d.mop?.includes('georgia'));
      if (!mop.length) continue;
      seen++;
      // Never before the second half: the score at the first twos drive was big.
      const sq = buildSquad(teamById('georgia'));
      const first = new Set(Object.values(starters(sq)).map((a) => a.id));
      const twos = new Set(Object.values(starters(twosSquad(sq))).map((a) => a.id));
      const lines = r.box.players.filter((l) => l.team === 'georgia');
      expect(lines.some((l) => twos.has(l.id) && !first.has(l.id) && (l.att + l.rush + l.rec) > 0)).toBe(true);
      const g = gradeGame(sq, buildSquad(teamById('kentstate')), drives, { georgia: 0.5, kentstate: 0.5 }, mulberry32(9));
      expect([...g.entries()].some(([id, gr]) => !first.has(id) && gr.snaps > 5)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
