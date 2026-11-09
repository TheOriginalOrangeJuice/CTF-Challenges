'use strict';
// In-memory virtual server state: channels, clients, groups, privilege keys.
// Everything the WebSocket handler and the ServerQuery interface touch lives here.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = process.env.TS_CONFIG || path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Environment overrides (handy for docker / CTF deployment)
if (process.env.SERVER_PASSWORD !== undefined) config.server.password = process.env.SERVER_PASSWORD;
if (process.env.QUERY_PASSWORD) config.query.password = process.env.QUERY_PASSWORD;
if (process.env.ADMIN_TOKEN) config.privilegeKeys[0].token = process.env.ADMIN_TOKEN;
if (process.env.ADMIN_ROOM_PASSWORD) {
  const c = config.channels.find(ch => ch.name === 'Admin Room');
  if (c) c.password = process.env.ADMIN_ROOM_PASSWORD;
}
config.flag = process.env.FLAG || config.flag || 'RCC{placeholder_put_your_flag_here}';

// TS3-style error codes
const ERR = {
  OK: [0, 'ok'],
  COMMAND_NOT_FOUND: [256, 'command not found'],
  PARAMETER_INVALID: [1538, 'parameter not found'],
  CLIENT_INVALID_ID: [512, 'invalid clientID'],
  NICKNAME_INUSE: [513, 'nickname is already in use'],
  NICKNAME_INVALID: [1541, 'invalid nickname'],
  CHANNEL_INVALID_ID: [768, 'invalid channelID'],
  CHANNEL_ALREADY_IN: [770, 'already member of channel'],
  CHANNEL_NAME_INUSE: [771, 'channel name is already in use'],
  CHANNEL_NOT_EMPTY: [772, 'channel not empty'],
  CHANNEL_DEFAULT_DELETE: [773, 'can not delete default channel'],
  CHANNEL_MAXCLIENTS: [777, 'channel maxclient reached'],
  CHANNEL_INVALID_PASSWORD: [781, 'invalid channel password'],
  SERVER_INVALID_ID: [1024, 'invalid serverID'],
  SERVER_MAXCLIENTS: [1027, 'server maxclient reached'],
  SERVER_INVALID_PASSWORD: [1028, 'invalid serverpassword'],
  INSUFFICIENT_PERMS: [2568, 'insufficient client permissions'],
  TOKEN_INVALID: [2816, 'invalid privilege key'],
  TOKEN_USED: [2817, 'privilege key already used'],
  LOGIN_INVALID: [520, 'invalid loginname or password'],
  NOT_LOGGED_IN: [517, 'not logged in'],
  BANNED: [3329, 'connection failed, you are banned'],
  FLOOD: [3331, 'you are flooding'],
  SPACER: [781, 'invalid channel password'] // joining a spacer is rejected with a lame excuse, like the real thing
};

class TSError extends Error {
  constructor([id, msg], extra) { super(msg); this.id = id; this.extra = extra; }
}

const SPACER_RE = /^\[(c|r|l|\*)?spacer\d*\]/i;

function uid() {
  // TS3 unique identifiers look like base64 sha1s with trailing '='
  return crypto.createHash('sha1').update(crypto.randomBytes(20)).digest('base64');
}

class State {
  constructor() {
    this.config = config;
    this.started = Date.now();
    this.server = {
      sid: 1,
      name: config.server.name,
      address: config.server.address,
      welcome: config.server.welcome,
      password: config.server.password || '',
      maxClients: config.server.maxClients || 32,
      platform: config.server.platform || 'Linux',
      version: config.server.version || '3.0.6.1 [Build: 1340956745]',
      created: config.server.created || '2010-03-14T18:22:00Z',
      uniqueId: uid(),
      hostbanner: config.server.hostbanner || null,
      hostbutton: config.server.hostbutton || null
    };
    this.serverGroups = config.serverGroups.map(g => ({ ...g }));
    this.channelGroups = config.channelGroups.map(g => ({ ...g }));
    this.privilegeKeys = config.privilegeKeys.map(k => ({ ...k }));
    this.channels = config.channels.map((c, i) => ({
      cid: c.cid, pid: c.pid || 0, name: c.name, topic: c.topic || '', description: c.description || '',
      password: c.password || null, isDefault: !!c.default, codec: c.codec || 'Speex Wideband (16 kHz)',
      codecQuality: c.codecQuality != null ? c.codecQuality : 7, maxClients: c.maxClients != null ? c.maxClients : -1,
      moderated: !!c.moderated, music: !!c.music, permanent: c.permanent !== false, order: i, spacer: SPACER_RE.test(c.name),
      neededTalkPower: c.neededTalkPower || 0
    }));
    this.nextCid = Math.max(0, ...this.channels.map(c => c.cid)) + 1;
    this.nextClid = 1;
    this.nextDbid = 2;
    this.clients = new Map();   // clid -> client
    this.bans = [];
    this.nextBanId = 1;
    this.listeners = new Set(); // callbacks (event) => void  -- used by ServerQuery notify etc.
    this.spawnBots();
    this.botLoop();
    this.voice = null;
    if (process.env.VOICE_BOT !== '0') {
      const { VoiceBot } = require('./voice/bot');
      this.voice = new VoiceBot(this, require('./voice/script.json')); // a FLAG with an unsupported character fails here, on purpose
    }
  }

