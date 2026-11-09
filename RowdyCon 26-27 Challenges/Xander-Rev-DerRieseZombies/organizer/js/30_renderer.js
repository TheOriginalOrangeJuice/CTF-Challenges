// ---------------------------------------------------------------------------
// 30_renderer.js — minimal WebGL1 forward renderer: one lit/textured/fogged
// shader, static & dynamic meshes, billboard/segment particle batches.
// ---------------------------------------------------------------------------
(function () {
  const MAX_LIGHTS = 6;

  const VS = `
    attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUV; attribute vec4 aColor;
    uniform mat4 uProj, uView, uModel;
    varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUV; varying vec4 vColor;
    void main() {
      vec4 w = uModel * vec4(aPos, 1.0);
      vWorld = w.xyz;
      vNormal = normalize(mat3(uModel) * aNormal);
      vUV = aUV; vColor = aColor;
      gl_Position = uProj * uView * w;
    }`;
  const FS = `
    precision mediump float;
    varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUV; varying vec4 vColor;
    uniform sampler2D uTex;
    uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor, uCamPos, uEmissive;
    uniform float uFogNear, uFogFar, uUnlit, uAlpha, uCutoff;
    uniform vec3 uLightPos[${MAX_LIGHTS}]; uniform vec3 uLightColor[${MAX_LIGHTS}]; uniform float uLightRange[${MAX_LIGHTS}];
    void main() {
      vec4 tex = texture2D(uTex, vUV) * vColor;
      if (tex.a < uCutoff) discard;
      vec3 n = normalize(vNormal);
      vec3 light = uAmbient + uSunColor * max(dot(n, uSunDir), 0.0);
      for (int i = 0; i < ${MAX_LIGHTS}; i++) {
        vec3 d = uLightPos[i] - vWorld;
        float dist = length(d);
        if (dist < uLightRange[i]) {
          float att = 1.0 - dist / uLightRange[i];
          att *= att;
          float nd = max(dot(n, d / max(dist, 0.001)), 0.0) * 0.8 + 0.2;
          light += uLightColor[i] * att * nd;
        }
      }
      light = mix(light, vec3(1.0), uUnlit);
      vec3 col = tex.rgb * light + uEmissive;
      float fog = clamp((distance(vWorld, uCamPos) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      col = mix(col, uFogColor, fog * (1.0 - uUnlit * 0.5));
      gl_FragColor = vec4(col, tex.a * uAlpha);
    }`;

  const STRIDE = 12; // floats per vertex

  class MeshBuilder {
    constructor() { this.data = []; this.count = 0; }
    vertex(p, n, u, v, c) {
      this.data.push(p.x, p.y, p.z, n.x, n.y, n.z, u, v, c[0], c[1], c[2], c[3] === undefined ? 1 : c[3]);
      this.count++;
    }
    tri(a, b, c, n, uva, uvb, uvc, col) {
      this.vertex(a, n, uva[0], uva[1], col); this.vertex(b, n, uvb[0], uvb[1], col); this.vertex(c, n, uvc[0], uvc[1], col);
    }
    // quad: a,b,c,d counter-clockwise when viewed from the normal side. cell: optional subdivision size
    // (metres) so per-vertex baked lighting can vary across large faces.
    quad(a, b, c, d, n, uvs, col, cell) {
      col = col || [1, 1, 1, 1];
      if (cell) {
        const L = (p, q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        const nx = Math.min(64, Math.max(1, Math.round(L(a, b) / cell))), ny = Math.min(64, Math.max(1, Math.round(L(a, d) / cell)));
        if (nx > 1 || ny > 1) {
          const lerp = (p, q, t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t });
          const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          const at = (u, v) => lerp(lerp(a, b, u), lerp(d, c, u), v);
          const uvAt = (u, v) => lerp2(lerp2(uvs[0], uvs[1], u), lerp2(uvs[3], uvs[2], u), v);
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
            const p0 = at(u0, v0), p1 = at(u1, v0), p2 = at(u1, v1), p3 = at(u0, v1);
            const t0 = uvAt(u0, v0), t1 = uvAt(u1, v0), t2 = uvAt(u1, v1), t3 = uvAt(u0, v1);
            this.tri(p0, p1, p2, n, t0, t1, t2, col);
            this.tri(p0, p2, p3, n, t0, t2, t3, col);
          }
          return;
        }
      }
      this.tri(a, b, c, n, uvs[0], uvs[1], uvs[2], col);
      this.tri(a, c, d, n, uvs[0], uvs[2], uvs[3], col);
    }
    // Axis-aligned box. opts: {color, uvScale, faces:{px,nx,py,ny,pz,nz} (default all), subdiv (cell size),
    // xf: {o,u,v,w} transform (local box coordinates mapped to o + u*x + v*y + w*z — see obox)}
    box(min, max, opts = {}) {
      const col = opts.color || [1, 1, 1, 1];
      const s = opts.uvScale || 1, cell = opts.subdiv;
      const f = opts.faces || {};
      const show = (k) => f[k] !== false;
      const xf = opts.xf;
      const P = xf ? (x, y, z) => ({ x: xf.o.x + xf.u.x * x + xf.v.x * y + xf.w.x * z, y: xf.o.y + xf.u.y * x + xf.v.y * y + xf.w.y * z, z: xf.o.z + xf.u.z * x + xf.v.z * y + xf.w.z * z }) : (x, y, z) => ({ x, y, z });
      const N = xf ? (x, y, z) => ({ x: xf.u.x * x + xf.v.x * y + xf.w.x * z, y: xf.u.y * x + xf.v.y * y + xf.w.y * z, z: xf.u.z * x + xf.v.z * y + xf.w.z * z }) : P;
      const x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x, y1 = max.y, z1 = max.z;
      const uvFor = (a, b) => [[a[0] / s, b[0] / s], [a[1] / s, b[0] / s], [a[1] / s, b[1] / s], [a[0] / s, b[1] / s]];
      if (show('px')) this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), N(1, 0, 0), uvFor([z1, z0], [y0, y1]), col, cell);
      if (show('nx')) this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), N(-1, 0, 0), uvFor([z0, z1], [y0, y1]), col, cell);
      if (show('py')) this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), N(0, 1, 0), uvFor([x0, x1], [z1, z0]), col, cell);
      if (show('ny')) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), N(0, -1, 0), uvFor([x0, x1], [z0, z1]), col, cell);
      if (show('pz')) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), N(0, 0, 1), uvFor([x0, x1], [y0, y1]), col, cell);
      if (show('nz')) this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), N(0, 0, -1), uvFor([x1, x0], [y0, y1]), col, cell);
      return this;
    }
    // Oriented box: centre c, half extents h {x,y,z} along the orthonormal axes u, v, w.
    obox(c, u, v, w, h, opts = {}) {
      return this.box({ x: -h.x, y: -h.y, z: -h.z }, { x: h.x, y: h.y, z: h.z }, Object.assign({}, opts, { xf: { o: c, u, v, w } }));
    }
    // Beam from point a to point b with a square/rect cross-section (w wide, t tall), top kept "up".
    beam(a, b, w, t, opts = {}) {
      const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, len = Math.hypot(d.x, d.y, d.z);
      if (len < 1e-6) return this;
      const u = { x: d.x / len, y: d.y / len, z: d.z / len };
      let up = { x: 0, y: 1, z: 0 };
      if (Math.abs(u.y) > 0.99) up = { x: 1, y: 0, z: 0 };
      let wv = { x: u.y * up.z - u.z * up.y, y: u.z * up.x - u.x * up.z, z: u.x * up.y - u.y * up.x }; // u × up
      const wl = Math.hypot(wv.x, wv.y, wv.z); wv = { x: wv.x / wl, y: wv.y / wl, z: wv.z / wl };
      const v = { x: wv.y * u.z - wv.z * u.y, y: wv.z * u.x - wv.x * u.z, z: wv.x * u.y - wv.y * u.x }; // w × u
      return this.obox({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, u, v, wv, { x: len / 2, y: t / 2, z: w / 2 }, opts);
    }
    // Multiply every vertex colour by fn(x, y, z, nx, ny, nz) -> [r, g, b] (static light baking).
    bake(fn) {
      const d = this.data;
      for (let i = 0; i < d.length; i += STRIDE) {
        const l = fn(d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5]);
        d[i + 8] *= l[0]; d[i + 9] *= l[1]; d[i + 10] *= l[2];
      }
      return this;
    }
    // Box with full-texture mapping on every face (0..1 uv), for labels/signs.
    boxUnit(min, max, opts = {}) {
      const col = opts.color || [1, 1, 1, 1];
      const P = (x, y, z) => ({ x, y, z });
      const x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x, y1 = max.y, z1 = max.z;
      const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
      const f = opts.faces || {};
      const show = (k) => f[k] !== false;
      if (show('px')) this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(1, 0, 0), uv, col);
      if (show('nx')) this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), P(-1, 0, 0), uv, col);
      if (show('py')) this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), P(0, 1, 0), uv, col);
      if (show('ny')) this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), P(0, -1, 0), uv, col);
      if (show('pz')) this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), P(0, 0, 1), uv, col);
      if (show('nz')) this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(0, 0, -1), uv, col);
      return this;
    }
    // Ramp sloping along Z: top surface from y=yA at z=zA to y=yB at z=zB, with thickness below.
    rampZ(x0, x1, zA, zB, yA, yB, opts = {}) {
      if (zA > zB) { const tz = zA, ty = yA; zA = zB; yA = yB; zB = tz; yB = ty; } // normalize: zA < zB
      const col = opts.color || [1, 1, 1, 1], s = opts.uvScale || 1, th = opts.thickness || 0.3;
      const P = (x, y, z) => ({ x, y, z });
      const len = Math.hypot(zB - zA, yB - yA);
      const dz = (zB - zA) / len, dy = (yB - yA) / len;
      const nn = { x: 0, y: dz, z: -dy }; // upward normal (dz > 0 after normalization)
      const uvTop = [[x0 / s, len / s], [x1 / s, len / s], [x1 / s, 0], [x0 / s, 0]];
      this.quad(P(x0, yB, zB), P(x1, yB, zB), P(x1, yA, zA), P(x0, yA, zA), nn, uvTop, col, opts.subdiv);
      // underside
      this.quad(P(x0, yA - th, zA), P(x1, yA - th, zA), P(x1, yB - th, zB), P(x0, yB - th, zB), { x: 0, y: -nn.y, z: -nn.z }, uvTop, col);
      // sides
      const uvS = [[zA / s, (yA - th) / s], [zB / s, (yB - th) / s], [zB / s, yB / s], [zA / s, yA / s]];
      this.quad(P(x0, yA - th, zA), P(x0, yB - th, zB), P(x0, yB, zB), P(x0, yA, zA), P(-1, 0, 0), uvS, col);
      this.quad(P(x1, yA, zA), P(x1, yB, zB), P(x1, yB - th, zB), P(x1, yA - th, zA), P(1, 0, 0), uvS, col);
      // ends
      this.quad(P(x0, yA - th, zA), P(x0, yA, zA), P(x1, yA, zA), P(x1, yA - th, zA), P(0, 0, -1), uvS, col);
      this.quad(P(x1, yB - th, zB), P(x1, yB, zB), P(x0, yB, zB), P(x0, yB - th, zB), P(0, 0, 1), uvS, col);
      return this;
    }
    cylinderY(cx, y0, cz, r, h, seg = 12, opts = {}) {
      const col = opts.color || [1, 1, 1, 1], s = opts.uvScale || 1;
      const P = (x, y, z) => ({ x, y, z });
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const p0 = P(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r), p1 = P(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r);
        const p2 = P(p1.x, y0 + h, p1.z), p3 = P(p0.x, y0 + h, p0.z);
        const n = { x: Math.cos((a0 + a1) / 2), y: 0, z: Math.sin((a0 + a1) / 2) };
        const u0 = (i / seg) * (Math.PI * 2 * r) / s, u1 = ((i + 1) / seg) * (Math.PI * 2 * r) / s;
        this.quad(p1, p0, p3, p2, n, [[u1, 0], [u0, 0], [u0, h / s], [u1, h / s]], col, opts.subdiv);
        // top cap
        this.tri(P(cx, y0 + h, cz), p3, p2, { x: 0, y: 1, z: 0 }, [0.5, 0.5], [0.5 + Math.cos(a0) / 2, 0.5 + Math.sin(a0) / 2], [0.5 + Math.cos(a1) / 2, 0.5 + Math.sin(a1) / 2], col);
      }
      return this;
    }
    append(other) { for (const v of other.data) this.data.push(v); this.count += other.count; return this; }
    bounds() {
      const d = this.data, min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (let i = 0; i < d.length; i += STRIDE) {
        if (d[i] < min.x) min.x = d[i]; if (d[i] > max.x) max.x = d[i];
        if (d[i + 1] < min.y) min.y = d[i + 1]; if (d[i + 1] > max.y) max.y = d[i + 1];
        if (d[i + 2] < min.z) min.z = d[i + 2]; if (d[i + 2] > max.z) max.z = d[i + 2];
      }
      return { min, max };
    }
    build(gl) {
      const arr = new Float32Array(this.data);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      return { vbo, count: this.count };
    }
  }
  ZM.MeshBuilder = MeshBuilder;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL not supported');
      this.prog = this._program(VS, FS);
      gl.useProgram(this.prog);
      this.attr = {
        pos: gl.getAttribLocation(this.prog, 'aPos'), normal: gl.getAttribLocation(this.prog, 'aNormal'),
        uv: gl.getAttribLocation(this.prog, 'aUV'), color: gl.getAttribLocation(this.prog, 'aColor'),
      };
      const u = (n) => gl.getUniformLocation(this.prog, n);
      this.uni = {
        proj: u('uProj'), view: u('uView'), model: u('uModel'), tex: u('uTex'), sunDir: u('uSunDir'), sunColor: u('uSunColor'),
        ambient: u('uAmbient'), fogColor: u('uFogColor'), camPos: u('uCamPos'), emissive: u('uEmissive'), fogNear: u('uFogNear'),
        fogFar: u('uFogFar'), unlit: u('uUnlit'), alpha: u('uAlpha'), cutoff: u('uCutoff'),
        lightPos: u('uLightPos'), lightColor: u('uLightColor'), lightRange: u('uLightRange'),
      };
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.uniform1i(this.uni.tex, 0);
      this.proj = ZM.M4.create();
      this.view = ZM.M4.create();
      this.identity = ZM.M4.create();
      this.camPos = { x: 0, y: 0, z: 0 };
      this.camRight = { x: 1, y: 0, z: 0 };
      this.camUp = { x: 0, y: 1, z: 0 };
      this.camFwd = { x: 0, y: 0, z: -1 };
      this.particleVBO = gl.createBuffer();
      this.particleData = new Float32Array(STRIDE * 6 * 4096);
      this.drawCalls = 0;
      this.textures = {};
      this.lightPos = new Float32Array(MAX_LIGHTS * 3);
      this.lightColor = new Float32Array(MAX_LIGHTS * 3);
      this.lightRange = new Float32Array(MAX_LIGHTS);
      this.tmpModel = ZM.M4.create();
      // Detect software WebGL (no GPU acceleration): the game then defaults to a lower render scale.
      this.software = false;
      try {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        this.rendererName = String(name);
        this.software = /swiftshader|llvmpipe|softpipe|software|mesa offscreen/i.test(this.rendererName);
      } catch (e) { /* ignore */ }
    }
    _program(vs, fs) {
      const gl = this.gl;
      const compile = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(p));
      return p;
    }
    loadTextures(canvases) {
      // alpha-cutout textures (fence, grating, cage bars) get no mipmaps: averaged alpha would turn them solid at a distance
      for (const k in canvases) this.textures[k] = this.texture(canvases[k], { repeat: !['glow', 'blob', 'sky', 'boxLid', 'pad'].includes(k), mips: !['fence', 'grate', 'cage'].includes(k) });
    }
    texture(img, opts = {}) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      const pot = (img.width & (img.width - 1)) === 0 && (img.height & (img.height - 1)) === 0;
      if (pot && opts.mips !== false) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const wrap = opts.repeat && pot ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    }
    // Internal render resolution = CSS size × scale (upscaled by the browser). Lower = faster.
    resize(w, h, scale = 1) {
      this.scale = scale;
      this.canvas.width = Math.max(320, Math.round(w * scale)); this.canvas.height = Math.max(180, Math.round(h * scale));
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    // env: {fogColor:[r,g,b], fogNear, fogFar, ambient:[..], sunDir:{x,y,z}, sunColor:[..], lights:[{pos,color,range}]}
    beginFrame(cam, env) {
      const gl = this.gl;
      this.drawCalls = 0;
      const aspect = this.canvas.width / this.canvas.height;
      ZM.M4.perspective(this.proj, cam.fov, aspect, 0.05, 200);
      ZM.M4.fpsView(this.view, cam.pos, cam.yaw, cam.pitch);
      this.camPos = cam.pos;
      this.camFwd = ZM.dirFromAngles(cam.yaw, cam.pitch);
      this.camRight = ZM.V.norm(ZM.V.cross(this.camFwd, { x: 0, y: 1, z: 0 }));
      this.camUp = ZM.V.cross(this.camRight, this.camFwd);
      gl.clearColor(env.fogColor[0], env.fogColor[1], env.fogColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.uni.proj, false, this.proj);
      gl.uniformMatrix4fv(this.uni.view, false, this.view);
      gl.uniform3f(this.uni.camPos, cam.pos.x, cam.pos.y, cam.pos.z);
      gl.uniform3fv(this.uni.fogColor, env.fogColor);
      gl.uniform1f(this.uni.fogNear, env.fogNear);
      gl.uniform1f(this.uni.fogFar, env.fogFar);
      gl.uniform3fv(this.uni.ambient, env.ambient);
      const sd = ZM.V.norm(env.sunDir);
      gl.uniform3f(this.uni.sunDir, sd.x, sd.y, sd.z);
      gl.uniform3fv(this.uni.sunColor, env.sunColor);
      this.setLights(env.lights || []);
      this.env = env;
      this._computeFrustum();
    }
    // Static geometry carries its lighting in the vertex colours: only ambient-free dynamic lights are added.
    lightMode(baked) {
      const gl = this.gl, env = this.env;
      if (baked) { gl.uniform3f(this.uni.ambient, 1, 1, 1); gl.uniform3f(this.uni.sunColor, 0, 0, 0); this.setLights(env.dynLights || []); }
      else { gl.uniform3fv(this.uni.ambient, env.ambient); gl.uniform3fv(this.uni.sunColor, env.sunColor); this.setLights(env.lights || []); }
    }
    _computeFrustum() {
      const m = ZM.M4.multiply(this.frustumMat || (this.frustumMat = ZM.M4.create()), this.proj, this.view);
      const row = (r) => [m[r], m[4 + r], m[8 + r], m[12 + r]];
      const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
      const planes = this.frustum || (this.frustum = []);
      planes.length = 0;
      const add = (a, sign) => planes.push([r3[0] + sign * a[0], r3[1] + sign * a[1], r3[2] + sign * a[2], r3[3] + sign * a[3]]);
      add(r0, 1); add(r0, -1); add(r1, 1); add(r1, -1); add(r2, 1); add(r2, -1);
    }
    // Axis-aligned box vs view frustum (conservative: returns true if possibly visible).
    aabbVisible(min, max) {
      const p = this.frustum;
      if (!p) return true;
      for (let i = 0; i < 6; i++) {
        const pl = p[i];
        const x = pl[0] >= 0 ? max.x : min.x, y = pl[1] >= 0 ? max.y : min.y, z = pl[2] >= 0 ? max.z : min.z;
        if (pl[0] * x + pl[1] * y + pl[2] * z + pl[3] < 0) return false;
      }
      return true;
    }
    setLights(lights) {
      const gl = this.gl;
      this.lightPos.fill(0); this.lightColor.fill(0); this.lightRange.fill(0.001);
      // choose nearest MAX_LIGHTS (priority lights first)
      const sorted = lights.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0) || ZM.V.dist(a.pos, this.camPos) - ZM.V.dist(b.pos, this.camPos));
      for (let i = 0; i < Math.min(MAX_LIGHTS, sorted.length); i++) {
        const l = sorted[i];
        this.lightPos[i * 3] = l.pos.x; this.lightPos[i * 3 + 1] = l.pos.y; this.lightPos[i * 3 + 2] = l.pos.z;
        this.lightColor[i * 3] = l.color[0]; this.lightColor[i * 3 + 1] = l.color[1]; this.lightColor[i * 3 + 2] = l.color[2];
        this.lightRange[i] = l.range;
      }
      gl.uniform3fv(this.uni.lightPos, this.lightPos);
      gl.uniform3fv(this.uni.lightColor, this.lightColor);
      gl.uniform1fv(this.uni.lightRange, this.lightRange);
    }
    _bindMesh(vbo) {
      const gl = this.gl, a = this.attr, bytes = STRIDE * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(a.pos); gl.vertexAttribPointer(a.pos, 3, gl.FLOAT, false, bytes, 0);
      gl.enableVertexAttribArray(a.normal); gl.vertexAttribPointer(a.normal, 3, gl.FLOAT, false, bytes, 12);
      gl.enableVertexAttribArray(a.uv); gl.vertexAttribPointer(a.uv, 2, gl.FLOAT, false, bytes, 24);
      gl.enableVertexAttribArray(a.color); gl.vertexAttribPointer(a.color, 4, gl.FLOAT, false, bytes, 32);
    }
    _state(opts) {
      const gl = this.gl;
      gl.uniform3f(this.uni.emissive, ...(opts.emissive || [0, 0, 0]));
      gl.uniform1f(this.uni.unlit, opts.unlit ? 1 : 0);
      gl.uniform1f(this.uni.alpha, opts.alpha === undefined ? 1 : opts.alpha);
      gl.uniform1f(this.uni.cutoff, opts.cutoff !== undefined ? opts.cutoff : (opts.blend ? 0.01 : 0.35));
      if (opts.blend) {
        gl.enable(gl.BLEND);
        if (opts.blend === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
      } else { gl.disable(gl.BLEND); gl.depthMask(true); }
      if (opts.cull === false) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      if (opts.depthTest === false) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
    }
    draw(mesh, model, tex, opts = {}) {
      if (!mesh || mesh.count === 0) return;
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniformMatrix4fv(this.uni.model, false, model || this.identity);
      this._state(opts);
      this._bindMesh(mesh.vbo);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
      this.drawCalls++;
    }
    // Particles: [{pos, size, color:[r,g,b,a], (end: pos for segments, width)}, ...]
    drawParticles(list, tex, opts = {}) {
      if (!list.length) return;
      const gl = this.gl, d = this.particleData;
      let n = 0;
      const push = (p, u, v, c) => {
        if ((n + 1) * STRIDE > d.length) return false;
        const o = n * STRIDE;
        d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = 0; d[o + 4] = 1; d[o + 5] = 0; d[o + 6] = u; d[o + 7] = v;
        d[o + 8] = c[0]; d[o + 9] = c[1]; d[o + 10] = c[2]; d[o + 11] = c[3] === undefined ? 1 : c[3];
        n++; return true;
      };
      const R = this.camRight, Up = this.camUp;
      for (const p of list) {
        let a, b, c, e;
        if (p.end) { // segment quad from pos to end, width p.width
          const dir = ZM.V.sub(p.end, p.pos);
          const toCam = ZM.V.sub(this.camPos, p.pos);
          let side = ZM.V.cross(dir, toCam);
          const sl = ZM.V.len(side); if (sl < 1e-6) continue;
          side = ZM.V.scale(side, (p.width || 0.05) / 2 / sl);
          a = ZM.V.sub(p.pos, side); b = ZM.V.add(p.pos, side); c = ZM.V.add(p.end, side); e = ZM.V.sub(p.end, side);
        } else if (p.flat) { // ground-aligned quad
          const s = p.size / 2;
          a = { x: p.pos.x - s, y: p.pos.y, z: p.pos.z + s }; b = { x: p.pos.x + s, y: p.pos.y, z: p.pos.z + s };
          c = { x: p.pos.x + s, y: p.pos.y, z: p.pos.z - s }; e = { x: p.pos.x - s, y: p.pos.y, z: p.pos.z - s };
        } else {
          const s = p.size / 2;
          const r = ZM.V.scale(R, s), u = ZM.V.scale(Up, s);
          a = ZM.V.sub(ZM.V.sub(p.pos, r), u); b = ZM.V.sub(ZM.V.add(p.pos, r), u);
          c = ZM.V.add(ZM.V.add(p.pos, r), u); e = ZM.V.add(ZM.V.sub(p.pos, r), u);
        }
        const col = p.color;
        if (!push(a, 0, 1, col)) break; push(b, 1, 1, col); push(c, 1, 0, col);
        push(a, 0, 1, col); push(c, 1, 0, col); push(e, 0, 0, col);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniformMatrix4fv(this.uni.model, false, this.identity);
      this._state(Object.assign({ blend: 'alpha', unlit: true, cull: false }, opts));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleVBO);
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * STRIDE), gl.DYNAMIC_DRAW);
      this._bindMesh(this.particleVBO);
      gl.drawArrays(gl.TRIANGLES, 0, n);
      this.drawCalls++;
    }
    // Composite a 2D canvas (the HUD) over the frame as one textured quad. Uploads only when `dirty`.
    drawOverlay(canvas, dirty) {
      const gl = this.gl;
      if (!this.overlayTex) {
        this.overlayTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const mb = new MeshBuilder();
        const P = (x, y) => ({ x, y, z: 0 });
        mb.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), { x: 0, y: 0, z: 1 }, [[0, 1], [1, 1], [1, 0], [0, 0]], [1, 1, 1, 1]);
        this.overlayMesh = mb.build(gl);
        dirty = true;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
      if (dirty) {
        if (this.overlayW !== canvas.width || this.overlayH !== canvas.height) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); this.overlayW = canvas.width; this.overlayH = canvas.height; }
        else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      }
      gl.uniformMatrix4fv(this.uni.proj, false, this.identity);
      gl.uniformMatrix4fv(this.uni.view, false, this.identity);
      gl.uniformMatrix4fv(this.uni.model, false, this.identity);
      gl.uniform1f(this.uni.fogNear, 1e6); gl.uniform1f(this.uni.fogFar, 2e6);
      this._state({ blend: 'alpha', unlit: true, cull: false, depthTest: false });
      this._bindMesh(this.overlayMesh.vbo);
      gl.drawArrays(gl.TRIANGLES, 0, this.overlayMesh.count);
      this.drawCalls++;
    }
    // Viewmodel pass: separate projection, camera-space coordinates, depth cleared.
    beginViewmodel(fov) {
      const gl = this.gl;
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const aspect = this.canvas.width / this.canvas.height;
      const p = ZM.M4.perspective(ZM.M4.create(), fov, aspect, 0.02, 20);
      gl.uniformMatrix4fv(this.uni.proj, false, p);
      gl.uniformMatrix4fv(this.uni.view, false, this.identity);
      gl.uniform3f(this.uni.camPos, 0, 0, 0);
      gl.uniform1f(this.uni.fogNear, 100); gl.uniform1f(this.uni.fogFar, 200);
      gl.uniform3f(this.uni.ambient, 0.5, 0.5, 0.55);
      // transform lights into camera space is overkill; use a fixed key light for the viewmodel
      const sd = ZM.M4.transformPoint(this.view, ZM.V.add(this.camPos, ZM.V.norm(this.env.sunDir)));
      gl.uniform3f(this.uni.sunDir, sd.x, sd.y, sd.z);
      const lights = [];
      for (let i = 0; i < MAX_LIGHTS; i++) {
        if (this.lightRange[i] <= 0.001) continue;
        const wp = { x: this.lightPos[i * 3], y: this.lightPos[i * 3 + 1], z: this.lightPos[i * 3 + 2] };
        const cp = ZM.M4.transformPoint(this.view, wp);
        lights.push({ pos: cp, color: [this.lightColor[i * 3], this.lightColor[i * 3 + 1], this.lightColor[i * 3 + 2]], range: this.lightRange[i], priority: 1 });
      }
      const saveCam = this.camPos; this.camPos = { x: 0, y: 0, z: 0 };
      this.setLights(lights);
      this.camPos = saveCam;
    }
  }
  ZM.Renderer = Renderer;
})();
