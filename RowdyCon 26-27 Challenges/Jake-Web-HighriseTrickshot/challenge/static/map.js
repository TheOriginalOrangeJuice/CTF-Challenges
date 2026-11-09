// Rooftop trickshot map (simple block version). Shared by the game (draws it) and the server
// (exports the collision boxes for throwing-knife physics). No three.js in here.
//
// Layout (north = -z, roof floor y = 0), from the overhead + aerial references:
//   z -60..-42  NORTH OFFICE (tall brick): reception + elevators (spawn), stairwell to the north
//               tunnel, restrooms, storage, long main room + rear platforms; front ledge + roof climb
//   z -42..42   ROOFTOP
//     west half:  two sunken PITS (orange rims, red floors, chamfered outer ends); between them a
//                 walled passage with an electrical yard, running from the helipad's west stairs to
//                 the elevator core (ladder + tank) at the west edge; tunnels from each pit to its office
//     east half:  long east-west HELIPAD deck with the helicopter (dummy spawns on the east end),
//                 tank + vents to the north, shacks + substation to the south, scaffolding off the edge
//     west edge:  two big cranes cross in an X high above (scenery). A plank of lumber hangs from one
//                 of them past the parapet; it leads to a crane walkway that ramps up to the north
//                 office's front ledge (the lip of the building)
//   z 42..60    SOUTH OFFICE (grey, skylight on the roof): lobby, cubicles, side offices; the Sign.
//               A gondola hangs down its facade in a notch cut out of the roof's SE corner: jump
//               across to it (miss = fall), climb, walk the front ledge west, then up to the roof

export const BOT_AREA = { x: [24, 31], zAbs: [3.8, 8.5], y: 3.56 }; // east end of the helipad deck

