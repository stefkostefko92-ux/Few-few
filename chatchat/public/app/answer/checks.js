// Проверките (стъпките) с клас на действие и нужда от потвърждение.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { arr, block, icon, str } from './util.js';

export function appendChecks(root, { p, refs }) {
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
}
