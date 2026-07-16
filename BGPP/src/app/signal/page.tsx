import type { Metadata } from "next";
import { PageHero, Section } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";
import { ShieldCheck, External } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Как да подадеш сигнал",
  description:
    "Практично ръководство къде и как да подадеш сигнал за нередност в държавно предприятие: Сметна палата, прокуратура, Европейска прокуратура/OLAF, КЗК, АДФИ.",
  path: "/signal",
});

const CHANNELS = [
  {
    name: "Сметна палата (конфликт на интереси, декларации)",
    url: "https://www.bulnao.government.bg/bg/konflikt-na-interesi/",
    what: "Правоприемник на КПК (от 2026). За конфликт на интереси и проверка на декларациите на ръководителите. Производство не се образува по анонимен сигнал.",
  },
  {
    name: "Европейска прокуратура (ЕППО)",
    url: "https://www.eppo.europa.eu/en/report-crime",
    what: "За измами с европейски средства (над 10 000 €), корупция и изпиране на пари, засягащи бюджета на ЕС. Приема сигнали и от граждани, вкл. анонимни.",
  },
  {
    name: "OLAF (Европейска служба за борба с измамите)",
    url: "https://anti-fraud.ec.europa.eu/olaf-and-you/report-fraud_en",
    what: "За нередности и измами с европейски средства. Онлайн система за сигнали (може анонимно).",
  },
  {
    name: "Прокуратура на Република България",
    url: "https://prb.bg/",
    what: "За престъпления (безстопанственост, длъжностни престъпления, присвояване). Сигналът трябва да е подписан и с конкретни данни.",
  },
  {
    name: "Комисия за защита на конкуренцията (КЗК)",
    url: "https://www.cpc.bg/",
    what: "За обжалване на обществени поръчки и картели.",
  },
  {
    name: "Агенция за държавна финансова инспекция (АДФИ)",
    url: "https://www.adfi.minfin.bg/",
    what: "За финансови нарушения при разходване на публични средства и обществени поръчки.",
  },
];

export default function SignalPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", path: "/" },
          { name: "Как да подадеш сигнал", path: "/signal" },
        ])}
      />
      <PageHero
        eyebrow="Действай"
        title="Как да подадеш сигнал"
        intro="Ако забележиш нередност в държавно предприятие — ето къде да я подадеш и какво трябва да съдържа сигналът."
        crumbs={[{ name: "Как да подадеш сигнал", path: "/signal" }]}
      />
      <div className="container-content space-y-10 py-10">
        <Section title="Къде да подадеш" icon={<ShieldCheck className="h-6 w-6 text-brand-700" aria-hidden />}>
          <ul className="grid gap-4 md:grid-cols-2">
            {CHANNELS.map((c) => (
              <li key={c.url}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-300"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{c.name}</span>
                    <External className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                  </span>
                  <span className="mt-2 text-sm text-slate-600">{c.what}</span>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Какво да съдържа сигналът">
          <ul className="list-disc space-y-2 pl-6 text-slate-600">
            <li><strong>Кой и какво</strong> — предприятие, поръчка/договор, конкретни действия.</li>
            <li><strong>Кога</strong> — период и дати.</li>
            <li><strong>Доказателства</strong> — документи, номера на поръчки (СИГМА/ЦАИС ЕОП), суми.</li>
            <li><strong>Твои данни</strong> — за производство по конфликт на интереси не се приема анонимен сигнал; за ЕППО/OLAF е възможно анонимно.</li>
            <li><strong>Дата и подпис</strong> (при писмен сигнал до български орган).</li>
          </ul>
          <div className="mt-5 rounded-xl border-l-4 border-brand-400 bg-brand-50 p-4 text-sm text-slate-700">
            Подателят на сигнал е защитен — органът е длъжен да не разкрива самоличността му,
            а подаването не може да бъде основание за преследване.
          </div>
        </Section>
      </div>
    </>
  );
}
