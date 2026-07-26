import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import RegistraSw from "@/components/RegistraSw";

export const metadata: Metadata = {
  title: {
    default: "ERP Ascensori Enterprise",
    template: "%s · ERP Ascensori",
  },
  description:
    "Gestionale completo per aziende di installazione e manutenzione ascensori: impianti, scadenze, magazzino, preventivi, ordini di lavoro, fatturazione elettronica e DDT.",
  keywords: [
    "ERP ascensori",
    "gestionale manutenzione ascensori",
    "ordini di lavoro ascensori",
    "fatturazione elettronica",
    "scadenze impianti elevatori",
    "Carbon Stealth",
  ],
  robots: { index: false, follow: false }, // вътрешен B2B инструмент
  // Инсталируемо приложение: техникът го стартира с икона от началния екран,
  // а не с адрес, набран на ръка в машинно помещение.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ERP Ascensori",
    // Прозрачна лента: съдържанието стига до горния ръб на iPhone.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // `viewport-fit=cover` + безопасните зони в CSS: без него интерфейсът влиза
  // под изреза и под лентата за жестове на iPhone.
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Мащабирането НЕ се заключва: заключеният zoom е нарушение на WCAG 1.4.4, а
  // техникът чете матрикола на дребен шрифт в тъмно помещение.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#14161a" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nonce-ът идва от middleware-а. Четенето на хедър прави дървото динамично —
  // и трябва да е така: предрисуван HTML би носил nonce от времето на билда,
  // който браузърът НЯМА да приеме, тоест приложението не би тръгнало изобщо.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="it" suppressHydrationWarning>
      <body>
        {/* тъмна/светла тема преди първия paint — без мигане */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ea:tema");if(t==="dark"||(t===null&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        {children}
        <RegistraSw />
      </body>
    </html>
  );
}
