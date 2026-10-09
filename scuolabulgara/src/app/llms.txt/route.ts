// llms.txt — concise, AI-friendly summary of the site (AEO/GEO).
// See https://llmstxt.org/. Plain text, served at /llms.txt. Built from the
// same content the admin edits (Italian, the site's main language), so it can
// never drift from the pages. Only the agency credit at the end is fixed.
import { loadSite } from "@/lib/content";

export const dynamic = "force-dynamic";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export async function GET() {
  const base = process.env.SITE_URL || "https://www.scuolabulgaramilano.it";
  const site = await loadSite("it");
  const seo = site.get("seo");
  const org = site.get("org");
  const settings = site.get("settings");
  const courses = site.get("courses");
  const dance = site.get("dance");
  const faq = site.get("faq");
  const has = (s: string) => s.trim() !== "";

  const facts = [
    `Nome: ${org.name}${has(org.alternateName) ? ` — ${org.alternateName}` : ""}`,
    `Luogo: ${settings.address}`,
    has(org.foundingDate) ? `Fondata: ${org.foundingDate}` : "",
    ...courses.items.filter((c) => has(c.title)).map((c) => `${c.title}: ${oneLine(c.text)}`),
    has(dance.title) ? `${oneLine(dance.title)} — ${oneLine(dance.lead || "")}` : "",
    ...dance.schedule.filter((r) => has(r.day)).map((r) => `${r.day} ${r.time}: ${oneLine(r.place)}`),
    `Email: ${settings.email}`,
    `Telefono: ${settings.phone}`,
  ].filter(Boolean);

  const body = [
    `# ${seo.title}`,
    "",
    `> ${oneLine(seo.description)}`,
    "> Sito trilingue: italiano, български, English.",
    "",
    "## Fatti chiave",
    ...facts.map((f) => `- ${f}`),
    "",
    "## Pagine principali",
    `- [Home (IT)](${base}/it)`,
    `- [Home (BG)](${base}/bg)`,
    `- [Home (EN)](${base}/en)`,
    `- [Privacy](${base}/it/privacy)`,
    `- [Cookie](${base}/it/cookie)`,
    `- [Termini](${base}/it/termini)`,
    "",
    "## Domande frequenti",
    ...faq.items.filter((f) => has(f.q) && has(f.a)).map((f) => `- ${oneLine(f.q)} ${oneLine(f.a)}`),
    "",
    "Creato, disegnato e donato da Carbon Stealth VCC (https://carbonstealth.eu).",
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
