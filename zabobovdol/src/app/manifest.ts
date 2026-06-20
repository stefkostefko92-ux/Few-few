import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.slogan}`,
    short_name: SITE.shortName,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#212f8a",
    lang: "bg",
    categories: ["government", "education", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
