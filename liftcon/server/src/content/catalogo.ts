// Каталогът на редактируемото съдържание: стойностите от репото (content-defaults.json, изнесени от
// генератора) + промените в базата → формите в панела и данните за генератора при публикуване.
import { readFileSync } from "node:fs";
import type { Store } from "../store/types.js";
import { aOverride, valoriDaDefault, type Valori } from "./campi.js";

interface Defaults {
  site: Record<string, unknown>;
  servizi: Record<string, Record<string, unknown>>;
  guide: Record<string, Record<string, unknown>>;
  faqHome: Array<{ q: string; a: string }>;
  glossario: Array<[string, string]>;
}

export interface DatiSalvati {
  valori: Valori;
  nuova?: boolean;
  nascosta?: boolean;
  modificata?: string;
}

export interface Voce {
  id: string;
  tipo: string;
  titolo: string;
  path: string | null;
  modificata: boolean;
  nuova: boolean;
  nascosta: boolean;
  aggiornataIl: Date | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function catalogo(store: Store, defaultsPath: string) {
  const def = JSON.parse(readFileSync(defaultsPath, "utf8")) as Defaults;

  function tipoDi(id: string): string {
    return id.includes(":") ? id.slice(0, id.indexOf(":")) : id;
  }

  function defaultDi(id: string): Record<string, unknown> | null {
    const [tipo, chiave = ""] = id.split(":");
    if (tipo === "site") return def.site;
    if (tipo === "servizio") return def.servizi[chiave] ?? null;
    if (tipo === "guida") return def.guide[chiave] ?? null;
    if (tipo === "faq-home") return { faq: def.faqHome };
    if (tipo === "glossario") return def.glossario as unknown as Record<string, unknown>;
    return null;
  }

  return {
    slugValido: (s: string) => SLUG.test(s) && s.length <= 80,
    esisteSlug: (s: string) => Boolean(def.guide[s]),

    async elenco(): Promise<Voce[]> {
      const salvati = new Map((await store.contenuti.tutti()).map((c) => [c.id, c]));
      const voce = (id: string, titolo: string, path: string | null): Voce => {
        const c = salvati.get(id);
        const d = c?.dati as DatiSalvati | undefined;
        return { id, tipo: tipoDi(id), titolo, path, modificata: Boolean(c), nuova: Boolean(d?.nuova), nascosta: Boolean(d?.nascosta), aggiornataIl: c?.aggiornatoIl ?? null };
      };
      const out: Voce[] = [voce("site", "Dati del sito (telefono, email, orari)", null)];
      for (const [k, s] of Object.entries(def.servizi)) out.push(voce(`servizio:${k}`, String(s.nome ?? k), String(s.path ?? "")));
      for (const [k, g] of Object.entries(def.guide)) out.push(voce(`guida:${k}`, String(g.h1 ?? k), String(g.path ?? "")));
      for (const c of salvati.values()) {
        const d = c.dati as DatiSalvati;
        if (c.tipo === "guida" && d.nuova) out.push(voce(c.id, String(d.valori.h1 ?? c.id), `/guide/${c.id.slice(6)}/`));
      }
      out.push(voce("faq-home", "Domande frequenti della pagina iniziale", "/"), voce("glossario", "Glossario", "/glossario/"));
      return out;
    },

    /** Стойностите за формата: записаните, иначе тези от репото. null = непознат id. */
    async valori(id: string): Promise<{ valori: Valori; salvato: DatiSalvati | null; tipo: string } | null> {
      const tipo = tipoDi(id);
      const c = await store.contenuti.perId(id);
      if (c) return { valori: (c.dati as DatiSalvati).valori, salvato: c.dati as DatiSalvati, tipo };
      const d = defaultDi(id);
      return d ? { valori: valoriDaDefault(tipo, d), salvato: null, tipo } : null;
    },

    async salva(id: string, dati: DatiSalvati, autoreId: string): Promise<void> {
      await store.contenuti.salva(id, tipoDi(id), { ...dati, modificata: new Date().toISOString().slice(0, 10) }, autoreId);
    },

    ripristina: (id: string) => store.contenuti.elimina(id),

    /** Всички промени като JSON за генератора (build.mjs → src/overrides.mjs). */
    async overrides(extra?: { id: string; dati: DatiSalvati }): Promise<Record<string, unknown>> {
      const tutti = await store.contenuti.tutti();
      const lista = tutti.map((c) => ({ id: c.id, dati: c.dati as DatiSalvati }));
      if (extra) {
        const i = lista.findIndex((x) => x.id === extra.id);
        if (i >= 0) lista[i] = extra;
        else lista.push(extra);
      }
      const ov: { site?: unknown; servizi: Record<string, unknown>; guide: Record<string, unknown>; faqHome?: unknown; glossario?: unknown } = { servizi: {}, guide: {} };
      for (const { id, dati } of lista) {
        const tipo = tipoDi(id);
        const chiave = id.slice(tipo.length + 1);
        const o = aOverride(tipo, dati.valori);
        if (tipo === "site") ov.site = o;
        else if (tipo === "servizio") ov.servizi[chiave] = o;
        else if (tipo === "guida") {
          const base = def.guide[chiave] as Record<string, unknown> | undefined;
          const oggi = dati.modificata ?? new Date().toISOString().slice(0, 10);
          ov.guide[chiave] = dati.nascosta
            ? { nascosta: true }
            : { ...o, modified: oggi, ...(base ? {} : { published: oggi, correlati: ["sopralluogo", "relazioni"] }) };
        } else if (tipo === "faq-home") ov.faqHome = o.faq;
        else if (tipo === "glossario") ov.glossario = o.termini;
      }
      return ov;
    },
  };
}

export type Catalogo = ReturnType<typeof catalogo>;
