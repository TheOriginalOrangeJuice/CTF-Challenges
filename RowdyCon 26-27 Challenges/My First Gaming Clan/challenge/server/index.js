'use strict';
// HTTP (static files) + WebSocket ("TS3 protocol") + ServerQuery (telnet) entry point.

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { State, TSError } = require('./state');
const startQuery = require('./query');

const PORT = Number(process.env.PORT) || 8080;
const QUERY_PORT = process.env.QUERY_PORT !== undefined ? Number(process.env.QUERY_PORT) : 10011;

const state = new State();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.setHeader('Server', 'TeamSpeak 3 Web Client'); next(); });
app.use('/voice', express.static(path.join(__dirname, '..', 'public', 'voice'), { maxAge: '7d', immutable: true, index: false }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

// --- small JSON API (handy for CTF hooks / debugging) -----------------------
app.get('/api/serverinfo', (req, res) => {
  res.json({ name: state.server.name, address: state.server.address, platform: state.server.platform, version: state.server.version,
    clientsOnline: state.clients.size, maxClients: state.server.maxClients, uptime: state.uptime() });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, clients: state.clients.size, uptime: state.uptime(), voice: !!(state.voice && state.voice.manifest) });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 65536 });

function sendErr(ws, e) {
  if (e instanceof TSError) ws.send(JSON.stringify({ t: 'error', id: e.id, msg: e.message, ...(e.extra || {}) }));
  else { console.error(e); ws.send(JSON.stringify({ t: 'error', id: 1, msg: 'undefined error' })); }
}

wss.on('connection', (ws, req) => {
  let client = null;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const country = (req.headers['accept-language'] || '').match(/[-_]([A-Z]{2})/) ? RegExp.$1 : 'DE';
  const ua = req.headers['user-agent'] || '';
  const platform = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'OS X' : /Android/.test(ua) ? 'Android' : 'Linux';

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    try {
      if (!client) {
        if (m.t !== 'connect') return;
        client = state.connect({ nickname: m.nickname, password: m.password, ws, address: m.address, platform, country, ip });
        client.ip = ip;
        // "More" options of the connect dialog: one-time privilege key + default channel
        let tokenResult = null, tokenOk = false;
        if (m.token) {
          try { const key = state.usePrivilegeKey(client, m.token); tokenOk = true; tokenResult = `Privilege key successfully used. You were added to server group "${(state.group(key.sgid) || {}).name}".`; }
          catch (e) { tokenResult = `Could not use privilege key: ${e.message}`; }
        }
        if (m.channel) {
          const ch = state.channels.find(c => c.name === m.channel || String(c.cid) === String(m.channel));
          if (ch) { try { state.joinChannel(client, ch.cid, m.channelPassword); } catch (e) { /* stay in default channel */ } }
        }
        const snap = state.snapshot(client);
        snap.self.tokenResult = tokenResult; snap.self.tokenOk = tokenOk;
        ws.send(JSON.stringify({ t: 'init', ...snap }));
        console.log(`[ws] ${client.nickname} (${ip}) connected`);
        return;
      }
      switch (m.t) {
        case 'join': state.joinChannel(client, m.cid, m.password); break;
        case 'move': {           // admin moves someone else
          if (!state.isAdmin(client)) throw new TSError([2568, 'insufficient client permissions']);
          const target = state.client(m.clid);
          if (!target) throw new TSError([512, 'invalid clientID']);
          state.joinChannel(target, m.cid, m.password, client);
          break;
        }
        case 'msg': state.textMessage(client, Number(m.mode) || 2, m.target, m.text); break;
        case 'poke': state.poke(client, m.clid, m.text); break;
        case 'update': state.updateClient(client, m.patch || {}); break;
        case 'talk': state.setTalking(client, !!m.on); if (m.on) state.touch(client); break;
        case 'voicetext': {
          if (!state.voice) break;
          const alts = Array.isArray(m.alts) ? m.alts.slice(0, 3).map(a => String(a).slice(0, 300)) : [];
          state.voice.onUtterance(client, String(m.text || '').slice(0, 300), alts);
          break;
        }
        case 'privkey': {
          const key = state.usePrivilegeKey(client, m.token);
          ws.send(JSON.stringify({ t: 'privkeyok', sgid: key.sgid, group: (state.group(key.sgid) || {}).name }));
          break;
        }
        case 'setgroups': state.setServerGroups(client, m.clid, m.sgids || []); break;
        case 'kick': state.kick(client, m.clid, m.mode === 'channel' ? 'channel' : 'server', m.reason); break;
        case 'ban': state.ban(client, m.clid, m.reason, m.duration); break;
        case 'banlist': {
          if (!state.isAdmin(client)) throw new TSError([2568, 'insufficient client permissions']);
          ws.send(JSON.stringify({ t: 'bans', bans: state.banList() }));
          break;
        }
        case 'bandel': state.banDelete(client, m.id); ws.send(JSON.stringify({ t: 'bans', bans: state.banList() })); break;
        case 'channelcreate': state.createChannel(client, m); break;
        case 'channeledit': state.editChannel(client, m.cid, m); break;
        case 'channeldelete': state.deleteChannel(client, m.cid); break;
        case 'serveredit': state.editServer(client, m); break;
        case 'privkeylist': {
          if (!state.isAdmin(client)) throw new TSError([2568, 'insufficient client permissions']);
          ws.send(JSON.stringify({ t: 'privkeys', keys: state.privilegeKeys.map(k => ({ token: k.token, sgid: k.sgid, description: k.description || '', used: !!k.used })) }));
          break;
        }
        case 'querylogin': {
          if (!state.isAdmin(client)) throw new TSError([2568, 'insufficient client permissions']);
          ws.send(JSON.stringify({ t: 'querylogin', login: state.config.query.login, password: state.config.query.password, port: QUERY_PORT }));
          break;
        }
        case 'ping': ws.send(JSON.stringify({ t: 'pong', ts: m.ts })); break;
        default: throw new TSError([256, 'command not found']);
      }
    } catch (e) { sendErr(ws, e); }
  });

  ws.on('close', () => {
    if (client) { state.disconnect(client, 'leaving'); console.log(`[ws] ${client.nickname} disconnected`); }
  });
  ws.on('error', () => { /* ignore */ });
});

// Make sure stale sockets go away (connection lost)
setInterval(() => {
  for (const c of state.clients.values()) {
    if (!c.ws) continue;
    if (c.ws.readyState > 1) state.disconnect(c, 'connection lost');
    else if (c.ws.isAlive === false) { c.ws.terminate(); state.disconnect(c, 'connection lost'); }
    else { c.ws.isAlive = false; c.ws.ping(); }
  }
}, 30000);
wss.on('connection', ws => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });

server.listen(PORT, () => console.log(`[http] TeamSpeak 3 web client listening on http://0.0.0.0:${PORT}`));
if (QUERY_PORT > 0) startQuery(state, QUERY_PORT);
