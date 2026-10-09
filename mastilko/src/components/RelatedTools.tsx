import Link from "next/link";
import { catalogById } from "@/lib/mcp/catalog";

/**
 * Блок „Наричат го още“ + „Свързани инструменти“ на дъното на инструментна
 * страница.
 *
 * Защо съществува: до момента 14-те инструментни страници бяха листа без НИКАКВА
 * връзка помежду си — единствените вътрешни линкове идваха от хедъра и футъра.
 * Това хем разпилява авторитета на страниците, хем оставя търсачките без
 * контекст кое с кое си прилича.
 *
 * `aliases` е втората половина от работата: истинските думи, с които хората
 * търсят същото нещо („лепенки за буркани“, „бизнес карти“, „резюме“). Стоят
 * като видим, честен текст — не скрит keyword stuffing.
 */

type Tool = { href: string; label: string; blurb: string };

const TOOLS: Record<string, Tool> = {
  "/etiketi": {
    href: "/etiketi",
    label: "Етикети за печат",
    blurb: "11 размера, списъци, номерация и QR — за буркани, кутии и инвентар.",
  },
  "/vizitki": {
    href: "/vizitki",
    label: "Визитки 90 × 54 mm",
    blurb: "10 визитки на лист А4, по желание с vCard QR код.",
  },
  "/cv": {
    href: "/cv",
    label: "Автобиография (CV)",
    blurb: "Модерен, класически и Europass шаблон, с AI помощ за описанията.",
  },
  "/pismo": {
    href: "/pismo",
    label: "Мотивационно писмо",
    blurb: "AI чернова на български по няколко факта за теб.",
  },
  "/gramoti": {
    href: "/gramoti",
    label: "Грамоти и сертификати",
    blurb: "Хоризонтален А4 с рамка — за училища, клубове и фирми.",
  },
  "/pokani": {
    href: "/pokani",
    label: "Покани и картички",
    blurb: "Рожден ден, кръщене, сватба — 2 покани на лист А4.",
  },
  "/tabelki": {
    href: "/tabelki",
    label: "Табелки и надписи",
    blurb: "„Отворено/Затворено“, работно време, надпис за врата.",
  },
  "/wifi": {
    href: "/wifi",
    label: "WiFi стикер с QR",
    blurb: "Гостите сканират и телефонът се свързва без ръчна парола.",
  },
  "/badzhove": {
    href: "/badzhove",
    label: "Баджове за събития",
    blurb: "Цял списък гости наведнъж от таблица — име, роля, фирма, QR.",
  },
  "/obyava": {
    href: "/obyava",
    label: "Обява с откъсващи се телефончета",
    blurb: "6 до 14 ресни с телефона ти — за уроци, квартира, услуги.",
  },
  "/vaucheri": {
    href: "/vaucheri",
    label: "Подаръчни ваучери и талони",
    blurb: "Цяла серия с уникален пореден код и QR.",
  },
  "/kalendar": {
    href: "/kalendar",
    label: "Календар за печат",
    blurb: "Месечен, с официалните български празници и Великден.",
  },
  "/menu": {
    href: "/menu",
    label: "Меню и ценоразпис",
    blurb: "Раздели и цени с точкова линия — за кафене, бар, ресторант.",
  },
  "/dokumentni-snimki": {
    href: "/dokumentni-snimki",
    label: "Снимки за документи",
    blurb: "35 × 45 mm за лична карта и паспорт — цял лист еднакви снимки.",
  },
};

/**
 * Кой инструмент води до кой. Подбрано по НАМЕРЕНИЕ на потребителя (кандидат
 * за работа → CV + писмо + снимка; малък бизнес → визитки + меню + табелки),
 * а не по азбучен ред.
 */
const RELATED: Record<string, string[]> = {
  "/etiketi": ["/tabelki", "/menu", "/vizitki"],
  "/vizitki": ["/badzhove", "/etiketi", "/vaucheri"],
  "/cv": ["/pismo", "/dokumentni-snimki", "/vizitki"],
  "/pismo": ["/cv", "/dokumentni-snimki", "/vizitki"],
  "/gramoti": ["/badzhove", "/pokani", "/kalendar"],
  "/pokani": ["/gramoti", "/kalendar", "/vaucheri"],
  "/tabelki": ["/obyava", "/menu", "/etiketi"],
  "/wifi": ["/tabelki", "/menu", "/vizitki"],
  "/badzhove": ["/vizitki", "/gramoti", "/pokani"],
  "/obyava": ["/tabelki", "/vizitki", "/vaucheri"],
  "/vaucheri": ["/pokani", "/vizitki", "/menu"],
  "/kalendar": ["/gramoti", "/pokani", "/tabelki"],
  "/menu": ["/tabelki", "/etiketi", "/wifi"],
  "/dokumentni-snimki": ["/cv", "/pismo", "/vizitki"],
};

export default function RelatedTools({ current }: { current: string }) {
  // Синонимите идват от каталога на MCP конектора — един източник за видимия
  // текст И за това, което асистентите четат през `fetch`. Доскоро бяха
  // буквално копирани на 15 места и щяха да се разминат при първа поправка.
  const aliases = catalogById(current.replace(/^\//, ""))?.aliases;
  // flatMap, не map+filter(Boolean) — `filter` не свива типа и TS пази `undefined`.
  const related = (RELATED[current] ?? []).flatMap((h) => TOOLS[h] ?? []);

  return (
    <section className="no-print mx-auto mt-14 max-w-3xl">
      {aliases?.length ? (
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">Наричат го още:</span>{" "}
          {aliases.join(" · ")}
        </p>
      ) : null}

      {related.length ? (
        <nav aria-label="Свързани инструменти" className="mt-6">
          <h2 className="font-display text-2xl font-bold">Свързани инструменти</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {related.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="card-warm flex h-full flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className="font-semibold text-ink">{t.label}</span>
                  <span className="mt-1 text-sm text-ink-soft">{t.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
}
