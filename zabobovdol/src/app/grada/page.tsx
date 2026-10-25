import Link from "next/link";
import type { Metadata } from "next";
import {
  MapPin,
  Users,
  Mountain,
  Factory,
  Landmark,
  Church,
  TreePine,
  BookOpen,
} from "@/components/icons";
import type { ReactNode } from "react";
import { ArticleActions, PageHero, Prose } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { getChurchServices } from "@/lib/settings";
import { renderMarkdown } from "@/lib/markdown";
import { POPULATION } from "@/lib/town-facts";
import { SECTION } from "@/lib/section-names";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Опознайте Бобов дол — география, население, икономика, забележителности",
  description:
    "Кратка енциклопедия на град Бобов дол: къде се намира, колко жители има, икономика (въгледобив и ТЕЦ), забележителности и природа (язовир Дяково, манастири), религиозен живот и карта на града.",
  path: "/grada",
  type: "article",
  keywords: [
    "Бобов дол",
    "град Бобов дол забележителности",
    "язовир Дяково",
    "население Бобов дол",
    "карта на Бобов дол",
    "Кюстендилска област",
    "Carbon Stealth",
  ],
});

const FACTS: { icon: typeof Users; label: string; value: string }[] = [
  { icon: Landmark, label: "Област", value: "Кюстендилска (Югозападна България)" },
  { icon: Users, label: "Население", value: `${POPULATION.value} жители (${POPULATION.asOf})` },
  { icon: MapPin, label: "Пощенски код", value: "2670" },
  { icon: Mountain, label: "Местоположение", value: "Конявска планина, местност Разметаница" },
];

const LANDMARKS: { title: string; text: string }[] = [
  {
    title: "Язовир „Дяково“",
    text: "На няколко километра от града — любимо място за риболов, разходки и отдих сред природата.",
  },
  {
    title: "Църква „Свети Никола“ (1822 г.)",
    text: "Възрожденският храм в града — сърцето на духовния живот, с красив иконостас.",
  },
  {
    title: "Манастири в околността",
    text: "В по-широкия край (Кюстендилско) има стари манастири и църкви — например Горнокознически манастир, и църквата „Свети Никола“ в с. Тополница (на около 10–11 км).",
  },
  {
    title: "Планини и природа",
    text: "Наблизо са Верила планина и Рила — възможности за разходки, чист въздух и туризъм.",
  },
  {
    title: "Градски исторически музей",
    text: "Пази миньорската памет на града и разказва за тежкия, но горд труд на миньорите.",
  },
];

