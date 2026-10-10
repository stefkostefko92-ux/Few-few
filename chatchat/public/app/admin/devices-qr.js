// Нов QR етикет на табло (FR-13). Токенът се връща ВЕДНЪЖ (в базата е само HMAC): UI го показва
// за печат и после го забравя. Новият етикет обезсилва стария веднага — затова първо потвърждение.

import { t } from '../i18n.js';
import { call } from './core.js';
import { $, clear, confirmDialog, dialog, errText, h, onceSecret, toast } from './ui.js';

const svgSrc = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function printLabel(device, src) {
  const sheet = $('#print-sheet');
  clear(sheet).append(
    h(
      'figure',
      { class: 'label' },
      h('img', { src, alt: '', class: 'label-qr' }),
      h(
        'figcaption',
        {},
        h('strong', { class: 'mono' }, device.serial),
        h('span', {}, device.productModel),
      ),
    ),
  );
  const done = () => {
    clear(sheet);
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

export async function issueQr(device, reload) {
  const ok = await confirmDialog({
    title: t('admin.devices.qr.title', { serial: device.serial }),
    message: device.hasQr ? t('admin.devices.qr.replace') : t('admin.devices.qr.first'),
    confirmLabel: t('admin.devices.qr.create'),
    danger: device.hasQr,
  });
  if (!ok) return;
  let res;
  try {
    res = await call('POST', `/admin/devices/${encodeURIComponent(device.serial)}/qr`);
  } catch (err) {
    toast(errText(err), 'err');
    return;
  }
  reload();
  const src = svgSrc(res.svg);
  dialog({
    title: t('admin.devices.qr.ready', { serial: device.serial }),
    cancel: false,
    wide: true,
    closeLabel: t('admin.once.done'),
    onClose: () => clear($('#print-sheet')),
    body: [
      h('p', { class: 'note note-warn' }, t('admin.devices.qr.once')),
      h(
        'div',
        { class: 'qr-preview' },
        h('img', {
          src,
          alt: t('admin.devices.qr.alt', { serial: device.serial }),
          class: 'qr-img',
        }),
      ),
      onceSecret({
        label: t('admin.devices.qr.link'),
        value: res.url,
        note: t('admin.devices.qr.linkNote'),
      }),
    ],
    actions: [
      { label: t('admin.devices.qr.print'), onClick: () => (printLabel(device, src), false) },
      { label: t('admin.once.done'), primary: true },
    ],
  });
}
