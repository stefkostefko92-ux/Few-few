import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  DetailActions,
  EmailLink,
  FACT_LINK,
  FactList,
  Notice,
  PageHero,
  Prose,
  WebsiteLink,
  safeHttpUrl,
} from "@/components/ui";
import { Clock, ExternalLink, Mail, MapPin } from "@/components/icons";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, localBusinessLd } from "@/lib/seo";
import { renderMarkdown } from "@/lib/markdown";
import { SERVICE_CATEGORY_LABELS, labelFor } from "@/lib/categories";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PhoneReportButton } from "@/components/PhoneReportButton";
import { PhoneButton } from "@/components/PhoneButton";
import { OpenNowBadge, hoursText } from "@/components/OpenNowBadge";
import { formatPhoneBg } from "@/lib/phone";

export const dynamic = "force-dynamic";

// Правилен schema.org тип според категорията на услугата (за GEO/богати
// резултати). Държавните/общинските служби НЕ са „бизнес".
const SERVICE_SCHEMA_TYPE: Record<string, string> = {
  ADMIN: "GovernmentOffice",
  SOCIAL: "GovernmentOffice",
  EMERGENCY: "GovernmentOffice",
  HEALTH: "MedicalClinic",
  EDUCATION: "School",
  UTILITY: "Organization",
  TRANSPORT: "Organization",
  OTHER: "LocalBusiness",
};


/** „а“, „а или б“, „а, б или в“. */
function joinOr(parts: string[]): string {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} или ${parts[parts.length - 1]}`;
}

async function getService(slug: string) {
  return prisma.service.findFirst({ where: { slug, published: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = await getService(slug);
  if (!s) return buildMetadata({ title: "Не е намерено", noindex: true });
  return {
    ...buildMetadata({
      title: s.seoTitle || `${s.name} — телефон и информация`,
      description:
        s.seoDescription ||
        `${s.name} в Бобов дол. ${s.address ? "Адрес: " + s.address + ". " : ""}${s.phone ? "Телефон: " + formatPhoneBg(s.phone) + "." : ""}`,
      path: `/uslugi/${s.slug}`,
    }),
    keywords: [
      s.name,
      `${s.name} телефон`,
      `${labelFor(SERVICE_CATEGORY_LABELS, s.category)} Бобов дол`,
      "телефони Бобов дол",
      "услуги Бобов дол",
      "Carbon Stealth",
    ],
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = await getService(slug);
  if (!s) notFound();
  const website = safeHttpUrl(s.website) ? s.website : "";
  const hasFacts = Boolean(s.address || s.hours || s.email || website || (s.lat && s.lng));
  // Другите начини за връзка за хора, които не чуват добре по телефона.
  const otherWays = [
    s.email && "пишете на имейла",
    website && "използвате сайта",
    s.address && "отидете на място",
  ].filter((w): w is string => Boolean(w));

  return (
    <>
      <JsonLd
        data={localBusinessLd({
          name: s.name,
          description: s.description,
          address: s.address,
          phone: s.phone,
          website: s.website,
          lat: s.lat,
          lng: s.lng,
          hours: s.hours,
          schemaType: SERVICE_SCHEMA_TYPE[s.category] ?? "Organization",
        })}
      />
      <PageHero
        title={s.name}
        crumbs={[
          { name: "Услуги и телефони", path: "/uslugi" },
          { name: s.name, path: `/uslugi/${s.slug}` },
        ]}
      />
      <div className="container-content grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="badge">{labelFor(SERVICE_CATEGORY_LABELS, s.category)}</span>
            {s.isEmergency && <span className="badge-danger">Спешен номер</span>}
          </div>
          {/* Главното действие — обаждането: голям бутон веднага под заглавието
              (на телефон — в първия екран), над описанието и печата. */}
          {(s.phone || s.phone2) && (
            <div className="mt-5 max-w-md">
              {s.phone && (
                <PhoneButton
                  phone={s.phone}
                  label="Обадете се:"
                  variant={s.isEmergency ? "danger" : "primary"}
                  full
                  className="text-lg"
                />
              )}
              {s.phone2 && (
                <PhoneButton
                  phone={s.phone2}
                  label="Втори телефон:"
                  full
                  className={s.phone ? "mt-3" : ""}
                />
              )}
              <VerifiedBadge at={s.verifiedAt} source={s.verifiedSource} className="mt-3" />
              {/* 112 е единният европейски номер — „сгрешен“ не може да бъде. */}
              {!s.isEmergency && (
                <PhoneReportButton serviceId={s.id} serviceName={s.name} className="mt-1" />
              )}
            </div>
          )}
          {s.description && (
            <div className="mt-6">
              <Prose html={renderMarkdown(s.description)} />
            </div>
          )}
          <DetailActions
            shareTitle={`${s.name} — За Бобов дол`}
            shareText={`${s.name}${s.phone ? ` — телефон ${formatPhoneBg(s.phone)}` : ""}`}
            sharePath={`/uslugi/${s.slug}`}
          />
        </div>
        <aside className="space-y-4">
          {hasFacts && (
            <section aria-labelledby="info-zaglavie" className="panel">
              <h2 id="info-zaglavie" className="h-card">
                Информация
              </h2>
              <FactList
                className="mt-3"
                items={[
                  { label: "Адрес", icon: MapPin, value: s.address },
                  {
                    label: "Работно време",
                    icon: Clock,
                    value: s.hours ? (
                      <>
                        {hoursText(s.hours)}
                        <span className="mt-1.5 flex">
                          <OpenNowBadge hours={s.hours} />
                        </span>
                      </>
                    ) : null,
                  },
                  {
                    label: "Имейл",
                    icon: Mail,
                    value: s.email ? <EmailLink email={s.email} className={FACT_LINK} /> : null,
                  },
                  {
                    label: "Уебсайт",
                    icon: ExternalLink,
                    value: website ? <WebsiteLink url={s.website} className={FACT_LINK} /> : null,
                  },
                ]}
              />
              {s.lat && s.lng && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=17/${s.lat}/${s.lng}`}
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
          )}
          {otherWays.length > 0 && (
            <Notice title="Не чувате добре по телефона?" className="no-print">
              <p>
                Може да {joinOr(otherWays)}.{" "}
                <Link href="/dostapnost" className="link">
                  Вижте още начини за връзка
                </Link>
                .
              </p>
            </Notice>
          )}
        </aside>
      </div>
    </>
  );
}
