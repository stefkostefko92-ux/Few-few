"use client";

// Вход: код на оператор + ПИН, с голяма тъч клавиатура — както касиерите
// са свикнали от касовите апарати.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Storefront, Backspace, SignIn, User } from "@phosphor-icons/react";
import { apiJson } from "@/components/ui";
import { APP_VERSION } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [operatorCode, setOperatorCode] = useState("");
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<"operator" | "pin">("operator");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setValue = stage === "operator" ? setOperatorCode : setPin;

  const submit = useCallback(async (code: string, pinValue: string) => {
    setBusy(true);
    setError(null);
    try {
      await apiJson(
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operatorCode: code, pin: pinValue }),
        })
      );
      router.push("/pos");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Грешка при вход.");
      setPin("");
      setStage("pin");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const press = useCallback(
    (key: string) => {
      setError(null);
      if (key === "⌫") {
        setValue((v) => v.slice(0, -1));
        return;
      }
      if (key === "OK") {
        if (stage === "operator") {
          if (operatorCode.length > 0) setStage("pin");
        } else if (pin.length >= 4) {
          void submit(operatorCode, pin);
        }
        return;
      }
      setValue((v) => (v.length < 8 ? v + key : v));
    },
    [stage, operatorCode, pin, setValue, submit]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") press("OK");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-[1.4rem] text-[#231a05] mb-4" style={{ background: "linear-gradient(180deg,#ffd166,#f5a623)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.45), 0 16px 40px -12px rgba(245,166,35,.55)" }}>
            <Storefront size={34} weight="fill" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            Carbon Stealth <span className="text-brand-600">POS</span>
          </h1>
          <p className="text-ink-400 mt-1">Касова система за хранителни магазини</p>
          <p className="text-ink-500 text-xs mt-1">версия {APP_VERSION}</p>
        </div>

        <div className="card p-6 space-y-5">
          <div className="flex items-center justify-between text-sm font-medium text-ink-300">
            <span className="inline-flex items-center gap-1.5">
              <User size={16} />
              {stage === "operator" ? "Код на оператор" : `Оператор ${operatorCode} — ПИН`}
            </span>
            {stage === "pin" && (
              <button
                className="text-brand-700 hover:text-brand-600"
                onClick={() => {
                  setStage("operator");
                  setPin("");
                }}
              >
                смени
              </button>
            )}
          </div>

          <div className="h-14 rounded-2xl bg-white/[0.65] border border-black/[0.08] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,.85)] flex items-center justify-center text-3xl font-bold tracking-[.4em] pl-2">
            {stage === "pin" ? "•".repeat(pin.length) : operatorCode}
            <span className="w-0.5 h-7 bg-brand-500 animate-blink ml-1" />
          </div>

          {error && (
            <p className="text-coral-600 text-sm text-center font-medium">{error}</p>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
              <button
                key={k}
                disabled={busy}
                onClick={() => press(k)}
                className={
                  k === "OK"
                    ? "btn-primary h-16 text-lg"
                    : k === "⌫"
                      ? "btn-ghost h-16 text-lg"
                      : "btn-ghost h-16 text-2xl font-bold"
                }
              >
                {k === "⌫" ? <Backspace size={24} /> : k === "OK" ? <SignIn size={24} /> : k}
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-ink-500 text-xs mt-6">
          Демо: администратор 1/9999 · управител 2/5555 · касиер 3/1111
        </p>
      </div>
    </main>
  );
}
