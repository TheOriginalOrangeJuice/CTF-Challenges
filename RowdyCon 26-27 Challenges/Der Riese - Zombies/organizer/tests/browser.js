// node tests/browser.js [url] [--shots] — drives headless Chromium over raw CDP (no npm deps).
// Loads the page, reports console errors/exceptions, runs scripted checks, saves screenshots.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME || path.join(os.homedir(), '.cache/ms-playwright/chromium-1140/chrome-linux/chrome');
const URL = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const OUT = process.env.SHOT_DIR || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const port = 9333 + Math.floor(Math.random() * 500);
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; chrome.stderr.on('data', d => { stderr += d; });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) { /* */ } try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* */ } };
  process.on('exit', cleanup);
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json`); targets = await r.json(); if (targets.length) break; } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!targets) { console.log('chrome did not start', stderr.slice(-2000)); process.exit(2); }
  const page = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  await sleep(2500);
  const errors = () => events.filter(e => (e.method === 'Runtime.exceptionThrown') || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map(e => e.method === 'Runtime.exceptionThrown' ? (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || e.params.exceptionDetails.text) : e.method === 'Log.entryAdded' ? e.params.entry.text : e.params.args.map(a => a.value || a.description).join(' '));
  let fails = 0;
  const check = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
  const errs0 = errors();
  check(errs0.length === 0, 'no console errors after load' + (errs0.length ? ': ' + errs0.join(' | ') : ''));
  await shot('01_menu');
  const hasDev = await evaluate('typeof window.ZMDEV !== "undefined"');
  console.log('dev hooks:', hasDev);
  if (!hasDev) {
    // distributed build: only verify it renders without errors and exposes nothing
    check(await evaluate('typeof ZM === "undefined" && typeof ZMDEV === "undefined"'), 'dist build exposes no globals');
    check(await evaluate('document.getElementById("gl").getContext("webgl") !== null'), 'webgl context present');
    await evaluate('document.dispatchEvent(new MouseEvent("click"))');
    await sleep(1500);
    await shot('dist_01_play');
    const e = errors(); check(e.length === 0, 'no errors while playing (dist)' + (e.length ? ': ' + e.join(' | ') : ''));
    cleanup(); console.log(fails ? `${fails} FAILURES` : 'ALL PASS'); process.exit(fails ? 1 : 0);
  }
  // ---- scripted play session via dev hooks ----
  await evaluate('ZMDEV.setState("playing"); ZMDEV.game.player.maxHealth = 1e6; ZMDEV.game.player.health = 1e6;');
  await sleep(1000);
  check(await evaluate('ZMDEV.game.renderer.drawCalls > 20'), 'scene draws (' + await evaluate('ZMDEV.game.renderer.drawCalls') + ' calls)');
  await shot('02_spawn');
  // walk forward & look around for a bit (simulate keys through the input object)
  await evaluate('ZMDEV.input.keys.add("KeyW")'); await sleep(700); await evaluate('ZMDEV.input.keys.delete("KeyW")');
  await evaluate('ZMDEV.input.mouseDX = 400'); await sleep(300);
  await shot('03_moved');
  // wait for round 1 to start and zombies to appear
  await evaluate('ZMDEV.game.roundTimer = 0.1'); await sleep(4000);
  const z = await evaluate('ZMDEV.game.zombies.length');
  check(z > 0, 'zombies spawned in round 1 (' + z + ')');
  check(await evaluate('ZMDEV.game.roundState') === 'active', 'round active');
  await evaluate('ZMDEV.input.mouseDX = -400'); await sleep(200);
  await shot('04_zombies');
  // let zombies reach the player; check that they can path (distance decreases)
  const d0 = await evaluate('Math.min(...ZMDEV.game.zombies.map(z => ZM.V.distXZ(z.pos, ZMDEV.game.player.pos)))');
  await sleep(6000);
  const d1 = await evaluate('Math.min(...ZMDEV.game.zombies.map(z => ZM.V.distXZ(z.pos, ZMDEV.game.player.pos)))');
  const states = await evaluate('ZMDEV.game.zombies.map(z => z.state).join(",")');
  console.log('zombie states:', states, 'nearest', d0.toFixed(1), '->', d1.toFixed(1));
  check(d1 < d0 || d1 < 3, 'zombies approach the player');
  await shot('05_approach');
  // shoot: aim at nearest zombie and fire
  await evaluate(`(() => { const g = ZMDEV.game, p = g.player; let best=null, bd=1e9; for (const z of g.zombies) { const d = ZM.V.distXZ(z.pos,p.pos); if (d<bd){bd=d;best=z;} } if (!best) return; const to = ZM.V.sub(best.chestPos(), p.eyePos()); p.yaw = Math.atan2(-to.x, -to.z); p.pitch = Math.atan2(to.y, Math.hypot(to.x,to.z)); })()`);
  const hp0 = await evaluate('ZMDEV.game.zombies.reduce((s,z)=>s+Math.max(0,z.hp),0)');
  for (let i = 0; i < 6; i++) { await evaluate('ZMDEV.input.pressed.add("Mouse0"); ZMDEV.input.buttons[0]=true'); await sleep(120); await evaluate('ZMDEV.input.buttons[0]=false'); await sleep(120); }
  const hp1 = await evaluate('ZMDEV.game.zombies.reduce((s,z)=>s+Math.max(0,z.hp),0)');
  console.log('zombie hp total', hp0, '->', hp1, 'shots', await evaluate('ZMDEV.game.player.shotsFired'), 'kills', await evaluate('ZMDEV.game.player.kills'));
  check(await evaluate('ZMDEV.game.player.shotsFired') > 0, 'weapon fires');
  await shot('06_shooting');
  // health/damage path
  await sleep(3000);
  console.log('player health', await evaluate('ZMDEV.game.player.health'), 'points', await evaluate('ZMDEV.game.player.points'));
  // test interaction prompt near a door
  await evaluate('(() => { const g = ZMDEV.game; g.player.pos.x = 32; g.player.pos.z = 15.1; g.player.pos.y = 0; g.player.yaw = Math.PI; })()');
  await sleep(200);
  const prompt = await evaluate('ZMDEV.game.player.interact ? ZMDEV.game.player.interact.text : "none"');
  console.log('door prompt:', prompt);
  check(/open/.test(prompt), 'door prompt appears');
  await evaluate('ZMDEV.game.player.points = 10000; ZMDEV.input.pressed.add("KeyF")'); await sleep(200);
  check(await evaluate('ZMDEV.game.map.doors.find(d => d.id === "D_L").open'), 'door opens with F');
  await shot('07_door');
  // teleport-ish checks: power + links + pap gate
  await evaluate(`(() => { const g = ZMDEV.game; g.turnOnPower(); for (const t of g.map.teleporters) { g.activateLink(t); g.completeLink(); } })()`);
  check(await evaluate('ZMDEV.game.map.gate.open'), 'PaP gate opens after 3 links');
  // vault: play rounds through the legitimate path quickly (clear zombies each round)
  const r0 = await evaluate('ZMDEV.game.round');
  await evaluate(`(() => { const g = ZMDEV.game; for (let i = 0; i < 3; i++) { g.advanceRound(); } })()`);
  check(await evaluate('ZMDEV.game.round') === r0 + 3 && await evaluate('ZMDEV.game.vault.round') === r0 + 3, 'advanceRound walks the chain');
  // forged: set round to 100 directly → vault rejects
  check(await evaluate('(() => { const v = new ZM.Vault(); v.round = 100; return v.open().ok; })()') === false, 'forged round rejected');
  // legit chain to 100
  const flagRes = await evaluate(`(() => { const g = ZMDEV.game; g.zombies = []; while (g.round < 100) g.advanceRound(); return JSON.stringify(g.flagResult); })()`);
  console.log('flag result', flagRes);
  check(JSON.parse(flagRes).ok === true, 'flag decrypts at round 100 via the real path');
  await sleep(500);
  check(await evaluate('ZMDEV.getState()') === 'flag', 'flag screen state');
  await shot('08_flag');
  const errsEnd = errors();
  check(errsEnd.length === 0, 'no console errors during session' + (errsEnd.length ? ': ' + errsEnd.join(' | ') : ''));
  // perf: measure frame time
  const fps = await evaluate('ZMDEV.hud.fps');
  console.log('fps (swiftshader)', fps.toFixed(1), 'draw calls', await evaluate('ZMDEV.game.renderer.drawCalls'));
  cleanup();
  console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.log('ERROR', e); process.exit(2); });
