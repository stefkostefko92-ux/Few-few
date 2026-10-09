// Рендер на структурирания отговор (DiagnosticAnswer). Само textContent/createTextNode —
// никога innerHTML. Критичното (Safety, „richiede conferma“) носи икона и текст, не само цвят.
// Блоковете живеят в answer/*.js (правило: файл > 300 реда се разделя); тук е редът им.

import { h } from './dom.js';
import { t, tMaybeCode } from './i18n.js';
import { appendBlocked, appendCaution } from './answer/safety.js';
import {
  appendCauses,
  appendConflicts,
  appendDecisions,
  appendEscalation,
  appendMissing,
  appendOutcome,
} from './answer/sections.js';
import { appendChecks } from './answer/checks.js';
import { appendSources } from './answer/sources.js';
import { appendPhotos } from './answer/photos.js';
import { appendGateDetails } from './answer/details.js';
import { feedbackRow } from './answer/feedback.js';
import { arr, str } from './answer/util.js';

export function answerSummaryText(payload) {
  return str(tMaybeCode(payload?.summary));
}

function header() {
  return h(
    'header',
    { class: 'msg-head' },
    h(
      'span',
      { class: 'ai-tag' },
      h('span', { class: 'ai-tag-mark', 'aria-hidden': 'true' }, 'AI'),
      t('ai.label'),
    ),
    h('span', { class: 'ai-note' }, t('ai.note')),
  );
}

export function renderAnswer(message, { onOpenSource, onOpenTicket, onFeedback, rated }) {
  const p = message.payload;
  const root = h('article', { class: 'msg msg-ai', 'data-message-id': message.id });
  root.append(header());

  if (!p || typeof p !== 'object') {
    // Без payload: съдържанието е скрито за ролята (gate.audienceWithheld) — тялото е код.
    root.append(h('p', { class: 'msg-text' }, str(tMaybeCode(message.body))));
    return root;
  }

  const evidence = arr(p.evidence);
  const byRef = new Map(evidence.map((e) => [e.ref, e]));
  const refBadge = (ref) => {
    const ev = byRef.get(ref);
    if (ev && ev.documentId && ev.page != null) {
      return h(
        'button',
        {
          class: 'ref-badge',
          type: 'button',
          'aria-label': `${t('ans.refLabel', { ref, code: str(ev.documentCode) })} ${t('ans.page')} ${ev.page}`,
          onclick: () => onOpenSource(ev),
        },
        str(ref),
      );
    }
    return h('span', { class: 'ref-badge ref-badge-static' }, str(ref));
  };
  const refs = (list) => {
    const items = arr(list);
    return items.length ? h('span', { class: 'refs' }, items.map(refBadge)) : null;
  };
  const safety = p.safety ?? { level: 'standard', notes: [] };
  const notes = arr(safety.notes).map((n) => str(tMaybeCode(n)));
  const c = { p, refs, evidence, safety, notes, onOpenSource, onOpenTicket };

  // Редът е договор: Safety „блокирано“ най-горе, после резултат, причини, внимание, проверки…
  appendBlocked(root, c);
  appendOutcome(root, c);
  appendCauses(root, c);
  appendCaution(root, c);
  appendChecks(root, c);
  appendDecisions(root, c);
  appendSources(root, c);
  appendPhotos(root, c);
  appendMissing(root, c);
  appendConflicts(root, c);
  appendEscalation(root, c);
  appendGateDetails(root, c);
  root.append(feedbackRow(message, onFeedback, rated));
  return root;
}
