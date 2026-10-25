import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChevronDown } from "@/components/icons";
import { ArticleActions, PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { PrintSourceLine } from "@/components/PrintSourceLine";
import { OpenDetailsOnPrint } from "@/components/OpenDetailsOnPrint";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { POPULATION } from "@/lib/town-facts";
import { SECTION } from "@/lib/section-names";

// Динамична — заради реда „отпечатано на …“ (PrintSourceLine): на статична
// страница на хартия излизаше датата на билда, не на печата.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "История на Бобов дол — от долината с форма на боб до миньорската столица",
  description:
    "Подробна история на град Бобов дол по етапи: произход на името, древност и Средновековие, Възраждане, въгледобив и ТЕЦ, индустриален разцвет, преход и днес. Църкви, училища, известни личности и кметове.",
  path: "/istoriya",
  type: "article",
  keywords: [
    "история на Бобов дол",
    "Бобов дол миньори",
    "въгледобив Бобов дол",
    "ТЕЦ Бобов дол",
    "църква Свети Никола Бобов дол",
    "Кюстендилска област история",
    "Carbon Stealth",
  ],
});

// Котвите са само на латиница — споделена връзка (#tsarkvi) работи навсякъде.
const TOC: [id: string, label: string][] = [
  ["ime", "Произход на името"],
  ["drevnost", "Древност и Средновековие"],
  ["vazrazhdane", "Възраждане и Освобождение"],
  ["vagledobiv", "Раждането на въгледобива"],
  ["kvartali", "Квартали и население"],
  ["razcvet", "Индустриален разцвет"],
  ["prehod", "Преход и днес"],
  ["tsarkvi", "Църкви и духовност"],
  ["uchilishta", "Училища и образование"],
  ["lichnosti", "Известни личности"],
  ["kmetove", "Кметове и управление"],
  ["kultura", "Култура, музей и спорт"],
  ["hronologiya", "Хронология"],
];

