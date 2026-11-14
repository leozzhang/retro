/**
 * The ADAPTIVE section of the balance report: scripted offenses play drives against the CPU defense,
 * with and without its in-game learning (game/defBrain.ts), on the harness's auto-players. It shows
 * whether a spammed play stops working, and that a varied offense still moves the ball.
 */
import { pickDefCall } from './data/defenses';
import { defIdentity, situationMix } from './data/identity';
import { LEGACY, PLAYBOOK, type PlayDef } from './data/plays';
import { DEF_SLOTS } from './data/teams';
import { OPP_GOAL } from './engine/constants';
import { mulberry32, type Rng } from './engine/math';
import { anticFor, callFor, checkFor, halftime, laneOf, leansFor, newBrain, newDrive, observe, teamSmarts, type DefBrain, type DefenseIq } from './game/defBrain';
import { mergeFilm, rosterRead, type FilmBook } from './game/offModel';
import type { ThrowKind } from './sim/ball';
import * as H from './harness';
import { successful } from './season/grades';
import { playTraits } from './season/scouting';

const book = (id: string) => {
  const p = PLAYBOOK.find((x) => x.id === id);
  if (!p) throw new Error(`no play ${id}`);
  return p;
};

/** An offense's play-caller: the snap number and the situation in, a play out. */
export type Script = (n: number, down: number, toGo: number, rng: Rng) => PlayDef;

const runs = LEGACY.filter((p) => p.kind === 'run' && !p.qbRun && !p.short);
const passes = LEGACY.filter((p) => p.kind === 'pass');
const pas = LEGACY.filter((p) => p.kind === 'pa' && p.block === 'pass');
const quick = passes.filter((p) => playTraits(p).has('quick'));
const screens = passes.filter((p) => playTraits(p).has('screen'));
const qbRuns = LEGACY.filter((p) => p.qbRun && !p.short);
const any = <T>(xs: T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];

export const SCRIPTS: Record<string, Script> = {
  'sneak only': () => book('qb-sneak'),
  'IZ only': () => book('inside-zone'),
  'QB runs': (_n, _d, _t, r) => (r() < 0.6 ? any(qbRuns, r) : any(runs, r)),
  'quick only': (_n, _d, _t, r) => any(quick, r),
  'screens': (_n, _d, _t, r) => (r() < 0.7 ? any(screens, r) : any(quick, r)),
  // A real mix: runs on early downs, passes on long ones, a little play action.
  'balanced': (_n, down, toGo, r) => {
    const passing = down >= 3 && toGo >= 5 ? 0.85 : 0.45;
    const x = r();
    return x < passing * 0.8 ? any(passes, r) : x < passing ? any(pas, r) : any(runs, r);
  },
  // Pound it, then go over the top once they're sitting on it.
  'IZ x8 then PA': (n, _d, _t, r) => (n % 12 < 8 ? book('inside-zone') : any(pas, r)),
  // The same RPO every snap: always the pull, or mostly the pull. (`rpoGive` decides.)
  'RPO glance': () => book('rpo-glance'),
  'RPO glance mix': () => book('rpo-glance'),
  'slant only': () => book('rpo-slant'),
  // The glance until they sit on it, then the smoke to the same receiver from the same look.
  'glance x8 then smoke': (n) => (n % 12 < 8 ? book('rpo-glance') : book('rpo-smoke')),
  // The glance until they play it pass first, then hand it off.
  'glance x8 then give': () => book('rpo-glance'),
  // A tell by formation: always run from the pistol, always pass from trips (the checks read it).
  'pistol run trips pass': (_n, _d, _t, r) =>
    r() < 0.5 ? any([book('outside-zone'), book('split-zone')], r) : any([book('mesh'), book('dagger'), book('stick'), book('curl-flat')], r),
  // A star X (`FAVORITE`): quick and dropback passes, most of them forced to him (the key's row).
  'elite X': (_n, _d, _t, r) => any(xPasses, r),
  // The rollout habit (`THROW_TO`): PA Boot Flood every snap, a bullet to the out once the QB is on the move.
  'boot bullet': () => book('pa-boot'),
  // The counters after 8: a lob over the top to the go, or the drag the chasing backer left.
  'boot x8 then lob': () => book('pa-boot'),
  'boot x8 then drag': () => book('pa-boot'),
  // The same throw with the QB kept in the pocket: no rollout to read.
  'boot bullet pocket': () => pocketBoot,
};

/** PA Boot Flood with the QB kept in the pocket (the same look and id, no boot). */
const pocketBoot: PlayDef = { ...book('pa-boot'), dropY: 0 };

/**
 * Scripts that throw a set route with a set throw type after `hold` s (the user's habit), by snap: the
 * out as a bullet, or the counter after the 8th snap of 12.
 */
