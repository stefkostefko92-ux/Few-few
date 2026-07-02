"use client";

import { useEffect } from "react";

// Регистрира service worker-а (public/sw.js): прави сайта инсталируем като
// приложение и дава офлайн резерв за най-важните страници (телефони, дежурна
// аптека) при слаб сигнал. /admin и /api не се кешират.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* без SW само инсталирането не работи — не е критично */
      });
    }
  }, []);
  return null;
}
