import type { Metadata } from "next";
import "../../globals.css";
import "./admin.css";
import { fontVars } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Админ панел · Qui Bulgaria",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bg" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
