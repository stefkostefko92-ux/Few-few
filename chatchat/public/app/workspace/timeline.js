// Хронологията на случая (AC-19): човешки съобщения, AI отговори и системни събития са ясно
// различими (етикет с текст и знак, не само цвят), всяко с час и автор. Порталният техник вижда
// РОЛЯТА на служителя (authorRole), не името. Вътрешните събития (internal.*) идват само за персонал.

import { clear, h, $ } from '../dom.js';
import { errorText } from '../errors.js';
import { fmtFull, roleLabel } from '../format.js';
import { t, has } from '../i18n.js';
import { state } from '../store.js';
import { wsApi } from './api.js';

const SOURCE_MARK = { human: '●', ai: '◆', system: '○' };

function authorOf(e) {
  if (e.source === 'ai') return t('ai.label');
  if (e.source === 'system' || !e.actor) return t('tl.system');
  if (e.actor.authorName) return e.actor.authorName;
  if (e.actor.authorRole) return roleLabel(e.actor.authorRole);
  return t('tl.system');
}

function detailOf(e) {
  const p = e.payload ?? {};
  switch (e.type) {
    case 'ai.answer':
      return t('tl.d.ai', {
        status: has(`ans.outcome.${p.status}`)
          ? t(`ans.outcome.${p.status}`)
          : String(p.status ?? ''),
        confidence: has(`ans.conf.${p.confidence}`)
          ? t(`ans.conf.${p.confidence}`)
          : String(p.confidence ?? ''),
      });
    case 'ticket.created':
      return t('tl.d.ticket', { number: p.number ?? '' });
    case 'case.outcome':
      return has(`outcome.${p.outcome}`) ? t(`outcome.${p.outcome}`) : '';
    case 'feedback':
      return has(`fb.rating.${p.rating}`) ? t(`fb.rating.${p.rating}`) : '';
    case 'attachment.uploaded':
      return has(`att.kind.${p.kind}`) ? t(`att.kind.${p.kind}`) : '';
    case 'context.firmwareOutsideRevision':
      return t('code.ctx.firmwareOutsideRevision');
    default:
      return '';
  }
}

export function renderTimeline(events) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return h('p', { class: 'muted' }, t('timeline.empty'));
  return h(
    'ol',
    { class: 'tl' },
    list.map((e) => {
      const label = has(`tl.${e.type}`) ? t(`tl.${e.type}`) : e.type;
      const detail = detailOf(e);
      return h(
        'li',
        { class: `tl-item tl-${e.source}` },
        h(
          'span',
          { class: 'tl-tag' },
          h('span', { 'aria-hidden': 'true' }, SOURCE_MARK[e.source] ?? '•'),
          ` ${t(`tl.src.${e.source}`)}`,
        ),
        h(
          'div',
          { class: 'tl-main' },
          h('p', { class: 'tl-label' }, label),
          detail ? h('p', { class: 'muted' }, detail) : null,
        ),
        h(
          'p',
          { class: 'tl-meta' },
          authorOf(e),
          ' · ',
          h('time', { datetime: String(e.at) }, fmtFull(e.at)),
        ),
      );
    }),
  );
}

export async function openTimeline(caseId) {
  const dlg = $('#dlg-timeline');
  const body = clear($('#tl-body'));
  body.append(h('p', { class: 'muted' }, t('conv.loading')));
  if (!dlg.open) dlg.showModal();
  try {
    const { events } = await wsApi.timeline(caseId);
    // Бележка за портала: името на служителя е скрито по правило, не по грешка.
    clear(body);
    // Бележка за портала: името на служителя на производителя е скрито по правило, не по грешка.
    if (state.user?.kind === 'PORTAL')
      body.append(h('p', { class: 'hint' }, t('timeline.portalHint')));
    body.append(renderTimeline(events));
  } catch (err) {
    clear(body).append(h('p', { class: 'form-error', role: 'alert' }, errorText(err)));
  }
}
