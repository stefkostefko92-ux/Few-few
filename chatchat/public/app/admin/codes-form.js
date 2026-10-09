// Нов код за грешка (FR-04). Всеки код сочи ДОКУМЕНТ-ИЗТОЧНИК; AI го вижда едва след публикуване,
// а публикуването иска публикуван източник.

import { t } from '../i18n.js';
import { call } from './core.js';
import { loadProducts, repeater, VERSION_PATTERN } from './kb-common.js';
import { checkbox, dialog, errText, field, h, input, select, textarea, toast } from './ui.js';

export const SEVERITIES = ['INFO', 'WARNING', 'FAULT', 'CRITICAL'];
export const KINDS = ['SYMPTOM', 'CAUSE', 'CHECK', 'FIX'];
export const ACTION_CLASSES = [
  'INFORMATIVE',
  'DIAGNOSTIC',
  'CONFIGURATIVE',
  'SAFETY_RELEVANT',
  'DIRECT_COMMAND',
];

export const docLabel = (d) => `${d.code} · ${d.revision} — ${d.title}`;

function relationRow() {
  const kind = select(
    KINDS.map((k) => ({ value: k, label: t(`admin.codes.kind.${k}`) })),
    'CAUSE',
  );
  const text = textarea({ rows: 2, required: true, maxlength: 1000 });
  const expected = input({ maxlength: 400 });
  const cls = select(
    ACTION_CLASSES.map((k) => ({ value: k, label: t(`admin.actionClass.${k}`) })),
    'INFORMATIVE',
  );
  const page = input({ type: 'number', min: 1, max: 100000 });
  const node = h(
    'div',
    { class: 'row row-rel' },
    field(t('admin.codes.rel.kind'), kind),
    field(t('admin.codes.rel.text'), text),
    field(t('admin.codes.rel.expected'), expected),
    field(t('admin.codes.rel.class'), cls),
    field(t('admin.codes.rel.page'), page),
  );
  return {
    node,
    read: () => ({
      kind: kind.value,
      text: text.value.trim(),
      ...(expected.value.trim() ? { expected: expected.value.trim() } : {}),
      actionClass: cls.value,
      ...(page.value ? { sourcePage: Number(page.value) } : {}),
    }),
  };
}

export async function newCode(reload) {
  let products = [];
  let docs = [];
  try {
    [products, docs] = await Promise.all([
      loadProducts(),
      call('GET', '/admin/documents?status=PUBLISHED').then((r) => r.documents),
    ]);
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  if (products.length === 0 || docs.length === 0) {
    toast(t('admin.codes.needSource'), 'warn');
    return;
  }
  const model = select(
    products.map((p) => ({ value: p.model, label: p.model })),
    products[0].model,
  );
  const code = input({ required: true, maxlength: 20, placeholder: 'E37' });
  const title = input({ required: true, minlength: 2, maxlength: 200 });
  const description = textarea({ rows: 3, required: true, minlength: 2, maxlength: 4000 });
  const subsystem = input({ maxlength: 60 });
  const severity = select(
    SEVERITIES.map((s) => ({ value: s, label: t(`admin.severity.${s}`) })),
    'FAULT',
  );
  const safety = checkbox(t('admin.codes.safety'));
  const hw = input({ maxlength: 20 });
  const fwMin = input({ pattern: VERSION_PATTERN, maxlength: 20 });
  const fwMax = input({ pattern: VERSION_PATTERN, maxlength: 20 });
  const source = select(
    docs.map((d) => ({ value: d.id, label: docLabel(d) })),
    docs[0].id,
  );
  const page = input({ type: 'number', min: 1, max: 100000 });
  const relations = repeater({
    addLabel: t('admin.codes.addRelation'),
    makeRow: relationRow,
    min: 0,
    max: 40,
    initial: 0,
  });

  dialog({
    title: t('admin.codes.new'),
    wide: true,
    body: [
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.devices.model'), model),
        field(t('admin.codes.code'), code),
      ),
      field(t('admin.codes.title'), title),
      field(t('admin.codes.description'), description),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.codes.severity'), severity),
        field(t('admin.docs.subsystem'), subsystem),
      ),
      safety,
      h(
        'div',
        { class: 'field-row row-3' },
        field(t('admin.codes.hw'), hw),
        field(t('admin.products.fwMin'), fwMin),
        field(t('admin.products.fwMax'), fwMax),
      ),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.codes.source'), source, { hint: t('admin.codes.source.hint') }),
        field(t('admin.codes.sourcePage'), page),
      ),
      h('h3', { class: 'sub' }, t('admin.codes.relations')),
      h('p', { class: 'hint' }, t('admin.codes.relations.hint')),
      relations.node,
    ],
    actions: [
      {
        label: t('admin.codes.create'),
        primary: true,
        onClick: async () => {
          await call('POST', '/admin/errors', {
            productModel: model.value,
            code: code.value.trim(),
            title: title.value.trim(),
            description: description.value.trim(),
            severity: severity.value,
            safetyRelevant: safety.querySelector('input').checked,
            sourceDocumentId: source.value,
            relations: relations.values(),
            ...(subsystem.value.trim() ? { subsystem: subsystem.value.trim() } : {}),
            ...(hw.value.trim() ? { hwRevision: hw.value.trim() } : {}),
            ...(fwMin.value.trim() ? { fwMin: fwMin.value.trim() } : {}),
            ...(fwMax.value.trim() ? { fwMax: fwMax.value.trim() } : {}),
            ...(page.value ? { sourcePage: Number(page.value) } : {}),
          });
          toast(t('admin.codes.created', { code: code.value.trim() }));
          reload();
        },
      },
    ],
  });
}
