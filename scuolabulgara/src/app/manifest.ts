import type { MetadataRoute } from "next";
import { getOne } from "@/lib/content";

// The web-app manifest (name, description) follows the admin's settings and
// SEO text, in Italian, the site's main language.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [settings, seo] = await Promise.all([getOne("it", "settings"), getOne("it", "seo")]);
  return {
    name: `${settings.brandName} — ${settings.brandSub}`,
    short_name: settings.brandName,
    description: seo.description,
    start_url: "/",
    display: "standalone",
    background_color: "#fdfcf9",
    theme_color: "#fdfcf9",
    icons: [{ src: "/assets/img/brand/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
