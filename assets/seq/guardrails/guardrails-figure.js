/*
 * guardrails-figure.js: scrubs frames/0001..0100.webp by the figure's position in the viewport.
 *   0001-0030 cells fluctuate, 0031-0060 regulation holds them, 0061-0100 cells divide and are lost.
 * Progress runs from 0 when the card's top reaches 85% of the viewport height to 1 when its
 * bottom reaches 20%. No dependencies, no inline code.
 */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var N = 100, STAGE_END = [30, 60, 100];
  function pad(n) { return ('000' + n).slice(-4); }
  function Fig(root) {
    var self = this;
    this.root = root; this.base = root.getAttribute('data-base') || 'assets/seq/guardrails/';
    this.card = root.querySelector('.grf-card'); this.canvas = root.querySelector('.grf-canvas');
    this.stages = Array.prototype.slice.call(root.querySelectorAll('.grf-stages li'));
    this.imgs = []; this.cur = -1; this.stage = -1; this.ticking = false;
    root.classList.add('grf-live');
    var load = function () {
      if (self.imgs.length) return;
      for (var i = 1; i <= N; i++) {
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { self.cur = -1; self.update(); };
        im.src = self.base + 'frames/' + pad(i) + '.webp'; self.imgs.push(im);
      }
    };
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) load(); }, { rootMargin: '600px 0px' }).observe(root);
    } else load();
    window.addEventListener('scroll', function () {
      if (self.ticking) return; self.ticking = true;
      requestAnimationFrame(function () { self.ticking = false; self.update(); });
    }, { passive: true });
    window.addEventListener('resize', function () { self.cur = -1; self.update(); }, { passive: true });
    this.update();
  }
  Fig.prototype.update = function () {
    var r = this.card.getBoundingClientRect(), vh = window.innerHeight;
    var start = vh * 0.85, end = vh * 0.20 - r.height;      // card top positions at p = 0 and p = 1
    var p = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end)));
    var i = Math.round(p * (N - 1)), f = i + 1;
    var s = f <= STAGE_END[0] ? 0 : f <= STAGE_END[1] ? 1 : 2;
    if (s !== this.stage) {
      this.stage = s;
      for (var k = 0; k < this.stages.length; k++) this.stages[k].classList.toggle('is-active', k === s);
    }
    if (i !== this.cur) {
      var im = null;
      for (var d = 0; d < N && !im; d++) {
        var a = this.imgs[i - d], b = this.imgs[i + d];
        if (a && a.complete && a.naturalWidth) im = a; else if (b && b.complete && b.naturalWidth) im = b;
      }
      if (im) {
        if (this.canvas.width !== im.naturalWidth) { this.canvas.width = im.naturalWidth; this.canvas.height = im.naturalHeight; }
        this.canvas.getContext('2d').drawImage(im, 0, 0); this.cur = i;
      }
    }
  };
  function init() {
    var els = document.querySelectorAll('[data-grf]');
    for (var i = 0; i < els.length; i++) if (!els[i]._grf) els[i]._grf = new Fig(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
