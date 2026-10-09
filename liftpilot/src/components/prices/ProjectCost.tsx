import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import type { Parte } from '@/lib/lift/collaudo';
import { money } from '@/lib/money';
import type { Cost } from '@/lib/prices/cost';
import { makeFmt } from '@/lib/present/tr';

// What a project's articles cost with the company's prices (VAT excluded): every line with its quantity, price and
// amount, the company's free lines counted by their basis, the total of the priced ones and how many have none; the
// free lines a replacement cannot count (by the stop); the parts a machine replacement's acceptance test names replaced
// that it cannot count without the lift's design (`uncounted`: bom.ts calcUncounted); which scope it counts (a new lift,
// a modification tested to UNI 10411 with its replaced parts only, a machine replacement). Only on the pages of those
// who see prices.
export default async function ProjectCost({ cost, skipped = [], uncounted = [], locale, scope, editable }: {
  cost: Cost; skipped?: readonly string[]; uncounted?: readonly Parte[]; locale: string; scope: 'design' | 'modification' | 'calc'; editable: boolean;
}) {
  const t = await getTranslations('prices'), tl = await getTranslations('lift'), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const eur = (c: number | null): string => (c === null ? '—' : money(c, 'eur', locale));
  return (
    <section className="panel" aria-labelledby="project-cost-h">
      <h2 id="project-cost-h">{t('costTitle')}</h2>
      <div className="table-scroll">
        <table className="data-table stack">
          <thead>
            <tr><th scope="col">{t('article')}</th><th scope="col" className="num">{t('qty')}</th><th scope="col" className="num">{t('unitPrice')}</th><th scope="col" className="num">{t('amount')}</th></tr>
          </thead>
          <tbody>
            {cost.lines.map((l, i) => (
              <tr key={`${l.key ?? 'none'}-${i}`}>
                <td className="row-title">{t(`items.${l.label.item}`, { name: l.label.name ?? '', ...l.label.args })}</td>
                <td className="num" data-label={t('qty')}>{l.unit === 'lot' ? t('unit.lot') : l.unit === 'stop' ? t('unit.stop', { n: l.qty }) : `${fmt(l.qty, l.unit === 'm' ? 1 : 0)} ${t(`unit.${l.unit}`)}`}</td>
                <td className="num" data-label={t('unitPrice')}>{l.key === null ? t('notListed') : eur(l.unitCents)}</td>
                <td className="num" data-label={t('amount')}>{eur(l.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="bom-total"><span>{cost.missing ? t('totalPartial') : t('total')}</span><strong className="num">{eur(cost.total)}</strong></p>
      {cost.missing ? (
        <p className="alert alert-warn" role="status">{t('missing', { n: cost.missing })}{editable ? <>{' '}<Link href="/app/prices">{t('toList')}</Link></> : null}</p>
      ) : null}
      {uncounted.length ? <p className="alert alert-warn" role="status">{t('uncounted', { list: uncounted.map((p) => tl(`parte_${p}`)).join(', ') })}</p> : null}
      {skipped.length ? <p className="note">{t('skipped', { list: skipped.join('; ') })}</p> : null}
      <p className="note">{t(scope === 'design' ? 'costNoteDesign' : scope === 'modification' ? 'costNoteModification' : 'costNoteCalc')}</p>
    </section>
  );
}
