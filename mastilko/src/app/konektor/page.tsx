import type { Metadata } from "next";
import Link from "next/link";
import CopyField from "@/components/CopyField";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta } from "@/lib/seo";
import { SITE_URL, ID } from "@/lib/site";
import { CATALOG } from "@/lib/mcp/catalog";

const TITLE = "Конектор за ChatGPT и Claude (MCP)";
const DESC =
  "Добави Мастилко като конектор в ChatGPT или Claude и казвай на асистента „направи ми етикети“ — връща готов линк за печат. Безплатно, без регистрация.";
const MCP_URL = `${SITE_URL}/api/mcp`;

// Снимките за документи искат качено от човека изображение — асистент не може
// да ги попълни, затова не ги обещаваме тук (виж каталога в lib/mcp).
const TOOLS = CATALOG.filter((c) => c.id !== "dokumentni-snimki");

const EXAMPLES = [
  "Направи ми 24 етикета 70 × 36 за буркани: Лютеница, Кисело зеле, Мед от липа.",
  "Искам визитки за Иван Петров, счетоводител във „Вега“ ООД, с QR код за контакта.",
  "Направи меню за кафене „Ароматика“ — кафе, чай и три десерта с цени в евро.",
  "Трябват ми баджове за конференция за тези 12 души: …",
  "Календар за октомври 2026 с празниците, в синьо.",
];

const FAQ: Faq[] = [
  {
    q: "Какво е MCP конектор?",
    a: "MCP (Model Context Protocol) е отворен стандарт, през който AI асистент като ChatGPT или Claude ползва външни инструменти. Когато добавиш Мастилко като конектор, асистентът може сам да сглоби етикет, визитка, CV или меню и да ти даде линк към готовия лист.",
  },
  {
    q: "Колко струва?",
    a: "Нищо. Конекторът е безплатен, без регистрация и без ключ — точно като сайта. Нужен ти е само акаунт в ChatGPT или Claude, който позволява собствени конектори.",
  },
  {
    q: "Кои планове на ChatGPT и Claude го позволяват?",
    a: "В Claude собствени конектори има във всички планове — Free, Pro, Max, Team и Enterprise (в безплатния план — един собствен конектор). В ChatGPT трябва режим за разработчици, който е наличен за Plus, Pro, Business, Enterprise и Education, само в уеб версията.",
  },
  {
    q: "Какво става с текста, който пиша на асистента?",
    a: "Това, което асистентът подаде на инструмента (например името за визитката), стига до нашия сървър, ползва се, за да се сглоби линкът, и не се записва — нито в база, нито в лог. Разговорът ти с асистента минава и през OpenAI или Anthropic по техните условия. Подробности има в политиката за поверителност.",
  },
  {
    q: "Защо асистентът ми дава линк, а не PDF?",
    a: "Защото истинският размер в милиметри, шрифтовете и подредбата на листа А4 се виждат най-добре в самия редактор. Отваряш линка, виждаш листа на живо, поправяш каквото искаш и принтираш или запазваш PDF от браузъра.",
  },
  {
    q: "Трябва ли ми регистрация в Мастилко?",
    a: "Не. Конекторът няма вход и ключ. Дизайнът пътува в самия линк, а ние нямаме база данни, в която да го пазим.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "Мастилко ChatGPT",
    "Мастилко Claude",
    "MCP конектор",
    "ChatGPT конектор",
    "Claude конектор",
    "етикети с ChatGPT",
    "визитки с AI",
    "MCP сървър български",
  ],
  alternates: { canonical: "/konektor" },
  ...pageMeta(TITLE, DESC, "/konektor"),
};

const card = "card-warm p-6";
const h2 = "font-display text-2xl font-bold";

