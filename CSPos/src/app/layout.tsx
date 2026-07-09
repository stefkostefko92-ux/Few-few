import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GlassRuntime } from "@/components/glass";

export const metadata: Metadata = {
  title: {
    default: "Carbon Stealth POS — касова система",
    template: "%s · Carbon Stealth POS",
  },
  applicationName: "Carbon Stealth POS",
  description:
    "Carbon Stealth POS — касова система за хранителни магазини: продажби, фискални устройства, ПОС терминали, склад и отчети.",
  robots: { index: false, follow: false }, // вътрешна система — не се индексира
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Touch монитор / kiosk: без pinch-zoom и без случайно мащабиране при бърз тъч
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#eef1f6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg">
      <body className="app-bg min-h-screen">
        <GlassRuntime />
        {children}
      </body>
    </html>
  );
}
