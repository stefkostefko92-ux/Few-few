import type { MetadataRoute } from "next";
import { SITE } from "../lib/site";

export const dynamic = "force-static";

/** Generated robots.txt (§15). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
