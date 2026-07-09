'use client';

import { useState } from 'react';

// Реферален линк с копиране + share, плюс статистика на поканите.
export function ReferralCard({
  url,
  stats,
  payout,
  labels,
}: {
  url: string;
  stats: { signups: number; successful: number; credit: string };
  payout: { progressPercent: number; progressLabel: string };
  labels: {
    hint: string;
    copy: string;
    copied: string;
    share: string;
    signups: string;
    successful: string;
    credit: string;
  };
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // без clipboard права — линкът е видим в полето
    }
  }

  async function onShare() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
      } catch {
        // отказан share sheet
      }
    } else {
      onCopy();
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-500">{labels.hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full bg-linketto-600 px-5 py-2 text-sm font-semibold text-white hover:bg-linketto-700"
        >
          {copied ? labels.copied : labels.copy}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="rounded-full border border-linketto-600 px-5 py-2 text-sm font-semibold text-linketto-700 hover:bg-linketto-50"
        >
          {labels.share}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-2xl font-extrabold text-linketto-700">
            {stats.signups}
          </p>
          <p className="text-xs text-slate-500">{labels.signups}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-2xl font-extrabold text-linketto-700">
            {stats.successful}
          </p>
          <p className="text-xs text-slate-500">{labels.successful}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-2xl font-extrabold text-green-600">
            {stats.credit}
          </p>
          <p className="text-xs text-slate-500">{labels.credit}</p>
        </div>
      </div>
      {/* Прогрес към прага за теглене */}
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${payout.progressPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{payout.progressLabel}</p>
      </div>
    </div>
  );
}
