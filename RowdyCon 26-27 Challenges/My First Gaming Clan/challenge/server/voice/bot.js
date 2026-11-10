'use strict';
// VoiceBot: runtime around the pure dialogue engine. Owns per-player sessions, Marcel's presence
// (home channel <-> Support), rate limits, annoyance/kicks, flag spelling and the {t:'voice'} messages.

const fs = require('fs');
const path = require('path');
const { step, newSession, pickVariant } = require('./engine');

const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const rnd = ([a, b]) => a + Math.random() * (b - a);

class VoiceBot {
  constructor(state, script) {
    this.state = state;
    this.script = script;
    this.persona = script.persona;
    this.limits = script.persona.limits;
    this.sessions = new Map();
    this.debug = !!process.env.VOICE_DEBUG;
    this.manifest = null; this.manifestMtime = 0;
    this.arrivalTimer = null; this.greetTimers = new Map(); this.flagTimers = new Map();
    this.lastOfficeActivity = Date.now();
    this.textReplyAt = new Map();
    this.loadManifest();
    state.listeners.add(ev => { try { this.onEvent(ev); } catch (e) { console.error('[voice]', e); } });
    setInterval(() => this.tick(), 2000).unref();
  }

  // ---- setup ------------------------------------------------------------------
  loadManifest() {
    try {
      const st = fs.statSync(MANIFEST_PATH);
      if (st.mtimeMs === this.manifestMtime) return;
      this.manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      this.manifestMtime = st.mtimeMs;
      const missing = Object.keys(this.script.lines).filter(id => !(this.manifest.lines || {})[id]);
      if (missing.length) console.warn('[voice] manifest is missing lines: ' + missing.join(', '));
      console.log(`[voice] manifest loaded: ${Object.keys(this.manifest.clips || {}).length} clips, voice ${this.manifest.voice}`);
    } catch (e) {
      if (!this.manifest) console.warn('[voice] no manifest yet (' + e.message + ') - Marcel is mute until tools/build_voice.py has run');
      return;
    }
    this.flagClips = this.buildFlagClips(this.state.config.flag); // throws on an unsupported flag character
  }
  buildFlagClips(flag) {
    const chars = (this.manifest && this.manifest.chars) || {};
    const out = [];
    for (const ch of String(flag)) {
      const ids = /[A-Z]/.test(ch) ? [chars.CAP, chars[ch.toLowerCase()]] : [chars[ch]];
      for (const id of ids) {
        if (!id || !this.manifest.clips[id]) throw new Error(`[voice] no voice clip for flag character "${ch}" - add it to tools/build_voice.py`);
        out.push({ id, dur: this.manifest.clips[id].dur });
      }
    }
    return out;
  }
  clientInfo() {
    const lines = (this.manifest && this.manifest.lines) || {};
    return { testClip: (lines.test_sound || [])[0] || null, hotkey: 'Control', bot: this.persona.nickname };
  }

  // ---- helpers ----------------------------------------------------------------
  marcel() { for (const c of this.state.clients.values()) if (c.isBot && c.bot && c.bot.persona) return c; return null; }
  session(client) {
    let s = this.sessions.get(client.clid);
    if (!s) { s = newSession(); s.state = this.script.start; this.sessions.set(client.clid, s); }
    return s;
  }
  realIn(cid) { return this.state.clientsIn(cid).filter(c => !c.isBot); }
  log(...a) { if (this.debug) console.log('[voice]', ...a); }

  lineClips(session, lineId) {
    if (!this.manifest) return [];
    const ids = (this.manifest.lines || {})[lineId];
    if (!ids || !ids.length) { this.log('no clips for line', lineId); return []; }
    const v = pickVariant(this.script, session, lineId);
    const id = ids[Math.min(v < 0 ? 0 : v, ids.length - 1)];
    const c = this.manifest.clips[id];
    return c ? [{ id, dur: c.dur }] : [];
  }
  // speak line ids (and/or raw clip arrays) to one client; returns total duration in ms
  speak(client, items, gap = 150) {
    const m = this.marcel(); if (!m || !client) return 0;
    const session = this.session(client);
    const clips = [];
    for (const it of items) { if (typeof it === 'string') clips.push(...this.lineClips(session, it)); else if (Array.isArray(it)) clips.push(...it); }
    if (!clips.length) return 0;
    this.state.send(client, { t: 'voice', from: m.clid, clips, gap, whisper: true });
    if (this.debug) this.log(`-> ${client.nickname}: ` + clips.map(c => (this.manifest.clips[c.id] || {}).text || c.id).join(' | '));
    return clips.reduce((s, c) => s + c.dur * 1000 + gap, 0);
  }
  moveMarcel(cid) {
    const m = this.marcel(); if (!m || m.cid === cid) return;
    try { this.state.joinChannel(m, cid, null, null); } catch (e) { this.log('move failed', e.message); }
  }

