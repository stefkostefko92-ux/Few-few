// Снимките (§9.2): допълващо доказателство, никога източник — отделно от източниците, без E… значки.

import { h } from '../dom.js';
import { t, tMaybeCode } from '../i18n.js';
import { arr, block, str } from './util.js';

const labelled = (label, values) =>
  values.length ? h('p', { class: 'small' }, `${label}: `, values.join(' · ')) : null;

export function photoItem(ph) {
  const plate = ph.nameplate && typeof ph.nameplate === 'object' ? ph.nameplate : {};
  const plateValues = [
    ['ctx.model', plate.model],
    ['ctx.serial', plate.serial],
    ['ctx.hw', plate.hardwareRevision],
    ['ctx.fw', plate.firmware],
  ]
    .filter(([, v]) => typeof v === 'string' && v !== '')
    .map(([k, v]) => `${t(k)} ${str(tMaybeCode(v))}`);
  return h(
    'li',
    null,
    h(
      'p',
      null,
      h('strong', null, str(ph.ref)),
      ` · ${t(`ans.photo.readability.${str(ph.readability)}`)}`,
      ` · ${t(`ans.photo.subject.${str(ph.subject)}`)}`,
      ` · ${t('ans.confidence')}: ${t(`ans.conf.${str(ph.confidence)}`)}`,
    ),
    labelled(
      t('ans.photo.visibleText'),
      arr(ph.visibleText).map((v) => str(tMaybeCode(v))),
    ),
    labelled(t('ans.photo.codes'), arr(ph.errorCodes).map(str)),
    labelled(t('ans.photo.nameplate'), plateValues),
    labelled(
      t('ans.photo.terminals'),
      arr(ph.terminalLabels).map((v) => str(tMaybeCode(v))),
    ),
    ph.note ? h('p', { class: 'small' }, str(tMaybeCode(ph.note))) : null,
  );
}

export function appendPhotos(root, { p }) {
  const photos = arr(p.photos);
  if (!photos.length) return;
  root.append(
    block(
      t('ans.photos'),
      'blk-photos',
      h('p', { class: 'muted small' }, t('ans.photos.hint')),
      h('ul', { class: 'plain' }, photos.map(photoItem)),
    ),
  );
}
