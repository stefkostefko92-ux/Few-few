import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${SITE.name} — ${SITE.slogan}`,
    short_name: SITE.shortName,
    description: SITE.description,
    // ?s=app — за да се брои (само като брой на ден) колко пъти сайтът е
    // отворен от иконата на началния екран. id остава „/“, затова вече
    // инсталираните икони не се смятат за друго приложение.
    start_url: "/?s=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "ltr",
    // Тъмносиньо като началния екран на приложението (splash) — без премигване.
    background_color: "#1a2575",
    theme_color: "#212f8a",
    lang: "bg",
    // Без „government“: сайтът е независим, не е държавно/общинско приложение
    // (и правилата на Google Play за TWA забраняват да се внушава връзка с
    // държавен орган).
    categories: ["news", "utilities", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Отделен файл със safe-zone отстъп — пълноразмерната икона би се
      // отрязала в кръглата маска на Android лаунчъра.
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
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
