// frontend/src/i18n/landingUi.js
// Общите надписи на лендинга, които не са съдържание: навигацията (вкл.
// мобилното меню) и групите на функциите. Едно място за английския (Login.jsx)
// и 7-те превода (LandingLocalized.jsx). Ключовете на групите съвпадат с
// FEATURE_GROUPS в components/FeatureGroups.jsx. `footer` — колоните на
// общия футър (components/LandingParts.jsx).
export const LANDING_UI = {
  en: {
    nav: { features: "Features", demo: "Live demo", game: "Game", bait: "Anti-spam", pricing: "Pricing", faq: "FAQ", menu: "Menu", close: "Close menu", invite: "Invite bot", signIn: "Sign in" },
    free: "Free",
    footer: {"tagline": "One bot for tickets, applications, verification and the rest — hosted in the EU.", "product": "Product", "legal": "Legal", "language": "Language", "commands": "Commands", "status": "Status", "support": "Discord support", "terms": "Terms", "privacy": "Privacy", "cookies": "Cookies", "eula": "EULA", "accessibility": "Accessibility", "made": "Created and designed by"},
    groups: {
      support: { title: "Support desk", blurb: "Tickets, applications and the answers your team gives every day." },
      community: { title: "Community", blurb: "Roles, events and a reason to come back tomorrow." },
      safety: { title: "Safety", blurb: "Keep raiders, spam bots and surprises out — free on every server." },
      automation: { title: "Automation & integrations", blurb: "Posts that run themselves and events your stack can listen to." },
    },
  },
  bg: {
    nav: { features: "Функции", demo: "Живо демо", game: "Игра", bait: "Анти-спам", pricing: "Цени", faq: "Въпроси", menu: "Меню", close: "Затвори менюто", invite: "Добави бота", signIn: "Вход" },
    free: "Безплатно",
    footer: {"tagline": "Един бот за тикети, кандидатури, верификация и всичко останало — хостван в ЕС.", "product": "Продукт", "legal": "Правни", "language": "Език", "commands": "Команди", "status": "Статус", "support": "Поддръжка в Discord", "terms": "Условия", "privacy": "Поверителност", "cookies": "Бисквитки", "eula": "EULA", "accessibility": "Достъпност", "made": "Създадено и проектирано от"},
    groups: {
      support: { title: "Поддръжка", blurb: "Тикети, кандидатури и отговорите, които екипът ви дава всеки ден." },
      community: { title: "Общност", blurb: "Роли, събития и причина хората да се върнат и утре." },
      safety: { title: "Защита", blurb: "Рейдъри, спам ботове и изненади остават навън — безплатно за всеки сървър." },
      automation: { title: "Автоматизация и интеграции", blurb: "Публикации, които вървят сами, и събития, които системите ви чуват." },
    },
  },
  de: {
    nav: { features: "Funktionen", demo: "Live-Demo", game: "Spiel", bait: "Anti-Spam", pricing: "Preise", faq: "FAQ", menu: "Menü", close: "Menü schließen", invite: "Bot einladen", signIn: "Anmelden" },
    free: "Kostenlos",
    footer: {"tagline": "Ein Bot für Tickets, Bewerbungen, Verifizierung und den Rest — gehostet in der EU.", "product": "Produkt", "legal": "Rechtliches", "language": "Sprache", "commands": "Befehle", "status": "Status", "support": "Discord-Support", "terms": "AGB", "privacy": "Datenschutz", "cookies": "Cookies", "eula": "EULA", "accessibility": "Barrierefreiheit", "made": "Entwickelt und gestaltet von"},
    groups: {
      support: { title: "Support", blurb: "Tickets, Bewerbungen und die Antworten, die dein Team jeden Tag gibt." },
      community: { title: "Community", blurb: "Rollen, Events und ein Grund, morgen wiederzukommen." },
      safety: { title: "Schutz", blurb: "Raider, Spam-Bots und Überraschungen bleiben draußen — kostenlos auf jedem Server." },
      automation: { title: "Automatisierung & Integrationen", blurb: "Beiträge, die von selbst laufen, und Ereignisse, auf die deine Systeme hören." },
    },
  },
  es: {
    nav: { features: "Funciones", demo: "Demo en vivo", game: "Juego", bait: "Anti-spam", pricing: "Precios", faq: "Preguntas", menu: "Menú", close: "Cerrar menú", invite: "Invitar bot", signIn: "Iniciar sesión" },
    free: "Gratis",
    footer: {"tagline": "Un bot para tickets, solicitudes, verificación y todo lo demás, alojado en la UE.", "product": "Producto", "legal": "Legal", "language": "Idioma", "commands": "Comandos", "status": "Estado", "support": "Soporte en Discord", "terms": "Términos", "privacy": "Privacidad", "cookies": "Cookies", "eula": "EULA", "accessibility": "Accesibilidad", "made": "Creado y diseñado por"},
    groups: {
      support: { title: "Soporte", blurb: "Tickets, solicitudes y las respuestas que tu equipo da cada día." },
      community: { title: "Comunidad", blurb: "Roles, eventos y un motivo para volver mañana." },
      safety: { title: "Protección", blurb: "Raiders, bots de spam y sorpresas se quedan fuera — gratis en todos los servidores." },
      automation: { title: "Automatización e integraciones", blurb: "Publicaciones que funcionan solas y eventos que tus sistemas pueden escuchar." },
    },
  },
  fr: {
    nav: { features: "Fonctionnalités", demo: "Démo en direct", game: "Jeu", bait: "Anti-spam", pricing: "Tarifs", faq: "FAQ", menu: "Menu", close: "Fermer le menu", invite: "Inviter le bot", signIn: "Connexion" },
    free: "Gratuit",
    footer: {"tagline": "Un bot pour les tickets, les candidatures, la vérification et le reste — hébergé dans l'UE.", "product": "Produit", "legal": "Mentions légales", "language": "Langue", "commands": "Commandes", "status": "Statut", "support": "Support Discord", "terms": "Conditions", "privacy": "Confidentialité", "cookies": "Cookies", "eula": "CLUF", "accessibility": "Accessibilité", "made": "Créé et conçu par"},
    groups: {
      support: { title: "Support", blurb: "Tickets, candidatures et les réponses que votre équipe donne chaque jour." },
      community: { title: "Communauté", blurb: "Rôles, événements et une raison de revenir demain." },
      safety: { title: "Protection", blurb: "Raiders, bots de spam et mauvaises surprises restent dehors — gratuit sur chaque serveur." },
      automation: { title: "Automatisation et intégrations", blurb: "Des publications qui tournent seules et des événements que vos outils peuvent écouter." },
    },
  },
  it: {
    nav: { features: "Funzioni", demo: "Demo dal vivo", game: "Gioco", bait: "Anti-spam", pricing: "Prezzi", faq: "FAQ", menu: "Menu", close: "Chiudi il menu", invite: "Invita il bot", signIn: "Accedi" },
    free: "Gratis",
    footer: {"tagline": "Un bot per ticket, candidature, verifica e tutto il resto, ospitato nell'UE.", "product": "Prodotto", "legal": "Note legali", "language": "Lingua", "commands": "Comandi", "status": "Stato", "support": "Supporto su Discord", "terms": "Termini", "privacy": "Privacy", "cookies": "Cookie", "eula": "EULA", "accessibility": "Accessibilità", "made": "Creato e progettato da"},
    groups: {
      support: { title: "Supporto", blurb: "Ticket, candidature e le risposte che il tuo staff dà ogni giorno." },
      community: { title: "Community", blurb: "Ruoli, eventi e un motivo per tornare domani." },
      safety: { title: "Protezione", blurb: "Raider, bot di spam e sorprese restano fuori — gratis su ogni server." },
      automation: { title: "Automazione e integrazioni", blurb: "Messaggi che vanno da soli ed eventi che i tuoi sistemi possono ascoltare." },
    },
  },
  nl: {
    nav: { features: "Functies", demo: "Live demo", game: "Spel", bait: "Anti-spam", pricing: "Prijzen", faq: "Vragen", menu: "Menu", close: "Menu sluiten", invite: "Bot uitnodigen", signIn: "Inloggen" },
    free: "Gratis",
    footer: {"tagline": "Eén bot voor tickets, sollicitaties, verificatie en de rest — gehost in de EU.", "product": "Product", "legal": "Juridisch", "language": "Taal", "commands": "Commando's", "status": "Status", "support": "Discord-support", "terms": "Voorwaarden", "privacy": "Privacy", "cookies": "Cookies", "eula": "EULA", "accessibility": "Toegankelijkheid", "made": "Gemaakt en ontworpen door"},
    groups: {
      support: { title: "Support", blurb: "Tickets, sollicitaties en de antwoorden die je team elke dag geeft." },
      community: { title: "Community", blurb: "Rollen, evenementen en een reden om morgen terug te komen." },
      safety: { title: "Beveiliging", blurb: "Raiders, spambots en verrassingen blijven buiten — gratis op elke server." },
      automation: { title: "Automatisering & integraties", blurb: "Berichten die vanzelf lopen en gebeurtenissen waar je systemen naar luisteren." },
    },
  },
  pl: {
    nav: { features: "Funkcje", demo: "Demo na żywo", game: "Gra", bait: "Antyspam", pricing: "Cennik", faq: "Pytania", menu: "Menu", close: "Zamknij menu", invite: "Dodaj bota", signIn: "Zaloguj się" },
    free: "Za darmo",
    footer: {"tagline": "Jeden bot do ticketów, podań, weryfikacji i całej reszty — hostowany w UE.", "product": "Produkt", "legal": "Informacje prawne", "language": "Język", "commands": "Komendy", "status": "Status", "support": "Wsparcie na Discordzie", "terms": "Regulamin", "privacy": "Prywatność", "cookies": "Pliki cookie", "eula": "EULA", "accessibility": "Dostępność", "made": "Stworzone i zaprojektowane przez"},
    groups: {
      support: { title: "Wsparcie", blurb: "Tickety, rekrutacje i odpowiedzi, których ekipa udziela każdego dnia." },
      community: { title: "Społeczność", blurb: "Role, wydarzenia i powód, by wrócić jutro." },
      safety: { title: "Ochrona", blurb: "Rajderzy, boty spamujące i niespodzianki zostają za drzwiami — za darmo na każdym serwerze." },
      automation: { title: "Automatyzacja i integracje", blurb: "Posty, które chodzą same, i zdarzenia, których słuchają twoje systemy." },
    },
  },
};
