// The title line under the project name and the construction checks chip with its list.
import { $, esc } from './dom.js';
import { dimsText } from '../engine/types.js';
import { typeLabel } from '../engine/model.js';

const LEVEL = { error: 'Грешка', warn: 'Внимание', info: 'Бележка' };

export function renderHeader(model) {
  $('#title-spec').textContent =
    `${typeLabel(model.spec.type)}, ${dimsText(model.spec.type, model.spec)}`;
  const items = model.warnings;
  const errors = items.filter((x) => x.level === 'error').length;
  const warns = items.filter((x) => x.level === 'warn').length;
  const chip = $('#dfm-chip');
  chip.dataset.level = errors ? 'error' : warns ? 'warn' : 'ok';
  chip.textContent = errors
    ? `${errors} ${errors === 1 ? 'грешка' : 'грешки'}`
    : warns
      ? `${warns} за внимание`
      : 'Проверките минават';
  $('#dfm-list').innerHTML = items.length
    ? items
        .map(
          (x) =>
            `<li data-level="${x.level}"><span class="lvl">${LEVEL[x.level]}</span><span>${esc(x.text)}</span></li>`,
        )
        .join('')
    : '<li data-level="info"><span class="lvl">Бележка</span><span>Няма забележки по конструкцията.</span></li>';
}
