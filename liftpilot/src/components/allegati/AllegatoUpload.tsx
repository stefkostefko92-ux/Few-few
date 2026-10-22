'use client';

// The upload of a file for an installation (round 49): the file, its kind, the section of the relazione tecnica it
// belongs to and its title, sent to POST /api/projects/[id]/allegati — a route handler, since a server action takes at
// most 1 MB — with the progress of the bytes sent, then the server's check. The server decides everything (the type by
// the bytes, the metadata removed, the limits); here only what saves a useless 20 MB send: no file, no kind, too large.
// The expected documents of the workspace open it preset (kind, section, title).
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { titleFromName, type AllegatoKind, type Componente } from '@/lib/allegati/kinds';
import { MAX_FILE_BYTES } from '@/lib/allegati/limits';
import type { Option } from './options';
import { BY_STATUS, send, type UploadAnswer, type UploadPhase as Phase } from './send';

export interface UploadPreset { kind?: AllegatoKind; component?: Componente; title?: string }

type Answer = UploadAnswer<{ title: string }>;

export default function AllegatoUpload({ projectId, kinds, components, preset, legend }: {
  projectId: string; kinds: readonly Option<AllegatoKind>[]; components: readonly Option<Componente>[]; preset?: UploadPreset; legend?: string;
}) {
  const t = useTranslations('allegati'), te = useTranslations('errors'), router = useRouter(), id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>(preset?.kind ?? '');
  const [component, setComponent] = useState<string>(preset?.component ?? '');
  const [title, setTitle] = useState(preset?.title ?? '');
  const [phase, setPhase] = useState<Phase>({ at: 'idle' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const busy = phase.at !== 'idle';

  const chosen = (): void => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    if (!title.trim()) setTitle(titleFromName(f.name));
    if (!kind && /^image\//.test(f.type)) setKind('FOTO');
    setMsg(null);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: t('noFile') });
    if (!kind) return setMsg({ ok: false, text: t('noKind') });
    if (f.size > MAX_FILE_BYTES) return setMsg({ ok: false, text: te('fileTooLarge') });
    const fd = new FormData();
    fd.set('file', f);
    fd.set('kind', kind);
    if (title.trim()) fd.set('title', title);
    if (component) fd.set('component', component);
    setMsg(null);
    setPhase({ at: 'sending', pct: 0 });
    const r = await send<Answer>(`/api/projects/${encodeURIComponent(projectId)}/allegati`, fd, (pct) => setPhase({ at: 'sending', pct }), () => setPhase({ at: 'checking' }));
    setPhase({ at: 'idle' });
    if (r.answer?.ok) {
      setMsg({ ok: true, text: t(r.answer.duplicate ? 'duplicate' : 'uploaded', { title: r.answer.attachment.title }) });
      if (fileRef.current) fileRef.current.value = '';
      setTitle(preset?.title ?? '');
      router.refresh();
      return;
    }
    const key = r.answer && !r.answer.ok ? r.answer.error : BY_STATUS[r.status] ?? 'unexpected';
    setMsg({ ok: false, text: te.has(key) ? te(key) : te('unexpected') });
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { void submit(e); }} aria-busy={busy} data-allegati="upload">
      {legend ? <p className="font-semibold">{legend}</p> : null}
      <div className="form-grid">
        <label className="field">
          <span>{t('file')}</span>
          <input ref={fileRef} id={`${id}-file`} className="input" type="file" name="file" required onChange={chosen} disabled={busy}
            accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif" aria-describedby={`${id}-file-hint`} />
          <span id={`${id}-file-hint`} className="hint">{t('fileHint')}</span>
        </label>
        <label className="field">
          <span>{t('kind')}</span>
          <select className="input" name="kind" required value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
            <option value="">{t('kindChoose')}</option>
            {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('component')}</span>
          <select className="input" name="component" value={component} onChange={(e) => setComponent(e.target.value)} disabled={busy}>
            <option value="">{t('componentNone')}</option>
            {components.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>{t('titleField')}</span>
          <input className="input" name="title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} disabled={busy} aria-describedby={`${id}-title-hint`} />
          <span id={`${id}-title-hint`} className="hint">{t('titleHint')}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>{t('upload')}</button>
        {phase.at === 'sending' ? (
          <span className="flex items-center gap-2" role="status">
            <progress value={phase.pct} max={100} aria-label={t('sending', { pct: phase.pct })} />
            <span className="note">{t('sending', { pct: phase.pct })}</span>
          </span>
        ) : phase.at === 'checking' ? <span className="note" role="status">{t('checking')}</span> : null}
        {msg ? <span className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
      </div>
    </form>
  );
}
