"use client";

import { useEffect } from "react";

// Регистрира минималния service worker (public/sw.js), за да е сайтът
// инсталируем като приложение. Не кешира нищо — само препраща към мрежата.
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
