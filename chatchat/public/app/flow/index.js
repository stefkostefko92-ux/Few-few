// Свързването на работния поток с останалия интерфейс: панелът на тикета и стъпките в отговора
// се рисуват при зареждане на случай, след действие и при събитие в реално време (case.updated /
// step.updated) — винаги с ново четене през REST (събитието носи само идентификатори).

import { renderMessages } from '../chat.js';
import { refreshCases } from '../cases.js';
import { renderOutcome } from '../context.js';
import { listen, state } from '../store.js';
import { renderCaseFacts } from '../workspace/case-actions.js';
import { renderTicketPanel } from './panel.js';
import { reloadCase, reloadSteps } from './state.js';
import { refreshStepControls } from './steps.js';

const quietly = (p) => void p.catch(() => undefined);

export function initFlow() {
  listen('case:loaded', renderTicketPanel);
  listen('case:loading', renderTicketPanel);
  listen('lang', () => {
    renderTicketPanel();
    refreshStepControls();
  });
  listen('flow:steps', refreshStepControls);
  listen('flow:case', ({ messagesChanged }) => {
    if (messagesChanged) renderMessages({ scroll: 'keep' });
    else refreshStepControls();
    if (state.current?.case) renderOutcome(state.current.case);
    renderCaseFacts();
    renderTicketPanel();
    quietly(refreshCases());
  });
  // Реално време: само идентификатори → ново четене, ако е отвореният случай.
  listen('rt:case.updated', (d) => {
    if (d?.caseId && d.caseId === state.currentId) quietly(reloadCase());
    else quietly(refreshCases());
  });
  listen('rt:step.updated', (d) => {
    if (d?.caseId && d.caseId === state.currentId) quietly(reloadSteps());
  });
}
