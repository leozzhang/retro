import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { adaptiveRows } from './adaptive';

// `npm run adapt`: the balance report's ADAPTIVE section alone, to adapt.txt (ADAPT_ONLY=name,... limits the scripts).
it.runIf(process.env.npm_lifecycle_event === 'adapt')('adaptive report', () => {
  writeFileSync(process.env.ADAPT_OUT ?? 'adapt.txt', adaptiveRows().join('\n'));
}, 3_600_000);
