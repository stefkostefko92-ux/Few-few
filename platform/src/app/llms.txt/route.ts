import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { isPlatformHost } from "@/lib/domains";
import { siteByHost } from "@/lib/site-by-host";
import { LEGAL_DOCS } from "@/lib/legal";

export const dynamic = "force-dynamic";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://platform.carbonstealth.eu";

function text(body: string) {
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// llms.txt — карта за AI асистенти (Claude, Perplexity). Host-aware: на клиентски
// хост описва конкретния сайт; на платформата — продукта и публичните страници.
export async function GET() {
  const host = (await headers()).get("host") || "";

  try {
    if (host && !isPlatformHost(host)) {
      const site = await siteByHost(host);
      if (!site) return text("# Сайтът не е намерен.\n");
      const origin = `https://${host.split(":")[0]}`;
      const pages = await prisma.page.findMany({
        where: { siteId: site.id, status: "PUBLISHED" },
        select: { slug: true, title: true },
        orderBy: { navOrder: "asc" },
      });
      const lines = pages.map(
        (p) => `- [${p.title}](${p.slug === "" ? `${origin}/` : `${origin}/${p.slug}`})`,
      );
      return text(`# ${site.name}\n\n## Страници\n${lines.join("\n")}\n`);
    }

    const legal = LEGAL_DOCS.map(
      (d) => `- [${d.title}](${BASE}/legal/${d.slug})`,
    ).join("\n");
    return text(
      `# Carbon Stealth — конструктор на сайтове\n\n` +
        `> Платформа за изграждане на професионални уебсайтове на български, ` +
        `английски и италиански: готови шаблони, собствен домейн, AI помощник.\n\n` +
        `## Основни\n- [Начало](${BASE}/)\n- [Регистрация](${BASE}/register)\n\n` +
        `## Правни\n${legal}\n`,
    );
  } catch {
    return text("# Carbon Stealth\n");
  }
}
