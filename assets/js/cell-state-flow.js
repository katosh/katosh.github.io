/*
 * cell-state-flow.js: cells flowing through a branching cell-state tree.
 *
 * Recreates the build sequence of the Mellon slides (Bertinoro 2024, slides 3 to 10;
 * Janelia 2026, slides 6 to 9) as a loop: cells leave the stem state, move along the
 * tree, slow down at checkpoints and speed through transitions. Because slow regions
 * accumulate cells, density emerges from the dynamics. The loop alternates between
 * coloring cells by discrete cell type and by continuous cell-state density
 * (estimated live from the cell positions).
 *
 * Usage:
 *   <canvas data-anim="cell-state-flow" aria-label="..." style="width:100%;aspect-ratio:3/4"></canvas>
 *   <script src="assets/js/cell-state-flow.js" defer></script>
 * Options (data attributes): data-cells="420", data-mode="cycle|types|density",
 *   data-labels="on|off".
 * Theming (CSS custom properties on the canvas or an ancestor):
 *   --anim-fg (label text), --anim-tube (tree background; use an opaque color), --anim-stroke (cell outline).
 * Scroll-driven use: var m = CellStateFlow.mount(canvas, {manual: true}); m.setProgress(p);
 *   p in [0, 1]; coloring turns from cell type to density between p = 0.5 and 0.72.
 * Honors prefers-reduced-motion (renders one settled frame) and pauses off screen.
 * No dependencies.
 */
