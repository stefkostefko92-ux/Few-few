import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../globals.css";
import { LOCALES, LOCALE_META, isLocale, type Locale } from "@/lib/i18n";

// Always server-render: language is chosen per request (geo/cookie) and
// content comes from the database.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const locale = isLocale(params.locale) ? params.locale : "en";
  const alt: Record<string, string> = {};
  for (const l of LOCALES) alt[LOCALE_META[l].htmlLang] = `${base}/${l}`;
  return {
    metadataBase: new URL(base),
    title: { default: "Qui Bulgaria — Scuola bulgara di Milano", template: "%s · Qui Bulgaria" },
    description:
      "Centro linguistico e culturale a Milano: lingua e cultura bulgara, scuola “P. Yavorov”, corsi e danza tradizionale.",
    alternates: { canonical: `${base}/${locale}`, languages: alt },
    icons: { icon: "/assets/img/brand/favicon.svg", apple: "/assets/img/brand/favicon.svg" },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      url: `${base}/${locale}`,
      title: "Qui Bulgaria — Scuola bulgara di Milano",
      images: ["/assets/img/photos/community.png"],
    },
  };
}

export const viewport = { themeColor: "#0f7a3d" };

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  return (
    <html lang={LOCALE_META[locale].htmlLang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..600&family=Inter:wght@400;500;600;700&family=Caveat:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
