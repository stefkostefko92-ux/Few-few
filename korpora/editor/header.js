// The title line under the project name and the construction checks chip with its list.
import { $, esc } from './dom.js';
import { dimsText, typeText } from '../engine/types.js';
import { tx, txCount, words } from './text.js';

export function renderHeader(model) {
  const t = words();
  $('#title-spec').textContent =
    `${typeText(model.spec.type, t).label}, ${dimsText(model.spec.type, model.spec, t)}`;
  const items = model.warnings;
  const errors = items.filter((x) => x.level === 'error').length;
  const warns = items.filter((x) => x.level === 'warn').length;
  const chip = $('#dfm-chip');
  chip.dataset.level = errors ? 'error' : warns ? 'warn' : 'ok';
  chip.textContent = errors
    ? txCount(errors, 'checks.errors')
    : warns
      ? tx('checks.warns', { n: warns })
      : tx('checks.ok');
  $('#dfm-list').innerHTML = items.length
    ? items
        .map(
          (x) =>
            `<li data-level="${x.level}"><span class="lvl">${esc(tx(`level.${x.level}`))}</span><span>${esc(x.text)}</span></li>`,
        )
        .join('')
    : `<li data-level="info"><span class="lvl">${esc(tx('level.info'))}</span><span>${esc(tx('checks.none'))}</span></li>`;
}
