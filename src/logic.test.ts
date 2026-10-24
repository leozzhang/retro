import { describe, expect, it } from 'vitest';
import { Camera, project, unproject } from './engine/camera';
import { mulberry32 } from './engine/math';
import {
  advanceSim, afterPlay, clockText, newClock, penaltySpot, playClockText, readyForPlay, tickBetween, tickLive, type Clock,
} from './game/clock';
import { DEF_CALLS } from './data/defenses';
import { ACE, EMPTY, FORMATIONS, GUN_TRIPS, I_FORM, PLAYBOOK, type Formation, type PlayDef } from './data/plays';
import { generateRoster, TEAMS } from './data/teams';
import { HASH_BOT, HASH_TOP, STEP } from './engine/constants';
import type { Input } from './engine/input';
import { handoffKind, Play } from './game/playState';
import { alignY, personnelOf, resolvePlay } from './game/resolvePlay';
import {
  applyKick, applyOutcome, applyTry, downDistance, fieldLabel, simulateDrive, startDrive, type KickOutcome, type PlayOutcome,
} from './game/rules';
import { CALM, fgCheck, fgDistance, POSTS_X, POSTS_Y, predictKick, UPRIGHT_HALF, type BounceProfile } from './sim/kicking';
import { flightPos, passParams } from './sim/ball';
import { catchOdds } from './sim/catching';
import { tackleChance } from './sim/tackling';

const out = (type: PlayOutcome['type'], spot: number): PlayOutcome => ({ type, spot, spotY: 26, text: '', sub: '', color: '' });

describe('camera', () => {
  it('round-trips world <-> screen', () => {
    const s = project(30, 47.5, 12.25);
    const w = unproject(30, s.x, s.y);
    expect(w.x).toBeCloseTo(47.5);
    expect(w.y).toBeCloseTo(12.25);
  });
  it('lifts airborne objects up the screen', () => {
    expect(project(0, 10, 10, 3).y).toBeLessThan(project(0, 10, 10, 0).y);
  });
});

describe('ball flight', () => {
  it('starts and ends on the endpoints, peaking in the middle', () => {
    const from = { x: 30, y: 20, z: 2 };
    const to = { x: 60, y: 30, z: 1.2 };
    expect(flightPos(from, to, 5, 0)).toEqual(from);
    const end = flightPos(from, to, 5, 1);
    expect(end.x).toBeCloseTo(60);
    expect(end.z).toBeCloseTo(1.2);
    expect(flightPos(from, to, 5, 0.5).z).toBeCloseTo(1.6 + 5);
  });
  it('longer throws hang longer and higher; stronger arms are faster', () => {
    const short = passParams(10, 85);
    const deep = passParams(45, 85);
    expect(deep.dur).toBeGreaterThan(short.dur);
    expect(deep.peak).toBeGreaterThan(short.peak);
    expect(passParams(40, 95).dur).toBeLessThan(passParams(40, 70).dur);
  });
});

describe('catching', () => {
  it('wide-open receiver under the ball almost always catches it', () => {
    expect(catchOdds({ pos: 1, cth: 90 }, null).catch).toBeGreaterThan(0.9);
  });
  it('nobody near the ball means no catch and no pick', () => {
    expect(catchOdds(null, null)).toEqual({ catch: 0, int: 0 });
  });
  it('a lone defender under the ball has a real interception chance', () => {
    const o = catchOdds(null, { pos: 1, cth: 70, awr: 85 });
    expect(o.catch).toBe(0);
    expect(o.int).toBeGreaterThan(0.3);
  });
  it('contested balls are roughly coin flips, worse than open ones', () => {
    const open = catchOdds({ pos: 1, cth: 85 }, null).catch;
    const contested = catchOdds({ pos: 1, cth: 85 }, { pos: 1, cth: 65, awr: 80 }).catch;
    expect(contested).toBeLessThan(open);
    expect(contested).toBeGreaterThan(0.35);
    expect(contested).toBeLessThan(0.7);
  });
});

describe('tackling', () => {
  it('jukes and elusive backs cause misses', () => {
    expect(tackleChance(80, 80, 70, true)).toBeLessThan(tackleChance(80, 80, 70, false));
    expect(tackleChance(80, 95, 70, false)).toBeLessThan(tackleChance(80, 60, 70, false));
  });
});

