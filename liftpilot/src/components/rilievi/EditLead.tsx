'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

// The line under the edit page's title — «Ultima modifica di … il …» — names the version the form saves over. After a
// conflict (409) it names the version that caused it, as rilievi drew the whole page again from the sheet read at the
// POST: the form (SchedaForm) hands the server's new line up here, the head shows it. The text is the server's, already
// formatted (no dates formatted in the browser).
const Text = createContext<string>('');
const Setter = createContext<(text: string) => void>(() => undefined);

export function EditLeadProvider({ initial, children }: { initial: string; children: ReactNode }) {
  const [text, setText] = useState(initial);
  return <Setter.Provider value={setText}><Text.Provider value={text}>{children}</Text.Provider></Setter.Provider>;
}

/** The line itself, inside the page head. */
export function EditLead() {
  return <>{useContext(Text)}</>;
}

/** For the form: a new line from the server (nothing outside the edit page). */
export const useSetEditLead = (): ((text: string) => void) => useContext(Setter);
