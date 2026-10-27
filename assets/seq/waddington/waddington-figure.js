/*
 * waddington-figure.js: scrubs density/0001..0048.webp and landscape/0001..0048.webp together
 * (one full turn) by the figure's position: from when its top reaches 90% of the viewport height
 * to when its bottom reaches 15%. No dependencies, no inline code.
 */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var N = 48, SEQS = ['density', 'landscape'];
  function pad(n) { return ('000' + n).slice(-4); }
  function Fig(root) {
    var self = this;
    this.root = root; this.base = root.getAttribute('data-base') || 'assets/seq/waddington/';
    this.pair = root.querySelector('.wdf-pair');
    this.canvases = {}; this.imgs = {}; this.cur = {};
    SEQS.forEach(function (s) { self.canvases[s] = root.querySelector('canvas[data-seq="' + s + '"]'); self.imgs[s] = []; self.cur[s] = -1; });
    this.loaded = false; this.ticking = false;
    root.classList.add('wdf-live');
    var load = function () {
      if (self.loaded) return; self.loaded = true;
      SEQS.forEach(function (s) {
        for (var i = 1; i <= N; i++) {
          var im = new Image(); im.decoding = 'async';
          im.onload = function () { self.cur[s] = -1; self.update(); };
          im.src = self.base + s + '/' + pad(i) + '.webp'; self.imgs[s].push(im);
        }
      });
    };
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) load(); }, { rootMargin: '600px 0px' }).observe(root);
    } else load();
    window.addEventListener('scroll', function () {
      if (self.ticking) return; self.ticking = true;
      requestAnimationFrame(function () { self.ticking = false; self.update(); });
    }, { passive: true });
    window.addEventListener('resize', function () { SEQS.forEach(function (s) { self.cur[s] = -1; }); self.update(); }, { passive: true });
    this.update();
  }
  Fig.prototype.update = function () {
    var r = this.pair.getBoundingClientRect(), vh = window.innerHeight;
    var start = vh * 0.9, end = vh * 0.15 - r.height;
    var p = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end)));
    var i = Math.round(p * (N - 1)), self = this;
    SEQS.forEach(function (s) {
      if (i === self.cur[s] || !self.canvases[s]) return;
      var arr = self.imgs[s], im = null;
      for (var d = 0; d < N && !im; d++) {
        var a = arr[i - d], b = arr[i + d];
        if (a && a.complete && a.naturalWidth) im = a; else if (b && b.complete && b.naturalWidth) im = b;
      }
      if (!im) return;
      var c = self.canvases[s];
      if (c.width !== im.naturalWidth) { c.width = im.naturalWidth; c.height = im.naturalHeight; }
      c.getContext('2d').drawImage(im, 0, 0); self.cur[s] = i;
    });
  };
  function init() {
    var els = document.querySelectorAll('[data-wdf]');
    for (var i = 0; i < els.length; i++) if (!els[i]._wdf) els[i]._wdf = new Fig(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
