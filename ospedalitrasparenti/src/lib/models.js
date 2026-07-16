// @ts-check
// Споделени JSDoc типове за data моделите на продукта (segnalazioni, forensics,
// appalti, coi, validazione…). Файлът е САМО типове — няма рънтайм износ, не се
// импортира при изпълнение и не влиза в билда на сайта; служи на `@ts-check`
// анотациите в render/*.js и build-site.js чрез `import('./models.js').X`.

/** @typedef {import('./dataset.js').Ente} Ente */
/** @typedef {import('./dataset.js').SerieAnno} SerieAnno */

// ── Сигнали (data/segnalazioni.json, от analyze.js) ──────────────────────────
/**
 * @typedef {object} Segnalazione единичен счетоводен сигнал
 * @property {string} gravita 'alta' | 'media' | 'bassa'
 * @property {string} titolo кратко заглавие
 * @property {string} dettaglio обяснение с числата
 * @property {string} regola ключ на правилото
 * @property {string} [testo] алтернативен текст (за RSS)
 */
/**
 * @typedef {object} SegnEnte структура с нейните сигнали
 * @property {string} codice
 * @property {string} denominazione
 * @property {string} regione
 * @property {string} gravitaMax най-високата тежест
 * @property {Segnalazione[]} segnalazioni
 */
/**
 * @typedef {object} SegnData агрегат от analyze.js
 * @property {SegnEnte[]} enti
 * @property {number} totaleSegnalazioni
 * @property {number} entiConSegnalazioni
 * @property {{ alta: number, media: number, bassa: number }} perGravita
 * @property {Record<string, number>} perRegola
 * @property {Record<string, number>} soglie прагове на правилата
 * @property {string} [generatoIl]
 */

// ── Форензик (data/forensics.json, от forensics.js) ──────────────────────────
/**
 * @typedef {object} ForenseFlag форензик флаг „follow the money“
 * @property {string} categoria ключ на разходната категория
 * @property {string} label италиански етикет
 * @property {string} testo обяснение
 */
/**
 * @typedef {object} ForenseCatVal стойност на разходна категория
 * @property {number} valore абсолютна сума (€)
 * @property {number} quotaCosti дял от разходите [0..1]
 */
/**
 * @typedef {object} ForenseEnte форензик профил на структура
 * @property {string} codice
 * @property {string} denominazione
 * @property {string} regione
 * @property {number} anno
 * @property {ForenseFlag[]} flags
 * @property {Record<string, ForenseCatVal>} cat разбивка по категории
 * @property {string} [peer] описание на peer групата
 */
/**
 * @typedef {object} ForenseSistemaAnno системен резултат за една година
 * @property {number} aziende
 * @property {number} aziendeInUtile
 * @property {number} aziendeInPerdita
 * @property {number} risultatoAziende
 * @property {number} risultatoGSA
 * @property {number} risultatoSistema
 */
/**
 * @typedef {object} ClassificaRow ред от класация
 * @property {string} codice
 * @property {string} denominazione
 * @property {string} regione
 * @property {number} valore
 * @property {number} extra допълнителен показател (% или €/легло)
 */
/**
 * @typedef {object} ForenseData агрегат от forensics.js
 * @property {ForenseEnte[]} enti
 * @property {{ perAnno: Record<string, ForenseSistemaAnno> }} sistema
 * @property {Record<string, ClassificaRow[]>} classifiche
 */

// ── ANAC поръчки (data/appalti.json + aggiudicatari.json) ────────────────────
/**
 * @typedef {object} AppaltiCatVal агрегат по тип процедура
 * @property {number} n брой договори
 * @property {number} importo стойност (€)
 */
/**
 * @typedef {object} FornitoreRow ред за изпълнител
 * @property {string} den денонимация
 * @property {number} valore
 * @property {number} n
 * @property {boolean} [azienda] капиталово дружество ли е
 */
/**
 * @typedef {object} AggiuCf профил на изпълнителите за възложител (aggiu.perCf[cf])
 * @property {number} gareConPartecipanti
 * @property {number} gareUnicoOfferente
 * @property {number|null} quotaUnicoOfferente
 * @property {number} nFornitori
 * @property {number|null} top1Quota
 * @property {number} valoreAggiudicato
 * @property {FornitoreRow[]} topFornitori
 */
/**
 * @typedef {object} AggiudicatariData целият aggiudicatari.json
 * @property {Record<string, AggiuCf>} perCf
 * @property {FornitoreRow[]} [fornitoriNazionali]
 */
/**
 * @typedef {object} ContrattoTop топ договор (в профила на възложителя)
 * @property {string} [cig]
 * @property {string} [data]
 * @property {string} [oggetto]
 * @property {number} importo
 * @property {string} [cpv]
 * @property {string} procedura
 * @property {string} [categoria]
 */
/**
 * @typedef {object} Autorita възложител (appalti.autorita[])
 * @property {string} cf
 * @property {string} den
 * @property {string} reg
 * @property {number} importo
 * @property {number} n
 * @property {number|null} [quotaSenzaGara]
 * @property {number|null} [quotaSenzaGaraNum]
 * @property {Record<string, AppaltiCatVal>} cat
 * @property {ContrattoTop[]} [top]
 * @property {number} [band40]
 * @property {number} [band140]
 * @property {number} [prorogaN]
 * @property {AggiuCf|null} [aggiu] изпълнители (добавя се в build-site)
 */
