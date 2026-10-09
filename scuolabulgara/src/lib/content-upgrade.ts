// Upgrading content saved under an older version of the site.
//
// Stored values win over the defaults — that is what makes the admin work. The
// flip side: rows seeded before a redesign keep the OLD wording forever, even
// though nobody ever edited them. So, once per process, each stored field that
// still holds exactly an old default is moved to the new default; anything an
// editor changed is kept, only converted to the new shape. Idempotent.

/** Old default values, per section → field → language (generated from the
 *  previous defaults.ts; only fields whose default changed). */
const OLD_DEFAULTS: Record<string, Record<string, Record<string, unknown>>> = {
  "settings": {
    "brandSub": {
      "it": "Scuola bulgara · Milano",
      "bg": "Българско училище · Милано",
      "en": "Bulgarian school · Milan"
    }
  },
  "hero": {
    "badge": {
      "it": "Centro linguistico e culturale dal 2014",
      "bg": "Лингвистичен и културен център от 2014 г.",
      "en": "Language & cultural centre since 2014"
    },
    "highlights": {
      "it": [
        {
          "icon": "presence",
          "text": "In presenza"
        },
        {
          "icon": "shield-check",
          "text": "Qualità riconosciuta"
        },
        {
          "icon": "adults",
          "text": "Dialogo e condivisione"
        },
        {
          "icon": "location-pin",
          "text": "Milano · Lombardia"
        }
      ],
      "bg": [
        {
          "icon": "presence",
          "text": "Присъствено"
        },
        {
          "icon": "shield-check",
          "text": "Признато качество"
        },
        {
          "icon": "adults",
          "text": "Диалог и споделяне"
        },
        {
          "icon": "location-pin",
          "text": "Милано · Ломбардия"
        }
      ],
      "en": [
        {
          "icon": "presence",
          "text": "In person"
        },
        {
          "icon": "shield-check",
          "text": "Recognised quality"
        },
        {
          "icon": "adults",
          "text": "Dialogue and sharing"
        },
        {
          "icon": "location-pin",
          "text": "Milan · Lombardy"
        }
      ]
    }
  },
  "about": {
    "features": {
      "it": [
        {
          "icon": "hybrid",
          "title": "Identità e radici",
          "text": "Ci ispiriamo alla ricchezza della tradizione, della lingua e delle danze popolari come strumenti di identità."
        },
        {
          "icon": "distance",
          "title": "Dialogo e condivisione",
          "text": "Uniamo le persone che amano la cultura bulgara in una comunità sana e positiva in cui crescere."
        },
        {
          "icon": "culture",
          "title": "Qualità riconosciuta",
          "text": "Operiamo secondo libri di testo e programmi approvati dal Ministero, con diplomi riconosciuti in Bulgaria."
        }
      ],
      "bg": [
        {
          "icon": "hybrid",
          "title": "Идентичност и корени",
          "text": "Вдъхновяваме се от богатството на традицията, езика и народните танци като средство за идентичност."
        },
        {
          "icon": "distance",
          "title": "Диалог и споделяне",
          "text": "Обединяваме хората, които обичат българската култура, в здрава и позитивна общност, в която да растем."
        },
        {
          "icon": "culture",
          "title": "Признато качество",
          "text": "Работим по учебници и програми, одобрени от Министерството, с дипломи, признати в България."
        }
      ],
      "en": [
        {
          "icon": "hybrid",
          "title": "Identity and roots",
          "text": "We draw on the richness of tradition, language and folk dance as tools of identity."
        },
        {
          "icon": "distance",
          "title": "Dialogue and sharing",
          "text": "We bring together people who love Bulgarian culture in a healthy, positive community to grow in."
        },
        {
          "icon": "culture",
          "title": "Recognised quality",
          "text": "We follow textbooks and programmes approved by the Ministry, with diplomas recognised in Bulgaria."
        }
      ]
    }
  },
  "school": {
    "quoteCite": {
      "it": "— Il corpo insegnante della scuola «P. Yavorov»",
      "bg": "— Преподавателският екип на училище „П. Яворов“",
      "en": "— The teaching staff of the “P. Yavorov” school"
    }
  },
  "dance": {
    "schedule": {
      "it": [
        {
          "day": "DOM",
          "time": "10–12",
          "title": "Domenica · 10:00–12:00",
          "place": "Vicino a Piazzale Corvetto, Milano · segue il calendario scolastico"
        },
        {
          "day": "GIO",
          "time": "20:30",
          "title": "Giovedì · 20:30–22:30",
          "place": "Zona Rho (Milano)"
        }
      ],
      "bg": [
        {
          "day": "НЕД",
          "time": "10–12",
          "title": "Неделя · 10:00–12:00",
          "place": "До Пиазале Корвето, Милано · следва учебния календар"
        },
        {
          "day": "ЧЕТ",
          "time": "20:30",
          "title": "Четвъртък · 20:30–22:30",
          "place": "Зона Rho (Милано)"
        }
      ],
      "en": [
        {
          "day": "SUN",
          "time": "10–12",
          "title": "Sunday · 10:00–12:00",
          "place": "Near Piazzale Corvetto, Milan · follows the school calendar"
        },
        {
          "day": "THU",
          "time": "20:30",
          "title": "Thursday · 20:30–22:30",
          "place": "Rho area (Milan)"
        }
      ]
    },
    "instructorRole": {
      "it": "Ballerino e coreografo, diplomato alla Scuola Nazionale di Danza e Balletto bulgara · a Milano dal 2013",
      "bg": "Танцьор и хореограф, завършил Националното училище за танцово и балетно изкуство в България · в Милано от 2013 г.",
      "en": "Dancer and choreographer, trained at the Bulgarian National School of Dance and Ballet · in Milan since 2013"
    }
  },
  // Google Maps (with consent) joined Facebook in the cookie notice and the
  // policies; the map pin moved from the city centre to the school's street.
  "ui": {
    "cookie.text": {
      "it": "Usiamo cookie tecnici e, solo con il tuo consenso, il plugin di Facebook.",
      "bg": "Използваме технически бисквитки и — само с ваше съгласие — плъгина на Facebook.",
      "en": "We use technical cookies and, only with your consent, the Facebook plugin."
    }
  },
  "org": {
    "latitude": {
      "it": "45.4642",
      "bg": "45.4642",
      "en": "45.4642"
    },
    "longitude": {
      "it": "9.1900",
      "bg": "9.1900",
      "en": "9.1900"
    }
  },
  "legal_privacy": {
    "sections": {
      "it": [
        {
          "h": "Titolare del trattamento",
          "p": [
            "Associazione Qui Bulgaria, Via Giovanni Battista Piazzetta, 20138 Milano (MI), Italia. Email: centroquibulgaria@gmail.com."
          ],
          "list": []
        },
        {
          "h": "Dati che raccogliamo",
          "p": [],
          "list": [
            "Dati forniti volontariamente tramite il modulo di contatto: nome e cognome, email, oggetto della richiesta e messaggio.",
            "Dati tecnici di navigazione (es. indirizzo IP, data e ora, pagine visitate) raccolti dai sistemi e dal provider di hosting per finalità di sicurezza e funzionamento."
          ]
        },
        {
          "h": "Finalità e base giuridica",
          "p": [],
          "list": [
            "Rispondere alle richieste e fornire informazioni su corsi e attività — esecuzione di misure precontrattuali su richiesta dell’interessato e legittimo interesse a riscontrare i messaggi (art. 6.1.b e 6.1.f GDPR).",
            "Garantire sicurezza, integrità e corretto funzionamento del sito — legittimo interesse (art. 6.1.f GDPR)."
          ]
        },
        {
          "h": "Conservazione dei dati",
          "p": [
            "I dati del modulo sono conservati per il tempo necessario a gestire la richiesta e gli eventuali adempimenti conseguenti. I log tecnici sono conservati per periodi limitati e proporzionati alle finalità di sicurezza."
          ],
          "list": []
        },
        {
          "h": "Comunicazione dei dati",
          "p": [
            "I dati non sono venduti né diffusi. Possono essere trattati, per nostro conto, da fornitori tecnici nominati responsabili del trattamento: il provider di hosting (server in UE) e il servizio di posta elettronica/SMTP usato per ricevere e inoltrare i messaggi del modulo; se tale casella è fornita da un operatore con sede negli USA (es. Google LLC), l’eventuale trasferimento avviene sulla base del EU-US Data Privacy Framework e/o di clausole contrattuali standard. Il plugin di Facebook viene caricato solo previo consenso e comporta un trattamento da parte di Meta Platforms Ireland Ltd. (e Meta Platforms, Inc. negli USA) secondo la sua informativa; l’eventuale trasferimento negli Stati Uniti avviene sulla base del EU-US Data Privacy Framework e/o di clausole contrattuali standard."
          ],
          "list": []
        },
        {
          "h": "Diritti dell’interessato",
          "p": [
            "Puoi esercitare i diritti di accesso, rettifica, cancellazione, limitazione, opposizione e portabilità scrivendo a centroquibulgaria@gmail.com. Hai inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali."
          ],
          "list": []
        },
        {
          "h": "Minori",
          "p": [
            "I corsi rivolti ai bambini sono gestiti con il coinvolgimento e il consenso dei genitori o di chi ne esercita la responsabilità genitoriale."
          ],
          "list": []
        },
        {
          "h": "Modifiche",
          "p": [
            "Ci riserviamo di aggiornare la presente informativa. Le modifiche saranno pubblicate su questa pagina con la relativa data."
          ],
          "list": []
        }
      ],
      "bg": [
        {
          "h": "Администратор на данните",
          "p": [
            "Associazione Qui Bulgaria, Via Giovanni Battista Piazzetta, 20138 Milano (MI), Italia. Имейл: centroquibulgaria@gmail.com."
          ],
          "list": []
        },
        {
          "h": "Какви данни събираме",
          "p": [],
          "list": [
            "Данни, предоставени доброволно чрез формата за контакт: име и фамилия, имейл, тема и съобщение.",
            "Технически данни за навигацията (напр. IP адрес, дата и час, посетени страници), събирани от системите и хостинг доставчика за целите на сигурността и функционирането."
          ]
        },
        {
          "h": "Цели и правно основание",
          "p": [],
          "list": [
            "Да отговаряме на запитвания и да предоставяме информация за курсове и дейности — преддоговорни мерки по искане на субекта и легитимен интерес да отговорим на съобщенията (чл. 6.1.b и 6.1.f GDPR).",
            "Да гарантираме сигурността и правилното функциониране на сайта — легитимен интерес (чл. 6.1.f GDPR)."
          ]
        },
        {
          "h": "Срок на съхранение",
          "p": [
            "Данните от формата се съхраняват за времето, необходимо за обработка на запитването и свързаните задължения. Техническите логове се пазят за ограничени периоди, пропорционални на целите за сигурност."
          ],
          "list": []
        },
        {
          "h": "Предоставяне на данни",
          "p": [
            "Данните не се продават и не се разпространяват. Могат да се обработват от наше име от технически доставчици в качеството им на обработващи: хостинг доставчикът (сървъри в ЕС) и услугата за електронна поща/SMTP, чрез която получаваме и препращаме съобщенията от формата; ако тази пощенска кутия се предоставя от оператор със седалище в САЩ (напр. Google LLC), евентуалното предаване се основава на Рамката ЕС–САЩ за поверителност на данните и/или на стандартни договорни клаузи. Плъгинът на Facebook се зарежда само след съгласие и води до обработка от страна на Meta Platforms Ireland Ltd. (и Meta Platforms, Inc. в САЩ) съгласно нейната политика; евентуалното предаване към САЩ се основава на Рамката ЕС–САЩ за поверителност на данните (EU-US Data Privacy Framework) и/или на стандартни договорни клаузи."
          ],
          "list": []
        },
        {
          "h": "Права на субекта на данни",
          "p": [
            "Можете да упражните правата си на достъп, коригиране, изтриване, ограничаване, възражение и преносимост, като пишете на centroquibulgaria@gmail.com. Имате право и да подадете жалба до надзорния орган за защита на личните данни."
          ],
          "list": []
        },
        {
          "h": "Непълнолетни",
          "p": [
            "Курсовете за деца се организират с участието и съгласието на родителите или настойниците."
          ],
          "list": []
        },
        {
          "h": "Промени",
          "p": [
            "Запазваме си правото да актуализираме тази политика. Промените се публикуват на тази страница с посочена дата."
          ],
          "list": []
        }
      ],
      "en": [
        {
          "h": "Data controller",
          "p": [
            "Associazione Qui Bulgaria, Via Giovanni Battista Piazzetta, 20138 Milano (MI), Italia. Email: centroquibulgaria@gmail.com."
          ],
          "list": []
        },
        {
          "h": "Data we collect",
          "p": [],
          "list": [
            "Data you provide voluntarily through the contact form: full name, email, subject and message.",
            "Technical browsing data (e.g. IP address, date and time, pages visited) collected by our systems and hosting provider for security and operational purposes."
          ]
        },
        {
          "h": "Purposes and legal basis",
          "p": [],
          "list": [
            "To answer enquiries and provide information about courses and activities — pre-contractual measures at your request and our legitimate interest in replying to messages (Art. 6.1.b and 6.1.f GDPR).",
            "To ensure the security and proper functioning of the site — legitimate interest (Art. 6.1.f GDPR)."
          ]
        },
        {
          "h": "Data retention",
          "p": [
            "Form data is kept for as long as necessary to handle the request and any related obligations. Technical logs are kept for limited periods proportionate to security purposes."
          ],
          "list": []
        },
        {
          "h": "Disclosure of data",
          "p": [
            "Data is never sold or disclosed. It may be processed on our behalf by technical providers acting as processors: the hosting provider (servers in the EU) and the email/SMTP service used to receive and forward contact-form messages; where that mailbox is provided by a US-based operator (e.g. Google LLC), any transfer relies on the EU-US Data Privacy Framework and/or standard contractual clauses. The Facebook plugin loads only after consent and entails processing by Meta Platforms Ireland Ltd. (and Meta Platforms, Inc. in the USA) under its own policy; any transfer to the United States relies on the EU-US Data Privacy Framework and/or standard contractual clauses."
          ],
          "list": []
        },
        {
          "h": "Your rights",
          "p": [
            "You may exercise your rights of access, rectification, erasure, restriction, objection and portability by writing to centroquibulgaria@gmail.com. You also have the right to lodge a complaint with the competent data protection authority."
          ],
          "list": []
        },
        {
          "h": "Minors",
          "p": [
            "Courses for children are managed with the involvement and consent of parents or legal guardians."
          ],
          "list": []
        },
        {
          "h": "Changes",
          "p": [
            "We may update this policy. Changes will be published on this page with the relevant date."
          ],
          "list": []
        }
      ]
    },
    "updated": {
      "it": "25/06/2026",
      "bg": "25/06/2026",
      "en": "25/06/2026"
    }
  },
  "legal_cookie": {
    "sections": {
      "it": [
        {
          "h": "Cosa sono i cookie",
          "p": [
            "I cookie sono piccoli file di testo che i siti salvano sul dispositivo per memorizzare informazioni, ad esempio le preferenze dell’utente."
          ],
          "list": []
        },
        {
          "h": "Cookie tecnici che usiamo",
          "p": [],
          "list": [
            "qb_lang — memorizza la lingua scelta (funzionale).",
            "qb_admin — sessione di accesso, solo per gli amministratori del sito.",
            "qb-cookie-ack e qb-fb-consent — salvano le tue scelte (avviso cookie e consenso Facebook); sono memorizzati nel browser (localStorage)."
          ]
        },
        {
          "h": "Cookie di terze parti",
          "p": [
            "Il plugin della pagina Facebook viene caricato solo dopo il tuo consenso esplicito e può impostare cookie di Meta Platforms, secondo l’informativa di Facebook."
          ],
          "list": []
        },
        {
          "h": "Nessuna profilazione",
          "p": [
            "Non utilizziamo cookie pubblicitari né strumenti di analisi con profilazione dell’utente."
          ],
          "list": []
        },
        {
          "h": "Gestione dei cookie",
          "p": [
            "Puoi bloccare o eliminare i cookie dalle impostazioni del browser. La disattivazione dei cookie tecnici può limitare alcune funzioni, come il ricordo della lingua."
          ],
          "list": []
        },
        {
          "h": "Aggiornamenti",
          "p": [
            "Questa pagina può essere aggiornata; la data di revisione è indicata in alto."
          ],
          "list": []
        }
      ],
      "bg": [
        {
          "h": "Какво представляват бисквитките",
          "p": [
            "Бисквитките са малки текстови файлове, които сайтовете запазват на устройството, за да съхраняват информация, например предпочитанията на потребителя."
          ],
          "list": []
        },
        {
          "h": "Технически бисквитки, които използваме",
          "p": [],
          "list": [
            "qb_lang — запазва избрания език (функционална).",
            "qb_admin — сесия за вход, само за администраторите на сайта.",
            "qb-cookie-ack и qb-fb-consent — запазват вашия избор (известие за бисквитки и съгласие за Facebook); съхраняват се в браузъра (localStorage)."
          ]
        },
        {
          "h": "Бисквитки на трети страни",
          "p": [
            "Плъгинът на страницата във Facebook се зарежда само след вашето изрично съгласие и може да зададе бисквитки на Meta Platforms съгласно политиката на Facebook."
          ],
          "list": []
        },
        {
          "h": "Без профилиране",
          "p": [
            "Не използваме рекламни бисквитки, нито аналитични инструменти с профилиране на потребителя."
          ],
          "list": []
        },
        {
          "h": "Управление на бисквитките",
          "p": [
            "Можете да блокирате или изтриете бисквитките от настройките на браузъра. Изключването на техническите бисквитки може да ограничи някои функции, като запомнянето на езика."
          ],
          "list": []
        },
        {
          "h": "Актуализации",
          "p": [
            "Тази страница може да бъде актуализирана; датата на ревизия е посочена най-горе."
          ],
          "list": []
        }
      ],
      "en": [
        {
          "h": "What cookies are",
          "p": [
            "Cookies are small text files that websites store on your device to remember information, such as user preferences."
          ],
          "list": []
        },
        {
          "h": "Technical cookies we use",
          "p": [],
          "list": [
            "qb_lang — stores your chosen language (functional).",
            "qb_admin — login session, only for site administrators.",
            "qb-cookie-ack and qb-fb-consent — store your choices (cookie notice and Facebook consent); kept in your browser (localStorage)."
          ]
        },
        {
          "h": "Third-party cookies",
          "p": [
            "The Facebook page plugin loads only after your explicit consent and may set cookies from Meta Platforms, in accordance with Facebook’s policy."
          ],
          "list": []
        },
        {
          "h": "No profiling",
          "p": [
            "We do not use advertising cookies or analytics tools that profile users."
          ],
          "list": []
        },
        {
          "h": "Managing cookies",
          "p": [
            "You can block or delete cookies from your browser settings. Disabling technical cookies may limit some features, such as remembering your language."
          ],
          "list": []
        },
        {
          "h": "Updates",
          "p": [
            "This page may be updated; the revision date is shown at the top."
          ],
          "list": []
        }
      ]
    },
    "updated": {
      "it": "25/06/2026",
      "bg": "25/06/2026",
      "en": "25/06/2026"
    }
  }
};

