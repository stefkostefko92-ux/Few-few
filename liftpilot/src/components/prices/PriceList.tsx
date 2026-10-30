'use client';

import { startTransition, useActionState, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PRICE_GROUPS, type PriceGroup, type PriceUnit } from '@/lib/prices/groups';
import { savePricesAction } from '@/server/price-actions';
import { initialFormState } from '@/server/form';
import { testoAiuto } from '@/lib/aiuto';
import AIUTO from '../../../messages/aiuto/azienda.json';
import Aiuto from '../aiuto/Aiuto';
import CustomRows, { type CustomRow } from './CustomRows';

/** An article of the list as the page sends it: what it is, its unit, where its price starts from, whether the company
 *  set its own. */
export interface PriceRow {
  key: string;
  group: PriceGroup;
  item: string;
  name?: string;
  unit: PriceUnit;
  src: string | null;
  own: boolean;
}

// The company's price list by group, with a search, and its free lines; whoever may edit the prices edits every one in
// place (the search only hides articles: a hidden row is not sent and keeps its price), whoever may only see them reads it.
// The search and each column's head have their «?» (round 52).
export default function PriceList({ rows, values, custom, editable }: { rows: PriceRow[]; values: Record<string, string>; custom: CustomRow[]; editable: boolean }) {
  const t = useTranslations('prices'), te = useTranslations('errors'), locale = useLocale();
  const [state, action, pending] = useActionState(savePricesAction, initialFormState);
  const [v, setV] = useState(values), [q, setQ] = useState('');
  const bad = new Set(state.error === 'invalidPrices' ? state.fields ?? [] : []);
  const label = (r: PriceRow): string => t(`items.${r.item}`, { name: r.name ?? '' });
  const find = q.trim().toLowerCase();
  const shown = find ? rows.filter((r) => label(r).toLowerCase().includes(find)) : rows;
  const save = editable ? <button type="submit" className="btn btn-primary" disabled={pending}>{t('save')}</button> : null;
  // a column's head with its «?»: the explanation shows on the name or on the «?»
  const head = (name: string, testo: string | null) => (testo ? <span className="lbl">{name}<Aiuto testo={testo} nome={name} /></span> : name);
  const cerca = testoAiuto(AIUTO, 'listino.cerca');
  // sent by hand: after its own form action React resets the form, which puts every select back to the option it was
  // first drawn with (a free line's basis and projects) while the state keeps the chosen one; without JavaScript the
  // action still posts the form
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
  return (
    <form action={action} onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {/* the row holds the search's «?» explanation, which opens under the search from its left edge */}
      <div className="relative flex flex-wrap items-center gap-3">
        <input type="search" className="input w-auto grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('filter')} aria-label={t('filter')} />
        {cerca ? <Aiuto testo={cerca} nome={t('filter')} /> : null}
        {save}
      </div>
      {state.ok ? <p className="alert alert-ok" role="status">{t('saved', { n: Number(state.message ?? 0) })}</p> : null}
      {state.error ? <p className="alert alert-bad" role="alert">{state.error === 'invalidPrices' ? t('invalid', { n: bad.size }) : te(state.error)}</p> : null}
      {PRICE_GROUPS.map((g) => {
        const rs = shown.filter((r) => r.group === g);
        if (!rs.length) return null;
        return (
          <section key={g} className="panel" aria-labelledby={`pg-${g}`}>
            <h2 id={`pg-${g}`}>{t(`groups.${g}`)} <span className="note">{t('priced', { n: rs.filter((r) => v[r.key]).length, of: rs.length })}</span></h2>
            <div className="table-scroll">
              <table className="data-table stack">
                <thead>
                  <tr>
                    <th scope="col">{head(t('article'), testoAiuto(AIUTO, 'listino.articolo'))}</th>
                    <th scope="col" className="num">{head(t('price'), testoAiuto(AIUTO, 'listino.prezzo'))}</th>
                    <th scope="col">{head(t('source'), testoAiuto(AIUTO, 'listino.origine'))}</th>
                  </tr>
                </thead>
                <tbody>
                  {rs.map((r) => (
                    <tr key={r.key}>
                      <td className="row-title">{label(r)}</td>
                      <td className="num" data-label={`${t('price')} (${t(`perUnit.${r.unit}`)})`}>
                        {editable ? (
                          <span className="price-cell">
                            <input className="input num" name={`p:${r.key}`} value={v[r.key] ?? ''} inputMode="decimal" maxLength={16} autoComplete="off"
                              onChange={(e) => setV({ ...v, [r.key]: e.target.value })} aria-label={`${label(r)} (${t(`perUnit.${r.unit}`)})`} aria-invalid={bad.has(r.key) || undefined} />
                            <span className="note">{t(`perUnit.${r.unit}`)}</span>
                          </span>
                        ) : v[r.key] ? `${v[r.key]} ${t(`perUnit.${r.unit}`)}` : '—'}
                      </td>
                      <td data-label={t('source')}><span className="note">{r.own ? t('srcOwn') : r.src ? t('srcStart', { src: r.src }) : '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {shown.length ? null : <p className="note">{t('none')}</p>}
      <CustomRows rows={custom} editable={editable} bad={bad} />
      {save ? <div>{save}</div> : null}
    </form>
  );
}
