// ---------------------------------------------------------------------------
// 95_hud.js — Canvas2D HUD: points, round, ammo, perks, crosshair, prompts,
// power-up timers, damage overlay, round banners, toasts and menu screens.
// ---------------------------------------------------------------------------
(function () {
  const PERK_STYLE = {
    juggernog: { l: 'J', c: '#d0312d' }, speed_cola: { l: 'S', c: '#3fb44a' }, double_tap: { l: 'D', c: '#e3a21a' }, quick_revive: { l: 'Q', c: '#3b8ad9' },
  };
  class HUD {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.floats = []; this.toasts = []; this.banner = null; this.subBanner = null; this.flash = 0; this.fps = 0; this.showDebug = false;
      this.width = 0; this.height = 0;
    }
    // The HUD is rendered to an offscreen canvas (capped resolution) and composited by the WebGL renderer.
    resize(w, h) { const k = Math.min(1, 1600 / Math.max(1, w)); this.width = Math.round(w * k); this.height = Math.round(h * k); this.canvas.width = this.width; this.canvas.height = this.height; this.dirty = true; }
    pointsFloat(n) { this.floats.push({ n, t: 0 }); if (this.floats.length > 8) this.floats.shift(); }
    toast(text, dur = 3, color = '#fff') { this.toasts.push({ text, t: dur, max: dur, color }); if (this.toasts.length > 4) this.toasts.shift(); }
    showBanner(text, sub, dur = 4, color = '#c81e1e') { this.banner = { text, sub, t: dur, max: dur, color }; }
    whiteFlash(a = 1) { this.flash = a; }
    font(size, bold = true) { return `${bold ? 'bold ' : ''}${size}px Impact, "Arial Narrow", "Helvetica Neue", Arial, sans-serif`; }
    text(str, x, y, size, color = '#fff', align = 'left', opts = {}) {
      const c = this.ctx;
      c.font = this.font(size, opts.bold !== false);
      c.textAlign = align; c.textBaseline = opts.baseline || 'alphabetic';
      if (opts.shadow !== false) { c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillText(str, x + 2, y + 2); }
      if (opts.stroke) { c.lineWidth = opts.stroke; c.strokeStyle = opts.strokeColor || '#000'; c.strokeText(str, x, y); }
      c.fillStyle = color; c.fillText(str, x, y);
    }
    update(dt) {
      for (const f of this.floats) f.t += dt;
      this.floats = this.floats.filter(f => f.t < 1.4);
      for (const t of this.toasts) t.t -= dt;
      this.toasts = this.toasts.filter(t => t.t > 0);
      if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
      this.flash = Math.max(0, this.flash - dt * 1.5);
    }
    draw(game, state) {
      const c = this.ctx, W = this.width, H = this.height;
      this.dirty = true; this.hits = [];
      c.clearRect(0, 0, W, H);
      if (state === 'menu') { this.drawMenu(game); return; }
      if (state === 'settings') { if (this.settingsFrom === 'paused') this.drawGame(game); this.drawSettings(game); return; }
      if (state === 'flag') { this.drawGame(game); this.drawFlag(game); return; }
      this.drawGame(game);
      if (state === 'paused') this.drawPause(game);
      if (state === 'gameover') this.drawGameOver(game);
    }
    drawGame(game) {
      const c = this.ctx, W = this.width, H = this.height, p = game.player, s = Math.min(W / 1280, H / 720) || 1;
      // damage vignette
      const hp = p.health / p.maxHealth;
      const dmgA = Math.max(0, 1 - hp) * 0.85 + p.hurtFlash * 0.4;
      if (dmgA > 0.02 || p.downed) {
        const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        const pulse = hp < 0.4 ? 0.6 + 0.4 * Math.sin(game.time * 8) : 1;
        g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(120,0,0,${Math.min(1, (p.downed ? 0.9 : dmgA) * pulse)})`);
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; c.fillRect(0, 0, W, H); }
      // crosshair
      if (!p.downed) {
        const cx = W / 2, cy = H / 2;
        const spread = (p.ads ? 3 : 9 + (p.moving ? 8 : 0) + (p.sprinting ? 10 : 0)) * s + p.recoilKick * 300 * s;
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2 * s;
        const style = game.settings.get('crosshair');
        if (style === 'none') { /* no crosshair */ }
        else if (style === 'dot') { c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(cx, cy, 2.2 * s, 0, 7); c.fill(); }
        else if (!p.ads || p.weaponDef().cls !== 'sniper') {
          c.beginPath();
          c.moveTo(cx - spread - 8 * s, cy); c.lineTo(cx - spread, cy); c.moveTo(cx + spread, cy); c.lineTo(cx + spread + 8 * s, cy);
          c.moveTo(cx, cy - spread - 8 * s); c.lineTo(cx, cy - spread); c.moveTo(cx, cy + spread); c.lineTo(cx, cy + spread + 8 * s);
          c.stroke();
        } else {
          // sniper scope
          c.fillStyle = 'rgba(0,0,0,0.92)'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, Math.min(W, H) * 0.42, 0, Math.PI * 2, true); c.fill();
          c.strokeStyle = '#000'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - W, cy); c.lineTo(cx + W, cy); c.moveTo(cx, 0); c.lineTo(cx, H); c.stroke();
        }
        if (p.hitMarker > 0) {
          c.strokeStyle = p.hitMarkerKill ? 'rgba(255,40,40,0.95)' : 'rgba(255,255,255,0.95)'; c.lineWidth = 2.5 * s;
          const o = 6 * s, l = 8 * s;
          c.beginPath();
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.moveTo(cx + dx * o, cy + dy * o); c.lineTo(cx + dx * (o + l), cy + dy * (o + l)); }
          c.stroke();
        }
      }
      // ---- bottom-left: perks, points, round ----
      const bl = { x: 28 * s, y: H - 28 * s };
      let px = bl.x;
      for (const perk of p.perks) {
        const st = PERK_STYLE[perk] || { l: '?', c: '#888' };
        c.fillStyle = st.c; c.beginPath(); c.arc(px + 17 * s, bl.y - 104 * s, 17 * s, 0, 7); c.fill();
        c.strokeStyle = '#000'; c.lineWidth = 2; c.stroke();
        this.text(st.l, px + 17 * s, bl.y - 96 * s, 22 * s, '#fff', 'center', { shadow: false });
        px += 42 * s;
      }
      this.text(String(Math.floor(p.points)), bl.x, bl.y - 44 * s, 44 * s, '#fff', 'left');
      for (const f of this.floats) {
        const a = 1 - f.t / 1.4;
        this.text((f.n > 0 ? '+' : '') + f.n, bl.x + 150 * s, bl.y - 52 * s - f.t * 40 * s, 26 * s, f.n > 0 ? `rgba(255,230,120,${a})` : `rgba(255,120,120,${a})`, 'left');
      }
      // round number (tally marks for 1-5 like classic zombies, numbers beyond)
      const rx = bl.x, ry = bl.y;
      c.save();
      if (game.round <= 5 && !game.dogRound) {
        c.strokeStyle = '#b81414'; c.lineWidth = 6 * s; c.lineCap = 'round';
        for (let i = 0; i < game.round; i++) {
          c.beginPath();
          if (i < 4) { c.moveTo(rx + 8 * s + i * 16 * s, ry - 4 * s); c.lineTo(rx + 8 * s + i * 16 * s + 4 * s, ry - 34 * s); }
          else { c.moveTo(rx, ry - 26 * s); c.lineTo(rx + 70 * s, ry - 12 * s); }
          c.stroke();
        }
      } else {
        this.text(String(game.round), rx, ry, 64 * s, '#c41818', 'left', { stroke: 2, strokeColor: '#3a0000' });
      }
      c.restore();
      if (game.dogRound) this.text('HELLHOUNDS', rx + 110 * s, ry - 6 * s, 20 * s, '#ff9c3a', 'left');
      // ---- bottom-right: weapon + ammo ----
      const ws = p.weapon(), wd = ZM.Weapons.defs[ws.id];
      const brx = W - 28 * s, bry = H - 28 * s;
      this.text(ZM.Weapons.nameOf(ws), brx, bry - 56 * s, 22 * s, ws.pap ? '#e08cff' : '#ddd', 'right');
      this.text(`${ws.mag}`, brx - 60 * s, bry, 44 * s, ws.mag === 0 ? '#ff5050' : '#fff', 'right');
      this.text(`/ ${ws.reserve}`, brx, bry, 26 * s, ws.reserve === 0 ? '#ff5050' : '#bbb', 'right');
      if (p.reloading) this.text('RELOADING', brx, bry - 86 * s, 18 * s, '#ffd27a', 'right');
      // grenades / tactical
      let gx = brx;
      for (let i = 0; i < p.grenades; i++) { c.fillStyle = '#9db36a'; c.beginPath(); c.arc(gx - 8 * s, bry - 118 * s, 7 * s, 0, 7); c.fill(); gx -= 20 * s; }
      if (p.monkeys > 0) this.text(`Monkeys ×${p.monkeys}`, brx, bry - 140 * s, 16 * s, '#ffd27a', 'right');
      if (p.hasClaymores) this.text(`Claymores ×${p.claymores}`, brx, bry - (p.monkeys > 0 ? 160 : 140) * s, 16 * s, '#ffd27a', 'right');
      if (!p.bowie && false) void 0;
      // second weapon hint
      if (p.weapons.length > 1) { const o = p.weapons[1 - p.cur]; this.text(ZM.Weapons.nameOf(o) + `  ${o.mag}/${o.reserve}`, brx, bry - 34 * s, 14 * s, '#888', 'right'); }
      // ---- top: power-ups ----
      let tx = W / 2;
      const pus = [];
      if (game.instaKill > 0) pus.push(['INSTA-KILL', game.instaKill, '#ff5a3c']);
      if (game.doublePoints > 0) pus.push(['DOUBLE POINTS', game.doublePoints, '#ffd23c']);
      if (game.fireSale > 0) pus.push(['FIRE SALE', game.fireSale, '#ff6ad5']);
      tx -= (pus.length - 1) * 110 * s;
      for (const [name, t, col] of pus) {
        const blink = t < 5 && Math.floor(t * 4) % 2 === 0;
        if (!blink) { c.fillStyle = col; c.beginPath(); c.arc(tx, 48 * s, 20 * s, 0, 7); c.fill(); this.text(name, tx, 92 * s, 15 * s, '#fff', 'center'); this.text(Math.ceil(t) + 's', tx, 54 * s, 16 * s, '#000', 'center', { shadow: false }); }
        tx += 220 * s;
      }
      // power / link status
      if (game.linkTimer > 0) this.text(`RETURN TO THE MAINFRAME: ${Math.ceil(game.linkTimer)}s`, W / 2, 130 * s, 22 * s, '#8fd3ff', 'center');
      // ---- interaction prompt ----
      if (p.interact && !p.downed) this.text(p.interact.text, W / 2, H / 2 + 70 * s, 20 * s, p.interact.can === false ? '#ff8080' : '#fff', 'center');
      // ---- downed ----
      if (p.downed) {
        this.text(p.dying ? 'YOU ARE DOWN' : 'QUICK REVIVE', W / 2, H / 2 - 40 * s, 48 * s, '#ff3030', 'center');
        this.text(p.dying ? 'No one is coming…' : `Reviving in ${Math.ceil(p.downTimer)}`, W / 2, H / 2 + 10 * s, 24 * s, '#fff', 'center');
      }
      // ---- banner ----
      if (this.banner) {
        const b = this.banner, a = Math.min(1, b.t / 0.6, (b.max - b.t) / 0.4);
        c.globalAlpha = a;
        this.text(b.text, W / 2, H * 0.3, 72 * s, b.color, 'center', { stroke: 3, strokeColor: '#200' });
        if (b.sub) this.text(b.sub, W / 2, H * 0.3 + 44 * s, 24 * s, '#ddd', 'center');
        c.globalAlpha = 1;
      }
      // ---- toasts ----
      let ty = H * 0.62;
      for (const t of this.toasts) { const a = Math.min(1, t.t / 0.5); c.globalAlpha = a; this.text(t.text, W / 2, ty, 20 * s, t.color, 'center'); ty += 26 * s; c.globalAlpha = 1; }
      if (game.settings.get('showFps')) this.text(`${this.fps.toFixed(0)} fps`, W - 20 * s, 30 * s, 16 * s, '#8f8', 'right', { bold: false });
      // ---- debug ----
      if (this.showDebug) {
        const t = this.timing || {};
        const lines = [
          `fps ${this.fps.toFixed(0)}  frame ${(t.frame || 0).toFixed(1)}ms (update ${(t.update || 0).toFixed(2)} · draw-cpu ${(t.draw || 0).toFixed(2)} · hud ${(t.hud || 0).toFixed(2)})`,
          `gl ${game.renderer.canvas.width}×${game.renderer.canvas.height} scale ${Math.round((game.renderer.scale || 1) * 100)}%  draws ${game.renderer.drawCalls}  chunks ${game.stats.chunks}/${game.staticChunks.length} windows ${game.stats.windows} zombies-drawn ${game.stats.zombies}/${game.zombies.length}`,
          `renderer: ${(game.renderer.rendererName || '?').slice(0, 90)}${game.renderer.software ? '  [SOFTWARE]' : ''}`,
          `pos ${p.pos.x.toFixed(1)},${p.pos.y.toFixed(1)},${p.pos.z.toFixed(1)} yaw ${p.yaw.toFixed(2)}  zone ${game.map.zoneAt(p.pos.x, p.pos.z)}  toSpawn ${game.toSpawn} state ${game.roundState}`,
          `vault ${game.vault.state.slice(0, 16)}…  particles ${game.particles.list.length}  last key: ${this.lastKey || '-'}`,
        ];
        lines.forEach((l, i) => this.text(l, 10, 20 + i * 16, 13, '#0f0', 'left', { bold: false }));
      }
    }
    drawCenteredBox(w, h, alpha = 0.75) {
      const c = this.ctx, W = this.width, H = this.height;
      c.fillStyle = `rgba(0,0,0,${alpha})`; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(20,20,24,0.9)'; c.fillRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
      c.strokeStyle = '#7a1414'; c.lineWidth = 3; c.strokeRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
    }
    // ---------- simple canvas widgets (hit rectangles registered per draw) ----------
    handleClick(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { if (h.onClick) h.onClick(x, y); return true; } }
      return false;
    }
    handleDown(x, y) {
      for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (h.onDrag && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { this.drag = h; h.onDrag(x); return true; } }
      return false;
    }
    handleMove(x, y) { this.mx = x; this.my = y; if (this.drag) this.drag.onDrag(x); }
    handleUp() { this.drag = null; }
    hover(x, y, w, h) { return this.mx >= x && this.mx <= x + w && this.my >= y && this.my <= y + h; }
    button(label, x, y, w, h, onClick, opts = {}) {
      const c = this.ctx, hov = this.hover(x, y, w, h);
      c.fillStyle = opts.active ? 'rgba(170,30,30,0.9)' : hov ? 'rgba(90,20,20,0.9)' : 'rgba(30,30,36,0.9)';
      c.fillRect(x, y, w, h);
      c.strokeStyle = opts.active || hov ? '#ff6b6b' : '#7a1414'; c.lineWidth = 2; c.strokeRect(x, y, w, h);
      this.text(label, x + w / 2, y + h / 2 + (opts.size || 18) * 0.36, opts.size || 18, '#fff', 'center');
      this.hits.push({ x, y, w, h, onClick });
    }
    slider(label, valueText, x, y, w, t, onChange) {
      const c = this.ctx, h = 26;
      this.text(label, x, y + 18, 17, '#ddd', 'left', { bold: false });
      const sx = x + 260, sw = w - 340;
      c.fillStyle = '#2a2a30'; c.fillRect(sx, y + 8, sw, 10);
      c.fillStyle = '#c41818'; c.fillRect(sx, y + 8, sw * t, 10);
      c.fillStyle = '#fff'; c.fillRect(sx + sw * t - 5, y + 2, 10, 22);
      this.text(valueText, x + w, y + 18, 17, '#ffd27a', 'right', { bold: false });
      this.hits.push({ x: sx - 8, y: y - 4, w: sw + 16, h: h + 8, onDrag: (px) => onChange(ZM.U.clamp((px - sx) / sw, 0, 1)) });
    }
    toggle(label, value, x, y, w, onChange) {
      this.text(label, x, y + 18, 17, '#ddd', 'left', { bold: false });
      this.button(value ? 'ON' : 'OFF', x + w - 90, y - 4, 90, 30, () => onChange(!value), { active: value, size: 16 });
    }
    choice(label, options, value, x, y, w, onChange) {
      this.text(label, x, y + 18, 17, '#ddd', 'left', { bold: false });
      let bx = x + w - options.length * 96;
      for (const o of options) { this.button(o.label, bx, y - 4, 90, 30, () => onChange(o.value), { active: o.value === value, size: 15 }); bx += 96; }
    }

    drawMenu(game) {
      const c = this.ctx, W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1, st = game.settings;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, W, H);
      this.text('DER RIESE', W / 2, H * 0.2, 96 * s, '#c41818', 'center', { stroke: 4, strokeColor: '#2a0000' });
      this.text('CALL OF DUTY: ZOMBIES — browser remake (fan project)', W / 2, H * 0.2 + 36 * s, 20 * s, '#ccc', 'center');
      this.text('Survive to ROUND 100. The mainframe will reward you.', W / 2, H * 0.2 + 70 * s, 22 * s, '#8fd3ff', 'center');
      const k = (a) => st.keyName(a);
      const lines = [
        `${k('forward')}${k('left')}${k('back')}${k('right')} move · ${k('sprint')} sprint · ${k('fire')} fire · ${k('ads')} aim · ${k('reload')} reload`,
        `${k('weapon1')}/${k('weapon2')}/${k('switch')}/wheel switch · ${k('melee')} knife · ${k('grenade')} grenade · ${k('monkey')} monkey bomb · ${k('claymore')} claymore`,
        `${k('interact')} interact (doors, wall guns, perks, box, power, traps, teleporters, Pack-a-Punch)`,
        'Esc pause · M mute · [ ] render scale',
      ];
      lines.forEach((l, i) => this.text(l, W / 2, H * 0.47 + i * 26 * s, 17 * s, '#ddd', 'center', { bold: false }));
      const blink = Math.floor(Date.now() / 500) % 2 === 0;
      if (blink) this.text(game.started && !game.gameOver ? 'CLICK TO RESUME' : 'CLICK TO PLAY', W / 2, H * 0.72, 40 * s, '#fff', 'center');
      this.button('SETTINGS', W / 2 - 110 * s, H * 0.77, 220 * s, 44 * s, () => this.openSettings('menu'), { size: 20 * s });
      const best = game.bestRound();
      if (best > 0) this.text(`Best round: ${best}`, W / 2, H * 0.77 + 72 * s, 20 * s, '#ffd27a', 'center');
      this.text(`Render ${game.renderer.canvas.width}×${game.renderer.canvas.height} (${Math.round((game.renderer.scale || 1) * 100)}%)`, W / 2, H * 0.95, 14 * s, '#777', 'center', { bold: false });
    }
    drawPause(game) {
      const W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1;
      this.drawCenteredBox(620 * s, 330 * s, 0.5);
      this.text('PAUSED', W / 2, H / 2 - 100 * s, 56 * s, '#fff', 'center');
      this.text('Click anywhere to resume', W / 2, H / 2 - 56 * s, 18 * s, '#ccc', 'center', { bold: false });
      this.text(`Round ${game.round} · Kills ${game.player.kills}`, W / 2, H / 2 - 26 * s, 18 * s, '#ffd27a', 'center');
      this.button('SETTINGS', W / 2 - 240 * s, H / 2 + 0 * s, 220 * s, 44 * s, () => this.openSettings('paused'), { size: 20 * s });
      this.button('QUIT TO MENU', W / 2 + 20 * s, H / 2 + 0 * s, 220 * s, 44 * s, () => { if (this.onQuit) this.onQuit(); }, { size: 20 * s });
      const t = this.timing || {};
      const perf = [
        `Performance: ${this.fps.toFixed(0)} fps · frame ${(t.frame || 0).toFixed(1)} ms (update ${(t.update || 0).toFixed(2)} · draw-cpu ${(t.draw || 0).toFixed(2)} · hud ${(t.hud || 0).toFixed(2)})`,
        `Render ${game.renderer.canvas.width}×${game.renderer.canvas.height} (${Math.round((game.renderer.scale || 1) * 100)}%) · draws ${game.renderer.drawCalls} · rooms ${game.stats.chunks}/${game.staticChunks.length}`,
        `GPU: ${(game.renderer.rendererName || 'unknown').slice(0, 80)}${game.renderer.software ? '  [SOFTWARE RENDERING]' : ''}`,
      ];
      perf.forEach((l, i) => this.text(l, W / 2, H / 2 + (70 + i * 20) * s, 13 * s, '#9fd3ff', 'center', { bold: false }));
    }
    openSettings(from) { this.settingsFrom = from; this.tab = this.tab || 0; if (this.onOpenSettings) this.onOpenSettings(from); }
    drawSettings(game) {
      const c = this.ctx, W = this.width, H = this.height, st = game.settings, d = st.data;
      const s = Math.min(W / 1280, H / 720) || 1;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, W, H);
      const pw = Math.min(W - 20, 980), ph = Math.min(H - 20, 640), px = (W - pw) / 2, py = (H - ph) / 2;
      c.fillStyle = 'rgba(18,18,22,0.96)'; c.fillRect(px, py, pw, ph);
      c.strokeStyle = '#7a1414'; c.lineWidth = 3; c.strokeRect(px, py, pw, ph);
      this.text('SETTINGS', px + pw / 2, py + 44, 36, '#c41818', 'center', { stroke: 2, strokeColor: '#200' });
      const tabs = ['CONTROLS', 'MOUSE & AIM', 'VIDEO', 'AUDIO'];
      const tw = 170;
      tabs.forEach((t, i) => this.button(t, px + pw / 2 - (tabs.length * (tw + 8)) / 2 + i * (tw + 8), py + 64, tw, 36, () => { this.tab = i; }, { active: this.tab === i, size: 16 }));
      const changed = () => { st.save(); if (this.onSettingsChanged) this.onSettingsChanged(); };
      const x = px + 40, w = pw - 80;
      let y = py + 130;
      if (this.tab === 0) {
        const acts = ZM.Settings.ACTIONS;
        const colW = (w - 20) / 2;
        acts.forEach((a, i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const ax = x + col * (colW + 20), ay = y + row * 40;
          this.text(a[1], ax, ay + 20, 16, '#ddd', 'left', { bold: false });
          const capturing = this.capture === a[0];
          this.button(capturing ? 'PRESS A KEY…' : st.keyName(a[0]), ax + colW - 150, ay - 2, 150, 32, () => { this.capture = a[0]; }, { active: capturing, size: 15 });
        });
        this.text('Click a binding, then press the key or mouse button to use. Esc cancels. Duplicates swap.', px + pw / 2, py + ph - 76, 14, '#999', 'center', { bold: false });
        this.button('RESET TO DEFAULTS', px + pw - 260, py + ph - 56, 220, 36, () => { st.reset(); changed(); }, { size: 15 });
      } else if (this.tab === 1) {
        this.slider('Mouse sensitivity', d.sensitivity.toFixed(1), x, y, w, (d.sensitivity - 0.5) / 9.5, (t) => { d.sensitivity = Math.round((0.5 + t * 9.5) * 10) / 10; changed(); }); y += 50;
        this.toggle('Invert vertical look', d.invertY, x, y, w, (v) => { d.invertY = v; changed(); }); y += 50;
        this.choice('Aim down sights', [{ label: 'HOLD', value: false }, { label: 'TOGGLE', value: true }], d.adsToggle, x, y, w, (v) => { d.adsToggle = v; changed(); }); y += 50;
        this.choice('Sprint', [{ label: 'HOLD', value: false }, { label: 'TOGGLE', value: true }], d.sprintToggle, x, y, w, (v) => { d.sprintToggle = v; changed(); }); y += 50;
        this.slider('Field of view', `${d.fov}°`, x, y, w, (d.fov - 60) / 50, (t) => { d.fov = Math.round(60 + t * 50); changed(); }); y += 50;
      } else if (this.tab === 2) {
        const rs = d.renderScale || 0;
        this.slider('Render scale (0 = auto)', rs ? `${rs}% (${game.renderer.canvas.width}×${game.renderer.canvas.height})` : `Auto (${game.renderer.canvas.width}×${game.renderer.canvas.height})`, x, y, w, rs ? (rs - 30) / 70 : 0, (t) => { d.renderScale = t < 0.02 ? 0 : Math.round((30 + t * 70) / 5) * 5; changed(); }); y += 50;
        this.toggle('Show FPS counter', d.showFps, x, y, w, (v) => { d.showFps = v; changed(); }); y += 50;
        this.toggle('Weapon view bob', d.viewBob, x, y, w, (v) => { d.viewBob = v; changed(); }); y += 50;
        this.choice('Crosshair', [{ label: 'CROSS', value: 'cross' }, { label: 'DOT', value: 'dot' }, { label: 'NONE', value: 'none' }], d.crosshair, x, y, w, (v) => { d.crosshair = v; changed(); }); y += 50;
        this.text(`GPU: ${(game.renderer.rendererName || 'unknown').slice(0, 70)}${game.renderer.software ? ' [SOFTWARE]' : ''}`, x, y + 18, 14, '#999', 'left', { bold: false }); y += 30;
        this.text('Lower the render scale if the game stutters. Firefox without hardware acceleration caps frame rate regardless.', x, y + 18, 14, '#999', 'left', { bold: false });
      } else {
        this.slider('Master volume', `${Math.round(d.volume * 100)}%`, x, y, w, d.volume, (t) => { d.volume = Math.round(t * 100) / 100; changed(); }); y += 50;
        this.toggle('Mute', d.muted, x, y, w, (v) => { d.muted = v; changed(); }); y += 50;
        this.text('All sounds are synthesized in the browser (no audio files).', x, y + 18, 14, '#999', 'left', { bold: false });
      }
      this.button('BACK', px + 40, py + ph - 56, 160, 36, () => { if (this.onCloseSettings) this.onCloseSettings(); }, { size: 16 });
      if (this.capture) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(px, py + 100, pw, 40); this.text(`Press a key or mouse button for "${(ZM.Settings.ACTIONS.find(a => a[0] === this.capture) || [])[1]}" — Esc to cancel`, px + pw / 2, py + 127, 18, '#ffd27a', 'center'); }
    }
    drawGameOver(game) {
      const W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1, p = game.player;
      this.drawCenteredBox(640 * s, 360 * s, 0.7);
      this.text('GAME OVER', W / 2, H / 2 - 100 * s, 72 * s, '#c41818', 'center', { stroke: 3, strokeColor: '#200' });
      this.text(`You survived ${game.round} round${game.round === 1 ? '' : 's'}`, W / 2, H / 2 - 40 * s, 28 * s, '#fff', 'center');
      this.text(`Kills ${p.kills} · Headshots ${p.headshots} · Downs ${p.downs} · Shots ${p.shotsFired}`, W / 2, H / 2, 20 * s, '#ccc', 'center', { bold: false });
      this.text(`Best round: ${game.bestRound()}`, W / 2, H / 2 + 36 * s, 20 * s, '#ffd27a', 'center');
      this.text('Round 100 was ' + (game.round >= 100 ? 'reached!' : 'not reached. The mainframe stays sealed.'), W / 2, H / 2 + 76 * s, 18 * s, '#8fd3ff', 'center', { bold: false });
      this.text('Click to return to the menu', W / 2, H / 2 + 130 * s, 22 * s, '#fff', 'center');
    }
    drawFlag(game) {
      const W = this.width, H = this.height, s = Math.min(W / 1280, H / 720) || 1;
      const r = game.flagResult;
      this.drawCenteredBox(Math.min(W - 20, 980 * s), 300 * s, 0.6);
      if (r && r.ok) {
        this.text('MAINFRAME UNLOCKED', W / 2, H / 2 - 80 * s, 56 * s, '#8fd3ff', 'center');
        this.text('Round 100 reached. Element 115 resonance accepted:', W / 2, H / 2 - 30 * s, 20 * s, '#ddd', 'center', { bold: false });
        this.ctx.font = `bold ${Math.min(34 * s, (900 * s) / Math.max(1, r.flag.length) * 1.9)}px monospace`;
        this.ctx.textAlign = 'center'; this.ctx.fillStyle = '#fff'; this.ctx.fillText(r.flag, W / 2, H / 2 + 30 * s);
      } else {
        this.text('MAINFRAME REJECTS DATA', W / 2, H / 2 - 60 * s, 52 * s, '#ff5050', 'center');
        this.text('Round 100 claimed, but the 115 resonance chain does not verify.', W / 2, H / 2, 20 * s, '#ddd', 'center', { bold: false });
        this.text('Every round must be walked through the mainframe, one by one.', W / 2, H / 2 + 30 * s, 20 * s, '#ddd', 'center', { bold: false });
      }
      this.text('Click to continue playing', W / 2, H / 2 + 110 * s, 20 * s, '#aaa', 'center', { bold: false });
    }
  }
  ZM.HUD = HUD;
})();
