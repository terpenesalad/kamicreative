// KamiCreative — Generators, Math and Logic modules.

import { defineNode } from '../core/registry.js';
import { compileExpression } from '../core/expr.js';

const G = 'Generators', M = 'Math', L = 'Logic';

// --------------------------------------------------------------- Generators

const WAVES = ['sine', 'triangle', 'sawtooth', 'ramp down', 'square', 'random', 'smooth random'];

function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

export function waveValue(shape, phase, seed = 0) {
  const p = phase - Math.floor(phase);
  switch (shape) {
    case 'sine': return 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    case 'triangle': return p < 0.5 ? p * 2 : 2 - p * 2;
    case 'sawtooth': return p;
    case 'ramp down': return 1 - p;
    case 'square': return p < 0.5 ? 1 : 0;
    case 'random': return hash(Math.floor(phase) + seed);
    case 'smooth random': {
      const i = Math.floor(phase), f = p * p * (3 - 2 * p);
      return hash(i + seed) * (1 - f) + hash(i + 1 + seed) * f;
    }
    default: return 0;
  }
}

defineNode({
  type: 'gen.wave', name: 'Wave Generator', category: G,
  description: 'Continuously outputs a periodic waveform scaled between Min and Max.',
  keywords: ['lfo', 'oscillator', 'sine', 'saw', 'square'],
  inputs: [
    { id: 'run', name: 'Run', type: 'bool', default: 1 },
    { id: 'shape', name: 'Waveform', type: 'enum', options: WAVES, default: 'sine' },
    { id: 'freq', name: 'Frequency (Hz)', type: 'number', default: 0.5, min: 0, max: 100, step: 0.01 },
    { id: 'min', name: 'Min', type: 'number', default: 0 },
    { id: 'max', name: 'Max', type: 'number', default: 100 },
    { id: 'phase', name: 'Phase', type: 'number', default: 0, min: 0, max: 1, step: 0.01 },
    { id: 'reset', name: 'Reset', type: 'trigger' },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  create(n) { n.state.phase = 0; n.state.seed = Math.random() * 1000; },
  update(n, ctx, port) { if (port === 'reset') n.state.phase = 0; },
  tick(n, ctx) {
    const i = n.inputs;
    if (i.run) n.state.phase += ctx.dt * i.freq;
    const w = waveValue(i.shape, n.state.phase + i.phase, n.state.seed);
    ctx.out(n, 'out', i.min + (i.max - i.min) * w);
  },
});

defineNode({
  type: 'gen.pulse', name: 'Pulse Generator', category: G,
  description: 'Fires a trigger at a steady rate, set in Hz or BPM.',
  keywords: ['metro', 'metronome', 'clock', 'bpm', 'timer'],
  inputs: [
    { id: 'run', name: 'Run', type: 'bool', default: 1 },
    { id: 'mode', name: 'Rate Mode', type: 'enum', options: ['Hz', 'BPM', 'Interval (s)'], default: 'Hz' },
    { id: 'rate', name: 'Rate', type: 'number', default: 1, min: 0, step: 0.01 },
  ],
  outputs: [{ id: 'pulse', name: 'Pulse', type: 'trigger' }, { id: 'count', name: 'Count', type: 'number' }],
  create(n) { n.state.acc = 0; n.state.count = 0; },
  tick(n, ctx) {
    const { run, mode, rate } = n.inputs;
    if (!run || rate <= 0) return;
    const period = mode === 'Hz' ? 1 / rate : mode === 'BPM' ? 60 / rate : rate;
    n.state.acc += ctx.dt;
    if (n.state.acc >= period) {
      n.state.acc %= period;
      n.state.count++;
      ctx.out(n, 'count', n.state.count);
      ctx.fire(n, 'pulse');
    }
  },
});

defineNode({
  type: 'gen.beat', name: 'Beat Clock', category: G,
  description: 'Musical clock: beat and bar triggers, beat count and phase for tempo-synced visuals.',
  keywords: ['bpm', 'tempo', 'bar', 'music'],
  inputs: [
    { id: 'run', name: 'Run', type: 'bool', default: 1 },
    { id: 'bpm', name: 'BPM', type: 'number', default: 120, min: 1, max: 999 },
    { id: 'beats', name: 'Beats / Bar', type: 'number', default: 4, min: 1, max: 32, int: true },
    { id: 'tap', name: 'Tap Tempo', type: 'trigger' },
    { id: 'reset', name: 'Reset', type: 'trigger' },
  ],
  outputs: [
    { id: 'beat', name: 'Beat', type: 'trigger' },
    { id: 'bar', name: 'Bar', type: 'trigger' },
    { id: 'beatNum', name: 'Beat #', type: 'number' },
    { id: 'phase', name: 'Beat Phase', type: 'number' },
    { id: 'bpmOut', name: 'BPM', type: 'number' },
  ],
  create(n) { n.state = { pos: 0, beat: 0, taps: [] }; },
  update(n, ctx, port) {
    if (port === 'reset') { n.state.pos = 0; n.state.beat = 0; }
    if (port === 'tap') {
      const t = ctx.time, taps = n.state.taps.filter((x) => t - x < 3);
      taps.push(t);
      n.state.taps = taps;
      if (taps.length >= 2) {
        const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
        n.state.tapBpm = Math.round((60 / avg) * 10) / 10;
      }
    }
    ctx.out(n, 'bpmOut', n.state.tapBpm || n.inputs.bpm);
  },
  tick(n, ctx) {
    if (!n.inputs.run) return;
    const bpm = n.state.tapBpm || n.inputs.bpm;
    n.state.pos += (ctx.dt * bpm) / 60;
    if (n.state.pos >= 1) {
      n.state.pos -= Math.floor(n.state.pos);
      n.state.beat = (n.state.beat + 1) % Math.max(1, n.inputs.beats);
      ctx.out(n, 'beatNum', n.state.beat + 1);
      ctx.fire(n, 'beat');
      if (n.state.beat === 0) ctx.fire(n, 'bar');
    }
    ctx.out(n, 'phase', n.state.pos);
  },
});

const CURVES = ['linear', 'ease in', 'ease out', 'ease in-out', 'exponential'];
export function ease(curve, t) {
  t = Math.min(1, Math.max(0, t));
  switch (curve) {
    case 'ease in': return t * t * t;
    case 'ease out': return 1 - Math.pow(1 - t, 3);
    case 'ease in-out': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'exponential': return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    default: return t;
  }
}

defineNode({
  type: 'gen.envelope', name: 'Envelope Generator', category: G,
  description: 'Attack / hold / release envelope started by a trigger. Great for flashes, fades and swells.',
  keywords: ['adsr', 'fade', 'ramp', 'flash'],
  inputs: [
    { id: 'trig', name: 'Trigger', type: 'trigger' },
    { id: 'attack', name: 'Attack (s)', type: 'number', default: 0.5, min: 0, step: 0.01 },
    { id: 'hold', name: 'Hold (s)', type: 'number', default: 0, min: 0, step: 0.01 },
    { id: 'release', name: 'Release (s)', type: 'number', default: 1, min: 0, step: 0.01 },
    { id: 'low', name: 'Low', type: 'number', default: 0 },
    { id: 'high', name: 'High', type: 'number', default: 100 },
    { id: 'curve', name: 'Curve', type: 'enum', options: CURVES, default: 'ease in-out' },
    { id: 'stop', name: 'Stop', type: 'trigger' },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }, { id: 'done', name: 'Done', type: 'trigger' }, { id: 'active', name: 'Active', type: 'bool' }],
  create(n) { n.state.t = -1; },
  update(n, ctx, port, start) {
    if (port === 'trig') { n.state.t = 0; ctx.out(n, 'active', 1); }
    if (port === 'stop') { n.state.t = -1; ctx.out(n, 'active', 0); }
    if (start) ctx.out(n, 'out', n.inputs.low);
  },
  tick(n, ctx) {
    if (n.state.t < 0) return;
    const { attack, hold, release, low, high, curve } = n.inputs;
    n.state.t += ctx.dt;
    const t = n.state.t;
    let v;
    if (t < attack) v = ease(curve, attack > 0 ? t / attack : 1);
    else if (t < attack + hold) v = 1;
    else if (t < attack + hold + release) v = 1 - ease(curve, release > 0 ? (t - attack - hold) / release : 1);
    else {
      v = 0;
      n.state.t = -1;
      ctx.out(n, 'out', low);
      ctx.out(n, 'active', 0);
      ctx.fire(n, 'done');
      return;
    }
    ctx.out(n, 'out', low + (high - low) * v);
  },
});

