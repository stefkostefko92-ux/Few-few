"use client";

import { useEffect } from "react";

/**
 * Затворените <details> не се печатат — на хартия отговорите липсваха.
 * Преди печат отваря всички <details> на страницата, след печат връща
 * затворените обратно. Нищо не рисува.
 */
export function OpenDetailsOnPrint() {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")];
      for (const d of opened) d.open = true;
    };
    const after = () => {
      for (const d of opened) d.open = false;
      opened = [];
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return null;
}
