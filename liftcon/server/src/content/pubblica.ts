// Публикуване: генераторът (build.mjs) с промените от базата в нова папка releases/<версия>, после
// атомарна смяна на връзката `current` (от нея сервира Nginx). Неуспешен билд не пипа живия сайт.
// Пазят се последните 5 версии. Едно публикуване наведнъж.
import { execFile } from "node:child_process";
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

export function pubblicatore(o: OpzioniPubblica) {
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

    async pubblica(autoreId: string | null): Promise<{ ok: boolean; versione?: string; errore?: string }> {
      if (occupato) return { ok: false, errore: "Una pubblicazione è già in corso." };
      occupato = true;
      const p = await o.store.pubblicazioni.crea(autoreId);
      const versione = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
      const out = join(releases, versione);
      try {
        mkdirSync(releases, { recursive: true });
        await genera(out);
        const tmpLink = join(o.siteDir, `.current-${versione}`);
        symlinkSync(join("releases", versione), tmpLink);
        renameSync(tmpLink, join(o.siteDir, "current")); // rename е атомарен — Nginx вижда старата или новата версия
        const attiva = readlinkSync(join(o.siteDir, "current"));
        // По време на създаване (имената са и „repo-…“ от деплоя, и времеви печати от панела).
        const vecchie = readdirSync(releases)
          .filter((d) => join("releases", d) !== attiva)
          .sort((x, y) => statSync(join(releases, y)).mtimeMs - statSync(join(releases, x)).mtimeMs)
          .slice(conserva - 1);
        for (const d of vecchie) rmSync(join(releases, d), { recursive: true, force: true });
        await o.store.pubblicazioni.chiudi(p.id, "OK", { versione });
        return { ok: true, versione };
      } catch (err) {
        rmSync(out, { recursive: true, force: true });
        const errore = err instanceof Error ? err.message.slice(0, 2000) : "errore sconosciuto";
        await o.store.pubblicazioni.chiudi(p.id, "ERRORE", { errore });
        return { ok: false, errore };
      } finally {
        occupato = false;
      }
    },

    /** Преглед на една чернова: целият сайт в anteprime/<token>; старите прегледи се трият. */
    async anteprima(token: string, extra: { id: string; dati: DatiSalvati }): Promise<string> {
      const base = join(o.siteDir, "anteprime");
      if (existsSync(base)) for (const d of readdirSync(base)) rmSync(join(base, d), { recursive: true, force: true });
      const out = join(base, token);
      await genera(out, extra);
      return out;
    },
  };
}

export type Pubblicatore = ReturnType<typeof pubblicatore>;
