/* TeamSpeak 3 look-alike -- browser client (vanilla JS, no deps) */
(function () {
'use strict';

/* ============================ utils ============================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (id, cls = '') => `<svg class="icon ${cls}"><use href="#${id}"/></svg>`;
const pad = n => String(n).padStart(2, '0');
const tstamp = (d = new Date()) => `<span class="ts">&lt;${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}&gt;</span>`;
const q = s => `"${esc(s)}"`;
function h(tag, attrs = {}, html) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v);
  }
  if (html != null) e.innerHTML = html;
  return e;
}
function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60), ss = s % 60;
  return (d ? `${d} day${d === 1 ? '' : 's'} ` : '') + `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
function fmtDate(x) {
  const d = new Date(x);
  if (isNaN(d)) return esc(x);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const COUNTRIES = { DE: 'Germany', AT: 'Austria', CH: 'Switzerland', NL: 'Netherlands', GB: 'United Kingdom', US: 'United States', FR: 'France', PL: 'Poland', BE: 'Belgium', IT: 'Italy', SE: 'Sweden', FI: 'Finland', NO: 'Norway', DK: 'Denmark', RU: 'Russia', ES: 'Spain', CZ: 'Czech Republic', TR: 'Turkey', CA: 'Canada', AU: 'Australia' };
const flag = cc => cc ? `<span class="flag fl-${esc(String(cc).toLowerCase())}" title="${esc(COUNTRIES[cc] || cc)}"></span>` : '';

// Tiny BBCode renderer (TS3 chat supported [b] [i] [u] [s] [color] [url]). Escapes HTML first.
function bbcode(text) {
  let s = esc(text);
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>').replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>')
         .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>').replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
         .replace(/\[color=(#?[a-z0-9]{1,20})\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>');
  }
  s = s.replace(/\[url=((?:https?|ftp|ts3server):\/\/[^\]\s]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener">$2</a>');
  s = s.replace(/\[url\]((?:https?|ftp|ts3server):\/\/[^\]\s]+)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[^"'>=\]\/])((?:https?|ftp):\/\/[^\s<]+)/gi, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s.replace(/\n/g, '<br>');
}

const SPACER_RE = /^\[(c|r|l|\*)?spacer(\d*)\](.*)$/i;
function spacerInfo(name) {
  const m = SPACER_RE.exec(name);
  if (!m) return null;
  const k = (m[1] || '').toLowerCase();
  return { align: k === 'c' ? 'center' : k === 'r' ? 'right' : 'left', repeat: k === '*', text: m[3] };
}

/* ============================ state ============================ */
const S = {
  ws: null, connected: false, connecting: false,
  server: null, channels: new Map(), clients: new Map(), serverGroups: [], channelGroups: [],
  selfId: null, selfUid: '', admin: false, sel: null, collapsed: new Set(),
  tabs: [{ id: 'server', title: 'Server' }, { id: 'channel', title: 'Channel' }],
  active: 'server', logs: { server: [], channel: [] }, unread: new Set(),
  nickname: localStorage.getItem('ts3.nick') || 'TeamSpeakUser',
  address: localStorage.getItem('ts3.addr') || (location.hostname || 'localhost') + ':9987',
  away: false, awayMessage: '', inputMuted: false, outputMuted: false, commander: false,
  ping: null, uptimeBase: 0, pendingConnect: null,
  bookmarks: JSON.parse(localStorage.getItem('ts3.bookmarks') || '[]'),
  opts: Object.assign({ timestamps: true, joinleave: true, bbcode: true, pokeSound: true }, JSON.parse(localStorage.getItem('ts3.opts') || '{}'))
};
const E = {
  win: $('#window'), tree: $('#tree'), treepane: $('#treepane'), info: $('#info'), banner: $('#banner'), tabs: $('#tabs'), log: $('#log'),
  input: $('#chatinput'), status: $('#status-text'), ptt: $('#status-ptt'), statusIcon: $('#status-icon'), ping: $('#status-ping'), menubar: $('#menubar'), toolbar: $('#toolbar')
};

function send(o) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); }
const self = () => S.clients.get(S.selfId);
const chanName = cid => { const c = S.channels.get(Number(cid)); return c ? c.name : '?'; };
const chanLink = cid => `<a class="chan" data-cid="${cid}">${q(chanName(cid))}</a>`;
const nickLink = (clid, nick) => `<a class="nick" data-clid="${clid}">${q(nick != null ? nick : (S.clients.get(clid) || {}).nickname || '?')}</a>`;
const groupOf = id => S.serverGroups.find(g => g.sgid === id);
const cgroupOf = id => S.channelGroups.find(g => g.cgid === id);
const channelTree = pid => [...S.channels.values()].filter(c => c.pid === pid).sort((a, b) => a.order - b.order || a.cid - b.cid);
const clientsIn = cid => [...S.clients.values()].filter(c => c.cid === cid).sort((a, b) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' }));

/* ============================ tree ============================ */
function clientIcon(c) {
  if (c.whispering) return 'i-player-whisper';
  if (c.away) return 'i-away';
  if (c.outputMuted) return 'i-output-muted';
  if (c.inputMuted) return 'i-input-muted';
  if (c.channelCommander) return c.talking ? 'i-player-cmd-on' : 'i-player-cmd-off';
  return c.talking ? 'i-player-on' : 'i-player-off';
}
function channelIcon(ch) {
  if (ch.maxClients >= 0 && clientsIn(ch.cid).length >= ch.maxClients) return 'i-ch-red';
  if (ch.moderated) return 'i-ch-yellow';
  return 'i-ch-green';
}
function isSel(type, id) { return S.sel && S.sel.type === type && S.sel.id === id; }

function renderTree() {
  if (!S.connected) { E.tree.innerHTML = ''; return; }
  const rows = [];
  rows.push(`<div class="row${isSel('server', 0) ? ' sel' : ''}" data-type="server" data-id="0" style="padding-left:3px"><span class="exp"></span>${ico('i-server')}<span class="name">${esc(S.server.name)}</span></div>`);
  const walk = (pid, depth) => {
    for (const ch of channelTree(pid)) {
      const kids = channelTree(ch.cid), cls = clientsIn(ch.cid);
      const sp = spacerInfo(ch.name);
      const indent = 3 + depth * 18;
      if (sp) {
        const txt = sp.repeat ? `<span class="rep">${esc(sp.text.repeat(Math.ceil(300 / Math.max(1, sp.text.length))))}</span>` : esc(sp.text);
        rows.push(`<div class="row spacer ${sp.align}${isSel('channel', ch.cid) ? ' sel' : ''}" data-type="channel" data-id="${ch.cid}" data-spacer="1" style="padding-left:${indent + 14}px"><span class="name">${txt}</span></div>`);
        continue;
      }
      const collapsed = S.collapsed.has(ch.cid);
      const hasKids = kids.length > 0 || cls.length > 0;
      const flags = [];
      if (ch.isDefault) flags.push(ico('i-home'));
      if (ch.music) flags.push(ico('i-music'));
      if (ch.hasPassword) flags.push(ico('i-lock'));
      const exp = hasKids ? ico(collapsed ? 'i-tri-closed' : 'i-tri-open') : '';
      rows.push(`<div class="row${isSel('channel', ch.cid) ? ' sel' : ''}" data-type="channel" data-id="${ch.cid}" style="padding-left:${indent}px"><span class="exp" data-exp="${ch.cid}">${exp}</span>${ico(channelIcon(ch))}<span class="name">${esc(ch.name)}</span><span class="flags">${flags.join('')}</span></div>`);
      if (collapsed) continue;
      for (const c of cls) {
        const groups = c.serverGroups.map(groupOf).filter(g => g && g.icon).map(g => ico('i-g-' + g.icon)).join('');
        const cg = cgroupOf(c.channelGroup);
        const cgi = cg && cg.icon ? ico('i-g-' + cg.icon) : '';
        const name = esc(c.nickname) + (c.away && c.awayMessage ? ` <span class="awaymsg">[${esc(c.awayMessage)}]</span>` : '');
        rows.push(`<div class="row crow${c.clid === S.selfId ? ' self' : ''}${isSel('client', c.clid) ? ' sel' : ''}" data-type="client" data-id="${c.clid}" draggable="true" style="padding-left:${indent + 18}px"><span class="exp"></span>${ico(clientIcon(c), 'cicon')}<span class="name">${name}</span><span class="flags">${cgi}${groups}${flag(c.country)}</span></div>`);
      }
      walk(ch.cid, depth + 1);
    }
  };
  walk(0, 1);
  E.tree.innerHTML = rows.join('');
}
function updateClientIcon(clid) {
  const c = S.clients.get(clid); if (!c) return;
  const use = E.tree.querySelector(`.row[data-type="client"][data-id="${clid}"] .cicon use`);
  if (use) use.setAttribute('href', '#' + clientIcon(c));
  if (clid === S.selfId) E.statusIcon.querySelector('use').setAttribute('href', '#' + clientIcon(c));
}

/* ============================ info frame ============================ */
function renderBanner() {
  const b = S.connected && S.server.hostbanner;
  if (!b) { E.banner.style.display = 'none'; return; }
  E.banner.style.display = '';
  E.banner.title = b.url || '';
  E.banner.innerHTML = b.image ? `<img src="${esc(b.image)}" alt="">` : `<div class="bt">${esc(b.text || S.server.name)}</div>${b.subtext ? `<div class="bs">${esc(b.subtext)}</div>` : ''}`;
}
function kv(rows) { return `<table>${rows.filter(Boolean).map(([k, v]) => `<tr><td class="k">${k}:</td><td>${v}</td></tr>`).join('')}</table>`; }
function renderInfo() {
  if (!S.connected || !S.sel) { E.info.innerHTML = ''; return; }
  const { type, id } = S.sel;
  if (type === 'server') {
    const srv = S.server;
    E.info.innerHTML = `<div class="ititle">${ico('i-server')}<span>${esc(srv.name)}</span></div>` + kv([
      ['Address', esc(S.address)],
      ['Clients', `${S.clients.size} / ${srv.maxClients}`],
      ['Channels', String(S.channels.size)],
      ['Uptime', fmtDur(Date.now() - S.uptimeBase)],
      ['Platform', esc(srv.platform)],
      ['Version', esc(srv.version)],
      ['Created', fmtDate(srv.created)],
      ['Unique ID', `<span class="muted">${esc(srv.uniqueId)}</span>`]
    ]) + (srv.welcome ? `<div class="desc"><b>Welcome message:</b><br>${S.opts.bbcode ? bbcode(srv.welcome) : esc(srv.welcome)}</div>` : '');
  } else if (type === 'channel') {
    const ch = S.channels.get(id); if (!ch) return (E.info.innerHTML = '');
    const sp = spacerInfo(ch.name);
    const n = clientsIn(ch.cid).length;
    E.info.innerHTML = `<div class="ititle">${sp ? '' : ico(channelIcon(ch))}<span>${esc(sp ? sp.text : ch.name)}</span></div>` + kv([
      ch.topic ? ['Topic', S.opts.bbcode ? bbcode(ch.topic) : esc(ch.topic)] : null,
      ['Codec', esc(ch.codec)],
      ['Codec Quality', String(ch.codecQuality)],
      ['Type', ch.permanent ? 'Permanent' : 'Temporary'],
      ['Max. Clients', ch.maxClients < 0 ? 'Unlimited' : String(ch.maxClients)],
      ['Current Clients', String(n)],
      ['Subscription Status', 'Subscribed'],
      ['Needed Talk Power', String(ch.neededTalkPower || 0)],
      ch.hasPassword ? ['Password', 'Yes'] : null,
      ch.moderated ? ['Moderated', 'Yes'] : null,
      ch.isDefault ? ['Default Channel', 'Yes'] : null
    ]) + (ch.description ? `<div class="desc"><b>Description:</b><br>${S.opts.bbcode ? bbcode(ch.description) : esc(ch.description)}</div>` : '');
  } else if (type === 'client') {
    const c = S.clients.get(id); if (!c) return (E.info.innerHTML = '');
    const groups = c.serverGroups.map(groupOf).filter(Boolean).map(g => `<span class="grp">${g.icon ? ico('i-g-' + g.icon) : ''}${esc(g.name)}</span>`).join(', ') || '<span class="muted">none</span>';
    const cg = cgroupOf(c.channelGroup);
    E.info.innerHTML = `<div class="ititle">${ico(clientIcon(c))}<span>${esc(c.nickname)}</span></div>` + kv([
      c.description ? ['Description', esc(c.description)] : null,
      ['Server Groups', groups],
      ['Channel Group', cg ? `<span class="grp">${cg.icon ? ico('i-g-' + cg.icon) : ''}${esc(cg.name)}</span>` : '-'],
      ['Country', `${flag(c.country)} ${esc(COUNTRIES[c.country] || c.country || 'Unknown')}`],
      ['Version', `${esc(c.version)} on ${esc(c.platform)}`],
      ['Connected', fmtDur(Date.now() - c.connectedAt)],
      ['Idle', fmtDur(Date.now() - c.idleSince)],
      c.away ? ['Away', c.awayMessage ? esc(c.awayMessage) : 'Yes'] : null,
      c.inputMuted ? ['Microphone', 'Muted'] : null,
      c.outputMuted ? ['Speakers/Headphones', 'Muted'] : null,
      c.channelCommander ? ['Channel Commander', 'Yes'] : null,
      ['Volume Modifier', '0 dB'],
      ['Unique ID', `<span class="muted">${esc(c.uid)}</span>`]
    ]);
  }
}

/* ============================ chat ============================ */
function addLine(tab, html, cls = '') {
  if (!S.logs[tab]) S.logs[tab] = [];
  const line = `<div class="line ${cls}">${S.opts.timestamps ? tstamp() + ' ' : ''}${html}</div>`;
  S.logs[tab].push(line);
  if (S.logs[tab].length > 500) S.logs[tab].shift();
  if (tab === S.active) {
    const atBottom = E.log.scrollTop + E.log.clientHeight >= E.log.scrollHeight - 30;
    E.log.insertAdjacentHTML('beforeend', line);
    if (atBottom) E.log.scrollTop = E.log.scrollHeight;
  } else if (S.tabs.some(t => t.id === tab) && cls !== 'sys') { S.unread.add(tab); renderTabs(); }
}
function renderTabs() {
  E.tabs.innerHTML = S.tabs.map(t => `<div class="tab${t.id === S.active ? ' active' : ''}${S.unread.has(t.id) ? ' unread' : ''}" data-tab="${t.id}">${esc(t.title)}${t.closable ? `<span class="tabx" data-close="${t.id}" title="Close">${ico('i-close')}</span>` : ''}</div>`).join('');
}
function renderLog() { E.log.innerHTML = (S.logs[S.active] || []).join(''); E.log.scrollTop = E.log.scrollHeight; }
function switchTab(id) { S.active = id; S.unread.delete(id); renderTabs(); renderLog(); E.input.focus(); }
function openPrivateTab(clid, focus = true) {
  const c = S.clients.get(clid); if (!c) return;
  const id = 'p' + clid;
  if (!S.tabs.some(t => t.id === id)) { S.tabs.push({ id, title: c.nickname, clid, closable: true }); S.logs[id] = S.logs[id] || []; }
  if (focus) switchTab(id); else renderTabs();
}
function closeTab(id) {
  S.tabs = S.tabs.filter(t => t.id !== id); delete S.logs[id]; S.unread.delete(id);
  if (S.active === id) S.active = 'server';
  renderTabs(); renderLog();
}
function sendChat(text) {
  text = text.trim(); if (!text || !S.connected) return;
  if (text.startsWith('/')) return slashCommand(text);
  if (S.active === 'server') send({ t: 'msg', mode: 3, target: 1, text });
  else if (S.active === 'channel') send({ t: 'msg', mode: 2, target: self().cid, text });
  else { const tab = S.tabs.find(t => t.id === S.active); if (tab) send({ t: 'msg', mode: 1, target: tab.clid, text }); }
}
function slashCommand(text) {
  const [cmd, ...rest] = text.slice(1).split(' '); const arg = rest.join(' ');
  switch (cmd.toLowerCase()) {
    case 'nick': send({ t: 'update', patch: { nickname: arg } }); break;
    case 'away': send({ t: 'update', patch: { away: true, awayMessage: arg } }); break;
    case 'back': send({ t: 'update', patch: { away: false, awayMessage: '' } }); break;
    case 'msg': { const [nick, ...m] = rest; const c = [...S.clients.values()].find(x => x.nickname === nick); if (c) send({ t: 'msg', mode: 1, target: c.clid, text: m.join(' ') }); else addLine(S.active, 'Unknown client', 'err'); break; }
    case 'poke': { const [nick, ...m] = rest; const c = [...S.clients.values()].find(x => x.nickname === nick); if (c) send({ t: 'poke', clid: c.clid, text: m.join(' ') }); else addLine(S.active, 'Unknown client', 'err'); break; }
    case 'me': if (S.active === 'channel') send({ t: 'msg', mode: 2, target: self().cid, text: '* ' + self().nickname + ' ' + arg }); break;
    case 'ping': addLine(S.active, `Ping: ${S.ping == null ? '?' : S.ping} ms`, 'sys'); break;
    case 'help': addLine(S.active, 'Available commands: /nick, /away [msg], /back, /msg &lt;nick&gt; &lt;text&gt;, /poke &lt;nick&gt; &lt;text&gt;, /me, /ping', 'sys'); break;
    default: addLine(S.active, `Unknown command: /${esc(cmd)}`, 'err');
  }
}

/* ============================ status / toolbar / menus ============================ */
function setStatus(text, icon) { E.status.textContent = text; if (icon) E.statusIcon.querySelector('use').setAttribute('href', '#' + icon); }
function renderStatus() {
  if (S.connected) { const me = self(); setStatus(`Connected as "${me.nickname}"`, clientIcon(me)); E.ping.textContent = S.ping == null ? '' : `Ping: ${S.ping} ms   Pkt Loss: 0.00 %`; }
  else { setStatus(S.connecting ? 'Connecting...' : 'Not connected', 'i-player-off'); E.ping.textContent = ''; }
  if (E.ptt) {
    const vc = window.TSVoice && S.connected && TSVoice.isSupported() ? TSVoice.getConfig() : null;
    E.ptt.textContent = !vc ? '' : vc.mode === 'continuous' ? 'Continuous Transmission' : `Push-To-Talk: ${TSVoice.hotkeyLabel(vc.hotkey)}`;
  }
}

const TOOLBAR = [
  { icon: 'i-connect', title: 'Connect', action: () => connectDialog() },
  { icon: 'i-disconnect', title: 'Disconnect', enabled: () => S.connected, action: () => disconnect() },
  { icon: 'i-bookmarks', title: 'Bookmarks', dd: true, action: (e, el) => menuAt(bookmarksMenu(), el) },
  { sep: true },
  { icon: 'i-away', title: 'Away', toggle: () => S.away, action: () => toggleAway() },
  { icon: 'i-mic', title: 'Mute Microphone', toggle: () => S.inputMuted, action: () => toggleMute('inputMuted') },
  { icon: 'i-speaker', title: 'Mute Speakers/Headphones', toggle: () => S.outputMuted, action: () => toggleMute('outputMuted') },
  { sep: true },
  { icon: 'i-player-cmd-on', title: 'Channel Commander', toggle: () => S.commander, action: () => toggleCommander() },
  { sep: true },
  { icon: 'i-contacts', title: 'Contacts', action: () => contactsDialog() },
  { icon: 'i-options', title: 'Options', action: () => optionsDialog() },
  { icon: 'i-key', title: 'Use Privilege Key', enabled: () => S.connected, action: () => usePrivilegeKeyDialog() },
  { right: true, icon: 'i-hostbutton', title: () => (S.server && S.server.hostbutton && S.server.hostbutton.tooltip) || 'Hostbutton', enabled: () => !!(S.connected && S.server.hostbutton), action: () => window.open(S.server.hostbutton.url, '_blank') }
];
function renderToolbar() {
  E.toolbar.innerHTML = '';
  TOOLBAR.forEach(t => {
    if (t.sep) return E.toolbar.appendChild(h('div', { class: 'tbsep' }));
    const el = h('div', { class: 'tb' + (t.dd ? ' dd' : '') + (t.right ? ' tb-right' : '') + (t.enabled && !t.enabled() ? ' dis' : '') + (t.toggle && t.toggle() ? ' on' : ''), title: typeof t.title === 'function' ? t.title() : t.title }, ico(t.icon) + (t.dd ? '<span class="arrow"></span>' : ''));
    el.addEventListener('click', e => t.action(e, el));
    E.toolbar.appendChild(el);
  });
}

const MENUS = {
  Connections: () => [
    { label: 'Connect...', icon: 'i-connect', action: () => connectDialog() },
    { label: 'Disconnect', icon: 'i-disconnect', disabled: !S.connected, action: () => disconnect() },
    { label: 'Disconnect from all', disabled: !S.connected, action: () => disconnect() },
    { sep: true },
    { label: 'Connection Info', icon: 'i-info', disabled: !S.connected, action: () => connectionInfoDialog() },
    { sep: true },
    { label: 'Quit', action: () => quit() }
  ],
  Bookmarks: () => [
    { label: 'Add to Bookmarks', icon: 'i-add', disabled: !S.connected, action: () => addBookmark() },
    { label: 'Manage Bookmarks', icon: 'i-bookmarks', action: () => manageBookmarksDialog() },
    { sep: true },
    ...(S.bookmarks.length ? S.bookmarks.map(b => ({ label: b.name, icon: 'i-server', action: () => connectDialog(b) })) : [{ label: '(no bookmarks)', disabled: true }])
  ],
  Self: () => [
    { label: 'Away', checked: S.away, icon: S.away ? 'i-check' : null, action: () => toggleAway() },
    { label: 'Set Away Message...', action: () => awayMessageDialog() },
    { sep: true },
    { label: 'Mute Microphone', checked: S.inputMuted, icon: S.inputMuted ? 'i-check' : null, action: () => toggleMute('inputMuted') },
    { label: 'Mute Speakers/Headphones', checked: S.outputMuted, icon: S.outputMuted ? 'i-check' : null, action: () => toggleMute('outputMuted') },
    { sep: true },
    { label: 'Channel Commander', checked: S.commander, icon: S.commander ? 'i-check' : null, action: () => toggleCommander() },
    { sep: true },
    { label: 'Change Nickname...', icon: 'i-edit', disabled: !S.connected, action: () => nicknameDialog() },
    { label: 'Set Description...', disabled: !S.connected, action: () => descriptionDialog() },
    { label: 'Set Avatar...', disabled: true },
    { label: 'Set Phonetic Nickname...', disabled: true }
  ],
  Permissions: () => [
    { label: 'Server Groups', icon: 'i-g-sa', disabled: !S.connected, action: () => serverGroupsDialog() },
    { label: 'Channel Groups', icon: 'i-g-ca', disabled: !S.connected, action: () => channelGroupsDialog() },
    { label: 'Client Permissions', disabled: true },
    { label: 'Channel Permissions', disabled: true },
    { label: 'Channel Client Permissions', disabled: true },
    { sep: true },
    { label: 'Privilege Keys', icon: 'i-key', disabled: !S.connected || !S.admin, action: () => privilegeKeysDialog() },
    { label: 'Use Privilege Key', icon: 'i-key', disabled: !S.connected, action: () => usePrivilegeKeyDialog() },
    { sep: true },
    { label: 'Permission Overview', disabled: true }
  ],
  Tools: () => [
    { label: 'Options', icon: 'i-options', shortcut: 'Alt+P', action: () => optionsDialog() },
    { label: 'Identities', icon: 'i-identity', action: () => identitiesDialog() },
    { label: 'Hotkeys', disabled: true },
    { label: 'Sound Pack Setup', disabled: true },
    { sep: true },
    { label: 'Contacts', icon: 'i-contacts', action: () => contactsDialog() },
    { label: 'Ban List', icon: 'i-ban', disabled: !S.connected || !S.admin, action: () => banListDialog() },
    { label: 'Complaints List', disabled: true },
    { label: 'Offline Messages', disabled: true },
    { label: 'File Browser', icon: 'i-folder', disabled: true },
    { sep: true },
    { label: 'ServerQuery Login', icon: 'i-query', disabled: !S.connected, action: () => serverQueryDialog() }
  ],
  Help: () => [
    { label: 'Help Contents', shortcut: 'F1', disabled: true },
    { label: 'Visit TeamSpeak Website', action: () => window.open('http://www.teamspeak.com', '_blank') },
    { label: 'Check for Update', action: () => msgBox('Check for Update', 'TeamSpeak 3 is up to date.', 'i-info') },
    { sep: true },
    { label: 'About TeamSpeak 3', icon: 'i-ts3', action: () => aboutDialog() }
  ]
};
function renderMenubar() {
  E.menubar.innerHTML = '';
  for (const name of Object.keys(MENUS)) {
    const el = h('div', { class: 'mb-item' }, esc(name));
    el.addEventListener('mousedown', e => { e.preventDefault(); if (menuAnchor === el) closeMenu(); else menuAt(MENUS[name](), el); });
    el.addEventListener('mouseenter', () => { if (openMenu && menuAnchor && menuAnchor !== el && menuAnchor.classList.contains('mb-item')) menuAt(MENUS[name](), el); });
    E.menubar.appendChild(el);
  }
}
function bookmarksMenu() { return MENUS.Bookmarks(); }

/* ============================ popup menus ============================ */
let openMenu = null, menuAnchor = null, zTop = 300;
function showMenu(items, x, y, anchor) {
  closeMenu();
  const m = h('div', { class: 'menu', style: `left:${x}px;top:${y}px;z-index:${++zTop + 5000}` });
  m.innerHTML = items.map((it, i) => it.sep ? '<div class="msep"></div>' :
    `<div class="mi${it.disabled ? ' disabled' : ''}${it.checked ? ' checked' : ''}" data-i="${i}">${it.icon ? ico(it.icon, 'ico') : ''}<span class="lbl">${esc(it.label)}</span>${it.shortcut ? `<span class="sc">${esc(it.shortcut)}</span>` : ''}</div>`).join('');
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  if (r.right > innerWidth) m.style.left = Math.max(0, x - r.width) + 'px';
  if (r.bottom > innerHeight) m.style.top = Math.max(0, (anchor ? y - r.height - anchor.offsetHeight : y - r.height)) + 'px';
  m.addEventListener('mouseup', e => {
    const mi = e.target.closest('.mi'); if (!mi || mi.classList.contains('disabled')) return;
    const it = items[+mi.dataset.i]; closeMenu(); if (it.action) it.action();
  });
  m.addEventListener('contextmenu', e => e.preventDefault());
  openMenu = m; menuAnchor = anchor || null; if (anchor) anchor.classList.add('open');
}
function menuAt(items, anchor) { const r = anchor.getBoundingClientRect(); showMenu(items, r.left, r.bottom, anchor); }
function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; } if (menuAnchor) { menuAnchor.classList.remove('open'); menuAnchor = null; } }
document.addEventListener('mousedown', e => { if (openMenu && !openMenu.contains(e.target) && !(menuAnchor && menuAnchor.contains(e.target))) closeMenu(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (openMenu) return closeMenu();
  if (e.target.closest && e.target.closest('.dlg')) return; // handled by the dialog itself
  const top = $$('.dlg').sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0];
  if (top && top._cancel) top._cancel();
});

