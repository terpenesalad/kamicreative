import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression } from '../src/core/expr.js';
import { homography, applyHomography, invert3, defaultGrid, evalGrid, buildSurfaceMesh, resampleGrid, edgeBlend } from '../src/gl/warp.js';
import { convertValue } from '../src/core/registry.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('expressions: precedence, functions, variables, ternary', () => {
  assert.equal(compileExpression('1 + 2 * 3')(), 7);
  assert.equal(compileExpression('(1 + 2) * 3')(), 9);
  assert.equal(compileExpression('2 ^ 3 ^ 2')(), 512);
  assert.equal(compileExpression('-2 ^ 2')(), -4);
  assert.equal(compileExpression('max(a, b) - min(a, b)')({ a: 3, b: 10 }), 7);
  assert.equal(compileExpression('a > 5 ? 100 : 0')({ a: 6 }), 100);
  assert.equal(compileExpression('a > 5 && b < 2')({ a: 6, b: 1 }), 1);
  near(compileExpression('sin(pi / 2)')(), 1);
  assert.equal(compileExpression('10 / 0')(), 0, 'division by zero is safe');
  assert.equal(compileExpression('')(), 0);
  assert.throws(() => compileExpression('1 +'));
  assert.throws(() => compileExpression('foo(1)'));
  assert.throws(() => compileExpression('alert`x`'));
});

test('homography maps the four corners exactly and inverts', () => {
  const src = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const dst = [[0.1, 0.2], [0.9, 0.05], [0.0, 0.95], [0.85, 0.8]];
  const H = homography(src, dst);
  for (let i = 0; i < 4; i++) {
    const [x, y] = applyHomography(H, ...src[i]);
    near(x, dst[i][0]); near(y, dst[i][1]);
  }
  const Hi = invert3(H);
  const [u, v] = applyHomography(Hi, ...applyHomography(H, 0.3, 0.7));
  near(u, 0.3); near(v, 0.7);
});

test('a default grid is the identity warp at any resolution', () => {
  for (const [c, r] of [[2, 2], [3, 3], [5, 4]]) {
    const g = defaultGrid(c, r);
    for (const [u, v] of [[0, 0], [0.25, 0.6], [1, 1], [0.5, 0.5]]) {
      const [x, y] = evalGrid(g, u, v);
      near(x, u, 1e-9); near(y, v, 1e-9);
    }
  }
});

test('mesh grids pass through their control points; resampling keeps shape', () => {
  const g = defaultGrid(3, 3);
  g.points[4] = [0.6, 0.4];
  const [x, y] = evalGrid(g, 0.5, 0.5);
  near(x, 0.6); near(y, 0.4);
  const r = resampleGrid(g, 5, 5);
  const [x2, y2] = evalGrid(r, 0.5, 0.5);
  near(x2, 0.6, 1e-6); near(y2, 0.4, 1e-6);
});

test('surface mesh has correct vertex and index counts and clip-space corners', () => {
  const m = buildSurfaceMesh(defaultGrid(2, 2), [0, 0, 1, 1], 8);
  assert.equal(m.positions.length, 9 * 9 * 2);
  assert.equal(m.indices.length, 8 * 8 * 6);
  near(m.positions[0], -1); near(m.positions[1], 1);
  near(m.uvs[1], 1);
});

test('edge blend ramps from 0 at the edge to 1 inside the blend zone', () => {
  const b = { left: 0.2, right: 0, top: 0, bottom: 0, gamma: 1, curve: 2 };
  near(edgeBlend(0, 0.5, b), 0);
  near(edgeBlend(0.1, 0.5, b), 0.5);
  near(edgeBlend(0.3, 0.5, b), 1);
});

test('value conversion between port types', () => {
  assert.equal(convertValue('12.5', { type: 'number' }), 12.5);
  assert.equal(convertValue(150, { type: 'number', min: 0, max: 100 }), 100);
  assert.equal(convertValue(0.7, { type: 'bool' }), 1);
  assert.equal(convertValue('on', { type: 'bool' }), 1);
  assert.equal(convertValue(1, { type: 'enum', options: ['a', 'b', 'c'] }), 'b');
  assert.equal(convertValue(2.5, { type: 'number', int: true }), 3);
  assert.equal(convertValue(3.14159, { type: 'text' }), '3.142');
});
