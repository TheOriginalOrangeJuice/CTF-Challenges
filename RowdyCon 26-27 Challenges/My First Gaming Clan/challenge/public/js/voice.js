/* TeamSpeak 3 look-alike -- voice: push-to-talk speech recognition + clip playback (vanilla JS, no deps) */
(function () {
'use strict';

const CFG_KEY = 'ts3.voice';
const DEFAULTS = { mode: 'ptt', lang: 'en-US', showRecognized: true, volume: 1 };
const MODIFIERS = ['Control', 'Alt', 'Shift', 'CapsLock', 'Meta'];
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let B = null;                     // bridge from app.js
let saved = {};                   // what is in localStorage (hotkey only present if the user picked one)
let cfg = Object.assign({}, DEFAULTS);
let serverInfo = {};

function loadCfg() {
  try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  cfg = Object.assign({}, DEFAULTS, saved);
}
function hotkey() { return saved.hotkey || serverInfo.hotkey || 'Control'; }
function keyLabel(k) {
  const names = { Control: 'Ctrl', ' ': 'Space', Meta: 'Win', CapsLock: 'Caps Lock', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' };
  if (names[k]) return names[k];
  return k && k.length === 1 ? k.toUpperCase() : (k || '?');
}
function connected() { return !!(B && B.isConnected()); }
function S() { return B.S; }

/* ============================ error reporting ============================ */
const shownBoxes = new Set();
function report(msg) {
  B.addLine('server', escHtml(msg), 'err');
  if (shownBoxes.has(msg)) return;
  shownBoxes.add(msg);
  B.msgBox('Capture Device', escHtml(msg), 'i-error');
}
const MSG_UNSUPPORTED = 'Voice capture needs Google Chrome or Microsoft Edge (Web Speech API).';
const MSG_INSECURE = 'Capture device could not be opened: the microphone needs a secure connection (HTTPS or localhost).';
const ERRORS = {
  'not-allowed': 'Capture device could not be opened: microphone access denied',
  'service-not-allowed': 'Capture device could not be opened: microphone access denied',
  'network': 'Speech recognition failed (network). Chromium builds without Google API keys cannot use it; use Google Chrome or Edge.',
  'audio-capture': 'No microphone found',
  'language-not-supported': 'Speech recognition does not support the selected language'
};
function errorMessage(code) {
  if (code === 'no-speech' || code === 'aborted') return null;
  return ERRORS[code] || 'Speech recognition error: ' + code;
}
// Returns an error message if capture cannot work at all in this browser/context.
function captureBlocker() {
  if (!SR) return MSG_UNSUPPORTED;
  if (!window.isSecureContext) return MSG_INSECURE;
  return null;
}

/* ============================ recognition ============================ */
// Only one recogniser may be alive at a time. `active` stays set until its onend fires.
let active = null;                // { rec, kind: 'ptt' | 'cont' | 'test', ... }
let idleWaiters = [];
let pttDown = false;
let contBackoffUntil = 0;
let contReported = false;
let testing = false;

function whenIdle(fn) { if (!active) fn(); else idleWaiters.push(fn); }

function alternatives(res) {
  const out = [];
  for (let j = 0; j < res.length; j++) { const t = (res[j].transcript || '').trim(); if (t && !out.includes(t)) out.push(t); }
  return out;
}

function deliver(text, alts) {
  if (!connected()) return;
  B.send({ t: 'voicetext', text, alts });
  if (cfg.showRecognized) B.addLine(S().active, 'Voice: "' + escHtml(text) + '"', 'sys');
}

// Creates and starts a recogniser. onFinal(best, alts) gets each final result.
function startRec(kind, opts) {
  if (active) return null;
  const rec = new SR();
  rec.lang = cfg.lang || 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.continuous = opts.continuous;
  const st = { rec, kind, startedAt: Date.now(), error: null, speaking: false };
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (!res.isFinal) continue;
      const alts = alternatives(res);
      if (alts.length) opts.onFinal(alts[0], alts.slice(1));
    }
  };
  rec.onerror = e => {
    st.error = e.error || 'unknown';
    const msg = errorMessage(st.error);
    if (msg) report(msg);
    if (opts.onError) opts.onError(st.error, msg);
  };
  if (opts.onSpeech) {
    rec.onspeechstart = () => { st.speaking = true; opts.onSpeech(true); };
    rec.onspeechend = () => { if (st.speaking) { st.speaking = false; opts.onSpeech(false); } };
  }
  rec.onend = () => {
    if (st.speaking && opts.onSpeech) { st.speaking = false; opts.onSpeech(false); }
    if (active === st) active = null;
    if (opts.onEnd) opts.onEnd(st);
    const w = idleWaiters; idleWaiters = [];
    w.forEach(fn => { if (!active) fn(); else idleWaiters.push(fn); });
  };
  active = st;
  try {
    rec.start();
  } catch (err) {
    // InvalidStateError ("already started") or similar: forget this instance, retry later
    active = null;
    if (opts.onEnd) opts.onEnd(Object.assign(st, { error: 'start-failed' }));
    return null;
  }
  return st;
}

/* ---------- push-to-talk ---------- */
function startPTT() {
  if (pttDown || !connected()) return;
  const block = captureBlocker();
  if (block) { report(block); return; }
  pttDown = true;
  ensureAudio(); // the key press is a user gesture: unlock the AudioContext for the bot's answer
  if (window.TSSounds) TSSounds.micClick(true);
  B.send({ t: 'talk', on: true });
  whenIdle(beginPTTRec);
}
function beginPTTRec() {
  if (!pttDown || active) return;
  startRec('ptt', { continuous: true, onFinal: deliver });
}
function stopPTT() {
  if (!pttDown) return;
  pttDown = false;
  if (window.TSSounds) TSSounds.micClick(false);
  if (connected()) B.send({ t: 'talk', on: false });
  // Chrome delivers the final result after stop(); keep the instance until onend.
  if (active && active.kind === 'ptt') { try { active.rec.stop(); } catch (e) { /* */ } }
}

/* ---------- continuous transmission ---------- */
function contWanted() { return cfg.mode === 'continuous' && connected() && !testing; }
function contTick() {
  if (!B) return;
  if (pttDown && !connected()) stopPTT();
  if (!contWanted()) {
    if (active && active.kind === 'cont') { try { active.rec.abort(); } catch (e) { /* */ } }
    if (!connected()) contReported = false;
    return;
  }
  if (active || Date.now() < contBackoffUntil) return;
  const block = captureBlocker();
  if (block) { if (!contReported) { contReported = true; report(block); } return; }
  let talking = false;
  startRec('cont', {
    continuous: true,
    onFinal: deliver,
    onSpeech: on => { if (on === talking) return; talking = on; if (connected()) B.send({ t: 'talk', on }); },
    onEnd: st => {
      // errors and very short sessions (aborted / "already started" loops) back off 1 s
      if (st.error && st.error !== 'no-speech') contBackoffUntil = Date.now() + 1000;
      else if (Date.now() - st.startedAt < 1000) contBackoffUntil = Date.now() + 1000;
      if (st.error === 'not-allowed' || st.error === 'service-not-allowed') contBackoffUntil = Date.now() + 10000;
      setTimeout(contTick, 250);
    }
  });
}
setInterval(contTick, 1000);

/* ---------- capture test (Options > Capture > Begin Test) ---------- */
function beginTest(cb) {
  cb = typeof cb === 'function' ? cb : () => {};
  const block = captureBlocker();
  if (block) { report(block); cb(null, block); return; }
  if (testing) { cb(null, 'A test is already running'); return; }
  testing = true;
  ensureAudio();
  if (active && active.kind === 'cont') { try { active.rec.abort(); } catch (e) { /* */ } }
  whenIdle(function run() {
    if (active) { idleWaiters.push(run); return; }
    const parts = []; let errMsg = null, timer = null;
    const st = startRec('test', {
      continuous: false,
      onFinal: best => parts.push(best),
      onError: (code, msg) => { if (msg) errMsg = msg; },
      onEnd: () => { clearTimeout(timer); testing = false; cb(parts.join(' '), errMsg); }
    });
    if (st) timer = setTimeout(() => { try { st.rec.stop(); } catch (e) { /* */ } }, 5000);
  });
}

/* ---------- key handling ---------- */
let capture = null; // pending "press a key" callback (hotkey change)
function keyMatches(e) {
  const hk = hotkey();
  if (e.key === hk) return true;
  return e.key && e.key.length === 1 && hk.length === 1 && e.key.toLowerCase() === hk.toLowerCase();
}
function typingTarget(t) {
  return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable));
}
addEventListener('keydown', e => {
  if (capture && capture.el && !capture.el.isConnected) capture = null; // its dialog was closed
  if (capture) {
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    const cb = capture.cb; capture = null;
    cb(e.key === 'Escape' ? null : e.key);
    return;
  }
  if (!B || cfg.mode !== 'ptt' || e.repeat || !keyMatches(e)) return;
  if (typingTarget(e.target) && !MODIFIERS.includes(e.key)) return;
  startPTT();
}, true);
addEventListener('keyup', e => {
  if (pttDown && keyMatches(e)) stopPTT();
}, true);
addEventListener('blur', () => stopPTT());
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPTT(); });

