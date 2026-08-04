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
    // `/api/` също: активната проверка отваря връзки навън и няма никаква
    // причина робот да я задейства.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/ip/", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
