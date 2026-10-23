"use client";

import { useState } from "react";
import { SITE } from "@/lib/site";
import { track } from "@/lib/events";

// „Сподели“ — в малък град сайтът расте от уста на уста („изпрати на мама“).
// На телефон първо се пробва системното меню за споделяне (Viber, WhatsApp,
// Messenger — каквото човек има); иначе — едри бутони. Без чужди скриптове:
// само обикновени връзки, затова CSP не се пипа. Към адреса се добавя ?s=share,
// за да се вижда в статистиката колко хора идват от споделяне (без да се знае кои).
export function ShareButton({
  title,
  text,
  path,
  className = "",
}: {
  title: string;
  /** Кратък текст на прост български, който върви с връзката. */
  text?: string;
  /** Път на страницата; по подразбиране — текущата. */
  path?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = () => {
    const p = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
    const u = new URL(p, SITE.url);
    u.searchParams.set("s", "share");
    return u.toString();
  };
  const message = () => `${text ?? title}\n${link()}`;

  const onShare = async () => {
    track("share_click");
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: text ?? title, url: link() });
        return;
      } catch {
        // отказано или неподдържано — показваме бутоните
      }
    }
    setOpen((v) => !v);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const enc = encodeURIComponent;
  const item =
    "a11y-btn inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-800 hover:border-brand-300 hover:bg-brand-50";

  return (
    <div className={"no-print " + className}>
      <button
        type="button"
        onClick={onShare}
        aria-expanded={open}
        className="btn-secondary"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .17 1L8.6 8.3a3 3 0 1 0 0 7.4l6.57 3.3A3 3 0 1 0 16 17.5l-6.6-3.3a3 3 0 0 0 0-4.4L16 6.5A3 3 0 0 0 18 8Z"
            fill="currentColor"
          />
        </svg>
        Сподели
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Сподели тази страница">
          <a className={item} href={`viber://forward?text=${enc(message())}`}>
            Viber
          </a>
          <a
            className={item}
            href={`https://wa.me/?text=${enc(message())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
          <a
            className={item}
            href={`https://www.facebook.com/sharer/sharer.php?u=${enc(link())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook
          </a>
          <button type="button" className={item} onClick={copy}>
            {copied ? "Копирано ✓" : "Копирай връзката"}
          </button>
        </div>
      )}
    </div>
  );
}
