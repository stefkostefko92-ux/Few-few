import type { Metadata } from "next";
import "./globals.css";

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body>
        {/* тъмна/светла тема преди първия paint — без мигане */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ea:tema");if(t==="dark"||(t===null&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
