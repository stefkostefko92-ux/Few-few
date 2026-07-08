"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MM_TO_PX = 96 / 25.4;

interface Props {
  children: ReactNode;
  /** false → листът расте по съдържанието (CV на няколко страници). */
  fixedHeight?: boolean;
  /** true → хоризонтален А4 (297 × 210) — за грамоти. */
  landscape?: boolean;
  /** Допълнителен стил на самия лист (напр. шрифт от персонализацията). */
  style?: React.CSSProperties;
}

// Показва истински А4 лист (в mm), смален с transform до широчината на
// контейнера. При печат мащабът се маха (.print-area { transform: none }).
// Хоризонталните листове инжектират @page landscape, докато са монтирани.
export default function SheetPreview({
  children,
  fixedHeight = true,
  landscape = false,
  style,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const wMm = landscape ? 297 : 210;
  const hMm = landscape ? 210 : 297;
  const wPx = wMm * MM_TO_PX;
  const hPx = hMm * MM_TO_PX;
  const [scale, setScale] = useState(0.5);
  const [contentH, setContentH] = useState(hPx);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, wrap.clientWidth / wPx));
      if (innerRef.current) {
        setContentH(Math.max(hPx, innerRef.current.offsetHeight));
      }
    });
    ro.observe(wrap);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [wPx, hPx]);

  const h = fixedHeight ? hPx : contentH;

  return (
    <div ref={wrapRef} className="w-full">
      {/* @page е глобален; докато този лист е на екрана, задава ориентацията. */}
      {landscape && (
        <style>{"@media print{@page{size:A4 landscape;margin:0}}"}</style>
      )}
      <div style={{ height: h * scale }} className="overflow-hidden">
        <div
          className="print-area origin-top-left"
          style={{ transform: `scale(${scale})`, width: wPx }}
        >
          <div
            ref={innerRef}
            className="sheet relative border border-ink/10 bg-white shadow-lift"
            style={{
              width: `${wMm}mm`,
              ...(fixedHeight ? { height: `${hMm}mm` } : { minHeight: `${hMm}mm` }),
              ...style,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
