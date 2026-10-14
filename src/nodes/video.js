// KamiCreative — Video sources, effects, compositing and output.

import { defineNode, hexToRgb } from '../core/registry.js';
import { fragment } from '../gl/gl.js';

const SRC = 'Video Sources', FX = 'Video FX', COMP = 'Compositing', OUT = 'Output';

const GLSL_LIB = `
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c) * p; }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
`;

const fx = (body) => fragment(GLSL_LIB + body);
const SHADER_LIB = GLSL_LIB.replace('uniform sampler2D uTex;', 'uniform sampler2D uTex0;\nuniform sampler2D uTex1;\nuniform float uP1, uP2, uP3, uP4;');
const FRAG_PREFIX_LINES = 4; // lines in gl.js FRAG_HEADER before the effect body

const RESOLUTIONS = ['stage', '3840x2160', '1920x1080', '1280x720', '1024x768', '1080x1920', '1024x1024', '512x512'];
function sizeFrom(n, ctx) {
  const r = n.inputs.res;
  if (r && r !== 'stage') { const [w, h] = r.split('x').map(Number); return [w, h]; }
  return ctx.defaultSize();
}
const resInput = { id: 'res', name: 'Resolution', type: 'enum', options: RESOLUTIONS, default: 'stage' };
const rgb = (hex) => hexToRgb(hex);

// ------------------------------------------------------------------ helpers

/** Define a one-input shader effect. `uniforms(node)` maps inputs to GLSL uniforms. */
function fxNode({ type, name, description, keywords, inputs = [], body, uniforms = () => ({}), extraVideo = [] }) {
  const fs = fx(body);
  defineNode({
    type, name, category: FX, description, keywords, preview: true,
    inputs: [{ id: 'video', name: 'Video In', type: 'video' }, ...extraVideo.map((v) => ({ id: v.id, name: v.name, type: 'video' })), ...inputs],
    outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
    render(n, ctx) {
      const src = ctx.texture(n, 'video');
      if (!src) return null;
      const extra = {};
      for (const v of extraVideo) extra[v.uniform] = ctx.texture(n, v.id) || ctx.renderer.black;
      const t = ctx.target(n, 'out', src.width, src.height);
      if (!ctx.renderer.draw(fs, { uTex: src, uRes: [src.width, src.height], uTime: ctx.time, ...extra, ...uniforms(n, ctx, src) }, t)) {
        n.error = ctx.renderer.programError(fs);
        return src;
      }
      return t;
    },
  });
}

// ------------------------------------------------------------------ sources

function videoFrameUploader(n, ctx, el) {
  const t = ctx.target(n, 'out', el.videoWidth || 2, el.videoHeight || 2);
  if (el.readyState >= 2 && el.videoWidth) {
    if (n.state.newFrame !== false || n.state.uploadedFor !== el) {
      t.upload(el);
      n.state.uploadedFor = el;
      if (n.state.useRvfc) n.state.newFrame = false;
    }
    return t;
  }
  return n.state.uploadedFor === el ? t : null;
}

function watchFrames(n, el) {
  if (typeof el.requestVideoFrameCallback !== 'function') return;
  n.state.useRvfc = true;
  n.state.newFrame = true;
  const cb = () => { if (n.state.el !== el) return; n.state.newFrame = true; el.requestVideoFrameCallback(cb); };
  el.requestVideoFrameCallback(cb);
}

defineNode({
  type: 'src.movie', name: 'Movie Player', category: SRC, preview: true,
  description: 'Plays a video file from the Media Bin. Supports speed, looping, loop regions and seeking.',
  keywords: ['video', 'movie', 'film', 'clip', 'mp4', 'play'],
  inputs: [
    { id: 'media', name: 'Movie', type: 'media', kind: 'video', default: '' },
    { id: 'play', name: 'Play', type: 'bool', default: 1 },
    { id: 'loop', name: 'Loop', type: 'bool', default: 1 },
    { id: 'speed', name: 'Speed', type: 'number', default: 1, min: 0.0625, max: 16, step: 0.01 },
    { id: 'vol', name: 'Volume %', type: 'number', default: 100, min: 0, max: 100 },
    { id: 'start', name: 'Loop Start %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'end', name: 'Loop End %', type: 'number', default: 100, min: 0, max: 100 },
    { id: 'pos', name: 'Position %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'seek', name: 'Seek', type: 'trigger' },
    { id: 'restart', name: 'Restart', type: 'trigger' },
  ],
  outputs: [
    { id: 'out', name: 'Video Out', type: 'video' }, { id: 'position', name: 'Position %', type: 'number' },
    { id: 'end', name: 'Reached End', type: 'trigger' }, { id: 'dur', name: 'Duration (s)', type: 'number' },
    { id: 'w', name: 'Width', type: 'number' }, { id: 'h', name: 'Height', type: 'number' },
  ],
  create(n) { n.state = { el: null, mediaId: null }; },
  _ensure(n, ctx) {
    const m = ctx.host.media?.resolve(n.inputs.media, 'video');
    const id = m ? m.id : null;
    if (id === n.state.mediaId) return n.state.el;
    this.destroy(n, ctx);
    n.state.mediaId = id;
    if (!m) { n.error = n.inputs.media ? 'Movie not found in the Media Bin.' : null; return null; }
    const el = document.createElement('video');
    el.src = m.url;
    el.preload = 'auto';
    el.playsInline = true;
    el.loop = false;
    el.addEventListener('loadedmetadata', () => {
      ctx.out(n, 'dur', Math.round(el.duration * 100) / 100);
      ctx.out(n, 'w', el.videoWidth);
      ctx.out(n, 'h', el.videoHeight);
      this._apply(n, ctx, null);
    });
    el.addEventListener('ended', () => {
      ctx.fire(n, 'end');
      if (n.inputs.loop) { el.currentTime = (n.inputs.start / 100) * el.duration; el.play().catch(() => {}); }
    });
    el.addEventListener('error', () => { n.error = `Cannot decode "${m.name}". Use H.264 MP4, VP8/VP9 WebM or HAP-free codecs.`; ctx.dirty.add(n.id); });
    n.state.el = el;
    n.error = null;
    watchFrames(n, el);
    return el;
  },
  _apply(n, ctx, port) {
    const el = n.state.el;
    if (!el) return;
    const i = n.inputs;
    el.playbackRate = i.speed;
    el.volume = Math.min(1, i.vol / 100);
    el.muted = i.vol <= 0;
    if (el.duration) {
      if (port === 'seek' || port === 'pos' && !i.play) el.currentTime = (i.pos / 100) * el.duration;
      if (port === 'restart') el.currentTime = (i.start / 100) * el.duration;
    }
    if (i.play && el.paused && !el.ended) el.play().catch(() => {});
    if (!i.play && !el.paused) el.pause();
  },
  update(n, ctx, port) { this._ensure(n, ctx); this._apply(n, ctx, port); },
  tick(n, ctx) {
    const el = n.state.el;
    if (!el || !el.duration) return;
    const { start, end, loop } = n.inputs;
    const endT = (Math.max(start, end) / 100) * el.duration;
    if (end < 100 && el.currentTime >= endT && !el.paused) {
      ctx.fire(n, 'end');
      if (loop) el.currentTime = (start / 100) * el.duration; else el.pause();
    }
    ctx.out(n, 'position', Math.round((el.currentTime / el.duration) * 1000) / 10);
  },
  render(n, ctx) { return n.state.el ? videoFrameUploader(n, ctx, n.state.el) : null; },
  destroy(n) {
    const el = n.state.el;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    n.state.el = null;
    n.state.mediaId = null;
  },
});

defineNode({
  type: 'src.picture', name: 'Picture Player', category: SRC, preview: true,
  description: 'Shows a still image from the Media Bin (PNG transparency supported).',
  keywords: ['image', 'picture', 'photo', 'still', 'png', 'jpg'],
  inputs: [{ id: 'media', name: 'Picture', type: 'media', kind: 'image', default: '' }],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }, { id: 'w', name: 'Width', type: 'number' }, { id: 'h', name: 'Height', type: 'number' }],
  create(n) { n.state = { img: null, mediaId: null, dirty: false }; },
  update(n, ctx) {
    const m = ctx.host.media?.resolve(n.inputs.media, 'image');
    const id = m ? m.id : null;
    if (id === n.state.mediaId) return;
    n.state.mediaId = id;
    n.state.img = null;
    if (!m) { n.error = n.inputs.media ? 'Picture not found in the Media Bin.' : null; return; }
    const img = new Image();
    img.onload = () => { n.state.img = img; n.state.dirty = true; n.error = null; ctx.out(n, 'w', img.naturalWidth); ctx.out(n, 'h', img.naturalHeight); };
    img.onerror = () => { n.error = `Cannot load "${m.name}".`; ctx.dirty.add(n.id); };
    img.src = m.url;
  },
  render(n, ctx) {
    const img = n.state.img;
    if (!img) return null;
    const t = ctx.target(n, 'out', img.naturalWidth, img.naturalHeight);
    if (n.state.dirty) { t.upload(img); n.state.dirty = false; }
    return t;
  },
});