function serverMenu() {
  return [
    { label: 'Edit Virtual Server', icon: 'i-edit', disabled: !S.admin, action: () => editServerDialog() },
    { label: 'Create Channel', icon: 'i-add', disabled: !S.admin, action: () => channelDialog({ pid: 0 }) },
    { sep: true },
    { label: 'Server Chat', icon: 'i-chat', action: () => switchTab('server') },
    { label: 'Connection Info', icon: 'i-info', action: () => connectionInfoDialog() },
    { sep: true },
    { label: 'Expand All', action: () => { S.collapsed.clear(); renderTree(); } },
    { label: 'Collapse All', action: () => { for (const c of S.channels.values()) if (!spacerInfo(c.name)) S.collapsed.add(c.cid); renderTree(); } }
  ];
}
function channelMenu(ch) {
  const sp = !!spacerInfo(ch.name);
  const inIt = self() && self().cid === ch.cid;
  return [
    { label: 'Switch to Channel', icon: 'i-ch-green', disabled: sp || inIt, action: () => joinChannel(ch.cid) },
    { label: 'Channel Chat', icon: 'i-chat', disabled: !inIt, action: () => switchTab('channel') },
    { sep: true },
    { label: 'Edit Channel', icon: 'i-edit', disabled: !S.admin, action: () => channelDialog({ edit: ch }) },
    { label: 'Delete Channel', icon: 'i-delete', disabled: !S.admin || ch.isDefault, action: () => confirmBox('Delete Channel', `Do you really want to delete the channel ${q(sp ? spacerInfo(ch.name).text : ch.name)}?`, () => send({ t: 'channeldelete', cid: ch.cid })) },
    { sep: true },
    { label: 'Create Channel', icon: 'i-add', disabled: !S.admin, action: () => channelDialog({ pid: 0 }) },
    { label: 'Create Sub-Channel', icon: 'i-add', disabled: !S.admin || sp, action: () => channelDialog({ pid: ch.cid }) },
    { sep: true },
    { label: 'Subscribe to Channel', checked: true, icon: 'i-check', action: () => {} },
    { label: 'Copy Channel Link', action: () => navigator.clipboard && navigator.clipboard.writeText(`ts3server://${S.address.split(':')[0]}?cid=${ch.cid}`).catch(() => {}) }
  ];
}
function clientMenu(c) {
  if (c.clid === S.selfId) {
    return [
      { label: 'Change Nickname...', icon: 'i-edit', action: () => nicknameDialog() },
      { label: 'Set Description...', action: () => descriptionDialog() },
      { sep: true },
      { label: 'Away', checked: S.away, icon: S.away ? 'i-check' : null, action: () => toggleAway() },
      { label: 'Mute Microphone', checked: S.inputMuted, icon: S.inputMuted ? 'i-check' : null, action: () => toggleMute('inputMuted') },
      { label: 'Mute Speakers/Headphones', checked: S.outputMuted, icon: S.outputMuted ? 'i-check' : null, action: () => toggleMute('outputMuted') },
      { sep: true },
      { label: 'Copy Unique ID', action: () => navigator.clipboard && navigator.clipboard.writeText(c.uid).catch(() => {}) }
    ];
  }
  const adminOnly = !S.admin;
  return [
    { label: 'Open Text Chat', icon: 'i-chat', action: () => openPrivateTab(c.clid) },
    { label: 'Poke Client', icon: 'i-poke', action: () => pokeDialog(c) },
    { sep: true },
    { label: 'Client Permissions', disabled: true },
    { label: 'Set Server Groups', icon: 'i-g-sa', disabled: adminOnly, action: () => setGroupsDialog(c) },
    { label: 'Set Channel Group', icon: 'i-g-ca', disabled: true },
    { sep: true },
    { label: 'Move Client to your Channel', disabled: adminOnly || (self() && self().cid === c.cid), action: () => send({ t: 'move', clid: c.clid, cid: self().cid }) },
    { label: 'Kick Client from Channel', icon: 'i-kick', disabled: adminOnly, action: () => kickDialog(c, 'channel') },
    { label: 'Kick Client from Server', icon: 'i-kick', disabled: adminOnly, action: () => kickDialog(c, 'server') },
    { label: 'Ban Client', icon: 'i-ban', disabled: adminOnly || c.clid === S.selfId, action: () => banDialog(c) },
    { sep: true },
    { label: 'Add as Friend', icon: 'i-contacts', action: () => addContact(c) },
    { label: 'Mute Client', disabled: true },
    { label: 'Copy Unique ID', action: () => navigator.clipboard && navigator.clipboard.writeText(c.uid).catch(() => {}) }
  ];
}

