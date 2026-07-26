"use client";

// Детайл на фактура.
//
// Страницата показва ТРИ различни неща, които дотук бяха едно поле „stato":
// жизнения цикъл на документа, пътя му през Sistema di Interscambio и
// плащането. Смесването им е причината операторът да не знае какво да прави —
// „изпратена" не казва изпратена къде, а „платена" не разграничава частичното
// постъпление от пълното.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, ScheletroDettaglio } from "@/components/ui";
import {
  IcoIndietro,
  IcoStampa,
  IcoEsporta,
  IcoAttenzione,
  IcoIntegro,
  IcoNota,
  IcoInvia,
  IcoIncasso,
  IcoElimina,
} from "@/components/icone";
import VociEditor, { type VoceRiga } from "@/components/VociEditor";
import DdtFattura from "@/components/DdtFattura";
import { euro, dataIt } from "@/lib/format";
import { MODALITA_PAGAMENTO } from "@/lib/fiscale/pagamenti";
import { azioneRichiesta, type StatoSdi } from "@/lib/fiscale/sdi-stato";

interface Pagamento {
  id: string;
  data: string;
  importo: string;
  modalita: string;
  riferimento: string | null;
}

interface NotificaSdi {
  id: string;
  tipo: string;
  dataOra: string;
  descrizione: string | null;
  errori: { codice?: string; descrizione?: string }[] | null;
}

interface Fattura {
  id: string;
  numero: string;
  tipo: string;
  stato: string;
  data: string;
  dataScadenza: string | null;
  oggetto: string | null;
  totaleNetto: string;
  totaleIva: string;
  totaleLordo: string;

  statoSdi: StatoSdi;
  identificativoSdi: string | null;
  dataInvioSdi: string | null;
  scadenzaRinvioSdi: string | null;
  progressivoInvio: string | null;

  ritenuta: boolean;
  ritenutaAliquota: string;
  ritenutaImporto: string;
  ritenutaTipo: string;
  ritenutaCausale: string;
  splitPayment: boolean;
  regimeBeniSignificativi: boolean;

  statoPagamento: string;
  totalePagato: string;
  modalitaPagamento: string;
  condizioniPagamento: string;

  condominio: {
    nome: string;
    codiceFiscale: string | null;
    citta: string;
    sostitutoImposta: boolean;
  } | null;
  amministratore: {
    nome: string;
    cognome: string | null;
    ragioneSociale: string | null;
    partitaIva: string | null;
    pec: string | null;
    indirizzo: string | null;
    citta: string | null;
  } | null;
  ordineLavoro: { numero: string; oggetto: string } | null;
  voci: VoceRiga[];
  pagamenti: Pagamento[];
  notificheSdi: NotificaSdi[];
}

interface ControlloSdi {
  pronta: boolean;
  problemi: string[];
  avvisi: string[];
  totali: {
    imponibile: string;
    imposta: string;
    ritenuta: string;
    totaleDocumento: string;
    daPagare: string;
  };
}

const STATI = ["BOZZA", "EMESSA", "INVIATA", "PAGATA", "SCADUTA", "STORNATA"];

/** Само вписванията, които операторът прави сам; останалите идват от известие. */
const AZIONI_SDI: { stato: StatoSdi; etichetta: string; da: StatoSdi[] }[] = [
  { stato: "INVIATA", etichetta: "Segna come trasmessa", da: ["GENERATA"] },
  { stato: "NON_INVIATA", etichetta: "Annulla trasmissione", da: ["GENERATA"] },
  {
    stato: "GENERATA",
    etichetta: "Riprepara per il rinvio",
    da: ["SCARTATA", "RIFIUTATA"],
  },
];

