import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEF_CALLS } from './data/defenses';
import { PLAYBOOK } from './data/plays';
import { runfitReport, runStats } from './runfit';

describe('runfit', () => {
  it('classifies every run, and an ablation stands blockers down', () => {
    const power = PLAYBOOK.find((p) => p.id === 'power')!;
    const s = runStats(power, DEF_CALLS.slice(0, 1), 6, 1);
    expect(s.n).toBeGreaterThan(0);
    expect(Object.values(s.how).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    const cut = runStats(power, DEF_CALLS.slice(0, 1), 6, 1, { backside: 5 });
    expect(cut.ypc).toBeLessThan(s.ypc + 5); // runs, and the line standing down doesn't help
  });
});

// `npm run runfit`: the RUNFIT section on its own, to runfit.txt (RUNFIT_ONLY=id,..., RUNFIT_REPS=n).
it.runIf(process.env.npm_lifecycle_event === 'runfit')('runfit report', () => {
  const only = process.env.RUNFIT_ONLY?.split(',').map((x) => x.trim()).filter(Boolean);
  const lines = runfitReport(Number(process.env.RUNFIT_REPS ?? 60), undefined, only);
  writeFileSync(process.env.RUNFIT_OUT ?? 'runfit.txt', lines.join('\n'));
}, 3_600_000);
