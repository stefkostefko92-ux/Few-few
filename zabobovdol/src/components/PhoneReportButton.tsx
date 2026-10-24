"use client";

// Клиентските части около телефонните номера:
//  • TelLink — обикновена tel: връзка, която брои обаждането (tel_click);
//    живее в ./TelLink.tsx, тук е само ре-експорт за старите импорти;
//  • PhoneReportButton — „Този номер е сгрешен“: кратък сигнал към админа.
// И двете не пазят нищо за човека — само брой на ден и текста на сигнала.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PhoneOff } from "@/components/icons";
import { track } from "@/lib/events";

export { TelLink } from "@/components/TelLink";

type Status = "idle" | "open" | "sending" | "sent";

const NOTE_MAX = 500;

export function PhoneReportButton({
  serviceId,
  serviceName,
  className = "",
}: {
  serviceId: string;
  serviceName: string;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const formId = `phone-report-${serviceId}`;

  // Бутонът и формата се сменят на едно място, затова фокусът се мести ръчно:
  // при отваряне — в полето, при „Отказ“ — обратно на бутона.
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<"note" | "toggle" | null>(null);
  useEffect(() => {
    if (focusTarget.current === "note") noteRef.current?.focus();
    if (focusTarget.current === "toggle") toggleRef.current?.focus();
    focusTarget.current = null;
  }, [status]);

  if (status === "sent") {
    return (
      <p
        className={"no-print rounded-xl bg-brand-50 px-4 py-3 text-base text-slate-800 " + className}
        role="status"
      >
        Благодарим! Ще проверим номера и ще го поправим.
      </p>
    );
  }

  if (status === "idle") {
    return (
      <div className={"no-print " + className}>
        <button
          ref={toggleRef}
          type="button"
          onClick={() => {
            focusTarget.current = "note";
            setStatus("open");
          }}
          aria-expanded={false}
          className="a11y-btn link-quiet inline-flex items-center gap-1.5 text-sm font-medium text-slate-700"
        >
          <PhoneOff className="h-4 w-4 shrink-0" aria-hidden />
          Този номер е сгрешен
        </button>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const website = String(new FormData(e.currentTarget).get("website") ?? "");
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/phone-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceId, note, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        track("phone_report");
        setStatus("sent");
        return;
      }
      setError(data.error || "Не успяхме да изпратим сигнала. Опитайте пак след малко.");
    } catch {
      setError("Няма връзка с интернет. Опитайте пак след малко.");
    }
    setStatus("open");
  };

  const sending = status === "sending";

  return (
    <form
      id={formId}
      onSubmit={onSubmit}
      className={"no-print space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 " + className}
      aria-label={`Сигнал за сгрешен номер — ${serviceName}`}
    >
      <p className="text-base font-semibold text-slate-900">
        Сгрешен номер на „{serviceName}“?
      </p>
      <div>
        <label htmlFor={`${formId}-note`} className="label">
          Какво не е наред? (по желание)
        </label>
        <textarea
          ref={noteRef}
          id={`${formId}-note`}
          name="note"
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input"
          placeholder="Напр. „не отговаря“ или „номерът е сменен“"
        />
      </div>

      {/* Honeypot против ботове */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden
      />

      <p className="text-sm text-slate-600">
        Не пазим кой изпраща сигнала. Моля, не пишете име или личен телефон.
      </p>

      {error && (
        <p className="text-sm font-medium text-crimson-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={sending}>
          {sending ? "Изпращане…" : "Изпратете сигнала"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={sending}
          onClick={() => {
            focusTarget.current = "toggle";
            setStatus("idle");
            setError("");
          }}
        >
          Отказ
        </button>
      </div>
    </form>
  );
}
