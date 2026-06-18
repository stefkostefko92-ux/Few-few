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