const THROW_TO: Record<string, { hold: number; to: (n: number) => { route: string; kind: ThrowKind } }> = {
  'boot bullet': { hold: 1.7, to: () => ({ route: 'deepOut', kind: 'bullet' }) },
  'boot bullet pocket': { hold: 1.7, to: () => ({ route: 'deepOut', kind: 'bullet' }) },
  'boot x8 then lob': { hold: 1.7, to: (n) => (n % 12 < 8 ? { route: 'deepOut', kind: 'bullet' } : { route: 'go', kind: 'lob' }) },
  'boot x8 then drag': { hold: 1.7, to: (n) => (n % 12 < 8 ? { route: 'deepOut', kind: 'bullet' } : { route: 'drag', kind: 'touch' }) },
};

/** Passes with a route for the X: the quick game and dropbacks. */
const xPasses = passes.filter((p) => ['quick', 'dropback'].includes(p.tags.family) && !playTraits(p).has('screen'));

/**
 * Scripts with a favorite receiver: his slot, the share of throws forced to him, and his receiving
 * ratings (a star on a 90 roster).
 */
const FAVORITE: Record<string, { slot: string; share: number; r: number }> = { 'elite X': { slot: 'X', share: 0.75, r: 99 } };

/** RPO scripts: whether this snap is the give. 'RPO glance mix' gives 30%, 'glance x8 then give' after the 8th; the rest always pull. */
const rpoGive = (name: string, n: number, rng: Rng) =>
  name === 'RPO glance mix' ? rng() < 0.3 : name === 'glance x8 then give' ? n % 12 >= 8 : false;
/** The counter rows: which plays count as the counter, after the spam. */
const COUNTER: Record<string, (p: PlayDef) => boolean> = {
  'boot x8 then lob': () => true,
  'boot x8 then drag': () => true,
  'IZ x8 then PA': (p) => p.kind === 'pa',
  'glance x8 then smoke': (p) => p.id === 'rpo-smoke',
  'glance x8 then give': () => true,
};

/** Hold a quick throw or screen 1.2 s, everything else 2.2 s (the ADAPT rows and the film room). */
export const holdFor = (p: PlayDef) => (playTraits(p).has('quick') || playTraits(p).has('screen') ? 1.2 : 2.2);

export interface AdaptiveResult {
  /** Yards per play in windows of snaps: 1-6, 7-15, 16+. */
  ypp: number[];
  succ: number;
  /** Touchdowns per drive. */
  td: number;
  drives: number;
  /** For the counter scripts (`COUNTER`): yards per counter play. */
  counter: number;
  /** RPO pulls: completion rate and yards per throw. */
  pulls: { n: number; comp: number; ypa: number };
  /** Interceptions a snap. */
  ints: number;
  /** A favorite receiver's script (`FAVORITE`): yards a throw to him, and to everyone else. */
  fav?: { to: number; rest: number };
}

/**
 * One offense against the reference defense for `games` games of `snaps` snaps each. Drives start at
 * the 25 and go for it on fourth down (the scripts don't kick). `iq` STATIC plays the identity only;
 * `parts` turns off the DC's calls or the players' leans, to see what each layer does.
 */
