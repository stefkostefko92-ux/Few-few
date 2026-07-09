"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";

export default function ContactForm({ locale, topics }: { locale: Locale; topics: string[] }) {
  const [status, setStatus] = useState<{ msg: string; ok: boolean }>({ msg: "", ok: false });
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const topic = String(data.get("topic") || "");
    const message = String(data.get("message") || "").trim();
    if (!name || !email || !message) {
      setStatus({ msg: t(locale, "form.required"), ok: false });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, locale }),
      });
      if (!res.ok) throw new Error("bad");
      setStatus({ msg: t(locale, "form.ok"), ok: true });
      form.reset();
    } catch {
      // Fallback to a mailto so the message is never lost.
      const subject = encodeURIComponent(`[Sito] ${topic} — ${name}`);
      const body = encodeURIComponent(`Nome: ${name}\nEmail: ${email}\nInteresse: ${topic}\n\n${message}`);
      window.location.href = `mailto:centroquibulgaria@gmail.com?subject=${subject}&body=${body}`;
      setStatus({ msg: t(locale, "form.ok"), ok: true });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="form-card reveal" data-delay="1" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="f-name">{t(locale, "form.name")} *</label>
        <input id="f-name" name="name" type="text" autoComplete="name" required />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="f-email">{t(locale, "form.email")} *</label>
          <input id="f-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="f-topic">{t(locale, "form.topic")}</label>
          <select id="f-topic" name="topic">
            {topics.map((tp) => (
              <option key={tp}>{tp}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="f-msg">{t(locale, "form.message")} *</label>
        <textarea id="f-msg" name="message" required />
      </div>
      <button className="btn btn--primary btn--lg" type="submit" style={{ width: "100%", justifyContent: "center" }} disabled={sending}>
        {t(locale, "form.send")}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 12 16-8-6 16-3-7-7-1Z" strokeLinejoin="round" /></svg>
      </button>
      <p className="form-note">
        {t(locale, "form.note")}{" "}
        <a href={`/${locale}/privacy`}>{t(locale, "legal.privacy")}</a>.
      </p>
      <p className={`form-status ${status.ok ? "ok" : ""}`} role="status" aria-live="polite">{status.msg}</p>
    </form>
  );
}
