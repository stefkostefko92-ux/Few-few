// Lightweight, dependency-free i18n. Three locales; UI chrome comes from the
// dictionaries below, while page content comes from the database (per locale).

export const LOCALES = ["it", "bg", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Record<Locale, { label: string; flag: string; htmlLang: string }> = {
  it: { label: "Italiano", flag: "🇮🇹", htmlLang: "it" },
  bg: { label: "Български", flag: "🇧🇬", htmlLang: "bg" },
  en: { label: "English", flag: "🇬🇧", htmlLang: "en" },
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

// Map an ISO country code to the locale we serve to that audience.
export function localeForCountry(country: string | undefined | null): Locale {
  const c = (country || "").toUpperCase();
  if (c === "IT") return "it";
  if (c === "BG") return "bg";
  return "en";
}

// UI strings (navigation, buttons, labels). Content lives in the DB.
type Dict = Record<string, string>;
export const UI: Record<Locale, Dict> = {
  it: {
    "nav.about": "Chi siamo",
    "nav.school": "La scuola",
    "nav.courses": "Corsi",
    "nav.dance": "Danza",
    "nav.facebook": "Facebook",
    "nav.contact": "Contatti",
    "nav.enroll": "Iscriviti",
    "skip": "Vai al contenuto",
    "cta.discover": "Scopri i corsi",
    "cta.know": "Conosci la scuola",
    "form.name": "Nome e cognome",
    "form.email": "Email",
    "form.topic": "Interesse",
    "form.message": "Messaggio",
    "form.send": "Invia richiesta",
    "form.required": "Compila tutti i campi obbligatori.",
    "form.ok": "Grazie! Ti ricontatteremo al più presto.",
    "form.note": "I dati sono usati solo per risponderti.",
    "fb.show": "Mostra i post",
    "fb.consent": "Per mostrarti i contenuti carichiamo il feed da Facebook, che potrebbe impostare cookie sul tuo dispositivo.",
    "fb.open": "Apri la pagina Facebook",
    "lang.label": "Lingua",
    "phone": "Telefono",
    "addr": "Sede",
    "credit": "Creato, disegnato e donato da",
    "legal.heading": "Note legali",
    "legal.privacy": "Privacy",
    "legal.cookie": "Cookie",
    "legal.terms": "Termini",
    "rights": "Tutti i diritti riservati.",
    "photoCredit": "Foto della rosa bulgara:",
    "cookie.text": "Usiamo cookie tecnici e, solo con il tuo consenso, il plugin di Facebook.",
    "cookie.accept": "Ho capito",
    "cookie.reject": "Rifiuta",
    "cookie.more": "Maggiori informazioni",
    "updated": "Ultimo aggiornamento",
    "backHome": "Torna alla home",
  },
  bg: {
    "nav.about": "За нас",
    "nav.school": "Училището",
    "nav.courses": "Курсове",
    "nav.dance": "Танци",
    "nav.facebook": "Facebook",
    "nav.contact": "Контакти",
    "nav.enroll": "Запиши се",
    "skip": "Към съдържанието",
    "cta.discover": "Виж курсовете",
    "cta.know": "Опознай училището",
    "form.name": "Име и фамилия",
    "form.email": "Имейл",
    "form.topic": "Интерес",
    "form.message": "Съобщение",
    "form.send": "Изпрати запитване",
    "form.required": "Моля, попълнете задължителните полета.",
    "form.ok": "Благодарим! Ще се свържем с вас възможно най-скоро.",
    "form.note": "Данните се използват само за да ви отговорим.",
    "fb.show": "Покажи публикациите",
    "fb.consent": "За да покажем съдържанието, зареждаме емисията от Facebook, която може да зададе бисквитки на вашето устройство.",
    "fb.open": "Отвори страницата във Facebook",
    "lang.label": "Език",
    "phone": "Телефон",
    "addr": "Адрес",
    "credit": "Създадено, проектирано и дарено от",
    "legal.heading": "Правна информация",
    "legal.privacy": "Поверителност",
    "legal.cookie": "Бисквитки",
    "legal.terms": "Условия",
    "rights": "Всички права запазени.",
    "photoCredit": "Снимка на българската роза:",
    "cookie.text": "Използваме технически бисквитки и — само с ваше съгласие — плъгина на Facebook.",
    "cookie.accept": "Разбрах",
    "cookie.reject": "Откажи",
    "cookie.more": "Повече информация",
    "updated": "Последна актуализация",
    "backHome": "Към началото",
  },
  en: {
    "nav.about": "About",
    "nav.school": "The school",
    "nav.courses": "Courses",
    "nav.dance": "Dance",
    "nav.facebook": "Facebook",
    "nav.contact": "Contact",
    "nav.enroll": "Enrol",
    "skip": "Skip to content",
    "cta.discover": "Explore the courses",
    "cta.know": "Get to know us",
    "form.name": "Full name",
    "form.email": "Email",
    "form.topic": "Interest",
    "form.message": "Message",
    "form.send": "Send request",
    "form.required": "Please fill in all required fields.",
    "form.ok": "Thank you! We will get back to you soon.",
    "form.note": "Your data is used only to reply to you.",
    "fb.show": "Show the posts",
    "fb.consent": "To show the posts we load the feed from Facebook, which may set cookies on your device.",
    "fb.open": "Open the Facebook page",
    "lang.label": "Language",
    "phone": "Phone",
    "addr": "Address",
    "credit": "Created, designed and donated by",
    "legal.heading": "Legal",
    "legal.privacy": "Privacy",
    "legal.cookie": "Cookies",
    "legal.terms": "Terms",
    "rights": "All rights reserved.",
    "photoCredit": "Bulgarian rose photo:",
    "cookie.text": "We use technical cookies and, only with your consent, the Facebook plugin.",
    "cookie.accept": "Got it",
    "cookie.reject": "Decline",
    "cookie.more": "Learn more",
    "updated": "Last updated",
    "backHome": "Back to home",
  },
};

export function t(locale: Locale, key: string): string {
  return UI[locale]?.[key] ?? UI[DEFAULT_LOCALE][key] ?? key;
}