defineNode({
  type: 'src.camera', name: 'Live Capture', category: SRC, preview: true,
  description: 'Live video from a webcam or capture card.',
  keywords: ['webcam', 'camera', 'capture', 'live', 'input', 'ndi'],
  inputs: [
    { id: 'on', name: 'Capture', type: 'bool', default: 1 },
    { id: 'device', name: 'Device #', type: 'number', default: 1, min: 1, int: true },
    { id: 'res', name: 'Resolution', type: 'enum', options: ['1280x720', '1920x1080', '640x480', '3840x2160'], default: '1280x720' },
    { id: 'fps', name: 'Frame Rate', type: 'number', default: 30, min: 1, max: 120, int: true },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }, { id: 'live', name: 'Live', type: 'bool' }],
  create(n) { n.state = { el: null, stream: null, key: null }; },
  update(n, ctx) {
    const { on, device, res, fps } = n.inputs;
    const key = on ? `${device}|${res}|${fps}` : null;
    if (key === n.state.key) return;
    this.destroy(n, ctx);
    n.state.key = key;
    if (!key) { ctx.out(n, 'live', 0); return; }
    const [w, h] = res.split('x').map(Number);
    ctx.host.camera?.(device - 1, w, h, fps).then((stream) => {
      if (n.state.key !== key) { stream.getTracks().forEach((t) => t.stop()); return; }
      const el = document.createElement('video');
      el.muted = true;
      el.playsInline = true;
      el.srcObject = stream;
      el.play().catch(() => {});
      n.state.el = el;
      n.state.stream = stream;
      n.error = null;
      watchFrames(n, el);
      ctx.out(n, 'live', 1);
    }).catch((e) => { n.error = `Camera: ${e.message || e}`; ctx.out(n, 'live', 0); ctx.dirty.add(n.id); });
  },
  render(n, ctx) { return n.state.el ? videoFrameUploader(n, ctx, n.state.el) : null; },
  destroy(n) {
    n.state.stream?.getTracks().forEach((t) => t.stop());
    if (n.state.el) n.state.el.srcObject = null;
    n.state.el = null;
    n.state.stream = null;
    n.state.key = null;
  },
});

/** Generator helper: renders a shader at a chosen resolution. */
function genNode({ type, name, description, keywords, inputs, body, uniforms }) {
  const fs = fx(body);
  defineNode({
    type, name, category: SRC, description, keywords, preview: true,
    inputs: [...inputs, resInput],
    outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
    render(n, ctx) {
      const [w, h] = sizeFrom(n, ctx);
      const t = ctx.target(n, 'out', w, h);
      ctx.renderer.draw(fs, { uRes: [w, h], uTime: ctx.time, ...uniforms(n, ctx) }, t);
      return t;
    },
  });
}

genNode({
  type: 'src.color', name: 'Solid Colour', description: 'A flat colour field.',
  keywords: ['color', 'colour', 'fill', 'background', 'blackout'],
  inputs: [{ id: 'color', name: 'Colour', type: 'color', default: '#ffffff' }, { id: 'alpha', name: 'Opacity %', type: 'number', default: 100, min: 0, max: 100 }],
  body: `uniform vec3 uCol; uniform float uA; vec4 effect(vec2 uv){ return vec4(uCol, uA); }`,
  uniforms: (n) => ({ uCol: rgb(n.inputs.color).slice(0, 3), uA: n.inputs.alpha / 100 }),
});

genNode({
  type: 'src.gradient', name: 'Gradient', description: 'Linear, radial or angular colour gradient that can rotate and animate.',
  keywords: ['ramp', 'blend', 'background', 'radial'],
  inputs: [
    { id: 'kind', name: 'Type', type: 'enum', options: ['linear', 'radial', 'angular', 'diamond'], default: 'linear' },
    { id: 'a', name: 'Colour A', type: 'color', default: '#0b1b3a' },
    { id: 'b', name: 'Colour B', type: 'color', default: '#ff4f8b' },
    { id: 'angle', name: 'Angle', type: 'number', default: 90, min: -360, max: 360 },
    { id: 'cx', name: 'Centre X', type: 'number', default: 50 },
    { id: 'cy', name: 'Centre Y', type: 'number', default: 50 },
    { id: 'scale', name: 'Scale %', type: 'number', default: 100, min: 1 },
    { id: 'speed', name: 'Cycle Speed', type: 'number', default: 0, step: 0.01 },
  ],
  body: `uniform vec3 uA; uniform vec3 uB; uniform float uAng; uniform vec2 uC; uniform float uScale; uniform float uSpeed; uniform int uKind;
  vec4 effect(vec2 uv){
    vec2 p = uv - uC; p.x *= uRes.x / uRes.y;
    float t;
    if (uKind == 0) t = dot(p, vec2(cos(uAng), sin(uAng))) / uScale + 0.5;
    else if (uKind == 1) t = length(p) / uScale * 1.4;
    else if (uKind == 2) t = atan(p.y, p.x) / 6.28318 + 0.5 + uAng / 6.28318;
    else t = (abs(p.x) + abs(p.y)) / uScale;
    t = fract(t + uTime * uSpeed);
    if (uSpeed != 0.0) t = 1.0 - abs(t * 2.0 - 1.0);
    t = clamp(t, 0.0, 1.0);
    return vec4(mix(uA, uB, smoothstep(0.0, 1.0, t)), 1.0);
  }`,
  uniforms: (n) => {
    const i = n.inputs;
    return { uA: rgb(i.a).slice(0, 3), uB: rgb(i.b).slice(0, 3), uAng: (i.angle * Math.PI) / 180, uC: [i.cx / 100, 1 - i.cy / 100], uScale: i.scale / 100, uSpeed: i.speed, uKind: ['linear', 'radial', 'angular', 'diamond'].indexOf(i.kind) };
  },
});

genNode({
  type: 'src.noise', name: 'Noise', description: 'Animated fractal noise — clouds, smoke, organic textures and displacement maps.',
  keywords: ['perlin', 'fbm', 'clouds', 'texture', 'organic', 'smoke'],
  inputs: [
    { id: 'scale', name: 'Scale', type: 'number', default: 4, min: 0.1, step: 0.1 },
    { id: 'speed', name: 'Speed', type: 'number', default: 0.2, step: 0.01 },
    { id: 'oct', name: 'Detail', type: 'number', default: 5, min: 1, max: 8, int: true },
    { id: 'contrast', name: 'Contrast', type: 'number', default: 1, min: 0, max: 5, step: 0.05 },
    { id: 'warp', name: 'Domain Warp', type: 'number', default: 0.5, min: 0, max: 4, step: 0.05 },
    { id: 'a', name: 'Colour A', type: 'color', default: '#000000' },
    { id: 'b', name: 'Colour B', type: 'color', default: '#ffffff' },
  ],
  body: `uniform float uScale; uniform float uSpeed; uniform int uOct; uniform float uContrast; uniform float uWarp; uniform vec3 uA; uniform vec3 uB;
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 8; i++){ if (i >= uOct) break; v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
  vec4 effect(vec2 uv){
    vec2 p = uv * uScale; p.x *= uRes.x / uRes.y;
    float t = uTime * uSpeed;
    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    float v = fbm(p + uWarp * q + t * 0.5);
    v = clamp((v - 0.5) * uContrast + 0.5, 0.0, 1.0);
    return vec4(mix(uA, uB, v), 1.0);
  }`,
  uniforms: (n) => { const i = n.inputs; return { uScale: i.scale, uSpeed: i.speed, uOct: i.oct, uContrast: i.contrast, uWarp: i.warp, uA: rgb(i.a).slice(0, 3), uB: rgb(i.b).slice(0, 3) }; },
});

genNode({
  type: 'src.pattern', name: 'Pattern', description: 'Geometric patterns: stripes, checkerboard, dots, grid, rings and spiral.',
  keywords: ['stripes', 'checker', 'dots', 'grid', 'spiral', 'rings', 'test'],
  inputs: [
    { id: 'kind', name: 'Pattern', type: 'enum', options: ['stripes', 'checker', 'dots', 'grid', 'rings', 'spiral'], default: 'stripes' },
    { id: 'count', name: 'Repeats', type: 'number', default: 10, min: 1 },
    { id: 'width', name: 'Thickness %', type: 'number', default: 50, min: 0, max: 100 },
    { id: 'angle', name: 'Angle', type: 'number', default: 0 },
    { id: 'speed', name: 'Speed', type: 'number', default: 0.1, step: 0.01 },
    { id: 'soft', name: 'Softness', type: 'number', default: 2, min: 0, max: 100 },
    { id: 'a', name: 'Colour A', type: 'color', default: '#000000' },
    { id: 'b', name: 'Colour B', type: 'color', default: '#ffffff' },
  ],
  body: `uniform int uKind; uniform float uCount; uniform float uWidth; uniform float uAng; uniform float uSpeed; uniform float uSoft; uniform vec3 uA; uniform vec3 uB;
  float band(float x){ float f = fract(x); float s = max(uSoft * 0.005, fwidth(x)); return smoothstep(uWidth - s, uWidth + s, f) * (1.0 - smoothstep(1.0 - s, 1.0, f)); }
  vec4 effect(vec2 uv){
    vec2 p = uv - 0.5; p.x *= uRes.x / uRes.y; p = rot(p, uAng);
    float t = uTime * uSpeed, v = 0.0;
    if (uKind == 0) v = band(p.x * uCount + t);
    else if (uKind == 1) v = abs(step(0.5, fract(p.x * uCount * 0.5 + t)) - step(0.5, fract(p.y * uCount * 0.5)));
    else if (uKind == 2) { vec2 g = fract(p * uCount + vec2(t, 0.0)) - 0.5; float s = max(uSoft * 0.005, 0.01); v = 1.0 - smoothstep(uWidth * 0.5 - s, uWidth * 0.5 + s, length(g)); }
    else if (uKind == 3) { vec2 g = abs(fract(p * uCount + t) - 0.5); float d = 0.5 - max(g.x, g.y); float s = max(uSoft * 0.005, 0.01); v = 1.0 - smoothstep(uWidth * 0.25, uWidth * 0.25 + s, d); }
    else if (uKind == 4) v = band(length(p) * uCount - t);
    else v = band(atan(p.y, p.x) / 6.28318 * 3.0 + length(p) * uCount - t);
    return vec4(mix(uA, uB, clamp(v, 0.0, 1.0)), 1.0);
  }`,
  uniforms: (n) => { const i = n.inputs; return { uKind: ['stripes', 'checker', 'dots', 'grid', 'rings', 'spiral'].indexOf(i.kind), uCount: i.count, uWidth: i.width / 100, uAng: (i.angle * Math.PI) / 180, uSpeed: i.speed, uSoft: i.soft, uA: rgb(i.a).slice(0, 3), uB: rgb(i.b).slice(0, 3) }; },
});

