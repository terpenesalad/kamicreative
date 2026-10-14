// KamiCreative — Control surfaces, Scene and Utility modules.

import { defineNode, hexToRgb } from '../core/registry.js';

const C = 'Control', S = 'Scene', U = 'Utility';

// Widget protocol: the editor calls def.onWidget(node, engine, event, value).
// Widgets with `persist: true` also store their value in model.props.value.

defineNode({
  type: 'ctl.slider', name: 'Slider', category: C,
  description: 'A fader you can drag in the patch or on the Live panel. Also appears in Show mode.',
  keywords: ['fader', 'knob', 'control', 'ui'],
  widget: { kind: 'slider', persist: true },
  props: { value: 50, label: '' },
  inputs: [
    { id: 'min', name: 'Min', type: 'number', default: 0 },
    { id: 'max', name: 'Max', type: 'number', default: 100 },
    { id: 'set', name: 'Set Value', type: 'number', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Value', type: 'number' }],
  create(n) { n.state.value = n.model.props?.value ?? 50; },
  update(n, ctx, port) {
    if (port === 'set') n.state.value = n.inputs.set;
    n.state.value = Math.min(Math.max(n.inputs.min, n.inputs.max), Math.max(Math.min(n.inputs.min, n.inputs.max), n.state.value));
    ctx.out(n, 'out', n.state.value);
  },
  onWidget(n, ctx, evt, v) { if (evt === 'set') { n.state.value = v; ctx.out(n, 'out', v); } },
});

defineNode({
  type: 'ctl.button', name: 'Button', category: C,
  description: 'A push button. Momentary buttons fire on press and release; toggle buttons latch.',
  keywords: ['push', 'bang', 'cue', 'go', 'ui'],
  widget: { kind: 'button' },
  props: { label: 'GO' },
  inputs: [{ id: 'mode', name: 'Mode', type: 'enum', options: ['momentary', 'toggle'], default: 'momentary' }],
  outputs: [{ id: 'press', name: 'Pressed', type: 'trigger' }, { id: 'release', name: 'Released', type: 'trigger' }, { id: 'state', name: 'State', type: 'bool' }],
  onWidget(n, ctx, evt) {
    if (evt === 'down') {
      if (n.inputs.mode === 'toggle') ctx.out(n, 'state', n.outputs.state ? 0 : 1);
      else ctx.out(n, 'state', 1);
      ctx.fire(n, 'press');
    } else if (evt === 'up') {
      if (n.inputs.mode !== 'toggle') ctx.out(n, 'state', 0);
      ctx.fire(n, 'release');
    }
  },
});

defineNode({
  type: 'ctl.toggle', name: 'Switch', category: C,
  description: 'An on/off switch control.',
  keywords: ['toggle', 'checkbox', 'enable', 'ui'],
  widget: { kind: 'toggle', persist: true },
  props: { value: 0, label: '' },
  inputs: [],
  outputs: [{ id: 'out', name: 'State', type: 'bool' }],
  create(n) { n.state.value = n.model.props?.value ? 1 : 0; },
  update(n, ctx) { ctx.out(n, 'out', n.state.value); },
  onWidget(n, ctx, evt, v) { if (evt === 'set') { n.state.value = v ? 1 : 0; ctx.out(n, 'out', n.state.value); } },
});

defineNode({
  type: 'ctl.xy', name: 'XY Pad', category: C,
  description: 'Two-dimensional controller. Drag the puck to output X and Y (0-100).',
  keywords: ['pad', 'joystick', 'position', 'ui'],
  widget: { kind: 'xy', persist: true },
  props: { value: [50, 50] },
  inputs: [],
  outputs: [{ id: 'x', name: 'X', type: 'number' }, { id: 'y', name: 'Y', type: 'number' }],
  create(n) { n.state.value = n.model.props?.value || [50, 50]; },
  update(n, ctx) { ctx.out(n, 'x', n.state.value[0]); ctx.out(n, 'y', n.state.value[1]); },
  onWidget(n, ctx, evt, v) { if (evt === 'set') { n.state.value = v; this.update(n, ctx); } },
});

defineNode({
  type: 'ctl.color', name: 'Colour Picker', category: C,
  description: 'Pick a colour; outputs the colour and its red / green / blue components (0-255).',
  keywords: ['colour', 'color', 'rgb', 'swatch', 'ui'],
  widget: { kind: 'color', persist: true },
  props: { value: '#ff4f8b' },
  inputs: [],
  outputs: [{ id: 'color', name: 'Colour', type: 'color' }, { id: 'r', name: 'Red', type: 'number' }, { id: 'g', name: 'Green', type: 'number' }, { id: 'b', name: 'Blue', type: 'number' }],
  create(n) { n.state.value = n.model.props?.value || '#ff4f8b'; },
  update(n, ctx) {
    const [r, g, b] = hexToRgb(n.state.value);
    ctx.out(n, 'color', n.state.value);
    ctx.out(n, 'r', Math.round(r * 255)); ctx.out(n, 'g', Math.round(g * 255)); ctx.out(n, 'b', Math.round(b * 255));
  },
  onWidget(n, ctx, evt, v) { if (evt === 'set') { n.state.value = v; this.update(n, ctx); } },
});

defineNode({
  type: 'ctl.rgb', name: 'Make Colour', category: C,
  description: 'Builds a colour from red, green, blue (0-255) and alpha (0-100).',
  keywords: ['rgb', 'colour', 'color', 'compose'],
  inputs: [
    { id: 'r', name: 'Red', type: 'number', default: 255, min: 0, max: 255 },
    { id: 'g', name: 'Green', type: 'number', default: 255, min: 0, max: 255 },
    { id: 'b', name: 'Blue', type: 'number', default: 255, min: 0, max: 255 },
    { id: 'a', name: 'Alpha %', type: 'number', default: 100, min: 0, max: 100 },
  ],
  outputs: [{ id: 'color', name: 'Colour', type: 'color' }],
  update(n, ctx) {
    const h = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
    const { r, g, b, a } = n.inputs;
    ctx.out(n, 'color', `#${h(r)}${h(g)}${h(b)}${a < 100 ? h((a / 100) * 255) : ''}`);
  },
});

defineNode({
  type: 'ctl.monitor', name: 'Monitor', category: C,
  description: 'Displays any incoming value in large type. Handy for debugging or on a Live panel.',
  keywords: ['display', 'watch', 'debug', 'print', 'readout'],
  widget: { kind: 'monitor' },
  props: { label: '' },
  inputs: [{ id: 'in', name: 'Value', type: 'any', default: 0 }],
  outputs: [],
});

defineNode({
  type: 'ctl.scope', name: 'Scope', category: C,
  description: 'Plots a value over time, like an oscilloscope. Useful for tuning sensors and envelopes.',
  keywords: ['graph', 'plot', 'oscilloscope', 'history', 'debug'],
  widget: { kind: 'scope' },
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'min', name: 'Min', type: 'number', default: 0 },
    { id: 'max', name: 'Max', type: 'number', default: 100 },
  ],
  outputs: [],
  create(n) { n.state.hist = new Float32Array(180); n.state.head = 0; },
  tick(n) {
    n.state.hist[n.state.head] = n.inputs.in;
    n.state.head = (n.state.head + 1) % n.state.hist.length;
  },
});