describe('rules', () => {
  it('moves the chains on a first down', () => {
    const d = startDrive(25); // los = 35
    const a = applyOutcome(d, out('tackle', 47));
    expect(a.drive.down).toBe(1);
    expect(a.drive.firstDownX).toBe(57);
    expect(a.headline).toBe('FIRST DOWN');
  });
  it('advances the down when short', () => {
    const a = applyOutcome(startDrive(25), out('tackle', 39));
    expect(a.drive.down).toBe(2);
    expect(downDistance(a.drive)).toBe('2ND & 6');
  });
  it('incomplete keeps the spot', () => {
    const a = applyOutcome(startDrive(25), out('incomplete', 35));
    expect(a.drive.los).toBe(35);
    expect(a.drive.down).toBe(2);
  });
  it('turnover on downs after 4th down fails', () => {
    const d = { ...startDrive(25), down: 4 };
    const a = applyOutcome(d, out('incomplete', 35));
    expect(a.change.kind).toBe('downs');
  });
  it('touchdown scores 6 and earns a try', () => {
    const a = applyOutcome(startDrive(25), out('td', 110));
    expect(a.userPoints).toBe(6);
    expect(a.change.kind).toBe('pat');
  });
  it('goal to go inside the 10', () => {
    expect(downDistance(startDrive(95))).toBe('1ST & GOAL');
  });
  it('labels field position from the user perspective', () => {
    expect(fieldLabel(35)).toBe('OWN 25');
    expect(fieldLabel(60)).toBe('MIDFIELD');
    expect(fieldLabel(84)).toBe('OPP 26');
  });
  it('CPU drives end with a sensible result', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const s = simulateDrive(90, 85, 25, rng);
      expect([0, 3, 7]).toContain(s.points);
      expect(s.plays).toBeGreaterThan(0);
    }
  });
});

describe('clock', () => {
  const at = (quarter: number, time: number, qMin = 15): Clock => ({ ...newClock(qMin), quarter, time });

  it('incompletions stop the clock until the snap', () => {
    const c = at(1, 600);
    afterPlay(c, 'incomplete', false);
    expect(c.mode).toBe('untilSnap');
    expect(c.play).toBe(40);
  });
  it('first downs only stop the clock inside two minutes of a half', () => {
    const early = at(2, 300);
    afterPlay(early, 'tackle', true);
    expect(early.mode).toBe('run');
    const late = at(2, 90);
    afterPlay(late, 'tackle', true);
    expect(late.mode).toBe('untilReady');
    readyForPlay(late);
    expect(late.mode).toBe('run');
  });
  it('out of bounds restarts on the ready, except late in a half', () => {
    const q1 = at(1, 100);
    afterPlay(q1, 'oob', false);
    expect(q1.mode).toBe('untilReady');
    const q4 = at(4, 60);
    afterPlay(q4, 'oob', false);
    expect(q4.mode).toBe('untilSnap');
  });
  it('between plays runs faster with shorter quarters; live plays run 1:1', () => {
    const c: Clock = { ...at(1, 600, 5), mode: 'run', play: 40 };
    tickBetween(c, 1);
    expect(c.play).toBeCloseTo(37);
    expect(c.time).toBeCloseTo(597);
    c.mode = 'untilSnap';
    tickBetween(c, 1);
    expect(c.time).toBeCloseTo(597);
    tickLive(c, 2);
    expect(c.time).toBeCloseTo(595);
  });
  it('simulated time rolls into the next quarter and stops at halftime', () => {
    const c = at(1, 60);
    expect(advanceSim(c, 90).halfOver).toBe(false);
    expect(c.quarter).toBe(2);
    expect(c.time).toBeCloseTo(870);
    const h = at(2, 30);
    expect(advanceSim(h, 60).halfOver).toBe(true);
    expect(h.time).toBe(0);
    expect(at(4, 10).quarter).toBe(4);
    expect(advanceSim(at(4, 10), 20).halfOver).toBe(true);
  });
  it('formats the clock', () => {
    expect(clockText(at(2, 462))).toBe('2ND 7:42');
    expect(playClockText({ ...at(1, 900), play: 9.2 })).toBe(':10');
  });
  it('delay of game is 5 yards, or half the distance near the goal', () => {
    expect(penaltySpot(35, 10)).toBe(30);
    expect(penaltySpot(16, 10)).toBe(13);
  });
  it('CPU drives never run past the half', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 100; i++) {
      const s = simulateDrive(85, 85, 25, rng, { timeLeft: 75, hurry: false, milk: false });
      expect(s.secs).toBeLessThanOrEqual(75);
      if (s.result === 'END OF HALF') expect(s.points).toBe(0);
    }
  });
});

