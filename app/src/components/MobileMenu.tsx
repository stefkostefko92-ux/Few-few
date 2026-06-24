"use client";

import { useState } from "react";
import Link from "next/link";
import { PRIMARY_NAV } from "@/lib/site";
import { Menu } from "@/components/icons";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-base font-medium text-slate-800"
      >
        <Menu className="h-5 w-5" aria-hidden />
        Меню
      </button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Меню"
          className="absolute left-0 right-0 z-50 border-b border-slate-200 bg-white shadow-lg"
        >
          <ul className="container-content grid grid-cols-1 gap-1 py-3 sm:grid-cols-2">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block min-h-[44px] rounded-lg px-3 py-2 text-base font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/razdeli"
                onClick={() => setOpen(false)}
                className="block min-h-[44px] rounded-lg px-3 py-2 text-base font-semibold text-brand-700 hover:bg-brand-50"
              >
                Всички раздели
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
