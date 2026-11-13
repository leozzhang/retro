import { it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { STEP } from './engine/constants';
import { mulberry32 } from './engine/math';
import * as H from './harness';

/**
 * `npm run trace` (docs/FILM.md, "Tracing a snap"): one play against one call, snap by snap, for when a
 * RUNFIT or film row needs a why. It prints each blocker's assignment at the snap (`mark`, `^climb`,
 * `@poa`, `(job)`), then at each time in TRACE_T every player's spot (yd past the LOS, yd from the ball)
 * with who he's engaged with (`>` blocking, `<` blocked by) and each defender's run job, and how it ended.
 * TRACE_PLAY=id TRACE_CALL=id [TRACE_N=snaps] [TRACE_T=0.3,0.7,1.1] [TRACE_SEED=n] [TRACE_LVL=n: a 70 offense against a 70+n defense,
 * the audit's matchups; else the reference teams]. The harness's
 * auto-runner hands off at the first chance; passes aren't thrown (use the film room's FILM_EXPLAIN).
 */
it.runIf(!!process.env.TRACE_PLAY)('trace', () => {
  const p = PLAYBOOK.find((x) => x.id === process.env.TRACE_PLAY);
  const c = DEF_CALLS.find((x) => x.id === process.env.TRACE_CALL);
  if (!p || !c) throw new Error(`trace: no play ${process.env.TRACE_PLAY} or call ${process.env.TRACE_CALL}`);
  const times = (process.env.TRACE_T ?? '0.3,0.7,1.1').split(',').map(Number);
  const out: string[] = [];
  for (let n = 1; n <= Number(process.env.TRACE_N ?? 2); n++) {
    const m = process.env.TRACE_LVL ? H.referenceMatchup(70, 70 + Number(process.env.TRACE_LVL)) : H.referenceMatchup();
    const play = H.newPlay(m, p, c, mulberry32(n * 977 + Number(process.env.TRACE_SEED ?? 0)));
    play.snap();
    const los = H.LOS;
    const at = (q: { slot: string; pos: { x: number; y: number } }) => `${q.slot}(${(q.pos.x - los).toFixed(1)},${(q.pos.y - play.ballY).toFixed(1)})`;
    out.push(`=== ${p.name} vs ${c.name}, snap ${n}`);
    let ti = 0;
    let jobs = false;
    for (let t = 0; t < 10 && play.phase !== 'over'; t += STEP) {
      if (play.giveDue()) play.handoff();
      if (play.handedOff || play.kept || (p.qbRun && play.phase === 'run')) play.controlled = null;
      play.update(STEP, H.fakeInput, H.cam);
      if (!jobs) {
        jobs = true;
        const blockers = play.off.filter((o) => o.isBlocker && o.role !== 'QB');
        out.push(' JOBS ' + blockers.map((o) => `${o.slot}:${o.mark?.slot ?? '-'}${o.climb ? '^' + o.climb.slot : ''}${o.poa ? '@' + o.poa.slot : ''}${o.poaJob ? '(' + o.poaJob + ')' : ''}${o.hinge ? '(hinge)' : ''}`).join(' '));
      }
      const since = play.time - play.snapTime;
      if (ti < times.length && since >= times[ti]) {
        ti++;
        out.push(`--- t=${since.toFixed(2)} ball ${play.carrier ? at(play.carrier) : '-'}`);
        out.push(' OFF ' + play.off.map((o) => at(o) + (o.engaged ? '>' + o.engaged.slot : '')).join(' '));
        out.push(' DEF ' + play.def.map((d) => at(d) + (d.runJob ? `[${d.runJob}]` : '') + (d.engagedBy.length ? '<' + d.engagedBy.map((b) => b.slot).join('+') : '')).join(' '));
      }
    }
    const o = play.outcome;
    out.push(`=== ${o?.type ?? 'none'} ${(o ? o.spot - los : 0).toFixed(1)} yd, tackled by ${play.tackler?.slot ?? '-'}`, '');
  }
  console.log(out.join('\n'));
});
