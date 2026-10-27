'use client';
// The «?» of a field (round 52): what the field is for, from the user guide (docs/guida-utente), shown when the pointer
// is on the field's name or on the «?», when the «?» has the keyboard's focus, and pinned by a click or a tap; Esc
// hides it (WCAG 1.4.13). It sits next to the label, never inside it: a button is not label content, and the label
// keeps naming its input alone; screen readers get the text as the «?»'s description.
import { useEffect, useId, useRef, useState } from 'react';

export default function Aiuto({ testo, nome }: { testo: string; nome: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  // pinned by a click or a tap; hidden by Esc until the pointer or the focus leaves
  const [aperto, setAperto] = useState(false);
  const [zitto, setZitto] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAperto(false);
      setZitto(true);
    };
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      setAperto(false);
    };
    document.addEventListener('keydown', onKey);
    if (aperto) document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [aperto]);

  return (
    <span ref={ref} className="aiuto" data-aperto={aperto ? '' : undefined} data-zitto={zitto ? '' : undefined}
      onPointerLeave={() => setZitto(false)} onBlur={() => setZitto(false)}>
      <button type="button" className="aiuto-btn" aria-label={`Che cos’è «${nome}»`} aria-describedby={id} aria-expanded={aperto}
        onClick={() => { setAperto((a) => !a); setZitto(false); }}>?</button>
      <span role="tooltip" id={id} className="aiuto-testo">{testo}</span>
    </span>
  );
}
