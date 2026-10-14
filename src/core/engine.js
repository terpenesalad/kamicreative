// KamiCreative — runtime engine.
//
// Data flow model
//  * Value ports (number/bool/enum/text/colour) are PUSH based: when a node
//    sets an output, the value is converted and delivered to every connected
//    input immediately, which calls that node's update().
//  * Triggers are events: they never store a value, they just call update()
//    with the port id on the receiving node.
//  * Video ports are PULL based: every frame each Projector asks for its input
//    texture, which recursively renders upstream nodes once per frame. A node
//    that is re-entered while rendering (a feedback loop) receives its own
//    previous frame, which makes video feedback patches possible.
//  * Only active scenes have runtimes. During a scene cross-fade two runtimes
//    are alive and their projector layers are weighted by the scene alpha.

import { Emitter } from './emitter.js';
import { getNodeType, portsOf, convertValue, compatible } from './registry.js';

const MAX_DEPTH = 96;

export class RtNode {
  constructor(model, def, scene) {
    this.id = model.id;
    this.model = model;
    this.def = def;
    this.scene = scene;
    this.ports = portsOf(def, model);
    this.inputs = {};
    this.outputs = {};
    this.state = {};
    this.textures = {};
    this.cache = {};
    this.cacheFrame = -1;
    this.rendering = false;
    this.error = null;
    this.activity = 0; // last time something flowed (for UI blink)
    for (const p of this.ports.inputs) {
      const v = model.values && model.values[p.id] !== undefined ? model.values[p.id] : p.default;
      this.inputs[p.id] = p.type === 'trigger' || p.type === 'video' ? null : convertValue(v, p);
    }
    for (const p of this.ports.outputs) this.outputs[p.id] = p.type === 'video' || p.type === 'trigger' ? null : p.default;
  }
  inputPort(id) { return this.ports.inputs.find((p) => p.id === id); }
  outputPort(id) { return this.ports.outputs.find((p) => p.id === id); }
  get bypass() { return !!this.model.bypass; }
}

export class SceneRuntime {
  constructor(scene) {
    this.scene = scene;
    this.nodes = new Map();
    this.linksFrom = new Map(); // nodeId -> Map(portId -> link[])
    this.linksTo = new Map();   // `${nodeId}:${portId}` -> link
    this.alpha = 1;
    this.target = 1;
    this.fadeTime = 0;
  }
  get id() { return this.scene.id; }

  indexLink(link) {
    const [fn, fp] = link.from;
    if (!this.linksFrom.has(fn)) this.linksFrom.set(fn, new Map());
    const m = this.linksFrom.get(fn);
    if (!m.has(fp)) m.set(fp, []);
    m.get(fp).push(link);
    this.linksTo.set(`${link.to[0]}:${link.to[1]}`, link);
  }
  unindexLink(link) {
    const m = this.linksFrom.get(link.from[0]);
    if (m && m.has(link.from[1])) {
      const arr = m.get(link.from[1]).filter((l) => l.id !== link.id);
      if (arr.length) m.set(link.from[1], arr); else m.delete(link.from[1]);
    }
    const key = `${link.to[0]}:${link.to[1]}`;
    if (this.linksTo.get(key)?.id === link.id) this.linksTo.delete(key);
  }
}

export class Engine extends Emitter {
  /**
   * @param {object} opts
   * @param {import('../gl/gl.js').Renderer|null} opts.renderer
   * @param {object} opts.host services: midi, osc, artnet, audio, media resolver, stages
   */
  constructor({ renderer = null, host = {} } = {}) {
    super();
    this.renderer = renderer;
    this.host = host;
    this.project = null;
    this.runtimes = [];
    this.frame = 0;
    this.time = 0;
    this.dt = 0;
    this._t0 = null;
    this._depth = 0;
    this.warnings = new Set();
    this.dirty = new Set(); // node ids whose displayed values changed
    this.stageTextures = new Map(); // stage id -> last composite (for feedback / Stage Grabber)
    this.keys = new Set();
    this._deferred = [];
    this.mouse = { x: 0, y: 0, buttons: 0, stage: 0 };
  }

  // ---------------------------------------------------------------- project

  load(project) {
    for (const rt of this.runtimes) this._destroyRuntime(rt);
    this.runtimes = [];
    this.project = project;
    this.emit('project', project);
    this.activateScene(project.activeScene, { fade: 0 });
  }

