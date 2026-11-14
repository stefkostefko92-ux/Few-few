"use client";

// Смяна на ПИН (КП-П.2): задължителна при първи вход и след ПИН от администратор. Същата тъч
// клавиатура като при входа — три стъпки: стар ПИН, нов, повторение.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Backspace, Check, Key, SignOut } from "@phosphor-icons/react";
import { apiJson } from "@/components/ui";
import { pinPolicyError } from "@/lib/pin-policy";

type Stage = "current" | "next" | "repeat";

const PROMPT: Record<Stage, string> = {
  current: "Сегашен ПИН",
  next: "Нов ПИН (4–8 цифри)",
  repeat: "Повторете новия ПИН",
};

export default function ChangePinPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("current");
  const [values, setValues] = useState<Record<Stage, string>>({ current: "", next: "", repeat: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (v: Record<Stage, string>) => {
      setBusy(true);
      try {
        await apiJson(
          await fetch("/api/auth/change-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPin: v.current, newPin: v.next }),
          })
        );
        router.push("/pos");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Смяната не успя.");
        setValues({ current: "", next: "", repeat: "" });
        setStage("current");
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const press = useCallback(
    (key: string) => {
      setError(null);
      const cur = values[stage];
      if (key === "⌫") {
        setValues({ ...values, [stage]: cur.slice(0, -1) });
        return;
      }
      if (key !== "OK") {
        if (cur.length < 8) setValues({ ...values, [stage]: cur + key });
        return;
      }
      if (cur.length < 4) return;
      if (stage === "current") setStage("next");
      else if (stage === "next") {
        const err = pinPolicyError(cur, values.current);
        if (err) {
          setError(err);
          setValues({ ...values, next: "" });
          return;
        }
        setStage("repeat");
      } else if (cur !== values.next) {
        setError("Двата нови ПИН кода не съвпадат. Въведете новия ПИН отново.");
        setValues({ ...values, next: "", repeat: "" });
        setStage("next");
      } else {
        void submit(values);
      }
    },
    [stage, values, submit]
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const steps: Stage[] = ["current", "next", "repeat"];

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-7">
          <div className="inline-flex items-center justify-center size-14 rounded-[1.2rem] bg-white/[0.8] text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,.9),0_10px_30px_-12px_rgba(23,32,58,.3)] mb-4">
            <Key size={28} weight="duotone" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Смяна на ПИН</h1>
          <p className="text-ink-400 text-sm mt-1.5">
            Изберете собствен ПИН. Никой друг не бива да го знае — с него се подписват вашите продажби
            и сторна. Касата иска смяна при първия вход и след ПИН, зададен от администратора.
          </p>
        </div>

        <div className="card p-6 space-y-5">
          <ol className="flex gap-1.5" aria-label="Стъпки">
            {steps.map((st) => (
              <li
                key={st}
                aria-current={st === stage ? "step" : undefined}
                className={`h-1.5 flex-1 rounded-full ${
                  steps.indexOf(st) <= steps.indexOf(stage) ? "bg-brand-500" : "bg-black/[0.08]"
                }`}
              />
            ))}
          </ol>
          <div className="text-sm font-medium text-ink-300">{PROMPT[stage]}</div>

          <div className="h-14 rounded-2xl bg-white/[0.65] border border-black/[0.08] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,.85)] flex items-center justify-center text-3xl font-bold tracking-[.4em] pl-2">
            {"•".repeat(values[stage].length)}
            <span className="w-0.5 h-7 bg-brand-500 animate-blink ml-1" />
          </div>

          {error && (
            <p className="text-coral-600 text-sm text-center font-medium" role="alert">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
              <button
                key={k}
                disabled={busy}
                onClick={() => press(k)}
                aria-label={k === "⌫" ? "Изтрий" : k === "OK" ? "Напред" : undefined}
                className={
                  k === "OK" ? "btn-primary h-16 text-lg" : k === "⌫" ? "btn-ghost h-16 text-lg" : "btn-ghost h-16 text-2xl font-bold"
                }
              >
                {k === "⌫" ? <Backspace size={24} /> : k === "OK" ? <Check size={24} /> : k}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-6 text-sm text-ink-400">
          {/* при задължителна смяна касата връща тук — „Назад“ е за доброволната смяна */}
          <button className="flex items-center gap-1.5 hover:text-ink-200 min-h-11" onClick={() => router.push("/pos")}>
            <ArrowLeft size={16} /> Назад
          </button>
          <button className="flex items-center gap-1.5 hover:text-ink-200 min-h-11" onClick={() => void logout()}>
            <SignOut size={16} /> Изход
          </button>
        </div>
      </div>
    </main>
  );
}
