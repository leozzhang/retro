// The desktop app's main process: one game window, plus file storage for saves (src/engine/storage.ts).
// In dev (`npm run app`) the window loads the Vite dev server at VITE_DEV_URL; packaged, it loads dist/.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const KEY_RE = /^[a-z0-9-]+$/;

/** Saves live in the user's app data folder (%APPDATA%/Saturday Gridiron/saves on Windows). */
function saveFile(key) {
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new Error(`bad storage key: ${key}`);
  return path.join(app.getPath('userData'), 'saves', `${key}.bin`);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

ipcMain.handle('store:read', async (_e, key) => {
  try {
    return await fs.readFile(saveFile(key));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
});

// Atomic: write a temp file, keep the last good save as .bak, then rename the temp into place.
// A crash mid-write leaves either the old save or the new one, never half of one.
ipcMain.handle('store:write', async (_e, key, data) => {
  const file = saveFile(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, data);
  if (await exists(file)) await fs.copyFile(file, `${file}.bak`);
  await fs.rename(tmp, file);
});

ipcMain.handle('store:remove', async (_e, key) => {
  await fs.rm(saveFile(key), { force: true });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    useContentSize: true,
    backgroundColor: '#0b0f0b',
    autoHideMenuBar: true,
    title: 'Saturday Gridiron',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);
  // F11 toggles fullscreen (the game itself never uses F11).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  const devUrl = process.env.VITE_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
