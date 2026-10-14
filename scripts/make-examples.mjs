// Generates the example projects in examples/ from code, validating every link.
import fs from 'node:fs';
import path from 'node:path';
import '../src/nodes/index.js';
import { createProject, createScene, createSurface, uid } from '../src/core/project.js';
import { getNodeType, portsOf, compatible } from '../src/core/registry.js';

const OUT = path.resolve('examples');
fs.mkdirSync(OUT, { recursive: true });

function builder(scene) {
  const add = (type, x, y, values = {}, extra = {}) => {
    const def = getNodeType(type);
    if (!def) throw new Error(`unknown type ${type}`);
    const model = { id: uid(), type, x, y, values, props: { ...(def.props ? JSON.parse(JSON.stringify(def.props)) : {}), ...(extra.props || {}) } };
    if (extra.title) model.title = extra.title;
    if (def.preview && extra.preview !== false) model.preview = true;
    const ports = portsOf(def, model);
    for (const k of Object.keys(values)) if (!ports.inputs.find((p) => p.id === k)) throw new Error(`${type} has no input "${k}"`);
    scene.nodes.push(model);
    return model;
  };
  const link = (a, ap, b, bp) => {
    const da = getNodeType(a.type), db = getNodeType(b.type);
    const op = portsOf(da, a).outputs.find((p) => p.id === ap);
    const ip = portsOf(db, b).inputs.find((p) => p.id === bp);
    if (!op) throw new Error(`${a.type} has no output "${ap}"`);
    if (!ip) throw new Error(`${b.type} has no input "${bp}"`);
    if (!compatible(op.type, ip.type)) throw new Error(`incompatible ${a.type}.${ap} -> ${b.type}.${bp}`);
    scene.links.push({ id: uid('l'), from: [a.id, ap], to: [b.id, bp] });
  };
  const note = (x, y, text, title = 'Note', color) => add('util.comment', x, y, {}, { title, props: { text, ...(color ? { color } : {}) } });
  return { add, link, note };
}

function save(name, project) {
  project.meta.name = name.replace(/^\d+-/, '').replace(/-/g, ' ');
  project.activeScene = project.scenes[0].id;
  fs.writeFileSync(path.join(OUT, `${name}.kamic`), JSON.stringify(project, null, 2));
  console.log('wrote', name);
}

