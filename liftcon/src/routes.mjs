// Всички пътища на сайта на едно място — шаблоните и съдържанието ги ползват оттук,
// а тестът проверява, че всяка вътрешна връзка води до генерирана страница.

export const R = Object.freeze({
  home: "/",
  servizi: "/servizi/",
  sopralluogo: "/servizi/sopralluogo-tecnico-ascensore/",
  controllo: "/servizi/controllo-qualita-lavori-ascensore/",
  preventivi: "/servizi/analisi-preventivi-ascensore/",
  supporto: "/servizi/supporto-tecnico-committente/",
  verifica: "/servizi/preparazione-verifica-straordinaria/",
  relazioni: "/servizi/relazioni-tecniche-report-fotografici/",
  amministratori: "/amministratori-di-condominio/",
  proprietari: "/proprietari-e-privati/",
  lombardia: "/consulenza-ascensori-lombardia/",
  milano: "/consulenza-ascensori-milano/",
  provMilano: "/consulenza-ascensori-provincia-milano/",
  guide: "/guide/",
  glossario: "/glossario/",
  faq: "/domande-frequenti/",
  metodo: "/metodo/",
  chiSiamo: "/chi-siamo/",
  contatti: "/contatti/",
  grazie: "/contatti/grazie/",
  privacy: "/privacy/",
  cookie: "/cookie/",
  noteLegali: "/note-legali/",
  feed: "/guide/feed.xml",
});

/** Пътят на ръководство по slug. */
export const guida = (slug) => `/guide/${slug}/`;
