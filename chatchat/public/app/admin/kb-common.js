// Общото за секциите на знанието (kb:manage): жизнен цикъл, статуси, повтаряеми редове, продукти.

import { t } from '../i18n.js';
import { call } from './core.js';
import { badge, button, h } from './ui.js';

/** Версия на фърмуер „4.2.1“ (до 4 числа) — същото правило като на сървъра. */
export const VERSION_PATTERN = '\\d+(\\.\\d+){0,3}';

const STATUS_KIND = { DRAFT: 'idle', REVIEW: 'warn', PUBLISHED: 'ok', DEPRECATED: 'stop' };

export const statusBadge = (status) =>
  badge(STATUS_KIND[status] ?? 'idle', t(`admin.status.${status}`));

const STEPS = ['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED'];

/**
 * Жизненият цикъл (§4.1/§7.3) като последователност: Чернова → Преглед → Публикуван → Отписан.
 * Текущата стъпка е означена с текст и aria-current, не само с цвят.
 */
export function lifecycle(status) {
  const at = STEPS.indexOf(status);
  return h(
    'ol',
    { class: 'steps', 'aria-label': t('admin.status.lifecycle') },
    ...STEPS.map((s, i) => {
      const li = h(
        'li',
        { class: `step${i < at ? ' step-done' : ''}${i === at ? ' step-now' : ''}` },
        h('span', { class: 'step-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'step-text' }, t(`admin.status.${s}`)),
      );
      if (i === at) li.setAttribute('aria-current', 'step');
      return li;
    }),
  );
}

/**
 * Повтаряеми редове (ревизии, връзки, обхват): makeRow() връща {node, read()}; read() дава
 * стойността или null за празен ред. Минимум `min` реда, махането е с бутон.
 */
export function repeater({ addLabel, removeLabel, makeRow, min = 1, max = 50, initial = min }) {
  const list = h('div', { class: 'rows' });
  const rows = [];
  const add = button(addLabel, () => addRow(), { small: true });
  const sync = () => {
    add.disabled = rows.length >= max;
    for (const r of rows) r.remove.hidden = rows.length <= min;
  };
  function addRow() {
    const row = makeRow();
    const remove = button(
      removeLabel ?? t('admin.remove'),
      () => {
        rows.splice(rows.indexOf(entry), 1);
        row.node.remove();
        sync();
      },
      { small: true, class: 'row-remove' },
    );
    const entry = { read: row.read, remove };
    row.node.append(remove);
    rows.push(entry);
    list.append(row.node);
    sync();
  }
  for (let i = 0; i < initial; i += 1) addRow();
  return {
    node: h('div', { class: 'repeater' }, list, add),
    values: () => rows.map((r) => r.read()).filter((v) => v !== null),
  };
}

/** Продуктите на клиента с ревизиите им (за падащи списъци). */
export async function loadProducts() {
  return (await call('GET', '/admin/products')).products;
}
