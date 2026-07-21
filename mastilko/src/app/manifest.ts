import type { MetadataRoute } from "next";

// Уеб манифест — прави Мастилко инсталируемо приложение (PWA), което работи и
// офлайн (виж public/sw.js + PwaRegister). Без сървър, без данни навън.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Мастилко — етикети, визитки и CV за печат",
    short_name: "Мастилко",
    description:
      "Безплатни етикети, визитки, CV, грамоти, покани, табелки и WiFi стикери за печат. Без регистрация, работи и офлайн.",
    lang: "bg",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF4E8",
    theme_color: "#3A86B9",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