// ------------------------------------------------------------------ 01 Welcome
{
  const p = createProject();
  const s1 = p.scenes[0];
  s1.name = 'Welcome';
  s1.notes = 'Press GO (Page Down) to move to the next scene.';
  const b = builder(s1);
  b.note(-420, 0, 'Welcome to KamiCreative.\n\n• Double-click empty space (or press Tab) to add a module.\n• Drag from an output port to an input port to connect.\n• Drag a value left/right to scrub it; click to type.\n• Select a module to see every parameter in the Inspector.\n• Space-drag or middle-drag to pan, wheel to zoom, F to frame.', 'Start here', '#f3d36b');
  const noise = b.add('src.noise', 0, 0, { scale: 2.6, speed: 0.12, warp: 1.4, a: '#0d1530', b: '#ff4f8b' });
  const kal = b.add('fx.kaleido', 290, 20, { seg: 6, spin: 0.03, zoom: 120 });
  const col = b.add('fx.color', 560, 20, { sat: 130, con: 10 });
  const proj = b.add('out.projector', 840, 40, { layer: 0 });
  const wave = b.add('gen.wave', 290, 420, { freq: 0.05, min: -180, max: 180, shape: 'triangle' });
  const slider = b.add('ctl.slider', 0, 420, { min: 3, max: 16 }, { props: { value: 6, label: 'Mirror segments' }, title: 'Segments' });
  const title = b.add('src.text', 560, 420, { text: 'KamiCreative', size: 13, weight: '600', y: 0, shadow: 30 });
  const titleProj = b.add('out.projector', 840, 440, { layer: 1, blend: 'alpha' }, { title: 'Title Projector' });
  const env = b.add('gen.envelope', 290, 720, { attack: 2, hold: 3, release: 2, low: 0, high: 100 }, { title: 'Title fade' });
  const start = b.add('scene.enter', 0, 720, { delay: 0.5 });
  b.link(noise, 'out', kal, 'video');
  b.link(kal, 'out', col, 'video');
  b.link(col, 'out', proj, 'video');
  b.link(wave, 'out', col, 'hue');
  b.link(slider, 'out', kal, 'seg');
  b.link(title, 'out', titleProj, 'video');
  b.link(start, 'trig', env, 'trig');
  b.link(env, 'out', titleProj, 'opacity');

  const s2 = createScene('Beat Shapes');
  s2.fadeIn = 1.5;
  s2.notes = 'A tempo-driven scene. Tap the Tap Tempo trigger to sync to music.';
  p.scenes.push(s2);
  const c = builder(s2);
  const bg = c.add('src.gradient', 0, 0, { kind: 'radial', a: '#2b0f3a', b: '#06070c', scale: 140 });
  const beat = c.add('gen.beat', 0, 360, { bpm: 118 });
  const envB = c.add('gen.envelope', 280, 360, { attack: 0.02, hold: 0, release: 0.45, low: 18, high: 46, curve: 'ease out' }, { title: 'Pulse' });
  const shape = c.add('src.shape', 280, 0, { kind: 'star', sides: 6, inner: 50, fill: '#f2a93b', soft: 0.4 });
  const spin = c.add('gen.wave', 560, 360, { shape: 'sawtooth', freq: 0.1, min: 0, max: 360 });
  const glow = c.add('fx.glow', 560, 0, { thresh: 40, radius: 40, amt: 160 });
  const blend = c.add('comp.blend', 840, 0, { mode: 'screen' });
  const pj = c.add('out.projector', 1120, 20);
  c.link(beat, 'beat', envB, 'trig');
  c.link(envB, 'out', shape, 'w');
  c.link(envB, 'out', shape, 'h');
  c.link(spin, 'out', shape, 'rot');
  c.link(shape, 'out', glow, 'video');
  c.link(bg, 'out', blend, 'a');
  c.link(glow, 'out', blend, 'b');
  c.link(blend, 'out', pj, 'video');
  const btn = c.add('ctl.button', 0, 640, {}, { props: { label: 'Back to start' }, title: 'Back' });
  const jump = c.add('scene.jump', 280, 640, { mode: 'first', fade: 1 });
  c.link(btn, 'press', jump, 'trig');
  save('01-Welcome', p);
}

// ---------------------------------------------------------- 02 Projection Mapping
{
  const p = createProject();
  const s = p.scenes[0];
  s.name = 'Cube Mapping';
  s.notes = 'Open Stage → Projection Mapping to adjust the three cube faces.';
  const b = builder(s);
  b.note(-420, 0, 'This stage is split into three surfaces — the three visible faces of a cube.\n\nEach surface shows one third of the composite (its Input region) and is warped onto a face (Output warp).\n\nOpen the mapper from the stage strip (map icon), turn on Test pattern, and drag the corners onto your real object.', 'Projection mapping', '#7fd1ff');
  const left = b.add('src.pattern', 0, 0, { kind: 'stripes', count: 14, angle: 45, speed: 0.15, a: '#101418', b: '#f2a93b' }, { title: 'Face A' });
  const mid = b.add('src.pattern', 0, 380, { kind: 'rings', count: 9, speed: 0.25, a: '#0a0f1a', b: '#5cc8ff' }, { title: 'Face B' });
  const right = b.add('src.noise', 0, 760, { scale: 5, speed: 0.3, a: '#12081c', b: '#ff4f8b' }, { title: 'Face C' });
  const pa = b.add('out.projector', 300, 0, { aspect: 'stretch', sx: 33.34, x: -66.67 }, { title: 'Left third' });
  const pb = b.add('out.projector', 300, 380, { aspect: 'stretch', sx: 33.34, x: 0 }, { title: 'Middle third' });
  const pc = b.add('out.projector', 300, 760, { aspect: 'stretch', sx: 33.34, x: 66.67 }, { title: 'Right third' });
  b.link(left, 'out', pa, 'video');
  b.link(mid, 'out', pb, 'video');
  b.link(right, 'out', pc, 'video');
  const st = p.stages[0];
  st.name = 'Projector';
  const third = 1 / 3;
  const top = createSurface('Top face', [0, 0, third, 1]);
  top.grid.points = [[0.5, 0.08], [0.78, 0.22], [0.22, 0.22], [0.5, 0.36]];
  const lf = createSurface('Left face', [third, 0, third, 1]);
  lf.grid.points = [[0.22, 0.22], [0.5, 0.36], [0.24, 0.72], [0.5, 0.9]];
  const rf = createSurface('Right face', [2 * third, 0, third, 1]);
  rf.grid.points = [[0.5, 0.36], [0.78, 0.22], [0.5, 0.9], [0.76, 0.72]];
  st.mapping.surfaces = [top, lf, rf];
  save('02-Projection-Mapping', p);
}

