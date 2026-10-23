'use client';

// The survey sketch beside a form (round 50): on /progetto the shaft's ('vano'), on the machine room's survey the
// room's ('locale'). The installation's sketches — the target's first, then the others with the part they were drawn
// for —, one shown (SchizzoAnteprima), a new one uploaded (SchizzoUpload, for whoever edits the installation's data);
// with the reading on (Vertex AI configured on the server) and the right to draw, «Leggi lo schizzo» proposes the
// measures (LetturaSchizzo), which go into the form only once confirmed; without it, the measures are typed looking at
// the sketch. The list is read again after an upload (GET /api/projects/<id>/schizzi).
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { romeDate } from '@/lib/dates';
import type { Target } from '@/lib/schizzi/campi';
import type { SchizzoView } from '@/server/schizzi/queries';
import SectionTitle from '@/components/project/SectionTitle';
import type { Modulo } from './ConfermaValori';
import LetturaSchizzo from './LetturaSchizzo';
import SchizzoAnteprima from './SchizzoAnteprima';
import SchizzoUpload from './SchizzoUpload';

/** What the page gives the panel: the sketches as the server listed them and what this user may do. */
export interface SchizziStart {
  projectId: string;
  initial: SchizzoView[];
  /** the reading is configured on the server (src/server/schizzi/config.ts) */
  aiEnabled: boolean;
  /** 'projects:edit': upload a sketch */
  canUpload: boolean;
  /** 'progetto:edit': read a sketch automatically */
  canRead: boolean;
}

const isView = (x: unknown): x is SchizzoView => !!x && typeof x === 'object' && 'id' in x && typeof x.id === 'string' && 'title' in x && typeof x.title === 'string'
  && 'mime' in x && typeof x.mime === 'string' && 'pages' in x && typeof x.pages === 'number' && 'createdAt' in x && typeof x.createdAt === 'string';

export default function SchizzoPanel({ start, target, modulo, open = true }: { start: SchizziStart; target: Target; modulo: Modulo; open?: boolean }) {
  const t = useTranslations('schizzi');
  const [list, setList] = useState<SchizzoView[]>(start.initial);
  const ordered = useMemo(() => [...list.filter((s) => s.component === target), ...list.filter((s) => s.component !== target)], [list, target]);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = ordered.find((s) => s.id === chosen) ?? ordered[0] ?? null;
  const [uploadOpen, setUploadOpen] = useState(start.initial.length === 0);

  const reload = async (select: string): Promise<void> => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(start.projectId)}/schizzi`, { cache: 'no-store' });
      const body: unknown = res.ok ? await res.json() : null;
      if (body && typeof body === 'object' && 'schizzi' in body && Array.isArray(body.schizzi)) setList(body.schizzi.filter(isView));
    } catch {
      // the list stays as it was; the next page load shows the new sketch
    }
    setChosen(select);
  };
  const part = (s: SchizzoView): string | null => (s.component === target ? null : s.component === 'vano' || s.component === 'locale' ? t(`target.${s.component}`) : t('pannello.altro'));
  const quando = selected ? romeDate(new Date(selected.createdAt)) : '';

  return (
    <details className="panel schizzo-panel" open={open || undefined} data-schizzi={target}>
      <summary><SectionTitle icon="file-image">{t('pannello.titolo')}</SectionTitle></summary>
      <div className="schizzo-body">
        <p className="note">{t(`pannello.lead_${target}`)}</p>
        {ordered.length ? (
          <ul className="schizzo-list" aria-label={t('pannello.elenco')}>
            {ordered.map((s) => (
              <li key={s.id}>
                <button type="button" className={s.id === selected?.id ? 'on' : undefined} aria-pressed={s.id === selected?.id} onClick={() => setChosen(s.id)}>
                  <span className="schizzo-title">{s.title}</span>
                  <span className="note">{t('pannello.caricatoIl', { date: romeDate(new Date(s.createdAt)) })}{part(s) ? ` · ${part(s)}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="note">{t('pannello.nessuno')}</p>}
        {start.canUpload ? (
          <details className="schizzo-carica" open={uploadOpen || undefined} onToggle={(e) => setUploadOpen(e.currentTarget.open)}>
            <summary>{t('pannello.carica')}</summary>
            <SchizzoUpload projectId={start.projectId} target={target} onDone={(id) => void reload(id)} />
          </details>
        ) : <p className="note">{t('pannello.nonCarica')}</p>}
        {selected ? <SchizzoAnteprima key={selected.id} schizzo={selected} /> : null}
        {selected && start.aiEnabled && start.canRead
          ? <LetturaSchizzo key={selected.id} projectId={start.projectId} schizzo={selected} target={target} modulo={modulo} quando={quando} />
          : selected && !start.aiEnabled ? <p className="note schizzo-off">{t('pannello.aiOff')}</p> : null}
      </div>
    </details>
  );
}
