"use client";

import { useEffect } from "react";

// Регистрира service worker-а (public/sw.js) за офлайн работа. Тихо: ако
// браузърът не поддържа SW или регистрацията се провали, сайтът работи нормално.
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