defineNode({
  type: 'gen.ramp', name: 'Ramp', category: G,
  description: 'Glides from the current value to a target over a duration whenever Go is triggered (or the target changes, if Auto is on).',
  keywords: ['line', 'tween', 'interpolate', 'fade', 'glide'],
  inputs: [
    { id: 'target', name: 'Target', type: 'number', default: 100 },
    { id: 'time', name: 'Duration (s)', type: 'number', default: 2, min: 0, step: 0.01 },
    { id: 'curve', name: 'Curve', type: 'enum', options: CURVES, default: 'ease in-out' },
    { id: 'auto', name: 'Auto Go', type: 'bool', default: 1 },
    { id: 'go', name: 'Go', type: 'trigger' },
    { id: 'jump', name: 'Jump', type: 'trigger' },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }, { id: 'done', name: 'Done', type: 'trigger' }],
  create(n) { n.state = { from: 0, cur: 0, t: -1 }; },
  update(n, ctx, port, start) {
    if (start) { n.state.cur = n.inputs.target; ctx.out(n, 'out', n.state.cur); return; }
    if (port === 'jump') { n.state.cur = n.inputs.target; n.state.t = -1; ctx.out(n, 'out', n.state.cur); return; }
    if (port === 'go' || (port === 'target' && n.inputs.auto)) {
      n.state.from = n.state.cur;
      n.state.t = 0;
    }
  },
  tick(n, ctx) {
    if (n.state.t < 0) return;
    const d = n.inputs.time;
    n.state.t += ctx.dt;
    const k = d > 0 ? n.state.t / d : 1;
    n.state.cur = n.state.from + (n.inputs.target - n.state.from) * ease(n.inputs.curve, k);
    ctx.out(n, 'out', n.state.cur);
    if (k >= 1) { n.state.t = -1; ctx.fire(n, 'done'); }
  },
});

