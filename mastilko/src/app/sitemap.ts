import type { MetadataRoute } from "next";

const BASE = "https://mastilko.carbonstealth.eu";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/etiketi", "/vizitki", "/cv", "/poveritelnost", "/usloviya"].map(
    (path) => ({
      url: `${BASE}${path}`,
      changeFrequency: "monthly",
      priority: path === "" ? 1 : path.startsWith("/p") || path.startsWith("/u") ? 0.3 : 0.9,
    }),
  );
}