  sceneModel(id) { return this.project?.scenes.find((s) => s.id === id) || null; }
  runtimeFor(sceneId) { return this.runtimes.find((r) => r.id === sceneId) || null; }
  get current() { return this.runtimes.find((r) => r.target > 0) || this.runtimes[this.runtimes.length - 1] || null; }

  /** Switch to a scene, optionally cross-fading (seconds). */
  activateScene(sceneId, { fade } = {}) {
    const scene = this.sceneModel(sceneId);
    if (!scene) return false;
    const fadeTime = fade !== undefined ? fade : scene.fadeIn || 0;
    let rt = this.runtimeFor(sceneId);
    if (rt && rt.target > 0 && this.runtimes.length === 1) return true;
    this.project.activeScene = sceneId;
    for (const other of this.runtimes) {
      if (other === rt) continue;
      other.target = 0;
      other.fadeTime = fadeTime;
      if (fadeTime <= 0) other.alpha = 0;
    }
    if (!rt) {
      rt = new SceneRuntime(scene);
      rt.alpha = fadeTime > 0 && this.runtimes.length ? 0 : 1;
      this.runtimes.push(rt);
      this._buildRuntime(rt);
    }
    rt.target = 1;
    rt.fadeTime = fadeTime;
    if (fadeTime <= 0) rt.alpha = 1;
    this._reapFaded();
    this.emit('scene', sceneId);
    return true;
  }

  sceneIndex(id) { return this.project.scenes.findIndex((s) => s.id === id); }

  gotoRelative(delta, fade) {
    const n = this.project.scenes.length;
    const i = this.sceneIndex(this.project.activeScene);
    const j = Math.max(0, Math.min(n - 1, i + delta));
    if (j !== i) this.activateScene(this.project.scenes[j].id, { fade });
  }

  _buildRuntime(rt) {
    const scene = rt.scene;
    for (const n of scene.nodes) this._createNode(rt, n);
    for (const l of scene.links) {
      if (rt.nodes.has(l.from[0]) && rt.nodes.has(l.to[0])) rt.indexLink(l);
    }
    // Start pass in dependency order so upstream outputs exist before downstream reads them.
    const order = this._topoOrder(rt);
    this._call(order, 'update', null, true);
    for (const node of order) this._pushAllOutputs(node);
    this._call(order, 'started');
  }

  _topoOrder(rt) {
    const indeg = new Map([...rt.nodes.keys()].map((k) => [k, 0]));
    for (const l of rt.scene.links) if (indeg.has(l.to[0]) && indeg.has(l.from[0])) indeg.set(l.to[0], indeg.get(l.to[0]) + 1);
    const q = [...indeg].filter(([, d]) => d === 0).map(([k]) => k);
    const out = [];
    const seen = new Set();
    while (q.length) {
      const id = q.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(rt.nodes.get(id));
      const m = rt.linksFrom.get(id);
      if (!m) continue;
      for (const links of m.values()) for (const l of links) {
        indeg.set(l.to[0], indeg.get(l.to[0]) - 1);
        if (indeg.get(l.to[0]) <= 0) q.push(l.to[0]);
      }
    }
    for (const n of rt.nodes.values()) if (!seen.has(n.id)) out.push(n); // cycles
    return out;
  }

  _call(nodes, method, arg, isStart) {
    for (const node of nodes) {
      const fn = node.def[method];
      if (!fn) continue;
      try { fn.call(node.def, node, this, arg, isStart); }
      catch (e) { this._nodeError(node, e); }
    }
  }

  _createNode(rt, model) {
    const def = getNodeType(model.type);
    if (!def) {
      this.warnings.add(`Unknown module type "${model.type}" — it was skipped.`);
      return null;
    }
    const node = new RtNode(model, def, rt);
    rt.nodes.set(node.id, node);
    if (def.create) {
      try { def.create(node, this); } catch (e) { this._nodeError(node, e); }
    }
    return node;
  }

  _destroyNode(rt, node) {
    if (node.def.destroy) {
      try { node.def.destroy(node, this); } catch (e) { console.error(e); }
    }
    for (const t of Object.values(node.textures)) t?.dispose?.();
    node.textures = {};
    rt.nodes.delete(node.id);
  }

  _destroyRuntime(rt) {
    for (const n of [...rt.nodes.values()]) this._destroyNode(rt, n);
  }

