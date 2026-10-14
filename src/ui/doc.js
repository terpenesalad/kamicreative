// KamiCreative — editable document: every mutation goes through here so that
// undo/redo, dirty tracking and runtime synchronisation stay consistent.

import { Emitter } from '../core/emitter.js';
import { uid, cloneJSON, createScene, duplicateScene, createStage, createSurface } from '../core/project.js';
import { getNodeType, portsOf } from '../core/registry.js';

const MAX_UNDO = 200;

export class Doc extends Emitter {
  constructor(engine) {
    super();
    this.engine = engine;
    this.project = null;
    this.path = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = new Set();   // node ids in current scene
    this.selectedLinks = new Set();
  }

  load(project, path = null) {
    this.project = project;
    this.path = path;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.selection.clear();
    this.selectedLinks.clear();
    this.engine.load(project);
    this.emit('load');
    this.emit('dirty', false);
  }

  get scene() { return this.project?.scenes.find((s) => s.id === this.project.activeScene) || null; }
  node(id) { return this.scene.nodes.find((n) => n.id === id); }

  markDirty() {
    this.project.meta.modified = new Date().toISOString();
    if (!this.dirty) { this.dirty = true; this.emit('dirty', true); }
  }

  markSaved(path) {
    this.path = path || this.path;
    this.dirty = false;
    this.emit('dirty', false);
  }

  // ------------------------------------------------------------ transactions

  /**
   * Run `fn` as one undoable step.
   * scope 'scene' snapshots the active scene; 'project' snapshots the whole project.
   * Consecutive edits with the same `coalesce` key within 1.5 s merge into one step.
   */
  edit(label, fn, { scope = 'scene', coalesce = null, quiet = false } = {}) {
    const top = this.undoStack[this.undoStack.length - 1];
    const now = performance.now();
    const merge = coalesce && top && top.coalesce === coalesce && now - top.time < 1500;
    if (!merge) {
      const entry = { label, scope, coalesce, time: now, sceneId: this.project.activeScene };
      entry.before = scope === 'scene' ? cloneJSON(this.scene) : cloneJSON(this._projectData());
      this.undoStack.push(entry);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.redoStack = [];
    } else {
      top.time = now;
    }
    const result = fn();
    this.markDirty();
    if (!quiet) this.emit('change', { label, scope });
    return result;
  }

