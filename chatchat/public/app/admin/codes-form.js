// Код за грешка (FR-04): нов (DRAFT) или редакция на ЧЕРНОВА. Всеки код сочи ДОКУМЕНТ-ИЗТОЧНИК;
// AI го вижда едва след публикуване (преглед → четири очи за безопасност), а публикуването иска
// публикуван източник. Публикуваната версия не се редактира — „Нова версия“ я копира като чернова.

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

function relationRow(init = {}) {
  const kind = select(
    KINDS.map((k) => ({ value: k, label: t(`admin.codes.kind.${k}`) })),
    init.kind ?? 'CAUSE',
  );
  const text = textarea({ rows: 2, required: true, maxlength: 1000 });
  text.value = init.text ?? '';
  const expected = input({ maxlength: 400, value: init.expected ?? '' });
  const cls = select(
    ACTION_CLASSES.map((k) => ({ value: k, label: t(`admin.actionClass.${k}`) })),
    init.actionClass ?? 'INFORMATIVE',
  );
  const page = input({ type: 'number', min: 1, max: 100000, value: init.sourcePage ?? '' });
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

/**
 * Формата: `entry` (редакция) я попълва и заключва модела/кода (идентичността на версията);
 * без него — нов код. `save(body)` праща заявката.
 */
function codeDialog({ products, docs, entry, title, submitLabel, save }) {
  const model = select(
    products.map((p) => ({ value: p.model, label: p.model })),
    entry?.productModel ?? products[0].model,
    { disabled: entry ? true : undefined },
  );
  const code = input({
    required: true,
    maxlength: 20,
    placeholder: 'E37',
    value: entry?.code ?? '',
  });
  if (entry) code.readOnly = true;
  const title_ = input({ required: true, minlength: 2, maxlength: 200, value: entry?.title ?? '' });
  const description = textarea({ rows: 3, required: true, minlength: 2, maxlength: 4000 });
  description.value = entry?.description ?? '';
  const subsystem = input({ maxlength: 60, value: entry?.subsystem ?? '' });
  const severity = select(
    SEVERITIES.map((s) => ({ value: s, label: t(`admin.severity.${s}`) })),
    entry?.severity ?? 'FAULT',
  );
  const safety = checkbox(t('admin.codes.safety'), { checked: entry?.safetyRelevant || undefined });
  const hw = input({ maxlength: 20, value: entry?.hwRevision ?? '' });
  const fwMin = input({ pattern: VERSION_PATTERN, maxlength: 20, value: entry?.fwMin ?? '' });
  const fwMax = input({ pattern: VERSION_PATTERN, maxlength: 20, value: entry?.fwMax ?? '' });
  // Само документи, които важат за модела на кода (сървърът го проверява: source_not_applicable).
  const source = select([], '');
  const syncSources = () => {
    const usable = docs.filter(
      (d) => !d.applicability || d.applicability.some((a) => a.productModel === model.value),
    );
    const keep = source.value || entry?.sourceDocument?.id;
    source.replaceChildren(
      ...usable.map((d) =>
        h('option', { value: d.id, selected: d.id === keep || undefined }, docLabel(d)),
      ),
    );
  };
  model.addEventListener('change', syncSources);
  syncSources();
  const page = input({ type: 'number', min: 1, max: 100000, value: entry?.sourcePage ?? '' });
  const initial = entry?.relations ?? [];
  const rows = initial.slice();
  const relations = repeater({
    addLabel: t('admin.codes.addRelation'),
    makeRow: () => relationRow(rows.shift()),
    min: 0,
    max: 40,
    initial: initial.length,
  });
  const opt = (v) => (v.value.trim() ? v.value.trim() : undefined);
  dialog({
    title,
    wide: true,
    body: [
      entry ? h('p', { class: 'note' }, t('admin.err.edit.note')) : null,
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.devices.model'), model),
        field(t('admin.codes.code'), code),
      ),
      field(t('admin.codes.title'), title_),
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
        label: submitLabel,
        primary: true,
        onClick: () =>
          save({
            productModel: model.value,
            code: code.value.trim(),
            title: title_.value.trim(),
            description: description.value.trim(),
            severity: severity.value,
            safetyRelevant: safety.querySelector('input').checked,
            sourceDocumentId: source.value,
            relations: relations.values(),
            subsystem: opt(subsystem),
            hwRevision: opt(hw),
            fwMin: opt(fwMin),
            fwMax: opt(fwMax),
            sourcePage: page.value ? Number(page.value) : undefined,
          }),
      },
    ],
  });
}

async function loadSources() {
  const [products, docs] = await Promise.all([
    loadProducts(),
    call('GET', '/admin/documents?status=PUBLISHED').then((r) => r.documents),
  ]);
  return { products, docs };
}

export async function newCode(reload) {
  let src;
  try {
    src = await loadSources();
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  if (src.products.length === 0 || src.docs.length === 0) {
    toast(t('admin.codes.needSource'), 'warn');
    return;
  }
  codeDialog({
    ...src,
    title: t('admin.codes.new'),
    submitLabel: t('admin.codes.create'),
    save: async (body) => {
      const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
      await call('POST', '/admin/errors', clean);
      toast(t('admin.codes.created', { code: body.code }));
      reload();
    },
  });
}

/** Редакция на ЧЕРНОВА (PATCH): празно незадължително поле изчиства стойността (null). */
export async function editCode(entry, reload) {
  let src;
  try {
    src = await loadSources();
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  // Източникът на черновата може още да не е публикуван — остава избираем.
  const docs = src.docs.some((d) => d.id === entry.sourceDocument?.id)
    ? src.docs
    : [...(entry.sourceDocument ? [{ ...entry.sourceDocument, title: '' }] : []), ...src.docs];
  if (docs.length === 0) {
    toast(t('admin.codes.needSource'), 'warn');
    return;
  }
  codeDialog({
    ...src,
    docs,
    entry,
    title: t('admin.err.edit.title', { code: entry.code, version: entry.version }),
    submitLabel: t('admin.err.edit.save'),
    save: async ({ productModel: _m, code: _c, ...body }) => {
      const patch = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v ?? null]));
      await call('PATCH', `/admin/errors/${encodeURIComponent(entry.id)}`, patch);
      toast(t('admin.err.edit.done', { code: entry.code }));
      reload();
    },
  });
}
