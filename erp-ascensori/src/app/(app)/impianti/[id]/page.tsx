"use client";

// Детайл на импианта: технически данни + allegati + scadenze + tecnici assegnati.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Modale, ScheletroDettaglio } from "@/components/ui";
import {
  IcoAttenzione,
  IcoFatto,
  IcoIndietro,
  IcoNuovoPiccolo,
  IcoVerso,
  IcoQr,
  IcoStampa,
} from "@/components/icone";
import { dataIt } from "@/lib/format";
import Allegati from "@/components/Allegati";
import CompilaConAi from "@/components/CompilaConAi";
import {
  problemiConformita,
  ESITI_VERIFICA,
  TIPI_VERIFICA,
} from "@/lib/normativa/verifiche";
import {
  TIPO_IMPIANTO_LABEL,
  REGIME_IMPIANTO_LABEL,
  type TipoImpianto,
  type RegimeImpianto,
} from "@/lib/normativa/impianti";

interface Verifica {
  id: string;
  tipo: string;
  data: string;
  esito: string;
  organismo: string | null;
  numeroVerbale: string | null;
  prescrizioni: string | null;
  scadenzaPrescrizioni: string | null;
  prossimaVerifica: string | null;
}

interface Impianto {
  id: string;
  matricola: string;
  matricolaComune: string | null;
  comune: string | null;
  dataComunicazione: string | null;
  tipo: string;
  regime: string;
  marca: string;
  modello: string;
  anno: number | null;
  portata: number | null;
  persone: number | null;
  velocita: string | null;
  fermate: number | null;
  stato: string;
  indirizzo: string | null;
  piano: string | null;
  dataInstallazione: string | null;
  organismoNotificato: string | null;
  manutentoreDal: string | null;
  ultimaRevisione: string | null;
  prossimaRevisione: string | null;
  note: string | null;
  verifiche: Verifica[];
  condominio: { id: string; nome: string; citta: string } | null;
  amministratore: {
    id: string;
    nome: string;
    cognome: string | null;
    ragioneSociale: string | null;
    telefono: string | null;
  } | null;
  scadenze: {
    id: string;
    tipo: string;
    dataScadenza: string;
    completata: boolean;
    notificato90: boolean;
    notificato60: boolean;
    notificato30: boolean;
  }[];
  assegnazioni: {
    id: string;
    dataInizio: string;
    dataFine: string | null;
    attiva: boolean;
    dipendente: { id: string; nome: string; cognome: string };
  }[];
}

