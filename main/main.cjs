// KamiCreative — Electron main process.
'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, screen, shell, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const dgram = require('dgram');
const { encodeMessage, decode } = require('./osc.cjs');
const { artDmx, ARTNET_PORT } = require('./artnet.cjs');

const ROOT = path.join(__dirname, '..');
const isDev = !app.isPackaged;
const PRODUCT = 'KamiCreative';

// Rendering: real-time video wants the GPU even on blocklisted drivers, and must
// not be throttled when the editor is in the background during a show.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId('com.kamicreative.app');

nativeTheme.themeSource = 'dark';

let mainWindow = null;
let forceQuit = false;
let pendingFile = fileFromArgv(process.argv);
const stageWindows = new Map(); // frameName -> BrowserWindow

// ------------------------------------------------------------------ storage

const userFile = (name) => path.join(app.getPath('userData'), name);

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(userFile(name), 'utf8')); } catch { return fallback; }
}
function writeJSON(name, data) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(userFile(name), JSON.stringify(data, null, 2));
  } catch (e) { console.error('writeJSON', name, e); }
}

function fileFromArgv(argv) {
  const args = argv.slice(app.isPackaged ? 1 : 2);
  return args.find((a) => /\.kamic$/i.test(a) && fs.existsSync(a)) || null;
}

async function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  try { await fsp.copyFile(file, `${file}.bak`); } catch { /* first save */ }
  await fsp.rename(tmp, file);
}

function examplesDir() {
  const packaged = path.join(process.resourcesPath || '', 'examples');
  return fs.existsSync(packaged) ? packaged : path.join(ROOT, 'examples');
}

// ------------------------------------------------------------------ windows