defineNode({
  type: 'gen.random', name: 'Random', category: G,
  description: 'Outputs a new random number each time it is triggered.',
  inputs: [
    { id: 'trig', name: 'Trigger', type: 'trigger' },
    { id: 'min', name: 'Min', type: 'number', default: 0 },
    { id: 'max', name: 'Max', type: 'number', default: 100 },
    { id: 'int', name: 'Whole Numbers', type: 'bool', default: 0 },
    { id: 'norepeat', name: 'No Repeats', type: 'bool', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  update(n, ctx, port) {
    if (port !== 'trig') return;
    const { min, max, int, norepeat } = n.inputs;
    let v;
    for (let tries = 0; tries < 16; tries++) {
      v = int ? Math.floor(min + Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) : min + Math.random() * (max - min);
      if (!norepeat || v !== n.outputs.out) break;
    }
    ctx.out(n, 'out', v, true);
  },
});

defineNode({
  type: 'gen.counter', name: 'Counter', category: G,
  description: 'Counts up or down on triggers within a range, with wrap, clamp or ping-pong behaviour.',
  inputs: [
    { id: 'inc', name: 'Add', type: 'trigger' },
    { id: 'dec', name: 'Subtract', type: 'trigger' },
    { id: 'reset', name: 'Reset', type: 'trigger' },
    { id: 'step', name: 'Step', type: 'number', default: 1 },
    { id: 'min', name: 'Min', type: 'number', default: 0 },
    { id: 'max', name: 'Max', type: 'number', default: 10 },
    { id: 'mode', name: 'At Limit', type: 'enum', options: ['wrap', 'clamp', 'ping-pong'], default: 'wrap' },
  ],
  outputs: [{ id: 'out', name: 'Count', type: 'number' }, { id: 'limit', name: 'Hit Limit', type: 'trigger' }],
  create(n) { n.state = { v: 0, dir: 1 }; },
  update(n, ctx, port, start) {
    const { step, min, max, mode } = n.inputs;
    if (start || port === 'reset') { n.state.v = min; n.state.dir = 1; ctx.out(n, 'out', min, true); return; }
    if (port !== 'inc' && port !== 'dec') return;
    let d = (port === 'inc' ? step : -step) * (mode === 'ping-pong' ? n.state.dir : 1);
    let v = n.state.v + d;
    let hit = false;
    if (v > max || v < min) {
      hit = true;
      if (mode === 'wrap') v = v > max ? min : max;
      else if (mode === 'clamp') v = Math.min(max, Math.max(min, v));
      else { n.state.dir *= -1; v = n.state.v - d; }
    }
    n.state.v = v;
    ctx.out(n, 'out', v, true);
    if (hit) ctx.fire(n, 'limit');
  },
});

defineNode({
  type: 'gen.stopwatch', name: 'Stopwatch', category: G,
  description: 'Measures elapsed time while running. Outputs seconds and a formatted clock string.',
  keywords: ['timer', 'time', 'elapsed'],
  inputs: [
    { id: 'run', name: 'Run', type: 'bool', default: 1 },
    { id: 'reset', name: 'Reset', type: 'trigger' },
    { id: 'alarm', name: 'Alarm At (s)', type: 'number', default: 0, min: 0 },
  ],
  outputs: [{ id: 'sec', name: 'Seconds', type: 'number' }, { id: 'clock', name: 'Clock', type: 'text' }, { id: 'alarm', name: 'Alarm', type: 'trigger' }],
  create(n) { n.state.t = 0; n.state.fired = false; },
  update(n, ctx, port) { if (port === 'reset') { n.state.t = 0; n.state.fired = false; } },
  tick(n, ctx) {
    if (n.inputs.run) n.state.t += ctx.dt;
    const t = n.state.t;
    ctx.out(n, 'sec', Math.round(t * 100) / 100);
    const mm = Math.floor(t / 60), ss = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    ctx.out(n, 'clock', `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`);
    if (n.inputs.alarm > 0 && !n.state.fired && t >= n.inputs.alarm) { n.state.fired = true; ctx.fire(n, 'alarm'); }
  },
});

defineNode({
  type: 'gen.systime', name: 'System Time', category: G,
  description: 'Current wall-clock time and date, for scheduled installations.',
  keywords: ['clock', 'date', 'hour', 'schedule'],
  inputs: [],
  outputs: [
    { id: 'h', name: 'Hour', type: 'number' }, { id: 'm', name: 'Minute', type: 'number' },
    { id: 's', name: 'Second', type: 'number' }, { id: 'dow', name: 'Weekday (0=Sun)', type: 'number' },
    { id: 'text', name: 'Time Text', type: 'text' }, { id: 'date', name: 'Date Text', type: 'text' },
    { id: 'minute', name: 'Each Minute', type: 'trigger' },
  ],
  tick(n, ctx) {
    const d = new Date();
    const s = d.getSeconds();
    if (n.state.lastS === s) return;
    n.state.lastS = s;
    ctx.out(n, 'h', d.getHours()); ctx.out(n, 'm', d.getMinutes()); ctx.out(n, 's', s); ctx.out(n, 'dow', d.getDay());
    ctx.out(n, 'text', d.toLocaleTimeString());
    ctx.out(n, 'date', d.toLocaleDateString());
    if (s === 0) ctx.fire(n, 'minute');
  },
});

// --------------------------------------------------------------------- Math

const OPS = {
  '+': (a, b) => a + b, '-': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => (b === 0 ? 0 : a / b),
  mod: (a, b) => (b === 0 ? 0 : ((a % b) + b) % b), min: Math.min, max: Math.max, power: Math.pow,
  average: (a, b) => (a + b) / 2, difference: (a, b) => Math.abs(a - b), atan2: (a, b) => (Math.atan2(a, b) * 180) / Math.PI,
};

defineNode({
  type: 'math.calc', name: 'Calculator', category: M,
  description: 'Combines two numbers with an operator.',
  keywords: ['add', 'multiply', 'subtract', 'divide', 'arithmetic'],
  inputs: [
    { id: 'a', name: 'Value 1', type: 'number', default: 0 },
    { id: 'op', name: 'Operator', type: 'enum', options: Object.keys(OPS), default: '+' },
    { id: 'b', name: 'Value 2', type: 'number', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Result', type: 'number' }],
  update(n, ctx) { const { a, b, op } = n.inputs; ctx.out(n, 'out', (OPS[op] || OPS['+'])(a, b)); },
});

defineNode({
  type: 'math.expr', name: 'Expression', category: M,
  description: 'Evaluates a formula using inputs a, b, c, d and time t. Example: sin(t * 2) * a + b',
  keywords: ['formula', 'equation', 'script'],
  inputs: [
    { id: 'expr', name: 'Formula', type: 'text', default: 'a * b' },
    { id: 'a', name: 'a', type: 'number', default: 1 },
    { id: 'b', name: 'b', type: 'number', default: 1 },
    { id: 'c', name: 'c', type: 'number', default: 0 },
    { id: 'd', name: 'd', type: 'number', default: 0 },
    { id: 'live', name: 'Evaluate Every Frame', type: 'bool', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Result', type: 'number' }],
  update(n, ctx, port) {
    if (port === 'expr' || port === null || !n.state.fn) {
      try { n.state.fn = compileExpression(n.inputs.expr); n.error = null; }
      catch (e) { n.state.fn = () => 0; n.error = `Formula: ${e.message}`; }
    }
    this.eval(n, ctx);
  },
  eval(n, ctx) {
    const i = n.inputs;
    ctx.out(n, 'out', n.state.fn({ a: i.a, b: i.b, c: i.c, d: i.d, t: ctx.time }));
  },
  tick(n, ctx) { if (n.inputs.live && n.state.fn) this.eval(n, ctx); },
});

defineNode({
  type: 'math.scale', name: 'Map Range', category: M,
  description: 'Rescales a value from one range to another, with optional clamping and curve.',
  keywords: ['scale', 'map', 'range', 'normalize', 'limit-scale'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'inMin', name: 'In Min', type: 'number', default: 0 },
    { id: 'inMax', name: 'In Max', type: 'number', default: 127 },
    { id: 'outMin', name: 'Out Min', type: 'number', default: 0 },
    { id: 'outMax', name: 'Out Max', type: 'number', default: 100 },
    { id: 'clamp', name: 'Clamp', type: 'bool', default: 1 },
    { id: 'curve', name: 'Curve', type: 'enum', options: CURVES, default: 'linear' },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  update(n, ctx) {
    const i = n.inputs;
    let t = i.inMax === i.inMin ? 0 : (i.in - i.inMin) / (i.inMax - i.inMin);
    if (i.clamp) t = Math.min(1, Math.max(0, t));
    if (i.curve !== 'linear') t = ease(i.curve, t);
    ctx.out(n, 'out', i.outMin + (i.outMax - i.outMin) * t);
  },
});

defineNode({
  type: 'math.limit', name: 'Limit', category: M,
  description: 'Keeps a value within Min / Max by clamping, wrapping or folding.',
  keywords: ['clamp', 'wrap', 'fold', 'constrain'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'min', name: 'Min', type: 'number', default: 0 },
    { id: 'max', name: 'Max', type: 'number', default: 100 },
    { id: 'mode', name: 'Mode', type: 'enum', options: ['clamp', 'wrap', 'fold'], default: 'clamp' },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  update(n, ctx) {
    const { in: v, min, max, mode } = n.inputs;
    const r = max - min;
    let o;
    if (r <= 0) o = min;
    else if (mode === 'wrap') o = min + ((((v - min) % r) + r) % r);
    else if (mode === 'fold') { const k = ((((v - min) % (2 * r)) + 2 * r) % (2 * r)); o = min + (k > r ? 2 * r - k : k); }
    else o = Math.min(max, Math.max(min, v));
    ctx.out(n, 'out', o);
  },
});

defineNode({
  type: 'math.smooth', name: 'Smoother', category: M,
  description: 'Smooths jumpy values (sensors, audio, MIDI) by gliding towards the input.',
  keywords: ['lag', 'filter', 'ease', 'slew', 'low pass'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'amount', name: 'Smoothing', type: 'number', default: 80, min: 0, max: 99.9 },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  create(n) { n.state.v = null; },
  update(n, ctx, port, start) { if (start || n.state.v === null) { n.state.v = n.inputs.in; ctx.out(n, 'out', n.state.v); } },
  tick(n, ctx) {
    const target = n.inputs.in;
    const k = Math.pow(n.inputs.amount / 100, ctx.dt * 60);
    n.state.v = target + (n.state.v - target) * k;
    if (Math.abs(n.state.v - target) < 1e-6) n.state.v = target;
    ctx.out(n, 'out', n.state.v);
  },
});

defineNode({
  type: 'math.round', name: 'Round', category: M,
  description: 'Rounds a value, or quantises it to a step size.',
  keywords: ['integer', 'floor', 'ceil', 'quantize', 'snap'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'mode', name: 'Mode', type: 'enum', options: ['round', 'floor', 'ceil', 'truncate'], default: 'round' },
    { id: 'step', name: 'Step', type: 'number', default: 1, min: 0 },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  update(n, ctx) {
    const { in: v, mode, step } = n.inputs;
    const s = step > 0 ? step : 1;
    const f = { round: Math.round, floor: Math.floor, ceil: Math.ceil, truncate: Math.trunc }[mode] || Math.round;
    ctx.out(n, 'out', +(f(v / s) * s).toFixed(10));
  },
});

const FUNCS = {
  abs: Math.abs, negate: (x) => -x, reciprocal: (x) => (x === 0 ? 0 : 1 / x), sqrt: (x) => Math.sqrt(Math.max(0, x)),
  square: (x) => x * x, sin: (x) => Math.sin((x * Math.PI) / 180), cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180), log: (x) => (x > 0 ? Math.log(x) : 0), exp: Math.exp, sign: Math.sign,
  'percent → 0-1': (x) => x / 100, '0-1 → percent': (x) => x * 100, 'MIDI → percent': (x) => (x / 127) * 100,
  'dB → gain': (x) => Math.pow(10, x / 20), 'gain → dB': (x) => (x > 0 ? 20 * Math.log10(x) : -96),
};

defineNode({
  type: 'math.func', name: 'Function', category: M,
  description: 'Applies a single-input math function (trig functions use degrees).',
  keywords: ['abs', 'sin', 'cos', 'sqrt', 'convert'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'fn', name: 'Function', type: 'enum', options: Object.keys(FUNCS), default: 'abs' },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  update(n, ctx) { ctx.out(n, 'out', (FUNCS[n.inputs.fn] || FUNCS.abs)(n.inputs.in)); },
});

defineNode({
  type: 'math.lerp', name: 'Interpolate', category: M,
  description: 'Blends between A and B by Mix (0-100%).',
  keywords: ['lerp', 'mix', 'blend', 'crossfade'],
  inputs: [
    { id: 'a', name: 'A', type: 'number', default: 0 },
    { id: 'b', name: 'B', type: 'number', default: 100 },
    { id: 'mix', name: 'Mix %', type: 'number', default: 50, min: 0, max: 100 },
  ],
  outputs: [{ id: 'out', name: 'Output', type: 'number' }],
  update(n, ctx) { const { a, b, mix } = n.inputs; ctx.out(n, 'out', a + (b - a) * (mix / 100)); },
});

defineNode({
  type: 'math.range', name: 'Inside Range', category: M,
  description: 'Reports whether a value lies within a range, with triggers when it enters or leaves.',
  keywords: ['zone', 'window', 'between'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'low', name: 'Low', type: 'number', default: 25 },
    { id: 'high', name: 'High', type: 'number', default: 75 },
  ],
  outputs: [{ id: 'inside', name: 'Inside', type: 'bool' }, { id: 'enter', name: 'Enter', type: 'trigger' }, { id: 'exit', name: 'Exit', type: 'trigger' }],
  update(n, ctx, port, start) {
    const { in: v, low, high } = n.inputs;
    const inside = v >= Math.min(low, high) && v <= Math.max(low, high) ? 1 : 0;
    const was = n.outputs.inside;
    ctx.out(n, 'inside', inside);
    if (!start && inside !== was) ctx.fire(n, inside ? 'enter' : 'exit');
  },
});

defineNode({
  type: 'math.stats', name: 'Peak & Average', category: M,
  description: 'Tracks running minimum, maximum and average of a value over a window.',
  keywords: ['statistics', 'min', 'max', 'mean', 'analysis'],
  inputs: [
    { id: 'in', name: 'Value', type: 'number', default: 0 },
    { id: 'window', name: 'Window (s)', type: 'number', default: 2, min: 0.05 },
    { id: 'reset', name: 'Reset', type: 'trigger' },
  ],
  outputs: [{ id: 'min', name: 'Min', type: 'number' }, { id: 'max', name: 'Max', type: 'number' }, { id: 'avg', name: 'Average', type: 'number' }],
  create(n) { n.state.buf = []; },
  update(n, ctx, port) { if (port === 'reset') n.state.buf = []; },
  tick(n, ctx) {
    const buf = n.state.buf;
    buf.push([ctx.time, n.inputs.in]);
    while (buf.length && ctx.time - buf[0][0] > n.inputs.window) buf.shift();
    let mn = Infinity, mx = -Infinity, sum = 0;
    for (const [, v] of buf) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; }
    if (!buf.length) return;
    ctx.out(n, 'min', mn); ctx.out(n, 'max', mx); ctx.out(n, 'avg', sum / buf.length);
  },
});

// -------------------------------------------------------------------- Logic

const CMP = { '=': (a, b) => a === b, '≠': (a, b) => a !== b, '<': (a, b) => a < b, '>': (a, b) => a > b, '≤': (a, b) => a <= b, '≥': (a, b) => a >= b };

defineNode({
  type: 'logic.compare', name: 'Comparator', category: L,
  description: 'Compares two values. Outputs on/off plus triggers when the result becomes true or false.',
  keywords: ['compare', 'equal', 'greater', 'less', 'if'],
  inputs: [
    { id: 'a', name: 'Value 1', type: 'number', default: 0 },
    { id: 'op', name: 'Test', type: 'enum', options: Object.keys(CMP), default: '>' },
    { id: 'b', name: 'Value 2', type: 'number', default: 50 },
  ],
  outputs: [{ id: 'out', name: 'Result', type: 'bool' }, { id: 'true', name: 'Became True', type: 'trigger' }, { id: 'false', name: 'Became False', type: 'trigger' }],
  update(n, ctx, port, start) {
    const r = (CMP[n.inputs.op] || CMP['='])(n.inputs.a, n.inputs.b) ? 1 : 0;
    const was = n.outputs.out;
    ctx.out(n, 'out', r);
    if (!start && r !== was) ctx.fire(n, r ? 'true' : 'false');
  },
});

const GATES = {
  AND: (a, b) => a && b, OR: (a, b) => a || b, XOR: (a, b) => !!a !== !!b,
  NAND: (a, b) => !(a && b), NOR: (a, b) => !(a || b), 'NOT A': (a) => !a,
};

defineNode({
  type: 'logic.gate', name: 'Logic Gate', category: L,
  description: 'Boolean logic on two on/off inputs.',
  keywords: ['and', 'or', 'xor', 'not', 'boolean'],
  inputs: [
    { id: 'a', name: 'A', type: 'bool', default: 0 },
    { id: 'op', name: 'Operation', type: 'enum', options: Object.keys(GATES), default: 'AND' },
    { id: 'b', name: 'B', type: 'bool', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'Result', type: 'bool' }],
  update(n, ctx) { ctx.out(n, 'out', (GATES[n.inputs.op] || GATES.AND)(n.inputs.a, n.inputs.b) ? 1 : 0); },
});

defineNode({
  type: 'logic.toggle', name: 'Toggle', category: L,
  description: 'Flips between off and on each time it is triggered (flip-flop).',
  keywords: ['flip flop', 'latch', 'switch'],
  inputs: [
    { id: 'trig', name: 'Toggle', type: 'trigger' },
    { id: 'on', name: 'Set On', type: 'trigger' },
    { id: 'off', name: 'Set Off', type: 'trigger' },
    { id: 'init', name: 'Initial', type: 'bool', default: 0 },
  ],
  outputs: [{ id: 'out', name: 'State', type: 'bool' }, { id: 'rise', name: 'Turned On', type: 'trigger' }, { id: 'fall', name: 'Turned Off', type: 'trigger' }],
  update(n, ctx, port, start) {
    let s = n.outputs.out ? 1 : 0;
    if (start) s = n.inputs.init;
    else if (port === 'trig') s = s ? 0 : 1;
    else if (port === 'on') s = 1;
    else if (port === 'off') s = 0;
    else return;
    const was = n.outputs.out;
    ctx.out(n, 'out', s, start);
    if (!start && s !== was) ctx.fire(n, s ? 'rise' : 'fall');
  },
});

defineNode({
  type: 'logic.gatepass', name: 'Gate', category: L,
  description: 'Passes values (and triggers) through only while Open is on.',
  keywords: ['pass', 'block', 'valve', 'enable'],
  inputs: [
    { id: 'in', name: 'Value', type: 'any', default: 0 },
    { id: 'trig', name: 'Trigger In', type: 'trigger' },
    { id: 'open', name: 'Open', type: 'bool', default: 1 },
  ],
  outputs: [{ id: 'out', name: 'Value', type: 'any' }, { id: 'trigOut', name: 'Trigger Out', type: 'trigger' }],
  update(n, ctx, port) {
    if (!n.inputs.open) return;
    if (port === 'trig') ctx.fire(n, 'trigOut');
    else if (port === 'in' || port === 'open') ctx.out(n, 'out', n.inputs.in);
  },
});

defineNode({
  type: 'logic.delay', name: 'Trigger Delay', category: L,
  description: 'Delays triggers (and optionally values) by a time in seconds. Multiple pending triggers are queued.',
  keywords: ['wait', 'timer', 'later', 'pause'],
  inputs: [
    { id: 'trig', name: 'Trigger', type: 'trigger' },
    { id: 'in', name: 'Value', type: 'any', default: 0 },
    { id: 'delay', name: 'Delay (s)', type: 'number', default: 1, min: 0, step: 0.01 },
    { id: 'cancel', name: 'Cancel', type: 'trigger' },
  ],
  outputs: [{ id: 'trigOut', name: 'Trigger', type: 'trigger' }, { id: 'out', name: 'Value', type: 'any' }],
  create(n) { n.state.q = []; },
  update(n, ctx, port) {
    if (port === 'cancel') { n.state.q = []; return; }
    if (port === 'trig') n.state.q.push({ at: ctx.time + n.inputs.delay, kind: 't' });
    if (port === 'in') n.state.q.push({ at: ctx.time + n.inputs.delay, kind: 'v', v: n.inputs.in });
  },
  tick(n, ctx) {
    const q = n.state.q;
    while (q.length && q[0].at <= ctx.time) {
      const e = q.shift();
      if (e.kind === 't') ctx.fire(n, 'trigOut'); else ctx.out(n, 'out', e.v, true);
    }
  },
});

defineNode({
  type: 'logic.sample', name: 'Sample & Hold', category: L,
  description: 'Captures the input value when triggered and holds it until the next trigger.',
  keywords: ['hold', 'latch', 'capture', 'freeze'],
  inputs: [{ id: 'in', name: 'Value', type: 'any', default: 0 }, { id: 'trig', name: 'Sample', type: 'trigger' }],
  outputs: [{ id: 'out', name: 'Held', type: 'any' }],
  update(n, ctx, port) { if (port === 'trig') ctx.out(n, 'out', n.inputs.in, true); },
});

defineNode({
  type: 'logic.trigvalue', name: 'Trigger Value', category: L,
  description: 'Sends a preset value whenever it is triggered — the classic way to set a parameter from a cue.',
  keywords: ['send', 'set', 'preset', 'message'],
  inputs: [{ id: 'trig', name: 'Trigger', type: 'trigger' }, { id: 'value', name: 'Value', type: 'any', default: 0 }],
  outputs: [{ id: 'out', name: 'Output', type: 'any' }],
  update(n, ctx, port) { if (port === 'trig') ctx.out(n, 'out', n.inputs.value, true); },
});

defineNode({
  type: 'logic.change', name: 'Change Detector', category: L,
  description: 'Fires triggers when a value changes, increases or decreases.',
  keywords: ['changed', 'edge', 'detect', 'difference'],
  inputs: [{ id: 'in', name: 'Value', type: 'number', default: 0 }, { id: 'threshold', name: 'Min Change', type: 'number', default: 0, min: 0 }],
  outputs: [
    { id: 'changed', name: 'Changed', type: 'trigger' }, { id: 'up', name: 'Increased', type: 'trigger' },
    { id: 'down', name: 'Decreased', type: 'trigger' }, { id: 'delta', name: 'Delta', type: 'number' },
  ],
  update(n, ctx, port, start) {
    const v = n.inputs.in;
    if (start || n.state.last === undefined) { n.state.last = v; return; }
    const d = v - n.state.last;
    if (Math.abs(d) <= n.inputs.threshold) return;
    n.state.last = v;
    ctx.out(n, 'delta', d);
    ctx.fire(n, 'changed');
    ctx.fire(n, d > 0 ? 'up' : 'down');
  },
});

defineNode({
  type: 'logic.divider', name: 'Trigger Divider', category: L,
  description: 'Passes one trigger out of every N, e.g. every 4th beat.',
  keywords: ['every', 'nth', 'skip', 'count'],
  inputs: [{ id: 'trig', name: 'Trigger', type: 'trigger' }, { id: 'n', name: 'Every N', type: 'number', default: 4, min: 1, int: true }, { id: 'reset', name: 'Reset', type: 'trigger' }],
  outputs: [{ id: 'out', name: 'Trigger', type: 'trigger' }],
  create(n) { n.state.c = 0; },
  update(n, ctx, port) {
    if (port === 'reset') { n.state.c = 0; return; }
    if (port !== 'trig') return;
    if (n.state.c % Math.max(1, n.inputs.n) === 0) ctx.fire(n, 'out');
    n.state.c++;
  },
});

defineNode({
  type: 'logic.selector', name: 'Router', category: L,
  description: 'Routes an incoming value or trigger to one of several outputs.',
  keywords: ['route', 'demux', 'distribute', 'selector'],
  props: { count: 4 },
  ports(model) {
    const c = Math.max(2, Math.min(16, model.props?.count || 4));
    return {
      inputs: [
        { id: 'in', name: 'Value', type: 'any', default: 0 },
        { id: 'trig', name: 'Trigger In', type: 'trigger' },
        { id: 'sel', name: 'Output #', type: 'number', default: 1, min: 1, max: c, int: true },
      ],
      outputs: Array.from({ length: c }, (_, i) => ({ id: `o${i + 1}`, name: `Out ${i + 1}`, type: 'any' })),
    };
  },
  update(n, ctx, port) {
    const id = `o${n.inputs.sel}`;
    if (port === 'trig') { const l = n.scene.linksFrom.get(n.id)?.get(id) || []; for (const k of l) ctx._deliver(n.scene, k, 1, true); return; }
    if (port === 'in') ctx.out(n, id, n.inputs.in, true);
  },
});

defineNode({
  type: 'logic.switch', name: 'Selector', category: L,
  description: 'Chooses one of several input values to pass to the output.',
  keywords: ['mux', 'multiplex', 'choose', 'switch'],
  props: { count: 4 },
  ports(model) {
    const c = Math.max(2, Math.min(16, model.props?.count || 4));
    return {
      inputs: [
        { id: 'sel', name: 'Input #', type: 'number', default: 1, min: 1, max: c, int: true },
        ...Array.from({ length: c }, (_, i) => ({ id: `i${i + 1}`, name: `In ${i + 1}`, type: 'any', default: 0 })),
      ],
      outputs: [{ id: 'out', name: 'Output', type: 'any' }],
    };
  },
  update(n, ctx, port) {
    const id = `i${n.inputs.sel}`;
    if (port === 'sel' || port === id || port === null) ctx.out(n, 'out', n.inputs[id]);
  },
});

defineNode({
  type: 'logic.sequence', name: 'Step Sequencer', category: L,
  description: 'Steps through a comma-separated list of values each time it is advanced.',
  keywords: ['list', 'array', 'pattern', 'cue', 'data'],
  inputs: [
    { id: 'list', name: 'Values', type: 'text', default: '0, 25, 50, 75, 100' },
    { id: 'next', name: 'Next', type: 'trigger' },
    { id: 'prev', name: 'Previous', type: 'trigger' },
    { id: 'reset', name: 'Reset', type: 'trigger' },
    { id: 'index', name: 'Jump To #', type: 'number', default: 1, min: 1, int: true },
    { id: 'mode', name: 'Order', type: 'enum', options: ['forward', 'ping-pong', 'random'], default: 'forward' },
  ],
  outputs: [{ id: 'out', name: 'Value', type: 'any' }, { id: 'step', name: 'Step #', type: 'number' }, { id: 'wrap', name: 'Wrapped', type: 'trigger' }],
  create(n) { n.state = { i: 0, dir: 1 }; },
  update(n, ctx, port, start) {
    const items = String(n.inputs.list).split(',').map((s) => s.trim()).filter((s) => s.length);
    if (!items.length) return;
    const len = items.length;
    let i = n.state.i;
    if (start || port === 'reset') i = 0;
    else if (port === 'index') i = Math.min(len - 1, n.inputs.index - 1);
    else if (port === 'next' || port === 'prev') {
      const step = port === 'next' ? 1 : -1;
      if (n.inputs.mode === 'random') i = Math.floor(Math.random() * len);
      else if (n.inputs.mode === 'ping-pong') {
        i += step * n.state.dir;
        if (i >= len || i < 0) { n.state.dir *= -1; i += 2 * step * n.state.dir; ctx.fire(n, 'wrap'); }
        i = Math.max(0, Math.min(len - 1, i));
      } else {
        i += step;
        if (i >= len || i < 0) { i = (i + len) % len; ctx.fire(n, 'wrap'); }
      }
    } else if (port !== 'list') return;
    n.state.i = Math.min(i, len - 1);
    const raw = items[n.state.i];
    const num = Number(raw);
    ctx.out(n, 'out', raw !== '' && Number.isFinite(num) ? num : raw, true);
    ctx.out(n, 'step', n.state.i + 1);
  },
});

defineNode({
  type: 'logic.format', name: 'Text Formatter', category: L,
  description: 'Builds text from a template. Use {a}, {b}, {c}, {d} as placeholders, {a:2} for 2 decimals.',
  keywords: ['string', 'text', 'concat', 'template', 'join'],
  inputs: [
    { id: 'tpl', name: 'Template', type: 'text', default: 'Value: {a}' },
    { id: 'a', name: 'a', type: 'any', default: 0 },
    { id: 'b', name: 'b', type: 'any', default: 0 },
    { id: 'c', name: 'c', type: 'any', default: '' },
    { id: 'd', name: 'd', type: 'any', default: '' },
  ],
  outputs: [{ id: 'out', name: 'Text', type: 'text' }],
  update(n, ctx) {
    const i = n.inputs;
    const s = String(i.tpl).replace(/\{([abcd])(?::(\d+))?\}/g, (_, k, dp) => {
      const v = i[k];
      if (dp !== undefined && typeof v === 'number') return v.toFixed(+dp);
      return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v ?? '');
    });
    ctx.out(n, 'out', s);
  },
});

defineNode({
  type: 'logic.lookup', name: 'Lookup Table', category: L,
  description: 'Maps an index (1-based) to an entry in a comma-separated table.',
  keywords: ['array', 'table', 'list', 'index', 'data array'],
  inputs: [
    { id: 'index', name: 'Index', type: 'number', default: 1, int: true },
    { id: 'list', name: 'Table', type: 'text', default: 'red, green, blue' },
    { id: 'wrap', name: 'Wrap', type: 'bool', default: 1 },
  ],
  outputs: [{ id: 'out', name: 'Entry', type: 'any' }, { id: 'count', name: 'Count', type: 'number' }],
  update(n, ctx) {
    const items = String(n.inputs.list).split(',').map((s) => s.trim());
    const len = items.length;
    let i = Math.round(n.inputs.index) - 1;
    i = n.inputs.wrap ? ((i % len) + len) % len : Math.max(0, Math.min(len - 1, i));
    const raw = items[i] ?? '';
    const num = Number(raw);
    ctx.out(n, 'out', raw !== '' && Number.isFinite(num) ? num : raw);
    ctx.out(n, 'count', len);
  },
});
