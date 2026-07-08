import type { Metadata } from "next";
import WifiStudio from "@/components/studios/WifiStudio";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатен WiFi стикер с QR код";
const DESC =
  "Направи стикер за WiFi с QR код — гостите сканират и телефонът се свързва сам, без да въвеждат парола. За кафенета, къщи за гости, офиси. Безплатно, на български.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "WiFi QR код",
    "WiFi стикер",
    "QR код за WiFi парола",
    "wifi табелка",
    "QR парола за интернет",
  ],
  alternates: { canonical: "/wifi" },
  ...pageMeta(TITLE, DESC),
};

export default function WifiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">📶 WiFi стикер с QR</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          За кафенета, къщи за гости и офиси: гостът сканира QR кода с камерата
          и телефонът се свързва сам — без да диктуваш паролата. Кодът се
          създава в твоя браузър, паролата не се изпраща никъде.
        </p>
      </header>
      <WifiStudio />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "WiFi стикер с QR", path: "/wifi", description: DESC }),
          ),
        }}
      />
    </div>
  );
}
