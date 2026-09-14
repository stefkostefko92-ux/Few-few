import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { alternatesFor } from "../../lib/seo";
import { getDict } from "../../i18n/dictionaries";
import type { Locale } from "../../i18n/locales";
import Home from "../page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = getDict(locale as Locale);
  return {
    title: { absolute: `${SITE.name} — ${t.home.eyebrow}` },
    description: t.home.lead,
    alternates: alternatesFor(locale as Locale, "/"),
    openGraph: { title: `${SITE.name} — ${t.home.eyebrow}`, description: t.home.lead, url: `${SITE.url}/${locale}/` },
  };
}

// Same home component — locale is derived from the pathname by the provider.
export default function LocaleHome() {
  return <Home />;
}
