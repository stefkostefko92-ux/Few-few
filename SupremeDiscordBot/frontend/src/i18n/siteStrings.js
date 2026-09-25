// frontend/src/i18n/siteStrings.js
// Низовете на новия публичен сайт (редизайн 25.09.2026), които ги нямаше в
// landing.js: навигация, демото в hero-то и каналите в обиколката.
//
// Демото показва РЕАЛНИЯ поток на бота, не въображаем: заглавието „Ticket
// #0142“ и бутоните 🔒 Close · 👋 Claim · 📜 Transcript са точно тези от
// bot/src/events/interactionCreate.js (ботът ги праща на английски на всички
// езици), а етикетът на AI отговора — точно bot/src/i18n/<език>.js
// → ai.disclosure.author/title/footer. Приветствието е персонализируемо от
// администратора, затова е на езика на страницата. Сценарият (роля за рейд)
// е неутрален — не твърди нищо за продукта, което не е вярно.

const AI = {
  en: { author: "🤖 AI-Generated Response", title: "Automated AI Reply", footer: "Supreme Bot · AI Auto-Reply · Powered by Google Gemini" },
  bg: { author: "🤖 Отговор, генериран от AI", title: "Автоматичен AI отговор", footer: "Supreme Bot · Автоматичен AI отговор · Powered by Google Gemini" },
  de: { author: "🤖 KI-generierte Antwort", title: "Automatische KI-Antwort", footer: "Supreme Bot · Automatische KI-Antwort · Powered by Google Gemini" },
  es: { author: "🤖 Respuesta generada por IA", title: "Respuesta automática de IA", footer: "Supreme Bot · Respuesta automática de IA · Powered by Google Gemini" },
  fr: { author: "🤖 Réponse générée par IA", title: "Réponse automatique de l'IA", footer: "Supreme Bot · Réponse automatique IA · Powered by Google Gemini" },
  it: { author: "🤖 Risposta generata dall'IA", title: "Risposta automatica dell'IA", footer: "Supreme Bot · Risposta automatica IA · Powered by Google Gemini" },
  nl: { author: "🤖 Door AI gegenereerd antwoord", title: "Automatisch AI-antwoord", footer: "Supreme Bot · Automatisch AI-antwoord · Powered by Google Gemini" },
  pl: { author: "🤖 Odpowiedź wygenerowana przez AI", title: "Automatyczna odpowiedź AI", footer: "Supreme Bot · Automatyczna odpowiedź AI · Powered by Google Gemini" },
};

