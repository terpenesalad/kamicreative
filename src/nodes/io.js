// KamiCreative — Input/Output (keyboard, mouse, gamepad, MIDI, OSC, Art-Net) and Audio modules.

import { defineNode } from '../core/registry.js';

const IO = 'Input / Output';

// ------------------------------------------------------------- keyboard etc

function normKey(k) {
  if (!k) return '';
  k = String(k).toLowerCase().trim();
  return { ' ': 'space', spacebar: 'space', esc: 'escape', return: 'enter', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' }[k] || k;
}

defineNode({
  type: 'io.key', name: 'Keyboard Watcher', category: IO,
  description: 'Watches the computer keyboard. Set Key to a letter, "space", "enter", "up"… or "any".',
  keywords: ['key', 'keyboard', 'press', 'hotkey', 'shortcut'],
  inputs: [{ id: 'key', name: 'Key', type: 'text', default: 'space' }],
  outputs: [
    { id: 'press', name: 'Pressed', type: 'trigger' }, { id: 'release', name: 'Released', type: 'trigger' },
    { id: 'down', name: 'Held', type: 'bool' }, { id: 'name', name: 'Key Name', type: 'text' },
  ],
  onKey(n, ctx, e) {
    const want = normKey(n.inputs.key);
    const k = normKey(e.key);
    if (want !== 'any' && want !== k) return;
    if (e.down && e.repeat) return;
    ctx.out(n, 'name', k);
    ctx.out(n, 'down', e.down ? 1 : 0);
    ctx.fire(n, e.down ? 'press' : 'release');
  },
});

defineNode({
  type: 'io.mouse', name: 'Mouse Watcher', category: IO,
  description: 'Reports the mouse position over a stage output window (0-100, top-left origin) and its buttons.',
  keywords: ['mouse', 'cursor', 'pointer', 'click', 'touch'],
  inputs: [{ id: 'stage', name: 'Stage # (0=any)', type: 'number', default: 0, min: 0, int: true }],
  outputs: [
    { id: 'x', name: 'X', type: 'number' }, { id: 'y', name: 'Y', type: 'number' },
    { id: 'down', name: 'Button', type: 'bool' }, { id: 'click', name: 'Click', type: 'trigger' },
  ],
  onMouse(n, ctx, e) {
    if (n.inputs.stage && e.stage !== n.inputs.stage) return;
    ctx.out(n, 'x', Math.round(e.x * 1000) / 10);
    ctx.out(n, 'y', Math.round(e.y * 1000) / 10);
    ctx.out(n, 'down', e.buttons ? 1 : 0);
    if (e.type === 'down') ctx.fire(n, 'click');
  },
});

defineNode({
  type: 'io.gamepad', name: 'Gamepad', category: IO,
  description: 'Reads a game controller: two sticks (-100..100) and the four face buttons.',
  keywords: ['joystick', 'controller', 'xbox', 'playstation', 'hid'],
  inputs: [{ id: 'index', name: 'Pad #', type: 'number', default: 1, min: 1, max: 4, int: true }],
  outputs: [
    { id: 'lx', name: 'Left X', type: 'number' }, { id: 'ly', name: 'Left Y', type: 'number' },
    { id: 'rx', name: 'Right X', type: 'number' }, { id: 'ry', name: 'Right Y', type: 'number' },
    { id: 'b0', name: 'Button A', type: 'bool' }, { id: 'b1', name: 'Button B', type: 'bool' },
    { id: 'b2', name: 'Button X', type: 'bool' }, { id: 'b3', name: 'Button Y', type: 'bool' },
    { id: 'any', name: 'Any Pressed', type: 'trigger' }, { id: 'connected', name: 'Connected', type: 'bool' },
  ],
  tick(n, ctx) {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads[n.inputs.index - 1];
    ctx.out(n, 'connected', p ? 1 : 0);
    if (!p) return;
    const ax = (i) => Math.round((p.axes[i] || 0) * 100);
    ctx.out(n, 'lx', ax(0)); ctx.out(n, 'ly', ax(1)); ctx.out(n, 'rx', ax(2)); ctx.out(n, 'ry', ax(3));
    let pressedNow = false;
    for (let i = 0; i < 4; i++) {
      const v = p.buttons[i]?.pressed ? 1 : 0;
      if (v && !n.outputs[`b${i}`]) pressedNow = true;
      ctx.out(n, `b${i}`, v);
    }
    if (pressedNow) ctx.fire(n, 'any');
  },
});

// --------------------------------------------------------------------- MIDI

function chanMatch(want, got) { return !want || want === got; }

defineNode({
  type: 'io.midinote', name: 'MIDI Note In', category: IO,
  description: 'Listens for MIDI notes from any connected device. Channel 0 / Note -1 mean "any".',
  keywords: ['midi', 'note', 'keyboard', 'pad', 'controller'],
  inputs: [
    { id: 'chan', name: 'Channel (0=any)', type: 'number', default: 0, min: 0, max: 16, int: true },
    { id: 'note', name: 'Note (-1=any)', type: 'number', default: -1, min: -1, max: 127, int: true },
  ],
  outputs: [
    { id: 'noteOut', name: 'Note', type: 'number' }, { id: 'vel', name: 'Velocity', type: 'number' },
    { id: 'on', name: 'Note On', type: 'trigger' }, { id: 'off', name: 'Note Off', type: 'trigger' }, { id: 'gate', name: 'Gate', type: 'bool' },
  ],
  onMidi(n, ctx, m) {
    if (m.type !== 'noteon' && m.type !== 'noteoff') return;
    if (!chanMatch(n.inputs.chan, m.channel)) return;
    if (n.inputs.note >= 0 && n.inputs.note !== m.data1) return;
    ctx.out(n, 'noteOut', m.data1, true);
    ctx.out(n, 'vel', m.type === 'noteon' ? m.data2 : 0, true);
    ctx.out(n, 'gate', m.type === 'noteon' ? 1 : 0);
    ctx.fire(n, m.type === 'noteon' ? 'on' : 'off');
  },
});

defineNode({
  type: 'io.midicc', name: 'MIDI Control In', category: IO,
  description: 'Listens for a MIDI control change (knob / fader). Outputs raw 0-127 and 0-100%.',
  keywords: ['midi', 'cc', 'knob', 'fader', 'controller'],
  inputs: [
    { id: 'chan', name: 'Channel (0=any)', type: 'number', default: 0, min: 0, max: 16, int: true },
    { id: 'cc', name: 'Controller (-1=any)', type: 'number', default: 1, min: -1, max: 127, int: true },
  ],
  outputs: [{ id: 'raw', name: 'Value 0-127', type: 'number' }, { id: 'pct', name: 'Value %', type: 'number' }, { id: 'num', name: 'Controller #', type: 'number' }],
  onMidi(n, ctx, m) {
    if (m.type !== 'cc' || !chanMatch(n.inputs.chan, m.channel)) return;
    if (n.inputs.cc >= 0 && n.inputs.cc !== m.data1) return;
    ctx.out(n, 'num', m.data1);
    ctx.out(n, 'raw', m.data2);
    ctx.out(n, 'pct', Math.round((m.data2 / 127) * 1000) / 10);
  },
});

defineNode({
  type: 'io.midiout', name: 'MIDI Out', category: IO,
  description: 'Sends MIDI notes or control changes to an output device (1 = first device).',
  keywords: ['midi', 'send', 'note', 'cc', 'output', 'lighting', 'synth'],
  inputs: [
    { id: 'device', name: 'Device #', type: 'number', default: 1, min: 1, int: true },
    { id: 'kind', name: 'Message', type: 'enum', options: ['note', 'control', 'program'], default: 'note' },
    { id: 'chan', name: 'Channel', type: 'number', default: 1, min: 1, max: 16, int: true },
    { id: 'num', name: 'Note / CC #', type: 'number', default: 60, min: 0, max: 127, int: true },
    { id: 'value', name: 'Velocity / Value', type: 'number', default: 100, min: 0, max: 127, int: true },
    { id: 'dur', name: 'Note Length (s)', type: 'number', default: 0.25, min: 0 },
    { id: 'send', name: 'Send', type: 'trigger' },
    { id: 'auto', name: 'Send On Change', type: 'bool', default: 0 },
  ],
  outputs: [],
  create(n) { n.state.offs = []; },
  update(n, ctx, port, start) {
    if (start) return;
    if (port !== 'send' && !(n.inputs.auto && (port === 'value' || port === 'num'))) return;
    const midi = ctx.host.midi;
    if (!midi) { n.error = 'MIDI is unavailable on this system.'; return; }
    const { device, kind, chan, num, value, dur } = n.inputs;
    const ch = (chan - 1) & 15;
    if (kind === 'note') {
      midi.send(device - 1, [0x90 | ch, num, value]);
      n.state.offs.push({ at: ctx.time + dur, bytes: [0x80 | ch, num, 0], device: device - 1 });
    } else if (kind === 'control') midi.send(device - 1, [0xb0 | ch, num, value]);
    else midi.send(device - 1, [0xc0 | ch, num]);
  },
  tick(n, ctx) {
    const offs = n.state.offs;
    for (let i = offs.length - 1; i >= 0; i--) {
      if (offs[i].at <= ctx.time) { ctx.host.midi?.send(offs[i].device, offs[i].bytes); offs.splice(i, 1); }
    }
  },
  destroy(n, ctx) { for (const o of n.state.offs || []) ctx.host.midi?.send(o.device, o.bytes); },
});

// ---------------------------------------------------------------------- OSC

export function oscMatch(pattern, address) {
  if (!pattern || pattern === '*') return true;
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$');
  return re.test(address);
}

defineNode({
  type: 'io.oscin', name: 'OSC Receive', category: IO,
  description: 'Receives Open Sound Control messages (port set in Preferences). Address supports * and ? wildcards.',
  keywords: ['osc', 'network', 'udp', 'touchosc', 'receive', 'remote'],
  inputs: [{ id: 'addr', name: 'Address', type: 'text', default: '/kami/1' }],
  outputs: [
    { id: 'a1', name: 'Arg 1', type: 'any' }, { id: 'a2', name: 'Arg 2', type: 'any' },
    { id: 'a3', name: 'Arg 3', type: 'any' }, { id: 'a4', name: 'Arg 4', type: 'any' },
    { id: 'recv', name: 'Received', type: 'trigger' }, { id: 'address', name: 'Address', type: 'text' },
  ],
  onOsc(n, ctx, m) {
    if (!oscMatch(n.inputs.addr, m.address)) return;
    ctx.out(n, 'address', m.address);
    for (let i = 0; i < 4; i++) if (m.args[i] !== undefined) ctx.out(n, `a${i + 1}`, m.args[i], true);
    ctx.fire(n, 'recv');
  },
});

defineNode({
  type: 'io.oscout', name: 'OSC Send', category: IO,
  description: 'Sends an OSC message over UDP to another app or device.',
  keywords: ['osc', 'network', 'udp', 'send', 'remote', 'qlab', 'resolume'],
  inputs: [
    { id: 'host', name: 'Host', type: 'text', default: '127.0.0.1' },
    { id: 'port', name: 'Port', type: 'number', default: 9000, min: 1, max: 65535, int: true },
    { id: 'addr', name: 'Address', type: 'text', default: '/kami/out' },
    { id: 'a1', name: 'Arg 1', type: 'any', default: 0 },
    { id: 'a2', name: 'Arg 2', type: 'any', default: '' },
    { id: 'send', name: 'Send', type: 'trigger' },
    { id: 'auto', name: 'Send On Change', type: 'bool', default: 1 },
  ],
  outputs: [],
  update(n, ctx, port, start) {
    if (start) return;
    if (port !== 'send' && !(n.inputs.auto && (port === 'a1' || port === 'a2'))) return;
    const { host, port: p, addr, a1, a2 } = n.inputs;
    const args = [a1];
    if (a2 !== '' && a2 !== null && a2 !== undefined) args.push(a2);
    if (!ctx.host.osc) { n.error = 'OSC networking is unavailable.'; return; }
    ctx.host.osc.send(host, p, addr, args);
  },
});

defineNode({
  type: 'io.artnet', name: 'DMX Out (Art-Net)', category: IO,
  description: 'Drives lighting over Art-Net: writes channel values (0-255) into a DMX universe.',
  keywords: ['dmx', 'artnet', 'lighting', 'lights', 'fixture'],
  props: { count: 4 },
  ports(model) {
    const c = Math.max(1, Math.min(32, model.props?.count || 4));
    return {
      inputs: [
        { id: 'universe', name: 'Universe', type: 'number', default: 0, min: 0, max: 32767, int: true },
        { id: 'start', name: 'Start Channel', type: 'number', default: 1, min: 1, max: 512, int: true },
        { id: 'host', name: 'Node IP (blank=prefs)', type: 'text', default: '' },
        ...Array.from({ length: c }, (_, i) => ({ id: `c${i + 1}`, name: `Ch +${i}`, type: 'number', default: 0, min: 0, max: 255, int: true })),
      ],
      outputs: [],
    };
  },
  update(n, ctx) {
    const art = ctx.host.artnet;
    if (!art) return;
    const { universe, start, host } = n.inputs;
    const count = Math.max(1, Math.min(32, n.model.props?.count || 4));
    for (let i = 0; i < count; i++) {
      const ch = start + i;
      if (ch > 512) break;
      art.set(host || null, universe, ch, n.inputs[`c${i + 1}`]);
    }
  },
});

