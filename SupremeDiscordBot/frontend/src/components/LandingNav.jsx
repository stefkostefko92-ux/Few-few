// frontend/src/components/LandingNav.jsx
// Навигацията на лендинга — същата за английския и 7-те превода.
// Визуалният одит (07.10.2026) намери, че на телефон има само „Sign in“: до
// цените и въпросите се стигаше само със скрол. Тук: връзки на десктоп и бутон
// „Меню“ на телефон, който отваря списък под хедъра. Esc и избор на връзка го
// затварят; фокусът отива на първата връзка и се връща на бутона.
//
// По одобрената концепция (10.10.2026): вдясно е лайм бутонът „Add to
// Discord“, а до него — „Sign in“ (вход в таблото). На телефон входът е в менюто.
// Връзките са в реда от 1280 px нагоре: под това преведените етикети
// (+ езиците) не се събират и редът се пренасяше на два (мерено, 10.10.2026).
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { DiscordIcon } from "./LandingConcept";

export default function LandingNav({ links, ui, onSignIn, inviteUrl, addLabel, extra = null, menuFooter = null }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector("a,button")?.focus();
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);
  const ext = (l) => (l.external ? { target: "_blank", rel: "noopener noreferrer" } : {});

  return (
    <>
      <nav aria-label="Main" className="hidden xl:flex items-center gap-7 text-sm font-medium text-cs-muted">
        {links.map((l) => (
          <a key={l.href} href={l.href} {...ext(l)} className="no-underline hover:text-cs-text transition-colors">{l.label}</a>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        {extra}
        {/* Вход за вече регистрираните — точно до „Add to Discord“ (собственикът,
            10.10.2026). На телефон няма място в реда — там е в менюто. */}
        <button type="button" onClick={onSignIn} className="hidden sm:inline-flex cs-btn-secondary cs-btn-sm">
          {ui.signIn}
        </button>
        <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="cs-btn-primary cs-btn-sm no-underline">
          <DiscordIcon className="w-4 h-4" />
          <span>{addLabel}</span>
        </a>
        <button
          ref={btnRef}
          type="button"
          className="xl:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-cs-border text-cs-text hover:border-cs-borderHi"
          aria-expanded={open}
          aria-controls="landing-mobile-menu"
          aria-label={open ? ui.close : ui.menu}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div
          id="landing-mobile-menu"
          ref={panelRef}
          className="xl:hidden absolute left-0 right-0 top-full z-50 mx-4 rounded-xl border border-cs-line bg-cs-surface/95 backdrop-blur p-2 shadow-2xl"
        >
          {links.map((l) => (
            <a key={l.href} href={l.href} {...ext(l)} onClick={close} className="block rounded-lg px-4 py-3 text-base text-cs-text no-underline hover:bg-cs-panel">
              {l.label}
            </a>
          ))}
          <button type="button" onClick={() => { close(); onSignIn(); }} className="block w-full text-left rounded-lg px-4 py-3 text-base text-cs-cyan hover:bg-cs-panel">
            {ui.signIn}
          </button>
          {menuFooter}
        </div>
      )}
    </>
  );
}