// Waits for the next keydown; cb(key) or cb(null) on Escape. Optional `el`: capture is dropped
// once that element leaves the DOM (dialog closed). Returns a cancel function.
function captureKey(cb, el) {
  stopPTT();
  const c = { cb, el: el || null };
  capture = c;
  return () => { if (capture === c) capture = null; };
}

/* ============================ playback ============================ */
let ctx = null, gainNode = null;
const buffers = new Map();        // clip id -> Promise<AudioBuffer|null>
const queue = [];                 // { from, clips, gap }
let pumping = false;

function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function applyVolume() {
  if (!gainNode) return;
  const v = Math.max(0, Math.min(2, Number(cfg.volume)));
  gainNode.gain.value = B && S().outputMuted ? 0 : (isNaN(v) ? 1 : v);
}
function clipError(id, why) {
  B.addLine('server', escHtml('Could not play sound file "' + id + '.ogg"' + (why ? ' (' + why + ')' : '')), 'err');
}
function loadClip(id) {
  if (buffers.has(id)) return buffers.get(id);
  const p = (async () => {
    if (!/^[0-9a-f]{1,64}$/i.test(id)) { clipError(String(id), 'invalid id'); return null; }
    const ac = ensureAudio();
    if (!ac) { clipError(id, 'no Web Audio support'); return null; }
    try {
      const r = await fetch('/voice/' + id + '.ogg');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await ac.decodeAudioData(await r.arrayBuffer());
    } catch (err) {
      clipError(id, err && err.message ? err.message : 'decode error');
      return null;
    }
  })();
  buffers.set(id, p);
  return p;
}
function playBuffer(buf) {
  return new Promise(resolve => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    try {
      applyVolume();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gainNode);
      src.onended = fin;
      src.start();
    } catch (e) { fin(); return; }
    // safety net in case the context stays suspended and onended never fires
    setTimeout(fin, buf.duration * 1000 + 1500);
  });
}
function setWhisper(from, on) {
  if (from == null) return;
  const c = S().clients.get(from);
  if (!c || !!c.whispering === on) return;
  c.whispering = on;
  B.updateClientIcon(from);
}
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      setWhisper(job.from, true);
      if (job.from != null && window.TSSounds) { const wait = TSSounds.whisperNotify(job.from); if (wait > 0) await sleep(wait); }
      for (let i = 0; i < job.clips.length; i++) {
        const buf = await loadClip(job.clips[i]);
        if (buf && ensureAudio()) await playBuffer(buf);
        if (i < job.clips.length - 1 && job.gap > 0) await sleep(job.gap);
      }
      if (!queue.some(j => j.from === job.from)) setWhisper(job.from, false);
      else if (job.gap > 0) await sleep(job.gap);
    }
  } finally {
    pumping = false;
  }
}
function enqueue(from, ids, gap) {
  ids = ids.filter(id => typeof id === 'string' && id);
  if (!ids.length) return;
  ensureAudio();
  ids.forEach(loadClip); // prefetch
  queue.push({ from, clips: ids, gap: Math.max(0, Number(gap) || 0) });
  pump();
}

