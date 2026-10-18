// Sound UI: the toolbar Sound button + panel, and the "React to sound" editor.

import { h, icon, setText, clear } from './dom.js';
import { modal, showMenu } from './dialogs.js';
import { REACT_BANDS } from '../audio/analysis.js';
import { getNodeType, portsOf, formatNumber } from '../core/registry.js';

const SOURCE_LABEL = { mic: 'Microphone', system: 'Computer audio', off: 'Off' };
export const AUTO_ADVANCE = [0, 4, 8, 16, 32, 64];

// ------------------------------------------------------------ react editor

/** Default range for a new binding on a port, based on its current value and limits. */
export function defaultRange(port, current) {
  const cur = Number.isFinite(+current) ? +current : 0;
  if (port.type === 'bool') return [0, 100];
  let lo = cur;
  let hi = port.max !== undefined ? port.max : cur === 0 ? 100 : cur * 2;
  if (port.min !== undefined && port.max !== undefined && port.max - port.min <= 400 && cur === port.min) hi = port.max;
  if (hi === lo) hi = lo + 100;
  return [lo, hi];
}

export function canReact(port) { return ['number', 'trigger', 'bool', 'any'].includes(port.type); }

/** Quick menu entries for a port (used by the patch right-click menu). */
export function reactMenuItems(app, model, port) {
  const cur = model.react?.[port.id];
  const linked = app.doc.scene.links.some((l) => l.to[0] === model.id && l.to[1] === port.id);
  if (!canReact(port)) return [];
  const items = [{ header: `${port.name}: react to sound` }];
  if (linked) return [...items, { label: 'Unplug its wire first to make it react to sound', disabled: true }];
  const bands = port.type === 'trigger' ? REACT_BANDS.filter((b) => b.id === 'beat') : REACT_BANDS;
  for (const b of bands) {
    items.push({
      label: port.type === 'trigger' ? 'Fire on every beat' : `${b.label} — ${b.hint}`,
      checked: cur?.band === b.id,
      action: () => {
        const val = model.values?.[port.id] ?? port.default;
        const [lo, hi] = cur ? [cur.min, cur.max] : defaultRange(port, val);
        app.doc.setReact(model.id, port.id, { ...(cur || {}), band: b.id, min: lo, max: hi, smooth: cur?.smooth ?? (b.id === 'beat' ? 35 : 30), every: cur?.every || 1 });
        app.sound.ensureListening();
      },
    });
  }
  items.push({ label: 'Fine-tune…', disabled: !cur, action: () => openReactEditor(app, model.id, port.id) });
  if (cur) items.push({ label: 'Stop reacting to sound', danger: true, action: () => app.doc.setReact(model.id, port.id, null) });
  return items;
}

