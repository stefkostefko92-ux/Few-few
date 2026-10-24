"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import ColorVisionToggle from "@/components/ColorVisionToggle";

interface Props {
  /** Кратко описание какво ще се отпечата, напр. „21 етикета на лист А4“. */
  summary: string;
}

const OFFSET_KEY = "mastilko-print-offset";
const clampMm = (v: number) => Math.max(-10, Math.min(10, Math.round(v * 2) / 2));

// Лента с бутон за печат + съветите, без които домашният печат се разминава.
export default function PrintBar({ summary }: Props) {
  const [crop, setCrop] = useState(false);
  // Калибриране: изместване на печата в mm. Пази се в този браузър (т.е. за
  // този принтер) — функционална настройка, нищо не излиза навън.
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    document.documentElement.classList.toggle("crop-on", crop);
    return () => document.documentElement.classList.remove("crop-on");
  }, [crop]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OFFSET_KEY) || "null");
      // Прочит от localStorage — достъпен чак в браузъра, веднъж при монтиране.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v && typeof v.dx === "number") setDx(clampMm(v.dx));
      if (v && typeof v.dy === "number") setDy(clampMm(v.dy));
    } catch {
      /* повреден запис → без изместване */
    }
  }, []);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--print-dx", `${dx}mm`);
    root.setProperty("--print-dy", `${dy}mm`);
    try {
      if (dx || dy) localStorage.setItem(OFFSET_KEY, JSON.stringify({ dx, dy }));
      else localStorage.removeItem(OFFSET_KEY);
    } catch {
      /* забранено хранилище → важи само докато страницата е отворена */
    }
  }, [dx, dy]);

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
        <details className="mt-2 text-sm" open={dx !== 0 || dy !== 0}>
          <summary className="cursor-pointer font-semibold text-ink-soft">
            Калибриране на принтера{dx || dy ? ` (изместено ${dx} / ${dy} mm)` : ""}
          </summary>
          <p className="mt-1 text-xs text-ink-soft">
            Отпечатай на обикновена хартия и я сложи върху листа с етикети срещу
            светлината. Ако печатът е избягал надясно с 2 mm, въведи −2 по
            хоризонтала; надолу — минус по вертикала. Пази се за този браузър.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            {([
              ["Хоризонтално (mm)", dx, setDx],
              ["Вертикално (mm)", dy, setDy],
            ] as const).map(([label, v, setV]) => (
              <label key={label} className="text-xs font-semibold text-ink-soft">
                {label}
                <input
                  type="number"
                  step={0.5}
                  min={-10}
                  max={10}
                  value={v}
                  onChange={(e) => setV(clampMm(Number(e.target.value) || 0))}
                  className="field-input !w-24 !py-1"
                />
              </label>
            ))}
            {(dx !== 0 || dy !== 0) && (
              <button type="button" className="btn-secondary text-xs" onClick={() => { setDx(0); setDy(0); }}>
                Нулирай
              </button>
            )}
          </div>
        </details>
      </div>
      <button type="button" onClick={() => window.print()} className="btn-primary w-full shrink-0 justify-center sm:w-auto">
        <Icon name="print" /> Принтирай / запази PDF
      </button>
    </div>
  );
}
