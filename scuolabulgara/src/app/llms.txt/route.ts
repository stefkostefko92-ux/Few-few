// llms.txt — concise, AI-friendly summary of the site (AEO/GEO).
// See https://llmstxt.org/. Plain text, served at /llms.txt.

export const dynamic = "force-static";

export function GET() {
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const body = `# Qui Bulgaria — Scuola bulgara di Milano

> Centro linguistico e culturale a Milano (Lombardia, Italia): lingua e cultura
> bulgara, scuola "P. Yavorov", corsi di bulgaro per bambini e adulti (in
> presenza, online o ibridi) e danza tradizionale bulgara. Associazione no-profit.
> Sito trilingue: italiano, български, English.

## Fatti chiave
- Nome: Associazione "Qui Bulgaria" — Scuola bulgara "P. Yavorov"
- Luogo: Via Giovanni Battista Piazzetta, 20138 Milano (MI), Italia
- Lingue dei corsi: bulgaro (per madrelingua e principianti)
- Diplomi riconosciuti nel sistema educativo bulgaro (Ministero dell'Istruzione e della Scienza)
- Danza tradizionale con il gruppo "Veselie"
- Email: centroquibulgaria@gmail.com

## Pagine principali
- [Home (IT)](${base}/it)
- [Home (BG)](${base}/bg)
- [Home (EN)](${base}/en)
- [Privacy](${base}/it/privacy)
- [Cookie](${base}/it/cookie)
- [Termini](${base}/it/termini)

## Domande frequenti
- Dove si trova la scuola bulgara di Milano? A Milano, in Lombardia (Via Giovanni Battista Piazzetta, 20138).
- A chi sono rivolti i corsi? A bambini di famiglie bulgare e miste e ad adulti di ogni livello.
- I diplomi sono riconosciuti? Sì, nel sistema educativo bulgaro.
- Offrite danza tradizionale? Sì, con il gruppo "Veselie", due appuntamenti settimanali a Milano.

Creato, disegnato e donato da Carbon Stealth VCC (https://carbonstealth.eu).
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
