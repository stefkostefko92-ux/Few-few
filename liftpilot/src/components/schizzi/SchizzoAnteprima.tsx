'use client';

// A sketch shown beside the form (round 50): the preview the server draws again (GET /api/allegati/<id>/anteprima — a
// picture turned upright and at most 1600 px, a PDF's page as a PNG; never the uploaded bytes), fitted to the panel or
// at its own size to read the small figures (scrolled inside the frame), a PDF's first four pages one at a time.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SchizzoView } from '@/server/schizzi/queries';

/** The pages of a PDF sketch shown and read (the server's SCHIZZO_PAGINE, src/lib/report/image-tool.ts). */
const PAGINE = 4;

export default function SchizzoAnteprima({ schizzo }: { schizzo: SchizzoView }) {
  const t = useTranslations('schizzi');
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
  const [broken, setBroken] = useState(false);
  const pdf = schizzo.mime === 'application/pdf', pages = pdf ? Math.max(1, Math.min(schizzo.pages, PAGINE)) : 1;
  const src = `/api/allegati/${encodeURIComponent(schizzo.id)}/anteprima${pdf ? `?pagina=${page}` : ''}`;
  const alt = pdf ? t('pannello.altPagina', { title: schizzo.title, page, pages: schizzo.pages }) : t('pannello.alt', { title: schizzo.title });
  return (
    <figure className="schizzo-anteprima">
      <div className="schizzo-tools">
        {pages > 1 ? (
          <label className="field inline">
            <span>{t('pannello.pagina')}</span>
            <select className="input" value={page} onChange={(e) => { setPage(Number(e.target.value)); setBroken(false); }}>
              {Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        ) : null}
        <div className="seg-row" role="group" aria-label={t('pannello.zoom')}>
          {(['fit', 'full'] as const).map((z) => (
            <button key={z} type="button" className={zoom === z ? 'on' : undefined} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {t(z === 'fit' ? 'pannello.adatta' : 'pannello.intera')}
            </button>
          ))}
        </div>
      </div>
      <div className={`schizzo-view ${zoom}`} tabIndex={zoom === 'full' ? 0 : undefined}>
        {broken ? <p className="note bad" role="alert">{t('pannello.anteprimaErrore')}</p> : (
          // eslint-disable-next-line @next/next/no-img-element -- a picture our server draws again for this file, never optimised by Next
          <img key={src} src={src} alt={alt} decoding="async" onError={() => setBroken(true)} />
        )}
      </div>
      {pdf && schizzo.pages > PAGINE ? <figcaption className="note">{t('pannello.pagineOltre', { n: PAGINE, pages: schizzo.pages })}</figcaption> : null}
    </figure>
  );
}
