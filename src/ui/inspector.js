// Inspector: full parameter editing for the selected module, or scene properties.

import { h, icon, clear, setText } from './dom.js';
import { getNodeType, portsOf, PORT_TYPES, formatNumber, hexToRgb } from '../core/registry.js';
import { openReactEditor, canReact } from './soundui.js';
import { REACT_BANDS } from '../audio/analysis.js';

export class Inspector {
  constructor(root, app) {
    this.app = app;
    this.doc = app.doc;
    this.root = root;
    this.body = h('div.inspector');
    root.appendChild(this.body);
    this.liveEls = new Map();
    this.previewType = null;
    app.on('selection', () => { this.previewType = null; this.render(); });
    this.doc.on('change', (e) => { if (!e?.quiet) this.render(); });
    this.doc.on('load', () => this.render());
    app.engine.on('scene', () => this.render());
    this.render();
  }

  showType(type) { this.previewType = type; this.render(); }

  render() {
    clear(this.body);
    this.liveEls.clear();
    const sel = [...this.doc.selection].filter((id) => this.doc.node(id));
    if (this.previewType) return this._typeInfo(getNodeType(this.previewType));
    if (sel.length === 1) return this._node(this.doc.node(sel[0]));
    if (sel.length > 1) return this._multi(sel);
    this._scene();
  }

  _section(title, ...children) { return h('section.insp-section', null, title ? h('h3', null, title) : null, ...children); }

  _typeInfo(def) {
    if (!def) return;
    this.body.append(
      h('div.insp-head', { style: { '--cat': def.color } }, h('span.cat-dot'), h('div', null, h('h2', null, def.name), h('p.insp-sub', null, def.category))),
      h('p.insp-desc', null, def.description),
      this._section('Inputs', ...def.inputs.map((p) => h('div.port-doc', null, h('span.pdot', { style: { background: PORT_TYPES[p.type]?.color } }), h('span', null, p.name), h('span.ptype', null, PORT_TYPES[p.type]?.label)))),
      this._section('Outputs', ...def.outputs.map((p) => h('div.port-doc', null, h('span.pdot', { style: { background: PORT_TYPES[p.type]?.color } }), h('span', null, p.name), h('span.ptype', null, PORT_TYPES[p.type]?.label)))),
      h('button.btn.primary.wide', { onclick: () => this.app.addModuleAtCenter(def.type) }, icon('plus', 14), 'Add to patch'),
    );
  }

