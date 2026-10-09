"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";

// Истински продуктов баркод (EAN-13, EAN-8, UPC, Code128) — генерира се ИЗЦЯЛО
// в браузъра в SVG (mm-мащабируем, чист печат). Нищо не отива навън. При
// невалидна стойност за избрания формат — не рендира (valid callback).

interface Props {
  value: string;
  format?: string;
  color?: string;
  /** Показвай ли числото под баркода. */
  displayValue?: boolean;
  style?: React.CSSProperties;
}

export default function Barcode({ value, format = "CODE128", color = "#111111", displayValue = true, style }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !value.trim()) {
      setOk(false);
      return;
    }
    let valid = false;
    try {
      JsBarcode(el, value.trim(), {
        format,
        lineColor: color,
        background: "transparent",
        displayValue,
        margin: 0,
        fontSize: 16,
        width: 2,
        height: 70,
        valid: (v) => {
          valid = v;
        },
      });
      if (valid) {
        // viewBox + без фиксирани размери → CSS width/height мащабира
        // пропорционално (preserveAspectRatio), за да пасне в mm клетка.
        const w = parseFloat(el.getAttribute("width") || "");
        const h = parseFloat(el.getAttribute("height") || "");
        if (w > 0 && h > 0) {
          el.setAttribute("viewBox", `0 0 ${w} ${h}`);
          el.removeAttribute("width");
          el.removeAttribute("height");
        }
      }
    } catch {
      valid = false;
    }
    setOk(valid);
  }, [value, format, color, displayValue]);

  // SVG-то остава в дървото (JsBarcode пише в него), но го крием при невалидно.
  return <svg ref={ref} style={{ ...style, display: ok ? undefined : "none" }} aria-label="Баркод" />;
}
