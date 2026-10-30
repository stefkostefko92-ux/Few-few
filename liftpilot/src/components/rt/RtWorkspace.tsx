'use client';

// The relazione tecnica di modifica of an installation while it is prepared (RT plan §7): cards 2–5 over one set of inputs
// (src/lib/rt/input.ts), kept as the RT's draft as they are typed (FormDraft scope 'rt', useDraft) and, when they read as
// the draft's schema keeps them, sent to the server for the live summary (rtPreviewAction, a second after the last
// change): the sections and why, the checks, what is missing, the expected documents. Files uploaded meanwhile join the
// relazione's list at its end; a file deleted leaves it. The server derives everything; nothing is computed here.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { AllegatoKind, Componente } from '@/lib/allegati/kinds';
import type { RtInputs } from '@/lib/rt/input';
import { rtPreviewAction } from '@/server/rt/actions';
import type { Conferma, RtSummary } from '@/server/rt/summary';
import type { Option } from '@/components/allegati/options';
import DraftBar from '@/components/draft/DraftBar';
import { useDraft, type DraftTarget } from '@/components/draft/useDraft';
import CardAllegati, { type FileRt } from './CardAllegati';
import CardFirme from './CardFirme';
import CardModifica from './CardModifica';
import CardSezioni, { type FormApi } from './CardSezioni';
import RtEsito from './RtEsito';
import { getAt, problemi, setAt } from './paths';

const PREVIEW_MS = 900;

export interface WorkspaceProps {
  projectId: string;
  initial: RtInputs;
  draftAt: string | null;
  revisione: { id: string; label: string } | null;
  summary: RtSummary;
  conferma: Conferma;
  files: FileRt[];
  canEdit: boolean;
  canIssue: boolean;
  upload: { kinds: Option<AllegatoKind>[]; components: Option<Componente>[] } | null;
  oggi: string;
  panel: ReactNode;
}

export default function RtWorkspace(p: WorkspaceProps) {
  const t = useTranslations('rt');
  const [inputs, setInputs] = useState<RtInputs>(p.initial);
  const [live, setLive] = useState<{ summary: RtSummary; conferma: Conferma }>({ summary: p.summary, conferma: p.conferma });
  // the server's summary again after a refresh (the registry saved, a file uploaded or deleted): it replaces the live one
  const [from, setFrom] = useState(p.summary);
  if (from !== p.summary) { setFrom(p.summary); setLive({ summary: p.summary, conferma: p.conferma }); }
  const [busy, setBusy] = useState(false);
  const errs = useMemo(() => problemi(inputs), [inputs]), valid = errs.size === 0;
  const target = useMemo<DraftTarget | null>(() => (p.canEdit ? { projectId: p.projectId, scope: 'rt', resumed: p.draftAt } : null), [p.canEdit, p.projectId, p.draftAt]);
  const draft = useDraft(target, p.revisione ? { inputs, revisionOf: p.revisione.id } : { inputs }, valid);

  // the files of the installation: one uploaded joins the list at its end, one deleted leaves the inputs
  const known = useRef(new Set(p.files.map((x) => x.id)));
  useEffect(() => {
    const ids = new Set(p.files.map((x) => x.id)), nuovi = p.files.filter((x) => !known.current.has(x.id)).map((x) => x.id);
    known.current = ids;
    if (!p.canEdit) return;
    setInputs((prev) => {
      const tenuti = (prev.allegati ?? []).filter((a) => ids.has(a.attachmentId)), next = [...tenuti, ...nuovi.map((id) => ({ attachmentId: id }))];
      const same = next.length === (prev.allegati ?? []).length && next.every((a, i) => a.attachmentId === prev.allegati?.[i]?.attachmentId);
      return same ? prev : setAt(prev, 'allegati', next.length ? next : undefined);
    });
  }, [p.files, p.canEdit]);

  // the live summary: the server's derivation of what is typed, a second after the last change
  const seq = useRef(0), first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!p.canEdit || !valid) return;
    const n = ++seq.current;
    const timer = setTimeout(() => {
      setBusy(true);
      rtPreviewAction({ projectId: p.projectId, inputs }).then((r) => {
        if (n !== seq.current) return;
        setBusy(false);
        if (r.ok) setLive({ summary: r.summary, conferma: r.conferma });
      }, () => { if (n === seq.current) setBusy(false); });
    }, PREVIEW_MS);
    return () => clearTimeout(timer);
  }, [inputs, valid, p.canEdit, p.projectId]);

  const set = useCallback((path: string, value: unknown) => setInputs((prev) => setAt(prev, path, value)), []);
  const f: FormApi = {
    inputs, get: (path) => getAt(inputs, path), set, errore: (path) => errs.has(path), readOnly: !p.canEdit,
    files: (inputs.allegati ?? []).flatMap((a, i) => { const x = p.files.find((y) => y.id === a.attachmentId); return x ? [{ id: x.id, label: t('allegati.opzione', { n: i + 1, titolo: x.title }) }] : []; }),
  };
  const s = live.summary;
  return (
    <div className="rt-work" data-rt="workspace">
      <div className="rt-bar">
        <nav className="seg-row rt-nav" aria-label={t('indice')}>
          <a href="#rt-anagrafica">1 · {t('card.anagraficaBreve')}</a><a href="#rt-modifica">2 · {t('card.modifica')}</a>
          <a href="#rt-sezioni">3 · {t('card.sezioniBreve')}</a><a href="#rt-allegati">4 · {t('card.allegati')}</a><a href="#rt-firme">5 · {t('card.firmeBreve')}</a>
        </nav>
        <span className="note rt-live" role="status" aria-live="polite">{!valid ? t('stato.nonValido', { n: errs.size }) : busy ? t('stato.aggiorno') : t('stato.aggiornato')}</span>
        {target ? <DraftBar target={target} draft={draft} /> : null}
      </div>
      <RtEsito summary={s} />
      <CardModifica summary={s} f={f} oggi={p.oggi} />
      <CardSezioni summary={s} f={f} />
      <CardAllegati summary={s} f={f} files={p.files} projectId={p.projectId} upload={p.upload} panel={p.panel} />
      <CardFirme summary={s} conferma={live.conferma} f={f} projectId={p.projectId} revisione={p.revisione} canIssue={p.canIssue}
        flush={draft.flush} stopDraft={draft.stop} />
    </div>
  );
}