export default function KonektorPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Мастилко в ChatGPT и Claude</h1>
      {/* Менютата на двата асистента се преименуват често — датата казва на
          читателя (и на AI, който цитира) колко свежи са стъпките. Обнови я,
          когато ги провериш наново срещу официалните помощни страници. */}
      <p className="mt-2 text-sm text-ink-faint">
        Стъпките са проверени срещу официалните страници на Anthropic и OpenAI на{" "}
        <time dateTime="2026-09-25">25 септември 2026 г.</time>
      </p>

      {/* Отговор отпред — за хора, търсачки и AI асистенти. */}
      <p className="mt-4 text-lg text-ink-soft">
        <strong className="text-ink">
          Мастилко може да се добави като MCP конектор в ChatGPT и Claude.
        </strong>{" "}
        Тогава казваш на асистента „направи ми етикети за буркани“ или „искам визитки
        с QR код“, а той сглобява дизайна и ти връща линк към готовия лист А4 — отваряш
        го, поправяш каквото искаш и принтираш. Безплатно, без регистрация и без ключ.
      </p>
      <p className="mt-3 text-sm text-ink-soft">
        Мастилко е безплатно. Самият асистент има свои условия: в Claude собствени
        конектори има и в безплатния план, а в ChatGPT — от план Plus нагоре.
      </p>

      <section className={`${card} mt-8`} aria-labelledby="adres">
        <h2 id="adres" className={h2}>Адресът на конектора</h2>
        <p className="mt-2 text-ink-soft">Този адрес поставяш в ChatGPT или Claude:</p>
        <div className="mt-4">
          <CopyField value={MCP_URL} label="MCP адрес (Streamable HTTP, без автентикация)" />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="claude">
        <h2 id="claude" className={h2}>Как се добавя в Claude</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6 text-ink-soft">
          <li>
            Отвори <strong className="text-ink">claude.ai</strong> или Claude Desktop и
            влез в <strong className="text-ink">Customize → Connectors</strong>.
          </li>
          <li>
            Натисни <strong className="text-ink">+</strong>, после{" "}
            <strong className="text-ink">Add custom connector</strong>.
          </li>
          <li>Постави адреса отгоре и натисни <strong className="text-ink">Add</strong>. Автентикация не е нужна.</li>
          <li>
            В разговор отвори <strong className="text-ink">+</strong> долу вляво →{" "}
            <strong className="text-ink">Connectors</strong> и включи Мастилко.
          </li>
        </ol>
        <p className="mt-3 text-sm text-ink-faint">
          В планове Team и Enterprise собствен конектор добавя собственикът на
          организацията от Organization settings → Connectors; после всеки член го
          включва от Customize → Connectors.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="chatgpt">
        <h2 id="chatgpt" className={h2}>Как се добавя в ChatGPT</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6 text-ink-soft">
          <li>
            В уеб версията на ChatGPT отвори{" "}
            <strong className="text-ink">Settings → Security and login</strong> и включи{" "}
            <strong className="text-ink">Developer mode</strong>.
          </li>
          <li>
            Отиди в раздела за приложения (в момента се казва{" "}
            <strong className="text-ink">ChatGPT Plugins</strong>) и натисни{" "}
            <strong className="text-ink">+</strong>.
          </li>
          <li>
            Постави адреса отгоре и за автентикация избери{" "}
            <strong className="text-ink">No Authentication</strong>.
          </li>
          <li>
            В разговор избери <strong className="text-ink">Developer mode</strong> от менюто{" "}
            <strong className="text-ink">+</strong> и включи Мастилко.
          </li>
        </ol>
        <p className="mt-3 text-sm text-ink-faint">
          Режимът за разработчици е наличен за Plus, Pro, Business, Enterprise и
          Education, само в уеб версията. OpenAI често преименува тези менюта —
          ако не намираш точния етикет, търси раздела за приложения или конектори.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="primeri">
        <h2 id="primeri" className={h2}>Какво да му кажеш</h2>
        <ul className="mt-4 space-y-2">
          {EXAMPLES.map((e) => (
            <li key={e} className="card-warm px-4 py-3 text-ink-soft">
              „{e}“
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-faint">
          Не е нужно да казваш имена на инструменти — асистентът сам избира кой да
          ползва. Пиши на български.
        </p>
      </section>

      <section className="mt-10" aria-labelledby="instrumenti">
        <h2 id="instrumenti" className={h2}>Какво може да направи</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.id}>
              <Link href={`/${t.id}`} className="text-tera-dark underline-offset-2 hover:underline">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-faint">
          Снимките за документи не могат да се правят през асистент — там трябва да
          качиш своя снимка. Отвори{" "}
          <Link href="/dokumentni-snimki" className="underline">инструмента</Link> направо.
        </p>
      </section>

      <section className={`${card} mt-10`} aria-labelledby="poveritelnost">
        <h2 id="poveritelnost" className={h2}>Какво става с данните</h2>
        <p className="mt-3 text-ink-soft">
          Това, което асистентът подаде на инструмента, стига до нашия сървър само за
          да сглобим линка и <strong className="text-ink">не се записва — нито в база, нито в лог</strong>.
          Дизайнът пътува в самия линк. Разговорът ти минава и през OpenAI или
          Anthropic по техните условия. При WiFi стикера паролата стои вътре в
          линка и в историята на разговора — не публикувай и не препращай линка.
          Пълните подробности са в{" "}
          <Link href="/poveritelnost" className="text-tera-dark underline">политиката за поверителност</Link>.
        </p>
      </section>

      <ToolFaq items={FAQ} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                "@id": `${SITE_URL}/konektor#page`,
                url: `${SITE_URL}/konektor`,
                name: TITLE,
                description: DESC,
                inLanguage: "bg",
                dateModified: "2026-09-25",
                isPartOf: { "@id": ID.site },
                publisher: { "@id": ID.org },
              },
              {
                "@type": "BreadcrumbList",
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Начало", item: SITE_URL },
                  { "@type": "ListItem", position: 2, name: "Конектор за ChatGPT и Claude", item: `${SITE_URL}/konektor` },
                ],
              },
              {
                "@type": "HowTo",
                name: "Как да добавиш Мастилко като конектор в Claude",
                inLanguage: "bg",
                totalTime: "PT2M",
                step: [
                  "Отвори claude.ai или Claude Desktop и влез в Customize → Connectors.",
                  "Натисни +, после Add custom connector.",
                  `Постави адреса ${MCP_URL} и натисни Add.`,
                  "В разговор включи Мастилко от + → Connectors.",
                ].map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
              },
              {
                "@type": "HowTo",
                name: "Как да добавиш Мастилко като конектор в ChatGPT",
                inLanguage: "bg",
                totalTime: "PT3M",
                step: [
                  "В ChatGPT отвори Settings → Security and login и включи Developer mode.",
                  "Отвори раздела за приложения и натисни +.",
                  `Постави адреса ${MCP_URL} и избери No Authentication.`,
                  "В разговор избери Developer mode от менюто + и включи Мастилко.",
                ].map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
              },
              {
                "@type": "FAQPage",
                mainEntity: FAQ.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ],
          }),
        }}
      />
    </article>
  );
}
