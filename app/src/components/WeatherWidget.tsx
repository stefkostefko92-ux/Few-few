"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudFog, Zap } from "@/components/icons";
import { SITE } from "@/lib/site";

type Now = { temp: number; code: number; max: number; min: number };

// Кодове за времето (WMO) → текст и иконка. Групираме грубо, за да е разбираемо.
function describe(code: number): { label: string; Icon: typeof Sun } {
  if (code === 0) return { label: "Ясно", Icon: Sun };
  if (code <= 2) return { label: "Предимно слънчево", Icon: CloudSun };
  if (code === 3) return { label: "Облачно", Icon: Cloud };
  if (code <= 48) return { label: "Мъгла", Icon: CloudFog };
  if (code <= 67) return { label: "Дъжд", Icon: CloudRain };
  if (code <= 77) return { label: "Сняг", Icon: CloudSnow };
  if (code <= 82) return { label: "Превалявания", Icon: CloudRain };
  if (code <= 86) return { label: "Снеговалеж", Icon: CloudSnow };
  return { label: "Гръмотевици", Icon: Zap };
}

export function WeatherWidget() {
  const [data, setData] = useState<Now | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const { latitude, longitude } = SITE.geo;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
      `&timezone=Europe%2FSofia&forecast_days=1`;
    let cancelled = false;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const temp = j?.current?.temperature_2m;
        const code = j?.current?.weather_code;
        const max = j?.daily?.temperature_2m_max?.[0];
        const min = j?.daily?.temperature_2m_min?.[0];
        if (typeof temp !== "number") {
          setFailed(true);
          return;
        }
        setData({ temp, code: code ?? 0, max, min });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Ако времето не може да се зареди, не показваме нищо (тихо).
  if (failed || !data) return null;

  const { label, Icon } = describe(data.code);

  return (
    <div className="no-print flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <Icon className="h-9 w-9 shrink-0 text-brand-600" aria-hidden />
      <div className="leading-tight">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{Math.round(data.temp)}°</span>
          <span className="text-sm text-slate-600">{label}</span>
        </div>
        <div className="text-xs text-slate-500">
          {SITE.geo.city}
          {typeof data.max === "number" && typeof data.min === "number" && (
            <>
              {" · "}
              {Math.round(data.max)}° / {Math.round(data.min)}°
            </>
          )}
        </div>
      </div>
    </div>
  );
}