export function buildMap(draw = {}) {
  const colliders = [];
  const ladders = [];
  const d = (name, ...args) => draw[name] && draw[name](...args);

  const C = {
    roof: 0x7f7d78, slab: 0x8a8882, trim: 0x5b5a56, concrete: 0x9a9890, metal: 0x8c949c, glass: 0x7fa0b8,
    white: 0xd8d5cc, crane: 0xd8a628, heli: 0x4c5446, band: 0x8e8c86, dark: 0x3a3a3a, steel: 0x6b6b6b,
    wood: 0x8a6a40, fence: 0x8f9499, orange: 0xd9772b, red: 0xa83a32, green: 0x3f6b3a, tarp: 0x3f7a3a,
    propane: 0xc8c8c0, cubicle: 0x9aa3a8, sign: 0x2b4f7a, brick: 0x8a4a3a, olive: 0x7d7a48,
  };

  // box: solid by default. shoot=false makes it solid but bullets pass (glass).
  function box(x0, y0, z0, x1, y1, z1, color, collide = true, shoot = collide) {
    d('box', x0, y0, z0, x1, y1, z1, color, shoot);
    if (collide) colliders.push([x0, y0, z0, x1, y1, z1]);
  }
  const glass = (x0, y0, z0, x1, y1, z1) => box(x0, y0, z0, x1, y1, z1, C.glass, true, false);
  function hCylinder(x, y, z, r, len, alongX, color) {
    d('hcyl', x, y, z, r, len, alongX, color);
    const hx = alongX ? len / 2 : r, hz = alongX ? r : len / 2;
    colliders.push([x - hx, y - r, z - hz, x + hx, y + r, z + hz]);
  }
  function vCylinder(x, y0, z, r, h, color) {
    d('vcyl', x, y0, z, r, h, color);
    colliders.push([x - r, y0, z - r, x + r, y0 + h, z + r]);
  }
  const crate = (x, z, s = 1.2, y = 0) => box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, C.wood);
  function tank(x, z, len, alongX, baseColor = C.white, y = 0) {   // horizontal tank on a base
    const bx = alongX ? len / 2 : 1.6, bz = alongX ? 1.6 : len / 2;
    box(x - bx, y, z - bz, x + bx, y + 1.2, z + bz, baseColor);
    hCylinder(x, y + 2.5, z, 1.3, len, alongX, 0x9aa0a4);
  }
  function bands(x0, z0, x1, z1, top) {
    for (let y = -196; y < top - 3; y += 6) box(x0 - 0.06, y, z0 - 0.06, x1 + 0.06, y + 1.2, z1 + 0.06, C.band, false);
  }
  // Ladder volume (walk into it holding forward to climb). face = side the wall is on: n/s/e/w.
  function ladder(x0, y0, z0, x1, y1, z1, face) {
    ladders.push([x0, y0, z0, x1, y1, z1]);
    const top = y1 - 0.4;
    if (face === 'n' || face === 's') {
      const zf = face === 'n' ? z0 + 0.02 : z1 - 0.12;
      box(x0 + 0.05, y0, zf, x0 + 0.2, top, zf + 0.1, C.dark, false);
      box(x1 - 0.2, y0, zf, x1 - 0.05, top, zf + 0.1, C.dark, false);
      for (let y = y0 + 0.3; y < top; y += 0.45) box(x0 + 0.2, y, zf, x1 - 0.2, y + 0.06, zf + 0.1, 0x555555, false);
    } else {
      const xf = face === 'w' ? x0 + 0.02 : x1 - 0.12;
      box(xf, y0, z0 + 0.05, xf + 0.1, top, z0 + 0.2, C.dark, false);
      box(xf, y0, z1 - 0.2, xf + 0.1, top, z1 - 0.05, C.dark, false);
      for (let y = y0 + 0.3; y < top; y += 0.45) box(xf, y, z0 + 0.2, xf + 0.1, y + 0.06, z1 - 0.2, 0x555555, false);
    }
  }
  function railing(x0, z0, x1, z1, y) {               // visual only
    box(x0, y + 0.95, z0, x1, y + 1.05, z1, 0x6b5a3a, false);
    const alongX = x1 - x0 > z1 - z0, len = Math.max(x1 - x0, z1 - z0);
    for (let t = 0; t <= len; t += 2) {
      const px = alongX ? x0 + t : x0, pz = alongX ? z0 : z0 + t;
      box(px, y, pz, px + 0.08, y + 1, pz + 0.08, 0x6b5a3a, false);
    }
  }
  function davit(x, z, dir) {                         // window-cleaning arm on the roof edge (visual)
    box(x - 0.1, 0, z - 0.1, x + 0.1, 1.6, z + 0.1, 0x333333, false);
    box(Math.min(x, x + dir * 1.8), 1.5, z - 0.08, Math.max(x, x + dir * 1.8), 1.65, z + 0.08, 0x9a9a9a, false);
  }
  // Solid fill of a rectangle minus rectangular holes (cuts the Pit, tunnels and stairwells).
  function fillAround(x0, z0, x1, z1, holes, y0, y1, color) {
    const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]])])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
    const zs = [...new Set([z0, z1, ...holes.flatMap((h) => [h[1], h[3]])])].filter((v) => v >= z0 && v <= z1).sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      let start = null;
      for (let j = 0; j <= zs.length - 1; j++) {
        const solid = j < zs.length - 1 && !holes.some((h) => {
          const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
          return cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3];
        });
        if (solid && start === null) start = zs[j];
        if (!solid && start !== null) { box(xs[i], y0, start, xs[i + 1], y1, zs[j], color); start = null; }
      }
    }
  }
  // n steps of 0.5 m (0.6 m deep) starting at `edge`, rising as you move in dir.sign along dir.axis.
  function stairs(edge, a0, a1, yBottom, n, dir, color = C.steel) {
    for (let k = 1; k <= n; k++) {
      const s0 = edge + dir.sign * 0.6 * (k - 1), s1 = edge + dir.sign * 0.6 * k;
      const lo = Math.min(s0, s1), hi = Math.max(s0, s1), top = yBottom + 0.5 * k;
      if (dir.axis === 'x') box(lo, yBottom, a0, hi, top, a1, color);
      else box(a0, yBottom, lo, a1, top, hi, color);
    }
  }
  // Walls with door gaps (2.6 m tall openings); optional see-through glass band.
  function wallX(x0, x1, z0, z1, h, gaps = [], color = C.white, glassBand = null) {
    let cur = x0;
    const seg = (a, b) => {
      if (b - a < 0.05) return;
      if (!glassBand) { box(a, 0, z0, b, h, z1, color); return; }
      box(a, 0, z0, b, glassBand[0], z1, color);
      glass(a, glassBand[0], z0, b, glassBand[1], z1);
      box(a, glassBand[1], z0, b, h, z1, color);
    };
    for (const [g0, g1] of gaps) { seg(cur, g0); box(g0, 2.6, z0, g1, h, z1, color); cur = g1; }
    seg(cur, x1);
  }
  function wallZ(z0, z1, x0, x1, h, gaps = [], color = C.white) {
    let cur = z0;
    for (const [g0, g1] of gaps) { if (g0 - cur > 0.05) box(x0, 0, cur, x1, h, g0, color); box(x0, 2.6, g0, x1, h, g1, color); cur = g1; }
    if (z1 - cur > 0.05) box(x0, 0, cur, x1, h, z1, color);
  }
  // Window-cleaning gondola hanging on its side against an east-facing wall (x = xWall), out over the drop.
  // Its frame is the ladder; the bottom is high, so you have to jump to catch it.
  function gondolaEast(z0, z1, y0, y1, xWall, roofY) {
    ladders.push([xWall, y0, z0, xWall + 0.95, y1 + 0.6, z1]);
    const xf = xWall + 0.6, FR = 0xb8a070, PANEL = 0x3a3d40;
    box(xWall + 0.05, y0, z0 + 0.1, xWall + 0.25, y1, z1 - 0.1, PANEL, false);
    box(xWall, y0, z0, xf, y1, z0 + 0.12, FR, false);
    box(xWall, y0, z1 - 0.12, xf, y1, z1, FR, false);
    box(xWall, y0, z0, xf, y0 + 0.12, z1, FR, false);
    box(xWall, y1 - 0.12, z0, xf, y1, z1, FR, false);
    for (let y = y0 + 0.45; y < y1 - 0.2; y += 0.9) box(xf - 0.08, y, z0, xf, y + 0.08, z1, FR, false);
    for (const z of [z0 + 0.25, z1 - 0.25]) box(xWall + 0.27, y1, z - 0.03, xWall + 0.33, roofY, z + 0.03, 0x222222, false);
  }
  // Window-cleaning gondola hanging straight down a north-facing wall (z = zWall), facing north.
  // Its frame is the ladder: jump onto it and hold forward to climb.
  function gondolaNorth(x0, x1, y0, y1, zWall, roofY) {
    ladders.push([x0, y0, zWall - 0.95, x1, y1 + 0.6, zWall]);
    const zf = zWall - 0.6, FR = 0xb8a070, PANEL = 0x3a3d40;
    box(x0 + 0.1, y0, zWall - 0.25, x1 - 0.1, y1, zWall - 0.05, PANEL, false);
    box(x0, y0, zf, x0 + 0.12, y1, zWall, FR, false);
    box(x1 - 0.12, y0, zf, x1, y1, zWall, FR, false);
    box(x0, y0, zf, x1, y0 + 0.12, zWall, FR, false);
    box(x0, y1 - 0.12, zf, x1, y1, zWall, FR, false);
    for (let y = y0 + 0.45; y < y1 - 0.2; y += 0.9) box(x0, y, zf, x1, y + 0.08, zf + 0.08, FR, false);
    for (const x of [x0 + 0.25, x1 - 0.25]) box(x - 0.03, y1, zWall - 0.33, x + 0.03, roofY, zWall - 0.27, 0x222222, false);
  }
  // Sloped plank of lumber (walkable): chain of thin collision blocks, drawn as one tilted board.
  function plank(x0, z0, y0, x1, z1, y1, width) {
    d('plank', x0, z0, y0, x1, z1, y1, width, C.wood);
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), h = width / 2;
    for (let t = 0; t <= len; t += 0.25) {
      const f = t / len, cx = x0 + dx * f, cz = z0 + dz * f, top = y0 + (y1 - y0) * f;
      colliders.push([cx - h, top - 0.15, cz - h, cx + h, top, cz + h]);
    }
  }
  // Crane sling: two cables from the load's ends up to a hook, then one cable up to the crane arm.
  function sling(p0, p1, hook, armY) {
    d('cable', p0[0], p0[1], p0[2], hook[0], hook[1], hook[2]);
    d('cable', p1[0], p1[1], p1[2], hook[0], hook[1], hook[2]);
    box(hook[0] - 0.3, hook[1], hook[2] - 0.3, hook[0] + 0.3, hook[1] + 0.6, hook[2] + 0.3, C.dark, false);
    d('cable', hook[0], hook[1] + 0.6, hook[2], hook[0], armY, hook[2]);
  }
  const desk = (x, z) => box(x - 0.8, 0, z - 0.4, x + 0.8, 0.75, z + 0.4, 0x7a6248);
  // Walkable crane arm at roof level: one rotated beam for looks, a chain of small blocks to stand on.
  function beam(x0, z0, x1, z1, top, mastT) {
    d('boom', x0, z0, x1, z1, top, C.crane);
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    for (let t = 0; t <= len; t += 0.6) {
      const cx = x0 + dx * t / len, cz = z0 + dz * t / len;
      colliders.push([cx - 0.8, top - 0.5, cz - 0.8, cx + 0.8, top, cz + 0.8]);
    }
    const mx = x0 + dx * mastT, mz = z0 + dz * mastT;
    box(mx - 1, -200, mz - 1, mx + 1, top - 1.9, mz + 1, C.crane);
    box(mx - 0.25, top + 0.2, mz - 0.25, mx + 0.25, top + 9, mz + 0.25, C.crane, false);
    box(mx + 1, top - 4.5, mz - 1, mx + 3.4, top - 1.9, mz + 1, 0xe6e2d6, false);
    const tx = x0 + dx * 0.97, tz = z0 + dz * 0.97;
    box(tx - 0.05, top - 14, tz - 0.05, tx + 0.05, top - 1.9, tz + 0.05, 0x222222, false);
    box(tx - 0.6, top - 15, tz - 0.6, tx + 0.6, top - 14, tz + 0.6, C.dark, false);
  }

  // Lattice tower (visual, solid core): corner posts + rings + X braces
  function lattice(x, z, y0, y1, half = 1) {
    box(x - 0.6, y0, z - 0.6, x + 0.6, y1, z + 0.6, C.crane, true, false);
    for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) box(x + cx * half - 0.1, y0, z + cz * half - 0.1, x + cx * half + 0.1, y1, z + cz * half + 0.1, C.crane, false);
    for (let y = Math.max(y0, -30); y < y1; y += 2) {
      box(x - half, y, z - half - 0.05, x + half, y + 0.1, z - half + 0.05, C.crane, false);
      box(x - half, y, z + half - 0.05, x + half, y + 0.1, z + half + 0.05, C.crane, false);
      box(x - half - 0.05, y, z - half, x - half + 0.05, y + 0.1, z + half, C.crane, false);
      box(x + half - 0.05, y, z - half, x + half + 0.05, y + 0.1, z + half, C.crane, false);
    }
  }
  // Walkable, sloped crane arm (a ramp) from (x0,z0,y0) to (x1,z1,y1), hung from a lattice tower.
  // Collision is a chain of short blocks whose tops rise a few cm at a time, so you can walk up it.
  function craneArm(x0, z0, y0, x1, z1, y1, towerT = 0.5, towerSide = 1) {
    d('boom', x0, z0, y0, x1, z1, y1, C.crane);
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    for (let t = 0; t <= len; t += 0.3) {
      const f = t / len, cx = x0 + dx * f, cz = z0 + dz * f, top = y0 + (y1 - y0) * f;
      colliders.push([cx - 0.8, top - 0.5, cz - 0.8, cx + 0.8, top, cz + 0.8]);
    }
    const ux = dx / len, uz = dz / len;
    const tx = x0 + dx * towerT + uz * 2.4 * towerSide, tz = z0 + dz * towerT - ux * 2.4 * towerSide;
    const topAt = y0 + (y1 - y0) * towerT;
    lattice(tx, tz, -200, Math.max(y0, y1) + 14);
    box(tx - 1.4, Math.max(y0, y1) + 9, tz - 1.4, tx + 1.4, Math.max(y0, y1) + 11.5, tz + 1.4, 0xe6e2d6, false);   // cab
    box(Math.min(tx, x0 + dx * towerT) - 0.15, topAt - 0.7, Math.min(tz, z0 + dz * towerT) - 0.15,
        Math.max(tx, x0 + dx * towerT) + 0.15, topAt - 0.5, Math.max(tz, z0 + dz * towerT) + 0.15, C.crane, false);  // tie-in
    const hx = x0 + dx * 0.97, hz = z0 + dz * 0.97, hy = y0 + (y1 - y0) * 0.97;
    box(hx - 0.05, hy - 12, hz - 0.05, hx + 0.05, hy - 0.5, hz + 0.05, 0x222222, false);
    box(hx - 0.6, hy - 13, hz - 0.6, hx + 0.6, hy - 12, hz + 0.6, C.dark, false);
  }

  const W = 35, NZ = -42, SZ = 42, NB = -60, SB = 60, IH = 5.5;   // roof half-width, facades, back walls, office height
  const SW0 = -31, SE0 = W;                                        // south office west / east walls
  const NOTCH = [29, 37, W, SZ];                                   // corner cut out of the roof (gondola hangs in it)
  const PITN = [-28, -36, -6, -6], PITS = [-28, 6, -6, 36];        // the two pit basins [x0, z0, x1, z1]

  // ================= Structure under the roof =================
  box(-W, -200, NB, W, -3.5, 37, C.slab);                       // the tower (with the SE corner notch cut out)
  box(-W, -200, 37, NOTCH[0], -3.5, SZ, C.slab);
  box(SW0, -200, SZ, SE0, -3.5, SB, C.slab);
  bands(-W, NB, W, SZ, -3.5);
  const holes = [
    PITN, PITS,
    [-28, -6, -6, 6],           // underground link between the two pits (under the passage)
    [-20, NB, -16, -36],        // north tunnel (pit -> north office)
    [-20, 36, -16, SB],         // south tunnel (pit -> south office)
    [-6, -10.6, 11.6, -7.6],    // tunnel: north pit -> under the roof -> stairwell inside the helipad building
    [-6, 20, -2.4, 24],         // mechanical room stairs (south pit)
    [-W, SZ, SW0, SB],          // south office is narrower than the roof:
    NOTCH,                      // SE corner notch (drop)
  ];
  fillAround(-W, NB, W, SB, holes, -3.5, 0, C.roof);
  // chamfered outer corners of the pits
  for (const [x0, x1, z0, z1] of [[-28, -25.5, -36, -34.5], [-28, -26.5, -34.5, -33], [-8.5, -6, -36, -34.5], [-7.5, -6, -34.5, -33],
                                  [-28, -25.5, 34.5, 36], [-28, -26.5, 33, 34.5], [-8.5, -6, 34.5, 36], [-7.5, -6, 33, 34.5]]) box(x0, -3.5, z0, x1, 0, z1, C.roof);
  box(-28, -0.3, -6, -6, 0, 6, C.roof);                         // passage floor = ceiling of the pit link
  box(-28, -3.5, -6, -6, -3.48, 6, C.red, false);
  for (const x of [-21.5, -12.5]) box(x - 0.4, -3.5, -0.4, x + 0.4, -0.3, 0.4, C.concrete);   // support pillars
  box(-20, -0.3, -55, -16, 0, -36, C.roof);                     // tunnel ceilings (walkable)
  box(-20, -0.3, 36, -16, 0, 55, C.roof);
  stairs(-55, -20, -16, -3.5, 6, { axis: 'z', sign: -1 });      // up into the north office
  box(-20, -3.5, NB, -16, 0, -58.6, C.roof);
  stairs(55, -20, -16, -3.5, 6, { axis: 'z', sign: 1 });        // up into the south office
  box(-20, -3.5, 58.6, -16, 0, SB, C.roof);
  box(-6, -0.3, -10.6, 8, 0, -7.6, C.roof);                     // tunnel ceiling (walkable roof above)
  stairs(8, -10.6, -7.6, -3.5, 6, { axis: 'x', sign: 1 });      // tunnel -> up into the helipad building
  stairs(-6, 20, 24, -3.5, 6, { axis: 'x', sign: 1 });          // south pit -> mechanical room

  // ================= The two pits (orange rims, red floors) =================
  for (const [x0, z0, x1, z1] of [PITN, PITS]) {
    box(x0, -3.5, z0, x1, -3.48, z1, C.red, false);               // red floor
    box(x0, -3.5, z0, x0 + 0.05, -0.2, z1, C.orange, false);      // orange walls (west)
  }
  // orange walls (east), leaving the openings clear: helipad-building tunnel, mechanical room stairs
  for (const [z0, z1] of [[-36, -10.6], [-7.6, -6], [6, 20], [24, 36]]) box(-6.05, -3.5, z0, -6, -0.2, z1, C.orange, false);
  // rims: orange half-walls with gaps, chain-link on part of the inner edge
  for (const [x0, x1] of [[-28, -22], [-15, -6]]) { box(x0, 0, -36.4, x1, 1, -36, C.orange); box(x0, 0, 36, x1, 1, 36.4, C.orange); }
  for (const [z0, z1] of [[-33, -24], [-16, -9]]) box(-28.4, 0, z0, -28, 1, z1, C.orange);
  for (const [z0, z1] of [[9, 16], [24, 33]]) box(-28.4, 0, z0, -28, 1, z1, C.orange);
  box(-28, 0, -6, -6, 1.6, -5.6, C.orange);                    // passage walls: solid all the way along both pits
  box(-28, 0, 5.6, -6, 1.6, 6, C.orange);
  box(-6, 0, -33, -5.9, 2.2, -24, C.fence); box(-6, 0, 26, -5.9, 2.2, 33, C.fence);
  // inside the pits: big AC units / machinery, crates
  box(-22, -3.5, -26, -14, -1.4, -18, C.metal); box(-12, -3.5, -14, -9, -2, -10, C.steel);
  box(-22, -3.5, 14, -15, -1.8, 20, C.metal); box(-11, -3.5, 27, -8, -2.3, 30, C.steel);
  crate(-25, -10, 1.2, -3.5); crate(-25, 12, 1.2, -3.5);
  ladder(-6.6, -3.5, -14, -6, 0.8, -12.4, 'e');                 // north pit -> rooftop (east wall)
  ladder(-6.6, -3.5, 12.4, -6, 0.8, 14, 'e');                   // south pit -> rooftop (east wall, A site)
  // Mechanical room (south pit, east side)
  box(-6, 0, 18, 2, 3.5, 18.4, C.concrete); box(-6, 0, 25.6, 2, 3.5, 26, C.concrete);
  wallZ(18.4, 25.6, 1.6, 2, 3.5, [[21, 23]], C.concrete);
  box(-6, 3.5, 18, 2, 3.9, 26, C.concrete);

  // ================= Passage between the pits: electrical yard =================
  // Low walled enclosure with transformers + insulators and electrical cabinets.
  for (const [x0, z0, x1, z1] of [[-21, -5.6, -20.6, -1.5], [-21, 1.5, -20.6, 5.6],
                                  [-9.4, -5.6, -9, -1.5], [-9.4, 1.5, -9, 5.6]]) box(x0, 0, z0, x1, 1.6, z1, C.concrete);  // yard ends (openings in the middle)
  for (const [x, z] of [[-17.5, -2], [-13, -2], [-15.2, 2]]) {
    box(x - 1.2, 0, z - 1, x + 1.2, 1.8, z + 1, 0x6f7a62);                       // transformer
    for (const dx of [-0.6, 0, 0.6]) {                                            // insulators
      box(x + dx - 0.12, 1.8, z - 0.12, x + dx + 0.12, 2.6, z + 0.12, 0xc9c2b0, false);
      box(x + dx - 0.2, 2.2, z - 0.2, x + dx + 0.2, 2.3, z + 0.2, 0xc9c2b0, false);
    }
  }
  box(-20.4, 0, -4.2, -19.4, 2, -3, 0x9aa0a4); box(-10.4, 0, 3, -9.6, 2, 4.2, 0x9aa0a4);   // cabinets
  box(-15.5, 2.6, -2.05, -15, 2.65, 2.05, 0x222222, false); box(-12.5, 2.6, -2.05, -12, 2.65, -1.95, 0x222222, false);

  // ================= Elevator core (back, at the west edge in front of the crane) =================
  box(-34, 0, -4, -29, 6, 4, C.concrete);
  for (const z of [-3.2, -0.6]) box(-29.02, 0, z, -29, 2.6, z + 1.8, 0xa8adb2, false);    // elevator doors
  ladder(-32.6, 0, 4, -31, 6.8, 4.6, 'n');                      // ladder on its south side
  hCylinder(-31.5, 7.3, 0, 1.3, 6, false, 0x9aa0a4);            // tank on top
  box(-33, 6, -2.6, -30, 6, 2.6, C.white, false);

  // ================= Roof edges =================
  box(W - 0.4, 0, NZ, W, 0.9, NOTCH[1], C.trim);                // east parapet (stops at the corner notch)
  box(-W, 0, NZ, -W + 0.4, 0.9, SZ, C.trim);                    // west parapet
  for (const z of [-20, 15, 30]) davit(-W + 0.6, z, -1);
  for (const z of [-30, -15, 26]) davit(W - 0.6, z, 1);

  // ================= Cranes =================
  // Two big cranes cross in an X high above the west edge (scenery: you can't stand on them).
  // Crane 2: arm runs east-west at y 27.5, straight over the deck plank and the helicopter.
  lattice(-50, 0, -200, 27);
  d('boom', -72, 0, 27.5, 22, 0, 27.5, C.crane);
  box(-74, 25, -1.4, -66, 27.5, 1.4, 0x555555, false);          // counterweight
  box(-51.4, 23, 1.2, -48.6, 26, 3.8, 0xe6e2d6, false);          // cab
  box(-50.25, 27.5, -0.25, -49.75, 36, 0.25, C.crane, false);    // apex
  // Crane 1: arm runs diagonally at y 24, crossing crane 2, straight over the plank past the parapet.
  const C1 = (x) => -8 + (x + 39.6) * 1.078;                     // z of crane 1's arm at a given x
  lattice(-56, C1(-56), -200, 24);
  d('boom', -64, C1(-64), 24, -10, C1(-10), 24, C.crane);
  box(-67, 21.5, C1(-64) - 1.4, -61, 24, C1(-64) + 1.4, 0x555555, false);
  box(-57.4, 20, C1(-56) + 1.2, -54.6, 23, C1(-56) + 3.8, 0xe6e2d6, false);
  box(-56.25, 24, C1(-56) - 0.25, -55.75, 33, C1(-56) + 0.25, C.crane, false);
  // The plank of lumber past the west parapet, hung from crane 1 on a sling.
  plank(-35.6, -8, 1.2, -43.6, -8, 3.0, 0.9);
  sling([-36, 1.25, -8], [-43.2, 3.05, -8], [-39.6, 7, -8], 24);

  // The walkable crane walkway: from the plank's far end it ramps north up to the north office's
  // front ledge (the lip of the building).
  craneArm(-44, -8, 3.0, -44, -40.6, 7.0, 0.5, -1);

  // ================= Helipad building (east half) =================
  // One storey you can walk through (doors on all sides, stairwell down to the tunnel into the
  // north pit), deck on top with the helicopter, stairs up the north/south sides and from the passage.
  const HX0 = 6, HX1 = 31, HZ0 = -11, HZ1 = 9, HH = 3;
  wallX(HX0, HX1, HZ0, HZ0 + 0.4, HH, [[20, 23]], C.concrete, [1, 2.3]);          // north wall
  wallX(HX0, HX1, HZ1 - 0.4, HZ1, HH, [[20, 23]], C.concrete, [1, 2.3]);          // south wall
  wallZ(HZ0 + 0.4, HZ1 - 0.4, HX0, HX0 + 0.4, HH, [[-1.5, 1.5]], C.concrete);     // west wall (door to the passage)
  wallZ(HZ0 + 0.4, HZ1 - 0.4, HX1 - 0.4, HX1, HH, [[-1.5, 1.5]], C.concrete);     // east wall
  box(4, HH, -12, 33, HH + 0.5, 10, C.steel);                                      // deck (overhangs the walls)
  railing(6.6, -12, 33, -11.9, 3.5);                            // (gap at the stairs)
  railing(6.6, 9.9, 33, 10, 3.5); railing(32.9, -12, 33, 10, 3.5);  // (gap at the stairs)
  railing(8, -7.6, 11.6, -7.5, 0);                                                 // around the stairwell
  for (const [x, z] of [[24, -6], [25.3, -6], [27, 5], [12, 5.5]]) crate(x, z);
  box(16, 0, -3, 19, 0.8, -2.2, 0x7a6248);
  for (const [x, z] of [[4.2, -11.8], [32.6, -11.8], [4.2, 9.6], [32.6, 9.6]]) box(x, 3.5, z, x + 0.2, 3.7, z + 0.2, 0x3a6ad8, false);
  // Two switchback metal staircases at the west end (the pits side): up one way (east, away from the
  // cranes) to a landing, turn back, up to a top platform at the deck edge.
  for (const [side, dir] of [[-1, 1], [1, 1]]) {
    const edge = side < 0 ? -12 : 10;                                   // deck edge on this side
    const lane = (a, b) => (side < 0 ? [edge - b, edge - a] : [edge + a, edge + b]);
    const [o0, o1] = lane(2, 3.8), [i0, i1] = lane(0, 2), [l0, l1] = lane(0, 3.8);
    const x0 = dir > 0 ? 4.6 : 9.4;                                    // where flight 1 starts
    const span = (from, n) => [Math.min(from, from + dir * 0.6 * n), Math.max(from, from + dir * 0.6 * n)];
    for (let k = 1; k <= 4; k++) {                                      // flight 1 (outer lane)
      const [a0] = span(x0 + dir * 0.6 * (k - 1), 1), [, a1] = span(x0 + dir * 0.6 * (k - 1), 1);
      box(a0, 0, o0, a1, 0.5 * k, o1, C.steel);
    }
    const xl = x0 + dir * 2.4;                                          // landing
    box(Math.min(xl, xl + dir * 2), 0, l0, Math.max(xl, xl + dir * 2), 2, l1, C.steel);
    for (let k = 1; k <= 2; k++) {                                      // flight 2 (inner lane, back the other way)
      const f = xl - dir * 0.6 * (k - 1), t = xl - dir * 0.6 * k;
      box(Math.min(f, t), 0, i0, Math.max(f, t), 2 + 0.5 * k, i1, C.steel);
    }
    const xt = xl - dir * 1.2;                                          // top platform -> step onto the deck
    box(Math.min(xt, xt - dir * 1.4), 0, i0, Math.max(xt, xt - dir * 1.4), 3, i1, C.steel);
    railing(Math.min(x0, xl + dir * 2), side < 0 ? o0 : o1 - 0.1, Math.max(x0, xl + dir * 2), side < 0 ? o0 + 0.1 : o1, 0.5);
  }
  box(10.5, 0, -16, 16, 2.2, -15.9, C.fence);                   // chain-link at the base
  box(26, 3.5, -11.6, 29.4, 5.6, -9.2, C.green);                // green container on the deck's NE corner (clear of the dummy and stairs)
  d('disc', 14, 3.53, -1, 5.8, 0x2f4f6a);
  d('ring', 14, 3.58, -1, 5.2, 0xe8e8e8);
  box(12.6, 3.55, -2.8, 13.2, 3.6, 0.8, 0xf0f0f0, false); box(14.8, 3.55, -2.8, 15.4, 3.6, 0.8, 0xf0f0f0, false);
  box(13.2, 3.55, -1.3, 14.8, 3.6, -0.7, 0xf0f0f0, false);
  // Helicopter on the pad, nose west. Climbable: skid -> wing -> side tank -> roof.
  box(8, 4.1, -1.5, 18, 7.1, 1.5, C.heli);
  glass(6, 4.4, -1.3, 8, 6, 1.3);
  box(18, 5.2, -0.3, 24, 6, 0.3, C.heli);
  box(23.4, 6, -0.15, 24, 8, 0.15, C.heli);
  box(8, 3.5, -1.9, 17, 4.1, -1.7, C.dark); box(8, 3.5, 1.7, 17, 4.1, 1.9, C.dark);
  box(10, 4.8, -3.3, 14, 5.1, 3.3, C.heli);
  box(10, 5.1, -2.7, 15, 6.1, -1.5, 0x5a6352); box(10, 5.1, 1.5, 15, 6.1, 2.7, 0x5a6352);
  box(12.8, 7.1, -0.2, 13.2, 7.7, 0.2, C.dark, false);
  box(4, 7.7, -0.1, 22, 7.8, 0.1, 0x1a1a1a, false); box(12.9, 7.7, -9, 13.1, 7.8, 9, 0x1a1a1a, false);
  // A plank of lumber sticking out in front of the helicopter (off the deck's west edge), hung from
  // the second X crane, which also holds the helicopter itself on cables.
  plank(4.5, 0, 3.5, -5, 0, 3.9, 0.9);
  sling([4, 3.55, 0], [-4.6, 3.95, 0], [-0.3, 8, 0], 27.5);
  sling([9, 7.1, 0], [17, 7.1, 0], [13, 11, 0], 27.5);          // the helicopter's lifting sling

  // ================= East half: north and south of the helipad =================
  tank(8, -22, 7, true);                                        // tank north of the helipad
  box(26, 0, -26, 31, 1.5, -22, C.metal);                       // AC vents
  box(14, 0, -31, 17, 1, -30.7, C.orange);                      // orange barrier
  glass(4, 0, -32, 12, 1, -27);                                 // skylight
  box(18, 0, -36, 30, 1.3, -35.6, C.olive);                     // low wall
  crate(2, -18); crate(3.2, -18);
  // south side: propane shack + tanks, green shack + tarps, substation, crates
  box(10, 0, 15, 16, 2.2, 20, 0x8a7f6a); box(12, 0, 14.98, 14, 1.9, 15, C.dark, false); crate(9.2, 17.5, 1.1);
  for (const [x, z] of [[17, 15], [17.9, 16], [17.2, 17.2]]) vCylinder(x, 0, z, 0.4, 1.4, C.propane);
  box(22, 0, 15, 28, 2.2, 20, C.green); box(24, 0, 14.98, 26, 1.9, 15, C.dark, false);
  box(28.5, 0, 16, 31, 1.1, 19, C.tarp);
  box(6, 0, 28, 12, 2.4, 34, 0x5f6b52);                         // substation
  box(5, 0, 27, 13, 2.2, 27.1, C.fence);
  box(22, 0, 26, 26, 2.2, 30, C.metal);
  crate(28, 33); crate(29.3, 33); crate(28.6, 33, 1.2, 1.2);
  vCylinder(2, 0, 36, 0.7, 1.2, 0x7a5a3a);
  // Scaffolding off the east edge + NE catch platform
  box(W, -0.3, 10, W + 3, 0, 29.8, C.wood);                     // upper planks...
  box(W, -0.3, 29.8, W + 0.5, 0, 32, C.wood);                   // ...with a hole where the ladder comes up
  box(W, -3.8, 10, W + 3, -3.5, 32, C.wood);                    // lower planks
  for (let z = 10; z <= 32; z += 3) box(W + 2.85, -3.8, z, W + 3, 1.2, z + 0.15, C.steel, false);   // outer poles only
  box(W + 2.85, 1.1, 10, W + 3, 1.2, 32, C.steel, false);
  ladder(W + 0.8, -3.5, 30.3, W + 2.6, 0.8, 31.1, 's');         // between the plank levels, through the hole
  box(W, -3, -40, W + 3, -2.6, -34, C.steel);
  ladder(W, -2.6, -37.8, W + 0.6, 0.8, -36.2, 'w');

  // ================= North office (tall brick) =================
  const BRICK = 0x7a4434;
  bands(-W, NB, W, NZ, 0);
  wallX(-W, W, NB, NB + 0.4, IH);
  box(-W, 0, NB, -W + 0.4, IH, NZ, C.white); box(W - 0.4, 0, NB, W, IH, NZ, C.white);
  wallX(-W, W, NZ - 0.4, NZ, IH, [[-31, -28], [-6, -2], [8, 12], [24, 28]], C.white, [0.9, 4.5]);
  box(-W, IH, NB, W, 10, NZ, BRICK);                            // upper floors -> roof at 10
  for (let x = -33; x < W - 2; x += 4) box(x, 7.4, NZ, x + 2.4, 9.4, NZ + 0.05, 0x2a2e33, false);
  box(-W, 6.6, NZ, W, 7, NZ + 1.2, C.concrete);                 // upper front ledge (outside)
  box(-48, -200, NB, -W, 10, NZ, BRICK);                        // west wing, sticks out past the roof over the cranes
  bands(-48, NB, -W, NZ, 0);
  for (let x = -47; x < -W - 1; x += 4) box(x, 7.4, NZ, x + 2.4, 9.4, NZ + 0.05, 0x2a2e33, false);
  box(-48, 6.6, NZ, -W, 7, NZ + 1.2, C.concrete);              // ledge continues along the wing (crane arm A lands here)
  box(31, 7, NZ, W, 8, NZ + 1.2, C.metal); box(33, 8, NZ, W, 9, NZ + 1.2, C.metal);   // ledge -> roof
  for (const x of [-30, -18, -6, 6, 18, 30]) { box(x - 0.1, 10, NZ + 0.5, x + 0.1, 11.6, NZ + 0.7, 0x333333, false); box(x - 0.08, 11.5, NZ - 0.6, x + 0.08, 11.65, NZ + 0.7, 0x9a9a9a, false); }
  // Reception + elevators (spawn)
  wallZ(NB, -50, -22.4, -22, IH, [[-54, -52]]);
  wallX(-W, -22, -50.4, -50, IH, [[-29, -26]]);
  for (const x of [-33, -29.5, -26]) box(x, 0, NB + 0.4, x + 2.2, 2.7, NB + 0.45, 0xa8adb2, false);
  box(-31, 0, -55, -27, 1.1, -54, 0x7a6248);
  // Stairwell down to the north tunnel (x -20..-16) + restrooms
  railing(-20, -55, -16, -54.9, 0);
  wallZ(NB, -52, -14.4, -14, IH, [[-53.5, -52]]);
  wallZ(NB, -52, -8.4, -8, IH);
  box(-13, 0, -59.5, -10, 0.9, -58, 0xe0e0e0);
  // Storage
  wallX(-8, 2, -52.4, -52, IH, [[-5, -2]]);
  wallZ(NB, -52, 1.6, 2, IH);
  for (const x of [-7, -4, -1]) box(x, 0, -59.2, x + 1.2, 2.2, -55, C.metal);
  // Main room: columns, supplies, desks, rear platforms + ladder
  for (const x of [12, 19, 26]) for (const z of [-55, -47.5]) box(x - 0.4, 0, z - 0.4, x + 0.4, IH, z + 0.4, C.concrete);
  box(14, 0, -45, 17, 1.2, -43.5, C.wood); box(21, 0, -45.5, 23, 1.6, -43.5, C.wood);
  for (const [x, z] of [[15.5, -51], [22.5, -51], [30, -46]]) desk(x, z);
  box(10, 2.6, NB + 0.4, W - 0.4, 3, -57, C.steel);
  railing(10, -57.1, W - 0.4, -57, 3);
  ladder(9.4, 0, -58.8, 10, 3.8, -57.6, 'e');

  // ================= South office (grey, skylight on the roof) =================
  bands(SW0, SZ, SE0, SB, 0);
  wallX(SW0, SE0, SB - 0.4, SB, IH);
  box(SW0, 0, SZ, SW0 + 0.4, IH, SB, C.white); box(SE0 - 0.4, 0, SZ, SE0, IH, SB, C.white);
  wallX(SW0, SE0, SZ, SZ + 0.4, IH, [[-27, -24], [-8, -4], [12, 16], [22, 25]], C.white, [0.9, 4.5]);
  box(SW0, IH, SZ, SE0, 11, SB, 0xb8b6ae);                        // upper floors -> roof at 11 (highest)
  box(SW0 - 0.05, 6.2, SZ - 0.05, SE0 + 0.05, 7.2, SZ, C.glass, false);
  box(SW0 - 0.05, 9, SZ - 0.05, SE0 + 0.05, 10.2, SZ, C.glass, false);
  glass(-10, 11, 47, 2, 12.4, 55);                              // rooftop skylight box
  for (const [x, z] of [[14, 50], [22, 55], [-22, 54]]) box(x, 11, z, x + 2.4, 12, z + 2, C.metal);
  hCylinder(6, 11.8, 57, 0.8, 3, true, C.red);                  // propane tank on the roof
  // Teddy bears sitting on the roof
  for (const [x, z, r, sc] of [[-3, 50, 0.4, 1], [-1.6, 50.6, -0.5, 0.8], [18, 58, 2.6, 1.1], [-26, 46, 1.2, 0.9]]) {
    d('bear', x, 11, z, r, sc);
    colliders.push([x - 0.35 * sc, 11, z - 0.35 * sc, x + 0.35 * sc, 11 + 0.9 * sc, z + 0.35 * sc]);
  }
  // Roof route: sprint-jump across the corner notch onto the gondola hanging down the facade.
  // Miss it and you fall down the notch. Climb it, step sideways onto the front ledge, walk it
  // west, hanging platform, roof.
  gondolaNorth(31, 32.6, -3, 8.0, SZ, 11);                      // hangs down into the corner notch, facing the helipad
  box(SW0, 7.6, SZ - 1.2, 30.9, 8, SZ, C.concrete);             // front ledge (gap above the gondola)
  box(32.7, 7.6, SZ - 1.2, SE0, 8, SZ, C.concrete);
  box(SW0, 8.6, SZ - 3.4, -26, 9, SZ - 1.2, C.steel);           // hanging platform (west end)
  box(-30.5, 9, SZ - 3, -28.5, 10, SZ - 1.6, C.metal);
  // The Sign (in front of the south office, west part; walkable top)
  box(-28, 5.4, 38.8, -14, 7, 39.6, C.sign);
  box(-27.5, 5.4, 39.6, -27.2, 6.6, SZ - 1.2, C.dark, false); box(-14.8, 5.4, 39.6, -14.5, 6.6, SZ - 1.2, C.dark, false);
  // Interior
  box(-10, 0, 47, -4, 1.1, 48, 0x7a6248);
  for (const z of [46, 50]) for (const x of [8, 14, 20]) {
    box(x, 0, z, x + 5, 1.4, z + 0.1, C.cubicle); box(x, 0, z, x + 0.1, 1.4, z + 3, C.cubicle);
    desk(x + 2, z + 1.5);
  }
  wallZ(SZ + 0.4, SB - 0.4, 26, 26.4, IH, [[45, 47], [53, 55]]);
  wallX(26.4, SE0 - 0.4, 51.8, 52.2, IH);
  wallX(SW0 + 0.4, -22, 52, 52.4, IH, [[-26, -24]]);
  wallZ(52.4, SB - 0.4, -14.4, -14, IH, [[53, 55]]);            // corridor to the stairwell
  railing(-20, 54.9, -16, 55, 0);

  // ================= Background =================
  box(-50, -200, -190, 50, 34, -110, 0xd6d6d0, false);
  box(60, -200, -60, 90, 40, -20, 0x8a8478, false);

  return { colliders, ladders };
}

