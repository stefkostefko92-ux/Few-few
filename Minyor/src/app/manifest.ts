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
    background_color: "#16181d",
    theme_color: "#16181d",
    lang: "bg",
    categories: ["sports", "entertainment"],
    icons: [
      ...icon("any"),
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Програма и резултати",
        short_name: "Програма",
        url: "/programa",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Класиране",
        short_name: "Класиране",
        url: "/klasirane",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Новини",
        short_name: "Новини",
        url: "/novini",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
