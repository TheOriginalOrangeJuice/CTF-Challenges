// ---------------------------------------------------------------------------
// 99_main.js — bootstrap: canvases, input, pointer lock, state machine, loop.
// ---------------------------------------------------------------------------
(function () {
  const glCanvas = document.getElementById('gl');
  const hudCanvas = document.getElementById('hud');
  const renderer = new ZM.Renderer(glCanvas);
  const hud = new ZM.HUD(hudCanvas);
  const audio = new ZM.Audio();
  const game = new ZM.Game(renderer, hud, audio);
  let state = 'menu'; // menu | playing | paused | gameover | flag | settings
  const input = { keys: new Set(), pressed: new Set(), buttons: { 0: false, 1: false, 2: false }, mouseDX: 0, mouseDY: 0, wheel: 0 };
  const settings = game.settings;

  // Render scale: internal 3D resolution relative to the window (auto targets ~720p for performance).
  function autoScale() { const target = renderer.software ? 480 : 720; return Math.min(1, target / Math.max(1, window.innerHeight)); }
  let renderScale = settings.get('renderScale') ? settings.get('renderScale') / 100 : autoScale();
  if (renderer.software) hud.toast('Software WebGL detected (no GPU acceleration) — render scale lowered. Use [ ] to adjust.', 8, '#ffd27a');
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.resize(w, h, renderScale); hud.resize(w, h);
  }
  function applySettings() {
    settings.applyPlayer(game.player); settings.applyAudio(audio);
    renderScale = settings.get('renderScale') ? settings.get('renderScale') / 100 : autoScale();
    resize();
  }
  function setScale(v) { const pct = Math.round(Math.min(100, Math.max(30, v * 100)) / 5) * 5; settings.set('renderScale', pct); applySettings(); hud.toast(`Render scale ${pct}% (${renderer.canvas.width}×${renderer.canvas.height})`, 1.5); }
  hud.onSettingsChanged = applySettings;
  hud.onOpenSettings = (from) => { setState('settings'); hud.settingsFrom = from; };
  hud.onCloseSettings = () => { hud.capture = null; setState(hud.settingsFrom === 'paused' ? 'paused' : 'menu'); };
  hud.onQuit = () => { setState('menu'); };
  applySettings();
  window.addEventListener('resize', resize);
  resize();

  function locked() { return document.pointerLockElement === glCanvas; }
  function lock() { try { const p = glCanvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  function setState(s) {
    state = s;
    input.pressed.clear(); input.keys.clear(); input.buttons[0] = input.buttons[2] = false; input.mouseDX = input.mouseDY = 0; input.wheel = 0;
  }

  const mouse = { x: 0, y: 0 };
  function hudXY(e) { return { x: e.clientX * (hud.width / window.innerWidth), y: e.clientY * (hud.height / window.innerHeight) }; }
  document.addEventListener('click', (e) => {
    audio.unlock();
    if (state !== 'playing' && !locked()) { const m = hudXY(e); if (hud.handleClick(m.x, m.y)) return; }
    if (state === 'settings') return;
    if (state === 'menu') {
      if (game.gameOver) game.reset();
      setState('playing'); lock();
    } else if (state === 'paused') { setState('playing'); lock(); }
    else if (state === 'gameover') { game.reset(); setState('menu'); }
    else if (state === 'flag') { setState('playing'); lock(); }
    else if (state === 'playing' && !locked()) lock();
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked() && state === 'playing') setState('paused');
  });
  document.addEventListener('pointerlockerror', () => { /* some browsers need a second click */ });
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F3'].includes(e.code) || e.key === 'F3') e.preventDefault();
    hud.lastKey = `${e.code} / ${e.key}`;
    if (hud.capture) { e.preventDefault(); if (e.code !== 'Escape') { settings.bind(hud.capture, e.code); applySettings(); } hud.capture = null; return; }
    if (e.code === settings.binding('debug') || (e.key === 'F3' && settings.binding('debug') === 'F3')) { hud.showDebug = !hud.showDebug; return; }
    input.keys.add(e.code); input.pressed.add(e.code);
    if (e.code === 'Escape') {
      if (state === 'settings') hud.onCloseSettings();
      else if (state === 'paused') { setState('menu'); }
      else if (state === 'playing') { setState('paused'); if (locked()) document.exitPointerLock(); }
    }
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); hud.toast(audio.muted ? 'Muted' : 'Sound on', 1.5); }
    if (e.code === 'BracketLeft') setScale((renderer.scale || 1) - 0.1);
    if (e.code === 'BracketRight') setScale((renderer.scale || 1) + 0.1);
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { settings.set('sensitivity', Math.min(10, Math.round((settings.get('sensitivity') + 0.3) * 10) / 10)); applySettings(); hud.toast(`Sensitivity ${settings.get('sensitivity').toFixed(1)}`, 1.2); }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { settings.set('sensitivity', Math.max(0.5, Math.round((settings.get('sensitivity') - 0.3) * 10) / 10)); applySettings(); hud.toast(`Sensitivity ${settings.get('sensitivity').toFixed(1)}`, 1.2); }
  });
  document.addEventListener('keyup', (e) => { input.keys.delete(e.code); });
  window.addEventListener('blur', () => { input.keys.clear(); input.buttons[0] = input.buttons[2] = false; });
  document.addEventListener('mousemove', (e) => {
    if (locked() && state === 'playing') { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
    else { const m = hudXY(e); mouse.x = m.x; mouse.y = m.y; hud.handleMove(m.x, m.y); }
  });
  document.addEventListener('mousedown', (e) => {
    if (hud.capture) { e.preventDefault(); settings.bind(hud.capture, 'Mouse' + e.button); applySettings(); hud.capture = null; return; }
    if (state !== 'playing' || !locked()) { const m = hudXY(e); hud.handleDown(m.x, m.y); return; }
    input.buttons[e.button] = true; input.pressed.add('Mouse' + e.button);
  });
  document.addEventListener('mouseup', (e) => { input.buttons[e.button] = false; hud.handleUp(); });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => { if (state === 'playing') input.wheel = e.deltaY > 0 ? 1 : -1; }, { passive: true });

  const STEP = 1 / 60;
  let last = performance.now(), acc = 0, fpsT = 0, fpsN = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.25) dt = 0.25;
    fpsT += dt; fpsN++; if (fpsT >= 0.5) { hud.fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
    const tFrame0 = performance.now();
    let tUpd = 0;
    if (state === 'playing') {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        const t0 = performance.now();
        game.update(STEP, input);
        tUpd += performance.now() - t0;
        input.pressed.clear(); input.mouseDX = 0; input.mouseDY = 0; input.wheel = 0;
        acc -= STEP; steps++;
      }
      if (steps === 4) acc = 0;
      if (game.flagPending) { game.flagPending = false; setState('flag'); }
      if (game.gameOver) { setState('gameover'); if (locked()) document.exitPointerLock(); }
    } else { input.pressed.clear(); input.mouseDX = 0; input.mouseDY = 0; input.wheel = 0; acc = 0; }
    // Outside of play, re-render the 3D scene only a few times per second (menus overlay a still scene).
    idleFrames = state === 'playing' ? 0 : idleFrames + 1;
    frameNo++;
    hud.update(dt);
    // Outside of play the scene is static: present at ~20 Hz. In play the HUD canvas is redrawn at 30 Hz
    // and composited into the WebGL frame as a texture (one layer for the browser compositor).
    const present = state === 'playing' || idleFrames % 3 === 1;
    let tHud = 0, tDraw = 0;
    if (present) {
      if (frameNo % 2 === 0 || state !== 'playing') { const t0 = performance.now(); hud.draw(game, state); tHud = performance.now() - t0; }
      const tDraw0 = performance.now();
      game.draw();
      renderer.drawOverlay(hudCanvas, hud.dirty); hud.dirty = false;
      tDraw = performance.now() - tDraw0;
    }
    const k = 0.1;
    const tm = hud.timing || (hud.timing = { frame: 0, update: 0, draw: 0, hud: 0 });
    tm.frame += (performance.now() - tFrame0 - tm.frame) * k; tm.update += (tUpd - tm.update) * k; tm.draw += (tDraw - tm.draw) * k; if (tHud) tm.hud += (tHud - tm.hud) * k;
  }
  let idleFrames = 0, frameNo = 0;
  requestAnimationFrame(frame);

  if (ZM.DEV) {
    // Development hooks only (stripped from the distributed build by tools/build.py).
    window.ZMDEV = { game, renderer, hud, audio, input, getState: () => state, setState, lock };
  }
})();
