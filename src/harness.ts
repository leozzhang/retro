/**
 * Headless auto-players shared by the balance report (`npm run balance`) and the ratings
 * sensitivity report (`npm run ratings`). No DOM: plays run on fixed steps with a fake input.
 */
import type { DefCall } from './data/defenses';
import type { PlayDef } from './data/plays';
import type { KickDef } from './data/specialTeams';
import { templateValue } from './data/athletes';
import { SLOT_POS } from './data/positions';
import { RATING_KEYS, type Ratings } from './data/ratings';
import { SLOT_ROLE, teamById, type RosterPlayer, type Team } from './data/teams';
import { Camera } from './engine/camera';
import { FIELD_W, STEP } from './engine/constants';
import type { Input } from './engine/input';
import { add, clamp, dist, scale, type Rng } from './engine/math';
import { KickPlay } from './game/kickPlay';
import { Play, type PlaySetup } from './game/playState';
import type { KickParams, Wind } from './sim/kicking';
import { isEligible } from './sim/player';
import { DRAW_SET } from './sim/runBlocking';
import { TACKLE_RANGE } from './sim/tackling';

export const fakeInput = {
  mouse: { x: 0, y: 0, downX: 0, downY: 0, down: false, pressed: false, released: false, rpressed: false, wheel: 0 },
  axis: () => ({ x: 0, y: 0 }),
  isDown: () => false,
  hit: () => false,
  endStep: () => {},
} as unknown as Input;

export const cam = new Camera();
export const LOS = 35;

/** Who's on the field: the offense (user side) and the defense, with their on-field rosters. */
export interface Matchup {
  off: Team;
  def: Team;
  offR: Record<string, RosterPlayer>;
  defR: Record<string, RosterPlayer>;
}

/** Every slot the sim can put on the field. */
const ALL_SLOTS = Object.keys(SLOT_POS);

/**
 * A reference roster: every slot filled by its position's template player at `level` (no archetype,
 * no noise). The reports measure plays and ratings against these, so the baseline doesn't move when
 * the team research or the roster generator changes.
 */
export function referenceRoster(level: number): Record<string, RosterPlayer> {
  const out: Record<string, RosterPlayer> = {};
  for (const slot of ALL_SLOTS) {
    const r = Object.fromEntries(RATING_KEYS.map((k) => [k, Math.round(Math.min(99, templateValue(SLOT_POS[slot], k, level)))]));
    out[slot] = { slot, role: SLOT_ROLE[slot], name: `REF ${slot}`, num: 0, r: r as unknown as Ratings, skin: '#c68a5e' };
  }
  return out;
}

/** The reference matchup: offense 90 against defense 88, the gap the playbook was balanced at (uniforms: Georgia vs Alabama). */
export const REF_OFF = 90;
export const REF_DEF = 88;
export function referenceMatchup(off = REF_OFF, def = REF_DEF): Matchup {
  return { off: teamById('georgia'), def: teamById('alabama'), offR: referenceRoster(off), defR: referenceRoster(def) };
}

/** The DC's tags and the defenders' leans for a snap (game/defBrain.ts); none plays the call as written. */
export type DefExtras = Pick<PlaySetup, 'tags' | 'reads'>;

export function newPlay(m: Matchup, playDef: PlayDef, call: DefCall, rng: Rng, los = LOS, x?: DefExtras): Play {
  return new Play({
    offTeam: m.off, defTeam: m.def, offRoster: m.offR, defRoster: m.defR, play: playDef, defCall: call,
    press: { CB1: rng() < 0.35, CB2: rng() < 0.35 }, los, ballY: 26.6, rng, ...x,
  });
}

