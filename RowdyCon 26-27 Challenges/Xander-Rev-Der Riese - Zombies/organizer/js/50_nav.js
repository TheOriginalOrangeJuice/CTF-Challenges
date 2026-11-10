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