// ------------------------------------------------------------- 03 Audio Reactive
{
  const p = createProject();
  const s = p.scenes[0];
  s.name = 'Audio Reactive';
  s.notes = 'Needs a microphone or line input. Clap or play music.';
  const b = builder(s);
  b.note(-420, 0, 'Sound Analyser listens to your default audio input.\n\nLow frequencies drive the ring size, the beat trigger picks a random hue, and the overall level drives the glow.\n\nIf nothing moves, check the input level and raise Gain.', 'Audio reactive', '#9be59b');
  const an = b.add('audio.analyzer', 0, 0, { gain: 2, smooth: 70, sens: 60 });
  const sm = b.add('math.smooth', 300, 0, { amount: 75 });
  const sc = b.add('math.scale', 560, 0, { inMin: 0, inMax: 100, outMin: 20, outMax: 90 }, { title: 'Bass → size' });
  const ring = b.add('src.shape', 840, 0, { kind: 'ring', w: 40, h: 40, fill: '#5cc8ff', soft: 1 });
  const rnd = b.add('gen.random', 300, 360, { min: -180, max: 180 }, { title: 'Hue on beat' });
  const col = b.add('fx.color', 1120, 0, { sat: 140 });
  const lvl = b.add('math.scale', 300, 620, { inMin: 0, inMax: 100, outMin: 40, outMax: 400 }, { title: 'Level → glow' });
  const glow = b.add('fx.glow', 1400, 0, { thresh: 30, radius: 50 });
  const fb = b.add('fx.feedback', 1680, 0, { decay: 86, zoom: 102, rot: 1 });
  const pj = b.add('out.projector', 1960, 20);
  const scope = b.add('ctl.scope', 560, 360, { min: 0, max: 100 }, { title: 'Bass level' });
  b.link(an, 'low', sm, 'in');
  b.link(sm, 'out', sc, 'in');
  b.link(sm, 'out', scope, 'in');
  b.link(sc, 'out', ring, 'w');
  b.link(sc, 'out', ring, 'h');
  b.link(ring, 'out', col, 'video');
  b.link(an, 'beat', rnd, 'trig');
  b.link(rnd, 'out', col, 'hue');
  b.link(col, 'out', glow, 'video');
  b.link(an, 'level', lvl, 'in');
  b.link(lvl, 'out', glow, 'amt');
  b.link(glow, 'out', fb, 'video');
  b.link(fb, 'out', pj, 'video');
  save('03-Audio-Reactive', p);
}