  _projectData() {
    const { scenes, stages, media, settings, meta, activeScene } = this.project;
    return { scenes, stages, media, settings, meta, activeScene };
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() { this._travel(this.undoStack, this.redoStack); }
  redo() { this._travel(this.redoStack, this.undoStack); }

  _travel(from, to) {
    const entry = from.pop();
    if (!entry) return;
    const back = { ...entry, time: 0 };
    if (entry.scope === 'scene') {
      const idx = this.project.scenes.findIndex((s) => s.id === entry.sceneId);
      if (idx < 0) return;
      back.before = cloneJSON(this.project.scenes[idx]);
      this.project.scenes[idx] = entry.before;
      if (this.project.activeScene !== entry.sceneId) this.engine.activateScene(entry.sceneId, { fade: 0 });
      this.engine.reconcile(entry.sceneId);
    } else {
      back.before = cloneJSON(this._projectData());
      const prevActive = this.project.activeScene;
      Object.assign(this.project, entry.before);
      for (const rt of this.engine.runtimes) {
        const sc = this.project.scenes.find((s) => s.id === rt.id);
        if (sc) { rt.scene = sc; this.engine.reconcile(sc.id); }
      }
      const exists = this.project.scenes.find((s) => s.id === this.project.activeScene);
      if (!exists) this.project.activeScene = this.project.scenes[0].id;
      if (this.project.activeScene !== prevActive || !this.engine.runtimeFor(this.project.activeScene)) {
        this.engine.activateScene(this.project.activeScene, { fade: 0 });
      }
    }
    to.push(back);
    this.selection.clear();
    this.selectedLinks.clear();
    this.markDirty();
    this.emit('change', { label: entry.label, undo: true, scope: entry.scope });
    this.emit('history', entry.label);
  }

  // ------------------------------------------------------------------ nodes

  addNode(type, x, y, { values = {}, props = {}, title } = {}) {
    const def = getNodeType(type);
    if (!def) throw new Error(`Unknown module ${type}`);
    const model = {
      id: uid(), type, x: Math.round(x), y: Math.round(y), values: { ...values },
      props: { ...(def.props ? cloneJSON(def.props) : {}), ...props },
    };
    if (title) model.title = title;
    if (def.preview) model.preview = true;
    this.edit(`Add ${def.name}`, () => {
      this.scene.nodes.push(model);
      this.engine.nodeAdded(this.scene.id, model);
    });
    return model;
  }

  removeNodes(ids) {
    ids = [...ids];
    if (!ids.length) return;
    this.edit(ids.length > 1 ? `Delete ${ids.length} modules` : 'Delete module', () => {
      const sc = this.scene;
      const set = new Set(ids);
      const dead = sc.links.filter((l) => set.has(l.from[0]) || set.has(l.to[0]));
      for (const l of dead) this.engine.linkRemoved(sc.id, l);
      sc.links = sc.links.filter((l) => !dead.includes(l));
      for (const id of ids) this.engine.nodeRemoved(sc.id, id);
      sc.nodes = sc.nodes.filter((n) => !set.has(n.id));
      for (const id of ids) this.selection.delete(id);
    });
  }

  moveNodes(moves) {
    this.edit('Move', () => {
      for (const [id, x, y] of moves) {
        const n = this.node(id);
        if (n) { n.x = Math.round(x); n.y = Math.round(y); }
      }
    }, { quiet: true });
  }

  setValue(nodeId, port, value, coalesce) {
    const n = this.node(nodeId);
    if (!n) return;
    const def = getNodeType(n.type);
    const p = def && portsOf(def, n).inputs.find((q) => q.id === port);
    this.edit(`Set ${p?.name || port}`, () => {
      if (p && p.type !== 'trigger') n.values[port] = value;
      this.engine.valueChanged(this.scene.id, nodeId, port, value);
    }, { coalesce: coalesce || `v:${nodeId}:${port}`, quiet: true });
    this.emit('valueEdited', nodeId, port);
  }

  /** Fire a trigger input manually (not undoable, does not dirty the file). */
  fire(nodeId, port) { this.engine.valueChanged(this.scene.id, nodeId, port, 1); }

  setProp(nodeId, key, value, { coalesce, label } = {}) {
    const n = this.node(nodeId);
    if (!n) return;
    this.edit(label || `Change ${key}`, () => {
      n.props = n.props || {};
      n.props[key] = value;
      if (key === 'count') this._pruneLinks(n);
      this.engine.propChanged(this.scene.id, nodeId, key);
    }, { coalesce: coalesce || `p:${nodeId}:${key}` });
  }

  /** Remove links to ports that no longer exist (after a dynamic port count change). */
  _pruneLinks(n) {
    const def = getNodeType(n.type);
    const ports = portsOf(def, n);
    const ins = new Set(ports.inputs.map((p) => p.id)), outs = new Set(ports.outputs.map((p) => p.id));
    const sc = this.scene;
    const dead = sc.links.filter((l) => (l.to[0] === n.id && !ins.has(l.to[1])) || (l.from[0] === n.id && !outs.has(l.from[1])));
    for (const l of dead) this.engine.linkRemoved(sc.id, l);
    sc.links = sc.links.filter((l) => !dead.includes(l));
  }

  setNodeAttr(ids, key, value, label) {
    this.edit(label || `Change ${key}`, () => {
      for (const id of ids) { const n = this.node(id); if (n) n[key] = value; }
      if (key === 'bypass') for (const rt of this.engine.runtimes) for (const id of ids) { const r = rt.nodes.get(id); if (r) this.engine.propChanged(rt.id, id, 'bypass'); }
    });
  }

  /** Persist a control widget value (sliders etc.) without flooding the undo stack. */
  widgetValue(nodeId, value) {
    const n = this.node(nodeId);
    if (!n) return;
    this.edit('Adjust control', () => { n.props = n.props || {}; n.props.value = value; }, { coalesce: `w:${nodeId}`, quiet: true });
  }

  // ------------------------------------------------------------------ links

  connect(from, to) {
    if (!this.engine.canConnect(this.scene.id, from, to)) return null;
    const link = { id: uid('l'), from: [...from], to: [...to] };
    this.edit('Connect', () => {
      const sc = this.scene;
      const prev = sc.links.filter((l) => l.to[0] === to[0] && l.to[1] === to[1]);
      for (const l of prev) this.engine.linkRemoved(sc.id, l);
      sc.links = sc.links.filter((l) => !prev.includes(l));
      sc.links.push(link);
      this.engine.linkAdded(sc.id, link);
    });
    return link;
  }

  disconnect(linkIds) {
    const set = new Set(linkIds);
    if (!set.size) return;
    this.edit('Disconnect', () => {
      const sc = this.scene;
      for (const l of sc.links) if (set.has(l.id)) this.engine.linkRemoved(sc.id, l);
      sc.links = sc.links.filter((l) => !set.has(l.id));
      for (const id of set) this.selectedLinks.delete(id);
    });
  }

  // ------------------------------------------------------------ clipboard

  copySelection() {
    const sc = this.scene;
    const ids = this.selection;
    if (!ids.size) return null;
    const nodes = sc.nodes.filter((n) => ids.has(n.id));
    const links = sc.links.filter((l) => ids.has(l.from[0]) && ids.has(l.to[0]));
    return cloneJSON({ kind: 'kamicreative/modules', nodes, links });
  }

  paste(clip, at) {
    if (!clip || clip.kind !== 'kamicreative/modules' || !clip.nodes?.length) return;
    const minX = Math.min(...clip.nodes.map((n) => n.x)), minY = Math.min(...clip.nodes.map((n) => n.y));
    const ox = at ? at[0] - minX : 30, oy = at ? at[1] - minY : 30;
    const idMap = new Map();
    const nodes = clip.nodes.filter((n) => getNodeType(n.type)).map((n) => {
      const id = uid();
      idMap.set(n.id, id);
      return { ...cloneJSON(n), id, x: n.x + ox, y: n.y + oy };
    });
    const links = clip.links.filter((l) => idMap.has(l.from[0]) && idMap.has(l.to[0]))
      .map((l) => ({ id: uid('l'), from: [idMap.get(l.from[0]), l.from[1]], to: [idMap.get(l.to[0]), l.to[1]] }));
    this.edit(`Paste ${nodes.length} module${nodes.length > 1 ? 's' : ''}`, () => {
      const sc = this.scene;
      sc.nodes.push(...nodes);
      sc.links.push(...links);
      this.engine.reconcile(sc.id);
    });
    this.selection = new Set(nodes.map((n) => n.id));
    this.emit('selection');
  }

  // ------------------------------------------------------------------ scenes

  addScene(afterIndex = this.project.scenes.length - 1, name) {
    const sc = createScene(name || `Scene ${this.project.scenes.length + 1}`);
    this.edit('Add scene', () => { this.project.scenes.splice(afterIndex + 1, 0, sc); }, { scope: 'project' });
    return sc;
  }

  duplicateScene(id) {
    const i = this.project.scenes.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const copy = duplicateScene(this.project.scenes[i]);
    this.edit('Duplicate scene', () => { this.project.scenes.splice(i + 1, 0, copy); }, { scope: 'project' });
    return copy;
  }

  deleteScene(id) {
    if (this.project.scenes.length <= 1) return false;
    const i = this.project.scenes.findIndex((s) => s.id === id);
    if (i < 0) return false;
    this.edit('Delete scene', () => {
      this.project.scenes.splice(i, 1);
      if (this.project.activeScene === id) {
        const next = this.project.scenes[Math.min(i, this.project.scenes.length - 1)];
        this.engine.activateScene(next.id, { fade: 0 });
      }
    }, { scope: 'project' });
    return true;
  }

  updateScene(id, patch, coalesce) {
    const sc = this.project.scenes.find((s) => s.id === id);
    if (!sc) return;
    this.edit('Edit scene', () => Object.assign(sc, patch), { scope: 'project', coalesce: coalesce || `scene:${id}` });
  }

  moveScene(id, toIndex) {
    const arr = this.project.scenes;
    const i = arr.findIndex((s) => s.id === id);
    if (i < 0 || i === toIndex) return;
    this.edit('Reorder scenes', () => {
      const [s] = arr.splice(i, 1);
      arr.splice(Math.max(0, Math.min(arr.length, toIndex)), 0, s);
    }, { scope: 'project' });
  }

  goScene(id, fade) {
    this.selection.clear();
    this.selectedLinks.clear();
    this.engine.activateScene(id, fade === undefined ? {} : { fade });
  }

  // ------------------------------------------------------------------- media

  addMedia(items) {
    const added = [];
    this.edit(`Import ${items.length} file${items.length > 1 ? 's' : ''}`, () => {
      for (const it of items) {
        const existing = this.project.media.find((m) => m.path === it.path);
        if (existing) { added.push(existing); continue; }
        const m = { id: uid('m'), name: it.name, kind: it.kind, path: it.path };
        this.project.media.push(m);
        added.push(m);
      }
    }, { scope: 'project' });
    return added;
  }

  removeMedia(id) { this.edit('Remove media', () => { this.project.media = this.project.media.filter((m) => m.id !== id); }, { scope: 'project' }); }
  relinkMedia(id, path) {
    this.edit('Relink media', () => { const m = this.project.media.find((x) => x.id === id); if (m) { m.path = path; m.missing = false; } }, { scope: 'project' });
    this.engine.reconcile(this.scene.id);
  }

  // ------------------------------------------------------------------ stages

  addStage() {
    const st = createStage(this.project.stages.length);
    this.edit('Add stage', () => this.project.stages.push(st), { scope: 'project' });
    return st;
  }

  removeStage(id) {
    if (this.project.stages.length <= 1) return;
    this.edit('Remove stage', () => { this.project.stages = this.project.stages.filter((s) => s.id !== id); }, { scope: 'project' });
  }

  updateStage(id, fn, { label = 'Edit stage', coalesce } = {}) {
    const st = this.project.stages.find((s) => s.id === id);
    if (!st) return;
    this.edit(label, () => fn(st), { scope: 'project', coalesce, quiet: true });
    this.emit('stage', id);
  }

  addSurface(stageId) {
    let sf;
    this.updateStage(stageId, (st) => {
      const n = st.mapping.surfaces.length;
      const inset = 0.08 + (n % 4) * 0.04;
      sf = createSurface(`Surface ${n + 1}`, [0, 0, 1, 1]);
      sf.grid.points = [[inset, inset], [1 - inset, inset], [inset, 1 - inset], [1 - inset, 1 - inset]];
      st.mapping.surfaces.push(sf);
    }, { label: 'Add surface' });
    return sf;
  }
}
