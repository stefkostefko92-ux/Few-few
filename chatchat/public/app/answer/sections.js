// Резултат и увереност, причини, точки за решение, липсващи данни, конфликти, ескалация.

import { h } from '../dom.js';
import { t, tCode, tMaybeCode } from '../i18n.js';
import { arr, block, str } from './util.js';

export function appendOutcome(root, { p }) {
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
}

export function appendCauses(root, { p, refs }) {
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
}

export function appendDecisions(root, { p }) {
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
}

export function appendMissing(root, { p }) {
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
}

export function appendConflicts(root, { p, refs }) {
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
}

export function appendEscalation(root, { p, onOpenTicket }) {
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
}
