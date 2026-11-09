// node tests/scenic.js [url] — screenshots of every room (doors open, power on) for visual review.
const path = require('path');
const { launch } = require('./cdp');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const SHOTS = [
  ['spawn_mainframe', 49, 6, Math.PI / 2 + 0.4, 0, 0.1],
  ['spawn_gate_north', 36, -10, 0.35, 0, 0.15],
  ['spawn_west_fence', 31, 0, Math.PI / 2, 0, 0.1],
  ['spawn_pap', 40, 2, -Math.PI / 2, 1.3, 0.0],
  ['spawn_from_platform', 40, -2, Math.PI / 2 + 0.3, 1.3, 0.1],
  ['right_walkway_north', 44, -20, Math.PI / 2 + 0.2, 0, 0.1],
  ['right_walkway', 24, -4, 0.3, 0, 0.1],
  ['right_walkway_fabrik', 24, -12, Math.PI / 2, 0, 0.1],
  ['left_walkway', 12, 28, -2.6, 0, 0.1],
  ['left_walkway_south', 28, 21, -Math.PI / 2, 0, 0.1],
  ['garage', -12, -20, 2.6, 0, 0.1],
  ['garage_stairs', 2, -32, -1.6, 0, 0.1],
  ['balcony_right', -13, -22, 2.2, 3.5, -0.05],
  ['teleporter_b', -16, -22, 1.2, 3.5, 0.05],
  ['courtyard_generator', 6, 8, 0.9, 0, 0.1],
  ['courtyard_7c', 6, -8, 1.3, 0, 0.1],
  ['courtyard_bridge', -8, 12, -0.5, 0, 0.3],
  ['lab', 8, 34, 2.2, 0, 0.05],
  ['lab_cages', -2, 20, -2.6, 0, 0.0],
  ['teleporter_a', -16, 18, 1.0, 0, 0.05],
  ['hall_c', -16, 12, 1.0, 0, 0.15],
  ['hall_office', -20, 10, 0.9, 0, 0.2],
  ['teleporter_c', -38, 5, 1.6, 0, 0.05],
  ['catwalk', -34, -16, -1.4, 3.5, 0.0],
  ['trench', -45, 16, Math.PI, 0, 0.05],
];
async function main() {
  const b = await launch(URL, path.join(__dirname, 'shots_scenic'));
  const { evaluate, sleep, shot } = b;
  const ev = (e) => evaluate(e);
  if (!await ev('typeof ZMDEV !== "undefined"')) throw new Error('no dev hooks');
  await ev(`window.G = ZMDEV.game; window.P = () => ZMDEV.game.player;
    window.sim = (sec, keys = [], pressed = [], buttons = {}) => { const inp = { keys: new Set(keys), pressed: new Set(pressed), buttons: Object.assign({ 0: false, 2: false }, buttons), mouseDX: 0, mouseDY: 0, wheel: 0 }; const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { ZMDEV.game.update(1 / 60, inp); inp.pressed.clear(); } };
    window.tp = (x, z, yaw, y, pitch) => { const p = P(); p.pos.x = x; p.pos.z = z; p.pos.y = y === undefined ? G.map.floorHeight(x, z, 1000) : y; if (yaw !== undefined) p.yaw = yaw; p.pitch = pitch || 0; };
    ZMDEV.setState('paused'); G.reset(); G.roundState = 'idle'; G.zombies = []; for (const d of G.map.doors) d.open = true; G.map.gate.open = true; G.turnOnPower(); sim(5); G.hud.toasts = []; G.hud.floats = []; true`);
  for (const [name, x, z, yaw, y, pitch] of SHOTS) {
    await ev(`tp(${x}, ${z}, ${yaw}, ${y}, ${pitch}); G.hud.toasts = []; G.hud.banner = null; ZMDEV.setState('playing')`);
    await sleep(300);
    await shot(name);
    await ev(`ZMDEV.setState('paused')`);
  }
  const errs = b.errors();
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  console.log('draw calls', await ev('ZMDEV.renderer.drawCalls'), 'chunks', await ev('G.stats.chunks'));
  b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