export const SITE_STRINGS = {
  en: {
    nav: { features: "Features", game: "Game", pricing: "Pricing", faq: "FAQ", signIn: "Sign in", invite: "Add to Discord", skip: "Skip to content", language: "Language", menu: "Menu" },
    demo: {
      aria: "Example: a Discord ticket where Supreme posts a welcome, answers the first message automatically with a labelled AI reply, and a staff member takes over.",
      member: "Mila", memberMsg: "I can't join the voice channel for tonight's raid.",
      welcome: "Hi Mila, the support team has been notified and will be with you shortly. When we're done, press Close.",
      aiMsg: "Check that you have the Raider role from #roles — the raid voice channels are locked to it.",
      staff: "Alex", staffMsg: "Claimed. I've added the role for you — see you tonight at 20:00!",
      today: "Today at", typing: "Supreme is typing…", replay: "Play again",
    },
    tour: {
      heading: "Every job has its channel",
      sub: "Pick one to see the dashboard screen behind it.",
      channels: { tickets: "tickets", forms: "applications", access: "access", community: "community", insights: "insights" },
      shot: "Dashboard screen",
    },
  },
  bg: {
    nav: { features: "Функции", game: "Игра", pricing: "Цени", faq: "Въпроси", signIn: "Вход", invite: "Добави в Discord", skip: "Към съдържанието", language: "Език", menu: "Меню" },
    demo: {
      aria: "Пример: тикет в Discord — Supreme посреща члена, отговаря автоматично на първото съобщение с AI отговор, отбелязан като такъв, и после поема човек от екипа.",
      member: "Мила", memberMsg: "Не мога да вляза в гласовия канал за довечерашния рейд.",
      welcome: "Здравей, Мила! Екипът е известен и ще отговори скоро. Когато приключим, натисни Close.",
      aiMsg: "Провери дали имаш ролята „Рейдър“ от #роли — гласовите канали за рейдовете са заключени за нея.",
      staff: "Алекс", staffMsg: "Поемам. Добавих ти ролята — до довечера в 20:00!",
      today: "Днес в", typing: "Supreme пише…", replay: "Пусни отново",
    },
    tour: {
      heading: "Всяка задача има своя канал",
      sub: "Изберете канал, за да видите екрана от таблото зад него.",
      channels: { tickets: "тикети", forms: "кандидатури", access: "достъп", community: "общност", insights: "анализи" },
      shot: "Екран от таблото",
    },
  },
  de: {
    nav: { features: "Funktionen", game: "Spiel", pricing: "Preise", faq: "FAQ", signIn: "Anmelden", invite: "Zu Discord hinzufügen", skip: "Zum Inhalt", language: "Sprache", menu: "Menü" },
    demo: {
      aria: "Beispiel: ein Discord-Ticket – Supreme begrüßt das Mitglied, beantwortet die erste Nachricht automatisch mit einer gekennzeichneten KI-Antwort, danach übernimmt das Team.",
      member: "Mila", memberMsg: "Ich komme nicht in den Voice-Kanal für den Raid heute Abend.",
      welcome: "Hallo Mila! Das Team ist benachrichtigt und meldet sich gleich. Wenn alles geklärt ist, drück auf Close.",
      aiMsg: "Prüf, ob du die Rolle „Raider“ aus #rollen hast – die Voice-Kanäle für Raids sind auf diese Rolle beschränkt.",
      staff: "Alex", staffMsg: "Übernommen. Ich habe dir die Rolle gegeben – bis heute Abend um 20:00!",
      today: "Heute um", typing: "Supreme schreibt …", replay: "Nochmal abspielen",
    },
    tour: {
      heading: "Jede Aufgabe hat ihren Kanal",
      sub: "Wähle einen Kanal und sieh dir den passenden Bildschirm im Dashboard an.",
      channels: { tickets: "tickets", forms: "bewerbungen", access: "zugang", community: "community", insights: "einblicke" },
      shot: "Bildschirm im Dashboard",
    },
  },
  es: {
    nav: { features: "Funciones", game: "Juego", pricing: "Precios", faq: "Preguntas", signIn: "Iniciar sesión", invite: "Añadir a Discord", skip: "Ir al contenido", language: "Idioma", menu: "Menú" },
    demo: {
      aria: "Ejemplo: un ticket de Discord en el que Supreme da la bienvenida, responde automáticamente al primer mensaje con una respuesta de IA marcada como tal y luego toma el relevo el equipo.",
      member: "Mila", memberMsg: "No puedo entrar al canal de voz para la raid de esta noche.",
      welcome: "¡Hola, Mila! El equipo ya está avisado y te responderá enseguida. Cuando esté resuelto, pulsa Close.",
      aiMsg: "Comprueba que tienes el rol «Raider» de #roles: los canales de voz de las raids están limitados a ese rol.",
      staff: "Alex", staffMsg: "Me encargo. Te he añadido el rol, ¡nos vemos esta noche a las 20:00!",
      today: "hoy a las", typing: "Supreme está escribiendo…", replay: "Volver a reproducir",
    },
    tour: {
      heading: "Cada tarea tiene su canal",
      sub: "Elige un canal para ver la pantalla del panel que hay detrás.",
      channels: { tickets: "tickets", forms: "solicitudes", access: "acceso", community: "comunidad", insights: "analítica" },
      shot: "Pantalla del panel",
    },
  },
  fr: {
    nav: { features: "Fonctionnalités", game: "Jeu", pricing: "Tarifs", faq: "FAQ", signIn: "Se connecter", invite: "Ajouter à Discord", skip: "Aller au contenu", language: "Langue", menu: "Menu" },
    demo: {
      aria: "Exemple : un ticket Discord où Supreme accueille le membre, répond automatiquement au premier message avec une réponse IA signalée comme telle, puis l'équipe prend le relais.",
      member: "Mila", memberMsg: "Je n'arrive pas à rejoindre le salon vocal pour le raid de ce soir.",
      welcome: "Bonjour Mila ! L'équipe est prévenue et va vous répondre. Une fois réglé, appuyez sur Close.",
      aiMsg: "Vérifiez que vous avez le rôle « Raider » dans #rôles : les salons vocaux des raids lui sont réservés.",
      staff: "Alex", staffMsg: "Je m'en occupe. Je vous ai ajouté le rôle — à ce soir, 20 h !",
      today: "Aujourd'hui à", typing: "Supreme est en train d'écrire…", replay: "Rejouer",
    },
    tour: {
      heading: "Chaque tâche a son salon",
      sub: "Choisissez un salon pour voir l'écran du tableau de bord correspondant.",
      channels: { tickets: "tickets", forms: "candidatures", access: "accès", community: "communauté", insights: "analyses" },
      shot: "Écran du tableau de bord",
    },
  },
  it: {
    nav: { features: "Funzioni", game: "Gioco", pricing: "Prezzi", faq: "FAQ", signIn: "Accedi", invite: "Aggiungi a Discord", skip: "Vai al contenuto", language: "Lingua", menu: "Menu" },
    demo: {
      aria: "Esempio: un ticket Discord in cui Supreme accoglie il membro, risponde automaticamente al primo messaggio con una risposta IA indicata come tale e poi subentra lo staff.",
      member: "Mila", memberMsg: "Non riesco a entrare nel canale vocale per il raid di stasera.",
      welcome: "Ciao Mila! Lo staff è stato avvisato e ti risponderà a breve. Quando abbiamo finito, premi Close.",
      aiMsg: "Controlla di avere il ruolo «Raider» da #ruoli: i canali vocali dei raid sono riservati a quel ruolo.",
      staff: "Alex", staffMsg: "Me ne occupo io. Ti ho aggiunto il ruolo: a stasera alle 20:00!",
      today: "Oggi alle", typing: "Supreme sta scrivendo…", replay: "Riproduci di nuovo",
    },
    tour: {
      heading: "Ogni compito ha il suo canale",
      sub: "Scegli un canale per vedere la schermata della dashboard che c'è dietro.",
      channels: { tickets: "ticket", forms: "candidature", access: "accesso", community: "community", insights: "analisi" },
      shot: "Schermata della dashboard",
    },
  },
  nl: {
    nav: { features: "Functies", game: "Spel", pricing: "Prijzen", faq: "FAQ", signIn: "Inloggen", invite: "Toevoegen aan Discord", skip: "Naar inhoud", language: "Taal", menu: "Menu" },
    demo: {
      aria: "Voorbeeld: een Discord-ticket waarin Supreme het lid verwelkomt, het eerste bericht automatisch beantwoordt met een gemarkeerd AI-antwoord en daarna het team het overneemt.",
      member: "Mila", memberMsg: "Ik kan het spraakkanaal voor de raid van vanavond niet in.",
      welcome: "Hoi Mila! Het team is op de hoogte en reageert zo. Klaar? Druk dan op Close.",
      aiMsg: "Controleer of je de rol ‘Raider’ uit #rollen hebt — de spraakkanalen voor raids zijn beperkt tot die rol.",
      staff: "Alex", staffMsg: "Ik pak het op. Je hebt de rol nu — tot vanavond om 20:00!",
      today: "Vandaag om", typing: "Supreme is aan het typen…", replay: "Opnieuw afspelen",
    },
    tour: {
      heading: "Elke taak heeft een eigen kanaal",
      sub: "Kies een kanaal om het dashboardscherm erachter te zien.",
      channels: { tickets: "tickets", forms: "sollicitaties", access: "toegang", community: "community", insights: "inzichten" },
      shot: "Dashboardscherm",
    },
  },
  pl: {
    nav: { features: "Funkcje", game: "Gra", pricing: "Cennik", faq: "FAQ", signIn: "Zaloguj się", invite: "Dodaj do Discorda", skip: "Przejdź do treści", language: "Język", menu: "Menu" },
    demo: {
      aria: "Przykład: ticket na Discordzie — Supreme wita członka, automatycznie odpowiada na pierwszą wiadomość odpowiedzią oznaczoną jako AI, a potem przejmuje zespół.",
      member: "Mila", memberMsg: "Nie mogę wejść na kanał głosowy na dzisiejszy rajd.",
      welcome: "Cześć Mila! Zespół został powiadomiony i zaraz odpowie. Gdy skończymy, kliknij Close.",
      aiMsg: "Sprawdź, czy masz rolę „Raider” z #role — kanały głosowe rajdów są dostępne tylko dla niej.",
      staff: "Alex", staffMsg: "Biorę to. Dodałem ci rolę — do zobaczenia dziś o 20:00!",
      today: "Dzisiaj o", typing: "Supreme pisze…", replay: "Odtwórz ponownie",
    },
    tour: {
      heading: "Każde zadanie ma swój kanał",
      sub: "Wybierz kanał, aby zobaczyć ekran panelu, który za nim stoi.",
      channels: { tickets: "tickety", forms: "rekrutacje", access: "dostęp", community: "społeczność", insights: "analityka" },
      shot: "Ekran panelu",
    },
  },
};

for (const [loc, s] of Object.entries(SITE_STRINGS)) s.demo.ai = AI[loc];

/** Кои функции (ключове от landing.js → features[].key) живеят в кой канал и
 *  кой реален скрийншот от таблото стои зад него. Играта има своя секция. */
export const TOUR_CHANNELS = [
  { id: "tickets",   screen: "tickets",   features: ["ticket", "ai", "knowledgeBase", "canned"] },
  { id: "forms",     screen: "forms",     features: ["forms"] },
  { id: "access",    screen: "panels",    features: ["verification", "reactionRoles", "welcomer"] },
  { id: "community", screen: "home",      features: ["polls", "giveaways", "sticky", "scheduled"] },
  { id: "insights",  screen: "analytics", features: ["activityLog", "webhooks"] },
];
