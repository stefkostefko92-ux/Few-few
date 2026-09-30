'use client';

// Upload or removal of the company logo for the title block of the drawing sets. The server checks the bytes (PNG or
// JPEG by their magic numbers, at most 300 KB) and keeps every logo: sets already issued keep theirs.
import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { removeLogoAction, uploadLogoAction } from '@/server/drawing-actions';

export default function LogoForm({ hasLogo }: { hasLogo: boolean }) {
  const t = useTranslations('tavole'), te = useTranslations('errors'), router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string): void => {
    start(async () => {
      const r = await action();
      setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: te(r.error ?? 'unexpected') });
      if (r.ok) {
        if (file.current) file.current.value = '';
        router.refresh();
      }
    });
  };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => uploadLogoAction(new FormData(e.currentTarget)), t('logoSaved')); }}>
      <label className="field">
        <span>{t('logoFile')}</span>
        <input ref={file} className="input" type="file" name="logo" accept="image/png,image/jpeg" required />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{t('logoUpload')}</button>
        {hasLogo ? <button type="button" className="btn" disabled={pending} onClick={() => run(removeLogoAction, t('logoSaved'))}>{t('logoRemove')}</button> : null}
        {msg ? <span className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
