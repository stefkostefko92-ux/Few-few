"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MM_TO_PX = 96 / 25.4;
const A4_W_PX = 210 * MM_TO_PX;
const A4_H_PX = 297 * MM_TO_PX;

interface Props {
  children: ReactNode;
  /** false → листът расте по съдържанието (CV на няколко страници). */
  fixedHeight?: boolean;
}

// Показва истински А4 лист (в mm), смален с transform до широчината на
// контейнера. При печат мащабът се маха (.print-area { transform: none }).
export default function SheetPreview({ children, fixedHeight = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [contentH, setContentH] = useState(A4_H_PX);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, wrap.clientWidth / A4_W_PX));
      if (innerRef.current) {
        setContentH(Math.max(A4_H_PX, innerRef.current.offsetHeight));
      }
    });
    ro.observe(wrap);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  const h = fixedHeight ? A4_H_PX : contentH;

  return (
    <div ref={wrapRef} className="w-full">
      <div style={{ height: h * scale }} className="overflow-hidden">
        <div
          className="print-area origin-top-left"
          style={{ transform: `scale(${scale})`, width: A4_W_PX }}
        >
          <div
            ref={innerRef}
            className="sheet relative border border-ink/10 bg-white shadow-lift"
            style={{
              width: "210mm",
              ...(fixedHeight
                ? { height: "297mm" }
                : { minHeight: "297mm" }),
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
