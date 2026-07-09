import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { fontVars } from "@/lib/fonts";
import { LOCALES, LOCALE_META, isLocale, type Locale } from "@/lib/i18n";

// Always server-render: language is chosen per request (geo/cookie) and
// content comes from the database.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const locale = isLocale(raw) ? raw : "en";
  const alt: Record<string, string> = {};
  for (const l of LOCALES) alt[LOCALE_META[l].htmlLang] = `${base}/${l}`;
  return {
    metadataBase: new URL(base),
    title: { default: "Qui Bulgaria — Scuola bulgara di Milano", template: "%s · Qui Bulgaria" },
    description:
      "Centro linguistico e culturale a Milano: lingua e cultura bulgara, scuola “P. Yavorov”, corsi e danza tradizionale.",
    keywords: [
      "scuola bulgara",
      "scuola bulgara milano",
      "българско училище",
      "българско училище в Милано",
      "Carbon Stealth",
    ],
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
      siteName: "Qui Bulgaria — Scuola bulgara di Milano",
      locale: LOCALE_META[locale].htmlLang,
      title: "Qui Bulgaria — Scuola bulgara di Milano",
      description:
        "Lingua e cultura bulgara a Milano (Lombardia): scuola “P. Yavorov”, corsi per bambini e adulti, danza tradizionale.",
      images: [{ url: "/assets/img/photos/community.png", width: 526, height: 452 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Qui Bulgaria — Scuola bulgara di Milano",
      description: "Lingua e cultura bulgara a Milano: scuola, corsi e danza tradizionale.",
      images: ["/assets/img/photos/community.png"],
    },
    // Local / geo SEO signals (Milano, Lombardia)
    other: {
      "geo.region": "IT-25",
      "geo.placename": "Milano, Lombardia",
      "geo.position": "45.4642;9.1900",
      ICBM: "45.4642, 9.1900",
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
  return (
    <html lang={LOCALE_META[locale].htmlLang} className={fontVars}>
      <head>
        {/* Ensure scroll-reveal content is visible if JavaScript is unavailable. */}
        <noscript>
          <style>{`.reveal{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
      </head>
      <body>{children}</body>
    </html>
  );
}
