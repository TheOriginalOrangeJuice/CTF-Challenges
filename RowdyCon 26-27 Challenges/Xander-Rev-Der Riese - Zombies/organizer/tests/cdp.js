// Minimal Chrome DevTools Protocol driver (no npm dependencies) for the test scripts.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = process.env.CHROME || path.join(os.homedir(), '.cache/ms-playwright/chromium-1140/chrome-linux/chrome');

async function launch(url, shotDir) {
  fs.mkdirSync(shotDir, { recursive: true });
  const port = 9333 + Math.floor(Math.random() * 500);
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; chrome.stderr.on('data', d => { stderr += d; });
  const close = () => { try { chrome.kill('SIGKILL'); } catch (e) { /* */ } try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* */ } };
  process.on('exit', close);
  let targets = null;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json`); targets = await r.json(); if (targets.length) break; } catch (e) { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  if (!targets) throw new Error('chrome did not start: ' + stderr.slice(-1500));
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
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails)) + '\n  in: ' + expr.slice(0, 200));
    return r.result.value;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shotDir, name + '.png'), Buffer.from(r.data, 'base64')); };
  const errors = () => events.filter(e => (e.method === 'Runtime.exceptionThrown') || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map(e => e.method === 'Runtime.exceptionThrown' ? (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description || e.params.exceptionDetails.text) : e.method === 'Log.entryAdded' ? e.params.entry.text : e.params.args.map(a => a.value || a.description).join(' '));
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(2500);
  return { send, evaluate, sleep, shot, errors, close };
}
module.exports = { launch };
