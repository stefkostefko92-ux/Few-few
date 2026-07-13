// „Конфликт на интереси" — индикатори на ниво ДВОЙКА болница↔доставчик.
// От отворените данни НЕ може да се докаже конфликт (нужни са собственици/
// управители от Registro Imprese — платен). Може обаче да се открият правно
// обоснованите ПОВЪРХНОСТНИ сигнали, които насочват проверката:
//
//  1. rotazione   — повтарящи се ПРЕКИ възлагания към същия доставчик от същия
//                   възложител: принципът на ротация (чл. 49, d.lgs. 36/2023)
//                   ги ограничава изрично.
//  2. dipendenza  — доставчик, чийто приход идва почти изцяло от ЕДНА болница,
//                   при предимно „senza gara" отношения (взаимна зависимост).
//  3. esclusiva   — трайна връзка без конкуренция: много договори, почти
//                   всичките без търг.
//
// GDPR: работи само с fornitoreCf (11-цифрен P.IVA на юридическо лице) —
// физическите лица нямат fornitoreCf и са изключени по конструкция.
//
// Изход: data/coi.json. Формулировките са „indicatore, non prova".

import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { readJson, writeJson } from './lib/http.js';
import { DATA_DIR } from './lib/paths.js';
import { loadDataset } from './lib/dataset.js';

const CONTRATTI_DIR = join(DATA_DIR, 'contratti');

export const SOGLIE_COI = {
  rotazioneDiretti: 5, // ≥5 преки възлагания към същия доставчик
  rotazioneValore: 100_000, // и общо ≥100k € от преки
  dipendenzaValoreForn: 500_000, // доставчикът е материален (≥500k общо)
  dipendenzaQuota: 0.85, // ≥85% от прихода му е от една болница
  dipendenzaSenzaGara: 0.7, // и двойката е ≥70% без търг (по брой)
  esclusivaN: 10, // ≥10 договора в двойката
  esclusivaSenzaGara: 0.9, // ≥90% от тях без търг
};

// Много „affidamento diretto" всъщност са присъединявания към национално
// състезавани конвенции (Consip/централи за покупки), записани небрежно —
// личи от предмета. Те НЕ са „без конкуренция" и не бива да вдигат флагове.
// Покрива и регионалните централи/агрегатори (не само националния Consip):
// APPALTO SPECIFICO (call-off под състезаван accordo quadro), Azienda Zero,
// Intercent-ER, Estar, SoReSa, SCR Piemonte, ARIA, soggetto aggregatore.
export const RE_CONVENZIONE = /ADESION\w*[\s\S]{0,40}CONVENZION|CONVENZION\w*\s+CONSIP|CONSIP|APPALTO\s+SPECIFICO|ACCORDO[\s-]+QUADRO|CENTRALE\s+DI\s+COMMITTENZA|SOGGETTO\s+AGGREGATORE|AZIENDA\s+ZERO|INTERCENT|\bESTAR\b|\bSO\.?RE\.?SA\b|\bS\.?C\.?R\.?\s+PIEMONTE|\bARIA\s+S\.?P\.?A\b/i;

