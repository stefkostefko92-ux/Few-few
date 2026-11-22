"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudRain, CloudSnow, Sun, CloudSun, CloudFog, Zap } from "@/components/icons";
import { SITE } from "@/lib/site";

type Now = { temp: number; code: number; max?: number; min?: number };
type State = { kind: "loading" } | { kind: "ok"; data: Now } | { kind: "failed" };

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

// Кутията е с еднакъв размер при зареждане, с данни и при грешка — мястото е
// запазено от първото рисуване и панелът „Днес“ не подскача, когато
// прогнозата пристигне (CLS). Без рамка и сянка: това е вложена кутия в
// панела, не карта в картата.
const BOX =
  "no-print flex min-h-[4.75rem] w-full items-center gap-3 rounded-xl bg-paper-muted px-4 py-2.5 sm:w-auto sm:min-w-[17.5rem]";

export function WeatherWidget() {
  const [state, setState] = useState<State>({ kind: "loading" });

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
          setState({ kind: "failed" });
          return;
        }
        setState({
          kind: "ok",
          data: {
            temp,
            code: typeof code === "number" ? code : 0,
            max: typeof max === "number" ? max : undefined,
            min: typeof min === "number" ? min : undefined,
          },
        });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className={BOX} aria-busy="true">
        <span className="sr-only">Зареждаме времето…</span>
        <span aria-hidden className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
        <span aria-hidden className="flex-1 space-y-2">
          <span className="block h-5 w-32 animate-pulse rounded-lg bg-slate-200" />
          <span className="block h-4 w-24 animate-pulse rounded-lg bg-slate-200" />
        </span>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div className={BOX}>
        <Cloud className="h-9 w-9 shrink-0 text-slate-500" aria-hidden />
        <p className="text-base leading-snug text-slate-600">
          Прогнозата за времето сега не е налична.
        </p>
      </div>
    );
  }

  const { data } = state;
  const { label, Icon } = describe(data.code);
  const hasRange = typeof data.max === "number" && typeof data.min === "number";

  return (
    <div className={BOX}>
      <Icon className="h-9 w-9 shrink-0 text-brand-700" aria-hidden />
      {/* Температурата отляво, описанието и макс./мин. — два реда вдясно:
          височината е една и съща при всяко описание (като скелета). */}
      <p className="shrink-0 text-3xl font-bold leading-none tabular-nums text-slate-900">
        <span className="sr-only">Времето в {SITE.geo.city} сега: </span>
        {Math.round(data.temp)}°
      </p>
      <div className="min-w-0 leading-snug">
        <p className="text-base text-slate-700">{label}</p>
        {hasRange && (
          <p className="text-sm tabular-nums text-slate-600">
            макс. {Math.round(data.max as number)}° · мин. {Math.round(data.min as number)}°
          </p>
        )}
      </div>
    </div>
  );
}
