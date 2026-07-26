"use client";

// Детайл на импианта: технически данни + allegati + scadenze + tecnici assegnati.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge, Modale, ScheletroDettaglio } from "@/components/ui";
import {
  IcoFatto,
  IcoIndietro,
  IcoNuovoPiccolo,
  IcoVerso,
  IcoQr,
} from "@/components/icone";
import { dataIt } from "@/lib/format";

interface Impianto {
  id: string;
  matricola: string;
  marca: string;
  modello: string;
  anno: number | null;
  portata: number | null;
  fermate: number | null;
  stato: string;
  indirizzo: string | null;
  piano: string | null;
  dataInstallazione: string | null;
  ultimaRevisione: string | null;
  prossimaRevisione: string | null;
  note: string | null;
  condominio: { id: string; nome: string; citta: string } | null;
  amministratore: {
    id: string;
    nome: string;
    cognome: string | null;
    ragioneSociale: string | null;
    telefono: string | null;
  } | null;
  media: { id: string; tipo: string; url: string; nome: string | null }[];
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
  const [modaleMedia, setModaleMedia] = useState(false);
  const [modaleAssegna, setModaleAssegna] = useState(false);

  const carica = useCallback(async () => {
    // Филтрирането е СЪРВЪРНО (?impiantoId=…). Дърпането на цялата таблица и
    // филтриране в браузъра тихо губеше записите след първата страница.
    const [ri, rm, rs, ra] = await Promise.all([
      fetch(`/api/impianti/${id}`),
      fetch(`/api/impianti-media?impiantoId=${id}`),
      fetch(`/api/scadenze?impiantoId=${id}`),
      fetch(`/api/assegnazioni?impiantoId=${id}`),
    ]);
    if (!ri.ok) {
      setErrore("Impianto non trovato");
      return;
    }
    const base = await ri.json();
    setImp({
      ...base,
      media: rm.ok ? (await rm.json()).righe : [],
      scadenze: rs.ok ? (await rs.json()).righe : [],
      assegnazioni: ra.ok ? (await ra.json()).righe : [],
    });
  }, [id]);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (errore) return <p className="text-text-3">{errore}</p>;
  if (!imp) return <ScheletroDettaglio />;

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

        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-1">Allegati</h2>
            <button
              className="btn-secondary inline-flex h-8 items-center gap-1 px-3 text-xs"
              onClick={() => setModaleMedia(true)}
            >
              <IcoNuovoPiccolo />
              Aggiungi
            </button>
          </div>
          {imp.media.length === 0 ? (
            <p className="text-sm text-text-3">Nessun allegato.</p>
          ) : (
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {imp.media.map((m) => (
                <li key={m.id} className="rounded-md border border-border p-3">
                  <div className="text-xs uppercase text-text-3">{m.tipo}</div>
                  <div className="truncate font-medium">{m.nome ?? m.url}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modaleMedia && (
        <FormMedia
          impiantoId={imp.id}
          onChiudi={() => setModaleMedia(false)}
          onSalvato={() => {
            setModaleMedia(false);
            void carica();
          }}
        />
      )}
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
    </div>
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

function FormMedia({
  impiantoId,
  onChiudi,
  onSalvato,
}: {
  impiantoId: string;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const [form, setForm] = useState({ tipo: "documento", url: "", nome: "" });
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/impianti-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, impiantoId, nome: form.nome || null }),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    onSalvato();
  }

  return (
    <Modale titolo="Nuovo allegato" aperto onChiudi={onChiudi}>
      <form onSubmit={salva}>
        <label className="label">Tipo</label>
        <select
          className="input mb-4"
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value })}
        >
          <option value="foto">Foto</option>
          <option value="video">Video</option>
          <option value="documento">Documento</option>
        </select>
        <label className="label">Percorso file / URL *</label>
        <input
          className="input mb-4"
          required
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
        <label className="label">Nome descrittivo</label>
        <input
          className="input mb-4"
          value={form.nome}
          onChange={(e) => setForm({ ...form, nome: e.target.value })}
        />
        {errore && <p className="mb-4 text-sm text-danger-text">{errore}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onChiudi}>
            Annulla
          </button>
          <button type="submit" className="btn-primary">
            Salva
          </button>
        </div>
      </form>
    </Modale>
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
