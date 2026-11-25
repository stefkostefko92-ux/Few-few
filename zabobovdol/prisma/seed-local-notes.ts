import { prisma } from "./_seedlib";

// Местни блокове „В Бобов дол:“ (Faq.localNote) за ръководства с местно действие.
// САМО проверени данни, с източник в самия текст. Проверени на 2026-10-23:
//  - НОИ, ТП Кюстендил + Офис Дупница: https://nssi.bg/kontakti/teritorialni-podeleniq-na-noi/kyustendil/
//  - АСП, ДСП — Бобов дол: https://asp.government.bg/bg/kontakti/teritorialni-strukturi/
// Не са проверени (затова няма бележки за тях): поща, МВР/лични карти, общината,
// данъци, ТЕЛК-комисия, личен лекар. Обновява САМО localNote по slug; не пипа
// reviewedAt и останалите полета. Идемпотентно (updateMany по slug; липсващ slug = 0).

const NOI = `В Бобов дол няма офис на НОИ. Най-близо са:
• Офис Дупница — ул. „Св. Иван Рилски“ № 1, тел. 0882 91 23 30 (отдел „Пенсии“), приемно време 8:00–16:30 ч.
• ТП на НОИ Кюстендил — ул. „България“ № 46, тел. 0700 14 802 (национален), приемно време 08:00–16:30 ч.
Преди да тръгнете, се обадете. Източник: nssi.bg (Контакти → Териториални поделения → Кюстендил), проверено на 23.10.2026.`;

const DSP = `ДСП — Бобов дол: ул. „27-ми октомври“ № 2, тел. 0702 6 34 69. Работното време не е посочено в официалния източник — обадете се преди да отидете. Източник: asp.government.bg (Контакти → Териториални структури), проверено на 23.10.2026.`;

const NOTES: Record<string, string> = {
  "docs-noi-pensiya": NOI,
  "m-noi-pensiya2": NOI,
  "docs-pik-noi": NOI,
  "m-pik-noi2": NOI,
  "e-pensiya": NOI,
  "pn-dobavka-pensiya": NOI,
  "pn-kade-da-pitam": `${NOI}\n\nЗа социални помощи: ${DSP}`,
  "pn-kak-poluchavam-pensiya": NOI,
  "pn-proveri-pensiya": NOI,
  "pn-telk": `За социална подкрепа след решение на ТЕЛК: ${DSP}`,
  "d-celeva-pomosht-otoplenie": DSP,
  "pn-pomosht-otoplenie": DSP,
  "d-lichen-asistent": DSP,
  "g-lichen-asistent-blizak": DSP,
  "d-pomoshti-vazrastni": DSP,
  "pn-dokumenti-socialna-pomosht": DSP,
};

async function main() {
  let touched = 0;
  for (const [slug, localNote] of Object.entries(NOTES)) {
    const r = await prisma.faq.updateMany({ where: { slug }, data: { localNote } });
    touched += r.count;
    if (r.count === 0) console.warn(`! няма ръководство със slug ${slug}`);
  }
  console.log(`✔ Местни бележки: ${touched}/${Object.keys(NOTES).length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
