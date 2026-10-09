"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ColorVisionToggle from "@/components/ColorVisionToggle";

interface Props {
  /** Кратко описание какво ще се отпечата, напр. „21 етикета на лист А4“. */
  summary: string;
}

// Лента с бутон за печат + съветите, без които домашният печат се разминава.
export default function PrintBar({ summary }: Props) {
  const [crop, setCrop] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("crop-on", crop);
    return () => document.documentElement.classList.remove("crop-on");
  }, [crop]);

  return (
    // flex-wrap, не „sm:flex-row“: лентата живее и в тясна колона (таблет,
    // двуколонно), където екранът е широк, а мястото — не; там бутонът
    // излизаше извън страницата.
    <div className="no-print card-warm flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-[1_1_16rem]">
        <p className="font-semibold">{summary}</p>
        <p className="text-sm text-ink-soft">
          В прозореца за печат избери <strong>мащаб 100%</strong> и{" "}
          <strong>полета: без</strong> — така размерите в милиметри са точни.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <ColorVisionToggle />
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            <input
              type="checkbox"
              checked={crop}
              onChange={(e) => setCrop(e.target.checked)}
              className="h-4 w-4 accent-tera"
            />
            Резници за печатница
          </label>
        </div>
      </div>
      <button type="button" onClick={() => window.print()} className="btn-primary w-full shrink-0 justify-center sm:w-auto">
        <Icon name="print" /> Принтирай / запази PDF
      </button>
    </div>
  );
}
