/* TeamSpeak 3 look-alike -- notification sound pack ("Default Sound Pack (Female)", vanilla JS, no deps) */
(function () {
'use strict';

const CFG_KEY = 'ts3.sounds';
const DEFAULTS = { pack: 'default', volume: 1, micClick: true, on: {} };

// Events of the original client's sound/default folder. [id, label, group, enabled by default]
const EVENTS = [
  ['connected', 'Connected to server', 'Connection', true],
  ['disconnected', 'Disconnected from server', 'Connection', true],
  ['connection_lost', 'Connection lost', 'Connection', true],
  ['neutral_connection_connected_currentchannel', 'User joined your channel (connected)', 'Client', true],
  ['neutral_connection_disconnected_currentchannel', 'User disconnected from your channel', 'Client', true],
  ['neutral_connection_connectionlost_currentchannel', 'User in your channel timed out', 'Client', true],
  ['neutral_switched_tocurrentchannel', 'User joined your channel', 'Client', true],
  ['neutral_switched_awayfromcurrentchannel', 'User left your channel', 'Client', true],
  ['neutral_moved_tocurrentchannel', 'User was moved to your channel', 'Client', true],
  ['neutral_moved_awayfromcurrentchannel', 'User was moved out of your channel', 'Client', true],
  ['neutral_kicked_channel_tocurrentchannel', 'User was kicked to your channel', 'Client', true],
  ['neutral_kicked_channel_awayfromcurrentchannel', 'User was kicked out of your channel', 'Client', true],
  ['neutral_kicked_server_currentchannel', 'User in your channel was kicked from the server', 'Client', true],
  ['neutral_banned_server_currentchannel', 'User in your channel was banned from the server', 'Client', true],
  ['channel_switched', 'Channel switched', 'Yourself', true],
  ['you_were_moved', 'You were moved', 'Yourself', true],
  ['you_kicked_channel', 'You were kicked from the channel', 'Yourself', true],
  ['you_kicked_server', 'You were kicked from the server', 'Yourself', true],
  ['you_were_banned', 'You were banned from the server', 'Yourself', true],
  ['you_were_poked', 'You were poked', 'Yourself', true],
  ['servergroup_assigned', 'Server group assigned', 'Yourself', true],
  ['servergroup_revoked', 'Server group revoked', 'Yourself', true],
  ['insufficient_permissions', 'Insufficient permissions', 'Yourself', true],
  ['channel_created', 'Channel created', 'Channel', true],
  ['channel_deleted', 'Channel deleted', 'Channel', true],
  ['your_channel_was_edited', 'Your channel was edited', 'Channel', true],
  ['chat_message_inbound', 'Chat message received', 'Chat', true],
  ['chat_message_outbound', 'Chat message sent', 'Chat', false],
  ['whisper_notify', 'Whisper received', 'Chat', true],
  ['mic_muted', 'Microphone muted', 'Status', true],
  ['mic_activated', 'Microphone activated', 'Status', true],
  ['sound_muted', 'Sound muted', 'Status', true],
  ['sound_resumed', 'Sound resumed', 'Status', true],
  ['away_activated', 'Away activated', 'Status', true],
  ['away_deactivated', 'Away deactivated', 'Status', true]
];
const BY_ID = new Map(EVENTS.map(e => [e[0], { id: e[0], label: e[1], group: e[2], def: e[3] }]));
const ALWAYS = new Set(['sound_muted', 'sound_resumed']);   // audible even while the speakers are muted
const CLICKS = ['mic_click_on', 'mic_click_off'];
const WHISPER_NOTIFY_EVERY = 10000;                           // ms between whisper beeps from one source

let B = null;
let cfg = Object.assign({}, DEFAULTS);
let ctx = null, gain = null;
const buffers = new Map();
const queue = [];
let pumping = false;
let lastWhisper = { from: null, at: 0 };

function loadCfg() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  cfg = Object.assign({}, DEFAULTS, saved, { on: Object.assign({}, saved.on || {}) });
}
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* */ } }

function enabled(id) {
  const ev = BY_ID.get(id);
  if (!ev) return true;
  return id in cfg.on ? !!cfg.on[id] : ev.def;
}
function packActive() { return cfg.pack !== 'none'; }