/* ============================ dialogs ============================ */
function dialog({ title, icon = 'i-ts3', width = 380, body, buttons = [], onOpen, cls = '' }) {
  const dlg = h('div', { class: 'dlg ' + cls, style: `width:${width}px;z-index:${++zTop}`, tabindex: '-1' });
  dlg.innerHTML = `<div class="dlg-title">${ico(icon)}<span class="t">${esc(title)}</span><span class="dlg-x" title="Close">${ico('i-close')}</span></div>
    <div class="dlg-inner"><div class="dlg-body">${body}</div>${buttons.length ? `<div class="dlg-buttons">${buttons.map((b, i) => `<button class="btn${b.primary ? ' default' : ''}${b.left ? ' left' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>` : ''}</div>`;
  $('#desktop').appendChild(dlg);
  const dw = dlg.offsetWidth, dh = dlg.offsetHeight;
  const wr = E.win.classList.contains('hidden') ? { left: 0, top: 0, width: innerWidth, height: innerHeight - 40 } : E.win.getBoundingClientRect();
  dlg.style.left = Math.max(4, Math.round(wr.left + (wr.width - dw) / 2 + (Math.random() * 30 - 15))) + 'px';
  dlg.style.top = Math.max(4, Math.round(wr.top + (wr.height - dh) / 2 + (Math.random() * 30 - 15))) + 'px';
  const api = { el: dlg, close() { dlg.remove(); }, $: s => dlg.querySelector(s) };
  const run = b => { if (!b) return; const r = b.onClick ? b.onClick(api) : undefined; if (r !== false) api.close(); };
  const cancel = () => { const c = buttons.find(b => b.cancel); if (c) run(c); else api.close(); };
  dlg._cancel = cancel;
  dlg.querySelector('.dlg-x').addEventListener('click', cancel);
  $$('.dlg-buttons .btn', dlg).forEach(btn => btn.addEventListener('click', () => run(buttons[+btn.dataset.i])));
  dlg.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); run(buttons.find(b => b.primary)); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  dlg.addEventListener('mousedown', () => { dlg.style.zIndex = ++zTop; $$('.dlg').forEach(d => d.classList.toggle('inactive', d !== dlg)); });
  $$('.dlg').forEach(d => d.classList.toggle('inactive', d !== dlg));
  makeDraggable(dlg, dlg.querySelector('.dlg-title'));
  const first = dlg.querySelector('input:not([readonly]):not([type=checkbox]),textarea,select,button');
  if (first) { first.focus(); if (first.select && first.tagName === 'INPUT') first.select(); } else dlg.focus();
  if (onOpen) onOpen(api);
  return api;
}
function msgBox(title, text, icon = 'i-info', onClose) {
  return dialog({ title, icon: 'i-ts3', width: 360, body: `<div class="msgbox">${ico(icon)}<div class="txt">${text}</div></div>`, buttons: [{ label: 'OK', primary: true, cancel: true, onClick: onClose }] });
}
function confirmBox(title, text, onYes) {
  return dialog({ title, width: 360, body: `<div class="msgbox">${ico('i-warn')}<div class="txt">${text}</div></div>`, buttons: [{ label: 'Yes', primary: true, onClick: onYes }, { label: 'No', cancel: true }] });
}
function errorLine(msg) { addLine(S.active, esc(msg.charAt(0).toUpperCase() + msg.slice(1)), 'err'); }

function connectDialog(preset) {
  const b = preset || {};
  dialog({
    title: 'Connect', icon: 'i-connect', width: 400,
    body: `<div class="form">
      <label>Server Nickname or Address:</label><input class="inp" id="c-addr" value="${esc(b.address || S.address)}">
      <label>Server Password:</label><input class="inp" id="c-pw" type="password" value="${esc(b.password || '')}">
      <label>Nickname:</label><input class="inp" id="c-nick" value="${esc(b.nickname || S.nickname)}">
    </div>
    <div id="c-more" style="display:none"><div class="form" style="margin-top:8px;padding-top:8px;border-top:1px solid #d5dfe5">
      <label>One-Time Privilege Key:</label><input class="inp mono" id="c-token" value="">
      <label>Default Channel:</label><input class="inp" id="c-chan" value="${esc(b.channel || '')}">
      <label>Channel Password:</label><input class="inp" id="c-cpw" type="password" value="">
    </div></div>`,
    buttons: [
      { label: 'More ▾', left: true, onClick: a => { const m = a.$('#c-more'); m.style.display = m.style.display === 'none' ? '' : 'none'; return false; } },
      { label: 'Connect', primary: true, onClick: a => connect({ address: a.$('#c-addr').value.trim() || 'localhost', password: a.$('#c-pw').value, nickname: a.$('#c-nick').value.trim() || 'TeamSpeakUser', token: a.$('#c-token').value.trim(), channel: a.$('#c-chan').value.trim(), channelPassword: a.$('#c-cpw').value }) },
      { label: 'Cancel', cancel: true }
    ],
    onOpen: a => { const n = a.$('#c-addr'); n.focus(); n.select(); }
  });
}
function serverPasswordDialog(opts) {
  dialog({
    title: 'Server Password', icon: 'i-lock', width: 340,
    body: `<p>Enter the password for server ${q(opts.address)}:</p><input class="inp" id="sp-pw" type="password">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => { opts.password = a.$('#sp-pw').value; send({ t: 'connect', ...opts }); } }, { label: 'Cancel', cancel: true, onClick: () => disconnect(true) }]
  });
}
function channelPasswordDialog(ch) {
  dialog({
    title: 'Channel Password', icon: 'i-lock', width: 340,
    body: `<p>Enter the password for channel ${q(ch.name)}:</p><input class="inp" id="cp-pw" type="password">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'join', cid: ch.cid, password: a.$('#cp-pw').value }) }, { label: 'Cancel', cancel: true }]
  });
}
function nicknameDialog() {
  dialog({ title: 'Change Nickname', icon: 'i-edit', width: 320, body: `<p>New nickname:</p><input class="inp" id="n-nick" value="${esc(self().nickname)}" maxlength="30">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'update', patch: { nickname: a.$('#n-nick').value } }) }, { label: 'Cancel', cancel: true }] });
}
function descriptionDialog() {
  dialog({ title: 'Set Description', icon: 'i-edit', width: 340, body: `<p>Description shown in your client info:</p><input class="inp" id="d-desc" value="${esc(self().description || '')}" maxlength="200">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'update', patch: { description: a.$('#d-desc').value } }) }, { label: 'Cancel', cancel: true }] });
}
function awayMessageDialog() {
  dialog({ title: 'Set Away Status', icon: 'i-away', width: 340, body: `<p>Away message:</p><input class="inp" id="a-msg" value="${esc(S.awayMessage)}" maxlength="80">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => { S.awayMessage = a.$('#a-msg').value; S.away = true; if (S.connected) send({ t: 'update', patch: { away: true, awayMessage: S.awayMessage } }); renderToolbar(); snd('away_activated'); } }, { label: 'Cancel', cancel: true }] });
}
function pokeDialog(c) {
  dialog({ title: 'Poke Client', icon: 'i-poke', width: 360, body: `<p>Enter poke message for ${q(c.nickname)}:</p><input class="inp" id="p-msg" maxlength="100">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'poke', clid: c.clid, text: a.$('#p-msg').value }) }, { label: 'Cancel', cancel: true }] });
}
function kickDialog(c, mode) {
  dialog({ title: mode === 'channel' ? 'Kick Client from Channel' : 'Kick Client from Server', icon: 'i-kick', width: 360,
    body: `<p>Kick reason for ${q(c.nickname)}:</p><input class="inp" id="k-msg" maxlength="80">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'kick', clid: c.clid, mode, reason: a.$('#k-msg').value }) }, { label: 'Cancel', cancel: true }] });
}
function banDialog(c) {
  const durs = [[0, 'permanent'], [60, '1 minute'], [300, '5 minutes'], [1800, '30 minutes'], [3600, '1 hour'], [86400, '1 day'], [604800, '7 days']];
  dialog({ title: 'Ban Client', icon: 'i-ban', width: 380,
    body: `<p>Ban ${q(c.nickname)} from the server:</p><div class="form"><label>Reason:</label><input class="inp" id="b-msg" maxlength="80"><label>Duration:</label><select class="inp" id="b-dur">${durs.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'ban', clid: c.clid, reason: a.$('#b-msg').value, duration: +a.$('#b-dur').value }) }, { label: 'Cancel', cancel: true }] });
}
function usePrivilegeKeyDialog() {
  dialog({ title: 'Use Privilege Key', icon: 'i-key', width: 420,
    body: `<p>Enter the privilege key you received from the server administrator. Privilege keys grant you a server group or channel group.</p><input class="inp mono" id="pk-token" spellcheck="false">`,
    buttons: [{ label: 'OK', primary: true, onClick: a => { const t = a.$('#pk-token').value.trim(); if (!t) return false; send({ t: 'privkey', token: t }); } }, { label: 'Cancel', cancel: true }] });
}
function privilegeKeysDialog() {
  const a = dialog({ title: 'Privilege Keys', icon: 'i-key', width: 700,
    body: `<div class="listbox" id="pk-list" style="height:180px"><div class="li hint">Loading...</div></div>`,
    buttons: [{ label: 'Create', onClick: () => false, left: true }, { label: 'Delete', left: true, onClick: () => false }, { label: 'Close', primary: true, cancel: true }] });
  a.$('.dlg-buttons .btn').disabled = true; $$('.dlg-buttons .btn', a.el)[1].disabled = true;
  pendingKeys = a; send({ t: 'privkeylist' });
}
let pendingKeys = null, pendingQuery = null;
function serverQueryDialog() {
  pendingQuery = dialog({ title: 'ServerQuery Login', icon: 'i-query', width: 420,
    body: `<p>The ServerQuery interface allows administrators to manage the server through a raw telnet connection.</p><div id="sq-body" class="hint">Requesting login data...</div>`,
    buttons: [{ label: 'Close', primary: true, cancel: true }] });
  send({ t: 'querylogin' });
}
function setGroupsDialog(c) {
  dialog({ title: `Server Groups of "${c.nickname}"`, icon: 'i-g-sa', width: 340,
    body: `<div class="listbox" style="height:170px;padding:3px">${S.serverGroups.map(g => `<label class="li chk"><input type="checkbox" value="${g.sgid}" ${c.serverGroups.includes(g.sgid) ? 'checked' : ''}>${g.icon ? ico('i-g-' + g.icon) : '<span style="width:16px"></span>'}${esc(g.name)}</label>`).join('')}</div>`,
    buttons: [{ label: 'OK', primary: true, onClick: a => send({ t: 'setgroups', clid: c.clid, sgids: $$('input:checked', a.el).map(i => +i.value) }) }, { label: 'Cancel', cancel: true }] });
}
function serverGroupsDialog() {
  let sel = S.serverGroups[0] && S.serverGroups[0].sgid;
  const a = dialog({ title: 'Server Groups', icon: 'i-g-sa', width: 560,
    body: `<div style="display:flex;gap:10px;height:230px"><div class="listbox" id="sg-list" style="width:200px;flex:none"></div><div style="flex:1;display:flex;flex-direction:column"><div class="gt" style="margin-bottom:4px">Members:</div><div class="listbox" id="sg-members" style="flex:1"></div></div></div>`,
    buttons: [{ label: 'Add', left: true, onClick: () => false }, { label: 'Remove', left: true, onClick: () => false }, { label: 'Close', primary: true, cancel: true }] });
  $$('.dlg-buttons .btn', a.el).slice(0, 2).forEach(b => b.disabled = true);
  const draw = () => {
    a.$('#sg-list').innerHTML = S.serverGroups.map(g => `<div class="li${g.sgid === sel ? ' sel' : ''}" data-id="${g.sgid}">${g.icon ? ico('i-g-' + g.icon) : '<span style="width:16px"></span>'}${esc(g.name)} <span class="hint">(${g.sgid})</span></div>`).join('');
    const members = [...S.clients.values()].filter(c => c.serverGroups.includes(sel));
    a.$('#sg-members').innerHTML = members.length ? members.map(c => `<div class="li">${ico(clientIcon(c))}${esc(c.nickname)}</div>`).join('') : '<div class="li hint">No online members</div>';
  };
  a.$('#sg-list').addEventListener('click', e => { const li = e.target.closest('.li'); if (li) { sel = +li.dataset.id; draw(); } });
  draw();
}
function channelGroupsDialog() {
  dialog({ title: 'Channel Groups', icon: 'i-g-ca', width: 360,
    body: `<div class="listbox" style="height:160px">${S.channelGroups.map(g => `<div class="li">${g.icon ? ico('i-g-' + g.icon) : '<span style="width:16px"></span>'}${esc(g.name)} <span class="hint">(${g.cgid})</span></div>`).join('')}</div>`,
    buttons: [{ label: 'Close', primary: true, cancel: true }] });
}
let pendingBans = null;
function banListDialog() {
  const a = dialog({ title: 'Ban List', icon: 'i-ban', width: 600, body: `<div class="listbox" id="ban-list" style="height:160px"><div class="li hint">Loading...</div></div>`,
    buttons: [{ label: 'Remove', left: true, onClick: a => { const sel = a.$('#ban-list tr.sel'); if (sel) send({ t: 'bandel', id: +sel.dataset.id }); return false; } }, { label: 'Close', primary: true, cancel: true }] });
  a.$('#ban-list').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); $$('tr[data-id]', a.$('#ban-list')).forEach(x => x.classList.toggle('sel', x === tr)); });
  pendingBans = a; send({ t: 'banlist' });
}
function channelDialog({ pid = 0, edit = null }) {
  const ch = edit || { name: '', topic: '', description: '', codec: 'Speex Wideband (16 kHz)', codecQuality: 7, maxClients: -1, permanent: true, moderated: false, hasPassword: false };
  const codecs = ['Speex Narrowband (8 kHz)', 'Speex Wideband (16 kHz)', 'Speex Ultra-Wideband (32 kHz)', 'CELT Mono (48 kHz)'];
  dialog({ title: edit ? 'Edit Channel' : 'Create Channel', icon: 'i-ch-green', width: 460,
    body: `<fieldset class="group"><legend>Standard</legend><div class="form">
        <label>Name:</label><input class="inp" id="ch-name" value="${esc(ch.name)}" maxlength="40">
        <label>Password:</label><input class="inp" id="ch-pw" type="password" placeholder="${ch.hasPassword ? '(unchanged)' : ''}">
        <label>Topic:</label><input class="inp" id="ch-topic" value="${esc(ch.topic)}" maxlength="100">
        <label style="align-self:start">Description:</label><textarea class="inp" id="ch-desc" rows="3">${esc(ch.description)}</textarea>
      </div></fieldset>
      <fieldset class="group"><legend>Audio</legend><div class="form">
        <label>Codec:</label><select class="inp" id="ch-codec">${codecs.map(c => `<option${c === ch.codec ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <label>Codec Quality:</label><input class="inp" id="ch-q" type="number" min="0" max="10" value="${ch.codecQuality}">
      </div></fieldset>
      <fieldset class="group"><legend>Advanced</legend><div class="form">
        <label>Channel Type:</label><div style="display:flex;gap:12px"><label class="chk"><input type="radio" name="ch-type" value="1" ${ch.permanent ? 'checked' : ''}>Permanent</label><label class="chk"><input type="radio" name="ch-type" value="0" ${!ch.permanent ? 'checked' : ''}>Temporary</label></div>
        <label>Max. Clients:</label><div style="display:flex;gap:10px;align-items:center"><label class="chk"><input type="checkbox" id="ch-unl" ${ch.maxClients < 0 ? 'checked' : ''}>Unlimited</label><input class="inp" id="ch-max" type="number" min="1" max="512" style="width:70px" value="${ch.maxClients < 0 ? 10 : ch.maxClients}"></div>
        <label>Flags:</label><label class="chk"><input type="checkbox" id="ch-mod" ${ch.moderated ? 'checked' : ''}>Moderated (needs talk power)</label>
      </div></fieldset>`,
    buttons: [{ label: 'OK', primary: true, onClick: a => {
        const data = { name: a.$('#ch-name').value, topic: a.$('#ch-topic').value, description: a.$('#ch-desc').value, codec: a.$('#ch-codec').value, codecQuality: +a.$('#ch-q').value,
          maxClients: a.$('#ch-unl').checked ? -1 : +a.$('#ch-max').value, permanent: a.$('input[name=ch-type]:checked').value === '1', moderated: a.$('#ch-mod').checked };
        if (!data.name.trim()) return false;
        const pw = a.$('#ch-pw').value;
        if (edit) { if (pw || !ch.hasPassword) data.password = pw; send({ t: 'channeledit', cid: ch.cid, ...data }); }
        else { data.password = pw; send({ t: 'channelcreate', pid, ...data }); }
      } }, { label: 'Cancel', cancel: true }] });
}
function editServerDialog() {
  dialog({ title: 'Edit Virtual Server', icon: 'i-server', width: 480,
    body: `<div class="form"><label>Name:</label><input class="inp" id="s-name" value="${esc(S.server.name)}" maxlength="64">
      <label>Password:</label><input class="inp" id="s-pw" type="password" placeholder="(unchanged)">
      <label>Max. Clients:</label><input class="inp" id="s-max" type="number" min="1" max="1024" value="${S.server.maxClients}">
      <label style="align-self:start">Welcome Message:</label><textarea class="inp" id="s-welcome" rows="4">${esc(S.server.welcome)}</textarea>
      <label>Hostbanner URL:</label><input class="inp" id="s-hbu" value="${esc((S.server.hostbanner || {}).url || '')}">
      <label>Hostbanner Gfx URL:</label><input class="inp" id="s-hbi" value="${esc((S.server.hostbanner || {}).image || '')}">
      <label>Hostbutton Tooltip:</label><input class="inp" id="s-hbt" value="${esc((S.server.hostbutton || {}).tooltip || '')}">
      <label>Hostbutton URL:</label><input class="inp" id="s-hbl" value="${esc((S.server.hostbutton || {}).url || '')}"></div>`,
    buttons: [{ label: 'OK', primary: true, onClick: a => { const d = { name: a.$('#s-name').value, welcome: a.$('#s-welcome').value, maxClients: +a.$('#s-max').value,
        hostbanner: { url: a.$('#s-hbu').value, image: a.$('#s-hbi').value, text: (S.server.hostbanner || {}).text, subtext: (S.server.hostbanner || {}).subtext }, hostbutton: { tooltip: a.$('#s-hbt').value, url: a.$('#s-hbl').value } };
        if (a.$('#s-pw').value) d.password = a.$('#s-pw').value; send({ t: 'serveredit', ...d }); } }, { label: 'Cancel', cancel: true }] });
}
function connectionInfoDialog() {
  const a = dialog({ title: 'Connection Info', icon: 'i-info', width: 380, body: '<div id="ci"></div>', buttons: [{ label: 'Close', primary: true, cancel: true }] });
  const t0 = Date.now(); let sent = 48213, recv = 391204;
  const draw = () => { if (!a.el.isConnected) return clearInterval(iv); const me = self(); sent += 160 + Math.floor(Math.random() * 90); recv += 900 + Math.floor(Math.random() * 1400);
    a.$('#ci').innerHTML = kv([['Server', esc(S.server ? S.server.name : '-')], ['Address', esc(S.address)], ['Connected since', me ? fmtDur(Date.now() - me.connectedAt) : '-'], ['Ping', `${S.ping == null ? '?' : S.ping} ms (±${(Math.random() * 3 + 1).toFixed(1)} ms)`], ['Packet Loss', '0.00 %'], ['Bytes sent', sent.toLocaleString()], ['Bytes received', recv.toLocaleString()], ['Bandwidth (last second)', `${(1.1 + Math.random() * .8).toFixed(2)} KiB/s in, ${(.2 + Math.random() * .3).toFixed(2)} KiB/s out`], ['Encryption', 'Disabled (set by server)'], ['Filetransfer', 'idle']]); };
  draw(); const iv = setInterval(draw, 1000); void t0;
}
function contactsDialog() {
  const list = JSON.parse(localStorage.getItem('ts3.contacts') || '[]');
  dialog({ title: 'Contacts', icon: 'i-contacts', width: 420,
    body: `<div class="listbox" style="height:180px"><table><tr><th>Nickname</th><th>Status</th><th>Unique ID</th></tr>${list.map(c => { const on = [...S.clients.values()].find(x => x.uid === c.uid); return `<tr><td>${esc(c.nick)}</td><td>${on ? 'Online' : 'Offline'}</td><td class="hint">${esc(c.uid)}</td></tr>`; }).join('')}</table>${list.length ? '' : '<div class="li hint">No contacts. Right click a client and choose "Add as Friend".</div>'}</div>`,
    buttons: [{ label: 'Close', primary: true, cancel: true }] });
}
function addContact(c) {
  const list = JSON.parse(localStorage.getItem('ts3.contacts') || '[]');
  if (!list.some(x => x.uid === c.uid)) list.push({ nick: c.nickname, uid: c.uid });
  localStorage.setItem('ts3.contacts', JSON.stringify(list));
  addLine(S.active, `${nickLink(c.clid, c.nickname)} was added to your contacts as a friend`, 'sys');
}
function identitiesDialog() {
  const me = self();
  dialog({ title: 'Identities', icon: 'i-identity', width: 480,
    body: `<div style="display:flex;gap:10px"><div class="listbox" style="width:140px;height:150px;flex:none"><div class="li sel">${ico('i-identity')}Default</div></div>
      <div class="form" style="flex:1;align-content:start"><label>Identity Name:</label><input class="inp" value="Default" readonly><label>Nickname:</label><input class="inp" value="${esc(S.nickname)}" readonly>
      <label>Unique ID:</label><input class="inp mono" value="${esc(me ? me.uid : S.selfUid || '(connect to generate)')}" readonly><label>Security Level:</label><input class="inp" value="8" readonly></div></div>`,
    buttons: [{ label: 'Close', primary: true, cancel: true }] });
}
function optionsDialog() {
  const cats = ['Application', 'Myself', 'Capture', 'Playback', 'Design', 'Hotkeys', 'Whisper', 'Notifications', 'Chat', 'Downloads', 'Security', 'Addons'];
  let cur = 'Application';
  const panel = c => {
    switch (c) {
      case 'Application': return `<h4>Application</h4><label class="chk"><input type="checkbox" checked>Start minimized</label><label class="chk"><input type="checkbox" checked>Minimize to tray</label><label class="chk"><input type="checkbox">Close to tray</label><label class="chk"><input type="checkbox" checked>Always show server tree notifications</label><h4 style="margin-top:12px">Language</h4><select class="inp" style="width:160px"><option>English</option><option>Deutsch</option></select>`;
      case 'Myself': return `<h4>Myself</h4><div class="form"><label>Nickname:</label><input class="inp" value="${esc(S.nickname)}" readonly><label>Phonetic Nickname:</label><input class="inp" value=""></div>`;
      case 'Capture': {
        const vc = TSVoice.getConfig(), langs = [['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['de-DE', 'Deutsch (Deutschland)']];
        return `<h4>Capture Mode</h4><label class="chk"><input type="radio" name="o-vmode" id="o-vmode-ptt" ${vc.mode !== 'continuous' ? 'checked' : ''}>Push-To-Talk</label><label class="chk"><input type="radio" name="o-vmode" id="o-vmode-cont" ${vc.mode === 'continuous' ? 'checked' : ''}>Continuous Transmission</label>
          <div class="form" style="margin-top:8px"><label>Push-To-Talk Hotkey:</label>${hotkeyField(vc)}<label>Language:</label><select class="inp" id="o-vlang">${langs.map(([v, l]) => `<option value="${v}"${v === vc.lang ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          <label class="chk" style="margin-top:8px"><input type="checkbox" id="o-vshow" ${vc.showRecognized ? 'checked' : ''}>Show recognized text in chat</label>
          <h4 style="margin-top:12px">Test</h4><div class="voice-test"><button class="btn" id="o-vtest">Begin Test</button><span class="hint" id="o-vtest-res"></span></div>`;
      }
      case 'Playback': {
        const vol = Math.round((Number(TSVoice.getConfig().volume) || 0) * 100);
        return `<h4>Playback</h4><div class="form"><label>Playback Mode:</label><select class="inp"><option>Automatically use best mode</option><option>DirectSound</option></select><label>Playback Device:</label><select class="inp"><option>Default</option><option>Speakers (Realtek High Definition Audio)</option></select>
          <label>Voice volume:</label><div class="vol-field"><input type="range" class="vol-range" id="o-vvol" min="0" max="200" step="5" value="${vol}"><span id="o-vvol-l">${vol} %</span></div></div>
          <h4 style="margin-top:12px">Options</h4><label class="chk"><input type="checkbox" checked>Automatic voice volume leveling</label><button class="btn" id="o-vplay" style="margin-top:6px">Play test sound</button>`;
      }
      case 'Hotkeys': return `<h4>Hotkeys</h4><div class="form"><label>Push-To-Talk:</label>${hotkeyField(TSVoice.getConfig())}</div><div class="hint" style="margin-top:8px">Hold the key while speaking. Letter keys are ignored while typing in a text field.</div>`;
      case 'Design': return `<h4>Design</h4><div class="form"><label>Style:</label><select class="inp"><option>WindowsVista</option><option>Windows</option><option>Plastique</option></select><label>Icon Pack:</label><select class="inp"><option>Default</option></select></div><h4 style="margin-top:12px">Server Tree</h4><label class="chk"><input type="checkbox" checked>Show country flags</label><label class="chk"><input type="checkbox" checked>Show expand/collapse arrows</label>`;
      case 'Chat': return `<h4>Chat</h4><label class="chk"><input type="checkbox" id="o-ts" ${S.opts.timestamps ? 'checked' : ''}>Show timestamps</label><label class="chk"><input type="checkbox" id="o-bb" ${S.opts.bbcode ? 'checked' : ''}>Enable BBCode formatting</label><label class="chk"><input type="checkbox" id="o-jl" ${S.opts.joinleave ? 'checked' : ''}>Show join/leave messages in server tab</label><label class="chk"><input type="checkbox" checked>Open private chat tabs automatically</label>`;
      case 'Notifications': {
        const sc = TSSounds.getConfig(), svol = Math.round(sc.volume * 100);
        let rows = '', grp = '';
        for (const ev of TSSounds.events()) {
          if (ev.group !== grp) { grp = ev.group; rows += `<div class="li grp">${esc(grp)}</div>`; }
          rows += `<div class="li" data-ev="${ev.id}"><input type="checkbox" data-ev="${ev.id}" ${ev.enabled ? 'checked' : ''}><span>${esc(ev.label)}</span></div>`;
        }
        return `<h4>Notifications</h4><div class="form"><label>Sound Pack:</label><select class="inp" id="o-spack"><option value="default"${sc.pack !== 'none' ? ' selected' : ''}>Default Sound Pack (Female)</option><option value="none"${sc.pack === 'none' ? ' selected' : ''}>Sounds deactivated</option></select>
          <label>Volume:</label><div class="vol-field"><input type="range" class="vol-range" id="o-svol" min="0" max="100" step="5" value="${svol}"><span id="o-svol-l">${svol} %</span></div></div>
          <label class="chk" style="margin-top:8px"><input type="checkbox" id="o-poke" ${S.opts.pokeSound ? 'checked' : ''}>Show poke popup</label>
          <label class="chk"><input type="checkbox" id="o-mclick" ${sc.micClick ? 'checked' : ''}>Play mic click sound on Push-To-Talk</label>
          <h4 style="margin-top:12px">Sound Events</h4><div class="listbox snd-list" id="o-sevents" style="height:150px">${rows}</div>
          <div class="voice-test" style="margin-top:6px"><button class="btn" id="o-splay">Play</button><span class="hint">Select an event and press Play.</span></div>`;
      }
      default: return `<h4>${esc(c)}</h4><div class="hint">No options available.</div>`;
    }
  };
  const hotkeyField = vc => `<div class="hotkey-field"><input class="inp" id="o-vkey" readonly data-key="${esc(vc.hotkey)}" value="${esc(TSVoice.hotkeyLabel(vc.hotkey))}"><button class="btn" id="o-vkey-btn">Change</button></div>`;
  let cancelCapture = null;
  const a = dialog({ title: 'Options', icon: 'i-options', width: 560,
    body: `<div class="opt-wrap"><div class="listbox" id="opt-list">${cats.map(c => `<div class="li${c === cur ? ' sel' : ''}" data-c="${c}">${esc(c)}</div>`).join('')}</div><div class="opt-panel" id="opt-panel">${panel(cur)}</div></div>`,
    buttons: [{ label: 'OK', primary: true, onClick: save }, { label: 'Cancel', cancel: true }, { label: 'Apply', onClick: a => { save(a); return false; } }] });
  function save(a) {
    const g = id => a.$(id); if (g('#o-ts')) { S.opts.timestamps = g('#o-ts').checked; S.opts.bbcode = g('#o-bb').checked; S.opts.joinleave = g('#o-jl').checked; }
    if (g('#o-poke')) S.opts.pokeSound = g('#o-poke').checked;
    if (g('#o-spack')) {
      const on = {}; $$('input[data-ev]', g('#o-sevents')).forEach(i => { on[i.dataset.ev] = i.checked; });
      TSSounds.setConfig({ pack: g('#o-spack').value, volume: +g('#o-svol').value / 100, micClick: g('#o-mclick').checked, on });
    }
    localStorage.setItem('ts3.opts', JSON.stringify(S.opts)); renderInfo();
    if (cancelCapture) { cancelCapture(); cancelCapture = null; }
    const vc = {};
    if (g('#o-vmode-ptt')) vc.mode = g('#o-vmode-cont').checked ? 'continuous' : 'ptt';
    if (g('#o-vkey') && g('#o-vkey').dataset.key) vc.hotkey = g('#o-vkey').dataset.key;
    if (g('#o-vlang')) vc.lang = g('#o-vlang').value;
    if (g('#o-vshow')) vc.showRecognized = g('#o-vshow').checked;
    if (g('#o-vvol')) vc.volume = +g('#o-vvol').value / 100;
    if (Object.keys(vc).length) TSVoice.setConfig(vc);
  }
  const optPanel = a.$('#opt-panel');
  optPanel.addEventListener('input', e => {
    if (e.target.id === 'o-vvol') { a.$('#o-vvol-l').textContent = e.target.value + ' %'; TSVoice.setConfig({ volume: +e.target.value / 100 }); }
    else if (e.target.id === 'o-svol') { a.$('#o-svol-l').textContent = e.target.value + ' %'; TSSounds.setConfig({ volume: +e.target.value / 100 }); }
  });
  optPanel.addEventListener('click', e => {
    const id = e.target.id, evRow = e.target.closest('#o-sevents .li[data-ev]');
    if (evRow) $$('.li', a.$('#o-sevents')).forEach(x => x.classList.toggle('sel', x === evRow));
    else if (id === 'o-splay') { const sel = a.$('#o-sevents .li.sel'); if (sel) TSSounds.preview(sel.dataset.ev); }
    else if (id === 'o-vplay') TSVoice.playTest();
    else if (id === 'o-vkey-btn') {
      const inp = a.$('#o-vkey'), btn = e.target, prev = inp.value;
      if (cancelCapture) cancelCapture();
      inp.value = 'Press a key...'; btn.disabled = true;
      cancelCapture = TSVoice.captureKey(k => {
        cancelCapture = null; btn.disabled = false;
        if (k) { inp.dataset.key = k; inp.value = TSVoice.hotkeyLabel(k); } else inp.value = prev;
      }, inp);
    } else if (id === 'o-vtest') {
      const btn = e.target, res = a.$('#o-vtest-res');
      btn.disabled = true; res.style.color = ''; res.textContent = 'Speak now...';
      TSVoice.beginTest((text, err) => {
        btn.disabled = false;
        if (!res.isConnected) return;
        if (err) { res.style.color = '#c00000'; res.textContent = err; }
        else res.textContent = text ? `Recognized: "${text}"` : 'Nothing recognized.';
      });
    }
  });
  a.$('#opt-list').addEventListener('click', e => { const li = e.target.closest('.li'); if (!li) return; save(a); cur = li.dataset.c; $$('.li', a.$('#opt-list')).forEach(x => x.classList.toggle('sel', x === li)); a.$('#opt-panel').innerHTML = panel(cur); });
}
function aboutDialog() {
  dialog({ title: 'About TeamSpeak 3', icon: 'i-ts3', width: 440,
    body: `<div class="about">${ico('i-ts3-big')}<div><b>TeamSpeak 3 Client</b><br>Version: 3.0.6.1 [Build: 1340956745]<br>Platform: ${esc(navigator.platform.startsWith('Win') ? 'Windows' : 'Linux')}<br><br>Compiled with Qt 4.7.4<br>Speex 1.2rc1, CELT 0.7.1<br><br><span class="hint">Web look-alike of the 2012 TeamSpeak 3 client, built for a CTF challenge.<br>TeamSpeak is a registered trademark of TeamSpeak Systems GmbH.</span></div></div>`,
    buttons: [{ label: 'OK', primary: true, cancel: true }] });
}
function manageBookmarksDialog() {
  const a = dialog({ title: 'Bookmarks', icon: 'i-bookmarks', width: 480,
    body: `<div class="listbox" id="bm-list" style="height:160px"></div>`,
    buttons: [{ label: 'Delete', left: true, onClick: a => { const sel = a.$('#bm-list .li.sel'); if (sel) { S.bookmarks.splice(+sel.dataset.i, 1); saveBookmarks(); draw(); } return false; } }, { label: 'Connect', onClick: a => { const sel = a.$('#bm-list .li.sel'); if (!sel) return false; const b = S.bookmarks[+sel.dataset.i]; connect(b); } }, { label: 'Close', primary: true, cancel: true }] });
  const draw = () => { a.$('#bm-list').innerHTML = S.bookmarks.length ? S.bookmarks.map((b, i) => `<div class="li" data-i="${i}">${ico('i-server')}${esc(b.name)} <span class="hint">${esc(b.address)} as ${esc(b.nickname)}</span></div>`).join('') : '<div class="li hint">No bookmarks</div>'; };
  a.$('#bm-list').addEventListener('click', e => { const li = e.target.closest('.li[data-i]'); $$('.li', a.$('#bm-list')).forEach(x => x.classList.toggle('sel', x === li)); });
  draw();
}
function saveBookmarks() { localStorage.setItem('ts3.bookmarks', JSON.stringify(S.bookmarks)); }
function addBookmark() {
  dialog({ title: 'Add Bookmark', icon: 'i-bookmarks', width: 380,
    body: `<div class="form"><label>Bookmark Name:</label><input class="inp" id="bm-name" value="${esc(S.server.name)}"><label>Address:</label><input class="inp" id="bm-addr" value="${esc(S.address)}"><label>Nickname:</label><input class="inp" id="bm-nick" value="${esc(S.nickname)}"><label>Server Password:</label><input class="inp" id="bm-pw" type="password" value="${esc(S.lastPassword || '')}"></div>`,
    buttons: [{ label: 'OK', primary: true, onClick: a => { S.bookmarks.push({ name: a.$('#bm-name').value, address: a.$('#bm-addr').value, nickname: a.$('#bm-nick').value, password: a.$('#bm-pw').value }); saveBookmarks(); } }, { label: 'Cancel', cancel: true }] });
}
function pokePopup(from, text) {
  dialog({ title: 'Poke', icon: 'i-poke', width: 340,
    body: `<div class="poke-text">${nickLink(from.clid, from.nickname)} poked you:<br><br><b>${S.opts.bbcode ? bbcode(text) : esc(text)}</b></div>`,
    buttons: [{ label: 'Chat', onClick: () => { if (S.clients.has(from.clid)) openPrivateTab(from.clid); } }, { label: 'Close', primary: true, cancel: true }] });
}

/* ============================ actions ============================ */
function toggleAway() { S.away = !S.away; if (!S.away) S.awayMessage = ''; if (S.connected) send({ t: 'update', patch: { away: S.away, awayMessage: S.awayMessage } }); renderToolbar(); snd(S.away ? 'away_activated' : 'away_deactivated'); }
function toggleMute(k) { S[k] = !S[k]; if (S.connected) send({ t: 'update', patch: { [k]: S[k] } }); renderToolbar(); snd(k === 'inputMuted' ? (S[k] ? 'mic_muted' : 'mic_activated') : (S[k] ? 'sound_muted' : 'sound_resumed')); }
function toggleCommander() { S.commander = !S.commander; if (S.connected) send({ t: 'update', patch: { channelCommander: S.commander } }); renderToolbar(); }
function joinChannel(cid) {
  const ch = S.channels.get(cid); if (!ch || spacerInfo(ch.name)) return;
  if (self() && self().cid === cid) return;
  if (ch.hasPassword && !S.admin) return channelPasswordDialog(ch);
  send({ t: 'join', cid });
}
function select(type, id) {
  S.sel = { type, id };
  $$('.row.sel', E.tree).forEach(r => r.classList.remove('sel'));
  const row = E.tree.querySelector(`.row[data-type="${type}"][data-id="${id}"]`);
  if (row) row.classList.add('sel');
  renderInfo();
}

/* ============================ connection ============================ */
function connect(opts) {
  if (S.ws) { const old = S.ws; S.ws = null; try { old.close(); } catch (e) { /* */ } }
  resetState();
  TSSounds.unlock(); // the click on "Connect" is a user gesture: unlock audio for the notifications
  S.connecting = true; S.pendingConnect = opts; S.address = opts.address; S.nickname = opts.nickname; S.lastPassword = opts.password || '';
  localStorage.setItem('ts3.nick', S.nickname); localStorage.setItem('ts3.addr', S.address);
  renderStatus();
  switchTab('server');
  addLine('server', `Trying to connect to server on ${esc(opts.address)}`);
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => send({ t: 'connect', nickname: opts.nickname, password: opts.password || '', address: opts.address, token: opts.token || '', channel: opts.channel || '', channelPassword: opts.channelPassword || '' });
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } handle(m); };
  ws.onclose = () => {
    if (S.ws !== ws) return;
    S.ws = null;
    if (S.connected) { addLine('server', 'Disconnected from server'); if (!S.kickedOut) snd('connection_lost'); }
    else if (S.connecting && !S.connectFailed) addLine('server', 'Failed to connect to server', 'err');
    resetState(); renderAll();
  };
  ws.onerror = () => {};
}
function disconnect(silent) {
  if (S.ws) { const ws = S.ws; S.ws = null; try { ws.close(); } catch (e) { /* */ } if (S.connected && !silent) { addLine('server', 'Disconnected from server'); snd('disconnected'); } }
  resetState(); renderAll();
}
function resetState() {
  S.connected = false; S.connecting = false; S.connectFailed = false; S.kickedOut = false; S.server = null; S.channels.clear(); S.clients.clear(); S.selfId = null; S.admin = false; S.sel = null; S.ping = null;
  S.tabs = S.tabs.filter(t => !t.closable); for (const k of Object.keys(S.logs)) if (k.startsWith('p')) delete S.logs[k];
  if (S.active.startsWith('p')) S.active = 'server';
  E.input.disabled = true;
}
function renderAll() { renderTree(); renderBanner(); renderInfo(); renderTabs(); renderToolbar(); renderStatus(); }

// notification sound pack (Options > Notifications); ids follow the original client's sound/default files
function snd(id) { try { TSSounds.play(id); } catch (e) { /* decorative */ } }
function banDur(sec) {
  sec = Number(sec) || 0;
  if (!sec) return 'permanently';
  for (const [n, name] of [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]) if (sec % n === 0) { const k = sec / n; return `for ${k} ${name}${k === 1 ? '' : 's'}`; }
  return `for ${sec} seconds`;
}

function handle(m) {
  switch (m.t) {
    case 'init': {
      S.connected = true; S.connecting = false; S.server = m.server; S.uptimeBase = Date.now() - m.server.uptime * 1000;
      S.channels = new Map(m.channels.map(c => [c.cid, c])); S.clients = new Map(m.clients.map(c => [c.clid, c]));
      S.serverGroups = m.serverGroups; S.channelGroups = m.channelGroups; S.selfId = m.self.clid; S.admin = !!m.self.admin;
      const me = self(); S.selfUid = me.uid; S.nickname = me.nickname; localStorage.setItem('ts3.nick', S.nickname);
      S.away = me.away; S.inputMuted = me.inputMuted; S.outputMuted = me.outputMuted; S.commander = me.channelCommander;
      if (S.away || S.inputMuted || S.outputMuted || S.commander) send({ t: 'update', patch: { away: S.away, awayMessage: S.awayMessage, inputMuted: S.inputMuted, outputMuted: S.outputMuted, channelCommander: S.commander } });
      S.sel = { type: 'server', id: 0 }; E.input.disabled = false;
      TSVoice.setServerInfo(m.server.voice || {});
      renderAll();
      addLine('server', `Connected to Server: <a class="chan" data-cid="0">${q(S.server.name)}</a>`);
      snd('connected'); TSSounds.preload();
      if (S.server.welcome) addLine('server', S.opts.bbcode ? bbcode(S.server.welcome) : esc(S.server.welcome), 'welcome');
      S.logs.channel = []; addLine('channel', `You are now in channel ${chanLink(me.cid)}`, 'sys');
      if (m.self.tokenResult) addLine('server', esc(m.self.tokenResult), m.self.tokenOk ? 'sys' : 'err');
      ping();
      break;
    }
    case 'clientjoin': {
      S.clients.set(m.client.clid, m.client); renderTree(); if (S.sel && S.sel.type !== 'client') renderInfo();
      if (self() && m.client.cid === self().cid) snd('neutral_connection_connected_currentchannel');
      if (S.opts.joinleave) addLine('server', `${nickLink(m.client.clid, m.client.nickname)} connected to channel ${chanLink(m.client.cid)}`);
      if (self() && m.client.cid === self().cid) addLine('channel', `${nickLink(m.client.clid, m.client.nickname)} connected to channel ${chanLink(m.client.cid)}`, 'sys');
      break;
    }
    case 'clientleft': {
      const c = S.clients.get(m.clid); const nick = m.nickname || (c && c.nickname) || '?';
      S.clients.delete(m.clid);
      if (S.sel && S.sel.type === 'client' && S.sel.id === m.clid) S.sel = { type: 'server', id: 0 };
      renderTree(); renderInfo();
      let txt;
      if (m.reason === 'kicked') txt = `${nickLink(m.clid, nick)} was kicked from the server by ${nickLink(m.invoker.clid, m.invoker.nickname)}${m.kickReason ? ` (${esc(m.kickReason)})` : ''}`;
      else if (m.reason === 'banned') txt = `${nickLink(m.clid, nick)} was banned ${banDur(m.duration)} from the server by ${nickLink(m.invoker.clid, m.invoker.nickname)}${m.kickReason ? ` (${esc(m.kickReason)})` : ''}`;
      else txt = `${nickLink(m.clid, nick)} disconnected (${esc(m.reason)})`;
      if (S.opts.joinleave) addLine('server', txt);
      if (self() && m.cid === self().cid) {
        addLine('channel', txt, 'sys');
        snd(m.reason === 'kicked' ? 'neutral_kicked_server_currentchannel' : m.reason === 'banned' ? 'neutral_banned_server_currentchannel'
          : m.reason === 'connection lost' ? 'neutral_connection_connectionlost_currentchannel' : 'neutral_connection_disconnected_currentchannel');
      }
      const tab = S.tabs.find(t => t.clid === m.clid); if (tab) addLine(tab.id, `${q(nick)} has disconnected`, 'sys');
      break;
    }
    case 'clientmoved': case 'clientkicked': {
      const c = S.clients.get(m.clid); if (!c) break;
      const from = m.from, to = m.cid, me = self();
      c.cid = to; if (c.clid === S.selfId) c.idleSince = Date.now();
      renderTree(); renderInfo();
      const fromL = chanLink(from), toL = chanLink(to);
      if (m.t === 'clientkicked') {
        const inv = nickLink(m.invoker.clid, m.invoker.nickname), rs = m.reason ? ` (${esc(m.reason)})` : '';
        if (c.clid === S.selfId) { addLine('server', `You were kicked from channel ${fromL} to channel ${toL} by ${inv}${rs}`, 'err'); addLine('channel', `You were kicked from channel ${fromL} to channel ${toL} by ${inv}${rs}`, 'err'); snd('you_kicked_channel'); }
        else {
          const t = `${nickLink(c.clid, c.nickname)} was kicked from channel ${fromL} to channel ${toL} by ${inv}${rs}`; addLine('server', t);
          if (me && (from === me.cid || to === me.cid)) { addLine('channel', t, 'sys'); snd(to === me.cid ? 'neutral_kicked_channel_tocurrentchannel' : 'neutral_kicked_channel_awayfromcurrentchannel'); }
        }
      } else if (c.clid === S.selfId) {
        if (m.invoker) { addLine('server', `You were moved from channel ${fromL} to channel ${toL} by ${nickLink(m.invoker.clid, m.invoker.nickname)}`); addLine('channel', `You were moved from channel ${fromL} to channel ${toL} by ${nickLink(m.invoker.clid, m.invoker.nickname)}`, 'sys'); snd('you_were_moved'); }
        else { addLine('channel', `You switched from channel ${fromL} to channel ${toL}`, 'sys'); snd('channel_switched'); }
      } else {
        const t = m.invoker ? `${nickLink(c.clid, c.nickname)} was moved from channel ${fromL} to channel ${toL} by ${nickLink(m.invoker.clid, m.invoker.nickname)}` : `${nickLink(c.clid, c.nickname)} switched from channel ${fromL} to channel ${toL}`;
        if (S.opts.joinleave) addLine('server', t);
        if (me && (from === me.cid || to === me.cid)) {
          addLine('channel', t, 'sys');
          if (to === me.cid) snd(m.invoker ? 'neutral_moved_tocurrentchannel' : 'neutral_switched_tocurrentchannel');
          else snd(m.invoker ? 'neutral_moved_awayfromcurrentchannel' : 'neutral_switched_awayfromcurrentchannel');
        }
      }
      break;
    }
    case 'clientupdate': {
      const c = S.clients.get(m.clid); if (!c) break;
      const oldGroups = c.serverGroups.slice();
      Object.assign(c, m.patch);
      if (m.patch.nickname && m.old && m.old.nickname !== m.patch.nickname) {
        addLine('server', `${q(m.old.nickname)} is now known as ${nickLink(c.clid, c.nickname)}`);
        const tab = S.tabs.find(t => t.clid === c.clid); if (tab) { tab.title = c.nickname; }
        if (c.clid === S.selfId) { S.nickname = c.nickname; localStorage.setItem('ts3.nick', S.nickname); }
      }
      if (m.patch.serverGroups) {
        for (const g of m.patch.serverGroups.filter(x => !oldGroups.includes(x))) { const gr = groupOf(g); if (gr) addLine('server', `${nickLink(c.clid, c.nickname)} was added to server group ${q(gr.name)}`); }
        for (const g of oldGroups.filter(x => !m.patch.serverGroups.includes(x))) { const gr = groupOf(g); if (gr) addLine('server', `${nickLink(c.clid, c.nickname)} was removed from server group ${q(gr.name)}`); }
        if (c.clid === S.selfId) {
          if (m.patch.serverGroups.some(x => !oldGroups.includes(x))) snd('servergroup_assigned');
          else if (oldGroups.some(x => !m.patch.serverGroups.includes(x))) snd('servergroup_revoked');
        }
      }
      if (c.clid === S.selfId) { S.away = c.away; S.inputMuted = c.inputMuted; S.outputMuted = c.outputMuted; S.commander = c.channelCommander; renderToolbar(); }
      renderTree(); renderInfo(); renderTabs(); renderStatus();
      break;
    }
    case 'self': S.admin = !!m.admin; renderToolbar(); break;
    case 'voice': TSVoice.onVoice(m); break;
    case 'talk': { const c = S.clients.get(m.clid); if (!c) break; c.talking = m.on; if (m.on) c.idleSince = Date.now(); updateClientIcon(m.clid); break; }
    case 'msg': {
      const text = S.opts.bbcode ? bbcode(m.text) : esc(m.text);
      const who = `<a class="nick" data-clid="${m.from.clid}">${q(m.from.nickname)}</a>`;
      if (m.from.clid === S.selfId) snd('chat_message_outbound'); else if (m.from.clid !== 0) snd('chat_message_inbound');
      if (m.mode === 1) {
        const other = m.from.clid === S.selfId ? m.target : m.from.clid;
        if (m.from.clid === 0) { addLine('server', `${q(m.from.nickname)}: ${text}`); break; }
        openPrivateTab(other, false);
        addLine('p' + other, `${who}: ${text}`);
      } else if (m.mode === 2) addLine('channel', `${who}: ${text}`);
      else addLine('server', `${who}: ${text}`);
      break;
    }
    case 'poke': {
      addLine('server', `${nickLink(m.from.clid, m.from.nickname)} poked you: ${S.opts.bbcode ? bbcode(m.text) : esc(m.text)}`);
      if (S.opts.pokeSound) pokePopup(m.from, m.text);
      snd('you_were_poked');
      break;
    }
    case 'kicked': {
      const inv = nickLink(m.invoker.clid, m.invoker.nickname), rs = m.reason ? `<br><br>Reason: ${esc(m.reason)}` : '', rl = m.reason ? ` (${esc(m.reason)})` : '';
      S.kickedOut = true;
      if (m.mode === 'ban') {
        addLine('server', `You were banned ${banDur(m.duration)} from the server by ${inv}${rl}`, 'err');
        msgBox('Banned', `You were banned ${banDur(m.duration)} from the server by ${q(m.invoker.nickname)}.${rs}`, 'i-error');
        snd('you_were_banned');
      } else {
        addLine('server', `You were kicked from the server by ${inv}${rl}`, 'err');
        msgBox('Kicked', `You were kicked from the server by ${q(m.invoker.nickname)}.${rs}`, 'i-error');
        snd('you_kicked_server');
      }
      break;
    }
    case 'channelcreated': S.channels.set(m.channel.cid, m.channel); renderTree(); renderInfo(); if (m.invoker) { addLine('server', `Channel ${chanLink(m.channel.cid)} was created by ${nickLink(m.invoker.clid, m.invoker.nickname)}`); snd('channel_created'); } break;
    case 'channeledited': { const old = S.channels.get(m.channel.cid); S.channels.set(m.channel.cid, m.channel); renderTree(); renderInfo(); if (old && old.name !== m.channel.name) addLine('server', `Channel ${q(old.name)} was renamed to ${chanLink(m.channel.cid)}`); if (self() && m.channel.cid === self().cid) snd('your_channel_was_edited'); break; }
    case 'channeldeleted': { const ch = S.channels.get(m.cid); S.channels.delete(m.cid); if (S.sel && S.sel.type === 'channel' && S.sel.id === m.cid) S.sel = { type: 'server', id: 0 }; renderTree(); renderInfo(); if (ch && !spacerInfo(ch.name)) { addLine('server', `Channel ${q(ch.name)} was deleted`); snd('channel_deleted'); } break; }
    case 'serveredited': Object.assign(S.server, m.server); renderTree(); renderBanner(); renderInfo(); renderToolbar(); addLine('server', `Virtual server was edited by ${nickLink(m.invoker.clid, m.invoker.nickname)}`); break;
    case 'privkeyok': addLine('server', `Privilege key successfully used. You were added to server group ${q(m.group)}.`, 'sys'); msgBox('Privilege Key', 'The privilege key was successfully used.', 'i-info'); break;
    case 'privkeys': if (pendingKeys && pendingKeys.el.isConnected) pendingKeys.$('#pk-list').innerHTML = `<table><tr><th>Privilege Key</th><th>Type</th><th>Group</th><th>Description</th><th>Used</th></tr>${m.keys.map(k => `<tr><td class="mono" style="font-family:Consolas,monospace">${esc(k.token)}</td><td>Server Group</td><td>${esc((groupOf(k.sgid) || {}).name || k.sgid)}</td><td>${esc(k.description || '')}</td><td>${k.used ? 'yes' : 'no'}</td></tr>`).join('')}</table>${m.keys.length ? '' : '<div class="li hint">No privilege keys</div>'}`; break;
    case 'querylogin': if (pendingQuery && pendingQuery.el.isConnected) pendingQuery.$('#sq-body').innerHTML = `<div class="form"><label>Host:</label><input class="inp mono" readonly value="${esc(location.hostname)}:${m.port}"><label>Login Name:</label><input class="inp mono" readonly value="${esc(m.login)}"><label>Password:</label><input class="inp mono" readonly value="${esc(m.password)}"></div>`; break;
    case 'bans': if (pendingBans && pendingBans.el.isConnected) pendingBans.$('#ban-list').innerHTML = `<table><tr><th>IP</th><th>Name</th><th>Unique ID</th><th>Reason</th><th>Expires</th><th>Invoker</th></tr>${m.bans.map(b => `<tr data-id="${b.id}"><td>${esc(b.ip || '-')}</td><td>${esc(b.nickname)}</td><td style="font-family:Consolas,monospace">${esc(b.uid)}</td><td>${esc(b.reason || '')}</td><td>${b.expires ? esc(new Date(b.expires).toLocaleString()) : 'never'}</td><td>${esc(b.invoker || '')}</td></tr>`).join('')}</table>${m.bans.length ? '' : '<div class="li hint">No bans</div>'}`; break;
    case 'pong': S.ping = Math.max(1, Math.round(performance.now() - m.ts)) + 19; renderStatus(); break;
    case 'error': {
      if (S.connecting && !S.connected) {
        if (m.id === 1028) { if (S.connectFailed) addLine('server', 'Failed to connect to server: invalid serverpassword', 'err'); S.connectFailed = true; serverPasswordDialog(S.pendingConnect); return; }
        S.connectFailed = true; addLine('server', `Failed to connect to server: ${esc(m.msg)}`, 'err'); disconnect(true);
        if (m.id === 3329) msgBox('Connect', `You are banned ${m.expires ? 'until ' + esc(new Date(m.expires).toLocaleString()) : 'permanently'}.${m.reason ? `<br><br>Reason: ${esc(m.reason)}` : ''}`, 'i-error');
        return;
      }
      if (m.id === 2568) snd('insufficient_permissions');
      if (m.id === 781) { errorLine(m.msg); if (m.cid && S.channels.get(m.cid)) channelPasswordDialog(S.channels.get(m.cid)); return; }
      if (m.id === 2816 || m.id === 2817) { msgBox('Privilege Key', `Could not use privilege key: ${esc(m.msg)}`, 'i-error'); }
      if (m.id === 2568 && pendingQuery && pendingQuery.el.isConnected) pendingQuery.$('#sq-body').innerHTML = `<span style="color:#c00000">Insufficient client permissions (failed on b_client_create_modify_serverquery_login)</span>`;
      errorLine(m.msg);
      break;
    }
  }
}
function ping() { if (S.connected) send({ t: 'ping', ts: performance.now() }); }

/* ============================ tree interaction ============================ */
E.tree.addEventListener('click', e => {
  const exp = e.target.closest('.exp[data-exp]');
  if (exp && exp.firstChild) { const cid = +exp.dataset.exp; if (S.collapsed.has(cid)) S.collapsed.delete(cid); else S.collapsed.add(cid); renderTree(); return; }
  const row = e.target.closest('.row'); if (!row) return;
  select(row.dataset.type, +row.dataset.id);
});
E.tree.addEventListener('dblclick', e => {
  const row = e.target.closest('.row'); if (!row) return;
  if (row.dataset.type === 'channel') joinChannel(+row.dataset.id);
  else if (row.dataset.type === 'client' && +row.dataset.id !== S.selfId) openPrivateTab(+row.dataset.id);
});
E.tree.addEventListener('contextmenu', e => {
  e.preventDefault();
  const row = e.target.closest('.row'); if (!row || !S.connected) return;
  const type = row.dataset.type, id = +row.dataset.id;
  select(type, id);
  const items = type === 'server' ? serverMenu() : type === 'channel' ? channelMenu(S.channels.get(id)) : clientMenu(S.clients.get(id));
  showMenu(items, e.clientX, e.clientY);
});
// drag clients onto channels
let dragClid = null;
E.tree.addEventListener('dragstart', e => { const row = e.target.closest('.row[data-type="client"]'); if (!row) return e.preventDefault(); dragClid = +row.dataset.id; e.dataTransfer.setData('text/plain', String(dragClid)); e.dataTransfer.effectAllowed = 'move'; });
E.tree.addEventListener('dragover', e => { const row = e.target.closest('.row[data-type="channel"]:not([data-spacer])'); $$('.row.dragover', E.tree).forEach(r => r !== row && r.classList.remove('dragover')); if (row && dragClid != null) { e.preventDefault(); row.classList.add('dragover'); } });
E.tree.addEventListener('dragleave', e => { const row = e.target.closest('.row'); if (row) row.classList.remove('dragover'); });
E.tree.addEventListener('drop', e => {
  e.preventDefault(); $$('.row.dragover', E.tree).forEach(r => r.classList.remove('dragover'));
  const row = e.target.closest('.row[data-type="channel"]:not([data-spacer])'); if (!row || dragClid == null) return;
  const cid = +row.dataset.id;
  if (dragClid === S.selfId) joinChannel(cid);
  else if (S.admin) send({ t: 'move', clid: dragClid, cid });
  else errorLine('insufficient client permissions (failed on i_client_move_power)');
  dragClid = null;
});
E.tree.addEventListener('dragend', () => { dragClid = null; $$('.row.dragover', E.tree).forEach(r => r.classList.remove('dragover')); });

/* ============================ chat interaction ============================ */
E.tabs.addEventListener('click', e => {
  const x = e.target.closest('.tabx'); if (x) { closeTab(x.dataset.close); return; }
  const t = e.target.closest('.tab'); if (t) switchTab(t.dataset.tab);
});
E.tabs.addEventListener('auxclick', e => { const t = e.target.closest('.tab'); if (t && e.button === 1 && t.querySelector('.tabx')) closeTab(t.dataset.tab); });
E.input.addEventListener('keydown', e => { if (e.key === 'Enter') { sendChat(E.input.value); E.input.value = ''; } });
E.log.addEventListener('click', e => {
  const a = e.target.closest('a.nick'); if (a) { const clid = +a.dataset.clid; if (S.clients.has(clid)) { select('client', clid); showMenu(clientMenu(S.clients.get(clid)), e.clientX, e.clientY); } return; }
  const c = e.target.closest('a.chan'); if (c) { const cid = +c.dataset.cid; if (cid === 0) select('server', 0); else if (S.channels.has(cid)) select('channel', cid); }
});
E.log.addEventListener('contextmenu', e => { const a = e.target.closest('a.nick'); if (a) { e.preventDefault(); const clid = +a.dataset.clid; if (S.clients.has(clid)) showMenu(clientMenu(S.clients.get(clid)), e.clientX, e.clientY); } });
E.banner.addEventListener('click', () => { if (S.server && S.server.hostbanner && S.server.hostbanner.url) window.open(S.server.hostbanner.url, '_blank'); });

/* ============================ window chrome ============================ */
function makeDraggable(el, handle) {
  handle.addEventListener('mousedown', e => {
    if (e.button !== 0 || e.target.closest('.cb,.dlg-x')) return;
    if (el === E.win && el.classList.contains('max')) return;
    const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const move = ev => { el.style.left = Math.max(-r.width + 60, Math.min(innerWidth - 60, ev.clientX - ox)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 70, ev.clientY - oy)) + 'px'; };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    addEventListener('mousemove', move); addEventListener('mouseup', up); e.preventDefault();
  });
}
function placeWindow() {
  const w = Math.min(1000, innerWidth - 40), hgt = Math.min(690, innerHeight - 80);
  E.win.style.width = w + 'px'; E.win.style.height = hgt + 'px';
  E.win.style.left = Math.round((innerWidth - w) / 2) + 'px'; E.win.style.top = Math.round((innerHeight - 40 - hgt) / 2) + 'px';
}
placeWindow();
makeDraggable(E.win, $('#titlebar'));

// Resizable window frame (edges + corners + the status bar size grip), Win7 style
(function makeResizable(win) {
  const MIN_W = 560, MIN_H = 380;
  const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const handles = dirs.map(d => { const h = document.createElement('div'); h.className = 'rs rs-' + d; h.dataset.dir = d; win.appendChild(h); return h; });
  const grip = win.querySelector('.sizegrip'); if (grip) grip.dataset.dir = 'se';
  const start = (e, dir) => {
    if (e.button !== 0 || win.classList.contains('max')) return;
    e.preventDefault(); e.stopPropagation();
    const r = win.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      let left = r.left, top = r.top, w = r.width, hgt = r.height;
      if (dir.includes('e')) w = Math.max(MIN_W, r.width + dx);
      if (dir.includes('s')) hgt = Math.max(MIN_H, r.height + dy);
      if (dir.includes('w')) { w = Math.max(MIN_W, r.width - dx); left = r.right - w; }
      if (dir.includes('n')) { hgt = Math.max(MIN_H, r.height - dy); top = Math.max(0, r.bottom - hgt); hgt = r.bottom - top; }
      win.style.left = left + 'px'; win.style.top = top + 'px'; win.style.width = w + 'px'; win.style.height = hgt + 'px';
    };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); document.body.style.cursor = ''; };
    document.body.style.cursor = getComputedStyle(e.currentTarget).cursor;
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  };
  handles.forEach(h => h.addEventListener('mousedown', e => start(e, h.dataset.dir)));
  if (grip) grip.addEventListener('mousedown', e => start(e, 'se'));
})(E.win);
$('#btn-max').addEventListener('click', () => E.win.classList.toggle('max'));
$('#titlebar').addEventListener('dblclick', e => { if (!e.target.closest('.cb')) E.win.classList.toggle('max'); });
$('#btn-min').addEventListener('click', () => { E.win.classList.add('hidden'); $('#task-ts3').classList.remove('active'); });
$('#btn-close').addEventListener('click', () => { E.win.classList.add('hidden'); $('#task-ts3').style.display = 'none'; $('#tray-ts3').style.display = ''; });
const showWin = () => { E.win.classList.remove('hidden'); $('#task-ts3').style.display = ''; $('#task-ts3').classList.add('active'); $('#tray-ts3').style.display = 'none'; };
$('#task-ts3').addEventListener('click', () => { if (E.win.classList.contains('hidden')) showWin(); else { E.win.classList.add('hidden'); $('#task-ts3').classList.remove('active'); } });
$('#tray-ts3').addEventListener('click', showWin);
$('#dicon').addEventListener('dblclick', () => { showWin(); if (!S.connected && !S.connecting) connectDialog(); });
$('#orb').addEventListener('click', () => showMenu([{ label: 'TeamSpeak 3 Client', icon: 'i-ts3', action: showWin }, { sep: true }, { label: 'Shut down', disabled: true }], 2, innerHeight - 40 - 70));
function quit() { disconnect(); E.win.classList.add('hidden'); $('#task-ts3').style.display = 'none'; $('#tray-ts3').style.display = 'none'; }
addEventListener('resize', () => { if (!E.win.classList.contains('max')) { const r = E.win.getBoundingClientRect(); if (r.right > innerWidth || r.bottom > innerHeight - 40) placeWindow(); } });

// splitters
function splitter(handle, pane, horizontal) {
  handle.addEventListener('mousedown', e => {
    const start = horizontal ? e.clientY : e.clientX, size = horizontal ? pane.offsetHeight : pane.offsetWidth;
    const move = ev => { const d = (horizontal ? ev.clientY : ev.clientX) - start; const v = Math.max(60, size - d); pane.style.flexBasis = v + 'px'; };
    const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); document.body.style.cursor = ''; };
    document.body.style.cursor = horizontal ? 'row-resize' : 'col-resize';
    addEventListener('mousemove', move); addEventListener('mouseup', up); e.preventDefault();
  });
}
splitter($('#vsplit'), $('#infopane'), false);
splitter($('#hsplit'), $('#chat'), true);

// clock
function clock() { const d = new Date(); $('#clock-time').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; $('#clock-date').textContent = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
clock(); setInterval(clock, 10000);

// periodic refreshers
setInterval(() => { if (S.connected && S.sel && S.sel.type !== 'channel' && !getSelection().toString()) renderInfo(); }, 1000);
setInterval(ping, 5000);
addEventListener('keydown', e => { if (e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); optionsDialog(); } });

/* ============================ boot ============================ */
TSVoice.init({ send, addLine, msgBox, S, updateClientIcon, isConnected: () => S.connected, onConfigChange: () => renderStatus() });
TSSounds.init({ S });
renderMenubar(); renderToolbar(); renderTabs(); renderStatus();
addLine('server', 'TeamSpeak 3 Client 3.0.6.1 [Build: 1340956745] started', 'sys');
setTimeout(() => connectDialog(), 400);
})();
