// ---------------------------------------------------------------------------
// 10_audio.js — fully synthesized sound effects via WebAudio (no files).
// ---------------------------------------------------------------------------
(function () {
  class Audio {
    constructor() {
      this.ctx = null; this.master = null; this.muted = false; this.listener = { x: 0, y: 0, z: 0 };
      this.lastPlay = {}; this.noise = null; this.volume = 0.6;
    }
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }
    setListener(p) { this.listener = p; }
    _vol(opts) {
      let v = opts.vol === undefined ? 1 : opts.vol;
      if (opts.pos) { const d = ZM.V.dist(opts.pos, this.listener); v *= ZM.U.clamp(1 - d / (opts.range || 32), 0.03, 1); }
      return v;
    }
    _gain(v, t0) { const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t0); g.connect(this.master); return g; }
    _noise(t0, dur, filterType, freq, q, vol, env = [0.005, dur]) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t0); if (q) f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + env[0]); g.gain.exponentialRampToValueAtTime(0.0001, t0 + env[1]);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
      return { src, f, g };
    }
    _tone(t0, dur, type, f0, f1, vol, env = [0.005, dur]) {
      const c = this.ctx, o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + env[0]); g.gain.exponentialRampToValueAtTime(0.0001, t0 + env[1]);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return { o, g };
    }
    play(name, opts = {}) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, t = c.currentTime;
      const v = this._vol(opts);
      if (v <= 0.01) return;
      // rate limit identical sounds
      const key = name;
      if (this.lastPlay[key] && t - this.lastPlay[key] < (opts.minGap || 0.03)) return;
      this.lastPlay[key] = t;
      const pitch = opts.pitch || 1;
      switch (name) {
        case 'shot_pistol': this._noise(t, 0.12, 'lowpass', 2500, 1, 0.9 * v, [0.003, 0.12]); this._tone(t, 0.09, 'sine', 220 * pitch, 60, 0.6 * v); break;
        case 'shot_magnum': this._noise(t, 0.22, 'lowpass', 1800, 1, 1.0 * v, [0.003, 0.22]); this._tone(t, 0.16, 'sine', 160, 40, 0.8 * v); break;
        case 'shot_smg': this._noise(t, 0.08, 'bandpass', 1800, 0.7, 0.7 * v, [0.002, 0.08]); this._tone(t, 0.06, 'square', 300 * pitch, 80, 0.25 * v); break;
        case 'shot_rifle': this._noise(t, 0.14, 'lowpass', 2200, 1, 0.9 * v, [0.002, 0.14]); this._tone(t, 0.1, 'sine', 180, 50, 0.6 * v); break;
        case 'shot_lmg': this._noise(t, 0.12, 'lowpass', 1600, 1, 0.9 * v, [0.002, 0.12]); this._tone(t, 0.09, 'sine', 140, 50, 0.6 * v); break;
        case 'shot_shotgun': this._noise(t, 0.3, 'lowpass', 1200, 1, 1.1 * v, [0.004, 0.3]); this._tone(t, 0.22, 'sine', 120, 35, 0.9 * v); break;
        case 'shot_sniper': this._noise(t, 0.4, 'lowpass', 2600, 1, 1.0 * v, [0.002, 0.4]); this._tone(t, 0.3, 'sine', 150, 30, 0.9 * v); break;
        case 'shot_launcher': this._noise(t, 0.5, 'bandpass', 500, 0.8, 0.9 * v, [0.03, 0.5]); this._tone(t, 0.4, 'sawtooth', 400, 80, 0.3 * v); break;
        case 'shot_ray': this._tone(t, 0.18, 'sawtooth', 1100, 250, 0.35 * v); this._tone(t, 0.18, 'square', 1500, 300, 0.15 * v); break;
        case 'shot_wunder': { this._noise(t, 0.5, 'bandpass', 3000, 2, 0.8 * v, [0.01, 0.5]); this._tone(t, 0.45, 'sawtooth', 60, 500, 0.3 * v); this._tone(t + 0.05, 0.3, 'square', 900, 1800, 0.12 * v); break; }
        case 'shot_knife': case 'knife': this._noise(t, 0.15, 'bandpass', 2500, 1.5, 0.35 * v, [0.03, 0.15]); break;
        case 'dry': this._tone(t, 0.04, 'square', 900, 500, 0.15 * v); break;
        case 'reload': this._noise(t, 0.05, 'highpass', 2000, 1, 0.3 * v, [0.002, 0.05]); this._noise(t + 0.35, 0.06, 'highpass', 1500, 1, 0.35 * v, [0.002, 0.06]); this._tone(t + 0.35, 0.05, 'square', 400, 300, 0.1 * v); break;
        case 'hitmarker': this._tone(t, 0.04, 'square', 1800, 1600, 0.12 * v); break;
        case 'flesh': this._noise(t, 0.08, 'lowpass', 600, 1, 0.5 * v, [0.004, 0.08]); break;
        case 'zombie_groan': { const f = (60 + Math.random() * 50) * pitch; const r = this._tone(t, 0.9, 'sawtooth', f, f * 0.8, 0.35 * v, [0.15, 0.9]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; r.o.disconnect(); r.o.connect(lp); lp.connect(r.g); break; }
        case 'zombie_attack': { const r = this._tone(t, 0.5, 'sawtooth', 140, 90, 0.4 * v, [0.03, 0.5]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; r.o.disconnect(); r.o.connect(lp); lp.connect(r.g); this._noise(t, 0.3, 'bandpass', 900, 1, 0.3 * v, [0.02, 0.3]); break; }
        case 'zombie_die': { const r = this._tone(t, 0.7, 'sawtooth', 120, 40, 0.35 * v, [0.02, 0.7]); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 450; r.o.disconnect(); r.o.connect(lp); lp.connect(r.g); break; }
        case 'dog_bark': this._noise(t, 0.12, 'bandpass', 700, 2, 0.6 * v, [0.01, 0.12]); this._tone(t, 0.1, 'sawtooth', 300, 150, 0.3 * v); break;
        case 'dog_howl': this._tone(t, 1.6, 'sawtooth', 300, 500, 0.25 * v, [0.3, 1.6]); this._tone(t + 0.2, 1.4, 'sine', 600, 900, 0.15 * v, [0.3, 1.4]); break;
        case 'door': this._noise(t, 0.4, 'lowpass', 400, 1, 0.8 * v, [0.01, 0.4]); this._noise(t + 0.1, 0.5, 'lowpass', 900, 1, 0.5 * v, [0.02, 0.5]); break;
        case 'boards': this._noise(t, 0.08, 'lowpass', 700, 1, 0.5 * v, [0.003, 0.08]); this._tone(t, 0.08, 'triangle', 220, 120, 0.3 * v); break;
        case 'board_rip': this._noise(t, 0.2, 'bandpass', 1200, 1, 0.5 * v, [0.01, 0.2]); break;
        case 'buy': this._tone(t, 0.08, 'sine', 1300, 1300, 0.3 * v); this._tone(t + 0.1, 0.25, 'sine', 1950, 1950, 0.3 * v); break;
        case 'deny': this._tone(t, 0.15, 'square', 200, 150, 0.15 * v); break;
        case 'perk': [523, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.12, 0.3, 'triangle', f, f, 0.25 * v)); this._tone(t + 0.5, 0.4, 'sine', 300, 300, 0.2 * v); break;
        case 'box': for (let i = 0; i < 8; i++) this._tone(t + i * 0.3, 0.25, 'triangle', 440 * Math.pow(2, (i % 4) / 12), 440 * Math.pow(2, (i % 4) / 12), 0.15 * v); break;
        case 'teddy': [700, 600, 500, 400, 300].forEach((f, i) => this._tone(t + i * 0.2, 0.3, 'triangle', f, f * 0.9, 0.25 * v)); break;
        case 'powerup': [880, 1108, 1318, 1760].forEach((f, i) => this._tone(t + i * 0.07, 0.35, 'sine', f, f, 0.25 * v)); break;
        case 'powerup_end': [1318, 1108, 880].forEach((f, i) => this._tone(t + i * 0.1, 0.3, 'sine', f, f, 0.2 * v)); break;
        case 'nuke': this._noise(t, 1.2, 'lowpass', 300, 1, 1.0 * v, [0.05, 1.2]); this._tone(t, 1.0, 'sine', 80, 30, 0.8 * v); break;
        case 'round_start': this._tone(t, 2.2, 'sawtooth', 55, 55, 0.25 * v, [0.4, 2.2]); this._tone(t + 0.3, 2.0, 'sine', 110, 110, 0.25 * v, [0.4, 2.0]); this._tone(t + 1.2, 1.6, 'sawtooth', 65, 65, 0.2 * v, [0.3, 1.6]); break;
        case 'round_end': this._tone(t, 1.8, 'sine', 220, 220, 0.2 * v, [0.3, 1.8]); this._tone(t + 0.5, 1.6, 'sine', 330, 330, 0.18 * v, [0.3, 1.6]); this._tone(t + 1.0, 1.4, 'sine', 440, 440, 0.15 * v, [0.3, 1.4]); break;
        case 'player_hurt': this._noise(t, 0.25, 'lowpass', 500, 1, 0.6 * v, [0.01, 0.25]); this._tone(t, 0.3, 'sine', 90, 50, 0.5 * v); break;
        case 'heartbeat': this._tone(t, 0.12, 'sine', 60, 40, 0.5 * v); this._tone(t + 0.2, 0.12, 'sine', 55, 40, 0.4 * v); break;
        case 'down': this._tone(t, 1.5, 'sawtooth', 140, 40, 0.3 * v, [0.05, 1.5]); this._noise(t, 0.6, 'lowpass', 400, 1, 0.5 * v, [0.02, 0.6]); break;
        case 'revive': [400, 500, 600, 800].forEach((f, i) => this._tone(t + i * 0.1, 0.3, 'sine', f, f, 0.2 * v)); break;
        case 'explosion': this._noise(t, 0.9, 'lowpass', 500, 1, 1.2 * v, [0.01, 0.9]); this._tone(t, 0.5, 'sine', 70, 25, 1.0 * v); break;
        case 'teleport': this._tone(t, 1.2, 'sawtooth', 100, 1600, 0.3 * v, [0.2, 1.2]); this._noise(t, 1.2, 'bandpass', 2000, 2, 0.4 * v, [0.3, 1.2]); break;
        case 'link': this._tone(t, 0.4, 'square', 600, 900, 0.15 * v); this._tone(t + 0.4, 0.5, 'square', 900, 1200, 0.15 * v); break;
        case 'power': this._noise(t, 0.3, 'lowpass', 300, 1, 0.8 * v, [0.01, 0.3]); this._tone(t + 0.2, 1.5, 'sawtooth', 50, 60, 0.25 * v, [0.3, 1.5]); this._tone(t + 0.3, 1.2, 'square', 120, 120, 0.08 * v, [0.3, 1.2]); break;
        case 'pap': this._noise(t, 0.3, 'lowpass', 500, 1, 0.5 * v, [0.01, 0.3]); [220, 330, 440, 660, 880].forEach((f, i) => this._tone(t + 0.4 + i * 0.25, 0.3, 'triangle', f, f, 0.2 * v)); this._tone(t + 2.2, 0.6, 'sine', 1320, 1320, 0.25 * v); break;
        case 'monkey': for (let i = 0; i < 10; i++) this._tone(t + i * 0.25, 0.2, 'square', [660, 880, 990, 880][i % 4], [660, 880, 990, 880][i % 4], 0.08 * v); break;
        case 'claymore': this._tone(t, 0.06, 'square', 1500, 1500, 0.1 * v); break;
        case 'lightning': this._noise(t, 0.4, 'highpass', 3000, 1, 0.5 * v, [0.005, 0.4]); this._tone(t, 0.2, 'sawtooth', 2000, 200, 0.2 * v); break;
        case 'flag': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this._tone(t + i * 0.18, 0.5, 'triangle', f, f, 0.25 * v)); break;
        case 'points': this._tone(t, 0.05, 'sine', 2200, 2200, 0.05 * v); break;
        case 'footstep': this._noise(t, 0.05, 'lowpass', 600, 1, 0.15 * v, [0.003, 0.05]); break;
        case 'vault': this._noise(t, 0.3, 'lowpass', 900, 1, 0.4 * v, [0.01, 0.3]); break;
        default: break;
      }
    }
  }
  ZM.Audio = Audio;
})();
