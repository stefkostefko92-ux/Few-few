import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { fontVars } from "@/lib/fonts";
import { LOCALES, LOCALE_META, isLocale, type Locale } from "@/lib/i18n";
import { loadSite } from "@/lib/content";
import { finalKeywords, safeImage } from "@/lib/cms";
import { UiProvider } from "@/components/UiProvider";

// Always server-render: language is chosen per request (geo/cookie) and
// content comes from the database.
export const dynamic = "force-dynamic";

// Open Graph wants language_TERRITORY, not a bare language code.
const OG_LOCALE: Record<Locale, string> = { it: "it_IT", bg: "bg_BG", en: "en_GB" };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: raw } = await params;
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const locale = (isLocale(raw) ? raw : "en") as Locale;
  const site = await loadSite(locale);
  const seo = site.get("seo");
  const org = site.get("org");
  const brand = site.get("settings").brandName || "Qui Bulgaria";

  const alt: Record<string, string> = {};
  for (const l of LOCALES) alt[LOCALE_META[l].htmlLang] = `${base}/${l}`;
  // x-default points to the Italian version (direct 200), consistent with the
  // legal pages — a concrete URL is a stronger hreflang signal than the redirecting root.
  alt["x-default"] = `${base}/it`;

  // A share photo chosen in the admin replaces the generated brand card
  // (opengraph-image.tsx); left empty, the generated card is used.
  const share = safeImage(seo.shareImage, "");
  const images = share ? [{ url: share }] : undefined;
  const lat = Number(org.latitude), lng = Number(org.longitude);
  const geo = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    metadataBase: new URL(base),
    title: { default: seo.title, template: `%s · ${brand}` },
    description: seo.description,
    keywords: finalKeywords(seo.keywords, ["scuola bulgara", "scuola bulgara milano", "българско училище", "българско училище в Милано"]),
    authors: [{ name: "Carbon Stealth VCC", url: "https://carbonstealth.eu" }],
    creator: "Carbon Stealth VCC",
    alternates: { canonical: `${base}/${locale}`, languages: alt },
    icons: { icon: "/assets/img/brand/favicon.svg", apple: "/assets/img/brand/favicon.svg" },
    manifest: "/site.webmanifest",
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    formatDetection: { telephone: true, address: true, email: true },
    openGraph: {
      type: "website",
      url: `${base}/${locale}`,
      siteName: seo.title,
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      title: seo.title,
      description: seo.description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      ...(images ? { images: images.map((i) => i.url) } : {}),
    },
    // Local / geo SEO signals, from the organisation data.
    other: {
      "geo.region": "IT-25",
      "geo.placename": `${org.locality}, ${org.region}`,
      ...(geo ? { "geo.position": `${lat};${lng}`, ICBM: `${lat}, ${lng}` } : {}),
    },
  };
}

export const viewport = { themeColor: "#0f7a3d" };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const { ui } = await loadSite(locale);
  return (
    <html lang={LOCALE_META[locale].htmlLang} className={fontVars}>
      <head>
        {/* Ensure scroll-reveal content is visible if JavaScript is unavailable. */}
        <noscript>
          <style>{`.reveal{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
      </head>
      <body>
        <UiProvider ui={ui}>{children}</UiProvider>
      </body>
    </html>
  );
}
