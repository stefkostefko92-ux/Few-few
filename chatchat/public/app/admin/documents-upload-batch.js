// Пакетно качване (§4.1 „importazione batch“): много файлове наведнъж с общи метаданни (продукт/
// табло/фърмуер, език, вид, валидност…) и по избор манифест (CSV/JSON) с различни метаданни по
// файл. Всеки файл: антивирус при качването → опашката (текст, OCR, DOCX/XLSX, логове) → ЧЕРНОВА.
// Напредъкът е по файл (polling на пакета); провал на един файл не спира другите.

import { getLang, t } from '../i18n.js';
import { explain, applicabilityRow, validityFields } from './documents-meta.js';
import { AUDIENCES, DOC_TYPES } from './documents-upload.js';
import {
  ACCEPT_FILES,
  createBatch,
  ingestErrText,
  isFinal,
  MAX_FILE_BYTES,
  resultText,
  retryItem,
  sendFile,
  statusText,
  warningTexts,
  watchBatch,
} from './documents-upload-queue.js';
import { loadProducts, repeater } from './kb-common.js';
import {
  button,
  checkbox,
  clear,
  dataTable,
  dialog,
  errText,
  field,
  h,
  input,
  lock,
  select,
  toast,
} from './ui.js';

/** Редовете на таблицата: файлът и какво е станало с него (локално или от сървъра). */
function rowStatus(row) {
  if (row.item) return statusText(row.item);
  return t(`admin.ingest.status.${row.state}`);
}

function rowResult(row) {
  if (row.error) return row.error;
  if (!row.item) return '';
  const lines = [resultText(row.item), ...warningTexts(row.item.warnings)].filter(Boolean);
  return h('div', { class: 'cell-main' }, ...lines.map((l) => h('span', { class: 'small' }, l)));
}

function manifestIssues(err) {
  const issues = err?.body?.issues ?? [];
  return issues
    .slice(0, 5)
    .map((i) =>
      t('admin.ingest.manifestIssue', {
        row: i.row,
        reason: t(`admin.ingest.manifest.reason.${i.reason}`),
      }),
    )
    .join(' ');
}

