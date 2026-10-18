import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/nodes/index.js';
import { SoundAnalysis, estimateBpm, reactValue, SPECTRUM_BINS } from '../src/audio/analysis.js';
import { Engine } from '../src/core/engine.js';
import { createProject, uid } from '../src/core/project.js';

const SR = 48000;
const BINS = 1024; // fftSize 2048
const hzBin = (hz) => Math.round(hz / (SR / 2 / BINS));

function frame({ tones = [], amp = 0.3 } = {}) {
  const freq = new Uint8Array(BINS);
  for (const [hz, level] of tones) {
    const b = hzBin(hz);
    for (let i = Math.max(0, b - 2); i <= Math.min(BINS - 1, b + 2); i++) freq[i] = Math.max(freq[i], level);
  }
  const time = new Uint8Array(2048);
  for (let i = 0; i < time.length; i++) time[i] = 128 + Math.round(127 * amp * Math.sin(i / 7));
  return { freq, time };
}

function run(a, frames, settings) {
  let t = 0;
  let beats = 0;
  for (const f of frames) {
    t += 1 / 60;
    a.process(f.freq, f.time, SR, 1 / 60, t, settings);
    if (a.values.beat) beats++;
  }
  return beats;
}

test('bands separate bass, mids and treble', () => {
  const a = new SoundAnalysis();
  run(a, Array.from({ length: 30 }, () => frame({ tones: [[60, 230]] })));
  assert.ok(a.values.bass > 70, `bass ${a.values.bass}`);
  assert.ok(a.values.treble < 10, `treble ${a.values.treble}`);
  const b = new SoundAnalysis();
  run(b, Array.from({ length: 30 }, () => frame({ tones: [[6000, 230]] })));
  assert.ok(b.values.treble > 70, `treble ${b.values.treble}`);
  assert.ok(b.values.bass < 10, `bass ${b.values.bass}`);
});

test('silence keeps everything still', () => {
  const a = new SoundAnalysis();
  const beats = run(a, Array.from({ length: 120 }, () => frame({ amp: 0 })));
  assert.equal(beats, 0);
  assert.equal(a.values.level, 0);
  assert.equal(a.values.bass, 0);
  assert.equal(a.values.active, false);
  assert.ok(a.spectrum.every((x) => x === 0));
});

test('auto-level lets quiet sound reach the full range', () => {
  const quiet = new SoundAnalysis();
  run(quiet, Array.from({ length: 90 }, () => frame({ tones: [[80, 60]], amp: 0.05 })));
  assert.ok(quiet.values.bass > 70, `auto-level bass ${quiet.values.bass}`);
  const manual = new SoundAnalysis();
  run(manual, Array.from({ length: 90 }, () => frame({ tones: [[80, 60]], amp: 0.05 })), { autoLevel: false, gain: 100, sensitivity: 50, smoothing: 40 });
  assert.ok(manual.values.bass < quiet.values.bass, 'without auto-level the same sound reads lower');
});

test('kick drums at 120 BPM are detected and the tempo estimated', () => {
  const a = new SoundAnalysis();
  const frames = [];
  for (let i = 0; i < 60 * 8; i++) {
    const kick = i % 30 < 3; // 2 beats per second
    frames.push(frame({ tones: kick ? [[60, 250], [3000, 90]] : [[60, 40], [3000, 90]], amp: kick ? 0.6 : 0.15 }));
  }
  const beats = run(a, frames);
  assert.ok(beats >= 13 && beats <= 17, `beats ${beats}`);
  assert.ok(Math.abs(a.values.bpm - 120) < 6, `bpm ${a.values.bpm}`);
  assert.equal(a.values.beatCount, beats);
});

test('spectrum is low on the left and high on the right', () => {
  const a = new SoundAnalysis();
  run(a, Array.from({ length: 20 }, () => frame({ tones: [[60, 240]] })));
  const left = Math.max(...a.spectrum.slice(0, SPECTRUM_BINS / 4));
  const right = Math.max(...a.spectrum.slice((SPECTRUM_BINS * 3) / 4));
  assert.ok(left > 0.8 && right < 0.05, `left ${left} right ${right}`);
});

