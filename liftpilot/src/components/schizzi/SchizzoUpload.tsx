'use client';

// A survey sketch uploaded from the panel (round 50): a photo, a scan or a PDF (an iPhone's HEIC becomes a JPEG on the
// server), sent as kind SCHIZZO for the target's part (vano | locale) through the installation's upload route — the
// same checks as every file (src/server/allegati/upload.ts). The same bytes already kept as another kind (a photo of the
// installation) come back as that file: the panel offers to make it a sketch (updateAttachmentAction, the kind and the
// part the only columns that may change). Round 52: the file and the title with their «?».
import { useId, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/progetto.json';
import { MAX_FILE_BYTES } from '@/lib/allegati/limits';
import type { Target } from '@/lib/schizzi/campi';
import { updateAttachmentAction } from '@/server/allegati/actions';
import { BY_STATUS, send, type UploadAnswer, type UploadPhase } from '../allegati/send';
import Campo from '../shaft/Campo';

type Caricato = { id: string; kind: string; title: string };

export default function SchizzoUpload({ projectId, target, onDone }: {
  projectId: string; target: Target;
  /** the sketch kept (or made a sketch): the list is read again with it selected */
  onDone(id: string): void;
}) {
  const t = useTranslations('schizzi'), te = useTranslations('errors'), tk = useTranslations('allegati'), id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<UploadPhase>({ at: 'idle' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [altro, setAltro] = useState<Caricato | null>(null);
  const [pending, start] = useTransition();
  const busy = phase.at !== 'idle' || pending;

  const submit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const f = fileRef.current?.files?.[0];
    if (!f) return setMsg({ ok: false, text: t('pannello.nessunFile') });
    if (f.size > MAX_FILE_BYTES) return setMsg({ ok: false, text: te('fileTooLarge') });
    const fd = new FormData();
    fd.set('file', f);
    fd.set('kind', 'SCHIZZO');
    fd.set('component', target);
    if (title.trim()) fd.set('title', title);
    setMsg(null);
    setAltro(null);
    setPhase({ at: 'sending', pct: 0 });
    const r = await send<UploadAnswer<Caricato>>(`/api/projects/${encodeURIComponent(projectId)}/allegati`, fd, (pct) => setPhase({ at: 'sending', pct }),
      () => setPhase({ at: 'checking' }));
    setPhase({ at: 'idle' });
    if (r.answer?.ok) {
      const a = r.answer.attachment;
      if (fileRef.current) fileRef.current.value = '';
      setTitle('');
      if (r.answer.duplicate && a.kind !== 'SCHIZZO') {
        setAltro(a);
        setMsg({ ok: true, text: t('pannello.giaAltro', { kind: tk.has(`kinds.${a.kind}`) ? tk(`kinds.${a.kind}`) : a.kind, title: a.title }) });
        return;
      }
      setMsg({ ok: true, text: t(r.answer.duplicate ? 'pannello.giaSchizzo' : 'pannello.caricato', { title: a.title }) });
      onDone(a.id);
      return;
    }
    const key = r.answer && !r.answer.ok ? r.answer.error : BY_STATUS[r.status] ?? 'unexpected';
    setMsg({ ok: false, text: te.has(key) ? te(key) : te('unexpected') });
  };

  // the file kept as another kind made a sketch of this part
  const comeSchizzo = (a: Caricato): void => start(async () => {
    const r = await updateAttachmentAction({ id: a.id, kind: 'SCHIZZO', title: a.title, component: target });
    if (!r.ok) return setMsg({ ok: false, text: te.has(r.error) ? te(r.error) : te('unexpected') });
    setAltro(null);
    setMsg({ ok: true, text: t('pannello.diventato', { title: a.title }) });
    onDone(a.id);
  });

  return (
    <form className="schizzo-upload" onSubmit={(e) => { void submit(e); }} aria-busy={busy} data-schizzi="upload">
      <Campo id={`${id}-file`} nome={t('pannello.file')} aiuto={testoAiuto(AIUTO, 'sk_file')}>
        <input ref={fileRef} id={`${id}-file`} className="input" type="file" name="file" disabled={busy} aria-describedby={`${id}-hint`}
          accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.heic,.heif,.pdf" />
        <span id={`${id}-hint`} className="hint">{t('pannello.fileHint')}</span>
      </Campo>
      <Campo id={`${id}-title`} nome={t('pannello.titoloCampo')} aiuto={testoAiuto(AIUTO, 'sk_title')}>
        <input id={`${id}-title`} className="input" name="title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn" disabled={busy}>{t('pannello.invia')}</button>
        {phase.at === 'sending' ? (
          <span className="flex items-center gap-2" role="status">
            <progress value={phase.pct} max={100} aria-label={t('pannello.invio', { pct: phase.pct })} />
            <span className="note">{t('pannello.invio', { pct: phase.pct })}</span>
          </span>
        ) : phase.at === 'checking' ? <span className="note" role="status">{t('pannello.controllo')}</span> : null}
        {msg ? <span className={`note${msg.ok ? '' : ' bad'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</span> : null}
        {altro ? <button type="button" className="btn btn-sm" onClick={() => comeSchizzo(altro)} disabled={busy}>{t('pannello.usaComeSchizzo')}</button> : null}
      </div>
    </form>
  );
}
