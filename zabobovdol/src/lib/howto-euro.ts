// Ръководствата от темата „Еврото“ (35-те въпроса от prisma/seed-euro.ts) са
// писани преди 1 януари 2026 г. Текстовете им са в базата — истинската
// поправка е редакция на seed-а и UPDATE в продукцията (решение на
// собственика). Дотогава тук е „какво важи днес“ за отговорите с изтекли
// срокове: на /evroto те не се отварят сами и под тях, както и в
// /kak-da/[slug], стои бележка. Фактите са само тези, които /evroto вече
// показва и цитира (БНБ, evroto.bg, КЗП) — нищо ново.
import { categorySlug } from "@/lib/howto";

/** Темата в базата (Faq.category). */
export const EURO_TOPIC = "Еврото";

const EXCHANGE =
  "Безплатната обмяна в банки и пощи приключи на 30 юни 2026 г. До 31 декември 2026 г. банките също обменят левове, но може да искат такса. В БНБ левовете се обменят безплатно и без срок.";
const CASH =
  "От 1 февруари 2026 г. с левове в брой не се плаща. Останалите левове може да обмените — в БНБ безплатно и без срок.";
const DUAL =
  "Двойните цени (в лева и в евро) бяха задължителни до 8 август 2026 г.";

/**
 * Отговор от темата „Еврото“ с изтекъл срок → какво важи днес. Отговорите,
 * които не са тук, са верни и днес (курсът, сметките, монетите, измамите…).
 */
export const EURO_TODAY: Readonly<Record<string, string>> = {
  "e-obmiana-bezplatno": EXCHANGE,
  "e-da-barzam-li": EXCHANGE,
  "e-kolko-struva": EXCHANGE,
  "e-leva-do-koga": CASH,
  "e-resto": CASH,
  "e-dvoyni-ceni-ot-koga": DUAL,
  "e-zashto-dve-ceni": DUAL,
};

/** Ръководството е от темата „Еврото“ (приема име или адрес на темата). */
export function isEuroTopic(category: string): boolean {
  return categorySlug(category) === categorySlug(EURO_TOPIC);
}

/** „Какво важи днес“ за отговор с изтекъл срок, иначе null. */
export function euroTodayNote(slug: string): string | null {
  return EURO_TODAY[slug] ?? null;
}
