import { api } from './api.js';
import { $, show } from './dom.js';

// Какво показва рамката на приложението около работата: връзката към поверителността (от
// /meta) и бутона към административната конзола (по способностите от /auth/me).

/** Връзката към информацията за поверителност (по чл. 13/14 GDPR), ако администраторът я е дал. */
export async function loadMeta() {
  try {
    const meta = await api('GET', '/meta');
    const url = typeof meta?.privacyUrl === 'string' ? meta.privacyUrl : '';
    if (/^https:\/\//.test(url)) {
      const link = $('#privacy-link');
      link.href = url;
      show(link, true);
    }
  } catch {
    // Без мета данни приложението работи; връзката просто не се показва.
  }
}

/** Връзка към конзолата само за ролите с административна способност (сървърът пак проверява). */
const ADMIN_CAPS = ['users:manage', 'kb:manage', 'audit:read'];

export async function showAdminLink() {
  try {
    const me = await api('GET', '/auth/me');
    const caps = Array.isArray(me?.capabilities) ? me.capabilities : [];
    show(
      $('#btn-admin'),
      caps.some((c) => ADMIN_CAPS.includes(c)),
    );
  } catch {
    show($('#btn-admin'), false);
  }
}
