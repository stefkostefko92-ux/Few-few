// Качване на документ (§7.2/§7.3): PDF (текстът се извлича на сървъра, антивирус преди всичко)
// или JSON с вече извлечен текст по страници. Документът влиза като ЧЕРНОВА — AI не го вижда.
// Задължителните метаданни (валидност, изричен фърмуер, табло) — documents-meta.js.

import { getLang, t } from '../i18n.js';
import { ApiError, callDetailed, uploadRaw } from './core.js';
import { applicabilityRow, explain, validityFields } from './documents-meta.js';
import { loadProducts, repeater } from './kb-common.js';
import { checkbox, dialog, errText, field, h, input, select, toast } from './ui.js';

export const DOC_TYPES = [
  'MANUAL',
  'SCHEMATIC',
  'ERROR_LIST',
  'FAQ',
  'BULLETIN',
  'PROCEDURE',
  'SOLVED_CASE',
];
export const AUDIENCES = ['PORTAL', 'INTERNAL', 'ENGINEERING'];

export async function uploadDocument(reload) {
  let products = [];
  try {
    products = await loadProducts();
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  if (products.length === 0) {
    toast(t('admin.devices.needProduct'), 'warn');
    return;
  }
  const src = { pdf: null, pages: null, sourceFilename: '' };
  const file = input({ type: 'file', accept: '.pdf,application/pdf,.json,application/json' });
  const fileInfo = h('p', { class: 'hint', role: 'status' });
  const code = input({
    required: true,
    maxlength: 60,
    pattern: '[A-Za-z0-9._\\-]+',
    placeholder: 'MAN-500',
  });
  const title = input({ required: true, minlength: 2, maxlength: 200 });
  const type = select(
    DOC_TYPES.map((v) => ({ value: v, label: t(`admin.docType.${v}`) })),
    'MANUAL',
  );
  const language = input({
    required: true,
    maxlength: 2,
    minlength: 2,
    pattern: '[a-z]{2}',
    value: getLang(),
  });
  const revision = input({ required: true, maxlength: 20, placeholder: 'A' });
  const audience = select(
    AUDIENCES.map((v) => ({ value: v, label: t(`admin.audience.${v}`) })),
    'PORTAL',
  );
  const safety = checkbox(t('admin.docs.safety'));
  const supersedes = input({ maxlength: 20 });
  const subsystem = input({ maxlength: 60 });
  const validity = validityFields();
  const applicability = repeater({
    addLabel: t('admin.docs.addApplicability'),
    makeRow: () => applicabilityRow(products),
  });

  file.addEventListener('change', async () => {
    src.pdf = null;
    src.pages = null;
    fileInfo.textContent = '';
    const f = file.files[0];
    if (!f) return;
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      src.pdf = f;
      fileInfo.textContent = t('admin.docs.file.pdf', {
        name: f.name,
        mb: (f.size / 1048576).toFixed(1),
      });
      return;
    }
    try {
      const data = JSON.parse(await f.text());
      const pages = Array.isArray(data) ? data : data?.pages;
      if (!Array.isArray(pages) || pages.length === 0) throw new Error('pages');
      src.pages = pages;
      src.sourceFilename = (!Array.isArray(data) && data.sourceFilename) || f.name;
      if (!Array.isArray(data)) {
        for (const [el, key] of [
          [code, 'code'],
          [title, 'title'],
          [revision, 'revision'],
          [language, 'language'],
          [subsystem, 'subsystem'],
        ]) {
          if (typeof data[key] === 'string') el.value = data[key];
        }
        if (DOC_TYPES.includes(data.type)) type.value = data.type;
        if (AUDIENCES.includes(data.audience)) audience.value = data.audience;
        if (typeof data.safetyRelevant === 'boolean')
          safety.querySelector('input').checked = data.safetyRelevant;
      }
      fileInfo.textContent = t('admin.docs.file.json', { name: f.name, pages: pages.length });
    } catch {
      file.value = '';
      fileInfo.textContent = t('admin.docs.file.badJson');
    }
  });

  dialog({
    title: t('admin.docs.upload'),
    wide: true,
    body: [
      h('p', {}, t('admin.docs.upload.intro')),
      field(t('admin.docs.file'), file, { hint: t('admin.docs.file.hint') }),
      fileInfo,
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.docs.code'), code),
        field(t('admin.docs.revision'), revision),
      ),
      field(t('admin.docs.title'), title),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.docs.type'), type),
        field(t('admin.docs.audience'), audience),
      ),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.docs.language'), language),
        field(t('admin.docs.subsystem'), subsystem),
      ),
      safety,
      h('p', { class: 'hint' }, t('admin.docs.safety.hint')),
      validity.node,
      field(t('admin.docs.supersedes'), supersedes, { hint: t('admin.docs.supersedes.hint') }),
      h('h3', { class: 'sub' }, t('admin.docs.applicability')),
      h('p', { class: 'hint' }, t('admin.kb.applicability.hint')),
      applicability.node,
    ],
    actions: [
      {
        label: t('admin.docs.upload.go'),
        primary: true,
        onClick: async () => {
          if (!src.pdf && !src.pages) throw new ApiError(400, 'file_required');
          const meta = {
            code: code.value.trim(),
            title: title.value.trim(),
            type: type.value,
            language: language.value.trim(),
            revision: revision.value.trim(),
            audience: audience.value,
            safetyRelevant: safety.querySelector('input').checked,
            ...validity.read(),
            applicability: applicability.values(),
            ...(subsystem.value.trim() ? { subsystem: subsystem.value.trim() } : {}),
            ...(supersedes.value.trim() ? { supersedesRevision: supersedes.value.trim() } : {}),
          };
          let body;
          if (src.pdf) {
            fileInfo.textContent = t('admin.docs.uploading');
            const up = await uploadRaw(
              `/admin/attachments?name=${encodeURIComponent(src.pdf.name)}`,
              src.pdf,
            ).catch((err) => {
              err.extra = explain(err);
              throw err;
            });
            body = { ...meta, sourceAttachmentId: up.attachment.id };
          } else {
            body = { ...meta, pages: src.pages, sourceFilename: src.sourceFilename };
          }
          let res;
          try {
            res = await callDetailed('POST', '/admin/documents', body);
          } catch (err) {
            err.extra = explain(err);
            throw err;
          }
          toast(t('admin.docs.upload.done', { chunks: res.chunks }));
          reload();
          const blank = (res.warnings ?? []).map((w) => w.page);
          if (blank.length) {
            dialog({
              title: t('admin.docs.warn.title'),
              cancel: false,
              body: [h('p', {}, t('admin.docs.warn.text', { pages: blank.join(', ') }))],
              actions: [{ label: t('common.close'), primary: true }],
            });
          }
        },
      },
    ],
  });
}
