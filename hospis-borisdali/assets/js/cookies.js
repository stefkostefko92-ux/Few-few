/* ============================================================
   Управление на съгласието за бисквитки (GDPR / ЗЕС съвместимо)
   - Незадължителни (аналитични/маркетинг) бисквитки НЕ се зареждат
     преди изрично съгласие ("opt-in", без предварително отметнато).
   - Изборът се пази 6 месеца; може да се оттегли по всяко време.
   ============================================================ */
(function () {
  "use strict";
  var KEY = "hbd_cookie_consent_v1";
  var MAX_AGE_DAYS = 180;

  function readConsent() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.ts) return null;
      var ageDays = (Date.now() - data.ts) / 86400000;
      if (ageDays > MAX_AGE_DAYS) return null;
      return data;
    } catch (e) { return null; }
  }

  function saveConsent(analytics) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ necessary: true, analytics: !!analytics, ts: Date.now() }));
    } catch (e) {}
  }

  /* Зареждайте незадължителни скриптове САМО оттук, след съгласие.
     Пример (разкоментирайте и заменете с реалния идентификатор):
     function loadAnalytics(){ // напр. поверителен Plausible/Matomo
       // var s=document.createElement('script'); s.defer=true;
       // s.src='https://analytics.example/script.js'; document.head.appendChild(s);
     } */
  function loadAnalytics() { /* placeholder — добавете тук аналитиката */ }

  function hideBanner() {
    var b = document.getElementById("cookie-banner");
    if (b) b.setAttribute("data-show", "false");
  }
  function showBanner() {
    var b = document.getElementById("cookie-banner");
    if (b) b.setAttribute("data-show", "true");
  }

  function apply(consent) {
    if (consent && consent.analytics) loadAnalytics();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var existing = readConsent();
    if (existing) { apply(existing); }
    else { showBanner(); }

    var accept = document.getElementById("cookie-accept");
    var reject = document.getElementById("cookie-reject");
    if (accept) accept.addEventListener("click", function () { saveConsent(true); apply({ analytics: true }); hideBanner(); });
    if (reject) reject.addEventListener("click", function () { saveConsent(false); hideBanner(); });

    // Връзка „Настройки на бисквитките" (във футъра/политиката) отваря банера отново
    document.querySelectorAll("[data-cookie-settings]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); showBanner(); });
    });
  });
})();