describe('handoffs', () => {
  const qb = { x: 30, y: 26 };
  it('hands off close, pitches wider', () => {
    expect(handoffKind(qb, { x: 30.5, y: 27 }, 35)).toBe('handoff');
    expect(handoffKind(qb, { x: 29, y: 31 }, 35)).toBe('pitch');
  });
  it('shovels to a back releasing ahead of the QB, but nothing once he reaches the line', () => {
    expect(handoffKind(qb, { x: 33, y: 30 }, 35)).toBe('pitch');
    expect(handoffKind(qb, { x: 34.5, y: 29 }, 35)).toBeNull();
    expect(handoffKind(qb, { x: 34.9, y: 26 }, 35)).toBeNull();
    expect(handoffKind(qb, { x: 20, y: 26 }, 35)).toBeNull();
  });
  it('a fumble recovered by the offense is spotted like a tackle', () => {
    const a = applyOutcome(startDrive(25), out('fumble', 33));
    expect(a.drive.los).toBe(33);
    expect(a.drive.down).toBe(2);
  });
});

describe('kicking physics', () => {
  const B: BounceProfile = { rest: 0.35, keep: 0.58, erratic: 0, backspin: 0, roll: 6.5 };
  const from = { x: 20, y: 26, z: 1 };
  const kick = (power: number, loft: number, wind = CALM) =>
    predictKick(from, { power, dir: { x: 1, y: 0 }, loft }, 85, wind, B);

  it('more power goes farther; extreme loft gives up distance for hang time', () => {
    expect(kick(1, 50).land.x).toBeGreaterThan(kick(0.6, 50).land.x);
    expect(kick(1, 75).land.x).toBeLessThan(kick(1, 50).land.x);
    expect(kick(1, 75).hang).toBeGreaterThan(kick(1, 50).hang);
  });
  it('a full punt is in a realistic range', () => {
    const p = kick(1, 54);
    expect(p.land.x - from.x).toBeGreaterThan(45);
    expect(p.land.x - from.x).toBeLessThan(62);
    expect(p.hang).toBeGreaterThan(3.8);
    expect(p.hang).toBeLessThan(5);
  });
  it('wind carries the ball', () => {
    const calm = kick(1, 50);
    const tail = kick(1, 50, { mph: 15, dir: { x: 1, y: 0 } });
    const cross = kick(1, 50, { mph: 15, dir: { x: 0, y: 1 } });
    expect(tail.land.x).toBeGreaterThan(calm.land.x + 3);
    expect(cross.land.y).toBeGreaterThan(calm.land.y + 2);
  });
  it('a long kick slows down and the ball comes to rest', () => {
    const p = kick(1, 50);
    expect(p.rest.x).toBeGreaterThan(p.land.x);
    expect(p.rest.z).toBe(0);
  });
});

describe('field goals', () => {
  const cross = (y: number, z: number) => fgCheck({ x: POSTS_X - 0.5, y, z }, { x: POSTS_X + 0.5, y, z });
  it('judges the kick as it crosses the posts', () => {
    expect(cross(POSTS_Y, 6)).toBe('good');
    expect(cross(POSTS_Y - UPRIGHT_HALF - 1, 6)).toBe('wideLeft');
    expect(cross(POSTS_Y + UPRIGHT_HALF + 1, 6)).toBe('wideRight');
    expect(cross(POSTS_Y, 2)).toBe('short');
    expect(cross(POSTS_Y + UPRIGHT_HALF, 6)).toBe('upright');
    expect(fgCheck({ x: 100, y: POSTS_Y, z: 5 }, { x: 101, y: POSTS_Y, z: 5 })).toBeNull();
  });
  it('distance counts the end zone and the hold', () => {
    expect(fgDistance(85, 110)).toBe(42);
    expect(fgDistance(107, 110)).toBe(20);
  });
});

