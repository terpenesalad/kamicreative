// KamiCreative — WebGL2 rendering core.
// Conventions: every texture uses GL orientation (uv 0,0 = bottom-left).
// Uploads from DOM sources are flipped on upload so all textures agree.

export const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const MESH_VS = `#version 300 es
in vec2 aPos;   // clip space
in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }`;

const FRAG_HEADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

/** Wrap an effect body (which must define `vec4 effect(vec2 uv)`) in a full fragment shader. */
export function fragment(body) {
  return FRAG_HEADER + body + `\nvoid main(){ outColor = effect(vUv); }`;
}

export class Texture {
  constructor(gl, width, height, { withFbo = true, filter = 'linear' } = {}) {
    this.gl = gl;
    this.width = 0;
    this.height = 0;
    this.tex = gl.createTexture();
    this.fbo = withFbo ? gl.createFramebuffer() : null;
    this.filter = filter;
    this.resize(width, height);
  }

  resize(width, height) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    if (width === this.width && height === this.height) return false;
    const gl = this.gl;
    this.width = width;
    this.height = height;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = this.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    return true;
  }

  /** Upload a DOM image source (video, image, canvas, ImageBitmap). */
  upload(source, width, height) {
    const gl = this.gl;
    width = width || source.videoWidth || source.naturalWidth || source.width;
    height = height || source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height) return false;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (this.fbo) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return true;
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.tex = null;
    this.fbo = null;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available on this system. Update your graphics driver.');
    this.gl = gl;
    this.programs = new Map();
    this.errors = new Map();

    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.quadVao = gl.createVertexArray();
    this.meshBufPos = gl.createBuffer();
    this.meshBufUv = gl.createBuffer();
    this.meshBufIdx = gl.createBuffer();
    this.meshVao = gl.createVertexArray();

    this.black = new Texture(gl, 2, 2, { withFbo: true });
    this.clear(this.black, [0, 0, 0, 1]);
    this.transparent = new Texture(gl, 2, 2, { withFbo: true });
    this.clear(this.transparent, [0, 0, 0, 0]);
    this.stats = { draws: 0 };
  }

  get maxTextureSize() { return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE); }

  createTexture(w, h, opts) { return new Texture(this.gl, w, h, opts); }

  /** Compile (and cache) a program. Returns null and records the error on failure. */
  program(fs, vs = QUAD_VS) {
    const key = vs + '\u0000' + fs;
    if (this.programs.has(key)) return this.programs.get(key);
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(log || 'shader compile error');
      }
      return s;
    };
    let prog = null;
    try {
      const v = compile(gl.VERTEX_SHADER, vs);
      const f = compile(gl.FRAGMENT_SHADER, fs);
      const p = gl.createProgram();
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.bindAttribLocation(p, 0, 'aPos');
      gl.bindAttribLocation(p, 1, 'aUv');
      gl.linkProgram(p);
      gl.deleteShader(v);
      gl.deleteShader(f);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link error');
      const uniforms = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        const name = info.name.replace(/\[0\]$/, '');
        uniforms[name] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
      }
      prog = { program: p, uniforms };
      this.errors.delete(key);
    } catch (e) {
      this.errors.set(key, String(e.message || e));
      prog = null;
    }
    this.programs.set(key, prog);
    return prog;
  }

  programError(fs, vs = QUAD_VS) { return this.errors.get(vs + '\u0000' + fs) || null; }

  forgetProgram(fs, vs = QUAD_VS) {
    const key = vs + '\u0000' + fs;
    const p = this.programs.get(key);
    if (p) this.gl.deleteProgram(p.program);
    this.programs.delete(key);
    this.errors.delete(key);
  }

  _setUniforms(prog, uniforms) {
    const gl = this.gl;
    let unit = 0;
    for (const name in prog.uniforms) {
      const u = prog.uniforms[name];
      let v = uniforms[name];
      if (u.type === gl.SAMPLER_2D) {
        const tex = v && v.tex ? v : this.black;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex.tex);
        gl.uniform1i(u.loc, unit);
        unit++;
        continue;
      }
      if (v === undefined) continue;
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, +v || 0); break;
        case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, v | 0); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
        default: break;
      }
    }
  }

  _bindTarget(target) {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  _applyBlend(blend) {
    const gl = this.gl;
    if (!blend || blend === 'none') { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    // All blended draws output premultiplied colour.
    switch (blend) {
      case 'add': gl.blendFunc(gl.ONE, gl.ONE); break;
      case 'screen': gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
      case 'multiply': gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break;
      case 'subtract':
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        gl.blendFunc(gl.ONE, gl.ONE);
        break;
      case 'alpha': default: gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); break;
    }
  }

  /** Draw a fullscreen pass with `fs` into `target` (null = canvas). viewport optional [x,y,w,h]. */
  draw(fs, uniforms, target, { blend = 'none', viewport = null } = {}) {
    const prog = this.program(fs);
    if (!prog) return false;
    const gl = this.gl;
    this._bindTarget(target);
    if (viewport) gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    gl.useProgram(prog.program);
    this._setUniforms(prog, uniforms || {});
    this._applyBlend(blend);
    gl.bindVertexArray(this.quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    this.stats.draws++;
    return true;
  }

  /** Draw an indexed triangle mesh (positions in clip space, uvs in texture space). */
  drawMesh(fs, uniforms, target, mesh, { blend = 'alpha', vs = MESH_VS } = {}) {
    const prog = this.program(fs, vs);
    if (!prog) return false;
    const gl = this.gl;
    this._bindTarget(target);
    gl.useProgram(prog.program);
    this._setUniforms(prog, uniforms || {});
    this._applyBlend(blend);
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBufPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBufUv);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.meshBufIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    gl.drawElements(mesh.lines ? gl.LINES : gl.TRIANGLES, mesh.indices.length, mesh.indices.BYTES_PER_ELEMENT === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    this.stats.draws++;
    return true;
  }

  clear(target, rgba = [0, 0, 0, 1]) {
    const gl = this.gl;
    this._bindTarget(target);
    gl.disable(gl.BLEND);
    gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  copy(src, target, opts) { return this.draw(COPY_FS, { uTex: src }, target, opts); }

  /** Ensure the presentation canvas is at least w x h. */
  ensureCanvas(w, h) {
    const c = this.canvas;
    if (c.width < w || c.height < h) {
      c.width = Math.max(c.width, w);
      c.height = Math.max(c.height, h);
    }
  }

  /**
   * Blit a texture into the bottom-left of the canvas so DOM canvases can copy it with drawImage.
   * Returns the source rect in canvas (top-left origin) coordinates.
   */
  present(tex, w = tex.width, h = tex.height) {
    this.ensureCanvas(w, h);
    this.draw(COPY_FS, { uTex: tex }, null, { viewport: [0, 0, w, h] });
    return { sx: 0, sy: this.canvas.height - h, sw: w, sh: h };
  }
}
