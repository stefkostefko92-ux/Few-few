// frontend/src/components/DeferredSections.jsx
import { Children, useEffect, useState, startTransition } from "react";

const STEP = 2; // секции на стъпка

/**
 * Рисува съдържанието под hero-то СЛЕД първото рисуване — по няколко секции
 * на всеки празен момент на браузъра и с startTransition. Преди целият дълъг
 * лендинг се рисуваше наведнъж при старта → TBT ~600–900 ms на мобилен
 * (prelaunch-audit, 08.10.2026); и едно отложено вмъкване на всичко пак беше
 * дълга задача, затова — на порции. Hero-то (LCP) не чака нищо. Котва в адреса
 * (/#pricing от Условията) се намира, щом всички секции се появят.
 */
export default function DeferredSections({ children }) {
  const items = Children.toArray(children);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= items.length) return undefined;
    const go = () => startTransition(() => setShown((n) => Math.min(items.length, n + STEP)));
    const ric = typeof window.requestIdleCallback === "function";
    const id = ric ? window.requestIdleCallback(go, { timeout: shown ? 300 : 700 }) : window.setTimeout(go, shown ? 16 : 50);
    return () => (ric ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, [shown, items.length]);

  useEffect(() => {
    if (shown < items.length || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) window.requestAnimationFrame(() => el.scrollIntoView());
  }, [shown, items.length]);

  return (
    <>
      {items.slice(0, shown)}
      {shown < items.length && <div aria-hidden="true" style={{ minHeight: "100vh" }} />}
    </>
  );
}
