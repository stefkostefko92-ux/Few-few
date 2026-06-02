import type { Metadata } from "next";
import { SITE } from "../../lib/site";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbLd } from "../../lib/jsonld";
import "../legal.css";

export const metadata: Metadata = {
  title: "Отговорна игра",
  description: "АСО е социална игра. Съвети за здравословна и балансирана игра.",
  alternates: { canonical: "/responsible/" },
};

export default function Responsible() {
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: "Начало", url: `${SITE.url}/` },
          { name: "Отговорна игра", url: `${SITE.url}/responsible/` },
        ])}
      />
      <article className="legal container">
        <h1>Отговорна игра</h1>

        <p>
          АСО е <strong>социална игра</strong> с виртуални чипове, които нямат парична стойност и не
          подлежат на осребряване. Дори без реални пари искаме играта да остава забавление, а не
          задължение.
        </p>

        <h2>Нашите принципи</h2>
        <ul>
          <li>Само за лица над 18 години.</li>
          <li>Виртуалните чипове не са пари и не се теглят.</li>
          <li>Без „плати, за да печелиш“ — покупките дават само облик и комфорт.</li>
          <li>Безплатни чипове всеки ден — не е нужно да купуваш, за да играеш.</li>
        </ul>

        <h2>Съвети за баланс</h2>
        <ul>
          <li>Задавай си времеви граници и прави почивки.</li>
          <li>Играй за удоволствие, не за да „наваксаш“ загуби.</li>
          <li>Не позволявай играта да измества сън, работа или близки.</li>
        </ul>

        <h2>Нужна ли е помощ?</h2>
        <p>
          Ако усещаш, че играта (или хазартът като цяло) ти влияе негативно, потърси подкрепа от
          специалист или организация за помощ при хазартна зависимост във твоята държава. В чужбина
          можеш да започнеш от{" "}
          <a href="https://www.begambleaware.org/" target="_blank" rel="noopener noreferrer">
            BeGambleAware
          </a>
          .
        </p>

        <p className="legal-foot">
          Можеш да изтриеш акаунта си по всяко време от Профил → Поверителност. Вижте и{" "}
          <a href="/terms/">Общите условия</a>.
        </p>
      </article>
    </>
  );
}