export default function Pagina() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [imp, setImp] = useState<Impianto | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [modaleAssegna, setModaleAssegna] = useState(false);
  const [modaleVerifica, setModaleVerifica] = useState(false);

  const carica = useCallback(async () => {
    // Филтрирането е СЪРВЪРНО (?impiantoId=…). Дърпането на цялата таблица и
    // филтриране в браузъра тихо губеше записите след първата страница.
    const [ri, rs, ra, rv] = await Promise.all([
      fetch(`/api/impianti/${id}`),
      fetch(`/api/scadenze?impiantoId=${id}`),
      fetch(`/api/assegnazioni?impiantoId=${id}`),
      fetch(`/api/impianti/${id}/verifiche`),
    ]);
    if (!ri.ok) {
      setErrore("Impianto non trovato");
      return;
    }
    const base = await ri.json();
    setImp({
      ...base,
      scadenze: rs.ok ? (await rs.json()).righe : [],
      assegnazioni: ra.ok ? (await ra.json()).righe : [],
      verifiche: rv.ok ? (await rv.json()).righe : [],
    });
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!imp) return <ScheletroDettaglio />;

  // Същата проверка като на сървъра — една истина за това какво липсва.
  const problemiNorma = problemiConformita({
    matricolaComune: imp.matricolaComune,
    comune: imp.comune,
    dataComunicazione: imp.dataComunicazione
      ? new Date(imp.dataComunicazione)
      : null,
    regime: imp.regime,
    organismoNotificato: imp.organismoNotificato,
  });

  const amministratore = imp.amministratore
    ? (imp.amministratore.ragioneSociale ??
      `${imp.amministratore.nome} ${imp.amministratore.cognome ?? ""}`)
    : "—";

  return (
    <div>
      <button
        className="btn-ghost mb-4 h-8 px-2 text-xs"
        onClick={() => router.push("/impianti")}
      >
        <IcoIndietro />
        Impianti
      </button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-text-1">
            {imp.matricola}
          </h1>
          <p className="mt-1 text-sm text-text-2">
            {imp.marca} {imp.modello}
            {imp.anno ? ` · ${imp.anno}` : ""}
          </p>
          <p className="mt-1 text-xs text-text-3">
            {imp.indirizzo ?? "—"} · {imp.condominio?.nome ?? "—"} ·
            amministratore: {amministratore}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            className="btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
            href={`/api/impianti/${id}/libretto`}
            target="_blank"
            rel="noopener"
            title="Fascicolo completo dell'impianto: identificazione, verifiche, interventi"
          >
            <IcoStampa />
            Libretto
          </a>
          <a
            className="btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
            href={`/api/impianti/${id}/qr`}
            target="_blank"
            rel="noopener"
            title="Etichetta da applicare in sala macchine"
          >
            <IcoQr />
            QR
          </a>
          <Badge valore={imp.stato} />
        </div>
      </div>

      {/* Правната самоличност на уредбата. Стои НАД техническите данни,
          защото без нея уредбата формално не е в служба — а именно това
          проверява контролният орган, не марката на редуктора. */}
      <div className="card mb-6 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-text-1">
            Conformità normativa
          </h2>
          <button
            className="btn-secondary inline-flex items-center gap-1.5"
            onClick={() => setModaleVerifica(true)}
          >
            <IcoNuovoPiccolo />
            Registra verifica
          </button>
        </div>

        {imp.stato === "FERMO_AMMINISTRATIVO" && (
          <p
            role="status"
            aria-label="Fermo amministrativo"
            className="mb-3 flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
          >
            <IcoAttenzione />
            <span>
              <strong>Impianto in fermo amministrativo.</strong> A seguito di
              verifica con esito negativo l&apos;impianto è stato messo fuori
              servizio (art. 14 c.2 D.P.R. 162/1999). Può tornare in servizio
              solo registrando una nuova verifica con esito positivo.
            </span>
          </p>
        )}

        {problemiNorma.length > 0 && (
          <ul className="mb-3 list-disc space-y-0.5 rounded-md bg-warning-subtle px-3 py-2 pl-7 text-sm text-warning-text">
            {problemiNorma.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-text-3">Matricola Comune</dt>
            <dd className="font-mono">{imp.matricolaComune ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-3">Comune</dt>
            <dd>{imp.comune ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-3">Comunicazione art. 12</dt>
            <dd>{dataIt(imp.dataComunicazione)}</dd>
          </div>
          <div>
            <dt className="text-text-3">Tipologia</dt>
            <dd>{TIPO_IMPIANTO_LABEL[imp.tipo as TipoImpianto] ?? imp.tipo}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-text-3">Regime</dt>
            <dd>
              {REGIME_IMPIANTO_LABEL[imp.regime as RegimeImpianto] ??
                imp.regime}
            </dd>
          </div>
          <div>
            <dt className="text-text-3">Verifiche periodiche</dt>
            <dd>{imp.organismoNotificato ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-3">In manutenzione da</dt>
            <dd>{dataIt(imp.manutentoreDal)}</dd>
          </div>
        </dl>

        <h3 className="mt-4 mb-2 text-sm font-semibold text-text-2">
          Verifiche periodiche (art. 13 D.P.R. 162/1999)
        </h3>
        {imp.verifiche.length === 0 ? (
          <p className="text-sm text-text-3">
            Nessuna verifica registrata. La verifica biennale è a carico del
            proprietario ed è eseguita da un organismo notificato, dall&apos;ASL
            o dall&apos;ARPA — non dalla ditta di manutenzione.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {imp.verifiche.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-text-3">
                  {dataIt(v.data)}
                </span>
                <Badge valore={v.esito} />
                <span className="text-text-2">
                  {v.tipo === "PERIODICA"
                    ? "Periodica"
                    : v.tipo === "STRAORDINARIA"
                      ? "Straordinaria"
                      : "Messa in servizio"}
                  {v.organismo ? ` · ${v.organismo}` : ""}
                  {v.numeroVerbale ? ` · verbale ${v.numeroVerbale}` : ""}
                </span>
                {v.prossimaVerifica && (
                  <span className="text-xs text-text-3">
                    prossima: {dataIt(v.prossimaVerifica)}
                  </span>
                )}
                {v.prescrizioni && (
                  <span className="w-full text-xs text-warning-text">
                    Prescrizioni: {v.prescrizioni}
                    {v.scadenzaPrescrizioni
                      ? ` (entro il ${dataIt(v.scadenzaPrescrizioni)})`
                      : ""}
                  </span>
                )}
                {/* САМИЯТ ВЕРБАЛ. Дотук се пазеше само НОМЕРЪТ му — а при
                    проверка се иска документът, не номерът. Той идва от
                    организма на хартия или в PDF и трябва да стои закачен за
                    проверката, не в чужда папка. */}
                <div className="w-full">
                  <Allegati
                    entita="verifiche_impianti"
                    entitaId={v.id}
                    titolo="Verbale e allegati della verifica"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-6">
        <Allegati
          entita="impianti"
          entitaId={imp.id}
          titolo="Documentazione dell'impianto"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3 text-lg font-semibold text-text-1">
            Dati tecnici
          </h2>
          <dl className="space-y-2 text-sm">
            <Riga
              label="Portata"
              valore={imp.portata ? `${imp.portata} kg` : "—"}
            />
            <Riga label="Persone" valore={imp.persone ?? "—"} />
            <Riga
              label="Velocità"
              valore={imp.velocita ? `${Number(imp.velocita)} m/s` : "—"}
            />
            <Riga label="Fermate" valore={imp.fermate ?? "—"} />
            <Riga label="Locale macchine" valore={imp.piano ?? "—"} />
            <Riga
              label="Installazione"
              valore={dataIt(imp.dataInstallazione)}
            />
            <Riga
              label="Ultima revisione"
              valore={dataIt(imp.ultimaRevisione)}
            />
            <Riga
              label="Prossima revisione"
              valore={dataIt(imp.prossimaRevisione)}
            />
          </dl>
          {imp.note && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-text-2">
              {imp.note}
            </p>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-1">
              Scadenze di legge
            </h2>
          </div>
          {imp.scadenze.length === 0 ? (
            <p className="text-sm text-text-3">Nessuna scadenza registrata.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {imp.scadenze.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    {s.tipo} · {dataIt(s.dataScadenza)}
                  </span>
                  {s.completata ? (
                    <span className="rounded-sm bg-success-subtle px-2 py-0.5 text-xs text-success-text">
                      completata
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 font-mono text-xs text-text-3">
                      {([90, 60, 30] as const).map((giorni) => {
                        const inviato =
                          giorni === 90
                            ? s.notificato90
                            : giorni === 60
                              ? s.notificato60
                              : s.notificato30;
                        return (
                          <span
                            key={giorni}
                            className="inline-flex items-center gap-0.5"
                          >
                            {giorni}
                            {inviato && (
                              <>
                                <IcoFatto />
                                <span className="sr-only">avviso inviato</span>
                              </>
                            )}
                          </span>
                        );
                      })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 inline-flex items-center gap-1 text-xs text-text-3">
            Gestione completa
            <IcoVerso />
            pagina «Scadenze»
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-1">
              Tecnici assegnati
            </h2>
            <button
              className="btn-secondary inline-flex h-8 items-center gap-1 px-3 text-xs"
              onClick={() => setModaleAssegna(true)}
            >
              <IcoNuovoPiccolo />
              Assegna
            </button>
          </div>
          {imp.assegnazioni.length === 0 ? (
            <p className="text-sm text-text-3">Nessun tecnico assegnato.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {imp.assegnazioni.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    {a.dipendente.cognome} {a.dipendente.nome}
                  </span>
                  <span className="text-xs text-text-3">
                    <span className="inline-flex items-center gap-1">
                      {dataIt(a.dataInizio)}
                      <IcoVerso />
                      {a.dataFine ? dataIt(a.dataFine) : "in corso"}
                    </span>
                    {a.attiva && (
                      <span className="ml-1 rounded-sm bg-success-subtle px-1.5 text-success-text">
                        attiva
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {modaleAssegna && (
        <FormAssegnazione
          impiantoId={imp.id}
          onChiudi={() => setModaleAssegna(false)}
          onSalvato={() => {
            setModaleAssegna(false);
            void carica();
          }}
        />
      )}
      {modaleVerifica && (
        <FormVerifica
          impiantoId={imp.id}
          onChiudi={() => setModaleVerifica(false)}
          onSalvato={() => {
            setModaleVerifica(false);
            void carica();
          }}
        />
      )}
    </div>
  );
}

/**
 * Вписване на законовата проверка.
 *
 * Формата казва изрично какво ще стане при отрицателен изход: операторът не
 * бива да научава от списъка, че уредбата е спряна.
 */
function FormVerifica({
  impiantoId,
  onChiudi,
  onSalvato,
}: {
  impiantoId: string;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const oggi = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    tipo: "PERIODICA",
    data: oggi,
    esito: "POSITIVO",
    organismo: "",
    numeroVerbale: "",
    prescrizioni: "",
    scadenzaPrescrizioni: "",
    note: "",
  });
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setSalvataggio(true);
    try {
      const res = await fetch(`/api/impianti/${impiantoId}/verifiche`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: form.tipo,
          data: form.data,
          esito: form.esito,
          organismo: form.organismo || null,
          numeroVerbale: form.numeroVerbale || null,
          prescrizioni: form.prescrizioni || null,
          scadenzaPrescrizioni: form.scadenzaPrescrizioni || null,
          note: form.note || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErrore(d.error ?? "Errore");
        return;
      }
      onSalvato();
    } finally {
      setSalvataggio(false);
    }
  }

  const ETICHETTA_ESITO: Record<string, string> = {
    POSITIVO: "Positivo",
    CON_PRESCRIZIONI: "Positivo con prescrizioni",
    NEGATIVO: "Negativo — fermo dell'impianto",
  };
  const ETICHETTA_TIPO: Record<string, string> = {
    PERIODICA: "Periodica (biennale, art. 13)",
    STRAORDINARIA: "Straordinaria (art. 14)",
    MESSA_IN_SERVIZIO: "Messa in servizio",
  };

  return (
    <Modale titolo="Registra verifica" aperto onChiudi={onChiudi} largo>
      <form onSubmit={salva}>
        {/* Най-полезното приложение на четенето: протоколът от проверката е
            плътен документ, а всяко негово поле има правна тежест. */}
        <CompilaConAi
          modulo="verifiche"
          etichette={{
            data: "Data della verifica",
            esito: "Esito",
            organismo: "Organismo verificatore",
            numeroVerbale: "Numero del verbale",
            prescrizioni: "Prescrizioni",
            scadenzaPrescrizioni: "Termine per le prescrizioni",
            tipo: "Tipo di verifica",
          }}
          valoriAttuali={form}
          onCompila={(campi) =>
            setForm((prev) => ({
              ...prev,
              ...Object.fromEntries(
                Object.entries(campi).map(([k, v]) => [k, String(v ?? "")]),
              ),
            }))
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="v-tipo">
              Tipo di verifica
            </label>
            <select
              id="v-tipo"
              className="input"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              {TIPI_VERIFICA.map((t) => (
                <option key={t} value={t}>
                  {ETICHETTA_TIPO[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="v-data">
              Data
            </label>
            <input
              id="v-data"
              type="date"
              className="input"
              required
              value={form.data}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="v-esito">
              Esito
            </label>
            <select
              id="v-esito"
              className="input"
              value={form.esito}
              aria-describedby="v-esito-aiuto"
              onChange={(e) => setForm({ ...form, esito: e.target.value })}
            >
              {ESITI_VERIFICA.map((x) => (
                <option key={x} value={x}>
                  {ETICHETTA_ESITO[x]}
                </option>
              ))}
            </select>
            <p id="v-esito-aiuto" className="mt-1 text-xs text-text-3">
              {form.esito === "NEGATIVO"
                ? "L'impianto sarà messo in fermo amministrativo: potrà tornare in servizio solo con una nuova verifica positiva (art. 14 c.2 D.P.R. 162/1999)."
                : "La prossima verifica sarà fissata a due anni dalla data indicata."}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="v-organismo">
              Organismo verificatore
            </label>
            <input
              id="v-organismo"
              className="input"
              placeholder="Organismo notificato, ASL, ARPA…"
              value={form.organismo}
              onChange={(e) => setForm({ ...form, organismo: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="v-verbale">
              Numero verbale
            </label>
            <input
              id="v-verbale"
              className="input font-mono"
              value={form.numeroVerbale}
              onChange={(e) =>
                setForm({ ...form, numeroVerbale: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="v-scadenza">
              Termine per le prescrizioni
            </label>
            <input
              id="v-scadenza"
              type="date"
              className="input"
              value={form.scadenzaPrescrizioni}
              onChange={(e) =>
                setForm({ ...form, scadenzaPrescrizioni: e.target.value })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="v-prescrizioni">
              Prescrizioni
            </label>
            <textarea
              id="v-prescrizioni"
              className="input min-h-20 py-2"
              value={form.prescrizioni}
              onChange={(e) =>
                setForm({ ...form, prescrizioni: e.target.value })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="v-note">
              Note
            </label>
            <textarea
              id="v-note"
              className="input min-h-16 py-2"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        {errore && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
          >
            {errore}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onChiudi}>
            Annulla
          </button>
          <button type="submit" className="btn-primary" disabled={salvataggio}>
            {salvataggio ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </form>
    </Modale>
  );
}

function Riga({ label, valore }: { label: string; valore: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-3">{label}</dt>
      <dd className="text-right">{valore}</dd>
    </div>
  );
}

function FormAssegnazione({
  impiantoId,
  onChiudi,
  onSalvato,
}: {
  impiantoId: string;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const [dipendenti, setDipendenti] = useState<
    { id: string; nome: string; cognome: string }[]
  >([]);
  const [dipendenteId, setDipendenteId] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/dipendenti?size=200&attivo=true")
      .then((r) => r.json())
      .then((d) => setDipendenti(d.righe ?? []));
  }, []);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/assegnazioni", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ impiantoId, dipendenteId }),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    onSalvato();
  }

  return (
    <Modale titolo="Assegna tecnico" aperto onChiudi={onChiudi}>
      <form onSubmit={salva}>
        <label className="label">Tecnico responsabile *</label>
        <select
          className="input mb-4"
          required
          value={dipendenteId}
          onChange={(e) => setDipendenteId(e.target.value)}
        >
          <option value="">—</option>
          {dipendenti.map((d) => (
            <option key={d.id} value={d.id}>
              {d.cognome} {d.nome}
            </option>
          ))}
        </select>
        {errore && <p className="mb-4 text-sm text-danger-text">{errore}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onChiudi}>
            Annulla
          </button>
          <button type="submit" className="btn-primary">
            Assegna
          </button>
        </div>
      </form>
    </Modale>
  );
}
