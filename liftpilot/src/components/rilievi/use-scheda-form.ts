'use client';

// The sheet form's behaviour in the browser, rilievi's public/js/app.js ported to one hook on the form element: the
// survey's values as they stand (for the conditions and the rows per stop), the rows made so far, the suppliers' modules
// prefilled when their «Sì» is chosen (untouched inputs only, the rules of prefill-client.ts), the Sì/No and choices a
// second click clears, the «unsaved changes» hint and the warning before leaving, and no half-typed number sent. The
// server decides everything again on submit; this only shows and hides.
// Leaving: in rilievi every link was a page load, so the browser's own «leave the page?» covered them all. Here the
// app's links (the sidebar, the breadcrumb, «Annulla») move inside the page; while the form is dirty such a click is
// turned into a real page load, so the same browser question comes up (a new tab, a modified click, a link within the
// page stay as they are). Another form sent meanwhile (the top bar's search) is sent by the browser itself, a page
// load with the same question (lib/rilievi/leave.ts); «Esci» is a plain POST already (api/logout).
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { browserSendable } from '@/lib/rilievi/leave';
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
    // before the app's router sees the click (capture, on the document): a same-origin link to another page loads it
    const onLinkClick = (e: MouseEvent): void => {
      if (!isDirty || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const to = new URL(link.href, window.location.href), here = window.location;
      if (to.origin !== here.origin) return;
      if (to.pathname === here.pathname && to.search === here.search) return;
      e.preventDefault();
      e.stopPropagation();
      window.location.assign(to.href);
    };
    // another form sent while dirty (capture, on the document, before the app's own handler): the browser sends it
    const onOtherSubmit = (e: SubmitEvent): void => {
      const other = e.target;
      if (!isDirty || e.defaultPrevented || !(other instanceof HTMLFormElement) || other === el) return;
      const by = e.submitter;
      const action = by?.hasAttribute('formaction') ? by.getAttribute('formaction') : other.getAttribute('action');
      const names = [...Array.from(other.elements, (c) => c.getAttribute('name') ?? ''), by?.getAttribute('name') ?? ''];
      if (browserSendable(action, names)) e.stopPropagation();
    };
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('click', onLinkClick, true);
    document.addEventListener('submit', onOtherSubmit, true);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClick);
      el.removeEventListener('submit', onSubmit);
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('click', onLinkClick, true);
      document.removeEventListener('submit', onOtherSubmit, true);
    };
  }, [form]);

  return { snap, made, dirty };
}
