"use client";

// Опашката от известия — само ГЛЕДКА. Бутон „прати сега" няма нарочно.
//
// Изпращането минава през автоматизъм, който оставя следа в `automatismi_run`;
// оттам dead-man проверката знае кога е било последно. Ръчно натискане би
// заобиколило следата и алармата за спрели известия би мълчала, докато някой
// натиска — най-лошият вид покритие, защото изглежда като работеща система.

import { useEffect, useState } from "react";
import { IcoAttenzione, IcoNota, IcoIntegro } from "@/components/icone";
import { dataOraIt } from "@/lib/format";

interface Riga {
  id: string;
  tipo: string;
  destinatario: string;
  oggetto: string;
  stato: "IN_ATTESA" | "INVIATA" | "FALLITA";
  tentativi: number;
  prossimoTentativo: string;
  inviataAt: string | null;
  ultimoErrore: string | null;
  createdAt: string;
}

interface Esito {
  righe: Riga[];
  inAttesa: number;
  fallite: number;
  smtpConfigurato: boolean;
}

const ETICHETTA_TIPO: Record<string, string> = {
  SCADENZA_IMPIANTO: "Scadenza impianto",
  SCADENZA_AUTOMEZZO: "Automezzo",
  FATTURA_SCADUTA: "Fattura scaduta",
  PREVENTIVO_SCADUTO: "Preventivo scaduto",
};

const ETICHETTA_STATO: Record<Riga["stato"], string> = {
  IN_ATTESA: "in coda",
  INVIATA: "inviata",
  FALLITA: "non inviata",
};

export default function CodaNotifiche() {
  const [d, setD] = useState<Esito | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetch("/api/notifiche?size=20")
      .then((r) => (r.ok ? (r.json() as Promise<Esito>) : null))
      .then((v) => vivo && v && setD(v))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  if (!d) return null;

  return (
    <section className="card mt-6 p-5">
      <h2 className="mb-1 text-lg font-semibold text-text-1">
        Avvisi di scadenza
      </h2>
      <p className="mb-4 text-sm text-text-3">
        Il controllo notturno mette gli avvisi in coda; un automatismo separato
        li invia. I destinatari si impostano in Dati aziendali.
      </p>

      {!d.smtpConfigurato && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2.5 text-sm text-warning-text"
          role="status"
        >
          <IcoNota />
          <span>
            Server di posta non configurato: gli avvisi restano in coda e non
            vanno persi, ma nessuno parte. Servono le variabili{" "}
            <code className="font-mono">SMTP_HOST</code> e{" "}
            <code className="font-mono">SMTP_MITTENTE</code> sul server.
          </span>
        </div>
      )}

      {d.fallite > 0 && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2.5 text-sm text-danger-text"
          role="status"
        >
          <IcoAttenzione />
          <span>
            {d.fallite} {d.fallite === 1 ? "avviso" : "avvisi"} non{" "}
            {d.fallite === 1 ? "recapitato" : "recapitati"} dopo tutti i
            tentativi: di norma l&apos;indirizzo è sbagliato.
          </span>
        </div>
      )}

      {d.righe.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-text-3">
          <IcoIntegro />
          Nessun avviso: o non ci sono scadenze in soglia, o la funzione non è
          attiva in Dati aziendali.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-text-3">
              <tr>
                <th className="pb-2 pr-3">Tipo</th>
                <th className="pb-2 pr-3">Oggetto</th>
                <th className="pb-2 pr-3">Destinatario</th>
                <th className="pb-2 pr-3">Stato</th>
                <th className="pb-2 text-right">Quando</th>
              </tr>
            </thead>
            <tbody>
              {d.righe.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 text-text-2">
                    {ETICHETTA_TIPO[r.tipo] ?? r.tipo}
                  </td>
                  <td className="py-2 pr-3">{r.oggetto}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {r.destinatario}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        r.stato === "INVIATA"
                          ? "text-success-text"
                          : r.stato === "FALLITA"
                            ? "text-danger-text"
                            : "text-text-3"
                      }
                    >
                      {ETICHETTA_STATO[r.stato]}
                    </span>
                    {r.stato !== "INVIATA" && r.tentativi > 0 && (
                      <span className="ml-1 text-xs text-text-3">
                        ({r.tentativi} tent.)
                      </span>
                    )}
                    {/* Причината се показва: „не е изпратено" без „защо" праща
                        оператора да гадае, а обяснението почти винаги е
                        сгрешен адрес. */}
                    {r.ultimoErrore && (
                      <span className="block text-xs text-text-3">
                        {r.ultimoErrore}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-xs text-text-3">
                    {dataOraIt(r.inviataAt ?? r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
