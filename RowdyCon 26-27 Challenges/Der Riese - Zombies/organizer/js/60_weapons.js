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
