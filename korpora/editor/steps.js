// The edits that are steps to undo — the constructor's, a change of the type, „reset“, „Персонализирай“ — and the
// way back and forth through them (Ctrl+Z, Ctrl+Shift+Z). Within the free carcass a step back restores its grid
// only: what the rail changed since stays.
import { normalizeSpec, withType } from '../engine/model.js';
import { templateLayout, CONVERTIBLE } from '../engine/layout.js';
import { $ } from './dom.js';
import { renderParams, showType } from './form.js';
import { createHistory } from './history.js';

export function createSteps({ state, isReadOnly, recompute, schedule }) {
  const history = createHistory(100);
  const remember = () => history.push(state.spec);
  // a spec of another type draws the rail's fields again
  function setSpec(spec) {
    const typeChanged = spec.type !== state.spec.type;
    state.spec = spec;
    if (!typeChanged) return;
    renderParams($('#param-fields'), spec.type);
    showType(spec.type);
  }
  // record: a step to undo; transient: more follows at once (a drag), so the recompute waits a frame
  function apply(spec, { record = true, transient = false } = {}) {
    if (isReadOnly()) return;
    if (record) remember();
    setSpec(spec);
    if (transient) schedule(16);
    else void recompute(true);
  }
  function step(dir) {
    if (isReadOnly()) return;
    const snap = dir < 0 ? history.undo(state.spec) : history.redo(state.spec);
    if (!snap) return;
    const gridOnly = snap.type === 'custom' && state.spec.type === 'custom';
    setSpec(gridOnly ? { ...state.spec, grid: snap.grid } : snap);
    void recompute(true);
  }
  // a template becomes a free carcass with the same outside, columns, fills and fronts; another type, a new one
  function personalize() {
    const { type } = state.spec;
    const next = CONVERTIBLE.includes(type)
      ? templateLayout(type, state.spec)
      : withType(state.spec, 'custom');
    apply(normalizeSpec(next));
  }
  return {
    history,
    remember,
    apply,
    step,
    personalize,
    convertible: (type) => CONVERTIBLE.includes(type),
  };
}