// ------------------------------------------------------------------- Scene

defineNode({
  type: 'scene.enter', name: 'Scene Start', category: S,
  description: 'Fires a trigger when this scene becomes active. Use it to start movies, reset counters, set values.',
  keywords: ['enter', 'start', 'begin', 'init', 'loadbang'],
  inputs: [{ id: 'delay', name: 'Delay (s)', type: 'number', default: 0, min: 0 }],
  outputs: [{ id: 'trig', name: 'Started', type: 'trigger' }],
  started(n) { n.state.at = n.inputs.delay; n.state.pending = true; },
  tick(n, ctx) {
    if (!n.state.pending) return;
    n.state.at -= ctx.dt;
    if (n.state.at <= 0) { n.state.pending = false; ctx.fire(n, 'trig'); }
  },
});

defineNode({
  type: 'scene.jump', name: 'Jump to Scene', category: S,
  description: 'Changes scene when triggered: next, previous, first, last or a scene number, with an optional cross-fade.',
  keywords: ['goto', 'cue', 'next', 'go', 'transition'],
  inputs: [
    { id: 'trig', name: 'Go', type: 'trigger' },
    { id: 'mode', name: 'Destination', type: 'enum', options: ['next', 'previous', 'scene #', 'first', 'last'], default: 'next' },
    { id: 'num', name: 'Scene #', type: 'number', default: 1, min: 1, int: true },
    { id: 'fade', name: 'Fade (s, -1 = scene)', type: 'number', default: -1, min: -1, step: 0.1 },
  ],
  outputs: [],
  update(n, ctx, port) {
    if (port !== 'trig') return;
    const { mode, num, fade } = n.inputs;
    const f = fade < 0 ? undefined : fade;
    ctx.defer(() => {
      const scenes = ctx.project.scenes;
      const cur = ctx.sceneIndex(ctx.project.activeScene);
      let j = cur;
      if (mode === 'next') j = Math.min(scenes.length - 1, cur + 1);
      else if (mode === 'previous') j = Math.max(0, cur - 1);
      else if (mode === 'first') j = 0;
      else if (mode === 'last') j = scenes.length - 1;
      else j = Math.max(0, Math.min(scenes.length - 1, num - 1));
      ctx.activateScene(scenes[j].id, { fade: f });
    });
  },
});

