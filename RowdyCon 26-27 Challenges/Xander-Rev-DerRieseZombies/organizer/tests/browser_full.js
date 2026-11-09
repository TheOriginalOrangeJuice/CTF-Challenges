// node tests/browser_full.js — exercises every game system in headless Chromium using the dev hooks
// and a deterministic in-page simulator (game.update stepped at 60 Hz with synthetic input).
const path = require('path');
const { launch } = require('./cdp');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';

async function main() {
  const b = await launch(URL, path.join(__dirname, 'shots_full'));
  const { evaluate, sleep, shot } = b;
  let fails = 0;
  const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
  const ev = (e) => evaluate(e);
  const assertNoErrors = (label) => { const e = b.errors(); check(e.length === 0, 'no console errors: ' + label + (e.length ? '\n   ' + e.join('\n   ') : '')); };
  const snap = async (name) => { await ev('ZMDEV.setState("playing")'); await sleep(250); await shot(name); await ev('ZMDEV.setState("paused")'); };

  check(await ev('typeof ZMDEV !== "undefined"'), 'dev hooks present');
  await ev(`window.G = ZMDEV.game; window.P = () => ZMDEV.game.player;
    window.sim = (sec, keys = [], pressed = [], buttons = {}) => { const inp = { keys: new Set(keys), pressed: new Set(pressed), buttons: Object.assign({ 0: false, 2: false }, buttons), mouseDX: 0, mouseDY: 0, wheel: 0 }; const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { ZMDEV.game.update(1 / 60, inp); inp.pressed.clear(); } };
    window.tp = (x, z, yaw, y) => { const p = P(); p.pos.x = x; p.pos.z = z; p.pos.y = y === undefined ? G.map.floorHeight(x, z, 1000) : y; if (yaw !== undefined) p.yaw = yaw; p.pitch = 0; };
    window.aimAt = (q) => { const p = P(); const to = ZM.V.sub(q, p.eyePos()); p.yaw = Math.atan2(-to.x, -to.z); p.pitch = Math.atan2(to.y, Math.hypot(to.x, to.z)); };
    window.spawnAt = (x, z, hp, y) => { y = y === undefined ? G.map.floorHeight(x, z, 1000) : y; const z0 = new ZM.Zombie(G, { pos: { x, y, z }, hp: hp || 300, speed: 3, state: 'chase' }); G.zombies.push(z0); return z0; };
    window.fire = (n) => { for (let i = 0; i < (n || 1); i++) { sim(0.02, [], ['Mouse0'], { 0: true }); sim(0.25); } };
    window.pressF = () => sim(0.05, [], ['KeyF']);
    true`);
  await ev('ZMDEV.setState("paused")');

  // ---------- 1. round flow, zombie attack, down & game over ----------
  await ev('G.reset(); sim(3.5)');
  check(await ev('G.roundState') === 'active' && await ev('G.round') === 1, 'round 1 starts after intermission');
  await ev('sim(25)');
  check(await ev('G.zombies.length') > 0, 'zombies exist after 25s');
  await ev('sim(45)');
  check(await ev('G.gameOver') === true, 'player dies without Quick Revive → game over');
  assertNoErrors('round 1 / death');
  await ev('G.reset(); sim(3.5)');
  check(await ev('G.round') === 1 && await ev('G.vault.history') === 0, 'reset → round 1 again (chain untouched)');

  // ---------- 2. doors, wall-buys, bowie, claymores, balcony ----------
  await ev('G.reset(); G.roundState = "idle"; P().points = 90000; tp(32, 15.1, Math.PI); sim(0.1)');
  check(/open/.test(await ev('P().interact ? P().interact.text : ""')), 'door prompt: ' + await ev('P().interact ? P().interact.text : ""'));
  await ev('pressF()');
  check(await ev('G.map.doors.find(d => d.id === "D_L").open && G.map.zones.LF.open') === true, 'D_L opens the left factory room');
  check(await ev('P().points') === 90000 - 750, 'door cost deducted');
  for (const [x, z, id] of [[32, -15.1, 'D_R'], [10.9, -26.5, 'D_GAR'], [10.9, 19.5, 'D_LAB'], [-13.1, 26, 'D_TA'], [-13.1, -4, 'D_TC']]) {
    await ev(`tp(${x}, ${z}); sim(0.1); pressF()`);
    check(await ev(`G.map.doors.find(d => d.id === "${id}").open`) === true, `${id} opens`);
  }
  await ev('tp(8, -28); sim(0.1); pressF()'); // top of garage stairs debris (standing on the stairs)
  check(await ev('G.map.doors.find(d => d.id === "D_RB").open') === true, 'garage balcony debris opens');
  await ev('tp(-12.4, -22, 0, 3.5); sim(0.1); pressF()');
  check(await ev('G.map.doors.find(d => d.id === "D_TB").open') === true, 'Teleporter B door opens from the balcony');
  check(Math.abs(await ev('P().pos.y') - 3.5) < 0.01, 'player stands on the balcony (y=3.5)');
  await ev('tp(8, 24, 0, 3.5); sim(0.1); pressF()');
  check(await ev('G.map.doors.find(d => d.id === "D_LB").open') === true, 'lab balcony debris opens');
  check(await ev('G.map.doors.filter(d => d.power).every(d => !d.open)'), 'power doors stay closed before power');
  await ev('tp(-34.6, 30); sim(0.1)');
  check(/MP40/.test(await ev('P().interact ? P().interact.text : ""')), 'MP40 wall-buy prompt in the generator room');
  await ev('pressF()');
  check(await ev('P().hasWeapon("mp40")') && await ev('P().weapons.length') === 2, 'MP40 bought');
  await ev('P().weapon().reserve = 0; sim(0.1); pressF()');
  check(await ev('P().weapon().reserve') === 192, 'ammo refill from wall');
  await ev('tp(-34, -16.5, 0, 0); sim(0.1); pressF()');
  check(await ev('P().bowie') === true, 'Bowie knife bought under the catwalk');
  await ev('tp(8.8, -4); sim(0.1); pressF()');
  check(await ev('P().hasClaymores && P().claymores === 2'), 'Claymores bought in the courtyard');
  await snap('balcony');

  // ---------- 3. power, power doors, bridge, perks, traps ----------
  await ev('tp(-11.8, -12); sim(0.1)');
  check(/power/i.test(await ev('P().interact.text')), 'perks need power: ' + await ev('P().interact.text'));
  await ev('tp(-7, -16.6); sim(0.1)');
  check(/power/.test(await ev('P().interact.text')), 'power switch prompt: ' + await ev('P().interact.text'));
  await ev('pressF()');
  check(await ev('G.power') === true, 'power switch works');
  check(await ev('G.map.doors.filter(d => d.power).every(d => d.open)'), 'power doors open with power');
  check(await ev('G.map.bridge.lowered') === false && await ev('G.bridgeAnim') > 0, 'bridge starts lowering');
  await ev('sim(4.6)');
  check(await ev('G.map.bridge.lowered') === true && await ev('G.nav.isWalkable(-2, 0, 3.5)'), 'bridge lowered and walkable');
  check(await ev('G.map.floorHeight(-2, 0, 3.5)') === 3.5 && await ev('G.map.floorHeight(-2, 3, 0)') === 0, 'bridge deck above the courtyard floor');
  await ev('tp(-11.8, -12); sim(0.1); pressF()');
  check(await ev('P().perks.has("juggernog") && P().maxHealth === 250'), 'Juggernog → 250 health');
  await ev('tp(7.9, 12); sim(0.1); pressF()');
  check(await ev('P().perks.has("speed_cola")'), 'Speed Cola bought');
  await ev('tp(4, -15.9); sim(0.1); pressF()');
  check(await ev('P().perks.has("double_tap")'), 'Double Tap bought');
  await ev('tp(52.3, -8); sim(0.1); pressF()');
  check(await ev('P().perks.has("quick_revive") && P().perks.size === 4'), 'Quick Revive bought in spawn (4 perks)');
  await ev('P().cur = 1; P().weapon().mag = 0; P().startReload()');
  check(Math.abs(await ev('P().reloadTotal') - 1.2) < 0.01, 'Speed Cola halves reload time');
  // trap
  const trap = await ev(`(() => { G.zombies = []; const t = G.map.traps.find(x => x.id === 'T_A'); tp(t.switchPos.x + 0.3, t.switchPos.z); sim(0.1); const txt = P().interact ? P().interact.text : ''; const p0 = P().points; pressF(); const z = spawnAt(-14, 26, 1e6); sim(1.0); const dead = z.dead; const pts = P().points; tp(-14, 26); const h0 = P().health; sim(0.3); return { txt, active: t.active > 0, dead, cost: p0 - pts, hurt: h0 - P().health }; })()`);
  check(/trap/.test(trap.txt) && trap.active && trap.dead && trap.cost === 1000 && trap.hurt >= 100, `electric trap kills zombies, costs 1000 and hurts the player (${JSON.stringify(trap)})`);
  await snap('trap');
  await ev('tp(0, 0); G.zombies = []');

  // ---------- 4. mystery box ----------
  await ev('tp(5, -28.3); sim(0.1)');
  check(/Mystery Box/.test(await ev('P().interact.text')), 'box prompt in the garage');
  await ev('pressF()');
  check(await ev('G.box.state') === 'rolling', 'box rolling');
  await ev('G.box.teddy = false; sim(4)');
  check(await ev('G.box.state') === 'offer', 'box offers a weapon: ' + await ev('G.box.weapon'));
  await snap('box');
  const before = await ev('P().weapon().id');
  await ev('pressF()');
  check(await ev('P().weapon().id') !== before && await ev('G.box.state') === 'closed', 'took box weapon');
  await ev('pressF(); G.box.teddy = true; sim(4)');
  check(await ev('G.box.spot.id') !== 'B_GAR' && await ev('G.box.moveTimer') > 0, 'teddy bear moves the box to ' + await ev('G.box.spot.id'));

  // ---------- 5. teleporter links, PaP, teleport ----------
  await ev('tp(-25, 24.3); sim(0.1)');
  check(/activate Teleporter A/.test(await ev('P().interact.text')), 'teleporter A link prompt');
  await ev('pressF()');
  check(await ev('G.pendingLink') === 'A' && await ev('G.linkTimer') > 29, 'link pending with timer');
  await ev('sim(31)');
  check(await ev('G.pendingLink') === null, 'link expires after 30s');
  await ev('pressF(); tp(38, 1); sim(0.1)');
  check(/link Teleporter A/.test(await ev('P().interact.text')), 'mainframe link prompt');
  await ev('pressF()');
  check(await ev('G.links.A') === true, 'teleporter A linked');
  await ev('tp(-25, -26.3, 0, 3.5); sim(0.1); pressF(); tp(38, 1); sim(0.1); pressF(); tp(-44, 3.6); sim(0.1); pressF(); tp(38, 1); sim(0.1); pressF()');
  check(await ev('G.links.A && G.links.B && G.links.C && G.map.gate.open'), 'all linked → PaP gate open');
  await ev('tp(57.4, -3); sim(0.1)');
  check(/upgrade/.test(await ev('P().interact.text')), 'PaP prompt: ' + await ev('P().interact.text'));
  const wid = await ev('P().weapon().id');
  await ev('pressF(); sim(1.0)');
  await snap('pap');
  await ev('sim(2.6)');
  check(await ev('P().weapon().pap') === true && await ev('P().weapon().id') === wid, 'weapon upgraded: ' + await ev('ZM.Weapons.nameOf(P().weapon())'));
  await ev('tp(-44, 3.6); sim(0.1)');
  check(/teleport to the mainframe/.test(await ev('P().interact.text')), 'teleport prompt');
  await ev('pressF(); sim(0.1)');
  check(await ev('ZM.V.distXZ(P().pos, G.map.mainframe.pos)') < 4, 'teleported to the mainframe');
  await snap('mainframe');
  assertNoErrors('economy/perks/box/teleporter/pap');

  // ---------- 6. weapons ----------
  const ids = await ev('Object.keys(ZM.Weapons.defs)');
  for (const id of ids) {
    for (const pap of [false, true]) {
      const res = await ev(`(() => { G.zombies = []; G.projectiles = []; tp(3, 8); const z = spawnAt(3, -4, 5000); z.state = 'idle'; P().weapons = [ZM.Weapons.makeState('${id}', ${pap})]; P().cur = 0; P().switchTimer = 0; P().fireTimer = 0; aimAt(z.chestPos()); const hp0 = z.hp; fire(3); sim(2); return { hp: z.hp, hp0, shots: P().shotsFired, dead: z.dead }; })()`);
      check(res.shots > 0 && (res.hp < res.hp0 || res.dead), `${id}${pap ? ' (PaP)' : ''} fires & damages (${res.hp0}→${res.hp}${res.dead ? ' dead' : ''})`);
    }
  }
  const chain = await ev(`(() => { G.zombies = []; tp(3, 6); for (let i = 0; i < 8; i++) { const z = spawnAt(-1 + i * 0.9, -5 - (i % 2), 2000); z.state = 'idle'; } P().weapons = [ZM.Weapons.makeState('wunderwaffe')]; P().cur = 0; P().switchTimer = 0; P().fireTimer = 0; aimAt(G.zombies[3].chestPos()); fire(1); return G.zombies.filter(z => z.dead).length; })()`);
  check(chain >= 6, `Wunderwaffe chains (${chain} killed)`);
  await snap('wunderwaffe');
  const melee = await ev(`(() => { G.zombies = []; tp(3, 6); const z = spawnAt(3, 4.8, 150); z.state = 'idle'; aimAt(z.chestPos()); P().bowie = true; sim(0.05, [], ['KeyV']); sim(0.6); return z.dead; })()`);
  check(melee === true, 'Bowie melee kills');
  const gren = await ev(`(() => { G.zombies = []; G.projectiles = []; tp(3, 8); const z = spawnAt(3, 2, 600); z.state = 'idle'; P().grenades = 2; sim(0.01); P().pitch = -0.6; sim(0.05, [], ['KeyG']); sim(5); return { dead: z.dead, hp: z.hp, g: P().grenades, proj: G.projectiles.length }; })()`);
  check(gren.g === 1 && gren.proj === 0 && (gren.dead || gren.hp < 600), `grenade explodes and damages (${JSON.stringify(gren)})`);
  const monkey = await ev(`(() => { G.zombies = []; G.projectiles = []; tp(3, 8); const z = spawnAt(-6, 0, 3000); P().monkeys = 1; P().pitch = 0.2; sim(0.05, [], ['KeyN']); sim(2.5); const mk = G.monkey ? ZM.V.copy(G.monkey.pos) : null; const d0 = mk ? ZM.V.distXZ(z.pos, mk) : null; sim(4); const d1 = mk ? ZM.V.distXZ(z.pos, mk) : null; sim(5); return { mk: !!mk, d0, d1, dead: z.dead, hp: z.hp, left: P().monkeys }; })()`);
  check(monkey.mk && monkey.d1 < monkey.d0 && (monkey.dead || monkey.hp < 3000), `monkey bomb attracts then explodes (${JSON.stringify(monkey)})`);
  const clay = await ev(`(() => { G.zombies = []; G.claymores = []; tp(3, 8); P().hasClaymores = true; P().claymores = 1; sim(0.05, [], ['KeyC']); const z = spawnAt(3, 4, 800); sim(4); return { placed: P().claymores, cl: G.claymores.length, dead: z.dead, hp: z.hp }; })()`);
  check(clay.placed === 0 && clay.cl === 0 && (clay.dead || clay.hp < 800), `claymore triggers (${JSON.stringify(clay)})`);
  assertNoErrors('weapons');

  // ---------- 7. barrier repair, power-ups ----------
  const rep = await ev(`(() => { G.zombies = []; G.powerups = []; G.doublePoints = 0; G.instaKill = 0; const w = G.map.windows[0]; w.boards = 2; tp(w.inside.x, w.inside.z + 0.5); const p0 = P().points; sim(0.1); const txt = P().interact ? P().interact.text : ''; sim(1.6, ['KeyF']); return { txt, boards: w.boards, gained: P().points - p0 }; })()`);
  check(/rebuild/.test(rep.txt) && rep.boards === 4 && rep.gained === 20, `barrier repair (${JSON.stringify(rep)})`);
  const pus = await ev(`(() => { const out = {}; G.zombies = []; tp(32, 8);
    for (const t of ['max_ammo', 'insta_kill', 'double_points', 'carpenter', 'fire_sale', 'nuke']) { G.map.windows[0].boards = 1; P().weapons[0].reserve = 0; P().grenades = 0; const zz = spawnAt(34, 10, 100); const pu = new ZM.PowerUp(G, t, { x: P().pos.x, y: 0, z: P().pos.z }); G.powerups.push(pu); sim(0.2); out[t] = { ammo: P().weapons[0].reserve, gren: P().grenades, insta: G.instaKill, dbl: G.doublePoints, boards: G.map.windows[0].boards, fs: G.fireSale, nukeDead: zz.dead }; G.instaKill = 0; G.doublePoints = 0; G.fireSale = 0; G.zombies = []; }
    return out; })()`);
  check(pus.max_ammo.ammo > 0 && pus.max_ammo.gren === 4, 'Max Ammo refills');
  check(pus.insta_kill.insta > 29 && pus.double_points.dbl > 29 && pus.fire_sale.fs > 29, 'Insta-Kill / Double Points / Fire Sale timers');
  check(pus.carpenter.boards === 6, 'Carpenter rebuilds');
  check(pus.nuke.nukeDead === true, 'Nuke kills');
  const fsCost = await ev('(() => { G.fireSale = 10; const c = G.boxCost(); const n = G.boxActiveSpots().length; G.fireSale = 0; return [c, n]; })()');
  check(fsCost[0] === 10 && fsCost[1] === 6, 'fire sale: 10 points at all 6 spots');

  // ---------- 8. hellhound round ----------
  const dogs = await ev(`(() => { G.reset(); sim(3.5); P().maxHealth = 1e9; P().health = 1e9; G.zombies = []; G.powerups = []; G.roundState = 'active'; G.toSpawn = 0; G.nextDogRound = G.round + 1; sim(7); const r = G.round, dog = G.dogRound; sim(22); const n = G.zombies.length, types = G.zombies.map(z => z.type); P().grenades = 0; for (const z of G.zombies) if (!z.dead) G.damageZombie(z, 1e9, { source: 'bullet', point: z.chestPos() }); sim(0.2); return { r, dog, n, types, pu: G.powerups.map(p => p.type), gren: P().grenades }; })()`);
  check(dogs.dog && dogs.n > 0 && dogs.types.every(t => t === 'dog'), `hellhound round spawns dogs (${JSON.stringify(dogs)})`);
  check(dogs.pu.includes('max_ammo') || dogs.gren === 4, 'Max Ammo after the last dog');
  await snap('dogs');
  assertNoErrors('powerups/dogs');

  // ---------- 9. pathing across the whole two-storey map ----------
  await ev('G.reset(); G.roundState = "idle"; P().maxHealth = 1e9; P().health = 1e9; for (const d of G.map.doors) d.open = true; G.map.gate.open = true; G.map.setBridge(true); G.nav.rebuild(); G.zombies = []');
  const pathRes = await ev(`(() => { tp(48, 8); const z = spawnAt(-44, 2, 1e9); z.speed = 5.3; const d0 = ZM.V.distXZ(z.pos, P().pos); let t = 0; while (t < 120 && ZM.V.distXZ(z.pos, P().pos) > 2) { sim(1); t += 1; } return { d0, d1: ZM.V.distXZ(z.pos, P().pos), t, state: z.state }; })()`);
  check(pathRes.d1 < 2.5, `zombie paths from Teleporter C to spawn in ${pathRes.t}s (${pathRes.d1.toFixed(1)}m, ${pathRes.state})`);
  const upstairs = await ev(`(() => { G.zombies = []; tp(-25, -28, 0, 3.5); const z = spawnAt(0, -30, 1e9); z.speed = 5.3; let t = 0; while (t < 90 && ZM.V.distXZ(z.pos, P().pos) > 2) { sim(1); t += 1; } return { d1: ZM.V.distXZ(z.pos, P().pos), y: z.pos.y, t }; })()`);
  check(upstairs.d1 < 2.5 && Math.abs(upstairs.y - 3.5) < 0.05, `zombie climbs the garage stairs to Teleporter B (${JSON.stringify(upstairs)})`);
  const bridgeWalk = await ev(`(() => { G.zombies = []; tp(-6, 18, 0, 3.5); const z = spawnAt(-6, -22, 1e9, 3.5); z.speed = 5.3; let t = 0; while (t < 60 && ZM.V.distXZ(z.pos, P().pos) > 2) { sim(1); t += 1; } return { d1: ZM.V.distXZ(z.pos, P().pos), y: z.pos.y, t }; })()`);
  check(bridgeWalk.d1 < 2.5 && Math.abs(bridgeWalk.y - 3.5) < 0.05, `zombie crosses the bridge between balconies (${JSON.stringify(bridgeWalk)})`);
  const office = await ev(`(() => { G.zombies = []; tp(-40, -12, 0, 3.5); const z = spawnAt(-30, 6, 1e9); z.speed = 5.3; let t = 0; while (t < 60 && ZM.V.distXZ(z.pos, P().pos) > 2) { sim(1); t += 1; } return { d1: ZM.V.distXZ(z.pos, P().pos), y: z.pos.y, t }; })()`);
  check(office.d1 < 2.5 && Math.abs(office.y - 3.5) < 0.05, `zombie reaches Dr. Maxis' office via the catwalk stairs (${JSON.stringify(office)})`);
  const win = await ev(`(() => { G.zombies = []; tp(32, 8); const w = G.map.windows.find(x => x.id === 'W_S1'); w.boards = 6; const z = new ZM.Zombie(G, { pos: ZM.V.copy(w.outside), hp: 1e6, speed: 3, window: w, state: 'toWindow' }); G.zombies.push(z); const st = []; for (let i = 0; i < 20; i++) { sim(1); st.push(z.state + ':' + w.boards); } return { st, inside: G.map.zoneAt(z.pos.x, z.pos.z) }; })()`);
  check(win.st.some(s => s.startsWith('tear')) && win.st.some(s => s.startsWith('chase')) && win.inside === 'S', `window zombie tears & vaults (${win.st.slice(0, 12).join(' ')})`);
  // balcony drop: player walks off the garage balcony into the courtyard (bridge up)
  const drop = await ev(`(() => { G.map.setBridge(false); G.nav.rebuild(); tp(-2, -19, Math.PI, 3.5); sim(1.0, ['KeyW']); sim(1.0); return { y: P().pos.y, z: P().pos.z, zone: G.map.zoneAt(P().pos.x, P().pos.z) }; })()`);
  check(drop.y === 0 && drop.zone === 'CY', `player drops from the balcony into the courtyard (${JSON.stringify(drop)})`);

  // ---------- 10. Quick Revive, scaling, vault ----------
  const qr = await ev(`(() => { G.reset(); sim(3.5); G.roundState = 'idle'; G.zombies = []; P().perks = new Set(['quick_revive', 'juggernog']); P().maxHealth = 250; P().health = 10; P().takeDamage(50); const d = P().downed; sim(9); return { d, downed: P().downed, dead: P().dead, perks: P().perks.size, hp: P().health, over: G.gameOver }; })()`);
  check(qr.d && !qr.downed && !qr.dead && qr.perks === 0 && qr.hp === 100 && !qr.over, `Quick Revive revives and strips perks (${JSON.stringify(qr)})`);
  const scale = await ev('[ZM.Game.zombieCount(1), ZM.Game.zombieCount(10), ZM.Game.zombieCount(30), ZM.Game.zombieCount(100), ZM.Game.zombieHealth(1), ZM.Game.zombieHealth(9), ZM.Game.zombieHealth(10), ZM.Game.zombieHealth(100)]');
  check(scale[0] === 6 && scale[1] === 33 && scale[2] === 105 && scale[3] === 924, `zombie counts ${scale.slice(0, 4)}`);
  check(scale[4] === 150 && scale[5] === 950 && scale[6] === 1045 && scale[7] > 5000000, `zombie health ${scale.slice(4)}`);
  const vault = await ev(`(() => { G.reset(); G.zombies = []; sim(3.5); const h0 = G.vault.history; G.roundState = 'active'; G.toSpawn = 0; sim(7); const r2 = G.round; const forged = (() => { G.round = 100; const v = G.vault; return { r: v.round, ok: v.open().ok }; })(); G.round = r2; while (G.round < 100) G.advanceRound(); return { h0, r2, forged, res: G.flagResult, pending: G.flagPending }; })()`);
  check(vault.r2 === 2 && vault.h0 === 0, 'round naturally advances to 2 when all zombies are dead');
  check(vault.forged.ok === false && vault.forged.r === 2, 'game.round = 100 forgery does not unlock');
  check(vault.res && vault.res.ok && vault.res.flag.startsWith('flag{'), 'legit chain to 100 yields the flag');
  await ev('ZMDEV.setState("flag")'); await sleep(200); await shot('flag'); await ev('ZMDEV.setState("paused")');
  // ---------- 11. settings: rebinding, persistence, options ----------
  const sett = await ev(`(() => { const st = G.settings; st.reset(); G.reset(); G.roundState = 'idle'; G.zombies = []; tp(3, 8); const z = spawnAt(3, -4, 1e9); z.state = 'idle'; aimAt(z.chestPos());
    P().weapons = [ZM.Weapons.makeState('m14')]; P().cur = 0; P().switchTimer = 0; P().fireTimer = 0;
    const s0 = P().shotsFired; fire(1); const shotsMouse = P().shotsFired - s0;
    st.bind('fire', 'KeyX'); const s1 = P().shotsFired; sim(0.02, [], ['Mouse0'], { 0: true }); sim(0.3); const shotsOld = P().shotsFired - s1;
    const s2 = P().shotsFired; sim(0.02, ['KeyX'], ['KeyX']); sim(0.3); const shotsNew = P().shotsFired - s2;
    st.bind('interact', 'Mouse0'); const swapped = st.binding('fire') === 'KeyX' && st.binding('interact') === 'Mouse0';
    st.bind('reload', 'KeyX'); const swap2 = st.binding('reload') === 'KeyX' && st.binding('fire') === 'KeyR';
    st.set('sensitivity', 5.5); st.set('invertY', true); st.set('fov', 90); st.set('crosshair', 'dot'); st.save();
    const fresh = new ZM.Settings(); const persisted = fresh.get('sensitivity') === 5.5 && fresh.get('invertY') === true && fresh.binding('reload') === 'KeyX';
    fresh.applyPlayer(P()); const applied = Math.abs(P().sensitivity - 0.0055) < 1e-9 && P().invertY === true;
    G.settings = fresh; const fov = G.cameraFov(); G.settings = st;
    st.reset(); const back = st.binding('fire') === 'Mouse0' && st.get('sensitivity') === 2.2;
    return { shotsMouse, shotsOld, shotsNew, swapped, swap2, persisted, applied, fov, back }; })()`);
  check(sett.shotsMouse === 1 && sett.shotsOld === 0 && sett.shotsNew === 1, `rebinding fire to X works and the old button stops firing (${JSON.stringify(sett)})`);
  check(sett.swapped && sett.swap2, 'duplicate bindings swap');
  check(sett.persisted && sett.applied && Math.abs(sett.fov - Math.PI / 2) < 0.01, 'settings persist in localStorage and apply (sensitivity, invert, FOV)');
  check(sett.back, 'reset to defaults');
  await ev('ZMDEV.hud.openSettings("menu"); ZMDEV.hud.tab = 0'); await sleep(300); await shot('settings_controls');
  await ev('ZMDEV.hud.tab = 1'); await sleep(300); await shot('settings_mouse');
  await ev('ZMDEV.hud.onCloseSettings()');
  check(await ev('ZMDEV.getState()') === 'menu', 'settings closes back to the menu');
  await ev('ZMDEV.setState("paused")');
  assertNoErrors('end of session');
  // scenic screenshots
  await ev(`G.reset(); G.roundState = 'idle'; G.zombies = []; for (const d of G.map.doors) d.open = true; G.map.gate.open = true; G.turnOnPower(); sim(5); tp(50, 8, Math.PI / 2 + 0.4); for (let i = 0; i < 6; i++) spawnAt(36 + i * 1.2, 8 - (i % 3), 500); P().points = 1234; sim(0.5)`);
  await snap('spawn_horde');
  await ev('G.zombies = []; tp(-2, 8, Math.PI, 0); P().pitch = 0.15; sim(0.1)'); await snap('courtyard');
  await ev('tp(-20, -30, Math.PI / 2, 0); sim(0.1)'); await snap('garage');
  await ev('tp(-25, -22, 0, 3.5); sim(0.1)'); await snap('teleporterB');
  await ev('tp(-16, 0, Math.PI / 2, 0); P().pitch = 0.1; sim(0.1)'); await snap('factory_hall');
  await ev('tp(-24, 32, 0, 0); sim(0.1)'); await snap('teleporterA');
  await ev('tp(2, 30, Math.PI, 0); sim(0.1)'); await snap('lab');
  b.close();
  console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.log('ERROR', e); process.exit(2); });
