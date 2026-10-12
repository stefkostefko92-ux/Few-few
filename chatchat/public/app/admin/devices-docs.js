// Документите на ЕДНО табло (уникалните му схеми — решение на собственика): всичко, вързано само
// за този сериен номер, във всеки статус. AI ги ползва само в случай, вързан за таблото.

import { t } from '../i18n.js';
import { call } from './core.js';
import { openDocument } from './documents-detail.js';
import { statusBadge, validityBadge } from './kb-common.js';
import { button, dataTable, dialog, emptyState, errText, h, toast } from './ui.js';
import { definitionList } from './users-common.js';

export async function openDeviceDocuments(device) {
  let docs;
  try {
    docs = (await call('GET', `/admin/devices/${encodeURIComponent(device.serial)}/documents`))
      .documents;
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  let d = null;
  const columns = [
    {
      label: t('admin.docs.code'),
      render: (x) => h('span', { class: 'mono' }, `${x.code} · ${x.revision}`),
    },
    { label: t('admin.docs.title'), render: (x) => x.title },
    { label: t('admin.docs.status'), render: (x) => statusBadge(x.status) },
    { label: t('admin.kb.validity'), render: (x) => validityBadge(x) },
    {
      label: t('admin.users.col.actions'),
      head: h('span', { class: 'sr-only' }, t('admin.users.col.actions')),
      cls: 'col-actions',
      render: (x) =>
        button(
          t('admin.open'),
          () => {
            d?.close();
            void openDocument(x, () => void openDeviceDocuments(device));
          },
          { small: true, 'aria-label': `${t('admin.open')}: ${x.code} ${x.revision}` },
        ),
    },
  ];
  d = dialog({
    title: t('admin.kb.device.title', { serial: device.serial }),
    wide: true,
    cancel: false,
    closeLabel: t('common.close'),
    body: [
      definitionList([
        [t('admin.devices.model'), device.productModel],
        [t('admin.devices.hw'), device.hwRevision],
        [t('admin.devices.fw'), device.firmware],
        [t('admin.devices.company'), device.company?.name ?? ''],
      ]),
      h('h3', { class: 'sub' }, t('admin.kb.device.documents')),
      h('p', { class: 'hint' }, t('admin.kb.device.hint')),
      docs.length
        ? dataTable({ columns, rows: docs, caption: t('admin.kb.device.documents') })
        : emptyState(t('admin.kb.device.empty'), t('admin.kb.device.emptyHint')),
    ],
    actions: [],
  });
}
