// Saving the project: the spec and the name go to the server with the session CSRF token; the state label says
// saved / unsaved / saving. An expired plan or a lost session reloads the page, which then shows why.
import { $ } from './dom.js';

export function createSaver({ state, boot, csrf, readOnly, text, beforeSave = async () => {} }) {
  const nameInput = $('#project-name');
  const stateLabel = $('#save-state');
  const errorBox = $('#save-error');
  function isDirty() {
    return (
      !readOnly && (state.hash !== state.savedHash || nameInput.value.trim() !== state.savedName)
    );
  }

  function showState() {
    if (readOnly) return;
    stateLabel.textContent = state.saving ? text.saving : isDirty() ? text.unsaved : text.saved;
    stateLabel.dataset.state = state.saving ? 'saving' : isDirty() ? 'dirty' : 'saved';
  }

  async function save() {
    if (readOnly || state.saving) return true;
    await beforeSave();
    if (!isDirty()) return true;
    state.saving = true;
    showState();
    errorBox.hidden = true;
    try {
      const res = await fetch(`/app/api/projects/${encodeURIComponent(boot.id)}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          accept: 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ spec: state.spec, name: nameInput.value.trim() || state.savedName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorBox.textContent = body.error || text.saveFailed;
        errorBox.hidden = false;
        if (body.code === 'app.errors.planExpired' || res.status === 401)
          window.setTimeout(() => location.reload(), 2500);
        return false;
      }
      state.savedHash = body.hash;
      state.savedName = body.name;
      return true;
    } catch {
      errorBox.textContent = text.saveFailed;
      errorBox.hidden = false;
      return false;
    } finally {
      state.saving = false;
      showState();
    }
  }

  return { isDirty, showState, save };
}
