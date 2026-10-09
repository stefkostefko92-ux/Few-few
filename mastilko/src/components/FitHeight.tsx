"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Мащабът на текста, избран от потребителя (`textScale`), 1 = нормален. */
  scale?: number;
  /** Под този дял от `scale` не смаляваме — нечетимо е; тогава `onOverflow(true)`. */
  min?: number;
  /** Всичко, което мени височината на съдържанието (текст, размер, шрифт…). */
  watch: unknown;
  style?: CSSProperties;
  onOverflow?: (overflowing: boolean) => void;
}

// Блок с фиксирана височина, чийто текст се смалява, докато съдържанието се
// събере. Смалява чрез `--sheet-scale` на поддървото — всички размери в
// студията са `calc(var(--sheet-scale) * N mm)`, така че се мащабира само
// текстът, не оформлението.
//
// Защо: дълго меню излизаше от А4 и продължаваше на втора страница без фон;
// дълъг текст на обява застъпваше откъсващите се ленти; дълъг етикет се
// режеше отгоре и отдолу. Размерите са в mm → намереният мащаб важи и при печат.
export default function FitHeight({ children, scale = 1, min = 0.5, watch, style, onOverflow }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const apply = (f: number) => {
        el.style.setProperty("--sheet-scale", String(scale * f));
        return el.scrollHeight > el.clientHeight + 1;
      };
      let f = 1;
      // Без смаляване досега → само четем (виж бележката във FitText).
      let over = el.style.getPropertyValue("--sheet-scale") === String(scale)
        ? el.scrollHeight > el.clientHeight + 1
        : apply(f);
      // Първа стъпка по съотношението, после ситно — текстът се пренася
      // различно при всеки размер, затова съотношението не е точно.
      if (over) {
        f = Math.max(min, Math.min(0.98, (el.clientHeight / el.scrollHeight) * 1.05));
        over = apply(f);
        for (let i = 0; i < 12 && over && f > min; i++) {
          f = Math.max(min, f * 0.95);
          over = apply(f);
        }
      }
      setFit((old) => (Math.abs(old - f) > 0.001 ? f : old));
      onOverflow?.(over);
    };
    measure();
    let alive = true;
    document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
    // onOverflow нарочно не е зависимост — родителят го подава като нова
    // функция при всеки рендер и това би мерило безкрайно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, scale, min]);

  return (
    <div
      ref={ref}
      style={{ ...style, overflow: "hidden", minHeight: 0, ["--sheet-scale" as string]: String(scale * fit) }}
    >
      {children}
    </div>
  );
}
