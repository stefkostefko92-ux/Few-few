// The parameter rail's changes into the spec: the fields (a final change recomputes at once, typing waits a little),
// the type (its fields are drawn again), the decor, RAL and handle pickers, and „reset“. A change of the type and
// the reset are steps to undo too (remember), as the constructor's edits.
import { normalizeSpec, withType } from '../engine/model.js';
import { $, $$ } from './dom.js';
import { renderParams, showType, bindForm } from './form.js';
import { openPicker, bindPicker } from './pickers.js';

export function bindRail({ form, state, isReadOnly, remember, recompute, schedule }) {
  bindForm(form, (key, value, commit) => {
    if (isReadOnly()) return;
    if (key === 'type') {
      remember();
      state.spec = withType(state.spec, value);
      renderParams($('#param-fields'), value);
      showType(value);
      void recompute(true);
      return;
    }
    state.spec = { ...state.spec, [key]: value };
    // a final change shows the value as the engine took it (limits, step), also in a field still focused (Enter)
    if (commit) schedule(40, true);
    else schedule(400);
  });
  for (const b of $$('[data-pick]')) {
    b.addEventListener('click', () => {
      if (isReadOnly()) return;
      const key = b.dataset.pick;
      const mode = key === 'frontRal' ? 'ral' : key === 'handle' ? 'handle' : 'decor';
      openPicker(mode, state.spec[key], (id) => {
        state.spec = {
          ...state.spec,
          [key]: id,
          ...(key === 'frontRal' ? { frontMaterial: 'ral' } : {}),
        };
        void recompute();
      });
    });
  }
  bindPicker();
  $('#reset').addEventListener('click', () => {
    if (isReadOnly()) return;
    remember();
    state.spec = normalizeSpec({ type: state.spec.type });
    void recompute(true);
  });
}
