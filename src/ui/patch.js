// KamiCreative — patch editor.

import { h, svg, icon, clear, setText } from './dom.js';
import { getNodeType, portsOf, PORT_TYPES, formatNumber, compatible, hexToRgb } from '../core/registry.js';
import { showMenu } from './dialogs.js';

const GRID = 8;
const PREVIEW_W = 200, PREVIEW_H = 112;

export class PatchEditor {
  constructor(root, app) {
    this.app = app;
    this.doc = app.doc;
    this.root = root;
    this.views = new Map(); // node id -> view
    this.view = { x: 40, y: 40, z: 1 };
    this.drag = null;
    this.spaceDown = false;
    this.pointer = { x: 0, y: 0 };

    this.viewport = h('div.patch-viewport', { tabindex: 0, 'aria-label': 'Patch editor' });
    this.world = h('div.patch-world');
    this.wires = svg('svg', { class: 'wires' });
    this.wireLayer = svg('g');
    this.tempWire = svg('path', { class: 'wire temp' });
    this.wires.append(this.wireLayer, this.tempWire);
    this.nodeLayer = h('div.nodes');
    this.world.append(this.wires, this.nodeLayer);
    this.marquee = h('div.marquee');
    this.empty = h('div.patch-empty', null,
      h('p.lead', null, 'This scene is empty.'),
      h('p', null, 'Double-click anywhere, or drag a module from the library, to start patching.'));
    this.zoomLabel = h('button.zoom-label', { title: 'Reset zoom (Ctrl+0)', onclick: () => this.setZoom(1) }, '100%');
    this.viewport.append(this.world, this.marquee, this.empty, this.zoomLabel);
    root.appendChild(this.viewport);
    this._bind();

    this.doc.on('load', () => this.rebuild(true));
    this.doc.on('change', () => this.rebuild());
    this.doc.on('selection', () => this.syncSelection());
    this.app.engine.on('scene', () => { this.rebuild(true); });
    this.app.engine.on('portsChanged', (n) => { if (this.views.has(n.id)) { this._rebuildNode(n.id); this.drawWires(); } });
  }

  // ------------------------------------------------------------------ geometry

  toWorld(cx, cy) {
    const r = this.viewport.getBoundingClientRect();
    return [(cx - r.left - this.view.x) / this.view.z, (cy - r.top - this.view.y) / this.view.z];
  }

  applyView() {
    const { x, y, z } = this.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    const g = 24 * z;
    this.viewport.style.backgroundSize = `${g}px ${g}px, ${g * 4}px ${g * 4}px`;
    this.viewport.style.backgroundPosition = `${x}px ${y}px, ${x}px ${y}px`;
    this.zoomLabel.textContent = `${Math.round(z * 100)}%`;
    this.viewport.classList.toggle('zoomed-out', z < 0.55);
    const sc = this.doc.scene;
    if (sc) sc.view = { ...this.view };
  }

  setZoom(z, cx, cy) {
    const r = this.viewport.getBoundingClientRect();
    cx = cx ?? r.left + r.width / 2;
    cy = cy ?? r.top + r.height / 2;
    const [wx, wy] = this.toWorld(cx, cy);
    this.view.z = Math.min(2.5, Math.max(0.2, z));
    this.view.x = cx - r.left - wx * this.view.z;
    this.view.y = cy - r.top - wy * this.view.z;
    this.applyView();
  }