// ------------------------------------------------------------- 04 MIDI and OSC
{
  const p = createProject();
  const s = p.scenes[0];
  s.name = 'Remote Control';
  const b = builder(s);
  b.note(-440, 0, 'Control the crossfade three ways:\n\n• MIDI controller CC 1 (any channel)\n• OSC message /kami/mix with a value 0–1 (port in Preferences, default 8000)\n• The on-screen slider\n\nPress the space bar to blackout. The OSC Send module echoes the mix to 127.0.0.1:9000.', 'MIDI & OSC', '#c9a2ff');
  const a = b.add('src.gradient', 0, 0, { kind: 'angular', a: '#1b2a6b', b: '#56e0c4', speed: 0.05 }, { title: 'Look A' });
  const bb = b.add('src.pattern', 0, 380, { kind: 'checker', count: 12, a: '#111', b: '#f2a93b', angle: 15 }, { title: 'Look B' });
  const mix = b.add('comp.mixer', 300, 120, { mode: 'iris', soft: 12 });
  const pj = b.add('out.projector', 580, 140);
  const midi = b.add('io.midicc', 0, 760, { chan: 0, cc: 1 });
  const osc = b.add('io.oscin', 0, 1000, { addr: '/kami/mix' });
  const oscScale = b.add('math.scale', 280, 1000, { inMin: 0, inMax: 1, outMin: 0, outMax: 100 }, { title: 'OSC 0–1 → %' });
  const slider = b.add('ctl.slider', 280, 760, { min: 0, max: 100 }, { props: { value: 50, label: 'Crossfade' }, title: 'Crossfade' });
  const merge = b.add('logic.switch', 560, 760, { sel: 3 }, { props: { count: 3 }, title: 'Last touched' });
  const sliderMoved = b.add('logic.change', 280, 1260, {}, { title: 'Slider moved' });
  const which = b.add('util.trigmerge', 560, 1060, {}, { title: 'Which source' });
  const key = b.add('io.key', 840, 760, { key: 'space' });
  const tog = b.add('logic.toggle', 1100, 760, { init: 1 }, { title: 'Blackout toggle' });
  const outOsc = b.add('io.oscout', 840, 1000, { host: '127.0.0.1', port: 9000, addr: '/kami/mix/echo' });
  b.link(a, 'out', mix, 'a');
  b.link(bb, 'out', mix, 'b');
  b.link(mix, 'out', pj, 'video');
  b.link(midi, 'pct', merge, 'i1');
  b.link(osc, 'a1', oscScale, 'in');
  b.link(oscScale, 'out', merge, 'i2');
  b.link(slider, 'out', merge, 'i3');
  b.link(midi, 'raw', which, 't1');
  b.link(osc, 'recv', which, 't2');
  b.link(slider, 'out', sliderMoved, 'in');
  b.link(sliderMoved, 'changed', which, 't3');
  b.link(which, 'which', merge, 'sel');
  b.link(merge, 'out', mix, 'mix');
  b.link(merge, 'out', outOsc, 'a1');
  b.link(key, 'press', tog, 'trig');
  b.link(tog, 'out', pj, 'active');
  save('04-MIDI-and-OSC', p);
}

// ------------------------------------------------------------- 05 Video Feedback
{
  const p = createProject();
  const s = p.scenes[0];
  s.name = 'Feedback Tunnel';
  const b = builder(s);
  b.note(-420, 0, 'Classic video feedback: each frame is drawn over a slightly zoomed, rotated and hue-shifted copy of the previous one.\n\nDrag the XY pad to move the seed shape. Try Persistence 97 and Zoom 103.', 'Feedback', '#ff9fd0');
  const xy = b.add('ctl.xy', 0, 380, {}, { props: { value: [50, 40] }, title: 'Seed position' });
  const sx = b.add('math.scale', 260, 380, { inMin: 0, inMax: 100, outMin: -80, outMax: 80 }, { title: 'X' });
  const sy = b.add('math.scale', 260, 640, { inMin: 0, inMax: 100, outMin: 80, outMax: -80 }, { title: 'Y' });
  const shape = b.add('src.shape', 0, 0, { kind: 'polygon', sides: 3, w: 10, h: 10, fill: '#56e0c4', line: 12 });
  const fb = b.add('fx.feedback', 300, 0, { decay: 95, zoom: 102.5, rot: 1.2, hue: 2.5, mode: 'lighten' });
  const glow = b.add('fx.glow', 580, 0, { thresh: 50, radius: 30, amt: 90 });
  const vig = b.add('fx.vignette', 860, 0, { amt: 70 });
  const pj = b.add('out.projector', 1140, 20);
  b.link(xy, 'x', sx, 'in');
  b.link(xy, 'y', sy, 'in');
  b.link(sx, 'out', shape, 'x');
  b.link(sy, 'out', shape, 'y');
  b.link(shape, 'out', fb, 'video');
  b.link(fb, 'out', glow, 'video');
  b.link(glow, 'out', vig, 'video');
  b.link(vig, 'out', pj, 'video');
  save('05-Video-Feedback', p);
}

