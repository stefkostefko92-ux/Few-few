'use client';

import { useState } from 'react';

// „Сподели“ на публичния профил: нативният share sheet на телефона,
// а без такъв (десктоп) — малък панел с QR кода и „Копирай линка“.
export function ShareButton({
  url,
  qrSrc,
  labels,
}: {
  url: string;
  qrSrc: string;
  labels: { share: string; copy: string; copied: string; scan: string };
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // отказан share sheet — падаме към панела
      }
    }
    setOpen((value) => !value);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // няма clipboard права — оставяме линка видим в QR панела
    }
  }

  return (
    <div className="absolute end-4 top-4 z-20 text-start">
      <button
        type="button"
        onClick={onShare}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-current px-3 py-1.5 text-xs font-semibold opacity-70 transition hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 256 256"
          fill="currentColor"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          <path
            d="M208,200a32,32,0,1,1-32-32A32,32,0,0,1,208,200ZM176,88a32,32,0,1,0-32-32A32,32,0,0,0,176,88Z"
            opacity="0.2"
          />
          <path d="M176,160a39.89,39.89,0,0,0-28.62,12.09l-46.1-29.63a39.8,39.8,0,0,0,0-28.92l46.1-29.63a40,40,0,1,0-8.66-13.45l-46.1,29.63a40,40,0,1,0,0,55.82l46.1,29.63A40,40,0,1,0,176,160Zm0-128a24,24,0,1,1-24,24A24,24,0,0,1,176,32ZM64,152a24,24,0,1,1,24-24A24,24,0,0,1,64,152Zm112,72a24,24,0,1,1,24-24A24,24,0,0,1,176,224Z" />
        </svg>
        {labels.share}
      </button>
      {open && (
        <div className="absolute end-0 top-10 w-52 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- динамичен SVG route */}
          <img
            src={qrSrc}
            alt="QR"
            width={180}
            height={180}
            className="w-full rounded-lg"
          />
          <p className="mt-2 text-center text-[11px] text-slate-500">
            {labels.scan}
          </p>
          <button
            type="button"
            onClick={onCopy}
            className="mt-2 w-full rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50"
          >
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
      )}
    </div>
  );
}
