// Gives the game (src/engine/storage.ts) file storage for saves, and nothing else from Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gridironStore', {
  read: (key) => ipcRenderer.invoke('store:read', key),
  write: (key, data) => ipcRenderer.invoke('store:write', key, data),
  remove: (key) => ipcRenderer.invoke('store:remove', key),
});
