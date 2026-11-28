// Заявките от формата: запис в базата + известие по имейл (Brevo); срок от privacy; CSV експорт.
import type { Logger } from "pino";
import type { Store, Richiesta, StatoRichiesta } from "../store/types.js";
import type { Mailer } from "../mailer.js";
import { ETICHETTE_RUOLO, ETICHETTE_SERVIZIO, riga, type RichiestaValida } from "./schema.js";

/** Заявка без възлагане се изтрива 6 месеца след последната промяна (privacy, спецификация т. 11). */
export function scadenza(da: Date): Date {
  const d = new Date(da);
  d.setMonth(d.getMonth() + 6);
  return d;
}

export const ETICHETTE_STATO: Record<StatoRichiesta, string> = {
  NUOVA: "Nuova",
  IN_LAVORAZIONE: "In lavorazione",
  PROPOSTA_INVIATA: "Proposta inviata",
  INCARICO: "Incarico conferito",
  CHIUSA: "Chiusa",
};

export function testoEmail(r: RichiestaValida, link: string | null | undefined): string {
  return [
    "Nuova richiesta dal sito LiftCon",
    "",
    `Nome: ${riga(r.nome)}`,
    `Email: ${r.email}`,
    `Telefono: ${r.telefono || "-"}`,
    `Ruolo: ${ETICHETTE_RUOLO[r.ruolo]}`,
    `Comune dell'impianto: ${riga(r.comune)}`,
    `Servizio: ${ETICHETTE_SERVIZIO[r.servizio]}`,
    "",
    "Messaggio:",
    r.messaggio,
    "",
    link === undefined ? "" : link ? `Pannello: ${link}` : "La richiesta non è stata salvata nel pannello (errore del database): risponda da questa email.",
  ].join("\n").trimEnd();
}

/**
 * Запис + известие. Записът успешен → успех дори ако имейлът падне (заявката е в панела).
 * Записът неуспешен → опит само с имейл; и двете неуспешни → грешка.
 */
export async function registraRichiesta(
  deps: { store: Store; mailer: Mailer; logger: Logger; baseUrl: string; now?: () => Date },
  r: RichiestaValida,
): Promise<{ ok: boolean; salvata: boolean; inviata: boolean }> {
  const ora = deps.now?.() ?? new Date();
  let salvata: Richiesta | null = null;
  try {
    salvata = await deps.store.richieste.crea({
      nome: r.nome,
      email: r.email,
      telefono: r.telefono,
      ruolo: r.ruolo,
      comune: r.comune,
      servizio: r.servizio,
      messaggio: r.messaggio,
      eliminareDopo: scadenza(ora),
    });
  } catch (err) {
    deps.logger.error({ event: "richiesta", esito: "salvataggio_fallito", err: err instanceof Error ? err.message : "?" });
  }
  let inviata = false;
  try {
    await deps.mailer.send({
      subject: riga(`Richiesta LiftCon: ${ETICHETTE_SERVIZIO[r.servizio]} – ${r.comune}`),
      text: testoEmail(r, salvata ? `${deps.baseUrl}/admin/richieste/${salvata.id}` : null),
      replyTo: { email: r.email, name: riga(r.nome) },
    });
    inviata = true;
  } catch (err) {
    deps.logger.error({ event: "richiesta", esito: "invio_fallito", err: err instanceof Error ? err.message : "?" });
  }
  return { ok: Boolean(salvata) || inviata, salvata: Boolean(salvata), inviata };
}

/** Нов статус: при INCARICO автоматичният срок спира; иначе тече от промяната. */
export function nuovoTermine(stato: StatoRichiesta, ora: Date): Date | null {
  return stato === "INCARICO" ? null : scadenza(ora);
}

/** CSV за Excel (UTF-8 с BOM, „;“); клетка, започваща с = + - @ (или таб/CR), получава ' — без CSV injection. */
export function csvRichieste(righe: Richiesta[]): string {
  const cella = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const intestazione = ["Data", "Stato", "Nome", "Email", "Telefono", "Ruolo", "Comune", "Servizio", "Messaggio", "Note"];
  const linee = righe.map((r) =>
    [r.creataIl.toISOString().slice(0, 16).replace("T", " "), ETICHETTE_STATO[r.stato], r.nome, r.email, r.telefono, r.ruolo, r.comune, r.servizio, r.messaggio, r.note]
      .map(cella)
      .join(";"),
  );
  return `﻿${[intestazione.map(cella).join(";"), ...linee].join("\r\n")}\r\n`;
}
