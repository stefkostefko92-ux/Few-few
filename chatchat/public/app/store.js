// Общото състояние + малка шина за събития. Нищо не се пази в localStorage
// (изключение: избраният език, виж i18n.js).

export const state = {
  user: null,
  csrf: null,
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

export function emit(event, detail) {
  for (const fn of listeners.get(event) ?? []) fn(detail);
}
