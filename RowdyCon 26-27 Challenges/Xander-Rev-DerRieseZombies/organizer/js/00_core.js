// ---------------------------------------------------------------------------
// 00_core.js — math, utilities, RNG, SHA-256 (pure JS; no crypto.subtle so the
// game works over plain HTTP on any host).
// ---------------------------------------------------------------------------
ZM.VERSION = '1.0.0';

// ---- vector helpers (plain objects {x,y,z}) ---------------------------------
const V = ZM.V = {
  make(x = 0, y = 0, z = 0) { return { x, y, z }; },
  copy(a) { return { x: a.x, y: a.y, z: a.z }; },
  set(o, x, y, z) { o.x = x; o.y = y; o.z = z; return o; },
  add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
  sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
  scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
  dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
  cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; },
  len(a) { return Math.hypot(a.x, a.y, a.z); },
  len2(a) { return a.x * a.x + a.y * a.y + a.z * a.z; },
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
  distXZ(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); },
  norm(a) { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; },
  lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; },
};

// ---- 4x4 matrices (column-major Float32Array, WebGL convention) -------------
const MUL_TMP = new Float32Array(16), OP_TMP = new Float32Array(16);
const M4 = ZM.M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  copy(out, a) { out.set(a); return out; },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
    return out;
  },
  multiply(out, a, b) {
    const o = MUL_TMP;
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    out.set(o); return out;
  },
  _op() { const m = OP_TMP; m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  translate(out, a, v) {
    const m = M4._op(); m[12] = v.x; m[13] = v.y; m[14] = v.z;
    return M4.multiply(out, a, m);
  },
  scale(out, a, v) {
    const m = M4._op(); m[0] = v.x; m[5] = v.y; m[10] = v.z;
    return M4.multiply(out, a, m);
  },
  rotateX(out, a, rad) {
    const c = Math.cos(rad), s = Math.sin(rad), m = M4._op();
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return M4.multiply(out, a, m);
  },
  rotateY(out, a, rad) {
    const c = Math.cos(rad), s = Math.sin(rad), m = M4._op();
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return M4.multiply(out, a, m);
  },
  rotateZ(out, a, rad) {
    const c = Math.cos(rad), s = Math.sin(rad), m = M4._op();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return M4.multiply(out, a, m);
  },
  // View matrix for a camera at eye with yaw (around Y) and pitch (around X).
  // Convention: yaw=0 looks toward -Z; positive yaw turns toward -X (left).
  fpsView(out, eye, yaw, pitch) {
    M4.identity(out);
    M4.rotateX(out, out, -pitch);
    M4.rotateY(out, out, -yaw);
    M4.translate(out, out, { x: -eye.x, y: -eye.y, z: -eye.z });
    return out;
  },
  transformPoint(m, p) {
    return {
      x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
      y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
      z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    };
  },
};

// Forward direction for yaw/pitch (matches M4.fpsView).
ZM.dirFromAngles = function (yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
};

// ---- misc utils --------------------------------------------------------------
const U = ZM.U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  smoothstep(a, b, t) { t = U.clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
  rand(a = 0, b = 1) { return a + Math.random() * (b - a); },
  randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  angleWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; },
  fmtPoints(n) { return String(Math.floor(n)); },
  now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; },
  hexToBytes(hex) { const out = new Uint8Array(hex.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16); return out; },
  bytesToHex(b) { let s = ''; for (let i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; },
  utf8(str) { return new TextEncoder().encode(str); },
  fromUtf8(bytes) { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return null; } },
  // Ray vs axis-aligned box. Returns t of entry or -1.
  rayAABB(ro, rd, min, max) {
    let tmin = 0, tmax = Infinity;
    const axes = ['x', 'y', 'z'];
    for (const a of axes) {
      const d = rd[a];
      if (Math.abs(d) < 1e-9) {
        if (ro[a] < min[a] || ro[a] > max[a]) return -1;
      } else {
        let t1 = (min[a] - ro[a]) / d, t2 = (max[a] - ro[a]) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  },
  // Ray vs sphere: returns t or -1.
  raySphere(ro, rd, c, r) {
    const ox = ro.x - c.x, oy = ro.y - c.y, oz = ro.z - c.z;
    const b = ox * rd.x + oy * rd.y + oz * rd.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - cc;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : (cc < 0 ? 0 : -1);
  },
  // Ray vs vertical capsule approximated by a cylinder (x,z center, radius, y0..y1). Returns t or -1.
  rayCylinderY(ro, rd, cx, cz, r, y0, y1) {
    const ox = ro.x - cx, oz = ro.z - cz;
    const a = rd.x * rd.x + rd.z * rd.z;
    const b = 2 * (ox * rd.x + oz * rd.z);
    const c = ox * ox + oz * oz - r * r;
    let t;
    if (a < 1e-9) { if (c > 0) return -1; t = 0; }
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) return -1;
      t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0) { if (c < 0) t = 0; else return -1; }
    }
    const y = ro.y + rd.y * t;
    if (y >= y0 && y <= y1) return t;
    // check caps
    if (Math.abs(rd.y) < 1e-9) return -1;
    for (const yc of [y0, y1]) {
      const tc = (yc - ro.y) / rd.y;
      if (tc < 0) continue;
      const x = ox + rd.x * tc, z = oz + rd.z * tc;
      if (x * x + z * z <= r * r) return tc;
    }
    return -1;
  },
};

// Deterministic PRNG (mulberry32) — used where repeatability helps (textures).
ZM.makeRng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---- SHA-256 (FIPS 180-4) ------------------------------------------------------
(function () {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256Bytes(msg) { // msg: Uint8Array -> Uint8Array(32)
    const l = msg.length;
    const padLen = ((l + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(padLen);
    buf.set(msg);
    buf[l] = 0x80;
    const bits = l * 8;
    // 64-bit big-endian length (high 32 bits first)
    const hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
    buf[padLen - 8] = (hi >>> 24) & 255; buf[padLen - 7] = (hi >>> 16) & 255; buf[padLen - 6] = (hi >>> 8) & 255; buf[padLen - 5] = hi & 255;
    buf[padLen - 4] = (lo >>> 24) & 255; buf[padLen - 3] = (lo >>> 16) & 255; buf[padLen - 2] = (lo >>> 8) & 255; buf[padLen - 1] = lo & 255;
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) {
        const j = off + i * 4;
        W[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
      }
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 255; out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255; }
    return out;
  }
  ZM.sha256Bytes = sha256Bytes;
  ZM.sha256 = function (str) { return U.bytesToHex(sha256Bytes(U.utf8(str))); };
})();

// ---- tiny event bus -------------------------------------------------------------
ZM.Events = class {
  constructor() { this.map = new Map(); }
  on(name, fn) { if (!this.map.has(name)) this.map.set(name, []); this.map.get(name).push(fn); return fn; }
  off(name, fn) { const l = this.map.get(name); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } }
  emit(name, ...args) { const l = this.map.get(name); if (l) for (const fn of l.slice()) fn(...args); }
};
