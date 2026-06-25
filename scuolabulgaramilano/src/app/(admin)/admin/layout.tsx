import type { Metadata } from "next";
import "../../globals.css";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin · Qui Bulgaria",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
