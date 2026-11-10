'use strict';
// Minimal TeamSpeak 3 ServerQuery look-alike (the raw telnet interface on tcp/10011).
// Speaks the real escaping rules and the "error id=0 msg=ok" response format, so
// existing TS3 query tooling (and nostalgic CTF players with netcat) feel at home.

const net = require('net');
const { TSError, ERR } = require('./state');

const GREETING = 'TS3\n\rWelcome to the TeamSpeak 3 ServerQuery interface, type "help" for a list of commands and "help <command>" for information on a specific command.\n\r';

const ESC = [['\\', '\\\\'], ['/', '\\/'], [' ', '\\s'], ['|', '\\p'], ['\x07', '\\a'], ['\b', '\\b'], ['\f', '\\f'], ['\n', '\\n'], ['\r', '\\r'], ['\t', '\\t'], ['\v', '\\v']];
const UNESC = Object.fromEntries(ESC.map(([a, b]) => [b[1], a]));
function esc(v) { v = String(v); for (const [a, b] of ESC) v = v.split(a).join(b); return v; }
function unesc(v) { return String(v).replace(/\\(.)/g, (m, c) => (c in UNESC ? UNESC[c] : c)); }
function kv(obj) { return Object.entries(obj).map(([k, v]) => (v === true ? k : `${k}=${esc(v)}`)).join(' '); }
function list(items) { return items.map(kv).join('|'); }

function parse(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts.shift() || '').toLowerCase();
  const params = {}; const flags = []; const pos = [];
  for (const p of parts) {
    if (p.startsWith('-')) flags.push(p.slice(1).toLowerCase());
    else if (p.includes('=')) { const i = p.indexOf('='); params[p.slice(0, i).toLowerCase()] = unesc(p.slice(i + 1)); }
    else pos.push(unesc(p));
  }
  return { cmd, params, flags, pos };
}

const HELP = {
  help: 'Usage: help [<command>]', login: 'Usage: login client_login_name={username} client_login_password={password}', logout: 'Usage: logout',
  quit: 'Usage: quit', use: 'Usage: use [sid={serverID}] [port={serverPort}]', serverinfo: 'Usage: serverinfo', whoami: 'Usage: whoami',
  channellist: 'Usage: channellist [-topic] [-flags] [-voice] [-limits]', clientlist: 'Usage: clientlist [-uid] [-away] [-voice] [-groups] [-info] [-country] [-ip]',
  clientinfo: 'Usage: clientinfo clid={clientID}', channelinfo: 'Usage: channelinfo cid={channelID}',
  sendtextmessage: 'Usage: sendtextmessage targetmode={1-3} target={serverID|channelID|clientID} msg={text}', gm: 'Usage: gm msg={text}',
  clientpoke: 'Usage: clientpoke clid={clientID} msg={txt}', clientkick: 'Usage: clientkick clid={clientID}... reasonid={4|5} [reasonmsg={text}]',
  clientmove: 'Usage: clientmove clid={clientID}... cid={channelID} [cpw={channelPassword}]',
  channelcreate: 'Usage: channelcreate channel_name={channelName} [channel_properties...]', channeldelete: 'Usage: channeldelete cid={channelID} force={1|0}',
  servergrouplist: 'Usage: servergrouplist', servergroupaddclient: 'Usage: servergroupaddclient sgid={groupID} cldbid={clientDBID}',
  privilegekeylist: 'Usage: privilegekeylist', tokenlist: 'Usage: tokenlist', version: 'Usage: version', hostinfo: 'Usage: hostinfo'
};

