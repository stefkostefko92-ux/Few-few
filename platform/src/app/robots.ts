import type { MetadataRoute } from "next";

// Вътрешен инструмент — не индексираме нищо.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
