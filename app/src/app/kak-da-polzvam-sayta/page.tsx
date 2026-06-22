import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";

export const metadata: Metadata = buildMetadata({
  title: "Как да ползвам сайта",
  description:
    "Кратко въведение как да намерите това, което търсите в „За Дупница“, и как да настроите по-едър текст и контраст.",
  path: "/kak-da-polzvam-sayta",
});

export default function HowToUsePage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Как да ползвам сайта", path: "/kak-da-polzvam-sayta" })} />
      <PageHero
        eyebrow="Помощ"
        title="Как да ползвам сайта"
        intro="Няколко прости съвета, за да намерите бързо това, което ви трябва."
        crumbs={[{ name: "Как да ползвам сайта", path: "/kak-da-polzvam-sayta" }]}
      />
      <div className="container-content py-10">
        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Намиране на информация</h2>
          <ul>
            <li>
              Горе има меню. На телефон натиснете бутона „Меню“, за да видите
              всички раздели.
            </li>
            <li>
              Бутонът „Всички раздели“ показва пълен списък с всичко в сайта.
            </li>
            <li>
              В раздел „Търсене“ можете да напишете дума (напр. „аптека“ или
              „вода“) и да стигнете направо до нужното.
            </li>
          </ul>

          <h2>По-едър текст и по-добра четимост</h2>
          <ul>
            <li>
              Червената лента горе („Достъпност“) увеличава текста — изберете
              „голям“ или „много голям“.
            </li>
            <li>
              Там можете да включите и висок контраст, тъмен режим или по-големи
              бутони.
            </li>
            <li>Настройките се запомнят за следващото ви посещение.</li>
          </ul>

          <h2>Обаждане с едно докосване</h2>
          <ul>
            <li>
              Телефонните номера са връзки — на телефон натиснете номера, за да се
              обадите направо.
            </li>
          </ul>

          <h2>Ако нещо не работи</h2>
          <p>
            Пишете ни през „Контакти“ — кажете какво не се получава и ще го
            поправим.
          </p>
        </div>
      </div>
    </>
  );
}
