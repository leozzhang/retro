/**
 * RUN AUDIT (`npm run audit`, docs/RUNGAME.md "Audit"): every designed run against every regular front and
 * three defense levels, checked against what its scheme is meant to do.
 *
 * At the snap (each rep, once the line has its run men; on a draw, after the pass set):
 * - IDLE: a blocker with no job (no man, no climb, no point-of-attack man, no hinge) who isn't running a route.
 * - DEAD DOUBLE: two blockers on one man and neither climbs, while a playside box defender is free (a wasted hat).
 * - WRONG SIDE: a lead, kick or force block (not a slice) whose man is backside of the ball.
 * - FREE PLAYSIDE: a box defender playside of the center whom no blocker has (not the read key). Expected when
 *   the box outnumbers the hats; the report shows both.
 * On the field: ON AIM (src/runIntent.ts), the share of tackles by each blocker's man (a blocker whose man
 * makes `AUDIT.owed` of them is a failing assignment), and the point-of-attack blocks' hold rate.
 * Then success (4+ yd; 3rd and 1 converted for the short-yardage plays against Bear and Goal Line) and ypc by
 * call and level. Tooling only.
 */
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK, ROUTES, type PlayDef } from './data/plays';
import { mulberry32 } from './engine/math';
import type { Play } from './game/playState';
import * as H from './harness';
import { aimY, gapAt, lineGaps, type LineGaps } from './runIntent';
import type { Player } from './sim/player';
import { playSide } from './sim/runBlocking';

export const AUDIT = {
  reps: 30,
  seed: 83,
  calls: ['2-man', 'c2', 'c3', 'c4', 'cat', 'c3-sky', 'c1-fire', 'fire-zone', 'c0-blitz', 'bear'],
  shortCalls: ['bear', 'goal'],
  levels: [-10, 0, 10],
  /** A blocker whose man makes this share of the tackles is a failing assignment. */
  owed: 0.2,
  /** A point-of-attack block (pull, lead, kick) holding under this share when the ball crosses is flagged. */
  poaHeld: 0.4,
  /** ...checked as the ball gets this far (yd) past the line. */
  poaPast: 2,
  /** Snap flags shown when they happen on at least this share of snaps. */
  show: 0.15,
};

interface Snap {
  idle: string[];
  dead: string[];
  wrong: string[];
  free: string[];
  box: number;
  hats: number;
  card: string;
}

function snapCheck(play: Play): Snap {
  const side = playSide(play);
  const along = (p: Player) => (p.pos.y - play.ballY) * side;
  const blockers = play.off.filter((o) => o.isBlocker && o.role !== 'QB' && !(play.playDef.qbRun && o === play.qb));
  const routeRunner = (o: Player) => !!o.routeName && !ROUTES[o.routeName].lead && !ROUTES[o.routeName].run && o.routeName !== 'block';
  const idle = blockers.filter((o) => !o.mark && !o.climb && !o.poa && !o.hinge && !o.poaJob && !routeRunner(o)).map((o) => o.slot);
  const byMan = new Map<Player, Player[]>();
  for (const o of blockers) if (o.mark) byMan.set(o.mark, [...(byMan.get(o.mark) ?? []), o]);
  const dead = [...byMan.entries()].filter(([, bs]) => bs.length >= 2 && !bs.some((b) => b.climb)).map(([d, bs]) => `${bs.map((b) => b.slot).join('+')}:${d.slot}`);
  const wrong = blockers
    .filter((o) => o.poaJob && o.poa && !(o.routeName && ROUTES[o.routeName].away) && along(o.poa) < -1)
    .map((o) => `${o.slot}(${o.poaJob})@${o.poa!.slot}`);
  const had = new Set(blockers.flatMap((o) => [o.mark, o.climb, o.poa]).filter(Boolean));
  const inBox = play.def.filter((d) => d.pos.x < play.los + 6 && Math.abs(d.pos.y - play.ballY) < 7.5 && d.role !== 'CB');
  const free = inBox.filter((d) => !had.has(d) && d !== play.readKey && along(d) > -0.5).map((d) => d.slot);
  // A double with nobody to climb to is only a wasted hat while someone in the box is free.
  if (!free.length) dead.length = 0;
  const card = blockers
    .map((o) => `${o.slot}:${o.mark?.slot ?? '-'}${o.climb ? '^' + o.climb.slot : ''}${o.poa && o.poa !== o.mark ? '@' + o.poa.slot : ''}${o.poaJob ? '(' + o.poaJob + ')' : ''}${o.hinge ? '(hinge)' : ''}`)
    .join(' ');
  return { idle, dead, wrong, free, box: inBox.length, hats: blockers.length, card };
}