export function adaptive(
  script: Script, iq: DefenseIq, adjust: number, games: number, snaps: number, seed: number, parts = { dc: true, players: true, check: true },
  name = '', defLevel = H.REF_DEF, opts: { film?: FilmBook; scout?: number; keepFilm?: (f: FilmBook) => void } = {},
): AdaptiveResult {
  const m = H.referenceMatchup(H.REF_OFF, defLevel);
  const fav = FAVORITE[name];
  if (fav) {
    const p = m.offR[fav.slot];
    m.offR[fav.slot] = { ...p, r: { ...p.r, spd: fav.r, acc: fav.r, cth: fav.r, cit: fav.r, rte: fav.r, rls: fav.r } };
  }
  const favRng = mulberry32(seed ^ 0x5eed);
  const favN = { to: 0, toYds: 0, rest: 0, restYds: 0 };
  const ident = defIdentity(m.def);
  const prc = Object.fromEntries(DEF_SLOTS.map((s) => [s, m.defR[s].r.prc]));
  const smarts = teamSmarts(Object.values(prc));
  const win = [0, 0, 0];
  const winN = [0, 0, 0];
  let succ = 0;
  let td = 0;
  let drives = 0;
  let counter = 0;
  let counterN = 0;
  let ints = 0;
  const pulls = { n: 0, comp: 0, yds: 0 };
  const isCounter = COUNTER[name];
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(seed + g * 7919);
    const brain: DefBrain | null = newBrain({
      iq, adjust, scout: opts.scout ?? adjust, qbMobility: 0.3, seed: seed + g, smarts, book: LEGACY, film: opts.film,
      roster: rosterRead(m.offR),
    });
    let los = 35;
    let down = 1;
    let first = los + 10;
    drives++;
    for (let n = 0; n < snaps; n++) {
      if (n === Math.floor(snaps / 2) && brain) halftime(brain);
      const toGo = Math.min(first, OPP_GOAL) - los;
      const ytg = OPP_GOAL - los;
      const pick = brain && parts.dc ? callFor(brain, ident, down, toGo, ytg, rng) : { call: pickDefCall(rng, situationMix(ident, down, toGo, ytg)), tags: {} };
      const play = script(n, down, toGo, rng);
      // The presnap check off the look (the brain's own draws, so the snap's stream is the same).
      const checked = brain && parts.dc && parts.check ? checkFor(brain, ident, play, pick.call, down, toGo, ytg) : null;
      if (checked) pick.call = checked;
      const reads = brain && parts.players ? leansFor(brain, prc, pick.call, play, { down, toGo, yardsToGoal: ytg }) : undefined;
      const x = { tags: pick.tags, reads, ...(brain && parts.players ? { habits: brain.habits, antic: anticFor(brain, prc) } : {}) };
      const rpo = play.read === 'rpo';
      const give = rpo && rpoGive(name, n, rng);
      const forced = fav && favRng() < fav.share;
      const habit = THROW_TO[name]?.to(n);
      const to = habit ? (o: { routeName?: string | null }) => o.routeName === habit.route : forced ? (o: { slot: string }) => o.slot === fav.slot : undefined;
      const r =
        rpo ? H.rpoRep(m, play, pick.call, give, rng, los, x)
        : play.kind === 'run' ? H.runRep(m, play, pick.call, rng, los, x)
        : H.passRep(m, play, pick.call, habit ? THROW_TO[name].hold : holdFor(play), rng, x, los, habit?.kind ?? 'touch', to);
      const o = r.o;
      if (!o) continue;
      const turnover = o.type === 'int' || o.type === 'pick6';
      const gain = o.type === 'td' ? ytg : turnover ? 0 : o.spot - los;
      const ok = successful({ gain, pass: play.kind !== 'run', down, toGo, ...(o.type === 'sack' ? { sack: true } : {}), ...(turnover ? { turnover: true } : {}) });
      const w = n < 6 ? 0 : n < 15 ? 1 : 2;
      win[w] += gain;
      winN[w]++;
      if (ok) succ++;
      if (isCounter && n % 12 >= 8 && isCounter(play)) {
        counter += gain;
        counterN++;
      }
      if (fav && r.play.thrown) {
        if (r.play.intended?.slot === fav.slot) {
          favN.to++;
          favN.toYds += gain;
        } else {
          favN.rest++;
          favN.restYds += gain;
        }
      }
      if (rpo && !give && r.play.thrown) {
        pulls.n++;
        if (o.type !== 'incomplete' && !turnover) pulls.comp++;
        pulls.yds += gain;
      }
      if (brain) {
        observe(brain, {
          play, call: pick.call, down, toGo, yardsToGoal: ytg, gain, success: ok, scrambled: r.play.scramble, kept: r.play.kept,
          air: r.play.thrown && r.play.ballTarget ? r.play.ballTarget.x - los : 0,
          handedOff: r.play.handedOff, lane: laneOf(r.play), tags: pick.tags, target: r.play.thrown ? r.play.intended?.slot ?? null : null,
          lost: turnover || o.type === 'sack' || o.type === 'fumble',
          throw: r.play.throwRecord(gain), antic: Object.fromEntries([...r.play.anticLog].map(([d, a]) => [d.slot, a])),
        });
      }
      // The drive: a score, a turnover or a failed fourth down starts a new one at the 25.
      let over = o.type === 'td' || turnover;
      if (o.type === 'td') td++;
      if (turnover) ints++;
      if (!over) {
        los += gain;
        if (los >= first) {
          down = 1;
          first = los + 10;
        } else if (++down > 4) over = true;
      }
      if (over) {
        los = 35;
        down = 1;
        first = los + 10;
        drives++;
        if (brain) newDrive(brain);
      }
    }
    if (brain && opts.keepFilm) opts.keepFilm({ ...brain.model.raw, throws: brain.habits.slice(0, 12) });
  }
  return {
    ypp: win.map((y, i) => y / Math.max(1, winN[i])), succ: succ / (games * snaps), td: td / drives, drives,
    counter: counter / Math.max(1, counterN),
    pulls: { n: pulls.n, comp: pulls.comp / Math.max(1, pulls.n), ypa: pulls.yds / Math.max(1, pulls.n) },
    fav: fav ? { to: favN.toYds / Math.max(1, favN.to), rest: favN.restYds / Math.max(1, favN.rest) } : undefined,
    ints: ints / Math.max(1, games * snaps),
  };
}

