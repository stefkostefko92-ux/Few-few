import type { Metadata, Viewport } from "next";
import { Inter, Bitter } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/site";
import { JsonLd } from "@/components/JsonLd";
import { organizationLd, websiteLd } from "@/lib/seo";
import { SiteHeader } from "@/components/SiteHeader";
import { AccessibilityBar } from "@/components/AccessibilityBar";
import { SiteFooter } from "@/components/SiteFooter";
import { ChromeGate } from "@/components/ChromeGate";

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
    "Дупница",
    "услуги Дупница",
    "телефони Дупница",
    "дежурна аптека Дупница",
    "ВиК Дупница",
    "болница Дупница",
  ],
  authors: [{ name: SITE.name }],
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.slogan}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  formatDetection: { telephone: true, address: true, email: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#125939",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bg" className={`${sans.variable} ${serif.variable}`}>
      <head>
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
        <JsonLd data={[organizationLd(), websiteLd()]} />
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
        <ChromeGate>
          <AccessibilityBar />
          <SiteHeader />
        </ChromeGate>
        <main id="main" className="min-h-[60vh]">
          {children}
        </main>
        <ChromeGate>
          <SiteFooter />
        </ChromeGate>
      </body>
    </html>
  );
}
