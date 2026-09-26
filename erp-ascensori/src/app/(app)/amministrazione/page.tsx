"use client";

// „Amministrazione" — едно място за всичко, което администраторът управлява.
//
// Панелът не дублира модулите: показва СЪСТОЯНИЕТО (броячи, последно пускане,
// провалени известия) и води до страницата, където се действа. Действия има
// само там, където друга страница няма: ИИ за инсталацията, фирмата, в която
// MASTER работи, ръчно пускане на автоматизмите, повторно нареждане на
// провалената поща. Кой вижда кое решава СЪРВЪРЪТ — `master` идва от него.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ScheletroDettaglio } from "@/components/ui";
import { IcoAttenzione, IcoIntegro } from "@/components/icone";
import { dataOraIt } from "@/lib/format";
import { apiFetch } from "@/lib/fetch-client";
import { RUOLI, RUOLO_LABEL, type Ruolo } from "@/lib/roles";

interface Run {
  nome: string;
  ultimo: {
    esito: string;
    iniziatoAt: string;
    terminatoAt: string | null;
    durataMs: number | null;
    errore: string | null;
  } | null;
  ultimoOk: string | null;
}

interface Stato {
  master: boolean;
  utenti: {
    totale: number;
    sospesi: number;
    bloccati: number;
    privilegiatiSenzaMfa: number;
    aiDisattivati: number;
  };
  notifiche: { inAttesa: number; fallite: number; smtpConfigurato: boolean };
  ai: {
    attiva: boolean;
    estraiAttiva: boolean;
    testoAttiva: boolean;
    providerConfigurato: boolean;
  };
  automatismi: Run[] | null;
  avvioManuale: boolean;
}

interface ConfigAi {
  attiva: boolean;
  estraiAttiva: boolean;
  testoAttiva: boolean;
  ruoliAmmessi: Ruolo[];
  provider: { configurato: boolean; etichetta: string };
  accountDisattivati: number;
}

interface Azienda {
  id: string;
  ragioneSociale: string;
  slug: string;
  attivo: boolean;
}

const AUTOMATISMI: Record<
  string,
  { titolo: string; cadenza: string; avvio?: string; soloMaster?: boolean }
> = {
  scadenze: {
    titolo: "Scadenze e solleciti",
    cadenza: "ogni 24 ore",
    avvio: "/api/scadenze/check",
  },
  contratti: {
    titolo: "Contratti e rinnovi",
    cadenza: "ogni 24 ore",
    avvio: "/api/contratti/elabora",
  },
  retention: {
    titolo: "Conservazione dei dati (retention)",
    cadenza: "settimanale",
    avvio: "/api/retention/esegui",
    soloMaster: true,
  },
  webhook: { titolo: "Consegna webhook", cadenza: "ogni 5 minuti" },
  notifiche: { titolo: "Invio email in coda", cadenza: "ogni 15 minuti" },
};

/** През `apiFetch`: изтеклата сесия се подновява, паднала мрежа дава съобщение
 *  вместо вечно „зареждане". */
function invia<T>(url: string, init: RequestInit = {}) {
  return apiFetch<T & { error?: string }>(url, init);
}

