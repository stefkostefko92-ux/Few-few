// Публикуване: генераторът (build.mjs) с промените от базата в нова папка releases/<версия>, после
// атомарна смяна на връзката `current` (от нея сервира Nginx). Неуспешен билд не пипа живия сайт.
// Пазят се последните 5 версии. Едно публикуване наведнъж.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync, existsSync, readlinkSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Store } from "../store/types.js";
import type { Catalogo, DatiSalvati } from "./catalogo.js";

export interface OpzioniPubblica {
  store: Store;
  catalogo: Catalogo;
  siteSrc: string; // папката с build.mjs
  siteDir: string; // корен: releases/, current, anteprime/
  siteUrl: string;
  conserva?: number;
}

function esegui(script: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script], { env: { PATH: process.env.PATH ?? "", ...env }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`${err.message}\n${String(stderr).slice(-1500)}`));
      else resolve();
    });
  });
}

/** Името на версията: време до милисекунда + случаен суфикс (две публикувания в една секунда не се сблъскват). */
export function nomeVersione(t: Date): string {
  return `${t.toISOString().replace(/[-:.]/g, "")}-${randomBytes(3).toString("hex")}`;
}

export function pubblicatore(o: OpzioniPubblica) {
  // Едно генериране наведнъж — публикуване или преглед (прегледът чисти anteprime/ и пише там).
  let occupato = false;
  const conserva = o.conserva ?? 5;
  const releases = join(o.siteDir, "releases");

  async function genera(out: string, extra?: { id: string; dati: DatiSalvati }): Promise<void> {
    const tmp = mkdtempSync(join(tmpdir(), "liftcon-ov-"));
    try {
      const file = join(tmp, "overrides.json");
      writeFileSync(file, JSON.stringify(await o.catalogo.overrides(extra)));
      await esegui(join(o.siteSrc, "build.mjs"), { LIFTCON_OUT: out, LIFTCON_OVERRIDES: file, LIFTCON_SITE_URL: o.siteUrl });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  return {
    get occupato() {
      return occupato;
    },

    async pubblica(autoreId: string | null): Promise<{ ok: boolean; versione?: string; errore?: string; avviso?: string }> {
      if (occupato) return { ok: false, errore: "Una pubblicazione o un'anteprima è già in corso: riprovi tra poco." };
      occupato = true;
      try {
        const p = await o.store.pubblicazioni.crea(autoreId);
        const versione = nomeVersione(new Date());
        const out = join(releases, versione);
        try {
          mkdirSync(releases, { recursive: true });
          await genera(out);
          const tmpLink = join(o.siteDir, `.current-${versione}`);
          symlinkSync(join("releases", versione), tmpLink);
          renameSync(tmpLink, join(o.siteDir, "current")); // rename е атомарен — Nginx вижда старата или новата версия
        } catch (err) {
          // Новата версия не е активирана: махаме само нея, живият сайт не е пипан.
          rmSync(out, { recursive: true, force: true });
          const errore = err instanceof Error ? err.message.slice(0, 2000) : "errore sconosciuto";
          await o.store.pubblicazioni.chiudi(p.id, "ERRORE", { errore }).catch(() => undefined);
          return { ok: false, errore };
        }
        // Оттук версията е жива: никоя грешка след това не я трие.
        const avvisi: string[] = [];
        try {
          const attiva = readlinkSync(join(o.siteDir, "current"));
          // По време на създаване (имената са и „repo-…“ от деплоя, и версии от панела).
          const vecchie = readdirSync(releases)
            .filter((d) => join("releases", d) !== attiva)
            .sort((x, y) => statSync(join(releases, y)).mtimeMs - statSync(join(releases, x)).mtimeMs)
            .slice(conserva - 1);
          for (const d of vecchie) rmSync(join(releases, d), { recursive: true, force: true });
        } catch {
          avvisi.push("versioni precedenti non rimosse");
        }
        try {
          await o.store.pubblicazioni.chiudi(p.id, "OK", { versione });
        } catch {
          avvisi.push("registro delle pubblicazioni non aggiornato");
        }
        return { ok: true, versione, ...(avvisi.length ? { avviso: avvisi.join("; ") } : {}) };
      } finally {
        occupato = false;
      }
    },

    /** Преглед на една чернова: целият сайт в anteprime/<token>; старите прегледи се трият. */
    async anteprima(token: string, extra: { id: string; dati: DatiSalvati }): Promise<string | null> {
      if (occupato) return null;
      occupato = true;
      try {
        const base = join(o.siteDir, "anteprime");
        if (existsSync(base)) for (const d of readdirSync(base)) rmSync(join(base, d), { recursive: true, force: true });
        const out = join(base, token);
        await genera(out, extra);
        return out;
      } finally {
        occupato = false;
      }
    },
  };
}

export type Pubblicatore = ReturnType<typeof pubblicatore>;
