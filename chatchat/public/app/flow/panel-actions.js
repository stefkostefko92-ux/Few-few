// Действията по тикета от панела на случая (FR-19): техникът — „Passa a un operatore“ и повторно
// отваряне; операторът — назначаване, искане на данни, към Engineering, „върни към AI“, затваряне
// с резолюция. Всяко действие е формуляр в диалог; сървърът проверява правата наново.

import { $, h } from '../dom.js';
import { roleLabel } from '../format.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { flowApi } from './api.js';
import { formDialog } from './dialog.js';

const minReason = (name, label) => ({
  name,
  label,
  type: 'textarea',
  required: true,
  minlength: 3,
  maxlength: 1000,
  rows: 3,
  requiredText: t('ticket.err.reason_required'),
});

/**
 * Бутон, който отваря формуляр. След успешно изпращане панелът е нарисуван наново (бутонът е
 * изчезнал) — фокусът отива на заглавието на тикета или на съобщението, не в нищото.
 */
function button(label, open, cls = 'btn-secondary') {
  const onclick = async () => {
    if (!(await open())) return;
    const target = $('#ticket-panel .ticket-head') ?? $('#actions-feedback');
    if (!target) return;
    target.tabIndex = -1;
    target.focus();
  };
  return h('button', { type: 'button', class: `btn ${cls} btn-block`, onclick }, label);
}

/** Документите, цитирани в отговорите на случая — кандидатите за „свързани източници“. */
function citedDocuments() {
  const seen = new Map();
  for (const m of state.current?.messages ?? []) {
    for (const e of Array.isArray(m?.payload?.evidence) ? m.payload.evidence : []) {
      if (e?.documentId && !seen.has(e.documentId)) {
        seen.set(e.documentId, {
          value: e.documentId,
          label: `${e.documentCode} rev. ${e.revision}`,
        });
      }
    }
  }
  return [...seen.values()];
}

export function flowActions(flow, c, done) {
  const out = [];
  const tk = flow.ticket;
  const me = state.user?.id;
  const act = (action, body, text) => async () => {
    await flowApi.act(tk.id, action, body);
    await done(text);
  };

  if (flow.can?.handoff) {
    out.push(
      button(
        t('handoff.button'),
        () =>
          formDialog({
            title: t('handoff.title'),
            hint: t('handoff.hint'),
            submitLabel: t('handoff.submit'),
            fields: [{ ...minReason('message', t('handoff.message')), maxlength: 2000 }],
            onSubmit: async (v) => {
              const res = await flowApi.handoff(c.id, v.message);
              await done(t('handoff.done', { number: res.ticket.number }));
            },
          }),
        'btn-primary',
      ),
    );
  }
  if (tk && flow.can?.reopen) {
    out.push(
      button(t('ticket.reopen.button'), () =>
        formDialog({
          title: t('ticket.reopen.title'),
          submitLabel: t('ticket.reopen.submit'),
          fields: [minReason('reason', t('ticket.reopen.reason'))],
          onSubmit: (v) => act('reopen', { reason: v.reason }, t('ticket.reopen.done'))(),
        }),
      ),
    );
  }
  if (!tk || tk.status === 'CLOSED' || !flow.can?.operate) return out;

  const mine = tk.owner?.id === me;
  if (mine && ['ASSIGNED', 'IN_PROGRESS'].includes(tk.status)) {
    out.push(
      button(t('ticket.info.button'), () =>
        formDialog({
          title: t('ticket.info.dialog'),
          hint: t('ticket.info.hint'),
          submitLabel: t('ticket.info.submit'),
          fields: [
            {
              ...minReason('items', t('ticket.info.items')),
              minlength: 1,
              rows: 4,
              maxlength: 3000,
            },
            {
              name: 'note',
              label: t('ticket.info.note'),
              type: 'textarea',
              rows: 2,
              maxlength: 1000,
            },
          ],
          onSubmit: (v) => {
            const items = String(v.items)
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 10);
            return act(
              'request-info',
              { items, ...(v.note ? { note: v.note } : {}) },
              t('ticket.info.sent'),
            )();
          },
        }),
      ),
    );
  }
  if (mine && c.aiPaused) {
    out.push(
      button(t('handoff.toAi.button'), () =>
        formDialog({
          title: t('handoff.toAi.title'),
          hint: t('handoff.toAi.hint'),
          submitLabel: t('handoff.toAi.submit'),
          fields: [
            {
              name: 'note',
              label: t('handoff.toAi.note'),
              type: 'textarea',
              rows: 2,
              maxlength: 500,
            },
          ],
          onSubmit: (v) =>
            act('return-to-ai', v.note ? { note: v.note } : {}, t('handoff.toAi.done'))(),
        }),
      ),
    );
  }
  if ((mine || !tk.owner) && tk.queue === 'SUPPORT') {
    out.push(
      button(t('ticket.escalate.button'), () =>
        formDialog({
          title: t('ticket.escalate.title'),
          hint: t('ticket.escalate.hint'),
          submitLabel: t('ticket.escalate.submit'),
          fields: [minReason('reason', t('ticket.escalate.reason'))],
          onSubmit: (v) => act('escalate', { reason: v.reason }, t('ticket.escalate.done'))(),
        }),
      ),
    );
  }
  out.push(
    button(t('ticket.assign.button'), async () => {
      const people = (await flowApi.assignees('')).people ?? [];
      const foreign = tk.owner && !mine;
      return formDialog({
        title: t('ticket.assign.title'),
        submitLabel: t('ticket.assign.submit'),
        fields: [
          {
            name: 'userId',
            label: t('ticket.assign.who'),
            type: 'select',
            options: people
              .filter((p) => p.id !== tk.owner?.id)
              .map((p) => ({ value: p.id, label: `${p.name} · ${roleLabel(p.role)}` })),
          },
          foreign
            ? minReason('reason', t('ticket.assign.reason'))
            : {
                name: 'reason',
                label: t('ticket.assign.reasonOptional'),
                type: 'textarea',
                rows: 2,
                maxlength: 1000,
              },
        ],
        onSubmit: (v) =>
          act(
            'assign',
            { userId: v.userId, ...(v.reason ? { reason: v.reason } : {}) },
            t('ticket.assign.done'),
          )(),
      });
    }),
  );
  if (mine) {
    out.push(
      button(
        t('ticket.close.button'),
        () =>
          formDialog({
            title: t('ticket.close.title'),
            hint: t('ticket.close.hint'),
            submitLabel: t('ticket.close.submit'),
            fields: [
              { ...minReason('rootCause', t('ticket.close.rootCause')), maxlength: 2000 },
              { ...minReason('solution', t('ticket.close.solution')), maxlength: 2000 },
              {
                name: 'sources',
                label: t('ticket.close.sources'),
                type: 'checks',
                options: citedDocuments(),
                empty: t('ticket.close.noSources'),
              },
            ],
            onSubmit: (v) =>
              act(
                'close',
                { rootCause: v.rootCause, solution: v.solution, sourceDocumentIds: v.sources },
                t('ticket.close.done'),
              )(),
          }),
        'btn-primary',
      ),
    );
  }
  return out;
}
