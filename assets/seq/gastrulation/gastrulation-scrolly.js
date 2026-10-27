/*
 * gastrulation-scrolly.js: scroll position = developmental time (E6.5 to E8.5).
 * Frames: <data-base>frames/0001.webp .. NNNN.webp (data-frames), evenly spaced in time from
 * data-e-start to data-e-end. Steps carry data-e-from / data-e-to and are activated by the
 * current embryonic day, so the text follows the time shown. No dependencies, no inline code.
 */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function pad(n) { return ('000' + n).slice(-4); }
  function clamp(v) { return Math.min(1, Math.max(0, v)); }

  function Tsd(root) {
    var self = this;
    this.root = root;
    this.base = root.getAttribute('data-base') || 'assets/seq/gastrulation/';
    this.n = parseInt(root.getAttribute('data-frames') || '41', 10);
    this.e0 = parseFloat(root.getAttribute('data-e-start') || '6.5');
    this.e1 = parseFloat(root.getAttribute('data-e-end') || '8.5');
    this.canvas = root.querySelector('.tsd-canvas');
    this.readout = root.querySelector('.tsd-readout');
    this.steps = Array.prototype.slice.call(root.querySelectorAll('.tsd-step'));
    this.imgs = []; this.cur = -1; this.active = -1; this.ticking = false;
    this.textBox = document.createElement('div');
    this.textBox.className = 'tsd-active-text'; this.textBox.setAttribute('aria-hidden', 'true');
    var stage = root.querySelector('.tsd-stage'); if (stage) stage.appendChild(this.textBox);
    root.classList.add('tsd-live');
    var load = function () {
      if (self.imgs.length) return;
      for (var i = 1; i <= self.n; i++) {
        var im = new Image(); im.decoding = 'async';
        im.onload = function () { self.cur = -1; self.update(); };
        im.src = self.base + 'frames/' + pad(i) + '.webp'; self.imgs.push(im);
      }
    };
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { if (es[0].isIntersecting) load(); }, { rootMargin: '800px 0px' }).observe(root);
    } else load();
    window.addEventListener('scroll', function () {
      if (self.ticking) return; self.ticking = true;
      requestAnimationFrame(function () { self.ticking = false; self.update(); });
    }, { passive: true });
    window.addEventListener('resize', function () { self.cur = -1; self.update(); }, { passive: true });
    this.update();
  }
  Tsd.prototype.update = function () {
    var r = this.root.getBoundingClientRect(), vh = window.innerHeight;
    var p = clamp(-r.top / Math.max(1, r.height - vh));
    var i = Math.round(p * (this.n - 1));
    var e = this.e0 + (this.e1 - this.e0) * i / (this.n - 1);
    var a = 0;
    for (var k = 0; k < this.steps.length; k++) {
      var from = parseFloat(this.steps[k].getAttribute('data-e-from'));
      if (e >= from - 1e-6) a = k;
    }
    if (a !== this.active) {
      this.active = a;
      for (var j = 0; j < this.steps.length; j++) this.steps[j].classList.toggle('is-active', j === a);
      if (this.steps[a]) this.textBox.innerHTML = this.steps[a].innerHTML;
    }
    if (i !== this.cur && this.canvas) {
      var im = null;
      for (var d = 0; d < this.n && !im; d++) {
        var x = this.imgs[i - d], y = this.imgs[i + d];
        if (x && x.complete && x.naturalWidth) im = x; else if (y && y.complete && y.naturalWidth) im = y;
      }
      if (im) {
        if (this.canvas.width !== im.naturalWidth) { this.canvas.width = im.naturalWidth; this.canvas.height = im.naturalHeight; }
        this.canvas.getContext('2d').drawImage(im, 0, 0); this.cur = i;
        // The readout names the frame actually drawn (frames can arrive out of order).
        var drawn = this.imgs.indexOf(im);
        if (this.readout) {
          this.readout.textContent = 'E' + (this.e0 + (this.e1 - this.e0) * drawn / (this.n - 1)).toFixed(2);
          this.readout.classList.add('is-ready');
        }
      }
    }
  };
  function init() {
    var els = document.querySelectorAll('[data-tsd-scrolly]');
    for (var i = 0; i < els.length; i++) if (!els[i]._tsd) els[i]._tsd = new Tsd(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