// Раздел: текстът е в колона за четене (.prose-content), а картите, картата
// и бутоните (`after`) — извън нея, за да не наследяват стила на текста (B25).
function Section({
  id,
  title,
  icon: Icon,
  children,
  after,
}: {
  id: string;
  title: string;
  icon: typeof Users;
  children: ReactNode;
  after?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-zaglavie`}>
      <h2
        id={`${id}-zaglavie`}
        className="flex items-start gap-2 text-2xl font-bold text-slate-900"
      >
        <Icon className="mt-1 h-6 w-6 shrink-0 text-brand-700" aria-hidden />
        <span>{title}</span>
      </h2>
      <div className="prose-content mt-3 text-slate-700">{children}</div>
      {after}
    </section>
  );
}

export default async function CityPage() {
  const churchServices = await getChurchServices();
  const placeLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: "Бобов дол",
    description: "Град в Кюстендилска област, Югозападна България — бивш център на въгледобива.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Бобов дол",
      addressRegion: SITE.geo.region,
      postalCode: SITE.geo.postalCode,
      addressCountry: "BG",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: SITE.geo.latitude,
      longitude: SITE.geo.longitude,
    },
  };

  return (
    <>
      {/* BreadcrumbList идва от PageHero (crumbs) — тук само мястото. */}
      <JsonLd data={placeLd} />
      <PageHero
        eyebrow={SECTION.city}
        title="Опознайте Бобов дол"
        intro="Накратко за нашия град — къде се намира, с какво е известен, какво има да се види и как изглежда на картата. За подробната история вижте отделната страница."
        crumbs={[{ name: "Опознайте Бобов дол", path: "/grada" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Бърз поглед */}
        <section aria-label="Бърз поглед">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="panel h-full">
                  {/* Иконата е в <dt> — в <dl> групата може да има само dt/dd. */}
                  <dt className="label-caps">
                    <span className="icon-chip-sm mb-3">
                      <Icon aria-hidden />
                    </span>
                    {f.label}
                  </dt>
                  <dd className="mt-0.5 text-base font-semibold text-slate-900">{f.value}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <Section id="geografiya" title="Къде се намира" icon={MapPin}>
          <p>
            Бобов дол е град в <strong>Югозападна България</strong>, в{" "}
            <strong>Кюстендилска област</strong>. Разположен е в планински район — в най-източната
            част на <strong>Конявската планина</strong>, в географската местност Разметаница. Намира
            се близо до Дупница, а оттам — на около час и нещо път до София.
          </p>
          <p>
            Името на града идва от долината с форма на бобено зърно, в която се разполага
            първоначалното село. Общината обхваща град Бобов дол и редица съседни села.
          </p>
        </Section>

        <Section id="naselenie" title="Население" icon={Users}>
          <p>
            Днес в Бобов дол живеят <strong>под 4&nbsp;000 души</strong> ({POPULATION.value} в{" "}
            {POPULATION.asOf}). Това е значително по-малко от времето на разцвета през 1980-те
            години, когато градът е бил пълен с миньори и работници от цялата страна. С закриването
            на въгледобива много млади хора заминаха към по-големите градове.
          </p>
        </Section>

        <Section id="ikonomika" title="Икономика — миньорският град" icon={Factory}>
          <p>
            Бобов дол е <strong>миньорската столица на Кюстендилско</strong>. Промишленият добив на
            въглища започва още през 1891&nbsp;г. и десетилетия наред определя живота на града. През
            1973–1975&nbsp;г. край града (до Големо село) е построен енергийният център{" "}
            <strong>ТЕЦ „Бобов дол“</strong>.
          </p>
          <p>
            Днес районът е във <strong>въглищен преход</strong> — въгледобивът се закрива и градът
            търси ново икономическо бъдеще. Цялата подробна история вижте на страницата{" "}
            <Link href="/istoriya">История на града</Link>.
          </p>
        </Section>

        <Section
          id="zabelezhitelnosti"
          title="Забележителности и природа"
          icon={TreePine}
          after={
            <ul role="list" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {LANDMARKS.map((l) => (
                <li key={l.title} className="panel h-full">
                  <h3 className="h-card">{l.title}</h3>
                  <p className="mt-1 text-base text-slate-700">{l.text}</p>
                </li>
              ))}
            </ul>
          }
        >
          <p>
            Разстоянията са приблизителни. Знаете ли любимо място или хубава снимка от Бобов дол?
            Споделете я в <Link href="/spomeni">„Спомени от Бобов дол“</Link>.
          </p>
        </Section>

        <Section
          id="religiozen-zhivot"
          title="Религиозен живот"
          icon={Church}
          after={
            churchServices ? (
              <div className="panel mt-4 max-w-3xl">
                <h3 className="h-card">Часове на службите</h3>
                <div className="mt-1">
                  <Prose html={renderMarkdown(churchServices)} />
                </div>
              </div>
            ) : null
          }
        >
          <p>
            Духовният център на града е възрожденската църква <strong>„Свети Никола“</strong>{" "}
            (1822&nbsp;г.). В по-широкия край има и стари манастири и храмове, които пазят вярата и
            традицията. На големите християнски празници (Великден, Коледа, храмови празници)
            службите събират хора от целия град.
          </p>
          {!churchServices && (
            <p>
              За точните часове на службите и предстоящите празници питайте в храма. Ако имате
              информация, ще се радваме да я добавим — пишете ни на страницата{" "}
              <Link href="/kontakti">„Контакти“</Link>.
            </p>
          )}
        </Section>

        <Section
          id="karta"
          title="Карта на града"
          icon={MapPin}
          after={
            <>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <iframe
                  title="Карта на Бобов дол"
                  className="h-80 w-full"
                  loading="lazy"
                  src="https://www.openstreetmap.org/export/embed.html?bbox=22.96%2C42.33%2C23.05%2C42.38&layer=mapnik&marker=42.3539%2C23.0008"
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
                <a
                  href="https://www.google.com/maps/search/Бобов+дол"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  Отворете в Google Карти
                </a>
                <a
                  href="https://www.google.com/maps/search/аптека+Бобов+дол"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  Аптеки наблизо
                </a>
                <a
                  href="https://www.google.com/maps/search/автобусна+спирка+Бобов+дол"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  Автобусни спирки
                </a>
              </div>
            </>
          }
        >
          <p>Намерете лесно улици, институции и спирки на картата.</p>
        </Section>

        {/* Бързи връзки */}
        <section aria-labelledby="poveche" className="callout-info sm:p-6">
          <h2
            id="poveche"
            className="flex items-center gap-2 font-sans text-xl font-semibold text-slate-900"
          >
            <BookOpen className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
            Научете повече за града
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
            <Link href="/istoriya" className="btn-secondary">
              История на града
            </Link>
            <Link href="/uslugi" className="btn-secondary">
              Услуги и важни телефони
            </Link>
            <Link href="/spomeni" className="btn-secondary">
              Спомени от Бобов дол
            </Link>
            <Link href="/sabitiya" className="btn-secondary">
              Събития
            </Link>
          </div>
        </section>

        <div className="max-w-3xl">
          <p className="rounded-2xl bg-slate-100 p-4 text-base text-slate-700">
            Информацията е съставена по публични източници (Уикипедия, официални сайтове и местни
            справочници) като кратък преглед. Възможни са неточности — ако забележите грешка или
            искате да допълните факт, снимка или забележителност,{" "}
            <Link href="/kontakti" className="link">
              свържете се с нас
            </Link>
            .
          </p>
          <ArticleActions
            shareTitle="Опознайте Бобов дол — За Бобов дол"
            shareText="Накратко за град Бобов дол: къде е, с какво е известен и какво да видите."
            sharePath="/grada"
          />
          <PrintSourceLine path="/grada" />
        </div>
      </div>
    </>
  );
}
