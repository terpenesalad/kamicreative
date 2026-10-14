// KamiCreative — Input/Output (keyboard, mouse, gamepad, MIDI, OSC, Art-Net) and Audio modules.

import { defineNode } from '../core/registry.js';

const IO = 'Input / Output', A = 'Audio';

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

// -------------------------------------------------------------------- Audio

defineNode({
  type: 'audio.player', name: 'Sound Player', category: A,
  description: 'Plays an audio file from the Media Bin with volume, pan, speed and looping. Outputs its level.',
  keywords: ['sound', 'audio', 'music', 'wav', 'mp3', 'play'],
  inputs: [
    { id: 'media', name: 'Sound', type: 'media', kind: 'audio', default: '' },
    { id: 'play', name: 'Play', type: 'bool', default: 1 },
    { id: 'loop', name: 'Loop', type: 'bool', default: 0 },
    { id: 'vol', name: 'Volume %', type: 'number', default: 100, min: 0, max: 200 },
    { id: 'pan', name: 'Pan', type: 'number', default: 0, min: -100, max: 100 },
    { id: 'speed', name: 'Speed', type: 'number', default: 1, min: 0.1, max: 4, step: 0.01 },
    { id: 'pos', name: 'Position %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'seek', name: 'Seek', type: 'trigger' },
    { id: 'restart', name: 'Restart', type: 'trigger' },
  ],
  outputs: [{ id: 'position', name: 'Position %', type: 'number' }, { id: 'level', name: 'Level', type: 'number' }, { id: 'end', name: 'Ended', type: 'trigger' }, { id: 'dur', name: 'Duration (s)', type: 'number' }],
  create(n) { n.state = { el: null, mediaId: null }; },
  _ensure(n, ctx) {
    const m = ctx.host.media?.resolve(n.inputs.media, 'audio');
    const id = m ? m.id : null;
    if (id === n.state.mediaId) return n.state.el;
    this.destroy(n, ctx);
    n.state.mediaId = id;
    if (!m) return null;
    const el = new Audio();
    el.src = m.url;
    el.preload = 'auto';
    el.onended = () => { if (!el.loop) ctx.fire(n, 'end'); };
    el.onerror = () => { n.error = `Cannot play "${m.name}".`; ctx.dirty.add(n.id); };
    n.state.el = el;
    const ac = ctx.host.audio?.context();
    if (ac) {
      try {
        const src = ac.createMediaElementSource(el);
        const gain = ac.createGain();
        const pan = ac.createStereoPanner();
        const an = ac.createAnalyser();
        an.fftSize = 256;
        src.connect(gain).connect(pan).connect(an).connect(ac.destination);
        Object.assign(n.state, { gain, pan, an, buf: new Uint8Array(an.fftSize) });
      } catch (e) { console.warn(e); }
    }
    return el;
  },
  update(n, ctx, port) {
    const el = this._ensure(n, ctx);
    if (!el) return;
    n.error = null;
    const i = n.inputs;
    el.loop = !!i.loop;
    el.playbackRate = i.speed;
    if (n.state.gain) { n.state.gain.gain.value = i.vol / 100; n.state.pan.pan.value = i.pan / 100; } else el.volume = Math.min(1, i.vol / 100);
    if (port === 'seek' && el.duration) el.currentTime = (i.pos / 100) * el.duration;
    if (port === 'restart') el.currentTime = 0;
    if (i.play && el.paused) { ctx.host.audio?.resume(); el.play().catch(() => {}); }
    if (!i.play && !el.paused) el.pause();
  },
  tick(n, ctx) {
    const el = n.state.el;
    if (!el) return;
    if (el.duration) { ctx.out(n, 'position', Math.round((el.currentTime / el.duration) * 1000) / 10); ctx.out(n, 'dur', Math.round(el.duration * 100) / 100); }
    if (n.state.an) {
      n.state.an.getByteTimeDomainData(n.state.buf);
      let peak = 0;
      for (const v of n.state.buf) peak = Math.max(peak, Math.abs(v - 128));
      ctx.out(n, 'level', Math.round((peak / 128) * 100));
    }
  },
  destroy(n) {
    const el = n.state.el;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    n.state.el = null;
    n.state.mediaId = null;
  },
});

defineNode({
  type: 'audio.analyzer', name: 'Sound Analyser', category: A,
  description: 'Listens to the microphone / line input. Outputs overall level, low / mid / high bands and a beat trigger.',
  keywords: ['microphone', 'audio', 'fft', 'spectrum', 'beat', 'reactive', 'frequency'],
  inputs: [
    { id: 'on', name: 'Listen', type: 'bool', default: 1 },
    { id: 'gain', name: 'Gain', type: 'number', default: 1, min: 0, max: 20, step: 0.1 },
    { id: 'smooth', name: 'Smoothing', type: 'number', default: 60, min: 0, max: 99 },
    { id: 'sens', name: 'Beat Sensitivity', type: 'number', default: 50, min: 0, max: 100 },
  ],
  outputs: [
    { id: 'level', name: 'Level', type: 'number' }, { id: 'low', name: 'Low', type: 'number' },
    { id: 'mid', name: 'Mid', type: 'number' }, { id: 'high', name: 'High', type: 'number' },
    { id: 'beat', name: 'Beat', type: 'trigger' },
  ],
  create(n) { n.state = { an: null, avg: 0, last: 0 }; },
  update(n, ctx) {
    if (n.inputs.on && !n.state.an && !n.state.pending) {
      n.state.pending = true;
      ctx.host.audio?.mic().then((an) => {
        n.state.pending = false;
        if (!an) { n.error = 'No microphone available (check permissions).'; return; }
        n.state.an = an;
        n.state.freq = new Uint8Array(an.frequencyBinCount);
        n.error = null;
      }).catch((e) => { n.state.pending = false; n.error = `Microphone: ${e.message || e}`; });
    }
    if (n.state.an) n.state.an.smoothingTimeConstant = n.inputs.smooth / 100;
  },
  tick(n, ctx) {
    const an = n.state.an;
    if (!an || !n.inputs.on) return;
    an.getByteFrequencyData(n.state.freq);
    const f = n.state.freq, len = f.length;
    const band = (a, b) => { let s = 0; const i0 = Math.floor(a * len), i1 = Math.max(i0 + 1, Math.floor(b * len)); for (let i = i0; i < i1; i++) s += f[i]; return (s / (i1 - i0) / 255) * 100 * n.inputs.gain; };
    const low = Math.min(100, band(0, 0.04)), mid = Math.min(100, band(0.04, 0.25)), high = Math.min(100, band(0.25, 0.7));
    const level = Math.min(100, (low + mid + high) / 3 * 1.4);
    ctx.out(n, 'low', Math.round(low)); ctx.out(n, 'mid', Math.round(mid)); ctx.out(n, 'high', Math.round(high)); ctx.out(n, 'level', Math.round(level));
    // Simple onset detector on the low band.
    n.state.avg = n.state.avg * 0.95 + low * 0.05;
    const thresh = 1.1 + (1 - n.inputs.sens / 100) * 0.9;
    if (low > n.state.avg * thresh && low > 8 && ctx.time - n.state.last > 0.18) { n.state.last = ctx.time; ctx.fire(n, 'beat'); }
  },
});