// ---------------- Throwing knife physics (the server runs an exact Python copy) ----------------
export const KNIFE = { STEP: 1 / 120, MAX_TIME: 4, MAX_BOUNCES: Infinity, MIN_SPEED: 1.5 };   // no bounce cap

function rayBox(o, d, bot, tmaxIn) {
  const c = Math.cos(bot.rot), s = Math.sin(bot.rot);
  const rx = o[0] - bot.x, ry = o[1] - (bot.y + 0.725), rz = o[2] - bot.z;
  const lo = [rx * c - rz * s, ry, rx * s + rz * c];
  const ld = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
  const half = [0.45, 0.725, 0.25];
  let tmin = 0, tmax = tmaxIn;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-12) {
      if (Math.abs(lo[i]) > half[i]) return null;
      continue;
    }
    const t1 = (-half[i] - lo[i]) / ld[i], t2 = (half[i] - lo[i]) / ld[i];
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return null;
  }
  return tmin;
}
function raySphere(o, d, bot, tmax) {
  const ox = o[0] - bot.x, oy = o[1] - (bot.y + 1.72), oz = o[2] - bot.z;
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const c = ox * ox + oy * oy + oz * oz - 0.25 * 0.25;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= tmax ? t : null;
}
export function rayBot(o, d, bot, tmax = 800) {
  const tb = rayBox(o, d, bot, tmax), th = raySphere(o, d, bot, tmax);
  if (th !== null && (tb === null || th <= tb)) return { part: 'head', t: th };
  return tb !== null ? { part: 'body', t: tb } : null;
}

