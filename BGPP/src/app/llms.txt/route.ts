import { SITE } from "@/lib/site";
import { ENTERPRISES } from "@/data/enterprises";

export const dynamic = "force-static";

export function GET() {
  const body = `# ${SITE.name}

> ${SITE.description}

Независим граждански портал за прозрачност на държавните предприятия в България:
кои са, кой ги контролира, как влизат и излизат парите им, кой печели поръчките,
къде има конфликт на интереси и документирани случаи.

## Основни страници
- [Каталог на предприятията](${SITE.url}/predpriyatiya): ${ENTERPRISES.length} профила с филтри
- [Картината на сектора](${SITE.url}/kartina): агрегати от АППК
- [Концентрация на поръчките](${SITE.url}/koncentraciya): кой печели държавните поръчки
- [Известни случаи](${SITE.url}/sluchai): документирани нередности с правен статус
- [Конфликт на интереси](${SITE.url}/konflikti) и [Проверка на свързаност](${SITE.url}/svarzanost)
- [Индекс на прозрачност](${SITE.url}/prozrachnost-indeks)

## Отворени данни
- [JSON](${SITE.url}/data.json): пълен набор
- [CSV](${SITE.url}/data.csv): предприятията в таблица

## Източници
Данните стъпват на официални регистри: АППК, Търговски регистър, Министерство на
финансите, СИГМА, Сметна палата, ЕППО/OLAF. Проектът е образователен и не е
официален сайт на държавен орган. Разследване не е присъда.
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
