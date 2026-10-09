// Блоковете за безопасност (Safety Gate): „блокирано“ е най-видимото нещо в отговора;
// „внимание“ и стандартните бележки са по-тихи. Иконата и текстът носят смисъла, не само цветът.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { arr, block, icon } from './util.js';

export function appendBlocked(root, { safety, notes }) {
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
}

export function appendCaution(root, { safety, notes }) {
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
}