const TIMELINE: { year: string; text: string }[] = [
  { year: "XVI\u00a0в.", text: "Селището се споменава в османски данъчни документи." },
  { year: "1822", text: "Издигната е възрожденската църква „Свети Никола“." },
  { year: "1830-те", text: "Френският геолог Ами Буе проучва находищата на каменни въглища." },
  { year: "1878", text: "Освобождението на България." },
  { year: "1881", text: "Отваря врати първото училище." },
  { year: "1891", text: "Започва промишленият добив на въглища." },
  { year: "1907", text: "Учредено е търговско дружество за добив на въглища." },
  { year: "1917", text: "Построена е теснолинейна железница до Дупница." },
  { year: "след 1944", text: "Бобов дол се превръща в голям въгледобивен и индустриален център." },
  { year: "1973–1975", text: "Изграден е енергийният център ТЕЦ „Бобов дол“ край града." },
  {
    year: "1980-те",
    text: "Разцвет: над 7300 миньори добиват над 2\u00a0млн. тона въглища годишно.",
  },
  {
    year: "наши дни",
    text: "Регион в преход — закриване на въгледобива и търсене на ново бъдеще.",
  },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-zaglavie`} className="mt-10 first:mt-0">
      <h2 id={`${id}-zaglavie`} className="text-2xl font-bold text-slate-900">
        {title}
      </h2>
      <div className="prose-content mt-3 text-slate-700">{children}</div>
    </section>
  );
}

function TocLinks() {
  return (
    <ul role="list" className="mt-1">
      {TOC.map(([id, label]) => (
        <li key={id}>
          <a
            href={`#${id}`}
            className="link-quiet flex min-h-tap items-center text-base text-brand-700"
          >
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function HistoryPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "История на град Бобов дол",
    about: "Бобов дол",
    inLanguage: "bg",
    publisher: { "@type": "Organization", name: SITE.name },
    mainEntityOfPage: `${SITE.url}/istoriya`,
  };

  return (
    <>
      {/* BreadcrumbList идва от PageHero (crumbs) — тук само статията. */}
      <JsonLd data={articleLd} />
      <PageHero
        eyebrow={SECTION.city}
        title="История на Бобов дол"
        intro="От долината с форма на бобено зърно до миньорската столица на Кюстендилско — историята на града по етапи, личности и институции."
        crumbs={[{ name: "История на града", path: "/istoriya" }]}
      />

      <div className="container-content grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr),17rem]">
        <article className="min-w-0 max-w-3xl">
          {/* На телефон съдържанието е над статията (а не след нея), сгънато. */}
          <details className="panel no-print mb-8 lg:hidden">
            <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 font-sans text-lg font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
              Съдържание
              <ChevronDown className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
            </summary>
            <nav aria-label="Съдържание на статията" className="mt-2">
              <TocLinks />
            </nav>
          </details>

          <Section id="ime" title="Произходът на името">
            <p>
              Името на града идва от долината с форма на бобено зърно, в която се разполага
              първоначалното село — днешният квартал „Христо Ботев“. С времето малкото селище в
              полите на планината израства в град и дава името си на цялата община.
            </p>
          </Section>

          <Section id="drevnost" title="Древност и Средновековие">
            <p>
              Районът около Бобов дол е обитаван още в дълбока древност от траките. Селището се
              споменава в писмени извори от XVI век, в османски данъчни документи. Векове наред това
              е било малко земеделско и пастирско селище, чийто живот се преплита с този на
              съседните села в Кюстендилския край.
            </p>
          </Section>

          <Section id="vazrazhdane" title="Възраждане и Освобождение">
            <p>
              През епохата на Възраждането общността укрепва духовно и просветно. През{" "}
              <strong>1822&nbsp;г.</strong> е издигната църквата <strong>„Свети Никола“</strong> —
              белег за вярата и съхранената българщина. През <strong>1881&nbsp;г.</strong>, малко
              след Освобождението (1878&nbsp;г.), отваря врати и <strong>първото училище</strong>,
              което поставя началото на образователната традиция в селището.
            </p>
            <p>
              Още през 30-те години на XIX век френският геолог <strong>Ами Буе</strong> проучва
              находищата на каменни въглища в района — предвестник на онова, което ще преобрази
              съдбата на града.
            </p>
          </Section>

          <Section id="vagledobiv" title="Раждането на въгледобива">
            <p>
              Промишленият добив на въглища започва през <strong>1891&nbsp;г.</strong> Въглищата
              постепенно превръщат тихото селище в работническо средище. През{" "}
              <strong>1907&nbsp;г.</strong> е учредено търговско дружество за добив на въглища (със
              съдействието на княз Фердинанд). През <strong>1917&nbsp;г.</strong> е построена
              теснолинейна железопътна линия до Дупница, която свързва мините с останалата част на
              страната и улеснява износа на ценното гориво.
            </p>
          </Section>

          <Section id="kvartali" title="Квартали и население">
            <p>
              Градът има два основни квартала. <strong>„Христо Ботев“</strong> (в западната част) е
              наследник на първоначалното село — с предимно къщи. <strong>„Миньор“</strong> (в
              източната част, в местността Банковица) е изграден през средата на XX век и е предимно
              с жилищни блокове.
            </p>
            <p>
              Населението е растяло бързо в епохата на въгледобива и е намалявало след закриването
              на мините:
            </p>
            <ul>
              <li>1880&nbsp;г. — 583&nbsp;души</li>
              <li>1946&nbsp;г. — 2&nbsp;520&nbsp;души</li>
              <li>1978&nbsp;г. — 8&nbsp;306&nbsp;души (най-много)</li>
              <li>2011&nbsp;г. — 5&nbsp;737&nbsp;души</li>
              <li>
                {POPULATION.asOf} — {POPULATION.value}&nbsp;души
              </li>
            </ul>
          </Section>

          <Section id="razcvet" title="Индустриалният разцвет">
            <p>
              Истинският възход настъпва след <strong>1944&nbsp;г.</strong>, когато Бобов дол се
              превръща в голям въгледобивен и индустриален център. Изгражда се комбинатът „Бобов
              дол“ с множество рудници, а край града е построен и енергийният център{" "}
              <strong>ТЕЦ „Бобов дол“</strong> (1973–1975&nbsp;г.).
            </p>
            <p>
              През <strong>1980-те години</strong> градът преживява своя връх: над{" "}
              <strong>7300 миньори</strong> добиват годишно над <strong>2&nbsp;милиона тона</strong>{" "}
              въглища. В тези десетилетия в Бобов дол идват работници от цялата страна и дори от
              чужбина, а населението достига най-високите си стойности. Това е епохата, която
              извайва облика на града — „миньорската столица“ на Кюстендилско.
            </p>
          </Section>

          <Section id="prehod" title="Преход и днес">
            <p>
              С промените след 1989&nbsp;г. и постепенното изчерпване и закриване на рудниците
              градът навлиза в труден период. Намалява населението, много млади хора заминават към
              по-големите градове. Днес Бобов дол е част от регионите във{" "}
              <strong>въглищен преход</strong>: предстои закриването на ТЕЦ-а, а общността търси
              ново икономическо бъдеще чрез диверсификация, нови умения и местни инициативи.
            </p>
            <p>
              Този сайт е една такава гражданска инициатива — да помогне на хората да се справят с
              дигиталния свят и да съхрани паметта и полезната информация за града на едно място.
            </p>
          </Section>

          <Section id="tsarkvi" title="Църкви и духовност">
            <p>
              Сърцето на духовния живот в града е възрожденската църква{" "}
              <strong>„Свети Никола“</strong> (1822&nbsp;г.), в квартал „Христо Ботев“. В града има
              и <strong>евангелска съборна църква</strong>, и <strong>адвентистка църква</strong>.
              За забележителностите и манастирите в по-широкия край вижте страницата{" "}
              <Link href="/grada">„Опознайте Бобов дол“</Link>.
            </p>
          </Section>

          <Section id="uchilishta" title="Училища и образование">
            <p>
              Образованието в Бобов дол има корени от <strong>1881&nbsp;г.</strong>, когато отваря
              първото училище. Днес в града работят <strong>СУ „Христо Ботев“</strong> (1.–12.
              клас), <strong>ОУ „Никола Йонков Вапцаров“</strong> и детската градина{" "}
              <strong>„Дружба“</strong>.
            </p>
            <p>
              Контактите на училищата и читалищата ще намерите в раздела{" "}
              <Link href="/uslugi">Услуги и телефони</Link>.
            </p>
          </Section>

          <Section id="lichnosti" title="Известни личности">
            <p>Бобов дол е родният град на видни българи:</p>
            <ul>
              <li>
                <strong>Георги Василев</strong> (р. 1946) — футболист и треньор.
              </li>
              <li>
                <strong>Пламен Орешарски</strong> (р. 1960) — икономист и политик, бивш
                министър-председател на България.
              </li>
              <li>
                <strong>Борис Дали</strong> (Борислав Делибалтов, р. 1982) — популярен български
                поп-фолк изпълнител.
              </li>
              <li>
                <strong>Петър Велчев</strong> — биатлонист.
              </li>
            </ul>
            <p>
              Истинските герои на града обаче са поколенията <strong>миньори</strong>, чийто тежък и
              достоен труд десетилетия наред изгражда икономическата мощ на региона.
            </p>
          </Section>

          <Section id="kmetove" title="Кметове и управление">
            <p>
              След местните избори през <strong>октомври 2023&nbsp;г.</strong> кмет на община Бобов
              дол е <strong>адв. Елза Величкова</strong>. Общината обхваща град Бобов дол и редица
              съседни села.
            </p>
            <p>
              Подробен списък на кметовете през годините не е общодостъпен онлайн. Ако разполагате с
              такива сведения, ще се радваме да допълним историята — пишете ни на страницата{" "}
              <Link href="/kontakti">Контакти</Link>.
            </p>
          </Section>

          <Section id="kultura" title="Култура, музей и спорт">
            <p>
              Миньорската памет на града се пази в <strong>Градския исторически музей</strong>,
              който разказва за тежкия, но горд труд на миньорите. Спортният живот е свързан с
              футболния клуб <strong>„Миньор“</strong> — име, носещо духа на работническия град.
            </p>
          </Section>

          <section id="hronologiya" aria-labelledby="hronologiya-zaglavie" className="mt-10">
            <h2 id="hronologiya-zaglavie" className="text-2xl font-bold text-slate-900">
              Хронология
            </h2>
            <ol role="list" className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {TIMELINE.map((t) => (
                <li key={t.year} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
                  <span className="shrink-0 font-bold tabular-nums text-brand-800 sm:w-28">
                    {t.year}
                  </span>
                  <span className="text-base text-slate-700">{t.text}</span>
                </li>
              ))}
            </ol>
          </section>

          <p className="mt-10 rounded-2xl bg-slate-100 p-4 text-base text-slate-700">
            Тази история е съставена по публични източници (Уикипедия, официални сайтове на
            институции и местни издания) и е написана като кратък преглед. Възможни са неточности —
            ако забележите грешка или искате да добавите факт, спомен или снимка,{" "}
            <Link href="/kontakti" className="link">
              свържете се с нас
            </Link>
            .
          </p>

          <ArticleActions
            shareTitle="История на Бобов дол — За Бобов дол"
            shareText="Историята на Бобов дол — от долината с форма на боб до миньорската столица."
            sharePath="/istoriya"
          />
          <PrintSourceLine path="/istoriya" />
          <OpenDetailsOnPrint />
        </article>

        {/* Лепкаво е само съдържанието (вече не цялата колона с хронологията —
            тя не се побираше на екран 800px). */}
        <aside className="hidden lg:block">
          <nav
            aria-label="Съдържание"
            className="panel sticky top-[calc(var(--header-offset)+1rem)] max-h-[calc(100vh-var(--header-offset)-2rem)] overflow-y-auto"
          >
            <p className="label-caps">Съдържание</p>
            <TocLinks />
          </nav>
        </aside>
      </div>
    </>
  );
}
