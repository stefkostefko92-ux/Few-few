// bot/src/utils/commandLocalizations.js
// Discord `setDescriptionLocalizations` / `setNameLocalizations` payloads for
// our slash + context-menu commands. Discord.js validates these keys against
// its own Locale enum, so we use the exact Discord locale codes (not our
// internal i18n codes) — https://discord.com/developers/docs/reference#locales
//
// Only description localizations are populated here (bg/de/es-ES/fr/it/nl/pl)
// — command *names* stay English everywhere to avoid collisions across
// servers with mixed-locale members and to keep `/command` typing consistent
// in support threads. Discord renders the localized description automatically
// based on each user's client language; this is the single highest-visibility,
// lowest-effort i18n win for slash commands.
//
// de/es/fr/nl/pl entries here ARE real short translations (command
// descriptions are one sentence). The full in-bot copy in i18n/*.js is now
// also fully translated for all 8 locales (key-parity gated by i18n.test.js).

export const CMD_DESC_L10N = {
  admin: {
    bg: "Административни инструменти (Manage Server)",
    de: "Admin-Werkzeuge (Manage Server)",
    "es-ES": "Herramientas de administración (Manage Server)",
    fr: "Outils d'administration (Manage Server)",
    it: "Strumenti di amministrazione (Manage Server)",
    nl: "Beheertools (Manage Server)",
    pl: "Narzędzia administracyjne (Manage Server)",
  },
  apply: {
    bg: "Подай кандидатура",
    de: "Eine Bewerbung einreichen",
    "es-ES": "Enviar una solicitud",
    fr: "Soumettre une candidature",
    it: "Invia una candidatura",
    nl: "Een aanvraag indienen",
    pl: "Złóż zgłoszenie",
  },
  debug: {
    bg: "Провери правата и статуса на бота в този сървър",
    de: "Berechtigungen und Status des Bots auf diesem Server prüfen",
    "es-ES": "Comprobar los permisos y el estado del bot en este servidor",
    fr: "Vérifier les permissions et l'état du bot sur ce serveur",
    it: "Controlla i permessi e lo stato del bot su questo server",
    nl: "Controleer de rechten en status van de bot op deze server",
    pl: "Sprawdź uprawnienia i status bota na tym serwerze",
  },
  escalate: {
    bg: "Премести този билет към друг панел / екип за поддръжка",
    de: "Dieses Ticket an ein anderes Panel / Support-Team weiterleiten",
    "es-ES": "Mover este ticket a otro panel / equipo de soporte",
    fr: "Déplacer ce ticket vers un autre panneau / équipe de support",
    it: "Sposta questo ticket verso un altro pannello / team di supporto",
    nl: "Dit ticket verplaatsen naar een ander paneel / supportteam",
    pl: "Przenieś to zgłoszenie do innego panelu / zespołu wsparcia",
  },
  form: {
    bg: "Управление на формуляри за кандидатстване",
    de: "Bewerbungsformulare verwalten",
    "es-ES": "Gestionar formularios de solicitud",
    fr: "Gérer les formulaires de candidature",
    it: "Gestisci i moduli di candidatura",
    nl: "Aanvraagformulieren beheren",
    pl: "Zarządzaj formularzami zgłoszeniowymi",
  },
  giveaway: {
    bg: "Управление на раздавания (giveaways)",
    de: "Gewinnspiele verwalten",
    "es-ES": "Gestionar sorteos",
    fr: "Gérer les giveaways",
    it: "Gestisci i giveaway",
    nl: "Weggeefacties beheren",
    pl: "Zarządzaj rozdaniami (giveaway)",
  },
  help: {
    bg: "Покажи всички команди на бота и какво правят",
    de: "Alle Bot-Befehle und ihre Funktion anzeigen",
    "es-ES": "Mostrar todos los comandos del bot y qué hacen",
    fr: "Afficher toutes les commandes du bot et leur fonction",
    it: "Mostra tutti i comandi del bot e cosa fanno",
    nl: "Toon alle bot-commando's en wat ze doen",
    pl: "Pokaż wszystkie komendy bota i ich działanie",
  },
  new: {
    bg: "Отвори нов билет за поддръжка",
    de: "Ein neues Support-Ticket öffnen",
    "es-ES": "Abrir un nuevo ticket de soporte",
    fr: "Ouvrir un nouveau ticket de support",
    it: "Apri un nuovo ticket di supporto",
    nl: "Een nieuw supportticket openen",
    pl: "Otwórz nowe zgłoszenie do wsparcia",
  },
  panel: {
    bg: "Управление на билет панели",
    de: "Ticket-Panels verwalten",
    "es-ES": "Gestionar paneles de tickets",
    fr: "Gérer les panneaux de tickets",
    it: "Gestisci i pannelli ticket",
    nl: "Ticketpanelen beheren",
    pl: "Zarządzaj panelami zgłoszeń",
  },
  poll: {
    bg: "Създай анкета",
    de: "Eine Umfrage erstellen",
    "es-ES": "Crear una encuesta",
    fr: "Créer un sondage",
    it: "Crea un sondaggio",
    nl: "Een peiling maken",
    pl: "Utwórz ankietę",
  },
  premium: {
    bg: "⭐ Premium команди за сървъра",
    de: "⭐ Premium-Befehle für den Server",
    "es-ES": "⭐ Comandos Premium del servidor",
    fr: "⭐ Commandes Premium du serveur",
    it: "⭐ Comandi Premium del server",
    nl: "⭐ Premium serveropdrachten",
    pl: "⭐ Komendy Premium serwera",
  },
  rename: {
    bg: "Преименувай текущия билет канал",
    de: "Aktuellen Ticket-Kanal umbenennen",
    "es-ES": "Renombrar el canal del ticket actual",
    fr: "Renommer le salon de ticket actuel",
    it: "Rinomina l'attuale canale ticket",
    nl: "Huidig ticketkanaal hernoemen",
    pl: "Zmień nazwę bieżącego kanału zgłoszenia",
  },
  setup: {
    bg: "Команди за настройка на сървъра",
    de: "Server-Einrichtungsbefehle",
    "es-ES": "Comandos de configuración del servidor",
    fr: "Commandes de configuration du serveur",
    it: "Comandi di configurazione del server",
    nl: "Serverinstellingen-commando's",
    pl: "Komendy konfiguracji serwera",
  },
  stats: {
    bg: "Покажи статистика за билети и екип за този сървър",
    de: "Ticket- und Team-Leistungsstatistiken für diesen Server anzeigen",
    "es-ES": "Mostrar estadísticas de tickets y rendimiento del equipo de este servidor",
    fr: "Afficher les statistiques de tickets et de performance de l'équipe pour ce serveur",
    it: "Mostra le statistiche di ticket e performance dello staff per questo server",
    nl: "Toon ticket- en teamprestatiestatistieken voor deze server",
    pl: "Pokaż statystyki zgłoszeń i wydajności zespołu dla tego serwera",
  },
  tag: {
    bg: "Управление на готови отговори (canned responses)",
    de: "Vorgefertigte Antworten (canned responses) verwalten",
    "es-ES": "Gestionar respuestas predefinidas",
    fr: "Gérer les réponses prédéfinies",
    it: "Gestisci le risposte predefinite",
    nl: "Kant-en-klare antwoorden beheren",
    pl: "Zarządzaj gotowymi odpowiedziami",
  },
  ticket: {
    bg: "Управление на билети",
    de: "Tickets verwalten",
    "es-ES": "Gestionar tickets",
    fr: "Gérer les tickets",
    it: "Gestisci i ticket",
    nl: "Tickets beheren",
    pl: "Zarządzaj zgłoszeniami",
  },
};

