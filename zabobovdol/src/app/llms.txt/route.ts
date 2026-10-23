import { SITE } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { getGuideIndex } from "@/lib/howto-index";
import { categoryPath, guidesLabel } from "@/lib/howto";

// Чете темите на „Как да…“ от базата, затова не се генерира при билд
// (CI билдва с фиктивна база). При грешка — същият текст без списъка с теми.
export const dynamic = "force-dynamic";

async function liveSections(u: string): Promise<{ topics: string; pomeni: string }> {
  try {
    const [index, obituaries] = await Promise.all([
      getGuideIndex(),
      prisma.obituary.count({ where: { published: true } }),
    ]);
    const topics = index.categories.length
      ? `\n## Ръководства „Как да…“ по теми (${guidesLabel(index.guides.length)})\n` +
        index.categories
          .map((c) => `- ${c.name} (${c.count}): ${u}${categoryPath(c.slug)}`)
          .join("\n") +
        "\n"
      : "";
    const pomeni = obituaries > 0 ? `- Некролози и помени: ${u}/pomeni\n` : "";
    return { topics, pomeni };
  } catch {
    return { topics: "", pomeni: "" };
  }
}

// Карта на сайта за AI асистенти (ChatGPT, Perplexity, Claude и др.).
// Кратко, четимо резюме на най-полезните страници и факти.
export async function GET() {
  const u = SITE.url;
  const { topics, pomeni } = await liveSections(u);
  const body = `# ${SITE.name} (${SITE.geo.city}, ${SITE.geo.country})

> ${SITE.description}

Независим граждански портал за град Бобов дол. Тук жителите намират местни
услуги и телефони, обяснения стъпка по стъпка за е-услуги, защита от измами,
информация за пенсии и социални помощи, дежурна аптека, събития и обяви.
Порталът не е официалният сайт на Община Бобов дол.

## Основни страници
- Услуги и важни телефони: ${u}/uslugi
- Как да… (е-услуги стъпка по стъпка, подредени по теми): ${u}/kak-da
- Пази се от измами: ${u}/izmami
- Пенсии и социални помощи: ${u}/pomoshti
- Дежурна аптека и лекар: ${u}/dezhurna-apteka
- Еврото (въпроси и отговори): ${u}/evroto
- Местен бизнес: ${u}/biznes
- Събития: ${u}/sabitiya
- Новини: ${u}/novini
- Транспорт и споделено пътуване: ${u}/transport
- Прекъсвания на ток и вода: ${u}/prekysvaniya
- Безплатни обяви: ${u}/obyavi
- Сигнали до общината: ${u}/signali
- Нерегламентирани сметища (сигнали): ${u}/smetishta
- Прозрачност (обществени поръчки на общината, данни от СИГМА): ${u}/prozrachnost
- Взаимопомощ — Зов за помощ: ${u}/zov-za-pomosht
- Доброволци: ${u}/dobrovolci
- Спомени от Бобов дол: ${u}/spomeni
- Галерия със снимки: ${u}/galeriya
${pomeni}- Опознай Бобов дол (енциклопедия): ${u}/grada
- История на града: ${u}/istoriya
- Достъпност (за хора с увреден слух/зрение/моторика): ${u}/dostapnost
- За проекта и контакти: ${u}/za-nas · ${u}/kontakti
- Условия и поверителност: ${u}/pravila · ${u}/poveritelnost · ${u}/biskvitki
${topics}
## На телефона и известия
- Как да сложите сайта на телефона като приложение (Android и iPhone): ${u}/instaliraj
- За близките — как да настроите сайта на телефона на родител: ${u}/za-blizkite
- Известия по избор (спиране на ток и вода, измами, новини, дежурна аптека): ${u}/izvestiya

## За печат
- Седмицата в Бобов дол (лист А4 с едър шрифт): ${u}/pechat/sedmitsa
- Важни телефони за печат: ${u}/pechat

## Достъпност и връзка без обаждане
- Сайтът има уголемяване на текста, висок контраст, четене на глас и режим „по-лесно докосване“.
- Хора с увреден слух могат да се свържат с институции без обаждане (имейл, онлайн заявки, на място).
- Достъп до спешен телефон 112 за хора с увреден слух и говор: мобилно/уеб приложение с регистрация на 112.mvr.bg.

## Важни телефони
- Единен европейски спешен номер: 112
- НОИ (пенсии и осигуряване): 0700 14 802

## Контакт с портала
- Имейл: ${SITE.contact.email}
- Телефон: ${SITE.contact.phone}

Sitemap: ${u}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
