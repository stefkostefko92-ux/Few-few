// Рендер на структурирания отговор (DiagnosticAnswer). Само textContent/createTextNode —
// никога innerHTML. Критичното (Safety, „richiede conferma“) носи икона и текст, не само цвят.

import { h } from './dom.js';
import { t, tCode, tMaybeCode } from './i18n.js';

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function icon(kind) {
  // kind: warn | stop | info — формата различава, не само цветът
  return h(
    'span',
    { class: `ico ico-${kind}`, 'aria-hidden': 'true' },
    kind === 'stop' ? '×' : kind === 'warn' ? '!' : 'i',
  );
}

function block(title, className, ...body) {
  return h(
    'section',
    { class: `blk ${className ?? ''}`.trim() },
    title ? h('h3', { class: 'blk-title' }, title) : null,
    ...body,
  );
}

export function answerSummaryText(payload) {
  return str(tMaybeCode(payload?.summary));
}

export function renderAnswer(message, { onOpenSource, onOpenTicket, onFeedback, rated }) {
  const p = message.payload;
  const root = h('article', { class: 'msg msg-ai', 'data-message-id': message.id });

  root.append(
    h(
      'header',
      { class: 'msg-head' },
      h(
        'span',
        { class: 'ai-tag' },
        h('span', { class: 'ai-tag-mark', 'aria-hidden': 'true' }, 'AI'),
        t('ai.label'),
      ),
      h('span', { class: 'ai-note' }, t('ai.note')),
    ),
  );

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

  // 1) Safety blocked — най-видимото нещо в отговора
  if (safety.level === 'blocked') {
    root.append(
      h(
        'section',
        { class: 'safety safety-blocked' },
        icon('stop'),
        h(
          'div',
          { class: 'safety-main' },
          h('h3', { class: 'safety-title' }, t('ans.safety.blocked')),
          notes.length
            ? h(
                'ul',
                { class: 'plain' },
                notes.map((n) => h('li', null, n)),
              )
            : null,
        ),
      ),
    );
  }

  // 2) Esito + Confidenza
  const statusKey = `ans.outcome.${p.status}`;
  root.append(
    h(
      'section',
      { class: 'blk blk-outcome' },
      h(
        'div',
        { class: 'outcome-row' },
        h(
          'h3',
          { class: 'outcome-status' },
          t('ans.outcome'),
          ': ',
          t(statusKey) === statusKey ? str(p.status) : t(statusKey),
        ),
        h(
          'p',
          { class: `conf conf-${str(p.confidence)}` },
          h('span', { class: 'conf-meter', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
          t('ans.confidence'),
          ': ',
          h(
            'strong',
            null,
            t(`ans.conf.${p.confidence}`) === `ans.conf.${p.confidence}`
              ? str(p.confidence)
              : t(`ans.conf.${p.confidence}`),
          ),
        ),
      ),
      p.summary ? h('p', { class: 'summary' }, str(tMaybeCode(p.summary))) : null,
      p.confidenceReason ? h('p', { class: 'reason' }, str(tMaybeCode(p.confidenceReason))) : null,
    ),
  );

  // 3) Cause
  const causes = arr(p.causes);
  if (causes.length) {
    root.append(
      block(
        t('ans.causes'),
        'blk-causes',
        h(
          'ul',
          { class: 'plain' },
          causes.map((c) => h('li', null, str(c.text), ' ', refs(c.evidenceRefs))),
        ),
      ),
    );
  }

  // 4) Safety caution / note standard
  if (safety.level === 'caution') {
    root.append(
      h(
        'section',
        { class: 'safety safety-caution' },
        icon('warn'),
        h(
          'div',
          { class: 'safety-main' },
          h('h3', { class: 'safety-title' }, t('ans.safety.caution')),
          notes.length
            ? h(
                'ul',
                { class: 'plain' },
                notes.map((n) => h('li', null, n)),
              )
            : null,
        ),
      ),
    );
  } else if (safety.level === 'standard' && notes.length) {
    root.append(
      block(
        t('ans.safety'),
        'blk-safety',
        h(
          'ul',
          { class: 'plain' },
          notes.map((n) => h('li', null, n)),
        ),
      ),
    );
  }

  // 5) Controlli
  const checks = arr(p.checks);
  if (checks.length) {
    root.append(
      block(
        t('ans.checks'),
        'blk-checks',
        h(
          'ol',
          { class: 'checks' },
          checks.map((c, i) => {
            const critical =
              c.actionClass === 'SAFETY_RELEVANT' || c.actionClass === 'DIRECT_COMMAND';
            const tagKey = `ans.class.${c.actionClass}`;
            const tags = [];
            if (c.actionClass === 'SAFETY_RELEVANT' || c.actionClass === 'DIRECT_COMMAND') {
              tags.push(h('span', { class: 'tag tag-warn' }, icon('warn'), t(tagKey)));
            } else if (c.actionClass === 'CONFIGURATIVE') {
              tags.push(h('span', { class: 'tag tag-config' }, t(tagKey)));
            }
            if (c.requiresConfirmation) {
              tags.push(
                h(
                  'span',
                  { class: 'tag tag-confirm' },
                  h('span', { class: 'tick', 'aria-hidden': 'true' }),
                  t('ans.needsConfirm'),
                ),
              );
            }
            return h(
              'li',
              { class: `check${critical ? ' check-critical' : ''}`, value: c.step ?? i + 1 },
              tags.length ? h('div', { class: 'tags' }, tags) : null,
              h('p', { class: 'check-action' }, str(c.action), ' ', refs(c.evidenceRefs)),
              h(
                'p',
                { class: 'check-expected' },
                h('strong', null, t('ans.expected'), ': '),
                str(c.expected),
              ),
            );
          }),
        ),
      ),
    );
  }

  // 6) Decision point
  const dps = arr(p.decisionPoints);
  if (dps.length) {
    root.append(
      block(
        t('ans.decisions'),
        'blk-decisions',
        h(
          'ul',
          { class: 'plain decisions' },
          dps.map((d) =>
            h(
              'li',
              null,
              h('strong', null, t('ans.if'), ' '),
              str(d.condition),
              h('span', { class: 'arrow', 'aria-label': t('ans.then') }, ' → '),
              str(d.then),
            ),
          ),
        ),
      ),
    );
  }

  // 7) Fonti
  if (evidence.length) {
    root.append(
      block(
        t('ans.sources'),
        'blk-sources',
        h(
          'ul',
          { class: 'sources' },
          evidence.map((e) => {
            const canOpen = e.documentId && e.page != null;
            return h(
              'li',
              { class: 'source' },
              h('span', { class: 'ref-badge ref-badge-static' }, str(e.ref)),
              h(
                'div',
                { class: 'source-main' },
                h(
                  'p',
                  { class: 'source-id' },
                  h('strong', { class: 'mono' }, str(e.documentCode)),
                  e.revision ? ` · ${t('ans.rev')} ${str(e.revision)}` : '',
                  e.page != null ? ` · ${t('ans.page')} ${str(e.page)}` : '',
                  e.kind
                    ? ` · ${t(`ans.kind.${e.kind}`) === `ans.kind.${e.kind}` ? str(e.kind) : t(`ans.kind.${e.kind}`)}`
                    : '',
                ),
                e.documentTitle ? h('p', { class: 'source-title' }, str(e.documentTitle)) : null,
                e.section ? h('p', { class: 'source-section' }, str(e.section)) : null,
                e.quote ? h('blockquote', { class: 'quote' }, str(e.quote)) : null,
                canOpen
                  ? h(
                      'button',
                      {
                        class: 'btn btn-secondary btn-sm',
                        type: 'button',
                        onclick: () => onOpenSource(e),
                      },
                      t('ans.openPage'),
                      ` ${t('ans.page')} ${e.page}`,
                    )
                  : h('p', { class: 'muted small' }, t('ans.noPage')),
              ),
            );
          }),
        ),
      ),
    );
  }

  // 8) Dati mancanti
  const missing = arr(p.missingData);
  if (missing.length) {
    root.append(
      block(
        t('ans.missing'),
        'blk-missing',
        h(
          'ul',
          { class: 'plain' },
          missing.map((m) => h('li', null, str(tCode(m)))),
        ),
      ),
    );
  }

  // 9) Conflitti
  const conflicts = arr(p.conflicts);
  if (conflicts.length) {
    root.append(
      block(
        t('ans.conflicts'),
        'blk-conflicts',
        h(
          'ul',
          { class: 'plain' },
          conflicts.map((c) => h('li', null, str(tMaybeCode(c.description)), ' ', refs(c.refs))),
        ),
      ),
    );
  }

  // 10) Escalation
  const esc = p.escalation;
  if (esc && esc.recommended) {
    const reason = str(tMaybeCode(esc.reason));
    const collect = arr(esc.collect);
    root.append(
      h(
        'section',
        { class: 'blk blk-escalation' },
        h('h3', { class: 'blk-title' }, t('ans.escalation')),
        h(
          'p',
          null,
          h('strong', null, t('ans.escalation.recommended')),
          reason ? ` ${reason}` : '',
        ),
        collect.length
          ? h(
              'div',
              null,
              h('p', { class: 'sub' }, t('ans.collect')),
              h(
                'ul',
                { class: 'plain' },
                collect.map((c) => h('li', null, str(tCode(c)))),
              ),
            )
          : null,
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => onOpenTicket(reason) },
          t('ans.openTicket'),
        ),
      ),
    );
  }

  // Dettagli del Safety Gate (trasparenza, chiuso di default)
  const gate = p.gate;
  if (gate) {
    const removed = arr(gate.removedSteps);
    const dropped = arr(gate.droppedCitations);
    const decisions = arr(gate.decisions);
    if (removed.length || dropped.length || decisions.length || gate.evidenceLevel) {
      const levelKey = `ans.level.${gate.evidenceLevel}`;
      root.append(
        h(
          'details',
          { class: 'gate-details' },
          h('summary', null, t('ans.details')),
          gate.evidenceLevel
            ? h(
                'p',
                null,
                h('strong', null, t('ans.evidenceLevel'), ': '),
                t(levelKey) === levelKey ? str(gate.evidenceLevel) : t(levelKey),
              )
            : null,
          decisions.length
            ? h(
                'div',
                null,
                h('p', { class: 'sub' }, t('ans.gateDecisions')),
                h(
                  'ul',
                  { class: 'plain' },
                  decisions.map((d) => h('li', null, tCode(str(d)))),
                ),
              )
            : null,
          removed.length
            ? h(
                'div',
                null,
                h('p', { class: 'sub' }, t('ans.removedSteps')),
                h(
                  'ul',
                  { class: 'plain' },
                  removed.map((r) => h('li', null, `${str(r.step)} — ${tCode(str(r.reason))}`)),
                ),
              )
            : null,
          dropped.length
            ? h(
                'div',
                null,
                h('p', { class: 'sub' }, t('ans.droppedCitations')),
                h(
                  'ul',
                  { class: 'plain' },
                  dropped.map((r) => h('li', null, `${str(r.ref)} — ${tCode(str(r.reason))}`)),
                ),
              )
            : null,
          h(
            'p',
            { class: 'muted small mono' },
            `${t('ans.snapshot')}: ${str(p.knowledgeSnapshotId)} · ${t('ans.prompt')}: ${str(p.promptVersion)}`,
          ),
        ),
      );
    }
  }

  root.append(feedbackRow(message, onFeedback, rated));
  return root;
}

