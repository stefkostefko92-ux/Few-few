"use client";

// Регистрира service worker-а. Отделен компонент, защото трябва да е клиентски,
// а коренният layout е сървърен.

import { useEffect } from "react";

export default function RegistraSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // В разработка се пречка: кешираната обвивка надживява всяка промяна и
    // човек гони „защо не се обновява" вместо да работи.
    if (process.env.NODE_ENV !== "production") return;
    const id = window.setTimeout(() => {
      // След `load`, не по време на него: регистрацията се бори за същата
      // мрежа, с която се зарежда първата страница.
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        /* без SW приложението работи, просто без офлайн обвивка */
      });
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
