// KamiCreative — project document model (plain JSON, versioned).

import { defaultGrid } from '../gl/warp.js';

export const FORMAT = 'kamicreative';
export const FORMAT_VERSION = 1;

let _seq = 0;
export function uid(prefix = 'n') {
  _seq = (_seq + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${_seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createSurface(name = 'Surface 1', rect = [0, 0, 1, 1]) {
  return {
    id: uid('s'),
    name,
    enabled: true,
    opacity: 1,
    source: [...rect],
    grid: defaultGrid(2, 2, rect),
    blend: { left: 0, right: 0, top: 0, bottom: 0, gamma: 1.8, curve: 2 },
    color: { brightness: 1, contrast: 1, gamma: 1 },
  };
}

export function createStage(index = 0) {
  return {
    id: uid('stage'),
    name: `Stage ${index + 1}`,
    width: 1920,
    height: 1080,
    display: null, // electron display id; null = windowed
    fullscreen: true,
    background: '#000000',
    testPattern: false,
    mapping: { enabled: true, surfaces: [createSurface()] },
  };
}

export function createScene(name = 'Scene 1') {
  return { id: uid('scene'), name, fadeIn: 0, notes: '', nodes: [], links: [], comments: [] };
}

export function createProject() {
  const scene = createScene('Scene 1');
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: { name: 'Untitled', created: new Date().toISOString(), modified: new Date().toISOString(), app: 'KamiCreative' },
    settings: { oscPort: 8000, artnetHost: '255.255.255.255', snapToGrid: true, previews: true },
    stages: [createStage(0)],
    media: [],
    scenes: [scene],
    activeScene: scene.id,
  };
}

/** Validate + migrate a parsed project. Throws a readable Error when invalid. */
export function normaliseProject(p) {
  if (!p || typeof p !== 'object') throw new Error('File is not a KamiCreative project.');
  if (p.format !== FORMAT) throw new Error('File is not a KamiCreative project (missing format marker).');
  if (p.version > FORMAT_VERSION) throw new Error(`Project was saved by a newer version of KamiCreative (format ${p.version}).`);
  const def = createProject();
  const out = { ...def, ...p, meta: { ...def.meta, ...(p.meta || {}) }, settings: { ...def.settings, ...(p.settings || {}) } };
  out.stages = (p.stages && p.stages.length ? p.stages : def.stages).map((s, i) => {
    const base = createStage(i);
    const st = { ...base, ...s };
    st.mapping = { ...base.mapping, ...(s.mapping || {}) };
    st.mapping.surfaces = (st.mapping.surfaces || []).map((sf) => {
      const b = createSurface(sf.name);
      return { ...b, ...sf, blend: { ...b.blend, ...(sf.blend || {}) }, color: { ...b.color, ...(sf.color || {}) } };
    });
    return st;
  });
  out.media = Array.isArray(p.media) ? p.media : [];
  out.scenes = (p.scenes && p.scenes.length ? p.scenes : def.scenes).map((s) => ({
    ...createScene(s.name), ...s,
    nodes: (s.nodes || []).map((n) => ({ values: {}, props: {}, ...n })),
    links: s.links || [],
    comments: s.comments || [],
  }));
  if (!out.scenes.find((s) => s.id === out.activeScene)) out.activeScene = out.scenes[0].id;
  out.version = FORMAT_VERSION;
  return out;
}

export function cloneJSON(v) { return JSON.parse(JSON.stringify(v)); }

/** Deep-copy a scene giving every node, link and comment a fresh id. */
export function duplicateScene(scene, name) {
  const copy = cloneJSON(scene);
  copy.id = uid('scene');
  copy.name = name || `${scene.name} copy`;
  const map = new Map();
  for (const n of copy.nodes) { const id = uid(); map.set(n.id, id); n.id = id; }
  copy.links = copy.links.filter((l) => map.has(l.from[0]) && map.has(l.to[0])).map((l) => ({
    id: uid('l'), from: [map.get(l.from[0]), l.from[1]], to: [map.get(l.to[0]), l.to[1]],
  }));
  for (const c of copy.comments) c.id = uid('c');
  return copy;
}
