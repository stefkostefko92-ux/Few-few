/* ============================================================
   PANEV ASCENSORI — Cookie Consent Manager
   GDPR compliant — Provv. Garante 10 giugno 2021
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY   = 'pa_cookie_consent';
  const CONSENT_EXPIRY_DAYS = 395; // ~13 mesi (EDPB linee guida)

  // ── Leggi preferenze salvate ─────────────────────────────
  function getConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Verifica scadenza
      if (data.expires && Date.now() > data.expires) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch { return null; }
  }

  // ── Salva preferenze ─────────────────────────────────────
  function saveConsent(analytics) {
    const expires = Date.now() + CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const data = {
      necessary: true,         // sempre true
      analytics: !!analytics,
      savedAt: new Date().toISOString(),
      expires
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  // ── Attiva Google Analytics se consenso dato ────────────
  function activateAnalytics() {
    // GA4 — sostituire con il proprio Measurement ID
    // Imposta window.PANEV_GA_ID = 'G-XXXXXXXXXX' nel tuo HTML prima di caricare questo script
    const GA_ID = window.PANEV_GA_ID;
    if (!GA_ID) return; // GA4 non configurato — configurare in js/ga4.js
    if (document.querySelector(`script[src*="${GA_ID}"]`)) return;

    // Rispetta Do Not Track
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;

    const s1 = document.createElement('script');
    s1.async = true;
    s1.src   = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s1);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 395 * 24 * 60 * 60,   // 13 mesi in secondi
      restricted_data_processing: true
    });
  }

  // ── Rimuovi cookie analitici ─────────────────────────────
  function removeAnalyticsCookies() {
    const domain = location.hostname;
    const base = ['_ga', '_gid', '_gat'];
    // Collect all current cookies starting with _ga_ (GA4 per-stream format)
    const dynamic = document.cookie.split(';')
      .map(c => c.trim().split('=')[0])
      .filter(n => /^_ga_/.test(n));
    const all = [...new Set([...base, ...dynamic])];
    all.forEach(name => {
      // Cover both exact host and leading-dot variants
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict; domain=${domain}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict; domain=.${domain}`;
    });
    localStorage.removeItem('pa_sess');
  }

  // ── Applica preferenze ───────────────────────────────────
  function applyConsent(data) {
    if (!data) return;
    if (data.analytics) {
      activateAnalytics();
    } else {
      removeAnalyticsCookies();
    }
  }

  // ── Crea HTML banner ─────────────────────────────────────
  function createBanner() {
    const banner = document.createElement('div');
    banner.id = 'pa-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'true');
    banner.setAttribute('aria-label', 'Gestione cookie e consenso');
    banner.innerHTML = `
      <div class="pa-cb-inner">
        <div class="pa-cb-content">
          <div class="pa-cb-icon">🍪</div>
          <div class="pa-cb-text">
            <h3>Utilizziamo i cookie</h3>
            <p>
              Questo sito utilizza cookie tecnici (necessari per il funzionamento) e, previo tuo consenso,
              cookie analitici per migliorare l'esperienza. Non utilizziamo cookie di profilazione pubblicitaria.
              <a href="cookie.html" target="_blank">Cookie Policy</a> —
              <a href="privacy.html" target="_blank">Privacy Policy</a>
            </p>
          </div>
        </div>

        <!-- Pannello impostazioni avanzate -->
        <div class="pa-cb-settings" id="pa-cb-settings" style="display:none">
          <div class="pa-toggle-row">
            <div class="pa-toggle-info">
              <strong>Cookie Tecnici</strong>
              <span>Necessari per il funzionamento del sito (carrello, pagamenti, preferenze). Non disabilitabili.</span>
            </div>
            <div class="pa-toggle-switch always-on">
              <span>Sempre attivi</span>
            </div>
          </div>
          <div class="pa-toggle-row">
            <div class="pa-toggle-info">
              <strong>Cookie Analitici</strong>
              <span>Google Analytics 4 con IP anonimizzato. Ci aiutano a capire come viene usato il sito.</span>
            </div>
            <div class="pa-toggle-wrap">
              <label class="pa-switch" for="pa-analytics-toggle">
                <input type="checkbox" id="pa-analytics-toggle">
                <span class="pa-slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="pa-cb-actions">
          <button class="pa-cb-btn pa-cb-settings-btn" id="pa-cb-customize" onclick="paCookieToggleSettings()">
            ⚙ Personalizza
          </button>
          <button class="pa-cb-btn pa-cb-reject" onclick="paCookieReject()">
            Rifiuta non necessari
          </button>
          <button class="pa-cb-btn pa-cb-accept" onclick="paCookieAccept()">
            Accetta tutti
          </button>
        </div>
        <div class="pa-cb-save-row" id="pa-cb-save-row" style="display:none">
          <button class="pa-cb-btn pa-cb-save" onclick="paCookieSaveCustom()">
            Salva preferenze →
          </button>
        </div>
      </div>`;

    return banner;
  }

  // ── Crea overlay modale (per accessibilità) ──────────────
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pa-cookie-overlay';
    return overlay;
  }

  // ── Mostra banner ────────────────────────────────────────
  function showBanner() {
    if (document.getElementById('pa-cookie-banner')) return;
    const overlay = createOverlay();
    const banner  = createBanner();
    document.body.appendChild(overlay);
    document.body.appendChild(banner);
    // Animazione entrata
    requestAnimationFrame(() => {
      overlay.classList.add('pa-visible');
      banner.classList.add('pa-visible');
    });
    // Focus trap per accessibilità
    setTimeout(() => {
      const firstBtn = banner.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }, 300);
  }

  // ── Chiudi banner ────────────────────────────────────────
  function hideBanner() {
    const banner  = document.getElementById('pa-cookie-banner');
    const overlay = document.getElementById('pa-cookie-overlay');
    if (banner)  { banner.classList.remove('pa-visible'); setTimeout(() => banner.remove(), 400); }
    if (overlay) { overlay.classList.remove('pa-visible'); setTimeout(() => overlay.remove(), 400); }
  }

  // ── Azioni pubbliche ─────────────────────────────────────
  window.paCookieAccept = function () {
    const data = saveConsent(true);
    applyConsent(data);
    hideBanner();
  };

  window.paCookieReject = function () {
    const data = saveConsent(false);
    applyConsent(data);
    hideBanner();
  };

  window.paCookieSaveCustom = function () {
    const analyticsChk = document.getElementById('pa-analytics-toggle');
    const analytics = analyticsChk ? analyticsChk.checked : false;
    const data = saveConsent(analytics);
    applyConsent(data);
    hideBanner();
  };

  window.paCookieToggleSettings = function () {
    const settings = document.getElementById('pa-cb-settings');
    const saveRow  = document.getElementById('pa-cb-save-row');
    const btn      = document.getElementById('pa-cb-customize');
    if (!settings) return;
    const isOpen = settings.style.display !== 'none';
    settings.style.display = isOpen ? 'none' : 'block';
    saveRow.style.display   = isOpen ? 'none' : 'flex';
    btn.textContent = isOpen ? '⚙ Personalizza' : '✕ Chiudi impostazioni';
  };

  // ── Riapri banner (da Cookie Policy) ────────────────────
  window.riapriBannerCookie = function () {
    localStorage.removeItem(STORAGE_KEY);
    showBanner();
  };

  // ── Init ─────────────────────────────────────────────────
  function init() {
    const consent = getConsent();
    if (consent === null) {
      // Prima visita o consenso scaduto — mostra banner
      showBanner();
    } else {
      // Consenso già espresso — applica
      applyConsent(consent);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
