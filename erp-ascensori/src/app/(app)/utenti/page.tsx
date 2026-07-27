"use client";

// Управление на потребители — ADMIN+. Изтриване: само MASTER (сървърно наложено).

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
  ultimoAccesso: string | null;
}

export default function Pagina() {
  const [righe, setRighe] = useState<Utente[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [modale, setModale] = useState<"crea" | Utente | null>(null);
  const [reset, setReset] = useState<Utente | null>(null);

  const carica = useCallback(async () => {
    const res = await fetch("/api/utenti");
    const d = await res.json();
    if (!res.ok) {
      setErrore(d.error ?? "Errore");
      return;
    }
    setRighe(d.righe);
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function cambiaAttivo(u: Utente) {
    const res = await fetch(`/api/utenti/${u.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attivo: !u.attivo }),
    });
    if (!res.ok) alert((await res.json()).error ?? "Errore");
    void carica();
  }

  async function elimina(u: Utente) {
    if (
      !confirm(
        `Eliminare DEFINITIVAMENTE ${u.email}? Operazione riservata al MASTER.`,
      )
    )
      return;
    const res = await fetch(`/api/utenti/${u.id}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error ?? "Errore");
    void carica();
  }

  if (errore) return <Vuoto messaggio={errore} />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
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

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-text-3">
              <th className="px-3 py-2.5">Nominativo</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Ruolo</th>
              <th className="px-3 py-2.5">Stato</th>
              <th className="px-3 py-2.5">Ultimo accesso</th>
              <th className="px-3 py-2.5 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((u) => (
              <tr
                key={u.id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="px-3 py-2.5 font-medium">
                  {u.cognome} {u.nome}
                </td>
                <td className="px-3 py-2.5 text-text-2">{u.email}</td>
                <td className="px-3 py-2.5">{RUOLO_LABEL[u.ruolo]}</td>
                <td className="px-3 py-2.5">
                  {u.bloccatoFino && new Date(u.bloccatoFino) > new Date() ? (
                    <span className="rounded-sm bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">
                      Bloccato
                    </span>
                  ) : u.attivo ? (
                    <span className="rounded-sm bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-text">
                      Attivo
                    </span>
                  ) : (
                    <span className="rounded-sm bg-surface-3 px-2 py-0.5 text-xs font-medium text-text-3">
                      Sospeso
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-text-2">
                  {dataOraIt(u.ultimoAccesso)}
                </td>
                <td className="px-3 py-2.5 text-right">
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
                    onClick={() => void cambiaAttivo(u)}
                  >
                    {u.attivo ? "Sospendi" : "Riattiva"}
                  </button>
                  <button
                    className="btn-ghost h-7 px-2 text-xs text-danger-text"
                    onClick={() => void elimina(u)}
                  >
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modale && (
        <FormUtente
          utente={modale === "crea" ? null : modale}
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
    </div>
  );
}

function FormUtente({
  utente,
  onChiudi,
  onSalvato,
}: {
  utente: Utente | null;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const [form, setForm] = useState({
    email: utente?.email ?? "",
    password: "",
    nome: utente?.nome ?? "",
    cognome: utente?.cognome ?? "",
    ruolo: utente?.ruolo ?? "OPERATORE",
  });
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    const url = utente ? `/api/utenti/${utente.id}` : "/api/utenti";
    const corpo = utente
      ? { nome: form.nome, cognome: form.cognome, ruolo: form.ruolo }
      : form;
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
        {!utente && (
          <>
            <label className="label">Email *</label>
            <input
              type="email"
              className="input mb-4"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <label className="label">
              Password iniziale (min. 10 caratteri) *
            </label>
            <input
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
            <label className="label">Nome *</label>
            <input
              className="input"
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Cognome *</label>
            <input
              className="input"
              required
              value={form.cognome}
              onChange={(e) => setForm({ ...form, cognome: e.target.value })}
            />
          </div>
        </div>
        <label className="label mt-4">Livello di accesso</label>
        <select
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
        <label className="label">
          Nuova password temporanea (min. 10 caratteri)
        </label>
        <input
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