export default function PaginaAmministrazione() {
  const [stato, setStato] = useState<Stato | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<{ ok: boolean; testo: string } | null>(
    null,
  );

  const carica = useCallback(async () => {
    const r = await invia<Stato>("/api/amministrazione/stato");
    if (!r.ok) {
      setErrore(r.dati.error ?? "Errore");
      return;
    }
    setStato(r.dati);
  }, []);

  useEffect(() => {
    void carica();
  }, [carica]);

  if (errore)
    return (
      <p role="alert" className="text-sm text-danger-text">
        {errore}
      </p>
    );
  if (!stato) return <ScheletroDettaglio carte={3} />;

  async function riprovaFallite() {
    const r = await invia<{ rimesseInCoda: number }>("/api/notifiche/riprova", {
      method: "POST",
    });
    setAvviso(
      r.ok
        ? {
            ok: true,
            testo: `${r.dati.rimesseInCoda} notifiche rimesse in coda: partiranno al prossimo invio automatico.`,
          }
        : { ok: false, testo: r.dati.error ?? "Errore" },
    );
    void carica();
  }

  const u = stato.utenti;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-text-1">
          Amministrazione
        </h1>
        <p className="mt-1 text-sm text-text-3">
          Stato del sistema, sicurezza degli account, assistente AI e
          automatismi
        </p>
      </div>

      {avviso && (
        <p
          role={avviso.ok ? "status" : "alert"}
          className={`mb-5 rounded-md px-3 py-2 text-sm ${
            avviso.ok
              ? "bg-success-subtle text-success-text"
              : "bg-danger-subtle text-danger-text"
          }`}
        >
          {avviso.testo}
        </p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <section className="card p-5" aria-labelledby="t-utenti">
          <h2 id="t-utenti" className="text-sm font-semibold text-text-1">
            Account
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Voce etichetta="Utenti" valore={u.totale} />
            <Voce etichetta="Sospesi" valore={u.sospesi} />
            <Voce etichetta="Bloccati ora" valore={u.bloccati} allarme />
            <Voce
              etichetta="Amministratori senza 2FA"
              valore={u.privilegiatiSenzaMfa}
              allarme
            />
            <Voce etichetta="AI disattivata" valore={u.aiDisattivati} />
          </dl>
          <Link href="/utenti" className="btn-secondary mt-4 inline-flex">
            Gestisci utenti
          </Link>
        </section>

        <section className="card p-5" aria-labelledby="t-notifiche">
          <h2 id="t-notifiche" className="text-sm font-semibold text-text-1">
            Email in uscita
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Voce etichetta="In attesa" valore={stato.notifiche.inAttesa} />
            <Voce
              etichetta="Fallite"
              valore={stato.notifiche.fallite}
              allarme
            />
          </dl>
          <p className="mt-3 text-xs text-text-3">
            {stato.notifiche.smtpConfigurato
              ? "Server di posta configurato."
              : "Server di posta non configurato: le email restano in coda, nessuna va persa."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={stato.notifiche.fallite === 0}
              onClick={() => void riprovaFallite()}
            >
              Rimetti in coda le fallite
            </button>
            <Link href="/integrazioni" className="btn-ghost">
              Dettaglio coda
            </Link>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="t-ai">
          <h2 id="t-ai" className="text-sm font-semibold text-text-1">
            Assistente AI
          </h2>
          <p className="mt-3 flex items-start gap-2 text-sm">
            {stato.ai.attiva ? (
              <span className="flex items-center gap-1.5 text-success-text">
                <IcoIntegro /> Attivo per l&apos;installazione
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-text-2">
                <IcoAttenzione /> Disattivato per tutti
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-text-3">
            {stato.ai.providerConfigurato
              ? "Fornitore configurato sul server."
              : "Fornitore non configurato sul server (AI_PROVIDER, AI_API_KEY)."}
          </p>
          {!stato.master && (
            <p className="mt-2 text-xs text-text-3">
              Le impostazioni globali sono riservate al livello MASTER; per un
              singolo account usare «Gestisci utenti» → Sicurezza.
            </p>
          )}
        </section>
      </div>

      {stato.master && <SezioneAzienda />}
      {stato.master && <SezioneAi onCambiato={() => void carica()} />}
      {stato.automatismi && (
        <SezioneAutomatismi
          righe={stato.automatismi}
          avvioManuale={stato.avvioManuale}
          master={stato.master}
          onEsito={(a) => {
            setAvviso(a);
            void carica();
          }}
        />
      )}

      <section className="card p-5" aria-labelledby="t-moduli">
        <h2 id="t-moduli" className="text-lg font-semibold text-text-1">
          Moduli di amministrazione
        </h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["/utenti", "Utenti e livelli di accesso"],
            ["/audit", "Registro operazioni e verifica integrità"],
            ["/impostazioni", "Dati aziendali e fatturazione"],
            ["/impostazioni/documenti", "Modello dei documenti (logo, testi)"],
            ["/integrazioni", "API, webhook e coda email"],
            ["/privacy", "Diritti privacy (GDPR)"],
            ["/sicurezza", "Sicurezza del mio account"],
            ...(stato.master ? [["/aziende", "Aziende e licenze"]] : []),
          ].map(([href, testo]) => (
            <li key={href}>
              <Link
                href={href}
                className="block rounded-md border border-border px-3 py-2 text-text-1 hover:bg-surface-2"
              >
                {testo}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Voce({
  etichetta,
  valore,
  allarme,
}: {
  etichetta: string;
  valore: number;
  allarme?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-3">{etichetta}</dt>
      <dd
        className={`font-medium tabular-nums ${
          allarme && valore > 0 ? "text-danger-text" : "text-text-1"
        }`}
      >
        {valore}
      </dd>
    </div>
  );
}

function SezioneAzienda() {
  const [aziende, setAziende] = useState<Azienda[]>([]);
  const [corrente, setCorrente] = useState<Azienda | null>(null);
  const [scelta, setScelta] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [caricata, setCaricata] = useState(false);

  useEffect(() => {
    void invia<{ corrente: Azienda | null; aziende: Azienda[] }>(
      "/api/amministrazione/azienda",
    ).then((r) => {
      // Без това неуспешното зареждане казваше „няма фирми" — невярно.
      if (!r.ok) {
        setErrore(r.dati.error ?? "Impossibile caricare le aziende.");
        return;
      }
      setCaricata(true);
      setAziende(r.dati.aziende);
      setCorrente(r.dati.corrente);
      setScelta(r.dati.corrente?.id ?? "");
    });
  }, []);

  async function applica(tenantId: string | null) {
    setErrore(null);
    const r = await invia("/api/amministrazione/azienda", {
      method: "POST",
      body: JSON.stringify({ tenantId }),
    });
    if (!r.ok) {
      setErrore(r.dati.error ?? "Errore");
      return;
    }
    // Пълно презареждане: всяка страница и всяко меню четат новата фирма.
    window.location.reload();
  }

  return (
    <section className="card mb-6 p-5" aria-labelledby="t-azienda">
      <h2 id="t-azienda" className="text-lg font-semibold text-text-1">
        Azienda di lavoro
      </h2>
      <p className="mt-1 text-sm text-text-3">
        Il livello MASTER opera su tutta l&apos;installazione. Se questa
        gestisce più aziende (ad esempio le società di un gruppo), per lavorare
        nei dati di una di esse si entra nella sua azienda: ogni ingresso e
        uscita resta nel registro operazioni di quell&apos;azienda.
      </p>
      {!caricata ? null : aziende.length === 0 ? (
        <p className="mt-3 text-sm text-text-2">
          Nessuna azienda registrata: l&apos;installazione è ad azienda singola.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="azienda-lavoro">
              Azienda
            </label>
            <select
              id="azienda-lavoro"
              className="input min-w-64"
              value={scelta}
              onChange={(e) => setScelta(e.target.value)}
            >
              <option value="">Nessuna (tutta l&apos;installazione)</option>
              {aziende.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ragioneSociale}
                  {a.attivo ? "" : " (disattivata)"}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={scelta === (corrente?.id ?? "")}
            onClick={() => void applica(scelta || null)}
          >
            {scelta ? "Entra nell'azienda" : "Esci dall'azienda"}
          </button>
        </div>
      )}
      {errore && (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {errore}
        </p>
      )}
    </section>
  );
}

function SezioneAi({ onCambiato }: { onCambiato: () => void }) {
  const [cfg, setCfg] = useState<ConfigAi | null>(null);
  const [esito, setEsito] = useState<{ ok: boolean; testo: string } | null>(
    null,
  );

  useEffect(() => {
    void invia<ConfigAi>("/api/amministrazione/ai").then(
      (r) => r.ok && setCfg(r.dati),
    );
  }, []);

  if (!cfg) return null;

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    const r = await invia<ConfigAi>("/api/amministrazione/ai", {
      method: "PUT",
      body: JSON.stringify({
        attiva: cfg.attiva,
        estraiAttiva: cfg.estraiAttiva,
        testoAttiva: cfg.testoAttiva,
        ruoliAmmessi: cfg.ruoliAmmessi,
      }),
    });
    if (!r.ok) {
      setEsito({ ok: false, testo: r.dati.error ?? "Errore" });
      return;
    }
    setCfg(r.dati);
    setEsito({ ok: true, testo: "Impostazioni AI salvate." });
    onCambiato();
  }

  const cambiaRuolo = (r: Ruolo, attivo: boolean) =>
    setCfg({
      ...cfg,
      ruoliAmmessi: attivo
        ? [...cfg.ruoliAmmessi, r]
        : cfg.ruoliAmmessi.filter((x) => x !== r),
    });

  return (
    <section className="card mb-6 p-5" aria-labelledby="t-cfg-ai">
      <h2 id="t-cfg-ai" className="text-lg font-semibold text-text-1">
        Assistente AI per l&apos;installazione
      </h2>
      <p className="mt-1 text-sm text-text-3">
        Quattro livelli, il più generale prevale: installazione, funzione,
        livello di accesso, singolo account (da «Utenti»). L&apos;AI propone
        testi e campi, non salva mai nulla da sola.
      </p>
      <p className="mt-2 text-xs text-text-3">
        Fornitore:{" "}
        {cfg.provider.configurato
          ? cfg.provider.etichetta
          : "non configurato sul server"}
        {" · "}
        Account con AI disattivata: {cfg.accountDisattivati}
      </p>
      <form onSubmit={salva} className="mt-4 space-y-4">
        <fieldset className="space-y-2">
          <legend className="label">Funzioni</legend>
          <Spunta
            id="ai-attiva"
            etichetta="Assistente AI attivo per tutta l'installazione"
            valore={cfg.attiva}
            onCambia={(v) => setCfg({ ...cfg, attiva: v })}
          />
          <Spunta
            id="ai-estrai"
            etichetta="«Compila da un documento» (lettura di PDF e foto)"
            valore={cfg.estraiAttiva}
            disabilitato={!cfg.attiva}
            onCambia={(v) => setCfg({ ...cfg, estraiAttiva: v })}
          />
          <Spunta
            id="ai-testo"
            etichetta="«Scrivi con l'AI» (testi da appunti)"
            valore={cfg.testoAttiva}
            disabilitato={!cfg.attiva}
            onCambia={(v) => setCfg({ ...cfg, testoAttiva: v })}
          />
        </fieldset>
        <fieldset>
          <legend className="label">Livelli di accesso abilitati</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {RUOLI.map((r) => (
              <Spunta
                key={r}
                id={`ai-ruolo-${r}`}
                etichetta={RUOLO_LABEL[r]}
                valore={cfg.ruoliAmmessi.includes(r)}
                disabilitato={!cfg.attiva}
                onCambia={(v) => cambiaRuolo(r, v)}
              />
            ))}
          </div>
        </fieldset>
        {esito && (
          <p
            role={esito.ok ? "status" : "alert"}
            className={`text-sm ${esito.ok ? "text-success-text" : "text-danger-text"}`}
          >
            {esito.testo}
          </p>
        )}
        <button type="submit" className="btn-primary">
          Salva impostazioni AI
        </button>
      </form>
    </section>
  );
}

function Spunta({
  id,
  etichetta,
  valore,
  disabilitato,
  onCambia,
}: {
  id: string;
  etichetta: string;
  valore: boolean;
  disabilitato?: boolean;
  onCambia: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-2 text-sm ${disabilitato ? "text-text-3" : "text-text-1"}`}
    >
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 accent-accent"
        checked={valore}
        disabled={disabilitato}
        onChange={(e) => onCambia(e.target.checked)}
      />
      {etichetta}
    </label>
  );
}

function SezioneAutomatismi({
  righe,
  avvioManuale,
  master,
  onEsito,
}: {
  righe: Run[];
  avvioManuale: boolean;
  master: boolean;
  onEsito: (a: { ok: boolean; testo: string }) => void;
}) {
  const [inCorso, setInCorso] = useState<string | null>(null);

  async function avvia(nome: string, url: string) {
    if (
      nome === "retention" &&
      !confirm(
        "Avviare ora la conservazione dei dati? Le righe oltre i termini di legge vengono eliminate definitivamente.",
      )
    )
      return;
    setInCorso(nome);
    const r = await invia(url, { method: "POST" });
    setInCorso(null);
    onEsito(
      r.ok
        ? {
            ok: true,
            testo: `«${AUTOMATISMI[nome].titolo}» eseguito.`,
          }
        : { ok: false, testo: r.dati.error ?? "Errore" },
    );
  }

  return (
    <section className="card mb-6 p-5" aria-labelledby="t-auto">
      <h2 id="t-auto" className="text-lg font-semibold text-text-1">
        Automatismi
      </h2>
      <p className="mt-1 text-sm text-text-3">
        Girano da soli (cron sul server). Qui l&apos;ultima esecuzione e, dove
        previsto, l&apos;avvio manuale: resta tracciato come quello automatico.
      </p>
      {/* Списък, не таблица: на телефон колоната с бутона оставаше зад
          хоризонтален скрол — тоест „Avvia ora" не се виждаше изобщо. */}
      <ul className="mt-4 divide-y divide-border">
        {righe.map((r) => {
          const meta = AUTOMATISMI[r.nome];
          const url =
            meta?.avvio && (meta.soloMaster ? master : avvioManuale)
              ? meta.avvio
              : null;
          return (
            <li
              key={r.nome}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-1">
                  {meta?.titolo ?? r.nome}
                  <span className="ml-2 text-xs font-normal text-text-3">
                    {meta?.cadenza}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-text-2">
                  Ultima esecuzione:{" "}
                  {r.ultimo ? dataOraIt(r.ultimo.iniziatoAt) : "mai"}
                  {" · "}
                  {!r.ultimo ? (
                    <span className="text-text-3">nessun esito</span>
                  ) : r.ultimo.esito === "OK" ? (
                    <span className="text-success-text">riuscita</span>
                  ) : r.ultimo.esito === "ERRORE" ? (
                    <span className="text-danger-text">
                      errore{r.ultimo.errore ? ` (${r.ultimo.errore})` : ""}
                    </span>
                  ) : (
                    <span>in corso</span>
                  )}
                  {" · "}
                  Ultimo successo: {r.ultimoOk ? dataOraIt(r.ultimoOk) : "mai"}
                </p>
              </div>
              {url ? (
                <button
                  type="button"
                  className="btn-secondary h-8 px-3 text-xs"
                  disabled={inCorso !== null}
                  onClick={() => void avvia(r.nome, url)}
                >
                  {inCorso === r.nome ? "In corso…" : "Avvia ora"}
                </button>
              ) : (
                <span className="text-xs text-text-3">solo automatico</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