export function openReactEditor(app, nodeId, portId) {
  const doc = app.doc;
  const model = doc.node(nodeId);
  const def = model && getNodeType(model.type);
  const port = def && portsOf(def, model).inputs.find((p) => p.id === portId);
  if (!port) return;
  const original = model.react?.[portId] ? { ...model.react[portId] } : null;
  const val = model.values?.[portId] ?? port.default;
  const [dlo, dhi] = defaultRange(port, val);
  const b = { band: port.type === 'trigger' ? 'beat' : 'bass', min: dlo, max: dhi, smooth: 30, every: 1, invert: false, ...(original || {}) };
  const coalesce = `react:${nodeId}:${portId}:${Date.now()}`;
  const apply = () => doc.setReact(nodeId, portId, { ...b }, coalesce);
  app.sound.ensureListening();

  const bandBtns = h('div.react-bands');
  const paintBands = () => {
    clear(bandBtns);
    for (const band of port.type === 'trigger' ? REACT_BANDS.filter((x) => x.id === 'beat') : REACT_BANDS) {
      bandBtns.appendChild(h('button.react-band', { class: b.band === band.id ? 'on' : '', onclick: () => { b.band = band.id; paintBands(); apply(); } },
        h('strong', null, band.label), h('span', null, band.hint)));
    }
  };
  paintBands();

  const num = (key, label) => {
    const inp = h('input.field.num', { type: 'number', value: b[key], step: port.int ? 1 : 'any' });
    inp.addEventListener('input', () => { const x = parseFloat(inp.value); if (Number.isFinite(x)) { b[key] = x; apply(); } });
    return h('label.form-row', null, h('span', null, label), inp);
  };
  const smooth = h('input.range', { type: 'range', min: 0, max: 95, value: b.smooth });
  smooth.addEventListener('input', () => { b.smooth = +smooth.value; apply(); });
  const inv = h('input', { type: 'checkbox', checked: !!b.invert });
  inv.addEventListener('change', () => { b.invert = inv.checked; apply(); });
  const every = h('select.field', null, ...[1, 2, 4, 8, 16].map((k) => h('option', { value: k, selected: k === (b.every || 1) }, k === 1 ? 'every beat' : `every ${k} beats`)));
  every.addEventListener('change', () => { b.every = +every.value; apply(); });

  const meterFill = h('span');
  const meterVal = h('span.react-live-val');
  const meter = h('div.react-meter', null, meterFill);
  const timer = setInterval(() => {
    const rt = app.engine.runtimeFor(doc.scene.id)?.nodes.get(nodeId);
    if (!rt) return;
    if (port.type === 'trigger') { const p = app.sound.engine.values; meterFill.style.width = p.beat ? '100%' : '0%'; setText(meterVal, `beats heard: ${p.beatCount}`); return; }
    const x = +rt.inputs[portId] || 0;
    const lo = Math.min(b.min, b.max), hi = Math.max(b.min, b.max);
    meterFill.style.width = `${Math.max(0, Math.min(100, ((x - lo) / (hi - lo || 1)) * 100))}%`;
    setText(meterVal, formatNumber(x));
  }, 50);

  const rows = port.type === 'trigger'
    ? [h('label.form-row', null, h('span', null, 'Fire'), every)]
    : [num('min', 'When quiet'), num('max', 'When loud'),
      h('label.form-row', null, h('span', null, b.band === 'beat' ? 'Fall-off' : 'Smoothness'), smooth),
      h('label.check-row', null, inv, h('span', null, 'Reverse (loud makes it smaller)'))];

  let done = false;
  if (!original) apply(); // new binding: create it now so the effect is visible immediately
  modal({
    title: `Make "${port.name}" react to sound`,
    width: 520,
    className: 'react-modal',
    body: h('div', null,
      h('p.hint', null, `${model.title || def.name} will follow the music. Changes show up live — play something or talk to try it.`),
      h('h3', null, 'Listen to'), bandBtns,
      h('h3', null, port.type === 'trigger' ? 'Timing' : 'Range'), ...rows,
      h('h3', null, 'Right now'), h('div.react-live', null, meter, meterVal),
      app.sound.engine.state !== 'listening' && !app.sound.engine.values.active ? h('p.hint.react-warn', null, icon('warn', 12), ' KamiCreative is not hearing anything yet. Choose a sound source with the Sound button in the toolbar.') : null),
    actions: [
      { label: 'Remove', danger: true, action: () => { done = true; doc.setReact(nodeId, portId, null); } },
      { label: 'Cancel', action: () => { done = true; doc.setReact(nodeId, portId, original, coalesce); } },
      { label: 'Done', primary: true, action: () => { done = true; } },
    ],
    onClose: () => { clearInterval(timer); if (!done) { /* closed with X / Esc: keep live changes */ } },
  });
}

// ------------------------------------------------------------ sound panel

export class SoundUI {
  constructor(app) {
    this.app = app;
    this.engine = app.host.sound;
    this.panel = null;
    this._beatCount = 0;
    this.engine.on('state', () => { this.paintButton(); if (this.panel) this.renderPanel(); });
    app.doc.on('load', () => this.syncSettings());
  }

  get settings() { return this.app.doc.project.settings.sound; }

  syncSettings() { this.engine.configure(this.app.doc.project.settings.sound); }

  ensureListening() { this.engine.need(); }

  update(key, value, label = 'Sound settings') {
    this.app.doc.edit(label, () => { this.app.doc.project.settings.sound[key] = value; }, { scope: 'project', coalesce: `sound:${key}`, quiet: true });
    this.syncSettings();
    if (this.panel) this.renderPanel();
  }

  // Toolbar button with a three-band meter and beat light.
  button() {
    this.bars = [h('span'), h('span'), h('span')];
    this.dot = h('span.snd-dot');
    this.btnLabel = h('span.snd-label', null, 'Sound');
    this.btn = h('button.snd-btn', { title: 'Sound: choose what KamiCreative listens to', onclick: () => this.toggle() },
      icon('sound', 15), h('span.snd-meter', null, ...this.bars), this.dot, this.btnLabel);
    this.paintButton();
    return this.btn;
  }

