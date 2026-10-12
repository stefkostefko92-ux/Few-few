// Екраните на пълната страница: вход · втори фактор · настройка на втория фактор · свързване с
// доставчика (задължителен единен вход) · нова парола · самото приложение. Показва се точно един; фокусът отива върху първото поле.

import { $ } from '../dom.js';

const SCREENS = {
  login: '#login-view',
  mfa: '#mfa-view',
  setup: '#setup-view',
  link: '#sso-link-view',
  reset: '#reset-view',
  app: '#app-view',
};

export function showScreen(name, focusSelector) {
  for (const [key, sel] of Object.entries(SCREENS)) $(sel).hidden = key !== name;
  if (focusSelector) $(focusSelector)?.focus();
}

/** Показва грешка/бележка в абзац с role=alert/status; празен текст го скрива. */
export function setNote(el, text) {
  el.textContent = text;
  el.hidden = text === '';
}