defineNode({
  type: 'scene.info', name: 'Scene Info', category: S,
  description: 'Name and number of the scene this module lives in, and seconds since it started.',
  keywords: ['name', 'index', 'time'],
  inputs: [],
  outputs: [{ id: 'name', name: 'Name', type: 'text' }, { id: 'num', name: 'Scene #', type: 'number' }, { id: 'count', name: 'Scene Count', type: 'number' }, { id: 'time', name: 'Time In Scene', type: 'number' }],
  create(n) { n.state.t = 0; },
  update(n, ctx) {
    ctx.out(n, 'name', n.scene.scene.name);
    ctx.out(n, 'num', ctx.sceneIndex(n.scene.id) + 1);
    ctx.out(n, 'count', ctx.project.scenes.length);
  },
  tick(n, ctx) { n.state.t += ctx.dt; ctx.out(n, 'time', Math.round(n.state.t * 10) / 10); },
});

defineNode({
  type: 'scene.send', name: 'Broadcaster', category: S,
  description: 'Sends a value on a numbered channel to every Listener in all active scenes — wireless patch cords.',
  keywords: ['send', 'wireless', 'global', 'channel', 'transmit'],
  inputs: [
    { id: 'chan', name: 'Channel', type: 'number', default: 1, min: 1, max: 999, int: true },
    { id: 'in', name: 'Value', type: 'any', default: 0 },
    { id: 'trig', name: 'Trigger', type: 'trigger' },
  ],
  outputs: [],
  update(n, ctx, port) {
    if (port === 'in') ctx.broadcast(n.inputs.chan, { value: n.inputs.in }, n);
    if (port === 'trig') ctx.broadcast(n.inputs.chan, { trigger: true }, n);
  },
});

defineNode({
  type: 'scene.receive', name: 'Listener', category: S,
  description: 'Receives values and triggers from Broadcasters on the same channel.',
  keywords: ['receive', 'wireless', 'global', 'channel'],
  inputs: [{ id: 'chan', name: 'Channel', type: 'number', default: 1, min: 1, max: 999, int: true }],
  outputs: [{ id: 'out', name: 'Value', type: 'any' }, { id: 'trig', name: 'Received', type: 'trigger' }],
  onBroadcast(n, ctx, chan, msg) {
    if (chan !== n.inputs.chan) return;
    if ('value' in msg) ctx.out(n, 'out', msg.value, true);
    ctx.fire(n, 'trig');
  },
});

// ----------------------------------------------------------------- Utility

defineNode({
  type: 'util.comment', name: 'Comment', category: U,
  description: 'A sticky note for documenting your patch.',
  keywords: ['note', 'text', 'label', 'documentation'],
  widget: { kind: 'comment' },
  props: { text: 'Double-click to edit this note.', color: '#f3d36b' },
  inputs: [],
  outputs: [],
});

defineNode({
  type: 'util.value', name: 'Value', category: U,
  description: 'Holds a value you type in and sends it on. Useful as a shared constant feeding many modules.',
  keywords: ['constant', 'number', 'variable', 'store'],
  inputs: [{ id: 'in', name: 'Value', type: 'any', default: 0 }, { id: 'resend', name: 'Re-send', type: 'trigger' }],
  outputs: [{ id: 'out', name: 'Value', type: 'any' }],
  update(n, ctx, port) { ctx.out(n, 'out', n.inputs.in, port === 'resend'); },
});

defineNode({
  type: 'util.trigmerge', name: 'Trigger Merge', category: U,
  description: 'Combines several trigger sources into one output.',
  keywords: ['or', 'combine', 'join', 'any'],
  inputs: [
    { id: 't1', name: 'Trigger 1', type: 'trigger' }, { id: 't2', name: 'Trigger 2', type: 'trigger' },
    { id: 't3', name: 'Trigger 3', type: 'trigger' }, { id: 't4', name: 'Trigger 4', type: 'trigger' },
  ],
  outputs: [{ id: 'out', name: 'Trigger', type: 'trigger' }, { id: 'which', name: 'Last Input #', type: 'number' }],
  update(n, ctx, port) {
    if (!port) return;
    ctx.out(n, 'which', +port.slice(1), true);
    ctx.fire(n, 'out');
  },
});

defineNode({
  type: 'util.trigcount', name: 'Trigger Rate', category: U,
  description: 'Measures how often triggers arrive (per second and per minute).',
  keywords: ['frequency', 'tempo', 'rate', 'bpm detect'],
  inputs: [{ id: 'trig', name: 'Trigger', type: 'trigger' }],
  outputs: [{ id: 'hz', name: 'Per Second', type: 'number' }, { id: 'bpm', name: 'Per Minute', type: 'number' }, { id: 'total', name: 'Total', type: 'number' }],
  create(n) { n.state = { times: [], total: 0 }; },
  update(n, ctx, port) {
    if (port !== 'trig') return;
    const t = n.state.times;
    t.push(ctx.time);
    while (t.length > 8) t.shift();
    n.state.total++;
    ctx.out(n, 'total', n.state.total);
    if (t.length >= 2) {
      const hz = (t.length - 1) / (t[t.length - 1] - t[0]);
      ctx.out(n, 'hz', Math.round(hz * 100) / 100);
      ctx.out(n, 'bpm', Math.round(hz * 600) / 10);
    }
  },
});
