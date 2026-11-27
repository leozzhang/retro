import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { userdefReport } from './userdef';

// `npm run userdef`: the user's defender played by an oracle against the AI, to userdef.txt (docs/USERDEF.md).
it.runIf(process.env.npm_lifecycle_event === 'userdef')('userdef report', () => {
  writeFileSync(process.env.USERDEF_OUT ?? 'userdef.txt', userdefReport().join('\n'));
}, 3_600_000);
