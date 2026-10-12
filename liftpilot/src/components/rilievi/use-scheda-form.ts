'use client';

// The sheet form's behaviour in the browser, rilievi's public/js/app.js ported to one hook on the form element: the
// survey's values as they stand (for the conditions and the rows per stop), the rows made so far, the suppliers' modules
// prefilled when their «Sì» is chosen (untouched inputs only, the rules of prefill-client.ts), the Sì/No and choices a
// second click clears, the «unsaved changes» hint and the warning before leaving, and no half-typed number sent. The
// server decides everything again on submit; this only shows and hides.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { misureCount } from '@/lib/rilievi/misure';
import { misureRowsFor, prefillInput, valuesOfForm } from '@/lib/rilievi/prefill-client';

type Prefilled = HTMLInputElement | HTMLTextAreaElement;

/** A module that has just opened: each prefilled input nobody touched takes what the survey says now (app.js). */
function prefillModulo(box: Element, form: HTMLFormElement): void {
  const values = valuesOfForm(form);
  box.querySelectorAll<Prefilled>('[data-prefill]').forEach((input) => {
    if (input.dataset.touched) return;
    const check = input instanceof HTMLInputElement && input.type === 'checkbox';
    const kind = check ? 'check' : input instanceof HTMLTextAreaElement ? 'textarea' : 'text';
    const next = prefillInput({ kind, prefill: input.dataset.prefill ?? '', value: check ? input.checked : input.value, maxLength: input.maxLength > 0 ? input.maxLength : null }, values);
    if (next === null) return;
    if (check) input.checked = next === true;
    else input.value = String(next);
  });
}

export function useSchedaForm(form: RefObject<HTMLFormElement | null>, initial: FormValues, onSent: (values: FormValues) => void) {
  const [snap, setSnap] = useState<FormValues>(initial);
  const [made, setMade] = useState(() => misureCount(initial.fermate));
  const [dirty, setDirty] = useState(false);
  const sentRef = useRef(onSent);
  useEffect(() => { sentRef.current = onSent; }, [onSent]);

  useEffect(() => {
    const el = form.current;
    if (!el) return;
    let isDirty = false;
    const sync = (): void => {
      const v = valuesOfForm(el);
      setSnap(v);
      setMade((m) => Math.max(m, misureRowsFor(typeof v.fermate === 'string' ? v.fermate : '')));
    };
    // an input of a module typed into or changed by the person is never prefilled over
    const touch = (e: Event): void => {
      const target = e.target;
      if (target instanceof HTMLElement && target.closest('[data-modulo]')) target.dataset.touched = '1';
    };
    const markDirty = (): void => {
      if (isDirty) return;
      isDirty = true;
      setDirty(true);
    };
    const onInput = (e: Event): void => { touch(e); markDirty(); sync(); };
    const onChange = (e: Event): void => {
      touch(e);
      markDirty();
      const radio = e.target;
      if (radio instanceof HTMLInputElement && radio.type === 'radio' && radio.value === 'si' && radio.checked) {
        const box = el.querySelector(`[data-modulo="${CSS.escape(radio.name)}"]`);
        if (box) prefillModulo(box, el);
      }
      sync();
    };
    // a click on the ticked Sì/No (or choice) clears it: remember whether it was ticked before the click ticks it
    const onPointerDown = (e: PointerEvent): void => {
      const label = e.target instanceof Element ? e.target.closest('label') : null;
      const radio = label?.querySelector<HTMLInputElement>('input[data-clearable]');
      if (radio) radio.dataset.was = String(radio.checked);
    };
    const onClick = (e: MouseEvent): void => {
      const radio = e.target;
      if (!(radio instanceof HTMLInputElement) || !radio.hasAttribute('data-clearable')) return;
      if (radio.dataset.was === 'true') {
        radio.checked = false;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      radio.dataset.was = 'false';
    };
    // a number the browser cannot read (type=number) stops the submit with its own message; otherwise the values go
    const onSubmit = (e: SubmitEvent): void => {
      const bad = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="number"]')).find((i) => i.validity.badInput);
      if (bad) {
        e.preventDefault();
        bad.reportValidity();
        bad.focus();
        return;
      }
      isDirty = false;
      setDirty(false);
      sentRef.current(valuesOfForm(el));
    };
    const onLeave = (e: BeforeUnloadEvent): void => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClick);
      el.removeEventListener('submit', onSubmit);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [form]);

  return { snap, made, dirty };
}
