// Бързият превключвател на мобилно (§12.3 „selettore rapido“): непрочетените разговори първо,
// после последните случаи. Един активен изглед — без припокриващи се прозорци.

import { $, clear, h } from '../dom.js';
import { t } from '../i18n.js';
import { state } from '../store.js';
import { conversationsByActivity } from './model.js';
import { conversationItem } from './sidebar.js';

/**
 * @param {{ openConversation: (id: string) => unknown, openCase: (id: string) => unknown }} nav
 */
export function openSwitcher(nav) {
  const ul = clear($('#switch-list'));
  const close = () => $('#dlg-switch').close();
  const convs = conversationsByActivity((c) => c.member !== false && c.type !== 'CASE').sort(
    (a, b) => (b.unread > 0) - (a.unread > 0),
  );
  for (const c of convs.slice(0, 20)) {
    ul.append(
      h(
        'li',
        null,
        conversationItem(c, {
          active: false,
          onOpen: (id) => (close(), void nav.openConversation(id)),
        }),
      ),
    );
  }
  for (const c of state.cases.slice(0, 8)) {
    ul.append(
      h(
        'li',
        null,
        h(
          'button',
          {
            class: 'conv-item',
            type: 'button',
            onclick: () => (close(), void nav.openCase(c.id)),
          },
          h(
            'span',
            { class: 'conv-title-text mono' },
            `${c.number} · ${c.context?.productModel ?? ''}`,
          ),
        ),
      ),
    );
  }
  if (!ul.children.length) ul.append(h('li', { class: 'muted' }, t('history.empty')));
  $('#dlg-switch').showModal();
}
