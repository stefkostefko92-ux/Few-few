// The bill of Panev's brackets of a design (src/lib/catalog/panev.ts): every article with its count, size and catalogue
// page, what the catalogue cannot take; the company's prices (its list: Panev's start from the 2026 list) and the total
// only for whoever may see prices (`prices` null: none shown). A lift tested as a modification to UNI 10411 counts only
// the brackets of the parts its acceptance test replaces, as the project's cost and sheet 1 (prices/parts.ts
// panevCounted): nothing left, no panel. No state: used by the one form, the saved design and the shaft designer.
import { useLocale, useTranslations } from 'next-intl';
import { PANEV_LISTINO, panevBom } from '@/lib/catalog/panev';
import type { Collaudo } from '@/lib/lift/collaudo';
import { money } from '@/lib/money';
import { panevCounted } from '@/lib/prices/parts';
import type { Layout } from '@/shaft';

/** `framed`: a panel of its own (false inside another panel); `prices`: the company's [cents by key], null: none shown;
 *  `C`: the lift's acceptance test (none: a shaft design alone, every bracket). */
export default function PanevBom({ L, prices, framed = true, C = null }: {
  L: Layout; prices: Readonly<Record<string, number>> | null; framed?: boolean; C?: Collaudo | null;
}) {
  const t = useTranslations('bom'), locale = useLocale(), all = panevBom(L), bom = panevCounted(all, C);
  if (!bom.rows.length && !bom.missing) return null;
  // some rows left out: they belong to the parts that stay
  const kept = bom.rows.length < all.rows.length;
  const eur = (cents: number): string => money(cents, 'eur', locale);
  const priceOf = (code: string): number | null => prices?.[`panev:${code}`] ?? null;
  const total = bom.rows.reduce((s, r) => s + (priceOf(r.article.code) ?? 0) * r.qty, 0);
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
              {prices ? <th scope="col" className="num">{t('price')}</th> : null}
              {prices ? <th scope="col" className="num">{t('amount')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {bom.rows.map((r) => (
              <tr key={`${r.use}:${r.article.code}`}>
                <td className="row-title code">{r.article.code}</td>
                <td data-label={t('part')}>
                  <span>
                    {`${t(`k_${r.article.kind}`)} ${r.article.size} mm`}
                    <span className="note">{` · ${t('page', { page: r.article.page })}`}{r.cut ? ` · ${t('cut', { mm: r.cut })}` : ''}{r.drawing ? ` · ${t('drawing')}` : ''}</span>
                    {r.short ? <span className="note bad">{` · ${t('short')}`}</span> : null}
                  </span>
                </td>
                <td className="num" data-label={t('qty')}>{r.qty}</td>
                {prices ? <td className="num" data-label={t('price')}>{((c) => (c === null ? t('quote') : eur(c)))(priceOf(r.article.code))}</td> : null}
                {prices ? <td className="num" data-label={t('amount')}>{((c) => (c === null ? '—' : eur(c * r.qty)))(priceOf(r.article.code))}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {prices ? <p className="bom-total"><span>{t('total')}</span><strong className="num">{eur(total)}</strong></p> : null}
      {bom.missing ? <p className="alert alert-bad" role="status">{t('missing', { n: bom.missing })}</p> : null}
      {kept ? <p className="note">{t('kept')}</p> : null}
      <p className="note">{prices ? t('note', { year: PANEV_LISTINO.year, page: PANEV_LISTINO.page }) : t('noteQty')}</p>
    </section>
  );
}