interface Cell {
  n: number;
  succ: number;
  yds: number;
  behind: number;
}

export interface PlayAudit {
  play: PlayDef;
  aim: string;
  onAim: number;
  cells: Map<string, Cell>;
  flags: Map<string, number>;
  snaps: number;
  cards: Map<string, Map<string, number>>;
  boxHats: Map<string, string>;
  owed: Map<string, number>;
  tackles: number;
  poa: Map<string, { held: number; n: number; job: string }>;
}

const bump = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v);

export function auditPlay(p: PlayDef, reps = AUDIT.reps, seed = AUDIT.seed): PlayAudit {
  const calls = [...AUDIT.calls, ...(p.short ? AUDIT.shortCalls.filter((c) => !AUDIT.calls.includes(c)) : [])].map((id) => DEF_CALLS.find((c) => c.id === id)!);
  const a: PlayAudit = { play: p, aim: '?', onAim: 0, cells: new Map(), flags: new Map(), snaps: 0, cards: new Map(), boxHats: new Map(), owed: new Map(), tackles: 0, poa: new Map() };
  let carries = 0;
  let on = 0;
  for (const lvl of AUDIT.levels) {
    const m = H.referenceMatchup(70, 70 + lvl);
    const rng = mulberry32(seed + lvl * 7);
    for (const c of calls) {
      const cell: Cell = { n: 0, succ: 0, yds: 0, behind: 0 };
      const shortCell: Cell = { n: 0, succ: 0, yds: 0, behind: 0 };
      for (let i = 0; i < reps; i++) {
        const short = !!p.short && AUDIT.shortCalls.includes(c.id) && i % 2 === 1;
        let g: LineGaps | null = null;
        let aim: { name: string; i: number } | null = null;
        let snap: Snap | null = null;
        let men: Map<Player, Player | null> | null = null;
        let cross: { name: string; i: number } | null = null;
        let heldAt: Set<Player> | null = null;
        const r = H.runRep(m, p, c, rng, H.LOS, undefined, (play) => {
          if (!g && play.phase !== 'presnap') {
            g = lineGaps(play);
            aim = gapAt(g, aimY(play));
          }
          if (!snap && play.runBlocking() && play.off.some((o) => o.role === 'OL' && (o.mark || o.climb || o.hinge))) {
            snap = snapCheck(play);
            men = new Map(play.off.filter((o) => o.isBlocker && o.role !== 'QB').map((o) => [o, o.mark ?? o.poa ?? null]));
          }
          const k = play.carrier;
          if (!cross && g && k && k.side === 'off' && play.phase === 'run' && k.pos.x >= play.los) cross = gapAt(g, k.pos.y);
          // A point-of-attack block meets his man at the hole: on someone by the time the ball's 2 yd past the line.
          if (play.phase === 'run' && k && k.side === 'off' && k.pos.x < play.los + AUDIT.poaPast) heldAt = new Set(play.off.filter((o) => o.engaged));
        });
        if (!r.o || !r.ran) continue;
        const sc = (short ? shortCell : cell);
        sc.n++;
        sc.yds += r.yds;
        if (r.yds >= (short ? 1 : 4)) sc.succ++;
        if (!cross) sc.behind++;
        carries++;
        const am = aim as { name: string; i: number } | null;
        const x = cross as { name: string; i: number } | null;
        if (am) a.aim = am.name;
        if (x && am && Math.sign(x.i) === Math.sign(am.i) && Math.abs(x.i - am.i) <= 1) on++;
        const s = snap as Snap | null;
        if (s) {
          a.snaps++;
          for (const v of s.idle) bump(a.flags, `IDLE ${v}`);
          for (const v of s.dead) bump(a.flags, `DEAD DOUBLE ${v}`);
          for (const v of s.wrong) bump(a.flags, `WRONG SIDE ${v}`);
          for (const v of s.free) bump(a.flags, `FREE PLAYSIDE ${v} (${c.front})`);
          const front = c.front;
          if (!a.cards.has(front)) a.cards.set(front, new Map());
          bump(a.cards.get(front)!, `${c.id}: ${s.card}`);
          a.boxHats.set(c.id, `${s.box}/${s.hats}`);
        }
        const mm = men as Map<Player, Player | null> | null;
        const t = r.play.tackler;
        if (t && r.o.type === 'tackle' && mm) {
          a.tackles++;
          for (const [o, d] of mm) if (d === t || o.climb === t) bump(a.owed, o.slot);
        }
        if (mm) {
          for (const [o] of mm) {
            if (!o.poaJob) continue;
            const e = a.poa.get(o.slot) ?? { held: 0, n: 0, job: o.poaJob };
            e.n++;
            if ((heldAt as Set<Player> | null)?.has(o)) e.held++;
            a.poa.set(o.slot, e);
          }
        }
      }
      a.cells.set(`${c.id}@${lvl}`, cell);
      if (shortCell.n) a.cells.set(`${c.id}*3rd1@${lvl}`, shortCell);
    }
  }
  a.onAim = on / Math.max(1, carries);
  return a;
}

