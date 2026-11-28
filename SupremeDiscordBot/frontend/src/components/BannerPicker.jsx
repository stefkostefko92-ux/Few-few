// frontend/src/components/BannerPicker.jsx — „Банер в Discord“ за панелите за тикети и верификация.
//
// Готовите банери „Токсична броня“ (public/banners, scripts/build-banners.mjs) с един клик.
// Пише в imageUrl на панела пълен публичен адрес — Discord тегли картинката оттам. Без
// текст и лого, за да пасват и на white-label сървъри. Собствена картинка, зададена по-рано,
// се пази и показва като отделен избор — нищо не се губи, ако човекът не я пипне.
import { useState } from "react";
import { useT } from "../contexts/I18nContext.jsx";
import { SITE } from "./Seo.jsx";

export const BANNER_IDS = ["reactor", "armor", "shield", "gold"];

/** Каноничният публичен адрес — Discord тегли картинката оттам. Не текущият origin:
 *  от localhost/IP/друг хост би записал адрес, който Discord не може да изтегли (ревю). */
export function bannerUrl(id, origin = SITE) {
  return `${origin}/banners/${id}.jpg`;
}

/** Кой готов банер е избран (или "none" / "custom"). Точно сравнение — чужд адрес,
 *  завършващ на /banners/gold.jpg, е собствена картинка, не нашият банер. */
export function bannerChoice(value) {
  if (!value) return "none";
  const hit = BANNER_IDS.find((id) => value === bannerUrl(id));
  return hit || "custom";
}

export default function BannerPicker({ value, onChange, idPrefix = "banner" }) {
  const { t } = useT();
  const current = bannerChoice(value);
  // Собствената картинка, с която редакторът е отворен, остава избор дори след клик на
  // готов банер — иначе един клик я губеше без начин да се върне (ревю на Кодаджията).
  const [original] = useState(value);
  const customUrl = current === "custom" ? value : bannerChoice(original) === "custom" ? original : null;
  const name = `${idPrefix}-choice`;
  const options = [
    { id: "none", label: t("banner.none") },
    ...BANNER_IDS.map((id) => ({ id, label: t(`banner.${id}`), img: `/banners/${id}.jpg` })),
    ...(customUrl ? [{ id: "custom", label: t("banner.custom") }] : []),
  ];
  return (
    <fieldset>
      <legend className="cs-label">{t("banner.label")}</legend>
      <p className="text-xs text-cs-dim mb-2">{t("banner.hint")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map((o) => {
          const checked = current === o.id;
          return (
            <label
              key={o.id}
              className={`relative block cursor-pointer rounded border p-1.5 transition-[border-color,box-shadow] ${
                checked ? "border-cs-cyan shadow-[0_0_14px_rgba(143,230,0,0.25)]" : "border-cs-border hover:border-cs-cyan/50"
              }`}
            >
              <input
                type="radio"
                className="sr-only peer"
                name={name}
                id={`${idPrefix}-${o.id}`}
                checked={checked}
                onChange={() => {
                  if (o.id === "none") onChange("");
                  else if (o.id === "custom") onChange(customUrl);
                  else onChange(bannerUrl(o.id));
                }}
              />
              <span className="block aspect-[3/1] rounded-sm overflow-hidden bg-cs-bg cs-panel">
                {o.img ? (
                  <img src={o.img} alt="" width="240" height="80" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : o.id === "custom" ? (
                  <span className="flex w-full h-full items-center justify-center px-2 text-[11px] text-cs-muted break-all">{customUrl}</span>
                ) : null}
              </span>
              <span className={`mt-1 block text-xs font-semibold ${checked ? "text-cs-cyan" : "text-cs-muted"}`}>{o.label}</span>
              <span className="pointer-events-none absolute inset-0 rounded peer-focus-visible:ring-2 peer-focus-visible:ring-cs-cyan" aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