genNode({
  type: 'src.shape', name: 'Shapes', description: 'Draws a rectangle, ellipse, triangle, polygon, star, ring or line with soft edges.',
  keywords: ['rectangle', 'circle', 'ellipse', 'polygon', 'star', 'mask', 'geometry'],
  inputs: [
    { id: 'kind', name: 'Shape', type: 'enum', options: ['rectangle', 'ellipse', 'triangle', 'polygon', 'star', 'ring', 'line'], default: 'ellipse' },
    { id: 'w', name: 'Width %', type: 'number', default: 40, min: 0 },
    { id: 'h', name: 'Height %', type: 'number', default: 40, min: 0 },
    { id: 'x', name: 'Horz Pos', type: 'number', default: 0 },
    { id: 'y', name: 'Vert Pos', type: 'number', default: 0 },
    { id: 'rot', name: 'Rotation', type: 'number', default: 0 },
    { id: 'fill', name: 'Fill Colour', type: 'color', default: '#ffffff' },
    { id: 'line', name: 'Outline Only %', type: 'number', default: 0, min: 0, max: 50 },
    { id: 'soft', name: 'Softness %', type: 'number', default: 0.5, min: 0, max: 50, step: 0.1 },
    { id: 'sides', name: 'Sides / Points', type: 'number', default: 5, min: 3, max: 64, int: true },
    { id: 'inner', name: 'Star Inner %', type: 'number', default: 45, min: 1, max: 100 },
    { id: 'bg', name: 'Background', type: 'color', default: '#00000000' },
  ],
  body: `uniform int uKind; uniform vec2 uSize; uniform vec2 uPos; uniform float uRot; uniform vec4 uFill; uniform vec4 uBg; uniform float uLine; uniform float uSoft; uniform float uSides; uniform float uInner;
  float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  float sdPoly(vec2 p, float n, float r){ float a = atan(p.x, p.y) + 3.14159; float k = 6.28318 / n; return cos(floor(0.5 + a / k) * k - a) * length(p) - r; }
  float sdStar(vec2 p, float n, float r, float ri){
    float k = 3.14159 / n; float a = mod(atan(p.x, p.y) + k, 2.0 * k) - k;
    vec2 q = length(p) * vec2(cos(a), abs(sin(a)));
    vec2 A = vec2(r, 0.0), B = vec2(ri * cos(k), ri * sin(k));
    vec2 e = B - A, w = q - A; float t = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float d = length(w - e * t);
    float s = sign(e.x * w.y - e.y * w.x);
    return d * -s;
  }
  vec4 effect(vec2 uv){
    float asp = uRes.x / uRes.y;
    vec2 p = uv - 0.5 - uPos; p.x *= asp; p = rot(p, -uRot);
    vec2 sz = uSize * vec2(asp, 1.0) * 0.5;
    float d;
    if (uKind == 0) d = sdBox(p, sz);
    else if (uKind == 1) { vec2 q = p / max(sz, 1e-4); d = (length(q) - 1.0) * min(sz.x, sz.y); }
    else if (uKind == 2) { vec2 q = p / max(sz, 1e-4); d = sdPoly(vec2(q.x, q.y + 0.25), 3.0, 0.5) * min(sz.x, sz.y) * 2.0; }
    else if (uKind == 3) { vec2 q = p / max(sz, 1e-4); d = sdPoly(q, uSides, 0.9) * min(sz.x, sz.y); }
    else if (uKind == 4) { vec2 q = p / max(sz, 1e-4); d = sdStar(q, uSides, 1.0, uInner) * min(sz.x, sz.y); }
    else if (uKind == 5) { vec2 q = p / max(sz, 1e-4); d = abs(length(q) - 0.8) * min(sz.x, sz.y) - 0.2 * min(sz.x, sz.y); }
    else d = sdBox(p, vec2(sz.x, max(sz.y * 0.05, 0.002)));
    if (uLine > 0.0) d = abs(d) - uLine * min(sz.x, sz.y);
    float s = max(uSoft, 0.0015);
    float a = 1.0 - smoothstep(-s, s, d);
    vec4 fg = vec4(uFill.rgb, uFill.a * a);
    return vec4(mix(uBg.rgb, fg.rgb, fg.a), max(uBg.a, fg.a));
  }`,
  uniforms: (n) => {
    const i = n.inputs;
    return {
      uKind: ['rectangle', 'ellipse', 'triangle', 'polygon', 'star', 'ring', 'line'].indexOf(i.kind),
      uSize: [i.w / 100, i.h / 100], uPos: [i.x / 200, -i.y / 200], uRot: (i.rot * Math.PI) / 180,
      uFill: rgb(i.fill), uBg: rgb(i.bg), uLine: i.line / 100, uSoft: i.soft / 100, uSides: i.sides, uInner: i.inner / 100,
    };
  },
});

defineNode({
  type: 'src.text', name: 'Text Draw', category: SRC, preview: true,
  description: 'Renders text with any installed font — titles, surtitles, live data readouts.',
  keywords: ['text', 'type', 'font', 'title', 'subtitle', 'caption', 'words'],
  inputs: [
    { id: 'text', name: 'Text', type: 'text', default: 'KamiCreative' },
    { id: 'font', name: 'Font', type: 'text', default: 'Segoe UI, Helvetica, Arial, sans-serif' },
    { id: 'size', name: 'Size %', type: 'number', default: 12, min: 0.5, max: 100, step: 0.1 },
    { id: 'weight', name: 'Weight', type: 'enum', options: ['300', '400', '600', '700', '900'], default: '700' },
    { id: 'italic', name: 'Italic', type: 'bool', default: 0 },
    { id: 'color', name: 'Colour', type: 'color', default: '#ffffff' },
    { id: 'align', name: 'Align', type: 'enum', options: ['center', 'left', 'right'], default: 'center' },
    { id: 'x', name: 'Horz Pos', type: 'number', default: 0 },
    { id: 'y', name: 'Vert Pos', type: 'number', default: 0 },
    { id: 'lead', name: 'Line Spacing %', type: 'number', default: 120, min: 50, max: 400 },
    { id: 'track', name: 'Tracking', type: 'number', default: 0, min: -50, max: 200 },
    { id: 'shadow', name: 'Shadow', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'bg', name: 'Background', type: 'color', default: '#00000000' },
    resInput,
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state = { canvas: document.createElement('canvas'), key: '' }; },
  render(n, ctx) {
    const [w, h] = sizeFrom(n, ctx);
    const i = n.inputs;
    const key = JSON.stringify([w, h, i]);
    const t = ctx.target(n, 'out', w, h);
    if (key === n.state.key) return t;
    n.state.key = key;
    const c = n.state.canvas;
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const bg = rgb(i.bg);
    if (bg[3] > 0) { g.fillStyle = i.bg.length > 7 ? `rgba(${bg[0] * 255},${bg[1] * 255},${bg[2] * 255},${bg[3]})` : i.bg; g.fillRect(0, 0, w, h); }
    const px = (i.size / 100) * h;
    g.font = `${i.italic ? 'italic ' : ''}${i.weight} ${px}px ${i.font}`;
    if ('letterSpacing' in g) g.letterSpacing = `${(i.track / 100) * px}px`;
    g.fillStyle = i.color;
    g.textAlign = i.align;
    g.textBaseline = 'middle';
    if (i.shadow > 0) { g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = (i.shadow / 100) * px; g.shadowOffsetY = (i.shadow / 400) * px; }
    const lines = String(i.text).split(/\\n|\n/);
    const lh = px * (i.lead / 100);
    const ax = i.align === 'left' ? w * 0.05 : i.align === 'right' ? w * 0.95 : w / 2;
    const x = ax + (i.x / 200) * w;
    const y0 = h / 2 + (i.y / 200) * h - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, k) => g.fillText(ln, x, y0 + k * lh));
    t.upload(c);
    return t;
  },
});

const DEFAULT_SHADER = `// KamiCreative GLSL module.
// Available: uTex0, uTex1 (video inputs), uTime, uRes, uP1..uP4 (0-100 sliders)
// Helpers: luma(), rgb2hsv(), hsv2rgb(), rot(), vnoise(), hash21()
vec4 effect(vec2 uv) {
  vec2 p = uv - 0.5;
  p.x *= uRes.x / uRes.y;
  float r = length(p);
  float a = atan(p.y, p.x);
  float v = sin(r * (10.0 + uP1 * 0.4) - uTime * 2.0 + sin(a * 6.0 + uTime) * uP2 * 0.05);
  vec3 col = hsv2rgb(vec3(fract(uTime * 0.05 + r * 0.3), 0.7, 0.5 + 0.5 * v));
  vec4 src = texture(uTex0, uv);
  return vec4(mix(col, src.rgb, uP3 / 100.0), 1.0);
}`;

defineNode({
  type: 'src.shader', name: 'GLSL Shader', category: SRC, preview: true,
  description: 'Write your own fragment shader. Edit the code in the Inspector; errors appear on the module.',
  keywords: ['glsl', 'shader', 'code', 'custom', 'program', 'shadertoy'],
  props: { code: DEFAULT_SHADER },
  inputs: [
    { id: 'v0', name: 'Video 1', type: 'video' },
    { id: 'v1', name: 'Video 2', type: 'video' },
    { id: 'p1', name: 'Param 1', type: 'number', default: 50, min: 0, max: 100 },
    { id: 'p2', name: 'Param 2', type: 'number', default: 50, min: 0, max: 100 },
    { id: 'p3', name: 'Param 3', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'p4', name: 'Param 4', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'speed', name: 'Time Speed', type: 'number', default: 1, step: 0.01 },
    resInput,
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state.t = 0; },
  propChanged(n, ctx, key) { if (key === 'code') { n.state.fs = null; n.error = null; } },
  tick(n, ctx) { n.state.t += ctx.dt * n.inputs.speed; },
  render(n, ctx) {
    if (!n.state.fs) {
      const code = n.model.props?.code || DEFAULT_SHADER;
      const lib = SHADER_LIB + '\n';
      n.state.fs = fragment(lib + code);
      n.state.lineOffset = FRAG_PREFIX_LINES + lib.split('\n').length - 1;
    }
    const t0 = ctx.texture(n, 'v0'), t1 = ctx.texture(n, 'v1');
    const [w, h] = t0 && n.inputs.res === 'stage' ? [t0.width, t0.height] : sizeFrom(n, ctx);
    const t = ctx.target(n, 'out', w, h);
    const i = n.inputs;
    const ok = ctx.renderer.draw(n.state.fs, { uTex0: t0, uTex1: t1, uRes: [w, h], uTime: n.state.t, uP1: i.p1, uP2: i.p2, uP3: i.p3, uP4: i.p4 }, t);
    if (!ok) {
      const err = ctx.renderer.programError(n.state.fs) || 'Shader error';
      n.error = err.replace(/\u0000/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' · ').replace(/ERROR: 0:(\d+):/g, (_, l) => `line ${Math.max(1, +l - n.state.lineOffset)}:`);
      return null;
    }
    n.error = null;
    return t;
  },
});