const pct = (x: number) => `${Math.round(x * 100)}`.padStart(3);

/** The audit's lines for each run (or `only`), with its flags first, then the success grid. */
export function auditReport(only?: string[], reps = AUDIT.reps): string[] {
  const out = [
    `RUN AUDIT: every designed run against ${AUDIT.calls.join(', ')} (short-yardage plays also Goal Line, and 3rd and 1 on half the Bear and Goal snaps), defense at ${AUDIT.levels.map((l) => (l > 0 ? '+' : '') + l).join(' / ')} against a 70 offense, ${reps} snaps a cell.`,
    `Snap flags (shown on ${pct(AUDIT.show)}%+ of snaps): IDLE no job; DEAD DOUBLE two on one, nobody climbs, with a playside man free; WRONG SIDE a lead or kick on a backside man; FREE PLAYSIDE a playside box defender nobody has (box/hats per call shown).`,
    `OWES: a blocker whose man at the snap made ${pct(AUDIT.owed)}%+ of the tackles. POA: a pull, lead or kick on a man as the ball gets 2 yd past the line under ${pct(AUDIT.poaHeld)}%. Grid: success % (4+ yd; 3rd and 1: a gain of 1+) / ypc, by call, at each defense level.`,
  ];
  const summary: string[] = [];
  for (const p of PLAYBOOK) {
    if (p.kind !== 'run' || (only && !only.includes(p.id))) continue;
    const a = auditPlay(p, reps);
    const flags = [...a.flags.entries()].filter(([, v]) => v / Math.max(1, a.snaps) >= AUDIT.show).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${pct(v / a.snaps)}%`);
    const owes = [...a.owed.entries()].filter(([, v]) => v / Math.max(1, a.tackles) >= AUDIT.owed).map(([k, v]) => `OWES ${k} ${pct(v / a.tackles)}%`);
    const poa = [...a.poa.entries()].filter(([, e]) => e.held / e.n < AUDIT.poaHeld).map(([k, e]) => `POA ${k}(${e.job}) held ${pct(e.held / e.n)}%`);
    const all = [...flags.filter((f) => !f.startsWith('FREE')), ...owes, ...poa];
    out.push('', `=== ${p.name} (${p.id}) | ${p.formation.name} | ${p.tags.concept} | beats ${p.tags.beats.join(',') || '-'} stops ${p.tags.stops.join(',') || '-'} | aim ${a.aim} on aim ${pct(a.onAim)}%`);
    out.push(`  tip: ${p.tip}`);
    out.push(`  box/hats: ${[...a.boxHats.entries()].map(([c, v]) => `${c} ${v}`).join('  ')}`);
    out.push(`  flags: ${all.length ? all.join(' | ') : 'none'}`);
    const free = flags.filter((f) => f.startsWith('FREE'));
    if (free.length) out.push(`  free playside: ${free.join(' | ')}`);
    for (const [front, cards] of a.cards) {
      const top = [...cards.entries()].sort((x, y) => y[1] - x[1]).slice(0, 2);
      for (const [card, n] of top) out.push(`  card ${front.padEnd(5)} ${card} (${n})`);
    }
    const cols = [...new Set([...a.cells.keys()].map((k) => k.split('@')[0]))];
    out.push(`  ${'call'.padEnd(12)}${AUDIT.levels.map((l) => `def ${(l > 0 ? '+' : '') + l}`.padEnd(14)).join('')}`);
    for (const col of cols) {
      out.push(
        `  ${col.padEnd(12)}${AUDIT.levels
          .map((l) => {
            const c = a.cells.get(`${col}@${l}`)!;
            return c && c.n ? `${pct(c.succ / c.n)}% ${(c.yds / c.n).toFixed(1).padStart(5)}  `.padEnd(14) : '-'.padEnd(14);
          })
          .join('')}`,
      );
    }
    if (all.length || a.onAim < 0.5) summary.push(`${p.name.padEnd(22)} on aim ${pct(a.onAim)}% | ${all.join(' | ') || '-'}`);
  }
  out.push('', 'SUMMARY (plays with a flag or under 50% on aim):', ...summary);
  return out;
}
