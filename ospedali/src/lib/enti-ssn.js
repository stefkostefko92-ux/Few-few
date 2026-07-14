// @ts-check
// Единствен източник за филтъра „здравни възложители“ (SSN) — денонимационни
// regex-и, споделени от fetch-appalti.js, storico.js и fetch-perlapa.js.
//
// ВАЖНО: тези два regex-а са ЗАМРАЗЕНИ. Промяна на кои имена матчват би сменила
// launch данните (data/appalti.json, storico.json, consulenze.json). Не пипай
// без причина. NOT_HEALTH изключва ИНПС/ИНАИЛ/previdenza (иначе „ISTITUTO
// NAZIONALE“ ги улавя като здравни); INMP (мигрантско здраве) остава здравен.

// Здравни възложители (по денонимация). Прецизно включване + стеснена FONDAZIONE,
// за да хванем всички регионални варианти (ATS, ARES, APSS, Sanitätsbetrieb, USL…)
// без да вмъкваме нездравни субекти (ACER, Sport e Salute, ISS…).
export const HEALTH =
  /AZIENDA (OSPEDALIER|SANITARIA|SOCIO|UNITA|USL|ULSS|PROVINCIALE PER I SERVIZI SANITARI|REGIONALE DELLA SALUTE|LIGURE SANITARIA)|OSPEDALIER|OSPEDALI RIUN|A\.?O\.?U|\bA\.?S\.?L\b|\bA\.?S\.?S\.?T\b|\bA\.?U\.?L\.?S\.?S\b|\bASUR\b|\bASUGI\b|\bASUFC\b|\bAPSS\b|IRCCS|POLICLINICO|ISTITUTO (ONCOLOGICO|NAZIONALE|ORTOPEDICO|TUMORI|NEUROLOGICO)|FONDAZIONE\s+(IRCCS|POLICLINICO|OSPEDAL|ISTITUTO)|ESTAR|ESTAV|SORESA|AZIENDA ZERO|EGAS|ARNAS|ENTE OSPEDALIERO|AGENZIA (DI )?TUTELA DELLA SALUTE|AGENZIA REGIONALE STRATEGICA PER LA SALUTE|A\.?RE\.?S\.?S|\bUNITA'? SANITARIA LOCALE\b|SANITAETSBETRIEB|EMERGENZA SANITARIA|\bAREU\b|\bA\.?LI\.?SA\b|AZIENDA REGIONALE PER LA SALUTE/;
// Изрично изключване на нездравни субекти, случайно уловени от общи думи.
export const NOT_HEALTH = /ACQUE|SPORT E SALUTE|ISTITUTO SUPERIORE DI SANIT|\bMINISTERO\b|CARABINIER|\bCOMUNE\b|\bUNIONE\b|BONIFICA|AZIENDA CASA|\bA\.?C\.?E\.?R\b|\bSTART\b|INFORMATICA|VIGILI DEL FUOCO|SOCIETA DELLE FONTI|INPS|INAIL|PREVIDENZA|ASSICURAZIONE CONTRO GLI INFORTUNI|ISTITUTO NAZIONALE PER LA GRAFICA|I\.N\.P\.G\.I|FISICA NUCLEARE|ASTROFISICA|GEOFISICA|VULCANOLOGIA|\bISTAT\b|DOCUMENTAZIONE, INNOVAZIONE|VALUTAZIONE DEL SISTEMA EDUCATIVO|RICERCHE TURISTICHE|ALTA MATEMATICA|ISTITUTO TECNICO SUPERIORE|DRAMMA ANTICO/;

/**
 * Здравна структура ли е даден възложител? Общата логика на трите пайплайна:
 * име → UPPERCASE → HEALTH матчва И NOT_HEALTH не матчва.
 * Regex-ите нямат флаг `g` → `.test()` е без състояние, безопасно е да се споделят.
 * @param {string|null|undefined} nome
 * @returns {boolean}
 */
export function eEnteSanitario(nome) {
  const u = String(nome || '').toUpperCase();
  return HEALTH.test(u) && !NOT_HEALTH.test(u);
}
