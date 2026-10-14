// Fallback bridge used when the renderer runs outside Electron (browser preview,
// automated UI tests). Network features are inert; files come from <input type=file>.

export function createWebBridge() {
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return null; };
  const pick = (accept, multiple) => new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => resolve([...i.files]);
    i.click();
  });
  const urls = new Map();
  return {
    isElectron: false,
    platform: 'web',
    version: '1.1.0',
    async openProjectDialog() {
      const [f] = await pick('.kamic,application/json', false);
      if (!f) return null;
      return { path: f.name, text: await f.text() };
    },
    async saveProjectDialog(name) { return name.endsWith('.kamic') ? name : `${name}.kamic`; },
    async writeFile(path, text) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = path.split(/[\\/]/).pop();
      a.click();
      return true;
    },
    async readFile(p) { const r = await fetch(p); return r.text(); },
    async importMediaDialog() {
      const files = await pick('video/*,image/*,audio/*', true);
      return files.map((f) => { const u = URL.createObjectURL(f); urls.set(f.name, u); return { path: f.name, name: f.name }; });
    },
    fileUrl(p) { return urls.get(p) || p; },
    async exists(paths) { return paths.map(() => true); },
    async getDisplays() { return [{ id: 1, label: 'Built-in display', bounds: { x: 0, y: 0, width: screen.width, height: screen.height }, primary: true }]; },
    placeStage() {},
    oscListen() { return Promise.resolve({ ok: false, error: 'OSC requires the desktop app' }); },
    oscSend() {},
    onOsc() {},
    artnetSend() {},
    onMenu() {},
    setTitle(t) { document.title = t; },
    setDirty() {},
    getRecent() { return store('kami.recent') || []; },
    addRecent(p) { const r = (store('kami.recent') || []).filter((x) => x !== p); r.unshift(p); store('kami.recent', r.slice(0, 10)); },
    writeRecovery(text) { store('kami.recovery', text); },
    readRecovery() { return Promise.resolve(store('kami.recovery')); },
    clearRecovery() { try { localStorage.removeItem('kami.recovery'); } catch { /* ignore */ } },
    getPrefs() { return Promise.resolve(store('kami.prefs') || {}); },
    setPrefs(p) { store('kami.prefs', p); },
    listExamples() { return Promise.resolve([]); },
    openExternal(u) { window.open(u, '_blank'); },
    onBeforeClose() {},
    confirmClose() {},
    showItemInFolder() {},
    onOpenFile() {},
    appReady() {},
  };
}
