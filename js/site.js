// Small progressive enhancements. The site works without this file:
// navigation stays visible, and each scroll-driven figure is static, with its steps as a list.
(function () {
  "use strict";
  var root = document.documentElement;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode or blocked storage */ }
  }

  // Theme: follows the system until the visitor chooses; the choice is remembered.
  var themeBtn = document.querySelector(".theme-toggle");
  function currentTheme() {
    if (root.dataset.theme) return root.dataset.theme;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function labelTheme() {
    var next = currentTheme() === "dark" ? "light" : "dark";
    themeBtn.setAttribute("aria-label", "Switch to " + next + " theme");
    themeBtn.setAttribute("title", "Switch to " + next + " theme");
  }
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      store("theme", next);
      labelTheme();
    });
    labelTheme();
  }

  // Mobile navigation.
  var header = document.querySelector(".site-header");
  var navBtn = document.querySelector(".nav-toggle");
  if (header && navBtn) {
    navBtn.addEventListener("click", function () {
      var open = header.getAttribute("data-open") === "true";
      header.setAttribute("data-open", open ? "false" : "true");
      navBtn.setAttribute("aria-expanded", open ? "false" : "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && header.getAttribute("data-open") === "true") {
        header.setAttribute("data-open", "false");
        navBtn.setAttribute("aria-expanded", "false");
        navBtn.focus();
      }
    });
  }

  // Scroll-driven figures ("scrollytelling"): a pinned figure, with text steps scrolling past.
  //
  //   <div class="scrolly" data-scrolly>
  //     <figure class="scrolly-graphic"> <canvas data-scroll-anim="kompot-compare"> or <img class="scrolly-still"> </figure>
  //     <ol class="scrolly-steps"><li class="step" data-caption="..." data-frame="k" data-still="..."> ... </li></ol>
  //   </div>
  //
  // An image sequence is declared on the container with data-frames="path/{i}.webp", data-frame-count
  // and data-frame-pad (frames numbered from 1). Each step's data-frame is the frame at which its stage
  // is complete; between step centers the frame is interpolated, so the picture moves with the text.
  //
  // A canvas names one of the animation modules in assets/js/ (loaded before this file). The module
  // is mounted in manual mode, so it has no clock of its own, and is redrawn from scroll position:
  // the reader's scrolling, not a timer, moves the explanation forward. Without a canvas, the still of
  // the step nearest the middle of the screen is shown.
  // With prefers-reduced-motion, nothing is pinned or driven: the modules draw their own final
  // frame and the steps read as a list.
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Animation modules in assets/js/ that expose mount(el, {manual: true}) and setProgress(p), p in [0, 1].
  var MODULES = {
    "kompot-compare": function () { return window.KompotCompare; }
  };

  function mountDriven(canvas) {
    var get = MODULES[canvas.getAttribute("data-scroll-anim")];
    var lib = get && get();
    if (!lib || typeof lib.mount !== "function") return null;
    // Under reduced motion the module draws its own final frame; nothing is driven.
    var m = lib.mount(canvas, reduce ? {} : { manual: true });
    if (reduce || !m || typeof m.setProgress !== "function") return null;
    return m;
  }

  // Image sequence drawn on a canvas that replaces the poster once the first frame has loaded.
  function setupFrames(el, still) {
    var pattern = el.getAttribute("data-frames"), count = parseInt(el.getAttribute("data-frame-count") || "0", 10);
    if (!pattern || count < 2 || !still) return null;
    var pad = parseInt(el.getAttribute("data-frame-pad") || "4", 10);
    var frames = new Array(count), started = false, canvas = null, ctx = null, shown = -1, want = 1;
    function src(i) { var n = String(i); while (n.length < pad) n = "0" + n; return pattern.replace("{i}", n); }
    function draw(i) {
      var img = frames[i - 1];
      if (!canvas || !img || !img.complete || !img.naturalWidth) return false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      shown = i;
      return true;
    }
    var api = {
      count: count,
      load: function () {
        if (started) return;
        started = true;
        for (var i = 1; i <= count; i++) {
          (function (k) {
            var img = new Image();
            img.decoding = "async";
            img.onload = function () {
              if (!canvas && k === 1) {
                canvas = document.createElement("canvas");
                canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
                canvas.className = "scrolly-canvas";
                canvas.setAttribute("role", "img");
                canvas.setAttribute("aria-label", still.alt);
                ctx = canvas.getContext("2d");
                still.parentNode.insertBefore(canvas, still);
                still.hidden = true;
              }
              if (k === want) draw(k);
            };
            img.src = src(k);
            frames[k - 1] = img;
          })(i);
        }
      },
      show: function (f) {
        var i = Math.min(count, Math.max(1, Math.round(f)));
        want = i;
        if (i === shown) return;
        // Draw the nearest frame already loaded, so a fast scroll never shows a blank.
        for (var j = i; j >= 1; j--) if (draw(j)) return;
      }
    };
    return api;
  }

  Array.prototype.slice.call(document.querySelectorAll("[data-scrolly]")).forEach(function (el) {
    var canvas = el.querySelector("canvas[data-scroll-anim]");
    var driven = canvas ? mountDriven(canvas) : null;
    if (reduce) { el.classList.add("is-static"); return; }
    el.classList.add("is-live");

    var steps = Array.prototype.slice.call(el.querySelectorAll(".step"));
    var still = el.querySelector(".scrolly-still");
    var caption = el.querySelector(".scrolly-caption");
    var active = -1, ticking = false;
    var seq = setupFrames(el, still);

    function progress() {
      // 0 when the section top reaches the middle of the screen, 1 when its bottom does.
      var r = el.getBoundingClientRect(), mid = window.innerHeight / 2;
      return Math.min(1, Math.max(0, (mid - r.top) / Math.max(1, r.height)));
    }

    function setStep(k) {
      if (k === active) return;
      active = k;
      steps.forEach(function (s, i) { s.classList.toggle("is-active", i === k); });
      var s = steps[k];
      if (still && !seq && s.getAttribute("data-still")) {
        var src = s.getAttribute("data-still"), src2 = s.getAttribute("data-still-2x");
        if (still.getAttribute("src") !== src) {
          still.src = src;
          if (src2 && src2 !== src) still.srcset = src + " 1x, " + src2 + " 2x"; else still.removeAttribute("srcset");
        }
        if (s.getAttribute("data-alt")) still.alt = s.getAttribute("data-alt");
      }
      if (caption && s.getAttribute("data-caption")) caption.textContent = s.getAttribute("data-caption");
    }

    function update() {
      ticking = false;
      // Skip the work while the section is well off screen.
      var box = el.getBoundingClientRect();
      if (box.bottom < -window.innerHeight || box.top > 2 * window.innerHeight) return;
      var mid = window.innerHeight / 2, best = 0, bestDist = Infinity;
      steps.forEach(function (s, i) {
        var r = s.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      setStep(best);
      if (seq) seq.show(frameFor(mid));
      if (driven) driven.setProgress(progress());
    }
    // Frame for the current scroll position: anchored at each step's center, interpolated in between,
    // running from frame 1 at the section top to the last frame at the section bottom.
    function frameFor(mid) {
      var r = el.getBoundingClientRect();
      var pts = [[r.top, 1]];
      steps.forEach(function (s) {
        var b = s.getBoundingClientRect(), f = parseFloat(s.getAttribute("data-frame"));
        if (!isNaN(f)) pts.push([(b.top + b.bottom) / 2, f]);
      });
      pts.push([r.bottom, seq.count]);
      for (var i = 0; i < pts.length - 1; i++) {
        if (mid <= pts[i + 1][0]) {
          var t = (mid - pts[i][0]) / Math.max(1, pts[i + 1][0] - pts[i][0]);
          return pts[i][1] + Math.min(1, Math.max(0, t)) * (pts[i + 1][1] - pts[i][1]);
        }
      }
      return seq.count;
    }

    function onScroll() {
      if (seq) seq.load();
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
  });

  // Contact address: stored reversed in two data attributes and assembled here, so it is not in
  // the page source as text. Without JavaScript the link shows a spelled-out fallback.
  Array.prototype.slice.call(document.querySelectorAll("a.js-mail")).forEach(function (a) {
    function rev(t) { return (t || "").split("").reverse().join(""); }
    var addr = rev(a.getAttribute("data-u")) + "\u0040" + rev(a.getAttribute("data-d"));
    a.href = "mailto:" + addr;
    a.textContent = addr;
  });

  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());
})();