  _reapFaded() {
    const keep = [];
    for (const rt of this.runtimes) {
      if (rt.target === 0 && rt.alpha <= 0) this._destroyRuntime(rt);
      else keep.push(rt);
    }
    this.runtimes = keep;
  }

  _nodeError(node, e) {
    const msg = String(e?.message || e);
    if (node.error !== msg) {
      node.error = msg;
      console.warn(`[${node.def.name}] ${msg}`);
      this.emit('nodeError', node, msg);
    }
    this.dirty.add(node.id);
  }

  // ---------------------------------------------------------- edit sync API
  // The editor mutates the model first, then calls these to sync runtimes.

  nodeAdded(sceneId, model) {
    const rt = this.runtimeFor(sceneId);
    if (!rt) return;
    const node = this._createNode(rt, model);
    if (!node) return;
    this._call([node], 'update', null, true);
    this._pushAllOutputs(node);
    this._call([node], 'started');
  }

  nodeRemoved(sceneId, nodeId) {
    const rt = this.runtimeFor(sceneId);
    const node = rt?.nodes.get(nodeId);
    if (!node) return;
    for (const l of [...rt.scene.links, ...this._indexedLinksOf(rt, nodeId)]) {
      if (l.from[0] === nodeId || l.to[0] === nodeId) rt.unindexLink(l);
    }
    this._destroyNode(rt, node);
  }

  _indexedLinksOf(rt, nodeId) {
    const out = [];
    const m = rt.linksFrom.get(nodeId);
    if (m) for (const arr of m.values()) out.push(...arr);
    for (const l of rt.linksTo.values()) if (l.to[0] === nodeId) out.push(l);
    return out;
  }

  linkAdded(sceneId, link) {
    const rt = this.runtimeFor(sceneId);
    if (!rt || !rt.nodes.has(link.from[0]) || !rt.nodes.has(link.to[0])) return;
    const prev = rt.linksTo.get(`${link.to[0]}:${link.to[1]}`);
    if (prev) rt.unindexLink(prev);
    rt.indexLink(link);
    const src = rt.nodes.get(link.from[0]);
    const op = src.outputPort(link.from[1]);
    if (op && op.type !== 'video' && op.type !== 'trigger' && src.outputs[op.id] !== null) {
      this._deliver(rt, link, src.outputs[op.id], false);
    }
  }

  linkRemoved(sceneId, link) {
    const rt = this.runtimeFor(sceneId);
    if (rt) rt.unindexLink(link);
  }

  /** User changed an input value in the editor (model already updated). */
  valueChanged(sceneId, nodeId, portId, value) {
    const rt = this.runtimeFor(sceneId);
    const node = rt?.nodes.get(nodeId);
    if (!node) return;
    const port = node.inputPort(portId);
    if (!port) return;
    if (port.type === 'trigger') { this._invoke(node, portId); return; }
    node.inputs[portId] = convertValue(value, port);
    this._invoke(node, portId);
  }

  /** Non-port property changed (shader code, list contents, port count...). */
  propChanged(sceneId, nodeId, key) {
    const rt = this.runtimeFor(sceneId);
    const node = rt?.nodes.get(nodeId);
    if (!node) return;
    if (node.def.ports) {
      const before = JSON.stringify(node.ports);
      node.ports = portsOf(node.def, node.model);
      if (JSON.stringify(node.ports) !== before) {
        for (const p of node.ports.inputs) {
          if (!(p.id in node.inputs)) node.inputs[p.id] = p.type === 'trigger' || p.type === 'video' ? null : convertValue(node.model.values[p.id] ?? p.default, p);
        }
        for (const p of node.ports.outputs) if (!(p.id in node.outputs)) node.outputs[p.id] = p.type === 'video' || p.type === 'trigger' ? null : p.default;
        this.emit('portsChanged', node);
      }
    }
    try { node.def.propChanged?.(node, this, key); } catch (e) { this._nodeError(node, e); }
    this._invoke(node, null);
  }

