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
