import type { Metadata } from "next";
import { SITE } from "../../../lib/site";
import { alternatesFor } from "../../../lib/seo";
import { getDict } from "../../../i18n/dictionaries";
import type { Locale } from "../../../i18n/locales";
import { localizedSiteFaq } from "../../../i18n/content";
import { JsonLd } from "../../../components/JsonLd";
import { breadcrumbLd, siteFaqLd } from "../../../lib/jsonld";
import { FaqBody } from "../../faq/FaqBody";
import "../../legal.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return {
    title: t.faqPage.heading,
    description: t.faqPage.sub,
    alternates: alternatesFor(locale as Locale, "/faq/"),
  };
}

export default async function LocaleFaq({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: t.breadcrumbs.home, url: `${SITE.url}/${locale}/` },
            { name: t.breadcrumbs.faq, url: `${SITE.url}/${locale}/faq/` },
          ]),
          siteFaqLd(localizedSiteFaq(locale as Locale)),
        ]}
      />
      <FaqBody />
    </>
  );
}
