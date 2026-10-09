// Подробности за Safety Gate (прозрачност; затворени по подразбиране).

import { h } from '../dom.js';
import { t, tCode } from '../i18n.js';
import { arr, str } from './util.js';

export function appendGateDetails(root, { p }) {
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
}
