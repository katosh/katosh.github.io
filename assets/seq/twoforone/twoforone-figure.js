/*
 * twoforone-figure.js: shows step1..step6 of the CUT&Tag2for1 build according to the figure's
 * position, from when its top reaches 85% of the viewport height to when its bottom reaches 20%.
 * Each step's text comes from the image's data-step attribute. No dependencies, no inline code.
 */
(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function Fig(root) {
    var self = this;
    this.root = root; this.card = root.querySelector('.tfo-card');
    this.imgs = Array.prototype.slice.call(root.querySelectorAll('.tfo-card img'));
    this.label = root.querySelector('.tfo-step'); this.cur = -1; this.ticking = false;
    this.imgs.forEach(function (im) { im.loading = 'eager'; });   // all six are needed once in view
    root.classList.add('tfo-live');
    window.addEventListener('scroll', function () {
      if (self.ticking) return; self.ticking = true;
      requestAnimationFrame(function () { self.ticking = false; self.update(); });
    }, { passive: true });
    window.addEventListener('resize', function () { self.update(); }, { passive: true });
    this.update();
  }
  Fig.prototype.update = function () {
    var r = this.card.getBoundingClientRect(), vh = window.innerHeight, n = this.imgs.length;
    var start = vh * 0.85, end = vh * 0.20 - r.height;
    var p = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end)));
    var i = Math.min(n - 1, Math.floor(p * n));
    if (i === this.cur) return;
    this.cur = i;
    for (var k = 0; k < n; k++) this.imgs[k].classList.toggle('is-active', k === i);
    if (this.label) this.label.innerHTML = '<b>' + (i + 1) + ' of ' + n + '</b> ' + this.imgs[i].getAttribute('data-step');
  };
  function init() {
    var els = document.querySelectorAll('[data-tfo]');
    for (var i = 0; i < els.length; i++) if (!els[i]._tfo) els[i]._tfo = new Fig(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