/** The ADAPTIVE rows: each script at STATIC, then NORMAL with a weak and a sharp DC, then SHARP. */
export function adaptiveRows(games = 30, snaps = 40, seed = 23): string[] {
  const rows: string[] = ['ADAPTIVE: yards per play by snap (1-6 / 7-15 / 16+), success rate, TDs per drive (scripted offense vs the reference defense)'];
  const modes: [string, DefenseIq, number][] = [['STATIC', 'STATIC', 60], ['NORMAL DC 45', 'NORMAL', 45], ['NORMAL DC 75', 'NORMAL', 75], ['SHARP DC 75', 'SHARP', 75]];
  for (const [name, script] of Object.entries(SCRIPTS)) {
    if (process.env.ADAPT_ONLY && !process.env.ADAPT_ONLY.split(',').includes(name)) continue;
    for (const [label, iq, adj] of modes) {
      const r = adaptive(script, iq, adj, games, snaps, seed, undefined, name);
      rows.push(
        `ADAPT ${name.padEnd(20)} ${label.padEnd(13)} | ypp ${r.ypp.map((y) => y.toFixed(1)).join(' / ')} succ ${(r.succ * 100).toFixed(0)}% ` +
          `td/drive ${r.td.toFixed(2)}${COUNTER[name] ? ` counter ypp ${r.counter.toFixed(1)}` : ''}` +
          (r.pulls.n ? ` pulls comp ${(r.pulls.comp * 100).toFixed(0)}% ypa ${r.pulls.ypa.toFixed(1)}` : '') +
          (r.fav ? ` to him ${r.fav.to.toFixed(1)} ypa, the rest ${r.fav.rest.toFixed(1)}` : '') +
          (THROW_TO[name] ? ` int ${(r.ints * 100).toFixed(1)}%` : ''),
      );
    }
  }
  // Film: one game of the same offense on tape, then the next games' first snaps, with and without it, by the DC's SCOUT.
  rows.push('ADAPT FILM: three games of the same offense on film, then NORMAL DC 75 with a SCOUT 40 or 85 DC: ypp snaps 1-6 without -> with the film');
  for (const name of ['IZ only', 'slant only', 'elite X', 'pistol run trips pass', 'boot bullet']) {
    if (process.env.ADAPT_ONLY && !process.env.ADAPT_ONLY.split(',').includes(name)) continue;
    let film: FilmBook | undefined;
    adaptive(SCRIPTS[name], 'NORMAL', 75, 3, snaps, seed + 999, undefined, name, H.REF_DEF, { keepFilm: (f) => (film = mergeFilm(film, f)) });
    const parts = [40, 85].map((scout) => {
      const a = adaptive(SCRIPTS[name], 'NORMAL', 75, games, snaps, seed, undefined, name, H.REF_DEF, { scout });
      const b = adaptive(SCRIPTS[name], 'NORMAL', 75, games, snaps, seed, undefined, name, H.REF_DEF, { scout, film });
      return `scout ${scout}: ${a.ypp[0].toFixed(1)} -> ${b.ypp[0].toFixed(1)}`;
    });
    rows.push(`ADAPT FILM ${name.padEnd(22)} | ${parts.join(' | ')}`);
  }
  // The smarts check: the same spammed RPO and the formation tell against a strong and a weak defense,
  // static and sharp. A weak defense (less play recognition, `teamSmarts`) has to adapt clearly less.
  rows.push('ADAPT TIERS: the same offense against a strong (88) and a weak (70) defense: STATIC -> SHARP DC 75, ypp snaps 7+');
  for (const name of ['RPO glance', 'pistol run trips pass', 'boot bullet']) {
    if (process.env.ADAPT_ONLY && !process.env.ADAPT_ONLY.split(',').includes(name)) continue;
    for (const lvl of [88, 70]) {
      const late = (r: AdaptiveResult) => (r.ypp[1] + r.ypp[2]) / 2;
      const a = adaptive(SCRIPTS[name], 'STATIC', 60, games, snaps, seed, undefined, name, lvl);
      const b = adaptive(SCRIPTS[name], 'SHARP', 75, games, snaps, seed, undefined, name, lvl);
      rows.push(`ADAPT TIER ${name.padEnd(22)} def ${lvl} | ${late(a).toFixed(1)} -> ${late(b).toFixed(1)} (${(((late(b) - late(a)) / late(a)) * 100).toFixed(0)}%)`);
    }
  }
  return rows;
}
