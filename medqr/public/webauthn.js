// Клиентска логика за passkeys (WebAuthn). Разчита на глобала SimpleWebAuthnBrowser
// (зареден от /vendor/simplewebauthn-browser.umd.min.js) и на CSP nonce-базиран
// скрипт няма нужда — този файл е външен ('self').
(function () {
  const meta = document.querySelector('meta[name="csrf-token"]');
  const CSRF = meta ? meta.content : '';
  const EN = document.documentElement.lang === 'en';
  const T = {
    request_failed: EN ? 'Request failed.' : 'Грешка при заявката.',
    default_label: EN ? 'Passkey' : 'Паскей',
  };

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF },
      body: body ? JSON.stringify(body) : '{}',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || T.request_failed);
    }
    return res.json();
  }

  function showError(msg) {
    const box = document.querySelector('[data-webauthn-error]');
    if (box) {
      box.textContent = msg;
      box.hidden = false;
    } else {
      window.alert(msg);
    }
  }

  async function registerPasskey(label) {
    const options = await post('/webauthn/register/options');
    const cred = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });
    await post('/webauthn/register/verify', { cred, label });
    window.location.href = '/profile/passkeys';
  }

  async function loginPasskey() {
    const options = await post('/webauthn/login/options');
    const cred = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
    const r = await post('/webauthn/login/verify', { cred });
    window.location.href = r.redirect || '/dashboard';
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.SimpleWebAuthnBrowser) return;

    const regForm = document.querySelector('form[data-webauthn="register"]');
    if (regForm) {
      regForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const label = (regForm.querySelector('[name="label"]') || {}).value || T.default_label;
        registerPasskey(label).catch((err) => showError(err.message));
      });
    }

    const loginBtn = document.querySelector('[data-webauthn="login"]');
    if (loginBtn) {
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loginPasskey().catch((err) => showError(err.message));
      });
    }
  });
})();
