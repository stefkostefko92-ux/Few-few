'use client';
// The interface's mode (round 52): «Semplice» shows the fields most jobs need and keeps the others at the software's
// values, «Esperto» shows every field. The provider marks the workspace (data-modalita, display: contents — no box of its
// own) so that a field marked `esperto` hides by CSS alone (aiuto.css), server and client components alike, and gives the
// mode to the forms that also compute by it (the calculator); the switch in the top bar changes it at once and keeps it
// with the user (setModalitaAction), never in the browser.
import { createContext, useContext, useState, useTransition, type ReactNode } from 'react';
import type { Modalita } from '@/lib/auth';
import { setModalitaAction } from '@/server/modalita-actions';

interface ModalitaCtx { modalita: Modalita; set: (m: Modalita) => void }
// null outside the workspace (the public pages, the standalone artifact): there a form keeps a mode of its own
const Ctx = createContext<ModalitaCtx | null>(null);

export function ModalitaProvider({ iniziale, children }: { iniziale: Modalita; children: ReactNode }) {
  const [modalita, setModalita] = useState<Modalita>(iniziale);
  const [, start] = useTransition();
  const set = (m: Modalita) => {
    const prima = modalita;
    setModalita(m);
    start(async () => {
      // not kept (the session ended, too many changes): back to what the user has
      const r = await setModalitaAction(m).catch(() => ({ ok: false }));
      if (!r.ok) setModalita(prima);
    });
  };
  return <Ctx.Provider value={{ modalita, set }}><div className="ws-modalita" data-modalita={modalita}>{children}</div></Ctx.Provider>;
}

/** The mode now and the way to change it (the calculator's own switch uses the same); null outside the workspace. */
export const useModalita = (): ModalitaCtx | null => useContext(Ctx);

export function ModalitaSwitch({ label, semplice, esperto, nota }: { label: string; semplice: string; esperto: string; nota: string }) {
  const ctx = useModalita();
  if (!ctx) return null;
  const { modalita, set } = ctx;
  return (
    <div className="seg ws-mode" role="radiogroup" aria-label={label} title={nota}>
      <input type="radio" name="ws-modalita" id="ws-mode-semplice" checked={modalita === 'semplice'} onChange={() => set('semplice')} />
      <label htmlFor="ws-mode-semplice">{semplice}</label>
      <input type="radio" name="ws-modalita" id="ws-mode-esperto" checked={modalita === 'esperto'} onChange={() => set('esperto')} />
      <label htmlFor="ws-mode-esperto">{esperto}</label>
    </div>
  );
}
