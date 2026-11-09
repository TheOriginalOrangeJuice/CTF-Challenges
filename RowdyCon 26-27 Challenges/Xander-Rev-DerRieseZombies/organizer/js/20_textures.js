// ---------------------------------------------------------------------------
// 20_textures.js — procedural canvas textures (no asset files needed).
// Dark 1940s factory palette: grey stone, sooty brick, stained concrete,
// riveted steel, corrugated roofing, hex panels, chain-link, grating, windows.
// ---------------------------------------------------------------------------
(function () {
  const T = ZM.Textures = {};

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function noiseFill(ctx, w, h, base, amp, rng, grainSize = 1) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y += grainSize) for (let x = 0; x < w; x += grainSize) {
      const n = (rng() - 0.5) * amp;
      for (let yy = 0; yy < grainSize; yy++) for (let xx = 0; xx < grainSize; xx++) {
        const i = ((y + yy) * w + (x + xx)) * 4;
        if (i >= d.length) continue;
        d[i] = ZM.U.clamp(base[0] + n, 0, 255);
        d[i + 1] = ZM.U.clamp(base[1] + n, 0, 255);
        d[i + 2] = ZM.U.clamp(base[2] + n, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  // low-frequency blotches (multiplicative darkening / lightening)
  function blotches(ctx, w, h, rng, count, rmin, rmax, color, alpha) {
    for (let i = 0; i < count; i++) {
      const r = rmin + rng() * (rmax - rmin);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, color.replace('A', String(alpha)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.save(); ctx.translate(rng() * w, rng() * h); ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
    }
  }
  function streaks(ctx, w, h, rng, count, color, alpha, drift = 10) {
    ctx.globalAlpha = alpha; ctx.strokeStyle = color;
    for (let i = 0; i < count; i++) {
      ctx.lineWidth = 1 + rng() * 2; ctx.beginPath();
      const x = rng() * w, y0 = rng() * h * 0.5;
      ctx.moveTo(x, y0); ctx.lineTo(x + (rng() - 0.5) * drift, y0 + h * (0.3 + rng() * 0.7)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function grime(ctx, w, h, rng, count, alpha) { blotches(ctx, w, h, rng, count, 4, 28, 'rgba(0,0,0,A)', alpha); }
  function cracks(ctx, w, h, rng, n, color = 'rgba(25,25,24,0.75)') {
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); let x = rng() * w, y = rng() * h; ctx.moveTo(x, y);
      for (let k = 0; k < 10; k++) { x += (rng() - 0.5) * 28; y += (rng() - 0.5) * 28; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function rivet(ctx, x, y, r = 3) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x + 1, y + 1, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a6e74'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = '#a0a4aa'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, 7); ctx.fill();
  }

  // ---- surfaces ----
  T.concrete = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(11);
    noiseFill(ctx, w, h, [92, 91, 88], 26, rng, 2);
    blotches(ctx, w, h, rng, 30, 20, 70, 'rgba(60,58,52,A)', 0.35);
    streaks(ctx, w, h, rng, 30, '#2e2c28', 0.18, 6);
    grime(ctx, w, h, rng, 30, 0.3);
    cracks(ctx, w, h, rng, 4);
    ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.moveTo(128, 0); ctx.lineTo(128, h); ctx.stroke();
    return c;
  };
  T.plaster = function () { // pale interior wall (office)
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(12);
    noiseFill(ctx, w, h, [128, 122, 108], 20, rng, 2);
    blotches(ctx, w, h, rng, 20, 20, 80, 'rgba(70,60,40,A)', 0.4);
    streaks(ctx, w, h, rng, 20, '#4a4036', 0.2);
    cracks(ctx, w, h, rng, 5, 'rgba(60,50,40,0.6)');
    return c;
  };
  T.floor = function () { // dark stained concrete slabs
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(23);
    noiseFill(ctx, w, h, [68, 67, 64], 22, rng, 2);
    blotches(ctx, w, h, rng, 40, 15, 60, 'rgba(20,18,14,A)', 0.45);
    blotches(ctx, w, h, rng, 12, 20, 50, 'rgba(110,105,95,A)', 0.2);
    cracks(ctx, w, h, rng, 5, 'rgba(20,20,20,0.7)');
    ctx.strokeStyle = 'rgba(18,18,18,0.8)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke(); }
    return c;
  };
  T.ground = function () { // outdoor yard: cracked slabs, dirt and gravel
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(29);
    noiseFill(ctx, w, h, [74, 72, 66], 26, rng, 2);
    blotches(ctx, w, h, rng, 30, 20, 70, 'rgba(50,42,30,A)', 0.5);
    blotches(ctx, w, h, rng, 30, 10, 40, 'rgba(15,14,12,A)', 0.4);
    ctx.fillStyle = 'rgba(130,125,110,0.3)';
    for (let i = 0; i < 160; i++) ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 2);
    cracks(ctx, w, h, rng, 8, 'rgba(18,18,16,0.8)');
    ctx.strokeStyle = 'rgba(22,22,20,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.moveTo(128, 0); ctx.lineTo(128, h); ctx.stroke();
    return c;
  };
  T.dirt = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(31);
    noiseFill(ctx, w, h, [62, 52, 40], 36, rng, 3);
    blotches(ctx, w, h, rng, 30, 20, 60, 'rgba(20,14,8,A)', 0.5);
    ctx.fillStyle = 'rgba(110,100,80,0.25)';
    for (let i = 0; i < 100; i++) ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 4, 1 + rng() * 2);
    return c;
  };
  T.brick = function () { // sooty red-brown brick, grey mortar
    const w = 512, h = 512, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(47);
    ctx.fillStyle = '#4a4744'; ctx.fillRect(0, 0, w, h);
    const bw = 64, bh = 24;
    for (let row = 0; row < h / bh + 1; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + off, y = row * bh;
        const t = rng();
        const r = 86 + t * 34, g = 54 + t * 18, b = 44 + t * 12;
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = `rgba(0,0,0,${rng() * 0.35})`; ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 2, y + 2, bw - 4, 2);
      }
    }
    blotches(ctx, w, h, rng, 30, 40, 110, 'rgba(0,0,0,A)', 0.28);
    blotches(ctx, w, h, rng, 16, 30, 90, 'rgba(120,110,95,A)', 0.14);
    streaks(ctx, w, h, rng, 40, '#1a1612', 0.25, 8);
    return c;
  };
  T.stone = function () { // grey ashlar blocks (outdoor factory walls)
    const w = 512, h = 512, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(53);
    ctx.fillStyle = '#3c3b38'; ctx.fillRect(0, 0, w, h);
    const bw = 128, bh = 64;
    for (let row = 0; row < h / bh + 1; row++) {
      const off = (row % 2) * bw / 2;
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + off, y = row * bh, t = rng();
        const v = 96 + t * 30;
        ctx.fillStyle = `rgb(${v | 0},${(v - 2) | 0},${(v - 8) | 0})`;
        ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 3, y + 3, bw - 6, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 3, y + bh - 8, bw - 6, 5);
      }
    }
    noiseOverlay(ctx, w, h, rng, 18);
    blotches(ctx, w, h, rng, 24, 40, 120, 'rgba(0,0,0,A)', 0.22);
    streaks(ctx, w, h, rng, 30, '#141412', 0.22, 10);
    cracks(ctx, w, h, rng, 6, 'rgba(20,20,20,0.6)');
    return c;
  };
  function noiseOverlay(ctx, w, h, rng, amp) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rng() - 0.5) * amp; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  T.metal = function () { // dark gunmetal riveted panels
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(59);
    noiseFill(ctx, w, h, [66, 70, 76], 18, rng, 1);
    streaks(ctx, w, h, rng, 50, '#1e2024', 0.3, 6);
    blotches(ctx, w, h, rng, 20, 20, 70, 'rgba(90,60,40,A)', 0.25);
    ctx.strokeStyle = 'rgba(14,16,20,0.9)'; ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    for (let i = 0; i < 24; i++) rivet(ctx, 10 + (i % 6) * 47, 10 + Math.floor(i / 6) * 78, 3.5);
    grime(ctx, w, h, rng, 30, 0.3);
    return c;
  };
  T.girder = function () { // dark steel for I-beams, with rivet rows along the edges
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(61);
    noiseFill(ctx, w, h, [50, 52, 56], 16, rng, 1);
    blotches(ctx, w, h, rng, 14, 10, 40, 'rgba(110,70,40,A)', 0.3);
    streaks(ctx, w, h, rng, 20, '#141416', 0.3, 4);
    for (let i = 0; i < 4; i++) { rivet(ctx, 16 + i * 32, 12, 3); rivet(ctx, 16 + i * 32, h - 12, 3); }
    ctx.strokeStyle = 'rgba(10,10,12,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    return c;
  };
  T.rust = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(71);
    noiseFill(ctx, w, h, [96, 58, 34], 44, rng, 2);
    blotches(ctx, w, h, rng, 30, 20, 70, 'rgba(30,14,6,A)', 0.5);
    streaks(ctx, w, h, rng, 60, '#2a140a', 0.35, 8);
    return c;
  };
  T.wood = function () {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(83);
    noiseFill(ctx, w, h, [94, 70, 46], 26, rng, 1);
    ctx.globalAlpha = 0.4; ctx.strokeStyle = '#3a2210';
    for (let i = 0; i < 90; i++) { ctx.lineWidth = 1 + rng(); ctx.beginPath(); const y = rng() * h; ctx.moveTo(0, y); ctx.bezierCurveTo(w / 3, y + (rng() - 0.5) * 8, 2 * w / 3, y + (rng() - 0.5) * 8, w, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(20,12,6,0.9)'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke(); }
    grime(ctx, w, h, rng, 20, 0.35);
    return c;
  };
  T.corrugated = function () { // ribbed roofing / wall panels (ribs run along the texture's v axis)
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(89);
    noiseFill(ctx, w, h, [78, 80, 84], 14, rng, 1);
    for (let x = 0; x < w; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.45, 'rgba(255,255,255,0.12)'); g.addColorStop(0.7, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, h);
    }
    blotches(ctx, w, h, rng, 20, 20, 60, 'rgba(100,60,30,A)', 0.3);
    grime(ctx, w, h, rng, 20, 0.3);
    ctx.strokeStyle = 'rgba(10,10,12,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(w, 128); ctx.stroke();
    return c;
  };
  T.hex = function () { // hexagonal steel panelling (teleporter rooms)
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(97);
    noiseFill(ctx, w, h, [112, 120, 130], 14, rng, 1);
    const R = 32, dx = R * 1.5, dy = R * Math.sqrt(3);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(18,22,28,0.95)';
    for (let col = -1; col < w / dx + 1; col++) for (let row = -1; row < h / dy + 2; row++) {
      const cx = col * dx, cy = row * dy + (col % 2 ? dy / 2 : 0);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      rivet(ctx, cx, cy, 3);
    }
    blotches(ctx, w, h, rng, 20, 20, 70, 'rgba(0,0,0,A)', 0.35);
    streaks(ctx, w, h, rng, 15, '#1a1e24', 0.2, 4);
    return c;
  };
  T.fence = function () { // chain-link (alpha)
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(165,168,172,1)'; ctx.lineWidth = 2.2;
    for (let i = -w; i < w * 2; i += 16) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke(); }
    return c;
  };
  T.grate = function () { // catwalk bar grating (alpha)
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#4e5156';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
    for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 1, h);
    return c;
  };
  T.cage = function () { // steel bars (alpha)
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#6a6e74';
    for (let i = 0; i < w; i += 16) ctx.fillRect(i + 6, 0, 4, h);
    ctx.fillRect(0, 2, w, 6); ctx.fillRect(0, h - 8, w, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < w; i += 16) ctx.fillRect(i + 6, 0, 1, h);
    return c;
  };
  function windowTex(lit, seed) {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(seed);
    ctx.fillStyle = '#1c1e22'; ctx.fillRect(0, 0, w, h);
    const cols = 4, rows = 6, pw = w / cols, ph = h / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const t = rng();
      if (lit) {
        const v = 0.55 + t * 0.45, broken = t < 0.12;
        ctx.fillStyle = broken ? '#0c0d10' : `rgb(${(255 * v) | 0},${(205 * v) | 0},${(130 * v) | 0})`;
      } else {
        const v = 26 + t * 26; ctx.fillStyle = `rgb(${v | 0},${(v + 6) | 0},${(v + 14) | 0})`;
      }
      ctx.fillRect(k * pw + 4, r * ph + 4, pw - 8, ph - 8);
      if (!lit) { ctx.fillStyle = 'rgba(140,160,190,0.12)'; ctx.fillRect(k * pw + 6, r * ph + 6, pw - 12, 4); }
    }
    ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
    grime(ctx, w, h, rng, 20, 0.25);
    return c;
  }
  T.winLit = () => windowTex(true, 101);
  T.winDark = () => windowTex(false, 103);
  T.sandbag = function () {
    const w = 128, h = 128, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(107);
    ctx.fillStyle = '#3a3226'; ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 3; col++) {
      const x = col * 48 + (row % 2) * 24 + 24, y = row * 32 + 16, t = rng();
      ctx.fillStyle = `rgb(${(128 + t * 30) | 0},${(112 + t * 26) | 0},${(80 + t * 20) | 0})`;
      ctx.beginPath(); ctx.ellipse(x, y, 23, 14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 5, 21, 8, 0, 0, Math.PI); ctx.fill();
    }
    grime(ctx, w, h, rng, 10, 0.3);
    return c;
  };
  T.cloth = function () {
    const w = 64, h = 64, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(101);
    noiseFill(ctx, w, h, [150, 150, 150], 60, rng, 1);
    grime(ctx, w, h, rng, 12, 0.5);
    return c;
  };
  T.skin = function () {
    const w = 64, h = 64, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(113);
    noiseFill(ctx, w, h, [170, 165, 150], 40, rng, 1);
    ctx.fillStyle = 'rgba(90,20,20,0.5)';
    for (let i = 0; i < 10; i++) ctx.fillRect(rng() * w, rng() * h, 3 + rng() * 8, 2 + rng() * 4);
    return c;
  };
  T.white = function () { const c = canvas(4, 4), ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4, 4); return c; };
  T.glow = function () {
    const w = 64, c = canvas(w, w), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    return c;
  };
  T.blob = function () {
    const w = 64, c = canvas(w, w), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    return c;
  };
  T.sky = function () {
    const w = 512, h = 256, c = canvas(w, h), ctx = c.getContext('2d'), rng = ZM.makeRng(131);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1222'); g.addColorStop(0.55, '#142036'); g.addColorStop(1, '#283650');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + rng() * 0.6})`; ctx.fillRect(rng() * w, rng() * h * 0.6, 1.2, 1.2); }
    // cloud bands
    for (let i = 0; i < 14; i++) { const x = rng() * w, y = 60 + rng() * 120, r = 40 + rng() * 80; const cg = ctx.createRadialGradient(x, y, 0, x, y, r); cg.addColorStop(0, 'rgba(90,100,130,0.4)'); cg.addColorStop(1, 'rgba(90,100,130,0)'); ctx.fillStyle = cg; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    const mg = ctx.createRadialGradient(380, 50, 4, 380, 50, 34); mg.addColorStop(0, 'rgba(235,238,255,1)'); mg.addColorStop(0.3, 'rgba(210,215,240,0.9)'); mg.addColorStop(1, 'rgba(120,130,180,0)');
    ctx.fillStyle = mg; ctx.fillRect(330, 0, 100, 100);
    return c;
  };

  // ---- labels / signs ----
  T.label = function (lines, bg, fg, opts = {}) {
    if (opts.chalk) return T.chalk(lines, opts.cls);
    if (opts.perk) return T.perkPanel(lines, bg, fg, opts.accent);
    const w = opts.w || 256, h = opts.h || 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (opts.stencil) { const rng = ZM.makeRng(7); grime(ctx, w, h, rng, 20, 0.4); }
    if (opts.border !== false) { ctx.strokeStyle = opts.border || fg; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12); }
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = opts.size || Math.min(44, Math.floor(h / (arr.length + 0.6)));
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    arr.forEach((ln, i) => ctx.fillText(String(ln), w / 2, h / 2 + (i - (arr.length - 1) / 2) * size * 1.1, w - 20));
    if (opts.stencil) { ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.25)'; const rng = ZM.makeRng(9); for (let i = 0; i < 80; i++) ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 6, 1 + rng() * 3); ctx.globalCompositeOperation = 'source-over'; }
    return c;
  };
  T.perkPanel = function (lines, bg, fg, accent) {
    const w = 256, h = 256, c = canvas(w, h), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = accent; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(16, 16, w - 32, 70);
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = Math.min(40, 230 / Math.max(...arr.map(l => l.length)) * 1.6);
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    arr.forEach((ln, i) => ctx.fillText(ln, w / 2, 36 + i * size * 1.05, w - 30));
    const bx = w / 2, by = 150;
    ctx.fillStyle = accent; ctx.beginPath();
    ctx.moveTo(bx - 10, by - 60); ctx.lineTo(bx + 10, by - 60); ctx.lineTo(bx + 10, by - 40); ctx.quadraticCurveTo(bx + 30, by - 30, bx + 30, by - 5);
    ctx.lineTo(bx + 30, by + 70); ctx.quadraticCurveTo(bx + 30, by + 85, bx + 15, by + 85); ctx.lineTo(bx - 15, by + 85); ctx.quadraticCurveTo(bx - 30, by + 85, bx - 30, by + 70);
    ctx.lineTo(bx - 30, by - 5); ctx.quadraticCurveTo(bx - 30, by - 30, bx - 10, by - 40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = bg; ctx.fillRect(bx - 22, by + 5, 44, 45);
    ctx.fillStyle = '#fff'; ctx.fillRect(bx - 12, by - 68, 24, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx - 24, by - 20, 6, 90);
    return c;
  };
  T.chalk = function (lines, cls) {
    const w = 256, h = 128, c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const rng = ZM.makeRng(cls ? cls.length * 7 + 3 : 5);
    ctx.strokeStyle = 'rgba(240,236,225,0.95)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const jitter = (x, y) => [x + (rng() - 0.5) * 2, y + (rng() - 0.5) * 2];
    const poly = (pts) => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = jitter(p[0], p[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); };
    const S = {
      pistol: [[60, 30], [150, 30], [150, 45], [100, 45], [95, 75], [75, 75], [78, 45], [60, 45], [60, 30]],
      smg: [[30, 36], [200, 36], [200, 48], [150, 48], [150, 60], [135, 60], [135, 48], [110, 48], [105, 80], [90, 80], [92, 48], [60, 48], [55, 58], [30, 58], [30, 36]],
      ar: [[20, 36], [215, 36], [215, 46], [160, 46], [160, 56], [145, 56], [145, 46], [115, 46], [110, 85], [95, 85], [97, 46], [70, 46], [60, 64], [25, 64], [20, 36]],
      shotgun: [[20, 38], [215, 38], [215, 48], [120, 48], [120, 56], [85, 56], [85, 48], [70, 48], [60, 66], [25, 66], [20, 38]],
      lmg: [[20, 34], [220, 34], [220, 48], [165, 48], [165, 82], [150, 82], [150, 48], [120, 48], [115, 85], [100, 85], [102, 48], [70, 48], [60, 66], [25, 66], [20, 34]],
      knife: [[70, 55], [180, 30], [195, 36], [95, 65], [95, 72], [70, 72], [70, 55]],
      claymore: [[80, 40], [180, 40], [185, 72], [75, 72], [80, 40]],
      launcher: [[20, 40], [220, 40], [220, 56], [20, 56], [20, 40]],
    };
    poly(S[cls] || S.smg);
    if (cls === 'ar' || cls === 'smg' || cls === 'lmg') poly([[30, 30], [30, 36]]);
    ctx.fillStyle = 'rgba(240,236,225,0.95)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const arr = Array.isArray(lines) ? lines : [lines];
    ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive, sans-serif';
    ctx.fillText(String(arr[0]), w / 2, 98, w - 20);
    if (arr[1] !== undefined) ctx.fillText(String(arr[1]), w / 2, 118, w - 20);
    return c;
  };
  T.boxLid = function () {
    const c = T.wood(), ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(20,10,5,0.55)'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 170px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 30; ctx.fillText('?', 128, 136);
    return c;
  };
  T.teleporterPad = function () {
    const w = 256, c = canvas(w, w), ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2e34'; ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = '#4a7ea8'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(128, 128, 100, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(128, 128, 70, 0, 7); ctx.stroke();
    ctx.fillStyle = '#8fd3ff'; ctx.font = 'bold 60px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('115', 128, 128);
    return c;
  };

  T.all = function () {
    return {
      concrete: T.concrete(), plaster: T.plaster(), floor: T.floor(), ground: T.ground(), dirt: T.dirt(), brick: T.brick(), stone: T.stone(),
      metal: T.metal(), girder: T.girder(), rust: T.rust(), wood: T.wood(), corrugated: T.corrugated(), hex: T.hex(),
      fence: T.fence(), grate: T.grate(), cage: T.cage(), winLit: T.winLit(), winDark: T.winDark(), sandbag: T.sandbag(),
      cloth: T.cloth(), skin: T.skin(), white: T.white(), glow: T.glow(), blob: T.blob(), sky: T.sky(), boxLid: T.boxLid(), pad: T.teleporterPad(),
    };
  };
})();
