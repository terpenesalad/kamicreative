// KamiCreative — application controller.

import './nodes/index.js';
import { Emitter } from './core/emitter.js';
import { Engine } from './core/engine.js';
import { createProject, normaliseProject, cloneJSON, uid } from './core/project.js';
import { getNodeType, allNodeTypes, portsOf } from './core/registry.js';
import { Renderer } from './gl/gl.js';
import { StageRenderer } from './gl/stage-renderer.js';
import { createHost, mediaKind } from './host/host.js';
import { StageWindows } from './host/stage-windows.js';
import { Doc } from './ui/doc.js';
import { PatchEditor, isTyping } from './ui/patch.js';
import { LibraryPanel, openQuickAdd } from './ui/library.js';
import { Inspector } from './ui/inspector.js';
import { ScenesPanel } from './ui/scenes.js';
import { MediaPanel } from './ui/media.js';
import { StageStrip, openMapper, openStageSettings } from './ui/stages.js';
import { LivePanel } from './ui/live.js';
import { modal, confirmDialog, promptDialog, alertDialog, toast, showMenu } from './ui/dialogs.js';
import { h, icon, setText } from './ui/dom.js';

const APP_NAME = 'KamiCreative';

class App extends Emitter {
  constructor() {
    super();
    this.clipboard = null;
    this.mode = 'patch';
    this.fps = 60;
    this._frames = 0;
    this._lastFrame = 0;
    this._rafSeen = 0;
    this.renderer = new Renderer(document.getElementById('gl'));
    this.stageRenderer = new StageRenderer(this.renderer);
    this.host = createHost(this);
    this.engine = new Engine({ renderer: this.renderer, host: this.host });
    this.doc = new Doc(this.engine);
    this.stageWindows = new StageWindows(this);
    this.toast = toast;

    this.patch = new PatchEditor(document.getElementById('patch'), this);
    this.library = new LibraryPanel(document.getElementById('library'), this);
    this.inspector = new Inspector(document.getElementById('inspector'), this);
    this.scenes = new ScenesPanel(document.getElementById('scenes'), this);
    this.media = new MediaPanel(document.getElementById('media'), this);
    this.stages = new StageStrip(document.getElementById('stages'), this);
    this.live = new LivePanel(document.getElementById('live'), this);

    this._toolbar();
    this._statusbar();
    this._keys();
    this.doc.on('dirty', () => this.updateTitle());
    this.doc.on('load', () => this.updateTitle());
    this.engine.on('scene', () => { this.updateTitle(); this.emit('selection'); });
    this.engine.on('nodeError', () => {});
  }

  // ------------------------------------------------------------------ boot

  async start() {
    const bridge = this.host.bridge;
    bridge.onMenu((cmd) => this.command(cmd));
    bridge.onBeforeClose(() => this.requestClose());
    bridge.onOpenFile((p) => this.openPath(p));

    this.prefs = { ...(await bridge.getPrefs()) };
    this.host.midi.init();

    const pending = bridge.pendingOpenFile ? await bridge.pendingOpenFile() : null;
    let loaded = false;
    if (pending) loaded = await this.openPath(pending, { silent: true });
    if (!loaded) {
      const rec = await bridge.readRecovery();
      if (rec) {
        const choice = await confirmDialog('Recover unsaved work?', 'KamiCreative did not close cleanly last time. Restore the project you were working on?', { ok: 'Restore', cancel: 'Discard' });
        if (choice) {
          try {
            const data = JSON.parse(rec);
            this.doc.load(normaliseProject(data.project), data.path || null);
            this.doc.markDirty();
            loaded = true;
          } catch (e) { toast(`Could not restore: ${e.message}`, { kind: 'error' }); }
        }
        bridge.clearRecovery();
      }
    }
    if (!loaded && !this.prefs.welcomeShown) {
      const ex = (await bridge.listExamples()).find((e) => /welcome/i.test(e.name));
      if (ex) loaded = await this.openPath(ex.path, { silent: true, asTemplate: true });
      this.prefs.welcomeShown = true;
      bridge.setPrefs(this.prefs);
    }
    if (!loaded) this.doc.load(createProject());
    await this.host.osc.listen(this.doc.project.settings.oscPort);

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    // Fallback driver: keeps stage outputs alive when the editor window is minimised.
    // rAF stops for minimised windows; only then does the timer take over (~60 Hz).
    setInterval(() => { if (performance.now() - this._rafSeen > 250) this._loop(performance.now(), true); }, 16);
    setInterval(() => this._autosave(), 30000);
    bridge.appReady?.();
  }

