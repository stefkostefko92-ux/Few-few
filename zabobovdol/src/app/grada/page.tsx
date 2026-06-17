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
} from "lucide-react";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata: Metadata = buildMetadata({
  title: "Опознай Бобов дол — география, население, икономика, забележителности",
  description:
    "Кратка енциклопедия на град Бобов дол: къде се намира, колко жители има, икономика (въгледобив и ТЕЦ), забележителности и природа (язовир Дяково, манастири), религиозен живот и карта на града.",
  path: "/grada",
  type: "article",
});

const FACTS: { icon: typeof Users; label: string; value: string }[] = [
  { icon: Landmark, label: "Област", value: "Кюстендилска (Югозападна България)" },
  { icon: Users, label: "Население", value: "около 4 000 жители" },
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
    text: "В района има стари манастири и църкви — например Горнокознички и Изворски манастир, и църквата „Свети Никола“ в с. Тополница (на около 10–11 км).",
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

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Icon className="h-6 w-6 text-brand-700" aria-hidden />
        {title}
      </h2>
      <div className="prose-content mt-3 text-slate-700">{children}</div>
    </section>
  );
}

export default function CityPage() {
  const placeLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: "Бобов дол",
    description:
      "Град в Кюстендилска област, Югозападна България — бивш център на въгледобива.",
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
      <JsonLd
        data={[
          placeLd,
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Опознай Бобов дол", path: "/grada" },
          ]),
        ]}
      />
      <PageHero
        eyebrow="За града"
        title="Опознай Бобов дол"
        intro="Накратко за нашия град — къде се намира, с какво е известен, какво има да се види и как изглежда на картата. За подробната история вижте отделната страница."
        crumbs={[{ name: "Опознай Бобов дол", path: "/grada" }]}
      />

      <div className="container-content space-y-10 py-10">
        {/* Бърз поглед */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Icon className="h-6 w-6 text-brand-700" aria-hidden />
                <div className="mt-2 text-xs uppercase tracking-wide text-slate-400">{f.label}</div>
                <div className="mt-0.5 font-semibold text-slate-900">{f.value}</div>
              </div>
            );
          })}
        </section>

        <Section id="geografiya" title="Къде се намира" icon={MapPin}>
          <p>
            Бобов дол е град в <strong>Югозападна България</strong>, в{" "}
            <strong>Кюстендилска област</strong>. Разположен е в планински район — в
            най-източната част на <strong>Конявската планина</strong>, в географската
            местност Разметаница. Намира се близо до Дупница, а оттам — на около час
            и нещо път до София.
          </p>
          <p>
            Името на града идва от долината с форма на бобено зърно, в която се
            разполага първоначалното село. Общината обхваща град Бобов дол и редица
            съседни села.
          </p>
        </Section>

        <Section id="naselenie" title="Население" icon={Users}>
          <p>
            Днес в Бобов дол живеят <strong>около 4 000 души</strong>. Това е
            значително по-малко от времето на разцвета през 1980-те години, когато
            градът е бил пълен с миньори и работници от цялата страна. С закриването
            на въгледобива много млади хора заминаха към по-големите градове.
          </p>
        </Section>

        <Section id="ikonomika" title="Икономика — миньорският град" icon={Factory}>
          <p>
            Бобов дол е <strong>миньорската столица на Кюстендилско</strong>.
            Промишленият добив на въглища започва още през 1891 г. и десетилетия наред
            определя живота на града. През 1973–1975 г. край града (до Големо село) е
            построен енергийният център <strong>ТЕЦ „Бобов дол“</strong>.
          </p>
          <p>
            Днес районът е във <strong>въглищен преход</strong> — въгледобивът се
            закрива и градът търси ново икономическо бъдеще. Цялата подробна история
            вижте на страницата{" "}
            <Link href="/istoriya" className="text-brand-700 underline">
              История на града
            </Link>
            .
          </p>
        </Section>

        <Section id="zabelezhitelnosti" title="Забележителности и природа" icon={TreePine}>
          <div className="grid gap-4 sm:grid-cols-2">
            {LANDMARKS.map((l) => (
              <div key={l.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-display text-lg font-bold text-slate-900">{l.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{l.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Разстоянията са приблизителни. Знаете ли любимо място или хубава снимка
            от Бобов дол? Споделете я в{" "}
            <Link href="/spomeni" className="text-brand-700 underline">
              „Спомени от Бобов дол“
            </Link>
            .
          </p>
        </Section>

        <Section id="religiozen-zhivot" title="Религиозен живот" icon={Church}>
          <p>
            Духовният център на града е възрожденската църква{" "}
            <strong>„Свети Никола“</strong> (1822 г.). В по-широкия край има и стари
            манастири и храмове, които пазят вярата и традицията. На големите
            християнски празници (Великден, Коледа, храмови празници) службите събират
            хора от целия град.
          </p>
          <p className="text-sm text-slate-500">
            За точните часове на службите и предстоящите празници питайте в храма. Ако
            имате информация, ще се радваме да я добавим — пишете ни на{" "}
            <Link href="/kontakti" className="text-brand-700 underline">
              Контакти
            </Link>
            .
          </p>
        </Section>

        <Section id="karta" title="Карта на града" icon={MapPin}>
          <p>Намерете лесно улици, институции и спирки на картата:</p>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <iframe
              title="Карта на Бобов дол"
              className="h-80 w-full"
              loading="lazy"
              src="https://www.openstreetmap.org/export/embed.html?bbox=22.96%2C42.33%2C23.05%2C42.38&layer=mapnik&marker=42.3539%2C23.0008"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://www.google.com/maps/search/Бобов+дол"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              Отвори в Google Карти
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
        </Section>

        {/* Бързи връзки */}
        <section className="rounded-2xl border border-brand-200 bg-brand-50 p-6">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <BookOpen className="h-6 w-6 text-brand-700" aria-hidden />
            Научете повече за града
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/istoriya" className="btn-secondary">История на града</Link>
            <Link href="/uslugi" className="btn-secondary">Услуги и важни телефони</Link>
            <Link href="/spomeni" className="btn-secondary">Спомени от Бобов дол</Link>
            <Link href="/sabitiya" className="btn-secondary">Събития</Link>
          </div>
        </section>

        <p className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
          Информацията е съставена по публични източници (Уикипедия, официални сайтове
          и местни справочници) като кратък преглед. Възможни са неточности — ако
          забележите грешка или искате да допълните факт, снимка или забележителност,
          свържете се с нас.
        </p>
      </div>
    </>
  );
}
