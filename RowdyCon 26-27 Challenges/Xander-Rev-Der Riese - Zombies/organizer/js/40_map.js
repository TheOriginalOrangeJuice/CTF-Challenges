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
