const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadBuiltin: () => ipcRenderer.invoke('load-builtin'),
  loadCustom: () => ipcRenderer.invoke('load-custom'),
  saveCustom: (list) => ipcRenderer.invoke('save-custom', list),
  fetchPlaylist: (url) => ipcRenderer.invoke('fetch-playlist', url),
  openPlaylistFile: () => ipcRenderer.invoke('open-playlist-file'),
  setHeaders: (ua, ref) => ipcRenderer.invoke('set-headers', ua, ref)
});