function startQuery(state, port) {
  const srv = net.createServer(sock => {
    sock.setEncoding('utf8');
    const session = { loggedIn: false, sid: 0, nick: `serveradmin from ${sock.remoteAddress}:${sock.remotePort}` };
    let buf = '';
    const out = s => { if (!sock.destroyed) sock.write(s); };
    const ok = () => out('error id=0 msg=ok\n\r');
    const fail = e => out(`error id=${e.id} msg=${esc(e.message)}${e.extra ? ' ' + kv(e.extra) : ''}\n\r`);
    const needLogin = () => { if (!session.loggedIn) throw new TSError(ERR.INSUFFICIENT_PERMS, { failed_permid: 240 }); };
    const needServer = () => { if (!session.sid) throw new TSError(ERR.SERVER_INVALID_ID); };
    const queryClient = () => ({ clid: 0, nickname: session.nick, cid: 0, isBot: false, isQuery: true, ws: null, serverGroups: [6] });
    const describeClient = c => ({ clid: c.clid, cid: c.cid, client_database_id: c.dbid, client_nickname: c.nickname, client_type: 0 });

    out(GREETING);
    sock.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        try { handle(line); } catch (e) { if (e instanceof TSError) fail(e); else { console.error(e); fail(new TSError([1, 'undefined error'])); } }
      }
    });
    sock.on('error', () => {});

    function handle(line) {
      const { cmd, params, flags, pos } = parse(line);
      switch (cmd) {
        case 'help': {
          const c = (pos[0] || '').toLowerCase();
          if (c) { if (!HELP[c]) throw new TSError(ERR.COMMAND_NOT_FOUND); out(HELP[c] + '\n\r'); }
          else out('TeamSpeak 3 ServerQuery Manual\n\r\n\rAvailable commands:\n\r  ' + Object.keys(HELP).join('\n\r  ') + '\n\r');
          return ok();
        }
        case 'quit': ok(); return sock.end();
        case 'version': out(kv({ version: '3.0.6.1', build: 1340956745, platform: state.server.platform }) + '\n\r'); return ok();
        case 'hostinfo': out(kv({ instance_uptime: state.uptime(), host_timestamp_utc: Math.floor(Date.now() / 1000), virtualservers_running_total: 1, connection_bandwidth_sent_last_second_total: 2415, connection_bandwidth_received_last_second_total: 1788 }) + '\n\r'); return ok();
        case 'login': {
          const name = params.client_login_name || pos[0]; const pw = params.client_login_password || pos[1];
          if (name !== state.config.query.login || pw !== state.config.query.password) throw new TSError(ERR.LOGIN_INVALID);
          session.loggedIn = true; return ok();
        }
        case 'logout': session.loggedIn = false; return ok();
        case 'use': {
          const sid = params.sid != null ? Number(params.sid) : params.port != null ? (Number(params.port) === 9987 ? 1 : 0) : Number(pos[0] || 1);
          if (sid !== 1) throw new TSError(ERR.SERVER_INVALID_ID);
          session.sid = 1; return ok();
        }
        case 'whoami': {
          out(kv({ virtualserver_status: session.sid ? 'online' : 'unknown', virtualserver_id: session.sid, virtualserver_unique_identifier: session.sid ? state.server.uniqueId : '',
            virtualserver_port: session.sid ? 9987 : 0, client_id: 0, client_channel_id: 0, client_nickname: session.nick, client_database_id: session.loggedIn ? 1 : 0,
            client_login_name: session.loggedIn ? state.config.query.login : '', client_unique_identifier: session.loggedIn ? state.config.query.login : '', client_origin_server_id: 0 }) + '\n\r');
          return ok();
        }
        case 'serverinfo': {
          needServer();
          out(kv({ virtualserver_unique_identifier: state.server.uniqueId, virtualserver_name: state.server.name, virtualserver_welcomemessage: state.server.welcome,
            virtualserver_platform: state.server.platform, virtualserver_version: state.server.version, virtualserver_maxclients: state.server.maxClients,
            virtualserver_password: '', virtualserver_clientsonline: state.clients.size + 1, virtualserver_channelsonline: state.channels.length,
            virtualserver_created: Math.floor(new Date(state.server.created).getTime() / 1000), virtualserver_uptime: state.uptime(), virtualserver_codec_encryption_mode: 0,
            virtualserver_hostmessage: '', virtualserver_hostmessage_mode: 0, virtualserver_flag_password: state.server.password ? 1 : 0,
            virtualserver_default_server_group: state.config.defaultServerGroup, virtualserver_default_channel_group: state.config.defaultChannelGroup,
            virtualserver_hostbanner_url: (state.server.hostbanner || {}).url || '', virtualserver_hostbanner_gfx_url: (state.server.hostbanner || {}).image || '',
            virtualserver_hostbutton_tooltip: (state.server.hostbutton || {}).tooltip || '', virtualserver_hostbutton_url: (state.server.hostbutton || {}).url || '',
            virtualserver_queryclientsonline: 1, virtualserver_port: 9987, virtualserver_autostart: 1, virtualserver_machine_id: '', virtualserver_status: 'online',
            virtualserver_log_client: 0, virtualserver_log_query: 0, virtualserver_log_channel: 0, virtualserver_log_permissions: 1, virtualserver_log_server: 0,
            virtualserver_log_filetransfer: 0, virtualserver_min_client_version: 1340956745, virtualserver_ip: '0.0.0.0', virtualserver_weblist_enabled: 1 }) + '\n\r');
          return ok();
        }
        case 'channellist': {
          needServer();
          out(list(state.channels.map(c => {
            const o = { cid: c.cid, pid: c.pid, channel_order: c.order, channel_name: c.name, total_clients: state.clientsIn(c.cid).length, channel_needed_subscribe_power: 0 };
            if (flags.includes('topic')) o.channel_topic = c.topic;
            if (flags.includes('flags')) Object.assign(o, { channel_flag_default: c.isDefault ? 1 : 0, channel_flag_password: c.password ? 1 : 0, channel_flag_permanent: c.permanent ? 1 : 0, channel_flag_semi_permanent: 0 });
            if (flags.includes('voice')) Object.assign(o, { channel_codec: c.codec, channel_codec_quality: c.codecQuality, channel_needed_talk_power: c.neededTalkPower });
            if (flags.includes('limits')) Object.assign(o, { total_clients_family: state.clientsIn(c.cid).length, channel_maxclients: c.maxClients, channel_maxfamilyclients: -1 });
            return o;
          })) + '\n\r');
          return ok();
        }
        case 'channelinfo': {
          needServer();
          const c = state.channel(params.cid);
          if (!c) throw new TSError(ERR.CHANNEL_INVALID_ID);
          out(kv({ pid: c.pid, channel_name: c.name, channel_topic: c.topic, channel_description: c.description, channel_password: c.password ? '*****' : '', channel_codec: c.codec,
            channel_codec_quality: c.codecQuality, channel_maxclients: c.maxClients, channel_order: c.order, channel_flag_permanent: c.permanent ? 1 : 0, channel_flag_default: c.isDefault ? 1 : 0,
            channel_flag_password: c.password ? 1 : 0, channel_needed_talk_power: c.neededTalkPower, channel_filepath: `files/virtualserver_1/channel_${c.cid}` }) + '\n\r');
          return ok();
        }
        case 'clientlist': {
          needServer();
          out(list([...state.clients.values()].map(c => {
            const o = describeClient(c);
            if (flags.includes('uid')) o.client_unique_identifier = c.uid;
            if (flags.includes('away')) Object.assign(o, { client_away: c.away ? 1 : 0, client_away_message: c.awayMessage });
            if (flags.includes('voice')) Object.assign(o, { client_flag_talking: c.talking ? 1 : 0, client_input_muted: c.inputMuted ? 1 : 0, client_output_muted: c.outputMuted ? 1 : 0, client_is_channel_commander: c.channelCommander ? 1 : 0, client_is_talker: 0, client_is_priority_speaker: 0 });
            if (flags.includes('groups')) Object.assign(o, { client_servergroups: c.serverGroups.join(','), client_channel_group_id: c.channelGroup });
            if (flags.includes('info')) Object.assign(o, { client_version: c.version, client_platform: c.platform });
            if (flags.includes('country')) o.client_country = c.country;
            if (flags.includes('ip')) o.connection_client_ip = c.isBot ? '0.0.0.0' : (c.ip || '127.0.0.1');
            return o;
          })) + '\n\r');
          return ok();
        }
        case 'clientinfo': {
          needServer();
          const c = state.client(params.clid);
          if (!c) throw new TSError(ERR.CLIENT_INVALID_ID);
          out(kv({ cid: c.cid, client_idle_time: Date.now() - c.idleSince, client_unique_identifier: c.uid, client_nickname: c.nickname, client_version: c.version, client_platform: c.platform,
            client_input_muted: c.inputMuted ? 1 : 0, client_output_muted: c.outputMuted ? 1 : 0, client_away: c.away ? 1 : 0, client_away_message: c.awayMessage,
            client_servergroups: c.serverGroups.join(','), client_channel_group_id: c.channelGroup, client_database_id: c.dbid, client_created: Math.floor(c.connectedAt / 1000),
            client_lastconnected: Math.floor(c.connectedAt / 1000), client_totalconnections: c.isBot ? 1 + c.dbid * 7 : 1, client_description: c.description, client_country: c.country,
            client_meta_data: (c.bot && c.bot.meta) || '', client_is_talker: 0, client_month_bytes_uploaded: 0, client_month_bytes_downloaded: 0,
            connection_connected_time: Date.now() - c.connectedAt, connection_client_ip: session.loggedIn ? (c.isBot ? '0.0.0.0' : (c.ip || '127.0.0.1')) : '' }) + '\n\r');
          return ok();
        }
        case 'sendtextmessage': {
          needServer(); needLogin();
          const mode = Number(params.targetmode) || 3;
          state.textMessage(queryClient(), mode, params.target, params.msg || '');
          return ok();
        }
        case 'gm': needServer(); needLogin(); state.textMessage(queryClient(), 3, 1, params.msg || ''); return ok();
        case 'clientpoke': needServer(); needLogin(); state.poke(queryClient(), params.clid, params.msg); return ok();
        case 'clientkick': needServer(); needLogin(); state.kick(queryClient(), params.clid, Number(params.reasonid) === 4 ? 'channel' : 'server', params.reasonmsg); return ok();
        case 'clientmove': {
          needServer(); needLogin();
          const c = state.client(params.clid); if (!c) throw new TSError(ERR.CLIENT_INVALID_ID);
          state.joinChannel(c, params.cid, params.cpw, queryClient()); return ok();
        }
        case 'channelcreate': {
          needServer(); needLogin();
          const ch = state.createChannel(null, { name: params.channel_name, pid: params.cpid, topic: params.channel_topic, description: params.channel_description, password: params.channel_password, maxClients: params.channel_maxclients, codec: params.channel_codec });
          out(`cid=${ch.cid}\n\r`); return ok();
        }
        case 'channeldelete': needServer(); needLogin(); state.deleteChannel(null, params.cid); return ok();
        case 'servergrouplist': {
          needServer();
          out(list(state.serverGroups.map(g => ({ sgid: g.sgid, name: g.name, type: 1, iconid: g.icon ? 100 + g.sgid : 0, savedb: 1 }))) + '\n\r');
          return ok();
        }
        case 'servergroupaddclient': {
          needServer(); needLogin();
          const c = [...state.clients.values()].find(x => x.dbid === Number(params.cldbid));
          if (!c) throw new TSError(ERR.CLIENT_INVALID_ID);
          state.setServerGroups(queryClient(), c.clid, [...new Set([...c.serverGroups, Number(params.sgid)])]); return ok();
        }
        case 'privilegekeylist': case 'tokenlist': {
          needServer(); needLogin();
          out(list(state.privilegeKeys.map(k => ({ token: k.token, token_type: 0, token_id1: k.sgid, token_id2: 0, token_created: Math.floor(state.started / 1000), token_description: k.description || '' }))) + '\n\r');
          return ok();
        }
        default: throw new TSError(ERR.COMMAND_NOT_FOUND);
      }
    }
  });
  srv.on('error', e => console.error('[query] ' + e.message));
  srv.listen(port, () => console.log(`[query] ServerQuery listening on tcp/${port}`));
  return srv;
}

module.exports = startQuery;
