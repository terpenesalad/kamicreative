import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { encodeMessage, decode } = require('../main/osc.cjs');
const { artDmx } = require('../main/artnet.cjs');

test('OSC messages round-trip with int, float, string and bool args', () => {
  const buf = encodeMessage('/kami/fader', [42, 0.5, 'hello', true, false]);
  assert.equal(buf.length % 4, 0, 'packets are 4-byte aligned');
  const [m] = decode(buf);
  assert.equal(m.address, '/kami/fader');
  assert.deepEqual(m.args, [42, 0.5, 'hello', 1, 0]);
});

test('OSC address padding is correct for every length', () => {
  for (let n = 1; n < 12; n++) {
    const addr = '/' + 'a'.repeat(n);
    const [m] = decode(encodeMessage(addr, [1]));
    assert.equal(m.address, addr);
    assert.deepEqual(m.args, [1]);
  }
});

test('OSC bundles are flattened into messages', () => {
  const a = encodeMessage('/a', [1]);
  const b = encodeMessage('/b', ['x']);
  const size = (x) => { const s = Buffer.alloc(4); s.writeInt32BE(x.length); return s; };
  const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), size(a), a, size(b), b]);
  const out = decode(bundle);
  assert.deepEqual(out.map((m) => m.address), ['/a', '/b']);
  assert.equal(out[1].args[0], 'x');
});

test('OSC decoder rejects garbage', () => {
  assert.throws(() => decode(Buffer.from('not osc at all')));
});

test('Art-Net ArtDmx packet layout', () => {
  const data = new Array(512).fill(0);
  data[0] = 255; data[511] = 7;
  const p = artDmx(0x0123, data, 9);
  assert.equal(p.toString('ascii', 0, 7), 'Art-Net');
  assert.equal(p[7], 0);
  assert.equal(p.readUInt16LE(8), 0x5000);
  assert.equal(p[11], 14);
  assert.equal(p[12], 9);
  assert.equal(p[14], 0x23, 'SubUni');
  assert.equal(p[15], 0x01, 'Net');
  assert.equal(p.readUInt16BE(16), 512);
  assert.equal(p[18], 255);
  assert.equal(p[18 + 511], 7);
  assert.equal(p.length, 530);
});
