import "server-only";
import { prisma } from "@/lib/prisma";
import { subdomainOf } from "@/lib/domains";

// Резолюция на публикуван сайт по хост: наш поддомейн (subdomain) или потвърден
// собствен домейн (customDomain + domainVerified). Само публикувани сайтове.
export async function siteByHost(host: string) {
  const bare = host.split(":")[0].toLowerCase().replace(/\.$/, "");
  const sub = subdomainOf(bare);
  if (sub) {
    return prisma.site.findFirst({ where: { subdomain: sub, published: true } });
  }
  return prisma.site.findFirst({
    where: { customDomain: bare, domainVerified: true, published: true },
  });
}