describe('kick rules', () => {
  const k = (result: KickOutcome['result'], unit: KickOutcome['unit'], spot: number): KickOutcome =>
    ({ result, unit, spot, spotY: 26, text: '', sub: '', color: '' });
  const start = (a: ReturnType<typeof applyKick>) => (a.change.kind === 'cpuBall' ? a.change.cpuStart : NaN);
  const drive = startDrive(60);

  it('field goals and extra points score and kick off', () => {
    expect(applyKick(drive, k('fgGood', 'fg', 120)).userPoints).toBe(3);
    expect(applyKick(drive, k('fgGood', 'fg', 120)).change.kind).toBe('kickoff');
    expect(applyKick(drive, k('xpGood', 'xp', 120)).userPoints).toBe(1);
    expect(applyKick(drive, k('xpMiss', 'xp', 120)).change.kind).toBe('kickoff');
  });
  it('a missed field goal goes back to the line of scrimmage, or the 20', () => {
    expect(start(applyKick(startDrive(60), k('fgMiss', 'fg', 120)))).toBe(40);
    expect(start(applyKick(startDrive(85), k('fgMiss', 'fg', 120)))).toBe(20);
  });
  it('touchbacks: 25 on kickoffs, 20 on punts', () => {
    expect(start(applyKick(drive, k('touchback', 'kickoff', 112)))).toBe(25);
    expect(start(applyKick(drive, k('touchback', 'punt', 112)))).toBe(20);
  });
  it('a kickoff out of bounds goes to the 35; a fair catch inside the 25 comes out to the 25', () => {
    expect(start(applyKick(drive, k('oob', 'kickoff', 90)))).toBe(35);
    expect(start(applyKick(drive, k('fairCatch', 'kickoff', 95)))).toBe(25);
    expect(start(applyKick(drive, k('fairCatch', 'kickoff', 75)))).toBe(35);
  });
  it('punts and returns are spotted where the ball ends up', () => {
    expect(start(applyKick(drive, k('downed', 'punt', 104)))).toBe(6);
    expect(start(applyKick(drive, k('oob', 'punt', 100)))).toBe(10);
    expect(start(applyKick(drive, k('returned', 'kickoff', 80)))).toBe(30);
  });
  it('a return touchdown scores 7 for the CPU; a recovered muff is the users ball', () => {
    const td = applyKick(drive, k('returnTd', 'punt', 10));
    expect(td.cpuPoints).toBe(7);
    expect(td.change.kind).toBe('returnTd');
    const rec = applyKick(drive, k('recovered', 'punt', 95));
    expect(rec.change.kind).toBe('none');
    expect(rec.drive.los).toBe(95);
    expect(rec.drive.down).toBe(1);
  });
});

describe('two-point try', () => {
  const tryDrive = { los: 107, ballY: 26.6, down: 1, firstDownX: 110, try: true };
  it('a touchdown is worth 2, anything else nothing, then a kickoff', () => {
    expect(applyTry(tryDrive, out('td', 110)).userPoints).toBe(2);
    expect(applyTry(tryDrive, out('tackle', 108)).userPoints).toBe(0);
    expect(applyTry(tryDrive, out('incomplete', 107)).change.kind).toBe('kickoff');
  });
  it('a defensive return scores 2 for the CPU', () => {
    expect(applyTry(tryDrive, out('pick6', 10)).cpuPoints).toBe(2);
  });
  it('reads as a try on the scorebug', () => {
    expect(downDistance(tryDrive)).toBe('TRY');
  });
});

