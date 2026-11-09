import * as THREE from './three.module.js';
import { buildMap, simulateKnife, rayBot, KNIFE } from './map.js';
import { Muxer, ArrayBufferTarget } from './webm-muxer.mjs';

const $ = (id) => document.getElementById(id);

// ================= GAME CONFIG =================
const CONFIG = {
  GRAVITY: 20,
  JUMP_VELOCITY: 7,
  MOVE_SPEED: 6,
  SPRINT_SPEED: 9,
  MOUSE_SENSITIVITY: 0.0022,
  MAX_TURN_RATE: 10000000,   // degrees per second (effectively no limit; the server accepts up to 1e7)
  SWAP_COOLDOWN: 0.6,        // seconds between weapon swaps
  SWAP_TIME: 0.12,           // can't fire while swapping
  ADS_TIME: 0.3,             // time to fully scope in
  QUICKSCOPE_WINDOW: 0.6,    // fire within this long after pressing RMB = quickscope
  NOSCOPE_SPREAD: 1.5,       // degrees
  SNIPER_FIRE_DELAY: 1.1,
  PISTOL_FIRE_DELAY: 0.25,
  KNIFE_SPEED: 26,           // throwing knife
  KNIFE_GRAVITY: 14,
  KNIFE_BOUNCE: 0.6,         // how much speed it keeps per bounce
  KILL_PLANE: -60,
  REQUIRED_SCORE: 10000000000,
};

const BASE_CONFIG = { ...CONFIG };   // perks scale these

// ================= RENDERER / SCENE =================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY = 0xa9bccd;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 80, 420);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 1500);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xe6eef8, 0x3a3a40, 2.2));
scene.add(new THREE.AmbientLight(0xffffff, 0.9));   // keeps interiors/ceilings readable
const sun = new THREE.DirectionalLight(0xffeccc, 2.4);
sun.position.set(60, 120, 40);
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ================= MAP: HIGHRISE (simplified) =================
const colliders = [];
const shootables = [];
const matCache = {};
function mat(color) {
  return matCache[color] || (matCache[color] = new THREE.MeshLambertMaterial({ color }));
}
// Map blocks are batched: every static box of the same colour becomes one merged mesh (far fewer
// draw calls). Boxes added after flushBoxes() are plain meshes.
const boxBuckets = new Map();
let boxesMerged = false;
function box(x0, y0, z0, x1, y1, z1, color, solid = false) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (boxesMerged) {
    const m = new THREE.Mesh(g, mat(color));
    scene.add(m);
    if (solid) shootables.push(m);   // bullets stop on it (collision itself comes from map.js)
    return m;
  }
  const key = `${color}|${solid ? 1 : 0}`;
  if (!boxBuckets.has(key)) boxBuckets.set(key, { color, solid, geos: [] });
  boxBuckets.get(key).geos.push(g);
}
function flushBoxes() {
  for (const { color, solid, geos } of boxBuckets.values()) {
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      uv.set(g.attributes.uv.array, vo * 2);
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo;
      vo += g.attributes.position.count;
      io += ia.length;
      g.dispose();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mg.setIndex(new THREE.BufferAttribute(idx, 1));
    mg.computeBoundingSphere();
    mg.computeBoundingBox();
    const m = new THREE.Mesh(mg, mat(color));
    scene.add(m);
    if (solid) shootables.push(m);
  }
  boxBuckets.clear();
  boxesMerged = true;
}

const CONCRETE = 0x9a9890, ROOF = 0x7f7d78, TRIM = 0x5b5a56, METAL = 0x8c949c, GLASS = 0x5f7d96;

// ================= MAP (static/map.js) =================
function addMesh(geo, color, x, y, z, solid) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  scene.add(m);
  if (solid) shootables.push(m);
  return m;
}
const MAP = buildMap({
  box,
  hcyl: (x, y, z, r, len, alongX, color) => {
    const m = addMesh(new THREE.CylinderGeometry(r, r, len, 20), color, x, y, z, true);
    if (alongX) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  },
  vcyl: (x, y0, z, r, h, color) => addMesh(new THREE.CylinderGeometry(r, r, h, 12), color, x, y0 + h / 2, z, true),
  disc: (x, y, z, r, color) => addMesh(new THREE.CylinderGeometry(r, r, 0.06, 40), color, x, y, z, false),
  ring: (x, y, z, r, color) => { addMesh(new THREE.TorusGeometry(r, 0.18, 6, 48), color, x, y, z, false).rotation.x = Math.PI / 2; },
  // Plush teddy bear sitting down (made of spheres)
  bear: (x, y, z, rot, sc) => {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rot; g.scale.setScalar(sc);
    const fur = mat(0x8a5a32), light = mat(0xc9a27a), eye = mat(0x111111);
    const ball = (r, m, px, py, pz, sx = 1, sy = 1, sz = 1) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
      b.position.set(px, py, pz); b.scale.set(sx, sy, sz); g.add(b);
    };
    ball(0.26, fur, 0, 0.27, 0, 1, 1.1, 0.9);              // body
    ball(0.15, light, 0, 0.27, 0.19, 1, 1.2, 0.5);         // tummy
    ball(0.19, fur, 0, 0.66, 0.02);                        // head
    ball(0.07, fur, -0.15, 0.81, 0); ball(0.07, fur, 0.15, 0.81, 0);       // ears
    ball(0.08, light, 0, 0.62, 0.17, 1, 0.8, 0.8);         // muzzle
    ball(0.025, eye, 0, 0.66, 0.24);                       // nose
    ball(0.022, eye, -0.07, 0.72, 0.17); ball(0.022, eye, 0.07, 0.72, 0.17);  // eyes
    ball(0.08, fur, -0.27, 0.35, 0.05, 1, 1.4, 1); ball(0.08, fur, 0.27, 0.35, 0.05, 1, 1.4, 1);   // arms
    ball(0.1, fur, -0.13, 0.08, 0.2, 1, 0.8, 1.5); ball(0.1, fur, 0.13, 0.08, 0.2, 1, 0.8, 1.5);  // legs
    scene.add(g);
  },
  // Thin cable between two points
  cable: (x0, y0, z0, x1, y1, z1) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), mat(0x222222));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    scene.add(m);
  },
  // Sloped plank of lumber
  plank: (x0, z0, y0, x1, z1, y1, width, color) => {
    const dx = x1 - x0, dz = z1 - z0, flat = Math.hypot(dx, dz), len = Math.hypot(flat, y1 - y0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, len), mat(color));
    m.position.set(x0 + dx / 2, (y0 + y1) / 2 - 0.06, z0 + dz / 2);
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(dx, dz);
    m.rotation.x = -Math.atan2(y1 - y0, flat);
    scene.add(m);
    shootables.push(m);
  },
  // Crane arm: flat walkway with railings and a triangular truss overhead (walk inside it).
  boom: (x0, z0, y0, x1, z1, y1, color) => {
    const dx = x1 - x0, dz = z1 - z0, flat = Math.hypot(dx, dz), len = Math.hypot(flat, y1 - y0);
    const g = new THREE.Group();
    g.position.set(x0 + dx / 2, (y0 + y1) / 2, z0 + dz / 2);
    g.rotation.order = 'YXZ';
    g.rotation.y = Math.atan2(dx, dz);           // local z runs along the arm
    g.rotation.x = -Math.atan2(y1 - y0, flat);   // tilted: it's a ramp
    scene.add(g);
    const part = (w, h, l, x, y, z, rotZ = 0, solid = false, c = color) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat(c));
      m.position.set(x, y, z);
      m.rotation.z = rotZ;
      g.add(m);
      if (solid) shootables.push(m);
    };
    part(1.6, 0.25, len, 0, -0.125, 0, 0, true, 0xb59a3c);         // walkway deck
    for (const sx of [-0.75, 0.75]) {
      part(0.08, 0.08, len, sx, 1.0, 0);                           // handrails
      part(0.06, 0.06, len, sx, 0.5, 0);
      part(0.14, 0.14, len, sx * 1.05, -0.5, 0);                   // bottom chords
    }
    part(0.16, 0.16, len, 0, 2.3, 0);                              // top chord (apex)
    const lean = Math.atan2(0.8, 2.3), side = Math.hypot(0.8, 2.3);
    for (let t = -len / 2; t <= len / 2; t += 2) {
      part(0.06, 1.0, 0.06, -0.75, 0.5, t); part(0.06, 1.0, 0.06, 0.75, 0.5, t);      // rail posts
      part(0.09, side, 0.09, -0.4, 1.15, t, -lean); part(0.09, side, 0.09, 0.4, 1.15, t, lean);  // A-frame
      part(1.6, 0.08, 0.08, 0, -0.5, t);                                                // cross ties
    }
  },
});
for (const c of MAP.colliders) colliders.push({ min: { x: c[0], y: c[1], z: c[2] }, max: { x: c[3], y: c[4], z: c[5] } });
const ladders = MAP.ladders.map((c) => ({ min: { x: c[0], y: c[1], z: c[2] }, max: { x: c[3], y: c[4], z: c[5] } }));

// ---- Skyline + street (visual only) ----
const rand = mulberry32(2009);
for (let i = 0; i < 80; i++) {
  const a = rand() * Math.PI * 2, r = 170 + rand() * 260;
  const w = 18 + rand() * 30, d = 18 + rand() * 30, top = -30 + rand() * 140;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  box(x - w / 2, -200, z - d / 2, x + w / 2, top, z + d / 2, [CONCRETE, GLASS, 0x6d7279, 0xa39b8d][i % 4]);
}
for (let i = 0; i < 120; i++) {
  const x = (rand() - 0.5) * 520, z = (rand() - 0.5) * 520, s = 10 + rand() * 16;
  if (x > -110 && x < 70 && z > -200 && z < 90) continue;
  box(x - s / 2, -200, z - s / 2, x + s / 2, -170 + rand() * 90, z + s / 2, [0x6d7279, 0x8a857b, 0x5f6670][i % 3]);
}
box(-800, -205, -800, 800, -200, 800, 0x3b3f36);
flushBoxes();
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ================= TARGET DUMMY =================
const bot = { group: new THREE.Group(), alive: true };
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.45, 0.5), mat(0xe8641e));   // bright orange target dummy
  body.position.y = 0.725;
  body.userData.part = 'body';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10), mat(0xd9b38c));
  head.position.y = 1.72;
  head.userData.part = 'head';
  // Bobbing red marker over its head so you can find it from anywhere (not shootable)
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true, opacity: 0.9 }));
  marker.renderOrder = 999;   // drawn on top so you can always find the dummy
  marker.rotation.x = Math.PI;
  marker.position.y = 3;
  bot.marker = marker;
  bot.group.add(body, head, marker);
  shootables.push(body, head);
  scene.add(bot.group);
}
bot.alive = false;
bot.dieAt = null;
bot.group.visible = false;

// ================= PLAYER =================
const R = 0.35, HEIGHT = 1.8, EYE = 1.65, STEP = 0.55;
const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: false, onLadder: false };
let yaw = 0, pitch = 0, pendingYaw = 0, pendingPitch = 0;

let gameReady = false;
const attempts = { shots: 0, throws: 0, deaths: 0 };   // this round
// Tactical insertion: a checkpoint you drop (T). Falling off / respawning puts you back on it.
let tacIns = null;
// The flare: a red stick standing in a little base, burning at the tip (light, sparks, smoke).
const tacMesh = new THREE.Group();
const flareTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
const flareGlow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
  new THREE.MeshBasicMaterial({ color: 0xff3a20, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
const flareLight = new THREE.PointLight(0xff3a20, 0, 9, 1.6);
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.08, 10), mat(0x2a2a2a));
  base.position.y = 0.04;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), mat(0xc42a1e));
  stick.position.y = 0.24;
  stick.rotation.z = 0.12;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.05, 8), mat(0x222222));
  cap.position.set(-0.002, 0.08, 0);
  flareTip.position.set(-0.02, 0.41, 0);
  flareGlow.position.copy(flareTip.position);
  flareLight.position.set(0, 0.6, 0);
  tacMesh.add(base, stick, cap, flareTip, flareGlow, flareLight);
  tacMesh.visible = false;
  scene.add(tacMesh);
}
// Sparks (additive points) + smoke puffs
const SPARKS = 70;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3).fill(-9999), 3));
const sparkPts = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffb35a, size: 0.06, transparent: true,
  depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(sparkPts);
