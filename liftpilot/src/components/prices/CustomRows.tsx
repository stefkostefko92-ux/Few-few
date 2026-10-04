'use client';

// The company's free lines (voci a stesura libera) inside the price list's form: the owner writes the words and the
// price, how each project counts the quantity (once, by the stop, by the metre of travel) and which projects take the
// line, adds and removes lines; the Commerciale reads them. Every line is sent in its order with how many there are (the
// search does not hide them: a line not sent would be deleted); a line left empty is dropped when saved.
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CUSTOM_MAX, PRICE_BASES, PRICE_SCOPES, type PriceBasisName, type PriceScopeName, type PriceUnit } from '@/lib/prices/groups';

export interface CustomRow {
  text: string;
  price: string;
  basis: PriceBasisName;
  scope: PriceScopeName;
}

/** The unit a free line's price is for, by its basis. */
const UNIT: Record<PriceBasisName, PriceUnit> = { LOT: 'lot', STOP: 'stop', TRAVEL: 'm' };

const isBasis = (x: string): x is PriceBasisName => (PRICE_BASES as readonly string[]).includes(x);
const isScope = (x: string): x is PriceScopeName => (PRICE_SCOPES as readonly string[]).includes(x);

export default function CustomRows({ rows, editable, bad }: { rows: CustomRow[]; editable: boolean; bad: ReadonlySet<string> }) {
  const t = useTranslations('prices');
  const [list, setList] = useState(() => rows.map((r, k) => ({ ...r, k })));
  const [next, setNext] = useState(rows.length);
  const set = (k: number, patch: Partial<CustomRow>): void => setList(list.map((r) => (r.k === k ? { ...r, ...patch } : r)));
  const add = (): void => {
    setList([...list, { k: next, text: '', price: '', basis: 'LOT', scope: 'ALL' }]);
    setNext(next + 1);
  };
  return (
    <section className="panel" aria-labelledby="pg-free">
      <h2 id="pg-free">{t('freeTitle')} <span className="note">{t('freeCount', { n: list.filter((r) => r.text.trim()).length })}</span></h2>
      <p className="note">{t(editable ? 'freeLead' : 'freeLeadView')}</p>
      {list.length ? (
        <div className="table-scroll">
          <table className="data-table stack free-lines">
            <thead>
              <tr>
                <th scope="col">{t('freeText')}</th><th scope="col" className="num">{t('price')}</th><th scope="col">{t('freeBasis')}</th><th scope="col">{t('freeScope')}</th>
                {editable ? <th scope="col"><span className="sr-only">{t('freeActions')}</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => {
                const per = t(`perUnit.${UNIT[r.basis]}`), wrong = bad.has(`c:${i}`) || undefined, name = r.text.trim() || t('freeRow', { n: i + 1 });
                return editable ? (
                  <tr key={r.k}>
                    <td className="row-title">
                      <input className="input" name={`c:${i}:text`} value={r.text} maxLength={120} autoComplete="off" onChange={(e) => set(r.k, { text: e.target.value })}
                        placeholder={t('freePlaceholder')} aria-label={`${t('freeText')} — ${t('freeRow', { n: i + 1 })}`} aria-invalid={wrong} />
                    </td>
                    <td className="num" data-label={t('price')}>
                      <span className="price-cell">
                        <input className="input num" name={`c:${i}:price`} value={r.price} inputMode="decimal" maxLength={16} autoComplete="off"
                          onChange={(e) => set(r.k, { price: e.target.value })} aria-label={`${name} (${per})`} aria-invalid={wrong} />
                        <span className="note">{per}</span>
                      </span>
                    </td>
                    <td data-label={t('freeBasis')}>
                      <select className="input" name={`c:${i}:basis`} value={r.basis} aria-label={`${t('freeBasis')} — ${name}`}
                        onChange={(e) => { if (isBasis(e.target.value)) set(r.k, { basis: e.target.value }); }}>
                        {PRICE_BASES.map((b) => <option key={b} value={b}>{t(`bases.${b}`)}</option>)}
                      </select>
                    </td>
                    <td data-label={t('freeScope')}>
                      <select className="input" name={`c:${i}:scope`} value={r.scope} aria-label={`${t('freeScope')} — ${name}`}
                        onChange={(e) => { if (isScope(e.target.value)) set(r.k, { scope: e.target.value }); }}>
                        {PRICE_SCOPES.map((s) => <option key={s} value={s}>{t(`scopes.${s}`)}</option>)}
                      </select>
                    </td>
                    <td className="act" data-label={t('freeActions')}>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => setList(list.filter((x) => x.k !== r.k))} aria-label={t('freeRemoveRow', { name })}>
                        {t('freeRemove')}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.k}>
                    <td className="row-title">{r.text}</td>
                    <td className="num" data-label={t('price')}>{r.price ? `${r.price} ${per}` : '—'}</td>
                    <td data-label={t('freeBasis')}>{t(`bases.${r.basis}`)}</td>
                    <td data-label={t('freeScope')}>{t(`scopes.${r.scope}`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="note">{t('freeNone')}</p>}
      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="c:count" value={list.length} />
          <button type="button" className="btn btn-sm" onClick={add} disabled={list.length >= CUSTOM_MAX}>{t('freeAdd')}</button>
          {list.length >= CUSTOM_MAX ? <span className="note">{t('freeMax', { n: CUSTOM_MAX })}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