  paintButton() {
    if (!this.btn) return;
    const st = this.engine.state;
    this.btn.dataset.state = st;
    setText(this.btnLabel, st === 'listening' ? (this.settings?.source === 'system' ? 'Computer audio' : 'Mic') : st === 'error' ? 'Sound problem' : st === 'starting' ? 'Starting…' : this._hearing ? 'Sound Player' : 'Sound');
  }

  /** Called every frame from the app loop. */
  tick() {
    const v = this.engine.values;
    if (this.btn) {
      const hearing = !!v.active;
      if (hearing !== this._hearing) { this._hearing = hearing; this.btn.classList.toggle('hearing', hearing); this.paintButton(); }
    }
    if (this.bars) {
      this.bars[0].style.height = `${12 + v.bass * 0.88}%`;
      this.bars[1].style.height = `${12 + v.mid * 0.88}%`;
      this.bars[2].style.height = `${12 + v.treble * 0.88}%`;
      if (v.beat) { this.dot.classList.remove('on'); void this.dot.offsetWidth; this.dot.classList.add('on'); }
    }
    // Auto-advance scenes on the beat ("auto VJ").
    const n = this.settings?.autoAdvance || 0;
    if (n > 0 && v.beat) {
      this._beatCount++;
      if (this._beatCount % n === 0) {
        const p = this.app.doc.project;
        const i = p.scenes.findIndex((s) => s.id === p.activeScene);
        const next = p.scenes[(i + 1) % p.scenes.length];
        if (next && next.id !== p.activeScene) this.app.engine.activateScene(next.id);
      }
    }
    if (this.panel) this.paintPanel();
  }

  toggle() { if (this.panel) this.close(); else this.open(); }

  close() {
    this.panel?.remove();
    this.panel = null;
    document.removeEventListener('pointerdown', this._outside, true);
  }

  open() {
    this.close();
    this.engine.need();
    this.panel = h('div.snd-panel', { role: 'dialog', 'aria-label': 'Sound' });
    document.body.appendChild(this.panel);
    const r = this.btn.getBoundingClientRect();
    this.panel.style.top = `${r.bottom + 6}px`;
    this.panel.style.left = `${Math.max(8, Math.min(innerWidth - 400, r.left - 150))}px`;
    this._outside = (e) => { if (this.panel && !this.panel.contains(e.target) && !this.btn.contains(e.target) && !e.target.closest('.menu')) this.close(); };
    document.addEventListener('pointerdown', this._outside, true);
    this.renderPanel();
  }