  /** Re-sync a scene runtime after undo/redo or bulk edits, preserving surviving node state. */
  reconcile(sceneId) {
    const rt = this.runtimeFor(sceneId);
    if (!rt) return;
    const scene = this.sceneModel(sceneId);
    rt.scene = scene;
    const want = new Map(scene.nodes.map((n) => [n.id, n]));
    for (const node of [...rt.nodes.values()]) {
      const m = want.get(node.id);
      if (!m || m.type !== node.model.type) this._destroyNode(rt, node);
    }
    const added = [];
    for (const m of scene.nodes) {
      const node = rt.nodes.get(m.id);
      if (node) {
        node.model = m;
        const before = JSON.stringify(node.ports);
        node.ports = portsOf(node.def, m);
        for (const p of node.ports.inputs) {
          if (p.type === 'trigger' || p.type === 'video') continue;
          node.inputs[p.id] = convertValue(m.values[p.id] ?? p.default, p);
        }
        if (JSON.stringify(node.ports) !== before) this.emit('portsChanged', node);
      } else {
        const n = this._createNode(rt, m);
        if (n) added.push(n);
      }
    }
    rt.linksFrom.clear();
    rt.linksTo.clear();
    for (const l of scene.links) if (rt.nodes.has(l.from[0]) && rt.nodes.has(l.to[0])) rt.indexLink(l);
    const order = this._topoOrder(rt);
    const isNew = new Set(added);
    for (const node of order) this._call([node], 'update', null, isNew.has(node));
    for (const node of order) this._pushAllOutputs(node);
    this._call(added, 'started');
  }

  // ------------------------------------------------------------- data flow

  _invoke(node, portId) {
    if (this._depth > MAX_DEPTH) {
      this._nodeError(node, 'Feedback loop detected — values stopped propagating.');
      return;
    }
    this._depth++;
    try {
      node.def.update?.(node, this, portId, false);
    } catch (e) {
      this._nodeError(node, e);
    } finally {
      this._depth--;
    }
    node.activity = this.time;
    this.dirty.add(node.id);
  }

  _pushAllOutputs(node) {
    for (const p of node.ports.outputs) {
      if (p.type === 'video' || p.type === 'trigger') continue;
      if (node.outputs[p.id] !== null && node.outputs[p.id] !== undefined) this.out(node, p.id, node.outputs[p.id], true);
    }
  }

  _deliver(rt, link, value, isTrigger) {
    const target = rt.nodes.get(link.to[0]);
    if (!target) return;
    const port = target.inputPort(link.to[1]);
    if (!port) return;
    if (port.type === 'trigger') {
      this._invoke(target, port.id);
      return;
    }
    if (isTrigger) { this._invoke(target, port.id); return; }
    target.inputs[port.id] = convertValue(value, port);
    this._invoke(target, port.id);
  }

  /** Set an output value and propagate. Unchanged values are not re-sent unless forced. */
  out(node, portId, value, force = false) {
    const port = node.outputPort(portId);
    if (!port) return;
    if (port.type === 'trigger') { this.fire(node, portId); return; }
    const prev = node.outputs[portId];
    node.outputs[portId] = value;
    this.dirty.add(node.id);
    if (!force && prev === value) return;
    node.activity = this.time;
    const links = node.scene.linksFrom.get(node.id)?.get(portId);
    if (!links) return;
    for (const l of links) this._deliver(node.scene, l, value, false);
  }

  /** Emit a trigger from an output port. */
  fire(node, portId) {
    node.activity = this.time;
    node.outputs[portId] = this.time; // timestamp for UI flash
    this.dirty.add(node.id);
    const links = node.scene.linksFrom.get(node.id)?.get(portId);
    if (!links) return;
    for (const l of links) this._deliver(node.scene, l, 1, true);
  }

  isConnected(node, portId) { return node.scene.linksTo.has(`${node.id}:${portId}`); }

  // ------------------------------------------------------------------ video

  /** Texture arriving at a video input, or null when unconnected / not rendered. */
  texture(node, portId) {
    const link = node.scene.linksTo.get(`${node.id}:${portId}`);
    if (!link) return null;
    const src = node.scene.nodes.get(link.from[0]);
    if (!src) return null;
    return this.renderNode(src, link.from[1]);
  }

  renderNode(node, portId) {
    if (!this.renderer) return null;
    if (node.cacheFrame === this.frame && portId in node.cache) return node.cache[portId];
    if (node.rendering) return node.cache[portId] || null; // feedback: previous frame
    node.rendering = true;
    let tex = null;
    try {
      if (node.bypass) {
        const vin = node.ports.inputs.find((p) => p.type === 'video');
        tex = vin ? this.texture(node, vin.id) : null;
      } else if (node.def.render) {
        tex = node.def.render(node, this, portId) || null;
      }
    } catch (e) {
      this._nodeError(node, e);
      tex = null;
    } finally {
      node.rendering = false;
    }
    if (node.cacheFrame !== this.frame) { node.cache = {}; node.cacheFrame = this.frame; }
    node.cache[portId] = tex;
    return tex;
  }

