import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ShieldCheck } from "@/components/icons";
import { TelLink } from "@/components/TelLink";
import { SITE } from "@/lib/site";
import { getFacebookUrl, getViberChannelUrl } from "@/lib/settings";

// „Истинският ни адрес и какво никога няма да поискаме“. Сайт, който учи хората
// да разпознават измами, сам е мишена за копиране — затова казваме ясно кои
// са единствените ни канали. Домейнът, телефонът и имейлът идват САМО от
// SITE (src/lib/site.ts), никога на ръка: сменят ли се, картата се сменя с тях.
// Текстът е за безопасност — само на български, без машинен превод.
export const NEVER_ASK = "Никога не искаме пари, ЕГН, ПИН, кодове от SMS или данни на карта.";

/**
 * Адрес с позволено пренасяне само на смислено място: след „@“ в имейл и след
 * първата точка в домейн („zabobovdol.“ | „carbonstealth.eu“). Така адресът
 * не се цепи насред думата („carbonstealth.e / u“) — точно в картата, която
 * учи хората да го проверяват буква по буква.
 */
export function breakableAddress(text: string): ReactNode {
  const at = text.indexOf("@");
  const cut = at >= 0 ? at + 1 : text.indexOf(".") + 1;
  if (cut <= 0 || cut >= text.length) return text;
  return (
    <Fragment>
      {text.slice(0, cut)}
      <wbr />
      {text.slice(cut)}
    </Fragment>
  );
}

/**
 * Текст, в който се споменава домейнът на сайта („Отворете
 * zabobovdol.carbonstealth.eu в Safari…“): домейнът се пренася само след
 * „zabobovdol.“ (breakableAddress) — иначе на 320px той е по-широк от
 * колоната и страницата прелива.
 */
export function withBreakableDomain(text: string): ReactNode {
  const parts = text.split(SITE.domain);
  if (parts.length === 1) return text;
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && breakableAddress(SITE.domain)}
    </Fragment>
  ));
}

export async function TrustCard({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  if (variant === "compact") {
    // Светла карта — стои и върху тъмносиния футър.
    return (
      <div
        className={
          "rounded-2xl border border-slate-200 bg-white p-4 text-base text-slate-700 shadow-sm sm:p-5 " +
          className
        }
      >
        <p className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
          <span className="min-w-0">
            <strong className="text-slate-900">
              Истинският ни адрес е само {breakableAddress(SITE.domain)}.
            </strong>{" "}
            {NEVER_ASK}{" "}
            <Link href="/izmami" className="link">
              Как да се пазите от измами<span aria-hidden="true">&nbsp;→</span>
            </Link>
          </span>
        </p>
      </div>
    );
  }

  const [facebookUrl, viberUrl] = await Promise.all([getFacebookUrl(), getViberChannelUrl()]);
  const link = "font-semibold text-brand-700 underline underline-offset-2";

  return (
    <section
      aria-labelledby="trust-card-title"
      className={"rounded-2xl border-2 border-brand-200 bg-brand-50 p-5 sm:p-6 " + className}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
        <h2 id="trust-card-title" className="text-2xl font-bold text-slate-900">
          Истинският ни адрес и какво никога няма да поискаме
        </h2>
      </div>

      {/* Домейнът на свой ред — като адресната лента, която човек сравнява. */}
      <p className="mt-3 text-lg text-slate-800">
        Истинският ни адрес в интернет е само
        <strong className="mt-1 block text-xl font-bold text-slate-900">
          {breakableAddress(SITE.domain)}
        </strong>
        Проверете го в полето с адреса на браузъра, преди да напишете каквото и да е.
      </p>

      <ul className="mt-4 space-y-2 text-lg text-slate-800">
        {SITE.contact.phone && (
          <li>
            Нашият телефон:{" "}
            <TelLink phone={SITE.contact.phone} className={link + " whitespace-nowrap"} />
          </li>
        )}
        {SITE.contact.email && (
          <li>
            Нашият имейл:{" "}
            <a href={`mailto:${SITE.contact.email}`} className={link}>
              {breakableAddress(SITE.contact.email)}
            </a>
          </li>
        )}
        {facebookUrl && (
          <li>
            Във Facebook — само{" "}
            <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className={link}>
              тази страница
            </a>
          </li>
        )}
        {viberUrl && (
          <li>
            Във Viber — само{" "}
            <a href={viberUrl} target="_blank" rel="noopener noreferrer" className={link}>
              този канал
            </a>
          </li>
        )}
      </ul>

      <p className="mt-4 rounded-xl border border-crimson-200 bg-white p-4 text-xl font-bold text-slate-900">
        {NEVER_ASK}
      </p>

      <p className="mt-3 text-lg text-slate-800">
        Ако някой ви търси от наше име по друг начин или иска такива неща — това е
        измама. Затворете и ни се обадете на горния телефон.
      </p>
      <p className="mt-2 text-base text-slate-600">
        Сайтът е безплатен за жителите. Платена е само рекламата за фирми — и то
        след заявка от самата фирма през страница „
        <Link href="/reklama" className="font-medium text-brand-700 underline underline-offset-2">
          Реклама
        </Link>
        “.
      </p>
    </section>
  );
}