(function () {
  'use strict';

  // Tree in unit coordinates (x right, y down). Each segment is a quadratic Bezier.
  var SEG = {
    trunk: { p: [[0.50, 0.05], [0.50, 0.22], [0.50, 0.36]], next: ['left', 'right'], w: [0.42, 0.58] },
    left: { p: [[0.50, 0.36], [0.24, 0.50], [0.24, 0.92]], next: null },
    right: { p: [[0.50, 0.36], [0.70, 0.46], [0.66, 0.60]], next: ['rl', 'rr'], w: [0.5, 0.5] },
    rl: { p: [[0.66, 0.60], [0.56, 0.74], [0.56, 0.94]], next: null },
    rr: { p: [[0.66, 0.60], [0.82, 0.72], [0.84, 0.90]], next: null }
  };
  // Speed along each segment as a function of progress s in [0, 1]:
  // slow = checkpoint (dense), fast = transition (sparse).
  function speed(seg, s) {
    var bump = function (c, w) { return Math.exp(-Math.pow((s - c) / w, 2)); };
    var v;
    if (seg === 'trunk') v = 1 - 0.75 * bump(0.03, 0.12) - 0.45 * bump(1.0, 0.12);
    else if (seg === 'right') v = 1 - 0.55 * bump(0.0, 0.18) - 0.75 * bump(0.55, 0.16);
    else v = 1 - 0.45 * bump(0.0, 0.15) - 0.9 * bump(1.0, 0.22);
    return Math.max(0.05, v);
  }
  // Cell-type label along the tree (discrete view).
  function cellType(seg, s) {
    if (seg === 'trunk') return s < 0.45 ? 0 : 1;
    if (seg === 'left') return s < 0.55 ? 2 : 3;
    if (seg === 'right') return 4;
    if (seg === 'rl') return s < 0.5 ? 5 : 6;
    return s < 0.5 ? 7 : 8;
  }
  var TYPE_COLORS = ['#7b4fa0', '#b07cc6', '#3a7dbf', '#1f4e8c', '#4aa3a2',
    '#e0a030', '#c8641e', '#d6455a', '#9b1d3a'];
  // Spectral-like ramp for density, low to high.
  var RAMP = [[50, 136, 189], [102, 194, 165], [230, 245, 152], [254, 224, 139], [244, 109, 67], [213, 62, 79]];

  function bez(p, t) {
    var a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0], a * p[0][1] + b * p[1][1] + c * p[2][1]];
  }
  function bezTan(p, t) {
    var dx = 2 * (1 - t) * (p[1][0] - p[0][0]) + 2 * t * (p[2][0] - p[1][0]);
    var dy = 2 * (1 - t) * (p[1][1] - p[0][1]) + 2 * t * (p[2][1] - p[1][1]);
    var n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n];
  }
  function segLen(p) {
    var L = 0, q = bez(p, 0);
    for (var i = 1; i <= 40; i++) { var r = bez(p, i / 40); L += Math.hypot(r[0] - q[0], r[1] - q[1]); q = r; }
    return L;
  }
  Object.keys(SEG).forEach(function (k) { SEG[k].len = segLen(SEG[k].p); });

  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pick(seg) {
    var g = SEG[seg]; if (!g.next) return null;
    return Math.random() < g.w[0] ? g.next[0] : g.next[1];
  }
  function ramp(t) {
    t = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
    var i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i, a = RAMP[i], b = RAMP[i + 1];
    return 'rgb(' + Math.round(a[0] + f * (b[0] - a[0])) + ',' + Math.round(a[1] + f * (b[1] - a[1])) + ',' + Math.round(a[2] + f * (b[2] - a[2])) + ')';
  }
  function hexMix(hex, rgbStr, f) {
    var h = parseInt(hex.slice(1), 16), a = [h >> 16, (h >> 8) & 255, h & 255];
    var b = rgbStr.match(/\d+/g).map(Number);
    return 'rgb(' + Math.round(a[0] + f * (b[0] - a[0])) + ',' + Math.round(a[1] + f * (b[1] - a[1])) + ',' + Math.round(a[2] + f * (b[2] - a[2])) + ')';
  }
  function cssVar(el, name, fallback) {
    var v = getComputedStyle(el).getPropertyValue(name).trim();
    return v || fallback;
  }

  function Flow(canvas, opts) {
    opts = opts || {};
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.manual = !!opts.manual; this.lastP = null;
    this.n = parseInt(canvas.getAttribute('data-cells') || '420', 10);
    this.mode = canvas.getAttribute('data-mode') || 'cycle';
    this.labels = (canvas.getAttribute('data-labels') || 'on') !== 'off';
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cells = [];
    for (var i = 0; i < this.n; i++) this.cells.push(this.spawn(true));
    // Settle the population so the first frame already shows the steady-state density.
    for (var k = 0; k < 900; k++) this.step(1 / 30);
    this.t0 = performance.now(); this.last = this.t0; this.visible = true; this.raf = null;
    this.resize();
    var self = this;
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); self.draw(); }).observe(canvas);
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        self.visible = es[0].isIntersecting;
        if (self.visible && !self.reduced && !self.manual) self.loop(); }, { threshold: 0.05 }).observe(canvas);
    }
    if (this.reduced) { this.phase = this.mode === 'types' ? 0 : 1; this.draw(); }
    else if (this.manual) { this.phase = 0; this.draw(); }
    else this.loop();
  }
  // Public scroll API: p in [0, 1]. Scrolling moves the cells (by how far the reader scrolled)
  // and turns the coloring from cell type (p < 0.5) to density (p > 0.72).
  Flow.prototype.setProgress = function (p) {
    p = Math.min(1, Math.max(0, p));
    var dp = this.lastP == null ? 0 : p - this.lastP; this.lastP = p;
    var dt = Math.min(0.25, Math.abs(dp) * 40);
    if (dt > 0) this.step(dt);
    var t = Math.min(1, Math.max(0, (p - 0.5) / 0.22));
    this.phase = t * t * (3 - 2 * t);
    this.draw();
  };
  Flow.prototype.setManual = function () {
    this.manual = true;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };
  Flow.prototype.spawn = function (anywhere) {
    var seg = 'trunk', s = 0;
    if (anywhere) { // random place on a random route
      var r = Math.random();
      seg = r < 0.3 ? 'trunk' : r < 0.55 ? 'left' : r < 0.7 ? 'right' : r < 0.85 ? 'rl' : 'rr';
      s = Math.random();
    }
    return { seg: seg, s: s, off: gauss() * 0.33, jit: Math.random() * 6.283, age: anywhere ? 1 : 0, life: 1 };
  };
  Flow.prototype.step = function (dt) {
    var base = 0.10; // unit length per second at full speed
    for (var i = 0; i < this.cells.length; i++) {
      var c = this.cells[i];
      c.age += dt;
      if (c.dying) { c.life -= dt * 0.8; if (c.life <= 0) this.cells[i] = this.spawn(false); continue; }
      c.s += dt * base * speed(c.seg, c.s) / SEG[c.seg].len;
      if (c.s >= 1) {
        var nx = pick(c.seg);
        if (nx) { c.seg = nx; c.s = 0; }
        else { c.s = 1; c.dying = true; }
      }
    }
  };
  Flow.prototype.pos = function (c, W, H, tube) {
    var g = SEG[c.seg].p, q = bez(g, Math.min(1, c.s)), tg = bezTan(g, Math.min(1, c.s));
    var wob = 0.10 * Math.sin(c.jit + c.age * 0.7);
    var o = (c.off + wob) * tube;
    return [(q[0] - tg[1] * o) * W, (q[1] + tg[0] * o) * H];
  };
  Flow.prototype.resize = function () {
    var r = this.c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.c.width = Math.round(this.W * d); this.c.height = Math.round(this.H * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  Flow.prototype.loop = function () {
    if (this.raf) return;
    var self = this;
    var f = function (now) {
      self.raf = null;
      if (!self.visible || self.manual) return;
      var dt = Math.min(0.05, (now - self.last) / 1000); self.last = now;
      self.step(dt);
      // 14 s cycle: types (5 s), blend (2 s), density (5 s), blend back (2 s).
      if (self.mode === 'cycle') {
        var t = ((now - self.t0) / 1000) % 14;
        self.phase = t < 5 ? 0 : t < 7 ? (t - 5) / 2 : t < 12 ? 1 : 1 - (t - 12) / 2;
        self.phase = self.phase * self.phase * (3 - 2 * self.phase);
      } else self.phase = self.mode === 'density' ? 1 : 0;
      self.draw();
      self.raf = requestAnimationFrame(f);
    };
    this.last = performance.now();
    this.raf = requestAnimationFrame(f);
  };
  Flow.prototype.draw = function () {
    var ctx = this.ctx, W = this.W, H = this.H, S = Math.min(W, H / 1.0);
    var tube = 0.055;
    var tubeCol = cssVar(this.c, '--anim-tube', '#ededed');
    var stroke = cssVar(this.c, '--anim-stroke', 'rgba(40,40,40,0.55)');
    var fg = cssVar(this.c, '--anim-fg', '#444');
    ctx.clearRect(0, 0, W, H);
    // Tree background.
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = tubeCol;
    ctx.lineWidth = tube * 2.6 * Math.min(W, H) * 1.05;
    Object.keys(SEG).forEach(function (k) {
      var p = SEG[k].p; ctx.beginPath(); ctx.moveTo(p[0][0] * W, p[0][1] * H);
      ctx.quadraticCurveTo(p[1][0] * W, p[1][1] * H, p[2][0] * W, p[2][1] * H); ctx.stroke();
    });
    // Positions and a coarse density estimate on a grid.
    var tubePx = tube * Math.min(W, H) / Math.min(W, H); // offsets are in unit coords
    var pts = new Array(this.cells.length);
    var G = 24, grid = new Float32Array(G * G);
    for (var i = 0; i < this.cells.length; i++) {
      var p = this.pos(this.cells[i], W, H, tubePx); pts[i] = p;
      var gx = Math.min(G - 1, Math.max(0, Math.floor(p[0] / W * G))), gy = Math.min(G - 1, Math.max(0, Math.floor(p[1] / H * G)));
      grid[gy * G + gx] += 1;
    }
    // Blur the grid (two box passes) for a smooth density.
    var tmp = new Float32Array(G * G);
    for (var pass = 0; pass < 2; pass++) {
      for (var y = 0; y < G; y++) for (var x = 0; x < G; x++) {
        var sm = 0, cnt = 0;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= G || yy >= G) continue; sm += grid[yy * G + xx]; cnt++;
        }
        tmp[y * G + x] = sm / cnt;
      }
      grid.set(tmp);
    }
    var mx = 0; for (var j = 0; j < grid.length; j++) mx = Math.max(mx, grid[j]);
    var r = Math.max(1.8, Math.min(W, H) * 0.0085);
    ctx.lineWidth = Math.max(0.6, r * 0.28);
    for (var k = 0; k < this.cells.length; k++) {
      var c = this.cells[k], q = pts[k];
      var gx2 = Math.min(G - 1, Math.max(0, Math.floor(q[0] / W * G))), gy2 = Math.min(G - 1, Math.max(0, Math.floor(q[1] / H * G)));
      var dens = Math.pow(grid[gy2 * G + gx2] / (mx || 1), 0.7);
      var col = hexMix(TYPE_COLORS[cellType(c.seg, c.s)], ramp(dens), this.phase);
      var a = Math.min(1, c.age * 2) * (c.dying ? Math.max(0, c.life) : 1);
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832);
      ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = stroke; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (this.labels) {
      var fs = Math.max(11, Math.min(W, H) * 0.034);
      ctx.font = '500 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
      ctx.fillStyle = fg; ctx.textBaseline = 'top';
      ctx.globalAlpha = 1 - this.phase; ctx.fillText('colored by cell type', fs * 0.6, fs * 0.6);
      ctx.globalAlpha = this.phase; ctx.fillText('colored by cell-state density', fs * 0.6, fs * 0.6);
      ctx.globalAlpha = 0.8; ctx.textBaseline = 'alphabetic';
      // Keep the stem-cell label clear of the title and legend in narrow canvases: if the title
      // reaches the label, move the label below the legend.
      var titleW = Math.max(ctx.measureText('colored by cell-state density').width, ctx.measureText('colored by cell type').width);
      var sx = 0.585 * W, sy = 0.07 * H + fs * 0.4;
      if (fs * 0.6 + titleW + fs * 2.5 > sx) sy = Math.max(sy, fs * 4.6);
      ctx.fillText('stem cell', sx, sy);
      ctx.textAlign = 'center';
      ctx.fillText('differentiated', 0.55 * W, 0.995 * H);
      ctx.textAlign = 'left';
      // Density legend, only in the density view.
      ctx.globalAlpha = this.phase;
      var lx = fs * 0.6, ly = fs * 2.2, lw = fs * 5, lh = fs * 0.45;
      for (var b = 0; b < 30; b++) { ctx.fillStyle = ramp(b / 29); ctx.fillRect(lx + b * lw / 30, ly, lw / 30 + 0.5, lh); }
      ctx.fillStyle = fg; ctx.font = (fs * 0.75) + 'px system-ui, -apple-system, Helvetica, Arial, sans-serif';
      ctx.textBaseline = 'top'; ctx.fillText('low', lx, ly + lh * 1.5); ctx.textAlign = 'right'; ctx.fillText('high', lx + lw, ly + lh * 1.5);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
    }
  };

  function init() {
    var els = document.querySelectorAll('canvas[data-anim="cell-state-flow"]');
    for (var i = 0; i < els.length; i++) if (!els[i]._flow) els[i]._flow = new Flow(els[i]);
  }
  // mount(el, {manual: true}): manual mode never runs its own clock; drive it with setProgress(p).
  // Mounting an auto-started canvas with {manual: true} stops its clock.
  window.CellStateFlow = { mount: function (el, opts) {
    if (el._flow) { if (opts && opts.manual) el._flow.setManual(); return el._flow; }
    return (el._flow = new Flow(el, opts));
  } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
