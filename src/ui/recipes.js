// One-click starter patches ("recipes"). Each builds a small, already-connected
// chain and inserts it into the current scene as a single undoable step.

import { getNodeType } from '../core/registry.js';
import { toast } from './dialogs.js';

function clip() {
  const nodes = [], links = [];
  let n = 0;
  const add = (type, x, y, values = {}, extra = {}) => {
    const def = getNodeType(type);
    const m = { id: `r${n++}`, type, x, y, values, props: { ...(def.props ? JSON.parse(JSON.stringify(def.props)) : {}), ...(extra.props || {}) } };
    if (extra.title) m.title = extra.title;
    if (extra.react) m.react = extra.react;
    if (def.preview) m.preview = true;
    nodes.push(m);
    return m;
  };
  const link = (a, ap, b, bp) => links.push({ id: `rl${links.length}`, from: [a.id, ap], to: [b.id, bp] });
  return { add, link, done: () => ({ kind: 'kamicreative/modules', nodes, links }) };
}

export const RECIPES = [
  {
    id: 'visualizer', name: 'Music visualizer', icon: 'sound', sound: true,
    description: 'A glowing, spinning spectrum that dances to whatever you are listening to.',
    build() {
      const c = clip();
      const vis = c.add('src.visualizer', 0, 0, { style: 'circle', count: 64, spin: 0.03, scale: 110 });
      const fb = c.add('fx.feedback', 290, 0, { decay: 82, zoom: 101.5, rot: 0.4, mode: 'lighten' }, { react: { zoom: { band: 'bass', min: 100.5, max: 104, smooth: 30 } } });
      const glow = c.add('fx.glow', 560, 0, { thresh: 35, radius: 30, amt: 140 });
      const pj = c.add('out.projector', 830, 0);
      c.link(vis, 'out', fb, 'video');
      c.link(fb, 'out', glow, 'video');
      c.link(glow, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'organ', name: 'Colour organ (photism)', icon: 'layers', sound: true,
    description: 'See the music as colour: low notes glow red, high notes violet, each light following its own band.',
    build() {
      const c = clip();
      const org = c.add('src.colororgan', 0, 0, { layout: 'lights', bands: 7, bright: 140 });
      const fb = c.add('fx.feedback', 290, 0, { decay: 88, zoom: 100.6, rot: 0.15, mode: 'lighten' });
      const pj = c.add('out.projector', 560, 0);
      c.link(org, 'out', fb, 'video');
      c.link(fb, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'dance', name: 'Make a video dance', icon: 'film', media: 'video', sound: true,
    description: 'Your video zooms with the bass and flashes and shifts colour on every beat.',
    build(mediaId) {
      const c = clip();
      const mv = c.add('src.movie', 0, 0, { media: mediaId || '', vol: 0 });
      const pulse = c.add('fx.soundpulse', 290, 0, { zoom: 15, flash: 25, split: 35, hue: 1 });
      const pj = c.add('out.projector', 560, 0);
      c.link(mv, 'out', pulse, 'video');
      c.link(pulse, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'movie', name: 'Play a video', icon: 'film', media: 'video',
    description: 'A movie player sent straight to the stage. You choose the video file.',
    build(mediaId) {
      const c = clip();
      const mv = c.add('src.movie', 0, 0, { media: mediaId || '' });
      const pj = c.add('out.projector', 300, 0);
      c.link(mv, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'picture', name: 'Show a picture', icon: 'image', media: 'image',
    description: 'A still image on the stage. You choose the picture.',
    build(mediaId) {
      const c = clip();
      const pic = c.add('src.picture', 0, 0, { media: mediaId || '' });
      const pj = c.add('out.projector', 300, 0);
      c.link(pic, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'generative', name: 'Generative visuals', icon: 'layers',
    description: 'Flowing noise through a kaleidoscope with slowly shifting colour. The zoom pulses with the bass.',
    build() {
      const c = clip();
      const noise = c.add('src.noise', 0, 0, { scale: 2.6, speed: 0.12, warp: 1.4, a: '#0d1530', b: '#ff4f8b' });
      const kal = c.add('fx.kaleido', 290, 0, { seg: 6, spin: 0.03 }, { react: { zoom: { band: 'bass', min: 100, max: 170, smooth: 35 } } });
      const col = c.add('fx.color', 560, 0, { sat: 130 });
      const pj = c.add('out.projector', 830, 0);
      const wave = c.add('gen.wave', 290, 380, { freq: 0.05, min: -180, max: 180 }, { title: 'Colour cycle' });
      c.link(noise, 'out', kal, 'video');
      c.link(kal, 'out', col, 'video');
      c.link(col, 'out', pj, 'video');
      c.link(wave, 'out', col, 'hue');
      return c.done();
    },
  },
  {
    id: 'webcam', name: 'Webcam with effects', icon: 'monitor',
    description: 'Your camera through a mirror and colour effect, with trails. Allow camera access when asked.',
    build() {
      const c = clip();
      const cam = c.add('src.camera', 0, 0);
      const mir = c.add('fx.mirror', 290, 0);
      const fb = c.add('fx.feedback', 560, 0, { decay: 80, zoom: 100, rot: 0 });
      const pj = c.add('out.projector', 830, 0);
      c.link(cam, 'out', mir, 'video');
      c.link(mir, 'out', fb, 'video');
      c.link(fb, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'title', name: 'Text title', icon: 'info',
    description: 'A text title on top of everything else (layer 1). Edit the words in the Text input.',
    build() {
      const c = clip();
      const t = c.add('src.text', 0, 0, { text: 'Your title here', size: 10, shadow: 25 });
      const pj = c.add('out.projector', 300, 0, { layer: 1 }, { title: 'Title Projector' });
      c.link(t, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'music', name: 'Pulsing ring', icon: 'sound', sound: true,
    description: 'A glowing ring that grows with the bass and brightens with the volume.',
    build() {
      const c = clip();
      const ring = c.add('src.shape', 0, 0, { kind: 'ring', fill: '#5cc8ff' }, { react: { w: { band: 'bass', min: 20, max: 90, smooth: 30 }, h: { band: 'bass', min: 20, max: 90, smooth: 30 } } });
      const glow = c.add('fx.glow', 290, 0, { thresh: 30, radius: 40 }, { react: { amt: { band: 'level', min: 60, max: 320, smooth: 40 } } });
      const pj = c.add('out.projector', 560, 0);
      c.link(ring, 'out', glow, 'video');
      c.link(glow, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'crossfade', name: 'Fade between two looks', icon: 'sliders',
    description: 'Two visuals and a slider that fades between them. The slider also appears in Live view.',
    build() {
      const c = clip();
      const a = c.add('src.gradient', 0, 0, { kind: 'angular', a: '#1b2a6b', b: '#56e0c4', speed: 0.05 }, { title: 'Look A' });
      const b = c.add('src.pattern', 0, 380, { kind: 'rings', count: 10, speed: 0.2, a: '#111111', b: '#f2a93b' }, { title: 'Look B' });
      const mix = c.add('comp.mixer', 300, 120, { mode: 'crossfade' });
      const sl = c.add('ctl.slider', 300, 520, { min: 0, max: 100 }, { props: { value: 0, label: 'A ↔ B' }, title: 'A ↔ B' });
      const pj = c.add('out.projector', 580, 140);
      c.link(a, 'out', mix, 'a');
      c.link(b, 'out', mix, 'b');
      c.link(sl, 'out', mix, 'mix');
      c.link(mix, 'out', pj, 'video');
      return c.done();
    },
  },
  {
    id: 'flash', name: 'Button that flashes', icon: 'bolt',
    description: 'Press the button (or the space bar) to flash the stage white.',
    build() {
      const c = clip();
      const btn = c.add('ctl.button', 0, 0, {}, { props: { label: 'FLASH' } });
      const key = c.add('io.key', 0, 180, { key: 'space' });
      const env = c.add('gen.envelope', 280, 0, { attack: 0.02, hold: 0.05, release: 0.6, low: 0, high: 100, curve: 'ease out' });
      const col = c.add('src.color', 560, 0, { color: '#ffffff' }, { title: 'White' });
      const pj = c.add('out.projector', 840, 0, { layer: 10, blend: 'add', opacity: 0 }, { title: 'Flash Projector' });
      c.link(btn, 'press', env, 'trig');
      c.link(key, 'press', env, 'trig');
      c.link(env, 'out', pj, 'opacity');
      c.link(col, 'out', pj, 'video');
      return c.done();
    },
  },
];

/** Insert a recipe into the current scene at world position `at` (or the view centre). */
export async function insertRecipe(app, id, at) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return null;
  let mediaId = '';
  if (r.media) {
    let m = app.doc.project.media.find((x) => x.kind === r.media);
    if (!m) {
      const before = new Set(app.doc.project.media.map((x) => x.id));
      await app.importMedia();
      m = app.doc.project.media.find((x) => x.kind === r.media && !before.has(x.id));
    }
    if (m) mediaId = m.id;
    else toast(`No ${r.media === 'video' ? 'video' : 'picture'} chosen yet — click the "none" value on the player to pick one later.`, { timeout: 5000 });
  }
  if (app.mode !== 'patch') app.setMode('patch');
  const pos = at || (() => { const [x, y] = app.patch.centerWorld(); return [x - 300, y - 150]; })();
  const res = app.doc.paste(r.build(mediaId), pos, `Add recipe: ${r.name}`);
  if (r.sound) app.sound?.ensureListening();
  requestAnimationFrame(() => app.patch.frameAll(true));
  toast(`Added "${r.name}". Ctrl+Z removes it again.`);
  return res;
}
