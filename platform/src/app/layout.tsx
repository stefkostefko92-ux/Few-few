import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Платформа за управление на сайтове",
    template: "%s · Платформа",
  },
  description:
    "Централен пулт за свързаните уебсайтове — мониторинг, съдържание, връзки и деплой.",
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
