'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { FormState } from '@/server/form';

// After a form action answers with an error, the focus goes where the person must act: the first field marked invalid
// (aria-invalid, in the order of the form), else the alert (tabIndex -1). Each answer is a new state object, so the same
// error twice in a row moves the focus again; the browser scrolls the element into view.
export function useErrorFocus(state: FormState): { form: RefObject<HTMLFormElement | null>; alert: RefObject<HTMLParagraphElement | null> } {
  const form = useRef<HTMLFormElement | null>(null), alert = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (!state.error) return;
    const field = state.fields?.length ? form.current?.querySelector<HTMLElement>('[aria-invalid="true"]') : null;
    (field ?? alert.current)?.focus();
  }, [state]);
  return { form, alert };
}
