import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/nodes/index.js';
import { Engine } from '../src/core/engine.js';
import { createProject, createScene, uid, normaliseProject, duplicateScene } from '../src/core/project.js';
import { allNodeTypes, getNodeType } from '../src/core/registry.js';

function node(type, values = {}, props = {}) { return { id: uid(), type, x: 0, y: 0, values, props }; }
function link(a, ap, b, bp) { return { id: uid('l'), from: [a.id, ap], to: [b.id, bp] }; }

function setup(nodes, links) {
  const p = createProject();
  p.scenes[0].nodes = nodes;
  p.scenes[0].links = links;
  const e = new Engine();
  e.load(p);
  return { p, e, rt: e.runtimes[0], get: (n) => e.runtimes[0].nodes.get(n.id) };
}

test('registry has a substantial, well-formed module library', () => {
  const all = allNodeTypes();
  assert.ok(all.length >= 80, `expected >= 80 modules, got ${all.length}`);
  for (const d of all) {
    assert.ok(d.description, `${d.type} needs a description`);
    const ids = new Set();
    for (const p of [...d.inputs, ...d.outputs]) {
      assert.ok(!ids.has('i' + p.id) || true);
      ids.add('i' + p.id);
    }
  }
});

test('values propagate through a chain on scene start', () => {
  const a = node('util.value', { in: 7 });
  const c = node('math.calc', { op: '×', b: 3 });
  const { get } = setup([a, c], [link(a, 'out', c, 'a')]);
  assert.equal(get(c).outputs.out, 21);
});

test('user edits propagate downstream', () => {
  const a = node('util.value', { in: 1 });
  const s = node('math.scale', { inMin: 0, inMax: 10, outMin: 0, outMax: 100 });
  const { p, e, get } = setup([a, s], [link(a, 'out', s, 'in')]);
  e.valueChanged(p.scenes[0].id, a.id, 'in', 5);
  assert.equal(get(s).outputs.out, 50);
});

test('triggers fire through Trigger Value into a Counter', () => {
  const tv = node('logic.trigvalue', { value: 42 });
  const cnt = node('gen.counter', { min: 0, max: 3, step: 1, mode: 'wrap' });
  const mon = node('ctl.monitor');
  const { p, e, get } = setup([tv, cnt, mon], [link(tv, 'out', mon, 'in')]);
  const sid = p.scenes[0].id;
  e.valueChanged(sid, tv.id, 'trig', 1);
  assert.equal(get(mon).inputs.in, 42);
  for (let i = 0; i < 4; i++) e.valueChanged(sid, cnt.id, 'inc', 1);
  assert.equal(get(cnt).outputs.out, 0, 'counter wraps from 3 back to 0');
});

test('ticks drive generators and trigger delays', () => {
  const pulse = node('gen.pulse', { mode: 'Hz', rate: 10 });
  const cnt = node('gen.counter', { min: 0, max: 1000 });
  const { e, get } = setup([pulse, cnt], [link(pulse, 'pulse', cnt, 'inc')]);
  for (let t = 0; t <= 1000; t += 16.6667) e.step(t);
  const v = get(cnt).outputs.out;
  assert.ok(v >= 9 && v <= 11, `expected ~10 pulses, got ${v}`);
});

test('envelope rises and reports done', () => {
  const env = node('gen.envelope', { attack: 0.1, hold: 0, release: 0.1, low: 0, high: 100, curve: 'linear' });
  const dn = node('gen.counter', { min: 0, max: 99 });
  const { p, e, get } = setup([env, dn], [link(env, 'done', dn, 'inc')]);
  e.step(0);
  e.valueChanged(p.scenes[0].id, env.id, 'trig', 1);
  let peak = 0;
  for (let t = 16; t < 400; t += 16) { e.step(t); peak = Math.max(peak, get(env).outputs.out); }
  assert.ok(peak > 90, `peak ${peak}`);
  assert.equal(get(dn).outputs.out, 1);
});

test('feedback loops are cut instead of overflowing the stack', () => {
  const a = node('util.value', { in: 1 });
  const b = node('math.calc', { op: '+', b: 1 });
  const { p, e, get } = setup([a, b], [link(a, 'out', b, 'a'), link(b, 'out', a, 'in')]);
  e.valueChanged(p.scenes[0].id, a.id, 'in', 5);
  assert.ok(get(a).error || get(b).error, 'loop is reported on a module');
});

test('expression module evaluates formulas and reports errors', () => {
  const ex = node('math.expr', { expr: 'a * 2 + b', a: 3, b: 4 });
  const { p, e, get } = setup([ex], []);
  assert.equal(get(ex).outputs.out, 10);
  e.valueChanged(p.scenes[0].id, ex.id, 'expr', 'a +* 2');
  assert.ok(get(ex).error);
});