defineNode({
  type: 'src.grab', name: 'Stage Grabber', category: SRC, preview: true,
  description: 'Feeds a stage\'s previous composite back into the patch — for feedback, echoes and stage-to-stage routing.',
  keywords: ['capture', 'stage', 'feedback', 'recursive', 'output', 'grab'],
  inputs: [{ id: 'stage', name: 'Stage #', type: 'number', default: 1, min: 1, int: true }],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const src = ctx.host.stageComposite?.(n.inputs.stage);
    if (!src) return null;
    const t = ctx.target(n, 'out', src.width, src.height);
    ctx.renderer.copy(src, t);
    return t;
  },
});

// ---------------------------------------------------------------------- FX

fxNode({
  type: 'fx.color', name: 'Colour Adjust', description: 'Brightness, contrast, saturation, hue and gamma in one module.',
  keywords: ['brightness', 'contrast', 'saturation', 'hue', 'gamma', 'grade', 'correct'],
  inputs: [
    { id: 'bri', name: 'Brightness', type: 'number', default: 0, min: -100, max: 100 },
    { id: 'con', name: 'Contrast', type: 'number', default: 0, min: -100, max: 100 },
    { id: 'sat', name: 'Saturation %', type: 'number', default: 100, min: 0, max: 400 },
    { id: 'hue', name: 'Hue Shift', type: 'number', default: 0, min: -180, max: 180 },
    { id: 'gamma', name: 'Gamma', type: 'number', default: 1, min: 0.1, max: 5, step: 0.01 },
    { id: 'opacity', name: 'Opacity %', type: 'number', default: 100, min: 0, max: 100 },
  ],
  body: `uniform float uBri, uCon, uSat, uHue, uGam, uOp;
  vec4 effect(vec2 uv){
    vec4 c = texture(uTex, uv);
    vec3 col = c.rgb + uBri;
    col = (col - 0.5) * uCon + 0.5;
    vec3 hsv = rgb2hsv(clamp(col, 0.0, 1.0)); hsv.x = fract(hsv.x + uHue); hsv.y *= uSat;
    col = hsv2rgb(clamp(hsv, vec3(0.0), vec3(1.0, 1.0, 10.0)));
    col = pow(max(col, 0.0), vec3(1.0 / uGam));
    return vec4(col, c.a * uOp);
  }`,
  uniforms: (n) => { const i = n.inputs; return { uBri: i.bri / 100, uCon: Math.max(0, 1 + i.con / 100) ** 2, uSat: i.sat / 100, uHue: i.hue / 360, uGam: i.gamma, uOp: i.opacity / 100 }; },
});

fxNode({
  type: 'fx.levels', name: 'Levels', description: 'Input black / white points, gamma and output range — classic levels control.',
  keywords: ['levels', 'curves', 'black point', 'white point', 'grade'],
  inputs: [
    { id: 'inB', name: 'In Black', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'inW', name: 'In White', type: 'number', default: 100, min: 0, max: 100 },
    { id: 'gamma', name: 'Gamma', type: 'number', default: 1, min: 0.1, max: 5, step: 0.01 },
    { id: 'outB', name: 'Out Black', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'outW', name: 'Out White', type: 'number', default: 100, min: 0, max: 100 },
  ],
  body: `uniform float uIB, uIW, uG, uOB, uOW;
  vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); vec3 v = clamp((c.rgb - uIB) / max(uIW - uIB, 1e-3), 0.0, 1.0); v = pow(v, vec3(1.0 / uG)); return vec4(mix(vec3(uOB), vec3(uOW), v), c.a); }`,
  uniforms: (n) => { const i = n.inputs; return { uIB: i.inB / 100, uIW: i.inW / 100, uG: i.gamma, uOB: i.outB / 100, uOW: i.outW / 100 }; },
});

fxNode({
  type: 'fx.tint', name: 'Colourise', description: 'Tints the image towards a colour, or maps its brightness onto a two-colour duotone.',
  keywords: ['tint', 'duotone', 'colorize', 'sepia', 'monochrome'],
  inputs: [
    { id: 'mode', name: 'Mode', type: 'enum', options: ['tint', 'duotone'], default: 'tint' },
    { id: 'a', name: 'Colour', type: 'color', default: '#ff4f8b' },
    { id: 'b', name: 'Shadow (duotone)', type: 'color', default: '#101030' },
    { id: 'amt', name: 'Amount %', type: 'number', default: 100, min: 0, max: 100 },
  ],
  body: `uniform vec3 uA, uB; uniform float uAmt; uniform int uMode;
  vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); float l = luma(c.rgb); vec3 t = uMode == 0 ? uA * l : mix(uB, uA, l); return vec4(mix(c.rgb, t, uAmt), c.a); }`,
  uniforms: (n) => { const i = n.inputs; return { uA: rgb(i.a).slice(0, 3), uB: rgb(i.b).slice(0, 3), uAmt: i.amt / 100, uMode: i.mode === 'tint' ? 0 : 1 }; },
});

fxNode({
  type: 'fx.invert', name: 'Invert', description: 'Inverts colours (negative).',
  keywords: ['negative', 'invert', 'reverse'],
  inputs: [{ id: 'amt', name: 'Amount %', type: 'number', default: 100, min: 0, max: 100 }],
  body: `uniform float uAmt; vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); return vec4(mix(c.rgb, 1.0 - c.rgb, uAmt), c.a); }`,
  uniforms: (n) => ({ uAmt: n.inputs.amt / 100 }),
});

fxNode({
  type: 'fx.threshold', name: 'Threshold', description: 'Turns the image into two colours split at a brightness level.',
  keywords: ['black white', 'binary', 'high contrast', 'mask'],
  inputs: [
    { id: 'level', name: 'Level %', type: 'number', default: 50, min: 0, max: 100 },
    { id: 'soft', name: 'Softness %', type: 'number', default: 2, min: 0, max: 50 },
    { id: 'lo', name: 'Dark Colour', type: 'color', default: '#000000' },
    { id: 'hi', name: 'Light Colour', type: 'color', default: '#ffffff' },
  ],
  body: `uniform float uL, uS; uniform vec3 uLo, uHi; vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); float v = smoothstep(uL - uS, uL + uS + 1e-4, luma(c.rgb)); return vec4(mix(uLo, uHi, v), c.a); }`,
  uniforms: (n) => { const i = n.inputs; return { uL: i.level / 100, uS: i.soft / 100, uLo: rgb(i.lo).slice(0, 3), uHi: rgb(i.hi).slice(0, 3) }; },
});

fxNode({
  type: 'fx.posterize', name: 'Posterise', description: 'Reduces the number of colour levels for a graphic look.',
  keywords: ['posterize', 'quantize', 'levels', 'cartoon'],
  inputs: [{ id: 'levels', name: 'Levels', type: 'number', default: 5, min: 2, max: 64, int: true }],
  body: `uniform float uN; vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); return vec4(floor(c.rgb * uN) / (uN - 1.0), c.a); }`,
  uniforms: (n) => ({ uN: n.inputs.levels }),
});

fxNode({
  type: 'fx.pixelate', name: 'Pixelate', description: 'Mosaic / blocky pixel effect.',
  keywords: ['mosaic', 'pixel', 'blocks', 'censor', '8bit'],
  inputs: [{ id: 'size', name: 'Block Size', type: 'number', default: 16, min: 1, max: 512 }],
  body: `uniform float uS; vec4 effect(vec2 uv){ vec2 b = uS / uRes; return texture(uTex, (floor(uv / b) + 0.5) * b); }`,
  uniforms: (n) => ({ uS: n.inputs.size }),
});

fxNode({
  type: 'fx.halftone', name: 'Halftone', description: 'Print-style halftone dots driven by brightness.',
  keywords: ['dots', 'print', 'comic', 'newspaper'],
  inputs: [
    { id: 'size', name: 'Dot Spacing', type: 'number', default: 12, min: 2, max: 200 },
    { id: 'angle', name: 'Angle', type: 'number', default: 45 },
    { id: 'ink', name: 'Ink', type: 'color', default: '#000000' },
    { id: 'paper', name: 'Paper', type: 'color', default: '#f4efe4' },
    { id: 'color', name: 'Keep Colour', type: 'bool', default: 0 },
  ],
  body: `uniform float uS, uA; uniform vec3 uInk, uPaper; uniform float uCol;
  vec4 effect(vec2 uv){
    vec2 px = rot(uv * uRes, uA); vec2 cell = floor(px / uS) * uS + uS * 0.5;
    vec2 suv = rot(cell, -uA) / uRes; vec4 c = texture(uTex, suv);
    float r = sqrt(1.0 - luma(c.rgb)) * uS * 0.7;
    float d = length(px - cell); float a = 1.0 - smoothstep(r - 1.0, r + 1.0, d);
    vec3 ink = mix(uInk, c.rgb, uCol);
    return vec4(mix(uPaper, ink, a), 1.0);
  }`,
  uniforms: (n) => { const i = n.inputs; return { uS: i.size, uA: (i.angle * Math.PI) / 180, uInk: rgb(i.ink).slice(0, 3), uPaper: rgb(i.paper).slice(0, 3), uCol: i.color }; },
});