  _loop(now, fromTimer = false) {
    if (!fromTimer) { this._rafSeen = performance.now(); requestAnimationFrame(this._loop); }
    if (now - this._lastFrame < 4) return;
    const dt = now - this._lastFrame;
    this._lastFrame = now;
    this.fps = this.fps * 0.95 + (1000 / Math.max(1, dt)) * 0.05;
    this._frames++;
    const p = this.doc.project;
    if (!p) return;
    try {
      this.renderer.stats.draws = 0;
      const layers = this.engine.step(now);
      const results = this.stageRenderer.render(p.stages, layers, this.engine.time, { outlineStage: this.mapperOutline });
      this.stageRenderer.present(p.stages, results);
      this.host.artnet.flush(now);
      const f = this._frames;
      if (this.mode === 'patch') {
        if (f % 2 === 0) this.patch.refresh();
        if (p.settings.previews !== false && f % 3 === 0) this.patch.drawPreviews();
        if (f % 6 === 0) this.inspector.refresh();
      } else if (f % 2 === 0) this.live.refresh();
      if (f % 15 === 0) this._paintStatus();
    } catch (e) {
      console.error(e);
      if (!this._lastError || now - this._lastError > 5000) { toast(`Render error: ${e.message}`, { kind: 'error' }); this._lastError = now; }
    }
  }

  // --------------------------------------------------------------- chrome

  _toolbar() {
    const bar = document.getElementById('toolbar');
    this.titleEl = h('span.doc-title');
    this.sceneEl = h('span.doc-scene');
    const seg = h('div.seg.mode-seg', { role: 'tablist' });
    const mk = (id, label, ic) => h('button', { role: 'tab', dataset: { mode: id }, onclick: () => this.setMode(id) }, icon(ic, 14), label);
    seg.append(mk('patch', 'Patch', 'layers'), mk('live', 'Live', 'sliders'));
    this.modeSeg = seg;
    bar.append(
      h('div.brand', null, h('img', { src: '../assets/logo.svg', alt: '', width: 22, height: 22 }), h('span', null, APP_NAME)),
      h('div.doc-info', null, this.titleEl, this.sceneEl),
      seg,
      h('div.tb-spacer'),
      h('button.icon-btn', { title: 'Undo (Ctrl+Z)', onclick: () => this.command('undo') }, icon('undo', 15)),
      h('button.icon-btn', { title: 'Redo (Ctrl+Shift+Z)', onclick: () => this.command('redo') }, icon('redo', 15)),
      h('span.tb-sep'),
      h('button.icon-btn', { title: 'Previous scene (Page Up)', onclick: () => this.command('prev') }, icon('prev', 15)),
      h('button.go-mini', { title: 'Next scene (Page Down)', onclick: () => this.command('next') }, 'GO'),
      h('span.tb-sep'),
      h('button.btn.small', { title: 'Show all stage windows (Ctrl+Shift+F)', onclick: () => this.command('showStages') }, icon('monitor', 14), 'Show stages'),
      h('button.icon-btn', { title: 'Preferences', onclick: () => this.command('prefs') }, icon('gear', 15)),
    );
    this.setMode('patch');
  }

