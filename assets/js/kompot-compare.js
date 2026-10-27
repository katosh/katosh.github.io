/*
 * kompot-compare.js: comparing two conditions along cell states without clusters.
 *
 * Recreates the Kompot build sequence (Janelia 2026, slides 41 to 45; AI and Digital
 * Biology 2025, slides 9 to 13) as a four-step loop:
 *   1. noisy single-cell measurements for two conditions, with drop-outs,
 *   2. a smooth expression function along cell states for each condition,
 *   3. its uncertainty,
 *   4. the fold change at every cell state, highlighted where it exceeds the uncertainty.
 * Each loop draws a new random example.
 *
 * Usage:
 *   <canvas data-anim="kompot-compare" aria-label="..." style="width:100%;aspect-ratio:16/9"></canvas>
 *   <script src="assets/js/kompot-compare.js" defer></script>
 * Options: data-step-seconds="3.2", data-labels="on|off", data-seed="3" (repeatable examples).
 * Scroll-driven use: var m = KompotCompare.mount(canvas, {manual: true}); m.setProgress(p);
 *   with p in [0, 1] (steps start at p = 0, 0.22, 0.43, 0.65; final step held from 0.91).
 * Theming (CSS custom properties): --anim-fg, --anim-axis, --anim-a, --anim-b, --anim-hit.
 * Honors prefers-reduced-motion (shows the final step, no motion) and pauses off screen.
 * No dependencies.
 */