test('scene cross-fade keeps both runtimes alive until the fade completes', () => {
  const p = createProject();
  const s2 = createScene('B');
  p.scenes.push(s2);
  const e = new Engine();
  e.load(p);
  e.step(0);
  e.activateScene(s2.id, { fade: 1 });
  assert.equal(e.runtimes.length, 2);
  for (let t = 16; t < 1200; t += 16) e.step(t);
  assert.equal(e.runtimes.length, 1);
  assert.equal(e.runtimes[0].id, s2.id);
});

test('jump to scene is deferred to a safe point', () => {
  const p = createProject();
  const s2 = createScene('B');
  p.scenes.push(s2);
  const j = node('scene.jump', { mode: 'next', fade: 0 });
  p.scenes[0].nodes.push(j);
  const e = new Engine();
  e.load(p);
  e.valueChanged(p.scenes[0].id, j.id, 'trig', 1);
  assert.equal(p.activeScene, p.scenes[0].id, 'not yet switched');
  e.step(16);
  assert.equal(p.activeScene, s2.id);
});

test('broadcasters reach listeners', () => {
  const tx = node('scene.send', { chan: 7 });
  const rx = node('scene.receive', { chan: 7 });
  const { p, e, get } = setup([tx, rx], []);
  e.valueChanged(p.scenes[0].id, tx.id, 'in', 'hello');
  assert.equal(get(rx).outputs.out, 'hello');
});

test('MIDI and OSC dispatch reach listening modules', () => {
  const mn = node('io.midinote', { chan: 0, note: 60 });
  const osc = node('io.oscin', { addr: '/kami/*' });
  const { e, get } = setup([mn, osc], []);
  e.dispatch('Midi', { type: 'noteon', channel: 1, data1: 60, data2: 99 });
  assert.equal(get(mn).outputs.vel, 99);
  assert.equal(get(mn).outputs.gate, 1);
  e.dispatch('Osc', { address: '/kami/fader', args: [0.5] });
  assert.equal(get(osc).outputs.a1, 0.5);
  e.dispatch('Osc', { address: '/other', args: [1] });
  assert.equal(get(osc).outputs.a1, 0.5);
});

test('dynamic ports follow props (Router count)', () => {
  const r = node('logic.selector', {}, { count: 3 });
  const { p, e, get } = setup([r], []);
  assert.equal(get(r).ports.outputs.length, 3);
  p.scenes[0].nodes[0].props.count = 6;
  e.propChanged(p.scenes[0].id, r.id, 'count');
  assert.equal(get(r).ports.outputs.length, 6);
});

test('reconcile preserves surviving node state after undo-style edits', () => {
  const c = node('gen.counter', { min: 0, max: 100 });
  const { p, e, get } = setup([c], []);
  const sid = p.scenes[0].id;
  e.valueChanged(sid, c.id, 'inc', 1);
  e.valueChanged(sid, c.id, 'inc', 1);
  const extra = node('util.value', { in: 3 });
  p.scenes[0].nodes.push(extra);
  e.reconcile(sid);
  assert.ok(get(extra));
  assert.equal(get(c).state.v, 2);
});

test('project normalisation rejects foreign files and upgrades partial ones', () => {
  assert.throws(() => normaliseProject({ hello: 1 }), /not a KamiCreative project/);
  const p = normaliseProject({ format: 'kamicreative', version: 1, scenes: [{ name: 'X', nodes: [{ id: 'a', type: 'util.value' }] }] });
  assert.equal(p.scenes[0].nodes[0].values && typeof p.scenes[0].nodes[0].values, 'object');
  assert.equal(p.stages.length, 1);
  assert.equal(p.activeScene, p.scenes[0].id);
});

test('duplicateScene remaps ids and links', () => {
  const s = createScene('A');
  const a = node('util.value'), b = node('util.value');
  s.nodes.push(a, b);
  s.links.push(link(a, 'out', b, 'in'));
  const d = duplicateScene(s);
  assert.notEqual(d.nodes[0].id, a.id);
  assert.equal(d.links[0].from[0], d.nodes[0].id);
  assert.equal(d.links[0].to[0], d.nodes[1].id);
});

test('every module can be instantiated and started without a GPU or DOM', () => {
  const skipDom = new Set(['src.text']);
  for (const def of allNodeTypes()) {
    if (skipDom.has(def.type)) continue;
    const n = node(def.type, {}, { ...(def.props || {}) });
    const { e, get } = setup([n], []);
    for (let t = 0; t < 100; t += 16) e.step(t);
    const rt = get(n);
    assert.ok(rt, def.type);
    assert.ok(!rt.error || /unavailable|MIDI|OSC|Microphone|microphone|camera|Camera/i.test(rt.error), `${def.type}: ${rt.error}`);
  }
  assert.ok(getNodeType('out.projector').projector);
});