  setMode(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
    for (const b of this.modeSeg.children) { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    if (mode === 'live') this.live.render();
    else requestAnimationFrame(() => { this.patch._measureAll(); this.patch.drawWires(); });
  }

  _statusbar() {
    const sb = document.getElementById('statusbar');
    this.st = {
      fps: h('span.st-item', { title: 'Frames per second' }),
      draws: h('span.st-item', { title: 'GPU draw calls per frame' }),
      midi: h('span.st-item', { title: 'MIDI devices (in / out)' }),
      osc: h('span.st-item', { title: 'OSC listening port' }),
      artnet: h('span.st-item', { title: 'Art-Net output' }),
      msg: h('span.st-msg'),
    };
    sb.append(this.st.fps, this.st.draws, h('span.st-gap'), this.st.msg, h('span.st-gap'), this.st.midi, this.st.osc, this.st.artnet);
    this.doc.on('history', (label) => { setText(this.st.msg, label); });
  }

  _paintStatus() {
    const s = this.host.status, now = performance.now();
    setText(this.st.fps, `${Math.round(this.fps)} fps`);
    setText(this.st.draws, `${this.renderer.stats.draws} draws`);
    this.st.midi.textContent = `MIDI ${s.midiIn}/${s.midiOut}`;
    this.st.midi.classList.toggle('act', now - s.midiActivity < 250);
    this.st.osc.textContent = s.oscPort ? `OSC :${s.oscPort}` : 'OSC off';
    this.st.osc.title = s.oscError || 'OSC listening port';
    this.st.osc.classList.toggle('act', now - s.oscActivity < 250);
    this.st.osc.classList.toggle('err', !!s.oscError);
    this.st.artnet.textContent = 'Art-Net';
    this.st.artnet.classList.toggle('act', now - s.artnetActivity < 250);
    this.st.artnet.classList.toggle('dim', !this.host.artnet.universes.size);
  }

  updateTitle() {
    const p = this.doc.project;
    if (!p) return;
    const name = this.doc.path ? this.doc.path.split(/[\\/]/).pop().replace(/\.kamic$/, '') : p.meta.name || 'Untitled';
    setText(this.titleEl, name + (this.doc.dirty ? ' •' : ''));
    const i = p.scenes.findIndex((s) => s.id === p.activeScene);
    setText(this.sceneEl, `Scene ${i + 1} of ${p.scenes.length}: ${p.scenes[i]?.name || ''}`);
    this.host.bridge.setTitle(`${name}${this.doc.dirty ? ' •' : ''} — ${APP_NAME}`);
    this.host.bridge.setDirty(this.doc.dirty);
  }

  // ------------------------------------------------------------- keyboard

  _keys() {
    window.addEventListener('keydown', (e) => this.handleGlobalKey(e, false));
    window.addEventListener('keyup', (e) => { if (!isTyping(e)) this.engine.dispatch('Key', { key: e.key, down: false }); });
  }

  handleGlobalKey(e, fromStage) {
    if (document.querySelector('.modal-backdrop') && !fromStage) return;
    const typing = !fromStage && isTyping(e);
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const run = (cmd) => { e.preventDefault(); this.command(cmd); };
    if (mod) {
      if (k === 's') return run(e.shiftKey ? 'saveAs' : 'save');
      if (k === 'o') return run('open');
      if (k === 'n') return run(e.shiftKey ? 'newScene' : 'new');
      if (k === 'i') return run('import');
      if (k === 'l') return run('toggleLive');
      if (k === ',') return run('prefs');
      if (e.shiftKey && k === 'f') return run('showStages');
      if (typing) return;
      if (k === 'z') return run(e.shiftKey ? 'redo' : 'undo');
      if (k === 'y') return run('redo');
      if (k === 'c') return run('copy');
      if (k === 'x') return run('cut');
      if (k === 'v') return run('paste');
      if (k === 'd') return run('duplicate');
      if (k === 'a') return run('selectAll');
      if (k === '0') return run('zoomReset');
      if (k === '=' || k === '+') return run('zoomIn');
      if (k === '-') return run('zoomOut');
      if (/^[1-9]$/.test(k)) return run(`toggleStage:${k}`);
      return;
    }
    if (typing) return;
    if (e.key === 'PageDown') return run('next');
    if (e.key === 'PageUp') return run('prev');
    if (e.key === 'F1') return run('shortcuts');
    if (this.mode === 'live' && e.code === 'Space' && !e.repeat) { this.engine.dispatch('Key', { key: e.key, down: true }); return run('next'); }
    if (this.mode === 'patch' && !fromStage && document.activeElement?.closest?.('.patch-viewport, body') ) {
      if (e.key === 'Delete' || e.key === 'Backspace') return run('delete');
      if (k === 'f' && !e.repeat) return run('frame');
      if (k === 'b' && !e.repeat && this.doc.selection.size) return run('bypass');
      if (e.key === 'Tab') { e.preventDefault(); const pt = this.patch.pointer; return this.quickAdd(pt.x || innerWidth / 2, pt.y || innerHeight / 2, this.patch.toWorld(pt.x || innerWidth / 2, pt.y || innerHeight / 2)); }
      if (e.key === 'Escape') { this.doc.selection.clear(); this.doc.selectedLinks.clear(); this.patch.syncSelection(); }
    }
    this.engine.dispatch('Key', { key: e.key, down: true, repeat: e.repeat });
  }

  // ------------------------------------------------------------- commands

  async command(cmd) {
    const doc = this.doc;
    const [name, arg] = String(cmd).split(/:(.*)/s);
    switch (name) {
      case 'new': return this.newProject();
      case 'open': return this.openProject();
      case 'openPath': return this.openPath(arg);
      case 'save': return this.save();
      case 'saveAs': return this.save(true);
      case 'import': return this.importMedia();
      case 'undo': doc.undo(); break;
      case 'redo': doc.redo(); break;
      case 'copy': { const c = doc.copySelection(); if (c) { this.clipboard = c; toast(`Copied ${c.nodes.length} module${c.nodes.length > 1 ? 's' : ''}`); } break; }
      case 'cut': { const c = doc.copySelection(); if (c) { this.clipboard = c; doc.removeNodes([...doc.selection]); } break; }
      case 'paste': if (this.clipboard) { const pt = this.patch.pointer; const at = pt.x ? this.patch.toWorld(pt.x, pt.y) : null; doc.paste(this.clipboard, at); } break;
      case 'duplicate': { const c = doc.copySelection(); if (c) doc.paste(c); break; }
      case 'delete':
        if (doc.selectedLinks.size) doc.disconnect([...doc.selectedLinks]);
        if (doc.selection.size) doc.removeNodes([...doc.selection]);
        break;
      case 'selectAll': this.patch.select(doc.scene.nodes.map((n) => n.id)); break;
      case 'frame': this.patch.frameAll(doc.selection.size > 0); break;
      case 'zoomIn': this.patch.setZoom(this.patch.view.z * 1.2); break;
      case 'zoomOut': this.patch.setZoom(this.patch.view.z / 1.2); break;
      case 'zoomReset': this.patch.setZoom(1); break;
      case 'bypass': {
        const ids = [...doc.selection];
        const any = ids.some((id) => !doc.node(id)?.bypass);
        doc.setNodeAttr(ids, 'bypass', any || undefined, any ? 'Bypass' : 'Enable');
        break;
      }
      case 'addModule': { const r = document.getElementById('patch').getBoundingClientRect(); this.quickAdd(r.left + r.width / 2 - 150, r.top + 80, this.patch.centerWorld()); break; }
      case 'next': this.engine.gotoRelative(1); break;
      case 'prev': this.engine.gotoRelative(-1); break;
      case 'newScene': this.scenes.addScene(); break;
      case 'toggleLive': this.setMode(this.mode === 'live' ? 'patch' : 'live'); break;
      case 'showStages': for (const s of doc.project.stages) this.stageWindows.open(s); break;
      case 'hideStages': this.stageWindows.closeAll(); break;
      case 'toggleStage': { const s = doc.project.stages[+arg - 1]; if (s) this.stageWindows.toggle(s); break; }
      case 'mapping': openMapper(this, doc.project.stages[(+arg || 1) - 1]?.id || doc.project.stages[0].id); break;
      case 'stageSettings': openStageSettings(this, doc.project.stages[(+arg || 1) - 1]?.id || doc.project.stages[0].id); break;
      case 'testPattern': { const s = doc.project.stages[(+arg || 1) - 1]; if (s) doc.updateStage(s.id, (x) => { x.testPattern = !x.testPattern; }, { label: 'Test pattern' }); break; }
      case 'prefs': return this.showPrefs();
      case 'shortcuts': return this.showShortcuts();
      case 'about': return this.showAbout();
      case 'moduleRef': return this.showModuleReference();
      case 'selfTest': return this.showSelfTest();
      case 'docs': this.host.bridge.openExternal('https://github.com/terpenesalad/kamicreative#readme'); break;
      case 'website': this.host.bridge.openExternal('https://github.com/terpenesalad/kamicreative'); break;
      case 'issues': this.host.bridge.openExternal('https://github.com/terpenesalad/kamicreative/issues'); break;
      case 'example': return this.openPath(arg, { asTemplate: true });
      default: console.warn('Unknown command', cmd);
    }
    return undefined;
  }

  // ----------------------------------------------------------------- files

  async confirmDiscard() {
    if (!this.doc.dirty) return true;
    const r = await confirmDialog('Save changes?', 'This project has unsaved changes.', { ok: 'Save', cancel: 'Cancel', extra: "Don't save" });
    if (r === 'extra') return true;
    if (r === true) return this.save();
    return false;
  }

  async newProject() {
    if (!(await this.confirmDiscard())) return;
    this.stageWindows.closeAll();
    this.doc.load(createProject());
    this.host.bridge.clearRecovery();
  }

  async openProject() {
    if (!(await this.confirmDiscard())) return;
    const r = await this.host.bridge.openProjectDialog();
    if (!r) return;
    this._loadText(r.text, r.path);
  }

  async openPath(path, { silent = false, asTemplate = false } = {}) {
    if (!silent && !(await this.confirmDiscard())) return false;
    try {
      const text = await this.host.bridge.readFile(path);
      return this._loadText(text, asTemplate ? null : path, asTemplate);
    } catch (e) {
      if (!silent) alertDialog('Could not open project', `${path}\n\n${e.message || e}`);
      return false;
    }
  }

  async _loadText(text, path, asTemplate = false) {
    try {
      const project = normaliseProject(JSON.parse(text));
      if (path || asTemplate) await this._resolveMedia(project, path);
      this.stageWindows.closeAll();
      this.doc.load(project, path);
      if (path) this.host.bridge.addRecent(path);
      const missing = project.media.filter((m) => m.missing).length;
      if (missing) toast(`${missing} media file${missing > 1 ? 's are' : ' is'} missing. Right-click them in the Media Bin to relink.`, { kind: 'error', timeout: 6000 });
      if (this.engine.warnings.size) { toast([...this.engine.warnings][0], { kind: 'error' }); this.engine.warnings.clear(); }
      this.host.osc.listen(project.settings.oscPort);
      return true;
    } catch (e) {
      alertDialog('Could not open project', e.message || String(e));
      return false;
    }
  }

  async _resolveMedia(project, path) {
    if (!project.media.length || !this.host.bridge.resolveMedia) return;
    const res = await this.host.bridge.resolveMedia(path, project.media.map((m) => ({ path: m.path, rel: m.rel })));
    project.media.forEach((m, i) => { m.path = res[i].path; m.missing = !res[i].exists; });
  }

  serialize() {
    const p = cloneJSON(this.doc.project);
    for (const m of p.media) delete m.missing;
    p.meta.app = `${APP_NAME} ${this.host.bridge.version || ''}`.trim();
    return p;
  }

  async save(as = false) {
    const bridge = this.host.bridge;
    let path = this.doc.path;
    const p = this.serialize();
    if (as || !path) {
      path = await bridge.saveProjectDialog(p.meta.name || 'Untitled', null);
      if (!path) return false;
    }
    if (bridge.relativizeMedia) {
      const rel = await bridge.relativizeMedia(path, p.media.map((m) => m.path));
      p.media.forEach((m, i) => { m.rel = rel[i]; });
    }
    p.meta.name = path.split(/[\\/]/).pop().replace(/\.kamic$/, '');
    try {
      await bridge.writeFile(path, JSON.stringify(p, null, 2));
      this.doc.project.meta.name = p.meta.name;
      this.doc.markSaved(path);
      bridge.addRecent(path);
      bridge.clearRecovery();
      toast(`Saved ${p.meta.name}`);
      return true;
    } catch (e) {
      alertDialog('Could not save', e.message || String(e));
      return false;
    }
  }

  _autosave() {
    if (!this.doc.dirty) return;
    try { this.host.bridge.writeRecovery(JSON.stringify({ path: this.doc.path, project: this.serialize() })); } catch { /* ignore */ }
  }

  async requestClose() {
    const ok = await this.confirmDiscard();
    if (ok) {
      this.stageWindows.closeAll();
      this.host.bridge.clearRecovery();
      this.host.bridge.confirmClose();
    }
  }

  // ----------------------------------------------------------------- media

  async importMedia() {
    const files = await this.host.bridge.importMediaDialog();
    if (files?.length) this.importFiles(files);
  }

  importFiles(files) {
    const items = [];
    const rejected = [];
    for (const f of files) {
      const kind = mediaKind(f.name || f.path);
      if (kind) items.push({ path: f.path, name: f.name || f.path.split(/[\\/]/).pop(), kind });
      else rejected.push(f.name);
    }
    if (items.length) {
      const added = this.doc.addMedia(items);
      toast(`Imported ${added.length} file${added.length > 1 ? 's' : ''}`);
    }
    if (rejected.length) toast(`Skipped unsupported file${rejected.length > 1 ? 's' : ''}: ${rejected.join(', ')}`, { kind: 'error' });
  }

  addMediaNode(mediaId, x, y) {
    const m = this.doc.project.media.find((q) => q.id === mediaId);
    if (!m) return;
    const type = { video: 'src.movie', image: 'src.picture', audio: 'audio.player' }[m.kind];
    const node = this.doc.addNode(type, x, y, { values: { media: m.id }, title: m.name.replace(/\.[^.]+$/, '') });
    this.patch.select([node.id]);
  }

  async relinkMedia(id) {
    const files = await this.host.bridge.importMediaDialog({ single: true });
    if (files?.[0]) this.doc.relinkMedia(id, files[0].path);
  }

  // ------------------------------------------------------------------ misc

  quickAdd(sx, sy, world, wire) { openQuickAdd(this, sx, sy, world, wire); }

  addModuleAtCenter(type) {
    const [x, y] = this.patch.centerWorld();
    const jitter = (this.doc.scene.nodes.length % 6) * 16;
    this.patch._addAt(type, x - 110 + jitter, y - 60 + jitter);
  }

  async renameNode(id) {
    const n = this.doc.node(id);
    const def = getNodeType(n.type);
    const name = await promptDialog('Rename module', 'Name', n.title || def.name);
    if (name !== null) this.doc.setNodeAttr([id], 'title', name.trim() && name.trim() !== def.name ? name.trim() : undefined, 'Rename module');
  }

  editComment(id) {
    this.doc.selection = new Set([id]);
    this.patch.syncSelection();
    setTimeout(() => document.querySelector('.inspector textarea')?.focus(), 0);
  }

  showHelp(type) { this.inspector.showType(type); }

  async showPrefs() {
    const s = this.doc.project.settings;
    const osc = h('input.field.num', { type: 'number', min: 1, max: 65535, value: s.oscPort });
    const art = h('input.field', { value: s.artnetHost });
    const prev = h('input', { type: 'checkbox', checked: s.previews !== false });
    const snap = h('input', { type: 'checkbox', checked: s.snapToGrid !== false });
    const midi = this.host.midi;
    modal({
      title: 'Preferences',
      body: h('div.form', null,
        h('h3', null, 'Network'),
        h('label.form-row', null, h('span', null, 'OSC receive port'), osc),
        h('label.form-row', null, h('span', null, 'Art-Net destination'), art),
        h('p.hint', null, 'Use 255.255.255.255 to broadcast, or the IP of your Art-Net node. Saved with the project.'),
        h('h3', null, 'Editor'),
        h('label.check-row', null, prev, h('span', null, 'Show video previews in modules')),
        h('label.check-row', null, snap, h('span', null, 'Snap modules to grid')),
        h('h3', null, 'MIDI devices'),
        h('p.hint', null, midi.inputs.length || midi.outputs.length
          ? `Inputs: ${midi.inputs.map((i) => i.name).join(', ') || 'none'}. Outputs: ${midi.outputs.map((o, i) => `${i + 1}. ${o.name}`).join(', ') || 'none'}.`
          : 'No MIDI devices detected. Connect a device and it will appear automatically.')),
      actions: [{ label: 'Cancel' }, {
        label: 'Save', primary: true, action: () => {
          const port = Math.max(1, Math.min(65535, +osc.value || 8000));
          this.doc.edit('Preferences', () => Object.assign(s, { oscPort: port, artnetHost: art.value.trim() || '255.255.255.255', previews: prev.checked, snapToGrid: snap.checked }), { scope: 'project' });
          this.host.osc.listen(port);
        },
      }],
    });
  }

  showShortcuts() {
    const rows = [
      ['Add module', 'Double-click patch, or Tab'], ['Pan', 'Space + drag, middle-drag, or two-finger scroll'], ['Zoom', 'Mouse wheel, pinch, Ctrl + / −'],
      ['Frame all / selection', 'F'], ['Scrub a value', 'Drag left/right on it (Shift fine, Ctrl coarse)'], ['Type a value', 'Click it, Tab to the next'],
      ['Bypass module', 'B'], ['Delete', 'Delete or Backspace'], ['Duplicate', 'Ctrl+D'], ['Copy / Cut / Paste', 'Ctrl+C / X / V'],
      ['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'], ['Next / previous scene', 'Page Down / Page Up'], ['GO in Live view', 'Space'],
      ['New scene', 'Ctrl+Shift+N'], ['Toggle Live view', 'Ctrl+L'], ['Show all stages', 'Ctrl+Shift+F'], ['Toggle stage N', 'Ctrl+1…9'],
      ['Stage window full screen', 'Double-click it'], ['Close stage window', 'Shift+Esc'], ['Import media', 'Ctrl+I'], ['Save / Save As', 'Ctrl+S / Ctrl+Shift+S'],
    ];
    modal({ title: 'Keyboard shortcuts', width: 560, body: h('table.shortcuts', null, ...rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, b))))), actions: [{ label: 'Close', primary: true }] });
  }

  showModuleReference() {
    const all = allNodeTypes();
    const search = h('input.field', { type: 'search', placeholder: `Search ${all.length} modules` });
    const list = h('div.ref-list');
    const paint = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren(...all.filter((d) => !q || (d.name + d.description + d.keywords.join(' ')).toLowerCase().includes(q))
        .map((d) => h('div.ref-item', { style: { '--cat': d.color } }, h('span.cat-dot'), h('div', null, h('strong', null, d.name), h('span.ref-cat', null, d.category), h('p', null, d.description)))));
    };
    search.addEventListener('input', paint);
    paint();
    modal({ title: 'Module reference', width: 680, body: h('div', null, search, list), actions: [{ label: 'Close', primary: true }] });
  }

  /** Render every video module once against a test signal; report compile / runtime errors. */
  async runSelfTest(frames = 4) {
    const eng = new Engine({ renderer: this.renderer, host: this.host });
    const p = createProject();
    const sc = p.scenes[0];
    sc.nodes.push({ id: 'st_src', type: 'src.noise', x: 0, y: 0, values: {}, props: {} });
    const tested = [];
    for (const def of allNodeTypes()) {
      if (!def.render && !def.projector) continue;
      const m = { id: `st_${def.type}`, type: def.type, x: 0, y: 0, values: {}, props: cloneJSON(def.props || {}) };
      sc.nodes.push(m);
      for (const port of portsOf(def, m).inputs.filter((q) => q.type === 'video')) sc.links.push({ id: uid('l'), from: ['st_src', 'out'], to: [m.id, port.id] });
      tested.push(def);
    }
    const errorsBefore = new Set(this.renderer.errors.values());
    eng.load(p);
    const rt = eng.runtimes[0];
    for (let f = 0; f < frames; f++) {
      eng.step(performance.now() + f * 16);
      for (const n of rt.nodes.values()) {
        const vout = n.ports.outputs.find((q) => q.type === 'video');
        if (vout) eng.renderNode(n, vout.id);
        else if (n.def.projector) n.def.projector(n, eng);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    const failed = [];
    for (const def of tested) {
      const n = rt.nodes.get(`st_${def.type}`);
      if (n?.error && !/not found|Camera|camera|No microphone/.test(n.error)) failed.push({ type: def.type, name: def.name, error: n.error });
    }
    for (const e of this.renderer.errors.values()) if (!errorsBefore.has(e)) failed.push({ type: 'shader', name: 'Shader program', error: e });
    for (const r of eng.runtimes) eng._destroyRuntime(r);
    const gl = this.renderer.gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      maxTexture: this.renderer.maxTextureSize,
      tested: tested.length,
      failed,
    };
  }

  async showSelfTest() {
    const r = await this.runSelfTest();
    modal({
      title: 'Graphics self-test',
      width: 560,
      body: h('div', null,
        h('p.modal-text', null, r.failed.length ? `${r.failed.length} of ${r.tested} video modules reported a problem.` : `All ${r.tested} video modules rendered correctly.`),
        h('p.hint', null, `GPU: ${r.gpu} · max texture ${r.maxTexture}px`),
        ...r.failed.map((f) => h('div.insp-error', null, h('strong', null, f.name), h('span', null, f.error)))),
      actions: [{ label: 'Close', primary: true }],
    });
    return r;
  }

  showAbout() {
    const b = this.host.bridge;
    modal({
      title: `About ${APP_NAME}`,
      width: 440,
      body: h('div.about', null,
        h('img', { src: '../assets/logo.svg', width: 64, height: 64, alt: '' }),
        h('h2', null, APP_NAME),
        h('p', null, `Version ${b.version || '1.0.0'}${b.versions ? ` · Electron ${b.versions.electron} · Chromium ${b.versions.chrome}` : ''}`),
        h('p', null, 'A node-based real-time media environment for live performance, installations and projection mapping.'),
        h('p.hint', null, `${allNodeTypes().length} modules. Released under the MIT licence. IBM Plex fonts under the SIL Open Font License.`)),
      actions: [{ label: 'Website', action: () => this.command('website') }, { label: 'Close', primary: true }],
    });
  }
}

// --------------------------------------------------------------------- boot

window.addEventListener('DOMContentLoaded', () => {
  try {
    const app = new App();
    window.kamiApp = app;
    app.start().catch((e) => { console.error(e); toast(`Startup problem: ${e.message}`, { kind: 'error', timeout: 8000 }); });
  } catch (e) {
    console.error(e);
    document.body.innerHTML = '';
    document.body.appendChild(h('div.fatal', null, h('h1', null, 'KamiCreative could not start'), h('p', null, e.message || String(e)), h('p.hint', null, 'KamiCreative needs a GPU with WebGL 2 support. Updating your graphics driver usually fixes this.')));
  }
});

export { showMenu };