export async function uploadBatch(reload) {
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
  const files = input({ type: 'file', multiple: true, accept: ACCEPT_FILES });
  const manifest = input({ type: 'file', accept: '.csv,.json,text/csv,application/json' });
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
  const revision = input({ required: true, maxlength: 20, value: 'A' });
  const audience = select(
    AUDIENCES.map((v) => ({ value: v, label: t(`admin.audience.${v}`) })),
    'INTERNAL',
  );
  const safety = checkbox(t('admin.docs.safety'));
  const importCodes = checkbox(t('admin.ingest.importCodes'));
  const subsystem = input({ maxlength: 60 });
  const validity = validityFields();
  const applicability = repeater({
    addLabel: t('admin.docs.addApplicability'),
    makeRow: () => applicabilityRow(products),
  });
  const summary = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const table = h('div', { class: 'results' });
  const state = { rows: [], batchId: null, stop: null };

  const columns = [
    { label: t('admin.ingest.col.file'), render: (r) => h('span', { class: 'mono' }, r.name) },
    { label: t('admin.ingest.col.status'), render: (r) => rowStatus(r) },
    { label: t('admin.ingest.col.result'), render: (r) => rowResult(r) },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (r) =>
        r.item?.canRetry
          ? button(t('admin.ingest.retry'), () => void retry(r), {
              small: true,
              'aria-label': `${t('admin.ingest.retry')}: ${r.name}`,
            })
          : '',
    },
  ];

  const draw = () => {
    clear(table).append(
      state.rows.length
        ? dataTable({ columns, rows: state.rows, caption: t('admin.ingest.batch') })
        : '',
    );
    const items = state.rows.filter((r) => r.item);
    const done = items.filter((r) => r.item.status === 'DONE').length;
    const failed =
      items.filter((r) => r.item.status === 'FAILED').length +
      state.rows.filter((r) => r.error).length;
    const running = state.rows.length - done - failed;
    summary.textContent = state.batchId ? t('admin.ingest.summary', { done, failed, running }) : '';
  };

  const watch = () => {
    state.stop?.();
    state.stop = watchBatch(state.batchId, (batch) => {
      for (const item of batch.items) {
        const row = state.rows.find((r) => r.itemId === item.id);
        if (row) row.item = item;
      }
      draw();
      if (batch.items.length > 0 && batch.items.every(isFinal)) reload();
    });
  };

  async function retry(row) {
    try {
      row.item = await retryItem(row.item.id);
      draw();
      watch();
    } catch (err) {
      toast(ingestErrText(err), 'err');
    }
  }

  files.addEventListener('change', () => {
    state.rows = [...files.files].map((f) => ({
      file: f,
      name: f.name,
      state: f.size > MAX_FILE_BYTES ? 'REJECTED' : 'PENDING',
      error: f.size > MAX_FILE_BYTES ? t('admin.ingest.tooLarge') : '',
    }));
    draw();
  });

  let startButton = null;
  dialog({
    title: t('admin.ingest.batch'),
    wide: true,
    onClose: () => state.stop?.(),
    body: [
      h('p', {}, t('admin.ingest.batch.intro')),
      field(t('admin.ingest.files'), files, { hint: t('admin.ingest.files.hint') }),
      field(t('admin.ingest.manifest'), manifest, { hint: t('admin.ingest.manifest.hint') }),
      h('h3', { class: 'sub' }, t('admin.ingest.defaults')),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.docs.type'), type),
        field(t('admin.docs.audience'), audience),
      ),
      h(
        'div',
        { class: 'field-row' },
        field(t('admin.docs.revision'), revision),
        field(t('admin.docs.language'), language),
      ),
      field(t('admin.docs.subsystem'), subsystem),
      safety,
      importCodes,
      h('p', { class: 'hint' }, t('admin.ingest.importCodes.hint')),
      validity.node,
      h('h3', { class: 'sub' }, t('admin.docs.applicability')),
      h('p', { class: 'hint' }, t('admin.kb.applicability.hint')),
      applicability.node,
      summary,
      table,
      h('p', { class: 'hint' }, t('admin.ingest.background')),
    ],
    actions: [
      {
        label: t('admin.ingest.start'),
        primary: true,
        ref: (b) => {
          startButton = b;
        },
        onClick: async (dlg) => {
          const pending = state.rows.filter((r) => r.state === 'PENDING');
          if (pending.length === 0) {
            dlg.setError(t('admin.ingest.noFiles'));
            return false;
          }
          const defaults = {
            type: type.value,
            language: language.value.trim(),
            revision: revision.value.trim(),
            audience: audience.value,
            safetyRelevant: safety.querySelector('input').checked,
            ...validity.read(),
            applicability: applicability.values(),
            ...(subsystem.value.trim() ? { subsystem: subsystem.value.trim() } : {}),
          };
          const m = manifest.files[0];
          const body = {
            defaults,
            importErrorCodes: importCodes.querySelector('input').checked,
            ...(m
              ? {
                  manifest: {
                    format: /\.json$/i.test(m.name) ? 'json' : 'csv',
                    text: await m.text(),
                  },
                }
              : {}),
          };
          let batch;
          try {
            batch = await createBatch(body);
          } catch (err) {
            const detail = err?.code === 'invalid_manifest' ? manifestIssues(err) : explain(err);
            dlg.setError(`${ingestErrText(err)} ${detail}`.trim());
            return false;
          }
          state.batchId = batch.id;
          lock(startButton, true);
          for (const row of pending) {
            row.state = 'UPLOADING';
            draw();
            try {
              const item = await sendFile(batch.id, row.file);
              row.itemId = item.id;
              row.item = item;
            } catch (err) {
              row.state = 'REJECTED';
              row.error = `${ingestErrText(err)} ${explain(err)}`.trim();
            }
            draw();
          }
          watch();
          return false;
        },
      },
    ],
  });
}
