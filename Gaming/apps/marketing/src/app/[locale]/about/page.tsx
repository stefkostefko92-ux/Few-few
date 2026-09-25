import type { Metadata } from "next";
import { SITE } from "../../../lib/site";
import { alternatesFor } from "../../../lib/seo";
import { getDict } from "../../../i18n/dictionaries";
import type { Locale } from "../../../i18n/locales";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd } from "../../../lib/jsonld";
import { AboutBody } from "../../about/AboutBody";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return {
    title: t.about.heading,
    description: t.about.p1,
    alternates: alternatesFor(locale as Locale, "/about/"),
  };
}

export default async function LocaleAbout({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: t.breadcrumbs.home, url: `${SITE.url}/${locale}/` },
          { name: t.breadcrumbs.about, url: `${SITE.url}/${locale}/about/` },
        ])}
      />
      <AboutBody />
    </>
  );
}
