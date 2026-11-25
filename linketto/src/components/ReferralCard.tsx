'use client';

import { useState } from 'react';
import { buttonStyles } from '@/components/ui/Button';

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
      <p className="text-sm text-fg-muted">{labels.hint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-control border border-line-input px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={onCopy}
          className={buttonStyles()}
        >
          {copied ? labels.copied : labels.copy}
        </button>
        <button
          type="button"
          onClick={onShare}
          className={buttonStyles({ variant: 'secondary' })}
        >
          {labels.share}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-card bg-surface-2 p-3">
          <p className="text-2xl font-extrabold text-accent-text">
            {stats.signups}
          </p>
          <p className="text-xs text-fg-muted">{labels.signups}</p>
        </div>
        <div className="rounded-card bg-surface-2 p-3">
          <p className="text-2xl font-extrabold text-accent-text">
            {stats.successful}
          </p>
          <p className="text-xs text-fg-muted">{labels.successful}</p>
        </div>
        <div className="rounded-card bg-surface-2 p-3">
          <p className="text-2xl font-extrabold text-success-text">
            {stats.credit}
          </p>
          <p className="text-xs text-fg-muted">{labels.credit}</p>
        </div>
      </div>
      {/* Прогрес към прага за теглене */}
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${payout.progressPercent}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-fg-muted">{payout.progressLabel}</p>
      </div>
    </div>
  );
}
