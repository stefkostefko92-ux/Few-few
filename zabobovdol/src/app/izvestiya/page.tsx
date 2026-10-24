import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { getViberChannelUrl } from "@/lib/settings";
import { PUSH_TOPICS } from "@/lib/push";
import { PushSubscribe } from "@/components/PushSubscribe";
import { ViberButton } from "@/components/ViberButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Известия на телефона — спиране на ток и вода, измами, дежурна аптека",
  description:
    "Получавайте на телефона кратко съобщение за спиране на тока и водата, нови измами, новини и дежурната аптека в Бобов дол. Сами избирате за какво.",
  path: "/izvestiya",
  keywords: [
    "известия Бобов дол",
    "спиране на тока и водата",
    "дежурна аптека известие",
    "измами предупреждения",
    "новини Бобов дол",
    "Carbon Stealth",
  ],
});

const HINTS: Record<keyof typeof PUSH_TOPICS, string> = {
  outages: "Кога и къде спират токът или водата.",
  scams: "Когато в района има нова измама, за която трябва да знаете.",
  news: "Важни новини от общината.",
  pharmacy: "Всяка сутрин — коя аптека дежури днес.",
};

export default async function IzvestiyaPage() {
  const viber = await getViberChannelUrl();
  const topics = (Object.keys(PUSH_TOPICS) as (keyof typeof PUSH_TOPICS)[]).map((key) => ({
    key,
    label: PUSH_TOPICS[key],
    hint: HINTS[key],
  }));

  return (
    <>
      <PageHero
        eyebrow="Помощ със сайта"
        title="Известия на телефона"
        intro="Кратко съобщение на екрана, когато има нещо важно. Само за темите, които изберете."
        crumbs={[{ name: "Известия", path: "/izvestiya" }]}
      />
      {/* Колоната за четене е вътре в контейнера — левият ѝ ръб съвпада със
          заглавието и трохите (B24). */}
      <div className="container-content py-10">
        <div className="max-w-3xl space-y-8">
          <section aria-labelledby="kak-raboti">
            <h2 id="kak-raboti" className="section-title">
              Как работи
            </h2>
            <p className="mt-4">
              Избирате теми и натискате бутона. Телефонът ще ви попита дали разрешавате известията —
              отговорете „Разреши“. Не пазим вашето име, номер или местоположение. Можете да се
              отпишете по всяко време от тази страница.
            </p>
          </section>

          <PushSubscribe topics={topics} />

          <section aria-labelledby="iphone" className="panel">
            <h2 id="iphone" className="font-sans text-xl font-semibold text-slate-900">
              Имате iPhone?
            </h2>
            <p className="mt-2">
              На iPhone известията работят само след като добавите сайта към началния екран (нужна е
              версия iOS 16.4 или по-нова).{" "}
              <Link href="/instaliraj#iphone" className="link">
                Вижте как да сложите сайта на началния екран
              </Link>
              .
            </p>
          </section>

          <section aria-labelledby="drugi-nachini" className="panel space-y-3">
            <h2 id="drugi-nachini" className="font-sans text-xl font-semibold text-slate-900">
              Други начини да следите
            </h2>
            {viber && <ViberButton url={viber} />}
            <p>
              <a href="/novini/rss.xml" className="link">
                RSS абонамент за новините
              </a>{" "}
              — за четци на новини.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
