import type { Metadata } from "next";
import Image from "next/image";
import WifiStudio from "@/components/studios/WifiStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатен WiFi стикер с QR код";
const DESC =
  "Направи стикер за WiFi с QR код — гостите сканират и телефонът се свързва сам, без да въвеждат парола. За кафенета, къщи за гости, офиси. Безплатно, на български.";

const HOWTO = {
  name: "Как да направиш WiFi QR стикер",
  steps: [
    "Въведи името на мрежата (SSID), паролата и вида защита (WPA/WPA2).",
    "Виж генерирания QR код на живо и добави надпис (напр. „Свържи се с нашия WiFi“).",
    "Принтирай стикера и го залепи — гостите сканират с камерата и се свързват сами.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Как работи WiFi QR кодът?",
    a: "Кодът съдържа името на мрежата и паролата в стандартен формат. При сканиране с камерата телефонът предлага да се свърже автоматично, без ръчно въвеждане на паролата.",
  },
  {
    q: "Сигурно ли е — къде отива паролата ми?",
    a: "Паролата не напуска браузъра ти. QR кодът се генерира изцяло локално на устройството, без външна услуга — нищо не се изпраща към нас или трети страни.",
  },
  {
    q: "Работи ли на iPhone и Android?",
    a: "Да. Съвременните камери на iPhone (iOS 11+) и Android разпознават WiFi QR кодове директно от приложението за камера.",
  },
];

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
  ...pageMeta(TITLE, DESC, "/wifi"),
};

export default function WifiPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/wifi.png" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          WiFi стикер с QR
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „WiFi стикер“ е безплатен инструмент за WiFi QR стикер на български</strong>{" "}
          — гостът сканира QR кода с камерата и телефонът се свързва сам, без да
          диктуваш паролата. За кафенета, къщи за гости и офиси. Кодът се
          създава изцяло в твоя браузър — паролата не се изпраща никъде.
        </p>
      </header>
      <WifiStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "WiFi стикер с QR", path: "/wifi", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
