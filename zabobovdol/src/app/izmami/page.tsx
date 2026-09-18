import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, AlertTriangle, PhoneOff, Ban, Lock, CheckCircle2 } from "@/components/icons";
import { prisma } from "@/lib/prisma";
import { PageHero, Prose } from "@/components/ui";
import { buildMetadata, faqPageLd } from "@/lib/seo";
import { renderMarkdown, plainText } from "@/lib/markdown";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const GUIDE_CATEGORY = "Измами и безопасност";

export const metadata: Metadata = buildMetadata({
  title: "Пази се от измами — как да разпознаеш телефонни и онлайн измами",
  description:
    "Прости правила, които пазят възрастните хора от телефонни и онлайн измами: фалшиви обаждания от „банка“, схемата с „внуче в беда“, измамни SMS и награди. Какво да направите, ако вече сте били измамени.",
  path: "/izmami",
});

// Цветове според нивото на предупреждението.
const SEVERITY: Record<string, { box: string; badge: string; label: string }> = {
  danger: {
    box: "border-crimson-300 bg-crimson-50",
    badge: "bg-crimson-600 text-white",
    label: "Опасно",
  },
  warning: {
    box: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-white",
    label: "Внимание",
  },
  info: {
    box: "border-brand-200 bg-brand-50",
    badge: "bg-brand-700 text-white",
    label: "Информация",
  },
};

const GOLDEN_RULES: { icon: typeof Lock; title: string; text: string }[] = [
  {
    icon: Lock,
    title: "Никога не давай кодове и пароли",
    text: "Банка, НОИ или полиция НИКОГА не искат по телефона ПИН, парола, код от SMS или номер на картата. Поискат ли — това е измама.",
  },
  {
    icon: PhoneOff,
    title: "Затвори и звънни сам",
    text: "При съмнително обаждане затворете. Намерете официалния телефон (на гърба на картата или на сметката) и звъннете вие — не на номера, който са ви дали.",
  },
  {
    icon: Ban,
    title: "Не бързай и не се плаши",
    text: "Измамниците бързат и плашат („веднага“, „спешно“, „внукът ви е в беда“). Спрете. Обадете се на близък и попитайте, преди да направите каквото и да е.",
  },
  {
    icon: AlertTriangle,
    title: "Не давай пари на непознат",
    text: "Никой роднина няма да прати непознат да вземе пари или злато от вкъщи. При такова искане — затворете и звъннете на роднината директно.",
  },
];

export default async function ScamProtectionPage() {
  const [alerts, guides] = await Promise.all([
    prisma.scamAlert.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
    prisma.faq.findMany({
      where: { published: true, category: GUIDE_CATEGORY },
      orderBy: { order: "asc" },
    }),
  ]);

  return (
    <>
      {guides.length > 0 && (
        <JsonLd
          data={faqPageLd(
            guides.slice(0, 12).map((g) => ({
              question: g.question,
              answerText: plainText(g.answer, 280),
            })),
          )}
        />
      )}

      <PageHero
        eyebrow="Безопасност"
        title="Пази се от измами"
        intro="Измамниците често търсят точно възрастните хора. Тук са простите правила, които ви пазят — и какво да направите, ако вече сте били измамени."
        crumbs={[{ name: "Пази се от измами", path: "/izmami" }]}
      />

      <div className="container-content space-y-12 py-10">
        {/* Активни предупреждения в момента */}
        {alerts.length > 0 && (
          <section>
            <h2 className="section-title mb-5">Внимание — измами в момента</h2>
            <div className="space-y-4">
              {alerts.map((a) => {
                const s = SEVERITY[a.severity] ?? SEVERITY.warning;
                return (
                  <article key={a.id} className={"rounded-xl border p-5 " + s.box}>
                    <div className="flex items-start gap-3">
                      <AlertTriangle
                        className="mt-0.5 h-6 w-6 shrink-0 text-slate-700"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold " +
                              s.badge
                            }
                          >
                            {s.label}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{a.title}</h3>
                        </div>
                        {a.summary && (
                          <p className="mt-1.5 text-slate-700">{a.summary}</p>
                        )}
                        {a.body && (
                          <div className="mt-2">
                            <Prose html={renderMarkdown(a.body)} />
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Златни правила */}
        <section>
          <h2 className="section-title mb-5">4 златни правила</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {GOLDEN_RULES.map((r) => {
              const Icon = r.icon;
              return (
                <div key={r.title} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900">{r.title}</h3>
                    <p className="mt-1 text-slate-600">{r.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Какво да направя, ако вече съм измамен */}
        <section className="rounded-2xl border border-crimson-200 bg-crimson-50 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-crimson-700" aria-hidden />
            <h2 className="text-2xl font-bold text-slate-900">
              Ако вече ви измамиха — действайте веднага
            </h2>
          </div>
          <ol className="mt-4 space-y-2.5">
            {[
              "Обадете се незабавно на банката си и поискайте да блокират картата/сметката. Телефонът е на гърба на картата.",
              "Подайте сигнал в полицията на 112 или в районното управление. Опишете какво се случи.",
              "Запазете всичко — съобщения, номера, документи за преводи. Те помагат на разследването.",
              "Кажете на близък човек. Не се срамувайте — измамниците лъжат професионално и жертва може да стане всеки.",
              "Сменете паролите си, ако сте ги издали, и следете сметката за нови движения.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-crimson-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-slate-800">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="tel:112" className="btn-primary">
              Спешност 112
            </a>
            <Link href="/uslugi?cat=EMERGENCY" className="btn-secondary">
              Важни телефони
            </Link>
          </div>
        </section>

        {/* Свързани подробни ръководства */}
        {guides.length > 0 && (
          <section>
            <h2 className="section-title mb-5">Подробни обяснения</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {guides.map((g) => (
                <Link key={g.id} href={`/kak-da/${g.slug}`} className="card">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{g.question}</h3>
                      <p className="mt-1 text-sm text-slate-600">{plainText(g.answer, 120)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="no-print">
          <PrintButton variant="secondary" label="Принтирай тези съвети" />
        </div>

        <p className="text-sm text-slate-600">
          Имате съмнение за измама или искате да предупредите съседите? Обадете
          ни се на{" "}
          <a href={`tel:${SITE.contact.phone}`} className="font-medium text-brand-700 hover:underline">
            {SITE.contact.phone}
          </a>
          .
        </p>
      </div>
    </>
  );
}