fxNode({
  type: 'fx.edge', name: 'Edge Detect', description: 'Sobel edge detection — outlines and line-art looks.',
  keywords: ['sobel', 'outline', 'lines', 'sketch', 'contour'],
  inputs: [
    { id: 'amt', name: 'Strength', type: 'number', default: 2, min: 0, max: 20, step: 0.1 },
    { id: 'mix', name: 'Mix Original %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'invert', name: 'Invert', type: 'bool', default: 0 },
  ],
  body: `uniform float uAmt, uMix, uInv;
  vec4 effect(vec2 uv){
    vec2 o = 1.0 / uRes;
    float tl = luma(texture(uTex, uv + o * vec2(-1, 1)).rgb), t = luma(texture(uTex, uv + o * vec2(0, 1)).rgb), tr = luma(texture(uTex, uv + o * vec2(1, 1)).rgb);
    float l = luma(texture(uTex, uv + o * vec2(-1, 0)).rgb), r = luma(texture(uTex, uv + o * vec2(1, 0)).rgb);
    float bl = luma(texture(uTex, uv + o * vec2(-1, -1)).rgb), b = luma(texture(uTex, uv + o * vec2(0, -1)).rgb), br = luma(texture(uTex, uv + o * vec2(1, -1)).rgb);
    float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
    float e = clamp(length(vec2(gx, gy)) * uAmt, 0.0, 1.0);
    if (uInv > 0.5) e = 1.0 - e;
    vec4 c = texture(uTex, uv);
    return vec4(mix(vec3(e), c.rgb * e, uMix), c.a);
  }`,
  uniforms: (n) => ({ uAmt: n.inputs.amt, uMix: n.inputs.mix / 100, uInv: n.inputs.invert }),
});

fxNode({
  type: 'fx.chroma', name: 'Chroma Key', description: 'Removes a background colour (green / blue screen) leaving transparency.',
  keywords: ['green screen', 'blue screen', 'key', 'matte', 'transparent'],
  inputs: [
    { id: 'key', name: 'Key Colour', type: 'color', default: '#00ff00' },
    { id: 'tol', name: 'Tolerance %', type: 'number', default: 30, min: 0, max: 100 },
    { id: 'soft', name: 'Softness %', type: 'number', default: 10, min: 0, max: 100 },
    { id: 'spill', name: 'Spill Suppress %', type: 'number', default: 50, min: 0, max: 100 },
  ],
  body: `uniform vec3 uKey; uniform float uTol, uSoft, uSpill;
  vec2 cbcr(vec3 c){ return vec2(-0.169 * c.r - 0.331 * c.g + 0.5 * c.b, 0.5 * c.r - 0.419 * c.g - 0.081 * c.b); }
  vec4 effect(vec2 uv){
    vec4 c = texture(uTex, uv);
    float d = distance(cbcr(c.rgb), cbcr(uKey));
    float a = smoothstep(uTol * 0.5, uTol * 0.5 + uSoft * 0.5 + 1e-4, d);
    vec3 col = c.rgb;
    float m = max(col.r, col.b);
    if (uKey.g > uKey.r && uKey.g > uKey.b) col.g = mix(col.g, min(col.g, m), uSpill);
    else if (uKey.b > uKey.r) col.b = mix(col.b, min(col.b, max(col.r, col.g)), uSpill);
    return vec4(col, c.a * a);
  }`,
  uniforms: (n) => { const i = n.inputs; return { uKey: rgb(i.key).slice(0, 3), uTol: i.tol / 100, uSoft: i.soft / 100, uSpill: i.spill / 100 }; },
});

fxNode({
  type: 'fx.lumakey', name: 'Luma Key', description: 'Makes dark (or bright) areas transparent.',
  keywords: ['key', 'luminance', 'black', 'transparent', 'matte'],
  inputs: [
    { id: 'level', name: 'Threshold %', type: 'number', default: 10, min: 0, max: 100 },
    { id: 'soft', name: 'Softness %', type: 'number', default: 10, min: 0, max: 100 },
    { id: 'invert', name: 'Key Out Bright', type: 'bool', default: 0 },
  ],
  body: `uniform float uL, uS, uI; vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); float l = luma(c.rgb); if (uI > 0.5) l = 1.0 - l; return vec4(c.rgb, c.a * smoothstep(uL, uL + uS + 1e-4, l)); }`,
  uniforms: (n) => ({ uL: n.inputs.level / 100, uS: n.inputs.soft / 100, uI: n.inputs.invert }),
});

fxNode({
  type: 'fx.transform', name: 'Transform', description: 'Zoom, move and rotate the image inside its frame, with wrap modes for tiling.',
  keywords: ['zoom', 'scale', 'move', 'rotate', 'position', 'pan'],
  inputs: [
    { id: 'zoom', name: 'Zoom %', type: 'number', default: 100, min: 1 },
    { id: 'x', name: 'Horz Pos', type: 'number', default: 0 },
    { id: 'y', name: 'Vert Pos', type: 'number', default: 0 },
    { id: 'rot', name: 'Rotation', type: 'number', default: 0 },
    { id: 'wrap', name: 'Edges', type: 'enum', options: ['transparent', 'clamp', 'repeat', 'mirror'], default: 'transparent' },
  ],
  body: `uniform float uZ, uR; uniform vec2 uP; uniform int uW;
  vec4 effect(vec2 uv){
    float asp = uRes.x / uRes.y;
    vec2 p = uv - 0.5 - uP; p.x *= asp; p = rot(p, -uR) / uZ; p.x /= asp; p += 0.5;
    if (uW == 0 && (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0)) return vec4(0.0);
    if (uW == 2) p = fract(p);
    if (uW == 3) p = 1.0 - abs(mod(p, 2.0) - 1.0);
    return texture(uTex, clamp(p, 0.0, 1.0));
  }`,
  uniforms: (n) => { const i = n.inputs; return { uZ: i.zoom / 100, uR: (i.rot * Math.PI) / 180, uP: [i.x / 200, -i.y / 200], uW: ['transparent', 'clamp', 'repeat', 'mirror'].indexOf(i.wrap) }; },
});

fxNode({
  type: 'fx.crop', name: 'Crop', description: 'Crops the edges of the image (cropped area becomes transparent).',
  keywords: ['trim', 'mask', 'border', 'cut'],
  inputs: [
    { id: 'l', name: 'Left %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'r', name: 'Right %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 't', name: 'Top %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'b', name: 'Bottom %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'soft', name: 'Feather %', type: 'number', default: 0, min: 0, max: 50 },
  ],
  body: `uniform vec4 uC; uniform float uF;
  vec4 effect(vec2 uv){ float f = max(uF, 1e-4);
    float a = smoothstep(uC.x, uC.x + f, uv.x) * smoothstep(uC.y, uC.y + f, 1.0 - uv.x) * smoothstep(uC.w, uC.w + f, uv.y) * smoothstep(uC.z, uC.z + f, 1.0 - uv.y);
    vec4 c = texture(uTex, uv); return vec4(c.rgb, c.a * a); }`,
  uniforms: (n) => { const i = n.inputs; return { uC: [i.l / 100, i.r / 100, i.t / 100, i.b / 100], uF: i.soft / 100 }; },
});

fxNode({
  type: 'fx.kaleido', name: 'Kaleidoscope', description: 'Mirrors wedges of the image around a centre point.',
  keywords: ['mirror', 'symmetry', 'mandala', 'psychedelic'],
  inputs: [
    { id: 'seg', name: 'Segments', type: 'number', default: 6, min: 1, max: 64, int: true },
    { id: 'rot', name: 'Rotation', type: 'number', default: 0 },
    { id: 'spin', name: 'Spin Speed', type: 'number', default: 0.05, step: 0.01 },
    { id: 'zoom', name: 'Zoom %', type: 'number', default: 100, min: 1 },
    { id: 'cx', name: 'Source X', type: 'number', default: 50 },
    { id: 'cy', name: 'Source Y', type: 'number', default: 50 },
  ],
  body: `uniform float uSeg, uRot, uZ; uniform vec2 uC;
  vec4 effect(vec2 uv){
    vec2 p = uv - 0.5; p.x *= uRes.x / uRes.y;
    float r = length(p) / uZ, a = atan(p.y, p.x) + uRot;
    float k = 3.14159 / uSeg; a = mod(a, 2.0 * k); a = abs(a - k);
    vec2 q = vec2(cos(a), sin(a)) * r; q.x /= uRes.x / uRes.y;
    return texture(uTex, 1.0 - abs(mod(q + uC, 2.0) - 1.0));
  }`,
  uniforms: (n, ctx) => { const i = n.inputs; return { uSeg: i.seg, uRot: (i.rot * Math.PI) / 180 + ctx.time * i.spin * Math.PI * 2, uZ: i.zoom / 100, uC: [i.cx / 100, 1 - i.cy / 100] }; },
});

fxNode({
  type: 'fx.mirror', name: 'Mirror', description: 'Reflects one half (or quarter) of the image onto the other.',
  keywords: ['reflect', 'symmetry', 'flip'],
  inputs: [{ id: 'mode', name: 'Mode', type: 'enum', options: ['left → right', 'right → left', 'top → bottom', 'bottom → top', 'quad', 'flip horizontal', 'flip vertical'], default: 'left → right' }],
  body: `uniform int uM;
  vec4 effect(vec2 uv){ vec2 p = uv;
    if (uM == 0) p.x = p.x > 0.5 ? 1.0 - p.x : p.x; else if (uM == 1) p.x = p.x < 0.5 ? 1.0 - p.x : p.x;
    else if (uM == 2) p.y = p.y < 0.5 ? 1.0 - p.y : p.y; else if (uM == 3) p.y = p.y > 0.5 ? 1.0 - p.y : p.y;
    else if (uM == 4) p = vec2(p.x > 0.5 ? 1.0 - p.x : p.x, p.y < 0.5 ? 1.0 - p.y : p.y);
    else if (uM == 5) p.x = 1.0 - p.x; else p.y = 1.0 - p.y;
    return texture(uTex, p); }`,
  uniforms: (n) => ({ uM: ['left → right', 'right → left', 'top → bottom', 'bottom → top', 'quad', 'flip horizontal', 'flip vertical'].indexOf(n.inputs.mode) }),
});

fxNode({
  type: 'fx.tile', name: 'Tile', description: 'Repeats the image in a grid, optionally mirroring alternate tiles.',
  keywords: ['repeat', 'grid', 'wall', 'video wall', 'multiply'],
  inputs: [
    { id: 'h', name: 'Columns', type: 'number', default: 3, min: 1, max: 64 },
    { id: 'v', name: 'Rows', type: 'number', default: 3, min: 1, max: 64 },
    { id: 'mirror', name: 'Mirror Alternate', type: 'bool', default: 0 },
    { id: 'gap', name: 'Gap %', type: 'number', default: 0, min: 0, max: 45 },
  ],
  body: `uniform vec2 uN; uniform float uMir, uGap;
  vec4 effect(vec2 uv){ vec2 g = uv * uN; vec2 cell = floor(g); vec2 f = fract(g);
    if (uMir > 0.5) { if (mod(cell.x, 2.0) > 0.5) f.x = 1.0 - f.x; if (mod(cell.y, 2.0) > 0.5) f.y = 1.0 - f.y; }
    if (any(lessThan(f, vec2(uGap))) || any(greaterThan(f, vec2(1.0 - uGap)))) return vec4(0.0);
    f = (f - uGap) / (1.0 - 2.0 * uGap);
    return texture(uTex, f); }`,
  uniforms: (n) => ({ uN: [n.inputs.h, n.inputs.v], uMir: n.inputs.mirror, uGap: n.inputs.gap / 200 }),
});

fxNode({
  type: 'fx.wave', name: 'Wave Distort', description: 'Ripples the image with animated sine waves.',
  keywords: ['ripple', 'warp', 'water', 'wobble', 'distort'],
  inputs: [
    { id: 'amp', name: 'Amplitude', type: 'number', default: 2, min: 0, max: 50, step: 0.1 },
    { id: 'freq', name: 'Frequency', type: 'number', default: 10, min: 0, max: 200 },
    { id: 'speed', name: 'Speed', type: 'number', default: 1, step: 0.01 },
    { id: 'dir', name: 'Direction', type: 'enum', options: ['horizontal', 'vertical', 'both', 'radial'], default: 'both' },
  ],
  body: `uniform float uA, uF, uSp; uniform int uD;
  vec4 effect(vec2 uv){ float t = uTime * uSp; vec2 o = vec2(0.0);
    if (uD == 0 || uD == 2) o.x = sin(uv.y * uF + t) * uA;
    if (uD == 1 || uD == 2) o.y = sin(uv.x * uF + t * 1.3) * uA;
    if (uD == 3) { vec2 p = uv - 0.5; o = normalize(p + 1e-5) * sin(length(p) * uF * 2.0 - t * 2.0) * uA; }
    return texture(uTex, uv + o); }`,
  uniforms: (n) => { const i = n.inputs; return { uA: i.amp / 100, uF: i.freq, uSp: i.speed, uD: ['horizontal', 'vertical', 'both', 'radial'].indexOf(i.dir) }; },
});

fxNode({
  type: 'fx.rgbsplit', name: 'RGB Split', description: 'Chromatic aberration — offsets the red, green and blue channels.',
  keywords: ['chromatic', 'aberration', 'glitch', 'offset', 'channels'],
  inputs: [
    { id: 'amt', name: 'Amount', type: 'number', default: 1, min: 0, max: 20, step: 0.05 },
    { id: 'angle', name: 'Angle', type: 'number', default: 0 },
    { id: 'radial', name: 'Radial', type: 'bool', default: 0 },
  ],
  body: `uniform float uAmt, uAng, uRad;
  vec4 effect(vec2 uv){ vec2 d = uRad > 0.5 ? (uv - 0.5) * uAmt * 0.04 : vec2(cos(uAng), sin(uAng)) * uAmt * 0.01;
    vec4 c = texture(uTex, uv);
    return vec4(texture(uTex, uv + d).r, c.g, texture(uTex, uv - d).b, c.a); }`,
  uniforms: (n) => ({ uAmt: n.inputs.amt, uAng: (n.inputs.angle * Math.PI) / 180, uRad: n.inputs.radial }),
});

fxNode({
  type: 'fx.glitch', name: 'Glitch', description: 'Digital glitch: block displacement, scan tearing and colour channel jumps.',
  keywords: ['datamosh', 'corrupt', 'digital', 'error', 'tear'],
  inputs: [
    { id: 'amt', name: 'Intensity %', type: 'number', default: 30, min: 0, max: 100 },
    { id: 'blocks', name: 'Block Size', type: 'number', default: 24, min: 2, max: 200 },
    { id: 'rate', name: 'Change Rate', type: 'number', default: 12, min: 0, max: 60 },
  ],
  body: `uniform float uAmt, uB, uRate;
  vec4 effect(vec2 uv){
    float tt = floor(uTime * uRate);
    vec2 blk = floor(uv * uRes / uB);
    float r = hash21(blk + tt);
    vec2 p = uv;
    if (r < uAmt * 0.3) p.x += (hash21(blk.yy + tt) - 0.5) * 0.2 * uAmt;
    float line = hash21(vec2(floor(uv.y * uRes.y / 3.0), tt));
    if (line < uAmt * 0.08) p.x += (line - 0.5) * 0.1;
    vec4 c = texture(uTex, p);
    if (r > 1.0 - uAmt * 0.15) c.rgb = c.gbr;
    return c;
  }`,
  uniforms: (n) => ({ uAmt: n.inputs.amt / 100, uB: n.inputs.blocks, uRate: n.inputs.rate }),
});

fxNode({
  type: 'fx.vignette', name: 'Vignette', description: 'Darkens (or colours) the edges of the frame.',
  keywords: ['edge', 'darken', 'frame', 'soft'],
  inputs: [
    { id: 'amt', name: 'Amount %', type: 'number', default: 60, min: 0, max: 100 },
    { id: 'size', name: 'Size %', type: 'number', default: 60, min: 0, max: 150 },
    { id: 'soft', name: 'Softness %', type: 'number', default: 50, min: 1, max: 100 },
    { id: 'color', name: 'Colour', type: 'color', default: '#000000' },
  ],
  body: `uniform float uA, uS, uF; uniform vec3 uCol;
  vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float v = smoothstep(uS * 0.5, uS * 0.5 + uF, length(p)); return vec4(mix(c.rgb, uCol, v * uA), c.a); }`,
  uniforms: (n) => { const i = n.inputs; return { uA: i.amt / 100, uS: i.size / 100, uF: i.soft / 100, uCol: rgb(i.color).slice(0, 3) }; },
});

fxNode({
  type: 'fx.grain', name: 'Film Grain', description: 'Animated film grain and optional scanlines.',
  keywords: ['noise', 'film', 'grain', 'vhs', 'scanlines', 'crt'],
  inputs: [
    { id: 'amt', name: 'Grain %', type: 'number', default: 15, min: 0, max: 100 },
    { id: 'scan', name: 'Scanlines %', type: 'number', default: 0, min: 0, max: 100 },
    { id: 'lines', name: 'Line Count', type: 'number', default: 360, min: 10 },
  ],
  body: `uniform float uA, uSc, uL;
  vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); float n = hash21(uv * uRes + fract(uTime * 7.3) * 100.0) - 0.5;
    vec3 col = c.rgb + n * uA; col *= 1.0 - uSc * (0.5 + 0.5 * sin(uv.y * uL * 3.14159 * 2.0)); return vec4(col, c.a); }`,
  uniforms: (n) => ({ uA: n.inputs.amt / 100, uSc: n.inputs.scan / 100, uL: n.inputs.lines }),
});

fxNode({
  type: 'fx.displace', name: 'Displace', description: 'Pushes pixels around using a second video as a displacement map.',
  keywords: ['warp', 'refract', 'distort', 'map', 'liquid'],
  extraVideo: [{ id: 'map', name: 'Displace Map', uniform: 'uMap' }],
  inputs: [
    { id: 'h', name: 'Horizontal %', type: 'number', default: 5, min: -100, max: 100 },
    { id: 'v', name: 'Vertical %', type: 'number', default: 5, min: -100, max: 100 },
  ],
  body: `uniform sampler2D uMap; uniform vec2 uAmt;
  vec4 effect(vec2 uv){ vec3 m = texture(uMap, uv).rgb; vec2 o = (vec2(m.r, m.g) - 0.5) * uAmt; return texture(uTex, uv + o); }`,
  uniforms: (n) => ({ uAmt: [n.inputs.h / 100, n.inputs.v / 100] }),
});

// Multi-pass effects ---------------------------------------------------------

const BLUR_FS = fx(`uniform vec2 uDir; uniform float uRad;
vec4 effect(vec2 uv){
  vec4 s = vec4(0.0); float tw = 0.0;
  for (int i = -8; i <= 8; i++) {
    float x = float(i) / 8.0;
    float w = exp(-x * x * 2.5);
    s += texture(uTex, uv + uDir * x * uRad / uRes) * w; tw += w;
  }
  return s / tw;
}`);

function blur(ctx, n, src, radius, keyPrefix = 'b') {
  const ds = radius > 24 ? 4 : radius > 8 ? 2 : 1;
  const w = Math.max(1, Math.round(src.width / ds)), h = Math.max(1, Math.round(src.height / ds));
  const a = ctx.target(n, keyPrefix + 'a', w, h), b = ctx.target(n, keyPrefix + 'b', w, h);
  const r = radius / ds;
  ctx.renderer.draw(BLUR_FS, { uTex: src, uRes: [w, h], uDir: [1, 0], uRad: r }, a);
  ctx.renderer.draw(BLUR_FS, { uTex: a, uRes: [w, h], uDir: [0, 1], uRad: r }, b);
  if (r > 6) {
    ctx.renderer.draw(BLUR_FS, { uTex: b, uRes: [w, h], uDir: [1, 0], uRad: r * 0.5 }, a);
    ctx.renderer.draw(BLUR_FS, { uTex: a, uRes: [w, h], uDir: [0, 1], uRad: r * 0.5 }, b);
  }
  return b;
}

defineNode({
  type: 'fx.blur', name: 'Blur', category: FX, preview: true,
  description: 'High-quality Gaussian blur. Large radii are computed at reduced resolution for speed.',
  keywords: ['gaussian', 'soften', 'defocus', 'smooth'],
  inputs: [{ id: 'video', name: 'Video In', type: 'video' }, { id: 'radius', name: 'Radius (px)', type: 'number', default: 8, min: 0, max: 200 }],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const src = ctx.texture(n, 'video');
    if (!src) return null;
    if (n.inputs.radius <= 0.01) return src;
    return blur(ctx, n, src, n.inputs.radius);
  },
});