  // ---- presence ---------------------------------------------------------------
  onEvent(ev) {
    const m = this.marcel(); if (!m) return;
    const { office, home } = this.persona;
    if (ev.t === 'clientmoved' || ev.t === 'clientjoin' || ev.t === 'clientkicked') {
      const clid = ev.t === 'clientjoin' ? ev.client.clid : ev.clid;
      const cid = ev.t === 'clientjoin' ? ev.client.cid : ev.cid;
      const c = this.state.client(clid);
      if (!c || c.isBot) return;
      if (cid === office) {
        this.lastOfficeActivity = Date.now();
        if (m.cid !== office) this.scheduleArrival();
        else this.scheduleGreet(c);
      } else if (cid === home) {
        const s = this.session(c);
        if (s.state === 'go_admin') this.scheduleFlag(c);
        else if (m.cid === home) this.scheduleGreet(c);
      }
      if (ev.t === 'clientkicked' && ev.from === office) this.lastOfficeActivity = Date.now();
    } else if (ev.t === 'clientupdate' && ev.patch && ev.patch.serverGroups) {
      const c = this.state.client(ev.clid);
      if (c && !c.isBot && this.sessions.has(c.clid) && this.isMember(c)) this.memberOk(c, this.session(c));
    } else if (ev.t === 'clientleft') {
      this.sessions.delete(ev.clid);
      const t = this.greetTimers.get(ev.clid); if (t) { clearTimeout(t); this.greetTimers.delete(ev.clid); }
      const f = this.flagTimers.get(ev.clid); if (f) { clearTimeout(f); this.flagTimers.delete(ev.clid); }
    }
  }
  scheduleArrival() {
    if (this.arrivalTimer) return;
    this.arrivalTimer = setTimeout(() => {
      this.arrivalTimer = null;
      const m = this.marcel(); if (!m) return;
      if (!this.realIn(this.persona.office).length) return;
      this.moveMarcel(this.persona.office);
      for (const c of this.realIn(this.persona.office)) this.scheduleGreet(c);
    }, rnd(this.persona.arriveDelayMs));
  }
  scheduleGreet(c) {
    if (this.greetTimers.has(c.clid)) return;
    this.greetTimers.set(c.clid, setTimeout(() => {
      this.greetTimers.delete(c.clid);
      const m = this.marcel(); const cur = this.state.client(c.clid);
      if (!m || !cur || cur.cid !== m.cid) return;
      const s = this.session(cur);
      if (Date.now() < s.blockedUntil) return;
      const st = this.script.states[s.state] || {};
      if (!s.greeted) { s.greeted = true; this.speak(cur, [s.state === this.script.start ? 'greet_join' : (st.ask || 'greet_back')]); }
      else this.speak(cur, [st.ask || 'greet_back']);
    }, rnd(this.persona.greetDelayMs)));
  }
  scheduleFlag(c) {
    if (this.flagTimers.has(c.clid)) return;
    this.flagTimers.set(c.clid, setTimeout(() => {
      this.flagTimers.delete(c.clid);
      const cur = this.state.client(c.clid); const m = this.marcel();
      if (!cur || !m || cur.cid !== this.persona.home) return;
      const s = this.session(cur);
      if (s.state !== 'go_admin') return;
      this.moveMarcel(this.persona.home);
      s.state = 'flag_given'; s.repeats = 0; s.wrong = 0;
      setTimeout(() => this.sayFlag(cur, 'flag_intro'), 900);
    }, 1500));
  }
  // ---- dynamic parts: spelled word, member key ----------------------------------
  letterClips(word) {
    const chars = (this.manifest && this.manifest.chars) || {};
    return [...word].map(ch => chars[ch]).filter(Boolean).map(id => ({ id, dur: this.manifest.clips[id].dur }));
  }
  spellWord(client, session, introLine) {
    if (!session.dyn.spellWord) { const w = this.persona.spellWords || ['soda']; session.dyn.spellWord = w[Math.floor(Math.random() * w.length)]; }
    this.speak(client, [introLine]);
    this.speak(client, [this.letterClips(session.dyn.spellWord)], 320);
  }
  memberKey() { return this.state.privilegeKeys.find(k => k.sgid === this.persona.memberGroup); }
  isMember(client) { return client.serverGroups.includes(this.persona.memberGroup); }
  memberOk(client, session) {
    if (session.state !== 'await_member') return;
    session.state = 'go_admin'; session.wrong = 0;
    this.speak(client, ['ok_member']);
  }
  onEnter(client, session) {
    const st = this.script.states[session.state] || {};
    const act = st.enter && st.enter.action;
    if (act === 'spell_word') { delete session.dyn.spellWord; this.spellWord(client, session, 'spell_intro'); }
    else if (act === 'give_member_key') {
      if (this.isMember(client)) return this.memberOk(client, session);
      const key = this.memberKey(); const m = this.marcel();
      if (!key || !m) return;
      setTimeout(() => { if (this.state.clients.has(client.clid)) { try { this.state.poke(m, client.clid, `member key: ${key.token} (Permissions > Use Privilege Key)`); } catch (e) { /* */ } } }, 1800);
    }
  }

