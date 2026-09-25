"use client";

// Управление на потребители — ADMIN+. Изтриване: само MASTER (сървърно наложено).
//
// Действията по сигурността на чужд акаунт (отключване, нулиране на втория
// фактор, прекратяване на сесиите, ИИ за акаунта) са в отделен диалог, не в
// реда: таблицата остава четима на телефон, а всяко действие носи обяснение
// какво ще се случи. Кой какво може да направи решава СЪРВЪРЪТ
// (`utenteGestibile`); бутоните тук само не предлагат очевидно невъзможното.

import { useCallback, useEffect, useState } from "react";
import { Modale, Vuoto } from "@/components/ui";
import { dataOraIt } from "@/lib/format";
import { RUOLI, RUOLO_LABEL, type Ruolo } from "@/lib/roles";
import { IcoNuovo } from "@/components/icone";

interface Utente {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: Ruolo;
  attivo: boolean;
  tentativi: number;
  bloccatoFino: string | null;
  totpAttivo: boolean;
  aiConsentita: boolean;
  ultimoAccesso: string | null;
  tenantId: string | null;
}

interface Io {
  id: string;
  ruolo: Ruolo;
  aziendaContesto: { id: string } | null;
}

interface Azienda {
  id: string;
  ragioneSociale: string;
}

const PRIVILEGIATI: Ruolo[] = ["MASTER", "ADMIN"];

function bloccato(u: Utente): boolean {
  return Boolean(u.bloccatoFino && new Date(u.bloccatoFino) > new Date());
}

async function chiama(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; errore?: string }> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  if (res.ok) return { ok: true };
  const d = await res.json().catch(() => ({}));
  return { ok: false, errore: d.error ?? "Errore" };
}

