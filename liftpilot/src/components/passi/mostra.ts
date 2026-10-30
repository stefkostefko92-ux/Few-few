// The steps of a form one at a time (round 53, «Semplice»): a step the form does not show is a box marked with its id
// (`data-passo`) and hidden. A link to a value in it — the bar of the steps, the list of what is missing, what to correct
// before the save — first asks the form to show that step (the event `passo-mostra`, with the step's id), then acts once
// the box is visible. The event is also how the bar asks for a step that is not a box of the form (the Progetto's
// drawing and checks).

export const PASSO_MOSTRA = 'passo-mostra';

/** Asks for the step `id`. */
export function chiediPasso(id: string): void {
  document.dispatchEvent(new CustomEvent<string>(PASSO_MOSTRA, { detail: id }));
}

/** The step `el` is in shown first (when hidden), then `poi`. */
export function mostraPasso(el: HTMLElement, poi: () => void): void {
  const box = el.closest<HTMLElement>('[data-passo][hidden]');
  if (!box?.dataset.passo) {
    poi();
    return;
  }
  chiediPasso(box.dataset.passo);
  let frames = 0;
  const wait = (): void => {
    if (!box.hidden || frames++ > 30) poi();
    else requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}

/** A listener of the steps asked for (the form's step now, the Progetto's side). */
export function suPasso(fn: (id: string) => void): () => void {
  const on = (e: Event): void => {
    if (e instanceof CustomEvent && typeof e.detail === 'string') fn(e.detail);
  };
  document.addEventListener(PASSO_MOSTRA, on);
  return () => document.removeEventListener(PASSO_MOSTRA, on);
}
