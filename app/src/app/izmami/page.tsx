import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout, Sources } from "@/components/content";
import { getPublishedScamAlerts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Пази се от измами",
  description:
    "Как да разпознаете телефонни и онлайн измами, насочени към възрастни хора, и какво да направите. Прости правила, които пазят парите ви.",
  path: "/izmami",
});

export default async function IzmamiPage() {
  const alerts = await getPublishedScamAlerts();
  return (
    <>
      <JsonLd data={webPageLd({ name: "Пази се от измами", path: "/izmami" })} />
      <PageHero
        eyebrow="Безопасност"
        title="Пази се от измами"
        intro="Измамниците често търсят възрастни хора по телефона и онлайн. Ето как да ги разпознаете и спрете навреме."
        crumbs={[{ name: "Пази се от измами", path: "/izmami" }]}
      />

      <div className="container-content py-10">
        {alerts.length > 0 && (
          <section className="mb-8">
            <h2 className="section-title mb-4">Актуални предупреждения</h2>
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={
                    "rounded-xl border p-4 " +
                    (a.severity === "danger"
                      ? "border-red-300 bg-red-50"
                      : "border-gold-300 bg-gold-50")
                  }
                >
                  <p className="font-display text-lg font-bold text-slate-900">
                    {a.title}
                  </p>
                  {a.summary && <p className="mt-1 text-base text-slate-700">{a.summary}</p>}
                  {a.body && <p className="mt-2 whitespace-pre-line text-base text-slate-600">{a.body}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Callout tone="danger">
          Едно просто правило пази най-много: <strong>никога</strong> не давайте
          пари, банкови данни или кодове на човек, който ви се е обадил. Затворете и
          се обадете сами на близък или на телефон, който знаете.
        </Callout>

        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Тревожни признаци</h2>
          <ul>
            <li>Бързат ви и ви плашат — „веднага“, „спешно“, „ще загубите парите“.</li>
            <li>Искат тайна — да не казвате на близки или на банката.</li>
            <li>Представят се за роднина в беда, полицай, банков или социален служител.</li>
            <li>Искат да платите по необичаен начин — кодове, криптовалута, куриер за пари.</li>
            <li>Молят да инсталирате програма или да им продиктувате код от SMS.</li>
          </ul>

          <h2>Какво да направите</h2>
          <ul>
            <li>Затворете телефона. Това не е грубо — това е безопасно.</li>
            <li>Обадете се на близък и попитайте, преди да направите каквото и да е.</li>
            <li>Никога не давайте PIN, парола или код от SMS на никого.</li>
            <li>Банката и полицията никога няма да поискат да им преведете пари „за проверка“.</li>
            <li>Ако вече сте дали данни — обадете се веднага на банката си и сменете паролите.</li>
          </ul>

          <h2>Към кого да се обърнете</h2>
          <ul>
            <li>При опит за измама или кражба: <strong>112</strong>.</li>
            <li>Посъветвайте се с близък човек, на когото имате доверие.</li>
            <li>Банката си — на телефона, отпечатан на гърба на картата ви.</li>
          </ul>
        </div>

        <Callout tone="info">
          Споделете тези правила с родител или съсед. Един разговор често спестява
          цяла пенсия.
        </Callout>

        <Sources
          items={[
            { label: "Единен телефон за спешни случаи 112", url: "https://112.bg/" },
          ]}
        />
      </div>
    </>
  );
}
