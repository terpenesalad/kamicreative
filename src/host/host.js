// KamiCreative — host services exposed to modules (ctx.host) and to the UI.

import { createWebBridge } from './bridge-web.js';
import { SoundEngine } from '../audio/sound.js';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
const AUDIO_EXT = /\.(wav|mp3|ogg|oga|flac|aac|m4a|opus)$/i;

export function mediaKind(path) {
  if (VIDEO_EXT.test(path)) return 'video';
  if (IMAGE_EXT.test(path)) return 'image';
  if (AUDIO_EXT.test(path)) return 'audio';
  return null;
}

export function createHost(app) {
  const bridge = window.kami || createWebBridge();
  const status = { midiIn: 0, midiOut: 0, midiActivity: 0, oscActivity: 0, oscPort: null, oscError: null, artnetActivity: 0 };

  // ------------------------------------------------------------------ media
  const media = {
    resolve(value, kind) {
      const list = app.doc.project?.media || [];
      if (value === '' || value === null || value === undefined) return null;
      let m = list.find((x) => x.id === value);
      if (!m && (typeof value === 'number' || /^\d+$/.test(String(value)))) {
        const ofKind = list.filter((x) => !kind || x.kind === kind || (kind === 'audio' && x.kind === 'video'));
        m = ofKind[Number(value) - 1];
      }
      if (!m) m = list.find((x) => x.name === value);
      if (!m) return null;
      return { id: m.id, name: m.name, kind: m.kind, url: bridge.fileUrl(m.path) };
    },
  };

  // ------------------------------------------------------------------ MIDI
  const midi = {
    access: null,
    outputs: [],
    inputs: [],
    async init() {
      if (!navigator.requestMIDIAccess) return;
      try {
        this.access = await navigator.requestMIDIAccess({ sysex: false });
        const refresh = () => {
          this.inputs = [...this.access.inputs.values()];
          this.outputs = [...this.access.outputs.values()];
          status.midiIn = this.inputs.length;
          status.midiOut = this.outputs.length;
          for (const inp of this.inputs) inp.onmidimessage = (e) => this.receive(e, inp);
          app.emit?.('status');
        };
        this.access.onstatechange = refresh;
        refresh();
      } catch (e) { console.warn('MIDI unavailable', e); }
    },
    receive(e, port) {
      const [st, d1 = 0, d2 = 0] = e.data;
      const cmd = st & 0xf0, channel = (st & 0x0f) + 1;
      let type = null;
      if (cmd === 0x90) type = d2 > 0 ? 'noteon' : 'noteoff';
      else if (cmd === 0x80) type = 'noteoff';
      else if (cmd === 0xb0) type = 'cc';
      else if (cmd === 0xc0) type = 'program';
      else if (cmd === 0xe0) type = 'pitch';
      if (!type) return;
      status.midiActivity = performance.now();
      app.engine.dispatch('Midi', { type, channel, data1: d1, data2: d2, device: port.name });
      app.onMidiLearn?.({ type, channel, data1: d1, data2: d2 });
    },
    send(index, bytes) {
      const out = this.outputs[index] || this.outputs[0];
      if (!out) return false;
      try { out.send(bytes); status.midiActivity = performance.now(); return true; } catch { return false; }
    },
  };

  // ------------------------------------------------------------------ OSC
  const osc = {
    async listen(port) {
      const r = await bridge.oscListen(port);
      status.oscPort = r?.ok ? port : null;
      status.oscError = r?.ok ? null : r?.error || null;
      app.emit?.('status');
      return r;
    },
    send(host, port, address, args) {
      status.oscActivity = performance.now();
      bridge.oscSend(host, port, address, args);
    },
  };
  bridge.onOsc((msg) => {
    status.oscActivity = performance.now();
    app.engine.dispatch('Osc', msg);
  });

  // ---------------------------------------------------------------- Art-Net
  const artnet = {
    universes: new Map(), // `${host}|${universe}` -> { host, universe, data, dirty }
    set(host, universe, channel, value) {
      host = host || app.doc.project?.settings?.artnetHost || '255.255.255.255';
      const key = `${host}|${universe}`;
      let u = this.universes.get(key);
      if (!u) { u = { host, universe, data: new Uint8Array(512), dirty: true, last: 0 }; this.universes.set(key, u); }
      const v = Math.max(0, Math.min(255, Math.round(value)));
      if (u.data[channel - 1] !== v) { u.data[channel - 1] = v; u.dirty = true; }
    },
    flush(now) {
      for (const u of this.universes.values()) {
        // Send on change (max 44 Hz) and as a keep-alive every second, per Art-Net practice.
        if ((u.dirty && now - u.last > 22) || now - u.last > 1000) {
          bridge.artnetSend(u.host, u.universe, Array.from(u.data));
          u.dirty = false;
          u.last = now;
          status.artnetActivity = now;
        }
      }
    },
  };

  // ------------------------------------------------------------------ audio
  let ac = null;
  const audio = {
    context() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC({ latencyHint: 'interactive' });
      }
      return ac;
    },
    resume() { if (ac && ac.state === 'suspended') ac.resume(); },
    _mic: null,
    async mic() {
      if (this._mic) return this._mic;
      const ctx = this.context();
      if (!ctx || !navigator.mediaDevices?.getUserMedia) return null;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      this.resume();
      this._mic = an;
      return an;
    },
  };

  async function camera(index, width, height, fps) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture is not supported here.');
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const dev = devices[index];
    if (!dev && index > 0) throw new Error(`Camera #${index + 1} not found (${devices.length} connected).`);
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: dev?.deviceId ? { exact: dev.deviceId } : undefined, width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: fps } },
    });
  }

  function stageComposite(index) {
    const st = app.doc.project?.stages[index - 1];
    return st ? app.stageRenderer.comp.get(st.id) || null : null;
  }

  const host = { bridge, status, media, midi, osc, artnet, audio, camera, stageComposite, mediaKind };
  host.sound = new SoundEngine(host);
  return host;
}