  async renderPanel() {
    const P = this.panel;
    if (!P) return;
    const s = this.settings;
    const eng = this.engine;
    const status = eng.state === 'listening'
      ? `Listening to ${s.source === 'system' ? 'everything this computer plays' : 'the microphone'}${this._playerHint()}.`
      : eng.state === 'starting' ? 'Starting…'
        : eng.state === 'off' ? `Not listening to a microphone or the computer${this._playerHint() ? ' — only Sound Players are heard' : ''}.`
          : eng.state === 'error' ? eng.error : 'Not listening yet.';
    const srcBtn = (id, label, ic) => h('button', { class: s.source === id ? 'on' : '', onclick: () => this.update('source', id, 'Sound source') }, icon(ic, 14), label);
    const devs = s.source === 'mic' ? await eng.devices() : [];
    if (this.panel !== P) return;
    const devSel = h('select.field', null, h('option', { value: '' }, 'Default microphone'), ...devs.map((d) => h('option', { value: d.id, selected: d.id === s.deviceId }, d.label)));
    devSel.addEventListener('change', () => this.update('deviceId', devSel.value, 'Microphone'));
    const slider = (key, label, min, max) => {
      const r = h('input.range', { type: 'range', min, max, value: s[key] });
      const out = h('span.snd-num', null, String(s[key]));
      r.addEventListener('input', () => { out.textContent = r.value; this.app.doc.project.settings.sound[key] = +r.value; this.syncSettings(); });
      r.addEventListener('change', () => this.update(key, +r.value));
      return h('label.snd-row', null, h('span', null, label), r, out);
    };
    const auto = h('input', { type: 'checkbox', checked: s.autoLevel !== false });
    auto.addEventListener('change', () => this.update('autoLevel', auto.checked));
    const adv = h('select.field', null, ...AUTO_ADVANCE.map((k) => h('option', { value: k, selected: k === (s.autoAdvance || 0) }, k ? `every ${k} beats` : 'never')));
    adv.addEventListener('change', () => { this._beatCount = 0; this.update('autoAdvance', +adv.value, 'Auto-advance scenes'); });
    this.meters = {};
    const meter = (key, label) => { const fill = h('span'); const num = h('b'); this.meters[key] = { fill, num }; return h('div.snd-meter-row', null, h('span', null, label), h('div.snd-bar', null, fill), num); };
    this.spec = h('canvas.snd-spec', { width: 360, height: 70 });
    this.beatLight = h('span.snd-beat');
    this.bpmText = h('span');

    P.replaceChildren(...[
      h('div.snd-head', null, h('h3', null, 'Sound'), h('span.snd-status', { class: eng.state }, status)),
      h('div.seg.snd-src', null, srcBtn('mic', 'Microphone', 'sound'), srcBtn('system', 'Computer', 'monitor'), srcBtn('off', 'Off', 'power')),
      s.source === 'mic' ? devSel : null,
      s.source === 'system' ? h('p.hint', null, 'Reacts to music playing anywhere on this computer — Spotify, YouTube, a DJ app. Works on Windows.') : null,
      eng.state === 'error' ? h('button.btn.small', { onclick: () => eng.restart() }, icon('reset', 12), 'Try again') : null,
      this.spec,
      meter('level', 'Loudness'), meter('bass', 'Bass'), meter('mid', 'Mids'), meter('treble', 'Treble'),
      h('div.snd-beat-row', null, this.beatLight, h('span', null, 'Beat'), this.bpmText),
      h('div.snd-sep'),
      slider('sensitivity', 'Sensitivity', 0, 100),
      slider('gain', 'Boost %', 10, 400),
      slider('smoothing', 'Smoothness', 0, 95),
      h('label.check-row', null, auto, h('span', null, 'Auto-level (adapts to quiet and loud rooms)')),
      h('label.snd-row', null, h('span', null, 'Change scene'), adv),
      h('div.snd-sep'),
      h('p.hint', null, 'To make anything react: right-click a number on a module and choose a sound band.'),
      h('div.btn-row.wrap', null,
        h('button.btn.small.primary', { onclick: () => { this.close(); this.app.addRecipe('visualizer'); } }, icon('plus', 12), 'Add a visualizer'),
        h('button.btn.small', { onclick: () => { this.close(); this.app.addRecipe('organ'); } }, 'Colour organ'),
        h('button.btn.small', { onclick: () => { this.close(); this.app.addRecipe('dance'); } }, 'Make a video dance')),
    ].filter(Boolean));
  }

  _playerHint() {
    const sc = this.app.doc.scene;
    return sc?.nodes.some((n) => n.type === 'audio.player' && n.values?.react !== 0) ? ' and Sound Players' : '';
  }

  paintPanel() {
    if (!this.meters) return;
    const v = this.engine.values;
    for (const k of ['level', 'bass', 'mid', 'treble']) {
      const m = this.meters[k];
      if (!m) continue;
      m.fill.style.width = `${v[k]}%`;
      setText(m.num, String(Math.round(v[k])));
    }
    if (v.beat) { this.beatLight.classList.remove('on'); void this.beatLight.offsetWidth; this.beatLight.classList.add('on'); }
    setText(this.bpmText, v.bpm ? `${Math.round(v.bpm)} BPM` : 'listening for a beat…');
    const c = this.spec, g = c.getContext('2d');
    const a = this.engine.analysis;
    g.clearRect(0, 0, c.width, c.height);
    const N = 64, w = c.width / N;
    for (let i = 0; i < N; i++) {
      const x = a.spectrum[Math.floor((i / N) * a.spectrum.length)];
      const hh = Math.max(1, x * (c.height - 2));
      g.fillStyle = `hsl(${(i / N) * 290}, 80%, 62%)`;
      g.fillRect(i * w + 1, c.height - hh, w - 2, hh);
    }
  }
}

export function soundSourceLabel(id) { return SOURCE_LABEL[id] || id; }
export { showMenu };
