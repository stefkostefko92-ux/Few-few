// The size fields of a furniture type: a number and a slider for a range, segmented radios for a choice. The
// server draws the same fields for the project it opens (views/app/editor-params.ejs; tests/editor-rail.test.ts
// compares the two), so the rail does not jump when the editor starts; this is used when the type changes. A field with
// `when` (the modules of a kitchen's side wall) carries the choice it belongs to; writeForm (form.js) shows it then.
import { esc } from '../engine/util.js';
import { tx } from './text.js';

const whenAttr = (p) =>
  p.when
    ? Object.entries(p.when)
        .map(([k, vs]) => ` data-when="${esc(`${k}:${vs.join(',')}`)}"`)
        .join('')
    : '';

export function paramsHtml(params) {
  return params
    .map((p) => {
      if (p.type === 'range') {
        const unit = p.unit ? `, ${p.unit}` : '';
        return `<div class="field"${whenAttr(p)}><label for="p-${p.key}">${esc(p.label)}${unit}</label>
<input type="number" id="p-${p.key}" data-field="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" inputmode="numeric">
<input type="range" data-field="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${esc(tx('slider', { label: p.label }))}"></div>`;
      }
      return `<span class="lbl" id="l-${p.key}">${esc(p.label)}</span><div class="seg" role="radiogroup" aria-labelledby="l-${p.key}">${p.options
        .map(
          ([v, l]) =>
            `<label><input type="radio" name="${p.key}" value="${v}" data-field="${p.key}"><span>${esc(l)}</span></label>`,
        )
        .join('')}</div>`;
    })
    .join('');
}