// ПРАВЕН ФИЛТЪР (одит на Правния Разбирач): 11-цифров P.IVA НЕ гарантира
// юридическо лице — ditta individuale/azienda agricola/либерални професии също
// са с 11 цифри, а SNC/SAS вграждат личните имена на съдружниците в името.
// В контекст „конфликт на интереси" назоваваме САМО капиталови/кооперативни
// дружества (allowlist), никога субекти с лични имена по конструкция.
const RE_FORMA_PERSONALE = /\bS\.?\s?N\.?\s?C\b|\bS\.?\s?A\.?\s?S\b|DITTA\s+INDIVIDUALE|AZIENDA\s+AGRICOLA|IMPRESA\s+INDIVIDUALE/i;
const RE_FORMA_CAPITALE = /\bS\.?\s?P\.?\s?A\b|\bS\.?\s?R\.?\s?L\b|S\.?C\.?\s?A\s?R\.?\s?L|SOCIET[AÀ']{1,2}\s+(PER\s+AZIONI|A\s+RESPONSABILIT|COOPERATIVA|CONSORTILE|BENEFIT)|COOPERATIVA|CONSORZIO|\bCOOP\b|FONDAZIONE|\bGMBH\b|\bLTD\b|\bLIMITED\b|\bINC\b|\bCORP\b|\bB\.?V\b|\bN\.?V\b|\bA\.?G\b/i;
export function eSocietaDiCapitali(nome) {
  const n = nome || '';
  if (!n.trim()) return false;
  if (/^IMPRESA\s+INESISTENTE$/i.test(n.trim())) return false; // sentinel на ANAC, не реален субект
  if (/AZIENDA\s+(SANITARIA|OSPEDALIER|SOCIO\s*SANITARIA)|A\.?\s?S\.?\s?L\b|A\.?\s?U\.?\s?S\.?\s?L\b/i.test(n)) return false; // публичен орган като „доставчик" — артефакт
  if (RE_FORMA_PERSONALE.test(n)) return false;
  return RE_FORMA_CAPITALE.test(n);
}

/**
 * Чист, тестваем анализ: списък договори (с полета codice, fornitoreCf,
 * fornitore, importo, categoria, oggetto) → двойки с флагове.
 */
export function analizzaCoppie(contratti, soglie = SOGLIE_COI) {
  const coppie = new Map(); // codice|cf → агрегат
  const perForn = new Map(); // cf → общ приход на доставчика (за dipendenza)
  for (const c of contratti) {
    if (!c.fornitoreCf) continue; // изключва личните CF (16 знака) по конструкция
    if (!eSocietaDiCapitali(c.fornitore)) continue; // само капиталови/кооп. форми (правен одит)
    if (!(c.importo > 0)) continue; // икономически нулеви записи не бива да броят към праговете
    const convenzione = RE_CONVENZIONE.test(c.oggetto || '');
    const senza = !convenzione && (c.categoria === 'diretto' || c.categoria === 'negoziataSenza');
    const k = `${c.codice}|${c.fornitoreCf}`;
    let g = coppie.get(k);
    if (!g) {
      g = { codice: c.codice, cf: c.fornitoreCf, fornitore: c.fornitore, n: 0, valore: 0, senzaGaraN: 0, diretti: 0, valoreDiretti: 0 };
      coppie.set(k, g);
    }
    g.n++;
    g.valore += c.importo;
    if (senza) g.senzaGaraN++;
    if (c.categoria === 'diretto' && !convenzione) {
      g.diretti++;
      g.valoreDiretti += c.importo;
    }
    perForn.set(c.fornitoreCf, (perForn.get(c.fornitoreCf) || 0) + c.importo);
  }
  const out = [];
  for (const g of coppie.values()) {
    const totForn = perForn.get(g.cf) || g.valore;
    const quotaFornitore = totForn > 0 ? g.valore / totForn : 0;
    const quotaSenzaGaraN = g.n > 0 ? g.senzaGaraN / g.n : 0;
    const flags = [];
    if (g.diretti >= soglie.rotazioneDiretti && g.valoreDiretti >= soglie.rotazioneValore) flags.push('rotazione');
    if (totForn >= soglie.dipendenzaValoreForn && quotaFornitore >= soglie.dipendenzaQuota && quotaSenzaGaraN >= soglie.dipendenzaSenzaGara) flags.push('dipendenza');
    if (g.n >= soglie.esclusivaN && quotaSenzaGaraN >= soglie.esclusivaSenzaGara) flags.push('esclusiva');
    if (!flags.length) continue;
    // тежест: колкото повече сигнали и по-голяма стойност, толкова по-високо
    const gravita = flags.length >= 2 || g.diretti >= 2 * soglie.rotazioneDiretti ? 'alta' : 'media';
    out.push({ ...g, quotaFornitore, quotaSenzaGaraN, totFornitore: totForn, flags, gravita });
  }
  // подредба: тежест → стойност
  out.sort((a, b) => (a.gravita === b.gravita ? b.valore - a.valore : a.gravita === 'alta' ? -1 : 1));
  return out;
}

async function main() {
  const { enti } = await loadDataset();
  const byCod = new Map(enti.map((e) => [e.codice, e]));
  const files = (await readdir(CONTRATTI_DIR)).filter((f) => f.endsWith('.json'));
  const contratti = [];
  for (const f of files) {
    const codice = f.replace('.json', '');
    for (const c of JSON.parse(await readFile(join(CONTRATTI_DIR, f), 'utf8'))) contratti.push({ ...c, codice });
  }
  console.log(`Заредени ${contratti.length} договора от ${files.length} болници. Анализ на двойките…`);
  const coppie = analizzaCoppie(contratti).map((g) => {
    const e = byCod.get(g.codice);
    return { ...g, denominazione: e ? e.denominazione : g.codice, regione: e ? e.regione : '' };
  });
  const config = await readJson(join(DATA_DIR, '..', 'config.json')).catch(() => ({}));
  await writeJson(join(DATA_DIR, 'coi.json'), {
    generatoIl: new Date().toISOString(),
    anni: config.anacAnni || [2023, 2024],
    // периметърът на quotaFornitore = броят болници с опис (НЕ хардкодвай в текстовете)
    perimetroAziende: files.length,
    soglie: SOGLIE_COI,
    nota: 'Indicatori di rischio nelle relazioni contrattuali ricorrenti (rotazione, dipendenza, esclusività). NON sono prova di conflitto di interessi: la verifica richiede i dati societari (Registro Imprese) e gli incarichi dei dirigenti (Amministrazione Trasparente). quotaFornitore è calcolata sul fatturato del fornitore TRACCIATO in questo dataset (le aziende sanitarie collegate), non sull’intero SSN.',
    statistiche: {
      contratti: contratti.length,
      conFornitore: contratti.filter((c) => c.fornitoreCf).length,
      coppieSegnalate: coppie.length,
      perFlag: {
        rotazione: coppie.filter((c) => c.flags.includes('rotazione')).length,
        dipendenza: coppie.filter((c) => c.flags.includes('dipendenza')).length,
        esclusiva: coppie.filter((c) => c.flags.includes('esclusiva')).length,
      },
    },
    coppie,
  });
  console.log(`Готово: ${coppie.length} сигнализирани двойки → data/coi.json (rotazione ${coppie.filter((c) => c.flags.includes('rotazione')).length}, dipendenza ${coppie.filter((c) => c.flags.includes('dipendenza')).length}, esclusiva ${coppie.filter((c) => c.flags.includes('esclusiva')).length})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
