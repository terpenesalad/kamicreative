// KamiCreative — stage compositor and projection mapper.
//
// Per stage, every frame:
//   1. composite  : projector layers (sorted by layer number) -> stage composite
//                   (or a calibration test pattern when enabled)
//   2. mapping    : each surface samples a rect of the composite and draws it
//                   through its warp mesh with edge blending + colour trim
//   3. present    : output is blitted to every sink (stage window, monitors)

import { fragment, MESH_VS } from './gl.js';
import { buildSurfaceMesh } from './warp.js';
import { hexToRgb } from '../core/registry.js';

const LAYER_FS = fragment(`
uniform sampler2D uTex;
uniform vec2 uSize;      // layer size in stage units (1 = full)
uniform vec2 uOffset;    // centre offset in stage units
uniform float uAngle;    // radians
uniform float uAspect;   // stage aspect W/H
uniform float uOpacity;
uniform vec4 uCrop;      // l, r, t, b (0..1)
vec4 effect(vec2 uv) {
  vec2 p = (uv - 0.5);
  p.x *= uAspect;
  p -= vec2(uOffset.x * uAspect, uOffset.y);
  float c = cos(-uAngle), s = sin(-uAngle);
  p = mat2(c, s, -s, c) * p;
  vec2 l = p / vec2(uSize.x * uAspect, uSize.y) + 0.5;
  if (l.x < uCrop.x || l.x > 1.0 - uCrop.y || l.y < uCrop.w || l.y > 1.0 - uCrop.z) return vec4(0.0);
  vec4 t = texture(uTex, l);
  float a = t.a * uOpacity;
  return vec4(t.rgb * a, a);
}`);

const PATTERN_FS = fragment(`
uniform vec2 uRes;
uniform float uTime;
float line(float v, float w) { return 1.0 - smoothstep(0.0, w, abs(v)); }
vec4 effect(vec2 uv) {
  vec2 px = uv * uRes;
  float cell = uRes.y / 9.0;
  vec2 g = mod(px + cell * 0.5, cell) - cell * 0.5;
  float grid = max(line(g.x, 1.5), line(g.y, 1.5));
  vec2 g2 = mod(px + cell * 0.25, cell * 0.5) - cell * 0.25;
  float sub = max(line(g2.x, 0.8), line(g2.y, 0.8)) * 0.35;
  vec2 c = px - uRes * 0.5;
  float r = length(c);
  float circ = line(r - uRes.y * 0.45, 2.0) + line(r - uRes.y * 0.25, 1.5);
  float cross = max(line(c.x, 2.0), line(c.y, 2.0)) * step(r, uRes.y * 0.1);
  float diag = max(line(c.x * uRes.y - c.y * uRes.x, uRes.x * 2.0), line(c.x * uRes.y + c.y * uRes.x, uRes.x * 2.0)) * 0.5;
  float border = max(max(line(px.x, 6.0), line(uRes.x - px.x, 6.0)), max(line(px.y, 6.0), line(uRes.y - px.y, 6.0)));
  vec3 bg = mix(vec3(0.06, 0.07, 0.09), vec3(0.10, 0.11, 0.14), step(0.0, sin(px.x / cell * 3.14159) * sin(px.y / cell * 3.14159)));
  vec3 col = bg;
  col = mix(col, vec3(0.45), sub);
  col = mix(col, vec3(0.92), grid);
  col = mix(col, vec3(0.35, 0.9, 1.0), circ);
  col = mix(col, vec3(1.0, 0.85, 0.2), diag);
  col = mix(col, vec3(1.0, 0.3, 0.3), cross);
  col = mix(col, vec3(0.2, 1.0, 0.5), border);
  // colour bars in the lower third
  if (uv.y < 0.12 && uv.y > 0.06 && uv.x > 0.2 && uv.x < 0.8) {
    float k = floor((uv.x - 0.2) / 0.6 * 8.0);
    vec3 bars[8] = vec3[8](vec3(1), vec3(1,1,0), vec3(0,1,1), vec3(0,1,0), vec3(1,0,1), vec3(1,0,0), vec3(0,0,1), vec3(0));
    col = bars[int(k)];
  }
  // a moving sweep to confirm the output is live
  float sweep = line(uv.x - fract(uTime * 0.1), 0.002);
  col = mix(col, vec3(1.0), sweep * 0.6);
  return vec4(col, 1.0);
}`);

