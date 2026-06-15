import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHero, EmptyState } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { plainText } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Как да… — практични стъпки за е-услуги и документи",
  description:
    "Лесни обяснения стъпка по стъпка: как да ползвате електронни услуги, да извадите документи и да свършите ежедневни задачи онлайн в Бобов дол.",
  path: "/kak-da",
});

export default async function KakDaPage() {
  const faqs = await prisma.faq.findMany({
    where: { published: true },
    orderBy: [{ category: "asc" }, { order: "asc" }],
  });

  const byCategory = new Map<string, typeof faqs>();
  for (const f of faqs) {
    const arr = byCategory.get(f.category) ?? [];
    arr.push(f);
    byCategory.set(f.category, arr);
  }

  return (
    <>
      <PageHero
        title="Как да…"
        intro="Кратки и разбираеми обяснения как да свършите ежедневни неща онлайн — без сложни думи."
        crumbs={[{ name: "Как да…", path: "/kak-da" }]}
      />
      <div className="container-content py-10">
        {faqs.length === 0 ? (
          <EmptyState title="Скоро тук ще добавим полезни въпроси и отговори." />
        ) : (
          <div className="space-y-10">
            {[...byCategory.entries()].map(([cat, items]) => (
              <section key={cat}>
                <h2 className="mb-4 text-xl font-bold text-slate-900">{cat}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {items.map((f) => (
                    <Link key={f.id} href={`/kak-da/${f.slug}`} className="card">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {f.question}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {plainText(f.answer, 130)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
