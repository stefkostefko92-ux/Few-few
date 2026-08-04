import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * `/ip/` е забранено нарочно: страниците с резултат съдържат данни за трети
 * лица от публични регистри и не бива да стават търсим указател. Забраната
 * дублира `noindex` метаданните — двата механизма пазят различни случаи
 * (robots спира обхождането, `noindex` спира индексирането на вече обходено).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/ip/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
