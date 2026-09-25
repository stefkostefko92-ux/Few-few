"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Мащаб „пиксели на единица“ за „Преглед отблизо“: най-много `max`, но не
 * повече, отколкото позволява широчината на контейнера за `units` единици.
 *
 * Прегледът беше с фиксирани пиксели (поканата — 620 px) в блок с
 * overflow-x-auto: на телефон се виждаше половин картичка без знак, че
 * има още. Сега се смалява, за да се вижда цялата.
 */
export function useFitWidth<T extends HTMLElement>(units: number, max: number) {
  const ref = useRef<T>(null);
  const [perUnit, setPerUnit] = useState(max);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setPerUnit(Math.min(max, el.clientWidth / units));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [units, max]);

  return [ref, perUnit] as const;
}
