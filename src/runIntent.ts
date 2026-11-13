/**
 * INTENT (`npm run runfit`, docs/RUNGAME.md "Intent"): does each run do what it's drawn to do? For
 * every designed run in the books, against the RUNFIT calls:
 * - CARD: the design at the snap against one call: the gap the back's path aims at, and each blocker's
 *   man (`mark`, `^climb`, `@poa`, `(job)`), the most common card over the reps.
 * - HIT: where the carrier crossed the line, by gap (playside A–D and OUT outside the last blocker,
 *   backside in lower case; BEHIND: down before he got there), and the share on the aim or next to it.
 *   INTENT MISS: under `INTENT.miss` of carries there.
 * - SHAPE: the gain histogram, and yards before and after the first contact by a defender off any block.
 * - BLOCKS: each blocker's share of reps still on a man when the ball crossed (held), and the share of
 *   tackles made by the man he had at the snap (his man made the play); `free`: tackles by a man no
 *   blocker had.
 * Tooling only: it reads the play, it never changes it, so the harness's numbers are the same.
 */
import { DEF_CALLS, type DefCall } from './data/defenses';
import { PLAYBOOK, type PlayDef } from './data/plays';
import { dist, mulberry32 } from './engine/math';
import type { Play } from './game/playState';
import * as H from './harness';
import type { Player } from './sim/player';
import { playSide } from './sim/runBlocking';
import { TACKLE_RANGE } from './sim/tackling';

export const INTENT = {
  /** INTENT MISS below this share of carries on the aim gap or next to it (same side). */
  miss: 0.5,
  /** The card's call. */
  cardCall: 'c3',
  /** A blocker this far inside of the center (yd, either way) counts as the center's gap edge. */
  mid: 0.3,
  /** Past the last blocker by more than this (yd) is OUT (the edge), not his outside gap. */
  edge: 2,
  /** Gain buckets (yd): below 0, 0–2, 3–4, 5–9, 10+. */
  buckets: [0, 3, 5, 10],
};

/** Gaps at the snap: each side's blockers on the line, as distances from the center, nearest first. */
export interface LineGaps {
  cy: number;
  side: 1 | -1;
  play: number[];
  back: number[];
}

/** The line and attached blockers at the snap (as the run fits see them: `runFits.ts` `blockerYs`). */
export function lineGaps(play: Play): LineGaps {
  const side = playSide(play);
  const cy = play.center.start.y;
  const ys = play.off
    .filter((o) => o.role === 'OL' || (o.isBlocker && o.role !== 'QB' && o.role !== 'WR' && o.start.x > play.los - 1.6 && Math.abs(o.start.y - play.ballY) < 6.5))
    .map((o) => (o.start.y - cy) * side);
  return {
    cy,
    side,
    play: ys.filter((a) => a > INTENT.mid).sort((a, b) => a - b),
    back: ys.filter((a) => a < -INTENT.mid).map((a) => -a).sort((a, b) => a - b),
  };
}

const NAMES = ['A', 'B', 'C', 'D', 'E'];

/** A spot's gap: playside A, B, ... (outside the last blocker within `edge`), else OUT; backside in lower case. Index: +1 = A playside, −1 = a. */
export function gapAt(g: LineGaps, y: number): { name: string; i: number } {
  const a = (y - g.cy) * g.side;
  const arr = a >= 0 ? g.play : g.back;
  const k = arr.filter((b) => b < Math.abs(a)).length;
  // Just outside the last blocker is still a gap (C off a tackle, D off a TE); past `edge` it's OUT.
  const out = k >= arr.length && Math.abs(a) > (arr[arr.length - 1] ?? 0) + INTENT.edge;
  const name = out ? 'OUT' : NAMES[k];
  return a >= 0 ? { name, i: k + 1 } : { name: name.toLowerCase(), i: -(k + 1) };
}

/** Where the designed carrier's path crosses the line (the back's route, else the hole). */
export function aimY(play: Play): number {
  const qbRun = !!play.playDef.qbRun;
  const r = qbRun ? [] : play.rb.route;
  const from = play.rb.start;
  let prev = from;
  for (const p of r) {
    if (p.x >= play.los && prev.x < play.los) {
      const t = (play.los - prev.x) / (p.x - prev.x || 1);
      return prev.y + (p.y - prev.y) * t;
    }
    prev = p;
  }
  return play.hole.y;
}

