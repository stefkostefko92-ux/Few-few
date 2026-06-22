"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("cookie-ok") !== "1") setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!show) return null;

  function accept() {
    try {
      localStorage.setItem("cookie-ok", "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white p-4 shadow-lg no-print">
      <div className="container-content flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base text-slate-700">
          Ползваме само минимум локално съхранение (за настройките за достъпност). Без
          реклами и проследяване.{" "}
          <Link href="/biskvitki" className="font-medium text-brand-700 underline">
            Научи повече
          </Link>
          .
        </p>
        <button type="button" onClick={accept} className="btn-primary shrink-0">
          Разбрах
        </button>
      </div>
    </div>
  );
}
