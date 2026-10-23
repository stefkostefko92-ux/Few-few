import Link from "next/link";
import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { getViberChannelUrl } from "@/lib/settings";
import { PUSH_TOPICS } from "@/lib/push";
import { PushSubscribe } from "@/components/PushSubscribe";
import { ViberButton } from "@/components/ViberButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Известия на телефона — спиране на ток и вода, измами, дежурна аптека",
    description:
      "Получавайте на телефона кратко съобщение за спиране на тока и водата, нови измами, новини и дежурната аптека в Бобов дол. Сами избирате за какво.",
    path: "/izvestiya",
  }),
  keywords: [
    "Carbon Stealth",
    "известия Бобов дол",
    "спиране на тока и водата",
    "дежурна аптека известие",
    "измами предупреждения",
    "новини Бобов дол",
  ],
};

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
        eyebrow="Известия"
        title="Известия на телефона"
        intro="Кратко съобщение на екрана, когато има нещо важно. Само за темите, които изберете."
        crumbs={[{ name: "Известия", path: "/izvestiya" }]}
      />
      <div className="container-content max-w-2xl space-y-8 py-10">
        <section className="space-y-3 text-lg">
          <h2 className="section-title">Как работи</h2>
          <p>
            Избирате теми и натискате бутона. Телефонът ще ви попита дали разрешавате известията — отговорете „Разреши“.
            Не пазим вашето име, номер или местоположение. Можете да се отпишете по всяко време от тази страница.
          </p>
        </section>

        <PushSubscribe topics={topics} />

        <section className="card space-y-2">
          <h2 className="section-title">Имате iPhone?</h2>
          <p>
            На iPhone известията работят само след като добавите сайта към началния екран (нужна е версия iOS 16.4 или
            по-нова). Стъпките са{" "}
            <Link href="/instaliraj" className="underline">
              тук
            </Link>
            .
          </p>
        </section>

        <section className="card space-y-3">
          <h2 className="section-title">Други начини да следите</h2>
          {viber && <ViberButton url={viber} />}
          <p>
            <a href="/novini/rss.xml" className="underline">
              RSS абонамент за новините
            </a>{" "}
            — за четци на новини.
          </p>
        </section>
      </div>
    </>
  );
}
