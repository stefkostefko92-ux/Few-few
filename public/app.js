// Малки помощници без inline скриптове (за да работи строгата Content-Security-Policy).
document.addEventListener('DOMContentLoaded', () => {
  // Език за динамичните съобщения и за синтеза на реч.
  const docLang = document.documentElement.lang === 'en' ? 'en' : 'bg';
  const speechLang = docLang === 'en' ? 'en-US' : 'bg-BG';
  const STR = {
    bg: {
      offline: 'Офлайн режим — показва се запазено копие.',
      copied: 'Копирано ✓',
      locating: 'Определяне на местоположението…',
      loc_sent: 'Местоположението е изпратено на близкия.',
      send_fail: 'Изпращането не успя.',
      loc_fail: 'Не успяхме да определим местоположението.',
      loc_label: 'Местоположение',
      sos_sent: 'Сигналът е изпратен до близките ти.',
    },
    en: {
      offline: 'Offline — showing a saved copy.',
      copied: 'Copied ✓',
      locating: 'Locating…',
      loc_sent: 'Location was sent to the contact.',
      send_fail: 'Sending failed.',
      loc_fail: 'Could not determine the location.',
      loc_label: 'Location',
      sos_sent: 'The alert was sent to your contacts.',
    },
  }[docLang];

  // Офлайн достъп: регистрираме service worker и показваме индикатор за връзка.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* офлайн поддръжката е по избор */
    });
  }
  const offlineBanner = document.createElement('div');
  offlineBanner.className = 'offline-banner';
  offlineBanner.setAttribute('role', 'status');
  offlineBanner.textContent = STR.offline;
  offlineBanner.hidden = true;
  document.body.appendChild(offlineBanner);
  const syncOnline = () => {
    offlineBanner.hidden = navigator.onLine;
  };
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);
  syncOnline();

  // При изход изчистваме личния кеш (SOS/табло/спешен изглед) за поверителност.
  document.querySelectorAll('form[action="/logout"]').forEach((f) =>
    f.addEventListener('submit', () => {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller)
          navigator.serviceWorker.controller.postMessage({ type: 'clear-private' });
      } catch {
        /* без service worker */
      }
    })
  );

  // Потвърждение преди рискови действия: <form data-confirm="текст">.
  document.querySelectorAll('[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });
  // Бутон за печат: <button data-print>.
  document.querySelectorAll('[data-print]').forEach((btn) => {
    btn.addEventListener('click', () => window.print());
  });

  // Избор на размер на QR етикета: обновява преглед и връзките за сваляне.
  const sizeButtons = document.querySelectorAll('[data-qr-size]');
  if (sizeButtons.length) {
    const preview = document.getElementById('qr-preview');
    const dlLabel = document.getElementById('dl-label');
    const dlQr = document.getElementById('dl-qr');
    sizeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = btn.getAttribute('data-qr-size');
        sizeButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
        if (preview) preview.src = `/label.svg?size=${size}`;
        if (dlLabel) dlLabel.href = `/label.svg?size=${size}`;
        if (dlQr) dlQr.href = `/qr.png?size=${size}`;
      });
    });
  }

  // Копиране в клипборда: <button data-copy="#селектор">.
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const el = document.querySelector(btn.getAttribute('data-copy'));
      if (!el) return;
      try {
        await navigator.clipboard.writeText(el.textContent.trim());
        const old = btn.textContent;
        btn.textContent = STR.copied;
        setTimeout(() => (btn.textContent = old), 1500);
      } catch {
        /* без клипборд достъп */
      }
    });
  });

  // Споделяне на местоположението с близкия (от спешния изглед).
  const locateBtn = document.querySelector('[data-locate]');
  if (locateBtn && 'geolocation' in navigator) {
    const status = document.getElementById('locate-status');
    locateBtn.addEventListener('click', () => {
      if (status) status.textContent = STR.locating;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const meta = document.querySelector('meta[name="csrf-token"]');
          try {
            const res = await fetch(`${location.pathname}/locate`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-csrf-token': meta ? meta.content : '',
              },
              body: JSON.stringify({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              }),
            });
            if (status) status.textContent = res.ok ? STR.loc_sent : STR.send_fail;
          } catch {
            if (status) status.textContent = STR.send_fail;
          }
        },
        () => {
          if (status) status.textContent = STR.loc_fail;
        },
        // Принуждаваме GPS вместо по-неточен Wi-Fi/клетка и избягваме стара кеширана позиция.
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  // Помощник за общуване (спешен изглед): двупосочни карти, скала на болка и
  // четене на глас — дава „глас“ на нечуващ/неговорещ човек.
  const commOverlay = document.getElementById('comm-overlay');
  if (commOverlay) {
    const stage = document.getElementById('comm-stage');
    const typeBox = document.getElementById('comm-type');
    const supportsTTS = 'speechSynthesis' in window;
    const buzz = (ms) => {
      try {
        if (navigator.vibrate) navigator.vibrate(ms);
      } catch {
        /* без вибрация */
      }
    };
    const speak = (text) => {
      if (!text || !supportsTTS) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = speechLang;
        u.rate = 0.95;
        window.speechSynthesis.speak(u);
      } catch {
        /* без синтез на реч */
      }
    };
    const show = (text) => {
      if (stage) stage.textContent = text;
    };
    const open = () => {
      commOverlay.hidden = false;
      document.body.classList.add('comm-open');
    };
    const close = () => {
      commOverlay.hidden = true;
      document.body.classList.remove('comm-open');
      if (supportsTTS) window.speechSynthesis.cancel();
    };

    document.querySelectorAll('[data-comm-open]').forEach((b) => b.addEventListener('click', open));
    commOverlay
      .querySelectorAll('[data-comm-close]')
      .forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !commOverlay.hidden) close();
    });

    commOverlay.querySelectorAll('[data-phrase]').forEach((b) => {
      const fire = () => {
        const t = b.getAttribute('data-phrase');
        show(t);
        speak(t);
        buzz(15);
      };
      b.addEventListener('click', fire);
      b.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          fire();
        }
      });
    });

    const sayBtn = commOverlay.querySelector('[data-say]');
    if (sayBtn)
      sayBtn.addEventListener('click', () => {
        const t = ((typeBox && typeBox.value) || '').trim();
        if (!t) return;
        show(t);
        speak(t);
        buzz(15);
      });
    if (!supportsTTS && sayBtn) sayBtn.hidden = true;

    const showBtn = commOverlay.querySelector('[data-show]');
    if (showBtn)
      showBtn.addEventListener('click', () => {
        const t = ((typeBox && typeBox.value) || '').trim();
        if (t) show(t);
      });

    const clearBtn = commOverlay.querySelector('[data-clear]');
    if (clearBtn)
      clearBtn.addEventListener('click', () => {
        if (typeBox) typeBox.value = '';
        if (stage) stage.textContent = stage.getAttribute('data-default') || '';
      });
  }

  // Екран за спешна помощ (SOS): сирена + мигане + вибрация за внимание и
  // сигнал до близките с местоположение.
  const sos = document.getElementById('sos');
  if (sos) {
    const statusEl = document.getElementById('sos-status');
    const locEl = document.getElementById('sos-loc');
    const flash = document.getElementById('sos-flash');
    const alarmBtn = sos.querySelector('[data-sos-alarm]');
    const peopleBtn = sos.querySelector('[data-sos-people]');
    const csrf = () => {
      const m = document.querySelector('meta[name="csrf-token"]');
      return m ? m.content : '';
    };
    const setStatus = (t) => {
      if (statusEl) statusEl.textContent = t;
    };

    let alarmOn = false;
    let audioCtx;
    let osc;
    let gain;
    let beatTimer;
    let vibTimer;
    const stopAlarm = () => {
      alarmOn = false;
      document.body.classList.remove('sos-active');
      if (flash) flash.classList.remove('on');
      clearInterval(beatTimer);
      clearInterval(vibTimer);
      try {
        if (osc) osc.stop();
        if (audioCtx) audioCtx.close();
      } catch {
        /* аудио вече спряно */
      }
      osc = null;
      audioCtx = null;
      try {
        if (navigator.vibrate) navigator.vibrate(0);
      } catch {
        /* без вибрация */
      }
      if (alarmBtn) alarmBtn.classList.remove('is-on');
    };
    const startAlarm = () => {
      alarmOn = true;
      document.body.classList.add('sos-active');
      if (alarmBtn) alarmBtn.classList.add('is-on');
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        osc = audioCtx.createOscillator();
        gain = audioCtx.createGain();
        osc.type = 'square';
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.value = 0.0001;
        osc.start();
        let hi = false;
        beatTimer = setInterval(() => {
          hi = !hi;
          osc.frequency.value = hi ? 988 : 622;
          gain.gain.value = hi ? 0.35 : 0.0001;
          if (flash) flash.classList.toggle('on', hi);
        }, 430);
      } catch {
        /* без звук — оставаме само с мигане/вибрация */
      }
      try {
        if (navigator.vibrate) vibTimer = setInterval(() => navigator.vibrate([300, 150]), 900);
      } catch {
        /* без вибрация */
      }
    };
    if (alarmBtn)
      alarmBtn.addEventListener('click', () => {
        if (alarmOn) {
          stopAlarm();
        } else {
          startAlarm();
        }
      });

    if (peopleBtn)
      peopleBtn.addEventListener('click', () => {
        const phone = sos.getAttribute('data-contact-phone');
        const send = (lat, lng) => {
          const maps = lat != null ? `https://www.google.com/maps?q=${lat},${lng}` : '';
          fetch('/sos/alert', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-csrf-token': csrf() },
            body: JSON.stringify({ lat, lng }),
          }).catch(() => {});
          setStatus(STR.sos_sent);
          if (phone) {
            const smsText =
              docLang === 'en'
                ? `Emergency! I need help. I am deaf.${maps ? ' Location: ' + maps : ''}`
                : `Спешно! Нуждая се от помощ. Аз съм глух/а.${maps ? ' Локация: ' + maps : ''}`;
            const body = encodeURIComponent(smsText);
            window.location.href = `sms:${phone}?body=${body}`;
          }
        };
        if ('geolocation' in navigator) {
          setStatus(STR.locating);
          navigator.geolocation.getCurrentPosition(
            (p) => {
              const lat = Number(p.coords.latitude.toFixed(5));
              const lng = Number(p.coords.longitude.toFixed(5));
              if (locEl) locEl.textContent = `${STR.loc_label}: ${lat}, ${lng}`;
              send(lat, lng);
            },
            () => send(null, null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        } else {
          send(null, null);
        }
      });
  }

  // Запис на NFC таг (Web NFC — Android/Chrome). Прогресивно подобрение.
  const nfcBtn = document.getElementById('nfc-write');
  const urlEl = document.getElementById('emergency-url');
  if (nfcBtn && urlEl && 'NDEFReader' in window) {
    nfcBtn.hidden = false;
    const status = document.getElementById('nfc-status');
    const hint = document.getElementById('nfc-hint');
    if (hint) hint.hidden = true;
    nfcBtn.addEventListener('click', async () => {
      if (status) status.textContent = 'Допрете таг до телефона…';
      try {
        const ndef = new window.NDEFReader();
        await ndef.write({ records: [{ recordType: 'url', data: urlEl.textContent.trim() }] });
        if (status) status.textContent = 'Готово! Профилът е записан на тага.';
      } catch (e) {
        if (status)
          status.textContent = 'Записът не успя: ' + (e && e.message ? e.message : 'опитайте пак');
      }
    });
  }

  // Биометрично заключване — само в нативното приложение (Capacitor) и само ако
  // е включено. На уеб и в тестовете е напълно без ефект (пазено от проверките).
  const cap = window.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());

  const bioRow = document.getElementById('biometric-row');
  if (bioRow && isNative) {
    bioRow.hidden = false;
    const cb = document.getElementById('biometric-toggle');
    if (cb) {
      cb.checked = localStorage.getItem('medqr-biometric') === 'on';
      cb.addEventListener('change', () =>
        localStorage.setItem('medqr-biometric', cb.checked ? 'on' : 'off')
      );
    }
  }

  if (isNative && localStorage.getItem('medqr-biometric') === 'on') {
    const bio = cap.Plugins && cap.Plugins.BiometricAuth;
    if (bio && typeof bio.authenticate === 'function') {
      const msg = docLang === 'en' ? 'MedQR is locked' : 'MedQR е заключено';
      const unlock = docLang === 'en' ? 'Unlock' : 'Отключи';
      const lock = document.createElement('div');
      lock.className = 'bio-lock';
      const box = document.createElement('div');
      box.className = 'bio-lock-box';
      const para = document.createElement('p');
      para.textContent = msg;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = unlock;
      box.append(para, btn);
      lock.appendChild(box);
      document.body.appendChild(lock);
      const tryAuth = async () => {
        try {
          await bio.authenticate({ reason: msg, allowDeviceCredential: true });
          lock.remove();
        } catch {
          /* остава заключено — потребителят натиска „Отключи“ */
        }
      };
      btn.addEventListener('click', tryAuth);
      tryAuth();
    }
  }
});
