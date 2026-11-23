import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { kicksReport } from './kicks';

it.runIf(process.env.npm_lifecycle_event === 'kicks')('kicks report', () => {
  const only = process.env.KICKS_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  writeFileSync(process.env.KICKS_OUT ?? 'kicks.txt', kicksReport(only).join('\n'));
}, 600_000);