  frameAll(onlySelected = false) {
    const sc = this.doc.scene;
    let nodes = sc.nodes;
    if (onlySelected && this.doc.selection.size) nodes = nodes.filter((n) => this.doc.selection.has(n.id));
    if (!nodes.length) { this.view = { x: 40, y: 40, z: 1 }; this.applyView(); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes) {
      const v = this.views.get(n.id);
      const w = v?.el.offsetWidth || 220, hh = v?.el.offsetHeight || 120;
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + hh);
    }
    const r = this.viewport.getBoundingClientRect();
    const pad = 60;
    const z = Math.min(1.25, Math.max(0.2, Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad * 2) / (y1 - y0))));
    this.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z };
    this.applyView();
  }

  centerWorld() {
    const r = this.viewport.getBoundingClientRect();
    return this.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  // ------------------------------------------------------------------ build

  rebuild(resetView = false) {
    const sc = this.doc.scene;
    if (!sc) return;
    if (resetView || this._sceneId !== sc.id) {
      this._sceneId = sc.id;
      for (const v of this.views.values()) v.el.remove();
      this.views.clear();
      if (sc.view) { this.view = { ...sc.view }; this.applyView(); }
    }
    const want = new Set(sc.nodes.map((n) => n.id));
    for (const [id, v] of this.views) if (!want.has(id)) { v.el.remove(); this.views.delete(id); }
    for (const n of sc.nodes) {
      const v = this.views.get(n.id);
      if (!v) this._createNode(n);
      else {
        const sig = this._sig(n);
        if (sig !== v.sig) this._rebuildNode(n.id);
        else { v.model = n; v.el.style.left = n.x + 'px'; v.el.style.top = n.y + 'px'; this._refreshInputs(v); }
      }
    }
    this.empty.style.display = sc.nodes.length ? 'none' : '';
    this.syncSelection();
    requestAnimationFrame(() => { this._measureAll(); this.drawWires(); if (resetView && !sc.view) this.frameAll(); });
  }

  _sig(n) {
    const def = getNodeType(n.type);
    const ports = def ? portsOf(def, n) : { inputs: [], outputs: [] };
    return JSON.stringify([n.type, n.title, n.bypass, n.preview, ports.inputs.map((p) => p.id), ports.outputs.map((p) => p.id), n.type === 'util.comment' ? n.props : null, n.props?.label]);
  }

  _rebuildNode(id) {
    const old = this.views.get(id);
    const model = this.doc.scene.nodes.find((n) => n.id === id);
    if (old) { old.el.remove(); this.views.delete(id); }
    if (model) {
      const v = this._createNode(model);
      if (this.doc.selection.has(id)) v.el.classList.add('selected');
      requestAnimationFrame(() => { this._measure(v); this.drawWires(); });
    }
  }

  _createNode(model) {
    const def = getNodeType(model.type);
    const rt = () => this.app.engine.runtimeFor(this.doc.scene.id)?.nodes.get(model.id);
    const v = { id: model.id, model, def, rt, inputs: new Map(), outputs: new Map(), anchors: { in: {}, out: {} }, sig: this._sig(model) };
    if (!def) {
      v.el = h('div.node.unknown', { style: { left: model.x + 'px', top: model.y + 'px' }, dataset: { id: model.id } },
        h('div.node-head', null, h('span.node-title', null, `Missing: ${model.type}`)));
      this.nodeLayer.appendChild(v.el);
      this.views.set(model.id, v);
      return v;
    }
    const ports = portsOf(def, model);
    const el = h('div.node', {
      class: `cat-${def.category.replace(/[^a-z]/gi, '').toLowerCase()} ${model.bypass ? 'bypassed' : ''} ${def.widget?.kind === 'comment' ? 'comment' : ''}`,
      style: { left: model.x + 'px', top: model.y + 'px', '--cat': def.color },
      dataset: { id: model.id },
    });
    v.el = el;

    if (def.widget?.kind === 'comment') {
      const text = h('div.comment-text', null, model.props?.text || '');
      el.style.setProperty('--note', model.props?.color || '#f3d36b');
      el.append(h('div.node-head.comment-head', null, h('span.node-title', null, model.title || 'Note')), text);
      el.addEventListener('dblclick', (e) => { e.stopPropagation(); this.app.editComment(model.id); });
      this.nodeLayer.appendChild(el);
      this.views.set(model.id, v);
      return v;
    }

    const title = h('span.node-title', { title: def.description }, model.title || def.name);
    title.addEventListener('dblclick', (e) => { e.stopPropagation(); this._renameInline(v, title); });
    v.activity = h('span.node-activity');
    v.errorBadge = h('span.node-err', { title: '' }, icon('warn', 12));
    const head = h('div.node-head', null, v.activity, title, model.title ? h('span.node-type', null, def.name) : null, v.errorBadge);
    el.appendChild(head);

    if (model.preview && (ports.outputs.some((p) => p.type === 'video') || def.projector)) {
      const big = def.bigPreview;
      v.preview = h('canvas.node-preview', { width: big ? 320 : PREVIEW_W, height: big ? 180 : PREVIEW_H });
      el.appendChild(v.preview);
    }

    const body = h('div.node-body');
    const rows = Math.max(ports.inputs.length, ports.outputs.length);
    for (let i = 0; i < rows; i++) {
      const ip = ports.inputs[i], op = ports.outputs[i];
      body.appendChild(ip ? this._inputCell(v, ip) : h('div.cell.in.blank'));
      body.appendChild(op ? this._outputCell(v, op) : h('div.cell.out.blank'));
    }
    if (rows) el.appendChild(body);
    if (!ports.inputs.length) el.classList.add('no-inputs');
    if (!ports.outputs.length) el.classList.add('no-outputs');

    if (def.widget) { v.widget = this._widget(v, def.widget.kind); if (v.widget) el.appendChild(v.widget.el); }
    v.errorLine = h('div.node-error-line');
    el.appendChild(v.errorLine);

    this.nodeLayer.appendChild(el);
    this.views.set(model.id, v);
    this._refreshInputs(v);
    this.refreshNode(v);
    return v;
  }

  _inputCell(v, p) {
    const dot = h('span.port.in', { dataset: { node: v.id, port: p.id, dir: 'in', type: p.type }, style: { '--pc': PORT_TYPES[p.type]?.color }, title: `${p.name} (${PORT_TYPES[p.type]?.label})` });
    const value = h('span.val', { dataset: { type: p.type } });
    const cell = h('div.cell.in', { dataset: { port: p.id } }, dot, h('span.pname', null, p.name), value);
    v.inputs.set(p.id, { port: p, dot, value, cell });
    if (p.type !== 'video') this._bindValueEditor(v, p, value);
    return cell;
  }

  _outputCell(v, p) {
    const dot = h('span.port.out', { dataset: { node: v.id, port: p.id, dir: 'out', type: p.type }, style: { '--pc': PORT_TYPES[p.type]?.color }, title: `${p.name} (${PORT_TYPES[p.type]?.label})` });
    const value = h('span.val.out');
    const cell = h('div.cell.out', { dataset: { port: p.id } }, value, h('span.pname', null, p.name), dot);
    v.outputs.set(p.id, { port: p, dot, value, cell, last: undefined });
    return cell;
  }

  // ---------------------------------------------------------- value editors

  _connectedIn(v, portId) {
    return this.doc.scene.links.some((l) => l.to[0] === v.id && l.to[1] === portId);
  }

  _displayValue(p, val) {
    switch (p.type) {
      case 'number': return formatNumber(+val || 0);
      case 'bool': return +val ? 'on' : 'off';
      case 'trigger': return '';
      case 'color': return '';
      case 'media': {
        const m = this.app.host.media.resolve(val, p.kind);
        return m ? m.name : val ? 'missing' : 'none';
      }
      case 'text': case 'enum': return String(val ?? '');
      default: return typeof val === 'number' ? formatNumber(val) : String(val ?? '');
    }
  }

  _refreshInputs(v) {
    const rt = v.rt();
    for (const [id, c] of v.inputs) {
      const p = c.port;
      if (p.type === 'video') continue;
      const linked = this._connectedIn(v, id);
      c.cell.classList.toggle('linked', linked);
      const val = linked && rt ? rt.inputs[id] : v.model.values?.[id] ?? p.default;
      this._paintValue(c.value, p, val);
    }
  }

  _paintValue(el, p, val) {
    if (p.type === 'trigger') { if (!el.firstChild) el.appendChild(icon('bolt', 11)); el.title = 'Click to fire'; return; }
    if (p.type === 'color') {
      const c = hexToRgb(val);
      el.style.setProperty('--sw', `rgba(${c[0] * 255},${c[1] * 255},${c[2] * 255},${c[3]})`);
      el.classList.add('swatch');
      el.title = String(val);
      return;
    }
    if (p.type === 'bool') el.classList.toggle('on', !!+val);
    setText(el, this._displayValue(p, val));
  }

  _bindValueEditor(v, p, el) {
    const editable = () => !this._connectedIn(v, p.id);
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (p.type === 'trigger') { this.doc.fire(v.id, p.id); el.classList.add('fired'); setTimeout(() => el.classList.remove('fired'), 150); return; }
      if (!editable()) return;
      if (p.type === 'bool') { const cur = +(v.model.values?.[p.id] ?? p.default); this.doc.setValue(v.id, p.id, cur ? 0 : 1, `b${Math.random()}`); this._refreshInputs(v); return; }
      if (p.type === 'enum') {
        const r = el.getBoundingClientRect();
        const cur = v.model.values?.[p.id] ?? p.default;
        showMenu(r.left, r.bottom + 2, p.options.map((o) => ({ label: o, checked: o === cur, action: () => { this.doc.setValue(v.id, p.id, o, `e${Math.random()}`); this._refreshInputs(v); } })), { minWidth: 120 });
        return;
      }
      if (p.type === 'media') {
        const r = el.getBoundingClientRect();
        const list = this.doc.project.media.filter((m) => !p.kind || m.kind === p.kind || (p.kind === 'audio' && m.kind === 'video'));
        const cur = v.model.values?.[p.id];
        const items = list.length
          ? list.map((m) => ({ label: m.name, checked: m.id === cur, action: () => { this.doc.setValue(v.id, p.id, m.id, `m${Math.random()}`); this._refreshInputs(v); } }))
          : [{ label: 'No matching media — import some first', disabled: true }];
        items.push('-', { label: 'Import media…', action: () => this.app.importMedia() });
        showMenu(r.left, r.bottom + 2, items, { minWidth: 200 });
        return;
      }
      if (p.type === 'color') {
        const input = h('input', { type: 'color', value: String(v.model.values?.[p.id] ?? p.default).slice(0, 7) });
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:' + e.clientX + 'px;top:' + e.clientY + 'px';
        document.body.appendChild(input);
        input.addEventListener('input', () => { this.doc.setValue(v.id, p.id, input.value, `c:${v.id}:${p.id}`); this._refreshInputs(v); });
        input.addEventListener('change', () => input.remove());
        input.addEventListener('blur', () => setTimeout(() => input.remove(), 200));
        input.click();
        return;
      }
      if (p.type === 'number' || p.type === 'any') this._scrub(v, p, el, e);
      else this._typeIn(v, p, el);
    });
  }

  _scrub(v, p, el, e) {
    const start = +(v.model.values?.[p.id] ?? p.default) || 0;
    const range = p.max !== undefined && p.min !== undefined ? p.max - p.min : null;
    const baseStep = p.step || (p.int ? 1 : range ? range / 400 : Math.max(0.01, Math.abs(start) / 100 || 0.1));
    let moved = false;
    const x0 = e.clientX, y0 = e.clientY;
    el.setPointerCapture(e.pointerId);
    const coalesce = `s${performance.now()}`;
    const move = (ev) => {
      const dx = ev.clientX - x0 - (y0 - ev.clientY);
      if (!moved && Math.abs(dx) < 3) return;
      moved = true;
      document.body.classList.add('scrubbing');
      const mult = ev.shiftKey ? 0.1 : ev.ctrlKey || ev.metaKey ? 10 : 1;
      let val = start + dx * baseStep * mult;
      if (p.min !== undefined) val = Math.max(p.min, val);
      if (p.max !== undefined) val = Math.min(p.max, val);
      val = p.int ? Math.round(val) : +val.toFixed(4);
      this.doc.setValue(v.id, p.id, val, coalesce);
      this._paintValue(el, p, val);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      document.body.classList.remove('scrubbing');
      if (!moved) this._typeIn(v, p, el);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  _typeIn(v, p, el) {
    const cur = v.model.values?.[p.id] ?? p.default;
    const input = h('input.val-input', { value: String(cur), spellcheck: false });
    const r = el.getBoundingClientRect();
    input.style.width = Math.max(64, r.width + 24) / this.view.z + 'px';
    el.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit) {
        let val = input.value;
        if (p.type === 'number') { val = parseFloat(val); if (!Number.isFinite(val)) val = cur; }
        else if (p.type === 'any') { const n = Number(val); val = val.trim() !== '' && Number.isFinite(n) ? n : val; }
        this.doc.setValue(v.id, p.id, val, `t${Math.random()}`);
      }
      input.replaceWith(el);
      this._refreshInputs(v);
      this.viewport.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
      else if (e.key === 'Tab') {
        e.preventDefault();
        finish(true);
        const keys = [...v.inputs.keys()].filter((k) => !['video', 'trigger', 'bool', 'enum', 'color', 'media'].includes(v.inputs.get(k).port.type));
        const i = keys.indexOf(p.id);
        const next = v.inputs.get(keys[(i + (e.shiftKey ? -1 : 1) + keys.length) % keys.length]);
        if (next) this._typeIn(v, next.port, next.value);
      }
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  _renameInline(v, titleEl) {
    const input = h('input.val-input.title-input', { value: v.model.title || v.def.name });
    titleEl.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const t = input.value.trim();
      input.replaceWith(titleEl);
      if (ok) this.doc.setNodeAttr([v.id], 'title', t && t !== v.def.name ? t : undefined, 'Rename module');
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // ------------------------------------------------------------------ widgets

  _widget(v, kind) {
    const node = () => v.rt();
    const send = (evt, val) => { const n = node(); if (n) v.def.onWidget?.(n, this.app.engine, evt, val); };
    const persist = (val) => { if (v.def.widget.persist) this.doc.widgetValue(v.id, val); };
    const stop = (e) => e.stopPropagation();
    if (kind === 'slider') {
      const fill = h('div.w-slider-fill');
      const label = h('div.w-slider-label');
      const el = h('div.widget.w-slider', { onpointerdown: stop }, fill, label);
      const setFrom = (e) => {
        const r = el.getBoundingClientRect();
        const n = node(); if (!n) return;
        const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const { min, max } = n.inputs;
        let val = min + (max - min) * t;
        val = Math.abs(max - min) > 20 ? Math.round(val * 10) / 10 : Math.round(val * 1000) / 1000;
        send('set', val); persist(val);
      };
      el.addEventListener('pointerdown', (e) => { if (e.button) return; el.setPointerCapture(e.pointerId); setFrom(e); el.onpointermove = setFrom; });
      el.addEventListener('pointerup', () => { el.onpointermove = null; });
      return { el, update: (n) => { const { min, max } = n.inputs; const t = max === min ? 0 : (n.state.value - min) / (max - min); fill.style.width = Math.min(100, Math.max(0, t * 100)) + '%'; setText(label, formatNumber(n.state.value)); } };
    }
    if (kind === 'button') {
      const el = h('button.widget.w-button', { onpointerdown: (e) => { stop(e); el.setPointerCapture(e.pointerId); el.classList.add('down'); send('down'); }, onpointerup: () => { el.classList.remove('down'); send('up'); } }, v.model.props?.label || 'GO');
      return { el, update: (n) => el.classList.toggle('latched', n.inputs.mode === 'toggle' && !!n.outputs.state) };
    }
    if (kind === 'toggle') {
      const el = h('button.widget.w-toggle', { onpointerdown: (e) => { stop(e); const n = node(); const val = n?.state.value ? 0 : 1; send('set', val); persist(val); } }, h('span.knob'));
      return { el, update: (n) => el.classList.toggle('on', !!n.state.value) };
    }
    if (kind === 'xy') {
      const puck = h('div.w-xy-puck');
      const el = h('div.widget.w-xy', { onpointerdown: stop }, puck);
      const setFrom = (e) => {
        const r = el.getBoundingClientRect();
        const val = [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000) / 10, Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000) / 10];
        send('set', val); persist(val);
      };
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); setFrom(e); el.onpointermove = setFrom; });
      el.addEventListener('pointerup', () => { el.onpointermove = null; });
      return { el, update: (n) => { puck.style.left = n.state.value[0] + '%'; puck.style.top = n.state.value[1] + '%'; } };
    }
    if (kind === 'color') {
      const input = h('input.w-color', { type: 'color', value: String(v.model.props?.value || '#ff4f8b').slice(0, 7), onpointerdown: stop });
      input.addEventListener('input', () => { send('set', input.value); persist(input.value); });
      return { el: h('div.widget.w-colorwrap', null, input), update: (n) => { if (document.activeElement !== input) input.value = String(n.state.value).slice(0, 7); } };
    }
    if (kind === 'monitor') {
      const el = h('div.widget.w-monitor');
      return { el, update: (n) => { const val = n.inputs.in; setText(el, typeof val === 'number' ? formatNumber(val) : String(val ?? '')); } };
    }
    if (kind === 'scope') {
      const c = h('canvas.widget.w-scope', { width: 360, height: 120 });
      const g = c.getContext('2d');
      return {
        el: c,
        update: (n) => {
          const { hist, head } = n.state; const { min, max } = n.inputs;
          g.clearRect(0, 0, c.width, c.height);
          g.strokeStyle = 'rgba(255,255,255,0.08)';
          g.beginPath(); g.moveTo(0, c.height / 2); g.lineTo(c.width, c.height / 2); g.stroke();
          g.strokeStyle = '#f2a93b'; g.lineWidth = 2; g.beginPath();
          for (let i = 0; i < hist.length; i++) {
            const val = hist[(head + i) % hist.length];
            const y = c.height - ((val - min) / (max - min || 1)) * (c.height - 8) - 4;
            const x = (i / (hist.length - 1)) * c.width;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        },
        live: true,
      };
    }
    return null;
  }

  // ------------------------------------------------------------------ refresh

  /** Called every UI tick: paint live values for nodes the engine marked dirty. */
  refresh() {
    const eng = this.app.engine;
    const now = eng.time;
    for (const id of eng.dirty) {
      const v = this.views.get(id);
      if (v) this.refreshNode(v);
    }
    eng.dirty.clear();
    for (const v of this.views.values()) {
      if (v.widget?.live) { const n = v.rt(); if (n) v.widget.update(n); }
      const n = v.rt();
      if (n && v.activity) v.activity.classList.toggle('on', now - n.activity < 0.12);
    }
  }

  refreshNode(v) {
    const n = v.rt();
    if (!n) return;
    for (const [id, c] of v.outputs) {
      const p = c.port;
      const val = n.outputs[id];
      if (p.type === 'video') continue;
      if (p.type === 'trigger') {
        if (val !== c.last && val !== null) { c.last = val; c.value.classList.remove('flash'); void c.value.offsetWidth; c.value.classList.add('flash'); }
        continue;
      }
      if (val === c.last) continue;
      c.last = val;
      if (p.type === 'color') { this._paintValue(c.value, p, val); continue; }
      setText(c.value, val === null || val === undefined ? '' : typeof val === 'number' ? formatNumber(val) : p.type === 'bool' ? (val ? 'on' : 'off') : String(val));
    }
    for (const [id, c] of v.inputs) {
      if (c.port.type === 'video' || !c.cell.classList.contains('linked')) continue;
      this._paintValue(c.value, c.port, n.inputs[id]);
    }
    if (v.widget && !v.widget.live) v.widget.update(n);
    const err = n.error;
    v.el.classList.toggle('has-error', !!err);
    if (v.errorLine) setText(v.errorLine, err || '');
    if (v.errorBadge) v.errorBadge.title = err || '';
  }

  /** Draw node previews (called by the app at a reduced rate). */
  drawPreviews() {
    const eng = this.app.engine, r = this.app.renderer;
    if (!r) return;
    const vp = this.viewport.getBoundingClientRect();
    for (const v of this.views.values()) {
      if (!v.preview) continue;
      const er = v.el.getBoundingClientRect();
      if (er.right < vp.left || er.left > vp.right || er.bottom < vp.top || er.top > vp.bottom) continue;
      const n = v.rt();
      if (!n) continue;
      const vout = n.ports.outputs.find((p) => p.type === 'video');
      const tex = vout ? eng.renderNode(n, vout.id) : n.def.render ? eng.renderNode(n, 'out') : null;
      const g = v.preview.getContext('2d');
      if (!tex) { g.fillStyle = '#0c0e12'; g.fillRect(0, 0, v.preview.width, v.preview.height); continue; }
      const cw = v.preview.width, ch = v.preview.height;
      const ta = tex.width / tex.height, ca = cw / ch;
      let w = cw, hh = ch;
      if (ta > ca) hh = cw / ta; else w = ch * ta;
      const src = r.present(tex, Math.round(w), Math.round(hh));
      g.fillStyle = '#000';
      g.fillRect(0, 0, cw, ch);
      g.drawImage(r.canvas, src.sx, src.sy, src.sw, src.sh, (cw - w) / 2, (ch - hh) / 2, w, hh);
    }
  }

  // ------------------------------------------------------------------ wires

  _measure(v) {
    const base = v.el.getBoundingClientRect();
    const z = this.view.z;
    for (const [id, c] of v.inputs) { const r = c.dot.getBoundingClientRect(); v.anchors.in[id] = [(r.left + r.width / 2 - base.left) / z, (r.top + r.height / 2 - base.top) / z]; }
    for (const [id, c] of v.outputs) { const r = c.dot.getBoundingClientRect(); v.anchors.out[id] = [(r.left + r.width / 2 - base.left) / z, (r.top + r.height / 2 - base.top) / z]; }
  }

  _measureAll() { for (const v of this.views.values()) this._measure(v); }

  _anchor(nodeId, dir, port) {
    const v = this.views.get(nodeId);
    if (!v) return null;
    const a = v.anchors[dir][port];
    if (!a) return null;
    return [v.model.x + a[0], v.model.y + a[1]];
  }

  _path(a, b) {
    const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
    return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`;
  }

  drawWires() {
    clear(this.wireLayer);
    if (!this.doc.scene) return;
    this.linkEls = new Map();
    for (const l of this.doc.scene.links) {
      const a = this._anchor(l.from[0], 'out', l.from[1]);
      const b = this._anchor(l.to[0], 'in', l.to[1]);
      if (!a || !b) continue;
      const v = this.views.get(l.from[0]);
      const type = v?.outputs.get(l.from[1])?.port.type || 'any';
      const d = this._path(a, b);
      const hit = svg('path', { d, class: 'wire-hit', 'data-link': l.id });
      const vis = svg('path', { d, class: `wire t-${type}${this.doc.selectedLinks.has(l.id) ? ' selected' : ''}`, style: `--wc:${PORT_TYPES[type]?.color}` });
      const g = svg('g');
      g.append(vis, hit);
      this.wireLayer.appendChild(g);
      this.linkEls.set(l.id, { vis, hit, l });
    }
  }

  _updateWiresFor(ids) {
    if (!this.linkEls) return this.drawWires();
    for (const { vis, hit, l } of this.linkEls.values()) {
      if (!ids.has(l.from[0]) && !ids.has(l.to[0])) continue;
      const a = this._anchor(l.from[0], 'out', l.from[1]);
      const b = this._anchor(l.to[0], 'in', l.to[1]);
      if (!a || !b) continue;
      const d = this._path(a, b);
      vis.setAttribute('d', d);
      hit.setAttribute('d', d);
    }
  }

  // ------------------------------------------------------------------ selection

  syncSelection() {
    for (const [id, v] of this.views) v.el.classList.toggle('selected', this.doc.selection.has(id));
    if (this.linkEls) for (const [id, e] of this.linkEls) e.vis.classList.toggle('selected', this.doc.selectedLinks.has(id));
    this.app.emit('selection');
  }

  select(ids, additive = false) {
    if (!additive) { this.doc.selection.clear(); this.doc.selectedLinks.clear(); }
    for (const id of ids) this.doc.selection.add(id);
    this.syncSelection();
  }

  // ------------------------------------------------------------------ input

  _bind() {
    const vp = this.viewport;
    vp.addEventListener('pointerdown', (e) => this._onDown(e));
    vp.addEventListener('pointermove', (e) => { this.pointer = { x: e.clientX, y: e.clientY }; });
    vp.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    vp.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node')) return;
      const [x, y] = this.toWorld(e.clientX, e.clientY);
      this.app.quickAdd(e.clientX, e.clientY, [x, y]);
    });
    vp.addEventListener('contextmenu', (e) => this._onContext(e));
    vp.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].some((t) => t.startsWith('application/x-kami'))) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    vp.addEventListener('drop', (e) => {
      const [x, y] = this.toWorld(e.clientX, e.clientY);
      const type = e.dataTransfer.getData('application/x-kami-module');
      const mediaId = e.dataTransfer.getData('application/x-kami-media');
      if (type) { e.preventDefault(); this._addAt(type, x, y); }
      else if (mediaId) { e.preventDefault(); this.app.addMediaNode(mediaId, x, y); }
    });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { this.spaceDown = true; vp.classList.add('pan-ready'); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; vp.classList.remove('pan-ready'); } });
    new ResizeObserver(() => this.applyView()).observe(vp);
  }

  _addAt(type, x, y) {
    const snap = this.doc.project.settings.snapToGrid;
    const m = this.doc.addNode(type, snap ? Math.round(x / GRID) * GRID : x, snap ? Math.round(y / GRID) * GRID : y);
    this.select([m.id]);
    return m;
  }

  _onWheel(e) {
    e.preventDefault();
    const isMouseWheel = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || e.metaKey || isMouseWheel) {
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : e.ctrlKey ? 0.01 : 0.0015));
      this.setZoom(this.view.z * k, e.clientX, e.clientY);
    } else {
      this.view.x -= e.deltaX;
      this.view.y -= e.deltaY;
      this.applyView();
    }
  }

  _onDown(e) {
    this.viewport.focus({ preventScroll: true });
    const t = e.target;
    const pan = e.button === 1 || (e.button === 0 && (this.spaceDown || e.altKey));
    if (pan) { e.preventDefault(); return this._startPan(e); }
    if (e.button !== 0) return;

    const port = t.closest('.port');
    if (port) { e.stopPropagation(); return this._startWire(e, port); }

    const hit = t.closest('.wire-hit');
    if (hit) {
      const id = hit.dataset.link;
      if (!e.shiftKey) { this.doc.selection.clear(); this.doc.selectedLinks.clear(); }
      this.doc.selectedLinks.add(id);
      this.syncSelection();
      return;
    }

    const nodeEl = t.closest('.node');
    if (nodeEl) {
      if (t.closest('.val, .widget, input, textarea, button')) return;
      const id = nodeEl.dataset.id;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (this.doc.selection.has(id)) this.doc.selection.delete(id); else this.doc.selection.add(id);
        this.syncSelection();
        if (!this.doc.selection.has(id)) return;
      } else if (!this.doc.selection.has(id)) this.select([id]);
      return this._startMove(e);
    }
    this._startMarquee(e);
  }

  _startPan(e) {
    const x0 = e.clientX, y0 = e.clientY, vx = this.view.x, vy = this.view.y;
    this.viewport.classList.add('panning');
    this.viewport.setPointerCapture(e.pointerId);
    const move = (ev) => { this.view.x = vx + ev.clientX - x0; this.view.y = vy + ev.clientY - y0; this.applyView(); };
    const up = () => { this.viewport.classList.remove('panning'); this.viewport.removeEventListener('pointermove', move); this.viewport.removeEventListener('pointerup', up); };
    this.viewport.addEventListener('pointermove', move);
    this.viewport.addEventListener('pointerup', up);
  }

  _startMove(e) {
    const ids = [...this.doc.selection];
    const starts = ids.map((id) => { const v = this.views.get(id); return [id, v.model.x, v.model.y]; });
    const [wx0, wy0] = this.toWorld(e.clientX, e.clientY);
    const snap = this.doc.project.settings.snapToGrid;
    let moved = false;
    const idset = new Set(ids);
    this.viewport.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const [wx, wy] = this.toWorld(ev.clientX, ev.clientY);
      let dx = wx - wx0, dy = wy - wy0;
      if (!moved && Math.hypot(dx, dy) < 3 / this.view.z) return;
      moved = true;
      for (const [id, x, y] of starts) {
        const v = this.views.get(id);
        let nx = x + dx, ny = y + dy;
        if (snap && !ev.altKey) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
        v.model.x = nx; v.model.y = ny;
        v.el.style.left = nx + 'px'; v.el.style.top = ny + 'px';
      }
      this._updateWiresFor(idset);
      this._autoPan(ev);
    };
    const up = () => {
      this.viewport.removeEventListener('pointermove', move);
      this.viewport.removeEventListener('pointerup', up);
      if (moved) {
        const moves = starts.map(([id]) => { const v = this.views.get(id); return [id, v.model.x, v.model.y]; });
        for (const [id, x, y] of starts) { const v = this.views.get(id); v.model.x = x; v.model.y = y; }
        this.doc.moveNodes(moves);
        for (const [id, x, y] of moves) { const v = this.views.get(id); v.model.x = x; v.model.y = y; }
      }
    };
    this.viewport.addEventListener('pointermove', move);
    this.viewport.addEventListener('pointerup', up);
  }

  _autoPan(ev) {
    const r = this.viewport.getBoundingClientRect();
    const m = 24;
    let dx = 0, dy = 0;
    if (ev.clientX < r.left + m) dx = 8; else if (ev.clientX > r.right - m) dx = -8;
    if (ev.clientY < r.top + m) dy = 8; else if (ev.clientY > r.bottom - m) dy = -8;
    if (dx || dy) { this.view.x += dx; this.view.y += dy; this.applyView(); }
  }

  _startMarquee(e) {
    const r = this.viewport.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = additive ? new Set(this.doc.selection) : new Set();
    if (!additive) { this.doc.selection.clear(); this.doc.selectedLinks.clear(); this.syncSelection(); }
    this.viewport.setPointerCapture(e.pointerId);
    let active = false;
    const move = (ev) => {
      const x1 = ev.clientX, y1 = ev.clientY;
      if (!active && Math.hypot(x1 - x0, y1 - y0) < 4) return;
      active = true;
      const L = Math.min(x0, x1), T = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
      Object.assign(this.marquee.style, { display: 'block', left: L - r.left + 'px', top: T - r.top + 'px', width: W + 'px', height: H + 'px' });
      const sel = new Set(base);
      for (const [id, v] of this.views) {
        const b = v.el.getBoundingClientRect();
        if (b.right > L && b.left < L + W && b.bottom > T && b.top < T + H) sel.add(id);
      }
      this.doc.selection = sel;
      this.syncSelection();
    };
    const up = () => {
      this.marquee.style.display = 'none';
      this.viewport.removeEventListener('pointermove', move);
      this.viewport.removeEventListener('pointerup', up);
    };
    this.viewport.addEventListener('pointermove', move);
    this.viewport.addEventListener('pointerup', up);
  }

  _startWire(e, portEl) {
    let { node, port, dir, type } = portEl.dataset;
    // Dragging from a connected input picks the existing wire up from its source.
    if (dir === 'in') {
      const existing = this.doc.scene.links.find((l) => l.to[0] === node && l.to[1] === port);
      if (existing) {
        this.doc.disconnect([existing.id]);
        node = existing.from[0]; port = existing.from[1]; dir = 'out';
        type = this.views.get(node)?.outputs.get(port)?.port.type || type;
      }
    }
    const origin = this._anchor(node, dir, port);
    if (!origin) return;
    this.viewport.classList.add('wiring', `wiring-${dir === 'out' ? 'to-in' : 'to-out'}`);
    this.viewport.dataset.wireType = type;
    for (const v of this.views.values()) {
      for (const [, c] of dir === 'out' ? v.inputs : v.outputs) {
        const ok = v.id !== node && (dir === 'out' ? compatible(type, c.port.type) : compatible(c.port.type, type));
        c.dot.classList.toggle('compatible', ok);
      }
    }
    this.tempWire.style.setProperty('--wc', PORT_TYPES[type]?.color);
    this.tempWire.style.display = 'block';
    let target = null;
    this.viewport.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const p = this.toWorld(ev.clientX, ev.clientY);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.port');
      target?.classList.remove('hover');
      target = el && el.classList.contains('compatible') ? el : null;
      target?.classList.add('hover');
      const end = target ? this._anchor(target.dataset.node, target.dataset.dir, target.dataset.port) : p;
      this.tempWire.setAttribute('d', dir === 'out' ? this._path(origin, end) : this._path(end, origin));
      this._autoPan(ev);
    };
    const up = (ev) => {
      this.viewport.removeEventListener('pointermove', move);
      this.viewport.removeEventListener('pointerup', up);
      this.viewport.classList.remove('wiring', 'wiring-to-in', 'wiring-to-out');
      this.tempWire.style.display = 'none';
      for (const el of this.viewport.querySelectorAll('.port.compatible')) el.classList.remove('compatible', 'hover');
      if (target) {
        const t = target.dataset;
        if (dir === 'out') this.doc.connect([node, port], [t.node, t.port]);
        else this.doc.connect([t.node, t.port], [node, port]);
      } else if (!document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.node')) {
        const w = this.toWorld(ev.clientX, ev.clientY);
        this.app.quickAdd(ev.clientX, ev.clientY, w, { from: dir === 'out' ? { node, port, type } : null, to: dir === 'in' ? { node, port, type } : null });
      }
    };
    this.viewport.addEventListener('pointermove', move);
    this.viewport.addEventListener('pointerup', up);
    move(e);
  }

  _onContext(e) {
    e.preventDefault();
    const nodeEl = e.target.closest('.node');
    const wire = e.target.closest('.wire-hit');
    const [wx, wy] = this.toWorld(e.clientX, e.clientY);
    if (wire) {
      showMenu(e.clientX, e.clientY, [{ label: 'Delete connection', danger: true, action: () => this.doc.disconnect([wire.dataset.link]) }]);
      return;
    }
    if (nodeEl) {
      const id = nodeEl.dataset.id;
      if (!this.doc.selection.has(id)) this.select([id]);
      const ids = [...this.doc.selection];
      const v = this.views.get(id);
      const model = v.model, def = v.def;
      const items = [
        { header: ids.length > 1 ? `${ids.length} modules` : def?.name || 'Module' },
        { label: 'Rename…', disabled: ids.length > 1, action: () => this.app.renameNode(id) },
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => this.app.command('duplicate') },
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => this.app.command('copy') },
        { label: model.bypass ? 'Enable' : 'Bypass', shortcut: 'B', action: () => this.doc.setNodeAttr(ids, 'bypass', !model.bypass || undefined, model.bypass ? 'Enable' : 'Bypass') },
      ];
      if (def && (portsOf(def, model).outputs.some((p) => p.type === 'video') || def.projector)) {
        items.push({ label: 'Show preview', checked: !!model.preview, action: () => this.doc.setNodeAttr(ids, 'preview', !model.preview || undefined, 'Toggle preview') });
      }
      if (def?.ports && ids.length === 1) {
        const c = model.props?.count || 4;
        items.push('-', { label: 'Add port', disabled: c >= 16, action: () => this.doc.setProp(id, 'count', c + 1, { label: 'Add port' }) }, { label: 'Remove port', disabled: c <= 2, action: () => this.doc.setProp(id, 'count', c - 1, { label: 'Remove port' }) });
      }
      items.push('-', { label: 'Help', action: () => this.app.showHelp(model.type) }, '-', { label: 'Delete', shortcut: 'Del', danger: true, action: () => this.doc.removeNodes(ids) });
      showMenu(e.clientX, e.clientY, items);
      return;
    }
    showMenu(e.clientX, e.clientY, [
      { label: 'Add module…', shortcut: 'Double-click', action: () => this.app.quickAdd(e.clientX, e.clientY, [wx, wy]) },
      { label: 'Add note', action: () => this._addAt('util.comment', wx, wy) },
      { label: 'Paste', shortcut: 'Ctrl+V', disabled: !this.app.clipboard, action: () => this.doc.paste(this.app.clipboard, [wx, wy]) },
      '-',
      { label: 'Select all', shortcut: 'Ctrl+A', action: () => this.select(this.doc.scene.nodes.map((n) => n.id)) },
      { label: 'Frame all', shortcut: 'F', action: () => this.frameAll() },
    ]);
  }
}

export function isTyping(e) {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable;
}
