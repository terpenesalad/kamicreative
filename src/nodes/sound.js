// KamiCreative — Sound modules. Everything here reads the shared sound engine
// (ctx.host.sound), so the source (microphone, computer audio, Sound Player)
// is chosen once, in the Sound panel.

import { defineNode, hexToRgb } from '../core/registry.js';
import { fragment } from '../gl/gl.js';

const S = 'Sound';
const rgb3 = (hex) => hexToRgb(hex).slice(0, 3);
const silent = { level: 0, bass: 0, mid: 0, treble: 0, beat: false, beatCount: 0, bpm: 0, beatPhase: 0 };
const snd = (ctx) => ctx.host.sound?.values || silent;

// ------------------------------------------------------------------ inputs

defineNode({
  type: 'audio.sound', name: 'Sound Input', category: S, usesSound: true,
  description: 'Listens to the sound chosen in the Sound panel (microphone, computer audio or a Sound Player) and outputs loudness, bass, mids, treble (0-100), a trigger on every beat and the tempo.',
  keywords: ['audio', 'music', 'microphone', 'reactive', 'beat', 'bass', 'fft', 'spectrum', 'listen', 'photism', 'visualizer'],
  inputs: [
    { id: 'every', name: 'Beat Every N', type: 'number', default: 1, min: 1, max: 64, int: true },
    { id: 'lo', name: 'Custom Low Hz', type: 'number', default: 200, min: 20, max: 20000 },
    { id: 'hi', name: 'Custom High Hz', type: 'number', default: 800, min: 20, max: 20000 },
  ],
  outputs: [
    { id: 'level', name: 'Loudness', type: 'number' },
    { id: 'bass', name: 'Bass', type: 'number' },
    { id: 'mid', name: 'Mids', type: 'number' },
    { id: 'treble', name: 'Treble', type: 'number' },
    { id: 'beat', name: 'Beat', type: 'trigger' },
    { id: 'count', name: 'Beat Count', type: 'number' },
    { id: 'bpm', name: 'Tempo (BPM)', type: 'number' },
    { id: 'phase', name: 'Beat Phase', type: 'number' },
    { id: 'custom', name: 'Custom Band', type: 'number' },
  ],
  tick(n, ctx) {
    const v = snd(ctx);
    ctx.out(n, 'level', v.level); ctx.out(n, 'bass', v.bass); ctx.out(n, 'mid', v.mid); ctx.out(n, 'treble', v.treble);
    ctx.out(n, 'bpm', v.bpm); ctx.out(n, 'phase', Math.round(v.beatPhase * 100) / 100);
    ctx.out(n, 'custom', Math.round((ctx.host.sound?.band(Math.min(n.inputs.lo, n.inputs.hi), Math.max(n.inputs.lo, n.inputs.hi)) || 0) * 10) / 10);
    if (v.beat) {
      n.state.count = (n.state.count || 0) + 1;
      if ((n.state.count - 1) % n.inputs.every === 0) {
        ctx.out(n, 'count', Math.floor((n.state.count - 1) / n.inputs.every) + 1);
        ctx.fire(n, 'beat');
      }
    }
  },
});

// Kept for projects made with 1.0/1.1; now reads the shared sound engine.
defineNode({
  type: 'audio.analyzer', name: 'Sound Analyser', category: S, usesSound: true,
  description: 'Older version of Sound Input with its own gain. Outputs level, low, mid and high bands and a beat trigger.',
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
  create(n) { n.state.s = { level: 0, low: 0, mid: 0, high: 0 }; },
  tick(n, ctx) {
    if (!n.inputs.on) return;
    const v = snd(ctx);
    const k = 1 - Math.pow(n.inputs.smooth / 100, ctx.dt * 60);
    const src = { level: v.level, low: v.bass, mid: v.mid, high: v.treble };
    for (const key of Object.keys(src)) {
      const target = Math.min(100, src[key] * n.inputs.gain);
      n.state.s[key] += (target - n.state.s[key]) * k;
      ctx.out(n, key, Math.round(n.state.s[key]));
    }
    if (v.beat) ctx.fire(n, 'beat');
  },
});

