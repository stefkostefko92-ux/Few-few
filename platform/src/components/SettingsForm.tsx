"use client";

import { useState, useTransition } from "react";
import { UploadButton } from "@/components/blocks/UploadButton";
import { FONT_LABEL } from "@/lib/theme";
import {
  updateSiteSettingsAction,
  type SettingsResult,
} from "@/app/dashboard/sites/[slug]/settings/actions";

type Initial = {
  brandColor: string;
  fontFamily: "sans" | "serif" | "rounded";
  logoUrl: string;
  faviconUrl: string;
  navEnabled: boolean;
  footerText: string;
  privacyUrl: string;
};

export function SettingsForm({ slug, initial }: { slug: string; initial: Initial }) {
  const [v, setV] = useState<Initial>(initial);
  const [msg, setMsg] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof Initial>(k: K, val: Initial[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  function save() {
    start(async () => {
      const r = await updateSiteSettingsAction(slug, v);
      setMsg(r);
    });
  }

  return (
    <div className="space-y-6">
      {/* Брандиране */}
      <section className="card space-y-4">
        <h2 className="font-medium text-white">Външен вид</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Основен цвят</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={v.brandColor || "#4f46e5"}
                onChange={(e) => set("brandColor", e.target.value)}
                className="h-9 w-12 rounded border border-ink-700 bg-transparent"
              />
              <input
                className="input"
                placeholder="#4f46e5"
                value={v.brandColor}
                onChange={(e) => set("brandColor", e.target.value)}
              />
            </div>
          </label>
          <label className="block">
            <span className="label">Шрифт</span>
            <select
              className="input"
              value={v.fontFamily}
              onChange={(e) => set("fontFamily", e.target.value as Initial["fontFamily"])}
            >
              {(["sans", "serif", "rounded"] as const).map((f) => (
                <option key={f} value={f}>{FONT_LABEL[f]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Лого</span>
            {v.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.logoUrl} alt="Лого" className="mb-1 h-10 w-auto rounded bg-white p-1" />
            )}
            <UploadButton label="⬆ Качи лого" onUploaded={(url) => set("logoUrl", url)} />
            {v.logoUrl && (
              <button className="mt-1 text-[11px] text-red-400" onClick={() => set("logoUrl", "")}>
                Премахни логото
              </button>
            )}
          </div>
          <div>
            <span className="label">Favicon</span>
            {v.faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.faviconUrl} alt="Favicon" className="mb-1 h-8 w-8 rounded bg-white p-1" />
            )}
            <UploadButton label="⬆ Качи favicon" onUploaded={(url) => set("faviconUrl", url)} />
            {v.faviconUrl && (
              <button className="mt-1 text-[11px] text-red-400" onClick={() => set("faviconUrl", "")}>
                Премахни favicon
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Навигация и футър */}
      <section className="card space-y-4">
        <h2 className="font-medium text-white">Меню и долен колонтитул</h2>
        <label className="flex items-center gap-2 text-sm text-ink-200">
          <input
            type="checkbox"
            checked={v.navEnabled}
            onChange={(e) => set("navEnabled", e.target.checked)}
          />
          Показвай меню/хедър на сайта
        </label>
        <p className="text-[11px] text-ink-600">
          Менюто се съставя автоматично от публикуваните страници (може да ги скриеш
          поотделно от „Настройки на страницата“).
        </p>
        <label className="block">
          <span className="label">Импресум / контакти (футър)</span>
          <textarea
            className="input"
            rows={3}
            placeholder="Фирма ЕООД · ЕИК … · гр. … · тел. … · имейл …"
            value={v.footerText}
            onChange={(e) => set("footerText", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Връзка към политика за поверителност (по избор)</span>
          <input
            className="input"
            placeholder="https://…"
            value={v.privacyUrl}
            onChange={(e) => set("privacyUrl", e.target.value)}
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" disabled={pending} onClick={save}>
          {pending ? "Запазване…" : "Запази настройките"}
        </button>
        {msg?.ok && <span className="text-sm text-green-400">{msg.ok}</span>}
        {msg?.error && <span className="text-sm text-red-400">{msg.error}</span>}
      </div>
    </div>
  );
}