/* ============================ public API ============================ */
function onVoice(m) {
  if (!m || !Array.isArray(m.clips)) return;
  const from = m.from == null ? null : Number(m.from);
  enqueue(from, m.clips.map(c => c && c.id), m.gap != null ? m.gap : 150);
}
function playTest() {
  if (!serverInfo.testClip) { B.msgBox('Playback', 'No test sound available. Connect to a server first.', 'i-info'); return; }
  enqueue(null, [serverInfo.testClip], 0);
}
function getConfig() { return Object.assign({}, cfg, { hotkey: hotkey() }); }
function setConfig(partial) {
  partial = partial || {};
  const prevMode = cfg.mode, prevLang = cfg.lang;
  for (const k of ['hotkey', 'mode', 'lang', 'showRecognized', 'volume']) {
    if (partial[k] === undefined) continue;
    if (k === 'hotkey' && (!partial[k] || partial[k] === hotkey() && !saved.hotkey)) continue; // keep following the server default
    saved[k] = partial[k];
  }
  if (saved.mode !== 'ptt' && saved.mode !== 'continuous') delete saved.mode;
  try { localStorage.setItem(CFG_KEY, JSON.stringify(saved)); } catch (e) { /* */ }
  cfg = Object.assign({}, DEFAULTS, saved);
  applyVolume();
  // re-bind: leaving PTT or changing language restarts whatever is running
  if (cfg.mode !== 'ptt') stopPTT();
  if (active && active.kind === 'cont' && (cfg.mode !== prevMode || cfg.lang !== prevLang)) { try { active.rec.abort(); } catch (e) { /* */ } }
  contBackoffUntil = 0;
  setTimeout(contTick, 0);
  if (B && B.onConfigChange) B.onConfigChange(getConfig());
  return getConfig();
}
function setServerInfo(info) {
  serverInfo = info && typeof info === 'object' ? info : {};
  contBackoffUntil = 0;
  setTimeout(contTick, 0);
  if (B && B.onConfigChange) B.onConfigChange(getConfig());
}
function init(bridge) {
  B = bridge;
  loadCfg();
}

window.TSVoice = {
  init, setServerInfo, onVoice, playTest, beginTest, getConfig, setConfig, captureKey,
  getAudio: ensureAudio,
  isSupported: () => !!SR,
  hotkeyLabel: k => keyLabel(k || hotkey()),
  isTalking: () => pttDown
};
loadCfg();
})();
