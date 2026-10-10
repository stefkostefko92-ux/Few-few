// Предпочитанията за известията (FR-18, §12.3 „digest email configurabili“): имейл вкл./изкл.,
// дневен дайджест, тихи часове (по часовата зона на браузъра). Идват с GET /notifications
// (§14.1), пишат се с PATCH /notifications/preferences. Предпочитанията по разговор са в
// подробностите на разговора. Без конфигуриран имейл на сървъра — казваме го, не се преструваме.

import { $, announce, show } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';
import { wsApi } from './api.js';
import { ws } from './model.js';
import { loadNotifications } from './sync.js';

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
  } catch {
    return 'Europe/Rome';
  }
};

function fill() {
  const email = ws.notifPrefs?.email ?? {
    available: false,
    enabled: true,
    digest: 'OFF',
    quietHours: null,
  };
  show($('#np-unavailable'), email.available === false);
  $('#np-email').checked = email.enabled !== false;
  $('#np-digest').checked = email.digest === 'DAILY';
  $('#np-from').value = email.quietHours?.start ?? '';
  $('#np-to').value = email.quietHours?.end ?? '';
  $('#np-zone').textContent = t('notif.prefs.timeZone', { zone: browserZone() });
  show($('#np-error'), false);
}

export async function openNotifSettings() {
  if (!ws.notifPrefs) {
    try {
      await loadNotifications();
    } catch {
      /* диалогът показва подразбиранията; запазването ще каже, ако нещо не е наред */
    }
  }
  fill();
  $('#dlg-notif').showModal();
  $('#np-email').focus();
}

export function initNotifSettings() {
  const form = $('#np-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#np-error');
    const from = $('#np-from').value;
    const to = $('#np-to').value;
    if (Boolean(from) !== Boolean(to) || (from && from === to)) {
      err.textContent = t('notif.prefs.quietInvalid');
      show(err, true);
      return;
    }
    const btn = $('#np-submit');
    btn.disabled = true;
    try {
      const res = await wsApi.notificationPrefs({
        emailEnabled: $('#np-email').checked,
        digest: $('#np-digest').checked ? 'DAILY' : 'OFF',
        quietHours: from && to ? { start: from.slice(0, 5), end: to.slice(0, 5) } : null,
        timeZone: browserZone(),
      });
      ws.notifPrefs = { ...(ws.notifPrefs ?? {}), ...res.preferences };
      $('#dlg-notif').close();
      announce(t('notif.prefs.saved'));
    } catch (ex) {
      err.textContent = errorText(ex);
      show(err, true);
    } finally {
      btn.disabled = false;
    }
  });
}