const sparks = Array.from({ length: SPARKS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() }));
const smokeMat = new THREE.MeshBasicMaterial({ color: 0x9a8f8a, transparent: true, opacity: 0.25, depthWrite: false });
const smoke = Array.from({ length: 10 }, () => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), smokeMat.clone());
  m.visible = false;
  scene.add(m);
  return { m, life: 0 };
});
let flareAge = 0, sparkAcc = 0, smokeAcc = 0;
function animateFlare(dt) {
  if (!tacMesh.visible) { flareLight.intensity = 0; return; }
  flareAge += dt;
  const pop = Math.min(1, flareAge / 0.25);                       // pops in when planted
  tacMesh.scale.setScalar(0.3 + 0.7 * (1 - (1 - pop) ** 3));
  const flick = 0.75 + 0.25 * Math.sin(flareAge * 37) * Math.sin(flareAge * 13.3) + Math.random() * 0.15;
  flareLight.intensity = 9 * flick * pop;
  flareGlow.scale.setScalar(0.8 + 0.5 * flick);
  flareGlow.material.opacity = 0.35 + 0.2 * flick;
  const tip = flareTip.getWorldPosition(new THREE.Vector3());
  sparkAcc += dt * 90;
  for (const sp of sparks) {
    if (sp.life <= 0 && sparkAcc >= 1) {
      sparkAcc -= 1;
      sp.life = 0.35 + Math.random() * 0.4;
      sp.p.copy(tip);
      sp.v.set((Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.8, (Math.random() - 0.5) * 1.6);
    }
  }
  const arr = sparkGeo.attributes.position.array;
  sparks.forEach((sp, i) => {
    if (sp.life > 0) {
      sp.life -= dt;
      sp.v.y -= 6 * dt;
      sp.p.addScaledVector(sp.v, dt);
      arr[i * 3] = sp.p.x; arr[i * 3 + 1] = sp.p.y; arr[i * 3 + 2] = sp.p.z;
    } else { arr[i * 3 + 1] = -9999; }
  });
  sparkGeo.attributes.position.needsUpdate = true;
  smokeAcc += dt * 4;
  for (const sm of smoke) {
    if (sm.life <= 0 && smokeAcc >= 1) {
      smokeAcc -= 1;
      sm.life = 1.6;
      sm.m.position.copy(tip).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.05, (Math.random() - 0.5) * 0.1));
      sm.m.visible = true;
    }
    if (sm.life > 0) {
      sm.life -= dt;
      const k = 1 - sm.life / 1.6;
      sm.m.position.y += dt * 0.7;
      sm.m.position.x += dt * 0.15;
      sm.m.scale.setScalar(0.5 + k * 2.2);
      sm.m.material.opacity = 0.28 * (1 - k);
      if (sm.life <= 0) sm.m.visible = false;
    }
  }
}
// Placing it: the gun dips, a flare comes up in your hand, gets struck and dropped at your feet.
const handFlare = new THREE.Group();
{
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.3), mat(0xc42a1e));
  const tp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  tp.position.z = -0.16;
  handFlare.add(st, tp);
  handFlare.visible = false;
  camera.add(handFlare);
}
let placing = null;   // { t, x, y, z, yaw }
function placeTac() {
  if (placing) return;
  if (!player.grounded || player.onLadder) { toast('Tactical insertion: stand on solid ground'); return; }
  placing = { t: 0, x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw };
}
function animatePlacing(dt) {
  if (!placing) { handFlare.visible = false; return 0; }
  placing.t += dt;
  const t = placing.t, D = 0.55;
  handFlare.visible = t < 0.42;
  const up = Math.min(1, t / 0.18), down = Math.max(0, (t - 0.25) / 0.17);
  handFlare.position.set(-0.12 + 0.05 * up, -0.45 + 0.27 * up - 0.5 * down, -0.45);
  handFlare.rotation.set(-0.9 + 0.6 * up + 1.4 * down, 0.3, 0.2);
  if (t >= 0.3 && !tacMesh.visible || (t >= 0.3 && placing.planted !== true)) {
    if (!placing.planted) {
      placing.planted = true;
      tacIns = { x: placing.x, y: placing.y, z: placing.z, yaw: placing.yaw };
      tacMesh.position.set(tacIns.x, tacIns.y, tacIns.z);
      tacMesh.visible = true;
      flareAge = 0;
      sfxFlare();
      feed('Tactical insertion placed');
    }
  }
  const dip = Math.sin(Math.min(1, t / D) * Math.PI) * 0.3;     // gun lowers while you do it
  if (t >= D) placing = null;
  return dip;
}
function respawn(reason) {
  if (tacIns) {
    player.pos.set(tacIns.x, tacIns.y + 0.01, tacIns.z);
    yaw = tacIns.yaw;
  } else {
    player.pos.set(-23, 0.01, -57);   // north office reception, by the elevators
    yaw = Math.PI;                     // face south, out onto the rooftop
  }
  pitch = 0;
  player.vel.set(0, 0, 0);
  player.grounded = true;
  if (gameReady) weapon.knifePending = false;   // (respawn() also runs once at startup, before the weapon exists)
  resetTrick();
  if (reason) { toast(reason); if (gameReady) attempts.deaths++; }
}
// Trick state (mirrors the server's replay so the HUD shows what will count)
const trick = {};
let trickLog = null, frameRec = null, startLogAtEnd = false, jumpCounter = 0;
const frameEvents = [];   // visual events this frame (for the killcam)
function resetTrick() {
  Object.assign(trick, { runDir: 0, runAmt: 0, spins: 0, dirs: 0, swaps: 0, scopeIns: 0, tags: 0, start: 0, knifeUsed: false });
  trickLog = null;
  frameRec = null;
}
function closeRun() {
  const n = Math.floor(trick.runAmt / (Math.PI * 2));
  if (n > 0) { trick.spins += n; trick.dirs |= trick.runDir > 0 ? 1 : 2; }
  trick.runAmt = 0;
}
function addSpin(d) {
  if (!d) return;
  const sgn = Math.sign(d);
  if (sgn !== trick.runDir) { closeRun(); trick.runDir = sgn; }
  trick.runAmt += Math.abs(d);
}
function logEvent(ev) { if (frameRec) frameRec[1].push(ev); }
// Killcam: everything from takeoff to the shot. The host replays it with your CONFIG.
function startLog(t = now()) {
  trick.start = t;
  trickLog = {
    takeoff: {
      pos: [player.pos.x, player.pos.y, player.pos.z],
      vel: [player.vel.x, player.vel.y, player.vel.z],
      yaw, pitch, sprint: !!keys[settings.keys.sprint],
      weapon: {
        current: weapon.current, lastSwap: weapon.lastSwap - t, swapEnd: weapon.swapEnd - t,
        lastShot: weapon.lastShot - t, adsHeld: weapon.adsHeld, adsPress: weapon.adsPress - t, ads: weapon.ads,
      },
    },
    frames: [],
    jump: ++jumpCounter,
    startT: t,
    ticket: session ? session.nonce : null,
  };
  // Commit settings + takeoff to the host right now; they can't be changed afterwards.
  if (trickLog.ticket) {
    trickLog.sent = fetch('/api/takeoff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: trickLog.ticket, jump: trickLog.jump, config: sentConfig(), takeoff: trickLog.takeoff }),
    }).catch(() => {});
  }
}
const inAir = () => !player.grounded && !player.onLadder;
respawn();

function overlaps(b) {
  const p = player.pos;
  return p.x + R > b.min.x && p.x - R < b.max.x &&
         p.z + R > b.min.z && p.z - R < b.max.z &&
         p.y + HEIGHT > b.min.y && p.y < b.max.y - 1e-4;
}
function moveHorizontal(axis, delta) {
  player.pos[axis] += delta;
  for (const b of colliders) {
    if (!overlaps(b)) continue;
    if (player.grounded && b.max.y - player.pos.y <= STEP) { player.pos.y = b.max.y; continue; }
    player.pos[axis] = delta > 0 ? b.min[axis] - R - 1e-3 : b.max[axis] + R + 1e-3;
    player.vel[axis] = 0;
  }
}
function moveVertical(delta) {
  player.pos.y += delta;
  player.grounded = false;
  for (const b of colliders) {
    if (!overlaps(b)) continue;
    if (delta <= 0) { player.pos.y = b.max.y; player.grounded = true; }
    else player.pos.y = b.min.y - HEIGHT - 1e-3;
    player.vel.y = 0;
  }
}

// ================= WEAPONS =================
const weapon = { current: 'sniper', lastSwap: -9, swapEnd: 0, lastShot: -9, adsHeld: false, adsPress: 0, ads: 0, recoil: 0, lastScope: 'noscope', knifeWind: -9, knifePending: false };
const boltHandle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.025), mat(0x1c1c1c));
const gun = new THREE.Group();
camera.add(gun);
// ---- Camos: patterns drawn on a canvas (no image files) ----
const camoCache = {};
function camoTexture(id) {
  if (camoCache[id]) return camoCache[id];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blobs = (base, cols, n, rMin, rMax) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[i % cols.length];
      const x = rnd() * 128, y = rnd() * 128, rx = rMin + rnd() * (rMax - rMin), ry = rx * (0.4 + rnd() * 0.6);
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {   // tile seamlessly
        g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
      }
    }
  };
  const stripes = (base, dark) => {
    g.fillStyle = base; g.fillRect(0, 0, 128, 128);
    g.fillStyle = dark;
    for (let i = 0; i < 9; i++) {
      const y0 = rnd() * 128, w = 3 + rnd() * 7, amp = 6 + rnd() * 10, ph = rnd() * 6;
      g.beginPath();
      for (let x = 0; x <= 128; x += 4) g.lineTo(x, y0 + Math.sin(x / 20 + ph) * amp);
      for (let x = 128; x >= 0; x -= 4) g.lineTo(x, y0 + w + Math.sin(x / 20 + ph) * amp * 0.8);
      g.fill();
    }
  };
  const digital = (cols) => {
    for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fillRect(x, y, 8, 8);
    }
  };
  switch (id) {
    case 'desert': blobs('#c8b38a', ['#a88d62', '#8a7350', '#d9c9a3'], 40, 6, 18); break;
    case 'arctic': blobs('#e6e8ea', ['#b9bec3', '#8f969c', '#ffffff'], 40, 6, 18); break;
    case 'woodland': blobs('#4f5b33', ['#2f3a22', '#6b5536', '#1d1f18', '#7a8a4a'], 46, 6, 18); break;
    case 'digital': digital(['#5d6b78', '#7a8996', '#3e4852', '#9aa6b0']); break;
    case 'urban': blobs('#8d9094', ['#5a5e63', '#c8cacd', '#2e3135'], 44, 5, 16); break;
    case 'fall': blobs('#8a5a2b', ['#c47a2c', '#5a3a1e', '#7a7a3a', '#d9a35a'], 46, 6, 18); break;
    case 'red_tiger': stripes('#b5262a', '#1a0d0d'); break;
    case 'blue_tiger': stripes('#2a5bbd', '#0b1530'); break;
    case 'gold': {
      const gr = g.createLinearGradient(0, 0, 128, 128);
      gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.35, '#d4a52c'); gr.addColorStop(0.6, '#f4d36a'); gr.addColorStop(1, '#a9781a');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      break;
    }
    default: g.fillStyle = '#3a3f37'; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return (camoCache[id] = t);
}
const camoMat = new THREE.MeshPhongMaterial({ map: camoTexture('none'), shininess: 12, specular: 0x222222 });
function setCamo(id) {
  camoMat.map = camoTexture(id || 'none');
  const gold = id === 'gold';
  camoMat.shininess = gold ? 90 : 12;
  camoMat.specular.set(gold ? 0xffe9a0 : 0x222222);
  camoMat.needsUpdate = true;
}
const camoSwatch = (id) => camoTexture(id).image.toDataURL();