// Context-menu commands (USER/MESSAGE type) have no description field —
// only a name, which Discord shows directly in the right-click menu.
export const CMD_NAME_L10N = {
  "Create ticket from message": {
    bg: "Създай билет от съобщение",
    de: "Ticket aus Nachricht erstellen",
    "es-ES": "Crear ticket desde el mensaje",
    fr: "Créer un ticket depuis le message",
    it: "Crea ticket dal messaggio",
    nl: "Ticket maken van bericht",
    pl: "Utwórz zgłoszenie z wiadomości",
  },
  "Open ticket for user": {
    bg: "Отвори билет за потребител",
    de: "Ticket für Nutzer öffnen",
    "es-ES": "Abrir ticket para el usuario",
    fr: "Ouvrir un ticket pour l'utilisateur",
    it: "Apri ticket per l'utente",
    nl: "Ticket openen voor gebruiker",
    pl: "Otwórz zgłoszenie dla użytkownika",
  },
  "Reply with tag": {
    bg: "Отговори с готов отговор (tag)",
    de: "Mit Tag antworten",
    "es-ES": "Responder con etiqueta",
    fr: "Répondre avec un tag",
    it: "Rispondi con un tag",
    nl: "Antwoorden met tag",
    pl: "Odpowiedz tagiem",
  },
};
