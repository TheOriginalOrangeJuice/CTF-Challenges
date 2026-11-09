(function () {
'use strict';
const ZM = {};

// ===== 00_core.js =====
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


// ===== 05_vault.js =====
// ---------------------------------------------------------------------------
// 05_vault.js — the "mainframe vault": a SHA-256 hash chain advanced once per
// legitimate round transition. At round 100 the chain state derives the key
// that decrypts the flag ciphertext in flag_data.js. The chain is NOT a
// function of the round number alone: it must be walked, step by step.
// ---------------------------------------------------------------------------
(function () {
  const SEED = 'DER_RIESE::MAINFRAME::115';
  const TARGET_ROUND = 100;

  class Vault {
    constructor() {
      this.reset();
    }
    reset() {
      this.round = 1;
      this.state = ZM.sha256(SEED);
      this.history = 0;
    }
    // Called by the game exactly once per round advance (r = new round).
    advance(r) {
      this.round = r;
      this.state = ZM.sha256(this.state + ':' + r);
      this.history++;
      return this.state;
    }
    isUnlockRound() { return this.round === TARGET_ROUND; }
    keyFromState(state) { return ZM.sha256(state + ':FLAG'); }
    // Attempt to decrypt the flag with the current chain state.
    // Returns { ok: true, flag } or { ok: false }.
    open(data) {
      data = data || ZM.FLAG;
      if (!data || !data.ct) return { ok: false, reason: 'no vault data' };
      const key = this.keyFromState(this.state);
      const ct = ZM.U.hexToBytes(data.ct);
      const pt = new Uint8Array(ct.length);
      for (let off = 0, i = 0; off < ct.length; off += 32, i++) {
        const ks = ZM.sha256Bytes(ZM.U.utf8(key + ':' + i));
        for (let j = 0; j < 32 && off + j < ct.length; j++) pt[off + j] = ct[off + j] ^ ks[j];
      }
      const tag = ZM.U.bytesToHex(ZM.sha256Bytes(pt));
      if (tag !== data.tag) return { ok: false, reason: 'integrity check failed' };
      const flag = ZM.U.fromUtf8(pt);
      if (flag === null) return { ok: false, reason: 'integrity check failed' };
      return { ok: true, flag };
    }
  }
  Vault.SEED = SEED;
  Vault.TARGET_ROUND = TARGET_ROUND;
  ZM.Vault = Vault;
})();


// ===== 10_audio.js =====
// ---------------------------------------------------------------------------
// 10_audio.js — fully synthesized sound effects via WebAudio (no files).
// ---------------------------------------------------------------------------
(function () {
  class Audio {
    constructor() {
      this.ctx = null; this.master = null; this.muted = false; this.listener = { x: 0, y: 0, z: 0 };
      this.lastPlay = {}; this.noise = null; this.volume = 0.6;
    }
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
    setListener(p) { this.listener = p; }
    _vol(opts) {
      let v = opts.vol === undefined ? 1 : opts.vol;
      if (opts.pos) { const d = ZM.V.dist(opts.pos, this.listener); v *= ZM.U.clamp(1 - d / (opts.range || 32), 0.03, 1); }
      return v;
    }
    _gain(v, t0) { const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t0); g.connect(this.master); return g; }
    _noise(t0, dur, filterType, freq, q, vol, env = [0.005, dur]) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t0); if (q) f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + env[0]); g.gain.exponentialRampToValueAtTime(0.0001, t0 + env[1]);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
      return { src, f, g };
    }
    _tone(t0, dur, type, f0, f1, vol, env = [0.005, dur]) {
      const c = this.ctx, o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + env[0]); g.gain.exponentialRampToValueAtTime(0.0001, t0 + env[1]);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return { o, g };
    }
    play(name, opts = {}) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, t = c.currentTime;
      const v = this._vol(opts);
      if (v <= 0.01) return;
      // rate limit identical sounds
      const key = name;
      if (this.lastPlay[key] && t - this.lastPlay[key] < (opts.minGap || 0.03)) return;
      this.lastPlay[key] = t;
      const pitch = opts.pitch || 1;
      switch (name) {
        case 'shot_pistol': this._noise(t, 0.12, 'lowpass', 2500, 1, 0.9 * v, [0.003, 0.12]); this._tone(t, 0.09, 'sine', 220 * pitch, 60, 0.6 * v); break;
        case 'shot_magnum': this._noise(t, 0.22, 'lowpass', 1800, 1, 1.0 * v, [0.003, 0.22]); this._tone(t, 0.16, 'sine', 160, 40, 0.8 * v); break;
        case 'shot_smg': this._noise(t, 0.08, 'bandpass', 1800, 0.7, 0.7 * v, [0.002, 0.08]); this._tone(t, 0.06, 'square', 300 * pitch, 80, 0.25 * v); break;
        case 'shot_rifle': this._noise(t, 0.14, 'lowpass', 2200, 1, 0.9 * v, [0.002, 0.14]); this._tone(t, 0.1, 'sine', 180, 50, 0.6 * v); break;
        case 'shot_lmg': this._noise(t, 0.12, 'lowpass', 1600, 1, 0.9 * v, [0.002, 0.12]); this._tone(t, 0.09, 'sine', 140, 50, 0.6 * v); break;
        case 'shot_shotgun': this._noise(t, 0.3, 'lowpass', 1200, 1, 1.1 * v, [0.004, 0.3]); this._tone(t, 0.22, 'sine', 120, 35, 0.9 * v); break;
        case 'shot_sniper': this._noise(t, 0.4, 'lowpass', 2600, 1, 1.0 * v, [0.002, 0.4]); this._tone(t, 0.3, 'sine', 150, 30, 0.9 * v); break;
        case 'shot_launcher': this._noise(t, 0.5, 'bandpass', 500, 0.8, 0.9 * v, [0.03, 0.5]); this._tone(t, 0.4, 'sawtooth', 400, 80, 0.3 * v); break;
        case 'shot_ray': this._tone(t, 0.18, 'sawtooth', 1100, 250, 0.35 * v); this._tone(t, 0.18, 'square', 1500, 300, 0.15 * v); break;
        case 'shot_wunder': { this._noise(t, 0.5, 'bandpass', 3000, 2, 0.8 * v, [0.01, 0.5]); this._tone(t, 0.45, 'sawtooth', 60, 500, 0.3 * v); this._tone(t + 0.05, 0.3, 'square', 900, 1800, 0.12 * v); break; }
        case 'shot_knife': case 'knife': this._noise(t, 0.15, 'bandpass', 2500, 1.5, 0.35 * v, [0.03, 0.15]); break;
        case 'dry': this._tone(t, 0.04, 'square', 900, 500, 0.15 * v); break;
        case 'reload': this._noise(t, 0.05, 'highpass', 2000, 1, 0.3 * v, [0.002, 0.05]); this._noise(t + 0.35, 0.06, 'highpass', 1500, 1, 0.35 * v, [0.002, 0.06]); this._tone(t + 0.35, 0.05, 'square', 400, 300, 0.1 * v); break;
        case 'hitmarker': this._tone(t, 0.04, 'square', 1800, 1600, 0.12 * v); break;
        case 'flesh': this._noise(t, 0.08, 'lowpass', 600, 1, 0.5 * v, [0.004, 0.08]); break;
        case 'zombie_groan': { const f = (60 + Math.random() * 50) * pitch; const r = this._tone(t, 0.9, 'sawtooth', f, f * 0.8, 0.35 * v, [0.15, 0.9]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; r.o.disconnect(); r.o.connect(lp); lp.connect(r.g); break; }
        case 'zombie_attack': { const r = this._tone(t, 0.5, 'sawtooth', 140, 90, 0.4 * v, [0.03, 0.5]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; r.o.disconnect(); r.o.connect(lp); lp.connect(r.g); this._noise(t, 0.3, 'bandpass', 900, 1, 0.3 * v, [0.02, 0.3]); break; }
        case 'zombie_die': { const r = this._tone(t, 0.7, 'sawtooth', 120, 40, 0.35 * v, [0.02, 0.7]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450; r.o.disconnect(); r.o.connect(lp); lp.connect(r.g); break; }
        case 'dog_bark': this._noise(t, 0.12, 'bandpass', 700, 2, 0.6 * v, [0.01, 0.12]); this._tone(t, 0.1, 'sawtooth', 300, 150, 0.3 * v); break;
        case 'dog_howl': this._tone(t, 1.6, 'sawtooth', 300, 500, 0.25 * v, [0.3, 1.6]); this._tone(t + 0.2, 1.4, 'sine', 600, 900, 0.15 * v, [0.3, 1.4]); break;
        case 'door': this._noise(t, 0.4, 'lowpass', 400, 1, 0.8 * v, [0.01, 0.4]); this._noise(t + 0.1, 0.5, 'lowpass', 900, 1, 0.5 * v, [0.02, 0.5]); break;
        case 'boards': this._noise(t, 0.08, 'lowpass', 700, 1, 0.5 * v, [0.003, 0.08]); this._tone(t, 0.08, 'triangle', 220, 120, 0.3 * v); break;
        case 'board_rip': this._noise(t, 0.2, 'bandpass', 1200, 1, 0.5 * v, [0.01, 0.2]); break;
        case 'buy': this._tone(t, 0.08, 'sine', 1300, 1300, 0.3 * v); this._tone(t + 0.1, 0.25, 'sine', 1950, 1950, 0.3 * v); break;
        case 'deny': this._tone(t, 0.15, 'square', 200, 150, 0.15 * v); break;
        case 'perk': [523, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.12, 0.3, 'triangle', f, f, 0.25 * v)); this._tone(t + 0.5, 0.4, 'sine', 300, 300, 0.2 * v); break;
        case 'box': for (let i = 0; i < 8; i++) this._tone(t + i * 0.3, 0.25, 'triangle', 440 * Math.pow(2, (i % 4) / 12), 440 * Math.pow(2, (i % 4) / 12), 0.15 * v); break;
        case 'teddy': [700, 600, 500, 400, 300].forEach((f, i) => this._tone(t + i * 0.2, 0.3, 'triangle', f, f * 0.9, 0.25 * v)); break;
        case 'powerup': [880, 1108, 1318, 1760].forEach((f, i) => this._tone(t + i * 0.07, 0.35, 'sine', f, f, 0.25 * v)); break;
        case 'powerup_end': [1318, 1108, 880].forEach((f, i) => this._tone(t + i * 0.1, 0.3, 'sine', f, f, 0.2 * v)); break;
        case 'nuke': this._noise(t, 1.2, 'lowpass', 300, 1, 1.0 * v, [0.05, 1.2]); this._tone(t, 1.0, 'sine', 80, 30, 0.8 * v); break;
        case 'round_start': this._tone(t, 2.2, 'sawtooth', 55, 55, 0.25 * v, [0.4, 2.2]); this._tone(t + 0.3, 2.0, 'sine', 110, 110, 0.25 * v, [0.4, 2.0]); this._tone(t + 1.2, 1.6, 'sawtooth', 65, 65, 0.2 * v, [0.3, 1.6]); break;
        case 'round_end': this._tone(t, 1.8, 'sine', 220, 220, 0.2 * v, [0.3, 1.8]); this._tone(t + 0.5, 1.6, 'sine', 330, 330, 0.18 * v, [0.3, 1.6]); this._tone(t + 1.0, 1.4, 'sine', 440, 440, 0.15 * v, [0.3, 1.4]); break;
        case 'player_hurt': this._noise(t, 0.25, 'lowpass', 500, 1, 0.6 * v, [0.01, 0.25]); this._tone(t, 0.3, 'sine', 90, 50, 0.5 * v); break;
        case 'heartbeat': this._tone(t, 0.12, 'sine', 60, 40, 0.5 * v); this._tone(t + 0.2, 0.12, 'sine', 55, 40, 0.4 * v); break;
        case 'down': this._tone(t, 1.5, 'sawtooth', 140, 40, 0.3 * v, [0.05, 1.5]); this._noise(t, 0.6, 'lowpass', 400, 1, 0.5 * v, [0.02, 0.6]); break;
        case 'revive': [400, 500, 600, 800].forEach((f, i) => this._tone(t + i * 0.1, 0.3, 'sine', f, f, 0.2 * v)); break;
        case 'explosion': this._noise(t, 0.9, 'lowpass', 500, 1, 1.2 * v, [0.01, 0.9]); this._tone(t, 0.5, 'sine', 70, 25, 1.0 * v); break;
        case 'teleport': this._tone(t, 1.2, 'sawtooth', 100, 1600, 0.3 * v, [0.2, 1.2]); this._noise(t, 1.2, 'bandpass', 2000, 2, 0.4 * v, [0.3, 1.2]); break;
        case 'link': this._tone(t, 0.4, 'square', 600, 900, 0.15 * v); this._tone(t + 0.4, 0.5, 'square', 900, 1200, 0.15 * v); break;
        case 'power': this._noise(t, 0.3, 'lowpass', 300, 1, 0.8 * v, [0.01, 0.3]); this._tone(t + 0.2, 1.5, 'sawtooth', 50, 60, 0.25 * v, [0.3, 1.5]); this._tone(t + 0.3, 1.2, 'square', 120, 120, 0.08 * v, [0.3, 1.2]); break;
        case 'pap': this._noise(t, 0.3, 'lowpass', 500, 1, 0.5 * v, [0.01, 0.3]); [220, 330, 440, 660, 880].forEach((f, i) => this._tone(t + 0.4 + i * 0.25, 0.3, 'triangle', f, f, 0.2 * v)); this._tone(t + 2.2, 0.6, 'sine', 1320, 1320, 0.25 * v); break;
        case 'monkey': for (let i = 0; i < 10; i++) this._tone(t + i * 0.25, 0.2, 'square', [660, 880, 990, 880][i % 4], [660, 880, 990, 880][i % 4], 0.08 * v); break;
        case 'claymore': this._tone(t, 0.06, 'square', 1500, 1500, 0.1 * v); break;
        case 'lightning': this._noise(t, 0.4, 'highpass', 3000, 1, 0.5 * v, [0.005, 0.4]); this._tone(t, 0.2, 'sawtooth', 2000, 200, 0.2 * v); break;
        case 'flag': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this._tone(t + i * 0.18, 0.5, 'triangle', f, f, 0.25 * v)); break;
        case 'points': this._tone(t, 0.05, 'sine', 2200, 2200, 0.05 * v); break;
        case 'footstep': this._noise(t, 0.05, 'lowpass', 600, 1, 0.15 * v, [0.003, 0.05]); break;
        case 'vault': this._noise(t, 0.3, 'lowpass', 900, 1, 0.4 * v, [0.01, 0.3]); break;
        default: break;
      }
    }
  }
  ZM.Audio = Audio;
})();


// ===== 20_textures.js =====
// ---------------------------------------------------------------------------
// 20_textures.js — procedural canvas textures (no asset files needed).
// Dark 1940s factory palette: grey stone, sooty brick, stained concrete,
// riveted steel, corrugated roofing, hex panels, chain-link, grating, windows.
// ---------------------------------------------------------------------------
(function () {
  const T = ZM.Textures = {};

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function noiseFill(ctx, w, h, base, amp, rng, grainSize = 1) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y += grainSize) for (let x = 0; x < w; x += grainSize) {
      const n = (rng() - 0.5) * amp;
      for (let yy = 0; yy < grainSize; yy++) for (let xx = 0; xx < grainSize; xx++) {
        const i = ((y + yy) * w + (x + xx)) * 4;
        if (i >= d.length) continue;
        d[i] = ZM.U.clamp(base[0] + n, 0, 255);
        d[i + 1] = ZM.U.clamp(base[1] + n, 0, 255);
        d[i + 2] = ZM.U.clamp(base[2] + n, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  // low-frequency blotches (multiplicative darkening / lightening)
  function blotches(ctx, w, h, rng, count, rmin, rmax, color, alpha) {
    for (let i = 0; i < count; i++) {
      const r = rmin + rng() * (rmax - rmin);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, color.replace('A', String(alpha)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.save(); ctx.translate(rng() * w, rng() * h); ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
    }
  }
  function streaks(ctx, w, h, rng, count, color, alpha, drift = 10) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color;
    for (let i = 0; i < count; i++) {
      ctx.lineWidth = 1 + rng() * 2; ctx.beginPath();
      const x = rng() * w, y0 = rng() * h * 0.5;
      ctx.moveTo(x, y0); ctx.lineTo(x + (rng() - 0.5) * drift, y0 + h * (0.3 + rng() * 0.7)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function grime(ctx, w, h, rng, count, alpha) { blotches(ctx, w, h, rng, count, 4, 28, 'rgba(0,0,0,A)', alpha); }
  function cracks(ctx, w, h, rng, n, color = 'rgba(25,25,24,0.75)') {
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); let x = rng() * w, y = rng() * h; ctx.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (rng() - 0.5) * 28; y += (rng() - 0.5) * 28; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function rivet(ctx, x, y, r = 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x + 1, y + 1, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a6e74'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#a0a4aa'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 7); ctx.fill();
  }

  // ---- surfaces ----
  T.concrete = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(11);
    noiseFill(ctx, w, h, [92, 91, 88], 26, rng, 2);
    blotches(ctx, w, h, rng, 30, 20, 70, 'rgba(60,58,52,A)', 0.35);
    streaks(ctx, w, h, rng, 30, '#2e2c28', 0.18, 6);
    grime(ctx, w, h, rng, 30, 0.3);
    cracks(ctx, w, h, rng, 4);
    ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.moveTo(128, 0); ctx.lineTo(128, h); ctx.stroke();
    return c;
  };
  T.plaster = function () { // pale interior wall (office)
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(12);
    noiseFill(ctx, w, h, [128, 122, 108], 20, rng, 2);
    blotches(ctx, w, h, rng, 20, 20, 80, 'rgba(70,60,40,A)', 0.4);
    streaks(ctx, w, h, rng, 20, '#4a4036', 0.2);
    cracks(ctx, w, h, rng, 5, 'rgba(60,50,40,0.6)');
    return c;
  };
  T.floor = function () { // dark stained concrete slabs
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(23);
    noiseFill(ctx, w, h, [68, 67, 64], 22, rng, 2);
    blotches(ctx, w, h, rng, 40, 15, 60, 'rgba(20,18,14,A)', 0.45);
    blotches(ctx, w, h, rng, 12, 20, 50, 'rgba(110,105,95,A)', 0.2);
    cracks(ctx, w, h, rng, 5, 'rgba(20,20,20,0.7)');
    ctx.strokeStyle = 'rgba(18,18,18,0.8)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke(); }
    return c;
  };
  T.ground = function () { // outdoor yard: cracked slabs, dirt and gravel
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(29);
    noiseFill(ctx, w, h, [74, 72, 66], 26, rng, 2);
    blotches(ctx, w, h, rng, 30, 20, 70, 'rgba(50,42,30,A)', 0.5);
    blotches(ctx, w, h, rng, 30, 10, 40, 'rgba(15,14,12,A)', 0.4);
    ctx.fillStyle = 'rgba(130,125,110,0.3)';
    for (let i = 0; i < 160; i++) ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 2);
    cracks(ctx, w, h, rng, 8, 'rgba(18,18,16,0.8)');
    ctx.strokeStyle = 'rgba(22,22,20,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.moveTo(128, 0); ctx.lineTo(128, h); ctx.stroke();
    return c;
  };
  T.dirt = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(31);
    noiseFill(ctx, w, h, [62, 52, 40], 36, rng, 3);
    blotches(ctx, w, h, rng, 30, 20, 60, 'rgba(20,14,8,A)', 0.5);
    ctx.fillStyle = 'rgba(110,100,80,0.25)';
    for (let i = 0; i < 100; i++) ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 4, 1 + rng() * 2);
    return c;
  };
  T.brick = function () { // sooty red-brown brick, grey mortar
    const w = 512, h = 512, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(47);
    ctx.fillStyle = '#4a4744'; ctx.fillRect(0, 0, w, h);
    const bw = 64, bh = 24;
    for (let row = 0; row < h / bh + 1; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + off, y = row * bh;
        const t = rng();
        const r = 86 + t * 34, g = 54 + t * 18, b = 44 + t * 12;
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = `rgba(0,0,0,${rng() * 0.35})`; ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 2, y + 2, bw - 4, 2);
      }
    }
    blotches(ctx, w, h, rng, 30, 40, 110, 'rgba(0,0,0,A)', 0.28);
    blotches(ctx, w, h, rng, 16, 30, 90, 'rgba(120,110,95,A)', 0.14);
    streaks(ctx, w, h, rng, 40, '#1a1612', 0.25, 8);
    return c;
  };
  T.stone = function () { // grey ashlar blocks (outdoor factory walls)
    const w = 512, h = 512, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(53);
    ctx.fillStyle = '#3c3b38'; ctx.fillRect(0, 0, w, h);
    const bw = 128, bh = 64;
    for (let row = 0; row < h / bh + 1; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + off, y = row * bh, t = rng();
        const v = 96 + t * 30;
        ctx.fillStyle = `rgb(${v | 0},${(v - 2) | 0},${(v - 8) | 0})`;
        ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 3, y + 3, bw - 6, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 3, y + bh - 8, bw - 6, 5);
      }
    }
    noiseOverlay(ctx, w, h, rng, 18);
    blotches(ctx, w, h, rng, 24, 40, 120, 'rgba(0,0,0,A)', 0.22);
    streaks(ctx, w, h, rng, 30, '#141412', 0.22, 10);
    cracks(ctx, w, h, rng, 6, 'rgba(20,20,20,0.6)');
    return c;
  };
  function noiseOverlay(ctx, w, h, rng, amp) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rng() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  T.metal = function () { // dark gunmetal riveted panels
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(59);
    noiseFill(ctx, w, h, [66, 70, 76], 18, rng, 1);
    streaks(ctx, w, h, rng, 50, '#1e2024', 0.3, 6);
    blotches(ctx, w, h, rng, 20, 20, 70, 'rgba(90,60,40,A)', 0.25);
    ctx.strokeStyle = 'rgba(14,16,20,0.9)'; ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    for (let i = 0; i < 24; i++) rivet(ctx, 10 + (i % 6) * 47, 10 + Math.floor(i / 6) * 78, 3.5);
    grime(ctx, w, h, rng, 30, 0.3);
    return c;
  };
  T.girder = function () { // dark steel for I-beams, with rivet rows along the edges
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(61);
    noiseFill(ctx, w, h, [50, 52, 56], 16, rng, 1);
    blotches(ctx, w, h, rng, 14, 10, 40, 'rgba(110,70,40,A)', 0.3);
    streaks(ctx, w, h, rng, 20, '#141416', 0.3, 4);
    for (let i = 0; i < 4; i++) { rivet(ctx, 16 + i * 32, 12, 3); rivet(ctx, 16 + i * 32, h - 12, 3); }
    ctx.strokeStyle = 'rgba(10,10,12,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    return c;
  };
  T.rust = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(71);
    noiseFill(ctx, w, h, [96, 58, 34], 44, rng, 2);
    blotches(ctx, w, h, rng, 30, 20, 70, 'rgba(30,14,6,A)', 0.5);
    streaks(ctx, w, h, rng, 60, '#2a140a', 0.35, 8);
    return c;
  };
  T.wood = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(83);
    noiseFill(ctx, w, h, [94, 70, 46], 26, rng, 1);
    ctx.globalAlpha = 0.4; ctx.strokeStyle = '#3a2210';
    for (let i = 0; i < 90; i++) { ctx.lineWidth = 1 + rng(); ctx.beginPath(); const y = rng() * h; ctx.moveTo(0, y); ctx.bezierCurveTo(w / 3, y + (rng() - 0.5) * 8, 2 * w / 3, y + (rng() - 0.5) * 8, w, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(20,12,6,0.9)'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke(); }
    grime(ctx, w, h, rng, 20, 0.35);
    return c;
  };
  T.corrugated = function () { // ribbed roofing / wall panels (ribs run along the texture's v axis)
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(89);
    noiseFill(ctx, w, h, [78, 80, 84], 14, rng, 1);
    for (let x = 0; x < w; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.45, 'rgba(255,255,255,0.12)'); g.addColorStop(0.7, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, h);
    }
    blotches(ctx, w, h, rng, 20, 20, 60, 'rgba(100,60,30,A)', 0.3);
    grime(ctx, w, h, rng, 20, 0.3);
    ctx.strokeStyle = 'rgba(10,10,12,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.stroke();
    return c;
  };
  T.hex = function () { // hexagonal steel panelling (teleporter rooms)
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(97);
    noiseFill(ctx, w, h, [112, 120, 130], 14, rng, 1);
    const R = 32, dx = R * 1.5, dy = R * Math.sqrt(3);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(18,22,28,0.95)';
    for (let col = -1; col < w / dx + 1; col++) for (let row = -1; row < h / dy + 2; row++) {
      const cx = col * dx, cy = row * dy + (col % 2 ? dy / 2 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      rivet(ctx, cx, cy, 3);
    }
    blotches(ctx, w, h, rng, 20, 20, 70, 'rgba(0,0,0,A)', 0.35);
    streaks(ctx, w, h, rng, 15, '#1a1e24', 0.2, 4);
    return c;
  };
  T.fence = function () { // chain-link (alpha)
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(165,168,172,1)'; ctx.lineWidth = 2.2;
    for (let i = -w; i < w * 2; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke(); }
    return c;
  };
  T.grate = function () { // catwalk bar grating (alpha)
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#4e5156';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 1, h);
    return c;
  };
  T.cage = function () { // steel bars (alpha)
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#6a6e74';
    for (let i = 0; i < w; i += 16) ctx.fillRect(i + 6, 0, 4, h);
    ctx.fillRect(0, 2, w, 6); ctx.fillRect(0, h - 8, w, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < w; i += 16) ctx.fillRect(i + 6, 0, 1, h);
    return c;
  };
  function windowTex(lit, seed) {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(seed);
    ctx.fillStyle = '#1c1e22'; ctx.fillRect(0, 0, w, h);
    const cols = 4, rows = 6, pw = w / cols, ph = h / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const t = rng();
      if (lit) {
        const v = 0.55 + t * 0.45, broken = t < 0.12;
        ctx.fillStyle = broken ? '#0c0d10' : `rgb(${(255 * v) | 0},${(205 * v) | 0},${(130 * v) | 0})`;
      } else {
        const v = 26 + t * 26; ctx.fillStyle = `rgb(${v | 0},${(v + 6) | 0},${(v + 14) | 0})`;
      }
      ctx.fillRect(k * pw + 4, r * ph + 4, pw - 8, ph - 8);
      if (!lit) { ctx.fillStyle = 'rgba(140,160,190,0.12)'; ctx.fillRect(k * pw + 6, r * ph + 6, pw - 12, 4); }
    }
    ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
    grime(ctx, w, h, rng, 20, 0.25);
    return c;
  }
  T.winLit = () => windowTex(true, 101);
  T.winDark = () => windowTex(false, 103);
  T.sandbag = function () {
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(107);
    ctx.fillStyle = '#3a3226'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
      const x = col * 48 + (row % 2) * 24 + 24, y = row * 32 + 16, t = rng();
      ctx.fillStyle = `rgb(${(128 + t * 30) | 0},${(112 + t * 26) | 0},${(80 + t * 20) | 0})`;
      ctx.beginPath(); ctx.ellipse(x, y, 23, 14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 5, 21, 8, 0, 0, Math.PI); ctx.fill();
    }
    grime(ctx, w, h, rng, 10, 0.3);
    return c;
  };
  T.cloth = function () {
    const w = 64, h = 64, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(101);
    noiseFill(ctx, w, h, [150, 150, 150], 60, rng, 1);
    grime(ctx, w, h, rng, 12, 0.5);
    return c;
  };
  T.skin = function () {
    const w = 64, h = 64, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(113);
    noiseFill(ctx, w, h, [170, 165, 150], 40, rng, 1);
    ctx.fillStyle = 'rgba(90,20,20,0.5)';
    for (let i = 0; i < 10; i++) ctx.fillRect(rng() * w, rng() * h, 3 + rng() * 8, 2 + rng() * 4);
    return c;
  };
  T.white = function () { const c = canvas(4, 4), ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4, 4); return c; };
  T.glow = function () {
    const w = 64, c = canvas(w, w), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    return c;
  };
  T.blob = function () {
    const w = 64, c = canvas(w, w), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    return c;
  };
  T.sky = function () {
    const w = 512, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(131);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1222'); g.addColorStop(0.55, '#142036'); g.addColorStop(1, '#283650');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + rng() * 0.6})`; ctx.fillRect(rng() * w, rng() * h * 0.6, 1.2, 1.2); }
    // cloud bands
    for (let i = 0; i < 14; i++) { const x = rng() * w, y = 60 + rng() * 120, r = 40 + rng() * 80; const cg = ctx.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, 'rgba(90,100,130,0.4)'); cg.addColorStop(1, 'rgba(90,100,130,0)'); ctx.fillStyle = cg; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    const mg = ctx.createRadialGradient(380, 50, 4, 380, 50, 34); mg.addColorStop(0, 'rgba(235,238,255,1)'); mg.addColorStop(0.3, 'rgba(210,215,240,0.9)'); mg.addColorStop(1, 'rgba(120,130,180,0)');
    ctx.fillStyle = mg; ctx.fillRect(330, 0, 100, 100);
    return c;
  };

  // ---- labels / signs ----
  T.label = function (lines, bg, fg, opts = {}) {
    if (opts.chalk) return T.chalk(lines, opts.cls);
    if (opts.perk) return T.perkPanel(lines, bg, fg, opts.accent);
    const w = opts.w || 256, h = opts.h || 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (opts.stencil) { const rng = ZM.makeRng(7); grime(ctx, w, h, rng, 20, 0.4); }
    if (opts.border !== false) { ctx.strokeStyle = opts.border || fg; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = opts.size || Math.min(44, Math.floor(h / (arr.length + 0.6)));
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    arr.forEach((ln, i) => ctx.fillText(String(ln), w / 2, h / 2 + (i - (arr.length - 1) / 2) * size * 1.1, w - 20));
    if (opts.stencil) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.25)'; const rng = ZM.makeRng(9); for (let i = 0; i < 80; i++) ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 6, 1 + rng() * 3); ctx.globalCompositeOperation = 'source-over'; }
    return c;
  };
  T.perkPanel = function (lines, bg, fg, accent) {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(16, 16, w - 32, 70);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = Math.min(40, 230 / Math.max(...arr.map(l => l.length)) * 1.6);
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    arr.forEach((ln, i) => ctx.fillText(ln, w / 2, 36 + i * size * 1.05, w - 30));
    const bx = w / 2, by = 150;
    ctx.fillStyle = accent; ctx.beginPath();
    ctx.moveTo(bx - 10, by - 60); ctx.lineTo(bx + 10, by - 60); ctx.lineTo(bx + 10, by - 40); ctx.quadraticCurveTo(bx + 30, by - 30, bx + 30, by - 5);
    ctx.lineTo(bx + 30, by + 70); ctx.quadraticCurveTo(bx + 30, by + 85, bx + 15, by + 85); ctx.lineTo(bx - 15, by + 85); ctx.quadraticCurveTo(bx - 30, by + 85, bx - 30, by + 70);
    ctx.lineTo(bx - 30, by - 5); ctx.quadraticCurveTo(bx - 30, by - 30, bx - 10, by - 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = bg; ctx.fillRect(bx - 22, by + 5, 44, 45);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - 12, by - 68, 24, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx - 24, by - 20, 6, 90);
    return c;
  };
  T.chalk = function (lines, cls) {
    const w = 256, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const rng = ZM.makeRng(cls ? cls.length * 7 + 3 : 5);
    ctx.strokeStyle = 'rgba(240,236,225,0.95)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const jitter = (x, y) => [x + (rng() - 0.5) * 2, y + (rng() - 0.5) * 2];
    const poly = (pts) => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = jitter(p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
    const S = {
      pistol: [[60, 30], [150, 30], [150, 45], [100, 45], [95, 75], [75, 75], [78, 45], [60, 45], [60, 30]],
      smg: [[30, 36], [200, 36], [200, 48], [150, 48], [150, 60], [135, 60], [135, 48], [110, 48], [105, 80], [90, 80], [92, 48], [60, 48], [55, 58], [30, 58], [30, 36]],
      ar: [[20, 36], [215, 36], [215, 46], [160, 46], [160, 56], [145, 56], [145, 46], [115, 46], [110, 85], [95, 85], [97, 46], [70, 46], [60, 64], [25, 64], [20, 36]],
      shotgun: [[20, 38], [215, 38], [215, 48], [120, 48], [120, 56], [85, 56], [85, 48], [70, 48], [60, 66], [25, 66], [20, 38]],
      lmg: [[20, 34], [220, 34], [220, 48], [165, 48], [165, 82], [150, 82], [150, 48], [120, 48], [115, 85], [100, 85], [102, 48], [70, 48], [60, 66], [25, 66], [20, 34]],
      knife: [[70, 55], [180, 30], [195, 36], [95, 65], [95, 72], [70, 72], [70, 55]],
      claymore: [[80, 40], [180, 40], [185, 72], [75, 72], [80, 40]],
      launcher: [[20, 40], [220, 40], [220, 56], [20, 56], [20, 40]],
    };
    poly(S[cls] || S.smg);
    if (cls === 'ar' || cls === 'smg' || cls === 'lmg') poly([[30, 30], [30, 36]]);
    ctx.fillStyle = 'rgba(240,236,225,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
    ctx.fillText(String(arr[0]), w / 2, 98, w - 20);
    if (arr[1] !== undefined) ctx.fillText(String(arr[1]), w / 2, 118, w - 20);
    return c;
  };
  T.boxLid = function () {
    const c = T.wood(), ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(20,10,5,0.55)'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 170px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 30; ctx.fillText('?', 128, 136);
    return c;
  };
  T.teleporterPad = function () {
    const w = 256, c = canvas(w, w), ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2e34'; ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#4a7ea8'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(128, 128, 100, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(128, 128, 70, 0, 7); ctx.stroke();
    ctx.fillStyle = '#8fd3ff'; ctx.font = 'bold 60px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('115', 128, 128);
    return c;
  };

  T.all = function () {
    return {
      concrete: T.concrete(), plaster: T.plaster(), floor: T.floor(), ground: T.ground(), dirt: T.dirt(), brick: T.brick(), stone: T.stone(),
      metal: T.metal(), girder: T.girder(), rust: T.rust(), wood: T.wood(), corrugated: T.corrugated(), hex: T.hex(),
      fence: T.fence(), grate: T.grate(), cage: T.cage(), winLit: T.winLit(), winDark: T.winDark(), sandbag: T.sandbag(),
      cloth: T.cloth(), skin: T.skin(), white: T.white(), glow: T.glow(), blob: T.blob(), sky: T.sky(), boxLid: T.boxLid(), pad: T.teleporterPad(),
    };
  };
})();


// ===== 30_renderer.js =====
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


// ===== 60_weapons.js =====
// ---------------------------------------------------------------------------
// 60_weapons.js — weapon table (Der Riese / BO-era arsenal incl. Wunderwaffe),
// firing model (hitscan w/ penetration, pellets, projectiles, chain lightning),
// and box-built viewmodels.
// ---------------------------------------------------------------------------
(function () {
  // cls: pistol | smg | ar | shotgun | lmg | sniper | launcher | special | wonder
  // fire: 'semi' | 'auto' | 'burst' | 'pump'
  const W = {};
  function def(id, o) { W[id] = Object.assign({ id, headMult: 2.0, pen: 1, spread: 1.5, adsSpread: 0.3, recoil: 1.0, pellets: 1, reload: 2.0, switchTime: 0.5, box: true, wall: 0, sound: 'rifle' }, o); }

  def('m1911', { name: 'M1911', pap: 'Mustang & Sally', cls: 'pistol', fire: 'semi', rpm: 450, dmg: 20, papDmg: 1000, mag: 8, papMag: 6, reserve: 24, papReserve: 54, reload: 1.4, box: false, sound: 'pistol', papProjectile: { speed: 40, radius: 3.5, splash: 1000, gravity: 4, dual: true }, headMult: 2.5 });
  def('m14', { name: 'M14', pap: 'Mnesia', cls: 'ar', fire: 'semi', rpm: 320, dmg: 150, papDmg: 400, mag: 8, papMag: 16, reserve: 96, papReserve: 192, reload: 2.1, wall: 500, box: false, wood: true });
  def('olympia', { name: 'Olympia', pap: 'Hades', cls: 'shotgun', fire: 'semi', rpm: 150, dmg: 70, papDmg: 200, pellets: 8, mag: 2, papMag: 2, reserve: 38, papReserve: 60, reload: 2.6, spread: 7, adsSpread: 5, wall: 500, box: false, wood: true, sound: 'shotgun', headMult: 1.5 });
  def('mp40', { name: 'MP40', pap: 'The Afterburner', cls: 'smg', fire: 'auto', rpm: 600, dmg: 100, papDmg: 200, mag: 32, papMag: 64, reserve: 192, papReserve: 192, reload: 2.4, wall: 1000, box: false, sound: 'smg' });
  def('stakeout', { name: 'Stakeout', pap: 'Raid', cls: 'shotgun', fire: 'pump', rpm: 70, dmg: 100, papDmg: 250, pellets: 8, mag: 6, papMag: 10, reserve: 60, papReserve: 60, reload: 3.0, spread: 6, adsSpread: 4, wall: 1500, box: false, wood: true, sound: 'shotgun', headMult: 1.5 });
  def('thompson', { name: 'Thompson', pap: 'Gibs-O-Matic', cls: 'smg', fire: 'auto', rpm: 760, dmg: 100, papDmg: 200, mag: 20, papMag: 40, reserve: 200, papReserve: 240, reload: 2.4, wall: 1250, box: false, wood: true, sound: 'smg' });
  def('mp5k', { name: 'MP5K', pap: 'MP115 Kollider', cls: 'smg', fire: 'auto', rpm: 900, dmg: 100, papDmg: 200, mag: 30, papMag: 40, reserve: 120, papReserve: 200, reload: 2.2, wall: 1000, box: false, sound: 'smg' });
  def('ak74u', { name: 'AK74u', pap: 'AK74fu2', cls: 'smg', fire: 'auto', rpm: 900, dmg: 100, papDmg: 250, mag: 20, papMag: 40, reserve: 160, papReserve: 280, reload: 2.3, sound: 'smg' });
  def('galil', { name: 'Galil', pap: 'Lamentation', cls: 'ar', fire: 'auto', rpm: 750, dmg: 140, papDmg: 300, mag: 35, papMag: 35, reserve: 315, papReserve: 490, reload: 2.6, pen: 2 });
  def('commando', { name: 'Commando', pap: 'Predator', cls: 'ar', fire: 'auto', rpm: 750, dmg: 140, papDmg: 300, mag: 30, papMag: 40, reserve: 270, papReserve: 360, reload: 2.5, pen: 2 });
  def('m16', { name: 'M16', pap: 'Skullcrusher', cls: 'ar', fire: 'burst', rpm: 900, dmg: 140, papDmg: 300, mag: 30, papMag: 30, reserve: 270, papReserve: 360, reload: 2.4, pen: 2 });
  def('aug', { name: 'AUG', pap: 'AUG-50M3', cls: 'ar', fire: 'auto', rpm: 800, dmg: 140, papDmg: 300, mag: 30, papMag: 30, reserve: 270, papReserve: 360, reload: 2.6, pen: 2 });
  def('fal', { name: 'FN FAL', pap: 'EPC WN', cls: 'ar', fire: 'semi', rpm: 420, dmg: 160, papDmg: 300, mag: 20, papMag: 20, reserve: 180, papReserve: 280, reload: 2.5, pen: 2, papFire: 'burst' });
  def('hk21', { name: 'HK21', pap: 'H115 Oscillator', cls: 'lmg', fire: 'auto', rpm: 650, dmg: 115, papDmg: 250, mag: 125, papMag: 150, reserve: 500, papReserve: 750, reload: 5.5, pen: 3, sound: 'lmg' });
  def('rpk', { name: 'RPK', pap: 'R115 Resonator', cls: 'lmg', fire: 'auto', rpm: 750, dmg: 115, papDmg: 250, mag: 100, papMag: 125, reserve: 400, papReserve: 500, reload: 5.0, pen: 3, sound: 'lmg' });
  def('l96', { name: 'L96A1', pap: 'L115 Isolator', cls: 'sniper', fire: 'pump', rpm: 50, dmg: 1000, papDmg: 2000, mag: 5, papMag: 8, reserve: 40, papReserve: 64, reload: 3.4, pen: 4, headMult: 4, sound: 'sniper', spread: 3, adsSpread: 0 });
  def('dragunov', { name: 'Dragunov', pap: 'D115 Disassembler', cls: 'sniper', fire: 'semi', rpm: 220, dmg: 500, papDmg: 1000, mag: 10, papMag: 10, reserve: 40, papReserve: 80, reload: 3.0, pen: 4, headMult: 4, sound: 'sniper', spread: 3, adsSpread: 0 });
  def('spas', { name: 'SPAS-12', pap: 'SPAZ-24', cls: 'shotgun', fire: 'semi', rpm: 180, dmg: 120, papDmg: 250, pellets: 8, mag: 8, papMag: 24, reserve: 32, papReserve: 72, reload: 3.6, spread: 6, adsSpread: 4, sound: 'shotgun', headMult: 1.5 });
  def('hs10', { name: 'HS10', pap: 'Typhoid & Mary', cls: 'shotgun', fire: 'semi', rpm: 220, dmg: 100, papDmg: 200, pellets: 8, mag: 6, papMag: 12, reserve: 36, papReserve: 72, reload: 2.8, spread: 6, adsSpread: 4, sound: 'shotgun', headMult: 1.5 });
  def('python', { name: 'Python', pap: 'Cobra', cls: 'pistol', fire: 'semi', rpm: 300, dmg: 300, papDmg: 500, mag: 6, papMag: 12, reserve: 84, papReserve: 96, reload: 2.4, pen: 2, headMult: 3, sound: 'magnum' });
  def('cz75', { name: 'CZ75', pap: 'Calamity', cls: 'pistol', fire: 'semi', rpm: 500, dmg: 50, papDmg: 150, mag: 15, papMag: 20, reserve: 135, papReserve: 200, reload: 1.8, sound: 'pistol', papFire: 'auto' });
  def('law', { name: 'M72 LAW', pap: 'M72 Anarchy', cls: 'launcher', fire: 'semi', rpm: 60, dmg: 1000, papDmg: 2000, mag: 1, papMag: 10, reserve: 20, papReserve: 40, reload: 3.0, projectile: { speed: 35, radius: 4, splash: 1000, gravity: 0 }, sound: 'launcher', headMult: 1 });
  def('chinalake', { name: 'China Lake', pap: 'China Beach', cls: 'launcher', fire: 'pump', rpm: 60, dmg: 700, papDmg: 1500, mag: 2, papMag: 5, reserve: 20, papReserve: 40, reload: 3.2, projectile: { speed: 28, radius: 4, splash: 700, gravity: 9 }, sound: 'launcher', headMult: 1 });
  def('raygun', { name: 'Ray Gun', pap: "Porter's X2 Ray Gun", cls: 'wonder', fire: 'semi', rpm: 180, dmg: 1000, papDmg: 2000, mag: 20, papMag: 40, reserve: 160, papReserve: 200, reload: 3.0, projectile: { speed: 60, radius: 2.5, splash: 1000, gravity: 0, ray: true }, sound: 'ray', headMult: 1 });
  def('wunderwaffe', { name: 'Wunderwaffe DG-2', pap: 'Wunderwaffe DG-3 JZ', cls: 'wonder', fire: 'semi', rpm: 60, dmg: 1e9, papDmg: 1e9, mag: 3, papMag: 6, reserve: 15, papReserve: 30, reload: 3.2, chain: 10, papChain: 24, sound: 'wunder', headMult: 1 });
  def('ballistic', { name: 'Ballistic Knife', pap: 'The Krauss Refibrillator', cls: 'special', fire: 'semi', rpm: 90, dmg: 500, papDmg: 1000, mag: 1, papMag: 1, reserve: 4, papReserve: 9, reload: 1.8, projectile: { speed: 50, radius: 0, splash: 0, gravity: 3 }, sound: 'knife', meleeDmg: 500 });

  const BOX_POOL = Object.keys(W).filter(k => W[k].box);
  const BOX_WEIGHTS = { raygun: 0.6, wunderwaffe: 0.5, ballistic: 0.5, law: 0.7, chinalake: 0.7 };

  function makeState(id, pap = false) {
    const d = W[id];
    return { id, pap, mag: pap ? d.papMag : d.mag, reserve: pap ? d.papReserve : d.reserve };
  }
  function nameOf(ws) { return ws.pap ? W[ws.id].pap : W[ws.id].name; }
  function magSize(ws) { return ws.pap ? W[ws.id].papMag : W[ws.id].mag; }
  function maxReserve(ws) { return ws.pap ? W[ws.id].papReserve : W[ws.id].reserve; }
  function damageOf(ws) { return ws.pap ? W[ws.id].papDmg : W[ws.id].dmg; }
  function fireMode(ws) { const d = W[ws.id]; return ws.pap && d.papFire ? d.papFire : d.fire; }
  function projectileOf(ws) { const d = W[ws.id]; return ws.pap && d.papProjectile ? d.papProjectile : d.projectile || null; }
  function rollBox() {
    let total = 0; for (const k of BOX_POOL) total += BOX_WEIGHTS[k] || 1;
    let r = Math.random() * total;
    for (const k of BOX_POOL) { r -= BOX_WEIGHTS[k] || 1; if (r <= 0) return k; }
    return BOX_POOL[0];
  }

  // ---- hit detection against zombies ----------------------------------------
  // Returns [{z, t, head, point}] sorted by t for a ray, up to `maxHits`.
  function traceZombies(game, ro, rd, maxDist, maxHits) {
    const hits = [];
    for (const z of game.zombies) {
      if (!z.hittable()) continue;
      const head = z.headPos();
      const th = ZM.U.raySphere(ro, rd, head, z.headRadius);
      const tb = ZM.U.rayCylinderY(ro, rd, z.pos.x, z.pos.z, z.radius, z.pos.y, z.pos.y + z.bodyTop);
      let t = -1, isHead = false;
      if (th >= 0 && (tb < 0 || th <= tb)) { t = th; isHead = true; } else if (tb >= 0) t = tb;
      if (t >= 0 && t <= maxDist) hits.push({ z, t, head: isHead, point: ZM.V.add(ro, ZM.V.scale(rd, t)) });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits.slice(0, maxHits);
  }

  function hitscan(game, ro, rd, dmg, pen, headMult, opts = {}) {
    const wall = game.map.raycast(ro, rd, 150);
    const maxDist = wall.t >= 0 ? wall.t : 150;
    const hits = traceZombies(game, ro, rd, maxDist, pen);
    let any = false;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const d = dmg * Math.pow(0.7, i) * (h.head ? headMult : 1);
      game.damageZombie(h.z, d, { head: h.head, point: h.point, source: 'bullet' });
      any = true;
    }
    if (wall.t >= 0 && !opts.noImpact) {
      const p = ZM.V.add(ro, ZM.V.scale(rd, wall.t));
      game.particles.impact(p, rd);
    }
    return { any, end: ZM.V.add(ro, ZM.V.scale(rd, hits.length ? hits[hits.length - 1].t : maxDist)) };
  }

  function spreadDir(dir, degrees) {
    if (degrees <= 0) return dir;
    const up = Math.abs(dir.y) < 0.99 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const r = ZM.V.norm(ZM.V.cross(dir, up)), u = ZM.V.cross(r, dir);
    const a = Math.random() * Math.PI * 2, m = Math.tan(Math.random() * degrees * Math.PI / 180);
    return ZM.V.norm(ZM.V.add(dir, ZM.V.add(ZM.V.scale(r, Math.cos(a) * m), ZM.V.scale(u, Math.sin(a) * m))));
  }

  // Fire one shot of weapon state `ws` from the player. Returns true if fired.
  function fire(game, player, ws) {
    const d = W[ws.id];
    if (ws.mag <= 0) return false;
    ws.mag--;
    const origin = player.eyePos();
    const baseDir = ZM.dirFromAngles(player.yaw, player.pitch);
    const spread = player.ads ? d.adsSpread : d.spread * (player.moving ? 1.6 : 1);
    const dmg = damageOf(ws) * (game.instaKill > 0 ? 1e9 : 1);
    const proj = projectileOf(ws);
    if (d.chain) {
      const chain = ws.pap ? d.papChain : d.chain;
      wunderwaffe(game, origin, baseDir, chain);
    } else if (proj) {
      const n = proj.dual ? 2 : 1;
      for (let i = 0; i < n; i++) {
        // launch from beside the barrel but converge on the crosshair (aim point 40 m out), then apply spread
        const start = ZM.V.add(origin, ZM.V.add(ZM.V.scale(baseDir, 0.6), ZM.V.scale(game.renderer.camRight, i ? -0.2 : 0.2)));
        const aim = ZM.V.add(origin, ZM.V.scale(baseDir, 40));
        const dir = spreadDir(ZM.V.norm(ZM.V.sub(aim, start)), i ? 2.5 : 0.6);
        game.spawnProjectile({ pos: start, vel: ZM.V.scale(dir, proj.speed), gravity: proj.gravity, radius: proj.radius, splash: proj.splash * (game.instaKill > 0 ? 1e6 : 1), direct: dmg, ray: !!proj.ray, owner: 'player', life: 6, kind: proj.ray ? 'ray' : 'rocket' });
      }
    } else {
      for (let p = 0; p < d.pellets; p++) {
        const dir = spreadDir(baseDir, d.pellets > 1 ? spread : spread * 0.5);
        const res = hitscan(game, origin, dir, dmg, d.pen, d.headMult);
        if (p === 0 || d.pellets <= 2) game.particles.tracer(ZM.V.add(origin, ZM.V.scale(dir, 1.0)), res.end);
      }
    }
    game.audio.play('shot_' + d.sound, { vol: 1 });
    player.recoil(d.recoil * (d.cls === 'sniper' || d.cls === 'shotgun' ? 2.2 : d.cls === 'launcher' ? 2.5 : 1));
    game.muzzleFlash(origin, baseDir);
    return true;
  }

  // Chain lightning: nearest zombie in the aim cone, then hop to nearest others.
  function wunderwaffe(game, origin, dir, chain) {
    const candidates = game.zombies.filter(z => z.hittable());
    let first = null, bestScore = -1;
    for (const z of candidates) {
      const to = ZM.V.sub(z.chestPos(), origin), dist = ZM.V.len(to);
      if (dist > 60) continue;
      const cos = ZM.V.dot(ZM.V.scale(to, 1 / dist), dir);
      if (cos < 0.92) continue;
      if (!game.map.lineOfSight(origin, z.chestPos())) continue;
      const score = cos * 10 - dist * 0.05;
      if (score > bestScore) { bestScore = score; first = z; }
    }
    const end = first ? first.chestPos() : ZM.V.add(origin, ZM.V.scale(dir, 30));
    game.particles.arc(ZM.V.add(origin, ZM.V.scale(dir, 0.8)), end, 0.35, [0.5, 0.8, 1]);
    if (!first) return;
    const chained = new Set([first]);
    let cur = first;
    const order = [first];
    while (order.length < chain) {
      let next = null, nd = 12;
      for (const z of candidates) {
        if (chained.has(z)) continue;
        const dd = ZM.V.dist(z.chestPos(), cur.chestPos());
        if (dd < nd) { nd = dd; next = z; }
      }
      if (!next) break;
      chained.add(next); order.push(next);
      game.particles.arc(cur.chestPos(), next.chestPos(), 0.35, [0.5, 0.8, 1]);
      cur = next;
    }
    for (const z of order) game.damageZombie(z, 1e9, { head: false, point: z.chestPos(), source: 'wunder' });
  }

  // ---- viewmodel templates (boxes in gun-local space: +z toward player, -z barrel) -----
  const GUN_DARK = [0.16, 0.16, 0.18, 1], GUN_MID = [0.3, 0.3, 0.33, 1], WOOD = [0.45, 0.28, 0.14, 1], GOLD = [0.9, 0.7, 0.2, 1];
  function buildViewmodel(gl, ws) {
    const d = W[ws.id];
    const mb = new ZM.MeshBuilder();
    const papTint = ws.pap ? [0.55, 0.3, 0.75, 1] : null;
    const col = (c) => papTint ? [c[0] * 0.6 + papTint[0] * 0.4, c[1] * 0.6 + papTint[1] * 0.4, c[2] * 0.6 + papTint[2] * 0.4, 1] : c;
    const B = (x0, y0, z0, x1, y1, z1, c) => mb.box({ x: x0, y: y0, z: z0 }, { x: x1, y: y1, z: z1 }, { color: col(c), uvScale: 0.3 });
    const wood = d.wood ? WOOD : GUN_MID;
    switch (d.cls) {
      case 'pistol':
        B(-0.03, -0.02, -0.14, 0.03, 0.05, 0.08, GUN_DARK); // slide
        B(-0.025, -0.14, 0.0, 0.025, -0.02, 0.07, wood); // grip
        B(-0.012, 0.0, -0.22, 0.012, 0.02, -0.14, GUN_MID); // barrel
        B(-0.01, 0.05, -0.12, 0.01, 0.07, -0.10, GUN_DARK); // sight
        if (ws.pap) B(-0.05, -0.01, -0.2, 0.05, 0.04, -0.12, GOLD);
        break;
      case 'smg':
        B(-0.035, -0.03, -0.3, 0.035, 0.06, 0.18, GUN_DARK); // receiver
        B(-0.02, -0.02, -0.5, 0.02, 0.02, -0.3, GUN_MID); // barrel
        B(-0.025, -0.2, -0.02, 0.025, -0.03, 0.06, GUN_MID); // magazine
        B(-0.025, -0.12, 0.1, 0.025, -0.03, 0.18, wood); // grip
        B(-0.03, 0.0, 0.18, 0.03, 0.05, 0.42, wood); // stock
        B(-0.01, 0.06, -0.26, 0.01, 0.09, -0.24, GUN_DARK);
        break;
      case 'ar': case 'lmg':
        B(-0.04, -0.03, -0.35, 0.04, 0.07, 0.2, GUN_DARK);
        B(-0.02, -0.01, -0.62, 0.02, 0.03, -0.35, GUN_MID);
        B(-0.03, -0.26, -0.06, 0.03, -0.03, 0.04, d.cls === 'lmg' ? GUN_MID : GUN_DARK);
        B(-0.025, -0.13, 0.12, 0.025, -0.03, 0.2, wood);
        B(-0.035, -0.02, 0.2, 0.035, 0.07, 0.5, wood);
        B(-0.015, 0.07, -0.33, 0.015, 0.11, -0.3, GUN_DARK);
        B(-0.015, 0.07, 0.05, 0.015, 0.12, 0.08, GUN_DARK);
        if (d.cls === 'lmg') B(-0.015, -0.3, -0.35, 0.015, -0.03, -0.32, GUN_MID); // bipod
        break;
      case 'shotgun':
        B(-0.035, -0.03, -0.3, 0.035, 0.05, 0.15, GUN_MID);
        B(-0.022, 0.0, -0.75, 0.022, 0.045, -0.3, GUN_DARK);
        B(-0.03, -0.05, -0.55, 0.03, 0.0, -0.3, wood); // pump
        B(-0.025, -0.14, 0.1, 0.025, -0.03, 0.16, wood);
        B(-0.035, -0.04, 0.15, 0.035, 0.07, 0.48, wood);
        break;
      case 'sniper':
        B(-0.035, -0.03, -0.4, 0.035, 0.05, 0.2, GUN_DARK);
        B(-0.015, 0.0, -0.95, 0.015, 0.03, -0.4, GUN_MID);
        B(-0.025, 0.06, -0.3, 0.025, 0.12, 0.0, GUN_DARK); // scope
        B(-0.03, -0.18, -0.05, 0.03, -0.03, 0.05, GUN_DARK);
        B(-0.035, -0.04, 0.2, 0.035, 0.07, 0.55, wood);
        break;
      case 'launcher':
        B(-0.06, -0.06, -0.7, 0.06, 0.06, 0.3, [0.25, 0.3, 0.2, 1]);
        B(-0.07, -0.07, -0.75, 0.07, 0.07, -0.65, GUN_DARK);
        B(-0.025, -0.16, 0.0, 0.025, -0.06, 0.08, GUN_DARK);
        B(-0.015, 0.06, -0.3, 0.015, 0.12, -0.26, GUN_DARK);
        break;
      case 'wonder':
        if (d.id === 'raygun') {
          B(-0.04, -0.03, -0.22, 0.04, 0.06, 0.12, [0.5, 0.5, 0.55, 1]);
          B(-0.05, -0.05, -0.3, 0.05, 0.08, -0.22, [0.2, 0.6, 0.3, 1]);
          B(-0.03, -0.14, 0.0, 0.03, -0.03, 0.1, GUN_DARK);
          B(-0.06, 0.06, -0.1, 0.06, 0.1, 0.1, [0.3, 0.9, 0.4, 1]); // glowing top
        } else {
          B(-0.045, -0.04, -0.3, 0.045, 0.07, 0.25, [0.35, 0.28, 0.2, 1]);
          B(-0.07, -0.07, -0.55, 0.07, 0.07, -0.3, [0.5, 0.5, 0.55, 1]); // coil housing
          for (let i = 0; i < 3; i++) B(-0.02, 0.07 + i * 0.03, -0.25 + i * 0.1, 0.02, 0.11 + i * 0.03, -0.21 + i * 0.1, [0.2, 0.25, 0.9, 1]); // vacuum tubes
          B(-0.03, -0.16, 0.05, 0.03, -0.04, 0.14, wood);
          B(-0.035, -0.03, 0.25, 0.035, 0.06, 0.5, wood);
        }
        break;
      case 'special':
        B(-0.02, -0.04, -0.2, 0.02, 0.02, 0.1, GUN_DARK);
        B(-0.008, -0.01, -0.5, 0.008, 0.03, -0.2, [0.8, 0.8, 0.85, 1]); // blade
        B(-0.025, -0.12, 0.0, 0.025, -0.04, 0.08, wood);
        break;
    }
    return mb.build(gl);
  }

  // barrel tip in gun-local space (for muzzle flash placement)
  function muzzleOffset(ws) {
    const d = W[ws.id];
    return { pistol: -0.24, smg: -0.52, ar: -0.64, lmg: -0.64, shotgun: -0.77, sniper: -0.97, launcher: -0.72, wonder: -0.5, special: -0.5 }[d.cls] || -0.5;
  }

  function knifeMesh(gl) {
    const mb = new ZM.MeshBuilder();
    mb.box({ x: -0.015, y: -0.09, z: -0.02 }, { x: 0.015, y: 0.0, z: 0.02 }, { color: [0.25, 0.18, 0.1, 1] });
    mb.box({ x: -0.006, y: 0.0, z: -0.012 }, { x: 0.006, y: 0.22, z: 0.012 }, { color: [0.85, 0.85, 0.9, 1] });
    return mb.build(gl);
  }
  function bowieMesh(gl) {
    const mb = new ZM.MeshBuilder();
    mb.box({ x: -0.018, y: -0.11, z: -0.025 }, { x: 0.018, y: 0.0, z: 0.025 }, { color: [0.3, 0.2, 0.1, 1] });
    mb.box({ x: -0.008, y: 0.0, z: -0.02 }, { x: 0.008, y: 0.34, z: 0.02 }, { color: [0.85, 0.85, 0.9, 1] });
    return mb.build(gl);
  }

  ZM.Weapons = { defs: W, BOX_POOL, makeState, nameOf, magSize, maxReserve, damageOf, fireMode, projectileOf, rollBox, fire, hitscan, traceZombies, spreadDir, buildViewmodel, muzzleOffset, knifeMesh, bowieMesh };
})();


// ===== 45_props.js =====
// ---------------------------------------------------------------------------
// 45_props.js — mesh builders for Der Riese machines, structure and set
// dressing. Pure geometry: every prop writes into the map's chunked static
// builders (M.builder(tex, variant)) and registers colliders / lights / labels.
// ---------------------------------------------------------------------------
(function () {
  const P = ZM.Props = {};
  const F = (f) => ({ N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } }[f]);
  const FRONT = (f) => ({ N: 'nz', S: 'pz', E: 'px', W: 'nx' }[f]);
  const onlyFace = (face) => { const o = {}; for (const k of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) o[k] = k === face; return o; };
  const DARK = [0.16, 0.16, 0.18, 1], STEEL = [0.55, 0.57, 0.6, 1], BLUE = [0.45, 0.75, 1, 1], WARM = [1, 0.9, 0.7, 1];
  P.LAMP_WARM = [2.7, 2.1, 1.4]; P.LAMP_COOL = [1.3, 1.65, 2.3]; P.LAMP_ORANGE = [2.8, 1.5, 0.6];
  P.F = F;

  // Box with its "depth" along the facing axis. (x,z) is the centre of the footprint, y the base.
  function faceBox(M, tex, x, y, z, facing, w, d, h, opts = {}) {
    const f = F(facing);
    const hw = f.x === 0 ? w / 2 : d / 2, hd = f.z === 0 ? w / 2 : d / 2;
    const min = { x: x - hw, y, z: z - hd }, max = { x: x + hw, y: y + h, z: z + hd };
    M.builder(tex, opts.variant || '').box(min, max, { uvScale: opts.uvScale || 1, color: opts.color, faces: opts.faces });
    if (opts.collide) M.colliders.push({ min, max, tag: 'prop' });
    return { min, max };
  }
  P.faceBox = faceBox;
  // Label quad flush on the front face of a footprint box
  function faceLabel(M, key, x, y, z, facing, w, d, h, variant = 'glow') {
    const f = F(facing), eps = 0.012;
    const hw = f.x === 0 ? w / 2 : d / 2, hd = f.z === 0 ? w / 2 : d / 2;
    const min = { x: x - hw - eps, y, z: z - hd - eps }, max = { x: x + hw + eps, y: y + h, z: z + hd + eps };
    M.builder('label_' + key, variant).boxUnit(min, max, { faces: onlyFace(FRONT(facing)) });
  }
  // Flat decal (unit UV) on a wall plane at (x,z) facing `facing`, w wide, h tall, base y.
  function wallQuad(M, tex, x, y, z, facing, w, h, variant = '', off = 0.015, color) {
    const f = F(facing), t = 0.005;
    const cx = x + f.x * off, cz = z + f.z * off;
    const min = { x: cx - (f.x === 0 ? w / 2 : t), y, z: cz - (f.z === 0 ? w / 2 : t) };
    const max = { x: cx + (f.x === 0 ? w / 2 : t), y: y + h, z: cz + (f.z === 0 ? w / 2 : t) };
    M.builder(tex, variant).boxUnit(min, max, { faces: onlyFace(FRONT(facing)), color });
  }
  P.wallQuad = wallQuad;

  // ================= MACHINES =================
  const PERKS = {
    quick_revive: { name: ['QUICK', 'REVIVE'], body: [0.2, 0.4, 0.75, 1], accent: '#8fd3ff', bg: '#1b3a6b', glow: [0.35, 0.6, 1.0] },
    juggernog: { name: ['JUGGER', 'NOG'], body: [0.7, 0.1, 0.1, 1], accent: '#ffd0d0', bg: '#6b1414', glow: [1, 0.3, 0.3] },
    speed_cola: { name: ['SPEED', 'COLA'], body: [0.1, 0.45, 0.18, 1], accent: '#9fffb0', bg: '#0f4a1e', glow: [0.3, 1, 0.4] },
    double_tap: { name: ['DOUBLE TAP', 'ROOT BEER'], body: [0.55, 0.33, 0.08, 1], accent: '#ffd27a', bg: '#5a3a10', glow: [1, 0.7, 0.3] },
  };
  P.perkMachine = function (M, id, x, y, z, facing) {
    const pk = PERKS[id], f = F(facing);
    const w = 0.95, d = 0.7, h = 1.95;
    faceBox(M, 'metal', x, y, z, facing, w, d, h, { color: pk.body, collide: true });
    faceBox(M, 'metal', x, y, z, facing, w + 0.06, d + 0.06, 0.12, { color: DARK });
    faceBox(M, 'metal', x, y + h, z, facing, w + 0.04, d + 0.04, 0.1, { color: [0.8, 0.8, 0.85, 1] });
    faceBox(M, 'metal', x, y + h + 0.1, z, facing, w - 0.1, d - 0.1, 0.1, { color: [0.8, 0.8, 0.85, 1] });
    faceBox(M, 'metal', x, y + h + 0.2, z, facing, w - 0.3, d - 0.3, 0.08, { color: pk.body });
    M.label('perk_' + id, pk.name, pk.bg, pk.accent, { perk: id, accent: pk.accent });
    const fx = x + f.x * 0.001, fz = z + f.z * 0.001;
    faceLabel(M, 'perk_' + id, fx, y + 0.75, fz, facing, w - 0.12, d, h - 0.85, 'glow');
    faceBox(M, 'metal', x + f.x * (d / 2 + 0.01), y + 0.25, z + f.z * (d / 2 + 0.01), facing, w - 0.3, 0.02, 0.35, { color: [0.08, 0.08, 0.09, 1] });
    faceBox(M, 'white', x + f.x * (d / 2 + 0.015), y + 0.62, z + f.z * (d / 2 + 0.015), facing, 0.12, 0.02, 0.05, { color: [1, 0.2, 0.2, 1], variant: 'glow' });
    for (const s of [-1, 1]) {
      const sx = f.x === 0 ? x + s * (w / 2 + 0.005) : x, sz = f.z === 0 ? z + s * (w / 2 + 0.005) : z;
      const bw = f.x === 0 ? 0.01 : d * 0.7, bd = f.z === 0 ? 0.01 : d * 0.7;
      M.builder('white').box({ x: sx - bw / 2, y: y + 0.3, z: sz - bd / 2 }, { x: sx + bw / 2, y: y + 1.5, z: sz + bd / 2 }, { color: [0.9, 0.9, 0.95, 1] });
    }
    M.light(x + f.x * 1.1, y + 1.5, z + f.z * 1.1, pk.glow.map(c => c * 1.4), 5);
  };

  // Teleporter: round pad with a raised rim, three thick arms curving up and inward from the back,
  // ribbed blue light strips on their inner faces, a glowing core disc. `facing` is the open side.
  P.teleporter = function (M, id, x, y, z, facing = 'S') {
    const r = 1.9, f = F(facing);
    M.builder('pad').cylinderY(x, y - 0.1, z, r, 0.28, 24, { uvScale: r * 2 });
    M.builder('metal').cylinderY(x, y - 0.12, z, r + 0.3, 0.16, 24, { uvScale: 2, color: [0.35, 0.36, 0.4, 1] });
    M.builder('girder').cylinderY(x, y + 0.16, z, r + 0.3, 0.12, 24, { uvScale: 0.5, color: STEEL }); // rim lip
    M.builder('white', 'glow').cylinderY(x, y + 0.18, z, 0.75, 0.03, 16, { color: [0.55, 0.85, 1, 1] });
    const back = Math.atan2(-f.z, -f.x); // angle (xz) pointing away from the open side
    const mb = M.builder('girder'), gb = M.builder('white', 'glow');
    for (const da of [-1.05, 0, 1.05]) {
      const a = back + da, ca = Math.cos(a), sa = Math.sin(a);
      const N = 7, pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, R = (r + 0.3) * (1 - t) + 0.9 * t, H = 4.0 * Math.sin(t * Math.PI / 2);
        pts.push({ x: x + ca * R, y: y + 0.2 + H, z: z + sa * R });
      }
      for (let i = 0; i < N; i++) {
        const w = 0.72 - 0.3 * (i / N);
        mb.beam(pts[i], pts[i + 1], w, w * 0.9, { uvScale: 0.5, color: [0.5, 0.52, 0.56, 1] });
        // inner light strip (slightly toward the centre)
        const q0 = { x: pts[i].x - ca * 0.26, y: pts[i].y, z: pts[i].z - sa * 0.26 }, q1 = { x: pts[i + 1].x - ca * 0.26, y: pts[i + 1].y, z: pts[i + 1].z - sa * 0.26 };
        gb.beam(q0, q1, w * 0.35, 0.08, { color: i % 2 ? [0.35, 0.7, 1, 1] : [0.6, 0.85, 1, 1] });
      }
      const b = pts[0];
      M.colliders.push({ min: { x: b.x - 0.3, y, z: b.z - 0.3 }, max: { x: b.x + 0.3, y: y + 1.4, z: b.z + 0.3 }, tag: 'prop' });
    }
    // top collar joining the arms
    M.builder('girder').cylinderY(x, y + 4.05, z, 1.25, 0.35, 14, { uvScale: 0.5, color: STEEL });
    M.builder('white', 'glow').cylinderY(x, y + 4.4, z, 0.8, 0.12, 14, { color: BLUE });
    M.light(x, y + 1.2, z, [0.5, 0.9, 1.5], 8);
    M.light(x, y + 3.6, z, [0.3, 0.6, 1.0], 7);
    M.teleporter(id, M.chunk, x, y, z);
  };

  // Mainframe: raised round platform with a stepped base, three lattice towers joined by a ring
  // girder, cables down to the central pedestal and its glowing 115 core. Console at the south edge.
  P.mainframe = function (M, x, y, z) {
    const r = 3.2;
    M.floor(x - r - 1.3, z - r - 1.3, x + r + 1.3, z + r + 1.3, y + 0.2, 'concrete', { underside: false });
    M.builder('concrete').box({ x: x - r - 1.3, y: y - 0.05, z: z - r - 1.3 }, { x: x + r + 1.3, y: y + 0.2, z: z + r + 1.3 }, { uvScale: 2, faces: { py: false, ny: false } });
    M.floors.push({ x0: x - r * 0.78, z0: z - r * 0.78, x1: x + r * 0.78, z1: z + r * 0.78, y: y + 0.45 });
    M.builder('pad').cylinderY(x, y + 0.2, z, r, 0.25, 28, { uvScale: r * 2 });
    M.builder('girder').cylinderY(x, y + 0.2, z, r + 0.12, 0.12, 28, { uvScale: 0.5, color: STEEL });
    M.builder('white', 'glow').cylinderY(x, y + 0.455, z, 1.1, 0.02, 20, { color: [0.4, 0.7, 1, 1] });
    // pedestal + core
    M.builder('metal').cylinderY(x, y + 0.45, z, 0.6, 1.1, 14, { uvScale: 1, color: [0.3, 0.31, 0.35, 1] });
    M.colliders.push({ min: { x: x - 0.6, y, z: z - 0.6 }, max: { x: x + 0.6, y: y + 1.6, z: z + 0.6 }, tag: 'prop' });
    M.builder('white', 'glow').cylinderY(x, y + 1.55, z, 0.26, 1.0, 12, { color: [0.5, 0.8, 1, 1] });
    M.builder('metal').cylinderY(x, y + 2.55, z, 0.4, 0.12, 12, { color: [0.3, 0.31, 0.35, 1] });
    // towers
    const H = 8.5, tops = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const bx = x + Math.cos(a) * (r + 0.7), bz = z + Math.sin(a) * (r + 0.7);
      const tx = x + Math.cos(a) * (r - 0.3), tz = z + Math.sin(a) * (r - 0.3);
      M.builder('girder').box({ x: bx - 0.45, y, z: bz - 0.45 }, { x: bx + 0.45, y: y + 0.5, z: bz + 0.45 }, { uvScale: 0.5, color: STEEL });
      M.colliders.push({ min: { x: bx - 0.45, y, z: bz - 0.45 }, max: { x: bx + 0.45, y: y + 3, z: bz + 0.45 }, tag: 'prop' });
      M.builder('cage').beam({ x: bx, y: y + 0.5, z: bz }, { x: tx, y: y + H, z: tz }, 0.7, 0.7, { uvScale: 0.7 });
      M.builder('girder').beam({ x: bx, y: y + 0.5, z: bz }, { x: tx, y: y + H, z: tz }, 0.12, 0.12, { color: [0.4, 0.42, 0.46, 1] });
      tops.push({ x: tx, y: y + H, z: tz });
      M.builder('white', 'glow').box({ x: tx - 0.3, y: y + H, z: tz - 0.3 }, { x: tx + 0.3, y: y + H + 0.25, z: tz + 0.3 }, { color: BLUE });
      // cable from the tower top sagging down to the pedestal top
      const seg = 8, top = { x: tx, y: y + H, z: tz }, end = { x, y: y + 2.6, z };
      for (let s = 0; s < seg; s++) {
        const t0 = s / seg, t1 = (s + 1) / seg;
        const pa = { x: top.x + (end.x - top.x) * t0, y: top.y + (end.y - top.y) * t0 - Math.sin(t0 * Math.PI) * 0.8, z: top.z + (end.z - top.z) * t0 };
        const pb = { x: top.x + (end.x - top.x) * t1, y: top.y + (end.y - top.y) * t1 - Math.sin(t1 * Math.PI) * 0.8, z: top.z + (end.z - top.z) * t1 };
        M.builder('metal').beam(pa, pb, 0.08, 0.08, { color: [0.08, 0.08, 0.1, 1] });
      }
      M.light(tx, y + H - 0.6, tz, [0.3, 0.6, 1.0], 9);
    }
    for (let i = 0; i < 3; i++) M.builder('girder').beam(tops[i], tops[(i + 1) % 3], 0.3, 0.3, { uvScale: 0.5, color: STEEL });
    M.light(x, y + 2, z, [0.4, 0.75, 1.3], 10);
    // console at the south edge of the step
    const cx = x, cz = z + r + 2.2;
    M.prop({ x: cx - 0.7, y: y + 0.2, z: cz - 0.35 }, { x: cx + 0.7, y: y + 1.2, z: cz + 0.35 }, 'metal');
    M.label('mainframe', ['MAINFRAME'], '#0e1a2a', '#8fd3ff');
    M.builder('label_mainframe', 'glow').boxUnit({ x: cx - 0.6, y: y + 1.2, z: cz - 0.3 }, { x: cx + 0.6, y: y + 1.7, z: cz + 0.02 }, { faces: onlyFace('pz') });
    M.builder('metal').box({ x: cx - 0.6, y: y + 1.2, z: cz - 0.3 }, { x: cx + 0.6, y: y + 1.7, z: cz + 0.0 }, { color: [0.3, 0.3, 0.34, 1], faces: { pz: false } });
    for (let i = 0; i < 5; i++) M.builder('white', 'glow').box({ x: cx - 0.5 + i * 0.22, y: y + 1.22, z: cz + 0.02 }, { x: cx - 0.38 + i * 0.22, y: y + 1.3, z: cz + 0.05 }, { color: i % 2 ? [1, 0.3, 0.2, 1] : [0.3, 1, 0.4, 1] });
    M.mainframe = { pos: { x, y, z }, radius: r, console: { x: cx, y, z: cz } };
  };

  P.pap = function (M, x, y, z, facing) {
    const f = F(facing);
    faceBox(M, 'metal', x, y, z, facing, 1.7, 1.0, 1.35, { color: [0.3, 0.3, 0.36, 1], collide: true });
    faceBox(M, 'metal', x, y, z, facing, 1.8, 1.1, 0.15, { color: DARK });
    M.builder('metal').cylinderY(x, y + 1.35, z, 0.42, 0.6, 14, { uvScale: 1, color: [0.5, 0.5, 0.56, 1] });
    M.builder('white', 'glow').cylinderY(x, y + 1.95, z, 0.2, 0.08, 10, { color: [1, 0.5, 0.9, 1] });
    M.label('pap', ['PACK-A-PUNCH'], '#2b1a3a', '#ff7bd5', { size: 34 });
    faceLabel(M, 'pap', x, y + 0.55, z, facing, 1.5, 1.0, 0.55, 'glow');
    const cols = [[1, 0.2, 0.2], [1, 0.9, 0.2], [0.2, 1, 0.4], [0.3, 0.6, 1]];
    for (let i = 0; i < 4; i++) {
      const off = -0.6 + i * 0.4;
      const bx = x + f.x * 0.51 + (f.x === 0 ? off : 0), bz = z + f.z * 0.51 + (f.z === 0 ? off : 0);
      M.builder('white', 'glow').box({ x: bx - (f.x === 0 ? 0.12 : 0.012), y: y + 0.2, z: bz - (f.z === 0 ? 0.12 : 0.012) }, { x: bx + (f.x === 0 ? 0.12 : 0.012), y: y + 0.42, z: bz + (f.z === 0 ? 0.12 : 0.012) }, { color: [...cols[i], 1] });
    }
    M.light(x + f.x * 1.2, y + 1.2, z + f.z * 1.2, [1.2, 0.5, 1.1], 6);
    M.pap = { pos: { x: x + f.x * 0.8, y, z: z + f.z * 0.8 }, machine: { x, y, z }, facing };
  };

  P.powerSwitch = function (M, x, y, z, facing) {
    const f = F(facing);
    faceBox(M, 'metal', x, y + 0.6, z, facing, 0.9, 0.22, 1.5, { color: [0.3, 0.32, 0.3, 1], collide: true });
    M.label('power', ['POWER'], '#2a2a1a', '#ffe36b');
    faceLabel(M, 'power', x, y + 1.75, z, facing, 0.8, 0.22, 0.35, 'glow');
    faceBox(M, 'metal', x + f.x * 0.12, y + 0.9, z + f.z * 0.12, facing, 0.5, 0.06, 0.6, { color: [0.12, 0.12, 0.12, 1] });
    M.power = { pos: { x: x + f.x * 0.9, y, z: z + f.z * 0.9 }, panel: { x, y, z }, facing, on: false };
    M.light(x + f.x * 0.8, y + 1.5, z + f.z * 0.8, [1, 0.3, 0.2], 3);
  };

  P.trap = function (M, id, min, max, sx, sy, sz, facing) {
    const f = F(facing);
    faceBox(M, 'metal', sx, sy + 0.9, sz, facing, 0.5, 0.18, 0.5, { color: [0.6, 0.55, 0.1, 1], collide: false });
    M.label('trap', ['TRAP', '1000'], '#3a3a10', '#ffe36b', { size: 30 });
    faceLabel(M, 'trap', sx, sy + 0.95, sz, facing, 0.44, 0.18, 0.4, 'glow');
    M.label('hazard', ['HOCHSPANNUNG'], '#e8c000', '#111', { size: 30 });
    const axisX = (max.x - min.x) > (max.z - min.z);
    const ends = axisX ? [{ x: min.x, z: (min.z + max.z) / 2 }, { x: max.x, z: (min.z + max.z) / 2 }] : [{ x: (min.x + max.x) / 2, z: min.z }, { x: (min.x + max.x) / 2, z: max.z }];
    for (const e of ends) {
      M.builder('metal').box({ x: e.x - 0.14, y: min.y, z: e.z - 0.14 }, { x: e.x + 0.14, y: min.y + 2.6, z: e.z + 0.14 }, { color: [0.4, 0.4, 0.45, 1] });
      for (let k = 0; k < 4; k++) M.builder('white', 'glow').box({ x: e.x - 0.08, y: min.y + 0.6 + k * 0.5, z: e.z - 0.08 }, { x: e.x + 0.08, y: min.y + 0.7 + k * 0.5, z: e.z + 0.08 }, { color: [0.6, 0.8, 1, 1] });
      M.builder('white', 'glow').box({ x: e.x - 0.1, y: min.y + 2.6, z: e.z - 0.1 }, { x: e.x + 0.1, y: min.y + 2.8, z: e.z + 0.1 }, { color: [0.6, 0.8, 1, 1] });
    }
    M.traps.push({ id, min, max, switchPos: { x: sx + f.x * 0.7, y: sy, z: sz + f.z * 0.7 }, ends, zone: M.chunk });
  };

  // ================= STRUCTURE =================
  // I-beam column (two flanges + web)
  P.ibeam = function (M, x, z, y0, y1, s = 0.5, axis = 'x') {
    const b = M.builder('girder'), t = 0.08, c = [0.5, 0.52, 0.56, 1];
    if (axis === 'x') { // flanges perpendicular to x
      b.box({ x: x - s / 2, y: y0, z: z - s / 2 }, { x: x - s / 2 + t, y: y1, z: z + s / 2 }, { uvScale: 0.5, color: c });
      b.box({ x: x + s / 2 - t, y: y0, z: z - s / 2 }, { x: x + s / 2, y: y1, z: z + s / 2 }, { uvScale: 0.5, color: c });
      b.box({ x: x - t / 2, y: y0, z: z - s / 2 + t }, { x: x + t / 2, y: y1, z: z + s / 2 - t }, { uvScale: 0.5, color: c });
    } else {
      b.box({ x: x - s / 2, y: y0, z: z - s / 2 }, { x: x + s / 2, y: y1, z: z - s / 2 + t }, { uvScale: 0.5, color: c });
      b.box({ x: x - s / 2, y: y0, z: z + s / 2 - t }, { x: x + s / 2, y: y1, z: z + s / 2 }, { uvScale: 0.5, color: c });
      b.box({ x: x - s / 2 + t, y: y0, z: z - t / 2 }, { x: x + s / 2 - t, y: y1, z: z + t / 2 }, { uvScale: 0.5, color: c });
    }
    M.colliders.push({ min: { x: x - s / 2, y: y0, z: z - s / 2 }, max: { x: x + s / 2, y: y1, z: z + s / 2 }, tag: 'prop' });
  };
  // Roof truss spanning a0..a1 along `axis` at constant c, top chord at y, `depth` deep.
  P.truss = function (M, axis, c, a0, a1, y, depth = 1.0) {
    const b = M.builder('girder'), col = [0.45, 0.47, 0.5, 1];
    const pt = (a, yy) => axis === 'x' ? { x: a, y: yy, z: c } : { x: c, y: yy, z: a };
    b.beam(pt(a0, y), pt(a1, y), 0.22, 0.14, { uvScale: 0.5, color: col });
    b.beam(pt(a0, y - depth), pt(a1, y - depth), 0.18, 0.12, { uvScale: 0.5, color: col });
    const n = Math.max(2, Math.round((a1 - a0) / 2.2));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      b.beam(pt(a, y), pt(a, y - depth), 0.08, 0.08, { color: col });
      if (i < n) { const an = a0 + (a1 - a0) * ((i + 1) / n); if (i % 2) b.beam(pt(a, y), pt(an, y - depth), 0.07, 0.07, { color: col }); else b.beam(pt(a, y - depth), pt(an, y), 0.07, 0.07, { color: col }); }
    }
  };
  // Industrial roof: corrugated ceiling, purlins, trusses every ~6 m, optional skylight strips with cool light.
  P.roof = function (M, x0, z0, x1, z1, y, opts = {}) {
    const alongX = (x1 - x0) >= (z1 - z0); // trusses span the short side
    M.ceiling(x0, z0, x1, z1, y, 'corrugated');
    const depth = opts.depth || Math.min(1.2, (y - (opts.floorY || 0)) * 0.18);
    const span = alongX ? [z0, z1] : [x0, x1], run = alongX ? [x0, x1] : [z0, z1];
    const n = Math.max(1, Math.round((run[1] - run[0]) / 6));
    for (let i = 1; i < n; i++) {
      const c = run[0] + (run[1] - run[0]) * (i / n);
      P.truss(M, alongX ? 'z' : 'x', c, span[0] + 0.3, span[1] - 0.3, y - 0.05, depth);
    }
    // purlins (along the run direction)
    const np = Math.max(1, Math.round((span[1] - span[0]) / 4));
    for (let i = 1; i < np; i++) {
      const s = span[0] + (span[1] - span[0]) * (i / np);
      if (alongX) M.builder('girder').box({ x: x0, y: y - 0.2, z: s - 0.06 }, { x: x1, y: y - 0.02, z: s + 0.06 }, { uvScale: 0.5, color: [0.4, 0.42, 0.45, 1] });
      else M.builder('girder').box({ x: s - 0.06, y: y - 0.2, z: z0 }, { x: s + 0.06, y: y - 0.02, z: z1 }, { uvScale: 0.5, color: [0.4, 0.42, 0.45, 1] });
    }
    if (opts.skylights) {
      const ns = Math.max(1, Math.round((run[1] - run[0]) / 8));
      for (let i = 0; i < ns; i++) {
        const c = run[0] + (run[1] - run[0]) * ((i + 0.5) / ns);
        const g = M.builder('white', 'glow'), col = [0.22, 0.28, 0.4, 1];
        if (alongX) g.box({ x: c - 1.2, y: y - 0.02, z: z0 + 2 }, { x: c + 1.2, y: y - 0.0, z: z1 - 2 }, { color: col, faces: { ny: true, px: false, nx: false, py: false, pz: false, nz: false } });
        else g.box({ x: x0 + 2, y: y - 0.02, z: c - 1.2 }, { x: x1 - 2, y: y - 0.0, z: c + 1.2 }, { color: col, faces: { ny: true, px: false, nx: false, py: false, pz: false, nz: false } });
        const mid = (span[0] + span[1]) / 2;
        M.light(alongX ? c : mid, y - 1.5, alongX ? mid : c, [0.35, 0.45, 0.7], Math.max(10, (span[1] - span[0]) * 0.6));
      }
    }
  };
  // Window rows drawn on a wall face (decal quads). facing = side the windows are seen from.
  P.windows = function (M, axis, c, a0, a1, y, h, facing, opts = {}) {
    const w = opts.w || 2.2, gap = opts.gap || 1.6, lit = opts.lit === undefined ? 0.5 : opts.lit;
    const rng = ZM.makeRng(opts.seed || Math.round(c * 7 + a0 * 3 + y * 11));
    const n = Math.floor((a1 - a0 + gap) / (w + gap));
    const start = a0 + ((a1 - a0) - (n * w + (n - 1) * gap)) / 2 + w / 2;
    for (let i = 0; i < n; i++) {
      const a = start + i * (w + gap), isLit = rng() < lit;
      const x = axis === 'x' ? a : c, z = axis === 'x' ? c : a;
      wallQuad(M, isLit ? 'winLit' : 'winDark', x, y, z, facing, w, h, isLit ? 'glow' : '', 0.02, isLit ? [0.85, 0.8, 0.7, 1] : undefined);
      // sill
      const f = F(facing);
      M.builder('concrete').box({ x: x + f.x * 0.08 - (f.x === 0 ? w / 2 + 0.1 : 0.1), y: y - 0.12, z: z + f.z * 0.08 - (f.z === 0 ? w / 2 + 0.1 : 0.1) }, { x: x + f.x * 0.08 + (f.x === 0 ? w / 2 + 0.1 : 0.1), y: y, z: z + f.z * 0.08 + (f.z === 0 ? w / 2 + 0.1 : 0.1) }, { uvScale: 1, color: [0.7, 0.7, 0.68, 1] });
      if (isLit) M.light(x + f.x * 1.2, y + h / 2, z + f.z * 1.2, [0.5, 0.4, 0.25], 4);
    }
  };
  // Exterior facade on top of an existing wall: window rows, cornice, a roof slab and a downpipe.
  P.facade = function (M, axis, c, a0, a1, y0, y1, facing, opts = {}) {
    const f = F(facing), rows = opts.rows || Math.max(1, Math.floor((y1 - y0 - 1.5) / 3.2));
    for (let r = 0; r < rows; r++) {
      const wy = (opts.first === undefined ? y0 + 1.6 : opts.first) + r * 3.2;
      if (wy + 2.0 > y1) break;
      P.windows(M, axis, c + (f.x + f.z) * 0.0, a0 + 1, a1 - 1, wy, 2.0, facing, { lit: opts.lit === undefined ? 0.4 : opts.lit, seed: opts.seed ? opts.seed + r : undefined, w: opts.w, gap: opts.gap });
    }
    // cornice + roof slab sticking out over the wall
    const t = 0.6, out = 0.5;
    const min = axis === 'x' ? { x: a0 - 0.2, y: y1 - 0.25, z: c - (f.z > 0 ? out : 0.3) } : { x: c - (f.x > 0 ? out : 0.3), y: y1 - 0.25, z: a0 - 0.2 };
    const max = axis === 'x' ? { x: a1 + 0.2, y: y1 + 0.1, z: c + (f.z < 0 ? out : 0.3) } : { x: c + (f.x < 0 ? out : 0.3), y: y1 + 0.1, z: a1 + 0.2 };
    M.builder('concrete').box(min, max, { uvScale: 1, color: [0.6, 0.6, 0.58, 1] });
    void t;
    if (opts.roof !== false) {
      const back = opts.roofDepth || 6;
      const rmin = axis === 'x' ? { x: a0 - 0.2, y: y1 + 0.1, z: f.z > 0 ? c - back : c } : { x: f.x > 0 ? c - back : c, y: y1 + 0.1, z: a0 - 0.2 };
      const rmax = axis === 'x' ? { x: a1 + 0.2, y: y1 + 0.4, z: f.z > 0 ? c : c + back } : { x: f.x > 0 ? c : c + back, y: y1 + 0.4, z: a1 + 0.2 };
      M.builder('corrugated').box(rmin, rmax, { uvScale: 2, color: [0.55, 0.56, 0.6, 1] });
    }
    if (opts.pipe !== false) {
      const a = a0 + 1.2, x = axis === 'x' ? a : c + f.x * 0.3, z = axis === 'x' ? c + f.z * 0.3 : a;
      M.builder('metal').box({ x: x - 0.1, y: y0, z: z - 0.1 }, { x: x + 0.1, y: y1 - 0.3, z: z + 0.1 }, { uvScale: 0.5, color: [0.3, 0.3, 0.32, 1] });
    }
  };
  // Background factory block beyond the playable walls (no colliders): lit windows, roof, optional stack.
  P.building = function (M, x0, z0, x1, z1, y, h, opts = {}) {
    M.builder('stone').box({ x: x0, y, z: z0 }, { x: x1, y: y + h, z: z1 }, { uvScale: 2, subdiv: 2 });
    const rows = Math.max(1, Math.floor((h - 1.5) / 3.4));
    for (let r = 0; r < rows; r++) {
      const wy = y + 1.5 + r * 3.4;
      if (opts.faces !== 'none') {
        for (const side of (opts.faces || ['N', 'S', 'E', 'W'])) {
          if (side === 'S') P.windows(M, 'x', z1, x0 + 0.5, x1 - 0.5, wy, 2.0, 'S', { lit: opts.lit || 0.35, seed: 100 + r + x0 });
          if (side === 'N') P.windows(M, 'x', z0, x0 + 0.5, x1 - 0.5, wy, 2.0, 'N', { lit: opts.lit || 0.35, seed: 200 + r + x0 });
          if (side === 'E') P.windows(M, 'z', x1, z0 + 0.5, z1 - 0.5, wy, 2.0, 'E', { lit: opts.lit || 0.35, seed: 300 + r + z0 });
          if (side === 'W') P.windows(M, 'z', x0, z0 + 0.5, z1 - 0.5, wy, 2.0, 'W', { lit: opts.lit || 0.35, seed: 400 + r + z0 });
        }
      }
    }
    M.builder('corrugated').box({ x: x0 - 0.4, y: y + h, z: z0 - 0.4 }, { x: x1 + 0.4, y: y + h + 0.5, z: z1 + 0.4 }, { uvScale: 2, color: [0.5, 0.52, 0.55, 1] });
    if (opts.stack) P.smokestack(M, (x0 + x1) / 2, (z0 + z1) / 2, y + h, 1.6, opts.stack, false);
  };
  // Chain-link fence: posts, rails and an alpha-tested mesh. collide=true blocks movement.
  P.fence = function (M, axis, c, a0, a1, y, h = 2.6, collide = false) {
    const b = M.builder('girder'), col = [0.5, 0.52, 0.55, 1];
    const n = Math.max(1, Math.round((a1 - a0) / 3));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      if (axis === 'x') b.box({ x: a - 0.05, y, z: c - 0.05 }, { x: a + 0.05, y: y + h + 0.1, z: c + 0.05 }, { color: col });
      else b.box({ x: c - 0.05, y, z: a - 0.05 }, { x: c + 0.05, y: y + h + 0.1, z: a + 0.05 }, { color: col });
    }
    for (const yy of [y + h, y + 0.1]) {
      if (axis === 'x') b.box({ x: a0, y: yy - 0.03, z: c - 0.03 }, { x: a1, y: yy + 0.03, z: c + 0.03 }, { color: col });
      else b.box({ x: c - 0.03, y: yy - 0.03, z: a0 }, { x: c + 0.03, y: yy + 0.03, z: a1 }, { color: col });
    }
    const t = 0.004;
    if (axis === 'x') M.builder('fence').box({ x: a0, y, z: c - t }, { x: a1, y: y + h, z: c + t }, { uvScale: 1, faces: { px: false, nx: false, py: false, ny: false } });
    else M.builder('fence').box({ x: c - t, y, z: a0 }, { x: c + t, y: y + h, z: a1 }, { uvScale: 1, faces: { pz: false, nz: false, py: false, ny: false } });
    if (collide) M.colliders.push({ min: axis === 'x' ? { x: a0, y, z: c - 0.08 } : { x: c - 0.08, y, z: a0 }, max: axis === 'x' ? { x: a1, y: y + h, z: c + 0.08 } : { x: c + 0.08, y: y + h, z: a1 }, tag: 'wall' });
  };
  // Sandbag wall: `len` long along axis, two rows high, slightly staggered.
  P.sandbags = function (M, axis, c, a0, a1, y, rows = 2, collide = true) {
    const b = M.builder('sandbag');
    for (let r = 0; r < rows; r++) {
      const d = 0.45 - r * 0.08, yy = y + r * 0.36;
      if (axis === 'x') b.box({ x: a0 + r * 0.15, y: yy, z: c - d }, { x: a1 - r * 0.15, y: yy + 0.38, z: c + d }, { uvScale: 1 });
      else b.box({ x: c - d, y: yy, z: a0 + r * 0.15 }, { x: c + d, y: yy + 0.38, z: a1 - r * 0.15 }, { uvScale: 1 });
    }
    if (collide) M.colliders.push({ min: axis === 'x' ? { x: a0, y, z: c - 0.45 } : { x: c - 0.45, y, z: a0 }, max: axis === 'x' ? { x: a1, y: y + rows * 0.36 + 0.1, z: c + 0.45 } : { x: c + 0.45, y: y + rows * 0.36 + 0.1, z: a1 }, tag: 'prop' });
  };
  // Floor cable along a polyline (no collision)
  P.cables = function (M, pts, y, r = 0.045) {
    for (let i = 0; i + 1 < pts.length; i++) M.builder('metal').beam({ x: pts[i][0], y: y + r, z: pts[i][1] }, { x: pts[i + 1][0], y: y + r, z: pts[i + 1][1] }, r * 2, r * 2, { color: [0.07, 0.07, 0.08, 1] });
  };
  // Painted floor stripe
  P.stripe = function (M, x0, z0, x1, z1, y, color = [0.85, 0.42, 0.08, 1]) {
    M.builder('white').box({ x: x0, y: y + 0.004, z: z0 }, { x: x1, y: y + 0.012, z: z1 }, { color, faces: { ny: false } });
  };
  // Arch over an opening (a0..a1 along axis at constant c): stacked oriented bricks forming a half-ring.
  P.arch = function (M, axis, c, a0, a1, yBase, depth = 0.5, tex = 'brick') {
    const R = (a1 - a0) / 2 + 0.25, cx = (a0 + a1) / 2, n = 9, b = M.builder(tex);
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI, t1 = ((i + 1) / n) * Math.PI, am = (t0 + t1) / 2;
      const p0 = { a: cx - Math.cos(t0) * R, y: yBase + Math.sin(t0) * R }, p1 = { a: cx - Math.cos(t1) * R, y: yBase + Math.sin(t1) * R };
      const A = axis === 'x' ? { x: p0.a, y: p0.y, z: c } : { x: c, y: p0.y, z: p0.a }, B = axis === 'x' ? { x: p1.a, y: p1.y, z: c } : { x: c, y: p1.y, z: p1.a };
      void am;
      b.beam(A, B, depth, 0.5, { uvScale: 1 });
    }
  };
  // Steel storage rack with crates/boxes on the shelves
  P.shelf = function (M, x, z, y, facing, w = 2.4, h = 2.2, d = 0.7) {
    const f = F(facing), b = M.builder('girder'), col = [0.45, 0.47, 0.5, 1];
    const hw = f.x === 0 ? w / 2 : d / 2, hd = f.z === 0 ? w / 2 : d / 2;
    const min = { x: x - hw, y, z: z - hd }, max = { x: x + hw, y: y + h, z: z + hd };
    for (const cx of [min.x, max.x]) for (const cz of [min.z, max.z]) b.box({ x: cx - 0.04, y, z: cz - 0.04 }, { x: cx + 0.04, y: y + h, z: cz + 0.04 }, { color: col });
    for (let k = 0; k < 3; k++) {
      const yy = y + 0.15 + k * (h - 0.3) / 2;
      M.builder('wood').box({ x: min.x, y: yy, z: min.z }, { x: max.x, y: yy + 0.06, z: max.z }, { uvScale: 1 });
      const rng = ZM.makeRng(k + x * 3 + z * 5);
      for (let i = 0; i < 3; i++) if (rng() < 0.8) {
        const s = 0.35 + rng() * 0.25, t = (i + 0.5) / 3;
        const px = f.x === 0 ? min.x + (max.x - min.x) * t : x, pz = f.z === 0 ? min.z + (max.z - min.z) * t : z;
        M.builder(rng() < 0.5 ? 'wood' : 'metal').box({ x: px - s / 2, y: yy + 0.06, z: pz - s / 2 }, { x: px + s / 2, y: yy + 0.06 + s * 0.8, z: pz + s / 2 }, { uvScale: 1, color: rng() < 0.5 ? undefined : [0.5, 0.5, 0.3, 1] });
      }
    }
    M.colliders.push({ min, max, tag: 'prop' });
  };
  // Hooded wall lamp (warm pool below it)
  P.wallLamp = function (M, x, y, z, facing, color = P.LAMP_WARM, range = 9) {
    const f = F(facing);
    M.builder('metal').box({ x: x - 0.05, y: y, z: z - 0.05 }, { x: x + 0.05 + Math.abs(f.x) * 0.5, y: y + 0.05, z: z + 0.05 + Math.abs(f.z) * 0.5 }, { color: [0.2, 0.2, 0.22, 1] });
    const lx = x + f.x * 0.5, lz = z + f.z * 0.5;
    M.builder('metal').box({ x: lx - 0.22, y: y - 0.12, z: lz - 0.22 }, { x: lx + 0.22, y: y + 0.02, z: lz + 0.22 }, { color: [0.22, 0.22, 0.24, 1] });
    M.builder('white', 'glow').box({ x: lx - 0.12, y: y - 0.16, z: lz - 0.12 }, { x: lx + 0.12, y: y - 0.1, z: lz + 0.12 }, { color: WARM });
    M.light(lx, y - 0.5, lz, color, range);
  };

  // ================= SET DRESSING =================
  P.generator = function (M, x0, z0, x1, z1, y = 0) {
    M.prop({ x: x0, y, z: z0 }, { x: x1, y: y + 2.4, z: z1 }, 'corrugated', { uvScale: 1, color: [0.45, 0.42, 0.38, 1] });
    M.builder('girder').box({ x: x0 - 0.05, y, z: z0 - 0.05 }, { x: x1 + 0.05, y: y + 0.25, z: z1 + 0.05 }, { uvScale: 0.5, color: STEEL });
    M.builder('girder').box({ x: x0 - 0.05, y: y + 2.2, z: z0 - 0.05 }, { x: x1 + 0.05, y: y + 2.4, z: z1 + 0.05 }, { uvScale: 0.5, color: STEEL });
    M.builder('metal').box({ x: x0 + 0.3, y: y + 2.4, z: z0 + 0.3 }, { x: x1 - 0.3, y: y + 2.75, z: z1 - 0.3 }, { color: [0.3, 0.3, 0.33, 1] });
    const cx = (x0 + x1) / 2;
    M.builder('metal').cylinderY(cx - 1, y + 2.7, z0 + 0.8, 0.35, 2.0, 10, { color: [0.22, 0.22, 0.25, 1] });
    M.builder('metal').cylinderY(cx + 1, y + 2.7, z0 + 0.8, 0.25, 1.4, 10, { color: [0.22, 0.22, 0.25, 1] });
    for (let i = 0; i < 4; i++) M.builder('metal').cylinderY(x0 - 0.25, y + 0.3 + i * 0.5, z0 + 0.6 + i * 0.5, 0.12, 0.41, 8, { color: [0.4, 0.3, 0.2, 1] });
    for (let i = 0; i < 3; i++) M.builder('white', 'glow').box({ x: x0 + 0.4 + i * 0.5, y: y + 1.6, z: z1 }, { x: x0 + 0.7 + i * 0.5, y: y + 1.75, z: z1 + 0.03 }, { color: i === 1 ? [0.3, 1, 0.4, 1] : [1, 0.3, 0.1, 1] });
    M.light(cx, y + 1.5, z1 + 1, [1.2, 0.7, 0.35], 6);
    M.label('danger', ['HOCHSPANNUNG', 'LEBENSGEFAHR'], '#e8c000', '#111', { size: 26 });
    M.builder('label_danger').boxUnit({ x: x0 + 0.2, y: y + 0.6, z: z1 - 0.01 }, { x: x0 + 1.6, y: y + 1.3, z: z1 + 0.02 }, { faces: onlyFace('pz') });
  };
  P.furnace = function (M, x, y, z, facing) {
    const f = F(facing);
    const b = faceBox(M, 'brick', x, y, z, facing, 2.4, 1.6, 2.6, { collide: true, uvScale: 1 });
    faceBox(M, 'girder', x, y + 2.6, z, facing, 2.5, 1.7, 0.15, { color: STEEL });
    faceBox(M, 'white', x + f.x * 0.81, y + 0.3, z + f.z * 0.81, facing, 1.1, 0.02, 1.0, { color: [1, 0.45, 0.1, 1], variant: 'glow' });
    faceBox(M, 'girder', x + f.x * 0.82, y + 0.2, z + f.z * 0.82, facing, 1.3, 0.04, 0.1, { color: STEEL });
    faceBox(M, 'girder', x + f.x * 0.82, y + 1.3, z + f.z * 0.82, facing, 1.3, 0.04, 0.1, { color: STEEL });
    M.builder('metal').cylinderY(x - f.z * 0.5, y + 2.6, z + f.x * 0.5, 0.3, 2.4, 10, { color: [0.2, 0.2, 0.22, 1] });
    M.light(x + f.x * 1.6, y + 1.0, z + f.z * 1.6, [2.6, 1.2, 0.35], 8);
    M.fires.push({ x: x + f.x * 0.9, y: y + 0.5, z: z + f.z * 0.9 });
    // coal heap in front
    M.builder('dirt').box({ x: x + f.x * 1.4 - 0.6, y, z: z + f.z * 1.4 - 0.6 }, { x: x + f.x * 1.4 + 0.6, y: y + 0.3, z: z + f.z * 1.4 + 0.6 }, { color: [0.3, 0.3, 0.3, 1] });
    return b;
  };
  P.cage = function (M, x0, z0, x1, z1, y = 0, h = 1.9) {
    M.builder('metal').box({ x: x0, y, z: z0 }, { x: x1, y: y + 0.08, z: z1 }, { color: [0.3, 0.3, 0.33, 1] });
    M.builder('metal').box({ x: x0, y: y + h - 0.06, z: z0 }, { x: x1, y: y + h, z: z1 }, { color: [0.3, 0.3, 0.33, 1] });
    M.prop({ x: x0, y, z: z0 }, { x: x1, y: y + h, z: z1 }, 'cage', { uvScale: 1 });
    M.builder('cloth').box({ x: x0 + 0.2, y: y + 0.08, z: z0 + 0.2 }, { x: x1 - 0.2, y: y + 0.3, z: z1 - 0.2 }, { color: [0.35, 0.3, 0.2, 1] }); // straw
  };
  P.desk = function (M, x, z, y = 0, w = 1.6, d = 0.8) {
    M.prop({ x: x - w / 2, y, z: z - d / 2 }, { x: x + w / 2, y: y + 0.8, z: z + d / 2 }, 'wood', { uvScale: 1 });
    M.builder('white').box({ x: x - 0.25, y: y + 0.8, z: z - 0.15 }, { x: x + 0.25, y: y + 0.85, z: z + 0.15 }, { color: [0.8, 0.8, 0.75, 1] });
    M.builder('metal').box({ x: x + 0.4, y: y + 0.8, z: z - 0.1 }, { x: x + 0.6, y: y + 1.0, z: z + 0.1 }, { color: [0.2, 0.2, 0.2, 1] }); // lamp base
  };
  P.cabinet = function (M, x, z, y = 0, facing = 'N') { faceBox(M, 'metal', x, y, z, facing, 0.6, 0.5, 1.4, { color: [0.35, 0.4, 0.35, 1], collide: true }); };
  P.barrel = function (M, x, z, y = 0) { M.builder('rust').cylinderY(x, y, z, 0.35, 0.9, 10, { uvScale: 1 }); M.builder('metal').cylinderY(x, y + 0.88, z, 0.33, 0.03, 10, { color: [0.3, 0.3, 0.32, 1] }); M.colliders.push({ min: { x: x - 0.35, y, z: z - 0.35 }, max: { x: x + 0.35, y: y + 0.9, z: z + 0.35 }, tag: 'prop' }); };
  P.crate = function (M, x, z, y = 0, s = 1.0) { M.prop({ x: x - s / 2, y, z: z - s / 2 }, { x: x + s / 2, y: y + s * 0.8, z: z + s / 2 }, 'wood', { uvScale: 1 }); };
  P.pipeRun = function (M, axis, c, a0, a1, y, r = 0.12, off = 0.15) {
    if (axis === 'x') M.builder('metal').box({ x: a0, y: y - r, z: c + off - r }, { x: a1, y: y + r, z: c + off + r }, { uvScale: 0.5, color: [0.4, 0.36, 0.32, 1] });
    else M.builder('metal').box({ x: c + off - r, y: y - r, z: a0 }, { x: c + off + r, y: y + r, z: a1 }, { uvScale: 0.5, color: [0.4, 0.36, 0.32, 1] });
    const n = Math.max(1, Math.round((a1 - a0) / 4));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      if (axis === 'x') M.builder('metal').box({ x: a - 0.06, y: y - r - 0.05, z: c + off - r - 0.05 }, { x: a + 0.06, y: y + r + 0.05, z: c + off + r + 0.05 }, { color: [0.25, 0.25, 0.27, 1] });
      else M.builder('metal').box({ x: c + off - r - 0.05, y: y - r - 0.05, z: a - 0.06 }, { x: c + off + r + 0.05, y: y + r + 0.05, z: a + 0.06 }, { color: [0.25, 0.25, 0.27, 1] });
    }
  };
  // Tall yard lamp: pole, bent arm, shade, warm pool
  P.lampPost = function (M, x, z, y = 0, h = 4, facing = 'N', color = P.LAMP_WARM, range = 13) {
    const f = F(facing);
    M.prop({ x: x - 0.1, y, z: z - 0.1 }, { x: x + 0.1, y: y + h, z: z + 0.1 }, 'metal', { color: [0.25, 0.25, 0.27, 1] });
    M.builder('metal').cylinderY(x, y, z, 0.22, 0.35, 8, { color: [0.25, 0.25, 0.27, 1] });
    M.builder('metal').beam({ x, y: y + h, z }, { x: x + f.x * 0.9, y: y + h + 0.3, z: z + f.z * 0.9 }, 0.1, 0.1, { color: [0.25, 0.25, 0.27, 1] });
    const lx = x + f.x * 0.9, lz = z + f.z * 0.9;
    M.builder('metal').box({ x: lx - 0.32, y: y + h + 0.1, z: lz - 0.32 }, { x: lx + 0.32, y: y + h + 0.22, z: lz + 0.32 }, { color: [0.22, 0.22, 0.24, 1] });
    M.builder('white', 'glow').box({ x: lx - 0.16, y: y + h + 0.02, z: lz - 0.16 }, { x: lx + 0.16, y: y + h + 0.1, z: lz + 0.16 }, { color: WARM });
    M.light(lx, y + h - 0.3, lz, color, range);
  };
  P.hangingLamp = function (M, x, y, z, range = 12, color = P.LAMP_WARM) {
    M.builder('metal').box({ x: x - 0.03, y: y, z: z - 0.03 }, { x: x + 0.03, y: y + 1.2, z: z + 0.03 }, { color: [0.15, 0.15, 0.15, 1] });
    M.builder('metal').box({ x: x - 0.45, y: y - 0.14, z: z - 0.45 }, { x: x + 0.45, y: y, z: z + 0.45 }, { color: [0.22, 0.22, 0.24, 1] });
    M.builder('metal').box({ x: x - 0.25, y: y - 0.0, z: z - 0.25 }, { x: x + 0.25, y: y + 0.2, z: z + 0.25 }, { color: [0.22, 0.22, 0.24, 1] });
    M.builder('white', 'glow').box({ x: x - 0.2, y: y - 0.2, z: z - 0.2 }, { x: x + 0.2, y: y - 0.13, z: z + 0.2 }, { color: WARM });
    M.light(x, y - 0.6, z, color, range);
  };
  P.smokestack = function (M, x, z, y, r, h, collide = true) {
    M.builder('brick').cylinderY(x, y, z, r, h, 12, { uvScale: 2, subdiv: 4 });
    M.builder('girder').cylinderY(x, y + h - 0.4, z, r + 0.15, 0.4, 12, { uvScale: 0.5, color: STEEL });
    if (collide) M.colliders.push({ min: { x: x - r, y, z: z - r }, max: { x: x + r, y: y + h, z: z + r }, tag: 'prop' });
  };
  // Stair steps over a ramp from zA (yA) to zB (yB), x0..x1, with steel stringers along both sides.
  P.steps = function (M, x0, x1, zA, zB, yA, yB, tex = 'concrete') {
    const n = Math.max(2, Math.round(Math.abs(yB - yA) / 0.22));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const z0 = zA + (zB - zA) * t0, z1 = zA + (zB - zA) * t1;
      const yTop = yA + (yB - yA) * t1, yLow = Math.min(yA, yB) - 0.3;
      M.builder(tex).box({ x: x0, y: yLow, z: Math.min(z0, z1) }, { x: x1, y: yTop, z: Math.max(z0, z1) }, { uvScale: 1 });
      M.builder('girder').box({ x: x0, y: yTop - 0.03, z: Math.min(z0, z1) }, { x: x1, y: yTop + 0.01, z: Math.min(z0, z1) + 0.08 }, { color: STEEL }); // nosing
    }
    for (const sx of [x0, x1]) M.builder('girder').beam({ x: sx, y: yA + 0.1, z: zA }, { x: sx, y: yB + 0.1, z: zB }, 0.12, 0.45, { uvScale: 0.5, color: [0.4, 0.42, 0.46, 1] });
  };
  P.railing = function (M, axis, c, a0, a1, y, h = 1.1) {
    const n = Math.max(1, Math.round((a1 - a0) / 1.5));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      if (axis === 'x') M.builder('metal').box({ x: a - 0.04, y, z: c - 0.04 }, { x: a + 0.04, y: y + h, z: c + 0.04 }, { color: [0.35, 0.35, 0.38, 1] });
      else M.builder('metal').box({ x: c - 0.04, y, z: a - 0.04 }, { x: c + 0.04, y: y + h, z: a + 0.04 }, { color: [0.35, 0.35, 0.38, 1] });
    }
    for (const yy of [y + h - 0.05, y + 0.5]) {
      if (axis === 'x') M.builder('metal').box({ x: a0, y: yy - 0.03, z: c - 0.03 }, { x: a1, y: yy + 0.03, z: c + 0.03 }, { color: [0.4, 0.4, 0.44, 1] });
      else M.builder('metal').box({ x: c - 0.03, y: yy - 0.03, z: a0 }, { x: c + 0.03, y: yy + 0.03, z: a1 }, { color: [0.4, 0.4, 0.44, 1] });
    }
    const min = axis === 'x' ? { x: a0, y, z: c - 0.08 } : { x: c - 0.08, y, z: a0 };
    const max = axis === 'x' ? { x: a1, y: y + h, z: c + 0.08 } : { x: c + 0.08, y: y + h, z: a1 };
    M.colliders.push({ min, max, tag: 'wall' });
  };
  P.chalk = function (M, weapon, x, y, z, facing, text, cost) {
    const f = F(facing), key = 'chalk_' + weapon;
    M.label(key, [text, cost], 'rgba(0,0,0,0)', '#f2efe6', { chalk: true, cls: (ZM.Weapons.defs[weapon] || {}).cls || weapon });
    const w = 2.4, h = 1.3, t = 0.02;
    const min = { x: x - (f.x === 0 ? w / 2 : t), y: y + 0.9, z: z - (f.z === 0 ? w / 2 : t) };
    const max = { x: x + (f.x === 0 ? w / 2 : t), y: y + 0.9 + h, z: z + (f.z === 0 ? w / 2 : t) };
    M.builder('label_' + key, 'blend').boxUnit(min, max, { faces: onlyFace(FRONT(facing)) });
    M.wallbuy(weapon, x + f.x * 0.6, y, z + f.z * 0.6, facing);
  };
  P.sign = function (M, key, lines, x, y, z, facing, w = 3, h = 1.2, bg = '#1a1a1a', fg = '#d8d8d8', opts = {}) {
    const f = F(facing), t = 0.03;
    M.label(key, lines, bg, fg, Object.assign({ size: 48, stencil: true }, opts));
    const min = { x: x - (f.x === 0 ? w / 2 : t), y, z: z - (f.z === 0 ? w / 2 : t) };
    const max = { x: x + (f.x === 0 ? w / 2 : t), y: y + h, z: z + (f.z === 0 ? w / 2 : t) };
    M.builder('label_' + key).boxUnit(min, max, { faces: onlyFace(FRONT(facing)) });
  };
  P.boxPad = function (M, x, y, z) {
    M.builder('metal').box({ x: x - 1.0, y: y - 0.02, z: z - 0.7 }, { x: x + 1.0, y: y + 0.03, z: z + 0.7 }, { color: [0.2, 0.2, 0.22, 1] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, px = x + Math.cos(a) * 1.15, pz = z + Math.sin(a) * 0.85;
      M.builder('white', 'glow').box({ x: px - 0.05, y, z: pz - 0.05 }, { x: px + 0.05, y: y + 0.12, z: pz + 0.05 }, { color: [0.6, 0.8, 1, 1] });
    }
  };
  // Wrecked truck: chassis, cab, flatbed, wheels
  P.truck = function (M, x, z, y, facing = 'E') {
    const f = F(facing), L = 6, W = 2.4;
    const hx = f.x === 0 ? W / 2 : L / 2, hz = f.z === 0 ? W / 2 : L / 2;
    M.prop({ x: x - hx, y: y + 0.5, z: z - hz }, { x: x + hx, y: y + 1.3, z: z + hz }, 'rust', { uvScale: 1 });
    M.colliders.push({ min: { x: x - hx, y, z: z - hz }, max: { x: x + hx, y: y + 0.5, z: z + hz }, tag: 'prop' });
    const cx = x + f.x * (L / 2 - 1.1), cz = z + f.z * (L / 2 - 1.1);
    M.builder('rust').box({ x: cx - (f.x === 0 ? W / 2 - 0.1 : 1.0), y: y + 1.3, z: cz - (f.z === 0 ? W / 2 - 0.1 : 1.0) }, { x: cx + (f.x === 0 ? W / 2 - 0.1 : 1.0), y: y + 2.5, z: cz + (f.z === 0 ? W / 2 - 0.1 : 1.0) }, { uvScale: 1, color: [0.6, 0.55, 0.5, 1] });
    M.builder('winDark').box({ x: cx - (f.x === 0 ? W / 2 - 0.3 : 1.01), y: y + 1.6, z: cz - (f.z === 0 ? W / 2 - 0.3 : 1.01) }, { x: cx + (f.x === 0 ? W / 2 - 0.3 : 1.01), y: y + 2.3, z: cz + (f.z === 0 ? W / 2 - 0.3 : 1.01) }, { uvScale: 1 });
    for (const s of [-1, 1]) for (const t of [-0.35, 0.3]) {
      const wx = x + f.x * L * t + (f.x === 0 ? s * (W / 2 - 0.1) : 0), wz = z + f.z * L * t + (f.z === 0 ? s * (W / 2 - 0.1) : 0);
      M.builder('metal').box({ x: wx - (f.x === 0 ? 0.15 : 0.5), y, z: wz - (f.z === 0 ? 0.15 : 0.5) }, { x: wx + (f.x === 0 ? 0.15 : 0.5), y: y + 0.9, z: wz + (f.z === 0 ? 0.15 : 0.5) }, { color: [0.1, 0.1, 0.1, 1] });
    }
  };
})();


// ===== 40_map.js =====
// ---------------------------------------------------------------------------
// 40_map.js — "Der Riese": authentic two-storey layout (spawn/mainframe,
// factory rooms, auto garage + balcony, Teleporter B lab, courtyard with the
// power generator and bridge, animal testing lab + balcony, Teleporter A
// generator room, Teleporter C hall with office/catwalk/trench).
// Static lighting is baked per vertex (unlimited lamps) in _bake().
// Units: metres. +x east, -z north, +y up. Pure JS (no GL).
// ---------------------------------------------------------------------------
(function () {
  const WALL_T = 0.4;
  const WIN_Y0 = 0.9, WIN_Y1 = 2.2;
  const DOOR_H = 3.0;
  const HEADROOM = 2.2;  // a floor this far under stairs/platforms is walkable again
  const BOARDS = 6;
  const STEEL = [0.55, 0.57, 0.6, 1];

  class GameMap {
    constructor() {
      this.builders = {};
      this.colliders = [];
      this.floors = [];
      this.ramps = [];
      this.zones = {};
      this.doors = [];
      this.windows = [];
      this.risers = [];
      this.wallbuys = [];
      this.perks = [];
      this.boxSpots = [];
      this.teleporters = [];
      this.lights = [];
      this.labels = [];
      this.props = [];
      this.traps = [];
      this.fires = [];
      this.bridge = null;
      this.chunk = 'S';
      this.spawn = { pos: { x: 50, y: 0, z: 8 }, yaw: Math.PI / 2 };
      this.bounds = { x0: -58, z0: -48, x1: 64, z1: 42 };
      this._build();
      this._bake();
    }
    // variant: '' (lit opaque, baked) | 'glow' (unlit/self-lit) | 'blend' (alpha-blended, two-sided)
    builder(tex, variant = '') { const key = (this.chunk || 'S') + '|' + tex + '|' + variant; let b = this.builders[key]; if (!b) { b = this.builders[key] = new ZM.MeshBuilder(); b.zone = this.chunk || 'S'; b.tex = tex; b.variant = variant; } return b; }

    // ----- primitives -----------------------------------------------------------
    floor(x0, z0, x1, z1, y, tex = 'floor', opts = {}) {
      this.floors.push(Object.assign({ x0, z0, x1, z1, y }, opts));
      this.builder(tex).box({ x: x0, y: y - 0.3, z: z0 }, { x: x1, y, z: z1 }, { uvScale: 2, subdiv: 1, faces: { nx: false, px: false, nz: false, pz: false, ny: opts.underside ? true : false } });
    }
    // raised floor (balcony/catwalk) with a visible underside; 'grate' = steel bar grating on girder edge beams
    deck(x0, z0, x1, z1, y, tex = 'metal') {
      this.floors.push({ x0, z0, x1, z1, y });
      if (tex === 'grate') {
        this.builder('grate').box({ x: x0, y: y - 0.06, z: z0 }, { x: x1, y, z: z1 }, { uvScale: 1, subdiv: 1, faces: { nx: false, px: false, nz: false, pz: false } });
        const g = this.builder('girder'), c = [0.45, 0.47, 0.5, 1];
        g.box({ x: x0, y: y - 0.3, z: z0 }, { x: x1, y: y - 0.06, z: z0 + 0.12 }, { uvScale: 0.5, color: c }); g.box({ x: x0, y: y - 0.3, z: z1 - 0.12 }, { x: x1, y: y - 0.06, z: z1 }, { uvScale: 0.5, color: c });
        g.box({ x: x0, y: y - 0.3, z: z0 }, { x: x0 + 0.12, y: y - 0.06, z: z1 }, { uvScale: 0.5, color: c }); g.box({ x: x1 - 0.12, y: y - 0.3, z: z0 }, { x: x1, y: y - 0.06, z: z1 }, { uvScale: 0.5, color: c });
        const n = Math.max(1, Math.round((x1 - x0) / 4));
        for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * (i / n); g.box({ x: x - 0.06, y: y - 0.3, z: z0 }, { x: x + 0.06, y: y - 0.06, z: z1 }, { uvScale: 0.5, color: c }); }
      } else this.builder(tex).box({ x: x0, y: y - 0.25, z: z0 }, { x: x1, y, z: z1 }, { uvScale: 2, subdiv: 1 });
    }
    // Raised solid platform: floor record on top, full block below, thin edge colliders (gaps where stairs attach:
    // openings = [{side:'N'|'S'|'E'|'W', a0, a1}]).
    platform(x0, z0, x1, z1, y, tex = 'concrete', openings = []) {
      this.floors.push({ x0, z0, x1, z1, y, solid: true });
      this.colliders.push({ min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: y - 0.2, z: z1 }, tag: 'wall' }); // solid body (blocks the ground layer only)
      this.builder(tex).box({ x: x0, y: -0.1, z: z0 }, { x: x1, y, z: z1 }, { uvScale: 2, subdiv: 1, faces: { ny: false } });
      this.builder('girder').box({ x: x0 - 0.05, y: y - 0.12, z: z0 - 0.05 }, { x: x1 + 0.05, y: y + 0.02, z: z1 + 0.05 }, { uvScale: 0.5, color: STEEL, faces: { ny: false } });
      const edge = (side) => {
        const ops = openings.filter(o => o.side === side).sort((p, q) => p.a0 - q.a0);
        const a0 = (side === 'N' || side === 'S') ? x0 : z0, a1 = (side === 'N' || side === 'S') ? x1 : z1;
        let cur = a0;
        const seg = (s0, s1) => { if (s1 - s0 < 1e-6) return; const t = 0.05;
          if (side === 'N') this.colliders.push({ min: { x: s0, y: 0, z: z0 - t }, max: { x: s1, y, z: z0 + t }, tag: 'wall' });
          if (side === 'S') this.colliders.push({ min: { x: s0, y: 0, z: z1 - t }, max: { x: s1, y, z: z1 + t }, tag: 'wall' });
          if (side === 'W') this.colliders.push({ min: { x: x0 - t, y: 0, z: s0 }, max: { x: x0 + t, y, z: s1 }, tag: 'wall' });
          if (side === 'E') this.colliders.push({ min: { x: x1 - t, y: 0, z: s0 }, max: { x: x1 + t, y, z: s1 }, tag: 'wall' }); };
        for (const o of ops) { seg(cur, o.a0); cur = o.a1; }
        seg(cur, a1);
      };
      for (const side of ['N', 'S', 'E', 'W']) edge(side);
    }
    ceiling(x0, z0, x1, z1, y, tex = 'corrugated') {
      this.builder(tex).box({ x: x0, y, z: z0 }, { x: x1, y: y + 0.3, z: z1 }, { uvScale: 2, subdiv: 1, faces: { nx: false, px: false, nz: false, pz: false, py: false } });
    }
    solid(min, max, tex, opts = {}) {
      this.colliders.push({ min, max, tag: opts.tag || 'wall', id: opts.id });
      if (tex) this.builder(tex).box(min, max, { uvScale: opts.uvScale || 2, color: opts.color, subdiv: opts.subdiv });
    }
    prop(min, max, tex, opts = {}) { this.solid(min, max, tex, Object.assign({ tag: 'prop' }, opts)); this.props.push({ min, max }); }
    // Lights bake into the zone they are registered in (opts.zones overrides) and light entities dynamically.
    light(x, y, z, color = [1, 0.85, 0.6], range = 11, opts = {}) { this.lights.push({ pos: { x, y, z }, color, range, zone: opts.zone || this.chunk, zones: opts.zones }); }
    lamp(x, y, z, color, range) {
      this.light(x, y - 0.3, z, color, range);
      this.builder('white', 'glow').box({ x: x - 0.25, y: y - 0.1, z: z - 0.25 }, { x: x + 0.25, y: y + 0.1, z: z + 0.25 }, { color: [1, 0.95, 0.8, 1] });
    }
    wallX(x, z0, z1, y0, y1, tex, openings = []) { this._wall('x', x, z0, z1, y0, y1, tex, openings); }
    wallZ(z, x0, x1, y0, y1, tex, openings = []) { this._wall('z', z, x0, x1, y0, y1, tex, openings); }
    _wall(axis, c, a0, a1, y0, y1, tex, openings) {
      const box = (aa, ab, ya, yb, tag, id) => {
        if (ab - aa < 1e-6 || yb - ya < 1e-6) return;
        const min = axis === 'x' ? { x: c - WALL_T / 2, y: ya, z: aa } : { x: aa, y: ya, z: c - WALL_T / 2 };
        const max = axis === 'x' ? { x: c + WALL_T / 2, y: yb, z: ab } : { x: ab, y: yb, z: c + WALL_T / 2 };
        if (tag === 'hole') return { min, max };
        this.solid(min, max, tex, { tag: tag || 'wall', id, subdiv: 1 });
        return { min, max };
      };
      const ops = openings.slice().sort((p, q) => p.a - q.a);
      let cur = a0;
      for (const op of ops) {
        box(cur, op.a, y0, y1);
        const oy0 = op.y0 === undefined ? y0 : op.y0, oy1 = op.y1 === undefined ? y1 : op.y1;
        if (oy0 > y0) box(op.a, op.b, y0, oy0);
        if (oy1 < y1) box(op.a, op.b, oy1, y1);
        const hole = box(op.a, op.b, oy0, oy1, 'hole');
        if (op.door) {
          const d = op.door; d.min = hole.min; d.max = hole.max; d.axis = axis;
          this.colliders.push({ min: hole.min, max: hole.max, tag: 'door', id: d.id });
          d.parts = this._doorParts(hole.min, hole.max, axis, d);
          // door frame (static)
          const g = this.builder('girder'), t = 0.12;
          if (axis === 'x') { g.box({ x: c - 0.25, y: hole.min.y, z: hole.min.z - t }, { x: c + 0.25, y: hole.max.y + t, z: hole.min.z }, { uvScale: 0.5, color: STEEL }); g.box({ x: c - 0.25, y: hole.min.y, z: hole.max.z }, { x: c + 0.25, y: hole.max.y + t, z: hole.max.z + t }, { uvScale: 0.5, color: STEEL }); g.box({ x: c - 0.25, y: hole.max.y, z: hole.min.z }, { x: c + 0.25, y: hole.max.y + t, z: hole.max.z }, { uvScale: 0.5, color: STEEL }); }
          else { g.box({ x: hole.min.x - t, y: hole.min.y, z: c - 0.25 }, { x: hole.min.x, y: hole.max.y + t, z: c + 0.25 }, { uvScale: 0.5, color: STEEL }); g.box({ x: hole.max.x, y: hole.min.y, z: c - 0.25 }, { x: hole.max.x + t, y: hole.max.y + t, z: c + 0.25 }, { uvScale: 0.5, color: STEEL }); g.box({ x: hole.min.x, y: hole.max.y, z: c - 0.25 }, { x: hole.max.x, y: hole.max.y + t, z: c + 0.25 }, { uvScale: 0.5, color: STEEL }); }
        }
        if (op.gate) {
          const g = op.gate; g.min = hole.min; g.max = hole.max;
          this.colliders.push({ min: hole.min, max: hole.max, tag: 'gate', id: g.id });
          g.mesh = new ZM.MeshBuilder();
          const n = 7;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            if (axis === 'x') g.mesh.box({ x: c - 0.06, y: hole.min.y, z: hole.min.z + (hole.max.z - hole.min.z) * t - 0.05 }, { x: c + 0.06, y: hole.max.y, z: hole.min.z + (hole.max.z - hole.min.z) * t + 0.05 }, { color: [0.5, 0.5, 0.55, 1] });
            else g.mesh.box({ x: hole.min.x + (hole.max.x - hole.min.x) * t - 0.05, y: hole.min.y, z: c - 0.06 }, { x: hole.min.x + (hole.max.x - hole.min.x) * t + 0.05, y: hole.max.y, z: c + 0.06 }, { color: [0.5, 0.5, 0.55, 1] });
          }
          if (axis === 'x') g.mesh.box({ x: c - 0.07, y: hole.max.y - 0.2, z: hole.min.z }, { x: c + 0.07, y: hole.max.y, z: hole.max.z }, { color: [0.5, 0.5, 0.55, 1] });
          else g.mesh.box({ x: hole.min.x, y: hole.max.y - 0.2, z: c - 0.07 }, { x: hole.max.x, y: hole.max.y, z: c + 0.07 }, { color: [0.5, 0.5, 0.55, 1] });
        }
        if (op.window) {
          const w = op.window;
          w.hole = hole;
          this.colliders.push({ min: hole.min, max: hole.max, tag: 'window', id: w.id });
          w.boardMeshes = [];
          for (let i = 0; i < BOARDS; i++) {
            const mb = new ZM.MeshBuilder();
            const yy = hole.min.y + 0.1 + i * ((hole.max.y - hole.min.y - 0.2) / (BOARDS - 1));
            const half = 0.09;
            if (axis === 'x') mb.box({ x: c - 0.3, y: yy - half, z: hole.min.z - 0.15 }, { x: c - 0.14, y: yy + half, z: hole.max.z + 0.15 }, { uvScale: 1 });
            else mb.box({ x: hole.min.x - 0.15, y: yy - half, z: c - 0.3 }, { x: hole.max.x + 0.15, y: yy + half, z: c - 0.14 }, { uvScale: 1 });
            w.boardMeshes.push(mb);
          }
          const fb = this.builder('wood');
          if (axis === 'x') { fb.box({ x: c - 0.25, y: hole.min.y - 0.15, z: hole.min.z - 0.15 }, { x: c + 0.25, y: hole.min.y, z: hole.max.z + 0.15 }); fb.box({ x: c - 0.25, y: hole.max.y, z: hole.min.z - 0.15 }, { x: c + 0.25, y: hole.max.y + 0.15, z: hole.max.z + 0.15 }); }
          else { fb.box({ x: hole.min.x - 0.15, y: hole.min.y - 0.15, z: c - 0.25 }, { x: hole.max.x + 0.15, y: hole.min.y, z: c + 0.25 }); fb.box({ x: hole.min.x - 0.15, y: hole.max.y, z: c - 0.25 }, { x: hole.max.x + 0.15, y: hole.max.y + 0.15, z: c + 0.25 }); }
        }
        cur = op.b;
      }
      box(cur, a1, y0, y1);
    }
    // Door blocker meshes by type: power → steel roller door; 750 → riveted steel double door;
    // 1000 → chain-link gate; otherwise wooden debris. Returns [{mesh, tex}].
    _doorParts(min, max, axis, d) {
      const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2, cy = (min.y + max.y) / 2;
      const ax = axis === 'x';
      const slab = (mb, inset, th, y0, y1, color, uv = 1) => mb.box({ x: ax ? cx - th : min.x + inset, y: y0, z: ax ? min.z + inset : cz - th }, { x: ax ? cx + th : max.x - inset, y: y1, z: ax ? max.z - inset : cz + th }, { color, uvScale: uv });
      if (d.power) {
        const mb = new ZM.MeshBuilder();
        slab(mb, 0.12, 0.05, min.y, max.y, [0.5, 0.52, 0.56, 1]);
        for (let i = 0; i < 7; i++) { const y = min.y + 0.3 + i * ((max.y - min.y - 0.5) / 6); slab(mb, 0.1, 0.09, y - 0.03, y + 0.03, [0.3, 0.3, 0.33, 1]); }
        return [{ mesh: mb, tex: 'corrugated' }];
      }
      if (d.cost === 750) {
        const mb = new ZM.MeshBuilder(), w = ax ? max.z - min.z : max.x - min.x;
        for (const s of [0, 1]) { // two leaves
          const a0 = s ? w / 2 + 0.02 : 0.05, a1 = s ? w - 0.05 : w / 2 - 0.02;
          mb.box({ x: ax ? cx - 0.06 : min.x + a0, y: min.y + 0.02, z: ax ? min.z + a0 : cz - 0.06 }, { x: ax ? cx + 0.06 : min.x + a1, y: max.y - 0.05, z: ax ? min.z + a1 : cz + 0.06 }, { color: [0.42, 0.44, 0.48, 1], uvScale: 1 });
        }
        for (const yy of [min.y + 0.6, cy, max.y - 0.6]) slab(mb, 0.1, 0.09, yy - 0.08, yy + 0.08, [0.3, 0.3, 0.33, 1]); // bands
        slab(mb, w / 2 - 0.14, 0.1, min.y + 0.1, max.y - 0.1, [0.25, 0.25, 0.28, 1]); // centre seam strip
        return [{ mesh: mb, tex: 'metal' }];
      }
      if (d.cost === 1000) {
        const frame = new ZM.MeshBuilder(), mesh = new ZM.MeshBuilder(), col = [0.5, 0.52, 0.55, 1];
        const w = ax ? max.z - min.z : max.x - min.x;
        for (const a of [0.05, w / 2, w - 0.05]) frame.box({ x: ax ? cx - 0.05 : min.x + a - 0.05, y: min.y, z: ax ? min.z + a - 0.05 : cz - 0.05 }, { x: ax ? cx + 0.05 : min.x + a + 0.05, y: max.y, z: ax ? min.z + a + 0.05 : cz + 0.05 }, { color: col });
        for (const yy of [min.y + 0.1, max.y - 0.1]) slab(frame, 0.02, 0.04, yy - 0.04, yy + 0.04, col);
        slab(mesh, 0.05, 0.004, min.y + 0.1, max.y - 0.1, [1, 1, 1, 1], 1);
        return [{ mesh: frame, tex: 'girder' }, { mesh, tex: 'fence' }];
      }
      const mb = new ZM.MeshBuilder();
      slab(mb, 0.1, 0.05, min.y, max.y, [0.3, 0.27, 0.24, 1]);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const y = min.y + 0.3 + i * ((max.y - min.y - 0.6) / (n - 1));
        slab(mb, 0, 0.12, y - 0.12, y + 0.12, [0.75, 0.7, 0.6, 1]);
      }
      for (let i = 0; i < 4; i++) {
        const t = (i + 0.5) / 4, s = 0.25 + (i % 2) * 0.2;
        const px = ax ? cx : min.x + (max.x - min.x) * t, pz = ax ? min.z + (max.z - min.z) * t : cz;
        mb.box({ x: px - s, y: min.y, z: pz - s }, { x: px + s, y: min.y + s * 1.6, z: pz + s }, { color: [0.6, 0.55, 0.5, 1] });
      }
      if (ax) { mb.box({ x: cx - 0.15, y: min.y, z: min.z }, { x: cx + 0.15, y: max.y, z: min.z + 0.3 }); mb.box({ x: cx - 0.15, y: min.y, z: max.z - 0.3 }, { x: cx + 0.15, y: max.y, z: max.z }); }
      else { mb.box({ x: min.x, y: min.y, z: cz - 0.15 }, { x: min.x + 0.3, y: max.y, z: cz + 0.15 }); mb.box({ x: max.x - 0.3, y: min.y, z: cz - 0.15 }, { x: max.x, y: max.y, z: cz + 0.15 }); }
      return [{ mesh: mb, tex: 'wood' }];
    }
    // opts: {base: floor height of the doorway (default 0), power: opens when the power is turned on}
    door(id, cost, zones, a, b, label, opts = {}) {
      const base = opts.base || 0;
      const d = { id, cost, zones, open: false, label: label || 'Debris', a, b, power: !!opts.power };
      this.doors.push(d);
      return { a, b, y0: base, y1: base + DOOR_H, door: d };
    }
    win(id, zone, side, wc, from, to, floorY = 0) {
      const mid = (from + to) / 2;
      const w = { id, zone, boards: BOARDS, side, floorY };
      const out = 1.3, inn = 1.0;
      if (side === 'N') { w.inside = { x: mid, y: floorY, z: wc + inn }; w.outside = { x: mid, y: floorY, z: wc - out }; this._pocket(from - 1, wc - 3, to + 1, wc, floorY, 'S'); }
      if (side === 'S') { w.inside = { x: mid, y: floorY, z: wc - inn }; w.outside = { x: mid, y: floorY, z: wc + out }; this._pocket(from - 1, wc, to + 1, wc + 3, floorY, 'N'); }
      if (side === 'E') { w.inside = { x: wc - inn, y: floorY, z: mid }; w.outside = { x: wc + out, y: floorY, z: mid }; this._pocket(wc, from - 1, wc + 3, to + 1, floorY, 'W'); }
      if (side === 'W') { w.inside = { x: wc + inn, y: floorY, z: mid }; w.outside = { x: wc - out, y: floorY, z: mid }; this._pocket(wc - 3, from - 1, wc, to + 1, floorY, 'E'); }
      this.windows.push(w);
      return { a: from, b: to, y0: floorY + WIN_Y0, y1: floorY + WIN_Y1, window: w };
    }
    _pocket(x0, z0, x1, z1, y, openSide) {
      this.floor(x0, z0, x1, z1, y, 'dirt', { underside: y > 0 });
      const h = y + 3.5;
      if (openSide !== 'N') this.wallZ(z0, x0, x1, y, h, 'stone');
      if (openSide !== 'S') this.wallZ(z1, x0, x1, y, h, 'stone');
      if (openSide !== 'W') this.wallX(x0, z0, z1, y, h, 'stone');
      if (openSide !== 'E') this.wallX(x1, z0, z1, y, h, 'stone');
    }
    // Stairs: ramp floor record + step meshes. zA/zB any order; yA at zA, yB at zB.
    stairs(x0, x1, zA, zB, yA, yB, tex = 'concrete') {
      const r = { x0, x1, zA: Math.min(zA, zB), zB: Math.max(zA, zB), yA: zA < zB ? yA : yB, yB: zA < zB ? yB : yA };
      this.ramps.push(r);
      // the volume under the treads is solid where there is no headroom: 1 m segments topped 0.25 m below the segment's lowest tread
      const n = Math.max(1, Math.round(r.zB - r.zA)), lo = Math.min(yA, yB);
      for (let i = 0; i < n; i++) {
        const z0 = r.zA + (r.zB - r.zA) * (i / n), z1 = r.zA + (r.zB - r.zA) * ((i + 1) / n);
        const h0 = r.yA + (r.yB - r.yA) * (i / n), h1 = r.yA + (r.yB - r.yA) * ((i + 1) / n), low = Math.min(h0, h1);
        if (low - lo >= 0.5 && low - lo < HEADROOM) this.colliders.push({ min: { x: x0, y: lo, z: z0 }, max: { x: x1, y: low - 0.25, z: z1 }, tag: 'wall' });
      }
      ZM.Props.steps(this, x0, x1, zA, zB, yA, yB, tex);
    }
    // Low fence between the yard and a walkway: 0.8 m concrete base (collides) with chain-link to 2.6 m.
    // A door in `openings` becomes a gate: brick pillars, steel header and a lamp hung from it.
    yardFence(axis, c, a0, a1, openings = []) {
      const BASE = 0.8, P = ZM.Props;
      this._wall(axis, c, a0, a1, 0, BASE, 'concrete', openings);
      const ops = openings.slice().sort((p, q) => p.a - q.a);
      let cur = a0;
      const segs = [];
      for (const op of ops) { segs.push([cur, op.a - 0.7]); cur = op.b + 0.7; }
      segs.push([cur, a1]);
      for (const [s0, s1] of segs) if (s1 - s0 > 0.3) P.fence(this, axis, c, s0, s1, BASE, 1.8, false);
      for (const op of ops) {
        for (const a of [op.a - 0.35, op.b + 0.35]) {
          const min = axis === 'x' ? { x: c - 0.4, y: 0, z: a - 0.35 } : { x: a - 0.35, y: 0, z: c - 0.4 };
          const max = axis === 'x' ? { x: c + 0.4, y: DOOR_H + 0.6, z: a + 0.35 } : { x: a + 0.35, y: DOOR_H + 0.6, z: c + 0.4 };
          this.solid(min, max, 'brick', { uvScale: 1 });
          this.builder('concrete').box({ x: min.x - 0.06, y: max.y, z: min.z - 0.06 }, { x: max.x + 0.06, y: max.y + 0.12, z: max.z + 0.06 }, { uvScale: 1, color: [0.6, 0.6, 0.58, 1] }); // cap
        }
        const hmin = axis === 'x' ? { x: c - 0.25, y: DOOR_H + 0.15, z: op.a - 0.7 } : { x: op.a - 0.7, y: DOOR_H + 0.15, z: c - 0.25 };
        const hmax = axis === 'x' ? { x: c + 0.25, y: DOOR_H + 0.45, z: op.b + 0.7 } : { x: op.b + 0.7, y: DOOR_H + 0.45, z: c + 0.25 };
        this.builder('girder').box(hmin, hmax, { uvScale: 0.5, color: STEEL });
        const mid = (op.a + op.b) / 2;
        P.hangingLamp(this, axis === 'x' ? c : mid, DOOR_H + 0.15, axis === 'x' ? mid : c, 9);
      }
    }
    zone(id, name, rects, ceiling, links = [], opts = {}) { this.zones[id] = Object.assign({ id, name, rects, ceiling, links, open: false }, opts); }
    riser(zone, x, z, y = 0) { this.risers.push({ zone, x, z, y }); }
    wallbuy(weapon, x, y, z, facing) { this.wallbuys.push({ weapon, pos: { x, y, z }, facing }); }
    perk(id, x, y, z, facing) { ZM.Props.perkMachine(this, id, x, y, z, facing); const f = GameMap.facingVec(facing); this.perks.push({ id, pos: { x: x + f.x * 0.9, y, z: z + f.z * 0.9 }, facing }); }
    boxSpot(id, zone, x, y, z) { this.boxSpots.push({ id, zone, pos: { x, y, z } }); ZM.Props.boxPad(this, x, y, z); }
    teleporter(id, zone, x, y, z) { this.teleporters.push({ id, zone, pos: { x, y, z } }); }
    label(key, lines, bg, fg, opts) { if (!this.labels.find(l => l.key === key)) this.labels.push({ key, lines, bg, fg, opts }); }
    static facingVec(f) { return { N: { x: 0, z: -1 }, S: { x: 0, z: 1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } }[f]; }

    // ---------------------------------------------------------------------------
    _build() {
      const M = this, P = ZM.Props;
      const WARM = P.LAMP_WARM, COOL = P.LAMP_COOL, ORANGE = P.LAMP_ORANGE;
      // ================= ZONES =================
      M.zone('S', 'Mainframe yard (spawn)', [[26, -16, 54, 16], [54, -6, 60, 2]], null, [], { outdoor: true });
      M.zone('RF', 'Right walkway', [[10, -30, 26, -2], [26, -26, 46, -16]], null, [], { outdoor: true });
      M.zone('LF', 'Left walkway', [[10, -2, 26, 30], [26, 16, 46, 26]], null, [], { outdoor: true });
      M.zone('GAR', 'Auto garage', [[-14, -40, 10, -18]], 8);
      M.zone('TB', 'Chemical lab — Teleporter B', [[-36, -40, -14, -18]], 8);
      M.zone('CY', 'Courtyard', [[-14, -18, 10, 14]], null, [], { outdoor: true });
      M.zone('LAB', 'Animal testing lab', [[-14, 14, 10, 36]], 8);
      M.zone('TA', 'Generator room — Teleporter A', [[-36, 14, -14, 36]], 6);
      M.zone('TC', 'Main factory — Teleporter C', [[-50, -18, -14, 14], [-50, 14, -40, 30]], 10);
      M.zones.S.open = true;
      M.freeLinks = [];

      // ================= SPAWN / MAINFRAME YARD (S) =================
      // A big fenced courtyard with the mainframe on a raised platform in the middle. The open-air walkways
      // wrap around it (north, west and south) behind low concrete-and-chain-link fences, so the catwalks and
      // the factory beyond are in view from the start. The two 750 gates sit in the north and south fences;
      // the east end is solid wall: barricades, Quick Revive and the Pack-a-Punch alcove behind its gate.
      M.chunk = 'S';
      M.floor(26, -16, 54, 16, 0, 'ground');
      M.floor(54, -6, 60, 2, 0, 'floor');
      M.gate = { id: 'papGate', open: false };
      M.wallZ(-16, 46, 54, 0, 7, 'stone', [M.win('W_S1', 'S', 'N', -16, 49, 51)]);
      M.wallZ(16, 46, 54, 0, 7, 'stone', [M.win('W_S2', 'S', 'S', 16, 49, 51)]);
      M.wallX(54, -16, 16, 0, 7, 'stone', [M.win('W_S3', 'S', 'E', 54, -12, -10), { a: -5, b: -1, y0: 0, y1: DOOR_H, gate: M.gate }, M.win('W_S4', 'S', 'E', 54, 6, 8)]);
      M.wallZ(-6, 54, 60, 0, 7, 'brick'); M.wallZ(2, 54, 60, 0, 7, 'brick'); M.wallX(60, -6, 2, 0, 7, 'brick');
      M.ceiling(54, -6, 60, 2, 4.2, 'corrugated');
      M.yardFence('z', -16, 26, 46, [M.door('D_R', 750, ['S', 'RF'], 30, 34, 'Gate')]);
      M.yardFence('z', 16, 26, 46, [M.door('D_L', 750, ['S', 'LF'], 30, 34, 'Gate')]);
      M.yardFence('x', 26, -16, 16);
      M.sightLinks = [['S', 'RF'], ['S', 'LF']]; // seen through the fences even while the gates are shut
      P.facade(M, 'x', -16, 46, 54, 0, 7, 'S', { first: 3.6, lit: 0.45, seed: 11, roof: false });
      P.facade(M, 'x', 16, 46, 54, 0, 7, 'N', { first: 3.6, lit: 0.35, seed: 12, roof: false });
      P.facade(M, 'z', 54, -16, 16, 0, 7, 'W', { first: 3.6, lit: 0.4, seed: 13 });
      P.wallLamp(M, 53.8, 3.2, -3, 'W', WARM, 7); P.wallLamp(M, 53.8, 3.4, 12, 'W'); P.wallLamp(M, 53.8, 3.4, -14, 'W');
      P.sign(M, 'sign_pap_gate', ['WAFFEN', 'VERBESSERUNG'], 53.75, 3.3, -3, 'W', 3.2, 1.0, '#1c1c1c', '#cfcfcf', { size: 34 });
      P.building(M, 26, -42, 54, -29.5, 0, 12, { faces: ['S'], lit: 0.35 });
      P.building(M, 26, 29.5, 54, 42, 0, 10, { faces: ['N'], lit: 0.3 });
      P.building(M, 60.5, -18, 76, 16, 0, 11, { faces: ['W'], lit: 0.35, stack: 14 });
      // raised mainframe platform: 12 x 12 m, 1.3 m high, stairs at the south-west and north-east corners
      M.platform(34, -8, 46, 4, 1.3, 'concrete', [{ side: 'S', a0: 34, a1: 38 }, { side: 'N', a0: 42, a1: 46 }]);
      M.stairs(34, 38, 8, 4, 0, 1.3); M.stairs(42, 46, -12, -8, 0, 1.3);
      P.railing(M, 'x', 4, 38.3, 46, 1.3); P.railing(M, 'x', -8, 34, 41.7, 1.3); P.railing(M, 'z', 34, -8, 4, 1.3); P.railing(M, 'z', 46, -8, 4, 1.3);
      P.mainframe(M, 40, 1.3, -2);
      P.pap(M, 59.1, 0, -3, 'W');
      M.perk('quick_revive', 53.35, 0, -8, 'W');
      P.chalk(M, 'm14', 47.2, 0, -15.78, 'S', 'M14', 500);
      P.chalk(M, 'olympia', 47.2, 0, 15.78, 'N', 'OLYMPIA', 500);
      for (const [lx, lz, f] of [[29, -13, 'E'], [51, -13, 'W'], [29, 13, 'E'], [51, 13, 'W'], [40, 14, 'N'], [27.5, 0, 'E']]) P.lampPost(M, lx, lz, 0, 4.4, f);
      P.crate(M, 51, 4, 0, 1.2); P.crate(M, 52.2, 4.3, 0, 0.9); P.barrel(M, 28.5, -8); P.barrel(M, 29.3, -7.4); P.barrel(M, 30, 2);
      P.generator(M, 44, 12, 48, 14.9);
      P.fence(M, 'x', 11.6, 44, 52.5, 0, 2.4, false);
      P.sandbags(M, 'x', -14.9, 35, 37.5, 0); P.sandbags(M, 'z', 53.1, 9, 12, 0, 2); P.sandbags(M, 'x', 14.9, 38, 41, 0, 2);
      P.stripe(M, 31.5, -10.5, 31.75, 6.5, 0); P.stripe(M, 31.5, -10.5, 48.5, -10.25, 0); P.stripe(M, 48.25, -10.5, 48.5, 6.5, 0); P.stripe(M, 31.5, 6.25, 48.5, 6.5, 0);
      P.cables(M, [[36, -8.5], [33, -12], [30.5, -13], [27, -13.5]], 0); P.cables(M, [[44.5, 4.5], [47, 8], [49.5, 11]], 0); P.cables(M, [[40, 8.3], [40.5, 12], [43, 13.5]], 0);
      P.smokestack(M, 64, -32, 0, 2.5, 26); P.smokestack(M, 40, -54, 0, 2.2, 22);
      P.pipeRun(M, 'z', 54, -16, -6, 3.0, 0.14, -0.3);

      // ================= RIGHT WALKWAY (RF): wraps the north and west sides of the yard =================
      // Open-air alley: a grated catwalk runs along the yard fence (zombies would drop from it in the real map),
      // the power shutter into the courtyard and the 1000 door into the auto garage are in the factory wall.
      M.chunk = 'RF';
      M.floor(10, -30, 26, -2, 0, 'ground'); M.floor(26, -26, 46, -16, 0, 'ground');
      M.wallZ(-30, 10, 26, 0, 7, 'stone', [M.win('W_RF1', 'RF', 'N', -30, 13, 15), M.win('W_RF2', 'RF', 'N', -30, 21, 23)]);
      M.wallZ(-26, 26, 46, 0, 7, 'stone', [M.win('W_RF3', 'RF', 'N', -26, 39, 41)]);
      M.wallX(26, -30, -26, 0, 7, 'stone');
      M.wallX(46, -26, -16, 0, 7, 'stone');
      M.wallZ(-2, 10, 26, 0, 7, 'stone');
      M.wallX(10, -30, -2, 0, 7, 'concrete', [M.door('D_GAR', 1000, ['RF', 'GAR'], -28, -25, 'Door'), M.door('PD_R', 0, ['RF', 'CY'], -12, -8, 'Power door', { power: true })]);
      M.deck(22, -30, 26, -2, 3.5, 'grate'); P.railing(M, 'x', 22, -30, -2, 3.5); P.railing(M, 'x', 26, -30, -2, 3.5);
      for (const z of [-27, -19, -11, -4]) { P.ibeam(M, 22.2, z, 0, 3.2, 0.4, 'x'); P.ibeam(M, 25.75, z, 0.8, 3.2, 0.3, 'x'); }
      P.chalk(M, 'm16', 32, 0, -25.78, 'S', 'M16', 1200);
      P.sign(M, 'sign_garage', ['AUTOMOBIL', 'GARAGE'], 10.25, 3.3, -26.5, 'E', 3.4, 1.1, '#202020', '#d8d0bd', { size: 36 });
      P.sign(M, 'sign_fabrik', ['WAFFENFABRIK', 'DER RIESE'], 10.25, 2.0, -17.5, 'E', 9, 1.5, '#262626', '#d9d2c2', { size: 40 });
      P.facade(M, 'z', 10, -30, -2, 0, 7, 'E', { first: 4.2, lit: 0.3, seed: 21, roof: false });
      P.facade(M, 'x', -26, 26, 46, 0, 7, 'S', { first: 3.6, lit: 0.35, seed: 23, roof: false });
      P.facade(M, 'x', -30, 10, 26, 0, 7, 'S', { first: 4.2, lit: 0.3, seed: 28, roof: false, pipe: false });
      P.windows(M, 'x', -2, 11, 21, 4.2, 2.0, 'N', { lit: 0.3, seed: 24 });
      P.wallLamp(M, 10.2, 3.6, -22.5, 'E'); P.wallLamp(M, 10.2, 3.6, -5, 'E'); P.lampPost(M, 18, -14, 0, 4.4, 'W'); P.lampPost(M, 36, -24.2, 0, 4.4, 'S'); P.wallLamp(M, 45.8, 3.4, -21, 'W');
      P.sandbags(M, 'x', -28.9, 16, 19, 0, 2); P.crate(M, 20, -6, 0, 1.3); P.crate(M, 21.4, -6.2, 0, 1.0); P.barrel(M, 12, -16); P.barrel(M, 12.8, -16.5); P.barrel(M, 44.5, -24.5); P.crate(M, 28, -24.5, 0, 1.1);
      P.stripe(M, 10.5, -14.1, 21.5, -13.9, 0); P.cables(M, [[12, -20], [16, -17], [21, -16]], 0); P.cables(M, [[27, -17], [31, -20], [36, -22]], 0);
      P.pipeRun(M, 'z', 46, -26, -16, 3.3, 0.1, -0.3);
      M.builder('grate').box({ x: 14, y: 0.002, z: -10 }, { x: 18, y: 0.01, z: -9 }, { uvScale: 1, faces: { ny: false } }); // drain grate

      // ================= LEFT WALKWAY (LF): mirror of the right one, south and west of the yard =================
      M.chunk = 'LF';
      M.floor(10, -2, 26, 30, 0, 'ground'); M.floor(26, 16, 46, 26, 0, 'ground');
      M.wallZ(30, 10, 26, 0, 7, 'stone', [M.win('W_LF1', 'LF', 'S', 30, 13, 15), M.win('W_LF2', 'LF', 'S', 30, 21, 23)]);
      M.wallZ(26, 26, 46, 0, 7, 'stone', [M.win('W_LF3', 'LF', 'S', 26, 39, 41)]);
      M.wallX(26, 26, 30, 0, 7, 'stone');
      M.wallX(46, 16, 26, 0, 7, 'stone');
      M.wallX(10, -2, 30, 0, 7, 'concrete', [M.door('PD_L', 0, ['LF', 'CY'], 4, 8, 'Power door', { power: true }), M.door('D_LAB', 1000, ['LF', 'LAB'], 18, 21, 'Door')]);
      M.deck(22, -2, 26, 30, 3.5, 'grate'); P.railing(M, 'x', 22, -2, 30, 3.5); P.railing(M, 'x', 26, -2, 30, 3.5);
      for (const z of [1, 9, 17, 26]) { P.ibeam(M, 22.2, z, 0, 3.2, 0.4, 'x'); P.ibeam(M, 25.75, z, 0.8, 3.2, 0.3, 'x'); }
      P.chalk(M, 'ak74u', 32, 0, 25.78, 'N', 'AK74u', 1200);
      P.sign(M, 'sign_tier', ['TIERVERSUCHE'], 10.25, 3.3, 19.5, 'E', 3.4, 1.1, '#202020', '#d8d0bd', { size: 36 });
      P.facade(M, 'z', 10, -2, 30, 0, 7, 'E', { first: 4.2, lit: 0.3, seed: 22, roof: false });
      P.facade(M, 'x', 26, 26, 46, 0, 7, 'N', { first: 3.6, lit: 0.35, seed: 25, roof: false });
      P.facade(M, 'x', 30, 10, 26, 0, 7, 'N', { first: 4.2, lit: 0.3, seed: 29, roof: false, pipe: false });
      P.windows(M, 'x', -2, 11, 21, 4.2, 2.0, 'S', { lit: 0.3, seed: 26 });
      P.wallLamp(M, 10.2, 3.6, 1, 'E'); P.wallLamp(M, 10.2, 3.6, 15.5, 'E'); P.lampPost(M, 18, 12, 0, 4.4, 'W'); P.lampPost(M, 36, 24.2, 0, 4.4, 'N'); P.wallLamp(M, 45.8, 3.4, 21, 'W');
      P.sandbags(M, 'x', 28.9, 16, 19, 0, 2); P.barrel(M, 12, 11); P.barrel(M, 12.8, 11.4); P.crate(M, 20, 27, 0, 1.2); P.cabinet(M, 24, 2, 0, 'W'); P.barrel(M, 44.5, 24.5); P.crate(M, 28, 24.5, 0, 1.1);
      P.stripe(M, 10.5, 9.9, 21.5, 10.1, 0); P.cables(M, [[12, 24], [16, 20], [21, 18]], 0); P.cables(M, [[27, 17], [31, 20], [36, 22]], 0);
      P.pipeRun(M, 'z', 46, 16, 26, 3.3, 0.1, -0.3);
      M.builder('grate').box({ x: 14, y: 0.002, z: 13 }, { x: 18, y: 0.01, z: 14 }, { uvScale: 1, faces: { ny: false } });

      // ================= AUTO GARAGE (GAR) + RIGHT BALCONY =================
      M.chunk = 'GAR';
      M.floor(-14, -40, 10, -18, 0, 'floor'); P.roof(M, -14, -40, 10, -18, 8, { skylights: true });
      M.wallZ(-40, -14, 10, 0, 8, 'brick', [M.win('W_G1', 'GAR', 'N', -40, -8, -6), M.win('W_G2', 'GAR', 'N', -40, 2, 4)]);
      M.wallX(10, -40, -30, 0, 8, 'concrete', [M.win('W_G3', 'GAR', 'E', 10, -36, -34)]);
      M.wallX(-14, -40, -18, 0, 8, 'concrete', [M.door('D_TB', 1250, ['GAR', 'TB'], -24, -20, 'Door', { base: 3.5 })]);
      M.wallZ(-18, -14, 10, 0, 8, 'brick', [{ a: -4, b: 0, y0: 3.5, y1: 6.5 }]); // bridge opening / balcony drop
      M.deck(-14, -26, 10, -18, 3.5, 'grate');
      for (const x of [-10, -4, 2]) P.ibeam(M, x, -25.6, 0, 3.2, 0.4, 'z');
      P.railing(M, 'x', -26, -14, 6, 3.5);
      M.stairs(6, 10, -34, -26, 0, 3.5);
      M.wallX(6, -34, -26, 0, 4.6, 'concrete');
      M.wallZ(-26, 6, 10, 3.5, 6.5, 'concrete', [M.door('D_RB', 1250, ['GAR', 'GAR'], 6, 10, 'Debris', { base: 3.5 })]);
      P.furnace(M, 9.2, 0, -30, 'W');
      P.chalk(M, 'thompson', -2, 0, -39.78, 'S', 'THOMPSON', 1250);
      M.boxSpot('B_GAR', 'GAR', 5, 0, -30);
      for (const x of [-11, 7]) P.ibeam(M, x, -39.7, 0, 8, 0.5, 'z');
      P.ibeam(M, 9.7, -30.5, 0, 8, 0.5, 'x'); P.ibeam(M, -13.7, -30, 0, 8, 0.5, 'x');
      P.wallQuad(M, 'corrugated', 7.2, 0, -39.78, 'S', 4.6, 4.4, '', 0.02, [0.45, 0.47, 0.5, 1]); // closed roller door
      P.hangingLamp(M, -6, 7.4, -30, 14); P.hangingLamp(M, 4, 7.4, -36, 13); P.hangingLamp(M, -8, 7.4, -22, 12); P.hangingLamp(M, 0, 5.2, -22, 10); P.hangingLamp(M, -10, 7.4, -37, 12); P.hangingLamp(M, 3, 3.1, -21, 8);
      P.wallLamp(M, -13.8, 3.0, -36, 'E', ORANGE, 8); P.wallLamp(M, 9.8, 6.0, -22, 'W');
      P.truck(M, -9, 0, -34.5, 'E');
      P.shelf(M, -13.6, -28, 0, 'E'); P.shelf(M, -13.6, -24.5, 0, 'E');
      P.barrel(M, -12.5, -20); P.barrel(M, -11.8, -20.6); P.crate(M, 2, -38, 0, 1.0); P.barrel(M, 1.5, -36.6);
      P.pipeRun(M, 'z', -14, -40, -18, 2.4, 0.12, 0.35); P.pipeRun(M, 'x', -40, -14, 10, 6.8, 0.14, 0.4);
      P.sign(M, 'sign_gar', ['WERKSTATT'], -2, 5.5, -39.75, 'S', 4, 1.0);
      P.cables(M, [[-4, -37], [-1, -33], [3, -31.5]], 0); P.stripe(M, -13.5, -27.1, 5.5, -26.9, 0);

      // ================= TELEPORTER B — CHEMICAL LAB (TB, upstairs) =================
      M.chunk = 'TB';
      M.deck(-36, -40, -14, -18, 3.5, 'floor'); P.roof(M, -36, -40, -14, -18, 8, { skylights: true, floorY: 3.5 });
      M.wallZ(-40, -36, -14, 3.5, 8, 'hex', [M.win('W_TB1', 'TB', 'N', -40, -30, -28, 3.5), M.win('W_TB2', 'TB', 'N', -40, -20, -18, 3.5)]);
      M.wallX(-36, -40, -18, 3.5, 8, 'hex');
      M.wallZ(-18, -36, -14, 3.5, 8, 'hex');
      P.teleporter(M, 'B', -25, 3.5, -28, 'E');
      P.sign(M, 'sign_tpB', ['TELEPORTER B'], -25, 6.1, -39.75, 'S', 4, 1.0);
      P.sign(M, 'sign_zb', ['Z-B'], -14.3, 6.6, -22, 'W', 2.2, 0.9);
      P.chalk(M, 'mp5k', -32, 3.5, -39.78, 'S', 'MP5K', 1000);
      M.boxSpot('B_TB', 'TB', -20, 3.5, -36);
      P.trap(M, 'T_B', { x: -14.6, y: 3.5, z: -24 }, { x: -13.4, y: 6.0, z: -20 }, -13.7, 3.5, -18.8, 'E');
      P.desk(M, -32, -22, 3.5); P.desk(M, -32, -20.5, 3.5); P.cabinet(M, -35.5, -30, 3.5, 'E'); P.cabinet(M, -35.5, -29.3, 3.5, 'E');
      P.cage(M, -35.7, -36, -34.2, -32, 3.5, 1.6); P.shelf(M, -20, -18.7, 3.5, 'N'); P.shelf(M, -30, -18.7, 3.5, 'N');
      P.hangingLamp(M, -25, 7.4, -30, 13); P.hangingLamp(M, -32, 7.4, -22, 10); P.hangingLamp(M, -18, 7.4, -36, 10);
      P.wallLamp(M, -35.8, 6.2, -24, 'E', COOL, 8);
      P.pipeRun(M, 'x', -40, -36, -14, 6.5, 0.12, 0.4); P.pipeRun(M, 'z', -36, -40, -18, 5.5, 0.1, 0.3);

      // ================= COURTYARD (CY) =================
      M.chunk = 'CY';
      M.floor(-14, -18, 10, 14, 0, 'ground');
      M.wallX(-14, -18, 14, 0, 10, 'stone', [M.door('D_TC', 1250, ['CY', 'TC'], -6, -2, 'Door')]);
      P.facade(M, 'z', -14, -18, 14, 0, 10, 'E', { first: 3.8, lit: 0.45, seed: 31, roof: false, pipe: false });
      P.sign(M, 'sign_7c', ['7-C'], -13.75, 3.4, -4, 'E', 2.0, 0.9);
      P.wallLamp(M, -13.8, 3.0, -7.2, 'E'); P.wallLamp(M, -13.8, 3.0, -0.8, 'E');
      M.floor(-13.8, -7, -11, -1, 0.22, 'concrete'); // step up to the 7-C door
      P.windows(M, 'x', -18, -13, -5, 3.6, 2.0, 'S', { lit: 0.5, seed: 32 }); P.windows(M, 'x', -18, 1, 9.5, 3.6, 2.0, 'S', { lit: 0.5, seed: 33 });
      P.windows(M, 'x', 14, -13, -5, 3.6, 2.0, 'N', { lit: 0.4, seed: 34 }); P.windows(M, 'x', 14, 1, 9.5, 3.6, 2.0, 'N', { lit: 0.4, seed: 35 });
      P.facade(M, 'z', 10, -18, 14, 0, 7, 'W', { first: 3.8, lit: 0.3, seed: 36, pipe: false, roof: false });
      P.generator(M, -10, -16, -4, -12);
      P.fence(M, 'x', -11.5, -10.5, -3.5, 0, 2.4, true);
      P.powerSwitch(M, -7, 0, -17.9, 'S');
      M.boxSpot('B_CY', 'CY', -7, 0, -9);
      M.perk('double_tap', 4, 0, -17.25, 'S');
      M.perk('juggernog', -13.25, 0, -12, 'E');
      M.perk('speed_cola', 9.25, 0, 12, 'W');
      P.chalk(M, 'galil', -13.78, 0, 6, 'E', 'GALIL', 1500);
      P.chalk(M, 'claymore', 9.78, 0, -4, 'W', 'CLAYMORES', 1000);
      M.riser('CY', -8, -4); M.riser('CY', 5, -8); M.riser('CY', -9, 8); M.riser('CY', 4, 10);
      for (const [lx, lz, f] of [[-12, -2, 'E'], [8, 0, 'W'], [-12, 12, 'E'], [-6, 13, 'N']]) P.lampPost(M, lx, lz, 0, 4.5, f);
      P.crate(M, 6, 4, 0, 1.2); P.crate(M, 7.3, 4.4, 0, 0.9); P.barrel(M, -12, 2); P.barrel(M, -11.3, 2.6);
      P.sandbags(M, 'x', 12.6, -11.5, -7.5, 0); P.sandbags(M, 'z', -13.3, 8.5, 11.5, 0); P.sandbags(M, 'x', -17.3, 6, 8.5, 0, 2);
      P.stripe(M, -3.9, -17.5, -3.7, 13.5, 0); P.stripe(M, -0.3, -17.5, -0.1, 13.5, 0);
      P.cables(M, [[-8, -11.6], [-8.5, -6], [-12, -3]], 0); P.cables(M, [[-4, -14], [2, -13], [6, -16]], 0);
      // bridge (lowers with power): steel grating deck + railings, dynamic
      M.bridge = { x0: -4, x1: 0, z0: -18, z1: 14, y: 3.5, lowered: false, mesh: null };
      M.floors.push({ x0: -4, z0: -18, x1: 0, z1: 14, y: 3.5, bridge: true });
      for (const [x, tag] of [[-4, 'bridge'], [0, 'bridge']]) M.colliders.push({ min: { x: x - 0.08, y: 3.5, z: -18 }, max: { x: x + 0.08, y: 4.6, z: 14 }, tag });
      {
        const mb = M.bridge.mesh = new ZM.MeshBuilder();
        mb.box({ x: -4, y: 3.2, z: -18 }, { x: 0, y: 3.5, z: 14 }, { uvScale: 2, color: [0.45, 0.46, 0.5, 1] });
        for (const x of [-4, 0]) {
          mb.box({ x: x - 0.1, y: 3.1, z: -18 }, { x: x + 0.1, y: 3.5, z: 14 }, { color: [0.35, 0.36, 0.4, 1] });
          for (let z = -18; z <= 14; z += 2) mb.box({ x: x - 0.04, y: 3.5, z: z - 0.04 }, { x: x + 0.04, y: 4.6, z: z + 0.04 }, { color: [0.35, 0.35, 0.38, 1] });
          mb.box({ x: x - 0.03, y: 4.5, z: -18 }, { x: x + 0.03, y: 4.58, z: 14 }, { color: [0.4, 0.4, 0.44, 1] });
          mb.box({ x: x - 0.03, y: 3.95, z: -18 }, { x: x + 0.03, y: 4.02, z: 14 }, { color: [0.4, 0.4, 0.44, 1] });
        }
      }
      for (const z of [-10, 0, 8]) P.ibeam(M, -2, z, 0, 3.1, 0.5, 'z');
      P.smokestack(M, -58, -40, 0, 2.6, 28);
      P.building(M, -30, -60, 10, -42, 0, 14, { faces: ['S'], lit: 0.3, stack: 12 });
      P.building(M, -30, 38, 10, 56, 0, 12, { faces: ['N'], lit: 0.3 });

      // ================= ANIMAL TESTING LAB (LAB) + LEFT BALCONY =================
      M.chunk = 'LAB';
      M.floor(-14, 14, 10, 36, 0, 'floor'); P.roof(M, -14, 14, 10, 36, 8, { skylights: true });
      M.wallZ(14, -14, 10, 0, 8, 'brick', [{ a: -4, b: 0, y0: 3.5, y1: 6.5 }]);
      M.wallZ(36, -14, 10, 0, 8, 'concrete', [M.win('W_L1', 'LAB', 'S', 36, -8, -6), M.win('W_L2', 'LAB', 'S', 36, 2, 4)]);
      M.wallX(10, 30, 36, 0, 8, 'concrete', [M.win('W_L3', 'LAB', 'E', 10, 32, 34)]);
      M.wallX(-14, 14, 36, 0, 8, 'concrete', [M.door('D_TA', 1250, ['LAB', 'TA'], 24, 28, 'Door')]);
      M.deck(-14, 14, 10, 22, 3.5, 'grate');
      for (const x of [-10, -4, 2]) P.ibeam(M, x, 21.6, 0, 3.2, 0.4, 'z');
      P.railing(M, 'x', 22, -14, 6, 3.5);
      M.stairs(6, 10, 22, 30, 3.5, 0);
      M.wallX(6, 22, 30, 0, 4.6, 'concrete');
      M.wallZ(22, 6, 10, 3.5, 6.5, 'concrete', [M.door('D_LB', 1250, ['LAB', 'LAB'], 6, 10, 'Debris', { base: 3.5 })]);
      P.chalk(M, 'stakeout', -2, 0, 35.78, 'N', 'STAKEOUT', 1500);
      M.boxSpot('B_LAB', 'LAB', -8, 0, 30);
      for (let i = 0; i < 3; i++) P.cage(M, -13.6, 30 + i * 1.9, -11.6, 31.6 + i * 1.9, 0, 1.8);
      P.cage(M, 5, 33.5, 8.5, 35.4, 0, 1.6); P.cage(M, -13.6, 24, -11.9, 25.6, 0, 1.6);
      P.desk(M, 2, 26); P.desk(M, 2, 24.5); P.cabinet(M, 9.4, 24, 0, 'W'); P.cabinet(M, 9.4, 24.7, 0, 'W');
      P.shelf(M, -4.8, 35.3, 0, 'N', 2.0, 2.0); P.shelf(M, 0.8, 35.3, 0, 'N', 2.0, 2.0);
      P.trap(M, 'T_A', { x: -14.6, y: 0, z: 24 }, { x: -13.4, y: 2.6, z: 28 }, -13.7, 0, 29.2, 'E');
      P.windows(M, 'x', 36, -12, 8, 3.4, 2.0, 'N', { lit: 0.15, seed: 41 });
      for (const z of [20, 28]) { P.ibeam(M, -13.7, z, 0, 8, 0.5, 'x'); }
      P.ibeam(M, 9.7, 28.5, 0, 8, 0.5, 'x');
      P.hangingLamp(M, -6, 7.4, 30, 13); P.hangingLamp(M, 4, 7.4, 32, 12); P.hangingLamp(M, -6, 7.4, 18, 10); P.hangingLamp(M, 0, 5.2, 26, 10);
      P.wallLamp(M, 9.8, 6.0, 18, 'W'); P.wallLamp(M, -13.8, 3.2, 34.5, 'E', COOL, 8);
      P.pipeRun(M, 'z', 10, 22, 36, 2.6, 0.12, -0.35); P.pipeRun(M, 'x', 36, -14, 10, 6.8, 0.14, -0.4);
      P.sign(M, 'sign_lab', ['TIERVERSUCHE'], -2, 5.5, 35.75, 'N', 4, 1.0);
      P.stripe(M, -13.5, 22.9, 5.5, 23.1, 0);

      // ================= TELEPORTER A — GENERATOR ROOM (TA) =================
      M.chunk = 'TA';
      M.floor(-36, 14, -14, 36, 0, 'floor'); P.roof(M, -36, 14, -14, 36, 6, { depth: 0.8 });
      M.wallX(-36, 14, 36, 0, 6, 'concrete', [M.win('W_TA1', 'TA', 'W', -36, 20, 22)]);
      M.wallZ(36, -36, -14, 0, 6, 'hex', [M.win('W_TA2', 'TA', 'S', 36, -30, -28)]);
      M.wallZ(14, -36, -14, 0, 6, 'brick');
      P.teleporter(M, 'A', -25, 0, 26, 'E');
      P.sign(M, 'sign_tpA', ['TELEPORTER A'], -25, 3.6, 35.75, 'N', 4, 1.0);
      P.sign(M, 'sign_za', ['Z-A'], -14.3, 4.2, 26, 'W', 2.2, 0.9);
      P.chalk(M, 'mp40', -35.78, 0, 30, 'E', 'MP40', 1000);
      M.boxSpot('B_TA', 'TA', -30, 0, 18);
      P.furnace(M, -20, 0, 35.2, 'N');
      P.generator(M, -34, 15, -30, 18);
      P.ibeam(M, -35.7, 25, 0, 6, 0.5, 'x'); P.ibeam(M, -14.3, 20, 0, 6, 0.5, 'x'); P.ibeam(M, -14.3, 32, 0, 6, 0.5, 'x');
      P.hangingLamp(M, -25, 5.4, 20, 11); P.hangingLamp(M, -32, 5.4, 32, 10); P.hangingLamp(M, -17, 5.4, 20, 10); P.hangingLamp(M, -19, 5.4, 29, 10); P.wallLamp(M, -35.8, 4.0, 18, 'E');
      P.wallLamp(M, -14.2, 4.0, 30, 'W', ORANGE, 7);
      P.barrel(M, -16, 16); P.barrel(M, -16.8, 16.5); P.crate(M, -33, 33, 0, 1.1); P.shelf(M, -24, 14.7, 0, 'S'); P.shelf(M, -30, 14.7, 0, 'S');
      P.pipeRun(M, 'z', -36, 14, 36, 4.6, 0.12, 0.35); P.pipeRun(M, 'x', 14, -36, -14, 4.0, 0.16, 0.4); P.pipeRun(M, 'x', 14, -36, -14, 4.5, 0.12, 0.4);
      P.cables(M, [[-30, 18.5], [-27, 22], [-26, 24]], 0);

      // ================= TELEPORTER C — MAIN FACTORY HALL (TC) =================
      M.chunk = 'TC';
      M.floor(-50, -18, -14, 14, 0, 'floor'); P.roof(M, -50, -18, -14, 14, 10, { skylights: true, depth: 1.3 });
      M.wallZ(-18, -50, -14, 0, 10, 'brick', [M.win('W_TC1', 'TC', 'N', -18, -30, -28), M.win('W_TC2', 'TC', 'N', -18, -46, -44, 3.5)]);
      M.wallZ(14, -50, -14, 0, 10, 'brick', [{ a: -48, b: -42, y0: 0, y1: 3.2 }]);
      M.wallX(-50, -18, -8, 0, 10, 'brick');
      M.wallX(-50, -8, 14, 0, 10, 'hex', [M.win('W_TC3', 'TC', 'W', -50, 4, 6)]);
      M.wallX(-38, -8, 14, 0, 10, 'hex', [{ a: -4, b: 0, y0: 0, y1: 3.2 }]); // alcove partition
      P.sign(M, 'sign_zc', ['Z-C'], -37.75, 3.4, -2, 'E', 2.2, 0.9);
      P.arch(M, 'x', -38, -4, 0, 2.6, 0.6, 'girder');
      // office (upstairs, north-west) + catwalk along the north wall + stairs at the east end
      M.deck(-50, -18, -36, -8, 3.5, 'floor');
      P.railing(M, 'x', -8, -50, -36, 3.5);
      P.railing(M, 'z', -36, -14, -8, 3.5);
      M.builder('winDark').box({ x: -50, y: 4.6, z: -8.1 }, { x: -36, y: 6.6, z: -7.9 }, { uvScale: 2 }); // office window band
      M.builder('winDark').box({ x: -36.1, y: 4.6, z: -18 }, { x: -35.9, y: 6.6, z: -8 }, { uvScale: 2 });
      M.builder('girder').box({ x: -50, y: 6.6, z: -8.2 }, { x: -36, y: 6.8, z: -7.8 }, { uvScale: 0.5, color: STEEL }); M.builder('girder').box({ x: -36.2, y: 6.6, z: -18 }, { x: -35.8, y: 6.8, z: -8 }, { uvScale: 0.5, color: STEEL });
      M.builder('plaster').box({ x: -49.8, y: 3.5, z: -17.8 }, { x: -36.2, y: 3.5, z: -8.2 }, { uvScale: 2, faces: { py: true, nx: false, px: false, ny: false, nz: false, pz: false } });
      for (const x of [-48, -42, -37.5]) P.ibeam(M, x, -8.3, 0, 3.2, 0.4, 'z');
      M.deck(-36, -18, -14, -14, 3.5, 'grate');
      P.railing(M, 'x', -14, -36, -18, 3.5);
      for (const x of [-32, -26, -20]) P.ibeam(M, x, -14.4, 0, 3.2, 0.4, 'z');
      M.stairs(-18, -14, -6, -14, 0, 3.5);
      M.wallX(-18, -14, -6, 0, 4.6, 'concrete');
      P.teleporter(M, 'C', -44, 0, 2, 'E');
      P.sign(M, 'sign_tpC', ['TELEPORTER C'], -49.75, 3.6, 2, 'E', 4, 1.0);
      P.trap(M, 'T_C', { x: -38.6, y: 0, z: -4 }, { x: -37.4, y: 2.6, z: 0 }, -37.7, 0, 1.2, 'E');
      P.chalk(M, 'aug', -24, 0, 13.78, 'N', 'AUG', 1200);
      P.chalk(M, 'bowie', -34, 0, -17.78, 'S', 'BOWIE KNIFE', 3000);
      M.boxSpot('B_TC', 'TC', -33, 3.5, -16);
      M.riser('TC', -30, 6); M.riser('TC', -44, -12);
      for (const z of [-10, -2, 6]) P.ibeam(M, -26, z, 0, 10, 0.6, 'z');
      P.ibeam(M, -16, 4, 0, 10, 0.6, 'z'); P.ibeam(M, -16, 10, 0, 10, 0.6, 'z');
      P.ibeam(M, -32, 13.7, 0, 10, 0.5, 'z'); P.ibeam(M, -18, 13.7, 0, 10, 0.5, 'z');
      P.desk(M, -44, -14, 3.5); P.desk(M, -44, -12.5, 3.5); P.cabinet(M, -49.5, -16, 3.5, 'E'); P.cabinet(M, -49.5, -15.3, 3.5, 'E'); P.cabinet(M, -49.5, -14.6, 3.5, 'E');
      P.sign(M, 'sign_office', ['DR. MAXIS'], -43, 5.3, -17.75, 'S', 2.6, 0.8, '#2a2010', '#e8d8b0');
      P.wallLamp(M, -49.8, 5.8, -12, 'E', WARM, 8);
      P.crate(M, -22, 8, 0, 1.3); P.crate(M, -20.6, 8.3, 0, 1.0); P.barrel(M, -16, -16); P.barrel(M, -16.7, -16.6); P.barrel(M, -47, 12);
      P.shelf(M, -22, 13.3, 0, 'N'); P.shelf(M, -30, 13.3, 0, 'N'); P.shelf(M, -49.3, -3, 0, 'E');
      P.hangingLamp(M, -26, 9.4, 0, 16); P.hangingLamp(M, -40, 9.4, -12, 14); P.hangingLamp(M, -34, 9.4, 0, 14); P.hangingLamp(M, -46, 9.4, -4, 12); P.hangingLamp(M, -20, 9.4, 6, 13); P.hangingLamp(M, -20, 9.4, -12, 13); P.hangingLamp(M, -30, 9.4, 10, 13); P.hangingLamp(M, -44, 6.4, 6, 11, COOL);
      P.wallLamp(M, -14.2, 3.2, 0, 'W'); P.wallLamp(M, -37.8, 6.0, 8, 'E', COOL, 8);
      P.pipeRun(M, 'x', 14, -40, -14, 5.0, 0.14, -0.4); P.pipeRun(M, 'z', -50, -8, 14, 6.0, 0.14, 0.4); P.pipeRun(M, 'x', -18, -36, -14, 8.5, 0.16, 0.4);
      P.stripe(M, -35.5, -7.1, -14.5, -6.9, 0); P.cables(M, [[-41.5, 0.5], [-38.5, -1.8], [-33, -3], [-27, -1]], 0);
      // trench / cave south of the alcove: brick tunnel with orange lamps
      M.floor(-50, 14, -40, 30, 0, 'dirt');
      M.wallX(-50, 14, 30, 0, 4, 'brick'); M.wallX(-40, 14, 30, 0, 4, 'brick');
      M.wallZ(30, -50, -40, 0, 4, 'brick', [M.win('W_TR', 'TC', 'S', 30, -46, -44)]);
      M.ceiling(-50, 14.2, -40, 30, 3.7, 'brick');
      P.arch(M, 'x', 14, -48, -42, 2.2, 0.6, 'brick');
      M.riser('TC', -45, 22);
      P.wallLamp(M, -49.7, 3.0, 19, 'E', ORANGE, 8); P.wallLamp(M, -40.3, 3.0, 25, 'W', ORANGE, 8);
      P.pipeRun(M, 'z', -50, 14, 30, 3.2, 0.1, 0.3);
      P.smokestack(M, -58, 20, 0, 2.4, 24);

      this._validate();
    }

    _validate() {
      for (const d of this.doors) if (!d.min) throw new Error('door ' + d.id + ' not placed in a wall');
      for (const w of this.windows) if (!w.hole) throw new Error('window ' + w.id + ' not placed in a wall');
      if (!this.gate.min) throw new Error('gate not placed');
      if (!this.power || !this.pap || !this.mainframe) throw new Error('machines missing');
      if (this.teleporters.length !== 3 || this.traps.length !== 3) throw new Error('teleporters/traps missing');
    }

    // Bake static lighting into the vertex colours of every lit builder: per-zone ambient (hemispheric),
    // moonlight for outdoor zones, and every lamp registered in the zone a vertex faces into.
    _bake() {
      const OUT = [0.11, 0.12, 0.17], IN = [0.075, 0.077, 0.09], MOON = [0.24, 0.27, 0.4];
      const md = ZM.V.norm({ x: 0.3, y: 1, z: 0.25 });
      const byZone = {};
      for (const l of this.lights) for (const z of (l.zones || [l.zone])) (byZone[z] || (byZone[z] = [])).push(l);
      for (const k in this.builders) {
        const b = this.builders[k];
        if (b.variant) continue;
        b.bake((x, y, z, nx, ny, nz) => {
          const zid = this.zoneAt(x + nx * 0.35, z + nz * 0.35) || this.zoneAt(x, z);
          const zn = zid && this.zones[zid];
          const outdoor = !zn || zn.outdoor;
          const amb = outdoor ? OUT : IN, hemi = 0.72 + 0.28 * ny;
          let r = amb[0] * hemi, g = amb[1] * hemi, bl = amb[2] * hemi;
          if (outdoor) { const d = Math.max(nx * md.x + ny * md.y + nz * md.z, 0) * 0.85 + 0.15 * Math.max(ny, 0); r += MOON[0] * d; g += MOON[1] * d; bl += MOON[2] * d; }
          const ls = (zid && byZone[zid]) || [];
          for (let i = 0; i < ls.length; i++) {
            const l = ls[i], dx = l.pos.x - x, dy = l.pos.y - y, dz = l.pos.z - z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist >= l.range) continue;
            let att = 1 - dist / l.range; att *= att;
            const nd = Math.max((nx * dx + ny * dy + nz * dz) / Math.max(dist, 0.001), 0) * 0.8 + 0.2;
            r += l.color[0] * att * nd; g += l.color[1] * att * nd; bl += l.color[2] * att * nd;
          }
          return [r, g, bl];
        });
      }
    }

    // ----- dynamic state -----
    setBridge(lowered) { this.bridge.lowered = lowered; }

    // ----- queries --------------------------------------------------------------
    floorHeight(x, z, yRef = 1000, step = 0.75) {
      let best = -Infinity, lowest = Infinity;
      for (const f of this.floors) {
        if (f.bridge && !this.bridge.lowered) continue;
        if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) {
          if (f.y <= yRef + step && f.y > best) best = f.y;
          if (f.y < lowest) lowest = f.y;
        }
      }
      for (const r of this.ramps) {
        if (x >= r.x0 && x <= r.x1 && z >= r.zA && z <= r.zB) {
          const t = (z - r.zA) / (r.zB - r.zA);
          const y = r.yA + (r.yB - r.yA) * t;
          if (y <= yRef + step && y > best) best = y;
          if (y < lowest) lowest = y;
        }
      }
      if (best === -Infinity) return lowest === Infinity ? null : lowest;
      return best;
    }
    // All floor heights at (x,z), ascending; heights closer than 0.9 m merge keeping the higher (ramps off floors).
    // Ramps and `solid` floors (the mainframe platform) are solid underneath: a lower floor less than HEADROOM
    // below one of them is dropped (you can still walk under the high end of a tall staircase).
    floorHeightsAt(x, z) {
      const out = [], solids = [];
      for (const f of this.floors) { if (f.bridge && !this.bridge.lowered) continue; if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) { out.push(f.y); if (f.solid) solids.push(f.y); } }
      for (const r of this.ramps) if (x >= r.x0 && x <= r.x1 && z >= r.zA && z <= r.zB) { const t = (z - r.zA) / (r.zB - r.zA), y = r.yA + (r.yB - r.yA) * t; out.push(y); solids.push(y); }
      out.sort((p, q) => p - q);
      const res = [];
      for (const y of out) {
        if (solids.some(s => y < s - 0.05 && s - y < HEADROOM)) continue;
        if (!res.length || y - res[res.length - 1] > 0.9) res.push(y); else res[res.length - 1] = y;
      }
      return res;
    }
    zoneAt(x, z) {
      for (const id in this.zones) for (const r of this.zones[id].rects) if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return id;
      return null;
    }
    isColliderActive(c) {
      if (c.tag === 'door') { const d = this.doors.find(dd => dd.id === c.id); return !(d && d.open); }
      if (c.tag === 'gate') return !this.gate.open;
      if (c.tag === 'bridge') return this.bridge.lowered;
      return true;
    }
    resolveCircle(x, z, r, y0, y1, opts = {}) {
      for (let iter = 0; iter < 3; iter++) {
        let moved = false;
        for (const c of this.colliders) {
          if (!this.isColliderActive(c)) continue;
          if (opts.skipWindows && c.tag === 'window') continue;
          if (c.max.y <= y0 || c.min.y >= y1) continue;
          const cx = ZM.U.clamp(x, c.min.x, c.max.x), cz = ZM.U.clamp(z, c.min.z, c.max.z);
          const dx = x - cx, dz = z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-9) {
            const px = Math.min(x - c.min.x, c.max.x - x), pz = Math.min(z - c.min.z, c.max.z - z);
            if (px < pz) x += (x - (c.min.x + c.max.x) / 2 < 0 ? -1 : 1) * (px + r);
            else z += (z - (c.min.z + c.max.z) / 2 < 0 ? -1 : 1) * (pz + r);
          } else {
            const d = Math.sqrt(d2), push = (r - d) / d;
            x += dx * push; z += dz * push;
          }
          moved = true;
        }
        if (!moved) break;
      }
      return { x, z };
    }
    raycast(ro, rd, maxDist, opts = {}) {
      let best = -1, hit = null;
      for (const c of this.colliders) {
        if (!this.isColliderActive(c)) continue;
        if ((opts.skipWindows || opts.ignoreBoards) && c.tag === 'window') continue;
        const t = ZM.U.rayAABB(ro, rd, c.min, c.max);
        if (t >= 0 && t <= maxDist && (best < 0 || t < best)) { best = t; hit = c; }
      }
      if (opts.floors) {
        for (const f of this.floors) {
          if (f.bridge && !this.bridge.lowered) continue;
          if (Math.abs(rd.y) < 1e-6) continue;
          const t = (f.y - ro.y) / rd.y;
          if (t < 0 || t > maxDist) continue;
          const x = ro.x + rd.x * t, z = ro.z + rd.z * t;
          if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && (best < 0 || t < best)) { best = t; hit = f; }
        }
      }
      return { t: best, hit };
    }
    lineOfSight(a, b, opts) {
      const d = ZM.V.sub(b, a), len = ZM.V.len(d);
      if (len < 1e-6) return true;
      const r = this.raycast(a, ZM.V.scale(d, 1 / len), len, opts);
      return r.t < 0;
    }
  }
  ZM.GameMap = GameMap;
  ZM.MAP_CONST = { WALL_T, WIN_Y0, WIN_Y1, DOOR_H, BOARDS };
})();


// ===== 50_nav.js =====
// ---------------------------------------------------------------------------
// 50_nav.js — 0.5 m navigation grid with TWO floor layers per cell (for
// balconies/catwalks/bridges above ground floors) + Dijkstra flow fields.
// Node index = cell * 2 + layer. Hot paths are allocation-free: neighbour
// node indices are precomputed per node, the heap is typed-array based.
// ---------------------------------------------------------------------------
(function () {
  const CELL = 0.5;
  const LAYERS = 2;
  const MARGIN = 0.3;   // zombie radius for wall clearance
  const STEP = 0.7;     // max height difference between adjacent nodes
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
  const COST = [1, 1, 1, 1, 1.41421356, 1.41421356, 1.41421356, 1.41421356];

  class TypedHeap {
    constructor(cap) { this.keys = new Float64Array(cap); this.vals = new Int32Array(cap); this.n = 0; }
    clear() { this.n = 0; }
    push(k, v) {
      if (this.n >= this.keys.length) {
        const nk = new Float64Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk;
        const nv = new Int32Array(this.vals.length * 2); nv.set(this.vals); this.vals = nv;
      }
      const keys = this.keys, vals = this.vals;
      let i = this.n++;
      while (i > 0) { const p = (i - 1) >> 1; if (keys[p] <= k) break; keys[i] = keys[p]; vals[i] = vals[p]; i = p; }
      keys[i] = k; vals[i] = v;
    }
    pop() {
      const keys = this.keys, vals = this.vals;
      const topV = vals[0];
      const n = --this.n;
      if (n > 0) {
        const k = keys[n], v = vals[n];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1; if (l >= n) break;
          const r = l + 1;
          const m = (r < n && keys[r] < keys[l]) ? r : l;
          if (keys[m] >= k) break;
          keys[i] = keys[m]; vals[i] = vals[m]; i = m;
        }
        keys[i] = k; vals[i] = v;
      }
      return topV;
    }
    get size() { return this.n; }
  }

  class NavGrid {
    constructor(map) {
      this.map = map;
      this.x0 = map.bounds.x0; this.z0 = map.bounds.z0;
      this.w = Math.ceil((map.bounds.x1 - map.bounds.x0) / CELL);
      this.h = Math.ceil((map.bounds.z1 - map.bounds.z0) / CELL);
      const n = this.w * this.h, N = n * LAYERS;
      this.cells = n; this.nodes = N;
      this.height = new Float32Array(N);
      this.hasFloor = new Uint8Array(N);
      this.blocked = new Uint8Array(N);
      this.walk = new Uint8Array(N);
      this.nbr = new Int32Array(N * 8);     // neighbour node per direction, -1 = none
      this.fields = {};                      // key -> {dist, target}
      this.heap = new TypedHeap(8192);
      this._chain = new Int32Array(32);
      this.dist = this._field('player').dist;
      this.rebuild();
    }
    // ----- indexing -----
    cellX(x) { return Math.floor((x - this.x0) / CELL); }
    cellZ(z) { return Math.floor((z - this.z0) / CELL); }
    cellOf(x, z) { const cx = this.cellX(x), cz = this.cellZ(z); if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1; return cz * this.w + cx; }
    // node in a cell whose floor is nearest to y (any layer with a floor); -1 if none
    nodeOf(x, z, y = 0) {
      const c = this.cellOf(x, z);
      if (c < 0) return -1;
      let best = -1, bd = Infinity;
      for (let l = 0; l < LAYERS; l++) {
        const nd = c * LAYERS + l;
        if (!this.hasFloor[nd]) continue;
        const d = Math.abs(this.height[nd] - y);
        if (d < bd) { bd = d; best = nd; }
      }
      return best;
    }
    center(node) {
      const c = Math.floor(node / LAYERS);
      return { x: this.x0 + (c % this.w + 0.5) * CELL, y: this.height[node], z: this.z0 + (Math.floor(c / this.w) + 0.5) * CELL };
    }
    _field(key) { if (!this.fields[key]) this.fields[key] = { dist: new Float64Array(this.nodes), target: null }; return this.fields[key]; }

    // ----- construction -----
    // Recompute floor layers from the map (call when floors change, e.g. the bridge lowers), then masks.
    rebuild() {
      this.hasFloor.fill(0); this.height.fill(0);
      for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
        const c = cz * this.w + cx;
        const x = this.x0 + (cx + 0.5) * CELL, z = this.z0 + (cz + 0.5) * CELL;
        const hs = this.map.floorHeightsAt(x, z);
        for (let l = 0; l < LAYERS && l < hs.length; l++) { this.hasFloor[c * LAYERS + l] = 1; this.height[c * LAYERS + l] = hs[l]; }
      }
      this.update();
    }
    // Rebuild the blocked mask + neighbour table from active colliders (call after doors open).
    update() {
      const L = LAYERS, w = this.w, h = this.h, H = this.height;
      this.blocked.fill(0);
      for (const c of this.map.colliders) {
        if (!this.map.isColliderActive(c)) continue;
        const cx0 = Math.max(0, this.cellX(c.min.x - MARGIN)), cx1 = Math.min(w - 1, this.cellX(c.max.x + MARGIN));
        const cz0 = Math.max(0, this.cellZ(c.min.z - MARGIN)), cz1 = Math.min(h - 1, this.cellZ(c.max.z + MARGIN));
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
          const cell = cz * w + cx;
          for (let l = 0; l < L; l++) {
            const nd = cell * L + l;
            if (!this.hasFloor[nd]) continue;
            const hh = H[nd];
            if (c.min.y < hh + 1.5 && c.max.y > hh + 0.2) this.blocked[nd] = 1;
          }
        }
      }
      const walk = this.walk, N = this.nodes;
      for (let i = 0; i < N; i++) walk[i] = this.hasFloor[i] && !this.blocked[i] ? 1 : 0;
      // neighbour table: for each node and direction, the adjacent cell's layer within STEP (nearest height)
      const nbr = this.nbr; nbr.fill(-1);
      const pick = (cx, cz, hi) => {
        if (cx < 0 || cz < 0 || cx >= w || cz >= h) return -1;
        const cell = cz * w + cx;
        let best = -1, bd = STEP + 1e-6;
        for (let l = 0; l < L; l++) { const nd = cell * L + l; if (!walk[nd]) continue; const d = Math.abs(H[nd] - hi); if (d < bd) { bd = d; best = nd; } }
        return best;
      };
      for (let cz = 0; cz < h; cz++) for (let cx = 0; cx < w; cx++) {
        const cell = cz * w + cx;
        for (let l = 0; l < L; l++) {
          const nd = cell * L + l;
          if (!walk[nd]) continue;
          const hi = H[nd];
          for (let d = 0; d < 8; d++) {
            const j = pick(cx + DX[d], cz + DZ[d], hi);
            if (j < 0) continue;
            if (d >= 4 && (pick(cx + DX[d], cz, hi) < 0 || pick(cx, cz + DZ[d], hi) < 0)) continue; // no corner cutting
            nbr[nd * 8 + d] = j;
          }
        }
      }
      for (const k in this.fields) this.fields[k].target = null; // force field recompute
    }

    // ----- queries -----
    isWalkable(x, z, y = 0) { const nd = this.nodeOf(x, z, y); return nd >= 0 && this.walk[nd] === 1; }
    // nearest walkable node to (x,z) with floor near y, searching `radius` metres around
    nearestWalkable(x, z, y = 0, radius = 1.5) {
      const direct = this.nodeOf(x, z, y);
      if (direct >= 0 && this.walk[direct] && Math.abs(this.height[direct] - y) <= 1.0) return direct;
      const r = Math.ceil(radius / CELL);
      const cx = this.cellX(x), cz = this.cellZ(z);
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        const cell = nz * this.w + nx;
        for (let l = 0; l < LAYERS; l++) {
          const nd = cell * LAYERS + l;
          if (!this.walk[nd]) continue;
          const d = dx * dx + dz * dz + Math.abs(this.height[nd] - y) * 6;
          if (d < bd) { bd = d; best = nd; }
        }
      }
      return best;
    }
    // Dijkstra from the target node; fills field.dist (Infinity = unreachable). No-op if the target node is unchanged.
    computeField(target, key = 'player') {
      const f = this._field(key);
      const ti = this.nearestWalkable(target.x, target.z, target.y || 0, 2.0);
      if (ti < 0) { f.target = null; return false; }
      if (f.target === ti) return true;
      f.target = ti;
      const dist = f.dist; dist.fill(Infinity);
      dist[ti] = 0;
      const heap = this.heap; heap.clear(); heap.push(0, ti);
      const nbr = this.nbr;
      while (heap.size) {
        const d = heap.keys[0];
        const i = heap.pop();
        if (d > dist[i]) continue;
        const base = i * 8;
        for (let k = 0; k < 8; k++) {
          const j = nbr[base + k];
          if (j < 0) continue;
          const nd = d + COST[k];
          if (nd < dist[j]) { dist[j] = nd; heap.push(nd, j); }
        }
      }
      return true;
    }
    distanceAt(x, z, y = 0, key = 'player') { const nd = this.nearestWalkable(x, z, y, 1.0); return nd < 0 ? Infinity : this._field(key).dist[nd]; }
    hasField(key = 'player') { return this._field(key).target !== null; }
    // Next point to walk toward (looks several nodes ahead when the straight line is clear).
    nextStep(pos, lookahead = 8, key = 'player') {
      const dist = this._field(key).dist;
      const start = this.nearestWalkable(pos.x, pos.z, pos.y || 0, 1.0);
      if (start < 0 || !isFinite(dist[start])) return null;
      let cur = start, len = 0;
      const chain = this._chain, nbr = this.nbr;
      for (let k = 0; k < lookahead && len < chain.length; k++) {
        let best = cur, bd = dist[cur];
        const base = cur * 8;
        for (let d = 0; d < 8; d++) { const j = nbr[base + d]; if (j >= 0 && dist[j] < bd) { bd = dist[j]; best = j; } }
        if (best === cur) break;
        chain[len++] = best; cur = best;
        if (dist[cur] === 0) break;
      }
      if (!len) return this.center(start);
      for (let k = len - 1; k >= 1; k--) {
        const c = this.center(chain[k]);
        if (this.walkableLine(pos, c)) return c;
      }
      return this.center(chain[0]);
    }
    // Straight line of walkable nodes between a and b, following the floor layer continuously.
    walkableLine(a, b) {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.ceil(len / 0.25));
      let ph = a.y || 0;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, x = a.x + dx * t, z = a.z + dz * t;
        const nd = this.nodeOf(x, z, ph);
        if (nd < 0 || !this.walk[nd]) return false;
        const hh = this.height[nd];
        if (Math.abs(hh - ph) > 0.4) return false;
        ph = hh;
      }
      return true;
    }
    // Random walkable (and reachable, if a field exists) node within [rmin, rmax] of pos (any layer).
    randomCellNear(pos, rmin, rmax, requireReachable = true, maxDistField = 40, key = 'player') {
      const dist = this._field(key).dist;
      for (let tries = 0; tries < 60; tries++) {
        const a = Math.random() * Math.PI * 2, r = rmin + Math.random() * (rmax - rmin);
        const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
        const c = this.cellOf(x, z);
        if (c < 0) continue;
        const l = Math.floor(Math.random() * LAYERS);
        const nd = c * LAYERS + l;
        if (!this.walk[nd]) continue;
        if (requireReachable && (!isFinite(dist[nd]) || dist[nd] > maxDistField)) continue;
        return this.center(nd);
      }
      return null;
    }
    // Reachability from a point: Uint8Array over nodes (tests / zone checks)
    reachableFrom(x, z, y = 0) {
      const s = this.nearestWalkable(x, z, y, 2);
      const seen = new Uint8Array(this.nodes);
      if (s < 0) return seen;
      const q = [s]; seen[s] = 1;
      while (q.length) {
        const i = q.pop(); const base = i * 8;
        for (let d = 0; d < 8; d++) { const j = this.nbr[base + d]; if (j >= 0 && !seen[j]) { seen[j] = 1; q.push(j); } }
      }
      return seen;
    }
  }
  NavGrid.CELL = CELL; NavGrid.LAYERS = LAYERS;
  ZM.NavGrid = NavGrid;
})();


// ===== 70_entities.js =====
// ---------------------------------------------------------------------------
// 70_entities.js — particles, zombies & hellhounds, power-ups, projectiles,
// claymores.
// ---------------------------------------------------------------------------
(function () {
  const V = ZM.V, U = ZM.U, M4 = ZM.M4;

  // ===================== PARTICLES =====================
  class Particles {
    constructor(game) { this.game = game; this.list = []; this.arcs = []; }
    add(p) { if (this.list.length < 3000) this.list.push(p); }
    blood(pos, n = 8, dir) {
      for (let i = 0; i < n; i++) {
        const v = { x: (Math.random() - 0.5) * 3, y: Math.random() * 2.5, z: (Math.random() - 0.5) * 3 };
        if (dir) { v.x += dir.x * 2; v.z += dir.z * 2; }
        this.add({ pos: V.copy(pos), vel: v, life: 0.5 + Math.random() * 0.4, max: 0.9, size: 0.08 + Math.random() * 0.12, color: [0.5, 0.02, 0.02, 1], gravity: 9, kind: 'blood' });
      }
    }
    impact(pos, dir) {
      for (let i = 0; i < 5; i++) this.add({ pos: V.copy(pos), vel: { x: -dir.x * 2 + (Math.random() - 0.5) * 3, y: Math.random() * 3, z: -dir.z * 2 + (Math.random() - 0.5) * 3 }, life: 0.25 + Math.random() * 0.2, max: 0.45, size: 0.05, color: [1, 0.8, 0.4, 1], gravity: 8, kind: 'spark' });
      this.add({ pos: V.copy(pos), vel: { x: 0, y: 0.4, z: 0 }, life: 0.6, max: 0.6, size: 0.3, grow: 0.8, color: [0.6, 0.6, 0.6, 0.5], gravity: 0, kind: 'smoke' });
    }
    tracer(a, b) { this.add({ pos: a, end: b, life: 0.05, max: 0.05, width: 0.03, color: [1, 0.9, 0.6, 0.8], kind: 'tracer' }); }
    arc(a, b, life = 0.3, color = [0.5, 0.8, 1]) { this.arcs.push({ a: V.copy(a), b: V.copy(b), life, max: life, color }); }
    smoke(pos, size = 0.4, life = 1.2, color = [0.5, 0.5, 0.5, 0.5]) { this.add({ pos: V.copy(pos), vel: { x: (Math.random() - 0.5) * 0.4, y: 0.6 + Math.random() * 0.5, z: (Math.random() - 0.5) * 0.4 }, life, max: life, size, grow: 1.2, color, gravity: 0, kind: 'smoke' }); }
    fire(pos) { this.add({ pos: { x: pos.x + (Math.random() - 0.5) * 0.4, y: pos.y + Math.random() * 0.4, z: pos.z + (Math.random() - 0.5) * 0.4 }, vel: { x: 0, y: 1.2, z: 0 }, life: 0.35, max: 0.35, size: 0.3, grow: -0.5, color: [1, 0.5, 0.1, 0.9], gravity: 0, kind: 'glow' }); }
    sparks(pos, n = 12, color = [1, 0.9, 0.5, 1]) { for (let i = 0; i < n; i++) this.add({ pos: V.copy(pos), vel: { x: (Math.random() - 0.5) * 6, y: Math.random() * 5, z: (Math.random() - 0.5) * 6 }, life: 0.3 + Math.random() * 0.4, max: 0.7, size: 0.06, color, gravity: 10, kind: 'spark' }); }
    explosion(pos, radius) {
      this.add({ pos: V.copy(pos), vel: { x: 0, y: 0, z: 0 }, life: 0.25, max: 0.25, size: radius * 0.8, grow: 6, color: [1, 0.7, 0.3, 1], gravity: 0, kind: 'glow' });
      for (let i = 0; i < 14; i++) this.smoke({ x: pos.x + (Math.random() - 0.5) * radius * 0.5, y: pos.y + Math.random() * 0.5, z: pos.z + (Math.random() - 0.5) * radius * 0.5 }, 0.6 + Math.random() * 0.6, 1.2 + Math.random(), [0.25, 0.22, 0.2, 0.7]);
      this.sparks(pos, 30, [1, 0.6, 0.2, 1]);
    }
    dust(pos, n = 10) { for (let i = 0; i < n; i++) this.add({ pos: { x: pos.x + (Math.random() - 0.5) * 0.8, y: pos.y + 0.05, z: pos.z + (Math.random() - 0.5) * 0.8 }, vel: { x: (Math.random() - 0.5) * 1.2, y: 0.5 + Math.random(), z: (Math.random() - 0.5) * 1.2 }, life: 0.8 + Math.random() * 0.5, max: 1.3, size: 0.3, grow: 0.6, color: [0.45, 0.38, 0.3, 0.6], gravity: 0.5, kind: 'smoke' }); }
    lightningStrike(pos) {
      const top = { x: pos.x + (Math.random() - 0.5) * 3, y: pos.y + 14, z: pos.z + (Math.random() - 0.5) * 3 };
      this.arc(top, { x: pos.x, y: pos.y + 0.5, z: pos.z }, 0.45, [0.9, 0.9, 1]);
      this.sparks({ x: pos.x, y: pos.y + 0.3, z: pos.z }, 25, [0.8, 0.85, 1, 1]);
      this.add({ pos: { x: pos.x, y: pos.y + 0.8, z: pos.z }, vel: { x: 0, y: 0, z: 0 }, life: 0.3, max: 0.3, size: 2.5, grow: 2, color: [0.7, 0.8, 1, 1], gravity: 0, kind: 'glow' });
    }
    teleportFx(pos) {
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random();
        this.arc({ x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * 3, z: pos.z + Math.sin(a) * r }, { x: pos.x, y: pos.y + 1 + Math.random(), z: pos.z }, 0.4 + Math.random() * 0.3, [0.5, 0.8, 1]);
      }
      this.add({ pos: { x: pos.x, y: pos.y + 1.2, z: pos.z }, vel: { x: 0, y: 0, z: 0 }, life: 0.6, max: 0.6, size: 3, grow: 3, color: [0.5, 0.7, 1, 1], gravity: 0, kind: 'glow' });
    }
    muzzleSmoke(pos) { this.add({ pos: V.copy(pos), vel: { x: 0, y: 0.5, z: 0 }, life: 0.5, max: 0.5, size: 0.15, grow: 0.8, color: [0.7, 0.7, 0.7, 0.35], gravity: 0, kind: 'smoke' }); }
    update(dt) {
      const l = this.list;
      for (let i = l.length - 1; i >= 0; i--) {
        const p = l[i];
        p.life -= dt;
        if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
        if (p.vel) {
          p.vel.y -= (p.gravity || 0) * dt;
          p.pos.x += p.vel.x * dt; p.pos.y += p.vel.y * dt; p.pos.z += p.vel.z * dt;
          if (p.kind === 'blood' && p.pos.y < 0.02 && p.gravity) { p.vel.x = p.vel.z = 0; p.vel.y = 0; p.gravity = 0; p.pos.y = 0.02; p.flat = true; p.size *= 1.6; }
        }
        if (p.grow) p.size = Math.max(0.01, p.size + p.grow * dt);
      }
      const a = this.arcs;
      for (let i = a.length - 1; i >= 0; i--) { a[i].life -= dt; if (a[i].life <= 0) { a[i] = a[a.length - 1]; a.pop(); } }
    }
    draw(r) {
      const tex = r.textures;
      const alphaList = [], addList = [], segs = [];
      for (const p of this.list) {
        const f = Math.max(0, p.life / p.max);
        if (p.kind === 'tracer') { segs.push({ pos: p.pos, end: p.end, width: p.width, color: p.color }); continue; }
        const col = [p.color[0], p.color[1], p.color[2], (p.color[3] === undefined ? 1 : p.color[3]) * (p.kind === 'blood' ? Math.min(1, f * 3) : f)];
        const item = { pos: p.pos, size: p.size, color: col, flat: p.flat };
        if (p.kind === 'spark' || p.kind === 'glow') addList.push(item); else alphaList.push(item);
      }
      for (const a of this.arcs) {
        const f = a.life / a.max;
        const n = 6;
        let prev = a.a;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const p = i === n ? a.b : { x: a.a.x + (a.b.x - a.a.x) * t + (Math.random() - 0.5) * 0.5, y: a.a.y + (a.b.y - a.a.y) * t + (Math.random() - 0.5) * 0.5, z: a.a.z + (a.b.z - a.a.z) * t + (Math.random() - 0.5) * 0.5 };
          segs.push({ pos: prev, end: p, width: 0.06 + 0.1 * f, color: [a.color[0], a.color[1], a.color[2], f] });
          segs.push({ pos: prev, end: p, width: 0.25 * f, color: [a.color[0], a.color[1], a.color[2], 0.25 * f] });
          prev = p;
        }
      }
      if (alphaList.length) r.drawParticles(alphaList, tex.glow, { blend: 'alpha' });
      if (addList.length) r.drawParticles(addList, tex.glow, { blend: 'add' });
      if (segs.length) r.drawParticles(segs, tex.white, { blend: 'add' });
    }
  }
  ZM.Particles = Particles;

  // ===================== ZOMBIE / HELLHOUND =====================
  // Three zombie looks (Wehrmacht field grey, dark uniform with helmet, brown with cap), each with a hanging jaw.
  const VARIANTS = [
    { cloth: [0.35, 0.4, 0.3, 1], dark: [0.3, 0.33, 0.25, 1], skin: [0.75, 0.72, 0.62, 1], hat: 'hair' },
    { cloth: [0.28, 0.3, 0.36, 1], dark: [0.22, 0.24, 0.3, 1], skin: [0.66, 0.6, 0.5, 1], hat: 'helmet' },
    { cloth: [0.42, 0.36, 0.26, 1], dark: [0.34, 0.28, 0.2, 1], skin: [0.72, 0.68, 0.58, 1], hat: 'cap' },
  ];
  const zMeshesByVariant = {};
  function zombieMeshes(gl, v = 0) {
    if (zMeshesByVariant[v]) return zMeshesByVariant[v];
    const C = VARIANTS[v % VARIANTS.length];
    const mk = (fn) => { const mb = new ZM.MeshBuilder(); fn(mb); return mb.build(gl); };
    const B = (mb, a, b, c) => mb.box({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, { color: c, uvScale: 0.5 });
    const blood = [0.35, 0.03, 0.03, 1];
    const zMeshes = zMeshesByVariant[v] = {
      torso: mk(mb => { B(mb, [-0.25, 0.85, -0.15], [0.25, 1.45, 0.15], C.cloth); B(mb, [-0.27, 1.3, -0.16], [0.27, 1.45, 0.16], C.dark); B(mb, [-0.26, 0.95, -0.16], [0.0, 1.1, -0.15], blood); B(mb, [-0.05, 0.86, -0.155], [0.12, 1.0, -0.14], [0.6, 0.55, 0.45, 1]); B(mb, [-0.1, 1.05, 0.151], [0.26, 1.12, 0.16], [0.2, 0.18, 0.12, 1]); }),
      head: mk(mb => {
        B(mb, [-0.13, 0.06, -0.14], [0.13, 0.28, 0.14], C.skin);
        B(mb, [-0.11, 0.0, -0.13], [0.11, 0.07, 0.0], C.skin); // hanging jaw
        B(mb, [-0.06, 0.07, -0.145], [0.06, 0.1, -0.12], blood);
        if (C.hat === 'helmet') { B(mb, [-0.16, 0.2, -0.17], [0.16, 0.33, 0.17], [0.28, 0.3, 0.26, 1]); B(mb, [-0.17, 0.18, -0.18], [0.17, 0.22, 0.18], [0.25, 0.27, 0.23, 1]); }
        else if (C.hat === 'cap') { B(mb, [-0.14, 0.25, -0.15], [0.14, 0.32, 0.15], C.dark); B(mb, [-0.12, 0.24, -0.22], [0.12, 0.27, -0.14], C.dark); }
        else B(mb, [-0.14, 0.2, -0.15], [0.14, 0.29, 0.15], [0.25, 0.22, 0.18, 1]);
      }),
      eyes: mk(mb => { B(mb, [-0.09, 0.14, -0.155], [-0.03, 0.19, -0.13], [1, 1, 1, 1]); B(mb, [0.03, 0.14, -0.155], [0.09, 0.19, -0.13], [1, 1, 1, 1]); }),
      arm: mk(mb => { B(mb, [-0.07, -0.62, -0.07], [0.07, 0, 0.07], C.cloth); B(mb, [-0.06, -0.72, -0.06], [0.06, -0.55, 0.06], C.skin); B(mb, [-0.071, -0.4, -0.071], [0.071, -0.3, 0.071], C.dark); }),
      leg: mk(mb => { B(mb, [-0.09, -0.85, -0.09], [0.09, 0, 0.09], C.dark); B(mb, [-0.1, -0.88, -0.14], [0.1, -0.78, 0.1], [0.12, 0.1, 0.08, 1]); B(mb, [-0.091, -0.5, -0.091], [0.091, -0.42, 0.091], C.skin); }),
      dogBody: mk(mb => { B(mb, [-0.17, 0.45, -0.42], [0.17, 0.85, 0.42], [0.22, 0.08, 0.05, 1]); B(mb, [-0.05, 0.75, 0.42], [0.05, 0.95, 0.75], [0.2, 0.07, 0.04, 1]); }),
      dogHead: mk(mb => { B(mb, [-0.12, -0.1, -0.33], [0.12, 0.15, 0], [0.25, 0.09, 0.05, 1]); B(mb, [-0.08, -0.14, -0.5], [0.08, 0.0, -0.3], [0.2, 0.07, 0.04, 1]); }),
      dogEyes: mk(mb => { B(mb, [-0.09, 0.02, -0.34], [-0.04, 0.07, -0.3], [1, 1, 1, 1]); B(mb, [0.04, 0.02, -0.34], [0.09, 0.07, -0.3], [1, 1, 1, 1]); }),
      dogLeg: mk(mb => { B(mb, [-0.05, -0.5, -0.05], [0.05, 0, 0.05], [0.2, 0.08, 0.05, 1]); }),
    };
    return zMeshes;
  }

  class Zombie {
    constructor(game, o) {
      this.game = game;
      this.type = o.type || 'zombie';
      this.pos = V.copy(o.pos);
      this.baseY = o.pos.y;
      this.yaw = o.yaw || 0;
      this.hp = o.hp; this.maxHp = o.hp;
      this.speed = o.speed;
      this.window = o.window || null;
      this.state = o.state || 'chase';
      this.stateT = 0;
      this.t = Math.random() * 10;
      this.phase = Math.random() * 6;
      this.hitFlash = 0;
      this.dead = false; this.deathT = 0; this.remove = false;
      this.groanT = 2 + Math.random() * 6;
      this.attackHit = false;
      this.lastRepath = 0;
      this.stuckT = 0;
      this.lastPos = V.copy(this.pos);
      this.isDog = this.type === 'dog';
      this.radius = this.isDog ? 0.3 : 0.33;
      this.bodyTop = this.isDog ? 0.95 : 1.48;
      this.headRadius = this.isDog ? 0.22 : 0.24;
      this.headHeight = this.isDog ? 0.75 : 1.6;
      this.attackRange = this.isDog ? 1.5 : 1.35;
      this.damage = 50;
      this.tearTimer = 0.5;
      this.value = 0;
      this.id = Zombie.nextId++;
      this.variant = this.id % 3;
    }
    hittable() { return !this.dead && this.state !== 'spawn' && !(this.state === 'rise' && this.stateT < 0.5); }
    headPos() { return { x: this.pos.x, y: this.pos.y + this.headHeight, z: this.pos.z }; }
    chestPos() { return { x: this.pos.x, y: this.pos.y + (this.isDog ? 0.65 : 1.15), z: this.pos.z }; }
    faceToward(p) { const dx = p.x - this.pos.x, dz = p.z - this.pos.z; if (Math.abs(dx) + Math.abs(dz) > 1e-4) this.yaw = this._approachAngle(this.yaw, Math.atan2(-dx, -dz), 0.25); }
    _approachAngle(a, b, k) { return a + U.angleWrap(b - a) * k; }
    takeDamage(d, info) {
      if (this.dead) return false;
      this.hp -= d;
      this.hitFlash = 0.12;
      if (this.hp <= 0) { this.die(info); return true; }
      return false;
    }
    die(info) {
      this.dead = true; this.deathT = 0; this.state = 'dead';
      this.fallDir = info && info.source === 'explosion' ? (Math.random() < 0.5 ? 1 : -1) : -1;
      this.game.audio.play(this.isDog ? 'dog_bark' : 'zombie_die', { pos: this.pos, minGap: 0.1 });
    }
    update(dt) {
      const g = this.game, p = g.player;
      this.t += dt; this.hitFlash -= dt;
      if (this.dead) { this.deathT += dt; if (this.deathT > 4) this.remove = true; return; }
      this.groanT -= dt;
      if (this.groanT <= 0) { this.groanT = 4 + Math.random() * 7; g.audio.play(this.isDog ? 'dog_bark' : 'zombie_groan', { pos: this.pos, minGap: 0.4, pitch: 0.8 + Math.random() * 0.5 }); }
      const monkey = g.monkey && !g.monkey.remove && V.distXZ(g.monkey.pos, this.pos) < 30 ? g.monkey : null;
      const target = monkey ? monkey.pos : p.pos;
      const fieldKey = monkey ? 'monkey' : 'player';
      switch (this.state) {
        case 'spawn': // hellhound materializing
          this.stateT += dt;
          if (this.stateT > 0.9) { this.state = 'chase'; this.stateT = 0; }
          break;
        case 'rise':
          this.stateT += dt;
          this.pos.y = this.baseY - 2.1 + 2.1 * Math.min(1, this.stateT / 1.5);
          if (this.stateT >= 1.5) { this.pos.y = this.baseY; this.state = 'chase'; this.stateT = 0; }
          this.faceToward(target);
          break;
        case 'toWindow': {
          const w = this.window, dest = w.outside;
          const d = V.distXZ(this.pos, dest);
          if (d < 0.25) { this.state = 'tear'; this.stateT = 0; this.tearTimer = 0.6; }
          else this._moveToward(dest, Math.min(this.speed, 2.2), dt, true);
          break;
        }
        case 'tear': {
          const w = this.window;
          this.faceToward(w.inside);
          this.stateT += dt; this.tearTimer -= dt;
          if (w.boards > 0) {
            if (this.tearTimer <= 0) { this.tearTimer = 0.9 + Math.random() * 0.4; g.ripBoard(w, this); }
          } else { this.state = 'vault'; this.stateT = 0; this.vaultFrom = V.copy(this.pos); g.audio.play('vault', { pos: this.pos }); }
          break;
        }
        case 'vault': {
          const w = this.window;
          this.stateT += dt;
          const t = Math.min(1, this.stateT / 1.0);
          const a = this.vaultFrom, b = w.inside;
          this.pos.x = a.x + (b.x - a.x) * t; this.pos.z = a.z + (b.z - a.z) * t; this.pos.y = a.y + (b.y - a.y) * t + Math.sin(t * Math.PI) * 0.7;
          this.faceToward(b);
          if (t >= 1) { this.pos.y = b.y; this.state = 'chase'; this.stateT = 0; this.window = null; }
          break;
        }
        case 'chase': {
          if (p.downed && !monkey) { this.phase += dt; break; }
          const d = V.distXZ(this.pos, target), dy = Math.abs(target.y - this.pos.y);
          if (monkey) {
            if (d > 1.2) this._pathToward(target, fieldKey, dt);
            else this.faceToward(target);
            break;
          }
          if (d <= this.attackRange && dy < 1.3) { this.state = 'attack'; this.stateT = 0; this.attackHit = false; g.audio.play('zombie_attack', { pos: this.pos, minGap: 0.2 }); break; }
          this._pathToward(target, fieldKey, dt);
          break;
        }
        case 'attack': {
          this.stateT += dt;
          this.faceToward(p.pos);
          const windup = this.isDog ? 0.25 : 0.4;
          if (!this.attackHit && this.stateT >= windup) {
            this.attackHit = true;
            if (V.distXZ(this.pos, p.pos) <= this.attackRange + 0.45 && !p.downed) g.damagePlayer(this.damage, this);
          }
          if (this.stateT >= (this.isDog ? 0.7 : 1.0)) { this.state = 'chase'; this.stateT = 0; }
          break;
        }
      }
      // keep on the floor
      if (this.state !== 'rise' && this.state !== 'vault') {
        const fy = g.map.floorHeight(this.pos.x, this.pos.z, this.pos.y);
        if (fy !== null) this.pos.y = fy;
      }
    }
    _pathToward(target, key, dt) {
      const g = this.game;
      let step = g.nav.nextStep(this.pos, 8, key);
      let dest;
      if (step) dest = step;
      else dest = target; // no field: go straight
      // last leg: head directly to the target when very close and line is walkable
      if (V.distXZ(this.pos, target) < 2.5 && g.nav.walkableLine(this.pos, target)) dest = target;
      this._moveToward(dest, this.speed, dt, false);
      // stuck detection: nudge
      if (V.distXZ(this.pos, this.lastPos) < 0.02 * this.speed * dt * 60) this.stuckT += dt; else this.stuckT = 0;
      this.lastPos = V.copy(this.pos);
      if (this.stuckT > 1.2) { this.pos.x += (Math.random() - 0.5) * 0.6; this.pos.z += (Math.random() - 0.5) * 0.6; this.stuckT = 0; }
    }
    _moveToward(dest, speed, dt, outside) {
      const g = this.game;
      let dx = dest.x - this.pos.x, dz = dest.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) return;
      dx /= d; dz /= d;
      // separation from other zombies
      let sx = 0, sz = 0;
      for (const o of g.zombies) {
        if (o === this || o.dead || o.state === 'rise' || o.state === 'vault') continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz);
        if (od < 0.75 && od > 1e-4) { const f = (0.75 - od) / 0.75; sx += ox / od * f; sz += oz / od * f; }
      }
      // don't walk into the player
      const p = g.player;
      const px = this.pos.x - p.pos.x, pz = this.pos.z - p.pos.z, pd = Math.hypot(px, pz);
      if (pd < 0.9 && pd > 1e-4 && !outside) { const f = (0.9 - pd) / 0.9; sx += px / pd * f * 1.5; sz += pz / pd * f * 1.5; }
      let mx = dx + sx * 1.2, mz = dz + sz * 1.2;
      const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
      const mv = Math.min(speed * dt, d + 0.05);
      let nx = this.pos.x + mx * mv, nz = this.pos.z + mz * mv;
      const r = g.map.resolveCircle(nx, nz, this.radius, this.pos.y + 0.2, this.pos.y + 1.4, { skipWindows: outside });
      this.pos.x = r.x; this.pos.z = r.z;
      this.yaw = this._approachAngle(this.yaw, Math.atan2(-mx, -mz), 0.2);
      this.phase += dt * speed * 1.6;
    }
    draw(r, shadows) {
      const g = this.game, gl = r.gl, m = zombieMeshes(gl, this.variant), tex = r.textures;
      const base = M4.create();
      M4.translate(base, base, this.pos);
      M4.rotateY(base, base, this.yaw);
      let emis = this.hitFlash > 0 ? [0.6, 0.1, 0.1] : [0, 0, 0];
      let alpha = 1;
      if (this.dead) {
        const f = Math.min(1, this.deathT / 0.5);
        M4.rotateX(base, base, this.fallDir * (Math.PI / 2) * f);
        if (this.deathT > 3) alpha = Math.max(0, 1 - (this.deathT - 3));
        if (alpha <= 0) return;
      }
      if (this.state === 'spawn') { alpha = Math.min(1, this.stateT / 0.9); emis = [0.3, 0.4, 0.8]; }
      const opts = alpha < 1 ? { emissive: emis, blend: 'alpha', alpha } : { emissive: emis };
      const part = (mesh, texture, pivot, rx, extra) => {
        const mm = M4.copy(M4.create(), base);
        M4.translate(mm, mm, pivot);
        if (rx) M4.rotateX(mm, mm, rx);
        if (extra) extra(mm);
        r.draw(mesh, mm, texture, opts);
      };
      const walking = this.state === 'chase' || this.state === 'toWindow' || this.state === 'vault';
      const swing = walking ? Math.sin(this.phase) * 0.55 : 0;
      if (!this.isDog) {
        const attackSwing = this.state === 'attack' ? Math.sin(Math.min(1, this.stateT / 0.4) * Math.PI) * 0.9 : 0;
        const armsUp = (this.state === 'chase' || this.state === 'attack') ? 1.35 : this.state === 'tear' ? 1.1 : 0.2;
        part(m.torso, tex.cloth, { x: 0, y: 0, z: 0 }, 0);
        part(m.head, tex.skin, { x: 0, y: 1.45, z: 0 }, this.state === 'tear' ? 0.2 : Math.sin(this.t * 2) * 0.08);
        r.draw(m.eyes, (() => { const mm = M4.copy(M4.create(), base); M4.translate(mm, mm, { x: 0, y: 1.45, z: 0 }); return mm; })(), tex.white, { emissive: [1.2, 0.9, 0.1], unlit: true });
        const tearSwing = this.state === 'tear' ? Math.sin(this.t * 9) * 0.35 : 0;
        part(m.arm, tex.cloth, { x: -0.32, y: 1.4, z: 0 }, armsUp + attackSwing + tearSwing + (walking ? swing * 0.2 : 0));
        part(m.arm, tex.cloth, { x: 0.32, y: 1.4, z: 0 }, armsUp - attackSwing * 0.5 - tearSwing - (walking ? swing * 0.2 : 0));
        part(m.leg, tex.cloth, { x: -0.13, y: 0.85, z: 0 }, swing);
        part(m.leg, tex.cloth, { x: 0.13, y: 0.85, z: 0 }, -swing);
      } else {
        const bob = walking ? Math.abs(Math.sin(this.phase * 1.3)) * 0.06 : 0;
        part(m.dogBody, tex.cloth, { x: 0, y: bob, z: 0 }, 0);
        part(m.dogHead, tex.cloth, { x: 0, y: 0.85 + bob, z: -0.42 }, this.state === 'attack' ? -0.4 : 0.1);
        r.draw(m.dogEyes, (() => { const mm = M4.copy(M4.create(), base); M4.translate(mm, mm, { x: 0, y: 0.85 + bob, z: -0.42 }); return mm; })(), tex.white, { emissive: [1.5, 0.5, 0.1], unlit: true });
        const ds = walking ? Math.sin(this.phase * 1.3) * 0.8 : 0;
        part(m.dogLeg, tex.cloth, { x: -0.12, y: 0.5 + bob, z: -0.3 }, ds);
        part(m.dogLeg, tex.cloth, { x: 0.12, y: 0.5 + bob, z: -0.3 }, -ds);
        part(m.dogLeg, tex.cloth, { x: -0.12, y: 0.5 + bob, z: 0.3 }, -ds);
        part(m.dogLeg, tex.cloth, { x: 0.12, y: 0.5 + bob, z: 0.3 }, ds);
        if (!this.dead && Math.random() < 0.5) g.particles.fire({ x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z });
      }
      if (!this.dead && this.state !== 'rise') shadows.push({ pos: { x: this.pos.x, y: this.pos.y + 0.03, z: this.pos.z }, size: this.isDog ? 1.1 : 1.0, color: [0, 0, 0, 0.8], flat: true });
    }
  }
  Zombie.nextId = 1;
  ZM.Zombie = Zombie;

  // ===================== POWER-UPS =====================
  const POWERUPS = {
    max_ammo: { name: 'MAX AMMO', color: [0.3, 0.9, 0.4] },
    insta_kill: { name: 'INSTA-KILL', color: [1, 0.3, 0.2] },
    double_points: { name: 'DOUBLE POINTS', color: [1, 0.9, 0.2] },
    nuke: { name: 'NUKE', color: [1, 0.6, 0.1] },
    carpenter: { name: 'CARPENTER', color: [0.6, 0.4, 0.2] },
    fire_sale: { name: 'FIRE SALE', color: [1, 0.4, 0.8] },
  };
  let puMesh = null;
  class PowerUp {
    constructor(game, type, pos) { this.game = game; this.type = type; this.pos = V.copy(pos); this.pos.y += 0.9; this.life = 30; this.t = 0; this.remove = false; }
    update(dt) {
      this.t += dt; this.life -= dt;
      if (this.life <= 0) { this.remove = true; return; }
      const p = this.game.player;
      if (!p.downed && V.dist(p.eyePos(), this.pos) < 1.6) { this.game.collectPowerUp(this); this.remove = true; }
    }
    draw(r) {
      const gl = r.gl, tex = r.textures;
      if (!puMesh) { const mb = new ZM.MeshBuilder(); mb.box({ x: -0.25, y: -0.25, z: -0.25 }, { x: 0.25, y: 0.25, z: 0.25 }, { color: [1, 1, 1, 1] }); puMesh = mb.build(gl); }
      if (this.life < 8 && Math.floor(this.life * 4) % 2 === 0) return;
      const d = POWERUPS[this.type];
      const mm = M4.create();
      M4.translate(mm, mm, { x: this.pos.x, y: this.pos.y + Math.sin(this.t * 2) * 0.1, z: this.pos.z });
      M4.rotateY(mm, mm, this.t * 1.5);
      M4.rotateX(mm, mm, 0.6);
      r.draw(puMesh, mm, tex.white, { emissive: [d.color[0] * 0.8, d.color[1] * 0.8, d.color[2] * 0.8] });
      r.drawParticles([{ pos: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, size: 1.4, color: [d.color[0], d.color[1], d.color[2], 0.45] }], tex.glow, { blend: 'add' });
      r.drawParticles([{ pos: { x: this.pos.x, y: this.pos.y - 0.9, z: this.pos.z }, end: { x: this.pos.x, y: this.pos.y + 12, z: this.pos.z }, width: 0.5, color: [d.color[0], d.color[1], d.color[2], 0.18] }], tex.white, { blend: 'add' });
      const lt = tex['pu_' + this.type];
      if (lt) r.drawParticles([{ pos: { x: this.pos.x, y: this.pos.y + 0.7, z: this.pos.z }, size: 1.2, color: [1, 1, 1, 0.95] }], lt, { blend: 'alpha' });
    }
  }
  PowerUp.TYPES = POWERUPS;
  ZM.PowerUp = PowerUp;

  // ===================== PROJECTILES =====================
  let projMeshes = null;
  class Projectile {
    constructor(game, o) {
      this.game = game;
      Object.assign(this, { gravity: 0, radius: 0, splash: 0, direct: 0, life: 5, kind: 'rocket', fuse: 0, bounces: 0, landed: false, remove: false, t: 0 }, o);
      this.pos = V.copy(o.pos); this.vel = V.copy(o.vel);
    }
    update(dt) {
      const g = this.game;
      this.t += dt; this.life -= dt;
      if (this.life <= 0) { if (this.kind === 'grenade' || this.kind === 'monkey') this.explode(); else this.remove = true; return; }
      if (this.landed) {
        if (this.kind === 'monkey') { if (Math.random() < 0.3) g.particles.sparks(this.pos, 1, [1, 0.8, 0.3, 1]); }
        return;
      }
      this.vel.y -= this.gravity * dt;
      const step = V.scale(this.vel, dt), len = V.len(step);
      if (len < 1e-6) return;
      const dir = V.scale(step, 1 / len);
      const canDirect = this.kind === 'rocket' || this.kind === 'ray' || this.kind === 'knife';
      if (canDirect) {
        const hits = ZM.Weapons.traceZombies(g, this.pos, dir, len + 0.3, 1);
        if (hits.length) {
          const h = hits[0];
          if (this.kind === 'knife') { g.damageZombie(h.z, this.direct * (h.head ? 2 : 1), { head: h.head, point: h.point, source: 'bullet' }); this.remove = true; return; }
          g.damageZombie(h.z, this.direct, { head: false, point: h.point, source: 'explosion' });
          this.pos = h.point; this.explode(); return;
        }
      }
      const r = g.map.raycast(this.pos, dir, len + 0.05, { floors: true });
      if (r.t >= 0) {
        const hitP = V.add(this.pos, V.scale(dir, Math.max(0, r.t - 0.05)));
        if (this.kind === 'grenade' || this.kind === 'monkey') {
          // bounce: approximate normal from the hit object
          const n = this._normal(r.hit, hitP);
          const vn = V.dot(this.vel, n);
          this.vel = V.sub(this.vel, V.scale(n, vn * 1.5));
          this.vel = V.scale(this.vel, 0.45);
          this.pos = V.add(hitP, V.scale(n, 0.05));
          this.bounces++;
          if (V.len(this.vel) < 1.2 && n.y > 0.5) { this.landed = true; this.vel = { x: 0, y: 0, z: 0 }; this.pos.y = hitP.y + 0.1; if (this.kind === 'monkey') g.monkeyLanded(this); }
          return;
        }
        if (this.kind === 'knife') { this.remove = true; g.particles.impact(hitP, dir); return; }
        this.pos = hitP; this.explode(); return;
      }
      this.pos = V.add(this.pos, step);
      if (this.pos.y < -5 || this.pos.y > 60) { this.remove = true; return; }
      if (this.kind === 'rocket') g.particles.smoke(this.pos, 0.25, 0.7, [0.6, 0.6, 0.6, 0.5]);
      if (this.kind === 'ray') g.particles.add({ pos: V.copy(this.pos), vel: { x: 0, y: 0, z: 0 }, life: 0.15, max: 0.15, size: 0.35, color: [0.3, 1, 0.4, 0.8], gravity: 0, kind: 'glow' });
    }
    _normal(hit, p) {
      if (hit && hit.min) {
        const c = hit;
        const dx = Math.min(Math.abs(p.x - c.min.x), Math.abs(p.x - c.max.x)), dy = Math.min(Math.abs(p.y - c.min.y), Math.abs(p.y - c.max.y)), dz = Math.min(Math.abs(p.z - c.min.z), Math.abs(p.z - c.max.z));
        if (dx <= dy && dx <= dz) return { x: p.x < (c.min.x + c.max.x) / 2 ? -1 : 1, y: 0, z: 0 };
        if (dy <= dz) return { x: 0, y: p.y < (c.min.y + c.max.y) / 2 ? -1 : 1, z: 0 };
        return { x: 0, y: 0, z: p.z < (c.min.z + c.max.z) / 2 ? -1 : 1 };
      }
      return { x: 0, y: 1, z: 0 }; // floor
    }
    explode() {
      if (this.remove) return;
      this.remove = true;
      if (this.kind === 'monkey' && this.game.monkey === this) this.game.monkey = null;
      this.game.explode(this.pos, this.radius, this.splash, { source: this.kind === 'ray' ? 'ray' : 'explosion', ray: this.kind === 'ray' });
    }
    draw(r) {
      const gl = r.gl, tex = r.textures;
      if (!projMeshes) {
        const mk = (fn) => { const mb = new ZM.MeshBuilder(); fn(mb); return mb.build(gl); };
        projMeshes = {
          rocket: mk(mb => mb.box({ x: -0.06, y: -0.06, z: -0.25 }, { x: 0.06, y: 0.06, z: 0.25 }, { color: [0.3, 0.35, 0.3, 1] })),
          grenade: mk(mb => mb.box({ x: -0.07, y: -0.07, z: -0.07 }, { x: 0.07, y: 0.07, z: 0.07 }, { color: [0.2, 0.25, 0.2, 1] })),
          monkey: mk(mb => { mb.box({ x: -0.12, y: -0.15, z: -0.1 }, { x: 0.12, y: 0.15, z: 0.1 }, { color: [0.45, 0.3, 0.15, 1] }); mb.box({ x: -0.1, y: 0.15, z: -0.1 }, { x: 0.1, y: 0.32, z: 0.1 }, { color: [0.5, 0.35, 0.2, 1] }); mb.box({ x: -0.2, y: 0.05, z: -0.05 }, { x: 0.2, y: 0.12, z: 0.05 }, { color: [0.8, 0.7, 0.2, 1] }); }),
          knife: mk(mb => mb.box({ x: -0.015, y: -0.015, z: -0.2 }, { x: 0.015, y: 0.015, z: 0.1 }, { color: [0.85, 0.85, 0.9, 1] })),
          claymore: mk(mb => { mb.box({ x: -0.12, y: 0, z: -0.03 }, { x: 0.12, y: 0.14, z: 0.03 }, { color: [0.25, 0.3, 0.2, 1] }); mb.box({ x: -0.1, y: 0.14, z: -0.01 }, { x: -0.08, y: 0.17, z: 0.01 }, { color: [1, 0.2, 0.2, 1] }); }),
        };
      }
      const mm = M4.create();
      M4.translate(mm, mm, this.pos);
      if (this.kind === 'ray') { r.drawParticles([{ pos: this.pos, size: 0.5, color: [0.4, 1, 0.5, 1] }], tex.glow, { blend: 'add' }); return; }
      if (!this.landed) { const yaw = Math.atan2(-this.vel.x, -this.vel.z); M4.rotateY(mm, mm, yaw); if (this.kind === 'rocket' || this.kind === 'knife') M4.rotateX(mm, mm, Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z))); else M4.rotateX(mm, mm, this.t * 8); }
      r.draw(projMeshes[this.kind] || projMeshes.grenade, mm, tex.white, this.kind === 'rocket' ? { emissive: [0.3, 0.1, 0] } : {});
    }
  }
  ZM.Projectile = Projectile;

  class Claymore {
    constructor(game, pos, yaw) { this.game = game; this.pos = V.copy(pos); this.yaw = yaw; this.arm = 1.0; this.remove = false; this.t = 0; }
    update(dt) {
      this.t += dt; this.arm -= dt;
      if (this.arm > 0) return;
      for (const z of this.game.zombies) {
        if (z.dead || !z.hittable()) continue;
        if (V.distXZ(z.pos, this.pos) < 1.6 && Math.abs(z.pos.y - this.pos.y) < 1.5) { this.remove = true; this.game.explode(this.pos, 3.2, 1500, { source: 'explosion', noSelf: false }); return; }
      }
    }
    draw(r) {
      Projectile.prototype.draw.call({ game: this.game, pos: this.pos, kind: 'claymore', landed: true, t: this.t, vel: { x: 0, y: 0, z: 0 } }, r);
      if (Math.floor(this.t * 2) % 2 === 0) r.drawParticles([{ pos: { x: this.pos.x, y: this.pos.y + 0.17, z: this.pos.z }, size: 0.12, color: [1, 0.2, 0.2, 1] }], r.textures.glow, { blend: 'add' });
    }
  }
  ZM.Claymore = Claymore;
})();


// ===== 80_player.js =====
// ---------------------------------------------------------------------------
// 80_player.js — first-person player: movement/collision, health, perks,
// inventory, firing/reload/switch/melee/grenades, viewmodel rendering.
// ---------------------------------------------------------------------------
(function () {
  const V = ZM.V, U = ZM.U, M4 = ZM.M4, WP = ZM.Weapons;
  const EYE = 1.6, RADIUS = 0.35;
  const WALK = 4.3, SPRINT = 6.4, ADS_SPEED = 2.6;

  class Player {
    constructor(game) {
      this.game = game;
      const sp = game.map.spawn;
      this.pos = V.copy(sp.pos); this.yaw = sp.yaw; this.pitch = 0;
      this.velY = 0; this.onGround = true;
      this.maxHealth = 100; this.health = 100; this.regenTimer = 0; this.lastDamage = 0;
      this.points = 500;
      this.perks = new Set(); this.qrBuys = 0;
      this.weapons = [WP.makeState('m1911')]; this.cur = 0;
      this.grenades = 2; this.maxGrenades = 4; this.monkeys = 0; this.claymores = 0; this.hasClaymores = false; this.bowie = false;
      this.downed = false; this.downTimer = 0; this.dead = false; this.downs = 0;
      this.fireTimer = 0; this.reloading = false; this.reloadTimer = 0; this.reloadTotal = 1; this.switchTimer = 0; this.meleeTimer = 0; this.burstLeft = 0; this.throwTimer = 0;
      this.ads = false; this.adsAmount = 0; this.sprinting = false; this.moving = false; this.speedFactor = 1;
      this.kills = 0; this.headshots = 0; this.shotsFired = 0;
      this.bobPhase = 0; this.recoilKick = 0; this.recoilPitchVel = 0; this.flashTimer = 0; this.stepTimer = 0;
      this.sensitivity = 0.0022; this.invertY = false; this.adsToggle = false; this.sprintToggle = false; this.viewBob = true; this.adsLatched = false; this.sprintLatched = false;
      this.vmCache = {}; this.handsMesh = null; this.knifeMesh = null; this.bowieMesh = null;
      this.hitMarker = 0; this.hitMarkerKill = false;
      this.hurtFlash = 0;
      this.interact = null; // {text, action}
    }
    eyePos() { return { x: this.pos.x, y: this.pos.y + (this.downed ? 0.7 : EYE), z: this.pos.z }; }
    weapon() { return this.weapons[this.cur]; }
    weaponDef() { return WP.defs[this.weapon().id]; }
    hasWeapon(id) { return this.weapons.some(w => w.id === id); }
    speedMult() { return this.sprinting ? SPRINT / WALK : this.ads ? ADS_SPEED / WALK : 1; }
    addPoints(n) { if (n > 0 && this.game.doublePoints > 0) n *= 2; this.points += n; if (n > 0) this.game.hud.pointsFloat(n); }
    spend(n) { if (this.points < n) return false; this.points -= n; this.game.hud.pointsFloat(-n); return true; }
    giveWeapon(id, pap = false) {
      const ws = WP.makeState(id, pap);
      if (this.weapons.length < 2) { this.weapons.push(ws); this.cur = this.weapons.length - 1; }
      else { this.weapons[this.cur] = ws; }
      this.reloading = false; this.switchTimer = 0.6; this.burstLeft = 0;
      return ws;
    }
    refillWeapon(id) { // wall-buy ammo
      const ws = this.weapons.find(w => w.id === id);
      if (ws) ws.reserve = WP.maxReserve(ws);
    }
    maxAmmo() { for (const w of this.weapons) w.reserve = WP.maxReserve(w); this.grenades = this.maxGrenades; if (this.hasClaymores) this.claymores = 2; if (this.monkeys > 0) this.monkeys = Math.max(this.monkeys, 3); }
    recoil(k) { this.recoilKick = Math.min(0.12, this.recoilKick + 0.035 * k); this.recoilPitchVel += 0.9 * k; this.flashTimer = 0.06; }
    takeDamage(d) {
      if (this.downed || this.dead) return;
      this.health -= d; this.regenTimer = 4.5; this.hurtFlash = 1; this.lastDamage = this.game.time;
      this.game.audio.play('player_hurt', { vol: 0.9, minGap: 0.15 });
      if (this.health <= 0) { this.health = 0; this.goDown(); }
    }
    goDown() {
      this.downs++;
      this.downed = true; this.sprinting = false; this.ads = false; this.reloading = false;
      this.game.audio.play('down');
      if (this.perks.has('quick_revive')) { this.downTimer = 8; this.game.hud.toast('Quick Revive activating…', 3); }
      else { this.downTimer = 4.5; this.dying = true; }
    }
    revive() {
      this.downed = false; this.dying = false;
      this.perks.clear(); this.maxHealth = 100; this.health = 100;
      this.game.audio.play('revive');
      this.game.hud.toast('Revived — all perks lost', 4);
    }
    applyPerk(id) {
      this.perks.add(id);
      if (id === 'juggernog') { this.maxHealth = 250; this.health = 250; }
      if (id === 'quick_revive') this.qrBuys++;
    }
    startReload() {
      const ws = this.weapon(), d = WP.defs[ws.id];
      if (this.reloading || ws.mag >= WP.magSize(ws) || ws.reserve <= 0 || this.switchTimer > 0 || this.meleeTimer > 0) return;
      this.reloading = true; this.reloadTotal = d.reload * (this.perks.has('speed_cola') ? 0.5 : 1); this.reloadTimer = this.reloadTotal;
      this.sprinting = false; this.burstLeft = 0;
      this.game.audio.play('reload');
    }
    finishReload() {
      const ws = this.weapon();
      const need = WP.magSize(ws) - ws.mag, take = Math.min(need, ws.reserve);
      ws.mag += take; ws.reserve -= take; this.reloading = false;
    }
    switchWeapon(i) {
      if (i === this.cur || i >= this.weapons.length || this.switchTimer > 0 || this.downed) return;
      this.cur = i; this.switchTimer = 0.45; this.reloading = false; this.burstLeft = 0; this.ads = false; this.adsLatched = false;
    }
    doMelee() {
      if (this.meleeTimer > 0 || this.switchTimer > 0 || this.downed) return;
      this.meleeTimer = 0.55; this.meleeHit = false; this.reloading = false; this.burstLeft = 0;
      this.game.audio.play('knife');
    }
    throwGrenade(kind) {
      if (this.throwTimer > 0 || this.downed || this.switchTimer > 0) return;
      const g = this.game;
      if (kind === 'grenade') { if (this.grenades <= 0) return; this.grenades--; }
      else if (kind === 'monkey') { if (this.monkeys <= 0) return; this.monkeys--; }
      this.throwTimer = 0.6;
      const dir = ZM.dirFromAngles(this.yaw, this.pitch);
      const start = V.add(this.eyePos(), V.scale(dir, 0.4));
      const vel = V.add(V.scale(dir, kind === 'monkey' ? 11 : 15), { x: 0, y: 3.5, z: 0 });
      g.spawnProjectile({ pos: start, vel, gravity: 9.8, radius: 4.5, splash: kind === 'monkey' ? 1500 : 1000, life: kind === 'monkey' ? 10 : 3.5, kind, owner: 'player' });
      if (kind === 'monkey') g.audio.play('monkey');
    }
    placeClaymore() {
      if (!this.hasClaymores || this.claymores <= 0 || this.downed || this.throwTimer > 0) return;
      const dir = ZM.dirFromAngles(this.yaw, 0);
      const p = V.add(this.pos, V.scale(dir, 0.9));
      if (!this.game.nav.isWalkable(p.x, p.z, this.pos.y)) { this.game.hud.toast('Cannot place here', 1.5); return; }
      p.y = this.game.map.floorHeight(p.x, p.z, this.pos.y);
      if (p.y === null) return;
      this.claymores--; this.throwTimer = 0.5;
      this.game.claymores.push(new ZM.Claymore(this.game, p, this.yaw));
      this.game.audio.play('claymore');
    }

    update(dt, input) {
      const g = this.game;
      // ---- look ----
      if (!this.downed || true) {
        this.yaw -= input.mouseDX * this.sensitivity * (this.ads ? 0.55 : 1);
        this.pitch -= input.mouseDY * (this.invertY ? -1 : 1) * this.sensitivity * (this.ads ? 0.55 : 1);
      }
      // recoil pitch kick & recovery
      this.pitch += this.recoilPitchVel * dt * 0.08;
      this.recoilPitchVel *= Math.pow(0.001, dt);
      this.pitch = U.clamp(this.pitch, -1.45, 1.45);
      this.recoilKick *= Math.pow(0.0005, dt);
      this.flashTimer -= dt; this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.2); this.hitMarker = Math.max(0, this.hitMarker - dt);

      // ---- timers ----
      this.fireTimer -= dt; this.switchTimer = Math.max(0, this.switchTimer - dt); this.throwTimer = Math.max(0, this.throwTimer - dt);
      if (this.reloading) { this.reloadTimer -= dt; if (this.reloadTimer <= 0) this.finishReload(); }
      if (this.meleeTimer > 0) {
        this.meleeTimer -= dt;
        if (!this.meleeHit && this.meleeTimer < 0.4) { this.meleeHit = true; g.meleeAttack(this.bowie ? 1150 : 150); }
      }
      // ---- downed / revive ----
      if (this.downed) {
        this.downTimer -= dt;
        if (this.downTimer <= 0) { if (this.dying) { this.dead = true; g.onPlayerDead(); } else this.revive(); }
        this.moving = false; this.sprinting = false;
        this._applyFloor(dt);
        return;
      }
      // ---- health regen ----
      this.regenTimer -= dt;
      if (this.regenTimer <= 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + this.maxHealth * dt * 0.6);

      // ---- movement ----
      const A = input.actions || new Set(), PA = input.pressedActions || new Set();
      let fx = 0, fz = 0;
      if (A.has('forward')) fz += 1; if (A.has('back')) fz -= 1; if (A.has('left')) fx -= 1; if (A.has('right')) fx += 1;
      let adsHeld;
      if (this.adsToggle) { if (PA.has('ads')) this.adsLatched = !this.adsLatched; adsHeld = this.adsLatched; } else adsHeld = A.has('ads');
      this.ads = adsHeld && this.switchTimer <= 0 && this.meleeTimer <= 0 && !this.sprinting;
      this.adsAmount += ((this.ads ? 1 : 0) - this.adsAmount) * Math.min(1, dt * 12);
      let wantSprint;
      if (this.sprintToggle) { if (PA.has('sprint')) this.sprintLatched = !this.sprintLatched; if (fz <= 0) this.sprintLatched = false; wantSprint = this.sprintLatched; } else wantSprint = A.has('sprint');
      this.sprinting = wantSprint && fz > 0 && !this.ads && !this.reloading && this.meleeTimer <= 0;
      const len = Math.hypot(fx, fz);
      this.moving = len > 0;
      if (len > 0) {
        fx /= len; fz /= len;
        const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
        // forward = (-sin yaw, -cos yaw); right = (cos yaw, -sin yaw)
        const dx = (-sy) * fz + cy * fx, dz = (-cy) * fz + (-sy) * fx;
        const speed = WALK * this.speedMult() * this.speedFactor;
        let nx = this.pos.x + dx * speed * dt, nz = this.pos.z + dz * speed * dt;
        const r = g.map.resolveCircle(nx, nz, RADIUS, this.pos.y + 0.25, this.pos.y + 1.7);
        this.pos.x = r.x; this.pos.z = r.z;
        this.bobPhase += dt * speed * 1.8;
        this.stepTimer -= dt * speed;
        if (this.stepTimer <= 0) { this.stepTimer = 2.4; g.audio.play('footstep', { vol: 0.5 }); }
      }
      this._applyFloor(dt);
      // zombies push the player a bit (prevents overlap)
      for (const z of g.zombies) {
        if (z.dead || z.state === 'rise' || z.state === 'vault' || z.state === 'toWindow' || z.state === 'tear') continue;
        const ox = this.pos.x - z.pos.x, oz = this.pos.z - z.pos.z, od = Math.hypot(ox, oz);
        if (od < 0.6 && od > 1e-4) { const r = g.map.resolveCircle(this.pos.x + ox / od * (0.6 - od), this.pos.z + oz / od * (0.6 - od), RADIUS, this.pos.y + 0.25, this.pos.y + 1.7); this.pos.x = r.x; this.pos.z = r.z; }
      }

      // ---- weapons ----
      const ws = this.weapon(), d = WP.defs[ws.id];
      const mode = WP.fireMode(ws);
      if (PA.has('reload')) this.startReload();
      if (PA.has('weapon1')) this.switchWeapon(0);
      if (PA.has('weapon2')) this.switchWeapon(1);
      if (input.wheel || PA.has('switch')) { this.switchWeapon((this.cur + 1) % this.weapons.length); }
      if (PA.has('melee')) this.doMelee();
      if (PA.has('grenade')) this.throwGrenade('grenade');
      if (PA.has('monkey')) this.throwGrenade('monkey');
      if (PA.has('claymore')) this.placeClaymore();
      const canFire = this.switchTimer <= 0 && this.meleeTimer <= 0 && !this.reloading && this.throwTimer <= 0;
      let wantFire = false;
      if (mode === 'auto') wantFire = A.has('fire');
      else if (mode === 'burst') { if (PA.has('fire') && this.burstLeft === 0) this.burstLeft = 3; wantFire = this.burstLeft > 0; }
      else wantFire = PA.has('fire');
      if (wantFire && canFire) {
        if (this.sprinting) this.sprinting = false;
        if (this.fireTimer <= 0) {
          if (ws.mag <= 0) {
            if (ws.reserve > 0) this.startReload(); else { g.audio.play('dry'); this.fireTimer = 0.25; }
            this.burstLeft = 0;
          } else {
            WP.fire(g, this, ws);
            this.shotsFired++;
            this.fireTimer = 60 / d.rpm / (this.perks.has('double_tap') ? 1.33 : 1);
            if (mode === 'burst') { this.burstLeft--; if (this.burstLeft === 0) this.fireTimer += 0.15; }
            if (mode === 'pump') this.fireTimer = Math.max(this.fireTimer, 60 / d.rpm);
            if (ws.mag === 0 && ws.reserve > 0 && mode !== 'burst') this.autoReloadAt = g.time + 0.35;
          }
        }
      } else if (!wantFire && mode === 'burst') this.burstLeft = 0;
      if (this.autoReloadAt && g.time >= this.autoReloadAt) { this.autoReloadAt = 0; if (ws.mag === 0) this.startReload(); }
    }
    _applyFloor(dt) {
      const g = this.game;
      const fy = g.map.floorHeight(this.pos.x, this.pos.z, this.pos.y);
      if (fy === null) return;
      if (this.pos.y > fy + 0.01) { this.velY -= 20 * dt; this.pos.y += this.velY * dt; if (this.pos.y <= fy) { this.pos.y = fy; this.velY = 0; } }
      else { this.pos.y = fy; this.velY = 0; }
    }

    // ---- viewmodel ----
    drawViewmodel(r) {
      const gl = r.gl, tex = r.textures;
      if (this.dead) return;
      const ws = this.weapon();
      const key = ws.id + (ws.pap ? '+' : '');
      if (!this.vmCache[key]) this.vmCache[key] = WP.buildViewmodel(gl, ws);
      if (!this.handsMesh) {
        const mb = new ZM.MeshBuilder();
        mb.box({ x: -0.045, y: -0.05, z: -0.04 }, { x: 0.045, y: 0.03, z: 0.05 }, { color: [0.35, 0.3, 0.25, 1] });
        this.handsMesh = mb.build(gl);
        this.knifeMesh = WP.knifeMesh(gl); this.bowieMesh = WP.bowieMesh(gl);
      }
      r.beginViewmodel(1.05);
      const m = M4.create();
      // base offset (hip) → ads
      const hip = { x: 0.2, y: -0.19, z: -0.5 }, ads = { x: 0, y: -0.13, z: -0.38 };
      const a = this.adsAmount;
      const off = { x: hip.x + (ads.x - hip.x) * a, y: hip.y + (ads.y - hip.y) * a, z: hip.z + (ads.z - hip.z) * a };
      if (this.moving && !this.downed && this.viewBob) { off.x += Math.sin(this.bobPhase) * 0.012 * (1 - a * 0.8); off.y += Math.abs(Math.cos(this.bobPhase)) * 0.012 * (1 - a * 0.8); }
      let rx = 0, ry = 0, rz = 0;
      if (this.sprinting) { off.y -= 0.08; off.x += 0.05; ry += 0.55; rx += 0.25; }
      if (this.downed) { off.y -= 0.1; rz += 0.4; }
      if (this.reloading) { const t = 1 - this.reloadTimer / this.reloadTotal; const s = Math.sin(t * Math.PI); off.y -= 0.14 * s; rz += 0.45 * s; rx += 0.2 * s; }
      if (this.switchTimer > 0) { const t = this.switchTimer / 0.45; off.y -= 0.35 * t; rx += 0.5 * t; }
      if (this.throwTimer > 0) { const t = this.throwTimer / 0.6; off.y -= 0.2 * Math.sin(t * Math.PI); off.x += 0.1 * Math.sin(t * Math.PI); }
      off.z += this.recoilKick; rx -= this.recoilKick * 2.5;
      const melee = this.meleeTimer > 0;
      if (melee) {
        // knife swipe replaces the gun
        const t = 1 - this.meleeTimer / 0.55; const s = Math.sin(t * Math.PI);
        M4.translate(m, m, { x: 0.25 - 0.45 * s, y: -0.2 + 0.1 * s, z: -0.35 - 0.15 * s });
        M4.rotateZ(m, m, -0.6 + 1.4 * s); M4.rotateX(m, m, -1.1 + 0.5 * s);
        r.draw(this.bowie ? this.bowieMesh : this.knifeMesh, m, tex.white, {});
        return;
      }
      M4.translate(m, m, off);
      M4.rotateX(m, m, rx); M4.rotateY(m, m, ry); M4.rotateZ(m, m, rz);
      M4.scale(m, m, { x: 0.8, y: 0.8, z: 0.8 });
      const papGlow = ws.pap ? [0.08, 0.02, 0.12] : [0, 0, 0];
      r.draw(this.vmCache[key], m, tex.metal, { emissive: papGlow });
      // hands
      const hm = M4.copy(M4.create(), m); M4.translate(hm, hm, { x: 0, y: -0.07, z: 0.06 }); r.draw(this.handsMesh, hm, tex.white, {});
      const d = WP.defs[ws.id];
      if (d.cls !== 'pistol' && d.cls !== 'special') { const fm = M4.copy(M4.create(), m); M4.translate(fm, fm, { x: -0.01, y: -0.06, z: -0.25 }); r.draw(this.handsMesh, fm, tex.white, {}); }
      // muzzle flash
      if (this.flashTimer > 0) {
        const mz = WP.muzzleOffset(ws);
        const p = M4.transformPoint(m, { x: 0, y: 0.01, z: mz });
        const saveR = r.camRight, saveU = r.camUp;
        r.camRight = { x: 1, y: 0, z: 0 }; r.camUp = { x: 0, y: 1, z: 0 };
        const col = d.sound === 'ray' ? [0.4, 1, 0.5, 1] : d.sound === 'wunder' ? [0.5, 0.8, 1, 1] : [1, 0.8, 0.4, 1];
        r.drawParticles([{ pos: p, size: 0.18 + Math.random() * 0.1, color: col }, { pos: p, size: 0.08, color: [1, 1, 1, 1] }], tex.glow, { blend: 'add', depthTest: false });
        r.camRight = saveR; r.camUp = saveU;
      }
    }
  }
  Player.EYE = EYE; Player.RADIUS = RADIUS;
  ZM.Player = Player;
})();


// ===== 90_game.js =====
// ---------------------------------------------------------------------------
// 90_game.js — game state & systems: rounds, spawning, damage/points, doors,
// wall-buys, perks, Mystery Box, power, teleporter links, Pack-a-Punch,
// power-ups, hellhound rounds, and the round-100 mainframe vault.
// ---------------------------------------------------------------------------
(function () {
  const V = ZM.V, U = ZM.U, M4 = ZM.M4, WP = ZM.Weapons;
  const ALIVE_CAP = 24;
  const TRAP_INSTAKILL = true;   // authentic Der Riese traps kill any zombie; set false for 2500 damage instead
  const TRAP_COST = 1000, TRAP_ACTIVE = 25, TRAP_COOLDOWN = 60;
  const VARIANT_OPTS = { '': {}, glow: { unlit: true }, blend: { blend: 'alpha', cull: false, unlit: true } };
  const PERK_COST = { quick_revive: 500, juggernog: 2500, speed_cola: 3000, double_tap: 2000 };
  const PERK_NAME = { quick_revive: 'Quick Revive', juggernog: 'Juggernog', speed_cola: 'Speed Cola', double_tap: 'Double Tap Root Beer' };
  // Static geometry is light-baked in the map; these values light entities / dynamic meshes (moonlit night).
  const ENV = { fogColor: [0.03, 0.038, 0.058], fogNear: 18, fogFar: 72, ambient: [0.13, 0.14, 0.19], sunDir: { x: 0.3, y: 1, z: 0.25 }, sunColor: [0.16, 0.18, 0.26], lights: [], dynLights: [] };

  function zombieCount(r) {
    const table = [6, 8, 13, 18, 24, 27, 28, 28, 29];
    if (r <= 9) return table[r - 1];
    return 24 + Math.floor(0.5 * 6 * (r / 5) * (r * 0.15) + 1e-9);
  }
  function zombieHealth(r) {
    let h = 150;
    for (let i = 2; i <= r; i++) h = i < 10 ? h + 100 : Math.floor(h * 1.1);
    return h;
  }
  function dogHealth(r) { return Math.min(1600, 100 + 100 * r); }

  class Game {
    constructor(renderer, hud, audio) {
      this.renderer = renderer; this.hud = hud; this.audio = audio;
      this.settings = new ZM.Settings();
      this.map = new ZM.GameMap();
      this.nav = new ZM.NavGrid(this.map);
      this._initGraphics();
      this.started = false;
      this.reset();
    }
    _initGraphics() {
      const r = this.renderer, gl = r.gl;
      r.loadTextures(ZM.Textures.all());
      for (const l of this.map.labels) r.textures['label_' + l.key] = r.texture(ZM.Textures.label(l.lines, l.bg, l.fg, l.opts || {}), { repeat: false });
      for (const k in ZM.PowerUp.TYPES) r.textures['pu_' + k] = r.texture(ZM.Textures.label([ZM.PowerUp.TYPES[k].name], 'rgba(0,0,0,0)', '#ffffff', { border: false, size: 40 }), { repeat: false });
      // static geometry grouped per zone chunk (frustum-culled, drawn near-to-far)
      const chunks = {};
      for (const k in this.map.builders) {
        const b = this.map.builders[k];
        const c = chunks[b.zone] || (chunks[b.zone] = { zone: b.zone, meshes: [], min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } });
        const bb = b.bounds();
        for (const a of ['x', 'y', 'z']) { c.min[a] = Math.min(c.min[a], bb.min[a]); c.max[a] = Math.max(c.max[a], bb.max[a]); }
        c.meshes.push({ mesh: b.build(gl), tex: b.tex, variant: b.variant || '' });
      }
      this.staticChunks = Object.values(chunks);
      for (const c of this.staticChunks) c.center = { x: (c.min.x + c.max.x) / 2, y: (c.min.y + c.max.y) / 2, z: (c.min.z + c.max.z) / 2 };
      for (const w of this.map.windows) { const h = w.hole; w.bounds = { min: { x: h.min.x - 0.4, y: h.min.y - 0.2, z: h.min.z - 0.4 }, max: { x: h.max.x + 0.4, y: h.max.y + 0.2, z: h.max.z + 0.4 } }; }
      this.stats = { chunks: 0, windows: 0, zombies: 0 };
      this.bridgeGL = this.map.bridge.mesh.build(gl);
      // sky dome (inward-facing box drawn around the camera), power lever, viewmodel cache for box/PaP displays
      const sky = new ZM.MeshBuilder();
      sky.box({ x: -200, y: -60, z: -200 }, { x: 200, y: 120, z: 200 }, { uvScale: 400, color: [1, 1, 1, 1] });
      this.skyMesh = sky.build(gl);
      const lever = new ZM.MeshBuilder();
      lever.box({ x: -0.04, y: 0, z: -0.04 }, { x: 0.04, y: 0.5, z: 0.04 }, { color: [0.8, 0.1, 0.1, 1] });
      lever.box({ x: -0.07, y: 0.45, z: -0.07 }, { x: 0.07, y: 0.58, z: 0.07 }, { color: [0.1, 0.1, 0.1, 1] });
      this.leverMesh = lever.build(gl);
      this.vmMeshes = {};
      for (const d of this.map.doors) for (const part of d.parts) part.gl = part.mesh.build(gl);
      this.map.gate.gl = this.map.gate.mesh.build(gl);
      for (const w of this.map.windows) w.gl = w.boardMeshes.map(mb => mb.build(gl));
      // mystery box: base + lid (lid local origin at the hinge, back edge)
      const base = new ZM.MeshBuilder(); base.box({ x: -0.75, y: 0, z: -0.45 }, { x: 0.75, y: 0.7, z: 0.45 }, { uvScale: 1, faces: { py: false } });
      base.box({ x: -0.78, y: 0.0, z: -0.48 }, { x: 0.78, y: 0.12, z: 0.48 }, { uvScale: 1, color: [0.6, 0.6, 0.65, 1] });
      this.boxBase = base.build(gl);
      const lid = new ZM.MeshBuilder(); lid.boxUnit({ x: -0.75, y: 0, z: -0.9 }, { x: 0.75, y: 0.12, z: 0 }, {});
      this.boxLid = lid.build(gl);
      const spin = new ZM.MeshBuilder(); spin.box({ x: -0.25, y: -0.08, z: -0.08 }, { x: 0.25, y: 0.08, z: 0.08 }, { color: [1, 1, 1, 1] });
      this.boxSpin = spin.build(gl);
      this.shadowList = [];
    }
    bestRound() { try { return parseInt(localStorage.getItem('derriese_best') || '0', 10) || 0; } catch (e) { return 0; } }
    saveBest() { try { if (this.round > this.bestRound()) localStorage.setItem('derriese_best', String(this.round)); } catch (e) { /* ignore */ } }

    reset() {
      this.time = 0;
      this.player = new ZM.Player(this);
      if (this.settings) this.settings.applyPlayer(this.player);
      this.zombies = []; this.powerups = []; this.projectiles = []; this.claymores = [];
      this.particles = new ZM.Particles(this);
      this.vault = new ZM.Vault();
      this.round = 1; this.roundState = 'intermission'; this.roundTimer = 3; this.toSpawn = 0; this.spawnTimer = 0;
      this.dogRound = false; this.nextDogRound = U.randInt(5, 7); this.lastDogPos = null;
      this.instaKill = 0; this.doublePoints = 0; this.fireSale = 0;
      this.dropsThisRound = 0; this.boardPointsThisRound = 0;
      this.monkey = null;
      this.tempLights = [];
      for (const d of this.map.doors) d.open = false;
      this.map.gate.open = false;
      for (const w of this.map.windows) w.boards = ZM.MAP_CONST.BOARDS;
      for (const id in this.map.zones) this.map.zones[id].open = id === 'S';
      this.map.setBridge(false); this.bridgeAnim = 0;
      for (const t of this.map.traps) { t.active = 0; t.cooldown = 0; t.hurtT = 0; }
      this.nav.rebuild();
      this.power = false; this.map.power.on = false;
      this.links = { A: false, B: false, C: false }; this.pendingLink = null; this.linkTimer = 0; this.teleportCooldown = 0;
      this.box = { spot: this.map.boxSpots[0], state: 'closed', t: 0, uses: 0, weapon: null, display: null, moveTimer: 0 };
      this.pap = { state: 'idle', t: 0 };
      this.flagResult = null; this.flagPending = false; this.flagShown = false;
      this.repairHold = 0;
      this.gameOver = false; this.firstRound = true;
      this.hud.floats = []; this.hud.toasts = []; this.hud.banner = null;
      this.started = true;
    }

    // ======================= ROUNDS =======================
    startRound(r) {
      this.round = r;
      this.dogRound = r === this.nextDogRound;
      if (this.dogRound) { this.nextDogRound = r + U.randInt(4, 5); this.toSpawn = Math.min(10, 6 + Math.floor(r / 5)); this.hud.showBanner('HELLHOUNDS', 'Fetch me their souls!', 4, '#ff8a2a'); this.audio.play('dog_howl'); }
      else { this.toSpawn = zombieCount(r); this.hud.showBanner(`ROUND ${r}`, r === 1 ? 'Survive.' : null, 4); this.audio.play('round_start'); }
      this.roundState = 'active'; this.spawnTimer = 2.0;
      this.dropsThisRound = 0; this.boardPointsThisRound = 0;
      if (this.player.hasClaymores) this.player.claymores = Math.max(this.player.claymores, 2);
      this.saveBest();
    }
    // The ONLY legitimate way the round increases: walks the mainframe chain one step.
    advanceRound() {
      const r = this.round + 1;
      this.vault.advance(r);
      this.startRound(r);
      if (this.vault.isUnlockRound()) this.unlockMainframe();
    }
    unlockMainframe() {
      this.flagResult = this.vault.open();
      this.flagPending = true;
      this.audio.play(this.flagResult.ok ? 'flag' : 'deny');
    }
    spawnInterval() { return this.dogRound ? 1.6 : Math.max(0.15, 2.2 * Math.pow(0.95, this.round)); }
    aliveCount() { let n = 0; for (const z of this.zombies) if (!z.dead) n++; return n; }
    openZone(id) {
      const z = this.map.zones[id];
      if (!z || z.open) return;
      z.open = true;
      for (const [a, b] of this.map.freeLinks) { if (a === id) this.openZone(b); if (b === id) this.openZone(a); }
    }
    activeZones() {
      const pz = this.map.zoneAt(this.player.pos.x, this.player.pos.z) || 'S';
      const set = new Set([pz]);
      for (const d of this.map.doors) if (d.open && d.zones.includes(pz)) for (const z of d.zones) set.add(z);
      for (const [a, b] of this.map.freeLinks) { if (a === pz) set.add(b); if (b === pz) set.add(a); }
      for (const id of [...set]) if (!this.map.zones[id].open) set.delete(id);
      return set;
    }
    pickSpeed(r) {
      const rnd = Math.random();
      const pSprint = Math.min(0.8, Math.max(0, (r - 4) * 0.1));
      const pJog = Math.min(0.9, Math.max(0, (r - 1) * 0.25)) * (1 - pSprint);
      if (rnd < pSprint) return 5.3;
      if (rnd < pSprint + pJog) return 3.0;
      return 1.5;
    }
    spawnZombie() {
      const zones = this.activeZones();
      const cands = [];
      for (const w of this.map.windows) {
        if (!zones.has(w.zone)) continue;
        let crowd = 0; for (const z of this.zombies) if (z.window === w && !z.dead) crowd++;
        if (crowd >= 3) continue;
        cands.push({ kind: 'window', w, pos: w.inside });
      }
      for (const rs of this.map.risers) {
        if (!zones.has(rs.zone)) continue;
        if (V.distXZ(rs, this.player.pos) < 7) continue;
        cands.push({ kind: 'riser', rs, pos: rs });
      }
      if (!cands.length) {
        const c = this.nav.randomCellNear(this.player.pos, 12, 30, true, 60);
        if (!c) return false;
        cands.push({ kind: 'riser', rs: { x: c.x, z: c.z, y: c.y }, pos: c });
      }
      // weight nearer spawners (by path distance)
      let total = 0;
      for (const c of cands) { const d = this.nav.distanceAt(c.pos.x, c.pos.z, c.pos.y || 0); c.wt = 1 / (1 + (isFinite(d) ? d : 200) / 20); total += c.wt; }
      let rr = Math.random() * total, pick = cands[cands.length - 1];
      for (const c of cands) { rr -= c.wt; if (rr <= 0) { pick = c; break; } }
      const hp = zombieHealth(this.round), speed = this.pickSpeed(this.round);
      if (pick.kind === 'window') {
        const w = pick.w;
        const pos = { x: w.outside.x + (Math.random() - 0.5) * 1.2, y: w.outside.y, z: w.outside.z + (Math.random() - 0.5) * 1.2 };
        this.zombies.push(new ZM.Zombie(this, { pos, hp, speed, window: w, state: 'toWindow', yaw: Math.random() * 6 }));
      } else {
        const rs = pick.rs;
        let pos = { x: rs.x + (Math.random() - 0.5) * 1.5, y: rs.y, z: rs.z + (Math.random() - 0.5) * 1.5 };
        if (!this.nav.isWalkable(pos.x, pos.z, rs.y)) pos = { x: rs.x, y: rs.y, z: rs.z };
        pos.y = this.map.floorHeight(pos.x, pos.z, 1000);
        this.zombies.push(new ZM.Zombie(this, { pos, hp, speed, state: 'rise', yaw: Math.random() * 6 }));
        this.particles.dust(pos, 14);
      }
      return true;
    }
    spawnDog() {
      const c = this.nav.randomCellNear(this.player.pos, 9, 18, true, 40);
      if (!c) return false;
      const pos = { x: c.x, y: c.y, z: c.z };
      this.zombies.push(new ZM.Zombie(this, { type: 'dog', pos, hp: dogHealth(this.round), speed: 6.8, state: 'spawn', yaw: Math.random() * 6 }));
      this.particles.lightningStrike(pos);
      this.tempLights.push({ pos: { x: pos.x, y: pos.y + 1.5, z: pos.z }, color: [0.6, 0.7, 1.2], range: 12, t: 0.25, priority: 2 });
      this.audio.play('lightning', { pos, minGap: 0.2 });
      return true;
    }

    // ======================= DAMAGE / POINTS =======================
    damageZombie(z, dmg, info = {}) {
      if (z.dead) return;
      const p = this.player;
      if (info.source === 'bullet' && p.perks.has('double_tap')) dmg *= 2; // Double Tap II
      const killed = z.takeDamage(dmg, info);
      this.particles.blood(info.point || z.chestPos(), killed ? 12 : 4);
      if (info.source !== 'trap') { p.hitMarker = 0.15; p.hitMarkerKill = killed; this.audio.play('hitmarker', { vol: 0.5, minGap: 0.04 }); }
      if (info.source === 'bullet' || info.source === 'melee') p.addPoints(10);
      if (killed) {
        if (info.source === 'melee') p.addPoints(120);
        else if (info.source === 'bullet') p.addPoints(info.head ? 90 : 50);
        else if (info.source !== 'trap') p.addPoints(50);
        p.kills++; if (info.head) p.headshots++;
        this.onZombieKilled(z);
      } else this.audio.play('flesh', { pos: z.pos, vol: 0.6, minGap: 0.05 });
    }
    onZombieKilled(z) {
      if (z.isDog) {
        this.lastDogPos = V.copy(z.pos);
        if (this.dogRound && this.toSpawn === 0 && this.aliveCount() === 0) this.powerups.push(new ZM.PowerUp(this, 'max_ammo', z.pos));
        return;
      }
      if (this.dropsThisRound < 4 && Math.random() < 0.03) {
        const types = ['max_ammo', 'insta_kill', 'double_points', 'nuke'];
        if (this.map.windows.some(w => w.boards < ZM.MAP_CONST.BOARDS)) types.push('carpenter');
        if (this.box.uses >= 2) types.push('fire_sale');
        this.powerups.push(new ZM.PowerUp(this, U.pick(types), z.pos));
        this.dropsThisRound++;
      }
    }
    damagePlayer(amount, src) {
      this.player.takeDamage(amount);
    }
    meleeAttack(dmg) {
      const p = this.player, eye = p.eyePos(), dir = ZM.dirFromAngles(p.yaw, p.pitch);
      let best = null, bd = 2.1;
      for (const z of this.zombies) {
        if (!z.hittable()) continue;
        const to = V.sub(z.chestPos(), eye), d = V.len(to);
        if (d > 2.1 + z.radius) continue;
        if (V.dot(V.scale(to, 1 / d), dir) < 0.55) continue;
        if (d < bd) { bd = d; best = z; }
      }
      if (best) {
        this.damageZombie(best, dmg * (this.instaKill > 0 ? 1e9 : 1), { head: false, point: best.chestPos(), source: 'melee' });
      }
    }
    explode(pos, radius, dmg, opts = {}) {
      this.particles.explosion(pos, radius);
      this.audio.play(opts.ray ? 'shot_ray' : 'explosion', { pos, vol: 1 });
      this.tempLights.push({ pos: { x: pos.x, y: pos.y + 0.5, z: pos.z }, color: [1.5, 0.9, 0.4], range: radius * 3, t: 0.15, priority: 2 });
      for (const z of this.zombies) {
        if (!z.hittable()) continue;
        const d = V.dist(z.chestPos(), pos) - z.radius;
        if (d > radius) continue;
        const f = 1 - 0.6 * Math.max(0, d) / radius;
        this.damageZombie(z, dmg * f, { head: false, point: z.chestPos(), source: opts.source || 'explosion' });
      }
      const p = this.player;
      if (!opts.noSelf) {
        const d = V.dist(p.eyePos(), pos);
        if (d < radius * 0.8) p.takeDamage(Math.min(40, dmg * 0.06 * (1 - d / radius)));
      }
    }
    spawnProjectile(o) { this.projectiles.push(new ZM.Projectile(this, o)); }
    monkeyLanded(proj) { this.monkey = proj; this.nav.computeField(proj.pos, 'monkey'); }
    muzzleFlash(origin, dir) {
      this.tempLights.push({ pos: V.add(origin, V.scale(dir, 0.8)), color: [1.2, 0.9, 0.5], range: 8, t: 0.06, priority: 3 });
      this.particles.muzzleSmoke(V.add(origin, V.scale(dir, 0.9)));
    }
    ripBoard(w, z) {
      if (w.boards > 0) { w.boards--; this.audio.play('board_rip', { pos: w.inside }); }
    }

    // ======================= POWER-UPS =======================
    collectPowerUp(pu) {
      const p = this.player, t = pu.type;
      this.audio.play('powerup');
      this.hud.toast(ZM.PowerUp.TYPES[t].name, 2.5, '#ffd27a');
      switch (t) {
        case 'max_ammo': p.maxAmmo(); break;
        case 'insta_kill': this.instaKill = 30; break;
        case 'double_points': this.doublePoints = 30; break;
        case 'nuke': {
          this.audio.play('nuke'); this.hud.whiteFlash(1.2);
          for (const z of this.zombies) if (!z.dead) { z.die({ source: 'explosion' }); p.kills++; }
          p.addPoints(400);
          break;
        }
        case 'carpenter': { for (const w of this.map.windows) w.boards = ZM.MAP_CONST.BOARDS; p.addPoints(200); this.audio.play('boards'); break; }
        case 'fire_sale': this.fireSale = 30; break;
      }
    }

    // ======================= INTERACTION =======================
    boxCost() { return this.fireSale > 0 ? 10 : 950; }
    boxActiveSpots() { return this.fireSale > 0 ? this.map.boxSpots : [this.box.spot]; }
    findInteraction() {
      const p = this.player, pos = p.pos, m = this.map;
      const near = (q, r) => V.distXZ(pos, q) < r && Math.abs((q.y || 0) - pos.y) < 2.2;
      let best = null;
      const consider = (dist, obj) => { if (!best || dist < best.dist) best = Object.assign({ dist }, obj); };
      for (const d of m.doors) {
        if (d.open) continue;
        const c = { x: (d.min.x + d.max.x) / 2, y: d.min.y, z: (d.min.z + d.max.z) / 2 };
        if (near(c, 2.3)) consider(V.distXZ(pos, c), { text: `Press F to open ${d.label} [Cost: ${d.cost}]`, can: p.points >= d.cost, action: () => this.buyDoor(d) });
      }
      for (const wb of m.wallbuys) {
        if (!near(wb.pos, 1.9)) continue;
        const dist = V.distXZ(pos, wb.pos);
        if (wb.weapon === 'bowie') { if (!p.bowie) consider(dist, { text: 'Press F to buy Bowie Knife [Cost: 3000]', can: p.points >= 3000, action: () => this.buyBowie() }); continue; }
        if (wb.weapon === 'claymore') { consider(dist, p.hasClaymores ? { text: 'Claymores purchased (2 per round)', can: true, action: () => {} } : { text: 'Press F to buy Claymores [Cost: 1000]', can: p.points >= 1000, action: () => this.buyClaymores() }); continue; }
        const def = WP.defs[wb.weapon];
        if (p.hasWeapon(wb.weapon)) { const ws = p.weapons.find(w => w.id === wb.weapon); const cost = ws.pap ? 4500 : Math.floor(def.wall / 2); consider(dist, { text: `Press F to buy ammo [Cost: ${cost}]`, can: p.points >= cost, action: () => this.buyAmmo(wb.weapon, cost) }); }
        else consider(dist, { text: `Press F to buy ${def.name} [Cost: ${def.wall}]`, can: p.points >= def.wall, action: () => this.buyWeapon(wb.weapon, def.wall) });
      }
      for (const pk of m.perks) {
        if (!near(pk.pos, 2.0)) continue;
        const dist = V.distXZ(pos, pk.pos), cost = PERK_COST[pk.id];
        if (p.perks.has(pk.id)) continue;
        if (pk.id === 'quick_revive' && p.qrBuys >= 3) { consider(dist, { text: 'Quick Revive is gone', can: false, action: () => {} }); continue; }
        if (!this.power && pk.id !== 'quick_revive') { consider(dist, { text: 'The power must be activated first', can: false, action: () => this.audio.play('deny') }); continue; }
        if (p.perks.size >= 4) { consider(dist, { text: 'You already have 4 perks', can: false, action: () => this.audio.play('deny') }); continue; }
        consider(dist, { text: `Press F to buy ${PERK_NAME[pk.id]} [Cost: ${cost}]`, can: p.points >= cost, action: () => this.buyPerk(pk.id, cost) });
      }
      for (const spot of this.boxActiveSpots()) {
        if (!near(spot.pos, 2.4)) continue;
        const dist = V.distXZ(pos, spot.pos), b = this.box;
        if (this.fireSale <= 0 && b.moveTimer > 0) { consider(dist, { text: 'The box is moving…', can: false, action: () => {} }); continue; }
        if (b.state === 'closed') consider(dist, { text: `Press F for Mystery Box [Cost: ${this.boxCost()}]`, can: p.points >= this.boxCost(), action: () => this.useBox(spot) });
        else if (b.state === 'offer' && b.spot === spot) consider(dist, { text: `Press F to take ${WP.defs[b.weapon].name}`, can: true, action: () => this.takeBoxWeapon() });
        else consider(dist, { text: 'Mystery Box', can: false, action: () => {} });
      }
      if (near(m.power.pos, 2.2) && !this.power) consider(V.distXZ(pos, m.power.pos), { text: 'Press F to turn on the power', can: true, action: () => this.turnOnPower() });
      for (const t of m.traps) {
        if (!near(t.switchPos, 2.2)) continue;
        const dist = V.distXZ(pos, t.switchPos);
        if (!this.power) consider(dist, { text: 'The trap needs power', can: false, action: () => this.audio.play('deny') });
        else if (t.active > 0) consider(dist, { text: `Electric trap active (${Math.ceil(t.active)}s)`, can: false, action: () => {} });
        else if (t.cooldown > 0) consider(dist, { text: `Trap recharging (${Math.ceil(t.cooldown)}s)`, can: false, action: () => {} });
        else consider(dist, { text: `Press F to activate the electric trap [Cost: ${TRAP_COST}]`, can: p.points >= TRAP_COST, action: () => this.activateTrap(t) });
      }
      for (const t of m.teleporters) {
        if (!near(t.pos, 1.9)) continue;
        const dist = V.distXZ(pos, t.pos);
        if (!this.power) { consider(dist, { text: 'The teleporter needs power', can: false, action: () => this.audio.play('deny') }); continue; }
        if (!this.links[t.id]) { if (this.pendingLink === t.id) consider(dist, { text: 'Link active — return to the mainframe!', can: false, action: () => {} }); else consider(dist, { text: `Press F to activate Teleporter ${t.id} link`, can: true, action: () => this.activateLink(t) }); continue; }
        if (this.teleportCooldown > 0) { consider(dist, { text: `Teleporter recharging (${Math.ceil(this.teleportCooldown)}s)`, can: false, action: () => {} }); continue; }
        consider(dist, { text: 'Press F to teleport to the mainframe [Cost: 1500]', can: p.points >= 1500, action: () => this.useTeleporter(t) });
      }
      if (this.pendingLink && V.distXZ(pos, m.mainframe.pos) < m.mainframe.radius + 0.6) consider(0.1, { text: `Press F to link Teleporter ${this.pendingLink} to the mainframe`, can: true, action: () => this.completeLink() });
      if (near(m.pap.pos, 2.2)) {
        const dist = V.distXZ(pos, m.pap.pos);
        if (!this.map.gate.open) consider(dist, { text: 'Link all three teleporters to the mainframe to unlock Pack-a-Punch', can: false, action: () => this.audio.play('deny') });
        else if (this.pap.state === 'working') consider(dist, { text: 'Upgrading…', can: false, action: () => {} });
        else if (p.weapon().pap) consider(dist, { text: 'This weapon is already upgraded', can: false, action: () => this.audio.play('deny') });
        else consider(dist, { text: `Press F to upgrade ${WP.nameOf(p.weapon())} [Cost: 5000]`, can: p.points >= 5000, action: () => this.usePap() });
      }
      // barrier repair
      for (const w of m.windows) {
        if (w.boards >= ZM.MAP_CONST.BOARDS) continue;
        if (!near(w.inside, 2.0)) continue;
        if (this.zombies.some(z => z.window === w && (z.state === 'vault'))) continue;
        consider(V.distXZ(pos, w.inside) + 0.5, { text: 'Hold F to rebuild barrier', can: true, hold: true, window: w, action: () => {} });
      }
      return best;
    }
    tryInteract() {
      const it = this.player.interact;
      if (!it || this.player.downed) return;
      if (it.hold) return;
      if (it.can === false) { this.audio.play('deny'); if (it.text.includes('Cost')) this.hud.toast('Not enough points', 1.5, '#ff8080'); return; }
      it.action();
    }
    spend(cost) { if (!this.player.spend(cost)) { this.audio.play('deny'); this.hud.toast('Not enough points', 1.5, '#ff8080'); return false; } this.audio.play('buy'); return true; }
    buyDoor(d) {
      if (!this.spend(d.cost)) return;
      d.open = true; this.nav.update();
      for (const z of d.zones) this.openZone(z);
      this.audio.play('door', { pos: { x: (d.min.x + d.max.x) / 2, y: 1, z: (d.min.z + d.max.z) / 2 } });
      this.particles.dust({ x: (d.min.x + d.max.x) / 2, y: d.min.y, z: (d.min.z + d.max.z) / 2 }, 20);
    }
    buyWeapon(id, cost) { if (!this.spend(cost)) return; this.player.giveWeapon(id); this.hud.toast(`${WP.defs[id].name} acquired`, 2); }
    buyAmmo(id, cost) { const ws = this.player.weapons.find(w => w.id === id); if (ws.reserve >= WP.maxReserve(ws)) { this.hud.toast('Ammo already full', 1.5); return; } if (!this.spend(cost)) return; this.player.refillWeapon(id); }
    buyBowie() { if (!this.spend(3000)) return; this.player.bowie = true; this.hud.toast('Bowie Knife acquired', 2); }
    buyClaymores() { if (!this.spend(1000)) return; this.player.hasClaymores = true; this.player.claymores = 2; this.hud.toast('Claymores acquired (C to place)', 3); }
    buyPerk(id, cost) { if (!this.spend(cost)) return; this.player.applyPerk(id); this.audio.play('perk'); this.hud.toast(`${PERK_NAME[id]}!`, 2.5, '#ffd27a'); }
    turnOnPower() {
      this.power = true; this.map.power.on = true;
      this.audio.play('power'); this.hud.toast('The power is on. The bridge is lowering and the factory doors are open.', 5, '#ffe36b');
      for (const d of this.map.doors) if (d.power && !d.open) { d.open = true; for (const z of d.zones) this.openZone(z); }
      this.nav.update();
      this.bridgeAnim = 4; // seconds of lowering animation; the deck becomes solid when it lands
    }
    activateTrap(t) {
      if (!this.spend(TRAP_COST)) return;
      t.active = TRAP_ACTIVE; t.cooldown = 0;
      this.audio.play('power', { pos: t.switchPos });
      this.hud.toast('Electric trap active', 2, '#ffe36b');
    }
    trapContains(t, p, r = 0.3) { return p.x > t.min.x - r && p.x < t.max.x + r && p.z > t.min.z - r && p.z < t.max.z + r && p.y + 1.2 > t.min.y && p.y < t.max.y; }
    vmMesh(id, pap) { const k = id + (pap ? '+' : ''); if (!this.vmMeshes[k]) this.vmMeshes[k] = WP.buildViewmodel(this.renderer.gl, { id, pap: !!pap }); return this.vmMeshes[k]; }
    activateLink(t) {
      this.pendingLink = t.id; this.linkTimer = 30; this.audio.play('link');
      this.hud.toast(`Teleporter ${t.id} link active — get to the mainframe within 30 seconds`, 4, '#8fd3ff');
      this.particles.teleportFx(t.pos);
    }
    completeLink() {
      const id = this.pendingLink; if (!id) return;
      this.links[id] = true; this.pendingLink = null; this.linkTimer = 0;
      this.audio.play('link'); this.particles.teleportFx(this.map.mainframe.pos);
      const n = Object.values(this.links).filter(Boolean).length;
      if (n === 3) { this.map.gate.open = true; this.nav.update(); this.audio.play('power'); this.hud.toast('All teleporters linked. Pack-a-Punch is available at the mainframe!', 6, '#ff7bd5'); }
      else this.hud.toast(`Teleporter ${id} linked (${n}/3)`, 3, '#8fd3ff');
    }
    useTeleporter(t) {
      if (!this.spend(1500)) return;
      this.audio.play('teleport'); this.particles.teleportFx(t.pos);
      this.hud.whiteFlash(1.6);
      const p = this.player, mf = this.map.mainframe.pos;
      p.pos.x = mf.x + (Math.random() - 0.5); p.pos.z = mf.z + 1.9 + (Math.random() - 0.5); p.pos.y = this.map.floorHeight(p.pos.x, p.pos.z, 1000);
      this.particles.teleportFx(mf);
      this.teleportCooldown = 10;
      // zombies near the pad lose the scent briefly: they re-path automatically via the flow field
    }
    useBox(spot) {
      if (!this.spend(this.boxCost())) return;
      const b = this.box; b.spot = spot; b.state = 'rolling'; b.t = 0; b.uses++;
      b.display = WP.rollBox();
      this.audio.play('box');
      const teddy = this.fireSale <= 0 && b.uses >= 4 && Math.random() < Math.min(0.5, 0.12 + (b.uses - 4) * 0.05);
      b.teddy = teddy;
    }
    takeBoxWeapon() {
      const b = this.box; if (b.state !== 'offer') return;
      this.player.giveWeapon(b.weapon);
      this.hud.toast(`${WP.defs[b.weapon].name} acquired`, 2);
      b.state = 'closed'; b.weapon = null; b.t = 0;
    }
    usePap() {
      if (!this.spend(5000)) return;
      this.pap.state = 'working'; this.pap.t = 3; this.pap.slot = this.player.cur;
      this.player.switchTimer = 3.2; this.audio.play('pap');
    }

    // ======================= UPDATE =======================
    update(dt, input) {
      this.settings.translate(input);
      this.time += dt;
      const p = this.player;
      if (this.gameOver) return;
      // interaction target
      p.interact = this.findInteraction();
      if (input.pressedActions.has('interact')) this.tryInteract();
      if (p.interact && p.interact.hold && input.actions.has('interact') && !p.downed) {
        this.repairHold += dt;
        if (this.repairHold >= 0.7) { this.repairHold = 0; const w = p.interact.window; w.boards++; this.audio.play('boards', { pos: w.inside }); if (this.boardPointsThisRound < 150) { p.addPoints(10); this.boardPointsThisRound += 10; } }
      } else this.repairHold = 0;
      p.update(dt, input);
      this.audio.setListener(p.pos);
      // flow field toward the player (cheap: no-op if the target cell didn't change)
      this.nav.computeField(p.pos);
      // bridge lowering + traps
      if (this.bridgeAnim > 0) { this.bridgeAnim -= dt; if (this.bridgeAnim <= 0) { this.bridgeAnim = 0; this.map.setBridge(true); this.nav.rebuild(); this.audio.play('door', { pos: { x: -2, y: 3.5, z: 0 } }); this.hud.toast('The bridge is down', 2.5, '#ffe36b'); } }
      for (const t of this.map.traps) {
        if (t.active > 0) {
          t.active -= dt; t.hurtT -= dt;
          if (t.active <= 0) { t.active = 0; t.cooldown = TRAP_COOLDOWN; }
          for (const z of this.zombies) if (z.hittable() && this.trapContains(t, z.pos, z.radius)) this.damageZombie(z, TRAP_INSTAKILL ? 1e9 : 2500 * dt * 4, { head: false, point: z.chestPos(), source: 'trap' });
          if (this.trapContains(t, p.pos, 0.35) && t.hurtT <= 0) { t.hurtT = 0.5; p.takeDamage(100); }
          const [a, b] = t.ends, h = 0.3 + Math.random() * 2.2, h2 = 0.3 + Math.random() * 2.2;
          this.particles.arc({ x: a.x, y: t.min.y + h, z: a.z }, { x: b.x, y: t.min.y + h2, z: b.z }, 0.12, [0.6, 0.85, 1]);
          if (Math.random() < 0.3) this.audio.play('lightning', { pos: { x: (a.x + b.x) / 2, y: t.min.y + 1, z: (a.z + b.z) / 2 }, vol: 0.5, minGap: 0.25 });
          this.tempLights.push({ pos: { x: (a.x + b.x) / 2, y: t.min.y + 1.5, z: (a.z + b.z) / 2 }, color: [0.5, 0.7, 1.2], range: 8, t: 0.05, priority: 1 });
        } else if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - dt);
      }
      for (const f of this.map.fires) if (Math.random() < 0.6) this.particles.fire(f);
      // timers
      this.instaKill = Math.max(0, this.instaKill - dt); this.doublePoints = Math.max(0, this.doublePoints - dt); this.fireSale = Math.max(0, this.fireSale - dt);
      this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
      if (this.pendingLink) { this.linkTimer -= dt; if (this.linkTimer <= 0) { this.pendingLink = null; this.hud.toast('Link failed — the teleporter reset', 3, '#ff8080'); this.audio.play('deny'); } }
      if (this.pap.state === 'working') { this.pap.t -= dt; if (this.pap.t <= 0) { const ws = p.weapons[this.pap.slot]; if (ws) { p.weapons[this.pap.slot] = WP.makeState(ws.id, true); } this.pap.state = 'idle'; this.hud.toast(`${WP.nameOf(p.weapons[this.pap.slot] || ws)} — upgraded!`, 3, '#ff7bd5'); } }
      // mystery box
      const b = this.box;
      if (b.state === 'rolling') { b.t += dt; if (Math.floor(b.t / 0.12) !== Math.floor((b.t - dt) / 0.12)) b.display = WP.rollBox(); if (b.t >= 3.6) { if (b.teddy) { b.state = 'closed'; b.t = 0; this.audio.play('teddy'); p.points += this.boxCost(); this.hud.toast('The box has moved!', 3, '#ff8080'); const others = this.map.boxSpots.filter(s => s !== b.spot); b.spot = U.pick(others); b.moveTimer = 6; b.uses = 0; } else { b.state = 'offer'; b.weapon = b.display; b.t = 0; } } }
      else if (b.state === 'offer') { b.t += dt; if (b.t >= 10) { b.state = 'closed'; b.weapon = null; b.t = 0; } }
      if (b.moveTimer > 0) b.moveTimer -= dt;
      // rounds
      if (this.roundState === 'intermission') { this.roundTimer -= dt; if (this.roundTimer <= 0) { if (this.firstRound) { this.firstRound = false; this.startRound(1); } else this.advanceRound(); } }
      else if (this.roundState === 'active') {
        this.spawnTimer -= dt;
        if (this.toSpawn > 0 && this.spawnTimer <= 0 && this.aliveCount() < ALIVE_CAP) {
          const ok = this.dogRound ? this.spawnDog() : this.spawnZombie();
          if (ok) { this.toSpawn--; this.spawnTimer = this.spawnInterval(); } else this.spawnTimer = 0.5;
        }
        if (this.toSpawn === 0 && this.aliveCount() === 0) { this.roundState = 'intermission'; this.roundTimer = this.dogRound ? 3 : 6; this.audio.play('round_end'); }
      }
      // entities
      for (const z of this.zombies) z.update(dt);
      this.zombies = this.zombies.filter(z => !z.remove);
      for (const pu of this.powerups) pu.update(dt);
      this.powerups = this.powerups.filter(x => !x.remove);
      for (const pr of this.projectiles) pr.update(dt);
      this.projectiles = this.projectiles.filter(x => !x.remove);
      for (const c of this.claymores) c.update(dt);
      this.claymores = this.claymores.filter(x => !x.remove);
      this.particles.update(dt);
      for (const l of this.tempLights) l.t -= dt;
      this.tempLights = this.tempLights.filter(l => l.t > 0);
    }
    onPlayerDead() { this.gameOver = true; this.saveBest(); }

    // ======================= RENDER =======================
    cameraFov() {
      const p = this.player, d = p.weaponDef();
      const adsFov = d.cls === 'sniper' ? 0.35 : 0.85;
      const base = (this.settings.get('fov') || 70) * Math.PI / 180;
      const ads = d.cls === 'sniper' ? adsFov : base * 0.7;
      return base + (ads - base) * p.adsAmount + (p.sprinting ? 0.08 : 0);
    }
    worldToScreen(pt) {
      const r = this.renderer;
      const v = M4.transformPoint(r.view, pt);
      const pr = r.proj;
      const cx = pr[0] * v.x + pr[8] * v.z, cy = pr[5] * v.y + pr[9] * v.z, cw = -v.z;
      if (cw <= 0.01) return null;
      return { x: (cx / cw * 0.5 + 0.5) * r.canvas.width, y: (1 - (cy / cw * 0.5 + 0.5)) * r.canvas.height, depth: cw };
    }
    draw() {
      const r = this.renderer, p = this.player, tex = r.textures, m = this.map;
      const cam = { pos: p.eyePos(), yaw: p.yaw, pitch: p.pitch, fov: this.cameraFov() };
      if (p.hurtFlash > 0) cam.pitch += (Math.random() - 0.5) * 0.01 * p.hurtFlash;
      const dyn = this.tempLights.slice();
      for (const pu of this.powerups) dyn.push({ pos: pu.pos, color: ZM.PowerUp.TYPES[pu.type].color, range: 6 });
      if (this.power) dyn.push({ pos: { x: m.power.pos.x, y: 1.5, z: m.power.pos.z - 1 }, color: [1, 0.8, 0.3], range: 6 });
      ENV.dynLights = dyn; ENV.lights = m.lights.concat(dyn);
      r.beginFrame(cam, ENV);
      r.lightMode(true); // static chunks: baked vertex light + dynamic lights only
      { const sm = M4.create(); M4.translate(sm, sm, cam.pos); r.draw(this.skyMesh, sm, tex.sky, { unlit: true, depthTest: false, cull: false }); }
      // Visible rooms: only zones opened so far (closed doors are opaque), inside the view frustum, nearest first.
      const pz = m.zoneAt(p.pos.x, p.pos.z);
      // zones connected to the player's zone through open doors (closed doors are opaque)
      const seen = new Set([pz || 'S']); let grew = true;
      while (grew) {
        grew = false;
        for (const d of m.doors) if (d.open && d.zones.some(z => seen.has(z))) for (const z of d.zones) if (!seen.has(z)) { seen.add(z); grew = true; }
        for (const l of (m.sightLinks || [])) if (l.some(z => seen.has(z))) for (const z of l) if (!seen.has(z)) { seen.add(z); grew = true; } // fences
      }
      const visZone = (z) => seen.has(z);
      const vis = [];
      for (const c of this.staticChunks) {
        if (!visZone(c.zone)) continue;
        if (!r.aabbVisible(c.min, c.max)) continue;
        const dx = Math.max(c.min.x - cam.pos.x, 0, cam.pos.x - c.max.x), dz = Math.max(c.min.z - cam.pos.z, 0, cam.pos.z - c.max.z);
        c.dist = dx * dx + dz * dz;
        vis.push(c);
      }
      vis.sort((a, b) => a.dist - b.dist);
      this.stats.chunks = vis.length;
      const blended = [];
      for (const c of vis) for (const mm of c.meshes) { if (mm.variant === 'blend') blended.push(mm); else r.draw(mm.mesh, null, tex[mm.tex] || tex.white, VARIANT_OPTS[mm.variant] || {}); }
      r.lightMode(false); // everything else: ambient + nearest lamps
      for (const d of m.doors) if (!d.open && d.zones.some(visZone) && r.aabbVisible(d.min, d.max)) for (const part of d.parts) r.draw(part.gl, null, tex[part.tex], {});
      if (!m.gate.open && r.aabbVisible(m.gate.min, m.gate.max)) r.draw(m.gate.gl, null, tex.metal, {});
      let nw = 0;
      for (const w of m.windows) {
        if (!w.boards || !visZone(w.zone) || !r.aabbVisible(w.bounds.min, w.bounds.max)) continue;
        nw++;
        for (let i = 0; i < w.boards; i++) r.draw(w.gl[i], null, tex.wood, {});
      }
      this.stats.windows = nw;
      // bridge (static once lowered; animated while lowering)
      if (m.bridge.lowered || this.bridgeAnim > 0) { const bm = M4.create(); M4.translate(bm, bm, { x: 0, y: this.bridgeAnim > 0 ? 7 * (this.bridgeAnim / 4) : 0, z: 0 }); r.draw(this.bridgeGL, bm, tex.metal, {}); }
      // power lever
      { const pw = m.power, f = ZM.GameMap.facingVec(pw.facing); const lm = M4.create(); M4.translate(lm, lm, { x: pw.panel.x + f.x * 0.15, y: pw.panel.y + 1.05, z: pw.panel.z + f.z * 0.15 }); const ang = this.power ? 0.9 : -0.9; if (f.z !== 0) M4.rotateX(lm, lm, ang * f.z); else M4.rotateZ(lm, lm, -ang * f.x); r.draw(this.leverMesh, lm, tex.white, {}); r.drawParticles([{ pos: { x: pw.panel.x + f.x * 0.2, y: pw.panel.y + 1.7, z: pw.panel.z + f.z * 0.2 }, size: 0.25, color: this.power ? [0.3, 1, 0.4, 1] : [1, 0.2, 0.1, 1] }], tex.glow, { blend: 'add' }); }
      // Pack-a-Punch upgrade animation: the weapon slides into the machine and comes back glowing
      if (this.pap.state === 'working') {
        const ws = p.weapons[this.pap.slot]; if (ws) {
          const t = 1 - this.pap.t / 3, f = ZM.GameMap.facingVec(m.pap.facing), mc = m.pap.machine;
          const inward = t < 0.45 ? 1 - t / 0.45 : t > 0.7 ? (t - 0.7) / 0.3 : 0;
          const wm = M4.create(); M4.translate(wm, wm, { x: mc.x + f.x * (0.3 + inward * 1.0), y: mc.y + 1.05, z: mc.z + f.z * (0.3 + inward * 1.0) }); M4.rotateY(wm, wm, Math.atan2(f.x, f.z) + Math.PI / 2); M4.scale(wm, wm, { x: 2, y: 2, z: 2 });
          if (inward > 0.05) r.draw(this.vmMesh(ws.id, t > 0.7), wm, tex.metal, { emissive: t > 0.7 ? [0.25, 0.1, 0.35] : [0, 0, 0] });
          r.drawParticles([{ pos: { x: mc.x, y: mc.y + 2.1, z: mc.z }, size: 1.2 + Math.sin(this.time * 20) * 0.3, color: [1, 0.4, 0.9, 0.8] }], tex.glow, { blend: 'add' });
        }
      }
      // mystery box(es)
      for (const spot of this.boxActiveSpots()) {
        const b = this.box, isMain = spot === b.spot;
        if (isMain && b.moveTimer > 0 && this.fireSale <= 0) continue;
        const mm = M4.create(); M4.translate(mm, mm, spot.pos);
        r.draw(this.boxBase, mm, tex.wood, {});
        const open = isMain && (b.state === 'rolling' || b.state === 'offer');
        const lm = M4.copy(M4.create(), mm); M4.translate(lm, lm, { x: 0, y: 0.7, z: 0.45 }); M4.rotateX(lm, lm, open ? -1.9 : 0);
        r.draw(this.boxLid, lm, tex.boxLid, {});
        if (open) {
          const sm = M4.copy(M4.create(), mm); M4.translate(sm, sm, { x: 0, y: 1.0 + (b.state === 'rolling' ? Math.min(1, b.t / 3.6) * 0.6 : 0.6), z: 0 }); M4.rotateY(sm, sm, this.time * 3);
          M4.scale(sm, sm, { x: 1.6, y: 1.6, z: 1.6 });
          const shown = b.state === 'rolling' ? b.display : b.weapon;
          if (shown) r.draw(this.vmMesh(shown, false), sm, tex.metal, { emissive: [0.15, 0.12, 0.05] });
          r.drawParticles([{ pos: { x: spot.pos.x, y: spot.pos.y + 1.4, z: spot.pos.z }, size: 1.6, color: [1, 0.85, 0.4, 0.5] }], tex.glow, { blend: 'add' });
        }
        r.drawParticles([{ pos: { x: spot.pos.x, y: spot.pos.y, z: spot.pos.z }, end: { x: spot.pos.x, y: spot.pos.y + 25, z: spot.pos.z }, width: 0.6, color: this.fireSale > 0 ? [1, 0.5, 0.9, 0.2] : [0.6, 0.8, 1, 0.16] }], tex.white, { blend: 'add' });
      }
      if (this.box.moveTimer > 0 && this.fireSale <= 0) { const s = this.box.spot.pos; r.drawParticles([{ pos: { x: s.x, y: s.y, z: s.z }, end: { x: s.x, y: s.y + 25, z: s.z }, width: 0.6, color: [0.6, 0.8, 1, 0.3] }], tex.white, { blend: 'add' }); }
      // teleporter pads glow when powered
      if (this.power) for (const t of m.teleporters) r.drawParticles([{ pos: { x: t.pos.x, y: t.pos.y + 0.25, z: t.pos.z }, size: 3.2, color: [0.4, 0.7, 1, this.links[t.id] ? 0.35 : 0.2], flat: true }], tex.glow, { blend: 'add' });
      if (this.pendingLink || this.power) r.drawParticles([{ pos: { x: m.mainframe.pos.x, y: m.mainframe.pos.y + 0.5, z: m.mainframe.pos.z }, size: 5, color: [0.4, 0.7, 1, this.pendingLink ? 0.35 + 0.2 * Math.sin(this.time * 6) : 0.15], flat: true }], tex.glow, { blend: 'add' });
      if (m.gate.open) r.drawParticles([{ pos: { x: m.pap.machine.x, y: 2.0, z: m.pap.machine.z }, size: 2.0, color: [1, 0.4, 0.9, 0.3] }], tex.glow, { blend: 'add' });
      for (const mm of blended) r.draw(mm.mesh, null, tex[mm.tex] || tex.white, VARIANT_OPTS.blend);
      // entities
      this.shadowList.length = 0;
      let nz = 0;
      for (const z of this.zombies) {
        if (!r.aabbVisible({ x: z.pos.x - 1, y: z.pos.y - 0.5, z: z.pos.z - 1 }, { x: z.pos.x + 1, y: z.pos.y + 2.2, z: z.pos.z + 1 })) continue;
        nz++; z.draw(r, this.shadowList);
      }
      this.stats.zombies = nz;
      if (this.shadowList.length) r.drawParticles(this.shadowList, tex.blob, { blend: 'alpha' });
      for (const pu of this.powerups) pu.draw(r);
      for (const pr of this.projectiles) pr.draw(r);
      for (const c of this.claymores) c.draw(r);
      this.particles.draw(r);
      // viewmodel
      p.drawViewmodel(r);
    }
  }
  Game.zombieCount = zombieCount; Game.zombieHealth = zombieHealth; Game.dogHealth = dogHealth;
  ZM.Game = Game;
})();


// ===== 95_hud.js =====
// ---------------------------------------------------------------------------
// 95_hud.js — Canvas2D HUD: points, round, ammo, perks, crosshair, prompts,
// power-up timers, damage overlay, round banners, toasts and menu screens.
// ---------------------------------------------------------------------------
(function () {
  const PERK_STYLE = {
    juggernog: { l: 'J', c: '#d0312d' }, speed_cola: { l: 'S', c: '#3fb44a' }, double_tap: { l: 'D', c: '#e3a21a' }, quick_revive: { l: 'Q', c: '#3b8ad9' },
  };
  class HUD {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.floats = []; this.toasts = []; this.banner = null; this.subBanner = null; this.flash = 0; this.fps = 0; this.showDebug = false;
      this.width = 0; this.height = 0;
    }
    // The HUD is rendered to an offscreen canvas (capped resolution) and composited by the WebGL renderer.
    resize(w, h) { const k = Math.min(1, 1600 / Math.max(1, w)); this.width = Math.round(w * k); this.height = Math.round(h * k); this.canvas.width = this.width; this.canvas.height = this.height; this.dirty = true; }
    pointsFloat(n) { this.floats.push({ n, t: 0 }); if (this.floats.length > 8) this.floats.shift(); }
    toast(text, dur = 3, color = '#fff') { this.toasts.push({ text, t: dur, max: dur, color }); if (this.toasts.length > 4) this.toasts.shift(); }
    showBanner(text, sub, dur = 4, color = '#c81e1e') { this.banner = { text, sub, t: dur, max: dur, color }; }
    whiteFlash(a = 1) { this.flash = a; }
    font(size, bold = true) { return `${bold ? 'bold ' : ''}${size}px Impact, "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; }
    text(str, x, y, size, color = '#fff', align = 'left', opts = {}) {
      const c = this.ctx;
      c.font = this.font(size, opts.bold !== false);
      c.textAlign = align; c.textBaseline = opts.baseline || 'alphabetic';
      if (opts.shadow !== false) { c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(str, x + 2, y + 2); }
      if (opts.stroke) { c.lineWidth = opts.stroke; c.strokeStyle = opts.strokeColor || '#000'; c.strokeText(str, x, y); }
      c.fillStyle = color; c.fillText(str, x, y);
    }
    update(dt) {
      for (const f of this.floats) f.t += dt;
      this.floats = this.floats.filter(f => f.t < 1.4);
      for (const t of this.toasts) t.t -= dt;
      this.toasts = this.toasts.filter(t => t.t > 0);
      if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
      this.flash = Math.max(0, this.flash - dt * 1.5);
    }
    draw(game, state) {
      const c = this.ctx, W = this.width, H = this.height;
      this.dirty = true; this.hits = [];
      c.clearRect(0, 0, W, H);
      if (state === 'menu') { this.drawMenu(game); return; }
      if (state === 'settings') { if (this.settingsFrom === 'paused') this.drawGame(game); this.drawSettings(game); return; }
      if (state === 'flag') { this.drawGame(game); this.drawFlag(game); return; }
      this.drawGame(game);
      if (state === 'paused') this.drawPause(game);
      if (state === 'gameover') this.drawGameOver(game);
    }
    drawGame(game) {
      const c = this.ctx, W = this.width, H = this.height, p = game.player, s = Math.min(W / 1280, H / 720) || 1;
      // damage vignette
      const hp = p.health / p.maxHealth;
      const dmgA = Math.max(0, 1 - hp) * 0.85 + p.hurtFlash * 0.4;
      if (dmgA > 0.02 || p.downed) {
        const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        const pulse = hp < 0.4 ? 0.6 + 0.4 * Math.sin(game.time * 8) : 1;
        g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(120,0,0,${Math.min(1, (p.downed ? 0.9 : dmgA) * pulse)})`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; c.fillRect(0, 0, W, H); }
      // crosshair
      if (!p.downed) {
        const cx = W / 2, cy = H / 2;
        const spread = (p.ads ? 3 : 9 + (p.moving ? 8 : 0) + (p.sprinting ? 10 : 0)) * s + p.recoilKick * 300 * s;
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2 * s;
        const style = game.settings.get('crosshair');
        if (style === 'none') { /* no crosshair */ }
        else if (style === 'dot') { c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(cx, cy, 2.2 * s, 0, 7); c.fill(); }
        else if (!p.ads || p.weaponDef().cls !== 'sniper') {
          c.beginPath();
          c.moveTo(cx - spread - 8 * s, cy); c.lineTo(cx - spread, cy); c.moveTo(cx + spread, cy); c.lineTo(cx + spread + 8 * s, cy);
          c.moveTo(cx, cy - spread - 8 * s); c.lineTo(cx, cy - spread); c.moveTo(cx, cy + spread); c.lineTo(cx, cy + spread + 8 * s);
          c.stroke();
        } else {
          // sniper scope
          c.fillStyle = 'rgba(0,0,0,0.92)'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, Math.min(W, H) * 0.42, 0, Math.PI * 2, true); c.fill();
          c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - W, cy); c.lineTo(cx + W, cy); c.moveTo(cx, 0); c.lineTo(cx, H); c.stroke();
        }
        if (p.hitMarker > 0) {
          c.strokeStyle = p.hitMarkerKill ? 'rgba(255,40,40,0.95)' : 'rgba(255,255,255,0.95)'; c.lineWidth = 2.5 * s;
          const o = 6 * s, l = 8 * s;
          c.beginPath();
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.moveTo(cx + dx * o, cy + dy * o); c.lineTo(cx + dx * (o + l), cy + dy * (o + l)); }
          c.stroke();
        }
      }
      // ---- bottom-left: perks, points, round ----
      const bl = { x: 28 * s, y: H - 28 * s };
      let px = bl.x;
      for (const perk of p.perks) {
        const st = PERK_STYLE[perk] || { l: '?', c: '#888' };
        c.fillStyle = st.c; c.beginPath(); c.arc(px + 17 * s, bl.y - 104 * s, 17 * s, 0, 7); c.fill();
        c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
        this.text(st.l, px + 17 * s, bl.y - 96 * s, 22 * s, '#fff', 'center', { shadow: false });
        px += 42 * s;
      }
      this.text(String(Math.floor(p.points)), bl.x, bl.y - 44 * s, 44 * s, '#fff', 'left');
      for (const f of this.floats) {
        const a = 1 - f.t / 1.4;
        this.text((f.n > 0 ? '+' : '') + f.n, bl.x + 150 * s, bl.y - 52 * s - f.t * 40 * s, 26 * s, f.n > 0 ? `rgba(255,230,120,${a})` : `rgba(255,120,120,${a})`, 'left');
      }
      // round number (tally marks for 1-5 like classic zombies, numbers beyond)
      const rx = bl.x, ry = bl.y;
      c.save();
      if (game.round <= 5 && !game.dogRound) {
        c.strokeStyle = '#b81414'; c.lineWidth = 6 * s; c.lineCap = 'round';
        for (let i = 0; i < game.round; i++) {
          c.beginPath();
          if (i < 4) { c.moveTo(rx + 8 * s + i * 16 * s, ry - 4 * s); c.lineTo(rx + 8 * s + i * 16 * s + 4 * s, ry - 34 * s); }
          else { c.moveTo(rx, ry - 26 * s); c.lineTo(rx + 70 * s, ry - 12 * s); }
          c.stroke();
        }
      } else {
        this.text(String(game.round), rx, ry, 64 * s, '#c41818', 'left', { stroke: 2, strokeColor: '#3a0000' });
      }
      c.restore();
      if (game.dogRound) this.text('HELLHOUNDS', rx + 110 * s, ry - 6 * s, 20 * s, '#ff9c3a', 'left');
      // ---- bottom-right: weapon + ammo ----
      const ws = p.weapon(), wd = ZM.Weapons.defs[ws.id];
      const brx = W - 28 * s, bry = H - 28 * s;
      this.text(ZM.Weapons.nameOf(ws), brx, bry - 56 * s, 22 * s, ws.pap ? '#e08cff' : '#ddd', 'right');
      this.text(`${ws.mag}`, brx - 60 * s, bry, 44 * s, ws.mag === 0 ? '#ff5050' : '#fff', 'right');
      this.text(`/ ${ws.reserve}`, brx, bry, 26 * s, ws.reserve === 0 ? '#ff5050' : '#bbb', 'right');
      if (p.reloading) this.text('RELOADING', brx, bry - 86 * s, 18 * s, '#ffd27a', 'right');
      // grenades / tactical
      let gx = brx;
      for (let i = 0; i < p.grenades; i++) { c.fillStyle = '#9db36a'; c.beginPath(); c.arc(gx - 8 * s, bry - 118 * s, 7 * s, 0, 7); c.fill(); gx -= 20 * s; }
      if (p.monkeys > 0) this.text(`Monkeys ×${p.monkeys}`, brx, bry - 140 * s, 16 * s, '#ffd27a', 'right');
      if (p.hasClaymores) this.text(`Claymores ×${p.claymores}`, brx, bry - (p.monkeys > 0 ? 160 : 140) * s, 16 * s, '#ffd27a', 'right');
      if (!p.bowie && false) void 0;
      // second weapon hint
      if (p.weapons.length > 1) { const o = p.weapons[1 - p.cur]; this.text(ZM.Weapons.nameOf(o) + `  ${o.mag}/${o.reserve}`, brx, bry - 34 * s, 14 * s, '#888', 'right'); }
      // ---- top: power-ups ----
      let tx = W / 2;
      const pus = [];
      if (game.instaKill > 0) pus.push(['INSTA-KILL', game.instaKill, '#ff5a3c']);
      if (game.doublePoints > 0) pus.push(['DOUBLE POINTS', game.doublePoints, '#ffd23c']);
      if (game.fireSale > 0) pus.push(['FIRE SALE', game.fireSale, '#ff6ad5']);
      tx -= (pus.length - 1) * 110 * s;
      for (const [name, t, col] of pus) {
        const blink = t < 5 && Math.floor(t * 4) % 2 === 0;
        if (!blink) { c.fillStyle = col; c.beginPath(); c.arc(tx, 48 * s, 20 * s, 0, 7); c.fill(); this.text(name, tx, 92 * s, 15 * s, '#fff', 'center'); this.text(Math.ceil(t) + 's', tx, 54 * s, 16 * s, '#000', 'center', { shadow: false }); }
        tx += 220 * s;
      }
      // power / link status
      if (game.linkTimer > 0) this.text(`RETURN TO THE MAINFRAME: ${Math.ceil(game.linkTimer)}s`, W / 2, 130 * s, 22 * s, '#8fd3ff', 'center');
      // ---- interaction prompt ----
      if (p.interact && !p.downed) this.text(p.interact.text, W / 2, H / 2 + 70 * s, 20 * s, p.interact.can === false ? '#ff8080' : '#fff', 'center');
      // ---- downed ----
      if (p.downed) {
        this.text(p.dying ? 'YOU ARE DOWN' : 'QUICK REVIVE', W / 2, H / 2 - 40 * s, 48 * s, '#ff3030', 'center');
        this.text(p.dying ? 'No one is coming…' : `Reviving in ${Math.ceil(p.downTimer)}`, W / 2, H / 2 + 10 * s, 24 * s, '#fff', 'center');
      }
      // ---- banner ----
      if (this.banner) {
        const b = this.banner, a = Math.min(1, b.t / 0.6, (b.max - b.t) / 0.4);
        c.globalAlpha = a;
        this.text(b.text, W / 2, H * 0.3, 72 * s, b.color, 'center', { stroke: 3, strokeColor: '#200' });
        if (b.sub) this.text(b.sub, W / 2, H * 0.3 + 44 * s, 24 * s, '#ddd', 'center');
        c.globalAlpha = 1;
      }
      // ---- toasts ----
      let ty = H * 0.62;
      for (const t of this.toasts) { const a = Math.min(1, t.t / 0.5); c.globalAlpha = a; this.text(t.text, W / 2, ty, 20 * s, t.color, 'center'); ty += 26 * s; c.globalAlpha = 1; }
      if (game.settings.get('showFps')) this.text(`${this.fps.toFixed(0)} fps`, W - 20 * s, 30 * s, 16 * s, '#8f8', 'right', { bold: false });
      // ---- debug ----
      if (this.showDebug) {
        const t = this.timing || {};
        const lines = [
          `fps ${this.fps.toFixed(0)}  frame ${(t.frame || 0).toFixed(1)}ms (update ${(t.update || 0).toFixed(2)} · draw-cpu ${(t.draw || 0).toFixed(2)} · hud ${(t.hud || 0).toFixed(2)})`,
          `gl ${game.renderer.canvas.width}×${game.renderer.canvas.height} scale ${Math.round((game.renderer.scale || 1) * 100)}%  draws ${game.renderer.drawCalls}  chunks ${game.stats.chunks}/${game.staticChunks.length} windows ${game.stats.windows} zombies-drawn ${game.stats.zombies}/${game.zombies.length}`,
          `renderer: ${(game.renderer.rendererName || '?').slice(0, 90)}${game.renderer.software ? '  [SOFTWARE]' : ''}`,
          `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} yaw ${p.yaw.toFixed(2)}  zone ${game.map.zoneAt(p.pos.x, p.pos.z)}  toSpawn ${game.toSpawn} state ${game.roundState}`,
          `vault ${game.vault.state.slice(0, 16)}…  particles ${game.particles.list.length}  last key: ${this.lastKey || '-'}`,
        ];
        lines.forEach((l, i) => this.text(l, 10, 20 + i * 16, 13, '#0f0', 'left', { bold: false }));
      }
    }
    drawCenteredBox(w, h, alpha = 0.75) {
      const c = this.ctx, W = this.width, H = this.height;
      c.fillStyle = `rgba(0,0,0,${alpha})`; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(20,20,24,0.9)'; c.fillRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
      c.strokeStyle = '#7a1414'; c.lineWidth = 3; c.strokeRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
    }
    // ---------- simple canvas widgets (hit rectangles registered per draw) ----------
    handleClick(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { if (h.onClick) h.onClick(x, y); return true; } }
      return false;
    }
    handleDown(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (h.onDrag && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { this.drag = h; h.onDrag(x); return true; } }
      return false;
    }
    handleMove(x, y) { this.mx = x; this.my = y; if (this.drag) this.drag.onDrag(x); }
    handleUp() { this.drag = null; }
    hover(x, y, w, h) { return this.mx >= x && this.mx <= x + w && this.my >= y && this.my <= y + h; }
    button(label, x, y, w, h, onClick, opts = {}) {
      const c = this.ctx, hov = this.hover(x, y, w, h);
      c.fillStyle = opts.active ? 'rgba(170,30,30,0.9)' : hov ? 'rgba(90,20,20,0.9)' : 'rgba(30,30,36,0.9)';
      c.fillRect(x, y, w, h);
      c.strokeStyle = opts.active || hov ? '#ff6b6b' : '#7a1414'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
      this.text(label, x + w / 2, y + h / 2 + (opts.size || 18) * 0.36, opts.size || 18, '#fff', 'center');
      this.hits.push({ x, y, w, h, onClick });
    }
    slider(label, valueText, x, y, w, t, onChange) {
      const c = this.ctx, h = 26;
      this.text(label, x, y + 18, 17, '#ddd', 'left', { bold: false });
      const sx = x + 260, sw = w - 340;
      c.fillStyle = '#2a2a30'; c.fillRect(sx, y + 8, sw, 10);
      c.fillStyle = '#c41818'; c.fillRect(sx, y + 8, sw * t, 10);
      c.fillStyle = '#fff'; c.fillRect(sx + sw * t - 5, y + 2, 10, 22);
      this.text(valueText, x + w, y + 18, 17, '#ffd27a', 'right', { bold: false });
      this.hits.push({ x: sx - 8, y: y - 4, w: sw + 16, h: h + 8, onDrag: (px) => onChange(ZM.U.clamp((px - sx) / sw, 0, 1)) });
    }
    toggle(label, value, x, y, w, onChange) {
      this.text(label, x, y + 18, 17, '#ddd', 'left', { bold: false });
      this.button(value ? 'ON' : 'OFF', x + w - 90, y - 4, 90, 30, () => onChange(!value), { active: value, size: 16 });
    }
    choice(label, options, value, x, y, w, onChange) {
      this.text(label, x, y + 18, 17, '#ddd', 'left', { bold: false });
      let bx = x + w - options.length * 96;
      for (const o of options) { this.button(o.label, bx, y - 4, 90, 30, () => onChange(o.value), { active: o.value === value, size: 15 }); bx += 96; }
    }

    drawMenu(game) {
      const c = this.ctx, W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1, st = game.settings;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
      this.text('DER RIESE', W / 2, H * 0.2, 96 * s, '#c41818', 'center', { stroke: 4, strokeColor: '#2a0000' });
      this.text('CALL OF DUTY: ZOMBIES — browser remake (fan project)', W / 2, H * 0.2 + 36 * s, 20 * s, '#ccc', 'center');
      this.text('Survive to ROUND 100. The mainframe will reward you.', W / 2, H * 0.2 + 70 * s, 22 * s, '#8fd3ff', 'center');
      const k = (a) => st.keyName(a);
      const lines = [
        `${k('forward')}${k('left')}${k('back')}${k('right')} move · ${k('sprint')} sprint · ${k('fire')} fire · ${k('ads')} aim · ${k('reload')} reload`,
        `${k('weapon1')}/${k('weapon2')}/${k('switch')}/wheel switch · ${k('melee')} knife · ${k('grenade')} grenade · ${k('monkey')} monkey bomb · ${k('claymore')} claymore`,
        `${k('interact')} interact (doors, wall guns, perks, box, power, traps, teleporters, Pack-a-Punch)`,
        'Esc pause · M mute · [ ] render scale',
      ];
      lines.forEach((l, i) => this.text(l, W / 2, H * 0.47 + i * 26 * s, 17 * s, '#ddd', 'center', { bold: false }));
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      if (blink) this.text(game.started && !game.gameOver ? 'CLICK TO RESUME' : 'CLICK TO PLAY', W / 2, H * 0.72, 40 * s, '#fff', 'center');
      this.button('SETTINGS', W / 2 - 110 * s, H * 0.77, 220 * s, 44 * s, () => this.openSettings('menu'), { size: 20 * s });
      const best = game.bestRound();
      if (best > 0) this.text(`Best round: ${best}`, W / 2, H * 0.77 + 72 * s, 20 * s, '#ffd27a', 'center');
      this.text(`Render ${game.renderer.canvas.width}×${game.renderer.canvas.height} (${Math.round((game.renderer.scale || 1) * 100)}%)`, W / 2, H * 0.95, 14 * s, '#777', 'center', { bold: false });
    }
    drawPause(game) {
      const W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1;
      this.drawCenteredBox(620 * s, 330 * s, 0.5);
      this.text('PAUSED', W / 2, H / 2 - 100 * s, 56 * s, '#fff', 'center');
      this.text('Click anywhere to resume', W / 2, H / 2 - 56 * s, 18 * s, '#ccc', 'center', { bold: false });
      this.text(`Round ${game.round} · Kills ${game.player.kills}`, W / 2, H / 2 - 26 * s, 18 * s, '#ffd27a', 'center');
      this.button('SETTINGS', W / 2 - 240 * s, H / 2 + 0 * s, 220 * s, 44 * s, () => this.openSettings('paused'), { size: 20 * s });
      this.button('QUIT TO MENU', W / 2 + 20 * s, H / 2 + 0 * s, 220 * s, 44 * s, () => { if (this.onQuit) this.onQuit(); }, { size: 20 * s });
      const t = this.timing || {};
      const perf = [
        `Performance: ${this.fps.toFixed(0)} fps · frame ${(t.frame || 0).toFixed(1)} ms (update ${(t.update || 0).toFixed(2)} · draw-cpu ${(t.draw || 0).toFixed(2)} · hud ${(t.hud || 0).toFixed(2)})`,
        `Render ${game.renderer.canvas.width}×${game.renderer.canvas.height} (${Math.round((game.renderer.scale || 1) * 100)}%) · draws ${game.renderer.drawCalls} · rooms ${game.stats.chunks}/${game.staticChunks.length}`,
        `GPU: ${(game.renderer.rendererName || 'unknown').slice(0, 80)}${game.renderer.software ? '  [SOFTWARE RENDERING]' : ''}`,
      ];
      perf.forEach((l, i) => this.text(l, W / 2, H / 2 + (70 + i * 20) * s, 13 * s, '#9fd3ff', 'center', { bold: false }));
    }
    openSettings(from) { this.settingsFrom = from; this.tab = this.tab || 0; if (this.onOpenSettings) this.onOpenSettings(from); }
    drawSettings(game) {
      const c = this.ctx, W = this.width, H = this.height, st = game.settings, d = st.data;
      const s = Math.min(W / 1280, H / 720) || 1;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, W, H);
      const pw = Math.min(W - 20, 980), ph = Math.min(H - 20, 640), px = (W - pw) / 2, py = (H - ph) / 2;
      c.fillStyle = 'rgba(18,18,22,0.96)'; c.fillRect(px, py, pw, ph);
      c.strokeStyle = '#7a1414'; c.lineWidth = 3; c.strokeRect(px, py, pw, ph);
      this.text('SETTINGS', px + pw / 2, py + 44, 36, '#c41818', 'center', { stroke: 2, strokeColor: '#200' });
      const tabs = ['CONTROLS', 'MOUSE & AIM', 'VIDEO', 'AUDIO'];
      const tw = 170;
      tabs.forEach((t, i) => this.button(t, px + pw / 2 - (tabs.length * (tw + 8)) / 2 + i * (tw + 8), py + 64, tw, 36, () => { this.tab = i; }, { active: this.tab === i, size: 16 }));
      const changed = () => { st.save(); if (this.onSettingsChanged) this.onSettingsChanged(); };
      const x = px + 40, w = pw - 80;
      let y = py + 130;
      if (this.tab === 0) {
        const acts = ZM.Settings.ACTIONS;
        const colW = (w - 20) / 2;
        acts.forEach((a, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const ax = x + col * (colW + 20), ay = y + row * 40;
          this.text(a[1], ax, ay + 20, 16, '#ddd', 'left', { bold: false });
          const capturing = this.capture === a[0];
          this.button(capturing ? 'PRESS A KEY…' : st.keyName(a[0]), ax + colW - 150, ay - 2, 150, 32, () => { this.capture = a[0]; }, { active: capturing, size: 15 });
        });
        this.text('Click a binding, then press the key or mouse button to use. Esc cancels. Duplicates swap.', px + pw / 2, py + ph - 76, 14, '#999', 'center', { bold: false });
        this.button('RESET TO DEFAULTS', px + pw - 260, py + ph - 56, 220, 36, () => { st.reset(); changed(); }, { size: 15 });
      } else if (this.tab === 1) {
        this.slider('Mouse sensitivity', d.sensitivity.toFixed(1), x, y, w, (d.sensitivity - 0.5) / 9.5, (t) => { d.sensitivity = Math.round((0.5 + t * 9.5) * 10) / 10; changed(); }); y += 50;
        this.toggle('Invert vertical look', d.invertY, x, y, w, (v) => { d.invertY = v; changed(); }); y += 50;
        this.choice('Aim down sights', [{ label: 'HOLD', value: false }, { label: 'TOGGLE', value: true }], d.adsToggle, x, y, w, (v) => { d.adsToggle = v; changed(); }); y += 50;
        this.choice('Sprint', [{ label: 'HOLD', value: false }, { label: 'TOGGLE', value: true }], d.sprintToggle, x, y, w, (v) => { d.sprintToggle = v; changed(); }); y += 50;
        this.slider('Field of view', `${d.fov}°`, x, y, w, (d.fov - 60) / 50, (t) => { d.fov = Math.round(60 + t * 50); changed(); }); y += 50;
      } else if (this.tab === 2) {
        const rs = d.renderScale || 0;
        this.slider('Render scale (0 = auto)', rs ? `${rs}% (${game.renderer.canvas.width}×${game.renderer.canvas.height})` : `Auto (${game.renderer.canvas.width}×${game.renderer.canvas.height})`, x, y, w, rs ? (rs - 30) / 70 : 0, (t) => { d.renderScale = t < 0.02 ? 0 : Math.round((30 + t * 70) / 5) * 5; changed(); }); y += 50;
        this.toggle('Show FPS counter', d.showFps, x, y, w, (v) => { d.showFps = v; changed(); }); y += 50;
        this.toggle('Weapon view bob', d.viewBob, x, y, w, (v) => { d.viewBob = v; changed(); }); y += 50;
        this.choice('Crosshair', [{ label: 'CROSS', value: 'cross' }, { label: 'DOT', value: 'dot' }, { label: 'NONE', value: 'none' }], d.crosshair, x, y, w, (v) => { d.crosshair = v; changed(); }); y += 50;
        this.text(`GPU: ${(game.renderer.rendererName || 'unknown').slice(0, 70)}${game.renderer.software ? ' [SOFTWARE]' : ''}`, x, y + 18, 14, '#999', 'left', { bold: false }); y += 30;
        this.text('Lower the render scale if the game stutters. Firefox without hardware acceleration caps frame rate regardless.', x, y + 18, 14, '#999', 'left', { bold: false });
      } else {
        this.slider('Master volume', `${Math.round(d.volume * 100)}%`, x, y, w, d.volume, (t) => { d.volume = Math.round(t * 100) / 100; changed(); }); y += 50;
        this.toggle('Mute', d.muted, x, y, w, (v) => { d.muted = v; changed(); }); y += 50;
        this.text('All sounds are synthesized in the browser (no audio files).', x, y + 18, 14, '#999', 'left', { bold: false });
      }
      this.button('BACK', px + 40, py + ph - 56, 160, 36, () => { if (this.onCloseSettings) this.onCloseSettings(); }, { size: 16 });
      if (this.capture) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(px, py + 100, pw, 40); this.text(`Press a key or mouse button for "${(ZM.Settings.ACTIONS.find(a => a[0] === this.capture) || [])[1]}" — Esc to cancel`, px + pw / 2, py + 127, 18, '#ffd27a', 'center'); }
    }
    drawGameOver(game) {
      const W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1, p = game.player;
      this.drawCenteredBox(640 * s, 360 * s, 0.7);
      this.text('GAME OVER', W / 2, H / 2 - 100 * s, 72 * s, '#c41818', 'center', { stroke: 3, strokeColor: '#200' });
      this.text(`You survived ${game.round} round${game.round === 1 ? '' : 's'}`, W / 2, H / 2 - 40 * s, 28 * s, '#fff', 'center');
      this.text(`Kills ${p.kills} · Headshots ${p.headshots} · Downs ${p.downs} · Shots ${p.shotsFired}`, W / 2, H / 2, 20 * s, '#ccc', 'center', { bold: false });
      this.text(`Best round: ${game.bestRound()}`, W / 2, H / 2 + 36 * s, 20 * s, '#ffd27a', 'center');
      this.text('Round 100 was ' + (game.round >= 100 ? 'reached!' : 'not reached. The mainframe stays sealed.'), W / 2, H / 2 + 76 * s, 18 * s, '#8fd3ff', 'center', { bold: false });
      this.text('Click to return to the menu', W / 2, H / 2 + 130 * s, 22 * s, '#fff', 'center');
    }
    drawFlag(game) {
      const W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1;
      const r = game.flagResult;
      this.drawCenteredBox(Math.min(W - 20, 980 * s), 300 * s, 0.6);
      if (r && r.ok) {
        this.text('MAINFRAME UNLOCKED', W / 2, H / 2 - 80 * s, 56 * s, '#8fd3ff', 'center');
        this.text('Round 100 reached. Element 115 resonance accepted:', W / 2, H / 2 - 30 * s, 20 * s, '#ddd', 'center', { bold: false });
        this.ctx.font = `bold ${Math.min(34 * s, (900 * s) / Math.max(1, r.flag.length) * 1.9)}px monospace`;
        this.ctx.textAlign = 'center'; this.ctx.fillStyle = '#fff'; this.ctx.fillText(r.flag, W / 2, H / 2 + 30 * s);
      } else {
        this.text('MAINFRAME REJECTS DATA', W / 2, H / 2 - 60 * s, 52 * s, '#ff5050', 'center');
        this.text('Round 100 claimed, but the 115 resonance chain does not verify.', W / 2, H / 2, 20 * s, '#ddd', 'center', { bold: false });
        this.text('Every round must be walked through the mainframe, one by one.', W / 2, H / 2 + 30 * s, 20 * s, '#ddd', 'center', { bold: false });
      }
      this.text('Click to continue playing', W / 2, H / 2 + 110 * s, 20 * s, '#aaa', 'center', { bold: false });
    }
  }
  ZM.HUD = HUD;
})();


// ===== 97_settings.js =====
// ---------------------------------------------------------------------------
// 97_settings.js — user settings: key bindings, mouse/aim, video, audio.
// Persisted in localStorage. Raw input (key codes / mouse buttons) is translated
// into named actions here so the game logic never sees physical keys.
// ---------------------------------------------------------------------------
(function () {
  const ACTIONS = [
    ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Strafe left'], ['right', 'Strafe right'], ['sprint', 'Sprint'],
    ['fire', 'Fire'], ['ads', 'Aim down sights'], ['reload', 'Reload'], ['interact', 'Interact / use'], ['melee', 'Knife'],
    ['grenade', 'Frag grenade'], ['monkey', 'Monkey bomb'], ['claymore', 'Place claymore'], ['weapon1', 'Weapon slot 1'], ['weapon2', 'Weapon slot 2'], ['switch', 'Switch weapon'],
    ['debug', 'Debug overlay'],
  ];
  const DEFAULTS = {
    bindings: { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', fire: 'Mouse0', ads: 'Mouse2', reload: 'KeyR', interact: 'KeyF', melee: 'KeyV', grenade: 'KeyG', monkey: 'KeyN', claymore: 'KeyC', weapon1: 'Digit1', weapon2: 'Digit2', switch: 'KeyQ', debug: 'F3' },
    sensitivity: 2.2, invertY: false, adsToggle: false, sprintToggle: false, fov: 70,
    renderScale: 0, // 0 = automatic
    showFps: false, viewBob: true, crosshair: 'cross',
    volume: 0.6, muted: false,
  };
  const KEY = 'derriese_settings';

  function keyName(code) {
    if (!code) return '—';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Mouse0') return 'LMB'; if (code === 'Mouse1') return 'MMB'; if (code === 'Mouse2') return 'RMB';
    if (code.startsWith('Mouse')) return 'M' + code.slice(5);
    const map = { ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Enter: 'Enter', Backspace: 'Bksp', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    return map[code] || code;
  }

  class Settings {
    constructor() { this.data = JSON.parse(JSON.stringify(DEFAULTS)); this.load(); }
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        for (const k in DEFAULTS) if (k !== 'bindings' && d[k] !== undefined) this.data[k] = d[k];
        if (d.bindings) for (const a in DEFAULTS.bindings) if (typeof d.bindings[a] === 'string') this.data.bindings[a] = d.bindings[a];
      } catch (e) { /* ignore */ }
    }
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
    reset() { this.data = JSON.parse(JSON.stringify(DEFAULTS)); this.save(); }
    get(k) { return this.data[k]; }
    set(k, v) { this.data[k] = v; this.save(); }
    binding(action) { return this.data.bindings[action]; }
    // Bind `code` to `action`; if another action used that code, the two swap.
    bind(action, code) {
      const b = this.data.bindings;
      for (const a in b) if (a !== action && b[a] === code) b[a] = b[action];
      b[action] = code;
      this.save();
    }
    keyName(action) { return keyName(this.binding(action)); }
    // Translate raw input (keys Set of codes, pressed Set of codes, buttons {0,2}) into actions.
    translate(input) {
      const held = new Set(input.keys);
      if (input.buttons[0]) held.add('Mouse0'); if (input.buttons[1]) held.add('Mouse1'); if (input.buttons[2]) held.add('Mouse2');
      const actions = new Set(), pressed = new Set();
      const b = this.data.bindings;
      for (const a in b) { if (held.has(b[a])) actions.add(a); if (input.pressed.has(b[a])) pressed.add(a); }
      input.actions = actions; input.pressedActions = pressed;
      return input;
    }
    // Apply to live objects.
    applyPlayer(player) {
      player.sensitivity = this.data.sensitivity / 1000;
      player.invertY = !!this.data.invertY;
      player.adsToggle = !!this.data.adsToggle;
      player.sprintToggle = !!this.data.sprintToggle;
      player.viewBob = this.data.viewBob !== false;
    }
    applyAudio(audio) { audio.volume = this.data.volume; audio.setMuted(!!this.data.muted); if (audio.master && !audio.muted) audio.master.gain.value = audio.volume; }
  }
  Settings.ACTIONS = ACTIONS; Settings.DEFAULTS = DEFAULTS; Settings.keyName = keyName;
  ZM.Settings = Settings;
})();


// ===== 99_main.js =====
// ---------------------------------------------------------------------------
// 99_main.js — bootstrap: canvases, input, pointer lock, state machine, loop.
// ---------------------------------------------------------------------------
(function () {
  const glCanvas = document.getElementById('gl');
  const hudCanvas = document.getElementById('hud');
  const renderer = new ZM.Renderer(glCanvas);
  const hud = new ZM.HUD(hudCanvas);
  const audio = new ZM.Audio();
  const game = new ZM.Game(renderer, hud, audio);
  let state = 'menu'; // menu | playing | paused | gameover | flag | settings
  const input = { keys: new Set(), pressed: new Set(), buttons: { 0: false, 1: false, 2: false }, mouseDX: 0, mouseDY: 0, wheel: 0 };
  const settings = game.settings;

  // Render scale: internal 3D resolution relative to the window (auto targets ~720p for performance).
  function autoScale() { const target = renderer.software ? 480 : 720; return Math.min(1, target / Math.max(1, window.innerHeight)); }
  let renderScale = settings.get('renderScale') ? settings.get('renderScale') / 100 : autoScale();
  if (renderer.software) hud.toast('Software WebGL detected (no GPU acceleration) — render scale lowered. Use [ ] to adjust.', 8, '#ffd27a');
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.resize(w, h, renderScale); hud.resize(w, h);
  }
  function applySettings() {
    settings.applyPlayer(game.player); settings.applyAudio(audio);
    renderScale = settings.get('renderScale') ? settings.get('renderScale') / 100 : autoScale();
    resize();
  }
  function setScale(v) { const pct = Math.round(Math.min(100, Math.max(30, v * 100)) / 5) * 5; settings.set('renderScale', pct); applySettings(); hud.toast(`Render scale ${pct}% (${renderer.canvas.width}×${renderer.canvas.height})`, 1.5); }
  hud.onSettingsChanged = applySettings;
  hud.onOpenSettings = (from) => { setState('settings'); hud.settingsFrom = from; };
  hud.onCloseSettings = () => { hud.capture = null; setState(hud.settingsFrom === 'paused' ? 'paused' : 'menu'); };
  hud.onQuit = () => { setState('menu'); };
  applySettings();
  window.addEventListener('resize', resize);
  resize();

  function locked() { return document.pointerLockElement === glCanvas; }
  function lock() { try { const p = glCanvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  function setState(s) {
    state = s;
    input.pressed.clear(); input.keys.clear(); input.buttons[0] = input.buttons[2] = false; input.mouseDX = input.mouseDY = 0; input.wheel = 0;
  }

  const mouse = { x: 0, y: 0 };
  function hudXY(e) { return { x: e.clientX * (hud.width / window.innerWidth), y: e.clientY * (hud.height / window.innerHeight) }; }
  document.addEventListener('click', (e) => {
    audio.unlock();
    if (state !== 'playing' && !locked()) { const m = hudXY(e); if (hud.handleClick(m.x, m.y)) return; }
    if (state === 'settings') return;
    if (state === 'menu') {
      if (game.gameOver) game.reset();
      setState('playing'); lock();
    } else if (state === 'paused') { setState('playing'); lock(); }
    else if (state === 'gameover') { game.reset(); setState('menu'); }
    else if (state === 'flag') { setState('playing'); lock(); }
    else if (state === 'playing' && !locked()) lock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked() && state === 'playing') setState('paused');
  });
  document.addEventListener('pointerlockerror', () => { /* some browsers need a second click */ });
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F3'].includes(e.code) || e.key === 'F3') e.preventDefault();
    hud.lastKey = `${e.code} / ${e.key}`;
    if (hud.capture) { e.preventDefault(); if (e.code !== 'Escape') { settings.bind(hud.capture, e.code); applySettings(); } hud.capture = null; return; }
    if (e.code === settings.binding('debug') || (e.key === 'F3' && settings.binding('debug') === 'F3')) { hud.showDebug = !hud.showDebug; return; }
    input.keys.add(e.code); input.pressed.add(e.code);
    if (e.code === 'Escape') {
      if (state === 'settings') hud.onCloseSettings();
      else if (state === 'paused') { setState('menu'); }
      else if (state === 'playing') { setState('paused'); if (locked()) document.exitPointerLock(); }
    }
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Muted' : 'Sound on', 1.5); }
    if (e.code === 'BracketLeft') setScale((renderer.scale || 1) - 0.1);
    if (e.code === 'BracketRight') setScale((renderer.scale || 1) + 0.1);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { settings.set('sensitivity', Math.min(10, Math.round((settings.get('sensitivity') + 0.3) * 10) / 10)); applySettings(); hud.toast(`Sensitivity ${settings.get('sensitivity').toFixed(1)}`, 1.2); }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { settings.set('sensitivity', Math.max(0.5, Math.round((settings.get('sensitivity') - 0.3) * 10) / 10)); applySettings(); hud.toast(`Sensitivity ${settings.get('sensitivity').toFixed(1)}`, 1.2); }
  });
  document.addEventListener('keyup', (e) => { input.keys.delete(e.code); });
  window.addEventListener('blur', () => { input.keys.clear(); input.buttons[0] = input.buttons[2] = false; });
  document.addEventListener('mousemove', (e) => {
    if (locked() && state === 'playing') { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
    else { const m = hudXY(e); mouse.x = m.x; mouse.y = m.y; hud.handleMove(m.x, m.y); }
  });
  document.addEventListener('mousedown', (e) => {
    if (hud.capture) { e.preventDefault(); settings.bind(hud.capture, 'Mouse' + e.button); applySettings(); hud.capture = null; return; }
    if (state !== 'playing' || !locked()) { const m = hudXY(e); hud.handleDown(m.x, m.y); return; }
    input.buttons[e.button] = true; input.pressed.add('Mouse' + e.button);
  });
  document.addEventListener('mouseup', (e) => { input.buttons[e.button] = false; hud.handleUp(); });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (state === 'playing') input.wheel = e.deltaY > 0 ? 1 : -1; }, { passive: true });

  const STEP = 1 / 60;
  let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    fpsT += dt; fpsN++; if (fpsT >= 0.5) { hud.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    const tFrame0 = performance.now();
    let tUpd = 0;
    if (state === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        const t0 = performance.now();
        game.update(STEP, input);
        tUpd += performance.now() - t0;
        input.pressed.clear(); input.mouseDX = 0; input.mouseDY = 0; input.wheel = 0;
        acc -= STEP; steps++;
      }
      if (steps === 4) acc = 0;
      if (game.flagPending) { game.flagPending = false; setState('flag'); }
      if (game.gameOver) { setState('gameover'); if (locked()) document.exitPointerLock(); }
    } else { input.pressed.clear(); input.mouseDX = 0; input.mouseDY = 0; input.wheel = 0; acc = 0; }
    // Outside of play, re-render the 3D scene only a few times per second (menus overlay a still scene).
    idleFrames = state === 'playing' ? 0 : idleFrames + 1;
    frameNo++;
    hud.update(dt);
    // Outside of play the scene is static: present at ~20 Hz. In play the HUD canvas is redrawn at 30 Hz
    // and composited into the WebGL frame as a texture (one layer for the browser compositor).
    const present = state === 'playing' || idleFrames % 3 === 1;
    let tHud = 0, tDraw = 0;
    if (present) {
      if (frameNo % 2 === 0 || state !== 'playing') { const t0 = performance.now(); hud.draw(game, state); tHud = performance.now() - t0; }
      const tDraw0 = performance.now();
      game.draw();
      renderer.drawOverlay(hudCanvas, hud.dirty); hud.dirty = false;
      tDraw = performance.now() - tDraw0;
    }
    const k = 0.1;
    const tm = hud.timing || (hud.timing = { frame: 0, update: 0, draw: 0, hud: 0 });
    tm.frame += (performance.now() - tFrame0 - tm.frame) * k; tm.update += (tUpd - tm.update) * k; tm.draw += (tDraw - tm.draw) * k; if (tHud) tm.hud += (tHud - tm.hud) * k;
  }
  let idleFrames = 0, frameNo = 0;
  requestAnimationFrame(frame);

})();


// ===== flag_data.js =====
// Generated by tools/gen_flag.py — encrypted flag for the mainframe vault.
ZM.FLAG = {"ct": "d1145c91a6cd32392b6cbaea18a7ef2bf5ed375fa21d0cc00ae736544a27ae68ade6e85adee00f0969a5b3d6", "tag": "c582f09a6dc97a6271b4ec1b42c2a8e789abf0b9e39405b6641461d625be6eaf"};

})();
