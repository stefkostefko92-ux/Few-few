// frontend/src/components/LanguageSwitcher.jsx
// Езиков превключвател за дашборда. Записва избора в акаунта (PATCH /auth/me)
// и веднага обновява AuthContext, така че I18nProvider пре-рендира целия панел
// на новия език без презареждане. Изборът пътува с потребителя, не със сесията.
import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Globe, Check, ChevronDown } from "lucide-react";
import { updateMe } from "../api";
import { useAuth } from "../contexts/AuthContext";
import { useT } from "../contexts/I18nContext";
import { LANGUAGE_OPTIONS } from "../i18n/dashboard";

export default function LanguageSwitcher({ compact = false }) {
  const { user, setUser } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = LANGUAGE_OPTIONS.find((l) => l.code === user?.language) || LANGUAGE_OPTIONS[0];

  const mut = useMutation({
    mutationFn: (code) => updateMe({ language: code }),
    onSuccess: (_data, code) => {
      // Оптимистично: сменяме езика в контекста веднага (I18nProvider чете
      // user.language). Бекендът вече го е записал.
      setUser((u) => (u ? { ...u, language: code } : u));
      setOpen(false);
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.label")}
        title={t("language.label")}
        className={compact
          ? "text-cs-dim hover:text-cs-cyan p-2 transition-colors"
          : "flex items-center gap-2 px-3 py-1.5 border border-cs-border hover:border-cs-cyan/40 text-cs-muted hover:text-cs-text text-sm transition-colors"}
      >
        <Globe className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        {!compact && <><span className="flex-1 text-left">{current.label}</span><ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /></>}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("language.label")}
          className="absolute z-50 bottom-full mb-1 right-0 min-w-[160px] cs-card !p-1 border border-cs-border bg-cs-panel shadow-cs-lift max-h-72 overflow-y-auto"
        >
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = opt.code === current.code;
            return (
              <li key={opt.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  disabled={mut.isPending}
                  onClick={() => (active ? setOpen(false) : mut.mutate(opt.code))}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded transition-colors ${
                    active ? "text-cs-cyan" : "text-cs-text hover:bg-cs-bg"
                  }`}
                >
                  <span className="flex-1 text-left">{opt.label}</span>
                  {active && <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
