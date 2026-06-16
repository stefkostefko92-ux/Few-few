import { SITE } from "@/lib/site";

export const dynamic = "force-static";

// Карта на сайта за AI асистенти (ChatGPT, Perplexity, Claude и др.).
// Кратко, четимо резюме на най-полезните страници и факти.
export function GET() {
  const u = SITE.url;
  const body = `# ${SITE.name} (${SITE.geo.city}, ${SITE.geo.country})

> ${SITE.description}

Независим граждански портал за град Бобов дол. Тук жителите намират местни
услуги и телефони, обяснения стъпка по стъпка за е-услуги, защита от измами,
информация за пенсии и социални помощи, дежурна аптека, събития и обяви.

## Основни страници
- Услуги и важни телефони: ${u}/uslugi
- Как да… (е-услуги стъпка по стъпка): ${u}/kak-da
- Пази се от измами: ${u}/izmami
- Пенсии и социални помощи: ${u}/pomoshti
- Дежурна аптека и лекар: ${u}/dezhurna-apteka
- Местен бизнес: ${u}/biznes
- Събития: ${u}/sabitiya
- Новини: ${u}/novini
- Транспорт и споделено пътуване: ${u}/transport
- Сигнали до общината: ${u}/signali
- История на града: ${u}/istoriya
- За проекта и контакти: ${u}/za-nas · ${u}/kontakti

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