// ---- The sniper rifle (bolt-action, long fluted barrel, muzzle brake, skeleton stock, big scope) ----
const sniperModel = new THREE.Group();
{
  const metal = new THREE.MeshPhongMaterial({ color: 0x1c1e1f, shininess: 40, specular: 0x333333 });
  const black = mat(0x141414);
  const part = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    sniperModel.add(mesh);
    return mesh;
  };
  const cyl = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg);
  const B = (w, h, l) => new THREE.BoxGeometry(w, h, l);
  const X = Math.PI / 2;
  // receiver + handguard (camo)
  part(B(0.07, 0.085, 0.34), camoMat, 0, 0, -0.04);
  part(B(0.066, 0.07, 0.36), camoMat, 0, -0.005, -0.39);
  part(B(0.05, 0.02, 0.34), camoMat, 0, -0.045, -0.39);                     // handguard underside rail
  // barrel (fluted look), muzzle brake with ports
  part(cyl(0.017, 0.66), metal, 0, 0.012, -0.84, X);
  for (const a of [0, 1, 2, 3]) part(B(0.006, 0.006, 0.5), black, Math.cos(a * X) * 0.017, 0.012 + Math.sin(a * X) * 0.017, -0.83);
  part(B(0.05, 0.045, 0.1), metal, 0, 0.012, -1.2);
  for (const z of [-1.17, -1.2, -1.23]) {
    part(B(0.052, 0.015, 0.012), black, 0, 0.012, z);
  }
  // bolt handle (animated elsewhere), magazine, trigger guard, pistol grip
  boltHandle.position.set(0.055, 0.02, 0.02);
  sniperModel.add(boltHandle);
  part(B(0.045, 0.1, 0.09), metal, 0, -0.09, -0.06);
  part(B(0.012, 0.012, 0.09), metal, 0, -0.07, 0.07);
  part(B(0.012, 0.04, 0.012), metal, 0, -0.06, 0.115);
  part(B(0.045, 0.12, 0.05), black, 0, -0.1, 0.14, 0.35);
  // skeleton stock: top bar, lower bar, cheek rest, butt pad (camo)
  part(B(0.05, 0.035, 0.32), camoMat, 0, 0.0, 0.31);
  part(B(0.045, 0.03, 0.3), camoMat, 0, -0.1, 0.33, -0.12);
  part(B(0.048, 0.04, 0.14), camoMat, 0, 0.04, 0.3);
  part(B(0.06, 0.16, 0.04), black, 0, -0.05, 0.48);
  part(B(0.04, 0.11, 0.03), camoMat, 0, -0.06, 0.2);
  // folded bipod under the handguard
  for (const x of [-0.02, 0.02]) part(cyl(0.006, 0.26, 6), metal, x, -0.06, -0.45, X);
  // scope: tube, front/back bells, rings, turrets
  part(cyl(0.026, 0.32), black, 0, 0.085, -0.12, X);
  part(new THREE.CylinderGeometry(0.042, 0.03, 0.09, 14), black, 0, 0.085, -0.32, -X);
  part(new THREE.CylinderGeometry(0.036, 0.028, 0.07, 14), black, 0, 0.085, 0.07, X);
  for (const z of [-0.2, -0.04]) part(B(0.06, 0.05, 0.025), metal, 0, 0.05, z);
  part(cyl(0.013, 0.03, 10), metal, 0, 0.12, -0.12);
  part(cyl(0.013, 0.03, 10), metal, 0.035, 0.085, -0.12, 0, 0, X);
  part(new THREE.CircleGeometry(0.03, 14), new THREE.MeshBasicMaterial({ color: 0x2a4a6a }), 0, 0.085, -0.366, 0, Math.PI);
}
const pistolModel = new THREE.Group();
{
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.26), mat(0xb8b8b8));
  slide.position.z = -0.1;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.06), mat(0x222222));
  grip.position.set(0, -0.08, 0.0);
  grip.rotation.x = -0.25;
  pistolModel.add(slide, grip);
}
gun.add(sniperModel, pistolModel);
gun.position.set(0.26, -0.24, -0.55);
gun.scale.setScalar(0.6);
pistolModel.visible = false;

function swapWeapon() {
  const t = now();
  if (t - weapon.lastSwap < CONFIG.SWAP_COOLDOWN) return;
  weapon.lastSwap = t;
  weapon.swapEnd = t + CONFIG.SWAP_TIME;
  weapon.current = weapon.current === 'sniper' ? 'pistol' : 'sniper';
  weapon.ads = 0;
  sniperModel.visible = weapon.current === 'sniper';
  pistolModel.visible = weapon.current === 'pistol';
  if (trickLog) trick.swaps++;
}

const raycaster = new THREE.Raycaster();
const tracers = [];
// Aim straight from yaw/pitch so the host can rebuild the exact same ray.
function aimDir(spread, r1, ang) {
  const cp = Math.cos(pitch);
  const dir = new THREE.Vector3(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  if (spread > 0) {
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir);
    const s = Math.tan(THREE.MathUtils.degToRad(spread)) * r1;
    dir.addScaledVector(right, Math.cos(ang) * s).addScaledVector(up, Math.sin(ang) * s).normalize();
  }
  return dir;
}
function fire() {
  const r1 = Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2;
  logEvent(['f', r1, ang]);
  const t = now();
  if (t < weapon.swapEnd) return;
  const sniper = weapon.current === 'sniper';
  if (t - weapon.lastShot < (sniper ? CONFIG.SNIPER_FIRE_DELAY : CONFIG.PISTOL_FIRE_DELAY)) return;
  weapon.lastShot = t;
  weapon.recoil = 1;
  attempts.shots++;
  sfxShot(sniper);

  let scope = 'noscope', spread = CONFIG.NOSCOPE_SPREAD;
  if (sniper && weapon.adsHeld && weapon.ads >= 1) {
    spread = 0;
    scope = t - weapon.adsPress <= CONFIG.QUICKSCOPE_WINDOW ? 'quickscope' : 'hardscope';
  } else if (!sniper) spread = 0.4;
  weapon.lastScope = scope;

  const origin = new THREE.Vector3(player.pos.x, player.pos.y + EYE, player.pos.z);
  const dir = aimDir(spread, r1, ang);
  raycaster.set(origin, dir);
  raycaster.far = 800;
  const hit = raycaster.intersectObjects(shootables, false).find((h) => h.object.parent !== bot.group || bot.alive);
  const endPt = hit ? hit.point : origin.clone().addScaledVector(dir, 800);
  addTracer(origin, endPt);
  frameEvents.push({ type: 'shot', from: origin.toArray(), to: endPt.toArray(), sniper });

  if (sniper) { weapon.adsHeld = false; weapon.ads = 0; adsIntent = false; } // bolt action unscopes

  if (hit && hit.object.parent === bot.group && bot.alive) {
    hitmarker();
    if (sniper) onKill({ weapon: 'sniper', flight: 0 });
    else if (trickLog) { trick.tags++; feed('Deagle tag! (+multiplier)'); }
    else feed('Desert Eagle hit — only Intervention kills count');
  }
}

function addTracer(from, to) {
  const start = from.clone().add(new THREE.Vector3(0, -0.15, 0));
  const g = new THREE.BufferGeometry().setFromPoints([start, to]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9 }));
  scene.add(line);
  tracers.push({ line, life: 0.15 });
}

// ================= THROWING KNIFE =================
const knifeAnims = [];
const KNIFE_WINDUP = 0.22;   // seconds the knife is held back before it's thrown
let lastGroundKnife = -9;
function makeKnifeMesh() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.24), mat(0xd0d4d8));
  blade.position.z = -0.12;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.12), mat(0x222222));
  handle.position.z = 0.06;
  g.add(blade, handle);
  return g;
}
function spawnKnife(path, t0) {
  const mesh = makeKnifeMesh();
  scene.add(mesh);
  knifeAnims.push({ path, t0, mesh });
}
function animateKnives(T) {
  for (let i = knifeAnims.length - 1; i >= 0; i--) {
    const k = knifeAnims[i], n = k.path.length - 1;
    const f = (T - k.t0) / KNIFE.STEP;
    if (f > n + 240) { scene.remove(k.mesh); knifeAnims.splice(i, 1); continue; }
    k.mesh.visible = f >= 0;
    if (f < 0) continue;
    const idx = Math.min(n, Math.floor(f)), fr = Math.min(1, f - idx);
    const a = k.path[idx], b = k.path[Math.min(n, idx + 1)];
    k.mesh.position.set(a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr, a[2] + (b[2] - a[2]) * fr);
    if (f < n) {
      const c = k.path[Math.min(n, idx + 2)];
      if (c[0] !== a[0] || c[2] !== a[2] || c[1] !== a[1]) k.mesh.lookAt(c[0], c[1], c[2]);
      k.mesh.rotateX(-(T - k.t0) * 22);
    }
  }
}
function throwKnife() {
  logEvent('k');
  const t = now();
  if (trickLog) { if (trick.knifeUsed) return; trick.knifeUsed = true; }   // one knife per jump
  else { if (t - lastGroundKnife < 1) return; lastGroundKnife = t; }
  const d = aimDir(0, 0, 0);
  const o = [player.pos.x, player.pos.y + EYE, player.pos.z];
  const res = simulateKnife(o, [d.x, d.y, d.z], CONFIG.KNIFE_SPEED, CONFIG.KNIFE_GRAVITY, CONFIG.KNIFE_BOUNCE,
    MAP.colliders, bot.alive && botInfo ? botInfo : null);
  attempts.throws++;
  spawnKnife(res.path, t);
  frameEvents.push({ type: 'knife', path: res.path });
  sfxKnife();
  if (res.hit) {
    const flight = (res.path.length - 1) * KNIFE.STEP;
    setTimeout(hitmarker, flight * 1000);
    onKill({ weapon: 'knife', flight });
  }
}

// ================= SESSION / ROUND =================
// The host picks the dummy's spawn and hands out a one-time killcam ticket for it.
let session = null, botInfo = null;
async function newSession() {
  session = null;
  try {
    const j = await (await fetch('/api/session', { method: 'POST' })).json();
    session = j;
    botInfo = j.bot;
    bot.group.position.set(j.bot.x, j.bot.y, j.bot.z);
    bot.group.rotation.set(0, j.bot.rot, 0);
    bot.dieAt = null;
    bot.group.visible = true;
    bot.alive = true;
  } catch {
    setTimeout(newSession, 2000);
  }
}
newSession();

const SENT_CONFIG = ['GRAVITY', 'JUMP_VELOCITY', 'MOVE_SPEED', 'SPRINT_SPEED', 'MAX_TURN_RATE', 'SWAP_COOLDOWN',
  'SWAP_TIME', 'ADS_TIME', 'QUICKSCOPE_WINDOW', 'NOSCOPE_SPREAD', 'SNIPER_FIRE_DELAY', 'PISTOL_FIRE_DELAY',
  'KNIFE_SPEED', 'KNIFE_GRAVITY', 'KNIFE_BOUNCE'];
const sentConfig = () => Object.fromEntries(SENT_CONFIG.map((k) => [k, CONFIG[k]]));

let mode = 'play';          // play -> killcam -> summary -> (next round) play
let roundEnd = null, kc = null;

