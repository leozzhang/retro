// `npm run app`: the Vite dev server plus the desktop window pointed at it, so edits hot-reload in the
// app just as they do in the browser. Closing the window stops both.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electron = require('electron'); // the path to the Electron binary

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`vite at ${url}; opening the app`);

// Editors built on Electron (VS Code) can leave ELECTRON_RUN_AS_NODE set in their terminals, which
// would start Electron as plain Node with no window.
const env = { ...process.env, VITE_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE;
// Extra arguments go to Electron (`npm run app -- --remote-debugging-port=9222`).
const app = spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
app.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
