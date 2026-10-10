// Задължителните метаданни при качване (§7.2): правило за приложимост с ИЗРИЧЕН фърмуер
// („всички версии“ или обхват — никога мълчаливо празно) и по избор КОНКРЕТНО табло (сериен
// номер — уникалната схема на таблото), плюс датите на валидност. Сървърът проверява наново.

import { t } from '../i18n.js';
import { endOfDayIso, todayInput } from './core.js';
import { VERSION_PATTERN } from './kb-common.js';
import { checkbox, field, h, input, select } from './ui.js';

/** Подробности към кода на грешката: кои полета, кои модели/табла, защо PDF не се чете. */
export function explain(err) {
  const b = err?.body;
  if (!b || typeof b !== 'object') return '';
  if (Array.isArray(b.issues) && b.issues.length) {
    return `(${b.issues
      .map((i) => i.path)
      .filter(Boolean)
      .slice(0, 6)
      .join(', ')})`;
  }
  if (Array.isArray(b.models) && b.models.length) return `(${b.models.join(', ')})`;
  if (Array.isArray(b.serials) && b.serials.length) return `(${b.serials.join(', ')})`;
  if (typeof b.reason === 'string') return `(${t(`admin.docs.pdfReason.${b.reason}`)})`;
  return '';
}

/** Ред „модел · HW · FW (всички | обхват) · табло“ за `repeater` от kb-common. */
export function applicabilityRow(products) {
  const model = select(
    products.map((p) => ({ value: p.model, label: p.model })),
    products[0]?.model ?? '',
  );
  const hw = input({ maxlength: 20, placeholder: t('admin.docs.hwAny') });
  const all = checkbox(t('admin.kb.fwAllLabel'), { checked: true });
  const allBox = all.querySelector('input');
  const min = input({
    pattern: VERSION_PATTERN,
    maxlength: 20,
    placeholder: '4.0',
    disabled: true,
  });
  const max = input({
    pattern: VERSION_PATTERN,
    maxlength: 20,
    placeholder: '4.9',
    disabled: true,
  });
  allBox.addEventListener('change', () => {
    min.disabled = allBox.checked;
    max.disabled = allBox.checked;
    min.required = !allBox.checked && !max.value.trim();
    if (allBox.checked) {
      min.value = '';
      max.value = '';
    }
  });
  max.addEventListener('input', () => {
    min.required = !allBox.checked && !max.value.trim();
  });
  const serial = input({ maxlength: 80, placeholder: t('admin.kb.board.placeholder') });
  const node = h(
    'div',
    { class: 'row row-4 kb-rule' },
    field(t('admin.devices.model'), model),
    field(t('admin.devices.hw'), hw),
    field(t('admin.products.fwMin'), min),
    field(t('admin.products.fwMax'), max),
    h(
      'div',
      { class: 'kb-rule-extra' },
      all,
      field(t('admin.kb.board.label'), serial, { hint: t('admin.kb.board.hint') }),
    ),
  );
  return {
    node,
    read: () => ({
      productModel: model.value,
      ...(hw.value.trim() ? { hwRevision: hw.value.trim() } : {}),
      ...(allBox.checked
        ? { allFirmware: true }
        : {
            ...(min.value.trim() ? { fwMin: min.value.trim() } : {}),
            ...(max.value.trim() ? { fwMax: max.value.trim() } : {}),
          }),
      ...(serial.value.trim() ? { deviceSerial: serial.value.trim() } : {}),
    }),
  };
}

/** Датите на валидност: „в сила от“ (задължително, днес по подразбиране) и „до“ (по избор). */
export function validityFields() {
  const from = input({ type: 'date', required: true, value: todayInput() });
  const to = input({ type: 'date' });
  const startOfDayIso = (d) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day, 0, 0, 0).toISOString();
  };
  return {
    node: h(
      'div',
      { class: 'field-row' },
      field(t('admin.kb.effectiveFrom'), from),
      field(t('admin.kb.effectiveTo'), to, { hint: t('admin.kb.effectiveTo.hint') }),
    ),
    read: () => ({
      effectiveFrom: startOfDayIso(from.value),
      ...(to.value ? { effectiveTo: endOfDayIso(to.value) } : {}),
    }),
  };
}
