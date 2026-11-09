// node tests/test_map.js — Der Riese map + two-layer nav sanity
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { ZM: {}, TextEncoder, TextDecoder, performance, console };
vm.createContext(ctx);
for (const f of ['js/00_core.js', 'js/30_renderer.js', 'js/60_weapons.js', 'js/45_props.js', 'js/40_map.js', 'js/50_nav.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const ZM = ctx.ZM;
let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); }
const map = new ZM.GameMap();
const nav = new ZM.NavGrid(map);
console.log('colliders', map.colliders.length, 'floors', map.floors.length, 'windows', map.windows.length, 'doors', map.doors.length, 'grid', nav.w + 'x' + nav.h, 'nodes', nav.nodes);
const nodeAt = (p) => nav.nodeOf(p.x, p.z, p.y || 0);
const sp = map.spawn.pos;
let reach = nav.reachableFrom(sp.x, sp.z, sp.y);
const reachZones = () => { const zs = new Set(); for (let i = 0; i < reach.length; i++) if (reach[i]) { const c = nav.center(i); const z = map.zoneAt(c.x, c.z); if (z) zs.add(z); } return zs; };
check(nav.isWalkable(sp.x, sp.z, 0), 'spawn walkable');
let zs = reachZones();
check(zs.size === 1 && zs.has('S'), 'only spawn zone reachable initially: ' + [...zs]);
for (const w of map.windows) {
  check(nav.isWalkable(w.inside.x, w.inside.z, w.inside.y), `window ${w.id} inside walkable`);
  check(nav.isWalkable(w.outside.x, w.outside.z, w.outside.y), `window ${w.id} outside walkable`);
  const r = nav.reachableFrom(w.outside.x, w.outside.z, w.outside.y);
  const ii = nodeAt(w.inside);
  check(!r[ii], `window ${w.id} pocket isolated from interior`);
  check(Math.abs(nav.height[ii] - w.inside.y) < 0.01, `window ${w.id} inside height ${w.inside.y}`);
}
// open everything except the balcony debris; bridge up
const openAll = (except = []) => { for (const d of map.doors) d.open = !except.includes(d.id); map.gate.open = true; nav.update(); reach = nav.reachableFrom(sp.x, sp.z, sp.y); };
openAll(['D_LB', 'D_RB']);
zs = reachZones();
check(['S', 'RF', 'LF', 'GAR', 'CY', 'LAB', 'TA', 'TC'].every(z => zs.has(z)) && !zs.has('TB'), 'ground floor zones reachable, TB (upstairs) not without balcony debris: ' + [...zs]);
check(!reach[nav.nodeOf(-6, 18, 3.5)], 'left balcony unreachable without its debris');
check(!reach[nav.nodeOf(-6, -22, 3.5)], 'right balcony unreachable without its debris');
openAll(['D_LB']);
check(reach[nav.nodeOf(-6, -22, 3.5)] === 1, 'right balcony reachable via garage stairs + debris');
check(reach[nav.nodeOf(-25, -28, 3.5)] === 1, 'Teleporter B room (upstairs) reachable from the balcony');
check(!reach[nav.nodeOf(-2, 0, 3.5)], 'bridge not walkable before power');
check(!reach[nav.nodeOf(-6, 18, 3.5)], 'left balcony unreachable while the bridge is up and its debris closed');
check(reach[nav.nodeOf(-2, 3, 0)] === 1, 'courtyard floor under the bridge line walkable');
map.setBridge(true); nav.rebuild(); openAll(['D_LB']);
check(reach[nav.nodeOf(-2, 0, 3.5)] === 1, 'bridge walkable after power');
check(reach[nav.nodeOf(-6, 18, 3.5)] === 1, 'left balcony reachable over the bridge');
check(reach[nav.nodeOf(-2, 3, 0)] === 1, 'courtyard under the bridge still walkable (two layers)');
openAll();
for (const r of map.risers) check(reach[nav.nodeOf(r.x, r.z, r.y)] === 1, `riser ${r.zone} (${r.x},${r.z}) reachable`);
for (const w of map.windows) check(reach[nodeAt(w.inside)] === 1, `window ${w.id} inside reachable`);
for (const b of map.boxSpots) check(reach[nav.nearestWalkable(b.pos.x, b.pos.z, b.pos.y, 2)] === 1 && Math.abs(nav.height[nav.nearestWalkable(b.pos.x, b.pos.z, b.pos.y, 2)] - b.pos.y) < 0.01, `box spot ${b.id} reachable at y=${b.pos.y}`);
for (const t of map.teleporters) check(reach[nav.nearestWalkable(t.pos.x, t.pos.z, t.pos.y, 2)] === 1, `teleporter ${t.id} reachable`);
for (const p of map.perks) check(reach[nav.nearestWalkable(p.pos.x, p.pos.z, p.pos.y, 2)] === 1, `perk ${p.id} reachable`);
for (const wb of map.wallbuys) check(reach[nav.nearestWalkable(wb.pos.x, wb.pos.z, wb.pos.y, 2)] === 1, `wallbuy ${wb.weapon} reachable`);
for (const t of map.traps) check(reach[nav.nearestWalkable(t.switchPos.x, t.switchPos.z, t.switchPos.y, 2)] === 1, `trap ${t.id} switch reachable`);
check(reach[nav.nearestWalkable(map.pap.pos.x, map.pap.pos.z, 0, 2)] === 1, 'pack-a-punch reachable');
check(reach[nav.nearestWalkable(map.power.pos.x, map.power.pos.z, 0, 2)] === 1, 'power switch reachable');
check(reach[nav.nearestWalkable(map.mainframe.pos.x, map.mainframe.pos.z, 0, 2)] === 1, 'mainframe reachable');
check(reach[nav.nodeOf(-40, -12, 3.5)] === 1 && reach[nav.nodeOf(-40, -12, 0)] === 1, "Dr. Maxis' office (3.5) and the hall beneath it (0) both reachable");
check(reach[nav.nodeOf(-25, -16, 3.5)] === 1 && reach[nav.nodeOf(-25, -16, 0)] === 1, 'catwalk and the floor under it both reachable');
check(reach[nav.nodeOf(-45, 22, 0)] === 1, 'trench reachable');
check(map.doors.every(d => d.zones.every(z => map.zones[z])), 'door zones exist');
check(map.doors.filter(d => d.power).length === 2, 'two power doors');
// floor heights
check(map.floorHeight(50, 8) === 0 && Math.abs(map.floorHeight(40, -2, 1000) - 1.75) < 0.01, 'spawn floor 0, mainframe platform raised');
check(Math.abs(map.floorHeight(8, -30, 1.5) - 1.75) < 0.01, 'garage stairs mid height');
check(map.floorHeight(-2, -22, 0) === 0 && map.floorHeight(-2, -22, 3.5) === 3.5, 'garage floor vs balcony by reference height');
check(map.floorHeight(-44, -12, 0) === 0 && map.floorHeight(-44, -12, 3.5) === 3.5, 'hall vs office');
map.setBridge(false); check(map.floorHeight(-2, 0, 3.5) === 0, 'bridge up: fall through to courtyard'); map.setBridge(true); check(map.floorHeight(-2, 0, 3.5) === 3.5, 'bridge down: walkable');
// flow field + step
nav.rebuild(); openAll();
nav.computeField(sp);
check(isFinite(nav.distanceAt(-44, 2, 0)), 'field reaches teleporter C from spawn');
check(isFinite(nav.distanceAt(-25, -28, 3.5)), 'field reaches teleporter B (upstairs)');
const step = nav.nextStep({ x: -44, y: 0, z: 2 });
check(step && nav.distanceAt(step.x, step.z, step.y) < nav.distanceAt(-44, 2, 0), 'nextStep decreases distance');
// collision
const r1 = map.resolveCircle(26.1, -3, 0.35, 0.1, 1.7);
check(Math.abs(r1.x - 26.1) > 0.2, 'pushed out of the spawn west wall: ' + r1.x.toFixed(2));
for (const d of map.doors) d.open = false;
const r2 = map.resolveCircle(32, 16, 0.35, 0.1, 1.7);
check(Math.abs(r2.z - 16) > 0.3, 'closed gate blocks: ' + r2.z.toFixed(2));
map.doors.find(d => d.id === 'D_L').open = true;
const r3 = map.resolveCircle(32, 16, 0.35, 0.1, 1.7);
check(Math.abs(r3.z - 16) < 1e-6, 'open gate passable');
const rf = map.resolveCircle(40, 16.1, 0.35, 0.1, 1.7);
check(Math.abs(rf.z - 16.1) > 0.3, 'yard fence base blocks: ' + rf.z.toFixed(2));
// solid platform and stairs: nothing walkable underneath, the treads themselves are
check(map.floorHeightsAt(35, -7).length === 1 && map.floorHeightsAt(35, -7)[0] === 1.3, 'no ground layer under the mainframe platform');
check(map.floorHeightsAt(36, 4.5).length === 1 && Math.abs(map.floorHeightsAt(36, 4.5)[0] - 1.1375) < 0.01, 'no ground layer under the top of the platform stairs');
check(map.floorHeightsAt(8, -27).length === 2 && map.floorHeightsAt(8, -27)[0] === 0, 'headroom under the high end of the garage stairs');
check(Math.abs(nav.height[nav.nodeOf(35, -7, 0)] - 1.3) < 0.01 && nav.isWalkable(35, -7, 1.3) && !nav.isWalkable(33.6, 5, 0) && nav.isWalkable(36, 5, 1.0) && nav.isWalkable(36, 7.5, 0), 'platform top and treads walkable, nothing beside or under the stairs');
const ru = map.resolveCircle(33.7, 4.5, 0.4, 0.2, 1.4);
check(ru.x < 33.65, 'walking into the side of the stairs is blocked: ' + ru.x.toFixed(2));
const rt = map.resolveCircle(36, 4.6, 0.4, 1.3, 2.5);
check(Math.abs(rt.x - 36) < 1e-6 && Math.abs(rt.z - 4.6) < 1e-6, 'walking up the stairs onto the platform is free');
let t0 = Date.now(); for (let i = 0; i < 20; i++) { nav.fields.player.target = null; nav.computeField({ x: 30 + (i % 3), y: 0, z: 0 }); } console.log('field compute avg ms', (Date.now() - t0) / 20);
t0 = Date.now(); nav.update(); console.log('nav update ms', Date.now() - t0);
t0 = Date.now(); nav.rebuild(); console.log('nav rebuild ms', Date.now() - t0);
let verts = 0; for (const k in map.builders) verts += map.builders[k].count; console.log('static verts', verts, 'batches', Object.keys(map.builders).length);
console.log(fails ? `${fails} FAILURES` : 'ALL PASS'); process.exit(fails ? 1 : 0);