const SURFACE_FS = `#version 300 es
precision highp float;
in vec2 vUv;           // surface coordinate 0..1 (top-left origin)
uniform sampler2D uTex;
uniform vec4 uSource;  // x, y, w, h (normalised, top-left origin)
uniform vec4 uBlend;   // left, right, top, bottom widths (surface units)
uniform float uGamma;
uniform float uCurve;
uniform float uOpacity;
uniform vec3 uColor;   // brightness, contrast, gamma
uniform float uOutline;
out vec4 outColor;
float shape(float x) { return x < 0.5 ? 0.5 * pow(2.0 * x, uCurve) : 1.0 - 0.5 * pow(2.0 * (1.0 - x), uCurve); }
float ramp(float d, float w) { return w <= 0.0 ? 1.0 : shape(clamp(d / w, 0.0, 1.0)); }
void main() {
  vec2 cuv = vec2(uSource.x + vUv.x * uSource.z, 1.0 - (uSource.y + vUv.y * uSource.w));
  vec3 c = texture(uTex, cuv).rgb;
  c = (c - 0.5) * uColor.y + 0.5;
  c *= uColor.x;
  c = pow(max(c, 0.0), vec3(1.0 / max(uColor.z, 0.01)));
  float a = ramp(vUv.x, uBlend.x) * ramp(1.0 - vUv.x, uBlend.y) * ramp(vUv.y, uBlend.z) * ramp(1.0 - vUv.y, uBlend.w);
  a = pow(a, 1.0 / max(uGamma, 0.01)) * uOpacity;
  if (uOutline > 0.5) {
    vec2 e = min(vUv, 1.0 - vUv);
    vec2 fw = fwidth(vUv) * 2.0;
    float edge = 1.0 - min(smoothstep(0.0, fw.x, e.x), smoothstep(0.0, fw.y, e.y));
    c = mix(c, vec3(0.2, 1.0, 0.8), edge);
    a = max(a, edge);
  }
  outColor = vec4(c * a, a);
}`;

export class StageRenderer {
  constructor(renderer) {
    this.r = renderer;
    this.comp = new Map();   // stage id -> Texture
    this.output = new Map(); // stage id -> Texture
    this.meshes = new Map(); // surface id -> { key, mesh }
    this.sinks = new Map();  // stage id -> Set<{ canvas, ctx, fit }>
    this.highlightSurface = null;
  }

  addSink(stageId, canvas, { fit = 'contain', source = 'out' } = {}) {
    if (!this.sinks.has(stageId)) this.sinks.set(stageId, new Set());
    const sink = { canvas, ctx: canvas.getContext('2d', { alpha: false }), fit, source };
    this.sinks.get(stageId).add(sink);
    return () => this.sinks.get(stageId)?.delete(sink);
  }

  _tex(map, id, w, h) {
    let t = map.get(id);
    if (!t) { t = this.r.createTexture(w, h); map.set(id, t); }
    else t.resize(w, h);
    return t;
  }

  _mesh(surface) {
    const key = JSON.stringify([surface.grid, surface.source]);
    const m = this.meshes.get(surface.id);
    if (m && m.key === key) return m.mesh;
    const res = surface.grid.cols * surface.grid.rows > 4 ? 48 : 24;
    const built = buildSurfaceMesh(surface.grid, surface.source, res);
    const mesh = { positions: built.positions, uvs: built.surf, indices: built.indices };
    this.meshes.set(surface.id, { key, mesh });
    return mesh;
  }