  /** Get (creating / resizing) a node-owned render target. */
  target(node, key, w, h, opts) {
    let t = node.textures[key];
    if (!t) { t = this.renderer.createTexture(w, h, opts); node.textures[key] = t; }
    else t.resize(w, h);
    return t;
  }

  /** Default output resolution for generators: the size of the node's stage, else stage 1. */
  defaultSize() {
    const st = this.project?.stages[0];
    return st ? [st.width, st.height] : [1280, 720];
  }

  // ------------------------------------------------------------------ frame

  /** Advance one frame. `now` in ms (performance.now()). Returns projector layers per stage. */
  step(now) {
    if (this._t0 === null) this._t0 = now;
    const t = (now - this._t0) / 1000;
    this.dt = Math.min(0.25, Math.max(0, t - this.time));
    this.time = t;
    this.frame++;

    // Deferred actions (scene jumps requested from inside data propagation).
    if (this._deferred.length) {
      const todo = this._deferred;
      this._deferred = [];
      for (const fn of todo) { try { fn(); } catch (e) { console.error(e); } }
    }

    // Scene fades.
    for (const rt of this.runtimes) {
      if (rt.alpha !== rt.target) {
        const rate = rt.fadeTime > 0 ? this.dt / rt.fadeTime : 1;
        rt.alpha = rt.target > rt.alpha ? Math.min(rt.target, rt.alpha + rate) : Math.max(rt.target, rt.alpha - rate);
      }
    }
    this._reapFaded();

    // Ticks.
    for (const rt of this.runtimes) {
      for (const node of rt.nodes.values()) {
        if (!node.def.tick || node.bypass) continue;
        try { node.def.tick(node, this); } catch (e) { this._nodeError(node, e); }
      }
    }

    // Collect projector layers (pulls the video graph).
    const layers = new Map();
    for (const rt of this.runtimes) {
      for (const node of rt.nodes.values()) {
        if (!node.def.projector || node.bypass) continue;
        const layer = node.def.projector(node, this);
        if (!layer) continue;
        layer.opacity *= rt.alpha;
        if (layer.opacity <= 0.001) continue;
        const list = layers.get(layer.stage) || [];
        list.push(layer);
        layers.set(layer.stage, list);
      }
    }
    for (const list of layers.values()) list.sort((a, b) => a.layer - b.layer);
    return layers;
  }

  /** Run fn at the start of the next frame (safe point for structural changes). */
  defer(fn) { this._deferred.push(fn); }

  // ------------------------------------------------------------- broadcast

  broadcast(channel, value, fromNode) {
    for (const rt of this.runtimes) {
      for (const node of rt.nodes.values()) {
        if (node === fromNode || !node.def.onBroadcast) continue;
        try { node.def.onBroadcast(node, this, channel, value); } catch (e) { this._nodeError(node, e); }
      }
    }
  }

  /** Dispatch an external event (MIDI, OSC, key, mouse) to every node that listens for it. */
  dispatch(kind, payload) {
    const hook = 'on' + kind;
    for (const rt of this.runtimes) {
      for (const node of rt.nodes.values()) {
        const fn = node.def[hook];
        if (!fn || node.bypass) continue;
        try { fn.call(node.def, node, this, payload); } catch (e) { this._nodeError(node, e); }
      }
    }
  }

  canConnect(sceneId, from, to) {
    const scene = this.sceneModel(sceneId);
    if (!scene || from[0] === to[0]) return false;
    const a = scene.nodes.find((n) => n.id === from[0]);
    const b = scene.nodes.find((n) => n.id === to[0]);
    if (!a || !b) return false;
    const da = getNodeType(a.type), db = getNodeType(b.type);
    if (!da || !db) return false;
    const op = portsOf(da, a).outputs.find((p) => p.id === from[1]);
    const ip = portsOf(db, b).inputs.find((p) => p.id === to[1]);
    return !!(op && ip && compatible(op.type, ip.type));
  }
}