  // ---- helpers ------------------------------------------------------------
  defaultChannel() { return this.channels.find(c => c.isDefault) || this.channels[0]; }
  channel(cid) { return this.channels.find(c => c.cid === Number(cid)); }
  client(clid) { return this.clients.get(Number(clid)); }
  clientByNick(nick) { for (const c of this.clients.values()) if (c.nickname === nick) return c; return null; }
  clientsIn(cid) { return [...this.clients.values()].filter(c => c.cid === cid); }
  group(sgid) { return this.serverGroups.find(g => g.sgid === Number(sgid)); }
  isAdmin(client) { return client.serverGroups.some(id => (this.group(id) || {}).admin); }
  uptime() { return Math.floor((Date.now() - this.started) / 1000); }

  publicClient(c) {
    return {
      clid: c.clid, nickname: c.nickname, cid: c.cid, uid: c.uid, dbid: c.dbid, isBot: !!c.isBot,
      serverGroups: c.serverGroups, channelGroup: c.channelGroup, away: c.away, awayMessage: c.awayMessage,
      inputMuted: c.inputMuted, outputMuted: c.outputMuted, talking: !!c.talking, connectedAt: c.connectedAt,
      idleSince: c.idleSince, country: c.country, platform: c.platform, version: c.version,
      description: c.description || '', channelCommander: !!c.channelCommander, isQuery: false
    };
  }
  publicChannel(c) {
    const { password, ...rest } = c;
    return { ...rest, hasPassword: !!password };
  }
  snapshot(forClient) {
    return {
      server: {
        name: this.server.name, address: this.server.address, welcome: this.server.welcome, maxClients: this.server.maxClients,
        platform: this.server.platform, version: this.server.version, created: this.server.created, uniqueId: this.server.uniqueId,
        uptime: this.uptime(), hostbanner: this.server.hostbanner, hostbutton: this.server.hostbutton,
        voice: this.voice ? this.voice.clientInfo() : null
      },
      channels: this.channels.map(c => this.publicChannel(c)),
      clients: [...this.clients.values()].map(c => this.publicClient(c)),
      serverGroups: this.serverGroups.map(({ admin, ...g }) => g),
      channelGroups: this.channelGroups,
      self: { clid: forClient.clid, admin: this.isAdmin(forClient) }
    };
  }

