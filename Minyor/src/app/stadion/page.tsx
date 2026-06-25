import type { Metadata } from "next";
import { buildMetadata, webPageLd, stadiumLd } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { MapPin, Users } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Стадион",
  description: `Стадион „Николай Кръстев – Шулц“ в Бобов дол — домът на ФК „Миньор“, с капацитет около ${SITE.stadium.capacity} зрители.`,
  path: "/stadion",
});

// Карта от OpenStreetMap, центрирана върху Бобов дол.
const MAP_SRC =
  "https://www.openstreetmap.org/export/embed.html?bbox=22.97%2C42.34%2C23.03%2C42.37&layer=mapnik&marker=42.3539%2C23.0008";

export default function StadiumPage() {
  return (
    <>
      <PageHero
        eyebrow="Домът на „миньорите“"
        title={SITE.stadium.name}
        intro="Мястото, където жълто-черните посрещат своите съперници."
        crumbs={[{ name: "Стадион", path: "/stadion" }]}
      />
      <JsonLd
        data={[
          webPageLd({
            name: SITE.stadium.name,
            description: `Домакински стадион на ${SITE.name}.`,
            path: "/stadion",
          }),
          stadiumLd(),
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-2">
        <div>
          <h2 className="section-title mb-5">Информация</h2>
          <dl className="space-y-4">
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <div>
                <dt className="text-sm text-slate-500">Капацитет</dt>
                <dd className="font-semibold text-slate-900">
                  около {SITE.stadium.capacity.toLocaleString("bg-BG")} зрители
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
              <div>
                <dt className="text-sm text-slate-500">Адрес</dt>
                <dd className="font-semibold text-slate-900">
                  {SITE.stadium.address}
                </dd>
              </div>
            </div>
          </dl>
          <p className="mt-6 text-slate-600">
            Стадион „Николай Кръстев – Шулц“ е домакинският терен на ФК „Миньор“
            Бобов дол. В последните години съоръжението е обновявано — съблекални,
            покрив и тревно покритие — за по-добри условия за играчите и феновете.
          </p>
          <a
            href="https://www.openstreetmap.org/?mlat=42.3539&mlon=23.0008#map=15/42.3539/23.0008"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary mt-6"
          >
            Отвори в карта
          </a>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <iframe
            title="Карта на Бобов дол"
            src={MAP_SRC}
            className="h-full min-h-[20rem] w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </>
  );
}