type Obj = Record<string, unknown>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function upgradeStored(key: string, locale: string, stored: unknown, def: Obj): { value: unknown; changed: boolean } {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { value: stored, changed: false };
  const s: Obj = { ...(stored as Obj) };
  let changed = false;

  // 1. untouched old defaults → new defaults
  for (const [field, byLocale] of Object.entries(OLD_DEFAULTS[key] ?? {})) {
    if (locale in byLocale && same(s[field], byLocale[locale]) && field in def) {
      s[field] = def[field];
      changed = true;
    }
  }

  // 2. edited content, new shape
  if (key === "hero" && typeof s.title !== "string" && typeof s.titleA === "string") {
    // the headline was three fields (start, accent word, end); it is one now
    const part = (v: unknown) => (typeof v === "string" ? v : "");
    s.title = `${part(s.titleA)}${part(s.titleAccent)}${part(s.titleB)}`.replace(/\s+/g, " ").trim();
    changed = true;
  }
  if (key === "dance" && Array.isArray(s.schedule)) {
    // rows were {day: "DOM", time: "10–12", title: "Domenica · 10:00–12:00", place}
    const rows = (s.schedule as unknown[]).map((r) => {
      if (!r || typeof r !== "object" || typeof (r as Obj).title !== "string") return r;
      const { title, ...rest } = r as Obj & { title: string };
      const [day, time] = title.split(/\s*·\s*/);
      changed = true;
      return { ...rest, day: day || rest.day, time: time || rest.time };
    });
    s.schedule = rows;
  }
  if (key === "school" && typeof s.quoteCite === "string" && /^[—–-]\s*/.test(s.quoteCite)) {
    // the design sets the attribution mark itself now
    s.quoteCite = s.quoteCite.replace(/^[—–-]\s*/, "");
    changed = true;
  }
  return { value: s, changed };
}
