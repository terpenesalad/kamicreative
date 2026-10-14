// KamiCreative — projection mapping geometry.
// Pure math, no DOM / GL dependencies (unit tested in test/warp.test.mjs).
//
// A surface maps a rectangular region of a stage's composite (the "source")
// onto an arbitrary warped region of the projector output (the "destination").
// Destination geometry is a grid of control points (cols x rows, >= 2x2) in
// normalised output space (0..1, origin top-left, like the editor).
//  * 2x2 grids use a true perspective homography (keystone / corner-pin).
//  * Larger grids use a Catmull-Rom bicubic surface through the points
//    (curved screens, domes, organic shapes).

/** Solve A x = b (n x n) with partial pivoting. Returns null if singular. */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Homography mapping 4 source points to 4 destination points.
 * Returns a 3x3 row-major matrix [h0..h8] (h8 = 1), or null when degenerate.
 */
export function homography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  return [...h, 1];
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const s = 1 / det;
  return [
    A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s,
  ];
}

/** Default grid of control points spanning a rectangle (normalised, top-left origin). */
export function defaultGrid(cols = 2, rows = 2, rect = [0, 0, 1, 1]) {
  const [x, y, w, h] = rect;
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push([x + (w * c) / (cols - 1), y + (h * r) / (rows - 1)]);
    }
  }
  return { cols, rows, points: pts };
}

/** Resample an existing grid to a new resolution, preserving its current shape. */
export function resampleGrid(grid, cols, rows) {
  const pts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push(evalGrid(grid, c / (cols - 1), r / (rows - 1)));
    }
  }
  return { cols, rows, points: pts };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Evaluate the warped destination position for surface coordinate (u,v) in 0..1. */
export function evalGrid(grid, u, v) {
  const { cols, rows, points } = grid;
  if (cols === 2 && rows === 2) {
    const H = gridHomography(grid);
    if (H) return applyHomography(H, u, v);
    // Degenerate quad: fall back to bilinear.
    const [p00, p10, p01, p11] = points;
    return [
      (1 - v) * ((1 - u) * p00[0] + u * p10[0]) + v * ((1 - u) * p01[0] + u * p11[0]),
      (1 - v) * ((1 - u) * p00[1] + u * p10[1]) + v * ((1 - u) * p01[1] + u * p11[1]),
    ];
  }
  const P = (c, r) => {
    // Clamp with linear extrapolation at the borders for natural edges.
    const cc = Math.min(cols - 1, Math.max(0, c));
    const rr = Math.min(rows - 1, Math.max(0, r));
    let p = points[rr * cols + cc];
    if (c !== cc || r !== rr) {
      const ic = c < 0 ? 1 : c >= cols ? cols - 2 : cc;
      const ir = r < 0 ? 1 : r >= rows ? rows - 2 : rr;
      const q = points[ir * cols + ic];
      p = [2 * p[0] - q[0], 2 * p[1] - q[1]];
    }
    return p;
  };
  const fx = u * (cols - 1), fy = v * (rows - 1);
  const cx = Math.min(cols - 2, Math.floor(fx)), cy = Math.min(rows - 2, Math.floor(fy));
  const tx = fx - cx, ty = fy - cy;
  const out = [0, 0];
  for (let k = 0; k < 2; k++) {
    const rowVals = [];
    for (let j = -1; j <= 2; j++) {
      rowVals.push(catmull(P(cx - 1, cy + j)[k], P(cx, cy + j)[k], P(cx + 1, cy + j)[k], P(cx + 2, cy + j)[k], tx));
    }
    out[k] = catmull(rowVals[0], rowVals[1], rowVals[2], rowVals[3], ty);
  }
  return out;
}

const _hCache = new WeakMap();
export function gridHomography(grid) {
  const key = grid.points.map((p) => p.join(',')).join(';');
  const cached = _hCache.get(grid);
  if (cached && cached.key === key) return cached.H;
  const [p00, p10, p01, p11] = grid.points;
  const H = homography([[0, 0], [1, 0], [0, 1], [1, 1]], [p00, p10, p01, p11]);
  _hCache.set(grid, { key, H });
  return H;
}

/**
 * Tessellate a surface into a triangle mesh.
 * @param grid destination control grid (normalised, top-left origin)
 * @param source source rect [x,y,w,h] in normalised composite space (top-left origin)
 * @param res tessellation per axis
 * Returns { positions (clip space), uvs (GL texture space), surf (0..1 surface coords), indices }.
 */
export function buildSurfaceMesh(grid, source = [0, 0, 1, 1], res = 32) {
  const n = res + 1;
  const positions = new Float32Array(n * n * 2);
  const uvs = new Float32Array(n * n * 2);
  const surf = new Float32Array(n * n * 2);
  const [sx, sy, sw, sh] = source;
  let i = 0;
  for (let r = 0; r < n; r++) {
    const v = r / res;
    for (let c = 0; c < n; c++) {
      const u = c / res;
      const [dx, dy] = evalGrid(grid, u, v);
      positions[i] = dx * 2 - 1;
      positions[i + 1] = 1 - dy * 2;
      uvs[i] = sx + u * sw;
      uvs[i + 1] = 1 - (sy + v * sh);
      surf[i] = u;
      surf[i + 1] = v;
      i += 2;
    }
  }
  const indices = new Uint32Array(res * res * 6);
  let k = 0;
  for (let r = 0; r < res; r++) {
    for (let c = 0; c < res; c++) {
      const a = r * n + c, b = a + 1, d = a + n, e = d + 1;
      indices[k++] = a; indices[k++] = d; indices[k++] = b;
      indices[k++] = b; indices[k++] = d; indices[k++] = e;
    }
  }
  return { positions, uvs, surf, indices };
}

/** Polyline outline of a surface (normalised, top-left origin) for editor overlays. */
export function surfaceOutline(grid, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) pts.push(evalGrid(grid, i / steps, 0));
  for (let i = 1; i <= steps; i++) pts.push(evalGrid(grid, 1, i / steps));
  for (let i = steps - 1; i >= 0; i--) pts.push(evalGrid(grid, i / steps, 1));
  for (let i = steps - 1; i > 0; i--) pts.push(evalGrid(grid, 0, i / steps));
  return pts;
}

/** Edge-blend attenuation at surface coord (u,v); mirrors the GLSL in the mapper. */
export function edgeBlend(u, v, blend) {
  const p = blend.curve || 2;
  const shape = (x) => (x < 0.5 ? 0.5 * Math.pow(2 * x, p) : 1 - 0.5 * Math.pow(2 * (1 - x), p));
  const ramp = (d, w) => (w <= 0 ? 1 : shape(Math.min(1, Math.max(0, d / w))));
  const a = ramp(u, blend.left || 0) * ramp(1 - u, blend.right || 0) * ramp(v, blend.top || 0) * ramp(1 - v, blend.bottom || 0);
  return Math.pow(a, 1 / (blend.gamma || 1));
}
