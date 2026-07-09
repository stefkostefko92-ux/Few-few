import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE } from "../lib/site";
import { JsonLd } from "../components/JsonLd";
import { Footer, Header } from "../components/Chrome";
import { organizationLd, websiteLd } from "../lib/jsonld";
import { I18nProvider } from "../i18n/I18nProvider";

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
};

export const viewport: Viewport = {
  themeColor: "#0b0f24",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <head>
        <JsonLd data={[organizationLd(), websiteLd()]} />
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
