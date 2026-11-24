// The drawing core shared by every view: thousands of textured quads in one instanced WebGL2 call,
// plus one big quad for the ground. It knows nothing about maps, projections or agents: a view
// (renderer.js for isometric, flat.js for side-on or top-down) fills `inst` and calls draw().
//
// One instance is INST floats: x, y, w, h (in view pixels), atlasX, atlasY, depthKey, angle.
//   depthKey  larger = nearer the camera (only used when draw() is asked for depth sorting)
//   angle     radians, turning the quad about its centre; 0 keeps it pixel-snapped
// Instance 0 is always the ground quad, drawn from the ground texture; the rest use the atlas.

export const INST = 8;

const VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec2 a_pos;
layout(location=2) in vec2 a_size;
layout(location=3) in vec2 a_uv;
layout(location=4) in float a_key;
layout(location=5) in float a_ang;
uniform vec3 u_cam;    // zoom, screen offset x, y
uniform vec2 u_view;   // canvas size
uniform vec2 u_tex;    // texture size
uniform float u_zmax;
out vec2 v_uv;
void main() {
  vec2 scr;
  if (a_ang == 0.0) {
    // Snap both edges to whole pixels, so neighbouring strips of one image meet exactly (no seams, no overlap).
    vec2 lo = floor(a_pos * u_cam.x + u_cam.yz + 0.5), hi = floor((a_pos + a_size) * u_cam.x + u_cam.yz + 0.5);
    scr = mix(lo, hi, a_corner);
  } else {
    float c = cos(a_ang), s = sin(a_ang);
    vec2 d = (a_corner - 0.5) * a_size;
    scr = (a_pos + a_size * 0.5 + vec2(d.x * c - d.y * s, d.x * s + d.y * c)) * u_cam.x + u_cam.yz;
  }
  gl_Position = vec4(scr.x / u_view.x * 2.0 - 1.0, 1.0 - scr.y / u_view.y * 2.0, 1.0 - 2.0 * a_key / u_zmax, 1.0);
  v_uv = (a_uv + a_corner * a_size) / u_tex;
}`;
const FS = `#version 300 es
precision mediump float;
uniform sampler2D u_sampler;
uniform vec3 u_tint;   // the light of the hour: everything is multiplied by it…
in vec2 v_uv;
out vec4 o;
void main() {
  vec4 c = texture(u_sampler, v_uv);
  if (c.a < 0.5) discard;            // hard-edged pixel art: no blending, so the depth buffer just works
  o = vec4(c.a > 0.9 ? c.rgb / c.a * u_tint : c.rgb, 1.0);   // …except lights: sheet pixels with alpha between 0.5 and 0.9
}`;

export function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
/** Blend two #rrggbb colours, t = share of b. */
export function mixHex(a, b, t) {
  const x = hexRGB(a), y = hexRGB(b);
  return '#' + x.map((v, i) => Math.round((v + (y[i] - v) * t) * 255).toString(16).padStart(2, '0')).join('');
}

export class QuadBatch {
  /** @param {HTMLCanvasElement} canvas  its width/height attributes set the render resolution */
  constructor(canvas) {
    this.canvas = canvas;
    this.inst = new Float32Array(4096 * INST); this._cap = 4096;
    const gl = this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    const sh = (type, src) => {
      const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    const prog = this.prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const corners = this.corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    const makeVAO = first => {
      const v = gl.createVertexArray(); gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, corners);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      let off = first * INST * 4;
      for (const [loc, size] of [[1, 2], [2, 2], [3, 2], [4, 1], [5, 1]]) {
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, INST * 4, off);
        gl.vertexAttribDivisor(loc, 1); off += size * 4;
      }
      return v;
    };
    const makeTex = mag => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.vaoGround = makeVAO(0); this.vaoSprites = makeVAO(1);
    this.atlasTex = makeTex(gl.NEAREST); this.groundTex = makeTex(gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);   // ground is seen heavily zoomed out
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.uCam = gl.getUniformLocation(prog, 'u_cam'); this.uView = gl.getUniformLocation(prog, 'u_view');
    this.uTex = gl.getUniformLocation(prog, 'u_tex'); this.uZmax = gl.getUniformLocation(prog, 'u_zmax'); this.uTint = gl.getUniformLocation(prog, 'u_tint');
    this._atlasW = 1; this._atlasH = 1;
  }

  /** Show the ground texture with hard pixel edges when magnified (for a ground painted smaller than it is shown). */
  sharpGround() { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.groundTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }

  /** Make room for n instances (the buffer is refilled every frame, so nothing needs copying). Returns the array to fill. */
  ensure(n) {
    if (n > this._cap) {
      while (this._cap < n) this._cap *= 2;
      this.inst = new Float32Array(this._cap * INST);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    }
    return this.inst;
  }
  /** Upload the sprite sheet. */
  setAtlas(image) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this._atlasW = image.width; this._atlasH = image.height;
  }
  /** Upload the ground picture (a canvas). */
  setGround(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (!this._plainGround) gl.generateMipmap(gl.TEXTURE_2D);
  }
  /**
   * Show the ground texture without its smaller copies (mipmaps). It then costs nothing to change a part of it
   * (setGroundPart), at the price of shimmer when the ground is seen much smaller than it was painted.
   */
  plainGround() { const gl = this.gl; this._plainGround = true; gl.bindTexture(gl.TEXTURE_2D, this.groundTex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); }
  /** Replace a part of the ground texture: `source` (a canvas or an ImageData) goes with its top left corner at (x, y) of the texture. */
  setGroundPart(source, x, y) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.groundTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, source); }
  /**
   * Send the first `floats` values of `inst` to the GPU and draw them.
   * @param {object} o
   * @param {number} o.floats       how much of `inst` is filled (instance 0 is the ground quad)
   * @param {{x:number,y:number,zoom:number}} o.camera  view pixel at the centre of the canvas, and zoom
   * @param {string} o.background   #rrggbb behind everything
   * @param {number} o.groundW      size of the ground quad in view pixels (what the ground texture covers)
   * @param {number} o.groundH
   * @param {number} o.zmax         largest depth key
   * @param {boolean} o.depth       sort sprites by depth key (isometric); false = draw in buffer order
   * @param {number[]} [o.tint]     [r, g, b] the whole picture is multiplied by (lights excepted: see the shader)
   */
  draw({ floats, camera, background, groundW, groundH, zmax = 1, depth = true, tint = [1, 1, 1] }) {
    const gl = this.gl, cw = this.canvas.width, ch = this.canvas.height, z = camera.zoom, bg = hexRGB(background);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, floats);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(bg[0] * tint[0], bg[1] * tint[1], bg[2] * tint[2], 1);
    gl.uniform3f(this.uTint, tint[0], tint[1], tint[2]);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(this.uCam, z, Math.round(cw / 2 - camera.x * z), Math.round(ch / 2 - camera.y * z));
    gl.uniform2f(this.uView, cw, ch);
    gl.uniform1f(this.uZmax, zmax);

    gl.disable(gl.DEPTH_TEST);
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex); gl.uniform2f(this.uTex, groundW, groundH);
    gl.bindVertexArray(this.vaoGround); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);

    if (depth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); }
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex); gl.uniform2f(this.uTex, this._atlasW, this._atlasH);
    gl.bindVertexArray(this.vaoSprites); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, floats / INST - 1);
  }
  /** Free GPU resources. */
  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.atlasTex); gl.deleteTexture(this.groundTex);
    gl.deleteBuffer(this.ibuf); gl.deleteBuffer(this.corners);
    gl.deleteVertexArray(this.vaoGround); gl.deleteVertexArray(this.vaoSprites);
    gl.deleteProgram(this.prog);
  }
}
