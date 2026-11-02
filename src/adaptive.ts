/**
 * The ADAPTIVE section of the balance report: scripted offenses play drives against the CPU defense,
 * with and without its in-game learning (game/defBrain.ts), on the harness's auto-players. It shows
 * whether a spammed play stops working, and that a varied offense still moves the ball.
 */
import { pickDefCall } from './data/defenses';
import { defIdentity, situationMix } from './data/identity';
import { PLAYBOOK, type PlayDef } from './data/plays';
import { DEF_SLOTS } from './data/teams';
import { OPP_GOAL } from './engine/constants';
import { mulberry32, type Rng } from './engine/math';
import { callFor, halftime, leansFor, newBrain, newDrive, observe, type DefBrain, type DefenseIq } from './game/defBrain';
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

const runs = PLAYBOOK.filter((p) => p.kind === 'run' && !p.qbRun && !p.short);
const passes = PLAYBOOK.filter((p) => p.kind === 'pass');
const pas = PLAYBOOK.filter((p) => p.kind === 'pa' && p.block === 'pass');
const quick = passes.filter((p) => playTraits(p).has('quick'));
const screens = passes.filter((p) => playTraits(p).has('screen'));
const qbRuns = PLAYBOOK.filter((p) => p.qbRun && !p.short);
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
};

/** Hold a quick throw or screen 1.2 s, everything else 2.2 s. */
const holdFor = (p: PlayDef) => (playTraits(p).has('quick') || playTraits(p).has('screen') ? 1.2 : 2.2);

export interface AdaptiveResult {
  /** Yards per play in windows of snaps: 1-6, 7-15, 16+. */
  ypp: number[];
  succ: number;
  /** Touchdowns per drive. */
  td: number;
  drives: number;
  /** For 'IZ x8 then PA': yards per PA play. */
  counter: number;
}

/**
 * One offense against the reference defense for `games` games of `snaps` snaps each. Drives start at
 * the 25 and go for it on fourth down (the scripts don't kick). `iq` STATIC plays the identity only;
 * `parts` turns off the DC's calls or the players' leans, to see what each layer does.
 */
export function adaptive(
  script: Script, iq: DefenseIq, adjust: number, games: number, snaps: number, seed: number, parts = { dc: true, players: true },
): AdaptiveResult {
  const m = H.referenceMatchup();
  const ident = defIdentity(m.def);
  const prc = Object.fromEntries(DEF_SLOTS.map((s) => [s, m.defR[s].r.prc]));
  const win = [0, 0, 0];
  const winN = [0, 0, 0];
  let succ = 0;
  let td = 0;
  let drives = 0;
  let counter = 0;
  let counterN = 0;
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(seed + g * 7919);
    const brain: DefBrain | null = newBrain({ iq, adjust, scout: adjust, qbMobility: 0.3, seed: seed + g });
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
      const reads = brain && parts.players ? leansFor(brain, prc, pick.call) : undefined;
      const x = { tags: pick.tags, reads };
      const r = play.kind === 'run' ? H.runRep(m, play, pick.call, rng, los, x) : H.passRep(m, play, pick.call, holdFor(play), rng, x, los);
      const o = r.o;
      if (!o) continue;
      const turnover = o.type === 'int' || o.type === 'pick6';
      const gain = o.type === 'td' ? ytg : turnover ? 0 : o.spot - los;
      const ok = successful({ gain, pass: play.kind !== 'run', down, toGo, ...(o.type === 'sack' ? { sack: true } : {}), ...(turnover ? { turnover: true } : {}) });
      const w = n < 6 ? 0 : n < 15 ? 1 : 2;
      win[w] += gain;
      winN[w]++;
      if (ok) succ++;
      if (script === SCRIPTS['IZ x8 then PA'] && play.kind === 'pa') {
        counter += gain;
        counterN++;
      }
      if (brain) {
        observe(brain, {
          play, call: pick.call, down, toGo, yardsToGoal: ytg, gain, success: ok, scrambled: r.play.scramble, kept: r.play.kept,
          air: r.play.thrown && r.play.ballTarget ? r.play.ballTarget.x - los : 0,
        });
      }
      // The drive: a score, a turnover or a failed fourth down starts a new one at the 25.
      let over = o.type === 'td' || turnover;
      if (o.type === 'td') td++;
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
  }
  return {
    ypp: win.map((y, i) => y / Math.max(1, winN[i])), succ: succ / (games * snaps), td: td / drives, drives,
    counter: counter / Math.max(1, counterN),
  };
}

/** The ADAPTIVE rows: each script at STATIC, then NORMAL with a weak and a sharp DC, then SHARP. */
export function adaptiveRows(games = 30, snaps = 40, seed = 23): string[] {
  const rows: string[] = ['ADAPTIVE: yards per play by snap (1-6 / 7-15 / 16+), success rate, TDs per drive (scripted offense vs the reference defense)'];
  const modes: [string, DefenseIq, number][] = [['STATIC', 'STATIC', 60], ['NORMAL DC 45', 'NORMAL', 45], ['NORMAL DC 75', 'NORMAL', 75], ['SHARP DC 75', 'SHARP', 75]];
  for (const [name, script] of Object.entries(SCRIPTS)) {
    for (const [label, iq, adj] of modes) {
      const r = adaptive(script, iq, adj, games, snaps, seed);
      rows.push(
        `ADAPT ${name.padEnd(14)} ${label.padEnd(13)} | ypp ${r.ypp.map((y) => y.toFixed(1)).join(' / ')} succ ${(r.succ * 100).toFixed(0)}% ` +
          `td/drive ${r.td.toFixed(2)}${name === 'IZ x8 then PA' ? ` PA ypp ${r.counter.toFixed(1)}` : ''}`,
      );
    }
  }
  return rows;
}
