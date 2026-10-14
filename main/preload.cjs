// Preload: exposes a small, explicit API to the renderer (window.kami).
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch, fn) => ipcRenderer.on(ch, (_e, ...a) => fn(...a));

function fileUrl(p) {
  if (!p) return '';
  if (/^(blob|data|https?|file):/i.test(p)) return p;
  let s = String(p).replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s;
  return 'file://' + encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

const info = ipcRenderer.sendSync('app:info');

contextBridge.exposeInMainWorld('kami', {
  isElectron: true,
  platform: process.platform,
  version: info.version,
  versions: info.versions,

  openProjectDialog: () => invoke('dialog:openProject'),
  saveProjectDialog: (name) => invoke('dialog:saveProject', name),
  readFile: (p) => invoke('fs:read', p),
  writeFile: (p, text) => invoke('fs:write', p, text),
  importMediaDialog: (opts) => invoke('dialog:importMedia', opts || {}),
  resolveMedia: (projectPath, items) => invoke('media:resolve', projectPath, items),
  relativizeMedia: (projectPath, paths) => invoke('media:relativize', projectPath, paths),
  exists: (paths) => invoke('fs:exists', paths),
  fileUrl,
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },

  getDisplays: () => invoke('displays:list'),
  placeStage: (frameName, opts) => invoke('stage:place', frameName, opts),

  oscListen: (port) => invoke('osc:listen', port),
  oscSend: (host, port, address, args) => ipcRenderer.send('osc:send', host, port, address, args),
  onOsc: (fn) => on('osc:message', fn),
  artnetSend: (host, universe, data) => ipcRenderer.send('artnet:send', host, universe, data),

  onMenu: (fn) => on('menu', fn),
  onBeforeClose: (fn) => on('app:before-close', fn),
  confirmClose: () => ipcRenderer.send('app:confirm-close'),
  onOpenFile: (fn) => on('app:open-file', fn),
  pendingOpenFile: () => invoke('app:pending-file'),
  appReady: () => ipcRenderer.send('app:ready'),
  setTitle: (t) => ipcRenderer.send('app:title', t),
  setDirty: (d) => ipcRenderer.send('app:dirty', d),

  getRecent: () => invoke('recent:get'),
  addRecent: (p) => ipcRenderer.send('recent:add', p),
  getPrefs: () => invoke('prefs:get'),
  setPrefs: (p) => ipcRenderer.send('prefs:set', p),
  writeRecovery: (text) => ipcRenderer.send('recovery:write', text),
  readRecovery: () => invoke('recovery:read'),
  clearRecovery: () => ipcRenderer.send('recovery:clear'),
  listExamples: () => invoke('examples:list'),

  openExternal: (url) => ipcRenderer.send('shell:open', url),
  showItemInFolder: (p) => ipcRenderer.send('shell:show', p),
});
