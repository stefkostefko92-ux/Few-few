"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";

interface Props {
  text: string;
  /** Желаният размер (CSS, напр. `calc(var(--sheet-scale, 1) * 9mm)`). */
  fontSize: string;
  style?: CSSProperties;
  /** Всичко друго, което мени широчината на текста (напр. мащаб на текста). */
  watch?: unknown;
}

// Текст, който се смалява, докато и най-дългата му дума се събере в полето.
//
// Дума не се пренася, затова една дълга („АДМИНИСТРАЦИЯТА“, дълга фамилия,
// „БЕЗПЛАТНО“ върху тесния талон на ваучер) излизаше извън етикета/колоната
// и при печат се режеше от ръба. Оценка по брой букви не стига — шрифтът е
// избираем и широчината му не се знае предварително, затова мерим след
// рендер. Размерите са в mm и не зависят от екранния мащаб на прегледа, така
// че намереният размер важи и при печат.
export default function FitText({ text, fontSize, style, watch }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const family = style?.fontFamily;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Мерим без пренасяне по букви: преливът = някоя дума не се събира.
      el.style.fontSize = fontSize;
      el.style.overflowWrap = "normal";
      const ratio = el.scrollWidth > el.clientWidth + 1 ? el.clientWidth / el.scrollWidth : 1;
      if (ratio < 1) el.style.fontSize = `calc(${fontSize} * ${(ratio * 0.98).toFixed(3)})`;
      el.style.overflowWrap = "anywhere";
    };
    fit();
    // Уеб шрифтът може да дойде след първото мерене — премери тогава.
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
    };
  }, [text, fontSize, family, watch]);

  return (
    <div
      ref={ref}
      // maxWidth/minWidth: като flex елемент блокът иначе расте до широчината
      // на думата и преливът не се вижда в clientWidth.
      style={{ ...style, fontSize, maxWidth: style?.maxWidth ?? "100%", minWidth: 0, overflowWrap: "anywhere" }}
    >
      {text}
    </div>
  );
}
