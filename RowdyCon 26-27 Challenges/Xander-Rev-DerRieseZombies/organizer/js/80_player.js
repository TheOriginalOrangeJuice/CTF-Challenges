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
