// Връзката между интерактивните липсващи данни (missing.js) и разговора: кой отговор е
// интерактивен (последният AI отговор в отворен случай на участник), кой е въпросът за „попитай
// отново“, тавата за снимка/лог и QR скенерът. Правата пак ги проверява сървърът.

import { setCaseContext } from '../context.js';
import { t } from '../i18n.js';
import { scanDevice } from '../qr/scan.js';
import { state } from '../store.js';

/** Човешкият въпрос точно преди този AI отговор (или общ текст, ако няма). */
function questionFor(messages, message) {
  const idx = messages.findIndex((m) => m.id === message.id);
  for (let i = idx - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.kind === 'HUMAN' && typeof m.body === 'string' && m.body.trim()) return m.body;
  }
  return t('missing.askAgainText');
}

/**
 * @param {object} message AI съобщението
 * @param {{ pick: (kind: 'PHOTO'|'LOG') => void, askAgain: (text: string) => void }} hooks
 */
export function missingUiFor(message, hooks) {
  const cur = state.current;
  if (!cur?.case) return null;
  const lastAi = [...cur.messages].reverse().find((m) => m.kind === 'AI');
  const interactive =
    lastAi?.id === message.id &&
    cur.case.status !== 'RESOLVED' &&
    state.flow?.caseId === cur.case.id &&
    state.flow?.can?.recordSteps === true;
  return {
    interactive,
    caseId: cur.case.id,
    context: cur.case.context ?? {},
    pick: hooks.pick,
    scanQr: scanDevice,
    onContextSaved: setCaseContext,
    onAskAgain: () => hooks.askAgain(questionFor(cur.messages, message)),
  };
}
