// Saving the project: the spec, the name and the version this editor opened go to the server with the session CSRF
// token; the state label says saved / unsaved / saving. Saves run one after another — Ctrl+S or a download waits for
// the save already on its way — and the server refuses a save over a newer version (another window or device), so
// nothing is overwritten unseen. An expired plan or a lost session reloads the page, which then shows why.
import { $ } from './dom.js';

export function createSaver({ state, boot, csrf, isReadOnly, text, beforeSave = async () => {} }) {
  const nameInput = $('#project-name');
  const stateLabel = $('#save-state');
  const errorBox = $('#save-error');
  let chain = Promise.resolve(true);

  function isDirty() {
    return (
      !isReadOnly() &&
      (state.hash !== state.savedHash || nameInput.value.trim() !== state.savedName)
    );
  }

  function showState() {
    if (isReadOnly()) return;
    stateLabel.textContent = state.saving ? text.saving : isDirty() ? text.unsaved : text.saved;
    stateLabel.dataset.state = state.saving ? 'saving' : isDirty() ? 'dirty' : 'saved';
  }

  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    return false;
  }

  async function write() {
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
        body: JSON.stringify({
          spec: state.spec,
          name: nameInput.value.trim() || state.savedName,
          base: state.savedAt,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) state.conflict = true; // stays until the page is reloaded
        if (body.code === 'app.errors.planExpired' || res.status === 401)
          window.setTimeout(() => location.reload(), 2500);
        return fail(body.error || text.saveFailed);
      }
      state.savedHash = body.hash;
      state.savedName = body.name;
      state.savedAt = body.updatedAt;
      return true;
    } catch {
      return fail(text.saveFailed);
    } finally {
      state.saving = false;
      showState();
    }
  }

  // true when what is on screen is saved (or there is nothing to save); false when it is not
  function save() {
    const run = chain.then(async () => {
      await beforeSave();
      if (state.conflict) return false;
      if (isReadOnly() || !isDirty()) return true;
      return write();
    });
    chain = run.catch(() => false);
    return run;
  }

  return { isDirty, showState, save };
}
