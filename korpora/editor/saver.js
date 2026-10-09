// Saving the project: the spec, the name and the version this editor opened go to the server with the session CSRF
// token; the state label says saved / unsaved / saving / not saved. Saves run one after another — Ctrl+S or a download
// waits for the save already on its way — and the server refuses a save over a newer version (another window or
// device), so nothing is overwritten unseen. A project whose hardware or decors have left the catalog (state.drift)
// shows as not saved; only Save or Ctrl+S stores the substitute (a download does not), and onSaved runs once it is
// stored.
//
// A refused save never reloads the page and never drops what is on screen: onProblem(kind) says why — 'conflict'
// (saved elsewhere: stays until the page is reloaded), 'session' (signed out: a new sign-in in another tab, then
// Save, saves it; the page's token belongs to the old session, so a fresh one is read), 'plan' or 'unverified'.
import { $ } from './dom.js';
import { showError } from './session.js';

// the server's other refusals in the editor's language (its own texts), not in the account's
const MESSAGE = { 'app.errors.name': 'nameInvalid', 'app.errors.spec': 'specInvalid' };

const PROBLEM = {
  'app.errors.planExpired': 'plan',
  'app.errors.unverified': 'unverified',
  login: 'session',
  mfa: 'session',
};

export function createSaver({
  state,
  boot,
  csrf,
  isReadOnly,
  text,
  beforeSave = async () => {},
  onSaved = () => {},
  onProblem = () => {},
}) {
  const nameInput = $('#project-name');
  const stateLabel = $('#save-state');
  const errorBox = $('#save-error');
  let chain = Promise.resolve(true);
  let token = csrf;
  // the work on screen is safe elsewhere (saved as a copy): leaving no longer asks
  let released = false;

  // an emptied name field is not a change: the save keeps the saved name (write)
  const nameOnScreen = () => nameInput.value.trim() || state.savedName;

  function isDirty() {
    return (
      !released &&
      !isReadOnly() &&
      (state.hash !== state.savedHash || nameOnScreen() !== state.savedName)
    );
  }

  function showState() {
    if (isReadOnly()) return;
    const dirty = isDirty() || state.drift.length > 0;
    const refused = dirty && (state.conflict || state.problem);
    const [label, key] = state.saving
      ? [text.saving, 'saving']
      : refused
        ? [text.notSaved ?? text.unsaved, 'error']
        : dirty
          ? [text.unsaved, 'dirty']
          : [text.saved, 'saved'];
    stateLabel.textContent = label;
    stateLabel.dataset.state = key;
  }

  function fail(message) {
    showError(message);
    return false;
  }

  const put = () =>
    fetch(`/app/api/projects/${encodeURIComponent(boot.id)}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': token,
        accept: 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ spec: state.spec, name: nameOnScreen(), base: state.savedAt }),
    });

  // After a new sign-in the page's token belongs to the old session: the editor page of this project, read now,
  // carries the token of the session the browser has. Not signed in (the page sends to the sign-in): null.
  async function freshToken() {
    try {
      const res = await fetch(`/app/p/${encodeURIComponent(boot.id)}`, {
        credentials: 'same-origin',
        headers: { accept: 'text/html' },
      });
      if (!res.ok || res.redirected) return null;
      return /data-csrf="([^"]+)"/.exec(await res.text())?.[1] ?? null;
    } catch {
      return null;
    }
  }

  async function write() {
    state.saving = true;
    showState();
    errorBox.hidden = true;
    try {
      let res = await put();
      let body = await res.json().catch(() => ({}));
      if (res.status === 401 || (res.status === 403 && body.code === 'error.csrf')) {
        const fresh = await freshToken();
        if (fresh) {
          token = fresh;
          res = await put();
          body = await res.json().catch(() => ({}));
        }
      }
      if (!res.ok) {
        const kind =
          res.status === 409 ? 'conflict' : res.status === 401 ? 'session' : PROBLEM[body.code];
        if (kind === 'conflict') state.conflict = true; // stays until the page is reloaded
        state.problem = kind && kind !== 'conflict' ? kind : null;
        if (kind) {
          onProblem(kind);
          return false;
        }
        return fail(text[MESSAGE[body.code]] || body.error || text.saveFailed);
      }
      state.problem = null;
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
  // Ctrl+S) also stores a substitute for what has left the catalog. After a conflict nothing is written: the reason
  // is shown again.
  function save(explicit = false) {
    const run = chain.then(async () => {
      await beforeSave();
      if (state.conflict) {
        onProblem('conflict');
        return false;
      }
      if (isReadOnly() || !(isDirty() || (explicit && state.drift.length > 0))) return true;
      return write();
    });
    chain = run.catch(() => false);
    return run;
  }

  return {
    isDirty,
    showState,
    save,
    token: () => token,
    release: () => {
      released = true;
      showState();
    },
  };
}
