// The size fields of a furniture type: a number and a slider for a range, segmented radios for a choice. The
// server draws the same fields for the project it opens (views/app/editor-params.ejs; tests/editor-rail.test.ts
// compares the two), so the rail does not jump when the editor starts; this is used when the type changes.
import { esc } from '../engine/util.js';

export function paramsHtml(params) {
  return params
    .map((p) => {
      if (p.type === 'range') {
        const unit = p.unit ? `, ${p.unit}` : '';
        return `<div class="field"><label for="p-${p.key}">${esc(p.label)}${unit}</label>
<input type="number" id="p-${p.key}" data-field="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" inputmode="numeric">
<input type="range" data-field="${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${esc(p.label)}, плъзгач"></div>`;
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