  // ---- broadcasting -------------------------------------------------------
  send(client, msg) {
    if (client.ws && client.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
  }
  broadcast(msg, filter) {
    const data = JSON.stringify(msg);
    for (const c of this.clients.values()) {
      if (c.ws && c.ws.readyState === 1 && (!filter || filter(c))) c.ws.send(data);
    }
    for (const fn of this.listeners) { try { fn(msg); } catch (e) { /* ignore */ } }
  }

  // ---- client lifecycle ----------------------------------------------------
  connect({ nickname, password, ws, address, platform, version, country, ip }) {
    const ban = this.activeBan(ip);
    if (ban) throw new TSError(ERR.BANNED, { reason: ban.reason, expires: ban.expires });
    if ((this.server.password || '') !== (password || '')) throw new TSError(ERR.SERVER_INVALID_PASSWORD);
    const real = [...this.clients.values()].filter(c => !c.isBot).length;
    if (real + 1 > this.server.maxClients) throw new TSError(ERR.SERVER_MAXCLIENTS);
    nickname = String(nickname || '').trim().slice(0, 30);
    if (nickname.length < 3) throw new TSError(ERR.NICKNAME_INVALID);
    // Like TS3: nickname collisions get a number appended
    let nick = nickname, n = 1;
    while (this.clientByNick(nick)) nick = nickname + (n++);
    const dc = this.defaultChannel();
    const client = {
      clid: this.nextClid++, dbid: this.nextDbid++, nickname: nick, cid: dc.cid, uid: uid(), ws, isBot: false,
      serverGroups: [this.config.defaultServerGroup], channelGroup: this.config.defaultChannelGroup,
      away: false, awayMessage: '', inputMuted: false, outputMuted: false, talking: false, channelCommander: false,
      connectedAt: Date.now(), idleSince: Date.now(), country: country || 'DE', platform: platform || 'Windows',
      version: version || '3.0.6.1 [Build: 1340956745]', description: '', connectAddress: address || '', ip: ip || ''
    };
    this.clients.set(client.clid, client);
    this.broadcast({ t: 'clientjoin', client: this.publicClient(client) }, c => c !== client);
    return client;
  }

  disconnect(client, reason = 'leaving', extra = {}) {
    if (!this.clients.has(client.clid)) return;
    this.clients.delete(client.clid);
    this.broadcast({ t: 'clientleft', clid: client.clid, nickname: client.nickname, cid: client.cid, reason, ...extra });
  }

  touch(client) { client.idleSince = Date.now(); }

  joinChannel(client, cid, password, invoker) {
    const ch = this.channel(cid);
    if (!ch) throw new TSError(ERR.CHANNEL_INVALID_ID);
    if (ch.spacer) throw new TSError(ERR.CHANNEL_INVALID_ID);
    if (ch.cid === client.cid) throw new TSError(ERR.CHANNEL_ALREADY_IN);
    const admin = invoker ? this.isAdmin(invoker) : this.isAdmin(client);
    if (ch.password && !admin && ch.password !== (password || '')) {
      const now = Date.now();
      client.pwFails = (client.pwFails || []).filter(t => now - t < 60000);
      client.pwFails.push(now);
      if (client.pwFails.length > 10) throw new TSError(ERR.FLOOD, { cid: ch.cid });
      throw new TSError(ERR.CHANNEL_INVALID_PASSWORD, { cid: ch.cid });
    }
    if (ch.maxClients >= 0 && this.clientsIn(ch.cid).length >= ch.maxClients && !admin) throw new TSError(ERR.CHANNEL_MAXCLIENTS);
    const from = client.cid;
    client.cid = ch.cid;
    this.touch(client);
    this.broadcast({ t: 'clientmoved', clid: client.clid, from, cid: ch.cid, invoker: invoker ? { clid: invoker.clid, nickname: invoker.nickname } : null });
  }

  updateClient(client, patch) {
    const allowed = ['away', 'awayMessage', 'inputMuted', 'outputMuted', 'channelCommander', 'description'];
    const out = {};
    for (const k of allowed) if (k in patch) out[k] = patch[k];
    if (typeof patch.nickname === 'string') {
      const nick = patch.nickname.trim().slice(0, 30);
      if (nick.length < 3) throw new TSError(ERR.NICKNAME_INVALID);
      const other = this.clientByNick(nick);
      if (other && other !== client) throw new TSError(ERR.NICKNAME_INUSE);
      out.nickname = nick;
    }
    if (typeof out.awayMessage === 'string') out.awayMessage = out.awayMessage.slice(0, 80);
    if (typeof out.description === 'string') out.description = out.description.slice(0, 200);
    const old = { nickname: client.nickname };
    Object.assign(client, out);
    this.broadcast({ t: 'clientupdate', clid: client.clid, patch: out, old });
  }

  setTalking(client, on) {
    if (!!client.talking === !!on) return;
    client.talking = !!on;
    this.broadcast({ t: 'talk', clid: client.clid, on: !!on });
  }

  textMessage(from, mode, target, text) {
    text = String(text || '').slice(0, 1024);
    if (!text.trim()) return;
    if (mode === 3 && from.ws && !this.isAdmin(from)) throw new TSError(ERR.INSUFFICIENT_PERMS, { failed_permid: 'i_client_needed_server_textmessage_power' });
    const msg = { t: 'msg', mode, time: Date.now(), from: { clid: from.clid, nickname: from.nickname }, text };
    if (from.ws) this.touch(from);
    if (mode === 1) {           // private
      const to = this.client(target);
      if (!to) throw new TSError(ERR.CLIENT_INVALID_ID);
      msg.target = to.clid;
      this.send(to, msg);
      if (to !== from) this.send(from, msg);
      this.botHearsPrivate(to, from, text);
    } else if (mode === 2) {    // channel
      const cid = from.cid;
      msg.target = cid;
      this.broadcast(msg, c => c.cid === cid);
      if (this.voice && from.ws) { const m = this.voice.marcel(); if (m && m.cid === cid) this.voice.onText(from, 'channel'); }
    } else {                    // server
      msg.target = 1;
      this.broadcast(msg);
    }
  }

  poke(from, clid, text) {
    const to = this.client(clid);
    if (!to) throw new TSError(ERR.CLIENT_INVALID_ID);
    this.touch(from);
    this.send(to, { t: 'poke', from: { clid: from.clid, nickname: from.nickname }, text: String(text || '').slice(0, 100) });
    this.botHearsPoke(to, from, text);
  }

  usePrivilegeKey(client, token) {
    const key = this.privilegeKeys.find(k => k.token === String(token || '').trim());
    if (!key) throw new TSError(ERR.TOKEN_INVALID);
    if (key.used && key.singleUse) throw new TSError(ERR.TOKEN_USED);
    key.used = true;
    if (!client.serverGroups.includes(key.sgid)) {
      client.serverGroups = client.serverGroups.filter(id => id !== this.config.defaultServerGroup).concat([key.sgid]);
    }
    this.broadcast({ t: 'clientupdate', clid: client.clid, patch: { serverGroups: client.serverGroups } });
    this.send(client, { t: 'self', admin: this.isAdmin(client) });
    return key;
  }

  setServerGroups(invoker, clid, sgids) {
    if (!this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const c = this.client(clid);
    if (!c) throw new TSError(ERR.CLIENT_INVALID_ID);
    c.serverGroups = sgids.map(Number).filter(id => this.group(id));
    if (!c.serverGroups.length) c.serverGroups = [this.config.defaultServerGroup];
    this.broadcast({ t: 'clientupdate', clid: c.clid, patch: { serverGroups: c.serverGroups } });
    this.send(c, { t: 'self', admin: this.isAdmin(c) });
  }

  // ---- bans (by IP, like a TS3 ban without a UID match) ----------------------
  activeBan(ip) {
    const now = Date.now();
    this.bans = this.bans.filter(b => !b.expires || b.expires > now);
    return ip ? this.bans.find(b => b.ip && b.ip === ip) || null : null;
  }
  banList() { this.activeBan(null); return this.bans.slice(); }
  ban(invoker, clid, reason, duration) {
    if (!this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const c = this.client(clid);
    if (!c) throw new TSError(ERR.CLIENT_INVALID_ID);
    if (c === invoker) throw new TSError(ERR.INSUFFICIENT_PERMS);
    reason = String(reason || '').slice(0, 80);
    duration = Math.max(0, Math.min(365 * 86400, Math.floor(Number(duration) || 0)));
    const inv = { clid: invoker.clid, nickname: invoker.nickname };
    this.bans.push({ id: this.nextBanId++, ip: c.ip || '', uid: c.uid, nickname: c.nickname, reason, invoker: invoker.nickname,
      created: Date.now(), expires: duration ? Date.now() + duration * 1000 : 0 });
    this.send(c, { t: 'kicked', mode: 'ban', reason, invoker: inv, duration });
    this.clients.delete(c.clid);
    this.broadcast({ t: 'clientleft', clid: c.clid, nickname: c.nickname, cid: c.cid, reason: 'banned', kickReason: reason, invoker: inv, duration });
    if (c.ws) setTimeout(() => { try { c.ws.close(); } catch (e) { /* */ } }, 50);
    if (c.isBot) setTimeout(() => this.respawnBot(c), duration ? Math.min(duration * 1000, 3600e3) : 60000);
  }
  banDelete(invoker, id) {
    if (!this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    this.bans = this.bans.filter(b => b.id !== Number(id));
  }

  kick(invoker, clid, mode, reason) {
    if (!this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const c = this.client(clid);
    if (!c) throw new TSError(ERR.CLIENT_INVALID_ID);
    reason = String(reason || '').slice(0, 80);
    const inv = { clid: invoker.clid, nickname: invoker.nickname };
    if (mode === 'channel') {
      const dc = this.defaultChannel();
      const from = c.cid;
      c.cid = dc.cid;
      this.broadcast({ t: 'clientkicked', clid: c.clid, from, cid: dc.cid, mode: 'channel', reason, invoker: inv });
    } else {
      this.send(c, { t: 'kicked', mode: 'server', reason, invoker: inv });
      this.clients.delete(c.clid);
      this.broadcast({ t: 'clientleft', clid: c.clid, nickname: c.nickname, cid: c.cid, reason: 'kicked', kickReason: reason, invoker: inv });
      if (c.ws) setTimeout(() => { try { c.ws.close(); } catch (e) { /* */ } }, 50);
      if (c.isBot) setTimeout(() => this.respawnBot(c), 60000);
    }
  }

  editServer(invoker, data) {
    if (invoker && !this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const s = this.server;
    if (typeof data.name === 'string' && data.name.trim()) s.name = data.name.trim().slice(0, 64);
    if (typeof data.welcome === 'string') s.welcome = data.welcome.slice(0, 1024);
    if (typeof data.password === 'string') s.password = data.password;
    if (data.maxClients) s.maxClients = Math.max(1, Number(data.maxClients) || s.maxClients);
    if (data.hostbanner && typeof data.hostbanner === 'object') s.hostbanner = { ...(s.hostbanner || {}), url: String(data.hostbanner.url || ''), image: String(data.hostbanner.image || '') };
    if (data.hostbutton && typeof data.hostbutton === 'object') s.hostbutton = { tooltip: String(data.hostbutton.tooltip || ''), url: String(data.hostbutton.url || '') };
    const pub = { name: s.name, welcome: s.welcome, maxClients: s.maxClients, hostbanner: s.hostbanner, hostbutton: s.hostbutton };
    this.broadcast({ t: 'serveredited', server: pub, invoker: invoker ? { clid: invoker.clid, nickname: invoker.nickname } : { clid: 0, nickname: 'ServerQuery' } });
  }

  // ---- channels ------------------------------------------------------------
  createChannel(invoker, data) {
    if (invoker && !this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const name = String(data.name || '').trim().slice(0, 40);
    if (!name) throw new TSError(ERR.PARAMETER_INVALID);
    const pid = Number(data.pid) || 0;
    if (pid && !this.channel(pid)) throw new TSError(ERR.CHANNEL_INVALID_ID);
    if (this.channels.some(c => c.pid === pid && c.name === name)) throw new TSError(ERR.CHANNEL_NAME_INUSE);
    const ch = {
      cid: this.nextCid++, pid, name, topic: String(data.topic || '').slice(0, 100), description: String(data.description || '').slice(0, 500),
      password: data.password ? String(data.password) : null, isDefault: false, codec: data.codec || 'Speex Wideband (16 kHz)',
      codecQuality: Number(data.codecQuality) || 7, maxClients: data.maxClients != null ? Number(data.maxClients) : -1,
      moderated: !!data.moderated, music: false, permanent: data.permanent !== false, order: this.channels.length, spacer: SPACER_RE.test(name),
      neededTalkPower: 0
    };
    this.channels.push(ch);
    this.broadcast({ t: 'channelcreated', channel: this.publicChannel(ch), invoker: invoker ? { clid: invoker.clid, nickname: invoker.nickname } : null });
    return ch;
  }

  editChannel(invoker, cid, data) {
    if (invoker && !this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const ch = this.channel(cid);
    if (!ch) throw new TSError(ERR.CHANNEL_INVALID_ID);
    if (typeof data.name === 'string' && data.name.trim()) ch.name = data.name.trim().slice(0, 40);
    if (typeof data.topic === 'string') ch.topic = data.topic.slice(0, 100);
    if (typeof data.description === 'string') ch.description = data.description.slice(0, 500);
    if ('password' in data) ch.password = data.password ? String(data.password) : null;
    if (typeof data.codec === 'string') ch.codec = data.codec;
    if (data.codecQuality != null) ch.codecQuality = Number(data.codecQuality) || 7;
    if (data.maxClients != null) ch.maxClients = Number(data.maxClients);
    if ('moderated' in data) ch.moderated = !!data.moderated;
    ch.spacer = SPACER_RE.test(ch.name);
    this.broadcast({ t: 'channeledited', channel: this.publicChannel(ch) });
    return ch;
  }

  deleteChannel(invoker, cid) {
    if (invoker && !this.isAdmin(invoker)) throw new TSError(ERR.INSUFFICIENT_PERMS);
    const ch = this.channel(cid);
    if (!ch) throw new TSError(ERR.CHANNEL_INVALID_ID);
    if (ch.isDefault) throw new TSError(ERR.CHANNEL_DEFAULT_DELETE);
    const doomed = new Set([ch.cid]);
    let grew = true;
    while (grew) { grew = false; for (const c of this.channels) if (!doomed.has(c.cid) && doomed.has(c.pid)) { doomed.add(c.cid); grew = true; } }
    const dc = this.defaultChannel();
    for (const c of this.clients.values()) if (doomed.has(c.cid)) {
      const from = c.cid; c.cid = dc.cid;
      this.broadcast({ t: 'clientmoved', clid: c.clid, from, cid: dc.cid, invoker: null });
    }
    this.channels = this.channels.filter(c => !doomed.has(c.cid));
    for (const id of doomed) this.broadcast({ t: 'channeldeleted', cid: id });
  }

  // ---- bots ----------------------------------------------------------------
  spawnBots() {
    for (const b of this.config.bots || []) this.spawnBot(b);
  }
  spawnBot(b) {
    const client = {
      clid: this.nextClid++, dbid: this.nextDbid++, nickname: b.nickname, cid: this.channel(b.cid) ? b.cid : this.defaultChannel().cid,
      uid: b.uid || uid(), ws: null, isBot: true, bot: b, serverGroups: b.sgids || [this.config.defaultServerGroup], channelGroup: b.cgid || this.config.defaultChannelGroup,
      away: !!b.away, awayMessage: b.awayMessage || '', inputMuted: !!b.inputMuted, outputMuted: !!b.outputMuted, talking: false,
      channelCommander: !!b.channelCommander, connectedAt: Date.now() - Math.floor(Math.random() * 3 * 3600e3),
      idleSince: Date.now() - Math.floor(Math.random() * 600e3), country: b.country || 'DE', platform: b.platform || 'Windows',
      version: b.version || '3.0.6.1 [Build: 1340956745]', description: b.description || ''
    };
    this.clients.set(client.clid, client);
    return client;
  }
  respawnBot(old) {
    if (this.clientByNick(old.nickname)) return;
    const c = this.spawnBot(old.bot);
    this.broadcast({ t: 'clientjoin', client: this.publicClient(c) });
  }
  botLoop() {
    setInterval(() => {
      for (const c of this.clients.values()) {
        if (!c.isBot || c.away || c.bot.persona) continue;
        const t = c.bot.talkiness || 0;
        if (c.talking) { if (Math.random() < 0.35) this.setTalking(c, false); }
        else if (!c.inputMuted && Math.random() < t * 0.08) this.setTalking(c, true);
        const lines = c.bot.chatter || [];
        if (lines.length && Math.random() < 0.004) {
          this.textMessage(c, 2, c.cid, lines[Math.floor(Math.random() * lines.length)]);
        }
      }
    }, 1000);
  }
  botHearsPrivate(bot, from, text) {
    if (!bot.isBot || from.isBot) return;
    if (bot.bot.persona && this.voice) return this.voice.onText(from, 'chat');
    const replies = bot.bot.replies || ['?', 'sorry im ingame', 'ask an admin', 'lol', 'who are you'];
    setTimeout(() => {
      if (!this.clients.has(bot.clid) || !this.clients.has(from.clid)) return;
      this.textMessage(bot, 1, from.clid, replies[Math.floor(Math.random() * replies.length)]);
    }, 1500 + Math.random() * 4000);
  }
  botHearsPoke(bot, from, text) {
    if (!bot.isBot || from.isBot) return;
    if (bot.bot.persona && this.voice) return this.voice.onText(from, 'poke');
    if (bot.bot.pokeReply === false && !bot.bot.pokeMessage) return;
    setTimeout(() => {
      if (!this.clients.has(bot.clid) || !this.clients.has(from.clid)) return;
      if (bot.bot.pokeMessage) this.textMessage(bot, 1, from.clid, bot.bot.pokeMessage);
      else this.poke(bot, from.clid, bot.bot.pokeReply || 'stop poking me');
    }, 2000 + Math.random() * 3000);
  }
}

module.exports = { State, TSError, ERR, SPACER_RE, config };