test('estimateBpm folds half and double time into range', () => {
  assert.equal(Math.round(estimateBpm([0.5, 0.5, 0.5, 0.5])), 120);
  assert.equal(Math.round(estimateBpm([1, 1, 1, 1])), 120);   // 60 → 120
  assert.equal(Math.round(estimateBpm([0.3, 0.3, 0.3])), 100); // 200 → 100
  assert.equal(estimateBpm([0.5]), 0);
});

test('reactValue maps bands into the chosen range and pulses on beats', () => {
  const st = {};
  const v = reactValue({ band: 'bass', min: 100, max: 200, smooth: 0 }, { bass: 50 }, st, 1 / 60);
  assert.equal(v, 150);
  const inv = reactValue({ band: 'bass', min: 0, max: 10, smooth: 0, invert: true }, { bass: 100 }, {}, 1 / 60);
  assert.equal(inv, 0);
  const bs = {};
  assert.equal(reactValue({ band: 'beat', min: 0, max: 100, smooth: 30 }, { beat: true }, bs, 0), 100);
  const later = reactValue({ band: 'beat', min: 0, max: 100, smooth: 30 }, { beat: false }, bs, 0.1);
  assert.ok(later < 100 && later > 0, `decaying ${later}`);
});

test('engine applies React to sound bindings and beat-triggers', () => {
  const p = createProject();
  const sc = p.scenes[0];
  const kal = { id: uid(), type: 'fx.kaleido', x: 0, y: 0, values: {}, props: {}, react: { zoom: { band: 'bass', min: 100, max: 200, smooth: 0 } } };
  const cnt = { id: uid(), type: 'gen.counter', x: 0, y: 0, values: { min: 0, max: 100 }, props: {}, react: { inc: { band: 'beat', every: 2 } } };
  sc.nodes.push(kal, cnt);
  const sound = { values: { level: 0, bass: 0, mid: 0, treble: 0, beat: false, beatCount: 0 }, wanted: false, need() { this.wanted = true; } };
  const e = new Engine({ host: { sound } });
  e.load(p);
  const rt = e.runtimes[0];
  let t = 0;
  const step = (vals) => { Object.assign(sound.values, vals); t += 16; e.step(t); };
  step({ bass: 50 });
  assert.equal(rt.nodes.get(kal.id).inputs.zoom, 150);
  step({ bass: 100 });
  assert.equal(rt.nodes.get(kal.id).inputs.zoom, 200);
  for (let i = 1; i <= 6; i++) { step({ beat: true, beatCount: i }); step({ beat: false }); }
  assert.equal(rt.nodes.get(cnt.id).outputs.out, 3, 'fires on every 2nd beat');
  for (let i = 0; i < 40; i++) step({});
  assert.equal(sound.wanted, true, 'engine asks the sound engine to start listening');
});

test('sound modules instantiate without a sound engine', () => {
  for (const type of ['audio.sound', 'audio.analyzer', 'src.visualizer', 'src.colororgan', 'fx.soundpulse']) {
    const p = createProject();
    p.scenes[0].nodes.push({ id: uid(), type, x: 0, y: 0, values: {}, props: {} });
    const e = new Engine();
    e.load(p);
    for (let t = 0; t < 100; t += 16) e.step(t);
    const n = [...e.runtimes[0].nodes.values()][0];
    assert.ok(!n.error, `${type}: ${n.error}`);
  }
});

test('beat detection survives an uneven frame rate', () => {
  const a = new SoundAnalysis();
  let t = 0, beats = 0;
  for (let i = 0; i < 600; i++) {
    const dt = [1 / 60, 1 / 30, 1 / 20, 1 / 15][i % 4] * (i % 50 === 0 ? 4 : 1);
    t += dt;
    const kick = (t % 0.5) < 0.06;
    const f = frame({ tones: kick ? [[60, 250]] : [[60, 50]], amp: kick ? 0.6 : 0.15 });
    a.process(f.freq, f.time, SR, dt, t, undefined);
    if (a.values.beat) beats++;
  }
  const expected = t / 0.5;
  assert.ok(beats > expected * 0.7 && beats <= expected + 1, `beats ${beats} of ~${Math.round(expected)}`);
});
