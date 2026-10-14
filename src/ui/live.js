// Live view: an operator panel with the cue list, GO / BACK, and the active scene's controls.

import { h, icon, clear, setText } from './dom.js';
import { getNodeType, formatNumber } from '../core/registry.js';

const LIVE_KINDS = new Set(['slider', 'button', 'toggle', 'xy', 'monitor', 'color']);

export class LivePanel {
  constructor(root, app) {
    this.app = app;
    this.doc = app.doc;
    this.root = root;
    this.cues = h('ol.live-cues');
    this.current = h('div.live-current');
    this.controls = h('div.live-controls');
    this.go = h('button.go-btn', { title: 'Go to next scene (Space in Live view, PageDown)', onclick: () => app.command('next') }, h('span', null, 'GO'));
    this.back = h('button.btn.back-btn', { title: 'Previous scene (PageUp)', onclick: () => app.command('prev') }, icon('prev', 14), 'Back');
    root.append(
      h('div.live-left', null, h('div.live-go', null, this.go, this.back), this.current, h('h3.live-label', null, 'Cue list'), this.cues),
      h('div.live-right', null, h('h3.live-label', null, 'Scene controls'), this.controls),
    );
    this.widgets = [];
    this.doc.on('load', () => this.render());
    this.doc.on('change', () => this.render());
    app.engine.on('scene', () => this.render());
  }

  render() {
    const p = this.doc.project;
    if (!p) return;
    clear(this.cues);
    const idx = p.scenes.findIndex((s) => s.id === p.activeScene);
    p.scenes.forEach((s, i) => {
      this.cues.appendChild(h('li', { class: i === idx ? 'active' : i === idx + 1 ? 'next' : '', onclick: () => this.doc.goScene(s.id) },
        h('span.cue-num', null, String(i + 1)), h('span.cue-name', null, s.name), s.fadeIn ? h('span.cue-fade', null, `${s.fadeIn}s`) : null));
    });
    const sc = p.scenes[idx];
    const next = p.scenes[idx + 1];
    clear(this.current);
    this.current.append(
      h('div.now', null, h('span.k', null, 'Now'), h('strong', null, sc?.name || '—')),
      h('div.nxt', null, h('span.k', null, 'Next'), h('span', null, next ? next.name : 'End of show')),
    );
    if (sc?.notes) this.current.append(h('p.cue-notes', null, sc.notes));
    this.go.disabled = !next;
    this._controls(sc);
  }

  _controls(sc) {
    clear(this.controls);
    this.widgets = [];
    const nodes = (sc?.nodes || []).filter((n) => LIVE_KINDS.has(getNodeType(n.type)?.widget?.kind)).sort((a, b) => a.y - b.y || a.x - b.x);
    if (!nodes.length) {
      this.controls.appendChild(h('p.panel-empty', null, 'Add Slider, Button, Switch, XY Pad, Colour Picker or Monitor modules to this scene and they will appear here as large controls.'));
      return;
    }
    for (const model of nodes) {
      const def = getNodeType(model.type);
      const rt = () => this.app.engine.runtimeFor(sc.id)?.nodes.get(model.id);
      const send = (evt, v) => { const n = rt(); if (n) def.onWidget?.(n, this.app.engine, evt, v); if (evt === 'set' && def.widget.persist) this.doc.widgetValue(model.id, v); };
      const label = model.props?.label || model.title || def.name;
      let el, update;
      switch (def.widget.kind) {
        case 'slider': {
          const fill = h('div.lw-fill'); const val = h('span.lw-val');
          el = h('div.lw.lw-slider', null, fill, h('span.lw-label', null, label), val);
          const setFrom = (e) => { const r = el.getBoundingClientRect(); const n = rt(); if (!n) return; const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); const v = Math.round((n.inputs.min + (n.inputs.max - n.inputs.min) * t) * 100) / 100; send('set', v); };
          el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); setFrom(e); el.onpointermove = setFrom; });
          el.addEventListener('pointerup', () => { el.onpointermove = null; });
          update = (n) => { const t = (n.state.value - n.inputs.min) / (n.inputs.max - n.inputs.min || 1); fill.style.width = Math.max(0, Math.min(100, t * 100)) + '%'; setText(val, formatNumber(n.state.value)); };
          break;
        }
        case 'button':
          el = h('button.lw.lw-button', { onpointerdown: (e) => { el.setPointerCapture(e.pointerId); el.classList.add('down'); send('down'); }, onpointerup: () => { el.classList.remove('down'); send('up'); } }, label);
          update = (n) => el.classList.toggle('latched', n.inputs.mode === 'toggle' && !!n.outputs.state);
          break;
        case 'toggle':
          el = h('button.lw.lw-toggle', { onclick: () => { const n = rt(); send('set', n?.state.value ? 0 : 1); } }, h('span.lw-label', null, label), h('span.lw-state'));
          update = (n) => { el.classList.toggle('on', !!n.state.value); setText(el.lastChild, n.state.value ? 'On' : 'Off'); };
          break;
        case 'xy': {
          const puck = h('div.w-xy-puck');
          const pad = h('div.lw-xypad', null, puck);
          el = h('div.lw.lw-xy', null, h('span.lw-label', null, label), pad);
          const setFrom = (e) => { const r = pad.getBoundingClientRect(); send('set', [Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000) / 10, Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000) / 10]); };
          pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); setFrom(e); pad.onpointermove = setFrom; });
          pad.addEventListener('pointerup', () => { pad.onpointermove = null; });
          update = (n) => { puck.style.left = n.state.value[0] + '%'; puck.style.top = n.state.value[1] + '%'; };
          break;
        }
        case 'color': {
          const inp = h('input', { type: 'color', value: String(model.props?.value || '#ffffff').slice(0, 7) });
          inp.addEventListener('input', () => send('set', inp.value));
          el = h('label.lw.lw-color', null, h('span.lw-label', null, label), inp);
          update = (n) => { if (document.activeElement !== inp) inp.value = String(n.state.value).slice(0, 7); };
          break;
        }
        case 'monitor': {
          const v = h('span.lw-big');
          el = h('div.lw.lw-monitor', null, h('span.lw-label', null, label), v);
          update = (n) => { const x = n.inputs.in; setText(v, typeof x === 'number' ? formatNumber(x) : String(x ?? '')); };
          break;
        }
        default: continue;
      }
      this.controls.appendChild(el);
      this.widgets.push({ rt, update });
    }
  }

  refresh() {
    for (const w of this.widgets) { const n = w.rt(); if (n) w.update(n); }
  }
}
