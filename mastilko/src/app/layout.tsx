import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const sans = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Playfair_Display({
  subsets: ["cyrillic", "latin"],
  variable: "--font-display",
  display: "swap",
});

const SITE_URL = "https://mastilko.carbonstealth.eu";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Мастилко — безплатни етикети, визитки и CV за печат",
    template: "%s · Мастилко",
  },
  description:
    "Създай безплатно етикети, визитки и автобиография (CV) на български — направо в браузъра, без регистрация, готови за принтиране на А4.",
  keywords: [
    "етикети за печат",
    "безплатни етикети",
    "визитки онлайн",
    "CV на български",
    "автобиография шаблон",
    "принтиране А4",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "bg_BG",
    url: SITE_URL,
    siteName: "Мастилко",
    title: "Мастилко — безплатни етикети, визитки и CV за печат",
    description:
      "Етикети, визитки и CV на български — безплатно, без регистрация, готови за принтиране.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Мастилко — дизайн и печат: визитки, етикети, CV" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Мастилко — безплатни етикети, визитки и CV за печат",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg" className={`${sans.variable} ${display.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
