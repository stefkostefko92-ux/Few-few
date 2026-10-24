/**
 * Декларация за достъпност (EAA — Директива (ЕС) 2019/882; стандарт EN 301 549,
 * който препраща към WCAG 2.1 AA). Отделен файл, а не пети ключ в `legal.ts`, за
 * да не се смесва с правните текстове; рендва се от същия `LegalArticle`.
 * Български е източникът; `en`/`it` пазят същите раздели и твърдения.
 *
 * Честност преди всичко: игрите на живо в 3D/canvas не могат да са напълно
 * достъпни за незрящи, затова статусът е „частично съответствие“ с изброени
 * ограничения, а не „пълно“.
 */
import type { LegalPage } from "./legal";
import type { Locale } from "./locales";

export const ACCESSIBILITY: Record<Locale, LegalPage> = {
  bg: {
    metaTitle: "Декларация за достъпност",
    metaDescription:
      "Доколко АСО е достъпен по WCAG 2.1 AA, кои са известните ограничения и как да ни съобщите за пречка.",
    updated: "24.10.2026",
    h1: "Декларация за достъпност",
    blocks: [
      {
        type: "p",
        text: "{org} иска АСО — сайтът и приложението с игрите — да може да се ползва от всеки, включително от хора с увреждания. Декларацията се отнася за gaming.carbonstealth.eu и приложението на /app.",
      },
      { type: "h2", text: "Статус на съответствие" },
      {
        type: "p",
        text: "АСО е в **частично съответствие** с WCAG 2.1, ниво AA (стандартът, към който препраща EN 301 549). Частично, защото част от съдържанието по-долу още не отговаря изцяло на изискванията.",
      },
      { type: "h2", text: "Какво сме направили" },
      {
        type: "ul",
        items: [
          "Всичко се управлява и само с клавиатура, с видим фокус; модалните прозорци задържат фокуса и се затварят с Escape.",
          "Контраст на текста поне 4.5:1 (основният текст е над 7:1).",
          "Бутоните с икони имат текстови етикети за екранни четци; грешките във формите се обявяват (aria-live).",
          "Езикът на страницата следва избрания език (български, английски, италиански).",
          "Настройка „Намалено движение“, която следва и системната настройка на устройството; анимациите никога не мигат по-често от 3 пъти в секунда.",
          "Режим „Четири цвята“ за картите — всяка боя има собствен цвят, не само символ.",
          "Изключване на звука; нищо важно не се съобщава само със звук.",
        ],
      },
      { type: "h2", text: "Известни ограничения" },
      {
        type: "ul",
        items: [
          "**Игрите на масата** се рисуват в canvas/3D. Ходовете и резултатът се обявяват текстово, но разположението на картите и фигурите не е напълно описано за екранен четец.",
          "**Таймерът на хода** в игрите на живо е ограничение във времето (WCAG 2.2.1). Той е част от игрите с други хора; когато изтече, ходът се изиграва автоматично, без да губите мястото си на масата.",
          "**Билярдът** иска прицелване с мишка или докосване; от клавиатурата то е възможно, но по-бавно.",
        ],
      },
      { type: "h2", text: "Обратна връзка и контакт" },
      {
        type: "p",
        text: "Срещнахте ли пречка или ви трябва съдържание в друг вид? Пишете на legal@carbonstealth.eu с адреса на страницата и описание. Отговаряме до 14 дни.",
      },
      { type: "h2", text: "Ако отговорът не ви удовлетворява" },
      {
        type: "p",
        text: "Можете да се обърнете към националния орган, който в държавата ви надзирава изискванията за достъпност на продукти и услуги.",
      },
      { type: "h2", text: "Как е изготвена декларацията" },
      {
        type: "p",
        text: "Самооценка от екипа: автоматични проверки (контраст, имена на елементите) и ръчна проверка с клавиатура и екранен четец. Изготвена на 24.10.2026; преглежда се при всяка голяма промяна. Вижте и {terms} и {privacy}.",
      },
    ],
  },
  en: {
    metaTitle: "Accessibility statement",
    metaDescription:
      "How accessible ASO is against WCAG 2.1 AA, the known limitations and how to report a barrier.",
    updated: "24 October 2026",
    h1: "Accessibility statement",
    blocks: [
      {
        type: "p",
        text: "{org} wants ASO — the website and the games app — to be usable by everyone, including people with disabilities. This statement covers gaming.carbonstealth.eu and the app at /app.",
      },
      { type: "h2", text: "Compliance status" },
      {
        type: "p",
        text: "ASO is **partially conformant** with WCAG 2.1 level AA (the standard referenced by EN 301 549). Partially, because some of the content listed below does not yet fully meet the requirements.",
      },
      { type: "h2", text: "What we have done" },
      {
        type: "ul",
        items: [
          "Everything can be operated with a keyboard alone, with a visible focus; dialogs keep focus inside and close with Escape.",
          "Text contrast of at least 4.5:1 (body text is above 7:1).",
          "Icon buttons have text labels for screen readers; form errors are announced (aria-live).",
          "The page language follows the chosen language (Bulgarian, English, Italian).",
          "A “Reduced motion” setting that also follows the device setting; animations never flash more than 3 times per second.",
          "A “Four colours” mode for cards — every suit has its own colour, not only a symbol.",
          "Sound can be muted; nothing important is conveyed by sound alone.",
        ],
      },
      { type: "h2", text: "Known limitations" },
      {
        type: "ul",
        items: [
          "**Games at the table** are drawn in canvas/3D. Moves and results are announced as text, but the layout of cards and pieces is not fully described to a screen reader.",
          "**The turn timer** in live games is a time limit (WCAG 2.2.1). It is part of playing with other people; when it runs out the move is played automatically, without you losing your seat.",
          "**Billiards** requires aiming with a mouse or touch; keyboard aiming is possible but slower.",
        ],
      },
      { type: "h2", text: "Feedback and contact" },
      {
        type: "p",
        text: "Did you hit a barrier or need content in another format? Write to legal@carbonstealth.eu with the page address and a description. We reply within 14 days.",
      },
      { type: "h2", text: "If our answer does not satisfy you" },
      {
        type: "p",
        text: "You can contact the national authority that supervises the accessibility requirements for products and services in your country.",
      },
      { type: "h2", text: "How this statement was prepared" },
      {
        type: "p",
        text: "Self-assessment by the team: automated checks (contrast, element names) and manual testing with a keyboard and a screen reader. Prepared on 24 October 2026; reviewed with every major change. See also {terms} and {privacy}.",
      },
    ],
  },
  it: {
    metaTitle: "Dichiarazione di accessibilità",
    metaDescription:
      "Quanto ASO è accessibile rispetto alle WCAG 2.1 AA, i limiti noti e come segnalare un ostacolo.",
    updated: "24 ottobre 2026",
    h1: "Dichiarazione di accessibilità",
    blocks: [
      {
        type: "p",
        text: "{org} vuole che ASO — il sito e l’app dei giochi — sia utilizzabile da tutti, comprese le persone con disabilità. La dichiarazione riguarda gaming.carbonstealth.eu e l’app su /app.",
      },
      { type: "h2", text: "Stato di conformità" },
      {
        type: "p",
        text: "ASO è **parzialmente conforme** alle WCAG 2.1 livello AA (lo standard richiamato dalla EN 301 549). Parzialmente, perché alcuni contenuti elencati sotto non soddisfano ancora del tutto i requisiti.",
      },
      { type: "h2", text: "Cosa abbiamo fatto" },
      {
        type: "ul",
        items: [
          "Tutto si usa anche solo con la tastiera, con il focus visibile; le finestre di dialogo trattengono il focus e si chiudono con Esc.",
          "Contrasto del testo di almeno 4,5:1 (il testo principale supera 7:1).",
          "I pulsanti con icona hanno etichette testuali per i lettori di schermo; gli errori nei moduli vengono annunciati (aria-live).",
          "La lingua della pagina segue quella scelta (bulgaro, inglese, italiano).",
          "Impostazione “Movimento ridotto”, che segue anche quella del dispositivo; le animazioni non lampeggiano mai più di 3 volte al secondo.",
          "Modalità “Quattro colori” per le carte — ogni seme ha il suo colore, non solo il simbolo.",
          "L’audio si può disattivare; nulla di importante è comunicato solo con il suono.",
        ],
      },
      { type: "h2", text: "Limiti noti" },
      {
        type: "ul",
        items: [
          "**I giochi al tavolo** sono disegnati in canvas/3D. Mosse e risultati vengono annunciati come testo, ma la disposizione di carte e pedine non è descritta del tutto al lettore di schermo.",
          "**Il timer del turno** nei giochi dal vivo è un limite di tempo (WCAG 2.2.1). Fa parte del gioco con altre persone; allo scadere la mossa viene giocata automaticamente, senza perdere il posto al tavolo.",
          "**Il biliardo** richiede la mira con mouse o tocco; con la tastiera è possibile, ma più lenta.",
        ],
      },
      { type: "h2", text: "Segnalazioni e contatti" },
      {
        type: "p",
        text: "Hai incontrato un ostacolo o ti serve un contenuto in un altro formato? Scrivi a legal@carbonstealth.eu indicando l’indirizzo della pagina e una descrizione. Rispondiamo entro 14 giorni.",
      },
      { type: "h2", text: "Se la risposta non ti soddisfa" },
      {
        type: "p",
        text: "Puoi rivolgerti all’autorità nazionale che nel tuo Paese vigila sui requisiti di accessibilità di prodotti e servizi.",
      },
      { type: "h2", text: "Come è stata redatta la dichiarazione" },
      {
        type: "p",
        text: "Autovalutazione del team: controlli automatici (contrasto, nomi degli elementi) e verifica manuale con tastiera e lettore di schermo. Redatta il 24 ottobre 2026; viene rivista a ogni modifica importante. Vedi anche {terms} e {privacy}.",
      },
    ],
  },
};