  sayFlag(client, introLine) {
    if (!this.flagClips) return;
    this.speak(client, [introLine]);
    this.speak(client, [this.flagClips], 280);
    this.speak(client, ['flag_outro']);
  }
  tick() {
    this.loadManifest();
    const m = this.marcel(); if (!m) return;
    const { office, home } = this.persona;
    if (m.cid === office) {
      if (this.realIn(office).length) this.lastOfficeActivity = Date.now();
      else if (Date.now() - this.lastOfficeActivity > this.persona.leaveAfterMs) this.moveMarcel(home);
    } else if (m.cid !== home && m.cid !== office) {
      // got moved somewhere by an admin; walk home eventually
      if (!this.realIn(m.cid).length) this.moveMarcel(home);
    }
  }

  // ---- conversation -----------------------------------------------------------
  onUtterance(client, text, alts = []) {
    const m = this.marcel(); if (!m || !client || client.isBot) return;
    const s = this.session(client);
    const now = Date.now();
    text = String(text || '').slice(0, this.limits.maxChars);
    if (!text.trim()) return;
    if (now - s.lastUtteranceAt < this.limits.cooldownMs) return;
    s.lastUtteranceAt = now;
    this.log(`<- ${client.nickname} [${s.state}]: ${JSON.stringify(text)}${alts.length ? ' alts=' + JSON.stringify(alts) : ''}`);
    if (now < s.blockedUntil) { if (!s.saidIgnored) { s.saidIgnored = true; if (client.cid === m.cid) this.speak(client, ['ignored']); } return; }
    if (client.cid !== m.cid) return; // not in the same channel: he cannot hear you
    if (client.cid === this.persona.office) this.lastOfficeActivity = now;

    let r;
    const dup = text.trim().toLowerCase() === s.lastText && now - s.lastAt < this.limits.dupWindowMs;
    s.lastText = text.trim().toLowerCase(); s.lastAt = now;
    if (dup) r = { kind: 'fallback', say: 'what', annoy: 1 };
    else r = step(this.script, s, [text, ...alts]);
    this.log(`   ${r.kind} ${r.intent || ''} say=${r.say || ''} goto=${r.goto || ''} action=${r.action || ''}`);

    if (r.set) Object.assign(s.flags, r.set);
    if (r.goto) { s.state = r.goto; s.wrong = 0; }
    if (r.kind === 'wrong') { s.wrong++; s.annoy++; }
    else if (r.kind === 'fallback') s.annoy++;
    else if (r.kind === 'intent') s.annoy += r.annoy || 0;
    else if (r.kind === 'answer' && r.goto) s.annoy = Math.max(0, s.annoy - 1);

    const say = [];
    if (r.action === 'repeat_flag') {
      if (s.state !== 'flag_given') say.push('what');
      else if (s.repeats < this.limits.maxRepeats) { s.repeats++; this.sayFlag(client, 'flag_repeat'); return; }
      else say.push('flag_no_more');
    } else if (r.action === 'repeat_spell') {
      if (s.state === 'q_spell') { this.spellWord(client, s, 'spell_repeat'); return; }
      say.push('what');
    } else if (r.say) say.push(r.say);

    if (s.wrong >= this.limits.wrongPerQuestion || s.annoy >= this.limits.annoyKick) {
      say.push('kicked_line');
      const dur = this.speak(client, say);
      s.annoy = 0; s.wrong = 0; s.blockedUntil = now + this.limits.kickIgnoreMs; s.saidIgnored = false; s.greeted = false;
      setTimeout(() => { const cur = this.state.client(client.clid); if (cur && cur.cid === m.cid) { try { this.state.kick(m, cur.clid, 'channel', 'go read the rules'); } catch (e) { /* */ } } }, Math.min(dur, 4000) + 200);
      return;
    }
    if (s.annoy === this.limits.annoyWarn && r.kind !== 'answer') say.push('annoyed_warn');
    this.speak(client, say);
    const st = this.script.states[s.state] || {};
    if (r.kind === 'fallback' && st.fallbackAction === 'spell_again' && s.dyn.spellWord) this.speak(client, [this.letterClips(s.dyn.spellWord)], 320);
    if (r.goto) this.onEnter(client, s);
  }

  // text chat / pokes aimed at Marcel
  onText(client, kind) {
    const m = this.marcel(); if (!m || !client || client.isBot) return;
    const now = Date.now();
    if (now - (this.textReplyAt.get(client.clid) || 0) < 20000) return;
    this.textReplyAt.set(client.clid, now);
    const replies = this.persona.textReplies || {};
    setTimeout(() => {
      if (!this.state.clients.has(client.clid)) return;
      try {
        if (kind === 'poke') this.state.poke(m, client.clid, replies.poke || 'use voice');
        else if (kind === 'channel' && client.cid === m.cid) this.speak(client, ['use_mic']);
        else this.state.textMessage(m, 1, client.clid, replies.chat || 'use voice');
      } catch (e) { /* */ }
    }, 1200 + Math.random() * 1500);
  }
}

module.exports = { VoiceBot };
