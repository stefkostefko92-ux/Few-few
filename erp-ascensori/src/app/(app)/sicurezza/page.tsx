"use client";

// „Sicurezza dell'account" — вторият фактор и активните сесии.
//
// До тази страница API-то за втори фактор съществуваше, но интерфейс нямаше:
// „задължителен за MASTER/ADMIN" беше надпис без начин да бъде изпълнен. Сега
// потребител, който го дължи, се води тук и не стига до нищо друго, докато не
// го включи (`accessoBloccatoSenzaMfa` в `richiedeRuolo`).
//
// Включването е в ДВЕ стъпки нарочно: тайната се показва, човекът я сканира и
// потвърждава с код. Без потвърждението сгрешено сканиране заключва навън.
// Резервните кодове се виждат ВЕДНЪЖ — после в базата са само хешове.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScheletroDettaglio } from "@/components/ui";
import { IcoAttenzione, IcoIntegro, IcoNota } from "@/components/icone";
import { apiFetch } from "@/lib/fetch-client";
import { dataOraIt } from "@/lib/format";

interface Me {
  nome: string;
  ruolo: string;
  totpAttivo: boolean;
  mfaObbligatoria: boolean;
  mfaRichiesto: boolean;
}

interface Preparazione {
  attivo: boolean;
  segreto?: string;
  qr?: string;
}

interface Sessione {
  id: string;
  userAgent: string | null;
  ip: string | null;
  ultimoUso: string;
  createdAt: string;
  corrente: boolean;
}

/** Груб, но честен етикет на устройството — пълният User-Agent не казва нищо. */
function dispositivo(ua: string | null): string {
  if (!ua) return "Dispositivo sconosciuto";
  const sistema = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Altro sistema";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "browser";
  return `${browser} su ${sistema}`;
}

