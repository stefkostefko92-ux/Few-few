import type { MetadataRoute } from "next";

const BASE = "https://mastilko.carbonstealth.eu";

export default function sitemap(): MetadataRoute.Sitemap {
  // lastmod = моментът на билда — при всеки деплой съдържанието е прегледано.
  const lastModified = new Date();
  return ["", "/etiketi", "/vizitki", "/cv", "/pismo", "/gramoti", "/wifi", "/poveritelnost", "/usloviya"].map(
    (path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: "monthly",
      priority: path === "" ? 1 : path.startsWith("/p") || path.startsWith("/u") ? 0.3 : 0.9,
    }),
  );
}
