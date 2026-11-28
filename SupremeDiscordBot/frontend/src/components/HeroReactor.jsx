// frontend/src/components/HeroReactor.jsx — решава дали и кога да зареди 3D реактора.
//
// Героят на началната страница е LCP: заглавието и картинката трябва да изрисуват
// веднага. Затова three.js (отделен чънк ReactorScene) се дърпа чак когато браузърът
// е свободен, и изобщо не се дърпа, ако човекът е поискал по-малко движение или
// пести данни. Без 3D героят изглежда както досега — картинката и лаймовото сияние.
import { lazy, Suspense, useEffect, useState } from "react";

const ReactorScene = lazy(() => import("./ReactorScene.jsx"));

export function wants3D(win = typeof window !== "undefined" ? window : undefined) {
  if (!win) return false;
  if (win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  if (win.navigator?.connection?.saveData) return false;
  return true;
}

export default function HeroReactor({ className = "" }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!wants3D()) return undefined;
    const go = () => setOn(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(go, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = setTimeout(go, 1200);
    return () => clearTimeout(id);
  }, []);
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <ReactorScene className={className} />
    </Suspense>
  );
}
