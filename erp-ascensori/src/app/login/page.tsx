"use client";

// Вход — италиански, с брояч на оставащите опити и съобщение при блокада.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Elevator } from "@phosphor-icons/react";
import { ritornoSicuro } from "@/lib/ritorno";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Второто поле се появява ЧАК след 428: за акаунт без втори фактор то е шум,
  // а за човек, който не знае какво е, е причина да не влезе.
  const [codice, setCodice] = useState("");
  const [serveCodice, setServeCodice] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, ...(codice ? { codice } : {}) }),
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
      router.push(ritornoSicuro(da));
      router.refresh();
    } catch {
      setErrore("Errore di rete: riprovare");
    } finally {
      setCaricamento(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
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
                Codice a 6 cifre dall&apos;app di autenticazione, oppure uno dei codici di
                recupero.
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
          <button type="submit" className="btn-primary w-full" disabled={caricamento}>
            {caricamento ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-3">
          Carbon Stealth VCC · Accesso riservato · Schema versione 3.0
        </p>
      </div>
    </main>
  );
}