(function () {
  'use strict';

  var CAPTIONS = [
    'Noisy measurements in two conditions',
    'A smooth expression function along cell states',
    'With quantified uncertainty',
    'Fold change at every cell state'
  ];

  function cssVar(el, name, fallback) { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; }
  // Random source for the examples: Math.random, or a seeded generator (mulberry32) when the
  // canvas has data-seed, so the same page always shows the same examples.
  var rand = Math.random;
  function seeded(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gauss() { var u = 1 - rand(), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function ease(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }

  // A random smooth function on [0, 1]: a sum of a few Gaussian bumps plus a slope.
  function randomFn() {
    var k = [], n = 3 + Math.floor(rand() * 2);
    for (var i = 0; i < n; i++) k.push([rand(), 0.08 + rand() * 0.14, (rand() - 0.35) * 0.9]);
    var slope = (rand() - 0.5) * 0.5;
    return function (x) {
      var y = 0.45 + slope * (x - 0.5);
      for (var j = 0; j < k.length; j++) y += k[j][2] * Math.exp(-Math.pow((x - k[j][0]) / k[j][1], 2));
      return y;
    };
  }
  // Condition B differs from A in one or two localized windows only.
  function makeExample() {
    var fa = randomFn(), shifts = [], m = 1 + Math.floor(rand() * 2);
    for (var i = 0; i < m; i++) shifts.push([0.15 + rand() * 0.7, 0.06 + rand() * 0.07, (rand() < 0.5 ? -1 : 1) * (0.32 + rand() * 0.16)]);
    var fb = function (x) {
      var y = fa(x);
      for (var j = 0; j < shifts.length; j++) y += shifts[j][2] * Math.exp(-Math.pow((x - shifts[j][0]) / shifts[j][1], 2));
      return y;
    };
    function sample(f) {
      var pts = [];
      for (var i = 0; i < 46; i++) {
        var x = rand(), drop = rand() < 0.18;
        pts.push([x, drop ? 0 : f(x) + gauss() * 0.07, drop]);
      }
      return pts;
    }
    return { fa: fa, fb: fb, a: sample(fa), b: sample(fb) };
  }
  // Smooth fit from the samples: Nadaraya-Watson with a Gaussian kernel, drop-outs down-weighted.
  // Uncertainty grows where few cells are nearby.
  function fit(pts, x) {
    var h = 0.07, sw = 0, sy = 0;
    for (var i = 0; i < pts.length; i++) {
      var w = Math.exp(-Math.pow((x - pts[i][0]) / h, 2) / 2) * (pts[i][2] ? 0.15 : 1);
      sw += w; sy += w * pts[i][1];
    }
    return [sw > 1e-6 ? sy / sw : 0.45, 0.02 + 0.075 / Math.sqrt(1 + sw)];
  }

  function Compare(canvas, opts) {
    opts = opts || {};
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.manual = !!opts.manual;
    var seed = opts.seed != null ? opts.seed : canvas.getAttribute('data-seed');
    this.rand = seed != null && seed !== '' ? seeded(parseInt(seed, 10) || 1) : Math.random;
    this.stepSec = parseFloat(canvas.getAttribute('data-step-seconds') || '3.2');
    this.labels = (canvas.getAttribute('data-labels') || 'on') !== 'off';
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ex = this.example();
    this.t0 = performance.now(); this.visible = true; this.raf = null;
    this.resize();
    var self = this;
    if (window.ResizeObserver) new ResizeObserver(function () { self.resize(); self.draw(self.reduced ? 4.2 : self.lastT || 0); }).observe(canvas);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) {
      self.visible = es[0].isIntersecting; if (self.visible && !self.reduced && !self.manual) self.loop(); }, { threshold: 0.05 }).observe(canvas);
    if (this.reduced) this.draw(4.2, 1);
    else if (this.manual) this.draw(0, 1);
    else this.loop();
  }
  // Draw a new example, re-drawing until step 4 has a clear changed region: some fold-change bars
  // exceed the uncertainty (between 8% and 45% of the cell states), and the strongest clearly so.
  Compare.prototype.example = function () {
    var best = null;
    rand = this.rand;
    for (var tries = 0; tries < 60; tries++) {
      var ex = this.prepare(makeExample()), hits = 0, zmax = 0;
      for (var i = 2; i < ex.grid.length; i += 4) { if (ex.grid[i].z > 2) hits++; zmax = Math.max(zmax, ex.grid[i].z); }
      var frac = hits / Math.ceil((ex.grid.length - 2) / 4);
      ex.score = (frac >= 0.08 && frac <= 0.45 && zmax > 3.5) ? 1 : 0;
      if (ex.score) { best = ex; break; }
      if (!best || zmax > best.zmax) { ex.zmax = zmax; best = ex; }
    }
    rand = Math.random;
    return best;
  };
  // Public scroll API: p in [0, 1] runs through the four steps and holds on the last.
  Compare.prototype.setProgress = function (p) {
    p = Math.min(1, Math.max(0, p));
    this.lastT = Math.min(4.2, p * 4.6);
    this.draw(this.lastT, 1);
  };
  Compare.prototype.setManual = function () {
    this.manual = true;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };
  Compare.prototype.prepare = function (ex) {
    var N = 120; ex.grid = [];
    for (var i = 0; i <= N; i++) {
      var x = i / N, a = fit(ex.a, x), b = fit(ex.b, x);
      var d = b[0] - a[0], s = Math.sqrt(a[1] * a[1] + b[1] * b[1]);
      ex.grid.push({ x: x, ma: a[0], sa: a[1], mb: b[0], sb: b[1], d: d, z: Math.abs(d) / s });
    }
    var lo = Infinity, hi = -Infinity;
    ex.a.concat(ex.b).forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    ex.grid.forEach(function (g) { lo = Math.min(lo, g.ma - 2 * g.sa, g.mb - 2 * g.sb); hi = Math.max(hi, g.ma + 2 * g.sa, g.mb + 2 * g.sb); });
    ex.lo = Math.min(0, lo) - 0.05; ex.hi = hi + 0.05;
    return ex;
  };
  Compare.prototype.resize = function () {
    var r = this.c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.c.width = Math.round(this.W * d); this.c.height = Math.round(this.H * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  Compare.prototype.loop = function () {
    if (this.raf) return;
    var self = this;
    var f = function (now) {
      self.raf = null; if (!self.visible || self.manual) return;
      var cycle = self.stepSec * 4 + 2.4; // four steps, a hold on the last, then a fade
      var t = (now - self.t0) / 1000;
      if (t > cycle) { self.t0 = now; t = 0; self.ex = self.example(); }
      self.lastT = t / self.stepSec;
      self.draw(self.lastT, t > cycle - 0.6 ? (cycle - t) / 0.6 : Math.min(1, t / 0.4));
      self.raf = requestAnimationFrame(f);
    };
    this.raf = requestAnimationFrame(f);
  };
  // s: progress in step units (0..4+); fade: global opacity for the loop transition.
  Compare.prototype.draw = function (s, fade) {
    var ctx = this.ctx, W = this.W, H = this.H, ex = this.ex;
    var fg = cssVar(this.c, '--anim-fg', '#444'), axis = cssVar(this.c, '--anim-axis', 'rgba(110,110,110,0.7)');
    var ca = cssVar(this.c, '--anim-a', '#2f6db5'), cb = cssVar(this.c, '--anim-b', '#d9622b'), hit = cssVar(this.c, '--anim-hit', '#2e9e5b');
    var fs = Math.max(11, Math.min(W * 0.028, H * 0.05));
    var L = fs * 2.6, R = W - fs * 1.2, T = fs * (this.labels ? 3.2 : 1), B = H - fs * (this.labels ? 2.6 : 1);
    var X = function (x) { return L + x * (R - L); };
    var Y = function (y) { return B - (y - ex.lo) / (ex.hi - ex.lo) * (B - T); };
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = fade == null ? 1 : Math.max(0, fade);
    // Axes.
    ctx.strokeStyle = axis; ctx.lineWidth = 1.2; ctx.beginPath();
    ctx.moveTo(L, T - fs * 0.4); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
    var font = function (w, k) { return w + ' ' + (fs * k) + 'px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'; };
    var A = ctx.globalAlpha;
    if (this.labels) {
      ctx.fillStyle = fg; ctx.font = font(400, 0.8); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('cell state', L + (R - L) * 0.3, B + fs * 0.5);
      ctx.save(); ctx.translate(L - fs * 0.9, (T + B) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'bottom';
      ctx.fillText('expression', 0, 0); ctx.restore();
      // Legend.
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = font(400, 0.78);
      var lx = R - fs * 10.4, ly = B + fs * 1.0;
      ctx.fillStyle = ca; ctx.beginPath(); ctx.arc(lx, ly, fs * 0.28, 0, 6.283); ctx.fill();
      ctx.fillStyle = fg; ctx.fillText('condition A', lx + fs * 0.6, ly);
      ctx.fillStyle = cb; ctx.fillRect(lx + fs * 5.4 - fs * 0.26, ly - fs * 0.26, fs * 0.52, fs * 0.52);
      ctx.fillStyle = fg; ctx.fillText('condition B', lx + fs * 6.0, ly);
      // Step caption with a cross-fade.
      var step = Math.min(3, Math.floor(s)), into = s - Math.floor(s);
      ctx.font = font(600, 0.95); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = A * (step < 3 && into > 0.85 ? (1 - into) / 0.15 : 1);
      ctx.fillText((step + 1) + '  ' + CAPTIONS[step], L, T - fs * 1.9);
      ctx.globalAlpha = A;
    }
    var g = ex.grid;
    // Step 3: uncertainty bands.
    var pBand = ease(s - 2);
    if (pBand > 0) {
      [[ca, 'ma', 'sa'], [cb, 'mb', 'sb']].forEach(function (k) {
        ctx.beginPath();
        for (var i = 0; i < g.length; i++) ctx.lineTo(X(g[i].x), Y(g[i][k[1]] + 1.96 * g[i][k[2]]));
        for (var j = g.length - 1; j >= 0; j--) ctx.lineTo(X(g[j].x), Y(g[j][k[1]] - 1.96 * g[j][k[2]]));
        ctx.closePath(); ctx.fillStyle = k[0]; ctx.globalAlpha = A * 0.16 * pBand; ctx.fill();
      });
      ctx.globalAlpha = A;
    }
    // Step 4: fold-change bars, highlighted where the difference exceeds its uncertainty.
    var pFc = ease(s - 3);
    if (pFc > 0) {
      for (var i2 = 2; i2 < g.length; i2 += 4) {
        var q = g[i2], strong = q.z > 2;
        ctx.strokeStyle = strong ? hit : axis; ctx.lineWidth = strong ? 2.4 : 1.1;
        ctx.globalAlpha = A * pFc * (strong ? 1 : 0.55);
        ctx.beginPath(); ctx.moveTo(X(q.x), Y(q.ma)); ctx.lineTo(X(q.x), Y(q.ma + (q.mb - q.ma) * pFc)); ctx.stroke();
      }
      ctx.globalAlpha = A;
    }
    // Step 2: smooth functions, drawn left to right.
    var pFit = ease((s - 1) * 1.2);
    if (pFit > 0) {
      [[ca, 'ma'], [cb, 'mb']].forEach(function (k) {
        ctx.beginPath(); ctx.strokeStyle = k[0]; ctx.lineWidth = Math.max(2, fs * 0.17);
        var n = Math.max(2, Math.round(g.length * pFit));
        for (var i = 0; i < n; i++) { var px = X(g[i].x), py = Y(g[i][k[1]]); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
      });
    }
    // Step 1: measurements (they recede once the functions are drawn).
    var pPts = ease(s * 1.5), dim = 1 - 0.55 * ease(s - 1);
    var r = Math.max(2.2, fs * 0.26);
    ctx.lineWidth = 1;
    [[ex.a, ca, 0], [ex.b, cb, 1]].forEach(function (k) {
      for (var i = 0; i < k[0].length; i++) {
        var p = k[0][i], appear = ease(pPts * 1.4 - i / k[0].length * 0.4);
        if (appear <= 0) continue;
        ctx.globalAlpha = A * appear * dim * (p[2] ? 0.55 : 1);
        var px = X(p[0]), py = Y(p[1]);
        ctx.fillStyle = k[1]; ctx.strokeStyle = k[1];
        if (k[2]) { if (p[2]) ctx.strokeRect(px - r, py - r, 2 * r, 2 * r); else ctx.fillRect(px - r, py - r, 2 * r, 2 * r); }
        else { ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); if (p[2]) ctx.stroke(); else ctx.fill(); }
      }
    });
    ctx.globalAlpha = 1;
  };

  function init() {
    var els = document.querySelectorAll('canvas[data-anim="kompot-compare"]');
    for (var i = 0; i < els.length; i++) if (!els[i]._cmp) els[i]._cmp = new Compare(els[i]);
  }
  // mount(el, {manual: true, seed: 3}): manual mode never runs its own clock; drive it with
  // setProgress(p). Mounting an auto-started canvas with {manual: true} stops its clock.
  window.KompotCompare = { mount: function (el, opts) {
    if (el._cmp) { if (opts && opts.manual) el._cmp.setManual(); return el._cmp; }
    return (el._cmp = new Compare(el, opts));
  } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