describe('playbook', () => {
  const MID = 26.65;
  const play = (id: string) => PLAYBOOK.find((p) => p.id === id)!;
  const offR = generateRoster(TEAMS[0]);
  const defR = generateRoster(TEAMS[1]);
  const snapPlay = (def: PlayDef, flip = false) =>
    new Play({
      offTeam: TEAMS[0], defTeam: TEAMS[1], offRoster: offR, defRoster: defR, play: def, defCall: DEF_CALLS[0],
      press: {}, los: 35, ballY: MID, flip, rng: mulberry32(1),
    });
  const idle = {
    mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
    axis: () => ({ x: 0, y: 0 }), isDown: () => false, hit: () => false, endStep: () => {},
  } as unknown as Input;
  const cam = new Camera();
  const run = (p: Play, secs: number) => {
    for (let t = 0; t < secs; t += STEP) p.update(STEP, idle, cam);
  };

  // Slot-by-slot route maps from before the concept layer; the migration must reproduce them exactly.
  const RB4 = { X: 'block', SL: 'block', TE: 'block', Z: 'block' };
  const OLD: Record<string, Record<string, string>> = {
    'four-verts': { X: 'go', SL: 'seam', TE: 'seam', Z: 'go', RB: 'flat' },
    'slant-flat': { X: 'slant', SL: 'flat', Z: 'slant', TE: 'drag', RB: 'block' },
    smash: { X: 'hitch', SL: 'corner', Z: 'hitch', TE: 'corner', RB: 'flat' },
    mesh: { X: 'drag', SL: 'drag', Z: 'corner', TE: 'curl', RB: 'flat' },
    dagger: { X: 'post', SL: 'seam', Z: 'in', TE: 'flat', RB: 'block' },
    'curl-flat': { X: 'curl', SL: 'flat', Z: 'curl', TE: 'seam', RB: 'block' },
    'inside-zone': { ...RB4, RB: 'iz' },
    'outside-zone': { ...RB4, RB: 'oz' },
    power: { ...RB4, RB: 'power' },
    toss: { ...RB4, RB: 'toss' },
    'zone-read': { ...RB4, RB: 'iz' },
    'qb-sneak': { ...RB4, RB: 'block' },
    'pa-post': { X: 'post', SL: 'curl', TE: 'block', Z: 'go', RB: 'paFake' },
    'pa-boot': { X: 'go', SL: 'deepOut', TE: 'drag', Z: 'post', RB: 'paFake' },
    'pa-cross': { X: 'in', SL: 'go', TE: 'drag', Z: 'post', RB: 'paFake' },
    'pa-seams': { X: 'go', SL: 'seam', TE: 'seam', Z: 'comeback', RB: 'paFake' },
    'rpo-slant': { ...RB4, X: 'slant', RB: 'iz' },
    'rpo-bubble': { ...RB4, SL: 'bubble', RB: 'iz' },
  };

  it('the migrated playbook resolves to the old route maps, alignments and cast', () => {
    expect(PLAYBOOK.map((p) => p.id).sort()).toEqual(Object.keys(OLD).sort());
    for (const p of PLAYBOOK) {
      const r = resolvePlay(p, MID, false);
      expect(r.routes, p.id).toEqual(OLD[p.id]);
      expect(r.align, p.id).toEqual(p.formation.align);
      expect(r.mirrored).toBe(false);
      for (const [slot, who] of Object.entries(r.cast)) expect(who).toBe(slot);
    }
  });

  it('rejects concepts that reach nobody and backfield calls for non-backs', () => {
    // Trips has one receiver on the weak side, so a #2 bubble there has nobody to run it.
    expect(() => resolvePlay({ ...play('rpo-bubble'), strong: undefined, weak: 'bubble' }, MID, false)).toThrow();
    expect(() => resolvePlay({ ...play('mesh'), backs: { X: 'flat' } }, MID, false)).toThrow();
  });

  it('mirrors the layout and drop, and flipping twice is a no-op', () => {
    const m = resolvePlay(play('mesh'), MID, true);
    expect(m.align.X).toEqual({ dx: -0.6, y: 15.7, mode: 'split' });
    expect(m.align.TE.y).toBe(-4.8);
    expect(m.strongSign).toBe(-1);
    expect(m.routes).toEqual(OLD.mesh); // routes are inside-relative, so the slot jobs don't change
    expect(resolvePlay(play('pa-boot'), MID, true).dropY).toBe(7);
    const field = { ...play('mesh'), flip: 'field' as const };
    expect(resolvePlay(field, 20, false).mirrored).toBe(false); // top hash: the strong (right) side is already wide
    expect(resolvePlay(field, 33, false).mirrored).toBe(true);
    expect(resolvePlay(field, MID, false).mirrored).toBe(false);
    expect(resolvePlay(field, 33, true).mirrored).toBe(false); // the user's flip undoes the auto flip
    expect(resolvePlay({ ...field, flip: 'boundary' }, 20, false).mirrored).toBe(true);
  });

  it('a mirrored play lines up mirrored and runs its paths to the new strong side', () => {
    const p = snapPlay(play('power'), true);
    const at = (slot: string) => p.off.find((o) => o.slot === slot)!;
    expect(at('X').pos.y).toBeCloseTo(MID + 15.7, 1);
    expect(at('TE').pos.y).toBeCloseTo(MID - 4.8);
    expect(p.hole.y).toBeLessThan(MID); // power hits off the TE, now on the left
  });

  it('receiver splits squeeze into the boundary and spread to the field', () => {
    const r = resolvePlay(play('smash'), HASH_TOP, false); // Gun Doubles: X and SL to the boundary
    expect(alignY(r.align.X, HASH_TOP)).toBeCloseTo(8.2, 1); // 11 from the sideline at a mid ball
    expect(HASH_TOP - alignY(r.align.SL, HASH_TOP)).toBeCloseTo(6, 1);
    expect(alignY(r.align.Z, HASH_TOP) - HASH_TOP).toBeCloseTo(19.6, 1);
    expect(alignY(r.align.TE, HASH_TOP) - HASH_TOP).toBeCloseTo(4.8); // inline: fixed
    expect(alignY(r.align.X, MID)).toBeCloseTo(11, 1);
    // Numbering doesn't depend on the hash.
    expect(resolvePlay(play('smash'), HASH_BOT, false).routes).toEqual(r.routes);
  });

  it('personnel formations sub in depth players and build a full offense', () => {
    const cases: [Formation, 'SL' | 'TE', string, string][] = [
      [I_FORM, 'SL', 'FB', '21'], [ACE, 'SL', 'TE2', '12'], [EMPTY, 'TE', 'WR4', '10'],
    ];
    for (const [f, slot, who, pers] of cases) {
      expect(personnelOf(f)).toBe(pers);
      const p = snapPlay({ id: 't', name: 'T', kind: 'pass', formation: f, block: 'pass', read: 'none', flip: 'fixed', drop: 1, tip: '' });
      expect(p.off).toHaveLength(11);
      expect(p.resolved.cast[slot]).toBe(who);
      expect(p.off.find((o) => o.slot === who)?.role).toBe(offR[who].role);
    }
    expect(offR.FB.role).toBe('RB');
    expect(offR.FB.r.blk).toBeGreaterThan(offR.RB.r.blk);
    expect(FORMATIONS.map(personnelOf)).toEqual(['11', '11', '11', '11', '21', '12', '10']);
    // In Empty the split-out back counts as the weak side's #2 receiver.
    expect(resolvePlay({ ...play('mesh'), formation: EMPTY, weak: 'slant-drag', backs: {} }, MID, false).routes.RB).toBe('drag');
    expect(GUN_TRIPS.sub).toBeUndefined();
  });

  it('a pulling guard skips his down block, runs flat behind the line, then finds a backer', () => {
    const p = snapPlay({ ...play('power'), scheme: { pulls: [{ who: 'LG', job: 'lead' }] } });
    const lg = p.off.find((o) => o.slot === 'LG')!;
    const startY = lg.pos.y;
    p.snap();
    expect(lg.mark).toBeNull();
    run(p, 0.6);
    expect(lg.pos.y).toBeGreaterThan(startY + 0.8);
    expect(lg.pos.x).toBeLessThan(p.los);
    run(p, 1.2);
    expect(lg.pull).toBeNull();
    expect(['LB', 'S']).toContain(lg.mark?.role);
  });

  it('slide protection hands the backside edge to the back and still picks up every lineman', () => {
    const p = snapPlay({ ...play('slant-flat'), scheme: { slide: 'strong' } });
    p.snap();
    const dl = p.def.filter((d) => d.role === 'DL').sort((a, b) => a.pos.y - b.pos.y);
    expect(p.rb.mark).toBe(dl[0]); // strong is right, so the left end is the back's
    for (const d of dl) expect(p.off.some((o) => o.mark === d)).toBe(true);
  });
});
