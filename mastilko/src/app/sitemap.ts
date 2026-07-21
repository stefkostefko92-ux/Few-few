import type { MetadataRoute } from "next";

const BASE = "https://mastilko-bg.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // lastmod = моментът на билда — при всеки деплой съдържанието е прегледано.
  const lastModified = new Date();
  const tools = ["/etiketi", "/vizitki", "/cv", "/pismo", "/gramoti", "/pokani", "/tabelki", "/wifi", "/badzhove", "/obyava", "/vaucheri"];
  const legal = ["/impresum", "/poveritelnost", "/usloviya"];
  return ["", ...tools, ...legal].map((path) => ({
    url: `${BASE}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : legal.includes(path) ? "yearly" : "monthly",
    priority: path === "" ? 1 : legal.includes(path) ? 0.3 : 0.9,
  }));
}
