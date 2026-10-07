// Human (Bulgarian) names and hints for every editable field, so the admin
// never has to read a raw key like `nav.about` or `phoneHref`.

export const LABELS: Record<string, string> = {
  // settings / contacts
  brandName: "Име", brandSub: "Подзаглавие", phone: "Телефон", phoneHref: "Телефон (за набиране)",
  email: "Имейл", address: "Адрес", facebookUrl: "Facebook — адрес на страницата",
  facebookPageHref: "Facebook — страница за вграждане", mapUrl: "Карта — връзка", logo: "Лого",
  // hero & sections
  badge: "Ред над заглавието", lead: "Въвеждащ текст", title: "Заглавие", body: "Текст",
  features: "Характеристики", items: "Елементи", quote: "Цитат",
  quoteCite: "Автор на цитата", icon: "Икона", text: "Текст", bullets: "Точки от списъка",
  label: "Етикет", scheduleTitle: "Заглавие на графика", schedule: "График",
  groupNote: "Бележка за групата", instructorName: "Име на преподавателя",
  instructorRole: "Длъжност на преподавателя", cta: "Текст на бутона", points: "Точки",
  topics: "Теми във формата", primary: "Основен бутон", secondary: "Втори бутон",
  day: "Ден", time: "Час", place: "Място", highlights: "Факти под интрото",
  // alphabet
  letters: "Букви", letter: "Буква", latin: "На латиница", word: "Дума на български", meaning: "Значение", audio: "Произношение (звук)",
  // pictures
  image: "Снимка", imageAlt: "Описание на снимката", photos: "Снимки", src: "Снимка",
  caption: "Надпис под снимката", alt: "Описание на снимката",
  // FAQ
  q: "Въпрос", a: "Отговор",
  // SEO
  description: "Описание", keywords: "Ключови думи", shareImage: "Снимка при споделяне",
  // organisation
  name: "Официално име", alternateName: "Друго име", streetAddress: "Улица",
  postalCode: "Пощенски код", locality: "Град", region: "Област", country: "Държава (код)",
  latitude: "Географска ширина", longitude: "Географска дължина", foundingDate: "Дата на основаване",
  // legal
  intro: "Въведение", updated: "Последна редакция", sections: "Раздели",
  h: "Заглавие на раздела", p: "Абзаци", list: "Точки",
};

export const HINTS: Record<string, string> = {
  imageAlt: "Кратко описание какво има на снимката. Чете се от екранните четци за незрящи и от търсачките.",
  alt: "Кратко описание какво има на снимката. Чете се от екранните четци за незрящи и от търсачките.",
  keywords: "Поне 5. „Carbon Stealth“ се добавя автоматично, ако липсва.",
  highlights: "Кратки факти в лентата точно под интрото. Ако махнете всички, лентата изчезва.",
  badge: "Един ред над голямото заглавие: името на училището и годината.",
  meaning: "На италианската и английската страница: преводът. На българската: думата на италиански.",
  latin: "Официалната транслитерация, напр. zh за Ж.",
  audio: "Ако е празно и думата е стандартната, звучи вграденият запис (женски глас). Тук можете да качите свой: MP3, M4A, OGG или WAV, до 3 MB, общ за трите езика.",
  shareImage: "Показва се при споделяне във Facebook, WhatsApp и др. Ако е празно — автоматичната карта с логото.",
  description: "Показва се под заглавието в Google. Около 150 знака.",
  phoneHref: "Само цифри с код на държавата, напр. 393208479971.",
  facebookUrl: "Пълен адрес, започващ с https://",
  facebookPageHref: "Пълен адрес, започващ с https://",
  mapUrl: "Пълен адрес, започващ с https://",
  latitude: "Например 45.4642 — от Google Maps: десен бутон върху мястото.",
  longitude: "Например 9.1900",
  foundingDate: "Във формат ГГГГ-ММ-ДД, напр. 2014-01-12.",
  country: "Двубуквен код, напр. IT.",
};

/** Interface wording, grouped the way the admin thinks about it. */
export const UI_GROUPS: { title: string; keys: Record<string, string> }[] = [
  {
    title: "Меню",
    keys: {
      "nav.about": "За нас", "nav.school": "Училището", "nav.courses": "Курсове", "nav.dance": "Танци",
      "nav.alphabet": "Азбуката", "nav.contact": "Контакти", "nav.enroll": "Бутон „Запиши се“",
      "lang.label": "Етикет за избор на език", skip: "„Към съдържанието“ (за клавиатура)",
    },
  },
  {
    title: "Бутони",
    keys: {
      "cta.discover": "Основен бутон в началото", "cta.know": "Втори бутон в началото",
      "fb.open": "„Отвори Facebook“", "fb.show": "„Покажи публикациите“",
    },
  },
  {
    title: "Форма за контакт",
    keys: {
      "form.name": "Поле „Име“", "form.email": "Поле „Имейл“", "form.topic": "Поле „Интерес“",
      "form.message": "Поле „Съобщение“", "form.send": "Бутон „Изпрати“",
      "form.required": "Грешка при непопълнени полета", "form.ok": "Съобщение след изпращане",
      "form.note": "Бележка под формата",
    },
  },
  {
    title: "Контакти и долна част",
    keys: {
      phone: "Етикет „Телефон“", addr: "Етикет „Адрес“", "footer.site": "Заглавие на менюто долу", "legal.heading": "„Правна информация“",
      "legal.privacy": "Връзка „Поверителност“", "legal.cookie": "Връзка „Бисквитки“",
      "legal.terms": "Връзка „Условия“", rights: "„Всички права запазени“",
      updated: "„Последна актуализация“", backHome: "Връзка „Към началото“",
    },
  },
  {
    title: "Бисквитки и Facebook",
    keys: {
      "cookie.text": "Текст на банера", "cookie.accept": "Бутон „Приемам“", "cookie.reject": "Бутон „Отказвам“",
      "cookie.more": "Връзка „Повече информация“", "cookie.manage": "Връзка „Настройки на бисквитките“",
      "fb.consent": "Текст преди зареждане на Facebook",
      "nav.facebook": "Заглавие на прозореца с Facebook",
    },
  },
  {
    title: "Азбуката",
    keys: {
      "alpha.pick": "„Изберете буква“ (за екранни четци)", "alpha.latin": "Етикет „На латиница“",
      "alpha.meaning": "Етикет „Значение“", "alpha.listen": "Бутон „Чуйте произношението“ (за екранни четци)",
    },
  },
  {
    title: "Галерия",
    keys: {
      "gallery.open": "„Отвори снимката“ (за екранни четци)", "gallery.close": "Бутон „Затвори“",
      "gallery.prev": "Бутон „Предишна“", "gallery.next": "Бутон „Следваща“",
    },
  },
];

export const ICON_LABELS: Record<string, string> = {
  presence: "Присъствено", distance: "Дистанционно", hybrid: "Хибридно", kids: "Деца", adults: "Възрастни",
  culture: "Култура", "shield-check": "Признание", "graduation-cap": "Диплома", person: "Човек",
  "location-pin": "Място", phone: "Телефон", envelope: "Имейл", "media-image": "Снимка", "facebook-circle": "Facebook",
};

const LONG = new Set([
  "lead", "body", "text", "quote", "instructorRole", "meaning", "groupNote", "a", "description",
  "intro", "imageAlt", "alt", "p", "list", "fb.consent", "cookie.text", "form.ok", "form.note",
]);
export const isLongField = (k: string, v: string) => LONG.has(k) || v.length > 70;

export const humanize = (k: string) =>
  LABELS[k] || k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