/* ---------- audio ---------- */
function audio() {
  const shared = window.TSVoice && TSVoice.getAudio ? TSVoice.getAudio() : null;
  const c = shared || ctx;
  if (!c) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
  } else ctx = c;
  if (!gain || gain.context !== ctx) { gain = ctx.createGain(); gain.connect(ctx.destination); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function volume() { const v = Number(cfg.volume); return isNaN(v) ? 1 : Math.max(0, Math.min(1.5, v)); }
function load(id) {
  if (buffers.has(id)) return buffers.get(id);
  const p = (async () => {
    const ac = audio();
    if (!ac) return null;
    try {
      const r = await fetch('/sounds/' + id + '.ogg');
      if (!r.ok) return null;
      return await ac.decodeAudioData(await r.arrayBuffer());
    } catch (e) { return null; }
  })();
  buffers.set(id, p);
  return p;
}
function playNow(buf, vol) {
  return new Promise(resolve => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    try {
      gain.gain.value = vol;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(gain); src.onended = fin; src.start();
    } catch (e) { fin(); return; }
    setTimeout(fin, buf.duration * 1000 + 1000);
  });
}
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const id = queue.shift();
      const buf = await load(id);
      if (buf && audio()) await playNow(buf, volume());
    }
  } finally { pumping = false; }
}
function muted() { return !!(B && B.S && B.S.outputMuted); }

/* ---------- public API ---------- */
// Notification: queued like the original client, respects the pack, the per-event switch and the speaker mute.
function play(id) {
  if (!BY_ID.has(id) || !packActive() || !enabled(id)) return;
  if (muted() && !ALWAYS.has(id)) return;
  if (queue.length >= 4) return;                 // a burst of joins: drop instead of droning on
  queue.push(id);
  pump();
}
// Options > Notifications "Play": ignores the switches.
function preview(id) {
  if (!BY_ID.has(id) && !CLICKS.includes(id)) return;
  queue.length = 0;
  queue.push(id);
  pump();
}
function micClick(on) {
  if (!cfg.micClick || !packActive() || muted()) return;
  const id = on ? 'mic_click_on' : 'mic_click_off';
  load(id).then(buf => { if (buf && audio()) playNow(buf, volume() * 0.8); });
}
// Called by the voice module when a whisper from `from` starts; returns ms to wait before the whisper.
function whisperNotify(from) {
  if (!packActive() || !enabled('whisper_notify') || muted()) return 0;
  const now = Date.now();
  if (lastWhisper.from === from && now - lastWhisper.at < WHISPER_NOTIFY_EVERY) return 0;
  lastWhisper = { from, at: now };
  load('whisper_notify').then(buf => { if (buf && audio()) playNow(buf, volume()); });
  return 320;
}
function unlock() { audio(); }
function preload() {
  if (!packActive()) return;
  ['connected', 'disconnected', 'connection_lost', 'neutral_switched_tocurrentchannel', 'neutral_switched_awayfromcurrentchannel',
    'neutral_connection_connected_currentchannel', 'neutral_connection_disconnected_currentchannel', 'you_were_poked',
    'channel_switched', 'chat_message_inbound', 'whisper_notify', 'mic_click_on', 'mic_click_off'].forEach(load);
}
function getConfig() { return Object.assign({}, cfg, { on: Object.assign({}, cfg.on) }); }
function setConfig(partial) {
  partial = partial || {};
  if (partial.pack === 'default' || partial.pack === 'none') cfg.pack = partial.pack;
  if (partial.volume != null && !isNaN(Number(partial.volume))) cfg.volume = Math.max(0, Math.min(1.5, Number(partial.volume)));
  if (typeof partial.micClick === 'boolean') cfg.micClick = partial.micClick;
  if (partial.on && typeof partial.on === 'object') {
    for (const [id, v] of Object.entries(partial.on)) {
      const ev = BY_ID.get(id);
      if (!ev) continue;
      if (!!v === ev.def) delete cfg.on[id]; else cfg.on[id] = !!v;
    }
  }
  saveCfg();
}
function init(bridge) { B = bridge; loadCfg(); }

window.TSSounds = {
  init, play, preview, micClick, whisperNotify, unlock, preload, getConfig, setConfig,
  events: () => EVENTS.map(e => ({ id: e[0], label: e[1], group: e[2], enabled: enabled(e[0]) })),
  isEnabled: enabled
};
loadCfg();
})();
