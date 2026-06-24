import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  const icon = (purpose: "any" | "maskable") => [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose },
  ];
  return {
    id: "/",
    name: `${SITE.name} — ${SITE.slogan}`,
    short_name: SITE.shortName,
    description: SITE.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "ltr",
    // Тъмносиньо като началния екран на приложението (splash) — без премигване.
    background_color: "#1a2575",
    theme_color: "#212f8a",
    lang: "bg",
    categories: ["government", "education", "lifestyle"],
    icons: [
      ...icon("any"),
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Бързи преки пътища (при задържане на иконата на приложението).
    shortcuts: [
      {
        name: "Дежурна аптека",
        short_name: "Аптека",
        url: "/dezhurna-apteka",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Услуги и телефони",
        short_name: "Телефони",
        url: "/uslugi",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Как да… (ръководства)",
        short_name: "Как да…",
        url: "/kak-da",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Данъци и срокове",
        short_name: "Данъци",
        url: "/danaci-srokove",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