interface Card {
  aim: string;
  jobs: string;
}

/** The card: the aim gap, each blocker's man, and where the back starts. */
function cardOf(play: Play, g: LineGaps): Card {
  const blockers = play.off.filter((o) => o.isBlocker && o.role !== 'QB');
  const jobs = blockers
    .map((o) => `${o.slot}:${o.mark?.slot ?? '-'}${o.climb ? '^' + o.climb.slot : ''}${o.poa ? '@' + o.poa.slot : ''}${o.poaJob ? '(' + o.poaJob + ')' : ''}${o.hinge ? '(hinge)' : ''}${o.pull ? '(pull ' + o.pull + ')' : ''}`)
    .join(' ');
  return { aim: gapAt(g, aimY(play)).name, jobs };
}

export interface IntentStats {
  n: number;
  aim: string;
  /** Crossings by gap name (shares), BEHIND for down before the line. */
  hit: Record<string, number>;
  onAim: number;
  shape: number[];
  before: number;
  after: number;
  /** By blocker slot: held share, and the share of tackles his man at the snap made. */
  blocks: Record<string, { held: number; tackles: number }>;
  free: number;
  card: string;
}

/** One run against the calls, with the intent read off every rep. */
export function intentStats(p: PlayDef, calls: DefCall[], reps: number, seed: number): IntentStats {
  const m = H.referenceMatchup();
  const rng = mulberry32(seed);
  const hit: Record<string, number> = {};
  const shape = INTENT.buckets.map(() => 0).concat(0);
  const held: Record<string, number> = {};
  const owed: Record<string, number> = {};
  const cards = new Map<string, number>();
  let n = 0;
  let on = 0;
  let before = 0;
  let after = 0;
  let tackles = 0;
  let free = 0;
  let aimName = '?';
  for (const c of calls) {
    for (let i = 0; i < reps; i++) {
      let g: LineGaps | null = null;
      let aim: { name: string; i: number } | null = null;
      let men: Map<Player, Player | null> | null = null;
      let cross: { name: string; i: number } | null = null;
      let heldNow: Set<string> | null = null;
      let card: string | null = null;
      let touch: number | null = null;
      const r = H.runRep(m, p, c, rng, H.LOS, undefined, (play) => {
        if (!g && play.phase !== 'presnap') {
          g = lineGaps(play);
          aim = gapAt(g, aimY(play));
        }
        // The jobs once the line has its men (after the first step, as `npm run trace` prints them).
        if (!men && play.off.some((o) => o.role === 'OL' && (o.mark || o.climb))) {
          men = new Map(play.off.filter((o) => o.isBlocker && o.role !== 'QB').map((o) => [o, o.mark ?? o.poa ?? null]));
          if (c.id === INTENT.cardCall) card = cardOf(play, g!).jobs;
        }
        const k = play.carrier;
        // First contact: a defender off any block gets to him (a blocked man reaching out isn't one).
        if (touch === null && k && k.side === 'off' && play.phase === 'run' && play.def.some((d) => !d.down && !d.engagedBy.length && dist(d.pos, k.pos) <= TACKLE_RANGE + 0.3)) touch = k.pos.x - play.los;
        if (!cross && g && k && k.side === 'off' && play.phase === 'run' && k.pos.x >= play.los) {
          cross = gapAt(g, k.pos.y);
          heldNow = new Set(play.off.filter((o) => o.isBlocker && o.engaged).map((o) => o.slot));
        }
      });
      if (!r.o || !r.ran) continue;
      n++;
      aimName = (aim as { name: string } | null)?.name ?? aimName;
      const x = cross as { name: string; i: number } | null;
      const name = x?.name ?? 'BEHIND';
      hit[name] = (hit[name] ?? 0) + 1;
      const a = aim as { i: number } | null;
      if (x && a && Math.sign(x.i) === Math.sign(a.i) && Math.abs(x.i - a.i) <= 1) on++;
      const b = INTENT.buckets.findIndex((t) => r.yds < t);
      shape[b < 0 ? INTENT.buckets.length : b]++;
      const t0 = (touch as number | null) ?? r.yds;
      before += t0;
      after += r.yds - t0;
      for (const s of (heldNow as Set<string> | null) ?? []) held[s] = (held[s] ?? 0) + 1;
      const t = r.play.tackler;
      if (t && r.o.type === 'tackle') {
        tackles++;
        let mine = false;
        for (const [o, d] of (men as Map<Player, Player | null> | null) ?? []) {
          if (d === t || o.climb === t) {
            owed[o.slot] = (owed[o.slot] ?? 0) + 1;
            mine = true;
          }
        }
        if (!mine) free++;
      }
      if (card) cards.set(card, (cards.get(card) ?? 0) + 1);
    }
  }
  const N = Math.max(1, n);
  const slots = new Set([...Object.keys(held), ...Object.keys(owed)]);
  const blocks: IntentStats['blocks'] = {};
  for (const s of slots) blocks[s] = { held: (held[s] ?? 0) / N, tackles: (owed[s] ?? 0) / Math.max(1, tackles) };
  for (const k of Object.keys(hit)) hit[k] /= N;
  const card = [...cards.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    n,
    aim: aimName,
    hit,
    onAim: on / N,
    shape: shape.map((v) => v / N),
    before: before / N,
    after: after / N,
    blocks,
    free: free / Math.max(1, tackles),
    card: card ? `${card[0]} (${Math.round((card[1] / Math.max(1, reps)) * 100)}% of snaps)` : '-',
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const GAP_ORDER = ['BEHIND', 'out', 'e', 'd', 'c', 'b', 'a', 'A', 'B', 'C', 'D', 'E', 'OUT'];
const SLOT_ORDER = ['LT', 'LG', 'C', 'RG', 'RT', 'TE', 'TE2', 'SL', 'FB', 'RB', 'X', 'Z', 'WR4'];
const slotRank = (s: string) => (SLOT_ORDER.includes(s) ? SLOT_ORDER.indexOf(s) : SLOT_ORDER.length);

/** The INTENT section's lines: every designed run in the library (or `only`). */
export function intentReport(reps: number, seed: number, only: string[] | undefined, callIds: string[]): string[] {
  const calls = callIds.map((id) => DEF_CALLS.find((c) => c.id === id)!);
  const out = [
    `INTENT: does each run go where it's drawn? ${reps} snaps a call against ${callIds.join(', ')}. AIM is the gap the carrier's path crosses the line in (playside A-D, OUT past the last blocker; backside in lower case).`,
    `HIT: where he crossed (BEHIND: down first). ON AIM: on the aim gap or next to it. INTENT MISS under ${pct(INTENT.miss)}. SHAPE: gains <0, 0-2, 3-4, 5-9, 10+, then yards before / after the first contact.`,
    `BLOCKS: per blocker, held = still on a man when the ball crossed; his man = share of the tackles made by the man he had at the snap. free = tackles by a man nobody had. CARD: the jobs against ${INTENT.cardCall}.`,
  ];
  const misses: string[] = [];
  for (const p of PLAYBOOK) {
    if (p.kind !== 'run' || (only && !only.includes(p.id))) continue;
    const s = intentStats(p, calls, reps, seed);
    const hit = GAP_ORDER.filter((k) => s.hit[k]).map((k) => `${k} ${pct(s.hit[k])}`).join(' ');
    const name = p.name.padEnd(24);
    const miss = s.onAim < INTENT.miss;
    if (miss) misses.push(`INTENT MISS ${name} aim ${s.aim}, on aim ${pct(s.onAim)}: ${hit}`);
    out.push('', `INTENT ${name}| aim ${s.aim.padEnd(3)} on aim ${pct(s.onAim).padStart(4)}${miss ? ' MISS' : '     '} | ${hit}`);
    out.push(`SHAPE  ${name}| ${s.shape.map(pct).map((x) => x.padStart(4)).join(' ')} | before ${s.before.toFixed(1)} after ${s.after.toFixed(1)}`);
    const bl = Object.entries(s.blocks)
      .sort((a, b) => slotRank(a[0]) - slotRank(b[0]))
      .map(([slot, v]) => `${slot} ${pct(v.held)}/${pct(v.tackles)}`)
      .join('  ');
    out.push(`BLOCKS ${name}| held/his man: ${bl}  | free ${pct(s.free)}`);
    out.push(`CARD   ${name}| ${s.card}`);
  }
  out.push('', ...(misses.length ? misses : ['INTENT MISS: none']));
  return out;
}
