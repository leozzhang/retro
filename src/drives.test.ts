import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { adaptReport, drivesReport, unitsReport } from './drives';

// `npm run drives`: engine drives against the drive sim, to drives.txt (DRIVES_GAMES=n sets the games).
it.runIf(process.env.npm_lifecycle_event === 'drives')('drives report', () => {
  writeFileSync(process.env.DRIVES_OUT ?? 'drives.txt', (process.env.DRIVES_UNITS === '1' ? unitsReport() : process.env.DRIVES_ADAPT === '1' ? adaptReport() : drivesReport()).join('\n'));
}, 3_600_000);
