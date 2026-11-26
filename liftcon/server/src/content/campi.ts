// Описанието на редактируемото съдържание: едно място за полетата, тяхното четене от формата,
// валидирането (ограниченията на сайта) и превръщането им в данни за генератора (overrides).
import { htmlToMd, mdBlocco, mdInline, urlSicuro } from "./mdlite.js";

export type Tipo =
  | "testo" // обикновен текст (генераторът го екранира)
  | "inline" // ред в текстов формат → HTML
  | "blocco" // абзаци/списъци → HTML (първият абзац е .answer)
  | "lista" // редове в текстов формат → HTML
  | "coppie" // [заглавие, текст → HTML]
  | "coppieTesto" // [текст, текст] (речник)
  | "faq" // [въпрос, отговор → HTML]
  | "sezioni" // [H2, блок → HTML]
  | "fonti" // [етикет, https адрес]
  | "keywords"
  | "orari";

export interface Campo {
  nome: string;
  etichetta: string;
  tipo: Tipo;
  min?: number;
  max?: number;
  aiuto?: string;
  facoltativo?: boolean;
}

export type Valori = Record<string, unknown>;
export type Coppia = [string, string];

const GIORNI: Record<string, string> = { lun: "Monday", mar: "Tuesday", mer: "Wednesday", gio: "Thursday", ven: "Friday", sab: "Saturday", dom: "Sunday" };
const GIORNI_INV = Object.fromEntries(Object.entries(GIORNI).map(([k, v]) => [v, k]));

const SEO: Campo[] = [
  { nome: "title", etichetta: "Titolo della pagina (motori di ricerca)", tipo: "testo", min: 15, max: 60, aiuto: "Massimo 60 caratteri, di solito termina con « | LiftCon »." },
  { nome: "description", etichetta: "Descrizione (motori di ricerca)", tipo: "testo", min: 70, max: 160 },
  { nome: "keywords", etichetta: "Parole chiave (separate da virgola)", tipo: "keywords", aiuto: "Almeno 5; «Carbon Stealth» viene aggiunta in automatico." },
];

export const CAMPI: Record<string, Campo[]> = {
  site: [
    { nome: "telefono", etichetta: "Telefono", tipo: "testo", min: 6, max: 30 },
    { nome: "email", etichetta: "Email di contatto", tipo: "testo", min: 6, max: 120 },
    { nome: "orari", etichetta: "Orari", tipo: "orari", aiuto: "Giorni abbreviati: lun, mar, mer, gio, ven, sab, dom." },
  ],
  servizio: [
    ...SEO,
    { nome: "h1", etichetta: "Titolo principale (H1)", tipo: "testo", min: 10, max: 120 },
    { nome: "nome", etichetta: "Nome breve (menu)", tipo: "testo", min: 3, max: 60 },
    { nome: "menu", etichetta: "Descrizione breve (menu)", tipo: "testo", min: 10, max: 140 },
    { nome: "lead", etichetta: "Introduzione", tipo: "inline", min: 40, max: 700 },
    { nome: "perChi", etichetta: "A chi serve", tipo: "lista" },
    { nome: "comprende", etichetta: "Che cosa comprende", tipo: "coppie" },
    { nome: "fasi", etichetta: "Come si svolge (fasi)", tipo: "coppie" },
    { nome: "consegne", etichetta: "Che cosa riceve", tipo: "lista" },
    { nome: "limiti", etichetta: "Limiti dell'incarico", tipo: "lista" },
    { nome: "faq", etichetta: "Domande frequenti", tipo: "faq" },
  ],
  guida: [
    ...SEO,
    { nome: "h1", etichetta: "Titolo principale (H1)", tipo: "testo", min: 10, max: 140 },
    { nome: "menu", etichetta: "Titolo breve (menu)", tipo: "testo", min: 3, max: 60 },
    { nome: "lead", etichetta: "Risposta in breve (introduzione)", tipo: "inline", min: 40, max: 900 },
    { nome: "sezioni", etichetta: "Sezioni (titolo come domanda + testo)", tipo: "sezioni" },
    { nome: "faq", etichetta: "Domande frequenti", tipo: "faq", facoltativo: true },
    { nome: "fonti", etichetta: "Fonti (etichetta + indirizzo https)", tipo: "fonti" },
  ],
  "faq-home": [{ nome: "faq", etichetta: "Domande frequenti della pagina iniziale", tipo: "faq" }],
  glossario: [{ nome: "termini", etichetta: "Termini", tipo: "coppieTesto" }],
};

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v === undefined || v === "" ? [] : [String(v)]);
const pulito = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/** Стойностите от репото (HTML) → стойности за формата (текстов формат). */
export function valoriDaDefault(tipoEntita: string, def: Record<string, unknown>): Valori {
  const out: Valori = {};
  for (const c of CAMPI[tipoEntita] ?? []) {
    const v = tipoEntita === "glossario" && c.nome === "termini" ? def : def[c.nome];
    switch (c.tipo) {
      case "testo":
        out[c.nome] = String(v ?? "");
        break;
      case "inline":
        out[c.nome] = htmlToMd(String(v ?? ""));
        break;
      case "lista":
        out[c.nome] = (v as string[] | undefined ?? []).map(htmlToMd);
        break;
      case "coppie":
        out[c.nome] = ((v as Coppia[] | undefined) ?? []).map(([a, b]) => [a, htmlToMd(b)]);
        break;
      case "coppieTesto":
        out[c.nome] = (v as Coppia[] | undefined) ?? [];
        break;
      case "faq":
        out[c.nome] = ((v as Array<{ q: string; a: string }> | undefined) ?? []).map((f) => [f.q, htmlToMd(f.a)]);
        break;
      case "sezioni":
        out[c.nome] = ((v as Array<{ h2: string; html: string }> | undefined) ?? []).map((s) => [s.h2, htmlToMd(s.html)]);
        break;
      case "fonti":
        out[c.nome] = ((v as Array<{ label: string; url: string }> | undefined) ?? []).map((f) => [f.label, f.url]);
        break;
      case "keywords":
        out[c.nome] = ((v as string[] | undefined) ?? []).join(", ");
        break;
      case "orari":
        out[c.nome] = ((v as Array<{ label: string; days: string[]; opens: string; closes: string }> | undefined) ?? []).map((o) => [
          o.label,
          o.days.map((d) => GIORNI_INV[d] ?? d).join(", "),
          o.opens,
          o.closes,
        ]);
        break;
    }
  }
  return out;
}