function createMainWindow() {
  const state = readJSON('window.json', { width: 1600, height: 960, maximized: true });
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#111419',
    title: PRODUCT,
    icon: path.join(ROOT, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(ROOT, 'src', 'index.html'));

  // Stage output windows are opened by the renderer (same process => zero-copy GPU blits).
  mainWindow.webContents.setWindowOpenHandler(({ frameName, url }) => {
    if (frameName && frameName.startsWith('kami-stage-')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 960, height: 540, backgroundColor: '#000000', autoHideMenuBar: true, title: 'Stage',
          icon: path.join(ROOT, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
          webPreferences: { backgroundThrottling: false },
        },
      };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-create-window', (win, details) => {
    const name = details.frameName;
    win.setMenuBarVisibility(false);
    stageWindows.set(name, win);
    win.on('closed', () => { if (stageWindows.get(name) === win) stageWindows.delete(name); });
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  const saveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const b = mainWindow.getNormalBounds();
    writeJSON('window.json', { ...b, maximized: mainWindow.isMaximized() });
  };
  mainWindow.on('close', (e) => {
    saveState();
    if (!forceQuit) {
      e.preventDefault();
      mainWindow.webContents.send('app:before-close');
    }
  });
  mainWindow.on('closed', () => {
    for (const w of stageWindows.values()) if (!w.isDestroyed()) w.destroy();
    mainWindow = null;
  });
}

function send(cmd) { mainWindow?.webContents.send('menu', cmd); }

// ------------------------------------------------------------------ menu

function buildMenu() {
  const recent = readJSON('recent.json', []).filter((p) => fs.existsSync(p));
  let examples = [];
  try { examples = fs.readdirSync(examplesDir()).filter((f) => f.endsWith('.kamic')).sort(); } catch { /* none */ }
  const item = (label, cmd, accelerator, extra = {}) => ({ label, accelerator, registerAccelerator: false, click: () => send(cmd), ...extra });
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '&File',
      submenu: [
        item('New Project', 'new', 'CmdOrCtrl+N'),
        item('Open…', 'open', 'CmdOrCtrl+O'),
        { label: 'Open Recent', submenu: recent.length ? [...recent.map((p) => ({ label: p, click: () => send(`openPath:${p}`) })), { type: 'separator' }, { label: 'Clear Recent', click: () => { writeJSON('recent.json', []); buildMenu(); } }] : [{ label: 'No recent projects', enabled: false }] },
        { label: 'Open Example', submenu: examples.length ? examples.map((f) => ({ label: f.replace(/^\d+[-_ ]*/, '').replace(/\.kamic$/, '').replace(/[-_]/g, ' '), click: () => send(`example:${path.join(examplesDir(), f)}`) })) : [{ label: 'No examples installed', enabled: false }] },
        { type: 'separator' },
        item('Save', 'save', 'CmdOrCtrl+S'),
        item('Save As…', 'saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        item('Import Media…', 'import', 'CmdOrCtrl+I'),
        { type: 'separator' },
        item('Preferences…', 'prefs', 'CmdOrCtrl+,'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { label: 'E&xit', click: () => mainWindow?.close() },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        item('Undo', 'undo', 'CmdOrCtrl+Z'),
        item('Redo', 'redo', 'CmdOrCtrl+Shift+Z'),
        { type: 'separator' },
        item('Cut', 'cut', 'CmdOrCtrl+X'),
        item('Copy', 'copy', 'CmdOrCtrl+C'),
        item('Paste', 'paste', 'CmdOrCtrl+V'),
        item('Duplicate', 'duplicate', 'CmdOrCtrl+D'),
        item('Delete', 'delete', 'Delete'),
        { type: 'separator' },
        item('Select All', 'selectAll', 'CmdOrCtrl+A'),
        item('Bypass Selected', 'bypass', 'B'),
        { type: 'separator' },
        item('Add Module…', 'addModule', 'Tab'),
      ],
    },
    {
      label: '&View',
      submenu: [
        item('Toggle Patch / Live', 'toggleLive', 'CmdOrCtrl+L'),
        { type: 'separator' },
        item('Frame All', 'frame', 'F'),
        item('Zoom In', 'zoomIn', 'CmdOrCtrl+='),
        item('Zoom Out', 'zoomOut', 'CmdOrCtrl+-'),
        item('Actual Size', 'zoomReset', 'CmdOrCtrl+0'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }, { role: 'reload' }] : [{ role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Alt+I' }]),
      ],
    },
    {
      label: '&Scene',
      submenu: [
        item('Next Scene', 'next', 'PageDown'),
        item('Previous Scene', 'prev', 'PageUp'),
        { type: 'separator' },
        item('New Scene', 'newScene', 'CmdOrCtrl+Shift+N'),
      ],
    },
    {
      label: 'S&tage',
      submenu: [
        item('Show All Stages', 'showStages', 'CmdOrCtrl+Shift+F'),
        item('Hide All Stages', 'hideStages'),
        { type: 'separator' },
        item('Projection Mapping…', 'mapping:1'),
        item('Stage Settings…', 'stageSettings:1'),
        item('Test Pattern', 'testPattern:1'),
      ],
    },
    {
      label: '&Help',
      submenu: [
        item('Keyboard Shortcuts', 'shortcuts', 'F1'),
        item('Module Reference', 'moduleRef'),
        item('Graphics Self-Test', 'selfTest'),
        { type: 'separator' },
        item('User Guide', 'docs'),
        item('Report an Issue', 'issues'),
        { type: 'separator' },
        item(`About ${PRODUCT}`, 'about'),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ OSC / Art-Net

let oscSocket = null;
let oscPort = null;
const sendSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
sendSocket.on('error', (e) => console.error('udp send', e.message));
sendSocket.bind(() => { try { sendSocket.setBroadcast(true); } catch { /* ignore */ } });
let artSeq = 0;

function oscListen(port) {
  return new Promise((resolve) => {
    if (oscSocket && oscPort === port) return resolve({ ok: true });
    if (oscSocket) { try { oscSocket.close(); } catch { /* ignore */ } oscSocket = null; oscPort = null; }
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let settled = false;
    sock.on('error', (e) => {
      if (!settled) { settled = true; resolve({ ok: false, error: `OSC port ${port}: ${e.message}` }); }
      try { sock.close(); } catch { /* ignore */ }
    });
    sock.on('message', (msg) => {
      try {
        for (const m of decode(msg)) mainWindow?.webContents.send('osc:message', m);
      } catch (e) { /* malformed packet: ignore */ }
    });
    sock.bind(port, () => {
      settled = true;
      oscSocket = sock;
      oscPort = port;
      resolve({ ok: true });
    });
  });
}

// ------------------------------------------------------------------ IPC

function registerIpc() {
  ipcMain.on('app:info', (e) => { e.returnValue = { version: app.getVersion(), versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node } }; });

  ipcMain.handle('dialog:openProject', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { title: 'Open Project', filters: [{ name: 'KamiCreative Project', extensions: ['kamic'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return { path: r.filePaths[0], text: await fsp.readFile(r.filePaths[0], 'utf8') };
  });
  ipcMain.handle('dialog:saveProject', async (_e, name) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Project', defaultPath: path.join(app.getPath('documents'), `${name || 'Untitled'}.kamic`),
      filters: [{ name: 'KamiCreative Project', extensions: ['kamic'] }],
    });
    if (r.canceled || !r.filePath) return null;
    return r.filePath.toLowerCase().endsWith('.kamic') ? r.filePath : `${r.filePath}.kamic`;
  });
  ipcMain.handle('dialog:importMedia', async (_e, opts) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: opts.single ? 'Locate Media' : 'Import Media',
      properties: opts.single ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'ogv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a', 'opus'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (r.canceled) return [];
    return r.filePaths.map((p) => ({ path: p, name: path.basename(p) }));
  });
  ipcMain.handle('fs:read', (_e, p) => fsp.readFile(p, 'utf8'));
  ipcMain.handle('fs:write', async (_e, p, text) => { await atomicWrite(p, text); return true; });
  ipcMain.handle('fs:exists', (_e, paths) => paths.map((p) => fs.existsSync(p)));
  ipcMain.handle('media:resolve', (_e, projectPath, items) => items.map((it) => {
    if (it.path && fs.existsSync(it.path)) return { path: it.path, exists: true };
    if (projectPath && it.rel) {
      const p = path.resolve(path.dirname(projectPath), it.rel);
      if (fs.existsSync(p)) return { path: p, exists: true };
    }
    return { path: it.path, exists: false };
  }));
  ipcMain.handle('media:relativize', (_e, projectPath, paths) => paths.map((p) => {
    try { return path.relative(path.dirname(projectPath), p).split(path.sep).join('/'); } catch { return null; }
  }));

  ipcMain.handle('displays:list', () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => ({ id: d.id, label: d.label || '', bounds: d.bounds, scaleFactor: d.scaleFactor, primary: d.id === primary }));
  });
  ipcMain.handle('stage:place', (_e, frameName, opts = {}) => {
    const tryPlace = (attempt) => {
      const win = stageWindows.get(frameName);
      if (!win) { if (attempt < 20) setTimeout(() => tryPlace(attempt + 1), 50); return; }
      if (opts.title) win.setTitle(`${opts.title} — ${PRODUCT}`);
      if (opts.toggleFullscreen) { win.setFullScreen(!win.isFullScreen()); return; }
      if (opts.displayId !== null && opts.displayId !== undefined) {
        const d = screen.getAllDisplays().find((x) => x.id === opts.displayId);
        if (d) {
          if (win.isFullScreen()) win.setFullScreen(false);
          win.setBounds(d.bounds);
          if (opts.fullscreen) setTimeout(() => { win.setFullScreen(true); win.setAlwaysOnTop(true, 'screen-saver'); }, 60);
          return;
        }
      }
      if (win.isFullScreen()) win.setFullScreen(false);
    };
    tryPlace(0);
    return true;
  });

  ipcMain.handle('osc:listen', (_e, port) => oscListen(port));
  ipcMain.on('osc:send', (_e, host, port, address, args) => {
    try { sendSocket.send(encodeMessage(address, args), port, host || '127.0.0.1'); } catch (e) { console.error('osc send', e.message); }
  });
  ipcMain.on('artnet:send', (_e, host, universe, data) => {
    try { sendSocket.send(artDmx(universe, data, (artSeq = (artSeq % 255) + 1)), ARTNET_PORT, host || '255.255.255.255'); } catch (e) { console.error('artnet', e.message); }
  });

  ipcMain.on('app:confirm-close', () => { forceQuit = true; mainWindow?.close(); });
  ipcMain.on('app:title', (_e, t) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(t); });
  ipcMain.on('app:dirty', (_e, d) => { if (mainWindow && process.platform === 'darwin') mainWindow.setDocumentEdited(!!d); });
  ipcMain.handle('app:pending-file', () => { const f = pendingFile; pendingFile = null; return f; });
  ipcMain.on('app:ready', () => {});

  ipcMain.handle('recent:get', () => readJSON('recent.json', []));
  ipcMain.on('recent:add', (_e, p) => {
    const list = [p, ...readJSON('recent.json', []).filter((x) => x !== p)].slice(0, 12);
    writeJSON('recent.json', list);
    if (process.platform === 'win32') app.addRecentDocument(p);
    buildMenu();
  });
  ipcMain.handle('prefs:get', () => readJSON('prefs.json', {}));
  ipcMain.on('prefs:set', (_e, p) => writeJSON('prefs.json', p));
  ipcMain.on('recovery:write', (_e, text) => { try { fs.writeFileSync(userFile('recovery.json'), text); } catch { /* ignore */ } });
  ipcMain.handle('recovery:read', () => { try { return fs.readFileSync(userFile('recovery.json'), 'utf8'); } catch { return null; } });
  ipcMain.on('recovery:clear', () => { try { fs.unlinkSync(userFile('recovery.json')); } catch { /* none */ } });
  ipcMain.handle('examples:list', () => {
    try {
      const dir = examplesDir();
      return fs.readdirSync(dir).filter((f) => f.endsWith('.kamic')).sort().map((f) => ({ name: f.replace(/\.kamic$/, ''), path: path.join(dir, f) }));
    } catch { return []; }
  });

  ipcMain.on('shell:open', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
  ipcMain.on('shell:show', (_e, p) => { if (p) shell.showItemInFolder(p); });
}

// ------------------------------------------------------------------ lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (f) mainWindow.webContents.send('app:open-file', f);
    }
  });
  app.on('open-file', (e, f) => { e.preventDefault(); if (mainWindow) mainWindow.webContents.send('app:open-file', f); else pendingFile = f; });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(['media', 'midi', 'midiSysex', 'fullscreen', 'clipboard-sanitized-write'].includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'midi', 'midiSysex', 'fullscreen'].includes(permission));
    registerIpc();
    buildMenu();
    createMainWindow();
    screen.on('display-added', buildMenu);
    screen.on('display-removed', buildMenu);
    app.on('activate', () => { if (!mainWindow) createMainWindow(); });
  });

  app.on('before-quit', () => { /* close is negotiated with the renderer via app:before-close */ });
  app.on('window-all-closed', () => {
    try { oscSocket?.close(); sendSocket.close(); } catch { /* ignore */ }
    app.quit();
  });
}
