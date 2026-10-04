'use client';

// Upload or removal of the logo of the client who commissioned the installation, for the title block of its drawing
// sets (next to the client's name on sheet 1). The server checks the bytes and keeps every logo: sets already issued
// keep theirs.
import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { removeClientLogoAction, uploadClientLogoAction } from '@/server/client-logo-actions';

interface Props {
  projectId: string;
  /** the current logo as a data: URI, for the preview */
  current: string | null;
  readOnly: boolean;
}

export default function ClientLogoForm({ projectId, current, readOnly }: Props) {
  const t = useTranslations('tavole'), te = useTranslations('errors'), router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>): void => {
    start(async () => {
      const r = await action();
      setMsg(r.ok ? { ok: true, text: t('logoSaved') } : { ok: false, text: te(r.error ?? 'unexpected') });
      if (r.ok) {
        if (file.current) file.current.value = '';
        router.refresh();
      }
    });
  };
  return (
    <section className="panel flex flex-col gap-3">
      <h2>{t('clientLogoTitle')}</h2>
      <p className="note">{t('clientLogoLead')}</p>
      {current ? (
        <figure className="logo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URI of the client's logo, no optimisation to gain */}
          <img src={current} alt={t('clientLogoAlt')} />
        </figure>
      ) : <p className="note">{t('clientLogoNone')}</p>}
      {readOnly ? null : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(() => uploadClientLogoAction(new FormData(e.currentTarget))); }}>
          <input type="hidden" name="projectId" value={projectId} />
          <label className="field">
            <span>{t('logoFile')}</span>
            <input ref={file} className="input" type="file" name="logo" accept="image/png,image/jpeg" required />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={pending}>{t('logoUpload')}</button>
            {current ? <button type="button" className="btn" disabled={pending} onClick={() => run(() => removeClientLogoAction(projectId))}>{t('logoRemove')}</button> : null}
            {msg ? <span className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
          </div>
        </form>
      )}
    </section>
  );
}