/**
 * @typedef {object} RegionaleRow регионален агрегат (appalti.regionale[])
 * @property {string} reg
 * @property {number} n
 * @property {number} importo
 * @property {number|null} [quotaSenzaGara]
 * @property {number|null} [quotaSenzaGaraNum]
 * @property {Record<string, AppaltiCatVal>} cat
 * @property {number} [band40]
 * @property {number} [band140]
 * @property {number} [prorogaN]
 * @property {number} [urgenzaN]
 * @property {number} [pnrrImporto]
 */
/**
 * @typedef {object} AppaltiNazionale национален агрегат
 * @property {number} importo
 * @property {number} n
 * @property {number|null} [quotaSenzaGara]
 * @property {number|null} [quotaSenzaGaraNum]
 */
/**
 * @typedef {object} AppaltiData агрегат от fetch-appalti.js
 * @property {AppaltiNazionale} nazionale
 * @property {RegionaleRow[]} regionale
 * @property {Autorita[]} autorita
 * @property {number[]} anni
 */
/**
 * @typedef {object} AppMatch резултат от свързването болница↔ANAC (build-site)
 * @property {number} abbinate
 * @property {number} totali
 * @property {AggiudicatariData|null} [aggiu]
 * @property {Map<string, Autorita>} [autByCf]
 * @property {number|null} [medianaSenzaGaraNum]
 */

// ── COI (data/coi.json, от coi.js) ───────────────────────────────────────────
/**
 * @typedef {object} CoiCoppia двойка болница↔доставчик
 * @property {string} codice
 * @property {string} denominazione
 * @property {string} regione
 * @property {string} cf
 * @property {string} [fornitore]
 * @property {string[]} flags
 * @property {string} gravita
 * @property {number} n
 * @property {number} diretti
 * @property {number} valore
 * @property {number} quotaSenzaGaraN
 * @property {number} quotaFornitore
 */
/**
 * @typedef {object} CoiData агрегат от coi.js
 * @property {CoiCoppia[]} coppie
 * @property {{ conFornitore: number, coppieSegnalate: number, perFlag: Record<string, number> }} statistiche
 * @property {Record<string, number>} soglie
 * @property {number[]} anni
 * @property {number} [perimetroAziende]
 */

// ── Валидация (data/validazione.json, от validate.js) ────────────────────────
/**
 * @typedef {object} Validazione агрегат от validate.js
 * @property {{ quotaSuperata: number, superate: number, identitaVerificate: number, fallite: Array<{ codice: string, anno: number }> }} consistenzaCE
 * @property {{ conCE: number, conSP: number, conAnagrafe: number, conAppaltiANAC: number, conAggiudicatari?: number, entiTotali: number }} copertura
 * @property {Array<{ file: string, righe?: number|null, bytes: number, sha256: string }>} provenance
 * @property {{ valoreNegativo: number, costiNegativi: number, debitiNegativi: number, deficitOltreRicavi: number }} sanita
 * @property {string} generatoIl
 */

// ── Hub с отворени данни (build-site) ────────────────────────────────────────
/**
 * @typedef {object} DatasetInfo ред за страницата „Dati aperti“
 * @property {string} href
 * @property {string} fmt
 * @property {string} titolo
 * @property {string} descr
 * @property {string} licenza
 * @property {number|null} bytes
 */

// ── Реквизити (config.json) ──────────────────────────────────────────────────
/**
 * @typedef {object} Titolare реквизити на титуляря
 * @property {string} [nome]
 * @property {string} [indirizzo]
 * @property {string} [eik]
 * @property {string} [email]
 * @property {string} [telefono]
 */
/**
 * @typedef {object} Hosting хостинг разкритие
 * @property {string} [provider]
 * @property {string} [trasferimento]
 */

// ── Региони ──────────────────────────────────────────────────────────────────
/**
 * @typedef {object} RegioneMeta метаданни за регион (REGIONI[key])
 * @property {string} abbr
 * @property {string} nome
 * @property {string} istat
 * @property {string[]} prefissi
 * @property {string[]} anac
 */
/**
 * @typedef {object} RegAgg регионален финансов агрегат (build-site)
 * @property {string} key
 * @property {number} valore
 * @property {number} risultato
 * @property {number} nInPerdita
 * @property {number} conCe
 * @property {Ente[]} enti
 */
/**
 * @typedef {object} RegioniDataRow ред за индекса/картата на регионите
 * @property {string} key
 * @property {string} istat
 * @property {string} abbr
 * @property {string} nome
 * @property {number|null} senzaGaraPct
 * @property {number} nEnti
 * @property {number} valore
 * @property {number} risultato
 * @property {number} appN
 */
/**
 * @typedef {object} RegCtx регионален контекст за профила на болница
 * @property {string} nome
 * @property {string|null} href
 * @property {number|null} tacPerMln
 * @property {number|null} robot
 * @property {number|null} ricoveriPer1000
 * @property {number|null} siopeDic
 * @property {number|null} pnrrProCapite
 */

export {};