export default function Pagina() {
  const [righe, setRighe] = useState<Utente[]>([]);
  const [io, setIo] = useState<Io | null>(null);
  const [aziende, setAziende] = useState<Azienda[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [modale, setModale] = useState<"crea" | Utente | null>(null);
  const [reset, setReset] = useState<Utente | null>(null);
  const [sicurezza, setSicurezza] = useState<Utente | null>(null);
  const [cerca, setCerca] = useState("");

  const carica = useCallback(async () => {
    const res = await fetch("/api/utenti");
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    setRighe(d.righe);
    setSicurezza((prec) =>
      prec ? (d.righe.find((u: Utente) => u.id === prec.id) ?? null) : null,
    );
  }, []);

  useEffect(() => {
    void carica();
    void (async () => {
      const r = await fetch("/api/me");
      if (!r.ok) return;
      const me: Io = await r.json();
      setIo(me);
      // Фирмите са служебна таблица — само MASTER ги вижда (и му трябват:
      // той управлява потребителите на всички).
      if (me.ruolo === "MASTER") {
        const t = await fetch("/api/tenants?size=100");
        if (t.ok) setAziende((await t.json()).righe ?? []);
      }
    })();
  }, [carica]);

  const master = io?.ruolo === "MASTER";
  // Колоната „Azienda“ — само ако има фирми: в еднофирмена инсталация е цялата „—“.
  const conAziende = master && aziende.length > 0;
  const nomeAzienda = (id: string | null) =>
    id === null
      ? "—"
      : (aziende.find((a) => a.id === id)?.ragioneSociale ?? "—");

  const filtro = cerca.trim().toLowerCase();
  const visibili = filtro
    ? righe.filter((u) =>
        `${u.cognome} ${u.nome} ${u.email}`.toLowerCase().includes(filtro),
      )
    : righe;

  if (errore) return <Vuoto messaggio={errore} />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            Utenti
          </h1>
          <p className="mt-1 text-sm text-text-3">
            Sette livelli di accesso, verificati dal server a ogni richiesta
          </p>
        </div>
        <button
          className="btn-primary inline-flex items-center gap-1.5"
          onClick={() => setModale("crea")}
        >
          <IcoNuovo />
          Nuovo utente
        </button>
      </div>

      <div className="mb-4">
        <label className="sr-only" htmlFor="cerca-utenti">
          Cerca utente
        </label>
        <input
          id="cerca-utenti"
          type="search"
          className="input max-w-sm"
          placeholder="Cerca per nome o email"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
        />
      </div>

      {/* Под `sm` — карти: в таблицата действията оставаха зад
          хоризонтален скрол, тоест „Sicurezza" не се виждаше на телефон. */}
      <ul className="space-y-3 sm:hidden">
        {visibili.map((u) => (
          <li key={u.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-text-1">
                  {u.cognome} {u.nome}
                  {u.id === io?.id && (
                    <span className="ml-2 text-xs font-normal text-text-3">
                      (tu)
                    </span>
                  )}
                </p>
                <p className="break-all text-sm text-text-2">{u.email}</p>
                <p className="mt-1 text-xs text-text-3">
                  {RUOLO_LABEL[u.ruolo]}
                  {conAziende ? ` · ${nomeAzienda(u.tenantId)}` : ""}
                  {" · 2FA "}
                  {u.totpAttivo ? "attiva" : "non attiva"}
                  {u.aiConsentita ? "" : " · AI disattivata"}
                </p>
              </div>
              <StatoUtente u={u} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="btn-secondary h-8 px-3 text-xs"
                onClick={() => setModale(u)}
              >
                Modifica
              </button>
              <button
                className="btn-secondary h-8 px-3 text-xs"
                onClick={() => setReset(u)}
              >
                Password
              </button>
              <button
                className="btn-secondary h-8 px-3 text-xs"
                onClick={() => setSicurezza(u)}
              >
                Sicurezza
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="card relative hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-text-3">
              <th className="px-3 py-2.5">Nominativo</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Ruolo</th>
              {conAziende && <th className="px-3 py-2.5">Azienda</th>}
              <th className="px-3 py-2.5">Stato</th>
              <th className="px-3 py-2.5">2FA</th>
              <th className="px-3 py-2.5">AI</th>
              <th className="px-3 py-2.5">Ultimo accesso</th>
              <th className="px-3 py-2.5 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((u) => (
              <tr
                key={u.id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="px-3 py-2.5 font-medium">
                  {u.cognome} {u.nome}
                  {u.id === io?.id && (
                    <span className="ml-2 text-xs font-normal text-text-3">
                      (tu)
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-text-2">
                  {u.email}
                </td>
                <td className="px-3 py-2.5">{RUOLO_LABEL[u.ruolo]}</td>
                {conAziende && (
                  <td className="px-3 py-2.5 text-text-2">
                    {nomeAzienda(u.tenantId)}
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <StatoUtente u={u} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {u.totpAttivo ? (
                    <span className="text-success-text">Attiva</span>
                  ) : PRIVILEGIATI.includes(u.ruolo) ? (
                    <span className="text-danger-text">Da attivare</span>
                  ) : (
                    <span className="text-text-3">No</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {u.aiConsentita ? (
                    <span className="text-text-2">Consentita</span>
                  ) : (
                    <span className="text-text-3">Disattivata</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-text-2">
                  {dataOraIt(u.ultimoAccesso)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <button
                    className="btn-ghost h-7 px-2 text-xs"
                    onClick={() => setModale(u)}
                  >
                    Modifica
                  </button>
                  <button
                    className="btn-ghost h-7 px-2 text-xs"
                    onClick={() => setReset(u)}
                  >
                    Password
                  </button>
                  <button
                    className="btn-ghost h-7 px-2 text-xs"
                    onClick={() => setSicurezza(u)}
                  >
                    Sicurezza
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibili.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-text-3">
          Nessun utente corrisponde alla ricerca.
        </p>
      )}

      {modale && (
        <FormUtente
          utente={modale === "crea" ? null : modale}
          master={master}
          aziende={aziende}
          contesto={io?.aziendaContesto?.id ?? null}
          onChiudi={() => setModale(null)}
          onSalvato={() => {
            setModale(null);
            void carica();
          }}
        />
      )}
      {reset && (
        <FormPassword
          utente={reset}
          onChiudi={() => setReset(null)}
          onSalvato={() => setReset(null)}
        />
      )}
      {sicurezza && (
        <SicurezzaUtente
          utente={sicurezza}
          io={io}
          onChiudi={() => setSicurezza(null)}
          onCambiato={() => void carica()}
        />
      )}
    </div>
  );
}

function StatoUtente({ u }: { u: Utente }) {
  if (bloccato(u))
    return (
      <span className="whitespace-nowrap rounded-sm bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">
        Bloccato
      </span>
    );
  return u.attivo ? (
    <span className="whitespace-nowrap rounded-sm bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-text">
      Attivo
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-sm bg-surface-3 px-2 py-0.5 text-xs font-medium text-text-3">
      Sospeso
    </span>
  );
}

function SicurezzaUtente({
  utente,
  io,
  onChiudi,
  onCambiato,
}: {
  utente: Utente;
  io: Io | null;
  onChiudi: () => void;
  onCambiato: () => void;
}) {
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(
    null,
  );
  const [inCorso, setInCorso] = useState(false);
  const se = utente.id === io?.id;
  // ADMIN над ADMIN: сървърът отказва нулирането на втория фактор (403) —
  // тук само не го предлагаме, за да не изглежда като грешка на екрана.
  const puoAzzerare2fa =
    !se && (io?.ruolo === "MASTER" || !PRIVILEGIATI.includes(utente.ruolo));

  async function azione(
    url: string,
    init: RequestInit,
    riuscita: string,
    conferma?: string,
  ) {
    if (conferma && !confirm(conferma)) return;
    setInCorso(true);
    setEsito(null);
    const r = await chiama(url, init);
    setInCorso(false);
    setEsito(
      r.ok
        ? { ok: true, testo: riuscita }
        : { ok: false, testo: r.errore ?? "Errore" },
    );
    if (r.ok) onCambiato();
  }

  const base = `/api/utenti/${utente.id}`;

  return (
    <Modale
      titolo={`Sicurezza — ${utente.cognome} ${utente.nome}`}
      aperto
      onChiudi={onChiudi}
    >
      <dl className="mb-5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2 sm:gap-y-2">
        <dt className="text-text-3">Email</dt>
        <dd className="mb-2 break-all text-text-1 sm:mb-0">{utente.email}</dd>
        <dt className="text-text-3">Tentativi falliti</dt>
        <dd className="mb-2 text-text-1 sm:mb-0">{utente.tentativi}</dd>
        <dt className="text-text-3">Blocco</dt>
        <dd className="mb-2 text-text-1 sm:mb-0">
          {bloccato(utente)
            ? `fino alle ${dataOraIt(utente.bloccatoFino)}`
            : "nessuno"}
        </dd>
        <dt className="text-text-3">Verifica in due passaggi</dt>
        <dd className="mb-2 text-text-1 sm:mb-0">
          {utente.totpAttivo ? "attiva" : "non attiva"}
        </dd>
      </dl>

      <ul className="divide-y divide-border">
        <Riga
          titolo="Sblocca l'accesso"
          testo="Azzera i tentativi falliti e rimuove il blocco temporaneo."
        >
          <button
            type="button"
            className="btn-secondary"
            disabled={inCorso || (!bloccato(utente) && utente.tentativi === 0)}
            onClick={() =>
              void azione(
                `${base}/sblocca`,
                { method: "POST" },
                "Accesso sbloccato.",
              )
            }
          >
            Sblocca
          </button>
        </Riga>
        <Riga
          titolo="Termina tutte le sessioni"
          testo="Chiude l'accesso su ogni dispositivo: servirà un nuovo login."
        >
          <button
            type="button"
            className="btn-secondary"
            disabled={inCorso || se}
            onClick={() =>
              void azione(
                `${base}/sessioni`,
                { method: "DELETE" },
                "Sessioni terminate.",
              )
            }
          >
            Termina
          </button>
        </Riga>
        {puoAzzerare2fa && utente.totpAttivo && (
          <Riga
            titolo="Azzera la verifica in due passaggi"
            testo="Per un telefono perso senza codici di recupero. Al prossimo accesso andrà configurata di nuovo."
          >
            <button
              type="button"
              className="btn-secondary text-danger-text"
              disabled={inCorso}
              onClick={() =>
                void azione(
                  `${base}/mfa`,
                  { method: "DELETE" },
                  "Verifica in due passaggi azzerata; sessioni terminate.",
                  `Azzerare la verifica in due passaggi di ${utente.email}? Tutte le sue sessioni verranno chiuse.`,
                )
              }
            >
              Azzera
            </button>
          </Riga>
        )}
        <Riga
          titolo="Assistente AI"
          testo={
            utente.aiConsentita
              ? "Consentito per questo account (se attivo a livello globale e per il ruolo)."
              : "Disattivato per questo account, qualunque sia l'impostazione globale."
          }
        >
          <button
            type="button"
            className="btn-secondary"
            disabled={inCorso}
            onClick={() =>
              void azione(
                base,
                {
                  method: "PUT",
                  body: JSON.stringify({ aiConsentita: !utente.aiConsentita }),
                },
                utente.aiConsentita
                  ? "AI disattivata per l'account."
                  : "AI consentita per l'account.",
              )
            }
          >
            {utente.aiConsentita ? "Disattiva" : "Consenti"}
          </button>
        </Riga>
        {!se && (
          <Riga
            titolo={utente.attivo ? "Sospendi l'account" : "Riattiva l'account"}
            testo={
              utente.attivo
                ? "Blocca l'accesso senza perdere lo storico; le sessioni si chiudono subito."
                : "L'utente potrà accedere di nuovo con la sua password."
            }
          >
            <button
              type="button"
              className="btn-secondary"
              disabled={inCorso}
              onClick={() =>
                void azione(
                  base,
                  {
                    method: "PUT",
                    body: JSON.stringify({ attivo: !utente.attivo }),
                  },
                  utente.attivo ? "Account sospeso." : "Account riattivato.",
                )
              }
            >
              {utente.attivo ? "Sospendi" : "Riattiva"}
            </button>
          </Riga>
        )}
        {io?.ruolo === "MASTER" && !se && (
          <Riga
            titolo="Elimina definitivamente"
            testo="Solo MASTER. Se l'utente compare in documenti o interventi l'eliminazione è rifiutata: va sospeso."
          >
            <button
              type="button"
              className="btn-secondary text-danger-text"
              disabled={inCorso}
              onClick={() =>
                void (async () => {
                  if (
                    !confirm(
                      `Eliminare DEFINITIVAMENTE ${utente.email}? L'operazione non è reversibile.`,
                    )
                  )
                    return;
                  const r = await chiama(base, { method: "DELETE" });
                  if (!r.ok) {
                    setEsito({ ok: false, testo: r.errore ?? "Errore" });
                    return;
                  }
                  onCambiato();
                  onChiudi();
                })()
              }
            >
              Elimina
            </button>
          </Riga>
        )}
      </ul>

      {esito && (
        <p
          role={esito.ok ? "status" : "alert"}
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            esito.ok
              ? "bg-success-subtle text-success-text"
              : "bg-danger-subtle text-danger-text"
          }`}
        >
          {esito.testo}
        </p>
      )}
    </Modale>
  );
}

function Riga({
  titolo,
  testo,
  children,
}: {
  titolo: string;
  testo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-1">{titolo}</p>
        <p className="text-xs text-text-3">{testo}</p>
      </div>
      {children}
    </li>
  );
}

function FormUtente({
  utente,
  master,
  aziende,
  contesto,
  onChiudi,
  onSalvato,
}: {
  utente: Utente | null;
  master: boolean;
  aziende: Azienda[];
  /** Фирмата, в която MASTER работи — по подразбиране за нов потребител. */
  contesto: string | null;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const [form, setForm] = useState({
    email: utente?.email ?? "",
    password: "",
    nome: utente?.nome ?? "",
    cognome: utente?.cognome ?? "",
    ruolo: utente?.ruolo ?? "OPERATORE",
    tenantId: (utente ? utente.tenantId : contesto) ?? "",
  });
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const url = utente ? `/api/utenti/${utente.id}` : "/api/utenti";
    const comune = {
      email: form.email,
      nome: form.nome,
      cognome: form.cognome,
      ruolo: form.ruolo,
      // Фирмата се праща само от MASTER — на ADMIN сървърът я налага сам.
      ...(master ? { tenantId: form.tenantId || null } : {}),
    };
    const corpo = utente ? comune : { ...comune, password: form.password };
    const res = await fetch(url, {
      method: utente ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    onSalvato();
  }

  return (
    <Modale
      titolo={utente ? "Modifica utente" : "Nuovo utente"}
      aperto
      onChiudi={onChiudi}
    >
      <form onSubmit={salva}>
        <label className="label" htmlFor="utente-email">
          Email *
        </label>
        <input
          id="utente-email"
          type="email"
          className="input mb-4"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        {!utente && (
          <>
            <label className="label" htmlFor="utente-password">
              Password iniziale (min. 10 caratteri) *
            </label>
            <input
              id="utente-password"
              type="password"
              className="input mb-4"
              required
              minLength={10}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="utente-nome">
              Nome *
            </label>
            <input
              id="utente-nome"
              className="input"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="utente-cognome">
              Cognome *
            </label>
            <input
              id="utente-cognome"
              className="input"
              required
              value={form.cognome}
              onChange={(e) => setForm({ ...form, cognome: e.target.value })}
            />
          </div>
        </div>
        <label className="label mt-4" htmlFor="utente-ruolo">
          Livello di accesso
        </label>
        <select
          id="utente-ruolo"
          className="input mb-4"
          value={form.ruolo}
          onChange={(e) => setForm({ ...form, ruolo: e.target.value as Ruolo })}
        >
          {RUOLI.map((r, i) => (
            <option key={r} value={r}>
              L{i + 1} · {RUOLO_LABEL[r]}
            </option>
          ))}
        </select>
        {master && (
          <>
            <label className="label" htmlFor="utente-azienda">
              Azienda
            </label>
            <select
              id="utente-azienda"
              className="input mb-4"
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
            >
              <option value="">Nessuna (livello fornitore)</option>
              {aziende.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ragioneSociale}
                </option>
              ))}
            </select>
          </>
        )}
        {errore && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
          >
            {errore}
          </p>
        )}
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

function FormPassword({
  utente,
  onChiudi,
  onSalvato,
}: {
  utente: Utente;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/utenti/${utente.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    onSalvato();
  }

  return (
    <Modale
      titolo={`Reimposta password — ${utente.email}`}
      aperto
      onChiudi={onChiudi}
    >
      <form onSubmit={salva}>
        <p className="mb-4 text-sm text-text-2">
          Nessuno può leggere la password attuale: è possibile solo assegnarne
          una nuova. Le sessioni attive dell&apos;utente verranno chiuse.
        </p>
        <label className="label" htmlFor="nuova-password">
          Nuova password temporanea (min. 10 caratteri)
        </label>
        <input
          id="nuova-password"
          type="password"
          className="input mb-4"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errore && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text"
          >
            {errore}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onChiudi}>
            Annulla
          </button>
          <button type="submit" className="btn-primary">
            Reimposta
          </button>
        </div>
      </form>
    </Modale>
  );
}
