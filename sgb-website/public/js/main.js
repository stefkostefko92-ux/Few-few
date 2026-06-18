/* Публичен JS — навигация и съгласие за бисквитки */
(function () {
  'use strict';

  // Мобилно меню
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    // Подменюта на тъч устройства
    nav.querySelectorAll('.has-children > a').forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (window.innerWidth <= 860 && link.querySelector('.caret')) {
          var sub = link.parentElement.querySelector('.submenu');
          if (sub) {
            var visible = sub.style.display === 'block';
            if (!visible) { e.preventDefault(); sub.style.display = 'block'; }
            else { sub.style.display = ''; }
          }
        }
      });
    });
  }

  // Съгласие за бисквитки
  var KEY = 'sgb_cookie_consent';
  var banner = document.getElementById('cookie-banner');
  if (banner) {
    var stored;
    try { stored = localStorage.getItem(KEY); } catch (e) { stored = '1'; }
    if (!stored) { banner.hidden = false; }
    var close = function (val) {
      try { localStorage.setItem(KEY, val); } catch (e) {}
      banner.hidden = true;
    };
    var accept = document.getElementById('cookie-accept');
    var decline = document.getElementById('cookie-decline');
    if (accept) accept.addEventListener('click', function () { close('accepted'); });
    if (decline) decline.addEventListener('click', function () { close('necessary'); });
  }

  // Слайдшоу с реални снимки
  var show = document.getElementById('slideshow');
  if (show) {
    var slides = Array.prototype.slice.call(show.querySelectorAll('.slide'));
    var dotsWrap = document.getElementById('slide-dots');
    var idx = 0, timer = null;
    var dots = slides.map(function (_, i) {
      var b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', 'Снимка ' + (i + 1));
      if (i === 0) b.classList.add('is-active');
      b.addEventListener('click', function () { go(i); reset(); });
      dotsWrap.appendChild(b);
      return b;
    });
    function go(n) {
      slides[idx].classList.remove('is-active');
      dots[idx].classList.remove('is-active');
      idx = (n + slides.length) % slides.length;
      slides[idx].classList.add('is-active');
      dots[idx].classList.add('is-active');
    }
    function next() { go(idx + 1); }
    function prev() { go(idx - 1); }
    function reset() { if (timer) clearInterval(timer); timer = setInterval(next, 6000); }
    var pn = document.getElementById('slide-next');
    var pp = document.getElementById('slide-prev');
    if (pn) pn.addEventListener('click', function () { next(); reset(); });
    if (pp) pp.addEventListener('click', function () { prev(); reset(); });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) reset();
  }

  // Сянка на хедъра при скрол
  var header = document.getElementById('site-header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 10) header.classList.add('is-scrolled');
      else header.classList.remove('is-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