export default function PaginaSicurezza() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [prep, setPrep] = useState<Preparazione | null>(null);
  const [codice, setCodice] = useState("");
  const [codiciRecupero, setCodiciRecupero] = useState<string[] | null>(null);
  const [sessioni, setSessioni] = useState<Sessione[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = useCallback(async () => {
    const [m, s] = await Promise.all([
      apiFetch<Me>("/api/me"),
      apiFetch<{ righe: Sessione[] }>("/api/sessioni"),
    ]);
    if (m.ok) setMe(m.dati);
    if (s.ok) setSessioni(s.dati.righe);
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  async function prepara() {
    setErrore(null);
    const r = await apiFetch<Preparazione & { error?: string }>(
      "/api/auth/mfa",
    );
    if (!r.ok) {
      setErrore(r.dati.error ?? "Impossibile avviare la configurazione.");
      return;
    }
    setPrep(r.dati);
  }

  async function attiva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      const r = await apiFetch<{ codiciRecupero?: string[]; error?: string }>(
        "/api/auth/mfa",
        { method: "POST", body: JSON.stringify({ codice }) },
      );
      if (!r.ok) {
        setErrore(r.dati.error ?? "Codice non valido.");
        return;
      }
      setCodiciRecupero(r.dati.codiciRecupero ?? []);
      setPrep(null);
      setCodice("");
      await carica();
    } finally {
      setInCorso(false);
    }
  }

  async function terminaSessione(id: string) {
    const r = await apiFetch(`/api/sessioni/${id}`, { method: "DELETE" });
    if (r.ok) await carica();
  }

  async function terminaAltre() {
    const r = await apiFetch("/api/sessioni?altre=1", { method: "DELETE" });
    if (r.ok) await carica();
  }

  if (!me) return <ScheletroDettaglio carte={2} />;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Sicurezza dell&apos;account
        </h1>
        <p className="mt-1 text-sm text-text-3">
          Verifica in due passaggi e dispositivi con una sessione aperta
        </p>
      </div>

      {me.mfaRichiesto && (
        <div
          className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-text"
          role="alert"
        >
          <IcoAttenzione />
          <span>
            Per il livello di accesso <strong>{me.ruolo}</strong> la verifica in
            due passaggi è obbligatoria. Fino alla sua attivazione le altre
            funzioni del gestionale restano bloccate.
          </span>
        </div>
      )}

      <section className="card mb-6 p-5" aria-labelledby="titolo-mfa">
        <h2 id="titolo-mfa" className="text-lg font-semibold text-text-1">
          Verifica in due passaggi
        </h2>

        {me.totpAttivo ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-success-text">
            <IcoIntegro />
            <span>
              Attiva. All&apos;accesso, oltre alla password, viene chiesto il
              codice generato dall&apos;app di autenticazione.
            </span>
          </p>
        ) : !prep ? (
          <>
            <p className="mt-2 text-sm text-text-2">
              Serve un&apos;app di autenticazione sul telefono (ad esempio
              Google Authenticator, Microsoft Authenticator, Aegis o 2FAS). Il
              codice cambia ogni 30 secondi: una password rubata da sola non
              basta più per entrare.
            </p>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => void prepara()}
            >
              Configura la verifica in due passaggi
            </button>
          </>
        ) : (
          <form onSubmit={attiva} className="mt-3 space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text-2">
              <li>
                Aprire l&apos;app di autenticazione e scansionare il codice.
              </li>
              <li>
                Se la scansione non è possibile, inserire a mano la chiave qui
                sotto.
              </li>
              <li>Scrivere il codice di 6 cifre che l&apos;app mostra.</li>
            </ol>
            {prep.qr && (
              <div
                className="w-48 rounded-md bg-white p-2"
                role="img"
                aria-label="Codice QR per l'app di autenticazione"
                // SVG generato sul server da `qrSvg`: solo percorsi geometrici,
                // nessun testo e nessuno script.
                dangerouslySetInnerHTML={{ __html: prep.qr }}
              />
            )}
            <p className="text-sm text-text-2">
              Chiave:{" "}
              <code
                className="select-all break-all font-mono text-text-1"
                data-testid="segreto-mfa"
              >
                {prep.segreto}
              </code>
            </p>
            <div>
              <label className="label" htmlFor="codice-mfa">
                Codice di verifica
              </label>
              <input
                id="codice-mfa"
                className="input w-40 font-mono tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                value={codice}
                onChange={(e) => setCodice(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={inCorso}>
              {inCorso ? "Verifica…" : "Attiva"}
            </button>
          </form>
        )}

        {errore && (
          <p className="mt-3 text-sm text-danger-text" role="alert">
            {errore}
          </p>
        )}

        {codiciRecupero && codiciRecupero.length > 0 && (
          <div
            className="mt-5 rounded-lg border border-warning/30 bg-warning-subtle p-4"
            role="status"
          >
            <p className="flex items-start gap-2 text-sm font-medium text-warning-text">
              <IcoNota />
              <span>
                Codici di recupero: salvarli ora in un luogo sicuro. Vengono
                mostrati una sola volta; ciascuno funziona una volta sola, se il
                telefono va perso.
              </span>
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-text-1 sm:grid-cols-4">
              {codiciRecupero.map((c) => (
                <li
                  key={c}
                  className="rounded bg-surface px-2 py-1 text-center"
                >
                  {c}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-secondary mt-4"
              onClick={() => {
                setCodiciRecupero(null);
                router.push("/dashboard");
              }}
            >
              Ho salvato i codici
            </button>
          </div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="titolo-sessioni">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="titolo-sessioni"
            className="text-lg font-semibold text-text-1"
          >
            Sessioni attive
          </h2>
          {sessioni.length > 1 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void terminaAltre()}
            >
              Termina le altre sessioni
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-text-3">
          Un dispositivo che non si riconosce va terminato subito.
        </p>
        <ul className="mt-4 divide-y divide-border">
          {sessioni.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="text-sm">
                <span className="font-medium text-text-1">
                  {dispositivo(s.userAgent)}
                </span>
                {s.corrente && (
                  <span className="ml-2 rounded bg-accent-subtle px-1.5 py-0.5 text-xs text-accent-text">
                    questo dispositivo
                  </span>
                )}
                <span className="block text-xs text-text-3">
                  Ultimo uso {dataOraIt(s.ultimoUso)}
                  {s.ip ? ` · ${s.ip}` : ""}
                </span>
              </span>
              {!s.corrente && (
                <button
                  type="button"
                  className="btn-ghost text-danger-text"
                  onClick={() => void terminaSessione(s.id)}
                >
                  Termina
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
