// Карта „ръководство (slug) → примерни екрани". Картинките са СТИЛИЗИРАНИ
// пресъздавания на интерфейса на приложенията (Viber, Messenger, WhatsApp,
// Facebook) — близки до реалния вид, за да разпознаят възрастните хора какво да
// търсят. Файловете са в public/kak-da/ и се генерират от
// scripts/howto-mockups/gen.js. Това е чисто добавъчен слой — не пипа базата.

export type Illustration = { src: string; alt: string };

const MAP: Record<string, Illustration[]> = {
  // ── Viber ──
  "app-viber-tekst": [
    { src: "/kak-da/viber-pisane.png", alt: "Екран на Viber: чат с подчертан бутон за изпращане (стрелка)" },
  ],
  "app-viber-glasovo": [
    { src: "/kak-da/viber-glasovo.png", alt: "Екран на Viber с подчертан бутон микрофон за гласово съобщение" },
  ],
  "app-viber-grupa": [
    { src: "/kak-da/viber-grupa.png", alt: "Екран на Viber „Нова група“ с избор на участници" },
  ],
  "app-viber-lokaciya": [
    { src: "/kak-da/viber-prikachi.png", alt: "Меню за прикачване във Viber с подчертани „Локация“ и „Контакт“" },
  ],
  "app-viber-kontakt": [
    { src: "/kak-da/viber-prikachi.png", alt: "Меню за прикачване във Viber с подчертан бутон „Контакт“" },
  ],
  "app-viber-blokiram": [
    { src: "/kak-da/viber-blok.png", alt: "Екран с информация за контакт във Viber и подчертан бутон „Блокирай“" },
  ],
  "app-viber-iztriya-sub": [
    { src: "/kak-da/viber-iztrij.png", alt: "Меню при задържане на съобщение с подчертано „Изтрий“" },
  ],
  "app-viber-procheteno": [
    { src: "/kak-da/viber-procheteno.png", alt: "Обяснение на отметките във Viber: изпратено, доставено, прочетено" },
  ],
  "app-emoji-stikeri": [
    { src: "/kak-da/viber-emoji.png", alt: "Панел с емоджи и стикери в чат приложение" },
  ],
  "app-zaglushi-chat": [
    { src: "/kak-da/viber-zaglushi.png", alt: "Прозорец за заглушаване на известията от група" },
  ],
  // ── Messenger ──
  "app-messenger-glasovo": [
    { src: "/kak-da/messenger.png", alt: "Екран на Messenger с подчертан бутон микрофон" },
  ],
  // ── WhatsApp ──
  "app-whatsapp": [
    { src: "/kak-da/whatsapp.png", alt: "Чат екран на WhatsApp (зелено приложение)" },
    { src: "/kak-da/whatsapp-registraciya.png", alt: "Регистрация в WhatsApp с въвеждане на телефонен номер" },
  ],
  // ── Снимки от чат ──
  "ph-zapazya-ot-chat": [
    { src: "/kak-da/chat-zapazi.png", alt: "Снимка в чат с подчертан бутон за запазване в галерията" },
  ],
  // ── Facebook ──
  "fb-kakvo-e": [
    { src: "/kak-da/fb-feed.png", alt: "Начален екран (емисия) на Facebook" },
  ],
  "fb-publikuvai": [
    { src: "/kak-da/fb-publikuvai.png", alt: "Създаване на публикация във Facebook с подчертан бутон „Публикувай“" },
  ],
  "fb-haresai-komentar": [
    { src: "/kak-da/fb-haresai.png", alt: "Публикация във Facebook с подчертан бутон „Харесвам“" },
  ],
  "fb-nameri-priyatel": [
    { src: "/kak-da/fb-priatel.png", alt: "Търсене на човек във Facebook с бутон „Добави приятел“" },
  ],
  "fb-poveritelnost": [
    { src: "/kak-da/fb-poveritelnost.png", alt: "Настройка кой вижда публикациите във Facebook" },
  ],
  "safe-falshiv-profil-fb": [
    { src: "/kak-da/fb-falshiv.png", alt: "Признаци за фалшив профил във Facebook" },
  ],
  "akaunt-zabravena-parola-fb": [
    { src: "/kak-da/fb-parola.png", alt: "Екран за възстановяване на забравена парола за Facebook" },
  ],
};

export function getIllustrations(slug: string): Illustration[] {
  return MAP[slug] ?? [];
}
