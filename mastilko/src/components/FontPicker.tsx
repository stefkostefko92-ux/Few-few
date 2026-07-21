"use client";

import { useState } from "react";
import { FONTS, fontCss } from "@/lib/style";

interface Props {
  value: string | undefined;
  onChange: (id: string) => void;
  /** Показва „по подразбиране“ като опция (за шрифт на елемент). */
  allowDefault?: boolean;
  label?: string;
}

// Визуален избор на шрифт — всяко име е изписано със СВОЯ шрифт, групирано по
// вид. Ползва се и за глобалния шрифт, и за шрифт на отделен ред/елемент.
export default function FontPicker({ value, onChange, allowDefault, label }: Props) {
  const [open, setOpen] = useState(false);
  const current = FONTS.find((f) => f.id === value);
  const cats = [...new Set(FONTS.map((f) => f.cat))];

  return (
    // Когато менюто е отворено, вдигаме контейнера в собствен stacking context
    // (z-30), за да не се скрива падащото зад следващата карта (card-warm във
    // „жива" тема прави backdrop-filter → нов stacking context).
    <div className={`relative ${open ? "z-30" : ""}`}>
      {label && <span className="field-label">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex items-center justify-between text-left"
        style={{ fontFamily: current ? fontCss(current.id) : undefined }}
      >
        <span>{current ? current.name : allowDefault ? "По подразбиране" : "Избери шрифт"}</span>
        <span aria-hidden className="text-ink-faint">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <ul
            role="listbox"
            className="card-warm absolute z-20 mt-1 max-h-72 w-full overflow-auto p-1 dark:bg-[#2e2620]"
          >
            {allowDefault && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  onClick={() => { onChange(""); setOpen(false); }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-sm hover:bg-tera-pale dark:hover:bg-white/10 vivid:hover:bg-white/10"
                >
                  По подразбиране
                </button>
              </li>
            )}
            {cats.map((cat) => (
              <li key={cat}>
                <div className="px-3 pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                  {cat}
                </div>
                {FONTS.filter((f) => f.cat === cat).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={value === f.id}
                    onClick={() => { onChange(f.id); setOpen(false); }}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-base hover:bg-tera-pale dark:hover:bg-white/10 vivid:hover:bg-white/10 ${value === f.id ? "bg-tera-pale dark:bg-white/10 vivid:bg-white/10" : ""}`}
                    style={{ fontFamily: fontCss(f.id) }}
                  >
                    {f.name}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
