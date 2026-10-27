/*
 * gastrulation-scrolly.js: scroll position = developmental time (E6.5 to E8.5).
 * Frames: <data-base>frames/0001.webp .. NNNN.webp (data-frames), evenly spaced in time from
 * data-e-start to data-e-end. Steps carry data-e-from; each card's centre crossing the middle of the
 * screen is the moment its stage is shown (time is interpolated between cards), and a step is active
 * from its stage on, so the text, the frame and the readout follow one clock. No dependencies, no inline code.
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
    this.load = load; // also started from update() once the section is near, in case the observer is late
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
    var r = this.root.getBoundingClientRect(), vh = window.innerHeight, mid = vh * 0.62;
    if (!this.imgs.length && this.load && r.top < 2 * vh && r.bottom > -vh) this.load();
    // Time is anchored to the step cards: a card's centre crossing the activation line (62% down the
    // screen, so a card is active by the time it sits in the middle) is the
    // moment its stage (data-e-from) is shown, so the active card, the frame and the readout agree.
    // Before the first card the time holds at its stage; after the last it runs on to the end of the
    // section. Between anchors it is interpolated linearly.
    var pts = [];
    for (var q = 0; q < this.steps.length; q++) {
      var b = this.steps[q].getBoundingClientRect(), ef = parseFloat(this.steps[q].getAttribute('data-e-from'));
      if (!isNaN(ef) && b.height) pts.push([(b.top + b.bottom) / 2, ef]);
    }
    pts.push([Math.max(r.bottom - mid, pts.length ? pts[pts.length - 1][0] + 1 : r.bottom - mid), this.e1]);
    var eCont;
    if (pts.length < 2) {
      eCont = this.e0 + (this.e1 - this.e0) * clamp(-r.top / Math.max(1, r.height - vh));
    } else if (mid <= pts[0][0]) {
      eCont = pts[0][1];
    } else {
      eCont = pts[pts.length - 1][1];
      for (var z = 0; z < pts.length - 1; z++) {
        if (mid <= pts[z + 1][0]) {
          var t = (mid - pts[z][0]) / Math.max(1, pts[z + 1][0] - pts[z][0]);
          eCont = pts[z][1] + clamp(t) * (pts[z + 1][1] - pts[z][1]);
          break;
        }
      }
    }
    var i = Math.round((eCont - this.e0) / (this.e1 - this.e0) * (this.n - 1));
    i = Math.min(this.n - 1, Math.max(0, i));
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
