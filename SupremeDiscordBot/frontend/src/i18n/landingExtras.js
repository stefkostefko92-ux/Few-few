// frontend/src/i18n/landingExtras.js
// Обиколката на таблото (ProductTour.jsx) —
// за английския лендинг и 7-те превода. Собствен lazy чънк с компонентите,
// за да не расте бюджетът на LandingLocalized (30 KB gzip).
export const TOUR_KEYS = ["home", "tickets", "panels", "forms", "analytics", "premium"];
export const EXTRAS_COPY = {
  en: {
    tour: { heading: "The dashboard, for real.", sub: "Not mockups — real screenshots of the current dashboard, filled with demo data.", labels: ["Overview", "Tickets", "Panels", "Forms", "Analytics", "Premium"], alts: ["Server overview — stats, live tickets and system status", "Ticket list with statuses, assignees and satisfaction ratings", "Ticket panels with buttons, support roles and the channel they live in", "Application forms with their questions", "Ticket analytics — heatmap, staff leaderboard and application funnel", "Premium plan and billing through Discord"] },
  },
  bg: {
    tour: { heading: "Таблото, наистина.", sub: "Не макети — истински снимки на текущото табло, попълнено с демо данни.", labels: ["Преглед", "Тикети", "Панели", "Форми", "Анализи", "Premium"], alts: ["Преглед на сървъра — статистики, отворени тикети и състояние на системата", "Списък с тикети със статуси, отговорници и оценки", "Тикет панели с бутони, роли за поддръжка и канала, в който са", "Форми за кандидатстване с въпросите им", "Анализи на тикетите — топлинна карта, класация на екипа и фуния на кандидатурите", "Планът Premium и плащане през Discord"] },
  },
  de: {
    tour: { heading: "Das Dashboard, ganz echt.", sub: "Keine Mockups — echte Screenshots des aktuellen Dashboards, mit Demodaten gefüllt.", labels: ["Übersicht", "Tickets", "Panels", "Formulare", "Analysen", "Premium"], alts: ["Server-Übersicht — Statistiken, offene Tickets und Systemstatus", "Ticketliste mit Status, Zuständigen und Bewertungen", "Ticket-Panels mit Buttons, Support-Rollen und ihrem Kanal", "Bewerbungsformulare mit ihren Fragen", "Ticket-Analysen — Heatmap, Team-Rangliste und Bewerbungs-Funnel", "Premium-Plan und Abrechnung über Discord"] },
  },
  es: {
    tour: { heading: "El panel, de verdad.", sub: "Nada de maquetas: capturas reales del panel actual, con datos de demostración.", labels: ["Resumen", "Tickets", "Paneles", "Formularios", "Analítica", "Premium"], alts: ["Resumen del servidor — estadísticas, tickets abiertos y estado del sistema", "Lista de tickets con estados, responsables y valoraciones", "Paneles de tickets con botones, roles de soporte y su canal", "Formularios de solicitud con sus preguntas", "Analítica de tickets — mapa de calor, ranking del equipo y embudo de solicitudes", "Plan Premium y facturación a través de Discord"] },
  },
  fr: {
    tour: { heading: "Le tableau de bord, pour de vrai.", sub: "Pas de maquettes : de vraies captures du tableau de bord actuel, rempli de données de démo.", labels: ["Aperçu", "Tickets", "Panneaux", "Formulaires", "Analyses", "Premium"], alts: ["Aperçu du serveur — statistiques, tickets ouverts et état du système", "Liste des tickets avec statuts, responsables et notes", "Panneaux de tickets avec boutons, rôles de support et leur salon", "Formulaires de candidature et leurs questions", "Analyses des tickets — carte de chaleur, classement de l'équipe et entonnoir des candidatures", "Offre Premium et facturation via Discord"] },
  },
  it: {
    tour: { heading: "La dashboard, davvero.", sub: "Niente mockup: screenshot reali della dashboard attuale, con dati dimostrativi.", labels: ["Panoramica", "Ticket", "Pannelli", "Moduli", "Analisi", "Premium"], alts: ["Panoramica del server — statistiche, ticket aperti e stato del sistema", "Elenco dei ticket con stati, assegnatari e valutazioni", "Pannelli ticket con pulsanti, ruoli di supporto e il loro canale", "Moduli di candidatura con le loro domande", "Analisi dei ticket — heatmap, classifica dello staff e funnel delle candidature", "Piano Premium e fatturazione tramite Discord"] },
  },
  nl: {
    tour: { heading: "Het dashboard, echt.", sub: "Geen mock-ups — echte screenshots van het huidige dashboard, gevuld met demodata.", labels: ["Overzicht", "Tickets", "Panelen", "Formulieren", "Analyses", "Premium"], alts: ["Serveroverzicht — statistieken, open tickets en systeemstatus", "Ticketlijst met statussen, behandelaars en beoordelingen", "Ticketpanelen met knoppen, supportrollen en hun kanaal", "Sollicitatieformulieren met hun vragen", "Ticketanalyses — heatmap, teamranglijst en sollicitatiefunnel", "Premium-abonnement en facturering via Discord"] },
  },
  pl: {
    tour: { heading: "Panel, naprawdę.", sub: "Żadnych makiet — prawdziwe zrzuty obecnego panelu, wypełnionego danymi demo.", labels: ["Przegląd", "Tickety", "Panele", "Formularze", "Analityka", "Premium"], alts: ["Przegląd serwera — statystyki, otwarte tickety i stan systemu", "Lista ticketów ze statusami, osobami przypisanymi i ocenami", "Panele ticketów z przyciskami, rolami wsparcia i ich kanałem", "Formularze rekrutacyjne z pytaniami", "Analityka ticketów — mapa cieplna, ranking ekipy i lejek rekrutacji", "Plan Premium i rozliczenia przez Discorda"] },
  },
};
