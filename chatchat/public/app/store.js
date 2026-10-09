// Общото състояние + малка шина за събития. Нищо не се пази в localStorage
// (изключение: избраният език, виж i18n.js). В sessionStorage — само идентификаторите на
// отворените плаващи прозорци (workspace/windows.js), без съдържание.

export const state = {
  user: null,
  csrf: null,
  mfa: { enabled: false, passed: false, required: false },
  cases: [],
  currentId: null,
  current: null, // { case, messages }
  tickets: new Map(), // caseId -> { number, status } (от GET /cases/:id и при създаване)
  sending: false,
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

export function off(event, fn) {
  listeners.get(event)?.delete(fn);
}

/** Абонамент, който се връща като функция за отписване (за компоненти с жизнен цикъл). */
export function listen(event, fn) {
  on(event, fn);
  return () => off(event, fn);
}

export function emit(event, detail) {
  for (const fn of [...(listeners.get(event) ?? [])]) fn(detail);
}