function onKill(info) {
  bot.alive = false;
  const tHit = now() + info.flight;
  bot.dieAt = tHit;
  const log = trickLog;
  const end = [player.pos.x, player.pos.y, player.pos.z];
  resetTrick();
  if (!log || !log.ticket) {
    showPopup('KILL', ['Not a trickshot: you have to be mid-air'], null);
    feed('[Dummy down] ground kill, no points');
    session = null;
    setTimeout(newSession, 2500 + info.flight * 1000);
    return;
  }
  // Shot is in: the round ends once it lands, then the killcam plays.
  session = null;
  roundEnd = { tShot: now(), tHit, takeoffT: log.startT, result: null, knife: info.weapon === 'knife' };
  submit(log, end, roundEnd);
}

async function submit(log, end, r) {
  try {
    await log.sent;
    const res = await fetch('/api/trickshot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: log.ticket, jump: log.jump, frames: log.frames, end, player: playerId }),
    });
    r.result = await res.json();
    if (r.result.coins != null) { shop.coins = r.result.coins; renderShop(); }
  } catch {
    r.result = { ok: false, message: 'Lost connection to host.' };
  }
}

// ---- Killcam: replays the last few seconds from the history buffer, slow-mo around the shot ----
const history = [];
function sampleHistory(T, hist = history) {
  if (!hist.length) return null;
  if (T <= hist[0].t) return hist[0];
  for (let i = 1; i < hist.length; i++) {
    const b = hist[i];
    if (b.t >= T) {
      const a = hist[i - 1], f = (T - a.t) / (b.t - a.t || 1);
      const L = (k) => a[k] + (b[k] - a[k]) * f;
      return { x: L('x'), y: L('y'), z: L('z'), yaw: L('yaw'), pitch: L('pitch'), ads: L('ads'), dip: L('dip'), recoil: L('recoil'),
        bolt: L('bolt'), thr: L('thr'), qs: a.qs, cur: a.cur };
    }
  }
  return hist[hist.length - 1];
}
function clearKnives() { for (const k of knifeAnims) scene.remove(k.mesh); knifeAnims.length = 0; }
// ---- Killcam video: rendered client-side, frame by frame on a fixed 30 fps timeline ----
// Nothing is captured live (so a slow frame can't drop or speed anything up). After the round, the
// killcam is re-rendered offscreen: each frame is drawn, composited with the effects, and encoded with
// WebCodecs; the soundtrack is mixed in an OfflineAudioContext with every sound on its exact frame.
const recCanvas = document.createElement('canvas');
const recCtx = recCanvas.getContext('2d');
let lastKill = null, rendering = false;
const VIDEO_FPS = 30;
const videoSupported = () => 'VideoEncoder' in window && 'VideoFrame' in window;

function killcamTimeline(r, hist) {
  const first = hist.length ? hist[0].t : r.tShot;
  const times = [];
  let T = Math.max(first, r.takeoffT - 3, r.tShot - 12), verdict = -1;
  while (times.length < VIDEO_FPS * 90) {
    times.push(T);
    if (verdict < 0 && T >= r.tHit) verdict = times.length - 1;
    if (verdict >= 0 && T >= r.tHit + 1.4 && (times.length - verdict) / VIDEO_FPS >= 3.4) break;
    let nt = T + kcSpeed(T, r) / VIDEO_FPS;
    if (T < r.tHit && nt > r.tHit) nt = r.tHit;                     // always land a frame exactly on the hit
    T = nt;
  }
  return { times, verdict };
}

function mixKillcamAudio(times, verdict, hist, res, SR) {
  const dur = times.length / VIDEO_FPS + 0.5;
  const octx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const out = octx.createGain();
  out.gain.value = settings.volume;
  out.connect(octx.destination);
  const noiseAt = (t, d, vol, freq) => {
    const buf = octx.createBuffer(1, Math.ceil(SR * d), SR), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 3;
    const src = octx.createBufferSource(), f = octx.createBiquadFilter(), g = octx.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(out); src.start(t);
  };
  const tickAt = (t) => {
    const o = octx.createOscillator(), g = octx.createGain();
    o.frequency.value = 1900;
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.09);
  };
  const clipAt = (name, t, vol = 0.8) => {
    if (!clips[name]) return;
    const src = octx.createBufferSource(), g = octx.createGain();
    src.buffer = clips[name]; g.gain.value = vol;
    src.connect(g).connect(out); src.start(t);
  };
  for (let i = 1; i < times.length; i++) {
    for (const h of hist) {
      if (h.t > times[i - 1] && h.t <= times[i]) {
        for (const e of h.ev) {
          if (e.type === 'shot') noiseAt(i / VIDEO_FPS, e.sniper ? 0.5 : 0.18, e.sniper ? 0.9 : 0.5, e.sniper ? 1800 : 3000);
          if (e.type === 'knife') noiseAt(i / VIDEO_FPS, 0.18, 0.35, 5000);
        }
      }
    }
  }
  const vt = verdict / VIDEO_FPS;
  tickAt(vt);
  if (res && res.ok) {
    for (let j = 0; j < 14; j++) tickAt(vt + j * 0.07);
    clipAt('airhorn', vt);
    clipAt('mom-get-the-camera', vt + 0.9);
  }
  return octx.startRendering();
}

