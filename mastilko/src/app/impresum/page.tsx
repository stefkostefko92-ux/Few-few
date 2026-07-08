import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import { PUBLISHER, ADDRESS_ONE_LINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Импресум и контакти",
  description:
    "Импресум на Мастилко: издател Carbon Stealth VCC, гр. Бобов дол — юридически данни, адрес и контакти съгласно чл. 4 ЗЕТ и Директива 2000/31/ЕО.",
  alternates: { canonical: "/impresum" },
  ...pageMeta(
    "Импресум и контакти · Мастилко",
    "Издател Carbon Stealth VCC, гр. Бобов дол. Юридически данни и контакти.",
  ),
};

// Импресум (задължителна идентификация на доставчика на услугата) —
// чл. 4 от Закона за електронната търговия / чл. 5 от Директива 2000/31/ЕО.
export default function ImpresumPage() {
  const row = "flex flex-col gap-0.5 sm:flex-row sm:gap-3";
  const key = "min-w-[11rem] font-semibold text-ink";
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Импресум и контакти</h1>
      <p className="mt-2 text-sm text-ink-faint">
        Задължителна информация по чл. 4 от Закона за електронната търговия
        (Директива 2000/31/ЕО).
      </p>

      <section className="mt-8 space-y-6 text-ink-soft [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink">
        <div>
          <h2>Издател на Мастилко</h2>
          <div className="mt-3 space-y-2">
            <div className={row}>
              <span className={key}>Юридическо лице</span>
              <span>{PUBLISHER.legalName}</span>
            </div>
            <div className={row}>
              <span className={key}>Седалище и адрес</span>
              <span>{ADDRESS_ONE_LINE}</span>
            </div>
            <div className={row}>
              <span className={key}>ЕИК</span>
              <span>{PUBLISHER.eik}</span>
            </div>
            <div className={row}>
              <span className={key}>ДДС №</span>
              <span>{PUBLISHER.vat}</span>
            </div>
            <div className={row}>
              <span className={key}>Имейл</span>
              <span>
                <a className="text-tera-dark underline" href={`mailto:${PUBLISHER.email}`}>
                  {PUBLISHER.email}
                </a>
              </span>
            </div>
            <div className={row}>
              <span className={key}>Телефон</span>
              <span>
                <a className="text-tera-dark underline" href={`tel:${PUBLISHER.phone.replace(/\s/g, "")}`}>
                  {PUBLISHER.phone}
                </a>
              </span>
            </div>
            <div className={row}>
              <span className={key}>Уебсайт</span>
              <span>
                <a className="text-tera-dark underline" href={PUBLISHER.url} rel="noopener">
                  carbonstealth.eu
                </a>
              </span>
            </div>
            <div className={row}>
              <span className={key}>Работно време</span>
              <span>{PUBLISHER.hours}</span>
            </div>
          </div>
        </div>

        <div>
          <h2>Дейност</h2>
          <p className="mt-2">
            Carbon Stealth VCC е дигитална агенция (уеб разработка, ERP системи
            и SEO). Мастилко е безплатен инструмент, предоставян като услуга на
            обществото — без регистрация и без заплащане.
          </p>
        </div>

        <div>
          <h2>Надзорни органи</h2>
          <p className="mt-2">
            Защита на личните данни: Комисия за защита на личните данни (КЗЛД),{" "}
            <a className="text-tera-dark underline" href="https://www.cpdp.bg" rel="noopener noreferrer">
              cpdp.bg
            </a>
            . Защита на потребителите: Комисия за защита на потребителите (КЗП),{" "}
            <a className="text-tera-dark underline" href="https://kzp.bg" rel="noopener noreferrer">
              kzp.bg
            </a>
            . Онлайн решаване на спорове (ОРС) на ЕК:{" "}
            <a
              className="text-tera-dark underline"
              href="https://ec.europa.eu/consumers/odr"
              rel="noopener noreferrer"
            >
              ec.europa.eu/consumers/odr
            </a>
            .
          </p>
        </div>

        <div>
          <h2>Правни документи</h2>
          <p className="mt-2">
            <a className="text-tera-dark underline" href="/poveritelnost">
              Политика за поверителност
            </a>{" "}
            ·{" "}
            <a className="text-tera-dark underline" href="/usloviya">
              Условия за ползване
            </a>
          </p>
        </div>
      </section>
    </article>
  );
}
