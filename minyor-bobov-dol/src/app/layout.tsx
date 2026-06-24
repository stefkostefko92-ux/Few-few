import type { Metadata, Viewport } from "next";
import { Inter, Bitter } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { sportsOrganizationLd, websiteLd } from "@/lib/seo";
import { getFacebookUrl, getSeoVerification } from "@/lib/settings";
import { SiteHeader } from "@/components/SiteHeader";
import { AccessibilityBar } from "@/components/AccessibilityBar";
import { SiteFooter } from "@/components/SiteFooter";
import { CookieConsent } from "@/components/CookieConsent";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});
const serif = Bitter({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.slogan}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: "/manifest.webmanifest",
  alternates: { canonical: SITE.url },
  keywords: [
    "Миньор Бобов дол",
    "ФК Миньор Бобов дол",
    "футбол Бобов дол",
    "Миньор 2019",
    "програма Миньор",
    "класиране Миньор",
    "стадион Николай Кръстев Шулц",
  ],
  authors: [{ name: SITE.name }],
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.slogan}`,
    description: SITE.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.slogan}`,
    description: SITE.description,
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png" }],
    shortcut: [{ url: "/icon-192.png" }],
  },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  formatDetection: { telephone: true, address: true, email: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16181d",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [facebookUrl, seoVer] = await Promise.all([
    getFacebookUrl(),
    getSeoVerification(),
  ]);
  return (
    <html lang="bg" className={`${sans.variable} ${serif.variable}`}>
      <head>
        {seoVer.google && (
          <meta name="google-site-verification" content={seoVer.google} />
        )}
        {seoVer.bing && <meta name="msvalidate.01" content={seoVer.bing} />}
        {/* GEO мета сигнали за локално търсене */}
        <meta name="geo.region" content={SITE.geo.regionCode} />
        <meta name="geo.placename" content={SITE.geo.city} />
        <meta
          name="geo.position"
          content={`${SITE.geo.latitude};${SITE.geo.longitude}`}
        />
        <meta
          name="ICBM"
          content={`${SITE.geo.latitude}, ${SITE.geo.longitude}`}
        />
        <JsonLd
          data={[
            sportsOrganizationLd({ sameAs: facebookUrl ? [facebookUrl] : [] }),
            websiteLd(),
          ]}
        />
        {/* Анонимна статистика (Plausible) — по избор, без бисквитки. Зарежда се
            само ако е зададен NEXT_PUBLIC_PLAUSIBLE_DOMAIN. */}
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src={
              process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ||
              "https://plausible.io/js/script.js"
            }
          />
        )}
        {/* Прилага запазените настройки за достъпност преди първия рендер,
            за да няма „премигване" на размера/контраста. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s={'2':'112.5%','3':'125%'};var f=localStorage.getItem('a11y-font');if(f&&s[f])document.documentElement.style.fontSize=s[f];if(localStorage.getItem('a11y-contrast')==='1')document.documentElement.classList.add('hc');if(localStorage.getItem('a11y-bigtouch')==='1')document.documentElement.classList.add('bt');if(localStorage.getItem('a11y-dark')==='1')document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Прескочи към съдържанието
        </a>
        <AccessibilityBar />
        <SiteHeader />
        <main id="main" className="min-h-[60vh]">
          {children}
        </main>
        <SiteFooter />
        <CookieConsent />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
