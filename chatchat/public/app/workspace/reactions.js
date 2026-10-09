// Реакции (§13.1, незадължителни; никога доказателство): фиксиран набор имена от сървъра.
// Всяка носи знак И текст — смисълът не е само в цвят или емотикон.

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { state } from '../store.js';

export const REACTIONS = [
  ['like', '▲'],
  ['dislike', '▼'],
  ['done', '✓'],
  ['seen', '◉'],
  ['warning', '!'],
  ['question', '?'],
  ['thanks', '♥'],
];
const GLYPH = new Map(REACTIONS);

/** Обобщение под съобщението: бутон-чип на реакция, натиснат ако е моя. */
export function reactionChips(message, onToggle) {
  const list = Array.isArray(message.reactions) ? message.reactions : [];
  if (list.length === 0) return null;
  return h(
    'ul',
    { class: 'react-list', 'aria-label': t('react.label') },
    list.map((r) => {
      const mine = r.userIds.includes(state.user?.id);
      return h(
        'li',
        null,
        h(
          'button',
          {
            class: 'react-chip',
            type: 'button',
            'aria-pressed': String(mine),
            'aria-label': t('react.chipLabel', { name: t(`react.${r.reaction}`), count: r.count }),
            onclick: () => onToggle(r.reaction, !mine),
          },
          h('span', { 'aria-hidden': 'true' }, GLYPH.get(r.reaction) ?? '•'),
          ` ${t(`react.${r.reaction}`)} `,
          h('b', null, String(r.count)),
        ),
      );
    }),
  );
}

/** Палитра за добавяне на реакция (показва се от бутона „Реагирай“). */
export function reactionPalette(message, onToggle) {
  const mineNow = new Set(
    (message.reactions ?? [])
      .filter((r) => r.userIds.includes(state.user?.id))
      .map((r) => r.reaction),
  );
  return h(
    'div',
    { class: 'react-palette', role: 'group', 'aria-label': t('react.add') },
    REACTIONS.map(([name, glyph]) =>
      h(
        'button',
        {
          class: 'btn btn-secondary btn-sm',
          type: 'button',
          'aria-pressed': String(mineNow.has(name)),
          onclick: () => onToggle(name, !mineNow.has(name)),
        },
        h('span', { 'aria-hidden': 'true' }, glyph),
        ` ${t(`react.${name}`)}`,
      ),
    ),
  );
}
