// @ts-check
// Финален SEO проход върху готовия site/ (след build-site; `npm run seo` или като
// част от `npm run site`). Идемпотентен — повторно пускане не променя нищо.
//
// Защо е отделна стъпка: sitemap-ът трябва да отразява ТОЧНО това, което е в
// site/ (само индексируеми, самоканонични страници), а не отделен списък в
// build-site, който може да се разминава. И: пълният ETL иска стотици MB сурови
// данни, които не са в git — проходът прилага политиката и върху вече генерирания
// сайт в репото, без пълен ре-билд.
//
// Какво прави:
//  1. профили на изпълнители под прага (lib/seo.js → SOGLIA_FORNITORE) → noindex;
//     шаблонното описание → уникално, с числата от KPI картите;
//  2. ключови думи (≥5, с „Carbon Stealth"), ако липсват; self-canonical, ако липсва;
//  3. еднакви <title> на различни страници → различител (код / P.IVA);
//  4. индексируемите профили, без връзка от fornitori.html → блок с връзки (без сираци);
//  5. sitemap.xml = ИНДЕКС → sitemap-pagine/strutture/fornitori.xml, с реален lastmod
//     от манифеста data/sitemap-lastmod.json (датата се мести само при промяна на
//     съдържанието в <main>), + robots.txt.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { ROOT, SITE_DIR, DATA_DIR } from './lib/paths.js';
import {
  fornitoreIndicizzabile,
  leggiKpi,
  numeroDaIt,
  keywordsPerPercorso,
  descrizioneFornitore,
  analizzaPagina,
  impronta,
  aggiornaLastmod,
  sezioneSitemap,
  urlDaPercorso,
  xmlUrlset,
  xmlIndice,
  impostaNoindex,
  impostaKeywords,
  sostituisciTitolo,
  sostituisciDescrizione,
  disambiguaTitolo,
} from './lib/seo.js';

export const MANIFEST_FILE = join(DATA_DIR, 'sitemap-lastmod.json');
const SUFFISSO = ' — Ospedali Trasparenti';
const INIZIO_BLOCCO = '<!--seo:altre-schede-->';
const FINE_BLOCCO = '<!--/seo:altre-schede-->';

/** @param {string} s @returns {string} */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** @param {string} s @returns {string} */
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * Всички .html под dir (сортирани → детерминистичен изход).
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function htmlFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out.sort();
}

/**
 * Името на субекта = първата част на <title> (без различителя „(cod. …)").
 * @param {string|null} titolo
 * @returns {string}
 */
export function nomeDaTitolo(titolo) {
  return unesc((titolo || '').split(' — ')[0].replace(/\s*\((?:cod\.|P\.IVA) [^)]*\)$/, '')).trim();
}

/**
 * Различител за еднакви заглавия: кода на структурата / P.IVA на изпълнителя.
 * @param {string} rel
 * @returns {string|null}
 */
function etichettaPer(rel) {
  const stem = rel.split('/').pop()?.replace(/\.html$/, '') || '';
  if (rel.startsWith('struttura/') && /^\d{6}/.test(stem)) return `cod. ${stem.slice(0, 6)}`;
  if (rel.startsWith('fornitore/')) return `P.IVA ${stem}`;
  return null;
}

/**
 * Трансформациите на една страница (чиста; без fs). Връща новия HTML.
 * @param {string} rel
 * @param {string} html
 * @param {string} su siteUrl
 * @returns {{ html: string, sottoSoglia: boolean }}
 */
export function trasformaPagina(rel, html, su) {
  let out = html;
  let sottoSoglia = false;
  const info = analizzaPagina(out);
  const nome = nomeDaTitolo(info.title);

  if (rel.startsWith('fornitore/')) {
    const n = numeroDaIt(leggiKpi(out, 'Contratti'));
    const nAz = numeroDaIt(leggiKpi(out, 'Aziende servite'));
    if (!fornitoreIndicizzabile({ n, nAziende: nAz })) {
      sottoSoglia = true;
      if (!info.noindex) out = impostaNoindex(out, true); // само добавя — „ditta individuale" остава noindex
    }
    // старото шаблонно описание (еднакво на всички профили) → с числата на профила
    const den = (out.match(/<h1>([^<]*)<\/h1>/) || [])[1];
    const valore = leggiKpi(out, 'Valore aggiudicato');
    const quota = leggiKpi(out, 'Quota senza gara');
    if (/<meta name="description" content="Contratti pubblici di /.test(out) && den && valore && quota && Number.isFinite(n) && Number.isFinite(nAz)) {
      out = sostituisciDescrizione(out, descrizioneFornitore({ den: unesc(den), n: String(leggiKpi(out, 'Contratti')), nAziende: String(leggiKpi(out, 'Aziende servite')), valore: unesc(valore), quotaSenzaGara: unesc(quota) }));
    }
  }
  if (nome) out = impostaKeywords(out, keywordsPerPercorso(rel, nome));
  // self-canonical, ако липсва (напр. note-legali/privacy от стар билд)
  if (su && !analizzaPagina(out).noindex && !analizzaPagina(out).canonical) {
    out = out.replace(/(<meta name="description"[^>]*>\n?)/i, `$1<link rel="canonical" href="${esc(urlDaPercorso(su, rel))}">\n`);
  }
  return { html: out, sottoSoglia };
}

