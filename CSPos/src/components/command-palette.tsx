"use client";

// Търсачка на командите (Ctrl+K): бърз преход до всеки екран с клавиатура или тъч.
// Показва само позволеното за сесията — същият списък като менюто.

import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, ArrowElbowDownLeft, Info, SignOut } from "@phosphor-icons/react";
import { matchNav, type NavItem } from "@/lib/nav";
import { NavGlyph } from "./nav-glyph";

type Entry =
  | { kind: "nav"; item: NavItem }
  | { kind: "about" }
  | { kind: "logout" };

export function CommandPalette({
  open,
  items,
  onClose,
  onNavigate,
  onAbout,
  onLogout,
}: {
  open: boolean;
  items: NavItem[];
  onClose: () => void;
  onNavigate: (href: string) => void;
  onAbout: () => void;
  onLogout: () => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = matchNav(q, items).map((item) => ({ kind: "nav", item }));
    const extra: Entry[] = [];
    const nq = q.trim().toLocaleLowerCase("bg-BG");
    if (!nq || "за програмата версия производител".includes(nq)) extra.push({ kind: "about" });
    if (!nq || "изход излизане".includes(nq)) extra.push({ kind: "logout" });
    return [...nav, ...extra];
  }, [q, items]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => setCursor(0), [q]);

  if (!open) return null;

  const run = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    if (e.kind === "nav") onNavigate(e.item.href);
    else if (e.kind === "about") onAbout();
    else onLogout();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-100/25 backdrop-blur-md p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Търсене на екран или действие"
        className="card glass-strong w-full max-w-xl overflow-hidden animate-scale-in shadow-pop"
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-ink-800">
          <MagnifyingGlass size={22} className="text-ink-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, entries.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") run(entries[cursor]);
            }}
            placeholder="Къде искате да отидете?"
            className="flex-1 bg-transparent outline-none text-lg placeholder:text-ink-500"
            aria-controls="cmdk-list"
            aria-activedescendant={entries[cursor] ? `cmdk-${cursor}` : undefined}
          />
          <kbd className="text-xs text-ink-400 rounded-lg border border-ink-700 px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {entries.length === 0 && (
            <li className="px-4 py-6 text-center text-ink-400">Няма екран с такова име. Опитайте „стоки“ или „справка“.</li>
          )}
          {entries.map((e, i) => {
            const selected = i === cursor;
            const base = `flex items-center gap-3 rounded-2xl px-3 min-h-[52px] cursor-pointer ${
              selected ? "bg-white/[0.9] shadow-[0_6px_18px_-8px_rgba(23,32,58,.25)]" : ""
            }`;
            const content =
              e.kind === "nav" ? (
                <>
                  <span className="text-brand-700"><NavGlyph icon={e.item.icon} size={22} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-ink-100">{e.item.label}</span>
                    <span className="block text-xs text-ink-400 truncate">{e.item.hint}</span>
                  </span>
                </>
              ) : e.kind === "about" ? (
                <>
                  <Info size={22} className="text-ink-400" />
                  <span className="flex-1 font-semibold text-ink-100">За програмата</span>
                </>
              ) : (
                <>
                  <SignOut size={22} className="text-coral-600" />
                  <span className="flex-1 font-semibold text-ink-100">Изход</span>
                </>
              );
            return (
              <li
                key={e.kind === "nav" ? e.item.href : e.kind}
                id={`cmdk-${i}`}
                role="option"
                aria-selected={selected}
                className={base}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(e)}
              >
                {content}
                {selected && <ArrowElbowDownLeft size={18} className="text-ink-400" />}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
