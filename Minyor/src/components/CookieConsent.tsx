"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const KEY = "mbd_cookie_consent_v1";

export function CookieConsent() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* localStorage недостъпен */
    }
  }, []);

  if (pathname?.startsWith("/admin")) return null;
  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ value: "ack", at: new Date().toISOString() }),
      );
    } catch {
      /* игнорираме */
    }
    setShow(false);
  };

  // Информативно известие, не „съгласие“: сайтът не използва нетехнически
  // бисквитки или проследяване, затова няма какво да се избира — само потвърждение.
  return (
    <div
      role="region"
      aria-label="Известие за бисквитки"
      className="no-print fixed inset-x-0 bottom-0 z-[60] border-t border-slate-200 bg-white/95 backdrop-blur"
    >
      <div className="container-content flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          Този сайт използва само технически необходими бисквитки за основната си
          работа. Не използваме рекламно проследяване. Вижте{" "}
          <Link href="/biskvitki" className="font-medium text-brand-800 underline">
            Политиката за бисквитки
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="btn-primary whitespace-nowrap"
          >
            Разбрах
          </button>
        </div>
      </div>
    </div>
  );
}