defineNode({
  type: 'audio.player', name: 'Sound Player', category: S, usesSound: false,
  description: 'Plays a music or sound file from the Media Bin. With "Visuals React" on, everything that reacts to sound follows this song.',
  keywords: ['sound', 'audio', 'music', 'wav', 'mp3', 'play', 'song', 'track'],
  inputs: [
    { id: 'media', name: 'Sound', type: 'media', kind: 'audio', default: '' },
    { id: 'play', name: 'Play', type: 'bool', default: 1 },
    { id: 'loop', name: 'Loop', type: 'bool', default: 0 },
    { id: 'vol', name: 'Volume %', type: 'number', default: 100, min: 0, max: 200 },
    { id: 'pan', name: 'Pan', type: 'number', default: 0, min: -100, max: 100 },
    { id: 'speed', name: 'Speed', type: 'number', default: 1, min: 0.1, max: 4, step: 0.01 },
    { id: 'react', name: 'Visuals React', type: 'bool', default: 1 },
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
    if (!m) { n.error = n.inputs.media ? 'Sound file not found in the Media Bin.' : null; return null; }
    const el = new Audio();
    el.src = m.url;
    el.preload = 'auto';
    el.onended = () => { if (!el.loop) ctx.fire(n, 'end'); };
    el.onerror = () => { n.error = `Cannot play "${m.name}".`; ctx.dirty.add(n.id); };
    n.state.el = el;
    n.error = null;
    const ac = ctx.host.audio?.context();
    if (ac) {
      try {
        const src = ac.createMediaElementSource(el);
        const gain = ac.createGain();
        const pan = ac.createStereoPanner();
        const an = ac.createAnalyser();
        an.fftSize = 256;
        src.connect(gain).connect(pan).connect(an).connect(ac.destination);
        Object.assign(n.state, { gain, pan, an, buf: new Uint8Array(an.fftSize), routed: false });
      } catch (e) { console.warn(e); }
    }
    return el;
  },
  _route(n, ctx) {
    const want = !!n.inputs.react && !!n.state.pan;
    if (want === n.state.routed) return;
    const input = ctx.host.sound?.input();
    if (!input) return;
    if (want) { n.state.pan.connect(input); ctx.host.sound.need(); } else { try { n.state.pan.disconnect(input); } catch { /* ignore */ } }
    n.state.routed = want;
  },
  update(n, ctx, port) {
    const el = this._ensure(n, ctx);
    if (!el) return;
    const i = n.inputs;
    el.loop = !!i.loop;
    el.playbackRate = i.speed;
    if (n.state.gain) { n.state.gain.gain.value = i.vol / 100; n.state.pan.pan.value = i.pan / 100; } else el.volume = Math.min(1, i.vol / 100);
    this._route(n, ctx);
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
  destroy(n, ctx) {
    const el = n.state.el;
    if (n.state.routed) { try { n.state.pan.disconnect(ctx.host.sound.input()); } catch { /* ignore */ } }
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    n.state.el = null;
    n.state.mediaId = null;
    n.state.routed = false;
  },
});

// -------------------------------------------------------------- visualizers

const SOUND_GLSL = `
uniform sampler2D uSound;
uniform vec2 uRes;
uniform float uTime;
float spec(float x) { return texture(uSound, vec2(clamp(x, 0.002, 0.998), 0.25)).r; }
float peakv(float x) { return texture(uSound, vec2(clamp(x, 0.002, 0.998), 0.25)).g; }
float wave(float x) { return texture(uSound, vec2(clamp(x, 0.002, 0.998), 0.75)).r * 2.0 - 1.0; }
vec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

const STYLES = ['bars', 'mirror bars', 'circle', 'waveform', 'ring wave', 'tunnel', 'stars', 'blob'];
const COLOR_MODES = ['rainbow (pitch → colour)', 'two colours', 'single colour'];

const VIS_FS = fragment(SOUND_GLSL + `
uniform int uStyle; uniform int uMode;
uniform float uCount, uGap, uScale, uThick, uRot, uLevel, uBass, uBeat, uTravel, uHue;
uniform vec3 uA, uB; uniform vec4 uBg;
vec3 pal(float t, float h) {
  if (uMode == 0) return hsv2rgb(vec3(fract(t * 0.82 + uHue), 0.78, 1.0));
  if (uMode == 1) return mix(uA, uB, clamp(h, 0.0, 1.0));
  return uA;
}
float lineMask(float dpx) { return smoothstep(uThick + 1.2, uThick - 0.6, dpx) + exp(-dpx / (6.0 * uThick + 4.0)) * 0.45; }
vec4 effect(vec2 uv) {
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  float c = cos(uRot), s = sin(uRot);
  p = mat2(c, s, -s, c) * p;
  float r = length(p);
  float ang = atan(p.y, p.x) / 6.28318 + 0.5;
  float sym = abs(ang * 2.0 - 1.0);           // seamless angle 0..1..0
  vec3 col = vec3(0.0);
  if (uStyle == 0 || uStyle == 1) {
    float x = uv.x, y = uv.y;
    if (uStyle == 1) { x = abs(x - 0.5) * 2.0; y = abs(y - 0.5) * 2.0; }
    float N = max(4.0, uCount);
    float i = floor(x * N), f = fract(x * N);
    float t = (i + 0.5) / N;
    float h = spec(t) * uScale;
    float bar = step(uGap * 0.5, f) * step(f, 1.0 - uGap * 0.5);
    float fill = bar * step(y, h);
    float pk = peakv(t) * uScale;
    float cap = bar * step(0.002, pk) * (1.0 - smoothstep(0.0, 3.0 / uRes.y, abs(y - pk - 3.0 / uRes.y)));
    col += pal(t, y / max(h, 1e-3)) * (fill * (0.55 + 0.45 * y / max(h, 1e-3)) + cap * 0.9);
    col += pal(t, 1.0) * bar * exp(-max(0.0, y - h) * 28.0) * 0.25 * step(0.001, h);
  } else if (uStyle == 2) {
    float N = max(8.0, uCount);
    float i = floor(sym * N), f = fract(sym * N);
    float t = (i + 0.5) / N;
    float r0 = 0.16 + uBass * 0.06 + uBeat * 0.03;
    float len = spec(t) * uScale * 0.32;
    float bar = step(uGap * 0.5, f) * step(f, 1.0 - uGap * 0.5);
    float inside = bar * step(r0, r) * step(r, r0 + len);
    col += pal(t, (r - r0) / max(len, 1e-3)) * inside;
    col += pal(0.0, 0.0) * exp(-abs(r - r0 + 0.01) * uRes.y / (4.0 * uThick)) * (0.4 + uBeat);
  } else if (uStyle == 3) {
    float y = 0.5 + wave(uv.x) * 0.42 * uScale;
    float d = abs(uv.y - y) * uRes.y;
    col += pal(uv.x, 0.5 + wave(uv.x)) * lineMask(d);
  } else if (uStyle == 4) {
    float r0 = 0.24 + uBass * 0.05 + uBeat * 0.04;
    float rr = r0 + wave(sym) * 0.14 * uScale;
    float d = abs(r - rr) * uRes.y;
    col += pal(sym, r / max(rr, 1e-3)) * lineMask(d);
  } else if (uStyle == 5) {
    float d = -log(max(r, 1e-3));                   // perspective depth: rings evenly spaced into the distance
    float k = fract(d * 2.2 + uTravel);
    float segN = max(6.0, floor(uCount * 0.25));
    float seg = smoothstep(0.3, 0.45, abs(fract(sym * segN) - 0.5) * 2.0);
    float energy = spec(fract(d * 0.22 + 0.05));
    float ring = smoothstep(0.78, 0.97, k) * (1.0 - smoothstep(0.97, 1.0, k)) * 3.0 * (0.25 + energy * 1.5) * mix(1.0, seg, 0.45);
    col += pal(fract(d * 0.18 + uTravel * 0.03), energy) * ring * smoothstep(0.0, 0.06, r) * (1.0 + uBeat * 0.8);
  } else if (uStyle == 6) {
    for (int L = 0; L < 5; L++) {
      float z = fract(float(L) / 5.0 + uTravel * 0.12);
      float sc = mix(24.0, 1.2, z);
      vec2 q = p * sc + float(L) * 13.7;
      vec2 id = floor(q), g = fract(q) - 0.5;
      float hsh = hash21(id);
      vec2 o = vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5;
      float d = length(g - o * 0.7);
      float tw = 0.6 + 0.4 * spec(hsh);
      float star = smoothstep(0.06 * uThick * z, 0.0, d) * z * tw * step(0.4, hsh);
      col += pal(hsh, z) * star * (1.6 + uBeat * 2.0);
    }
  } else {
    float k = spec(sym);
    float rad = 0.12 + uBass * 0.08 + uBeat * 0.04 + k * 0.18 * uScale;
    float edge = (r - rad) * uRes.y;
    float fill = smoothstep(1.5, -1.5, edge);
    col += pal(sym, r / max(rad, 1e-3)) * (fill * (0.35 + 0.65 * r / max(rad, 1e-3)) + exp(-max(edge, 0.0) / (10.0 * uThick)) * 0.5);
  }
  float a = clamp(uBg.a + max(max(col.r, col.g), col.b), 0.0, 1.0);
  vec3 rgb = uBg.rgb * uBg.a + col;
  return vec4(clamp(rgb / max(a, 1e-4), 0.0, 1.0), a);
}`);

const resInput = { id: 'res', name: 'Resolution', type: 'enum', options: ['stage', '3840x2160', '1920x1080', '1280x720', '1080x1920', '1024x1024'], default: 'stage' };
function size(n, ctx) {
  const r = n.inputs.res;
  if (r && r !== 'stage') return r.split('x').map(Number);
  return ctx.defaultSize();
}

function beatPulse(n, ctx, decay = 0.25) {
  const v = snd(ctx);
  if (v.beat) n.state.pulse = 1;
  n.state.pulse = Math.max(0, (n.state.pulse || 0) - ctx.dt / decay);
  return n.state.pulse;
}

defineNode({
  type: 'src.visualizer', name: 'Sound Visualizer', category: S, preview: true, usesSound: true,
  description: 'Instant music visuals: spectrum bars, circle, waveform, tunnel, stars or a pulsing blob, all driven by the sound you choose in the Sound panel.',
  keywords: ['visualizer', 'visualiser', 'spectrum', 'equalizer', 'eq', 'bars', 'waveform', 'oscilloscope', 'music', 'audio', 'reactive', 'photism', 'synesthesia'],
  inputs: [
    { id: 'style', name: 'Style', type: 'enum', options: STYLES, default: 'circle' },
    { id: 'mode', name: 'Colours', type: 'enum', options: COLOR_MODES, default: COLOR_MODES[0] },
    { id: 'a', name: 'Colour A', type: 'color', default: '#5cc8ff' },
    { id: 'b', name: 'Colour B', type: 'color', default: '#ff4f8b' },
    { id: 'count', name: 'Bars', type: 'number', default: 48, min: 4, max: 256, int: true },
    { id: 'gap', name: 'Gap %', type: 'number', default: 25, min: 0, max: 90 },
    { id: 'scale', name: 'Height %', type: 'number', default: 90, min: 0, max: 300 },
    { id: 'thick', name: 'Line Width', type: 'number', default: 3, min: 0.5, max: 40, step: 0.5 },
    { id: 'rot', name: 'Rotation', type: 'number', default: 0 },
    { id: 'spin', name: 'Spin Speed', type: 'number', default: 0, step: 0.01 },
    { id: 'speed', name: 'Travel Speed', type: 'number', default: 1, min: 0, max: 10, step: 0.05 },
    { id: 'cycle', name: 'Colour Cycle', type: 'number', default: 0.02, step: 0.005 },
    { id: 'bg', name: 'Background', type: 'color', default: '#000000' },
    resInput,
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state.travel = 0; n.state.rot = 0; n.state.hue = 0; },
  tick(n, ctx) {
    const v = snd(ctx);
    beatPulse(n, ctx);
    n.state.travel += ctx.dt * n.inputs.speed * (0.15 + (v.level / 100) * 1.4);
    n.state.rot += ctx.dt * n.inputs.spin * Math.PI * 2;
    n.state.hue += ctx.dt * n.inputs.cycle + (v.beat ? 0.015 : 0);
  },
  render(n, ctx) {
    const [w, h] = size(n, ctx);
    const t = ctx.target(n, 'out', w, h);
    const v = snd(ctx);
    const i = n.inputs;
    const ok = ctx.renderer.draw(VIS_FS, {
      uSound: ctx.host.sound?.texture(ctx.renderer, ctx.frame) || ctx.renderer.black, uRes: [w, h], uTime: ctx.time,
      uStyle: STYLES.indexOf(i.style), uMode: COLOR_MODES.indexOf(i.mode), uCount: i.count, uGap: i.gap / 100, uScale: i.scale / 100,
      uThick: i.thick, uRot: (i.rot * Math.PI) / 180 + n.state.rot, uLevel: v.level / 100, uBass: v.bass / 100, uBeat: n.state.pulse || 0,
      uTravel: n.state.travel, uHue: n.state.hue, uA: rgb3(i.a), uB: rgb3(i.b), uBg: hexToRgb(i.bg),
    }, t);
    if (!ok) n.error = ctx.renderer.programError(VIS_FS);
    return t;
  },
});

// Colour organ: each frequency band lights its own colour — the photism idea of
// "seeing" sound. Bands are averaged in JS and passed as uniform arrays.
const ORGAN_LAYOUTS = ['columns', 'rings', 'lights', 'wash'];
const ORGAN_PALETTES = ['rainbow (pitch → colour)', 'warm', 'cool', 'two colours'];
const MAXB = 12;
const ORGAN_FS = fragment(`
uniform vec2 uRes; uniform float uTime;
uniform float uBands[${MAXB}];
uniform vec3 uCols[${MAXB}];
uniform int uN; uniform int uLayout; uniform float uSoft, uDrift, uBright;
vec4 effect(vec2 uv) {
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0);
  vec3 col = vec3(0.0);
  float N = float(uN);
  for (int i = 0; i < ${MAXB}; i++) {
    if (i >= uN) break;
    float fi = float(i);
    float e = uBands[i];
    float w;
    if (uLayout == 0) {
      float cx = (fi + 0.5) / N;
      float d = abs(uv.x - cx) * N;
      w = exp(-d * d / (0.25 + uSoft * 2.0)) * (0.35 + 0.65 * smoothstep(1.05, 0.0, uv.y / max(e, 0.02)));
    } else if (uLayout == 1) {
      float r0 = (fi + 0.5) / N * 0.62;
      float d = abs(length(p) - r0) * N * 1.6;
      w = exp(-d * d / (0.2 + uSoft * 2.0));
    } else if (uLayout == 2) {
      float a = fi / N * 6.28318 + uTime * uDrift * (0.3 + 0.1 * fi);
      vec2 c = vec2(cos(a), sin(a * 1.3 + fi)) * vec2(0.55 * asp, 0.32) * (0.6 + 0.4 * sin(uTime * uDrift * 0.7 + fi));
      float d = length(p - c * 0.8);
      w = exp(-d * d / (0.008 + 0.04 * uSoft + 0.05 * e));
    } else {
      w = 0.0; // wash is mixed below
    }
    col += uCols[i] * w * e;
  }
  if (uLayout == 3) {
    // Wash: the whole picture takes the colour of whichever bands are loudest.
    vec3 sum = vec3(0.0); float tw = 1e-4, top = 0.0;
    for (int i = 0; i < ${MAXB}; i++) {
      if (i >= uN) break;
      float e2 = pow(uBands[i], 6.0); // strongly favour the loudest bands so colours stay vivid
      sum += uCols[i] * e2; tw += e2; top = max(top, uBands[i]);
    }
    vec3 c = sum / tw;
    float l = dot(c, vec3(0.3333));
    c = clamp(mix(vec3(l), c, 1.6), 0.0, 1.0); // keep it saturated
    float v = length(p);
    col = c * top * (1.15 - 0.5 * v) * 1.4;
  }
  col *= uBright;
  col = 1.0 - exp(-col * 1.6);  // soft tone-map so many lights do not clip harshly
  return vec4(col, 1.0);
}`);

function hsv(h, s, v) {
  const f = (k) => { const x = (k + h * 6) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return [f(5), f(3), f(1)];
}

defineNode({
  type: 'src.colororgan', name: 'Colour Organ', category: S, preview: true, usesSound: true,
  description: 'Photism-style light organ: the music is split into bands from low to high, and each band glows its own colour — low notes red, high notes violet by default.',
  keywords: ['photism', 'synesthesia', 'colour organ', 'color organ', 'light organ', 'lights', 'music', 'reactive', 'chromesthesia'],
  inputs: [
    { id: 'layout', name: 'Layout', type: 'enum', options: ORGAN_LAYOUTS, default: 'lights' },
    { id: 'bands', name: 'Bands', type: 'number', default: 7, min: 3, max: MAXB, int: true },
    { id: 'palette', name: 'Palette', type: 'enum', options: ORGAN_PALETTES, default: ORGAN_PALETTES[0] },
    { id: 'a', name: 'Colour A', type: 'color', default: '#ff3b6b' },
    { id: 'b', name: 'Colour B', type: 'color', default: '#3bd1ff' },
    { id: 'soft', name: 'Softness %', type: 'number', default: 50, min: 0, max: 100 },
    { id: 'bright', name: 'Brightness %', type: 'number', default: 100, min: 0, max: 400 },
    { id: 'drift', name: 'Drift', type: 'number', default: 0.3, min: 0, max: 5, step: 0.05 },
    { id: 'smooth', name: 'Smoothing %', type: 'number', default: 50, min: 0, max: 99 },
    { id: 'idle', name: 'Glow When Quiet %', type: 'number', default: 8, min: 0, max: 100 },
    resInput,
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state.e = new Float32Array(MAXB); },
  tick(n, ctx) {
    const a = ctx.host.sound?.analysis;
    const N = Math.max(3, Math.min(MAXB, n.inputs.bands));
    const k = 1 - Math.pow(n.inputs.smooth / 100, ctx.dt * 60);
    for (let i = 0; i < N; i++) {
      let e = 0;
      if (a) {
        const s0 = Math.floor((i / N) * a.spectrum.length), s1 = Math.max(s0 + 1, Math.floor(((i + 1) / N) * a.spectrum.length));
        for (let j = s0; j < s1; j++) e += a.spectrum[j];
        e /= s1 - s0;
        e = Math.min(1, e * 1.25);
      }
      e = Math.max(e, n.inputs.idle / 100);
      n.state.e[i] += (e - n.state.e[i]) * k;
    }
  },
  render(n, ctx) {
    const [w, h] = size(n, ctx);
    const t = ctx.target(n, 'out', w, h);
    const i = n.inputs;
    const N = Math.max(3, Math.min(MAXB, i.bands));
    const cols = new Float32Array(MAXB * 3);
    const A = rgb3(i.a), B = rgb3(i.b);
    for (let k = 0; k < N; k++) {
      const u = k / Math.max(1, N - 1);
      let c;
      if (i.palette === 'warm') c = hsv(0.0 + u * 0.15, 0.85, 1);
      else if (i.palette === 'cool') c = hsv(0.45 + u * 0.3, 0.75, 1);
      else if (i.palette === 'two colours') c = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
      else c = hsv(u * 0.8, 0.85, 1);
      cols.set(c, k * 3);
    }
    ctx.renderer.draw(ORGAN_FS, {
      uRes: [w, h], uTime: ctx.time, uBands: n.state.e, uCols: cols, uN: N, uLayout: ORGAN_LAYOUTS.indexOf(i.layout),
      uSoft: i.soft / 100, uDrift: i.drift, uBright: i.bright / 100,
    }, t);
    return t;
  },
});

const PULSE_FS = fragment(`
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime;
uniform float uE, uBeat, uZoom, uFlash, uShake, uSplit, uBright, uHue;
vec3 rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x); }
vec3 hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
float h1(float n) { return fract(sin(n * 91.3) * 43758.5); }
vec4 effect(vec2 uv) {
  float z = 1.0 + uZoom * (uE * 0.6 + uBeat * 0.4);
  vec2 sh = (vec2(h1(floor(uTime * 30.0)), h1(floor(uTime * 30.0) + 7.0)) - 0.5) * uShake * (uE * 0.5 + uBeat) * 0.06;
  vec2 q = (uv - 0.5) / z + 0.5 + sh;
  vec2 o = vec2(uSplit * (uE * 0.5 + uBeat) * 0.012, 0.0);
  vec4 c = texture(uTex, q);
  vec3 col = vec3(texture(uTex, q + o).r, c.g, texture(uTex, q - o).b);
  if (uHue != 0.0) { vec3 h = rgb2hsv(col); h.x = fract(h.x + uHue); col = hsv2rgb(h); }
  col *= 1.0 + uBright * uE;
  col = mix(col, vec3(1.0), uFlash * uBeat * 0.8);
  return vec4(col, c.a);
}`);

defineNode({
  type: 'fx.soundpulse', name: 'Sound Pulse', category: S, preview: true, usesSound: true,
  description: 'Makes any video move with the music: it zooms with the bass, flashes and shakes on beats, splits colours and shifts hue. Turn amounts to 0 to switch an effect off.',
  keywords: ['pulse', 'bounce', 'beat', 'bass', 'zoom', 'shake', 'flash', 'reactive', 'music', 'photism'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' },
    { id: 'band', name: 'Follow', type: 'enum', options: ['bass', 'level', 'mid', 'treble'], default: 'bass' },
    { id: 'zoom', name: 'Zoom %', type: 'number', default: 12, min: 0, max: 100 },
    { id: 'flash', name: 'Flash on Beat %', type: 'number', default: 20, min: 0, max: 100 },
    { id: 'shake', name: 'Shake %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'split', name: 'Colour Split %', type: 'number', default: 25, min: 0, max: 100 },
    { id: 'bright', name: 'Brightness %', type: 'number', default: 30, min: 0, max: 200 },
    { id: 'hue', name: 'Hue Jump on Beat', type: 'bool', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state.hue = 0; },
  tick(n, ctx) {
    const v = snd(ctx);
    beatPulse(n, ctx, 0.2);
    if (v.beat && n.inputs.hue) n.state.hue = (n.state.hue + 0.1 + Math.random() * 0.25) % 1;
    n.state.e = (v[n.inputs.band] || 0) / 100;
  },
  render(n, ctx) {
    const src = ctx.texture(n, 'video');
    if (!src) return null;
    const t = ctx.target(n, 'out', src.width, src.height);
    const i = n.inputs;
    ctx.renderer.draw(PULSE_FS, {
      uTex: src, uRes: [src.width, src.height], uTime: ctx.time, uE: n.state.e || 0, uBeat: n.state.pulse || 0,
      uZoom: i.zoom / 100, uFlash: i.flash / 100, uShake: i.shake / 100, uSplit: i.split / 100, uBright: i.bright / 100, uHue: n.state.hue,
    }, t);
    return t;
  },
});
