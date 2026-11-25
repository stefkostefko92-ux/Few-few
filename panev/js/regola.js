/* „Regola tu“ — регулирането на планката кадър по кадър (site/templates/regola.mjs).
   Плъзгачът и влаченето по снимката избират кадъра; кадрите се теглят след страницата. Една-единствена
   анимация: когато фигурата влезе в изгледа, планката минава целия ход и се връща в покой (никога при
   prefers-reduced-motion и спира при първото докосване). */
(function () {
  'use strict';
  var MINUS = '−';
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function label(kind, v) {
    if (kind === 'reach') return v + ' mm';
    return v === 0 ? '0°' : (v > 0 ? '+' : MINUS) + Math.abs(v) + '°';
  }

  function setup(fig) {
    var d = JSON.parse(fig.getAttribute('data-regola'));
    var img = fig.querySelector('.regola-stage img');
    var stage = fig.querySelector('.regola-stage');
    var input = fig.querySelector('input[type="range"]');
    var out = fig.querySelector('output');
    var last = d.frames.length - 1;
    var rest = Number(input.value);
    var current = rest;
    var sweep = null;

    function show(i) {
      i = Math.max(0, Math.min(last, i));
      if (i === current) return;
      current = i;
      img.src = d.frames[i];
      input.value = String(i);
      out.value = label(d.kind, d.values[i]);
      input.setAttribute('aria-valuetext', out.value);
    }
    function stop() {
      if (sweep) { clearInterval(sweep); sweep = null; }
    }

    // Кадрите в кеша след зареждането на страницата: още първата смяна е мигновена.
    var ready = new Promise(function (resolve) {
      function load() {
        var pending = d.frames.length;
        d.frames.forEach(function (src) {
          var im = new Image();
          im.onload = im.onerror = function () { if (--pending === 0) resolve(); };
          im.src = src;
        });
      }
      if (document.readyState === 'complete') load(); else window.addEventListener('load', load, { once: true });
    });

    input.addEventListener('input', function () { stop(); show(Number(input.value)); });

    // Влачене по снимката хоризонтално: целият ход е на около половин ширина.
    var drag = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      stop();
      drag = { x: e.clientX, from: current, step: Math.max(8, stage.clientWidth * 0.5 / last) };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove', function (e) {
      if (drag) show(drag.from + Math.round((e.clientX - drag.x) / drag.step));
    });
    function end() { drag = null; stage.classList.remove('is-dragging'); }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    fig.classList.add('is-live');

    if (still || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      ready.then(function () {
        // покой → краят на хода → началото → покой, по кадър на 70 ms
        var path = [];
        var k;
        for (k = rest; k <= last; k++) path.push(k);
        for (k = last - 1; k >= 0; k--) path.push(k);
        for (k = 1; k <= rest; k++) path.push(k);
        var n = 0;
        sweep = setInterval(function () {
          if (n >= path.length) { stop(); return; }
          show(path[n++]);
        }, 70);
      });
    }, { threshold: 0.6 });
    io.observe(fig);
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-regola]'), setup);
})();