  composite(stage, layers, time) {
    const comp = this._tex(this.comp, stage.id, stage.width, stage.height);
    if (stage.testPattern) {
      this.r.draw(PATTERN_FS, { uRes: [stage.width, stage.height], uTime: time }, comp);
      return comp;
    }
    const bg = hexToRgb(stage.background);
    this.r.clear(comp, [bg[0], bg[1], bg[2], 1]);
    const aspect = stage.width / stage.height;
    for (const L of layers || []) {
      const tex = L.texture;
      if (!tex) continue;
      const ta = tex.width / tex.height;
      let w = 1, h = 1;
      if (L.aspect === 'fit') { if (ta > aspect) h = aspect / ta; else w = ta / aspect; }
      else if (L.aspect === 'fill') { if (ta > aspect) w = ta / aspect; else h = aspect / ta; }
      else if (L.aspect === 'native') { w = tex.width / stage.width; h = tex.height / stage.height; }
      const z = L.zoom / 100;
      this.r.draw(LAYER_FS, {
        uTex: tex,
        uSize: [w * z * (L.scaleX ?? 1), h * z * (L.scaleY ?? 1)],
        uOffset: [L.x / 200, L.y / 200],
        uAngle: (L.rotation * Math.PI) / 180,
        uAspect: aspect,
        uOpacity: L.opacity,
        uCrop: L.crop || [0, 0, 0, 0],
      }, comp, { blend: L.blend || 'alpha' });
    }
    return comp;
  }

  map(stage, comp, { outline = false } = {}) {
    const m = stage.mapping;
    const surfaces = m && m.enabled ? m.surfaces.filter((s) => s.enabled) : [];
    if (!surfaces.length) return comp;
    const out = this._tex(this.output, stage.id, stage.width, stage.height);
    this.r.clear(out, [0, 0, 0, 1]);
    for (const s of surfaces) {
      const b = s.blend || {};
      const col = s.color || {};
      this.r.drawMesh(SURFACE_FS, {
        uTex: comp,
        uSource: s.source,
        uBlend: [b.left || 0, b.right || 0, b.top || 0, b.bottom || 0],
        uGamma: b.gamma || 1,
        uCurve: b.curve || 2,
        uOpacity: s.opacity ?? 1,
        uColor: [col.brightness ?? 1, col.contrast ?? 1, col.gamma ?? 1],
        uOutline: outline || this.highlightSurface === s.id ? 1 : 0,
      }, out, this._mesh(s), { blend: 'add', vs: MESH_VS });
    }
    return out;
  }

  /** Render every stage. `layers` = Map(stageIndex -> layer[]). Returns Map(stage id -> output texture). */
  render(stages, layers, time, opts = {}) {
    const results = new Map();
    stages.forEach((stage, i) => {
      const comp = this.composite(stage, layers.get(i + 1), time);
      const out = this.map(stage, comp, { outline: opts.outlineStage === stage.id });
      results.set(stage.id, { comp, out });
    });
    return results;
  }

  /** Copy each stage's output to its sinks (stage windows, monitors). */
  present(stages, results) {
    for (const stage of stages) {
      const sinks = this.sinks.get(stage.id);
      const res = results.get(stage.id);
      if (!sinks || !sinks.size || !res) continue;
      const glc = this.r.canvas;
      const bySource = { out: null, comp: null };
      for (const sink of [...sinks].sort((a, b) => (a.source > b.source ? 1 : -1))) {
        if (!bySource[sink.source]) {
          bySource.out = bySource.comp = null;
          bySource[sink.source] = this.r.present(sink.source === 'comp' ? res.comp : res.out, stage.width, stage.height);
        }
        const src = bySource[sink.source];
        const c = sink.canvas;
        if (!c.isConnected && !c.ownerDocument?.defaultView) continue;
        const cw = c.width, ch = c.height;
        let dx = 0, dy = 0, dw = cw, dh = ch;
        if (sink.fit === 'contain') {
          const sa = stage.width / stage.height, ca = cw / ch;
          if (sa > ca) { dh = cw / sa; dy = (ch - dh) / 2; } else { dw = ch * sa; dx = (cw - dw) / 2; }
          sink.ctx.fillStyle = '#000';
          sink.ctx.fillRect(0, 0, cw, ch);
        }
        try { sink.ctx.drawImage(glc, src.sx, src.sy, src.sw, src.sh, dx, dy, dw, dh); } catch { /* sink window closing */ }
      }
    }
  }

  forgetStage(id) {
    this.comp.get(id)?.dispose();
    this.output.get(id)?.dispose();
    this.comp.delete(id);
    this.output.delete(id);
    this.sinks.delete(id);
  }
}
