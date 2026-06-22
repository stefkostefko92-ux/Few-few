"use client";

import { useEffect, useState } from "react";
import { SITE } from "@/lib/site";

type Weather = { temp: number; code: number };

// Кратко словесно описание по кода на Open-Meteo (WMO).
function describe(code: number): string {
  if (code === 0) return "Ясно";
  if (code <= 3) return "Облачно";
  if (code <= 48) return "Мъгла";
  if (code <= 67) return "Дъжд";
  if (code <= 77) return "Сняг";
  if (code <= 82) return "Превалявания";
  if (code <= 86) return "Снеговалеж";
  return "Гръмотевици";
}

export function WeatherWidget() {
  const [w, setW] = useState<Weather | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${SITE.geo.latitude}&longitude=${SITE.geo.longitude}&current=temperature_2m,weather_code`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const t = d?.current?.temperature_2m;
        const c = d?.current?.weather_code;
        if (typeof t === "number" && typeof c === "number") {
          setW({ temp: Math.round(t), code: c });
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-700 shadow-sm">
      <span aria-hidden>🌤️</span>
      <span className="font-medium">Дупница:</span>
      {w ? (
        <span>
          {w.temp}°C · {describe(w.code)}
        </span>
      ) : (
        <span className="text-slate-400">зареждане…</span>
      )}
    </div>
  );
}
