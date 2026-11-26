// Файловете за търсачки и AI: sitemap.xml (с изображения), sitemap.txt, robots.txt, llms.txt,
// llms-full.txt, RSS на ръководствата, web manifest, security.txt, IndexNow ключ.

import { SITE, COMPANY, CONTACT, PROVINCE } from "./config.mjs";
import { esc, abs, plain } from "./lib/html.mjs";
import { R } from "./routes.mjs";

// IndexNow ключът е публичен по протокол (стои на <сайт>/<ключ>.txt).
export const INDEXNOW_KEY = "16d66f0af9d5e68a8cd4080cd5394c1f";

const AI_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "DuckAssistBot",
  "MistralAI-User",
];

const IMAGES = {
  [R.home]: [["/img/render/hero-1600.jpg", "Atrio di un condominio milanese con ascensore in acciaio inox"]],
  [R.chiSiamo]: [["/img/render/dettaglio-1200.jpg", "Pulsantiera di piano dell'ascensore in acciaio inox"]],
  [R.relazioni]: [["/img/render/dettaglio-1200.jpg", "Pulsantiera di piano dell'ascensore in acciaio inox"]],
};

export function sitemapXml(pages) {
  const urls = pages
    .map((p) => {
      const imgs = (IMAGES[p.path] ?? [])
        .map(([src, cap]) => `<image:image><image:loc>${esc(abs(SITE.url, src))}</image:loc><image:title>${esc(cap)}</image:title></image:image>`)
        .join("");
      return `<url><loc>${esc(abs(SITE.url, p.path))}</loc><lastmod>${p.updated ?? SITE.updated}</lastmod><changefreq>${p.changefreq ?? "monthly"}</changefreq><priority>${(
        p.priority ?? 0.5
      ).toFixed(1)}</priority>${imgs}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>
`;
}

export function sitemapTxt(pages) {
  return `${pages.map((p) => abs(SITE.url, p.path)).join("\n")}\n`;
}

export function robotsTxt() {
  return `# robots.txt — LiftCon, consulenza tecnica ascensori (${SITE.url})
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

# Assistenti e motori AI: i contenuti sono liberamente citabili con link alla fonte.
${AI_BOTS.map((b) => `User-agent: ${b}\nAllow: /\nDisallow: /api/\nDisallow: /admin/`).join("\n\n")}

Sitemap: ${SITE.url}/sitemap.xml
`;
}

export function llmsTxt({ servizi, guide }) {
  const line = (title, path, desc) => `- [${title}](${abs(SITE.url, path)}): ${desc}`;
  return `# LiftCon

> LiftCon è il servizio di consulenza tecnica per ascensori di ${COMPANY.legalName}, per amministratori di condominio, proprietari e gestori immobiliari a Milano, nella Città metropolitana di Milano, in provincia di Monza e della Brianza e in tutta la Lombardia (${PROVINCE.join(", ")}). Offre sopralluoghi descrittivi, controllo qualità dei lavori, analisi dei preventivi, supporto al committente, preparazione documentale alla verifica straordinaria e relazioni con report fotografico.

Limiti dichiarati: LiftCon NON esegue verifiche periodiche o straordinarie ai sensi del DPR 162/1999, non rilascia verbali ufficiali, certificazioni di sicurezza o di conformità, dichiarazioni ai sensi del DM 37/2008, progetti, asseverazioni o perizie giudiziarie, e non esegue prove o manovre sugli impianti. Le relazioni descrivono fatti, documenti e condizioni osservate.

Contatti: telefono ${CONTACT.phone}, email ${CONTACT.email}, modulo ${abs(SITE.url, R.contatti)}. Lingua del sito: italiano.

## Servizi
${servizi.map((s) => line(s.h1, s.path, s.description)).join("\n")}
${line("Tutti i servizi", R.servizi, "panoramica dei servizi per area di lavoro")}

## Per chi
${line("Amministratori di condominio", R.amministratori, "preventivi, controllo lavori, assemblee, verifiche e documenti")}
${line("Proprietari e privati", R.proprietari, "edifici di proprietà, acquisto di immobili, preventivi e lavori")}

## Zone servite
${line("Milano", R.milano, "tutti i nove Municipi")}
${line("Provincia di Milano", R.provMilano, "comuni della Città metropolitana di Milano")}
${line("Lombardia", R.lombardia, "le dodici province lombarde, con Monza e Brianza")}

## Guide (con riferimenti al testo vigente su Normattiva)
${guide.map((g) => line(g.h1, g.path, g.description)).join("\n")}
${line("Glossario", R.glossario, "termini tecnici e normativi dell'ascensore in condominio")}
${line("Domande frequenti", R.faq, "risposte brevi su servizi, norme e verifiche")}

## Optional
${line("Il metodo", R.metodo, "lettera d'incarico, principi di lavoro e limiti dell'incarico")}
${line("Chi siamo", R.chiSiamo, "il servizio LiftCon e l'azienda Carbon Stealth VCC")}
${line("Note legali", R.noteLegali, "dati societari del fornitore")}
${line("Testo completo per assistenti AI", "/llms-full.txt", "il contenuto delle pagine principali in testo semplice")}
`;
}

export function llmsFullTxt(pages) {
  const blocks = pages
    .filter((p) => !p.noindex)
    .map((p) => `## ${p.title}\nURL: ${abs(SITE.url, p.path)}\n\n${plain(p.body.replace(/<(nav|aside|footer)[\s\S]*?<\/\1>/g, " "))}\n`);
  return `# LiftCon — testo completo (${SITE.url})\n\nAggiornato: ${SITE.updated}. Fanno fede le pagine del sito e, per le norme, i testi ufficiali su Normattiva.\n\n${blocks.join("\n")}`;
}

const rfc822 = (iso) => new Date(`${iso}T09:00:00Z`).toUTCString();

export function rssXml(guide) {
  const items = guide
    .map(
      (g) => `<item><title>${esc(g.h1)}</title><link>${esc(abs(SITE.url, g.path))}</link><guid isPermaLink="true">${esc(abs(SITE.url, g.path))}</guid><pubDate>${rfc822(
        g.published,
      )}</pubDate><description>${esc(g.description)}</description></item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Guide LiftCon: ascensori e condominio</title>
<link>${SITE.url}${R.guide}</link>
<atom:link href="${SITE.url}${R.feed}" rel="self" type="application/rss+xml"/>
<description>Guide pratiche su verifiche, manutenzione, preventivi e spese dell'ascensore in condominio.</description>
<language>it-it</language>
<lastBuildDate>${rfc822(SITE.updated)}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

export function manifest() {
  return `${JSON.stringify(
    {
      name: "LiftCon, consulenza tecnica ascensori",
      short_name: "LiftCon",
      description: "Consulenza tecnica per ascensori a Milano e in Lombardia.",
      lang: "it-IT",
      start_url: "/",
      scope: "/",
      display: "browser",
      background_color: "#F5F6F3",
      theme_color: SITE.themeColor,
      icons: [
        { src: "/assets/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/assets/brand/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/assets/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    null,
    2,
  )}\n`;
}

export function securityTxt() {
  return `Contact: mailto:${CONTACT.email}
Expires: 2027-11-26T00:00:00.000Z
Preferred-Languages: it, en, bg
Canonical: ${SITE.url}/.well-known/security.txt
Policy: https://github.com/stefkostefko92-ux/Few-few/blob/main/SECURITY.md
`;
}
