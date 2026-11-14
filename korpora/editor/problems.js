// What the editor offers when the server refuses a save (saver.js onProblem). The work on screen is never dropped:
// a conflict offers a copy (or a reload, which the browser asks about first), a lost sign-in a new tab to sign in —
// coming back to this tab then saves by itself — and an ended plan the plans, in a new tab.
import { $ } from './dom.js';
import { showProblem } from './session.js';
import { saveAsCopy } from './rescue.js';

export function explainProblems({ state, saver, text }) {
  const retry = () => {
    if (state.problem === 'session' && !state.saving) void saver.save(true);
  };
  window.addEventListener('focus', retry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry();
  });

  async function copy(ev) {
    const button = ev.currentTarget;
    button.disabled = true;
    const name = $('#project-name').value.trim() || state.savedName;
    const url = await saveAsCopy({ spec: state.spec, name, csrf: saver.token() }).catch(() => null);
    if (url) {
      saver.release();
      location.href = url;
      return;
    }
    explain('conflict', text.copyFailed);
  }

  function explain(kind, note) {
    if (kind === 'conflict')
      showProblem({
        title: text.conflictTitle,
        text: note ?? text.conflictText,
        actions: [
          { label: text.saveCopy, run: copy },
          { label: text.reload, run: () => location.reload() },
        ],
      });
    else if (kind === 'session')
      showProblem({
        title: text.sessionTitle,
        text: text.sessionText,
        actions: [
          { label: text.signIn, href: '/login' },
          { label: text.saveAgain, run: () => void saver.save(true) },
        ],
      });
    else
      showProblem({
        title: text.blockedTitle,
        text: kind === 'plan' ? text.planExpired : text.unverified,
        actions: kind === 'plan' ? [{ label: text.seePlans, href: '/account/plan' }] : [],
      });
  }
  return explain;
}
