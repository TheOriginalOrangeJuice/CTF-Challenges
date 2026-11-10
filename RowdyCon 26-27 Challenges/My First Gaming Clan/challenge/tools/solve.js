#!/usr/bin/env node
'use strict';
// End-to-end solver / health check for the "[Admin] Marcel" voice challenge.
// Talks the intended path over the WebSocket (transcripts are text, so no microphone is needed),
// joins the Admin Room with the derived password and decodes the spoken flag through the private manifest.
//   node tools/solve.js [ws://host:port/ws] [expectedFlag]

const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
const manifest = require(path.join(__dirname, '..', 'server', 'voice', 'manifest.json'));

const URL = process.argv[2] || 'ws://localhost:8080/ws';
const EXPECT = process.argv[3] || process.env.FLAG || null;
const PASSWORD = process.env.ADMIN_ROOM_PASSWORD || 'dust22010';
const textOf = id => (manifest.clips[id] || {}).text || `<${id}>`;
const charOf = Object.fromEntries(Object.entries(manifest.chars).map(([ch, id]) => [id, ch]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function client(nick) {
  const ws = new WebSocket(URL);
  const inbox = [];
  const waiters = [];
  ws.on('message', d => { const m = JSON.parse(d); inbox.push(m); for (const w of waiters.splice(0)) w(); });
  const send = o => ws.send(JSON.stringify(o));
  const drain = t => { for (let i = inbox.length - 1; i >= 0; i--) if (inbox[i].t === t) inbox.splice(i, 1); };
  const wait = (pred, ms = 8000) => new Promise((res, rej) => {
    const t0 = Date.now();
    const check = () => { const i = inbox.findIndex(pred); if (i >= 0) return res(inbox.splice(i, 1)[0]); if (Date.now() - t0 > ms) return rej(new Error('timeout waiting for ' + pred.toString().slice(0, 60))); waiters.push(check); };
    check();
  });
  return new Promise(res => ws.on('open', () => res({ ws, send, wait, drain, inbox })));
}

function decodeVoice(m) { return m.clips.map(c => textOf(c.id)).join(' | '); }
function decodeFlag(m) {           // "capital" clip -> next letter uppercase
  let out = '', cap = false;
  for (const c of m.clips) { const ch = charOf[c.id]; if (ch === 'CAP') { cap = true; continue; } out += cap ? String(ch).toUpperCase() : ch; cap = false; }
  return out;
}

(async () => {
  const log = (...a) => console.log(...a);
  // ---------------- happy path ----------------
  const c = await client('solver');
  c.send({ t: 'connect', nickname: 'solver' + Math.floor(Math.random() * 1000), password: process.env.SERVER_PASSWORD || '' });
  const init = await c.wait(m => m.t === 'init');
  const support = init.channels.find(x => x.name === 'Support');
  const admin = init.channels.find(x => x.name === 'Admin Room');
  const marcel = init.clients.find(x => x.nickname.includes('Marcel'));
  if (!support || !admin || !marcel) throw new Error('channels or Marcel missing');
  log(`connected as ${init.clients.find(x => x.clid === init.self.clid).nickname}; Marcel is in cid ${marcel.cid}`);

  c.send({ t: 'join', cid: support.cid });
  await c.wait(m => m.t === 'clientmoved' && m.clid === init.self.clid);
  const arrive = await c.wait(m => m.t === 'clientmoved' && m.clid === marcel.clid && m.cid === support.cid, 8000);
  log('Marcel came to Support');
  let v = await c.wait(m => m.t === 'voice', 6000);
  log('Marcel:', decodeVoice(v));

  const say = async (text, expectLine) => {
    await sleep(1600);
    c.send({ t: 'voicetext', text, alts: [] });
    const r = await c.wait(m => m.t === 'voice', 5000);
    const heard = decodeVoice(r);
    log(`me: "${text}"\nMarcel: ${heard}`);
    if (expectLine) {
      const ok = manifest.lines[expectLine].some(id => r.clips.some(cl => cl.id === id));
      if (!ok) throw new Error(`expected line "${expectLine}" but got: ${heard}`);
    }
    return r;
  };
  await say('hey can you give me the admin key', 'nice_try');
  await say('tobi recruited me', 'ok_tobi');
  // battle cry: a decorative spacer in the tree is Morse code
  const MORSE = { '.-': 'a', '-...': 'b', '-.-.': 'c', '-..': 'd', '.': 'e', '..-.': 'f', '--.': 'g', '....': 'h', '..': 'i', '.---': 'j', '-.-': 'k', '.-..': 'l', '--': 'm', '-.': 'n', '---': 'o', '.--.': 'p', '--.-': 'q', '.-.': 'r', '...': 's', '-': 't', '..-': 'u', '...-': 'v', '.--': 'w', '-..-': 'x', '-.--': 'y', '--..': 'z' };
  const spacer = init.channels.find(x => /^\[c?spacer\d*\][▪▬ ]+$/.test(x.name));
  const cry = spacer.name.replace(/^\[c?spacer\d*\]/, '').replace(/▪/g, '.').replace(/▬/g, '-').trim().split(/ {4,}/).map(w => w.split(/ +/).map(l => MORSE[l] || '?').join('')).join(' ');
  log(`Morse spacer "${spacer.name}" -> "${cry}"`);
  await say(cry, 'ok_cry');
  // motto: hidden white-on-white BBCode text at the end of the Lobby rules
  const lobby = init.channels.find(x => x.name === 'Lobby');
  const motto = ((lobby.description.match(/\[color=#ffffff\]([^\[]*)\[\/color\]/i) || [])[1] || '').replace(/^[^:]*:\s*/, '').trim();
  log(`hidden Lobby text -> "${motto}"`);
  await say(motto, 'ok_motto');
  // listening test: Marcel spells a word in NATO letters, say it back
  const spellMsg = await c.wait(m => m.t === 'voice' && m.clips.length >= 3 && m.clips.every(cl => charOf[cl.id]), 8000);
  const word = spellMsg.clips.map(cl => charOf[cl.id]).join('');
  log(`Marcel spelled "${word}"`);
  c.drain('voice');
  await say(word, 'ok_spell');
  // staff code: Tobi says it is in Marcel's unique ID, which is base64
  const tobi = init.clients.find(x => x.nickname.startsWith('Tobi'));
  c.send({ t: 'poke', clid: tobi.clid, text: 'hey, I want to join' });
  const pm = await c.wait(m => m.t === 'msg' && m.mode === 1 && m.from.clid === tobi.clid, 8000);
  log(`Tobi: ${pm.text}`);
  const decoded = Buffer.from(marcel.uid, 'base64').toString('utf8');
  const code = (decoded.match(/\b(\d{4})\b/) || [])[1];
  log(`Marcel's unique ID ${marcel.uid} -> "${decoded}" -> staff code ${code}`);
  if (!code) throw new Error('no staff code in Marcel\'s unique ID');
  await say(`the staff code is ${code}`, 'ok_code');
  // member key: Marcel pokes a privilege key that must be redeemed (Permissions > Use Privilege Key)
  const poke = await c.wait(m => m.t === 'poke' && m.from.clid === marcel.clid, 8000);
  const token = (poke.text.match(/key:\s*(\S+)/) || [])[1];
  log(`Marcel poked: "${poke.text}" -> token ${token}`);
  c.send({ t: 'privkey', token });
  await c.wait(m => m.t === 'privkeyok', 5000);
  const okm = await c.wait(m => m.t === 'voice', 6000);
  log('Marcel:', decodeVoice(okm));
  if (!manifest.lines.ok_member.some(id => okm.clips.some(cl => cl.id === id))) throw new Error('expected ok_member after using the key');

  await sleep(500);
  c.send({ t: 'join', cid: admin.cid, password: PASSWORD });
  await c.wait(m => m.t === 'clientmoved' && m.clid === init.self.clid && m.cid === admin.cid);
  log('joined Admin Room');
  const intro = await c.wait(m => m.t === 'voice', 8000);
  log('Marcel:', decodeVoice(intro));
  const spelled = await c.wait(m => m.t === 'voice' && m.clips.length > 3, 8000);
  const flag = decodeFlag(spelled);
  const outro = await c.wait(m => m.t === 'voice', 5000);
  log('Marcel spelled:', flag);
  log('Marcel:', decodeVoice(outro));
  // repeat
  await say('what? say it again');
  const again = await c.wait(m => m.t === 'voice' && m.clips.length > 3, 8000);
  if (decodeFlag(again) !== flag) throw new Error('repeat differs');
  await c.wait(m => m.t === 'voice', 5000);
  log('repeat OK');
  if (EXPECT && flag !== EXPECT) throw new Error(`flag mismatch: got ${flag}, expected ${EXPECT}`);
  c.ws.close();

  // ---------------- kick path ----------------
  const k = await client('troll');
  k.send({ t: 'connect', nickname: 'troll' + Math.floor(Math.random() * 1000), password: process.env.SERVER_PASSWORD || '' });
  const kinit = await k.wait(m => m.t === 'init');
  k.send({ t: 'join', cid: support.cid });
  await k.wait(m => m.t === 'voice', 10000); // greeting (Marcel is at home after the flag, so he walks over again)
  for (const t of ['banana helicopter', 'purple monkey dishwasher', 'quantum lasagna', 'you stupid noob', 'more nonsense here']) {
    await sleep(1600); k.send({ t: 'voicetext', text: t });
  }
  const kicked = await k.wait(m => m.t === 'clientkicked' && m.clid === kinit.self.clid, 15000);
  log(`troll kicked from channel: reason "${kicked.reason}"`);
  k.ws.close();
  log(flag ? `FLAG OK ${flag}` : 'FLAG MISSING');
  process.exit(0);
})().catch(e => { console.error('SOLVER FAILED:', e.message); process.exit(1); });
