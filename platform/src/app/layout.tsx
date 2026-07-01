import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu",
  ),
  title: {
    default: "Платформа за управление на сайтове",
    template: "%s · Платформа",
  },
  description:
    "Централен пулт за свързаните уебсайтове — мониторинг, съдържание, връзки и деплой.",
  // Панелът е noindex по подразбиране; публичните /site/* страници го отменят.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bg" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
