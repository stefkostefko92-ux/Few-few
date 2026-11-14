"use client";

// Клиентски компонент, за да преброим клика (banner_click) за отчета към
// рекламодателя. Праща се само името на събитието и пътят на страницата —
// без бисквитка и без идентификатор (виж @/lib/events).
//
// Вид: рекламата е в стила на сайта — бяла карта с фина рамка, заглавие в
// синьо. Цветовете на рекламодателя (bgColor/accentColor от админа) са само
// тънка цветна ивица отгоре, за да не спорят с гражданското съдържание.
// Етикетът „Реклама“ е ред над съдържанието (прозрачност, DSA), а не лепенка
// върху ъгъла.
import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { Store } from "@/components/icons";
import { track } from "@/lib/events";
import { SITE } from "@/lib/site";

export type BannerData = {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  bgColor?: string;
  accentColor?: string;
};

function isExternal(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Само цвят в шестнадесетичен запис (#abc, #aabbcc, #aabbccdd) отива в style —
// нищо друго от базата не става CSS.
function safeColor(value?: string): string | null {
  const v = value?.trim() ?? "";
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : null;
}

function countClick() {
  track("banner_click");
}

// Средният бутон на мишката отваря в нов раздел — и това е клик по банера.
function countMiddleClick(e: MouseEvent) {
  if (e.button === 1) track("banner_click");
}

const CARD = "card group flex h-full w-full flex-col overflow-hidden p-0";

// Един рекламен слот. Ако банерът има изображение — показва него; иначе
// текстов банер. Винаги носи етикет „Реклама“ за прозрачност.
export function BannerCard({ banner }: { banner: BannerData }) {
  const href = banner.linkUrl || "/reklama";
  const external = isExternal(href);
  const stripe = safeColor(banner.accentColor) ?? safeColor(banner.bgColor);

  const content: ReactNode = (
    <>
      <span
        aria-hidden
        className={"block h-1.5 w-full shrink-0" + (stripe ? "" : " bg-brand-700")}
        style={stripe ? { backgroundColor: stripe } : undefined}
      />
      <span className="flex flex-1 flex-col p-4 sm:p-5">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="label-caps">Реклама</span>
          {banner.sponsor && <span className="text-meta">{banner.sponsor}</span>}
        </span>
        {banner.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={banner.imageUrl}
            alt={banner.title || banner.sponsor || "Реклама"}
            className="mt-3 h-40 w-full rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <>
            <span className="h-card mt-2 block text-brand-800 group-hover:underline">
              {banner.title}
            </span>
            {banner.description && (
              <span className="mt-1 block text-base text-slate-600 line-clamp-3">
                {banner.description}
              </span>
            )}
          </>
        )}
      </span>
    </>
  );

  return external ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={CARD}
      onClick={countClick}
      onAuxClick={countMiddleClick}
    >
      {content}
      <span className="sr-only"> (отваря се в нов раздел)</span>
    </a>
  ) : (
    <Link href={href} className={CARD} onClick={countClick} onAuxClick={countMiddleClick}>
      {content}
    </Link>
  );
}

// Празен слот — кани нови рекламодатели (покана, а не дупка).
export function BannerEmptySlot() {
  return (
    <Link
      href="/reklama"
      className="card group flex h-full min-h-[11rem] w-full flex-col items-center justify-center gap-2 border-dashed text-center"
    >
      <span className="icon-chip">
        <Store aria-hidden />
      </span>
      <span className="h-card group-hover:underline">Вашата реклама тук</span>
      <span className="text-base text-slate-600">
        само {SITE.payment.monthlyPriceEur}&nbsp;€ на месец
        <span aria-hidden="true">&nbsp;→</span>
      </span>
    </Link>
  );
}