const GLOW_PASS = fx(`uniform float uT; vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); float l = luma(c.rgb); return vec4(c.rgb * smoothstep(uT, uT + 0.1, l), 1.0); }`);
const GLOW_MIX = fx(`uniform sampler2D uBlur; uniform float uI; vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv); return vec4(c.rgb + texture(uBlur, uv).rgb * uI, c.a); }`);

defineNode({
  type: 'fx.glow', name: 'Glow', category: FX, preview: true,
  description: 'Bloom: bright areas bleed light into their surroundings.',
  keywords: ['bloom', 'glow', 'light', 'shine', 'halo'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' },
    { id: 'thresh', name: 'Threshold %', type: 'number', default: 60, min: 0, max: 100 },
    { id: 'radius', name: 'Radius (px)', type: 'number', default: 24, min: 1, max: 200 },
    { id: 'amt', name: 'Intensity %', type: 'number', default: 120, min: 0, max: 500 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const src = ctx.texture(n, 'video');
    if (!src) return null;
    const bright = ctx.target(n, 'bright', src.width / 2, src.height / 2);
    ctx.renderer.draw(GLOW_PASS, { uTex: src, uT: n.inputs.thresh / 100 }, bright);
    const bl = blur(ctx, n, bright, n.inputs.radius / 2);
    const out = ctx.target(n, 'out', src.width, src.height);
    ctx.renderer.draw(GLOW_MIX, { uTex: src, uBlur: bl, uI: n.inputs.amt / 100 }, out);
    return out;
  },
});

const FEEDBACK_FS = fx(`uniform sampler2D uPrev; uniform float uDecay, uZoom, uRot, uHue, uMode; uniform vec2 uShift;
vec4 effect(vec2 uv){
  vec2 p = uv - 0.5; p.x *= uRes.x / uRes.y; p = rot(p, uRot) / uZoom; p.x /= uRes.x / uRes.y; p += 0.5 + uShift;
  vec4 prev = texture(uPrev, p);
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) prev = vec4(0.0);
  if (uHue != 0.0) { vec3 h = rgb2hsv(prev.rgb); h.x = fract(h.x + uHue); prev.rgb = hsv2rgb(h); }
  prev *= uDecay;
  vec4 c = texture(uTex, uv);
  vec4 o = uMode < 0.5 ? max(c, prev) : (uMode < 1.5 ? c + prev * (1.0 - c.a) : mix(prev, c, c.a * 0.5 + 0.5 * step(0.99, c.a)));
  return vec4(o.rgb, max(c.a, prev.a));
}`);

defineNode({
  type: 'fx.feedback', name: 'Feedback Trails', category: FX, preview: true,
  description: 'Video feedback: each frame is layered over a zoomed, rotated, fading copy of the last — trails, tunnels and echoes.',
  keywords: ['trails', 'echo', 'motion blur', 'tunnel', 'recursive', 'delay'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' },
    { id: 'decay', name: 'Persistence %', type: 'number', default: 90, min: 0, max: 100, step: 0.1 },
    { id: 'zoom', name: 'Zoom %', type: 'number', default: 101, min: 50, max: 200, step: 0.1 },
    { id: 'rot', name: 'Rotate', type: 'number', default: 0.5, min: -45, max: 45, step: 0.05 },
    { id: 'x', name: 'Drift X', type: 'number', default: 0, min: -10, max: 10, step: 0.01 },
    { id: 'y', name: 'Drift Y', type: 'number', default: 0, min: -10, max: 10, step: 0.01 },
    { id: 'hue', name: 'Hue Drift', type: 'number', default: 0, min: -20, max: 20, step: 0.1 },
    { id: 'mode', name: 'Mode', type: 'enum', options: ['lighten', 'over', 'mix'], default: 'lighten' },
    { id: 'clear', name: 'Clear', type: 'trigger' },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state.flip = 0; n.state.clear = true; },
  update(n, ctx, port) { if (port === 'clear') n.state.clear = true; },
  render(n, ctx) {
    const src = ctx.texture(n, 'video');
    if (!src) return null;
    const a = ctx.target(n, 'fa', src.width, src.height), b = ctx.target(n, 'fb', src.width, src.height);
    const [prev, next] = n.state.flip ? [a, b] : [b, a];
    if (n.state.clear) { ctx.renderer.clear(prev, [0, 0, 0, 0]); n.state.clear = false; }
    const i = n.inputs;
    ctx.renderer.draw(FEEDBACK_FS, {
      uTex: src, uPrev: prev, uRes: [src.width, src.height], uDecay: i.decay / 100, uZoom: i.zoom / 100,
      uRot: (i.rot * Math.PI) / 180, uShift: [-i.x / 100, i.y / 100], uHue: i.hue / 360, uMode: ['lighten', 'over', 'mix'].indexOf(i.mode),
    }, next);
    n.state.flip ^= 1;
    return next;
  },
});

defineNode({
  type: 'fx.freeze', name: 'Freeze Frame', category: FX, preview: true,
  description: 'Grabs a still from the incoming video on trigger and holds it while Freeze is on.',
  keywords: ['hold', 'still', 'capture', 'snapshot', 'pause'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' },
    { id: 'freeze', name: 'Freeze', type: 'bool', default: 0 },
    { id: 'grab', name: 'Grab', type: 'trigger' },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  update(n, ctx, port) { if (port === 'grab' || (port === 'freeze' && n.inputs.freeze)) n.state.grab = true; },
  render(n, ctx) {
    const src = ctx.texture(n, 'video');
    if (!src) return null;
    if (n.state.grab || !n.textures.hold) {
      const h = ctx.target(n, 'hold', src.width, src.height);
      ctx.renderer.copy(src, h);
      n.state.grab = false;
    }
    return n.inputs.freeze ? n.textures.hold : src;
  },
});

defineNode({
  type: 'fx.delay', name: 'Video Delay', category: FX, preview: true,
  description: 'Delays video by a number of frames (up to 90). Memory use grows with resolution × frames.',
  keywords: ['delay', 'echo', 'buffer', 'time', 'lag'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' },
    { id: 'frames', name: 'Delay (frames)', type: 'number', default: 15, min: 1, max: 90, int: true },
    { id: 'scale', name: 'Buffer Scale %', type: 'number', default: 50, min: 10, max: 100 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  create(n) { n.state.head = 0; n.state.filled = 0; },
  render(n, ctx) {
    const src = ctx.texture(n, 'video');
    if (!src) return null;
    const N = n.inputs.frames + 1;
    const s = n.inputs.scale / 100;
    const w = Math.round(src.width * s), h = Math.round(src.height * s);
    for (const k of Object.keys(n.textures)) {
      const idx = +k.slice(1);
      if (k.startsWith('d') && idx >= N) { n.textures[k].dispose(); delete n.textures[k]; }
    }
    n.state.head = (n.state.head + 1) % N;
    const cur = ctx.target(n, 'd' + n.state.head, w, h);
    ctx.renderer.copy(src, cur);
    n.state.filled = Math.min(N, n.state.filled + 1);
    const readIdx = (n.state.head + 1) % N;
    return n.state.filled >= N ? n.textures['d' + readIdx] : n.textures['d' + ((n.state.head - n.state.filled + 1 + N) % N)] || cur;
  },
});

// ---------------------------------------------------------------- Compositing

const MIX_FS = fx(`uniform sampler2D uB; uniform float uMix; uniform int uMode; uniform float uSoft;
vec4 effect(vec2 uv){
  vec4 a = texture(uTex, uv), b = texture(uB, uv);
  float m = uMix, k;
  if (uMode == 0) return mix(a, b, m);
  if (uMode == 1) return vec4(a.rgb * min(1.0, 2.0 - 2.0 * m) + b.rgb * min(1.0, 2.0 * m), max(a.a, b.a));
  if (uMode == 2) { k = smoothstep(m - uSoft, m + uSoft, uv.x * (1.0 - 2.0 * uSoft) + uSoft); return mix(b, a, k); }
  if (uMode == 3) { k = smoothstep(m - uSoft, m + uSoft, (1.0 - uv.y) * (1.0 - 2.0 * uSoft) + uSoft); return mix(b, a, k); }
  if (uMode == 4) { vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0); float r = length(p) / 0.9; k = smoothstep(m - uSoft, m + uSoft, r * (1.0 - 2.0 * uSoft) + uSoft); return mix(b, a, k); }
  if (uMode == 5) { float l = luma(b.rgb); k = smoothstep(m - uSoft, m + uSoft, l * (1.0 - 2.0 * uSoft) + uSoft); return mix(b, a, k); }
  if (uMode == 6) { float n = vnoise(uv * 12.0) * 0.7 + vnoise(uv * 40.0) * 0.3; k = smoothstep(m - uSoft, m + uSoft, n * (1.0 - 2.0 * uSoft) + uSoft); return mix(b, a, k); }
  return mix(a, b, m);
}`);

const MIX_MODES = ['crossfade', 'additive', 'wipe left', 'wipe up', 'iris', 'luma wipe', 'dissolve noise'];

defineNode({
  type: 'comp.mixer', name: 'Video Mixer', category: COMP, preview: true,
  description: 'Transitions between two videos: crossfade, additive, wipes, iris and luma/noise dissolves.',
  keywords: ['crossfade', 'transition', 'fade', 'wipe', 'dissolve', 'ab'],
  inputs: [
    { id: 'a', name: 'Video A', type: 'video' }, { id: 'b', name: 'Video B', type: 'video' },
    { id: 'mix', name: 'Mix %', type: 'number', default: 50, min: 0, max: 100 },
    { id: 'mode', name: 'Transition', type: 'enum', options: MIX_MODES, default: 'crossfade' },
    { id: 'soft', name: 'Edge Softness %', type: 'number', default: 10, min: 0, max: 50 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const a = ctx.texture(n, 'a'), b = ctx.texture(n, 'b');
    if (!a && !b) return null;
    const m = n.inputs.mix / 100;
    if (!b || m <= 0) return a || ctx.renderer.black;
    if (!a && m >= 1) return b;
    const ref = a || b;
    const t = ctx.target(n, 'out', ref.width, ref.height);
    ctx.renderer.draw(MIX_FS, { uTex: a || ctx.renderer.transparent, uB: b, uRes: [ref.width, ref.height], uMix: m, uMode: MIX_MODES.indexOf(n.inputs.mode), uSoft: Math.max(0.001, n.inputs.soft / 100) }, t);
    return t;
  },
});

const BLEND_MODES = ['normal', 'add', 'screen', 'multiply', 'overlay', 'soft light', 'difference', 'lighten', 'darken', 'subtract', 'colour dodge', 'exclusion'];
const BLEND_FS = fx(`uniform sampler2D uB; uniform float uOp; uniform int uMode;
vec3 blendf(vec3 a, vec3 b) {
  if (uMode == 1) return a + b;
  if (uMode == 2) return 1.0 - (1.0 - a) * (1.0 - b);
  if (uMode == 3) return a * b;
  if (uMode == 4) return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, a));
  if (uMode == 5) return mix(2.0 * a * b + a * a * (1.0 - 2.0 * b), sqrt(a) * (2.0 * b - 1.0) + 2.0 * a * (1.0 - b), step(0.5, b));
  if (uMode == 6) return abs(a - b);
  if (uMode == 7) return max(a, b);
  if (uMode == 8) return min(a, b);
  if (uMode == 9) return a - b;
  if (uMode == 10) return a / max(1.0 - b, 1e-3);
  if (uMode == 11) return a + b - 2.0 * a * b;
  return b;
}
vec4 effect(vec2 uv){ vec4 a = texture(uTex, uv), b = texture(uB, uv); float k = b.a * uOp;
  return vec4(mix(a.rgb, clamp(blendf(a.rgb, b.rgb), 0.0, 1.0), k), max(a.a, k)); }`);

defineNode({
  type: 'comp.blend', name: 'Layer Blend', category: COMP, preview: true,
  description: 'Blends a layer over a base using Photoshop-style blend modes.',
  keywords: ['blend mode', 'add', 'screen', 'multiply', 'overlay', 'difference', 'composite'],
  inputs: [
    { id: 'a', name: 'Base', type: 'video' }, { id: 'b', name: 'Layer', type: 'video' },
    { id: 'mode', name: 'Blend Mode', type: 'enum', options: BLEND_MODES, default: 'screen' },
    { id: 'op', name: 'Opacity %', type: 'number', default: 100, min: 0, max: 100 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const a = ctx.texture(n, 'a'), b = ctx.texture(n, 'b');
    if (!a) return b;
    if (!b) return a;
    const t = ctx.target(n, 'out', a.width, a.height);
    ctx.renderer.draw(BLEND_FS, { uTex: a, uB: b, uOp: n.inputs.op / 100, uMode: BLEND_MODES.indexOf(n.inputs.mode) }, t);
    return t;
  },
});

const MASK_FS = fx(`uniform sampler2D uMask; uniform int uSrc; uniform float uInv;
vec4 effect(vec2 uv){ vec4 c = texture(uTex, uv), m = texture(uMask, uv); float k = uSrc == 0 ? luma(m.rgb) : m.a;
  if (uInv > 0.5) k = 1.0 - k; return vec4(c.rgb, c.a * k); }`);

defineNode({
  type: 'comp.mask', name: 'Alpha Mask', category: COMP, preview: true,
  description: 'Uses a second video (its brightness or alpha) to cut out the first.',
  keywords: ['mask', 'matte', 'alpha', 'cutout', 'stencil', 'track matte'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' }, { id: 'mask', name: 'Mask', type: 'video' },
    { id: 'src', name: 'Mask From', type: 'enum', options: ['luminance', 'alpha'], default: 'luminance' },
    { id: 'invert', name: 'Invert', type: 'bool', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const v = ctx.texture(n, 'video'), m = ctx.texture(n, 'mask');
    if (!v) return null;
    if (!m) return v;
    const t = ctx.target(n, 'out', v.width, v.height);
    ctx.renderer.draw(MASK_FS, { uTex: v, uMask: m, uSrc: n.inputs.src === 'alpha' ? 1 : 0, uInv: n.inputs.invert }, t);
    return t;
  },
});

const PIP_FS = fx(`uniform sampler2D uB; uniform vec2 uPos; uniform vec2 uScale; uniform float uRot, uOp, uBAsp;
vec4 effect(vec2 uv){
  vec4 a = texture(uTex, uv);
  float asp = uRes.x / uRes.y;
  vec2 p = uv - 0.5 - uPos; p.x *= asp; p = rot(p, -uRot);
  vec2 q = p / (uScale * vec2(uBAsp, 1.0)) + 0.5;
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return a;
  vec4 b = texture(uB, q); float k = b.a * uOp;
  return vec4(mix(a.rgb, b.rgb, k), max(a.a, k));
}`);

defineNode({
  type: 'comp.overlay', name: 'Picture in Picture', category: COMP, preview: true,
  description: 'Places a scaled, positioned, rotated video over a background video.',
  keywords: ['pip', 'overlay', 'inset', 'position', 'layer', 'compose'],
  inputs: [
    { id: 'a', name: 'Background', type: 'video' }, { id: 'b', name: 'Foreground', type: 'video' },
    { id: 'x', name: 'Horz Pos', type: 'number', default: 50 },
    { id: 'y', name: 'Vert Pos', type: 'number', default: -50 },
    { id: 'size', name: 'Size %', type: 'number', default: 35, min: 0 },
    { id: 'rot', name: 'Rotation', type: 'number', default: 0 },
    { id: 'op', name: 'Opacity %', type: 'number', default: 100, min: 0, max: 100 },
  ],
  outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
  render(n, ctx) {
    const a = ctx.texture(n, 'a'), b = ctx.texture(n, 'b');
    if (!a) return b;
    if (!b) return a;
    const i = n.inputs;
    const t = ctx.target(n, 'out', a.width, a.height);
    const s = i.size / 100;
    ctx.renderer.draw(PIP_FS, { uTex: a, uB: b, uRes: [a.width, a.height], uPos: [i.x / 200, -i.y / 200], uScale: [s, s], uRot: (i.rot * Math.PI) / 180, uOp: i.op / 100, uBAsp: b.width / b.height }, t);
    return t;
  },
});

defineNode({
  type: 'comp.switch', name: 'Video Switcher', category: COMP, preview: true,
  description: 'Selects one of several video inputs — a live vision switcher.',
  keywords: ['switch', 'select', 'router', 'input', 'cut'],
  props: { count: 4 },
  ports(model) {
    const c = Math.max(2, Math.min(16, model.props?.count || 4));
    return {
      inputs: [
        { id: 'sel', name: 'Input #', type: 'number', default: 1, min: 1, max: c, int: true },
        ...Array.from({ length: c }, (_, i) => ({ id: `v${i + 1}`, name: `Video ${i + 1}`, type: 'video' })),
      ],
      outputs: [{ id: 'out', name: 'Video Out', type: 'video' }],
    };
  },
  render(n, ctx) { return ctx.texture(n, `v${n.inputs.sel}`); },
});

// --------------------------------------------------------------------- Output

defineNode({
  type: 'out.projector', name: 'Projector', category: OUT, preview: true,
  description: 'Sends video to a stage. Layer order, opacity, blend, zoom, position and rotation are per projector.',
  keywords: ['output', 'stage', 'display', 'screen', 'layer', 'send'],
  inputs: [
    { id: 'video', name: 'Video In', type: 'video' },
    { id: 'active', name: 'Active', type: 'bool', default: 1 },
    { id: 'stage', name: 'Stage #', type: 'number', default: 1, min: 1, int: true },
    { id: 'layer', name: 'Layer', type: 'number', default: 0, min: -100, max: 100, int: true },
    { id: 'opacity', name: 'Intensity %', type: 'number', default: 100, min: 0, max: 100 },
    { id: 'blend', name: 'Blend', type: 'enum', options: ['alpha', 'add', 'screen', 'multiply', 'subtract'], default: 'alpha' },
    { id: 'aspect', name: 'Fit', type: 'enum', options: ['fit', 'fill', 'stretch', 'native'], default: 'fit' },
    { id: 'zoom', name: 'Zoom %', type: 'number', default: 100, min: 0, step: 0.1 },
    { id: 'x', name: 'Horz Pos', type: 'number', default: 0, step: 0.1 },
    { id: 'y', name: 'Vert Pos', type: 'number', default: 0, step: 0.1 },
    { id: 'sx', name: 'Width %', type: 'number', default: 100, min: 0 },
    { id: 'sy', name: 'Height %', type: 'number', default: 100, min: 0 },
    { id: 'rot', name: 'Rotation', type: 'number', default: 0 },
  ],
  outputs: [],
  projector(n, ctx) {
    const i = n.inputs;
    if (!i.active) return null;
    const tex = ctx.texture(n, 'video');
    if (!tex) return null;
    return {
      stage: i.stage, layer: i.layer, texture: tex, opacity: i.opacity / 100, blend: i.blend, aspect: i.aspect,
      zoom: i.zoom, x: i.x, y: -i.y, rotation: i.rot, scaleX: i.sx / 100, scaleY: i.sy / 100,
    };
  },
  render(n, ctx) { return ctx.texture(n, 'video'); },
});

defineNode({
  type: 'out.monitor', name: 'Video Monitor', category: OUT, preview: true, bigPreview: true,
  description: 'A large preview of a video signal inside the patch. Does not output anywhere.',
  keywords: ['preview', 'view', 'watch', 'scope', 'debug'],
  inputs: [{ id: 'video', name: 'Video In', type: 'video' }],
  outputs: [{ id: 'info', name: 'Resolution', type: 'text' }],
  render(n, ctx) {
    const t = ctx.texture(n, 'video');
    const info = t ? `${t.width}×${t.height}` : '—';
    if (n.outputs.info !== info) ctx.out(n, 'info', info);
    return t;
  },
});
