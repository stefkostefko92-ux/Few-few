'use client';

// The sheet form's behaviour in the browser, rilievi's public/js (commit ae6329cb6) ported to one hook on the form
// element, in rilievi's order of events: app.js — the conditional fields shown and hidden at once (form-dom.ts), the rows
// per stop following «Fermate», the Sì/No and choices a second click clears, the «unsaved changes» hint and the warning
// before leaving, no half-typed number sent; moduli.js — the modules' survey fields following the sheet while nobody has
// typed in them (prefill-client.ts); collegati.js — the same plant data in the sheet and in the modules following each
// other in real time, in every direction, the differences listed under the modules' groups, the names still following
// sent with the form (collegati-client.ts). The control the person changes is theirs from then on. What the linked data
// fill in the sheet is told to the page as typing would (its conditions, its rows, the survey fields) — those events are
// the form's own: they mark nothing as typed and settle nothing again. The server decides everything again on submit.
// A form that came back unsaved (refused, a conflict, differences to confirm) opens dirty: in rilievi the page drawn
// again after the POST was clean, but here the app's links move inside the page, and that input is the most at risk.
// Leaving: in rilievi every link was a page load, so the browser's own «leave the page?» covered them all. Here the
// app's links (the sidebar, the breadcrumb, «Annulla») move inside the page; while the form is dirty such a click is
// turned into a real page load, so the same browser question comes up (a new tab, a modified click, a link within the
// page stay as they are). Another form sent meanwhile (the top bar's search) is sent by the browser itself, a page
// load with the same question (lib/rilievi/leave.ts); «Esci» is a plain POST already (api/logout).
import { useEffect, useRef, useState, type RefObject } from 'react';
import { collegatiEngine, type ClientDiscrepanza } from '@/lib/rilievi/collegati-client';
import type { FormValues } from '@/lib/rilievi/field-parsers';
import { browserSendable } from '@/lib/rilievi/leave';
import { misureCount } from '@/lib/rilievi/misure';
import type { CollegatiDati } from '@/lib/rilievi/ordini/collegati-browser';
import { AUTO_KEY } from '@/lib/rilievi/ordini/auto-key';
import { misureRowsFor, prefillFill, valuesOfForm, type SurveyContext } from '@/lib/rilievi/prefill-client';
import { domHost, isControl, isTick, syncConditions } from './form-dom';

/** The same list of differences: the form's lists are drawn again only when it changes. */
const sameList = (a: readonly ClientDiscrepanza[] | null, b: readonly ClientDiscrepanza[]): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** The browser's rules over the form: `collegati` the links (collegatiData on the server), `etichetta` the words of the
 *  sheet's ticks, `unsaved` whether the form opens with input not saved (it came back from the server: a refusal, a
 *  conflict, the differences to confirm — nothing was saved). Returns the survey's values as they stand (the rows per
 *  stop), the rows made so far, whether the form is dirty and the differences on screen (null until the page has worked
 *  them out — the server's list stays till then). */
export function useSchedaForm(form: RefObject<HTMLFormElement | null>, initial: FormValues, onSent: (values: FormValues) => void,
  collegati: CollegatiDati, etichetta: SurveyContext['etichetta'], unsaved = false) {
  const [snap, setSnap] = useState<FormValues>(initial);
  const [made, setMade] = useState(() => misureCount(initial.fermate));
  const [dirty, setDirty] = useState(unsaved);
  const unsavedRef = useRef(unsaved);
  const [found, setFound] = useState<ClientDiscrepanza[] | null>(null);
  const sentRef = useRef(onSent), wordsRef = useRef(etichetta);
  useEffect(() => {
    sentRef.current = onSent;
    wordsRef.current = etichetta;
  }, [onSent, etichetta]);

  useEffect(() => {
    const el = form.current;
    if (!el) return;
    const host = domHost(el);
    const engine = collegatiEngine(collegati, host);
    const ctx: SurveyContext = { contesto: collegati.contesto, etichetta: (campo, valore) => wordsRef.current(campo, valore) };
    let isDirty = unsavedRef.current, ours = false;
    const sync = (): void => {
      const v = valuesOfForm(el);
      setSnap(v);
      setMade((m) => Math.max(m, misureRowsFor(typeof v.fermate === 'string' ? v.fermate : '')));
    };
    const markDirty = (): void => {
      if (isDirty) return;
      isDirty = true;
      setDirty(true);
    };
    // moduli.js: the modules' survey fields still following take what the sheet says now
    const prefill = (): void => {
      prefillFill(host, valuesOfForm(el), ctx);
    };
    // collegati.js: the following places fill in a few rounds; the sheet's controls filled are told to the page
    const settle = (): void => {
      const list = engine.settle((sheet) => {
        ours = true;
        try {
          sheet.forEach((c) => c.dispatchEvent(new Event(isTick(c) ? 'change' : 'input', { bubbles: true })));
        } finally {
          ours = false;
        }
      });
      setFound((before) => (sameList(before, list) ? before : list));
    };
    const onEvent = (e: Event): void => {
      const target = e.target;
      if (!isControl(target) || !el.contains(target)) return;
      if (e.type === 'change') syncConditions(el);
      markDirty();
      // the control the person changed is theirs: it stops following (the form's own events mark nothing)
      if (!ours) target.dataset.touched = '1';
      prefill();
      if (!ours) settle();
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
    // a number the browser cannot read (type=number) stops the submit with its own message; otherwise the values go, with
    // the names still following their source (if the form comes back, the server marks them again)
    const onSubmit = (e: SubmitEvent): void => {
      const bad = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="number"]')).find((i) => i.validity.badInput);
      if (bad) {
        e.preventDefault();
        bad.reportValidity();
        bad.focus();
        return;
      }
      const carrier = el.querySelector<HTMLInputElement>(`input[name="${AUTO_KEY}"]`);
      if (carrier) carrier.value = engine.followingNames().join(' ');
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
    el.addEventListener('input', onEvent);
    el.addEventListener('change', onEvent);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('click', onLinkClick, true);
    document.addEventListener('submit', onOtherSubmit, true);
    // on load (rilievi: moduli.js, then collegati.js): an empty place takes what another already says, and the lists
    // match what is on screen
    syncConditions(el);
    prefill();
    settle();
    sync();
    // the rules are on (`data-live`): React attaches its props while hydrating, before this effect runs — whoever waits
    // for the form to work (the smoke test, the parity harness) waits for this, not for the props
    el.setAttribute('data-live', '1');
    return () => {
      el.removeAttribute('data-live');
      el.removeEventListener('input', onEvent);
      el.removeEventListener('change', onEvent);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClick);
      el.removeEventListener('submit', onSubmit);
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('click', onLinkClick, true);
      document.removeEventListener('submit', onOtherSubmit, true);
    };
  }, [form, collegati]);

  return { snap, made, dirty, found };
}
