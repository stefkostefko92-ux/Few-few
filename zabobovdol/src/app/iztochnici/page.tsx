import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui";
import { LegalLayout, LegalMeta, type Toc } from "@/components/LegalDoc";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { SECTION } from "@/lib/section-names";
import { SITE } from "@/lib/site";

// „Източници на изображенията“ — правният преглед от 27.11.2026: посочване на
// OpenStreetMap (ODbL), ЕЦБ, NASA, лицензите на снимките и шрифтовете и бележка
// за търговските марки на приложенията в илюстрациите „Как да…“.
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Източници на изображенията",
  description:
    "Откъде са снимките, картите, образците на еврото и шрифтовете в илюстрациите на За Бобов дол и при какви условия ги ползваме — OpenStreetMap, Европейската централна банка, Wikimedia Commons, NASA.",
  path: "/iztochnici",
  keywords: [
    "източници на изображенията",
    "OpenStreetMap",
    "образци на евро",
    "лицензи",
    "За Бобов дол",
    "Carbon Stealth",
  ],
});

const LAST_CHANGE_ISO = "2026-11-27";

const TOC = {
  karti: "Карти",
  evro: "Евро банкноти и монети",
  snimki: "Снимки",
  nasa: "Снимката на Земята",
  marki: "Знаците на приложенията",
  shriftove: "Шрифтове",
  znak: "Нашият знак",
} as const satisfies Toc;

const ext = "font-medium text-brand-700 underline underline-offset-2";

export default function SourcesPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageLd({
            name: "Източници на изображенията",
            description: "Откъде са картите, образците на еврото, снимките и шрифтовете в илюстрациите на сайта.",
            path: "/iztochnici",
            lastReviewed: LAST_CHANGE_ISO,
          }),
        ]}
      />
      <PageHero
        eyebrow={SECTION.legal}
        title="Източници на изображенията"
        intro="Илюстрациите в „Как да…“ рисуваме сами. Където има чужда снимка, карта или образец — ето откъде са и при какви условия ги ползваме."
        crumbs={[{ name: "Източници", path: "/iztochnici" }]}
        meta={<LegalMeta updated={LAST_CHANGE_ISO} current="/iztochnici" />}
      />
      <LegalLayout toc={TOC} path="/iztochnici">
        <div className="prose-content text-slate-700">
          <h2 id="karti">{TOC.karti}</h2>
          <p>
            Картите в илюстрациите са от <strong>OpenStreetMap</strong>: © сътрудниците на
            OpenStreetMap (© OpenStreetMap contributors). Данните са достъпни под Open Database
            License (ODbL) —{" "}
            <a href="https://www.openstreetmap.org/copyright" className={ext} rel="noopener" target="_blank">
              openstreetmap.org/copyright
            </a>
            . Върху всяка картинка с карта има надпис за източника.
          </p>

          <h2 id="evro">{TOC.evro}</h2>
          <p>
            Банкнотите и монетите са <strong>официалните образци и снимки на Европейската централна
            банка</strong> (ecb.europa.eu): банкнотите © ЕЦБ, общата страна на монетите © Европейски
            съюз, българската национална страна © Българска народна банка. Банкнотите се показват
            по правилата на ЕЦБ за възпроизвеждане (Решение ЕЦБ/2013/10): с надпис SPECIMEN, в малка
            разделителна способност и без промени по тях.
          </p>

          <h2 id="snimki">{TOC.snimki}</h2>
          <p>
            Снимките на предмети (апаратът за кръвно, термометърът, ключовете и др.) са от{" "}
            <strong>Wikimedia Commons</strong> и са обществено достояние или под CC0 — без нужда от
            разрешение. На тях няма лица; марките върху предметите са размити. Списъкът с файловете,
            авторите и обработката се пази при нас и може да го поискате на{" "}
            <a href={`mailto:${SITE.contact.email}`} className={ext}>
              {SITE.contact.email}
            </a>
            .
          </p>

          <h2 id="nasa">{TOC.nasa}</h2>
          <p>
            Тапетът със Земята в илюстрациите за телефона („Сложете сайта на телефона“) е снимка на{" "}
            <strong>NASA</strong> („Blue Marble“). NASA не е свързана със сайта и не го одобрява.
          </p>

          <h2 id="marki">{TOC.marki}</h2>
          <p>
            В илюстрациите има знаци на приложения, за да е ясно за кое приложение става дума. Те са
            търговски марки на собствениците си: Google, Gmail, Chrome, Google Карти и YouTube — на
            Google LLC; WhatsApp, Facebook и Messenger — на Meta Platforms, Inc.; Viber — на Rakuten
            Viber; Spotify — на Spotify AB. <strong>Сайтът не е свързан с тези компании и не е одобрен от
            тях.</strong> Екраните на приложенията са опростени рисунки, направени от нас за
            обучение, а не официални снимки на екрана.
          </p>

          <h2 id="shriftove">{TOC.shriftove}</h2>
          <p>
            В картинките са ползвани шрифтовете Roboto, Inter и Bitter (SIL Open Font License 1.1) и
            иконите Material Symbols на Google (Apache License 2.0).
          </p>

          <h2 id="znak">{TOC.znak}</h2>
          <p>
            Знакът „БД“ и логото „За Бобов дол“ са наши. Сайтът <strong>не</strong> ползва герба на
            Община Бобов дол — той е символ на общината, а ние сме{" "}
            <Link href="/za-nas" className={ext}>
              независим граждански портал
            </Link>
            .
          </p>
        </div>
      </LegalLayout>
    </>
  );
}
