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
