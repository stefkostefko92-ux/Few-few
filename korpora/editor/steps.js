// The edits that are steps to undo — the constructor's, a change of the type, „reset“, „Персонализирай“ — and the
// way back and forth through them (Ctrl+Z, Ctrl+Shift+Z). A step of the constructor ('grid') goes back by the grid
// alone: what the rail changed since stays. The others ('spec') go back whole.
import { normalizeSpec, withType } from '../engine/model.js';
import { templateLayout, CONVERTIBLE } from '../engine/layout.js';
import { $ } from './dom.js';
import { renderParams, showType } from './form.js';
import { createHistory, restored } from './history.js';

export function createSteps({ state, isReadOnly, recompute, schedule }) {
  const history = createHistory(100);
  // a step not yet built by the engine: dropped if the engine cannot build it (failed)
  let unbuilt = false;
  const remember = (kind = 'spec') => {
    history.push({ spec: state.spec, kind });
    unbuilt = true;
  };
  // a spec of another type draws the rail's fields again
  function setSpec(spec) {
    const typeChanged = spec.type !== state.spec.type;
    state.spec = spec;
    if (!typeChanged) return;
    renderParams($('#param-fields'), spec.type);
    showType(spec.type);
  }
  // record: a step to undo, of `kind`; transient: more follows at once (a drag), so the recompute waits a frame
  function apply(spec, { record = true, transient = false, kind = 'grid' } = {}) {
    if (isReadOnly()) return;
    if (record) remember(kind);
    setSpec(spec);
    if (transient) schedule(16);
    else void recompute(true);
  }
  function step(dir) {
    if (isReadOnly()) return;
    const snap = dir < 0 ? history.undo(state.spec) : history.redo(state.spec);
    if (!snap) return;
    setSpec(restored(snap, state.spec));
    void recompute(true);
  }
  // a template becomes a free carcass with the same outside, columns, fills and fronts; another type, a new one
  function personalize() {
    const { type } = state.spec;
    const next = CONVERTIBLE.includes(type)
      ? templateLayout(type, state.spec)
      : withType(state.spec, 'custom');
    apply(normalizeSpec(next), { kind: 'spec' });
  }
  return {
    history,
    remember,
    apply,
    step,
    personalize,
    // the spec as it is now (an edit waiting for its recompute included)
    spec: () => state.spec,
    convertible: (type) => CONVERTIBLE.includes(type),
    // the engine built the model of the spec / could not build it (main.js recompute)
    built: () => {
      unbuilt = false;
    },
    failed: () => {
      if (unbuilt) history.drop();
      unbuilt = false;
    },
  };
}