const TIPI_NOTIFICA: { tipo: string; etichetta: string; esito?: string }[] = [
  { tipo: "RC", etichetta: "RC — consegnata" },
  { tipo: "MC", etichetta: "MC — mancata consegna" },
  { tipo: "NS", etichetta: "NS — scartata" },
  { tipo: "NE", etichetta: "NE — accettata dalla PA", esito: "EC01" },
  { tipo: "NE", etichetta: "NE — rifiutata dalla PA", esito: "EC02" },
  { tipo: "DT", etichetta: "DT — decorrenza termini" },
];

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<Fattura | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  // Проверката за SDI е ЖИВА, не изведена от две-три полета в интерфейса: тя е
  // същата, която пази и самият експорт, за да не се разминат двете истини.
  const [sdi, setSdi] = useState<ControlloSdi | null>(null);
  const [incasso, setIncasso] = useState({
    importo: "",
    modalita: "MP05",
    riferimento: "",
  });
  const [occupato, setOccupato] = useState(false);

  const carica = useCallback(async () => {
    const res = await fetch(`/api/fatture/${id}`);
    if (!res.ok) {
      setErrore("Fattura non trovata");
      return;
    }
    const dati: Fattura = await res.json();
    setF(dati);
    if (dati.tipo !== "EMESSA") {
      setSdi(null);
      return;
    }
    const c = await fetch(`/api/fatture/${id}/xml?controlla=1`);
    setSdi(c.ok ? await c.json() : null);
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  /** Един път за всички действия: заявка → грешката се показва → презареждане. */
  async function agisci(url: string, opzioni: RequestInit) {
    setOccupato(true);
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...opzioni,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Errore");
        return false;
      }
      await carica();
      return true;
    } finally {
      setOccupato(false);
    }
  }

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!f) return <ScheletroDettaglio />;

  // Получателят е кондоминиумът, когато го има: студиото е представител.
  const controparte = f.condominio
    ? f.condominio.nome
    : f.amministratore
      ? (f.amministratore.ragioneSociale ??
        `${f.amministratore.nome} ${f.amministratore.cognome ?? ""}`)
      : "—";

  const avviso = azioneRichiesta(
    f.statoSdi,
    f.scadenzaRinvioSdi ? new Date(f.scadenzaRinvioSdi) : null,
    new Date(),
  );
  const daPagare = sdi?.totali.daPagare ?? f.totaleLordo;
  const residuo = (Number(daPagare) - Number(f.totalePagato)).toFixed(2);
  const azioniPossibili = AZIONI_SDI.filter((a) => a.da.includes(f.statoSdi));

  return (
    <div>
      <button
        className="btn-ghost mb-4 h-8 px-2 text-xs"
        onClick={() => router.push("/fatture")}
      >
        <IcoIndietro />
        Fatture
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">
            {f.numero}
          </h1>
          <p className="mt-1 text-sm text-text-2">{f.oggetto ?? "—"}</p>
          <p className="mt-1 text-xs text-text-3">
            {f.tipo} · {controparte}
            {f.condominio ? " (condominio)" : ""} · del {dataIt(f.data)}
            {f.dataScadenza ? ` · scade ${dataIt(f.dataScadenza)}` : ""}
            {f.ordineLavoro ? ` · ordine ${f.ordineLavoro.numero}` : ""}
          </p>
          {f.condominio && f.amministratore && (
            <p className="mt-0.5 text-xs text-text-3">
              Amministratore:{" "}
              {f.amministratore.ragioneSociale ??
                `${f.amministratore.nome} ${f.amministratore.cognome ?? ""}`}{" "}
              — rappresenta il condominio, non è il destinatario fiscale.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn-secondary inline-flex items-center gap-1.5"
            href={`/api/fatture/${id}/pdf`}
            target="_blank"
            rel="noopener"
          >
            <IcoStampa />
            Stampa
          </a>
          {f.tipo === "EMESSA" && (
            <a
              className={`btn-secondary inline-flex items-center gap-1.5 ${
                sdi && !sdi.pronta ? "pointer-events-none opacity-50" : ""
              }`}
              href={`/api/fatture/${id}/xml`}
              aria-disabled={sdi ? !sdi.pronta : undefined}
              title={
                sdi && !sdi.pronta
                  ? "Completare i requisiti elencati sotto"
                  : "Scarica il file XML da trasmettere allo SDI"
              }
            >
              <IcoEsporta />
              XML SdI
            </a>
          )}
          <Badge valore={f.stato} />
          <select
            className="input w-40"
            value={f.stato}
            onChange={(e) =>
              void agisci(`/api/fatture/${id}/stato`, {
                method: "PATCH",
                body: JSON.stringify({ stato: e.target.value }),
              })
            }
            aria-label="Cambia stato"
          >
            {STATI.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {f.tipo === "EMESSA" && sdi && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
            sdi.pronta
              ? "bg-success-subtle text-success-text"
              : "bg-warning-subtle text-warning-text"
          }`}
          role="status"
          aria-label="Requisiti per lo SdI"
        >
          {sdi.pronta ? <IcoIntegro /> : <IcoAttenzione />}
          <div>
            {sdi.pronta ? (
              "Pronta per lo SDI: i requisiti della fattura elettronica sono completi."
            ) : (
              <>
                <p className="font-medium">
                  Non esportabile allo SDI. Finché non è trasmessa, la fattura
                  si considera non emessa (art. 6 D.Lgs. 471/1997).
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {sdi.problemi.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* Предупрежденията не спират документа, но операторът трябва да ги
          прочете: те са разликата между „валидна" и „правилна" фактура. */}
      {sdi && sdi.avvisi.length > 0 && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md bg-warning-subtle px-4 py-3 text-sm text-warning-text"
          role="status"
          aria-label="Avvertenze fiscali"
        >
          <IcoNota />
          <ul className="list-disc space-y-0.5 pl-5">
            {sdi.avvisi.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {f.tipo === "EMESSA" && (
        <div className="card mb-6 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-text-1">
              Sistema di Interscambio
            </h2>
            <div className="flex items-center gap-2">
              <Badge valore={f.statoSdi} />
              {azioniPossibili.map((a) => (
                <button
                  key={a.stato + a.etichetta}
                  className="btn-secondary inline-flex items-center gap-1.5"
                  disabled={occupato}
                  onClick={() =>
                    void agisci(`/api/fatture/${id}/sdi`, {
                      method: "PATCH",
                      body: JSON.stringify({ stato: a.stato }),
                    })
                  }
                >
                  <IcoInvia />
                  {a.etichetta}
                </button>
              ))}
            </div>
          </div>

          {avviso && (
            <p className="mb-3 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning-text">
              {avviso}
            </p>
          )}

          <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-text-3">Progressivo</dt>
              <dd className="font-mono">{f.progressivoInvio ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-3">Identificativo SdI</dt>
              <dd className="font-mono">{f.identificativoSdi ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-3">Trasmessa il</dt>
              <dd>{f.dataInvioSdi ? dataIt(f.dataInvioSdi) : "—"}</dd>
            </div>
            <div>
              <dt className="text-text-3">Termine rinvio</dt>
              <dd>{f.scadenzaRinvioSdi ? dataIt(f.scadenzaRinvioSdi) : "—"}</dd>
            </div>
          </dl>

          {f.statoSdi !== "NON_INVIATA" && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-3">
                Registra notifica ricevuta:
              </span>
              {TIPI_NOTIFICA.map((n) => (
                <button
                  key={n.etichetta}
                  className="btn-ghost h-7 px-2 text-xs"
                  disabled={occupato}
                  onClick={() =>
                    void agisci(`/api/fatture/${id}/notifiche`, {
                      method: "POST",
                      body: JSON.stringify({
                        tipo: n.tipo,
                        esito: n.esito ?? null,
                      }),
                    })
                  }
                >
                  {n.etichetta}
                </button>
              ))}
            </div>
          )}

          {f.notificheSdi.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-3 text-sm">
              {f.notificheSdi.map((n) => (
                <li key={n.id} className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-text-3">
                    {dataIt(n.dataOra)}
                  </span>
                  <span className="font-medium">{n.tipo}</span>
                  <span className="text-text-2">{n.descrizione ?? ""}</span>
                  {n.errori?.map((e, i) => (
                    <span key={i} className="text-danger-text">
                      {e.codice} {e.descrizione}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="card mb-6 p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-1">Voci</h2>
        <VociEditor
          api={`/api/fatture/${id}/voci`}
          voci={f.voci}
          conPrezzi
          onCambiato={() => void carica()}
        />
        {f.regimeBeniSignificativi && (
          <p className="mt-3 text-xs text-text-3">
            Regime dei beni significativi attivo: l&apos;aliquota agevolata del
            10 % si applica al bene fino a concorrenza del valore della
            prestazione; l&apos;eccedenza è al 22 % (D.M. 29.12.1999, art. 1 c.
            19 L. 205/2017).
          </p>
        )}
      </div>

      {/* Свързването на DDT сменя типа за SDI (TD01 → TD24) — затова стои до
          редовете, а не в друг таб. */}
      {f.tipo === "EMESSA" && (
        <div className="mb-6">
          <DdtFattura fatturaId={id} onCambio={() => void carica()} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Постъпления ─────────────────────────────────────────────── */}
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-1">Incassi</h2>
            <Badge valore={f.statoPagamento} />
          </div>

          {f.pagamenti.length === 0 ? (
            <p className="mb-3 text-sm text-text-3">
              Nessun incasso registrato.
            </p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm">
              {f.pagamenti.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    <span className="font-mono text-xs text-text-3">
                      {dataIt(p.data)}
                    </span>{" "}
                    {MODALITA_PAGAMENTO[p.modalita] ?? p.modalita}
                    {p.riferimento ? ` · ${p.riferimento}` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{euro(p.importo)}</span>
                    <button
                      className="btn-ghost h-6 px-1"
                      disabled={occupato}
                      aria-label={`Elimina incasso del ${dataIt(p.data)}`}
                      onClick={() =>
                        void agisci(`/api/fatture/${id}/pagamenti/${p.id}`, {
                          method: "DELETE",
                        })
                      }
                    >
                      <IcoElimina />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {f.stato !== "BOZZA" && (
            <form
              className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await agisci(`/api/fatture/${id}/pagamenti`, {
                    method: "POST",
                    body: JSON.stringify({
                      importo: incasso.importo,
                      modalita: incasso.modalita,
                      riferimento: incasso.riferimento || null,
                    }),
                  })
                )
                  setIncasso({
                    importo: "",
                    modalita: "MP05",
                    riferimento: "",
                  });
              }}
            >
              <div>
                <label className="label" htmlFor="incasso-importo">
                  Importo
                </label>
                <input
                  id="incasso-importo"
                  className="input w-28 font-mono"
                  inputMode="decimal"
                  required
                  value={incasso.importo}
                  placeholder={residuo}
                  onChange={(e) =>
                    setIncasso({ ...incasso, importo: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label" htmlFor="incasso-modalita">
                  Modalità
                </label>
                <select
                  id="incasso-modalita"
                  className="input w-40"
                  value={incasso.modalita}
                  onChange={(e) =>
                    setIncasso({ ...incasso, modalita: e.target.value })
                  }
                >
                  {Object.entries(MODALITA_PAGAMENTO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="incasso-riferimento">
                  Riferimento
                </label>
                <input
                  id="incasso-riferimento"
                  className="input w-36"
                  value={incasso.riferimento}
                  placeholder="CRO, assegno…"
                  onChange={(e) =>
                    setIncasso({ ...incasso, riferimento: e.target.value })
                  }
                />
              </div>
              <button
                className="btn-primary inline-flex items-center gap-1.5"
                disabled={occupato}
              >
                <IcoIncasso />
                Registra
              </button>
            </form>
          )}
        </div>

        {/* ── Тотали ──────────────────────────────────────────────────── */}
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-semibold text-text-1">Totali</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-2">Imponibile</dt>
              <dd className="font-mono">{euro(f.totaleNetto)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">
                IVA
                {f.splitPayment
                  ? " (scissione dei pagamenti, art. 17-ter)"
                  : ""}
              </dt>
              <dd className="font-mono">{euro(f.totaleIva)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Totale documento</dt>
              <dd className="font-mono">{euro(f.totaleLordo)}</dd>
            </div>
            {f.ritenuta && (
              <div className="flex justify-between text-text-2">
                <dt>
                  Ritenuta d&apos;acconto {Number(f.ritenutaAliquota)} % (
                  {f.ritenutaTipo}, {f.ritenutaCausale})
                </dt>
                <dd className="font-mono">− {euro(f.ritenutaImporto)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Netto a pagare</dt>
              <dd className="font-mono">{euro(daPagare)}</dd>
            </div>
            <div className="flex justify-between text-text-2">
              <dt>Incassato</dt>
              <dd className="font-mono">{euro(f.totalePagato)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt>Residuo</dt>
              <dd className="font-mono">{euro(residuo)}</dd>
            </div>
          </dl>
          {f.ritenuta && (
            <p className="mt-3 text-xs text-text-3">
              Il condominio è sostituto d&apos;imposta (art. 25-ter D.P.R.
              600/1973): trattiene la ritenuta e la versa all&apos;erario.
              L&apos;azienda incassa il netto.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
