import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "../lib/site";
import { JsonLd } from "../components/JsonLd";
import { Footer, Header } from "../components/Chrome";
import { organizationLd, webAppLd, websiteLd } from "../lib/jsonld";
import { I18nProvider } from "../i18n/I18nProvider";
import { Analytics } from "../components/Analytics";

/** Search-engine ownership verification — set per provider in env, omitted when unset. */
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const bingVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "игри на карти",
    "белот онлайн",
    "сантасе",
    "шах онлайн",
    "табла",
    "билярд онлайн",
    "снукър онлайн",
    "тексас холдем",
    "браузърни игри",
    "безплатни игри",
  ],
  authors: [{ name: SITE.org.legalName, url: SITE.org.url }],
  creator: SITE.org.legalName,
  publisher: SITE.org.legalName,
  category: "games",
  formatDetection: { telephone: false, email: false, address: false },
  alternates: {
    canonical: "/",
    languages: { bg: "/", "x-default": "/" },
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    locale: "bg_BG",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
  ...(googleVerification || bingVerification
    ? {
        verification: {
          ...(googleVerification ? { google: googleVerification } : {}),
          ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
        },
      }
    : {}),
};

export const viewport: Viewport = {
  themeColor: "#0b0f24",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <head>
        <JsonLd data={[organizationLd(), websiteLd(), webAppLd()]} />
        <Analytics />
      </head>
      <body>
        <I18nProvider>
          <Header />
          <main>{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
