"use client";

// Вход — италиански, с брояч на оставащите опити и съобщение при блокада.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elevator } from "@phosphor-icons/react";
import { ritornoSicuro } from "@/lib/ritorno";
import type { AccountDemo } from "@/lib/demo";

/** Демо стенд (`DEMO=1` на сървъра): акаунтите с вход с едно натискане. */
export interface DemoAccesso {
  password: string;
  account: AccountDemo[];
}

export default function FormAccesso({ demo }: { demo: DemoAccesso | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Второто поле се появява ЧАК след 428: за акаунт без втори фактор то е шум,
  // а за човек, който не знае какво е, е причина да не влезе.
  const [codice, setCodice] = useState("");
  const [serveCodice, setServeCodice] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);

  function accedi(e: React.FormEvent) {
    e.preventDefault();
    void entra(email, password);
  }

  /** Демо: попълва полетата (видимо — човек вижда с какво влиза) и влиза. */
  function entraDemo(a: AccountDemo) {
    if (!demo || caricamento) return;
    setEmail(a.email);
    setPassword(demo.password);
    void entra(a.email, demo.password);
  }

  async function entra(email: string, password: string) {
    setErrore(null);
    setCaricamento(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          ...(codice ? { codice } : {}),
        }),
      });
      const dati = await res.json();

      // 428 = „паролата е вярна, липсва вторият фактор". Различен от 401, за да
      // може интерфейсът да поиска кода, вместо да покаже „грешни данни" на
      // човек, който всъщност е написал всичко правилно.
      if (res.status === 428) {
        setServeCodice(true);
        setErrore(dati.error ?? "Inserire il codice del secondo fattore");
        return;
      }
      if (!res.ok) {
        setErrore(dati.error ?? "Errore di accesso");
        // Сгрешеният код не бива да скрива полето обратно.
        if (codice) setServeCodice(true);
        return;
      }

      // Къде е искал да отиде, преди сесията да изтече (напр. QR стикер на
      // асансьор). Проверката е ЗАДЪЛЖИТЕЛНА: адресът идва отвън и без нея
      // подхвърлен линк изхвърля служителя на чужд сайт веднага след паролата.
      const da = new URLSearchParams(window.location.search).get("da");
      // Дължимият втори фактор — първо той: без него маршрутите с роля отказват.
      // Изтеклата парола — също там: страницата предлага смяната веднага.
      // Клиентът има своя страница: таблото е на вътрешните нива.
      router.push(
        dati.mfaRichiesto || dati.passwordScaduta
          ? "/sicurezza"
          : dati.ruolo === "CLIENTE"
            ? "/area-cliente"
            : ritornoSicuro(da),
      );
      router.refresh();
    } catch {
      setErrore("Errore di rete: riprovare");
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg p-4 lg:flex-row">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-text-inverse">
            <Elevator size={26} weight="light" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-1">
            ERP Ascensori Enterprise
          </h1>
          <p className="mt-1 text-sm text-text-3">Accedi al gestionale</p>
        </div>

        <form onSubmit={accedi} className="card p-6">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input mb-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            // `inputMode` + без автокорекция: техникът влиза от телефон, а
            // главната буква в началото на адреса е класическият „грешна парола".
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input mb-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {serveCodice && (
            <>
              <label className="label" htmlFor="codice">
                Codice di verifica
              </label>
              <input
                id="codice"
                className="input mb-4 font-mono tracking-widest"
                value={codice}
                onChange={(e) => setCodice(e.target.value.trim())}
                // `one-time-code` кара телефона да предложи кода от приложението.
                autoComplete="one-time-code"
                inputMode="text"
                autoCapitalize="characters"
                autoFocus
                required
              />
              <p className="mb-4 -mt-2 text-xs text-text-3">
                Codice a 6 cifre dall&apos;app di autenticazione, oppure uno dei
                codici di recupero.
              </p>
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
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={caricamento}
          >
            {caricamento ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-3">
          Carbon Stealth VCC · Accesso riservato · Schema versione 3.0
        </p>
      </div>

      {demo && (
        <section
          className="card mt-6 w-full max-w-sm p-5 lg:mt-0 lg:ml-8 lg:max-w-md"
          aria-labelledby="t-demo"
        >
          <h2 id="t-demo" className="text-base font-semibold text-text-1">
            Prova la demo
          </h2>
          <p className="mt-1 text-sm text-text-2">
            Dati di esempio, nessuna registrazione. Scegliere un profilo per
            entrare: ogni livello vede solo ciò che gli compete.
          </p>
          <p className="mt-2 text-xs text-text-3">
            Password per tutti i profili:{" "}
            <code className="select-all font-mono text-text-1">
              {demo.password}
            </code>
          </p>
          <ul className="mt-4 space-y-2">
            {demo.account.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-left hover:border-accent disabled:opacity-60"
                  disabled={caricamento}
                  onClick={() => entraDemo(a)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-text-1">
                      {a.livello}
                    </span>
                    <span className="truncate font-mono text-xs text-text-3">
                      {a.email}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-text-3">
                    {a.descrizione}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-3">
            Ambiente dimostrativo: i dati sono condivisi tra tutti i visitatori.
            Non inserire dati reali.
          </p>
        </section>
      )}
    </main>
  );
}