// ------------------------------------------------------------- 06 Show Cues
{
  const p = createProject();
  const titles = [
    ['Preset', 'House open. Holding on a slow texture.', 0],
    ['Act One', 'Cue on the first line of dialogue.', 2],
    ['Storm', 'Auto-follows to Calm after 12 seconds.', 1],
    ['Calm', 'Hold until the actor exits.', 4],
    ['Blackout', 'End of show.', 3],
  ];
  p.scenes = titles.map(([name, notes, fade], i) => {
    const s = createScene(name);
    s.notes = notes;
    s.fadeIn = fade;
    const b = builder(s);
    if (name === 'Blackout') { b.note(0, 0, 'Nothing is projected in this scene: the stage fades to black over the scene\'s 3 s cross-fade.', 'Blackout'); return s; }
    const looks = {
      Preset: ['src.noise', { scale: 1.6, speed: 0.04, a: '#05070c', b: '#2a3550' }],
      'Act One': ['src.gradient', { kind: 'linear', a: '#2c1a0e', b: '#f2a93b', angle: 100, speed: 0.03 }],
      Storm: ['src.noise', { scale: 7, speed: 1.2, contrast: 2.4, a: '#020308', b: '#b9d4ff' }],
      Calm: ['src.gradient', { kind: 'radial', a: '#7fb6d9', b: '#0a1724', scale: 160 }],
    };
    const [type, vals] = looks[name];
    const src = b.add(type, 0, 0, vals);
    const txt = b.add('src.text', 0, 380, { text: `${i}. ${name}`, size: 6, y: 80, color: '#e8e4da' }, { title: 'Cue label' });
    const pj = b.add('out.projector', 300, 20);
    const pt = b.add('out.projector', 300, 400, { layer: 1 }, { title: 'Label projector' });
    b.link(src, 'out', pj, 'video');
    b.link(txt, 'out', pt, 'video');
    if (name === 'Act One') {
      const col = b.add('fx.color', 300, 760, {}, { title: 'Warmth grade' });
      s.links = s.links.filter((l) => l.to[0] !== pj.id);
      b.link(src, 'out', col, 'video');
      b.link(col, 'out', pj, 'video');
      const warmth = b.add('ctl.slider', 0, 760, { min: -40, max: 40 }, { props: { value: 0, label: 'Warmth' }, title: 'Warmth' });
      b.link(warmth, 'out', col, 'hue');
      const flashBtn = b.add('ctl.button', 0, 1000, {}, { props: { label: 'FLASH' }, title: 'Flash' });
      const env = b.add('gen.envelope', 300, 1000, { attack: 0.01, hold: 0.1, release: 0.8, low: 0, high: 80, curve: 'ease out' });
      b.link(flashBtn, 'press', env, 'trig');
      b.link(env, 'out', col, 'bri');
      const labels = b.add('ctl.toggle', 600, 1000, {}, { props: { value: 1 }, title: 'Cue labels' });
      b.link(labels, 'out', pt, 'active');
      const level = b.add('ctl.monitor', 600, 760, {}, { props: { label: 'Flash level' }, title: 'Flash level' });
      b.link(env, 'out', level, 'in');
    }
    if (name === 'Storm') {
      const start = b.add('scene.enter', 600, 0, { delay: 12 }, { title: 'Auto-follow' });
      const jump = b.add('scene.jump', 860, 0, { mode: 'next', fade: -1 });
      b.link(start, 'trig', jump, 'trig');
      const flash = b.add('gen.pulse', 600, 360, { mode: 'Interval (s)', rate: 2.3 }, { title: 'Lightning' });
      const env = b.add('gen.envelope', 860, 360, { attack: 0.02, hold: 0.05, release: 0.4, low: 0, high: 70, curve: 'ease out' });
      const glow = b.add('fx.color', 300, 760, { bri: 0 });
      b.link(flash, 'pulse', env, 'trig');
      b.link(env, 'out', glow, 'bri');
      s.links = s.links.filter((l) => l.to[0] !== pj.id);
      b.link(src, 'out', glow, 'video');
      b.link(glow, 'out', pj, 'video');
    }
    return s;
  });
  save('06-Show-Cues', p);
}
