// The bill of Panev's brackets of a design (src/lib/catalog/panev.ts): every article with its count, size, catalogue
// page and list price, the indicative total, what the catalogue cannot take. No state: used by the one form, the saved
// design and the shaft designer.
import { useTranslations } from 'next-intl';
import { PANEV_LISTINO, panevBom } from '@/lib/catalog/panev';
import type { Layout } from '@/shaft';

/** `framed`: a panel of its own (false inside another panel). */
export default function PanevBom({ L, fmt, framed = true }: { L: Layout; fmt(x: number, dec?: number): string; framed?: boolean }) {
  const t = useTranslations('bom'), bom = panevBom(L);
  if (!bom.rows.length && !bom.missing) return null;
  const eur = (x: number): string => `${fmt(x, 2)} €`;
  return (
    <section className={framed ? 'panel panev-bom' : 'panev-bom'} aria-labelledby="panev-bom-h">
      <h2 id="panev-bom-h">{t('title')}</h2>
      <div className="table-scroll">
        <table className="data-table stack">
          <thead>
            <tr>
              <th scope="col">{t('code')}</th>
              <th scope="col">{t('part')}</th>
              <th scope="col" className="num">{t('qty')}</th>
              <th scope="col" className="num">{t('price')}</th>
              <th scope="col" className="num">{t('amount')}</th>
            </tr>
          </thead>
          <tbody>
            {bom.rows.map((r) => (
              <tr key={r.article.code}>
                <td className="row-title code">{r.article.code}</td>
                <td data-label={t('part')}>
                  <span>
                    {`${t(`k_${r.article.kind}`)} ${r.article.size} mm`}
                    <span className="note">{` · ${t('page', { page: r.article.page })}`}{r.cut ? ` · ${t('cut', { mm: r.cut })}` : ''}{r.drawing ? ` · ${t('drawing')}` : ''}</span>
                    {r.short ? <span className="note bad">{` · ${t('short')}`}</span> : null}
                  </span>
                </td>
                <td className="num" data-label={t('qty')}>{r.qty}</td>
                <td className="num" data-label={t('price')}>{r.article.price === null ? t('quote') : eur(r.article.price)}</td>
                <td className="num" data-label={t('amount')}>{r.article.price === null ? '—' : eur(r.article.price * r.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bom-total"><span>{t('total')}</span><strong className="num">{eur(bom.total)}</strong></p>
      {bom.missing ? <p className="alert alert-bad" role="status">{t('missing', { n: bom.missing })}</p> : null}
      <p className="note">{t('note', { year: PANEV_LISTINO.year, page: PANEV_LISTINO.page })}</p>
    </section>
  );
}