  _node(model) {
    if (!model) return this._scene();
    const def = getNodeType(model.type);
    if (!def) { this.body.append(h('p.panel-empty', null, `Module type "${model.type}" is not available in this version.`)); return; }
    const ports = portsOf(def, model);
    const rt = this.app.engine.runtimeFor(this.doc.scene.id)?.nodes.get(model.id);
    const titleInput = h('input.field', { value: model.title || '', placeholder: def.name, spellcheck: false, 'aria-label': 'Module name' });
    titleInput.addEventListener('change', () => this.doc.setNodeAttr([model.id], 'title', titleInput.value.trim() || undefined, 'Rename module'));
    this.body.append(
      h('div.insp-head', { style: { '--cat': def.color } }, h('span.cat-dot'), h('div', null, h('h2', null, model.title || def.name), h('p.insp-sub', null, `${def.category} · ${def.name}`))),
      h('p.insp-desc', null, def.description),
      h('label.form-row', null, h('span', null, 'Name'), titleInput),
    );
    if (rt?.error) this.body.append(h('div.insp-error', null, icon('warn', 14), h('span', null, rt.error)));

    // Props
    const propRows = [];
    if (def.ports) {
      const c = model.props?.count || 4;
      const num = h('input.field.num', { type: 'number', min: 1, max: 32, value: c });
      num.addEventListener('change', () => this.doc.setProp(model.id, 'count', Math.max(1, Math.min(32, +num.value || c)), { label: 'Change port count' }));
      propRows.push(h('label.form-row', null, h('span', null, 'Port count'), num));
    }
    if (def.type === 'src.shader') {
      const ta = h('textarea.code', { spellcheck: false, value: model.props?.code || '', rows: 18, 'aria-label': 'GLSL code' });
      ta.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') apply();
      });
      const apply = () => this.doc.setProp(model.id, 'code', ta.value, { label: 'Edit shader', coalesce: `code:${model.id}` });
      propRows.push(h('div.code-wrap', null, ta, h('div.row-actions', null, h('span.hint', null, 'Ctrl+Enter to compile'), h('button.btn.primary', { onclick: apply }, 'Compile'))));
    }
    if (def.widget?.kind === 'button' || def.widget?.kind === 'slider' || def.widget?.kind === 'monitor') {
      const lab = h('input.field', { value: model.props?.label || '', placeholder: def.widget.kind === 'button' ? 'GO' : 'Label shown on Live panel' });
      lab.addEventListener('change', () => this.doc.setProp(model.id, 'label', lab.value, { label: 'Change label' }));
      propRows.push(h('label.form-row', null, h('span', null, 'Label'), lab));
    }
    if (def.widget?.kind === 'comment') {
      const ta = h('textarea.field', { rows: 6, value: model.props?.text || '' });
      ta.addEventListener('change', () => this.doc.setProp(model.id, 'text', ta.value, { label: 'Edit note' }));
      const col = h('input', { type: 'color', value: model.props?.color || '#f3d36b' });
      col.addEventListener('change', () => this.doc.setProp(model.id, 'color', col.value, { label: 'Note colour' }));
      propRows.push(h('label.form-row.stack', null, h('span', null, 'Text'), ta), h('label.form-row', null, h('span', null, 'Colour'), col));
    }
    if (propRows.length) this.body.append(this._section('Settings', ...propRows));

    const inputs = ports.inputs.filter((p) => p.type !== 'video');
    if (inputs.length) {
      this.body.append(this._section('Inputs', ...inputs.map((p) => this._editor(model, p, rt))));
    }
    const vins = ports.inputs.filter((p) => p.type === 'video');
    const outs = ports.outputs;
    if (outs.length) {
      const rows = outs.map((p) => {
        const val = h('span.live-val');
        this.liveEls.set(p.id, { el: val, p });
        return h('div.out-row', null, h('span.pdot', { style: { background: PORT_TYPES[p.type]?.color } }), h('span', null, p.name), val);
      });
      this.body.append(this._section('Outputs', ...rows));
    }
    if (vins.length) {
      const links = this.doc.scene.links;
      this.body.append(this._section('Video inputs', ...vins.map((p) => {
        const l = links.find((k) => k.to[0] === model.id && k.to[1] === p.id);
        const src = l && this.doc.node(l.from[0]);
        return h('div.out-row', null, h('span.pdot', { style: { background: PORT_TYPES.video.color } }), h('span', null, p.name), h('span.live-val', null, src ? (src.title || getNodeType(src.type)?.name) : 'not connected'));
      })));
    }
    const bypass = h('input', { type: 'checkbox', checked: !!model.bypass });
    bypass.addEventListener('change', () => this.doc.setNodeAttr([model.id], 'bypass', bypass.checked || undefined, bypass.checked ? 'Bypass' : 'Enable'));
    this.body.append(this._section(null, h('label.check-row', null, bypass, h('span', null, 'Bypass this module'))));
    this.refresh();
  }

  _editor(model, p, rt) {
    const linked = this.doc.scene.links.some((l) => l.to[0] === model.id && l.to[1] === p.id);
    const cur = model.values?.[p.id] ?? p.default;
    const set = (v, co) => this.doc.setValue(model.id, p.id, v, co);
    let ctl;
    switch (p.type) {
      case 'number': {
        const num = h('input.field.num', { type: 'number', value: cur, step: p.step || (p.int ? 1 : 'any'), min: p.min, max: p.max });
        num.addEventListener('change', () => { const v = parseFloat(num.value); if (Number.isFinite(v)) set(v); });
        if (p.min !== undefined && p.max !== undefined) {
          const rng = h('input.range', { type: 'range', min: p.min, max: p.max, step: p.step || (p.int ? 1 : (p.max - p.min) / 1000), value: cur });
          rng.addEventListener('input', () => { num.value = rng.value; set(+rng.value, `r:${model.id}:${p.id}`); });
          ctl = h('div.num-pair', null, rng, num);
        } else ctl = num;
        break;
      }
      case 'bool': {
        const c = h('input', { type: 'checkbox', checked: !!+cur });
        c.addEventListener('change', () => set(c.checked ? 1 : 0));
        ctl = h('label.switch', null, c, h('span.slider'));
        break;
      }
      case 'enum': {
        const s = h('select.field', null, ...p.options.map((o) => h('option', { value: o, selected: o === cur }, o)));
        s.addEventListener('change', () => set(s.value));
        ctl = s;
        break;
      }
      case 'color': {
        const rgb = hexToRgb(cur);
        const c = h('input', { type: 'color', value: String(cur).slice(0, 7) });
        const a = h('input.range', { type: 'range', min: 0, max: 255, value: Math.round(rgb[3] * 255), title: 'Alpha' });
        const emit = () => set(c.value + (+a.value < 255 ? (+a.value).toString(16).padStart(2, '0') : ''), `c:${model.id}:${p.id}`);
        c.addEventListener('input', emit); a.addEventListener('input', emit);
        ctl = h('div.color-pair', null, c, a);
        break;
      }
      case 'media': {
        const list = this.doc.project.media.filter((m) => !p.kind || m.kind === p.kind || (p.kind === 'audio' && m.kind === 'video'));
        const s = h('select.field', null, h('option', { value: '' }, '— none —'), ...list.map((m) => h('option', { value: m.id, selected: m.id === cur }, m.name)));
        s.addEventListener('change', () => set(s.value));
        ctl = s;
        break;
      }
      case 'trigger':
        ctl = h('button.btn.small', { onclick: () => this.doc.fire(model.id, p.id) }, icon('bolt', 12), 'Fire');
        break;
      case 'text': {
        const long = p.id === 'list' || p.id === 'text' || p.id === 'tpl';
        const t = long ? h('textarea.field', { rows: 3, value: cur, spellcheck: false }) : h('input.field', { value: cur, spellcheck: false });
        t.addEventListener('change', () => set(t.value));
        t.addEventListener('keydown', (e) => e.stopPropagation());
        ctl = t;
        break;
      }
      default: {
        const t = h('input.field', { value: cur, spellcheck: false });
        t.addEventListener('change', () => { const n = Number(t.value); set(t.value.trim() !== '' && Number.isFinite(n) ? n : t.value); });
        ctl = t;
      }
    }
    const react = !linked && model.react?.[p.id];
    const soundBtn = canReact(p) && !linked
      ? h('button.icon-btn.react-btn', { class: react ? 'on' : '', title: react ? 'Reacting to sound — click to change' : 'Make this react to sound', onclick: () => openReactEditor(this.app, model.id, p.id) }, icon('sound', 13))
      : null;
    const row = h('div.form-row.param', { class: linked ? 'linked' : react ? 'linked reacting' : '' },
      h('span', { title: PORT_TYPES[p.type]?.label }, h('span.pdot', { style: { background: PORT_TYPES[p.type]?.color } }), p.name),
      h('div.param-ctl', null, ctl, soundBtn));
    if (linked || react) {
      const live = h('span.live-val');
      this.liveEls.set('in:' + p.id, { el: live, p, input: true });
      const band = react && REACT_BANDS.find((b) => b.id === react.band);
      row.appendChild(h('span.linked-note', null, react
        ? (p.type === 'trigger' ? `fires on ${react.every > 1 ? `every ${react.every} beats` : 'every beat'}` : `follows ${band?.label.toLowerCase() || 'sound'} (${formatNumber(react.min)} → ${formatNumber(react.max)}): `)
        : 'driven by a connection: ', p.type === 'trigger' ? null : live));
    }
    return row;
  }

  _multi(ids) {
    const nodes = ids.map((id) => this.doc.node(id)).filter(Boolean);
    const align = (axis) => {
      const v = axis === 'x' ? Math.min(...nodes.map((n) => n.x)) : Math.min(...nodes.map((n) => n.y));
      this.doc.moveNodes(nodes.map((n) => [n.id, axis === 'x' ? v : n.x, axis === 'y' ? v : n.y]));
      this.doc.emit('change', {});
    };
    this.body.append(
      h('div.insp-head', null, h('div', null, h('h2', null, `${nodes.length} modules selected`), h('p.insp-sub', null, 'Edit them together or align them.'))),
      this._section('Arrange',
        h('div.btn-row', null,
          h('button.btn', { onclick: () => align('x') }, 'Align left edges'),
          h('button.btn', { onclick: () => align('y') }, 'Align top edges'))),
      this._section(null,
        h('div.btn-row', null,
          h('button.btn', { onclick: () => this.app.command('duplicate') }, 'Duplicate'),
          h('button.btn', { onclick: () => this.doc.setNodeAttr(ids, 'bypass', true, 'Bypass') }, 'Bypass all'),
          h('button.btn.danger', { onclick: () => this.doc.removeNodes(ids) }, 'Delete'))),
    );
  }

  _scene() {
    const sc = this.doc.scene;
    if (!sc) return;
    const idx = this.doc.project.scenes.indexOf(sc) + 1;
    const name = h('input.field', { value: sc.name, spellcheck: false });
    name.addEventListener('change', () => this.doc.updateScene(sc.id, { name: name.value.trim() || sc.name }));
    const fade = h('input.field.num', { type: 'number', min: 0, step: 0.1, value: sc.fadeIn || 0 });
    fade.addEventListener('change', () => this.doc.updateScene(sc.id, { fadeIn: Math.max(0, +fade.value || 0) }));
    const notes = h('textarea.field', { rows: 5, value: sc.notes || '', placeholder: 'Cue notes for the operator…' });
    notes.addEventListener('change', () => this.doc.updateScene(sc.id, { notes: notes.value }));
    notes.addEventListener('keydown', (e) => e.stopPropagation());
    const counts = `${sc.nodes.length} module${sc.nodes.length === 1 ? '' : 's'}, ${sc.links.length} connection${sc.links.length === 1 ? '' : 's'}`;
    this.body.append(
      h('div.insp-head', null, h('span.scene-num', null, String(idx)), h('div', null, h('h2', null, sc.name), h('p.insp-sub', null, counts))),
      this._section('Scene',
        h('label.form-row', null, h('span', null, 'Name'), name),
        h('label.form-row', null, h('span', null, 'Cross-fade in (s)'), fade),
        h('label.form-row.stack', null, h('span', null, 'Notes'), notes)),
      h('p.insp-tip', null, 'Select a module to edit its parameters. Double-click the patch to add one.'),
    );
  }

  /** Live-update output values (called from the UI tick). */
  refresh() {
    if (!this.liveEls.size) return;
    const id = [...this.doc.selection][0];
    const rt = id && this.app.engine.runtimeFor(this.doc.scene.id)?.nodes.get(id);
    if (!rt) return;
    for (const [key, { el, p, input }] of this.liveEls) {
      const v = input ? rt.inputs[p.id] : rt.outputs[key];
      let s;
      if (p.type === 'video') { const t = rt.cache?.[key]; s = t ? `${t.width}×${t.height}` : '—'; }
      else if (p.type === 'trigger') s = v ? `last at ${formatNumber(v)} s` : '—';
      else if (typeof v === 'number') s = formatNumber(v);
      else s = v === null || v === undefined ? '—' : String(v);
      setText(el, s);
    }
  }
}
