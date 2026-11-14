import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  DetailActions,
  EmailLink,
  FACT_LINK,
  FactList,
  PageHero,
  Prose,
  WebsiteLink,
  safeHttpUrl,
} from "@/components/ui";
import { Clock, ExternalLink, Mail, MapPin } from "@/components/icons";
import { OpenNowBadge, hoursText } from "@/components/OpenNowBadge";
import { PhoneButton } from "@/components/PhoneButton";
import { formatPhoneBg } from "@/lib/phone";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, localBusinessLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { BUSINESS_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { ReportContent } from "@/components/ReportContent";

export const dynamic = "force-dynamic";

async function getBusiness(slug: string) {
  return prisma.business.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBusiness(slug);
  if (!b) return buildMetadata({ title: "Не е намерено", noindex: true });
  const category = labelFor(BUSINESS_CATEGORY_LABELS, b.category);
  return buildMetadata({
    title: b.seoTitle || b.name,
    description:
      b.seoDescription || plainText(b.description, 155) || `${b.name} в Бобов дол.`,
    path: `/biznes/${b.slug}`,
    keywords: [
      b.name,
      `${b.name} телефон`,
      `${category} Бобов дол`,
      "местен бизнес Бобов дол",
      "работно време Бобов дол",
    ],
  });
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const b = await getBusiness(slug);
  if (!b) notFound();
  const website = safeHttpUrl(b.website) ? b.website : "";
  const facebook = safeHttpUrl(b.facebook) ? b.facebook : "";
  const hasFacts = Boolean(b.address || b.hours || b.email || website || facebook || (b.lat && b.lng));

  return (
    <>
      <JsonLd
        data={localBusinessLd({
          name: b.name,
          description: b.description,
          address: b.address,
          phone: b.phone,
          website: b.website,
          lat: b.lat,
          lng: b.lng,
          hours: b.hours,
        })}
      />
      <PageHero
        title={b.name}
        crumbs={[
          { name: "Местен бизнес", path: "/biznes" },
          { name: b.name, path: `/biznes/${b.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <span className="badge">{labelFor(BUSINESS_CATEGORY_LABELS, b.category)}</span>
          {/* Главното действие — обаждането, веднага под заглавието. */}
          {b.phone && (
            <div className="mt-5 max-w-md">
              <PhoneButton phone={b.phone} label="Обадете се:" variant="primary" full className="text-lg" />
            </div>
          )}
          {b.description && (
            <div className="mt-6">
              <Prose html={renderMarkdown(b.description)} />
            </div>
          )}
          <DetailActions
            shareTitle={`${b.name} — За Бобов дол`}
            shareText={`${b.name}${b.phone ? ` — телефон ${formatPhoneBg(b.phone)}` : ""}`}
            sharePath={`/biznes/${b.slug}`}
          >
            {/* Готовата форма за поправка (/biznes/nova?za=) — собственикът или
                съсед сам предлага верния телефон/работно време. */}
            <Link href={`/biznes/nova?za=${b.slug}`} className="btn-secondary">
              Поправете данните
            </Link>
          </DetailActions>
          {/* „Сигнализирайте за това съдържание“ — както /pravila т. 3 обещава
              за каталога на бизнесите (чл. 16 DSA, точният адрес в писмото). */}
          <ReportContent subject={b.name} path={`/biznes/${b.slug}`} />
        </div>
        {hasFacts && (
          <aside>
            <section aria-labelledby="info-zaglavie" className="panel">
              <h2 id="info-zaglavie" className="h-card">
                Информация
              </h2>
              <FactList
                className="mt-3"
                items={[
                  { label: "Адрес", icon: MapPin, value: b.address },
                  {
                    label: "Работно време",
                    icon: Clock,
                    value: b.hours ? (
                      <>
                        {hoursText(b.hours)}
                        <span className="mt-1.5 flex">
                          <OpenNowBadge hours={b.hours} />
                        </span>
                      </>
                    ) : null,
                  },
                  {
                    label: "Имейл",
                    icon: Mail,
                    value: b.email ? <EmailLink email={b.email} className={FACT_LINK} /> : null,
                  },
                  {
                    label: "Уебсайт",
                    icon: ExternalLink,
                    value: website ? <WebsiteLink url={b.website} className={FACT_LINK} /> : null,
                  },
                  {
                    label: "Facebook",
                    icon: ExternalLink,
                    value: facebook ? (
                      <WebsiteLink url={b.facebook} className={FACT_LINK}>Страница във Facebook</WebsiteLink>
                    ) : null,
                  },
                ]}
              />
              {b.lat && b.lng && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}#map=17/${b.lat}/${b.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary no-print mt-4 w-full"
                >
                  <MapPin className="h-5 w-5" aria-hidden />
                  Вижте на картата
                  <span className="sr-only"> (отваря се в нов раздел)</span>
                </a>
              )}
            </section>
          </aside>
        )}
      </div>
    </>
  );
}
