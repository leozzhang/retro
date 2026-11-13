import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { PLAYBOOK } from './data/plays';
import { auditPlay, auditReport } from './runAudit';

it('audits a run', () => {
  const a = auditPlay(PLAYBOOK.find((p) => p.id === 'power')!, 2);
  expect(a.snaps).toBeGreaterThan(0);
  expect(a.cells.size).toBeGreaterThan(0);
});

// `npm run audit`: every designed run against every front and three defense levels -> audit.txt (AUDIT_ONLY=id,..., AUDIT_REPS=n).
it.runIf(process.env.npm_lifecycle_event === 'audit')('run audit', () => {
  const only = process.env.AUDIT_ONLY?.split(',').map((x) => x.trim()).filter(Boolean);
  writeFileSync(process.env.AUDIT_OUT ?? 'audit.txt', auditReport(only, Number(process.env.AUDIT_REPS ?? 30)).join('\n'));
}, 3_600_000);