/**
 * Блокът с връзки към индексируемите профили, които индексът не свързва.
 * @param {Array<{ rel: string, nome: string }>} orfani
 * @returns {string}
 */
export function bloccoAltreSchede(orfani) {
  if (!orfani.length) return '';
  const li = orfani.map((o) => `<li><a href="${esc(o.rel)}">${esc(o.nome)}</a></li>`).join('');
  return `${INIZIO_BLOCCO}<h2>Altre schede fornitore</h2>
<p class="small muted">Imprese con una scheda dedicata che non rientrano tra le prime 4.000 per valore.</p>
<ul class="small">${li}</ul>${FINE_BLOCCO}`;
}

/**
 * @param {string} html
 * @param {string} blocco
 * @returns {string}
 */
export function inserisciBlocco(html, blocco) {
  const i = html.indexOf(INIZIO_BLOCCO);
  const j = html.indexOf(FINE_BLOCCO);
  let base = html;
  if (i >= 0 && j > i) base = html.slice(0, i) + html.slice(j + FINE_BLOCCO.length);
  if (!blocco) return base;
  return base.replace(/\n<\/div><\/main>/, `\n${blocco}</div></main>`);
}

/**
 * @returns {Promise<void>}
 */
export async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'config.json'), 'utf8'));
  const su = String(config.siteUrl || '').replace(/\/$/, '');
  const validaz = JSON.parse(await readFile(join(DATA_DIR, 'validazione.json'), 'utf8').catch(() => 'null'));
  const oggi = new Date().toISOString().slice(0, 10);
  const primaData = validaz && validaz.generatoIl ? String(validaz.generatoIl).slice(0, 10) : oggi;

  /** @type {Map<string, { title: string|null, noindex: boolean, canonical: string|null, nome: string }>} */
  const pagine = new Map();
  let modificate = 0;
  let sotto = 0;
  // страници, чието <main> този проход промени → lastmod = днес и без запис в манифеста
  /** @type {Set<string>} */
  const mainCambiato = new Set();
  for (const abs of await htmlFiles(SITE_DIR)) {
    const rel = relative(SITE_DIR, abs).split(sep).join('/');
    const html = await readFile(abs, 'utf8');
    const { html: nuovo, sottoSoglia } = trasformaPagina(rel, html, su);
    if (sottoSoglia) sotto++;
    if (nuovo !== html) {
      await writeFile(abs, nuovo);
      modificate++;
      if (impronta(nuovo) !== impronta(html)) mainCambiato.add(rel);
    }
    const info = analizzaPagina(nuovo);
    const nome = nomeDaTitolo(info.title);
    pagine.set(rel, { ...info, nome });
  }

  // Индексируема = без noindex и canonical към самата нея (или без canonical).
  /** @param {string} rel */
  const indicizzabile = (rel) => {
    const p = pagine.get(rel);
    if (!p || p.noindex || rel === '404.html') return false;
    return !su || p.canonical == null || p.canonical === urlDaPercorso(su, rel);
  };

  // Еднакви заглавия → различител
  /** @type {Map<string, string[]>} */
  const perTitolo = new Map();
  for (const [rel, p] of pagine) {
    if (!p.title || !indicizzabile(rel)) continue;
    const g = perTitolo.get(p.title) || [];
    g.push(rel);
    perTitolo.set(p.title, g);
  }
  let disamb = 0;
  for (const [titolo, rels] of perTitolo) {
    if (rels.length < 2) continue;
    for (const rel of rels) {
      const et = etichettaPer(rel);
      if (!et) continue;
      const abs = join(SITE_DIR, rel);
      const html = await readFile(abs, 'utf8');
      const nuovoTit = disambiguaTitolo(titolo, et);
      const nuovo = sostituisciTitolo(html, titolo, nuovoTit);
      if (nuovo !== html) {
        await writeFile(abs, nuovo);
        disamb++;
        const p = pagine.get(rel);
        if (p) p.title = nuovoTit;
      }
    }
  }

  // Без сираци: индексируемите профили трябва да имат връзка от fornitori.html
  if (pagine.has('fornitori.html')) {
    const absIdx = join(SITE_DIR, 'fornitori.html');
    const idx = await readFile(absIdx, 'utf8');
    const senzaBlocco = inserisciBlocco(idx, '');
    const linkati = new Set([...senzaBlocco.matchAll(/href="(fornitore\/[^"]+\.html)"/g)].map((m) => m[1]));
    const orfani = [...pagine.keys()]
      .filter((rel) => rel.startsWith('fornitore/') && indicizzabile(rel) && !linkati.has(rel))
      .map((rel) => ({ rel, nome: pagine.get(rel)?.nome || rel }));
    const nuovo = inserisciBlocco(idx, bloccoAltreSchede(orfani));
    if (nuovo !== idx) {
      await writeFile(absIdx, nuovo);
      if (impronta(nuovo) !== impronta(idx)) mainCambiato.add('fornitori.html');
    }
    if (orfani.length) console.log(`  ${orfani.length} профила без връзка от индекса → блок „Altre schede fornitore"`);
  }

  if (!su) {
    console.log(`SEO: ${modificate} страници обновени; няма siteUrl → без sitemap/robots.`);
    return;
  }

  // Реален lastmod от манифеста (по отпечатък на <main>)
  /** @type {Record<string, { h: string, d: string }>} */
  const vecchio = JSON.parse(await readFile(MANIFEST_FILE, 'utf8').catch(() => '{}'));
  /** @type {Record<string, { h: string, d: string }>} */
  const manifest = {};
  /** @type {Record<string, Array<{ loc: string, lastmod: string }>>} */
  const sezioni = { pagine: [], strutture: [], fornitori: [] };
  for (const rel of pagine.keys()) {
    if (!indicizzabile(rel)) continue;
    const html = await readFile(join(SITE_DIR, rel), 'utf8');
    const voce = aggiornaLastmod(vecchio[rel], impronta(html), oggi, mainCambiato.has(rel) ? oggi : primaData);
    manifest[rel] = voce;
    sezioni[sezioneSitemap(rel)].push({ loc: urlDaPercorso(su, rel), lastmod: voce.d });
  }
  // начална страница първа (после азбучно, както е обходено)
  sezioni.pagine.sort((a, b) => (a.loc === `${su}/` ? -1 : b.loc === `${su}/` ? 1 : 0));
  /** @type {Array<{ loc: string, lastmod: string }>} */
  const indice = [];
  for (const [nome, voci] of Object.entries(sezioni)) {
    if (!voci.length) continue;
    await writeFile(join(SITE_DIR, `sitemap-${nome}.xml`), xmlUrlset(voci));
    indice.push({ loc: `${su}/sitemap-${nome}.xml`, lastmod: voci.reduce((m, v) => (v.lastmod > m ? v.lastmod : m), '') });
  }
  // sitemap.xml остава адресът, който GSC/robots вече познават — сега е индекс
  await writeFile(join(SITE_DIR, 'sitemap.xml'), xmlIndice(indice));
  await writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 0).replace(/\},"/g, '},\n"') + '\n');
  // allow-all е съзнателно: гражданска цел → искаме и AI асистентите да ни
  // намират и цитират (извличащи + обучаващи ботове са допуснати нарочно)
  await writeFile(
    join(SITE_DIR, 'robots.txt'),
    `# Ospedali Trasparenti — dati aperti sulla sanità pubblica italiana.\n# L'accesso è consentito a tutti i crawler, inclusi i bot AI (ricerca e training):\n# la finalità civica del progetto è massimizzare la diffusione dei dati.\nUser-agent: *\nAllow: /\n\nSitemap: ${su}/sitemap.xml\n`
  );
  const tot = Object.values(sezioni).reduce((s, v) => s + v.length, 0);
  console.log(
    `SEO: ${modificate} страници обновени, ${sotto} профила под прага (noindex), ${disamb} заглавия с различител; ` +
      `sitemap индекс → ${Object.entries(sezioni).map(([k, v]) => `${k} ${v.length}`).join(', ')} (общо ${tot})`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('SEO грешка:', err);
    process.exitCode = 1;
  });
}
