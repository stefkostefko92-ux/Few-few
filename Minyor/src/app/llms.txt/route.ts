import { SITE } from "@/lib/site";

export const dynamic = "force-static";

// Кратка карта на сайта за AI асистенти (llms.txt).
export function GET() {
  const body = `# ${SITE.name}

> ${SITE.description}

Футболен клуб от Бобов дол, България. Прякор: „${SITE.nickname}“. Цветове: ${SITE.colors}. Основан ${SITE.founded} г.
Домакински стадион: ${SITE.stadium.name}.

## Основни страници
- [Начало](${SITE.url}/)
- [Новини](${SITE.url}/novini)
- [Програма и резултати](${SITE.url}/programa)
- [Класиране](${SITE.url}/klasirane)
- [Отбор](${SITE.url}/otbor)
- [История и постижения](${SITE.url}/istoriya)
- [Стадион](${SITE.url}/stadion)
- [Галерия](${SITE.url}/galeriya)
- [За клуба](${SITE.url}/za-kluba)
- [Контакти](${SITE.url}/kontakti)

## Контакти
Имейл: ${SITE.contact.email}
Телефон: ${SITE.contact.phone}
Адрес: ${SITE.contact.address}

Sitemap: ${SITE.url}/sitemap.xml
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
