// ---------------------------------------------------------------------------
// 97_settings.js — user settings: key bindings, mouse/aim, video, audio.
// Persisted in localStorage. Raw input (key codes / mouse buttons) is translated
// into named actions here so the game logic never sees physical keys.
// ---------------------------------------------------------------------------
(function () {
  const ACTIONS = [
    ['forward', 'Move forward'], ['back', 'Move back'], ['left', 'Strafe left'], ['right', 'Strafe right'], ['sprint', 'Sprint'],
    ['fire', 'Fire'], ['ads', 'Aim down sights'], ['reload', 'Reload'], ['interact', 'Interact / use'], ['melee', 'Knife'],
    ['grenade', 'Frag grenade'], ['monkey', 'Monkey bomb'], ['claymore', 'Place claymore'], ['weapon1', 'Weapon slot 1'], ['weapon2', 'Weapon slot 2'], ['switch', 'Switch weapon'],
    ['debug', 'Debug overlay'],
  ];
  const DEFAULTS = {
    bindings: { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', fire: 'Mouse0', ads: 'Mouse2', reload: 'KeyR', interact: 'KeyF', melee: 'KeyV', grenade: 'KeyG', monkey: 'KeyN', claymore: 'KeyC', weapon1: 'Digit1', weapon2: 'Digit2', switch: 'KeyQ', debug: 'F3' },
    sensitivity: 2.2, invertY: false, adsToggle: false, sprintToggle: false, fov: 70,
    renderScale: 0, // 0 = automatic
    showFps: false, viewBob: true, crosshair: 'cross',
    volume: 0.6, muted: false,
  };
  const KEY = 'derriese_settings';

  function keyName(code) {
    if (!code) return '—';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code === 'Mouse0') return 'LMB'; if (code === 'Mouse1') return 'MMB'; if (code === 'Mouse2') return 'RMB';
    if (code.startsWith('Mouse')) return 'M' + code.slice(5);
    const map = { ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Tab: 'Tab', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Enter: 'Enter', Backspace: 'Bksp', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
    return map[code] || code;
  }

  class Settings {
    constructor() { this.data = JSON.parse(JSON.stringify(DEFAULTS)); this.load(); }
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        for (const k in DEFAULTS) if (k !== 'bindings' && d[k] !== undefined) this.data[k] = d[k];
        if (d.bindings) for (const a in DEFAULTS.bindings) if (typeof d.bindings[a] === 'string') this.data.bindings[a] = d.bindings[a];
      } catch (e) { /* ignore */ }
    }
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } }
    reset() { this.data = JSON.parse(JSON.stringify(DEFAULTS)); this.save(); }
    get(k) { return this.data[k]; }
    set(k, v) { this.data[k] = v; this.save(); }
    binding(action) { return this.data.bindings[action]; }
    // Bind `code` to `action`; if another action used that code, the two swap.
    bind(action, code) {
      const b = this.data.bindings;
      for (const a in b) if (a !== action && b[a] === code) b[a] = b[action];
      b[action] = code;
      this.save();
    }
    keyName(action) { return keyName(this.binding(action)); }
    // Translate raw input (keys Set of codes, pressed Set of codes, buttons {0,2}) into actions.
    translate(input) {
      const held = new Set(input.keys);
      if (input.buttons[0]) held.add('Mouse0'); if (input.buttons[1]) held.add('Mouse1'); if (input.buttons[2]) held.add('Mouse2');
      const actions = new Set(), pressed = new Set();
      const b = this.data.bindings;
      for (const a in b) { if (held.has(b[a])) actions.add(a); if (input.pressed.has(b[a])) pressed.add(a); }
      input.actions = actions; input.pressedActions = pressed;
      return input;
    }
    // Apply to live objects.
    applyPlayer(player) {
      player.sensitivity = this.data.sensitivity / 1000;
      player.invertY = !!this.data.invertY;
      player.adsToggle = !!this.data.adsToggle;
      player.sprintToggle = !!this.data.sprintToggle;
      player.viewBob = this.data.viewBob !== false;
    }
    applyAudio(audio) { audio.volume = this.data.volume; audio.setMuted(!!this.data.muted); if (audio.master && !audio.muted) audio.master.gain.value = audio.volume; }
  }
  Settings.ACTIONS = ACTIONS; Settings.DEFAULTS = DEFAULTS; Settings.keyName = keyName;
  ZM.Settings = Settings;
})();
