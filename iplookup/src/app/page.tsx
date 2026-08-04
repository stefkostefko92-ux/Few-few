import Link from "next/link";
import { headers } from "next/headers";

import SearchForm from "@/components/SearchForm";
import { Badge, Card } from "@/components/DataCard";
import { clientIpOptionsFromEnv, pickClientIp } from "@/lib/client-ip";
import { specialRange } from "@/lib/ip";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

// Адресът на посетителя се чете от заглавията на заявката, значи страницата
// не може да е статична.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const requestHeaders = await headers();
  const client = pickClientIp((name) => requestHeaders.get(name), clientIpOptionsFromEnv());
  const clientSpecial = client ? specialRange(client.ip) : null;

  return (
    <div className="space-y-10">
      <section aria-labelledby="hero">
        <h1 id="hero" className="text-3xl font-bold tracking-tight text-text sm:text-4xl">
          Твоят публичен IP адрес
        </h1>

        {/* Героят е самата стойност — тя е и причината повечето хора да отворят
            такъв сайт. Чист текст, нула JavaScript, нула забавяне за LCP. */}
        <p className="mt-4 break-all font-mono text-3xl font-semibold text-accent-strong sm:text-5xl">
          {client ? client.ip.normalized : "неизвестен"}
        </p>

        <p className="mt-4 max-w-2xl text-text-muted">
          {client ? (
            <>
              Това е адресът, който всеки сайт вижда, когато го отвориш. Той принадлежи на{" "}
              <strong className="text-text">твоя интернет доставчик</strong>, не на теб, и обикновено се
              сменя.
            </>
          ) : (
            <>
              Не успяхме да разчетем адреса ти от заявката. Това се случва при необичайна конфигурация на
              обратно прокси.
            </>
          )}
        </p>

        {clientSpecial ? (
          <p className="mt-4">
            <Badge tone="warn">
              Виждаме те с {clientSpecial.name.toLowerCase()} — най-вероятно обратното прокси не подава
              истинския адрес.
            </Badge>
          </p>
        ) : null}

        {client ? (
          <p className="mt-6">
            <Link href={`/ip/${encodeURIComponent(client.ip.normalized)}`} className="btn-primary">
              Пълна справка за моя адрес
            </Link>
          </p>
        ) : null}
      </section>

      <Card title="Провери друг адрес">
        <SearchForm />
      </Card>

      <section aria-labelledby="what" className="space-y-4">
        <h2 id="what" className="text-xl font-semibold text-text">
          Какво показваме
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((item) => (
            <div key={item.title} className="card p-4">
              <h3 className="font-semibold text-text">{item.title}</h3>
              <p className="mt-1 text-sm text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="honesty" className="card border-warn p-5">
        <h2 id="honesty" className="text-lg font-semibold text-text">
          И какво НЕ показваме
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-text-muted">
          <li>
            <strong className="text-text">Не показваме точен адрес и не слагаме точка на карта.</strong>{" "}
            Геолокацията по IP познава града в около две трети от случаите, и то „в рамките на 50 км“. Един
            грешен център на държава веднъж прати стотици милиони адреса към една ферма в Канзас — не
            повтаряме тази грешка.
          </li>
          <li>
            <strong className="text-text">Не казваме кой е човекът зад адреса.</strong> Регистърът описва
            мрежата, не абоната. При операторски NAT (CGNAT) зад един адрес стоят хиляди души едновременно.
          </li>
          <li>
            <strong className="text-text">Не пазим какво си търсил.</strong> Няма профили, няма история,
            няма бисквитки.
          </li>
        </ul>
        <p className="mt-4">
          <Link href="/kak-raboti" className="text-accent underline underline-offset-2">
            Как работи справката и откъде идва всяко твърдение →
          </Link>
        </p>
      </section>

      {/* Структурирани данни: помагат на търсачките и на AI отговорите да
          разберат какво е това, без да гадаят по текста. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: SITE_NAME,
            url: SITE_URL,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Web",
            inLanguage: "bg",
            description: SITE_TAGLINE,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            publisher: { "@type": "Organization", name: "Carbon Stealth VCC", url: "https://carbonstealth.eu" },
          }),
        }}
      />
    </div>
  );
}

const CAPABILITIES = [
  {
    title: "Мрежа и регистър",
    body: "Кой блок покрива адреса, коя организация го е получила, кога, и на кого се пращат оплаквания за злоупотреба — направо от RDAP на регионалния регистър.",
  },
  {
    title: "Автономна система",
    body: "Кой оператор реално маршрутизира адреса в момента и с какъв префикс го обявява. Това често е различно от организацията в регистъра.",
  },
  {
    title: "Местоположение — само когато е честно",
    body: "С предимство geofeed файлът, който самият оператор публикува. Няма ли такъв, казваме „държава по регистрация“ и го наричаме точно така.",
  },
  {
    title: "Облак, CDN, робот или релей",
    body: "Проверка срещу публичните списъци на AWS, Google Cloud, Cloudflare, Fastly, Googlebot и Apple Private Relay — твърдения на самите доставчици, не предположения.",
  },
  {
    title: "Обратен DNS с потвърждение",
    body: "Не само PTR записа, а и дали името се резолвва обратно до същия адрес (FCrDNS). Без тази проверка PTR не доказва нищо.",
  },
  {
    title: "Какво издава самият адрес",
    body: "Специални диапазони, вграден IPv4 в IPv6 (6to4, Teredo, NAT64), и дали IPv6 адресът издава MAC адреса на мрежовата карта.",
  },
];