/** One auto-QB pass rep: throws to the receiver with the most separation after `holdTime`. `catchX` is where he caught it. */
export function passRep(m: Matchup, playDef: PlayDef, call: DefCall, holdTime: number, rng: Rng, x?: DefExtras, los = LOS) {
  const play = newPlay(m, playDef, call, rng, los, x);
  play.snap();
  let thrown = false;
  let catchX = 0;
  for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
    if (!thrown && play.phase === 'live' && play.time - play.snapTime >= holdTime) {
      let best = null as null | { p: (typeof play.off)[number]; sep: number };
      for (const o of play.off) {
        // Not a back still selling pass before his route (screens, check-releases).
        if (!isEligible(o) || o.isBlocker || play.time - play.snapTime < o.routeDelay) continue;
        let sep = Infinity;
        for (const d of play.def) sep = Math.min(sep, dist(d.pos, o.pos));
        if (!best || sep > best.sep) best = { p: o, sep };
      }
      if (best) {
        const lead = dist(play.qb.pos, best.p.pos) / 22;
        const tgt = add(best.p.pos, scale(best.p.vel, lead));
        // Keep the lead point in bounds, or a flat runner near the sideline gets a ball out of bounds.
        (play as any).throwBall({ x: Math.min(tgt.x, 119), y: clamp(tgt.y, 1.5, FIELD_W - 1.5) });
        thrown = true;
      }
    }
    const before = play.phase;
    play.update(STEP, fakeInput, cam);
    // A catch can end the play the same step (out of bounds at the sideline), so check for 'over' too.
    if (before === 'air' && play.phase !== 'air' && play.carrier?.side === 'off') catchX = play.carrier.pos.x;
  }
  return { play, o: play.outcome, catchX };
}

/** Zone read: the auto-QB rides the back this long after the snap before reading the key. */
export const READ_AT = 0.55;

/**
 * One auto-run rep. The auto-QB hands off (or pitches on the toss) as soon as it's on; `autoRun`
 * carries the ball. On a zone read it rides the mesh, then gives unless the key is crashing (then
 * the QB keeps). On a draw it waits out the fake pass set. On the option it pitches once the key
 * commits to the QB, and otherwise keeps. Designed QB runs carry it themselves.
 * `contact` = yards past the LOS when the first defender (blocked or not) gets a hand on him.
 */
export function runRep(m: Matchup, playDef: PlayDef, call: DefCall, rng: Rng, los = LOS, x?: DefExtras) {
  const play = newPlay(m, playDef, call, rng, los, x);
  play.snap();
  let contact: number | null = null;
  for (let t = 0; t < 15 && play.phase !== 'over'; t += STEP) {
    const opt = play.handoffOption();
    const since = play.time - play.snapTime;
    if (playDef.read === 'option') {
      const k = play.readKey!;
      if (opt === 'pitch' && dist(k.pos, play.qb.pos) < 3 && !play.keyCrashing()) play.handoff(); // he's on the QB: pitch
    } else {
      const zr = playDef.read === 'zoneRead';
      const ready = (!zr || (since >= READ_AT && !play.keyCrashing())) && (play.runScheme !== 'draw' || since >= DRAW_SET);
      if ((opt === 'handoff' && ready) || (opt === 'pitch' && playDef.read === 'pitch')) play.handoff();
    }
    if (play.handedOff || play.kept || (playDef.qbRun && play.phase === 'run')) play.controlled = null;
    play.update(STEP, fakeInput, cam);
    const c = play.carrier;
    if (contact === null && c && c.side === 'off' && play.phase === 'run') {
      if (play.def.some((d) => !d.down && dist(d.pos, c.pos) <= TACKLE_RANGE + 0.3)) contact = c.pos.x - los;
    }
  }
  const o = play.outcome;
  const ran = !!o && (play.handedOff || play.kept || !!playDef.qbRun);
  return { play, o, ran, yds: o ? o.spot - los : 0, contact: contact ?? (o ? o.spot - los : 0) };
}

/** Auto-kicker: release `params` at the first chance (punts: as soon as the punter has the ball), then time the strike perfectly. */
export function runKick(m: Matchup, kd: KickDef, los: number, params: (kp: KickPlay) => KickParams, wind: Wind, rng: Rng) {
  const kp = new KickPlay({ kickTeam: m.off, recvTeam: m.def, kickRoster: m.offR, recvRoster: m.defR, def: kd, los, ballY: 26.6, wind, rng });
  const release = (p: KickParams) => (kp as any).release(p);
  if (kd.unit === 'punt') kp.snap();
  else release(params(kp));
  let released = kd.unit !== 'punt';
  let catchX: number | null = null;
  for (let t = 0; t < 25 && kp.phase !== 'over'; t += STEP) {
    if (!released && kp.phase === 'set') {
      release(params(kp));
      released = true;
    }
    // Perfect timing: stop the needle on the green's center.
    if (kp.meter()?.live && kp.time >= kp.strikeAt!) kp.pressTiming();
    kp.update(STEP, fakeInput);
    if (catchX === null && kp.phase === 'return') catchX = kp.carrier!.pos.x;
  }
  return { kp, o: kp.outcome, catchX };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