// Effects drawn on the video, as a function of time since the hit (same look as the live killcam).
function makeVideoFx(res) {
  const rng = mulberry32(2009);
  const words = [...MLG_WORDS];
  if (res && res.weapon === 'knife') words.push('KNIFE TRICKSHOT', 'YEET');
  else if (res && res.spins) words.push(`${res.spins * 360} ${res.scope === 'noscope' ? 'NO SCOPE' : 'QUICKSCOPE'}`);
  return {
    words: Array.from({ length: 16 }, (_, i) => ({ t: i * 0.11, x: 0.05 + rng() * 0.65, y: 0.08 + rng() * 0.8, hue: rng() * 360,
      size: 28 + rng() * 40, rot: (rng() * 40 - 20) * Math.PI / 180, text: words[Math.floor(rng() * words.length)] })),
    hits: Array.from({ length: 30 }, (_, i) => ({ t: i * 0.045, x: rng() * 0.95, y: rng() * 0.9 })),
    chips: Array.from({ length: 40 }, () => ({ x: rng(), delay: rng() * 0.8, dur: 1.2 + rng() * 1.6, spin: (rng() * 1440 - 720) * Math.PI / 180 })),
  };
}
function drawVideoFrame(ctx, W, H, e, res, fx, v, chased, feedLine) {
  const k = H / 720, ok = res && res.ok;
  ctx.save();
  if (ok && e >= 0 && e < 1.3) {                                  // screen shake + rainbow flash
    ctx.translate((Math.random() - 0.5) * 12 * k, (Math.random() - 0.5) * 12 * k);
    ctx.filter = `hue-rotate(${(e * 720) % 360}deg) saturate(2.5)`;
  }
  ctx.drawImage(renderer.domElement, 0, 0, W, H);
  ctx.restore();
  const text = (t, x, y, size, color, align = 'center', font = 'italic 900', a = 1, rot = 0, scale = 1) => {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
    ctx.font = `${font} ${size * k}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = align; ctx.lineWidth = 3 * k; ctx.strokeStyle = '#000'; ctx.fillStyle = color;
    ctx.strokeText(t, 0, 0); ctx.fillText(t, 0, 0);
    ctx.restore();
  };
  const xMark = (cx, cy, size, a = 1) => {
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * k;
    for (const [dx, dy] of [[1, 1], [1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx - dx * size, cy - dy * size); ctx.lineTo(cx - dx * size * 0.4, cy - dy * size * 0.4);
      ctx.moveTo(cx + dx * size * 0.4, cy + dy * size * 0.4); ctx.lineTo(cx + dx * size, cy + dy * size); ctx.stroke();
    }
    ctx.restore();
  };
  if (v && v.cur === 'sniper' && v.ads >= 1 && !chased) {        // scope overlay
    const r = H * 0.34;
    const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.99, W / 2, H / 2, r * 1.01);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(W / 2 - k / 2, 0, k, H); ctx.fillRect(0, H / 2 - k / 2, W, k);
  }
  if (e >= 0 && e < 0.14) xMark(W / 2, H / 2, 14 * k);
  if (ok && e >= 0) {
    if (e < 2.4) {                                                // spinning green triangle
      const p = e / 2.4, a = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7, sz = 100 * k * 2.2 * p;
      ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = 'rgba(80,255,80,.35)';
      ctx.translate(W / 2, H / 2); ctx.rotate(p * Math.PI * 4);
      ctx.beginPath(); ctx.moveTo(0, -sz); ctx.lineTo(sz * 0.87, sz / 2); ctx.lineTo(-sz * 0.87, sz / 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const c of fx.chips) {                                   // falling chips
      const p = (e - c.delay) / c.dur;
      if (p < 0 || p > 1) continue;
      ctx.save(); ctx.fillStyle = '#f28c1a';
      ctx.translate(c.x * W, -60 * k + p * (H * 1.1 + 60 * k)); ctx.rotate(c.spin * p);
      ctx.beginPath(); ctx.moveTo(0, -20 * k); ctx.lineTo(22 * k, 20 * k); ctx.lineTo(-22 * k, 20 * k); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const h of fx.hits) { const p = (e - h.t) / 0.5; if (p >= 0 && p <= 1) xMark(h.x * W + 20 * k, h.y * H + 20 * k, 18 * k, 1 - p); }
    for (const w of fx.words) {                                   // MLG words: pop in, fade out
      const p = (e - w.t) / 1.7;
      if (p < 0 || p > 1) continue;
      const sc = p < 0.2 ? (p / 0.2) * 1.3 : 1.3 - 0.3 * ((p - 0.2) / 0.8);
      text(w.text, w.x * W, w.y * H, w.size, `hsl(${w.hue} 100% 60%)`, 'left', 'italic 900', 1 - p, w.rot, sc);
    }
    if (clips['mom-get-the-camera'] && e >= 0.9 && e < 2.6) {
      const p = (e - 0.9) / 1.7;
      text('MOM GET THE CAMERA', W / 2, H * 0.5, 64, '#ffd23f', 'center', 'italic 900', 1 - p, -0.1, p < 0.2 ? (p / 0.2) * 1.3 : 1.3 - 0.3 * ((p - 0.2) / 0.8));
    }
  }
  ctx.fillStyle = 'rgba(140,0,0,.65)'; ctx.fillRect(W / 2 - 180 * k, 70 * k, 360 * k, 48 * k);   // banner
  text('FINAL KILLCAM', W / 2, 108 * k, 34, '#fff');
  if (e >= 0 && e < 4) {                                          // score popup
    const a = e > 3.7 ? (4 - e) / 0.3 : 1;
    const lines = ok ? res.breakdown.map(([l, m]) => `${l} ×${+m.toFixed(2)}`) : [(res && res.message) || 'Killcam rejected.'];
    text(ok ? 'TRICKSHOT!' : 'REJECTED', W / 2, H * 0.22 + 40 * k, 44, '#ffd23f', 'center', 'italic 900', a);
    lines.forEach((l, i) => text(l.toUpperCase(), W / 2, H * 0.22 + (64 + i * 24) * k, 18, '#e8f0d8', 'center', 'bold', a));
    if (ok) text(`+${res.score.toLocaleString()}`, W / 2, H * 0.22 + (70 + lines.length * 24) * k, 30, '#b6f06a', 'center', 'bold', a);
  }
  if (e >= 0 && feedLine) text(feedLine, 16 * k, 60 * k, 13, '#e8f0d8', 'left', 'bold');
  ctx.save();                                                     // watermark
  ctx.font = `bold ${15 * k}px "Times New Roman", serif`;
  const wm = 'Unregistered RowdyCyberCam 2', tw = ctx.measureText(wm).width;
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(6 * k, 6 * k, tw + 12 * k, 22 * k);
  ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.fillText(wm, 12 * k, 22 * k);
  ctx.restore();
}

async function renderKillcamVideo() {
  if (!lastKill || rendering || !videoSupported()) return;
  rendering = true;
  const btn = $('dl-killcam');
  const { r, hist, res } = lastKill;
  const savedRatio = renderer.getPixelRatio(), savedAspect = camera.aspect;
  try {
    const H = Math.round(Math.max(720, Math.min(1080, innerHeight * devicePixelRatio)) / 2) * 2;
    const W = Math.round((H * innerWidth / innerHeight) / 2) * 2;
    recCanvas.width = W; recCanvas.height = H;
    const { times, verdict } = killcamTimeline(r, hist);
    // codecs
    const vcfg = { codec: 'vp09.00.10.08', width: W, height: H, bitrate: H > 800 ? 4_000_000 : 2_500_000, framerate: VIDEO_FPS };
    let vMux = 'V_VP9';
    if (!(await VideoEncoder.isConfigSupported(vcfg)).supported) { vcfg.codec = 'vp8'; vMux = 'V_VP8'; }
    const SR = 48000;
    const acfg = { codec: 'opus', sampleRate: SR, numberOfChannels: 2, bitrate: 96_000 };
    const hasAudio = 'AudioEncoder' in window && (await AudioEncoder.isConfigSupported(acfg)).supported;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: vMux, width: W, height: H, frameRate: VIDEO_FPS },
      ...(hasAudio ? { audio: { codec: 'A_OPUS', sampleRate: SR, numberOfChannels: 2 } } : {}),
      firstTimestampBehavior: 'offset',
    });
    let failure = null;
    // soundtrack first (fast), then the frames
    if (hasAudio) {
      btn.textContent = 'Rendering audio…';
      const ab = await mixKillcamAudio(times, verdict, hist, res, SR);
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failure = e) });
      aenc.configure(acfg);
      for (let off = 0; off < ab.length; off += 4800) {
        const n = Math.min(4800, ab.length - off), data = new Float32Array(n * 2);
        for (let c = 0; c < 2; c++) data.set(ab.getChannelData(c).subarray(off, off + n), c * n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / SR * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush();
    }
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failure = e) });
    venc.configure(vcfg);
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    clearKnives();
    for (const tr of tracers) { scene.remove(tr.line); tr.line.geometry.dispose(); }
    tracers.length = 0;
    bot.dieAt = r.tHit;
    bot.group.visible = true;
    const fx = makeVideoFx(res);
    const feedLine = res && res.ok ? `[${res.weapon === 'knife' ? 'Knife' : 'Intervention'}] ${res.headshot ? '☠ ' : ''}Dummy  +${res.score.toLocaleString()}` : '';
    for (let i = 0; i < times.length; i++) {
      const T = times[i], prev = i ? times[i - 1] : -Infinity;
      for (const h of hist) {
        if (h.t > prev && h.t <= T) {
          for (const ev of h.ev) {
            if (ev.type === 'shot') addTracer(new THREE.Vector3(...ev.from), new THREE.Vector3(...ev.to));
            if (ev.type === 'knife') spawnKnife(ev.path, h.t);
          }
        }
      }
      const v = sampleHistory(T, hist);
      if (v) applyView(v);
      const chased = v ? chaseCam(T, r, v) : false;
      gun.visible = !(v && v.cur === 'sniper' && v.ads >= 1) && !chased;
      animateKnives(T);
      animateBot(T);
      fadeTracers(kcSpeed(T, r) / VIDEO_FPS);
      animateFlare(1 / VIDEO_FPS);
      renderer.render(scene, camera);
      drawVideoFrame(recCtx, W, H, (i - verdict) / VIDEO_FPS, res, fx, v, chased, feedLine);
      const frame = new VideoFrame(recCanvas, { timestamp: Math.round(i * 1e6 / VIDEO_FPS), duration: Math.round(1e6 / VIDEO_FPS) });
      venc.encode(frame, { keyFrame: i % (VIDEO_FPS * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 4) await new Promise((ok) => setTimeout(ok, 0));
      if (i % 5 === 0) { btn.textContent = `Rendering… ${Math.round((i / times.length) * 100)}%`; await new Promise((ok) => setTimeout(ok, 0)); }
      if (failure) throw failure;
    }
    await venc.flush();
    if (failure) throw failure;
    muxer.finalize();
    const url = URL.createObjectURL(new Blob([muxer.target.buffer], { type: 'video/webm' }));
    const a = document.createElement('a');
    a.href = url; a.download = `highrise-killcam-${Date.now()}.webm`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);              // not kept after the download
    btn.textContent = 'Downloaded · download again';
  } catch (err) {
    console.error(err);
    btn.textContent = 'Video export failed';
  } finally {
    renderer.setPixelRatio(savedRatio);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = savedAspect;
    camera.updateProjectionMatrix();
    rendering = false;
  }
}
$('dl-killcam').addEventListener('click', renderKillcamVideo);
function startKillcam() {
  mode = 'killcam';
  const r = roundEnd;
  const first = history.length ? history[0].t : r.tShot;
  kc = { t: Math.max(first, r.takeoffT - 3, r.tShot - 12), wait: 0, verdict: false };   // ~2x longer lead-up
  clearKnives();
  inputQueue.length = 0;
  adsIntent = false;
  $('killcam').style.display = 'block';
  $('tricks').style.visibility = 'hidden';
}
// Killcam speed: slow-mo around the shot/throw and around the hit, a bit faster while a knife flies.
function kcSpeed(t, r) {
  if (t >= r.tShot - 0.8 && t <= r.tShot + 0.3) return 0.25;
  if (t >= r.tHit - 0.4) return 0.25;
  return t > r.tShot ? 0.6 : 1;
}
let chase = false;
function stepKillcam(dt) {
  const r = roundEnd;
  let nt = kc.t + dt * kcSpeed(kc.t, r);
  if (!kc.verdict && nt >= r.tHit) {
    kc.wait += dt;
    nt = r.tHit;                       // hold on the hit until the host's verdict is in
    if (r.result || kc.wait > 6) { kc.verdict = true; playVerdict(r.result); }
  }
  for (const h of history) {
    if (h.t > kc.t && h.t <= nt) {
      for (const e of h.ev) {
        if (e.type === 'shot') { addTracer(new THREE.Vector3(...e.from), new THREE.Vector3(...e.to)); sfxShot(e.sniper); }
        if (e.type === 'knife') { spawnKnife(e.path, h.t); sfxKnife(); }
      }
    }
  }
  kc.t = nt;
  const v = sampleHistory(kc.t);
  if (v) applyView(v);
  // Camera follows the knife once it's thrown
  chase = v ? chaseCam(kc.t, r, v) : false;
  if (kc.verdict && kc.t >= r.tHit + 1.4) showSummary();
}
function chaseCam(T, r, v) {
  if (r.knife && T >= r.tShot) {
    const k = knifeAnims.find((a) => Math.abs(a.t0 - r.tShot) < 1e-6);
    if (k) {
      const n = k.path.length - 1;
      const i = Math.min(n, Math.max(0, Math.floor((T - k.t0) / KNIFE.STEP)));
      const cur = new THREE.Vector3(...k.path[i]);
      const back = new THREE.Vector3(...k.path[Math.max(0, i - 14)]);
      const dir = cur.clone().sub(back);
      if (dir.lengthSq() < 1e-6) dir.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
      dir.normalize();
      camera.position.copy(cur).addScaledVector(dir, -1.6).add(new THREE.Vector3(0, 0.45, 0));
      camera.lookAt(cur.clone().addScaledVector(dir, 2));
      if (Math.abs(camera.fov - 70) > 0.01) { camera.fov = 70; camera.updateProjectionMatrix(); }
      return true;
    }
  }
  return false;
}
// MLG effects only ever play here: in the killcam, right as the shot connects.
function playVerdict(res) {
  hitmarker();
  if (res && res.ok) {
    showPopup('TRICKSHOT!', res.breakdown.map(([label, m]) => `${label} ×${+m.toFixed(2)}`), res.score);
    mlg(res);
    feed(`[${res.weapon === 'knife' ? 'Knife' : 'Intervention'}] ${res.headshot ? '☠ ' : ''}Dummy  +${res.score.toLocaleString()}`);
  } else {
    showPopup('REJECTED', [(res && res.message) || 'Killcam rejected.'], null);
  }
}
function showSummary() {
  mode = 'summary';
  // keep what's needed to re-render the killcam as a video (dropped when the next round starts)
  lastKill = { r: { ...roundEnd }, hist: history.slice(), res: roundEnd.result };
  $('dl-killcam').style.display = 'inline-block';
  $('dl-killcam').textContent = videoSupported() ? 'Download killcam (.webm)' : 'Video export needs a newer browser';
  $('killcam').style.display = 'none';
  const res = roundEnd.result || { ok: false, message: 'No verdict from the host.' };
  $('ro-score').textContent = res.ok ? `${res.score.toLocaleString()} pts` : 'Killcam rejected';
  $('ro-lines').innerHTML = res.ok ? res.breakdown.map(([l, m]) => `<div>${l} <b>×${+m.toFixed(2)}</b></div>`).join('') : '';
  $('ro-msg').textContent = (res.coins_earned ? `+${res.coins_earned} coins (${res.coins} total). ` : '') +
    (res.flag ? 'Host: "ok that was actually insane"' : (res.message || ''));
  $('ro-flag').textContent = res.flag || '';
  $('ro-flag').style.display = res.flag ? 'block' : 'none';
  if (res.flag) {
    $('flag').textContent = res.flag;
    $('flagbox').style.display = 'block';
  }
  $('ro-attempts').textContent = `This round: ${attempts.shots} shots · ${attempts.throws} knife throws · ${attempts.deaths} deaths`;
  $('roundover').style.display = 'flex';
  document.exitPointerLock();
}
function nextRound() {
  chase = false;
  attempts.shots = attempts.throws = attempts.deaths = 0;
  lastKill = null;
  $('dl-killcam').style.display = 'none';
  $('roundover').style.display = 'none';
  $('tricks').style.visibility = 'visible';
  roundEnd = null;
  kc = null;
  mode = 'play';
  history.length = 0;
  clearKnives();
  respawn();
  newSession();
  renderer.domElement.requestPointerLock();
}

// ================= HUD =================
let statusTimer, toastTimer, popupTimer;
function setStatus(msg) {
  $('status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => ($('status').textContent = ''), 6000);
}
function toast(msg) {
  $('toast').textContent = msg;
  $('toast').style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').style.opacity = 0), 1800);
}
function showPopup(title, lines, total) {
  $('popup').innerHTML = `<h1>${title}</h1>` + lines.map((l) => `<div class="line">${l}</div>`).join('') +
    (total == null ? '' : `<div class="total">+${total.toLocaleString()}</div>`);
  $('popup').style.opacity = 1;
  clearTimeout(popupTimer);
  popupTimer = setTimeout(() => ($('popup').style.opacity = 0), 4000);
}
function feed(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  $('killfeed').prepend(el);
  setTimeout(() => el.remove(), 6000);
}
function hitmarker() {
  sfxHit();
  $('hitmarker').style.opacity = 1;
  setTimeout(() => ($('hitmarker').style.opacity = 0), 140);
}
let wasScoped = false;
function updateHud() {
  const air = !!trickLog;
  const spins = trick.spins + Math.floor(trick.runAmt / (Math.PI * 2));
  const deg = Math.round(THREE.MathUtils.radToDeg(trick.runAmt) % 360);
  const dirs = trick.dirs | (trick.runAmt >= Math.PI * 2 ? (trick.runDir > 0 ? 1 : 2) : 0);
  const row = (on, text) => `<div class="${on ? 'on' : 'off'}">${text}</div>`;
  $('tricks').innerHTML =
    row(air, `Mid-air ${air ? '✔ ' + (now() - trick.start).toFixed(1) + 's' : '✘'}`) +
    row(spins, `360s: ${spins} <small>(+${deg}°)</small>`) +
    row(dirs === 3, `Reverse 360 ${dirs === 3 ? '✔' : '✘'}`) +
    row(trick.swaps, `Swaps: ${trick.swaps}`) +
    row(trick.scopeIns, `Scope-ins: ${trick.scopeIns}`) +
    row(trick.tags, `Deagle tags: ${trick.tags}`) +
    row(air && !trick.knifeUsed, `Knife: ${trick.knifeUsed ? 'thrown' : 'ready'}`);
  $('hud-attempts').textContent = `Shots ${attempts.shots} · Knives ${attempts.throws} · Deaths ${attempts.deaths}`;
  const cur = view ? view.cur : weapon.current, ads = view ? view.ads : weapon.ads;
  const sniper = cur === 'sniper';
  $('weapon').innerHTML = `${sniper ? 'Intervention' : 'Desert Eagle'}<small>${keyName(settings.keys.swap)} swap · ${keyName(settings.keys.knife)} knife · ${keyName(settings.keys.tac)} tac insert</small>`;
  const scoped = sniper && ads >= 1 && !(mode === 'killcam' && chase);
  if (scoped && !wasScoped) {                                    // zoom-in pop each time you scope
    $('scope').classList.remove('pop'); void $('scope').offsetWidth; $('scope').classList.add('pop');
  }
  wasScoped = scoped;
  $('scope').style.display = scoped ? 'block' : 'none';
  $('crosshair').style.display = sniper ? 'none' : 'block';
  gun.visible = !scoped && !(mode === 'killcam' && chase);
}

// ================= AUDIO =================
let actx, master;
function noise(dur, vol, freq) {
  if (!actx) return;
  const buf = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = actx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}
function sfxShot(sniper) { noise(sniper ? 0.5 : 0.18, sniper ? 0.9 : 0.5, sniper ? 1800 : 3000); }
function sfxKnife() { noise(0.18, 0.35, 5000); }
function sfxFlare() { noise(0.12, 0.5, 6000); setTimeout(() => noise(1.2, 0.18, 1400), 90); }
function sfxHit() {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = 1900;
  g.gain.setValueAtTime(0.25, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.08);
  o.connect(g).connect(master);
  o.start();
  o.stop(actx.currentTime + 0.09);
}

// Sound clips (loaded once the AudioContext exists)
const clips = {};
async function loadClips() {
  for (const name of ['airhorn', 'mom-get-the-camera']) {
    try {
      const buf = await (await fetch(`/sfx/${name}.mp3`)).arrayBuffer();
      clips[name] = await actx.decodeAudioData(buf);
    } catch { /* fall back to synth */ }
  }
}
function playClip(name, delay = 0, vol = 0.8) {
  if (!actx || !clips[name]) return false;
  const src = actx.createBufferSource();
  src.buffer = clips[name];
  const g = actx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start(actx.currentTime + delay);
  return true;
}

// Synth airhorn fallback: stacked detuned saws, "BWA BWA BWA BWAAAAA"
function airhorn(start, len) {
  const t0 = actx.currentTime + start;
  const out = actx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
  out.gain.setValueAtTime(0.35, t0 + len - 0.05);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.connect(out).connect(master);
  for (const [f, det] of [[466, 0], [466, 12], [554, -8], [698, 5], [233, 0]]) {
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.94, t0);
    o.frequency.linearRampToValueAtTime(f, t0 + 0.06);
    o.detune.value = det;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + len + 0.02);
  }
}

// ================= MLG MODE =================
const MLG_WORDS = ['360 NO SCOPE', 'REKT', 'OH BABY A TRIPLE', 'WOW', 'GET NOSCOPED', 'MOM GET THE CAMERA',
  'SHREKT', '#MLG', 'FAZE UP', '1V1 ME BRO', 'SKRRT', 'CLIP IT', 'HIGHRISE GOD', 'GG EZ', 'TRICKSHOT KING'];
function mlg(stats) {
  const layer = $('mlg');
  const spawn = (cls, css, life) => {
    const el = document.createElement('div');
    el.className = cls;
    Object.assign(el.style, css);
    layer.appendChild(el);
    setTimeout(() => el.remove(), life);
  };
  if (actx) {
    if (!playClip('airhorn')) {
      [0, 0.22, 0.44].forEach((s) => airhorn(s, 0.16));
      airhorn(0.68, 0.9);
    }
    for (let i = 0; i < 14; i++) setTimeout(sfxHit, i * 70);
    if (playClip('mom-get-the-camera', 0.9)) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'mlg-word';
        el.textContent = 'MOM GET THE CAMERA';
        Object.assign(el.style, { left: '50%', top: '45%', fontSize: '64px', color: '#ffd23f', marginLeft: '-330px' });
        el.style.setProperty('--r', '-6deg');
        layer.appendChild(el);
        setTimeout(() => el.remove(), 1700);
      }, 900);
    }
  }
  document.body.classList.add('mlg-shake');
  setTimeout(() => document.body.classList.remove('mlg-shake'), 1300);
  spawn('mlg-tri', {}, 2500);
  const words = [...MLG_WORDS];
  if (stats.weapon === 'knife') words.push('KNIFE TRICKSHOT', 'YEET');
  else if (stats.spins) words.push(`${stats.spins * 360} ${stats.scope === 'noscope' ? 'NO SCOPE' : 'QUICKSCOPE'}`);
  for (let i = 0; i < 16; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'mlg-word';
      el.textContent = words[Math.floor(Math.random() * words.length)];
      Object.assign(el.style, {
        left: `${2 + Math.random() * 65}%`, top: `${5 + Math.random() * 80}%`,
        color: `hsl(${Math.random() * 360} 100% 60%)`, fontSize: `${28 + Math.random() * 40}px`,
      });
      el.style.setProperty('--r', `${Math.random() * 40 - 20}deg`);
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1700);
    }, i * 110);
  }
  for (let i = 0; i < 30; i++) {
    setTimeout(() => spawn('mlg-hit', { left: `${Math.random() * 95}%`, top: `${Math.random() * 90}%` }, 600), i * 45);
  }
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.className = 'mlg-chip';
    el.style.left = `${Math.random() * 100}%`;
    el.style.setProperty('--d', `${1.2 + Math.random() * 1.6}s`);
    el.style.setProperty('--spin', `${Math.random() * 1440 - 720}deg`);
    el.style.animationDelay = `${Math.random() * 0.8}s`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }
}

// ================= SETTINGS =================
const DEFAULT_SETTINGS = {
  sens: 5, fov: 75, volume: 0.7, invertY: false, ads: 'hold',
  keys: { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space',
          sprint: 'ShiftLeft', swap: 'KeyQ', knife: 'KeyG', tac: 'KeyT', respawn: 'KeyR' },
};
const BIND_LABELS = { forward: 'Forward', back: 'Back', left: 'Left', right: 'Right', jump: 'Jump', knife: 'Throwing knife', tac: 'Tactical insertion',
  sprint: 'Sprint', swap: 'Weapon swap', respawn: 'Respawn' };
let settings = structuredClone(DEFAULT_SETTINGS);
try {
  const saved = JSON.parse(localStorage.getItem('highrise-settings') || '{}');
  settings = { ...settings, ...saved, keys: { ...settings.keys, ...(saved.keys || {}) } };
} catch { /* no storage */ }
function saveSettings() {
  try { localStorage.setItem('highrise-settings', JSON.stringify(settings)); } catch { /* no storage */ }
}
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace(/Left$|Right$/, (m) => ` ${m[0]}`);
let rebinding = null;
function renderSettings() {
  $('set-sens').value = settings.sens; $('val-sens').textContent = Number(settings.sens).toFixed(2);
  $('set-vol').value = settings.volume; $('val-vol').textContent = `${Math.round(settings.volume * 100)}%`;
  $('set-fov').value = settings.fov; $('val-fov').textContent = settings.fov;
  $('set-invert').checked = settings.invertY;
  $('set-ads').value = settings.ads;
  $('binds').innerHTML = Object.entries(BIND_LABELS).map(([action, label]) =>
    `<tr><td>${label}</td><td><button class="bind${rebinding === action ? ' listening' : ''}" data-action="${action}">` +
    `${rebinding === action ? 'Press a key…' : keyName(settings.keys[action])}</button></td></tr>`).join('');
}
$('set-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; saveSettings(); renderSettings(); });
$('set-fov').addEventListener('input', (e) => { settings.fov = +e.target.value; saveSettings(); renderSettings(); });
$('set-vol').addEventListener('input', (e) => {
  settings.volume = +e.target.value;
  if (master) master.gain.value = settings.volume;
  saveSettings();
  renderSettings();
});
$('set-invert').addEventListener('change', (e) => { settings.invertY = e.target.checked; saveSettings(); });
$('set-ads').addEventListener('change', (e) => { settings.ads = e.target.value; saveSettings(); });
$('binds').addEventListener('click', (e) => {
  const b = e.target.closest('.bind');
  if (b) { rebinding = b.dataset.action; renderSettings(); }
});
$('reset-settings').addEventListener('click', () => { settings = structuredClone(DEFAULT_SETTINGS); rebinding = null; saveSettings(); renderSettings(); });
renderSettings();

// ================= COINS + PERK SHOP =================
// Accepted trickshots earn coins (tracked by the host). Perks nudge CONFIG values a little.
let playerId;
try {
  playerId = localStorage.getItem('highrise-player');
  if (!/^[0-9a-f]{32}$/.test(playerId || '')) {
    playerId = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('highrise-player', playerId);
  }
} catch {
  playerId = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const shop = { coins: 0, perks: {}, catalog: {}, maxTier: 5, camos: [], camo: null, camoCatalog: {} };
const fmt = (v) => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2));
const tierOf = (id) => shop.perks[id] || 0;
const perkValue = (p, tier) => BASE_CONFIG[p.key] * p.mult ** tier;
function applyPerks() {
  for (const [id, p] of Object.entries(shop.catalog)) if (p.key) CONFIG[p.key] = perkValue(p, tierOf(id));
}
function renderShop() {
  $('coins').textContent = shop.coins;
  $('hud-coins').textContent = `${shop.coins.toLocaleString()} coins`;
  $('shop').innerHTML = Object.entries(shop.catalog).map(([id, p]) => {
    const maxT = p.max || shop.maxTier, tier = tierOf(id), maxed = tier >= maxT, price = p.cost * 2 ** tier;
    const pips = '■'.repeat(tier) + '□'.repeat(maxT - tier);
    const btn = maxed ? '<span class="owned">Maxed</span>'
      : `<button class="bind buy" data-perk="${id}" ${shop.coins < price ? 'disabled' : ''}>Tier ${tier + 1} · ${price}</button>`;
    const fx = !p.key ? p.desc : maxed ? `${p.key} ${fmt(perkValue(p, tier))}` : `${p.key} ${fmt(perkValue(p, tier))} → ${fmt(perkValue(p, tier + 1))}`;
    return `<tr><td><b>${p.name}</b> <span class="pips">${pips}</span></td><td class="perk-fx">${fx}</td><td>${btn}</td></tr>`;
  }).join('');
  const camoRow = (id, name, cost) => {
    const owned = id === null || shop.camos.includes(id), on = shop.camo === id;
    const btn = on ? '<span class="owned">Equipped</span>'
      : owned ? `<button class="bind camo" data-camo="${id ?? ''}" data-act="equip">Equip</button>`
      : `<button class="bind camo" data-camo="${id}" data-act="buy" ${shop.coins < cost ? 'disabled' : ''}>Buy · ${cost}</button>`;
    return `<tr><td><span class="swatch" style="background-image:url(${camoSwatch(id || 'none')})"></span> <b>${name}</b></td><td>${btn}</td></tr>`;
  };
  $('camo-shop').innerHTML = camoRow(null, 'None', 0) +
    Object.entries(shop.camoCatalog).map(([id, c]) => camoRow(id, c.name, c.cost)).join('');
}
$('camo-shop').addEventListener('click', async (e) => {
  const b = e.target.closest('.camo');
  if (!b) return;
  const j = await (await fetch('/api/camo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: playerId, camo: b.dataset.camo || null, action: b.dataset.act }) })).json();
  if (j.ok) { Object.assign(shop, { coins: j.coins, camos: j.camos, camo: j.camo }); setCamo(shop.camo); }
  renderShop();
});
async function loadWallet() {
  try {
    const j = await (await fetch(`/api/wallet?player=${playerId}`)).json();
    Object.assign(shop, { coins: j.coins, perks: j.perks, catalog: j.catalog, maxTier: j.max_tier,
      camos: j.camos || [], camo: j.camo || null, camoCatalog: j.camo_catalog || {} });
    setCamo(shop.camo);
    applyPerks();
    renderShop();
  } catch { /* shop unavailable */ }
}
$('redeem-btn').addEventListener('click', async () => {
  const code = $('redeem-code').value.trim();
  if (!code) return;
  try {
    const j = await (await fetch('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: playerId, code }) })).json();
    $('redeem-msg').textContent = j.ok ? `+${j.amount} coins!` : j.message;
    $('redeem-msg').style.color = j.ok ? '#b6f06a' : '#ff8a7a';
    if (j.ok) { shop.coins = j.coins; renderShop(); $('redeem-code').value = ''; }
  } catch { $('redeem-msg').textContent = 'Shop unavailable.'; }
});
$('redeem-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('redeem-btn').click(); });
$('shop').addEventListener('click', async (e) => {
  const b = e.target.closest('.buy');
  if (!b) return;
  const j = await (await fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: playerId, perk: b.dataset.perk }) })).json();
  if (j.ok) { shop.coins = j.coins; shop.perks = j.perks; applyPerks(); }
  renderShop();
});
loadWallet();

// ================= INPUT =================
const keys = {};
const inputQueue = [];
let jumpQueued = false, locked = false, adsIntent = false;
$('play').addEventListener('click', () => {
  if (!actx) {
    actx = new AudioContext();
    master = actx.createGain();
    master.gain.value = settings.volume;
    master.connect(actx.destination);
    loadClips();
  }
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  $('menu').style.display = locked || mode !== 'play' ? 'none' : 'flex';
  if (!locked) { if (adsIntent) inputQueue.push('u'); adsIntent = false; for (const k in keys) keys[k] = false; }
});
addEventListener('keydown', (e) => {
  if (rebinding) {
    e.preventDefault();
    if (e.code !== 'Escape') {
      // Swap with any action already using this key
      for (const a in settings.keys) if (settings.keys[a] === e.code) settings.keys[a] = settings.keys[rebinding];
      settings.keys[rebinding] = e.code;
      saveSettings();
    }
    rebinding = null;
    renderSettings();
    return;
  }
  if (!locked || mode !== 'play') return;
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  const k = settings.keys;
  if (e.code === k.jump) jumpQueued = true;
  if (e.code === k.swap && !e.repeat) inputQueue.push('s');
  if (e.code === k.knife && !e.repeat) inputQueue.push('k');
  if (e.code === k.respawn) respawn();
  if (e.code === k.tac && !e.repeat) placeTac();
});
addEventListener('keyup', (e) => (keys[e.code] = false));
addEventListener('mousemove', (e) => {
  if (!locked || mode !== 'play') return;
  const s = CONFIG.MOUSE_SENSITIVITY * settings.sens;
  pendingYaw -= e.movementX * s;
  pendingPitch -= e.movementY * s * (settings.invertY ? -1 : 1);
});
addEventListener('mousedown', (e) => {
  if (!locked || mode !== 'play') return;
  if (e.button === 0) inputQueue.push('f');
  if (e.button === 2) {
    adsIntent = settings.ads === 'toggle' ? !adsIntent : true;
    inputQueue.push(adsIntent ? 'd' : 'u');
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 2 && settings.ads === 'hold' && locked) { adsIntent = false; inputQueue.push('u'); }
});
addEventListener('wheel', () => locked && mode === 'play' && inputQueue.push('s'));
$('next-round').addEventListener('click', nextRound);
addEventListener('contextmenu', (e) => e.preventDefault());

// ================= LOOP =================
const clock = new THREE.Clock();
let elapsed = 0;
const now = () => elapsed;

// ---- Aimbot perk: steers your aim onto the dummy (through the normal, logged mouse input) ----
const hasAimbot = () => (shop.perks.aimbot || 0) > 0;
let aimLock = null;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
let lastDt = 1 / 60;
// Exact knife pitch: bisection over the same step-by-step physics the knife uses (KNIFE.STEP, gravity
// applied each step), so the arc lands on the target point.
function knifePitchFor(o, t, high = false) {
  const d = Math.hypot(t.x - o.x, t.z - o.z), want = t.y - o.y;
  const h = KNIFE.STEP, s = CONFIG.KNIFE_SPEED, g = CONFIG.KNIFE_GRAVITY;
  const heightAt = (p) => {
    let x = 0, y = 0, vx = s * Math.cos(p), vy = s * Math.sin(p);
    for (let i = 0; i < KNIFE.MAX_TIME / h; i++) {
      vy -= g * h;
      const nx = x + vx * h, ny = y + vy * h;
      if (nx >= d) return y + (ny - y) * ((d - x) / (nx - x));
      x = nx; y = ny;
    }
    return -1e9;
  };
  if (heightAt(0.78) < want) return 0.78;                           // out of range: throw as far as it goes
  if (high) {                                                       // high lob: 0.78 .. 1.5, height falls as pitch rises
    let lo = 0.78, hi = 1.5;
    for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (heightAt(m) >= want) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  let lo = -1.5, hi = 0.78;                                         // low arc
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (heightAt(m) < want) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// ---- Knife aimbot planner: real knife physics (bounces included) from where you'll be on release ----
// fastKnife() gives exactly the same result as simulateKnife() (same steps, same "first box in list
// order" rule), it just looks boxes up in a 4 m grid instead of scanning all of them.
const KCELL = 4, kGrid = new Map();
const kKey = (x, z) => Math.floor(x / KCELL) * 100003 + Math.floor(z / KCELL);
MAP.colliders.forEach((b, i) => {
  for (let x = Math.floor(b[0] / KCELL); x <= Math.floor(b[3] / KCELL); x++)
    for (let z = Math.floor(b[2] / KCELL); z <= Math.floor(b[5] / KCELL); z++) {
      const k = x * 100003 + z;
      if (!kGrid.has(k)) kGrid.set(k, []);
      kGrid.get(k).push(i);
    }
});
function fastKnife(o, dir, bot) {
  const h = KNIFE.STEP, speed = CONFIG.KNIFE_SPEED, gravity = CONFIG.KNIFE_GRAVITY, bounce = CONFIG.KNIFE_BOUNCE;
  let p = [o[0], o[1], o[2]];
  const v = [dir[0] * speed, dir[1] * speed, dir[2] * speed];
  let bounces = 0, wallHits = 0;
  for (let i = 0, steps = Math.floor(KNIFE.MAX_TIME / h); i < steps; i++) {
    v[1] -= gravity * h;
    const q = [p[0] + v[0] * h, p[1] + v[1] * h, p[2] + v[2] * h];
    const sx = q[0] - p[0], sy = q[1] - p[1], sz = q[2] - p[2], L = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (bot && L > 0) { const hit = rayBot(p, [sx / L, sy / L, sz / L], bot, L); if (hit) return { hit: hit.part, wallHits }; }
    let box = null;
    const list = kGrid.get(kKey(q[0], q[2]));
    if (list) for (const idx of list) {
      const b = MAP.colliders[idx];
      if (q[0] > b[0] && q[0] < b[3] && q[1] > b[1] && q[1] < b[4] && q[2] > b[2] && q[2] < b[5]) { box = b; break; }
    }
    if (box) {
      let any = false, wall = false;
      for (let a = 0; a < 3; a++) if (p[a] <= box[a] || p[a] >= box[a + 3]) { v[a] = -v[a] * bounce; any = true; if (a !== 1) wall = true; }
      if (!any) break;
      bounces++;
      if (wall) wallHits++;
      if (bounces > KNIFE.MAX_BOUNCES) break;
    } else p = q;
    if (p[1] < -60 || Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) < KNIFE.MIN_SPEED) break;
  }
  return { hit: null, wallHits };
}
const aimDirArr = (yw, p) => { const cp = Math.cos(p); return [-Math.sin(yw) * cp, Math.sin(p), -Math.cos(yw) * cp]; };
function eyeIn(t) {                                                 // where your eye will be t seconds from now
  const g = player.grounded ? 0 : CONFIG.GRAVITY;
  return [player.pos.x + player.vel.x * t, player.pos.y + EYE + player.vel.y * t - 0.5 * g * t * t, player.pos.z + player.vel.z * t];
}
let knifePlan = null;
function planKnife(o, prev) {
  const T = { x: botInfo.x, y: botInfo.y + 1.72, z: botInfo.z };
  const baseYaw = Math.atan2(-(T.x - o[0]), -(T.z - o[2]));
  let best = null, bestScore = -Infinity;
  const tryAim = (yw, p) => {
    p = THREE.MathUtils.clamp(p, -1.55, 1.55);
    const r = fastKnife(o, aimDirArr(yw, p), botInfo);
    const score = (r.hit ? 1000 + (r.hit === 'head' ? 100 : 0) + r.wallHits * 10 : 0) - Math.abs(wrapAngle(yw - baseYaw));
    if (score > bestScore) { bestScore = score; best = { yaw: yw, pitch: p, hit: r.hit, walls: r.wallHits }; }
  };
  if (prev) {                                                       // small refinement around last frame's plan
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) tryAim(prev.yaw + a * 0.004, prev.pitch + b * 0.004);
    if (best.hit) return best;
  }
  const o3 = { x: o[0], y: o[1], z: o[2] };
  tryAim(baseYaw, knifePitchFor(o3, T, false));                    // direct low arc
  tryAim(baseYaw, knifePitchFor(o3, T, true));                     // direct high lob
  if (best.hit) return best;
  for (let a = -20; a <= 20; a++)                                   // blocked: look for a bank shot off the walls
    for (let p = -0.4; p <= 1.3; p += 0.04) tryAim(baseYaw + a * (Math.PI / 60), p);
  return best;
}
const knifeWillHit = () => !!(botInfo && fastKnife([player.pos.x, player.pos.y + EYE, player.pos.z], aimDirArr(yaw, pitch), botInfo).hit);

// Where to aim from a given eye position: head when scoped (or for knives), chest otherwise.
function aimbotTarget(forKnife, predict) {
  if (!bot.alive || !botInfo) return null;
  const dt = predict ? lastDt : 0;
  const o = { x: player.pos.x + player.vel.x * dt, y: player.pos.y + EYE + (player.grounded ? 0 : (player.vel.y - CONFIG.GRAVITY * dt) * dt),
              z: player.pos.z + player.vel.z * dt };
  const scoped = weapon.current === 'sniper' && weapon.adsHeld && weapon.ads >= 1;
  const t = { x: botInfo.x, y: botInfo.y + (forKnife || scoped ? 1.72 : 1.2), z: botInfo.z };
  const dx = t.x - o.x, dz = t.z - o.z;
  const p = forKnife ? knifePitchFor(o, t, false) : Math.atan2(t.y - o.y, Math.hypot(dx, dz));
  return { yaw: Math.atan2(-dx, -dz), pitch: THREE.MathUtils.clamp(p, -1.55, 1.55) };
}
function aimbotLocked(forKnife) {
  const t = aimbotTarget(forKnife, false);                          // from exactly where you are right now
  return t && Math.abs(wrapAngle(t.yaw - yaw)) < 0.002 && Math.abs(t.pitch - pitch) < 0.002;
}
function aimbotStep() {
  if (!hasAimbot() || (!aimLock && !weapon.knifePending)) return;
  if (weapon.knifePending) {                                        // knife: plan for the release moment
    if (!bot.alive || !botInfo) return;
    const tRel = Math.max(lastDt, weapon.knifeWind + KNIFE_WINDUP - now());
    knifePlan = planKnife(eyeIn(tRel), knifePlan);
    if (knifePlan) { pendingYaw = wrapAngle(knifePlan.yaw - yaw); pendingPitch = knifePlan.pitch - pitch; }
    return;
  }
  const tgt = aimbotTarget(weapon.knifePending, true);              // steer toward where you'll be next frame
  if (tgt) { pendingYaw = wrapAngle(tgt.yaw - yaw); pendingPitch = tgt.pitch - pitch; }
  if (aimLock && (!tgt || aimbotLocked(false) || now() > aimLock.until)) { aimLock = null; inputQueue.unshift('F'); }
}

// Frame order matters: the host replays inputs -> look -> move -> scope exactly like this.
function update(dt) {
  lastDt = dt;
  // Jump = take off at the start of this frame, so a knife/shot on the same frame counts as mid-air.
  if (jumpQueued && player.grounded) {
    player.vel.y = CONFIG.JUMP_VELOCITY;
    player.grounded = false;
    resetTrick();
    startLog(now() - dt);
  }
  jumpQueued = false;
  const wasInAir = inAir();
  if (trickLog) { frameRec = [dt, []]; trickLog.frames.push(frameRec); }

  aimbotStep();
  // 1. Inputs, in the order they happened
  for (const ev of inputQueue.splice(0)) {
    if (ev === 's') { logEvent('s'); swapWeapon(); }
    else if (ev === 'd') { logEvent('d'); if (weapon.current === 'sniper') { weapon.adsHeld = true; weapon.adsPress = now(); } }
    else if (ev === 'u') { logEvent('u'); weapon.adsHeld = false; }
    else if (ev === 'f') {
      if (hasAimbot() && bot.alive && !aimLock) aimLock = { until: now() + 1.2 };   // lock on first
      else if (!aimLock) fire();
    }
    else if (ev === 'F') fire();
    else if (ev === 'k' && !weapon.knifePending) { weapon.knifePending = true; weapon.knifeWind = now(); knifePlan = null; }   // wind up
  }
  // Release the knife once the wind-up is done (this is when the throw actually happens/is logged)
  if (weapon.knifePending && now() - weapon.knifeWind >= KNIFE_WINDUP &&
      (!hasAimbot() || !bot.alive || knifeWillHit() || now() - weapon.knifeWind > KNIFE_WINDUP + 0.4)) {
    weapon.knifePending = false;
    throwKnife();
  }

  // 2. Look — turn rate is capped so you can't spin faster than MAX_TURN_RATE
  const raw = pendingYaw;
  pendingYaw = 0;
  const maxTurn = THREE.MathUtils.degToRad(CONFIG.MAX_TURN_RATE) * dt;
  const dYaw = THREE.MathUtils.clamp(raw, -maxTurn, maxTurn);
  yaw += dYaw;
  pitch = THREE.MathUtils.clamp(pitch + pendingPitch, -1.55, 1.55);
  pendingPitch = 0;
  if (trickLog) { addSpin(dYaw); frameRec.push(raw, pitch); }

  // Move
  const kb = settings.keys;
  const fwd = (keys[kb.forward] ? 1 : 0) - (keys[kb.back] ? 1 : 0);
  const strafe = (keys[kb.right] ? 1 : 0) - (keys[kb.left] ? 1 : 0);
  const speed = keys[kb.sprint] ? CONFIG.SPRINT_SPEED : CONFIG.MOVE_SPEED;
  if (trickLog) {
    frameRec.push((keys[kb.forward] ? 1 : 0) | (keys[kb.back] ? 2 : 0) | (keys[kb.left] ? 4 : 0) |
      (keys[kb.right] ? 8 : 0) | (keys[kb.sprint] ? 16 : 0));
  }
  const wish = new THREE.Vector3(
    -Math.sin(yaw) * fwd + Math.cos(yaw) * strafe, 0,
    -Math.cos(yaw) * fwd - Math.sin(yaw) * strafe);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

  const wasGrounded = player.grounded;
  if (player.grounded) {
    player.vel.x = wish.x;
    player.vel.z = wish.z;
  } else if (wish.lengthSq() > 0) {
    const k = 1 - Math.exp(-1.5 * dt);
    player.vel.x += (wish.x - player.vel.x) * k;
    player.vel.z += (wish.z - player.vel.z) * k;
  }
  // Ladder: hold forward to climb, otherwise slide down slowly. No tricks while on it.
  player.onLadder = ladders.some(overlaps);
  if (player.onLadder) {
    if (fwd > 0) { player.vel.x = 0; player.vel.z = 0; }   // grab on: holding forward sticks you to the ladder
    player.vel.y = fwd > 0 ? 4.5 : Math.max(player.vel.y - CONFIG.GRAVITY * dt, -2);
    resetTrick();
  } else player.vel.y -= CONFIG.GRAVITY * dt;

  moveHorizontal('x', player.vel.x * dt);
  moveHorizontal('z', player.vel.z * dt);
  moveVertical(player.vel.y * dt);
  // Stick to the ground when walking down ramps/stairs (not after a jump or off a real ledge).
  if (wasGrounded && !player.grounded && player.vel.y <= 0 && !player.onLadder) {
    let best = -Infinity;
    for (const b of colliders) {
      const p = player.pos;
      if (p.x + R > b.min.x && p.x - R < b.max.x && p.z + R > b.min.z && p.z - R < b.max.z &&
          b.max.y <= p.y + 1e-4 && b.max.y >= p.y - 0.35 && b.max.y > best) best = b.max.y;
    }
    if (best > -Infinity) { player.pos.y = best; player.grounded = true; player.vel.y = 0; }
  }

  const nowInAir = inAir();
  if (!wasInAir && nowInAir) { resetTrick(); startLogAtEnd = true; }  // took off: new trick
  if (wasInAir && !nowInAir) resetTrick();                           // landed / grabbed a ladder
  if (player.pos.y < CONFIG.KILL_PLANE) respawn('You fell to your death');

  // Weapon / ADS
  const canAds = weapon.adsHeld && weapon.current === 'sniper' && now() >= weapon.swapEnd;
  const prevAds = weapon.ads;
  weapon.ads = THREE.MathUtils.clamp(weapon.ads + (canAds ? dt : -2 * dt) / CONFIG.ADS_TIME, 0, 1);
  if (trickLog && prevAds < 1 && weapon.ads >= 1) trick.scopeIns++;
  weapon.recoil = Math.max(0, weapon.recoil - dt * 6);
  const v = liveView();
  applyView(v);
  history.push({ t: now(), ...v, ev: frameEvents.splice(0) });
  while (history.length && history[0].t < now() - 20) history.shift();
  if (startLogAtEnd) { startLog(); startLogAtEnd = false; }
}

let placeDip = 0;
function liveView() {
  const swapDip = now() < weapon.swapEnd ? Math.sin(((weapon.swapEnd - now()) / CONFIG.SWAP_TIME) * Math.PI) * 0.35 : 0;
  const thr = THREE.MathUtils.clamp((now() - weapon.knifeWind) / 0.6, 0, 1);
  const bolt = weapon.current === 'sniper' ? THREE.MathUtils.clamp((now() - weapon.lastShot) / Math.max(0.2, CONFIG.SNIPER_FIRE_DELAY), 0, 1) : 1;
  return { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw, pitch, cur: weapon.current,
    ads: weapon.ads, dip: swapDip + placeDip, recoil: weapon.recoil, bolt, thr, qs: weapon.lastScope === 'quickscope' ? 1 : 0 };
}
// Throwing-knife viewmodel: snaps up to the right shoulder, whips forward in an arc, lets go.
const handKnife = makeKnifeMesh();
handKnife.visible = false;
camera.add(handKnife);
function poseThrow(thr) {
  // thr 0..1 over 0.6 s: 0..0.37 pull back and hold behind the shoulder, 0.37..0.5 whip forward
  // and let go, then the arm drops away.
  if (thr >= 1) { handKnife.visible = false; return 0; }
  const ease = (x) => x * x * (3 - 2 * x);
  const hold = KNIFE_WINDUP / 0.6;                              // ~0.37
  const back = ease(Math.min(1, thr / (hold * 0.6)));           // pull back quickly, then hold
  const shake = thr < hold ? Math.sin(thr * 90) * 0.006 * back : 0;
  const whip = ease(THREE.MathUtils.clamp((thr - hold) / 0.13, 0, 1));
  handKnife.visible = thr < hold + 0.1;                         // leaves the hand mid-swing
  handKnife.position.set(0.3 + 0.08 * back - 0.33 * whip + shake, -0.4 + 0.42 * back - 0.2 * whip, -0.42 + 0.3 * back - 0.7 * whip);
  handKnife.rotation.set(1.7 * back - 2.9 * whip, -0.35 + 0.2 * whip, 0.5 * back - 0.8 * whip);
  return Math.sin(Math.min(1, thr / 0.95) * Math.PI) * 0.34;   // gun ducks out of the way
}
// Puts the camera + viewmodel in a given state (live play or killcam playback).
let view = null;
function applyView(v) {
  view = v;
  sniperModel.visible = v.cur === 'sniper';
  pistolModel.visible = v.cur === 'pistol';
  const a = v.ads * v.ads * (3 - 2 * v.ads);                      // eased scope-in
  const b = v.bolt == null ? 1 : v.bolt;
  // Bolt cycle after a sniper shot: roll the rifle over, pull the bolt back, push it home.
  const cyc = v.cur === 'sniper' && b < 1 ? Math.sin(Math.min(1, b / 0.85) * Math.PI) : 0;
  const pull = b > 0.2 && b < 0.7 ? Math.sin(((b - 0.2) / 0.5) * Math.PI) : 0;
  boltHandle.position.z = 0.02 + pull * 0.12;
  boltHandle.rotation.z = pull * 0.9;
  // Quickscope: snap the rifle down and out right after the shot.
  const flick = v.qs && b < 0.3 ? Math.sin((b / 0.3) * Math.PI) : 0;
  const throwDip = poseThrow(v.thr == null ? 1 : v.thr);
  gun.position.set(0.26 * (1 - a) + 0.05 * cyc + 0.08 * flick, -0.24 + 0.1 * a - v.dip - throwDip - 0.07 * cyc - 0.12 * flick,
    -0.55 + 0.12 * a + v.recoil * 0.1 + 0.04 * cyc);
  gun.rotation.set(v.recoil * 0.22 - 0.5 * flick, 0.15 * flick, Math.sin(a * Math.PI) * 0.22 + 0.55 * cyc + 0.4 * flick);
  const targetFov = a >= 1 && v.cur === 'sniper' ? 16 : settings.fov - a * 20;
  if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  camera.position.set(v.x, v.y + EYE, v.z);
  camera.rotation.set(v.pitch - v.recoil * 0.03, v.yaw, 0);
}
function animateBot(T) {
  const p = bot.dieAt == null ? 0 : THREE.MathUtils.clamp((T - bot.dieAt) / 0.35, 0, 1);
  bot.group.rotation.x = p * Math.PI * 0.49;
  bot.marker.visible = p === 0;
  bot.marker.position.y = 3 + Math.sin(performance.now() / 300) * 0.2;
  bot.marker.rotation.y = performance.now() / 600;
}
function fadeTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.15);
    if (tr.life <= 0) { scene.remove(tr.line); tr.line.geometry.dispose(); tracers.splice(i, 1); }
  }
}

gameReady = true;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (rendering) return;                 // the killcam video renderer is using the scene
  if (mode === 'play') {
    if (locked) { elapsed += dt; update(dt); }
    if (!view) applyView(liveView());
    if (roundEnd && now() >= roundEnd.tHit + 0.4) startKillcam();
  } else if (mode === 'killcam') {
    stepKillcam(dt);
  }
  const T = mode === 'play' ? now() : kc.t;
  animateKnives(T);
  animateBot(T);
  animateFlare(dt);
  placeDip = animatePlacing(dt);
  fadeTracers(dt * (mode === 'killcam' ? kcSpeed(kc.t, roundEnd) : 1));
  updateHud();
  renderer.render(scene, camera);
});