function feedbackRow(message, onFeedback, rated) {
  const titleId = `fb-${message.id}`;
  const status = h('p', { class: 'fb-status', role: 'status' });
  const buttons = [];
  const make = (rating, key) => {
    const done = rated ? rated(message.id) : null;
    const b = h(
      'button',
      {
        type: 'button',
        'aria-pressed': done === rating ? 'true' : 'false',
        disabled: done ? true : null,
        class: `btn btn-secondary btn-fb${done === rating ? ' is-chosen' : ''}`,
        onclick: async () => {
          buttons.forEach((x) => (x.disabled = true));
          status.textContent = '';
          try {
            await onFeedback(message.id, rating);
            b.setAttribute('aria-pressed', 'true');
            b.classList.add('is-chosen');
            status.textContent = t('fb.thanks');
          } catch {
            buttons.forEach((x) => (x.disabled = false));
            status.textContent = t('fb.error');
          }
        },
      },
      t(key),
    );
    buttons.push(b);
    return b;
  };
  const result = h(
    'div',
    { class: 'feedback', role: 'group', 'aria-labelledby': titleId },
    h('p', { id: titleId, class: 'fb-title' }, t('fb.title')),
    h(
      'div',
      { class: 'fb-buttons' },
      make('USEFUL', 'fb.useful'),
      make('NOT_USEFUL', 'fb.notUseful'),
      make('TECHNICAL_ERROR', 'fb.techError'),
    ),
    status,
  );
  if (rated && rated(message.id)) status.textContent = t('fb.thanks');
  return result;
}