// Knife is a point that falls, bounces off any solid box, and kills the dummy on contact.
// wallHits counts bounces off walls (not floors/ceilings).
export function simulateKnife(o, dir, speed, gravity, bounce, colliders, bot) {
  const h = KNIFE.STEP;
  let p = [o[0], o[1], o[2]];
  const v = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
  const path = [[p[0], p[1], p[2]]];
  let bounces = 0, wallHits = 0;
  const steps = Math.floor(KNIFE.MAX_TIME / h);
  for (let i = 0; i < steps; i++) {
    v[1] -= gravity * h;
    const q = [p[0] + v[0] * h, p[1] + v[1] * h, p[2] + v[2] * h];
    const sx = q[0] - p[0], sy = q[1] - p[1], sz = q[2] - p[2];
    const L = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (bot && L > 0) {
      const hit = rayBot(p, [sx / L, sy / L, sz / L], bot, L);
      if (hit) {
        path.push([p[0] + sx / L * hit.t, p[1] + sy / L * hit.t, p[2] + sz / L * hit.t]);
        return { path, hit: hit.part, wallHits, bounces };
      }
    }
    let box = null;
    for (const b of colliders) {
      if (q[0] > b[0] && q[0] < b[3] && q[1] > b[1] && q[1] < b[4] && q[2] > b[2] && q[2] < b[5]) { box = b; break; }
    }
    if (box) {
      let any = false, wall = false;
      for (let a = 0; a < 3; a++) {
        if (p[a] <= box[a] || p[a] >= box[a + 3]) {
          v[a] = -v[a] * bounce;
          any = true;
          if (a !== 1) wall = true;
        }
      }
      if (!any) break;                                   // stuck inside something
      bounces++;
      if (wall) wallHits++;
      if (bounces > KNIFE.MAX_BOUNCES) break;
    } else {
      p = q;
    }
    path.push([p[0], p[1], p[2]]);
    if (p[1] < -60 || Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) < KNIFE.MIN_SPEED) break;
  }
  return { path, hit: null, wallHits, bounces };
}
