// Saving the project: the spec, the name and the version this editor opened go to the server with the session CSRF
// token; the state label says saved / unsaved / saving. Saves run one after another — Ctrl+S or a download waits for
// the save already on its way — and the server refuses a save over a newer version (another window or device), so
// nothing is overwritten unseen. An expired plan or a lost session reloads the page, which then shows why. A project
// whose hardware or decors have left the catalog (state.drift) shows as not saved; only Save or Ctrl+S stores the
// substitute (a download does not), and onSaved runs once it is stored.
import { $ } from './dom.js';
import { showError } from './session.js';

export function createSaver({
  state,
  boot,
  csrf,
  isReadOnly,
  text,
  beforeSave = async () => {},
  onSaved = () => {},
}) {
  const nameInput = $('#project-name');
  const stateLabel = $('#save-state');
  const errorBox = $('#save-error');
  let chain = Promise.resolve(true);

  // an emptied name field is not a change: the save keeps the saved name (write)
  const nameOnScreen = () => nameInput.value.trim() || state.savedName;

  function isDirty() {
    return !isReadOnly() && (state.hash !== state.savedHash || nameOnScreen() !== state.savedName);
  }

  function showState() {
    if (isReadOnly()) return;
    const dirty = isDirty() || state.drift.length > 0;
    stateLabel.textContent = state.saving ? text.saving : dirty ? text.unsaved : text.saved;
    stateLabel.dataset.state = state.saving ? 'saving' : dirty ? 'dirty' : 'saved';
  }

  function fail(message) {
    showError(message);
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
          name: nameOnScreen(),
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
      if (!nameInput.value.trim()) nameInput.value = body.name;
      // the tab, the history and the page heading (screen readers) carry the saved name, as after a reload
      document.title = `${body.name} — Korpora`;
      const heading = $('#main > h1');
      if (heading) heading.textContent = body.name;
      if (state.drift.length) {
        state.drift = [];
        onSaved();
      }
      return true;
    } catch {
      return fail(text.saveFailed);
    } finally {
      state.saving = false;
      showState();
    }
  }

  // true when what is on screen is saved (or there is nothing to save); false when it is not. `explicit` (Save,
  // Ctrl+S) also stores a substitute for what has left the catalog.
  function save(explicit = false) {
    const run = chain.then(async () => {
      await beforeSave();
      if (state.conflict) return false;
      if (isReadOnly() || !(isDirty() || (explicit && state.drift.length > 0))) return true;
      return write();
    });
    chain = run.catch(() => false);
    return run;
  }

  return { isDirty, showState, save };
}
