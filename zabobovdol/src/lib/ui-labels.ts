// Надписите на бутоните, които правните документи (Общи условия,
// Поверителност, Бисквитки, Достъпност) цитират дословно. Цитатът трябва да
// е точно като бутона — иначе човек не намира това, което текстът описва.
// За „Сигнализирайте…“ (механизмът по чл. 16 от DSA) ясното описание е и
// правно изискване.
//
// Компонентите (ShareButton, ReportContent, InstallBanner, PushSubscribe,
// HelpfulWidget, PhoneReportButton, AccessibilityBar, ChatFab, SearchBar)
// вземат надписа оттук; „Как да ползвам сайта“ и „Достъпност“ го цитират —
// затова цитатът в правния текст и бутонът не могат да се разминат.

// Бутонът на лентата за четене е от три части: украсата „Аа“ (скрита под
// 360px), „Настройки“ (винаги) и „ за четене“ (под 640px — само за четеца).
export const READING_BAR = {
  mark: "Аа",
  short: "Настройки",
  rest: " за четене",
} as const;

export const UI_LABEL = {
  share: "Споделете",
  report: "Сигнализирайте за това съдържание",
  install: "Сложете сайта на телефона",
  installDismiss: "Не сега",
  pushOff: "Спрете известията",
  helpful: "Помогна ли ви?",
  phoneWrong: "Този номер е сгрешен",
  readingBar: `${READING_BAR.mark} ${READING_BAR.short}${READING_BAR.rest}`,
  readingBarShort: READING_BAR.short,
  chat: "Попитайте помощника",
  chatClose: "Затворете помощника",
  search: "Търсете",
} as const;

/** Надписът в български кавички: „Споделете“. */
export function quoted(label: string): string {
  return `„${label}“`;
}
