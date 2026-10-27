'use client';
// The «?» of a field (round 52): what the field is for, from the user guide (docs/guida-utente), shown when the pointer
// is on the field's name or on the «?», when the «?» has the keyboard's focus, and pinned by a click or a tap; Esc
// hides it (WCAG 1.4.13). It sits next to the label, never inside it: a button is not label content, and the label
// keeps naming its input alone; screen readers get the text as the «?»'s description. Near the screen's right edge (the
// last columns of a table) it opens towards the left instead, so the page never scrolls sideways.
import { useCallback, useEffect, useId, useRef, useState } from 'react';

/** The box the explanation is placed in (its nearest positioned ancestor: the label's .lbl, or the page's). */
function contenitore(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).position !== 'static') return p;
  return document.documentElement;
}

export default function Aiuto({ testo, nome }: { testo: string; nome: string }) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  // pinned by a click or a tap; hidden by Esc until the pointer or the focus leaves
  const [aperto, setAperto] = useState(false);
  const [zitto, setZitto] = useState(false);
  // opened leftwards when, opened from its box's left edge, it would pass the screen's right edge (16 px of margin)
  const [sinistra, setSinistra] = useState(false);
  const adatta = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const box = contenitore(el).getBoundingClientRect(), vw = document.documentElement.clientWidth, w = Math.min(360, vw - 32);
    setSinistra(box.left + w > vw - 16);
  }, []);

  useEffect(() => {
    const lbl = ref.current?.closest('.lbl') ?? ref.current;
    lbl?.addEventListener('pointerenter', adatta);
    return () => lbl?.removeEventListener('pointerenter', adatta);
  }, [adatta]);

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
    <span ref={ref} className="aiuto" data-aperto={aperto ? '' : undefined} data-zitto={zitto ? '' : undefined} data-sinistra={sinistra ? '' : undefined}
      onPointerLeave={() => setZitto(false)} onBlur={() => setZitto(false)}>
      <button type="button" className="aiuto-btn" aria-label={`Che cos’è «${nome}»`} aria-describedby={id} aria-expanded={aperto}
        onFocus={adatta} onClick={() => { adatta(); setAperto((a) => !a); setZitto(false); }}>?</button>
      <span role="tooltip" id={id} className="aiuto-testo">{testo}</span>
    </span>
  );
}
