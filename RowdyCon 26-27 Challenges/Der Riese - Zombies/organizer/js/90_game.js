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
