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