function coppieDaForm(body: Record<string, unknown>, nome: string, n = 2): string[][] {
  const cols = Array.from({ length: n }, (_, i) => arr(body[`f_${nome}_${i}`]));
  const len = Math.max(...cols.map((c) => c.length));
  return Array.from({ length: len }, (_, r) => cols.map((c) => pulito(c[r] ?? ""))).filter((row) => row.some(Boolean));
}

/** Формата → стойности + грешки по поле (италиански, за човека). */
export function leggiForm(tipoEntita: string, body: Record<string, unknown>): { valori: Valori; errori: Record<string, string> } {
  const valori: Valori = {};
  const errori: Record<string, string> = {};
  for (const c of CAMPI[tipoEntita] ?? []) {
    const lungo = (s: string) => (c.max && s.length > c.max ? `Massimo ${c.max} caratteri (ora ${s.length}).` : c.min && s.length < c.min ? `Almeno ${c.min} caratteri.` : "");
    switch (c.tipo) {
      case "testo":
      case "inline": {
        const s = pulito(String(body[`f_${c.nome}`] ?? ""));
        valori[c.nome] = s;
        const e = lungo(s);
        if (e) errori[c.nome] = e;
        break;
      }
      case "lista": {
        const l = arr(body[`f_${c.nome}`]).map(pulito).filter(Boolean);
        valori[c.nome] = l;
        if (!l.length && !c.facoltativo) errori[c.nome] = "Inserisca almeno una voce.";
        break;
      }
      case "keywords": {
        const k = [...new Set(String(body[`f_${c.nome}`] ?? "").split(",").map((x) => x.trim()).filter(Boolean))];
        if (!k.some((x) => x.toLowerCase() === "carbon stealth")) k.push("Carbon Stealth");
        valori[c.nome] = k.join(", ");
        if (k.length < 5) errori[c.nome] = "Servono almeno 5 parole chiave.";
        break;
      }
      case "orari": {
        const righe = coppieDaForm(body, c.nome, 4);
        valori[c.nome] = righe;
        for (const [, giorni, da, a] of righe) {
          const ok = (giorni ?? "").split(",").map((g) => g.trim()).filter(Boolean).every((g) => g in GIORNI);
          if (!ok || !/^\d{2}:\d{2}$/.test(da ?? "") || !/^\d{2}:\d{2}$/.test(a ?? "")) errori[c.nome] = "Controlli giorni (lun…dom) e orari (HH:MM).";
        }
        break;
      }
      default: {
        const righe = coppieDaForm(body, c.nome);
        valori[c.nome] = righe;
        if (!righe.length && !c.facoltativo) errori[c.nome] = "Inserisca almeno una voce.";
        if (righe.some(([a, b]) => !a || !b)) errori[c.nome] = "Ogni voce richiede entrambi i campi.";
        if (c.tipo === "fonti" && righe.some(([, u]) => !/^https:\/\//.test(u ?? "") || !urlSicuro(u ?? ""))) errori[c.nome] = "Gli indirizzi delle fonti devono iniziare con https://";
      }
    }
  }
  if (tipoEntita === "site") {
    if (!/^\+?[0-9 ]{6,30}$/.test(String(valori.telefono))) errori.telefono = "Numero non valido (solo cifre, spazi e +).";
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(valori.email))) errori.email = "Email non valida.";
  }
  return { valori, errori };
}

/** Стойностите от формата → данни за генератора (HTML само там, където генераторът не екранира). */
export function aOverride(tipoEntita: string, v: Valori): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of CAMPI[tipoEntita] ?? []) {
    const x = v[c.nome];
    switch (c.tipo) {
      case "testo":
        out[c.nome] = String(x ?? "");
        break;
      case "inline":
        out[c.nome] = mdInline(String(x ?? ""));
        break;
      case "lista":
        out[c.nome] = (x as string[]).map(mdInline);
        break;
      case "coppie":
        out[c.nome] = (x as Coppia[]).map(([a, b]) => [a, mdInline(b)]);
        break;
      case "coppieTesto":
        out[c.nome] = x;
        break;
      case "faq":
        out[c.nome] = (x as Coppia[]).map(([q, a]) => ({ q, a: mdInline(a) }));
        break;
      case "sezioni":
        out[c.nome] = (x as Coppia[]).map(([h2, testo]) => ({ h2, html: mdBlocco(testo, { primaRisposta: true }) }));
        break;
      case "fonti":
        out[c.nome] = (x as Coppia[]).map(([label, url]) => ({ label, url }));
        break;
      case "keywords":
        out[c.nome] = String(x ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "orari":
        out[c.nome] = (x as string[][]).map(([label, giorni, opens, closes]) => ({
          label,
          days: (giorni ?? "").split(",").map((g) => GIORNI[g.trim()]).filter(Boolean),
          opens,
          closes,
        }));
        break;
    }
  }
  return out;
}
